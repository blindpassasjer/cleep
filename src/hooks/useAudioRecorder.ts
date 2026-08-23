import { useRef, useState } from 'react';
import { computeWaveformPeaksFromBlob } from '../lib/waveform';

const LEVEL_HISTORY = 100;
const LEVEL_INTERVAL_MS = 60;

export interface RecordingResult {
  blob: Blob;
  peaks: number[];
}

/**
 * Shared microphone-capture engine behind both the in-note recorder (AttachmentsPanel) and the
 * standalone Recordings quick-capture flow (QuickRecorder) -- one implementation so both actually
 * benefit from the same fidelity/UX work instead of drifting apart.
 */
export function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const pausedMsRef = useRef(0);

  function sampleLevel() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (const v of data) {
      const centered = (v - 128) / 128;
      sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    setLevels((prev) => [...prev, Math.min(1, rms * 4)].slice(-LEVEL_HISTORY));
  }

  function cleanup() {
    if (levelTimerRef.current) clearInterval(levelTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    levelTimerRef.current = null;
    elapsedTimerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        window.isSecureContext
          ? 'Audio recording is not supported in this browser.'
          : 'Audio recording requires HTTPS (the browser blocks microphone access on a plain http:// connection, except at localhost). Set up a reverse proxy with TLS in front of Cleep to enable it.',
      );
      return;
    }
    try {
      // Plain getUserMedia({ audio: true }) defaults these to *on*, since browsers built them for
      // voice calls -- fine for speech, actively harmful for music: noise suppression eats
      // sustain/reverb tails as "noise", auto-gain constantly repumps the level as you play, echo
      // cancellation smears transients. Explicitly disabling them captures what's actually there.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      recorder.start();

      setLevels([]);
      setElapsedMs(0);
      setPaused(false);
      startedAtRef.current = Date.now();
      pausedMsRef.current = 0;
      levelTimerRef.current = setInterval(sampleLevel, LEVEL_INTERVAL_MS);
      elapsedTimerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current - pausedMsRef.current);
      }, 200);
      setRecording(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError("Microphone access was denied. Check this site's microphone permission in your browser settings.");
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setError('No microphone was found on this device.');
      } else {
        setError('Could not access the microphone.');
      }
    }
  }

  function pause() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.pause();
    if (levelTimerRef.current) clearInterval(levelTimerRef.current);
    // Stashed on the recorder itself (rather than a ref) so pause/resume pairs stay correct even
    // if this hook re-renders in between -- resume() reads it back to add the paused span to the
    // running total that's subtracted from elapsed time.
    (recorder as MediaRecorder & { __pausedAt?: number }).__pausedAt = Date.now();
    setPaused(true);
  }

  function resume() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    const pausedAt = (recorder as MediaRecorder & { __pausedAt?: number }).__pausedAt;
    if (pausedAt) pausedMsRef.current += Date.now() - pausedAt;
    recorder.resume();
    levelTimerRef.current = setInterval(sampleLevel, LEVEL_INTERVAL_MS);
    setPaused(false);
  }

  function stop(): Promise<RecordingResult | null> {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }
      recorder.onstop = async () => {
        cleanup();
        setRecording(false);
        setPaused(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size === 0) {
          resolve(null);
          return;
        }
        const peaks = await computeWaveformPeaksFromBlob(blob).catch(() => []);
        resolve({ blob, peaks });
      };
      recorder.stop();
    });
  }

  function cancel() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanup();
    setRecording(false);
    setPaused(false);
    setLevels([]);
    setElapsedMs(0);
  }

  return { recording, paused, elapsedMs, levels, error, start, pause, resume, stop, cancel };
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { IconPause, IconPlay } from './Icons';
import { computeWaveformPeaksFromBlob, downsampleBars } from '../lib/waveform';

interface Props {
  src: string;
  waveformPeaks: number[] | null;
  ariaLabel?: string;
}

export function WaveformPlayer({ src, waveformPeaks, ariaLabel }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [barCount, setBarCount] = useState(48);
  const [fallbackPeaks, setFallbackPeaks] = useState<number[] | null>(null);

  const peaks = waveformPeaks ?? fallbackPeaks;

  // Older attachments (recorded before this feature, or if the client failed to compute peaks at
  // record time) have no stored waveform -- fetch and decode the audio once, client-side, so the
  // bars still show instead of falling back to a flat line permanently.
  useEffect(() => {
    if (waveformPeaks || fallbackPeaks) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(src, { credentials: 'same-origin' });
        const blob = await res.blob();
        const computed = await computeWaveformPeaksFromBlob(blob);
        if (!cancelled) setFallbackPeaks(computed);
      } catch {
        // Leave peaks null; the bars just render as a flat placeholder.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, waveformPeaks, fallbackPeaks]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setBarCount(Math.max(16, Math.min(100, Math.floor(width / 4))));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const displayBars = useMemo(() => downsampleBars(peaks ?? [], barCount), [peaks, barCount]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play();
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const el = containerRef.current;
    const audio = audioRef.current;
    if (!el || !audio || !Number.isFinite(audio.duration)) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  }

  return (
    <div className="waveform-player">
      <button type="button" className="waveform-play-btn" title={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
        {playing ? <IconPause width={16} height={16} /> : <IconPlay width={16} height={16} />}
      </button>
      <div
        className="waveform-progress"
        ref={containerRef}
        onClick={handleSeek}
        onMouseMove={(e) => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          setHoverRatio(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
        }}
        onMouseLeave={() => setHoverRatio(null)}
        aria-label={ariaLabel ?? 'Audio progress'}
      >
        <div className="waveform-progress__bars">
          {displayBars.map((height, i) => {
            const barRatio = i / displayBars.length;
            const isPlayed = barRatio <= progress;
            const isHovered = hoverRatio !== null && barRatio > progress && barRatio <= hoverRatio;
            return (
              <span
                key={i}
                className={`waveform-progress__bar${isPlayed ? ' waveform-progress__bar--played' : isHovered ? ' waveform-progress__bar--hover' : ''}`}
                style={{ height: `${Math.round(height * 100)}%` }}
              />
            );
          })}
        </div>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        hidden
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(e) => {
          const audio = e.currentTarget;
          if (audio.duration) setProgress(audio.currentTime / audio.duration);
        }}
      />
    </div>
  );
}

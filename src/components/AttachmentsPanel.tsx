import { useEffect, useRef, useState } from 'react';
import { IconClose, IconImage, IconMic, IconPlus, IconStop } from './Icons';
import { ImageLightbox } from './ImageLightbox';
import { WaveformPlayer } from './WaveformPlayer';
import { computeWaveformPeaksFromBlob } from '../lib/waveform';
import type { Attachment } from '../types';

interface Props {
  attachments: Attachment[];
  onUpload: (file: File | Blob, filename?: string, waveformPeaks?: number[]) => Promise<void>;
  onDelete: (attachmentId: string) => void;
  /** Opens the file picker as soon as this instance mounts (used by the composer's collapsed-row image icon). */
  autoOpenFilePicker?: boolean;
  /** Starts recording as soon as this instance mounts (used by the composer's collapsed-row mic icon). */
  autoStartRecording?: boolean;
  /** Rendered inline in the same toolbar row as the image/mic buttons (the text formatting toolbar). */
  children?: React.ReactNode;
  /** Drops a ![alt](url) reference for this image into the note text -- lets an already-uploaded photo/GIF be placed inline instead of only living in the gallery below. */
  onInsertImage?: (attachment: Attachment) => void;
}

export function AttachmentsPanel({
  attachments,
  onUpload,
  onDelete,
  autoOpenFilePicker,
  autoStartRecording,
  children,
  onInsertImage,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<Attachment | null>(null);

  useEffect(() => {
    if (autoOpenFilePicker) fileInputRef.current?.click();
    if (autoStartRecording) startRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount only, not on every prop change
  }, []);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await onUpload(file, file.name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function startRecording() {
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setUploading(true);
        try {
          const peaks = await computeWaveformPeaksFromBlob(blob).catch(() => undefined);
          await onUpload(blob, `recording-${Date.now()}.webm`, peaks);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Upload failed.');
        } finally {
          setUploading(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
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

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  const images = attachments.filter((a) => a.kind === 'image');
  const videos = attachments.filter((a) => a.kind === 'video');
  const audios = attachments.filter((a) => a.kind === 'audio');

  return (
    <div className="attachments-panel">
      {images.length > 0 && (
        <div className="attachment-grid">
          {images.map((a) => (
            <div key={a.id} className="attachment-thumb">
              <img src={a.url} alt={a.name} onClick={() => setViewingImage(a)} />
              {onInsertImage && (
                <button type="button" className="attachment-insert" title="Insert into note text" onClick={() => onInsertImage(a)}>
                  <IconPlus width={14} height={14} />
                </button>
              )}
              <button type="button" className="attachment-remove" title="Remove" onClick={() => onDelete(a.id)}>
                <IconClose width={14} height={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {viewingImage && <ImageLightbox src={viewingImage.url} alt={viewingImage.name} onClose={() => setViewingImage(null)} />}

      {videos.map((a) => (
        <div key={a.id} className="attachment-media-row">
          <video src={a.url} controls />
          <button type="button" className="attachment-remove" title="Remove" onClick={() => onDelete(a.id)}>
            <IconClose width={14} height={14} />
          </button>
        </div>
      ))}

      {audios.map((a) => (
        <div key={a.id} className="attachment-media-row">
          <WaveformPlayer src={a.url} waveformPeaks={a.waveformPeaks} ariaLabel={a.name} />
          <button type="button" className="attachment-remove" title="Remove" onClick={() => onDelete(a.id)}>
            <IconClose width={14} height={14} />
          </button>
        </div>
      ))}

      <div className="attachments-toolbar">
        {children}
        <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
        <button
          type="button"
          title="Add photo or video"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || recording}
        >
          <IconImage />
        </button>
        {recording ? (
          <button type="button" title="Stop recording" className="recording" onClick={stopRecording}>
            <IconStop />
          </button>
        ) : (
          <button type="button" title="Record audio" onClick={startRecording} disabled={uploading}>
            <IconMic />
          </button>
        )}
        {uploading && <span className="attachments-uploading">Uploading…</span>}
      </div>
      {error && <div className="composer-error">{error}</div>}
    </div>
  );
}

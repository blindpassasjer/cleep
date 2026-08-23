import { useEffect, useRef, useState } from 'react';
import { IconClose, IconImage, IconMic, IconPause, IconPlay, IconPlus, IconStop } from './Icons';
import { ImageLightbox } from './ImageLightbox';
import { WaveformPlayer } from './WaveformPlayer';
import { LiveWaveform } from './LiveWaveform';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { formatElapsed } from '../lib/formatElapsed';
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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<Attachment | null>(null);
  const recorder = useAudioRecorder();

  useEffect(() => {
    if (autoOpenFilePicker) fileInputRef.current?.click();
    if (autoStartRecording) recorder.start();
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

  async function stopAndUpload() {
    const result = await recorder.stop();
    if (!result) return;
    setUploading(true);
    setError(null);
    try {
      await onUpload(result.blob, `recording-${Date.now()}.webm`, result.peaks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
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

      {recorder.recording && (
        <div className="attachment-live-recording">
          <LiveWaveform levels={recorder.levels} paused={recorder.paused} />
          <span className="attachment-live-timer">{formatElapsed(recorder.elapsedMs)}</span>
          <button
            type="button"
            title={recorder.paused ? 'Resume' : 'Pause'}
            onClick={() => (recorder.paused ? recorder.resume() : recorder.pause())}
          >
            {recorder.paused ? <IconPlay width={16} height={16} /> : <IconPause width={16} height={16} />}
          </button>
        </div>
      )}

      <div className="attachments-toolbar">
        {children}
        <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
        <button
          type="button"
          title="Add photo or video"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || recorder.recording}
        >
          <IconImage />
        </button>
        {recorder.recording ? (
          <button type="button" title="Stop recording" className="recording" onClick={stopAndUpload}>
            <IconStop />
          </button>
        ) : (
          <button type="button" title="Record audio" onClick={() => recorder.start()} disabled={uploading}>
            <IconMic />
          </button>
        )}
        {uploading && <span className="attachments-uploading">Uploading…</span>}
      </div>
      {(error || recorder.error) && <div className="composer-error">{error || recorder.error}</div>}
    </div>
  );
}

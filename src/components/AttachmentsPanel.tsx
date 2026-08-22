import { useRef, useState } from 'react';
import { IconClose, IconImage, IconMic, IconStop } from './Icons';
import type { Attachment } from '../types';

interface Props {
  attachments: Attachment[];
  onUpload: (file: File | Blob, filename?: string) => Promise<void>;
  onDelete: (attachmentId: string) => void;
}

export function AttachmentsPanel({ attachments, onUpload, onDelete }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          await onUpload(blob, `recording-${Date.now()}.webm`);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Upload failed.');
        } finally {
          setUploading(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError('Could not access the microphone.');
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
              <img src={a.url} alt={a.name} />
              <button type="button" className="attachment-remove" title="Remove" onClick={() => onDelete(a.id)}>
                <IconClose width={14} height={14} />
              </button>
            </div>
          ))}
        </div>
      )}

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
          <audio src={a.url} controls />
          <button type="button" className="attachment-remove" title="Remove" onClick={() => onDelete(a.id)}>
            <IconClose width={14} height={14} />
          </button>
        </div>
      ))}

      <div className="attachments-toolbar">
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

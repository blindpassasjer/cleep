import { useState } from 'react';
import { IconClose, IconMic, IconPause, IconPlay, IconStop } from './Icons';
import { LiveWaveform } from './LiveWaveform';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { formatElapsed } from '../lib/formatElapsed';
import { api } from '../api/client';
import type { ChecklistItem, Note, NoteColor } from '../types';

interface Props {
  onCreate: (
    title: string,
    content: string,
    color: NoteColor,
    extra?: { isChecklist?: boolean; items?: ChecklistItem[]; isRecording?: boolean },
  ) => Promise<Note>;
  onReload: () => Promise<void>;
}

/**
 * The Recordings view's capture entry point -- deliberately simpler than NoteComposer (no title,
 * no color, no formatting): tap the mic and it's already recording, since a voice memo shouldn't
 * need any setup before you can start playing. The resulting note is a completely normal one
 * under the hood (isRecording just changes which view it shows up in) -- open it afterward like
 * any note to add a title or text.
 */
export function QuickRecorder({ onCreate, onReload }: Props) {
  const recorder = useAudioRecorder();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    const result = await recorder.stop();
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      const note = await onCreate('', '', 'default', { isRecording: true });
      await api.uploadAttachment(note.id, result.blob, `recording-${Date.now()}.webm`, result.peaks);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the recording. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!recorder.recording) {
    return (
      <div className="composer collapsed quick-recorder-collapsed" onClick={() => recorder.start()}>
        <span>Record a new idea…</span>
        <IconMic width={20} height={20} />
        {(error || recorder.error) && <div className="composer-error">{error || recorder.error}</div>}
      </div>
    );
  }

  return (
    <div className="quick-recorder-active">
      <LiveWaveform levels={recorder.levels} paused={recorder.paused} />
      <span className="attachment-live-timer">{formatElapsed(recorder.elapsedMs)}</span>
      <button
        type="button"
        title={recorder.paused ? 'Resume' : 'Pause'}
        onClick={() => (recorder.paused ? recorder.resume() : recorder.pause())}
        disabled={saving}
      >
        {recorder.paused ? <IconPlay width={18} height={18} /> : <IconPause width={18} height={18} />}
      </button>
      <button type="button" title="Discard" onClick={() => recorder.cancel()} disabled={saving}>
        <IconClose width={18} height={18} />
      </button>
      <button type="button" title="Save recording" className="quick-recorder-save" onClick={finish} disabled={saving}>
        <IconStop width={18} height={18} />
      </button>
      {error && <div className="composer-error">{error}</div>}
    </div>
  );
}

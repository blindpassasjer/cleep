import { useMemo } from 'react';
import { downsampleBars } from '../lib/waveform';

const MINI_BAR_COUNT = 28;

/** A static (non-interactive, no playback) waveform preview for the note grid — the full
 * WaveformPlayer with transport controls only makes sense once a note is actually open. */
export function MiniWaveform({ peaks }: { peaks: number[] | null }) {
  const bars = useMemo(() => downsampleBars(peaks ?? [], MINI_BAR_COUNT), [peaks]);

  return (
    <div className="mini-waveform" aria-hidden="true">
      {bars.map((height, i) => (
        <span key={i} className="mini-waveform-bar" style={{ height: `${Math.round(height * 100)}%` }} />
      ))}
    </div>
  );
}

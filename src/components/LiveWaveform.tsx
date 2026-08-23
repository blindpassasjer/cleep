interface Props {
  levels: number[];
  paused?: boolean;
}

/** Live amplitude bars while actively recording -- distinct from WaveformPlayer, which renders a
 * fixed set of peaks computed after the fact from a finished recording. */
export function LiveWaveform({ levels, paused }: Props) {
  return (
    <div className={`live-waveform ${paused ? 'paused' : ''}`}>
      {levels.map((level, i) => (
        <span key={i} className="live-waveform-bar" style={{ height: `${Math.max(6, Math.round(level * 100))}%` }} />
      ))}
    </div>
  );
}

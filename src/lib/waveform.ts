const WAVEFORM_SAMPLES = 100;

/**
 * Reduces a decoded audio buffer to a fixed number of amplitude peaks (0..1), one per time
 * block, for rendering as a bar waveform. Loud sections are exaggerated and quiet ones shrunk
 * (pow 1.8) so the shape reads clearly at a glance; a small floor keeps near-silent bars visible
 * as a stub rather than vanishing.
 */
export function computeWaveformPeaks(channelData: Float32Array, samples: number = WAVEFORM_SAMPLES): number[] {
  const blockSize = Math.max(1, Math.floor(channelData.length / samples));
  const rawPeaks: number[] = [];

  for (let i = 0; i < samples; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, channelData.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) max = abs;
    }
    rawPeaks.push(max);
  }

  const overallMax = Math.max(...rawPeaks, 0.0001);
  return rawPeaks.map((p) => Math.max(0.04, Math.pow(p / overallMax, 1.8)));
}

/** Reduces (or, rarely, pads) a peaks array to exactly `targetCount` bars, preserving spikes. */
export function downsampleBars(bars: number[], targetCount: number): number[] {
  if (bars.length === 0) return new Array(targetCount).fill(0.06);
  if (bars.length === targetCount) return bars;
  const result: number[] = [];
  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor((i / targetCount) * bars.length);
    const end = Math.max(start + 1, Math.floor(((i + 1) / targetCount) * bars.length));
    let max = 0;
    for (let j = start; j < end && j < bars.length; j++) {
      if (bars[j] > max) max = bars[j];
    }
    result.push(max);
  }
  return result;
}

export async function computeWaveformPeaksFromBlob(blob: Blob): Promise<number[]> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new AudioContextClass();
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return computeWaveformPeaks(audioBuffer.getChannelData(0));
  } finally {
    await audioContext.close();
  }
}

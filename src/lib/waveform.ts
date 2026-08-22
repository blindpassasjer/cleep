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

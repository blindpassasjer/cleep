/** Formats a duration in milliseconds as m:ss (e.g. 65_000 -> "1:05"), for a live recording timer. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

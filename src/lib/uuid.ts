/**
 * UUID v4 generator with a fallback for insecure browser contexts.
 *
 * `crypto.randomUUID` is only exposed on trustworthy origins (HTTPS or
 * localhost). Self-hosted Cleep is often reached over plain http:// on a LAN
 * (e.g. http://<nas-ip>:6169), where `crypto.randomUUID` is undefined but
 * `crypto.getRandomValues` still works.
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}

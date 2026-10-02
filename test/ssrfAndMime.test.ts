import { describe, it, expect } from 'vitest';
import { assertPublicUrl, SsrfError } from '../server/lib/ssrf.js';
import { kindFromMime } from '../server/lib/attachments.js';

describe('SSRF guard: IPv6 and reserved ranges', () => {
  it.each([
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:7f00:1]/',
    'http://[::ffff:a00:1]/',
    'http://[64:ff9b::7f00:1]/',
    'http://[::127.0.0.1]/',
    'http://198.18.0.1/',
    'http://224.0.0.1/',
    'http://127.0.0.1/',
  ])('rejects %s', async (url) => {
    await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(SsrfError);
  });

  it('accepts a public IPv4 literal', async () => {
    await expect(assertPublicUrl('http://93.184.216.34/')).resolves.toMatchObject({ address: '93.184.216.34' });
  });
});

describe('kindFromMime', () => {
  it.each(['image/svg+xml', 'IMAGE/SVG+XML', 'image/svg+xml;charset=utf-8'])('rejects %s', (m) => {
    expect(kindFromMime(m)).toBeNull();
  });
  it('still accepts normal media with parameters', () => {
    expect(kindFromMime('Image/PNG')).toBe('image');
    expect(kindFromMime('audio/webm;codecs=opus')).toBe('audio');
  });
});

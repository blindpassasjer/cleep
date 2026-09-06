import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../server/lib/httpGet.js', () => ({ httpGet: vi.fn() }));

import { createUserAndLogin, app } from './helpers.js';
import { httpGet, type HttpGetResult } from '../server/lib/httpGet.js';

const mockHttpGet = vi.mocked(httpGet);

function htmlResult(html: string, overrides: Partial<HttpGetResult> = {}): HttpGetResult {
  return {
    status: 200,
    location: null,
    contentType: 'text/html; charset=utf-8',
    contentLength: null,
    body: Readable.from([Buffer.from(html)]),
    ...overrides,
  };
}

describe('GET /api/link-preview', () => {
  afterEach(() => {
    mockHttpGet.mockReset();
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/link-preview?url=http://93.184.216.34/');
    expect(res.status).toBe(401);
  });

  it('400s on a missing or invalid url', async () => {
    const { agent } = await createUserAndLogin();
    expect((await agent.get('/api/link-preview')).status).toBe(400);
    expect((await agent.get('/api/link-preview?url=not-a-url')).status).toBe(400);
  });

  it('rejects private / loopback / metadata targets without making a request', async () => {
    const { agent } = await createUserAndLogin();
    for (const url of ['http://127.0.0.1/', 'http://localhost/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/']) {
      const res = await agent.get(`/api/link-preview?url=${encodeURIComponent(url)}`);
      expect(res.status).toBe(200);
      expect(res.body.preview).toBeNull();
    }
    expect(mockHttpGet).not.toHaveBeenCalled();
  });

  it('parses OpenGraph metadata and resolves a relative image', async () => {
    const { agent } = await createUserAndLogin();
    mockHttpGet.mockResolvedValue(
      htmlResult(
        `<html><head>
          <meta property="og:title" content="Example &amp; Co">
          <meta property="og:image" content="/img/cover.png">
          <meta property="og:site_name" content="Example">
        </head><body>hi</body></html>`,
      ),
    );

    const res = await agent.get('/api/link-preview?url=http://93.184.216.34/page');
    expect(res.status).toBe(200);
    expect(res.body.preview).toMatchObject({
      title: 'Example & Co',
      // The remote image is rewritten to a same-origin proxy URL so it loads under a strict
      // `img-src 'self'` CSP (see proxyAsset in the route).
      image: `/api/link-preview/image?url=${encodeURIComponent('http://93.184.216.34/img/cover.png')}`,
      siteName: 'Example',
    });
  });

  it('serves a repeated request from the cache table (one fetch only)', async () => {
    const { agent } = await createUserAndLogin();
    mockHttpGet.mockImplementation(async () => htmlResult('<html><head><title>Cached</title></head></html>'));

    const first = await agent.get('/api/link-preview?url=http://93.184.216.34/x');
    const second = await agent.get('/api/link-preview?url=http://93.184.216.34/x');
    expect(first.body.preview?.title).toBe('Cached');
    expect(second.body.preview?.title).toBe('Cached');
    expect(mockHttpGet).toHaveBeenCalledTimes(1);
  });

  it('returns null for a non-HTML response', async () => {
    const { agent } = await createUserAndLogin();
    mockHttpGet.mockResolvedValue(htmlResult('%PDF-1.4', { contentType: 'application/pdf' }));

    const res = await agent.get('/api/link-preview?url=http://93.184.216.34/doc.pdf');
    expect(res.status).toBe(200);
    expect(res.body.preview).toBeNull();
  });

  it('does not follow a redirect to a private address', async () => {
    const { agent } = await createUserAndLogin();
    mockHttpGet.mockResolvedValue(
      htmlResult('', { status: 302, location: 'http://169.254.169.254/latest/meta-data/' }),
    );

    const res = await agent.get('/api/link-preview?url=http://93.184.216.34/redir');
    expect(res.status).toBe(200);
    expect(res.body.preview).toBeNull();
    expect(mockHttpGet).toHaveBeenCalledTimes(1); // stopped at the redirect, never fetched the target
  });

  it('resolves the favicon through the same-origin proxy too', async () => {
    const { agent } = await createUserAndLogin();
    mockHttpGet.mockResolvedValue(
      htmlResult(
        `<html><head><title>Docs</title>
          <link rel="icon" href="https://cdn.example.com/favicon.ico">
        </head></html>`,
      ),
    );

    const res = await agent.get('/api/link-preview?url=http://93.184.216.34/docs');
    expect(res.body.preview.favicon).toBe(
      `/api/link-preview/image?url=${encodeURIComponent('https://cdn.example.com/favicon.ico')}`,
    );
  });

  it('caps an oversized body instead of buffering all of it', async () => {
    const { agent } = await createUserAndLogin();
    let pushed = 0;
    const endless = new Readable({
      read() {
        pushed += 64 * 1024;
        this.push(Buffer.alloc(64 * 1024, 'x'.charCodeAt(0)));
        if (pushed > 8 * 1024 * 1024) this.push(null); // safety net so a bug can't hang the test
      },
    });
    mockHttpGet.mockResolvedValue(htmlResult('', { body: endless }));

    const res = await agent.get('/api/link-preview?url=http://93.184.216.34/huge');
    expect(res.status).toBe(200);
    // No <title>/og:* in a wall of 'x', so it resolves to no preview -- the point is it returned
    // at all (didn't OOM/hang) and stopped reading well before 8 MB.
    expect(res.body.preview).toBeNull();
    expect(pushed).toBeLessThan(2 * 1024 * 1024);
  });
});

describe('GET /api/link-preview/image', () => {
  afterEach(() => {
    mockHttpGet.mockReset();
  });

  function imageResult(type: string, bytes: Buffer, overrides: Partial<HttpGetResult> = {}): HttpGetResult {
    return {
      status: 200,
      location: null,
      contentType: type,
      contentLength: bytes.length,
      body: Readable.from([bytes]),
      ...overrides,
    };
  }

  it('requires authentication', async () => {
    const res = await request(app).get('/api/link-preview/image?url=http://93.184.216.34/a.png');
    expect(res.status).toBe(401);
  });

  it('streams a remote image back with its content-type', async () => {
    const { agent } = await createUserAndLogin();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    mockHttpGet.mockResolvedValue(imageResult('image/png', png));

    const res = await agent.get('/api/link-preview/image?url=http://93.184.216.34/a.png');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(res.body)).toEqual(png);
  });

  it('502s when the upstream is not an image', async () => {
    const { agent } = await createUserAndLogin();
    mockHttpGet.mockResolvedValue(imageResult('text/html', Buffer.from('<html></html>')));

    const res = await agent.get('/api/link-preview/image?url=http://93.184.216.34/nope');
    expect(res.status).toBe(502);
  });

  it('refuses a private/loopback target', async () => {
    const { agent } = await createUserAndLogin();
    const res = await agent.get(`/api/link-preview/image?url=${encodeURIComponent('http://169.254.169.254/img')}`);
    expect(res.status).toBe(400);
    expect(mockHttpGet).not.toHaveBeenCalled();
  });
});

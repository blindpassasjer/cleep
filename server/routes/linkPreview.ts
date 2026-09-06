import { Router } from 'express';
import { once } from 'node:events';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { linkPreviews } from '../db/schema.js';
import type { Readable } from 'node:stream';
import { requireAuth } from '../middleware/session.js';
import { assertPublicUrl, SsrfError, type SafeTarget } from '../lib/ssrf.js';
import { httpGet } from '../lib/httpGet.js';

export const linkPreviewRouter = Router();
linkPreviewRouter.use(requireAuth);

const FETCH_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const OK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ERROR_TTL_MS = 24 * 60 * 60 * 1000;

const IMAGE_TIMEOUT_MS = 10000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_CACHE_SECONDS = 7 * 24 * 60 * 60;
// Types we're willing to re-serve from our own origin. Kept to the formats a browser renders in
// an <img>; anything else from a page's og:image/favicon is treated as "no image".
const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

interface PreviewApi {
  url: string;
  title: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
}

/** Drops the fragment and trailing whitespace so `#foo` variants share one cache row. */
function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ');
}

function metaContent(html: string, attr: 'property' | 'name', value: string): string | null {
  // Tolerates attribute order (content before or after property/name).
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]*\\scontent=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*\\s${attr}=["']${value}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]).trim() || null;
  }
  return null;
}

function extractMetadata(html: string, finalUrl: string): Omit<PreviewApi, 'url'> {
  const head = html.slice(0, 100_000); // metadata lives in <head>; cap the regex work
  const ogTitle = metaContent(head, 'property', 'og:title');
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = ogTitle ?? (titleTag ? decodeEntities(titleTag[1]).replace(/\s+/g, ' ').trim() : null);

  const ogImage = metaContent(head, 'property', 'og:image') ?? metaContent(head, 'name', 'twitter:image');
  const siteName = metaContent(head, 'property', 'og:site_name') ?? new URL(finalUrl).hostname;

  const iconMatch =
    head.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i) ??
    head.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*icon[^"']*["']/i);

  const resolve = (v: string | null): string | null => {
    if (!v) return null;
    try {
      return new URL(v, finalUrl).toString();
    } catch {
      return null;
    }
  };

  return {
    title: title || null,
    image: resolve(ogImage),
    siteName,
    favicon: resolve(iconMatch ? iconMatch[1] : '/favicon.ico'),
  };
}

/** Reads at most `max` bytes off the response stream, then stops -- so a multi-megabyte (or
 *  endless chunked) page can't make the server buffer the whole thing into memory. */
async function readCapped(stream: Readable, max: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
    total += (chunk as Buffer).length;
    if (total >= max) {
      stream.destroy();
      break;
    }
  }
  return Buffer.concat(chunks).subarray(0, max).toString('utf-8');
}

async function fetchHtml(start: SafeTarget): Promise<{ html: string; finalUrl: string } | null> {
  let target = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // The timer stays armed until the body has been read (or capped), not just until the headers
    // arrive -- otherwise a server that dribbles the body out slowly would hang this request.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await httpGet(target.url, target.address, controller.signal);

      if (res.status >= 300 && res.status < 400) {
        res.body.resume(); // drain so the socket can be reused/closed
        if (!res.location) return null;
        // Re-validate (and re-pin) every redirect hop -- a public URL can 302 to an internal one.
        target = await assertPublicUrl(new URL(res.location, target.url).toString());
        continue;
      }

      if (res.status < 200 || res.status >= 300) {
        res.body.destroy();
        console.warn(`Link preview: ${target.url.href} returned HTTP ${res.status}`);
        return null;
      }
      if (!res.contentType.includes('text/html')) {
        res.body.destroy();
        console.warn(`Link preview: ${target.url.href} is not HTML (content-type: ${res.contentType || 'none'})`);
        return null;
      }
      if (res.contentLength !== null && res.contentLength > MAX_BODY_BYTES * 4) {
        res.body.destroy();
        console.warn(`Link preview: ${target.url.href} body too large (${res.contentLength} bytes)`);
        return null;
      }

      const html = await readCapped(res.body, MAX_BODY_BYTES);
      return { html, finalUrl: target.url.toString() };
    } catch (err) {
      console.warn(`Link preview: fetch of ${target.url.href} failed -- ${(err as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function toApi(row: typeof linkPreviews.$inferSelect): PreviewApi | null {
  if (row.status !== 'ok') return null;
  return { url: row.url, title: row.title, image: row.imageUrl, siteName: row.siteName, favicon: row.faviconUrl };
}

/**
 * Rewrites a remote image/favicon URL to one served from this origin (`/api/link-preview/image`).
 * The browser then only ever loads preview assets from `'self'`, so a card still renders its
 * thumbnail when the deployment sits behind a reverse proxy that forces a strict
 * `img-src`/`default-src 'self'` CSP -- and off-site hosts never see the reader's IP. Relative
 * or already-same-origin URLs are left untouched.
 */
function proxyAsset(assetUrl: string | null): string | null {
  if (!assetUrl || !/^https?:\/\//i.test(assetUrl)) return assetUrl;
  return `/api/link-preview/image?url=${encodeURIComponent(assetUrl)}`;
}

function toClient(preview: PreviewApi | null): PreviewApi | null {
  if (!preview) return null;
  return { ...preview, image: proxyAsset(preview.image), favicon: proxyAsset(preview.favicon) };
}

/** Follows redirects (re-validating each hop) and returns the image body + type, or null. */
async function fetchImage(start: SafeTarget, signal: AbortSignal): Promise<{ body: Readable; type: string } | null> {
  let target = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await httpGet(target.url, target.address, signal);

    if (res.status >= 300 && res.status < 400) {
      res.body.resume();
      if (!res.location) return null;
      target = await assertPublicUrl(new URL(res.location, target.url).toString());
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      res.body.destroy();
      return null;
    }

    const type = res.contentType.split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(type)) {
      res.body.destroy();
      return null;
    }
    if (res.contentLength !== null && res.contentLength > MAX_IMAGE_BYTES) {
      res.body.destroy();
      return null;
    }
    return { body: res.body, type };
  }
  return null;
}

// Proxies a preview's image/favicon through this origin (see proxyAsset). Auth-gated by the
// router, SSRF-checked like the metadata fetch, size- and type-capped, and streamed so a large
// image can't buffer into memory.
linkPreviewRouter.get('/image', async (req, res) => {
  const raw = req.query.url;
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) {
    res.status(400).end();
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const target = await assertPublicUrl(raw);
    const img = await fetchImage(target, controller.signal);
    if (!img) {
      res.status(502).end();
      return;
    }

    res.setHeader('Content-Type', img.type);
    res.setHeader('Cache-Control', `public, max-age=${IMAGE_CACHE_SECONDS}, immutable`);
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    let sent = 0;
    for await (const chunk of img.body) {
      sent += (chunk as Buffer).length;
      if (sent > MAX_IMAGE_BYTES) {
        img.body.destroy();
        break;
      }
      if (!res.write(chunk)) await once(res, 'drain');
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) res.status(err instanceof SsrfError ? 400 : 502).end();
    else res.destroy();
  } finally {
    clearTimeout(timer);
  }
});

linkPreviewRouter.get('/', async (req, res) => {
  const raw = req.query.url;
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) {
    res.status(400).json({ error: 'A url query parameter is required.' });
    return;
  }
  const url = normalizeUrl(raw);
  if (!url) {
    res.status(400).json({ error: 'Invalid url.' });
    return;
  }

  try {
    const [cached] = await db.select().from(linkPreviews).where(eq(linkPreviews.url, url)).limit(1);
    if (cached) {
      const age = Date.now() - cached.fetchedAt.getTime();
      const ttl = cached.status === 'ok' ? OK_TTL_MS : ERROR_TTL_MS;
      if (age < ttl) {
        res.json({ preview: toClient(toApi(cached)) });
        return;
      }
    }

    let preview: PreviewApi | null = null;
    try {
      const target = await assertPublicUrl(url);
      const fetched = await fetchHtml(target);
      if (fetched) {
        const meta = extractMetadata(fetched.html, fetched.finalUrl);
        preview = { url, ...meta };
        if (!meta.title && !meta.image) {
          console.warn(`Link preview: fetched ${url} but found no <title>, og:title, or og:image`);
        }
      }
    } catch (err) {
      if (!(err instanceof SsrfError)) throw err;
      console.warn('Link preview rejected:', (err as Error).message);
    }

    const row = {
      url,
      title: preview?.title ?? null,
      imageUrl: preview?.image ?? null,
      siteName: preview?.siteName ?? null,
      faviconUrl: preview?.favicon ?? null,
      status: preview && (preview.title || preview.image) ? 'ok' : 'error',
      fetchedAt: new Date(),
    };
    await db
      .insert(linkPreviews)
      .values(row)
      .onConflictDoUpdate({ target: linkPreviews.url, set: row });

    res.json({ preview: row.status === 'ok' ? toClient(preview) : null });
  } catch (err) {
    console.error('Link preview failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

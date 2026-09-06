import { Router } from 'express';
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

      if (res.status < 200 || res.status >= 300) return null;
      if (!res.contentType.includes('text/html')) {
        res.body.destroy();
        return null;
      }
      if (res.contentLength !== null && res.contentLength > MAX_BODY_BYTES * 4) {
        res.body.destroy();
        return null;
      }

      const html = await readCapped(res.body, MAX_BODY_BYTES);
      return { html, finalUrl: target.url.toString() };
    } catch {
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
        res.json({ preview: toApi(cached) });
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

    res.json({ preview: row.status === 'ok' ? preview : null });
  } catch (err) {
    console.error('Link preview failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

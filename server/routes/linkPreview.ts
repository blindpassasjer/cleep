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

const NAMED_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => codePoint(parseInt(dec, 10)))
    .replace(/&([a-z0-9]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/&amp;/g, '&'); // last, so "&amp;#39;" style double-encoding doesn't re-trigger a pass
}

function codePoint(n: number): string {
  try {
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  } catch {
    return '';
  }
}

/** src/path fragments that mark an image as chrome, not content -- logos, sprites, tracking pixels. */
const NON_CONTENT_IMAGE =
  /(?:^|[/_-])(?:logo|logos|icon|icons|sprite|sprites|favicon|avatar|placeholder|spacer|blank|pixel|tracking|1x1|badge|button|banner-?ad|ad[_-]|advert)(?:[/_.-]|$)/i;

function tagAttr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}=["']([^"']*)["']`, 'i'));
  return m ? m[1].trim() || null : null;
}

/** True for a width/height attribute that's present and clearly too small to be a hero image. */
function tinyDimension(v: string | null): boolean {
  if (!v) return false;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 && n < 100;
}

/** Largest pixel width we can infer for an <img>: from its width attr or a size hint in the URL. */
function widthHint(tag: string, url: string): number {
  const widths: number[] = [];
  const attrW = parseInt(tagAttr(tag, 'width') ?? '', 10);
  if (Number.isFinite(attrW) && attrW > 0) widths.push(attrW);
  for (const m of url.matchAll(/[?&](?:width|w|maxwidth|mw)=(\d+)/gi)) widths.push(parseInt(m[1], 10));
  // dimensions baked into the filename, e.g. photo-1200x800.jpg or hero_1600.webp
  const dims = url.match(/[-_](\d{3,4})(?:x\d{3,4})?\.[a-z]{3,4}(?:[?#]|$)/i);
  if (dims) widths.push(parseInt(dims[1], 10));
  return widths.length ? Math.max(...widths) : 0;
}

/** Highest-resolution candidate in a srcset, or null. */
function largestFromSrcset(srcset: string): string | null {
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(',')) {
    const [url, descriptor] = part.trim().split(/\s+/);
    if (!url) continue;
    const w = descriptor?.endsWith('w') ? parseInt(descriptor, 10) : 0;
    if (!best || w > best.w) best = { url, w };
  }
  return best?.url ?? null;
}

const CONTENT_HINT = /(?:hero|banner|feature|featured|cover|lead|headline|article|content|media|upload|gallery|galleri|forside|artikkel|bilde|photo|foto)/i;
const THUMBNAIL_HINT = /(?:thumb|thumbnail|small|mini|tiny|preview|profile|avatar|-icon|_icon|widget)/i;

/**
 * Fallback when a page declares no og:image/twitter:image (common on school, municipal, and
 * hand-rolled sites): score the <body>'s <img> tags and return the most relevant one -- roughly
 * what Google's "representative image" heuristic does. <nav>/<footer> chrome is stripped first;
 * remaining candidates are ranked by inferred size, alt text, path hints, and document position,
 * with logos/sprites/tracking pixels and tiny images filtered out entirely. The winner still goes
 * through the same SSRF + type + size checks as any other preview asset when it's proxied.
 */
function pickBodyImage(html: string, finalUrl: string): string | null {
  const headEnd = html.search(/<\/head>/i);
  let body = headEnd >= 0 ? html.slice(headEnd) : html;
  // Drop nav/footer chrome so their icons never enter the ranking. <header> is left in -- page
  // heroes are often wrapped in one -- and its logos are caught by NON_CONTENT_IMAGE / the SVG skip.
  body = body.replace(/<(nav|footer)\b[\s\S]*?<\/\1>/gi, ' ');

  const tags = body.match(/<img\b[^>]*>/gi);
  if (!tags) return null;

  const candidates = tags.slice(0, 60);
  let bestUrl: string | null = null;
  let bestScore = 0;

  for (let index = 0; index < candidates.length; index++) {
    const tag = candidates[index];
    let src =
      tagAttr(tag, 'data-src') ??
      tagAttr(tag, 'data-original') ??
      tagAttr(tag, 'data-lazy-src') ??
      tagAttr(tag, 'src');
    const srcset = tagAttr(tag, 'srcset') ?? tagAttr(tag, 'data-srcset');
    if ((!src || /^data:/i.test(src)) && srcset) src = largestFromSrcset(srcset);
    if (!src || /^data:/i.test(src)) continue;

    let abs: string;
    try {
      abs = new URL(src, finalUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(abs)) continue;
    if (/\.svg(?:[?#]|$)/i.test(abs)) continue; // usually an icon/illustration, not a photo
    if (NON_CONTENT_IMAGE.test(abs)) continue;
    if (tinyDimension(tagAttr(tag, 'width')) || tinyDimension(tagAttr(tag, 'height'))) continue;

    const width = widthHint(tag, abs);
    if (width > 0 && width < 200) continue; // a known-small image is a thumbnail/icon

    let score = 0;
    if (width >= 1200) score += 40;
    else if (width >= 600) score += 30;
    else if (width >= 300) score += 18;
    else if (width === 0) score += 6; // unknown size: plausible, but beat by anything measured large

    const alt = tagAttr(tag, 'alt');
    if (alt && alt.length >= 3) score += 8;
    if (CONTENT_HINT.test(abs)) score += 12;
    if (THUMBNAIL_HINT.test(abs)) score -= 15;
    // Earlier images are likelier to be the lead visual; taper the bonus across the candidates.
    score += Math.max(0, 8 - Math.floor((index / candidates.length) * 16));

    if (score > bestScore) {
      bestScore = score;
      bestUrl = abs;
    }
  }

  return bestUrl;
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

function extractMetadata(html: string, finalUrl: string): Omit<PreviewApi, 'url'> & { faviconDeclared: boolean } {
  const head = html.slice(0, 100_000); // metadata lives in <head>; cap the regex work
  const ogTitle = metaContent(head, 'property', 'og:title');
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = ogTitle ?? (titleTag ? decodeEntities(titleTag[1]).replace(/\s+/g, ' ').trim() : null);

  const ogImage = metaContent(head, 'property', 'og:image') ?? metaContent(head, 'name', 'twitter:image');
  const siteName =
    metaContent(head, 'property', 'og:site_name') ?? new URL(finalUrl).hostname.replace(/^www\./, '');

  const iconMatch =
    head.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i) ??
    head.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*icon[^"']*["']/i);
  // `/favicon.ico` is only a guess -- it 404s on plenty of sites -- so it doesn't count as a
  // "usable" preview on its own, but a favicon the page actually declared does.
  const faviconDeclared = Boolean(iconMatch);

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
    image: resolve(ogImage) ?? pickBodyImage(html, finalUrl),
    siteName,
    favicon: resolve(iconMatch ? iconMatch[1] : '/favicon.ico'),
    faviconDeclared,
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
    let retrieved = false;
    let faviconDeclared = false;
    try {
      const target = await assertPublicUrl(url);
      const fetched = await fetchHtml(target);
      if (fetched) {
        retrieved = true;
        const { faviconDeclared: declared, ...meta } = extractMetadata(fetched.html, fetched.finalUrl);
        faviconDeclared = declared;
        preview = { url, ...meta };
        if (!meta.title && !meta.image) {
          console.warn(`Link preview: fetched ${url} but found no <title>, og:title, or og:image`);
        }
      }
    } catch (err) {
      if (!(err instanceof SsrfError)) throw err;
      retrieved = true; // a rejected target is a permanent verdict, not a transient miss
      console.warn('Link preview rejected:', (err as Error).message);
    }

    // Couldn't reach or parse the page this time. If we still have a good preview cached, keep
    // serving it rather than replacing it with an empty "error" row over a transient blip -- the
    // stale row's TTL will bring us back here to retry.
    if (!retrieved && cached?.status === 'ok') {
      res.json({ preview: toClient(toApi(cached)) });
      return;
    }

    const row = {
      url,
      title: preview?.title ?? null,
      imageUrl: preview?.image ?? null,
      siteName: preview?.siteName ?? null,
      faviconUrl: preview?.favicon ?? null,
      // A page is worth a card if it gave us a title, an image, or a favicon it actually declared
      // (a bare `/favicon.ico` guess doesn't count -- it's frequently a 404).
      status: preview && (preview.title || preview.image || (preview.favicon && faviconDeclared)) ? 'ok' : 'error',
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

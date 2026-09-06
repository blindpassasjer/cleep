import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import type { Readable } from 'node:stream';

export interface HttpGetResult {
  status: number;
  location: string | null;
  contentType: string;
  contentLength: number | null;
  body: Readable;
}

// A browser-shaped UA with a bot token appended. Plenty of sites (anything behind Cloudflare's
// bot fight mode, and many news/social sites) serve a challenge page or strip their OpenGraph
// tags when they see an unfamiliar User-Agent, which left every preview blank. The trailing
// "CleepLinkPreview" keeps us honest for operators reading their logs.
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 CleepLinkPreview/1.0 (+https://github.com/blindpassasjer/cleep)';

/** Wraps the response stream in a decompressor when the server compressed the body. Big-site CDNs
 *  routinely ignore `Accept-Encoding: identity` and gzip/brotli anyway, and reading those bytes as
 *  text yields garbage -- which is why article pages resolved to an empty preview while bare
 *  domains (served uncompressed) worked. */
function decoded(res: http.IncomingMessage): Readable {
  const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
  const decompressor =
    enc === 'gzip' || enc === 'x-gzip'
      ? zlib.createGunzip()
      : enc === 'br'
        ? zlib.createBrotliDecompress()
        : enc === 'deflate'
          ? zlib.createInflate()
          : null;
  if (!decompressor) return res;
  res.on('error', (err) => decompressor.destroy(err));
  decompressor.on('close', () => res.destroy());
  return res.pipe(decompressor);
}

/**
 * A single GET request that connects straight to `pinnedAddress` (an IP the caller already
 * validated as public, see assertPublicUrl) instead of resolving `url.hostname` again -- so DNS
 * can't be rebound to an internal target between the check and the connection. The real hostname
 * still goes out in the `Host` header and, for TLS, as the SNI `servername` (so certificate
 * validation is unchanged).
 *
 * Redirects are NOT followed here -- the caller re-validates each hop.
 */
export function httpGet(url: URL, pinnedAddress: string, signal: AbortSignal): Promise<HttpGetResult> {
  return new Promise((resolve, reject) => {
    if (!pinnedAddress) {
      reject(new Error(`No pinned address for ${url.href}`));
      return;
    }
    const isHttps = url.protocol === 'https:';
    const mod = isHttps ? https : http;
    const req = mod.request(
      {
        host: pinnedAddress,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        signal,
        // SNI + certificate identity use the real hostname, not the IP we're dialing.
        ...(isHttps ? { servername: url.hostname } : {}),
        headers: {
          Host: url.host,
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        const len = res.headers['content-length'];
        resolve({
          status: res.statusCode ?? 0,
          location: res.headers.location ?? null,
          contentType: res.headers['content-type'] ?? '',
          contentLength: len !== undefined && /^\d+$/.test(len) ? Number(len) : null,
          body: decoded(res),
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

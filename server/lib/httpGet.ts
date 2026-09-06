import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
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

/**
 * A single GET request that connects to `pinnedAddress` instead of doing its own DNS lookup for
 * `url.hostname` -- so an address we validated as public a moment ago (see assertPublicUrl) can't
 * be swapped for an internal one between the check and the connection (DNS rebinding). TLS SNI and
 * certificate validation still use the real hostname (Node derives `servername` from the URL).
 *
 * Redirects are NOT followed here -- the caller re-validates each hop. `Accept-Encoding: identity`
 * because nothing downstream decompresses the body.
 */
export function httpGet(url: URL, pinnedAddress: string, signal: AbortSignal): Promise<HttpGetResult> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      {
        method: 'GET',
        signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity',
        },
        lookup: (_hostname, _options, cb) => cb(null, pinnedAddress, net.isIP(pinnedAddress) || 4),
      },
      (res) => {
        const len = res.headers['content-length'];
        resolve({
          status: res.statusCode ?? 0,
          location: res.headers.location ?? null,
          contentType: res.headers['content-type'] ?? '',
          contentLength: len !== undefined && /^\d+$/.test(len) ? Number(len) : null,
          body: res,
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

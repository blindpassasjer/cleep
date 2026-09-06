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

const USER_AGENT = 'CleepLinkPreview/1.0 (+https://github.com/blindpassasjer/cleep)';

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
          Accept: 'text/html,application/xhtml+xml',
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

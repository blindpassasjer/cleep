import dns from 'node:dns/promises';
import net from 'node:net';

// Guards outbound fetches (link previews) against SSRF: only plain http(s) on the default ports,
// and only to hosts that resolve entirely to public IP addresses -- so a note containing
// `http://169.254.169.254/…` or `http://localhost:6169/admin` can never make the server hit an
// internal target on the user's behalf.

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_PORTS = new Set(['', '80', '443']);

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd')) return true; // link-local, ULA
  // IPv4-mapped (::ffff:a.b.c.d)
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip);
  if (kind === 6) return isPrivateIPv6(ip);
  return true; // unknown format -- treat as unsafe
}

export class SsrfError extends Error {}

export interface SafeTarget {
  /** The parsed, validated URL. */
  url: URL;
  /** A concrete public IP the hostname resolved to -- the caller connects to *this* address
   *  rather than resolving the hostname again, closing the DNS-rebinding window. */
  address: string;
}

/**
 * Throws SsrfError unless `rawUrl` is a public http(s) URL on a standard port. Resolves the
 * hostname and rejects if any resolved address is private/loopback/link-local. On success
 * returns the URL together with one resolved public address to pin the connection to.
 */
export async function assertPublicUrl(rawUrl: string): Promise<SafeTarget> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError('Invalid URL.');
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) throw new SsrfError(`Disallowed protocol: ${url.protocol}`);
  if (!ALLOWED_PORTS.has(url.port)) throw new SsrfError(`Disallowed port: ${url.port}`);

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new SsrfError(`Private address: ${host}`);
    return { url, address: host };
  }
  if (host === 'localhost') throw new SsrfError('Private address: localhost');

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    throw new SsrfError(`DNS lookup failed for ${host}`);
  }
  if (records.length === 0) throw new SsrfError(`No DNS records for ${host}`);

  // Every resolved address must be public...
  for (const { address } of records) {
    if (isPrivateAddress(address)) throw new SsrfError(`Host ${host} resolves to a private address`);
  }
  // ...and we pin the connection to a concrete one. Some resolvers (seen on Synology's Docker
  // bridge) hand back an entry with no usable `address`, or only an AAAA record on a host with no
  // IPv6 route -- prefer the first valid IPv4, else the first valid address of any family.
  const usable =
    records.find((r) => net.isIP(r.address) === 4) ?? records.find((r) => net.isIP(r.address) !== 0);
  if (!usable) {
    console.warn(`Link preview: no usable IP for ${host} -- resolver returned ${JSON.stringify(records)}`);
    throw new SsrfError(`No usable IP address for ${host}`);
  }
  return { url, address: usable.address };
}

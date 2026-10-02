import dns from 'node:dns/promises';
import net from 'node:net';

// Guards outbound fetches (link previews) against SSRF: only plain http(s) on the default ports,
// and only to hosts that resolve entirely to public IP addresses -- so a note containing
// `http://169.254.169.254/…` or `http://localhost:6169/admin` can never make the server hit an
// internal target on the user's behalf.

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_PORTS = new Set(['', '80', '443']);

// Every range that must never be reachable from a link-preview fetch. A BlockList matches on the
// parsed address, so alternate spellings (hex IPv4-mapped IPv6, NAT64, ...) can't dodge it.
// Separate lists per family: BlockList.check() on an IPv4 address also tests it against IPv6
// rules as ::ffff:a.b.c.d, so the IPv4-mapped rule would otherwise block every IPv4 address.
const BLOCKED_V4 = new net.BlockList();
const BLOCKED_V6 = new net.BlockList();
for (const [net4, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local / cloud metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const) {
  BLOCKED_V4.addSubnet(net4, prefix, 'ipv4');
}
for (const [net6, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::', 96], // IPv4-compatible (::a.b.c.d)
  ['::ffff:0:0', 96], // IPv4-mapped (any spelling)
  ['64:ff9b::', 96], // NAT64
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard-only
  ['2001::', 32], // Teredo
  ['2002::', 16], // 6to4
  ['fc00::', 7], // ULA
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  BLOCKED_V6.addSubnet(net6, prefix, 'ipv6');
}

function isPrivateAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return BLOCKED_V4.check(ip, 'ipv4');
  if (kind === 6) return BLOCKED_V6.check(ip, 'ipv6');
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

  // Collect every address the host resolves to. `dns.lookup` follows the OS resolver (respects
  // /etc/hosts, musl/glibc quirks and all); on some setups -- notably Synology's Docker bridge --
  // it returns entries with no usable `address`, so fall back to querying A/AAAA records directly.
  let addresses: string[] = [];
  try {
    const looked = await dns.lookup(host, { all: true });
    addresses = looked.map((r) => r.address).filter((a) => typeof a === 'string' && net.isIP(a) !== 0);
  } catch {
    // fall through to resolve4/resolve6
  }
  if (addresses.length === 0) {
    const [v4, v6] = await Promise.all([
      dns.resolve4(host).catch(() => [] as string[]),
      dns.resolve6(host).catch(() => [] as string[]),
    ]);
    addresses = [...v4, ...v6].filter((a) => net.isIP(a) !== 0);
  }
  if (addresses.length === 0) throw new SsrfError(`DNS lookup failed for ${host}`);

  // Every resolved address must be public...
  for (const address of addresses) {
    if (isPrivateAddress(address)) throw new SsrfError(`Host ${host} resolves to a private address`);
  }
  // ...and we pin the connection to one of them -- prefer IPv4 (an AAAA-only pin fails on a host
  // with no IPv6 route).
  const pinned = addresses.find((a) => net.isIP(a) === 4) ?? addresses[0];
  return { url, address: pinned };
}

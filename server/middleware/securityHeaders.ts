import type { Request, Response, NextFunction } from 'express';

// Hand-rolled rather than pulling in `helmet` -- the set of headers Cleep needs is small and
// static, and keeping it inline matches the "small codebase you can actually audit" goal.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: http: blob: data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

// Six months. Only emitted when the operator has told us they're behind TLS (COOKIE_SECURE),
// because sending HSTS from a plain-http origin (e.g. http://<nas-ip>:6169) would pin browsers
// to https:// for a host that has no certificate and lock users out.
const HSTS = 'max-age=15552000; includeSubDomains';

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Everything the app loads is same-origin, except note images/media which the sanitizer
  // (src/lib/sanitizeHtml.ts) and attachment previews can point at http(s)/blob: URLs. No
  // inline/eval script or style is used anywhere, so script-src/style-src stay 'self'.
  res.setHeader('Content-Security-Policy', CSP);
  // camera/microphone are 'self' -- the app records audio and video. The rest are switched off.
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (process.env.COOKIE_SECURE === 'true') {
    res.setHeader('Strict-Transport-Security', HSTS);
  }
  next();
}

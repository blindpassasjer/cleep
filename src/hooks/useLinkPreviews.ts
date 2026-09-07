import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { LinkPreview } from '../types';

// Module-level cache shared by every card: the grid card and the open modal for the same note
// resolve the same URLs, and so do different notes that link to the same page. `null` means
// "resolved, server had nothing" -- callers turn that into a bare domain card; a pending fetch is
// tracked so concurrent callers dedupe.
const resolved = new Map<string, LinkPreview | null>();
const pending = new Map<string, Promise<void>>();

/** A bare card for when the fetch failed outright -- the domain, no image or favicon. */
function fallbackPreview(url: string): LinkPreview {
  let siteName = url;
  try {
    siteName = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* keep the raw string */
  }
  return { url, title: null, image: null, siteName, favicon: null };
}

function ensure(url: string): Promise<void> {
  if (resolved.has(url)) return Promise.resolve();
  const existing = pending.get(url);
  if (existing) return existing;
  const p = api
    .linkPreview(url)
    .then(({ preview }) => {
      resolved.set(url, preview);
    })
    .catch(() => {
      resolved.set(url, null);
    })
    .finally(() => {
      pending.delete(url);
    });
  pending.set(url, p);
  return p;
}

/** Resolves link previews for `urls`, returning a map of the ones that have come back. */
export function useLinkPreviews(urls: string[]): Map<string, LinkPreview> {
  const key = urls.join('\n');
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const missing = urls.filter((u) => !resolved.has(u));
    if (missing.length === 0) return;
    Promise.all(missing.map(ensure)).then(() => {
      if (!cancelled) force((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the stable projection of `urls`
  }, [key]);

  const out = new Map<string, LinkPreview>();
  for (const u of urls) {
    // Once resolved, always yield a card -- the server's preview, or a bare domain fallback.
    if (resolved.has(u)) out.set(u, resolved.get(u) ?? fallbackPreview(u));
  }
  return out;
}

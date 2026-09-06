import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { LinkPreview } from '../types';

// Module-level cache shared by every card: the grid card and the open modal for the same note
// resolve the same URLs, and so do different notes that link to the same page. `null` means
// "resolved, no usable preview"; a pending fetch is tracked so concurrent callers dedupe.
const resolved = new Map<string, LinkPreview | null>();
const pending = new Map<string, Promise<void>>();

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
export function useLinkPreviews(urls: string[]): Map<string, LinkPreview | null> {
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

  const out = new Map<string, LinkPreview | null>();
  for (const u of urls) {
    if (resolved.has(u)) out.set(u, resolved.get(u) ?? null);
  }
  return out;
}

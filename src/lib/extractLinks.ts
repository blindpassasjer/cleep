// Pulls http(s) URLs out of a note's title and (rich-text) content so the card can render a link
// preview below the body. The editor never stores <a> tags (see src/lib/sanitizeHtml.ts), so a
// link only ever exists as plain text -- we parse the HTML to text first, then scan.

// Allows `(` and `)` inside the match (Wikipedia-style `/wiki/Foo_(bar)` URLs); trimTrailing then
// drops a dangling `)` that belongs to the surrounding prose ("(see https://example.com)").
const URL_RE = /https?:\/\/[^\s<>"'\]]+/gi;
const MAX_LINKS = 3;

function htmlToText(html: string): string {
  if (!html.includes('<')) return html;
  try {
    return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
  } catch {
    return html;
  }
}

/** Trailing punctuation is almost always sentence punctuation, not part of the URL. */
function trimTrailing(url: string): string {
  let out = url.replace(/[.,;:!?]+$/, '');
  // Strip trailing ")" only while they're unbalanced -- keeps `/wiki/Foo_(bar)` intact but drops
  // the closer in `(https://example.com)`.
  while (out.endsWith(')') && (out.match(/\)/g)?.length ?? 0) > (out.match(/\(/g)?.length ?? 0)) {
    out = out.slice(0, -1).replace(/[.,;:!?]+$/, '');
  }
  return out;
}

export function extractLinks(note: { title: string; content: string }): string[] {
  const haystack = `${note.title}\n${htmlToText(note.content)}`;
  const seen = new Set<string>();
  for (const match of haystack.matchAll(URL_RE)) {
    const url = trimTrailing(match[0]);
    if (url.length > 2048) continue;
    try {
      new URL(url);
    } catch {
      continue;
    }
    seen.add(url);
    if (seen.size >= MAX_LINKS) break;
  }
  return [...seen];
}

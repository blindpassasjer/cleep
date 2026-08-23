// Allowlist HTML sanitizer for rich note content. Used both to render saved notes and to clean
// pasted HTML before it ever reaches the editor -- rebuilds the tree from scratch keeping only
// known-safe tags and, for <img>, only src/alt (src further restricted to http(s)/same-origin),
// so nothing else (script, style, event handler attributes, javascript: URLs, iframes, ...) can
// ever survive a round trip through this, regardless of what produced the original markup.
const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BR', 'DIV', 'P', 'IMG', 'SPAN']);

function isSafeImageSrc(src: string): boolean {
  return /^(https?:\/\/|\/)/i.test(src);
}

function clean(node: ChildNode): ChildNode[] {
  if (node.nodeType === Node.TEXT_NODE) {
    return [document.createTextNode(node.textContent ?? '')];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const el = node as Element;
  const children = Array.from(el.childNodes).flatMap(clean);

  if (!ALLOWED_TAGS.has(el.tagName)) {
    // Not an element we allow -- drop the wrapper but keep its (already-cleaned) content, so
    // stripping e.g. a <script> also removes its text, while stripping a stray <a> keeps the
    // link text as plain text instead of losing it.
    return el.tagName === 'SCRIPT' || el.tagName === 'STYLE' ? [] : children;
  }

  const copy = document.createElement(el.tagName.toLowerCase());
  if (el.tagName === 'IMG') {
    const src = el.getAttribute('src');
    if (src && isSafeImageSrc(src)) copy.setAttribute('src', src);
    const alt = el.getAttribute('alt');
    if (alt) copy.setAttribute('alt', alt);
  }
  children.forEach((child) => copy.appendChild(child));
  return [copy];
}

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const container = document.createElement('div');
  Array.from(doc.body.childNodes)
    .flatMap(clean)
    .forEach((node) => container.appendChild(node));
  return container.innerHTML;
}

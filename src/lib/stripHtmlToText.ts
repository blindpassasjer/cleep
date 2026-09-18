/** Flattens rich-text HTML to its rendered plain text, for search/matching purposes -- unlike a
 *  raw substring match against the HTML string, this won't match text that only appears inside a
 *  tag name or attribute (e.g. the literal word "strong"). */
export function stripHtmlToText(html: string): string {
  if (!html.includes('<')) return html;
  try {
    return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
  } catch {
    return html;
  }
}

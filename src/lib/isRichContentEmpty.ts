// A contentEditable left "empty" by the user can still hold a stray <br> or empty block element
// (a well-known browser quirk), so a plain string emptiness/whitespace check on its HTML isn't
// reliable -- this checks the actual rendered text plus whether an image was inserted instead.
export function isRichContentEmpty(html: string): boolean {
  if (!html.trim()) return true;
  const container = document.createElement('div');
  container.innerHTML = html;
  if (container.querySelector('img')) return false;
  return (container.textContent ?? '').trim().length === 0;
}

import type { BlockMatch } from './findInBlocks';

const CURRENT_ROW_CLASS = 'find-current-row';

/** Locates the text node(s) spanning [start, start+length) of `root`'s rendered text and returns
 *  a Range over them -- lets the caller select/scroll to a match without ever mutating the
 *  contentEditable's own HTML (which would disturb caret state, same concern RichTextEditor's own
 *  uncontrolled-after-mount design already works around). */
function rangeForOffset(root: Node, start: number, length: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0;
    if (startNode === null && offset + len >= start) {
      startNode = node;
      startOffset = start - offset;
    }
    if (startNode !== null && offset + len >= start + length) {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(node, start + length - offset);
      return range;
    }
    offset += len;
  }
  return null;
}

/** Clears any highlight/selection left over from a previous match -- called on every navigation
 *  step and when the find bar closes. */
export function clearMatchHighlight(root: HTMLElement) {
  root.querySelectorAll(`.${CURRENT_ROW_CLASS}`).forEach((el) => el.classList.remove(CURRENT_ROW_CLASS));
  window.getSelection()?.removeAllRanges();
}

/** Scrolls (and, for a text block, selects) the given match within `root` -- the DOM subtree
 *  containing the note's BlockEditor. */
export function scrollToBlockMatch(root: HTMLElement, match: BlockMatch) {
  clearMatchHighlight(root);

  if (match.blockType === 'checklist') {
    const row = root.querySelector(`[data-flip-id="${CSS.escape(match.itemId!)}"]`);
    if (!row) return;
    row.classList.add(CURRENT_ROW_CLASS);
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }

  const blockEl = root.querySelector(`[data-block-id="${CSS.escape(match.blockId)}"]`);
  if (!blockEl) return;
  const range = rangeForOffset(blockEl, match.start, match.length);
  if (!range) return;
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  (range.startContainer.parentElement ?? blockEl).scrollIntoView({ block: 'center', behavior: 'smooth' });
}

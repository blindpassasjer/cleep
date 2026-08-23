import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

// Below this container width, notes get a comfortable single/double-column layout (matching the
// old CSS grid's mobile breakpoint) instead of the tighter desktop packing.
const MOBILE_CONTAINER_WIDTH = 700;

/**
 * Positions note cards the way Google Keep does: fixed column width, but each card keeps its own
 * natural height and packs into whichever column is currently shortest (true masonry, not a CSS
 * grid where every card in a row gets stretched to match its tallest neighbor).
 *
 * Deliberately bypasses React state for the actual positioning -- driving width/transform/height
 * off state would take an extra render (and repaint) to correct itself once the *real* container
 * width is known, and since card height depends on width (text rewraps), that stale first pass
 * would measure the wrong heights entirely. Setting styles directly during layout, synchronously,
 * means every repack works off accurate measurements the first time.
 */
export function useMasonryLayout<T extends { id: string }>(items: T[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  const repack = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerWidth = container.clientWidth;
    if (containerWidth <= 0) return;

    const mobile = containerWidth < MOBILE_CONTAINER_WIDTH;
    const gap = mobile ? 13.6 : 17.6; // 0.85rem / 1.1rem at the default 16px root
    const minColumnWidth = mobile ? 260 : 230;

    const columnCount = Math.max(1, Math.floor((containerWidth + gap) / (minColumnWidth + gap)));
    const columnWidth = (containerWidth - gap * (columnCount - 1)) / columnCount;

    // Column width has to land on every card before any height is measured below -- a card's
    // height depends on how its text wraps at that width, so measuring first would just measure
    // whatever width happened to be left over from the previous layout (or none at all).
    for (const item of items) {
      const el = cardRefs.current.get(item.id);
      if (el) el.style.width = `${columnWidth}px`;
    }

    const columnHeights = new Array(columnCount).fill(0);
    for (const item of items) {
      const el = cardRefs.current.get(item.id);
      const height = el?.offsetHeight ?? 0;
      let col = 0;
      for (let i = 1; i < columnCount; i++) {
        if (columnHeights[i] < columnHeights[col]) col = i;
      }
      if (el) el.style.transform = `translate(${col * (columnWidth + gap)}px, ${columnHeights[col]}px)`;
      columnHeights[col] += height + gap;
    }

    container.style.height = `${Math.max(0, (columnHeights.length ? Math.max(...columnHeights) : 0) - gap)}px`;
  }, [items]);

  useLayoutEffect(() => {
    repack();
  }, [repack]);

  // Catches every other reason a card's size can change after that initial pack -- an inline
  // image finishing a late load, a note's content/labels/attachments changing, the window (or the
  // sidebar drawer) resizing the container -- without needing each of those wired in individually.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => repack());
    observer.observe(container);
    cardRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [repack]);

  return { containerRef, setCardRef };
}

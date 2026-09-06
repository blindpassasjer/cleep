import { useLayoutEffect, useRef } from 'react';

/**
 * FLIP animation for a reorderable list: give each row a `data-flip-id` and pass the current
 * order of those ids. Whenever the order changes, every row that moved slides from its old
 * position to its new one (via the Web Animations API, so there's no transition class to toggle).
 *
 * Used by the checklist (ChecklistEditor and the NoteCard preview), where ticking an item drops
 * it to the bottom of the list and unticking it lifts it back to where it was.
 */
export function useFlipReorder(
  containerRef: React.RefObject<HTMLElement | null>,
  order: string[],
  durationMs = 240,
) {
  const prevTops = useRef<Map<string, number>>(new Map());
  const orderKey = order.join('\n');

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rows = container.querySelectorAll<HTMLElement>('[data-flip-id]');
    const nextTops = new Map<string, number>();
    // Measure each row relative to the container, not the viewport -- otherwise a card that just
    // shifts position in the masonry grid (because some *other* note changed height) would make
    // every row here register a delta and slide, even though nothing in this list reordered.
    const containerTop = container.getBoundingClientRect().top;

    rows.forEach((row) => {
      const id = row.dataset.flipId;
      if (!id) return;
      const top = row.getBoundingClientRect().top - containerTop;
      nextTops.set(id, top);

      const prev = prevTops.current.get(id);
      if (prev !== undefined && !reduceMotion) {
        const delta = prev - top;
        if (Math.abs(delta) > 1) {
          row.animate(
            [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
            { duration: durationMs, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
          );
        }
      }
    });

    prevTops.current = nextTops;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- orderKey is the stable projection of `order`
  }, [orderKey, durationMs]);
}

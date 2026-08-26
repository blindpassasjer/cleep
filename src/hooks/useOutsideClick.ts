import { useEffect } from 'react';
import type { RefObject } from 'react';

/** Closes an open popover/panel when the user clicks outside every given ref or presses Escape.
 * Accepts multiple refs so a toggle button and its panel can be excluded even when they're DOM
 * siblings rather than nested under one wrapper (e.g. a footer button and an inline panel below it). */
export function useOutsideClick(
  refs: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
  active: boolean,
  onOutside: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const list = Array.isArray(refs) ? refs : [refs];
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (list.every((r) => r.current && !r.current.contains(target))) onOutside();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOutside();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onOutside/refs are typically fresh each render (refs array is often an inline literal); re-subscribing on active is what matters
  }, [active]);
}

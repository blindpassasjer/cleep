import { flushSync } from 'react-dom';

type ViewTransition = { finished: Promise<void> };
type DocumentWithViewTransitions = Document & {
  startViewTransition?: (callback: () => void) => ViewTransition;
};

/**
 * Runs a state update through the View Transitions API when the browser supports it, so the
 * before/after DOM (e.g. the sidebar rail morphing into a drawer) cross-fades and resizes smoothly
 * instead of snapping. Falls back to a plain synchronous update everywhere else (Firefox, Safari
 * <18, or tests) -- same behavior as before this existed, so there's nothing to feature-detect at
 * the call site.
 */
export function withViewTransition(update: () => void) {
  const doc = document as DocumentWithViewTransitions;
  if (typeof doc.startViewTransition !== 'function') {
    update();
    return;
  }
  // The transition needs the DOM already mutated by the time its callback returns, but React
  // batches state updates asynchronously -- flushSync forces this particular update to commit
  // synchronously so the browser captures the real "after" snapshot, not the stale "before" one.
  doc.startViewTransition(() => flushSync(update));
}

/**
 * Same as withViewTransition, but also gives `gridEl` a view-transition-name for the duration of
 * the transition, so the notes grid cross-fades as its own group when switching between views
 * (notes/archive/trash). Sidebar toggling uses plain withViewTransition instead, so the grid isn't
 * given a name there and stays static rather than re-animating just because its available width
 * changed.
 */
export function withGridViewTransition(gridEl: HTMLElement | null, update: () => void) {
  const doc = document as DocumentWithViewTransitions;
  if (typeof doc.startViewTransition !== 'function' || !gridEl) {
    update();
    return;
  }
  gridEl.style.viewTransitionName = 'notes-grid';
  const transition = doc.startViewTransition(() => flushSync(update));
  transition.finished.finally(() => {
    gridEl.style.viewTransitionName = '';
  });
}

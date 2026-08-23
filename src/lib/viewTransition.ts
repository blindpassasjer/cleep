import { flushSync } from 'react-dom';

type ViewTransition = { finished: Promise<void> };
type DocumentWithViewTransitions = Document & {
  startViewTransition?: (callback: () => void) => ViewTransition;
};

/**
 * Runs a state update through the View Transitions API when the browser supports it, giving
 * `gridEl` a view-transition-name for the duration so the notes grid cross-fades as its own group
 * when switching between views (notes/archive/trash/a collection) instead of snapping. Falls back
 * to a plain synchronous update everywhere else (Firefox, Safari <18, or tests) -- same behavior
 * as before this existed, so there's nothing to feature-detect at the call site.
 *
 * Not used for the sidebar's own collapse/expand -- that's a plain CSS width transition instead
 * (see .sidebar), since the API's image-scale-based interpolation reads as a different animation
 * shrinking vs. growing, where a CSS transition plays identically in both directions.
 */
export function withGridViewTransition(gridEl: HTMLElement | null, update: () => void) {
  const doc = document as DocumentWithViewTransitions;
  if (typeof doc.startViewTransition !== 'function' || !gridEl) {
    update();
    return;
  }
  gridEl.style.viewTransitionName = 'notes-grid';
  // The transition needs the DOM already mutated by the time its callback returns, but React
  // batches state updates asynchronously -- flushSync forces this particular update to commit
  // synchronously so the browser captures the real "after" snapshot, not the stale "before" one.
  const transition = doc.startViewTransition(() => flushSync(update));
  transition.finished.finally(() => {
    gridEl.style.viewTransitionName = '';
  });
}

import { flushSync } from 'react-dom';

type DocumentWithViewTransitions = Document & {
  startViewTransition?: (callback: () => void) => unknown;
};

/**
 * Runs a state update through the View Transitions API when the browser supports it, so the
 * before/after DOM (e.g. the sidebar rail morphing into a drawer, or the notes grid swapping to a
 * different view) cross-fades and resizes smoothly instead of snapping. Falls back to a plain
 * synchronous update everywhere else (Firefox, Safari <18, or tests) -- same behavior as before
 * this existed, so there's nothing to feature-detect at the call site.
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

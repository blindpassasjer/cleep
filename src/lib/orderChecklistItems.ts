import type { ChecklistItem } from '../types';

/**
 * Display order for a checklist: unchecked items first, then checked ones, each group keeping its
 * stored (canonical) order. Ticking an item moves it to the bottom; unticking returns it to its
 * original slot among the unchecked items. The stored `items` array is never reordered -- this is
 * purely a view transform -- so the "goes back where it was" behavior falls out for free.
 */
export function orderChecklistItems(items: ChecklistItem[]): ChecklistItem[] {
  const unchecked = items.filter((item) => !item.checked);
  const checked = items.filter((item) => item.checked);
  return unchecked.concat(checked);
}

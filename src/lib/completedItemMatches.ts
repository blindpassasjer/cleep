import type { ChecklistItem } from '../types';

/**
 * Completed items in the same checklist whose text matches what the user is currently typing into a
 * new row -- so a grocery list that already has "tomatoes 🍅 8x" ticked off can offer to bring it
 * back when you start typing "toma" instead of making you retype (and duplicate) it.
 *
 * Match is a case-insensitive substring on the trimmed query; needs at least two characters so a
 * single keystroke doesn't flood the row with suggestions.
 */
export function completedItemMatches(
  items: ChecklistItem[],
  query: string,
  limit = 4,
): ChecklistItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return items
    .filter((item) => item.checked && item.text.toLowerCase().includes(q))
    .slice(0, limit);
}

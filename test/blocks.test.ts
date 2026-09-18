import { describe, it, expect } from 'vitest';
import { parseBlocks, blocksFromLegacy, legacyFromBlocks, effectiveBlocks } from '../server/lib/blocks.js';

describe('parseBlocks', () => {
  it('returns undefined for a non-array', () => {
    expect(parseBlocks('nope')).toBeUndefined();
    expect(parseBlocks(null)).toBeUndefined();
  });

  it('keeps well-formed text and checklist blocks', () => {
    const blocks = parseBlocks([
      { id: 't1', type: 'text', html: '<b>hi</b>' },
      { id: 'c1', type: 'checklist', items: [{ id: 'i1', text: 'milk', checked: false }] },
    ]);
    expect(blocks).toEqual([
      { id: 't1', type: 'text', html: '<b>hi</b>' },
      { id: 'c1', type: 'checklist', items: [{ id: 'i1', text: 'milk', checked: false }] },
    ]);
  });

  it('drops malformed entries instead of rejecting the whole array', () => {
    const blocks = parseBlocks([
      { id: 't1', type: 'text', html: 'ok' },
      { id: '', type: 'text', html: 'no id' },
      { type: 'text', html: 'missing id field' },
      { id: 't2', type: 'bogus', html: 'unknown type' },
      'not an object',
      { id: 't1', type: 'text', html: 'duplicate id' },
    ]);
    expect(blocks).toEqual([{ id: 't1', type: 'text', html: 'ok' }]);
  });

  it('caps a checklist block to at most 300 items', () => {
    const items = Array.from({ length: 400 }, (_, i) => ({ id: `i${i}`, text: `item ${i}`, checked: false }));
    const [block] = parseBlocks([{ id: 'c1', type: 'checklist', items }])!;
    expect(block.type).toBe('checklist');
    expect((block as { items: unknown[] }).items).toHaveLength(300);
  });

  it('falls back to a single block when the total payload is oversized', () => {
    const huge = Array.from({ length: 200 }, (_, i) => ({ id: `t${i}`, type: 'text', html: 'x'.repeat(20000) }));
    const blocks = parseBlocks(huge)!;
    expect(blocks).toHaveLength(1);
  });
});

describe('blocksFromLegacy / legacyFromBlocks round-trip', () => {
  it('wraps a plain-text legacy note into one text block', () => {
    const blocks = blocksFromLegacy({ content: '<p>hello</p>', items: [], isChecklist: false });
    expect(blocks).toEqual([{ id: expect.any(String), type: 'text', html: '<p>hello</p>' }]);
    expect(legacyFromBlocks(blocks)).toEqual({ content: '<p>hello</p>', items: [], isChecklist: false });
  });

  it('wraps a legacy checklist note into one checklist block, exactly reversible', () => {
    const items = [{ id: 'i1', text: 'eggs', checked: true }];
    const blocks = blocksFromLegacy({ content: '', items, isChecklist: true });
    expect(blocks).toEqual([{ id: expect.any(String), type: 'checklist', items }]);
    expect(legacyFromBlocks(blocks)).toEqual({ content: '', items, isChecklist: true });
  });

  it('degrades a multi-block note by concatenation rather than throwing', () => {
    const blocks = [
      { id: 't1', type: 'text' as const, html: 'para one' },
      { id: 'c1', type: 'checklist' as const, items: [{ id: 'i1', text: 'buy milk', checked: false }] },
      { id: 't2', type: 'text' as const, html: 'para two' },
    ];
    const legacy = legacyFromBlocks(blocks);
    expect(legacy.isChecklist).toBe(false);
    expect(legacy.content).toContain('para one');
    expect(legacy.content).toContain('para two');
    expect(legacy.items).toEqual([{ id: 'i1', text: 'buy milk', checked: false }]);
  });
});

describe('effectiveBlocks', () => {
  it('returns the stored blocks when present', () => {
    const stored = [{ id: 't1', type: 'text' as const, html: 'stored' }];
    expect(effectiveBlocks({ blocks: stored, content: 'legacy', items: [], isChecklist: false })).toBe(stored);
  });

  it('derives from legacy columns when blocks is empty (pre-backfill row)', () => {
    const result = effectiveBlocks({ blocks: [], content: 'legacy body', items: [], isChecklist: false });
    expect(result).toEqual([{ id: expect.any(String), type: 'text', html: 'legacy body' }]);
  });
});

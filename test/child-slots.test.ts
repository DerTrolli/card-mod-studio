/**
 * Containers at any depth (v1.0): which children a container has, and that
 * a change deep inside lands in exactly that card.
 */
import { describe, it, expect } from 'vitest';
import { childSlots, withChild, hasChildSlots } from '../src/utils/child-slots.js';
import type { CardModCardConfig } from '../src/types/index.js';

const cfg = (x: unknown) => x as CardModCardConfig;

describe('child slots', () => {
  it('stacks and grids: one slot per card (non-objects skipped, indexes kept)', () => {
    const s = cfg({ type: 'vertical-stack', cards: [{ type: 'tile' }, 'junk', { type: 'gauge' }] });
    expect(childSlots(s)!.map((c) => c.slot)).toEqual([0, 2]);
  });

  it('conditional: its card; entity-filter: its card, or HA\'s default entities card', () => {
    expect(childSlots(cfg({ type: 'conditional', conditions: [], card: { type: 'tile' } }))).toEqual([
      { slot: 'card', config: { type: 'tile' } },
    ]);
    expect(childSlots(cfg({ type: 'conditional', conditions: [] }))).toEqual([]);
    expect(childSlots(cfg({ type: 'entity-filter', entities: ['light.a'] }))).toEqual([
      { slot: 'card', config: { type: 'entities' }, implicit: true },
    ]);
    expect(childSlots(cfg({ type: 'tile' }))).toBeNull();
    expect(hasChildSlots('sections')).toBe(false);
  });

  it('withChild replaces only that child, without touching the original', () => {
    const s = cfg({ type: 'grid', cards: [{ type: 'tile' }, { type: 'gauge' }], columns: 2 });
    const next = withChild(s, 1, cfg({ type: 'gauge', card_mod: { style: 'x' } }));
    expect((next as unknown as { cards: unknown[] }).cards[1]).toEqual({ type: 'gauge', card_mod: { style: 'x' } });
    expect((s as unknown as { cards: unknown[] }).cards[1]).toEqual({ type: 'gauge' });
    expect((next as unknown as { columns: number }).columns).toBe(2);
    expect(withChild(cfg({ type: 'conditional', card: { type: 'tile' } }), 'card', cfg({ type: 'tile', uix: {} }))).toEqual({
      type: 'conditional',
      card: { type: 'tile', uix: {} },
    });
  });

  it('three levels deep: folding back up changes exactly one card', () => {
    const root = cfg({
      type: 'vertical-stack',
      cards: [
        { type: 'tile', entity: 'light.a' },
        { type: 'horizontal-stack', cards: [{ type: 'conditional', card: { type: 'gauge' } }, { type: 'tile' }] },
      ],
    });
    const mid = childSlots(root)![1].config;
    const cond = childSlots(mid)![0].config;
    const gauge = childSlots(cond)![0].config;
    const styledGauge = cfg({ ...(gauge as object), card_mod: { style: 'ha-card { color: red; }' } });
    const out = withChild(root, 1, withChild(mid, 0, withChild(cond, 'card', styledGauge)));
    expect(out).toEqual({
      type: 'vertical-stack',
      cards: [
        { type: 'tile', entity: 'light.a' },
        {
          type: 'horizontal-stack',
          cards: [{ type: 'conditional', card: { type: 'gauge', card_mod: { style: 'ha-card { color: red; }' } } }, { type: 'tile' }],
        },
      ],
    });
  });
});

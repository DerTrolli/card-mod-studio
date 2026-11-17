/**
 * child-slots.ts — where a container keeps the cards inside it (v0.12).
 *
 * - vertical-stack / horizontal-stack / grid: `cards: [ … ]`, one slot per
 *   entry (its index);
 * - conditional: `card: { … }`, one slot `'card'`;
 * - entity-filter: `card: { … }` too — optional in Home Assistant, where it
 *   defaults to an entities card. When it's absent the slot still exists (as
 *   `{ type: 'entities' }`), and styling it writes that `card:` out.
 *
 * Each child is a complete card config whose own `card_mod:` / `uix:` both
 * engines apply wherever the card renders, so a container — at any depth —
 * styles its children by writing into them. `sections` aren't edited through
 * the card dialog and have no slots here.
 */
import type { CardModCardConfig } from '../types/index.js';

export type ChildSlot = number | 'card';

export interface ChildEntry {
  slot: ChildSlot;
  config: CardModCardConfig;
  /** entity-filter without a `card:` — the default HA would render. */
  implicit?: boolean;
}

const LIST_TYPES = new Set(['vertical-stack', 'horizontal-stack', 'grid']);
const SINGLE_TYPES = new Set(['conditional', 'entity-filter']);

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Container types whose children the Studio offers sections for. */
export function hasChildSlots(type: unknown): boolean {
  return typeof type === 'string' && (LIST_TYPES.has(type) || SINGLE_TYPES.has(type));
}

/** The children of a container, or null when `config` isn't one. */
export function childSlots(config: CardModCardConfig | null | undefined): ChildEntry[] | null {
  const c = config as unknown as Record<string, unknown> | undefined;
  const type = c?.type;
  if (!c || !hasChildSlots(type)) return null;
  if (LIST_TYPES.has(type as string)) {
    const cards = Array.isArray(c.cards) ? c.cards : [];
    return cards.flatMap((card, i) => (isObj(card) ? [{ slot: i, config: card as unknown as CardModCardConfig }] : []));
  }
  if (isObj(c.card)) return [{ slot: 'card', config: c.card as unknown as CardModCardConfig }];
  if (type === 'entity-filter') {
    return [{ slot: 'card', config: { type: 'entities' } as unknown as CardModCardConfig, implicit: true }];
  }
  return [];
}

/** `config` with the child at `slot` replaced (a new object; `config` is untouched). */
export function withChild(config: CardModCardConfig, slot: ChildSlot, child: CardModCardConfig): CardModCardConfig {
  const c = config as unknown as Record<string, unknown>;
  if (slot === 'card') return { ...c, card: child } as unknown as CardModCardConfig;
  const cards = Array.isArray(c.cards) ? c.cards : [];
  if (!isObj(cards[slot])) return config;
  return { ...c, cards: cards.map((x, i) => (i === slot ? child : x)) } as unknown as CardModCardConfig;
}

import { describe, it, expect } from 'vitest';
import {
  isUixOnlyStyle,
  usesUixOnlyFeatures,
  resolveStyle,
  isUixOnlyRowStyle,
  hasUixOnlyRow,
} from '../src/utils/style-compat.js';
import type { CardModCardConfig, EntitiesCardRow } from '../src/types/index.js';

describe('isUixOnlyStyle', () => {
  it('is false when there is no uix block', () => {
    const config: CardModCardConfig = { type: 'button' };
    expect(isUixOnlyStyle(config)).toBe(false);
  });

  it('is false when card_mod.style is also present', () => {
    const config: CardModCardConfig = {
      type: 'button',
      uix: { style: 'ha-card { color: red; }' },
      card_mod: { style: 'ha-card { color: red; }' },
    };
    expect(isUixOnlyStyle(config)).toBe(false);
  });

  it('is true when only uix.style is present', () => {
    const config: CardModCardConfig = {
      type: 'button',
      uix: { style: 'ha-card { color: red; }' },
    };
    expect(isUixOnlyStyle(config)).toBe(true);
  });

  it('is false when uix has no style (e.g. only debug/macros)', () => {
    const config: CardModCardConfig = { type: 'button', uix: { debug: true } };
    expect(isUixOnlyStyle(config)).toBe(false);
  });

  it('is false when uix.style is an explicit empty string (no real content)', () => {
    const config: CardModCardConfig = { type: 'button', uix: { style: '' } };
    expect(isUixOnlyStyle(config)).toBe(false);
  });

  it('is false when uix.style is an empty dict (no real content)', () => {
    const config: CardModCardConfig = { type: 'button', uix: { style: {} } };
    expect(isUixOnlyStyle(config)).toBe(false);
  });

  it('is true when uix.style has content and card_mod.style is an empty dict (no real fallback)', () => {
    const config: CardModCardConfig = {
      type: 'button',
      uix: { style: 'ha-card { color: red; }' },
      card_mod: { style: {} },
    };
    expect(isUixOnlyStyle(config)).toBe(true);
  });
});

describe('resolveStyle', () => {
  it('returns undefined when neither key is set', () => {
    expect(resolveStyle({})).toBeUndefined();
  });

  it('prefers uix.style when it has real content', () => {
    expect(resolveStyle({ uix: { style: 'a' }, card_mod: { style: 'b' } })).toBe('a');
  });

  it('falls back to card_mod.style when uix.style is an explicit empty string', () => {
    expect(resolveStyle({ uix: { style: '' }, card_mod: { style: 'b' } })).toBe('b');
  });

  it('falls back to card_mod.style when uix.style is an empty dict', () => {
    expect(resolveStyle({ uix: { style: {} }, card_mod: { style: 'b' } })).toBe('b');
  });

  it('falls back to card_mod.style when uix is absent', () => {
    expect(resolveStyle({ card_mod: { style: 'b' } })).toBe('b');
  });
});

describe('isUixOnlyRowStyle / hasUixOnlyRow', () => {
  it('isUixOnlyRowStyle is true for a row with only uix.style', () => {
    const row: EntitiesCardRow = { entity: 'light.x', uix: { style: 'a' } };
    expect(isUixOnlyRowStyle(row)).toBe(true);
  });

  it('isUixOnlyRowStyle is false for a row with a card_mod fallback', () => {
    const row: EntitiesCardRow = { entity: 'light.x', uix: { style: 'a' }, card_mod: { style: 'b' } };
    expect(isUixOnlyRowStyle(row)).toBe(false);
  });

  it('hasUixOnlyRow is false when the card has no entities', () => {
    expect(hasUixOnlyRow({ type: 'button' })).toBe(false);
  });

  it('hasUixOnlyRow is false when no row is uix-only, even if the card is entities-type', () => {
    const config = {
      type: 'entities',
      entities: [{ entity: 'light.x', card_mod: { style: 'a' } }],
    } as unknown as CardModCardConfig;
    expect(hasUixOnlyRow(config)).toBe(false);
  });

  it('hasUixOnlyRow is true when at least one row is uix-only', () => {
    const config = {
      type: 'entities',
      entities: [
        { entity: 'light.x', card_mod: { style: 'a' } },
        { entity: 'light.y', uix: { style: 'b' } },
      ],
    } as unknown as CardModCardConfig;
    expect(hasUixOnlyRow(config)).toBe(true);
  });

  it('isUixOnlyRowStyle is false for a row with uix-only style but no entity (fix button couldn\'t reach it)', () => {
    const row = { uix: { style: 'a' } } as unknown as EntitiesCardRow;
    expect(isUixOnlyRowStyle(row)).toBe(false);
  });

  it('hasUixOnlyRow returns false instead of throwing when entities is not an array', () => {
    const config = { type: 'entities', entities: 'not-an-array' } as unknown as CardModCardConfig;
    expect(() => hasUixOnlyRow(config)).not.toThrow();
    expect(hasUixOnlyRow(config)).toBe(false);
  });

  it('hasUixOnlyRow tolerates non-object entries in entities (e.g. bare entity-id strings)', () => {
    const config = {
      type: 'entities',
      entities: ['light.x', { entity: 'light.y', uix: { style: 'b' } }],
    } as unknown as CardModCardConfig;
    expect(() => hasUixOnlyRow(config)).not.toThrow();
    expect(hasUixOnlyRow(config)).toBe(true);
  });
});

describe('usesUixOnlyFeatures', () => {
  it('is false with no uix block', () => {
    expect(usesUixOnlyFeatures({ type: 'button' })).toBe(false);
  });

  it('is false with plain uix.style only', () => {
    const config: CardModCardConfig = { type: 'button', uix: { style: 'ha-card { color: red; }' } };
    expect(usesUixOnlyFeatures(config)).toBe(false);
  });

  it('is true when macros are defined', () => {
    const config: CardModCardConfig = { type: 'button', uix: { macros: { a: 1 } } };
    expect(usesUixOnlyFeatures(config)).toBe(true);
  });

  it('is true when billets are defined', () => {
    const config: CardModCardConfig = { type: 'button', uix: { billets: { a: 1 } } };
    expect(usesUixOnlyFeatures(config)).toBe(true);
  });
});

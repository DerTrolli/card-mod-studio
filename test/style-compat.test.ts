import { describe, it, expect } from 'vitest';
import { isUixOnlyStyle, usesUixOnlyFeatures } from '../src/utils/style-compat.js';
import type { CardModCardConfig } from '../src/types/index.js';

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

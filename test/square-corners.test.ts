/**
 * Border & Radius → Square corners (v1.0). `radiusPx: 0` keeps meaning
 * "not set" (older presets and pasted text read unchanged); the optional
 * `squareCorners` writes `border-radius: 0px`.
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState, DEFAULT_BORDER, migrateStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { findAdvancedCssConflicts } from '../src/utils/style-conflicts.js';

const load = (css: string, type = 'tile') => mapToStudioState(parseStyleValue(css), type);
const base = load('');

describe('Square corners', () => {
  it('writes border-radius: 0px, and reads it back', () => {
    const state = { ...base, border: { ...DEFAULT_BORDER, enabled: true, squareCorners: true, radiusPx: 0 } };
    const css = generateCss(state, 'tile');
    expect(css).toContain('border-radius: 0px;');
    expect(load(css).border).toMatchObject({ enabled: true, squareCorners: true });
  });

  it('wins over a radius left in the state', () => {
    const state = { ...base, border: { ...DEFAULT_BORDER, enabled: true, squareCorners: true, radiusPx: 20 } };
    const css = generateCss(state, 'tile');
    expect(css).toContain('border-radius: 0px;');
    expect(css).not.toContain('20px');
  });

  it('radius 0 without it still writes no radius (not set)', () => {
    const state = { ...base, border: { ...DEFAULT_BORDER, enabled: true, radiusPx: 0, borderWidth: 2 } };
    expect(generateCss(state, 'tile')).not.toContain('border-radius');
  });

  it('an old stored state without the field is unchanged; only a real true is kept', () => {
    const old = migrateStudioState({ border: { enabled: true, radiusPx: 0, borderWidth: 2, borderColor: 'red' } });
    expect(old.border.squareCorners).toBeUndefined();
    expect(old.border.radiusPx).toBe(0);
    const junk = migrateStudioState({ border: { enabled: true, radiusPx: 8, squareCorners: 'yes' } });
    expect(junk.border.squareCorners).toBeUndefined();
    expect(junk.border.radiusPx).toBe(8);
    const sq = migrateStudioState({ border: { enabled: true, radiusPx: 8, squareCorners: true } });
    expect(sq.border).toMatchObject({ squareCorners: true, radiusPx: 0 });
  });

  it('a hand-written radius counts as overriding only when the module writes one', () => {
    const adv = 'ha-card { border-radius: 30px; }';
    const off = { ...base, border: { ...DEFAULT_BORDER, enabled: true, radiusPx: 0, borderWidth: 2 } };
    const on = { ...base, border: { ...DEFAULT_BORDER, enabled: true, squareCorners: true, radiusPx: 0 } };
    expect(findAdvancedCssConflicts(adv, off).border).toBeUndefined();
    expect(findAdvancedCssConflicts(adv, on).border).toBeDefined();
  });
});

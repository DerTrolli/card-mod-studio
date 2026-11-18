/**
 * Tile Features (v1.0): what is written, that it reads back into the module,
 * and what stays the user's.
 */
import { describe, it, expect } from 'vitest';
import { generateCss, featuresBlock } from '../src/generator/css-generator.js';
import { mapToStudioState, migrateStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { capsFor } from '../src/utils/card-caps.js';
import { filterPresetStateForCardType } from '../src/utils/preset-caps.js';

const read = (css: string, type = 'tile') => mapToStudioState(parseStyleValue(css), type);

describe('Features module', () => {
  it('writes only what was set, on hui-card-features, the colour !important', () => {
    expect(featuresBlock({ enabled: true, heightPx: 0, radiusPx: -1, color: '' })).toBe('');
    expect(featuresBlock({ enabled: false, heightPx: 60, radiusPx: 4, color: 'red' })).toBe('');
    expect(featuresBlock({ enabled: true, heightPx: 60, radiusPx: 0, color: 'var(--red-color)' })).toBe(
      'hui-card-features {\n  --feature-height: 60px;\n  --feature-border-radius: 0px;\n  --feature-color: var(--red-color) !important;\n}',
    );
  });

  it('round-trips through generate → parse on a tile, nothing left in Advanced', () => {
    const s = migrateStudioState({});
    s.features = { enabled: true, heightPx: 56, radiusPx: 2, color: '#ff0000' };
    const back = read(generateCss(s, 'tile'));
    expect(back.features).toEqual(s.features);
    expect(back.advanced.rawCss.trim()).toBe('');
  });

  it("a colour without !important (does nothing on a tile) stays the user's", () => {
    const back = read('hui-card-features {\n  --feature-color: red;\n  --feature-height: 50px;\n}');
    expect(back.features).toMatchObject({ enabled: true, heightPx: 50, color: '' });
    expect(back.advanced.rawCss).toContain('--feature-color: red');
  });

  it('only tile cards show it, adopt it, and keep it from a preset', () => {
    expect(capsFor('tile').features).toBe(true);
    expect(capsFor('button').features).toBe(false);
    expect(read('hui-card-features {\n  --feature-height: 50px;\n}', 'thermostat').features?.enabled).toBe(false);
    const s = migrateStudioState({ features: { enabled: true, heightPx: 50, radiusPx: -1, color: '' } });
    expect(filterPresetStateForCardType(s, 'button').features?.enabled).toBe(false);
    expect(filterPresetStateForCardType(s, 'tile').features?.enabled).toBe(true);
  });

  it('migration checks every field', () => {
    const m = migrateStudioState({ features: { enabled: 'yes', heightPx: 9999, radiusPx: -5, color: 'red;x:y' } }).features!;
    expect(m).toEqual({ enabled: false, heightPx: 0, radiusPx: -1, color: '' });
    expect(migrateStudioState({}).features).toEqual({ enabled: false, heightPx: 0, radiusPx: -1, color: '' });
  });
});

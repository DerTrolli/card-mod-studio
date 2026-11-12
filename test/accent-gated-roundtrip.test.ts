/**
 * Review fix 4 — an Accent style on a card whose config hides the Accent
 * control is kept (re-emitted unchanged), like every other hidden module.
 * Measured on the rigs (Mushroom 5.2.3, card-mod 4.2.1 + UIX 9.0.0): with
 * `icon_color`, `icon_type: none` / `hide_icon` or no slider, the card's
 * computed colours are identical with and without the `--rgb-state-*`
 * declaration, so keeping it never changes the look.
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { capsFor } from '../src/utils/card-caps.js';
import { filterPresetStateForCardType } from '../src/utils/preset-caps.js';
import { MUSHROOM_CLASSIC_TYPES } from '../src/utils/profiles/mushroom.js';
import { DEFAULT_THRESHOLD } from '../src/types/index.js';
import type { StudioState, ThresholdModuleState } from '../src/types/index.js';

const EMPTY = mapToStudioState(parseStyleValue(''));
const key = (t: string) => `custom:mushroom-${t}-card`;
const parse = (css: string, k: string) => mapToStudioState(parseStyleValue(css), k);
const withState = (patch: Partial<StudioState>): StudioState => ({ ...EMPTY, ...patch });
const switchThreshold = (properties: ThresholdModuleState['properties']): ThresholdModuleState => ({
  ...DEFAULT_THRESHOLD,
  enabled: true,
  entityId: 'sensor.temp',
  properties,
  valueMode: 'switch',
  rules: [
    { id: '0', operator: '>', value: 30, color: '#ee1111' },
    { id: '1', operator: '>', value: 20, color: '#ffaa00' },
  ],
  defaultColor: '#00aa44',
});
const ACCENT = { enabled: true, mode: 'plain' as const, color: '#ee1111' };

/** Every gate the profile has, as card configs that trigger it. */
const GATED: Array<[string, (t: string) => Record<string, unknown>]> = [
  ['icon_color', (t) => ({ type: key(t), entity: 'x.y', icon_color: 'blue' })],
  ['icon_type: none', (t) => ({ type: key(t), entity: 'x.y', icon_type: 'none' })],
  ['hide_icon', (t) => ({ type: key(t), entity: 'x.y', hide_icon: true })],
];

describe('Accent on a config-gated Mushroom card survives load -> unrelated edit -> save', () => {
  let cases = 0;
  for (const t of MUSHROOM_CLASSIC_TYPES) {
    for (const [name, cfgOf] of GATED) {
      const cfg = cfgOf(t);
      if (capsFor(key(t), cfg).modules.accentColor) continue; // this gate does not hide Accent on this type
      it(`${t} + ${name}`, () => {
        cases++;
        const original = generateCss(withState({ accentColor: { ...EMPTY.accentColor, ...ACCENT } }), key(t));
        const loaded = parse(original, key(t));
        expect(loaded.accentColor).toMatchObject(ACCENT);
        expect(loaded.advanced.rawCss).toBe('');
        // saved with no edit at all: byte-identical, never null
        expect(generateCss(loaded, key(t), { config: cfg })).toBe(original);
        // an unrelated edit (Font): the Accent lines are untouched
        const edited = { ...loaded, font: { ...EMPTY.font, enabled: true, fontSize: 22 } };
        const css = generateCss(edited, key(t), { config: cfg });
        for (const line of original.split('\n')) expect(css).toContain(line);
        expect(css).toContain('--card-primary-font-size: 22px;');
        // the option goes away: the control is back and holds the same value
        const { icon_color: _a, icon_type: _b, hide_icon: _c, ...rest } = cfg;
        expect(capsFor(key(t), rest).modules.accentColor).toBe(true);
        expect(parse(css, key(t)).accentColor).toMatchObject(ACCENT);
      });
    }
  }
  it('the matrix is not empty (every classic type is gated by icon_color)', () => {
    expect(cases).toBeGreaterThanOrEqual(MUSHROOM_CLASSIC_TYPES.length);
  });

  it('slider-less light / humidifier with the icon off: Accent kept', () => {
    for (const [t, accentVar] of [['light', '--rgb-state-light'], ['humidifier', '--rgb-state-humidifier']] as const) {
      const cfg = { type: key(t), entity: 'x.y', icon_type: 'none' };
      expect(capsFor(key(t), cfg).modules.accentColor).toBe(false);
      const original = `ha-card {\n  ${accentVar}: 238, 17, 17;\n}`;
      const loaded = parse(original, key(t));
      expect(loaded.accentColor).toMatchObject(ACCENT);
      expect(generateCss(loaded, key(t), { config: cfg })).toBe(original);
    }
  });

  it('a Threshold accent property is kept the same way', () => {
    const cfg = { type: key('light'), entity: 'x.y', icon_color: 'blue' };
    const threshold = switchThreshold(['accent-color']);
    const original = generateCss(withState({ threshold }), key('light'));
    expect(original).toContain('--rgb-state-light: {{ ');
    const loaded = parse(original, key('light'));
    expect(loaded.threshold.properties).toEqual(['accent-color']);
    expect(generateCss(loaded, key('light'), { config: cfg })).toBe(original);
  });
});

describe('nothing can newly write an Accent onto a gated card', () => {
  const cfg = { type: key('light'), entity: 'x.y', icon_color: 'blue' };
  it('a preset applied to it loses its Accent (and a Threshold accent property)', () => {
    const preset = withState({
      accentColor: { ...EMPTY.accentColor, ...ACCENT },
      threshold: switchThreshold(['accent-color', 'text-color']),
    });
    const applied = filterPresetStateForCardType(preset, key('light'), cfg);
    expect(applied.accentColor.enabled).toBe(false);
    expect(applied.threshold.properties).toEqual(['text-color']);
    expect(generateCss(applied, key('light'), { config: cfg })).not.toContain('--rgb-state');
  });
});

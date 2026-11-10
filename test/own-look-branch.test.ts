/**
 * Background / Border that react to a condition: while the condition is NOT
 * met the card keeps its own look. The "otherwise" branch is therefore empty
 * (a property — the browser drops `prop: ;`) or `inherit` (a custom property —
 * `--x: ;` would be a valid EMPTY value that blanks the card), never `none`
 * (an explicit "no background / no border", measured on a live HA).
 * Styles saved before that wrote `else 'none'` and must still be recognised.
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import type { StudioState } from '../src/types/index.js';

const EMPTY = mapToStudioState(parseStyleValue(''));
const parse = (css: string, k?: string) => mapToStudioState(parseStyleValue(css), k);
const withState = (patch: Partial<StudioState>): StudioState => ({ ...EMPTY, ...patch });

const BTN = 'custom:bubble-card/button';
const CHIPS = 'custom:mushroom-chips-card';

function roundTrip(state: StudioState, k: string) {
  const css = generateCss(state, k);
  const back = parse(css, k);
  expect(back.advanced.rawCss, `Advanced CSS left over:\n${css}`).toBe('');
  expect(generateCss(back, k)).toBe(css);
  return { css, back };
}

const bg = (applyWhen: 'on' | 'off' | 'custom', extra = {}): StudioState['background'] => ({
  ...EMPTY.background, enabled: true, type: 'solid', color1: '#ffee00', applyWhen, ...extra,
});
const border = (extra = {}): StudioState['border'] => ({
  ...EMPTY.border, enabled: true, radiusPx: 0, borderWidth: 4, borderColor: '#ff0000', widthWhen: { when: 'on' }, ...extra,
});

describe('Background — the card keeps its look while the condition is off', () => {
  it('writes an empty other branch', () => {
    expect(generateCss(withState({ background: bg('on') }), 'tile')).toBe(
      "ha-card {\n  background: {{ '#ffee00' if is_state(config.entity, 'on') else '' }};\n}",
    );
    expect(generateCss(withState({ background: bg('off') }), 'tile')).toContain(
      "if is_state(config.entity, 'off') else '' }};",
    );
    expect(generateCss(withState({ background: bg('custom', { customEntity: 'switch.x' }) }), 'tile')).toContain(
      "if is_state('switch.x', 'on') else '' }};",
    );
  });

  it('never writes none', () => {
    for (const w of ['on', 'off'] as const) {
      expect(generateCss(withState({ background: bg(w) }), 'tile')).not.toContain("'none'");
    }
  });

  it('new form round-trips byte-identically (solid, gradient, custom entity, off side)', () => {
    for (const b of [
      bg('on'),
      bg('off'),
      bg('custom', { customEntity: 'switch.x' }),
      bg('on', { type: 'gradient', color1: '#ff0000', color2: '#0000ff', angle: 45 }),
    ]) {
      const { back } = roundTrip(withState({ background: b }), 'tile');
      expect(back.background).toMatchObject({ enabled: true, applyWhen: b.applyWhen, color1: b.color1 });
    }
  });

  it('a style saved with else none is recognised (not Advanced CSS) and re-saves in the new form', () => {
    for (const [old, expected] of [
      ["{{ '#ffee00' if is_state(config.entity, 'on') else 'none' }}", 'on'],
      ["{{ '#ffee00' if is_state(config.entity, 'off') else 'none' }}", 'off'],
      ["{{ '#ffee00' if is_state('switch.x', 'on') else 'none' }}", 'custom'],
    ] as const) {
      const css = `ha-card {\n  background: ${old};\n}`;
      const back = parse(css, 'tile');
      expect(back.advanced.rawCss).toBe('');
      expect(back.background).toMatchObject({ enabled: true, applyWhen: expected, color1: '#ffee00' });
      const resaved = generateCss(back, 'tile');
      expect(resaved).toBe(css.replace("'none'", "''"));
      expect(parse(resaved, 'tile').background).toEqual(back.background);
    }
  });

  it('Mushroom chips: the variable takes inherit (an empty custom property would blank the chip)', () => {
    const { css, back } = roundTrip(withState({ background: bg('on') }), CHIPS);
    expect(css).toContain("--chip-background: {{ '#ffee00' if is_state(config.entity, 'on') else 'inherit' }};");
    expect(back.background).toMatchObject({ enabled: true, applyWhen: 'on', color1: '#ffee00' });
    // older save
    const old = parse("ha-card {\n  --chip-background: {{ '#ffee00' if is_state(config.entity, 'on') else 'none' }};\n}", CHIPS);
    expect(old.advanced.rawCss).toBe('');
    expect(old.background).toMatchObject({ enabled: true, applyWhen: 'on' });
    expect(generateCss(old, CHIPS)).toContain("else 'inherit' }};");
  });

  it('Bubble: the opacity companion rides on the condition and is claimed with it', () => {
    const { css, back } = roundTrip(withState({ background: bg('off') }), BTN);
    expect(css).toContain("background: {{ '#ffee00' if is_state(config.entity, 'off') else '' }};");
    expect(css).toContain("opacity: {{ '1' if is_state(config.entity, 'off') else '' }} !important;");
    expect(back.background).toMatchObject({ enabled: true, applyWhen: 'off' });
  });

  it('Bubble: a style saved with else none and a plain opacity companion is recognised', () => {
    const old =
      ".bubble-button-background {\n  background: {{ '#ffee00' if is_state(config.entity, 'on') else 'none' }};\n  opacity: 1 !important;\n}";
    const back = parse(old, BTN);
    expect(back.advanced.rawCss).toBe('');
    expect(back.background).toMatchObject({ enabled: true, applyWhen: 'on' });
    expect(generateCss(back, BTN)).toContain("opacity: {{ '1' if is_state(config.entity, 'on') else '' }} !important;");
  });

  it('unconditional and always-on styles are unchanged', () => {
    expect(generateCss(withState({ background: { ...bg('on'), applyWhen: 'always' } }), 'tile')).toBe(
      'ha-card {\n  background: #ffee00;\n}',
    );
    expect(generateCss(withState({ background: { ...bg('on'), applyWhen: 'always' } }), BTN)).toContain('opacity: 1 !important;');
  });
});

describe('Border — "Width otherwise" 0 means the card\'s own border', () => {
  it('writes an empty other branch (direct border)', () => {
    expect(generateCss(withState({ border: border() }), 'tile')).toBe(
      "ha-card {\n  border: {{ '4px solid #ff0000' if is_state(config.entity, 'on') else '' }};\n}",
    );
  });

  it('an explicit non-zero width keeps drawing it', () => {
    const css = generateCss(withState({ border: border({ widthOffPx: 2 }) }), 'tile');
    expect(css).toContain("else '2px solid #ff0000' }};");
    expect(roundTrip(withState({ border: border({ widthOffPx: 2 }) }), 'tile').back.border.widthOffPx).toBe(2);
  });

  it('new form round-trips byte-identically', () => {
    const { back } = roundTrip(withState({ border: border({ radiusPx: 8 }) }), 'tile');
    expect(back.border).toMatchObject({ enabled: true, borderWidth: 4, widthWhen: { when: 'on' } });
    expect(back.border.widthOffPx).toBeUndefined();
  });

  it('a style saved with else none is recognised and re-saves in the new form', () => {
    const old = "ha-card {\n  border: {{ '4px solid #ff0000' if is_state(config.entity, 'on') else 'none' }};\n}";
    const back = parse(old, 'tile');
    expect(back.advanced.rawCss).toBe('');
    expect(back.border).toMatchObject({ enabled: true, borderWidth: 4, borderColor: '#ff0000', widthWhen: { when: 'on' } });
    expect(generateCss(back, 'tile')).toBe(old.replace("'none'", "''"));
  });

  it('Mushroom chips: width AND colour fall back to inherit', () => {
    const { css, back } = roundTrip(withState({ border: border() }), CHIPS);
    expect(css).toContain("--chip-border-width: {{ '4px' if is_state(config.entity, 'on') else 'inherit' }};");
    expect(css).toContain("--chip-border-color: {{ '#ff0000' if is_state(config.entity, 'on') else 'inherit' }};");
    expect(back.border).toMatchObject({ enabled: true, borderWidth: 4, borderColor: '#ff0000', widthWhen: { when: 'on' } });
  });

  it('Mushroom chips with a value condition round-trip', () => {
    const widthWhen = { when: 'value' as const, valueEntity: 'sensor.t', valueOperator: '>' as const, valueThreshold: 5 };
    const { back } = roundTrip(withState({ border: border({ widthWhen }) }), CHIPS);
    expect(back.border.widthWhen).toEqual(widthWhen);
    expect(back.threshold.enabled).toBe(false);
  });

  it('Mushroom chips with an explicit width otherwise keep a plain colour', () => {
    const { css } = roundTrip(withState({ border: border({ widthOffPx: 1 }) }), CHIPS);
    expect(css).toContain("else '1px' }};");
    expect(css).toContain('--chip-border-color: #ff0000;');
  });

  it('Mushroom chips: an older save (else 0px, plain colour) is recognised and re-saves with inherit', () => {
    const old =
      "ha-card {\n  --chip-border-width: {{ '4px' if is_state(config.entity, 'on') else '0px' }};\n  --chip-border-color: #ff0000;\n}";
    const back = parse(old, CHIPS);
    expect(back.advanced.rawCss).toBe('');
    expect(back.border).toMatchObject({ enabled: true, borderWidth: 4, borderColor: '#ff0000' });
    expect(back.border.widthOffPx).toBeUndefined();
    expect(generateCss(back, CHIPS)).toContain("else 'inherit' }};");
  });

  it('Bubble button border (direct) uses the empty branch', () => {
    const { css } = roundTrip(withState({ border: border() }), BTN);
    expect(css).toContain("border: {{ '4px solid #ff0000' if is_state(config.entity, 'on') else '' }};");
  });

  it('an unconditional border is unchanged', () => {
    expect(generateCss(withState({ border: border({ widthWhen: undefined }) }), 'tile')).toBe(
      'ha-card {\n  border: 4px solid #ff0000;\n}',
    );
  });
});

describe('neutral false branches that stay "none"', () => {
  it('filter and animation keep none (it IS their neutral value)', () => {
    const css = generateCss(
      withState({
        filter: { ...EMPTY.filter, enabled: true, grayscale: true, grayscaleWhen: 'off' },
        animation: { ...EMPTY.animation, enabled: true, preset: 'pulse', trigger: 'on' },
      }),
      'tile',
    );
    expect(css).toContain("filter: {{ 'grayscale(100%)' if is_state(config.entity, 'off') else 'none' }};");
    expect(css).toContain("else 'none' }};");
  });
});

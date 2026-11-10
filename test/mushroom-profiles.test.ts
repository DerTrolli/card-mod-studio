/**
 * C2.2 + C2.3 — Mushroom as profile DATA (src/utils/profiles/mushroom.ts).
 *
 * Every declaration the generator writes for a Mushroom card must parse back
 * to the same Studio state, with nothing left in Advanced CSS, and re-generate
 * byte-for-byte. Variable names are the ones measured on Mushroom 5.2.3 /
 * HA 2026.11.0 (docs/research/2026-10-v0.11.md §3.3.1) — spelled out here so a
 * change to the data fails a test rather than silently moving a variable.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState, DEFAULT_THRESHOLD } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { capsFor, thresholdPropertyAllowed } from '../src/utils/card-caps.js';
import {
  getCustomCardProfile,
  profileKeyOf,
  emitKeyOf,
  registerCustomCardProfile,
  unregisterCustomCardProfile,
} from '../src/utils/custom-card-profiles.js';
import { MUSHROOM_CLASSIC_TYPES } from '../src/utils/profiles/mushroom.js';
import { findAdvancedCssConflicts } from '../src/utils/style-conflicts.js';
import { filterPresetStateForCardType } from '../src/utils/preset-caps.js';
import { mapElementToTarget } from '../src/utils/preview-map.js';
import {
  toRgbTriplet,
  fromRgbTriplet,
  accentColorsWithoutTriplet,
  thresholdColorsWithoutTriplet,
  tripletHint,
} from '../src/utils/rgb-triplet.js';
import { buildMergedStudioState, applyStudioState } from '../src/editor/studio-state.js';
import type { StudioState, ThresholdModuleState, CardModCardConfig } from '../src/types/index.js';

const EMPTY = mapToStudioState(parseStyleValue(''));
const key = (t: string) => `custom:mushroom-${t}-card`;

const parse = (css: string, k: string) => mapToStudioState(parseStyleValue(css), k);
const withState = (patch: Partial<StudioState>): StudioState => ({ ...EMPTY, ...patch });

/** generate → parse → compare module state → generate again (byte-stable). */
function roundTrip(state: StudioState, k: string) {
  const css = generateCss(state, k);
  const back = parse(css, k);
  expect(back.advanced.rawCss, `Advanced CSS left over for ${k}:\n${css}`).toBe('');
  expect(generateCss(back, k)).toBe(css);
  return { css, back };
}

const FONT = { enabled: true, fontSize: 22, fontWeight: 'bold' as const, fontFamily: 'monospace', color: '#ee1111' };
const ICON = { enabled: true, mode: 'plain' as const, color: '#112233', sizePx: 48 };
const ACCENT = { enabled: true, mode: 'plain' as const, color: '#ee1111' };

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

describe('registry (G1)', () => {
  it('registers all 18 Mushroom types from the static data module', () => {
    const types = [...MUSHROOM_CLASSIC_TYPES, 'template', 'chips', 'title', 'empty'];
    expect(types).toHaveLength(18);
    for (const t of types) expect(getCustomCardProfile(key(t)), t).toBeDefined();
    expect(MUSHROOM_CLASSIC_TYPES).toHaveLength(14);
  });

  it('Bubble card_types without a measured profile stay unprofiled and built-ins are untouched', () => {
    for (const t of ['pop-up', 'climate', 'media-player', 'horizontal-buttons-stack', 'select', 'calendar', 'empty-column', 'sub-buttons']) {
      expect(getCustomCardProfile(`custom:bubble-card/${t}`)).toBeUndefined();
    }
    expect(getCustomCardProfile('custom:bubble-card')).toBeUndefined();
    expect(capsFor('tile').custom).toBe(false);
  });

  it('claims and conflicts are derived from the emitters', () => {
    const p = getCustomCardProfile(key('light'))!;
    expect(p.claims?.map((c) => c.role)).toEqual(
      expect.arrayContaining(['fontSize', 'fontWeight', 'fontColor', 'fontFamily', 'iconSize', 'accent']),
    );
    expect(p.conflicts?.some((c) => c.module === 'accentColor' && c.props.includes('--rgb-state-light'))).toBe(true);
  });
});

describe('M-classic — the 14 state cards', () => {
  const ACCENT_VARS: Record<string, string[]> = {
    light: ['--rgb-state-light'],
    entity: ['--rgb-state-entity'],
    select: ['--rgb-state-entity'],
    cover: ['--rgb-state-cover-open', '--rgb-state-cover-closed'],
    lock: ['--rgb-state-lock-locked', '--rgb-state-lock-unlocked', '--rgb-state-lock-pending'],
    climate: ['--rgb-state-climate-heat', '--rgb-state-climate-cool', '--rgb-state-climate-heat-cool'],
    fan: ['--rgb-state-fan'],
    vacuum: ['--rgb-state-vacuum'],
  };

  it('Font writes the card-primary/secondary variables (size, weight, colour) and a plain family', () => {
    const { css } = roundTrip(withState({ font: { ...EMPTY.font, ...FONT } }), key('entity'));
    expect(css).toBe(
      [
        'ha-card {',
        '  --card-primary-font-size: 22px;',
        '  --card-secondary-font-size: 22px;',
        '  --card-primary-line-height: 31px;',
        '  --card-secondary-line-height: 29px;',
        '  --card-primary-font-weight: bold;',
        '  --card-secondary-font-weight: bold;',
        '  --card-primary-color: #ee1111;',
        '  --card-secondary-color: #ee1111;',
        '  font-family: monospace;',
        '}',
      ].join('\n'),
    );
    // not the built-in shape, which reaches nothing on Mushroom
    expect(css).not.toContain('  font-size:');
  });

  it('Font round-trips on every one of the 14 types, size/weight/colour/family exactly', () => {
    for (const t of MUSHROOM_CLASSIC_TYPES) {
      const { back } = roundTrip(withState({ font: { ...EMPTY.font, ...FONT } }), key(t));
      expect(back.font).toMatchObject(FONT);
    }
  });

  it('Icon size writes --icon-size, Accent the per-type --rgb-state-* variables as R, G, B', () => {
    const light = roundTrip(
      withState({ iconColor: { ...EMPTY.iconColor, ...ICON }, accentColor: { ...EMPTY.accentColor, ...ACCENT } }),
      key('light'),
    );
    expect(light.css).toContain('--icon-size: 48px;');
    expect(light.css).toContain('--rgb-state-light: 238, 17, 17;');
    expect(light.css).toContain('ha-state-icon {\n  color: #112233 !important;\n}');
    expect(light.back.iconColor).toMatchObject({ enabled: true, color: '#112233', sizePx: 48 });
    expect(light.back.accentColor).toMatchObject({ enabled: true, mode: 'plain', color: '#ee1111' });
  });

  it('Accent uses the variable each card type actually reads (two domains + multi-state cards)', () => {
    for (const [t, vars] of Object.entries(ACCENT_VARS)) {
      const css = generateCss(withState({ accentColor: { ...EMPTY.accentColor, ...ACCENT } }), key(t));
      for (const v of vars) expect(css, `${t} ${v}`).toContain(`${v}: 238, 17, 17;`);
      // never the built-in variables, which reach nothing on Mushroom
      expect(css).not.toContain('--accent-color');
      expect(css).not.toContain('--state-icon-color');
      expect(roundTrip(withState({ accentColor: { ...EMPTY.accentColor, ...ACCENT } }), key(t)).back.accentColor.color).toBe('#ee1111');
    }
    expect(generateCss(withState({ accentColor: { ...EMPTY.accentColor, ...ACCENT } }), key('light'))).not.toContain(
      '--rgb-state-entity',
    );
  });

  it('Accent round-trips on all 14 types; conditional mode keeps both colours and its entity', () => {
    for (const t of MUSHROOM_CLASSIC_TYPES) {
      roundTrip(withState({ accentColor: { ...EMPTY.accentColor, ...ACCENT } }), key(t));
    }
    const cond = { ...EMPTY.accentColor, enabled: true, mode: 'conditional' as const, colorOn: '#ee1111', colorOff: '#222222', entityId: 'light.kitchen' };
    const { css, back } = roundTrip(withState({ accentColor: cond }), key('light'));
    expect(css).toContain(`--rgb-state-light: {{ '238, 17, 17' if is_state('light.kitchen', 'on') else '34, 34, 34' }};`);
    expect(back.accentColor).toMatchObject({ mode: 'conditional', colorOn: '#ee1111', colorOff: '#222222', entityId: 'light.kitchen' });
  });

  it('converts hex, rgb/rgba, hsl/hsla, named colours, HA palette vars and theme twins; alpha is dropped', () => {
    expect(toRgbTriplet('#abc')).toBe('170, 187, 204');
    expect(toRgbTriplet('#11223344')).toBe('17, 34, 51');
    expect(toRgbTriplet('rgb(1, 2, 3)')).toBe('1, 2, 3');
    expect(toRgbTriplet('rgba(1, 2, 3, 0.5)')).toBe('1, 2, 3');
    expect(toRgbTriplet('rgb(10% 20% 30% / 50%)')).toBe('26, 51, 77');
    expect(toRgbTriplet('hsl(0, 100%, 50%)')).toBe('255, 0, 0');
    expect(toRgbTriplet('hsla(120, 100%, 25%, 0.4)')).toBe('0, 128, 0');
    expect(toRgbTriplet('red')).toBe('255, 0, 0');
    expect(toRgbTriplet('RebeccaPurple')).toBe('102, 51, 153');
    expect(toRgbTriplet('var(--red-color)')).toBe('244, 67, 54');
    expect(toRgbTriplet('var(--primary-color)')).toBe('var(--rgb-primary-color)');
    expect(toRgbTriplet('var(--error-color)')).toBe('var(--rgb-error-color)');
    expect(fromRgbTriplet('var(--rgb-primary-color)')).toBe('var(--primary-color)');
    expect(fromRgbTriplet('300, 0, 0')).toBeNull();
    // only a truly arbitrary reference has no form
    expect(toRgbTriplet('var(--my-var)')).toBeNull();
    expect(toRgbTriplet('notacolour')).toBeNull();
    expect(toRgbTriplet('hsl(0, 100, 50)')).toBeNull();
  });

  it('every HA palette swatch of the colour picker converts (table matches HA_COLOR_PRESETS)', () => {
    const src = readFileSync(new URL('../src/components/cms-color-picker.ts', import.meta.url), 'utf8');
    const presets = [...src.matchAll(/variable: '(var\(--[\w-]+\))', hex: '(#[0-9A-Fa-f]{6})'/g)];
    expect(presets).toHaveLength(10);
    for (const [, variable, hex] of presets) {
      expect(toRgbTriplet(variable), variable).toBe(toRgbTriplet(hex));
      expect(generateCss(withState({ accentColor: { ...EMPTY.accentColor, enabled: true, mode: 'plain', color: variable } }), key('light'))).toContain(
        `--rgb-state-light: ${toRgbTriplet(hex)};`,
      );
    }
    // var(--red-color) → the preset's hex triplet, and it reads back as that hex
    const css = generateCss(withState({ accentColor: { ...EMPTY.accentColor, enabled: true, mode: 'plain', color: 'var(--red-color)' } }), key('light'));
    expect(css).toBe('ha-card {\n  --rgb-state-light: 244, 67, 54;\n}');
    expect(parse(css, key('light')).accentColor.color).toBe('#f44336');
  });

  it('an arbitrary var() writes nothing, and the modules can say so', () => {
    const acc = { ...EMPTY.accentColor, enabled: true, mode: 'plain' as const, color: 'var(--my-var)' };
    expect(generateCss(withState({ accentColor: acc }), key('light'))).toBe('');
    expect(accentColorsWithoutTriplet(acc)).toEqual(['var(--my-var)']);
    expect(accentColorsWithoutTriplet({ ...acc, color: 'red' })).toEqual([]);
    expect(accentColorsWithoutTriplet({ ...acc, mode: 'conditional', colorOn: '#fff', colorOff: 'var(--x)' })).toEqual(['var(--x)']);
    const thr = { ...switchThreshold(['accent-color']), rules: [{ id: '0', operator: '>' as const, value: 1, color: 'var(--my-var)' }] };
    expect(thresholdColorsWithoutTriplet(thr)).toEqual(['var(--my-var)']);
    expect(thresholdColorsWithoutTriplet({ ...thr, properties: ['background'] })).toEqual([]);
    expect(tripletHint(['var(--my-var)'])).toContain('var(--my-var)');
    expect(capsFor(key('light')).accentTriplet).toBe(true);
    expect(capsFor('tile').accentTriplet).toBe(false);
    expect(capsFor(key('chips')).accentTriplet).toBe(false);
  });

  it('a Threshold accent rule with one bad colour keeps the others, and never silences the Accent module', () => {
    const thr: ThresholdModuleState = {
      ...switchThreshold(['accent-color']),
      rules: [
        { id: '0', operator: '>', value: 30, color: '#ee1111' },
        { id: '1', operator: '>', value: 25, color: 'var(--my-var)' },
        { id: '2', operator: '>', value: 20, color: '#ffaa00' },
      ],
    };
    const css = generateCss(withState({ threshold: thr }), key('light'));
    expect(css).toContain(`'238, 17, 17' if states('sensor.temp') | float(0) > 30`);
    expect(css).toContain(`'255, 170, 0' if states('sensor.temp') | float(0) > 20`);
    expect(css).not.toContain('> 25');

    // nothing convertible: no accent block, and the module's own accent is written
    const none: ThresholdModuleState = { ...thr, rules: [{ id: '0', operator: '>', value: 1, color: 'var(--my-var)' }] };
    const both = generateCss(withState({ threshold: none, accentColor: { ...EMPTY.accentColor, ...ACCENT } }), key('light'));
    expect(both).toBe('ha-card {\n  --rgb-state-light: 238, 17, 17;\n}');
    // a bad default behaves the same
    const badDefault = generateCss(
      withState({ threshold: { ...thr, defaultColor: 'var(--my-var)' }, accentColor: { ...EMPTY.accentColor, ...ACCENT } }),
      key('light'),
    );
    expect(badDefault).toBe('ha-card {\n  --rgb-state-light: 238, 17, 17;\n}');
  });

  it('the surviving rules of a partly convertible threshold read back with the full rule set (icon + accent)', () => {
    const thr: ThresholdModuleState = {
      ...switchThreshold(['icon-color', 'accent-color']),
      rules: [
        { id: '0', operator: '>', value: 30, color: '#ee1111' },
        { id: '1', operator: '>', value: 25, color: 'var(--my-var)' },
        { id: '2', operator: '>', value: 20, color: '#ffaa00' },
      ],
    };
    const css = generateCss(withState({ threshold: thr }), key('light'));
    const back = parse(css, key('light'));
    expect(back.advanced.rawCss).toBe('');
    expect(back.threshold.properties.slice().sort()).toEqual(['accent-color', 'icon-color']);
    expect(back.threshold.rules.map((r) => r.value)).toEqual([30, 25, 20]);
    expect(generateCss(back, key('light'))).toBe(css);
  });

  it('Threshold: text colour → --card-primary/secondary-color, accent → the type variables (triplets), both round-trip', () => {
    for (const t of ['light', 'cover', 'climate', 'entity']) {
      const state = withState({ threshold: switchThreshold(['text-color', 'accent-color', 'background']) });
      const { css, back } = roundTrip(state, key(t));
      expect(css).toContain('--card-primary-color: {{ ');
      expect(css).toContain('--card-secondary-color: {{ ');
      expect(css).toContain(`'238, 17, 17' if states('sensor.temp') | float(0) > 30`);
      expect(css).toContain('background: {{ ');
      expect(back.threshold.properties.slice().sort()).toEqual(['accent-color', 'background', 'text-color']);
      expect(back.threshold.rules.map((r) => r.color)).toEqual(['#ee1111', '#ffaa00']);
      expect(back.threshold.defaultColor).toBe('#00aa44');
    }
  });

  it('Threshold gradient mode round-trips its stops through the accent variables', () => {
    const state = withState({
      threshold: { ...DEFAULT_THRESHOLD, enabled: true, entityId: 'sensor.temp', properties: ['accent-color'], valueMode: 'gradient' },
    });
    const { back } = roundTrip(state, key('light'));
    expect(back.threshold.valueMode).toBe('gradient');
    expect(back.threshold.colorStops.map((s) => s.value)).toEqual([0, 100]);
  });

  it('Threshold owning text colour leaves Font its size/weight', () => {
    const state = withState({ font: { ...EMPTY.font, ...FONT }, threshold: switchThreshold(['text-color']) });
    const { css, back } = roundTrip(state, key('light'));
    expect(css.match(/--card-primary-color/g)).toHaveLength(1); // the threshold's, not Font's
    expect(back.font).toMatchObject({ enabled: true, fontSize: 22, fontWeight: 'bold' });
  });

  it('a conditional icon size writes --icon-size as the quoted ternary and round-trips', () => {
    const iconColor = { ...EMPTY.iconColor, ...ICON, sizeWhen: { when: 'on' as const }, sizeOffPx: 30 };
    const { css, back } = roundTrip(withState({ iconColor }), key('fan'));
    expect(css).toContain(`--icon-size: {{ '48px' if is_state(config.entity, 'on') else '30px' }};`);
    expect(back.iconColor).toMatchObject({ sizePx: 48, sizeOffPx: 30, sizeWhen: { when: 'on' } });
  });

  it('Background (plain ha-card background) is unchanged on classic cards', () => {
    const { css } = roundTrip(
      withState({ background: { ...EMPTY.background, enabled: true, type: 'solid', color1: '#0a141e', applyWhen: 'always' } }),
      key('light'),
    );
    expect(css).toBe('ha-card {\n  background: #0a141e;\n}');
  });

  it('modules: all shown (incl. Icon Color and Filter), Heading Style hidden; icon size on', () => {
    const c = capsFor(key('light'));
    expect(c.custom).toBe(true);
    expect(c.modules).toMatchObject({
      iconColor: true, accentColor: true, font: true, threshold: true, background: true,
      border: true, animation: true, filter: true, headingStyle: false,
    });
    expect(c.iconSize).toBe(true);
    expect(c.iconColorless).toBe(false);
  });

  it('hand-written Advanced CSS on the same variables is flagged, like other cards rows', () => {
    const adv = (css: string) => ({ ...EMPTY, advanced: { rawCss: css } });
    const font = { ...EMPTY.font, ...FONT };
    const acc = { ...EMPTY.accentColor, ...ACCENT };
    const icon = { ...EMPTY.iconColor, ...ICON };
    const k = key('light');
    expect(findAdvancedCssConflicts('ha-card { --card-primary-font-size: 30px; }', { ...adv(''), font }, k).font)
      .toEqual(['ha-card { --card-primary-font-size }']);
    expect(findAdvancedCssConflicts('ha-card { --rgb-state-light: 1, 2, 3; }', { ...adv(''), accentColor: acc }, k).accentColor)
      .toEqual(['ha-card { --rgb-state-light }']);
    expect(findAdvancedCssConflicts('ha-card { --icon-size: 20px; }', { ...adv(''), iconColor: icon }, k).iconColor)
      .toEqual(['ha-card { --icon-size }']);
    // threshold rows only while Threshold drives that property
    const thr = switchThreshold(['accent-color']);
    expect(findAdvancedCssConflicts('ha-card { --rgb-state-light: 1, 2, 3; }', { ...adv(''), threshold: thr }, k).threshold)
      .toEqual(['ha-card { --rgb-state-light }']);
    expect(findAdvancedCssConflicts('ha-card { --card-primary-color: red; }', { ...adv(''), threshold: thr }, k).threshold)
      .toBeUndefined();
    // another card type's variable is not flagged on this one
    expect(findAdvancedCssConflicts('ha-card { --rgb-state-fan: 1, 2, 3; }', { ...adv(''), accentColor: acc }, k).accentColor)
      .toBeUndefined();
  });

  it('a hand-written !important on a claimed variable stays in Advanced CSS (the generator would write it plain)', () => {
    const css = 'ha-card { --card-primary-font-size: 20px !important; --rgb-state-light: 1, 2, 3 !important; }';
    const back = parse(css, key('light'));
    expect(back.font.enabled).toBe(false);
    expect(back.accentColor.enabled).toBe(false);
    expect(back.advanced.rawCss).toContain('--card-primary-font-size: 20px !important;');
    expect(back.advanced.rawCss).toContain('--rgb-state-light: 1, 2, 3 !important;');
  });

  it('declarations that are not the emitters\' shape stay in Advanced CSS (hand-written ha-card font-size)', () => {
    const back = parse('ha-card { font-size: 22px; --rgb-state-light: red; }', key('light'));
    expect(back.font.enabled).toBe(false);
    expect(back.accentColor.enabled).toBe(false);
    expect(back.advanced.rawCss).toContain('font-size: 22px;');
    expect(back.advanced.rawCss).toContain('--rgb-state-light: red;');
  });
});

describe('icon_color hides Accent (D12) — config-aware capsFor', () => {
  it('shows Accent without icon_color, hides it (and its threshold property) with it', () => {
    expect(capsFor(key('light')).modules.accentColor).toBe(true);
    expect(capsFor(key('light'), { type: key('light'), entity: 'light.x' }).modules.accentColor).toBe(true);
    const withIconColor = { type: key('light'), entity: 'light.x', icon_color: 'red' };
    expect(capsFor(key('light'), withIconColor).modules.accentColor).toBe(false);
    expect(capsFor(key('light'), withIconColor).modules.iconColor).toBe(true); // the Icon Color module still works
    expect(thresholdPropertyAllowed('accent-color', key('light'))).toBe(true);
    expect(thresholdPropertyAllowed('accent-color', key('light'), withIconColor)).toBe(false);
    expect(thresholdPropertyAllowed('text-color', key('light'), withIconColor)).toBe(true);
    // an empty / false value is "not set"
    expect(capsFor(key('light'), { icon_color: '' }).modules.accentColor).toBe(true);
  });

  it('applies to every classic type, not to the template card, and not to built-ins', () => {
    for (const t of MUSHROOM_CLASSIC_TYPES) {
      expect(capsFor(key(t), { icon_color: 'blue' }).modules.accentColor, t).toBe(false);
    }
    expect(capsFor(key('template'), { icon_color: 'blue' }).modules.accentColor).toBe(true);
    expect(capsFor('tile', { icon_color: 'blue' }).modules.accentColor).toBe(true);
  });
});

describe('M-template — emitAs tile (D4)', () => {
  const k = key('template');

  it('reuses the tile emitters for Font / text colour (--ha-tile-info-*)', () => {
    expect(emitKeyOf(k)).toBe('tile');
    const css = generateCss(withState({ font: { ...EMPTY.font, ...FONT } }), k);
    expect(css).toBe(generateCss(withState({ font: { ...EMPTY.font, ...FONT } }), 'tile'));
    expect(css).toContain('--ha-tile-info-primary-font-size: 22px;');
    const { back } = roundTrip(withState({ font: { ...EMPTY.font, ...FONT } }), k);
    expect(back.font).toMatchObject(FONT);
  });

  it('Threshold text colour uses the tile text variables too', () => {
    const { css, back } = roundTrip(withState({ threshold: switchThreshold(['text-color']) }), k);
    expect(css).toContain('--ha-tile-info-primary-color: {{ ');
    expect(back.threshold.properties).toEqual(['text-color']);
  });

  it('icon size goes to ha-tile-icon as --tile-icon-size (box) + --mdc-icon-size (2/3), not onto ha-card', () => {
    const { css, back } = roundTrip(withState({ iconColor: { ...EMPTY.iconColor, ...ICON } }), k);
    expect(css).toContain('ha-tile-icon {\n  --tile-icon-size: 48px;\n  --mdc-icon-size: 32px;\n}');
    expect(css).not.toContain('ha-card {\n  --icon-size');
    expect(back.iconColor).toMatchObject({ enabled: true, sizePx: 48 });
    // box 60 → glyph 40, the measured pair
    expect(generateCss(withState({ iconColor: { ...EMPTY.iconColor, ...ICON, sizePx: 60 } }), k)).toContain('--mdc-icon-size: 40px;');
  });

  it('a conditional size scales both branches', () => {
    const iconColor = { ...EMPTY.iconColor, ...ICON, sizePx: 60, sizeWhen: { when: 'on' as const }, sizeOffPx: 30 };
    const { css, back } = roundTrip(withState({ iconColor }), k);
    expect(css).toContain(`--tile-icon-size: {{ '60px' if is_state(config.entity, 'on') else '30px' }};`);
    expect(css).toContain(`--mdc-icon-size: {{ '40px' if is_state(config.entity, 'on') else '20px' }};`);
    expect(back.iconColor).toMatchObject({ sizePx: 60, sizeOffPx: 30 });
  });

  it('a hand-edited glyph value is left in Advanced CSS, the box is still claimed', () => {
    const back = parse('ha-tile-icon { --tile-icon-size: 48px; --mdc-icon-size: 10px; }', k);
    // A size alone is adopted now (Keep the card's colour); the box is claimed.
    expect(back.iconColor).toMatchObject({ enabled: true, mode: 'none', sizePx: 48 });
    expect(back.advanced.rawCss).toContain('--mdc-icon-size: 10px;');
    expect(back.advanced.rawCss).not.toContain('--tile-icon-size');
    const withColour = parse('ha-state-icon { color: #112233 !important; }\nha-tile-icon { --tile-icon-size: 48px; --mdc-icon-size: 10px; }', k);
    expect(withColour.iconColor).toMatchObject({ enabled: true, sizePx: 48 });
    expect(withColour.advanced.rawCss).toContain('--mdc-icon-size: 10px;');
    expect(withColour.advanced.rawCss).not.toContain('--tile-icon-size');
  });

  it('click-to-edit text matching follows the tile', () => {
    const chain = [{ tag: 'ha-tile-info', classes: [] }, { tag: 'ha-card', classes: [] }];
    expect(mapElementToTarget(chain, k)?.module).toBe('cms-font-module');
  });
});

describe('M-chips', () => {
  const k = key('chips');

  it('maps Font size/weight, icon size, Background and Border onto the chip variables', () => {
    const state = withState({
      font: { ...EMPTY.font, ...FONT },
      iconColor: { ...EMPTY.iconColor, enabled: true, sizePx: 30 },
      background: { ...EMPTY.background, enabled: true, type: 'solid', color1: '#ee1111', applyWhen: 'always' },
      border: { ...EMPTY.border, enabled: true, radiusPx: 4, borderWidth: 3, borderColor: '#00ff00' },
    });
    const { css, back } = roundTrip(state, k);
    expect(css).toContain('--chip-font-size: 22px;');
    expect(css).toContain('--chip-font-weight: bold;');
    expect(css).toContain('--chip-icon-size: 30px;');
    expect(css).toContain('--chip-background: #ee1111;');
    expect(css).toContain('--chip-border-radius: 4px;');
    expect(css).toContain('--chip-border-width: 3px;');
    expect(css).toContain('--chip-border-color: #00ff00;');
    // nothing for the parts a chip does not take
    expect(css).not.toContain('--chip-color');
    expect(css).not.toMatch(/\n {2}(color|background|border|border-radius):/);
    expect(css).not.toContain('ha-state-icon');
    expect(back.font).toMatchObject({ enabled: true, fontSize: 22, fontWeight: 'bold' });
    expect(back.iconColor).toMatchObject({ enabled: true, sizePx: 30 });
    expect(back.background).toMatchObject({ enabled: true, color1: '#ee1111' });
    expect(back.border).toMatchObject({ enabled: true, radiusPx: 4, borderWidth: 3, borderColor: '#00ff00' });
  });

  it('a state-driven border width and a conditional background round-trip', () => {
    const state = withState({
      background: { ...EMPTY.background, enabled: true, type: 'solid', color1: '#ee1111', applyWhen: 'on' },
      border: { ...EMPTY.border, enabled: true, radiusPx: 0, borderWidth: 3, borderColor: '#00ff00', widthWhen: { when: 'on' }, widthOffPx: 1 },
    });
    const { css, back } = roundTrip(state, k);
    expect(css).toContain(`--chip-background: {{ '#ee1111' if is_state(config.entity, 'on') else 'inherit' }};`);
    expect(css).toContain(`--chip-border-width: {{ '3px' if is_state(config.entity, 'on') else '1px' }};`);
    expect(back.border).toMatchObject({ borderWidth: 3, widthOffPx: 1, radiusPx: 0, widthWhen: { when: 'on' } });
  });

  it('Threshold background and border colour drive the chip variables', () => {
    const state = withState({ threshold: { ...switchThreshold(['background', 'border-color']), borderWidth: 2 } });
    const { css, back } = roundTrip(state, k);
    expect(css).toContain('--chip-background: {{ ');
    expect(css).toContain('--chip-border-width: 2px;');
    expect(css).toContain('--chip-border-color: {{ ');
    expect(back.threshold.properties.slice().sort()).toEqual(['background', 'border-color']);
    expect(back.threshold.borderWidth).toBe(2);
    expect(back.border.enabled).toBe(false); // the width is Threshold's, not a ghost Border module
  });

  it('hides Accent, Font text colour and what has no chip target; Icon Color is size-only', () => {
    const c = capsFor(k);
    expect(c.modules.accentColor).toBe(false);
    expect(c.fontColor).toBe(false);
    expect(c.iconColorless).toBe(true);
    expect(c.modules.iconColor).toBe(true);
    expect(c.modules.headingStyle).toBe(false);
    // Threshold offers only what reaches: background + border colour
    for (const [p, ok] of [['background', true], ['border-color', true], ['icon-color', false], ['accent-color', false], ['text-color', false]] as const) {
      expect(thresholdPropertyAllowed(p, k), p).toBe(ok);
    }
  });

  it('a colourless Icon Color emits no colour block, and the size alone enables it on reopen', () => {
    const css = generateCss(withState({ iconColor: { ...EMPTY.iconColor, enabled: true, mode: 'plain', color: '#ff0000', sizePx: 30 } }), k);
    expect(css).toBe('ha-card {\n  --chip-icon-size: 30px;\n}');
    expect(generateCss(withState({ iconColor: { ...EMPTY.iconColor, enabled: true, color: '#ff0000' } }), k)).toBe('');
  });
});

describe('M-title', () => {
  const k = key('title');

  it('Font → the title variables only (the subtitle is not touched)', () => {
    const { css, back } = roundTrip(withState({ font: { ...EMPTY.font, ...FONT } }), k);
    expect(css).toBe(
      [
        'ha-card {',
        '  --title-font-size: 22px;',
        '  --title-line-height: 29px;',
        '  --title-font-weight: bold;',
        '  --title-color: #ee1111;',
        '  font-family: monospace;',
        '}',
      ].join('\n'),
    );
    expect(css).not.toContain('--subtitle');
    expect(back.font).toMatchObject(FONT);
  });

  it('Threshold text colour → --title-color', () => {
    const { css, back } = roundTrip(withState({ threshold: switchThreshold(['text-color']) }), k);
    expect(css).toContain('--title-color: {{ ');
    expect(back.threshold.properties).toEqual(['text-color']);
  });

  it('hides the modules with no target (no icon, accent, background or border) but keeps Font, Filter, Animation', () => {
    const c = capsFor(k);
    expect(c.modules).toMatchObject({
      iconColor: false, accentColor: false, background: false, border: false,
      font: true, filter: true, animation: true, threshold: true,
    });
    for (const [p, ok] of [['text-color', true], ['background', false], ['border-color', false], ['icon-color', false], ['accent-color', false]] as const) {
      expect(thresholdPropertyAllowed(p, k), p).toBe(ok);
    }
  });
});

describe('M-empty', () => {
  const k = key('empty');

  it('hides every styling module (Advanced CSS is not a module and stays)', () => {
    const c = capsFor(k);
    expect(Object.entries(c.modules).filter(([, v]) => v)).toEqual([]);
  });

  it('emits nothing for an untouched state and preserves hand-written CSS', () => {
    expect(generateCss(EMPTY, k)).toBe('');
    const back = parse('ha-card { color: red; }', k);
    expect(back.advanced.rawCss).toContain('color: red;');
  });

  it('a preset from another card loses every styled module', () => {
    const on = {
      ...EMPTY,
      filter: { ...EMPTY.filter, enabled: true, grayscale: true },
      font: { ...EMPTY.font, enabled: true },
      background: { ...EMPTY.background, enabled: true },
      border: { ...EMPTY.border, enabled: true },
      animation: { ...EMPTY.animation, enabled: true },
      accentColor: { ...EMPTY.accentColor, enabled: true },
      iconColor: { ...EMPTY.iconColor, enabled: true },
    };
    const f = filterPresetStateForCardType(on, k);
    expect(f.filter.enabled || f.filter.grayscale).toBe(false);
    expect([f.font, f.background, f.border, f.animation, f.accentColor, f.iconColor].some((m) => m.enabled)).toBe(false);
  });
});

describe('built-in cards are unchanged', () => {
  it('tile/light/entity output does not depend on the profile plumbing', () => {
    const state = withState({
      font: { ...EMPTY.font, ...FONT },
      iconColor: { ...EMPTY.iconColor, ...ICON },
      accentColor: { ...EMPTY.accentColor, ...ACCENT },
    });
    const tile = generateCss(state, 'tile');
    expect(tile).toContain('--tile-color: #ee1111 !important;');
    expect(tile).toContain('font-size: 22px;');
    expect(tile).not.toContain('--rgb-state');
    expect(tile).not.toContain('--card-primary');
    expect(generateCss(state, 'light')).not.toContain('--card-primary');
    // a Mushroom card inside the same session does not leak into a plain card
    expect(capsFor('light').custom).toBe(false);
  });

  it('the profile registry can still be extended (fixtures) and cleaned up', () => {
    registerCustomCardProfile({ key: 'custom:fixture-x', emitAs: 'tile' });
    expect(emitKeyOf('custom:fixture-x')).toBe('tile');
    unregisterCustomCardProfile('custom:fixture-x');
    expect(emitKeyOf('custom:fixture-x')).toBe('custom:fixture-x');
  });
});

describe('a Mushroom card inside a vertical-stack (cms-child-card-section path)', () => {
  const originalRegistry = globalThis.customElements;
  afterEach(() => {
    (globalThis as { customElements: unknown }).customElements = originalRegistry;
  });
  const installCardMod = () => {
    const reg = new Map<string, unknown>([['card-mod', class {}]]);
    (globalThis as { customElements: unknown }).customElements = { get: (n: string) => reg.get(n), define: () => {} };
  };

  const STACK = {
    type: 'vertical-stack',
    cards: [
      { type: key('light'), entity: 'light.kitchen' },
      { type: key('light'), entity: 'light.bed', icon_color: 'blue' },
      { type: key('chips'), chips: [{ type: 'entity', entity: 'light.kitchen' }, { type: 'entity', entity: 'switch.ac' }] },
    ],
  } as unknown as CardModCardConfig;
  const child = (i: number) => (STACK as unknown as { cards: CardModCardConfig[] }).cards[i];

  it('the child section keys the profile off the child config (profileKeyOf) and reads config-aware caps', () => {
    expect(profileKeyOf(child(0))).toBe(key('light'));
    expect(capsFor(profileKeyOf(child(0)), child(0) as never).modules.accentColor).toBe(true);
    expect(capsFor(profileKeyOf(child(1)), child(1) as never).modules.accentColor).toBe(false);
    expect(capsFor(profileKeyOf(child(2)), child(2) as never).iconColorless).toBe(true);
  });

  it('saves and re-opens a child with the profile emitters (same pipeline as top level)', () => {
    installCardMod();
    const c = child(0);
    const state = buildMergedStudioState(c);
    state.font = { ...state.font, ...FONT };
    state.accentColor = { ...state.accentColor, ...ACCENT };
    state.iconColor = { ...state.iconColor, ...ICON };
    const saved = applyStudioState(state, c);
    const style = saved.card_mod?.style as string;
    expect(style).toContain('--card-primary-font-size: 22px;');
    expect(style).toContain('--rgb-state-light: 238, 17, 17;');
    expect(style).toContain('--icon-size: 48px;');
    expect(style).not.toContain('--accent-color');
    const reopened = buildMergedStudioState(saved);
    expect(reopened.advanced.rawCss).toBe('');
    expect(reopened.font).toMatchObject(FONT);
    expect(reopened.accentColor).toMatchObject({ enabled: true, color: '#ee1111' });
    expect(reopened.iconColor).toMatchObject({ enabled: true, sizePx: 48 });
    // the sibling is untouched
    expect(child(1)).toBe((STACK as unknown as { cards: CardModCardConfig[] }).cards[1]);
  });

  it('a chips child saves chip variables', () => {
    installCardMod();
    const c = child(2);
    const state = buildMergedStudioState(c);
    state.font = { ...state.font, enabled: true, fontSize: 20 };
    const saved = applyStudioState(state, c);
    expect(saved.card_mod?.style).toContain('--chip-font-size: 20px;');
    expect(buildMergedStudioState(saved).font).toMatchObject({ enabled: true, fontSize: 20 });
  });
});

describe('optional profile flags (G3)', () => {
  const K = 'custom:fixture-flags';
  afterEach(() => unregisterCustomCardProfile(K));

  it('headerTitle and transitionImportant default to false and are read from the profile', () => {
    registerCustomCardProfile({ key: K });
    expect(capsFor(K).headerTitle).toBe(false);
    expect(capsFor(K).transitionImportant).toBe(false);
    const font = { ...EMPTY.font, enabled: true, fontSize: 20 };
    const filter = { ...EMPTY.filter, enabled: true, grayscale: true, grayscaleWhen: 'always' as const };
    const plain = generateCss(withState({ font, filter }), K);
    expect(plain).not.toContain('--ha-card-header-font-size');
    expect(plain).not.toContain('!important');

    registerCustomCardProfile({ key: K, headerTitle: true, transitionImportant: true });
    expect(capsFor(K).headerTitle).toBe(true);
    const flagged = generateCss(withState({ font, filter }), K);
    expect(flagged).toContain('--ha-card-header-font-size: calc(20px * 1.5);');
    expect(flagged).toContain('transition: filter 300ms ease !important;');
    // …and the font companion parses back (header variable is claimed with Font)
    expect(parse(flagged, K).font).toMatchObject({ enabled: true, fontSize: 20 });
  });

  it('configGates are data: any config key can hide any module', () => {
    registerCustomCardProfile({ key: K, configGates: [{ key: 'hide_me', hide: ['font', 'border'] }] });
    expect(capsFor(K, {}).modules.font).toBe(true);
    expect(capsFor(K, { hide_me: true }).modules).toMatchObject({ font: false, border: false, background: true });
  });
});

describe('F4 — the literal Accent variable table, all 14 classic types', () => {
  // Spelled out here on purpose (measured on Mushroom 5.2.3 / HA 2026.11.0),
  // NOT imported from the data module.
  const TABLE: Record<string, string[]> = {
    'alarm-control-panel': ['--rgb-state-alarm-disarmed', '--rgb-state-alarm-armed', '--rgb-state-alarm-triggered'],
    climate: [
      '--rgb-state-climate-auto', '--rgb-state-climate-cool', '--rgb-state-climate-dry',
      '--rgb-state-climate-fan-only', '--rgb-state-climate-heat', '--rgb-state-climate-heat-cool',
      '--rgb-state-climate-idle',
    ],
    cover: ['--rgb-state-cover-open', '--rgb-state-cover-closed'],
    entity: ['--rgb-state-entity'],
    fan: ['--rgb-state-fan'],
    humidifier: ['--rgb-state-humidifier'],
    light: ['--rgb-state-light'],
    lock: ['--rgb-state-lock-locked', '--rgb-state-lock-unlocked', '--rgb-state-lock-pending'],
    'media-player': ['--rgb-state-media-player'],
    number: ['--rgb-state-number'],
    person: ['--rgb-state-person-home', '--rgb-state-person-not-home', '--rgb-state-person-zone', '--rgb-state-person-unknown'],
    select: ['--rgb-state-entity'],
    update: ['--rgb-state-update-on', '--rgb-state-update-off', '--rgb-state-update-installing'],
    vacuum: ['--rgb-state-vacuum'],
  };

  it('covers exactly the 14 classic types', () => {
    expect(Object.keys(TABLE).sort()).toEqual([...MUSHROOM_CLASSIC_TYPES].sort());
    expect(Object.keys(TABLE)).toHaveLength(14);
  });

  for (const [type, vars] of Object.entries(TABLE)) {
    it(`${type}: emitter vars, claims and generated CSS are exactly the table`, () => {
      const p = getCustomCardProfile(key(type))!;
      expect(p.emitters?.accent?.vars).toEqual(vars);
      expect(p.claims?.find((c) => c.role === 'accent')?.props).toEqual(vars);
      const css = generateCss(withState({ accentColor: { ...EMPTY.accentColor, ...ACCENT } }), key(type));
      expect(css).toBe(['ha-card {', ...vars.map((v) => `  ${v}: 238, 17, 17;`), '}'].join('\n'));
    });
  }
});

describe('F2 — the icon_color gate reaches the generator, the preset filter and click-to-edit', () => {
  const gated = { type: key('light'), entity: 'light.x', icon_color: 'blue' } as Record<string, unknown>;

  it('the generator keeps writing a stored Accent / Threshold accent while the gate hides its control', () => {
    const state = withState({
      accentColor: { ...EMPTY.accentColor, ...ACCENT },
      threshold: switchThreshold(['accent-color', 'text-color']),
      font: { ...EMPTY.font, ...FONT },
    });
    expect(generateCss(state, key('light'))).toContain('--rgb-state-light');
    const css = generateCss(state, key('light'), { config: gated });
    // hidden, not lost: the same output as without the config (review fix 4)
    expect(css).toBe(generateCss(state, key('light')));
    expect(css).toContain('--rgb-state-light: {{ ');
    expect(css).toContain('--card-primary-color: {{ ');
    expect(css).toContain('--card-primary-font-size: 22px;');
    // a stack child's config takes the same path (applyStudioState passes it)
    const original = globalThis.customElements;
    const reg = new Map<string, unknown>([['card-mod', class {}]]);
    (globalThis as { customElements: unknown }).customElements = { get: (n: string) => reg.get(n), define: () => {} };
    try {
      const out = applyStudioState(state, gated as unknown as CardModCardConfig);
      expect(JSON.stringify(out)).toContain('--rgb-state-light');
      expect(JSON.stringify(out)).toContain('--card-primary-font-size');
    } finally {
      (globalThis as { customElements: unknown }).customElements = original;
    }
  });

  it('filterPresetStateForCardType drops Accent for a gated card', () => {
    const on = { ...EMPTY, accentColor: { ...EMPTY.accentColor, ...ACCENT }, threshold: switchThreshold(['accent-color', 'text-color']) };
    expect(filterPresetStateForCardType(on, key('light')).accentColor.enabled).toBe(true);
    const f = filterPresetStateForCardType(on, key('light'), gated);
    expect(f.accentColor.enabled).toBe(false);
    expect(f.threshold.properties).toEqual(['text-color']);
  });

  it('click-to-edit does not send an accent-ish click to a hidden Accent module', () => {
    const chain = [{ tag: 'ha-gauge', classes: [] }, { tag: 'ha-card', classes: [] }];
    expect(mapElementToTarget(chain, key('light'))?.module).toBe('cms-accent-color-module');
    expect(mapElementToTarget(chain, key('light'), gated)?.module).not.toBe('cms-accent-color-module');
  });
});

describe('F3 — a custom profile adopts nothing into a module its panel hides', () => {
  it('title card: background/border/filter-less hand CSS stays in Advanced CSS', () => {
    const back = parse('ha-card { background: red; border-radius: 4px; border: 2px solid red; }', key('title'));
    expect(back.background.enabled).toBe(false);
    expect(back.border.enabled).toBe(false);
    expect(back.advanced.rawCss).toContain('background: red;');
    expect(back.advanced.rawCss).toContain('border-radius: 4px;');
    expect(back.advanced.rawCss).toContain('border: 2px solid red;');
  });

  it('empty card: nothing is adopted anywhere (filter, font, animation, icon, threshold)', () => {
    const css = 'ha-card { filter: grayscale(100%); font-size: 20px; animation: cms-pulse 2s ease-in-out infinite; }\nha-state-icon { color: red !important; }';
    const back = parse(css, key('empty'));
    expect([back.filter, back.font, back.animation, back.iconColor].some((m) => m.enabled)).toBe(false);
    expect(back.advanced.rawCss).toContain('filter: grayscale(100%);');
    expect(back.advanced.rawCss).toContain('color: red !important;');
  });

  it('a threshold property the profile does not offer is not adopted (title: background)', () => {
    const css = generateCss(withState({ threshold: switchThreshold(['background']) }), 'tile');
    const back = parse(css, key('title'));
    expect(back.threshold.enabled).toBe(false);
    expect(back.advanced.rawCss).toContain('background: {{ ');
  });

  it('built-in cards still adopt as before (tile: hand-written ha-card background)', () => {
    expect(parse('ha-card { background: red; }', 'tile').background.enabled).toBe(true);
    expect(parse('ha-card { background: red; }', key('light')).background.enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Text size carries a matching line-height (fixed 20px / 16px lines with
// overflow: hidden clipped anything above ~18px; measured on both engines).
// ---------------------------------------------------------------------------
describe('Font text size → line-height / box height', () => {
  const sized = (size: number, extra: Partial<StudioState['font']> = {}) =>
    withState({ font: { ...EMPTY.font, enabled: true, fontSize: size, ...extra } });

  it('classic: 20/14 and 16/12 of the size, native 20px at 14px primary (secondary 16px at 12px)', () => {
    const want: Record<number, [number, number]> = { 10: [14, 13], 14: [20, 19], 22: [31, 29], 30: [43, 40], 48: [69, 64] };
    for (const [size, [p, s]] of Object.entries(want)) {
      const css = generateCss(sized(Number(size)), key('entity'));
      expect(css).toContain(`--card-primary-line-height: ${p}px;`);
      expect(css).toContain(`--card-secondary-line-height: ${s}px;`);
    }
  });

  it('only with a size: weight / colour alone write no line-height', () => {
    const css = generateCss(withState({ font: { ...EMPTY.font, enabled: true, fontWeight: 'bold', color: '#ee1111' } }), key('entity'));
    expect(css).not.toContain('line-height');
  });

  it('round-trips byte-identically on all 14 types at every tested size, nothing left in Advanced CSS', () => {
    for (const t of MUSHROOM_CLASSIC_TYPES) {
      for (const size of [10, 14, 22, 30, 48]) {
        const { back } = roundTrip(sized(size, { fontWeight: 'bold', color: '#ee1111' }), key(t));
        expect(back.font.fontSize, `${t} ${size}`).toBe(size);
      }
    }
  });

  it('a style from before the line-height (0.11.0-beta.2 shape) loads the same controls and gains it on save', () => {
    const old = [
      'ha-card {',
      '  --card-primary-font-size: 22px;',
      '  --card-secondary-font-size: 22px;',
      '  --card-primary-font-weight: bold;',
      '  --card-secondary-font-weight: bold;',
      '}',
    ].join('\n');
    const back = parse(old, key('light'));
    expect(back.font).toMatchObject({ enabled: true, fontSize: 22, fontWeight: 'bold' });
    expect(back.advanced.rawCss).toBe('');
    const next = generateCss(back, key('light'));
    expect(next).toContain('--card-primary-line-height: 31px;');
    expect(roundTrip(back, key('light')).css).toBe(next);
  });

  it('a line-height the user set to another value stays in Advanced CSS (and wins: it is written last)', () => {
    const css = 'ha-card {\n  --card-primary-font-size: 22px;\n  --card-primary-line-height: 40px;\n}';
    const back = parse(css, key('light'));
    expect(back.font.fontSize).toBe(22);
    expect(back.advanced.rawCss).toContain('--card-primary-line-height: 40px');
    const out = generateCss(back, key('light'));
    expect(out.lastIndexOf('--card-primary-line-height: 40px')).toBeGreaterThan(out.indexOf('--card-primary-line-height: 31px'));
  });

  it('a line-height without a size is not claimed', () => {
    const back = parse('ha-card { --card-primary-line-height: 31px; }', key('light'));
    expect(back.font.enabled).toBe(false);
    expect(back.advanced.rawCss).toContain('--card-primary-line-height');
  });

  it('hand-written Advanced CSS on the line-height variable is flagged as overriding Font', () => {
    const state = { ...sized(22), advanced: { rawCss: '' } };
    expect(findAdvancedCssConflicts('ha-card { --card-secondary-line-height: 30px; }', state, key('light')).font)
      .toEqual(['ha-card { --card-secondary-line-height }']);
  });

  it('title: --title-line-height = 4/3 of the size, the subtitle is not written', () => {
    expect(generateCss(sized(24), key('title'))).toContain('--title-line-height: 32px;');
    const css = generateCss(sized(48), key('title'));
    expect(css).toContain('--title-line-height: 64px;');
    expect(css).not.toContain('--subtitle');
    roundTrip(sized(48), key('title'));
  });

  it('chips: --chip-height grows with the text above the native 36px, nothing below it', () => {
    expect(generateCss(sized(14), key('chips'))).not.toContain('--chip-height');
    expect(generateCss(sized(20), key('chips'))).not.toContain('--chip-height');
    expect(generateCss(sized(30), key('chips'))).toContain('--chip-height: 46px;');
    expect(generateCss(sized(48), key('chips'))).toContain('--chip-height: 64px;');
    for (const size of [10, 14, 22, 30, 48]) roundTrip(sized(size), key('chips'));
  });

  it('the template card (tile text) needs none: its lines scale with the text', () => {
    expect(generateCss(sized(30), key('template'))).not.toContain('line-height');
  });
});

// ---------------------------------------------------------------------------
// Config gates for controls whose target the card's own options remove. Each
// row was measured on both engines (card-mod 4.2.1, UIX 9.0.0; Mushroom 5.2.3,
// HA 2026.11): a twin with the control's CSS had the same computed styles as
// the plain card in that configuration.
// ---------------------------------------------------------------------------
describe('config gates — nothing left for the control to style', () => {
  const mods = (t: string, config: Record<string, unknown>) => capsFor(key(t), { type: key(t), ...config }).modules;
  const NO_ICON = [{ icon_type: 'none' }, { hide_icon: true }, { icon_type: '', hide_icon: true }];

  it('no icon hides Icon Color (colour and size) on all 14 types — icon_type none or the legacy hide_icon', () => {
    for (const t of MUSHROOM_CLASSIC_TYPES) {
      expect(mods(t, {}).iconColor, t).toBe(true);
      for (const c of NO_ICON) expect(mods(t, c).iconColor, `${t} ${JSON.stringify(c)}`).toBe(false);
      // an explicit icon_type wins over the legacy flag; a false flag is not set
      expect(mods(t, { icon_type: 'icon', hide_icon: true }).iconColor, t).toBe(true);
      expect(mods(t, { hide_icon: false }).iconColor, t).toBe(true);
      // a picture still has a size (the avatar follows --icon-size)
      expect(mods(t, { icon_type: 'entity-picture' }).iconColor, t).toBe(true);
    }
    expect(thresholdPropertyAllowed('icon-color', key('entity'), { icon_type: 'none' })).toBe(false);
    expect(thresholdPropertyAllowed('text-color', key('entity'), { icon_type: 'none' })).toBe(true);
  });

  it('no icon also hides Accent where it only reaches icon, shape and badge', () => {
    for (const t of ['alarm-control-panel', 'climate', 'cover', 'entity', 'lock', 'media-player', 'person', 'select', 'update']) {
      expect(mods(t, {}).accentColor, t).toBe(true);
      for (const c of NO_ICON) expect(mods(t, c).accentColor, `${t} ${JSON.stringify(c)}`).toBe(false);
      expect(mods(t, { icon_type: 'entity-picture' }).accentColor, t).toBe(true); // the entity may have no picture
    }
    expect(thresholdPropertyAllowed('accent-color', key('person'), { icon_type: 'none' })).toBe(false);
  });

  it('light / humidifier keep Accent without an icon while one of their sliders is on', () => {
    const sliders: Record<string, string[]> = {
      light: ['show_brightness_control', 'show_color_temp_control', 'show_color_control'],
      humidifier: ['show_target_humidity_control'],
    };
    for (const [t, keys] of Object.entries(sliders)) {
      expect(mods(t, { icon_type: 'none' }).accentColor, t).toBe(false);
      expect(mods(t, { hide_icon: true }).accentColor, t).toBe(false);
      for (const k of keys) expect(mods(t, { icon_type: 'none', [k]: true }).accentColor, `${t} ${k}`).toBe(true);
      expect(mods(t, { icon_type: 'none', [keys[0]]: false }).accentColor, t).toBe(false);
      expect(mods(t, {}).accentColor, t).toBe(true);
    }
  });

  it('number (slider), fan and vacuum keep Accent without an icon', () => {
    for (const t of ['number', 'fan', 'vacuum']) expect(mods(t, { icon_type: 'none' }).accentColor, t).toBe(true);
  });

  it('no text lines hides Font: both primary and secondary none, new or legacy keys', () => {
    for (const t of MUSHROOM_CLASSIC_TYPES.filter((x) => x !== 'climate')) {
      expect(mods(t, {}).font, t).toBe(true);
      expect(mods(t, { primary_info: 'none', secondary_info: 'none' }).font, t).toBe(false);
      expect(mods(t, { hide_name: true, hide_state: true }).font, t).toBe(false);
      expect(mods(t, { primary_info: 'none', hide_state: true }).font, t).toBe(false);
      expect(mods(t, { hide_name: true, secondary_info: 'none' }).font, t).toBe(false);
      // one line left, or an explicit value beating the legacy flag: still styles something
      expect(mods(t, { primary_info: 'none' }).font, t).toBe(true);
      expect(mods(t, { secondary_info: 'none' }).font, t).toBe(true);
      expect(mods(t, { hide_name: true }).font, t).toBe(true);
      expect(mods(t, { primary_info: 'none', secondary_info: 'state', hide_state: true }).font, t).toBe(true);
      expect(mods(t, { primary_info: 'name', secondary_info: 'none', hide_name: true }).font, t).toBe(true);
    }
    expect(thresholdPropertyAllowed('text-color', key('entity'), { primary_info: 'none', secondary_info: 'none' })).toBe(false);
    expect(thresholdPropertyAllowed('text-color', key('entity'), { primary_info: 'none' })).toBe(true);
  });

  it('Font stays where text remains: climate (temperature control), number in buttons mode', () => {
    const none = { primary_info: 'none', secondary_info: 'none' };
    expect(mods('climate', none).font).toBe(true);
    expect(mods('number', none).font).toBe(false);
    expect(mods('number', { ...none, display_mode: 'slider' }).font).toBe(false);
    expect(mods('number', { ...none, display_mode: 'buttons' }).font).toBe(true);
  });

  it('template, chips, title and the empty card are not touched by the classic gates', () => {
    // `icon` set: the template card's own gate (no icon, no picture) stays out of it
    const cfg = { icon_type: 'none', primary_info: 'none', secondary_info: 'none', hide_icon: true, icon: 'mdi:home' };
    for (const t of ['template', 'chips', 'title', 'empty']) {
      expect(capsFor(key(t), cfg).modules).toEqual(capsFor(key(t)).modules);
    }
  });

  it('template card: Icon Color is hidden only while neither icon nor picture is set (a picture keeps the size)', () => {
    const t = (c: Record<string, unknown>) => capsFor(key('template'), { type: key('template'), ...c }).modules;
    expect(t({}).iconColor).toBe(false);
    expect(t({ entity: 'light.x', primary: 'a' }).iconColor).toBe(false);
    expect(t({ icon: '' }).iconColor).toBe(false);
    expect(t({ icon: 'mdi:lightbulb' }).iconColor).toBe(true);
    expect(t({ icon: "{{ 'mdi:home' }}" }).iconColor).toBe(true);
    expect(t({ picture: '/local/a.png' }).iconColor).toBe(true);
    expect(t({}).font).toBe(true);
    // no config at all = the config-free answer, nothing hidden
    expect(capsFor(key('template')).modules.iconColor).toBe(true);
  });

  it('Icon size limit: classic and template stop at the one-row sections card (56)', () => {
    for (const t of [...MUSHROOM_CLASSIC_TYPES, 'template']) {
      expect(capsFor(key(t), { type: key(t) }).iconSizeMax, t).toBe(56);
      expect(capsFor(key(t)).iconSizeMax, t).toBe(56);
    }
    expect(capsFor(key('chips')).iconSizeMax).toBe(64);
  });

  it('gate tests compare strictly: is / not take booleans too', () => {
    const K = 'custom:mushroom-gate-bool-card';
    registerCustomCardProfile({
      key: K,
      configGates: [{ when: [[{ key: 'a', is: [false] }, { key: 'b', not: [true] }]], hide: ['font'] }],
    });
    try {
      const f = (c: Record<string, unknown>) => capsFor(K, c).modules.font;
      expect(f({ a: false })).toBe(false);
      expect(f({ a: false, b: true })).toBe(true);
      expect(f({ a: 'false' })).toBe(true); // the string is not the boolean
      expect(f({})).toBe(true);
    } finally {
      unregisterCustomCardProfile(K);
    }
  });

  it('a style written before a gate hid its control still parses (mapping does not look at the card config)', () => {
    const css = generateCss(withState({ iconColor: { ...EMPTY.iconColor, enabled: true, sizePx: 48 } }), key('entity'));
    expect(parse(css, key('entity')).iconColor).toMatchObject({ enabled: true, sizePx: 48 });
  });

  it('gate clauses: when = any clause, a clause = all tests (is / not / unset / set)', () => {
    const K = 'custom:mushroom-gate-fixture-card';
    registerCustomCardProfile({
      key: K,
      configGates: [
        { when: [[{ key: 'a', is: ['x'] }, { key: 'b', unset: true }], [{ key: 'c', not: ['y'] }]], hide: ['font'] },
        { key: 'd', hide: ['border'] },
      ],
    });
    try {
      const m = (c: Record<string, unknown>) => capsFor(K, c).modules;
      expect(m({ a: 'x' }).font).toBe(false); // clause 1
      expect(m({ a: 'x', b: 1, c: 'y' }).font).toBe(true); // b set, c is y
      expect(m({ c: 'z' }).font).toBe(false); // clause 2
      expect(m({ c: 'y' }).font).toBe(true);
      expect(m({}).font).toBe(false); // `not` holds for an absent key
      expect(m({ d: true }).border).toBe(false);
      expect(m({ d: false }).border).toBe(true);
    } finally {
      unregisterCustomCardProfile(K);
    }
  });
});

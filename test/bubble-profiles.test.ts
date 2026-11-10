/**
 * C3.1–C3.3 — Bubble Card 3.x as profile DATA (src/utils/profiles/bubble.ts).
 *
 * Every declaration the generator writes for a Bubble card must parse back to
 * the same Studio state with nothing left in Advanced CSS, and re-generate
 * byte-for-byte. Selectors and `!important` placements are the ones measured
 * on Bubble 3.4.3 / HA 2026.11.0 / card-mod 4.2.1 + UIX 9.0.0
 * (docs/research/2026-10-v0.11.md §3.3.1) — spelled out literally here so a
 * change to the data fails a test rather than silently moving a selector.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { capsFor } from '../src/utils/card-caps.js';
import { mapElementToMatch, mapElementToTarget } from '../src/utils/preview-map.js';
import { childKindLabel, getCustomCardProfile, iconSizeMaxOf, profileKeyOf } from '../src/utils/custom-card-profiles.js';
import { BUBBLE_SELECTORS } from '../src/utils/profiles/bubble.js';
import { findAdvancedCssConflicts } from '../src/utils/style-conflicts.js';
import { filterPresetStateForCardType } from '../src/utils/preset-caps.js';
import { buildMergedStudioState, applyStudioState } from '../src/editor/studio-state.js';
import type { StudioState, CardModCardConfig } from '../src/types/index.js';

const EMPTY = mapToStudioState(parseStyleValue(''));
const BTN = 'custom:bubble-card/button';
const SLIDER = 'custom:bubble-card/button/slider';
const SEP = 'custom:bubble-card/separator';
const COVER = 'custom:bubble-card/cover';

const parse = (css: string, k: string) => mapToStudioState(parseStyleValue(css), k);
const withState = (patch: Partial<StudioState>): StudioState => ({ ...EMPTY, ...patch });

/** generate → parse → generate again: nothing left in Advanced CSS, byte-stable. */
function roundTrip(state: StudioState, k: string) {
  const css = generateCss(state, k);
  const back = parse(css, k);
  expect(back.advanced.rawCss, `Advanced CSS left over for ${k}:\n${css}`).toBe('');
  expect(generateCss(back, k)).toBe(css);
  return { css, back };
}

const FONT = { enabled: true, fontSize: 22, fontWeight: 'bold' as const, fontFamily: 'monospace', color: '#ee1111' };
const ICON = { enabled: true, mode: 'plain' as const, color: '#112233', sizePx: 40 };
const ACCENT = { enabled: true, mode: 'plain' as const, color: '#ee1111' };
const BG = { enabled: true, type: 'solid' as const, color1: '#112244', applyWhen: 'always' as const };
const BORDER = { enabled: true, radiusPx: 8, borderWidth: 3, borderColor: '#11ee11' };

const full = (accent: boolean): StudioState =>
  withState({
    font: { ...EMPTY.font, ...FONT },
    iconColor: { ...EMPTY.iconColor, ...ICON },
    background: { ...EMPTY.background, ...BG },
    border: { ...EMPTY.border, ...BORDER },
    ...(accent ? { accentColor: { ...EMPTY.accentColor, ...ACCENT } } : {}),
  });

describe('Bubble 3 profiles — what the panel shows', () => {
  it('button / cover / separator: Accent and Threshold are hidden (no probed target), the rest shown', () => {
    for (const k of [BTN, COVER, SEP]) {
      const caps = capsFor(k);
      expect(caps.custom, k).toBe(true);
      expect(caps.modules, k).toEqual({
        iconColor: true, accentColor: false, font: true, threshold: false,
        background: true, border: true, animation: true, headingStyle: false, filter: true,
      });
      expect(caps.iconSize, k).toBe(true);
    }
    expect(capsFor(SEP).stateAwareByDefault).toBe(false);
    expect(capsFor(BTN).stateAwareByDefault).toBe(true);
  });

  it('button + slider additionally shows Accent (the value fill), not as R, G, B', () => {
    const caps = capsFor(SLIDER);
    expect(caps.modules.accentColor).toBe(true);
    expect(caps.modules.threshold).toBe(false);
    expect(caps.accentTriplet).toBe(false);
  });

  it('the selector map is versioned per Bubble major', () => {
    expect(Object.keys(BUBBLE_SELECTORS)).toEqual(['3']);
  });

  it('only measured card_types have a profile', () => {
    for (const k of [BTN, SLIDER, SEP, COVER]) expect(getCustomCardProfile(k)?.key).toBe(k);
    for (const t of ['pop-up', 'climate', 'media-player', 'horizontal-buttons-stack', 'select', 'calendar', 'empty-column', 'sub-buttons']) {
      expect(capsFor(`custom:bubble-card/${t}`).custom, t).toBe(false);
    }
  });
});

describe('Bubble 3 profiles — emitted CSS (literal) and round trip', () => {
  it('button', () => {
    const { css, back } = roundTrip(full(false), BTN);
    expect(css).toBe(
      [
        '.bubble-button-background {',
        '  background: #112244;',
        '  opacity: 1 !important;',
        '  border-radius: 0 !important;',
        '}',
        '',
        '.bubble-container {',
        '  border-radius: 8px;',
        '  border: 3px solid #11ee11;',
        '}',
        '',
        '.bubble-icon {',
        '  color: #112233 !important;',
        '  --mdc-icon-size: 40px;',
        '}',
        '',
        '.bubble-name,',
        '.bubble-state {',
        '  font-size: 22px;',
        '  font-weight: bold;',
        '  color: #ee1111;',
        '  font-family: monospace;',
        '}',
      ].join('\n'),
    );
    expect(back.advanced.rawCss).toBe('');
    expect(back.font).toMatchObject(FONT);
    expect(back.iconColor).toMatchObject(ICON);
    expect(back.background).toMatchObject(BG);
    expect(back.border).toMatchObject(BORDER);
  });

  it('button with button_type: slider', () => {
    const { css, back } = roundTrip(full(true), SLIDER);
    expect(css).toBe(
      [
        '.bubble-range-fill {',
        '  background-color: #ee1111 !important;',
        '  opacity: 1 !important;',
        '}',
        '',
        // Background goes on the container, BELOW the fill (the pill element
        // paints above it): the fill stays visible.
        '.bubble-container {',
        '  background: #112244;',
        '  border-radius: 8px;',
        '  border: 3px solid #11ee11;',
        '}',
        '',
        '.bubble-button-background {',
        '  border-radius: 0 !important;',
        '}',
        '',
        '.bubble-range-slider {',
        '  border-radius: 0 !important;',
        '}',
        '',
        '.bubble-icon {',
        '  color: #112233 !important;',
        '  --mdc-icon-size: 40px;',
        '}',
        '',
        '.bubble-name,',
        '.bubble-state {',
        '  font-size: 22px;',
        '  font-weight: bold;',
        '  color: #ee1111;',
        '  font-family: monospace;',
        '}',
      ].join('\n'),
    );
    expect(back.advanced.rawCss).toBe('');
    expect(back.border).toMatchObject(BORDER);
    expect(back.background).toMatchObject(BG);
    expect(back.accentColor).toMatchObject(ACCENT);
  });

  it('slider accent as an on/off condition keeps its entity and !important', () => {
    const state = withState({
      accentColor: { ...EMPTY.accentColor, enabled: true, mode: 'conditional', colorOn: '#ee1111', colorOff: '#222222', entityId: 'light.kitchen' },
    });
    const { css, back } = roundTrip(state, SLIDER);
    expect(css).toBe(
      [
        '.bubble-range-fill {',
        "  background-color: {{ '#ee1111' if is_state('light.kitchen', 'on') else '#222222' }} !important;",
        '  opacity: 1 !important;',
        '}',
      ].join('\n'),
    );
    expect(back.accentColor).toMatchObject({ enabled: true, mode: 'conditional', colorOn: '#ee1111', colorOff: '#222222', entityId: 'light.kitchen' });
  });

  it('separator', () => {
    const { css, back } = roundTrip(full(false), SEP);
    expect(css).toBe(
      [
        '.bubble-separator {',
        '  background: #112244;',
        '  border-radius: 8px !important;',
        '  border: 3px solid #11ee11;',
        '}',
        '',
        '.bubble-icon {',
        '  color: #112233 !important;',
        '  --mdc-icon-size: 40px;',
        '}',
        '',
        '.bubble-name {',
        '  font-size: 22px;',
        '  font-weight: bold;',
        '  color: #ee1111;',
        '  font-family: monospace;',
        '}',
      ].join('\n'),
    );
    expect(back.border).toMatchObject(BORDER);
  });

  it('cover', () => {
    const { css } = roundTrip(full(false), COVER);
    expect(css).toBe(
      [
        '.bubble-background {',
        '  background: #112244;',
        '  border-radius: 0 !important;',
        '}',
        '',
        '.bubble-container {',
        '  border-radius: 8px;',
        '  border: 3px solid #11ee11;',
        '}',
        '',
        '.bubble-icon {',
        '  color: #112233 !important;',
        '  --mdc-icon-size: 40px;',
        '}',
        '',
        '.bubble-name,',
        '.bubble-state {',
        '  font-size: 22px;',
        '  font-weight: bold;',
        '  color: #ee1111;',
        '  font-family: monospace;',
        '}',
      ].join('\n'),
    );
  });

  it('a conditional gradient background round-trips', () => {
    const state = withState({
      background: { ...EMPTY.background, enabled: true, type: 'gradient', color1: '#ff0000', color2: '#0000ff', angle: 45, applyWhen: 'on' },
      border: { ...EMPTY.border, enabled: true, radiusPx: 0, borderWidth: 2, borderColor: '#00ff00' },
    });
    const css = generateCss(state, BTN);
    expect(css).toContain("background: {{ 'linear-gradient(45deg, #ff0000, #0000ff)' if is_state(config.entity, 'on') else '' }};");
    // The opacity companion rides on the same condition (else it changes the pill while off).
    expect(css).toContain("opacity: {{ '1' if is_state(config.entity, 'on') else '' }} !important;");
    const back = parse(css, BTN);
    expect(back.advanced.rawCss).toBe('');
    expect(back.background).toMatchObject({ enabled: true, type: 'gradient', applyWhen: 'on' });
  });

  it('icon colour in conditional and light modes is written on .bubble-icon and read back', () => {
    for (const mode of ['conditional', 'light'] as const) {
      const state = withState({
        iconColor: { ...EMPTY.iconColor, enabled: true, mode, colorOn: '#ffaa00', colorOff: '#555555', entityId: 'light.kitchen', sizePx: 0 },
      });
      const css = generateCss(state, BTN);
      expect(css.startsWith('.bubble-icon {\n  color: {{ ')).toBe(true);
      expect(css.endsWith(' !important;\n}')).toBe(true);
      const back = parse(css, BTN);
      expect(back.advanced.rawCss, mode).toBe('');
      expect(back.iconColor).toMatchObject({ enabled: true, mode });
    }
  });

  it('declarations the generator writes with !important are claimed with or without it', () => {
    const css = [
      '.bubble-button-background { background: #112244; opacity: 1; border-radius: 8px }',
      '.bubble-icon { color: #112233; --mdc-icon-size: 40px }',
    ].join('\n');
    const back = parse(css, BTN);
    expect(back.advanced.rawCss).toBe('');
    expect(back.background).toMatchObject(BG);
    expect(back.iconColor).toMatchObject({ enabled: true, color: '#112233', sizePx: 40 });
    expect(back.border).toMatchObject({ enabled: true, radiusPx: 8, borderWidth: 0 });
  });

  it('writes nothing for modules that are off', () => {
    expect(generateCss(EMPTY, BTN)).toBe('');
    expect(generateCss(EMPTY, SLIDER)).toBe('');
  });
});

describe('Bubble 3 profiles — styles written by 0.11.0-beta.2 (border and slider Background on the pill)', () => {
  const PILL_OLD = [
    '.bubble-button-background {',
    '  background: #112244;',
    '  opacity: 1 !important;',
    '  border-radius: 8px;',
    '  border: 3px solid #11ee11;',
    '}',
  ].join('\n');

  for (const [name, key, old] of [
    ['button', BTN, PILL_OLD],
    ['slider', SLIDER, PILL_OLD],
    ['cover', COVER, '.bubble-background {\n  background: #112244;\n  border-radius: 8px;\n  border: 3px solid #11ee11;\n}'],
  ] as const) {
    it(`${name}: the old shape parses into the same controls and re-saves in the current shape`, () => {
      const back = parse(old, key);
      expect(back.advanced.rawCss).toBe('');
      expect(back.background).toMatchObject(BG);
      expect(back.border).toMatchObject(BORDER);
      const css = generateCss(back, key);
      expect(css).toContain('.bubble-container {');
      expect(css).toContain('border: 3px solid #11ee11;');
      // the new shape is a fixed point
      const again = parse(css, key);
      expect(again.advanced.rawCss).toBe('');
      expect(generateCss(again, key)).toBe(css);
    });
  }

  it('slider: an old Background alone (with its opacity companion) is claimed whole', () => {
    const back = parse('.bubble-button-background {\n  background: #112244;\n  opacity: 1 !important;\n}', SLIDER);
    expect(back.background).toMatchObject(BG);
    expect(back.advanced.rawCss).toBe('');
    expect(generateCss(back, SLIDER)).toBe('.bubble-container {\n  background: #112244;\n}');
  });

  it('a pill radius with `!important` was never written by any version: it stays the user\'s', () => {
    const other = parse('.bubble-button-background { border-radius: 8px !important; }', SLIDER);
    expect(other.border.enabled).toBe(false);
    expect(other.advanced.rawCss).toContain('border-radius: 8px !important;');
  });

  it('a Border without width still resets the pieces (no corner slivers when only the radius is set)', () => {
    const css = generateCss(withState({ border: { ...EMPTY.border, enabled: true, radiusPx: 6, borderWidth: 0 } }), SLIDER);
    expect(css).toBe(
      [
        '.bubble-container {',
        '  border-radius: 6px;',
        '}',
        '',
        '.bubble-button-background {',
        '  border-radius: 0 !important;',
        '}',
        '',
        '.bubble-range-slider {',
        '  border-radius: 0 !important;',
        '}',
      ].join('\n'),
    );
    expect(parse(css, SLIDER).advanced.rawCss).toBe('');
  });

  it('a conditional Background on the slider needs no opacity companion', () => {
    const state = withState({
      background: { ...EMPTY.background, ...BG, applyWhen: 'on', entityId: 'input_boolean.x' } as never,
    });
    const css = generateCss(state, SLIDER);
    expect(css).not.toContain('opacity');
    expect(css.startsWith('.bubble-container {')).toBe(true);
    expect(parse(css, SLIDER).background.enabled).toBe(true);
    expect(parse(css, SLIDER).advanced.rawCss).toBe('');
  });
});

describe('Bubble 3 profiles — hidden modules, hand-written CSS and conflicts', () => {
  it('hand-written CSS for a hidden module stays verbatim in Advanced CSS', () => {
    const raw = [
      'ha-card {\n  --accent-color: red;\n}',
      '.bubble-range-fill {\n  background-color: blue !important;\n}',
      '.bubble-line {\n  background-color: green;\n}',
      '.bubble-main-icon-container {\n  background-color: pink;\n}',
    ].join('\n\n');
    // on the plain button the slider fill rule and --accent-color are nobody's
    const back = parse(raw, BTN);
    expect(back.accentColor.enabled).toBe(false);
    expect(back.advanced.rawCss).toBe(raw);
    // …and a save with an unrelated module on keeps it, after our output
    const out = generateCss({ ...back, font: { ...EMPTY.font, ...FONT } }, BTN);
    expect(out.endsWith(raw)).toBe(true);
  });

  it('on the slider the fill rule IS Accent; an own opacity value is not claimed', () => {
    const css = '.bubble-range-fill {\n  background-color: #ee1111 !important;\n  opacity: 0.5 !important;\n}';
    const back = parse(css, SLIDER);
    expect(back.accentColor).toMatchObject(ACCENT);
    expect(back.advanced.rawCss).toBe('.bubble-range-fill {\n  opacity: 0.5 !important;\n}');
  });

  it('does not adopt built-in icon-colour shapes on a Bubble card', () => {
    const raw = 'ha-icon {\n  color: red;\n}\n\nha-card {\n  --state-icon-color: blue;\n}';
    const back = parse(raw, BTN);
    expect(back.iconColor.enabled).toBe(false);
    expect(back.advanced.rawCss).toBe(raw);
  });

  it('does not read a plain background-color on the pill as the module (the generator writes `background`)', () => {
    const raw = '.bubble-button-background {\n  background-color: red;\n}';
    const back = parse(raw, BTN);
    expect(back.background.enabled).toBe(false);
    expect(back.advanced.rawCss).toBe(raw);
  });

  it('Threshold state writes nothing on a Bubble card (module hidden)', () => {
    const state = withState({
      threshold: {
        ...EMPTY.threshold, enabled: true, entityId: 'sensor.t', properties: ['icon-color', 'background'],
        rules: [{ id: 'r', operator: '>', value: 1, color: '#ee1111' }], defaultColor: '#11ee11',
      } as never,
    });
    expect(generateCss(state, BTN)).toBe('');
    expect(filterPresetStateForCardType(state, BTN).threshold.enabled).toBe(false);
  });

  it('conflict rows: hand-written rules on the same selectors', () => {
    const raw = [
      '.bubble-name { font-size: 30px }',
      '.bubble-state { color: red }',
      '.bubble-icon { color: red }',
      '.bubble-button-background { background: red; opacity: 0.2 }',
      '.bubble-container { border: 1px solid blue }',
    ].join('\n');
    const state = full(false);
    expect(findAdvancedCssConflicts(raw, state, BTN)).toEqual({
      font: ['.bubble-name { font-size }', '.bubble-state { color }'],
      iconColor: ['.bubble-icon { color }'],
      background: ['.bubble-button-background { background }', '.bubble-button-background { opacity }'],
      border: ['.bubble-container { border }'],
    });
    // a module that is off raises nothing
    expect(findAdvancedCssConflicts(raw, EMPTY, BTN)).toEqual({});
  });

  it('conflict row for the slider fill', () => {
    const raw = '.bubble-range-fill { background-color: blue }';
    expect(findAdvancedCssConflicts(raw, withState({ accentColor: { ...EMPTY.accentColor, ...ACCENT } }), SLIDER)).toEqual({
      accentColor: ['.bubble-range-fill { background-color }'],
    });
  });
});

describe('Bubble card_type resolution', () => {
  it('missing card_type: bare key, no profile, today\'s default (Bubble renders an error card)', () => {
    const cfg = { type: 'custom:bubble-card', entity: 'light.kitchen' };
    expect(profileKeyOf(cfg)).toBe('custom:bubble-card');
    expect(getCustomCardProfile(profileKeyOf(cfg))).toBeUndefined();
    expect(capsFor(profileKeyOf(cfg)).custom).toBe(false);
    expect(capsFor(profileKeyOf(cfg)).modules.accentColor).toBe(true);
  });

  it('button_type picks the slider profile only on a button', () => {
    expect(profileKeyOf({ type: 'custom:bubble-card', card_type: 'button', button_type: 'slider' })).toBe(SLIDER);
    expect(profileKeyOf({ type: 'custom:bubble-card', card_type: 'button', button_type: 'state' })).toBe(BTN);
    expect(profileKeyOf({ type: 'custom:bubble-card', card_type: 'separator' })).toBe(SEP);
    expect(profileKeyOf({ type: 'custom:bubble-card', card_type: 'cover', entity: 'cover.x' })).toBe(COVER);
  });
});

describe('Bubble own `styles:` and unknown keys are preserved untouched (C3.3)', () => {
  const originalRegistry = globalThis.customElements;
  afterEach(() => {
    (globalThis as { customElements: unknown }).customElements = originalRegistry;
  });
  const install = (...tags: string[]) => {
    const reg = new Map<string, unknown>(tags.map((t) => [t, class {}]));
    (globalThis as { customElements: unknown }).customElements = { get: (n: string) => reg.get(n), define: () => {} };
  };

  const STYLES = '.bubble-name {\n  color: orange !important;\n}\n\n.bubble-container {\n  --bubble-icon-color: red;\n}\n';
  const CARD = {
    type: 'custom:bubble-card',
    card_type: 'button',
    entity: 'light.kitchen',
    name: 'Kitchen',
    button_type: 'switch',
    styles: STYLES,
    modules: ['default', 'my-module'],
    show_state: true,
    tap_action: { action: 'toggle' },
    sub_button: [{ entity: 'light.kitchen', show_state: true }],
    some_future_option: { nested: [1, 2, 3] },
  } as unknown as CardModCardConfig;

  const withoutStyle = (c: CardModCardConfig) => {
    const { card_mod: _a, uix: _b, ...rest } = c as unknown as Record<string, unknown>;
    return rest;
  };

  it('every write leaves styles: and all unknown keys deep-equal (card-mod)', () => {
    install('card-mod');
    const state = buildMergedStudioState(CARD);
    state.font = { ...state.font, ...FONT };
    state.background = { ...state.background, ...BG };
    const saved = applyStudioState(state, CARD);
    expect(saved.card_mod?.style).toContain('.bubble-name,\n.bubble-state {');
    expect(withoutStyle(saved)).toEqual(withoutStyle(CARD));
    expect((saved as unknown as { styles: string }).styles).toBe(STYLES);
    // second write (modules off again) still leaves them alone
    const reopened = buildMergedStudioState(saved);
    expect(reopened.font).toMatchObject(FONT);
    expect(reopened.advanced.rawCss).toBe('');
    const cleared = applyStudioState({ ...reopened, font: { ...reopened.font, enabled: false }, background: { ...reopened.background, enabled: false } }, saved);
    expect(withoutStyle(cleared)).toEqual(withoutStyle(CARD));
  });

  it('same on UIX (uix: key) and for the slider card', () => {
    install('uix-node');
    const sliderCard = { ...CARD, button_type: 'slider' } as unknown as CardModCardConfig;
    const state = buildMergedStudioState(sliderCard, { config: { components: ['uix'] } } as never);
    state.accentColor = { ...state.accentColor, ...ACCENT };
    const saved = applyStudioState(state, sliderCard, { config: { components: ['uix'] } } as never);
    expect((saved as { uix?: { style?: string } }).uix?.style).toBe(
      '.bubble-range-fill {\n  background-color: #ee1111 !important;\n  opacity: 1 !important;\n}',
    );
    expect(withoutStyle(saved)).toEqual(withoutStyle(sliderCard));
  });
});

describe('a Bubble card inside a stack (cms-child-card-section path)', () => {
  const originalRegistry = globalThis.customElements;
  afterEach(() => {
    (globalThis as { customElements: unknown }).customElements = originalRegistry;
  });
  const STACK = {
    type: 'vertical-stack',
    cards: [
      { type: 'custom:bubble-card', card_type: 'button', entity: 'light.kitchen' },
      { type: 'custom:bubble-card', card_type: 'separator', name: 'Rooms' },
      { type: 'custom:bubble-card', card_type: 'pop-up', hash: '#x' },
    ],
  } as unknown as CardModCardConfig;
  const child = (i: number) => (STACK as unknown as { cards: CardModCardConfig[] }).cards[i];

  it('keys, gates and saves a child exactly like the top-level card', () => {
    (globalThis as { customElements: unknown }).customElements = {
      get: (n: string) => (n === 'card-mod' ? class {} : undefined), define: () => {},
    };
    expect(profileKeyOf(child(0))).toBe(BTN);
    expect(capsFor(profileKeyOf(child(0)), child(0) as never).modules.accentColor).toBe(false);
    expect(capsFor(profileKeyOf(child(1)), child(1) as never).stateAwareByDefault).toBe(false);
    expect(capsFor(profileKeyOf(child(2))).custom).toBe(false); // pop-up: today's default

    const state = buildMergedStudioState(child(0));
    state.font = { ...state.font, ...FONT };
    state.iconColor = { ...state.iconColor, ...ICON };
    const saved = applyStudioState(state, child(0));
    expect(saved.card_mod?.style).toBe(
      [
        '.bubble-icon {',
        '  color: #112233 !important;',
        '  --mdc-icon-size: 40px;',
        '}',
        '',
        '.bubble-name,',
        '.bubble-state {',
        '  font-size: 22px;',
        '  font-weight: bold;',
        '  color: #ee1111;',
        '  font-family: monospace;',
        '}',
      ].join('\n'),
    );
    const reopened = buildMergedStudioState(saved);
    expect(reopened.advanced.rawCss).toBe('');
    expect(reopened.font).toMatchObject(FONT);
    expect(reopened.iconColor).toMatchObject(ICON);
    // siblings untouched
    expect(child(1)).toEqual({ type: 'custom:bubble-card', card_type: 'separator', name: 'Rooms' });
  });
});

describe('Bubble 3 profiles — Icon size limit (card height, measured per layout)', () => {
  const cfg = (card_type: string, extra: Record<string, unknown> = {}) => ({ type: 'custom:bubble-card', card_type, ...extra });
  it('button / slider / cover stop at the card height: 50 normal, 56 large', () => {
    for (const c of [cfg('button'), cfg('button', { button_type: 'slider' }), cfg('cover')]) {
      expect(iconSizeMaxOf(c)).toBe(50);
      expect(iconSizeMaxOf({ ...c, card_layout: 'normal' })).toBe(50);
      expect(iconSizeMaxOf({ ...c, card_layout: 'large' })).toBe(56);
      expect(iconSizeMaxOf({ ...c, card_layout: 'large-2-rows' })).toBe(56);
    }
  });
  it('the separator row is 40px (33 large)', () => {
    expect(iconSizeMaxOf(cfg('separator'))).toBe(40);
    expect(iconSizeMaxOf(cfg('separator', { card_layout: 'large' }))).toBe(33);
  });
  it('a sections view applies `large` only while card_layout is absent', () => {
    expect(iconSizeMaxOf(cfg('button'), { sectionsView: true })).toBe(56);
    expect(iconSizeMaxOf(cfg('button', { card_layout: 'normal' }), { sectionsView: true })).toBe(50);
  });
  it('no limit for other cards (the control keeps its range)', () => {
    expect(iconSizeMaxOf({ type: 'tile' })).toBeUndefined();
    expect(iconSizeMaxOf(cfg('climate'))).toBeUndefined();
  });
});

describe('Bubble 3 profiles — controls whose target the card config removes (configGates)', () => {
  const base = (card_type: string, extra: Record<string, unknown> = {}) => ({ type: 'custom:bubble-card', card_type, ...extra });
  const keys = [BTN, SLIDER, COVER];
  const cfgOf = (k: string, extra: Record<string, unknown>) =>
    base(k === COVER ? 'cover' : 'button', { ...(k === SLIDER ? { button_type: 'slider' } : {}), ...extra });

  it('show_icon: false hides Icon Color (colour and size); anything else keeps it', () => {
    for (const k of keys) {
      expect(capsFor(k, cfgOf(k, { show_icon: false })).modules.iconColor, k).toBe(false);
      expect(capsFor(k, cfgOf(k, { show_icon: true })).modules.iconColor, k).toBe(true);
      expect(capsFor(k, cfgOf(k, {})).modules.iconColor, k).toBe(true);
      // the other modules stay
      expect(capsFor(k, cfgOf(k, { show_icon: false })).modules.font, k).toBe(true);
    }
  });

  it('Font hides only when name AND state are both off (state is off by default)', () => {
    for (const k of keys) {
      const font = (extra: Record<string, unknown>) => capsFor(k, cfgOf(k, extra)).modules.font;
      expect(font({}), k).toBe(true);
      expect(font({ show_name: false }), k).toBe(false);
      expect(font({ show_name: false, show_state: false }), k).toBe(false);
      expect(font({ show_name: false, show_state: true }), k).toBe(true);
      expect(font({ show_name: true, show_state: false }), k).toBe(true);
      expect(font({ show_state: true }), k).toBe(true);
    }
  });

  it('a card without config (or the separator) is not gated', () => {
    for (const k of keys) expect(capsFor(k).modules).toMatchObject({ iconColor: true, font: true });
    expect(capsFor(SEP, { show_icon: false, show_name: false }).modules).toMatchObject({ iconColor: true, font: true });
  });

  it('capsFor(...).iconSizeMax is the profile limit: normal unless card_layout says large', () => {
    for (const k of [BTN, SLIDER, COVER]) {
      expect(capsFor(k, cfgOf(k, {})).iconSizeMax, k).toBe(50);
      expect(capsFor(k, cfgOf(k, { card_layout: 'large' })).iconSizeMax, k).toBe(56);
      expect(capsFor(k).iconSizeMax, k).toBe(50);
    }
    expect(capsFor(SEP, base('separator')).iconSizeMax).toBe(40);
    expect(capsFor(SEP, base('separator', { card_layout: 'large' })).iconSizeMax).toBe(33);
    expect(capsFor('tile').iconSizeMax).toBe(36);
  });

  it('the picker skips a hidden module (no pointing at what is not on screen)', () => {
    const chain = [{ tag: 'ha-icon', id: '', classes: ['bubble-main-icon', 'bubble-icon', 'icon'] }, { tag: 'div', id: '', classes: ['bubble-button-container', 'bubble-container'] }];
    expect(mapElementToTarget(chain, BTN, cfgOf(BTN, {}))?.module).toBe('cms-icon-color-module');
    expect(mapElementToTarget(chain, BTN, cfgOf(BTN, { show_icon: false }))?.module).not.toBe('cms-icon-color-module');
  });
});

describe('Bubble 3 profiles — click-to-edit with geometry (hit map measured on a 338x50 slider at 40 %)', () => {
  const R = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });
  const el = (tag: string, classes: string[], rect: ReturnType<typeof R>, textRect: ReturnType<typeof R> | null = null) => ({ tag, id: '', classes, rect, textRect });
  // card at 0..338 x 0..50; the fill is a full-width bar shifted left (visible 0..135)
  const card = R(0, 0, 338, 50);
  const container = el('div', ['bubble-button-container', 'bubble-container'], card);
  const wrapper = el('div', ['bubble-button', 'bubble-wrapper'], card);
  const fill = el('div', ['bubble-range-fill'], R(-203, 0, 135, 50));
  const nameText = R(50, 8, 110, 24);
  const name = el('div', ['bubble-name'], R(50, 8, 320, 26), nameText);
  const nameContainer = el('div', ['bubble-name-container'], R(50, 7, 320, 43));
  const under = [container, wrapper, fill, nameContainer, name];
  const at = (x: number, y: number, chain: ReturnType<typeof el>[]) =>
    mapElementToMatch(chain, SLIDER, {}, { x, y, under: under.filter((u) => x >= u.rect.left && x <= u.rect.right && y >= u.rect.top && y <= u.rect.bottom) });

  it('text maps to Font only over the text; the rest of its block falls through', () => {
    expect(at(70, 15, [name, nameContainer, wrapper, container])?.target.module).toBe('cms-font-module');
    expect(at(70, 15, [name, nameContainer, wrapper, container])?.rect).toEqual(nameText);
    // empty block to the right of the text, over the fill -> Accent; over the track -> Background
    expect(at(120, 15, [name, nameContainer, wrapper, container])?.target.module).toBe('cms-accent-color-module');
    expect(at(250, 15, [name, nameContainer, wrapper, container])?.target.module).toBe('cms-background-module');
  });

  it('the filled part maps to Accent and highlights the fill element, the track to Background', () => {
    const m = at(100, 45, [wrapper, container])!;
    expect(m.target.module).toBe('cms-accent-color-module');
    expect(m.rect).toEqual(fill.rect);
    expect(at(300, 45, [wrapper, container])?.target.module).toBe('cms-background-module');
  });

  it('the icon box stays Icon Color over the fill', () => {
    const icon = el('div', ['bubble-icon-container'], R(6, 6, 44, 44));
    expect(at(10, 10, [icon, wrapper, container])?.target.module).toBe('cms-icon-color-module');
  });

  it('cover arrows are not Icon Color (no module styles them): Background', () => {
    const arrow = el('ha-icon', ['bubble-cover-button-icon', 'bubble-icon-open'], R(300, 15, 320, 35));
    const btn = el('div', ['bubble-cover-button', 'bubble-button'], R(296, 7, 332, 43));
    const cont = el('div', ['bubble-cover-container', 'bubble-container'], card);
    expect(mapElementToMatch([arrow, btn, cont], COVER, {}, { x: 310, y: 25 })?.target.module).toBe('cms-background-module');
  });

  it('without geometry (pure callers) the plain class match applies', () => {
    expect(mapElementToTarget([{ tag: 'div', id: '', classes: ['bubble-name'] }, { tag: 'div', id: '', classes: ['bubble-container'] }], BTN, {})?.module).toBe('cms-font-module');
  });
});

describe('Stack child header: a readable kind instead of the raw type', () => {
  it('Bubble kinds', () => {
    const b = (extra: Record<string, unknown>) => childKindLabel({ type: 'custom:bubble-card', ...extra });
    expect(b({ card_type: 'button' })).toBe('Bubble button');
    expect(b({ card_type: 'button', button_type: 'slider' })).toBe('Bubble slider');
    expect(b({ card_type: 'separator' })).toBe('Bubble separator');
    expect(b({ card_type: 'cover' })).toBe('Bubble cover');
  });
  it('profiled Mushroom cards read "Mushroom <kind>"', () => {
    expect(childKindLabel({ type: 'custom:mushroom-light-card' })).toBe('Mushroom light');
    expect(childKindLabel({ type: 'custom:mushroom-alarm-control-panel-card' })).toBe('Mushroom alarm control panel');
    expect(childKindLabel({ type: 'custom:mushroom-chips-card' })).toBe('Mushroom chips');
  });
  it('everything else keeps its type (built-ins, unprofiled custom cards, a Bubble card without card_type)', () => {
    expect(childKindLabel({ type: 'tile' })).toBe('tile');
    expect(childKindLabel({ type: 'custom:bubble-card', card_type: 'pop-up' })).toBe('custom:bubble-card');
    expect(childKindLabel({ type: 'custom:bubble-card' })).toBe('custom:bubble-card');
    expect(childKindLabel({ type: 'custom:some-other-card' })).toBe('custom:some-other-card');
    expect(childKindLabel({})).toBe('');
  });
});

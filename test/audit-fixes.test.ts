/**
 * Regression tests for the v0.9.1 full-codebase audit fixes (2026-08).
 * Each test inverts a REPRODUCED bug from the two audit agents' reports —
 * IDs (D1, W2, …) reference the ranked findings recorded in CHANGELOG 0.9.1.
 */

import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { applyCardModStyle } from '../src/generator/yaml-generator.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';
import {
  mapToStudioState,
  DEFAULT_FILTER,
  DEFAULT_ICON_COLOR,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_BACKGROUND,
  DEFAULT_ANIMATION,
  DEFAULT_BORDER,
  DEFAULT_HEADING_STYLE,
  DEFAULT_FONT,
  DEFAULT_THRESHOLD,
} from '../src/parser/state-mapper.js';
import type { StudioState, CardModCardConfig } from '../src/types/index.js';

function makeState(overrides: Partial<StudioState> = {}): StudioState {
  return {
    filter: { ...DEFAULT_FILTER },
    iconColor: { ...DEFAULT_ICON_COLOR },
    accentColor: { ...DEFAULT_ACCENT_COLOR },
    background: { ...DEFAULT_BACKGROUND },
    animation: { ...DEFAULT_ANIMATION },
    border: { ...DEFAULT_BORDER },
    headingStyle: { ...DEFAULT_HEADING_STYLE },
    font: { ...DEFAULT_FONT },
    threshold: { ...DEFAULT_THRESHOLD },
    advanced: { rawCss: '' },
    ...overrides,
  };
}

const roundTrip = (css: string, cardType = 'tile') => {
  const parsed = parseCardModConfig({ type: cardType, card_mod: { style: css } } as CardModCardConfig);
  const state = mapToStudioState(parsed, cardType);
  return { state, css: generateCss(state, cardType) };
};

describe('D1 — braces in comments / stray braces no longer wipe the style', () => {
  it('preserves blocks after a `}` inside a comment', () => {
    const css = '/* } */\nha-card {\n  color: red;\n}';
    const { css: out } = roundTrip(css);
    expect(out).toContain('color: red');
  });

  it('a stray leading `}` does not desync following blocks', () => {
    const css = '}\nha-card {\n  color: red;\n}';
    const { css: out } = roundTrip(css);
    expect(out).toContain('color: red');
  });
});

describe('D2 — semicolons inside url()/quotes survive round-trip', () => {
  it('base64 data URI stays one intact declaration', () => {
    const css = 'ha-card {\n  background-image: url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\'></svg>");\n}';
    const { css: out } = roundTrip(css);
    expect(out).toContain("url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'></svg>\")");
    expect(out).not.toContain('http: //');
  });
});

describe('D3 — card_mod.class / debug survive saves and clears', () => {
  const config = {
    type: 'tile', entity: 'light.a',
    card_mod: { class: 'compact', debug: true, style: 'ha-card {\n  color: red;\n}' },
  } as unknown as CardModCardConfig;

  it('a card_mod-keyed save keeps class/debug', () => {
    const next = applyCardModStyle('ha-card {\n  color: blue;\n}', config, 'card_mod');
    expect(next.card_mod?.class).toBe('compact');
    expect(next.card_mod?.debug).toBe(true);
    expect(next.card_mod?.style).toBe('ha-card {\n  color: blue;\n}');
  });

  it('clearing all styling keeps class/debug (only .style removed)', () => {
    const next = applyCardModStyle('', config, 'card_mod');
    expect(next.card_mod?.class).toBe('compact');
    expect(next.card_mod?.style).toBeUndefined();
  });

  it('a uix-keyed save keeps the vacated card_mod siblings', () => {
    const next = applyCardModStyle('ha-card {\n  color: blue;\n}', config, 'uix');
    expect(next.card_mod?.class).toBe('compact');
    expect(next.card_mod?.style).toBeUndefined();
    expect(next.uix?.style).toBe('ha-card {\n  color: blue;\n}');
  });
});

describe('W1 — off-side custom-entity conditionals stay unclaimed (were inverted)', () => {
  it('filter: grayscale on the OFF side of another entity → Advanced CSS', () => {
    const css = "ha-card {\n  filter: {{ 'grayscale(100%)' if is_state('switch.other', 'off') else 'none' }};\n}";
    const { state } = roundTrip(css);
    expect(state.filter.grayscale).toBe(false);
    expect(state.advanced.rawCss).toContain("is_state('switch.other', 'off')");
  });

  it('background on the OFF side of another entity → Advanced CSS', () => {
    const css = "ha-card {\n  background: {{ 'red' if is_state('switch.other', 'off') else 'none' }};\n}";
    const { state } = roundTrip(css);
    expect(state.background.enabled).toBe(false);
    expect(state.advanced.rawCss).toContain("is_state('switch.other', 'off')");
  });

  it('animation on the OFF side of another entity → Advanced CSS (entity was dropped before)', () => {
    const css = "ha-card {\n  animation: {{ 'none' if is_state('switch.other', 'on') else 'cms-pulse 2s ease-in-out infinite' }};\n}";
    const { state } = roundTrip(css);
    expect(state.animation.enabled).toBe(false);
    expect(state.advanced.rawCss).toContain('switch.other');
  });
});

describe('W2 — filter adoption only claims exactly-expressible filters', () => {
  it('grayscale(50%) is NOT rewritten to 100%', () => {
    const css = 'ha-card {\n  filter: grayscale(50%);\n}';
    const { state, css: out } = roundTrip(css);
    expect(state.filter.grayscale).toBe(false);
    expect(out).toContain('grayscale(50%)');
  });

  it('gray branch with ride-along effects but else-"none" is NOT claimed (brightness was dropped)', () => {
    const css = "ha-card {\n  filter: {{ 'grayscale(100%) brightness(80%)' if is_state(config.entity, 'off') else 'none' }};\n}";
    const { state, css: out } = roundTrip(css);
    expect(state.filter.grayscale).toBe(false);
    expect(out).toContain('brightness(80%)');
  });

  it('transition: all is NOT narrowed to transition: filter', () => {
    const css = 'ha-card {\n  filter: blur(4px);\n  transition: all 0.3s ease;\n}';
    const { css: out } = roundTrip(css);
    expect(out).toContain('transition: all 0.3s ease');
  });

  it('an all-defaults filter list (brightness(100%)) is not claimed-then-deleted', () => {
    const css = 'ha-card {\n  filter: brightness(100%);\n}';
    const { css: out } = roundTrip(css);
    expect(out).toContain('brightness(100%)');
  });
});

describe('W3 — gradient marker claimed on every threshold property block', () => {
  it('multi-property gradient threshold leaves no orphan marker in Advanced CSS', () => {
    const state = makeState({
      threshold: {
        ...DEFAULT_THRESHOLD,
        enabled: true,
        entityId: 'sensor.t',
        properties: ['icon-color', 'background'],
        valueMode: 'gradient',
        colorStops: [
          { id: 'a', value: 0, color: '#9e9e9e' },
          { id: 'b', value: 100, color: '#f44336' },
        ],
      } as StudioState['threshold'],
    });
    const css = generateCss(state, 'glance');
    const parsed = parseCardModConfig({ type: 'glance', card_mod: { style: css } } as CardModCardConfig);
    const reState = mapToStudioState(parsed, 'glance');
    expect(reState.advanced.rawCss).not.toContain('--cms-gradient-stops');
    expect(generateCss(reState, 'glance')).toBe(css);
  });
});

describe('W4 — accent companion vars are not re-adopted as threshold icon-color', () => {
  it('a tile accent threshold keeps properties: [accent-color] on reopen', () => {
    const state = makeState({
      threshold: {
        ...DEFAULT_THRESHOLD,
        enabled: true,
        entityId: 'sensor.t',
        properties: ['accent-color'],
        rules: [{ id: 'r1', operator: '>', value: 30, color: '#ff0000' }],
      } as StudioState['threshold'],
    });
    const css = generateCss(state, 'tile');
    const { state: reState, css: out } = roundTrip(css, 'tile');
    expect(reState.threshold.properties).toEqual(['accent-color']);
    expect(out).toBe(css);
  });
});

describe('W5 — icon size survives threshold-owned icon color', () => {
  it('round-trips sizePx with threshold icon-color on a sensor card', () => {
    const state = makeState({
      iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'plain', color: '#ff0000', sizePx: 32 },
      threshold: {
        ...DEFAULT_THRESHOLD,
        enabled: true,
        entityId: 'sensor.t',
        properties: ['icon-color'],
        rules: [{ id: 'r1', operator: '>', value: 30, color: '#ff0000' }],
      } as StudioState['threshold'],
    });
    const css = generateCss(state, 'sensor');
    const { state: reState, css: out } = roundTrip(css, 'sensor');
    expect(reState.iconColor.enabled).toBe(true);
    expect(reState.iconColor.sizePx).toBe(32);
    expect(reState.advanced.rawCss).not.toContain('--mdc-icon-size');
    expect(out).toBe(css);
  });
});

describe('W7 — palette var()/rgb() colors in border and gradient', () => {
  it('border with a var() color round-trips into the module', () => {
    const css = 'ha-card {\n  border: 2px solid var(--red-color);\n}';
    const { state } = roundTrip(css);
    expect(state.border.enabled).toBe(true);
    expect(state.border.borderColor).toBe('var(--red-color)');
  });

  it('gradient with var()/rgb() colors round-trips as a gradient', () => {
    const css = 'ha-card {\n  background: linear-gradient(135deg, var(--red-color), rgb(0, 128, 255));\n}';
    const { state } = roundTrip(css);
    expect(state.background.enabled).toBe(true);
    expect(state.background.type).toBe('gradient');
    expect(state.background.color1).toBe('var(--red-color)');
    expect(state.background.color2).toBe('rgb(0, 128, 255)');
    expect(state.background.angle).toBe(135);
  });
});

describe('W8 — incomplete conditions degrade to the UNCONDITIONAL form', () => {
  it('background custom without entity is unconditional (was inverted to off)', () => {
    const css = generateCss(
      makeState({ background: { ...DEFAULT_BACKGROUND, enabled: true, color1: '#112233', applyWhen: 'custom' } }),
      'tile',
    );
    expect(css).toContain('background: #112233;');
    expect(css).not.toContain('is_state');
  });

  it('grayscale custom without entity is unconditional (was silently on)', () => {
    const css = generateCss(
      makeState({ filter: { ...DEFAULT_FILTER, enabled: true, grayscale: true, grayscaleWhen: 'custom' } }),
      'tile',
    );
    expect(css).toContain('filter: grayscale(100%);');
    expect(css).not.toContain('is_state');
  });

  it('custom animation without entity emits unconditional animation (no orphan keyframes)', () => {
    const css = generateCss(
      makeState({ animation: { ...DEFAULT_ANIMATION, enabled: true, preset: 'pulse', speedS: 2, trigger: 'custom' } }),
      'tile',
    );
    expect(css).toContain('animation: cms-pulse 2s ease-in-out infinite;');
    expect(css).toContain('@keyframes cms-pulse');
  });
});

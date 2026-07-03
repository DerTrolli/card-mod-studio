/**
 * Unit tests for the Phase 3/4 generator pipeline:
 *   generateCss + applyCardModStyle
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateCss, sortThresholdRules } from '../src/generator/css-generator.js';
import { applyCardModStyle, pickOutputKey } from '../src/generator/yaml-generator.js';
import {
  DEFAULT_FILTER,
  DEFAULT_ICON_COLOR,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_BACKGROUND,
  DEFAULT_ANIMATION,
  DEFAULT_BORDER,
  DEFAULT_HEADING_STYLE,
  DEFAULT_THRESHOLD,
  mapToStudioState,
} from '../src/parser/state-mapper.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';
import type { StudioState, CardModCardConfig } from '../src/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<StudioState> = {}): StudioState {
  return {
    filter: { ...DEFAULT_FILTER },
    iconColor: { ...DEFAULT_ICON_COLOR },
    accentColor: { ...DEFAULT_ACCENT_COLOR },
    background: { ...DEFAULT_BACKGROUND },
    animation: { ...DEFAULT_ANIMATION },
    border: { ...DEFAULT_BORDER },
    headingStyle: { ...DEFAULT_HEADING_STYLE },
    threshold: { ...DEFAULT_THRESHOLD },
    advanced: { rawCss: '' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateCss — empty state
// ---------------------------------------------------------------------------

describe('generateCss — empty state', () => {
  it('returns empty string when all modules are disabled', () => {
    expect(generateCss(makeState())).toBe('');
  });
});

// ---------------------------------------------------------------------------
// generateCss — filter module
// ---------------------------------------------------------------------------

describe('generateCss — filter', () => {
  it('emits grayscale-when-off conditional', () => {
    const css = generateCss(
      makeState({ filter: { ...DEFAULT_FILTER, enabled: true, grayscale: true, grayscaleWhen: 'off' } }),
    );
    expect(css).toContain("{{ 'grayscale(100%)' if is_state(config.entity, 'off') else 'none' }}");
    expect(css).toContain('ha-card');
  });

  it('emits plain brightness filter when no grayscale', () => {
    const css = generateCss(
      makeState({ filter: { ...DEFAULT_FILTER, enabled: true, brightness: 70 } }),
    );
    expect(css).toContain('filter: brightness(70%);');
  });

  it('combines grayscale + brightness + blur in off-value', () => {
    const css = generateCss(
      makeState({
        filter: {
          ...DEFAULT_FILTER,
          enabled: true,
          grayscale: true,
          grayscaleWhen: 'off',
          brightness: 80,
          blur: 3,
        },
      }),
    );
    expect(css).toContain('grayscale(100%) brightness(80%) blur(3px)');
    expect(css).toContain("else 'brightness(80%) blur(3px)'");
  });

  it('emits grayscale always (no conditional)', () => {
    const css = generateCss(
      makeState({ filter: { ...DEFAULT_FILTER, enabled: true, grayscale: true, grayscaleWhen: 'always' } }),
    );
    expect(css).toContain('filter: grayscale(100%);');
    expect(css).not.toContain('is_state');
  });

  it('emits transition only when filter is present', () => {
    const css = generateCss(
      makeState({ filter: { ...DEFAULT_FILTER, enabled: true, grayscale: true, grayscaleWhen: 'off', transitionMs: 500 } }),
    );
    expect(css).toContain('transition: filter 500ms ease;');
  });

  it('does NOT emit transition when filter produces no declarations', () => {
    const css = generateCss(
      makeState({ filter: { ...DEFAULT_FILTER, enabled: true } }),
    );
    expect(css).toBe('');
  });
});

// ---------------------------------------------------------------------------
// generateCss — icon color module
// ---------------------------------------------------------------------------

describe('generateCss — icon color', () => {
  it('emits conditional color on ha-state-icon', () => {
    const css = generateCss(
      makeState({
        iconColor: { enabled: true, mode: 'conditional', color: '#2196F3', colorOn: '#2196F3', colorOff: '#6b6b6b' },
      }),
    );
    expect(css).toContain('ha-state-icon');
    expect(css).toContain("'#2196F3' if is_state(config.entity, 'on') else '#6b6b6b'");
    expect(css).toContain('!important');
  });

  it('emits plain static color on ha-state-icon', () => {
    const css = generateCss(
      makeState({
        iconColor: { enabled: true, mode: 'plain', color: 'yellow', colorOn: 'yellow', colorOff: '#6b6b6b' },
      }),
    );
    expect(css).toContain('ha-state-icon');
    expect(css).toContain('color: yellow !important;');
    expect(css).not.toContain('is_state');
  });
});

// ---------------------------------------------------------------------------
// generateCss — accent color module
// ---------------------------------------------------------------------------

describe('generateCss — accent color', () => {
  it('emits --accent-color on ha-card', () => {
    const css = generateCss(
      makeState({ accentColor: { enabled: true, color: 'yellow' } }),
    );
    expect(css).toContain('--accent-color: yellow;');
    expect(css).toContain('ha-card');
  });

  it('does not emit --accent-color when disabled', () => {
    const css = generateCss(makeState({ accentColor: { enabled: false, color: 'yellow' } }));
    expect(css).not.toContain('--accent-color');
  });

  it('emits --accent-color with hex value', () => {
    const css = generateCss(
      makeState({ accentColor: { enabled: true, color: '#03a9f4' } }),
    );
    expect(css).toContain('--accent-color: #03a9f4;');
  });

  it('conditional mode emits an is_state() ternary using config.entity by default', () => {
    const css = generateCss(makeState({
      accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'conditional', colorOn: '#00ff00', colorOff: '#888888' },
    }));
    expect(css).toContain("is_state(config.entity, 'on')");
    expect(css).toContain("'#00ff00'");
    expect(css).toContain("'#888888'");
  });

  it('conditional mode targets a custom entity when entityId is set (not the card\'s own)', () => {
    const css = generateCss(makeState({
      accentColor: {
        ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'conditional',
        colorOn: '#00ff00', colorOff: '#888888', entityId: 'binary_sensor.preheat_active',
      },
    }));
    expect(css).toContain("is_state('binary_sensor.preheat_active', 'on')");
    expect(css).not.toContain('config.entity');
  });

  it('conditional mode substitutes into per-card-type variables too (e.g. tile)', () => {
    const css = generateCss(
      makeState({
        accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'conditional', colorOn: '#00ff00', colorOff: '#888888' },
      }),
      'tile',
    );
    const tileMatch = css.match(/--tile-color: (\{\{[^\n]*\}\});/);
    const accentMatch = css.match(/--accent-color: (\{\{[^\n]*\}\});/);
    expect(tileMatch?.[1]).toBe(accentMatch?.[1]);
  });

  it('round-trips a custom-entity conditional accent color', () => {
    const original =
      "ha-card {\n  --accent-color: {{ '#00ff00' if is_state('binary_sensor.preheat_active', 'on') else '#888888' }};\n}";
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: original } });
    const state = mapToStudioState(parsed);
    expect(state.accentColor.enabled).toBe(true);
    expect(state.accentColor.mode).toBe('conditional');
    expect(state.accentColor.entityId).toBe('binary_sensor.preheat_active');
    expect(state.accentColor.colorOn).toBe('#00ff00');
    expect(state.accentColor.colorOff).toBe('#888888');
    expect(state.advanced.rawCss).toBe('');
  });
});

// ---------------------------------------------------------------------------
// generateCss — background module
// ---------------------------------------------------------------------------

describe('generateCss — background', () => {
  it('emits solid background', () => {
    const css = generateCss(
      makeState({
        background: { ...DEFAULT_BACKGROUND, enabled: true, type: 'solid', color1: '#1a1a2e' },
      }),
    );
    expect(css).toContain('background: #1a1a2e;');
  });

  it('emits linear-gradient background', () => {
    const css = generateCss(
      makeState({
        background: {
          ...DEFAULT_BACKGROUND,
          enabled: true,
          type: 'gradient',
          color1: '#2196F3',
          color2: '#FF8C00',
          angle: 135,
        },
      }),
    );
    expect(css).toContain('background: linear-gradient(135deg, #2196F3, #FF8C00);');
  });

  it('emits conditional background for applyWhen=on', () => {
    const css = generateCss(
      makeState({
        background: {
          ...DEFAULT_BACKGROUND,
          enabled: true,
          type: 'solid',
          color1: '#ff0000',
          applyWhen: 'on',
        },
      }),
    );
    expect(css).toContain("is_state(config.entity, 'on')");
    expect(css).toContain("'#ff0000'");
  });
});

// ---------------------------------------------------------------------------
// generateCss — border module
// ---------------------------------------------------------------------------

describe('generateCss — border', () => {
  it('emits border-radius', () => {
    const css = generateCss(
      makeState({ border: { ...DEFAULT_BORDER, enabled: true, radiusPx: 16, borderWidth: 0 } }),
    );
    expect(css).toContain('border-radius: 16px;');
  });

  it('emits border shorthand', () => {
    const css = generateCss(
      makeState({
        border: { enabled: true, radiusPx: 0, borderWidth: 2, borderColor: '#2196F3' },
      }),
    );
    expect(css).toContain('border: 2px solid #2196F3;');
  });

  it('omits border-radius when 0', () => {
    const css = generateCss(
      makeState({ border: { enabled: true, radiusPx: 0, borderWidth: 2, borderColor: '#fff' } }),
    );
    expect(css).not.toContain('border-radius');
  });
});

// ---------------------------------------------------------------------------
// generateCss — animation module
// ---------------------------------------------------------------------------

describe('generateCss — animation', () => {
  it('emits @keyframes before ha-card block', () => {
    const css = generateCss(
      makeState({
        animation: { ...DEFAULT_ANIMATION, enabled: true, preset: 'pulse', speedS: 2, trigger: 'always' },
      }),
    );
    const kfIdx = css.indexOf('@keyframes cms-pulse');
    const cardIdx = css.indexOf('ha-card');
    expect(kfIdx).toBeGreaterThanOrEqual(0);
    expect(kfIdx).toBeLessThan(cardIdx);
  });

  it('emits unconditional animation for trigger=always', () => {
    const css = generateCss(
      makeState({
        animation: { ...DEFAULT_ANIMATION, enabled: true, preset: 'breathe', speedS: 3, trigger: 'always' },
      }),
    );
    expect(css).toContain('animation: cms-breathe 3s ease-in-out infinite;');
  });

  it('emits conditional animation for trigger=on', () => {
    const css = generateCss(
      makeState({
        animation: { ...DEFAULT_ANIMATION, enabled: true, preset: 'blink', speedS: 1, trigger: 'on' },
      }),
    );
    expect(css).toContain("is_state(config.entity, 'on')");
    expect(css).toContain('cms-blink');
  });

  it('adds background-size for gradient-shift preset', () => {
    const css = generateCss(
      makeState({
        animation: { ...DEFAULT_ANIMATION, enabled: true, preset: 'gradient-shift', speedS: 4, trigger: 'always' },
      }),
    );
    expect(css).toContain('background-size: 200% auto;');
  });

  it('emits custom entity trigger', () => {
    const css = generateCss(
      makeState({
        animation: {
          ...DEFAULT_ANIMATION,
          enabled: true,
          preset: 'bounce',
          speedS: 2,
          trigger: 'custom',
          customEntity: 'input_boolean.my_flag',
        },
      }),
    );
    expect(css).toContain("is_state('input_boolean.my_flag', 'on')");
  });
});

// ---------------------------------------------------------------------------
// generateCss — heading style module
// ---------------------------------------------------------------------------

describe('generateCss — heading style', () => {
  it('emits nothing when disabled', () => {
    const css = generateCss(makeState({ headingStyle: { ...DEFAULT_HEADING_STYLE, enabled: false } }));
    expect(css).toBe('');
  });

  it('emits .title p with font-size and color', () => {
    const css = generateCss(
      makeState({
        headingStyle: {
          ...DEFAULT_HEADING_STYLE,
          enabled: true,
          fontSize: 28,
          textColor: '#ff0000',
          alignment: 'center',
        },
      }),
    );
    expect(css).toContain('.title p');
    expect(css).toContain('font-size: 28px;');
    expect(css).toContain('color: #ff0000 !important;');
    // text-align is NOT emitted — justify-content handles alignment
  });

  it('emits .title ha-icon with --mdc-icon-size and color', () => {
    const css = generateCss(
      makeState({
        headingStyle: {
          ...DEFAULT_HEADING_STYLE,
          enabled: true,
          iconSize: 32,
          iconColor: '#00ff00',
        },
      }),
    );
    expect(css).toContain('.title ha-icon');
    expect(css).toContain('--mdc-icon-size: 32px;');
    expect(css).toContain('--ha-icon-size: 32px;'); // forward-compat fallback
    expect(css).toContain('color: #00ff00 !important;');
  });

  it('emits .container with justify-content for alignment=right', () => {
    const css = generateCss(
      makeState({
        headingStyle: { ...DEFAULT_HEADING_STYLE, enabled: true, alignment: 'right' },
      }),
    );
    expect(css).toContain('.container');
    expect(css).toContain('justify-content: flex-end !important;');
  });

  it('emits justify-content: center for alignment=center', () => {
    const css = generateCss(
      makeState({
        headingStyle: { ...DEFAULT_HEADING_STYLE, enabled: true, alignment: 'center' },
      }),
    );
    expect(css).toContain('justify-content: center !important;');
  });

  it('emits justify-content: flex-start for alignment=left', () => {
    const css = generateCss(
      makeState({
        headingStyle: { ...DEFAULT_HEADING_STYLE, enabled: true, alignment: 'left' },
      }),
    );
    expect(css).toContain('justify-content: flex-start !important;');
  });
});

// ---------------------------------------------------------------------------
// generateCss — threshold module
// ---------------------------------------------------------------------------

describe('generateCss — threshold', () => {
  it('sorts > rules descending so highest value is checked first', () => {
    const css = generateCss(makeState({
      threshold: {
        enabled: true,
        entityId: 'sensor.score',
        properties: ['background'],
        rules: [
          { id: '0', operator: '>', value: 0, color: '#000000' },
          { id: '1', operator: '>', value: 50, color: '#ff0000' },
          { id: '2', operator: '>', value: 80, color: '#00ff00' },
        ],
        defaultColor: '#888888',
      },
    }));
    // 80 must appear before 50 before 0 in the generated Jinja2
    const idx80 = css.indexOf('> 80');
    const idx50 = css.indexOf('> 50');
    const idx0  = css.indexOf('> 0');
    expect(idx80).toBeLessThan(idx50);
    expect(idx50).toBeLessThan(idx0);
  });

  it('sorts < rules ascending so lowest value is checked first', () => {
    const css = generateCss(makeState({
      threshold: {
        enabled: true,
        entityId: 'sensor.score',
        properties: ['background'],
        rules: [
          { id: '0', operator: '<', value: 80, color: '#00ff00' },
          { id: '1', operator: '<', value: 50, color: '#ff0000' },
          { id: '2', operator: '<', value: 20, color: '#000000' },
        ],
        defaultColor: '#888888',
      },
    }));
    const idx20 = css.indexOf('< 20');
    const idx50 = css.indexOf('< 50');
    const idx80 = css.indexOf('< 80');
    expect(idx20).toBeLessThan(idx50);
    expect(idx50).toBeLessThan(idx80);
  });

  it('emits icon-color threshold on ha-state-icon', () => {
    const css = generateCss(makeState({
      threshold: {
        enabled: true,
        entityId: 'sensor.temp',
        properties: ['icon-color'],
        rules: [{ id: '0', operator: '>=', value: 30, color: '#ff0000' }],
        defaultColor: '#888888',
      },
    }));
    expect(css).toContain('ha-state-icon');
    expect(css).toContain('color:');
    expect(css).toContain('>= 30');
  });

  it('ladder works regardless of input order (default blue, >10 green, >20 red)', () => {
    // Rules added "out of order" (>10 before >20) must still evaluate >20 first
    // so a value of 25 is red, 15 green, 5 blue.
    const css = generateCss(makeState({
      threshold: {
        enabled: true,
        entityId: 'sensor.x',
        properties: ['icon-color'],
        rules: [
          { id: 'a', operator: '>', value: 10, color: '#00ff00' },
          { id: 'b', operator: '>', value: 20, color: '#ff0000' },
        ],
        defaultColor: '#0000ff',
      },
    }));
    expect(css.indexOf('> 20')).toBeLessThan(css.indexOf('> 10')); // 20 checked first
    expect(css.indexOf('#ff0000')).toBeLessThan(css.indexOf('#00ff00'));
    expect(css).toContain("else '#0000ff'"); // blue default last
  });

  it('drives icon color AND accent color together from one rule set', () => {
    const css = generateCss(makeState({
      threshold: {
        enabled: true,
        entityId: 'sensor.temp',
        properties: ['icon-color', 'accent-color'],
        rules: [{ id: '0', operator: '>=', value: 30, color: '#ff0000' }],
        defaultColor: '#888888',
      },
    }));
    expect(css).toMatch(/ha-state-icon\s*\{\s*color: \{\{/);
    expect(css).toMatch(/ha-card\s*\{\s*--accent-color: \{\{/);
    // Both blocks share the identical Jinja2 expression.
    const iconMatch = css.match(/ha-state-icon\s*\{\s*color: (\{\{[^\n]*\}\})\s*!important;/);
    const accentMatch = css.match(/ha-card\s*\{\s*--accent-color: (\{\{[^\n]*\}\});/);
    expect(iconMatch?.[1]).toBe(accentMatch?.[1]);
  });

  it('round-trips a multi-property threshold (icon + accent) back into one module state', () => {
    const original =
      "ha-state-icon {\n  color: {{ '#ff0000' if states('sensor.temp') | float(0) >= 30 else '#888888' }} !important;\n}\n\n" +
      "ha-card {\n  --accent-color: {{ '#ff0000' if states('sensor.temp') | float(0) >= 30 else '#888888' }};\n}";
    const parsed = parseCardModConfig({ type: 'sensor', card_mod: { style: original } });
    const state = mapToStudioState(parsed);

    expect(state.threshold.enabled).toBe(true);
    expect(state.threshold.properties.sort()).toEqual(['accent-color', 'icon-color']);
    expect(state.accentColor.enabled).toBe(false); // claimed by threshold, not the static module
    expect(state.advanced.rawCss).toBe('');
  });

  it('does not merge two genuinely different threshold configs into one module', () => {
    // icon-color driven by sensor.temp, accent-color driven by a different
    // rule set entirely — a real conflict, not the same setting duplicated.
    // Only one of the two can be represented by the single Threshold module
    // (its rules/entity are shared across every property it drives) — which
    // one "wins" the module is an implementation detail, but the loser must
    // never be silently dropped: it has to survive in Advanced CSS.
    const original =
      "ha-state-icon {\n  color: {{ '#ff0000' if states('sensor.temp') | float(0) >= 30 else '#888888' }} !important;\n}\n\n" +
      "ha-card {\n  --accent-color: {{ '#00ff00' if states('sensor.other') | float(0) >= 5 else '#000000' }};\n}";
    const parsed = parseCardModConfig({ type: 'sensor', card_mod: { style: original } });
    const state = mapToStudioState(parsed);

    expect(state.threshold.enabled).toBe(true);
    expect(state.threshold.properties).toHaveLength(1);
    const loser = state.threshold.properties[0] === 'icon-color' ? '--accent-color' : 'color: {{';
    expect(state.advanced.rawCss).toContain(loser);
  });
});

describe('generateCss — entity binding (controlled by a different entity)', () => {
  it('icon color conditional mode targets a custom entity, not config.entity', () => {
    const css = generateCss(makeState({
      iconColor: {
        enabled: true,
        mode: 'conditional',
        color: '#fff',
        colorOn: '#00ff00',
        colorOff: '#888888',
        entityId: 'binary_sensor.preheat_active',
      },
    }));
    expect(css).toContain("is_state('binary_sensor.preheat_active', 'on')");
    expect(css).not.toContain('config.entity');
  });

  it('icon color conditional mode falls back to config.entity when entityId is unset', () => {
    const css = generateCss(makeState({
      iconColor: {
        enabled: true,
        mode: 'conditional',
        color: '#fff',
        colorOn: '#00ff00',
        colorOff: '#888888',
      },
    }));
    expect(css).toContain("is_state(config.entity, 'on')");
  });

  it('round-trips icon color conditional mode with a custom entity', () => {
    const original =
      "ha-state-icon {\n  color: {{ '#00ff00' if is_state('binary_sensor.preheat_active', 'on') else '#888888' }} !important;\n}";
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: original } });
    const state = mapToStudioState(parsed);
    expect(state.iconColor.enabled).toBe(true);
    expect(state.iconColor.mode).toBe('conditional');
    expect(state.iconColor.entityId).toBe('binary_sensor.preheat_active');
    expect(state.advanced.rawCss).toBe('');
  });

  it('background "custom" applyWhen targets a different entity', () => {
    const css = generateCss(makeState({
      background: {
        enabled: true,
        type: 'solid',
        color1: '#03a9f4',
        color2: '#ff8c00',
        angle: 135,
        applyWhen: 'custom',
        customEntity: 'binary_sensor.preheat_active',
      },
    }));
    expect(css).toContain("is_state('binary_sensor.preheat_active', 'on')");
  });

  it('round-trips background "custom" applyWhen with a custom entity', () => {
    const original =
      "ha-card {\n  background: {{ '#03a9f4' if is_state('binary_sensor.preheat_active', 'on') else 'none' }};\n}";
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: original } });
    const state = mapToStudioState(parsed);
    expect(state.background.enabled).toBe(true);
    expect(state.background.applyWhen).toBe('custom');
    expect(state.background.customEntity).toBe('binary_sensor.preheat_active');
  });

  it('filter grayscale "custom" trigger targets a different entity and round-trips', () => {
    const css = generateCss(makeState({
      filter: {
        enabled: true,
        grayscale: true,
        grayscaleWhen: 'custom',
        customEntity: 'binary_sensor.preheat_active',
        brightness: 100,
        blur: 0,
        transitionMs: 300,
      },
    }));
    expect(css).toContain("is_state('binary_sensor.preheat_active', 'on')");

    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.filter.grayscale).toBe(true);
    expect(state.filter.grayscaleWhen).toBe('custom');
    expect(state.filter.customEntity).toBe('binary_sensor.preheat_active');
  });
});

describe('sortThresholdRules', () => {
  it('orders > rules high→low and < rules low→high (matches generator output)', () => {
    const desc = sortThresholdRules([
      { id: 'a', operator: '>', value: 10, color: 'g' },
      { id: 'b', operator: '>', value: 20, color: 'r' },
    ]).map((r) => r.value);
    expect(desc).toEqual([20, 10]);

    const asc = sortThresholdRules([
      { id: 'a', operator: '<', value: 20, color: 'r' },
      { id: 'b', operator: '<', value: 10, color: 'g' },
    ]).map((r) => r.value);
    expect(asc).toEqual([10, 20]);
  });
});

// ---------------------------------------------------------------------------
// generateCss — advanced rawCss passthrough
// ---------------------------------------------------------------------------

describe('generateCss — advanced rawCss', () => {
  it('appends rawCss verbatim', () => {
    const raw = 'ha-card { --custom-var: 42; }';
    const css = generateCss(makeState({ advanced: { rawCss: raw } }));
    expect(css).toContain(raw);
  });

  it('trims leading/trailing whitespace from rawCss', () => {
    const css = generateCss(makeState({ advanced: { rawCss: '  ha-card { color: red; }  ' } }));
    expect(css.endsWith('ha-card { color: red; }')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateCss — combined modules
// ---------------------------------------------------------------------------

describe('generateCss — combined modules', () => {
  it('merges filter and background in the same ha-card block', () => {
    const css = generateCss(
      makeState({
        filter: { ...DEFAULT_FILTER, enabled: true, grayscale: true, grayscaleWhen: 'off' },
        background: { ...DEFAULT_BACKGROUND, enabled: true, type: 'solid', color1: '#1a1a2e' },
      }),
    );
    expect(css.match(/ha-card\s*\{/g)).toHaveLength(1);
    expect(css).toContain('filter');
    expect(css).toContain('background: #1a1a2e');
  });
});

// ---------------------------------------------------------------------------
// applyCardModStyle
// ---------------------------------------------------------------------------

describe('applyCardModStyle', () => {
  const base: CardModCardConfig = { type: 'button', name: 'Test' };

  it('sets card_mod.style on a card with no existing card_mod', () => {
    const result = applyCardModStyle('ha-card { color: red; }', base);
    expect(result.card_mod?.style).toBe('ha-card { color: red; }');
    expect(result.name).toBe('Test');
  });

  it('replaces existing card_mod.style', () => {
    const withMod: CardModCardConfig = { ...base, card_mod: { style: 'ha-card { color: blue; }' } };
    const result = applyCardModStyle('ha-card { color: red; }', withMod);
    expect(result.card_mod?.style).toBe('ha-card { color: red; }');
  });

  it('removes card_mod when css is empty', () => {
    const withMod: CardModCardConfig = { ...base, card_mod: { style: 'ha-card { color: blue; }' } };
    const result = applyCardModStyle('', withMod);
    expect(result.card_mod).toBeUndefined();
  });

  it('removes card_mod when css is whitespace only', () => {
    const withMod: CardModCardConfig = { ...base, card_mod: { style: 'ha-card { color: blue; }' } };
    const result = applyCardModStyle('   ', withMod);
    expect(result.card_mod).toBeUndefined();
  });

  it('does not mutate the original config', () => {
    const frozen = Object.freeze({ ...base });
    expect(() => applyCardModStyle('ha-card { color: red; }', frozen)).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // outputKey: 'uix' — UIX (github.com/Lint-Free-Technology/uix)
  // ---------------------------------------------------------------------------

  it('sets uix.style when outputKey is uix, on a config with no pre-existing card_mod', () => {
    const result = applyCardModStyle('ha-card { color: red; }', base, 'uix');
    expect(result.uix?.style).toBe('ha-card { color: red; }');
    expect(result.card_mod).toBeUndefined();
  });

  // Regression: this is the exact bug reported against v0.6.1 — editing a
  // card that already has real card_mod.style content (from before UIX was
  // installed) while UIX is now the active engine used to leave that stale
  // card_mod block sitting alongside the new uix.style instead of removing
  // it, duplicating the styling across both keys.
  it('clears a pre-existing card_mod.style when writing a uix edit, instead of leaving it stale', () => {
    const cardModOnly: CardModCardConfig = { ...base, card_mod: { style: 'ha-card { color: blue; }' } };
    const result = applyCardModStyle('ha-card { color: red; }', cardModOnly, 'uix');
    expect(result.uix?.style).toBe('ha-card { color: red; }');
    expect(result.card_mod).toBeUndefined();
  });

  it('preserves other uix fields (macros, debug) when updating uix.style', () => {
    const withUix: CardModCardConfig = { ...base, uix: { style: 'x', debug: true, macros: { a: 1 } } };
    const result = applyCardModStyle('ha-card { color: red; }', withUix, 'uix');
    expect(result.uix?.style).toBe('ha-card { color: red; }');
    expect(result.uix?.debug).toBe(true);
    expect(result.uix?.macros).toEqual({ a: 1 });
  });

  it('removes uix when css is empty and outputKey is uix', () => {
    const withUix: CardModCardConfig = { ...base, uix: { style: 'ha-card { color: blue; }' } };
    const result = applyCardModStyle('', withUix, 'uix');
    expect(result.uix).toBeUndefined();
  });

  it('clearing uix.style with outputKey uix preserves other uix fields (macros, debug)', () => {
    const withUix: CardModCardConfig = {
      ...base,
      uix: { style: 'ha-card { color: blue; }', debug: true, macros: { a: 1 } },
    };
    const result = applyCardModStyle('', withUix, 'uix');
    expect(result.uix?.style).toBeUndefined();
    expect(result.uix?.debug).toBe(true);
    expect(result.uix?.macros).toEqual({ a: 1 });
  });

  it('clearing with outputKey uix also clears a stale card_mod.style, since UIX would otherwise fall back to it', () => {
    const both: CardModCardConfig = {
      ...base,
      card_mod: { style: 'ha-card { color: blue; }' },
      uix: { style: 'ha-card { color: blue; }' },
    };
    const result = applyCardModStyle('', both, 'uix');
    expect(result.card_mod).toBeUndefined();
    expect(result.uix).toBeUndefined();
  });

  it('clearing with outputKey card_mod (default) also clears a stale card_mod.style left over from before, regardless of outputKey', () => {
    // Regression: clearing must always remove style under BOTH keys, not just
    // the one named by outputKey — otherwise the un-cleared key's stale value
    // reactivates via whichever engine's fallback precedence applies.
    const cardModOnly: CardModCardConfig = { ...base, card_mod: { style: 'ha-card { color: blue; }' } };
    const result = applyCardModStyle('', cardModOnly, 'uix');
    expect(result.card_mod).toBeUndefined();
  });

  it('does not clear a uix.style that uses macros when writing a card_mod edit', () => {
    const macroUix: CardModCardConfig = {
      ...base,
      card_mod: { style: 'ha-card { color: blue; }' },
      uix: { style: 'ha-card { color: {{ macros.foo() }}; }', macros: { foo: { template: 'red' } } },
    };
    const result = applyCardModStyle('ha-card { color: red; }', macroUix);
    expect(result.card_mod?.style).toBe('ha-card { color: red; }');
    // uix.style is left exactly as it was — not silently overwritten/destroyed.
    expect(result.uix?.style).toBe('ha-card { color: {{ macros.foo() }}; }');
    expect(result.uix?.macros).toEqual({ foo: { template: 'red' } });
  });

  it('does not clear a uix.style that uses billets when writing a card_mod edit', () => {
    const billetUix: CardModCardConfig = {
      ...base,
      card_mod: { style: 'ha-card { color: blue; }' },
      uix: { style: 'ha-card { color: red; }', billets: { accent: 'red' } },
    };
    const result = applyCardModStyle('ha-card { color: green; }', billetUix);
    expect(result.uix?.style).toBe('ha-card { color: red; }');
  });

  // ---------------------------------------------------------------------------
  // Stale uix.style cleanup when writing card_mod (the default outputKey).
  // The caller (cms-panel.ts's _buildMergedState) already folds any settings
  // unique to uix.style into the generated css before this runs, so by the
  // time we get here a pre-existing uix.style is fully redundant — clearing
  // it (rather than leaving it stale, or syncing/mirroring it forever) is
  // what turns "duplicated across both keys" back into a single source of
  // truth. See the dedicated "clear the redundant key" tests further below
  // for the general card_mod<->uix case.
  // ---------------------------------------------------------------------------

  it('clears a pre-existing uix.style when writing a card_mod edit', () => {
    const both: CardModCardConfig = {
      ...base,
      card_mod: { style: 'ha-card { color: blue; }' },
      uix: { style: 'ha-card { color: blue; }' },
    };
    const result = applyCardModStyle('ha-card { color: red; }', both);
    expect(result.card_mod?.style).toBe('ha-card { color: red; }');
    expect(result.uix?.style).toBeUndefined();
    expect(result.uix).toBeUndefined();
  });

  it('preserves non-style uix fields (debug) while clearing uix.style', () => {
    const both: CardModCardConfig = {
      ...base,
      card_mod: { style: 'ha-card { color: blue; }' },
      uix: { style: 'ha-card { color: blue; }', debug: true },
    };
    const result = applyCardModStyle('ha-card { color: red; }', both);
    expect(result.uix?.style).toBeUndefined();
    expect(result.uix?.debug).toBe(true);
  });

  it('does not add a uix block when writing card_mod on a config with no existing uix', () => {
    const result = applyCardModStyle('ha-card { color: red; }', base);
    expect(result.uix).toBeUndefined();
  });

  it('clears a synced uix.style when css is cleared, preserving other uix fields', () => {
    const both: CardModCardConfig = {
      ...base,
      card_mod: { style: 'ha-card { color: blue; }' },
      uix: { style: 'ha-card { color: blue; }', debug: true },
    };
    const result = applyCardModStyle('', both);
    expect(result.card_mod).toBeUndefined();
    expect(result.uix?.style).toBeUndefined();
    expect(result.uix?.debug).toBe(true);
  });

  it('drops the uix block entirely when clearing leaves it with no other fields', () => {
    const both: CardModCardConfig = {
      ...base,
      card_mod: { style: 'ha-card { color: blue; }' },
      uix: { style: 'ha-card { color: blue; }' },
    };
    const result = applyCardModStyle('', both);
    expect(result.uix).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// pickOutputKey
// ---------------------------------------------------------------------------

class FakeCustomElementRegistry {
  private registry = new Map<string, CustomElementConstructor>();
  define(name: string, ctor: CustomElementConstructor) {
    this.registry.set(name, ctor);
  }
  get(name: string) {
    return this.registry.get(name);
  }
}
const FAKE_ELEMENT = class {} as unknown as CustomElementConstructor;

describe('pickOutputKey', () => {
  const originalRegistry = globalThis.customElements;

  beforeEach(() => {
    (globalThis as { customElements: CustomElementRegistry }).customElements =
      new FakeCustomElementRegistry() as unknown as CustomElementRegistry;
  });

  afterEach(() => {
    (globalThis as { customElements: CustomElementRegistry }).customElements = originalRegistry;
  });

  it('defaults to card_mod when neither card-mod nor UIX is detected', () => {
    expect(pickOutputKey()).toBe('card_mod');
  });

  it('defaults to card_mod when only card-mod is detected', () => {
    customElements.define('card-mod', FAKE_ELEMENT);
    expect(pickOutputKey()).toBe('card_mod');
  });

  it('defaults to card_mod when both card-mod and UIX are detected', () => {
    customElements.define('card-mod', FAKE_ELEMENT);
    customElements.define('uix-node', FAKE_ELEMENT);
    expect(pickOutputKey()).toBe('card_mod');
  });

  it('switches to uix when only UIX is detected', () => {
    customElements.define('uix-node', FAKE_ELEMENT);
    expect(pickOutputKey()).toBe('uix');
  });
});

// ---------------------------------------------------------------------------
// Round-trip: parse → generate produces semantically equivalent CSS
// ---------------------------------------------------------------------------

describe('round-trip', () => {
  it('filter: grayscale-when-off round-trips correctly', () => {
    const original =
      "ha-card {\n  filter: {{ 'grayscale(100%)' if is_state(config.entity, 'off') else 'none' }};\n  transition: filter 300ms ease;\n}";
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: original } });
    const state = mapToStudioState(parsed);
    const generated = generateCss(state);

    expect(generated).toContain('grayscale(100%)');
    expect(generated).toContain("is_state(config.entity, 'off')");
    expect(generated).toContain('transition: filter 300ms ease;');
  });

  it('gradient background round-trips correctly', () => {
    const original = 'ha-card { background: linear-gradient(135deg, #2196F3, #FF8C00); }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: original } });
    const state = mapToStudioState(parsed);
    const generated = generateCss(state);

    expect(generated).toContain('linear-gradient(135deg, #2196F3, #FF8C00)');
  });

  it('sensor card pattern (--accent-color + plain icon color) round-trips with no rawCss', () => {
    const original = 'ha-card {\n  --accent-color: yellow;\n}\nha-state-icon {\n  color: yellow !important;\n}';
    const parsed = parseCardModConfig({ type: 'sensor', card_mod: { style: original } });
    const state = mapToStudioState(parsed);

    expect(state.accentColor.enabled).toBe(true);
    expect(state.accentColor.color).toBe('yellow');
    expect(state.iconColor.enabled).toBe(true);
    expect(state.iconColor.mode).toBe('plain');
    expect(state.iconColor.color).toBe('yellow');
    expect(state.advanced.rawCss).toBe('');

    const generated = generateCss(state);
    expect(generated).toContain('--accent-color: yellow;');
    expect(generated).toContain('color: yellow !important;');
    expect(generated).not.toContain('is_state');
  });

  it('threshold background round-trips with no rawCss', () => {
    const original =
      "ha-card {\n  background: {{ '#2196F3' if states('sensor.temp') | float(0) >= 85 else ('#4caf50' if states('sensor.temp') | float(0) >= 72 else '#888888') }};\n}";
    const parsed = parseCardModConfig({ type: 'sensor', card_mod: { style: original } });
    const state = mapToStudioState(parsed);

    expect(state.threshold.enabled).toBe(true);
    expect(state.threshold.entityId).toBe('sensor.temp');
    expect(state.threshold.properties).toEqual(['background']);
    expect(state.threshold.rules).toHaveLength(2);
    expect(state.threshold.defaultColor).toBe('#888888');
    expect(state.advanced.rawCss).toBe('');

    const generated = generateCss(state);
    expect(generated).toContain("states('sensor.temp') | float(0) >= 85");
    expect(generated).toContain("states('sensor.temp') | float(0) >= 72");
    expect(generated).toContain('#2196F3');
    expect(generated).toContain("else '#888888'");
  });

  it('threshold with palette var(--x-color) rules round-trips with no rawCss', () => {
    // The compact color picker's presets (cms-color-picker.ts) write
    // var(--x-color) values — this is the same shape a palette-driven
    // threshold rule would produce, and must not fall through to Advanced CSS.
    const original =
      "ha-state-icon {\n  color: {{ 'var(--red-color)' if states('sensor.temp') | float(0) >= 85 else ('var(--orange-color)' if states('sensor.temp') | float(0) >= 72 else 'var(--grey-color)') }} !important;\n}";
    const parsed = parseCardModConfig({ type: 'sensor', card_mod: { style: original } });
    const state = mapToStudioState(parsed);

    expect(state.threshold.enabled).toBe(true);
    expect(state.threshold.properties).toEqual(['icon-color']);
    expect(state.threshold.rules).toHaveLength(2);
    expect(state.threshold.rules.map((r) => r.color)).toEqual(['var(--red-color)', 'var(--orange-color)']);
    expect(state.threshold.defaultColor).toBe('var(--grey-color)');
    expect(state.advanced.rawCss).toBe('');

    const generated = generateCss(state);
    expect(generated).toContain("'var(--red-color)'");
    expect(generated).toContain("'var(--orange-color)'");
    expect(generated).toContain("else 'var(--grey-color)'");
  });

  it('a later ha-card block overriding an earlier static accent-color round-trips as the live threshold, not the dead static value', () => {
    // Real-world pattern: a static accent color set up first, then a
    // threshold rule added later targeting the same --accent-color variable
    // in a second ha-card { } block. In actual CSS the second declaration
    // wins — the first is dead. Before the coalescing fix in css-parser.ts,
    // findTarget/findProp only ever saw the first block, so the second
    // block's threshold collided on the same claimKey and vanished
    // entirely — not recognised as a module, not preserved in Advanced CSS.
    const original =
      "ha-card {\n  --accent-color: var(--red-color);\n}\n\nha-card {\n  --accent-color: {{ '#f44336' if states('sensor.power') | float(0) > 0 else '#888888' }};\n}";
    const parsed = parseCardModConfig({ type: 'sensor', card_mod: { style: original } });
    const state = mapToStudioState(parsed);

    expect(state.accentColor.enabled).toBe(false);
    expect(state.threshold.enabled).toBe(true);
    expect(state.threshold.properties).toEqual(['accent-color']);
    expect(state.threshold.entityId).toBe('sensor.power');
    expect(state.threshold.rules).toEqual([{ id: '0', operator: '>', value: 0, color: '#f44336' }]);
    expect(state.threshold.defaultColor).toBe('#888888');
    expect(state.advanced.rawCss).toBe('');

    const generated = generateCss(state);
    expect(generated).toContain("states('sensor.power') | float(0) > 0");
    expect(generated).not.toContain('var(--red-color)');
  });

  it('heading style round-trips with no rawCss', () => {
    const original =
      '.container {\n  justify-content: center;\n}\n\n.title p {\n  font-size: 28px;\n  color: #ff0000;\n  text-align: center;\n}\n\n.title ha-icon {\n  --mdc-icon-size: 32px;\n  color: #00ff00;\n}';
    const parsed = parseCardModConfig({ type: 'heading', card_mod: { style: original } });
    const state = mapToStudioState(parsed);

    expect(state.headingStyle.enabled).toBe(true);
    expect(state.headingStyle.fontSize).toBe(28);
    expect(state.headingStyle.textColor).toBe('#ff0000');
    expect(state.headingStyle.iconSize).toBe(32);
    expect(state.headingStyle.iconColor).toBe('#00ff00');
    expect(state.headingStyle.alignment).toBe('center');
    expect(state.advanced.rawCss).toBe('');

    const generated = generateCss(state);
    expect(generated).toContain('font-size: 28px;');
    expect(generated).toContain('color: #ff0000 !important;');
    expect(generated).toContain('--mdc-icon-size: 32px;');
    expect(generated).toContain('color: #00ff00 !important;');
    expect(generated).toContain('justify-content: center !important;');
  });
});

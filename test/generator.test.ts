/**
 * Unit tests for the Phase 3/4 generator pipeline:
 *   generateCss + applyCardModStyle
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateCss,
  sortThresholdRules,
  lerpColor,
  colorAtValue,
  gradientToRules,
  encodeGradientStops,
  decodeGradientStops,
} from '../src/generator/css-generator.js';
import { applyCardModStyle, pickOutputKey } from '../src/generator/yaml-generator.js';
import {
  DEFAULT_FILTER,
  DEFAULT_ICON_COLOR,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_BACKGROUND,
  DEFAULT_ANIMATION,
  DEFAULT_BORDER,
  DEFAULT_HEADING_STYLE,
  DEFAULT_FONT,
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
    font: { ...DEFAULT_FONT },
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
    // --tile-color needs !important: hui-tile-card writes its state color as
    // an inline style on ha-card, which otherwise always wins.
    const tileMatch = css.match(/--tile-color: (\{\{[^\n]*\}\}) !important;/);
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

  it('gauge: emits a separate ha-gauge block with !important (inline styleMap on <ha-gauge> beats an inherited variable)', () => {
    const css = generateCss(
      makeState({ accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, color: '#ff0000' } }),
      'gauge',
    );
    expect(css).toContain('ha-gauge {');
    expect(css).toContain('--gauge-color: #ff0000 !important;');
    // The old dead declaration must be gone: --gauge-color inherited from
    // ha-card is always overridden by the card's own inline severity color.
    const haCardBlock = css.match(/ha-card \{[^}]*\}/)?.[0] ?? '';
    expect(haCardBlock).not.toContain('--gauge-color');
  });

  it('gauge: conditional accent substitutes the same ternary into the ha-gauge block', () => {
    const css = generateCss(
      makeState({
        accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'conditional', colorOn: '#00ff00', colorOff: '#888888' },
      }),
      'gauge',
    );
    const gaugeMatch = css.match(/--gauge-color: (\{\{[^\n]*\}\}) !important;/);
    const accentMatch = css.match(/--accent-color: (\{\{[^\n]*\}\});/);
    expect(gaugeMatch?.[1]).toBe(accentMatch?.[1]);
  });

  it('needle gauge: also drives --primary-text-color (needle + value text) and round-trips cleanly', () => {
    const state = makeState({ accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, color: '#ff0000' } });
    const css = generateCss(state, 'gauge', { gaugeNeedle: true });
    expect(css).toContain('--gauge-color: #ff0000 !important;');
    expect(css).toContain('--primary-text-color: #ff0000 !important;');

    const reparsed = mapToStudioState(parseCardModConfig({ type: 'gauge', card_mod: { style: css } }));
    expect(reparsed.accentColor.enabled).toBe(true);
    expect(reparsed.advanced.rawCss).toBe('');
    // Byte-stable when regenerated with the same needle flag.
    expect(generateCss(reparsed, 'gauge', { gaugeNeedle: true })).toBe(css);
  });

  it('non-needle gauge does NOT touch --primary-text-color (value text keeps its theme color)', () => {
    const css = generateCss(
      makeState({ accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, color: '#ff0000' } }),
      'gauge',
    );
    expect(css).not.toContain('--primary-text-color');
  });

  it('tile round-trip stays clean with the !important companion (regression guard for the new form)', () => {
    const state = makeState({ accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, color: '#ff0000' } });
    const css = generateCss(state, 'tile');
    expect(css).toContain('--tile-color: #ff0000 !important;');
    const reparsed = mapToStudioState(parseCardModConfig({ type: 'tile', card_mod: { style: css } }));
    expect(reparsed.accentColor.enabled).toBe(true);
    expect(reparsed.advanced.rawCss).toBe('');
    expect(generateCss(reparsed, 'tile')).toBe(css);
  });

  it('accent aux variables round-trip without leaking into Advanced CSS (tile/gauge/thermostat/button)', () => {
    for (const cardType of ['tile', 'gauge', 'thermostat', 'button']) {
      const state = makeState({ accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, color: '#ff0000' } });
      const css = generateCss(state, cardType);
      const reparsed = mapToStudioState(parseCardModConfig({ type: cardType, card_mod: { style: css } }));
      expect(reparsed.accentColor.enabled, cardType).toBe(true);
      expect(reparsed.accentColor.color, cardType).toBe('#ff0000');
      // Regression: these companions used to leak into Advanced CSS, where the
      // stale copies then overrode any newly-picked accent color (Advanced CSS
      // is emitted last, so its duplicates won the cascade).
      expect(reparsed.advanced.rawCss, cardType).toBe('');
    }
  });

  it('a hand-written companion variable with a DIFFERENT value is preserved in Advanced CSS, not claimed', () => {
    const css = 'ha-card {\n  --accent-color: #ff0000;\n  --tile-color: #123456;\n}';
    const state = mapToStudioState(parseCardModConfig({ type: 'tile', card_mod: { style: css } }));
    expect(state.accentColor.enabled).toBe(true);
    expect(state.advanced.rawCss).toContain('--tile-color: #123456');
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
// generateCss — font module (issue #25)
// ---------------------------------------------------------------------------

describe('generateCss — font', () => {
  it('emits nothing when disabled', () => {
    expect(generateCss(makeState({ font: { ...DEFAULT_FONT, enabled: false } }))).toBe('');
  });

  it('emits font-size, font-weight, and color on ha-card; omits font-family when unset', () => {
    const css = generateCss(makeState({
      font: { ...DEFAULT_FONT, enabled: true, fontSize: 20, fontWeight: 'bold', color: '#ff0000' },
    }));
    expect(css).toMatch(/ha-card\s*\{/);
    expect(css).toContain('font-size: 20px;');
    expect(css).toContain('font-weight: bold;');
    expect(css).toContain('color: #ff0000;');
    expect(css).not.toContain('font-family');
  });

  it('maps weight "medium" to numeric 500', () => {
    const css = generateCss(makeState({
      font: { ...DEFAULT_FONT, enabled: true, fontWeight: 'medium' },
    }));
    expect(css).toContain('font-weight: 500;');
  });

  it('emits font-family only when set', () => {
    const css = generateCss(makeState({
      font: { ...DEFAULT_FONT, enabled: true, fontFamily: 'monospace' },
    }));
    expect(css).toContain('font-family: monospace;');
  });

  it('tile cards: also emits the --ha-tile-info-* companion variables (ha-tile-info reads its own vars, not plain font-size/weight/color)', () => {
    const css = generateCss(
      makeState({ font: { ...DEFAULT_FONT, enabled: true, fontSize: 22, fontWeight: 'bold', color: '#00ff00' } }),
      'tile',
    );
    expect(css).toContain('--ha-tile-info-primary-font-size: 22px;');
    expect(css).toContain('--ha-tile-info-secondary-font-size: 22px;');
    expect(css).toContain('--ha-tile-info-primary-font-weight: bold;');
    expect(css).toContain('--ha-tile-info-secondary-font-weight: bold;');
    expect(css).toContain('--ha-tile-info-primary-color: #00ff00;');
    expect(css).toContain('--ha-tile-info-secondary-color: #00ff00;');
  });

  it('non-tile cards do not emit the tile companion variables', () => {
    const css = generateCss(
      makeState({ font: { ...DEFAULT_FONT, enabled: true } }),
      'entities',
    );
    expect(css).not.toContain('--ha-tile-info');
  });

  it('round-trips size/weight/family/color through parse (plain card)', () => {
    const state = makeState({
      font: { ...DEFAULT_FONT, enabled: true, fontSize: 22, fontWeight: 'bold', fontFamily: 'serif', color: '#123456' },
    });
    const css = generateCss(state, 'entities');
    const reparsed = mapToStudioState(parseCardModConfig({ type: 'entities', card_mod: { style: css } }));
    expect(reparsed.font).toEqual(state.font);
    expect(reparsed.advanced.rawCss).toBe('');
  });

  it('round-trips cleanly on a tile card, including the companion variables (no leak into Advanced CSS)', () => {
    const state = makeState({
      font: { ...DEFAULT_FONT, enabled: true, fontSize: 22, fontWeight: 'medium', color: '#123456' },
    });
    const css = generateCss(state, 'tile');
    const reparsed = mapToStudioState(parseCardModConfig({ type: 'tile', card_mod: { style: css } }));
    expect(reparsed.font.enabled).toBe(true);
    expect(reparsed.font.fontSize).toBe(22);
    expect(reparsed.font.fontWeight).toBe('medium');
    expect(reparsed.font.color).toBe('#123456');
    expect(reparsed.advanced.rawCss).toBe('');
    expect(generateCss(reparsed, 'tile')).toBe(css);
  });

  it('light: emits #info/.brightness size companions (internal --name-font-size beats plain inheritance)', () => {
    const css = generateCss(makeState({
      font: { ...DEFAULT_FONT, enabled: true, fontSize: 22 },
    }), 'light');
    expect(css).toContain('#info {\n  font-size: 22px !important;\n}');
    expect(css).toContain('.brightness {\n  font-size: 22px !important;\n}');
  });

  it('button: base font-size gets !important (adopted-sheet ordering beats an injected plain rule)', () => {
    const css = generateCss(makeState({
      font: { ...DEFAULT_FONT, enabled: true, fontSize: 22 },
    }), 'button');
    expect(css).toContain('font-size: 22px !important;');
  });

  it('sensor/entity: .name/.value/.measurement companions with the 1.75x value ratio', () => {
    for (const type of ['sensor', 'entity']) {
      const css = generateCss(makeState({
        font: { ...DEFAULT_FONT, enabled: true, fontSize: 20, fontWeight: 'bold', color: '#ff0000' },
      }), type);
      expect(css, type).toContain('.name {\n  font-size: 20px !important;\n  font-weight: bold !important;\n  color: #ff0000 !important;\n}');
      expect(css, type).toContain('.value {\n  font-size: calc(20px * 1.75) !important;\n}');
      expect(css, type).toContain('.measurement {');
    }
  });

  it('gauge: .title companion + --primary-text-color for the SVG value fill', () => {
    const css = generateCss(makeState({
      font: { ...DEFAULT_FONT, enabled: true, fontSize: 20, color: '#ff0000' },
    }), 'gauge');
    expect(css).toContain('.title {\n  font-size: 20px !important;');
    expect(css).toContain('--primary-text-color: #ff0000;');
  });

  it('thermostat: .title companion + label variables', () => {
    const css = generateCss(makeState({
      font: { ...DEFAULT_FONT, enabled: true, fontSize: 20, fontWeight: 'medium' },
    }), 'thermostat');
    expect(css).toContain('.title {\n  font-size: 20px !important;');
    expect(css).toContain('--ha-font-size-l: 20px;');
    expect(css).toContain('--ha-font-weight-medium: 500;');
  });

  it('entities: header variables at 1.5x + .card-header weight rule', () => {
    const css = generateCss(makeState({
      font: { ...DEFAULT_FONT, enabled: true, fontSize: 20, fontWeight: 'bold', color: '#ff0000', fontFamily: 'serif' },
    }), 'entities');
    expect(css).toContain('--ha-card-header-font-size: calc(20px * 1.5);');
    expect(css).toContain('--ha-card-header-color: #ff0000;');
    expect(css).toContain('--ha-card-header-font-family: serif;');
    expect(css).toContain('.card-header {\n  font-weight: bold;\n}');
  });

  it('per-card font companions round-trip cleanly for every special card type', () => {
    for (const type of ['light', 'button', 'sensor', 'entity', 'gauge', 'thermostat', 'entities', 'glance', 'tile']) {
      const state = makeState({
        font: { ...DEFAULT_FONT, enabled: true, fontSize: 21, fontWeight: 'bold', color: '#123456', fontFamily: 'serif' },
      });
      const css = generateCss(state, type);
      const reparsed = mapToStudioState(parseCardModConfig({ type, card_mod: { style: css } }));
      expect(reparsed.font, type).toEqual(state.font);
      expect(reparsed.advanced.rawCss, type).toBe('');
      expect(generateCss(reparsed, type), type).toBe(css);
    }
  });

  it('heading style: weight + family emitted on .title p and round-tripped', () => {
    const state = makeState({
      headingStyle: { ...DEFAULT_HEADING_STYLE, enabled: true, fontWeight: 'bold', fontFamily: 'monospace' },
    });
    const css = generateCss(state, 'heading');
    expect(css).toContain('font-weight: bold;');
    expect(css).toContain('font-family: monospace;');
    const reparsed = mapToStudioState(parseCardModConfig({ type: 'heading', card_mod: { style: css } }));
    expect(reparsed.headingStyle.fontWeight).toBe('bold');
    expect(reparsed.headingStyle.fontFamily).toBe('monospace');
    expect(reparsed.advanced.rawCss).toBe('');
  });

  it('yields to Threshold\'s text-color property: no duplicate/conflicting `color` decl on ha-card', () => {
    const css = generateCss(makeState({
      font: { ...DEFAULT_FONT, enabled: true, fontSize: 18, color: '#ff0000' },
      threshold: {
        enabled: true,
        entityId: 'sensor.temp',
        properties: ['text-color'],
        rules: [{ id: '0', operator: '>=', value: 30, color: '#00ff00' }],
        defaultColor: '#888888',
      },
    }));
    // Font's size/weight still apply...
    expect(css).toContain('font-size: 18px;');
    // ...but only ONE `color:` declaration exists on ha-card, and it's threshold's.
    const haCardBlocks = css.match(/ha-card\s*\{[^}]*\}/g) ?? [];
    const colorDecls = haCardBlocks.join('\n').match(/^\s*color:/gm) ?? [];
    expect(colorDecls).toHaveLength(1);
    expect(css).toContain("states('sensor.temp')");
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

  it('threshold accent-color on a tile emits the tile companion variables with the same Jinja', () => {
    const css = generateCss(makeState({
      threshold: {
        enabled: true,
        entityId: 'sensor.temp',
        properties: ['accent-color'],
        rules: [{ id: '0', operator: '>=', value: 30, color: '#ff0000' }],
        defaultColor: '#888888',
      },
    }), 'tile');
    const tileMatch = css.match(/--tile-color: (\{\{[^\n]*\}\}) !important;/);
    const accentMatch = css.match(/--accent-color: (\{\{[^\n]*\}\});/);
    expect(tileMatch?.[1]).toBe(accentMatch?.[1]);
  });

  it('threshold accent-color on a gauge emits the ha-gauge !important block and round-trips cleanly', () => {
    const state = makeState({
      threshold: {
        enabled: true,
        entityId: 'sensor.temp',
        properties: ['accent-color'],
        rules: [{ id: '0', operator: '>=', value: 30, color: '#ff0000' }],
        defaultColor: '#888888',
      },
    });
    const css = generateCss(state, 'gauge');
    expect(css).toMatch(/ha-gauge\s*\{\s*--gauge-color: \{\{[^\n]*\}\} !important;/);

    const reparsed = mapToStudioState(parseCardModConfig({ type: 'gauge', card_mod: { style: css } }));
    expect(reparsed.threshold.enabled).toBe(true);
    expect(reparsed.threshold.properties).toEqual(['accent-color']);
    expect(reparsed.advanced.rawCss).toBe('');
    // Regenerating must be byte-stable — no drift across editor reopens.
    expect(generateCss(reparsed, 'gauge')).toBe(css);
  });

  it('gradient-mode threshold accent-color on a gauge round-trips back to the original stops', () => {
    const state = makeState({
      threshold: {
        enabled: true,
        entityId: 'sensor.temp',
        properties: ['accent-color'],
        valueMode: 'gradient',
        rules: [],
        defaultColor: '#888888',
        colorStops: [
          { id: 'a', value: 0, color: '#00ff00' },
          { id: 'b', value: 100, color: '#ff0000' },
        ],
      },
    });
    const css = generateCss(state, 'gauge');
    const reparsed = mapToStudioState(parseCardModConfig({ type: 'gauge', card_mod: { style: css } }));
    expect(reparsed.threshold.valueMode).toBe('gradient');
    expect(reparsed.threshold.colorStops.map((s) => [s.value, s.color])).toEqual([
      [0, '#00ff00'],
      [100, '#ff0000'],
    ]);
    expect(reparsed.advanced.rawCss).toBe('');
  });

  it('attribute-based threshold emits state_attr() and round-trips byte-stable', () => {
    const state = makeState({
      threshold: {
        enabled: true,
        entityId: 'climate.living_room',
        attribute: 'current_temperature',
        properties: ['icon-color'],
        rules: [{ id: '0', operator: '>=', value: 25, color: '#ff0000' }],
        defaultColor: '#888888',
      },
    });
    const css = generateCss(state, 'thermostat');
    expect(css).toContain("state_attr('climate.living_room', 'current_temperature') | float(0) >= 25");
    expect(css).not.toContain("states('climate.living_room')");

    const reparsed = mapToStudioState(parseCardModConfig({ type: 'thermostat', card_mod: { style: css } }));
    expect(reparsed.threshold.enabled).toBe(true);
    expect(reparsed.threshold.entityId).toBe('climate.living_room');
    expect(reparsed.threshold.attribute).toBe('current_temperature');
    expect(reparsed.advanced.rawCss).toBe('');
    expect(generateCss(reparsed, 'thermostat')).toBe(css);
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

// ---------------------------------------------------------------------------
// Threshold — gradient (fade) mode
// ---------------------------------------------------------------------------

describe('gradient color math', () => {
  it('lerpColor interpolates linearly between two hex colors', () => {
    expect(lerpColor('#000000', '#ffffff', 0)).toBe('#000000');
    expect(lerpColor('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('8-digit hex (alpha) drops the alpha instead of turning gray (regression)', () => {
    expect(lerpColor('#ff0000ff', '#ff0000ff', 0.5)).toBe('#ff0000');
    expect(lerpColor('#f00f', '#f00f', 0.5)).toBe('#ff0000');
  });

  it('colorAtValue clamps below the lowest stop and above the highest', () => {
    const stops = [
      { id: 'a', value: 0, color: '#9e9e9e' },
      { id: 'b', value: 100, color: '#f44336' },
    ];
    expect(colorAtValue(stops, -50)).toBe('#9e9e9e');
    expect(colorAtValue(stops, 500)).toBe('#f44336');
    expect(colorAtValue(stops, 0)).toBe('#9e9e9e');
    expect(colorAtValue(stops, 100)).toBe('#f44336');
  });

  it('colorAtValue interpolates within the middle of a segment', () => {
    const stops = [
      { id: 'a', value: 0, color: '#000000' },
      { id: 'b', value: 100, color: '#ffffff' },
    ];
    expect(colorAtValue(stops, 50)).toBe('#808080');
  });

  it('colorAtValue picks the right segment across 3+ stops', () => {
    const stops = [
      { id: 'a', value: 0, color: '#9e9e9e' },
      { id: 'b', value: 150, color: '#ff9800' },
      { id: 'c', value: 220, color: '#ff5722' },
    ];
    // Between b and c, not a and b.
    const mid = colorAtValue(stops, 185);
    expect(mid).not.toBe('#9e9e9e');
    expect(mid).not.toBe('#ff9800');
    expect(mid).not.toBe('#ff5722');
  });

  it('gradientToRules produces a discrete >= chain whose default is the lowest stop\'s color', () => {
    const stops = [
      { id: 'a', value: 0, color: '#9e9e9e' },
      { id: 'b', value: 240, color: '#f44336' },
    ];
    const { rules, defaultColor } = gradientToRules(stops);
    expect(defaultColor).toBe('#9e9e9e');
    expect(rules.length).toBeGreaterThan(1);
    expect(rules.every((r) => r.operator === '>=')).toBe(true);
    // The highest-value rule should land on (or very near) the top stop's color.
    const top = rules.reduce((a, b) => (a.value > b.value ? a : b));
    expect(top.color).toBe('#f44336');
  });

  it('encodeGradientStops/decodeGradientStops round-trip', () => {
    const stops = [
      { id: 'a', value: 0, color: '#9e9e9e' },
      { id: 'b', value: 150, color: '#ff9800' },
      { id: 'c', value: 220, color: '#ff5722' },
    ];
    const decoded = decodeGradientStops(encodeGradientStops(stops));
    expect(decoded).toEqual(stops.map((s) => ({ id: expect.any(String), value: s.value, color: s.color })));
  });

  it('decodeGradientStops rejects malformed input instead of throwing', () => {
    expect(decodeGradientStops('not a real value')).toBeNull();
    expect(decodeGradientStops('')).toBeNull();
    expect(decodeGradientStops('0')).toBeNull(); // needs at least 2 stops
    expect(decodeGradientStops('0:notahexcolor,10:#fff')).toBeNull();
  });

  it('encodeGradientStops never emits { or } — real card-mod silently fails to apply ANY style in the block if it does', () => {
    // Confirmed directly against a live card-mod instance: a JSON-braced
    // marker produced zero applied style (not even an error) on the exact
    // same block; a brace-free encoding of the identical data worked. This
    // is why encodeGradientStops isn't JSON — guard against it regressing.
    const stops = [
      { id: 'a', value: 0, color: '#9e9e9e' },
      { id: 'b', value: 150, color: '#ff9800' },
      { id: 'c', value: 220, color: '#ff5722' },
    ];
    const encoded = encodeGradientStops(stops);
    expect(encoded).not.toContain('{');
    expect(encoded).not.toContain('}');
  });

  it('the full generated gradient marker declaration contains no braces anywhere', () => {
    const css = generateCss(makeState({
      threshold: {
        enabled: true, entityId: 'sensor.temp', properties: ['icon-color'],
        valueMode: 'gradient', rules: [], defaultColor: '#888888',
        colorStops: [
          { id: 'a', value: 0, color: '#9e9e9e' },
          { id: 'b', value: 150, color: '#ff9800' },
          { id: 'c', value: 220, color: '#ff5722' },
        ],
      },
    }));
    const markerLine = css.split('\n').find((l) => l.includes('--cms-gradient-stops'));
    expect(markerLine).toBeDefined();
    expect(markerLine).not.toContain('{');
    expect(markerLine).not.toContain('}');
  });
});

describe('generateCss — threshold gradient mode', () => {
  const stops = [
    { id: 'a', value: 0, color: '#9e9e9e' },
    { id: 'b', value: 150, color: '#ff9800' },
    { id: 'c', value: 220, color: '#ff5722' },
  ];

  it('emits a discrete-approximation ternary plus the recoverable gradient marker', () => {
    const css = generateCss(makeState({
      threshold: {
        enabled: true, entityId: 'sensor.temp', properties: ['icon-color'],
        valueMode: 'gradient', rules: [], defaultColor: '#888888', colorStops: stops,
      },
    }));
    expect(css).toContain('ha-state-icon');
    expect(css).toContain('--cms-gradient-stops:');
    expect(css).toContain("states('sensor.temp')");
  });

  it('round-trips gradient mode back into colorStops, not ~32 switch-mode rules', () => {
    const css = generateCss(makeState({
      threshold: {
        enabled: true, entityId: 'sensor.temp', properties: ['icon-color'],
        valueMode: 'gradient', rules: [], defaultColor: '#888888', colorStops: stops,
      },
    }));
    const parsed = parseCardModConfig({ type: 'sensor', card_mod: { style: css } });
    const state = mapToStudioState(parsed);

    expect(state.threshold.enabled).toBe(true);
    expect(state.threshold.valueMode).toBe('gradient');
    expect(state.threshold.colorStops.map((s) => ({ value: s.value, color: s.color })))
      .toEqual(stops.map((s) => ({ value: s.value, color: s.color })));
    expect(state.advanced.rawCss).toBe('');
  });

  it('gradient mode can drive multiple properties from one set of stops', () => {
    const css = generateCss(makeState({
      threshold: {
        enabled: true, entityId: 'sensor.temp', properties: ['icon-color', 'accent-color'],
        valueMode: 'gradient', rules: [], defaultColor: '#888888', colorStops: stops,
      },
    }));
    expect(css).toMatch(/ha-state-icon\s*\{/);
    expect(css).toMatch(/ha-card\s*\{[\s\S]*?--accent-color:/);

    const parsed = parseCardModConfig({ type: 'sensor', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.threshold.valueMode).toBe('gradient');
    expect(state.threshold.properties.sort()).toEqual(['accent-color', 'icon-color']);
  });

  it('does nothing when fewer than 2 stops are configured', () => {
    const css = generateCss(makeState({
      threshold: {
        enabled: true, entityId: 'sensor.temp', properties: ['icon-color'],
        valueMode: 'gradient', rules: [], defaultColor: '#888888',
        colorStops: [{ id: 'a', value: 0, color: '#9e9e9e' }],
      },
    }));
    expect(css).toBe('');
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

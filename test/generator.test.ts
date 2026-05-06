/**
 * Unit tests for the Phase 3/4 generator pipeline:
 *   generateCss + applyCardModStyle
 */

import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { applyCardModStyle } from '../src/generator/yaml-generator.js';
import {
  DEFAULT_FILTER,
  DEFAULT_ICON_COLOR,
  DEFAULT_BACKGROUND,
  DEFAULT_ANIMATION,
  DEFAULT_BORDER,
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
    background: { ...DEFAULT_BACKGROUND },
    animation: { ...DEFAULT_ANIMATION },
    border: { ...DEFAULT_BORDER },
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
      makeState({ filter: { ...DEFAULT_FILTER, enabled: true, grayscaleWhenOff: true } }),
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
          grayscaleWhenOff: true,
          brightness: 80,
          blur: 3,
        },
      }),
    );
    expect(css).toContain('grayscale(100%) brightness(80%) blur(3px)');
    // On-value should contain brightness and blur but not grayscale
    expect(css).toContain("else 'brightness(80%) blur(3px)'");
  });

  it('emits transition only when filter is present', () => {
    const css = generateCss(
      makeState({ filter: { ...DEFAULT_FILTER, enabled: true, grayscaleWhenOff: true, transitionMs: 500 } }),
    );
    expect(css).toContain('transition: filter 500ms ease;');
  });

  it('does NOT emit transition when filter produces no declarations', () => {
    // brightness=100, blur=0, no grayscale → no filter declarations → no transition
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
        iconColor: { enabled: true, colorOn: '#2196F3', colorOff: '#6b6b6b' },
      }),
    );
    expect(css).toContain('ha-state-icon');
    expect(css).toContain("'#2196F3' if is_state(config.entity, 'on') else '#6b6b6b'");
    expect(css).toContain('!important');
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
        filter: { ...DEFAULT_FILTER, enabled: true, grayscaleWhenOff: true },
        background: { ...DEFAULT_BACKGROUND, enabled: true, type: 'solid', color1: '#1a1a2e' },
      }),
    );
    // Both declarations should appear in the output and ha-card selector
    // should appear exactly once (Jinja2 {{ }} inside values foils simple
    // regex block extraction, so we count selector occurrences instead)
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
});

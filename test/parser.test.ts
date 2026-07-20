/**
 * Unit tests for the Phase 2 parser pipeline:
 *   css-parser → yaml-parser → state-mapper
 */

import { describe, it, expect } from 'vitest';
import { parseCss } from '../src/parser/css-parser.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';
import { mapToStudioState, parseEntityRowCss, parseThresholdJinja } from '../src/parser/state-mapper.js';
import type { CardModCardConfig } from '../src/types/index.js';

// =============================================================================
// css-parser
// =============================================================================

describe('parseCss', () => {
  // ---------------------------------------------------------------------------
  // Basic parsing
  // ---------------------------------------------------------------------------

  it('returns empty array for empty string', () => {
    expect(parseCss('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parseCss('   \n  ')).toEqual([]);
  });

  it('parses a single selector with one property', () => {
    const result = parseCss('ha-card { border-radius: 12px; }');
    expect(result).toHaveLength(1);
    expect(result[0].selector).toBe('ha-card');
    expect(result[0].properties).toHaveLength(1);
    expect(result[0].properties[0].property).toBe('border-radius');
    expect(result[0].properties[0].value).toBe('12px');
    expect(result[0].properties[0].hasCondition).toBe(false);
  });

  it('parses multiple properties in one block', () => {
    const css = `ha-card {
      border-radius: 12px;
      background: #1a1a2e;
      transition: filter 0.3s ease;
    }`;
    const result = parseCss(css);
    expect(result).toHaveLength(1);
    expect(result[0].properties).toHaveLength(3);
    const names = result[0].properties.map((p) => p.property);
    expect(names).toContain('border-radius');
    expect(names).toContain('background');
    expect(names).toContain('transition');
  });

  it('parses multiple selector blocks', () => {
    const css = `
      ha-card { border-radius: 8px; }
      ha-state-icon { color: blue; }
    `;
    const result = parseCss(css);
    expect(result).toHaveLength(2);
    expect(result[0].selector).toBe('ha-card');
    expect(result[1].selector).toBe('ha-state-icon');
  });

  it('strips !important from values', () => {
    const result = parseCss('ha-state-icon { color: red !important; }');
    expect(result[0].properties[0].value).toBe('red');
  });

  it('lowercases property names', () => {
    const result = parseCss('ha-card { Background-Color: blue; }');
    expect(result[0].properties[0].property).toBe('background-color');
  });

  it('skips @-rules (keyframes etc.) at top level', () => {
    const css = `
      ha-card { color: red; }
      @keyframes pulse { 0% { opacity: 1; } 100% { opacity: 0; } }
    `;
    const result = parseCss(css);
    // Only ha-card should be parsed; @keyframes is skipped
    expect(result).toHaveLength(1);
    expect(result[0].selector).toBe('ha-card');
  });

  it('does not split property name on a colon inside the value', () => {
    const result = parseCss('ha-card { background: url(https://example.com/image.png); }');
    expect(result[0].properties[0].property).toBe('background');
    expect(result[0].properties[0].value).toBe('url(https://example.com/image.png)');
  });

  // ---------------------------------------------------------------------------
  // Jinja2 — hasCondition: false
  // ---------------------------------------------------------------------------

  it('marks plain values as hasCondition false', () => {
    const result = parseCss('ha-card { color: red; }');
    expect(result[0].properties[0].hasCondition).toBe(false);
    expect(result[0].properties[0].onValue).toBeUndefined();
    expect(result[0].properties[0].offValue).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Jinja2 — entity state pattern (off-first form)
  // ---------------------------------------------------------------------------

  it('parses off-first entity state Jinja2 pattern', () => {
    const css = `ha-card {
      filter: {{ 'grayscale(100%)' if is_state(config.entity, 'off') else 'none' }};
    }`;
    const result = parseCss(css);
    const filterProp = result[0].properties[0];
    expect(filterProp.property).toBe('filter');
    expect(filterProp.hasCondition).toBe(true);
    expect(filterProp.offValue).toBe('grayscale(100%)');
    expect(filterProp.onValue).toBe('none');
  });

  it('parses on-first entity state Jinja2 pattern', () => {
    const css = `ha-state-icon {
      color: {{ '#2196F3' if is_state(config.entity, 'on') else '#6b6b6b' }};
    }`;
    const result = parseCss(css);
    const colorProp = result[0].properties[0];
    expect(colorProp.hasCondition).toBe(true);
    expect(colorProp.onValue).toBe('#2196F3');
    expect(colorProp.offValue).toBe('#6b6b6b');
  });

  it('handles Jinja2 with extra whitespace inside braces', () => {
    const css = `ha-card {
      filter: {{  'grayscale(100%)'  if  is_state( config.entity , 'off' )  else  'none'  }};
    }`;
    const result = parseCss(css);
    const filterProp = result[0].properties[0];
    expect(filterProp.hasCondition).toBe(true);
    expect(filterProp.offValue).toBe('grayscale(100%)');
    expect(filterProp.onValue).toBe('none');
  });

  it('flags unknown Jinja2 patterns as hasCondition true without on/off values', () => {
    const css = "ha-card { color: {{ some_custom_template() }}; }";
    const result = parseCss(css);
    const prop = result[0].properties[0];
    expect(prop.hasCondition).toBe(true);
    expect(prop.onValue).toBeUndefined();
    expect(prop.offValue).toBeUndefined();
  });

  it('handles a combined filter value with grayscale and brightness', () => {
    const css = `ha-card {
      filter: {{ 'grayscale(100%) brightness(85%)' if is_state(config.entity, 'off') else 'brightness(85%)' }};
    }`;
    const result = parseCss(css);
    const filterProp = result[0].properties[0];
    expect(filterProp.hasCondition).toBe(true);
    expect(filterProp.offValue).toBe('grayscale(100%) brightness(85%)');
    expect(filterProp.onValue).toBe('brightness(85%)');
  });

  it('restores Jinja2 in the stored value string', () => {
    const css = "ha-card { filter: {{ 'none' if is_state(config.entity, 'on') else 'grayscale(100%)' }}; }";
    const result = parseCss(css);
    const value = result[0].properties[0].value;
    expect(value).toContain('{{');
    expect(value).toContain('}}');
    expect(value).toContain('is_state');
  });

  // ---------------------------------------------------------------------------
  // Same-selector / same-property coalescing (later declaration wins)
  //
  // Regression coverage: a hand-layered "static default, then a later
  // conditional override" pattern — two separate ha-card { } blocks, the
  // second overriding a property the first also sets — used to make the
  // *live* (second) value collide on the same claimKey(selector, property)
  // as the first and vanish silently (not even landing in Advanced CSS),
  // since findTarget/findProp only ever looked at the first match.
  // ---------------------------------------------------------------------------

  it('merges two blocks with the same selector into one target', () => {
    const css = `
      ha-card { --accent-color: red; }
      ha-card { --state-icon-color: blue; }
    `;
    const result = parseCss(css);
    expect(result).toHaveLength(1);
    expect(result[0].selector).toBe('ha-card');
    const names = result[0].properties.map((p) => p.property);
    expect(names).toEqual(['--accent-color', '--state-icon-color']);
  });

  it('keeps only the later occurrence when the same selector+property repeats across blocks', () => {
    const css = `
      ha-card { --accent-color: var(--red-color); }
      ha-card { --accent-color: {{ '#f44336' if states('sensor.x') | float(0) > 0 else '#888888' }}; }
    `;
    const result = parseCss(css);
    expect(result).toHaveLength(1);
    const accentProps = result[0].properties.filter((p) => p.property === '--accent-color');
    expect(accentProps).toHaveLength(1);
    expect(accentProps[0].hasCondition).toBe(true);
    expect(accentProps[0].value).toContain('float(0)');
  });

  it('keeps only the later occurrence when the same property repeats within one block', () => {
    const result = parseCss('ha-card { --accent-color: red; --accent-color: blue; }');
    expect(result[0].properties).toHaveLength(1);
    expect(result[0].properties[0].value).toBe('blue');
  });

  it('selector coalescing is case/whitespace-insensitive', () => {
    const css = `
      ha-card { color: red; }
      HA-CARD  { background: blue; }
    `;
    const result = parseCss(css);
    expect(result).toHaveLength(1);
    const names = result[0].properties.map((p) => p.property);
    expect(names).toEqual(['color', 'background']);
  });
});

// =============================================================================
// yaml-parser
// =============================================================================

describe('parseCardModConfig', () => {
  it('returns empty state when card has no card_mod key', () => {
    const config: CardModCardConfig = { type: 'button' };
    const result = parseCardModConfig(config);
    expect(result.targets).toHaveLength(0);
    expect(result.rawCss).toBe('');
  });

  it('returns empty state when card_mod.style is undefined', () => {
    const config: CardModCardConfig = { type: 'button', card_mod: {} };
    const result = parseCardModConfig(config);
    expect(result.targets).toHaveLength(0);
  });

  it('returns empty state when card_mod.style is empty string', () => {
    const config: CardModCardConfig = { type: 'button', card_mod: { style: '' } };
    const result = parseCardModConfig(config);
    expect(result.targets).toHaveLength(0);
    expect(result.rawCss).toBe('');
  });

  it('parses a string style', () => {
    const config: CardModCardConfig = {
      type: 'button',
      card_mod: { style: 'ha-card { border-radius: 8px; }' },
    };
    const result = parseCardModConfig(config);
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].selector).toBe('ha-card');
    expect(result.rawCss).toBe('ha-card { border-radius: 8px; }');
  });

  it('parses a dictionary style', () => {
    const config: CardModCardConfig = {
      type: 'button',
      card_mod: {
        style: {
          'ha-card': 'border-radius: 12px;',
          'ha-state-icon': 'color: red;',
        },
      },
    };
    const result = parseCardModConfig(config);
    expect(result.targets).toHaveLength(2);
    const selectors = result.targets.map((t) => t.selector);
    expect(selectors).toContain('ha-card');
    expect(selectors).toContain('ha-state-icon');
  });

  it('skips non-string dictionary values gracefully', () => {
    const config: CardModCardConfig = {
      type: 'button',
      card_mod: {
        style: {
          'ha-card': 'color: red;',
          // @ts-expect-error intentional bad value for test
          '$': 42,
        },
      },
    };
    const result = parseCardModConfig(config);
    // Only ha-card should be parsed
    expect(result.targets).toHaveLength(1);
  });

  it('preserves raw CSS in the returned state', () => {
    const css = 'ha-card { filter: grayscale(50%); }';
    const config: CardModCardConfig = {
      type: 'button',
      card_mod: { style: css },
    };
    expect(parseCardModConfig(config).rawCss).toBe(css);
  });

  // ---------------------------------------------------------------------------
  // UIX (github.com/Lint-Free-Technology/uix) — reads `uix` in preference to
  // `card_mod`, mirroring UIX's own `config.uix ?? config.card_mod` precedence.
  // ---------------------------------------------------------------------------

  it('parses a string style from uix when card_mod is absent', () => {
    const config: CardModCardConfig = {
      type: 'button',
      uix: { style: 'ha-card { border-radius: 8px; }' },
    };
    const result = parseCardModConfig(config);
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].selector).toBe('ha-card');
  });

  it('prefers uix.style over card_mod.style when both are present', () => {
    const config: CardModCardConfig = {
      type: 'button',
      uix: { style: 'ha-card { color: red; }' },
      card_mod: { style: 'ha-card { color: blue; }' },
    };
    const result = parseCardModConfig(config);
    expect(result.rawCss).toBe('ha-card { color: red; }');
  });

  it('falls back to card_mod.style when uix has no style', () => {
    const config: CardModCardConfig = {
      type: 'button',
      uix: { debug: true },
      card_mod: { style: 'ha-card { color: blue; }' },
    };
    const result = parseCardModConfig(config);
    expect(result.rawCss).toBe('ha-card { color: blue; }');
  });

  it('falls back to card_mod.style when uix.style is an explicit empty string', () => {
    const config: CardModCardConfig = {
      type: 'button',
      uix: { style: '' },
      card_mod: { style: 'ha-card { color: blue; }' },
    };
    const result = parseCardModConfig(config);
    expect(result.rawCss).toBe('ha-card { color: blue; }');
  });

  it('parses a dictionary style from uix', () => {
    const config: CardModCardConfig = {
      type: 'button',
      uix: {
        style: {
          'ha-card': 'border-radius: 12px;',
          'ha-state-icon': 'color: red;',
        },
      },
    };
    const result = parseCardModConfig(config);
    expect(result.targets).toHaveLength(2);
  });
});

// =============================================================================
// state-mapper
// =============================================================================

describe('mapToStudioState', () => {
  // ---------------------------------------------------------------------------
  // Filter module
  // ---------------------------------------------------------------------------

  it('detects grayscale-when-off pattern', () => {
    const css = `ha-card {
      filter: {{ 'grayscale(100%)' if is_state(config.entity, 'off') else 'none' }};
    }`;
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.filter.enabled).toBe(true);
    expect(state.filter.grayscale).toBe(true);
    expect(state.filter.grayscaleWhen).toBe('off');
  });

  it('detects grayscale-when-on pattern', () => {
    const css = `ha-card {
      filter: {{ 'grayscale(100%)' if is_state(config.entity, 'on') else 'none' }};
    }`;
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.filter.enabled).toBe(true);
    expect(state.filter.grayscale).toBe(true);
    expect(state.filter.grayscaleWhen).toBe('on');
  });

  it('does NOT flag grayscale when on-value is not "none"', () => {
    const css = `ha-card {
      filter: {{ 'grayscale(100%)' if is_state(config.entity, 'off') else 'saturate(200%)' }};
    }`;
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.filter.grayscale).toBe(false);
  });

  it('detects brightness from on-value', () => {
    const css = `ha-card {
      filter: {{ 'grayscale(100%) brightness(70%)' if is_state(config.entity, 'off') else 'brightness(70%)' }};
    }`;
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.filter.brightness).toBe(70);
  });

  it('detects blur from conditional on-value', () => {
    const css = `ha-card {
      filter: {{ 'blur(5px)' if is_state(config.entity, 'on') else 'none' }};
    }`;
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.filter.enabled).toBe(true);
    expect(state.filter.blur).toBe(5);
  });

  it('detects transition duration in milliseconds (alongside a recognised filter)', () => {
    const css = 'ha-card { filter: brightness(70%); transition: filter 500ms ease; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.filter.transitionMs).toBe(500);
    expect(state.advanced.rawCss).toBe('');
  });

  it('detects transition duration in seconds (alongside a recognised filter)', () => {
    const css = 'ha-card { filter: brightness(70%); transition: filter 0.3s ease; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.filter.transitionMs).toBe(300);
  });

  it('preserves a standalone hand-authored transition (no filter) in Advanced CSS instead of eating it', () => {
    // Regression: this used to be claimed by the filter module but never
    // re-emitted (the generator only writes transition alongside filter
    // declarations) — so a save deleted it.
    const css = 'ha-card { transition: all 0.3s ease; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.filter.enabled).toBe(false);
    expect(state.advanced.rawCss).toContain('transition: all 0.3s ease');
  });

  // ---------------------------------------------------------------------------
  // Icon color module
  // ---------------------------------------------------------------------------

  it('detects icon color on/off from ha-state-icon', () => {
    const css = `ha-state-icon {
      color: {{ '#2196F3' if is_state(config.entity, 'on') else '#6b6b6b' }};
    }`;
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.iconColor.enabled).toBe(true);
    expect(state.iconColor.colorOn).toBe('#2196F3');
    expect(state.iconColor.colorOff).toBe('#6b6b6b');
  });

  it('detects plain (non-conditional) icon color in plain mode', () => {
    const css = 'ha-state-icon { color: red; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.iconColor.enabled).toBe(true);
    expect(state.iconColor.mode).toBe('plain');
    expect(state.iconColor.color).toBe('red');
  });

  it('detects plain icon color with !important stripped', () => {
    const css = 'ha-state-icon { color: yellow !important; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.iconColor.enabled).toBe(true);
    expect(state.iconColor.mode).toBe('plain');
    expect(state.iconColor.color).toBe('yellow');
  });

  // ---------------------------------------------------------------------------
  // Accent color module
  // ---------------------------------------------------------------------------

  it('detects --accent-color CSS custom property', () => {
    const css = 'ha-card { --accent-color: yellow; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.accentColor.enabled).toBe(true);
    expect(state.accentColor.color).toBe('yellow');
  });

  it('detects --accent-color hex value', () => {
    const css = 'ha-card { --accent-color: #03a9f4; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.accentColor.enabled).toBe(true);
    expect(state.accentColor.color).toBe('#03a9f4');
  });

  it('does not claim --accent-color into rawCss', () => {
    const css = 'ha-card { --accent-color: yellow; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.advanced.rawCss).toBe('');
  });

  // ---------------------------------------------------------------------------
  // Background module
  // ---------------------------------------------------------------------------

  it('detects a solid background color', () => {
    const css = 'ha-card { background: #1a1a2e; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.background.enabled).toBe(true);
    expect(state.background.type).toBe('solid');
    expect(state.background.color1).toBe('#1a1a2e');
  });

  it('detects a linear-gradient background', () => {
    const css = 'ha-card { background: linear-gradient(135deg, #2196F3, #FF8C00); }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.background.enabled).toBe(true);
    expect(state.background.type).toBe('gradient');
    expect(state.background.angle).toBe(135);
    expect(state.background.color1).toBe('#2196F3');
    expect(state.background.color2).toBe('#FF8C00');
  });

  it('does not enable background for a conditional background value', () => {
    const css = "ha-card { background: {{ 'red' if is_state(config.entity,'on') else 'blue' }}; }";
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.background.enabled).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Border module
  // ---------------------------------------------------------------------------

  it('detects border-radius', () => {
    const css = 'ha-card { border-radius: 16px; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.border.enabled).toBe(true);
    expect(state.border.radiusPx).toBe(16);
  });

  it('detects border shorthand', () => {
    const css = 'ha-card { border: 2px solid #2196F3; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.border.enabled).toBe(true);
    expect(state.border.borderWidth).toBe(2);
    expect(state.border.borderColor).toBe('#2196F3');
  });

  // ---------------------------------------------------------------------------
  // Advanced module
  // ---------------------------------------------------------------------------

  it('puts unrecognised properties in rawCss', () => {
    const css = 'ha-card { color: red; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.advanced.rawCss).toContain('ha-card');
    expect(state.advanced.rawCss).toContain('color: red');
  });

  it('does not put claimed properties in rawCss', () => {
    const css = 'ha-card { border-radius: 12px; filter: {{ \'grayscale(100%)\' if is_state(config.entity, \'off\') else \'none\' }}; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.advanced.rawCss).toBe('');
  });

  it('preserves a hand-authored @keyframes block in rawCss (regression: deleted on first save)', () => {
    const css =
      '@keyframes myspin {\n  from { transform: rotate(0deg); }\n  to { transform: rotate(360deg); }\n}\n\n' +
      'ha-card {\n  animation: myspin 2s linear infinite;\n}';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.advanced.rawCss).toContain('@keyframes myspin');
    expect(state.advanced.rawCss).toContain('rotate(360deg)');
    // The unrecognised animation declaration must survive too.
    expect(state.advanced.rawCss).toContain('animation: myspin 2s linear infinite');
  });

  it('preserves a hand-authored @media block in rawCss', () => {
    const css = '@media (max-width: 600px) {\n  ha-card { padding: 4px; }\n}';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.advanced.rawCss).toContain('@media (max-width: 600px)');
    expect(state.advanced.rawCss).toContain('padding: 4px');
  });

  it('does NOT pass through the studio\'s own @keyframes cms-* blocks (animation module regenerates them)', () => {
    const css =
      '@keyframes cms-pulse {\n  0%, 100% { transform: scale(1); }\n  50% { transform: scale(1.05); }\n}\n\n' +
      "ha-card {\n  animation: {{ 'cms-pulse 2s ease-in-out infinite' if is_state(config.entity, 'on') else 'none' }};\n}";
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.animation.enabled).toBe(true);
    expect(state.advanced.rawCss).toBe('');
  });

  it('keeps !important on preserved unclaimed declarations (regression: silently stripped)', () => {
    const css = 'ha-card { opacity: 0.5 !important; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.advanced.rawCss).toContain('opacity: 0.5 !important;');
  });

  it('recognises a hand-authored font-size alone (partial CSS) without requiring weight/color/family', () => {
    const css = 'ha-card { font-size: 18px; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.font.enabled).toBe(true);
    expect(state.font.fontSize).toBe(18);
    expect(state.font.fontWeight).toBe('normal'); // default, not claimed
    expect(state.advanced.rawCss).toBe('');
  });

  it('does not recognise Font from font-weight/color alone (no font-size present)', () => {
    const css = 'ha-card { color: #ff0000; font-weight: bold; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.font.enabled).toBe(false);
    // Falls through to Advanced CSS rather than being silently dropped.
    expect(state.advanced.rawCss).toContain('color: #ff0000');
    expect(state.advanced.rawCss).toContain('font-weight: bold');
  });

  it('ignores a conditional (Jinja) font-size — that is Threshold/Advanced territory, not the plain Font module', () => {
    const css = "ha-card { font-size: {{ '20px' if is_state(config.entity, 'on') else '14px' }}; }";
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.font.enabled).toBe(false);
    expect(state.advanced.rawCss).toContain('font-size');
  });

  it('parses negative threshold rule values (regression: freezer/outdoor temps were deleted on reopen)', () => {
    const css =
      "ha-state-icon {\n  color: {{ '#ff0000' if states('sensor.freezer') | float(0) >= -5 else ('#2196f3' if states('sensor.freezer') | float(0) >= -25 else '#888888') }} !important;\n}";
    const parsed = parseCardModConfig({ type: 'sensor', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.threshold.enabled).toBe(true);
    expect(state.threshold.rules.map((r) => r.value).sort((a, b) => a - b)).toEqual([-25, -5]);
    expect(state.advanced.rawCss).toBe('');
  });

  it('keeps grayscale through a round-trip when brightness is also set (regression: dropped)', () => {
    // Exactly what filterDecls emits for {grayscale, when=off, brightness:70}.
    const css =
      "ha-card {\n  filter: {{ 'grayscale(100%) brightness(70%)' if is_state(config.entity, 'off') else 'brightness(70%)' }};\n  transition: filter 300ms ease;\n}";
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.filter.enabled).toBe(true);
    expect(state.filter.grayscale).toBe(true);
    expect(state.filter.grayscaleWhen).toBe('off');
    expect(state.filter.brightness).toBe(70);
    expect(state.advanced.rawCss).toBe('');
  });

  it('keeps a custom-entity animation trigger through a round-trip (regression: rebound to the card entity)', () => {
    const css =
      "ha-card {\n  animation: {{ 'cms-pulse 2s ease-in-out infinite' if is_state('binary_sensor.doorbell', 'on') else 'none' }};\n}";
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.animation.enabled).toBe(true);
    expect(state.animation.trigger).toBe('custom');
    expect(state.animation.customEntity).toBe('binary_sensor.doorbell');
  });

  it('does not invent a border-radius for a hand-authored border with none (regression: gained 12px on save)', () => {
    const css = 'ha-card { border: 2px solid red; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.border.enabled).toBe(true);
    expect(state.border.borderWidth).toBe(2);
    expect(state.border.radiusPx).toBe(0);
  });

  it('claims the --ha-icon-size twin the heading generator emits (regression: leaked to Advanced as stale override)', () => {
    const css = `.container {\n  justify-content: center !important;\n}\n\n.title p {\n  font-size: 24px;\n  color: #fff !important;\n}\n\n.title ha-icon {\n  --mdc-icon-size: 32px;\n  --ha-icon-size: 32px;\n  color: #fff !important;\n}`;
    const parsed = parseCardModConfig({ type: 'heading', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.headingStyle.enabled).toBe(true);
    expect(state.headingStyle.iconSize).toBe(32);
    expect(state.advanced.rawCss).toBe('');
  });

  it('claims gradient-shift\'s background-size companion (regression: leaked and outlived the preset)', () => {
    const css = "ha-card {\n  background-size: 200% auto;\n  animation: cms-gradient-shift 2s ease-in-out infinite;\n}";
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.animation.enabled).toBe(true);
    expect(state.animation.preset).toBe('gradient-shift');
    expect(state.advanced.rawCss).toBe('');
  });

  // ---------------------------------------------------------------------------
  // No card_mod
  // ---------------------------------------------------------------------------

  it('returns all-disabled defaults when card has no card_mod', () => {
    const parsed = parseCardModConfig({ type: 'button' });
    const state = mapToStudioState(parsed);
    expect(state.filter.enabled).toBe(false);
    expect(state.iconColor.enabled).toBe(false);
    expect(state.accentColor.enabled).toBe(false);
    expect(state.background.enabled).toBe(false);
    expect(state.border.enabled).toBe(false);
    expect(state.headingStyle.enabled).toBe(false);
    expect(state.advanced.rawCss).toBe('');
  });

  it('parses heading style: font-size, textColor, alignment from .title p', () => {
    const css = `.container {\n  justify-content: center;\n}.title p {\n  font-size: 28px;\n  color: #ff0000;\n  text-align: center;\n}.title ha-icon {\n  --mdc-icon-size: 32px;\n  color: #00ff00;\n}`;
    const parsed = parseCardModConfig({ type: 'heading', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.headingStyle.enabled).toBe(true);
    expect(state.headingStyle.fontSize).toBe(28);
    expect(state.headingStyle.textColor).toBe('#ff0000');
    expect(state.headingStyle.alignment).toBe('center');
    expect(state.headingStyle.iconSize).toBe(32);
    expect(state.headingStyle.iconColor).toBe('#00ff00');
    expect(state.advanced.rawCss).toBe('');
  });

  it('parses heading alignment from justify-content flex-end → right', () => {
    const css = `.container {\n  justify-content: flex-end;\n}.title p {\n  font-size: 20px;\n  color: #fff;\n  text-align: right;\n}.title ha-icon {\n  --mdc-icon-size: 20px;\n  color: #fff;\n}`;
    const parsed = parseCardModConfig({ type: 'heading', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.headingStyle.alignment).toBe('right');
  });

  it('leaves unrecognised heading properties in advanced rawCss', () => {
    // (font-weight moved out of this test when it became a recognised
    // Heading Style field in 0.8.0 — text-shadow has no module.)
    const css = `.title p {\n  font-size: 24px;\n  color: #e1e1e1;\n  text-align: left;\n  text-shadow: 1px 1px #000000;\n}`;
    const parsed = parseCardModConfig({ type: 'heading', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.headingStyle.enabled).toBe(true);
    expect(state.advanced.rawCss).toContain('text-shadow');
  });

  it('recognises heading font-weight and font-family as Heading Style fields (issue #25 follow-up)', () => {
    const css = `.title p {\n  font-size: 24px;\n  color: #e1e1e1;\n  font-weight: 500;\n  font-family: monospace;\n}`;
    const parsed = parseCardModConfig({ type: 'heading', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.headingStyle.enabled).toBe(true);
    expect(state.headingStyle.fontWeight).toBe('medium');
    expect(state.headingStyle.fontFamily).toBe('monospace');
    expect(state.advanced.rawCss).toBe('');
  });

  it('recognises sensor card pattern: --accent-color + plain icon color', () => {
    const css = `ha-card {\n  --accent-color: yellow;\n}\nha-state-icon {\n  color: yellow !important;\n}`;
    const parsed = parseCardModConfig({ type: 'sensor', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.accentColor.enabled).toBe(true);
    expect(state.accentColor.color).toBe('yellow');
    expect(state.iconColor.enabled).toBe(true);
    expect(state.iconColor.mode).toBe('plain');
    expect(state.iconColor.color).toBe('yellow');
    expect(state.advanced.rawCss).toBe('');
  });
});

// =============================================================================
// parseEntityRowCss (entities-card per-row style recognition)
// =============================================================================

describe('parseEntityRowCss', () => {
  it('parses a static icon + text color with no :host wrapper (bare declarations)', () => {
    const style = parseEntityRowCss('--state-icon-color: #ff0000;\ncolor: #00ff00;');
    expect(style.iconColor).toBe('#ff0000');
    expect(style.iconMode).toBeUndefined();
    expect(style.textColor).toBe('#00ff00');
    expect(style.textMode).toBeUndefined();
  });

  it('parses a static icon + text color wrapped in :host { } (our own generated form)', () => {
    const style = parseEntityRowCss(':host {\n  --state-icon-color: #ff0000;\n  color: #00ff00;\n}');
    expect(style.iconColor).toBe('#ff0000');
    expect(style.textColor).toBe('#00ff00');
  });

  it('falls back to --paper-item-icon-color when --state-icon-color is absent', () => {
    const style = parseEntityRowCss(':host { --paper-item-icon-color: #123456; }');
    expect(style.iconColor).toBe('#123456');
  });

  it('preserves unrecognised row declarations in extraCss instead of losing them', () => {
    // Regression: any unrelated panel edit rewrote every row from recognised
    // state only, deleting hand-authored declarations like this one.
    // (font-weight moved out of this test when it became a recognised
    // per-row field in 0.8.0 — text-decoration has no row control.)
    const style = parseEntityRowCss(':host {\n  --state-icon-color: #ff0000;\n  text-decoration: underline;\n}');
    expect(style.iconColor).toBe('#ff0000');
    expect(style.extraCss).toContain('text-decoration: underline');
  });

  it('preserves a fully-unrecognised row style in extraCss', () => {
    const style = parseEntityRowCss(':host { text-decoration: underline !important; }');
    expect(style.iconColor).toBe('');
    expect(style.textColor).toBe('');
    expect(style.extraCss).toContain('text-decoration: underline !important');
  });

  it('recognises per-row font-size and font-weight (issue #25 follow-up)', () => {
    const style = parseEntityRowCss(':host {\n  font-size: 18px;\n  font-weight: bold;\n}');
    expect(style.fontSizePx).toBe(18);
    expect(style.fontWeight).toBe('bold');
    expect(style.extraCss).toBeUndefined();
  });

  it('keeps an unrecognised row font-size value (em/var) in extraCss instead of dropping it', () => {
    const style = parseEntityRowCss(':host { font-size: 1.2em; }');
    expect(style.fontSizePx).toBeUndefined();
    expect(style.extraCss).toContain('font-size: 1.2em');
  });

  it('preserves extra selectors beyond the first in extraCss', () => {
    const style = parseEntityRowCss(
      ':host { color: #00ff00; }\nha-icon { transform: scale(1.2); }',
    );
    expect(style.textColor).toBe('#00ff00');
    expect(style.extraCss).toContain('ha-icon');
    expect(style.extraCss).toContain('transform: scale(1.2)');
  });

  it('sets no extraCss for a fully-recognised row style', () => {
    const style = parseEntityRowCss(':host {\n  --state-icon-color: #ff0000;\n  color: #00ff00;\n}');
    expect(style.extraCss).toBeUndefined();
  });

  it('prefers --state-icon-color over --paper-item-icon-color when both are present', () => {
    const style = parseEntityRowCss(
      ':host { --paper-item-icon-color: #111111; --state-icon-color: #222222; }',
    );
    expect(style.iconColor).toBe('#222222');
  });

  // Regression test: a naive `[^;}\n]+` value-capture regex truncates right
  // before the Jinja block's closing "}}", which meant DEFAULT_RE could never
  // match and the row's real default color was silently discarded in favour
  // of the hardcoded #888888 fallback — on every single re-open of the panel.
  it('does not truncate a single-rule threshold expression at the Jinja closing "}}" (default color regression)', () => {
    const style = parseEntityRowCss(
      ":host { --state-icon-color: {{ '#ff0000' if states('light.x') | float(0) >= 85 else '#888888' }}; }",
    );
    expect(style.iconMode).toBe('threshold');
    expect(style.iconRules).toHaveLength(1);
    expect(style.iconRules?.[0]).toMatchObject({ operator: '>=', value: 85, color: '#ff0000' });
    expect(style.iconDefault).toBe('#888888');
  });

  it('round-trips a palette var(--x-color) threshold rule and default (no :host wrapper)', () => {
    const style = parseEntityRowCss(
      "--state-icon-color: {{ 'var(--red-color)' if states('light.ceiling_lights') | float(0) >= 85 else 'var(--grey-color)' }};",
    );
    expect(style.iconMode).toBe('threshold');
    expect(style.iconRules).toHaveLength(1);
    expect(style.iconRules?.[0]).toMatchObject({ operator: '>=', value: 85, color: 'var(--red-color)' });
    // Before the fix this fell back to the hardcoded '#888888' default.
    expect(style.iconDefault).toBe('var(--grey-color)');
  });

  it('parseThresholdJinja recognises the state_attr() attribute form', () => {
    const parsed = parseThresholdJinja(
      "{{ '#ff0000' if state_attr('climate.x', 'current_temperature') | float(0) >= 25 else '#888888' }}",
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.entityId).toBe('climate.x');
    expect(parsed?.attribute).toBe('current_temperature');
    expect(parsed?.rules[0]).toMatchObject({ operator: '>=', value: 25, color: '#ff0000' });
    expect(parsed?.defaultColor).toBe('#888888');
  });

  it('an attribute-form row threshold falls to extraCss (rows have no attribute UI to round-trip it)', () => {
    const css =
      ":host { --state-icon-color: {{ '#ff0000' if state_attr('climate.x', 'current_temperature') | float(0) >= 25 else '#888888' }}; }";
    const style = parseEntityRowCss(css);
    expect(style.iconMode).not.toBe('threshold');
    expect(style.extraCss).toContain('state_attr');
  });

  it('parses a multi-rule text-color threshold independently of icon color', () => {
    const style = parseEntityRowCss(
      ":host {\n  color: {{ '#ff0000' if states('sensor.x') | float(0) >= 85 else ('#ffa500' if states('sensor.x') | float(0) >= 72 else '#4caf50') }};\n}",
    );
    expect(style.textMode).toBe('threshold');
    expect(style.textRules).toHaveLength(2);
    expect(style.textDefault).toBe('#4caf50');
    expect(style.iconMode).toBeUndefined();
    expect(style.iconColor).toBe('');
  });

  it('parses both icon and text thresholds together', () => {
    const style = parseEntityRowCss(
      ":host {\n  --state-icon-color: {{ 'var(--red-color)' if states('x') | float(0) >= 85 else 'var(--grey-color)' }};\n  color: {{ '#ff0000' if states('x') | float(0) >= 85 else '#4caf50' }};\n}",
    );
    expect(style.iconMode).toBe('threshold');
    expect(style.iconDefault).toBe('var(--grey-color)');
    expect(style.textMode).toBe('threshold');
    expect(style.textDefault).toBe('#4caf50');
  });

  it('returns empty static colors for an empty style string', () => {
    const style = parseEntityRowCss('');
    expect(style).toEqual({ iconColor: '', textColor: '' });
  });
});

// ---------------------------------------------------------------------------
// v0.8.1 — legacy corpus + safe adoption of hand-written equivalents
// ---------------------------------------------------------------------------

describe('v0.8.1 legacy corpus and safe adoption', () => {
  const mapCfg = (style: string, type = 'sensor') =>
    mapToStudioState(parseCardModConfig({ type, card_mod: { style } }), type);

  it('adopts ha-card { --state-icon-color } into Icon Color (plain) on supported cards', () => {
    const s = mapCfg('ha-card {\n  --state-icon-color: red;\n}', 'tile');
    expect(s.iconColor.enabled).toBe(true);
    expect(s.iconColor.mode).toBe('plain');
    expect(s.iconColor.color).toBe('red');
    expect(s.advanced.rawCss).toBe('');
  });

  it('adopts the legacy v0.3.x :host { --paper-item-icon-color } form (plain and on/off)', () => {
    const plain = mapCfg(':host {\n  --paper-item-icon-color: #ff0000;\n}', 'sensor');
    expect(plain.iconColor.enabled).toBe(true);
    expect(plain.iconColor.color).toBe('#ff0000');
    expect(plain.advanced.rawCss).toBe('');

    const cond = mapCfg(
      ":host {\n  --paper-item-icon-color: {{ '#ff0000' if is_state(config.entity, 'on') else '#444444' }};\n}",
      'entity',
    );
    expect(cond.iconColor.enabled).toBe(true);
    expect(cond.iconColor.mode).toBe('conditional');
    expect(cond.iconColor.colorOn).toBe('#ff0000');
    expect(cond.advanced.rawCss).toBe('');
  });

  it('adopts the legacy threshold-jinja icon variable into the Threshold module', () => {
    const s = mapCfg(
      ":host {\n  --paper-item-icon-color: {{ '#ff0000' if states('sensor.t') | float(0) >= 30 else '#888888' }};\n}",
      'sensor',
    );
    expect(s.threshold.enabled).toBe(true);
    expect(s.threshold.properties).toEqual(['icon-color']);
    expect(s.advanced.rawCss).toBe('');
  });

  it('adopts ha-icon { color } as Icon Color; does NOT adopt on entities or unsupported cards', () => {
    const ok = mapCfg('ha-icon {\n  color: #00ff00;\n}', 'light');
    expect(ok.iconColor.enabled).toBe(true);
    expect(ok.iconColor.color).toBe('#00ff00');

    const entities = mapCfg('ha-card {\n  --state-icon-color: red;\n}', 'entities');
    expect(entities.iconColor.enabled).toBe(false);
    expect(entities.advanced.rawCss).toContain('--state-icon-color');

    const gauge = mapCfg('ha-card {\n  --state-icon-color: red;\n}', 'gauge');
    expect(gauge.iconColor.enabled).toBe(false);
    expect(gauge.advanced.rawCss).toContain('--state-icon-color');
  });

  it('does not steal an accent companion variable as icon color', () => {
    const s = mapCfg('ha-card {\n  --accent-color: #03a9f4;\n  --state-icon-color: #03a9f4;\n}', 'tile');
    expect(s.accentColor.enabled).toBe(true);
    expect(s.iconColor.enabled).toBe(false);
    expect(s.advanced.rawCss).toBe('');
  });

  it('adopts background-color as a solid Background, but not next to other background-* longhands', () => {
    const s = mapCfg('ha-card {\n  background-color: #123456;\n}', 'tile');
    expect(s.background.enabled).toBe(true);
    expect(s.background.color1).toBe('#123456');
    expect(s.advanced.rawCss).toBe('');

    const img = mapCfg('ha-card {\n  background-color: #123456;\n  background-image: url(x.png);\n}', 'tile');
    expect(img.background.enabled).toBe(false);
    expect(img.advanced.rawCss).toContain('background-color');
    expect(img.advanced.rawCss).toContain('background-image');
  });

  it('leaves unsupported variants untouched in Advanced CSS (no reinterpretation)', () => {
    const s = mapCfg(
      "ha-card {\n  --state-icon-color: color-mix(in srgb, red 40%, blue);\n}",
      'tile',
    );
    // color-mix is adoptable-looking but plain — it IS a static value, so it
    // adopts; the truly unadoptable class is multi-branch Jinja:
    const t = mapCfg(
      "ha-card {\n  --state-icon-color: {{ 'red' if is_state('a.b', 'heat') else 'blue' if is_state('a.b', 'cool') else 'grey' }};\n}",
      'tile',
    );
    expect(t.iconColor.enabled).toBe(false);
    expect(t.threshold.enabled).toBe(false);
    expect(t.advanced.rawCss).toContain('--state-icon-color');
  });

  it('inert legacy gauge shape (ha-card --gauge-color) is preserved, not adopted', () => {
    const s = mapCfg('ha-card {\n  --gauge-color: #ff0000;\n}', 'gauge');
    expect(s.accentColor.enabled).toBe(false);
    expect(s.advanced.rawCss).toContain('--gauge-color');
  });
});

// =============================================================================
// v0.9.0 — value-conditional animation trigger + animation pack presets
// =============================================================================

describe('mapToStudioState — value-conditional animation trigger', () => {
  it('recognises the states() form into trigger=value', () => {
    const css =
      "ha-card {\n  animation: {{ 'cms-pulse 2s ease-in-out infinite' if states('sensor.power') | float(0) > 1500 else 'none' }};\n}";
    const parsed = parseCardModConfig({ type: 'sensor', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.animation.enabled).toBe(true);
    expect(state.animation.trigger).toBe('value');
    expect(state.animation.preset).toBe('pulse');
    expect(state.animation.speedS).toBe(2);
    expect(state.animation.valueEntity).toBe('sensor.power');
    expect(state.animation.valueOperator).toBe('>');
    expect(state.animation.valueThreshold).toBe(1500);
    expect(state.animation.valueAttribute).toBeUndefined();
    expect(state.advanced.rawCss).toBe('');
  });

  it('recognises the state_attr() form incl. the attribute', () => {
    const css =
      "ha-card {\n  animation: {{ 'cms-shake 1s ease-in-out infinite' if state_attr('climate.thermostat', 'current_temperature') | float(0) >= 25 else 'none' }};\n}";
    const parsed = parseCardModConfig({ type: 'thermostat', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.animation.enabled).toBe(true);
    expect(state.animation.trigger).toBe('value');
    expect(state.animation.preset).toBe('shake');
    expect(state.animation.valueEntity).toBe('climate.thermostat');
    expect(state.animation.valueAttribute).toBe('current_temperature');
    expect(state.animation.valueOperator).toBe('>=');
    expect(state.animation.valueThreshold).toBe(25);
    expect(state.advanced.rawCss).toBe('');
  });

  it('recognises a negative threshold (freezer temps)', () => {
    const css =
      "ha-card {\n  animation: {{ 'cms-blink 1s ease-in-out infinite' if states('sensor.freezer') | float(0) > -12.5 else 'none' }};\n}";
    const parsed = parseCardModConfig({ type: 'sensor', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.animation.enabled).toBe(true);
    expect(state.animation.valueThreshold).toBe(-12.5);
    expect(state.advanced.rawCss).toBe('');
  });

  it('unrecognised multi-branch animation Jinja falls through to Advanced CSS', () => {
    const css =
      "ha-card {\n  animation: {{ 'cms-pulse 2s ease-in-out infinite' if states('sensor.power') | float(0) > 1500 else ('cms-breathe 3s ease-in-out infinite' if states('sensor.power') | float(0) > 500 else 'none') }};\n}";
    const parsed = parseCardModConfig({ type: 'sensor', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.animation.enabled).toBe(false);
    expect(state.advanced.rawCss).toContain('animation:');
    expect(state.advanced.rawCss).toContain('cms-breathe');
  });

  it('a value condition with a non-"none" else branch falls through to Advanced CSS', () => {
    const css =
      "ha-card {\n  animation: {{ 'cms-pulse 2s ease-in-out infinite' if states('sensor.power') | float(0) > 1500 else 'cms-breathe 3s ease-in-out infinite' }};\n}";
    const parsed = parseCardModConfig({ type: 'sensor', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.animation.enabled).toBe(false);
    expect(state.advanced.rawCss).toContain('animation:');
  });

  it('an unknown animation name in the value form falls through to Advanced CSS', () => {
    const css =
      "ha-card {\n  animation: {{ 'myspin 2s linear infinite' if states('sensor.power') | float(0) > 0 else 'none' }};\n}";
    const parsed = parseCardModConfig({ type: 'sensor', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.animation.enabled).toBe(false);
    expect(state.advanced.rawCss).toContain('myspin');
  });
});

describe('mapToStudioState — animation pack presets', () => {
  it('recognises the new presets in the unconditional form', () => {
    for (const [preset, timing] of [
      ['shake', 'ease-in-out'],
      ['spin', 'linear'],
      ['glow', 'ease-in-out'],
      ['heartbeat', 'ease-in-out'],
    ] as const) {
      const css = `ha-card {\n  animation: cms-${preset} 2s ${timing} infinite;\n}`;
      const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
      const state = mapToStudioState(parsed);
      expect(state.animation.enabled).toBe(true);
      expect(state.animation.preset).toBe(preset);
      expect(state.animation.trigger).toBe('always');
      expect(state.advanced.rawCss).toBe('');
    }
  });

  it('does NOT pass through the new presets\' own @keyframes cms-* blocks', () => {
    const css =
      '@keyframes cms-shake {\n  0%, 100% { transform: translateX(0); }\n  25% { transform: translateX(-4px); }\n  75% { transform: translateX(4px); }\n}\n\n' +
      'ha-card {\n  animation: cms-shake 1s ease-in-out infinite;\n}';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.animation.enabled).toBe(true);
    expect(state.animation.preset).toBe('shake');
    expect(state.advanced.rawCss).toBe('');
  });

  it('a timing that does not match the preset\'s own falls through to Advanced CSS', () => {
    // The generator always emits linear for spin — a hand-edited ease-in-out
    // spin is not reproducible by the module and must be preserved verbatim.
    const css = 'ha-card {\n  animation: cms-spin 2s ease-in-out infinite;\n}';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.animation.enabled).toBe(false);
    expect(state.advanced.rawCss).toContain('cms-spin 2s ease-in-out infinite');
  });
});

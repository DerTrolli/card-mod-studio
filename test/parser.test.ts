/**
 * Unit tests for the Phase 2 parser pipeline:
 *   css-parser → yaml-parser → state-mapper
 */

import { describe, it, expect } from 'vitest';
import { parseCss } from '../src/parser/css-parser.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';
import { mapToStudioState, parseEntityRowCss } from '../src/parser/state-mapper.js';
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

  it('detects transition duration in milliseconds', () => {
    const css = 'ha-card { transition: filter 500ms ease; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.filter.transitionMs).toBe(500);
  });

  it('detects transition duration in seconds', () => {
    const css = 'ha-card { transition: filter 0.3s ease; }';
    const parsed = parseCardModConfig({ type: 'button', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.filter.transitionMs).toBe(300);
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
    const css = `.title p {\n  font-size: 24px;\n  color: #e1e1e1;\n  text-align: left;\n  font-weight: bold;\n}`;
    const parsed = parseCardModConfig({ type: 'heading', card_mod: { style: css } });
    const state = mapToStudioState(parsed);
    expect(state.headingStyle.enabled).toBe(true);
    expect(state.advanced.rawCss).toContain('font-weight');
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

/**
 * Template extraction is quote-aware: a `}}` (or `%}`) inside a quoted literal
 * does not end the template. Every template without that shape is cut exactly
 * where the old non-greedy regex cut it.
 */
import { describe, it, expect } from 'vitest';
import { extractJinja, parseCss } from '../src/parser/css-parser.js';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { endOfTag } from '../src/utils/jinja-str.js';
import { lintAdvancedCss } from '../src/utils/css-lint.js';
import type { StudioState } from '../src/types/index.js';

/** The extraction as it was before the change (copy of the old regex). */
function oldExtract(css: string): { cleaned: string; map: Map<string, string> } {
  const map = new Map<string, string>();
  let index = 0;
  const cleaned = css.replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g, (match) => {
    const prefix = match[1] === '{' ? '__CMS_J' : match[1] === '%' ? '__CMS_S' : '__CMS_C';
    const key = `${prefix}${index}__`;
    map.set(key, match);
    index++;
    return key;
  });
  return { cleaned, map };
}

// Harvested from the existing tests (`grep -rhoE "\{\{[^}]*\}\}" test/ | sort -u | head -80`).
const HARVESTED = [
  "{{  'grayscale(100%)'  if  is_state( config.entity , 'off' )  else  'none'  }}",
  "{{ '#00ff00' if is_state('binary_sensor.preheat_active', 'on') else '#888888' }}",
  "{{ '#00ff00' if states('sensor.other') | float(0) >= 5 else '#000000' }}",
  "{{ '#03a9f4' if is_state('binary_sensor.preheat_active', 'on') else 'none' }}",
  "{{ '#2196F3' if is_state(config.entity, 'on') else '#6b6b6b' }}",
  "{{ '#2196F3' if states('sensor.temp') | float(0) >= 85 else ('#4caf50' if states('sensor.temp') | float(0) >= 72 else '#888888') }}",
  "{{ '#9e9e9e' if states('sensor.power') | float(0) <= 0 else '#f44336' }}",
  "{{ '#ee1111' if is_state('light.kitchen', 'on') else '#222222' }}",
  "{{ '#ee1111' if is_state(config.entity, 'on') else 'inherit' }}",
  "{{ '#f00' if states('sensor.t')|float > 30 else '#0f0' }}",
  "{{ '#f44336' if states('sensor.power') | float(0) > 0 else '#888888' }}",
  "{{ '#f44336' if states('sensor.x') | float(0) > 0 else '#888888' }}",
  "{{ '#ff0000' if is_state(config.entity, 'on') else '#444444' }}",
  "{{ '#ff0000' if is_state(config.entity, 'on') else 'inherit' }}",
  "{{ '#ff0000' if state_attr('climate.x', 'current_temperature') | float(0) >= 25 else '#888888' }}",
  "{{ '#ff0000' if states('light.x') | float(0) >= 85 else '#888888' }}",
  "{{ '#ff0000' if states('sensor.freezer') | float(0) >= -5 else ('#2196f3' if states('sensor.freezer') | float(0) >= -25 else '#888888') }}",
  "{{ '#ff0000' if states('sensor.t') | float(0) >= 30 else '#888888' }}",
  "{{ '#ff0000' if states('sensor.temp') | float(0) >= 30 else '#888888' }}",
  "{{ '#ff0000' if states('sensor.x') | float(0) >= 80 else ('var(--warning-color)' if states('sensor.x') | float(0) >= 40 else 'rgb(1, 2, 3)') }}",
  "{{ '#ff0000' if states('sensor.x') | float(0) >= 85 else ('#ffa500' if states('sensor.x') | float(0) >= 72 else '#4caf50') }}",
  "{{ '#ff0000' if states('x') | float(0) >= 85 else '#4caf50' }}",
  "{{ '#ffee00' if is_state('switch.x', 'on') else 'none' }}",
  "{{ '#ffee00' if is_state(config.entity, 'off') else '' }}",
  "{{ '#ffee00' if is_state(config.entity, 'off') else 'none' }}",
  "{{ '#ffee00' if is_state(config.entity, 'on') else '' }}",
  "{{ '#ffee00' if is_state(config.entity, 'on') else 'inherit' }}",
  "{{ '#ffee00' if is_state(config.entity, 'on') else 'none' }}",
  "{{ '#ffeecc' if is_state(config.entity, 'on') else '' }}",
  "{{ '#ffeecc' if is_state(config.entity, 'on') else 'none' }}",
  "{{ '0px' if is_state(config.entity, 'on') else '24px' }}",
  "{{ '1' if is_state(config.entity, 'off') else '' }}",
  "{{ '1' if is_state(config.entity, 'on') else '' }}",
  "{{ '20px' if is_state(config.entity, 'on') else '14px' }}",
  "{{ '238, 17, 17' if is_state('light.kitchen', 'on') else '34, 34, 34' }}",
  "{{ '2px solid red' if is_state('switch.x', 'on') else '' }}",
  "{{ '2px solid red' if is_state('switch.x', 'on') else '1px solid red' }}",
  "{{ '2px solid red' if is_state(config.entity, 'on') else 'none' }}",
  "{{ '30px' if is_state('switch.x', 'on') else '24px' }}",
  "{{ '36px' if is_state(config.entity, 'on') else '24px' }}",
  "{{ '3px solid #ff0000' if is_state(config.entity, 'on') else '' }}",
  "{{ '3px solid red' if is_state(config.entity, 'on') else '1px solid blue' }}",
  "{{ '3px' if is_state(config.entity, 'on') else '1px' }}",
  "{{ '40px' if is_state('light.x', 'on') else '24px' }}",
  "{{ '40px' if is_state(config.entity, 'on') else '20px' }}",
  "{{ '40px' if is_state(config.entity, 'on') else '30px' }}",
  "{{ '40px' if states('sensor.temp') | float(0) > 30 else '24px' }}",
  "{{ '45px' if is_state('switch.x', 'on') else '36px' }}",
  "{{ '48px' if is_state(config.entity, 'on') else '30px' }}",
  "{{ '4px solid #03a9f4' if state_attr('sensor.temp', 'battery_level') | float(0) < 15 else '1px solid #03a9f4' }}",
  "{{ '4px solid #ff0000' if is_state(config.entity, 'on') else '' }}",
  "{{ '4px solid #ff0000' if is_state(config.entity, 'on') else 'none' }}",
  "{{ '4px' if is_state(config.entity, 'on') else '0px' }}",
  "{{ '4px' if is_state(config.entity, 'on') else 'inherit' }}",
  "{{ '60px' if is_state('light.x', 'on') else '36px' }}",
  "{{ '60px' if is_state(config.entity, 'on') else '30px' }}",
  "{{ 'a' if is_state('it\\'s', 'off') else 'b' }}",
  "{{ 'blur(4px) opacity(50%)' if is_state('binary_sensor.preheat_active', 'on') else 'none' }}",
  "{{ 'blur(5px)' if is_state(config.entity, 'on') else 'none' }}",
  "{{ 'brightness(80%)' if state_attr('sensor.x', 'a') | float(0) > 3 else 'none' }}",
  "{{ 'cms-blink 1s ease-in-out infinite' if states('sensor.freezer') | float(0) > -12.5 else 'none' }}",
  "{{ 'cms-pulse 2s ease-in-out infinite' if is_state('binary_sensor.doorbell', 'on') else 'none' }}",
  "{{ 'cms-pulse 2s ease-in-out infinite' if is_state('switch.x', 'on') else 'none' }}",
  "{{ 'cms-pulse 2s ease-in-out infinite' if is_state(config.entity, 'on') else 'none' }}",
  "{{ 'cms-pulse 2s ease-in-out infinite' if state_attr('sensor.x', 'a') | float(0) > 3 else 'none' }}",
  "{{ 'cms-pulse 2s ease-in-out infinite' if states('sensor.a\\nb') | float(0) > 3 else 'none' }}",
  "{{ 'cms-pulse 2s ease-in-out infinite' if states('sensor.power') | float(0) > 1500 else 'cms-breathe 3s ease-in-out infinite' }}",
  "{{ 'cms-pulse 2s ease-in-out infinite' if states('sensor.power') | float(0) > 1500 else 'none' }}",
  "{{ 'cms-pulse 2s ease-in-out infinite' if states('sensor.power') | float(0) > 1500 else ('cms-breathe 3s ease-in-out infinite' if states('sensor.power') | float(0) > 500 else 'none') }}",
  "{{ 'cms-shake 1s ease-in-out infinite' if state_attr('climate.thermostat', 'current_temperature') | float(0) >= 25 else 'none' }}",
  "{{ 'grayscale(100%) brightness(70%)' if is_state(config.entity, 'off') else 'brightness(70%)' }}",
  "{{ 'grayscale(100%) brightness(80%)' if is_state(config.entity, 'off') else 'none' }}",
  "{{ 'grayscale(100%) brightness(85%)' if is_state(config.entity, 'off') else 'brightness(85%)' }}",
  "{{ 'grayscale(100%) opacity(70%)' if is_state(config.entity, 'off') else 'opacity(70%)' }}",
  "{{ 'grayscale(100%)' if is_state('switch.other', 'off') else 'none' }}",
  "{{ 'grayscale(100%)' if is_state('switch.x', 'on') else 'none' }}",
  "{{ 'grayscale(100%)' if is_state(config.entity, 'off') else 'none' }}",
  "{{ 'grayscale(100%)' if is_state(config.entity, 'off') else 'saturate(200%)' }}",
  "{{ 'grayscale(100%)' if is_state(config.entity, 'on') else 'none' }}",
  "{{ 'ha-card' }}",
];

describe('template extraction: unchanged for every template without }} inside a quote', () => {
  it('has the harvested list', () => {
    expect(HARVESTED.length).toBeGreaterThanOrEqual(40);
  });

  it.each(HARVESTED.map((t, i) => [i, t] as const))('template %i cuts exactly as before', (_i, t) => {
    for (const css of [
      `ha-card {\n  color: ${t};\n}`,
      `ha-card {\n  color: ${t} !important;\n  opacity: ${t};\n}\n\nha-icon {\n  filter: ${t};\n}`,
      `{# note #}\nha-card {\n  color: ${t};\n}\n{% if a %}\n${t}\n{% endif %}`,
    ]) {
      const a = oldExtract(css);
      const b = extractJinja(css);
      expect(b.cleaned).toBe(a.cleaned);
      expect([...b.map]).toEqual([...a.map]);
    }
  });

  it('all templates at once, in one text', () => {
    const css = HARVESTED.map((t, i) => `.r${i} {\n  x: ${t};\n}`).join('\n');
    const a = oldExtract(css);
    const b = extractJinja(css);
    expect(b.cleaned).toBe(a.cleaned);
    expect([...b.map]).toEqual([...a.map]);
  });

  it('statements, comments and multi-line templates cut as before', () => {
    for (const css of [
      '{% set a = 1 %}\nha-card {\n  x: {{ a }};\n}',
      'ha-card {\n  x: {{\n    1 +\n    2\n  }};\n}\n{# a comment with an apostrophe: it\'s #}',
      'ha-card { x: {{{ a }}}; }',
      'ha-card { x: {{ {\'a\': {\'b\': 1}} }}; }',
      'ha-card { x: {{ a ; y: {{ b }}; }',
      'ha-card { x: {{%; y: {% b %}; }',
    ]) {
      const a = oldExtract(css);
      const b = extractJinja(css);
      expect(b.cleaned).toBe(a.cleaned);
      expect([...b.map]).toEqual([...a.map]);
    }
  });
});

describe('a }} inside a quoted literal does not end the template', () => {
  const cut = (css: string) => [...extractJinja(css).map.values()];

  it("single quotes: 'a}}b'", () => {
    const t = "{{ 'a}}b' if is_state('switch.x', 'on') else 'blue' }}";
    expect(cut(`ha-card {\n  --accent-color: ${t};\n}`)).toEqual([t]);
  });
  it('double quotes: "a}}b"', () => {
    const t = '{{ "a}}b" if is_state("switch.x", "on") else "blue" }}';
    expect(cut(`ha-card {\n  --accent-color: ${t};\n}`)).toEqual([t]);
  });
  it("an escaped quote does not close the literal: 'a\\'}}b'", () => {
    const t = "{{ 'a\\'}}b' if is_state('switch.x', 'on') else 'blue' }}";
    expect(cut(`ha-card {\n  --accent-color: ${t};\n}`)).toEqual([t]);
  });
  it('a literal holding {{ is part of the template', () => {
    const t = "{{ 'a{{b' if is_state('switch.x', 'on') else 'blue' }}";
    expect(cut(`ha-card {\n  --accent-color: ${t};\n}\n\nha-icon {\n  color: {{ 'x' }};\n}`)).toEqual([t, "{{ 'x' }}"]);
  });
  it('a literal holding %} does not end a statement', () => {
    const t = "{% if states('a') == '%}' %}";
    expect(cut(`${t}\nha-card {\n  opacity: 1;\n}\n{% endif %}`)).toEqual([t, '{% endif %}']);
  });
  it('a comment is not quote-aware', () => {
    expect(cut("{# it's #}\nha-card { x: {{ 'a' }}; }")).toEqual(["{# it's #}", "{{ 'a' }}"]);
  });

  it('an unterminated quote falls back to the first }} and loses no text', () => {
    const css = "ha-card {\n  color: {{ 'oops if x }};\n  opacity: 1;\n}";
    const { cleaned, map } = extractJinja(css);
    expect([...map.values()]).toEqual(["{{ 'oops if x }}"]);
    let back = cleaned;
    for (const [k, v] of map) back = back.split(k).join(v);
    expect(back).toBe(css);
    expect(extractJinja(css).cleaned).toBe(oldExtract(css).cleaned);
  });
  it('an unterminated quote in the middle of a long text still returns it all on save', () => {
    const css = "ha-card {\n  color: {{ 'oops if x }};\n  opacity: 1;\n}\n\nha-icon {\n  filter: none;\n}";
    const state = mapToStudioState(parseStyleValue(css), 'tile');
    expect(generateCss(state, 'tile')).toBe(css);
  });
  it('an unclosed template is left as text', () => {
    const css = "ha-card {\n  color: {{ 'a }\n}";
    expect(extractJinja(css).map.size).toBe(0);
    expect(extractJinja(css).cleaned).toBe(css);
  });
});

describe('a value containing }} survives a reopen', () => {
  const E = mapToStudioState(parseStyleValue(''));
  const gen = (p: Partial<StudioState>) => generateCss({ ...E, ...p } as StudioState, 'tile');

  it('an accent colour a}}b is read back, not cut at the first }}', () => {
    const css = gen({ accentColor: { ...E.accentColor, enabled: true, mode: 'conditional', entityId: 'switch.x', colorOn: 'a}}b', colorOff: 'blue' } });
    expect(css).toContain("{{ 'a}}b' if is_state('switch.x', 'on') else 'blue' }}");
    const back = mapToStudioState(parseStyleValue(css), 'tile');
    expect(back.accentColor).toMatchObject({ enabled: true, colorOn: 'a}}b', colorOff: 'blue' });
    expect(back.advanced.rawCss).toBe('');
    expect(generateCss(back, 'tile')).toBe(css);
  });

  it('hand-written Advanced CSS with such a template comes back untouched', () => {
    const css = "ha-card {\n  content: {{ \"x}}y\" }};\n  opacity: 0.5;\n}";
    expect(parseCss(css)[0].properties.map((p) => p.value)).toEqual(['{{ "x}}y" }}', '0.5']);
    const back = mapToStudioState(parseStyleValue(css), 'tile');
    expect(generateCss(back, 'tile')).toBe(css);
  });
});

describe('the shared scanner keeps css-lint behaviour', () => {
  it('endOfTag counts inner braces by default, not when told not to', () => {
    const s = "{{ {'a': {'b': 1}} }}";
    expect(endOfTag(s, 2, '}}')).toBe(s.length);
    expect(endOfTag(s, 2, '}}', false)).toBe(s.indexOf('}}') + 2);
    expect(endOfTag("{% if 'a%}' %}", 2, '%}')).toBe(14);
    expect(endOfTag("{{ 'a", 2, '}}')).toBe(-1);
  });
  it('the linter still reads a quoted }} as part of the template', () => {
    expect(lintAdvancedCss("ha-card {\n  --a: {{ 'a}}b' }};\n}")).toBeUndefined();
    expect(lintAdvancedCss("ha-card {\n  --a: {{ 'a }};\n}")?.message).toMatch(/Unterminated/);
  });
});

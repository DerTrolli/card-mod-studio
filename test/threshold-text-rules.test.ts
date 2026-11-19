/**
 * Threshold text rules (v1.0.0-beta.2, issue #41): `is` / `is-not` compare
 * the state (or an attribute) as text. Written, read back, ordered before the
 * number rules, kept in stored presets, and the same in the entities rows.
 */
import { describe, it, expect } from 'vitest';
import { generateCss, sortThresholdRules, buildThresholdJinja } from '../src/generator/css-generator.js';
import { mapToStudioState, migrateStudioState, parseEntityRowCss, parseThresholdJinja } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { generateEntityRowCss } from '../src/editor/studio-state.js';
import { withOperator, rawRuleValue, normalizeRule } from '../src/utils/threshold-rules.js';
import type { StudioState, ThresholdRule, HomeAssistant } from '../src/types/index.js';

const E = mapToStudioState(parseStyleValue(''));
const load = (css: string, card = 'tile') => mapToStudioState(parseStyleValue(css), card);
const save = (s: StudioState, card = 'tile') => generateCss(s, card);
const r = (operator: ThresholdRule['operator'], value: number | string, color: string, id = Math.random().toString(36).slice(2)): ThresholdRule =>
  ({ id, operator, value, color });
const thr = (rules: ThresholdRule[], extra: Partial<StudioState['threshold']> = {}) =>
  ({ ...E, threshold: { ...E.threshold, enabled: true, entityId: 'climate.hall', properties: ['icon-color'], rules, defaultColor: 'grey', ...extra } }) as StudioState;
const strip = (rules: ThresholdRule[]) => rules.map(({ operator, value, color }) => ({ operator, value, color }));

describe('writing', () => {
  it('a text rule compares the state as text, no float()', () => {
    const css = save(thr([r('is', 'heating', 'orange'), r('is-not', 'off', 'blue')]));
    expect(css).toContain("{{ 'orange' if states('climate.hall') == 'heating' else ('blue' if states('climate.hall') != 'off' else 'grey') }}");
    expect(css).not.toContain('float(0)');
  });

  it('an attribute compares by its text (| string)', () => {
    const css = save(thr([r('is', 'heating', 'orange')], { attribute: 'hvac_action' }));
    expect(css).toContain("'orange' if state_attr('climate.hall', 'hvac_action') | string == 'heating' else 'grey'");
  });

  it('quotes and backslashes in the text are escaped', () => {
    const css = save(thr([r('is', "it's \\ on", 'red')]));
    expect(css).toContain(String.raw`== 'it\'s \\ on'`);
    expect(load(css).threshold.rules[0].value).toBe("it's \\ on");
  });

  it('text rules come first, in their order; number rules keep their own sort', () => {
    const rules = [r('<', 5, 'red'), r('is', 'unavailable', 'black'), r('<', 20, 'yellow'), r('is', 'unknown', 'purple')];
    expect(strip(sortThresholdRules(rules))).toEqual([
      { operator: 'is', value: 'unavailable', color: 'black' },
      { operator: 'is', value: 'unknown', color: 'purple' },
      { operator: '<', value: 5, color: 'red' },
      { operator: '<', value: 20, color: 'yellow' },
    ]);
  });

  it('number-only rules are written exactly as before', () => {
    const rules = [r('>', 20, 'red'), r('>', 30, 'darkred')];
    expect(buildThresholdJinja(rules, 'grey', 'sensor.t')).toBe(
      "{{ 'darkred' if states('sensor.t') | float(0) > 30 else ('red' if states('sensor.t') | float(0) > 20 else 'grey') }}",
    );
  });
});

describe('reading back', () => {
  const CASES: [string, ThresholdRule[], Partial<StudioState['threshold']>?][] = [
    ['one text rule', [r('is', 'heating', 'orange')]],
    ['is not', [r('is-not', 'docked', 'red')]],
    ['several text rules', [r('is', 'cleaning', 'green'), r('is', 'error', 'red'), r('is', 'returning', 'blue')]],
    ['mixed with number rules', [r('is', 'unavailable', 'black'), r('>', 30, 'red'), r('>', 20, 'orange')]],
    ['an attribute', [r('is', 'heating', 'orange'), r('is', 'cooling', 'blue')], { attribute: 'hvac_action' }],
    ['text with spaces and an apostrophe', [r('is', "Bob's room", '#ff0000')]],
    ['several properties', [r('is', 'heating', 'orange')], { properties: ['icon-color', 'background', 'border-color'] }],
  ];
  it.each(CASES)('%s: opens with the same rules, nothing in Advanced CSS, and saves the same', (_n, rules, extra) => {
    const state = thr(rules, extra);
    const css = save(state);
    const back = load(css);
    expect(back.threshold.enabled).toBe(true);
    expect(strip(back.threshold.rules)).toEqual(strip(sortThresholdRules(rules)));
    expect(back.threshold.attribute ?? '').toBe(extra?.attribute ?? '');
    expect(back.advanced.rawCss).toBe('');
    expect(save(back)).toBe(css);
  });

  it('a hand-written chain in the same spelling is read into Threshold', () => {
    const css = "ha-state-icon {\n  color: {{ 'orange' if states('climate.hall') == 'heating' else 'grey' }} !important;\n}";
    const s = load(css);
    expect(s.threshold.enabled).toBe(true);
    expect(strip(s.threshold.rules)).toEqual([{ operator: 'is', value: 'heating', color: 'orange' }]);
    expect(save(s)).toBe(css);
  });

  it('another spelling (is_state, double quotes, extra logic) stays hand-written', () => {
    for (const v of [
      "{{ 'orange' if is_state('climate.hall', 'heating') else 'grey' }}",
      `{{ 'orange' if states('climate.hall') == "heating" else 'grey' }}`,
      "{{ 'orange' if states('climate.hall') == 'heating' and is_state('x.y', 'on') else 'grey' }}",
      "{{ 'orange' if states('climate.hall') | lower == 'heating' else 'grey' }}",
    ]) {
      expect(parseThresholdJinja(v)).toBeNull();
      const css = `ha-state-icon {\n  color: ${v} !important;\n}`;
      expect(save(load(css))).toBe(css);
    }
  });

  it('a hand-written order the Studio would re-sort (number rule before a text rule) stays hand-written', () => {
    const v = "{{ 'red' if states('sensor.t') | float(0) < 5 else ('black' if states('sensor.t') == 'unavailable' else 'grey') }}";
    expect(parseThresholdJinja(v)).toBeNull();
  });
});

describe('stored presets and pasted styles', () => {
  it('a text rule keeps its text; a number on a text rule becomes the number rule == / !=', () => {
    const s = migrateStudioState({ threshold: { enabled: true, entityId: 'x.y', properties: ['icon-color'], rules: [
      { id: 'a', operator: 'is', value: 'heating', color: 'red' },
      { id: 'b', operator: 'is-not', value: 7, color: 'blue' },
      { id: 'c', operator: '>', value: '12.5', color: 'green' },
    ] } } as unknown as StudioState);
    expect(strip(s.threshold.rules)).toEqual([
      { operator: 'is', value: 'heating', color: 'red' },
      { operator: '!=', value: 7, color: 'blue' },
      { operator: '>', value: 12.5, color: 'green' },
    ]);
  });

  it('a text rule without text, an unknown operator or a non-number number rule is dropped', () => {
    const s = migrateStudioState({ threshold: { enabled: true, entityId: 'x.y', properties: ['icon-color'], rules: [
      { id: 'a', operator: 'is', value: '', color: 'red' },
      { id: 'b', operator: 'contains', value: 'x', color: 'red' },
      { id: 'c', operator: '>', value: 'heating', color: 'red' },
      { id: 'd', operator: 'is', value: 'x'.repeat(256), color: 'red' },
    ] } } as unknown as StudioState);
    expect(s.threshold.rules).toEqual([]);
  });
});

describe('entities card rows', () => {
  it('a row text rule is written for the row entity and read back', () => {
    const style = { iconColor: '', textColor: '', iconMode: 'threshold' as const, iconRules: [r('is', 'heating', 'orange'), r('>', 25, 'red')], iconDefault: '#888888' };
    const css = generateEntityRowCss(style, 'climate.hall');
    expect(css).toContain("states('climate.hall') == 'heating'");
    const back = parseEntityRowCss(css, 'climate.hall');
    expect(back.iconMode).toBe('threshold');
    expect(strip(back.iconRules ?? [])).toEqual(strip(sortThresholdRules(style.iconRules)));
    expect(back.extraCss).toBeUndefined();
  });
});

describe('editing helpers', () => {
  it('switching the operator converts the value', () => {
    expect(withOperator(r('<', 5, 'red', 'a'), 'is')).toMatchObject({ operator: 'is', value: '' });
    expect(withOperator(r('is', '12', 'red', 'a'), '>')).toMatchObject({ operator: '>', value: 12 });
    expect(withOperator(r('is', 'heating', 'red', 'a'), '>')).toMatchObject({ operator: '>', value: 0 });
    expect(withOperator(r('is', 'heating', 'red', 'a'), 'is-not')).toMatchObject({ operator: 'is-not', value: 'heating' });
  });

  it('a number typed into a text rule makes it the number rule (safe for older versions)', () => {
    expect(normalizeRule(r('is', ' 12 ', 'red', 'a'))).toMatchObject({ operator: '==', value: 12 });
    expect(normalizeRule(r('is-not', '-3.5', 'red', 'a'))).toMatchObject({ operator: '!=', value: -3.5 });
    expect(normalizeRule(r('is', '12a', 'red', 'a'))).toMatchObject({ operator: 'is', value: '12a' });
    const rule = r('>', 3, 'red', 'a');
    expect(normalizeRule(rule)).toBe(rule);
  });

  it('the current raw value: the state, or the attribute as Jinja writes it as text', () => {
    const hass = { states: { 'climate.hall': { state: 'heat', attributes: { hvac_action: 'heating', aux: true, list: [1] } } } } as unknown as HomeAssistant;
    expect(rawRuleValue(hass, 'climate.hall')).toBe('heat');
    expect(rawRuleValue(hass, 'climate.hall', 'hvac_action')).toBe('heating');
    expect(rawRuleValue(hass, 'climate.hall', 'aux')).toBe('True');
    expect(rawRuleValue(hass, 'climate.hall', 'list')).toBeNull();
    expect(rawRuleValue(hass, 'climate.none')).toBeNull();
  });
});

describe('custom cards', () => {
  it.each([['custom:mushroom-entity-card', ['accent-color', 'icon-color']], ['custom:mushroom-template-card', ['accent-color']]] as const)(
    '%s: a text rule on the accent round-trips',
    (card, properties) => {
      const state = { ...thr([r('is', 'heating', '#ff9800'), r('is', 'idle', '#9e9e9e')]), threshold: { ...thr([]).threshold, rules: [r('is', 'heating', '#ff9800'), r('is', 'idle', '#9e9e9e')], properties: [...properties] } } as StudioState;
      const config = { type: card, entity: 'climate.hall' };
      const css = generateCss(state, card, { config });
      expect(css).toContain("== 'heating'");
      const back = mapToStudioState(parseStyleValue(css), card, config);
      expect(back.threshold.enabled).toBe(true);
      expect(strip(back.threshold.rules)).toEqual(strip(state.threshold.rules));
      expect(back.advanced.rawCss).toBe('');
      expect(generateCss(back, card, { config })).toBe(css);
    },
  );
});

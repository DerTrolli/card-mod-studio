/**
 * "A value matches" with text (v1.0.0, issue #42): the Animation trigger, the
 * Visual Filters effects, Border width and Icon size conditions compare a
 * number or (new) a text; Background and grayscale get "a value matches"
 * (number or text). Stored in fields older versions ignore.
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState, migrateStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import type { StudioState, StyleCondition } from '../src/types/index.js';

const E = mapToStudioState(parseStyleValue(''));
const load = (css: string, card = 'tile', config?: Record<string, unknown>) => mapToStudioState(parseStyleValue(css), card, config);
const save = (s: StudioState, card = 'tile', config?: Record<string, unknown>) => generateCss(s, card, config ? { config } : undefined);
const st = (part: Partial<StudioState>) => ({ ...E, ...part }) as StudioState;

const TEXT: StyleCondition = { when: 'value', valueEntity: 'climate.hall', valueText: 'heating', valueTextOperator: 'is' };
const TEXT_NOT: StyleCondition = { when: 'value', valueEntity: 'vacuum.robo', valueText: 'docked', valueTextOperator: 'is-not' };
const TEXT_ATTR: StyleCondition = { when: 'value', valueEntity: 'climate.hall', valueAttribute: 'hvac_action', valueText: 'heating', valueTextOperator: 'is' };
const NUM: StyleCondition = { when: 'value', valueEntity: 'sensor.t', valueOperator: '>', valueThreshold: 25 };
const QUOTE: StyleCondition = { when: 'value', valueEntity: 'input_select.mode', valueText: "Bob's \\ room", valueTextOperator: 'is' };
const flat = ({ when: _w, ...rest }: StyleCondition) => rest;

const CASES: [string, (c: StyleCondition) => Partial<StudioState>, (s: StudioState) => unknown, string?, Record<string, unknown>?][] = [
  ['Animation trigger', (c) => ({ animation: { ...E.animation, enabled: true, trigger: 'value', ...flat(c) } }),
    (s) => {
      if (s.animation.trigger !== 'value') return null;
      const { valueEntity, valueAttribute, valueOperator, valueThreshold, valueText, valueTextOperator } = s.animation;
      return Object.fromEntries(Object.entries({ valueEntity, valueAttribute, valueOperator, valueThreshold, valueText, valueTextOperator }).filter(([, v]) => v !== undefined));
    }],
  ['Visual Filters effects', (c) => ({ filter: { ...E.filter, enabled: true, brightness: 60, effectsWhen: c } }), (s) => s.filter.effectsWhen],
  ['grayscale', (c) => ({ filter: { ...E.filter, enabled: true, grayscale: true, grayscaleCondition: c } }), (s) => s.filter.grayscaleCondition],
  ['grayscale with brightness', (c) => ({ filter: { ...E.filter, enabled: true, grayscale: true, brightness: 70, grayscaleCondition: c } }), (s) => s.filter.grayscaleCondition],
  ['Background', (c) => ({ background: { ...E.background, enabled: true, color1: 'var(--red-color)', condition: c } }), (s) => s.background.condition],
  ['Background gradient', (c) => ({ background: { ...E.background, enabled: true, type: 'gradient', color1: '#ff0000', color2: '#0000ff', angle: 90, condition: c } }), (s) => s.background.condition],
  ['Border width', (c) => ({ border: { ...E.border, enabled: true, borderWidth: 3, borderColor: 'red', widthWhen: c } }), (s) => s.border.widthWhen],
  ['Icon size', (c) => ({ iconColor: { ...E.iconColor, enabled: true, mode: 'none', sizePx: 40, sizeWhen: c } }), (s) => s.iconColor.sizeWhen],
  ['Background on a text-only markdown card', (c) => ({ background: { ...E.background, enabled: true, color1: 'red', condition: c } }), (s) => s.background.condition, 'markdown', { type: 'markdown', content: 'hi' }],
];

describe.each(CASES)('%s', (_name, part, read, card = 'tile', config) => {
  it.each([['is', TEXT], ['is not', TEXT_NOT], ['an attribute', TEXT_ATTR], ['a number', NUM], ['quotes and a backslash', QUOTE]])(
    '%s: written once, read back the same, nothing in Advanced CSS',
    (_k, c) => {
      const css = save(st(part(c)), card, config);
      if (c.valueText !== undefined) {
        const cmp = c.valueAttribute ? `state_attr('${c.valueEntity}', '${c.valueAttribute}') | string ${c.valueTextOperator === 'is' ? '==' : '!='} ` : `states('${c.valueEntity}') ${c.valueTextOperator === 'is' ? '==' : '!='} `;
        expect(css).toContain(cmp);
        expect(css).not.toContain('float(0)');
      } else {
        expect(css).toContain(`states('sensor.t') | float(0) > 25`);
      }
      const back = load(css, card, config);
      const want = c.when === 'value' && _name === 'Animation trigger' ? flat(c) : c;
      expect(read(back)).toEqual(want);
      expect(back.advanced.rawCss).toBe('');
      expect(save(back, card, config)).toBe(css);
    },
  );

  it('an incomplete condition (no text yet, no entity) writes the unconditional form', () => {
    for (const c of [{ ...TEXT, valueText: '' }, { ...TEXT, valueEntity: '' }] as StyleCondition[]) {
      const css = save(st(part(c)), card, config);
      expect(css).not.toContain('{{');
    }
  });
});

describe('Background "a value matches" next to Threshold Colors', () => {
  it('the card’s own look in the other branch → Background; a colour there → a one-rule Threshold', () => {
    const bg = save(st({ background: { ...E.background, enabled: true, color1: 'red', condition: TEXT } }));
    expect(bg).toContain("background: {{ 'red' if states('climate.hall') == 'heating' else '' }};");
    const a = load(bg);
    expect(a.background.condition).toEqual(TEXT);
    expect(a.threshold.enabled).toBe(false);

    const thr = save(st({ threshold: { ...E.threshold, enabled: true, entityId: 'climate.hall', properties: ['background'], rules: [{ id: 'a', operator: 'is', value: 'heating', color: 'red' }], defaultColor: 'grey' } }));
    const b = load(thr);
    expect(b.threshold.enabled).toBe(true);
    expect(b.background.enabled).toBe(false);
  });

  it.each(['custom:mushroom-chips-card', 'custom:mushroom-template-card', 'custom:bubble-card'])('%s: through its background variables', (card) => {
    const config = { type: card, entity: 'climate.hall', ...(card.includes('bubble') ? { card_type: 'button' } : {}) };
    const state = st({ background: { ...E.background, enabled: true, color1: '#ff0000', condition: TEXT } });
    const css = save(state, card, config);
    if (!css.includes('{{')) return; // the profile writes no background here
    const back = load(css, card, config);
    expect(back.background.condition).toEqual(TEXT);
    expect(back.threshold.enabled).toBe(false);
    expect(save(back, card, config)).toBe(css);
  });
});

describe('older versions', () => {
  it('a text condition leaves the number fields unset; Background / grayscale keep applyWhen / grayscaleWhen "always"', () => {
    const css = save(st({
      background: { ...E.background, enabled: true, color1: 'red', condition: TEXT },
      filter: { ...E.filter, enabled: true, grayscale: true, grayscaleCondition: TEXT_NOT },
      animation: { ...E.animation, enabled: true, trigger: 'value', ...flat(TEXT) },
    }));
    const s = load(css);
    expect(s.background.applyWhen).toBe('always');
    expect(s.filter.grayscaleWhen).toBe('always');
    expect(s.animation.valueOperator).toBeUndefined();
    expect(s.animation.valueThreshold).toBeUndefined();
  });
});

describe('stored presets and pasted styles', () => {
  it('text fields are kept and checked; a number as text becomes == / !=; a bad condition goes', () => {
    const s = migrateStudioState({
      animation: { enabled: true, trigger: 'value', valueEntity: 'climate.hall', valueText: 'heating', valueTextOperator: 'bogus', valueOperator: '>', valueThreshold: 3 },
      filter: { enabled: true, grayscale: true, grayscaleCondition: { when: 'on' }, effectsWhen: { when: 'value', valueEntity: 's.x', valueText: '12', valueTextOperator: 'is-not' } },
      background: { enabled: true, color1: 'red', condition: { when: 'value', valueEntity: 's.x', valueText: 7 } },
      border: { enabled: true, borderWidth: 2, widthWhen: { when: 'value', valueEntity: 's.x', valueText: 'x'.repeat(300), valueOperator: '<', valueThreshold: 1 } },
      iconColor: { enabled: true, sizeWhen: { when: 'nope' } },
    } as unknown as StudioState);
    expect(s.animation).toMatchObject({ valueText: 'heating', valueTextOperator: 'is' });
    expect(s.animation.valueOperator).toBeUndefined();
    expect(s.animation.valueThreshold).toBeUndefined();
    expect(s.filter.grayscaleCondition).toBeUndefined(); // only `when: 'value'` there
    expect(s.filter.effectsWhen).toEqual({ when: 'value', valueEntity: 's.x', valueOperator: '!=', valueThreshold: 12 });
    expect(s.background.condition).toEqual({ when: 'value', valueEntity: 's.x' }); // a non-string text goes
    expect(s.border.widthWhen).toEqual({ when: 'value', valueEntity: 's.x', valueOperator: '<', valueThreshold: 1 }); // too long: text goes, number stays
    expect(s.iconColor.sizeWhen).toBeUndefined();
  });

  it('presets without the new fields are returned unchanged', () => {
    const old = { animation: { ...E.animation, enabled: true, trigger: 'value', valueEntity: 's.t', valueOperator: '>', valueThreshold: 3 } } as unknown as StudioState;
    expect(migrateStudioState(old).animation).toEqual({ ...E.animation, enabled: true, trigger: 'value', valueEntity: 's.t', valueOperator: '>', valueThreshold: 3 });
  });
});

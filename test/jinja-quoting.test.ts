/**
 * One rule for every free-text value written into a single-quoted Jinja
 * literal: the generator escapes it (jinjaStr), the parser decodes it
 * (unescapeJinjaStr), so state -> CSS -> state gives back the exact value and
 * a quote or backslash never ends the literal early.
 *
 * Two kinds of test per site:
 *  - values holding `'`, `\` and both: the template is well-formed (checked by
 *    a small scanner that follows Jinja's own literal rule), reads back as the
 *    original, and regenerates the same CSS;
 *  - an ordinary value: the exact CSS string, copied from the output of the
 *    code before the escaping existed (commit 3e9734e), to show nothing moved.
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { jinjaStr, unescapeJinjaStr } from '../src/utils/jinja-str.js';
import type { StudioState } from '../src/types/index.js';

const E = mapToStudioState(parseStyleValue(''));
const parse = (css: string) => mapToStudioState(parseStyleValue(css), 'tile');
const gen = (p: Partial<StudioState>) => generateCss({ ...E, ...p } as StudioState, 'tile');

/**
 * Scans every `{{ … }}` of `css` with Jinja's literal rule (a single-quoted
 * literal ends at the first quote that no backslash escapes). Returns, per
 * expression, its skeleton (each literal replaced by `S`) and the decoded
 * literals. A literal left open, or a stray quote/word glued to a literal,
 * shows up as a skeleton that is not the expected one.
 */
function scan(css: string): Array<{ skeleton: string; literals: string[] }> {
  const out: Array<{ skeleton: string; literals: string[] }> = [];
  let i = 0;
  while ((i = css.indexOf('{{', i)) !== -1) {
    let j = i + 2;
    let skeleton = '{{';
    const literals: string[] = [];
    let closed = false;
    while (j < css.length) {
      const ch = css[j];
      if (ch === "'") {
        let body = '';
        j++;
        while (j < css.length && css[j] !== "'") {
          if (css[j] === '\\' && j + 1 < css.length) { body += css[j + 1]; j += 2; } else { body += css[j]; j++; }
        }
        if (j >= css.length) throw new Error(`unterminated literal in ${css}`);
        literals.push(body);
        skeleton += 'S';
        j++;
      } else if (ch === '}' && css[j + 1] === '}') {
        skeleton += '}}';
        j += 2;
        closed = true;
        break;
      } else {
        skeleton += ch;
        j++;
      }
    }
    if (!closed) throw new Error(`unterminated template in ${css}`);
    out.push({ skeleton, literals });
    i = j;
  }
  return out;
}

const TRICKY = ["it's", 'a\\b', "a\\'b", "''", "x\\"];

interface Site {
  name: string;
  build: (v: string) => Partial<StudioState>;
  /** Skeleton of each template in the CSS, in order. */
  skeleton: string[];
  /** The literals of each template, with `V` standing for the value. */
  literals: string[][];
  read: (s: StudioState) => unknown;
  /** The parser can give the value back (false: only a colour-shaped token is
   *  claimed there, see the notes at the sites that set this). */
  roundTrips?: boolean;
}

const COND = "S if is_state(S, S) else S";
const VAL = "S if S(S) | float(0) > 3 else S";
const THR_ICON = { ...E.iconColor, enabled: false };

const SITES: Site[] = [
  {
    name: 'Icon Color: entity',
    build: (v) => ({ iconColor: { ...E.iconColor, enabled: true, mode: 'conditional', entityId: v, colorOn: 'red', colorOff: 'blue' } }),
    skeleton: ['{{ S if is_state(S, S) else S }}'],
    literals: [['red', 'V', 'on', 'blue']],
    read: (s) => s.iconColor.entityId,
  },
  {
    name: 'Icon Color: colour when on',
    build: (v) => ({ iconColor: { ...E.iconColor, enabled: true, mode: 'conditional', entityId: 'switch.x', colorOn: v, colorOff: 'blue' } }),
    skeleton: ['{{ S if is_state(S, S) else S }}'],
    literals: [['V', 'switch.x', 'on', 'blue']],
    read: (s) => s.iconColor.colorOn,
  },
  {
    name: 'Icon Color: colour when off',
    build: (v) => ({ iconColor: { ...E.iconColor, enabled: true, mode: 'conditional', entityId: 'switch.x', colorOn: 'red', colorOff: v } }),
    skeleton: ['{{ S if is_state(S, S) else S }}'],
    literals: [['red', 'switch.x', 'on', 'V']],
    read: (s) => s.iconColor.colorOff,
  },
  {
    name: 'Icon Color (light): entity',
    build: (v) => ({ iconColor: { ...E.iconColor, enabled: true, mode: 'light', entityId: v, colorOff: 'blue' } }),
    skeleton: ['{{ S ~ (state_attr(S, S) | join(S)) ~ S if is_state(S, S) and state_attr(S, S) else S }}'],
    literals: [['rgb(', 'V', 'rgb_color', ', ', ')', 'V', 'on', 'V', 'rgb_color', 'blue']],
    read: (s) => s.iconColor.entityId,
  },
  {
    name: 'Icon Color (light): fallback colour',
    build: (v) => ({ iconColor: { ...E.iconColor, enabled: true, mode: 'light', entityId: 'light.x', colorOff: v } }),
    skeleton: ['{{ S ~ (state_attr(S, S) | join(S)) ~ S if is_state(S, S) and state_attr(S, S) else S }}'],
    literals: [['rgb(', 'light.x', 'rgb_color', ', ', ')', 'light.x', 'on', 'light.x', 'rgb_color', 'V']],
    read: (s) => s.iconColor.colorOff,
  },
  {
    name: 'Icon size condition: entity',
    build: (v) => ({ iconColor: { ...E.iconColor, enabled: true, mode: 'none', sizePx: 30, sizeWhen: { when: 'custom', customEntity: v } } }),
    skeleton: ['{{ S if is_state(S, S) else S }}', '{{ S if is_state(S, S) else S }}'],
    literals: [['45px', 'V', 'on', '36px'], ['30px', 'V', 'on', '24px']],
    read: (s) => s.iconColor.sizeWhen?.customEntity,
  },
  {
    name: 'Accent: entity',
    build: (v) => ({ accentColor: { ...E.accentColor, enabled: true, mode: 'conditional', entityId: v, colorOn: 'red', colorOff: 'blue' } }),
    skeleton: Array(3).fill('{{ S if is_state(S, S) else S }}'),
    literals: Array(3).fill(['red', 'V', 'on', 'blue']),
    read: (s) => s.accentColor.entityId,
  },
  {
    name: 'Accent: colour when on',
    build: (v) => ({ accentColor: { ...E.accentColor, enabled: true, mode: 'conditional', entityId: 'switch.x', colorOn: v, colorOff: 'blue' } }),
    skeleton: Array(3).fill('{{ S if is_state(S, S) else S }}'),
    literals: Array(3).fill(['V', 'switch.x', 'on', 'blue']),
    read: (s) => s.accentColor.colorOn,
  },
  {
    name: 'Accent: colour when off',
    build: (v) => ({ accentColor: { ...E.accentColor, enabled: true, mode: 'conditional', entityId: 'switch.x', colorOn: 'red', colorOff: v } }),
    skeleton: Array(3).fill('{{ S if is_state(S, S) else S }}'),
    literals: Array(3).fill(['red', 'switch.x', 'on', 'V']),
    read: (s) => s.accentColor.colorOff,
  },
  {
    name: 'Background: custom entity',
    build: (v) => ({ background: { ...E.background, enabled: true, applyWhen: 'custom', customEntity: v, color1: 'red' } }),
    skeleton: ['{{ S if is_state(S, S) else S }}'],
    literals: [['red', 'V', 'on', '']],
    read: (s) => s.background.customEntity,
  },
  {
    name: 'Filter: grayscale custom entity',
    build: (v) => ({ filter: { ...E.filter, enabled: true, grayscale: true, grayscaleWhen: 'custom', customEntity: v } }),
    skeleton: ['{{ S if is_state(S, S) else S }}'],
    literals: [['grayscale(100%)', 'V', 'on', 'none']],
    read: (s) => s.filter.customEntity,
  },
  {
    name: 'Filter: effects condition entity',
    build: (v) => ({ filter: { ...E.filter, enabled: true, brightness: 80, effectsWhen: { when: 'custom', customEntity: v } } }),
    skeleton: ['{{ S if is_state(S, S) else S }}'],
    literals: [['brightness(80%)', 'V', 'on', 'none']],
    read: (s) => s.filter.effectsWhen?.customEntity,
  },
  {
    name: 'Filter: effects condition value entity',
    build: (v) => ({ filter: { ...E.filter, enabled: true, brightness: 80, effectsWhen: { when: 'value', valueEntity: v, valueOperator: '>', valueThreshold: 3 } } }),
    skeleton: ['{{ S if states(S) | float(0) > 3 else S }}'],
    literals: [['brightness(80%)', 'V', 'none']],
    read: (s) => s.filter.effectsWhen?.valueEntity,
  },
  {
    name: 'Filter: effects condition attribute',
    build: (v) => ({ filter: { ...E.filter, enabled: true, brightness: 80, effectsWhen: { when: 'value', valueEntity: 'sensor.x', valueAttribute: v, valueOperator: '>', valueThreshold: 3 } } }),
    skeleton: ['{{ S if state_attr(S, S) | float(0) > 3 else S }}'],
    literals: [['brightness(80%)', 'sensor.x', 'V', 'none']],
    read: (s) => s.filter.effectsWhen?.valueAttribute,
  },
  {
    name: 'Border: width condition entity',
    build: (v) => ({ border: { ...E.border, enabled: true, borderWidth: 2, borderColor: 'red', widthWhen: { when: 'custom', customEntity: v }, widthOffPx: 1 } }),
    skeleton: ['{{ S if is_state(S, S) else S }}'],
    literals: [['2px solid red', 'V', 'on', '1px solid red']],
    read: (s) => s.border.widthWhen?.customEntity,
  },
  {
    name: 'Border: colour in the conditional border shorthand',
    build: (v) => ({ border: { ...E.border, enabled: true, borderWidth: 2, borderColor: v, widthWhen: { when: 'custom', customEntity: 'switch.x' }, widthOffPx: 1 } }),
    skeleton: ['{{ S if is_state(S, S) else S }}'],
    literals: [['2px solid V', 'switch.x', 'on', '1px solid V']],
    read: (s) => s.border.borderColor,
    // The parser only claims a border whose colour is a colour token (hex,
    // var(), rgb(), a name) — a quote can never be part of one, so such a
    // value stays in Advanced CSS, verbatim. The template is still well-formed.
    roundTrips: false,
  },
  {
    name: 'Animation: custom entity',
    build: (v) => ({ animation: { ...E.animation, enabled: true, trigger: 'custom', customEntity: v } }),
    skeleton: ['{{ S if is_state(S, S) else S }}'],
    literals: [['cms-pulse 2s ease-in-out infinite', 'V', 'on', 'none']],
    read: (s) => s.animation.customEntity,
  },
  {
    name: 'Animation: value entity',
    build: (v) => ({ animation: { ...E.animation, enabled: true, trigger: 'value', valueEntity: v, valueOperator: '>', valueThreshold: 3 } }),
    skeleton: ['{{ S if states(S) | float(0) > 3 else S }}'],
    literals: [['cms-pulse 2s ease-in-out infinite', 'V', 'none']],
    read: (s) => s.animation.valueEntity,
  },
  {
    name: 'Animation: value attribute',
    build: (v) => ({ animation: { ...E.animation, enabled: true, trigger: 'value', valueEntity: 'sensor.x', valueAttribute: v, valueOperator: '>', valueThreshold: 3 } }),
    skeleton: ['{{ S if state_attr(S, S) | float(0) > 3 else S }}'],
    literals: [['cms-pulse 2s ease-in-out infinite', 'sensor.x', 'V', 'none']],
    read: (s) => s.animation.valueAttribute,
  },
  {
    name: 'Threshold: entity',
    build: (v) => ({ threshold: { ...E.threshold, enabled: true, entityId: v, properties: ['icon-color'], rules: [{ id: '0', operator: '>', value: 3, color: 'red' }], defaultColor: 'blue' } }),
    skeleton: ['{{ S if states(S) | float(0) > 3 else S }}'],
    literals: [['red', 'V', 'blue']],
    read: (s) => s.threshold.entityId,
  },
  {
    name: 'Threshold: attribute',
    build: (v) => ({ threshold: { ...E.threshold, enabled: true, entityId: 'sensor.x', attribute: v, properties: ['icon-color'], rules: [{ id: '0', operator: '>', value: 3, color: 'red' }], defaultColor: 'blue' } }),
    skeleton: ['{{ S if state_attr(S, S) | float(0) > 3 else S }}'],
    literals: [['red', 'sensor.x', 'V', 'blue']],
    read: (s) => s.threshold.attribute,
  },
  {
    name: 'Threshold: rule colour',
    build: (v) => ({ threshold: { ...E.threshold, enabled: true, entityId: 'sensor.x', properties: ['icon-color'], rules: [{ id: '0', operator: '>', value: 3, color: v }], defaultColor: 'blue' } }),
    skeleton: ['{{ S if states(S) | float(0) > 3 else S }}'],
    literals: [['V', 'sensor.x', 'blue']],
    read: (s) => s.threshold.rules[0]?.color,
    // Threshold colours are read back only as a colour token (see the border note).
    roundTrips: false,
  },
  {
    name: 'Threshold: default colour',
    build: (v) => ({ threshold: { ...E.threshold, enabled: true, entityId: 'sensor.x', properties: ['icon-color'], rules: [{ id: '0', operator: '>', value: 3, color: 'red' }], defaultColor: v } }),
    skeleton: ['{{ S if states(S) | float(0) > 3 else S }}'],
    literals: [['red', 'sensor.x', 'V']],
    read: (s) => s.threshold.defaultColor,
    roundTrips: false,
  },
];

// Keep the unused helper constants honest for readers of the skeleton table.
void COND; void VAL; void THR_ICON;

describe.each(SITES)('$name', (site) => {
  it.each(TRICKY)('is a well-formed template for %j', (v) => {
    const found = scan(gen(site.build(v)));
    expect(found.map((f) => f.skeleton)).toEqual(site.skeleton);
    expect(found.map((f) => f.literals)).toEqual(
      site.literals.map((ls) => ls.map((l) => l.replaceAll('V', v))),
    );
  });

  it.each(TRICKY)('round-trips %j', (v) => {
    const css = gen(site.build(v));
    const back = parse(css);
    if (site.roundTrips === false) {
      // Not claimed: the template stays in Advanced CSS and is written back
      // verbatim (its declaration may move into its own block), and the
      // result is stable from then on.
      expect(back.advanced.rawCss).toContain('{{');
      const again = generateCss(back, 'tile');
      expect(scan(again)).toEqual(scan(css));
      expect(generateCss(parse(again), 'tile')).toBe(again);
      return;
    }
    expect(back.advanced.rawCss, css).toBe('');
    expect(site.read(back), css).toBe(v);
    expect(generateCss(back, 'tile')).toBe(css);
  });
});

describe('the shared helpers', () => {
  it('jinjaStr and unescapeJinjaStr are inverse on every combination', () => {
    for (const v of [...TRICKY, '', 'plain', '\\\\', "\\'\\'", "'\\"]) {
      expect(unescapeJinjaStr(jinjaStr(v))).toBe(v);
    }
  });
  it('a value with neither character is unchanged', () => {
    expect(jinjaStr('sensor.living_room_1')).toBe('sensor.living_room_1');
    expect(jinjaStr('var(--primary-color)')).toBe('var(--primary-color)');
  });
});

/**
 * Ordinary values: the exact text the generator wrote BEFORE this change
 * (taken from commit 3e9734e).
 */
describe('ordinary values are written exactly as before', () => {
  const ICON_COND =
    "ha-state-icon {\n  color: {{ 'red' if is_state('switch.x', 'on') else 'blue' }} !important;\n}";
  it('Icon Color', () => {
    expect(gen({ iconColor: { ...E.iconColor, enabled: true, mode: 'conditional', entityId: 'switch.x', colorOn: 'red', colorOff: 'blue' } })).toBe(ICON_COND);
  });
  it('Icon Color (light)', () => {
    expect(gen({ iconColor: { ...E.iconColor, enabled: true, mode: 'light', entityId: 'light.x', colorOff: 'blue' } })).toBe(
      "ha-state-icon {\n  color: {{ 'rgb(' ~ (state_attr('light.x', 'rgb_color') | join(', ')) ~ ')' if is_state('light.x', 'on') and state_attr('light.x', 'rgb_color') else 'blue' }} !important;\n}",
    );
  });
  it('Icon size condition', () => {
    expect(gen({ iconColor: { ...E.iconColor, enabled: true, mode: 'none', sizePx: 30, sizeWhen: { when: 'custom', customEntity: 'switch.x' } } })).toBe(
      "ha-tile-icon {\n  --tile-icon-size: {{ '45px' if is_state('switch.x', 'on') else '36px' }};\n  --mdc-icon-size: {{ '30px' if is_state('switch.x', 'on') else '24px' }};\n}",
    );
  });
  it('Accent', () => {
    expect(gen({ accentColor: { ...E.accentColor, enabled: true, mode: 'conditional', entityId: 'switch.x', colorOn: 'red', colorOff: 'blue' } })).toBe(
      "ha-card {\n  --accent-color: {{ 'red' if is_state('switch.x', 'on') else 'blue' }};\n  --tile-color: {{ 'red' if is_state('switch.x', 'on') else 'blue' }} !important;\n  --state-icon-color: {{ 'red' if is_state('switch.x', 'on') else 'blue' }};\n}",
    );
  });
  it('Background', () => {
    expect(gen({ background: { ...E.background, enabled: true, applyWhen: 'custom', customEntity: 'switch.x', color1: 'red' } })).toBe(
      "ha-card {\n  background: {{ 'red' if is_state('switch.x', 'on') else '' }};\n}",
    );
  });
  it('Filter', () => {
    expect(gen({ filter: { ...E.filter, enabled: true, grayscale: true, grayscaleWhen: 'custom', customEntity: 'switch.x' } })).toBe(
      "ha-card {\n  filter: {{ 'grayscale(100%)' if is_state('switch.x', 'on') else 'none' }};\n  transition: filter 300ms ease !important;\n}",
    );
    expect(gen({ filter: { ...E.filter, enabled: true, brightness: 80, effectsWhen: { when: 'value', valueEntity: 'sensor.x', valueAttribute: 'a', valueOperator: '>', valueThreshold: 3 } } })).toBe(
      "ha-card {\n  filter: {{ 'brightness(80%)' if state_attr('sensor.x', 'a') | float(0) > 3 else 'none' }};\n  transition: filter 300ms ease !important;\n}",
    );
  });
  it('Border', () => {
    expect(gen({ border: { ...E.border, enabled: true, borderWidth: 2, borderColor: 'red', widthWhen: { when: 'custom', customEntity: 'switch.x' }, widthOffPx: 1 } })).toBe(
      "ha-card {\n  border-radius: 12px;\n  border: {{ '2px solid red' if is_state('switch.x', 'on') else '1px solid red' }};\n}",
    );
    expect(gen({ border: { ...E.border, enabled: true, borderWidth: 2, borderColor: 'red', widthWhen: { when: 'custom', customEntity: 'switch.x' } } })).toBe(
      "ha-card {\n  border-radius: 12px;\n  border: {{ '2px solid red' if is_state('switch.x', 'on') else '' }};\n}",
    );
  });
  it('Animation', () => {
    const kf = '@keyframes cms-pulse {\n  0%, 100% { transform: scale(1); }\n  50% { transform: scale(1.05); }\n}\n\n';
    expect(gen({ animation: { ...E.animation, enabled: true, trigger: 'custom', customEntity: 'switch.x' } })).toBe(
      kf + "ha-card {\n  animation: {{ 'cms-pulse 2s ease-in-out infinite' if is_state('switch.x', 'on') else 'none' }};\n}",
    );
    expect(gen({ animation: { ...E.animation, enabled: true, trigger: 'value', valueEntity: 'sensor.x', valueAttribute: 'a', valueOperator: '>', valueThreshold: 3 } })).toBe(
      kf + "ha-card {\n  animation: {{ 'cms-pulse 2s ease-in-out infinite' if state_attr('sensor.x', 'a') | float(0) > 3 else 'none' }};\n}",
    );
  });
  it('Threshold', () => {
    expect(gen({ threshold: { ...E.threshold, enabled: true, entityId: 'sensor.x', attribute: 'a', properties: ['icon-color'], rules: [{ id: '0', operator: '>', value: 5, color: 'red' }], defaultColor: 'blue' } })).toBe(
      "ha-state-icon {\n  color: {{ 'red' if state_attr('sensor.x', 'a') | float(0) > 5 else 'blue' }} !important;\n}",
    );
    expect(gen({ threshold: { ...E.threshold, enabled: true, entityId: 'sensor.x', properties: ['icon-color'], rules: [{ id: '0', operator: '>=', value: 80, color: '#ff0000' }, { id: '1', operator: '>=', value: 40, color: 'var(--warning-color)' }], defaultColor: 'rgb(1, 2, 3)' } })).toBe(
      "ha-state-icon {\n  color: {{ '#ff0000' if states('sensor.x') | float(0) >= 80 else ('var(--warning-color)' if states('sensor.x') | float(0) >= 40 else 'rgb(1, 2, 3)') }} !important;\n}",
    );
  });
});

describe('CSS written before this change still loads', () => {
  it('an unescaped template reads as before', () => {
    const css =
      "ha-card {\n  --accent-color: {{ 'red' if is_state('switch.x', 'on') else 'blue' }};\n  --tile-color: {{ 'red' if is_state('switch.x', 'on') else 'blue' }} !important;\n  --state-icon-color: {{ 'red' if is_state('switch.x', 'on') else 'blue' }};\n}";
    const back = parse(css);
    expect(back.accentColor).toMatchObject({ enabled: true, mode: 'conditional', entityId: 'switch.x', colorOn: 'red', colorOff: 'blue' });
    expect(generateCss(back, 'tile')).toBe(css);
  });
});

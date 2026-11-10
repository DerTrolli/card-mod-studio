/**
 * A template holding a backslash escape the Studio never writes (`\n`, `\"` …)
 * was typed by hand, so no module adopts it (hasForeignEscape). The guard sits
 * in five readers; each has its own test here, written so that it fails when
 * that guard alone is removed (the readers do not cover for each other):
 *
 *   parseCondTernary           -> Filter, Icon size, Border width
 *   animation value reader     -> Animation (value trigger)
 *   light-mode Icon Color      -> Icon Color (light)
 *   threshold reader           -> Threshold (entity, attribute): behaviour test
 *                                 only, see below
 *
 * (analyzeJinja's guard is covered in jinja-quoting.test.ts.)
 *
 * The threshold reader's guard cannot be tested alone: that reader also
 * requires the text to equal what the generator would write for the values it
 * read, and the generator doubles every backslash it writes (jinjaStr), so any
 * foreign escape already fails that comparison. The guard is a second line of
 * defence there; its tests below pass with or without it.
 *
 * Every case: the module stays off, the text is in the hand-written part, and
 * generate gives the input back byte for byte.
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import type { StudioState } from '../src/types/index.js';

const E = mapToStudioState(parseStyleValue(''));
const parse = (css: string) => mapToStudioState(parseStyleValue(css), 'tile');
const gen = (p: Partial<StudioState>) => generateCss({ ...E, ...p } as StudioState, 'tile');
/** A real backslash followed by `n`, as typed in a template. */
const NL = 'a\\nb';

function expectLeftAlone(css: string, off: (s: StudioState) => boolean, marker: string): void {
  const back = parse(css);
  expect(off(back)).toBe(true);
  expect(back.advanced.rawCss).toContain(marker);
  expect(generateCss(back, 'tile')).toBe(css);
}

describe('parseCondTernary guard', () => {
  it('Filter: brightness conditional on an entity with \\n', () => {
    const css = `ha-card {\n  filter: {{ 'brightness(80%)' if is_state('${NL}', 'on') else 'none' }};\n}`;
    expectLeftAlone(css, (s) => !s.filter.enabled, NL);
  });

  it('Icon size: tile icon-size templates with \\n in the entity', () => {
    const normal = gen({ iconColor: { ...E.iconColor, enabled: true, mode: 'none', sizePx: 30, sizeWhen: { when: 'custom', customEntity: 'switch.x' } } });
    expect(normal).toContain("is_state('switch.x', 'on')");
    const css = normal.split('switch.x').join(NL);
    expectLeftAlone(css, (s) => !s.iconColor.enabled && s.iconColor.sizePx === undefined, NL);
  });

  it('Border width: conditional width on an entity with \\n', () => {
    const css = `ha-card {\n  border: {{ '2px solid red' if is_state('${NL}', 'on') else '' }};\n}`;
    expectLeftAlone(css, (s) => !s.border.enabled, NL);
  });
});

describe('animation value reader guard', () => {
  it('a value trigger on a sensor with \\n keeps the animation hand-written and its keyframes', () => {
    const kf = gen({ animation: { ...E.animation, enabled: true, trigger: 'always' } }).split('\n\n')[0];
    expect(kf.startsWith('@keyframes cms-pulse')).toBe(true);
    const css = `${kf}\n\nha-card {\n  animation: {{ 'cms-pulse 2s ease-in-out infinite' if states('sensor.${NL}') | float(0) > 3 else 'none' }};\n}`;
    expectLeftAlone(css, (s) => !s.animation.enabled, NL);
    expect(generateCss(parse(css), 'tile').split('@keyframes cms-pulse').length - 1).toBe(1);
  });
});

describe('light-mode Icon Color guard', () => {
  it('a light entity with \\n is not adopted', () => {
    const css =
      `ha-state-icon {\n  color: {{ 'rgb(' ~ (state_attr('light.${NL}', 'rgb_color') | join(', ')) ~ ')' ` +
      `if is_state('light.${NL}', 'on') and state_attr('light.${NL}', 'rgb_color') else 'grey' }} !important;\n}`;
    expectLeftAlone(css, (s) => !s.iconColor.enabled, NL);
  });
});

describe('threshold reader guard', () => {
  it('an entity with \\n is not adopted', () => {
    const css = `ha-state-icon {\n  color: {{ 'red' if states('sensor.${NL}') | float(0) > 3 else 'blue' }} !important;\n}`;
    expectLeftAlone(css, (s) => !s.threshold.enabled && !s.iconColor.enabled, NL);
  });

  it('an attribute with \\n is not adopted', () => {
    const css = `ha-state-icon {\n  color: {{ 'red' if state_attr('sensor.x', '${NL}') | float(0) > 3 else 'blue' }} !important;\n}`;
    expectLeftAlone(css, (s) => !s.threshold.enabled && !s.iconColor.enabled, NL);
  });
});

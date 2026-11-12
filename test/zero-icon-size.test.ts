/**
 * A hand-written `--mdc-icon-size: 0px` ("theme size" to the module, which
 * writes nothing for it) must survive load -> save untouched: the parser may
 * not claim a size the generator will not write back.
 */
import { describe, it, expect } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { generateCss } from '../src/generator/css-generator.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

const parse = (css: string, k: string) => mapToStudioState(parseStyleValue(css), k);
const roundTrip = (css: string, type: string) => generateCss(parse(css, type), type);

const CASES: Array<[string, string, string]> = [
  ['sensor', 'sensor', 'ha-card {\n  --mdc-icon-size: 0px;\n  --ha-icon-size: 0px;\n}'],
  ['entity', 'entity', 'ha-card {\n  --mdc-icon-size: 0px;\n  --ha-icon-size: 0px;\n}'],
  ['tile', 'tile', 'ha-tile-icon {\n  --mdc-icon-size: 0px;\n}'],
  ['mushroom', 'custom:mushroom-light-card', 'ha-card {\n  --icon-size: 0px;\n}'],
  ['bubble', 'custom:bubble-card/button', '.bubble-icon {\n  --mdc-icon-size: 0px;\n}'],
];

describe('a hand-written 0px icon size is kept', () => {
  it.each(CASES)('%s: load -> save is byte-identical', (_n, type, css) => {
    const back = parse(css, type);
    expect(back.iconColor.enabled).toBe(false);
    expect(roundTrip(css, type)).toBe(css);
  });

  it('a 0 size beside a recognised colour is kept too', () => {
    const css = "ha-state-icon {\n  color: red !important;\n}\nha-card {\n  --mdc-icon-size: 0px;\n  --ha-icon-size: 0px;\n}";
    const out = roundTrip(css, 'sensor');
    expect(out).toContain('--mdc-icon-size: 0px');
    expect(out).toContain('--ha-icon-size: 0px');
  });

  it('a conditional size whose on-branch is 0 is kept', () => {
    const css = "ha-card {\n  --mdc-icon-size: {{ '0px' if is_state(config.entity, 'on') else '24px' }};\n  --ha-icon-size: {{ '0px' if is_state(config.entity, 'on') else '24px' }};\n}";
    expect(roundTrip(css, 'sensor')).toContain("'0px' if is_state");
  });

  it('positive sizes are still adopted', () => {
    expect(parse('ha-card {\n  --mdc-icon-size: 36px;\n  --ha-icon-size: 36px;\n}', 'sensor').iconColor)
      .toMatchObject({ enabled: true, mode: 'none', sizePx: 36 });
    expect(parse('ha-tile-icon {\n  --mdc-icon-size: 36px;\n}', 'tile').iconColor)
      .toMatchObject({ enabled: true, mode: 'none', sizePx: 36 });
  });
});

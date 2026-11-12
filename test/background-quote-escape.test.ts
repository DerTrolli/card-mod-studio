/**
 * A quote or backslash in a conditional Background value must not break the
 * Jinja string literal it is written into (`url('/x.png')` is a valid solid
 * value). Jinja single-quoted literals: `\\` is a backslash, `\'` a quote.
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import type { StudioState } from '../src/types/index.js';

const EMPTY = mapToStudioState(parseStyleValue(''));
const parse = (css: string, k?: string) => mapToStudioState(parseStyleValue(css), k);
const make = (bg: Partial<StudioState['background']>): StudioState =>
  ({ ...EMPTY, background: { ...EMPTY.background, enabled: true, ...bg } });

/** Jinja's own string-literal rule, applied to the `{{ … }}` of a declaration. */
const LITERAL = /'((?:[^'\\]|\\.)*)'/g;
function decode(css: string): string[] {
  const expr = /\{\{(.*)\}\}/.exec(css)![1];
  // What is left once every literal is blanked must hold no stray quote.
  expect(expr.replace(LITERAL, '').includes("'")).toBe(false);
  return [...expr.matchAll(LITERAL)].map((m) => m[1].replace(/\\(.)/g, '$1'));
}

const CONDS: Array<[string, Partial<StudioState['background']>, string]> = [
  ['on', { applyWhen: 'on' }, "is_state(config.entity, 'on')"],
  ['off', { applyWhen: 'off' }, "is_state(config.entity, 'off')"],
  ['custom', { applyWhen: 'custom', customEntity: 'switch.x' }, "is_state('switch.x', 'on')"],
];
const VALUES = ["url('/x.png')", 'url("/x.png")', "url('/a b/c.png'), red", 'x\\y', "it's", "\\'", "''", "a\\\\b'"];

describe('solid Background in a ternary', () => {
  it.each(CONDS)("url('/x.png') under %s is escaped", (_n, cond, expr) => {
    const css = generateCss(make({ type: 'solid', color1: "url('/x.png')", ...cond }), 'tile');
    expect(css).toContain(`{{ 'url(\\'/x.png\\')' if ${expr} else '' }}`);
  });

  it.each(CONDS)('round-trips byte-stable under %s', (_n, cond) => {
    for (const v of VALUES) {
      const css = generateCss(make({ type: 'solid', color1: v, ...cond }), 'tile');
      const back = parse(css, 'tile');
      expect(back.advanced.rawCss, css).toBe('');
      expect(back.background.color1, css).toBe(v);
      expect(generateCss(back, 'tile')).toBe(css);
    }
  });

  it('every generated template is well-formed and decodes to the value', () => {
    for (const [, cond] of CONDS) {
      for (const v of VALUES) {
        const lits = decode(generateCss(make({ type: 'solid', color1: v, ...cond }), 'tile'));
        expect(lits[0]).toBe(v);
        expect(lits[lits.length - 1]).toBe('');
      }
    }
  });

  it('a value with no quote or backslash is unchanged', () => {
    expect(generateCss(make({ color1: 'var(--x)', applyWhen: 'on' }), 'tile'))
      .toBe("ha-card {\n  background: {{ 'var(--x)' if is_state(config.entity, 'on') else '' }};\n}");
  });

  it('an old style with no escapes still loads', () => {
    const css = "ha-card {\n  background: {{ '#ffee00' if is_state(config.entity, 'on') else '' }};\n}";
    expect(parse(css, 'tile').background)
      .toMatchObject({ enabled: true, type: 'solid', color1: '#ffee00', applyWhen: 'on' });
  });
});

describe('gradient Background in a ternary', () => {
  it.each(CONDS)("a url('…') colour under %s", (_n, cond) => {
    const css = generateCss(
      make({ type: 'gradient', color1: "url('/x.png')", color2: '#ff8c00', angle: 90, ...cond }), 'tile');
    expect(css).toContain("linear-gradient(90deg, url(\\'/x.png\\'), #ff8c00)");
    const back = parse(css, 'tile');
    expect(back.background).toMatchObject({ type: 'gradient', color1: "url('/x.png')", color2: '#ff8c00' });
    expect(generateCss(back, 'tile')).toBe(css);
    expect(decode(css)[0]).toBe("linear-gradient(90deg, url('/x.png'), #ff8c00)");
  });
});

describe('unconditional Background is untouched', () => {
  it('writes the value as is', () => {
    expect(generateCss(make({ color1: "url('/x.png')", applyWhen: 'always' }), 'tile'))
      .toBe("ha-card {\n  background: url('/x.png');\n}");
  });
});

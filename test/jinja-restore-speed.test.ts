/**
 * Reading a style with many Jinja templates is linear (v1.0): restoring the
 * placeholders walked every template for every value — 4,000 templated
 * rules took ~5 s. The restore must stay exact as well as fast.
 */
import { describe, it, expect } from 'vitest';
import { parseAllRules } from '../src/parser/css-parser.js';

const mk = (n: number) =>
  Array.from({ length: n }, (_, i) => `.r${i} {\n  color: {{ 'red' if is_state('light.a${i}', 'on') else 'blue' }};\n}`).join('\n');

describe('Jinja placeholders', () => {
  it('3,000 templated rules parse in well under a second, every template restored exactly', () => {
    const t = performance.now();
    const rules = parseAllRules(mk(3000));
    expect(performance.now() - t).toBeLessThan(1000);
    expect(rules).toHaveLength(3000);
    expect(rules[2999].properties[0].value).toBe("{{ 'red' if is_state('light.a2999', 'on') else 'blue' }}");
    expect(rules.every((r) => !r.properties[0].value.includes('__CMS_'))).toBe(true);
  });
  it('placeholders 1 and 10 are not confused', () => {
    const rules = parseAllRules(mk(12));
    expect(rules[1].properties[0].value).toContain("'light.a1'");
    expect(rules[10].properties[0].value).toContain("'light.a10'");
  });
});

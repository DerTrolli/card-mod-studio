/**
 * Advanced CSS warning: no false alarm for a CRLF string continuation or a
 * brace pair that spans `{% raw %}`; line lookup is not quadratic; an
 * unchanged text is not re-scanned.
 */
import { describe, it, expect } from 'vitest';
import { lintAdvancedCss, lintStats } from '../src/utils/css-lint.js';

describe('string continuation', () => {
  it('backslash + CRLF continues a CSS string (and LF always did)', () => {
    expect(lintAdvancedCss('a { content: "x\\\r\ny"; }')).toBeUndefined();
    expect(lintAdvancedCss('a { content: "x\\\ny"; }')).toBeUndefined();
  });
  it('a bare CRLF inside a string is still unterminated', () => {
    expect(lintAdvancedCss('a { content: "x\r\ny"; }')?.message).toContain('Unterminated string');
  });
});

describe('{% raw %}', () => {
  it('Jinja leaves raw text as it is, so a rule opened in raw and closed after it pairs up', () => {
    expect(lintAdvancedCss('{% raw %}a { b: c {% endraw %}}')).toBeUndefined();
    expect(lintAdvancedCss('a { b: {% raw %}c }\nd { {% endraw %}e: f; }')).toBeUndefined();
  });
  it('a lone brace inside raw never warns, as before', () => {
    expect(lintAdvancedCss('{% raw %}{{ not jinja }} { {% endraw %}')).toBeUndefined();
    expect(lintAdvancedCss('{% raw %} } {% endraw %}')).toBeUndefined();
  });
  it('braces outside raw are still checked', () => {
    expect(lintAdvancedCss('{% raw %}x{% endraw %} }')?.message).toContain('Unmatched }');
    expect(lintAdvancedCss('{% raw %}x{% endraw %} a {')?.message).toContain('Unclosed {');
  });
});

describe('large input', () => {
  const rules = Array.from({ length: 6000 }, (_, i) => `.r${i} { color: red; }`).join('\n');
  it('reports the right line far into a big style', () => {
    const issue = lintAdvancedCss(`${rules}\na { b: c;`);
    expect(issue?.message).toContain('Unclosed {');
    expect(issue?.line).toBe(6001);
  });
  it('a valid big style is clean, and the same text is scanned once', () => {
    const before = lintStats.scans;
    expect(lintAdvancedCss(rules)).toBeUndefined();
    expect(lintAdvancedCss(rules)).toBeUndefined();
    expect(lintStats.scans - before).toBe(1);
    lintAdvancedCss(`${rules}\n`);
    expect(lintStats.scans - before).toBe(2);
  });
  it('line numbers after many lines match a plain count', () => {
    const text = 'x\n'.repeat(500) + '}\n';
    expect(lintAdvancedCss(text)?.line).toBe(501);
  });
});

/**
 * Single-quoted Jinja string literals: the one rule for every value the Studio
 * writes into one (and reads back out of one).
 *
 * Jinja's lexer reads a literal as `'([^'\\]*(?:\\.[^'\\]*)*)'` and decodes the
 * body as a unicode-escape, so `\\` is a backslash and `\'` is a quote. A value
 * holding either character would otherwise end the literal early (or escape its
 * closing quote), Home Assistant could not render the template, and the whole
 * style block would silently stop applying.
 */

/** A value for the inside of a single-quoted Jinja literal: backslash first,
 *  then the quote. A value with neither character comes back unchanged. */
export function jinjaStr(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Inverse of jinjaStr: `\'` → `'`, `\\` → `\`. */
export function unescapeJinjaStr(v: string): string {
  return v.replace(/\\(['\\])/g, '$1');
}

/** True when `v` holds a backslash that is not one of the two escapes jinjaStr
 *  writes (`\\` and `\'`): `\"`, `\n`, `r` … Such a template was written by
 *  hand, so the Studio must leave it alone (re-escaping the backslash would
 *  change what Home Assistant renders). Valid pairs are removed first, so an
 *  escaped backslash followed by `n` is fine. */
export function hasForeignEscape(v: string): boolean {
  return v.replace(/\\[\\']/g, '').includes('\\');
}

/** Regex source for the BODY of a single-quoted literal that may hold escapes
 *  (zero or more characters). Put it between the two quotes of a pattern and
 *  decode the captured text with unescapeJinjaStr. */
export const JINJA_STR_BODY = String.raw`(?:[^'\\]|\\.)*`;

/** Same, one or more characters. */
export const JINJA_STR_BODY_1 = String.raw`(?:[^'\\]|\\.)+`;

/**
 * Index just past the closing delimiter of a `{{` / `{%` tag whose body starts
 * at `from`, or -1 when none is found. Quote-aware: a `}}` / `%}` inside a
 * single- or double-quoted literal (backslash escapes honoured) does not end
 * the tag. With `countBraces` (the default) a `{ … }` pair inside a `{{` tag
 * is skipped too, so a dict literal's `}}` is not taken for the close.
 */
export function endOfTag(s: string, from: number, close: '}}' | '%}', countBraces = true): number {
  let braces = 0;
  let quote = '';
  for (let i = from; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (close === '}}' && countBraces && ch === '{') braces++;
    else if (close === '}}' && ch === '}') {
      if (braces > 0) braces--;
      else if (s[i + 1] === '}') return i + 2;
    } else if (close === '%}' && ch === '%' && s[i + 1] === '}') return i + 2;
  }
  return -1;
}

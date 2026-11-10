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

/** Regex source for the BODY of a single-quoted literal that may hold escapes
 *  (zero or more characters). Put it between the two quotes of a pattern and
 *  decode the captured text with unescapeJinjaStr. */
export const JINJA_STR_BODY = String.raw`(?:[^'\\]|\\.)*`;

/** Same, one or more characters. */
export const JINJA_STR_BODY_1 = String.raw`(?:[^'\\]|\\.)+`;

/**
 * Parsing for the numeric rule / condition text fields.
 *
 * The fields are plain `type="text"` rather than `type="number"`: a number
 * input hides what was typed (a decimal comma reads back as '' or a
 * different number depending on the browser locale), which is how `2,5`
 * became `25`. No `inputmode="decimal"` either: the iOS decimal keypad has
 * no minus key, and negative thresholds must stay typable.
 *
 * Bounds: |value| <= 1e12 (a terabyte in bytes, a year in ms — nothing a
 * sensor threshold needs is bigger, and beyond ~1e21 JS prints exponent
 * form). A non-zero |value| < 1e-6 is also refused: JS would print it as
 * `1e-7`, and the generated template must only ever contain a plain number.
 */
export const MAX_RULE_VALUE = 1e12;
export const MIN_RULE_STEP = 1e-6;

const PLAIN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/** The number typed, or undefined when it isn't one (empty, `--`, `1.2.3`, `1e999`, ...). */
export function parseRuleNumber(raw: string): number | undefined {
  let t = raw.trim();
  // One comma and no dot is a decimal comma ("2,5"); "1,000.5" / "1,2,3" are ambiguous → invalid.
  if (/^[^,.]*,[^,.]*$/.test(t)) t = t.replace(',', '.');
  if (!PLAIN.test(t)) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || Math.abs(n) > MAX_RULE_VALUE) return undefined;
  if (n !== 0 && Math.abs(n) < MIN_RULE_STEP) return undefined;
  return n === 0 ? 0 : n; // never -0 ("-0" would print as "0" anyway, keep it clean)
}

/** Live cue while typing: `aria-invalid` on the field itself (empty counts as invalid — it can't be stored). */
export function markNumberInput(e: Event): void {
  const input = e.target as HTMLInputElement;
  input.setAttribute('aria-invalid', parseRuleNumber(input.value) === undefined ? 'true' : 'false');
}

/** Leaving the field with an invalid number restores the stored one. */
export function revertNumberInput(e: Event, stored: number): void {
  const input = e.target as HTMLInputElement;
  if (input.getAttribute('aria-invalid') !== 'true') return;
  input.value = String(stored);
  input.setAttribute('aria-invalid', 'false');
}

/**
 * `change` (Enter / blur): the parsed number, or undefined when invalid —
 * the caller then stores nothing and the field keeps its cue until blur.
 */
export function commitNumberInput(e: Event): number | undefined {
  const input = e.target as HTMLInputElement;
  const n = parseRuleNumber(input.value);
  input.setAttribute('aria-invalid', n === undefined ? 'true' : 'false');
  if (n !== undefined) input.value = String(n);
  return n;
}

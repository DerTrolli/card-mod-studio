/**
 * threshold-rules.ts — editing a Threshold rule's operator and value, shared
 * by the Threshold module and the entities card's per-row rules.
 *
 * Text rules (v1.0.0-beta.2, issue #41): `is` / `is-not` compare the state
 * (or attribute) as text, exactly as Home Assistant stores it — `heating`,
 * not the translated "Heating" the UI shows. The number operators keep
 * comparing a number.
 */
import type { HomeAssistant, ThresholdRule } from '../types/index.js';
import { isTextRule } from '../types/index.js';

/** A decimal number written as text ("12", "-3.5"). */
const NUMBER_TEXT = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

/**
 * A text rule whose text is a number is the number rule `==` / `!=`: it
 * compares the same thing, and Studio versions before 1.0.0-beta.2 would read
 * the text rule from a preset or a pasted style as `float(0) is 12`, an
 * invalid template that drops the whole card style there. Other rules are
 * returned as they are.
 */
export function normalizeRule<T extends ThresholdRule>(rule: T): T {
  if (!isTextRule(rule) || typeof rule.value !== 'string' || !NUMBER_TEXT.test(rule.value.trim())) return rule;
  return { ...rule, operator: rule.operator === 'is' ? '==' : '!=', value: Number(rule.value.trim()) };
}

/** The rule with another operator; the value follows the operator's kind:
 *  number → text starts empty (the field shows the current state), text →
 *  number keeps a number text as the number and otherwise starts from 0. */
export function withOperator(rule: ThresholdRule, operator: ThresholdRule['operator']): ThresholdRule {
  const next = { ...rule, operator };
  if (isTextRule(next) && typeof rule.value === 'number') next.value = '';
  if (!isTextRule(next) && typeof rule.value === 'string') {
    const n = Number(rule.value.trim());
    next.value = rule.value.trim() !== '' && Number.isFinite(n) ? n : 0;
  }
  return next;
}

/** A text rule's value as committed: trimmed; '' means "keep the previous". */
export function commitTextRuleValue(e: Event): string | undefined {
  const input = e.target as HTMLInputElement;
  const v = input.value.trim();
  input.setAttribute('aria-invalid', v === '' ? 'true' : 'false');
  if (v === '') return undefined;
  input.value = v;
  return v;
}

/** Leaving an emptied text field restores the stored text. */
export function revertTextRuleValue(e: Event, stored: string): void {
  const input = e.target as HTMLInputElement;
  if (input.value.trim() !== '') return;
  input.value = stored;
  input.setAttribute('aria-invalid', 'false');
}

/** The raw text a text rule compares against right now (the state, or the
 *  attribute's value as text), or null when the entity isn't known. */
export function rawRuleValue(hass: HomeAssistant | undefined, entityId: string, attribute?: string): string | null {
  const st = entityId ? hass?.states?.[entityId] : undefined;
  if (!st) return null;
  if (!attribute) return st.state;
  const v = (st.attributes as Record<string, unknown>)[attribute];
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 'True' : 'False'; // Jinja's `| string`
  return typeof v === 'object' ? null : String(v);
}

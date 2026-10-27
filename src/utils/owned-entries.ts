/**
 * Studio-owned pierced entries (v0.11) — the dictionary-form entries the
 * Studio itself writes for the two numbers HA draws inside nested shadow
 * roots: the gauge's value and the thermostat's big number (Font →
 * "Number size"). Live-probed on HA 2026.10 with card-mod and UIX
 * (docs/research/2026-10-v0.11.md §3.1).
 *
 * An entry counts as the Studio's only when it is EXACTLY the shape built
 * here; anything else under the same key is the user's own and is
 * preserved verbatim (docs/V0.11_PLAN.md, C1.0).
 */

import type { DictSource, FontModuleState, PiercedEntry, StudioState } from '../types/index.js';

/** Card types with a Number size control. */
export const NUMBER_SIZE_CARD_TYPES = new Set(['gauge', 'thermostat']);

/** Each card's default Number size: the gauge's is a percentage of HA's
 *  own box for the value (100 = HA's default), the thermostat's is px. */
export const NUMBER_SIZE_DEFAULT: Record<string, number> = { gauge: 100, thermostat: 57 };

const GAUGE_KEY = 'ha-gauge$';
const THERMOSTAT_KEY = 'ha-state-control-climate-temperature$';
const THERMOSTAT_INNER_KEY = 'ha-big-number$';

/** HA's own box for the gauge value (ha-gauge's `.text` rule, HA 2026.10).
 *  The gauge fits its number into this box (it rewrites the SVG viewBox
 *  from the text), so a bigger font-size renders at the SAME size once HA
 *  refits — measured on HA 2026.10.4; scaling the box is what shows. */
const GAUGE_BOX = { width: 55, height: 40 };

/** At most one decimal, no trailing zeros. */
const num = (n: number) => String(Math.round(n * 10) / 10);

const gaugeRule = (pct: number) =>
  `.text {\n  max-width: ${num((GAUGE_BOX.width * pct) / 100)}% !important;\n  max-height: ${num((GAUGE_BOX.height * pct) / 100)}% !important;\n}`;
const thermostatRule = (px: number) => `.value {\n  font-size: ${num(px)}px !important;\n}`;

/** The top-level dictionary key the card's entry lives under, or null. */
export function ownedEntryKey(cardType: string | undefined): string | null {
  if (cardType === 'gauge') return GAUGE_KEY;
  if (cardType === 'thermostat') return THERMOSTAT_KEY;
  return null;
}

/** The exact entry the Studio writes for this card type and size. */
export function ownedEntryFor(cardType: string | undefined, size: number): { key: string; value: unknown } | null {
  if (cardType === 'gauge') return { key: GAUGE_KEY, value: gaugeRule(size) };
  if (cardType === 'thermostat') return { key: THERMOSTAT_KEY, value: { [THERMOSTAT_INNER_KEY]: thermostatRule(size) } };
  return null;
}

/**
 * The size of an entry the Studio wrote itself, or null when the entry is
 * anything else (a different key, a different value, extra rules, a nested
 * dict with more keys…). Trailing whitespace is ignored — YAML block
 * scalars add a newline.
 */
export function parseOwnedEntry(cardType: string | undefined, key: string, value: unknown): number | null {
  if (key !== ownedEntryKey(cardType)) return null;
  let css: unknown = value;
  if (cardType === 'thermostat') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const keys = Object.keys(value);
    if (keys.length !== 1 || keys[0] !== THERMOSTAT_INNER_KEY) return null;
    css = (value as Record<string, unknown>)[THERMOSTAT_INNER_KEY];
  }
  if (typeof css !== 'string') return null;
  let size: number;
  if (cardType === 'gauge') {
    const m = css.match(/max-width: (\d+(?:\.\d)?)% !important;/);
    if (!m) return null;
    size = Math.round((Number(m[1]) / GAUGE_BOX.width) * 100);
  } else {
    const m = css.match(/font-size: (\d+(?:\.\d)?)px !important;/);
    if (!m) return null;
    size = Number(m[1]);
  }
  const built = cardType === 'gauge' ? gaugeRule(size) : thermostatRule(size);
  return css.trim() === built ? size : null;
}

/** The owned entries this state writes for this card (empty unless Number
 *  size is on, not locked by a hand-written entry, and the card has one). */
export function generateOwnedEntries(state: StudioState, cardType: string | undefined): PiercedEntry[] {
  const f = state.font;
  if (!f.numberSizeEnabled || f.numberSizeLocked || !cardType || !NUMBER_SIZE_CARD_TYPES.has(cardType)) return [];
  const e = ownedEntryFor(cardType, f.numberSize || NUMBER_SIZE_DEFAULT[cardType]);
  return e ? [{ ...e, owned: true }] : [];
}

/** Just the Number size fields of a font state. */
export function numberSizeOf(f: FontModuleState): Pick<FontModuleState, 'numberSizeEnabled' | 'numberSize' | 'numberSizeLocked'> {
  return { numberSizeEnabled: f.numberSizeEnabled, numberSize: f.numberSize, ...(f.numberSizeLocked ? { numberSizeLocked: true } : {}) };
}

/** A font state with Number size off — presets never carry it. */
export function withoutNumberSize(f: FontModuleState): FontModuleState {
  const { numberSizeLocked: _locked, ...rest } = f;
  return { ...rest, numberSizeEnabled: false, numberSize: 0 };
}

/** The dict entries that are the user's own CSS (not the Studio's). */
export function userEntries(ds: DictSource | undefined): PiercedEntry[] {
  return (ds?.entries ?? []).filter((e) => !e.owned);
}

/** The Font module's Number size kind for a card type ('' = none). */
export function numberSizeKind(cardType: string | undefined): '' | 'gauge' | 'thermostat' {
  return cardType === 'gauge' || cardType === 'thermostat' ? cardType : '';
}

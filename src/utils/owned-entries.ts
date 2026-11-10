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

/** The gauge's Number size control, in % of HA's own number box.
 *  100 = HA's own rendering. The maximum is the largest setting at which
 *  every value (1-3 digits, with or without a unit, arc or needle) still
 *  clears the arc's inner edge and the needle by a few px — measured on HA
 *  2026.11.0 with card-mod and UIX; the dial leaves no room beyond it. */
export const GAUGE_SIZE = { min: 50, max: 130, step: 5 };

/** HA's own box for the gauge value (ha-gauge's `.text` rule, HA 2026.11).
 *  The gauge fits its number into this box (it rewrites the SVG viewBox
 *  from the text) keeping the aspect ratio, so wide values are limited by
 *  the box width and narrow ones by its height; a bigger font-size renders
 *  at the SAME size once HA refits — scaling the box is what shows.
 *
 *  HA declares `max-width: 55%; max-height: 40%` but anchors the box with
 *  `left: 50%; transform: translate(-50%)`, and an absolutely positioned
 *  box can be at most as wide as the space right of its `left` — half the
 *  gauge. HA's effective box is therefore 50 % x 40 %, and that is what
 *  100 % reproduces. To grow past it the rule re-anchors the box with
 *  left/right: 0 and auto margins (centred exactly as HA does).
 *
 *  Height grows linearly with the setting. Width grows with it too but is
 *  capped (GAUGE_WIDTH_CAP): the arc's inner edge is a circle, so a wide
 *  value reaches it long before a narrow one; "42 °C" touches it at about
 *  60 % width, "123 °C" a little later. Both limits are percentages of the
 *  gauge, so the rule scales with the card. */
const GAUGE_BOX = { width: 50, height: 40 };
const GAUGE_WIDTH_CAP = 56;
/** The boxes the 0.11 betas wrote (width 55 % at 100 %), recognised and
 *  upgraded: beta.1 without the re-anchor, beta.2 with it. */
const GAUGE_BOX_BETA = { width: 55, height: 40 };

/** At most one decimal, no trailing zeros. */
const num = (n: number) => String(Math.round(n * 10) / 10);

const GAUGE_ANCHOR = '  left: 0 !important;\n  right: 0 !important;\n  margin: 0 auto !important;\n  transform: none !important;\n';
const gaugeBox = (w: number, h: number) =>
  `.text {\n  max-width: ${num(w)}% !important;\n  max-height: ${num(h)}% !important;\n`;
const clampGauge = (pct: number) => Math.min(Math.max(pct, GAUGE_SIZE.min), GAUGE_SIZE.max);
const gaugeRule = (pct: number) => {
  const p = clampGauge(pct);
  return `${gaugeBox(Math.min((GAUGE_BOX.width * p) / 100, GAUGE_WIDTH_CAP), (GAUGE_BOX.height * p) / 100)}${GAUGE_ANCHOR}}`;
};
/** The shapes written by 0.11.0-beta.2 (anchored) and beta.1 (not). */
const gaugeRuleBeta = (pct: number, anchored: boolean) =>
  `${gaugeBox((GAUGE_BOX_BETA.width * pct) / 100, (GAUGE_BOX_BETA.height * pct) / 100)}${anchored ? GAUGE_ANCHOR : ''}}`;
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
  if (cardType === 'gauge') {
    const css1 = css.trim();
    const mh = css1.match(/max-height: (\d+(?:\.\d)?)% !important;/);
    const mw = css1.match(/max-width: (\d+(?:\.\d)?)% !important;/);
    if (!mh || !mw) return null;
    const cur = Math.round((Number(mh[1]) / GAUGE_BOX.height) * 100);
    if (cur >= GAUGE_SIZE.min && cur <= GAUGE_SIZE.max && css1 === gaugeRule(cur)) return cur;
    // A beta entry: same percentage means the same setting; beta.1/beta.2
    // allowed up to 150 %, which now reads as the new maximum.
    const old = Math.round((Number(mw[1]) / GAUGE_BOX_BETA.width) * 100);
    if (css1 === gaugeRuleBeta(old, true) || css1 === gaugeRuleBeta(old, false)) return Math.min(old, GAUGE_SIZE.max);
    return null;
  }
  const m = css.match(/font-size: (\d+(?:\.\d)?)px !important;/);
  if (!m) return null;
  const size = Number(m[1]);
  return css.trim() === thermostatRule(size) ? size : null;
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

/**
 * bubble.ts — profile DATA for Bubble Card 3.x (docs/V0.11_PLAN.md D5/D9/D12,
 * docs/research/2026-10-v0.11.md §3.3.1). Measured on Bubble 3.4.3, HA
 * 2026.11.0, card-mod 4.2.1 and UIX 9.0.0 (identical on both).
 *
 * Bubble's ha-card is transparent: the visible parts are `.bubble-*` classes
 * that share Bubble's shadow root with card-mod's `<style>`, so plain
 * selectors reach them (no `$` pierce). `!important` is written only where
 * the probe measured it necessary: the icon colour, the slider fill and the
 * button background's `opacity` (Bubble leaves it at 0.5 otherwise).
 *
 * Precedence against the card's own Bubble `styles:` key (probe B3, equal
 * specificity): our rule wins (card-mod's <style> comes after Bubble's);
 * a user's `!important` beats our plain rule and a more specific user selector
 * beats our `!important`. The key itself is never written — only preserved.
 *
 * The selector map is versioned per Bubble MAJOR (D5): a later major gets its
 * own entry and the audit re-runs before it is adopted. Only `card_type`s with
 * measured parts have a profile; every other Bubble card keeps today's default.
 *
 * Imports TYPES from custom-card-profiles.ts only (erased at build time), so
 * the registry module can import this one statically without a cycle.
 */

import type { ClaimRule, ConfigGate, ConfigTest, CustomCardProfile, ProfileEmitters } from '../custom-card-profiles.js';
import {
  claimsFromEmitters, conflictsFromEmitters, clickClass,
  clickText, clickUnder, clickLast,
  CLICK_FONT, CLICK_ICON, CLICK_ACCENT, CLICK_BACKGROUND,
} from './helpers.js';

/** Bubble 3.x class names (measured on 3.4.3). */
export const BUBBLE_SELECTORS = {
  3: {
    name: '.bubble-name',
    state: '.bubble-state',
    icon: '.bubble-icon',
    /** button / slider button */
    buttonBackground: '.bubble-button-background',
    /** cover card */
    coverBackground: '.bubble-background',
    /** separator card container */
    separator: '.bubble-separator',
    /** slider button: the value fill */
    rangeFill: '.bubble-range-fill',
    /** the card's clipping box (`overflow: clip`, own radius): border and,
     *  on a slider, Background live here */
    container: '.bubble-container',
    /** slider button: the clipped track holding the fill */
    rangeSlider: '.bubble-range-slider',
  },
} as const;

/** The Bubble major the profiles below were measured on. */
export const BUBBLE_MAJOR = 3;
const S = BUBBLE_SELECTORS[BUBBLE_MAJOR];

function profile(key: string, p: Omit<CustomCardProfile, 'key'>): CustomCardProfile {
  const e: ProfileEmitters = p.emitters ?? {};
  return {
    key,
    // Background paints on an inner element, the animation runs on ha-card:
    // Gradient Shift moves nothing (measured on button and slider).
    gradientShift: false,
    ...p,
    claims: [...claimsFromEmitters(e), ...(p.claims ?? [])],
    conflicts: [...conflictsFromEmitters(e), ...(p.conflicts ?? [])],
  };
}

/** Name and state text share one rule (the generator writes a selector list
 *  one per line). Measured: size, weight and colour all work without
 *  `!important`; the separator has a name and no state element. */
const text = (selectors: string[]) => ({
  selector: selectors.join(',\n'),
  size: ['font-size'],
  weight: ['font-weight'],
  color: ['color'],
  family: true,
});

/** Icon colour needs `!important` on button and cover (Bubble sets it on the
 *  element), the separator does not mind — one shape for all three. The size is
 *  `--mdc-icon-size` on the same selector (svg 24 → 40px, box 38 → 40px). */
const icon = {
  iconColor: { selector: S.icon },
  iconSize: { selector: S.icon, box: ['--mdc-icon-size'] },
};

/** Click-to-edit rows shared by the four kinds. Measured hit map (slider
 *  338x50, 40 %): `.bubble-name` / `.bubble-state` are full-width blocks, so
 *  they count only over their own text; the slider fill is a separate branch
 *  below the text, found "under" the pointer; everything else inside the card
 *  (empty pill, track, cover arrows — no module styles them) is the card
 *  surface, `.bubble-container` on all four kinds. */
const clicksFor = (...more: ReturnType<typeof clickUnder>[]) => [
  clickText('bubble-name', CLICK_FONT),
  clickText('bubble-state', CLICK_FONT),
  clickClass('bubble-icon', CLICK_ICON),
  clickClass('bubble-icon-container', CLICK_ICON),
  ...more,
  clickLast('bubble-container', CLICK_BACKGROUND),
];

/** The border sits on `.bubble-container`: a real border on Bubble's absolutely
 *  positioned pill is cut by the container's `overflow: clip` (measured: only
 *  a sliver of the left edge shows). The container's clip is then the pill's
 *  shape, so the pieces inside lose their own 28px radius — else they leave
 *  container-coloured slivers in the corners. The container's radius needs
 *  `!important` too: Bubble's `.large .bubble-container { border-radius }`
 *  out-ranks a plain rule (measured: 28px stays with `card_layout: large`,
 *  `large-2-rows` and in a sections view; normal layout is fine). Styles
 *  written without it are still claimed and upgraded on the next save. */
const borderOn = (...inner: string[]) => ({
  selector: S.container,
  direct: true,
  important: ['border-radius'],
  companions: inner.map((selector) => ({ selector, prop: 'border-radius', value: '0', important: true })),
});

/** 0.11.0-beta.2 wrote border + radius (and, on a slider, Background) on the
 *  pill element itself. Listed AFTER the current selectors: the parser reads
 *  whichever is present, the next save writes the current shape. */
const legacyBorder = (selector: string): ClaimRule => ({
  module: 'border', selector, role: 'borderDirect', props: ['border-radius', 'border'],
});

/** Icon size limits, measured on Bubble 3.4.3 (both engines): the icon box is
 *  38px (42 on `large`) and grows with the glyph from there; the card clips it
 *  once it passes the card's height — 50px normal, 56px large (button, slider,
 *  cover). The separator has no box and no clip; past 40px (33 large) the
 *  glyph just overflows the row. Smaller values keep working (the glyph scales
 *  inside the box). */
const ICON_MAX_BOX = { normal: 50, large: 56 };
const ICON_MAX_SEPARATOR = { normal: 40, large: 33 };

/** `show_name: false` and no state line: no text is left for Font. Bubble 3.4.3
 *  renders `.bubble-state` iff its state content (`state_content`, else the
 *  legacy `show_state` / `show_attribute` + `attribute` / `show_last_changed` /
 *  `show_last_updated`, else — for `button_type: state` — the entity's default)
 *  is non-empty; button, slider and cover share that code. A present
 *  `state_content` replaces the legacy options entirely. `show_state` and
 *  `show_attribute` default to ON for `button_type: state` only, so "off" is a
 *  falsy value, or no value on any other button type. */
const off = (key: string): ConfigTest[][] => [
  [{ key, absent: false }, { key, unset: true }],
  [{ key, absent: true }, { key: 'button_type', not: ['state'] }],
];
const noStateLine = (): ConfigTest[][] => {
  const nameOff: ConfigTest = { key: 'show_name', is: [false] };
  const stateOff = off('show_state');
  const attributeOff: ConfigTest[][] = [...off('show_attribute'), [{ key: 'attribute', unset: true }]];
  const legacy: ConfigTest[] = [
    { key: 'state_content', absent: true },
    { key: 'show_last_changed', unset: true },
    { key: 'show_last_updated', unset: true },
  ];
  return [
    [nameOff, { key: 'state_content', absent: false }, { key: 'state_content', unset: true }],
    ...stateOff.flatMap((a) => attributeOff.map((b) => [nameOff, ...legacy, ...a, ...b])),
  ];
};

/** Controls whose target the card config removes (measured on 3.4.3: with
 *  `show_icon: false` there is no `.bubble-icon` at all). Only a completely
 *  dead control is hidden: one text line still takes Font. */
const GATES: ConfigGate[] = [
  { when: [[{ key: 'show_icon', is: [false] }]], hide: ['iconColor'] },
  { when: noStateLine(), hide: ['font'] },
];

/** Opacity stays at Bubble's 0.5 unless forced (measured): rides with Background. */
const OPACITY_1 = { prop: 'opacity', value: '1', important: true };

// Threshold and Accent have no probed target on any of these cards, except the
// slider's fill (D12): hidden, hand-written CSS for them stays in Advanced CSS.
const NO_THRESHOLD = { threshold: false, accentColor: false } as const;

// ---------------------------------------------------------------------------
// button — name/state, icon, `.bubble-button-background` box
// ---------------------------------------------------------------------------

const button = profile('custom:bubble-card/button', {
  label: 'Bubble button',
  modules: { ...NO_THRESHOLD },
  configGates: GATES,
  iconSize: true,
  iconSizeMax: ICON_MAX_BOX,
  clickToEdit: clicksFor(),
  emitters: {
    font: text([S.name, S.state]),
    ...icon,
    // An ha-card border draws a separate box next to the visible pill; the
    // pill's own box is the container (see borderOn).
    background: { selector: S.buttonBackground, vars: ['background'], companions: [OPACITY_1] },
    border: borderOn(S.buttonBackground),
  },
  claims: [legacyBorder(S.buttonBackground)],
});

// ---------------------------------------------------------------------------
// button + button_type: slider — the same parts, and Accent → the value fill
// ---------------------------------------------------------------------------

const slider = profile('custom:bubble-card/button/slider', {
  label: 'Bubble slider',
  modules: { threshold: false },
  configGates: GATES,
  iconSize: true,
  iconSizeMax: ICON_MAX_BOX,
  clickToEdit: clicksFor(clickClass('bubble-range-fill', CLICK_ACCENT), clickUnder('bubble-range-fill', CLICK_ACCENT)),
  emitters: {
    font: text([S.name, S.state]),
    ...icon,
    // `.bubble-range-fill { background-color }` is ignored without
    // `!important`; its 0.7 opacity needs forcing too.
    accent: {
      selector: S.rangeFill,
      vars: ['background-color'],
      triplet: false,
      important: true,
      companions: [OPACITY_1],
    },
    // Bubble paints the slider's `.bubble-button-background` ABOVE the fill
    // (it is a later sibling), so a Background there hides the value. The
    // container sits below the fill: the Background colours the track and the
    // fill stays on top (measured, both engines). The slider's own
    // background element is always transparent (Bubble sets it so), so no
    // opacity companion is needed.
    background: { selector: S.container, vars: ['background'] },
    border: borderOn(S.buttonBackground, S.rangeSlider),
  },
  claims: [
    { module: 'background', selector: S.buttonBackground, role: 'background', props: ['background'] },
    { module: 'background', selector: S.buttonBackground, role: 'companion', props: ['opacity'], equals: '1' },
    legacyBorder(S.buttonBackground),
  ],
});

// ---------------------------------------------------------------------------
// separator — a name, an icon and a line; no entity
// ---------------------------------------------------------------------------

const separator = profile('custom:bubble-card/separator', {
  label: 'Bubble separator',
  modules: { ...NO_THRESHOLD },
  iconSize: true,
  iconSizeMax: ICON_MAX_SEPARATOR,
  // No entity behind the card: nothing for a state condition to read.
  stateAware: false,
  clickToEdit: clicksFor(),
  emitters: {
    font: text([S.name]),
    ...icon,
    background: { selector: S.separator, vars: ['background'] },
    // Measured on UIX 9.0.0 only: a plain `border-radius` here loses to
    // Bubble's own rule (card-mod 4.2.1 takes it plain); `!important` wins on both.
    border: { selector: S.separator, direct: true, important: ['border-radius'] },
  },
});

// ---------------------------------------------------------------------------
// cover — buttons only (no slider element)
// ---------------------------------------------------------------------------

const cover = profile('custom:bubble-card/cover', {
  label: 'Bubble cover',
  modules: { ...NO_THRESHOLD },
  configGates: GATES,
  iconSize: true,
  iconSizeMax: ICON_MAX_BOX,
  clickToEdit: clicksFor(),
  emitters: {
    font: text([S.name, S.state]),
    ...icon,
    // Opacity is already 1 here (measured): no companion.
    background: { selector: S.coverBackground, vars: ['background'] },
    border: borderOn(S.coverBackground),
  },
  claims: [legacyBorder(S.coverBackground)],
});

export const BUBBLE_PROFILES: CustomCardProfile[] = [button, slider, separator, cover];

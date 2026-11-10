/**
 * mushroom.ts — profile DATA for Mushroom 5.x (docs/V0.11_PLAN.md D3/D4/D9/D12,
 * docs/research/2026-10-v0.11.md §3.3.1). Measured on Mushroom 5.2.3, HA
 * 2026.11.0, card-mod 4.2.1 and UIX 9.0.0 (identical on both); no `!important`
 * anywhere here.
 *
 * Nothing in this file is code the generator or parser branches on: it only
 * declares variables. css-generator.ts writes through `emitters`, state-mapper.ts
 * reads back through `claims`, style-conflicts.ts warns through `conflicts`.
 *
 * Imports TYPES from custom-card-profiles.ts only (erased at build time), so
 * the registry module can import this one statically without a cycle.
 */

import type { ConfigGate, ConfigTest, CustomCardProfile, ProfileEmitters } from '../custom-card-profiles.js';
import {
  claimsFromEmitters, conflictsFromEmitters, clickTag, clickClass,
  CLICK_FONT, CLICK_ICON, CLICK_BACKGROUND,
} from './helpers.js';

const HA_CARD = 'ha-card';

function profile(key: string, p: Omit<CustomCardProfile, 'key'>): CustomCardProfile {
  const e: ProfileEmitters = p.emitters ?? {};
  return {
    key,
    ...p,
    claims: [...claimsFromEmitters(e), ...(p.claims ?? [])],
    conflicts: [...conflictsFromEmitters(e), ...(p.conflicts ?? [])],
  };
}

// ---------------------------------------------------------------------------
// M-classic — the 14 state cards
// ---------------------------------------------------------------------------

/**
 * Accent: `ha-card { --rgb-state-…: R, G, B }` recolours icon, shape and (on
 * the light) the brightness slider together. The variable is per CARD TYPE
 * (measured: the entity card reads --rgb-state-entity whatever its entity's
 * domain is), and cards with several states read one variable per state —
 * all of them are written, like the thermostat's four climate variables.
 * Off/idle/unknown states read `--rgb-disabled` and are deliberately left
 * alone: Accent colours the active look. Probed per type on the rig (an
 * `entity`-card/`select` on a `select` entity reads --rgb-state-entity).
 * Not reached at all: `:host { --rgb-state-* }`, `--rgb`, `--mush-rgb-*`.
 */
const CLASSIC_ACCENT_VARS: Record<string, string[]> = {
  'alarm-control-panel': ['--rgb-state-alarm-disarmed', '--rgb-state-alarm-armed', '--rgb-state-alarm-triggered'],
  climate: [
    '--rgb-state-climate-auto', '--rgb-state-climate-cool', '--rgb-state-climate-dry',
    '--rgb-state-climate-fan-only', '--rgb-state-climate-heat', '--rgb-state-climate-heat-cool',
    '--rgb-state-climate-idle',
  ],
  cover: ['--rgb-state-cover-open', '--rgb-state-cover-closed'],
  entity: ['--rgb-state-entity'],
  fan: ['--rgb-state-fan'],
  humidifier: ['--rgb-state-humidifier'],
  light: ['--rgb-state-light'],
  lock: ['--rgb-state-lock-locked', '--rgb-state-lock-unlocked', '--rgb-state-lock-pending'],
  'media-player': ['--rgb-state-media-player'],
  number: ['--rgb-state-number'],
  // the person card's state colour is its badge (the avatar has none)
  person: [
    '--rgb-state-person-home', '--rgb-state-person-not-home', '--rgb-state-person-zone',
    '--rgb-state-person-unknown',
  ],
  select: ['--rgb-state-entity'],
  update: ['--rgb-state-update-on', '--rgb-state-update-off', '--rgb-state-update-installing'],
  vacuum: ['--rgb-state-vacuum'],
};

// Config gates (measured per type on Mushroom 5.2.3, card-mod and UIX alike):
// a module is hidden only where the card's own options leave it NOTHING to
// style. Mushroom's `icon_type` / `primary_info` / `secondary_info` fall back
// to the legacy `hide_icon` / `hide_name` / `hide_state` flags while unset.
type Clauses = ConfigTest[][];
const noneOf = (key: string, legacy: string): Clauses => [[{ key, is: ['none'] }], [{ key, unset: true }, { key: legacy }]];
const allOf = (a: Clauses, b: Clauses): Clauses => a.flatMap((x) => b.map((y) => [...x, ...y]));
const unsetAll = (...keys: string[]): Clauses => [keys.map((key) => ({ key, unset: true }))];

const ICON_NONE = noneOf('icon_type', 'hide_icon');
const TEXT_NONE = allOf(noneOf('primary_info', 'hide_name'), noneOf('secondary_info', 'hide_state'));

/** Types whose Accent reaches only the icon, shape and badge (no accent-coloured
 *  control): dead without an icon. Not light / humidifier (slider — gated
 *  below while it has no control), number (its slider), fan / vacuum (not measurable:
 *  every demo entity is off / docked, so their controls could not be told). */
const ACCENT_ICON_ONLY = new Set([
  'alarm-control-panel', 'climate', 'cover', 'entity', 'lock', 'media-player', 'person', 'select', 'update',
]);
/** Cards whose slider Accent colours: dead without an icon only while no slider is on. */
const ACCENT_SLIDER_KEYS: Record<string, string[]> = {
  light: ['show_brightness_control', 'show_color_temp_control', 'show_color_control'],
  humidifier: ['show_target_humidity_control'],
};

function classicGates(type: string): ConfigGate[] {
  const gates: ConfigGate[] = [
    // Accent is dead while the card config sets `icon_color` (measured: the
    // colour stays put under --rgb-state-* and under !important direct rules).
    { key: 'icon_color', hide: ['accentColor'] },
    // No icon at all: neither the colour nor the size has an element (all 14).
    { when: ICON_NONE, hide: ['iconColor'] },
  ];
  if (ACCENT_ICON_ONLY.has(type)) gates.push({ when: ICON_NONE, hide: ['accentColor'] });
  const sliders = ACCENT_SLIDER_KEYS[type];
  if (sliders) gates.push({ when: allOf(ICON_NONE, unsetAll(...sliders)), hide: ['accentColor'] });
  // No text lines: the --card-primary/secondary-* variables have no element.
  // Not climate (its temperature control inherits the family) and not the
  // number card in buttons mode (the value text does).
  if (type !== 'climate') {
    const clauses = type === 'number' ? allOf(TEXT_NONE, [[{ key: 'display_mode', not: ['buttons'] }]]) : TEXT_NONE;
    gates.push({ when: clauses, hide: ['font'] });
  }
  return gates;
}

/** Icon size limit (measured on Mushroom 5.2.3, both engines): the slider value
 *  is the shape's diameter. A sections view gives the card one 56px row, so a
 *  shape of 56 fills it and anything larger spills over the neighbours (a
 *  masonry card just grows). Classic and template alike; the template's circle
 *  already grows with its glyph (box = value, glyph = 2/3), unlike the tile. */
const ICON_MAX = { normal: 56, large: 56 };

function classic(type: string): CustomCardProfile {
  return profile(`custom:mushroom-${type}-card`, {
    configGates: classicGates(type),
    iconSize: true,
    iconSizeMax: ICON_MAX,
    // Probed DOM: `span.primary` / `span.secondary` text, the shape + glyph;
    // anything else falls through to the card box (Background).
    clickToEdit: [
      clickClass('primary', CLICK_FONT),
      clickClass('secondary', CLICK_FONT),
      clickTag('mushroom-shape-icon', CLICK_ICON),
      clickTag('ha-state-icon', CLICK_ICON),
    ],
    emitters: {
      font: {
        selector: HA_CARD,
        size: ['--card-primary-font-size', '--card-secondary-font-size'],
        weight: ['--card-primary-font-weight', '--card-secondary-font-weight'],
        color: ['--card-primary-color', '--card-secondary-color'],
        family: true,
        // fixed 20px / 16px lines (overflow: hidden) would clip a larger text
        scaled: [
          { prop: '--card-primary-line-height', ratio: 20 / 14 },
          { prop: '--card-secondary-line-height', ratio: 16 / 12 },
        ],
      },
      // shape 36→60px with the variable (the glyph follows at 2/3)
      iconSize: { selector: HA_CARD, box: ['--icon-size'] },
      accent: { selector: HA_CARD, vars: CLASSIC_ACCENT_VARS[type] },
    },
  });
}

// ---------------------------------------------------------------------------
// M-template — a tile (D4)
// ---------------------------------------------------------------------------

const template = profile('custom:mushroom-template-card', {
  // Font / text colour / accent / tile text matchers: the tile's own.
  emitAs: 'tile',
  iconSize: true,
  iconSizeMax: ICON_MAX,
  // Neither `icon` nor `picture`: the card renders no icon element at all, so
  // colour and size have nothing to reach (measured, with and without an
  // entity). A picture alone still takes the size (not the colour).
  configGates: [{ when: [[{ key: 'icon', unset: true }, { key: 'picture', unset: true }]], hide: ['iconColor'] }],
  // The tile's own parts: info block (primary/secondary spans), tile icon.
  clickToEdit: [
    clickTag('ha-tile-info', CLICK_FONT),
    clickTag('ha-tile-icon', CLICK_ICON),
    clickTag('ha-state-icon', CLICK_ICON),
  ],
  emitters: {
    // `ha-card { --tile-icon-size }` does nothing (even with !important): the
    // tile icon sets both on its own :host, so they ride on ha-tile-icon.
    // Box = the slider value, glyph = 2/3 of it (box 60 → glyph 40, measured).
    iconSize: { selector: 'ha-tile-icon', box: ['--tile-icon-size'], glyph: ['--mdc-icon-size'] },
  },
});

// ---------------------------------------------------------------------------
// M-chips — ha-card is a transparent row; the chips live in nested shadow roots
// ---------------------------------------------------------------------------

const chips = profile('custom:mushroom-chips-card', {
  modules: { accentColor: false },
  // `ha-card { --card-primary-*, font-size, color }` and a plain
  // `ha-card { background | border }` change nothing on chips; the chip
  // variables do. Text colour: only the inherited --primary-text-color
  // reaches (and recolours everything under it) — not offered.
  fontColor: false,
  iconSize: true,
  stateAware: false,
  // A chip's text → Font (size/weight), its glyph → Icon Color (size only
  // here), the rest of the chip (`mushroom-chip`) → Background.
  clickToEdit: [
    clickTag('span', CLICK_FONT),
    clickTag('ha-state-icon', CLICK_ICON),
    clickTag('mushroom-chip', CLICK_BACKGROUND),
  ],
  emitters: {
    font: {
      selector: HA_CARD,
      size: ['--chip-font-size'],
      weight: ['--chip-font-weight'],
      family: true,
      // the pill is a fixed 36px high; text taller than ~20px spills out of it
      scaled: [{ prop: '--chip-height', ratio: 1, add: 16, min: 36 }],
    },
    // The chips' icons sit in nested shadow roots no selector reaches: Icon
    // Color is a size-only control here.
    iconSize: { selector: HA_CARD, box: ['--chip-icon-size'], colorless: true },
    background: { selector: HA_CARD, vars: ['--chip-background'] },
    border: {
      selector: HA_CARD,
      radius: ['--chip-border-radius'],
      width: ['--chip-border-width'],
      color: ['--chip-border-color'],
    },
  },
});

// ---------------------------------------------------------------------------
// M-title — text only; the card paints no box
// ---------------------------------------------------------------------------

const title = profile('custom:mushroom-title-card', {
  // no icon, no state, no painted box: background/border are dead on the
  // title card (measured), the filter and the font are not
  modules: { iconColor: false, accentColor: false, background: false, border: false },
  stateAware: false,
  // Only the title text: the subtitle's own variables are not written, so a
  // subtitle click is not claimed (it falls to Advanced CSS: no box here).
  clickToEdit: [clickClass('title', CLICK_FONT)],
  emitters: {
    // Font → the title (the subtitle's --subtitle-* twins are not touched)
    font: {
      selector: HA_CARD,
      size: ['--title-font-size'],
      weight: ['--title-font-weight'],
      color: ['--title-color'],
      family: true,
      // fixed 32px line (24px text) would overlap the subtitle when larger
      scaled: [{ prop: '--title-line-height', ratio: 32 / 24 }],
    },
  },
});

// ---------------------------------------------------------------------------
// M-empty — renders no ha-card at all (360×0): nothing to style
// ---------------------------------------------------------------------------

const empty = profile('custom:mushroom-empty-card', {
  modules: {
    iconColor: false, accentColor: false, font: false, threshold: false, background: false,
    border: false, animation: false, filter: false, headingStyle: false,
  },
  stateAware: false,
});

export const MUSHROOM_CLASSIC_TYPES = Object.keys(CLASSIC_ACCENT_VARS);

export const MUSHROOM_PROFILES: CustomCardProfile[] = [
  ...MUSHROOM_CLASSIC_TYPES.map(classic),
  template,
  chips,
  title,
  empty,
];

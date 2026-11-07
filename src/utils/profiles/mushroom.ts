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

import type { CustomCardProfile, ProfileEmitters } from '../custom-card-profiles.js';
import { claimsFromEmitters, conflictsFromEmitters } from './helpers.js';

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

function classic(type: string): CustomCardProfile {
  return profile(`custom:mushroom-${type}-card`, {
    // Accent is dead while the card config sets `icon_color` (measured: the
    // colour stays put under --rgb-state-* and under !important direct rules).
    configGates: [{ key: 'icon_color', hide: ['accentColor'] }],
    iconSize: true,
    emitters: {
      font: {
        selector: HA_CARD,
        size: ['--card-primary-font-size', '--card-secondary-font-size'],
        weight: ['--card-primary-font-weight', '--card-secondary-font-weight'],
        color: ['--card-primary-color', '--card-secondary-color'],
        family: true,
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
  emitters: {
    font: {
      selector: HA_CARD,
      size: ['--chip-font-size'],
      weight: ['--chip-font-weight'],
      family: true,
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
  emitters: {
    // Font → the title (the subtitle's --subtitle-* twins are not touched)
    font: {
      selector: HA_CARD,
      size: ['--title-font-size'],
      weight: ['--title-font-weight'],
      color: ['--title-color'],
      family: true,
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

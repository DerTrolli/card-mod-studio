/**
 * custom-card-profiles.ts — D2 (docs/V0.11_PLAN.md): custom-card knowledge is
 * DATA, read through one lookup (`capsFor` in card-caps.ts).
 *
 * A *profile key* identifies what the Studio is styling:
 *   - `config.type` for every card ('tile', 'gauge', 'custom:mushroom-entity-card'…)
 *   - `config.type + '/' + card_type` for `custom:bubble-card`
 *     ('custom:bubble-card/button'; a slider button is '…/button/slider').
 *     See profileKeyOf for a missing `card_type` (measured, not assumed).
 *
 * Profile DATA lives in its own modules under `./profiles/` and is imported
 * statically below (C2.2/G1). Those modules import this file's TYPES only
 * (`import type`, erased at build time), so there is no runtime import cycle —
 * neither with this file nor with card-caps.ts. Built-in HA cards never appear
 * here: their gating stays the measured Sets in card-caps.ts, answered through
 * the same lookup.
 *
 * Who reads what:
 *   - `emitters` — the generator (css-generator.ts) WRITES a module's output
 *     through them instead of the built-in `ha-card { … }` shapes.
 *   - `claims`   — the parser (state-mapper.ts) READS them back; a declaration
 *     is recognised only through a claim, so what is not claimed stays in
 *     Advanced CSS. A claim ignores `!important` (the parser strips it).
 *   - `emitAs`   — reuse a built-in card's emitters/claims/text matchers
 *     (D4: the Mushroom template card is a tile).
 *   - `conflicts` — "Advanced CSS overrides this control" rows.
 */

import { MUSHROOM_PROFILES } from './profiles/mushroom.js';
import { BUBBLE_PROFILES } from './profiles/bubble.js';

/** The panel modules a profile can show or hide. `filter` was always shown
 *  for built-ins; a profile may hide it (Mushroom's empty card has no box). */
export type ProfileModule =
  | 'iconColor'
  | 'accentColor'
  | 'font'
  | 'threshold'
  | 'background'
  | 'border'
  | 'animation'
  | 'headingStyle'
  | 'filter';

/** Font: variables on one selector. `size` gets `Npx`, `weight` the module's
 *  weight value, `color` the colour (each listed variable gets the same value —
 *  the tile emitter does the same for its primary/secondary pair). `family`
 *  adds a plain `font-family` on the selector. */
export interface FontEmitter {
  selector: string;
  size?: string[];
  weight?: string[];
  color?: string[];
  family?: boolean;
}

/** Icon size: `box` variables get the slider's value; `glyph` variables get
 *  round(value × 2/3) (Mushroom's own ratio: 36px shape / 24px glyph).
 *  `colorless` — the card's icons can't take the module's colour, so the module
 *  is a size-only control there (chips). */
export interface IconSizeEmitter {
  selector: string;
  box: string[];
  glyph?: string[];
  colorless?: boolean;
}

/** An extra declaration a module writes next to its own, on the same
 *  selector (Bubble: the button background is dead at its default 0.5
 *  opacity unless `opacity: 1 !important` rides along). The parser claims it
 *  only when it carries exactly `value` and the module itself was recognised. */
export interface Companion {
  prop: string;
  value: string;
  important?: boolean;
}

/** Accent: each variable gets the accent colour as `R, G, B` (Mushroom's
 *  `--rgb-state-*` contract). With `triplet: false` the variables take the
 *  colour as written (`background-color` on Bubble's slider fill); `important`
 *  appends `!important` to every one. */
export interface AccentEmitter {
  selector: string;
  vars: string[];
  triplet?: boolean;
  important?: boolean;
  companions?: Companion[];
}

/** Background: the variable(s) replace `background` on the selector
 *  (`vars: ['background']` keeps the plain property on another selector). */
export interface BackgroundEmitter {
  selector: string;
  vars: string[];
  companions?: Companion[];
}

/** Icon colour: Icon Color's `color: … !important` lands on this selector
 *  instead of `ha-state-icon` (Bubble: `.bubble-icon`). Hand-written
 *  `ha-icon` / `--state-icon-color` equivalents are not adopted there. */
export interface IconColorEmitter {
  selector: string;
}

/** Border: radius / width / colour as variables instead of `border-radius` /
 *  `border` (chips). */
export interface BorderEmitter {
  selector: string;
  radius?: string[];
  width?: string[];
  color?: string[];
  /** Write the module's own `border-radius` / `border: Npx solid C` on
   *  `selector` (Bubble's visible box is a class, not `ha-card`); the variable
   *  lists above are not used. */
  direct?: boolean;
  /** `direct` only: properties that get `!important` (Bubble's separator
   *  radius loses to the card's own rule on UIX 9 without it). */
  important?: string[];
}

/** How each module's output is emitted for this card (everything omitted keeps
 *  the built-in shape, or the `emitAs` card's). */
export interface ProfileEmitters {
  font?: FontEmitter;
  iconSize?: IconSizeEmitter;
  iconColor?: IconColorEmitter;
  accent?: AccentEmitter;
  background?: BackgroundEmitter;
  border?: BorderEmitter;
}

/** What a claim rule reads back. */
export type ClaimRole =
  | 'fontSize'
  | 'fontWeight'
  | 'fontColor'
  | 'fontFamily'
  | 'iconSize'
  | 'iconGlyph'
  | 'iconColor'
  | 'accent'
  | 'background'
  | 'borderRadius'
  | 'borderWidth'
  | 'borderColor'
  | 'borderDirect'
  | 'companion';

/** Which declarations parse back into which module (claim rules). */
export interface ClaimRule {
  module: ProfileModule;
  /** The rule's selector, compared whole (case/whitespace-insensitive). */
  selector: string;
  /** What the properties carry. */
  role: ClaimRole;
  /** Lowercase property names claimed there; for roles with several
   *  properties the FIRST present one is the anchor, the others are claimed
   *  when they carry the same value. */
  props: string[];
  /** `companion` rules only: the exact value the generator writes. */
  equals?: string;
}

/** An "Advanced CSS overrides this control" row (style-conflicts). `threshold`
 *  rows apply only while Threshold drives `property`. */
export interface ConflictRow {
  module: ProfileModule | 'threshold';
  property?: string;
  selector: string;
  props: string[];
  /** Match `selector` against the user's rule by selector TOKENS (a class or
   *  tag is a whole token: `.bubble-icon` is not in `.bubble-icon-container`)
   *  instead of as a substring. Rows built from emitters set it. */
  tokens?: boolean;
}

/** Click-to-edit: a chain element matching `tag`/`className` → module. */
export interface ClickRule {
  tag?: string;
  className?: string;
  module: string; // custom-element tag of the panel module, e.g. 'cms-font-module'
  label: string;
}

/** A module hidden while the card config sets `key` (e.g. a Mushroom card's
 *  `icon_color` leaves nothing for the accent variables to colour). */
export interface ConfigGate {
  key: string;
  hide: ProfileModule[];
}

export interface CustomCardProfile {
  /** Profile key (see header). */
  key: string;
  /** Reuse this built-in card's emitters, claims and click-to-edit text
   *  matchers wherever the profile has none of its own (D4). */
  emitAs?: string;
  /** Per-module visibility; omitted modules default to shown. */
  modules?: Partial<Record<ProfileModule, boolean>>;
  /** Modules hidden depending on the card's own config (see capsFor). */
  configGates?: ConfigGate[];
  /** Font sub-controls (default true for custom cards). */
  fontColor?: boolean;
  fontSize?: boolean;
  /** Icon Color's size control (default false — an allowlist, like built-ins). */
  iconSize?: boolean;
  /** False when the card has no entity state to condition on. */
  stateAware?: boolean;
  /** Title lives in ha-card's header slot (default false). */
  headerTitle?: boolean;
  /** Filter's transition needs `!important` here (default false). */
  transitionImportant?: boolean;
  emitters?: ProfileEmitters;
  claims?: ClaimRule[];
  conflicts?: ConflictRow[];
  /** Click-to-edit mapping; tried before the generic picker rules. */
  clickToEdit?: ClickRule[];
  /** Extra modules to reset when a preset from another card is applied
   *  (on top of every module this profile hides). */
  presetDrop?: ProfileModule[];
}

/** The shipped registry: profile data modules are listed here (G1). */
const REGISTRY = new Map<string, CustomCardProfile>(
  [...MUSHROOM_PROFILES, ...BUBBLE_PROFILES].map((p) => [p.key, p] as [string, CustomCardProfile]),
);

export function getCustomCardProfile(key: string): CustomCardProfile | undefined {
  return REGISTRY.get(key);
}

/** Add or replace a profile. Used by tests (fixtures); the shipped profiles are
 *  seeded from their data modules. */
export function registerCustomCardProfile(profile: CustomCardProfile): void {
  REGISTRY.set(profile.key, profile);
}

export function unregisterCustomCardProfile(key: string): void {
  REGISTRY.delete(key);
}

/** The key whose BUILT-IN emitters/claims/text matchers apply to `key`:
 *  the profile's `emitAs`, else the key itself. */
export function emitKeyOf(key: string | undefined): string {
  const k = key ?? '';
  return REGISTRY.get(k)?.emitAs ?? k;
}

export const BUBBLE_CARD_TYPE = 'custom:bubble-card';

/**
 * The ONE key every consumer derives from a card config. `config.type`, plus
 * `/card_type` for Bubble Card, plus `/slider` for a Bubble button with
 * `button_type: slider` (its parts differ: a range fill and track).
 * Returns '' for a config without a type.
 *
 * A Bubble card WITHOUT `card_type` is NOT keyed as `button`: measured on
 * Bubble 3.4.3 (HA 2026.11.0, card-mod 4.2.1 and UIX 9.0.0) it renders HA's
 * "Configuration error" card — no `.bubble-*` part exists — so it gets the
 * bare `custom:bubble-card` key, which has no profile (today's default).
 */
export function profileKeyOf(
  config: { type?: unknown; card_type?: unknown; button_type?: unknown } | null | undefined,
): string {
  const type = typeof config?.type === 'string' ? config.type : '';
  if (type !== BUBBLE_CARD_TYPE) return type;
  const sub = typeof config?.card_type === 'string' ? config.card_type : '';
  if (!sub) return type;
  return sub === 'button' && config?.button_type === 'slider' ? `${type}/${sub}/slider` : `${type}/${sub}`;
}

/**
 * True for a custom card the Studio has no profile for (D7: the notice shown
 * above the modules, nothing is hidden). That is any `custom:*` type whose
 * profile key has no profile — including a Bubble Card whose `card_type` is
 * unprofiled or missing (the bare key). Built-in cards, profiled custom
 * cards and configs without a type are false. `type` is read exactly as
 * profileKeyOf reads it (no trimming or case folding), and a bare `custom:`
 * names no card, so it is false too.
 */
export function isUnprofiledCustomCard(
  config: { type?: unknown; card_type?: unknown; button_type?: unknown } | null | undefined,
): boolean {
  const type = typeof config?.type === 'string' ? config.type : '';
  if (!type.startsWith('custom:') || type === 'custom:') return false;
  return !REGISTRY.has(profileKeyOf(config));
}

/** The notice text for an unprofiled custom card (panel and child section). */
export const UNPROFILED_CARD_NOTICE =
  "Card-Mod Studio doesn't know this custom card yet — some controls may not reach it; Advanced CSS always works.";

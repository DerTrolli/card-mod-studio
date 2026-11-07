/**
 * custom-card-profiles.ts — D2 (docs/V0.11_PLAN.md): custom-card knowledge is
 * DATA, read through one lookup (`capsFor` in card-caps.ts).
 *
 * A *profile key* identifies what the Studio is styling:
 *   - `config.type` for every card ('tile', 'gauge', 'custom:mushroom-entity-card'…)
 *   - `config.type + '/' + card_type` for `custom:bubble-card`
 *     ('custom:bubble-card/button'). A Bubble card without `card_type` is
 *     keyed as `button` — ASSUMPTION: Bubble's own default is `button` (the
 *     research note lists `button` first and uses it as the example; the
 *     default itself is not stated there and has not been verified live).
 *
 * The shipped registry is EMPTY: later chunks (C2.2+, C3.x) only add entries.
 * Built-in HA cards never appear here — their gating stays the measured Sets
 * in card-caps.ts, answered through the same lookup.
 */

/** The panel modules a profile can show or hide. */
export type ProfileModule =
  | 'iconColor'
  | 'accentColor'
  | 'font'
  | 'threshold'
  | 'background'
  | 'border'
  | 'animation'
  | 'headingStyle';

/** How a module's output is emitted for this card. The emitters themselves
 *  are added by later chunks; the field exists so they only add data. */
export type EmitterSpec =
  /** CSS custom properties on one selector (Mushroom: `ha-card`). */
  | { kind: 'variables'; selector: string; vars?: Record<string, string> }
  /** Direct class selectors, `!important` (Bubble). Map: role → selector. */
  | { kind: 'selectors'; selectors: Record<string, string>; important?: boolean };

/** Which declarations parse back into which module (claim rules). */
export interface ClaimRule {
  module: ProfileModule;
  /** Substring the rule's selector must contain ('' = any). */
  selector: string;
  /** Lowercase property names the module claims there. */
  props: string[];
}

/** An "Advanced CSS overrides this control" row (style-conflicts). */
export interface ConflictRow {
  module: ProfileModule | 'filter';
  selector: string;
  props: string[];
}

/** Click-to-edit: a chain element matching `tag`/`className` → module. */
export interface ClickRule {
  tag?: string;
  className?: string;
  module: string; // custom-element tag of the panel module, e.g. 'cms-font-module'
  label: string;
}

export interface CustomCardProfile {
  /** Profile key (see header). */
  key: string;
  /** Per-module visibility; omitted modules default to shown. */
  modules?: Partial<Record<ProfileModule, boolean>>;
  /** Font sub-controls (default true for custom cards). */
  fontColor?: boolean;
  fontSize?: boolean;
  /** Icon Color's size control (default false — an allowlist, like built-ins). */
  iconSize?: boolean;
  /** False when the card has no entity state to condition on. */
  stateAware?: boolean;
  /** Emitter per module (data for later chunks; unused by the base emitters). */
  emitters?: Partial<Record<ProfileModule, EmitterSpec>>;
  claims?: ClaimRule[];
  conflicts?: ConflictRow[];
  /** Click-to-edit mapping; tried before the generic picker rules. */
  clickToEdit?: ClickRule[];
  /** Extra modules to reset when a preset from another card is applied
   *  (on top of every module this profile hides). */
  presetDrop?: ProfileModule[];
}

/** The shipped registry — intentionally empty until C2.2 / C3.1. */
const REGISTRY = new Map<string, CustomCardProfile>();

export function getCustomCardProfile(key: string): CustomCardProfile | undefined {
  return REGISTRY.get(key);
}

/** Add or replace a profile. Used by profile data modules and by tests (fixture). */
export function registerCustomCardProfile(profile: CustomCardProfile): void {
  REGISTRY.set(profile.key, profile);
}

export function unregisterCustomCardProfile(key: string): void {
  REGISTRY.delete(key);
}

export const BUBBLE_CARD_TYPE = 'custom:bubble-card';
/** Bubble's `card_type` when the config omits it (assumed, see header). */
export const BUBBLE_DEFAULT_CARD_TYPE = 'button';

/**
 * The ONE key every consumer derives from a card config. `config.type`, plus
 * `/card_type` for Bubble Card. Returns '' for a config without a type.
 */
export function profileKeyOf(config: { type?: unknown; card_type?: unknown } | null | undefined): string {
  const type = typeof config?.type === 'string' ? config.type : '';
  if (type !== BUBBLE_CARD_TYPE) return type;
  const sub = typeof config?.card_type === 'string' && config.card_type ? config.card_type : BUBBLE_DEFAULT_CARD_TYPE;
  return `${type}/${sub}`;
}

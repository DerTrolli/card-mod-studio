/**
 * card-caps.ts — per-card-type capability knowledge, shared between the
 * top-level panel and the per-child sections of container cards
 * (cms-child-card-section). Extracted from cms-panel.ts so the two can't
 * drift: a module hidden as "does nothing on this card type" at the top
 * level must be hidden for the same card type inside a stack too.
 *
 * The sets are the product of live verification, not guesses — see
 * docs/CARD_SUPPORT_MATRIX.md and the notes next to each entry.
 *
 * D2: consumers do NOT read these sets directly — they ask `capsFor(key)`
 * (bottom of this file), which answers from the sets for built-in cards and
 * from a custom-card profile (custom-card-profiles.ts) where one exists.
 */

import { configGateHits, getCustomCardProfile, type ProfileModule } from './custom-card-profiles.js';

export const NON_STATE_CARD_TYPES = new Set([
  'sensor', 'gauge', 'history-graph', 'statistics-graph', 'statistic',
  'energy-distribution', 'energy-usage-graph', 'calendar', 'todo-list',
  'weather-forecast', 'sun', 'map', 'media-control',
]);

export const CONTAINER_CARD_TYPES = new Set([
  'grid', 'vertical-stack', 'horizontal-stack', 'sections', 'conditional',
  // entity-filter renders its inner `card:` — a style on the filter itself
  // reaches nothing (module_effect_audit: every module dead on both engines).
  'entity-filter',
]);

/** Container types whose children live in a `cards: []` array the panel can
 *  offer per-child styling for (conditional uses a single `card:` instead —
 *  not yet supported; sections aren't edited through this dialog). */
export const STYLABLE_CHILDREN_CARD_TYPES = new Set([
  'grid', 'vertical-stack', 'horizontal-stack',
]);

export const NO_ANIMATION_TYPES = new Set([
  'gauge', 'history-graph', 'statistics-graph', 'statistic',
  'energy-distribution', 'energy-usage-graph',
  'thermostat', 'humidifier', 'light', 'alarm-panel',
  'media-control', 'weather-forecast', 'calendar', 'logbook', 'activity',
  'map', 'iframe', 'webpage', 'shopping-list', 'todo-list',
  'heading', 'picture', 'picture-entity', 'picture-glance', 'picture-elements',
]);

export const NO_BACKGROUND_TYPES = new Set([
  'picture', 'picture-entity', 'picture-glance', 'picture-elements',
  'iframe', 'webpage', 'map',
  // heading cards have no painted ha-card box — background has no visual effect
  // (verified empirically). See docs/CARD_SUPPORT_MATRIX.md.
  'heading',
]);

// Border (width/colour + radius) has no visual effect on heading cards (no
// painted box). Radius/filter aside, the whole module is moot there.
export const NO_BORDER_TYPES = new Set([
  'heading',
]);

// Threshold Colors writes icon/accent/background/text/border colour —
// none of which shows on a heading card (measured on a real dashboard:
// title colour, background and border all unchanged; Heading Style has its
// own colour controls). Entities cards hide it too, for per-row thresholds.
export const NO_THRESHOLD_TYPES = new Set([
  'heading',
]);

export const NO_ICON_COLOR_TYPES = new Set([
  'gauge', 'history-graph', 'statistics-graph', 'statistic',
  'energy-distribution', 'energy-usage-graph',
  'thermostat', 'humidifier',
  'weather-forecast', 'calendar', 'logbook', 'activity',
  'markdown', 'map', 'iframe', 'webpage', 'shopping-list', 'todo-list',
  'picture', 'picture-entity',
  'heading',
  // glance renders its icon inside a nested <state-badge> shadow root that a
  // card-mod rule can't pierce, and the colour is applied inline from state —
  // no selector recolours it (verified empirically), so don't offer a dead
  // control. alarm-panel and media-control DO honour icon colour (plain mode)
  // and are intentionally NOT listed here.
  'glance',
  // v0.10 module_effect_audit (pixel-measured, card-mod + UIX): the area
  // card's icon and picture-elements' state icons don't take the colour.
  'area', 'picture-elements',
  // HA 2026.11 date card: live module-effect audit (UIX 9) — dead.
  'date',
]);

/**
 * Accent Color — cards that never read the accent colour (or its companion
 * variables) anywhere visible. Measured by tools/sandbox/harness/
 * module_effect_audit.mjs (rendered pixels, card-mod AND UIX, HA 2026.9):
 * switching the module on changed nothing on these. heading/entities hide
 * it for their own reasons (see cms-panel).
 */
export const NO_ACCENT_TYPES = new Set([
  'alarm-panel', 'area', 'button', 'glance', 'humidifier', 'iframe', 'light',
  'map', 'markdown', 'picture', 'picture-elements', 'picture-entity',
  'statistics-graph', 'todo-list', 'weather-forecast', 'logbook', 'picture-glance',
  // HA 2026.11 date card (module-effect audit, UIX 9): dead.
  'date',
  // alert card: accent dead (module-effect audit, HA 2026.11.0 + UIX 9.0.0)
  'alert',
  // webpage (HA's successor of iframe): accent dead, like iframe (same audit)
  'webpage',
]);

/** Font's size slider changes nothing visible on these cards — they size
 *  their own text (module-effect audit, `font:size` slice, HA 2026.10.4 and
 *  2026.6, card-mod and UIX). Weight, family and colour stay where they work.
 *  The size declaration is still written: it's what the parser recognises
 *  the Font module by, and it has no visible effect on these cards.
 *  (alarm-panel is not here: its title follows the header variables — size
 *  and colour reach it, measured on 2026.11.) */
export const NO_FONT_SIZE_TYPES = new Set([
  'area', 'humidifier', 'picture-entity', 'picture-glance', 'weather-forecast',
  // HA 2026.11 date card (module-effect audit, UIX 9)
  'date',
]);

/**
 * Font's weight row changes nothing visible on these cards — the text the
 * user means keeps its own weight (measured on Home Assistant 2026.11, card-mod
 * and UIX: area name, date text and alert text stay put; only the family
 * reaches them). A weight already stored in an older style is still read,
 * written back and shown (module-font) until the user changes it.
 */
export const NO_FONT_WEIGHT_TYPES = new Set([
  'area', 'date', 'alert',
]);

/**
 * A card-level text colour (Font's colour picker, Threshold's Text Color)
 * reaches no visible text on these — their text carries its own colour
 * (measured, see NO_ACCENT_TYPES). Font's weight (and size, outside
 * NO_FONT_SIZE_TYPES) still work there.
 * (Chart/list cards — statistics-graph, todo-list, logbook — keep it: their
 * graph labels are canvas-drawn, but the colour reaches the card title.)
 */
export const NO_TEXT_COLOR_TYPES = new Set([
  // alarm-panel: the title and Arm buttons DO follow a colour (measured 2026.11),
  // but this set also gates Threshold's Text Color target, which was not
  // verified there — left hidden until it is.
  'alarm-panel', 'area', 'media-control', 'picture-elements', 'picture-entity',
  'picture-glance',
  // HA 2026.11 date card (module-effect audit, UIX 9)
  'date',
  // alert card: Font text colour and Threshold text colour dead (same audit)
  'alert',
]);

/**
 * Cards where the Icon Color module's icon-size control is offered —
 * ALLOWLIST, live-verified (v0.9 probe): `--mdc-icon-size`/`--ha-icon-size`
 * on ha-card resizes exactly the main state icon on entity/sensor/
 * picture-glance; tile needs the `ha-tile-icon { --mdc-icon-size }`
 * companion block. Deliberately absent: button (icon auto-scales; native
 * `icon_height` config exists), light/media-control (the variable only
 * reaches their more-info/secondary icons — a harmful side effect),
 * alarm-panel (no effect), glance (size works but the whole Icon Color
 * module is hidden there — see NO_ICON_COLOR_TYPES).
 */
export const ICON_SIZE_TYPES = new Set([
  'tile', 'entity', 'sensor', 'picture-glance',
]);

/** The Icon size slider's top end. A tile's circle grows with the glyph
 *  (1.5x) and a sections-view tile has a fixed row height of 56px: a 36px
 *  glyph (54px circle) is the largest that still fits it (measured, HA
 *  2026.11); past that the circle overflows into the next card. */
export const DEFAULT_ICON_SIZE_MAX = 64;
export const TILE_ICON_SIZE_MAX = 36;

// Font module (issue #25): sets font-size/weight/color/family on ha-card,
// which cascades via plain CSS inheritance into most cards' text (verified
// against HA frontend source for hui-entities-card's row component,
// hui-markdown-card, hui-glance-card — none override font-size). heading is
// excluded because it already has a dedicated, more capable Heading Style
// control over the same `.title p`/`.title ha-icon` text. iframe/webpage/map
// render no HA-templated text at all for card-mod to reach.
export const NO_FONT_TYPES = new Set([
  'heading', 'iframe', 'webpage', 'map',
  // a picture card has no text at all (module_effect_audit)
  'picture',
]);

/** Cards whose own stylesheet overrides a plain filter transition (see
 *  the filter block in css-generator). */
export const TRANSITION_IMPORTANT_TYPES = new Set(['tile', 'sensor', 'entity', 'area', 'alert']);

/**
 * Card types whose title is rendered through ha-card's header slot
 * (`.card-header`), styled inside ha-card's own shadow stylesheet via
 * `--ha-card-header-{font-size,color,font-family}` — a plain inherited
 * font-size never reaches it. Verified live for entities (slotted h1) and
 * glance (h1 inside ha-card's shadow root); the rest use the identical
 * `ha-card .header=` mechanism.
 * (picture-glance left this list in v0.11: its title isn't a card header —
 * the module-effect audit measured header size and colour dead there; the
 * parser still claims the variables in older output.)
 */
export const HEADER_TITLE_CARD_TYPES = new Set([
  'entities', 'glance', 'history-graph', 'statistics-graph', 'statistic',
  'calendar', 'todo-list', 'shopping-list', 'logbook',
  // v0.11 measured on 2026.11: markdown's title and alarm-panel's title are
  // the same ha-card header (h1.card-header) and follow the header variables.
  'markdown', 'alarm-panel',
]);

/**
 * Everything the code asks about a card, answered once per profile key.
 * Built-in cards answer exactly as the sets above; a registered custom
 * profile overrides; an unknown type keeps the default (every module — D7's
 * notice is a later chunk).
 */
export interface CardCaps {
  key: string;
  /** True when a custom-card profile answered (not the built-in sets). */
  custom: boolean;
  isEntities: boolean;
  isHeading: boolean;
  isLight: boolean;
  isContainer: boolean;
  /** Container with a `cards: []` list the panel offers child sections for. */
  stylableChildren: boolean;
  /** Which panel modules show. */
  modules: Record<ProfileModule, boolean>;
  /** Font's colour picker / size slider reach something. */
  fontColor: boolean;
  fontSize: boolean;
  /** Font's weight select reaches something. */
  fontWeight: boolean;
  /** Icon Color offers its size control. */
  iconSize: boolean;
  /** …and how far its slider goes. */
  iconSizeMax: number;
  /** Card is assumed to have an on/off state when no entity says otherwise. */
  stateAwareByDefault: boolean;
  /** Title lives in ha-card's header slot (Font writes header variables). */
  headerTitle: boolean;
  /** Filter's transition needs `!important` here. */
  transitionImportant: boolean;
  /** A markdown card with `text_only`: HA's own `.text-only` rule strips the
   *  card's background, border and shadow and out-ranks a plain declaration,
   *  so Background / Border / Threshold write theirs `!important`. */
  textOnlyCard: boolean;
  /** Icon Color is a size-only control (the card's icons can't take its
   *  colour — Mushroom chips). */
  iconColorless: boolean;
  /** The profile writes Accent as `R, G, B` variables (Mushroom): a colour
   *  with no exact form can't be written — the modules say so. */
  accentTriplet: boolean;
  /** Does a Threshold "Apply to" property do anything here? */
  thresholdProperty(property: string): boolean;
}

function buildCaps(
  key: string,
  custom: boolean,
  m: Record<ProfileModule, boolean>,
  f: {
    fontColor: boolean;
    fontSize: boolean;
    fontWeight?: boolean;
    iconSize: boolean;
    stateAwareByDefault: boolean;
    headerTitle?: boolean;
    transitionImportant?: boolean;
    iconColorless?: boolean;
    accentTriplet?: boolean;
    textOnlyCard?: boolean;
  },
): CardCaps {
  const { headerTitle, transitionImportant, iconColorless, accentTriplet, textOnlyCard, fontWeight, ...flags } = f;
  return {
    key,
    custom,
    isEntities: !custom && key === 'entities',
    isHeading: !custom && key === 'heading',
    isLight: !custom && key === 'light',
    isContainer: !custom && CONTAINER_CARD_TYPES.has(key),
    stylableChildren: !custom && STYLABLE_CHILDREN_CARD_TYPES.has(key),
    modules: m,
    ...flags,
    iconSizeMax: !custom && key === 'tile' ? TILE_ICON_SIZE_MAX : DEFAULT_ICON_SIZE_MAX,
    fontWeight: fontWeight !== false,
    headerTitle: custom ? !!headerTitle : HEADER_TITLE_CARD_TYPES.has(key),
    transitionImportant: custom ? !!transitionImportant : TRANSITION_IMPORTANT_TYPES.has(key),
    iconColorless: !!iconColorless,
    accentTriplet: !!accentTriplet,
    textOnlyCard: !!textOnlyCard,
    thresholdProperty(property: string): boolean {
      switch (property) {
        case 'icon-color': return m.iconColor && !iconColorless;
        case 'accent-color': return m.accentColor;
        case 'background': return m.background;
        case 'border-color': return m.border;
        case 'text-color': return m.font && f.fontColor;
        default: return true;
      }
    },
  };
}

/** Whether a card config sets `key` to something (a non-empty value). */
function configSets(config: Record<string, unknown> | null | undefined, key: string): boolean {
  const v = config?.[key];
  return v !== undefined && v !== null && v !== '' && v !== false;
}

/**
 * The capabilities lookup — the ONE place per-card-type gating is decided.
 *
 * `config` (optional) is the card's own config: a custom profile can hide a
 * module depending on it (`configGates` — e.g. Mushroom's Accent while the
 * card sets `icon_color`). Callers without a config get the config-free answer.
 */
export function capsFor(profileKey: string | undefined, config?: Record<string, unknown> | null): CardCaps {
  const key = profileKey ?? '';
  const profile = getCustomCardProfile(key);
  if (profile) {
    const modules: Record<ProfileModule, boolean> = {
      iconColor: true, accentColor: true, font: true, threshold: true,
      background: true, border: true, animation: true, headingStyle: false, filter: true,
      ...profile.modules,
    };
    for (const gate of profile.configGates ?? []) {
      if (configGateHits(config, gate)) for (const m of gate.hide) modules[m] = false;
    }
    return buildCaps(key, true, modules, {
      fontColor: profile.fontColor ?? true,
      fontSize: profile.fontSize ?? true,
      iconSize: profile.iconSize ?? false,
      stateAwareByDefault: profile.stateAware ?? true,
      headerTitle: profile.headerTitle,
      transitionImportant: profile.transitionImportant,
      iconColorless: profile.emitters?.iconSize?.colorless,
      accentTriplet: !!profile.emitters?.accent && profile.emitters.accent.triplet !== false,
    });
  }
  const entities = key === 'entities';
  return buildCaps(
    key,
    false,
    {
      iconColor: !entities && !NO_ICON_COLOR_TYPES.has(key),
      accentColor: key !== 'heading' && !entities && !NO_ACCENT_TYPES.has(key),
      font: !NO_FONT_TYPES.has(key),
      threshold: !entities && !NO_THRESHOLD_TYPES.has(key),
      background: !NO_BACKGROUND_TYPES.has(key),
      border: !NO_BORDER_TYPES.has(key),
      animation: !NO_ANIMATION_TYPES.has(key),
      headingStyle: key === 'heading',
      filter: true,
    },
    {
      fontColor: !NO_TEXT_COLOR_TYPES.has(key),
      fontSize: !NO_FONT_SIZE_TYPES.has(key),
      fontWeight: !NO_FONT_WEIGHT_TYPES.has(key),
      iconSize: ICON_SIZE_TYPES.has(key),
      stateAwareByDefault: !NON_STATE_CARD_TYPES.has(key),
      textOnlyCard: key === 'markdown' && configSets(config, 'text_only'),
    },
  );
}

export const showsAccentColor = (cardType: string, config?: Record<string, unknown> | null): boolean =>
  capsFor(cardType, config).modules.accentColor;

/**
 * Which Threshold Colors "Apply to" properties do something on a card type —
 * the same gating as the module each property mirrors, so Threshold never
 * offers a colour the matching module hides as dead.
 */
export function thresholdPropertyAllowed(
  property: string,
  cardType: string,
  config?: Record<string, unknown> | null,
): boolean {
  return capsFor(cardType, config).thresholdProperty(property);
}

/** Domains whose entities report `on` / `off` as their state, so
 *  is_state(x, 'on'/'off') is meaningful even while the state string is
 *  momentarily `unavailable` / `unknown` (which is why the domain, not just
 *  the current state, decides). Home Assistant's state lists: switch, light,
 *  binary_sensor, input_boolean, fan, humidifier, siren, remote, automation,
 *  script — on/off; group — on/off for the usual switch/light groups. */
const BINARY_DOMAINS = [
  'switch', 'light', 'binary_sensor', 'input_boolean', 'fan', 'humidifier',
  'siren', 'remote', 'automation', 'script', 'group',
];

/** Domains that never report `on`, whatever their current state (HA's own
 *  state lists): lock locked/unlocked/…, cover open/closed/opening/closing,
 *  climate / water_heater an HVAC / operation mode (can be `off`, never `on`),
 *  alarm_control_panel disarmed/armed_home/armed_away/…, person
 *  home/not_home/<zone>, timer idle/active/paused, input_button a timestamp.
 *  An "ON" condition can never match there, so they are decided by the domain
 *  alone — a climate that happens to be `off` right now is not state-aware. */
const NEVER_ON_OFF_DOMAINS = new Set([
  'lock', 'cover', 'climate', 'water_heater', 'alarm_control_panel', 'person', 'timer', 'input_button',
]);

/** The subset of NEVER_ON_OFF_DOMAINS whose state CAN be `off` (a mode), so
 *  "Only while entity is OFF" is real there while "ON" never matches. */
const OFF_ONLY_DOMAINS = new Set(['climate', 'water_heater']);

/** What an entity's state can match: both `on` and `off`, only `off`, or
 *  neither. */
export type OwnStateKind = 'on-off' | 'off-only' | 'none';

/** True for an entity that can be `off` but never `on` (climate, water_heater). */
export function isOffOnlyEntity(entityId: string | undefined): boolean {
  return !!entityId && OFF_ONLY_DOMAINS.has(entityId.split('.')[0]);
}

/** Same three-way answer from what a module receives: the panel's boolean
 *  `stateAware` plus the card's entity id. No entity stays 'none'. */
export function stateKindFor(stateAware: boolean, cardEntity: string | undefined): OwnStateKind {
  if (stateAware) return 'on-off';
  return isOffOnlyEntity(cardEntity) ? 'off-only' : 'none';
}

/**
 * Whether a card config has an entity of its own — the one `config.entity`
 * refers to inside a card-mod template. A missing or empty `entity` makes
 * `is_state(config.entity, …)` fail to render, and the style engine then
 * drops EVERY rule of the card's style, so nothing may emit it for such a card.
 */
export function hasOwnEntity(config?: Record<string, unknown> | null): boolean {
  const entity = config?.entity;
  return typeof entity === 'string' && entity.trim() !== '';
}

/**
 * Whether a card's own entity meaningfully has an on/off state to condition
 * on. Domains that never report on/off say no (see NEVER_ON_OFF_DOMAINS); the
 * rest mirror the old cms-panel._isStateAware. With no entity id it
 * only answers for the card TYPE; the panels additionally require
 * hasOwnEntity() before offering "own entity is ON / OFF".
 */
export function isStateAware(
  cardType: string | undefined,
  entityId: string | undefined,
  hass?: { states?: Record<string, { state: string }> },
): boolean {
  // The domain alone settles it for an entity that never reports on/off —
  // with or without hass, and whatever its current state is.
  if (entityId && NEVER_ON_OFF_DOMAINS.has(entityId.split('.')[0])) return false;
  if (!entityId || !hass?.states) {
    return capsFor(cardType).stateAwareByDefault;
  }
  const entity = hass.states[entityId];
  if (!entity) return capsFor(cardType).stateAwareByDefault;

  const domain = entityId.split('.')[0];
  return BINARY_DOMAINS.includes(domain) || ['on', 'off'].includes(entity.state);
}

/**
 * The state-aware flag both panels (top level and stack children) hand to the
 * modules: the card's own entity has an on/off state to condition on. No entity
 * of its own → no state of its own to react to, whatever the type.
 */
export function panelStateAware(
  profileKey: string | undefined,
  config: Record<string, unknown> | null | undefined,
  hass?: { states?: Record<string, { state: string }> },
): boolean {
  return hasOwnEntity(config) && isStateAware(profileKey, config?.entity as string | undefined, hass);
}

/** The three-way answer for a card's own entity, from the card config —
 *  `isStateAware` stays the "ON and OFF can both match" boolean. */
export function ownStateKind(
  profileKey: string | undefined,
  config: Record<string, unknown> | null | undefined,
  hass?: { states?: Record<string, { state: string }> },
): OwnStateKind {
  return stateKindFor(panelStateAware(profileKey, config, hass), hasOwnEntity(config) ? (config?.entity as string) : undefined);
}

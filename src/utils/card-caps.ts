/**
 * card-caps.ts — per-card-type capability knowledge, shared between the
 * top-level panel and the per-child sections of container cards
 * (cms-child-card-section). Extracted from cms-panel.ts so the two can't
 * drift: a module hidden as "does nothing on this card type" at the top
 * level must be hidden for the same card type inside a stack too.
 *
 * The sets are the product of live verification, not guesses — see
 * docs/CARD_SUPPORT_MATRIX.md and the notes next to each entry.
 */

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
]);

/**
 * A card-level text colour (Font's colour picker, Threshold's Text Color)
 * reaches no visible text on these — their text carries its own colour
 * (measured, see NO_ACCENT_TYPES). Font's size/weight still work there.
 */
export const NO_TEXT_COLOR_TYPES = new Set([
  'alarm-panel', 'area', 'media-control', 'picture-elements', 'statistics-graph',
  'todo-list', 'logbook', 'picture-entity',
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

export const showsAccentColor = (cardType: string): boolean =>
  cardType !== 'heading' && cardType !== 'entities' && !NO_ACCENT_TYPES.has(cardType);

/**
 * Which Threshold Colors "Apply to" properties do something on a card type —
 * the same gating as the module each property mirrors, so Threshold never
 * offers a colour the matching module hides as dead.
 */
export function thresholdPropertyAllowed(property: string, cardType: string): boolean {
  switch (property) {
    case 'icon-color': return cardType !== 'entities' && !NO_ICON_COLOR_TYPES.has(cardType);
    case 'accent-color': return showsAccentColor(cardType);
    case 'background': return !NO_BACKGROUND_TYPES.has(cardType);
    case 'border-color': return !NO_BORDER_TYPES.has(cardType);
    case 'text-color': return !NO_FONT_TYPES.has(cardType) && !NO_TEXT_COLOR_TYPES.has(cardType);
    default: return true;
  }
}

/** Domains whose entities carry a binary on/off state usable in an
 *  is_state(x, 'on'/'off') condition even when the state string itself
 *  isn't literally on/off right now. */
const BINARY_DOMAINS = [
  'switch', 'light', 'binary_sensor', 'input_boolean', 'lock',
  'fan', 'cover', 'climate', 'alarm_control_panel', 'person',
  'automation', 'script', 'timer', 'group', 'input_button',
];

/**
 * Whether a card's own entity meaningfully has an on/off state to condition
 * on. Mirrors the old cms-panel._isStateAware exactly.
 */
export function isStateAware(
  cardType: string | undefined,
  entityId: string | undefined,
  hass?: { states?: Record<string, { state: string }> },
): boolean {
  if (!entityId || !hass?.states) {
    return !NON_STATE_CARD_TYPES.has(cardType ?? '');
  }
  const entity = hass.states[entityId];
  if (!entity) return !NON_STATE_CARD_TYPES.has(cardType ?? '');

  const domain = entityId.split('.')[0];
  return BINARY_DOMAINS.includes(domain) || ['on', 'off'].includes(entity.state);
}

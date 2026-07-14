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
]);

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

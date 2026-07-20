/**
 * preview-map.ts — pure mapping logic for the click-to-edit preview picker
 * (v0.9.0). Given the ancestor chain of a hovered element inside the live
 * preview card, decides WHICH studio module controls that element.
 *
 * Deliberately conservative: a wrong-but-plausible answer ("that's the Font
 * module" when it isn't) is worse than falling back to Background/Advanced,
 * so every specific rule is gated on the card types where the panel actually
 * renders that module (see card-caps.ts + cms-panel's _show* getters — a
 * picker must never point at a module that isn't on screen).
 */

import {
  NO_ICON_COLOR_TYPES,
  NO_BACKGROUND_TYPES,
  NO_FONT_TYPES,
} from './card-caps.js';

/** One element of the hovered element's ancestor chain (lowercased tag). */
export interface PickChainElement {
  tag: string;
  id: string;
  classes: string[];
}

/** What the picker resolved a hovered element to. */
export interface PickTarget {
  /** cms-* module tag name, e.g. 'cms-font-module'. */
  module: string;
  /** Human label shown in the hover chip, e.g. 'Font'. */
  label: string;
  /** For entities-card rows: the row's entity_id (resolved by the caller —
   *  the pure mapper only sees tags/classes, not entity data). */
  rowEntity?: string;
}

/** A resolved target plus WHICH chain element it matched — the picker
 *  highlights that element's rect rather than the deepest text node's. */
export interface PickMatch {
  target: PickTarget;
  /** Index into the chain (0 = deepest) of the element to highlight. */
  index: number;
}

/** Entity-row custom elements on an entities card (hui-sensor-entity-row,
 *  hui-toggle-entity-row, hui-section-row, third-party *-entity-row, …). */
export const ENTITY_ROW_TAG_RE = /-entity-row$|^hui-.*-row$/;

/** Icon-bearing elements the Icon Color module recolors. */
const ICON_TAGS = new Set(['ha-state-icon', 'state-badge', 'ha-tile-icon']);

/** ha-gauge internals the Accent Color module drives on gauge cards. */
const GAUGE_CLASSES = new Set(['value-text', 'needle', 'dial']);

/** Text-bearing markers the Font module's ha-card cascade reaches. `title`
 *  covers gauge/thermostat/humidifier `p.title` and picture-glance's
 *  `div.title` (the Font module emits a dedicated `.title` block for
 *  gauge/thermostat); on heading cards the Heading Style rule outranks it. */
const FONT_CLASSES = new Set([
  'card-header', 'header', 'name', 'value', 'measurement', 'info', 'title',
]);
/** Tags the FONT_CLASSES markers are trusted on. SVG internals reuse the
 *  same names for non-text parts (the light card's round-slider handle is
 *  `g.value.handle`) — those must not read as Font. */
const FONT_CLASS_TAGS = new Set([
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'td', 'th', 'li',
]);
/** Extra text containers that only read as "text" INSIDE a generic entity
 *  row (too generic to trust elsewhere). */
const GENERIC_ROW_TEXT_CLASSES = new Set(['text-content', 'secondary', 'state']);

/** Per-card text containers that carry none of the generic markers —
 *  verified against each card's live DOM (picker coverage probe): the
 *  button card's name/state are bare `<span>`/`span.state`, glance entities
 *  are `div.entity`, media-control titles sit in hui-marquee /
 *  div.media-info / div.icon-name, picture footers are div.footer/div.box. */
const CARD_TEXT_MATCHERS: Record<string, (el: PickChainElement) => boolean> = {
  button: (el) => el.tag === 'span',
  markdown: (el) => el.tag === 'ha-markdown' || el.tag === 'ha-markdown-element',
  glance: (el) => el.classes.includes('entity'),
  'media-control': (el) =>
    el.tag === 'hui-marquee' ||
    el.classes.includes('media-info') ||
    el.classes.includes('icon-name'),
  'picture-entity': (el) => el.classes.includes('footer'),
  'picture-glance': (el) => el.classes.includes('box'),
};

/** Chain-wide context computed once per lookup. */
interface ChainContext {
  /** The card's `type:` — lets rules match card-specific DOM shapes. */
  cardType: string;
  /** Index of the nearest `.title` ancestor (heading card title), or -1. */
  titleIndex: number;
  /** Index of the nearest hui-generic-entity-row ancestor, or -1. */
  genericRowIndex: number;
}

interface PickRule {
  /** Does this chain element (at index i) trigger the rule? */
  test(el: PickChainElement, i: number, ctx: ChainContext): boolean;
  /** Resolve the target for this card type — null means "this module is
   *  hidden on this card type, fall through to later rules/elements". */
  target(cardType: string): PickTarget | null;
  /** Which chain index to highlight (defaults to the matched element). */
  highlightIndex?(i: number, ctx: ChainContext): number;
}

/**
 * The rule table, in priority order. For each chain element (deepest first),
 * rules are tried top to bottom; the first rule that both matches AND
 * resolves to a visible module wins.
 */
const RULES: PickRule[] = [
  {
    // Icons: ha-state-icon / state-badge, plus ha-icon when it's NOT part of
    // a heading card's .title (those belong to Heading Style below).
    test: (el, i, ctx) =>
      ICON_TAGS.has(el.tag) ||
      (el.tag === 'ha-icon' && (ctx.titleIndex === -1 || i > ctx.titleIndex)),
    target: (cardType) =>
      // Mirror cms-panel._showIconColor: hidden on NO_ICON_COLOR_TYPES and on
      // entities cards (rows carry their own per-row icon color instead — the
      // walk falls through to the entity-row rule there).
      NO_ICON_COLOR_TYPES.has(cardType) || cardType === 'entities'
        ? null
        : { module: 'cms-icon-color-module', label: 'Icon Color' },
  },
  {
    // Heading card title (.title wraps the p + ha-icon) → Heading Style.
    test: (_el, i, ctx) => ctx.titleIndex !== -1 && i <= ctx.titleIndex,
    target: (cardType) =>
      cardType === 'heading'
        ? { module: 'cms-heading-style-module', label: 'Heading Style' }
        : null,
    highlightIndex: (_i, ctx) => ctx.titleIndex,
  },
  {
    // ha-gauge internals (value text / needle / dial) → Accent Color.
    test: (el) => el.tag === 'ha-gauge' || el.classes.some((c) => GAUGE_CLASSES.has(c)),
    target: (cardType) =>
      // Accent module is hidden on heading + entities cards (cms-panel).
      cardType === 'heading' || cardType === 'entities'
        ? null
        : {
            module: 'cms-accent-color-module',
            label: cardType === 'gauge' ? 'Gauge / Accent Color' : 'Accent Color',
          },
  },
  {
    // Thermostat temperature dial: the Accent Color module drives it via
    // --control-circular-slider-color + the state-climate-* colors. The
    // humidifier's dial gets no accent variables — not matched there, so it
    // falls through to the card surface.
    test: (el) => el.tag === 'ha-control-circular-slider',
    target: (cardType) =>
      cardType === 'thermostat'
        ? { module: 'cms-accent-color-module', label: 'Accent Color' }
        : null,
  },
  {
    // Sensor card's inline graph: the line is stroked with --accent-color.
    test: (el) => el.tag === 'hui-graph-base' || el.tag === 'hui-graph-header-footer',
    target: (cardType) =>
      cardType === 'sensor'
        ? { module: 'cms-accent-color-module', label: 'Graph / Accent Color' }
        : null,
  },
  {
    // Tile feature rows (sliders/toggles below the info block): their
    // --feature-color derives from --tile-color, which Accent drives.
    test: (el) => el.tag === 'hui-card-features' || el.tag === 'hui-card-feature',
    target: (cardType) =>
      cardType === 'tile'
        ? { module: 'cms-accent-color-module', label: 'Features / Accent Color' }
        : null,
  },
  {
    // Text: card header, tile info block, common text-carrying markers
    // (trusted only on real text tags), text containers inside a generic
    // entity row, and the per-card shapes from CARD_TEXT_MATCHERS.
    test: (el, i, ctx) =>
      el.tag === 'ha-tile-info' ||
      el.id === 'info' ||
      (FONT_CLASS_TAGS.has(el.tag) && el.classes.some((c) => FONT_CLASSES.has(c))) ||
      (ctx.genericRowIndex !== -1 &&
        i < ctx.genericRowIndex &&
        el.classes.some((c) => GENERIC_ROW_TEXT_CLASSES.has(c))) ||
      (CARD_TEXT_MATCHERS[ctx.cardType]?.(el) ?? false),
    target: (cardType) =>
      NO_FONT_TYPES.has(cardType) ? null : { module: 'cms-font-module', label: 'Font' },
  },
  {
    // A row element on an entities card → the per-row styling module.
    // rowEntity is resolved by the caller (the picker), which can see the
    // actual DOM order and the card's entity list — this mapper can't.
    test: (el) => ENTITY_ROW_TAG_RE.test(el.tag),
    target: (cardType) =>
      cardType === 'entities'
        ? { module: 'cms-entities-rows-module', label: 'Entity Rows' }
        : null,
  },
];

/** The catch-all: the card surface itself (or anything unrecognised). */
function fallbackTarget(cardType: string): PickTarget {
  return NO_BACKGROUND_TYPES.has(cardType)
    ? { module: 'cms-advanced-module', label: 'Advanced CSS' }
    : { module: 'cms-background-module', label: 'Background & card surface' };
}

function buildContext(chain: PickChainElement[], cardType: string): ChainContext {
  return {
    cardType,
    titleIndex: chain.findIndex((el) => el.classes.includes('title')),
    genericRowIndex: chain.findIndex((el) => el.tag === 'hui-generic-entity-row'),
  };
}

/**
 * Full resolution: target + which chain element to highlight.
 *
 * @param chain the hovered element's ancestor chain, deepest first, ending at
 *              the preview card root; tags lowercased.
 * @param cardType the card's `type:` (e.g. 'tile', 'gauge', 'entities').
 */
export function mapElementToMatch(
  chain: PickChainElement[],
  cardType: string,
): PickMatch | null {
  if (!chain.length) return null;
  const ctx = buildContext(chain, cardType);

  for (let i = 0; i < chain.length; i++) {
    const el = chain[i];
    for (const rule of RULES) {
      if (!rule.test(el, i, ctx)) continue;
      const target = rule.target(cardType);
      if (!target) continue; // module hidden for this card type — keep walking
      return { target, index: rule.highlightIndex ? rule.highlightIndex(i, ctx) : i };
    }
  }

  // Nothing specific matched → the card surface. Highlight ha-card if the
  // chain has one, else the outermost element.
  const haCardIndex = chain.findIndex((el) => el.tag === 'ha-card');
  return {
    target: fallbackTarget(cardType),
    index: haCardIndex !== -1 ? haCardIndex : chain.length - 1,
  };
}

/** Target-only convenience wrapper (the unit-tested surface). */
export function mapElementToTarget(
  chain: PickChainElement[],
  cardType: string,
): PickTarget | null {
  return mapElementToMatch(chain, cardType)?.target ?? null;
}

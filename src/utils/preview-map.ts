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

import { capsFor } from './card-caps.js';
import { getCustomCardProfile, emitKeyOf, type ClickRule, type ProfileModule } from './custom-card-profiles.js';

/** Viewport rect (client coordinates). */
export interface PickRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** One element of the hovered element's ancestor chain (lowercased tag). The
 *  geometry is optional (pure callers/tests omit it): `rect` is the element's
 *  box, `textRect` the box of its own text (null: it has none). */
export interface PickChainElement {
  tag: string;
  id: string;
  classes: string[];
  rect?: PickRect;
  textRect?: PickRect | null;
}

/** The pointer and what is under it, for rules that need geometry. */
export interface PickPointer {
  x: number;
  y: number;
  /** Every (non-overlay) element of the card whose box contains the point. */
  under?: PickChainElement[];
}

const inRect = (r: PickRect, x: number, y: number, slop = 0): boolean =>
  x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop;

/** A block wider than its label only counts where the text itself is. Callers
 *  without geometry (pure tests) keep the plain match. */
const onText = (el: PickChainElement, p?: PickPointer): boolean =>
  !p || !el.rect || (!!el.textRect && inRect(el.textRect, p.x, p.y, 2));

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
  /** Highlight this box instead (a match on an element outside the chain). */
  rect?: PickRect;
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
 *  are `div.entity`. */
const CARD_TEXT_MATCHERS: Record<string, (el: PickChainElement) => boolean> = {
  button: (el) => el.tag === 'span',
  markdown: (el) => el.tag === 'ha-markdown' || el.tag === 'ha-markdown-element',
  glance: (el) => el.classes.includes('entity'),
};

/** Text parts whose element is wider than the words (HA 2026.11 DOM): only
 *  the words read as Font, the blank beside them is the card surface. `up` is
 *  the element's parent in the chain. */
const CARD_TEXT_ONLY: Record<string, (el: PickChainElement, up?: PickChainElement) => boolean> = {
  date: (el) => el.classes.includes('date-text'),
  area: (el) => el.id === 'info',
  'media-control': (el, up) =>
    el.classes.includes('media-info') ||
    el.classes.includes('icon-name') ||
    (el.tag === 'span' && !!up?.classes.includes('marquee-inner')) ||
    (el.tag === 'div' && !el.classes.length && !!up?.classes.includes('icon-name')),
  'picture-entity': (el, up) =>
    el.tag === 'div' && !!up?.classes.includes('footer'),
  'picture-elements': (el, up) => el.tag === 'div' && up?.tag === 'hui-state-label-element',
};

/** Icon parts beyond ICON_TAGS: picture-glance's entity buttons. */
const CARD_ICON_MATCHERS: Record<string, (el: PickChainElement) => boolean> = {
  'picture-glance': (el) => el.tag === 'ha-icon-button',
};

/** Parts nothing styles (a wrapper spanning the card, an icon the card's
 *  modules don't reach): the walk stops there and the card-level fallback
 *  answers, instead of a class like `header` reading as Font. */
const CARD_SURFACE_PARTS: Record<string, (el: PickChainElement) => boolean> = {
  statistic: (el) => ['header', 'info', 'icon'].some((c) => el.classes.includes(c)),
  area: (el) => el.classes.includes('header'),
};

/** Panel module tag → the profile module that shows/hides it (click rules). */
const MODULE_OF_TAG: Record<string, ProfileModule> = {
  'cms-font-module': 'font',
  'cms-icon-color-module': 'iconColor',
  'cms-accent-color-module': 'accentColor',
  'cms-background-module': 'background',
  'cms-border-module': 'border',
  'cms-threshold-module': 'threshold',
  'cms-filter-module': 'filter',
  'cms-animation-module': 'animation',
  'cms-heading-style-module': 'headingStyle',
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
  target(cardType: string, config?: Record<string, unknown> | null): PickTarget | null;
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
      (CARD_ICON_MATCHERS[emitKeyOf(ctx.cardType)]?.(el) ?? false) ||
      (el.tag === 'ha-icon' && (ctx.titleIndex === -1 || i > ctx.titleIndex)),
    target: (cardType) =>
      // Mirror cms-panel._showIconColor: hidden on NO_ICON_COLOR_TYPES and on
      // entities cards (rows carry their own per-row icon color instead — the
      // walk falls through to the entity-row rule there).
      !capsFor(cardType).modules.iconColor
        ? null
        : { module: 'cms-icon-color-module', label: 'Icon Color' },
  },
  {
    // Heading card title (.title wraps the p + ha-icon) → Heading Style.
    test: (_el, i, ctx) => ctx.titleIndex !== -1 && i <= ctx.titleIndex,
    target: (cardType) =>
      capsFor(cardType).modules.headingStyle
        ? { module: 'cms-heading-style-module', label: 'Heading Style' }
        : null,
    highlightIndex: (_i, ctx) => ctx.titleIndex,
  },
  {
    // ha-gauge internals (value text / needle / dial) → Accent Color.
    test: (el) => el.tag === 'ha-gauge' || el.classes.some((c) => GAUGE_CLASSES.has(c)),
    target: (cardType, config) =>
      // Accent is hidden on heading, entities and the cards that never read it.
      !capsFor(cardType, config).modules.accentColor
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
      // a profile's `emitAs` borrows the built-in card's text matchers (D4)
      (CARD_TEXT_MATCHERS[emitKeyOf(ctx.cardType)]?.(el) ?? false),
    target: (cardType) =>
      !capsFor(cardType).modules.font ? null : { module: 'cms-font-module', label: 'Font' },
  },
  {
    // A row element on an entities card → the per-row styling module.
    // rowEntity is resolved by the caller (the picker), which can see the
    // actual DOM order and the card's entity list — this mapper can't.
    test: (el) => ENTITY_ROW_TAG_RE.test(el.tag),
    target: (cardType) =>
      capsFor(cardType).isEntities
        ? { module: 'cms-entities-rows-module', label: 'Entity Rows' }
        : null,
  },
];

/** The catch-all: the card surface itself (or anything unrecognised) — the
 *  first module that styles the card as a whole and is on screen for it. */
function fallbackTarget(cardType: string, config?: Record<string, unknown> | null): PickTarget {
  const shown = capsFor(cardType, config).modules;
  if (shown.background) return { module: 'cms-background-module', label: 'Background & card surface' };
  if (shown.border) return { module: 'cms-border-module', label: 'Border & Radius' };
  if (shown.filter) return { module: 'cms-filter-module', label: 'Visual Filters' };
  return { module: 'cms-advanced-module', label: 'Advanced CSS' };
}

function buildContext(chain: PickChainElement[], cardType: string): ChainContext {
  return {
    cardType,
    // Heading cards: `.content.title`, or `.content.subtitle` for
    // `heading_style: subtitle` — both are the Heading Style module's.
    titleIndex: chain.findIndex(
      (el) => el.classes.includes('title') || (capsFor(cardType).isHeading && el.classes.includes('subtitle')),
    ),
    genericRowIndex: chain.findIndex((el) => el.tag === 'hui-generic-entity-row'),
  };
}

/**
 * Full resolution: target + which chain element to highlight.
 *
 * @param chain the hovered element's ancestor chain, deepest first, ending at
 *              the preview card root; tags lowercased.
 * @param cardType the card's profile key (profileKeyOf(config); e.g. 'tile',
 *                 'gauge', 'entities', 'custom:bubble-card/button').
 */
export function mapElementToMatch(
  chain: PickChainElement[],
  cardType: string,
  config?: Record<string, unknown> | null,
  pointer?: PickPointer,
): PickMatch | null {
  if (!chain.length) return null;
  const ctx = buildContext(chain, cardType);

  // Entities card: anywhere inside a row — icon, name, state, toggle — is
  // that row (its section holds the row's icon/text colour and font). The
  // OUTERMOST row element is the row itself; HA nests a
  // hui-generic-entity-row inside every row, which the same pattern matches.
  if (capsFor(cardType).isEntities) {
    for (let i = chain.length - 1; i >= 0; i--) {
      if (ENTITY_ROW_TAG_RE.test(chain[i].tag)) {
        return { target: { module: 'cms-entities-rows-module', label: 'Entity Rows' }, index: i };
      }
    }
  }

  // A custom-card profile's own click-to-edit rows win over the generic walk.
  // Order: ancestor rows (deepest element first, like the rule table below),
  // then `under` rows (elements under the pointer outside the chain), then
  // `last` rows (the card surface). A row whose module the panel hides for
  // this card (profile or config gate) is skipped — the picker never points
  // at a module that isn't on screen.
  const clicks = getCustomCardProfile(cardType)?.clickToEdit;
  if (clicks?.length) {
    const shown = capsFor(cardType, config).modules;
    const usable = (r: ClickRule): boolean =>
      (!!r.tag || !!r.className) && (!MODULE_OF_TAG[r.module] || shown[MODULE_OF_TAG[r.module]]);
    const rowMatches = (r: ClickRule, el: PickChainElement): boolean =>
      (!r.tag || r.tag === el.tag) && (!r.className || el.classes.includes(r.className));
    // `textOnly` needs geometry; callers that give none keep the plain match.
    const textOk = (r: ClickRule, el: PickChainElement): boolean =>
      !r.textOnly || onText(el, pointer);
    const walk = (rows: ClickRule[]): PickMatch | null => {
      for (let i = 0; i < chain.length; i++) {
        const hit = rows.find((r) => rowMatches(r, chain[i]) && textOk(r, chain[i]));
        // a text rule highlights the text itself, not its full-width block
        if (hit) return { target: { module: hit.module, label: hit.label }, index: i, ...(hit.textOnly && chain[i].textRect ? { rect: chain[i].textRect! } : {}) };
      }
      return null;
    };
    const plain = clicks.filter((r) => usable(r) && !r.under && !r.last);
    const hit = walk(plain);
    if (hit) return hit;
    for (const r of clicks.filter((x) => usable(x) && x.under)) {
      const el = pointer?.under?.find((u) => rowMatches(r, u) && u.rect && inRect(u.rect, pointer.x, pointer.y));
      if (el) return { target: { module: r.module, label: r.label }, index: 0, rect: el.rect };
    }
    const last = walk(clicks.filter((r) => usable(r) && r.last));
    if (last) return last;
  }

  const key = emitKeyOf(cardType);
  const haCardIndex = chain.findIndex((el) => el.tag === 'ha-card');
  const surface = (): PickMatch => ({
    target: fallbackTarget(cardType, config),
    index: haCardIndex !== -1 ? haCardIndex : chain.length - 1,
  });
  for (let i = 0; i < chain.length; i++) {
    const el = chain[i];
    if (CARD_SURFACE_PARTS[key]?.(el)) return surface();
    if (CARD_TEXT_ONLY[key]?.(el, chain[i + 1])) {
      // off the words: not Font here, and no generic marker (`info`, …) may claim it
      if (!onText(el, pointer) || !capsFor(cardType).modules.font) continue;
      return { target: { module: 'cms-font-module', label: 'Font' }, index: i, ...(el.textRect ? { rect: el.textRect } : {}) };
    }
    for (const rule of RULES) {
      if (!rule.test(el, i, ctx)) continue;
      const target = rule.target(cardType, config);
      if (!target) continue; // module hidden for this card type — keep walking
      return { target, index: rule.highlightIndex ? rule.highlightIndex(i, ctx) : i };
    }
  }

  // Nothing specific matched → the card surface. Highlight ha-card if the
  // chain has one, else the outermost element.
  return surface();
}

/** Target-only convenience wrapper (the unit-tested surface). */
export function mapElementToTarget(
  chain: PickChainElement[],
  cardType: string,
  config?: Record<string, unknown> | null,
  pointer?: PickPointer,
): PickTarget | null {
  return mapElementToMatch(chain, cardType, config, pointer)?.target ?? null;
}

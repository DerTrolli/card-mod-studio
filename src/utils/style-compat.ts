/**
 * card_mod / UIX cross-compatibility checks.
 *
 * card-mod never reads `uix:` — only UIX reads `uix:` (falling back to
 * `card_mod:`). So a card styled entirely under `uix:` silently stops being
 * styled the moment UIX is gone, even though card-mod is present and working.
 * These helpers identify that at-risk state from a single card's config, so
 * the panel can warn about this specific card rather than only the generic
 * "neither detected" case.
 */

import type { CardModCardConfig } from '../types/index.js';

/**
 * True when this card's only style lives under `uix:` — nothing under
 * `card_mod:` for card-mod to fall back to.
 */
export function isUixOnlyStyle(config: CardModCardConfig): boolean {
  return !!config.uix?.style && !config.card_mod?.style;
}

/**
 * True when this card's `uix:` block uses UIX-only templating features
 * (macros, billets) that card-mod cannot run under any key — rewriting the
 * key to `card_mod:` would not make this styling work, unlike plain CSS.
 */
export function usesUixOnlyFeatures(config: CardModCardConfig): boolean {
  return !!(config.uix?.macros || config.uix?.billets);
}

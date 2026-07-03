/**
 * yaml-generator.ts
 *
 * Merges a generated CSS string into an existing card config object,
 * producing an updated config ready to be emitted via the config-changed event.
 *
 * By the time HA receives config-changed, the outer YAML has already been
 * serialised — so we work with plain JS objects, not YAML strings.
 */

import type { CardModCardConfig, UixConfig } from '../types/index.js';
import { isCardModInstalled, isUixInstalled } from '../utils/dom-helpers.js';

export type StyleOutputKey = 'card_mod' | 'uix';

/**
 * Picks which key generated styles should be written to.
 *
 * Defaults to 'card_mod' — today's behavior, and the safe choice when both or
 * neither engine is detected. Only switches to 'uix' when UIX is installed and
 * card-mod is not: UIX reads `uix` in preference to `card_mod` but fully
 * supports `card_mod` as a fallback, so there's no reason to emit bare `uix`
 * unless card-mod genuinely isn't present to read it.
 */
export function pickOutputKey(): StyleOutputKey {
  return isUixInstalled() && !isCardModInstalled() ? 'uix' : 'card_mod';
}

function withoutStyle(uix: UixConfig): UixConfig | undefined {
  const rest: UixConfig = { ...uix };
  delete rest.style;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/**
 * Returns a new card config with style set to the given CSS string, under
 * either the card_mod or uix key.
 *
 * - If css is empty after trimming, the outputKey block is removed entirely
 *   (HA/UIX treat a missing block the same as an empty one).
 * - When writing card_mod, a pre-existing uix.style is kept in sync (set to
 *   the same value, or cleared alongside it). UIX prioritizes uix.style over
 *   card_mod.style, so without this a studio edit could silently have no
 *   effect under UIX — it would look correct in the studio's own preview
 *   while a stale uix.style kept winning at render time. The reverse isn't
 *   needed: a stale card_mod.style is harmless once uix.style exists, since
 *   UIX always prefers uix over card_mod.
 * - The original config object is never mutated.
 */
export function applyCardModStyle(
  css: string,
  existingConfig: CardModCardConfig,
  outputKey: StyleOutputKey = 'card_mod',
): CardModCardConfig {
  const trimmed = css.trim();

  if (outputKey === 'uix') {
    if (!trimmed) {
      const rest: CardModCardConfig = { ...existingConfig };
      delete rest.uix;
      return rest;
    }
    return { ...existingConfig, uix: { ...existingConfig.uix, style: trimmed } };
  }

  if (!trimmed) {
    const result: CardModCardConfig = { ...existingConfig };
    delete result.card_mod;
    if (result.uix?.style === undefined) return result;

    const cleanedUix = withoutStyle(result.uix);
    if (cleanedUix === undefined) {
      delete result.uix;
      return result;
    }
    return { ...result, uix: cleanedUix };
  }

  const next: CardModCardConfig = { ...existingConfig, card_mod: { style: trimmed } };
  if (next.uix?.style !== undefined) {
    next.uix = { ...next.uix, style: trimmed };
  }
  return next;
}

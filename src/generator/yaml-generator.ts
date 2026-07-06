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
import { usesUixOnlyFeaturesInBlock } from '../utils/style-compat.js';

export type StyleOutputKey = 'card_mod' | 'uix';

/**
 * Picks which key generated styles should be written to.
 *
 * Defaults to 'card_mod' — today's behavior, and the safe choice when both or
 * neither engine is detected. Only switches to 'uix' when UIX is installed and
 * card-mod is not: UIX reads `uix` in preference to `card_mod` but fully
 * supports `card_mod` as a fallback, so there's no reason to emit bare `uix`
 * unless card-mod genuinely isn't present to read it.
 *
 * Pass hass when available — it closes isUixInstalled()'s transient
 * false-negative window right after page load (see dom-helpers.ts). Even a
 * miss is safe here (card_mod is UIX-readable), but there's no reason to
 * flap between keys across editor opens.
 */
export function pickOutputKey(hass?: { config?: { components?: string[] } }): StyleOutputKey {
  return isUixInstalled(hass) && !isCardModInstalled() ? 'uix' : 'card_mod';
}

function withoutStyle(uix: UixConfig): UixConfig | undefined {
  const rest: UixConfig = { ...uix };
  delete rest.style;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/** Returns existingConfig.uix with .style removed (preserving debug/macros/billets), or undefined if that leaves it empty. */
function clearUixStyle(existingConfig: CardModCardConfig): UixConfig | undefined {
  return existingConfig.uix ? withoutStyle(existingConfig.uix) : undefined;
}

/**
 * Returns a new card config with style set to the given CSS string, under
 * either the card_mod or uix key.
 *
 * - If css is empty after trimming, style is cleared under **both** keys,
 *   regardless of outputKey — "clear" means no active styling anywhere.
 *   card_mod is dropped entirely (it has no other fields); uix keeps any
 *   other fields (debug/macros/billets) and only loses .style. Clearing only
 *   the outputKey side would leave a stale value in the other key that keeps
 *   winning: a stale card_mod.style reactivates via UIX's own fallback once
 *   uix.style is gone, and a stale uix.style keeps outranking a freshly
 *   card_mod-cleared card since UIX always prefers uix over card_mod.
 * - Otherwise, `css` is written to the active (outputKey) key, and the
 *   *other* key's .style is cleared — not synced. The caller is expected to
 *   have already merged any settings that only existed under the other key
 *   into `css` (see cms-panel.ts's _buildMergedState / mergeStudioStates in
 *   state-mapper.ts), so by the time this function runs, the other key's
 *   .style is fully redundant: either it duplicates something the active
 *   key already expresses, or its unique settings have already been folded
 *   into `css`. Leaving it in place — whether stale (untouched) or synced
 *   (mirrored) — just re-introduces the dual-key duplication this function
 *   exists to clean up, and a stale copy left behind after switching engines
 *   is exactly the "still has the old card_mod code" bug this fixed.
 *   card_mod is dropped entirely when it's the *other* key (no other fields
 *   to preserve); uix keeps debug/macros/billets and only loses .style
 *   (clearUixStyle) — *unless* that uix block uses macros/billets, in which
 *   case it's hand-authored/UIX-specific content this function can't safely
 *   determine is redundant, so it's left untouched rather than cleared.
 * - Writing to uix always overwrites uix.style directly, even if it already
 *   uses macros/billets — unlike the "other key is uix" guard above, there's
 *   no fallback key to write to instead here (outputKey is only ever 'uix'
 *   when card-mod isn't installed), so skipping the write would silently eat
 *   the user's edit with no key left to reflect it at all. cms-panel.ts's
 *   `_uixMacrosWillBeOverwritten` warns about this instead of silently
 *   preventing it.
 * - The original config object is never mutated.
 */
export function applyCardModStyle(
  css: string,
  existingConfig: CardModCardConfig,
  outputKey: StyleOutputKey = 'card_mod',
): CardModCardConfig {
  const trimmed = css.trim();

  if (!trimmed) {
    const result: CardModCardConfig = { ...existingConfig };
    delete result.card_mod;

    const cleanedUix = clearUixStyle(result);
    if (cleanedUix === undefined) {
      delete result.uix;
    } else {
      result.uix = cleanedUix;
    }
    return result;
  }

  if (outputKey === 'uix') {
    const next: CardModCardConfig = { ...existingConfig, uix: { ...existingConfig.uix, style: trimmed } };
    delete next.card_mod;
    return next;
  }

  const next: CardModCardConfig = { ...existingConfig, card_mod: { style: trimmed } };
  if (next.uix?.style !== undefined && !usesUixOnlyFeaturesInBlock(next.uix)) {
    const cleanedUix = clearUixStyle(next);
    if (cleanedUix === undefined) {
      delete next.uix;
    } else {
      next.uix = cleanedUix;
    }
  }
  return next;
}

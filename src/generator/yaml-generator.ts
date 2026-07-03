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
 */
export function pickOutputKey(): StyleOutputKey {
  return isUixInstalled() && !isCardModInstalled() ? 'uix' : 'card_mod';
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
 * - When writing a non-empty style to card_mod, a pre-existing uix.style is
 *   kept in sync (UIX prioritizes uix.style over card_mod.style, so without
 *   this a studio edit could silently have no effect under UIX — it would
 *   look correct in the studio's own preview while a stale uix.style kept
 *   winning at render time) — *unless* that uix block uses macros/billets,
 *   in which case it's hand-authored/UIX-specific content the studio can't
 *   safely regenerate, so it's left untouched rather than silently
 *   overwritten with plain generated CSS.
 * - When writing a non-empty style to uix, card_mod is left untouched: since
 *   uix now has real content, UIX's own precedence guarantees uix wins
 *   regardless of what card_mod says, so there's nothing to sync.
 * - Writing to uix always overwrites uix.style directly, even if it already
 *   uses macros/billets — unlike the card_mod branch's guard above, there's
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
    return { ...existingConfig, uix: { ...existingConfig.uix, style: trimmed } };
  }

  const next: CardModCardConfig = { ...existingConfig, card_mod: { style: trimmed } };
  if (next.uix?.style !== undefined && !usesUixOnlyFeaturesInBlock(next.uix)) {
    next.uix = { ...next.uix, style: trimmed };
  }
  return next;
}

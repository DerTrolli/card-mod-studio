/**
 * yaml-generator.ts
 *
 * Merges a generated CSS string into an existing card config object,
 * producing an updated config ready to be emitted via the config-changed event.
 *
 * By the time HA receives config-changed, the outer YAML has already been
 * serialised — so we work with plain JS objects, not YAML strings.
 */

import type { CardModCardConfig, UixConfig, DictSource } from '../types/index.js';
import { isCardModInstalled, isUixInstalled } from '../utils/dom-helpers.js';
import { usesUixOnlyFeaturesInBlock, hasDictFormStyle } from '../utils/style-compat.js';

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

/** card_mod twin of clearUixStyle: strips .style but preserves class:/debug:
 *  siblings (audit BUG-1 — they used to be deleted with the whole block). */
function clearCardModStyle(existingConfig: CardModCardConfig): CardModCardConfig['card_mod'] | undefined {
  if (!existingConfig.card_mod) return undefined;
  const rest = { ...existingConfig.card_mod };
  delete rest.style;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/**
 * Dict-form save (v0.10): reassembles the dictionary in ORIGINAL key order —
 * pierced entries verbatim, the regenerated `.` css at its original
 * position (or first, when the dict had no `.` yet). An empty css drops
 * the `.` entry; an empty resulting dict clears the style like the string
 * path does. The non-active key keeps only non-style siblings; a dict-form
 * style on the NON-active key is never touched (mixed-form freeze happens
 * before this is called).
 */
function applyDictStyle(
  css: string,
  existingConfig: CardModCardConfig,
  outputKey: StyleOutputKey,
  dictSource: DictSource,
): CardModCardConfig {
  const trimmed = css.trim();
  const list: Array<[string, unknown]> = dictSource.entries.map((e) => [e.key, e.value]);
  if (trimmed) {
    const at = dictSource.rootIndex === null ? 0 : Math.min(dictSource.rootIndex, list.length);
    list.splice(at, 0, ['.', trimmed]);
  }
  // A uix: dict using UIX-only features stays under uix: (audit v0.10 #6).
  const key = dictSource.pinKey ?? outputKey;

  const next: CardModCardConfig = { ...existingConfig };

  if (list.length === 0) {
    // Nothing left at all — same semantics as the string clear path.
    const cleanedCardMod = clearCardModStyle(next);
    if (cleanedCardMod === undefined) delete next.card_mod;
    else next.card_mod = cleanedCardMod;
    if (keepsHandAuthoredUixStyle(next, key)) return next;
    const cleanedUix = clearUixStyle(next);
    if (cleanedUix === undefined) delete next.uix;
    else next.uix = cleanedUix;
    return next;
  }

  const style = Object.fromEntries(list) as Record<string, string>;
  if (key === 'uix') {
    next.uix = { ...existingConfig.uix, style };
    const cleanedCardMod = clearCardModStyle(next);
    if (cleanedCardMod === undefined) delete next.card_mod;
    else next.card_mod = cleanedCardMod;
  } else {
    next.card_mod = { ...existingConfig.card_mod, style };
    // Same guard as the string path: a macro/billet/theme-driven uix.style
    // is hand-authored content the Studio never parsed — never cleared
    // (audit v0.10 #4).
    if (keepsHandAuthoredUixStyle(next, key)) return next;
    const cleanedUix = clearUixStyle(next);
    if (cleanedUix === undefined) delete next.uix;
    else next.uix = cleanedUix;
  }
  return next;
}

/** True when the card's uix.style must survive a save that targets the
 *  OTHER key: it uses UIX-only features (macros/billets/theme, `$$`/`&`
 *  dict keys) the Studio skipped on open, so it's not "redundant" — and the
 *  panel's coexist banner promises it keeps rendering (audit v0.10 #4). */
function keepsHandAuthoredUixStyle(config: CardModCardConfig, writtenKey: StyleOutputKey): boolean {
  return writtenKey !== 'uix' && config.uix?.style !== undefined && usesUixOnlyFeaturesInBlock(config.uix);
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
 *   Exception: with card_mod as the target, a uix.style using UIX-only
 *   features (macros/billets/theme) is kept — the Studio never parsed it
 *   (same guard as below; audit v0.10 #4).
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
  dictSource?: DictSource,
): CardModCardConfig {
  // v0.10: with a dict carrier, the ACTIVE key's dictionary style is
  // rebuilt byte-identically around the regenerated `.` entry (pierced
  // entries verbatim, original order). Without a carrier, any dict-form
  // style still freezes the card (the v0.9.1 guard) — that covers legacy
  // callers and the mixed-form case (active string + dict secondary),
  // which has no faithful single-key rewrite.
  if (dictSource) {
    return applyDictStyle(css, existingConfig, outputKey, dictSource);
  }
  if (hasDictFormStyle(existingConfig)) {
    return { ...existingConfig };
  }

  const trimmed = css.trim();

  if (!trimmed) {
    const result: CardModCardConfig = { ...existingConfig };
    // Strip only .style — card_mod can carry class:/debug: siblings the
    // Studio never writes but must not delete (audit BUG-1).
    const cleanedCardMod = clearCardModStyle(result);
    if (cleanedCardMod === undefined) {
      delete result.card_mod;
    } else {
      result.card_mod = cleanedCardMod;
    }

    // …except a macro/billet/theme-driven uix.style when card_mod is the
    // target: the Studio never showed it, so "clear" can't mean it (audit
    // v0.10 #4).
    if (keepsHandAuthoredUixStyle(result, outputKey)) return result;
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
    // Same sibling-preservation on the key being vacated (audit BUG-1).
    const cleanedCardMod = clearCardModStyle(next);
    if (cleanedCardMod === undefined) {
      delete next.card_mod;
    } else {
      next.card_mod = cleanedCardMod;
    }
    return next;
  }

  const next: CardModCardConfig = { ...existingConfig, card_mod: { ...existingConfig.card_mod, style: trimmed } };
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

/**
 * card_mod / UIX cross-compatibility checks.
 *
 * card-mod never reads `uix:` — only UIX reads `uix:` (falling back to
 * `card_mod:`). So a card styled entirely under `uix:` silently stops being
 * styled the moment UIX is gone, even though card-mod is present and working.
 * These helpers identify that at-risk state (card-level and per entities-row)
 * from a card's config, so the panel can warn about the specific card/row
 * rather than only the generic "neither detected" case.
 *
 * This module is also the single place that resolves "which style actually
 * wins" — the same `uix:` > `card_mod:` precedence UIX itself applies — so
 * the parser, the panel's row-reading code, and these checks can't drift
 * out of sync with each other.
 */

import type { CardModCardConfig, EntitiesCardRow, UixConfig } from '../types/index.js';

export type StyleValue = string | Record<string, string> | undefined;

/**
 * True when a style value is card-mod's dictionary form (selector keys,
 * `$` shadow-piercing, nested dicts). The Studio can't rewrite that form
 * faithfully yet (v0.10 — see docs/V0.10_PLAN.md); until then anything
 * dict-form is preserved verbatim, never regenerated. Takes `unknown`
 * because the config types can't express nested dicts (a known type-level
 * gap, also v0.10).
 */
export function isDictForm(style: unknown): boolean {
  return style !== undefined && style !== null && typeof style !== 'string';
}

/** True when EITHER of a config's style keys is dictionary-form — the save
 *  path must then leave both keys completely untouched: rewriting only one
 *  would corrupt precedence between them, and rewriting the dict one
 *  corrupts or deletes it (the v0.9.0 loss paths — V0.10_PLAN.md §3). */
export function hasDictFormStyle(source: {
  uix?: { style?: unknown };
  card_mod?: { style?: unknown };
}): boolean {
  return isDictForm(source.card_mod?.style) || isDictForm(source.uix?.style);
}

/** A style value counts as "real" content only if it has something in it — an
 * explicit empty string or empty dict is the same as not being set at all. */
export function hasStyleContent(style: StyleValue): boolean {
  if (typeof style === 'string') return style.trim().length > 0;
  if (style && typeof style === 'object') return Object.keys(style).length > 0;
  return false;
}

/**
 * Resolves which style value UIX (or card-mod, reading only its own key)
 * would actually apply for a single card_mod/uix-bearing object — uix wins
 * whenever it has real content, else card_mod, mirroring UIX's own
 * `config.uix ?? config.card_mod` precedence but content-aware (an explicit
 * empty `uix.style` doesn't mask a real `card_mod.style`).
 */
export function resolveStyle(source: { uix?: { style?: StyleValue }; card_mod?: { style?: StyleValue } }): StyleValue {
  return hasStyleContent(source.uix?.style) ? source.uix!.style : source.card_mod?.style;
}

/**
 * True when this card's only real style content lives under `uix:` —
 * nothing under `card_mod:` for card-mod to fall back to.
 */
export function isUixOnlyStyle(config: CardModCardConfig): boolean {
  return hasStyleContent(config.uix?.style) && !hasStyleContent(config.card_mod?.style);
}

/**
 * True when a dict-form style value uses UIX-only selector extensions
 * anywhere in its (recursive) key structure (docs/V0.10_PLAN.md §1):
 * - `$$` express selector (recursive deep shadow search). The single
 *   trailing-`$` pierce (`ha-gauge$`) is NOT UIX-only — that's the shared
 *   syntax card-mod also runs.
 * - `&`-prefixed host-filter keys.
 * Values recurse: dict-in-dict entries are navigation steps whose keys
 * need the same scan.
 */
export function dictUsesUixOnlySelectors(style: unknown): boolean {
  if (!style || typeof style !== 'object') return false;
  for (const [key, value] of Object.entries(style as Record<string, unknown>)) {
    if (key.includes('$$') || key.trimStart().startsWith('&')) return true;
    if (dictUsesUixOnlySelectors(value)) return true;
  }
  return false;
}

/**
 * True when a uix: block uses UIX-only features (macros, billets, per-card
 * theme override, or dict-style keys using `$$` express selectors /
 * `&` host filters) that card-mod cannot run under any key — rewriting the
 * key to `card_mod:` would not make this styling work, unlike plain CSS.
 * (`uix.class` is NOT in this list: card-mod's `card_mod: class:` is an
 * equivalent spelling, so a class-only block is portable.) Also used to
 * decide when it's safe to auto-sync a uix.style value: overwriting
 * hand-authored macro/billet-driven styling with the studio's plain
 * generated CSS would silently destroy it, so callers must check this
 * before overwriting.
 */
export function usesUixOnlyFeaturesInBlock(uix: UixConfig | undefined): boolean {
  return usesUixMacroBlockFeatures(uix) || (isDictForm(uix?.style) && dictUsesUixOnlySelectors(uix?.style));
}

/**
 * Narrower check: only the block-LEVEL UIX features (macros/billets/theme),
 * NOT dict `$$`/`&` selector keys. The panel's coexist/overwrite banners
 * need this distinction — they describe hand-authored macro/billet styling
 * being left unsynced or overwritten by a save, which doesn't apply to
 * dict-form styles under the v0.10 model (those are rebuilt with pierced
 * entries preserved, or frozen entirely, never silently replaced).
 */
export function usesUixMacroBlockFeatures(uix: UixConfig | undefined): boolean {
  return !!(uix?.macros || uix?.billets || uix?.theme);
}

/**
 * True when this card's `uix:` block uses UIX-only templating features
 * (macros, billets) that card-mod cannot run under any key — rewriting the
 * key to `card_mod:` would not make this styling work, unlike plain CSS.
 */
export function usesUixOnlyFeatures(config: CardModCardConfig): boolean {
  return usesUixOnlyFeaturesInBlock(config.uix);
}

/**
 * Same as isUixOnlyStyle, but for an individual entities-card row — rows
 * carry their own independent card_mod/uix blocks (see
 * cms-panel.ts's _applyEntityRowStyles), so a row can be at risk even when
 * the card's own top-level config isn't.
 *
 * Requires row.entity: _applyEntityRowStyles (the "Copy to card_mod" fix's
 * actual write path) skips any row without one, so flagging an entity-less
 * row here would show a fix button that silently can't do anything.
 */
export function isUixOnlyRowStyle(row: EntitiesCardRow): boolean {
  return !!row.entity && hasStyleContent(row.uix?.style) && !hasStyleContent(row.card_mod?.style);
}

/** True when any row of an entities card has uix-only styling (see isUixOnlyRowStyle). */
export function hasUixOnlyRow(config: CardModCardConfig): boolean {
  const rows = (config as unknown as { entities?: unknown }).entities;
  if (!Array.isArray(rows)) return false;
  return rows.some((row) => row && typeof row === 'object' && isUixOnlyRowStyle(row as EntitiesCardRow));
}

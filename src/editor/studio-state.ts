/**
 * studio-state.ts — shared orchestration between the top-level panel and
 * per-child sections of container cards: config → merged StudioState, and
 * StudioState → updated config. Extracted from cms-panel.ts so a child card
 * inside a stack goes through exactly the same parse/merge/generate/apply
 * pipeline as a top-level card.
 */

import type {
  CardModCardConfig,
  EntitiesCardRow,
  EntitiesRowStyle,
  EntitiesRowStyles,
  HomeAssistant,
  StudioState,
} from '../types/index.js';
import { parseStyleValue, splitDictStyle } from '../parser/yaml-parser.js';
import { mapToStudioState, mergeStudioStates, parseEntityRowCss, mergeEntityRowStyles } from '../parser/state-mapper.js';
import { generateCss, buildThresholdJinja, FONT_WEIGHT_VALUE } from '../generator/css-generator.js';
import { applyCardModStyle, pickOutputKey } from '../generator/yaml-generator.js';
import {
  hasStyleContent,
  usesUixOnlyFeatures,
  resolveStyle,
  isDictForm,
  sameStyleValue,
  hasUnsupportedDictRoot,
  dictUsesUixOnlySelectors,
} from '../utils/style-compat.js';
import { getCachedPalette } from '../utils/palette-storage.js';

/**
 * Applies the Palette Manager's "default ON/OFF color" overrides to modules
 * that are still at their factory defaults (not enabled) — so enabling
 * Icon/Accent Color starts from the user's chosen colors instead of the
 * built-ins. Already-enabled modules are never touched: those colors were
 * deliberately picked (or parsed from existing YAML).
 */
function applyPaletteDefaults(state: StudioState): StudioState {
  const { onColor, offColor } = getCachedPalette().defaults;
  if (!onColor && !offColor) return state;
  const next = { ...state };
  if (!next.iconColor.enabled) {
    next.iconColor = {
      ...next.iconColor,
      ...(onColor ? { color: onColor, colorOn: onColor } : {}),
      ...(offColor ? { colorOff: offColor } : {}),
    };
  }
  if (!next.accentColor.enabled) {
    next.accentColor = {
      ...next.accentColor,
      ...(onColor ? { color: onColor, colorOn: onColor } : {}),
      ...(offColor ? { colorOff: offColor } : {}),
    };
  }
  return next;
}

/**
 * Builds studio state from a card_mod/uix-bearing object, merging settings
 * from BOTH keys when both carry real (string-form) content — not just
 * whichever resolveStyle() would pick — so a setting that only lives under
 * the currently-inactive key (e.g. left over from before switching card-mod
 * <-> UIX, or from a divergent hand-edit under each) isn't invisible to the
 * editor, and isn't silently dropped the next time this card is saved. The
 * active key (per pickOutputKey()) wins on conflicts; see
 * mergeStudioStates in state-mapper.ts for the per-module merge rule.
 *
 * Skips the secondary key when it's a uix: block using macros/billets —
 * that's hand-authored, UIX-exclusive content this parser can't safely
 * represent as recognised module state, so it's left out of the merge
 * entirely (and, per applyCardModStyle's matching guard, never cleared
 * either).
 */
export function buildMergedStudioState(
  config: CardModCardConfig,
  hass?: HomeAssistant,
): StudioState {
  const outputKey = pickOutputKey(hass);
  const primaryStyle = outputKey === 'uix' ? config.uix?.style : config.card_mod?.style;
  const secondaryStyle = outputKey === 'uix' ? config.card_mod?.style : config.uix?.style;

  const primaryState = mapToStudioState(parseStyleValue(primaryStyle), config.type);

  if (isDictForm(secondaryStyle) && hasStyleContent(secondaryStyle)) {
    // v0.10: a dict-form SECONDARY that is the card's ONLY style is simply
    // the effective style — parsed with its carrier and, on save,
    // consolidated into the active key like a string would be, unless it's
    // a uix: dict using UIX-only features, which stays under uix: (audit
    // v0.10 #6 — it used to be frozen behind a false "Mixed-form" banner).
    if (!hasStyleContent(primaryStyle)) {
      const effective = mapToStudioState(parseStyleValue(secondaryStyle), config.type);
      const pin = outputKey === 'card_mod' && usesUixOnlyFeatures(config);
      return applyPaletteDefaults(
        pin && effective.dictSource ? { ...effective, dictSource: { ...effective.dictSource, pinKey: 'uix' } } : effective,
      );
    }
    // The same dict under both keys (what "Copy to card_mod" produces) is
    // one dict: the active key's, the duplicate cleared on save.
    if (sameStyleValue(primaryStyle, secondaryStyle)) return applyPaletteDefaults(primaryState);
    // Otherwise it can never be consolidated into the active key — folding
    // its `.` into the regenerated css would still drop its pierced entries
    // when the save path clears the other key. Strip the primary's dict
    // carrier too, so the panel gate and the save path both fall back to
    // the mixed-form freeze (both keys preserved verbatim).
    const { dictSource: _mixed, ...frozen } = primaryState;
    return applyPaletteDefaults(frozen);
  }

  const secondaryUsable = outputKey === 'uix' || !usesUixOnlyFeatures(config);
  if (!hasStyleContent(secondaryStyle) || !secondaryUsable) return applyPaletteDefaults(primaryState);

  const secondaryState = mapToStudioState(parseStyleValue(secondaryStyle), config.type);
  return applyPaletteDefaults(mergeStudioStates(primaryState, secondaryState));
}

/**
 * StudioState → updated card config: generates the CSS for this card's type
 * (threading card-level generation options like the gauge's `needle:`) and
 * applies it under the active engine key. The single write path shared by
 * the top-level card and every stack child, so they can't diverge.
 */
export function applyStudioState(
  state: StudioState,
  config: CardModCardConfig,
  hass?: HomeAssistant,
): CardModCardConfig {
  const css = generateCss(state, config.type, {
    gaugeNeedle: (config as { needle?: boolean }).needle === true,
  });
  return applyCardModStyle(css, config, pickOutputKey(hass), state.dictSource);
}

// ---------------------------------------------------------------------------
// Entities-card row styles — shared by cms-panel (top-level entities card)
// and cms-child-card-section (an entities card inside a stack), so nested
// rows get the exact same read/merge/write pipeline as top-level ones.
// ---------------------------------------------------------------------------

/** Parses one row style value — string or dict-form. A dict row's `.` entry
 *  runs through the normal row recogniser; everything else rides in the
 *  dictSource carrier, exactly like the card-level parseDictForm. */
function parseRowStyleValue(style: unknown, entity?: string): EntitiesRowStyle {
  if (typeof style === 'string') return parseEntityRowCss(style, entity);
  if (style && typeof style === 'object' && hasStyleContent(style as Record<string, string>)) {
    // A `.` that isn't a CSS string can't be rebuilt — frozen (audit v0.10 #16).
    if (hasUnsupportedDictRoot(style)) return { ...parseEntityRowCss(''), frozen: true };
    const { rootCss, dictSource } = splitDictStyle(style as Record<string, unknown>);
    return { ...parseEntityRowCss(rootCss, entity), dictSource };
  }
  return parseEntityRowCss('');
}

/** Row-level counterpart to buildMergedStudioState — rows have no
 *  macros/billets concept, so there's no secondary-key guard to check.
 *  The dict rules mirror the card level: a dict-form PRIMARY is editable
 *  (carrier attached); a dict-form SECONDARY is the effective style when
 *  the primary is empty, one dict when identical to the primary, and
 *  otherwise makes the row mixed-form — marked `frozen` so
 *  applyEntityRowStyles leaves it untouched and the rows module shows a
 *  lock note instead of dead controls (audit v0.10 #9). */
export function buildMergedRowStyle(
  row: EntitiesCardRow,
  hass?: HomeAssistant,
): EntitiesRowStyle {
  const outputKey = pickOutputKey(hass);
  const primaryStyle = outputKey === 'uix' ? row.uix?.style : row.card_mod?.style;
  const secondaryStyle = outputKey === 'uix' ? row.card_mod?.style : row.uix?.style;

  const primaryRowStyle = parseRowStyleValue(primaryStyle, row.entity);
  if (isDictForm(secondaryStyle) && hasStyleContent(secondaryStyle)) {
    if (!hasStyleContent(primaryStyle)) {
      const effective = parseRowStyleValue(secondaryStyle, row.entity);
      // A uix: row dict with `$$`/`&` keys can't move to card_mod (audit v0.10 #6).
      return outputKey === 'card_mod' && effective.dictSource && dictUsesUixOnlySelectors(secondaryStyle)
        ? { ...effective, dictSource: { ...effective.dictSource, pinKey: 'uix' } }
        : effective;
    }
    if (sameStyleValue(primaryStyle, secondaryStyle)) return primaryRowStyle;
    const { dictSource: _mixed, ...frozen } = primaryRowStyle;
    return { ...frozen, frozen: true };
  }
  if (!hasStyleContent(secondaryStyle) || primaryRowStyle.frozen) return primaryRowStyle;

  const secondaryRowStyle = parseEntityRowCss(typeof secondaryStyle === 'string' ? secondaryStyle : '', row.entity);
  return mergeEntityRowStyles(primaryRowStyle, secondaryRowStyle);
}

/** An entities-card row as it actually appears in YAML: either the object
 *  form ({ entity: ..., ... }) or the bare-string shorthand ('sensor.x') —
 *  the latter is the most common hand-written form and must style just as
 *  well (it's converted to object form the moment it gains a style block). */
export type EntitiesRowLike = EntitiesCardRow | string;

export function rowEntityId(row: EntitiesRowLike): string | undefined {
  // A null/non-object entry (hand-edited YAML) has no entity — it used to
  // throw and break the whole panel (audit v0.10 #20).
  if (typeof row === 'string') return row;
  return row && typeof row === 'object' ? row.entity : undefined;
}

/** The row-style map key for the row at `index` — POSITIONAL, not
 *  entity-based: two rows referencing the same entity_id are valid
 *  entities-card YAML (ROADMAP #24), so keying by `row.entity` collapsed
 *  them into one style slot and editing either silently overwrote both.
 *  Index keys survive the whole parse → edit → save round-trip because
 *  applyEntityRowStyles maps rows positionally too (rows.map preserves
 *  order, including rows promoted from bare-string form in place). */
export function rowStyleKey(index: number): string {
  return String(index);
}

/** Builds the per-row style map for an entities card config, keyed by
 *  rowStyleKey(index) (config order). Rows without an entity (section
 *  rows etc.) get no slot — they can't be styled per-row. */
export function initEntityRowStyles(
  config: CardModCardConfig,
  hass?: HomeAssistant,
): EntitiesRowStyles {
  if (config.type !== 'entities') return {};
  const rows = (config as unknown as { entities?: EntitiesRowLike[] }).entities;
  if (!rows?.length) return {};

  const styles: EntitiesRowStyles = {};
  rows.forEach((row, index) => {
    const entityId = rowEntityId(row);
    if (!entityId) return;
    styles[rowStyleKey(index)] = typeof row === 'string'
      ? { iconColor: '', textColor: '' }
      : buildMergedRowStyle(row, hass);
  });
  return styles;
}

export function generateEntityRowCss(style: EntitiesRowStyle, entityId: string): string {
  const decls: string[] = [];

  if (style.iconMode === 'threshold' && style.iconRules?.length && style.iconDefault) {
    decls.push(`  --state-icon-color: ${buildThresholdJinja(style.iconRules, style.iconDefault, entityId)};`);
  } else if (style.iconColor) {
    decls.push(`  --state-icon-color: ${style.iconColor};`);
  }

  if (style.textMode === 'threshold' && style.textRules?.length && style.textDefault) {
    decls.push(`  color: ${buildThresholdJinja(style.textRules, style.textDefault, entityId)};`);
  } else if (style.textColor) {
    decls.push(`  color: ${style.textColor};`);
  }

  // Per-row font (issue #25 follow-up): rows inherit the card-level Font by
  // default; these override just this row.
  if (style.fontSizePx) decls.push(`  font-size: ${style.fontSizePx}px;`);
  if (style.fontWeight) decls.push(`  font-weight: ${FONT_WEIGHT_VALUE[style.fontWeight]};`);

  const hostBlock = decls.length ? `:host {\n${decls.join('\n')}\n}` : '';
  // Row-level Advanced-CSS passthrough: whatever the recogniser didn't
  // consume rides along verbatim (see parseEntityRowCss).
  return [hostBlock, style.extraCss ?? ''].filter(Boolean).join('\n\n');
}

/** True when a row style carries anything worth writing back. */
export function rowStyleHasContent(rowStyle: EntitiesRowStyle | undefined): boolean {
  if (!rowStyle) return false;
  const hasIcon = !!(
    rowStyle.iconColor ||
    (rowStyle.iconMode === 'threshold' && rowStyle.iconRules?.length)
  );
  const hasText = !!(
    rowStyle.textColor ||
    (rowStyle.textMode === 'threshold' && rowStyle.textRules?.length)
  );
  return hasIcon || hasText || !!rowStyle.fontSizePx || !!rowStyle.fontWeight || !!rowStyle.extraCss;
}

/**
 * Row icon colours need `state_color: false` on the row. HA colours the icon
 * of an active entity itself — an inline style on the icon (lights always,
 * other domains with state_color) — which beats `--state-icon-color`, so a
 * row colour only showed while the entity was off. `state_color: false` is
 * HA's own per-row switch for that colouring.
 *
 * Touched only when this edit changes the row's icon colour: set (or
 * changed) → add it; removed → drop it. A row whose icon colour is unchanged
 * keeps exactly what it had, so an unrelated edit never rewrites an older
 * or hand-written row, and a hand-set `state_color` on a row without an
 * icon colour is never touched.
 */
function withRowStateColor(
  updated: EntitiesCardRow,
  previousStyle: unknown,
  newCss: string,
): EntitiesCardRow {
  const iconDecl = (text: string): string | null => {
    const m = /--state-icon-color\s*:\s*([^;]*);/.exec(text);
    return m ? m[1].trim() : null;
  };
  const before = iconDecl(typeof previousStyle === 'string' ? previousStyle : JSON.stringify(previousStyle ?? '').replace(/\\n/g, '\n'));
  const after = iconDecl(newCss);
  if (after === before) return updated;
  if (after !== null) {
    return updated.state_color === false ? updated : { ...updated, state_color: false };
  }
  if (updated.state_color === false) {
    const { state_color: _dropped, ...rest } = updated;
    return rest as EntitiesCardRow;
  }
  return updated;
}

/** Writes the row-style map (keyed by rowStyleKey(index) — see above) back
 *  into each row's card_mod:/uix: block, matching styles to rows by
 *  position so duplicate-entity rows round-trip independently. */
export function applyEntityRowStyles(
  config: CardModCardConfig,
  rowStyles: EntitiesRowStyles,
  hass?: HomeAssistant,
): CardModCardConfig {
  const rows = (config as unknown as { entities?: EntitiesRowLike[] }).entities;
  if (!rows?.length) return config;

  const outputKey = pickOutputKey(hass);
  const updatedRows = rows.map((row, index) => {
    const entityId = rowEntityId(row);
    if (!entityId) return row;
    const rowStyle = rowStyles[rowStyleKey(index)];
    const hasContent = rowStyleHasContent(rowStyle);
    // Bare-string rows stay bare strings until they actually gain a style —
    // then they're promoted to the equivalent object form (the only form
    // that can carry a card_mod:/uix: block).
    if (typeof row === 'string') {
      if (!hasContent) return row;
      const promoted = applyCardModStyle(
        generateEntityRowCss(rowStyle!, entityId),
        { entity: row } as unknown as CardModCardConfig,
        outputKey,
      ) as unknown as EntitiesCardRow;
      return withRowStateColor(promoted, undefined, generateEntityRowCss(rowStyle!, entityId));
    }
    // v0.10: a dict-form row WITH a parsed carrier is editable — the save
    // rebuilds its dictionary around the regenerated `.` entry, pierced
    // entries verbatim. Without a carrier (mixed-form, or a style map that
    // predates the dict), rewriting would destroy the dict — leave the row
    // completely untouched instead.
    if (rowStyle?.frozen) return row;
    const currentStyle = resolveStyle(row as unknown as CardModCardConfig);
    if (isDictForm(currentStyle) && hasStyleContent(currentStyle) && !rowStyle?.dictSource) return row;
    const rowCss = hasContent ? generateEntityRowCss(rowStyle!, entityId) : '';
    const updated = applyCardModStyle(
      rowCss,
      row as unknown as CardModCardConfig,
      outputKey,
      rowStyle?.dictSource,
    ) as unknown as EntitiesCardRow;
    return withRowStateColor(updated, currentStyle, rowCss);
  });

  return { ...(config as unknown as object), entities: updatedRows } as unknown as CardModCardConfig;
}

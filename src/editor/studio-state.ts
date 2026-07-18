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
import { parseStyleValue } from '../parser/yaml-parser.js';
import { mapToStudioState, mergeStudioStates, parseEntityRowCss, mergeEntityRowStyles } from '../parser/state-mapper.js';
import { generateCss, buildThresholdJinja, FONT_WEIGHT_VALUE } from '../generator/css-generator.js';
import { applyCardModStyle, pickOutputKey } from '../generator/yaml-generator.js';
import { hasStyleContent, usesUixOnlyFeatures, resolveStyle } from '../utils/style-compat.js';
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
  return applyCardModStyle(css, config, pickOutputKey(hass));
}

// ---------------------------------------------------------------------------
// Entities-card row styles — shared by cms-panel (top-level entities card)
// and cms-child-card-section (an entities card inside a stack), so nested
// rows get the exact same read/merge/write pipeline as top-level ones.
// ---------------------------------------------------------------------------

/** Row-level counterpart to buildMergedStudioState — rows have no
 *  macros/billets concept, so there's no secondary-key guard to check. */
export function buildMergedRowStyle(
  row: EntitiesCardRow,
  hass?: HomeAssistant,
): EntitiesRowStyle {
  const outputKey = pickOutputKey(hass);
  const primaryStyle = outputKey === 'uix' ? row.uix?.style : row.card_mod?.style;
  const secondaryStyle = outputKey === 'uix' ? row.card_mod?.style : row.uix?.style;

  const primaryRowStyle = parseEntityRowCss(typeof primaryStyle === 'string' ? primaryStyle : '');
  if (!hasStyleContent(secondaryStyle)) return primaryRowStyle;

  const secondaryRowStyle = parseEntityRowCss(typeof secondaryStyle === 'string' ? secondaryStyle : '');
  return mergeEntityRowStyles(primaryRowStyle, secondaryRowStyle);
}

/** An entities-card row as it actually appears in YAML: either the object
 *  form ({ entity: ..., ... }) or the bare-string shorthand ('sensor.x') —
 *  the latter is the most common hand-written form and must style just as
 *  well (it's converted to object form the moment it gains a style block). */
export type EntitiesRowLike = EntitiesCardRow | string;

export function rowEntityId(row: EntitiesRowLike): string | undefined {
  return typeof row === 'string' ? row : row.entity;
}

/** Builds the per-entity row-style map for an entities card config. */
export function initEntityRowStyles(
  config: CardModCardConfig,
  hass?: HomeAssistant,
): EntitiesRowStyles {
  if (config.type !== 'entities') return {};
  const rows = (config as unknown as { entities?: EntitiesRowLike[] }).entities;
  if (!rows?.length) return {};

  const styles: EntitiesRowStyles = {};
  for (const row of rows) {
    const entityId = rowEntityId(row);
    if (!entityId) continue;
    styles[entityId] = typeof row === 'string'
      ? { iconColor: '', textColor: '' }
      : buildMergedRowStyle(row, hass);
  }
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

/** Writes the row-style map back into each row's card_mod:/uix: block. */
export function applyEntityRowStyles(
  config: CardModCardConfig,
  rowStyles: EntitiesRowStyles,
  hass?: HomeAssistant,
): CardModCardConfig {
  const rows = (config as unknown as { entities?: EntitiesRowLike[] }).entities;
  if (!rows?.length) return config;

  const outputKey = pickOutputKey(hass);
  const updatedRows = rows.map((row) => {
    const entityId = rowEntityId(row);
    if (!entityId) return row;
    const rowStyle = rowStyles[entityId];
    const hasContent = rowStyleHasContent(rowStyle);
    // Bare-string rows stay bare strings until they actually gain a style —
    // then they're promoted to the equivalent object form (the only form
    // that can carry a card_mod:/uix: block).
    if (typeof row === 'string') {
      if (!hasContent) return row;
      return applyCardModStyle(
        generateEntityRowCss(rowStyle!, entityId),
        { entity: row } as unknown as CardModCardConfig,
        outputKey,
      ) as unknown as EntitiesCardRow;
    }
    // A dictionary-form row style can't be parsed into row state yet
    // (ROADMAP #23) — rewriting the row would replace it with nothing.
    // Leave such rows completely untouched instead of destroying them.
    const currentStyle = resolveStyle(row as unknown as CardModCardConfig);
    if (currentStyle !== undefined && typeof currentStyle !== 'string') return row;
    const rowCss = hasContent ? generateEntityRowCss(rowStyle!, entityId) : '';
    return applyCardModStyle(rowCss, row as unknown as CardModCardConfig, outputKey) as unknown as EntitiesCardRow;
  });

  return { ...(config as unknown as object), entities: updatedRows } as unknown as CardModCardConfig;
}

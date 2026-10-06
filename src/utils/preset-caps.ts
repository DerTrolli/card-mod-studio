/**
 * preset-caps.ts — card-type capability gating for loaded presets.
 *
 * A preset stores the FULL StudioState of the card it was saved on. Loading
 * it onto a different card type used to adopt that state wholesale — so a
 * preset saved on a tile (animation + background + border enabled) loaded
 * onto e.g. a heading card generated CSS blocks for modules the heading
 * panel HIDES (per the NO_* capability sets in card-caps.ts): styling that
 * could never be disabled from the UI because its module isn't rendered.
 *
 * filterPresetStateForCardType() resets every module the target card type's
 * panel would hide back to its DEFAULT (disabled) state, mirroring the
 * panel's own _show* gating exactly:
 *   - headingStyle  → only on 'heading' cards
 *   - iconColor     → hidden on 'entities' and NO_ICON_COLOR_TYPES
 *   - accentColor   → hidden on 'heading', 'entities' and NO_ACCENT_TYPES
 *   - threshold     → hidden on 'entities' and NO_THRESHOLD_TYPES; elsewhere
 *                     its properties are filtered by thresholdPropertyAllowed
 *   - background    → hidden per NO_BACKGROUND_TYPES
 *   - animation     → hidden per NO_ANIMATION_TYPES
 *   - border        → hidden per NO_BORDER_TYPES
 *   - font          → hidden per NO_FONT_TYPES
 * filter and advanced are always visible, so they always survive.
 */

import type { StudioState, ThresholdModuleState } from '../types/index.js';
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_ANIMATION,
  DEFAULT_BACKGROUND,
  DEFAULT_BORDER,
  DEFAULT_FONT,
  DEFAULT_HEADING_STYLE,
  DEFAULT_ICON_COLOR,
  DEFAULT_THRESHOLD,
} from '../parser/state-mapper.js';
import {
  NO_ANIMATION_TYPES,
  NO_BACKGROUND_TYPES,
  NO_BORDER_TYPES,
  NO_FONT_TYPES,
  NO_ICON_COLOR_TYPES,
  NO_THRESHOLD_TYPES,
  showsAccentColor,
  thresholdPropertyAllowed,
} from './card-caps.js';

/** DEFAULT_THRESHOLD carries arrays — copy them so a later in-place edit of
 *  the returned state can never mutate the shared default constant. */
function freshThreshold(): ThresholdModuleState {
  return {
    ...DEFAULT_THRESHOLD,
    properties: [...DEFAULT_THRESHOLD.properties],
    rules: [],
    colorStops: DEFAULT_THRESHOLD.colorStops.map((s) => ({ ...s })),
  };
}

/**
 * Returns `state` with every module the given card type's panel hides reset
 * to its default (disabled) state. Pure — never mutates the input. A card
 * type that hides nothing (e.g. 'tile') gets the state back unchanged in
 * value (a fresh object, deep-equal to the input).
 */
export function filterPresetStateForCardType(
  state: StudioState,
  cardType: string | undefined,
): StudioState {
  const type = cardType ?? '';
  const isHeading = type === 'heading';
  const isEntities = type === 'entities';

  const next: StudioState = { ...state };

  if (!isHeading) next.headingStyle = { ...DEFAULT_HEADING_STYLE };
  if (isEntities || NO_ICON_COLOR_TYPES.has(type)) next.iconColor = { ...DEFAULT_ICON_COLOR };
  if (!showsAccentColor(type)) next.accentColor = { ...DEFAULT_ACCENT_COLOR };
  if (isEntities || NO_THRESHOLD_TYPES.has(type)) {
    next.threshold = freshThreshold();
  } else if (next.threshold?.enabled && type) {
    // Threshold properties this card type doesn't offer would be invisible
    // styling the module can't untick — drop them (all gone → module off).
    const props = next.threshold.properties.filter((p) => thresholdPropertyAllowed(p, type));
    next.threshold = props.length ? { ...next.threshold, properties: props } : freshThreshold();
  }
  if (NO_BACKGROUND_TYPES.has(type)) next.background = { ...DEFAULT_BACKGROUND };
  if (NO_ANIMATION_TYPES.has(type)) next.animation = { ...DEFAULT_ANIMATION };
  if (NO_BORDER_TYPES.has(type)) next.border = { ...DEFAULT_BORDER };
  if (NO_FONT_TYPES.has(type)) next.font = { ...DEFAULT_FONT };

  return next;
}

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
 *   (all gating below comes from capsFor(key).modules — card-caps.ts — so a
 *   custom profile's hidden modules are reset the same way)
 *   - iconColor     → hidden on 'entities' and NO_ICON_COLOR_TYPES
 *   - accentColor   → hidden on 'heading', 'entities' and NO_ACCENT_TYPES
 *   - threshold     → hidden on 'entities' and NO_THRESHOLD_TYPES; elsewhere
 *                     its properties are filtered by thresholdPropertyAllowed
 *   - background    → hidden per NO_BACKGROUND_TYPES
 *   - animation     → hidden per NO_ANIMATION_TYPES
 *   - border        → hidden per NO_BORDER_TYPES
 *   - font          → hidden per NO_FONT_TYPES
 * advanced is always visible and survives; filter too unless a custom profile
 * hides it (the Mushroom empty card has no box to filter).
 */

import type { FontModuleState, StudioState, ThresholdModuleState } from '../types/index.js';
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_ANIMATION,
  DEFAULT_BACKGROUND,
  DEFAULT_BORDER,
  DEFAULT_FILTER,
  DEFAULT_FONT,
  DEFAULT_HEADING_STYLE,
  DEFAULT_ICON_COLOR,
  DEFAULT_THRESHOLD,
} from '../parser/state-mapper.js';
import { withoutNumberSize, fontHasBaseSettings } from './owned-entries.js';
import { capsFor } from './card-caps.js';
import { getCustomCardProfile } from './custom-card-profiles.js';

/** A font state as a preset stores it: no Number size, and Font off when
 *  Number size was the only reason it was on (nothing else is set). */
export function presetFont(f: FontModuleState): FontModuleState {
  const numberOnly = f.enabled && f.numberSizeEnabled && !fontHasBaseSettings(f);
  const plain = withoutNumberSize(f);
  return numberOnly ? { ...plain, enabled: false } : plain;
}

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
  /** The target card's config — a profile's config gates (Mushroom's Accent
   *  while `icon_color` is set) hide modules here too. */
  config?: Record<string, unknown> | null,
): StudioState {
  const type = cardType ?? '';
  const caps = capsFor(type, config);
  const mods = caps.modules;

  const next: StudioState = { ...state };

  if (!mods.headingStyle) next.headingStyle = { ...DEFAULT_HEADING_STYLE };
  if (!mods.iconColor) next.iconColor = { ...DEFAULT_ICON_COLOR };
  if (!mods.accentColor) next.accentColor = { ...DEFAULT_ACCENT_COLOR };
  if (!mods.threshold) {
    next.threshold = freshThreshold();
  } else if (next.threshold?.enabled && type) {
    // Threshold properties this card type doesn't offer would be invisible
    // styling the module can't untick — drop them (all gone → module off).
    const props = next.threshold.properties.filter((p) => caps.thresholdProperty(p));
    next.threshold = props.length ? { ...next.threshold, properties: props } : freshThreshold();
  }
  if (!mods.background) next.background = { ...DEFAULT_BACKGROUND };
  if (!mods.animation) next.animation = { ...DEFAULT_ANIMATION };
  if (!mods.filter) next.filter = { ...DEFAULT_FILTER };
  if (!mods.border) next.border = { ...DEFAULT_BORDER };
  if (!mods.font) next.font = { ...DEFAULT_FONT };
  // A custom profile can name further modules to drop on a foreign preset.
  for (const m of getCustomCardProfile(type)?.presetDrop ?? []) {
    if (m === 'iconColor') next.iconColor = { ...DEFAULT_ICON_COLOR };
    else if (m === 'accentColor') next.accentColor = { ...DEFAULT_ACCENT_COLOR };
    else if (m === 'font') next.font = { ...DEFAULT_FONT };
    else if (m === 'threshold') next.threshold = freshThreshold();
    else if (m === 'background') next.background = { ...DEFAULT_BACKGROUND };
    else if (m === 'border') next.border = { ...DEFAULT_BORDER };
    else if (m === 'animation') next.animation = { ...DEFAULT_ANIMATION };
    else if (m === 'filter') next.filter = { ...DEFAULT_FILTER };
    else if (m === 'headingStyle') next.headingStyle = { ...DEFAULT_HEADING_STYLE };
  }
  // Number size is never part of a preset (v0.11) — the card keeps its own.
  if (next.font) next.font = presetFont(next.font);

  return next;
}

/**
 * studio-state.ts — shared orchestration between the top-level panel and
 * per-child sections of container cards: config → merged StudioState, and
 * StudioState → updated config. Extracted from cms-panel.ts so a child card
 * inside a stack goes through exactly the same parse/merge/generate/apply
 * pipeline as a top-level card.
 */

import type { CardModCardConfig, HomeAssistant, StudioState } from '../types/index.js';
import { parseStyleValue } from '../parser/yaml-parser.js';
import { mapToStudioState, mergeStudioStates } from '../parser/state-mapper.js';
import { generateCss } from '../generator/css-generator.js';
import { applyCardModStyle, pickOutputKey } from '../generator/yaml-generator.js';
import { hasStyleContent, usesUixOnlyFeatures } from '../utils/style-compat.js';

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

  const primaryState = mapToStudioState(parseStyleValue(primaryStyle));

  const secondaryUsable = outputKey === 'uix' || !usesUixOnlyFeatures(config);
  if (!hasStyleContent(secondaryStyle) || !secondaryUsable) return primaryState;

  const secondaryState = mapToStudioState(parseStyleValue(secondaryStyle));
  return mergeStudioStates(primaryState, secondaryState);
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

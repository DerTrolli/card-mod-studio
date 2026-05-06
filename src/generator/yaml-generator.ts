/**
 * yaml-generator.ts
 *
 * Merges a generated CSS string into an existing card config object,
 * producing an updated config ready to be emitted via the config-changed event.
 *
 * By the time HA receives config-changed, the outer YAML has already been
 * serialised — so we work with plain JS objects, not YAML strings.
 */

import type { CardModCardConfig } from '../types/index.js';

/**
 * Returns a new card config with card_mod.style set to the given CSS string.
 *
 * - If css is empty after trimming, the card_mod key is removed entirely
 *   (HA treats missing card_mod the same as no card_mod).
 * - The original config object is never mutated.
 */
export function applyCardModStyle(
  css: string,
  existingConfig: CardModCardConfig,
): CardModCardConfig {
  const trimmed = css.trim();

  if (!trimmed) {
    // Drop card_mod entirely — spread to avoid mutating the frozen original
    const { card_mod: _removed, ...rest } = existingConfig;
    return rest as CardModCardConfig;
  }

  return {
    ...existingConfig,
    card_mod: { style: trimmed },
  };
}

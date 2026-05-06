/**
 * yaml-parser.ts
 *
 * Extracts and normalises the card_mod style block from a Lovelace card
 * config object and converts it into a CardModStyleState.
 *
 * By the time we receive the card config from HA, the outer YAML has already
 * been parsed — so `config.card_mod` is a JavaScript object, not raw YAML
 * text. What we receive from card_mod.style is one of:
 *
 *   string  — plain CSS (most common)
 *             e.g. "ha-card { filter: grayscale(100%); }"
 *
 *   Record  — shadow DOM hierarchy where each key is a CSS selector and
 *             each value is a CSS string for that level
 *             e.g. { "ha-card": "filter: ...", "$": "..." }
 *
 * This module normalises both forms into a single CardModStyleState so the
 * rest of the parser pipeline always works with the same shape.
 */

import type {
  CardModCardConfig,
  CardModStyleState,
  CssTarget,
} from '../types/index.js';
import { parseCss } from './css-parser.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses the card_mod block of a card config into a CardModStyleState.
 *
 * Returns an empty state (no targets, empty rawCss) when:
 *   - config has no card_mod key
 *   - card_mod.style is undefined or empty
 *   - CSS parsing fails for any reason
 *
 * Never throws.
 */
export function parseCardModConfig(config: CardModCardConfig): CardModStyleState {
  const style = config.card_mod?.style;

  if (!style) {
    return emptyState();
  }

  if (typeof style === 'string') {
    return parseStyleString(style);
  }

  // Dictionary form — each key is a selector (or '$' for shadow-pierce),
  // each value is a CSS declaration block (not a full ruleset with braces).
  if (typeof style === 'object' && style !== null) {
    return parseDictStyle(style as Record<string, unknown>);
  }

  return emptyState();
}

// ---------------------------------------------------------------------------
// String style
// ---------------------------------------------------------------------------

function parseStyleString(css: string): CardModStyleState {
  const trimmed = css.trim();
  if (!trimmed) return emptyState();

  try {
    const targets = parseCss(trimmed);
    return { targets, rawCss: trimmed };
  } catch {
    // Parsing failed — preserve the raw CSS so it appears in the Advanced tab.
    return { targets: [], rawCss: trimmed };
  }
}

// ---------------------------------------------------------------------------
// Dictionary style
// ---------------------------------------------------------------------------

/**
 * Converts the dictionary form of card_mod.style into CssTarget[].
 *
 * card-mod allows a nested dictionary where '$' means "pierce shadow root
 * into the next level". The values are bare declaration blocks (no selector
 * wrapper), so we wrap each in a synthetic ruleset before calling parseCss.
 *
 * Example input:
 *   { "ha-card": "filter: grayscale(100%);", "$": "color: red;" }
 *
 * We treat each key as the CSS selector and its value as the declaration
 * block, producing one CssTarget per key.
 */
function parseDictStyle(dict: Record<string, unknown>): CardModStyleState {
  const targets: CssTarget[] = [];
  const rawParts: string[] = [];

  for (const [selector, declarations] of Object.entries(dict)) {
    if (typeof declarations !== 'string') continue;

    const trimmedDecls = declarations.trim();
    if (!trimmedDecls) continue;

    // Build a synthetic full CSS ruleset so parseCss can handle it normally.
    const synthetic = `${selector} { ${trimmedDecls} }`;
    rawParts.push(synthetic);

    try {
      const parsed = parseCss(synthetic);
      targets.push(...parsed);
    } catch {
      // Unparseable entry — it will still appear in rawCss.
    }
  }

  return {
    targets,
    rawCss: rawParts.join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyState(): CardModStyleState {
  return { targets: [], rawCss: '' };
}

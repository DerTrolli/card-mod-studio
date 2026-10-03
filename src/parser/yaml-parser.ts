/**
 * yaml-parser.ts
 *
 * Extracts and normalises the card_mod (or UIX) style block from a Lovelace
 * card config object and converts it into a CardModStyleState.
 *
 * UIX (github.com/Lint-Free-Technology/uix, a card-mod-derived HA
 * integration) reads `config.uix` in preference to `config.card_mod` when a
 * card has both — we mirror that precedence here so the studio always reads
 * back whichever block UIX/card-mod would actually apply.
 *
 * By the time we receive the card config from HA, the outer YAML has already
 * been parsed — so `config.card_mod`/`config.uix` are JavaScript objects, not
 * raw YAML text. What we receive from style is one of:
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
  PiercedEntry,
  DictSource,
} from '../types/index.js';
import { parseCssDetailed } from './css-parser.js';
import { resolveStyle, hasUnsupportedDictRoot, type StyleValue } from '../utils/style-compat.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a single already-resolved style value (a card's card_mod.style,
 * uix.style, or an entities-row's) into a CardModStyleState. Exposed
 * separately from parseCardModConfig so a caller that needs to parse both
 * card_mod.style and uix.style independently — e.g. to merge settings that
 * only exist under one key, see mergeStudioStates in state-mapper.ts — can
 * do so without resolveStyle's single-key precedence picking one for them.
 *
 * Returns an empty state (no targets, empty rawCss) when style is undefined,
 * empty, or CSS parsing fails for any reason. Never throws.
 */
export function parseStyleValue(style: StyleValue): CardModStyleState {
  if (!style) {
    return emptyState();
  }

  if (typeof style === 'string') {
    return parseStyleString(style);
  }

  // Dictionary form (v0.10): ONLY the `.` entry (styles for the element
  // itself, full CSS ruleset text) is parsed — through the exact string
  // pipeline, so every module works on it. EVERY other entry (pierced
  // `sel $` chains, `$$`/`&` UIX extensions, element keys, nested dicts)
  // is preserved verbatim in original order and re-emitted untouched by
  // the save path (docs/V0.10_PLAN.md §4.1).
  if (typeof style === 'object' && style !== null) {
    return parseDictForm(style as Record<string, unknown>);
  }

  return emptyState();
}

/**
 * Parses the card_mod (or UIX) block of a card config into a CardModStyleState,
 * picking whichever key resolveStyle() says currently wins.
 *
 * Never throws.
 */
export function parseCardModConfig(config: CardModCardConfig): CardModStyleState {
  return parseStyleValue(resolveStyle(config));
}

// ---------------------------------------------------------------------------
// String style
// ---------------------------------------------------------------------------

function parseStyleString(css: string): CardModStyleState {
  const trimmed = css.trim();
  if (!trimmed) return emptyState();

  try {
    const { targets, passthroughCss, tailCss } = parseCssDetailed(trimmed);
    return { targets, rawCss: trimmed, passthroughCss, tailCss };
  } catch {
    // Parsing failed — preserve the raw CSS so it appears in the Advanced tab.
    return { targets: [], rawCss: trimmed };
  }
}

// ---------------------------------------------------------------------------
// Dictionary style
// ---------------------------------------------------------------------------

/**
 * Dictionary-form style (v0.10 model). The `.` entry is full CSS ruleset
 * text — parsed like any string style. All other entries are preserved
 * verbatim (see PiercedEntry): the Studio does not interpret pierced
 * selectors yet, it only guarantees they survive every edit
 * byte-identically. (The pre-v0.9.1 behavior of wrapping every key as
 * `key { value }` mis-modelled card-mod's semantics — dict values are full
 * rule text scoped to the selected element/shadow-root, not bare
 * declaration blocks — and corrupted or deleted such styles on save.)
 */
function parseDictForm(dict: Record<string, unknown>): CardModStyleState {
  // `style: {}` is no style at all (audit v0.10 #14). A `.` that isn't a
  // CSS string can't be rebuilt around a regenerated root — no carrier, so
  // the save path preserves the dict untouched (audit v0.10 #16).
  if (Object.keys(dict).length === 0 || hasUnsupportedDictRoot(dict)) return emptyState();
  const { rootCss, dictSource } = splitDictStyle(dict);
  const base = rootCss ? parseStyleString(rootCss) : emptyState();
  return { ...base, dictSource };
}

/**
 * Splits a dict-form style into its parseable `.` text and the preserved
 * remainder (DictSource). Shared by the card-level parse above and the
 * entities-row parse (studio-state.ts), so both build the exact same
 * carrier the save path (applyDictStyle) rebuilds from.
 */
export function splitDictStyle(dict: Record<string, unknown>): { rootCss: string; dictSource: DictSource } {
  const entries: PiercedEntry[] = [];
  let rootCss = '';
  let rootIndex: number | null = null;

  Object.entries(dict).forEach(([key, value], i) => {
    if (key === '.' && typeof value === 'string') {
      rootCss = value;
      rootIndex = i;
    } else {
      entries.push({ key, value });
    }
  });

  return { rootCss, dictSource: { entries, rootIndex } };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyState(): CardModStyleState {
  return { targets: [], rawCss: '' };
}

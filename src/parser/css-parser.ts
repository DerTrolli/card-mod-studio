/**
 * css-parser.ts
 *
 * Parses a CSS string — which may contain Jinja2 {{ }} template expressions
 * as used by card-mod — into an array of structured CssTarget objects.
 *
 * Strategy
 * --------
 * A full CSS parser would be enormous. Instead we use a targeted approach:
 *
 *  1. Extract every {{ ... }} block and replace it with a unique placeholder
 *     token (__CMS_J0__, __CMS_J1__, …). This makes the remaining text valid
 *     CSS that is safe to parse with simple string splitting.
 *
 *  2. Split the CSS into selector + declaration blocks.
 *
 *  3. For each declaration block, split on ";" to get individual properties,
 *     then split each on the first ":" to get property name and value.
 *
 *  4. Restore the original Jinja2 content and run pattern recognition on
 *     each value to detect conditional (on/off) expressions.
 *
 * Limitations
 * -----------
 * - Nested selectors (e.g. @keyframes, @media) are not parsed into their own
 *   targets — they are captured as rawCss and preserved verbatim.
 * - CSS custom properties (--var: value) are parsed as regular properties.
 * - Only the two Jinja2 patterns that our generator produces are recognised;
 *   arbitrary Jinja2 logic is preserved as-is with hasCondition: true.
 */

import type { CssTarget, CssProperty } from '../types/index.js';

// ---------------------------------------------------------------------------
// Jinja2 placeholder handling
// ---------------------------------------------------------------------------

const PLACEHOLDER_PREFIX = '__CMS_J';
const PLACEHOLDER_SUFFIX = '__';

/** Replaces every {{ … }} span with a stable placeholder token. */
function extractJinja(
  css: string,
): { cleaned: string; map: Map<string, string> } {
  const map = new Map<string, string>();
  let index = 0;

  // Non-greedy match between {{ and }} — handles single-line and multi-line.
  // The 's' flag makes '.' match newlines so multi-line templates are captured.
  const cleaned = css.replace(/\{\{[\s\S]*?\}\}/g, (match) => {
    const key = `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
    map.set(key, match);
    index++;
    return key;
  });

  return { cleaned, map };
}

/** Restores placeholder tokens to their original Jinja2 strings. */
function restoreJinja(value: string, map: Map<string, string>): string {
  let result = value;
  for (const [key, original] of map) {
    // A value might reference the same placeholder multiple times in theory.
    result = result.split(key).join(original);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Jinja2 pattern recognition
// ---------------------------------------------------------------------------

/**
 * Patterns for the two Jinja2 forms our generator emits:
 *
 *   Form A (off-first): {{ 'VAL_OFF' if is_state(config.entity, 'off') else 'VAL_ON' }}
 *   Form B (on-first):  {{ 'VAL_ON'  if is_state(config.entity, 'on')  else 'VAL_OFF' }}
 *
 * Groups: [1]=first value, [2]=state ('on'|'off'), [3]=else value
 */
const ENTITY_STATE_PATTERN =
  /^\{\{\s*'([^']*)'\s+if\s+is_state\(\s*config\.entity\s*,\s*'(on|off)'\s*\)\s+else\s+'([^']*)'\s*\}\}$/;

interface JinjaAnalysis {
  hasCondition: boolean;
  onValue?: string;
  offValue?: string;
}

function analyzeJinja(value: string): JinjaAnalysis {
  const trimmed = value.trim();

  const match = trimmed.match(ENTITY_STATE_PATTERN);
  if (match) {
    const [, val1, state, val2] = match;
    // If the condition checks for 'off', val1 is the off-value
    if (state === 'off') {
      return { hasCondition: true, offValue: val1, onValue: val2 };
    }
    // If the condition checks for 'on', val1 is the on-value
    return { hasCondition: true, onValue: val1, offValue: val2 };
  }

  // Contains Jinja2 but doesn't match our known patterns — flag it but
  // preserve the raw value; the Advanced editor will show it.
  if (trimmed.includes('{{')) {
    return { hasCondition: true };
  }

  return { hasCondition: false };
}

// ---------------------------------------------------------------------------
// CSS block splitting
// ---------------------------------------------------------------------------

/**
 * Splits the outer CSS text (with Jinja2 already replaced by placeholders)
 * into an array of { selector, declarationBlock } pairs.
 *
 * We track brace depth to correctly handle @-rules that contain their own
 * blocks (e.g. @keyframes). Those are skipped as unparseable at this level.
 */
function splitIntoBlocks(
  css: string,
): Array<{ selector: string; declarationBlock: string }> {
  const blocks: Array<{ selector: string; declarationBlock: string }> = [];

  let depth = 0;
  let blockStart = -1;
  let selectorStart = 0;

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];

    if (ch === '{') {
      if (depth === 0) {
        // Top-level opening brace — everything before it is the selector.
        blockStart = i + 1;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && blockStart !== -1) {
        const selector = css.slice(selectorStart, blockStart - 1).trim();
        const declarationBlock = css.slice(blockStart, i).trim();

        // Skip @-rules that contain nested blocks (depth would be > 1 inside)
        // and empty blocks.
        if (selector && declarationBlock && !selector.startsWith('@')) {
          blocks.push({ selector, declarationBlock });
        }

        selectorStart = i + 1;
        blockStart = -1;
      }
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Declaration parsing
// ---------------------------------------------------------------------------

/**
 * Parses a CSS declaration block string into CssProperty objects.
 * Handles !important and restores Jinja2 placeholders.
 */
function parseDeclarations(
  declarationBlock: string,
  jinjaMap: Map<string, string>,
): CssProperty[] {
  const properties: CssProperty[] = [];

  // Split on ";" — trailing empties are fine, we skip them below.
  const declarations = declarationBlock.split(';');

  for (const decl of declarations) {
    const trimmed = decl.trim();
    if (!trimmed) continue;

    // Find the first colon — everything before is the property name.
    // We use indexOf instead of split(':') to avoid splitting url(data:...)
    // or color values that contain colons.
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const propertyName = trimmed.slice(0, colonIdx).trim().toLowerCase();
    let rawValue = trimmed.slice(colonIdx + 1).trim();

    // Strip !important — we note it was present but don't store it separately
    // for Phase 2 since no visual control adds it today.
    rawValue = rawValue.replace(/\s*!important\s*$/, '').trim();

    if (!propertyName) continue;

    // Restore Jinja2 content so analyzeJinja sees the real expression.
    const value = restoreJinja(rawValue, jinjaMap);
    const jinjaInfo = analyzeJinja(value);

    properties.push({
      property: propertyName,
      value,
      ...jinjaInfo,
    });
  }

  return properties;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a CSS string (with optional Jinja2 templates) into CssTarget[].
 *
 * @param css  Raw CSS string from card_mod.style
 * @returns    Array of targets — one per selector block found in the CSS.
 *             Returns an empty array on empty input; never throws.
 */
export function parseCss(css: string): CssTarget[] {
  if (!css || !css.trim()) return [];

  const { cleaned, map } = extractJinja(css);
  const blocks = splitIntoBlocks(cleaned);

  return blocks
    .map(({ selector, declarationBlock }) => {
      // Restore selector in case a Jinja2 expression appeared in it (unusual
      // but possible with dynamic selectors).
      const restoredSelector = restoreJinja(selector, map);
      const properties = parseDeclarations(declarationBlock, map);

      return {
        selector: restoredSelector,
        properties,
      };
    })
    .filter((target) => target.properties.length > 0);
}

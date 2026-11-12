import type { UixConfig } from '../types/index.js';

/** Every string inside a style value (a CSS string, or a dictionary-form style's values). */
function styleStrings(style: unknown): string[] {
  if (typeof style === 'string') return [style];
  if (style && typeof style === 'object') return Object.values(style).flatMap(styleStrings);
  return [];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * True when the card's uix style uses a macro or billet. UIX references both
 * by BARE name: for each key of `uix.macros` / `uix.billets` it matches
 * `\bname\b` over the style and injects the import / `set`. So a key counts
 * as used when its name appears inside a `{{ … }}` / `{% … %}` tag; the same
 * word in plain CSS text does not. The Studio keeps such a style verbatim in
 * Advanced CSS and never rewrites `macros` / `billets`, so this only drives
 * an informational banner.
 */
export function uixStyleUsesMacro(uix: UixConfig | undefined): boolean {
  const keys = [uix?.macros, uix?.billets].flatMap((m) => (m && typeof m === 'object' ? Object.keys(m) : []));
  if (!keys.length) return false;
  const re = new RegExp(`\\b(?:${keys.map(escape).join('|')})\\b`);
  for (const text of styleStrings(uix?.style)) {
    for (const tag of text.match(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g) ?? []) {
      if (re.test(tag)) return true;
    }
  }
  return false;
}

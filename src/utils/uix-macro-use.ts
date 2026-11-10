import type { UixConfig } from '../types/index.js';

/** Every string inside a style value (a CSS string, or a dictionary-form style's values). */
function styleStrings(style: unknown): string[] {
  if (typeof style === 'string') return [style];
  if (style && typeof style === 'object') return Object.values(style).flatMap(styleStrings);
  return [];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * True when the card's uix style CALLS a macro or billet — a Jinja tag with
 * `macros.x` / `billets.x`, or a call to one of the names defined in
 * `uix.macros`. Having the key alone is not "using" it. The Studio keeps
 * such a style verbatim in Advanced CSS, and `uix.macros` / `billets` are
 * never rewritten (yaml-generator: only `.style` is replaced), so this
 * only drives an informational banner.
 */
export function uixStyleUsesMacro(uix: UixConfig | undefined): boolean {
  if (!uix?.macros && !uix?.billets) return false;
  const names = uix.macros && typeof uix.macros === 'object' ? Object.keys(uix.macros) : [];
  const call = names.length ? `|\\b(?:${names.map(escape).join('|')})\\s*\\(` : '';
  const re = new RegExp(`\\b(?:macros|billets)\\s*\\.\\s*\\w+${call}`);
  for (const text of styleStrings(uix.style)) {
    for (const tag of text.match(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g) ?? []) {
      if (re.test(tag)) return true;
    }
  }
  return false;
}

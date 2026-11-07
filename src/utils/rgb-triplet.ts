/**
 * rgb-triplet.ts — Mushroom's colour contract is `R, G, B` (the card builds
 * `rgb(var(--rgb-state-light))` itself), not a CSS colour. These convert the
 * Studio's colour values to that form and back, for the accent emitters.
 *
 * Only what converts EXACTLY is converted: hex (3/4/6/8 digits, alpha must be
 * opaque), `rgb()`/`rgba()` with integer channels and no alpha, and HA's two
 * theme colours (`var(--primary-color)` ↔ `var(--rgb-primary-color)`, which HA
 * itself defines). Anything else returns null — the caller then writes
 * nothing rather than a value the card would reject.
 */

/** HA-defined `--rgb-*` twins of theme colours (frontend `ha-style`). */
const THEME_RGB_TWINS: Record<string, string> = {
  '--primary-color': '--rgb-primary-color',
  '--accent-color': '--rgb-accent-color',
};

const byte = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 255;

/** A Studio colour → `R, G, B` (or `var(--rgb-…)`); null when not exact. */
export function toRgbTriplet(color: string): string | null {
  const c = color.trim();
  const hex = c.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
    if (h.length === 8) {
      if (h.slice(6).toLowerCase() !== 'ff') return null;
      h = h.slice(0, 6);
    }
    if (h.length !== 6) return null;
    return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}`;
  }
  const fn = c.match(/^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)\s*(?:[,/]\s*(1(?:\.0+)?|100%)\s*)?\)$/i);
  if (fn) {
    const [r, g, b] = [fn[1], fn[2], fn[3]].map(Number);
    return byte(r) && byte(g) && byte(b) ? `${r}, ${g}, ${b}` : null;
  }
  const theme = c.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (theme && THEME_RGB_TWINS[theme[1]]) return `var(${THEME_RGB_TWINS[theme[1]]})`;
  return null;
}

/** `R, G, B` (or a known `var(--rgb-…)`) → the Studio colour (`#rrggbb` /
 *  `var(--…-color)`); null when it isn't one the emitter writes. */
export function fromRgbTriplet(value: string): string | null {
  const v = value.trim();
  const t = v.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
  if (t) {
    const ch = [t[1], t[2], t[3]].map(Number);
    if (!ch.every(byte)) return null;
    return `#${ch.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  }
  const theme = v.match(/^var\(\s*(--rgb-[\w-]+)\s*\)$/);
  if (theme) {
    const hit = Object.entries(THEME_RGB_TWINS).find(([, twin]) => twin === theme[1]);
    if (hit) return `var(${hit[0]})`;
  }
  return null;
}

/** The token a threshold rule's colour may take in triplet form. */
export const TRIPLET_TOKEN_SRC = String.raw`\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}|var\(--rgb-[\w-]+\)`;

/**
 * rgb-triplet.ts — Mushroom's colour contract is `R, G, B` (the card builds
 * `rgb(var(--rgb-state-light))` itself), not a CSS colour. These convert the
 * Studio's colour values to that form and back, for the accent emitters.
 *
 * Converted: hex (3/4/6/8 digits), `rgb()`/`rgba()`, `hsl()`/`hsla()`, the 148
 * named colours, the Accent picker's HA palette vars, and HA's `--rgb-*` theme
 * twins (`var(--primary-color)` ↔ `var(--rgb-primary-color)`). Alpha is dropped
 * (the contract has none). Anything else (an arbitrary `var(--my-var)`) returns
 * null — the generator then writes nothing for it and the modules say so.
 */

/** HA-defined `--rgb-*` twins of theme colours (checked live on HA 2026.11.0:
 *  primary, accent, error, warning, success, info — and the text colours). */
const THEME_RGB_TWINS: Record<string, string> = {
  '--primary-color': '--rgb-primary-color',
  '--accent-color': '--rgb-accent-color',
  '--error-color': '--rgb-error-color',
  '--warning-color': '--rgb-warning-color',
  '--success-color': '--rgb-success-color',
  '--info-color': '--rgb-info-color',
};

/** The Accent colour picker's HA palette (cms-color-picker HA_COLOR_PRESETS).
 *  HA defines NO `--rgb-<name>-color` for these (measured), so the preset's
 *  hex is written — theme-independent, a theme that recolours one (e.g.
 *  purple) is not followed. */
const PALETTE_HEX: Record<string, string> = {
  '--red-color': '#F44336',
  '--pink-color': '#E91E63',
  '--purple-color': '#9C27B0',
  '--blue-color': '#2196F3',
  '--cyan-color': '#00BCD4',
  '--teal-color': '#009688',
  '--green-color': '#4CAF50',
  '--yellow-color': '#FFEB3B',
  '--orange-color': '#FF9800',
  '--grey-color': '#9E9E9E',
};

/** The 148 CSS named colours (hex, no `#`). */
const NAMED = Object.fromEntries(
  [
  'aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc',
  'bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a',
  'burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50',
  'cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b',
  'darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b',
  'darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000',
  'darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f',
  'darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff',
  'dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0',
  'forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700',
  'goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0',
  'hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa',
  'lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080',
  'lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3',
  'lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa',
  'lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00',
  'limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa',
  'mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371',
  'mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585',
  'midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead',
  'navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500',
  'orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093',
  'papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6',
  'purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1',
  'saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d',
  'silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa',
  'springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347',
  'turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00',
  'yellowgreen:9acd32',
  ]
    .join(' ')
    .split(' ')
    .map((p) => p.split(':')),
) as Record<string, string>;

const byte = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 255;
const clamp255 = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

/** Parses one channel of an rgb()/rgba() function: a number or a percentage. */
function channel(tok: string): number | null {
  const m = tok.trim().match(/^(-?\d*\.?\d+)(%?)$/);
  if (!m) return null;
  return clamp255(m[2] ? (parseFloat(m[1]) * 255) / 100 : parseFloat(m[1]));
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hh * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [clamp255(f(0) * 255), clamp255(f(8) * 255), clamp255(f(4) * 255)];
}

/** Splits a modern/legacy colour-function argument list into its parts. */
function fnArgs(body: string): string[] {
  return body.replace(/\s*\/\s*/g, ',').split(/[,\s]+/).filter(Boolean);
}

/** A Studio colour → `R, G, B` (or `var(--rgb-…)`); null when it has none.
 *  Alpha is DROPPED (Mushroom's contract has no alpha channel); named colours,
 *  hex (3/4/6/8), rgb()/rgba(), hsl()/hsla(), the HA palette vars and HA's
 *  `--rgb-*` theme twins convert. An arbitrary `var(--my-var)` does not. */
export function toRgbTriplet(color: string): string | null {
  const c = color.trim();
  const hex = c.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
    if (h.length === 8) h = h.slice(0, 6);
    if (h.length !== 6) return null;
    return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}`;
  }
  const fn = c.match(/^(rgba?|hsla?)\(([^)]*)\)$/i);
  if (fn) {
    const a = fnArgs(fn[2]);
    if (a.length < 3 || a.length > 4) return null;
    if (fn[1].toLowerCase().startsWith('rgb')) {
      const ch = a.slice(0, 3).map(channel);
      return ch.every((n): n is number => n !== null) ? ch.join(', ') : null;
    }
    const h = parseFloat(a[0]);
    const s = parseFloat(a[1]);
    const l = parseFloat(a[2]);
    if ([h, s, l].some(Number.isNaN) || !a[1].endsWith('%') || !a[2].endsWith('%')) return null;
    return hslToRgb(h, Math.max(0, Math.min(1, s / 100)), Math.max(0, Math.min(1, l / 100))).join(', ');
  }
  const named = NAMED[c.toLowerCase()];
  if (named) return toRgbTriplet(`#${named}`);
  const v = c.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (v) {
    if (THEME_RGB_TWINS[v[1]]) return `var(${THEME_RGB_TWINS[v[1]]})`;
    if (PALETTE_HEX[v[1]]) return toRgbTriplet(PALETTE_HEX[v[1]]);
  }
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

/** The colours of an Accent module state that have no `R, G, B` form (what a
 *  profile with a triplet accent emitter would silently not write). */
export function accentColorsWithoutTriplet(s: {
  enabled: boolean;
  mode: string;
  color: string;
  colorOn: string;
  colorOff: string;
}): string[] {
  if (!s.enabled) return [];
  const colors = s.mode === 'conditional' ? [s.colorOn, s.colorOff] : [s.color];
  return colors.filter((c) => toRgbTriplet(c) === null);
}

/** Same for a Threshold state's accent property (rules + default, switch mode). */
export function thresholdColorsWithoutTriplet(s: {
  enabled: boolean;
  properties: string[];
  valueMode: string;
  rules: Array<{ color: string }>;
  defaultColor: string;
}): string[] {
  if (!s.enabled || !s.properties.includes('accent-color') || s.valueMode === 'gradient') return [];
  return [...s.rules.map((r) => r.color), s.defaultColor].filter((c) => toRgbTriplet(c) === null);
}

/** The one-line explanation both modules show. */
export function tripletHint(colors: string[]): string {
  const list = [...new Set(colors)].join(', ');
  return `Mushroom's accent needs an exact colour (hex, rgb, hsl, a colour name or a palette colour). ${list} can't be converted, so nothing is written for it — pick another colour.`;
}

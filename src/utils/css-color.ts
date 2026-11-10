/**
 * Validates what a user types into a colour text field: exactly one CSS
 * colour VALUE, nothing that could end the declaration or open a rule.
 *
 * Three modes: 'color' (default, one colour), 'background' (one colour or
 * image, or a comma list of them — the Background module's solid field
 * adopts any plain `background:` value) and 'stop' (a gradient stop: colour
 * plus up to two positions).
 *
 * Decision: (1) hard-reject the characters that can break out of a value
 * (`; { } \`, comments, quotes, newlines, unbalanced parentheses); (2) ask
 * the browser (`CSS.supports('color', v)`) when it exists, since it knows
 * every current colour syntax; (3) otherwise a conservative syntactic
 * check (tests / non-browser hosts). The browser accepts `var()` for any
 * property, so the Studio's `var(--primary-text-color)` and HA palette
 * variables pass on both paths.
 */

const NAMED = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood ' +
    'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray ' +
    'darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue ' +
    'firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew ' +
    'hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue ' +
    'mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred ' +
    'midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
    'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue ' +
    'slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white ' +
    'whitesmoke yellow yellowgreen transparent currentcolor inherit initial unset revert revert-layer ' +
    // CSS system colours (valid wherever a colour is)
    'accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext field fieldtext ' +
    'graytext highlight highlighttext linktext mark marktext selecteditem selecteditemtext visitedtext ' +
    'activeborder activecaption appworkspace background buttonhighlight buttonshadow captiontext ' +
    'inactiveborder inactivecaption inactivecaptiontext infobackground infotext menu menutext scrollbar ' +
    'threeddarkshadow threedface threedhighlight threedlightshadow threedshadow window windowframe windowtext'
  ).split(' '),
);

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_FUNCS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix', 'light-dark', 'var']);
const IMAGE_FUNC = /^(?:(?:repeating-)?(?:linear|radial|conic)-gradient|url|image-set|-webkit-image-set|image|cross-fade)\(/i;
const SPACES = new Set(['srgb', 'srgb-linear', 'display-p3', 'a98-rgb', 'prophoto-rgb', 'rec2020', 'xyz', 'xyz-d50', 'xyz-d65']);
// A colour-function argument: number / percentage / angle / none / nested call.
const ARG = /^(?:[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:%|[a-z]+)?|none|[a-z-]+\(.*\))$/i;
const POS = /^(?:[+-]?(?:\d+\.?\d*|\.\d+)(?:%|[a-z]+)|0|(?:calc|var|min|max|clamp)\(.*\))$/i;

export type ColorMode = 'color' | 'background' | 'stop';

/** Parentheses pair up and never close early. Quotes (when allowed) pair up. */
function parensBalanced(v: string): boolean {
  let depth = 0;
  for (const ch of v) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

function quotesBalanced(v: string): boolean {
  let q = '';
  for (const ch of v) {
    if (q) { if (ch === q) q = ''; } else if (ch === '"' || ch === "'") q = ch;
  }
  return q === '';
}

/** Split on `sep` outside parentheses and quotes. */
function splitTop(v: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0, q = '', start = 0;
  for (let i = 0; i < v.length; i++) {
    const ch = v[i];
    if (q) { if (ch === q) q = ''; continue; }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && sep.test(ch)) { out.push(v.slice(start, i)); start = i + 1; }
  }
  out.push(v.slice(start));
  return out.map((p) => p.trim()).filter((p) => p !== '');
}

/** The first `(` closes only at the very end: `rgb(1,2,3) x(y)` is two values. */
function singleCall(v: string): boolean {
  let depth = 0;
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '(') depth++;
    else if (v[i] === ')' && --depth === 0 && i !== v.length - 1) return false;
  }
  return true;
}

/** Colour function arguments shaped plausibly (fallback only; a `var()`
 *  inside makes any shape valid, as in browsers). */
function funcOk(name: string, body: string): boolean {
  if (/var\(/i.test(body)) return true;
  if (name === 'light-dark') {
    const a = splitTop(body, /,/);
    return a.length === 2 && a.every((x) => colorOk(x, false));
  }
  if (name === 'color-mix') {
    const a = splitTop(body, /,/);
    const space = /^in\s+[a-z-]+(\s+(?:shorter|longer|increasing|decreasing)\s+hue)?$/i.test(a[0] ?? '');
    const mix = space ? a.slice(1) : a; // browsers also take it without `in <space>`
    return mix.length === 2 &&
      mix.every((x) => { const t = splitTop(x, /\s/); return t.length >= 1 && t.length <= 2 && colorOk(t[0], false); });
  }
  const from = /^from\s/i.test(body);
  if (from) return body.length > 5;
  if (name === 'color') {
    const [space, ...rest] = splitTop(body.split('/')[0], /\s/);
    return !!space && SPACES.has(space.toLowerCase()) &&
      rest.length === 3 && rest.every((x) => ARG.test(x)) && body.split('/').length <= 2;
  }
  const legacy = body.includes(',');
  const parts = legacy ? splitTop(body, /,/) : splitTop(body.replace('/', ' / '), /\s/);
  if (legacy) {
    return (name === 'rgb' || name === 'rgba' || name === 'hsl' || name === 'hsla') &&
      (parts.length === 3 || parts.length === 4) && parts.every((x) => ARG.test(x));
  }
  const slash = parts.indexOf('/');
  const chans = slash < 0 ? parts : parts.slice(0, slash);
  const alpha = slash < 0 ? [] : parts.slice(slash + 1);
  return chans.length === 3 && chans.every((x) => ARG.test(x)) && (slash < 0 || (alpha.length === 1 && ARG.test(alpha[0])));
}

/** One colour token. Structure is checked in both modes (the browser accepts
 *  `var()` anywhere, so `var(--x) 10px` or `red var(--x)` would pass it). */
function colorOk(v: string, useBrowser: boolean): boolean {
  if (!v || splitTop(v, /\s/).length !== 1 || v.includes('!') || !singleCall(v)) return false;
  const name = /^[a-z][a-z-]*(?=\()/i.exec(v)?.[0].toLowerCase();
  if (name !== undefined && !COLOR_FUNCS.has(name)) return false;
  if (name === undefined && !HEX.test(v) && !/^[a-z-]+$/i.test(v)) return false;
  const css = (globalThis as { CSS?: { supports?: (p: string, v: string) => boolean } }).CSS;
  if (useBrowser && typeof css?.supports === 'function') return css.supports('color', v);
  if (name === undefined) return HEX.test(v) || NAMED.has(v.toLowerCase());
  const body = v.slice(name.length + 1, -1);
  if (name === 'var') return /^\s*--[\w-]+\s*(?:,[^]*)?$/.test(body);
  return funcOk(name, body);
}

function supportsBg(v: string): boolean | null {
  const css = (globalThis as { CSS?: { supports?: (p: string, v: string) => boolean } }).CSS;
  return typeof css?.supports === 'function' ? css.supports('background', v) : null;
}

/** One background layer: `none`, one image, or one colour. */
function layerOk(l: string): boolean {
  if (l.toLowerCase() === 'none') return true;
  if (IMAGE_FUNC.test(l)) {
    if (!singleCall(l) || !l.endsWith(')') || /\(\s*\)$/.test(l)) return false;
    return supportsBg(l) ?? true;
  }
  return colorOk(l, true);
}

function stopOk(v: string): boolean {
  const t = splitTop(v, /\s/);
  return t.length >= 1 && t.length <= 3 && colorOk(t[0], true) && t.slice(1).every((x) => POS.test(x));
}

/** True when `raw` (trimmed or not) is one safe CSS value for `mode`. */
export function isValidCssColor(raw: string, mode: ColorMode = 'color'): boolean {
  const v = raw.trim();
  // Quotes only inside a background image (`url("x.png")`), and then paired.
  const quoteOk = mode === 'background' && quotesBalanced(v);
  if (!v || /[;{}\\\n\r]|\/\*|\*\//.test(v) || (!quoteOk && /["']/.test(v)) || !parensBalanced(v)) return false;
  if (mode === 'background') {
    if (/,\s*,|^,|,$/.test(v)) return false;
    const layers = splitTop(v, /,/);
    return layers.length > 0 && layers.every(layerOk);
  }
  if (mode === 'stop') return stopOk(v);
  return colorOk(v, true);
}

/**
 * Validates what a user types into a colour text field: exactly one CSS
 * colour VALUE, nothing that could end the declaration or open a rule.
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
    'whitesmoke yellow yellowgreen transparent currentcolor inherit initial unset revert'
  ).split(' '),
);

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i;
const VAR = /^var\(\s*--[\w-]+\s*(?:,[^]*)?\)$/;
// Inside a colour function: numbers, units, idents, separators, nested
// var()/calc()/colour functions — never quotes or declaration-level syntax.
const FUNC_BODY = /^[\w\s.,%#()/+*:-]*$/;

/** Parentheses pair up and never close early. */
function parensBalanced(v: string): boolean {
  let depth = 0;
  for (const ch of v) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return false;
  }
  return depth === 0;
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

/** True when `raw` (trimmed or not) is one safe CSS colour value. */
export function isValidCssColor(raw: string): boolean {
  const v = raw.trim();
  if (!v || /[;{}\\\n\r"']|\/\*|\*\//.test(v) || !parensBalanced(v)) return false;
  const css = (globalThis as { CSS?: { supports?: (p: string, v: string) => boolean } }).CSS;
  if (typeof css?.supports === 'function') return css.supports('color', v);
  if (HEX.test(v)) return true;
  if (NAMED.has(v.toLowerCase())) return true;
  if (VAR.test(v)) return singleCall(v);
  if (FUNC.test(v)) return FUNC_BODY.test(v) && singleCall(v);
  return false;
}

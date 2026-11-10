/**
 * Accessibility checks on a RENDERED Lit template, without a DOM: the
 * template (values substituted, nested templates and arrays flattened) is
 * serialised to HTML, parsed into a small tree, and every interactive element
 * is given the accessible name a browser would compute from what the
 * Studio controls. Not a test file.
 *
 * What counts as a name is what actually reaches the accessibility tree on
 * Home Assistant 2026.11 (measured with Playwright's ariaSnapshot), not what
 * merely looks like a label:
 *   - ha-switch  → text inside it (its default slot sits in the inner <label>);
 *                  an aria-label on the host never reaches the inner input.
 *   - ha-slider  → its `label` attribute (the inner slider is labelled by the
 *                  label part); an aria-label on the host never reaches it.
 *   - cms-color-picker / cms-entity-picker → their own label / accessible-name
 *                  attribute, which they pass on to their inner controls.
 *   - everything else → aria-labelledby, aria-label, <label for>, a wrapping
 *                  <label>, or text content (buttons).
 */
import { nothing } from 'lit';

export interface El {
  tag: string;
  attrs: Record<string, string>;
  children: Array<El | string>;
  parent?: El;
}

const VOID = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);

/** Serialise a template result to HTML text. Event/property bindings become
 *  inert data- attributes; an attribute bound to `nothing` is dropped. */
export function serialise(t: unknown): string {
  if (t === null || t === undefined || t === false || t === true || t === nothing) return '';
  if (typeof t === 'string') return t.replace(/</g, '&lt;');
  if (typeof t === 'number') return String(t);
  if (Array.isArray(t)) return t.map(serialise).join('');
  const r = t as { strings?: readonly string[]; values?: unknown[]; _$litDirective$?: unknown };
  // repeat(items, [key], template): render each item through its template.
  if (r._$litDirective$ && Array.isArray(r.values)) {
    const [items, a, b] = r.values as [unknown[], unknown, unknown];
    const tpl = (typeof b === 'function' ? b : a) as (x: unknown, i: number) => unknown;
    return Array.from(items).map((x, i) => serialise(tpl(x, i))).join('');
  }
  if (!r.strings) return '';
  let out = '';
  r.strings.forEach((s, i) => {
    out += s;
    if (i >= (r.values?.length ?? 0)) return;
    const v = r.values![i];
    const m = /([.@?]?)([\w:-]+)=(["']?)$/.exec(out);
    if (m) {
      const [whole, prefix, name, q] = m;
      const head = out.slice(0, out.length - whole.length);
      if (prefix === '@' || prefix === '.') out = `${head}data-bound-${name}=${q || '""'}`;
      else if (prefix === '?') out = `${head}${v ? name : 'data-off'}=${q || '""'}`;
      else if (v === nothing || v === undefined || v === null) out = `${head}data-omitted-${name}=${q || '""'}`;
      else if (q) out += String(v);
      else out += `"${String(v).replace(/"/g, '&quot;')}"`; // an unquoted binding may hold spaces
      return;
    }
    out += serialise(v);
  });
  return out;
}

export function parse(html: string): El {
  const root: El = { tag: '#root', attrs: {}, children: [] };
  let cur = root;
  const re = /<!--[\s\S]*?-->|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) {
      let n: El | undefined = cur;
      while (n && n.tag !== m[1]) n = n.parent;
      if (n?.parent) cur = n.parent;
    } else if (m[2]) {
      const attrs: Record<string, string> = {};
      const ar = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
      let a: RegExpExecArray | null;
      while ((a = ar.exec(m[3] ?? ''))) attrs[a[1]] = a[2] ?? a[3] ?? a[4] ?? '';
      const el: El = { tag: m[2], attrs, children: [], parent: cur };
      cur.children.push(el);
      if (!VOID.has(m[2]) && !m[4]) cur = el;
    } else if (m[5] !== undefined) {
      cur.children.push(m[5]);
    }
  }
  return root;
}

export function walk(el: El, fn: (e: El) => void): void {
  for (const c of el.children) if (typeof c !== 'string') { fn(c); walk(c, fn); }
}

/** Text a screen reader would read inside `el` (aria-hidden subtrees skipped). */
export function textOf(el: El | string): string {
  if (typeof el === 'string') return el.replace(/\s+/g, ' ');
  if (el.attrs['aria-hidden'] === 'true' || el.tag === 'option') return '';
  return el.children.map(textOf).join('');
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export const INTERACTIVE =
  'ha-switch, ha-slider, select, input, button, textarea, ha-code-editor, ha-entity-picker, cms-entity-picker, cms-color-picker, [role=button], [tabindex]';

export function isInteractive(e: El): boolean {
  if (e.tag === 'input' && e.attrs.type === 'hidden') return false;
  return (
    ['ha-switch', 'ha-slider', 'select', 'input', 'button', 'textarea', 'ha-code-editor',
      'ha-entity-picker', 'cms-entity-picker', 'cms-color-picker'].includes(e.tag) ||
    e.attrs.role === 'button' ||
    'tabindex' in e.attrs
  );
}

/** The accessible name of `e` in `root`, or '' when it has none. */
export function accessibleName(e: El, root: El): string {
  const byId = (id: string): El | undefined => {
    let found: El | undefined;
    walk(root, (x) => { if (x.attrs.id === id) found = x; });
    return found;
  };
  switch (e.tag) {
    case 'ha-switch': return clean(e.children.map(textOf).join(''));
    case 'ha-slider': return clean(e.attrs.label ?? '');
    case 'cms-color-picker': return clean(e.attrs.label ?? '');
    case 'cms-entity-picker': return clean(e.attrs['accessible-name'] ?? '');
    case 'ha-code-editor': return clean(e.attrs['aria-label'] ?? '');
  }
  const lb = e.attrs['aria-labelledby'];
  if (lb) {
    const t = clean(lb.split(/\s+/).map((id) => textOf(byId(id) ?? '')).join(' '));
    if (t) return t;
  }
  if (clean(e.attrs['aria-label'] ?? '')) return clean(e.attrs['aria-label']);
  if (e.attrs.id) {
    let t = '';
    walk(root, (x) => { if (x.tag === 'label' && x.attrs.for === e.attrs.id) t ||= clean(textOf(x)); });
    if (t) return t;
  }
  for (let p = e.parent; p; p = p.parent) if (p.tag === 'label') return clean(textOf(p));
  if (['button', 'div', 'span', 'a'].includes(e.tag)) return clean(textOf(e));
  return '';
}

/** Every interactive element of `t` that has no accessible name. */
export function unnamedControls(t: unknown): string[] {
  const root = parse(serialise(t));
  const bad: string[] = [];
  walk(root, (e) => {
    if (!isInteractive(e)) return;
    if (!accessibleName(e, root)) {
      const hint = Object.entries(e.attrs).filter(([k]) => !k.startsWith('data-')).map(([k, v]) => `${k}=${v}`).join(' ');
      bad.push(`<${e.tag} ${hint}>`);
    }
  });
  return bad;
}

/** Names of all interactive elements, for duplicate checks. */
export function controlNames(t: unknown): string[] {
  const root = parse(serialise(t));
  const names: string[] = [];
  walk(root, (e) => {
    if (isInteractive(e)) names.push(`${e.tag}:${accessibleName(e, root)}`);
  });
  return names;
}

/** `label` and `aria-label` of every ha-slider (they must agree). */
export function sliderLabels(t: unknown): Array<[string, string]> {
  const root = parse(serialise(t));
  const out: Array<[string, string]> = [];
  walk(root, (e) => {
    if (e.tag === 'ha-slider') out.push([e.attrs.label ?? '', e.attrs['aria-label'] ?? '']);
  });
  return out;
}

/** Slotted text and `aria-label` of every ha-switch (they must agree: the
 *  text names it on HA 2026.x, the attribute on older mwc/md switches). */
export function switchLabels(t: unknown): Array<[string, string]> {
  const root = parse(serialise(t));
  const out: Array<[string, string]> = [];
  walk(root, (e) => {
    if (e.tag === 'ha-switch') out.push([clean(e.children.map(textOf).join('')), e.attrs['aria-label'] ?? '']);
  });
  return out;
}

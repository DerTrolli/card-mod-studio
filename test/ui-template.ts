/**
 * Helpers for driving RENDERED Lit templates without a DOM: flattens a
 * template into its elements (document order) with each bound `@event`
 * handler, and gives a fake <input> good enough for the handlers under test.
 * Not a test file.
 */
export interface TplNode {
  /** Opening-tag text with bound values substituted (quotes stripped). */
  tag: string;
  on: Record<string, (e: unknown) => void>;
}

export function tplNodes(t: unknown): TplNode[] {
  if (Array.isArray(t)) return t.flatMap((x) => tplNodes(x));
  const r = t as { strings?: readonly string[]; values?: unknown[] } | null;
  if (!r || !r.strings) return [];
  const out: TplNode[] = [];
  let cur: TplNode | undefined;
  r.strings.forEach((s, i) => {
    for (const part of s.split(/(?=<)/)) {
      if (part.startsWith('<') && !part.startsWith('</')) {
        cur = { tag: '', on: {} };
        out.push(cur);
      }
      if (cur) cur.tag += part;
    }
    if (i >= r.values!.length) return;
    const v = r.values![i];
    const ev = /@(\w+)=$/.exec(s);
    if (typeof v === 'function' && ev && cur) cur.on[ev[1]] = v as (e: unknown) => void;
    else if (v && typeof v === 'object') {
      out.push(...tplNodes(v));
      cur = undefined;
    } else if (cur && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) cur.tag += String(v);
  });
  return out.map((n) => ({ ...n, tag: n.tag.replace(/"/g, '') }));
}

/** The first element whose tag text contains `needle`. */
export function tplFind(t: unknown, needle: string, host?: unknown): TplNode {
  const n = tplNodes(t).find((x) => x.tag.includes(needle));
  if (!n) throw new Error(`no element containing ${needle}`);
  // Lit calls event listeners with the host element as `this`.
  if (host) for (const k of Object.keys(n.on)) n.on[k] = n.on[k].bind(host);
  return n;
}

/** A fake <input>: `value`, attributes, and itself as `target`. */
export function fakeInput(value: string) {
  const attrs: Record<string, string> = {};
  const el = {
    value,
    attrs,
    target: null as unknown,
    getAttribute: (k: string) => attrs[k] ?? null,
    setAttribute: (k: string, v: string) => { attrs[k] = v; },
    stopPropagation() {},
  };
  el.target = el;
  return el;
}

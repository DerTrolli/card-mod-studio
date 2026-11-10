/**
 * My Color Palette manager: hex text fields, accessible names, commit-only
 * (debounced) storage writes, the "saved globally" help line, and the
 * two-step remove. Tests call the RENDERED handlers pulled from the template.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import type { CustomPalette } from '../src/utils/palette-storage.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

type El = {
  hass?: unknown; _open: boolean; render(): unknown;
  connectedCallback(): void; disconnectedCallback(): void;
};
let Mod: new () => El;
let normalizeHex: (s: string) => string | undefined;
let storage: typeof import('../src/utils/palette-storage.js');

beforeAll(async () => {
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => null, setItem: () => {} };
  (globalThis as { window?: unknown }).window = { dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} };
  ({ normalizeHex } = await import('../src/editor/cms-palette-manager.js'));
  storage = await import('../src/utils/palette-storage.js');
  Mod = registry.get('cms-palette-manager') as new () => El;
});

// ---- template walking ------------------------------------------------------

interface Node {
  tag: string; // opening-tag text with string values substituted
  row?: string; // data-row of the enclosing row
  on: Record<string, (e: unknown) => void>;
}
/** Flattens a lit template into its elements (doc order), with bound handlers. */
function nodes(t: unknown, ctx = { row: undefined as string | undefined }): Node[] {
  if (Array.isArray(t)) return t.flatMap((x) => nodes(x, ctx));
  const r = t as { strings?: readonly string[]; values?: unknown[] } | null;
  if (!r || !r.strings) return [];
  const out: Node[] = [];
  let cur: Node | undefined;
  const text = (s: string) => {
    for (const part of s.split(/(?=<)/)) {
      if (part.startsWith('<') && !part.startsWith('</')) {
        cur = { tag: '', row: ctx.row, on: {} };
        out.push(cur);
      }
      if (cur) cur.tag += part;
    }
  };
  r.strings.forEach((s, i) => {
    text(s);
    if (i >= r.values!.length) return;
    const v = r.values![i];
    const ev = /@(\w+)=$/.exec(s);
    if (typeof v === 'function' && ev && cur) cur.on[ev[1]] = v as (e: unknown) => void;
    else if (v && typeof v === 'object') {
      const nested = nodes(v, ctx);
      out.push(...nested);
      cur = undefined;
    } else if (cur && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) cur.tag += String(v);
    const m = cur && /data-row=([^\s>]+)/.exec(cur.tag);
    if (m) ctx.row = m[1];
  });
  return out;
}
const dom = (el: El) => nodes(el.render()).map((n) => ({ ...n, tag: n.tag.replace(/"/g, '') })); // quotes differ between static and bound attrs
const find = (el: El, row: string, cls: string): Node => {
  const n = dom(el).find((x) => x.row === row && x.tag.includes(cls));
  if (!n) throw new Error(`no ${cls} in row ${row}`);
  return n;
};
const fake = (value: string, type = 'text') => ({ value, type, target: null as unknown, stopPropagation: vi.fn() });
const ev = (value: string, type = 'text') => {
  const e = fake(value, type);
  e.target = e;
  return e;
};

// ---- setup -------------------------------------------------------------------

const FIXTURE: CustomPalette = {
  colors: [
    { id: 'color-1700000000000-abc1234', name: 'Brand blue', hex: '#1a2b3c' },
    { id: 'color-1700000000001-def5678', name: '', hex: '#ff0000' },
  ],
  defaults: { onColor: '#00ff00' },
};
const A = FIXTURE.colors[0].id;
const B = FIXTURE.colors[1].id;

let send: ReturnType<typeof vi.fn>;
let el: El;
const writes = () => send.mock.calls.filter((c) => (c[0] as { type: string }).type === 'frontend/set_user_data');
/** Lets the re-read-then-write of a palette update finish. */
const settle = () => vi.advanceTimersByTimeAsync(0);
const lastWrite = () => (writes().at(-1)![0] as { value: CustomPalette }).value;

beforeEach(async () => {
  vi.useFakeTimers();
  await storage.savePalette(JSON.parse(JSON.stringify(FIXTURE)), undefined);
  // A stateful fake of HA's user storage: updates re-read it before writing.
  let stored: unknown = JSON.parse(JSON.stringify(FIXTURE));
  send = vi.fn(async (msg: { type: string; value?: unknown }) => {
    if (msg.type === 'frontend/get_user_data') return { value: stored };
    if (msg.type === 'frontend/set_user_data') stored = msg.value;
    return null;
  });
  el = new Mod();
  el.hass = { connection: { sendMessagePromise: send } };
  el._open = true;
});
afterEach(() => vi.useRealTimers());

// ---- tests -------------------------------------------------------------------

describe('normalizeHex', () => {
  it('accepts #rgb / #rrggbb, trims, lower-cases; rejects the rest', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('  #1A2b3C \n')).toBe('#1a2b3c');
    for (const bad of ['', '#', '#12', '#1234', '#12345', '#1234567', '#12345678', 'abc', '#ggg', 'red', '#ab cd']) {
      expect(normalizeHex(bad), bad).toBeUndefined();
    }
  });
});

describe('stored format', () => {
  it('loads a palette saved by the current version identically', async () => {
    const hass = { connection: { sendMessagePromise: vi.fn().mockResolvedValue({ value: FIXTURE }) } };
    expect(await storage.loadPalette(hass)).toEqual(FIXTURE);
  });

  it('an edit writes the same shape (id / name / hex, defaults) — nothing new', async () => {
    find(el, A, 'name-input').on.change(ev('Navy'));
    await vi.advanceTimersByTimeAsync(300); // the write follows a re-read of the stored palette
    expect(lastWrite()).toEqual({
      colors: [{ ...FIXTURE.colors[0], name: 'Navy' }, FIXTURE.colors[1]],
      defaults: FIXTURE.defaults,
    });
  });
});

describe('hex text field', () => {
  it('shows the stored hex next to the native swatch', () => {
    expect(find(el, A, 'hex-input').tag).toContain('.value=#1a2b3c');
    expect(find(el, A, 'swatch-input').tag).toContain('.value=#1a2b3c');
  });

  it('a typed #rgb is trimmed, expanded and stored on change only', async () => {
    const hex = find(el, A, 'hex-input');
    const e = ev(' #0Af ');
    hex.on.input(e);
    vi.advanceTimersByTime(1000);
    expect(writes()).toHaveLength(0); // typing alone never writes
    expect(find(el, A, 'swatch-input').tag).toContain('.value=#00aaff'); // swatch follows live
    hex.on.change(e);
    expect(e.value).toBe('#00aaff');
    await vi.advanceTimersByTimeAsync(300); // the write follows a re-read of the stored palette
    expect(writes()).toHaveLength(1);
    expect(lastWrite().colors[0].hex).toBe('#00aaff');
  });

  it.each(['#12', 'abc', '', '#12345', 'red'])('invalid %j is not stored, flags aria-invalid, reverts on blur', (bad) => {
    const hex = find(el, A, 'hex-input');
    const e = ev(bad);
    hex.on.input(e);
    hex.on.change(e);
    vi.advanceTimersByTime(1000);
    expect(writes()).toHaveLength(0);
    expect(find(el, A, 'hex-input').tag).toContain('aria-invalid=true');
    hex.on.blur(e);
    expect(e.value).toBe('#1a2b3c');
    expect(find(el, A, 'hex-input').tag).toContain('aria-invalid=false');
    expect(find(el, A, 'swatch-input').tag).toContain('.value=#1a2b3c');
    vi.advanceTimersByTime(1000);
    expect(writes()).toHaveLength(0);
  });

  it('works the same on the default ON colour and Reset clears it', async () => {
    const hex = find(el, 'onColor', 'hex-input');
    expect(hex.tag).toContain('.value=#00ff00');
    const e = ev('#123');
    hex.on.input(e);
    hex.on.change(e);
    await vi.advanceTimersByTimeAsync(300); // the write follows a re-read of the stored palette
    expect(lastWrite().defaults.onColor).toBe('#112233');
    find(el, 'onColor', 'reset-btn').on.click(ev(''));
    await vi.advanceTimersByTimeAsync(300); // the write follows a re-read of the stored palette
    expect(lastWrite().defaults.onColor).toBeUndefined();
  });

  it('a hex field for an unset default shows the built-in colour', () => {
    expect(find(el, 'offColor', 'hex-input').tag).toContain('.value=#6b6b6b');
  });
});

describe('storage writes', () => {
  it('dragging the native dialog (many input events) writes nothing until change, then once', async () => {
    const sw = find(el, A, 'swatch-input');
    for (let i = 0; i < 40; i++) sw.on.input(ev(`#${(0x100000 + i * 997).toString(16)}`, 'color'));
    vi.advanceTimersByTime(2000);
    expect(writes()).toHaveLength(0);
    expect(find(el, A, 'hex-input').tag).toContain('.value=#'); // text follows the drag
    sw.on.change(ev('#654321', 'color'));
    await vi.advanceTimersByTimeAsync(300); // the write follows a re-read of the stored palette
    expect(writes()).toHaveLength(1);
    expect(lastWrite().colors[0].hex).toBe('#654321');
  });

  it('rapid commits are coalesced into one write carrying all of them', async () => {
    find(el, A, 'swatch-input').on.change(ev('#111111', 'color'));
    find(el, A, 'name-input').on.change(ev('One'));
    find(el, B, 'swatch-input').on.change(ev('#222222', 'color'));
    find(el, A, 'swatch-input').on.change(ev('#333333', 'color')); // last one wins
    await vi.advanceTimersByTimeAsync(300); // the write follows a re-read of the stored palette
    expect(writes()).toHaveLength(1);
    expect(lastWrite().colors.map((c) => [c.name, c.hex])).toEqual([['One', '#333333'], ['', '#222222']]);
  });

  it('commits a moment apart still share one write (the wait restarts)', async () => {
    find(el, A, 'swatch-input').on.change(ev('#111111', 'color'));
    vi.advanceTimersByTime(100);
    find(el, B, 'swatch-input').on.change(ev('#222222', 'color'));
    vi.advanceTimersByTime(100);
    expect(writes()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(300); // the write follows a re-read of the stored palette
    expect(writes()).toHaveLength(1);
  });

  it('a commit still waiting is flushed when the element goes away', async () => {
    find(el, A, 'name-input').on.change(ev('Late'));
    el.disconnectedCallback();
    await settle();
    expect(lastWrite().colors[0].name).toBe('Late');
  });

  it('committing the already-stored colour writes nothing', () => {
    find(el, A, 'hex-input').on.change(ev('#1A2B3C'));
    vi.advanceTimersByTime(1000);
    expect(writes()).toHaveLength(0);
  });
});

describe('accessible names', () => {
  it('every control names the entry it belongs to', () => {
    const tags = (row: string) => dom(el).filter((n) => n.row === row).map((n) => n.tag);
    const a = tags(A).join('\n');
    expect(a).toContain(`aria-label=Colour of 'Brand blue'`);
    expect(a).toContain(`aria-label=Hex value of 'Brand blue'`);
    expect(a).toContain('aria-label=Name of colour 1');
    expect(a).toMatch(/aria-label=Remove 'Brand blue'\s/);
    const b = tags(B).join('\n'); // unnamed entry falls back to its position
    expect(b).toContain(`aria-label=Colour of 'colour 2'`);
    expect(b).toContain('aria-label=Name of colour 2');
    expect(b).toMatch(/aria-label=Remove 'colour 2'\s/);
    expect(tags('onColor').join('\n')).toContain('aria-label=Colour of default ON colour');
    expect(tags('onColor').join('\n')).toContain('aria-label=Hex value of default ON colour');
    expect(tags('onColor').join('\n')).toContain('aria-label=Reset default ON colour to built-in');
    expect(tags('offColor').join('\n')).toContain('aria-label=Colour of default OFF colour');
  });

  it('the collapse header is a keyboard-operable button', () => {
    const header = dom(el).find((n) => n.tag.includes('module-header'))!;
    expect(header.tag).toContain('role=button');
    expect(header.tag).toContain('tabindex=0');
    expect(header.on.keydown).toBeTypeOf('function');
    expect(dom(el).find((n) => n.tag.includes('module-chevron'))!.tag).toContain('aria-hidden=true');
  });
});

describe('help line', () => {
  const HELP = "Saved straight to your Home Assistant profile.";
  const flat = (t: unknown): string =>
    Array.isArray(t) ? t.map(flat).join('') :
      t && typeof t === 'object' ? ((t as { strings?: string[] }).strings ?? []).join('') +
        ((t as { values?: unknown[] }).values ?? []).map(flat).join('') :
      typeof t === 'string' ? t : '';
  it('is only rendered while expanded', () => {
    el._open = false;
    expect(flat(el.render())).not.toContain(HELP);
    el._open = true;
    const text = flat(el.render()).replace(/\s+/g, ' ');
    expect(text).toContain(`${HELP} Cards keep the colour they were given — changing an entry here doesn't restyle them.`);
  });
});

describe('two-step remove', () => {
  const del = (row = A) => find(el, row, 'del-btn');

  it('first activation arms (label changes), second removes', async () => {
    del().on.click(ev(''));
    expect(del().tag).toContain(`aria-label=Remove 'Brand blue'?`);
    vi.advanceTimersByTime(1000);
    expect(writes()).toHaveLength(0);
    del().on.click(ev(''));
    await settle();
    expect(writes()).toHaveLength(1);
    expect(lastWrite().colors.map((c) => c.id)).toEqual([B]);
  });

  it('disarms on blur', () => {
    del().on.click(ev(''));
    del().on.blur(ev(''));
    expect(del().tag).toMatch(/aria-label=Remove 'Brand blue'\s/);
    del().on.click(ev(''));
    expect(writes()).toHaveLength(0); // that click re-armed, did not delete
  });

  it('disarms on Escape without letting the dialog see it', () => {
    del().on.click(ev(''));
    const esc = { ...ev(''), key: 'Escape' };
    del().on.keydown(esc);
    expect(esc.stopPropagation).toHaveBeenCalled();
    expect(del().tag).toMatch(/aria-label=Remove 'Brand blue'\s/);
    const other = { ...ev(''), key: 'Escape' };
    del().on.keydown(other); // not armed: leave Escape to the dialog
    expect(other.stopPropagation).not.toHaveBeenCalled();
  });

  it('arming one entry does not arm another', () => {
    del(A).on.click(ev(''));
    expect(del(B).tag).toMatch(/aria-label=Remove 'colour 2'\s/);
  });
});

describe('an edit is applied to the palette as stored, not to this page\'s cache', () => {
  const OTHER = { id: 'from-other-browser', name: 'Teal', hex: '#008080' };
  /** Storage another browser changed after this page loaded its palette. */
  const staleSetup = () => {
    let stored: CustomPalette = {
      colors: [...FIXTURE.colors, OTHER],
      defaults: { onColor: '#00ff00', offColor: '#101010' },
    };
    const sent: Array<{ type: string; value?: CustomPalette }> = [];
    el.hass = {
      connection: {
        sendMessagePromise: async (m: { type: string; value?: CustomPalette }) => {
          sent.push(m);
          if (m.type === 'frontend/get_user_data') return { value: stored };
          if (m.type === 'frontend/set_user_data') stored = m.value!;
          return null;
        },
      },
    };
    return { sent, stored: () => stored };
  };
  const lastSet = (sent: Array<{ type: string; value?: CustomPalette }>) =>
    sent.filter((m) => m.type === 'frontend/set_user_data').at(-1)!.value!;

  it('a rename keeps what the other browser added and changed, and refreshes the cache', async () => {
    const { sent } = staleSetup();
    find(el, A, 'name-input').on.change(ev('Navy'));
    await vi.advanceTimersByTimeAsync(300);
    expect(lastSet(sent)).toEqual({
      colors: [{ ...FIXTURE.colors[0], name: 'Navy' }, FIXTURE.colors[1], OTHER],
      defaults: { onColor: '#00ff00', offColor: '#101010' },
    });
    expect(storage.getCachedPalette().colors.map((c) => c.id)).toContain(OTHER.id);
  });

  it('add, remove and default set / reset each touch only their own entry', async () => {
    const { sent } = staleSetup();
    find(el, B, 'del-btn').on.click({ ...ev(''), currentTarget: {} });
    find(el, B, 'del-btn').on.click(ev(''));
    await settle();
    expect(lastSet(sent).colors.map((c) => c.id)).toEqual([A, OTHER.id]);
    find(el, 'offColor', 'hex-input').on.change(ev('#abcdef'));
    await vi.advanceTimersByTimeAsync(300);
    expect(lastSet(sent).defaults).toEqual({ onColor: '#00ff00', offColor: '#abcdef' });
    (el as unknown as { _addColor(): void })._addColor();
    await settle();
    const added = lastSet(sent).colors;
    expect(added.slice(0, 2).map((c) => c.id)).toEqual([A, OTHER.id]);
    expect(added).toHaveLength(3);
    expect(lastSet(sent).defaults.offColor).toBe('#abcdef');
  });
});

describe('an edit inside the debounce window survives a page unload / tab hide', () => {
  const g = globalThis as unknown as { window: Record<string, unknown>; document?: unknown };
  let saved: Record<string, unknown>;
  let on: Map<string, Set<(e?: unknown) => void>>;
  let visibility = 'visible';
  // The stub exists only while a handler runs: lit's own update would trip over it.
  const emit = (type: string) => {
    g.document = { visibilityState: visibility };
    try { on.get(type)?.forEach((fn) => fn({})); } finally { delete g.document; }
  };
  beforeEach(() => {
    saved = { ...g.window };
    visibility = 'visible';
    on = new Map();
    g.window.addEventListener = (t: string, fn: (e?: unknown) => void) => {
      if (!on.has(t)) on.set(t, new Set());
      on.get(t)!.add(fn);
    };
    g.window.removeEventListener = (t: string, fn: (e?: unknown) => void) => { on.get(t)?.delete(fn); };
  });
  afterEach(() => Object.assign(g.window, saved));
  const edit = () => find(el, A, 'name-input').on.change(ev('Navy'));
  const connect = () => {
    (el as unknown as { update(): void }).update = () => {}; // no real DOM here to render into
    el.connectedCallback();
  };

  it('pagehide writes the waiting edit at once', async () => {
    connect();
    edit();
    expect(writes()).toHaveLength(0);
    emit('pagehide');
    await vi.advanceTimersByTimeAsync(0);
    expect(lastWrite().colors[0].name).toBe('Navy');
  });

  it('visibilitychange writes only once the page is hidden', async () => {
    connect();
    edit();
    emit('visibilitychange');
    await vi.advanceTimersByTimeAsync(0);
    expect(writes()).toHaveLength(0);
    visibility = 'hidden';
    emit('visibilitychange');
    await vi.advanceTimersByTimeAsync(0);
    expect(lastWrite().colors[0].name).toBe('Navy');
  });

  it('the listeners go away with the component', () => {
    connect();
    el.disconnectedCallback();
    expect(on.get('pagehide')?.size ?? 0).toBe(0);
    expect(on.get('visibilitychange')?.size ?? 0).toBe(0);
  });
});

describe('remove disarms without focus events (Safari does not focus a clicked button)', () => {
  const del = (row = A) => find(el, row, 'del-btn');
  const armedLabel = `aria-label=Remove 'Brand blue'?`;
  let down: ((e: unknown) => void) | undefined;
  let listeners: number;
  const win = () => (globalThis as unknown as { window: Record<string, unknown> }).window;
  let saved: Record<string, unknown>;
  beforeEach(() => {
    saved = { ...win() };
    listeners = 0;
    down = undefined;
    win().addEventListener = (type: string, fn: (e: unknown) => void) => {
      if (type === 'pointerdown') { down = fn; listeners++; }
    };
    win().removeEventListener = (type: string, fn: unknown) => {
      if (type === 'pointerdown' && fn === down) { down = undefined; listeners--; }
    };
  });
  afterEach(() => Object.assign(win(), saved));
  const click = (btn: object) => del().on.click({ ...ev(''), currentTarget: btn });

  it('a press anywhere else disarms; the next click arms again instead of deleting', () => {
    const btn = {};
    click(btn);
    expect(del().tag).toContain(armedLabel);
    expect(listeners).toBe(1);
    down!({ composedPath: () => [{}, el] });
    expect(del().tag).not.toContain(armedLabel);
    expect(listeners).toBe(0);
    click(btn);
    expect(del().tag).toContain(armedLabel);
    expect(writes()).toHaveLength(0);
  });

  it('a press on the armed button itself keeps it armed (its click then confirms)', () => {
    const btn = {};
    click(btn);
    down!({ composedPath: () => [btn, el] });
    expect(del().tag).toContain(armedLabel);
  });

  it('disarms by itself after about four seconds', () => {
    click({});
    vi.advanceTimersByTime(3900);
    expect(del().tag).toContain(armedLabel);
    vi.advanceTimersByTime(200);
    expect(del().tag).not.toContain(armedLabel);
    expect(listeners).toBe(0);
  });

  it('confirming, blur and leaving the page all drop the listener and the timer', () => {
    click({});
    del().on.click(ev(''));
    expect(listeners).toBe(0);
    del(B).on.click({ ...ev(''), currentTarget: {} }); // A is gone now
    del(B).on.blur(ev(''));
    expect(listeners).toBe(0);
    del(B).on.click({ ...ev(''), currentTarget: {} });
    el.disconnectedCallback();
    expect(listeners).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

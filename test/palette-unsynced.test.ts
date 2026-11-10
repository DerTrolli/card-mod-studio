/**
 * Palette edits that could not be synced (Home Assistant unreadable or
 * unwritable) are kept in localStorage AS DATA (`cms-palette-unsynced`) and
 * replayed, in order, onto the palette from the next successful read — also
 * right at load after a reload, not only on the next edit. Cleared only after
 * a successful write. Corrupt kept data is dropped, never thrown on.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CustomPalette, PaletteEdit } from '../src/utils/palette-storage.js';

type Mod = typeof import('../src/utils/palette-storage.js');
const g = globalThis as Record<string, unknown>;

const col = (id: string, name = id) => ({ id, name, hex: '#000000' });
const pal = (...c: Array<ReturnType<typeof col>>): CustomPalette => ({ colors: c, defaults: {} });
const rename = (id: string, value: string): PaletteEdit => ({ kind: 'set', id, field: 'name', value });
const names = (p: CustomPalette) => p.colors.map((c) => `${c.id}:${c.name}`);
const KEY = 'cms-palette-unsynced';

let ls: Map<string, string>;
let quotaKeys: Set<string>;
let stored: CustomPalette | null;
let failRead: boolean;
let failWrite: boolean;
let writes: CustomPalette[];
let mod: Mod;

const hass = () => ({
  connection: {
    sendMessagePromise: async (m: { type: string; value?: unknown }) => {
      if (m.type === 'frontend/get_user_data') {
        if (failRead) throw new Error('offline');
        return { value: stored };
      }
      if (failWrite) throw new Error('offline');
      stored = m.value as CustomPalette;
      writes.push(stored);
      return null;
    },
  },
});
const kept = () => JSON.parse(ls.get(KEY) ?? '[]');
/** A page reload: fresh module state, same localStorage and Home Assistant. */
async function reload() {
  vi.resetModules();
  mod = await import('../src/utils/palette-storage.js');
}

beforeEach(async () => {
  ls = new Map();
  quotaKeys = new Set();
  stored = pal(col('z'), col('q'));
  failRead = false;
  failWrite = false;
  writes = [];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  g.localStorage = {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => { if (quotaKeys.has(k)) throw new Error('QuotaExceededError'); ls.set(k, v); },
  };
  g.window = { dispatchEvent: () => true };
  await reload();
});
afterEach(() => { delete g.localStorage; delete g.window; vi.restoreAllMocks(); });

describe('edits kept as data', () => {
  it('a failed read keeps the edit in localStorage as plain data', async () => {
    failRead = true;
    await mod.updatePalette(rename('z', 'Zed'), hass());
    expect(kept()).toEqual([{ kind: 'set', id: 'z', field: 'name', value: 'Zed' }]);
    expect(writes).toEqual([]);
  });

  it('after a reload with Home Assistant reachable, the edit shows at LOAD and is written back', async () => {
    failRead = true;
    await mod.updatePalette(rename('z', 'Zed'), hass());
    await reload();
    failRead = false;
    await mod.initPaletteCache(hass());
    expect(names(mod.getCachedPalette())).toEqual(['z:Zed', 'q:q']); // not Home Assistant's older copy
    expect(names(stored!)).toEqual(['z:Zed', 'q:q']);
    expect(kept()).toEqual([]); // cleared only after the write
  });

  it('replays on top of what Home Assistant holds now (another device added a colour)', async () => {
    failRead = true;
    await mod.updatePalette(rename('z', 'Zed'), hass());
    stored = pal(col('z'), col('q'), col('new-elsewhere'));
    await reload();
    failRead = false;
    await mod.initPaletteCache(hass());
    expect(names(stored!)).toEqual(['z:Zed', 'q:q', 'new-elsewhere:new-elsewhere']);
  });

  it('several kept edits replay in order (add, rename, remove)', async () => {
    failRead = true;
    await mod.updatePalette({ kind: 'add', color: col('n', 'New') }, hass());
    await mod.updatePalette(rename('n', 'Renamed'), hass());
    await mod.updatePalette({ kind: 'default', key: 'onColor', value: '#ff0000' }, hass());
    await mod.updatePalette({ kind: 'remove', id: 'q' }, hass());
    await reload();
    failRead = false;
    await mod.initPaletteCache(hass());
    expect(names(stored!)).toEqual(['z:z', 'n:Renamed']);
    expect(stored!.defaults.onColor).toBe('#ff0000');
  });

  it('replaying twice changes nothing (idempotent)', async () => {
    const edits: PaletteEdit[] = [{ kind: 'add', color: col('n') }, rename('z', 'Zed'), { kind: 'remove', id: 'q' }];
    const once = edits.reduce(mod.applyPaletteEdit, stored!);
    expect(edits.reduce(mod.applyPaletteEdit, once)).toEqual(once);
  });

  it('a failed write at load keeps the list, still shows the replayed palette, and retries later', async () => {
    failRead = true;
    await mod.updatePalette(rename('z', 'Zed'), hass());
    await reload();
    failRead = false;
    failWrite = true;
    await mod.initPaletteCache(hass());
    expect(names(mod.getCachedPalette())).toEqual(['z:Zed', 'q:q']);
    expect(kept()).toHaveLength(1);
    failWrite = false;
    await mod.updatePalette(rename('q', 'Queue'), hass());
    expect(names(stored!)).toEqual(['z:Zed', 'q:Queue']);
    expect(kept()).toEqual([]);
  });

  it('a read that fails at load leaves the list alone (nothing written)', async () => {
    failRead = true;
    await mod.updatePalette(rename('z', 'Zed'), hass());
    await reload();
    await mod.initPaletteCache(hass()); // still offline
    expect(writes).toEqual([]);
    expect(kept()).toHaveLength(1);
  });

  it('init first run without hass, then with it: the second call does the Home Assistant read and replay', async () => {
    failRead = true;
    await mod.updatePalette(rename('z', 'Zed'), hass());
    await reload();
    failRead = false;
    await mod.initPaletteCache(undefined);
    expect(writes).toEqual([]);
    await mod.initPaletteCache(hass());
    expect(names(stored!)).toEqual(['z:Zed', 'q:q']);
  });

  it('repeated edits of one field compact to the last', async () => {
    failRead = true;
    for (const n of ['a', 'b', 'c', 'd']) await mod.updatePalette(rename('z', n), hass());
    expect(kept()).toEqual([{ kind: 'set', id: 'z', field: 'name', value: 'd' }]);
  });
});

describe('bad kept data never throws', () => {
  const BAD: Array<[string, string]> = [
    ['not JSON', '{oops'], ['an object', '{"kind":"add"}'], ['null', 'null'], ['a number', '5'],
    ['entries of the wrong shape', JSON.stringify([
      null, 3, 'x', [], {}, { kind: 'add' }, { kind: 'add', color: null }, { kind: 'add', color: { id: 1 } },
      { kind: 'remove' }, { kind: 'set', id: 'z', field: 'bogus', value: 'v' }, { kind: 'set', id: 'z', field: 'name' },
      { kind: 'default', key: 'nope' }, { kind: 'default', key: 'onColor', value: 7 }, { kind: 'wat' },
    ])],
  ];
  it.each(BAD)('%s: init and update work and nothing is replayed', async (_n, raw) => {
    ls.set(KEY, raw);
    await reload();
    await mod.initPaletteCache(hass());
    expect(names(mod.getCachedPalette())).toEqual(['z:z', 'q:q']);
    const out = await mod.updatePalette(rename('z', 'Zed'), hass());
    expect(names(out)).toEqual(['z:Zed', 'q:q']);
    expect(kept()).toEqual([]);
  });

  it('valid entries among bad ones are still replayed', async () => {
    ls.set(KEY, JSON.stringify([null, rename('q', 'Queue'), { kind: 'remove' }]));
    await reload();
    await mod.initPaletteCache(hass());
    expect(names(stored!)).toEqual(['z:z', 'q:Queue']);
  });
});

describe('storage full', () => {
  it('the kept list stays in memory and is still replayed by a later successful read', async () => {
    quotaKeys.add(KEY);
    failRead = true;
    await mod.updatePalette(rename('z', 'Zed'), hass());
    expect(ls.has(KEY)).toBe(false);
    failRead = false;
    await mod.updatePalette(rename('q', 'Queue'), hass());
    expect(names(stored!)).toEqual(['z:Zed', 'q:Queue']);
  });
});

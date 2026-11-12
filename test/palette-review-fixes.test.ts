/**
 * Palette storage fixes from a review:
 *  - a tab closing while a write is on the wire must not send the stale cache on top of it,
 *  - an edit made before `hass` exists is kept and replays when it arrives,
 *  - updatePalette says whether the edit is durable anywhere,
 *  - a failed first replay is tried again on the next init call.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CustomPalette, PaletteEdit } from '../src/utils/palette-storage.js';

type PaletteModule = typeof import('../src/utils/palette-storage.js');

class FakeLocalStorage {
  store = new Map<string, string>();
  full = false;
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) {
    if (this.full) throw new Error('QuotaExceededError');
    this.store.set(k, v);
  }
}

const col = (id: string, name = id) => ({ id, name, hex: '#000000' });
const pal = (...c: Array<ReturnType<typeof col>>): CustomPalette => ({ colors: c, defaults: {} });
const add = (id: string): PaletteEdit => ({ kind: 'add', color: col(id) });
const ids = (p: CustomPalette) => p.colors.map((c) => c.id).sort();
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

const g = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let ls: FakeLocalStorage;
let stored: CustomPalette;
let setCalls: CustomPalette[];
let failRead: boolean;
let failWrite: boolean;
/** When set, writes stay open until released (the store changes only on release). */
let holdWrites: boolean;
let held: Array<() => void>;

const hass = () => ({
  connection: {
    sendMessagePromise: (m: { type: string; value?: unknown }) => {
      if (m.type === 'frontend/get_user_data') {
        return failRead ? Promise.reject(new Error('read failed')) : Promise.resolve({ value: stored });
      }
      if (failWrite) return Promise.reject(new Error('write failed'));
      setCalls.push(m.value as CustomPalette);
      if (holdWrites) {
        return new Promise((resolve) => held.push(() => { stored = m.value as CustomPalette; resolve(null); }));
      }
      stored = m.value as CustomPalette;
      return Promise.resolve(null);
    },
  },
});

const load = async (): Promise<PaletteModule> => {
  vi.resetModules();
  return import('../src/utils/palette-storage.js');
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  saved.localStorage = g.localStorage;
  saved.window = g.window;
  ls = new FakeLocalStorage();
  g.localStorage = ls;
  g.window = { dispatchEvent: () => true };
  stored = pal(col('a'));
  setCalls = [];
  failRead = false;
  failWrite = false;
  holdWrites = false;
  held = [];
});
afterEach(() => { g.localStorage = saved.localStorage; g.window = saved.window; vi.restoreAllMocks(); });

describe('tab close while a palette write is in flight', () => {
  it('does not send the stale cache over the write on the wire; a later load ends with X and Y', async () => {
    const mod = await load();
    await mod.savePalette(pal(col('a')), undefined); // this device's cache: {a}
    stored = pal(col('a'), col('Y'));                // another device added Y
    holdWrites = true;
    void mod.updatePalette(add('X'), hass());
    await tick();
    expect(setCalls).toHaveLength(1); // {a,Y,X} is on the wire
    expect(ids(setCalls[0])).toEqual(['X', 'Y', 'a']);

    mod.flushPaletteOnUnload(hass(), true); // real pagehide
    expect(setCalls).toHaveLength(1);       // no read-less write of {a,X}
    expect(JSON.parse(ls.store.get('cms-palette-unsynced')!)).toEqual([add('X')]);

    // The page dies; the write never landed. A later page load replays X onto {a,Y}.
    const next = await load();
    holdWrites = false;
    await next.initPaletteCache(hass());
    expect(ids(stored)).toEqual(['X', 'Y', 'a']);
    expect(ids(next.getCachedPalette())).toEqual(['X', 'Y', 'a']);
  });

  it('when the write did land, a later load still has X and Y', async () => {
    const mod = await load();
    await mod.savePalette(pal(col('a')), undefined);
    stored = pal(col('a'), col('Y'));
    holdWrites = true;
    void mod.updatePalette(add('X'), hass());
    await tick();
    mod.flushPaletteOnUnload(hass(), true);
    held.forEach((r) => r()); // it landed, though the page is gone
    const next = await load();
    holdWrites = false;
    await next.initPaletteCache(hass());
    expect(ids(stored)).toEqual(['X', 'Y', 'a']);
  });
});

describe('an edit made before hass exists', () => {
  it('is kept and reaches Home Assistant when hass arrives; the next edit does not erase it', async () => {
    const mod = await load();
    await mod.initPaletteCache(undefined);
    await mod.updatePalette(add('X'), undefined);
    expect(JSON.parse(ls.store.get('cms-palette-unsynced')!)).toEqual([add('X')]);

    await mod.initPaletteCache(hass());
    expect(ids(stored)).toEqual(['X', 'a']);
    expect(ids(mod.getCachedPalette())).toEqual(['X', 'a']);

    await mod.updatePalette(add('Z'), hass());
    expect(ids(stored)).toEqual(['X', 'Z', 'a']);
  });
});

describe('updatePalette reports whether the edit is durable', () => {
  it('reached Home Assistant: (true, true)', async () => {
    const mod = await load();
    const cb = vi.fn();
    await mod.updatePalette(add('X'), hass(), cb);
    expect(cb).toHaveBeenCalledWith(true, true);
  });

  it('Home Assistant down, storage fine: (false, true)', async () => {
    const mod = await load();
    failRead = true;
    const cb = vi.fn();
    await mod.updatePalette(add('X'), hass(), cb);
    expect(cb).toHaveBeenCalledWith(false, true);
  });

  it('Home Assistant down and storage full: (false, false), then kept again after a good edit', async () => {
    const mod = await load();
    failRead = true;
    ls.full = true;
    const cb = vi.fn();
    await mod.updatePalette(add('X'), hass(), cb);
    expect(cb).toHaveBeenLastCalledWith(false, false);

    ls.full = false;
    await mod.updatePalette(add('Y'), hass(), cb);
    expect(cb).toHaveBeenLastCalledWith(false, true);
  });

  it('no hass and storage full: (false, false)', async () => {
    const mod = await load();
    ls.full = true;
    const cb = vi.fn();
    await mod.updatePalette(add('X'), undefined, cb);
    expect(cb).toHaveBeenCalledWith(false, false);
  });

  it('storage full but Home Assistant reached: still durable', async () => {
    const mod = await load();
    ls.full = true;
    const cb = vi.fn();
    await mod.updatePalette(add('X'), hass(), cb);
    expect(cb).toHaveBeenCalledWith(true, true);
  });
});

describe('replay is retried after a failed first read', () => {
  it('the next initPaletteCache(hass) replays the kept edits', async () => {
    ls.store.set('cms-palette-unsynced', JSON.stringify([add('X')]));
    const mod = await load();
    failRead = true;
    await mod.initPaletteCache(hass());
    expect(ids(stored)).toEqual(['a']);

    failRead = false;
    await mod.initPaletteCache(hass());
    expect(ids(stored)).toEqual(['X', 'a']);
    expect(ls.store.get('cms-palette-unsynced')).toBe('[]');
  });
});

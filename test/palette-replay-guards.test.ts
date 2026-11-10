/**
 * Guards around the palette replay done by initPaletteCache:
 *  - a replay that could not read Home Assistant must not put the stale local
 *    copy over a cache that holds edits (they would vanish from the pickers);
 *  - an edit made while the replay's read is in flight stays in the cache
 *    (`pendingUpdates === 0` decides whether the replayed copy is newer);
 *  - a replay write that is in flight (`writing`) blocks the read-less write
 *    a real `pagehide` would otherwise send on top of it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CustomPalette, PaletteEdit } from '../src/utils/palette-storage.js';

type Mod = typeof import('../src/utils/palette-storage.js');
const g = globalThis as Record<string, unknown>;

const col = (id: string) => ({ id, name: id, hex: '#000000' });
const pal = (...c: Array<ReturnType<typeof col>>): CustomPalette => ({ colors: c, defaults: {} });
const add = (id: string): PaletteEdit => ({ kind: 'add', color: col(id) });
const ids = (p: CustomPalette) => p.colors.map((c) => c.id);
const KEY = 'cms-palette-unsynced';
const LS = 'cms-palette';

let ls: Map<string, string>;
let quotaKeys: Set<string>;
let stored: CustomPalette;
let failRead: boolean;
/** A write whose palette holds this colour id is refused. */
let failWriteWith: string | null;
/** The next read (or write) is held until released. */
let holdRead: boolean;
let holdWrite: boolean;
let release: Array<() => void>;
let sentWrites: CustomPalette[];
let mod: Mod;

const hass = () => ({
  connection: {
    sendMessagePromise: (m: { type: string; value?: unknown }): Promise<unknown> => {
      if (m.type === 'frontend/get_user_data') {
        if (failRead) return Promise.reject(new Error('offline'));
        if (holdRead) {
          holdRead = false;
          return new Promise((r) => release.push(() => r({ value: stored })));
        }
        return Promise.resolve({ value: stored });
      }
      const value = m.value as CustomPalette;
      sentWrites.push(value);
      if (failWriteWith && ids(value).includes(failWriteWith)) return Promise.reject(new Error('offline'));
      const done = () => { stored = value; return null; };
      if (holdWrite) {
        holdWrite = false;
        return new Promise((r) => release.push(() => r(done())));
      }
      return Promise.resolve(done());
    },
  },
});
const kept = (): PaletteEdit[] => JSON.parse(ls.get(KEY) ?? '[]');
async function reload() {
  vi.resetModules();
  mod = await import('../src/utils/palette-storage.js');
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(async () => {
  ls = new Map();
  quotaKeys = new Set();
  stored = pal(col('h'));
  failRead = false;
  failWriteWith = null;
  holdRead = false;
  holdWrite = false;
  release = [];
  sentWrites = [];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  g.localStorage = {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => { if (quotaKeys.has(k)) throw new Error('QuotaExceededError'); ls.set(k, v); },
  };
  g.window = { dispatchEvent: () => true };
  await reload();
});
afterEach(() => { delete g.localStorage; delete g.window; vi.restoreAllMocks(); });

describe('replay that could not read Home Assistant', () => {
  it('keeps a pending edit in view while storage is full, and replays it later', async () => {
    quotaKeys.add(KEY);
    quotaKeys.add(LS);
    failRead = true;
    await mod.updatePalette(add('x'), hass());
    expect(ids(mod.getCachedPalette())).toEqual(['x']);

    await mod.initPaletteCache(hass()); // replay: still offline
    expect(ids(mod.getCachedPalette())).toEqual(['x']); // not the stale, empty local copy
    expect(sentWrites).toEqual([]);

    failRead = false; // later: the kept edit still replays
    await mod.initPaletteCache(hass());
    expect(ids(stored)).toEqual(['h', 'x']);
  });

  it('on a fresh page the kept edits show on top of the local copy', async () => {
    failRead = true;
    await mod.updatePalette(add('x'), hass());
    await reload();
    await mod.initPaletteCache(hass()); // offline at load
    expect(ids(mod.getCachedPalette())).toEqual(['x']);
  });
});

describe('an edit made while the replay reads Home Assistant', () => {
  async function startReplay() {
    failRead = true;
    await mod.updatePalette(add('x'), hass()); // kept: Home Assistant was offline
    await reload();
    failRead = false;
    holdRead = true;
    const init = mod.initPaletteCache(hass());
    await settle();
    expect(release).toHaveLength(1); // the replay's read is in flight
    return { init };
  }

  it('stays in the cache and ends up in Home Assistant', async () => {
    const { init } = await startReplay();
    const update = mod.updatePalette(add('z'), hass());
    release[0]();
    await init;
    expect(ids(mod.getCachedPalette())).toContain('z'); // the replayed copy has no z
    await update;
    expect(ids(stored)).toEqual(['h', 'x', 'z']);
    expect(ids(mod.getCachedPalette())).toEqual(['h', 'x', 'z']);
  });

  it('is on the kept list when its write fails', async () => {
    const { init } = await startReplay();
    failWriteWith = 'z';
    const update = mod.updatePalette(add('z'), hass());
    release[0]();
    await init;
    expect(ids(mod.getCachedPalette())).toContain('z');
    await update;
    expect(kept()).toEqual([add('z')]);
    expect(ids(stored)).not.toContain('z');
  });
});

describe('a replay write in flight and a real pagehide', () => {
  it('sends no read-less write on top of it', async () => {
    failRead = true;
    await mod.updatePalette(add('q'), hass()); // kept: [add q]
    await reload();
    failRead = false;
    holdWrite = true;
    const init = mod.initPaletteCache(hass());
    await settle();
    expect(sentWrites).toHaveLength(1); // the replay's write, held
    // an unfinished update carrying the same edit: nothing else is on the kept list
    const update = mod.updatePalette(add('q'), hass());
    mod.flushPaletteOnUnload(hass(), true);
    expect(sentWrites).toHaveLength(1);
    release[0]();
    await init;
    await update;
  });
});

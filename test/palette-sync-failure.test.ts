/**
 * updatePalette when Home Assistant cannot be read or written. After a failed
 * READ the only palette in hand is this browser's older copy; writing it
 * back replaced the real one (colours added on another device were lost).
 * Mirrors preset-sync-failure.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CustomPalette, PaletteEdit } from '../src/utils/palette-storage.js';

type PaletteModule = typeof import('../src/utils/palette-storage.js');

class FakeLocalStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
}

const col = (id: string, name = id) => ({ id, name, hex: '#000000' });
const pal = (...c: Array<ReturnType<typeof col>>): CustomPalette => ({ colors: c, defaults: {} });
const rename = (id: string, name: string): PaletteEdit => ({ kind: 'set', id, field: 'name', value: name });
const names = (p: CustomPalette) => p.colors.map((c) => `${c.id}:${c.name}`);

describe('updatePalette after a failed Home Assistant read / write', () => {
  let mod: PaletteModule;
  let stored: CustomPalette;
  let writes: CustomPalette[];
  let failRead: boolean;
  let failWrite: boolean;
  const g = globalThis as Record<string, unknown>;
  const saved: Record<string, unknown> = {};
  const hass = () => ({
    connection: {
      sendMessagePromise: async (m: { type: string; value?: unknown }) => {
        if (m.type === 'frontend/get_user_data') {
          if (failRead) throw new Error('read failed');
          return { value: stored };
        }
        if (failWrite) throw new Error('write failed');
        stored = m.value as CustomPalette;
        writes.push(stored);
        return null;
      },
    },
  });

  beforeEach(async () => {
    vi.resetModules();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    saved.localStorage = g.localStorage;
    saved.window = g.window;
    g.localStorage = new FakeLocalStorage();
    g.window = { dispatchEvent: () => true };
    writes = [];
    failRead = false;
    failWrite = false;
    stored = pal(col('z'), col('q'));
    mod = await import('../src/utils/palette-storage.js');
  });
  afterEach(() => { g.localStorage = saved.localStorage; g.window = saved.window; vi.restoreAllMocks(); });

  it('read fails: nothing is written to Home Assistant (stored {z, q} keeps q), the change stays local', async () => {
    // this browser only ever saw z
    (g.localStorage as FakeLocalStorage).setItem('cms-palette', JSON.stringify(pal(col('z'))));
    failRead = true;
    await mod.initPaletteCache(hass()); // the panel primed the cache from the local copy
    const out = await mod.updatePalette(rename('z', 'Zed'), hass());
    expect(writes).toEqual([]);
    expect(names(stored)).toEqual(['z:z', 'q:q']); // untouched
    expect(names(out)).toEqual(['z:Zed']);
    expect(names(mod.getCachedPalette())).toEqual(['z:Zed']);
    expect(JSON.parse((g.localStorage as FakeLocalStorage).getItem('cms-palette')!).colors[0].name).toBe('Zed');
  });

  it('recovery: the next successful read gets the kept change applied to the REAL palette', async () => {
    (g.localStorage as FakeLocalStorage).setItem('cms-palette', JSON.stringify(pal(col('z'))));
    failRead = true;
    await mod.initPaletteCache(hass());
    await mod.updatePalette(rename('z', 'Zed'), hass());
    failRead = false;
    await mod.updatePalette(rename('q', 'Queue'), hass());
    expect(writes).toHaveLength(1);
    expect(names(stored)).toEqual(['z:Zed', 'q:Queue']); // both edits, nothing lost
    // synced: a later edit does not replay the old one
    stored = pal(col('z', 'Other device'), col('q'));
    await mod.updatePalette(rename('q', 'Again'), hass());
    expect(names(stored)).toEqual(['z:Other device', 'q:Again']);
  });

  it('write fails: kept locally, and replayed on the next edit that can write', async () => {
    failWrite = true;
    const out = await mod.updatePalette(rename('z', 'Zed'), hass());
    expect(writes).toEqual([]);
    expect(names(out)).toEqual(['z:Zed', 'q:q']);
    expect(JSON.parse((g.localStorage as FakeLocalStorage).getItem('cms-palette')!).colors[0].name).toBe('Zed');
    failWrite = false;
    await mod.updatePalette(rename('q', 'Queue'), hass());
    expect(names(stored)).toEqual(['z:Zed', 'q:Queue']);
  });

  it('no Home Assistant connection: unchanged behaviour (local only, no backlog to replay)', async () => {
    const out = await mod.updatePalette(rename('z', 'Zed'), undefined);
    expect(out.colors).toEqual([]); // nothing stored locally to rename: cache was empty
    expect(writes).toEqual([]);
    await mod.updatePalette(rename('q', 'Queue'), hass());
    expect(names(stored)).toEqual(['z:z', 'q:Queue']);
  });

  it('a healthy read and write still writes stored + change', async () => {
    await mod.updatePalette(rename('z', 'Zed'), hass());
    expect(names(writes[0])).toEqual(['z:Zed', 'q:q']);
  });
});

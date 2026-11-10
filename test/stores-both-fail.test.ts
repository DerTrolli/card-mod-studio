/**
 * Home Assistant unreachable AND the browser refusing localStorage writes
 * (nothing was ever stored locally): the palette and the preset list must
 * keep showing what this page already knows, plus the new change — not just
 * the change. Home Assistant's own data is never touched in that state, and
 * after it is reachable again the kept changes are applied once.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { updatePresets, type StylePreset } from '../src/utils/preset-storage.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';
import type { CustomPalette, PaletteEdit } from '../src/utils/palette-storage.js';

const g = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};

/** A browser whose storage refuses every write and so never holds anything. */
class NoWriteStorage {
  getItem() { return null; }
  setItem() { throw new Error('QuotaExceededError'); }
}

function fakeHass<T>(initial: T) {
  const box = { stored: initial, failRead: false, failWrite: false, sets: 0 };
  const hass = {
    connection: {
      async sendMessagePromise(msg: Record<string, unknown>) {
        if (msg.type === 'frontend/get_user_data') {
          if (box.failRead) throw new Error('offline');
          return { value: box.stored };
        }
        if (box.failWrite) throw new Error('offline');
        box.stored = msg.value as T;
        box.sets++;
        return null;
      },
    },
  };
  return { hass, box };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  saved.localStorage = g.localStorage;
  saved.window = g.window;
  g.localStorage = new NoWriteStorage();
  g.window = { dispatchEvent: () => true };
});
afterEach(() => { g.localStorage = saved.localStorage; g.window = saved.window; vi.restoreAllMocks(); });

// ---- palette ---------------------------------------------------------------

const col = (id: string) => ({ id, name: id, hex: '#000000' });
const ids = (p: CustomPalette) => p.colors.map((c) => c.id);
const add = (id: string): PaletteEdit => ({ kind: 'add', color: col(id) });

describe('palette: both stores fail', () => {
  async function setup() {
    vi.resetModules();
    const mod = await import('../src/utils/palette-storage.js');
    const { hass, box } = fakeHass<CustomPalette>({ colors: ['a', 'b', 'c', 'd', 'e'].map(col), defaults: {} });
    await mod.initPaletteCache(hass); // the page learns the 5 colours from Home Assistant
    expect(ids(mod.getCachedPalette())).toEqual(['a', 'b', 'c', 'd', 'e']);
    return { mod, hass, box };
  }

  it('an added colour shows next to the five, with the could-not-be-saved flag', async () => {
    const { mod, hass, box } = await setup();
    box.failRead = true;
    box.failWrite = true;
    const sync: Array<[boolean, boolean]> = [];
    const out = await mod.updatePalette(add('f'), hass, (reached, kept) => sync.push([reached, kept]));
    expect(ids(out)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(ids(mod.getCachedPalette())).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(sync).toEqual([[false, false]]); // not on Home Assistant, not on this device
    expect(box.sets).toBe(0);
    expect(ids(box.stored)).toEqual(['a', 'b', 'c', 'd', 'e']); // untouched
  });

  it('a following edit (typing a hex) still shows every row', async () => {
    const { mod, hass, box } = await setup();
    box.failRead = true;
    box.failWrite = true;
    await mod.updatePalette(add('f'), hass);
    const out = await mod.updatePalette({ kind: 'set', id: 'f', field: 'hex', value: '#123456' }, hass);
    expect(ids(out)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(out.colors.find((c) => c.id === 'f')!.hex).toBe('#123456');
    expect(ids(mod.getCachedPalette())).toHaveLength(6);
  });

  it('reconnect: the next successful read shows Home Assistant data plus the kept edits, once', async () => {
    const { mod, hass, box } = await setup();
    box.failRead = true;
    box.failWrite = true;
    await mod.updatePalette(add('f'), hass);
    await mod.updatePalette({ kind: 'set', id: 'f', field: 'hex', value: '#123456' }, hass);
    box.failRead = false;
    box.failWrite = false;
    // Meanwhile another device added a colour: Home Assistant's data wins, the kept edits go on top.
    box.stored = { colors: ['a', 'b', 'c', 'd', 'e', 'x'].map(col), defaults: {} };
    const out = await mod.updatePalette(add('g'), hass);
    expect(ids(out)).toEqual(['a', 'b', 'c', 'd', 'e', 'x', 'f', 'g']);
    expect(ids(box.stored)).toEqual(['a', 'b', 'c', 'd', 'e', 'x', 'f', 'g']);
    expect(box.stored.colors.find((c) => c.id === 'f')!.hex).toBe('#123456');
    expect(box.sets).toBe(1);
    // Nothing is replayed a second time.
    const again = await mod.updatePalette(add('h'), hass);
    expect(ids(again)).toEqual(['a', 'b', 'c', 'd', 'e', 'x', 'f', 'g', 'h']);
  });

  it('a stale cache never overwrites Home Assistant when it IS readable', async () => {
    const { mod, hass, box } = await setup();
    box.stored = { colors: ['a', 'b', 'c', 'd', 'e', 'x', 'y'].map(col), defaults: {} }; // other device
    const out = await mod.updatePalette(add('f'), hass);
    expect(ids(out)).toEqual(['a', 'b', 'c', 'd', 'e', 'x', 'y', 'f']);
    expect(ids(box.stored)).toEqual(['a', 'b', 'c', 'd', 'e', 'x', 'y', 'f']);
  });

  it('a page whose cache was never loaded still builds on the local copy', async () => {
    vi.resetModules();
    const mod = await import('../src/utils/palette-storage.js');
    g.localStorage = {
      getItem: (k: string) => (k === 'cms-palette' ? JSON.stringify({ colors: [col('l1')], defaults: {} }) : null),
      setItem() {},
    };
    const { hass, box } = fakeHass<CustomPalette>({ colors: [col('real')], defaults: {} });
    box.failRead = true;
    box.failWrite = true;
    const out = await mod.updatePalette(add('n'), hass);
    expect(ids(out)).toEqual(['l1', 'n']);
  });
});

// ---- presets ---------------------------------------------------------------

const STATE = mapToStudioState(parseCardModConfig({ type: 'tile' }), 'tile');
const preset = (name: string): StylePreset => ({ name, state: STATE });
const names = (l: StylePreset[]) => l.map((p) => p.name);
const four = () => ['p1', 'p2', 'p3', 'p4'].map(preset);

describe('presets: both stores fail', () => {
  it('a save lists the four that existed plus the new one (the panel list is the base)', async () => {
    const { hass, box } = fakeHass(four());
    box.failRead = true;
    box.failWrite = true;
    const sync: Array<[boolean, boolean]> = [];
    const change = { kind: 'save' as const, preset: preset('new') };
    const shown = [...four(), change.preset]; // the panel applies the change at once and passes its list
    const out = await updatePresets(change, hass, (r, k) => sync.push([r, k]), shown);
    expect(names(out)).toEqual(['p1', 'p2', 'p3', 'p4', 'new']);
    expect(sync).toEqual([[false, false]]);
    expect(box.sets).toBe(0);
    expect(names(box.stored)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('reconnect: Home Assistant data plus the kept save, once', async () => {
    const { hass, box } = fakeHass(four());
    box.failRead = true;
    box.failWrite = true;
    const change = { kind: 'save' as const, preset: preset('new') };
    await updatePresets(change, hass, undefined, [...four(), change.preset]);
    box.failRead = false;
    box.failWrite = false;
    box.stored = [...four(), preset('other-device')];
    const next = { kind: 'save' as const, preset: preset('later') };
    const out = await updatePresets(next, hass, undefined, [...four(), change.preset, next.preset]);
    expect(names(out)).toEqual(['p1', 'p2', 'p3', 'p4', 'other-device', 'new', 'later']);
    expect(names(box.stored)).toEqual(names(out));
  });

  it('a stale panel list never wins when Home Assistant IS readable', async () => {
    const { hass, box } = fakeHass([...four(), preset('other-device')]);
    const change = { kind: 'save' as const, preset: preset('new') };
    const out = await updatePresets(change, hass, undefined, [...four(), change.preset]);
    expect(names(out)).toEqual(['p1', 'p2', 'p3', 'p4', 'other-device', 'new']);
    expect(names(box.stored)).toEqual(names(out));
  });
});

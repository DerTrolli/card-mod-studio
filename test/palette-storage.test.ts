/**
 * Unit tests for palette-storage's cache init race (the "save during init is
 * clobbered by the stale load" bug): initPaletteCache used to assign
 * `cache = await loadPalette(hass)` unconditionally, so a savePalette issued
 * between init start and load resolution was overwritten in memory by the
 * stale load — and the NEXT save then persisted the stale palette
 * (permanent loss). The fix: a dirty flag makes a completing init keep the
 * newer in-memory palette.
 *
 * The Vitest environment is plain Node — window/localStorage are stubbed,
 * and the module is re-imported per test (vi.resetModules) so each test
 * gets a fresh module-level cache/initPromise/dirty flag.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CustomPalette } from '../src/utils/palette-storage.js';

type PaletteModule = typeof import('../src/utils/palette-storage.js');

class FakeLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** hass whose get_user_data hangs until `loadDeferred` resolves; set_user_data resolves immediately. */
function makeHassWithDelayedLoad(loadDeferred: { promise: Promise<unknown> }) {
  const sendMessagePromise = vi.fn((msg: Record<string, unknown>) => {
    if (msg.type === 'frontend/get_user_data') return loadDeferred.promise;
    return Promise.resolve(null);
  });
  return { hass: { connection: { sendMessagePromise } }, sendMessagePromise };
}

const STORED_PALETTE: CustomPalette = {
  colors: [{ id: 'stored', name: 'Stored', hex: '#000000' }],
  defaults: {},
};

const NEW_PALETTE: CustomPalette = {
  colors: [{ id: 'new-color', name: 'Mine', hex: '#123456' }],
  defaults: { onColor: '#ff0000' },
};

describe('palette-storage cache init race', () => {
  let mod: PaletteModule;
  const savedGlobals: Record<string, unknown> = {};

  beforeEach(async () => {
    vi.resetModules();
    savedGlobals.localStorage = (globalThis as Record<string, unknown>).localStorage;
    savedGlobals.window = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).localStorage = new FakeLocalStorage();
    (globalThis as Record<string, unknown>).window = { dispatchEvent: () => true };
    mod = await import('../src/utils/palette-storage.js');
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).localStorage = savedGlobals.localStorage;
    (globalThis as Record<string, unknown>).window = savedGlobals.window;
  });

  it('a save issued while the init load is in flight survives the load resolving (the race)', async () => {
    const d = deferred<{ value: unknown }>();
    const { hass } = makeHassWithDelayedLoad(d);

    const initP = mod.initPaletteCache(hass);

    // Save lands BEFORE the load resolves — the classic mid-init mutation.
    await mod.savePalette(NEW_PALETTE, hass);
    expect(mod.getCachedPalette().colors[0]?.id).toBe('new-color');

    // Now the (stale) load resolves with the palette as it was pre-save.
    d.resolve({ value: STORED_PALETTE });
    await initP;

    // Before the fix, the cache reverted to STORED_PALETTE here.
    expect(mod.getCachedPalette().colors[0]?.id).toBe('new-color');
    expect(mod.getCachedPalette().defaults.onColor).toBe('#ff0000');
  });

  it('the follow-up persist after the race writes the NEW palette, not the stale one', async () => {
    const d = deferred<{ value: unknown }>();
    const { hass, sendMessagePromise } = makeHassWithDelayedLoad(d);

    const initP = mod.initPaletteCache(hass);
    await mod.savePalette(NEW_PALETTE, hass);
    d.resolve({ value: STORED_PALETTE });
    await initP;

    // A second save (any later mutation) must persist the new data — before
    // the fix it re-persisted the stale loaded palette, losing the first
    // save permanently.
    await mod.savePalette(mod.getCachedPalette(), hass);
    const setCalls = sendMessagePromise.mock.calls
      .map(([msg]) => msg)
      .filter((msg) => msg.type === 'frontend/set_user_data');
    const lastPersisted = setCalls[setCalls.length - 1]?.value as CustomPalette;
    expect(lastPersisted.colors[0]?.id).toBe('new-color');
    expect(lastPersisted.defaults.onColor).toBe('#ff0000');
  });

  it('without a concurrent save, init still primes the cache from storage', async () => {
    const d = deferred<{ value: unknown }>();
    const { hass } = makeHassWithDelayedLoad(d);

    const initP = mod.initPaletteCache(hass);
    expect(mod.getCachedPalette().colors).toEqual([]); // not primed yet

    d.resolve({ value: STORED_PALETTE });
    await initP;
    expect(mod.getCachedPalette().colors[0]?.id).toBe('stored');
  });

  it('init stays a one-shot: repeated calls reuse the same promise and load once', async () => {
    const d = deferred<{ value: unknown }>();
    const { hass, sendMessagePromise } = makeHassWithDelayedLoad(d);

    const p1 = mod.initPaletteCache(hass);
    const p2 = mod.initPaletteCache(hass);
    expect(p1).toBe(p2);

    d.resolve({ value: STORED_PALETTE });
    await p1;
    const getCalls = sendMessagePromise.mock.calls.filter(
      ([msg]) => msg.type === 'frontend/get_user_data',
    );
    expect(getCalls).toHaveLength(1);
  });

  it('a save AFTER init completed still updates the cache normally', async () => {
    const d = deferred<{ value: unknown }>();
    const { hass } = makeHassWithDelayedLoad(d);

    const initP = mod.initPaletteCache(hass);
    d.resolve({ value: STORED_PALETTE });
    await initP;
    expect(mod.getCachedPalette().colors[0]?.id).toBe('stored');

    await mod.savePalette(NEW_PALETTE, hass);
    expect(mod.getCachedPalette().colors[0]?.id).toBe('new-color');
  });
});

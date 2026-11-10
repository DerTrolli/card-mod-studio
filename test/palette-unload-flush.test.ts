/**
 * A palette edit made just before the tab closes must reach Home Assistant,
 * without ever overwriting a colour another device added in the meantime.
 *
 * updatePalette re-reads the stored palette first; on a real unload that read
 * never completes. On a real `pagehide` the manager therefore sends the cache
 * directly. On a mere `visibilitychange -> hidden` it must NOT: the page
 * lives on, the queued update re-reads Home Assistant and would find the list
 * the flush had just clobbered. In both cases (and while a read is running)
 * the unfinished edit is kept in localStorage and replayed on the next load.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import type { CustomPalette } from '../src/utils/palette-storage.js';

type El = {
  hass?: unknown; connectedCallback(): void; disconnectedCallback(): void;
  performUpdate: () => void; _updateColor(id: string, f: 'hex' | 'name', v: string): void;
};
type Storage = typeof import('../src/utils/palette-storage.js');
const g = globalThis as Record<string, unknown>;
let handlers: Record<string, (e?: unknown) => void>;
let ls: Map<string, string>;
let sent: Array<{ type: string; value?: CustomPalette }>;
let stored: CustomPalette;
let hang: boolean;
let release: Array<() => void>;
let Mod: new () => El;
let storage: Storage;

const col = (id: string, name = id) => ({ id, name, hex: '#000000' });

/** Home Assistant user storage: a real store that another device can change. */
const hass = () => ({
  connection: {
    sendMessagePromise: (m: { type: string; value?: CustomPalette }) => {
      sent.push(m);
      if (m.type === 'frontend/get_user_data') {
        return hang
          ? new Promise((r) => release.push(() => r({ value: stored }))) // answers with the store as it is later
          : Promise.resolve({ value: stored });
      }
      stored = m.value!;
      return Promise.resolve(null);
    },
  },
});

beforeEach(async () => {
  vi.resetModules();
  const registry = new FakeCustomElementRegistry();
  g.customElements = registry;
  registry.define('card-mod', class {});
  handlers = {};
  ls = new Map();
  sent = [];
  release = [];
  hang = false;
  stored = { colors: [col('c1', 'Old')], defaults: {} };
  g.localStorage = { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => { ls.set(k, v); } };
  g.window = {
    dispatchEvent: () => true, removeEventListener() {},
    addEventListener(t: string, h: () => void) { handlers[t] = h; },
  };
  await import('../src/editor/cms-palette-manager.js'); // lit must load before `document` is stubbed
  g.document = { visibilityState: 'visible' };
  storage = await import('../src/utils/palette-storage.js');
  Mod = registry.get('cms-palette-manager') as new () => El;
});
afterEach(() => { delete g.document; delete g.window; delete g.localStorage; });

async function open() {
  await storage.savePalette({ colors: [col('c1', 'Old')], defaults: {} }, undefined); // this page's cache
  sent = [];
  const el = new Mod();
  el.performUpdate = () => {};
  el.hass = hass();
  el.connectedCallback();
  return el;
}
const writes = () => sent.filter((m) => m.type === 'frontend/set_user_data');
const names = (p: CustomPalette) => p.colors.map((c) => `${c.id}:${c.name}`);
const kept = () => JSON.parse(ls.get('cms-palette-unsynced') ?? '[]');
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe('palette edit right before the page goes away', () => {
  it('nothing pending: pagehide writes nothing', async () => {
    await open();
    handlers.pagehide();
    expect(writes()).toHaveLength(0);
  });

  it('real pagehide: the edit is written without a read first, and kept locally', async () => {
    hang = true; // an unload cancels reads
    const el = await open();
    el._updateColor('c1', 'name', 'New'); // debounced
    expect(writes()).toHaveLength(0);
    handlers.pagehide({ persisted: false });
    expect(writes()).toHaveLength(1);
    expect(writes()[0].value!.colors[0].name).toBe('New');
    expect(JSON.parse(ls.get('cms-palette')!).colors[0].name).toBe('New');
    expect(kept()).toEqual([{ kind: 'set', id: 'c1', field: 'name', value: 'New' }]);
  });

  it('pagehide without an event object counts as a real one', async () => {
    hang = true;
    const el = await open();
    el._updateColor('c1', 'name', 'New');
    handlers.pagehide();
    expect(writes()).toHaveLength(1);
  });

  it('pagehide into the back/forward cache (persisted) writes nothing: the page may come back', async () => {
    hang = true;
    const el = await open();
    el._updateColor('c1', 'name', 'New');
    handlers.pagehide({ persisted: true });
    expect(writes()).toHaveLength(0);
    expect(kept()).toHaveLength(1);
  });

  it('tab hidden: nothing is sent, the edit is kept for a reload', async () => {
    hang = true;
    const el = await open();
    el._updateColor('c1', 'name', 'New');
    (g.document as { visibilityState: string }).visibilityState = 'hidden';
    handlers.visibilitychange();
    expect(writes()).toHaveLength(0);
    expect(kept()).toEqual([{ kind: 'set', id: 'c1', field: 'name', value: 'New' }]);
    expect(JSON.parse(ls.get('cms-palette')!).colors[0].name).toBe('New');
  });

  it('tab hidden, another device adds a colour, tab visible again: nothing is lost', async () => {
    const el = await open();
    el._updateColor('c1', 'name', 'New');
    stored = { colors: [col('c1', 'Old'), col('other', 'From phone')], defaults: {} }; // changed since the cache
    (g.document as { visibilityState: string }).visibilityState = 'hidden';
    handlers.visibilitychange();
    (g.document as { visibilityState: string }).visibilityState = 'visible';
    handlers.visibilitychange();
    await tick();
    await new Promise((r) => setTimeout(r, 5));
    expect(names(stored)).toEqual(['c1:New', 'other:From phone']);
    expect(names(storage.getCachedPalette())).toEqual(['c1:New', 'other:From phone']);
    expect(kept()).toEqual([]); // written, nothing left to replay
  });

  it('a read already running when the page leaves: not overwritten, kept for the reload', async () => {
    hang = true;
    const el = await open();
    el._updateColor('c1', 'name', 'New');
    (handlers.pagehide as () => void)(); // flushes the debounce; the update starts its read
    expect(writes()).toHaveLength(1); // first flush: no read had started yet
    sent = [];
    // a second edit while that update's read is hanging
    void storage.updatePalette({ kind: 'set', id: 'c1', field: 'name', value: 'Now' }, el.hass as never);
    await tick();
    expect(sent.filter((m) => m.type === 'frontend/get_user_data').length).toBeGreaterThan(0);
    handlers.pagehide({ persisted: false });
    expect(writes()).toHaveLength(0);
    expect(kept().map((e: { value: string }) => e.value)).toContain('Now');
  });

  it('the edit reaches Home Assistant when its read completes (page survived)', async () => {
    hang = true;
    const el = await open();
    el._updateColor('c1', 'name', 'New');
    handlers.visibilitychange(); // visible: no-op
    el.disconnectedCallback(); // flushes the debounce
    await tick();
    stored = { colors: [col('c1', 'Old'), col('other')], defaults: {} };
    release.splice(0).forEach((r) => r());
    await new Promise((r) => setTimeout(r, 5));
    expect(names(stored)).toEqual(['c1:New', 'other:other']);
  });
});

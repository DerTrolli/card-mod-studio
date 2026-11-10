/**
 * A palette edit made just before the tab closes must reach Home Assistant.
 * updatePalette re-reads the stored palette first; on a real unload that read
 * never completes, so the write never went out and the next load took Home
 * Assistant's older copy over localStorage. On pagehide / hidden the manager
 * now sends the current cache directly.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import type { CustomPalette } from '../src/utils/palette-storage.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

type El = {
  hass?: unknown; connectedCallback(): void; disconnectedCallback(): void;
  performUpdate: () => void; _updateColor(id: string, f: 'hex' | 'name', v: string): void;
};
let Mod: new () => El;
let storage: typeof import('../src/utils/palette-storage.js');
const g = globalThis as Record<string, unknown>;
let handlers: Record<string, () => void>;
let ls: Map<string, string>;
let sent: Array<{ type: string; value?: CustomPalette }>;

beforeAll(async () => {
  g.localStorage = { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => { ls.set(k, v); } };
  g.window = {
    dispatchEvent: () => true, removeEventListener() {},
    addEventListener(t: string, h: () => void) { handlers[t] = h; },
  };
  await import('../src/editor/cms-palette-manager.js');
  storage = await import('../src/utils/palette-storage.js');
  Mod = registry.get('cms-palette-manager') as new () => El;
});

/** Reads hang forever (an unload cancels them); writes are recorded. */
const hungReadHass = () => ({
  connection: {
    sendMessagePromise: (m: { type: string; value?: CustomPalette }) => {
      sent.push(m);
      return m.type === 'frontend/get_user_data' ? new Promise(() => {}) : Promise.resolve(null);
    },
  },
});

async function open(hass: unknown) {
  handlers = {};
  ls = new Map();
  sent = [];
  g.document = { visibilityState: 'visible' };
  await storage.savePalette({ colors: [{ id: 'c1', name: 'Old', hex: '#000000' }], defaults: {} }, undefined);
  sent = [];
  const el = new Mod();
  el.performUpdate = () => {};
  el.hass = hass;
  el.connectedCallback();
  return el;
}
const writes = () => sent.filter((m) => m.type === 'frontend/set_user_data');
const localName = () => JSON.parse(ls.get('cms-palette')!).colors[0].name;

describe('palette edit right before the page goes away', () => {
  beforeEach(() => { delete g.document; });
  afterEach(() => { delete g.document; });

  // First: the hung updates of the tests below stay in flight for the rest of the file.
  it('nothing pending: pagehide writes nothing', async () => {
    await open(hungReadHass());
    handlers.pagehide();
    expect(writes()).toHaveLength(0);
  });

  it('pagehide: the edit is sent to Home Assistant without waiting for the read, and kept locally', async () => {
    const el = await open(hungReadHass());
    el._updateColor('c1', 'name', 'New'); // debounced
    expect(writes()).toHaveLength(0);
    handlers.pagehide();
    expect(writes()).toHaveLength(1);
    expect(writes()[0].value!.colors[0].name).toBe('New');
    expect(localName()).toBe('New');
  });

  it('tab hidden: same', async () => {
    const el = await open(hungReadHass());
    el._updateColor('c1', 'name', 'New');
    (g.document as { visibilityState: string }).visibilityState = 'hidden';
    handlers.visibilitychange();
    expect(writes()[0]?.value?.colors[0].name).toBe('New');
  });

  it('tab becoming visible again sends nothing', async () => {
    const el = await open(hungReadHass());
    el._updateColor('c1', 'name', 'New');
    handlers.visibilitychange();
    expect(writes()).toHaveLength(0);
  });

  it('the edit was already flushed and its update is in flight (read hanging): still sent on pagehide', async () => {
    const el = await open(hungReadHass());
    void storage.updatePalette((p) => ({ ...p, colors: p.colors.map((c) => ({ ...c, name: 'Now' })) }), el.hass as never);
    handlers.pagehide();
    expect(writes()[0]?.value?.colors[0].name).toBe('Now');
  });

});

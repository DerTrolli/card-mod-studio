/**
 * The palette manager says so when an edit exists only in memory: the
 * browser refused to store it and Home Assistant was not reachable. The note
 * goes away after the next edit that is kept somewhere.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

type El = {
  hass?: unknown; render(): unknown; requestUpdate(): void;
  _saveNow(edit: unknown): void;
};
const NOTE = "Couldn't save this change — this browser's storage is full and Home Assistant wasn't reachable. It will be lost when the page reloads.";
const g = globalThis as Record<string, unknown>;
let Mod: new () => El;
let full: boolean;
let haDown: boolean;
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const add = (id: string) => ({ kind: 'add', color: { id, name: id, hex: '#000000' } });

beforeAll(async () => {
  g.localStorage = { getItem: () => null, setItem: () => {} };
  g.window = { dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} };
  await import('../src/editor/cms-palette-manager.js');
  Mod = registry.get('cms-palette-manager') as new () => El;
});
beforeEach(() => {
  full = true;
  haDown = true;
  const mem = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { if (full) throw new Error('quota'); mem.set(k, v); },
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const open = () => {
  const el = new Mod();
  el.requestUpdate = () => {};
  el.hass = {
    connection: {
      sendMessagePromise: async (m: { type: string }) => {
        if (haDown) throw new Error('down');
        return m.type === 'frontend/get_user_data' ? null : null;
      },
    },
  };
  return el;
};

describe('palette manager: edit that is only in memory', () => {
  it('shows the note, as a status, when storage is full and Home Assistant is down', async () => {
    const el = open();
    expect(templateText(el.render())).not.toContain(NOTE);
    el._saveNow(add('x1'));
    await tick();
    const t = templateText(el.render());
    expect(t).toContain(NOTE);
    expect(t).toContain('role="status"');
  });

  it('is cleared by the next edit that is kept', async () => {
    const el = open();
    el._saveNow(add('x1'));
    await tick();
    expect(templateText(el.render())).toContain(NOTE);
    full = false;
    el._saveNow(add('x2'));
    await tick();
    expect(templateText(el.render())).not.toContain(NOTE);
  });

  it('is not shown when only Home Assistant is down (the edit is on this device)', async () => {
    full = false;
    const el = open();
    el._saveNow(add('x3'));
    await tick();
    expect(templateText(el.render())).not.toContain(NOTE);
  });
});

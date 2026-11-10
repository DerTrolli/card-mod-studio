/**
 * A failed Home Assistant read must not lead to an overwrite (the fallback is
 * this browser's older copy), and a failed write must not look like a saved
 * preset: the bar says "saved on this device only" until a write gets through.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { updatePresets, loadPresets, type StylePreset } from '../src/utils/preset-storage.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';
import type { CardModCardConfig } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

const STATE = mapToStudioState(parseCardModConfig({ type: 'tile' }), 'tile');
const preset = (name: string): StylePreset => ({ name, state: STATE });
const names = (l: StylePreset[]) => l.map((p) => p.name);
const NOTE = "Couldn't reach your Home Assistant profile — saved on this device only.";

/** HA user storage whose read and write can each be made to fail. */
function fakeHass(initial: StylePreset[]) {
  const box = { stored: initial, failRead: false, failWrite: false, sets: 0 };
  const hass = {
    connection: {
      async sendMessagePromise(msg: Record<string, unknown>) {
        if (msg.type === 'frontend/get_user_data') {
          if (box.failRead) throw new Error('offline');
          return { value: box.stored };
        }
        if (box.failWrite) throw new Error('offline');
        box.stored = msg.value as StylePreset[];
        box.sets++;
        return null;
      },
    },
  };
  return { hass, box };
}

let local: Map<string, string>;
beforeEach(() => {
  local = new Map();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => { local.set(k, v); },
  };
});

describe('updatePresets when Home Assistant cannot be read', () => {
  it('keeps the change on this device and writes nothing to Home Assistant', async () => {
    const { hass, box } = fakeHass([preset('real1'), preset('real2')]);
    local.set('cms-presets', JSON.stringify([preset('old')])); // this browser's older copy
    box.failRead = true;
    const seen: boolean[] = [];
    const written = await updatePresets({ kind: 'save', preset: preset('new') }, hass, (ok) => seen.push(ok));
    expect(names(written)).toEqual(['old', 'new']);
    expect(box.sets).toBe(0);
    expect(names(box.stored)).toEqual(['real1', 'real2']); // the real list is untouched
    expect(names(JSON.parse(local.get('cms-presets')!))).toEqual(['old', 'new']);
    expect(seen).toEqual([false]);
  });

  it('recovers: the next change after the read works writes HA\'s list plus the change', async () => {
    const { hass, box } = fakeHass([preset('real')]);
    box.failRead = true;
    const seen: boolean[] = [];
    await updatePresets({ kind: 'save', preset: preset('offline') }, hass, (ok) => seen.push(ok));
    box.failRead = false;
    const written = await updatePresets({ kind: 'save', preset: preset('online') }, hass, (ok) => seen.push(ok));
    expect(names(written)).toEqual(['real', 'online']);
    expect(names(box.stored)).toEqual(['real', 'online']);
    expect(seen).toEqual([false, true]);
  });
});

describe('updatePresets when the write fails', () => {
  it('reports it (and keeps the change locally)', async () => {
    const { hass, box } = fakeHass([preset('a')]);
    box.failWrite = true;
    const seen: boolean[] = [];
    const written = await updatePresets({ kind: 'save', preset: preset('b') }, hass, (ok) => seen.push(ok));
    expect(names(written)).toEqual(['a', 'b']);
    expect(names(JSON.parse(local.get('cms-presets')!))).toEqual(['a', 'b']);
    expect(seen).toEqual([false]);
  });

  it('a normal write reports success; no Home Assistant connection reports nothing', async () => {
    const { hass } = fakeHass([]);
    const seen: boolean[] = [];
    await updatePresets({ kind: 'save', preset: preset('a') }, hass, (ok) => seen.push(ok));
    await updatePresets({ kind: 'save', preset: preset('b') }, undefined, (ok) => seen.push(ok));
    expect(seen).toEqual([true]);
  });

  it('a read that finds nothing stored is not a failure (this browser\'s list moves up)', async () => {
    const { hass, box } = fakeHass([]);
    (box as { stored: unknown }).stored = null;
    local.set('cms-presets', JSON.stringify([preset('mine')]));
    expect(names(await loadPresets(hass))).toEqual(['mine']);
    const written = await updatePresets({ kind: 'save', preset: preset('x') }, hass);
    expect(names(box.stored)).toEqual(['mine', 'x']);
    expect(names(written)).toEqual(['mine', 'x']);
  });
});

describe('the preset bar note', () => {
  type PanelT = {
    config?: CardModCardConfig; hass?: unknown; _presets: StylePreset[]; _namingPreset: boolean;
    _presetName: string; _initState(): void; _renderPresetBar(): unknown; dispatchEvent(e: Event): boolean;
  };
  let Panel: new () => PanelT;
  beforeAll(async () => {
    await import('../src/editor/cms-panel.js');
    Panel = registry.get('cms-panel') as new () => PanelT;
  });
  const handlers = (t: unknown, out: Array<{ fn: (e: unknown) => void; attr?: string }> = [], prev = '') => {
    if (typeof t === 'function') out.push({ fn: t as never, attr: prev.match(/@([\w-]+)=\s*$/)?.[1] });
    else if (Array.isArray(t)) t.forEach((x) => handlers(x, out, prev));
    else {
      const r = t as { strings?: string[]; values?: unknown[] } | null;
      r?.strings?.forEach((s, i) => { if (r.values && i < r.values.length) handlers(r.values[i], out, s); });
    }
    return out;
  };
  const open = (hass: unknown) => {
    const p = new Panel();
    p.dispatchEvent = () => true;
    p.config = { type: 'tile', entity: 'light.a' } as CardModCardConfig;
    p.hass = hass;
    p._initState();
    p._presets = [preset('a')];
    return p;
  };
  const save = async (p: PanelT, name: string) => {
    p._namingPreset = true;
    p._presetName = name;
    handlers(p._renderPresetBar()).find((x) => x.attr === 'click')!.fn.call(p, {});
    await new Promise((r) => setTimeout(r, 20));
  };
  const text = (p: PanelT) => templateText(p._renderPresetBar());

  it('shows after a failed read, and clears on the next successful write', async () => {
    const { hass, box } = fakeHass([preset('a')]);
    const p = open(hass);
    expect(text(p)).not.toContain(NOTE);
    box.failRead = true;
    await save(p, 'one');
    expect(text(p)).toContain(NOTE);
    expect(text(p)).toContain('role="status"');
    expect(box.sets).toBe(0);
    box.failRead = false;
    await save(p, 'two');
    expect(text(p)).not.toContain(NOTE);
  });

  it('shows after a failed write too', async () => {
    const { hass, box } = fakeHass([preset('a')]);
    const p = open(hass);
    box.failWrite = true;
    await save(p, 'one');
    expect(text(p)).toContain(NOTE);
  });
});

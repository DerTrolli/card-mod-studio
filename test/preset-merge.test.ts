/**
 * Preset saving: the panel's in-memory list can be stale (another browser
 * saved since it loaded). Every save / overwrite / delete re-reads the stored
 * list and applies only its own change.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import { updatePresets, applyPresetChange, type StylePreset } from '../src/utils/preset-storage.js';
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

/** A fake HA user-data store; `stored` can be changed behind a panel's back. */
function fakeHass(initial: StylePreset[]) {
  const box = { stored: initial as StylePreset[] | null, sets: 0 };
  const hass = {
    connection: {
      async sendMessagePromise(msg: Record<string, unknown>) {
        if (msg.type === 'frontend/get_user_data') return { value: box.stored };
        box.stored = msg.value as StylePreset[];
        box.sets++;
        return null;
      },
    },
  };
  return { hass, box };
}

beforeEach(() => {
  const mem = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v); },
  };
});

describe('updatePresets', () => {
  it('save keeps a preset another browser added meanwhile', async () => {
    const { hass, box } = fakeHass([preset('a')]);
    box.stored = [preset('a'), preset('fromB')]; // B saved after A opened
    const written = await updatePresets({ kind: 'save', preset: preset('fromA') }, hass);
    expect(names(written)).toEqual(['a', 'fromB', 'fromA']);
    expect(names(box.stored!)).toEqual(['a', 'fromB', 'fromA']);
  });
  it('overwrite replaces only the same-named preset', async () => {
    const { hass, box } = fakeHass([preset('a')]);
    box.stored = [preset('a'), preset('fromB')];
    const changed = { name: 'a', state: { ...STATE, border: { ...STATE.border, enabled: true } } };
    const written = await updatePresets({ kind: 'save', preset: changed }, hass);
    expect(names(written).sort()).toEqual(['a', 'fromB']);
    expect(written.find((p) => p.name === 'a')!.state.border.enabled).toBe(true);
  });
  it('delete removes only that name and keeps the other browser\'s preset', async () => {
    const { hass, box } = fakeHass([preset('a'), preset('b')]);
    box.stored = [preset('a'), preset('b'), preset('fromB')];
    expect(names(await updatePresets({ kind: 'delete', name: 'a' }, hass))).toEqual(['b', 'fromB']);
    expect(names(box.stored!)).toEqual(['b', 'fromB']);
  });
  it('deleting a name that is already gone is harmless', async () => {
    const { hass } = fakeHass([preset('x')]);
    expect(names(await updatePresets({ kind: 'delete', name: 'nope' }, hass))).toEqual(['x']);
  });
  it('quick successive changes do not drop each other', async () => {
    const { hass, box } = fakeHass([]);
    await Promise.all([
      updatePresets({ kind: 'save', preset: preset('one') }, hass),
      updatePresets({ kind: 'save', preset: preset('two') }, hass),
    ]);
    expect(names(box.stored!)).toEqual(['one', 'two']);
  });
  it('applyPresetChange is pure', () => {
    const l = [preset('a')];
    applyPresetChange(l, { kind: 'delete', name: 'a' });
    expect(names(l)).toEqual(['a']);
  });
});

describe('the panel (rendered handlers)', () => {
  type PanelT = {
    config?: CardModCardConfig; hass?: unknown; _presets: StylePreset[]; _namingPreset: boolean;
    _presetName: string; _selectedPreset: string; _initState(): void; _renderPresetBar(): unknown;
    updateComplete: Promise<unknown>; dispatchEvent(e: Event): boolean;
  };
  let Panel: new () => PanelT;
  beforeAll(async () => {
    await import('../src/editor/cms-panel.js');
    Panel = registry.get('cms-panel') as new () => PanelT;
  });
  const handlers = (t: unknown, out: Array<{ fn: (e: unknown) => void; attr?: string; text: string }> = [], prev = '') => {
    if (typeof t === 'function') out.push({ fn: t as never, attr: prev.match(/@([\w-]+)=\s*$/)?.[1], text: prev });
    else if (Array.isArray(t)) t.forEach((x) => handlers(x, out, prev));
    else {
      const r = t as { strings?: string[]; values?: unknown[] } | null;
      r?.strings?.forEach((s, i) => { if (r.values && i < r.values.length) handlers(r.values[i], out, s); });
    }
    return out;
  };
  const open = async (hass: unknown) => {
    const p = new Panel();
    p.dispatchEvent = () => true;
    p.config = { type: 'tile', entity: 'light.a' } as CardModCardConfig;
    p.hass = hass;
    p._initState();
    p._presets = [preset('a')];
    return p;
  };
  const click = (p: PanelT, attr: string, textIncludes = '') => {
    const h = handlers(p._renderPresetBar()).filter((x) => x.attr === attr && x.text.includes(textIncludes));
    expect(h.length, `${attr} handler`).toBeGreaterThan(0);
    h[0].fn.call(p, {});
  };
  const settle = () => new Promise((r) => setTimeout(r, 20));

  it('Save from a stale panel keeps the preset another browser saved', async () => {
    const { hass, box } = fakeHass([preset('a')]);
    const p = await open(hass);
    box.stored = [preset('a'), preset('fromB')];
    p._namingPreset = true; p._presetName = 'fromA';
    click(p, 'click');
    await settle();
    expect(names(box.stored!)).toEqual(['a', 'fromB', 'fromA']);
    expect(names(p._presets)).toEqual(['a', 'fromB', 'fromA']); // refreshed from what was written
  });
  it('Delete from a stale panel keeps the other browser\'s preset', async () => {
    const { hass, box } = fakeHass([preset('a')]);
    const p = await open(hass);
    box.stored = [preset('a'), preset('fromB')];
    p._selectedPreset = 'a';
    click(p, 'click');
    await settle();
    expect(names(box.stored!)).toEqual(['fromB']);
    expect(names(p._presets)).toEqual(['fromB']);
  });
});

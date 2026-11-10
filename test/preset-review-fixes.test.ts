/**
 * Preset fixes from a review: a change made with no `hass` is kept and
 * replays later; a change while both stores are unreadable lands on the list
 * the panel shows; the name field ignores the Enter that accepts an IME
 * candidate.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
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
const names = (l: StylePreset[]) => l.map((p) => p.name).sort();
const g = globalThis as Record<string, unknown>;

let local: Map<string, string>;
let stored: StylePreset[];
let failRead: boolean;
const hass = () => ({
  connection: {
    async sendMessagePromise(msg: Record<string, unknown>) {
      if (msg.type === 'frontend/get_user_data') {
        if (failRead) throw new Error('offline');
        return { value: stored };
      }
      stored = msg.value as StylePreset[];
      return null;
    },
  },
});

beforeEach(() => {
  local = new Map();
  stored = [preset('real')];
  failRead = false;
  g.localStorage = {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => { local.set(k, v); },
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('updatePresets with no hass', () => {
  it('puts the change on the kept list, and it reaches Home Assistant on the next load', async () => {
    await updatePresets({ kind: 'save', preset: preset('early') }, undefined);
    expect(JSON.parse(local.get('cms-presets-unsynced')!)).toHaveLength(1);
    const list = await loadPresets(hass());
    expect(names(list)).toEqual(['early', 'real']);
    expect(names(stored)).toEqual(['early', 'real']);
    expect(local.get('cms-presets-unsynced')).toBe('[]');
  });
});

describe('updatePresets when neither store can be read', () => {
  it('applies the change to the list the panel shows', async () => {
    failRead = true;
    g.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const shown = [preset('a'), preset('b')];
    const written = await updatePresets({ kind: 'save', preset: preset('c') }, hass(), undefined, shown);
    expect(names(written)).toEqual(['a', 'b', 'c']);
    const del = await updatePresets({ kind: 'delete', name: 'a' }, hass(), undefined, shown);
    expect(names(del)).toEqual(['b']);
  });
});

describe('preset name field and IME composition', () => {
  type PanelT = {
    config?: CardModCardConfig; _presets: StylePreset[]; _namingPreset: boolean; _presetName: string;
    _initState(): void; _onPresetNameKeydown(e: unknown): void; dispatchEvent(e: Event): boolean;
  };
  let Panel: new () => PanelT;
  beforeAll(async () => {
    await import('../src/editor/cms-panel.js');
    Panel = registry.get('cms-panel') as new () => PanelT;
  });
  const key = (extra: Record<string, unknown>) => {
    const e = { key: 'Enter', preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra };
    return e;
  };
  const make = () => {
    const p = new Panel();
    p.dispatchEvent = () => true;
    p.config = { type: 'tile', entity: 'light.a' } as CardModCardConfig;
    p._initState();
    p._namingPreset = true;
    p._presetName = 'にほ';
    return p;
  };

  it('Enter while composing (isComposing) does not save', () => {
    const p = make();
    p._onPresetNameKeydown(key({ isComposing: true }));
    expect(p._presets).toEqual([]);
    expect(p._namingPreset).toBe(true);
  });

  it('Enter with keyCode 229 does not save', () => {
    const p = make();
    p._onPresetNameKeydown(key({ keyCode: 229 }));
    expect(p._presets).toEqual([]);
    expect(p._namingPreset).toBe(true);
  });

  it('a plain Enter still saves', () => {
    const p = make();
    p._onPresetNameKeydown(key({ isComposing: false, keyCode: 13 }));
    expect(names(p._presets)).toEqual(['にほ']);
  });
});

/**
 * Preset bar, naming state: the Save / Overwrite names carry no emoji, and
 * focus returns to the "Save preset" button when the naming field goes away
 * (Escape, Cancel, a successful save) instead of falling to <body>.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';
import type { CardModCardConfig } from '../src/types/index.js';
import type { StylePreset } from '../src/utils/preset-storage.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

const STATE = mapToStudioState(parseCardModConfig({ type: 'tile' }), 'tile');

type PanelT = {
  config?: CardModCardConfig; _presets: StylePreset[]; _namingPreset: boolean; _presetName: string;
  _initState(): void; _renderPresetBar(): unknown; dispatchEvent(e: Event): boolean;
  _saveCurrentAsPreset(): void; _cancelNamingPreset(): void; _onPresetNameKeydown(e: unknown): void;
};
let Panel: new () => PanelT;
beforeAll(async () => {
  await import('../src/editor/cms-panel.js');
  Panel = registry.get('cms-panel') as new () => PanelT;
});
beforeEach(() => {
  const mem = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v); },
  };
});

function make() {
  const p = new Panel();
  p.dispatchEvent = () => true;
  p.config = { type: 'tile', entity: 'light.a' } as CardModCardConfig;
  p._initState();
  p._presets = [{ name: 'Warm', state: STATE }];
  const focused: string[] = [];
  Object.defineProperty(p, 'updateComplete', { value: Promise.resolve(true) });
  Object.defineProperty(p, 'shadowRoot', {
    value: { querySelector: (sel: string) => (sel === '.preset-bar .btn-preset-save' ? { focus: () => focused.push('save-preset') } : null) },
  });
  return { p, focused };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('preset bar naming: accessible names', () => {
  it('the floppy emoji is hidden from assistive technology on Save and Overwrite', () => {
    const { p } = make();
    p._namingPreset = true;
    const text = templateText(p._renderPresetBar());
    expect(text).toContain('<span aria-hidden="true">💾</span>');
    expect(text).not.toMatch(/(?<!aria-hidden="true")>\s*💾/); // no bare emoji left inside a button's name
  });
});

describe('preset bar naming: focus after the field goes away', () => {
  it('Escape in the field returns focus to the Save preset button', async () => {
    const { p, focused } = make();
    p._namingPreset = true;
    p._onPresetNameKeydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
    expect(p._namingPreset).toBe(false);
    await flush();
    expect(focused).toEqual(['save-preset']);
  });

  it('Cancel does the same', async () => {
    const { p, focused } = make();
    p._namingPreset = true;
    p._cancelNamingPreset();
    await flush();
    expect(focused).toEqual(['save-preset']);
  });

  it('a successful save from the field does too; an empty name keeps the field and its focus', async () => {
    const { p, focused } = make();
    p._namingPreset = true;
    p._presetName = '   ';
    p._saveCurrentAsPreset();
    await flush();
    expect(p._namingPreset).toBe(true);
    expect(focused).toEqual([]);
    p._presetName = 'Cool';
    p._saveCurrentAsPreset();
    expect(p._namingPreset).toBe(false);
    await flush();
    expect(focused).toEqual(['save-preset']);
  });
});

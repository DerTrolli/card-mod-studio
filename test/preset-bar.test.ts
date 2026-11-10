/**
 * Preset bar feedback, through the handlers the rendered template binds:
 * name hint, explicit overwrite, two-step delete, name length cap.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
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
  _selectedPreset: string; _initState(): void; _renderPresetBar(): unknown; dispatchEvent(e: Event): boolean;
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

type H = { fn: (e: unknown) => void; attr: string };
const handlers = (t: unknown, out: H[] = [], prev = ''): H[] => {
  if (typeof t === 'function') out.push({ fn: t as never, attr: prev.match(/@([\w-]+)=\s*$/)?.[1] ?? '' });
  else if (Array.isArray(t)) t.forEach((x) => handlers(x, out, prev));
  else {
    const r = t as { strings?: string[]; values?: unknown[] } | null;
    r?.strings?.forEach((s, i) => { if (r.values && i < r.values.length) handlers(r.values[i], out, s); });
  }
  return out;
};

const make = (presets: string[] = ['Warm']) => {
  const p = new Panel();
  p.dispatchEvent = () => true;
  p.config = { type: 'tile', entity: 'light.a' } as CardModCardConfig;
  p._initState();
  p._presets = presets.map((name) => ({ name, state: STATE }));
  const bar = () => p._renderPresetBar();
  const text = () => templateText(bar());
  const fire = (attr: string, nth = 0, ev: unknown = {}) => {
    const h = handlers(bar()).filter((x) => x.attr === attr);
    expect(h.length, `${attr} #${nth}`).toBeGreaterThan(nth);
    h[nth].fn.call(p, ev);
  };
  const type = (value: string) => {
    const target = { value };
    fire('input', 0, { target });
    return target;
  };
  return { p, text, fire, type };
};

describe('naming', () => {
  it('whitespace-only name: a hint shows, Save is disabled, nothing is saved', () => {
    const { p, text, type, fire } = make();
    p._namingPreset = true;
    expect(text()).not.toContain('Type a name');
    type('   ');
    expect(text()).toContain('Type a name to save this preset.');
    expect(text()).toContain('?disabled=');
    expect(text()).toContain('id="preset-hint"');
    fire('keydown', 0, { key: 'Enter', preventDefault() {}, stopPropagation() {} });
    fire('click', 0); // the (disabled) Save control, were it clicked
    expect(p._namingPreset).toBe(true);
    expect(p._presets).toHaveLength(1);
  });
  it('Enter on an empty field raises the hint too', () => {
    const { p, text, fire } = make();
    p._namingPreset = true;
    fire('keydown', 0, { key: 'Enter', preventDefault() {}, stopPropagation() {} });
    expect(text()).toContain('Type a name to save this preset.');
  });
  it('a typed new name shows neither hint nor overwrite', () => {
    const { p, text, type } = make();
    p._namingPreset = true;
    type('Cool');
    expect(text()).not.toContain('Type a name');
    expect(text()).not.toContain('Replaces');
    expect(text()).toContain('💾 Save');
    expect(text()).not.toContain('preset-hint');
  });
  it('a name matching an existing preset says Overwrite and names it', () => {
    const { p, text, type } = make();
    p._namingPreset = true;
    type(' Warm ');
    expect(text()).toContain('💾 Overwrite');
    expect(text()).toContain('Replaces the existing preset "Warm".');
    type('Warmer');
    expect(text()).toContain('💾 Save');
    expect(text()).not.toContain('Replaces');
  });
  it('leading blanks are dropped and the name is capped at 60 characters', () => {
    const { p, type } = make();
    p._namingPreset = true;
    const t = type('   ' + 'x'.repeat(3000));
    expect(t.value).toBe('x'.repeat(60));
    expect(p._presetName).toBe('x'.repeat(60));
    expect(type('my preset').value).toBe('my preset'); // inner/trailing spaces stay typeable
    expect(type('ab ').value).toBe('ab ');
  });
  it('a preset stored with a name over the cap can still be overwritten under that name', () => {
    const long = 'L'.repeat(80);
    const { p, text, type } = make([long]);
    p._selectedPreset = long;
    (p as unknown as { _startNamingPreset(): void })._startNamingPreset();
    expect(p._presetName).toBe(long); // prefilled whole
    expect(text()).toContain('💾 Overwrite');
    expect(type(long).value).toBe(long); // an input event does not cut it
    const changed = { ...STATE, border: { ...STATE.border, enabled: true } };
    p._presets = [{ name: long, state: STATE }];
    (p as unknown as { _studioState: unknown })._studioState = changed;
    (p as unknown as { _saveCurrentAsPreset(): void })._saveCurrentAsPreset();
    expect(p._presets.map((x) => x.name)).toEqual([long]); // replaced, not a second 60-char one
    expect(p._presets[0].state.border.enabled).toBe(true);
    expect(p._selectedPreset).toBe(long);
  });
  it('a name that is not an existing preset is still capped at 60', () => {
    const { p, type } = make([ 'L'.repeat(80) ]);
    p._namingPreset = true;
    expect(type('L'.repeat(79)).value).toBe('L'.repeat(60));
  });
  it('names match trimmed (an old name with a trailing blank is found) and case-sensitively', () => {
    const { p, text, type } = make(['Warm ']);
    p._namingPreset = true;
    type('Warm');
    expect(text()).toContain('💾 Overwrite');
    (p as unknown as { _saveCurrentAsPreset(): void })._saveCurrentAsPreset();
    expect(p._presets.map((x) => x.name)).toEqual(['Warm ']); // replaced under its own name, no duplicate
    p._namingPreset = true;
    type('warm');
    expect(text()).toContain('💾 Save');
    expect(text()).not.toContain('Replaces');
    (p as unknown as { _saveCurrentAsPreset(): void })._saveCurrentAsPreset();
    expect(p._presets.map((x) => x.name).sort()).toEqual(['Warm ', 'warm']);
  });
  it('the field carries maxlength and an accessible name', () => {
    const { p, text } = make();
    p._namingPreset = true;
    expect(text()).toContain('maxlength=');
    expect(text()).toContain('aria-label="Preset name"');
  });
});

describe('two-step delete', () => {
  const armedText = (t: string) => t.includes("Delete 'Warm'?");
  it('first click arms (label changes), second click deletes', () => {
    const { p, text, fire } = make();
    p._selectedPreset = 'Warm';
    expect(text()).toContain('Delete preset');
    expect(armedText(text())).toBe(false);
    fire('click', 0);
    expect(armedText(text())).toBe(true);
    expect(p._presets).toHaveLength(1);
    fire('click', 0);
    expect(p._presets).toHaveLength(0);
    expect(p._selectedPreset).toBe('');
  });
  it('blur disarms', () => {
    const { p, text, fire } = make();
    p._selectedPreset = 'Warm';
    fire('click', 0);
    fire('blur', 0);
    expect(armedText(text())).toBe(false);
    fire('click', 0); // arms again, still not deleted
    expect(p._presets).toHaveLength(1);
  });
  it('Escape disarms without closing the dialog; unarmed Escape is left alone', () => {
    const { p, text, fire } = make();
    p._selectedPreset = 'Warm';
    let stopped = 0;
    const esc = { key: 'Escape', preventDefault() {}, stopPropagation() { stopped++; } };
    fire('keydown', 0, esc);
    expect(stopped).toBe(0);
    fire('click', 0);
    fire('keydown', 0, esc);
    expect(stopped).toBe(1);
    expect(armedText(text())).toBe(false);
  });
});

describe('two-step delete disarms without focus events (Safari)', () => {
  const armedText = (t: string) => t.includes("Delete 'Warm'?");
  let down: ((e: unknown) => void) | undefined;
  let listeners = 0;
  const g = globalThis as Record<string, unknown>;
  let hadWindow: unknown;
  beforeEach(() => {
    vi.useFakeTimers();
    hadWindow = g.window;
    listeners = 0;
    down = undefined;
    g.window = {
      addEventListener: (t: string, fn: (e: unknown) => void) => { if (t === 'pointerdown') { down = fn; listeners++; } },
      removeEventListener: (t: string, fn: unknown) => { if (t === 'pointerdown' && fn === down) { down = undefined; listeners--; } },
    };
  });
  afterEach(() => { vi.useRealTimers(); g.window = hadWindow; });

  it('a press elsewhere disarms; the next click arms again instead of deleting', () => {
    const { p, text, fire } = make();
    p._selectedPreset = 'Warm';
    const btn = {};
    fire('click', 0, { currentTarget: btn });
    expect(armedText(text())).toBe(true);
    expect(listeners).toBe(1);
    down!({ composedPath: () => [{}] });
    expect(armedText(text())).toBe(false);
    expect(listeners).toBe(0);
    fire('click', 0, { currentTarget: btn });
    expect(p._presets).toHaveLength(1);
    expect(armedText(text())).toBe(true);
  });

  it('a press on the armed button itself does not disarm', () => {
    const { p, text, fire } = make();
    p._selectedPreset = 'Warm';
    const btn = {};
    fire('click', 0, { currentTarget: btn });
    down!({ composedPath: () => [btn] });
    expect(armedText(text())).toBe(true);
  });

  it('disarms after about four seconds', () => {
    const { p, text, fire } = make();
    p._selectedPreset = 'Warm';
    fire('click', 0, { currentTarget: {} });
    vi.advanceTimersByTime(3900);
    expect(armedText(text())).toBe(true);
    vi.advanceTimersByTime(200);
    expect(armedText(text())).toBe(false);
    expect(listeners).toBe(0);
  });

  it('blur and Escape also drop the listener and the timer', () => {
    const { p, fire } = make();
    p._selectedPreset = 'Warm';
    fire('click', 0, { currentTarget: {} });
    fire('blur', 0);
    expect(listeners).toBe(0);
    fire('click', 0, { currentTarget: {} });
    fire('keydown', 0, { key: 'Escape', preventDefault() {}, stopPropagation() {} });
    expect(listeners).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

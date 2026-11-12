/**
 * Small review fixes: focus after Enter in the compact colour popover, the
 * preset bar's accessible names and touch height, the palette header's
 * decorative emoji, and one observer per code editor.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { CSSResultGroup } from 'lit';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { fakeInput, tplFind, tplNodes } from './ui-template.js';
import type { CardModCardConfig } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
(globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
  constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };

const cssText = (s: CSSResultGroup): string =>
  Array.isArray(s) ? s.map(cssText).join('\n') : typeof s === 'string' ? s : (s as { cssText: string }).cssText;

// ---- Enter in the compact popover's hex field ------------------------------

describe('compact colour popover: Enter in the hex field', () => {
  type P = { value: string; compact: boolean; _closePopover(): void; _renderPickerBody(): unknown;
    dispatchEvent(e: Event): boolean; shadowRoot: unknown };
  let Picker: new () => P;
  const g = globalThis as { document?: unknown; getComputedStyle?: unknown };
  beforeAll(async () => {
    await import('../src/components/cms-color-picker.js');
    Picker = registry.get('cms-color-picker') as typeof Picker;
  });
  beforeEach(() => {
    g.getComputedStyle = () => ({ getPropertyValue: () => '' });
    g.document = { documentElement: {} };
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); delete g.document; delete g.getComputedStyle; });

  function make() {
    const p = new Picker();
    p.value = '#112233';
    p.compact = true;
    p.dispatchEvent = () => true;
    const closed: string[] = [];
    p._closePopover = () => { closed.push('closed'); };
    const focused: string[] = [];
    Object.defineProperty(p, 'shadowRoot', {
      value: { querySelector: (sel: string) => (sel === '.swatch-trigger' ? { focus: () => focused.push('trigger') } : null) },
    });
    const field = () => tplFind(p._renderPickerBody(), 'aria-label=Color value', p);
    return { p, closed, focused, field };
  }

  it('commits, closes, and returns focus to the swatch that opened it', () => {
    const { closed, focused, field } = make();
    const f = field();
    f.on.keydown({ key: 'Enter' });
    f.on.change(fakeInput('#abcdef'));
    expect(closed).toHaveLength(1);
    expect(focused).toEqual(['trigger']);
  });

  it('a commit by leaving the field (blur) does not steal focus', () => {
    const { closed, focused, field } = make();
    field().on.change(fakeInput('#abcdef'));
    expect(closed).toHaveLength(1);
    expect(focused).toEqual([]);
  });

  it('an Enter that committed nothing does not leave a stale flag for a later blur', () => {
    const { focused, field } = make();
    const f = field();
    f.on.keydown({ key: 'Enter' }); // value unchanged: the browser fires no change
    vi.runAllTimers();
    f.on.change(fakeInput('#abcdef'));
    expect(focused).toEqual([]);
  });

  it('an invalid value on Enter keeps the popover open and the focus where it is', () => {
    const { closed, focused, field } = make();
    const f = field();
    f.on.keydown({ key: 'Enter' });
    f.on.change(fakeInput('#12'));
    expect(closed).toEqual([]);
    expect(focused).toEqual([]);
  });

  it('other keys do not arm it', () => {
    const { focused, field } = make();
    const f = field();
    f.on.keydown({ key: 'Tab' });
    f.on.change(fakeInput('#abcdef'));
    expect(focused).toEqual([]);
  });
});

// ---- preset bar -------------------------------------------------------------

describe('preset bar', () => {
  type PanelT = { config?: CardModCardConfig; hass?: unknown; _presets: unknown[]; _initState(): void;
    _renderPresetBar(): unknown; dispatchEvent(e: Event): boolean; _presetsUnsaved: boolean; _presetsLocalOnly: boolean };
  let Panel: new () => PanelT;
  beforeAll(async () => {
    await import('../src/editor/cms-panel.js');
    Panel = registry.get('cms-panel') as typeof Panel;
  });
  const open = () => {
    const p = new Panel();
    p.dispatchEvent = () => true;
    p.config = { type: 'tile', entity: 'light.a' } as CardModCardConfig;
    p._initState();
    return p;
  };

  it('the Load preset select has an accessible name, and no emoji in its option text', () => {
    const p = open();
    const nodes = tplNodes(p._renderPresetBar());
    const sel = nodes.find((n) => n.tag.startsWith('<select'))!;
    expect(sel.tag).toContain('aria-label=Load preset');
    const opt = nodes.find((n) => n.tag.startsWith('<option'))!;
    expect(templateText(p._renderPresetBar())).toContain('>Load preset…</option>');
    expect(opt.tag).not.toMatch(/📋/u);
  });

  it('the Save preset emoji is hidden from assistive technology', () => {
    const text = templateText(open()._renderPresetBar());
    expect(text).toContain('<span aria-hidden="true">💾</span> Save preset');
  });

  it('says so when a preset could not even be saved on this device', () => {
    const p = open();
    p._presetsUnsaved = true;
    p._presetsLocalOnly = true;
    const text = templateText(p._renderPresetBar());
    expect(text).toContain("this browser's storage is full");
    expect(text).not.toContain('saved on this device only');
  });

  it('touch: the select and the Save button are 40px; desktop stays 32px', () => {
    const css = cssText((Panel as unknown as { styles: CSSResultGroup }).styles);
    const at = css.indexOf('@media (pointer: coarse)', css.indexOf('/* ---- Preset bar ---- */'));
    expect(at).toBeGreaterThan(0);
    let depth = 0;
    let end = css.indexOf('{', at);
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}' && --depth === 0) break;
    }
    const block = css.slice(at, end + 1);
    expect(block).toMatch(/\.preset-bar select/);
    expect(block).toMatch(/\.btn-preset-save/);
    expect(block).toMatch(/min-height:\s*40px/);
    const rest = css.replace(block, '');
    expect(rest).toMatch(/\.preset-bar select \{[^}]*min-height:\s*32px/);
    expect(rest).toMatch(/\.btn-preset-save,\s*\.btn-preset-delete,\s*\.btn-banner-action \{[^}]*min-height:\s*32px/);
  });
});

// ---- palette header ---------------------------------------------------------

describe('palette manager header', () => {
  it('the emoji is hidden from the accessible name', async () => {
    await import('../src/editor/cms-palette-manager.js');
    type M = { render(): unknown };
    const m = new (registry.get('cms-palette-manager') as new () => M)();
    expect(templateText(m.render())).toContain('<span aria-hidden="true">🖌️</span> My Color Palette');
  });
});

// ---- nameCodeEditor ---------------------------------------------------------

describe('nameCodeEditor', () => {
  let observers: Array<{ disconnected: boolean; cb: () => void }>;
  const g = globalThis as { MutationObserver?: unknown };
  beforeEach(() => {
    observers = [];
    g.MutationObserver = class {
      rec = { disconnected: false, cb: () => {} };
      constructor(cb: () => void) { this.rec.cb = cb; observers.push(this.rec); }
      observe() {}
      disconnect() { this.rec.disconnected = true; }
    };
  });
  afterEach(() => { delete g.MutationObserver; });

  const editor = () => {
    const box = { label: null as string | null, getAttribute() { return this.label; }, setAttribute(_k: string, v: string) { this.label = v; } };
    let present = false;
    const root = { querySelector: () => (present ? box : null) };
    return { el: { shadowRoot: root } as unknown as Element, box, appear: () => { present = true; } };
  };

  it('creates one observer per editor however often updated() calls it', async () => {
    const { nameCodeEditor } = await import('../src/modules/module-base.js');
    const e = editor();
    for (let i = 0; i < 5; i++) nameCodeEditor(e.el, 'Advanced CSS');
    expect(observers).toHaveLength(1);
  });

  it('names the node and disconnects once it appears; later calls just set the name', async () => {
    const { nameCodeEditor } = await import('../src/modules/module-base.js');
    const e = editor();
    nameCodeEditor(e.el, 'Advanced CSS');
    e.appear();
    observers[0].cb();
    expect(e.box.label).toBe('Advanced CSS');
    expect(observers[0].disconnected).toBe(true);
    nameCodeEditor(e.el, 'Advanced CSS');
    expect(observers).toHaveLength(1);
  });

  it('a call after the node exists disconnects the waiting observer', async () => {
    const { nameCodeEditor } = await import('../src/modules/module-base.js');
    const e = editor();
    nameCodeEditor(e.el, 'A');
    e.appear();
    nameCodeEditor(e.el, 'B');
    expect(e.box.label).toBe('B');
    expect(observers[0].disconnected).toBe(true);
  });

  it('separate editors each get their own', async () => {
    const { nameCodeEditor } = await import('../src/modules/module-base.js');
    nameCodeEditor(editor().el, 'A');
    nameCodeEditor(editor().el, 'B');
    expect(observers).toHaveLength(2);
  });
});

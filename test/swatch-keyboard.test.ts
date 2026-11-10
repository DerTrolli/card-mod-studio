/**
 * Colour swatches: each row is ONE Tab stop (roving tabindex), arrows move
 * between swatches and wrap, Home / End jump, a click still picks, and a
 * row is a named group.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import { tplNodes } from './ui-template.js';
import { rovingTarget, tabStopIndex } from '../src/utils/roving-focus.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

type Picker = {
  value: string; label: string; _renderPickerBody(): unknown; requestUpdate(): void;
  dispatchEvent(e: Event): boolean;
};
let Picker: new () => Picker;
let presets: Array<{ variable: string }>;
beforeAll(async () => {
  (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
    constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
  const m = await import('../src/components/cms-color-picker.js');
  presets = m.HA_COLOR_PRESETS;
  Picker = registry.get('cms-color-picker') as new () => Picker;
});
const g = globalThis as { document?: unknown; getComputedStyle?: unknown };
beforeEach(() => {
  g.getComputedStyle = () => ({ getPropertyValue: () => '' });
  g.document = { documentElement: {} };
});
afterEach(() => { delete g.document; delete g.getComputedStyle; });

const make = (value: string) => {
  const p = new Picker();
  p.value = value;
  p.label = 'Text color';
  p.requestUpdate = () => {};
  const emitted: string[] = [];
  p.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail.value); return true; });
  return { p, emitted };
};
const swatches = (p: Picker) => tplNodes(p._renderPickerBody()).filter((n) => /class=preset[ >]/.test(n.tag));
const tabindexes = (p: Picker) => swatches(p).map((n) => /tabindex=(-?\d)/.exec(n.tag)?.[1]);
const row = (p: Picker) => tplNodes(p._renderPickerBody()).find((n) => n.tag.includes('class=presets'))!;

/** A fake row: `n` buttons, the `at`-th one is the event target. */
function press(p: Picker, key: string, at: number, extra: Record<string, unknown> = {}) {
  const focused: number[] = [];
  const buttons = Array.from({ length: presets.length }, (_, i) => ({ focus: () => focused.push(i) }));
  let prevented = false;
  row(p).on.keydown({
    key, target: buttons[at], currentTarget: { querySelectorAll: () => buttons },
    preventDefault: () => { prevented = true; }, ...extra,
  });
  return { focused, prevented };
}

describe('rovingTarget', () => {
  it('moves with arrows, wraps, and jumps with Home / End', () => {
    expect(rovingTarget('ArrowRight', 2, 10)).toBe(3);
    expect(rovingTarget('ArrowDown', 9, 10)).toBe(0);
    expect(rovingTarget('ArrowLeft', 0, 10)).toBe(9);
    expect(rovingTarget('ArrowUp', 4, 10)).toBe(3);
    expect(rovingTarget('Home', 6, 10)).toBe(0);
    expect(rovingTarget('End', 2, 10)).toBe(9);
  });
  it('ignores other keys, modified keys and an empty row', () => {
    for (const k of ['Enter', ' ', 'Tab', 'a', 'Escape']) expect(rovingTarget(k, 1, 10)).toBeNull();
    expect(rovingTarget('ArrowRight', 1, 10, { ctrlKey: true })).toBeNull();
    expect(rovingTarget('ArrowRight', 0, 0)).toBeNull();
  });
  it('tab stop: moved, else selected, else first', () => {
    expect(tabStopIndex(10, 3, 5)).toBe(5);
    expect(tabStopIndex(10, 3, undefined)).toBe(3);
    expect(tabStopIndex(10, -1, undefined)).toBe(0);
    expect(tabStopIndex(10, 3, 99)).toBe(3);
  });
});

describe('swatch row in the picker', () => {
  it('is a named group with exactly one tabbable swatch: the first when none is selected', () => {
    const { p } = make('#123456');
    expect(row(p).tag).toContain('role=group');
    expect(row(p).tag).toContain('aria-label=Text color: Palette colors');
    const t = tabindexes(p);
    expect(t.filter((x) => x === '0')).toHaveLength(1);
    expect(t[0]).toBe('0');
    expect(t.length).toBe(presets.length);
  });
  it('the selected swatch is the tabbable one', () => {
    const { p } = make(presets[3].variable);
    const t = tabindexes(p);
    expect(t.filter((x) => x === '0')).toHaveLength(1);
    expect(t[3]).toBe('0');
  });
  it('arrows move focus and the tab stop follows; Home / End jump; keys are not swallowed otherwise', () => {
    const { p } = make('#123456');
    let r = press(p, 'ArrowRight', 0);
    expect(r.focused).toEqual([1]);
    expect(r.prevented).toBe(true);
    expect(tabindexes(p)[1]).toBe('0');
    expect(tabindexes(p)[0]).toBe('-1');
    expect(press(p, 'ArrowLeft', 0).focused).toEqual([presets.length - 1]);
    expect(press(p, 'End', 2).focused).toEqual([presets.length - 1]);
    expect(press(p, 'Home', 5).focused).toEqual([0]);
    r = press(p, 'Enter', 1);
    expect(r.focused).toEqual([]);
    expect(r.prevented).toBe(false);
    r = press(p, 'ArrowRight', 1, { ctrlKey: true });
    expect(r.prevented).toBe(false);
  });
  it('a click still picks the swatch and puts the tab stop back on the selection', () => {
    const { p, emitted } = make('#123456');
    press(p, 'ArrowRight', 0);
    swatches(p)[4].on.click({});
    expect(emitted).toEqual([presets[4].variable]);
    p.value = presets[4].variable;
    expect(tabindexes(p)[4]).toBe('0');
  });
});

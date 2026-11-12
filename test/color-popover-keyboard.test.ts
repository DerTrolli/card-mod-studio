/**
 * Compact colour popover and the keyboard: focus moves into it on open,
 * Tab / Shift+Tab leave through the trigger (committing a typed hex first),
 * and closing while focus is inside returns focus to the trigger — but not
 * when the user clicked elsewhere.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import { fakeInput, tplFind } from './ui-template.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
  constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };

type El = { name: string; focus: (o?: unknown) => void; localName?: string; type?: string; value?: string;
  closest: (s: string) => unknown };
type P = {
  value: string; compact: boolean; _portalShadow: unknown; _portalHost: unknown;
  _onPopoverKeydown(e: unknown): void; _focusIntoPopover(): void; _closePopover(r?: boolean): void;
  _renderPickerBody(): unknown; dispatchEvent(e: Event): boolean;
};
let Picker: new () => P;
const g = globalThis as { document?: unknown; getComputedStyle?: unknown; window?: unknown };
beforeAll(async () => {
  await import('../src/components/cms-color-picker.js');
  Picker = registry.get('cms-color-picker') as typeof Picker;
});
beforeEach(() => {
  g.getComputedStyle = () => ({ getPropertyValue: () => '' });
  g.document = { documentElement: {}, removeEventListener() {} };
  g.window = { removeEventListener() {} };
});
afterEach(() => { delete g.window; delete g.document; delete g.getComputedStyle; });

function make() {
  const log: string[] = [];
  const el = (name: string, extra: Partial<El> = {}): El =>
    ({ name, focus: () => log.push(`focus:${name}`), closest: () => null, ...extra });
  const group1 = {}; const group2 = {};
  const sw1 = el('swatch', { closest: () => group1 });
  const sw1b = el('swatch-moved', { closest: () => group1 });
  const sw2 = el('mine', { closest: () => group2 });
  const color = el('color-input');
  const hex = el('hex', { localName: 'input', type: 'text', value: '#112233' });
  const stops = [sw1, sw2, color, hex];
  let active: El | null = null;
  const portal = {
    get activeElement() { return active; },
    querySelectorAll: () => stops,
    querySelector: (sel: string) => (sel === 'button.preset.selected' ? null : sw1),
  };
  const p = new Picker();
  p.value = '#112233';
  p.compact = true;
  p.dispatchEvent = () => true;
  p._portalShadow = portal;
  const hooks: { onRemove?: () => void } = {};
  // Removing the focused field makes the browser blur it and fire `change`.
  p._portalHost = { removeEventListener() {}, remove() { log.push('removed'); hooks.onRemove?.(); } };
  Object.defineProperty(p, 'shadowRoot', {
    value: { querySelector: (s: string) => (s === '.swatch-trigger' ? el('trigger') : null) },
  });
  const press = (shift: boolean) => {
    const ev = { key: 'Tab', shiftKey: shift, prevented: false, preventDefault() { this.prevented = true; } };
    p._onPopoverKeydown(ev);
    return ev;
  };
  return { p, log, hooks, press, setActive: (e: El | null) => { active = e; }, sw1, sw1b, sw2, color, hex };
}

describe('compact colour popover keyboard', () => {
  it('opening puts focus on the selected swatch, else the first', () => {
    const { p, log } = make();
    p._focusIntoPopover();
    expect(log).toEqual(['focus:swatch']);
    const sel = { focus: () => log.push('focus:selected') };
    (p._portalShadow as { querySelector: unknown }).querySelector = (s: string) =>
      (s === 'button.preset.selected' ? sel : null);
    p._focusIntoPopover();
    expect(log).toEqual(['focus:swatch', 'focus:selected']);
  });

  it('Tab between its own stops is left to the browser', () => {
    const { log, press, setActive, sw1, sw2, color } = make();
    for (const from of [sw1, sw2, color]) {
      setActive(from);
      expect(press(false).prevented).toBe(false);
    }
    expect(log).toEqual([]);
  });

  it('Tab from the last stop closes the popover and focuses the trigger', () => {
    const m = make();
    m.setActive(m.hex);
    const ev = m.press(false); // hex unchanged: nothing to commit
    expect(ev.prevented).toBe(true);
    expect(m.log).toEqual(['removed', 'focus:trigger']);
  });

  it('Shift+Tab from the first stop (also from an arrowed-to swatch in its row) does the same', () => {
    for (const pick of ['sw1', 'sw1b'] as const) {
      const m = make();
      m.setActive(m[pick]);
      const ev = m.press(true);
      expect(ev.prevented).toBe(true);
      expect(m.log).toEqual(['removed', 'focus:trigger']);
    }
    const m = make();
    m.setActive(m.sw2);
    expect(m.press(true).prevented).toBe(false);
  });

  it('Tab out of the hex field commits a typed value first, then focuses the trigger', () => {
    const m = make();
    const emitted: string[] = [];
    m.p.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail.value); return true; });
    m.hex.value = '  #abcdef ';
    m.setActive(m.hex);
    const ev = m.press(false);
    expect(emitted).toEqual(['#abcdef']);
    expect(m.p.value).toBe('#abcdef');
    expect(ev.prevented).toBe(true);
    expect(m.log).toEqual(['removed', 'focus:trigger']);
  });

  it('Tab out with an invalid typed value drops it and still closes to the trigger', () => {
    const m = make();
    const emitted: string[] = [];
    m.p.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail.value); return true; });
    m.hex.value = '#12';
    m.setActive(m.hex);
    const ev = m.press(false);
    expect(emitted).toEqual([]);
    expect(m.p.value).toBe('#112233');
    expect(ev.prevented).toBe(true);
    expect(m.log).toEqual(['removed', 'focus:trigger']);
  });

  it('Shift+Tab from the hex field commits and closes to the trigger', () => {
    const m = make();
    m.hex.value = '#abcdef';
    m.setActive(m.hex);
    expect(m.press(true).prevented).toBe(true);
    expect(m.p.value).toBe('#abcdef');
    expect(m.log).toEqual(['removed', 'focus:trigger']);
  });

  it('closing while focus is inside returns focus to the trigger; not after an outside click', () => {
    const inside = make();
    inside.setActive(inside.sw1);
    inside.p._closePopover();
    expect(inside.log).toEqual(['removed', 'focus:trigger']);
    const away = make();
    away.setActive(away.sw1);
    away.p._closePopover(false);
    expect(away.log).toEqual(['removed']);
    const idle = make(); // focus is elsewhere: left alone
    idle.p._closePopover();
    expect(idle.log).toEqual(['removed']);
  });

  it('a commit by blur (clicking elsewhere) does not take focus', () => {
    const m = make();
    const field = tplFind(m.p._renderPickerBody(), 'aria-label=Color value', m.p);
    field.on.change(fakeInput('#abcdef'));
    expect(m.log).toEqual(['removed']);
  });

  it('the change the browser fires when the focused field is removed does not commit again', () => {
    const m = make();
    const emitted: string[] = [];
    m.p.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail.value); return true; });
    const field = tplFind(m.p._renderPickerBody(), 'aria-label=Color value', m.p);
    m.hooks.onRemove = () => field.on.change(fakeInput('#abcdef'));
    m.hex.value = '#abcdef';
    m.setActive(m.hex);
    m.press(false);
    expect(emitted).toEqual(['#abcdef']); // once
    expect(m.log).toEqual(['removed', 'focus:trigger']);
  });

  it('Escape with a half-typed value drops it: the removal-time change commits nothing', () => {
    const m = make();
    const emitted: string[] = [];
    m.p.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail.value); return true; });
    const field = tplFind(m.p._renderPickerBody(), 'aria-label=Color value', m.p);
    m.hooks.onRemove = () => field.on.change(fakeInput('#abcdef'));
    m.setActive(m.hex);
    m.p._closePopover(true);
    expect(emitted).toEqual([]);
    expect(m.p.value).toBe('#112233');
  });
});

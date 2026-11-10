/**
 * Colour text fields accept exactly one CSS colour value: table-driven
 * validator + the RENDERED handlers of cms-color-picker (typing shows a cue,
 * change/Enter commits only valid trimmed values, blur reverts).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import { fakeInput, tplFind } from './ui-template.js';
import { isValidCssColor } from '../src/utils/css-color.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

type Picker = {
  value: string; clearable: boolean; compact: boolean;
  _invalid: boolean; _closePopover(): void;
  _renderPickerBody(): unknown; dispatchEvent(e: Event): boolean;
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
const g = globalThis as { CSS?: unknown; document?: unknown; getComputedStyle?: unknown };
beforeEach(() => {
  // Re-rendering a var(--x) value resolves its swatch against the live theme.
  g.getComputedStyle = () => ({ getPropertyValue: () => '' });
  g.document = { documentElement: {} };
});
afterEach(() => { delete g.CSS; delete g.document; delete g.getComputedStyle; });

const VALID = [
  '#abc', '#abcd', '#aabbcc', '#aabbccdd', '#ABC', 'red', 'Red', 'transparent', 'currentcolor', 'currentColor',
  'rgb(255, 0, 0)', 'rgba(255,0,0,0.5)', 'rgb(255 0 0 / 50%)', 'hsl(120, 50%, 50%)', 'hsla(120deg 50% 50% / .3)',
  'hwb(120 10% 10%)', 'lab(50% 40 59.5)', 'lch(52% 72 56)', 'oklab(59% 0.1 0.1)', 'oklch(60% 0.15 50)',
  'color(display-p3 1 0 0)', 'color-mix(in srgb, red 40%, blue)', 'color-mix(in srgb, var(--primary-color) 50%, transparent)',
  'var(--primary-text-color)', 'var(--red-color)', 'var( --x )', 'var(--x, #fff)', 'var(--x, rgba(1,2,3,.4))', 'var(--a, var(--b, red))',
  '  #abc  ',
];
const INVALID = [
  '', '   ', '#', '#12', '#12345', '#1234567', '#ggg', 'reddd', '12', 'red;} body{display:none', 'red; color: blue', 'red}', '{red',
  'rgb(1,2,3', 'rgb(1,2,3))', 'rgb(1,2,3) foo(bar)', 'var(--x', 'var(--x) foo(y)', 'var(x)', 'rgb(1,2,3);', '"red"', "'red", 'red"',
  'url(x.png)', 'red /* c */', 'red\\', 'red\nblue', 'rgb(1,2,"3")', 'foo(1,2,3)', '{{ states("x") }}',
];

describe('isValidCssColor (syntactic fallback — no CSS.supports in tests)', () => {
  it.each(VALID)('accepts %j', (v) => expect(isValidCssColor(v)).toBe(true));
  it.each(INVALID)('rejects %j', (v) => expect(isValidCssColor(v)).toBe(false));
  it('accepts every palette variable the swatches write', () => {
    for (const p of presets) expect(isValidCssColor(p.variable), p.variable).toBe(true);
  });
});

describe('isValidCssColor with CSS.supports', () => {
  it('asks the browser for the syntax…', () => {
    const supports = vi.fn((_p: string, v: string) => v === 'oklch(1 2 3)');
    (globalThis as { CSS?: unknown }).CSS = { supports };
    expect(isValidCssColor(' oklch(1 2 3) ')).toBe(true);
    expect(supports).toHaveBeenCalledWith('color', 'oklch(1 2 3)');
    expect(isValidCssColor('#abc')).toBe(false);
  });
  it('…but never lets a breakout through, even if the browser says yes', () => {
    (globalThis as { CSS?: unknown }).CSS = { supports: () => true };
    for (const v of ['red;} body{display:none', 'red}', 'rgb(1,2,3', 'red"', 'red /* x */', '']) {
      expect(isValidCssColor(v), v).toBe(false);
    }
  });
});

// ---- the rendered text field ----------------------------------------------

function make(value: string, opts: { clearable?: boolean; compact?: boolean } = {}) {
  const p = new Picker();
  p.value = value;
  p.clearable = !!opts.clearable;
  p.compact = !!opts.compact;
  const emitted: string[] = [];
  p.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail.value); return true; });
  p._closePopover = vi.fn();
  const field = () => tplFind(p._renderPickerBody(), 'aria-label=Color value', p);
  return { p, emitted, field };
}

describe('colour text field', () => {
  it('typing a partial value shows the cue but emits and reverts nothing mid-typing', () => {
    const { p, emitted, field } = make('#112233');
    const input = fakeInput('#12');
    field().on.input(input);
    expect(p._invalid).toBe(true);
    expect(field().tag).toContain('aria-invalid=true');
    expect(field().tag).toContain('aria-describedby=cms-color-hint');
    expect(input.value).toBe('#12'); // not rewritten while typing
    expect(emitted).toEqual([]);
    input.value = '#123';
    field().on.input(input);
    input.value = '#123456';
    field().on.input(input);
    expect(p._invalid).toBe(false);
  });

  it('shows a visible hint line (status) only while invalid', () => {
    const { p } = make('#112233');
    const html = () => JSON.stringify(p._renderPickerBody());
    expect(html()).not.toContain('invalid-hint');
    p._invalid = true;
    expect(html()).toContain('invalid-hint');
    expect(html()).toContain('role=\\"status\\"');
  });

  it('change with an invalid value emits nothing and keeps the cue', () => {
    const { p, emitted, field } = make('#112233');
    for (const bad of ['#12', 'red;} body{display:none', 'rgb(1,2,3', 'nope']) {
      field().on.change(fakeInput(bad));
      expect(p._invalid, bad).toBe(true);
    }
    expect(emitted).toEqual([]);
    expect(p.value).toBe('#112233');
  });

  it('blur after an invalid value reverts the field to the last valid colour', () => {
    const { p, field } = make('#112233');
    const input = fakeInput('#12');
    field().on.input(input);
    field().on.change(input);
    field().on.blur(input);
    expect(input.value).toBe('#112233');
    expect(p._invalid).toBe(false);
  });

  it('blur with a valid (or untouched) field leaves the text alone', () => {
    const { field } = make('#112233');
    const input = fakeInput('#112233');
    field().on.blur(input);
    expect(input.value).toBe('#112233');
  });

  it('commits a valid value trimmed, on change', () => {
    const { p, emitted, field } = make('#112233');
    const input = fakeInput('  #abc  ');
    field().on.change(input);
    expect(emitted).toEqual(['#abc']);
    expect(input.value).toBe('#abc');
    expect(p._invalid).toBe(false);
    for (const v of ['rgb(1, 2, 3)', 'var(--primary-text-color)', 'var(--x, #fff)', 'oklch(60% 0.15 50)']) {
      field().on.change(fakeInput(v));
    }
    expect(emitted.slice(1)).toEqual(['rgb(1, 2, 3)', 'var(--primary-text-color)', 'var(--x, #fff)', 'oklch(60% 0.15 50)']);
  });

  it('a committed value clears an earlier cue', () => {
    const { p, field } = make('#112233');
    field().on.change(fakeInput('#12'));
    expect(p._invalid).toBe(true);
    field().on.change(fakeInput('#abc'));
    expect(p._invalid).toBe(false);
  });

  it('clearable: empty / whitespace means "not set" and is valid; non-clearable: empty is not', () => {
    const c = make('#112233', { clearable: true });
    c.field().on.input(fakeInput(''));
    expect(c.p._invalid).toBe(false);
    c.field().on.change(fakeInput('   '));
    expect(c.emitted).toEqual(['']);
    const n = make('#112233');
    n.field().on.change(fakeInput(''));
    expect(n.emitted).toEqual([]);
    expect(n.p._invalid).toBe(true);
  });

  it('compact: the popover closes on a valid commit, stays open on an invalid one', () => {
    const { p, field } = make('#112233', { compact: true });
    field().on.change(fakeInput('#12'));
    expect(p._closePopover).not.toHaveBeenCalled();
    field().on.change(fakeInput('#abc'));
    expect(p._closePopover).toHaveBeenCalledTimes(1);
  });

  it('an ALREADY stored non-colour is displayed as it is, with no cue, and never re-emitted', () => {
    const { p, emitted, field } = make("{{ states('sensor.x') }} or #12");
    expect(field().tag).toContain("{{ states('sensor.x') }} or #12");
    expect(field().tag).toContain('aria-invalid=false');
    expect(p._invalid).toBe(false);
    field().on.blur(fakeInput("{{ states('sensor.x') }} or #12"));
    expect(emitted).toEqual([]);
  });
});

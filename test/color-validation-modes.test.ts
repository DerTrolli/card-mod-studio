/**
 * Colour validation: one table of values with the verdict Chromium's
 * CSS.supports('color', v) gave (`raw`) and the verdict the Studio wants
 * (`want`). The syntactic fallback and the browser path (fed the recorded raw
 * verdicts) must both land on `want`, so unit tests and reality can't drift.
 * Plus the opt-in `background` / `stop` modes and their picker wiring.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import { isValidCssColor } from '../src/utils/css-color.js';

// [value, Chromium 153 CSS.supports('color', v), wanted verdict]
const TABLE: Array<[string, boolean, boolean]> = [
  ['ButtonText', true, true], ['Canvas', true, true], ['CanvasText', true, true], ['LinkText', true, true],
  ['AccentColor', true, true], ['AccentColorText', true, true], ['Highlight', true, true], ['GrayText', true, true],
  ['Field', true, true], ['FieldText', true, true], ['Window', true, true], ['Menu', true, true], ['mark', true, true],
  ['light-dark(red, blue)', true, true], ['light-dark(red)', false, false], ['light-dark(red, blue, green)', false, false],
  ['revert-layer', true, true], ['currentColor', true, true], ['none', false, false],
  ['rgb(foo)', false, false], ['rgb(1,2,3,4,5)', false, false], ['rgb(1 2)', false, false], ['rgb(1,2)', false, false],
  ['rgb(1 2 3 4)', false, false], ['rgb(1, 2 3)', false, false], ['color(foo)', false, false], ['color(srgb 1 0)', false, false],
  ['lab(1 2)', false, false], ['rgb(1 2 3)', true, true], ['rgba(0,0,0)', true, true], ['rgb(255 0 0 / 50%)', true, true],
  ['rgb(10%, 20%, 30%)', true, true], ['hsl(120 50% 50%)', true, true], ['hsl(120, 50%, 50%)', true, true],
  ['hsl(1 2 3)', true, true], ['hwb(1 2% 3%)', true, true], ['oklch(60% 0.15 50)', true, true],
  ['color(srgb 1 0 0)', true, true], ['rgb(from red r g b)', true, true],
  ['color-mix(in srgb, red, blue)', true, true], ['color-mix(red, blue)', true, true], ['color-mix(in srgb, red)', false, false],
  ['var(--x)', true, true], ['rgb(var(--r) 0 0)', true, true], ['foovar(--x)', false, false], ['red!important', false, false],
  // The browser accepts var() anywhere; these are not one colour.
  ['var(--x) 10px', true, false], ['var(--x) !important', true, false], ['red var(--x)', true, false],
];

const g = globalThis as { CSS?: unknown };
afterEach(() => { delete g.CSS; });

describe('colour verdict table', () => {
  it.each(TABLE)('fallback: %j (raw %s) -> %s', (v, _raw, want) => {
    expect(isValidCssColor(v)).toBe(want);
  });
  it.each(TABLE)('browser path (recorded Chromium verdicts): %j (raw %s) -> %s', (v, raw, want) => {
    g.CSS = { supports: (_p: string, x: string) => (x === v ? raw : true) };
    expect(isValidCssColor(v)).toBe(want);
  });
});

describe('background mode', () => {
  const OK = [
    'none', 'red', '#fff', 'var(--card-background-color)', 'radial-gradient(red, blue)', 'conic-gradient(red, blue)',
    'linear-gradient(90deg, red 0%, blue 100%)', 'url(x.png)', 'url("x.png")', "url('a b.png')", 'image-set("a.png" 1x)',
    // plain `background:` lists the parser adopted before this validation existed
    'linear-gradient(red, blue), red', 'radial-gradient(red, blue), linear-gradient(red, blue)',
  ];
  const BAD = [
    '', 'red;', 'red; color: blue', 'url(x.png)}', 'url(x.png', 'url("x.png)', 'linear-gradient(red, blue', 'red /* c */',
    'url(x.png)\nred', 'red,', ',red', 'red,,blue', 'url()', 'foo(1)', 'red var(--x)', 'linear-gradient(red, blue) red',
  ];
  it.each(OK)('accepts %j', (v) => expect(isValidCssColor(v, 'background')).toBe(true));
  it.each(BAD)('rejects %j', (v) => expect(isValidCssColor(v, 'background')).toBe(false));
  it('strict mode still refuses those values', () => {
    for (const v of ['none', 'radial-gradient(red, blue)', 'url(x.png)', 'red, blue']) expect(isValidCssColor(v)).toBe(false);
  });
  it('asks the browser for the background syntax', () => {
    g.CSS = { supports: (p: string, v: string) => p === 'background' && v !== 'radial-gradient(1)' };
    expect(isValidCssColor('radial-gradient(1)', 'background')).toBe(false);
    expect(isValidCssColor('url(x.png)', 'background')).toBe(true);
  });
});

// [value, Chromium 153 CSS.supports('background', v), wanted verdict]. Only the
// last layer of a `background` list may be a colour.
const BG_TABLE: Array<[string, boolean, boolean]> = [
  ['red, blue', false, false], ['red, linear-gradient(red, blue)', false, false], ['red, none', false, false],
  ['none, red', true, true], ['linear-gradient(red, blue), red', true, true], ['none, none', true, true],
  ['url(x.png), none', true, true], ['url(x.png), blue', true, true], ['url(x.png), url(y.png), red', true, true],
  ['none, linear-gradient(red,blue)', true, true], ['var(--x), red', true, true], ['var(--x), var(--y)', true, true],
  ['linear-gradient(red, blue), var(--x)', true, true], ['red', true, true], ['none', true, true],
  ['image-set("a.png" 1x)', true, true],
  // `;` never passes, even where the browser would not object (inside an image argument)
  ['url(a;b.png)', true, false], ['url("a;b.png")', true, false], ['linear-gradient(red;blue)', true, false],
];

describe('background verdict table', () => {
  it.each(BG_TABLE)('fallback: %j (raw %s) -> %s', (v, _raw, want) => {
    expect(isValidCssColor(v, 'background')).toBe(want);
  });
  it.each(BG_TABLE)('browser path (recorded Chromium verdicts): %j (raw %s) -> %s', (v, raw, want) => {
    g.CSS = { supports: (p: string, x: string) => (p === 'color' ? true : x === v ? raw : true) };
    expect(isValidCssColor(v, 'background')).toBe(want);
  });
  it('a browser that refuses the whole value wins over the layer check', () => {
    g.CSS = { supports: (p: string, x: string) => !(p === 'background' && x === 'none, none') };
    expect(isValidCssColor('none, none', 'background')).toBe(false);
  });
});

describe('stop mode', () => {
  const OK = ['red', 'red 0%', 'rgb(1, 2, 3) 40%', 'var(--x) 10px', '#fff 10% 20%', 'red 0', 'red calc(10% + 2px)'];
  const BAD = ['', 'red 0% 1% 2%', 'red blue', '0% red', 'red; x', 'red 10', 'none', 'url(x.png)', 'red 0%}', 'red !important'];
  it.each(OK)('accepts %j', (v) => expect(isValidCssColor(v, 'stop')).toBe(true));
  it.each(BAD)('rejects %j', (v) => expect(isValidCssColor(v, 'stop')).toBe(false));
  it('strict mode refuses a stop', () => expect(isValidCssColor('red 0%')).toBe(false));
});

describe('picker validation property', () => {
  const registry = new FakeCustomElementRegistry();
  (globalThis as { customElements: unknown }).customElements = registry;
  registry.define('card-mod', class {});
  type P = { value: string; validation: string; _textOk(t: string): boolean; _hint(): string };
  let Picker: new () => P;
  beforeAll(async () => {
    await import('../src/components/cms-color-picker.js');
    Picker = registry.get('cms-color-picker') as new () => P;
  });
  it('defaults to strict and switches with the property', () => {
    const p = new Picker();
    expect(p.validation).toBe('color');
    expect(p._textOk('none')).toBe(false);
    p.validation = 'background';
    expect(p._textOk('none')).toBe(true);
    expect(p._hint()).toContain('colour or image');
    p.validation = 'stop';
    expect(p._textOk('red 0%')).toBe(true);
    expect(p._hint()).toContain('gradient colour');
  });
});

/**
 * Switching Background between Solid and Gradient must not carry a value the
 * other mode refuses (an image in a gradient stop, `red 0%` in a solid).
 * The rendered Type <select> handler is used.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import { tplFind } from './ui-template.js';
import { DEFAULT_BACKGROUND } from '../src/parser/state-mapper.js';
import type { BackgroundModuleState } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
(globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { constructor(public type: string, public init: { detail: unknown }) {} get detail() { return this.init.detail; } };

type M = { state: BackgroundModuleState; _open: boolean; _renderBody(): unknown; dispatchEvent(e: Event): boolean };
let Mod: new () => M;
beforeAll(async () => {
  await import('../src/modules/module-background.js');
  Mod = registry.get('cms-background-module') as typeof Mod;
});

function switchTo(patch: Partial<BackgroundModuleState>, to: 'solid' | 'gradient'): BackgroundModuleState {
  const m = new Mod();
  m.state = { ...DEFAULT_BACKGROUND, enabled: true, ...patch };
  const out: BackgroundModuleState[] = [];
  m.dispatchEvent = (e: Event) => { out.push((e as unknown as CustomEvent).detail); return true; };
  const sel = tplFind(m._renderBody(), 'aria-labelledby=lbl-type', m);
  sel.on.change({ target: { value: to } });
  expect(out).toHaveLength(1);
  return out[0];
}

describe('Solid -> Gradient', () => {
  it('an image in Color is replaced by the default stop', () => {
    const r = switchTo({ type: 'solid', color1: 'url(/local/x.png), red' }, 'gradient');
    expect(r.type).toBe('gradient');
    expect(r.color1).toBe(DEFAULT_BACKGROUND.color1);
  });
  it.each(['none', "url('/a.png')", 'radial-gradient(red, blue)'])('%s is not carried', (v) => {
    expect(switchTo({ type: 'solid', color1: v }, 'gradient').color1).toBe(DEFAULT_BACKGROUND.color1);
  });
  it.each(['#112233', 'red', 'var(--primary-color)', 'rgb(1, 2, 3)'])('a plain colour %s survives', (v) => {
    expect(switchTo({ type: 'solid', color1: v }, 'gradient').color1).toBe(v);
  });
  it('an invalid Color 2 falls back to its own default, a valid one stays', () => {
    expect(switchTo({ type: 'solid', color1: 'red', color2: 'url(x.png)' }, 'gradient').color2).toBe(DEFAULT_BACKGROUND.color2);
    expect(switchTo({ type: 'solid', color1: 'red', color2: 'blue' }, 'gradient').color2).toBe('blue');
  });
});

describe('Gradient -> Solid', () => {
  it('a stop with a position is replaced by the default', () => {
    const r = switchTo({ type: 'gradient', color1: 'red 20%' }, 'solid');
    expect(r.type).toBe('solid');
    expect(r.color1).toBe(DEFAULT_BACKGROUND.color1);
  });
  it.each(['#112233', 'red', 'var(--x)'])('a plain colour %s survives', (v) => {
    expect(switchTo({ type: 'gradient', color1: v }, 'solid').color1).toBe(v);
  });
  it('the other settings ride along', () => {
    const r = switchTo({ type: 'gradient', color1: 'red', angle: 45, applyWhen: 'on' }, 'solid');
    expect(r).toMatchObject({ enabled: true, angle: 45, applyWhen: 'on' });
  });
});

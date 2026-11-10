/**
 * The Animation "While a value matches" threshold and the entities-row rule
 * value use the same numeric-field behaviour as the Threshold module: decimal
 * comma, no silent 0, invalid cue, blur restores. Driven through the rendered
 * handlers.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import { fakeInput, tplFind } from './ui-template.js';
import type { AnimationModuleState, ThresholdRule } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

type Anim = { state: AnimationModuleState; dispatchEvent(e: Event): boolean; _renderValueCondition(): unknown };
type Rows = { styles: unknown; _updateRow(k: string, c: Record<string, unknown>): void;
  _renderRuleBuilder(k: string, p: 'icon' | 'text', r: ThresholdRule[], d: string): unknown };
let Anim: new () => Anim;
let Rows: new () => Rows;
beforeAll(async () => {
  (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
    constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
  await import('../src/modules/module-animation.js');
  await import('../src/modules/module-entities-rows.js');
  Anim = registry.get('cms-animation-module') as typeof Anim;
  Rows = registry.get('cms-entities-rows-module') as typeof Rows;
});

function animation(threshold = 25) {
  const m = new Anim();
  m.state = { ...(m.state ?? {}), valueThreshold: threshold } as AnimationModuleState;
  const emitted: AnimationModuleState[] = [];
  m.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail); return true; });
  return { m, emitted, field: () => tplFind(m._renderValueCondition(), 'aria-label=Threshold value', m) };
}

function rows(value = 30) {
  const m = new Rows();
  const rule: ThresholdRule = { id: 'r', operator: '>', value, color: '#ff0000' };
  const updates: Array<Record<string, unknown>> = [];
  m._updateRow = (_k, c) => { updates.push(c); };
  const field = () => tplFind(m._renderRuleBuilder('sensor.a', 'icon', [rule], '#888888'), 'aria-label=Icon rule 1 value', m);
  return { m, updates, field, stored: value };
}

describe.each([
  ['Animation value trigger', animation, (s: ReturnType<typeof animation>) => s.emitted.at(-1)?.valueThreshold, 25],
  ['entities-row rule', rows, (s: ReturnType<typeof rows>) => (s.updates.at(-1)?.iconRules as ThresholdRule[] | undefined)?.[0]?.value, 30],
] as const)('%s value field', (_n, make, read, stored) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const open = () => make() as any;

  it('is a plain text field with an accessible name and no iOS decimal keypad', () => {
    const tag = open().field().tag as string;
    expect(tag).toContain('type=text');
    expect(tag).toContain('aria-invalid=false');
    expect(tag).not.toContain('inputmode');
  });
  it('2,5 is 2.5 (not 25)', () => {
    const s = open();
    const input = fakeInput('2,5');
    s.field().on.change(input);
    expect(read(s)).toBe(2.5);
    expect(input.value).toBe('2.5');
  });
  it('negative and decimal values are stored as typed', () => {
    const s = open();
    s.field().on.change(fakeInput('-12.5'));
    expect(read(s)).toBe(-12.5);
  });
  it('0 is a real value', () => {
    const s = open();
    s.field().on.change(fakeInput('0'));
    expect(read(s)).toBe(0);
  });
  it.each(['', '   ', '--', 'abc', '12.5.3', '1e999'])('%j stores nothing (no silent 0), cues, and blur restores', (bad) => {
    const s = open();
    const input = fakeInput(bad);
    s.field().on.input(input);
    expect(input.attrs['aria-invalid']).toBe('true');
    s.field().on.change(input);
    expect(read(s)).toBeUndefined();
    s.field().on.blur(input);
    expect(input.value).toBe(String(stored));
    expect(input.attrs['aria-invalid']).toBe('false');
  });
});

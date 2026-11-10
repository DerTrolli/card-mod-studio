/**
 * Numeric rule / condition text fields: decimal comma, no silent 0, bounded
 * values, and an invalid cue. Table-driven parser + the RENDERED handlers of
 * the Threshold module (rules, fade points) and the shared condition field.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import { fakeInput, tplFind } from './ui-template.js';
import { parseRuleNumber, MAX_RULE_VALUE } from '../src/utils/number-input.js';
import { generateCss } from '../src/generator/css-generator.js';
import { DEFAULT_THRESHOLD, mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import type { ColorStop, StyleCondition, ThresholdModuleState, ThresholdRule } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

type Mod = {
  state: ThresholdModuleState; dispatchEvent(e: Event): boolean;
  _renderRule(r: ThresholdRule, i: number): unknown;
  _renderStop(s: ColorStop, i: number, n: number): unknown;
};
let Mod: new () => Mod;
let renderCondition: typeof import('../src/modules/module-base.js').renderCondition;
beforeAll(async () => {
  (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
    constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
  await import('../src/modules/module-threshold.js');
  ({ renderCondition } = await import('../src/modules/module-base.js'));
  Mod = registry.get('cms-threshold-module') as new () => Mod;
});

const VALID: Array<[string, number]> = [
  ['2,5', 2.5], ['2.5', 2.5], ['-0.5', -0.5], ['.5', 0.5], ['-.5', -0.5], ['1e2', 100], ['1E2', 100], ['1e-2', 0.01],
  ['  42  ', 42], ['0', 0], ['-0', 0], ['+3', 3], ['5.', 5], [',5', 0.5], ['-2,5', -2.5], ['1e12', 1e12], ['0.000001', 1e-6],
  ['1000000000000', MAX_RULE_VALUE],
];
const INVALID = [
  '', '   ', '-', '--', '.', ',', 'abc', '12.5.3', '1,2,3', '1,000.5', '1.000,5', '1e', 'e5', '1e20', '1e999', '-1e13', '1000000000001',
  'Infinity', 'NaN', '0x10', '1 2', '2,5,', '1e-7', '0.0000001', '--5', '5-', '٣',
];

describe('parseRuleNumber', () => {
  it.each(VALID)('accepts %j as %d', (raw, n) => expect(parseRuleNumber(raw)).toBe(n));
  it.each(INVALID)('rejects %j', (raw) => expect(parseRuleNumber(raw)).toBeUndefined());
  it('never yields -0', () => expect(Object.is(parseRuleNumber('-0'), 0)).toBe(true));
});

describe('the generated template only ever holds a plain number', () => {
  it('for every accepted input (and on re-parse)', () => {
    for (const [raw] of VALID) {
      const value = parseRuleNumber(raw)!;
      const css = generateCss({
        ...mapToStudioState(parseStyleValue('')),
        threshold: { ...DEFAULT_THRESHOLD, enabled: true, entityId: 'sensor.t', properties: ['text-color'],
          rules: [{ id: 'r', operator: '<', value, color: '#ff0000' }], defaultColor: '#888888' },
      }, 'tile');
      const m = /float\(0\)\s*<\s*([^\s)]+)/.exec(css);
      expect(m, raw).not.toBeNull();
      expect(m![1], raw).toMatch(/^-?\d+(\.\d+)?$/);
    }
  });
});

// ---- rendered Threshold rule / fade-point fields ---------------------------

const rule = (value: number): ThresholdRule => ({ id: 'r1', operator: '<', value, color: '#ff0000' });
const stop = (value: number): ColorStop => ({ id: 's1', value, color: '#00ff00' });

function threshold() {
  const m = new Mod();
  m.state = { ...DEFAULT_THRESHOLD, rules: [rule(10)], colorStops: [stop(5), { ...stop(50), id: 's2' }] };
  const emitted: ThresholdModuleState[] = [];
  m.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail); return true; });
  return { m, emitted };
}

describe.each([
  ['rule', 'aria-label=Rule 1 value', (m: Mod) => m._renderRule(rule(10), 0), (s: ThresholdModuleState) => s.rules[0].value],
  ['fade point', 'aria-label=Fade point 1 value', (m: Mod) => m._renderStop(stop(5), 0, 2), (s: ThresholdModuleState) => s.colorStops[0].value],
] as const)('Threshold %s value field', (_n, label, render, read) => {
  const field = (m: Mod) => tplFind(render(m), label, m);

  it('is a plain text field (no inputmode: the iOS decimal keypad has no minus key) with an accessible name', () => {
    const { m } = threshold();
    expect(field(m).tag).not.toContain('inputmode');
    expect(field(m).tag).toContain('type=text');
  });
  it('a decimal comma is a decimal point (2,5 → 2.5, not 25)', () => {
    const { m, emitted } = threshold();
    const input = fakeInput('2,5');
    field(m).on.change(input);
    expect(read(emitted.at(-1)!)).toBe(2.5);
    expect(input.value).toBe('2.5');
  });
  it.each(['', '   ', '--', '-', '12.5.3', '1e20', 'abc'])('%j stores nothing, shows the cue, and blur restores the stored value', (bad) => {
    const { m, emitted } = threshold();
    const input = fakeInput(bad);
    field(m).on.input(input);
    expect(input.attrs['aria-invalid']).toBe('true');
    field(m).on.change(input);
    expect(emitted).toEqual([]);
    expect(input.attrs['aria-invalid']).toBe('true');
    field(m).on.blur(input);
    expect(input.value).toBe(String(read(m.state)));
    expect(input.attrs['aria-invalid']).toBe('false');
  });
  it('the cue clears once a valid number is typed', () => {
    const { m } = threshold();
    const input = fakeInput('');
    field(m).on.input(input);
    input.value = '-0.5';
    field(m).on.input(input);
    expect(input.attrs['aria-invalid']).toBe('false');
  });
  it.each([['-', undefined], ['.5', 0.5], ['-0.5', -0.5], ['1e2', 100], ['0', 0]] as const)('%j keeps working', (raw, want) => {
    if (want === undefined) return; // a lone "-" is mid-typing: covered above
    const { m, emitted } = threshold();
    field(m).on.change(fakeInput(raw));
    expect(read(emitted.at(-1)!)).toBe(want);
  });
});

// ---- the shared "value matches" condition field -----------------------------

describe('condition Threshold field', () => {
  const make = (threshold = 25) => {
    const out: Array<StyleCondition | undefined> = [];
    const c: StyleCondition = { when: 'value', valueEntity: 'sensor.t', valueOperator: '>', valueThreshold: threshold };
    const t = renderCondition({ condition: c, stateAware: true, noun: 'border', onChange: (n) => out.push(n) });
    return { out, field: () => tplFind(t, 'aria-label=Threshold value') };
  };
  it('is a plain text field without inputmode (iOS decimal keypad has no minus key)', () => {
    const tag = make().field().tag;
    expect(tag).toContain('type=text');
    expect(tag).not.toContain('inputmode');
  });
  it('2,5 → 2.5', () => {
    const { out, field } = make();
    field().on.change(fakeInput('2,5'));
    expect(out.at(-1)?.valueThreshold).toBe(2.5);
  });
  it.each(['', '--', '12.5.3', '1e20'])('%j keeps the previous value (no silent 0) and blur restores it', (bad) => {
    const { out, field } = make(25);
    const input = fakeInput(bad);
    field().on.input(input);
    expect(input.attrs['aria-invalid']).toBe('true');
    field().on.change(input);
    expect(out).toEqual([]);
    field().on.blur(input);
    expect(input.value).toBe('25');
  });
  it('a typed 0 is still a real 0', () => {
    const { out, field } = make(25);
    field().on.change(fakeInput('0'));
    expect(out.at(-1)?.valueThreshold).toBe(0);
  });
});

/**
 * Fixes from the 1.0.0 review (a screen-only click-through):
 *  - "A value matches" starts watching the card's own entity (only on the
 *    switch to it), and the value fields say when no entity is picked yet;
 *  - the comparison list groups number and text comparisons;
 *  - Icon Color shows, while off, what switching it on gives;
 *  - Threshold Colors with no rule says nothing is applied (no "Always" row).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { DEFAULT_ICON_COLOR, DEFAULT_THRESHOLD } from '../src/parser/state-mapper.js';
import type { IconColorModuleState, StyleCondition, ThresholdModuleState } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
(globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
  constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };

type Base = typeof import('../src/modules/module-base.js');
let base: Base;
beforeAll(async () => {
  base = await import('../src/modules/module-base.js');
  await import('../src/modules/module-icon-color.js');
  await import('../src/modules/module-threshold.js');
});

/** Every function in a template, in render order (the event handlers). */
const handlers = (t: unknown): Array<(e: unknown) => void> => {
  if (typeof t === 'function') return [t as (e: unknown) => void];
  if (Array.isArray(t)) return t.flatMap(handlers);
  const v = (t as { values?: unknown[] } | null)?.values;
  return v ? v.flatMap(handlers) : [];
};

describe('seedEntity', () => {
  it('watches the card\'s own entity when none is set', () => {
    expect(base.seedEntity('vacuum.robot', undefined)).toEqual({ valueEntity: 'vacuum.robot' });
    expect(base.seedEntity('vacuum.robot', { valueEntity: '' })).toEqual({ valueEntity: 'vacuum.robot' });
  });
  it('keeps an entity already picked, and gives nothing on an entity-less card', () => {
    expect(base.seedEntity('vacuum.robot', { valueEntity: 'sensor.x' })).toEqual({});
    expect(base.seedEntity('', undefined)).toEqual({});
    expect(base.seedEntity(undefined, undefined)).toEqual({});
  });
});

describe('switching to "A value matches"', () => {
  it('renderCondition: the condition starts with the card\'s entity', () => {
    let got: StyleCondition | undefined;
    const tpl = base.renderCondition({ condition: undefined, stateAware: true, noun: 'noun.border', onChange: (c) => { got = c; }, cardEntity: 'sensor.qa_vac' });
    handlers(tpl)[0]({ target: { value: 'value' } });
    expect(got).toMatchObject({ when: 'value', valueOperator: '>', valueThreshold: 0, valueEntity: 'sensor.qa_vac' });
  });
  it('renderWhen (Background, grayscale): the same', () => {
    let got: StyleCondition | undefined;
    const tpl = base.renderWhen({ value: 'always', stateAware: true, noun: 'noun.background', onChange: () => {}, allowValue: true, onCondition: (c) => { got = c; }, cardEntity: 'sensor.qa_vac' });
    handlers(tpl)[0]({ target: { value: 'value' } });
    expect(got).toMatchObject({ when: 'value', valueEntity: 'sensor.qa_vac' });
  });
  it('an entity-less card gets no entity (the fields then say one is needed)', () => {
    let got: StyleCondition | undefined;
    const tpl = base.renderCondition({ condition: undefined, stateAware: false, noun: 'noun.border', onChange: (c) => { got = c; } });
    handlers(tpl)[0]({ target: { value: 'value' } });
    expect(got?.valueEntity).toBeUndefined();
  });
});

describe('the value fields', () => {
  it('say an entity is needed while none is picked', () => {
    const empty = templateText(base.renderValueFields({ valueOperator: '>', valueThreshold: 0 }, undefined, () => {}));
    expect(empty).toContain('Pick an entity — until then this applies all the time.');
    const set = templateText(base.renderValueFields({ valueEntity: 'sensor.x', valueOperator: '>', valueThreshold: 0 }, undefined, () => {}));
    expect(set).not.toContain('Pick an entity');
  });
  it('group number and text comparisons', () => {
    const t = templateText(base.renderValueFields({ valueEntity: 'sensor.x', valueOperator: '>', valueThreshold: 0 }, undefined, () => {}));
    expect(t).toContain('A number');
    expect(t).toContain('A text (a state such as heating)');
    expect(t.indexOf('A number')).toBeLessThan(t.indexOf('value is'));
  });
});

describe('Icon Color while off', () => {
  type El = HTMLElement & {
    state: IconColorModuleState; allowSize: boolean; cardEntity: string; _open: boolean;
    _renderBody(): unknown; dispatchEvent(e: Event): boolean;
  };
  const make = (state: Partial<IconColorModuleState>, allowSize: boolean) => {
    const Mod = registry.get('cms-icon-color-module') as new () => El;
    const el = new Mod();
    el.state = { ...DEFAULT_ICON_COLOR, ...state };
    el.allowSize = allowSize;
    el.cardEntity = 'light.a';
    el._open = true;
    const emitted: IconColorModuleState[] = [];
    el.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail); return true; });
    return { el, emitted };
  };

  it('shows the mode switching it on gives ("Keep the card\'s color" where there is an Icon size)', () => {
    const t = templateText(make({ enabled: false }, true).el._renderBody());
    expect(t).toContain("Keep the card's color");
    expect(t).not.toContain('Controlled by');
  });

  it('an edit while off switches it on from what was shown', () => {
    const { el, emitted } = make({ enabled: false }, true);
    // the mode select is the body's first handler
    handlers(el._renderBody())[0]({ target: { value: 'plain' } });
    expect(emitted[0]).toMatchObject({ enabled: true, mode: 'plain' });
  });

  it('once on, it shows what is stored', () => {
    const t = templateText(make({ enabled: true, mode: 'conditional' }, true).el._renderBody());
    expect(t).toContain('Controlled by');
  });
});

describe('Threshold Colors with no rule', () => {
  it('says nothing is applied instead of a "Result: Always" row', () => {
    type El = HTMLElement & { state: ThresholdModuleState; _renderLegend(): unknown };
    const Mod = registry.get('cms-threshold-module') as new () => El;
    const el = new Mod();
    el.state = { ...DEFAULT_THRESHOLD, enabled: true, rules: [] };
    const t = templateText(el._renderLegend());
    expect(t).toContain('No rules yet — nothing is applied until you add one.');
    expect(t).not.toContain('Always');
  });
});

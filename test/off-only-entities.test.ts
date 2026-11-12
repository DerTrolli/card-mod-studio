/**
 * An OFF-only entity (climate, water_heater: the state can be `off`, never
 * `on`): condition selects offer "Only while entity is OFF" but not "ON",
 * Icon Color / Accent say the truth, Grayscale keeps its `off` default, and a
 * stored ON condition is still shown, never rewritten.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { isStateAware, panelStateAware, isOffOnlyEntity, stateKindFor, ownStateKind } from '../src/utils/card-caps.js';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { DEFAULT_ICON_COLOR, DEFAULT_ACCENT_COLOR } from '../src/parser/state-mapper.js';
import { renderCondition, renderWhen } from '../src/modules/module-base.js';
const loaders = [
  () => import('../src/modules/module-icon-color.js'), () => import('../src/modules/module-accent-color.js'),
  () => import('../src/modules/module-filter.js'), () => import('../src/modules/module-background.js'),
  () => import('../src/modules/module-border.js'), () => import('../src/modules/module-animation.js'),
];

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

type Mod = { state: unknown; stateAware: boolean; cardEntity: string; _open: boolean; _renderBody(): unknown;
  dispatchEvent(e: Event): boolean };
const ON = 'Only while entity is ON';
const OFF = 'Only while entity is OFF';
const OFF_ONLY = ['climate.living', 'water_heater.boiler'];
const hassWith = (id: string, state: string) => ({ states: { [id]: { state } } });

const FILTER = { enabled: true, grayscale: true, grayscaleWhen: 'always', brightness: 100, blur: 0, transitionMs: 300 };
const BACKGROUND = { enabled: true, type: 'solid', color1: '#fff', color2: '#000', angle: 0, applyWhen: 'always' };
const BORDER = { enabled: true, borderWidth: 2, borderColor: '#fff', radiusPx: 0 };
const ANIMATION = { enabled: true, preset: 'pulse', speedS: 2, trigger: 'always' };

const walkHandlers = (x: unknown): Array<(e: unknown) => void> => {
  if (typeof x === 'function') return [x as (e: unknown) => void];
  if (Array.isArray(x)) return x.flatMap(walkHandlers);
  const v = (x as { values?: unknown[] } | null)?.values;
  return v ? v.flatMap(walkHandlers) : [];
};

describe('an OFF-only entity', () => {
  const C: Record<string, new () => Mod> = {};
  beforeAll(async () => {
    (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
      constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
    for (const load of loaders) await load();
    for (const m of ['icon-color', 'accent-color', 'filter', 'background', 'border', 'animation']) {

      C[m] = registry.get(`cms-${m}-module`) as new () => Mod;
    }
  });
  const mount = (m: string, state: object, entity: string) => {
    const el = new C[m]();
    el.state = state;
    el.cardEntity = entity;
    el.stateAware = panelStateAware('tile', { type: 'tile', entity }, undefined);
    el._open = true;
    const emitted: unknown[] = [];
    el.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail); return true; });
    return { el, emitted, text: () => templateText(el._renderBody()) };
  };

  it('the kind: climate / water_heater off-only, lock / sensor / none, switch on-off', () => {
    expect(OFF_ONLY.map((e) => isOffOnlyEntity(e))).toEqual([true, true]);
    for (const e of ['lock.a', 'cover.a', 'sensor.a', 'person.a', undefined]) expect(isOffOnlyEntity(e)).toBe(false);
    expect(stateKindFor(true, 'switch.a')).toBe('on-off');
    expect(stateKindFor(false, 'climate.c')).toBe('off-only');
    expect(stateKindFor(false, 'lock.a')).toBe('none');
    expect(stateKindFor(false, '')).toBe('none');
    expect(ownStateKind('tile', { type: 'tile', entity: 'water_heater.w' })).toBe('off-only');
    expect(ownStateKind('tile', { type: 'tile', entity: 'light.a' }, hassWith('light.a', 'on'))).toBe('on-off');
    expect(ownStateKind('tile', { type: 'tile' })).toBe('none');
  });

  it('water_heater is never state-aware, whatever its state (isStateAware keeps its boolean meaning)', () => {
    for (const st of ['off', 'eco', 'electric', 'heat_pump', 'unavailable']) {
      expect(isStateAware('tile', 'water_heater.w', hassWith('water_heater.w', st)), st).toBe(false);
    }
  });

  it('renderWhen / renderCondition offer OFF, not ON; a state-aware entity still gets both', () => {
    const w = templateText(renderWhen({ value: 'always', stateAware: false, offOnly: true, noun: 'x', onChange: () => {} }));
    expect(w).toContain('<select');
    expect(w).toContain(OFF);
    expect(w).not.toContain(ON);
    const c = templateText(renderCondition({ condition: undefined, stateAware: false, offOnly: true, noun: 'x', onChange: () => {} }));
    expect(c).toContain(OFF);
    expect(c).not.toContain(ON);
    const both = templateText(renderWhen({ value: 'always', stateAware: true, offOnly: true, noun: 'x', onChange: () => {} }));
    expect(both).toContain(ON);
    expect(both).toContain(OFF);
  });

  it('a stored ON condition is still displayed and nothing is emitted', () => {
    let changed = 'untouched';
    const touch = () => { changed = 'rewritten'; };
    const w = templateText(renderWhen({ value: 'on', stateAware: false, offOnly: true, noun: 'x', onChange: touch }));
    expect(w).toContain(ON);
    expect(w).toContain(OFF);
    const c = templateText(renderCondition({ condition: { when: 'on' }, stateAware: false, offOnly: true, noun: 'x', onChange: touch }));
    expect(c).toContain(ON);
    expect(changed).toBe('untouched');
  });

  it('Background / Border / Filter / Animation: OFF only on climate and water_heater, both on a light, neither on a lock', () => {
    const cases: Array<[string, object]> = [
      ['background', BACKGROUND], ['border', BORDER], ['filter', FILTER], ['animation', ANIMATION],
    ];
    for (const [m, st] of cases) {
      for (const entity of OFF_ONLY) {
        const t = mount(m, st, entity).text();
        expect(t, `${m} ${entity}`).toContain(OFF);
        expect(t, `${m} ${entity}`).not.toContain(ON);
      }
      const light = mount(m, st, 'light.a').text();
      expect(light, m).toContain(ON);
      expect(light, m).toContain(OFF);
      expect(mount(m, st, 'lock.a').text(), m).not.toContain(OFF);
    }
  });

  it('Icon Color and Accent say the entity is never "on", not "won\'t do anything"', () => {
    for (const entity of OFF_ONLY) {
      for (const [m, st] of [
        ['icon-color', { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'conditional' }],
        ['accent-color', { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'conditional' }],
      ] as Array<[string, object]>) {
        const t = mount(m, st, entity).text();
        expect(t, `${m} ${entity}`).toContain('is never "on"');
        expect(t, `${m} ${entity}`).toContain('Threshold Colors');
        expect(t, `${m} ${entity}`).not.toContain("won't do anything");
        expect(mount(m, { ...st, entityId: 'switch.s' }, entity).text()).not.toContain('is never "on"');
      }
    }
  });

  it('Grayscale keeps its default "off" here: switching it on changes no condition', () => {
    const { el, emitted } = mount('filter', { ...FILTER, grayscale: false, grayscaleWhen: 'off' }, 'climate.living');
    walkHandlers(el._renderBody())[0]({ target: { checked: true } });
    expect(emitted[0]).toMatchObject({ grayscale: true, grayscaleWhen: 'off' });
  });
});

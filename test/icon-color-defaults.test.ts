/**
 * Icon Color / Accent review fixes: the entity-less hint says the choice isn't
 * kept, a newly enabled Icon Color starts fixed where ON / OFF would be dead,
 * a stored `light` mode is never a blank select, and the `none` hint is true on
 * a card with no size control. Tests drive the RENDERED handlers.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { DEFAULT_ICON_COLOR, DEFAULT_ACCENT_COLOR } from '../src/parser/state-mapper.js';
import type { IconColorModuleState } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

type El = {
  state: IconColorModuleState; stateAware: boolean; allowSize: boolean; isLightCard: boolean; cardEntity: string;
  _open: boolean; _renderBody(): unknown; render(): unknown; dispatchEvent(e: Event): boolean;
};
let Icon: new () => El;
let Accent: new () => El;
beforeAll(async () => {
  (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
    constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
  await import('../src/modules/module-icon-color.js');
  await import('../src/modules/module-accent-color.js');
  Icon = registry.get('cms-icon-color-module') as new () => El;
  Accent = registry.get('cms-accent-color-module') as new () => El;
});
const handlers = (t: unknown): Array<(e: unknown) => void> => {
  if (typeof t === 'function') return [t as (e: unknown) => void];
  if (Array.isArray(t)) return t.flatMap(handlers);
  const v = (t as { values?: unknown[] } | null)?.values;
  return v ? v.flatMap(handlers) : [];
};
const make = (
  C: new () => El, state: object, o: { stateAware: boolean; entity: string; allowSize?: boolean; light?: boolean },
) => {
  const el = new C();
  el.state = { ...DEFAULT_ICON_COLOR, ...state } as IconColorModuleState;
  el.stateAware = o.stateAware;
  el.cardEntity = o.entity;
  el.allowSize = !!o.allowSize;
  el.isLightCard = !!o.light;
  el._open = true;
  const emitted: IconColorModuleState[] = [];
  el.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail); return true; });
  // Header handlers: click, keydown, switch click, switch change.
  const toggle = (checked: boolean) => handlers(el.render())[3]({ target: { checked } });
  return { el, emitted, toggle, text: () => templateText(el._renderBody()) };
};

describe('entity-less card, ON / OFF with no entity: the hint says the choice is not kept', () => {
  it('Icon Color and Accent', () => {
    for (const [C, st] of [
      [Icon, { enabled: true, mode: 'conditional' }],
      [Accent, { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'conditional' }],
    ] as Array<[new () => El, object]>) {
      const t = make(C, st, { stateAware: false, entity: '' }).text();
      expect(t).toContain('Until then no color is written and this choice');
      expect(t).toContain('kept');
    }
  });
});

describe('a newly enabled Icon Color on a card with no size control', () => {
  const start = (stateAware: boolean, entity: string) => {
    const { toggle, emitted } = make(Icon, {}, { stateAware, entity, allowSize: false });
    toggle(true);
    return emitted[0].mode;
  };
  it('starts as One fixed color when the entity can never be ON', () => {
    for (const e of ['lock.front', 'cover.garage', 'sensor.temp', 'person.me']) expect(start(false, e), e).toBe('plain');
  });
  it('OFF-only entities (climate, water_heater) start fixed too: ON / OFF would show the OFF colour in every state', () => {
    for (const e of ['climate.living', 'water_heater.boiler']) expect(start(false, e), e).toBe('plain');
  });
  it('a real on/off entity still starts as Different for ON / OFF', () => {
    expect(start(true, 'light.a')).toBe('conditional');
    expect(start(true, 'switch.s')).toBe('conditional');
  });
  it('a module the user already configured keeps its mode, whatever the entity', () => {
    const { toggle, emitted } = make(Icon, { mode: 'conditional', entityId: 'switch.s' }, { stateAware: false, entity: 'lock.a' });
    toggle(true);
    expect(emitted[0].mode).toBe('conditional');
  });
});

describe('a stored mode is never a blank select', () => {
  it('"Match the light\'s color" shows on a card that is not a light card', () => {
    const t = make(Icon, { enabled: true, mode: 'light' }, { stateAware: true, entity: 'switch.s', light: false }).text();
    expect(t).toContain("Match the light's color");
    // not stored → still not offered on a non-light card
    const other = make(Icon, { enabled: true, mode: 'plain' }, { stateAware: true, entity: 'switch.s', light: false }).text();
    expect(other).not.toContain("Match the light's color");
  });
});

describe('the "keep the card\'s colour" hint is true on a card with no size control', () => {
  it('with a size control: mentions the size', () => {
    expect(make(Icon, { enabled: true, mode: 'none' }, { stateAware: true, entity: 'light.a', allowSize: true }).text())
      .toContain('only the size below changes');
  });
  it('without one (a preset): says no colour is written, not "the size below"', () => {
    const t = make(Icon, { enabled: true, mode: 'none' }, { stateAware: true, entity: 'light.a', allowSize: false }).text();
    expect(t).not.toContain('size below');
    expect(t).toContain('writes no colour');
  });
});

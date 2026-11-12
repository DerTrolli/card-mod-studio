/**
 * Grayscale's factory condition is "Only while entity is OFF". Where the card's
 * entity has no `off` state of its own (sensor, gauge, input_number, lock,
 * cover…) that can never match, so switching Grayscale on starts as "Always".
 * Stored conditions are never rewritten. Tests drive the RENDERED switch
 * handler pulled out of the template.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import { DEFAULT_FILTER, mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { generateCss } from '../src/generator/css-generator.js';
import type { FilterModuleState } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

type El = { state: FilterModuleState; stateAware: boolean; cardEntity: string; _open: boolean;
  _renderBody(): unknown; dispatchEvent(e: Event): boolean };
let Mod: new () => El;
beforeAll(async () => {
  (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
    constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
  await import('../src/modules/module-filter.js');
  Mod = registry.get('cms-filter-module') as new () => El;
});

const handlers = (t: unknown): Array<(e: unknown) => void> => {
  if (typeof t === 'function') return [t as (e: unknown) => void];
  if (Array.isArray(t)) return t.flatMap(handlers);
  const v = (t as { values?: unknown[] } | null)?.values;
  return v ? v.flatMap(handlers) : [];
};
const make = (state: Partial<FilterModuleState>, stateAware: boolean, cardEntity: string) => {
  const el = new Mod();
  el.state = { ...DEFAULT_FILTER, enabled: true, ...state };
  el.stateAware = stateAware;
  el.cardEntity = cardEntity;
  el._open = true;
  const emitted: FilterModuleState[] = [];
  el.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail); return true; });
  // The Grayscale switch is the first handler in the body.
  const grayscale = (checked: boolean) => handlers(el._renderBody())[0]({ target: { checked } });
  return { el, emitted, grayscale };
};

describe('switching Grayscale on', () => {
  it.each([
    ['a sensor', 'sensor.temp'], ['an input_number (Bubble slider)', 'input_number.level'],
    ['a lock', 'lock.front'], ['a cover', 'cover.garage'], ['a person', 'person.me'],
    ['an alarm panel', 'alarm_control_panel.home'],
  ])('%s: starts as "Always"', (_n, entity) => {
    const { grayscale, emitted } = make({}, false, entity);
    grayscale(true);
    expect(emitted[0]).toMatchObject({ grayscale: true, grayscaleWhen: 'always' });
    // …and the saved style actually greys the card (no never-true ternary).
    const css = generateCss(
      { ...mapToStudioState(parseStyleValue('')), filter: emitted[0] }, 'sensor', { config: { type: 'sensor', entity } },
    );
    expect(css).toContain('filter: grayscale(100%)');
    expect(css).not.toContain('is_state');
  });

  it('a state-aware entity keeps today\'s default (only while OFF)', () => {
    const { grayscale, emitted } = make({}, true, 'light.a');
    grayscale(true);
    expect(emitted[0]).toMatchObject({ grayscale: true, grayscaleWhen: 'off' });
  });

  it('switching it off only turns it off', () => {
    const { grayscale, emitted } = make({ grayscale: true, grayscaleWhen: 'always' }, false, 'sensor.t');
    grayscale(false);
    expect(emitted[0]).toMatchObject({ grayscale: false, grayscaleWhen: 'always' });
  });

  it('a deliberate "another entity" choice is not replaced', () => {
    const { grayscale, emitted } = make({ grayscaleWhen: 'custom', customEntity: 'input_boolean.x' }, false, 'sensor.t');
    grayscale(true);
    expect(emitted[0]).toMatchObject({ grayscaleWhen: 'custom', customEntity: 'input_boolean.x' });
  });
});

describe('a stored ON / OFF grayscale on a card that cannot match it is left as it is', () => {
  const stored = { grayscale: true } as const;
  for (const when of ['off', 'on'] as const) {
    it(`'${when}': opening and toggling other controls never rewrite it`, () => {
      const { el, emitted } = make({ ...stored, grayscaleWhen: when }, false, 'sensor.t');
      el._renderBody(); // opening emits nothing
      expect(emitted).toHaveLength(0);
      // Other controls (sliders) emit the whole state with the stored condition intact.
      for (const h of handlers(el._renderBody()).slice(2)) {
        try { h({ target: { value: '50', checked: true } }); } catch { /* not a control handler */ }
      }
      expect(emitted.length).toBeGreaterThan(0);
      for (const d of emitted) expect(d.grayscaleWhen).toBe(when);
    });
  }

  it('a stored "off" round-trips byte-identically on a sensor card', () => {
    const css = "ha-card {\n  filter: {{ 'grayscale(100%)' if is_state(config.entity, 'off') else 'none' }};\n}";
    const back = mapToStudioState(parseStyleValue(css), 'sensor');
    expect(back.filter.grayscaleWhen).toBe('off');
    expect(generateCss(back, 'sensor', { config: { type: 'sensor', entity: 'sensor.t' } })).toContain("is_state(config.entity, 'off')");
  });
});

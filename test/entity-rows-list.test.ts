/**
 * Entity Rows list clarity: ambiguous labels are numbered on every row, a
 * note appears only when the card has rows without controls, and toggling a
 * rendered row switch on and off still saves every row unchanged.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry, templateText, installEngines, restoreEngines } from './v010-audit-helpers.js';
import { initEntityRowStyles, applyEntityRowStyles } from '../src/editor/studio-state.js';
import type { CardModCardConfig, EntitiesRowStyles } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

type Rows = {
  rows: unknown[]; styles: EntitiesRowStyles; _openRows: Set<string>;
  render(): unknown; dispatchEvent(e: Event): boolean;
};
let Mod: new () => Rows;
let entityRowLabels: (h: undefined, rows: unknown[]) => Map<number, string>;
beforeAll(async () => {
  (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
    constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
  const m = await import('../src/modules/module-entities-rows.js');
  entityRowLabels = m.entityRowLabels as never;
  Mod = registry.get('cms-entities-rows-module') as new () => Rows;
});

const handlers = (t: unknown): Array<(e: unknown) => void> => {
  if (typeof t === 'function') return [t as (e: unknown) => void];
  if (Array.isArray(t)) return t.flatMap(handlers);
  const v = (t as { values?: unknown[] } | null)?.values;
  return v ? v.flatMap(handlers) : [];
};

function make(rows: unknown[]) {
  const el = new Mod();
  el.rows = rows;
  el.styles = initEntityRowStyles({ type: 'entities', entities: rows } as unknown as CardModCardConfig);
  const emitted: EntitiesRowStyles[] = [];
  el.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail); return true; });
  return { el, emitted, text: () => templateText(el.render()) };
}
const NOTE = 'Section, divider and link rows have no styling controls.';

describe('row labels', () => {
  it('two rows on one entity are labelled (1) and (2); a unique label stays bare', () => {
    const { text } = make(['light.kitchen', { entity: 'light.kitchen' }, 'sensor.temp']);
    const t = text();
    expect(t).toContain('kitchen (1)');
    expect(t).toContain('kitchen (2)');
    expect(t).not.toMatch(/temp \(\d\)/);
  });

  it('same entity with different explicit names is not ambiguous', () => {
    const labels = entityRowLabels(undefined, [{ entity: 'light.a', name: 'Big' }, { entity: 'light.a', name: 'Small' }]);
    expect([...labels.values()]).toEqual(['Big', 'Small']);
  });

  it('labels are keyed by config index, skipping rows without an entity', () => {
    const labels = entityRowLabels(undefined, [{ type: 'section' }, 'light.a', 'light.a']);
    expect([...labels.entries()]).toEqual([[1, 'a (1)'], [2, 'a (2)']]);
  });
});

describe('rows without controls', () => {
  it('shows one muted note when a section/divider/weblink/entity-less button row exists', () => {
    const { text } = make(['light.a', { type: 'section' }, { type: 'divider' }, { type: 'weblink', url: 'x' }, { type: 'button', name: 'b' }]);
    const t = text();
    expect(t).toContain(NOTE);
    expect(t.split(NOTE)).toHaveLength(2);
  });

  it('no note when every row is styleable', () => {
    expect(make(['light.a', { entity: 'light.b' }]).text()).not.toContain(NOTE);
  });
});

describe('rendered row switch on, then off', () => {
  it('every row is saved exactly as loaded', () => {
    installEngines(['card-mod']);
    try {
      const rows = [
        { entity: 'light.a', card_mod: { style: ':host { --paper-item-icon-color: red; }\n' } },
        'light.kitchen',
        { entity: 'light.kitchen' },
      ];
      const original = JSON.parse(JSON.stringify(rows));
      const config = { type: 'entities', entities: rows } as unknown as CardModCardConfig;
      const { el, emitted } = make(rows);
      el._openRows = new Set(['2']);
      // two closed rows (click + keydown each), row 2's header (2), then its Icon color switch
      const iconSwitch = handlers(el.render())[6];
      iconSwitch({ target: { checked: true } });
      expect(emitted).toHaveLength(1);
      el.styles = emitted[0];
      const onOut = applyEntityRowStyles(config, el.styles) as unknown as { entities: unknown[] };
      expect(onOut.entities[2]).not.toEqual(original[2]);
      iconSwitch({ target: { checked: false } });
      expect(emitted).toHaveLength(2);
      const out = applyEntityRowStyles(config, emitted[1]) as unknown as { entities: unknown[] };
      expect(out.entities).toEqual(original);
    } finally {
      restoreEngines();
    }
  });
});

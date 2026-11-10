/**
 * The preview hover chip for an entities-card row names the row the way the
 * panel's row list does, so two rows on one entity read differently.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';

describe('entities hover chip', () => {
  const registry = new FakeCustomElementRegistry();
  (globalThis as { customElements: unknown }).customElements = registry;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
  let Picker: new () => { cardConfig?: unknown; _rowLabel(card: unknown, i: number): string | undefined };
  beforeAll(async () => {
    await import('../src/editor/cms-preview-picker.js');
    Picker = registry.get('cms-preview-picker') as typeof Picker;
  });
  const hass = { states: { 'light.a': { state: 'on', attributes: { friendly_name: 'Lamp' } }, 'sensor.t': { state: '1', attributes: { friendly_name: 'Temp' } } } };
  it('two rows on one entity read "Name (1)" / "Name (2)", others stay bare', () => {
    const p = new Picker();
    p.cardConfig = { entities: ['light.a', 'sensor.t', { entity: 'light.a' }] };
    const card = { hass };
    expect(p._rowLabel(card, 0)).toBe('Entity Rows — Lamp (1)');
    expect(p._rowLabel(card, 1)).toBe('Entity Rows — Temp');
    expect(p._rowLabel(card, 2)).toBe('Entity Rows — Lamp (2)');
  });
  it('no entities list → the caller keeps the plain chip', () => {
    const p = new Picker();
    p.cardConfig = {};
    expect(p._rowLabel({ hass }, 0)).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { entityRowLabel } from '../src/modules/module-entities-rows.js';
import type { HomeAssistant } from '../src/types/index.js';

const states = {
  'sensor.sun_next_dawn': { attributes: { friendly_name: 'Sun Next dawn' } },
  'light.nameless': { attributes: {} },
};
const hassOf = (extra: Record<string, unknown> = {}) => ({ states, ...extra }) as unknown as HomeAssistant;

describe('entityRowLabel', () => {
  it('uses hass.formatEntityName(stateObj, row.name) when HA provides it (2026.11+)', () => {
    const calls: unknown[][] = [];
    const hass = hassOf({
      formatEntityName: (so: unknown, name?: unknown) => { calls.push([so, name]); return name ? String(name) : 'Device Entity'; },
    });
    expect(entityRowLabel(hass, 'sensor.sun_next_dawn')).toBe('Device Entity');
    expect(calls[0][0]).toBe(states['sensor.sun_next_dawn']);
    expect(calls[0][1]).toBeUndefined();
    expect(entityRowLabel(hass, 'sensor.sun_next_dawn', 'Mine')).toBe('Mine');
  });

  it('falls back to name, friendly name, object id on older HA', () => {
    const hass = hassOf();
    expect(entityRowLabel(hass, 'sensor.sun_next_dawn', 'Mine')).toBe('Mine');
    expect(entityRowLabel(hass, 'sensor.sun_next_dawn')).toBe('Sun Next dawn');
    expect(entityRowLabel(hass, 'light.nameless')).toBe('nameless');
    expect(entityRowLabel(hass, 'light.gone')).toBe('gone');
    expect(entityRowLabel(undefined, 'light.gone')).toBe('gone');
  });

  it('falls back when the helper throws or returns nothing', () => {
    expect(entityRowLabel(hassOf({ formatEntityName: () => { throw new Error('x'); } }), 'sensor.sun_next_dawn')).toBe('Sun Next dawn');
    expect(entityRowLabel(hassOf({ formatEntityName: () => '' }), 'sensor.sun_next_dawn')).toBe('Sun Next dawn');
  });

  it('does not call the helper for an entity with no state', () => {
    let called = false;
    const hass = hassOf({ formatEntityName: () => { called = true; return 'X'; } });
    expect(entityRowLabel(hass, 'light.gone')).toBe('gone');
    expect(called).toBe(false);
  });
});

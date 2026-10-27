import { describe, it, expect } from 'vitest';
import { ownedEntryFor, ownedEntryKey, parseOwnedEntry } from '../src/utils/owned-entries.js';

describe('Studio-owned number-size entries', () => {
  it('builds the probed shapes for gauge and thermostat', () => {
    expect(ownedEntryFor('gauge', 30)).toEqual({ key: 'ha-gauge$', value: 'text.value-text {\n  font-size: 30px !important;\n}' });
    expect(ownedEntryFor('thermostat', 30)).toEqual({
      key: 'ha-state-control-climate-temperature$',
      value: { 'ha-big-number$': '.value {\n  font-size: 30px !important;\n}' },
    });
    expect(ownedEntryFor('tile', 30)).toBeNull();
    expect(ownedEntryKey('entities')).toBeNull();
  });

  it('round-trips every 5 % gauge step exactly (one decimal, no drift)', () => {
    for (let pct = 50; pct <= 200; pct += 5) {
      const px = Math.round(16 * pct) / 100;
      const e = ownedEntryFor('gauge', px)!;
      const back = parseOwnedEntry('gauge', e.key, e.value)!;
      expect(back).not.toBeNull();
      expect(ownedEntryFor('gauge', back)).toEqual(e);
    }
  });

  it('accepts the trailing newline of a YAML block scalar', () => {
    expect(parseOwnedEntry('gauge', 'ha-gauge$', 'text.value-text {\n  font-size: 24px !important;\n}\n')).toBe(24);
  });

  it('rejects anything that is not exactly the Studio shape', () => {
    expect(parseOwnedEntry('gauge', 'ha-gauge$', 'text.value-text { font-size: 24px !important; }')).toBeNull();
    expect(parseOwnedEntry('gauge', 'ha-gauge$', 'text.value-text {\n  font-size: 24px !important;\n  fill: red;\n}')).toBeNull();
    expect(parseOwnedEntry('gauge', 'ha-gauge$', 'text.value-text {\n  font-size: 24px;\n}')).toBeNull();
    expect(parseOwnedEntry('gauge', 'ha-gauge$', { 'text.value-text': 'x' })).toBeNull();
    expect(parseOwnedEntry('thermostat', 'ha-state-control-climate-temperature$', {
      'ha-big-number$': '.value {\n  font-size: 30px !important;\n}',
      '.': 'color: red;',
    })).toBeNull();
    expect(parseOwnedEntry('thermostat', 'ha-state-control-climate-temperature$', '.value { font-size: 30px }')).toBeNull();
    // right shape, wrong card type
    expect(parseOwnedEntry('thermostat', 'ha-gauge$', 'text.value-text {\n  font-size: 24px !important;\n}')).toBeNull();
  });
});

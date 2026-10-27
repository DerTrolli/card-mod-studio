import { describe, it, expect } from 'vitest';
import { ownedEntryFor, ownedEntryKey, parseOwnedEntry } from '../src/utils/owned-entries.js';

describe('Studio-owned number-size entries', () => {
  it('builds the probed shapes for gauge and thermostat', () => {
    expect(ownedEntryFor('gauge', 125)).toEqual({ key: 'ha-gauge$', value: '.text {\n  max-width: 68.8% !important;\n  max-height: 50% !important;\n}' });
    expect(ownedEntryFor('thermostat', 30)).toEqual({
      key: 'ha-state-control-climate-temperature$',
      value: { 'ha-big-number$': '.value {\n  font-size: 30px !important;\n}' },
    });
    expect(ownedEntryFor('tile', 30)).toBeNull();
    expect(ownedEntryKey('entities')).toBeNull();
  });

  it('round-trips every 5 % gauge step exactly (one decimal, no drift)', () => {
    for (let px = 50; px <= 150; px += 5) {
      const e = ownedEntryFor('gauge', px)!;
      const back = parseOwnedEntry('gauge', e.key, e.value)!;
      expect(back).not.toBeNull();
      expect(ownedEntryFor('gauge', back)).toEqual(e);
    }
  });

  it('accepts the trailing newline of a YAML block scalar', () => {
    expect(parseOwnedEntry('gauge', 'ha-gauge$', '.text {\n  max-width: 55% !important;\n  max-height: 40% !important;\n}\n')).toBe(100);
  });

  it('rejects anything that is not exactly the Studio shape', () => {
    expect(parseOwnedEntry('gauge', 'ha-gauge$', '.text { max-width: 55% !important; max-height: 40% !important; }')).toBeNull();
    expect(parseOwnedEntry('gauge', 'ha-gauge$', '.text {\n  max-width: 55% !important;\n  max-height: 50% !important;\n}')).toBeNull();
    expect(parseOwnedEntry('gauge', 'ha-gauge$', 'text.value-text {\n  font-size: 24px !important;\n}')).toBeNull();
    expect(parseOwnedEntry('gauge', 'ha-gauge$', { 'text.value-text': 'x' })).toBeNull();
    expect(parseOwnedEntry('thermostat', 'ha-state-control-climate-temperature$', {
      'ha-big-number$': '.value {\n  font-size: 30px !important;\n}',
      '.': 'color: red;',
    })).toBeNull();
    expect(parseOwnedEntry('thermostat', 'ha-state-control-climate-temperature$', '.value { font-size: 30px }')).toBeNull();
    // right shape, wrong card type
    expect(parseOwnedEntry('thermostat', 'ha-gauge$', '.text {\n  max-width: 55% !important;\n  max-height: 40% !important;\n}')).toBeNull();
  });
});

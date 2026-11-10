import { describe, it, expect } from 'vitest';
import { ownedEntryFor, parseOwnedEntry, GAUGE_SIZE } from '../src/utils/owned-entries.js';

const anchor = '  left: 0 !important;\n  right: 0 !important;\n  margin: 0 auto !important;\n  transform: none !important;\n';
const betaCss = (p: number, anchored: boolean) =>
  `.text {\n  max-width: ${Math.round(0.55 * p * 10) / 10}% !important;\n  max-height: ${Math.round(0.4 * p * 10) / 10}% !important;\n${anchored ? anchor : ''}}`;
const css = (w: string, h: string, anchored = true) =>
  `.text {\n  max-width: ${w}% !important;\n  max-height: ${h}% !important;\n${anchored ? anchor : ''}}`;

describe('legacy gauge shapes: only what the betas wrote (50-150 %, steps of 5)', () => {
  it('hand-written look-alikes at other percentages stay hand-written', () => {
    for (const anchored of [true, false]) {
      expect(parseOwnedEntry('gauge', 'ha-gauge$', css('0', '0', anchored))).toBeNull(); // hides the number
      expect(parseOwnedEntry('gauge', 'ha-gauge$', css('5.5', '4', anchored))).toBeNull(); // read as 10
      expect(parseOwnedEntry('gauge', 'ha-gauge$', css('24.2', '17.6', anchored))).toBeNull(); // 44 %
      expect(parseOwnedEntry('gauge', 'ha-gauge$', css('88', '64', anchored))).toBeNull(); // 160 %
    }
  });
  it('off-step percentages are not the betas (53 %)', () => {
    expect(parseOwnedEntry('gauge', 'ha-gauge$', betaCss(53, true))).toBeNull();
    expect(parseOwnedEntry('gauge', 'ha-gauge$', betaCss(53, false))).toBeNull();
  });
  it('bounds are inclusive: 50 and 150 accepted, 45 and 155 not', () => {
    for (const anchored of [true, false]) {
      expect(parseOwnedEntry('gauge', 'ha-gauge$', betaCss(50, anchored))).toBe(50);
      expect(parseOwnedEntry('gauge', 'ha-gauge$', betaCss(150, anchored))).toBe(GAUGE_SIZE.max);
      expect(parseOwnedEntry('gauge', 'ha-gauge$', betaCss(45, anchored))).toBeNull();
      expect(parseOwnedEntry('gauge', 'ha-gauge$', betaCss(155, anchored))).toBeNull();
    }
  });
});

describe('gauge builder: odd inputs build an entry that parses back', () => {
  const back = (v: unknown) => {
    const e = ownedEntryFor('gauge', v as number)!;
    expect(String(e.value)).not.toMatch(/NaN|Infinity|undefined/);
    return parseOwnedEntry('gauge', e.key, e.value);
  };
  it.each([
    [NaN, 100], ['abc', 100], [undefined, 100], [Infinity, 100], [-Infinity, 100], [-20, 50], [0, 50],
    [72.5, 75], [72.4, 70], [49, 50], [131, 130], [1000, 130], ['85', 85], ['72.5', 75], [' 90 ', 90], ['', 100],
  ])('%s -> %s', (input, expected) => {
    expect(back(input)).toBe(expected);
  });
  it('a numeric string and its number build the same entry', () => {
    expect(ownedEntryFor('gauge', '85' as unknown as number)).toEqual(ownedEntryFor('gauge', 85));
  });
  it('thermostat: a non-finite size falls back to the default', () => {
    for (const v of [NaN, Infinity, 'abc' as unknown as number]) {
      const e = ownedEntryFor('thermostat', v)!;
      expect(parseOwnedEntry('thermostat', e.key, e.value)).toBe(57);
    }
  });
});

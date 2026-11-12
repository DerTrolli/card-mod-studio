import { describe, it, expect } from 'vitest';
import { ownedEntryFor, ownedEntryKey, parseOwnedEntry, GAUGE_SIZE } from '../src/utils/owned-entries.js';

const anchor = '  left: 0 !important;\n  right: 0 !important;\n  margin: 0 auto !important;\n  transform: none !important;\n';
/** What 0.11.0-beta.2 (anchored) and beta.1 (not) wrote at a percentage. */
const betaCss = (p: number, anchored: boolean) =>
  `.text {\n  max-width: ${Math.round(0.55 * p * 10) / 10}% !important;\n  max-height: ${Math.round(0.4 * p * 10) / 10}% !important;\n${anchored ? anchor : ''}}`;

describe('Studio-owned number-size entries', () => {
  it('builds the probed shapes for gauge and thermostat', () => {
    expect(ownedEntryFor('gauge', 125)).toEqual({ key: 'ha-gauge$', value: '.text {\n  max-width: 56% !important;\n  max-height: 50% !important;\n' + anchor + '}' });
    expect(ownedEntryFor('thermostat', 30)).toEqual({
      key: 'ha-state-control-climate-temperature$',
      value: { 'ha-big-number$': '.value {\n  font-size: 30px !important;\n}' },
    });
    expect(ownedEntryFor('tile', 30)).toBeNull();
    expect(ownedEntryKey('entities')).toBeNull();
  });

  it('round-trips every slider step exactly (one decimal, no drift)', () => {
    expect(GAUGE_SIZE).toEqual({ min: 50, max: 130, step: 5 });
    for (let p = GAUGE_SIZE.min; p <= GAUGE_SIZE.max; p += GAUGE_SIZE.step) {
      const e = ownedEntryFor('gauge', p)!;
      expect(parseOwnedEntry('gauge', e.key, e.value)).toBe(p);
    }
  });

  it("100 % is HA's own box (50 % x 40 %); the width is capped at 56 %, the height keeps growing", () => {
    expect(ownedEntryFor('gauge', 100)!.value).toContain('max-width: 50% !important;');
    expect(ownedEntryFor('gauge', 100)!.value).toContain('max-height: 40% !important;');
    expect(ownedEntryFor('gauge', 50)!.value).toContain('max-width: 25% !important;');
    expect(ownedEntryFor('gauge', 110)!.value).toContain('max-width: 55% !important;');
    expect(ownedEntryFor('gauge', 130)!.value).toContain('max-width: 56% !important;');
    expect(ownedEntryFor('gauge', 130)!.value).toContain('max-height: 52% !important;');
  });

  it('a larger setting never shrinks the box; settings past the maximum write the maximum', () => {
    const dims = (p: number) => {
      const v = ownedEntryFor('gauge', p)!.value as string;
      return [Number(v.match(/max-width: ([\d.]+)%/)![1]), Number(v.match(/max-height: ([\d.]+)%/)![1])];
    };
    for (let p = GAUGE_SIZE.min; p < GAUGE_SIZE.max; p += GAUGE_SIZE.step) {
      expect(dims(p + GAUGE_SIZE.step)[0]).toBeGreaterThanOrEqual(dims(p)[0]);
      expect(dims(p + GAUGE_SIZE.step)[1]).toBeGreaterThan(dims(p)[1]);
    }
    expect(ownedEntryFor('gauge', 150)).toEqual(ownedEntryFor('gauge', 130));
  });

  it('accepts the trailing newline of a YAML block scalar', () => {
    expect(parseOwnedEntry('gauge', 'ha-gauge$', (ownedEntryFor('gauge', 100)!.value as string) + '\n')).toBe(100);
  });

  it('re-anchors the gauge box so max-width can exceed half the gauge', () => {
    // HA's `left: 50%` caps an absolutely positioned box at 50 % of the gauge width.
    expect(ownedEntryFor('gauge', 130)!.value).toContain('left: 0 !important;');
    expect(ownedEntryFor('gauge', 130)!.value).toContain('transform: none !important;');
  });

  it("recognises every beta.1 and beta.2 shape as the Studio's own, at the same setting (past the maximum reads as the maximum)", () => {
    for (const anchored of [true, false]) {
      for (const p of [50, 55, 75, 100, 105, 115, 120, 125, 130]) {
        expect(parseOwnedEntry('gauge', 'ha-gauge$', betaCss(p, anchored))).toBe(p);
      }
      for (const p of [135, 140, 150]) expect(parseOwnedEntry('gauge', 'ha-gauge$', betaCss(p, anchored))).toBe(GAUGE_SIZE.max);
    }
    // the exact beta.1 text at 125 and the exact beta.2 text at 150
    expect(parseOwnedEntry('gauge', 'ha-gauge$', '.text {\n  max-width: 68.8% !important;\n  max-height: 50% !important;\n}')).toBe(125);
    expect(parseOwnedEntry('gauge', 'ha-gauge$', '.text {\n  max-width: 82.5% !important;\n  max-height: 60% !important;\n' + anchor + '}')).toBe(130);
  });

  it('beta entries upgrade: re-building from the parsed setting writes the new shape', () => {
    for (const p of [50, 100, 130, 150]) {
      const parsed = parseOwnedEntry('gauge', 'ha-gauge$', betaCss(p, true))!;
      const rebuilt = ownedEntryFor('gauge', parsed)!;
      expect(rebuilt.value).not.toBe(betaCss(p, true));
      expect(parseOwnedEntry('gauge', 'ha-gauge$', rebuilt.value)).toBe(parsed);
    }
  });

  it('rejects anything that is not exactly the Studio shape', () => {
    expect(parseOwnedEntry('gauge', 'ha-gauge$', '.text { max-width: 55% !important; max-height: 40% !important; }')).toBeNull();
    // hand-written look-alikes: a width the Studio never writes, an extra rule, a missing anchor on the new box
    expect(parseOwnedEntry('gauge', 'ha-gauge$', '.text {\n  max-width: 60% !important;\n  max-height: 40% !important;\n' + anchor + '}')).toBeNull();
    expect(parseOwnedEntry('gauge', 'ha-gauge$', (ownedEntryFor('gauge', 100)!.value as string) + '\n.x { color: red; }')).toBeNull();
    expect(parseOwnedEntry('gauge', 'ha-gauge$', '.text {\n  max-width: 50% !important;\n  max-height: 40% !important;\n}')).toBeNull();
    expect(parseOwnedEntry('gauge', 'ha-gauge$', '.text {\n  max-width: 55% !important;\n  max-height: 50% !important;\n}')).toBeNull();
    expect(parseOwnedEntry('gauge', 'ha-gauge$', '.text {\n  max-width: 55% !important;\n  max-height: 40% !important;\n  left: 0 !important;\n}')).toBeNull();
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

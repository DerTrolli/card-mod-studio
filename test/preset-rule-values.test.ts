/**
 * Old presets stored threshold rule / fade-point values as text. The
 * migration makes them numbers (the generator interpolates them into the
 * template and does arithmetic on fade points), drops only entries that
 * could not be a number, and leaves a current-shape state alone.
 */
import { describe, it, expect } from 'vitest';
import { migrateStudioState, DEFAULT_THRESHOLD, mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { generateCss } from '../src/generator/css-generator.js';

const old = (threshold: Record<string, unknown>) =>
  migrateStudioState({ threshold: { enabled: true, entityId: 'sensor.t', properties: ['icon-color'], defaultColor: '#888888', ...threshold } });

describe('migrateStudioState: threshold values', () => {
  it('turns text rule values into numbers and the CSS uses them', () => {
    const s = old({ rules: [
      { id: 'a', operator: '>', value: '12.5', color: '#ff0000' },
      { id: 'b', operator: '<=', value: ' -3 ', color: '#0000ff' },
    ] });
    expect(s.threshold.rules.map((r) => r.value)).toEqual([12.5, -3]);
    expect(generateCss(s, 'tile')).toContain('> 12.5');
  });

  it('turns text fade-point values into numbers so the fade arithmetic works', () => {
    const s = old({ valueMode: 'gradient', colorStops: [
      { id: 'a', value: '0', color: '#0000ff' }, { id: 'b', value: '100', color: '#ff0000' },
    ] });
    expect(s.threshold.colorStops.map((c) => c.value)).toEqual([0, 100]);
    expect(generateCss(s, 'tile')).not.toMatch(/NaN|undefined/);
  });

  it('takes only decimal numbers from text', () => {
    const texts = [' 12 ', '-.5', '1e3', '+4', '7.', '0x10', '12px', '', 'Infinity', '1 2', '1e', '0b11', '--5'];
    const s = old({ rules: texts.map((value, i) => ({ id: `r${i}`, operator: '>', value, color: '#ff0000' })) });
    expect(s.threshold.rules.map((r) => [r.id, r.value])).toEqual([
      ['r0', 12], ['r1', -0.5], ['r2', 1000], ['r3', 4], ['r4', 7],
    ]);
  });

  it('drops a rule whose value cannot be a number, keeps the others', () => {
    const s = old({ rules: [
      { id: 'a', operator: '>', value: 'warm', color: '#ff0000' },
      { id: 'b', operator: '>', value: '', color: '#ff0000' },
      { id: 'c', operator: '>', value: null, color: '#ff0000' },
      { id: 'd', operator: '>', value: '5', color: '#00ff00' },
    ] });
    expect(s.threshold.rules.map((r) => r.id)).toEqual(['d']);
    expect(generateCss(s, 'tile')).not.toMatch(/warm|NaN/);
  });

  it('a state already in the current shape comes back unchanged', () => {
    const current = mapToStudioState(parseStyleValue(''));
    current.threshold = {
      ...DEFAULT_THRESHOLD, enabled: true, entityId: 'sensor.t', properties: ['icon-color', 'background'],
      rules: [
        { id: 'a', operator: '>', value: 20, color: '#ff0000' },
        { id: 'b', operator: '==', value: 0, color: '#00ff00' },
        { id: 'c', operator: '<', value: -1.5, color: '#0000ff' },
      ],
    };
    expect(migrateStudioState(current)).toEqual(current);
    expect(migrateStudioState(migrateStudioState(current))).toEqual(current);
  });
});

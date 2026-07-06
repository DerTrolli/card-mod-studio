import { describe, it, expect } from 'vitest';
import { migrateStudioState, DEFAULT_THRESHOLD } from '../src/parser/state-mapper.js';
import { generateCss } from '../src/generator/css-generator.js';

// A preset exactly as v0.6.2 stored it: threshold had a singular `property`,
// no valueMode/colorStops; accentColor had no mode/colorOn/colorOff.
// (Shapes verified against `git show v0.6.2:src/types/index.ts`.)
const V062_PRESET_STATE = {
  filter: { enabled: false, grayscale: false, grayscaleWhen: 'off', brightness: 100, blur: 0, transitionMs: 300 },
  iconColor: { enabled: false, mode: 'conditional', color: '#2196F3', colorOn: '#2196F3', colorOff: '#6b6b6b' },
  accentColor: { enabled: true, color: '#ff5722' },
  background: { enabled: false, type: 'solid', color1: '#03a9f4', color2: '#ff8c00', angle: 135, applyWhen: 'always' },
  animation: { enabled: false, preset: 'pulse', speedS: 2, trigger: 'always' },
  border: { enabled: false, radiusPx: 12, borderWidth: 0, borderColor: '#03a9f4' },
  headingStyle: { enabled: false, fontSize: 24, textColor: '#e1e1e1', iconSize: 24, iconColor: '#e1e1e1', alignment: 'left' },
  threshold: {
    enabled: true,
    entityId: 'sensor.temp',
    property: 'icon-color', // singular — the pre-0.7.0 field
    rules: [{ id: 'r1', operator: '>=', value: 30, color: '#ff0000' }],
    defaultColor: '#888888',
  },
  advanced: { rawCss: '' },
};

describe('migrateStudioState', () => {
  it('translates v0.6.x threshold.property (singular) into properties[]', () => {
    const state = migrateStudioState(V062_PRESET_STATE);
    expect(state.threshold.properties).toEqual(['icon-color']);
    expect((state.threshold as unknown as Record<string, unknown>)['property']).toBeUndefined();
    expect(state.threshold.valueMode).toBe('switch');
    expect(state.threshold.colorStops.length).toBeGreaterThanOrEqual(2);
    expect(state.threshold.rules).toHaveLength(1);
  });

  it('defaults a modeless v0.6.x accentColor to plain mode with usable on/off colors', () => {
    const state = migrateStudioState(V062_PRESET_STATE);
    expect(state.accentColor.enabled).toBe(true);
    expect(state.accentColor.mode).toBe('plain');
    expect(state.accentColor.color).toBe('#ff5722');
    expect(typeof state.accentColor.colorOn).toBe('string');
    expect(typeof state.accentColor.colorOff).toBe('string');
  });

  it('the migrated state feeds generateCss without throwing (this used to crash the panel)', () => {
    const state = migrateStudioState(V062_PRESET_STATE);
    const css = generateCss(state, 'tile');
    expect(css).toContain('ha-state-icon');
    expect(css).toContain('--accent-color: #ff5722;');
  });

  it('is idempotent on current-schema state', () => {
    const once = migrateStudioState(V062_PRESET_STATE);
    const twice = migrateStudioState(once);
    expect(twice).toEqual(once);
  });

  it('survives garbage input without throwing', () => {
    for (const garbage of [null, undefined, 42, 'nope', [], { threshold: 'what' }]) {
      const state = migrateStudioState(garbage);
      expect(state.threshold.properties).toEqual(DEFAULT_THRESHOLD.properties);
      expect(() => generateCss(state)).not.toThrow();
    }
  });
});

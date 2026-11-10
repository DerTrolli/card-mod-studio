/**
 * Loading a Studio preset must respect the per-preset Animation gate
 * (capsFor(...).noAnimationPresets): Spin does not belong on the dial cards
 * or the map, Gradient Shift needs a Background module on the card.
 */

import { describe, it, expect } from 'vitest';
import { filterPresetStateForCardType } from '../src/utils/preset-caps.js';
import { migrateStudioState } from '../src/parser/state-mapper.js';
import type { StudioState } from '../src/types/index.js';

function withPreset(preset: string): StudioState {
  const base = migrateStudioState({});
  return { ...base, animation: { ...base.animation, enabled: true, preset: preset as never, speedS: 2 } };
}

describe('filterPresetStateForCardType — per-preset animation gate', () => {
  it.each(['thermostat', 'light', 'map', 'humidifier'])('Spin is dropped on %s', (type) => {
    const f = filterPresetStateForCardType(withPreset('spin'), type);
    expect(f.animation.enabled).toBe(false);
  });

  it.each(['picture-entity', 'picture', 'iframe'])('Gradient Shift is dropped on %s (no Background module)', (type) => {
    const f = filterPresetStateForCardType(withPreset('gradient-shift'), type);
    expect(f.animation.enabled).toBe(false);
  });

  it('Spin is kept on a tile', () => {
    const f = filterPresetStateForCardType(withPreset('spin'), 'tile');
    expect(f.animation.enabled).toBe(true);
    expect(f.animation.preset).toBe('spin');
  });

  it('Pulse is kept on a thermostat', () => {
    const f = filterPresetStateForCardType(withPreset('pulse'), 'thermostat');
    expect(f.animation.enabled).toBe(true);
    expect(f.animation.preset).toBe('pulse');
  });
});

import { describe, it, expect } from 'vitest';
import { capsFor } from '../src/utils/card-caps.js';

// Operated with real pointer input while animated (HA 2026.11) — see the
// comment on NO_ANIMATION_TYPES.
const OPERABLE = [
  'alarm-panel', 'calendar', 'gauge', 'history-graph', 'logbook', 'media-control',
  'statistic', 'statistics-graph', 'todo-list', 'weather-forecast',
  'thermostat', 'humidifier', 'light', 'map', 'iframe', 'picture', 'picture-entity',
  'picture-glance', 'picture-elements',
];
// Kept hidden: Spin breaks the dial / map drag, Gradient Shift is dead where
// Background is hidden, heading has no box, the rest was never measured.
const HIDDEN = [
  'heading',
  'energy-distribution', 'energy-usage-graph', 'activity', 'webpage', 'shopping-list',
];

describe('Animation visibility per built-in card', () => {
  for (const t of OPERABLE) it(`${t}: shown`, () => expect(capsFor(t).modules.animation).toBe(true));
  for (const t of HIDDEN) it(`${t}: hidden`, () => expect(capsFor(t).modules.animation).toBe(false));
});

describe('Animation presets left out per card', () => {
  it('Spin is left out on the dial cards and the map', () => {
    for (const t of ['thermostat', 'humidifier', 'light', 'map']) expect(capsFor(t).noAnimationPresets, t).toContain('spin');
    expect(capsFor('tile').noAnimationPresets).not.toContain('spin');
    expect(capsFor('alarm-panel').noAnimationPresets).not.toContain('spin');
  });
  it('Gradient Shift is left out exactly where Background is hidden', () => {
    for (const t of ['map', 'iframe', 'picture', 'picture-entity', 'picture-glance', 'picture-elements']) {
      expect(capsFor(t).modules.background, t).toBe(false);
      expect(capsFor(t).noAnimationPresets, t).toContain('gradient-shift');
    }
    for (const t of ['thermostat', 'gauge', 'tile', 'light']) expect(capsFor(t).noAnimationPresets, t).not.toContain('gradient-shift');
  });
  it('a custom card keeps every preset', () => {
    expect(capsFor('custom:whatever-card').noAnimationPresets).toEqual([]);
  });
});

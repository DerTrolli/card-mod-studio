import { describe, it, expect } from 'vitest';
import { capsFor } from '../src/utils/card-caps.js';

// Operated with real pointer input while animated (HA 2026.11) — see the
// comment on NO_ANIMATION_TYPES.
const OPERABLE = [
  'alarm-panel', 'calendar', 'gauge', 'history-graph', 'logbook', 'media-control',
  'statistic', 'statistics-graph', 'todo-list', 'weather-forecast',
  'thermostat', 'humidifier', 'light', 'map', 'iframe', 'picture', 'picture-entity',
  'picture-glance', 'picture-elements',
  'heading', // v1.0: without Glow, Spin and Gradient Shift (no painted box)
];
// Kept hidden: never measured.
const HIDDEN = [
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
  it('heading leaves out Glow, Spin and Gradient Shift (no painted box), keeps the rest', () => {
    const out = capsFor('heading').noAnimationPresets;
    for (const p of ['glow', 'spin', 'gradient-shift']) expect(out, p).toContain(p);
    for (const p of ['pulse', 'breathe', 'blink', 'bounce', 'shake', 'heartbeat']) expect(out, p).not.toContain(p);
    expect(capsFor('tile').noAnimationPresets).not.toContain('glow');
  });
  it('a custom card keeps every preset', () => {
    expect(capsFor('custom:whatever-card').noAnimationPresets).toEqual([]);
  });
});

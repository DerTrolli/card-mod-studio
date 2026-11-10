import { describe, it, expect } from 'vitest';
import { capsFor } from '../src/utils/card-caps.js';

// Operated with real pointer input while animated (HA 2026.11) — see the
// comment on NO_ANIMATION_TYPES.
const OPERABLE = [
  'alarm-panel', 'calendar', 'gauge', 'history-graph', 'logbook', 'media-control',
  'statistic', 'statistics-graph', 'todo-list', 'weather-forecast',
];
// Kept hidden: Spin breaks the dial / map drag, Gradient Shift is dead where
// Background is hidden, heading has no box, the rest was never measured.
const HIDDEN = [
  'thermostat', 'humidifier', 'light', 'map', 'iframe', 'picture', 'picture-entity',
  'picture-glance', 'picture-elements', 'heading',
  'energy-distribution', 'energy-usage-graph', 'activity', 'webpage', 'shopping-list',
];

describe('Animation visibility per built-in card', () => {
  for (const t of OPERABLE) it(`${t}: shown`, () => expect(capsFor(t).modules.animation).toBe(true));
  for (const t of HIDDEN) it(`${t}: hidden`, () => expect(capsFor(t).modules.animation).toBe(false));
});

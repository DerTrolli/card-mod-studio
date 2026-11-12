/**
 * Gradient Shift on custom cards. Measured live (HA 2026.11, card-mod 4.2.1):
 *  - Mushroom title card paints no box: the animation runs on ha-card, nothing
 *    to move.
 *  - Bubble button / slider: Background paints on `.bubble-button-background`
 *    / `.bubble-container`, Gradient Shift is written on `ha-card`; the
 *    painting element's background-position stayed at 0% while ha-card's moved.
 * So the preset is left out of the list there; Spin is not gated for custom
 * cards, and a stored Gradient Shift stays listed and round-trips unchanged.
 */
import { describe, it, expect } from 'vitest';
import { capsFor } from '../src/utils/card-caps.js';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState, migrateStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';

const TITLE = 'custom:mushroom-title-card';
const BTN = 'custom:bubble-card/button';
const SLIDER = 'custom:bubble-card/button/slider';

function shiftState(withBackground: boolean) {
  const b = migrateStudioState({});
  return {
    ...b,
    background: withBackground
      ? { ...b.background, enabled: true, type: 'gradient', color1: '#ff0000', color2: '#0000ff', angle: 90 }
      : b.background,
    animation: { ...b.animation, enabled: true, preset: 'gradient-shift', speedS: 4, trigger: 'always' },
  } as never;
}

describe('noAnimationPresets for custom cards', () => {
  it.each([TITLE, BTN, SLIDER, 'custom:bubble-card/cover'])('%s leaves Gradient Shift out', (k) => {
    expect(capsFor(k).noAnimationPresets).toContain('gradient-shift');
  });

  it('a Mushroom card with a Background still offers Gradient Shift', () => {
    expect(capsFor('custom:mushroom-entity-card').noAnimationPresets).not.toContain('gradient-shift');
  });

  it('Spin is not gated for custom cards', () => {
    for (const k of [TITLE, BTN, SLIDER, 'custom:mushroom-entity-card']) {
      expect(capsFor(k).noAnimationPresets).not.toContain('spin');
    }
  });
});

describe('a stored Gradient Shift on those cards round-trips', () => {
  it.each([
    [TITLE, false],
    [BTN, true],
    [SLIDER, true],
  ])('%s', (k, bg) => {
    const css = generateCss(shiftState(bg), k);
    const back = mapToStudioState(parseStyleValue(css), k);
    expect(back.animation).toMatchObject({ enabled: true, preset: 'gradient-shift' });
    expect(generateCss(back, k)).toBe(css);
  });
});

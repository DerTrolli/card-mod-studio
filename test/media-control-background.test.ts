/**
 * media-control paints its own full-face colour block over ha-card in every
 * player state (measured on HA 2026.11), so a Background there is hidden —
 * and, like every hidden module, a stored one is read back and written again
 * unchanged.
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { capsFor, thresholdPropertyAllowed } from '../src/utils/card-caps.js';

const EMPTY = mapToStudioState(parseStyleValue(''));
const parse = (css: string) => mapToStudioState(parseStyleValue(css), 'media-control');

describe('media-control: Background is hidden', () => {
  it('the module, the Threshold target and the Gradient Shift preset are not offered', () => {
    const caps = capsFor('media-control');
    expect(caps.modules.background).toBe(false);
    expect(caps.noAnimationPresets).toContain('gradient-shift');
    expect(thresholdPropertyAllowed('background', 'media-control')).toBe(false);
    expect(thresholdPropertyAllowed('border-color', 'media-control')).toBe(true);
    expect(capsFor('tile').modules.background).toBe(true);
  });

  it('a stored Background survives load -> unrelated edit -> save', () => {
    const original = generateCss({ ...EMPTY, background: { ...EMPTY.background, enabled: true, color1: '#ff0000' } }, 'media-control');
    expect(original).toContain('#ff0000');
    const loaded = parse(original);
    expect(loaded.background.enabled).toBe(true);
    expect(generateCss(loaded, 'media-control')).toBe(original);
    const css = generateCss({ ...loaded, font: { ...EMPTY.font, enabled: true, fontSize: 20 } }, 'media-control');
    for (const line of original.split('\n')) expect(css).toContain(line);
    expect(parse(css).background.color1).toBe('#ff0000');
  });
});

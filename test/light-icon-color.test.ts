/**
 * Light-mode Icon Color reads its fallback colour back from `else '<colour>'`.
 * The generator can write an empty fallback (`else ''`) and that shape must
 * round-trip; a fallback that is not a single-quoted literal is not ours and
 * must stay hand-written instead of being rewritten as the default grey.
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import type { StudioState } from '../src/types/index.js';

const E = mapToStudioState(parseStyleValue(''));
const parse = (css: string) => mapToStudioState(parseStyleValue(css), 'tile');
const light = (colorOff: string) =>
  generateCss({ ...E, iconColor: { ...E.iconColor, enabled: true, mode: 'light', entityId: 'light.x', colorOff } } as StudioState, 'tile');

const handWritten = (fallback: string) =>
  `ha-state-icon {\n  color: {{ 'rgb(' ~ (state_attr('light.x', 'rgb_color') | join(', ')) ~ ')' if is_state('light.x', 'on') and state_attr('light.x', 'rgb_color') else ${fallback} }} !important;\n}`;

describe('light-mode Icon Color fallback', () => {
  it('the generator can write an empty fallback, and it round-trips', () => {
    const css = light('');
    expect(css).toContain("else '' }}");
    const back = parse(css);
    expect(back.iconColor).toMatchObject({ enabled: true, mode: 'light', entityId: 'light.x', colorOff: '' });
    expect(generateCss(back, 'tile')).toBe(css);
  });

  it('a normal fallback is unchanged', () => {
    const css = light('#445566');
    const back = parse(css);
    expect(back.iconColor).toMatchObject({ enabled: true, mode: 'light', colorOff: '#445566' });
    expect(generateCss(back, 'tile')).toBe(css);
  });

  it.each(['"grey"', 'var(--disabled-color)', 'states("sensor.c")'])('an unreadable fallback %s is not adopted and comes back byte for byte', (fb) => {
    const css = handWritten(fb);
    const back = parse(css);
    expect(back.iconColor.enabled).toBe(false);
    expect(back.advanced.rawCss).toContain(fb);
    expect(generateCss(back, 'tile')).toBe(css);
  });
});

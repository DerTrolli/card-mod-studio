/**
 * An `@keyframes cms-*` block is left out of the parsed hand-written part
 * because the Animation module regenerates it. That only holds when the module
 * adopts the `animation:` declaration. When it does not, the declaration stays
 * hand-written and its keyframes must come back with it.
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState, parseEntityRowCss } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import type { StudioState } from '../src/types/index.js';

const E = mapToStudioState(parseStyleValue(''));
const load = (css: string, card = 'tile') => mapToStudioState(parseStyleValue(css), card);
const save = (s: StudioState, card = 'tile') => generateCss(s, card);
const count = (css: string, needle: string) => css.split(needle).length - 1;

// The real keyframes text, taken from what the generator writes for Pulse.
const PULSE = generateCss({ ...E, animation: { ...E.animation, enabled: true, trigger: 'always' } } as StudioState, 'tile')
  .split('\n\n')[0];

const COUNTED = `${PULSE}\n\nha-card {\n  animation: cms-pulse 2s ease-in-out 3;\n}`;
const ESCAPE = `${PULSE}\n\nha-card {\n  animation: {{ 'cms-pulse 2s ease-in-out infinite' if states('sensor.a\\nb') | float(0) > 3 else 'none' }};\n}`;

describe('keyframes of an animation the module does not adopt', () => {
  it('the generator text is the pulse keyframes', () => {
    expect(PULSE.startsWith('@keyframes cms-pulse {')).toBe(true);
  });

  it.each([['a hand-edited iteration count', COUNTED], ['a hand-written escape', ESCAPE]])('%s: round-trips byte for byte, twice', (_n, css) => {
    const a = load(css);
    expect(a.animation.enabled).toBe(false);
    const once = save(a);
    expect(once).toBe(css);
    expect(count(once, '@keyframes cms-pulse')).toBe(1);
    expect(save(load(once))).toBe(css);
  });

  it('a block nothing refers to any more is still dropped', () => {
    const css = `${PULSE}\n\nha-card {\n  opacity: 0.5;\n}`;
    expect(save(load(css))).toBe('ha-card {\n  opacity: 0.5;\n}');
  });

  it('a block used only inside a media query in the tail is kept', () => {
    const css = `${PULSE}\n\nha-card {\n  opacity: 1;\n}\n\n@media (min-width: 600px) {\n  ha-card { animation: cms-pulse 2s ease-in-out 3; }\n}`;
    expect(save(load(css))).toBe(css);
  });

  it('only a whole-word name counts', () => {
    const css = `${PULSE}\n\nha-card {\n  animation: cms-pulse-slow 2s ease-in-out 3;\n}`;
    expect(save(load(css))).toBe('ha-card {\n  animation: cms-pulse-slow 2s ease-in-out 3;\n}');
  });

  it('a Studio-written animation still round-trips with exactly one block', () => {
    const css = save({ ...E, animation: { ...E.animation, enabled: true, trigger: 'on' } } as StudioState);
    const back = load(css);
    expect(back.animation.enabled).toBe(true);
    const again = save(back);
    expect(again).toBe(css);
    expect(count(again, '@keyframes cms-pulse')).toBe(1);
  });

  it('a Studio-written animation plus a second hand-written use keeps the block where it was', () => {
    const css = `${save({ ...E, animation: { ...E.animation, enabled: true, trigger: 'on' } } as StudioState)}\n\nha-icon {\n  animation: cms-pulse 1s linear 2;\n}`;
    expect(save(load(css))).toBe(css);
  });

  it('enabling the module on a style with a kept block does not duplicate it', () => {
    const back = load(COUNTED);
    const out = save({ ...back, animation: { ...back.animation, enabled: true, trigger: 'always' } });
    expect(count(out, '@keyframes cms-pulse')).toBe(1);
    expect(out).toContain('animation: cms-pulse 2s ease-in-out infinite;');
  });

  it('works for a stack child / entities row style (parseEntityRowCss)', () => {
    const css = `${PULSE}\n\n:host {\n  animation: cms-pulse 2s ease-in-out 3;\n}`;
    const row = parseEntityRowCss(css);
    expect(row.extraCss).toBe(css);
    const unused = parseEntityRowCss(`${PULSE}\n\n:host {\n  color: red;\n}`);
    expect(unused.extraCss).toBeUndefined();
  });
});

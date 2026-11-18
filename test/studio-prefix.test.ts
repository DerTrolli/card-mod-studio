/**
 * The prefix of the names the Studio writes (v1.0.0-beta.2): `cstudio-`
 * since the rename to Card Style Studio, `cms-` before. Old styles are read
 * exactly like new ones and move to the new names on the next save; nothing
 * hand-written is rewritten.
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import type { StudioState } from '../src/types/index.js';
import { ANY_PREFIX_SRC, GRADIENT_MARKER_PROPERTIES, GRADIENT_MARKER_PROPERTY, STUDIO_PREFIX, animationName } from '../src/utils/studio-names.js';

const E = mapToStudioState(parseStyleValue(''));
const load = (css: string, card = 'tile') => mapToStudioState(parseStyleValue(css), card);
const save = (s: StudioState, card = 'tile') => generateCss(s, card);
/** What a beta.1 (or older) Studio wrote for the same state. */
const legacy = (css: string) =>
  css.replace(/cstudio-(?=[a-z])/g, 'cms-');

const STATES: [string, Partial<StudioState>, string?][] = [
  ['Animation, always', { animation: { ...E.animation, enabled: true, trigger: 'always', preset: 'spin', speedS: 3 } }],
  ['Animation, when on', { animation: { ...E.animation, enabled: true, trigger: 'on', preset: 'glow' } }],
  ['Animation, custom entity', { animation: { ...E.animation, enabled: true, trigger: 'custom', customEntity: 'switch.x' } }],
  ['Animation, value (Jinja)', {
    animation: { ...E.animation, enabled: true, trigger: 'value', preset: 'shake', valueEntity: 'sensor.power', valueOperator: '>', valueThreshold: 1500 } as StudioState['animation'],
  }, 'sensor'],
  ['Animation, gradient shift', { animation: { ...E.animation, enabled: true, trigger: 'always', preset: 'gradient-shift' } }],
  ['Threshold gradient', {
    threshold: {
      ...E.threshold, enabled: true, entityId: 'sensor.t', properties: ['background'], valueMode: 'gradient',
      colorStops: [{ id: 'a', value: 0, color: '#0000ff' }, { id: 'b', value: 30, color: '#ff0000' }],
    },
  }, 'sensor'],
  ['Threshold gradient on a gauge', {
    threshold: {
      ...E.threshold, enabled: true, entityId: 'sensor.t', properties: ['accent-color'], valueMode: 'gradient',
      colorStops: [{ id: 'a', value: 0, color: '#00ff00' }, { id: 'b', value: 100, color: '#ff0000' }],
    },
  } as Partial<StudioState>, 'gauge'],
];

describe('names', () => {
  it('the Studio writes cstudio-, reads cstudio- and cms-', () => {
    expect(STUDIO_PREFIX).toBe('cstudio-');
    expect(animationName('pulse')).toBe('cstudio-pulse');
    expect(GRADIENT_MARKER_PROPERTY).toBe('--cstudio-gradient-stops');
    expect(GRADIENT_MARKER_PROPERTIES).toEqual(['--cstudio-gradient-stops', '--cms-gradient-stops']);
    expect(new RegExp(`^${ANY_PREFIX_SRC}x$`).test('cms-x')).toBe(true);
    expect(new RegExp(`^${ANY_PREFIX_SRC}x$`).test('cstudio-x')).toBe(true);
    expect(new RegExp(`^${ANY_PREFIX_SRC}x$`).test('cmsx')).toBe(false);
  });
});

describe.each(STATES)('%s', (_name, part, card = 'tile') => {
  const state = { ...E, ...part } as StudioState;
  const fresh = save(state, card);
  const old = legacy(fresh);

  it('writes only the new names', () => {
    expect(fresh).toMatch(/cstudio-/);
    expect(fresh).not.toMatch(/cms-/);
    expect(old).toMatch(/cms-/);
    expect(old).not.toMatch(/cstudio-/);
  });

  it('an old style opens exactly like a new one', () => {
    const fromOld = load(old, card);
    const fromNew = load(fresh, card);
    expect(fromOld).toEqual(fromNew);
    expect(fromOld.advanced.rawCss).toBe('');
  });

  it('the first save writes the new names, the second changes nothing', () => {
    const once = save(load(old, card), card);
    expect(once).toBe(fresh);
    expect(save(load(once, card), card)).toBe(once);
  });
});

describe('hand-written CSS is never rewritten', () => {
  const pulse = save({ ...E, animation: { ...E.animation, enabled: true, trigger: 'always' } } as StudioState);
  const [newKf] = pulse.split('\n\n');
  const oldKf = legacy(newKf);

  it('an old block a hand-written rule still uses stays, next to the module\'s new one', () => {
    const css = `${legacy(pulse)}\n\nha-icon {\n  animation: cms-pulse 1s linear 2;\n}`;
    const s = load(css);
    expect(s.animation.enabled).toBe(true);
    expect(s.advanced.rawCss).toBe(`${oldKf}\n\nha-icon {\n  animation: cms-pulse 1s linear 2;\n}`);
    const out = save(s);
    expect(out.split('@keyframes cms-pulse').length - 1).toBe(1);
    expect(out.split('@keyframes cstudio-pulse').length - 1).toBe(1);
    expect(out).toContain('animation: cstudio-pulse 2s ease-in-out infinite;');
    expect(out).toContain('animation: cms-pulse 1s linear 2;');
    expect(save(load(out))).toBe(out);
  });

  it('an old block nothing uses any more is dropped', () => {
    const out = save(load(`${oldKf}\n\nha-card {\n  opacity: 0.5;\n}`));
    expect(out).toBe('ha-card {\n  opacity: 0.5;\n}');
  });

  it('both prefixes in one style: the module takes the one it can, the other stays', () => {
    // An old Studio animation on the card and a new one written by hand on the icon.
    const css = `${oldKf}\n\n${newKf}\n\nha-card {\n  animation: cms-pulse 2s ease-in-out infinite;\n}\n\nha-icon {\n  animation: cstudio-pulse 1s linear 2;\n}`;
    const s = load(css);
    expect(s.animation.enabled).toBe(true);
    const out = save(s);
    expect(out).not.toMatch(/cms-/);
    expect(out.split('@keyframes cstudio-pulse').length - 1).toBe(1);
    expect(out).toContain('animation: cstudio-pulse 2s ease-in-out infinite;');
    expect(out).toContain('animation: cstudio-pulse 1s linear 2;');
    expect(save(load(out))).toBe(out);
  });

  it('a hand-written cms- name that is not one of the Studio\'s stays as written', () => {
    const css = '@keyframes cms-wobble {\n  from { opacity: 1; }\n  to { opacity: 0; }\n}\n\nha-card {\n  animation: cms-wobble 1s linear infinite;\n}';
    expect(save(load(css))).toBe(css);
  });
});

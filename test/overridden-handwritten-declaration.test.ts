/**
 * A hand-written plain declaration that one of the Studio's own `!important`
 * declarations of the same selector and property overrides is not part of the
 * effective cascade — but it is the user's text. It used to vanish on the
 * second save (the parser dropped it while merging same-selector blocks). It
 * now stays in the hand-written remainder (Advanced CSS) and is written back
 * exactly once on every save, while everything the Studio wrote itself still
 * loads into its modules and round-trips byte-identically.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { buildMergedStudioState, applyStudioState } from '../src/editor/studio-state.js';
import type { CardModCardConfig, StudioState } from '../src/types/index.js';
import { installEngines, restoreEngines, cfg } from './v010-audit-helpers.js';

afterEach(() => restoreEngines());

const styleOf = (c: CardModCardConfig) => String(c.card_mod?.style ?? '');
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/** open -> (edit) -> save, `cycles` times; returns the saved config of every cycle and the Advanced CSS each load showed. */
function cycles(
  config: CardModCardConfig,
  n: number,
  edit: (s: StudioState, i: number) => StudioState = (s) => s,
) {
  installEngines(['card-mod']);
  const saved: string[] = [];
  const advanced: string[] = [];
  let cur = config;
  for (let i = 0; i < n; i++) {
    const state = buildMergedStudioState(cur);
    advanced.push(state.advanced.rawCss);
    cur = applyStudioState(edit(state, i), cur);
    saved.push(styleOf(cur));
  }
  return { saved, advanced };
}

const setFont = (px: number) => (s: StudioState): StudioState => ({ ...s, font: { ...s.font, enabled: true, fontSize: px } });

describe('a hand-written declaration the Studio\'s !important one overrides is kept', () => {
  it('sensor: ".name { font-size: 20px }" survives three load + save cycles and shows in Advanced CSS', () => {
    const rule = '.name {\n  font-size: 20px;\n}';
    const config = cfg({ type: 'sensor', entity: 'sensor.t', card_mod: { style: '.name {\n  font-size: 20px;\n}' } });
    const { saved, advanced } = cycles(config, 3, (s, i) => (i === 0 ? setFont(18)(s) : { ...s, font: { ...s.font, fontSize: 18 + i } }));
    // first save: the Studio's own important rule is there, the hand-written one is kept at the end
    expect(saved[0]).toContain('font-size: 18px !important;');
    expect(saved[0].endsWith(rule)).toBe(true);
    // second and third load: the hand-written rule is in Advanced CSS, and written exactly once
    expect(advanced[1]).toBe(rule);
    expect(advanced[2]).toBe(rule);
    for (const css of saved) {
      expect(count(css, rule)).toBe(1);
      expect(css.endsWith(rule)).toBe(true);
    }
    expect(saved[1]).toContain('font-size: 19px !important;');
    expect(saved[2]).toContain('font-size: 20px !important;');
  });

  it('sensor: an unchanged re-save is byte-identical (no drift)', () => {
    const config = cfg({ type: 'sensor', entity: 'sensor.t', card_mod: { style: '.name {\n  font-size: 20px;\n}' } });
    const { saved } = cycles(config, 1, setFont(18));
    const again = cycles(cfg({ type: 'sensor', entity: 'sensor.t', card_mod: { style: saved[0] } }), 3);
    for (const css of again.saved) expect(css).toBe(saved[0]);
  });

  it('button: ".state { color: ... }" over the Font colour companion survives three cycles', () => {
    const rule = '.state {\n  color: green;\n}';
    const config = cfg({ type: 'button', entity: 'light.a', card_mod: { style: '.state {\n  color: green;\n}' } });
    const { saved, advanced } = cycles(config, 3, (s, i) =>
      i === 0 ? { ...s, font: { ...s.font, enabled: true, color: '#ee1111' } } : s);
    expect(saved[0]).toMatch(/\.state \{[^}]*color: #ee1111 !important;/);
    expect(saved[0].endsWith(rule)).toBe(true);
    expect(advanced[1]).toBe(rule);
    expect(advanced[2]).toBe(rule);
    for (const css of saved) {
      expect(count(css, 'color: green;')).toBe(1);
      expect(css).toBe(saved[0]);
    }
  });

  it('a Studio-only style loads into its modules and round-trips unchanged', () => {
    const first = cycles(cfg({ type: 'sensor', entity: 'sensor.t', card_mod: { style: '' } }), 1, setFont(18)).saved[0];
    expect(first).toContain('.name');
    installEngines(['card-mod']);
    const state = buildMergedStudioState(cfg({ type: 'sensor', entity: 'sensor.t', card_mod: { style: first } }));
    expect(state.font.enabled).toBe(true);
    expect(state.font.fontSize).toBe(18);
    expect(state.advanced.rawCss).toBe('');
    const again = cycles(cfg({ type: 'sensor', entity: 'sensor.t', card_mod: { style: first } }), 3);
    expect(again.advanced).toEqual(['', '', '']);
    for (const css of again.saved) expect(css).toBe(first);
  });
});

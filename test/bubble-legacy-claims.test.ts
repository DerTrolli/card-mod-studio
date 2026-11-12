/**
 * Review fix 3 — a legacy (0.11.0-beta.2) Bubble style is adopted even when a
 * hand-written rule sits on the new target (`.bubble-container`): the claim
 * is chosen by "selector present AND one of its properties present".
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';

const BTN = 'custom:bubble-card/button';
const SLIDER = 'custom:bubble-card/button/slider';
const COVER = 'custom:bubble-card/cover';
const parse = (css: string, k: string) => mapToStudioState(parseStyleValue(css), k);

const PILL_BORDER = '.bubble-button-background {\n  border-radius: 8px;\n  border: 3px solid #11ee11;\n}';
const SHADOW = '.bubble-container {\n  box-shadow: 0 0 4px red;\n}';

describe('legacy Bubble styles next to a hand-written rule on the new target', () => {
  it('legacy Border + hand-written container rule: Border adopted, the container rule stays', () => {
    for (const [k, old] of [
      [BTN, PILL_BORDER],
      [SLIDER, PILL_BORDER],
      [COVER, '.bubble-background {\n  border-radius: 8px;\n  border: 3px solid #11ee11;\n}'],
    ] as const) {
      const back = parse(`${old}\n\n${SHADOW}`, k);
      expect(back.border, k).toMatchObject({ enabled: true, radiusPx: 8, borderWidth: 3, borderColor: '#11ee11' });
      expect(back.advanced.rawCss, k).toContain('box-shadow: 0 0 4px red;');
      expect(back.advanced.rawCss, k).not.toContain('border');
      const css = generateCss(back, k);
      // one border only, in the current shape, with the hand-written rule kept
      expect(css.match(/border: 3px solid/g)?.length, k).toBe(1);
      expect(css, k).toContain('border-radius: 8px !important;');
      expect(css, k).toContain('box-shadow: 0 0 4px red;');
      expect(css, k).not.toMatch(/\.bubble-(button-)?background \{[^}]*border: 3px/);
    }
  });

  it('legacy slider Background + Border + hand-written container rule: both adopted', () => {
    const old = [
      '.bubble-button-background {',
      '  background: #112244;',
      '  opacity: 1 !important;',
      '  border-radius: 8px;',
      '  border: 3px solid #11ee11;',
      '}',
      '',
      SHADOW,
    ].join('\n');
    const back = parse(old, SLIDER);
    expect(back.background).toMatchObject({ enabled: true, color1: '#112244' });
    expect(back.border).toMatchObject({ enabled: true, radiusPx: 8, borderWidth: 3 });
    expect(back.advanced.rawCss.trim()).toBe(SHADOW);
    const css = generateCss(back, SLIDER);
    expect(css).toContain('background: #112244;');
    expect(css).not.toContain('opacity');
    expect(css.match(/border: 3px solid/g)?.length).toBe(1);
    // the saved shape is a fixed point
    const again = parse(css, SLIDER);
    expect(again.advanced.rawCss.trim()).toBe(SHADOW);
    expect(generateCss(again, SLIDER)).toBe(css);
  });

  it('a hand-written container rule with a claimable property of its own wins; the legacy declarations stay in Advanced CSS', () => {
    const css = [
      '.bubble-container {\n  border-radius: 12px;\n  border: 2px solid #aa0000;\n}',
      PILL_BORDER,
    ].join('\n\n');
    const back = parse(css, BTN);
    expect(back.border).toMatchObject({ enabled: true, radiusPx: 12, borderWidth: 2, borderColor: '#aa0000' });
    expect(back.advanced.rawCss).toContain('border-radius: 8px;');
    expect(back.advanced.rawCss).toContain('border: 3px solid #11ee11;');
  });

  it('slider: container Background wins over a legacy pill Background; the pill\'s declarations are not dropped', () => {
    const css = [
      '.bubble-container {\n  background: #aa0000;\n}',
      '.bubble-button-background {\n  background: #112244;\n  opacity: 1 !important;\n}',
    ].join('\n\n');
    const back = parse(css, SLIDER);
    expect(back.background).toMatchObject({ enabled: true, color1: '#aa0000' });
    expect(back.advanced.rawCss).toContain('background: #112244;');
    expect(back.advanced.rawCss).toContain('opacity: 1 !important;');
    expect(generateCss(back, SLIDER)).toContain('opacity: 1 !important;');
  });

  it('with no claimable property anywhere, nothing is adopted and nothing is lost', () => {
    const back = parse(SHADOW, BTN);
    expect(back.border.enabled).toBe(false);
    expect(back.advanced.rawCss.trim()).toBe(SHADOW);
  });
});

/**
 * Review fixes on the Bubble / Mushroom profiles (v0.11): important container
 * radius, Font gate vs. Bubble's state line, claim choice for legacy styles,
 * Accent kept while its control is hidden, Mushroom line-heights.
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import type { StudioState } from '../src/types/index.js';

const EMPTY = mapToStudioState(parseStyleValue(''));
const BTN = 'custom:bubble-card/button';
const SLIDER = 'custom:bubble-card/button/slider';
const COVER = 'custom:bubble-card/cover';
const parse = (css: string, k: string) => mapToStudioState(parseStyleValue(css), k);
const withState = (patch: Partial<StudioState>): StudioState => ({ ...EMPTY, ...patch });

describe('1 — Bubble container radius is !important (Bubble ships `.large .bubble-container`)', () => {
  const border = withState({ border: { ...EMPTY.border, enabled: true, radiusPx: 12, borderWidth: 2, borderColor: '#112233' } });

  for (const [name, k] of [['button', BTN], ['slider', SLIDER], ['cover', COVER]] as const) {
    it(`${name}: radius important, width/colour plain, pieces reset`, () => {
      const css = generateCss(border, k);
      expect(css).toContain('.bubble-container {\n  border-radius: 12px !important;\n  border: 2px solid #112233;\n}');
      expect(css).toContain('border-radius: 0 !important;');
    });
  }

  it("today's branch (plain container radius) is recognised and upgraded on save", () => {
    const old = [
      '.bubble-container {', '  border-radius: 12px;', '  border: 2px solid #112233;', '}', '',
      '.bubble-button-background {', '  border-radius: 0 !important;', '}',
    ].join('\n');
    const back = parse(old, BTN);
    expect(back.advanced.rawCss).toBe('');
    expect(back.border).toMatchObject({ enabled: true, radiusPx: 12, borderWidth: 2 });
    expect(generateCss(back, BTN)).toContain('border-radius: 12px !important;');
  });

  it('a hand-written `.bubble-container { border-radius: 8px !important }` stays in Advanced CSS', () => {
    const back = parse('.bubble-container { border-radius: 8px !important; }', BTN);
    expect(back.border.enabled).toBe(false);
    expect(back.advanced.rawCss).toContain('border-radius: 8px !important;');
  });

  it("the Studio's own output (radius + resets) is claimed whole", () => {
    const css = generateCss(border, SLIDER);
    const back = parse(css, SLIDER);
    expect(back.advanced.rawCss).toBe('');
    expect(back.border).toMatchObject({ enabled: true, radiusPx: 12 });
  });

  it("another value on the inner pieces' reset is the user's", () => {
    const back = parse('.bubble-container { border-radius: 4px; }\n.bubble-button-background { border-radius: 3px !important; }', BTN);
    expect(back.advanced.rawCss).toContain('border-radius: 3px !important;');
  });
});

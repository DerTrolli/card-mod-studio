/**
 * Tile icon size: HA draws a 24px glyph in a 36px circle (`--tile-icon-size`).
 * A bare `--mdc-icon-size: 64px` overflowed the circle, so a glyph above the
 * native one now scales its circle with it (3:2, as HA proportions them).
 */
import { describe, it, expect } from 'vitest';
import { generateCss, tileCirclePx } from '../src/generator/css-generator.js';
import { migrateStudioState, mapToStudioState } from '../src/parser/state-mapper.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';
import { capsFor, TILE_ICON_SIZE_MAX, PICTURE_GLANCE_ICON_SIZE_MAX } from '../src/utils/card-caps.js';
import type { StudioState } from '../src/types/index.js';

const sized = (sizePx: number, extra: Record<string, unknown> = {}): StudioState => {
  const s: any = migrateStudioState({});
  Object.assign(s.iconColor, { enabled: true, mode: 'none', sizePx, ...extra });
  return s;
};
const CFG = { type: 'tile', entity: 'light.x' };
const load = (css: string, type = 'tile') => mapToStudioState(parseCardModConfig({ type, card_mod: { style: css } }), type);

describe('tile icon size', () => {
  it.each([
    [16, 'ha-tile-icon {\n  --mdc-icon-size: 16px;\n}'],
    [24, 'ha-tile-icon {\n  --mdc-icon-size: 24px;\n}'],
    [26, 'ha-tile-icon {\n  --tile-icon-size: 39px;\n  --mdc-icon-size: 26px;\n}'],
    [34, 'ha-tile-icon {\n  --tile-icon-size: 51px;\n  --mdc-icon-size: 34px;\n}'],
    [36, 'ha-tile-icon {\n  --tile-icon-size: 54px;\n  --mdc-icon-size: 36px;\n}'],
    [48, 'ha-tile-icon {\n  --tile-icon-size: 72px;\n  --mdc-icon-size: 48px;\n}'],
    [64, 'ha-tile-icon {\n  --tile-icon-size: 96px;\n  --mdc-icon-size: 64px;\n}'],
  ])('%ipx glyph: exact emitter shape, and it round-trips byte-identically', (px, expected) => {
    const css = generateCss(sized(px), 'tile', { config: CFG });
    expect(css).toBe(expected);
    const back = load(css);
    expect(back.iconColor.sizePx).toBe(px);
    expect(back.advanced.rawCss).toBe('');
    expect(generateCss(back, 'tile', { config: CFG })).toBe(css);
  });

  it('the circle is never smaller than the native one and the glyph always fits it', () => {
    for (let px = 2; px <= 64; px += 2) {
      expect(tileCirclePx(px)).toBeGreaterThanOrEqual(36);
      expect(tileCirclePx(px)).toBeGreaterThanOrEqual(px);
    }
  });

  it('an older save (glyph variable only) loads at its size and gains the circle on re-save', () => {
    const old = 'ha-tile-icon {\n  --mdc-icon-size: 48px;\n}';
    const s = load(old);
    expect(s.iconColor.sizePx).toBe(48);
    expect(s.advanced.rawCss).toBe('');
    expect(generateCss(s, 'tile', { config: CFG })).toBe('ha-tile-icon {\n  --tile-icon-size: 72px;\n  --mdc-icon-size: 48px;\n}');
    // at or below native nothing changes on re-save
    const small = load('ha-tile-icon {\n  --mdc-icon-size: 20px;\n}');
    expect(generateCss(small, 'tile', { config: CFG })).toBe('ha-tile-icon {\n  --mdc-icon-size: 20px;\n}');
  });

  it('a hand-written --tile-icon-size that is not the derived one stays in Advanced CSS', () => {
    const s = load('ha-tile-icon {\n  --tile-icon-size: 40px;\n  --mdc-icon-size: 32px;\n}');
    expect(s.iconColor.sizePx).toBe(32);
    expect(s.advanced.rawCss).toContain('--tile-icon-size: 40px');
  });

  it('a hand-written circle next to a glyph at or below native is not claimed (the generator writes none)', () => {
    for (const glyph of [20, 24]) {
      const style = `ha-tile-icon {\n  --mdc-icon-size: ${glyph}px;\n  --tile-icon-size: 36px;\n}`;
      const s = load(style);
      expect(s.iconColor.sizePx).toBe(glyph);
      expect(s.advanced.rawCss).toContain('--tile-icon-size: 36px');
      // the circle line survives a save
      expect(generateCss(s, 'tile', { config: CFG })).toContain('--tile-icon-size: 36px');
    }
  });

  it('a conditional size claims the circle only when a branch outgrows the native glyph', () => {
    const cond = { sizeWhen: { when: 'custom', customEntity: 'light.x' } };
    const none = generateCss(sized(20, cond), 'tile', { config: CFG });
    const hand = `${none.replace('{', '{\n  --tile-icon-size: {{ \'36px\' if is_state(\'light.x\', \'on\') else \'36px\' }};')}`;
    expect(load(hand).advanced.rawCss).toContain('--tile-icon-size');
    // outgrowing glyph: the derived circle is ours (covered above); a 30px glyph claims 45px
    const css = generateCss(sized(30), 'tile', { config: CFG });
    expect(load(css).advanced.rawCss).toBe('');
  });

  it('state-driven size: the circle follows both branches', () => {
    const cond = { sizeWhen: { when: 'custom', customEntity: 'light.x' } };
    const css = generateCss(sized(40, cond), 'tile', { config: CFG });
    expect(css).toBe(
      "ha-tile-icon {\n  --tile-icon-size: {{ '60px' if is_state('light.x', 'on') else '36px' }};\n" +
        "  --mdc-icon-size: {{ '40px' if is_state('light.x', 'on') else '24px' }};\n}",
    );
    const back = load(css);
    expect(back.iconColor.sizePx).toBe(40);
    expect(back.iconColor.sizeWhen?.customEntity).toBe('light.x');
    expect(back.advanced.rawCss).toBe('');
    expect(generateCss(back, 'tile', { config: CFG })).toBe(css);
    // both branches at or below native: no circle
    expect(generateCss(sized(20, cond), 'tile', { config: CFG })).not.toContain('--tile-icon-size');
    // off-branch above native with an on-branch below
    expect(generateCss(sized(20, { ...cond, sizeOffPx: 40 }), 'tile', { config: CFG })).toContain("else '60px'");
  });

  it('other cards keep the ha-card variable pair; only the tile range is capped', () => {
    for (const type of ['entity', 'sensor', 'picture-glance']) {
      const css = generateCss(sized(64), type, { config: { type } });
      expect(css, type).toBe('ha-card {\n  --mdc-icon-size: 64px;\n  --ha-icon-size: 64px;\n}');
      // a stored 64 is still written as is; only the slider's end differs
      expect(capsFor(type).iconSizeMax, type).toBe(type === 'picture-glance' ? PICTURE_GLANCE_ICON_SIZE_MAX : 64);
    }
    expect(capsFor('tile').iconSizeMax).toBe(TILE_ICON_SIZE_MAX);
    // a 1-row sections tile is 56px high: the capped glyph's circle must fit it
    expect(tileCirclePx(TILE_ICON_SIZE_MAX)).toBeLessThanOrEqual(56);
  });
});

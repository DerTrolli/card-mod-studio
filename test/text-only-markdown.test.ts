/**
 * A markdown card with `text_only: true`: HA's `.text-only` rule strips the
 * card's background, border and shadow and out-ranks a plain declaration
 * (measured on card-mod and UIX, HA 2026.11), so Background / Border /
 * Threshold write theirs `!important` — for that configuration only.
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { migrateStudioState, mapToStudioState } from '../src/parser/state-mapper.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';
import { capsFor } from '../src/utils/card-caps.js';
import type { StudioState } from '../src/types/index.js';

const TEXT_ONLY = { type: 'markdown', content: 'x', text_only: true };
const PLAIN = { type: 'markdown', content: 'x' };

const state = (f: (s: any) => void): StudioState => {
  const s: any = migrateStudioState({});
  f(s);
  return s;
};

const SOLID = state((s) => Object.assign(s.background, { enabled: true, type: 'solid', color1: '#112244', applyWhen: 'always' }));
const GRADIENT = state((s) => Object.assign(s.background, { enabled: true, type: 'gradient', color1: '#f00', color2: '#00f', angle: 45, applyWhen: 'always' }));
const COND_BG = state((s) => Object.assign(s.background, { enabled: true, type: 'solid', color1: '#112244', applyWhen: 'custom', customEntity: 'light.x' }));
const BORDER = state((s) => Object.assign(s.border, { enabled: true, radiusPx: 12, borderWidth: 4, borderColor: '#03a9f4' }));
const COND_BORDER = state((s) =>
  Object.assign(s.border, { enabled: true, radiusPx: 0, borderWidth: 4, borderColor: '#03a9f4', widthWhen: { when: 'custom', customEntity: 'light.x' } }),
);
const THRESHOLD = (property: string) =>
  state((s) =>
    Object.assign(s.threshold, {
      enabled: true,
      entityId: 'sensor.t',
      properties: [property],
      rules: [{ id: 'a', operator: '>', value: 5, color: '#ff0000' }],
      defaultColor: '#00ff00',
    }),
  );

const roundTrip = (css: string, type = 'markdown') =>
  mapToStudioState(parseCardModConfig({ type, card_mod: { style: css } }), type);

describe('text-only markdown card', () => {
  it('capsFor flags only a markdown card whose config sets text_only', () => {
    expect(capsFor('markdown', TEXT_ONLY).textOnlyCard).toBe(true);
    expect(capsFor('markdown', { ...PLAIN, text_only: false }).textOnlyCard).toBe(false);
    expect(capsFor('markdown', PLAIN).textOnlyCard).toBe(false);
    expect(capsFor('markdown').textOnlyCard).toBe(false);
    expect(capsFor('tile', { type: 'tile', text_only: true }).textOnlyCard).toBe(false);
  });

  it('writes Background and the border width !important; the radius stays plain', () => {
    const bg = generateCss(SOLID, 'markdown', { config: TEXT_ONLY });
    expect(bg).toContain('background: #112244 !important;');
    expect(generateCss(GRADIENT, 'markdown', { config: TEXT_ONLY })).toContain(
      'background: linear-gradient(45deg, #f00, #00f) !important;',
    );
    expect(generateCss(COND_BG, 'markdown', { config: TEXT_ONLY })).toMatch(/background: \{\{ .* \}\} !important;/);
    const border = generateCss(BORDER, 'markdown', { config: TEXT_ONLY });
    expect(border).toContain('border-radius: 12px;');
    expect(border).toContain('border: 4px solid #03a9f4 !important;');
    expect(generateCss(COND_BORDER, 'markdown', { config: TEXT_ONLY })).toMatch(/border: \{\{ .* \}\} !important;/);
  });

  it('Threshold background / border colour are !important too', () => {
    expect(generateCss(THRESHOLD('background'), 'markdown', { config: TEXT_ONLY })).toMatch(/background: \{\{.*\}\} !important;/);
    expect(generateCss(THRESHOLD('border-color'), 'markdown', { config: TEXT_ONLY })).toMatch(
      /border: 2px solid \{\{.*\}\} !important;/,
    );
  });

  it('round-trips: the !important form and an older plain save load into the same controls and re-save as !important', () => {
    for (const [name, st] of Object.entries({ SOLID, GRADIENT, COND_BG, BORDER, COND_BORDER })) {
      const css = generateCss(st, 'markdown', { config: TEXT_ONLY });
      const old = generateCss(st, 'markdown', { config: PLAIN });
      expect(css, name).not.toBe(old);
      const fromNew = roundTrip(css);
      const fromOld = roundTrip(old);
      expect(fromNew.advanced.rawCss, name).toBe('');
      expect(fromOld.advanced.rawCss, name).toBe('');
      expect(generateCss(fromNew, 'markdown', { config: TEXT_ONLY }), name).toBe(css);
      expect(generateCss(fromOld, 'markdown', { config: TEXT_ONLY }), name).toBe(css);
      // and back: the same card without text_only drops the flag again
      expect(generateCss(fromNew, 'markdown', { config: PLAIN }), name).toBe(old);
    }
    for (const p of ['background', 'border-color']) {
      const css = generateCss(THRESHOLD(p), 'markdown', { config: TEXT_ONLY });
      const old = generateCss(THRESHOLD(p), 'markdown', { config: PLAIN });
      for (const src of [css, old]) {
        const back = roundTrip(src);
        expect(back.threshold.enabled, p).toBe(true);
        expect(back.threshold.properties, p).toEqual([p]);
        expect(back.advanced.rawCss, p).toBe('');
        expect(generateCss(back, 'markdown', { config: TEXT_ONLY }), p).toBe(css);
      }
    }
  });

  it('text_only false / absent, and every other card type: no !important, output identical to before', () => {
    for (const st of [SOLID, GRADIENT, COND_BG, BORDER, COND_BORDER, THRESHOLD('background'), THRESHOLD('border-color')]) {
      const base = generateCss(st, 'markdown');
      expect(base).not.toContain('!important');
      expect(generateCss(st, 'markdown', { config: PLAIN })).toBe(base);
      expect(generateCss(st, 'markdown', { config: { ...PLAIN, text_only: false } })).toBe(base);
      // text_only means nothing on another card type
      expect(generateCss(st, 'tile', { config: { type: 'tile', entity: 'light.x', text_only: true } })).toBe(
        generateCss(st, 'tile', { config: { type: 'tile', entity: 'light.x' } }),
      );
    }
  });
});

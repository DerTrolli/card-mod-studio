/**
 * Font rows that used to reach nothing, or only part of the text the user
 * means (measured on Home Assistant 2026.11, card-mod and UIX): each new
 * companion is written only when its row is set, claimed back for its own card
 * type only, and re-saves byte for byte; rows that reach nothing on a card are
 * hidden there, while a weight stored by an older style stays in the style.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { DEFAULT_FONT } from '../src/parser/state-mapper.js';
import { capsFor, NO_FONT_WEIGHT_TYPES } from '../src/utils/card-caps.js';
import type { FontModuleState, StudioState } from '../src/types/index.js';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

const EMPTY = mapToStudioState(parseStyleValue(''));
const gen = (f: Partial<FontModuleState>, type: string) =>
  generateCss({ ...EMPTY, font: { ...EMPTY.font, enabled: true, ...f } } as StudioState, type);
const parse = (css: string, type: string) => mapToStudioState(parseStyleValue(css), type);

const SIZE = { fontSize: 20 };
const WEIGHT = { fontWeight: 'bold' as const };
const COLOR = { color: '#ff0000' };

const roundTrips = (css: string, type: string) => {
  const back = parse(css, type);
  expect(back.advanced.rawCss, type).toBe('');
  expect(generateCss(back, type), type).toBe(css);
  return back;
};

describe('button: the state line follows the size and the colour', () => {
  it('is written only when the row is set', () => {
    expect(gen(SIZE, 'button')).toContain('.state {\n  font-size: calc(20px * 0.7875) !important;\n}');
    expect(gen(COLOR, 'button')).toContain('.state {\n  color: #ff0000 !important;\n}');
    expect(gen(WEIGHT, 'button')).not.toContain('.state');
    expect(gen({ fontFamily: 'serif' }, 'button')).not.toContain('.state');
  });
  it('round-trips, and is claimed for the button only', () => {
    for (const f of [SIZE, COLOR, { ...SIZE, ...COLOR, ...WEIGHT, fontFamily: 'serif' }]) {
      const css = gen(f, 'button');
      expect(roundTrips(css, 'button').font).toMatchObject({ enabled: true });
    }
    const css = gen({ ...SIZE, ...COLOR }, 'button');
    // the same blocks on another card are the user's: the .state rule stays in Advanced CSS
    const tile = parse(css, 'markdown');
    expect(tile.advanced.rawCss).toContain('.state');
  });
});

describe('statistic: name, value and unit follow like the sensor card', () => {
  it('writes .name / .value / .measurement per row', () => {
    const s = gen(SIZE, 'statistic');
    expect(s).toContain('.name {\n  font-size: 20px !important;\n}');
    expect(s).toContain('.value {\n  font-size: calc(20px * 1.75) !important;\n}');
    expect(s).toContain('.measurement {\n  font-size: 20px !important;\n}');
    const w = gen(WEIGHT, 'statistic');
    expect(w).toContain('.name {\n  font-weight: bold !important;\n}');
    expect(w).not.toMatch(/\.value|\.measurement|font-size/);
    expect(gen(COLOR, 'statistic')).toContain('.name {\n  color: #ff0000 !important;\n}');
  });
  it('round-trips', () => {
    for (const f of [SIZE, WEIGHT, COLOR, { ...SIZE, ...WEIGHT, ...COLOR }]) roundTrips(gen(f, 'statistic'), 'statistic');
  });
  it('writes no title-weight token (its title is the .name)', () => {
    expect(gen(WEIGHT, 'statistic')).not.toContain('--ha-font-weight-normal');
  });
});

describe('header-title cards: the title follows the weight', () => {
  const TOKEN = '--ha-font-weight-normal: bold;';
  const TYPES = ['glance', 'todo-list', 'shopping-list', 'logbook', 'history-graph', 'statistics-graph', 'calendar', 'alarm-panel', 'markdown'];
  for (const t of TYPES) {
    it(t, () => {
      expect(gen(WEIGHT, t)).toContain(TOKEN);
      expect(gen(SIZE, t)).not.toContain('--ha-font-weight-normal');
      expect(gen(COLOR, t)).not.toContain('--ha-font-weight-normal');
      roundTrips(gen({ ...SIZE, ...WEIGHT, ...COLOR, fontFamily: 'serif' }, t), t);
      roundTrips(gen(WEIGHT, t), t);
    });
  }
  it('entities keeps its plain .card-header rule (no token)', () => {
    const w = gen(WEIGHT, 'entities');
    expect(w).toContain('.card-header {\n  font-weight: bold;\n}');
    expect(w).not.toContain('--ha-font-weight-normal');
  });
  it('the token is claimed on those cards only', () => {
    const css = 'ha-card {\n  font-weight: bold;\n  --ha-font-weight-normal: bold;\n}';
    expect(parse(css, 'glance').advanced.rawCss).toBe('');
    expect(parse(css, 'tile').advanced.rawCss).toContain('--ha-font-weight-normal');
    expect(parse(css, 'sensor').advanced.rawCss).toContain('--ha-font-weight-normal');
  });
  it('a style written before the token existed still loads into the same controls', () => {
    const old = 'ha-card {\n  font-size: 18px;\n  font-weight: bold;\n  --ha-card-header-font-size: calc(18px * 1.5);\n}';
    const back = parse(old, 'glance');
    expect(back.font).toMatchObject({ enabled: true, fontSize: 18, fontWeight: 'bold' });
    expect(back.advanced.rawCss).toBe('');
  });
});

describe('humidifier: the mode label follows the weight', () => {
  it('writes --ha-font-weight-medium only with a weight, claimed on the humidifier only', () => {
    expect(gen(WEIGHT, 'humidifier')).toContain('--ha-font-weight-medium: bold;');
    expect(gen(COLOR, 'humidifier')).not.toContain('--ha-font-weight-medium');
    roundTrips(gen({ ...WEIGHT, ...COLOR }, 'humidifier'), 'humidifier');
    const css = 'ha-card {\n  font-weight: bold;\n  --ha-font-weight-medium: bold;\n}';
    expect(parse(css, 'markdown').advanced.rawCss).toContain('--ha-font-weight-medium');
  });
});

describe('alarm-panel: the title follows the size', () => {
  it('offers the size row (header variables reach the title); colour stays hidden', () => {
    expect(capsFor('alarm-panel').fontSize).toBe(true);
    expect(capsFor('alarm-panel').headerTitle).toBe(true);
    expect(capsFor('alarm-panel').fontColor).toBe(false);
    expect(gen(SIZE, 'alarm-panel')).toContain('--ha-card-header-font-size: calc(20px * 1.5);');
  });
});

describe('markdown: the title follows size and colour', () => {
  it('writes the header variables, and round-trips', () => {
    expect(gen(SIZE, 'markdown')).toContain('--ha-card-header-font-size: calc(20px * 1.5);');
    expect(gen(COLOR, 'markdown')).toContain('--ha-card-header-color: #ff0000;');
    roundTrips(gen({ ...SIZE, ...COLOR, fontFamily: 'serif' }, 'markdown'), 'markdown');
  });
});

describe('picture-glance: the title follows the weight', () => {
  it('writes .title only with a weight; round-trips; size and colour stay hidden', () => {
    expect(gen(WEIGHT, 'picture-glance')).toContain('.title {\n  font-weight: bold !important;\n}');
    expect(gen(SIZE, 'picture-glance')).not.toContain('.title');
    roundTrips(gen(WEIGHT, 'picture-glance'), 'picture-glance');
    expect(capsFor('picture-glance').fontWeight).toBe(true);
  });
});

describe('size row gating on the alert card', () => {
  it('alert offers no Text size, and a size an older style stored survives open + save', () => {
    expect(capsFor('alert').fontSize).toBe(false);
    const old = 'ha-card {\n  font-size: 20px;\n  font-family: serif;\n}';
    const back = parse(old, 'alert');
    expect(back.font).toMatchObject({ enabled: true, fontSize: 20 });
    expect(generateCss(back, 'alert')).toBe(old);
    const sizeOnly = 'ha-card {\n  font-size: 20px;\n}';
    expect(generateCss(parse(sizeOnly, 'alert'), 'alert')).toBe(sizeOnly);
  });
});

describe('weight row gating', () => {
  it('is hidden exactly where weight reaches nothing', () => {
    expect([...NO_FONT_WEIGHT_TYPES].sort()).toEqual(['alert', 'area', 'date']);
    for (const t of NO_FONT_WEIGHT_TYPES) expect(capsFor(t).fontWeight, t).toBe(false);
    for (const t of ['tile', 'glance', 'markdown', 'humidifier', 'custom:mushroom-entity-card']) expect(capsFor(t).fontWeight, t).toBe(true);
  });

  type FontEl = { state: unknown; cardType?: string; _renderBody(): unknown };
  let Font: new () => FontEl;
  beforeAll(async () => {
    await import('../src/modules/module-font.js');
    Font = registry.get('cms-font-module') as new () => FontEl;
  });
  const body = (cardType: string, state: Partial<FontModuleState> = {}) => {
    const el = new Font();
    el.cardType = cardType;
    el.state = { ...DEFAULT_FONT, enabled: true, ...state };
    return templateText(el._renderBody());
  };
  it('the rendered module has no Weight row on area / date / alert, and has it elsewhere', () => {
    for (const t of ['area', 'date', 'alert']) expect(body(t), t).not.toContain('Weight');
    for (const t of ['tile', 'glance', 'picture-entity']) expect(body(t), t).toContain('Weight');
  });
  it('a weight stored by an older style keeps its row (so it can be seen and reset)', () => {
    expect(body('area', { fontWeight: 'bold' })).toContain('Weight');
  });
  it('an old stored weight survives open + save on a card that no longer offers the row', () => {
    for (const t of ['area', 'date', 'alert']) {
      const old = 'ha-card {\n  font-size: 16px;\n  font-weight: bold;\n  color: var(--primary-text-color);\n  font-family: serif;\n}';
      const back = parse(old, t);
      expect(back.font, t).toMatchObject({ enabled: true, fontWeight: 'bold' });
      expect(generateCss(back, t), t).toBe(old);
      // weight-only too
      const wOnly = gen(WEIGHT, t);
      expect(wOnly, t).toBe('ha-card {\n  font-weight: bold;\n}');
      expect(generateCss(parse(wOnly, t), t), t).toBe(wOnly);
    }
  });
});

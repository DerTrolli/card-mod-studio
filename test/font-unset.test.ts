/**
 * Font: size, weight and colour are each "not set" until the user sets them.
 * Enabling the module, or changing one control, writes only that property and
 * the companions derived from it; an all-set style (what every earlier version
 * wrote) re-saves byte for byte; the size-less styles reload.
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import type { FontModuleState, StudioState } from '../src/types/index.js';

const EMPTY = mapToStudioState(parseStyleValue(''));
const font = (f: Partial<FontModuleState>): StudioState => ({ ...EMPTY, font: { ...EMPTY.font, enabled: true, ...f } });
const gen = (f: Partial<FontModuleState>, type: string, opts?: object) => generateCss(font(f), type, opts);
const parse = (css: string, type: string) => mapToStudioState(parseStyleValue(css), type);

const SIZE = { fontSize: 20 };
const WEIGHT = { fontWeight: 'bold' as const };
const COLOR = { color: '#ff0000' };
const ALL = { fontSize: 18, fontWeight: 'medium' as const, color: '#00ff00' };

describe('enabling Font writes nothing by itself', () => {
  for (const t of ['tile', 'sun', 'sensor', 'gauge', 'thermostat', 'light', 'entities', 'button', 'media-control', 'picture-elements', 'custom:mushroom-entity-card', 'custom:bubble-card/button']) {
    it(t, () => expect(gen({}, t)).toBe(''));
  }
});

describe('one control -> only its own property and companions', () => {
  it('plain card: weight only / colour only / size only', () => {
    expect(gen(WEIGHT, 'sun')).toBe('ha-card {\n  font-weight: bold;\n}');
    expect(gen(COLOR, 'sun')).toBe('ha-card {\n  color: #ff0000;\n}');
    expect(gen(SIZE, 'sun')).toBe('ha-card {\n  font-size: 20px;\n}');
  });

  it('tile', () => {
    expect(gen(SIZE, 'tile')).toBe(
      'ha-card {\n  font-size: 20px;\n  --ha-tile-info-primary-font-size: 20px;\n  --ha-tile-info-secondary-font-size: 20px;\n}',
    );
    const w = gen(WEIGHT, 'tile');
    expect(w).toContain('--ha-tile-info-primary-font-weight: bold;');
    expect(w).not.toMatch(/font-size|color/);
    const c = gen(COLOR, 'tile');
    expect(c).toContain('--ha-tile-info-primary-color: #ff0000;');
    expect(c).not.toMatch(/font-size|font-weight/);
  });

  it('header-title cards: weight-only writes no --ha-card-header-*', () => {
    for (const t of ['glance', 'calendar', 'entities']) {
      expect(gen(WEIGHT, t), t).not.toContain('--ha-card-header');
    }
    expect(gen(SIZE, 'glance')).toContain('--ha-card-header-font-size: calc(20px * 1.5);');
    expect(gen(COLOR, 'glance')).not.toContain('font-size');
  });

  it('sensor/entity: weight-only has no .value/.measurement block; size-only has no weight', () => {
    for (const t of ['sensor', 'entity']) {
      const w = gen(WEIGHT, t);
      expect(w).toContain('.name {\n  font-weight: bold !important;\n}');
      expect(w).not.toMatch(/\.value|\.measurement|font-size/);
      const s = gen(SIZE, t);
      expect(s).toContain('.value {');
      expect(s).not.toMatch(/font-weight|color/);
    }
    expect(gen(COLOR, 'sensor')).not.toMatch(/\.value|font-size|font-weight/);
  });

  it('gauge: weight-only has no --primary-text-color; colour-only has it', () => {
    const w = gen(WEIGHT, 'gauge');
    expect(w).not.toContain('--primary-text-color');
    expect(w).toContain('.title {\n  font-weight: bold !important;\n}');
    expect(gen(COLOR, 'gauge')).toContain('--primary-text-color: #ff0000;');
  });

  it('thermostat: no --ha-font-size-l unless size is set', () => {
    const w = gen(WEIGHT, 'thermostat');
    expect(w).toContain('--ha-font-weight-medium: bold;');
    expect(w).not.toContain('--ha-font-size-l');
    expect(gen(SIZE, 'thermostat')).not.toContain('--ha-font-weight-medium');
  });

  it('light: #info/.brightness only with a size', () => {
    expect(gen(WEIGHT, 'light')).not.toMatch(/#info|\.brightness/);
    expect(gen(SIZE, 'light')).toContain('#info {');
  });

  it('entities: .card-header only with a weight', () => {
    expect(gen(SIZE, 'entities')).not.toContain('.card-header');
    expect(gen(WEIGHT, 'entities')).toContain('.card-header {\n  font-weight: bold;\n}');
  });

  it('button: !important only with the size', () => {
    expect(gen(SIZE, 'button')).toContain('font-size: 20px !important;');
    expect(gen(WEIGHT, 'button')).not.toContain('!important');
  });

  it('Mushroom: weight-only writes only the weight variables; colour-only is not offered by the card', () => {
    const k = 'custom:mushroom-entity-card';
    expect(gen(WEIGHT, k)).toBe(
      'ha-card {\n  --card-primary-font-weight: bold;\n  --card-secondary-font-weight: bold;\n}',
    );
    expect(gen(SIZE, k)).not.toContain('weight');
    expect(gen(WEIGHT, 'custom:mushroom-chips-card')).not.toContain('size');
  });

  it('Bubble: colour-only writes only the colour on the name/state selector', () => {
    const css = gen(COLOR, 'custom:bubble-card/button');
    expect(css).toMatch(/color: #ff0000;/);
    expect(css).not.toMatch(/font-size|font-weight/);
  });

  it('a hidden control writes nothing (size on NO_FONT_SIZE, colour on NO_TEXT_COLOR cards)', () => {
    // The panel hides the rows; with nothing set, nothing is emitted.
    expect(gen({}, 'picture-glance')).toBe('');
    expect(gen({}, 'alarm-panel')).toBe('');
  });
});

describe('a 0 value is a value (never dropped on save)', () => {
  it('base, tile companions, header, sensor value, mushroom', () => {
    expect(gen({ fontSize: 0 }, 'sun')).toBe('ha-card {\n  font-size: 0px;\n}');
    expect(gen({ fontSize: 0 }, 'tile')).toContain('--ha-tile-info-primary-font-size: 0px;');
    expect(gen({ fontSize: 0 }, 'glance')).toContain('--ha-card-header-font-size: calc(0px * 1.5);');
    expect(gen({ fontSize: 0 }, 'sensor')).toContain('.value {\n  font-size: calc(0px * 1.75) !important;');
    expect(gen({ fontSize: 0 }, 'custom:mushroom-entity-card')).toContain('--card-primary-font-size: 0px;');
  });

  it('round-trips byte for byte', () => {
    for (const t of ['sun', 'tile', 'sensor', 'glance', 'custom:mushroom-entity-card']) {
      const css = gen({ fontSize: 0 }, t);
      const back = parse(css, t);
      expect(back.font.fontSize, t).toBe(0);
      expect(back.advanced.rawCss, t).toBe('');
      expect(generateCss(back, t), t).toBe(css);
    }
  });
});

describe('all-set styles (every earlier version) re-save identically', () => {
  const TYPES = ['sun', 'tile', 'button', 'sensor', 'entity', 'gauge', 'thermostat', 'light', 'entities', 'media-control', 'picture-elements', 'glance',
    'custom:mushroom-entity-card', 'custom:mushroom-chips-card', 'custom:mushroom-title-card', 'custom:bubble-card/button', 'custom:bubble-card/separator'];
  for (const t of TYPES) {
    it(t, () => {
      const css = gen({ ...ALL, fontFamily: 'serif' }, t);
      const back = parse(css, t);
      const { color, ...noColor } = ALL; // chips' text carries its own colour
      expect(back.font).toMatchObject({ enabled: true, ...(t.includes('chips') ? noColor : { color }), ...noColor, fontFamily: 'serif' });
      expect(back.advanced.rawCss).toBe('');
      expect(generateCss(back, t)).toBe(css);
    });
  }

  it('an old default-valued style keeps its visible values (16px / normal / theme colour)', () => {
    const old = 'ha-card {\n  font-size: 16px;\n  font-weight: normal;\n  color: var(--primary-text-color);\n}';
    const back = parse(old, 'sun');
    expect(back.font).toMatchObject({ enabled: true, fontSize: 16, fontWeight: 'normal', color: 'var(--primary-text-color)' });
    expect(generateCss(back, 'sun')).toBe(old);
  });
});

describe('size-less styles reload', () => {
  it('weight-only reloads as Font enabled with only weight, on every card family', () => {
    for (const t of ['sun', 'tile', 'sensor', 'gauge', 'thermostat', 'light', 'entities', 'button', 'media-control', 'custom:mushroom-entity-card', 'custom:bubble-card/button']) {
      const css = gen(WEIGHT, t);
      const back = parse(css, t);
      expect(back.font.enabled, t).toBe(true);
      expect(back.font.fontWeight, t).toBe('bold');
      expect(back.font.fontSize, t).toBeUndefined();
      expect(back.font.color, t).toBeUndefined();
      expect(back.advanced.rawCss, t).toBe('');
      expect(generateCss(back, t), t).toBe(css);
    }
  });

  it('colour-only and weight+colour round-trip', () => {
    for (const [t, f] of [['tile', COLOR], ['sensor', COLOR], ['gauge', COLOR], ['sun', { ...WEIGHT, ...COLOR }], ['media-control', COLOR]] as const) {
      const css = gen(f, t);
      const back = parse(css, t);
      expect(back.font.enabled, t).toBe(true);
      expect(back.advanced.rawCss, t).toBe('');
      expect(generateCss(back, t), t).toBe(css);
    }
  });

  it('a hand-written `ha-card { color: red }` is NOT adopted on a tile, IS adopted (identically) on a plain card (sun)', () => {
    const css = 'ha-card {\n  color: red;\n}';
    const tile = parse(css, 'tile');
    expect(tile.font.enabled).toBe(false);
    expect(tile.advanced.rawCss).toContain('color: red');
    const md = parse(css, 'sun');
    expect(md.font).toMatchObject({ enabled: true, color: 'red' });
    expect(md.advanced.rawCss).toBe('');
    expect(generateCss(md, 'sun')).toBe(css);
  });

  it('is not adopted when the card has a non-px font-size of its own, or a lone companion', () => {
    const odd = parse('ha-card {\n  font-size: 1.2em;\n  font-weight: bold;\n}', 'sun');
    expect(odd.font.enabled).toBe(false);
    expect(odd.advanced.rawCss).toContain('font-weight: bold');
    // A different !important flag than the module writes: not reproducible.
    const imp = parse('.name {\n  font-weight: bold;\n}\nha-card {\n  font-weight: bold;\n}', 'sensor');
    expect(imp.font.enabled).toBe(false);
  });

  it('profile: only a COMPLETE role (both weight variables, equal) is adopted without a size', () => {
    const k = 'custom:mushroom-entity-card';
    const lone = parse('ha-card {\n  --card-primary-font-weight: bold;\n}', k);
    expect(lone.font.enabled).toBe(false);
    expect(lone.advanced.rawCss).toContain('--card-primary-font-weight');
    const differing = parse('ha-card {\n  --card-primary-font-weight: bold;\n  --card-secondary-font-weight: normal;\n}', k);
    expect(differing.font.enabled).toBe(false);
    const whole = parse('ha-card {\n  --card-primary-font-weight: bold;\n  --card-secondary-font-weight: bold;\n}', k);
    expect(whole.font).toMatchObject({ enabled: true, fontWeight: 'bold' });
    expect(whole.advanced.rawCss).toBe('');
  });

  it('a hand-written size-only style loads with only the size', () => {
    const back = parse('ha-card {\n  font-size: 18px;\n}', 'sun');
    expect(back.font).toMatchObject({ enabled: true, fontSize: 18 });
    expect(back.font.fontWeight).toBeUndefined();
    expect(generateCss(back, 'sun')).toBe('ha-card {\n  font-size: 18px;\n}');
  });
});

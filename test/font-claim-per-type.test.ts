/**
 * Font companions are claimed per card type, on the size-anchored path too:
 * a hand-written copy of a companion a card type never writes survives a
 * save, while everything the Studio writes for that type is fully claimed.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { installEngines, restoreEngines, cfg, openEditSave } from './v010-audit-helpers.js';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState, DEFAULT_FONT } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { parseCss } from '../src/parser/css-parser.js';
import { capsFor } from '../src/utils/card-caps.js';
import * as caps from '../src/utils/card-caps.js';
import type { FontModuleState, StudioState } from '../src/types/index.js';

afterEach(() => restoreEngines());

const EMPTY = mapToStudioState(parseStyleValue(''));
const withFont = (f: Partial<FontModuleState>): StudioState => ({ ...EMPTY, font: { ...DEFAULT_FONT, enabled: true, ...f } });
const gen = (f: Partial<FontModuleState>, type: string) => generateCss(withFont(f), type);
const parse = (css: string, type: string) => mapToStudioState(parseStyleValue(css), type);

/** Every built-in card type the caps tables know, plus the ones Font writes companions for. */
const TYPES = [
  ...new Set([
    ...Object.values(caps)
      .filter((v): v is Set<string> => v instanceof Set)
      .flatMap((s) => [...s]),
    'tile', 'button', 'light', 'sensor', 'entity', 'statistic', 'gauge', 'thermostat', 'humidifier', 'entities', 'glance',
    'markdown', 'alarm-panel', 'picture-glance', 'sun', 'heading', 'history-graph', 'statistics-graph', 'todo-list',
    'shopping-list', 'logbook', 'calendar', 'media-control', 'alert', 'area', 'date',
  ]),
]
  .filter((t) => !t.startsWith('custom:') && capsFor(t).modules.font)
  .sort();

const FULL = { fontSize: 20, fontWeight: 'bold' as const, color: 'red', fontFamily: 'Georgia' };
const BASE = new Set(['font-size', 'font-weight', 'color', 'font-family']);

const flat = (css: string) =>
  new Set(parseCss(css).flatMap((t) => t.properties.map((p) => `${t.selector.trim()}|${p.property}|${p.value.trim()}`)));
const keysOf = (css: string) =>
  new Set(parseCss(css).flatMap((t) => t.properties.map((p) => `${t.selector.trim()}|${p.property}`)));

const save = (type: string, style: string): string => {
  installEngines(['card-mod']);
  return String(openEditSave(cfg({ type, entity: 'light.a', card_mod: { style } })).card_mod?.style ?? '');
};

describe('everything the Studio writes is fully claimed (nothing lands in Advanced CSS)', () => {
  const FIELDS: Array<keyof typeof FULL> = ['fontSize', 'fontWeight', 'color', 'fontFamily'];
  let cases = 0;
  it.each(TYPES)('[%s] every non-empty subset of the four rows', (type) => {
    for (let mask = 1; mask < 16; mask++) {
      const f = Object.fromEntries(FIELDS.filter((_, i) => mask & (1 << i)).map((k) => [k, FULL[k]]));
      const css = gen(f, type);
      if (!css) continue;
      cases++;
      const back = parse(css, type);
      expect(back.advanced.rawCss, `${type} ${JSON.stringify(f)}`).toBe('');
      expect(back.font.enabled, `${type} ${JSON.stringify(f)}`).toBe(true);
      expect(generateCss(back, type), `${type} ${JSON.stringify(f)}`).toBe(css);
    }
  });
  it('covered a real number of cases', () => expect(cases).toBeGreaterThan(TYPES.length * 10));
});

describe('a hand-written companion of a type that never writes it survives a save', () => {
  // Every companion declaration ANY type writes (the base ha-card rows excluded).
  const shapes = new Map<string, { selector: string; line: string }>();
  for (const y of TYPES) {
    for (const t of parseCss(gen(FULL, y))) {
      for (const p of t.properties) {
        if (t.selector.trim() === 'ha-card' && BASE.has(p.property)) continue;
        shapes.set(`${t.selector.trim()}|${p.property}|${p.value.trim()}`, {
          selector: t.selector.trim(),
          line: `${p.property}: ${p.value.trim()}${p.important ? ' !important' : ''};`,
        });
      }
    }
  }

  let cases = 0;
  it.each(TYPES)('[%s] next to a sized Font style', (type) => {
    const own = keysOf(gen(FULL, type));
    const sized = gen(FULL, type);
    for (const [key, { selector, line }] of shapes) {
      if (own.has(key.split('|').slice(0, 2).join('|'))) continue;
      // Deliberate legacy clean-up (see the last test): v0.10.1's picture-glance header variables.
      if (type === 'picture-glance' && key.startsWith('ha-card|--ha-card-header-')) continue;
      const style = selector === 'ha-card' ? sized.replace('ha-card {\n', `ha-card {\n  ${line}\n`) : `${sized}\n\n${selector} {\n  ${line}\n}`;
      const out = save(type, style);
      cases++;
      expect(flat(out).has(key), `${type} lost ${key}`).toBe(true);
      expect(save(type, out), `${type} ${key} not stable`).toBe(out);
    }
  });
  it('covered a real number of cases', () => {
    expect(shapes.size).toBeGreaterThan(20);
    expect(cases).toBeGreaterThan(500);
  });
});

describe('reproductions', () => {
  const survives = (type: string, style: string) => {
    const out = save(type, style);
    for (const d of flat(style)) expect(flat(out).has(d), `${type} lost ${d}`).toBe(true);
    expect(save(type, out)).toBe(out);
  };
  it('markdown: a tile-info size variable next to a size', () => {
    survives('markdown', 'ha-card {\n  font-size: 14px;\n  --ha-tile-info-primary-font-size: 14px;\n}');
  });
  it('sun / tile: a header colour next to size + colour', () => {
    for (const t of ['sun', 'tile']) survives(t, 'ha-card {\n  font-size: 20px;\n  color: red;\n  --ha-card-header-color: red;\n}');
  });
  it('sun / tile: --ha-font-weight-medium next to size + weight', () => {
    for (const t of ['sun', 'tile']) survives(t, 'ha-card {\n  font-size: 20px;\n  font-weight: bold;\n  --ha-font-weight-medium: bold;\n}');
  });
  it('sun / markdown: a .title weight', () => {
    for (const t of ['sun', 'markdown']) survives(t, 'ha-card {\n  font-size: 20px;\n  font-weight: bold;\n}\n\n.title {\n  font-weight: bold;\n}');
  });
  it('thermostat and humidifier still claim their own --ha-font-weight-medium', () => {
    for (const t of ['thermostat', 'humidifier']) {
      expect(parse(gen({ fontSize: 20, fontWeight: 'bold' }, t), t).advanced.rawCss, t).toBe('');
    }
  });
  it('without a card type every companion shape is still claimed (callers that parse untyped)', () => {
    const css = gen({ fontSize: 20, fontWeight: 'bold' }, 'thermostat');
    expect(mapToStudioState(parseStyleValue(css)).advanced.rawCss).toBe('');
  });
  it('the old picture-glance header variables are dropped on purpose, not kept as Advanced CSS', () => {
    const old = 'ha-card {\n  font-size: 20px;\n  --ha-card-header-font-size: calc(20px * 1.5);\n}';
    const back = parse(old, 'picture-glance');
    expect(back.advanced.rawCss).toBe('');
    expect(generateCss(back, 'picture-glance')).toBe('ha-card {\n  font-size: 20px;\n}');
  });
});

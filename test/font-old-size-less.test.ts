/**
 * Styles the previous Studio wrote WITHOUT a size (Font has no default size)
 * still open with Font on, on the card types that gained companions in 0.11,
 * and gain those companions on the next save instead of growing a second rule.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { installEngines, restoreEngines, cfg, openEditSave } from './v010-audit-helpers.js';
import { buildMergedStudioState } from '../src/editor/studio-state.js';

afterEach(() => restoreEngines());

const rule = (decl: string) => `ha-card {\n  ${decl};\n}`;

const WEIGHT_TYPES = [
  'button', 'humidifier', 'glance', 'todo-list', 'shopping-list', 'logbook', 'history-graph',
  'statistics-graph', 'statistic', 'calendar', 'markdown', 'alarm-panel', 'picture-glance',
];
const COLOUR_TYPES = ['button', 'statistic', 'markdown', 'alarm-panel'];
const FAMILY_TYPES = ['markdown', 'alarm-panel'];

const open = (type: string, style: string) => {
  installEngines(['card-mod']);
  const config = cfg({ type, entity: 'light.a', card_mod: { style } });
  return { state: buildMergedStudioState(config), saved: String(openEditSave(config).card_mod?.style ?? '') };
};

const CASES: Array<[string, string, string, Record<string, unknown>]> = [
  ...WEIGHT_TYPES.map((t): [string, string, string, Record<string, unknown>] => [t, 'weight', rule('font-weight: bold'), { fontWeight: 'bold' }]),
  // statistic was already a header-title card: its old colour style carries the header colour.
  ...COLOUR_TYPES.map((t): [string, string, string, Record<string, unknown>] => [
    t,
    'colour',
    t === 'statistic' ? 'ha-card {\n  color: red;\n  --ha-card-header-color: red;\n}' : rule('color: red'),
    { color: 'red' },
  ]),
  ...FAMILY_TYPES.map((t): [string, string, string, Record<string, unknown>] => [t, 'family', rule('font-family: Georgia'), { fontFamily: 'Georgia' }]),
];

describe('an old size-less Font style loads with Font on', () => {
  it.each(CASES)('[%s] %s-only', (type, _kind, style, fields) => {
    const { state, saved } = open(type, style);
    expect(state.font).toMatchObject({ enabled: true, ...fields });
    expect(state.font.fontSize).toBeUndefined();
    expect(state.advanced.rawCss).toBe('');
    // The old rule is kept (once) and the new companions ride along.
    expect(saved.startsWith(style.slice(0, -2))).toBe(true);
    expect(saved.match(/ha-card \{/g)).toHaveLength(1);
    // Saving again is stable.
    const again = open(type, saved);
    expect(again.saved).toBe(saved);
    expect(again.state.font).toMatchObject({ enabled: true, ...fields });
  });

  it('weight gains the new companions on save (button/statistic/glance/humidifier/picture-glance)', () => {
    expect(open('glance', rule('font-weight: bold')).saved).toContain('--ha-font-weight-normal: bold;');
    expect(open('humidifier', rule('font-weight: bold')).saved).toContain('--ha-font-weight-medium: bold;');
    expect(open('statistic', rule('font-weight: bold')).saved).toContain('.name {\n  font-weight: bold !important;');
    expect(open('picture-glance', rule('font-weight: bold')).saved).toContain('.title {\n  font-weight: bold !important;');
    expect(open('button', rule('color: red')).saved).toContain('.state {\n  color: red !important;');
    expect(open('markdown', rule('color: red')).saved).toContain('--ha-card-header-color: red;');
  });
});

describe('the strictness for hand-written styles is kept', () => {
  it('a hand-written companion with another value is not adopted and survives', () => {
    const style = 'ha-card {\n  font-weight: bold;\n  --ha-font-weight-normal: normal;\n}';
    const { state, saved } = open('glance', style);
    expect(state.font.enabled).toBe(false);
    expect(saved).toBe(style);
  });
  it('a hand-written block beside the optional companion still blocks adoption', () => {
    const style = 'ha-card {\n  color: red;\n}\n\n.state {\n  color: red !important;\n  margin: 0;\n}';
    expect(open('button', style).state.font.enabled).toBe(false);
  });
  it('the optional set is only the new companions: a bare colour on a tile is still not adopted', () => {
    expect(open('tile', rule('color: red')).state.font.enabled).toBe(false);
  });
  it('colour-only on glance still needs its (older) header colour', () => {
    expect(open('glance', rule('color: red')).state.font.enabled).toBe(false);
  });
});

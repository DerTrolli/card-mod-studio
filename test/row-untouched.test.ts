/**
 * An unrelated save must write every entities row the user did not change
 * back exactly as loaded (same object, same style bytes, no added
 * `state_color`). Only a row whose row-level controls changed is regenerated.
 * The pipeline mirrors cms-panel: card-level state -> applyStudioState ->
 * applyEntityRowStyles.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import type { CardModCardConfig, StudioState } from '../src/types/index.js';
import {
  buildMergedStudioState, applyStudioState, initEntityRowStyles, applyEntityRowStyles,
} from '../src/editor/studio-state.js';
import { installEngines, restoreEngines, cfg } from './v010-audit-helpers.js';

afterEach(() => restoreEngines());

type Row = Record<string, unknown>;
type Out = { entities: Row[] };

const JINJA = ":host {\n  --state-icon-color: {% if is_state('light.b','on') %}gold{% else %}grey{% endif %};\n}\n";
const SHAPES: Record<string, string | Record<string, string>> = {
  legacyVar: ':host { --paper-item-icon-color: red; }\n',
  jinjaTrailingNewline: JINJA,
  twoBlocks: ':host { --state-icon-color: orange; border: 1px dashed blue; }',
  dict: { '.': ':host { color: green; }', 'ha-state-icon$': 'ha-icon { color: red; }' },
};

const enableBackground = (s: StudioState): StudioState => ({
  ...s, background: { ...s.background, enabled: true, color: '#112233' },
});

/** The panel's save for a card-level change: rows pass through the same call. */
function cardLevelSave(config: CardModCardConfig, hass?: undefined): Out {
  const state = buildMergedStudioState(config, hass);
  const written = applyStudioState(enableBackground(state), config, hass);
  return applyEntityRowStyles(written, initEntityRowStyles(config, hass), hass) as unknown as Out;
}

const rowFor = (key: 'card_mod' | 'uix' | 'both', entity: string, style: unknown): Row =>
  key === 'both'
    ? { entity, card_mod: { style }, uix: { style } }
    : { entity, [key]: { style } };

const rowsFor = (key: 'card_mod' | 'uix' | 'both') => [
  rowFor(key, 'light.a', SHAPES.legacyVar),
  rowFor(key, 'light.b', SHAPES.jinjaTrailingNewline),
  rowFor(key, 'light.c', SHAPES.twoBlocks),
  rowFor(key, 'light.d', SHAPES.dict),
  'light.kitchen',
  { type: 'section', label: 'x' },
  { entity: 'light.e' },
];

describe.each(['card_mod', 'uix', 'both'] as const)('untouched rows survive an unrelated save (%s)', (key) => {
  const engines = key === 'uix' ? (['uix'] as const) : key === 'card_mod' ? (['card-mod'] as const) : (['card-mod', 'uix'] as const);

  it('every row deep-equals its original, and nothing gains state_color', () => {
    installEngines([...engines]);
    const rows = rowsFor(key);
    const original = JSON.parse(JSON.stringify(rows));
    const config = cfg({ type: 'entities', entities: rows });
    const out = cardLevelSave(config);
    expect(out.entities).toEqual(original);
    // the string row is still a string
    expect(out.entities[4]).toBe('light.kitchen');
    out.entities.forEach((r) => expect(typeof r === 'object' && r && 'state_color' in r).toBeFalsy());
  });

  it('editing row 1 only: rows 0 and 2.. stay identical, row 1 has the change', () => {
    installEngines([...engines]);
    const rows = rowsFor(key);
    const original = JSON.parse(JSON.stringify(rows));
    const config = cfg({ type: 'entities', entities: rows });
    const styles = initEntityRowStyles(config);
    const out = applyEntityRowStyles(config, { ...styles, '1': { ...styles['1'], textColor: 'blue' } }) as unknown as Out;
    out.entities.forEach((r, i) => { if (i !== 1) expect(r).toEqual(original[i]); });
    const style = (out.entities[1] as { card_mod?: { style: string }; uix?: { style: string } });
    const text = JSON.stringify(style);
    expect(text).toContain('color: blue');
    // the row's own Jinja icon colour survived the regeneration
    expect(text).toContain('is_state');
  });

  it('switching a row control on and back off leaves every row untouched', () => {
    installEngines([...engines]);
    const rows = rowsFor(key);
    const original = JSON.parse(JSON.stringify(rows));
    const config = cfg({ type: 'entities', entities: rows });
    const styles = initEntityRowStyles(config);
    // what the rendered switch handlers leave behind: keys set to undefined
    const on = { ...styles['0'], textColor: '#2196F3', textMode: 'static' as const };
    const off = { ...on, textColor: '', textMode: undefined, textRules: undefined, textDefault: undefined };
    const onOff = { ...styles, '0': on };
    expect((applyEntityRowStyles(config, onOff) as unknown as Out).entities[0]).not.toEqual(original[0]);
    const back = applyEntityRowStyles(config, { ...styles, '0': off, '4': { iconColor: '', textColor: '', fontSizePx: undefined } }) as unknown as Out;
    expect(back.entities).toEqual(original);
  });
});

describe('row save details', () => {
  it('legacy variable is upgraded only for a row the user edits', () => {
    installEngines(['card-mod']);
    const config = cfg({ type: 'entities', entities: [rowFor('card_mod', 'light.a', SHAPES.legacyVar), rowFor('card_mod', 'light.b', SHAPES.legacyVar)] });
    const styles = initEntityRowStyles(config);
    const out = applyEntityRowStyles(config, { ...styles, '1': { ...styles['1'], textColor: 'blue' } }) as unknown as Out;
    expect(out.entities[0]).toEqual(rowFor('card_mod', 'light.a', SHAPES.legacyVar));
    expect(JSON.stringify(out.entities[1])).toContain('--state-icon-color');
  });

  it('rows on the same entity keep separate styles; editing one leaves the other', () => {
    installEngines(['card-mod']);
    const a = rowFor('card_mod', 'light.a', ':host { --paper-item-icon-color: red; }\n');
    const b = rowFor('card_mod', 'light.a', ':host { color: green; }\n');
    const config = cfg({ type: 'entities', entities: [a, b] });
    const styles = initEntityRowStyles(config);
    const out = applyEntityRowStyles(config, { ...styles, '1': { ...styles['1'], textColor: 'blue' } }) as unknown as Out;
    expect(out.entities[0]).toEqual(a);
    expect(JSON.stringify(out.entities[1])).toContain('color: blue');
  });

  it('a string row that was never styled stays a string; once styled it is an object', () => {
    installEngines(['card-mod']);
    const config = cfg({ type: 'entities', entities: ['light.k', 'light.m'] });
    const styles = initEntityRowStyles(config);
    expect((applyEntityRowStyles(config, styles) as unknown as Out).entities).toEqual(['light.k', 'light.m']);
    const out = applyEntityRowStyles(config, { ...styles, '0': { iconColor: '', textColor: 'red' } }) as unknown as Out;
    expect(out.entities[0]).toMatchObject({ entity: 'light.k' });
    expect(out.entities[1]).toBe('light.m');
  });

  it('a mixed-form (locked) row and a dictionary row are returned as the same object', () => {
    installEngines(['card-mod']);
    const mixed = { entity: 'light.a', card_mod: { style: ':host { color: red; }' }, uix: { style: { '.': ':host { color: blue; }', 'x$': 'y { z: 1; }' } } };
    const dict = rowFor('card_mod', 'light.b', SHAPES.dict);
    const config = cfg({ type: 'entities', entities: [mixed, dict] });
    const out = applyEntityRowStyles(config, initEntityRowStyles(config)) as unknown as Out;
    expect(out.entities[0]).toBe(mixed);
    expect(out.entities[1]).toBe(dict);
  });

  it('a preset-style card-level change leaves rows alone (rows ride the same save)', () => {
    installEngines(['card-mod']);
    const rows = [rowFor('card_mod', 'light.a', SHAPES.legacyVar)];
    const config = cfg({ type: 'entities', entities: rows });
    const out = cardLevelSave(config);
    expect(out.entities[0]).toBe(rows[0]);
  });
});

describe('row slot comparison', () => {
  beforeEach(() => installEngines(['card-mod']));
  it('a row whose style slot is missing comes back as the same object', () => {
    const config = cfg({ type: 'entities', entities: [rowFor('card_mod', 'light.a', SHAPES.legacyVar)] }) as CardModCardConfig;
    const out = applyEntityRowStyles(config, {}) as unknown as Out;
    expect(out.entities[0]).toBe((config as unknown as Out).entities[0]);
  });

  it('a slot with the same content in another key order is still unchanged', () => {
    const config = cfg({ type: 'entities', entities: [rowFor('card_mod', 'light.a', SHAPES.legacyVar)] }) as CardModCardConfig;
    const slot = initEntityRowStyles(config)['0'] as unknown as Record<string, unknown>;
    expect(Object.keys(slot).length).toBeGreaterThan(1);
    const reversed = Object.fromEntries(Object.entries(slot).reverse());
    const out = applyEntityRowStyles(config, { '0': reversed } as never) as unknown as Out;
    expect(out.entities[0]).toBe((config as unknown as Out).entities[0]);
  });
});

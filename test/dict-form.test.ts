/**
 * v0.10 dict-form model — round-trip corpus.
 *
 * The contract (docs/V0.10_PLAN.md §4.1): on a dict-form style, ONLY the
 * `.` entry is parsed/regenerated (through the normal string pipeline);
 * every other entry — pierced `sel $` chains, `$$`/`&` UIX extensions,
 * element keys, nested dicts — is preserved byte-identically, in original
 * key order, across every open/edit/save. These tests run the REAL editor
 * pipeline (buildMergedStudioState → applyStudioState), the same one
 * cms-panel and cms-child-card-section share.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { CardModCardConfig, EntitiesCardRow } from '../src/types/index.js';
import {
  buildMergedStudioState,
  applyStudioState,
  initEntityRowStyles,
  applyEntityRowStyles,
  rowStyleKey,
} from '../src/editor/studio-state.js';
import { applyCardModStyle } from '../src/generator/yaml-generator.js';
import { usesUixOnlyFeaturesInBlock, dictUsesUixOnlySelectors } from '../src/utils/style-compat.js';

// pickOutputKey() consults customElements (a DOM global) — stub a registry
// with card-mod "installed" so every test writes to the card_mod key, same
// pattern as merge-dedup.test.ts.
class FakeCustomElementRegistry {
  private registry = new Map<string, CustomElementConstructor>();
  define(name: string, ctor: CustomElementConstructor) {
    this.registry.set(name, ctor);
  }
  get(name: string) {
    return this.registry.get(name);
  }
}

let originalCustomElements: unknown;
beforeEach(() => {
  originalCustomElements = (globalThis as { customElements?: unknown }).customElements;
  const registry = new FakeCustomElementRegistry();
  registry.define('card-mod', class {} as unknown as CustomElementConstructor);
  (globalThis as { customElements: unknown }).customElements = registry;
});
afterEach(() => {
  (globalThis as { customElements: unknown }).customElements = originalCustomElements;
});

const openSave = (config: CardModCardConfig): CardModCardConfig =>
  applyStudioState(buildMergedStudioState(config), config);

const styleOf = (config: CardModCardConfig): Record<string, unknown> =>
  config.card_mod?.style as unknown as Record<string, unknown>;

describe('v0.10 dict-form: parse → edit → save', () => {
  it("'.'-only dict stays dict-form and is editable", () => {
    const config = {
      type: 'markdown',
      card_mod: { style: { '.': 'ha-card {\n  clip-path: circle(40%);\n}' } },
    } as unknown as CardModCardConfig;
    const state = buildMergedStudioState(config);
    expect(state.dictSource).toEqual({ entries: [], rootIndex: 0 });
    expect(state.advanced.rawCss).toContain('clip-path');

    const next = applyStudioState(state, config);
    expect(typeof next.card_mod?.style).not.toBe('string');
    expect(String(styleOf(next)['.'])).toContain('clip-path: circle(40%)');
  });

  it("editing a dict card updates only '.' — pierced entry bytes and key order survive", () => {
    const pierced = 'text.value-text {\n  font-size: 30px;\n}';
    const config = {
      type: 'gauge',
      entity: 'sensor.t',
      card_mod: { style: { 'ha-gauge$': pierced, '.': 'ha-card {\n  clip-path: circle(40%);\n}' } },
    } as unknown as CardModCardConfig;

    const state = buildMergedStudioState(config);
    const edited = { ...state, advanced: { ...state.advanced, rawCss: 'ha-card {\n  clip-path: ellipse(30% 40%);\n}' } };
    const next = applyStudioState(edited, config);

    // '.' keeps its ORIGINAL position (index 1), pierced entry byte-identical.
    expect(Object.keys(styleOf(next))).toEqual(['ha-gauge$', '.']);
    expect(styleOf(next)['ha-gauge$']).toBe(pierced);
    expect(String(styleOf(next)['.'])).toContain('ellipse(30% 40%)');
    expect(String(styleOf(next)['.'])).not.toContain('circle');
  });

  it('no-edit open+save is byte-stable once normalised (save → reopen → save)', () => {
    const config = {
      type: 'gauge',
      entity: 'sensor.t',
      card_mod: {
        style: {
          '.': 'ha-card {\n  clip-path: circle(40%);\n}',
          'ha-gauge$': 'text.value-text {\n  font-size: 30px;\n}',
        },
      },
    } as unknown as CardModCardConfig;
    const save1 = openSave(config);
    const save2 = openSave(save1);
    expect(JSON.stringify(save2.card_mod?.style)).toBe(JSON.stringify(save1.card_mod?.style));
  });

  it("legacy flat dict (no '.') is untouched by a no-op save, and an edit inserts '.' FIRST", () => {
    const style = {
      'ha-card': 'border-radius: 12px;',
      'ha-state-icon': 'color: red;',
    };
    const config = { type: 'button', card_mod: { style } } as unknown as CardModCardConfig;

    // No modules set, nothing generated → dict byte-identical, still no '.'.
    const noop = openSave(config);
    expect(JSON.stringify(noop.card_mod?.style)).toBe(JSON.stringify(style));

    // An edit gains a '.' at index 0 (rootIndex was null), rest verbatim after.
    const state = buildMergedStudioState(config);
    const edited = { ...state, advanced: { ...state.advanced, rawCss: 'ha-card { color: purple; }' } };
    const next = applyStudioState(edited, config);
    expect(Object.keys(styleOf(next))).toEqual(['.', 'ha-card', 'ha-state-icon']);
    expect(styleOf(next)['ha-card']).toBe('border-radius: 12px;');
    expect(String(styleOf(next)['.'])).toContain('purple');
  });

  it('3-deep nested dict values are preserved by deep equality including inner key order', () => {
    const style = {
      'ha-state-control-climate-temperature$': {
        'ha-big-number$': { '.': '.value { font-size: 30px; }' },
      },
      '.': 'ha-card {\n  clip-path: circle(40%);\n}',
    };
    const config = { type: 'thermostat', entity: 'climate.x', card_mod: { style } } as unknown as CardModCardConfig;
    const next = openSave(config);
    expect(JSON.stringify(styleOf(next)['ha-state-control-climate-temperature$'])).toBe(
      JSON.stringify(style['ha-state-control-climate-temperature$']),
    );
  });

  it("clearing everything drops '.' but keeps the pierced entries", () => {
    const config = {
      type: 'gauge',
      card_mod: { style: { '.': 'x', 'ha-gauge$': 'text { fill: blue; }' } },
    } as unknown as CardModCardConfig;
    const next = applyCardModStyle('', config, 'card_mod', {
      entries: [{ key: 'ha-gauge$', value: 'text { fill: blue; }' }],
      rootIndex: 0,
    });
    expect(styleOf(next)).toEqual({ 'ha-gauge$': 'text { fill: blue; }' });
  });

  it("clearing a '.'-only dict clears the style key entirely (same as the string path)", () => {
    const config = {
      type: 'markdown',
      card_mod: { style: { '.': 'ha-card { color: red; }' } },
    } as unknown as CardModCardConfig;
    const next = applyCardModStyle('', config, 'card_mod', { entries: [], rootIndex: 0 });
    expect(next.card_mod).toBeUndefined();
  });

  it('uix-keyed dict saves rebuild uix.style the same way', () => {
    const config = {
      type: 'gauge',
      uix: { style: { '.': 'old', 'ha-gauge$': 'text { fill: blue; }' } },
    } as unknown as CardModCardConfig;
    const next = applyCardModStyle('ha-card { color: red; }', config, 'uix', {
      entries: [{ key: 'ha-gauge$', value: 'text { fill: blue; }' }],
      rootIndex: 0,
    });
    expect(next.uix?.style).toEqual({ '.': 'ha-card { color: red; }', 'ha-gauge$': 'text { fill: blue; }' });
    expect(Object.keys(next.uix?.style as object)).toEqual(['.', 'ha-gauge$']);
  });

  it('plain string cards never gain a dict carrier or dict output', () => {
    const config = {
      type: 'button',
      card_mod: { style: 'ha-card { text-transform: uppercase; }' },
    } as unknown as CardModCardConfig;
    const state = buildMergedStudioState(config);
    expect(state.dictSource).toBeUndefined();
    const next = applyStudioState(state, config);
    expect(typeof next.card_mod?.style).toBe('string');
  });
});

describe('v0.10 dict-form: mixed-form still freezes', () => {
  it('active string + dict-form uix secondary → both keys preserved verbatim', () => {
    const uixStyle = { 'ha-gauge$': 'text { fill: blue; }' };
    const config = {
      type: 'gauge',
      card_mod: { style: 'ha-card {\n  color: red;\n}' },
      uix: { style: uixStyle },
    } as unknown as CardModCardConfig;
    const state = buildMergedStudioState(config);
    expect(state.dictSource).toBeUndefined();
    const next = applyStudioState(state, config);
    expect(next.card_mod?.style).toBe('ha-card {\n  color: red;\n}');
    expect(next.uix?.style).toEqual(uixStyle);
  });

  it('dict under BOTH keys → frozen (consolidating would drop the secondary\'s pierced entries)', () => {
    const cardModStyle = { '.': 'ha-card { color: red; }', 'a$': 'x' };
    const uixStyle = { 'b$': 'y' };
    const config = {
      type: 'gauge',
      card_mod: { style: cardModStyle },
      uix: { style: uixStyle },
    } as unknown as CardModCardConfig;
    const state = buildMergedStudioState(config);
    expect(state.dictSource).toBeUndefined();
    const next = applyStudioState(state, config);
    expect(next.card_mod?.style).toEqual(cardModStyle);
    expect(next.uix?.style).toEqual(uixStyle);
  });
});

describe('v0.10 dict-form: entities rows', () => {
  const rowConfig = (rows: unknown[]): CardModCardConfig =>
    ({ type: 'entities', entities: rows } as unknown as CardModCardConfig);

  it("a dict row's '.' entry parses into row state with the carrier attached", () => {
    const config = rowConfig([
      { entity: 'light.a', card_mod: { style: { '.': ':host {\n  color: red;\n}', 'div$': 'x { y: z; }' } } },
    ]);
    const styles = initEntityRowStyles(config);
    const row = styles[rowStyleKey(0)];
    expect(row.textColor).toBe('red');
    expect(row.dictSource).toEqual({ entries: [{ key: 'div$', value: 'x { y: z; }' }], rootIndex: 0 });
  });

  it("editing a dict row rebuilds '.' and keeps pierced entries verbatim", () => {
    const config = rowConfig([
      { entity: 'light.a', card_mod: { style: { '.': ':host {\n  color: red;\n}', 'div$': 'x { y: z; }' } } },
    ]);
    const styles = initEntityRowStyles(config);
    const edited = { ...styles, [rowStyleKey(0)]: { ...styles[rowStyleKey(0)], textColor: 'blue' } };
    const next = applyEntityRowStyles(config, edited) as unknown as { entities: EntitiesCardRow[] };
    const rowStyle = next.entities[0].card_mod?.style as unknown as Record<string, string>;
    expect(Object.keys(rowStyle)).toEqual(['.', 'div$']);
    expect(rowStyle['div$']).toBe('x { y: z; }');
    expect(rowStyle['.']).toContain('color: blue');
  });

  it("clearing a dict row's studio styling drops '.' but keeps the pierced entries", () => {
    const config = rowConfig([
      { entity: 'light.a', card_mod: { style: { '.': ':host {\n  color: red;\n}', 'div$': 'x { y: z; }' } } },
    ]);
    const styles = initEntityRowStyles(config);
    const cleared = { ...styles, [rowStyleKey(0)]: { ...styles[rowStyleKey(0)], textColor: '' } };
    const next = applyEntityRowStyles(config, cleared) as unknown as { entities: EntitiesCardRow[] };
    expect(next.entities[0].card_mod?.style).toEqual({ 'div$': 'x { y: z; }' });
  });

  it('a mixed-form row (string + dict across keys) is left completely untouched', () => {
    const original = {
      entity: 'light.a',
      card_mod: { style: ':host { color: red; }' },
      uix: { style: { 'div$': 'x' } },
    };
    const config = rowConfig([original]);
    const styles = initEntityRowStyles(config);
    expect(styles[rowStyleKey(0)].dictSource).toBeUndefined();
    const next = applyEntityRowStyles(config, styles) as unknown as { entities: EntitiesCardRow[] };
    expect(next.entities[0]).toBe(original);
  });

  it('string rows are unaffected — no carrier, string output', () => {
    const config = rowConfig([{ entity: 'light.a', card_mod: { style: ':host { color: red; }' } }]);
    const styles = initEntityRowStyles(config);
    expect(styles[rowStyleKey(0)].dictSource).toBeUndefined();
    const next = applyEntityRowStyles(config, styles) as unknown as { entities: EntitiesCardRow[] };
    expect(typeof next.entities[0].card_mod?.style).toBe('string');
  });
});

describe('v0.10 dict-form: UIX-only selector detection ($$ / &)', () => {
  it('flags $$ express selectors and &-prefixed host filters, at any depth', () => {
    expect(dictUsesUixOnlySelectors({ '$$ ha-icon': 'color: red;' })).toBe(true);
    expect(dictUsesUixOnlySelectors({ '&.on': 'color: red;' })).toBe(true);
    expect(dictUsesUixOnlySelectors({ 'ha-card$': { '&state': 'x' } })).toBe(true);
  });

  it('does NOT flag the shared single-$ pierce syntax or plain keys', () => {
    expect(dictUsesUixOnlySelectors({ 'ha-gauge$': 'text { fill: blue; }' })).toBe(false);
    expect(dictUsesUixOnlySelectors({ '.': 'ha-card { color: red; }', 'ha-card $': 'h1 {}' })).toBe(false);
    expect(dictUsesUixOnlySelectors('a string style')).toBe(false);
  });

  it('usesUixOnlyFeaturesInBlock covers dict styles with UIX-only selectors', () => {
    expect(usesUixOnlyFeaturesInBlock({ style: { '$$ x': 'y' } } as never)).toBe(true);
    expect(usesUixOnlyFeaturesInBlock({ style: { 'ha-gauge$': 'y' } } as never)).toBe(false);
    expect(usesUixOnlyFeaturesInBlock({ style: 'plain' } as never)).toBe(false);
  });
});

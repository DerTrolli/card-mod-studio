/**
 * v0.10.0 audit — dict-form / dual-key save-path regressions, on the REAL
 * open → edit → save pipeline (buildMergedStudioState → applyStudioState).
 */
import { describe, it, expect, afterEach } from 'vitest';
import type { CardModCardConfig, StudioState } from '../src/types/index.js';
import { buildMergedStudioState, applyStudioState } from '../src/editor/studio-state.js';
import { applyCardModStyle } from '../src/generator/yaml-generator.js';
import { hasDictFormStyle } from '../src/utils/style-compat.js';
import { installEngines, restoreEngines, cfg } from './v010-audit-helpers.js';

afterEach(() => restoreEngines());

const withRaw = (s: StudioState, rawCss: string): StudioState => ({ ...s, advanced: { rawCss } });
const edit = (config: CardModCardConfig, rawCss: string) =>
  applyStudioState(withRaw(buildMergedStudioState(config), rawCss), config);

const MACRO_UIX = { macros: { m: { template: 'x' } }, style: 'ha-card { {{ m() }} }' };

describe('audit #4 — a macro/billet/theme-driven uix.style is never deleted by a card_mod-targeted save', () => {
  it('dict card_mod + uix { macros, style }: an edit keeps uix.style', () => {
    installEngines(['card-mod', 'uix']);
    const config = cfg({
      type: 'tile', entity: 'light.a',
      card_mod: { style: { '.': 'ha-card { color: red; }', 'ha-tile-icon$': 'x { y: z; }' } },
      uix: MACRO_UIX,
    });
    const next = edit(config, 'ha-card { color: blue; }');
    expect(next.uix).toEqual(MACRO_UIX);
    expect(String((next.card_mod?.style as unknown as Record<string, string>)['.'])).toContain('blue');
  });

  it('string card_mod + uix { macros, style }: CLEARING all Studio styling keeps uix.style', () => {
    installEngines(['card-mod', 'uix']);
    const config = cfg({ type: 'tile', entity: 'light.a', card_mod: { style: 'ha-card {\n  border-radius: 5px;\n}' }, uix: MACRO_UIX });
    const s = buildMergedStudioState(config);
    const next = applyStudioState({ ...s, border: { ...s.border, enabled: false } }, config);
    expect(next.card_mod).toBeUndefined();
    expect(next.uix).toEqual(MACRO_UIX);
  });

  it('dict clear path (only `.` left, cleared) keeps it too', () => {
    const config = cfg({ type: 'tile', card_mod: { style: { '.': 'ha-card { color: red; }' } }, uix: { theme: 'x', style: 'ha-card { color: green; }' } });
    const next = applyCardModStyle('', config, 'card_mod', { entries: [], rootIndex: 0 });
    expect(next.card_mod).toBeUndefined();
    expect(next.uix).toEqual({ theme: 'x', style: 'ha-card { color: green; }' });
  });

  it('control: with uix as the TARGET (UIX-only install) clearing still clears uix.style', () => {
    const config = cfg({ type: 'tile', uix: MACRO_UIX });
    expect(applyCardModStyle('', config, 'uix').uix).toEqual({ macros: MACRO_UIX.macros });
  });
});

describe('audit #6 — a dict that is the card\'s ONLY style is editable whichever key holds it', () => {
  const dict = { '.': 'ha-card { color: red; }', 'ha-gauge$': 'text { fill: blue; }' };

  it('card-mod active, only uix.style is a (portable) dict → parsed, then consolidated into card_mod', () => {
    installEngines(['card-mod', 'uix']);
    const config = cfg({ type: 'gauge', entity: 'sensor.t', uix: { style: dict } });
    const state = buildMergedStudioState(config);
    expect(state.dictSource).toBeDefined();
    expect(state.advanced.rawCss).toContain('red');
    const next = applyStudioState(withRaw(state, 'ha-card { color: green; }'), config);
    expect(next.card_mod?.style).toEqual({ '.': 'ha-card { color: green; }', 'ha-gauge$': 'text { fill: blue; }' });
    expect(next.uix).toBeUndefined();
  });

  it('UIX-only install, only card_mod.style is a dict → renamed to uix (mirrors strings)', () => {
    installEngines(['uix']);
    const config = cfg({ type: 'gauge', entity: 'sensor.t', card_mod: { style: dict, class: 'k' } });
    const next = edit(config, 'ha-card { color: green; }');
    expect(next.uix?.style).toEqual({ '.': 'ha-card { color: green; }', 'ha-gauge$': 'text { fill: blue; }' });
    expect(next.card_mod).toEqual({ class: 'k' });
  });

  it('a uix dict with UIX-only $$ keys stays under uix: (card-mod active)', () => {
    installEngines(['card-mod', 'uix']);
    const uixDict = { '.': 'ha-card { color: red; }', '$$ ha-state-icon': 'color: red;' };
    const config = cfg({ type: 'tile', entity: 'light.a', uix: { style: uixDict } });
    const next = edit(config, 'ha-card { color: green; }');
    expect(next.uix?.style).toEqual({ '.': 'ha-card { color: green; }', '$$ ha-state-icon': 'color: red;' });
    expect(next.card_mod).toBeUndefined();
  });

  it('a uix dict next to macros/billets/theme stays under uix: (card-mod active)', () => {
    installEngines(['card-mod', 'uix']);
    const config = cfg({ type: 'gauge', entity: 'sensor.t', uix: { style: dict, billets: { a: 'b' } } });
    const next = edit(config, 'ha-card { color: green; }');
    expect(next.uix).toEqual({ billets: { a: 'b' }, style: { '.': 'ha-card { color: green; }', 'ha-gauge$': 'text { fill: blue; }' } });
    expect(next.card_mod).toBeUndefined();
  });

  it('the same dict under BOTH keys (what "Copy to card_mod" produces) is one editable dict; the duplicate is cleared', () => {
    installEngines(['card-mod']);
    const config = cfg({ type: 'gauge', entity: 'sensor.t', uix: { style: dict }, card_mod: { style: { ...dict } } });
    const state = buildMergedStudioState(config);
    expect(state.dictSource).toBeDefined();
    const next = applyStudioState(withRaw(state, 'ha-card { color: green; }'), config);
    expect(next.card_mod?.style).toEqual({ '.': 'ha-card { color: green; }', 'ha-gauge$': 'text { fill: blue; }' });
    expect(next.uix).toBeUndefined();
  });

  it('control: DIFFERENT dicts under both keys still freeze (mixed-form)', () => {
    installEngines(['card-mod']);
    const config = cfg({ type: 'gauge', card_mod: { style: { '.': 'a {}', 'x$': '1' } }, uix: { style: { 'y$': '2' } } });
    const state = buildMergedStudioState(config);
    expect(state.dictSource).toBeUndefined();
    expect(applyStudioState(state, config)).toEqual(config);
  });

  it('control: string primary + dict secondary still freezes (mixed-form)', () => {
    installEngines(['card-mod']);
    const config = cfg({ type: 'gauge', card_mod: { style: 'ha-card { color: red; }' }, uix: { style: { 'y$': '2' } } });
    expect(buildMergedStudioState(config).dictSource).toBeUndefined();
    expect(edit(config, 'ha-card { color: blue; }')).toEqual(config);
  });
});

describe('audit #14 — an empty `style: {}` is no content', () => {
  it('card_mod string + uix.style {} → the edit is saved and the empty dict dropped', () => {
    installEngines(['card-mod']);
    const config = cfg({ type: 'tile', entity: 'light.a', card_mod: { style: 'ha-card { color: red; }' }, uix: { style: {} } });
    const next = edit(config, 'ha-card { color: blue; }');
    expect(next.card_mod?.style).toBe('ha-card { color: blue; }');
    expect(next.uix).toBeUndefined();
  });

  it('only uix.style {} → an edit writes a normal string style', () => {
    installEngines(['card-mod']);
    const next = edit(cfg({ type: 'tile', entity: 'light.a', uix: { style: {} } }), 'ha-card { color: blue; }');
    expect(next.card_mod?.style).toBe('ha-card { color: blue; }');
  });

  it('only card_mod.style {} → no dict carrier, plain string output', () => {
    installEngines(['card-mod']);
    const config = cfg({ type: 'tile', entity: 'light.a', card_mod: { style: {} } });
    expect(buildMergedStudioState(config).dictSource).toBeUndefined();
    expect(edit(config, 'ha-card { color: blue; }').card_mod?.style).toBe('ha-card { color: blue; }');
  });

  it('hasDictFormStyle ignores empty dicts', () => {
    expect(hasDictFormStyle({ card_mod: { style: {} }, uix: { style: {} } })).toBe(false);
    expect(hasDictFormStyle({ uix: { style: { 'a$': 'b' } } })).toBe(true);
  });
});

describe('audit #16 — a `.` entry that isn\'t a CSS string freezes the card (no silent edit loss)', () => {
  it.each([{ 'ha-card$': 'x {}' }, null, 5])('`.`: %j → no carrier; the save preserves the dict untouched', (root) => {
    installEngines(['card-mod']);
    const config = cfg({ type: 'tile', entity: 'light.a', card_mod: { style: { '.': root, 'a$': 'b' } } });
    const state = buildMergedStudioState(config);
    // No carrier + dict content → the panel shows its preserved-as-is gate.
    expect(state.dictSource).toBeUndefined();
    expect(hasDictFormStyle(config)).toBe(true);
    expect(applyStudioState(withRaw(state, 'ha-card { color: blue; }'), config)).toEqual(config);
  });
});

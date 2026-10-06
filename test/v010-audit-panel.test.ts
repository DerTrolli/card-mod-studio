/**
 * v0.10.0 audit — panel / component regressions, driven through the REAL
 * Lit classes (Lit's node build + ssr-dom-shim; nothing is rendered to a
 * DOM — private handlers are called directly, emitted `config-changed`
 * events captured, and returned templates flattened to text).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { CardModCardConfig, EntitiesRowStyles, StudioState } from '../src/types/index.js';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

type PanelT = {
  config?: CardModCardConfig;
  _studioState: StudioState | null;
  _presets: Array<{ name: string; state: StudioState }>;
  _cardModPresent: boolean;
  _uixPresent: boolean;
  _initState(): void;
  _emitConfigChanged(): void;
  _copyUixStyleToCardMod(): void;
  _saveCurrentAsPreset(): void;
  _presetName: string;
  _onPresetSelect(e: Event): void;
  _renderModuleList(s: StudioState): unknown;
  _renderCompatBanner(): unknown;
  dispatchEvent(e: Event): boolean;
};
type ChildT = {
  childConfig?: CardModCardConfig;
  willUpdate(m: Map<PropertyKey, unknown>): void;
  _renderBody(): unknown;
};
type RowsT = { rows: unknown[]; styles: EntitiesRowStyles; _openRows: Set<string>; render(): unknown };

let Panel: new () => PanelT;
let Child: new () => ChildT;
let Rows: new () => RowsT;
let initEntityRowStyles: (c: CardModCardConfig) => EntitiesRowStyles;
beforeAll(async () => {
  await import('../src/editor/cms-panel.js');
  ({ initEntityRowStyles } = await import('../src/editor/studio-state.js'));
  Panel = registry.get('cms-panel') as new () => PanelT;
  Child = registry.get('cms-child-card-section') as new () => ChildT;
  Rows = registry.get('cms-entities-rows-module') as new () => RowsT;
});

function makePanel(config: unknown) {
  const p = new Panel();
  const emitted: CardModCardConfig[] = [];
  p.dispatchEvent = (e: Event) => { emitted.push((e as CustomEvent).detail.config); return true; };
  p.config = config as CardModCardConfig;
  p._initState();
  return { p, emitted, last: () => emitted.at(-1) as unknown as Record<string, any> };
}
const moduleListText = (p: PanelT) => templateText(p._renderModuleList(p._studioState!));
const selectPreset = (p: PanelT, name: string) => p._onPresetSelect({ target: { value: name } } as unknown as Event);

const DICT_CARD = {
  type: 'tile', entity: 'light.a',
  card_mod: { style: { '.': 'ha-card { color: red; }', 'ha-tile-icon$': 'x { y: z; }' } },
};

describe('harness sanity (controls)', () => {
  it('a plain dict card opens editable — no preserved-as-is gate', () => {
    expect(moduleListText(makePanel(DICT_CARD).p)).not.toContain('Mixed-form');
  });
  it('a genuinely mixed-form card does show the gate', () => {
    const { p } = makePanel({ type: 'tile', card_mod: { style: 'ha-card { color: red; }' }, uix: { style: { 'x$': 'y {}' } } });
    expect(moduleListText(p)).toContain('Mixed-form');
  });
});

describe('audit #8 — presets on dict-form cards', () => {
  it('a stored preset (no carrier) is applied to a dict card, pierced entries kept, no false gate', () => {
    const { p, last } = makePanel(DICT_CARD);
    const { dictSource: _d, ...stored } = p._studioState!;
    p._presets = [{ name: 'round', state: { ...stored, border: { enabled: true, radiusPx: 22, borderWidth: 0, borderColor: '' } } as StudioState }];
    selectPreset(p, 'round');
    expect(last().card_mod.style['.']).toContain('border-radius: 22px');
    expect(last().card_mod.style['ha-tile-icon$']).toBe('x { y: z; }');
    expect(moduleListText(p)).not.toContain('Mixed-form');
  });

  it('saving a preset never stores the card\'s dict carrier', () => {
    const { p } = makePanel(DICT_CARD);
    p._presetName = '  mine ';
    p._saveCurrentAsPreset();
    expect(p._presets.at(-1)!.name).toBe('mine');
    expect(p._presets.at(-1)!.state.dictSource).toBeUndefined();
  });

  it('a preset carrying a stale carrier (pre-fix in-memory preset) never restores old pierced entries', () => {
    const v1 = { type: 'gauge', entity: 'sensor.t', card_mod: { style: { '.': 'ha-card { color: red; }', 'ha-gauge$': 'text { fill: OLD; }' } } };
    const { p, last } = makePanel(v1);
    p._presets = [{ name: 'stale', state: { ...p._studioState! } }];
    p.config = { type: 'gauge', entity: 'sensor.t', card_mod: { style: { '.': 'ha-card { color: red; }', 'ha-gauge$': 'text { fill: NEW; }' } } } as unknown as CardModCardConfig;
    p._initState();
    selectPreset(p, 'stale');
    expect(last().card_mod.style['ha-gauge$']).toBe('text { fill: NEW; }');
  });

  it('…nor carries card A\'s pierced entries onto a string card B', () => {
    const { p: a } = makePanel({ type: 'gauge', entity: 'sensor.a', card_mod: { style: { '.': 'ha-card { color: red; }', 'ha-gauge$': 'A-ONLY {}' } } });
    const { p: b, last } = makePanel({ type: 'gauge', entity: 'sensor.b', card_mod: { style: 'ha-card { color: green; }' } });
    b._presets = [{ name: 'fromA', state: { ...a._studioState! } }];
    selectPreset(b, 'fromA');
    expect(JSON.stringify(last())).not.toContain('A-ONLY');
    expect(typeof last().card_mod.style).toBe('string');
  });
});

describe('audit #13 — "Copy to card_mod" keeps card_mod class:/debug:', () => {
  it('card level', () => {
    const { p, last } = makePanel({ type: 'tile', entity: 'light.a', card_mod: { class: 'my-class', debug: true }, uix: { style: 'ha-card { color: red; }' } });
    p._copyUixStyleToCardMod();
    expect(last().card_mod).toEqual({ class: 'my-class', debug: true, style: 'ha-card { color: red; }' });
    expect(last().uix).toEqual({ style: 'ha-card { color: red; }' });
  });

  it('row level (and a null row is skipped, not crashed on)', () => {
    const { p, last } = makePanel({
      type: 'entities',
      entities: [null, { entity: 'light.a', card_mod: { class: 'row-class' }, uix: { style: ':host { color: red; }' } }],
    });
    p._copyUixStyleToCardMod();
    expect(last().entities[0]).toBeNull();
    expect(last().entities[1].card_mod).toEqual({ class: 'row-class', style: ':host { color: red; }' });
  });
});

describe('audit #18 — a row\'s UIX-only $$/& dict suppresses the "Copy to card_mod" offer', () => {
  const banner = (config: unknown) => {
    const { p } = makePanel(config);
    p._cardModPresent = true;
    p._uixPresent = false;
    return templateText(p._renderCompatBanner());
  };
  it('row uix dict with $$ → UIX-only warning, no copy button', () => {
    const text = banner({ type: 'entities', entities: [{ entity: 'light.a', uix: { style: { '$$ ha-state-icon': 'color: red;' } } }] });
    expect(text).not.toContain('Copy to card_mod');
    expect(text).toContain('UIX-only features');
  });
  it('control: a portable uix-only row still gets the copy offer', () => {
    expect(banner({ type: 'entities', entities: [{ entity: 'light.a', uix: { style: ':host { color: red; }' } }] })).toContain('Copy to card_mod');
  });
});

describe('audit #9 — frozen rows show a lock note instead of live controls', () => {
  const rowsText = (rows: unknown[]) => {
    const config = { type: 'entities', entities: rows } as unknown as CardModCardConfig;
    const m = new Rows();
    m.rows = rows;
    m.styles = initEntityRowStyles(config);
    m._openRows = new Set(rows.map((_, i) => String(i)));
    return templateText(m.render());
  };
  it('mixed-form row → frozen-note, no color controls', () => {
    const text = rowsText([{ entity: 'light.a', card_mod: { style: ':host { color: red; }' }, uix: { style: { 'div$': 'x {}' } } }]);
    expect(text).toContain('frozen-note');
    expect(text).not.toContain('Icon color');
  });
  it('control: a normal row keeps its controls', () => {
    const text = rowsText([{ entity: 'light.a', card_mod: { style: ':host { color: red; }' } }]);
    expect(text).toContain('Icon color');
    expect(text).not.toContain('frozen-note');
  });
  it('a null row does not crash the rows module (audit #20)', () => {
    expect(() => rowsText([null, { entity: 'light.a' }])).not.toThrow();
  });
});

describe('audit #17 — stack child with mixed-form style keeps its rows editable', () => {
  it('child section renders the rows module under the preserved-as-is note', () => {
    const c = new Child();
    c.childConfig = {
      type: 'entities',
      card_mod: { style: 'ha-card { color: red; }' },
      uix: { style: { 'x$': 'y {}' } },
      entities: [{ entity: 'light.a', card_mod: { style: ':host { color: red; }' } }],
    } as unknown as CardModCardConfig;
    c.willUpdate(new Map([['childConfig', undefined]]));
    const text = templateText(c._renderBody());
    expect(text).toContain('Mixed-form');
    expect(text).toContain('cms-entities-rows-module');
  });
});

describe('audits #6 / #4 / #16 at the panel level', () => {
  it('#6: only uix.style is a dict (card-mod active) → editable, no false "Mixed-form" gate', () => {
    const { p } = makePanel({ type: 'gauge', entity: 'sensor.t', uix: { style: { '.': 'ha-card { color: red; }', 'ha-gauge$': 'text {}' } } });
    expect(p._studioState!.dictSource).toBeDefined();
    expect(moduleListText(p)).not.toContain('Mixed-form');
  });

  it('#4: the coexist banner\'s promise holds — an edit keeps the macro-driven uix.style', () => {
    const uix = { macros: { m: { template: 'x' } }, style: 'ha-card { {{ m() }} }' };
    const { p, last } = makePanel({ ...DICT_CARD, uix });
    p._cardModPresent = true;
    expect(templateText(p._renderCompatBanner())).toContain('UIX will keep');
    p._studioState = { ...p._studioState!, border: { enabled: true, radiusPx: 5, borderWidth: 0, borderColor: '' } };
    p._emitConfigChanged();
    expect(last().uix).toEqual(uix);
  });

  it('#16: a non-string `.` shows the preserved-as-is gate (never silently editable)', () => {
    const { p } = makePanel({ type: 'tile', entity: 'light.a', card_mod: { style: { '.': { 'x$': 'y' } } } });
    expect(moduleListText(p)).toContain('preserved as-is');
  });
});

describe('config-changed carries guiModeAvailable (HA disables "Show code editor" without it)', () => {
  it('is sent on every emit — also when the config comes out identical', () => {
    const p = new Panel();
    const details: Array<{ config: unknown; guiModeAvailable?: boolean }> = [];
    p.dispatchEvent = (e: Event) => { details.push((e as CustomEvent).detail); return true; };
    p.config = { type: 'heading', heading: 'Living room' } as unknown as CardModCardConfig;
    p._initState();
    // Visual Filters switched on at its defaults emits no CSS → identical config.
    p._studioState = { ...p._studioState!, filter: { ...p._studioState!.filter, enabled: true } };
    p._emitConfigChanged();
    expect(details.at(-1)!.config).toEqual({ type: 'heading', heading: 'Living room' });
    expect(details.at(-1)!.guiModeAvailable).toBe(true);
  });
});

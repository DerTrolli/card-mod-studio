/**
 * Number size / Temperature size is written only while the Font module is on,
 * and a stored Studio-owned entry switches Font on when loaded. Driven through
 * the load/save functions the panel uses and the rendered switch handlers.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import type { CardModCardConfig, FontModuleState, StudioState } from '../src/types/index.js';
import { buildMergedStudioState, applyStudioState, refreshCarrier } from '../src/editor/studio-state.js';
import { DEFAULT_FONT } from '../src/parser/state-mapper.js';
import { ownedEntryFor, withCardNumberSize, userEntries } from '../src/utils/owned-entries.js';

const reg = new FakeCustomElementRegistry();
let engine: 'card-mod' | 'uix' = 'card-mod';
let saved: unknown;
beforeEach(() => {
  saved = (globalThis as { customElements?: unknown }).customElements;
  const r = new FakeCustomElementRegistry();
  r.define(engine === 'uix' ? 'uix-node' : 'card-mod', class {});
  (globalThis as { customElements: unknown }).customElements = r;
});
afterEach(() => { (globalThis as { customElements: unknown }).customElements = saved; engine = 'card-mod'; });

// the module element, for the rendered-handler tests
type El = { state: FontModuleState; _renderNumberSize(k: string): unknown; dispatchEvent(e: Event): boolean };
let Mod: new () => El;
beforeAll(async () => {
  const prev = (globalThis as { customElements?: unknown }).customElements;
  (globalThis as { customElements: unknown }).customElements = reg;
  reg.define('card-mod', class {});
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
  (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
    constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
  await import('../src/modules/module-font.js');
  Mod = reg.get('cms-font-module') as new () => El;
  (globalThis as { customElements: unknown }).customElements = prev;
});
const handlers = (t: unknown): Array<(e: unknown) => void> => {
  if (typeof t === 'function') return [t as (e: unknown) => void];
  if (Array.isArray(t)) return t.flatMap(handlers);
  const v = (t as { values?: unknown[] } | null)?.values;
  return v ? v.flatMap(handlers) : [];
};

const cfg = (c: Record<string, unknown>) => c as unknown as CardModCardConfig;
const G = ownedEntryFor('gauge', 120)!.value as string;
const GK = 'ha-gauge$';
const T = ownedEntryFor('thermostat', 30)!.value as Record<string, string>;
const TK = 'ha-state-control-climate-temperature$';
const styleOf = (c: CardModCardConfig, key: 'card_mod' | 'uix' = 'card_mod') => (c[key] as { style?: unknown } | undefined)?.style;

function session(config: CardModCardConfig, ...edits: Array<(s: StudioState) => StudioState>): CardModCardConfig {
  let state = buildMergedStudioState(config);
  let cur = config;
  for (const e of edits) { state = e(state); cur = applyStudioState(state, cur); state = refreshCarrier(state, cur); }
  return cur;
}
const font = (f: Partial<FontModuleState>) => (s: StudioState): StudioState => ({ ...s, font: { ...s.font, ...f } });
const fontOn = font({ enabled: true });
const fontOff = font({ enabled: false });
const nsOn = (px: number) => font({ numberSizeEnabled: true, numberSize: px, enabled: true });
const bg = (s: StudioState): StudioState => ({ ...s, background: { ...s.background, enabled: true, type: 'solid', color1: '#010203', applyWhen: 'always' } });
const bgOff = (s: StudioState): StudioState => ({ ...s, background: { ...s.background, enabled: false } });

const CARDS = [
  { name: 'gauge', type: 'gauge', px: 120, key: GK, value: G as unknown },
  { name: 'thermostat', type: 'thermostat', px: 30, key: TK, value: T as unknown },
];

for (const c of CARDS) {
  describe(`${c.name}: Number size follows the Font switch`, () => {
    const base = () => cfg({ type: c.type, entity: 'x.y' });

    it('Font on + Number size on writes the entry; Font off removes it (no style key left); Font on again brings it back', () => {
      const on = session(base(), nsOn(c.px));
      expect(styleOf(on)).toEqual({ [c.key]: c.value });
      const off = session(on, fontOff);
      expect(styleOf(off)).toBeUndefined();
      // same panel session: off then on again keeps the value
      const back = session(base(), nsOn(c.px), fontOff, fontOn);
      expect(styleOf(back)).toEqual({ [c.key]: c.value });
    });

    it('reopened after save with Font off: nothing stored, Font and Number size off', () => {
      const off = session(base(), nsOn(c.px), fontOff);
      const st = buildMergedStudioState(off);
      expect(st.font.enabled).toBe(false);
      expect(st.font.numberSizeEnabled).toBe(false);
    });

    it('a stored style with only the entry loads with Font on and Number size on, and saves byte-identical', () => {
      const config = cfg({ type: c.type, entity: 'x.y', card_mod: { style: { [c.key]: c.value } } });
      const st = buildMergedStudioState(config);
      expect(st.font).toMatchObject({ enabled: true, numberSizeEnabled: true, numberSize: c.px });
      expect(st.font.fontSize).toBeUndefined();
      expect(applyStudioState(st, config)).toEqual(config);
      expect(session(config, bg, bgOff)).toEqual(config);
    });

    it('with other pierced entries beside it: Font on, entries untouched, Font off drops only the owned one', () => {
      const dict = { 'hui-x$': 'p { margin: 0; }', [c.key]: c.value, '.': 'ha-card {\n  color: red;\n}' };
      const config = cfg({ type: c.type, entity: 'x.y', card_mod: { style: dict } });
      expect(buildMergedStudioState(config).font.enabled).toBe(true);
      expect(applyStudioState(buildMergedStudioState(config), config)).toEqual(config);
      const off = session(config, fontOff);
      expect(styleOf(off)).toEqual({ 'hui-x$': 'p { margin: 0; }', '.': 'ha-card {\n  color: red;\n}' });
    });

    it('under uix: as the active engine', () => {
      engine = 'uix';
      const r = new FakeCustomElementRegistry(); r.define('uix-node', class {});
      (globalThis as { customElements: unknown }).customElements = r;
      const on = session(base(), nsOn(c.px));
      expect(styleOf(on, 'uix')).toEqual({ [c.key]: c.value });
      const off = session(on, fontOff);
      expect(styleOf(off, 'uix')).toBeUndefined();
      const stored = cfg({ type: c.type, entity: 'x.y', uix: { style: { [c.key]: c.value } } });
      expect(buildMergedStudioState(stored).font.enabled).toBe(true);
      expect(applyStudioState(buildMergedStudioState(stored), stored)).toEqual(stored);
    });

    it('both engines: dict under the active key + a string with a real Font under the other — merge keeps both', () => {
      const config = cfg({
        type: c.type, entity: 'x.y',
        card_mod: { style: { '.': 'ha-card { color: red; }', [c.key]: c.value } },
        uix: { style: 'ha-card {\n  font-size: 20px;\n  font-weight: bold;\n  color: var(--primary-text-color);\n}' },
      });
      const st = buildMergedStudioState(config);
      expect(st.font).toMatchObject({ enabled: true, numberSizeEnabled: true });
      expect(st.font.fontSize).toBe(20);
      expect((styleOf(session(config, bg)) as Record<string, unknown>)[c.key]).toEqual(c.value);
    });

    it('both engines: dict with only the entry + a string without any Font — Font still on, entry kept', () => {
      const config = cfg({
        type: c.type, entity: 'x.y',
        card_mod: { style: { [c.key]: c.value } },
        uix: { style: 'ha-card {\n  border-radius: 8px;\n}' },
      });
      const st = buildMergedStudioState(config);
      expect(st.font).toMatchObject({ enabled: true, numberSizeEnabled: true });
      expect((styleOf(session(config, bg)) as Record<string, unknown>)[c.key]).toEqual(c.value);
    });

    it('a stack child behaves the same (the child path is the same load/save pair)', () => {
      const child = session(base(), nsOn(c.px));
      const reopened = buildMergedStudioState(child);
      expect(reopened.font.enabled).toBe(true);
      expect(applyStudioState(reopened, child)).toEqual(child);
      expect(styleOf(session(child, fontOff))).toBeUndefined();
    });
  });
}

describe('legacy beta shapes load with Font on', () => {
  const beta = (w: number, h: number, anchored: boolean) =>
    `.text {\n  max-width: ${w}% !important;\n  max-height: ${h}% !important;\n${anchored ? '  left: 0 !important;\n  right: 0 !important;\n  margin: 0 auto !important;\n  transform: none !important;\n' : ''}}`;
  for (const anchored of [true, false]) {
    it(`beta.${anchored ? 2 : 1} entry: Font on, upgraded on save, gone when Font is switched off`, () => {
      const config = cfg({ type: 'gauge', entity: 'x.y', card_mod: { style: { [GK]: beta(55, 40, anchored) } } });
      const st = buildMergedStudioState(config);
      expect(st.font).toMatchObject({ enabled: true, numberSizeEnabled: true, numberSize: 100 });
      expect((styleOf(applyStudioState(st, config)) as Record<string, string>)[GK]).toBe(ownedEntryFor('gauge', 100)!.value);
      expect(styleOf(session(config, fontOff))).toBeUndefined();
    });
  }
});

describe('a hand-written (locked) entry is never touched', () => {
  const cases = [
    { type: 'gauge', key: GK, value: '.text { max-width: 90%; }' as unknown },
    { type: 'thermostat', key: TK, value: { 'ha-big-number$': '.value { font-size: 12px; }' } as unknown },
  ];
  for (const c of cases) {
    it(`${c.type}: locked, byte-identical with Font off, on, and across toggles; loading does not flip Font`, () => {
      const config = cfg({ type: c.type, entity: 'x.y', card_mod: { style: { [c.key]: c.value } } });
      const st = buildMergedStudioState(config);
      expect(st.font.numberSizeLocked).toBe(true);
      expect(st.font.enabled).toBe(false);
      expect(userEntries(st.dictSource).map((e) => e.key)).toEqual([c.key]);
      expect(applyStudioState(st, config)).toEqual(config);
      expect(session(config, fontOn)).toEqual(config);
      expect(session(config, fontOn, fontOff)).toEqual(config);
      expect(session(config, nsOn(40))).toEqual(config);
      expect((styleOf(session(config, bg)) as Record<string, unknown>)[c.key]).toEqual(c.value);
    });
  }
});

describe('rendered Number size switch', () => {
  const make = (state: Partial<FontModuleState>) => {
    const el = new Mod();
    el.state = { ...DEFAULT_FONT, ...state };
    const emitted: FontModuleState[] = [];
    el.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail); return true; });
    return { el, emitted, hs: (k = 'gauge') => handlers(el._renderNumberSize(k)) };
  };
  const toggle = (h: (e: unknown) => void, checked: boolean) => h({ target: { checked } });

  it('switching Number size on while Font is off switches Font on in the same emit, and the save has the entry', () => {
    const { hs, emitted } = make({ enabled: false });
    toggle(hs()[0], true);
    expect(emitted[0]).toMatchObject({ enabled: true, numberSizeEnabled: true, numberSize: 100 });
    const config = cfg({ type: 'gauge', entity: 'x.y' });
    const out = applyStudioState({ ...buildMergedStudioState(config), font: emitted[0] }, config);
    expect(styleOf(out)).toEqual({ [GK]: ownedEntryFor('gauge', 100)!.value });
  });

  it('switching it off leaves Font as it was', () => {
    const { hs, emitted } = make({ enabled: true, numberSizeEnabled: true, numberSize: 80 });
    toggle(hs('thermostat')[0], false);
    expect(emitted[0]).toMatchObject({ enabled: true, numberSizeEnabled: false });
  });

  it('with Font off the switch shows off (nothing is written) although the state keeps the setting', () => {
    const { el } = make({ enabled: false, numberSizeEnabled: true, numberSize: 80 });
    const vals = (el._renderNumberSize('gauge') as { values: unknown[] }).values;
    expect(vals[1]).toBe(false); // .checked
  });
});

describe('presets and Number size', () => {
  const card: FontModuleState = { ...DEFAULT_FONT, enabled: true, numberSizeEnabled: true, numberSize: 80 };
  it("a preset with Font off keeps the card's own Number size: Font stays on with nothing else set", () => {
    const preset: FontModuleState = { ...DEFAULT_FONT, enabled: false, fontSize: 20, color: 'red' };
    const out = withCardNumberSize(preset, card);
    expect(out).toMatchObject({ enabled: true, numberSizeEnabled: true, numberSize: 80, fontFamily: '' });
    expect(out.fontSize).toBeUndefined();
    expect(out.color).toBeUndefined();
  });
  it("a preset with Font on keeps its own font and the card's Number size", () => {
    const preset: FontModuleState = { ...DEFAULT_FONT, enabled: true, fontSize: 20 };
    expect(withCardNumberSize(preset, card)).toMatchObject({ enabled: true, fontSize: 20, numberSizeEnabled: true, numberSize: 80 });
  });
  it("a card without Number size gets the preset's Font as is (off stays off)", () => {
    expect(withCardNumberSize({ ...DEFAULT_FONT, enabled: false }, { ...DEFAULT_FONT }).enabled).toBe(false);
  });
  it('a locked card keeps the lock and Font off', () => {
    const out = withCardNumberSize({ ...DEFAULT_FONT, enabled: false }, { ...DEFAULT_FONT, numberSizeLocked: true });
    expect(out).toMatchObject({ enabled: false, numberSizeLocked: true });
  });
});

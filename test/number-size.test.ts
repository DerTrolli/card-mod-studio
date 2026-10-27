/**
 * v0.11 Font → Number size: Studio-owned pierced entries through the real
 * editor pipeline (buildMergedStudioState → applyStudioState → refreshCarrier),
 * the one cms-panel and cms-child-card-section share. Contract:
 * docs/V0.11_PLAN.md C1.0.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { CardModCardConfig, StudioState } from '../src/types/index.js';
import { buildMergedStudioState, applyStudioState, refreshCarrier } from '../src/editor/studio-state.js';
import { filterPresetStateForCardType } from '../src/utils/preset-caps.js';
import { userEntries } from '../src/utils/owned-entries.js';

class FakeRegistry {
  private m = new Map<string, unknown>();
  define(n: string, c: unknown) { this.m.set(n, c); }
  get(n: string) { return this.m.get(n); }
}
let saved: unknown;
let engine: 'card-mod' | 'uix' = 'card-mod';
beforeEach(() => {
  saved = (globalThis as { customElements?: unknown }).customElements;
  const r = new FakeRegistry();
  r.define(engine === 'uix' ? 'uix-node' : 'card-mod', class {});
  (globalThis as { customElements: unknown }).customElements = r;
});
afterEach(() => {
  (globalThis as { customElements: unknown }).customElements = saved;
  engine = 'card-mod';
});

const GAUGE_ENTRY = '.text {\n  max-width: 66% !important;\n  max-height: 48% !important;\n}'; // 120 %
const THERMO_ENTRY = { 'ha-big-number$': '.value {\n  font-size: 30px !important;\n}' };
const cfg = (c: Record<string, unknown>) => c as unknown as CardModCardConfig;
const style = (c: CardModCardConfig) => c.card_mod?.style as unknown;

/** One editor session: open, then apply edits one by one, each followed by
 *  the post-write carrier refresh the panel does. */
function session(config: CardModCardConfig, ...edits: Array<(s: StudioState) => StudioState>): CardModCardConfig {
  let state = buildMergedStudioState(config);
  let current = config;
  for (const edit of edits) {
    state = edit(state);
    current = applyStudioState(state, current);
    state = refreshCarrier(state, current);
  }
  return current;
}
const numberSize = (on: boolean, px = 120) => (s: StudioState): StudioState => ({
  ...s, font: { ...s.font, numberSizeEnabled: on, numberSize: px },
});
const color = (c: string) => (s: StudioState): StudioState => ({
  ...s, background: { ...s.background, enabled: true, type: 'solid', color1: c, applyWhen: 'always' },
});

describe('v0.11 Number size — string ↔ dict', () => {
  it('enabling on a string-styled gauge writes {".": css, "ha-gauge$": …}', () => {
    const out = session(cfg({ type: 'gauge', entity: 'sensor.x', card_mod: { style: 'ha-card { border: 1px solid red; }' } }), numberSize(true));
    expect(style(out)).toEqual({ '.': expect.stringContaining('border'), 'ha-gauge$': GAUGE_ENTRY });
  });

  it('enable → ordinary edit → disable → ordinary edit: no flip-flop, ends as a plain string', () => {
    const start = cfg({ type: 'gauge', entity: 'sensor.x' });
    const afterOn = session(start, numberSize(true), color('#112233'));
    expect(style(afterOn)).toMatchObject({ 'ha-gauge$': GAUGE_ENTRY });
    const afterOff = session(afterOn, numberSize(false), color('#445566'));
    expect(typeof style(afterOff)).toBe('string');
    expect(style(afterOff)).toContain('#445566');
  });

  it('the state never shows the mixed-form lock after the first enable', () => {
    let state = buildMergedStudioState(cfg({ type: 'gauge', entity: 'sensor.x' }));
    state = numberSize(true)(state);
    const written = applyStudioState(state, cfg({ type: 'gauge', entity: 'sensor.x' }));
    state = refreshCarrier(state, written);
    expect(state.dictSource).toBeDefined(); // carrier present ⇒ editable, not frozen
  });

  it('thermostat writes the nested big-number entry and reads it back', () => {
    const out = session(cfg({ type: 'thermostat', entity: 'climate.x' }), numberSize(true, 30));
    expect(style(out)).toEqual({ 'ha-state-control-climate-temperature$': THERMO_ENTRY });
    const back = buildMergedStudioState(out);
    expect(back.font.numberSizeEnabled).toBe(true);
    expect(back.font.numberSize).toBe(30);
    expect(userEntries(back.dictSource)).toEqual([]); // Advanced lists nothing
  });

  it('a hand-written {".": …} without an owned entry stays a dict', () => {
    const out = session(cfg({ type: 'gauge', entity: 'sensor.x', card_mod: { style: { '.': 'ha-card { color: red; }' } } }), color('#123456'));
    expect(typeof style(out)).toBe('object');
  });

  it('a dict pinned under uix: never collapses to a string', () => {
    const config = cfg({
      type: 'gauge', entity: 'sensor.x',
      uix: { macros: { m: {} }, style: { '.': 'ha-card { color: red; }', 'ha-gauge$': GAUGE_ENTRY } },
    });
    const out = session(config, numberSize(false));
    expect(typeof (out.uix?.style as unknown)).toBe('object');
  });
});

describe('v0.11 Number size — order and preservation', () => {
  const perms: Array<Array<'.' | 'owned' | 'a'>> = [
    ['.', 'owned', 'a'], ['.', 'a', 'owned'], ['owned', '.', 'a'], ['owned', 'a', '.'], ['a', '.', 'owned'], ['a', 'owned', '.'],
  ];
  for (const perm of perms) {
    it(`keeps key order ${perm.join(',')} across a re-save`, () => {
      const dict: Record<string, unknown> = {};
      for (const k of perm) {
        if (k === '.') dict['.'] = 'ha-card {\n  color: red;\n}';
        else if (k === 'owned') dict['ha-gauge$'] = GAUGE_ENTRY;
        else dict['hui-gauge$'] = 'div { margin: 0; }';
      }
      const out = session(cfg({ type: 'gauge', entity: 'sensor.x', card_mod: { style: dict } }), color('#000001'));
      expect(Object.keys(style(out) as object)).toEqual(Object.keys(dict));
    });
  }

  it('disabling with empty css keeps the user entry and drops only the owned one', () => {
    const out = session(cfg({ type: 'gauge', entity: 'sensor.x', card_mod: { style: { 'ha-gauge$': GAUGE_ENTRY, 'hui-x$': 'p { margin: 0; }' } } }), numberSize(false));
    expect(style(out)).toEqual({ 'hui-x$': 'p { margin: 0; }' });
  });

  it('a foreign value under the owned key is preserved and locks the control', () => {
    const foreign = '.text { max-width: 90%; }';
    const config = cfg({ type: 'gauge', entity: 'sensor.x', card_mod: { style: { '.': 'ha-card { color: red; }', 'ha-gauge$': foreign } } });
    const state = buildMergedStudioState(config);
    expect(state.font.numberSizeLocked).toBe(true);
    expect(userEntries(state.dictSource).map((e) => e.key)).toEqual(['ha-gauge$']);
    const out = session(config, numberSize(true, 40));
    expect((style(out) as Record<string, unknown>)['ha-gauge$']).toBe(foreign);
  });

  it('mixed-form gauge (string card_mod + different uix dict) stays byte-identical on a Number size toggle', () => {
    const config = cfg({
      type: 'gauge', entity: 'sensor.x',
      card_mod: { style: 'ha-card { color: red; }' },
      uix: { style: { '.': 'ha-card { color: blue; }', 'ha-gauge$': GAUGE_ENTRY } },
    });
    const out = session(config, numberSize(true, 40));
    expect(out).toEqual(config);
  });

  it('dict primary with Number size + string secondary with Font keeps the owned entry', () => {
    const config = cfg({
      type: 'gauge', entity: 'sensor.x',
      card_mod: { style: { '.': 'ha-card { color: red; }', 'ha-gauge$': GAUGE_ENTRY } },
      uix: { style: 'ha-card {\n  font-size: 20px;\n  font-weight: bold;\n  color: var(--primary-text-color);\n}' },
    });
    const out = session(config, color('#222222'));
    expect((style(out) as Record<string, unknown>)['ha-gauge$']).toBe(GAUGE_ENTRY);
  });

  it('works under uix: as the active engine', () => {
    engine = 'uix';
    const r = new FakeRegistry(); r.define('uix-node', class {});
    (globalThis as { customElements: unknown }).customElements = r;
    const out = session(cfg({ type: 'gauge', entity: 'sensor.x' }), numberSize(true));
    expect(out.uix?.style as unknown).toEqual({ 'ha-gauge$': GAUGE_ENTRY });
  });

  it('a gauge inside a vertical-stack child round-trips', () => {
    const child = session(cfg({ type: 'gauge', entity: 'sensor.x' }), numberSize(true));
    const reopened = buildMergedStudioState(child);
    expect(reopened.font.numberSizeEnabled).toBe(true);
    expect(applyStudioState(reopened, child)).toEqual(child);
  });
});

describe('v0.11 Number size — presets', () => {
  it('a preset never carries Number size, and applying one keeps nothing of it', () => {
    const state = buildMergedStudioState(cfg({ type: 'gauge', entity: 'sensor.x', card_mod: { style: { 'ha-gauge$': GAUGE_ENTRY } } }));
    const filtered = filterPresetStateForCardType(state, 'thermostat');
    expect(filtered.font.numberSizeEnabled).toBe(false);
    expect(filtered.font.numberSize).toBe(0);
  });
});

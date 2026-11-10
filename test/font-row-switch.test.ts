/**
 * Entities-card row "Font (this row)": the switch only reveals the controls and
 * writes nothing (the row used to jump to 16px / normal); each control writes
 * only its own field; switching off clears both. Tests drive the rendered
 * handlers.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { initEntityRowStyles, generateEntityRowCss, rowStyleHasContent } from '../src/editor/studio-state.js';
import { parseEntityRowCss, mergeEntityRowStyles } from '../src/parser/state-mapper.js';
import type { CardModCardConfig, EntitiesRowStyles } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

type Rows = {
  rows: unknown[]; styles: EntitiesRowStyles; _openRows: Set<string>; _fontOpen: Set<string>;
  _fontLive: Record<string, number>; render(): unknown; dispatchEvent(e: Event): boolean;
};
let Mod: new () => Rows;
beforeAll(async () => {
  (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
    constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
  await import('../src/modules/module-entities-rows.js');
  Mod = registry.get('cms-entities-rows-module') as new () => Rows;
});

const handlers = (t: unknown): Array<(e: unknown) => void> => {
  if (typeof t === 'function') return [t as (e: unknown) => void];
  if (Array.isArray(t)) return t.flatMap(handlers);
  const v = (t as { values?: unknown[] } | null)?.values;
  return v ? v.flatMap(handlers) : [];
};

function make(rowStyle: string | null) {
  const rows = [rowStyle === null ? { entity: 'sensor.a' } : { entity: 'sensor.a', card_mod: { style: rowStyle } }];
  const el = new Mod();
  el.rows = rows;
  el.styles = initEntityRowStyles({ type: 'entities', entities: rows } as unknown as CardModCardConfig);
  el._openRows = new Set(['0']);
  const emitted: EntitiesRowStyles[] = [];
  el.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail); return true; });
  const hs = () => handlers(el.render());
  const text = () => templateText(el.render());
  // The Font switch is the LAST handler of a row whose font controls are
  // hidden; once shown they follow it: size input, size change, [reset], weight.
  const sw = hs().length - 1;
  const at = { sw, input: sw + 1, change: sw + 2, reset: sw + 3 };
  return { el, emitted, hs, text, at };
}

describe('row Font switch', () => {
  it('switching on writes nothing — it only reveals the controls with Default placeholders', () => {
    const { el, emitted, hs, text, at } = make(null);
    expect(text()).not.toContain('Text size');
    hs()[at.sw]({ target: { checked: true } });
    expect(emitted).toHaveLength(0);
    expect(el._fontOpen.has('0')).toBe(true);
    const t = text();
    expect(t).toContain('Text size');
    expect(t).toMatch(/\b14<span class="value-label unset"/); // templateText lists values before statics
    expect(t).not.toContain('reset-btn');
    expect(t).toContain('value=""'); // Default weight option
  });

  it('changing only the weight writes only font-weight', () => {
    const { el, emitted, hs, at } = make(null);
    hs()[at.sw]({ target: { checked: true } });
    const h = hs();
    h[h.length - 1]({ target: { value: 'bold' } }); // weight is the last handler
    const style = emitted[0]['0'];
    expect(style.fontWeight).toBe('bold');
    expect(style.fontSizePx).toBeUndefined();
    expect(generateEntityRowCss(style, 'sensor.a')).toBe(':host {\n  font-weight: bold;\n}');
    expect(el._fontOpen.has('0')).toBe(true);
  });

  it('changing only the size writes only font-size; its reset returns to not set', () => {
    const { el, emitted, hs, at } = make(null);
    hs()[at.sw]({ target: { checked: true } });
    hs()[at.change]({ target: { value: '20' } });
    expect(generateEntityRowCss(emitted[0]['0'], 'sensor.a')).toBe(':host {\n  font-size: 20px;\n}');
    // feed the state back (the parent does this) and click the rendered reset
    el.styles = emitted[0];
    const t = templateText(el.render());
    expect(t).toContain('Reset text size to default');
    hs()[at.reset]({});
    expect(emitted[1]['0'].fontSizePx).toBeUndefined();
    expect(generateEntityRowCss(emitted[1]['0'], 'sensor.a')).toBe('');
    expect(el._fontOpen.has('0')).toBe(true); // the switch stays on
  });

  it('switching off clears both fields', () => {
    const { el, emitted, hs } = make(':host {\n  font-size: 18px;\n  font-weight: bold;\n}');
    const at = { sw: hs().length - 1 - 4 }; // set row: switch, input, change, reset, weight
    expect(el.styles['0'].fontSizePx).toBe(18);
    hs()[at.sw]({ target: { checked: false } });
    expect(emitted[0]['0'].fontSizePx).toBeUndefined();
    expect(emitted[0]['0'].fontWeight).toBeUndefined();
    expect(generateEntityRowCss(emitted[0]['0'], 'sensor.a')).toBe('');
  });

  it('an old row with both values loads on and re-emits identically', () => {
    const css = ':host {\n  font-size: 16px;\n  font-weight: normal;\n}';
    const { el, text } = make(css);
    expect(el.styles['0']).toMatchObject({ fontSizePx: 16, fontWeight: 'normal' });
    expect(text()).toContain('Text size');
    expect(text()).toContain('reset-btn');
    expect(generateEntityRowCss(el.styles['0'], 'sensor.a')).toBe(css);
  });
});

describe('row Font switch off', () => {
  it('with nothing set it only hides the controls and fires no styles-changed', () => {
    const { el, emitted, hs, at } = make(null);
    hs()[at.sw]({ target: { checked: true } });
    hs()[at.sw]({ target: { checked: false } });
    expect(emitted).toHaveLength(0);
    expect(el._fontOpen.has('0')).toBe(false);
  });
  it('with a value set it still clears it', () => {
    const { emitted, hs, at } = make(':host {\n  font-weight: bold;\n}');
    hs()[at.sw]({ target: { checked: false } });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]['0'].fontWeight).toBeUndefined();
  });
});

describe('a 0px row size is a value, not "unset"', () => {
  it('parses, counts as content, and re-emits', () => {
    const css = ':host {\n  font-size: 0px;\n}';
    const style = parseEntityRowCss(css, 'sensor.a');
    expect(style.fontSizePx).toBe(0);
    expect(rowStyleHasContent(style)).toBe(true);
    expect(generateEntityRowCss(style, 'sensor.a')).toBe(css);
  });
});

describe('merging the card_mod and uix row styles keeps a 0px size', () => {
  const blank = { iconMode: 'static', textMode: 'static' } as never;
  it('either direction', () => {
    expect(mergeEntityRowStyles({ ...blank, fontSizePx: 0 }, blank).fontSizePx).toBe(0);
    expect(mergeEntityRowStyles(blank, { ...blank, fontSizePx: 0 }).fontSizePx).toBe(0);
    expect(mergeEntityRowStyles({ ...blank, fontSizePx: 0 }, { ...blank, fontSizePx: 12 }).fontSizePx).toBe(0);
    expect('fontSizePx' in mergeEntityRowStyles(blank, blank)).toBe(false);
  });
});

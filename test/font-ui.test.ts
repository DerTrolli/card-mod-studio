/**
 * Font panel: controls show the card's native text size as a placeholder while
 * unset, emit only what the user sets, can each be returned to "not set", and
 * the Custom font family field behaves. Tests drive the RENDERED handlers
 * (pulled out of the template), not `_emit`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { DEFAULT_FONT, mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { generateCss } from '../src/generator/css-generator.js';
import type { FontModuleState } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

type El = {
  state: FontModuleState; cardType?: string; allowSize: boolean; allowColor: boolean;
  _open: boolean; _fontSize?: number; _customText: string; _customPicked: boolean;
  _renderBody(): unknown; render(): unknown; dispatchEvent(e: Event): boolean;
};
let Mod: new () => El;
let fontNativeSize: (t?: string) => number | undefined;
beforeAll(async () => {
  (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
    constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
  ({ fontNativeSize } = await import('../src/modules/module-font.js'));
  Mod = registry.get('cms-font-module') as new () => El;
});

const BLANK = mapToStudioState(parseStyleValue(''));
const gen = (f: FontModuleState, type: string) => generateCss({ ...BLANK, font: f }, type);

/** Every function bound into a template, in render order (nested templates included). */
const handlers = (t: unknown): Array<(e: unknown) => void> => {
  if (typeof t === 'function') return [t as (e: unknown) => void];
  if (Array.isArray(t)) return t.flatMap(handlers);
  const v = (t as { values?: unknown[] } | null)?.values;
  return v ? v.flatMap(handlers) : [];
};
// Render order of the handlers (see module-font.ts): slider input, slider
// change, [reset click when set], weight change, family change, [custom
// family change], colour color-changed.
const IDX = { input: 0, change: 1 };

const make = (state: Partial<FontModuleState> = {}, cardType?: string) => {
  const el = new Mod();
  el.state = { ...DEFAULT_FONT, enabled: true, ...state };
  el.cardType = cardType;
  el._fontSize = el.state.fontSize; // what updated() does on a state change
  const emitted: FontModuleState[] = [];
  el.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail); return true; });
  return { el, emitted, hs: () => handlers(el._renderBody()) };
};

describe('native size placeholder', () => {
  it('known cards show their measured size; unknown / custom cards a neutral Default', () => {
    expect(fontNativeSize('tile')).toBe(14);
    expect(fontNativeSize('button')).toBe(16);
    expect(fontNativeSize('light')).toBe(16.8);
    expect(fontNativeSize('markdown')).toBe(14);
    expect(fontNativeSize('custom:mushroom-entity-card')).toBeUndefined();
    expect(fontNativeSize(undefined)).toBeUndefined();
    expect(templateText(make({}, 'tile').el._renderBody())).toContain('Default (14px)');
    expect(templateText(make({}, 'button').el._renderBody())).toContain('Default (16px)');
    const neutral = templateText(make({}, 'custom:mushroom-entity-card').el._renderBody());
    expect(neutral).not.toMatch(/Default \(\d/);
    expect(neutral).toContain('>Default<');
  });
  it('an unset module has no reset button; clearable colour and Default weight', () => {
    const t = templateText(make({}, 'tile').el._renderBody());
    expect(t).not.toContain('reset-btn');
    expect(t).toContain('clearable');
    expect(t).toContain('value=""');
    expect(t).toContain('aria-label="Text size"');
    expect(t).toContain('aria-label="Weight"');
  });
});

describe('rendered handlers emit only what the user sets', () => {
  it('slider @change emits only fontSize; the style has only the size', () => {
    const { hs, emitted } = make({}, 'markdown');
    hs()[IDX.change]({ target: { value: '20' } });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({ ...DEFAULT_FONT, enabled: true, fontSize: 20 });
    expect(gen(emitted[0], 'markdown')).toBe('ha-card {\n  font-size: 20px;\n}');
  });
  it('slider @input alone emits nothing (live value only)', () => {
    const { hs, emitted, el } = make({}, 'markdown');
    hs()[IDX.input]({ target: { value: '22' } });
    expect(emitted).toHaveLength(0);
    expect(el._fontSize).toBe(22);
  });
  it('weight @change: only weight; Default emits undefined', () => {
    const { hs, emitted } = make({}, 'tile');
    // unset: handlers are input, change, weight, family, colour
    hs()[2]({ target: { value: 'bold' } });
    expect(emitted[0]).toEqual({ ...DEFAULT_FONT, enabled: true, fontWeight: 'bold' });
    expect(gen(emitted[0], 'tile')).not.toMatch(/font-size|color/);
    const set = make({ fontWeight: 'bold' }, 'tile');
    set.hs()[2]({ target: { value: '' } });
    expect(set.emitted[0].fontWeight).toBeUndefined();
    expect(gen(set.emitted[0], 'tile')).toBe('');
  });
  it('colour @color-changed: only colour; empty / cleared emits undefined', () => {
    const { hs, emitted } = make({}, 'markdown');
    const h = hs();
    h[h.length - 1]({ detail: { value: '#ff0000' } });
    expect(emitted[0]).toEqual({ ...DEFAULT_FONT, enabled: true, color: '#ff0000' });
    h[h.length - 1]({ detail: { value: '' } });
    expect(emitted[1].color).toBeUndefined();
  });
  it('a set size shows the value and a named reset; the reset click emits undefined', () => {
    const { el, hs, emitted } = make({ fontSize: 20, fontWeight: 'bold' }, 'tile');
    el._fontSize = 20;
    const t = templateText(el._renderBody());
    expect(t).toContain('reset-btn');
    expect(t).toContain('Reset text size to default');
    expect(t).not.toMatch(/Default \(14/);
    // input, change, RESET, weight, family, colour
    hs()[2]({});
    expect(emitted[0]).toEqual({ ...DEFAULT_FONT, enabled: true, fontWeight: 'bold' });
    expect(emitted[0].fontSize).toBeUndefined();
  });
});

/** Bound values of the template that holds the Custom family input. */
const fieldValues = (t: unknown): unknown[] => {
  const r = t as { strings?: readonly string[]; values?: unknown[] } | null;
  if (Array.isArray(t)) return t.flatMap(fieldValues);
  if (!r?.values) return [];
  if (r.strings?.join('').includes('aria-label="Custom family"')) return r.values;
  return r.values.flatMap(fieldValues);
};

describe('Custom font family', () => {
  const familyHandlers = (el: El) => handlers(el._renderBody());
  it('first choosing Custom shows an empty field (placeholder), not the previous preset', () => {
    const { el, hs, emitted } = make({ fontFamily: 'monospace', fontSize: 20 }, 'markdown');
    // input, change, reset, weight, family, colour
    hs()[4]({ target: { value: 'custom' } });
    expect(emitted).toHaveLength(0); // nothing typed yet: nothing changes
    expect(el._customPicked).toBe(true);
    const t = templateText(el._renderBody());
    expect(t).toContain("placeholder=\"'My Font', sans-serif\"");
    // the custom field's bound value is the (empty) remembered text
    expect(fieldValues(el._renderBody())).toContain('');
    expect(fieldValues(el._renderBody())).not.toContain('monospace');
    expect(el._customText).toBe('');
  });
  it('typed text is remembered across Serif and back, and re-applies', () => {
    const { el, hs, emitted } = make({ fontSize: 20 }, 'markdown');
    hs()[4]({ target: { value: 'custom' } }); // Custom…
    // input, change, reset, weight, family, CUSTOM FIELD change, colour
    const h1 = familyHandlers(el);
    h1[5]({ target: { value: "  'My Font', serif " } });
    expect(emitted.at(-1)!.fontFamily).toBe("'My Font', serif");
    el.state = emitted.at(-1)!;
    familyHandlers(el)[4]({ target: { value: 'serif' } }); // to Serif
    expect(emitted.at(-1)!.fontFamily).toBe('serif');
    el.state = emitted.at(-1)!;
    familyHandlers(el)[4]({ target: { value: 'custom' } }); // back to Custom
    expect(el._customText).toBe("'My Font', serif");
    expect(emitted.at(-1)!.fontFamily).toBe("'My Font', serif");
  });
  const sync = (el: El, prev: FontModuleState, extra: [string, unknown][] = []) =>
    (el as unknown as { updated(c: Map<PropertyKey, unknown>): void }).updated(new Map<PropertyKey, unknown>([['state', prev], ...extra]));
  it('the remembered text does not follow the element to another card', () => {
    const { el, hs, emitted } = make({ fontSize: 20 }, 'markdown');
    hs()[4]({ target: { value: 'custom' } });
    familyHandlers(el)[5]({ target: { value: "'Old Card', serif" } });
    // our own emit coming back keeps it
    let prev = el.state;
    el.state = emitted.at(-1)!;
    sync(el, prev);
    expect(el._customText).toBe("'Old Card', serif");
    // another card's family arrives: the text is dropped
    prev = el.state;
    el.state = { ...DEFAULT_FONT, enabled: true, fontSize: 20, fontFamily: 'monospace' };
    sync(el, prev);
    expect(el._customText).toBe('');
    const n = emitted.length;
    familyHandlers(el)[4]({ target: { value: 'custom' } });
    expect(emitted).toHaveLength(n); // nothing written from the old card's text
  });
  it('a different card type drops it too', () => {
    const { el } = make({}, 'markdown');
    el._customText = 'x';
    sync(el, el.state, [['cardType', 'markdown']]);
    expect(el._customText).toBe('');
  });
  it('the stored CSS format is unchanged (plain font-family)', () => {
    expect(gen({ ...DEFAULT_FONT, enabled: true, fontFamily: "'My Font', sans-serif" }, 'markdown'))
      .toBe("ha-card {\n  font-family: 'My Font', sans-serif;\n}");
  });
});

/** The header switch's @change: the last handler bound in render() itself. */
const switchChange = (el: { render(): unknown }) => {
  const fns = ((el.render() as { values: unknown[] }).values).filter((v) => typeof v === 'function');
  return fns.at(-1) as (e: unknown) => void;
};

describe('the Font enable switch', () => {
  it('emits only { enabled } — no size, weight or colour', () => {
    const { el, emitted } = make({ enabled: false }, 'tile');
    switchChange(el)({ target: { checked: true } });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({ ...el.state, enabled: true });
    expect(emitted[0].fontSize).toBeUndefined();
    expect(emitted[0].fontWeight).toBeUndefined();
    expect(emitted[0].color).toBeUndefined();
  });
});

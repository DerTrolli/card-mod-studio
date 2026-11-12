/**
 * Heading Style panel: controls show the card's native value as a neutral
 * placeholder while unset, emit only what the user sets, and can each be
 * returned to "not set".
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { DEFAULT_HEADING_STYLE, mapToStudioState } from '../src/parser/state-mapper.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';
import { generateCss } from '../src/generator/css-generator.js';
import type { HeadingStyleModuleState } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

type El = {
  state: HeadingStyleModuleState; headingStyle?: string; _open: boolean;
  _fontSize?: number; _iconSize?: number;
  _renderBody(): unknown; render(): unknown; _emit(c: Partial<HeadingStyleModuleState>): void;
  dispatchEvent(e: Event): boolean;
};
let Mod: new () => El;
let headingNative: (s?: string) => Record<string, unknown>;
beforeAll(async () => {
  (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
    constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
  ({ headingNative } = await import('../src/modules/module-heading-style.js'));
  Mod = registry.get('cms-heading-style-module') as new () => El;
});

const BLANK = mapToStudioState(parseCardModConfig({ type: 'heading' }), 'heading');
const gen = (h: HeadingStyleModuleState) =>
  generateCss({ ...BLANK, headingStyle: h }, 'heading');

/** Every function bound into a template (its event handlers). */
const handlers = (t: unknown): Array<(e: unknown) => void> => {
  if (typeof t === 'function') return [t as (e: unknown) => void];
  if (Array.isArray(t)) return t.flatMap(handlers);
  const v = (t as { values?: unknown[] } | null)?.values;
  return v ? v.flatMap(handlers) : [];
};

const make = (state: Partial<HeadingStyleModuleState> = {}, headingStyle?: string) => {
  const el = new Mod();
  el.state = { ...DEFAULT_HEADING_STYLE, enabled: true, ...state };
  el.headingStyle = headingStyle;
  const emitted: HeadingStyleModuleState[] = [];
  el.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail); return true; });
  return { el, emitted };
};

describe('native placeholders', () => {
  it('title and subtitle headings show their own native values (measured on HA 2026.11)', () => {
    expect(headingNative('title')).toMatchObject({ fontSize: 16, weight: 'normal', iconSize: 18 });
    expect(headingNative('subtitle')).toMatchObject({ fontSize: 14, weight: 'medium', iconSize: 18 });
    expect(headingNative(undefined)).toBe(headingNative('title'));
  });
  it('an unset module renders Default placeholders for the card variant, with no reset buttons', () => {
    const sub = templateText(make({}, 'subtitle').el._renderBody());
    expect(sub).toMatch(/\b14<span class="value-label unset"/); // templateText lists values before statics
    expect(sub).toContain('Default (medium)');
    expect(sub).toContain('Default (secondary text)');
    expect(sub).not.toContain('reset-btn');
    const title = templateText(make({}, 'title').el._renderBody());
    expect(title).toMatch(/\b16<span class="value-label unset"/);
    expect(title).toContain('Default (normal)');
  });
  it('select and colour controls have a Default choice and clearable pickers', () => {
    const t = templateText(make().el._renderBody());
    expect(t).toContain('value=""');
    expect(t.match(/clearable/g)?.length).toBe(2);
    expect(t).toContain('aria-label="Text size"');
  });
});

/** The rendered template flattened to statics (text) and bound handlers,
 *  in order, so a test can pick "the @change of the Text size slider". */
type Tok = { text: string } | { fn: (e: unknown) => void; attr?: string };
const tokens = (t: unknown, out: Tok[] = [], prev = ''): Tok[] => {
  if (typeof t === 'function') out.push({ fn: t as (e: unknown) => void, attr: prev.match(/@([\w-]+)=\s*$/)?.[1] });
  else if (typeof t === 'string') out.push({ text: t });
  else if (Array.isArray(t)) t.forEach((x) => tokens(x, out, prev));
  else {
    const r = t as { strings?: string[]; values?: unknown[] } | null;
    r?.strings?.forEach((str, i) => {
      out.push({ text: str });
      if (r.values && i < r.values.length) tokens(r.values[i], out, str);
    });
  }
  return out;
};
/** First handler for `attr` after the first token containing `label`. */
const handlerFor = (el: El, label: string, attr: string) => {
  const toks = tokens(el._renderBody());
  const from = toks.findIndex((x) => 'text' in x && x.text.includes(label));
  expect(from, `label "${label}" rendered`).toBeGreaterThanOrEqual(0);
  const hit = toks.slice(from).find((x) => 'fn' in x && x.attr === attr) as { fn: (e: unknown) => void } | undefined;
  expect(hit, `${attr} handler after "${label}"`).toBeDefined();
  return hit!.fn;
};

describe('emitting only what the user sets (through the rendered handlers)', () => {
  const SET: Partial<HeadingStyleModuleState> = {
    fontSize: 20, iconSize: 30, fontWeight: 'bold', alignment: 'right', textColor: '#ff0000', iconColor: '#00ff00',
  };
  const full = (extra: Partial<HeadingStyleModuleState>) => ({ ...DEFAULT_HEADING_STYLE, enabled: true, ...extra });

  it('the size slider @change sets only fontSize — and the style gets only the size twins', () => {
    const { el, emitted } = make();
    handlerFor(el, 'aria-label="Text size"', 'change')({ target: { value: '20' } });
    expect(emitted).toEqual([full({ fontSize: 20 })]);
    expect(gen(emitted[0])).not.toContain('justify-content');
  });
  it('the icon slider @change sets only iconSize', () => {
    const { el, emitted } = make();
    handlerFor(el, 'aria-label="Icon size"', 'change')({ target: { value: '30' } });
    expect(emitted).toEqual([full({ iconSize: 30 })]);
  });
  it('the size reset button @click clears only fontSize', () => {
    const { el, emitted } = make(SET);
    el._fontSize = 20; el._iconSize = 30;
    expect(templateText(el._renderBody())).toContain('reset-btn');
    handlerFor(el, 'Reset text size to default', 'click')({});
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({ ...full(SET), fontSize: undefined });
    expect('fontSize' in emitted[0] && emitted[0].fontSize).toBeUndefined();
  });
  it('the icon reset button @click clears only iconSize', () => {
    const { el, emitted } = make(SET);
    el._fontSize = 20; el._iconSize = 30;
    handlerFor(el, 'Reset icon size to default', 'click')({});
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({ ...full(SET), iconSize: undefined });
  });
  it('a set size shows its value, a reset button, and no Default placeholder', () => {
    const { el } = make({ fontSize: 20 });
    el._fontSize = 20;
    const t = templateText(el._renderBody());
    expect(t).toContain('reset-btn');
    expect(t).not.toMatch(/Default \(16/);
  });
  it('a stored 0 renders as a set value with a reset button (not "Default") and writes nothing on its own', () => {
    const { el, emitted } = make({ fontSize: 0, iconSize: 0 });
    el._fontSize = 0; el._iconSize = 0;
    const t = templateText(el._renderBody());
    expect(t.match(/reset-btn/g)?.length ?? 0).toBeGreaterThan(0);
    expect(t).not.toContain('value-label unset');
    expect(emitted).toEqual([]);
    expect(gen(full({ fontSize: 0, iconSize: 0 }))).toContain('--mdc-icon-size: 0px;');
  });
  it('weight select @change: "" → undefined; an explicit value equal to the native one stays explicit', () => {
    const { el, emitted } = make({ fontWeight: 'bold', alignment: 'right' }, 'subtitle');
    handlerFor(el, 'aria-label="Weight"', 'change')({ target: { value: '' } });
    expect(emitted[0]).toEqual({ ...full({ fontWeight: 'bold', alignment: 'right' }), fontWeight: undefined });
    handlerFor(el, 'aria-label="Weight"', 'change')({ target: { value: 'medium' } }); // subtitle native
    expect(emitted[1]).toEqual(full({ fontWeight: 'medium', alignment: 'right' }));
    expect(gen(emitted[1])).toContain('font-weight: 500');
  });
  it('alignment select @change: "" → undefined; an explicit value stays', () => {
    const { el, emitted } = make({ alignment: 'right', fontWeight: 'bold' });
    handlerFor(el, 'aria-label="Alignment"', 'change')({ target: { value: '' } });
    expect(emitted[0]).toEqual({ ...full({ fontWeight: 'bold' }), alignment: undefined });
    handlerFor(el, 'aria-label="Alignment"', 'change')({ target: { value: 'left' } });
    expect(emitted[1]).toEqual(full({ fontWeight: 'bold', alignment: 'left' }));
  });
  it('the text colour picker color-changed "" → undefined textColor only; icon colour likewise', () => {
    const { el, emitted } = make(SET);
    const toks = tokens(el._renderBody());
    const colours = toks.filter((x) => 'fn' in x && x.attr === 'color-changed') as Array<{ fn: (e: unknown) => void }>;
    expect(colours).toHaveLength(2);
    colours[0].fn({ detail: { value: '' } });
    colours[1].fn({ detail: { value: '' } });
    expect(emitted[0]).toEqual({ ...full(SET), textColor: undefined });
    expect(emitted[1]).toEqual({ ...full(SET), iconColor: undefined });
    colours[0].fn({ detail: { value: '#123456' } });
    expect(emitted[2]).toEqual(full({ ...SET, textColor: '#123456' }));
  });
  it('with everything cleared the style is empty', () => {
    expect(gen({ ...DEFAULT_HEADING_STYLE, enabled: true })).toBe('');
  });
});

/** The header switch's @change: the header binds click, keydown, then the switch's change. */
const switchChange = (el: { render(): unknown }) => {
  const fns = (function flat(t: unknown): unknown[] {
    if (typeof t === 'function') return [t];
    if (Array.isArray(t)) return t.flatMap(flat);
    const v = (t as { values?: unknown[] } | null)?.values;
    return v ? v.flatMap(flat) : [];
  })(el.render());
  return fns[2] as (e: unknown) => void;
};

describe('the Heading Style enable switch', () => {
  it('emits only { enabled } — none of the six fields', () => {
    const { el, emitted } = make({ enabled: false });
    switchChange(el)({ target: { checked: true } });
    expect(emitted).toEqual([{ ...el.state, enabled: true }]);
    for (const k of ['fontSize', 'textColor', 'fontWeight', 'iconSize', 'iconColor', 'alignment'] as const) {
      expect(emitted[0][k]).toBeUndefined();
    }
  });
});

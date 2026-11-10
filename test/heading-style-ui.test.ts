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
  _renderBody(): unknown; _emit(c: Partial<HeadingStyleModuleState>): void;
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

describe('emitting only what the user sets', () => {
  it('moving the size slider emits only fontSize — and the style gets only the size twins', () => {
    const { el, emitted } = make();
    el._emit({ fontSize: 20 });
    expect(emitted[0]).toEqual({ ...DEFAULT_HEADING_STYLE, enabled: true, fontSize: 20 });
    expect(gen(emitted[0])).not.toContain('justify-content');
  });
  it('a set size shows the value and a named reset button; reset emits undefined', () => {
    const { el, emitted } = make({ fontSize: 20 });
    el._fontSize = 20;
    const t = templateText(el._renderBody());
    expect(t).toContain('reset-btn');
    expect(t).not.toMatch(/Default \(16/);
    el._emit({ fontSize: undefined });
    expect(emitted[0].fontSize).toBeUndefined();
  });
  it('choosing Default / clearing a colour emits undefined for that property', () => {
    const { el, emitted } = make({
      fontWeight: 'bold', alignment: 'right', textColor: '#ff0000', iconColor: '#00ff00',
    });
    const blank = { target: { value: '' }, detail: { value: '' } };
    for (const h of handlers(el._renderBody())) h(blank);
    for (const k of ['fontWeight', 'alignment', 'textColor', 'iconColor'] as const) {
      expect(emitted.some((s) => k in s && s[k] === undefined)).toBe(true);
    }
    expect(gen({ ...DEFAULT_HEADING_STYLE, enabled: true })).toBe('');
  });
});

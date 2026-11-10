/**
 * Collapsible headers: a button that reads "Font" (not "▼ 🔠 Font"), holds no
 * other control, reports the real open state and points at its body; the
 * enable switch sits NEXT to the button, after it in focus order. Driven
 * through the rendered templates (test/a11y-template.ts).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import { accessibleName, parse, serialise, walk, type El } from './a11y-template.js';
import {
  DEFAULT_ACCENT_COLOR, DEFAULT_ANIMATION, DEFAULT_BACKGROUND, DEFAULT_BORDER, DEFAULT_FILTER,
  DEFAULT_FONT, DEFAULT_HEADING_STYLE, DEFAULT_ICON_COLOR, DEFAULT_THRESHOLD,
} from '../src/parser/state-mapper.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const MODULES: Array<[string, string, Any, boolean]> = [
  ['Font', 'cms-font-module', { ...DEFAULT_FONT }, true],
  ['Visual Filters', 'cms-filter-module', { ...DEFAULT_FILTER }, true],
  ['Accent Color', 'cms-accent-color-module', { ...DEFAULT_ACCENT_COLOR }, true],
  ['Icon Color', 'cms-icon-color-module', { ...DEFAULT_ICON_COLOR }, true],
  ['Threshold Colors', 'cms-threshold-module', { ...DEFAULT_THRESHOLD }, true],
  ['Background', 'cms-background-module', { ...DEFAULT_BACKGROUND }, true],
  ['Animation', 'cms-animation-module', { ...DEFAULT_ANIMATION }, true],
  ['Border & Radius', 'cms-border-module', { ...DEFAULT_BORDER }, true],
  ['Heading Style', 'cms-heading-style-module', { ...DEFAULT_HEADING_STYLE }, true],
  ['Advanced CSS', 'cms-advanced-module', { rawCss: '' }, false],
];

beforeAll(async () => {
  (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
    constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
  await Promise.all([
    import('../src/modules/module-font.js'), import('../src/modules/module-filter.js'),
    import('../src/modules/module-accent-color.js'), import('../src/modules/module-icon-color.js'),
    import('../src/modules/module-threshold.js'), import('../src/modules/module-background.js'),
    import('../src/modules/module-animation.js'), import('../src/modules/module-border.js'),
    import('../src/modules/module-heading-style.js'), import('../src/modules/module-advanced.js'),
    import('../src/modules/module-entities-rows.js'), import('../src/editor/cms-child-card-section.js'),
  ]);
});

function render(tag: string, state: Any, open: boolean): { root: El; el: Any } {
  const Ctor = registry.get(tag) as new () => Any;
  const el = new Ctor();
  el.state = { ...state, enabled: true };
  if (tag === 'cms-advanced-module') el.open = open; else el._open = open;
  return { root: parse(serialise(el.render())), el };
}

const buttons = (root: El): El[] => {
  const out: El[] = [];
  walk(root, (e) => { if (e.attrs.role === 'button') out.push(e); });
  return out;
};
const interactiveInside = (btn: El): string[] => {
  const out: string[] = [];
  walk(btn, (e) => {
    if (['ha-switch', 'ha-slider', 'input', 'select', 'button', 'textarea'].includes(e.tag) || 'tabindex' in e.attrs || e.attrs.role === 'button') out.push(e.tag);
  });
  return out;
};

describe.each(MODULES)('%s header', (title, tag, state, hasSwitch) => {
  it.each([true, false])('open=%s: the button is named by its title alone and holds no other control', (open) => {
    const { root } = render(tag, state, open);
    const [btn] = buttons(root);
    expect(btn.attrs['aria-expanded']).toBe(String(open));
    expect(accessibleName(btn, root)).toBe(title);
    expect(interactiveInside(btn)).toEqual([]);
  });

  it('points at its body only while open, and the body exists', () => {
    const closed = render(tag, state, false).root;
    expect(buttons(closed)[0].attrs['aria-controls']).toBeUndefined();
    const open = render(tag, state, true).root;
    const id = buttons(open)[0].attrs['aria-controls'];
    expect(id).toBeTruthy();
    let found = false;
    walk(open, (e) => { if (e.attrs.id === id) found = true; });
    expect(found).toBe(true);
  });

  if (hasSwitch) {
    it('the switch is a sibling AFTER the button (focus order: header, then switch)', () => {
      const { root } = render(tag, state, false);
      const [btn] = buttons(root);
      const siblings = btn.parent!.children.filter((c): c is El => typeof c !== 'string');
      const sw = siblings.find((c) => c.tag === 'ha-switch')!;
      expect(sw).toBeDefined();
      expect(siblings.indexOf(sw)).toBeGreaterThan(siblings.indexOf(btn));
      expect(accessibleName(sw, root)).toBe(`Enable ${title}`);
    });
  }
});

describe('header interaction', () => {
  const handlersOf = (t: unknown): Array<(e: unknown) => void> => {
    if (typeof t === 'function') return [t as (e: unknown) => void];
    if (Array.isArray(t)) return t.flatMap(handlersOf);
    const v = (t as { values?: unknown[] } | null)?.values;
    return v ? v.flatMap(handlersOf) : [];
  };
  it('click and Enter / Space on the button toggle; the switch change emits and does not toggle', () => {
    const Ctor = registry.get('cms-font-module') as new () => Any;
    const el = new Ctor();
    el.state = { ...DEFAULT_FONT, enabled: false };
    const emitted: Any[] = [];
    el.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail); return true; });
    const [click, keydown, change] = handlersOf(el.render());
    click({});
    expect(el._open).toBe(true);
    let clicked = 0;
    const target = { click: () => { clicked++; }, };
    for (const key of ['Enter', ' ']) keydown({ key, target, currentTarget: target, preventDefault() {} });
    keydown({ key: 'a', target, currentTarget: target, preventDefault() {} });
    expect(clicked).toBe(2);
    change({ target: { checked: true } });
    expect(emitted).toHaveLength(1);
    expect(emitted[0].enabled).toBe(true);
    expect(el._open).toBe(true);
  });
});

describe('Entity Rows and stack child headers', () => {
  it('row headers report their real open state, name by the entity, and hide the chevron', () => {
    const Ctor = registry.get('cms-entities-rows-module') as new () => Any;
    const el = new Ctor();
    el.rows = [{ entity: 'light.a' }, { entity: 'sensor.t' }];
    el.styles = {};
    el._openRows = new Set(['1']);
    const root = parse(serialise(el.render()));
    const rows = buttons(root);
    expect(rows.map((b) => b.attrs['aria-expanded'])).toEqual(['false', 'true']);
    expect(rows.map((b) => b.attrs['aria-controls'])).toEqual([undefined, 'row-body-1']);
    let body = false;
    walk(root, (e) => { if (e.attrs.id === 'row-body-1') body = true; });
    expect(body).toBe(true);
    expect(accessibleName(rows[1], root)).toMatch(/^[^▼▶]*sensor\.t$/);
    expect(serialise(el.render())).not.toMatch(/🏠\s*Entity Rows/);
  });

  it('the stack child header reads its label without the chevron and reflects its state', () => {
    const Ctor = registry.get('cms-child-card-section') as new () => Any;
    const el = new Ctor();
    el.index = 0;
    el.childConfig = { type: 'tile', entity: 'light.a' };
    for (const open of [false, true]) {
      el._open = open;
      const root = parse(serialise(el.render()));
      const [btn] = buttons(root);
      expect(btn.attrs['aria-expanded']).toBe(String(open));
      expect(accessibleName(btn, root)).not.toMatch(/[▼▶]/);
    }
  });
});

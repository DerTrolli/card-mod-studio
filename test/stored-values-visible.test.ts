/**
 * A value already stored on the card stays visible and resettable even when
 * the card's own limits would hide or cap it: the Icon size sliders never cap
 * below a stored size, and the Font Text size row shows while a size is stored.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import { parse, serialise, walk, type El } from './a11y-template.js';
import { DEFAULT_FONT, DEFAULT_ICON_COLOR } from '../src/parser/state-mapper.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeAll(async () => {
  (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
    constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
  await Promise.all([import('../src/modules/module-icon-color.js'), import('../src/modules/module-font.js')]);
});

const sliders = (t: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  walk(parse(serialise(t)) as El, (e) => { if (e.tag === 'ha-slider') out[e.attrs.label] = e.attrs.max; });
  return out;
};

describe('Icon Color: size sliders keep a stored size reachable', () => {
  const make = (sizeMax: number, state: Any) => {
    const el = new (registry.get('cms-icon-color-module') as new () => Any)();
    Object.assign(el, { allowSize: true, sizeMax, cardEntity: 'light.a', _open: true });
    el.state = { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'plain', ...state };
    return el;
  };
  const cond = { when: 'on' };

  it('a stored size above the card maximum raises that slider to the stored value', () => {
    const s = sliders(make(36, { sizePx: 50, sizeWhen: cond, sizeOffPx: 44 }).render());
    expect(s['Icon size']).toBe('50');
    expect(s['Size otherwise']).toBe('44');
  });

  it('a stored size below the maximum leaves the card maximum in place', () => {
    const s = sliders(make(36, { sizePx: 20, sizeWhen: cond, sizeOffPx: 10 }).render());
    expect(s['Icon size']).toBe('36');
    expect(s['Size otherwise']).toBe('36');
  });

  it('an unset "otherwise" size does not change the second slider\'s maximum', () => {
    expect(sliders(make(56, { sizePx: 30, sizeWhen: cond }).render())['Size otherwise']).toBe('56');
  });
});

describe('Font: the Text size row', () => {
  const make = (allowSize: boolean, fontSize?: number) => {
    const el = new (registry.get('cms-font-module') as new () => Any)();
    Object.assign(el, { allowSize, cardType: 'alert', _open: true });
    el.state = { ...DEFAULT_FONT, enabled: true, fontSize };
    el._fontSize = fontSize; // the live copy updated() keeps in step with the state
    return el;
  };
  const rows = (el: Any) => Object.keys(sliders(el.render()));

  it('is hidden where the card cannot take a size and none is stored', () => {
    expect(rows(make(false))).not.toContain('Text size');
  });
  it('shows while a size is stored even though the card hides the row', () => {
    expect(rows(make(false, 18))).toContain('Text size');
  });
  it('shows where the card takes a size', () => {
    expect(rows(make(true))).toContain('Text size');
  });
  it('a stored size on a hidden-row card is resettable: the reset button is rendered', () => {
    expect(serialise(make(false, 18).render())).toContain('Reset text size to default');
  });
});

/**
 * The UIX macros/billets banner only appears when it is relevant and says
 * what is true: `uix.macros` / `billets` are never rewritten, and a style
 * that calls a macro stays verbatim in Advanced CSS. Driven through the
 * real panel's rendered compat banner and the real open → edit → save path.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { CardModCardConfig } from '../src/types/index.js';
import { uixStyleUsesMacro } from '../src/utils/uix-macro-use.js';
import {
  FakeCustomElementRegistry, templateText, installEngines, restoreEngines, cfg, openEditSave, enableBorderRadius,
} from './v010-audit-helpers.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

type PanelT = {
  config?: CardModCardConfig; _cardModPresent: boolean; _uixPresent: boolean;
  _initState(): void; _renderCompatBanner(): unknown;
};
let Panel: new () => PanelT;
beforeAll(async () => {
  await import('../src/editor/cms-panel.js');
  Panel = registry.get('cms-panel') as new () => PanelT;
});

/** UIX is the only engine (the write target); or card-mod is present too. */
const banner = (uix: unknown, engines: { cardMod: boolean } = { cardMod: false }) => {
  const p = new Panel();
  p.config = { type: 'tile', entity: 'light.a', uix } as unknown as CardModCardConfig;
  p._uixPresent = true;
  p._cardModPresent = engines.cardMod;
  p._initState();
  return templateText(p._renderCompatBanner());
};
const KEPT = 'uix: style uses macros/billets. They are kept as they are';
const OLD = 'editing it here will replace that';

const PLAIN = 'ha-card {\n  background: #ff0000;\n}';
const MACRO_STYLE = 'ha-card {\n  --accent-color: {{ macros.foo() }};\n}';

describe('UIX target: macros banner', () => {
  it('no macros key → no banner', () => {
    expect(banner({ style: PLAIN })).toBe('');
  });
  it('macros key + plain CSS style → no banner (nothing to say, nothing replaced)', () => {
    expect(banner({ macros: { foo: { template: 'x' } }, style: PLAIN })).toBe('');
    expect(banner({ billets: { a: 'b' }, style: PLAIN })).toBe('');
  });
  it('macros defined and no style at all → no banner', () => {
    expect(banner({ macros: { foo: {} } })).toBe('');
  });
  it('the style calls a macro → the true statement, not "will replace"', () => {
    const t = banner({ macros: { foo: { template: 'x' } }, style: MACRO_STYLE });
    expect(t).toContain(KEPT);
    expect(t).toContain('stays in Advanced CSS');
    expect(t).not.toContain(OLD);
  });
  it('a call by bare name, a billet reference and a dict-form style all count', () => {
    expect(banner({ macros: { m: {} }, style: 'a { b: {{ m("x") }}; }' })).toContain(KEPT);
    expect(banner({ billets: { b: 1 }, style: 'a { b: {{ billets.b }}; }' })).toContain(KEPT);
    expect(banner({ macros: { foo: {} }, style: { '.': MACRO_STYLE, 'x$': 'y {}' } })).toContain(KEPT);
  });
  it('a macro NAME in plain text or a different function call does not count', () => {
    expect(banner({ macros: { foo: {} }, style: 'a { content: "foo()"; b: {{ states("x") }}; }' })).toBe('');
  });
});

describe('card-mod target with a uix: macros block', () => {
  it('macros + a uix.style → the coexist note (UIX keeps rendering that style)', () => {
    expect(banner({ macros: { foo: {} }, style: MACRO_STYLE }, { cardMod: true })).toContain('UIX will keep');
  });
  it('macros without any uix.style → no note (nothing competes with the Studio\'s edits)', () => {
    expect(banner({ macros: { foo: {} } }, { cardMod: true })).toBe('');
  });
});

describe('what a save really does (the banner says only what is true)', () => {
  afterEach(() => restoreEngines());
  const uix = { macros: { foo: { template: 'x' } }, billets: { b: 1 }, style: MACRO_STYLE };
  it('macros / billets come back untouched and the macro call stays in the style', () => {
    installEngines(['uix']);
    const out = openEditSave(cfg({ type: 'tile', entity: 'light.a', uix }), enableBorderRadius);
    expect(out.uix?.macros).toEqual(uix.macros);
    expect(out.uix?.billets).toEqual(uix.billets);
    expect(out.uix?.style).toContain('{{ macros.foo() }}');
    expect(out.uix?.style).toContain('border-radius: 8px');
  });
  it('a plain style with a macros key: the key survives too', () => {
    installEngines(['uix']);
    const out = openEditSave(cfg({ type: 'tile', entity: 'light.a', uix: { macros: uix.macros, style: PLAIN } }), enableBorderRadius);
    expect(out.uix?.macros).toEqual(uix.macros);
  });
});

describe('uixStyleUsesMacro', () => {
  it.each([
    [undefined, false],
    [{ style: MACRO_STYLE }, false], // no macros/billets key at all
    [{ macros: { foo: {} }, style: PLAIN }, false],
    [{ macros: { foo: {} }, style: MACRO_STYLE }, true],
    [{ macros: 'raw string', style: 'a { b: {{ macros.x() }}; }' }, true],
    [{ macros: { 'a.b': {} }, style: 'a { b: {{ a.b() }}; }' }, true], // names are escaped, not regex
    [{ macros: { 'a.b': {} }, style: 'a { b: {{ aXb() }}; }' }, false],
    [{ macros: { foo: {} }, style: '{% call foo() %}x{% endcall %}' }, true],
    [{ macros: { foo: {} }, style: 'a { foo(); }' }, false], // outside a Jinja tag
  ] as const)('%j → %s', (uix, want) => expect(uixStyleUsesMacro(uix as never)).toBe(want));
});

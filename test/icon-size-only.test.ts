/**
 * Icon size without a forced colour: Icon Color's "Keep the card's colour"
 * mode (`none`) writes the size and no colour, a size-only style reloads as
 * enabled / none / size, and existing coloured styles are untouched. UI tests
 * drive the RENDERED handlers (pulled out of the template), not `_emit`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { DEFAULT_ICON_COLOR, mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { generateCss } from '../src/generator/css-generator.js';
import type { IconColorModuleState, StudioState } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

const EMPTY = mapToStudioState(parseStyleValue(''));
const parse = (css: string, k: string) => mapToStudioState(parseStyleValue(css), k);
const withIcon = (ic: Partial<IconColorModuleState>): StudioState => ({
  ...EMPTY,
  iconColor: { ...DEFAULT_ICON_COLOR, ...ic },
});
const NONE = { enabled: true, mode: 'none' as const, sizePx: 40 };

const MUSHROOM_LIGHT = 'custom:mushroom-light-card';
const BUBBLE_BUTTON = 'custom:bubble-card/button';

describe('mode none: size only, no colour block', () => {
  it.each([
    ['tile', 'ha-tile-icon {\n  --mdc-icon-size: 40px;\n}'],
    ['entity', 'ha-card {\n  --mdc-icon-size: 40px;\n  --ha-icon-size: 40px;\n}'],
    [MUSHROOM_LIGHT, 'ha-card {\n  --icon-size: 40px;\n}'],
    [BUBBLE_BUTTON, '.bubble-icon {\n  --mdc-icon-size: 40px;\n}'],
  ])('%s emits exactly the size declarations', (type, expected) => {
    const css = generateCss(withIcon(NONE), type);
    expect(css).toBe(expected);
    expect(css).not.toContain('color');
  });

  it('no size, mode none: nothing at all', () => {
    for (const t of ['tile', 'entity', MUSHROOM_LIGHT, BUBBLE_BUTTON]) {
      expect(generateCss(withIcon({ enabled: true, mode: 'none' }), t), t).toBe('');
    }
  });

  it('a conditional size still works in mode none', () => {
    const css = generateCss(withIcon({ ...NONE, sizeWhen: { when: 'on' }, sizeOffPx: 30 }), 'tile', {
      config: { type: 'tile', entity: 'light.a' },
    });
    expect(css).toContain(`{{ '40px' if is_state(config.entity, 'on') else '30px' }}`);
    expect(css).not.toContain('color');
  });
});

describe('a size-only style reloads as enabled / none / size', () => {
  it.each([['tile'], ['entity'], [MUSHROOM_LIGHT], [BUBBLE_BUTTON]])('%s round-trips byte-identically', (type) => {
    const css = generateCss(withIcon(NONE), type);
    const back = parse(css, type);
    expect(back.iconColor).toMatchObject({ enabled: true, mode: 'none', sizePx: 40 });
    expect(back.advanced.rawCss).toBe('');
    expect(generateCss(back, type)).toBe(css);
  });

  it('hand-written size-only CSS is adopted too', () => {
    const back = parse('ha-card {\n  --mdc-icon-size: 36px;\n  --ha-icon-size: 36px;\n}', 'sensor');
    expect(back.iconColor).toMatchObject({ enabled: true, mode: 'none', sizePx: 36 });
    expect(back.advanced.rawCss).toBe('');
  });

  it('size next to a colour the module does not recognise: the colour stays in Advanced CSS', () => {
    const css = "ha-state-icon {\n  color: {{ state_attr('light.a', 'color_name') }} !important;\n}\nha-card {\n  --mdc-icon-size: 36px;\n  --ha-icon-size: 36px;\n}";
    const back = parse(css, 'entity');
    expect(back.iconColor).toMatchObject({ enabled: true, mode: 'none', sizePx: 36 });
    expect(back.advanced.rawCss).toContain("state_attr('light.a', 'color_name')");
    expect(back.advanced.rawCss).not.toContain('--mdc-icon-size');
    // …and saving writes the colour once (Advanced), never a module colour.
    const out = generateCss(back, 'entity');
    expect(out.match(/color:/g)).toHaveLength(1);
  });

  it('colour-only and unrelated styles do not turn the module on', () => {
    expect(parse('ha-card { --mdc-icon-size: 36px; }', 'entity').iconColor.enabled).toBe(false);
    expect(parse('ha-card { color: red; }', 'entity').iconColor.enabled).toBe(false);
  });

  it('the Threshold-shaped case still keeps its size', () => {
    const css =
      "ha-state-icon {\n  color: {{ '#f00' if states('sensor.t')|float > 30 else '#0f0' }} !important;\n}\n" +
      'ha-card {\n  --mdc-icon-size: 32px;\n  --ha-icon-size: 32px;\n}';
    const back = parse(css, 'sensor');
    expect(back.iconColor.enabled).toBe(true);
    expect(back.iconColor.sizePx).toBe(32);
    expect(back.advanced.rawCss).not.toContain('--mdc-icon-size');
  });
});

describe('modes with a colour round-trip unchanged', () => {
  const cases: Array<[string, Partial<IconColorModuleState>]> = [
    ['plain', { enabled: true, mode: 'plain', color: '#112233', sizePx: 32 }],
    ['conditional', { enabled: true, mode: 'conditional', colorOn: '#112233', colorOff: '#445566', sizePx: 32 }],
    ['light', { enabled: true, mode: 'light', colorOff: '#445566', color: '#445566', colorOn: '#445566' }],
  ];
  for (const [name, ic] of cases) {
    it(`${name}: same mode, same bytes`, () => {
      const type = name === 'light' ? 'light' : 'tile';
      const css = generateCss(withIcon(ic), type, { config: { type, entity: 'light.a' } });
      const back = parse(css, type);
      expect(back.iconColor.mode).toBe(name);
      expect(generateCss(back, type, { config: { type, entity: 'light.a' } })).toBe(css);
    });
  }
});

describe('the Icon Color panel', () => {
  type El = {
    state: IconColorModuleState; allowSize: boolean; allowColor: boolean; isLightCard: boolean; cardEntity: string;
    _open: boolean; _renderBody(): unknown; render(): unknown; dispatchEvent(e: Event): boolean;
  };
  let Mod: new () => El;
  beforeAll(async () => {
    (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
      constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
    await import('../src/modules/module-icon-color.js');
    Mod = registry.get('cms-icon-color-module') as new () => El;
  });
  const handlers = (t: unknown): Array<(e: unknown) => void> => {
    if (typeof t === 'function') return [t as (e: unknown) => void];
    if (Array.isArray(t)) return t.flatMap(handlers);
    const v = (t as { values?: unknown[] } | null)?.values;
    return v ? v.flatMap(handlers) : [];
  };
  const make = (state: Partial<IconColorModuleState>, allowSize: boolean, cardEntity = 'light.a') => {
    const el = new Mod();
    el.state = { ...DEFAULT_ICON_COLOR, ...state };
    el.allowSize = allowSize;
    el.cardEntity = cardEntity;
    el._open = true;
    const emitted: IconColorModuleState[] = [];
    el.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail); return true; });
    // Render order of the header: click, keydown, switch click, switch change.
    const toggle = (checked: boolean) => handlers(el.render())[3]({ target: { checked } });
    return { el, emitted, toggle };
  };

  it('switching on where there is an Icon size control starts in "Keep the card\'s colour"', () => {
    const { toggle, emitted } = make({}, true);
    toggle(true);
    expect(emitted[0]).toMatchObject({ enabled: true, mode: 'none' });
    expect(generateCss({ ...EMPTY, iconColor: { ...emitted[0], sizePx: 32 } }, 'tile')).not.toContain('color');
  });

  it('without a size control it still starts in Different for ON / OFF', () => {
    const { toggle, emitted } = make({}, false);
    toggle(true);
    expect(emitted[0]).toMatchObject({ enabled: true, mode: 'conditional' });
  });

  it('a module the user already configured keeps its mode when switched back on', () => {
    for (const st of [{ mode: 'plain' as const }, { entityId: 'switch.s' }, { colorOn: '#123456', color: '#123456' }]) {
      const { toggle, emitted } = make(st, true);
      toggle(true);
      expect(emitted[0].mode).toBe(st.mode ?? 'conditional');
    }
  });

  it('switching off only turns it off', () => {
    const { toggle, emitted } = make({ enabled: true, mode: 'none', sizePx: 30 }, true);
    toggle(false);
    expect(emitted[0]).toMatchObject({ enabled: false, mode: 'none', sizePx: 30 });
  });

  it('mode none: the option is offered with a size control, no "Controlled by" row or hints, size row stays', () => {
    const t = templateText(make({ enabled: true, mode: 'none' }, true).el._renderBody());
    expect(t).toContain("Keep the card's colour");
    expect(t).toContain('Icon size');
    expect(t).not.toContain('Controlled by');
    expect(t).not.toContain('on/off state');
    expect(t).not.toContain('Color when');
  });

  it('without a size control the option is not offered, except to show a stored none', () => {
    expect(templateText(make({ enabled: true, mode: 'plain' }, false).el._renderBody())).not.toContain("Keep the card's colour");
    expect(templateText(make({ enabled: true, mode: 'none' }, false).el._renderBody())).toContain("Keep the card's colour");
  });

  it('the select emits none', () => {
    const { el, emitted } = make({ enabled: true, mode: 'conditional' }, true);
    handlers(el._renderBody())[0]({ target: { value: 'none' } });
    expect(emitted[0].mode).toBe('none');
  });
});

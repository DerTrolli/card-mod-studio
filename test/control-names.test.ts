/**
 * Every interactive control in every module has an accessible name, so a new
 * control can't ship unnamed. Each module is rendered (header + body) in
 * several states that between them show all of its rows; the rendered
 * template is walked by test/a11y-template.ts.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import { controlNames, sliderLabels, switchLabels, unnamedControls } from './a11y-template.js';
import {
  DEFAULT_ACCENT_COLOR, DEFAULT_ANIMATION, DEFAULT_BACKGROUND, DEFAULT_BORDER, DEFAULT_FILTER,
  DEFAULT_FONT, DEFAULT_HEADING_STYLE, DEFAULT_ICON_COLOR, DEFAULT_THRESHOLD,
} from '../src/parser/state-mapper.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const hass = {
  states: {
    'sensor.t': { state: '5', attributes: { temperature: 20, humidity: 50 } },
    'light.a': { state: 'on', attributes: {} },
  },
};
const cond = { when: 'value', valueEntity: 'sensor.t', valueAttribute: 'temperature', valueOperator: '>', valueThreshold: 3 };
const rule = (id: string, color = '#ff0000') => ({ id, operator: '<', value: 1, color });

/** [tag, props applied to the element] — every variant is rendered. */
const MODULES: Record<string, { tag: string; variants: Any[] }> = {
  font: {
    tag: 'cms-font-module',
    variants: [
      { cardType: 'tile', state: { ...DEFAULT_FONT, enabled: true, fontFamily: "'My Font'", fontWeight: 'bold', fontSize: 20 } },
      { cardType: 'gauge', numberSize: 'gauge', state: { ...DEFAULT_FONT, enabled: true, numberSizeEnabled: true, numberSize: 100 } },
      { cardType: 'thermostat', numberSize: 'thermostat', state: { ...DEFAULT_FONT, enabled: true } },
    ],
  },
  filter: {
    tag: 'cms-filter-module',
    variants: [
      { state: { ...DEFAULT_FILTER, enabled: true, grayscale: true, grayscaleWhen: 'custom', customEntity: 'light.a' } },
      { state: { ...DEFAULT_FILTER, enabled: true, grayscale: false, effectsWhen: cond } },
      { state: { ...DEFAULT_FILTER, enabled: true, effectsWhen: { when: 'custom', customEntity: 'light.a' } } },
    ],
  },
  accent: {
    tag: 'cms-accent-color-module',
    variants: [
      { cardEntity: 'light.a', state: { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'plain' } },
      { cardEntity: 'light.a', state: { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'conditional', entityId: 'light.a' } },
    ],
  },
  icon: {
    tag: 'cms-icon-color-module',
    variants: [
      { allowSize: true, state: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'plain', sizePx: 30, sizeWhen: cond, sizeOffPx: 20 } },
      { allowSize: true, cardEntity: 'light.a', state: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'conditional', entityId: 'light.a', sizePx: 30 } },
      { allowSize: true, cardEntity: 'light.a', state: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'light' } },
    ],
  },
  threshold: {
    tag: 'cms-threshold-module',
    variants: [
      { hass, cardEntity: 'sensor.t', state: { ...DEFAULT_THRESHOLD, enabled: true, entityId: 'sensor.t', attribute: 'temperature', valueMode: 'switch', properties: ['icon-color', 'border-color'], rules: [rule('a'), rule('b', '#00ff00')] } },
      { hass, cardEntity: 'sensor.t', state: { ...DEFAULT_THRESHOLD, enabled: true, valueMode: 'gradient' } },
    ],
  },
  background: {
    tag: 'cms-background-module',
    variants: [
      { state: { ...DEFAULT_BACKGROUND, enabled: true, type: 'solid' } },
      { state: { ...DEFAULT_BACKGROUND, enabled: true, type: 'gradient', applyWhen: 'custom', customEntity: 'light.a' } },
    ],
  },
  animation: {
    tag: 'cms-animation-module',
    variants: [
      { hass, state: { ...DEFAULT_ANIMATION, enabled: true, trigger: 'always' } },
      { hass, state: { ...DEFAULT_ANIMATION, enabled: true, trigger: 'custom', customEntity: 'light.a' } },
      { hass, state: { ...DEFAULT_ANIMATION, enabled: true, trigger: 'value', valueEntity: 'sensor.t', valueAttribute: 'temperature', valueOperator: '>', valueThreshold: 1 } },
    ],
  },
  border: {
    tag: 'cms-border-module',
    variants: [
      { hass, state: { ...DEFAULT_BORDER, enabled: true, borderWidth: 2, widthWhen: cond, widthOffPx: 1 } },
      { hass, state: { ...DEFAULT_BORDER, enabled: true, borderWidth: 0 } },
    ],
  },
  heading: {
    tag: 'cms-heading-style-module',
    variants: [
      { headingStyle: 'title', state: { ...DEFAULT_HEADING_STYLE, enabled: true, fontFamily: "'My Font'", fontSize: 20, iconSize: 20, textColor: '#fff', iconColor: '#fff', fontWeight: 'bold' } },
      { headingStyle: 'subtitle', state: { ...DEFAULT_HEADING_STYLE, enabled: true } },
    ],
  },
  advanced: {
    tag: 'cms-advanced-module',
    variants: [{ open: true, state: { rawCss: 'ha-card { color: red; }' }, pierced: [{ key: '$', value: 'x' }] }],
  },
};

beforeAll(async () => {
  (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
    constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
  await Promise.all([
    import('../src/modules/module-font.js'), import('../src/modules/module-filter.js'),
    import('../src/modules/module-accent-color.js'), import('../src/modules/module-icon-color.js'),
    import('../src/modules/module-threshold.js'), import('../src/modules/module-background.js'),
    import('../src/modules/module-animation.js'), import('../src/modules/module-border.js'),
    import('../src/modules/module-heading-style.js'), import('../src/modules/module-advanced.js'),
    import('../src/modules/module-entities-rows.js'),
  ]);
});

/** Header + (open) body of one module in one state. */
function renderModule(tag: string, props: Any): unknown[] {
  const Ctor = registry.get(tag) as new () => Any;
  const el = new Ctor();
  Object.assign(el, props);
  el._open = true;
  return [el.render()];
}

describe.each(Object.entries(MODULES))('%s module', (_name, { tag, variants }) => {
  it.each(variants.map((v, i) => [i, v] as const))('variant %i: every control is named', (_i, props) => {
    expect(unnamedControls(renderModule(tag, props))).toEqual([]);
  });

  it('no two controls in one rendering share a name', () => {
    for (const props of variants) {
      const names = controlNames(renderModule(tag, props)).filter((n) => !n.endsWith(':×'));
      const dupes = names.filter((n, i) => names.indexOf(n) !== i);
      expect(dupes).toEqual([]);
    }
  });

  it('each slider gives the name to the label part and to the host', () => {
    for (const props of variants) {
      for (const [label, aria] of sliderLabels(renderModule(tag, props))) {
        expect(label).not.toBe('');
        expect(aria).toBe(label);
      }
    }
  });
});

describe.each(Object.entries(MODULES))('%s module switches', (_name, { tag, variants }) => {
  it('each switch is named by its slotted text and by an equal aria-label', () => {
    for (const props of variants) {
      for (const [text, aria] of switchLabels(renderModule(tag, props))) {
        expect(text).not.toBe('');
        expect(aria).toBe(text);
      }
    }
  });
});

describe('Entity Rows module', () => {
  const rows = [{ entity: 'light.a' }, { entity: 'sensor.t' }];
  const styles = {
    '0': { iconColor: '#f00', iconMode: 'threshold', iconRules: [rule('i1')], iconDefault: '#888888', textColor: '#0f0', textMode: 'static', fontSizePx: 14, fontWeight: 'bold' },
    '1': { iconColor: '', textColor: '#fff', textMode: 'threshold', textRules: [rule('t1')], textDefault: '#888888' },
  };
  const make = () => {
    const Ctor = registry.get('cms-entities-rows-module') as new () => Any;
    const el = new Ctor();
    Object.assign(el, { rows, styles, hass });
    el._openRows = new Set(['0', '1']);
    el._fontOpen = new Set(['0', '1']);
    return el;
  };
  it('every control of every open row is named, and rows tell them apart', () => {
    const t = make().render();
    expect(unnamedControls(t)).toEqual([]);
    const names = controlNames(t);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
    for (const [text, aria] of switchLabels(t)) expect(aria).toBe(text);
  });
});

describe('the checker itself', () => {
  it('flags an unnamed switch, slider and select, and accepts the named forms', async () => {
    const { html } = await import('lit');
    expect(unnamedControls(html`<ha-switch></ha-switch><ha-slider aria-label="x"></ha-slider><select></select>`)).toHaveLength(3);
    expect(unnamedControls(html`
      <span id="l">Size</span><select aria-labelledby="l"></select>
      <ha-switch><span class="sr-only">On</span></ha-switch><ha-slider label="Size"></ha-slider>
      <label for="i">Name</label><input id="i" type="text" />`)).toEqual([]);
  });
});

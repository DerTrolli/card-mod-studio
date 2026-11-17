/**
 * Every piece of interface text goes through the translation layer.
 *
 * A pseudo language wraps every message in ⟦…⟧; the modules, the panel, the
 * palette manager, a stack child and the colour picker are rendered in many
 * states, and any word left outside a wrapper (in text or in a label, title,
 * placeholder or accessible name) is English that a translation would miss.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FakeCustomElementRegistry, renderedText } from './v010-audit-helpers.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { en, type MessageKey } from '../src/i18n/en.js';
import { LANGUAGES, setLanguageSetting, resetLanguageForTests } from '../src/i18n/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
registry.define('hui-card', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
(globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
  constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };

const target = LANGUAGES.de.messages as Record<MessageKey, string>;
const saved = { ...target };

beforeAll(async () => {
  for (const k of Object.keys(en) as MessageKey[]) target[k] = `⟦${en[k]}⟧`;
  setLanguageSetting('de');
  await import('../src/editor/cms-panel.js');
  await import('../src/editor/cms-tab.js');
});

afterAll(() => {
  for (const k of Object.keys(target) as MessageKey[]) delete target[k];
  Object.assign(target, saved);
  resetLanguageForTests();
});

/** Words a translation must not touch: CSS, YAML keys, examples, units. */
const ALLOWED = new Set([
  'px', 'ms', 'var', 'primary', 'color', 'needle', 'true', 'cards', 'card_mod', 'uix', 'sans', 'serif', 'font',
  'input_boolean', 'my_entity', 'sensor', 'temperature', 'binary_sensor', 'example', 'light', 'rrggbb', 'name',
]);

/** Language names are written in their own language, not translated. */
const LANGUAGE_NAMES = Object.values(LANGUAGES).map((l) => l.name).sort((a, b) => b.length - a.length); // longest first: "Português (Brasil)" before "Português"

/** English words outside the ⟦…⟧ wrappers, in text and in labelling attributes. */
function untranslated(t: string): string[] {
  const out: string[] = [];
  const scan = (s: string) => {
    let left = s;
    // Messages nest (a translated noun inside a translated sentence): innermost first.
    for (let prev = ''; prev !== left; ) { prev = left; left = left.replace(/⟦[^⟦⟧]*⟧/g, ' '); }
    for (const n of LANGUAGE_NAMES) left = left.split(n).join(' ');
    left = left.replace(/var\(--[\w-]+\)/g, ' ').replace(/[#.]?[\w-]+\.[\w-]+/g, ' ');
    left = left.replace(/#[0-9a-fA-F]{3,8}\b/g, ' ');
    for (const raw of left.match(/[A-Za-z][A-Za-z']{2,}/g) ?? []) {
      const w = raw.replace(/'+$/, '');
      if (!ALLOWED.has(w.toLowerCase())) out.push(w);
    }
  };
  for (const m of t.matchAll(/\b(?:label|aria-label|title|placeholder|accessible-name)="([^"]*)"/g)) scan(m[1]);
  let text = t
    // data shown as is: entity names, card types, preset and colour names
    .replace(/<span class="(?:entity-name|child-title|child-sub|color-label)">[^<]*<\/span>/g, ' ');
  // Messages may contain < or > (an operator): drop them before reading tags.
  for (let prev = ''; prev !== text; ) { prev = text; text = text.replace(/⟦[^⟦⟧]*⟧/g, ' '); }
  text = text
    .replace(/="[^"]*"/g, '=""')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<code>[\s\S]*?<\/code>/g, ' ')
    .replace(/<pre>[\s\S]*?<\/pre>/g, ' ')
    .replace(/<h2>Card-Mod Studio<\/h2>/g, ' ')
    .replace(/<[^>]*>/g, ' ');
  scan(text);
  return out;
}

type AnyEl = Record<string, unknown> & { render(): unknown; _renderBody?: () => unknown };
const make = (tag: string, props: Record<string, unknown>): AnyEl => {
  const El = registry.get(tag) as new () => AnyEl;
  const el = new El();
  Object.assign(el, props);
  return el;
};
const body = (el: AnyEl) =>
  renderedText(el._renderBody && el._renderBody.length === 0 ? [el.render(), el._renderBody()] : el.render());

const BLANK = mapToStudioState(parseStyleValue(''));
const hass = {
  states: {
    'light.a': { entity_id: 'light.a', state: 'on', attributes: { friendly_name: 'Lamp', brightness: 100 } },
    'sensor.t': { entity_id: 'sensor.t', state: '21', attributes: { battery: 50 } },
  },
  themes: {},
};

describe('every visible text is translatable', () => {
  const cases: Array<[string, string, Record<string, unknown>]> = [
    ['font', 'cms-font-module', { state: { ...BLANK.font, enabled: true }, allowSize: true, allowColor: true, cardType: 'gauge', numberSize: 'gauge', thresholdOwned: true, overridden: true, overriddenDetail: 'ha-card { color }' }],
    ['font custom family', 'cms-font-module', { state: { ...BLANK.font, enabled: true, fontFamily: 'Comic', color: 'red' }, allowSize: true, allowColor: true, cardType: 'thermostat', numberSize: 'thermostat', thresholdOwned: true }],
    ['font locked number', 'cms-font-module', { state: { ...BLANK.font, enabled: true, numberSizeLocked: true }, numberSize: 'gauge', cardType: 'gauge' }],
    ['filter', 'cms-filter-module', { state: { ...BLANK.filter, enabled: true, grayscale: true, grayscaleWhen: 'custom' }, hass, cardEntity: 'light.a' }],
    ['filter effects', 'cms-filter-module', { state: { ...BLANK.filter, enabled: true, effectsWhen: { when: 'value', valueEntity: 'sensor.t' } }, hass }],
    ['accent plain gauge', 'cms-accent-color-module', { state: { ...BLANK.accentColor, enabled: true, mode: 'plain' }, cardType: 'gauge', thresholdOwned: true, hass }],
    ['accent on/off', 'cms-accent-color-module', { state: { ...BLANK.accentColor, enabled: true, mode: 'conditional' }, cardEntity: 'sensor.t', stateAware: false, hass }],
    ['accent triplet', 'cms-accent-color-module', { state: { ...BLANK.accentColor, enabled: true, mode: 'plain', color: 'url(x)' }, tripletAccent: true, hass }],
    ['icon light', 'cms-icon-color-module', { state: { ...BLANK.iconColor, enabled: true, mode: 'light' }, isLightCard: true, allowSize: true, sizeMax: 64, thresholdOwned: true, hass, cardEntity: 'light.a' }],
    ['icon none', 'cms-icon-color-module', { state: { ...BLANK.iconColor, enabled: true, mode: 'none', sizePx: 30, sizeWhen: { when: 'on' } }, allowSize: true, sizeMax: 64, hass }],
    ['icon on/off', 'cms-icon-color-module', { state: { ...BLANK.iconColor, enabled: true, mode: 'conditional', entityId: 'light.a' }, cardEntity: 'sensor.t', hass }],
    ['icon colourless', 'cms-icon-color-module', { state: { ...BLANK.iconColor, enabled: true }, allowColor: false, allowSize: true, sizeMax: 64 }],
    ['threshold step', 'cms-threshold-module', { state: { ...BLANK.threshold, enabled: true, entityId: 'sensor.t', properties: ['border-color'], rules: [{ id: 'a', operator: '>', value: 1, color: 'red' }, { id: 'b', operator: '>', value: 5, color: 'blue' }] }, cardType: 'gauge', hass }],
    ['threshold fade', 'cms-threshold-module', { state: { ...BLANK.threshold, enabled: true, entityId: 'sensor.t', valueMode: 'gradient', properties: [] }, hass }],
    ['threshold fade one point', 'cms-threshold-module', { state: { ...BLANK.threshold, enabled: true, entityId: 'sensor.t', valueMode: 'gradient', colorStops: [{ id: 'x', value: 0, color: 'red' }] }, hass }],
    ['background gradient', 'cms-background-module', { state: { ...BLANK.background, enabled: true, type: 'gradient', applyWhen: 'on' }, thresholdOwned: true, hass }],
    ['background solid', 'cms-background-module', { state: { ...BLANK.background, enabled: true, applyWhen: 'off' }, hass }],
    ['animation value', 'cms-animation-module', { state: { ...BLANK.animation, enabled: true, preset: 'gradient-shift', trigger: 'value', valueEntity: 'sensor.t', valueAttribute: 'battery' }, hass }],
    ['animation custom', 'cms-animation-module', { state: { ...BLANK.animation, enabled: true, trigger: 'custom' }, hass }],
    ['animation on/off', 'cms-animation-module', { state: { ...BLANK.animation, enabled: true, trigger: 'on' }, hass }],
    ['border', 'cms-border-module', { state: { ...BLANK.border, enabled: true, borderWidth: 2, widthWhen: { when: 'custom' } }, thresholdOwned: true, hass }],
    ['border off-width', 'cms-border-module', { state: { ...BLANK.border, enabled: true, borderWidth: 2, widthWhen: { when: 'value', valueEntity: 'sensor.t' }, widthOffPx: 0 }, hass }],
    ['heading', 'cms-heading-style-module', { state: { ...BLANK.headingStyle, enabled: true, fontFamily: 'Comic' } }],
    ['heading set', 'cms-heading-style-module', { state: { ...BLANK.headingStyle, enabled: true, fontSize: 20, iconSize: 20 }, headingStyle: 'subtitle' }],
    ['advanced', 'cms-advanced-module', { state: { rawCss: 'ha-card {' }, open: true, pierced: [{ key: 'ha-gauge$', value: 'x' }] }],
    ['palette', 'cms-palette-manager', { _open: true }],
    ['settings', 'cms-settings', { _open: true }],
    ['preset manager', 'cms-preset-manager', { _open: true, presets: [{ name: 'Warm', state: {} }, { name: 'Cool', state: {} }], cardState: {}, _armed: 'Cool', _renameError: 'x', _exportText: '{}', _exportNote: 'x', _pasteNote: 'x' }],
    ['preset manager empty', 'cms-preset-manager', { _open: true, presets: [] }],
    ['language notice', 'cms-language-notice', {}],
  ];
  for (const [name, tag, props] of cases) {
    it(name, () => {
      const el = make(tag, { _open: true, ...props });
      const text = body(el);
      expect(text.trim(), 'rendered nothing').not.toBe('');
      expect(untranslated(text)).toEqual([]);
    });
  }

  it('the language question is rendered (not skipped) in the scan', () => {
    expect(body(make('cms-language-notice', {}))).toContain(`⟦${en['settings.noticeText']}⟧`);
  });

  it('entities rows (static, threshold, font, while-on, frozen, override)', () => {
    const rows = [{ entity: 'light.a' }, { entity: 'sensor.t' }, { entity: 'light.a' }, { type: 'section', label: 'x' }];
    const styles = {
      '0': { iconColor: 'red', textColor: '', fontSizePx: 20, fontWeight: 'bold' as const, extraCss: ':host { color: red; }' },
      '1': { iconColor: '', textColor: '', iconMode: 'threshold' as const, iconRules: [{ id: 'a', operator: '>' as const, value: 1, color: 'red' }], iconDefault: '#888', textMode: 'threshold' as const, textRules: [{ id: 'b', operator: '<' as const, value: 1, color: 'red' }], textDefault: '#888' },
      '2': { iconColor: '', textColor: '', frozen: true },
    };
    const el = make('cms-entities-rows-module', { rows, styles, hass, _openRows: new Set(['0', '1', '2']), _fontOpen: new Set(['0']) });
    expect(untranslated(renderedText(el.render()))).toEqual([]);
  });

  it('panel: banners, preset bar, preview labels, lock and layout notes', () => {
    const P = registry.get('cms-panel') as new () => AnyEl & { config?: unknown; hass?: unknown; _initState(): void };
    const texts: string[] = [];
    const panel = (config: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
      const p = new P();
      p.config = config;
      p.hass = hass;
      p._initState();
      Object.assign(p, extra);
      texts.push(renderedText(p.render()));
    };
    panel({ type: 'tile', entity: 'light.a', card_mod: { style: '{% if 1 %}a{% endif %}' } });
    panel({ type: 'tile', entity: 'light.a', card_mod: { style: 'ha-card { --x: 1; }' } }, { _selectedPreset: 'Mine', _presetsLocalOnly: true });
    panel({ type: 'tile', entity: 'light.a' }, { _namingPreset: true, _presetNameTried: true });
    panel({ type: 'tile', entity: 'light.a' }, { _selectedPreset: 'Mine', _deleteArmed: true, _presetsUnsaved: true });
    panel({ type: 'tile', entity: 'light.a', card_mod: { style: 'a' }, uix: { style: { 'x$': 'y' } } });
    panel({ type: 'tile', entity: 'light.a', card_mod: { style: { '.': { x: 'y' } } } });
    panel({ type: 'vertical-stack', cards: [{ type: 'tile', entity: 'light.a' }] });
    panel({ type: 'conditional', card: { type: 'tile' } });
    panel({ type: 'custom:not-known' });
    panel({ type: 'tile', entity: 'light.a', uix: { style: 'ha-card { color: red; }' } }, { _uixPresent: false, _cardModPresent: true });
    panel({ type: 'tile' }, { _uixPresent: false, _cardModPresent: false });
    for (const t of texts) expect(untranslated(t)).toEqual([]);
  });

  it('stack child: header, nested container and lock notes', () => {
    const C = registry.get('cms-child-card-section') as new () => AnyEl;
    for (const childConfig of [
      { type: 'tile', entity: 'light.a', card_mod: { style: 'ha-card { color: red; }' } },
      { type: 'vertical-stack', cards: [] },
      { type: 'tile', card_mod: { style: 'a' }, uix: { style: { 'x$': 'y' } } },
      { type: 'custom:not-known' },
    ]) {
      const c = new C();
      Object.assign(c, { childConfig, index: 0, hass, _open: true });
      (c as unknown as { willUpdate?: (m: Map<string, unknown>) => void }).willUpdate?.(new Map([['childConfig', undefined]]));
      expect(untranslated(renderedText(c.render()))).toEqual([]);
    }
  });

  it('colour picker body and its invalid-value hint', () => {
    for (const validation of ['background', 'stop', undefined]) {
      const el = make('cms-color-picker', { label: 'X', value: 'nope', clearable: true, _invalid: true, validation });
      const pick = el as unknown as { _renderPickerBody(): unknown };
      expect(untranslated(renderedText([el.render(), pick._renderPickerBody()]))).toEqual([]);
    }
    const compact = make('cms-color-picker', { label: 'X', value: '#fff', compact: true });
    expect(untranslated(renderedText(compact.render()))).toEqual([]);
  });

  it('Style button', () => {
    for (const active of [false, true]) {
      expect(untranslated(renderedText(make('cms-tab-button', { active }).render()))).toEqual([]);
    }
  });
});

/**
 * A card whose config has no `entity` must never get a template that reads
 * `config.entity`: it fails to render and the style engine drops EVERY rule
 * of the card's style. Pinned here at the generator (the last line of
 * defence), the loader (existing broken styles heal) and the panel gating.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { generateCss, settleEntityless } from '../src/generator/css-generator.js';
import { applyStudioState, buildMergedStudioState } from '../src/editor/studio-state.js';
import { hasOwnEntity, isStateAware, panelStateAware } from '../src/utils/card-caps.js';
import { profileKeyOf } from '../src/utils/custom-card-profiles.js';
import {
  DEFAULT_FILTER,
  DEFAULT_ICON_COLOR,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_BACKGROUND,
  DEFAULT_ANIMATION,
  DEFAULT_BORDER,
  DEFAULT_HEADING_STYLE,
  DEFAULT_FONT,
  DEFAULT_THRESHOLD,
} from '../src/parser/state-mapper.js';
import { installEngines, restoreEngines, cfg, FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import type { StudioState, StyleCondition } from '../src/types/index.js';

afterEach(() => restoreEngines());

const base = (): StudioState => ({
  filter: { ...DEFAULT_FILTER },
  iconColor: { ...DEFAULT_ICON_COLOR },
  accentColor: { ...DEFAULT_ACCENT_COLOR },
  background: { ...DEFAULT_BACKGROUND },
  animation: { ...DEFAULT_ANIMATION },
  border: { ...DEFAULT_BORDER },
  headingStyle: { ...DEFAULT_HEADING_STYLE },
  font: { ...DEFAULT_FONT },
  threshold: { ...DEFAULT_THRESHOLD },
  advanced: { rawCss: '' },
});

// Card configs as the panels see them. A profile card is keyed by
// profileKeyOf(config) — `custom:` prefix, Bubble's `card_type` / slider — so
// the Mushroom / Bubble profile emitters really run (a bare 'bubble-card'
// key reaches none of them).
const BUBBLE = { type: 'custom:bubble-card', card_type: 'button' };
const CARDS: Array<Record<string, unknown>> = [
  ...[
    'entities', 'glance', 'markdown', 'heading', 'picture', 'picture-elements', 'calendar', 'area',
    'date', 'button', 'tile', 'light', 'gauge', 'iframe',
  ].map((type) => ({ type })),
  { type: 'custom:mushroom-template-card' },
  { type: 'custom:mushroom-light-card' },
  { type: 'custom:mushroom-entity-card' },
  { ...BUBBLE, button_type: 'switch' },
  { ...BUBBLE, button_type: 'slider' },
  { type: 'custom:bubble-card', card_type: 'cover' },
];
const CARD_TYPES = CARDS.map((c) => profileKeyOf(c));
const cardOf = (key: string): Record<string, unknown> => CARDS[CARD_TYPES.indexOf(key)];
const ENTITYLESS: Array<Record<string, unknown>> = [{}, { entity: '' }, { entity: '   ' }, { entity: null }, { entity: 42 }];
const WHENS: StyleCondition['when'][] = ['always', 'on', 'off', 'custom', 'value'];

/** Every module / condition / mode value, each over an entity-less config. */
function sweepStates(): Array<[string, StudioState]> {
  const out: Array<[string, StudioState]> = [];
  const add = (label: string, patch: Partial<StudioState>) => out.push([label, { ...base(), ...patch }]);
  const cond = (when: StyleCondition['when']): StyleCondition => ({
    when, customEntity: when === 'custom' ? undefined : undefined, valueOperator: '>', valueThreshold: 1,
  });
  for (const gw of ['always', 'on', 'off', 'custom'] as const) {
    for (const gs of [true, false]) {
      add(`grayscale ${gw} ${gs}`, { filter: { ...DEFAULT_FILTER, enabled: true, grayscale: gs, grayscaleWhen: gw, brightness: 80 } });
    }
  }
  for (const w of WHENS) {
    add(`filter effects ${w}`, { filter: { ...DEFAULT_FILTER, enabled: true, blur: 2, effectsWhen: cond(w) } });
    add(`border width ${w}`, { border: { ...DEFAULT_BORDER, enabled: true, borderWidth: 2, widthWhen: cond(w) } });
    add(`icon size ${w}`, { iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'plain', sizePx: 32, sizeWhen: cond(w) } });
    if (w !== 'value') add(`background ${w}`, { background: { ...DEFAULT_BACKGROUND, enabled: true, applyWhen: w as 'on' } });
    add(`animation ${w}`, { animation: { ...DEFAULT_ANIMATION, enabled: true, trigger: w as 'on' } });
  }
  // A picked entity is a different entity — fine on any card.
  const picked = (when: StyleCondition['when']): StyleCondition => ({ when, customEntity: 'light.a', valueEntity: 'sensor.t', valueOperator: '>', valueThreshold: 1 });
  add('grayscale custom picked', { filter: { ...DEFAULT_FILTER, enabled: true, grayscale: true, grayscaleWhen: 'custom', customEntity: 'light.a' } });
  add('filter effects custom picked', { filter: { ...DEFAULT_FILTER, enabled: true, blur: 2, effectsWhen: picked('custom') } });
  add('border width custom picked', { border: { ...DEFAULT_BORDER, enabled: true, borderWidth: 2, widthWhen: picked('custom') } });
  add('icon size custom picked', { iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'none', sizePx: 32, sizeWhen: picked('custom') } });
  add('icon size value picked', { iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'none', sizePx: 32, sizeWhen: picked('value') } });
  add('background custom picked', { background: { ...DEFAULT_BACKGROUND, enabled: true, applyWhen: 'custom', customEntity: 'light.a' } });
  add('animation custom picked', { animation: { ...DEFAULT_ANIMATION, enabled: true, trigger: 'custom', customEntity: 'light.a' } });
  for (const m of ['conditional', 'light'] as const) {
    add(`icon colour ${m} picked`, { iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: m, entityId: 'light.a', sizePx: 30 } });
  }
  add('accent conditional picked', { accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'conditional', entityId: 'switch.s' } });
  add('icon colour none', { iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'none', sizePx: 30 } });
  // Threshold reads its own entity, never config.entity — with or without one.
  for (const entityId of ['sensor.t', '']) {
    add(`threshold all properties (entity "${entityId}")`, {
      threshold: {
        ...DEFAULT_THRESHOLD, enabled: true, entityId,
        properties: ['icon-color', 'accent-color', 'background', 'text-color', 'border-color'],
        rules: [{ id: 'r1', operator: '>', value: 5, color: '#ff0000' }],
      },
    });
  }
  // …in every mode, with a picked attribute, on the entity-less entities card
  // (Threshold is offered there since v0.11 and the user must pick the source).
  for (const mode of ['switch', 'gradient'] as const) {
    for (const [entityId, attribute] of [['sensor.t', ''], ['sensor.t', 'battery'], ['', ''], ['', 'battery']]) {
      add(`threshold ${mode} bg/text/border (entity "${entityId}", attribute "${attribute}")`, {
        threshold: {
          ...DEFAULT_THRESHOLD, enabled: true, entityId, attribute, valueMode: mode,
          properties: ['background', 'text-color', 'border-color'],
          rules: [{ id: 'r1', operator: '>', value: 5, color: '#ff0000' }],
          colorStops: [{ id: 's1', value: 0, color: '#00ff00' }, { id: 's2', value: 100, color: '#ff0000' }],
        },
      });
    }
  }
  for (const m of ['plain', 'conditional', 'light'] as const) {
    add(`icon colour ${m}`, { iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: m, entityId: undefined } });
  }
  for (const m of ['plain', 'conditional'] as const) {
    add(`accent ${m}`, { accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: m, entityId: undefined } });
  }
  return out;
}

describe('generateCss — entity-less card never emits config.entity', () => {
  it('the profile cards are keyed as the panels key them', () => {
    expect(CARD_TYPES).toContain('custom:mushroom-template-card');
    expect(CARD_TYPES).toContain('custom:bubble-card/button');
    expect(CARD_TYPES).toContain('custom:bubble-card/button/slider');
    expect(CARD_TYPES).toContain('custom:bubble-card/cover');
  });

  it('the sweep is not vacuous: with an entity, the profile cards DO write config.entity', () => {
    const own: StudioState = {
      ...base(),
      iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'conditional' },
      accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'conditional' },
      background: { ...DEFAULT_BACKGROUND, enabled: true, applyWhen: 'on' },
    };
    for (const key of ['custom:mushroom-template-card', 'custom:mushroom-light-card', 'custom:bubble-card/button']) {
      const css = generateCss(own, key, { config: { ...cardOf(key), entity: 'light.a' } });
      expect(css, key).toContain('config.entity');
      expect(generateCss(own, key, { config: cardOf(key) }), key).not.toContain('config.entity');
    }
  });

  for (const type of CARD_TYPES) {
    it(`${type}: every module / condition / mode over entity-less configs`, () => {
      for (const config of ENTITYLESS) {
        for (const [label, state] of sweepStates()) {
          const css = generateCss(state, type, { config: { ...cardOf(type), ...config } });
          expect(css, `${type} ${JSON.stringify(config)} ${label}`).not.toContain('config.entity');
        }
      }
    });

    it(`${type}: everything switched on at once`, () => {
      const all: StudioState = {
        ...base(),
        filter: { ...DEFAULT_FILTER, enabled: true, grayscale: true, grayscaleWhen: 'off', blur: 1 },
        iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'light', sizePx: 30, sizeWhen: { when: 'on' } },
        accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'conditional' },
        background: { ...DEFAULT_BACKGROUND, enabled: true, applyWhen: 'on' },
        animation: { ...DEFAULT_ANIMATION, enabled: true, trigger: 'off' },
        border: { ...DEFAULT_BORDER, enabled: true, borderWidth: 2, widthWhen: { when: 'off' } },
      };
      expect(generateCss(all, type, { config: cardOf(type) })).not.toContain('config.entity');
    });
  }

  it('an own-entity condition falls back to unconditional, the rest of the style survives', () => {
    const state: StudioState = {
      ...base(),
      font: { ...DEFAULT_FONT, enabled: true, fontSize: 20 },
      background: { ...DEFAULT_BACKGROUND, enabled: true, applyWhen: 'on', color1: '#ffeecc' },
      filter: { ...DEFAULT_FILTER, enabled: true, grayscale: true },
    };
    const css = generateCss(state, 'entities', { config: { type: 'entities' } });
    expect(css).toContain('font-size: 20px');
    expect(css).toContain('background: #ffeecc;');
    expect(css).toContain('filter: grayscale(100%);');
  });

  it('keeps conditions on ANOTHER entity and on a value', () => {
    const state: StudioState = {
      ...base(),
      background: { ...DEFAULT_BACKGROUND, enabled: true, applyWhen: 'custom', customEntity: 'light.a' },
      border: { ...DEFAULT_BORDER, enabled: true, borderWidth: 2, widthWhen: { when: 'value', valueEntity: 'sensor.t', valueOperator: '>', valueThreshold: 5 } },
      iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'conditional', entityId: 'switch.s' },
    };
    const css = generateCss(state, 'glance', { config: { type: 'glance' } });
    expect(css).toContain(`is_state('light.a', 'on')`);
    expect(css).toContain(`states('sensor.t')`);
    expect(css).toContain(`is_state('switch.s', 'on')`);
  });

  it('on/off icon colour / accent with no entity picked write NO colour (no grey nobody chose)', () => {
    const state: StudioState = {
      ...base(),
      iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'conditional', colorOn: '#111111', colorOff: '#222222' },
      accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'conditional', colorOn: '#333333', colorOff: '#444444' },
    };
    for (const type of ['markdown', 'tile', 'light', 'custom:mushroom-template-card', 'custom:bubble-card/button']) {
      const css = generateCss(state, type, { config: cardOf(type) ?? { type } });
      expect(css, type).toBe('');
    }
    // …and with an entity picked, that entity is watched as before.
    const picked = { ...state, iconColor: { ...state.iconColor, entityId: 'switch.s' } };
    expect(generateCss(picked, 'markdown', { config: { type: 'markdown' } })).toContain(`is_state('switch.s', 'on')`);
    const pickedAccent = { ...state, accentColor: { ...state.accentColor, entityId: 'switch.s' } };
    expect(generateCss(pickedAccent, 'markdown', { config: { type: 'markdown' } })).toContain(`is_state('switch.s', 'on')`);
  });

  it('…but the icon size is still written, and a fixed colour is untouched', () => {
    const sized: StudioState = {
      ...base(),
      iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'conditional', sizePx: 36 },
    };
    expect(generateCss(sized, 'tile', { config: { type: 'tile' } })).toBe('ha-tile-icon {\n  --tile-icon-size: 54px;\n  --mdc-icon-size: 36px;\n}');
    const light = { ...sized, iconColor: { ...sized.iconColor, mode: 'light' as const } };
    expect(generateCss(light, 'tile', { config: { type: 'tile' } })).toBe('ha-tile-icon {\n  --tile-icon-size: 54px;\n  --mdc-icon-size: 36px;\n}');
    const fixed: StudioState = {
      ...base(),
      iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'plain', color: '#123456' },
      accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'plain', color: '#654321' },
    };
    const css = generateCss(fixed, 'tile', { config: { type: 'tile' } });
    expect(css).toContain('color: #123456 !important;');
    expect(css).toContain('--accent-color: #654321;');
  });

  it('a card WITH an entity is untouched (same state object, own-entity templates kept)', () => {
    const state = base();
    expect(settleEntityless(state, { type: 'tile', entity: 'light.a' })).toBe(state);
    const withOn: StudioState = {
      ...base(),
      filter: { ...DEFAULT_FILTER, enabled: true, grayscale: true, grayscaleWhen: 'off' },
      background: { ...DEFAULT_BACKGROUND, enabled: true, applyWhen: 'on' },
    };
    const css = generateCss(withOn, 'tile', { config: { type: 'tile', entity: 'light.a' } });
    expect(css).toContain(`is_state(config.entity, 'off')`);
    expect(css).toContain(`is_state(config.entity, 'on')`);
    // …and with no config at all (legacy callers) nothing changes either.
    expect(generateCss(withOn, 'tile')).toBe(css);
  });

  it('Advanced CSS is the user\'s own text and is never rewritten', () => {
    const state = { ...base(), advanced: { rawCss: `ha-card { color: {{ 'red' if is_state(config.entity, 'on') else 'blue' }}; }` } };
    expect(generateCss(state, 'entities', { config: { type: 'entities' } })).toContain('config.entity');
  });
});

describe('the panels\' state-aware flag', () => {
  // cms-panel._isStateAware and cms-child-card-section both call panelStateAware.
  const hass = { states: { 'light.a': { state: 'on' }, 'sensor.t': { state: '3' } } };
  it('an entity-less card is never state-aware, whatever its type', () => {
    for (const type of ['tile', 'light', 'button', 'entities', 'custom:mushroom-template-card', 'sensor']) {
      for (const c of ENTITYLESS) expect(panelStateAware(type, { type, ...c }, hass), `${type} ${JSON.stringify(c)}`).toBe(false);
    }
    expect(panelStateAware('tile', null)).toBe(false);
  });
  it('a card with an entity answers by its type / the entity', () => {
    expect(panelStateAware('tile', { type: 'tile', entity: 'light.a' }, hass)).toBe(true);
    expect(panelStateAware('tile', { type: 'tile', entity: 'sensor.t' }, hass)).toBe(false);
    expect(panelStateAware('sensor', { type: 'sensor', entity: 'sensor.t' })).toBe(false);
    expect(panelStateAware('tile', { type: 'tile', entity: 'light.zzz' }, hass)).toBe(true);
  });
  it('the type-only answer (isStateAware without an entity) is unchanged', () => {
    expect(isStateAware('tile', undefined)).toBe(true);
    expect(isStateAware('sensor', undefined)).toBe(false);
  });
});

describe('hasOwnEntity / isStateAware', () => {
  it('needs a non-empty string entity', () => {
    for (const c of ENTITYLESS) expect(hasOwnEntity(c)).toBe(false);
    expect(hasOwnEntity(undefined)).toBe(false);
    expect(hasOwnEntity({ entity: 'light.a' })).toBe(true);
  });

  it('a card with an entity keeps the old answer', () => {
    expect(isStateAware('tile', 'light.a')).toBe(true);
    expect(isStateAware('sensor', 'sensor.a')).toBe(false);
    expect(isStateAware('tile', 'sensor.a', { states: { 'sensor.a': { state: '3' } } })).toBe(false);
  });
});

describe('existing broken styles heal', () => {
  const BROKEN = [
    'ha-card {',
    '  font-size: 20px;',
    '  filter: {{ \'grayscale(100%)\' if is_state(config.entity, \'off\') else \'none\' }};',
    '  background: {{ \'#ffeecc\' if is_state(config.entity, \'on\') else \'none\' }};',
    '  border: {{ \'2px solid #f00\' if is_state(config.entity, \'on\') else \'none\' }};',
    '  animation: {{ \'cms-pulse 2s ease-in-out infinite\' if is_state(config.entity, \'on\') else \'none\' }};',
    '}',
    '@keyframes cms-pulse {\n  0%, 100% { transform: scale(1); }\n  50% { transform: scale(1.05); }\n}',
  ].join('\n');

  it('loads as "always" (the panel never claims an ON/OFF it will not save) and saves a valid style', () => {
    installEngines(['card-mod']);
    const config = cfg({ type: 'entities', entities: ['light.a'], card_mod: { style: BROKEN } });
    const s = buildMergedStudioState(config);
    expect(s.filter.grayscale).toBe(true);
    expect(s.filter.grayscaleWhen).toBe('always');
    expect(s.background.applyWhen).toBe('always');
    expect(s.border.widthWhen).toBeUndefined();
    expect(s.animation.trigger).toBe('always');
    expect(s.font.enabled).toBe(true);

    const saved = String(applyStudioState(s, config).card_mod?.style);
    expect(saved).not.toContain('config.entity');
    expect(saved).toContain('font-size: 20px');
    expect(saved).toContain('background: #ffeecc;');

    // And what the panel shows after reopening the saved style is what's stored.
    const again = buildMergedStudioState(cfg({ ...config, card_mod: { style: saved } }));
    expect(again.filter.grayscaleWhen).toBe('always');
    expect(again.background.applyWhen).toBe('always');
    expect(String(applyStudioState(again, config).card_mod?.style)).toBe(saved);
  });

  it('the same style on a card that HAS an entity keeps its ON/OFF conditions', () => {
    installEngines(['card-mod']);
    const config = cfg({ type: 'tile', entity: 'light.a', card_mod: { style: BROKEN } });
    const s = buildMergedStudioState(config);
    expect(s.filter.grayscaleWhen).toBe('off');
    expect(s.background.applyWhen).toBe('on');
    expect(String(applyStudioState(s, config).card_mod?.style)).toContain(`is_state(config.entity, 'on')`);
  });

  it('switching Grayscale on over defaults writes the unconditional form on an entity-less card', () => {
    installEngines(['card-mod']);
    const config = cfg({ type: 'entities', entities: ['light.a'] });
    const s = buildMergedStudioState(config);
    const next = applyStudioState({ ...s, filter: { ...s.filter, enabled: true, grayscale: true } }, config);
    expect(String(next.card_mod?.style)).toContain('filter: grayscale(100%);');
    expect(String(next.card_mod?.style)).not.toContain('config.entity');
  });

  it('a stack child without an entity is covered through the shared write path', () => {
    installEngines(['card-mod']);
    const child = cfg({ type: 'glance', entities: ['light.a'] });
    const s = { ...buildMergedStudioState(child), filter: { ...DEFAULT_FILTER, enabled: true, grayscale: true } };
    expect(String(applyStudioState(s, child).card_mod?.style)).not.toContain('config.entity');
  });
});


describe('Icon Color / Accent on an entity-less card: nothing written until an entity is picked', () => {
  const sizedOnOff = (s: StudioState): StudioState => ({
    ...s,
    iconColor: { ...s.iconColor, enabled: true, mode: 'conditional', sizePx: 36 },
    accentColor: { ...s.accentColor, enabled: true, mode: 'conditional' },
  });

  it('no colour is saved, the size survives a reopen, and picking the entity writes the colour', () => {
    installEngines(['card-mod']);
    const config = cfg({ type: 'tile' });
    const saved = String(applyStudioState(sizedOnOff(buildMergedStudioState(config)), config).card_mod?.style);
    expect(saved).toBe('ha-tile-icon {\n  --tile-icon-size: 54px;\n  --mdc-icon-size: 36px;\n}');

    const again = buildMergedStudioState(cfg({ ...config, card_mod: { style: saved } }));
    expect(again.iconColor).toMatchObject({ enabled: true, mode: 'none', sizePx: 36 });
    expect(String(applyStudioState(again, config).card_mod?.style)).toBe(saved);

    // Picking the entity to watch (on a still entity-less card) writes it.
    const watch = {
      ...sizedOnOff(buildMergedStudioState(config)),
    };
    watch.iconColor = { ...watch.iconColor, entityId: 'switch.s' };
    const out = String(applyStudioState(watch, config).card_mod?.style);
    expect(out).toContain(`is_state('switch.s', 'on')`);
    expect(out).not.toContain('config.entity');
  });

  it('the stored state keeps ON / OFF so the panel can still pick the entity', () => {
    installEngines(['card-mod']);
    const config = cfg({ type: 'tile' });
    const s = sizedOnOff(buildMergedStudioState(config));
    applyStudioState(s, config);
    expect(s.iconColor.mode).toBe('conditional');
    expect(s.accentColor.mode).toBe('conditional');
  });

  it('settle-on-load: an own-entity size condition saved on an entity-less card loads unconditional', () => {
    installEngines(['card-mod']);
    const style =
      "ha-tile-icon {\n  --mdc-icon-size: {{ '36px' if is_state(config.entity, 'on') else '24px' }};\n}";
    const s = buildMergedStudioState(cfg({ type: 'tile', card_mod: { style } }));
    expect(s.iconColor.sizeWhen).toBeUndefined();
    expect(s.iconColor.sizePx).toBe(36);
  });
});

describe('Icon Color / Accent switches on an entity-less card start fixed', () => {
  type IconEl = { state: unknown; allowSize: boolean; cardEntity: string; _open: boolean; render(): unknown; _renderBody(): unknown; dispatchEvent(e: Event): boolean };
  const registry = new FakeCustomElementRegistry();
  const prev = (globalThis as { customElements?: unknown }).customElements;
  const handlers = (t: unknown): Array<(e: unknown) => void> => {
    if (typeof t === 'function') return [t as (e: unknown) => void];
    if (Array.isArray(t)) return t.flatMap(handlers);
    const v = (t as { values?: unknown[] } | null)?.values;
    return v ? v.flatMap(handlers) : [];
  };
  const mount = async (tag: string, file: string, state: object, props: Record<string, unknown>) => {
    (globalThis as { customElements: unknown }).customElements = registry;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} disconnect() {} };
    (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
      constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
    await import(file);
    const el = new (registry.get(tag) as new () => IconEl)();
    Object.assign(el, { state, _open: true, ...props });
    const emitted: Array<Record<string, unknown>> = [];
    el.dispatchEvent = ((e: Event) => { emitted.push((e as unknown as CustomEvent).detail as Record<string, unknown>); return true; });
    return { el, emitted, toggle: (checked: boolean) => handlers(el.render())[2]({ target: { checked } }) };
  };
  afterEach(() => { (globalThis as { customElements: unknown }).customElements = prev; });

  it('Icon Color: fixed colour without a size control, none with one; a card with an entity keeps ON / OFF', async () => {
    const file = '../src/modules/module-icon-color.js';
    let m = await mount('cms-icon-color-module', file, { ...DEFAULT_ICON_COLOR }, { allowSize: false, cardEntity: '' });
    m.toggle(true);
    expect(m.emitted[0]).toMatchObject({ enabled: true, mode: 'plain' });
    m = await mount('cms-icon-color-module', file, { ...DEFAULT_ICON_COLOR }, { allowSize: true, cardEntity: '' });
    m.toggle(true);
    expect(m.emitted[0]).toMatchObject({ enabled: true, mode: 'none' });
    m = await mount('cms-icon-color-module', file, { ...DEFAULT_ICON_COLOR }, { allowSize: false, cardEntity: 'light.a' });
    m.toggle(true);
    expect(m.emitted[0]).toMatchObject({ enabled: true, mode: 'conditional' });
  });

  it('Accent: a newly enabled module is fixed, entity-less or not', async () => {
    for (const cardEntity of ['', 'light.a']) {
      const m = await mount('cms-accent-color-module', '../src/modules/module-accent-color.js', { ...DEFAULT_ACCENT_COLOR }, { cardEntity });
      m.toggle(true);
      expect(m.emitted[0]).toMatchObject({ enabled: true, mode: 'plain' });
    }
  });

  it('choosing ON / OFF with no entity says so plainly (both modules); with an entity picked it does not', async () => {
    const HINT = 'This card has no entity of its own — pick the entity to watch, or choose One fixed color';
    for (const [tag, file, def] of [
      ['cms-icon-color-module', '../src/modules/module-icon-color.js', DEFAULT_ICON_COLOR],
      ['cms-accent-color-module', '../src/modules/module-accent-color.js', DEFAULT_ACCENT_COLOR],
    ] as const) {
      const none = await mount(tag, file, { ...def, enabled: true, mode: 'conditional' }, { stateAware: false, cardEntity: '' });
      expect(templateText(none.el._renderBody()), tag).toContain(HINT);
      const picked = await mount(tag, file, { ...def, enabled: true, mode: 'conditional', entityId: 'switch.s' }, { stateAware: false, cardEntity: '' });
      expect(templateText(picked.el._renderBody()), tag).not.toContain(HINT);
    }
  });
});

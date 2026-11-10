/**
 * A card whose config has no `entity` must never get a template that reads
 * `config.entity`: it fails to render and the style engine drops EVERY rule
 * of the card's style. Pinned here at the generator (the last line of
 * defence), the loader (existing broken styles heal) and the panel gating.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { generateCss, settleEntityless } from '../src/generator/css-generator.js';
import { applyStudioState, buildMergedStudioState } from '../src/editor/studio-state.js';
import { hasOwnEntity, isStateAware } from '../src/utils/card-caps.js';
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
import { installEngines, restoreEngines, cfg } from './v010-audit-helpers.js';
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

const CARD_TYPES = [
  'entities', 'glance', 'markdown', 'heading', 'picture', 'picture-elements', 'calendar', 'area',
  'date', 'button', 'tile', 'light', 'gauge', 'iframe', 'mushroom-template-card', 'bubble-card',
];
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
  for (const m of ['plain', 'conditional', 'light'] as const) {
    add(`icon colour ${m}`, { iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: m, entityId: undefined } });
  }
  for (const m of ['plain', 'conditional'] as const) {
    add(`accent ${m}`, { accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: m, entityId: undefined } });
  }
  return out;
}

describe('generateCss — entity-less card never emits config.entity', () => {
  for (const type of CARD_TYPES) {
    it(`${type}: every module / condition / mode over entity-less configs`, () => {
      for (const config of ENTITYLESS) {
        for (const [label, state] of sweepStates()) {
          const css = generateCss(state, type, { config: { type, ...config } });
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
      expect(generateCss(all, type, { config: { type } })).not.toContain('config.entity');
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

  it('on/off icon colour / accent with no entity picked write the OFF colour as a fixed colour', () => {
    const state: StudioState = {
      ...base(),
      iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'conditional', colorOn: '#111111', colorOff: '#222222' },
      accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'conditional', colorOn: '#333333', colorOff: '#444444' },
    };
    const css = generateCss(state, 'markdown', { config: { type: 'markdown' } });
    expect(css).toContain('#222222');
    expect(css).toContain('#444444');
    expect(css).not.toMatch(/#111111|#333333/);
    // …and with an entity picked, that entity is watched as before.
    const picked = { ...state, iconColor: { ...state.iconColor, entityId: 'switch.s' } };
    expect(generateCss(picked, 'markdown', { config: { type: 'markdown' } })).toContain(`is_state('switch.s', 'on')`);
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


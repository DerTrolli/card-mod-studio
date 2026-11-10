/**
 * "ON / OFF" on entities that are never on or off (lock, cover, climate,
 * alarm panel, person, timer, input_button): the panel treats them like the
 * other non-state-aware cards — warning on Icon Color / Accent, no ON / OFF
 * choice offered for conditions — while a stored ON / OFF value still shows
 * and nothing is rewritten. Real on/off domains answer exactly as before.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { isStateAware, panelStateAware } from '../src/utils/card-caps.js';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { DEFAULT_ICON_COLOR, DEFAULT_ACCENT_COLOR, mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { generateCss } from '../src/generator/css-generator.js';
import { renderCondition, renderWhen } from '../src/modules/module-base.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

// What each domain really reports (Home Assistant's state lists), with the
// states a real entity of it can be in.
const NEVER_ON = {
  lock: ['locked', 'unlocked', 'locking', 'unlocking', 'jammed', 'open', 'opening'],
  cover: ['open', 'closed', 'opening', 'closing'],
  climate: ['off', 'heat', 'cool', 'auto', 'dry', 'fan_only', 'heat_cool'],
  alarm_control_panel: ['disarmed', 'armed_home', 'armed_away', 'armed_night', 'pending', 'arming', 'triggered'],
  person: ['home', 'not_home', 'work'],
  timer: ['idle', 'active', 'paused'],
  input_button: ['2026-11-01T10:00:00+00:00', 'unknown'],
} as const;
const ON_OFF = {
  switch: ['on', 'off'], light: ['on', 'off'], binary_sensor: ['on', 'off'], input_boolean: ['on', 'off'],
  fan: ['on', 'off'], humidifier: ['on', 'off'], siren: ['on', 'off'], remote: ['on', 'off'],
  automation: ['on', 'off'], script: ['on', 'off'], group: ['on', 'off'],
} as const;

const hassWith = (id: string, state: string) => ({ states: { [id]: { state } } });

describe('isStateAware per domain', () => {
  for (const [domain, states] of Object.entries(NEVER_ON)) {
    it(`${domain}: never state-aware — with or without hass, in every state, on any card type`, () => {
      const id = `${domain}.x`;
      for (const type of ['tile', 'button', 'entity', 'custom:mushroom-entity-card', undefined]) {
        expect(isStateAware(type, id), `${domain} no hass`).toBe(false);
        expect(isStateAware(type, id, { states: {} }), `${domain} unknown to hass`).toBe(false);
        for (const st of [...states, 'unavailable', 'unknown']) {
          expect(isStateAware(type, id, hassWith(id, st)), `${domain} ${st}`).toBe(false);
        }
      }
    });
  }

  for (const [domain, states] of Object.entries(ON_OFF)) {
    it(`${domain}: state-aware in every state, including unavailable / unknown (unchanged)`, () => {
      const id = `${domain}.x`;
      for (const st of [...states, 'unavailable', 'unknown']) {
        expect(isStateAware('tile', id, hassWith(id, st)), `${domain} ${st}`).toBe(true);
      }
    });
  }

  it('other domains keep their old answer: a current on/off state decides, else not', () => {
    expect(isStateAware('tile', 'media_player.tv', hassWith('media_player.tv', 'playing'))).toBe(false);
    expect(isStateAware('tile', 'media_player.tv', hassWith('media_player.tv', 'off'))).toBe(true);
    expect(isStateAware('tile', 'sensor.t', hassWith('sensor.t', '3'))).toBe(false);
    expect(isStateAware('tile', 'number.n', hassWith('number.n', '3'))).toBe(false);
    expect(isStateAware('tile', 'select.s', hassWith('select.s', 'a'))).toBe(false);
    expect(isStateAware('tile', 'vacuum.v', hassWith('vacuum.v', 'docked'))).toBe(false);
  });

  it('an entity the hass does not know falls back to the card type (as before)', () => {
    expect(isStateAware('tile', 'light.gone', { states: {} })).toBe(true);
    expect(isStateAware('sensor', 'sensor.gone', { states: {} })).toBe(false);
  });

  it('without an entity id the answer is the card type\'s (the two pinned tests keep their meaning)', () => {
    expect(isStateAware('tile', undefined)).toBe(true);
    expect(isStateAware('sensor', undefined)).toBe(false);
  });

  it('the panels\' flag follows: lock card not state-aware, light card is, entity-less never', () => {
    expect(panelStateAware('tile', { type: 'tile', entity: 'lock.front' }, hassWith('lock.front', 'locked'))).toBe(false);
    expect(panelStateAware('tile', { type: 'tile', entity: 'climate.c' })).toBe(false);
    expect(panelStateAware('tile', { type: 'tile', entity: 'light.a' }, hassWith('light.a', 'on'))).toBe(true);
    expect(panelStateAware('tile', { type: 'tile' })).toBe(false);
  });
});

describe('what the panel shows for a never-on entity', () => {
  type El = { state: unknown; stateAware: boolean; cardEntity: string; _open: boolean; _renderBody(): unknown };
  let Icon: new () => El;
  let Accent: new () => El;
  beforeAll(async () => {
    (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
      constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
    await import('../src/modules/module-icon-color.js');
    await import('../src/modules/module-accent-color.js');
    Icon = registry.get('cms-icon-color-module') as new () => El;
    Accent = registry.get('cms-accent-color-module') as new () => El;
  });
  const body = (Mod: new () => El, state: object, entity: string, hass?: object) => {
    const el = new Mod();
    el.state = state;
    el.cardEntity = entity;
    el.stateAware = panelStateAware('tile', { type: 'tile', entity }, hass as never);
    el._open = true;
    return templateText(el._renderBody());
  };

  it('Icon Color and Accent in ON / OFF mode warn on a lock, a cover and a climate card', () => {
    for (const entity of ['lock.front', 'cover.garage', 'climate.living']) {
      const ic = body(Icon, { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'conditional' }, entity);
      expect(ic, entity).toContain(`has no on/off state of its own`);
      const ac = body(Accent, { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'conditional' }, entity);
      expect(ac, entity).toContain(`has no on/off state of its own`);
    }
  });

  it('a real on/off entity shows no warning; picking a toggleable entity clears it', () => {
    const light = body(Icon, { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'conditional' }, 'light.a');
    expect(light).not.toContain('has no on/off state of its own');
    const picked = body(Icon, { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'conditional', entityId: 'switch.s' }, 'lock.front');
    expect(picked).not.toContain('has no on/off state of its own');
    expect(picked).toContain("on/off state");
  });

  it('conditions: ON / OFF are not offered for a lock, but a stored one stays selectable and is not rewritten', () => {
    const opts = (when: 'always' | 'on' | 'off') => {
      let changed: unknown = 'untouched';
      const t = templateText(renderCondition({
        condition: when === 'always' ? undefined : { when },
        stateAware: false, noun: 'border', onChange: (c) => { changed = c; },
      }));
      return { t, changed };
    };
    expect(opts('always').t).not.toContain('Only while entity is ON');
    for (const w of ['on', 'off'] as const) {
      const { t, changed } = opts(w);
      expect(t).toContain('Only while entity is ON');
      expect(t).toContain('Only while entity is OFF');
      expect(changed).toBe('untouched');
    }
    const w = templateText(renderWhen({ value: 'on', stateAware: false, noun: 'background', onChange: () => {} }));
    expect(w).toContain('Only while entity is ON');
  });

  it('a stored ON / OFF style on a lock card loads and re-saves byte-identically', () => {
    const css = "ha-card {\n  background: {{ '#ffeecc' if is_state(config.entity, 'on') else 'none' }};\n}";
    const state = mapToStudioState(parseStyleValue(css), 'tile');
    expect(state.background.applyWhen).toBe('on');
    expect(generateCss(state, 'tile', { config: { type: 'tile', entity: 'lock.front' } })).toBe(css);
  });
});

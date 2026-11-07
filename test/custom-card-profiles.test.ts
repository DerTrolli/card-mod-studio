/**
 * C2.0 — the capabilities lookup (capsFor) must answer, for EVERY built-in
 * card type, exactly what the pre-v0.11 direct Set reads answered. The OLD_*
 * sets below are a verbatim copy of the sets at v0.11.0-beta.1 (HEAD before
 * C2.0: src/utils/card-caps.ts and the two in css-generator.ts) — NOT read
 * from the new code, so the lookup cannot vouch for itself.
 */
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import {
  capsFor,
  isStateAware,
  showsAccentColor,
  thresholdPropertyAllowed,
} from '../src/utils/card-caps.js';
import {
  profileKeyOf,
  registerCustomCardProfile,
  unregisterCustomCardProfile,
  type CustomCardProfile,
} from '../src/utils/custom-card-profiles.js';
import { filterPresetStateForCardType } from '../src/utils/preset-caps.js';
import { findAdvancedCssConflicts } from '../src/utils/style-conflicts.js';
import { mapElementToTarget } from '../src/utils/preview-map.js';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { buildMergedStudioState, applyStudioState } from '../src/editor/studio-state.js';

const DEFAULT_STUDIO_STATE = mapToStudioState(parseStyleValue(''));

// ---- verbatim copies of the old sets (generated from `git show HEAD:...`) ----
const OLD_NON_STATE_CARD_TYPES = new Set<string>([
  'sensor', 'gauge', 'history-graph', 'statistics-graph', 'statistic',
  'energy-distribution', 'energy-usage-graph', 'calendar', 'todo-list',
  'weather-forecast', 'sun', 'map', 'media-control',
]);
const OLD_CONTAINER_CARD_TYPES = new Set<string>([
  'grid', 'vertical-stack', 'horizontal-stack', 'sections', 'conditional',
  'entity-filter',
]);
const OLD_STYLABLE_CHILDREN_CARD_TYPES = new Set<string>([
  'grid', 'vertical-stack', 'horizontal-stack',
]);
const OLD_NO_ANIMATION_TYPES = new Set<string>([
  'gauge', 'history-graph', 'statistics-graph', 'statistic',
  'energy-distribution', 'energy-usage-graph',
  'thermostat', 'humidifier', 'light', 'alarm-panel',
  'media-control', 'weather-forecast', 'calendar', 'logbook', 'activity',
  'map', 'iframe', 'webpage', 'shopping-list', 'todo-list',
  'heading', 'picture', 'picture-entity', 'picture-glance', 'picture-elements',
]);
const OLD_NO_BACKGROUND_TYPES = new Set<string>([
  'picture', 'picture-entity', 'picture-glance', 'picture-elements',
  'iframe', 'webpage', 'map',
  'heading',
]);
const OLD_NO_BORDER_TYPES = new Set<string>([
  'heading',
]);
const OLD_NO_THRESHOLD_TYPES = new Set<string>([
  'heading',
]);
const OLD_NO_ICON_COLOR_TYPES = new Set<string>([
  'gauge', 'history-graph', 'statistics-graph', 'statistic',
  'energy-distribution', 'energy-usage-graph',
  'thermostat', 'humidifier',
  'weather-forecast', 'calendar', 'logbook', 'activity',
  'markdown', 'map', 'iframe', 'webpage', 'shopping-list', 'todo-list',
  'picture', 'picture-entity',
  'heading',
  'glance',
  'area', 'picture-elements',
  'date',
]);
const OLD_NO_ACCENT_TYPES = new Set<string>([
  'alarm-panel', 'area', 'button', 'glance', 'humidifier', 'iframe', 'light',
  'map', 'markdown', 'picture', 'picture-elements', 'picture-entity',
  'statistics-graph', 'todo-list', 'weather-forecast', 'logbook', 'picture-glance',
  'date',
]);
const OLD_NO_FONT_SIZE_TYPES = new Set<string>([
  'alarm-panel', 'area', 'humidifier', 'picture-entity', 'picture-glance', 'weather-forecast',
  'date',
]);
const OLD_NO_TEXT_COLOR_TYPES = new Set<string>([
  'alarm-panel', 'area', 'media-control', 'picture-elements', 'picture-entity',
  'picture-glance',
  'date',
]);
const OLD_ICON_SIZE_TYPES = new Set<string>([
  'tile', 'entity', 'sensor', 'picture-glance',
]);
const OLD_NO_FONT_TYPES = new Set<string>([
  'heading', 'iframe', 'webpage', 'map',
  'picture',
]);
const OLD_TRANSITION_IMPORTANT_TYPES = new Set<string>(['tile', 'sensor', 'entity', 'area']);
const OLD_HEADER_TITLE_CARD_TYPES = new Set<string>([
  'entities', 'glance', 'history-graph', 'statistics-graph', 'statistic',
  'calendar', 'todo-list', 'shopping-list', 'logbook',
]);

const ALL_OLD = [
  OLD_NON_STATE_CARD_TYPES, OLD_CONTAINER_CARD_TYPES, OLD_STYLABLE_CHILDREN_CARD_TYPES,
  OLD_NO_ANIMATION_TYPES, OLD_NO_BACKGROUND_TYPES, OLD_NO_BORDER_TYPES, OLD_NO_THRESHOLD_TYPES,
  OLD_NO_ICON_COLOR_TYPES, OLD_NO_ACCENT_TYPES, OLD_NO_FONT_SIZE_TYPES, OLD_NO_TEXT_COLOR_TYPES,
  OLD_ICON_SIZE_TYPES, OLD_NO_FONT_TYPES, OLD_TRANSITION_IMPORTANT_TYPES, OLD_HEADER_TITLE_CARD_TYPES,
];

// Every type any set names, plus built-ins that appear in no set (all-modules
// default), the special-cased names, '' and unknown/custom types.
const EXTRA_TYPES = [
  'tile', 'entities', 'heading', 'light', 'entity', 'sensor', 'button', 'markdown', 'glance',
  'vertical-stack', 'horizontal-stack', 'grid', 'sections', 'conditional', 'entity-filter',
  'gauge', 'thermostat', 'area', 'date', 'picture-glance', 'logbook', 'alarm-panel',
  '', 'custom:unknown-card', 'custom:other-mushroom-card', 'custom:bubble-card',
  'custom:bubble-card/pop-up', 'custom:bubble-card/climate', 'not-a-card',
];
const TYPES = [...new Set([...ALL_OLD.flatMap((s) => [...s]), ...EXTRA_TYPES])];

const oldThresholdProp = (p: string, t: string): boolean => {
  switch (p) {
    case 'icon-color': return t !== 'entities' && !OLD_NO_ICON_COLOR_TYPES.has(t);
    case 'accent-color': return t !== 'heading' && t !== 'entities' && !OLD_NO_ACCENT_TYPES.has(t);
    case 'background': return !OLD_NO_BACKGROUND_TYPES.has(t);
    case 'border-color': return !OLD_NO_BORDER_TYPES.has(t);
    case 'text-color': return !OLD_NO_FONT_TYPES.has(t) && !OLD_NO_TEXT_COLOR_TYPES.has(t);
    default: return true;
  }
};

describe('capsFor — built-in cards answer exactly as the old Sets', () => {
  it('covers a meaningful number of card types', () => {
    expect(TYPES.length).toBeGreaterThan(40);
  });

  for (const t of TYPES) {
    it(`type "${t}"`, () => {
      const c = capsFor(t);
      expect(c.custom).toBe(false);
      expect(c.isContainer).toBe(OLD_CONTAINER_CARD_TYPES.has(t));
      expect(c.stylableChildren).toBe(OLD_STYLABLE_CHILDREN_CARD_TYPES.has(t));
      expect(c.isEntities).toBe(t === 'entities');
      expect(c.isHeading).toBe(t === 'heading');
      expect(c.isLight).toBe(t === 'light');
      expect(c.modules.iconColor).toBe(t !== 'entities' && !OLD_NO_ICON_COLOR_TYPES.has(t));
      expect(c.modules.accentColor).toBe(t !== 'heading' && t !== 'entities' && !OLD_NO_ACCENT_TYPES.has(t));
      expect(c.modules.font).toBe(!OLD_NO_FONT_TYPES.has(t));
      expect(c.modules.threshold).toBe(t !== 'entities' && !OLD_NO_THRESHOLD_TYPES.has(t));
      expect(c.modules.background).toBe(!OLD_NO_BACKGROUND_TYPES.has(t));
      expect(c.modules.border).toBe(!OLD_NO_BORDER_TYPES.has(t));
      expect(c.modules.animation).toBe(!OLD_NO_ANIMATION_TYPES.has(t));
      expect(c.modules.headingStyle).toBe(t === 'heading');
      expect(c.fontColor).toBe(!OLD_NO_TEXT_COLOR_TYPES.has(t));
      expect(c.fontSize).toBe(!OLD_NO_FONT_SIZE_TYPES.has(t));
      expect(c.iconSize).toBe(OLD_ICON_SIZE_TYPES.has(t));
      expect(c.stateAwareByDefault).toBe(!OLD_NON_STATE_CARD_TYPES.has(t));
      expect(c.headerTitle).toBe(OLD_HEADER_TITLE_CARD_TYPES.has(t));
      expect(c.transitionImportant).toBe(OLD_TRANSITION_IMPORTANT_TYPES.has(t));
      expect(showsAccentColor(t)).toBe(c.modules.accentColor);
      for (const p of ['icon-color', 'accent-color', 'background', 'text-color', 'border-color', 'other']) {
        expect(thresholdPropertyAllowed(p, t)).toBe(oldThresholdProp(p, t));
      }
      expect(isStateAware(t, undefined)).toBe(!OLD_NON_STATE_CARD_TYPES.has(t));
    });
  }

  it('undefined key behaves like the empty type (all modules)', () => {
    const c = capsFor(undefined);
    expect(Object.entries(c.modules).filter(([k, v]) => k !== 'headingStyle' && !v)).toEqual([]);
  });

  it('preset filtering keeps its old per-type resets', () => {
    // A state with every module enabled, filtered per type, must reset exactly
    // the modules the old gating hid.
    const on = {
      ...DEFAULT_STUDIO_STATE,
      iconColor: { ...DEFAULT_STUDIO_STATE.iconColor, enabled: true },
      accentColor: { ...DEFAULT_STUDIO_STATE.accentColor, enabled: true },
      background: { ...DEFAULT_STUDIO_STATE.background, enabled: true },
      border: { ...DEFAULT_STUDIO_STATE.border, enabled: true },
      animation: { ...DEFAULT_STUDIO_STATE.animation, enabled: true },
      font: { ...DEFAULT_STUDIO_STATE.font, enabled: true },
      headingStyle: { ...DEFAULT_STUDIO_STATE.headingStyle, enabled: true },
    };
    for (const t of TYPES) {
      const f = filterPresetStateForCardType(on, t);
      expect(f.iconColor.enabled).toBe(t !== 'entities' && !OLD_NO_ICON_COLOR_TYPES.has(t));
      expect(f.accentColor.enabled).toBe(t !== 'heading' && t !== 'entities' && !OLD_NO_ACCENT_TYPES.has(t));
      expect(f.background.enabled).toBe(!OLD_NO_BACKGROUND_TYPES.has(t));
      expect(f.border.enabled).toBe(!OLD_NO_BORDER_TYPES.has(t));
      expect(f.animation.enabled).toBe(!OLD_NO_ANIMATION_TYPES.has(t));
      expect(f.font.enabled).toBe(!OLD_NO_FONT_TYPES.has(t));
      expect(f.headingStyle.enabled).toBe(t === 'heading');
    }
  });

  it('click-to-edit gating follows the old sets', () => {
    const icon = [{ tag: 'ha-state-icon', classes: [] }, { tag: 'ha-card', classes: [] }];
    for (const t of TYPES) {
      const target = mapElementToTarget(icon, t);
      const wanted = t !== 'entities' && !OLD_NO_ICON_COLOR_TYPES.has(t);
      expect(target?.module === 'cms-icon-color-module').toBe(t === 'entities' ? false : wanted);
    }
  });
});

describe('profileKeyOf', () => {
  it('is config.type for ordinary and custom cards', () => {
    expect(profileKeyOf({ type: 'tile' })).toBe('tile');
    expect(profileKeyOf({ type: 'custom:mushroom-entity-card' })).toBe('custom:mushroom-entity-card');
    expect(profileKeyOf({ type: 'tile', card_type: 'cover' })).toBe('tile');
  });
  it('adds card_type for Bubble Card', () => {
    expect(profileKeyOf({ type: 'custom:bubble-card', card_type: 'cover' })).toBe('custom:bubble-card/cover');
    expect(profileKeyOf({ type: 'custom:bubble-card', card_type: 'separator' })).toBe('custom:bubble-card/separator');
  });
  it('keys a Bubble card without card_type as the bare type (measured: Bubble 3.4.3 renders a "Configuration error" card, not a button)', () => {
    expect(profileKeyOf({ type: 'custom:bubble-card' })).toBe('custom:bubble-card');
    expect(profileKeyOf({ type: 'custom:bubble-card', card_type: '' })).toBe('custom:bubble-card');
    expect(profileKeyOf({ type: 'custom:bubble-card', card_type: 5 })).toBe('custom:bubble-card');
  });
  it('splits a Bubble slider button from the plain button', () => {
    expect(profileKeyOf({ type: 'custom:bubble-card', card_type: 'button' })).toBe('custom:bubble-card/button');
    expect(profileKeyOf({ type: 'custom:bubble-card', card_type: 'button', button_type: 'switch' })).toBe('custom:bubble-card/button');
    expect(profileKeyOf({ type: 'custom:bubble-card', card_type: 'button', button_type: 'slider' })).toBe('custom:bubble-card/button/slider');
    // only a button has a slider variant
    expect(profileKeyOf({ type: 'custom:bubble-card', card_type: 'cover', button_type: 'slider' })).toBe('custom:bubble-card/cover');
  });
  it('is empty for missing configs or types', () => {
    expect(profileKeyOf({})).toBe('');
    expect(profileKeyOf(undefined)).toBe('');
    expect(profileKeyOf(null)).toBe('');
    expect(profileKeyOf({ type: 7 })).toBe('');
  });
});

const originalRegistry = globalThis.customElements;
beforeAll(() => {
  (globalThis as { customElements: unknown }).customElements = { get: () => undefined };
});
afterAll(() => {
  (globalThis as { customElements: unknown }).customElements = originalRegistry;
});

describe('custom profile fixture overrides gating', () => {
  const KEY = 'custom:fixture-card/demo';
  const fixture: CustomCardProfile = {
    key: KEY,
    modules: { animation: false, background: false, headingStyle: true },
    fontColor: false,
    fontSize: false,
    iconSize: true,
    stateAware: false,
    conflicts: [{ module: 'font', selector: '.fixture-name', props: ['font-size'] }],
    clickToEdit: [{ className: 'fixture-name', module: 'cms-font-module', label: 'Font' }],
    presetDrop: ['border'],
  };
  afterEach(() => unregisterCustomCardProfile(KEY));

  it('is unprofiled (all modules) until registered', () => {
    const c = capsFor(KEY);
    expect(c.custom).toBe(false);
    expect(c.modules.animation && c.modules.background && c.modules.font).toBe(true);
  });

  it('overrides modules, font/icon sub-controls, threshold properties and state awareness', () => {
    registerCustomCardProfile(fixture);
    const c = capsFor(KEY);
    expect(c.custom).toBe(true);
    expect(c.modules).toMatchObject({
      iconColor: true, accentColor: true, font: true, threshold: true,
      background: false, border: true, animation: false, headingStyle: true,
    });
    expect(c.fontColor).toBe(false);
    expect(c.fontSize).toBe(false);
    expect(c.iconSize).toBe(true);
    expect(c.isEntities || c.isHeading || c.isContainer).toBe(false);
    expect(c.headerTitle || c.transitionImportant).toBe(false);
    expect(thresholdPropertyAllowed('background', KEY)).toBe(false);
    expect(thresholdPropertyAllowed('text-color', KEY)).toBe(false); // font colour unreachable
    expect(thresholdPropertyAllowed('icon-color', KEY)).toBe(true);
    expect(isStateAware(KEY, undefined)).toBe(false);
  });

  it('preset filtering, conflicts and click-to-edit read the profile', () => {
    registerCustomCardProfile(fixture);
    const on = {
      ...DEFAULT_STUDIO_STATE,
      animation: { ...DEFAULT_STUDIO_STATE.animation, enabled: true },
      border: { ...DEFAULT_STUDIO_STATE.border, enabled: true },
      font: { ...DEFAULT_STUDIO_STATE.font, enabled: true },
    };
    const f = filterPresetStateForCardType(on, KEY);
    expect(f.animation.enabled).toBe(false);
    expect(f.border.enabled).toBe(false); // presetDrop
    expect(f.font.enabled).toBe(true);

    const css = '.fixture-name { font-size: 20px; }';
    expect(findAdvancedCssConflicts(css, on)).toEqual({});
    expect(findAdvancedCssConflicts(css, on, KEY).font).toEqual(['.fixture-name { font-size }']);

    const hit = mapElementToTarget([{ tag: 'div', classes: ['fixture-name'] }, { tag: 'ha-card', classes: [] }], KEY);
    expect(hit?.module).toBe('cms-font-module');
    // other keys are untouched by the fixture
    expect(
      mapElementToTarget([{ tag: 'div', classes: ['fixture-name'] }, { tag: 'ha-card', classes: [] }], 'tile')?.module,
    ).not.toBe('cms-font-module');
  });

  it('the profile key travels through mapToStudioState / generateCss / the save path', () => {
    registerCustomCardProfile(fixture);
    // Icon size is claimed + emitted only where the profile allows it.
    const withSize = { ...DEFAULT_STUDIO_STATE, iconColor: { ...DEFAULT_STUDIO_STATE.iconColor, enabled: true, sizePx: 40 } };
    const css = generateCss(withSize as never, KEY);
    expect(css).toContain('--mdc-icon-size');
    expect(generateCss(withSize as never, 'custom:unprofiled-card')).not.toContain('--mdc-icon-size');
    const back = mapToStudioState(parseStyleValue(css), KEY);
    expect(back.iconColor.sizePx).toBe(40);

    // Save path: the key comes from the config (Bubble adds /card_type) and
    // reaches both the generator and the parser.
    const cfg = { type: 'custom:bubble-card', card_type: 'demo' } as never;
    registerCustomCardProfile({ ...fixture, key: 'custom:bubble-card/demo' });
    try {
      const saved = applyStudioState(withSize as never, cfg);
      expect(JSON.stringify(saved)).toContain('--mdc-icon-size');
      expect(buildMergedStudioState(saved).iconColor.sizePx).toBe(40);
      // Without a profile for that card_type the size is neither emitted nor claimed.
      unregisterCustomCardProfile('custom:bubble-card/demo');
      expect(JSON.stringify(applyStudioState(withSize as never, cfg))).not.toContain('--mdc-icon-size');
    } finally {
      unregisterCustomCardProfile('custom:bubble-card/demo');
    }
  });
});

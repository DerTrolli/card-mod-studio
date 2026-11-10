/**
 * The card-level fallback and the guard that no hover names a module the
 * panel hides for the card (HA 2026.11 chains read off live dashboards).
 */
import { describe, it, expect } from 'vitest';
import { mapElementToTarget, type PickChainElement } from '../src/utils/preview-map.js';
import {
  capsFor, NON_STATE_CARD_TYPES, CONTAINER_CARD_TYPES, NO_ANIMATION_TYPES, NO_BACKGROUND_TYPES,
  NO_ICON_COLOR_TYPES, NO_ACCENT_TYPES, NO_FONT_TYPES, NO_FONT_SIZE_TYPES, NO_TEXT_COLOR_TYPES,
  NO_BORDER_TYPES, ICON_SIZE_TYPES, HEADER_TITLE_CARD_TYPES,
} from '../src/utils/card-caps.js';
import { MUSHROOM_PROFILES } from '../src/utils/profiles/mushroom.js';
import { BUBBLE_PROFILES } from '../src/utils/profiles/bubble.js';

/** "tag.class1.class2#id" → a chain element (no geometry). */
const e = (spec: string): PickChainElement => {
  const [, tag, rest = ''] = /^([\w-]+)(.*)$/.exec(spec)!;
  const id = /#([\w-]+)/.exec(rest)?.[1] ?? '';
  const classes = rest.replace(/#[\w-]+/, '').split('.').filter(Boolean);
  return { tag, id, classes };
};
const chain = (...specs: string[]) => specs.map(e);
const labelOf = (c: PickChainElement[], type: string, config?: Record<string, unknown>) =>
  mapElementToTarget(c, type, config)?.label;

const BG = 'Background & card surface';
const BORDER = 'Border & Radius';
const FILTER = 'Visual Filters';

describe('card-level fallback: Background, else Border, else Visual Filters', () => {
  it('follows what the card shows', () => {
    const surface = (type: string) => labelOf(chain('ha-card', 'hui-card'), type);
    expect(surface('tile')).toBe(BG);
    for (const t of ['picture', 'picture-entity', 'picture-glance', 'picture-elements', 'iframe', 'webpage', 'map']) {
      expect(surface(t), t).toBe(BORDER);
    }
    expect(surface('heading')).toBe(FILTER);
    // a Mushroom card with no box keeps its Filter module
    expect(surface('custom:mushroom-title-card')).toBe(FILTER);
  });
});

describe('picture family: the image names Border, not Advanced CSS', () => {
  it.each([
    ['picture', chain('img', 'ha-card', 'hui-picture-card.type-picture', 'hui-card')],
    ['picture-entity', chain('img#image', 'div.container', 'hui-image', 'div.image-container.clickable', 'ha-card', 'hui-picture-entity-card', 'hui-card')],
    ['picture-glance', chain('img#image', 'div.container', 'hui-image', 'div.image-container.clickable', 'ha-card', 'hui-picture-glance-card', 'hui-card')],
    ['picture-elements', chain('img#image', 'div.container', 'hui-image', 'div#root', 'ha-card', 'hui-picture-elements-card', 'hui-card')],
  ])('%s', (type, c) => {
    expect(labelOf(c, type)).toBe(BORDER);
  });
});

describe('heading: badges and the blank → Visual Filters', () => {
  const tail = ['div.container', 'ha-card', 'hui-heading-card.type-heading', 'hui-card'];
  it('a badge reaches nothing of the heading modules', () => {
    const badge = chain('state-display', 'ha-heading-badge', 'hui-entity-heading-badge', 'hui-heading-badge', 'div.badges-row', 'div.badges.draggable', ...tail);
    expect(labelOf(badge, 'heading')).toBe(FILTER);
    expect(labelOf(chain(...tail), 'heading')).toBe(FILTER);
  });
  it('the title stays Heading Style', () => {
    expect(labelOf(chain('h2.heading', 'div.content.title', ...tail), 'heading')).toBe('Heading Style');
  });
});

/**
 * The generic guard: whatever element is hovered, on whichever card type the
 * Studio supports, the answer is a module the panel shows for that card.
 */
describe('a hover never names a module that is hidden for the card', () => {
  const MODULE_OF: Record<string, keyof ReturnType<typeof capsFor>['modules'] | null> = {
    'cms-font-module': 'font',
    'cms-icon-color-module': 'iconColor',
    'cms-accent-color-module': 'accentColor',
    'cms-background-module': 'background',
    'cms-border-module': 'border',
    'cms-threshold-module': 'threshold',
    'cms-filter-module': 'filter',
    'cms-animation-module': 'animation',
    'cms-heading-style-module': 'headingStyle',
    'cms-advanced-module': null,
    'cms-entities-rows-module': null,
  };
  const sets = [
    NON_STATE_CARD_TYPES, CONTAINER_CARD_TYPES, NO_ANIMATION_TYPES, NO_BACKGROUND_TYPES, NO_ICON_COLOR_TYPES,
    NO_ACCENT_TYPES, NO_FONT_TYPES, NO_FONT_SIZE_TYPES, NO_TEXT_COLOR_TYPES, NO_BORDER_TYPES, ICON_SIZE_TYPES,
    HEADER_TITLE_CARD_TYPES,
  ];
  const builtin = new Set<string>([
    'tile', 'button', 'entity', 'entities', 'light', 'thermostat', 'humidifier', 'markdown', 'glance', 'area',
    'heading', 'picture', 'alarm-panel', 'date', 'alert', 'logbook', 'activity', 'shopping-list', 'iframe',
    'webpage', 'picture-elements', 'picture-entity', 'picture-glance', 'statistic', 'media-control', 'sensor',
    'gauge', 'calendar', 'weather-forecast', 'todo-list', 'history-graph', 'statistics-graph', 'map', 'sun',
    ...sets.flatMap((s) => [...s]),
  ]);
  const custom = [...MUSHROOM_PROFILES, ...BUBBLE_PROFILES].map((p) => p.key);
  const types = [...builtin, ...custom, 'custom:unknown-card'];

  // One element per DOM shape seen across the supported cards (real tags and
  // classes), each hovered alone under the card root.
  const SHAPES = [
    'ha-state-icon', 'state-badge', 'ha-tile-icon', 'ha-icon', 'ha-gauge', 'ha-control-circular-slider',
    'hui-graph-base', 'hui-card-features', 'ha-tile-info', 'ha-markdown-element', 'ha-icon-button', 'ha-heading-badge',
    'hui-state-label-element', 'hui-generic-entity-row', 'hui-sensor-entity-row', 'mushroom-shape-icon', 'mushroom-chip',
    'h1.card-header', 'h1.title', 'h2.subtitle', 'div.header', 'div.info', 'div.name', 'span.value', 'span.measurement',
    'div.title', 'div.icon', 'div.footer', 'div.box', 'div.entity', 'div.date-text', 'div.media-info', 'div.icon-name',
    'div.content.title', 'span', 'div#info.info', 'text.value-text', 'div.bubble-name', 'ha-icon.bubble-icon',
    'div.bubble-range-fill', 'div.bubble-button-background', 'img', 'div.keypad', 'div',
  ];
  const inside = [['ha-card', 'hui-x-card', 'hui-card'], ['div', 'ha-card', 'hui-x-card', 'hui-card']];

  it.each(types)('%s', (type) => {
    const shown = capsFor(type).modules;
    for (const shape of SHAPES) {
      for (const up of inside) {
        const c = [shape, ...up].map(e);
        const t = mapElementToTarget(c, type);
        expect(t, `${type} / ${shape}`).not.toBeNull();
        const gate = MODULE_OF[t!.module];
        expect(gate !== undefined, `${t!.module} is a module`).toBe(true);
        if (gate) expect(shown[gate], `${type} / ${shape} → ${t!.module} is hidden`).toBe(true);
        if (t!.module === 'cms-entities-rows-module') expect(capsFor(type).isEntities, `${type} / ${shape}`).toBe(true);
      }
    }
  });
});

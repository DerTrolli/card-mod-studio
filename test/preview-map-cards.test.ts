/**
 * Click-to-edit across the card families the live QA found gaps in (HA
 * 2026.11). Every chain below is the real ancestor chain read off the card's
 * DOM on a live dashboard (deepest element first). A hover must name the
 * module that styles that part AND is on screen for that card; nothing that
 * styles nothing may claim a part, and the whole card surface answers with
 * the card-level fallback (Background, else Border, else Visual Filters).
 */
import { describe, it, expect } from 'vitest';
import {
  mapElementToTarget,
  mapElementToMatch,
  type PickChainElement,
  type PickPointer,
  type PickRect,
} from '../src/utils/preview-map.js';
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
const labelOf = (c: PickChainElement[], type: string, config?: Record<string, unknown>, p?: PickPointer) =>
  mapElementToTarget(c, type, config, p)?.label;

const FONT = 'Font';
const ICON = 'Icon Color';
const BG = 'Background & card surface';
const BORDER = 'Border & Radius';
const FILTER = 'Visual Filters';

const box = (left: number, top: number, w: number, h: number): PickRect => ({ left, top, right: left + w, bottom: top + h });
/** An element with a wide box and a narrow text box. */
const wide = (spec: string, rect: PickRect, text: PickRect | null): PickChainElement => ({ ...e(spec), rect, textRect: text });
const at = (x: number, y: number): PickPointer => ({ x, y });

const TAIL = ['ha-card', 'hui-x-card', 'hui-card'];

describe('date (hui-date-card) — only the family reaches the text', () => {
  const dateChain = (text: PickChainElement) => [text, e('div.date-wrapper'), ...chain(...TAIL)];
  it('the date text → Font, the rest → Background', () => {
    expect(labelOf(dateChain(e('div.date-text')), 'date')).toBe(FONT);
    expect(labelOf(chain('div.date-wrapper', ...TAIL), 'date')).toBe(BG);
  });
  it('only over the words when the geometry is known', () => {
    const text = wide('div.date-text', box(80, 10, 200, 20), box(80, 12, 120, 16));
    const c = [text, wide('div.date-wrapper', box(0, 0, 338, 38), null), ...chain(...TAIL)];
    expect(labelOf(c, 'date', undefined, at(100, 20))).toBe(FONT);
    expect(labelOf(c, 'date', undefined, at(250, 20))).toBe(BG);
    // the highlight is the text, not the block
    expect(mapElementToMatch(c, 'date', undefined, at(100, 20))?.rect).toEqual(box(80, 12, 120, 16));
  });
});

describe('alert (hui-alert-card) — a tile layout', () => {
  it('text → Font, icon → Icon Color, rest → Background', () => {
    const tail = ['ha-tile-container', 'ha-card', 'hui-alert-card.type-alert', 'hui-card'];
    expect(labelOf(chain('slot.primary', 'div.info', 'ha-tile-info', ...tail), 'alert')).toBe(FONT);
    expect(labelOf(chain('ha-relative-time', 'span', 'ha-tile-info', ...tail), 'alert')).toBe(FONT);
    expect(labelOf(chain('path.primary-path', 'g', 'svg', 'ha-svg-icon', 'ha-icon', 'ha-state-icon', 'ha-tile-icon', ...tail), 'alert')).toBe(ICON);
    expect(labelOf(chain(...tail), 'alert')).toBe(BG);
  });
});

describe('statistic', () => {
  const tail = ['ha-card', 'hui-statistic-card.type-statistic', 'hui-card'];
  it('name, value and unit → Font', () => {
    expect(labelOf(chain('div.name', 'div.header', ...tail), 'statistic')).toBe(FONT);
    expect(labelOf(chain('span.value', 'div.info', ...tail), 'statistic')).toBe(FONT);
    expect(labelOf(chain('span.measurement', 'div.info', ...tail), 'statistic')).toBe(FONT);
  });
  it('the icon → Icon Color (offered on statistic), the blank bands → Background', () => {
    const icon = chain('path.primary-path', 'g', 'svg', 'ha-svg-icon', 'ha-icon', 'ha-state-icon', 'div.icon', 'div.header', ...tail);
    expect(capsFor('statistic').modules.iconColor).toBe(true);
    expect(labelOf(icon, 'statistic')).toBe(ICON);
    // The icon's wrapper itself (the gap around the glyph) is card surface.
    expect(labelOf(chain('div.icon', 'div.header', ...tail), 'statistic')).toBe(BG);
    expect(labelOf(chain('div.header', ...tail), 'statistic')).toBe(BG);
    expect(labelOf(chain('div.info', ...tail), 'statistic')).toBe(BG);
  });
});

describe('media-control', () => {
  const tail = ['div.player.narrow.no-progress', 'ha-card', 'hui-media-control-card.type-media-control', 'hui-card'];
  it('the player icon → Icon Color, the name and the title lines → Font', () => {
    expect(labelOf(chain('path.primary-path', 'g', 'svg', 'ha-svg-icon', 'ha-icon', 'ha-state-icon.icon', 'div.icon-name', 'div.top-info', ...tail), 'media-control')).toBe(ICON);
    expect(labelOf(chain('div', 'div.icon-name', 'div.top-info', ...tail), 'media-control')).toBe(FONT);
    expect(labelOf(chain('span', 'div.marquee-inner', 'hui-marquee', 'div.media-info', 'div.title-controls', 'div', ...tail), 'media-control')).toBe(FONT);
  });
  it('a block of several text lines counts per line, not as one box around them', () => {
    const lines = [box(0, 60, 280, 16), box(0, 82, 50, 16)];
    const info: PickChainElement = { ...e('div.media-info'), rect: box(0, 56, 320, 44), textRect: box(0, 60, 280, 38), textRects: lines };
    const c = [info, ...chain(...tail)];
    expect(labelOf(c, 'media-control', undefined, at(30, 90))).toBe(FONT);
    expect(mapElementToMatch(c, 'media-control', undefined, at(30, 90))?.rect).toEqual(lines[1]);
    // Background is hidden on this card (its colour block covers it): the blank is the card frame
    expect(labelOf(c, 'media-control', undefined, at(200, 90))).toBe(BORDER);
  });
  it('the blank beside a title line and the controls → Border (Background is hidden here)', () => {
    const marquee = wide('div.marquee-inner', box(0, 60, 320, 20), null);
    const span = wide('span', box(0, 62, 150, 16), box(0, 62, 150, 16));
    const info = wide('div.media-info', box(0, 56, 320, 40), null);
    const c = [span, marquee, e('hui-marquee'), info, ...chain(...tail)];
    expect(labelOf(c, 'media-control', undefined, at(50, 70))).toBe(FONT);
    expect(labelOf(c.slice(1), 'media-control', undefined, at(250, 70))).toBe(BORDER);
    expect(labelOf(chain('button.button', 'ha-button', 'ha-icon-button', 'div.start', 'div.controls', 'div.title-controls', ...tail), 'media-control')).toBe(BORDER);
  });
});

describe('alarm-panel', () => {
  const tail = ['ha-card', 'hui-alarm-panel-card.type-alarm-panel', 'hui-card'];
  it('the title → Font, the state icon → Icon Color, the keypad → Background', () => {
    expect(labelOf(chain('h1.card-header', ...tail), 'alarm-panel')).toBe(FONT);
    expect(labelOf(chain('path.primary-path', 'g', 'svg', 'ha-svg-icon', 'ha-icon', 'ha-state-icon', 'ha-assist-chip.disarmed', 'h1.card-header', ...tail), 'alarm-panel')).toBe(ICON);
    expect(labelOf(chain('div.hover', 'div.surface', 'ha-ripple', 'button.button', 'ha-control-button', 'div.keypad', ...tail), 'alarm-panel')).toBe(BG);
    expect(labelOf(chain('div.keypad', ...tail), 'alarm-panel')).toBe(BG);
  });
});

describe('picture family: footer, icons and state elements', () => {
  it('picture-entity: the footer lines → Font, the footer band → Border', () => {
    const tail = ['div.footer.both', 'ha-card', 'hui-picture-entity-card.type-picture-entity', 'hui-card'];
    expect(labelOf(chain('div', ...tail), 'picture-entity')).toBe(FONT);
    expect(labelOf(chain(...tail), 'picture-entity')).toBe(BORDER);
  });
  it('picture-glance: the title → Font, an entity icon → Icon Color, the footer → Border', () => {
    const box_ = ['div.box', 'ha-card', 'hui-picture-glance-card.type-picture-glance', 'hui-card'];
    expect(labelOf(chain('div.title', ...box_), 'picture-glance')).toBe(FONT);
    expect(labelOf(chain('path.primary-path', 'g', 'svg', 'ha-svg-icon', 'ha-icon', 'ha-state-icon', 'ha-icon-button.state-on', 'div.wrapper', 'div.row', ...box_), 'picture-glance')).toBe(ICON);
    // the button around the glyph is the icon too
    expect(labelOf(chain('button.button.has-label', 'ha-button', 'ha-icon-button.state-on', 'div.wrapper', 'div.row', ...box_), 'picture-glance')).toBe(ICON);
    expect(labelOf(chain(...box_), 'picture-glance')).toBe(BORDER);
  });
  it('picture-elements: a state icon (Icon Color hidden) → Border, a state label → Font', () => {
    const tail = ['div#root', 'ha-card', 'hui-picture-elements-card.type-picture-elements', 'hui-card'];
    const icon = chain('ha-icon', 'ha-state-icon', 'state-badge', 'hui-state-icon-element.element.type-state-icon', ...tail);
    expect(capsFor('picture-elements').modules.iconColor).toBe(false);
    expect(labelOf(icon, 'picture-elements')).toBe(BORDER);
    expect(labelOf(chain('div', 'hui-state-label-element.element.type-state-label', ...tail), 'picture-elements')).toBe(FONT);
    // the label element is wider than its text
    const label = [wide('div', box(40, 60, 90, 20), box(40, 62, 50, 16)), ...chain('hui-state-label-element', ...tail)];
    expect(labelOf(label, 'picture-elements', undefined, at(50, 70))).toBe(FONT);
    expect(labelOf(label, 'picture-elements', undefined, at(120, 70))).toBe(BORDER);
  });
});

describe('area', () => {
  const tail = ['div.content', 'div.row', 'div.container', 'ha-tile-container', 'ha-card', 'hui-area-card.type-area', 'hui-card'];
  it('the name → Font, the picture and the tile icon → Background', () => {
    expect(labelOf(chain('div#info.info', ...tail), 'area')).toBe(FONT);
    expect(labelOf(chain('div.ratio', 'ha-aspect-ratio', 'div.picture', 'div.header', 'ha-card', 'hui-area-card', 'hui-card'), 'area')).toBe(BG);
    expect(labelOf(chain('ha-icon', 'div.icon-container', 'ha-aspect-ratio', 'div.picture', 'div.header', 'ha-card', 'hui-area-card', 'hui-card'), 'area')).toBe(BG);
    expect(labelOf(chain('svg', 'ha-svg-icon', 'ha-icon', 'slot', 'div.container', 'ha-tile-icon', 'ha-tile-container', 'ha-card', 'hui-area-card', 'hui-card'), 'area')).toBe(BG);
  });
  it('the blank of the name row is the surface', () => {
    const name = [wide('div#info.info', box(56, 206, 272, 22), box(56, 208, 80, 16)), ...chain(...tail)];
    expect(labelOf(name, 'area', undefined, at(70, 215))).toBe(FONT);
    expect(labelOf(name, 'area', undefined, at(250, 215))).toBe(BG);
  });
});

describe('Mushroom / Bubble hit maps are untouched', () => {
  it('entity card: primary/secondary → Font, glyph → Icon Color, rest → Background', () => {
    const t = 'custom:mushroom-entity-card';
    const tail = ['div.container', 'mushroom-card', 'ha-card', 'hui-card'];
    expect(labelOf(chain('span.primary', 'mushroom-state-info', ...tail), t)).toBe(FONT);
    expect(labelOf(chain('ha-state-icon', 'mushroom-shape-icon', ...tail), t)).toBe(ICON);
    expect(labelOf(chain(...tail), t)).toBe(BG);
  });
});


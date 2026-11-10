/**
 * C2.4 / C3.4 click-to-edit rows for Mushroom and Bubble, and the three
 * review fixes (threshold ownership, `!important` on custom profiles,
 * selector-token conflict matching). Literal expectations throughout.
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { capsFor } from '../src/utils/card-caps.js';
import { getCustomCardProfile } from '../src/utils/custom-card-profiles.js';
import { mapElementToTarget } from '../src/utils/preview-map.js';
import type { PickChainElement } from '../src/utils/preview-map.js';
import { conflictsFromEmitters } from '../src/utils/profiles/helpers.js';
import { findAdvancedCssConflicts } from '../src/utils/style-conflicts.js';
import type { StudioState } from '../src/types/index.js';

const EMPTY = mapToStudioState(parseStyleValue(''));
const parse = (css: string, k: string) => mapToStudioState(parseStyleValue(css), k);
const el = (tag: string, classes: string[] = [], id = ''): PickChainElement => ({ tag, id, classes });
const pick = (chain: PickChainElement[], key: string, config?: Record<string, unknown>) =>
  mapElementToTarget(chain, key, config)?.module;

const FONT = 'cms-font-module';
const ICON = 'cms-icon-color-module';
const BG = 'cms-background-module';
const ACCENT = 'cms-accent-color-module';

describe('click-to-edit — Mushroom (literal chains from the probed DOM)', () => {
  const classic = 'custom:mushroom-entity-card';
  const classicTail = [el('mushroom-state-info'), el('mushroom-state-item'), el('mushroom-card'), el('ha-card'), el('mushroom-entity-card'), el('hui-card')];

  it('classic: primary and secondary text → Font', () => {
    expect(pick([el('span', ['primary']), ...classicTail], classic)).toBe(FONT);
    expect(pick([el('span', ['secondary']), ...classicTail], classic)).toBe(FONT);
  });
  it('classic: the shape and the glyph → Icon Color', () => {
    expect(pick([el('div', ['shape']), el('mushroom-shape-icon'), el('mushroom-state-item'), el('ha-card')], classic)).toBe(ICON);
    expect(pick([el('path', ['primary-path']), el('svg'), el('ha-svg-icon'), el('ha-icon'), el('ha-state-icon'), el('mushroom-shape-icon'), el('ha-card')], classic)).toBe(ICON);
  });
  it('classic: the empty card area → Background', () => {
    expect(pick([el('div', ['container']), el('mushroom-state-item'), el('mushroom-card'), el('ha-card')], classic)).toBe(BG);
  });
  it('classic with icon_color set: the Accent module is still not offered, nothing here points at it', () => {
    expect(capsFor(classic, { icon_color: 'red' }).modules.accentColor).toBe(false);
    expect(pick([el('div', ['shape']), el('mushroom-shape-icon'), el('ha-card')], classic, { icon_color: 'red' })).toBe(ICON);
  });

  it('template: info block → Font, tile icon → Icon Color, the box → Background', () => {
    const t = 'custom:mushroom-template-card';
    expect(pick([el('span'), el('ha-tile-info', [], 'info'), el('div', ['content']), el('ha-card')], t)).toBe(FONT);
    expect(pick([el('div', ['container', 'background']), el('ha-tile-icon'), el('div', ['content']), el('ha-card')], t)).toBe(ICON);
    expect(pick([el('div', ['row']), el('div', ['container']), el('ha-card')], t)).toBe(BG);
  });

  it('chips: chip text → Font, chip glyph → Icon Color, the chip itself → Background', () => {
    const c = 'custom:mushroom-chips-card';
    const tail = [el('mushroom-chip'), el('mushroom-entity-chip'), el('div', ['chip-container']), el('ha-card')];
    expect(pick([el('span'), ...tail], c)).toBe(FONT);
    expect(pick([el('ha-state-icon', ['active']), ...tail], c)).toBe(ICON);
    expect(pick([el('div', ['content']), el('ha-card', ['type-entity']), ...tail], c)).toBe(BG);
  });

  it('title: the title text → Font; the subtitle is not claimed (no box → the card-level Visual Filters)', () => {
    const t = 'custom:mushroom-title-card';
    expect(pick([el('h1', ['title']), el('div'), el('ha-card', ['header'])], t)).toBe(FONT);
    expect(pick([el('h2', ['subtitle']), el('div'), el('ha-card', ['header'])], t)).toBe('cms-filter-module');
  });
});

describe('click-to-edit — Bubble Card', () => {
  const btn = 'custom:bubble-card/button';
  const slider = 'custom:bubble-card/button/slider';
  const box = el('div', ['bubble-background', 'bubble-action', 'bubble-button-background']);
  const wrap = [box, el('div', ['bubble-button', 'bubble-wrapper']), el('div', ['bubble-button-container', 'bubble-container']), el('ha-card')];

  it('button: name and state → Font, icon → Icon Color, pill → Background', () => {
    expect(pick([el('div', ['bubble-name', 'name']), el('div', ['bubble-name-container']), ...wrap], btn)).toBe(FONT);
    expect(pick([el('div', ['bubble-state', 'state']), ...wrap], btn)).toBe(FONT);
    expect(pick([el('ha-icon', ['bubble-main-icon', 'bubble-icon', 'icon']), el('div', ['bubble-main-icon-container', 'bubble-icon-container']), ...wrap], btn)).toBe(ICON);
    expect(pick([el('div', ['surface']), el('ha-ripple'), ...wrap], btn)).toBe(BG);
  });

  it('slider: the fill → Accent; on a plain button the same element is not Accent (hidden there)', () => {
    const fill = [el('div', ['bubble-range-fill', 'range-fill']), el('div', ['bubble-range-slider']), el('div', ['bubble-button-container', 'bubble-container']), el('ha-card')];
    expect(pick(fill, slider)).toBe(ACCENT);
    expect(capsFor(btn).modules.accentColor).toBe(false);
    expect(pick(fill, btn)).toBe(BG);
  });

  it('separator: name → Font, icon → Icon Color, container → Background', () => {
    const s = 'custom:bubble-card/separator';
    const root = [el('div', ['bubble-container', 'bubble-separator']), el('div', ['card-content']), el('ha-card')];
    expect(pick([el('h4', ['bubble-name']), ...root], s)).toBe(FONT);
    expect(pick([el('ha-icon', ['bubble-icon']), ...root], s)).toBe(ICON);
    expect(pick([el('div', ['bubble-line']), ...root], s)).toBe(BG);
  });

  it('cover: name → Font, icon → Icon Color, .bubble-background → Background; the cover buttons are not claimed as the icon', () => {
    const c = 'custom:bubble-card/cover';
    const root = [el('div', ['bubble-background', 'bubble-action']), el('div', ['bubble-cover', 'bubble-wrapper']), el('div', ['bubble-cover-container', 'bubble-container']), el('ha-card')];
    expect(pick([el('div', ['bubble-name']), ...root], c)).toBe(FONT);
    expect(pick([el('ha-icon', ['bubble-main-icon', 'bubble-icon']), ...root], c)).toBe(ICON);
    expect(pick([el('ha-icon', ['bubble-cover-button-icon', 'bubble-icon-open']), el('div', ['bubble-cover-button']), el('div', ['bubble-buttons-container']), ...root], c)).toBe(BG);
  });
});

describe('every click row points at a module its profile shows', () => {
  const MOD: Record<string, keyof ReturnType<typeof capsFor>['modules']> = {
    'cms-font-module': 'font', 'cms-icon-color-module': 'iconColor',
    'cms-accent-color-module': 'accentColor', 'cms-background-module': 'background',
  };
  const keys = [
    ...[
      'alarm-control-panel', 'climate', 'cover', 'entity', 'fan', 'humidifier', 'light', 'lock',
      'media-player', 'number', 'person', 'select', 'update', 'vacuum', 'template', 'chips', 'title',
    ].map((t) => `custom:mushroom-${t}-card`),
    'custom:bubble-card/button', 'custom:bubble-card/button/slider', 'custom:bubble-card/separator', 'custom:bubble-card/cover',
  ];
  for (const key of keys) {
    it(key, () => {
      const rows = getCustomCardProfile(key)?.clickToEdit ?? [];
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(MOD[r.module], `${key} → ${r.module}`).toBeDefined();
        expect(capsFor(key).modules[MOD[r.module]], `${key} row ${r.tag ?? r.className}`).toBe(true);
      }
    });
  }

  it('a row whose module the config hides is skipped (icon_color hides Accent: nothing to point at)', () => {
    // a synthetic accent row on a classic card only resolves while Accent is shown
    const chain = [el('span', ['primary']), el('ha-card')];
    expect(pick(chain, 'custom:mushroom-light-card', { icon_color: 'red' })).toBe(FONT);
  });
});

describe('T2a — a profile that hides Threshold owns no threshold property', () => {
  const BTN = 'custom:bubble-card/button';
  const stray: StudioState = {
    ...EMPTY,
    background: { ...EMPTY.background, enabled: true, type: 'solid', color1: '#112244', applyWhen: 'always' },
    iconColor: { ...EMPTY.iconColor, enabled: true, mode: 'plain', color: '#112233' },
    threshold: {
      ...EMPTY.threshold, enabled: true, entityId: 'sensor.t', properties: ['background', 'icon-color'],
      rules: [{ id: 'r0', operator: '>', value: 1, color: '#ee1111' }], defaultColor: '#11ee11',
    },
  };
  it('static Background and Icon Color are still written when a stray threshold state asks for the same properties', () => {
    const css = generateCss(stray, BTN);
    expect(css).toContain('.bubble-button-background {\n  background: #112244;');
    expect(css).toContain('.bubble-icon {\n  color: #112233 !important;');
    expect(css).not.toContain('{{');
  });
  it('a built-in card keeps its old behaviour (Threshold owns the property, the static module is skipped)', () => {
    const css = generateCss(stray, 'tile');
    expect(css).not.toContain('#112244');
    expect(css).toContain('background: {{');
  });
});

describe('T2b — a custom profile does not claim `!important` it would write back plain', () => {
  const BTN = 'custom:bubble-card/button';
  const MUSH = 'custom:mushroom-light-card';

  it('Bubble background without a companion `!important` on the colour stays in Advanced CSS', () => {
    const css = '.bubble-button-background { background: #112244 !important; }';
    const back = parse(css, BTN);
    expect(back.background.enabled).toBe(false);
    expect(back.advanced.rawCss).toContain('background: #112244 !important;');
  });
  it('declarations the generator writes with `!important` are still claimed (icon colour; opacity companion)', () => {
    const css = '.bubble-icon { color: #112233 !important; }\n.bubble-button-background { background: #112244; opacity: 1 !important; }';
    const back = parse(css, BTN);
    expect(back.iconColor).toMatchObject({ enabled: true, color: '#112233' });
    expect(back.background).toMatchObject({ enabled: true, color1: '#112244' });
    expect(back.advanced.rawCss).toBe('');
  });
  it('Bubble border-radius: `!important` only where the separator emitter writes it', () => {
    const sep = 'custom:bubble-card/separator';
    expect(parse('.bubble-separator { border-radius: 8px !important; }', sep).border).toMatchObject({ enabled: true, radiusPx: 8 });
    const plain = parse('.bubble-button-background { border-radius: 8px !important; }', BTN);
    expect(plain.border.enabled).toBe(false);
    expect(plain.advanced.rawCss).toContain('border-radius: 8px !important;');
  });
  it('Mushroom: an `!important` ha-card background or font variable stays in Advanced CSS; plain is claimed', () => {
    const imp = parse('ha-card { background: #112244 !important; --card-primary-font-size: 20px !important; }', MUSH);
    expect(imp.background.enabled).toBe(false);
    expect(imp.font.enabled).toBe(false);
    expect(imp.advanced.rawCss).toContain('background: #112244 !important;');
    expect(imp.advanced.rawCss).toContain('--card-primary-font-size: 20px !important;');
    const plain = parse('ha-card { background: #112244; --card-primary-font-size: 20px; }', MUSH);
    expect(plain.background.enabled).toBe(true);
    expect(plain.font).toMatchObject({ enabled: true, fontSize: 20 });
    expect(plain.advanced.rawCss).toBe('');
  });
  it('built-in cards are unchanged: `!important` is still claimed (and comes back plain)', () => {
    const back = parse('ha-card { background: #112244 !important; }', 'tile');
    expect(back.background.enabled).toBe(true);
    expect(back.advanced.rawCss).toBe('');
  });
});

describe('T2c — conflict rows match selector tokens, not substrings', () => {
  const BTN = 'custom:bubble-card/button';
  const iconOn: StudioState = { ...EMPTY, iconColor: { ...EMPTY.iconColor, enabled: true, mode: 'plain', color: '#112233', sizePx: 40 } };

  it('conflictsFromEmitters marks its rows as token rows', () => {
    const rows = conflictsFromEmitters({ iconColor: { selector: '.bubble-icon' } });
    expect(rows).toEqual([{ module: 'iconColor', selector: '.bubble-icon', props: ['color'], tokens: true }]);
  });
  it('`.bubble-icon-container` does not flag the `.bubble-icon` row', () => {
    const c = findAdvancedCssConflicts('.bubble-icon-container { color: red; --mdc-icon-size: 10px }', iconOn, BTN);
    expect(c.iconColor).toBeUndefined();
  });
  it('`.bubble-icon`, `.bubble-icon.icon` and a descendant `.x .bubble-icon` still flag it', () => {
    for (const sel of ['.bubble-icon', '.bubble-icon.icon', '.card .bubble-icon', 'ha-icon.bubble-icon, .y']) {
      const c = findAdvancedCssConflicts(`${sel} { color: red }`, iconOn, BTN);
      expect(c.iconColor, sel).toEqual([`${sel} { color }`]);
    }
  });
  it('built-in rows keep their substring matching (`ha-state-icon` inside a longer selector)', () => {
    const c = findAdvancedCssConflicts('ha-state-icon$ ha-svg-icon { color: red }', iconOn, 'tile');
    expect(c.iconColor).toEqual(['ha-state-icon$ ha-svg-icon { color }']);
  });
});

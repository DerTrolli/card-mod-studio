/**
 * Heading Style: a property the user never set is not written ("not set" =
 * undefined), so the card keeps its native look. Old fully-populated styles
 * and presets must keep loading and re-saving byte-identically.
 */
import { describe, it, expect } from 'vitest';
import { generateCss } from '../src/generator/css-generator.js';
import {
  DEFAULT_HEADING_STYLE, DEFAULT_FILTER, DEFAULT_ICON_COLOR, DEFAULT_ACCENT_COLOR, DEFAULT_BACKGROUND,
  DEFAULT_ANIMATION, DEFAULT_BORDER, DEFAULT_FONT, DEFAULT_THRESHOLD, mapToStudioState, migrateStudioState,
} from '../src/parser/state-mapper.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';
import type { HeadingStyleModuleState, StudioState } from '../src/types/index.js';

const makeState = (headingStyle: HeadingStyleModuleState): StudioState => ({
  filter: { ...DEFAULT_FILTER }, iconColor: { ...DEFAULT_ICON_COLOR }, accentColor: { ...DEFAULT_ACCENT_COLOR },
  background: { ...DEFAULT_BACKGROUND }, animation: { ...DEFAULT_ANIMATION }, border: { ...DEFAULT_BORDER },
  headingStyle, font: { ...DEFAULT_FONT }, threshold: { ...DEFAULT_THRESHOLD }, advanced: { rawCss: '' },
});
const css = (h: Partial<HeadingStyleModuleState>) =>
  generateCss(makeState({ ...DEFAULT_HEADING_STYLE, enabled: true, ...h }), 'heading');
const load = (style: string) =>
  mapToStudioState(parseCardModConfig({ type: 'heading', card_mod: { style } }), 'heading');

// What the previous version wrote for an untouched-then-enabled module.
const OLD_ALL_PROPS =
  '.container {\n' +
  '  justify-content: flex-start !important;\n' +
  '  --ha-heading-card-title-font-size: 24px;\n' +
  '  --ha-heading-card-title-color: var(--primary-text-color);\n' +
  '  --ha-heading-card-title-font-weight: normal;\n' +
  '  --ha-heading-card-subtitle-font-size: 24px;\n' +
  '  --ha-heading-card-subtitle-color: var(--primary-text-color);\n' +
  '  --ha-heading-card-subtitle-font-weight: normal;\n' +
  '}\n\n' +
  '.content ha-icon {\n  --mdc-icon-size: 24px;\n  color: var(--primary-text-color) !important;\n}';

describe('Heading Style — nothing set writes nothing', () => {
  it('enabled with no property set emits an empty style', () => {
    expect(css({})).toBe('');
  });
  it('DEFAULT_HEADING_STYLE carries no visual defaults', () => {
    expect(DEFAULT_HEADING_STYLE).toEqual({ enabled: false, fontFamily: '' });
  });
});

describe('Heading Style — changing ONE control emits only that property', () => {
  it('text size → only the two size twins', () => {
    expect(css({ fontSize: 20 })).toBe(
      '.container {\n  --ha-heading-card-title-font-size: 20px;\n  --ha-heading-card-subtitle-font-size: 20px;\n}',
    );
  });
  it('weight → only the two weight twins', () => {
    expect(css({ fontWeight: 'medium' })).toBe(
      '.container {\n  --ha-heading-card-title-font-weight: 500;\n  --ha-heading-card-subtitle-font-weight: 500;\n}',
    );
  });
  it('text colour → only the two colour twins', () => {
    expect(css({ textColor: '#ff0000' })).toBe(
      '.container {\n  --ha-heading-card-title-color: #ff0000;\n  --ha-heading-card-subtitle-color: #ff0000;\n}',
    );
  });
  it('alignment → only justify-content', () => {
    expect(css({ alignment: 'center' })).toBe('.container {\n  justify-content: center !important;\n}');
  });
  it('icon size → only --mdc-icon-size (no colour, no container block)', () => {
    expect(css({ iconSize: 30 })).toBe('.content ha-icon {\n  --mdc-icon-size: 30px;\n}');
  });
  it('icon colour → only the colour (no size, no container block)', () => {
    expect(css({ iconColor: '#00ff00' })).toBe('.content ha-icon {\n  color: #00ff00 !important;\n}');
  });
  it('font family → only the family rule', () => {
    expect(css({ fontFamily: 'serif' })).toBe('.content p,\n.content .heading {\n  font-family: serif;\n}');
  });
});

describe('Heading Style — old styles are sacred', () => {
  it('an all-properties style from the previous version loads to the same values and re-saves byte-identically', () => {
    const s = load(OLD_ALL_PROPS);
    expect(s.advanced.rawCss).toBe('');
    expect(s.headingStyle).toMatchObject({
      enabled: true, fontSize: 24, textColor: 'var(--primary-text-color)', fontWeight: 'normal',
      iconSize: 24, iconColor: 'var(--primary-text-color)', alignment: 'left',
    });
    expect(generateCss(s, 'heading')).toBe(OLD_ALL_PROPS);
  });

  it('a preset saved by the previous version (explicit values) loads and emits identically', () => {
    const preset = {
      headingStyle: {
        enabled: true, fontSize: 24, textColor: 'var(--primary-text-color)', fontWeight: 'normal', fontFamily: '',
        iconSize: 24, iconColor: 'var(--primary-text-color)', alignment: 'left',
      },
    };
    const migrated = migrateStudioState(preset);
    expect(migrated.headingStyle).toEqual(preset.headingStyle);
    expect(generateCss(migrated, 'heading')).toBe(OLD_ALL_PROPS);
  });

  it('a preset with unset properties (keys dropped by JSON) loads as unset, not as old defaults', () => {
    const saved = JSON.parse(JSON.stringify({ headingStyle: { ...DEFAULT_HEADING_STYLE, enabled: true, fontSize: 20 } }));
    const migrated = migrateStudioState(saved);
    expect(migrated.headingStyle.textColor).toBeUndefined();
    expect(generateCss(migrated, 'heading')).toBe(css({ fontSize: 20 }));
  });
});

describe('Heading Style — hand-written partials round-trip as the same partial', () => {
  it.each([
    ['size only', '.container {\n  --ha-heading-card-title-font-size: 20px;\n  --ha-heading-card-subtitle-font-size: 20px;\n}'],
    ['icon colour only', '.content ha-icon {\n  color: #00ff00 !important;\n}'],
    ['alignment only', '.container {\n  justify-content: flex-end !important;\n}'],
    ['weight + icon size', '.container {\n  --ha-heading-card-title-font-weight: bold;\n  --ha-heading-card-subtitle-font-weight: bold;\n}\n\n.content ha-icon {\n  --mdc-icon-size: 20px;\n}'],
  ])('%s', (_n, style) => {
    const s = load(style);
    expect(s.advanced.rawCss).toBe('');
    expect(s.headingStyle.enabled).toBe(true);
    expect(generateCss(s, 'heading')).toBe(style);
  });

  it('a size-only style does not gain the other properties', () => {
    const s = load('.container {\n  --ha-heading-card-title-font-size: 20px;\n}');
    expect(s.headingStyle.textColor).toBeUndefined();
    expect(s.headingStyle.fontWeight).toBeUndefined();
    expect(s.headingStyle.iconSize).toBeUndefined();
    expect(s.headingStyle.iconColor).toBeUndefined();
    expect(s.headingStyle.alignment).toBeUndefined();
  });
});

describe('Heading Style — zero sizes are values, not "unset"', () => {
  const ICON0 = '.content ha-icon {\n  --mdc-icon-size: 0px;\n}';
  const FONT0 =
    '.container {\n  --ha-heading-card-title-font-size: 0px;\n  --ha-heading-card-subtitle-font-size: 0px;\n}';
  it.each([
    ['icon size 0px (hides the icon)', ICON0, { iconSize: 0 }],
    ['font size 0px', FONT0, { fontSize: 0 }],
  ])('%s survives load → state → save byte-identically', (_n, style, expected) => {
    const s = load(style);
    expect(s.advanced.rawCss).toBe('');
    expect(s.headingStyle).toMatchObject(expected);
    expect(generateCss(s, 'heading')).toBe(style);
  });
  it('a dictionary-form style keeps the 0px declaration too', () => {
    const s = mapToStudioState(
      parseCardModConfig({ type: 'heading', card_mod: { style: { '.': ICON0 } } }),
      'heading',
    );
    expect(s.headingStyle).toMatchObject({ enabled: true, iconSize: 0 });
    expect(generateCss(s, 'heading')).toContain('--mdc-icon-size: 0px;');
  });
  it('the generator writes 0 when set, nothing when undefined', () => {
    expect(css({ iconSize: 0 })).toBe(ICON0);
    expect(css({ fontSize: 0 })).toBe(FONT0);
    expect(css({ iconSize: undefined, fontSize: undefined })).toBe('');
  });
});

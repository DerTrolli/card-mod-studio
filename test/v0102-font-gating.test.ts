/**
 * v0.10.2 — Font module gating on picture-glance / NO_FONT_SIZE_TYPES, and
 * the upgrade path for CSS written by v0.10.1.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { NO_FONT_SIZE_TYPES } from '../src/utils/card-caps.js';
import { generateCss } from '../src/generator/css-generator.js';
import { DEFAULT_FONT, mapToStudioState } from '../src/parser/state-mapper.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { buildMergedStudioState } from '../src/editor/studio-state.js';
import type { CardModCardConfig, StudioState } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

const fontState = (base: StudioState): StudioState => ({
  ...base, font: { ...DEFAULT_FONT, enabled: true, fontSize: 20, color: '#ff0000' },
});
const blank = () => buildMergedStudioState({ type: 'picture-glance' } as unknown as CardModCardConfig);

describe('NO_FONT_SIZE_TYPES', () => {
  it('is exactly the six cards that size their own text', () => {
    expect([...NO_FONT_SIZE_TYPES].sort()).toEqual(
      ['alarm-panel', 'area', 'humidifier', 'picture-entity', 'picture-glance', 'weather-forecast'],
    );
  });
});

describe('cms-font-module allowSize', () => {
  type FontEl = { state: unknown; allowSize: boolean; _open: boolean; _renderBody(): unknown };
  let Font: new () => FontEl;
  beforeAll(async () => {
    await import('../src/modules/module-font.js');
    Font = registry.get('cms-font-module') as new () => FontEl;
  });
  const body = (allowSize: boolean) => {
    const el = new Font();
    el.state = { ...DEFAULT_FONT, enabled: true };
    el.allowSize = allowSize;
    return templateText(el._renderBody());
  };
  it('allowSize=false omits the Text size row but keeps Weight and Colour', () => {
    const t = body(false);
    expect(t).not.toContain('Text size');
    expect(t).toContain('Weight');
    expect(t).toContain('Text color');
  });
  it('allowSize=true (default) shows the Text size row', () => {
    expect(body(true)).toContain('Text size');
  });
});

describe('header-title variables by card type', () => {
  it('picture-glance Font colour+size emits no --ha-card-header-* declarations', () => {
    const css = generateCss(fontState(blank()), 'picture-glance');
    expect(css).not.toContain('--ha-card-header');
    // the size/colour declarations the parser recognises the module by remain
    expect(css).toContain('font-size: 20px;');
    expect(css).toContain('color: #ff0000;');
  });
  it('entities (still a header-title card) keeps them', () => {
    const css = generateCss(fontState(blank()), 'entities');
    expect(css).toContain('--ha-card-header-font-size: calc(20px * 1.5);');
    expect(css).toContain('--ha-card-header-color: #ff0000;');
  });
});

describe('upgrade: CSS written by v0.10.1 for picture-glance (Font 20px + #ff0000)', () => {
  // Verbatim shape of v0.10.1 (origin/main): picture-glance was in
  // HEADER_TITLE_CARD_TYPES, so the base ha-card block carried the header vars.
  const v0101 = [
    'ha-card {',
    '  font-size: 20px;',
    '  font-weight: normal;',
    '  color: #ff0000;',
    '  --ha-card-header-font-size: calc(20px * 1.5);',
    '  --ha-card-header-color: #ff0000;',
    '}',
  ].join('\n');

  it('is fully re-recognised as Font, header vars are claimed and dropped on regenerate, nothing lands in Advanced CSS', () => {
    const back = mapToStudioState(parseCardModConfig({ type: 'picture-glance', card_mod: { style: v0101 } }), 'picture-glance');
    expect(back.font).toMatchObject({ enabled: true, fontSize: 20, color: '#ff0000', fontWeight: 'normal' });
    expect(back.advanced.rawCss).toBe('');
    const regen = generateCss(back, 'picture-glance');
    expect(regen).toContain('font-size: 20px;');
    expect(regen).toContain('color: #ff0000;');
    expect(regen).not.toContain('--ha-card-header');
  });
});

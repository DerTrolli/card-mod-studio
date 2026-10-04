/**
 * Per-card module gating (card-caps.ts) — the sets are measured by
 * tools/sandbox/harness/module_effect_audit.mjs (rendered pixels on both
 * engines); these tests pin the rules that hang off them.
 */
import { describe, it, expect } from 'vitest';
import { showsAccentColor, thresholdPropertyAllowed, CONTAINER_CARD_TYPES } from '../src/utils/card-caps.js';
import { filterPresetStateForCardType } from '../src/utils/preset-caps.js';
import { generateCss } from '../src/generator/css-generator.js';
import {
  DEFAULT_FILTER, DEFAULT_ICON_COLOR, DEFAULT_ACCENT_COLOR, DEFAULT_BACKGROUND, DEFAULT_ANIMATION,
  DEFAULT_BORDER, DEFAULT_HEADING_STYLE, DEFAULT_FONT, DEFAULT_THRESHOLD, mapToStudioState,
} from '../src/parser/state-mapper.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';
import type { StudioState } from '../src/types/index.js';

const state = (over: Partial<StudioState> = {}): StudioState => ({
  filter: { ...DEFAULT_FILTER }, iconColor: { ...DEFAULT_ICON_COLOR }, accentColor: { ...DEFAULT_ACCENT_COLOR },
  background: { ...DEFAULT_BACKGROUND }, animation: { ...DEFAULT_ANIMATION }, border: { ...DEFAULT_BORDER },
  headingStyle: { ...DEFAULT_HEADING_STYLE }, font: { ...DEFAULT_FONT }, threshold: { ...DEFAULT_THRESHOLD },
  advanced: { rawCss: '' }, ...over,
});

describe('per-card gating', () => {
  it('Accent Color only where a card reads it', () => {
    for (const t of ['tile', 'gauge', 'thermostat', 'sensor', 'entity', 'media-control']) expect(showsAccentColor(t)).toBe(true);
    for (const t of ['markdown', 'light', 'button', 'glance', 'picture', 'heading', 'entities']) expect(showsAccentColor(t)).toBe(false);
  });

  it('Threshold offers the same colours the matching modules do', () => {
    expect(thresholdPropertyAllowed('icon-color', 'gauge')).toBe(false);
    expect(thresholdPropertyAllowed('accent-color', 'gauge')).toBe(true);
    expect(thresholdPropertyAllowed('accent-color', 'markdown')).toBe(false);
    expect(thresholdPropertyAllowed('text-color', 'tile')).toBe(true);
    expect(thresholdPropertyAllowed('text-color', 'todo-list')).toBe(false);
    expect(thresholdPropertyAllowed('background', 'picture')).toBe(false);
    expect(thresholdPropertyAllowed('icon-color', 'area')).toBe(false);
  });

  it('entity-filter is treated as a container (a style on it reaches nothing)', () => {
    expect(CONTAINER_CARD_TYPES.has('entity-filter')).toBe(true);
  });

  it('presets drop Accent and Threshold properties a card type does not offer', () => {
    const preset = state({
      accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'plain', color: '#f00' },
      threshold: { ...DEFAULT_THRESHOLD, enabled: true, entityId: 'sensor.t', properties: ['accent-color', 'background'], rules: [{ id: '0', operator: '>', value: 1, color: '#f00' }] },
    });
    const md = filterPresetStateForCardType(preset, 'markdown');
    expect(md.accentColor.enabled).toBe(false);
    expect(md.threshold.properties).toEqual(['background']);
    const pic = filterPresetStateForCardType(preset, 'picture');
    expect(pic.threshold.enabled).toBe(false);
    expect(filterPresetStateForCardType(preset, 'tile')).toEqual(preset);
  });
});

describe('Threshold Text Color on a tile', () => {
  it('also drives the tile\'s own text variables, and round-trips byte-stably', () => {
    const s = state({ threshold: { ...DEFAULT_THRESHOLD, enabled: true, entityId: 'light.a', properties: ['text-color'], rules: [{ id: '0', operator: '>', value: 1, color: '#ff0000' }] } });
    const css = generateCss(s, 'tile');
    expect(css).toMatch(/--ha-tile-info-primary-color: \{\{/);
    expect(css).toMatch(/--ha-tile-info-secondary-color: \{\{/);
    const back = mapToStudioState(parseCardModConfig({ type: 'tile', card_mod: { style: css } }));
    expect(back.threshold.properties).toEqual(['text-color']);
    expect(back.advanced.rawCss).toBe('');
    expect(generateCss(back, 'tile')).toBe(css);
    expect(generateCss(s, 'sensor')).not.toContain('--ha-tile-info');
  });

  it('on a titled card it also colours the title (--ha-card-header-color), round-trip stable', () => {
    const s = state({ threshold: { ...DEFAULT_THRESHOLD, enabled: true, entityId: 'sensor.t', properties: ['text-color'], rules: [{ id: '0', operator: '>', value: 1, color: '#ff0000' }] } });
    const css = generateCss(s, 'history-graph');
    expect(css).toMatch(/--ha-card-header-color: \{\{/);
    const back = mapToStudioState(parseCardModConfig({ type: 'history-graph', card_mod: { style: css } }));
    expect(back.advanced.rawCss).toBe('');
    expect(generateCss(back, 'history-graph')).toBe(css);
  });
});

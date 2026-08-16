/**
 * Unit tests for filterPresetStateForCardType (src/utils/preset-caps.ts) —
 * the fix for "preset load emits CSS for modules the target card type's
 * panel hides": a preset saved on a tile (animation + background + border
 * enabled) loaded onto a heading card used to generate blocks for modules
 * the heading panel HIDES (NO_ANIMATION_TYPES / NO_BACKGROUND_TYPES /
 * NO_BORDER_TYPES / … gates in card-caps.ts) — styling with no visible
 * control left to ever disable it.
 */

import { describe, it, expect } from 'vitest';
import { filterPresetStateForCardType } from '../src/utils/preset-caps.js';
import { migrateStudioState, DEFAULT_THRESHOLD } from '../src/parser/state-mapper.js';
import { generateCss } from '../src/generator/css-generator.js';
import type { StudioState } from '../src/types/index.js';

/** A realistic "saved on a tile card" preset: every module a tile panel
 *  offers is enabled with non-default values. */
function tilePresetState(): StudioState {
  const base = migrateStudioState({});
  return {
    ...base,
    filter: { ...base.filter, enabled: true, grayscale: true },
    iconColor: { ...base.iconColor, enabled: true, mode: 'plain', color: '#ff0000' },
    accentColor: { ...base.accentColor, enabled: true, mode: 'plain', color: '#00ff00' },
    background: { ...base.background, enabled: true, type: 'solid', color1: '#111111' },
    animation: { ...base.animation, enabled: true, preset: 'pulse', speedS: 1 },
    border: { ...base.border, enabled: true, borderWidth: 3, borderColor: '#0000ff', radiusPx: 20 },
    font: { ...base.font, enabled: true, fontSize: 18 },
    threshold: {
      ...base.threshold,
      enabled: true,
      entityId: 'sensor.temp',
      rules: [{ id: 'r1', operator: '>=', value: 30, color: '#ff0000' }],
    },
    advanced: { rawCss: 'ha-card { outline: 1px dashed hotpink; }' },
  } as StudioState;
}

describe('filterPresetStateForCardType', () => {
  it('tile preset onto heading: animation/background/border reset to disabled defaults', () => {
    const filtered = filterPresetStateForCardType(tilePresetState(), 'heading');
    expect(filtered.animation.enabled).toBe(false);
    expect(filtered.background.enabled).toBe(false);
    expect(filtered.border.enabled).toBe(false);
  });

  it('tile preset onto heading: icon color, accent and font are hidden there too and reset', () => {
    const filtered = filterPresetStateForCardType(tilePresetState(), 'heading');
    expect(filtered.iconColor.enabled).toBe(false); // heading ∈ NO_ICON_COLOR_TYPES
    expect(filtered.accentColor.enabled).toBe(false); // accent hidden on heading
    expect(filtered.font.enabled).toBe(false); // heading ∈ NO_FONT_TYPES
  });

  it('tile preset onto heading: always-visible modules survive untouched', () => {
    const preset = tilePresetState();
    const filtered = filterPresetStateForCardType(preset, 'heading');
    expect(filtered.filter).toEqual(preset.filter);
    expect(filtered.advanced).toEqual(preset.advanced);
    // threshold is only hidden on entities cards — heading keeps it
    expect(filtered.threshold).toEqual(preset.threshold);
  });

  it('tile preset onto tile: unchanged (deep-equal), and the input is never mutated', () => {
    const preset = tilePresetState();
    const snapshot = structuredClone(preset);
    const filtered = filterPresetStateForCardType(preset, 'tile');
    expect(filtered).toEqual(snapshot);
    expect(preset).toEqual(snapshot); // pure — no in-place edits
  });

  it('heading preset onto tile: headingStyle (heading-only module) resets to default', () => {
    const base = migrateStudioState({});
    const headingPreset: StudioState = {
      ...base,
      headingStyle: { ...base.headingStyle, enabled: true, fontSize: 40, textColor: '#ff00ff' },
    };
    const filtered = filterPresetStateForCardType(headingPreset, 'tile');
    expect(filtered.headingStyle.enabled).toBe(false);
    // …while a heading target keeps it
    const kept = filterPresetStateForCardType(headingPreset, 'heading');
    expect(kept.headingStyle).toEqual(headingPreset.headingStyle);
  });

  it('tile preset onto entities: iconColor, accent and threshold (all hidden there) reset', () => {
    const filtered = filterPresetStateForCardType(tilePresetState(), 'entities');
    expect(filtered.iconColor.enabled).toBe(false);
    expect(filtered.accentColor.enabled).toBe(false);
    expect(filtered.threshold.enabled).toBe(false);
    expect(filtered.threshold.rules).toEqual([]);
    // entities cards still show background/animation/border/font — kept
    expect(filtered.background.enabled).toBe(true);
    expect(filtered.animation.enabled).toBe(true);
    expect(filtered.border.enabled).toBe(true);
    expect(filtered.font.enabled).toBe(true);
  });

  it('resets never alias the shared DEFAULT_THRESHOLD arrays', () => {
    const filtered = filterPresetStateForCardType(tilePresetState(), 'entities');
    expect(filtered.threshold.properties).not.toBe(DEFAULT_THRESHOLD.properties);
    expect(filtered.threshold.colorStops).not.toBe(DEFAULT_THRESHOLD.colorStops);
    expect(filtered.threshold.colorStops[0]).not.toBe(DEFAULT_THRESHOLD.colorStops[0]);
  });

  it('end to end: the filtered heading state generates no animation/background/border CSS', () => {
    const unfiltered = tilePresetState();
    // Sanity: WITHOUT the filter these undisableable blocks were emitted
    const buggyCss = generateCss(unfiltered, 'heading');
    expect(buggyCss).toContain('@keyframes');
    expect(buggyCss).toContain('background:');
    expect(buggyCss).toContain('border:');

    const fixedCss = generateCss(filterPresetStateForCardType(unfiltered, 'heading'), 'heading');
    expect(fixedCss).not.toContain('@keyframes');
    expect(fixedCss).not.toContain('background:');
    expect(fixedCss).not.toContain('border:');
  });
});

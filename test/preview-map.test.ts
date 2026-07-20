import { describe, it, expect } from 'vitest';
import { mapElementToTarget, mapElementToMatch } from '../src/utils/preview-map.js';
import type { PickChainElement } from '../src/utils/preview-map.js';

/** Shorthand chain-element builder. */
const el = (tag: string, classes: string[] = [], id = ''): PickChainElement => ({
  tag,
  id,
  classes,
});

describe('mapElementToTarget', () => {
  it('maps an icon chain to the Icon Color module', () => {
    const chain = [
      el('ha-state-icon'),
      el('ha-tile-icon'),
      el('ha-card'),
      el('hui-tile-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(chain, 'tile')).toEqual({
      module: 'cms-icon-color-module',
      label: 'Icon Color',
    });
  });

  it('falls through the icon rule on gauge cards (no icon module there)', () => {
    // Same icon-ish deepest element, but gauge is in NO_ICON_COLOR_TYPES —
    // must NOT claim the (hidden) icon module; the ha-gauge ancestor wins.
    const chain = [
      el('ha-state-icon'),
      el('ha-gauge'),
      el('ha-card'),
      el('hui-gauge-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(chain, 'gauge')).toEqual({
      module: 'cms-accent-color-module',
      label: 'Gauge / Accent Color',
    });
  });

  it('maps gauge internals (value-text) to Gauge / Accent Color', () => {
    const chain = [el('text', ['value-text']), el('ha-gauge'), el('ha-card'), el('hui-card')];
    expect(mapElementToTarget(chain, 'gauge')).toEqual({
      module: 'cms-accent-color-module',
      label: 'Gauge / Accent Color',
    });
  });

  it('maps the card header to the Font module', () => {
    const chain = [el('h1', ['card-header']), el('ha-card'), el('hui-card')];
    expect(mapElementToTarget(chain, 'entities')).toEqual({
      module: 'cms-font-module',
      label: 'Font',
    });
  });

  it('maps .title p on a heading card to Heading Style', () => {
    const chain = [
      el('p'),
      el('div', ['title']),
      el('ha-card'),
      el('hui-heading-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(chain, 'heading')).toEqual({
      module: 'cms-heading-style-module',
      label: 'Heading Style',
    });
    // …and the highlight rect is the .title container, not the deep <p>.
    expect(mapElementToMatch(chain, 'heading')?.index).toBe(1);
  });

  it('maps a row tag on an entities card to Entity Rows', () => {
    const chain = [
      el('hui-sensor-entity-row'),
      el('div'),
      el('div', ['card-content'], 'states'),
      el('ha-card'),
      el('hui-entities-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(chain, 'entities')).toEqual({
      module: 'cms-entities-rows-module',
      label: 'Entity Rows',
    });
  });

  it('maps a row icon (state-badge) on entities to Entity Rows, not Icon Color', () => {
    // entities cards hide the card-level Icon Color module — the per-row
    // module owns row icon colors instead.
    const chain = [
      el('state-badge'),
      el('hui-generic-entity-row'),
      el('hui-sensor-entity-row'),
      el('ha-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(chain, 'entities')).toEqual({
      module: 'cms-entities-rows-module',
      label: 'Entity Rows',
    });
  });

  it('maps generic-entity-row text to Font (walked before the row tag)', () => {
    const chain = [
      el('div', ['info', 'text-content']),
      el('hui-generic-entity-row'),
      el('hui-sensor-entity-row'),
      el('ha-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(chain, 'entities')).toEqual({
      module: 'cms-font-module',
      label: 'Font',
    });
  });

  it('maps the button card name (bare span) and state (span.state) to Font', () => {
    const bare = [el('span'), el('ha-card'), el('hui-button-card'), el('hui-card')];
    const state = [el('span', ['state']), el('ha-card'), el('hui-button-card'), el('hui-card')];
    expect(mapElementToTarget(bare, 'button')?.label).toBe('Font');
    expect(mapElementToTarget(state, 'button')?.label).toBe('Font');
    // …but a bare span on other cards stays unclaimed (tile slider tooltip).
    expect(mapElementToTarget(bare, 'entity')?.label).toBe('Background & card surface');
  });

  it('maps gauge / thermostat p.title to Font (dedicated .title emitter)', () => {
    const chain = [el('p', ['title']), el('ha-card'), el('hui-gauge-card'), el('hui-card')];
    expect(mapElementToTarget(chain, 'gauge')?.label).toBe('Font');
    expect(mapElementToTarget(chain, 'thermostat')?.label).toBe('Font');
  });

  it('maps the entity/sensor card name (div.header) to Font', () => {
    const chain = [el('div', ['header']), el('ha-card'), el('hui-entity-card'), el('hui-card')];
    expect(mapElementToTarget(chain, 'entity')?.label).toBe('Font');
    expect(mapElementToTarget(chain, 'sensor')?.label).toBe('Font');
  });

  it('does NOT trust font classes on SVG internals (light slider handle)', () => {
    const chain = [
      el('path', ['handle'], 'value'),
      el('g', ['value', 'handle']),
      el('round-slider'),
      el('ha-card'),
      el('hui-light-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(chain, 'light')?.label).toBe('Background & card surface');
  });

  it('maps the thermostat dial to Accent Color, humidifier dial to fallback', () => {
    const chain = [
      el('path', ['arc', 'arc-active', 'value'], 'value'),
      el('g', [], 'container'),
      el('svg', [], 'slider'),
      el('ha-control-circular-slider'),
      el('ha-state-control-climate-temperature'),
      el('div', ['container']),
      el('ha-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(chain, 'thermostat')).toEqual({
      module: 'cms-accent-color-module',
      label: 'Accent Color',
    });
    // Accent emits no humidifier dial variables — must not claim it there.
    expect(mapElementToTarget(chain, 'humidifier')?.label).toBe('Background & card surface');
  });

  it('maps the sensor card graph to Graph / Accent Color', () => {
    const chain = [
      el('rect'),
      el('g'),
      el('svg'),
      el('hui-graph-base'),
      el('hui-graph-header-footer'),
      el('div', ['footer']),
      el('ha-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(chain, 'sensor')).toEqual({
      module: 'cms-accent-color-module',
      label: 'Graph / Accent Color',
    });
  });

  it('maps tile feature rows to Features / Accent Color', () => {
    const chain = [
      el('div', ['slider-track-bar', 'start']),
      el('ha-control-slider'),
      el('hui-light-brightness-card-feature'),
      el('hui-card-feature'),
      el('hui-card-features'),
      el('ha-card'),
      el('hui-tile-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(chain, 'tile')).toEqual({
      module: 'cms-accent-color-module',
      label: 'Features / Accent Color',
    });
  });

  it('maps markdown body content to Font', () => {
    const chain = [
      el('strong'),
      el('p'),
      el('ha-markdown-element'),
      el('ha-markdown'),
      el('ha-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(chain, 'markdown')?.label).toBe('Font');
  });

  it('maps glance entity columns (incl. the uncolorable icon) to Font', () => {
    const stateText = [
      el('div'),
      el('div', ['entity', 'action']),
      el('div', ['entities']),
      el('ha-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(stateText, 'glance')?.label).toBe('Font');
    // Icon Color is hidden on glance — the icon falls through to the column.
    const icon = [
      el('ha-state-icon'),
      el('state-badge'),
      el('div', ['entity', 'action']),
      el('ha-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(icon, 'glance')?.label).toBe('Font');
  });

  it('maps media-control title/app text to Font', () => {
    const marquee = [
      el('span'),
      el('div', ['marquee-inner']),
      el('hui-marquee'),
      el('div', ['media-info']),
      el('ha-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(marquee, 'media-control')?.label).toBe('Font');
    const appName = [
      el('div', ['icon-name']),
      el('div', ['top-info']),
      el('ha-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(appName, 'media-control')?.label).toBe('Font');
  });

  it('maps picture card footers to Font', () => {
    const pe = [
      el('div'),
      el('div', ['footer', 'both']),
      el('ha-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(pe, 'picture-entity')?.label).toBe('Font');
    const pg = [
      el('div', ['title']),
      el('div', ['box']),
      el('ha-card'),
      el('hui-card'),
    ];
    expect(mapElementToTarget(pg, 'picture-glance')?.label).toBe('Font');
  });

  it('falls back to Background for a plain ha-card', () => {
    const chain = [el('ha-card'), el('hui-button-card'), el('hui-card')];
    expect(mapElementToTarget(chain, 'button')).toEqual({
      module: 'cms-background-module',
      label: 'Background & card surface',
    });
  });

  it('falls back to Advanced CSS on picture cards (no background module)', () => {
    const chain = [el('ha-card'), el('hui-picture-card'), el('hui-card')];
    expect(mapElementToTarget(chain, 'picture')).toEqual({
      module: 'cms-advanced-module',
      label: 'Advanced CSS',
    });
  });

  it('returns null for an empty chain', () => {
    expect(mapElementToTarget([], 'tile')).toBeNull();
  });
});

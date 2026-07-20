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

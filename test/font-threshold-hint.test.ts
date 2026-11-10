/**
 * Font: the "Threshold Colors is setting the text color" hint. Shown next to
 * the Text color control only when Threshold owns the text colour AND the
 * Font module has a colour that would otherwise be written.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { DEFAULT_FONT, DEFAULT_THRESHOLD, mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { generateCss, thresholdOwnedProperties } from '../src/generator/css-generator.js';
import { capsFor } from '../src/utils/card-caps.js';
import type { FontModuleState, ThresholdModuleState } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

type El = { state: FontModuleState; thresholdOwned: boolean; allowColor: boolean; _renderBody(): unknown };
let Mod: new () => El;
beforeAll(async () => {
  (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
    constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
  await import('../src/modules/module-font.js');
  Mod = registry.get('cms-font-module') as new () => El;
});

const body = (state: Partial<FontModuleState>, owned: boolean, allowColor = true) => {
  const el = new Mod();
  el.state = { ...DEFAULT_FONT, enabled: true, ...state };
  el.thresholdOwned = owned;
  el.allowColor = allowColor;
  return templateText(el._renderBody());
};

describe('Font module hint', () => {
  it('shows when Threshold owns the text colour and a Font colour is set', () => {
    const t = body({ color: '#ff0000' }, true);
    expect(t).toContain('Threshold Colors is setting the');
    expect(t).toContain('Text Color');
  });
  it('is hidden when no Font colour is set, Threshold does not own it, or Font is off', () => {
    expect(body({}, true)).not.toContain('Threshold Colors is setting');
    expect(body({ color: '#ff0000' }, false)).not.toContain('Threshold Colors is setting');
    expect(body({ color: '#ff0000', enabled: false }, true)).not.toContain('Threshold Colors is setting');
  });
  it('sits with the Text color control and does not claim the other Font controls', () => {
    const t = body({ color: '#ff0000' }, true);
    expect(t.indexOf('Threshold Colors is setting')).toBeGreaterThan(t.indexOf('Text color'));
    expect(t).toContain('Text size');
    expect(t).toContain('Font family');
  });
});

describe('generator drops the Font colour exactly where the hint says', () => {
  const BLANK = mapToStudioState(parseStyleValue(''));
  const threshold: ThresholdModuleState = {
    ...DEFAULT_THRESHOLD, enabled: true, entityId: 'sensor.t', properties: ['text-color'],
    rules: [{ id: '0', operator: '>', value: 20, color: '#ff0000' }],
  };
  const font: FontModuleState = { ...DEFAULT_FONT, enabled: true, color: '#00ff00', fontSize: 20 };
  const types = ['tile', 'entity', 'custom:mushroom-template-card', 'custom:bubble-card/button'];
  for (const type of types) {
    it(`${type}: Font colour is not written when Threshold owns text-color`, () => {
      const caps = capsFor(type);
      const css = generateCss({ ...BLANK, font, threshold }, type);
      const owned = thresholdOwnedProperties(threshold).has('text-color') && !(caps.custom && !caps.modules.threshold);
      if (owned) expect(css).not.toContain('#00ff00');
      else expect(css).toContain('#00ff00');
    });
  }
});

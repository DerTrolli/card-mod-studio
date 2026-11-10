/**
 * The Studio preview is a real copy of the card. Mouse clicks are blocked by
 * pointer-events, but the card was still a keyboard tab stop: Enter/Space on
 * it switched a real entity. The preview card must be `inert` — while the
 * click-to-edit overlay (a sibling) stays outside it.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import type { CardModCardConfig } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
registry.define('hui-card', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

type PanelT = {
  config?: CardModCardConfig;
  hass?: unknown;
  _initState(): void;
  render(): unknown;
};
let Panel: new () => PanelT;
beforeAll(async () => {
  await import('../src/editor/cms-panel.js');
  Panel = registry.get('cms-panel') as new () => PanelT;
});

const renderText = (config: unknown) => {
  const p = new Panel();
  p.config = config as CardModCardConfig;
  p.hass = { states: {}, themes: {} };
  p._initState();
  return templateText(p.render());
};

describe('preview is inert', () => {
  it.each([
    ['button card', { type: 'button', entity: 'input_boolean.a' }],
    ['tile', { type: 'tile', entity: 'light.a' }],
    ['entities card (row preview)', { type: 'entities', entities: ['light.a', 'lock.b'] }],
    ['vertical-stack (children inside one preview)', { type: 'vertical-stack', cards: [{ type: 'tile', entity: 'light.a' }] }],
  ])('%s: the preview hui-card carries inert', (_n, config) => {
    const t = renderText(config);
    expect(t.match(/<hui-card\b/g)?.length).toBe(1);
    expect(t).toMatch(/<hui-card inert\b/);
  });

  it('keeps pointer-events off, and the picker overlay outside the inert card', () => {
    const t = renderText({ type: 'tile', entity: 'light.a' });
    // inert must not sit on the wrapper or stage: it would silence the overlay too.
    expect(t).not.toMatch(/class="preview-(card-wrapper|stage)"[^>]*inert/);
    expect(t).toContain('<cms-preview-picker');
  });
});

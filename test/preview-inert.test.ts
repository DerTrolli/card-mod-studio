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

describe('the inert preview is announced to assistive technology', () => {
  const NOTE = 'Live preview of the card (not interactive)';
  it('a visually hidden line sits in the stage, outside the inert card and beside the picker', () => {
    const t = renderText({ type: 'tile', entity: 'light.a' });
    expect(t).toContain(`<span class="preview-sr-note">${NOTE}</span>`);
    const stage = t.slice(t.indexOf('<div class="preview-stage">'));
    expect(stage.indexOf('preview-sr-note')).toBeLessThan(stage.indexOf('<hui-card'));
    expect(stage.indexOf('preview-sr-note')).toBeLessThan(stage.indexOf('<cms-preview-picker'));
    // not inside the card, and not hidden from AT
    expect(t).not.toMatch(/<hui-card[^>]*>[^<]*preview-sr-note/);
    expect(t).not.toMatch(/preview-sr-note[^>]*aria-hidden/);
  });

  it('takes no layout space (out of flow, 1px, clipped)', async () => {
    const css = (await import('node:fs')).readFileSync('src/editor/cms-panel.ts', 'utf8');
    const rule = /\.preview-sr-note\s*\{([^}]*)\}/.exec(css)![1];
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/width:\s*1px/);
    expect(rule).toMatch(/clip:/);
  });

  it('is absent when there is no preview to describe', () => {
    const p = new Panel();
    p.config = { type: 'tile', entity: 'light.a' } as CardModCardConfig;
    p._initState(); // no hass → no preview
    expect(templateText(p.render())).not.toContain('preview-sr-note');
  });
});

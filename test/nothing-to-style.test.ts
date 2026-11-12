/**
 * Panel notes by card kind: the "weren't recognised" note needs modules that
 * could have recognised something; a card that renders nothing says so and
 * has no preset bar.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import type { CardModCardConfig } from '../src/types/index.js';
import { capsFor } from '../src/utils/card-caps.js';
import * as capsModule from '../src/utils/card-caps.js';
import { MUSHROOM_PROFILES } from '../src/utils/profiles/mushroom.js';
import { BUBBLE_PROFILES } from '../src/utils/profiles/bubble.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

type PanelT = { config?: CardModCardConfig; _initState(): void; render(): unknown; dispatchEvent(e: Event): boolean };
let Panel: new () => PanelT;
beforeAll(async () => {
  await import('../src/editor/cms-panel.js');
  Panel = registry.get('cms-panel') as new () => PanelT;
});

const UNRECOGNISED = "weren't recognised";
const NOTHING = 'This card renders nothing';
const render = (config: unknown) => {
  const p = new Panel();
  p.dispatchEvent = () => true;
  p.config = config as CardModCardConfig;
  p._initState();
  return templateText(p.render());
};
const css = { card_mod: { style: 'ha-card { color: red; }\n.odd-thing { foo: bar; }' } };

describe('"weren\'t recognised" note', () => {
  it.each([
    ['vertical-stack', { type: 'vertical-stack', cards: [] }],
    ['horizontal-stack', { type: 'horizontal-stack', cards: [] }],
    ['grid', { type: 'grid', cards: [] }],
    ['conditional', { type: 'conditional', conditions: [], card: { type: 'tile', entity: 'light.a' } }],
    ['mushroom empty card', { type: 'custom:mushroom-empty-card' }],
  ])('%s: never shown, CSS stays in Advanced CSS', (_n, base) => {
    const t = render({ ...base, ...css });
    expect(t).not.toContain(UNRECOGNISED);
    expect(t).toContain('cms-advanced-module');
  });
  it('still shown on a card with modules that did not adopt the CSS', () => {
    expect(render({ type: 'tile', entity: 'light.a', ...css })).toContain(UNRECOGNISED);
  });
});

describe('a card that renders nothing', () => {
  const empty = { type: 'custom:mushroom-empty-card' };
  it('gets the one-line note once and no preset bar', () => {
    const t = render(empty);
    expect(t.split(NOTHING)).toHaveLength(2);
    expect(t).not.toContain('preset-bar');
    expect(t).toContain('cms-palette-manager');
    expect(t).toContain('cms-advanced-module');
  });
  it.each([
    ['tile', { type: 'tile', entity: 'light.a' }],
    ['vertical-stack', { type: 'vertical-stack', cards: [] }],
    ['entities', { type: 'entities', entities: ['light.a'] }],
    ['unprofiled custom card', { type: 'custom:button-card', entity: 'light.a' }],
    ['profiled custom card', { type: 'custom:mushroom-entity-card', entity: 'light.a' }],
  ])('%s gets no note', (_n, config) => {
    expect(render(config)).not.toContain(NOTHING);
  });
  it.each([
    ['tile', { type: 'tile', entity: 'light.a' }],
    ['entities', { type: 'entities', entities: ['light.a'] }],
    ['unprofiled custom card', { type: 'custom:button-card', entity: 'light.a' }],
    ['profiled custom card', { type: 'custom:mushroom-entity-card', entity: 'light.a' }],
  ])('%s keeps its preset bar', (_n, config) => {
    expect(render(config)).toContain('preset-bar');
  });
  it('unprofiled custom cards keep every module and their own notice', () => {
    const t = render({ type: 'custom:button-card', entity: 'light.a' });
    expect(t).toContain('cms-background-module');
    expect(t).toContain("doesn't know this custom card yet");
  });
  it('is decided from the capabilities: only the empty card has no modules', () => {
    const none = (k: string) => {
      const c = capsFor(k);
      return !c.isContainer && !c.isEntities && Object.values(c.modules).every((on) => !on);
    };
    const keys = [
      ...MUSHROOM_PROFILES.map((p) => p.key),
      ...BUBBLE_PROFILES.map((p) => p.key),
      ...Object.values(capsModule).filter((v): v is Set<string> => v instanceof Set).flatMap((s) => [...s]),
    ];
    expect([...new Set(keys.filter(none))]).toEqual(['custom:mushroom-empty-card']);
  });
});

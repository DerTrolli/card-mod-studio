/**
 * A stack child whose style the Studio keeps whole (a top-level {% … %})
 * gets the same specific sentence as a top-level card. Driven through the
 * real child section's rendered body.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { CardModCardConfig } from '../src/types/index.js';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

type Child = { childConfig?: CardModCardConfig; willUpdate(c: Map<string, unknown>): void; _renderBody(): unknown };
let Child: new () => Child;
beforeAll(async () => {
  await import('../src/editor/cms-child-card-section.js');
  Child = registry.get('cms-child-card-section') as new () => Child;
});

const BANNER = 'This style uses template statements ({% … %}), so the Studio keeps all of it as written in';
const body = (style: string) => {
  const c = new Child();
  c.childConfig = { type: 'tile', entity: 'light.a', card_mod: { style } } as unknown as CardModCardConfig;
  c.willUpdate(new Map([['childConfig', undefined]]));
  return templateText(c._renderBody());
};

describe('stack child section', () => {
  it('a verbatim child gets the specific sentence', () => {
    const t = body('{% if a %}\nha-card {\n  background: #ff0000;\n}\n{% endif %}');
    expect(t).toContain(BANNER);
    expect(t).toContain('the modules stay off.');
  });
  it('a plain child shows no such note', () => {
    expect(body('ha-card {\n  background: #ff0000;\n}')).not.toContain(BANNER);
  });
});

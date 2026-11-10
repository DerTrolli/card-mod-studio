/**
 * Visual Filters: the slider is a duration in milliseconds (larger = slower),
 * so it is named "Transition duration" with a hint, like Animation's "Duration".
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { DEFAULT_FILTER } from '../src/parser/state-mapper.js';
import type { FilterModuleState } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

type El = { state: FilterModuleState; stateAware: boolean; cardEntity: string; _open: boolean; _renderBody(): unknown };
let Mod: new () => El;
beforeAll(async () => {
  (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
    constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
  await import('../src/modules/module-filter.js');
  Mod = registry.get('cms-filter-module') as new () => El;
});

describe('Visual Filters transition slider', () => {
  it('is a duration with a "lower is faster" hint, not a speed', () => {
    const el = new Mod();
    el.state = { ...DEFAULT_FILTER, enabled: true };
    el.stateAware = false;
    el.cardEntity = '';
    el._open = true;
    const text = templateText(el._renderBody());
    expect(text).toContain('Transition duration');
    expect(text).toContain('Milliseconds — lower is faster.');
    expect(text).not.toContain('Transition speed');
  });
});

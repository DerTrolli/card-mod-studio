/**
 * Animation: the slider's value is seconds per cycle, so it is called
 * "Duration" (not "Speed") and says which way is faster.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { DEFAULT_ANIMATION } from '../src/parser/state-mapper.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

type El = { state: unknown; _renderBody(): unknown };
let Mod: new () => El;
beforeAll(async () => {
  (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
    constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
  await import('../src/modules/module-animation.js');
  Mod = registry.get('cms-animation-module') as new () => El;
});

describe('Animation duration control', () => {
  it('is labelled Duration everywhere and explains the direction', () => {
    const el = new Mod();
    el.state = { ...DEFAULT_ANIMATION, enabled: true, preset: 'pulse' };
    const t = templateText(el._renderBody());
    expect(t).toContain('<span class="control-label">Duration</span>');
    expect(t).toContain('label="Duration"');
    expect(t).toContain('aria-label="Duration"');
    expect(t).toContain('Seconds per cycle — lower is faster.');
    expect(t).not.toContain('Speed');
  });
});

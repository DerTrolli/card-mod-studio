/**
 * The Animation module's preset list: a preset in `hiddenPresets` is left out,
 * except the one already stored on the card (an existing style stays visible
 * and is not rewritten).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import type { AnimationModuleState } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

type Anim = { state: AnimationModuleState; hiddenPresets: string[]; _renderBody(): unknown };
let Anim: new () => Anim;
beforeAll(async () => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
  await import('../src/modules/module-animation.js');
  Anim = registry.get('cms-animation-module') as typeof Anim;
});

function options(preset: string, hidden: string[]): string {
  const m = new Anim();
  m.state = { ...m.state, enabled: true, preset: preset as AnimationModuleState['preset'] };
  m.hiddenPresets = hidden;
  return templateText(m._renderBody());
}

describe('Animation preset list with hiddenPresets', () => {
  it('a stored Spin stays listed although Spin is hidden', () => {
    expect(options('spin', ['spin'])).toContain('Spin (360° rotation)');
  });

  it('with Pulse stored, the hidden Spin is absent and the others remain', () => {
    const text = options('pulse', ['spin']);
    expect(text).not.toContain('Spin (360° rotation)');
    expect(text).toContain('Pulse (gentle scale)');
    expect(text).toContain('Shake (horizontal)');
  });
});

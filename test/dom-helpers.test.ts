/**
 * Unit tests for the environment probes in dom-helpers.ts.
 *
 * The Vitest environment here is plain Node (no jsdom), so `customElements`
 * doesn't exist globally by default — we stub a minimal registry ourselves
 * rather than pull in a DOM-emulation dependency for two probe functions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isCardModInstalled, isUixInstalled } from '../src/utils/dom-helpers.js';

class FakeCustomElementRegistry {
  private registry = new Map<string, CustomElementConstructor>();
  define(name: string, ctor: CustomElementConstructor) {
    this.registry.set(name, ctor);
  }
  get(name: string) {
    return this.registry.get(name);
  }
}

const FAKE_ELEMENT = class {} as unknown as CustomElementConstructor;

describe('dom-helpers', () => {
  const originalRegistry = globalThis.customElements;

  beforeEach(() => {
    (globalThis as { customElements: CustomElementRegistry }).customElements =
      new FakeCustomElementRegistry() as unknown as CustomElementRegistry;
  });

  afterEach(() => {
    (globalThis as { customElements: CustomElementRegistry }).customElements = originalRegistry;
  });

  describe('isCardModInstalled', () => {
    it('returns false when card-mod is not registered', () => {
      expect(isCardModInstalled()).toBe(false);
    });

    it('returns true once card-mod registers its element', () => {
      customElements.define('card-mod', FAKE_ELEMENT);
      expect(isCardModInstalled()).toBe(true);
    });

    it('is unaffected by UIX registering uix-node', () => {
      customElements.define('uix-node', FAKE_ELEMENT);
      expect(isCardModInstalled()).toBe(false);
    });
  });

  describe('isUixInstalled', () => {
    it('returns false when uix-node is not registered', () => {
      expect(isUixInstalled()).toBe(false);
    });

    it('returns true once UIX registers uix-node', () => {
      customElements.define('uix-node', FAKE_ELEMENT);
      expect(isUixInstalled()).toBe(true);
    });

    it('is unaffected by card-mod registering card-mod', () => {
      customElements.define('card-mod', FAKE_ELEMENT);
      expect(isUixInstalled()).toBe(false);
    });

    it('is not tricked by mod-card alone (both card-mod and UIX ship a mod-card element)', () => {
      customElements.define('mod-card', FAKE_ELEMENT);
      expect(isUixInstalled()).toBe(false);
      expect(isCardModInstalled()).toBe(false);
    });
  });
});

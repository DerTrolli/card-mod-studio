/**
 * Stack child styling (v0.8.0): a container's `cards: []` children each run
 * the same open→save pipeline as a top-level card (studio-state.ts), and
 * the updated child config is folded back into the stack — mirroring what
 * cms-child-card-section emits and cms-panel._onChildConfigChanged applies.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { buildMergedStudioState, applyStudioState } from '../src/editor/studio-state.js';
import { DEFAULT_ACCENT_COLOR } from '../src/parser/state-mapper.js';
import type { CardModCardConfig } from '../src/types/index.js';

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
const originalRegistry = globalThis.customElements;

function installCardMod() {
  const registry = new FakeCustomElementRegistry();
  registry.define('card-mod', FAKE_ELEMENT);
  (globalThis as { customElements: CustomElementRegistry }).customElements =
    registry as unknown as CustomElementRegistry;
}

afterEach(() => {
  (globalThis as { customElements: CustomElementRegistry }).customElements = originalRegistry;
});

const STACK: CardModCardConfig = {
  type: 'vertical-stack',
  cards: [
    { type: 'tile', entity: 'light.kitchen' },
    { type: 'gauge', entity: 'sensor.temp', needle: true },
  ],
} as unknown as CardModCardConfig;

function childAt(config: CardModCardConfig, i: number): CardModCardConfig {
  return (config as unknown as { cards: CardModCardConfig[] }).cards[i];
}

/** Mirrors cms-panel._onChildConfigChanged's fold-back. */
function foldChild(stack: CardModCardConfig, index: number, child: CardModCardConfig): CardModCardConfig {
  const cards = (stack as unknown as { cards: CardModCardConfig[] }).cards;
  return {
    ...(stack as unknown as object),
    cards: cards.map((c, i) => (i === index ? child : c)),
  } as unknown as CardModCardConfig;
}

describe('stack child styling pipeline', () => {
  it('styles a tile child through the same pipeline as a top-level tile (incl. the !important companion)', () => {
    installCardMod();
    const child = childAt(STACK, 0);
    const state = buildMergedStudioState(child);
    state.accentColor = { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'plain', color: '#ff0000' };
    const newChild = applyStudioState(state, child);

    expect(newChild.card_mod?.style).toContain('--tile-color: #ff0000 !important;');
    const stack2 = foldChild(STACK, 0, newChild);
    expect(childAt(stack2, 0).card_mod?.style).toContain('--accent-color');
    // Sibling untouched.
    expect(childAt(stack2, 1)).toBe(childAt(STACK, 1));
  });

  it('a gauge child gets the gauge treatment, including the needle flag from its own config', () => {
    installCardMod();
    const child = childAt(STACK, 1); // gauge with needle: true
    const state = buildMergedStudioState(child);
    state.accentColor = { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'plain', color: '#ff0000' };
    const newChild = applyStudioState(state, child);

    expect(newChild.card_mod?.style).toContain('--gauge-color: #ff0000 !important;');
    // needle: true on the CHILD config must thread through applyStudioState.
    expect(newChild.card_mod?.style).toContain('--primary-text-color: #ff0000 !important;');
  });

  it('round-trips: reopening a styled child rebuilds the same state with no Advanced leftovers', () => {
    installCardMod();
    const child = childAt(STACK, 0);
    const state = buildMergedStudioState(child);
    state.accentColor = { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'plain', color: '#ff0000' };
    const newChild = applyStudioState(state, child);

    const reopened = buildMergedStudioState(newChild);
    expect(reopened.accentColor.enabled).toBe(true);
    expect(reopened.accentColor.color).toBe('#ff0000');
    expect(reopened.advanced.rawCss).toBe('');
    // Second save is byte-stable.
    expect(applyStudioState(reopened, newChild)).toEqual(newChild);
  });

  it('a hand-styled child\'s unrecognised CSS survives the pipeline in Advanced CSS', () => {
    installCardMod();
    const child: CardModCardConfig = {
      type: 'markdown',
      content: 'hi',
      card_mod: { style: 'ha-card { text-transform: uppercase; }' },
    } as unknown as CardModCardConfig;
    const state = buildMergedStudioState(child);
    expect(state.advanced.rawCss).toContain('text-transform: uppercase');
    const resaved = applyStudioState(state, child);
    expect(resaved.card_mod?.style).toContain('text-transform: uppercase');
  });
});

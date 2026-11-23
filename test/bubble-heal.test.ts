/**
 * The Bubble Card repair (src/utils/bubble-heal.ts): a style engine's element
 * that landed in a Bubble card's light DOM is moved into its shadow root;
 * nothing else is touched. The DOM here is a minimal stand-in (children,
 * shadowRoot, appendChild) — the live behaviour is checked on the rigs by
 * tools/sandbox/harness/bubble_heal_check.mjs.
 */
import { describe, it, expect } from 'vitest';
import { healBubbleCards } from '../src/utils/bubble-heal.js';

class FakeNode {
  children: FakeNode[] = [];
  shadowRoot: FakeNode | null = null;
  parent: FakeNode | null = null;
  constructor(public tagName: string) {}
  get localName() { return this.tagName.toLowerCase(); }
  appendChild(c: FakeNode) {
    if (c.parent) c.parent.children = c.parent.children.filter((x) => x !== c);
    c.parent = this;
    this.children.push(c);
    return c;
  }
  withShadow() { this.shadowRoot = new FakeNode('#SHADOW'); return this; }
}
const el = (tag: string, ...kids: FakeNode[]) => { const n = new FakeNode(tag); kids.forEach((k) => n.appendChild(k)); return n; };
const heal = (root: FakeNode) => healBubbleCards(root as unknown as ParentNode);

describe('healBubbleCards', () => {
  it('moves a card-mod element from a Bubble card\'s light DOM into its shadow root', () => {
    const cm = el('CARD-MOD');
    const bubble = el('BUBBLE-CARD', cm).withShadow();
    bubble.shadowRoot!.appendChild(el('HA-CARD'));
    const root = el('DIV', el('HUI-CARD', bubble));
    expect(heal(root)).toBe(1);
    expect(bubble.children).toEqual([]);
    expect(bubble.shadowRoot!.children.map((c) => c.tagName)).toEqual(['HA-CARD', 'CARD-MOD']);
  });

  it('moves UIX\'s element the same way', () => {
    const bubble = el('BUBBLE-CARD', el('UIX-NODE')).withShadow();
    expect(heal(el('DIV', bubble))).toBe(1);
    expect(bubble.shadowRoot!.children.map((c) => c.tagName)).toEqual(['UIX-NODE']);
  });

  it('finds Bubble cards inside other components\' shadow roots', () => {
    const bubble = el('BUBBLE-CARD', el('CARD-MOD')).withShadow();
    const view = el('HUI-MASONRY-VIEW').withShadow();
    view.shadowRoot!.appendChild(el('DIV', el('HUI-CARD', bubble)));
    expect(heal(el('HOME-ASSISTANT', view))).toBe(1);
  });

  it('leaves a correctly attached card alone (nothing in its light DOM)', () => {
    const bubble = el('BUBBLE-CARD').withShadow();
    bubble.shadowRoot!.appendChild(el('CARD-MOD'));
    expect(heal(el('DIV', bubble))).toBe(0);
    expect(bubble.shadowRoot!.children.length).toBe(1);
  });

  it('leaves other light-DOM children and other card types alone', () => {
    const bubble = el('BUBBLE-CARD', el('SPAN')).withShadow();
    const tile = el('HUI-TILE-CARD', el('CARD-MOD')).withShadow();
    expect(heal(el('DIV', bubble, tile))).toBe(0);
    expect(bubble.children.map((c) => c.tagName)).toEqual(['SPAN']);
    expect(tile.children.map((c) => c.tagName)).toEqual(['CARD-MOD']);
  });

  it('does nothing before the card has a shadow root', () => {
    const bubble = el('BUBBLE-CARD', el('CARD-MOD'));
    expect(heal(el('DIV', bubble))).toBe(0);
    expect(bubble.children.length).toBe(1);
  });

  it('never touches the card editor dialog (its preview is the editor\'s own)', () => {
    const preview = el('BUBBLE-CARD', el('CARD-MOD')).withShadow();
    const dialog = el('HUI-DIALOG-EDIT-CARD').withShadow();
    dialog.shadowRoot!.appendChild(preview);
    expect(heal(el('HOME-ASSISTANT', dialog))).toBe(0);
    expect(preview.children.length).toBe(1);
  });

  it('is idempotent', () => {
    const bubble = el('BUBBLE-CARD', el('CARD-MOD')).withShadow();
    const root = el('DIV', bubble);
    expect(heal(root)).toBe(1);
    expect(heal(root)).toBe(0);
  });
});

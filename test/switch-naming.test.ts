/**
 * nameSwitch: the name goes on the inner input[role=switch] when the switch's
 * shadow root has one (no duplicate static text), and stays as
 * screen-reader-only slotted text when it does not (older Home Assistant).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

let nameSwitch: (sw: HTMLElement) => void;
let nameSwitches: (root: ParentNode) => void;
beforeAll(async () => {
  ({ nameSwitch, nameSwitches } = await import('../src/modules/module-base.js'));
});

class FakeNode {
  attrs: Record<string, string> = {};
  className = '';
  textContent = '';
  removed = false;
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  remove() { this.removed = true; }
}

/** A stand-in switch. `inner` = it has an input[role=switch] in its shadow root. */
function fakeSwitch(opts: { inner: boolean; label?: string; lateInner?: boolean; hasUpdate?: boolean }) {
  const input = new FakeNode();
  let built = opts.inner;
  const children: FakeNode[] = [];
  const sw = {
    localName: 'ha-switch',
    getAttribute: (k: string) => (k === 'aria-label' ? (opts.label ?? 'Enable Font') : null),
    get shadowRoot() {
      return built ? { querySelector: (s: string) => (s === '[role="switch"]' ? input : null) } : null;
    },
    querySelector: () => children.find((c) => !c.removed) ?? null,
    appendChild: (c: FakeNode) => { children.push(c); },
    ownerDocument: { createElement: () => new FakeNode() },
    ...(opts.hasUpdate
      ? { updateComplete: Promise.resolve().then(() => { if (opts.lateInner) built = true; }) }
      : {}),
  };
  return { sw: sw as unknown as HTMLElement, input, children };
}

describe('nameSwitch', () => {
  it('puts the name on the inner switch input and adds no text node', () => {
    const { sw, input, children } = fakeSwitch({ inner: true });
    nameSwitch(sw);
    expect(input.attrs['aria-label']).toBe('Enable Font');
    expect(children).toHaveLength(0);
  });

  it('waits for the switch to render, then names the inner input', async () => {
    const { sw, input, children } = fakeSwitch({ inner: false, lateInner: true, hasUpdate: true });
    nameSwitch(sw);
    await new Promise((r) => setTimeout(r, 0));
    expect(input.attrs['aria-label']).toBe('Enable Font');
    expect(children).toHaveLength(0);
  });

  it('keeps the name as screen-reader-only text when there is no inner input', async () => {
    const { sw, children } = fakeSwitch({ inner: false });
    nameSwitch(sw);
    expect(children).toHaveLength(1);
    expect(children[0].textContent).toBe('Enable Font');
    expect(children[0].className).toBe('sr-only');
    const rendered = fakeSwitch({ inner: false, hasUpdate: true });
    nameSwitch(rendered.sw);
    await new Promise((r) => setTimeout(r, 0));
    expect(rendered.children).toHaveLength(1);
    expect(rendered.children[0].textContent).toBe('Enable Font');
  });

  it('does not add the text twice on a repeat call', () => {
    const { sw, children } = fakeSwitch({ inner: false });
    nameSwitch(sw);
    nameSwitch(sw);
    expect(children).toHaveLength(1);
  });

  it('removes the fallback text once the inner input shows up', () => {
    const f = fakeSwitch({ inner: false });
    nameSwitch(f.sw);
    expect(f.children[0].removed).toBe(false);
    // the switch finishes building its shadow root
    Object.defineProperty(f.sw, 'shadowRoot', {
      value: { querySelector: () => f.input },
    });
    nameSwitch(f.sw);
    expect(f.input.attrs['aria-label']).toBe('Enable Font');
    expect(f.children[0].removed).toBe(true);
  });

  it('leaves a switch with no aria-label alone', () => {
    const { sw, children } = fakeSwitch({ inner: false, label: '' });
    nameSwitch(sw);
    expect(children).toHaveLength(0);
  });

  it('nameSwitches names every ha-switch[aria-label] under a root', () => {
    const a = fakeSwitch({ inner: true });
    const b = fakeSwitch({ inner: true, label: 'Grayscale' });
    const root = {
      querySelectorAll: (sel: string) => {
        expect(sel).toBe('ha-switch[aria-label]');
        return [a.sw, b.sw];
      },
    };
    nameSwitches(root as unknown as ParentNode);
    expect(a.input.attrs['aria-label']).toBe('Enable Font');
    expect(b.input.attrs['aria-label']).toBe('Grayscale');
  });

  it('nameSwitches skips a switch that already has its name, and redoes a changed or new one', () => {
    let reads = 0;
    const f = fakeSwitch({ inner: true });
    const sw = f.sw as unknown as { shadowRoot: unknown };
    const real = Object.getOwnPropertyDescriptor(sw, 'shadowRoot')!.get!;
    Object.defineProperty(sw, 'shadowRoot', { get: () => { reads++; return real.call(sw); } });
    let list = [f.sw];
    const root = { querySelectorAll: () => list } as unknown as ParentNode;
    nameSwitches(root);
    const first = reads;
    expect(first).toBeGreaterThan(0);
    nameSwitches(root);
    nameSwitches(root);
    expect(reads).toBe(first); // not re-queried
    // a re-created switch is a new element: named
    const g = fakeSwitch({ inner: true, label: 'Other' });
    list = [f.sw, g.sw];
    nameSwitches(root);
    expect(g.input.attrs['aria-label']).toBe('Other');
    expect(reads).toBe(first);
  });

  it('nameSwitches names a switch again when its label changed', () => {
    let label = 'First';
    const f = fakeSwitch({ inner: true });
    (f.sw as unknown as { getAttribute: () => string }).getAttribute = () => label;
    const root = { querySelectorAll: () => [f.sw] } as unknown as ParentNode;
    nameSwitches(root);
    expect(f.input.attrs['aria-label']).toBe('First');
    label = 'Second';
    nameSwitches(root);
    expect(f.input.attrs['aria-label']).toBe('Second');
  });

  it('the fallback text is only written when it differs', () => {
    const f = fakeSwitch({ inner: false });
    nameSwitch(f.sw);
    let writes = 0;
    const span = f.children[0];
    let text = span.textContent;
    Object.defineProperty(span, 'textContent', { get: () => text, set: (v: string) => { writes++; text = v; } });
    nameSwitch(f.sw);
    nameSwitch(f.sw);
    expect(writes).toBe(0);
  });
});

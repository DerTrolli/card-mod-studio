/**
 * markSliderPadding / prepareSliders: the module styles give the slider's
 * `slider` part a negative top margin only as large as the padding the part
 * really has (Home Assistant 2026.11 pads it, 2026.2 does not, 2025.9 has no
 * such part), so the track sits on the row's centre on every version.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

let markSliderPadding: (sl: HTMLElement) => void;
let prepareSliders: (root: ParentNode) => void;
let moduleStyles: unknown[];
beforeAll(async () => {
  ({ markSliderPadding, prepareSliders, moduleStyles } = await import('../src/modules/module-base.js'));
});

const VAR = '--cms-slider-pad';

/** A stand-in slider. `pad` = padding-block-start of its `slider` part
 *  (undefined: no such part, as on 2025.9). */
function fakeSlider(opts: { pad?: string; late?: boolean; partLate?: boolean }) {
  const props = new Map<string, string>();
  let built = !opts.late;
  let rendered = !opts.partLate;
  const part = { id: 'slider' };
  const sl = {
    localName: 'ha-slider',
    style: {
      setProperty: (k: string, v: string) => { props.set(k, v); },
      removeProperty: (k: string) => { props.delete(k); },
    },
    get shadowRoot() {
      return built
        ? { querySelector: (s: string) => (s === '[part~="slider"]' && rendered && opts.pad !== undefined ? part : null) }
        : null;
    },
    ownerDocument: {
      defaultView: {
        getComputedStyle: (el: unknown) => ({ paddingBlockStart: el === part ? opts.pad : '' }),
      },
    },
    ...(opts.partLate ? { updateComplete: Promise.resolve().then(() => { rendered = true; }) } : {}),
    ...(opts.late
      ? { updateComplete: Promise.resolve().then(() => { built = true; }) }
      : {}),
  };
  return { sl: sl as unknown as HTMLElement, props };
}

describe('markSliderPadding', () => {
  it('publishes the padding of the slider part (2026.11)', () => {
    const { sl, props } = fakeSlider({ pad: '14px' });
    markSliderPadding(sl);
    expect(props.get(VAR)).toBe('14px');
  });

  it('publishes nothing where the part has no padding (2026.2)', () => {
    const { sl, props } = fakeSlider({ pad: '0px' });
    markSliderPadding(sl);
    expect(props.has(VAR)).toBe(false);
  });

  it('publishes nothing where there is no slider part (2025.9)', () => {
    const { sl, props } = fakeSlider({});
    markSliderPadding(sl);
    expect(props.has(VAR)).toBe(false);
  });

  it('waits for the first render of a slider that has no shadow root yet', async () => {
    const { sl, props } = fakeSlider({ pad: '14px', late: true });
    markSliderPadding(sl);
    expect(props.has(VAR)).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(props.get(VAR)).toBe('14px');
  });

  it('waits for the part when the shadow root exists but is not filled yet', async () => {
    const { sl, props } = fakeSlider({ pad: '14px', partLate: true });
    markSliderPadding(sl);
    expect(props.has(VAR)).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(props.get(VAR)).toBe('14px');
  });

  it('looks at a slider only once', () => {
    const { sl, props } = fakeSlider({ pad: '14px' });
    markSliderPadding(sl);
    props.clear();
    markSliderPadding(sl);
    expect(props.has(VAR)).toBe(false);
  });

  it('prepareSliders handles every ha-slider under a root', () => {
    const a = fakeSlider({ pad: '14px' });
    const b = fakeSlider({ pad: '0px' });
    const root = {
      querySelectorAll: (sel: string) => {
        expect(sel).toBe('ha-slider');
        return [a.sl, b.sl];
      },
    };
    prepareSliders(root as unknown as ParentNode);
    expect(a.props.get(VAR)).toBe('14px');
    expect(b.props.has(VAR)).toBe(false);
  });
});

describe('module styles for the slider part', () => {
  it('take the top margin from the published padding, with no fixed offset', () => {
    const css = moduleStyles.map((s) => (typeof s === "string" ? s : (s as { cssText: string }).cssText)).join("\n");
    expect(css).toContain('margin-block-start: calc(-1 * var(--cms-slider-pad, 0px))');
    expect(css).not.toMatch(/margin-block-start:\s*-14px/);
  });
});

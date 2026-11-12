/**
 * nameSlider / prepareSliders: a slider built on a native range input (Home
 * Assistant 2025.9) is named by setting its `ariaLabel` property, which that
 * slider feeds to the input (the input otherwise announces the current
 * value as its name). Sliders without such an input are left alone.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

let nameSlider: (sl: HTMLElement) => void;
let prepareSliders: (root: ParentNode) => void;
beforeAll(async () => {
  ({ nameSlider, prepareSliders } = await import('../src/modules/module-base.js'));
});

interface FakeOpts {
  /** 'range': an input[type=range] in the shadow root (2025.9); 'part': a slider part (2026.x). */
  kind: 'range' | 'part';
  attrs?: Record<string, string>;
  late?: boolean;
}

/** A stand-in slider; `ariaLabel` is recorded like a property set on the host. */
function fakeSlider(opts: FakeOpts) {
  let built = !opts.late;
  const sl = {
    localName: 'ha-slider',
    ariaLabel: null as string | null,
    sets: 0,
    getAttribute: (k: string) => (opts.attrs ?? { label: 'Text size' })[k] ?? null,
    get shadowRoot() {
      return built
        ? {
            querySelector: (s: string) => {
              if (s === 'input[type="range"]') return opts.kind === 'range' ? {} : null;
              if (s === '[part~="slider"]') return opts.kind === 'part' ? {} : null;
              return null;
            },
          }
        : null;
    },
    ...(opts.late ? { updateComplete: Promise.resolve().then(() => { built = true; }) } : {}),
  };
  // count writes to ariaLabel
  let value: string | null = null;
  Object.defineProperty(sl, 'ariaLabel', {
    get: () => value,
    set: (v: string | null) => { value = v; sl.sets++; },
  });
  return sl as unknown as HTMLElement & { ariaLabel: string | null; sets: number };
}

describe('nameSlider', () => {
  it('names a range-input slider from its label (the host loses its aria-label there)', () => {
    const sl = fakeSlider({ kind: 'range' });
    nameSlider(sl);
    expect(sl.ariaLabel).toBe('Text size');
  });

  it('prefers the aria-label over the label', () => {
    const sl = fakeSlider({ kind: 'range', attrs: { 'aria-label': 'Brightness', label: 'Other' } });
    nameSlider(sl);
    expect(sl.ariaLabel).toBe('Brightness');
  });

  it('waits for a slider that has not rendered yet', async () => {
    const sl = fakeSlider({ kind: 'range', late: true });
    nameSlider(sl);
    expect(sl.ariaLabel).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(sl.ariaLabel).toBe('Text size');
  });

  it('leaves a slider with a slider part alone (it names itself from label)', () => {
    const sl = fakeSlider({ kind: 'part' });
    nameSlider(sl);
    expect(sl.sets).toBe(0);
  });

  it('does nothing without a name', () => {
    const sl = fakeSlider({ kind: 'range', attrs: {} });
    nameSlider(sl);
    expect(sl.sets).toBe(0);
  });
});

describe('prepareSliders', () => {
  it('names each slider once per label', () => {
    const a = fakeSlider({ kind: 'range' });
    const b = fakeSlider({ kind: 'range', attrs: { label: 'Blur' } });
    const root = { querySelectorAll: (sel: string) => { expect(sel).toBe('ha-slider'); return [a, b]; } };
    prepareSliders(root as unknown as ParentNode);
    prepareSliders(root as unknown as ParentNode);
    expect(a.ariaLabel).toBe('Text size');
    expect(b.ariaLabel).toBe('Blur');
    expect(a.sets).toBe(1);
  });
});

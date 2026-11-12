/**
 * Two size fixes, checked on the stylesheet text the components ship:
 * the fade-point move buttons reach 40px on a coarse pointer without
 * touching the mouse layout, and the palette manager's "Reset" button is
 * not held to the shared 24 x 24 round icon-button box.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { CSSResultGroup } from 'lit';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

const text = (s: CSSResultGroup): string =>
  Array.isArray(s) ? s.map(text).join('\n') : typeof s === 'string' ? s : (s as { cssText: string }).cssText;

/** The body of the first rule for `selector` in `css` (from the selector to its `}`). */
const rule = (css: string, selector: string): string => {
  const at = css.lastIndexOf(selector); // the component's own rule comes after moduleStyles'
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

let threshold = '';
let palette = '';
beforeAll(async () => {
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => null, setItem: () => {} };
  (globalThis as { window?: unknown }).window = { dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} };
  const [{ ThresholdModule }, { CmsPaletteManager }] = await Promise.all([
    import('../src/modules/module-threshold.js'),
    import('../src/editor/cms-palette-manager.js'),
  ]);
  threshold = text((ThresholdModule as unknown as { styles: CSSResultGroup }).styles);
  palette = text((CmsPaletteManager as unknown as { styles: CSSResultGroup }).styles);
});

describe('fade-point move buttons', () => {
  it('are 40 x 40 on a coarse pointer, side by side', () => {
    const at = threshold.lastIndexOf('@media (pointer: coarse)');
    expect(at).toBeGreaterThan(0);
    const coarse = threshold.slice(at);
    expect(rule(coarse, '.move-btn {')).toMatch(/min-height: 40px/);
    expect(rule(coarse, '.move-btn {')).toMatch(/min-width: 40px/);
    expect(rule(coarse, '.stop-move {')).toMatch(/flex-direction: row/);
  });
  it('keep the stacked mouse layout', () => {
    const rest = threshold.slice(0, threshold.lastIndexOf('@media (pointer: coarse)'));
    expect(rule(rest, '.stop-move {')).toMatch(/flex-direction: column/);
    expect(rule(rest, '.move-btn {')).not.toMatch(/40px/);
  });
});

describe('palette manager Reset button', () => {
  it('sizes itself to the word instead of the shared 24px round box', () => {
    // the palette's own rule, not the coarse-pointer one that follows it
    const own = /\.reset-btn \{[^}]*\}/g;
    const rules = palette.match(own) ?? [];
    const r = rules.find((x) => x.includes('padding: 2px 10px')) ?? '';
    expect(r).toMatch(/width: auto/);
    expect(r).toMatch(/height: auto/);
    expect(r).toMatch(/white-space: nowrap/);
  });
});

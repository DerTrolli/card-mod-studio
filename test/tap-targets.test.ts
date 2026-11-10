/**
 * Touch tap targets: on a coarse pointer the small controls reach a 40px hit
 * area (a bigger box, or an invisible ::before / ::after extension that leaves
 * the look alone); with a fine pointer the stylesheets are exactly what they
 * were. Checked on the stylesheet text the components ship.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { CSSResultGroup } from 'lit';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import { moduleStyles } from '../src/modules/module-base.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

const text = (s: CSSResultGroup): string =>
  Array.isArray(s) ? s.map(text).join('\n') : typeof s === 'string' ? s : (s as { cssText: string }).cssText;

/** The `@media (pointer: coarse) { ... }` blocks, and the sheet without them. */
function split(css: string): { coarse: string; rest: string } {
  let coarse = '';
  let rest = '';
  let i = 0;
  const key = '@media (pointer: coarse)';
  while (i < css.length) {
    const at = css.indexOf(key, i);
    if (at < 0) { rest += css.slice(i); break; }
    rest += css.slice(i, at);
    let depth = 0;
    let j = css.indexOf('{', at);
    const start = j;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}' && --depth === 0) break;
    }
    coarse += css.slice(start + 1, j) + '\n';
    i = j + 1;
  }
  return { coarse, rest };
}

const sheets: Record<string, string> = {};
beforeAll(async () => {
  const [{ ThresholdModule }, { CmsColorPicker }, { CmsTabButton }] = await Promise.all([
    import('../src/modules/module-threshold.js'),
    import('../src/components/cms-color-picker.js'),
    import('../src/editor/cms-tab.js'),
  ]);
  sheets.module = text(moduleStyles);
  sheets.threshold = text((ThresholdModule as unknown as { styles: CSSResultGroup }).styles);
  sheets.picker = text((CmsColorPicker as unknown as { styles: CSSResultGroup }).styles);
  sheets.tab = text((CmsTabButton as unknown as { styles: CSSResultGroup }).styles);
});

const rule = (css: string, selector: string): string => {
  const at = css.indexOf(selector);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('coarse pointer: 40px hit areas', () => {
  it('fields and buttons with a box are at least 40px high', () => {
    const m = split(sheets.module).coarse;
    expect(rule(m, "input[type='number']")).toContain('min-height: 40px');
    expect(rule(m, '.btn-danger')).toMatch(/min-height: 40px/);
    expect(rule(m, '.btn-add')).toContain('min-height: 40px');
    expect(rule(split(sheets.tab).coarse, 'button')).toContain('min-height: 40px');
    const p = split(sheets.picker).coarse;
    expect(rule(p, '.custom input[type="text"]')).toContain('height: 40px');
    expect(rule(p, '.custom input[type="color"]')).toMatch(/height: 40px/);
  });

  it('small round and inline controls take an invisible extension that reaches 40px', () => {
    const m = split(sheets.module).coarse;
    expect(rule(m, '.reset-btn::after')).toMatch(/inset: -9px/); // 24 + 2*9 = 42
    const p = split(sheets.picker).coarse;
    expect(rule(p, '.preset::after')).toMatch(/inset: -7px/); // 26 + 14
    expect(rule(p, '.swatch-trigger::after')).toMatch(/inset: -7px -3px/); // 34x26 -> 40x40
    expect(rule(p, '.presets,')).toMatch(/gap: 14px/); // 26 + 14 = 40px pitch, so areas don't overlap
    const t = split(sheets.threshold).coarse;
    expect(rule(t, '.property-check::before')).toMatch(/inset: -6px/); // 28 + 12
    expect(rule(t, '.property-checks')).toMatch(/row-gap: 12px/);
    expect(rule(t, '.rule > button')).toMatch(/min-height: 40px/);
  });

  it('the enable switch asks HA for a 40px touch area', () => {
    expect(rule(split(sheets.module).coarse, 'ha-switch')).toContain('--ha-switch-min-touch-size: 40px');
  });

  it('a fine pointer sees none of it: the rest of each sheet has no 40px / extension rules', () => {
    for (const name of ['module', 'threshold', 'picker', 'tab']) {
      const { rest } = split(sheets[name]);
      expect(rest, name).not.toMatch(/::after\s*\{[^}]*inset/);
      expect(rest, name).not.toContain('--ha-switch-min-touch-size');
      expect(rest, name).not.toMatch(/min-height:\s*40px/);
    }
    // the exact desktop sizes that were measured before
    expect(rule(split(sheets.picker).rest, '.preset {')).toMatch(/width: 26px;\s*height: 26px/);
    expect(rule(split(sheets.picker).rest, '.swatch-trigger {')).toMatch(/width: 34px;\s*height: 26px/);
    expect(rule(split(sheets.module).rest, 'select,')).toContain('min-height: 32px');
  });
});

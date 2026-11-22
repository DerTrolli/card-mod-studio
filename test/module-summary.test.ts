/**
 * v1.0 UI: the one-line summary under a closed module's title, the header
 * that shows it (as the button's description, not its name), and the
 * panel's tab list (arrow keys, Home, End).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FakeCustomElementRegistry, renderedText } from './v010-audit-helpers.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import {
  advancedSummary, animationSummary, backgroundSummary, borderSummary, conditionPhrase,
  filterSummary, fontSummary, thresholdSummary,
} from '../src/modules/module-summary.js';
import { renderModuleHeader } from '../src/modules/module-base.js';
import type { CardModCardConfig } from '../src/types/index.js';

const E = mapToStudioState(parseStyleValue(''));

describe('conditionPhrase', () => {
  it.each([
    [undefined, ''],
    [{ when: 'always' }, ''],
    [{ when: 'on' }, 'while ON'],
    [{ when: 'off' }, 'while OFF'],
    [{ when: 'custom', customEntity: 'switch.ac' }, 'while switch.ac is ON'],
    [{ when: 'custom' }, ''],
    [{ when: 'value', valueEntity: 'sensor.t', valueOperator: '>', valueThreshold: 25 }, 'when sensor.t > 25'],
    [{ when: 'value', valueEntity: 'climate.hall', valueText: 'heating', valueTextOperator: 'is' }, 'when climate.hall is “heating”'],
    [{ when: 'value', valueEntity: 'vacuum.robo', valueText: 'docked', valueTextOperator: 'is-not' }, 'when vacuum.robo is not “docked”'],
    [{ when: 'value', valueEntity: 'climate.hall', valueAttribute: 'hvac_action', valueText: 'heating', valueTextOperator: 'is' }, 'when climate.hall → hvac_action is “heating”'],
    // incomplete conditions write the unconditional form, so they say nothing
    [{ when: 'value', valueEntity: 'climate.hall', valueText: '', valueTextOperator: 'is' }, ''],
    [{ when: 'value' }, ''],
  ] as const)('%j → "%s"', (c, want) => {
    expect(conditionPhrase(c as never)).toBe(want);
  });
});

describe('module summaries', () => {
  it('Background: its colour(s), then the condition', () => {
    expect(backgroundSummary({ ...E.background, enabled: true, color1: 'red' })).toEqual([{ color: 'red' }]);
    expect(backgroundSummary({
      ...E.background, enabled: true, color1: 'red',
      condition: { when: 'value', valueEntity: 'climate.hall', valueText: 'heating', valueTextOperator: 'is' },
    })).toEqual([{ color: 'red' }, 'when climate.hall is “heating”']);
    expect(backgroundSummary({ ...E.background, enabled: true, type: 'gradient', color1: 'red', color2: 'blue', applyWhen: 'on' }))
      .toEqual([{ color: 'red' }, { color: 'blue' }, 'while ON']);
  });

  it('Threshold: rule colours (at most 8) or the fade as one bar, then the entity', () => {
    const rules = Array.from({ length: 10 }, (_, i) => ({ id: String(i), operator: '>' as const, value: i, color: `#00000${i}` }));
    const r = thresholdSummary({ ...E.threshold, enabled: true, entityId: 'sensor.t', rules });
    expect(r.filter((p) => typeof p === 'object')).toHaveLength(8);
    expect(r[r.length - 1]).toBe('sensor.t');
    expect(thresholdSummary({
      ...E.threshold, enabled: true, entityId: 'sensor.t', attribute: 'brightness', valueMode: 'gradient',
      colorStops: [{ id: 'b', value: 100, color: 'red' }, { id: 'a', value: 0, color: 'green' }],
    })).toEqual([{ gradient: ['green', 'red'] }, 'sensor.t → brightness']);
    expect(thresholdSummary({ ...E.threshold, enabled: true, rules: [] })).toEqual([]);
  });

  it('Animation: preset (short name), speed, then a text condition', () => {
    expect(animationSummary({
      ...E.animation, enabled: true, preset: 'pulse', speedS: 2, trigger: 'value',
      valueEntity: 'climate.hall', valueText: 'idle', valueTextOperator: 'is-not',
    })).toEqual(['Pulse', '2s', 'when climate.hall is not “idle”']);
  });

  it('Visual Filters: the values that differ from the default, with their own labels', () => {
    expect(filterSummary({ ...E.filter, enabled: true, brightness: 60, blur: 2, effectsWhen: { when: 'off' } }))
      .toEqual(['Brightness 60%', 'Blur 2px', 'while OFF']);
    expect(filterSummary({ ...E.filter, enabled: true })).toEqual([]);
  });

  it('Border: square corners or the radius, the width with its colour and condition', () => {
    expect(borderSummary({ ...E.border, enabled: true, radiusPx: 16, borderWidth: 2, borderColor: 'blue', widthWhen: { when: 'on' } }))
      .toEqual(['Border radius 16px', 'Border width 2px', { color: 'blue' }, 'while ON']);
    expect(borderSummary({ ...E.border, enabled: true, squareCorners: true })).toEqual(['Square corners']);
  });

  it('Font: only what is set; Number size where the card has one', () => {
    expect(fontSummary({ ...E.font, enabled: true, fontSize: 16, fontWeight: 'bold' })).toEqual(['16px', 'Bold']);
    expect(fontSummary({ ...E.font, enabled: false, numberSizeEnabled: true, numberSize: 40 }, true)).toEqual(['Number size 40px']);
    expect(fontSummary({ ...E.font, enabled: false, numberSizeEnabled: true, numberSize: 40 }, false)).toEqual([]);
  });

  it('Advanced CSS: its first line, cut at 80 characters', () => {
    expect(advancedSummary('')).toEqual([]);
    expect(advancedSummary('\n  ha-card { box-shadow: none; }\n.x {}')).toEqual([{ code: 'ha-card { box-shadow: none; }' }]);
    const long = `ha-card { --x: ${'a'.repeat(100)}; }`;
    expect((advancedSummary(long)[0] as { code: string }).code).toHaveLength(81);
  });
});

describe('the header shows the summary only while closed, as a description', () => {
  const header = (open: boolean) => renderedText(renderModuleHeader({
    icon: 'mdi:format-text', title: 'Font', open, onToggle: () => {}, summary: ['16px', { color: 'red' }],
    enable: { checked: true, onChange: () => {} },
  }));

  it('closed: the summary, hidden itself, named as the button\'s description', () => {
    const t = header(false);
    expect(t).toContain('aria-describedby="module-summary"');
    expect(t).toMatch(/<span class="module-summary" id="module-summary" aria-hidden="true">/);
    expect(t).toContain('<span class="sum-text">16px</span>');
    expect(t).toContain('class="sum-swatch" style="background:red"');
  });

  it('open: no summary, no description', () => {
    const t = header(true);
    expect(t).not.toContain('module-summary');
    expect(t).not.toContain('aria-describedby="'); // the binding is `nothing`: no attribute
  });
});

describe('panel tabs: keyboard', () => {
  const registry = new FakeCustomElementRegistry();
  type PanelT = {
    config?: CardModCardConfig; _tab: string; _initState(): void; render(): unknown;
    dispatchEvent(e: Event): boolean; _onTabKeydown(e: Partial<KeyboardEvent>): void;
  };
  let Panel: new () => PanelT;
  beforeAll(async () => {
    (globalThis as { customElements: unknown }).customElements = registry;
    registry.define('card-mod', class {});
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
    await import('../src/editor/cms-panel.js');
    Panel = registry.get('cms-panel') as new () => PanelT;
  });

  const press = (p: PanelT, key: string) => {
    let prevented = false;
    p._onTabKeydown({ key, preventDefault: () => { prevented = true; } });
    return prevented;
  };

  it('starts on Style; arrows wrap, Home / End jump; other keys are left alone', () => {
    const p = new Panel();
    p.dispatchEvent = () => true;
    Object.defineProperty(p, 'updateComplete', { value: Promise.resolve(true) });
    Object.defineProperty(p, 'shadowRoot', { value: { getElementById: () => ({ focus() {} }) } });
    expect(p._tab).toBe('style');
    expect(press(p, 'ArrowRight')).toBe(true);
    expect(p._tab).toBe('presets');
    press(p, 'End');
    expect(p._tab).toBe('settings');
    press(p, 'ArrowRight');
    expect(p._tab).toBe('style');
    press(p, 'ArrowLeft');
    expect(p._tab).toBe('settings');
    press(p, 'Home');
    expect(p._tab).toBe('style');
    expect(press(p, 'Enter')).toBe(false);
    expect(p._tab).toBe('style');
  });

  it('the tab list: one tab in the Tab order (the selected one), each pointing at the panel', () => {
    const p = new Panel();
    p.dispatchEvent = () => true;
    p.config = { type: 'tile', entity: 'light.a' } as CardModCardConfig;
    p._initState();
    p._tab = 'palette';
    const t = renderedText(p.render());
    expect(t).toContain('role="tablist"');
    expect(t.match(/role="tab"/g)).toHaveLength(4);
    expect(t).toMatch(/id="cms-tab-palette"[^>]*aria-selected="true"[^>]*aria-controls="cms-tabpanel"[^>]*tabindex="0"/);
    expect(t.match(/aria-selected="false"/g)).toHaveLength(3);
    expect(t).toContain('aria-labelledby="cms-tab-palette"');
    // the Style tab stays in the page (its modules keep their open state), hidden while Palette is open
    expect(t).toContain('<div class="tab-style" ?hidden=');
    expect(t).toContain('<cms-font-module');
    expect(t).toContain('<cms-palette-manager');
    p._tab = 'style';
    const s = renderedText(p.render());
    expect(s).toContain('<cms-font-module');
    expect(s).not.toContain('<cms-palette-manager');
  });
});

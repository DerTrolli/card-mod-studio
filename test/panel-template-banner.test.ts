/**
 * The info banner that explains why every module is off when the style has
 * a top-level Jinja statement ({% … %} outside a declaration value).
 * Driven through the real panel's rendered module list.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { CardModCardConfig, StudioState } from '../src/types/index.js';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

type PanelT = {
  config?: CardModCardConfig; _studioState: StudioState | null;
  _cardModPresent: boolean; _uixPresent: boolean;
  _initState(): void; _renderModuleList(s: StudioState): unknown;
};
let Panel: new () => PanelT;
beforeAll(async () => {
  await import('../src/editor/cms-panel.js');
  Panel = registry.get('cms-panel') as new () => PanelT;
});

const list = (style: string, type = 'tile') => {
  const p = new Panel();
  p.config = { type, entity: 'light.a', card_mod: { style } } as unknown as CardModCardConfig;
  p._cardModPresent = true;
  p._initState();
  return { p, text: templateText(p._renderModuleList(p._studioState!)) };
};
const BANNER = 'This style uses template statements ({% … %}), so the Studio keeps all of it as written in';
const GENERIC = "Some existing styles weren't recognised";

describe('template-statement info banner', () => {
  it('shows for a top-level {% if %} wrapper — modules are off, rules sit in Advanced CSS', () => {
    const style = "{% if is_state('light.a', 'on') %}\nha-card {\n  background: #ff0000;\n}\n{% endif %}";
    const { p, text } = list(style);
    expect(p._studioState!.advanced.rawCss).toContain('background: #ff0000');
    expect(p._studioState!.background.enabled).toBe(false);
    expect(text).toContain(BANNER);
    expect(text).toContain('Advanced CSS and the modules stay off.');
    expect(text).not.toContain(GENERIC); // one banner, not two
  });
  it('shows for a top-level {% set %}', () => {
    expect(list("{% set c = 'red' %}\nha-card {\n  background: {{ c }};\n}").text).toContain(BANNER);
  });
  it('is absent for a plain style the modules fully recognise', () => {
    const { text } = list('ha-card {\n  background: #ff0000;\n}');
    expect(text).not.toContain(BANNER);
    expect(text).not.toContain(GENERIC);
  });
  it('is absent for {{ … }} values — the modules handle those', () => {
    const { p, text } = list("ha-state-icon {\n  color: {{ 'red' if is_state(config.entity, 'on') else 'gray' }};\n}");
    expect(p._studioState!.iconColor.enabled).toBe(true);
    expect(text).not.toContain(BANNER);
  });
  it('is absent for a statement INSIDE a rule (only that rule stays raw) — the generic note applies', () => {
    const { text } = list("ha-card {\n  background: #ff0000;\n}\nha-state-icon {\n  {% if is_state('light.a','on') %}color: red;{% endif %}\n}");
    expect(text).not.toContain(BANNER);
    expect(text).toContain(GENERIC);
  });
  it('is absent with no style at all', () => {
    expect(list('').text).not.toContain(BANNER);
  });
});

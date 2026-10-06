/**
 * v0.10.0 audit — CSS-structure regressions (css-parser.ts / mapAdvanced).
 *
 * Each case opens a hand-written style through the REAL pipeline
 * (buildMergedStudioState → applyStudioState), applies an UNRELATED edit
 * (Border radius) and checks the hand-written part survives byte-for-byte
 * and in cascade order.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { parseCssDetailed, parseAllRules } from '../src/parser/css-parser.js';
import { findAdvancedCssConflicts } from '../src/utils/style-conflicts.js';
import { buildMergedStudioState } from '../src/editor/studio-state.js';
import { installEngines, restoreEngines, cfg, saveStringStyle, openEditSave, enableBorderRadius } from './v010-audit-helpers.js';

afterEach(() => restoreEngines());

const balanced = (css: string) => (css.match(/\{/g) ?? []).length === (css.match(/\}/g) ?? []).length;

describe('audit #1 — Jinja statements / comments ({% %}, {# #}) survive any edit', () => {
  it('{% if %} … {% endif %} inside a rule is kept verbatim (endif used to be dropped)', () => {
    const rule = "ha-card {\n  {% if is_state('sun.sun', 'above_horizon') %}\n  background: yellow;\n  {% endif %}\n}";
    const out = saveStringStyle(rule);
    expect(out).toContain(rule);
    expect(out).toBe(`ha-card {\n  border-radius: 8px;\n}\n\n${rule}`);
  });

  it('a top-level {% if %} wrapper keeps the WHOLE style verbatim — nothing is claimed', () => {
    const style = "ha-card {\n  border-radius: 20px;\n}\n{% if is_state('light.a', 'on') %}\nha-card {\n  box-shadow: 0 0 9px red;\n}\n{% endif %}";
    installEngines(['card-mod']);
    const state = buildMergedStudioState(cfg({ type: 'tile', entity: 'light.a', card_mod: { style } }));
    expect(state.border.enabled).toBe(false);
    expect(state.advanced.rawCss).toBe(style);
    restoreEngines();
    expect(saveStringStyle(style)).toBe(`ha-card {\n  border-radius: 8px;\n}\n\n${style}`);
  });

  it('{% set %} at top level is preserved together with the rules that use it', () => {
    const style = "{% set c = 'red' %}\nha-card {\n  box-shadow: 0 0 9px {{ c }};\n}";
    expect(saveStringStyle(style)).toContain(style);
  });

  it('a trailing top-level {% endif %} also keeps the whole style verbatim', () => {
    const style = "ha-card {\n  color: red;\n}\n{% endif %}";
    expect(saveStringStyle(style)).toContain(style);
  });

  it('rules BEFORE a statement-bearing rule stay recognisable; the statement rule and everything after are verbatim', () => {
    const tail = "ha-state-icon {\n  {% if is_state(config.entity, 'on') %}color: red;{% endif %}\n}\nha-card {\n  border-radius: 3px;\n}";
    const style = `ha-card {\n  border-radius: 20px;\n}\n\n${tail}`;
    installEngines(['card-mod']);
    const state = buildMergedStudioState(cfg({ type: 'tile', entity: 'light.a', card_mod: { style } }));
    expect(state.border).toMatchObject({ enabled: true, radiusPx: 20 });
    expect(state.advanced.rawCss).toBe(tail);
  });

  it('an inline {% %} value is never claimed by Background / Accent / Icon recognisers', () => {
    const v = "{% if is_state('light.a', 'on') %}red{% else %}blue{% endif %}";
    for (const [selector, prop] of [['ha-card', 'background'], ['ha-card', '--accent-color'], ['ha-state-icon', 'color']]) {
      const rule = `${selector} {\n  ${prop}: ${v};\n}`;
      installEngines(['card-mod']);
      const state = buildMergedStudioState(cfg({ type: 'tile', entity: 'light.a', card_mod: { style: rule } }));
      restoreEngines();
      expect(state.background.enabled || state.accentColor.enabled || state.iconColor.enabled).toBe(false);
      expect(saveStringStyle(rule)).toContain(rule);
    }
  });

  it('{# comments #} inside a rule are kept verbatim', () => {
    const rule = 'ha-card {\n  {# jinja comment #}\n  color: blue;\n}';
    expect(saveStringStyle(rule)).toContain(rule);
  });

  it('dict-form `.` gets the same protection', () => {
    installEngines(['card-mod']);
    const root = "ha-card {\n  {% if is_state('light.a','on') %}\n  box-shadow: 0 0 9px red;\n  {% endif %}\n}";
    const config = cfg({ type: 'tile', entity: 'light.a', card_mod: { style: { '.': root, 'ha-tile-icon$': 'x { y: z; }' } } });
    const next = openEditSave(config, enableBorderRadius);
    const style = next.card_mod?.style as unknown as Record<string, string>;
    expect(style['.']).toContain(root);
    expect(style['ha-tile-icon$']).toBe('x { y: z; }');
  });
});

describe('audit #3 — order-sensitive @-blocks keep their cascade position', () => {
  it('base rule then @media override: the override still comes after the base rule', () => {
    const style = 'ha-card {\n  padding: 16px;\n}\n\n@media (max-width: 600px) {\n  ha-card {\n    padding: 0;\n  }\n}';
    const out = saveStringStyle(style);
    expect(out.indexOf('@media')).toBeGreaterThan(out.indexOf('padding: 16px'));
  });

  it('everything from the first @media on is re-emitted byte-for-byte (incl. later rules)', () => {
    const tail = '@supports (backdrop-filter: blur(4px)) {\n  ha-card { backdrop-filter: blur(4px); }\n}\nha-card .name {   font-size: 18px; }\n/* trailing note */';
    const style = `ha-card {\n  box-shadow: none;\n}\n${tail}`;
    expect(saveStringStyle(style).endsWith(tail)).toBe(true);
  });

  it('@keyframes still float (only they may move) and Studio animation keyframes are not duplicated', () => {
    const style = 'ha-card {\n  animation: blink 2s linear infinite;\n}\n\n@keyframes blink {\n  50% { opacity: 0; }\n}';
    const out = saveStringStyle(style);
    expect(out).toContain('@keyframes blink');
    expect(out.match(/@keyframes blink/g)).toHaveLength(1);
  });

  it('a hand-authored @media alone stays exactly as written', () => {
    const style = '@media (max-width: 600px) {\n  ha-card { padding: 4px; }\n}';
    expect(saveStringStyle(style)).toBe(`ha-card {\n  border-radius: 8px;\n}\n\n${style}`);
  });

  it('trailing unparseable text (top-level {{ }} emitting CSS, unclosed block) is no longer dropped', () => {
    const t1 = "ha-card {\n  color: red;\n}\n{{ 'ha-card { background: blue; }' if is_state('light.a', 'on') else '' }}";
    expect(saveStringStyle(t1)).toContain("{{ 'ha-card { background: blue; }' if is_state('light.a', 'on') else '' }}");
    const t2 = 'ha-card {\n  color: red;\n}\nha-state-icon {\n  color: blue;';
    expect(saveStringStyle(t2)).toContain('ha-state-icon {\n  color: blue;');
  });

  it('override warnings still see a rule that sits after an @media (parseAllRules)', () => {
    installEngines(['card-mod']);
    const s = buildMergedStudioState(cfg({ type: 'tile', entity: 'light.a', card_mod: { style: 'ha-card {\n  border-radius: 12px;\n}' } }));
    const raw = '@media (max-width: 600px) {\n  ha-card { padding: 0; }\n}\nha-card {\n  border-radius: 3px;\n}';
    expect(findAdvancedCssConflicts(raw, s).border).toEqual(['ha-card { border-radius }']);
    expect(parseAllRules(raw).map((t) => t.selector)).toEqual(['ha-card']);
  });

  it('parseCssDetailed exposes the claimable head and the verbatim tail separately', () => {
    const r = parseCssDetailed('ha-card { color: red; }\n@media (x) { a { b: c; } }\nha-card { color: blue; }');
    expect(r.targets).toHaveLength(1);
    expect(r.targets[0].properties[0].value).toBe('red');
    expect(r.tailCss).toBe('@media (x) { a { b: c; } }\nha-card { color: blue; }');
  });
});

describe('audit #12 — nested braces inside a rule are preserved verbatim', () => {
  it('CSS nesting (`&:hover { }`) keeps balanced braces and its text', () => {
    const rule = 'ha-card {\n  color: red;\n  &:hover {\n    color: blue;\n  }\n}';
    const out = saveStringStyle(rule);
    expect(balanced(out)).toBe(true);
    expect(out).toContain(rule);
  });

  it('a nested @media inside a rule keeps balanced braces and its text', () => {
    const rule = 'ha-card {\n  padding: 8px;\n  @media (max-width: 600px) {\n    padding: 0;\n  }\n}';
    const out = saveStringStyle(rule);
    expect(balanced(out)).toBe(true);
    expect(out).toContain(rule);
  });
});

describe('audit #19 — same-selector coalescing respects !important', () => {
  it('an earlier !important keeps winning over a later plain declaration (across blocks)', () => {
    const out = saveStringStyle('ha-card {\n  box-shadow: 0 0 4px red !important;\n}\n\nha-card {\n  box-shadow: none;\n}');
    expect(out).toContain('box-shadow: 0 0 4px red !important');
    expect(out).not.toContain('box-shadow: none');
  });

  it('…and within one block', () => {
    const t = parseCssDetailed('ha-card { color: red !important; color: blue; }').targets[0];
    expect(t.properties).toEqual([expect.objectContaining({ property: 'color', value: 'red', important: true })]);
  });

  it('control: a later !important (or two plain declarations) still resolves to the later one', () => {
    expect(parseCssDetailed('a { color: red; color: blue !important; }').targets[0].properties[0].value).toBe('blue');
    expect(parseCssDetailed('a { color: red; } a { color: blue; }').targets[0].properties[0].value).toBe('blue');
  });
});

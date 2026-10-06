/**
 * v0.10.0 audit — recognisers must claim ONLY what they can regenerate
 * exactly. Anything else stays verbatim in Advanced CSS (rows: extraCss).
 * Each case: open → UNRELATED edit (Border radius) → save.
 */
import { describe, it, expect, afterEach } from 'vitest';
import type { StudioState } from '../src/types/index.js';
import { buildMergedStudioState } from '../src/editor/studio-state.js';
import { parseThresholdJinja, parseEntityRowCss } from '../src/parser/state-mapper.js';
import { installEngines, restoreEngines, cfg, saveStringStyle } from './v010-audit-helpers.js';

afterEach(() => restoreEngines());

function stateOf(style: string, type = 'tile'): StudioState {
  installEngines(['card-mod']);
  try {
    return buildMergedStudioState(cfg({ type, entity: 'light.a', card_mod: { style } }));
  } finally {
    restoreEngines();
  }
}

describe('audit #2 — threshold recogniser claims only exactly-regenerable Jinja', () => {
  const kept = (v: string) => {
    const rule = `ha-card {\n  background: ${v};\n}`;
    expect(stateOf(rule).threshold.enabled).toBe(false);
    expect(saveStringStyle(rule)).toContain(rule);
  };

  it('an extra `and is_state(...)` condition is not dropped', () =>
    kept("{{ 'red' if states('sensor.t') | float(0) > 20 and is_state('light.a', 'on') else 'blue' }}"));

  it('a non-literal else is not replaced by #888888', () =>
    kept("{{ 'red' if states('sensor.t') | float(0) > 20 else states('input_text.fallback') }}"));

  it('rules on two different entities are not rebound to one', () =>
    kept("{{ 'red' if states('sensor.a') | float(0) > 20 else ('blue' if states('sensor.b') | float(0) > 10 else 'green') }}"));

  it('arithmetic in the comparison is not dropped', () =>
    kept("{{ 'red' if states('sensor.t') | float(0) > 20 + states('input_number.offset') | float(0) else 'blue' }}"));

  it('a hand-written rule ORDER the generator would re-sort is not reordered (first-match semantics)', () =>
    kept("{{ 'red' if states('sensor.t') | float(0) > 10 else ('blue' if states('sensor.t') | float(0) < 20 else 'green') }}"));

  it('extra text around the expression is not dropped', () =>
    kept("{{ 'red' if states('sensor.t') | float(0) > 20 else 'blue' }} url(/local/x.png)"));

  it('a border shorthand with a non-solid style is not claimed', () => {
    const rule = "ha-card {\n  border: 2px dashed {{ 'red' if states('sensor.t') | float(0) > 20 else 'blue' }};\n}";
    expect(stateOf(rule).threshold.enabled).toBe(false);
    expect(saveStringStyle(rule)).toContain(rule);
  });

  it('control: the generator\'s own shape is still claimed (incl. compact whitespace and the flat chain)', () => {
    for (const v of [
      "{{ 'red' if states('sensor.t') | float(0) > 30 else ('orange' if states('sensor.t') | float(0) > 10 else 'blue') }}",
      "{{'red' if states('sensor.t')|float(0)>30 else 'orange' if states('sensor.t')|float(0)>10 else 'blue'}}",
    ]) {
      const s = stateOf(`ha-card {\n  background: ${v};\n}`);
      expect(s.threshold).toMatchObject({ enabled: true, entityId: 'sensor.t', defaultColor: 'blue' });
      expect(s.threshold.rules.map((r) => r.value)).toEqual([30, 10]);
    }
  });

  it('control: border shorthand `Npx solid {{ }}` is still claimed with its width', () => {
    const s = stateOf("ha-card {\n  border: 3px solid {{ 'red' if states('sensor.t') | float(0) > 20 else 'blue' }};\n}");
    expect(s.threshold).toMatchObject({ enabled: true, properties: ['border-color'], borderWidth: 3 });
  });

  it('parseThresholdJinja returns null for each non-regenerable shape', () => {
    expect(parseThresholdJinja("{{ 'red' if states('s') | float(0) > 2 }}")).toBeNull();
    expect(parseThresholdJinja("{{ 'red' if states('s') | float(0) > 2 else 'blue' }}{{ 'x' }}")).toBeNull();
    expect(parseThresholdJinja("{{ 'red' if states('s') | float(0) > 2 else 'blue' }}")).not.toBeNull();
  });

  it('rows: the same rules apply, and a threshold on ANOTHER entity is not rebound to the row entity', () => {
    const andForm = ":host {\n  --state-icon-color: {{ 'red' if states('sensor.t') | float(0) > 20 and is_state('light.a', 'on') else 'blue' }};\n}";
    expect(parseEntityRowCss(andForm, 'sensor.t').iconMode).toBeUndefined();
    expect(parseEntityRowCss(andForm, 'sensor.t').extraCss).toContain("is_state('light.a', 'on')");

    const other = ":host {\n  --state-icon-color: {{ 'red' if states('sensor.other') | float(0) > 20 else 'blue' }};\n}";
    expect(parseEntityRowCss(other, 'light.row').iconMode).toBeUndefined();
    expect(parseEntityRowCss(other, 'light.row').extraCss).toContain("states('sensor.other')");
    // control: on the row's own entity it is adopted
    expect(parseEntityRowCss(other, 'sensor.other').iconMode).toBe('threshold');
  });
});

describe('audit #10 — border module claims only `solid` borders', () => {
  it.each(['2px dashed red', '2px dotted var(--primary-color)', '3px none red', '1px double #fff'])(
    '`border: %s` stays verbatim (no rewrite to solid)',
    (value) => {
      const rule = `ha-card {\n  border: ${value};\n}`;
      expect(stateOf(rule).border.enabled).toBe(false);
      expect(saveStringStyle(rule)).toContain(rule);
    },
  );

  it('control: a solid border is still claimed', () => {
    expect(stateOf('ha-card {\n  border: 2px solid red;\n}').border).toMatchObject({ enabled: true, borderWidth: 2, borderColor: 'red' });
  });
});

describe('audit #11 — filter transition claimed only in the generator\'s exact shape', () => {
  const gray = "{{ 'grayscale(100%)' if is_state(config.entity, 'off') else 'none' }}";
  const noEdit = (s: StudioState) => s;

  it.each([
    'filter 300ms ease, transform 1s',
    'filter 1s linear',
    'filter 300ms ease 2s',
    'filter 1s, opacity 2s',
  ])('`transition: %s` is kept verbatim', (t) => {
    const out = saveStringStyle(`ha-card {\n  filter: ${gray};\n  transition: ${t};\n}`, noEdit);
    expect(out).toContain(`transition: ${t};`);
  });

  it('control: `filter 500ms ease` and `filter 1s` are claimed (regenerated in ms)', () => {
    expect(stateOf(`ha-card {\n  filter: ${gray};\n  transition: filter 500ms ease;\n}`).filter.transitionMs).toBe(500);
    const out = saveStringStyle(`ha-card {\n  filter: ${gray};\n  transition: filter 1s;\n}`, noEdit);
    // (tile: !important — the tile's own stylesheet overrides a plain one)
    expect(out).toContain('transition: filter 1000ms ease !important;');
    expect(out.match(/transition:/g)).toHaveLength(1);
  });
});

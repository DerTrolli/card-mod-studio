/**
 * v0.10.0 audit — entities-row regressions. Rows are rewritten on ANY
 * panel edit (applyEntityRowStyles maps every row), so hand-written row
 * CSS must survive an edit made to a DIFFERENT row.
 */
import { describe, it, expect, afterEach } from 'vitest';
import type { CardModCardConfig } from '../src/types/index.js';
import { initEntityRowStyles, applyEntityRowStyles, rowStyleKey } from '../src/editor/studio-state.js';
import { parseEntityRowCss } from '../src/parser/state-mapper.js';
import { installEngines, restoreEngines, cfg } from './v010-audit-helpers.js';

afterEach(() => restoreEngines());

type Rows = { entities: Array<Record<string, unknown> & { card_mod?: { style?: unknown }; uix?: { style?: unknown } }> };

/** Row 0 carries `style`; the user edits ROW 1 only. Returns the new config. */
function editOtherRow(config: CardModCardConfig, engines: Array<'card-mod' | 'uix'> = ['card-mod']): Rows {
  installEngines(engines);
  const styles = initEntityRowStyles(config);
  const edited = { ...styles, [rowStyleKey(1)]: { ...styles[rowStyleKey(1)], iconColor: 'blue', textColor: '' } };
  return applyEntityRowStyles(config, edited) as unknown as Rows;
}
const twoRows = (row0: unknown) => cfg({ type: 'entities', entities: [row0, { entity: 'light.b' }] });

describe('audit #7 — only the row\'s own :host rule is recognised', () => {
  it.each([
    'ha-state-icon {\n  color: red;\n}',
    '.info {\n  font-size: 20px;\n}',
    'hui-generic-entity-row {\n  --state-icon-color: red;\n  font-weight: bold;\n}',
  ])('a sub-element rule stays verbatim (not rewritten as :host): %s', (style) => {
    const out = editOtherRow(twoRows({ entity: 'light.a', card_mod: { style } }));
    expect(out.entities[0].card_mod?.style).toBe(style);
    const parsed = parseEntityRowCss(style);
    expect(parsed).toMatchObject({ iconColor: '', textColor: '' });
    expect(parsed.fontSizePx ?? parsed.fontWeight).toBeUndefined();
  });

  it('dict row `.` gets the same treatment', () => {
    const out = editOtherRow(twoRows({ entity: 'light.a', card_mod: { style: { '.': 'state-badge {\n  color: red;\n}', 'x$': 'y { z: 1; }' } } }));
    expect(out.entities[0].card_mod?.style).toEqual({ '.': 'state-badge {\n  color: red;\n}', 'x$': 'y { z: 1; }' });
  });

  it('a :host rule AFTER a sub-element rule is still recognised (and the other rule kept)', () => {
    const parsed = parseEntityRowCss('state-badge {\n  color: red;\n}\n:host {\n  color: blue;\n}');
    expect(parsed.textColor).toBe('blue');
    expect(parsed.extraCss).toBe('state-badge {\n  color: red;\n}');
  });

  it('control: bare declarations still get the synthetic :host', () => {
    expect(parseEntityRowCss('--state-icon-color: #ff0000;\ncolor: #00ff00;')).toMatchObject({ iconColor: '#ff0000', textColor: '#00ff00' });
  });
});

describe('audit #15 — @-block-only row styles are preserved verbatim (no corrupt :host wrapper)', () => {
  const style = '@media (max-width: 600px) {\n  :host {\n    color: red;\n  }\n}';

  it('survives an unrelated edit unchanged', () => {
    expect(editOtherRow(twoRows({ entity: 'light.a', card_mod: { style } })).entities[0].card_mod?.style).toBe(style);
  });

  it('is stable across repeated saves (used to alternate corrupt/clean)', () => {
    let config = twoRows({ entity: 'light.a', card_mod: { style } });
    for (let k = 0; k < 3; k++) {
      config = editOtherRow(config) as unknown as CardModCardConfig;
      expect((config as unknown as Rows).entities[0].card_mod?.style).toBe(style);
    }
  });

  it('row styles with Jinja statements stay verbatim', () => {
    const s = ":host {\n  {% if is_state('light.a', 'on') %}color: red;{% endif %}\n}";
    expect(editOtherRow(twoRows({ entity: 'light.a', card_mod: { style: s } })).entities[0].card_mod?.style).toBe(s);
  });
});

describe('audit #5 — row merge keeps BOTH keys\' unrecognised row CSS', () => {
  it('card_mod + uix with different extra row CSS → an edit to another row keeps both', () => {
    const out = editOtherRow(twoRows({
      entity: 'light.a',
      card_mod: { style: ':host {\n  --foo: 1px;\n}' },
      uix: { style: ':host {\n  --bar: 2px;\n}' },
    }));
    const row0 = JSON.stringify(out.entities[0]);
    expect(row0).toContain('--foo: 1px');
    expect(row0).toContain('--bar: 2px');
  });

  it('identical extra CSS under both keys is kept once', () => {
    const out = editOtherRow(twoRows({ entity: 'light.a', card_mod: { style: ':host {\n  --foo: 1px;\n}' }, uix: { style: ':host {\n  --foo: 1px;\n}' } }));
    expect(out.entities[0].card_mod?.style).toBe(':host {\n  --foo: 1px;\n}');
    expect(out.entities[0].uix).toBeUndefined();
  });
});

describe('audit #6 (rows) — a dict that is the row\'s only style is editable', () => {
  it('card-mod active, row has ONLY a uix dict → parsed and consolidated into card_mod', () => {
    installEngines(['card-mod', 'uix']);
    const config = cfg({ type: 'entities', entities: [{ entity: 'light.a', uix: { style: { '.': ':host {\n  color: red;\n}', 'div$': 'x { y: z; }' } } }] });
    const styles = initEntityRowStyles(config);
    expect(styles[rowStyleKey(0)].textColor).toBe('red');
    const out = applyEntityRowStyles(config, { [rowStyleKey(0)]: { ...styles[rowStyleKey(0)], textColor: 'blue' } }) as unknown as Rows;
    expect(out.entities[0].card_mod?.style).toEqual({ '.': ':host {\n  color: blue;\n}', 'div$': 'x { y: z; }' });
    expect(out.entities[0].uix).toBeUndefined();
  });

  it('a uix row dict with $$ keys stays under uix', () => {
    installEngines(['card-mod', 'uix']);
    const config = cfg({ type: 'entities', entities: [{ entity: 'light.a', uix: { style: { '.': ':host {\n  color: red;\n}', '$$ state-badge': 'color: red;' } } }] });
    const styles = initEntityRowStyles(config);
    const out = applyEntityRowStyles(config, { [rowStyleKey(0)]: { ...styles[rowStyleKey(0)], textColor: 'blue' } }) as unknown as Rows;
    expect(out.entities[0].uix?.style).toEqual({ '.': ':host {\n  color: blue;\n}', '$$ state-badge': 'color: red;' });
    expect(out.entities[0].card_mod).toBeUndefined();
  });

  it('the same dict under both keys is one editable dict', () => {
    installEngines(['card-mod']);
    const d = { '.': ':host {\n  color: red;\n}', 'div$': 'x {}' };
    const config = cfg({ type: 'entities', entities: [{ entity: 'light.a', card_mod: { style: d }, uix: { style: { ...d } } }] });
    const st = initEntityRowStyles(config)[rowStyleKey(0)];
    expect(st.frozen).toBeUndefined();
    expect(st.dictSource).toBeDefined();
  });
});

describe('audit #9 — rows that can\'t be rewritten are marked frozen and left untouched', () => {
  it.each([
    ['mixed-form (string + dict across keys)', { card_mod: { style: ':host { color: red; }' }, uix: { style: { 'div$': 'x' } } }],
    ['different dicts under both keys', { card_mod: { style: { 'a$': '1' } }, uix: { style: { 'b$': '2' } } }],
    ['a `.` that is not a CSS string', { card_mod: { style: { '.': { 'x$': 'y' } } } }],
  ])('%s', (_label, keys) => {
    installEngines(['card-mod']);
    const row = { entity: 'light.a', ...keys };
    const config = cfg({ type: 'entities', entities: [row] });
    const styles = initEntityRowStyles(config);
    expect(styles[rowStyleKey(0)].frozen).toBe(true);
    const out = applyEntityRowStyles(config, { [rowStyleKey(0)]: { ...styles[rowStyleKey(0)], textColor: 'blue' } }) as unknown as Rows;
    expect(out.entities[0]).toBe(row);
  });

  it('control: an empty `{}` row dict is NOT frozen (audit #14) — the edit is saved', () => {
    installEngines(['card-mod']);
    const config = cfg({ type: 'entities', entities: [{ entity: 'light.a', card_mod: { style: ':host { color: red; }' }, uix: { style: {} } }] });
    const styles = initEntityRowStyles(config);
    expect(styles[rowStyleKey(0)].frozen).toBeUndefined();
    const out = applyEntityRowStyles(config, { [rowStyleKey(0)]: { ...styles[rowStyleKey(0)], textColor: 'blue' } }) as unknown as Rows;
    expect(out.entities[0].card_mod?.style).toBe(':host {\n  color: blue;\n}');
    expect(out.entities[0].uix).toBeUndefined();
  });
});

describe('audit #20 — a null entry in entities: no longer crashes', () => {
  it('init + apply skip it and keep it in place', () => {
    installEngines(['card-mod']);
    const config = cfg({ type: 'entities', entities: [null, { entity: 'light.a' }, 'sensor.b'] });
    const styles = initEntityRowStyles(config);
    expect(Object.keys(styles)).toEqual([rowStyleKey(1), rowStyleKey(2)]);
    const out = applyEntityRowStyles(config, { ...styles, [rowStyleKey(1)]: { iconColor: 'red', textColor: '' } }) as unknown as Rows;
    expect(out.entities[0]).toBeNull();
    expect(out.entities[2]).toBe('sensor.b');
  });
});

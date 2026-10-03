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

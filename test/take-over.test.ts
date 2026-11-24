/**
 * "Let this module take over" (v1.0): removes from Advanced CSS exactly the
 * declarations that override a module, and a rule they leave empty; every
 * other byte stays. Not offered where it can't be done safely.
 */
import { describe, it, expect } from 'vitest';
import { removeAdvancedCssConflicts, canTakeOver, findAdvancedCssConflicts } from '../src/utils/style-conflicts.js';
import { mapToStudioState, DEFAULT_BACKGROUND, DEFAULT_BORDER } from '../src/parser/state-mapper.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';

const base = mapToStudioState(parseStyleValue(''), 'tile');
const bgOn = { ...base, background: { ...DEFAULT_BACKGROUND, enabled: true, color1: '#ff0000' } };
const both = { ...bgOn, border: { ...DEFAULT_BORDER, enabled: true, radiusPx: 8 } };

describe('removeAdvancedCssConflicts', () => {
  it('drops only the overriding declaration; the rest of the rule stays as written', () => {
    const css = 'ha-card {\n  background: blue;\n  color: red;\n}\n';
    const r = removeAdvancedCssConflicts(css, bgOn, 'background')!;
    expect(r.css).toBe('ha-card {\n  color: red;\n}\n');
    expect(r.removed).toEqual(['ha-card { background }']);
    expect(findAdvancedCssConflicts(r.css, bgOn).background).toBeUndefined();
  });

  it('a rule left empty goes; neighbouring rules and comments stay byte for byte', () => {
    const css = '/* mine */\n.x { color: red; }\n\nha-card {\n  background: blue;\n}\n\n.y { margin: 0 }\n';
    const r = removeAdvancedCssConflicts(css, bgOn, 'background')!;
    expect(r.css).toBe('/* mine */\n.x { color: red; }\n\n.y { margin: 0 }\n');
  });

  it('the last declaration without ;', () => {
    const r = removeAdvancedCssConflicts('ha-card {\n  color: red;\n  background: blue\n}', bgOn, 'background')!;
    expect(r.css).toBe('ha-card {\n  color: red;\n}');
  });

  it('only the asked module: Border stays when Background takes over', () => {
    const css = 'ha-card {\n  background: blue;\n  border-radius: 2px;\n}';
    const r = removeAdvancedCssConflicts(css, both, 'background')!;
    expect(r.css).toBe('ha-card {\n  border-radius: 2px;\n}');
    expect(findAdvancedCssConflicts(r.css, both).border).toBeDefined();
  });

  it('inside @media, with Jinja expressions and strings around', () => {
    const css = "@media (max-width: 600px) {\n  ha-card {\n    background: {{ 'red' if is_state('x', 'on') else 'blue' }};\n    content: 'a;b';\n  }\n}";
    const r = removeAdvancedCssConflicts(css, bgOn, 'background')!;
    expect(r.css).toBe("@media (max-width: 600px) {\n  ha-card {\n    content: 'a;b';\n  }\n}");
  });

  it('an @media block left empty goes too; one with other rules stays', () => {
    const css = 'ha-card {\n  color: red;\n}\n\n@media (min-width: 0px) {\n  ha-card { background: blue; }\n}\n';
    expect(removeAdvancedCssConflicts(css, bgOn, 'background')!.css).toBe('ha-card {\n  color: red;\n}\n');
    const kept = '@media (min-width: 0px) {\n  ha-card { background: blue; }\n  .x { color: red; }\n}';
    expect(removeAdvancedCssConflicts(kept, bgOn, 'background')!.css).toBe('@media (min-width: 0px) {\n  .x { color: red; }\n}');
  });

  it('every overriding declaration in the rule goes, duplicates included', () => {
    const r = removeAdvancedCssConflicts('ha-card { background: a; background: b; padding: 0; }', bgOn, 'background')!;
    expect(r.css).toBe('ha-card { padding: 0; }');
  });

  it('nothing to remove, or not safe → null', () => {
    expect(removeAdvancedCssConflicts('ha-card { color: red; }', bgOn, 'background')).toBeNull();
    expect(removeAdvancedCssConflicts("{% if true %}ha-card { background: blue; }{% endif %}", bgOn, 'background')).toBeNull();
    expect(removeAdvancedCssConflicts('ha-card { background: blue;', bgOn, 'background')).toBeNull();
    expect(removeAdvancedCssConflicts('ha-card { background: blue; }', base, 'background')).toBeNull(); // module off
  });

  it('canTakeOver: plain CSS yes; Jinja statements or broken CSS no', () => {
    expect(canTakeOver('ha-card { background: blue; }')).toBe(true);
    expect(canTakeOver('{% set a = 1 %}ha-card { background: blue; }')).toBe(false);
    expect(canTakeOver('ha-card { background: blue;')).toBe(false);
    expect(canTakeOver('')).toBe(false);
  });

  it('a rule with a nested rule is left alone', () => {
    const css = 'ha-card {\n  background: blue;\n  .x { color: red; }\n}';
    expect(removeAdvancedCssConflicts(css, bgOn, 'background')).toBeNull();
  });
});

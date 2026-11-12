/**
 * The size-less Font anchor claims only what the regenerated block writes
 * back, and adopts only styles whose next save is byte-identical.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { installEngines, restoreEngines, cfg, openEditSave } from './v010-audit-helpers.js';
import { buildMergedStudioState } from '../src/editor/studio-state.js';

afterEach(() => restoreEngines());

const save = (type: string, style: string): string => {
  installEngines(['card-mod']);
  const config = cfg({ type, entity: 'light.a', card_mod: { style } });
  return String(openEditSave(config).card_mod?.style ?? '');
};

describe('hand-written companions survive a no-op save', () => {
  const CASES: Array<[string, string]> = [
    ['sun', 'ha-card {\n  color: red;\n  --primary-text-color: red;\n}'],
    ['sun', 'ha-card {\n  font-weight: bold;\n}\n\n.card-header {\n  font-weight: bold;\n}'],
    ['sun', 'ha-card {\n  color: red;\n}\n\n.name {\n  color: red;\n}'],
    ['light', 'ha-card {\n  color: white;\n  --primary-text-color: white;\n  --secondary-text-color: white;\n}'],
  ];
  it.each(CASES)('[%s] %j', (type, style) => expect(save(type, style)).toBe(style));
});

describe('adoption is byte-stable', () => {
  it('a bare colour on a plain card is still adopted by Font', () => {
    installEngines(['card-mod']);
    const s = buildMergedStudioState(cfg({ type: 'sun', card_mod: { style: 'ha-card {\n  color: red;\n}' } }));
    expect(s.font.enabled).toBe(true);
    expect(s.font.color).toBe('red');
  });
  it('a bare colour on markdown is adopted too and gains the header colour on the next save', () => {
    installEngines(['card-mod']);
    const style = 'ha-card {\n  color: red;\n}';
    const s = buildMergedStudioState(cfg({ type: 'markdown', card_mod: { style } }));
    expect(s.font).toMatchObject({ enabled: true, color: 'red' });
    expect(s.advanced.rawCss).toBe('');
    expect(save('markdown', style)).toBe('ha-card {\n  color: red;\n  --ha-card-header-color: red;\n}');
  });
  it('a hand-reordered colour / weight is left to Advanced CSS, not rewritten', () => {
    installEngines(['card-mod']);
    const style = 'ha-card {\n  color: red;\n  font-weight: bold;\n}';
    expect(buildMergedStudioState(cfg({ type: 'sun', card_mod: { style } })).font.enabled).toBe(false);
    expect(save('sun', style)).toBe(style);
  });
});

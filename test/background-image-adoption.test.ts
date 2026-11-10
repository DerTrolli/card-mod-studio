/**
 * An unconditional Background with an image (what the Studio writes for
 * "Always" with a url(...) value) is read back into the module, but only when
 * the module writes exactly the same declaration again.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { installEngines, restoreEngines, cfg, openEditSave } from './v010-audit-helpers.js';
import { buildMergedStudioState } from '../src/editor/studio-state.js';

afterEach(() => restoreEngines());

const open = (type: string, style: string) => {
  installEngines(['card-mod']);
  const config = cfg({ type, entity: 'light.a', card_mod: { style } });
  return { state: buildMergedStudioState(config), saved: String(openEditSave(config).card_mod?.style ?? '') };
};
const rule = (decl: string) => `ha-card {\n  ${decl};\n}`;

describe('Studio-written image backgrounds load', () => {
  it.each([
    ["url('/x.png')", "background: url('/x.png')"],
    ['url(/x.png), red', 'background: url(/x.png), red'],
    ['url("/x.png")', 'background: url("/x.png")'],
  ])('%s', (value, decl) => {
    const { state, saved } = open('tile', rule(decl));
    expect(state.background).toMatchObject({ enabled: true, type: 'solid', color1: value, applyWhen: 'always' });
    expect(state.advanced.rawCss).toBe('');
    expect(saved).toBe(rule(decl));
  });
});

describe('shapes the module cannot write back stay in Advanced CSS, byte-identical', () => {
  const KEPT: Array<[string, string]> = [
    ['shorthand with position and size', rule('background: url(x.png) center / cover no-repeat')],
    ['colour before an image', rule('background: red url(x.png) no-repeat')],
    ['semicolon inside url(data:...)', rule('background: url(data:image/png;base64,AAAA)')],
    ['background-size beside', "ha-card {\n  background: url('/local/img.png');\n  background-size: cover;\n}"],
    ['!important the generator would drop', rule('background: url(/x.png) !important')],
    ['colour list with the colour first', rule('background: red, url(/x.png)')],
  ];
  it.each(KEPT)('%s', (_n, style) => {
    const { state, saved } = open('tile', style);
    expect(state.background.enabled).toBe(false);
    expect(saved).toBe(style);
  });
});

describe('markdown: the parser cannot see text_only (which adds !important), so images stay hand-written', () => {
  it.each([rule("background: url('/x.png')"), rule("background: url('/x.png') !important")])('%s', (style) => {
    installEngines(['card-mod']);
    const config = cfg({ type: 'markdown', content: 'x', card_mod: { style } });
    expect(buildMergedStudioState(config).background.enabled).toBe(false);
    expect(String(openEditSave(config).card_mod?.style)).toBe(style);
  });
});

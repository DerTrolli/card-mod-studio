/**
 * Releases v0.8.0-beta.2 .. v0.10.1 wrote the card-header colour / family
 * variables on picture-glance (it was in the header-title card list until
 * 0.10.2). A colour-only or family-only style of that shape still loads with
 * Font on; the next save drops the variables (today's generator does not
 * write them there).
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

const COLOUR = 'ha-card {\n  color: red;\n  --ha-card-header-color: red;\n}';
const FAMILY = 'ha-card {\n  font-family: Georgia;\n  --ha-card-header-font-family: Georgia;\n}';

describe('old picture-glance size-less Font styles', () => {
  it('colour with the header colour variable loads with Font on', () => {
    const { state, saved } = open('picture-glance', COLOUR);
    expect(state.font).toMatchObject({ enabled: true, color: 'red' });
    expect(state.font.fontSize).toBeUndefined();
    expect(state.advanced.rawCss).toBe('');
    // Upgrade: the variable is dropped, nothing is written twice.
    expect(saved).toBe('ha-card {\n  color: red;\n}');
    expect(open('picture-glance', saved).saved).toBe(saved);
    expect(open('picture-glance', saved).state.font).toMatchObject({ enabled: true, color: 'red' });
  });

  it('family with the header family variable loads with Font on', () => {
    const { state, saved } = open('picture-glance', FAMILY);
    expect(state.font).toMatchObject({ enabled: true, fontFamily: 'Georgia' });
    expect(state.advanced.rawCss).toBe('');
    expect(saved).toBe('ha-card {\n  font-family: Georgia;\n}');
    expect(open('picture-glance', saved).saved).toBe(saved);
  });

  it('the plain forms without the variables still load', () => {
    expect(open('picture-glance', 'ha-card {\n  color: red;\n}').state.font.enabled).toBe(true);
    expect(open('picture-glance', 'ha-card {\n  font-family: Georgia;\n}').state.font.enabled).toBe(true);
  });

  it('a header variable with another value is hand-written: not adopted, kept', () => {
    const style = 'ha-card {\n  color: red;\n  --ha-card-header-color: blue;\n}';
    const { state, saved } = open('picture-glance', style);
    expect(state.font.enabled).toBe(false);
    expect(saved).toBe(style);
  });

  it('other card types keep the strictness: a header variable beside a bare colour on a sun card', () => {
    const { state, saved } = open('sun', COLOUR);
    expect(state.font.enabled).toBe(false);
    expect(saved).toBe(COLOUR);
  });
});

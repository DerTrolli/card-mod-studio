/**
 * A Font companion is claimed only when its `!important` flag is the one the
 * generator writes back: a plain hand-written `.name { font-size: 20px }`
 * must not come back as `!important`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { installEngines, restoreEngines, cfg, openEditSave } from './v010-audit-helpers.js';
import { buildMergedStudioState } from '../src/editor/studio-state.js';

afterEach(() => restoreEngines());

const open = (type: string, style: string) => {
  installEngines(['card-mod']);
  const config = cfg({ type, entity: 'sensor.a', card_mod: { style } });
  return { state: buildMergedStudioState(config), saved: String(openEditSave(config).card_mod?.style ?? '') };
};

describe('a companion without the generator\'s !important stays hand-written', () => {
  const STUDIO = 'ha-card {\n  font-size: 20px;\n  font-weight: bold;\n}';

  it('sensor: a plain .name font-size beside a matching Font style is kept byte-identically', () => {
    const style = `${STUDIO}\n\n.name {\n  font-size: 20px;\n}`;
    const { state, saved } = open('sensor', style);
    expect(state.font).toMatchObject({ enabled: true, fontSize: 20 });
    expect(state.advanced.rawCss).toBe('.name {\n  font-size: 20px;\n}');
    // The user's rule is written back untouched (no !important added), after
    // the Studio's own flagged companions.
    expect(saved.endsWith('\n\n.name {\n  font-size: 20px;\n}')).toBe(true);
    expect(saved).toContain('.name {\n  font-size: 20px !important;\n  font-weight: bold !important;\n}');
    // (Reopening that save drops the user's rule: the parser already discards
    // a later plain declaration that an earlier `!important` one overrides in
    // the same selector. It had no effect in the cascade either way.)
    const second = open('sensor', saved).saved;
    expect(open('sensor', second).saved).toBe(second);
  });

  it('sensor: the Studio\'s own output (with !important) round-trips', () => {
    const first = open('sensor', STUDIO).saved;
    expect(first).toContain('.name {\n  font-size: 20px !important;');
    const again = open('sensor', first);
    expect(again.saved).toBe(first);
    expect(again.state.advanced.rawCss).toBe('');
  });

  it('entities: the plain .card-header weight (no !important) is still the Studio\'s', () => {
    const first = open('entities', STUDIO).saved;
    expect(first).toContain('.card-header {\n  font-weight: bold;\n}');
    const again = open('entities', first);
    expect(again.saved).toBe(first);
    expect(again.state.advanced.rawCss).toBe('');
  });

  it('entities: a flagged .card-header weight is the user\'s', () => {
    const { state } = open('entities', `${STUDIO}\n\n.card-header {\n  font-weight: bold !important;\n}`);
    expect(state.advanced.rawCss).toBe('.card-header {\n  font-weight: bold !important;\n}');
  });

  it('a header variable carrying !important is the user\'s', () => {
    const { state } = open('glance', 'ha-card {\n  font-size: 20px;\n  --ha-card-header-font-size: calc(20px * 1.5) !important;\n}');
    expect(state.advanced.rawCss).toContain('--ha-card-header-font-size: calc(20px * 1.5) !important;');
  });
});

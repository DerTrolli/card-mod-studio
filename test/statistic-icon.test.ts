/**
 * Icon Color on the statistic card (v0.11): the card's one icon takes a fixed
 * colour and — what Accent cannot do — a size. Pins the caps and that both
 * round-trip, and that styles written before (a lone `--mdc-icon-size`, an
 * Accent) are left as they were.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { capsFor } from '../src/utils/card-caps.js';
import { applyStudioState, buildMergedStudioState } from '../src/editor/studio-state.js';
import { DEFAULT_ICON_COLOR, DEFAULT_ACCENT_COLOR } from '../src/parser/state-mapper.js';
import { installEngines, restoreEngines, cfg } from './v010-audit-helpers.js';

beforeEach(() => installEngines(['card-mod']));
afterEach(() => restoreEngines());

const card = (style?: string) =>
  cfg({ type: 'statistic', entity: 'sensor.t', stat_type: 'mean', period: { calendar: { period: 'day' } }, ...(style ? { card_mod: { style } } : {}) });

describe('statistic: Icon Color', () => {
  it('is shown, with a size control; Accent stays', () => {
    const c = capsFor('statistic');
    expect(c.modules.iconColor).toBe(true);
    expect(c.iconSize).toBe(true);
    expect(c.modules.accentColor).toBe(true);
  });

  it('a fixed colour and a size write, reopen and re-save byte-identically', () => {
    const blank = buildMergedStudioState(card());
    const state = { ...blank, iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'plain' as const, color: '#1e88e5', sizePx: 40 } };
    const written = applyStudioState(state, card());
    const css = written.card_mod!.style as string;
    expect(css).toContain('color: #1e88e5 !important;');
    expect(css).toContain('--mdc-icon-size: 40px;');
    expect(css).not.toContain('config.entity');
    const back = buildMergedStudioState(written);
    expect(back.iconColor).toMatchObject({ enabled: true, mode: 'plain', color: '#1e88e5', sizePx: 40 });
    expect(back.advanced.rawCss).toBe('');
    expect(applyStudioState(back, written).card_mod!.style).toBe(css);
  });

  it('Accent beside it keeps loading as Accent', () => {
    const style = 'ha-card {\n  --accent-color: #e53935;\n  --state-icon-color: #e53935;\n}';
    const back = buildMergedStudioState(card(style));
    expect(back.accentColor.enabled).toBe(true);
    expect(back.iconColor.enabled).toBe(false);
    expect(applyStudioState(back, card(style)).card_mod!.style).toBe(style);
    expect(DEFAULT_ACCENT_COLOR.enabled).toBe(false);
  });

  it('a hand-written lone --mdc-icon-size stays in Advanced CSS (only the exact pair is claimed)', () => {
    const style = 'ha-card {\n  --mdc-icon-size: 48px;\n}';
    const back = buildMergedStudioState(card(style));
    expect(back.iconColor.sizePx ?? 0).toBe(0);
    expect(back.advanced.rawCss).toContain('--mdc-icon-size: 48px;');
    expect(applyStudioState(back, card(style)).card_mod!.style).toBe(style);
  });
});

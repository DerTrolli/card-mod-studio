/**
 * A hand-written `ha-card { --state-icon-color: red; }` on the statistic card
 * is adopted as Icon Color (plain, red). Verified live: Home Assistant 2026.11
 * with card-mod 4.2.1 — the statistic card's icon (ha-state-icon / ha-icon /
 * ha-svg-icon) computed `color: rgb(255, 0, 0)` with that rule and
 * rgb(68, 115, 158) on an unstyled copy, so the variable did colour the icon
 * and the adoption is equivalent. (`--paper-item-icon-color` changed nothing
 * on that card in the same check.)
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { buildMergedStudioState } from '../src/editor/studio-state.js';
import { installEngines, restoreEngines, cfg } from './v010-audit-helpers.js';

beforeEach(() => installEngines(['card-mod']));
afterEach(() => restoreEngines());

describe('statistic: hand-written --state-icon-color', () => {
  it('is adopted as a plain Icon Color', () => {
    const c = cfg({
      type: 'statistic', entity: 'sensor.t', stat_type: 'mean', period: { calendar: { period: 'day' } },
      card_mod: { style: 'ha-card { --state-icon-color: red; }' },
    });
    const back = buildMergedStudioState(c);
    expect(back.iconColor).toMatchObject({ enabled: true, mode: 'plain', color: 'red' });
    expect(back.advanced.rawCss).toBe('');
  });
});

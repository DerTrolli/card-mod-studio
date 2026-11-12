/**
 * Review fix 2 — the Bubble Font gate follows the text Bubble actually renders.
 *
 * Oracle: a transliteration of Bubble Card 3.4.3's state-content code
 * (tools/sandbox/config/www/bubble-card.js — search for the strings
 * `show_last_changed??!1` (function u: legacy options -> list),
 * `function p(e,t,n){return"card"!==t` (the button_type: state default),
 * `function h(e,t="card"` (state_content / legacy / default choice) and
 * `C=!!g&&g.length>0` inside `function b(e,t=!1)` (module 314: the state line
 * is shown iff that list is non-empty; the name iff `show_name ?? true`).
 * Button, slider and cover all call that same `b`.
 */
import { describe, it, expect } from 'vitest';
import { capsFor } from '../src/utils/card-caps.js';

const BTN = 'custom:bubble-card/button';
const SLIDER = 'custom:bubble-card/button/slider';
const COVER = 'custom:bubble-card/cover';

function bubbleStateList(cfg: Record<string, unknown>): string[] | null {
  const legacy = ['show_state', 'show_attribute', 'attribute', 'show_last_changed', 'show_last_updated'];
  const sc = cfg.state_content;
  if (sc !== undefined && sc !== null) {
    return (Array.isArray(sc) ? sc : [sc]).filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
  }
  if (legacy.some((k) => cfg[k] !== undefined)) {
    const n = cfg.button_type === 'state';
    const o = cfg.show_state ?? n;
    const i = cfg.show_attribute ?? n;
    const a = cfg.show_last_changed ?? false;
    const r = cfg.show_last_updated ?? false;
    if (!(o || i || a || r)) return null;
    const l = typeof cfg.attribute === 'string' ? cfg.attribute.trim() : '';
    const s: string[] = [];
    if (o) s.push('state');
    if (i && l) s.push(l);
    if (a) s.push('last_changed');
    if (r) s.push('last_updated');
    return s;
  }
  return cfg.button_type === 'state' ? ['state'] : null;
}
const bubbleHasText = (cfg: Record<string, unknown>): boolean =>
  (cfg.show_name ?? true) !== false || (bubbleStateList(cfg)?.length ?? 0) > 0;

describe('Bubble Font gate follows the rendered text, not just show_state', () => {
  const U = undefined;
  const bools = [U, true, false];
  const axes: Array<[string, unknown[]]> = [
    ['show_name', bools],
    ['show_state', bools],
    ['show_attribute', bools],
    ['attribute', [U, 'brightness', '  ']],
    ['show_last_changed', bools],
    ['show_last_updated', bools],
    ['state_content', [U, [], ['state'], 'state', ['  ']]],
  ];
  const buttonTypes = [U, 'switch', 'state', 'name'];

  it('hides Font exactly when the oracle says no text is rendered (every combination, 3 kinds)', () => {
    let n = 0;
    let hidden = 0;
    const walk = (i: number, cfg: Record<string, unknown>) => {
      if (i === axes.length) {
        for (const bt of buttonTypes) {
          const c = { ...cfg, ...(bt === U ? {} : { button_type: bt }) };
          const kinds: Array<[Record<string, unknown>, string]> = [
            [{ card_type: 'button' }, BTN],
            [{ card_type: 'cover' }, COVER],
            [{ card_type: 'button', button_type: 'slider' }, SLIDER],
          ];
          for (const [extra, key] of kinds) {
            const config = { type: 'custom:bubble-card', ...c, ...extra };
            // a slider is a button whose button_type is `slider`
            const oracle = bubbleHasText(config);
            expect(capsFor(key, config).modules.font, JSON.stringify(config)).toBe(oracle);
            n++;
            if (!oracle) hidden++;
          }
        }
        return;
      }
      const [k, vals] = axes[i];
      for (const v of vals) walk(i + 1, v === U ? cfg : { ...cfg, [k]: v });
    };
    walk(0, {});
    expect(n).toBeGreaterThan(20000);
    expect(hidden).toBeGreaterThan(1000);
  });

  it("the review's common case: button_type state with the name hidden keeps Font", () => {
    const cfg = { type: 'custom:bubble-card', card_type: 'button', button_type: 'state', show_name: false };
    expect(capsFor(BTN, cfg).modules.font).toBe(true);
    expect(capsFor(BTN, { ...cfg, button_type: 'switch' }).modules.font).toBe(false);
    expect(capsFor(BTN, { ...cfg, button_type: 'switch', show_last_changed: true }).modules.font).toBe(true);
    expect(capsFor(BTN, { ...cfg, button_type: 'switch', show_attribute: true, attribute: 'brightness' }).modules.font).toBe(true);
    expect(capsFor(BTN, { ...cfg, button_type: 'switch', show_attribute: true }).modules.font).toBe(false);
  });
});

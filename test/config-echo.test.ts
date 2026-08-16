/**
 * Unit tests for ConfigEchoGuard (src/utils/config-echo.ts) — the own-echo
 * dedup guard used by cms-panel (_initState) and cms-child-card-section
 * (willUpdate). The panel components themselves are Lit elements and can't
 * be instantiated in this plain-Node test environment, so the guard logic
 * was extracted into this dependency-free class and BOTH components now
 * call it — testing the class tests the exact production decision path.
 *
 * The regression it pins down: with the old inline logic, the baseline was
 * only ever written on emit, so "emit A → external change to B → external
 * revert to exactly A" falsely matched A against the stale baseline and
 * skipped the rebuild, leaving stale B-derived editor state.
 */

import { describe, it, expect } from 'vitest';
import { ConfigEchoGuard } from '../src/utils/config-echo.js';

const A = JSON.stringify({ type: 'tile', entity: 'light.desk', card_mod: { style: 'ha-card { --a: 1; }' } });
const B = JSON.stringify({ type: 'tile', entity: 'light.desk', card_mod: { style: 'ha-card { --b: 2; }' } });

describe('ConfigEchoGuard', () => {
  it('rebuilds on the first incoming config', () => {
    const g = new ConfigEchoGuard();
    expect(g.shouldRebuild(A)).toBe(true);
  });

  it('skips the reflected echo of a config this component just emitted', () => {
    const g = new ConfigEchoGuard();
    g.shouldRebuild(A); // initial load
    g.noteEmitted(B); // user edit emitted upward
    expect(g.shouldRebuild(B)).toBe(false); // host reflects it back — no rebuild mid-edit
  });

  it('REGRESSION: external change away and back to a previously-emitted config must rebuild', () => {
    const g = new ConfigEchoGuard();
    g.noteEmitted(A); // we emitted A
    expect(g.shouldRebuild(A)).toBe(false); // its echo: correctly skipped

    expect(g.shouldRebuild(B)).toBe(true); // external change to B: rebuilt (baseline must advance to B)

    // External revert to exactly A. The old inline logic still held A as the
    // baseline here and skipped this — leaving stale B-derived editor state.
    expect(g.shouldRebuild(A)).toBe(true);
  });

  it('an identical external config arriving twice only rebuilds once', () => {
    const g = new ConfigEchoGuard();
    expect(g.shouldRebuild(B)).toBe(true);
    expect(g.shouldRebuild(B)).toBe(false); // baseline advanced on the rebuild
  });

  it('reset() forgets the baseline (config removed, then re-set to the same value)', () => {
    const g = new ConfigEchoGuard();
    g.noteEmitted(A);
    g.reset();
    expect(g.shouldRebuild(A)).toBe(true);
  });
});

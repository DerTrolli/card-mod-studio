/**
 * Small follow-ups: the two-step buttons stay armed for 8 s, an armed panel
 * removed from the page stops its guard, and a preset saved with Font on only
 * for Number size stores Font off.
 */
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import { ArmGuard, DISARM_MS } from '../src/utils/arm-guard.js';
import { presetFont, filterPresetStateForCardType } from '../src/utils/preset-caps.js';
import { DEFAULT_FONT } from '../src/parser/state-mapper.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';

afterEach(() => vi.useRealTimers());

describe('ArmGuard timeout', () => {
  it('stays armed for 8 seconds, then disarms', () => {
    vi.useFakeTimers();
    const onDisarm = vi.fn();
    const g = new ArmGuard(onDisarm);
    g.start();
    expect(DISARM_MS).toBe(8000);
    vi.advanceTimersByTime(7999);
    expect(onDisarm).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDisarm).toHaveBeenCalledTimes(1);
  });
});

describe('panel removed while a delete is armed', () => {
  const registry = new FakeCustomElementRegistry();
  (globalThis as { customElements: unknown }).customElements = registry;
  registry.define('card-mod', class {});
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
  type P = { _deleteGuard: ArmGuard; disconnectedCallback(): void };
  let Panel: new () => P;
  beforeAll(async () => {
    await import('../src/editor/cms-panel.js');
    Panel = registry.get('cms-panel') as new () => P;
  });
  it('stops the guard (no window listener or timer left behind)', () => {
    vi.useFakeTimers();
    const listeners = new Set<string>();
    (globalThis as { window?: unknown }).window = {
      addEventListener: (t: string) => listeners.add(t),
      removeEventListener: (t: string) => listeners.delete(t),
    };
    const p = new Panel();
    const stop = vi.spyOn(p._deleteGuard, 'stop');
    p._deleteGuard.start();
    p.disconnectedCallback();
    delete (globalThis as { window?: unknown }).window;
    expect(stop).toHaveBeenCalled();
    expect(listeners.has('pointerdown')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('a preset saved from a gauge / thermostat', () => {
  const font = (o: object) => ({ ...DEFAULT_FONT, ...o });
  it('Font on only because of Number size → stored Font off, Number size cleared', () => {
    const f = presetFont(font({ enabled: true, numberSizeEnabled: true, numberSize: 120 }));
    expect(f.enabled).toBe(false);
    expect(f.numberSizeEnabled).toBe(false);
    expect(f.numberSize).toBe(0);
  });
  it('Font with its own settings stays on (only the Number size goes)', () => {
    const f = presetFont(font({ enabled: true, fontSize: 18, numberSizeEnabled: true, numberSize: 120 }));
    expect(f).toMatchObject({ enabled: true, fontSize: 18, numberSizeEnabled: false, numberSize: 0 });
    expect(presetFont(font({ enabled: true, fontWeight: 'bold', numberSizeEnabled: true, numberSize: 9 })).enabled).toBe(true);
  });
  it('Font on with nothing set and no Number size is left as the user had it', () => {
    expect(presetFont(font({ enabled: true })).enabled).toBe(true);
  });
  it('loading a stored preset with the old shape also ends up Font off', () => {
    const s = mapToStudioState(parseCardModConfig({ type: 'gauge' }), 'gauge');
    const old = { ...s, font: font({ enabled: true, numberSizeEnabled: true, numberSize: 120 }) };
    expect(filterPresetStateForCardType(old, 'gauge').font.enabled).toBe(false);
  });
});

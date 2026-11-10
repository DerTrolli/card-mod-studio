/**
 * A vertical swipe that starts on a slider must not change its value (HA's
 * slider jumps to the touch on pointer-down and commits on cancel). Driven
 * with a minimal event root: capture listeners run first, and an event the
 * guard stops never reaches the "module" listeners standing in for the
 * slider's @input / @change handlers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { guardSliderTouch, moduleStyles } from '../src/modules/module-base.js';

type Ev = { type: string; pointerType?: string; pointerId?: number; clientX?: number; clientY?: number;
  composedPath: () => unknown[]; stopped: boolean; stopPropagation(): void };

function setup() {
  const slider = { localName: 'ha-slider', value: 300 };
  const capture: Record<string, Array<(e: Ev) => void>> = {};
  const root = {
    addEventListener: (t: string, fn: (e: Ev) => void, c: boolean) => { if (c) (capture[t] ??= []).push(fn); },
  };
  const reached: string[] = [];
  const send = (type: string, init: Partial<Ev> = {}, sliderValue?: number) => {
    const e: Ev = { type, composedPath: () => [slider], stopped: false, stopPropagation() { this.stopped = true; }, ...init };
    if (sliderValue !== undefined) slider.value = sliderValue; // the slider moves itself before it emits
    for (const fn of capture[type] ?? []) fn(e);
    if (!e.stopped && (type === 'input' || type === 'change')) reached.push(`${type}:${slider.value}`);
    return e;
  };
  guardSliderTouch(root as unknown as EventTarget);
  return { slider, send, reached };
}
const touch = (x: number, y: number) => ({ pointerType: 'touch', pointerId: 1, clientX: x, clientY: y });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('slider touch guard', () => {
  it('a vertical swipe changes nothing and puts the slider back', () => {
    const { slider, send, reached } = setup();
    send('pointerdown', touch(100, 100));
    send('input', {}, 1800); // the slider jumps to the touch
    send('pointermove', touch(101, 120));
    send('pointercancel', touch(101, 120)); // the browser took the touch to scroll
    send('change');
    vi.runAllTimers();
    expect(reached).toEqual([]);
    expect(slider.value).toBe(300);
  });

  it('a vertical move that ends in pointerup (nothing scrolled) is ignored the same way', () => {
    const { slider, send, reached } = setup();
    send('pointerdown', touch(100, 100));
    send('input', {}, 1800);
    send('pointermove', touch(100, 130));
    send('pointerup', touch(100, 130));
    send('change');
    vi.runAllTimers();
    expect(reached).toEqual([]);
    expect(slider.value).toBe(300);
  });

  it('a tap sets the value: the change gets through and the slider keeps it', () => {
    const { slider, send, reached } = setup();
    send('pointerdown', touch(100, 100));
    send('input', {}, 1000);
    send('pointerup', touch(100, 100));
    send('change');
    vi.runAllTimers();
    expect(reached).toEqual(['change:1000']);
    expect(slider.value).toBe(1000);
  });

  it('a horizontal drag reports its values and its change', () => {
    const { slider, send, reached } = setup();
    send('pointerdown', touch(100, 100));
    send('input', {}, 400);
    send('pointermove', touch(130, 102));
    send('input', {}, 900);
    send('pointermove', touch(160, 102));
    send('input', {}, 1500);
    send('pointerup', touch(160, 102));
    send('change');
    vi.runAllTimers();
    expect(reached).toEqual(['input:900', 'input:1500', 'change:1500']);
    expect(slider.value).toBe(1500);
  });

  it('a mouse press and drag is not touched at all', () => {
    const { send, reached } = setup();
    const mouse = { pointerType: 'mouse', pointerId: 1, clientX: 100, clientY: 100 };
    send('pointerdown', mouse);
    send('input', {}, 700);
    send('pointerup', mouse);
    send('change');
    vi.runAllTimers();
    expect(reached).toEqual(['input:700', 'change:700']);
  });

  it('the slider part hands vertical pans to the browser', () => {
    const css = moduleStyles.map((s) => (typeof s === 'string' ? s : (s as { cssText: string }).cssText)).join('\n');
    expect(css).toMatch(/ha-slider::part\(slider\)\s*\{[^}]*touch-action:\s*pan-y/);
  });

  it('every module that renders a slider arms the guard on its root', () => {
    const dir = new URL('../src/modules/', import.meta.url);
    const withSlider = readdirSync(dir).filter((f) => f.endsWith('.ts') && readFileSync(new URL(f, dir), 'utf8').includes('<ha-slider'));
    expect(withSlider.length).toBeGreaterThanOrEqual(9);
    for (const f of withSlider) expect(readFileSync(new URL(f, dir), 'utf8'), f).toContain('guardSliderTouch(this.renderRoot)');
  });
});

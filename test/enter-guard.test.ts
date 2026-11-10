/**
 * Enter in a Studio field must not reach Home Assistant's edit dialog (older
 * HA saves the card on Enter, before the field's `change` has committed).
 *
 * No DOM here, so the event path is simulated: a node list from the original
 * target up to the "dialog", with composedPath/stopPropagation behaving like
 * a bubbling dispatch. The wiring (panel host, colour-picker portal) is
 * checked on the real classes.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { FakeCustomElementRegistry } from './v010-audit-helpers.js';
import { fakeInput, tplFind } from './ui-template.js';
import { keepEnterInStudio } from '../src/utils/enter-guard.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };

type Listener = (e: KeyboardEvent) => void;
interface Node_ { tagName?: string; type?: string; classList?: { contains(c: string): boolean };
  isContentEditable?: boolean; listeners: Listener[] }
const node = (tagName: string, extra: Partial<Node_> = {}): Node_ => ({ tagName, listeners: [], ...extra });

/** Bubbles a composed keydown through `path` (target first); returns the nodes that saw it. */
function dispatch(key: string, path: Node_[]): { seen: Node_[]; prevented: boolean } {
  let stopped = false;
  let prevented = false;
  const ev = { key, composedPath: () => path, stopPropagation: () => { stopped = true; },
    preventDefault: () => { prevented = true; } } as unknown as KeyboardEvent;
  const seen: Node_[] = [];
  for (const n of path) {
    if (stopped) break;
    seen.push(n);
    n.listeners.forEach((l) => l(ev));
  }
  return { seen, prevented };
}

/** target … nested shadow hosts … panel (guard) … HA dialog (the save listener). */
function studioPath(target: Node_, guardOnPanel = true) {
  const panel = node('CMS-PANEL');
  if (guardOnPanel) panel.listeners.push(keepEnterInStudio);
  const dialog = node('HA-DIALOG');
  let saved = 0;
  dialog.listeners.push((e) => { if (e.key === 'Enter') saved++; });
  return { path: [target, node('CMS-THRESHOLD-MODULE'), node('DIV'), panel, dialog], saves: () => saved };
}

const FIELDS: Array<[string, () => Node_]> = [
  ['text input (hex / rule value / condition / row rule / name)', () => node('INPUT', { type: 'text' })],
  ['input without a type attribute', () => node('INPUT')],
  ['number input', () => node('INPUT', { type: 'number' })],
  ['colour input', () => node('INPUT', { type: 'color' })],
  ['native select', () => node('SELECT')],
  ['textarea', () => node('TEXTAREA')],
  ['entity picker search field', () => node('INPUT', { type: 'search' })],
  ['code editor content (contenteditable)', () => node('DIV', { isContentEditable: true })],
  ['code editor host behind a closed root', () => node('HA-CODE-EDITOR')],
];

describe('Enter from a Studio field never reaches the dialog', () => {
  it.each(FIELDS)('%s', (_n, make) => {
    const { path, saves } = studioPath(make());
    const r = dispatch('Enter', path);
    expect(saves()).toBe(0);
    expect(r.prevented).toBe(false); // the browser default (commit, newline, open select) must survive
    expect(r.seen.includes(path[0])).toBe(true); // the field itself still got it
  });

  it('control: without the guard the dialog does see it (the bug)', () => {
    const { path, saves } = studioPath(node('INPUT', { type: 'text' }), false);
    dispatch('Enter', path);
    expect(saves()).toBe(1);
  });
});

describe('what is left alone', () => {
  it.each([
    ['module header (role=button div)', () => node('DIV')],
    ['button', () => node('BUTTON')],
    ['checkbox / switch input', () => node('INPUT', { type: 'checkbox' })],
  ])('Enter on %s is not stopped here', (_n, make) => {
    const { path, saves } = studioPath(make());
    dispatch('Enter', path);
    expect(saves()).toBe(1);
  });

  it.each(['Escape', ' ', 'a', 'Tab'])('%j from a text field is untouched', (key) => {
    const { path, saves } = studioPath(node('INPUT', { type: 'text' }));
    const r = dispatch(key, path);
    expect(r.seen).toHaveLength(path.length);
    expect(saves()).toBe(0); // dialog listener only counts Enter; it still ran
    expect(r.prevented).toBe(false);
  });

  it('the code editor still receives Enter first (newline is typed)', () => {
    const cm = node('DIV', { isContentEditable: true });
    let got = false;
    cm.listeners.push((e) => { got = e.key === 'Enter'; });
    const { path } = studioPath(cm);
    dispatch('Enter', path);
    expect(got).toBe(true);
  });
});

// ---- wiring ----------------------------------------------------------------

describe('panel', () => {
  let Panel: new () => { connectedCallback(): void; disconnectedCallback(): void;
    addEventListener: unknown; removeEventListener: unknown };
  beforeAll(async () => {
    await import('../src/editor/cms-panel.js');
    Panel = registry.get('cms-panel') as typeof Panel;
  });

  it('listens for keydown on its host while connected, and stops listening after', async () => {
    const p = new Panel();
    (p as unknown as { performUpdate: () => void }).performUpdate = () => {}; // no DOM to render into
    (globalThis as { window?: unknown }).window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
    const added: Array<[string, unknown]> = [];
    const removed: Array<[string, unknown]> = [];
    p.addEventListener = (t: string, l: unknown) => added.push([t, l]);
    p.removeEventListener = (t: string, l: unknown) => removed.push([t, l]);
    p.connectedCallback();
    p.disconnectedCallback();
    await new Promise((r) => setTimeout(r, 5)); // let the palette init settle while window exists
    delete (globalThis as { window?: unknown }).window;
    expect(added).toContainEqual(['keydown', keepEnterInStudio]);
    expect(removed).toContainEqual(['keydown', keepEnterInStudio]);
  });
});

describe('colour picker popover portal', () => {
  const g = globalThis as { document?: unknown; getComputedStyle?: unknown };
  afterEach(() => { delete g.document; delete g.getComputedStyle; });

  it('the portal host (outside the panel subtree) carries the guard', async () => {
    (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class {};
    await import('../src/components/cms-color-picker.js');
    const Picker = registry.get('cms-color-picker') as new () => { _ensurePortal(): unknown };
    const host = { style: {} as Record<string, string>, listeners: [] as Array<[string, unknown]>,
      attachShadow: () => ({}), addEventListener(t: string, l: unknown) { this.listeners.push([t, l]); } };
    g.document = { createElement: () => host, body: { appendChild() {} } };
    g.getComputedStyle = () => ({ colorScheme: '' });
    new Picker()._ensurePortal();
    expect(host.listeners).toContainEqual(['keydown', keepEnterInStudio]);
  });
});

// ---- the value is committed on Enter (browser fires `change` after keydown) --

describe('Enter commits through the same change handler as blur', () => {
  it('threshold rule value', async () => {
    await import('../src/modules/module-threshold.js');
    const { DEFAULT_THRESHOLD } = await import('../src/parser/state-mapper.js');
    type M = { state: unknown; dispatchEvent(e: Event): boolean; _renderRule(r: unknown, i: number): unknown };
    const m = new (registry.get('cms-threshold-module') as new () => M)();
    const r = { id: 'r1', operator: '<', value: 0, color: '#ff0000' };
    m.state = { ...DEFAULT_THRESHOLD, rules: [r] };
    const out: Array<{ rules: Array<{ value: number }> }> = [];
    (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class {};
    m.dispatchEvent = ((e: Event) => { out.push((e as unknown as CustomEvent).detail); return true; });
    const field = tplFind(m._renderRule(r, 0), 'aria-label=Rule 1 value', m);
    const input = fakeInput('20');
    // keydown first (guard), then the browser's default action: change.
    const { path, saves } = studioPath(node('INPUT', { type: 'text' }));
    dispatch('Enter', path);
    field.on.change(input);
    expect(saves()).toBe(0);
    expect(out.at(-1)!.rules[0].value).toBe(20);
  });
});

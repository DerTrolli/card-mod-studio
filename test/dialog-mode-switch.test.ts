/**
 * "Show code editor" while the Studio is open: the Studio covers both
 * editors, so the switch looked dead. The injector closes the Studio when the
 * dialog's `_GUImode` really changes (read from Lit's changed-properties map,
 * never from the translated button label).
 */
import { describe, it, expect } from 'vitest';
import { closeStudioOnModeSwitch } from '../src/editor/cms-injector.js';

function fakeDialog(opts: { active: boolean; gui: boolean }) {
  const tab = { active: opts.active };
  const panel = { style: { display: '' } };
  const cardEditor = {
    toggled: [] as Array<[string, boolean]>,
    toggleAttribute(n: string, f: boolean) { this.toggled.push([n, f]); },
    shadowRoot: { getElementById: () => panel },
  };
  const dialogRoot = {
    querySelector: (sel: string) => (sel.includes('data-cms-injected') ? tab : cardEditor),
    getElementById: () => ({}), // the cover <style> already exists
  };
  const dialog = { _GUImode: opts.gui, shadowRoot: dialogRoot } as unknown as Parameters<typeof closeStudioOnModeSwitch>[0];
  return { dialog, tab, panel, cardEditor };
}
const changed = (prev: unknown) => new Map<PropertyKey, unknown>([['_GUImode', prev]]);

describe('closeStudioOnModeSwitch', () => {
  it('visual -> code editor closes the Studio and un-presses Style', () => {
    const f = fakeDialog({ active: true, gui: false });
    closeStudioOnModeSwitch(f.dialog, changed(true));
    expect(f.tab.active).toBe(false);
    expect(f.panel.style.display).toBe('none');
    expect(f.cardEditor.toggled.at(-1)).toEqual(['data-cms-studio-open', false]);
  });
  it('code -> visual editor closes it too', () => {
    const f = fakeDialog({ active: true, gui: true });
    closeStudioOnModeSwitch(f.dialog, changed(false));
    expect(f.tab.active).toBe(false);
  });
  it('does nothing when the Studio is not open', () => {
    const f = fakeDialog({ active: false, gui: false });
    closeStudioOnModeSwitch(f.dialog, changed(true));
    expect(f.panel.style.display).toBe('');
    expect(f.cardEditor.toggled).toEqual([]);
  });
  it('ignores the first render (no previous value) and unrelated updates', () => {
    const f = fakeDialog({ active: true, gui: true });
    closeStudioOnModeSwitch(f.dialog, changed(undefined));
    closeStudioOnModeSwitch(f.dialog, new Map([['_cardConfig', {}]]));
    closeStudioOnModeSwitch(f.dialog, changed(true)); // same value: not a switch
    expect(f.tab.active).toBe(true);
    expect(f.panel.style.display).toBe('');
  });
});

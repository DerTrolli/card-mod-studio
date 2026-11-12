/**
 * Shared "not set" UI helpers: renderResetButton, renderDefaultOption and the
 * opt-in `clearable` colour picker.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { renderResetButton, renderDefaultOption } from '../src/modules/module-base.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

describe('renderResetButton / renderDefaultOption', () => {
  it('the reset button is a named, keyboard-reachable <button>', () => {
    const t = templateText(renderResetButton(() => {}));
    expect(t).toContain('<button');
    expect(t).toContain('type="button"');
    expect(t).toContain('aria-label=');
  });
  it('clicking the reset button calls onClick', () => {
    let calls = 0;
    const r = renderResetButton(() => { calls++; }) as unknown as { values: unknown[] };
    const click = r.values.find((v) => typeof v === 'function') as () => void;
    expect(click).toBeTypeOf('function');
    click();
    expect(calls).toBe(1);
  });
  it('a custom reset label is used as the accessible name', () => {
    const r = renderResetButton(() => {}, 'Reset text size') as unknown as { values: unknown[] };
    expect(r.values).toContain('Reset text size');
  });
  it('the Default option has the empty value and names the native value', () => {
    expect(templateText(renderDefaultOption(true))).toContain('Default');
    const r = renderDefaultOption(false, 'medium') as unknown as { values: unknown[] };
    expect(r.values).toContain('Default (medium)');
    expect(templateText(renderDefaultOption(false))).toContain('value=""');
  });
});

describe('cms-color-picker clearable', () => {
  type Picker = {
    value: string; clearable: boolean; placeholder: string; placeholderColor: string;
    _renderPickerBody(): unknown; _onClear(): void; _onTextChange(e: Event): void; dispatchEvent(e: Event): boolean;
  };
  let Picker: new () => Picker;
  beforeAll(async () => {
    (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
      constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
    await import('../src/components/cms-color-picker.js');
    Picker = registry.get('cms-color-picker') as new () => Picker;
  });

  it('a normal picker has no clear button (the 50+ other usages are untouched)', () => {
    const p = new Picker();
    p.value = '#ff0000';
    expect(templateText(p._renderPickerBody())).not.toContain('class="clear"');
  });
  it('clearable + set value shows a named clear button', () => {
    const p = new Picker();
    p.clearable = true;
    p.value = '#ff0000';
    const t = templateText(p._renderPickerBody());
    expect(t).toContain('class="clear"');
    expect(t).toContain('aria-label="Reset color to default"');
  });
  it('clearable + unset shows no clear button and a Default placeholder', () => {
    const p = new Picker();
    p.clearable = true;
    p.value = '';
    const t = templateText(p._renderPickerBody());
    expect(t).not.toContain('class="clear"');
    expect(templateText(p._renderPickerBody())).toContain('Default');
  });
  it('clearing emits color-changed with an empty value', () => {
    const p = new Picker();
    p.clearable = true;
    p.value = '#ff0000';
    const seen: unknown[] = [];
    p.dispatchEvent = ((e: Event) => { seen.push((e as unknown as CustomEvent).detail); return true; });
    p._onClear();
    expect(seen).toEqual([{ value: '' }]);
    expect(p.value).toBe('');
  });

  it('whitespace-only text on a clearable picker emits an empty value', () => {
    const p = new Picker();
    p.clearable = true;
    const seen: unknown[] = [];
    p.dispatchEvent = ((e: Event) => { seen.push((e as unknown as CustomEvent).detail); return true; });
    const input = { value: '   ' };
    p._onTextChange({ target: input } as unknown as Event);
    expect(seen).toEqual([{ value: '' }]);
    expect(input.value).toBe('');
    p._onTextChange({ target: { value: '  red ' } } as unknown as Event);
    expect(seen[1]).toEqual({ value: 'red' });
  });
  it('a normal picker trims its text (it used to pass it through verbatim)', () => {
    const p = new Picker();
    const seen: unknown[] = [];
    p.dispatchEvent = ((e: Event) => { seen.push((e as unknown as CustomEvent).detail); return true; });
    p._onTextChange({ target: { value: ' red ' } } as unknown as Event);
    expect(seen).toEqual([{ value: 'red' }]);
  });
  it('the clear button has a focus ring like the reset button', () => {
    const src = readFileSync(new URL('../src/components/cms-color-picker.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/\.clear:focus-visible\s*\{[^}]*outline/);
  });
});

describe('unset label width', () => {
  it('the unset label and the set label + reset button are the same width (no slider jump)', () => {
    const src = readFileSync(new URL('../src/modules/module-base.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/\.value-label\.unset\s*\{[^}]*min-width:\s*80px/);
    expect(src).toMatch(/:has\(\+ \.reset-btn\)\s*\{[^}]*min-width:\s*48px/);
    expect(src).toMatch(/white-space:\s*nowrap/);
  });
});

/**
 * module-base.ts — shared Lit CSS + helpers for all visual module components.
 */

import { css, html, nothing } from 'lit';
import type { TemplateResult } from 'lit';
import type { HomeAssistant, StyleCondition } from '../types/index.js';
import '../components/cms-entity-picker.js';
import { TOGGLE_DOMAINS } from '../components/cms-entity-picker.js';
import type { OwnStateKind } from '../utils/card-caps.js';
import { commitNumberInput, markNumberInput, revertNumberInput } from '../utils/number-input.js';

/**
 * Theme-aware design tokens shared by every module (and re-declared on
 * cms-panel's :host). All derive from HA's own theme variables via
 * color-mix(), so they adapt to light mode, dark mode and custom themes:
 *
 * - `--cms-ink-*`: text in a semantic colour, pulled toward the theme's
 *   text colour so it keeps >= 4.5:1 contrast on its own tint in BOTH
 *   modes (raw #2196f3 / #ff9800 / #ff6b6b text on a 12-15% tint of itself
 *   measured 1.7-2.8:1 on light themes).
 * - `--cms-tint-*`: soft semantic fills.
 * - `--cms-fill` / `--cms-fill-hover`: neutral overlays (a white-alpha
 *   overlay is invisible on a light card).
 * If color-mix() is unsupported the declarations using these become
 * invalid at computed-value time and fall back to inherited / transparent
 * values, which stay readable.
 */
export const cmsTokens = css`
  :host {
    --cms-ink-primary: color-mix(in srgb, var(--primary-color, #03a9f4) 50%, var(--primary-text-color, #212121));
    --cms-ink-error: color-mix(in srgb, var(--error-color, #db4437) 62%, var(--primary-text-color, #212121));
    --cms-ink-warning: color-mix(in srgb, var(--warning-color, #ffa600) 40%, var(--primary-text-color, #212121));
    --cms-tint-primary: color-mix(in srgb, var(--primary-color, #03a9f4) 13%, transparent);
    --cms-tint-primary-hover: color-mix(in srgb, var(--primary-color, #03a9f4) 22%, transparent);
    --cms-tint-error: color-mix(in srgb, var(--error-color, #db4437) 11%, transparent);
    --cms-tint-error-hover: color-mix(in srgb, var(--error-color, #db4437) 20%, transparent);
    --cms-tint-warning: color-mix(in srgb, var(--warning-color, #ffa600) 13%, transparent);
    --cms-line-primary: color-mix(in srgb, var(--primary-color, #03a9f4) 45%, transparent);
    --cms-line-error: color-mix(in srgb, var(--error-color, #db4437) 40%, transparent);
    --cms-fill: color-mix(in srgb, var(--primary-text-color, #212121) 4%, transparent);
    --cms-fill-hover: color-mix(in srgb, var(--primary-text-color, #212121) 8%, transparent);
    --cms-outline: color-mix(in srgb, var(--primary-text-color, #212121) 22%, transparent);
  }
`;

export const moduleStyles = [
  cmsTokens,
  css`
  :host {
    display: block;
  }

  .module {
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 12px;
  }

  .module-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    min-height: 44px;
    box-sizing: border-box;
    padding: 6px 14px;
    background: var(--cms-fill);
    cursor: pointer;
    user-select: none;
    transition: background 0.15s ease;
  }

  .module-header:hover {
    background: var(--cms-fill-hover);
  }

  .module-header:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: -2px;
  }

  /* Text kept for assistive technology only (names the control it sits in). */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  /* HA's switch (2026.x) indents its label slot by .5em even when the
     slotted text is the screen-reader-only name above. */
  ha-switch::part(label) {
    margin-inline-start: 0;
  }
  /* HA's slider (2026.x) takes its name from a label part it would show
     above the track; the row already shows the label, so keep the part out
     of the layout (a hidden part still names the slider) and give back the
     track's own offset that the part's presence replaces. */
  ha-slider::part(label) {
    display: none;
  }
  ha-slider::part(slider) {
    margin-block-start: -14px;
    /* The slider's own touch-action is "none", so a vertical swipe that
       starts on it neither scrolls the panel nor stays a no-op (it moves the
       value): hand vertical pans back to the browser. See guardSliderTouch. */
    touch-action: pan-y;
  }

  /* Header whose button and switch are siblings (renderModuleHeader): the
     button takes over the bar's padding so the whole bar still toggles. */
  .module-header.has-toggle {
    padding: 0 14px 0 0;
    gap: 0;
    cursor: default;
  }
  .module-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    align-self: stretch;
    box-sizing: border-box;
    min-height: 44px;
    padding: 6px 6px 6px 14px;
    cursor: pointer;
  }
  .module-toggle:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: -2px;
  }

  .module-chevron {
    font-size: 10px;
    color: var(--secondary-text-color, #727272);
    width: 14px;
    flex-shrink: 0;
  }

  .module-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
    flex: 1;
    min-width: 0;
  }

  .module-body {
    padding: 12px 14px;
    border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* Label + control. Labels share one fixed-width column so every control
     in a module starts at the same left edge (auto-width labels staggered
     them row by row). Wraps onto two lines (control under its label) once
     the column gets too narrow for both — stack children, very narrow
     panels — instead of squeezing or clipping the control. */
  .control-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    min-height: 36px;
    gap: 6px 10px;
  }

  .control-label {
    font-size: 12px;
    line-height: 1.3;
    color: var(--secondary-text-color, #727272);
    flex: 0 0 var(--cms-label-width, 108px);
    min-width: 0;
  }

  .control-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 150px;
    min-width: 0;
    justify-content: flex-start;
  }

  ha-slider {
    flex: 1;
    min-width: 100px;
  }

  .value-label {
    font-size: 11px;
    color: var(--secondary-text-color, #727272);
    min-width: 36px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* Native colour inputs: Chromium/Firefox draw their own rectangular swatch
     inside the box — strip it so the round control is actually round. */
  input[type='color'] {
    -webkit-appearance: none;
    appearance: none;
    box-sizing: border-box;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 0;
    box-shadow: inset 0 0 0 1px var(--cms-outline);
    cursor: pointer;
    padding: 0;
    background: none;
    flex-shrink: 0;
    overflow: hidden;
  }
  input[type='color']::-webkit-color-swatch-wrapper { padding: 0; }
  input[type='color']::-webkit-color-swatch { border: 0; border-radius: 50%; }
  input[type='color']::-moz-color-swatch { border: 0; border-radius: 50%; }

  .color-label {
    font-size: 11px;
    color: var(--secondary-text-color, #727272);
    font-family: monospace;
  }

  /* Native form controls — styled explicitly (theme colours, HA font) so
     none of them renders as an OS-default white box on a dark theme. */
  select,
  input[type='text'],
  input[type='number'] {
    box-sizing: border-box;
    min-height: 32px;
    font: inherit;
    font-size: 12px;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #212121);
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    border-radius: 4px;
    padding: 6px 8px;
  }
  select {
    cursor: pointer;
    width: 100%;
    /* Long option text in a narrow column (stack children on phones)
       ends in "…" instead of being cut mid-letter. */
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }
  input[type='text'] {
    width: 100%;
  }
  input[type='number'],
  input.num {
    width: 84px;
    min-width: 0;
  }
  /* Invalid number: dashed border as well as colour, plus aria-invalid. */
  input[aria-invalid='true'] {
    border: 1px dashed var(--cms-line-error);
    background: var(--cms-tint-error);
    color: var(--cms-ink-error);
  }
  select:focus-visible,
  input[type='text']:focus-visible,
  input[type='number']:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: 1px;
  }
  button {
    font-family: inherit;
  }
  button:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: 2px;
  }

  /* Shared action buttons ("+ Add …" / delete). */
  .btn-add {
    background: var(--cms-tint-primary);
    border: 1px dashed var(--cms-line-primary);
    border-radius: 4px;
    color: var(--cms-ink-primary);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    padding: 7px;
    width: 100%;
  }
  .btn-add:hover {
    background: var(--cms-tint-primary-hover);
  }
  .btn-danger {
    background: var(--cms-tint-error);
    border: 1px solid var(--cms-line-error);
    border-radius: 4px;
    color: var(--cms-ink-error);
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    min-width: 28px;
    min-height: 28px;
    padding: 4px 8px;
    flex-shrink: 0;
  }
  .btn-danger:hover {
    background: var(--cms-tint-error-hover);
  }

  /* Shared "Apply when" hint + custom-entity input (see renderWhen). */
  .when-hint {
    font-size: 11px;
    line-height: 1.4;
    color: var(--secondary-text-color, #727272);
  }
  .when-hint.warn {
    color: var(--cms-ink-warning);
  }

  /* "Custom CSS is overriding this control" — see style-conflicts.ts. */
  .override-badge {
    font-size: 13px;
    margin-right: 6px;
    flex-shrink: 0;
    cursor: help;
  }
  .override-hint {
    font-size: 11px;
    line-height: 1.5;
    color: var(--primary-text-color, #212121);
    background: var(--cms-tint-warning);
    border: 1px solid var(--warning-color, #ffa600);
    border-radius: 4px;
    padding: 6px 8px;
  }
  .override-hint code {
    font-size: 11px;
  }

  /* Touch screens: every control gets at least a 40x40px hit area. Fields
     and buttons that already have a box grow a little; small round or inline
     controls keep their look and take an invisible extension instead. */
  @media (pointer: coarse) {
    select,
    input[type='text'],
    input[type='number'] {
      min-height: 40px;
    }
    .btn-danger {
      min-width: 40px;
      min-height: 40px;
    }
    .btn-add {
      min-height: 40px;
    }
    .reset-btn {
      position: relative;
    }
    .reset-btn::after {
      content: '';
      position: absolute;
      inset: -9px;
    }
    /* HA's switch draws a 40px touch area itself (2026.x); say so explicitly. */
    ha-switch {
      --ha-switch-min-touch-size: 40px;
    }
  }

  /* "Not set" affordances (see renderResetButton / renderDefaultOption). */
  /* The unset label ("Default (14px)") and the set one (value + reset
     button) take the same width, so the slider doesn't jump when a drag
     flips between them: 80 = 48 + 8 gap + 24 button. */
  .value-label.unset,
  .value-label:has(+ .reset-btn) {
    white-space: nowrap;
  }
  .value-label.unset {
    min-width: 80px;
    font-style: italic;
    opacity: 0.8;
  }
  .value-label:has(+ .reset-btn) {
    min-width: 48px;
  }
  .reset-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    padding: 0;
    font: inherit;
    font-size: 14px;
    line-height: 1;
    color: var(--secondary-text-color, #727272);
    background: none;
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    border-radius: 50%;
    cursor: pointer;
  }
  .reset-btn:hover {
    background: var(--cms-fill-hover);
  }
  .reset-btn:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: 1px;
  }
`,
];

/**
 * "Not set" support for controls whose property is optional (undefined =
 * the card keeps its native value; nothing is written to the style).
 *
 * Sliders: while unset, show the native value as a neutral placeholder
 * (`<span class="value-label unset">Default (16px)</span>`), emit only on
 * the user's own `@change`, and once set follow the label with this button.
 * It sits on the control's existing line (inside `.control-right`) and
 * `onClick` should emit the field as `undefined`.
 * Colour pickers use `<cms-color-picker clearable>` instead.
 */
export function renderResetButton(
  onClick: () => void,
  label = 'Reset to default',
): TemplateResult {
  return html`<button
    type="button"
    class="reset-btn"
    aria-label=${label}
    title=${label}
    @click=${onClick}
  >↺</button>`;
}

/**
 * First option of a `<select>` whose property is optional: value `''` means
 * "not set"; handlers map it to `undefined`. `native` names the card's own
 * value, e.g. `renderDefaultOption(!weight, 'medium')` → "Default (medium)".
 */
export function renderDefaultOption(selected: boolean, native = ''): TemplateResult {
  return html`<option value="" ?selected=${selected}>${native ? `Default (${native})` : 'Default'}</option>`;
}

/** The pending observer per editor and the name it should apply. */
const pendingNames = new WeakMap<Element, { mo: MutationObserver; name: string }>();

/**
 * Names the text box inside HA's code editor. `ha-code-editor` (2026.x) takes
 * no label and its `.cm-content` role=textbox stays unnamed, so the name is
 * set on that node once CodeMirror has created it (it may not exist yet at the
 * first render). The editor's shadow root is open, so this needs no HA API.
 * At most one observer per editor, gone once the node has its name.
 */
export function nameCodeEditor(editor: Element, name: string): void {
  const root = editor.shadowRoot;
  if (!root) return;
  const apply = (n: string): boolean => {
    const box = root.querySelector('.cm-content');
    if (!box) return false;
    if (box.getAttribute('aria-label') !== n) box.setAttribute('aria-label', n);
    return true;
  };
  // updated() calls this on every render: keep one observer per editor.
  const waiting = pendingNames.get(editor);
  if (waiting) {
    waiting.name = name;
    if (apply(name)) { waiting.mo.disconnect(); pendingNames.delete(editor); }
    return;
  }
  if (apply(name) || typeof MutationObserver === 'undefined') return;
  const entry = { mo: undefined as unknown as MutationObserver, name };
  entry.mo = new MutationObserver(() => {
    if (apply(entry.name)) { entry.mo.disconnect(); pendingNames.delete(editor); }
  });
  pendingNames.set(editor, entry);
  entry.mo.observe(root, { childList: true, subtree: true });
}

/**
 * Keyboard support for the collapsible headers (module / child / row):
 * they're `role="button" tabindex="0"` divs, so Enter / Space must toggle
 * them like a click. Only a key pressed on the header itself counts; the
 * enable switch is a SIBLING (see renderModuleHeader), so its keys never
 * arrive here, and anything else focusable inside is left alone.
 */
export function onHeaderKeydown(e: KeyboardEvent): void {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    (e.currentTarget as HTMLElement).click();
  }
}

export interface ModuleHeaderOptions {
  icon: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  /** Advanced CSS is overriding this module (warning badge). */
  overridden?: boolean;
  /** The module's on/off switch; omitted for modules that have none. */
  enable?: { checked: boolean; onChange: (checked: boolean) => void };
}

/** Id of the module's body, which the header button controls. */
export const MODULE_BODY_ID = 'module-body';

/**
 * The collapsible header every module shares. The expand/collapse button
 * covers the chevron, title and badge; the enable switch is its SIBLING, not
 * a descendant (an interactive control inside a button is read badly by
 * assistive technology). The decorative chevron and emoji are hidden from the
 * button's name, so it reads "Font". The switch is named "Enable <title>"
 * from the same text.
 */
export function renderModuleHeader(o: ModuleHeaderOptions): TemplateResult {
  const name = `Enable ${o.title}`;
  return html`
    <div class="module-header has-toggle">
      <div
        class="module-toggle"
        role="button"
        tabindex="0"
        aria-expanded=${o.open ? 'true' : 'false'}
        aria-controls=${o.open ? MODULE_BODY_ID : nothing}
        @click=${() => o.onToggle()}
        @keydown=${onHeaderKeydown}
      >
        <span class="module-chevron" aria-hidden="true">${o.open ? '▼' : '▶'}</span>
        <span class="module-title"><span><span aria-hidden="true">${o.icon}</span> ${o.title}</span></span>
        ${renderOverrideBadge(o.overridden ?? false)}
      </div>
      ${o.enable
        ? html`<ha-switch
            aria-label=${name}
            .checked=${o.enable.checked}
            @change=${(e: Event) => o.enable!.onChange((e.target as HTMLInputElement).checked)}
          ><span class="sr-only">${name}</span></ha-switch>`
        : nothing}
    </div>
  `;
}

const guardedRoots = new WeakSet<object>();

/**
 * Keeps a vertical swipe that starts on a slider from changing its value.
 *
 * HA's slider (2026.x) sets its value on pointer-down and commits it when the
 * gesture ends; once the browser takes a touch for scrolling (see the
 * `touch-action: pan-y` rule above) it sends pointercancel, but the slider
 * still fires `change` with the jumped value. So for TOUCH pointers only, the
 * module root watches the gesture in the capture phase: while it is undecided
 * (or turned vertical, or was cancelled) the slider's `input` / `change` never
 * reach the module and the slider is put back to the value it had. A tap or a
 * mostly-horizontal drag passes through unchanged; mouse, pen and keyboard are
 * not touched. Reads only standard pointer events plus the slider's `value`.
 */
export function guardSliderTouch(root: EventTarget): void {
  if (guardedRoots.has(root)) return;
  guardedRoots.add(root);

  type Slider = HTMLElement & { value: unknown };
  interface Gesture {
    id: number;
    x: number;
    y: number;
    slider: Slider;
    v0: unknown;
    mode: 'pending' | 'horizontal' | 'vertical' | 'tap' | 'cancelled';
  }
  let g: Gesture | undefined;

  const sliderOf = (e: Event): Slider | undefined =>
    (e.composedPath?.() ?? []).find((n) => (n as Element).localName === 'ha-slider') as Slider | undefined;
  const on = (type: string, fn: (e: PointerEvent) => void) =>
    root.addEventListener(type, fn as unknown as EventListener, true);
  /** Forget the gesture once the slider has finished its own end-of-gesture events. */
  const finish = (restore: boolean) => {
    const done = g!;
    setTimeout(() => {
      if (restore) done.slider.value = done.v0;
      if (g === done) g = undefined;
    }, 0);
  };
  const muted = (e: Event) => {
    if (!g || sliderOf(e) !== g.slider) return false;
    return g.mode === 'pending' || g.mode === 'vertical' || g.mode === 'cancelled';
  };

  on('pointerdown', (e) => {
    const slider = e.pointerType === 'touch' ? sliderOf(e) : undefined;
    g = slider ? { id: e.pointerId, x: e.clientX, y: e.clientY, slider, v0: slider.value, mode: 'pending' } : undefined;
  });
  on('pointermove', (e) => {
    if (!g || e.pointerId !== g.id || g.mode !== 'pending') return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.hypot(dx, dy) < 8) return;
    g.mode = Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
  });
  on('pointerup', (e) => {
    if (!g || e.pointerId !== g.id) return;
    if (g.mode === 'pending') g.mode = 'tap';
    if (g.mode === 'vertical') {
      g.mode = 'cancelled';
      finish(true);
    } else finish(false);
  });
  on('pointercancel', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const was = g.mode;
    if (was === 'pending' || was === 'vertical') {
      g.mode = 'cancelled';
      finish(true);
    } else finish(false);
  });
  const swallow = (e: Event) => {
    if (muted(e)) e.stopPropagation();
  };
  root.addEventListener('input', swallow, true);
  root.addEventListener('change', swallow, true);
}

// ---------------------------------------------------------------------------
// Shared conditional ("Apply when") control
// ---------------------------------------------------------------------------

export type WhenValue = 'always' | 'on' | 'off' | 'custom';

export interface WhenControlOptions {
  /** Current stored value (applyWhen / grayscaleWhen / trigger). */
  value: WhenValue;
  /** False when the card's entity has no on/off state (e.g. a sensor). */
  stateAware: boolean;
  /** The entity can be OFF but never ON (climate, water_heater): OFF is
   *  offered, ON is not. Ignored when stateAware. */
  offOnly?: boolean;
  /** Noun used in the hint, e.g. "background", "grayscale", "animation". */
  noun: string;
  /** Offer the "another entity" option. */
  allowCustom?: boolean;
  /** entity_id for the custom trigger. */
  customEntity?: string;
  /** Needed to render a searchable cms-entity-picker instead of a bare text input. */
  hass?: HomeAssistant;
  onChange: (v: WhenValue) => void;
  onCustomEntity?: (id: string) => void;
}

/** Which of the ON / OFF options a condition select offers. A stored on/off
 *  value keeps both visible (never a blank select, never rewritten); an
 *  OFF-only entity offers OFF alone. */
export function offeredOnOff(
  stateAware: boolean,
  offOnly: boolean | undefined,
  hasStoredOnOff: boolean,
): { showOn: boolean; showOff: boolean } {
  return {
    showOn: stateAware || hasStoredOnOff,
    showOff: stateAware || !!offOnly || hasStoredOnOff,
  };
}

function whenHint(v: WhenValue, o: WhenControlOptions): string {
  switch (v) {
    case 'on':
      return `Applies the ${o.noun} only while this card's entity is on (removed when off).`;
    case 'off':
      return `Applies the ${o.noun} only while this card's entity is off (removed when on).`;
    case 'custom':
      return `Applies the ${o.noun} only while ${o.customEntity || 'the chosen entity'} is on.`;
    default:
      return `Always applies the ${o.noun}.`;
  }
}

/**
 * Renders a consistent "Apply when" control across modules. On non-state-aware
 * cards the ON/OFF options are hidden so the user can't pick a condition that
 * never matches — but an existing on/off value is preserved and stays editable,
 * so nothing changes silently. Returns the rows + a plain-language hint.
 */
export function renderWhen(o: WhenControlOptions): TemplateResult {
  const { showOn, showOff } = offeredOnOff(o.stateAware, o.offOnly, o.value === 'on' || o.value === 'off');
  // If "Always" is the only meaningful choice, drop the single-option dropdown.
  const showSelect = showOn || showOff || !!o.allowCustom;

  const opts: Array<{ v: WhenValue; label: string }> = [{ v: 'always', label: 'Always' }];
  if (showOn) opts.push({ v: 'on', label: 'Only while entity is ON' });
  if (showOff) opts.push({ v: 'off', label: 'Only while entity is OFF' });
  if (o.allowCustom) opts.push({ v: 'custom', label: 'While another entity is ON…' });

  return html`
    ${showSelect
      ? html`
          <div class="control-row">
            <span class="control-label" id="when-label">Apply when</span>
            <div class="control-right">
              <select
                aria-labelledby="when-label"
                .value=${o.value}
                @change=${(e: Event) =>
                  o.onChange((e.target as HTMLSelectElement).value as WhenValue)}
              >
                ${opts.map(
                  (opt) =>
                    html`<option value=${opt.v} ?selected=${o.value === opt.v}>
                      ${opt.label}
                    </option>`,
                )}
              </select>
            </div>
          </div>
        `
      : nothing}
    ${o.value === 'custom'
      ? html`
          <div class="control-row">
            <span class="control-label">Entity</span>
            <div class="control-right">
              <cms-entity-picker
                .hass=${o.hass}
                .value=${o.customEntity ?? ''}
                .includeDomains=${TOGGLE_DOMAINS}
                label=""
                accessible-name="Entity to watch"
                placeholder="input_boolean.my_entity"
                @value-changed=${(e: CustomEvent<{ value: string }>) =>
                  o.onCustomEntity?.(e.detail.value.trim())}
              ></cms-entity-picker>
            </div>
          </div>
        `
      : nothing}
    <div class="when-hint">${whenHint(o.value, o)}</div>
  `;
}

/**
 * The hint under "Controlled by" in Icon Color / Accent's ON / OFF (and light)
 * mode — one wording for both modules. Warns (class `warn`) when the card's own
 * entity is what gets watched and it can't be ON.
 */
export function renderWatchHint(o: {
  entityId?: string;
  cardEntity: string;
  kind: OwnStateKind;
}): TemplateResult {
  const { entityId, cardEntity, kind } = o;
  const useless = kind !== 'on-off' && !entityId;
  const text = entityId
    ? cardEntity
      ? `Uses ${entityId}'s on/off state, not this card's own entity.`
      : `Uses ${entityId}'s on/off state.`
    : !useless
    ? "Leave empty to use this card's own entity."
    : !cardEntity
    ? "This card has no entity of its own — pick the entity to watch, or choose One fixed color. Until then no color is written and this choice isn't kept."
    : kind === 'off-only'
    // Anything that isn't "on" takes the OFF branch, so the OFF colour shows in every mode.
    ? `This card's entity (${cardEntity}) is never "on" — the ON colour never shows and the OFF colour shows in every state. Pick another entity, or use Threshold Colors for its modes.`
    : `This card's entity (${cardEntity}) has no on/off state of its own — pick a toggleable entity above, or this mode won't do anything.`;
  return html`<div class="when-hint ${useless ? 'warn' : ''}">${text}</div>`;
}

// ---------------------------------------------------------------------------
// Threshold Colors owns this property
// ---------------------------------------------------------------------------

/**
 * Body note for a module whose property Threshold Colors is currently
 * writing (see thresholdOwnedProperties) — without it the module's switch is
 * on, yet nothing it sets reaches the card.
 */
export function renderThresholdOwnedHint(
  owned: boolean,
  what: string,
  option: string,
): TemplateResult | typeof nothing {
  if (!owned) return nothing;
  return html`<div class="override-hint">
    🎯 <strong>Threshold Colors is setting the ${what}</strong>, so the
    ${what} chosen here isn't used. Untick “${option}” under Threshold Colors
    → Apply to (or turn Threshold Colors off) to use this module again.
  </div>`;
}

// ---------------------------------------------------------------------------
// Shared "Custom CSS is overriding this control" warning (v0.8.1)
// ---------------------------------------------------------------------------

/** Header badge for a module whose output is overridden by Advanced CSS. */
export function renderOverrideBadge(overridden: boolean): TemplateResult | typeof nothing {
  if (!overridden) return nothing;
  return html`<span
    class="override-badge"
    role="img"
    aria-label="Custom CSS in Advanced CSS is currently overriding this control"
    title="Custom CSS in Advanced CSS is currently overriding this control"
  >⚠️</span>`;
}

/** Body hint explaining WHY changes in this module may not be visible. */
export function renderOverrideHint(
  overridden: boolean,
  detail?: string,
): TemplateResult | typeof nothing {
  if (!overridden) return nothing;
  return html`<div class="override-hint">
    ⚠️ <strong>Custom CSS is currently overriding this control</strong>${detail
      ? html` — <code>${detail}</code>`
      : nothing}.
    Advanced CSS is applied after these settings (hand-written styles always
    win), so changes here may not be visible on the card. Edit or remove
    those lines in Advanced CSS to hand control back to this module.
  </div>`;
}

// ---------------------------------------------------------------------------
// Shared state-condition control (v0.9 state-driven numeric controls)
// ---------------------------------------------------------------------------

export const CONDITION_OPERATORS = ['<', '<=', '>', '>=', '==', '!='] as const;

export interface ConditionControlOptions {
  /** Current condition; undefined = 'always'. */
  condition: StyleCondition | undefined;
  /** False when the card's entity has no on/off state. */
  stateAware: boolean;
  /** OFF-only entity (climate, water_heater): OFF offered, ON not. */
  offOnly?: boolean;
  /** Noun used in labels/hints, e.g. "border", "effects", "icon size". */
  noun: string;
  hass?: HomeAssistant;
  /** Emits the new condition — undefined when back to Always. */
  onChange: (c: StyleCondition | undefined) => void;
}

/** Numeric attributes of an entity (the condition compares via float(), so
 *  string/list attributes would always read 0). The stored attribute is
 *  always offered even when not currently numeric — an entity that's
 *  unavailable right now shouldn't hide the active selection. Same rule as
 *  the Threshold and Animation modules. */
export function numericAttributes(
  hass: HomeAssistant | undefined,
  entityId: string,
  current?: string,
): string[] {
  const attrs = hass?.states?.[entityId]?.attributes ?? {};
  const names = Object.keys(attrs).filter((k) => {
    const v = (attrs as Record<string, unknown>)[k];
    return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)));
  });
  if (current && !names.includes(current)) names.unshift(current);
  return names;
}

function conditionHint(c: StyleCondition | undefined, o: ConditionControlOptions): string {
  switch (c?.when) {
    case 'on':
      return `Applies the ${o.noun} only while this card's entity is on.`;
    case 'off':
      return `Applies the ${o.noun} only while this card's entity is off.`;
    case 'custom':
      return `Applies the ${o.noun} only while ${c.customEntity || 'the chosen entity'} is on.`;
    case 'value':
      return `Applies the ${o.noun} only while the condition matches.`;
    default:
      return `Always applies the ${o.noun}.`;
  }
}

/**
 * Renders the shared "Reacts to" condition control: Always / entity ON /
 * entity OFF / another entity ON / a numeric value comparison. Same
 * options, labels, and hint conventions as renderWhen and the Animation
 * module's trigger — one vocabulary everywhere. On non-state-aware cards
 * the ON/OFF options are hidden unless one is already stored.
 */
export function renderCondition(o: ConditionControlOptions): TemplateResult {
  const c = o.condition;
  const when = c?.when ?? 'always';
  const { showOn, showOff } = offeredOnOff(o.stateAware, o.offOnly, when === 'on' || when === 'off');

  const opts: Array<{ v: StyleCondition['when']; label: string }> = [
    { v: 'always', label: 'Always' },
  ];
  if (showOn) opts.push({ v: 'on', label: 'Only while entity is ON' });
  if (showOff) opts.push({ v: 'off', label: 'Only while entity is OFF' });
  opts.push({ v: 'custom', label: 'While another entity is ON…' });
  opts.push({ v: 'value', label: 'While a value matches…' });

  const change = (patch: Partial<StyleCondition>) => {
    const next: StyleCondition = { when, ...c, ...patch };
    o.onChange(next.when === 'always' ? undefined : next);
  };
  const pick = (v: StyleCondition['when']) => {
    if (v === 'always') return o.onChange(undefined);
    // Seed value-mode defaults so generation is valid the moment an entity
    // is picked (same seeding as the Animation module's value trigger).
    if (v === 'value') return change({ when: v, valueOperator: c?.valueOperator ?? '>', valueThreshold: c?.valueThreshold ?? 0 });
    change({ when: v });
  };

  const attrNames =
    when === 'value' && c?.valueEntity ? numericAttributes(o.hass, c.valueEntity, c.valueAttribute) : [];

  return html`
    <div class="control-row">
      <span class="control-label" id="cond-label">Reacts to</span>
      <div class="control-right">
        <select
          aria-labelledby="cond-label"
          .value=${when}
          @change=${(e: Event) => pick((e.target as HTMLSelectElement).value as StyleCondition['when'])}
        >
          ${opts.map(
            (opt) =>
              html`<option value=${opt.v} ?selected=${when === opt.v}>${opt.label}</option>`,
          )}
        </select>
      </div>
    </div>
    ${when === 'custom'
      ? html`
          <div class="control-row">
            <span class="control-label">Entity</span>
            <div class="control-right">
              <cms-entity-picker
                .hass=${o.hass}
                .value=${c?.customEntity ?? ''}
                .includeDomains=${TOGGLE_DOMAINS}
                label=""
                accessible-name="Entity to watch"
                placeholder="input_boolean.my_entity"
                @value-changed=${(e: CustomEvent<{ value: string }>) =>
                  change({ customEntity: e.detail.value.trim() })}
              ></cms-entity-picker>
            </div>
          </div>
        `
      : nothing}
    ${when === 'value'
      ? html`
          <div class="control-row">
            <span class="control-label">Entity</span>
            <div class="control-right">
              <cms-entity-picker
                .hass=${o.hass}
                .value=${c?.valueEntity ?? ''}
                label=""
                accessible-name="Entity to read the value from"
                placeholder="sensor.temperature"
                @value-changed=${(e: CustomEvent<{ value: string }>) =>
                  change({ valueEntity: e.detail.value.trim(), valueAttribute: '' })}
              ></cms-entity-picker>
            </div>
          </div>
          ${attrNames.length > 0 || c?.valueAttribute
            ? html`
                <div class="control-row">
                  <span class="control-label" id="cond-read-label">Value read from</span>
                  <div class="control-right">
                    <select
                      aria-labelledby="cond-read-label"
                      .value=${c?.valueAttribute ?? ''}
                      @change=${(e: Event) =>
                        change({ valueAttribute: (e.target as HTMLSelectElement).value })}
                    >
                      <option value="" ?selected=${!c?.valueAttribute}>State</option>
                      ${attrNames.map(
                        (name) =>
                          html`<option value=${name} ?selected=${c?.valueAttribute === name}>
                            Attribute: ${name}
                          </option>`,
                      )}
                    </select>
                  </div>
                </div>
              `
            : nothing}
          <div class="control-row">
            <span class="control-label" id="cond-op-label">Condition</span>
            <div class="control-right">
              <select
                aria-labelledby="cond-op-label"
                .value=${c?.valueOperator ?? '>'}
                @change=${(e: Event) =>
                  change({
                    valueOperator: (e.target as HTMLSelectElement)
                      .value as StyleCondition['valueOperator'],
                  })}
              >
                ${CONDITION_OPERATORS.map(
                  (op) =>
                    html`<option value=${op} ?selected=${(c?.valueOperator ?? '>') === op}>
                      value ${op}
                    </option>`,
                )}
              </select>
            </div>
          </div>
          <div class="control-row">
            <span class="control-label">Threshold</span>
            <div class="control-right">
              <input
                type="text"
                class="num"
                aria-label="Threshold value"
                aria-invalid="false"
                spellcheck="false"
                autocomplete="off"
                .value=${String(c?.valueThreshold ?? 0)}
                @input=${markNumberInput}
                @change=${(e: Event) => {
                  // Empty / unparseable: keep the previous value (cue shows until blur).
                  const n = commitNumberInput(e);
                  if (n !== undefined) change({ valueThreshold: n });
                }}
                @blur=${(e: Event) => revertNumberInput(e, c?.valueThreshold ?? 0)}
              />
            </div>
          </div>
        `
      : nothing}
    <div class="when-hint">${conditionHint(c, o)}</div>
  `;
}

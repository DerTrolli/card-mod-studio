/**
 * module-base.ts — shared Lit CSS + helpers for all visual module components.
 */

import { css, html, nothing } from 'lit';
import type { TemplateResult } from 'lit';
import type { HomeAssistant, StyleCondition } from '../types/index.js';
import '../components/cms-entity-picker.js';
import { TOGGLE_DOMAINS } from '../components/cms-entity-picker.js';

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

  /* Label + control. Wraps onto two lines (control under its label) once
     the column gets too narrow for both — phones, stack children — instead
     of squeezing or clipping the control. */
  .control-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    min-height: 36px;
    gap: 6px 8px;
  }

  .control-label {
    font-size: 12px;
    color: var(--secondary-text-color, #727272);
    flex: 0 1 auto;
  }

  .control-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 150px;
    min-width: 0;
    justify-content: flex-end;
  }

  ha-slider {
    flex: 1;
    min-width: 100px;
    max-width: 160px;
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
  }
  input[type='text'] {
    width: 100%;
  }
  input[type='number'] {
    width: 84px;
    min-width: 0;
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

  /* Touch screens: grow the small controls to comfortable tap targets. */
  @media (pointer: coarse) {
    select,
    input[type='text'],
    input[type='number'] {
      min-height: 38px;
    }
    .btn-danger {
      min-width: 36px;
      min-height: 36px;
    }
  }
`,
];

/**
 * Keyboard support for the collapsible headers (module / child / row):
 * they're `role="button" tabindex="0"` divs, so Enter / Space must toggle
 * them like a click. Key events coming from a control INSIDE the header
 * (its enable switch) are left alone, so flipping the switch with the
 * keyboard doesn't also fold the module.
 */
export function onHeaderKeydown(e: KeyboardEvent): void {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    (e.currentTarget as HTMLElement).click();
  }
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
  const hasStateValue = o.value === 'on' || o.value === 'off';
  const showOnOff = o.stateAware || hasStateValue;
  // If "Always" is the only meaningful choice, drop the single-option dropdown.
  const showSelect = showOnOff || !!o.allowCustom;

  const opts: Array<{ v: WhenValue; label: string }> = [{ v: 'always', label: 'Always' }];
  if (showOnOff) {
    opts.push({ v: 'on', label: 'Only while entity is ON' });
    opts.push({ v: 'off', label: 'Only while entity is OFF' });
  }
  if (o.allowCustom) opts.push({ v: 'custom', label: 'While another entity is ON…' });

  return html`
    ${showSelect
      ? html`
          <div class="control-row">
            <span class="control-label">Apply when</span>
            <div class="control-right">
              <select
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
  const hasStateValue = when === 'on' || when === 'off';
  const showOnOff = o.stateAware || hasStateValue;

  const opts: Array<{ v: StyleCondition['when']; label: string }> = [
    { v: 'always', label: 'Always' },
  ];
  if (showOnOff) {
    opts.push({ v: 'on', label: 'Only while entity is ON' });
    opts.push({ v: 'off', label: 'Only while entity is OFF' });
  }
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
      <span class="control-label">Reacts to</span>
      <div class="control-right">
        <select
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
                placeholder="sensor.temperature"
                @value-changed=${(e: CustomEvent<{ value: string }>) =>
                  change({ valueEntity: e.detail.value.trim(), valueAttribute: '' })}
              ></cms-entity-picker>
            </div>
          </div>
          ${attrNames.length > 0 || c?.valueAttribute
            ? html`
                <div class="control-row">
                  <span class="control-label">Value read from</span>
                  <div class="control-right">
                    <select
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
            <span class="control-label">Condition</span>
            <div class="control-right">
              <select
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
                type="number"
                .value=${String(c?.valueThreshold ?? 0)}
                @change=${(e: Event) =>
                  change({
                    valueThreshold: parseFloat((e.target as HTMLInputElement).value) || 0,
                  })}
              />
            </div>
          </div>
        `
      : nothing}
    <div class="when-hint">${conditionHint(c, o)}</div>
  `;
}

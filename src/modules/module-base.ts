/**
 * module-base.ts — shared Lit CSS + helpers for all visual module components.
 */

import { css, html, nothing } from 'lit';
import type { TemplateResult } from 'lit';
import type { HomeAssistant, StyleCondition } from '../types/index.js';
import '../components/cms-entity-picker.js';
import { TOGGLE_DOMAINS } from '../components/cms-entity-picker.js';

export const moduleStyles = css`
  :host {
    display: block;
  }

  .module {
    border: 1px solid var(--divider-color, #383838);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 12px;
  }

  .module-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;
    user-select: none;
    transition: background 0.15s ease;
  }

  .module-header:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .module-chevron {
    font-size: 9px;
    color: var(--secondary-text-color, #9e9e9e);
    width: 14px;
    flex-shrink: 0;
    transition: transform 0.15s ease;
  }

  .module-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
    flex: 1;
  }

  .module-body {
    padding: 12px 14px;
    border-top: 1px solid var(--divider-color, #383838);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .control-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 36px;
    gap: 8px;
  }

  .control-label {
    font-size: 12px;
    color: var(--secondary-text-color, #9e9e9e);
    flex-shrink: 0;
  }

  .control-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    justify-content: flex-end;
  }

  ha-slider {
    flex: 1;
    min-width: 100px;
    max-width: 160px;
  }

  .value-label {
    font-size: 11px;
    color: var(--secondary-text-color, #9e9e9e);
    min-width: 36px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  input[type='color'] {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--divider-color, #383838);
    cursor: pointer;
    padding: 0;
    background: none;
    flex-shrink: 0;
  }

  .color-label {
    font-size: 11px;
    color: var(--secondary-text-color, #9e9e9e);
    font-family: monospace;
  }

  .sub-label {
    font-size: 11px;
    color: var(--secondary-text-color, #9e9e9e);
    margin-bottom: 4px;
  }

  ha-select {
    width: 100%;
  }

  select {
    background: var(--card-background-color, #1c1c1c);
    color: var(--primary-text-color, #e1e1e1);
    border: 1px solid var(--divider-color, #383838);
    border-radius: 4px;
    padding: 6px 8px;
    font-size: 12px;
    cursor: pointer;
    width: 100%;
  }

  /* Shared "Apply when" hint + custom-entity input (see renderWhen). */
  .when-hint {
    font-size: 11px;
    line-height: 1.4;
    color: var(--secondary-text-color, #9e9e9e);
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
    color: var(--warning-color, #ffa600);
    background: rgba(255, 166, 0, 0.08);
    border: 1px solid rgba(255, 166, 0, 0.3);
    border-radius: 4px;
    padding: 6px 8px;
  }
  .override-hint code {
    font-size: 10px;
  }

`;

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
                label="Controlling entity"
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
                label="Controlling entity"
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
                label="Entity the value is read from"
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

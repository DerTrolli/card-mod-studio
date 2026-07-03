import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { ThresholdModuleState, ThresholdProperty, ThresholdRule, HomeAssistant } from '../types/index.js';
import { DEFAULT_THRESHOLD } from '../parser/state-mapper.js';
import { moduleStyles } from './module-base.js';
import { sortThresholdRules } from '../generator/css-generator.js';
import { previewHexFor } from '../components/cms-color-picker.js';
import '../components/cms-color-picker.js';
import '../components/cms-entity-picker.js';

const PROPERTY_OPTIONS: Array<{ value: ThresholdProperty; label: string }> = [
  { value: 'icon-color', label: 'Icon Color' },
  { value: 'accent-color', label: 'Accent Color' },
  { value: 'background', label: 'Background' },
  { value: 'text-color', label: 'Text Color' },
  { value: 'border-color', label: 'Border Color' },
];

export class ThresholdModule extends LitElement {
  @property({ attribute: false }) state: ThresholdModuleState = {
    ...DEFAULT_THRESHOLD,
  };
  @property({ type: String }) cardEntity = '';

  @property({ attribute: false }) hass?: HomeAssistant;

  @state() private _open = false;

  static override styles = [
    moduleStyles,
    css`
      .rule {
        display: flex;
        gap: 6px;
        align-items: center;
        margin-bottom: 8px;
        padding: 8px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 4px;
      }
      .rule select,
      .rule input[type='number'] {
        padding: 4px 6px;
        font-size: 12px;
        background: var(--card-background-color, #1c1c1c);
        color: var(--primary-text-color, #e1e1e1);
        border: 1px solid var(--divider-color, #383838);
        border-radius: 4px;
      }
      .rule input[type='number'] {
        width: 70px;
      }
      .rule select {
        width: 60px;
      }
      .rule button {
        padding: 2px 8px;
        cursor: pointer;
        background: rgba(255, 0, 0, 0.15);
        color: #ff6b6b;
        border: 1px solid rgba(255, 0, 0, 0.3);
        border-radius: 4px;
        font-size: 14px;
        line-height: 1;
      }
      .rule button:hover {
        background: rgba(255, 0, 0, 0.25);
      }
      .rule-label {
        font-size: 11px;
        color: var(--secondary-text-color, #9e9e9e);
      }
      .add-btn {
        margin-top: 8px;
        padding: 6px 12px;
        cursor: pointer;
        background: rgba(33, 150, 243, 0.15);
        color: #2196f3;
        border: 1px solid rgba(33, 150, 243, 0.3);
        border-radius: 4px;
        font-size: 12px;
        width: 100%;
      }
      .add-btn:hover {
        background: rgba(33, 150, 243, 0.25);
      }
      .property-checks {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .property-check {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        cursor: pointer;
      }
      .property-check input {
        cursor: pointer;
      }
      .rules-container {
        margin-top: 12px;
      }
      .rules-label {
        font-size: 11px;
        color: var(--secondary-text-color, #9e9e9e);
        margin-bottom: 8px;
        display: block;
      }
      .legend {
        margin-top: 12px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--divider-color, #383838);
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .legend-title {
        font-size: 11px;
        font-weight: 600;
        color: var(--secondary-text-color, #9e9e9e);
        margin-bottom: 2px;
      }
      .legend-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 12px;
      }
      .legend-cond {
        color: var(--primary-text-color, #e1e1e1);
        font-variant-numeric: tabular-nums;
      }
      .legend-sw {
        width: 26px;
        height: 16px;
        border-radius: 3px;
        border: 1px solid var(--divider-color, #383838);
        flex-shrink: 0;
      }
    `,
  ];

  override firstUpdated() {
    this._open = this.state.enabled;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('state')) {
      const prev = changed.get('state') as ThresholdModuleState | undefined;
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
    }
  }

  private _toggleOpen() {
    this._open = !this._open;
  }

  private _emit(changes: Partial<ThresholdModuleState>) {
    const newState = { ...this.state, ...changes };
    // Auto-set entityId to cardEntity when enabling if empty
    if (changes.enabled && !newState.entityId && this.cardEntity) {
      newState.entityId = this.cardEntity;
    }
    this.dispatchEvent(
      new CustomEvent<ThresholdModuleState>('state-changed', {
        detail: newState,
      }),
    );
  }

  override render() {
    return html`
      <div class="module">
        <div class="module-header" @click=${this._toggleOpen}>
          <span class="module-chevron">${this._open ? '▼' : '▶'}</span>
          <span class="module-title">🎯 Threshold Colors</span>
          <ha-switch
            .checked=${this.state.enabled}
            @click=${(e: Event) => e.stopPropagation()}
            @change=${(e: Event) =>
              this._emit({ enabled: (e.target as HTMLInputElement).checked })}
          ></ha-switch>
        </div>
        ${this._open ? this._renderBody() : nothing}
      </div>
    `;
  }

  private _toggleProperty(value: ThresholdProperty, checked: boolean) {
    const properties = checked
      ? [...this.state.properties, value]
      : this.state.properties.filter((p) => p !== value);
    this._emit({ properties });
  }

  private _renderBody() {
    return html`
      <div class="module-body">
        <div class="control-row">
          <span class="control-label">Entity</span>
        </div>
        <cms-entity-picker
          .hass=${this.hass}
          .value=${this.state.entityId}
          .placeholder=${this.cardEntity || 'sensor.temperature'}
          label="Entity these rules read from"
          @value-changed=${(e: CustomEvent<{ value: string }>) =>
            this._emit({ entityId: e.detail.value.trim() })}
        ></cms-entity-picker>

        <div class="control-row">
          <span class="control-label">Apply to</span>
        </div>
        <div class="property-checks">
          ${PROPERTY_OPTIONS.map(
            (opt) => html`
              <label class="property-check">
                <input
                  type="checkbox"
                  .checked=${this.state.properties.includes(opt.value)}
                  @change=${(e: Event) =>
                    this._toggleProperty(opt.value, (e.target as HTMLInputElement).checked)}
                />
                ${opt.label}
              </label>
            `,
          )}
        </div>
        ${this.state.properties.length === 0
          ? html`<div class="when-hint">Select at least one property above to apply these rules.</div>`
          : nothing}

        ${this.state.properties.includes('border-color')
          ? html`
              <div class="control-row">
                <span class="control-label">Border width</span>
                <div class="control-right">
                  <input
                    type="number"
                    min="1"
                    max="16"
                    style="width:60px"
                    .value=${String(this.state.borderWidth ?? 2)}
                    @input=${(e: Event) =>
                      this._emit({
                        borderWidth: Math.max(1, parseFloat((e.target as HTMLInputElement).value) || 2),
                      })}
                  />
                  <span class="rule-label">px</span>
                </div>
              </div>
            `
          : nothing}

        <div class="rules-container">
          <span class="rules-label">Rules — order doesn't matter, they're sorted automatically:</span>
          ${this.state.rules.map((rule, i) => this._renderRule(rule, i))}
          <button class="add-btn" @click=${this._addRule}>+ Add Rule</button>
        </div>

        <div class="control-row" style="margin-top: 12px;">
          <span class="control-label">Default color</span>
          <div class="control-right">
            <cms-color-picker
              compact
              .value=${this.state.defaultColor}
              @color-changed=${(e: CustomEvent) => this._emit({ defaultColor: e.detail.value })}
            ></cms-color-picker>
            <span class="color-label">${this.state.defaultColor}</span>
          </div>
        </div>

        ${this._renderLegend()}
      </div>
    `;
  }

  /**
   * Read-only "what actually happens" legend. Uses the exact same sort the
   * generator uses, so the colours shown here are the colours that will render.
   */
  private _renderLegend() {
    const sorted = sortThresholdRules(this.state.rules);
    const defaultSwatch = html`<span
      class="legend-sw"
      style="background:${previewHexFor(this.state.defaultColor)}"
    ></span>`;

    if (sorted.length === 0) {
      return html`
        <div class="legend">
          <span class="legend-title">Result</span>
          <div class="legend-row">
            <span class="legend-cond">Always</span>${defaultSwatch}
          </div>
        </div>
      `;
    }

    return html`
      <div class="legend">
        <span class="legend-title">Result — first match wins (top to bottom)</span>
        ${sorted.map(
          (r, i) => html`
            <div class="legend-row">
              <span class="legend-cond">
                ${i === 0 ? 'If' : 'else if'} value ${r.operator} ${r.value}
              </span>
              <span class="legend-sw" style="background:${previewHexFor(r.color)}"></span>
            </div>
          `,
        )}
        <div class="legend-row">
          <span class="legend-cond">otherwise (default)</span>${defaultSwatch}
        </div>
      </div>
    `;
  }

  private _renderRule(rule: ThresholdRule, index: number) {
    return html`
      <div class="rule">
        <span class="rule-label">If value</span>
        <select
          .value=${rule.operator}
          @change=${(e: Event) =>
            this._onOperatorChange(index, (e.target as HTMLSelectElement).value)}
        >
          <option value="<" ?selected=${rule.operator === '<'}>&lt;</option>
          <option value="<=" ?selected=${rule.operator === '<='}>&lt;=</option>
          <option value=">" ?selected=${rule.operator === '>'}>&gt;</option>
          <option value=">=" ?selected=${rule.operator === '>='}>&gt;=</option>
          <option value="==" ?selected=${rule.operator === '=='}>==</option>
          <option value="!=" ?selected=${rule.operator === '!='}>!=</option>
        </select>
        <input
          type="number"
          .value=${String(rule.value)}
          @input=${(e: Event) =>
            this._onValueChange(index, (e.target as HTMLInputElement).value)}
        />
        <span class="rule-label">→</span>
        <cms-color-picker
          compact
          .value=${rule.color}
          @color-changed=${(e: CustomEvent) => this._onRuleColorChange(index, e.detail.value)}
        ></cms-color-picker>
        <button @click=${() => this._removeRule(index)}>×</button>
      </div>
    `;
  }

  private _addRule() {
    const newRule: ThresholdRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      operator: '<',
      value: 0,
      color: '#2196F3',
    };
    this._emit({ rules: [...this.state.rules, newRule] });
  }

  private _removeRule(index: number) {
    const rules = [...this.state.rules];
    rules.splice(index, 1);
    this._emit({ rules });
  }

  private _onOperatorChange(index: number, operator: string) {
    const rules = [...this.state.rules];
    rules[index] = {
      ...rules[index],
      operator: operator as ThresholdRule['operator'],
    };
    this._emit({ rules });
  }

  private _onValueChange(index: number, value: string) {
    const rules = [...this.state.rules];
    rules[index] = { ...rules[index], value: parseFloat(value) || 0 };
    this._emit({ rules });
  }

  private _onRuleColorChange(index: number, color: string) {
    const rules = [...this.state.rules];
    rules[index] = { ...rules[index], color };
    this._emit({ rules });
  }
}

customElements.define('cms-threshold-module', ThresholdModule);

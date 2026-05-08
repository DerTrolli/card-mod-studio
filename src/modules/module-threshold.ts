import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { ThresholdModuleState, ThresholdRule } from '../types/index.js';
import { DEFAULT_THRESHOLD } from '../parser/state-mapper.js';
import { moduleStyles } from './module-base.js';

export class ThresholdModule extends LitElement {
  @property({ attribute: false }) state: ThresholdModuleState = {
    ...DEFAULT_THRESHOLD,
  };
  @property({ type: String }) cardEntity = '';

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
      .rule input[type='color'] {
        width: 32px;
        height: 24px;
        padding: 0;
        border: 1px solid var(--divider-color, #383838);
        border-radius: 4px;
        cursor: pointer;
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
      .entity-input {
        width: 100%;
        padding: 6px 8px;
        font-size: 12px;
        background: var(--card-background-color, #1c1c1c);
        color: var(--primary-text-color, #e1e1e1);
        border: 1px solid var(--divider-color, #383838);
        border-radius: 4px;
        font-family: monospace;
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

  private _renderBody() {
    return html`
      <div class="module-body">
        <div class="control-row">
          <span class="control-label">Entity ID</span>
        </div>
        <input
          class="entity-input"
          type="text"
          .value=${this.state.entityId || this.cardEntity}
          @input=${(e: Event) =>
            this._emit({ entityId: (e.target as HTMLInputElement).value })}
          placeholder=${this.cardEntity || 'sensor.temperature'}
        />

        <div class="control-row">
          <span class="control-label">Apply to</span>
          <div class="control-right">
            <select
              .value=${this.state.property}
              @change=${(e: Event) =>
                this._emit({
                  property: (e.target as HTMLSelectElement)
                    .value as ThresholdModuleState['property'],
                })}
            >
              <option value="icon-color" ?selected=${this.state.property === 'icon-color'}>
                Icon Color
              </option>
              <option value="accent-color" ?selected=${this.state.property === 'accent-color'}>
                Accent Color
              </option>
              <option value="background" ?selected=${this.state.property === 'background'}>
                Background
              </option>
              <option value="text-color" ?selected=${this.state.property === 'text-color'}>
                Text Color
              </option>
              <option value="border-color" ?selected=${this.state.property === 'border-color'}>
                Border Color
              </option>
            </select>
          </div>
        </div>

        ${this.state.property === 'border-color'
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
          <span class="rules-label">Rules (evaluated top to bottom):</span>
          ${this.state.rules.map((rule, i) => this._renderRule(rule, i))}
          <button class="add-btn" @click=${this._addRule}>+ Add Rule</button>
        </div>

        <div class="control-row" style="margin-top: 12px;">
          <span class="control-label">Default color</span>
          <div class="control-right">
            <input
              type="color"
              .value=${this._toHex(this.state.defaultColor)}
              @input=${(e: Event) =>
                this._emit({ defaultColor: (e.target as HTMLInputElement).value })}
            />
            <span class="color-label">${this.state.defaultColor}</span>
          </div>
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
        <input
          type="color"
          .value=${this._toHex(rule.color)}
          @input=${(e: Event) =>
            this._onRuleColorChange(index, (e.target as HTMLInputElement).value)}
        />
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

  /** Resolves any CSS color to a 6-digit hex for <input type="color">. */
  private _toHex(value: string): string {
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    if (/^#[0-9a-fA-F]{3}$/.test(value)) {
      return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    } catch {
      return '#888888';
    }
  }
}

customElements.define('cms-threshold-module', ThresholdModule);

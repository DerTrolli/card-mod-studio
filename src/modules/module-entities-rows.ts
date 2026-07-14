import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { EntitiesCardRow, EntitiesRowStyle, EntitiesRowStyles, ThresholdRule } from '../types/index.js';
import { moduleStyles } from './module-base.js';
import '../components/cms-color-picker.js';

export class EntitiesRowsModule extends LitElement {
  /** May contain bare-string rows ('sensor.x') — the YAML shorthand form. */
  @property({ attribute: false }) rows: Array<EntitiesCardRow | string> = [];
  @property({ attribute: false }) styles: EntitiesRowStyles = {};

  @state() private _openRows = new Set<string>();

  static override styles = [
    moduleStyles,
    css`
      .entity-section {
        border: 1px solid var(--divider-color, #383838);
        border-radius: 6px;
        overflow: hidden;
      }
      .entity-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        background: rgba(255, 255, 255, 0.03);
        cursor: pointer;
        user-select: none;
      }
      .entity-header:hover {
        background: rgba(255, 255, 255, 0.07);
      }
      .entity-chevron {
        font-size: 9px;
        color: var(--secondary-text-color, #9e9e9e);
        width: 12px;
        flex-shrink: 0;
      }
      .entity-name {
        font-size: 13px;
        font-weight: 500;
        flex-shrink: 0;
      }
      .entity-id {
        font-size: 11px;
        color: var(--secondary-text-color, #9e9e9e);
        font-family: monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
      }
      .style-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--accent-color, #2196f3);
        flex-shrink: 0;
      }
      .entity-body {
        padding: 12px 14px;
        border-top: 1px solid var(--divider-color, #383838);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .mode-toggle {
        display: flex;
        border: 1px solid var(--divider-color, #383838);
        border-radius: 4px;
        overflow: hidden;
      }
      .mode-btn {
        padding: 3px 10px;
        font-size: 11px;
        cursor: pointer;
        background: transparent;
        color: var(--secondary-text-color, #9e9e9e);
        border: none;
      }
      .mode-btn.active {
        background: rgba(33, 150, 243, 0.2);
        color: #2196f3;
      }
      .color-section-label {
        font-size: 12px;
        color: var(--secondary-text-color, #9e9e9e);
        font-weight: 500;
        margin-bottom: 2px;
      }
      /* Threshold rule styles */
      .rule {
        display: flex;
        gap: 6px;
        align-items: center;
        padding: 6px 8px;
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
      .rule input[type='number'] { width: 70px; }
      .rule select { width: 60px; }
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
      .rule button:hover { background: rgba(255, 0, 0, 0.25); }
      .rule-label {
        font-size: 11px;
        color: var(--secondary-text-color, #9e9e9e);
      }
      .add-rule-btn {
        margin-top: 4px;
        padding: 5px 10px;
        cursor: pointer;
        background: rgba(33, 150, 243, 0.12);
        color: #2196f3;
        border: 1px solid rgba(33, 150, 243, 0.3);
        border-radius: 4px;
        font-size: 12px;
        width: 100%;
      }
      .add-rule-btn:hover { background: rgba(33, 150, 243, 0.22); }
      .rules-container {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 6px;
      }
      .divider {
        border: none;
        border-top: 1px solid var(--divider-color, #383838);
        margin: 4px 0;
      }
    `,
  ];

  // ---------------------------------------------------------------------------
  // Emit helpers
  // ---------------------------------------------------------------------------

  private _updateRow(entityId: string, changes: Partial<EntitiesRowStyle>) {
    const current = this.styles[entityId] ?? { iconColor: '', textColor: '' };
    const updated = { ...current, ...changes };
    this.dispatchEvent(
      new CustomEvent<EntitiesRowStyles>('styles-changed', {
        detail: { ...this.styles, [entityId]: updated },
      }),
    );
  }

  private _toggleRow(entityId: string) {
    const next = new Set(this._openRows);
    if (next.has(entityId)) next.delete(entityId);
    else next.add(entityId);
    this._openRows = next;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  override render() {
    // Rows arrive in whatever form the YAML uses — the bare-string
    // shorthand ('sensor.x') is normalized to object form here so it's
    // just as styleable (see EntitiesRowLike in studio-state.ts).
    const entityRows = this.rows
      .map((r) => (typeof r === 'string' ? ({ entity: r } as EntitiesCardRow) : r))
      .filter((r): r is EntitiesCardRow & { entity: string } => !!r.entity);
    if (!entityRows.length) return nothing;

    return html`
      <div class="module">
        <div class="module-header" style="cursor:default; pointer-events:none">
          <span class="module-title">🏠 Entities</span>
        </div>
        <div class="module-body">
          ${entityRows.map((row) => this._renderRow(row))}
        </div>
      </div>
    `;
  }

  private _renderRow(row: EntitiesCardRow & { entity: string }) {
    const id = row.entity;
    const label = row.name || id.split('.')[1] || id;
    const isOpen = this._openRows.has(id);
    const rowStyle = this.styles[id] ?? { iconColor: '', textColor: '' };
    const hasStyle = !!(
      rowStyle.iconColor ||
      rowStyle.iconMode === 'threshold' ||
      rowStyle.textColor ||
      rowStyle.textMode === 'threshold' ||
      rowStyle.fontSizePx ||
      rowStyle.fontWeight
    );

    return html`
      <div class="entity-section">
        <div class="entity-header" @click=${() => this._toggleRow(id)}>
          <span class="entity-chevron">${isOpen ? '▼' : '▶'}</span>
          <span class="entity-name">${label}</span>
          <span class="entity-id">${id}</span>
          ${hasStyle ? html`<span class="style-dot"></span>` : nothing}
        </div>
        ${isOpen ? this._renderBody(id, rowStyle) : nothing}
      </div>
    `;
  }

  private _renderBody(entityId: string, rowStyle: EntitiesRowStyle) {
    const iconEnabled = !!(rowStyle.iconColor || rowStyle.iconMode === 'threshold');
    const iconIsThreshold = rowStyle.iconMode === 'threshold';
    const textEnabled = !!(rowStyle.textColor || rowStyle.textMode === 'threshold');
    const textIsThreshold = rowStyle.textMode === 'threshold';

    return html`
      <div class="entity-body">

        <!-- Icon color -->
        <div class="control-row">
          <span class="control-label">Icon color</span>
          <div class="control-right">
            ${iconEnabled
              ? html`<div class="mode-toggle">
                    <button
                      class="mode-btn ${!iconIsThreshold ? 'active' : ''}"
                      @click=${(e: Event) => { e.stopPropagation(); this._setMode(entityId, 'icon', 'static'); }}
                    >Static</button>
                    <button
                      class="mode-btn ${iconIsThreshold ? 'active' : ''}"
                      @click=${(e: Event) => { e.stopPropagation(); this._setMode(entityId, 'icon', 'threshold'); }}
                    >Threshold</button>
                  </div>`
              : nothing}
            <ha-switch
              .checked=${iconEnabled}
              @change=${(e: Event) => {
                const on = (e.target as HTMLInputElement).checked;
                this._updateRow(entityId, on
                  ? { iconColor: '#2196F3', iconMode: 'static' }
                  : { iconColor: '', iconMode: undefined, iconRules: undefined, iconDefault: undefined });
              }}
            ></ha-switch>
          </div>
        </div>
        ${iconEnabled && !iconIsThreshold
          ? html`<cms-color-picker
                .value=${rowStyle.iconColor}
                @color-changed=${(e: CustomEvent) => this._updateRow(entityId, { iconColor: e.detail.value })}
              ></cms-color-picker>`
          : nothing}
        ${iconEnabled && iconIsThreshold
          ? this._renderRuleBuilder(entityId, 'icon', rowStyle.iconRules ?? [], rowStyle.iconDefault ?? '#888888')
          : nothing}

        <hr class="divider" />

        <!-- Text / state color -->
        <div class="control-row">
          <span class="control-label">Text / state color</span>
          <div class="control-right">
            ${textEnabled
              ? html`<div class="mode-toggle">
                    <button
                      class="mode-btn ${!textIsThreshold ? 'active' : ''}"
                      @click=${(e: Event) => { e.stopPropagation(); this._setMode(entityId, 'text', 'static'); }}
                    >Static</button>
                    <button
                      class="mode-btn ${textIsThreshold ? 'active' : ''}"
                      @click=${(e: Event) => { e.stopPropagation(); this._setMode(entityId, 'text', 'threshold'); }}
                    >Threshold</button>
                  </div>`
              : nothing}
            <ha-switch
              .checked=${textEnabled}
              @change=${(e: Event) => {
                const on = (e.target as HTMLInputElement).checked;
                this._updateRow(entityId, on
                  ? { textColor: '#e1e1e1', textMode: 'static' }
                  : { textColor: '', textMode: undefined, textRules: undefined, textDefault: undefined });
              }}
            ></ha-switch>
          </div>
        </div>
        ${textEnabled && !textIsThreshold
          ? html`<cms-color-picker
                .value=${rowStyle.textColor}
                @color-changed=${(e: CustomEvent) => this._updateRow(entityId, { textColor: e.detail.value })}
              ></cms-color-picker>`
          : nothing}
        ${textEnabled && textIsThreshold
          ? this._renderRuleBuilder(entityId, 'text', rowStyle.textRules ?? [], rowStyle.textDefault ?? '#888888')
          : nothing}

        <hr class="divider" />

        <!-- Per-row font (size + weight; inherits the card-level Font when off) -->
        <div class="control-row">
          <span class="control-label">Font (this row)</span>
          <div class="control-right">
            <ha-switch
              .checked=${!!(rowStyle.fontSizePx || rowStyle.fontWeight)}
              @change=${(e: Event) => {
                const on = (e.target as HTMLInputElement).checked;
                this._updateRow(entityId, on
                  ? { fontSizePx: 16, fontWeight: 'normal' }
                  : { fontSizePx: undefined, fontWeight: undefined });
              }}
            ></ha-switch>
          </div>
        </div>
        ${rowStyle.fontSizePx || rowStyle.fontWeight
          ? html`
              <div class="control-row">
                <span class="control-label">Size</span>
                <div class="control-right">
                  <input
                    type="number"
                    min="8"
                    max="48"
                    style="width:60px"
                    .value=${String(rowStyle.fontSizePx ?? 16)}
                    @change=${(e: Event) =>
                      this._updateRow(entityId, {
                        fontSizePx: Math.max(8, parseFloat((e.target as HTMLInputElement).value) || 16),
                      })}
                  />
                  <span class="rule-label">px</span>
                  <select
                    .value=${rowStyle.fontWeight ?? 'normal'}
                    @change=${(e: Event) =>
                      this._updateRow(entityId, {
                        fontWeight: (e.target as HTMLSelectElement).value as EntitiesRowStyle['fontWeight'],
                      })}
                  >
                    <option value="normal" ?selected=${(rowStyle.fontWeight ?? 'normal') === 'normal'}>Normal</option>
                    <option value="medium" ?selected=${rowStyle.fontWeight === 'medium'}>Medium</option>
                    <option value="bold" ?selected=${rowStyle.fontWeight === 'bold'}>Bold</option>
                  </select>
                </div>
              </div>
            `
          : nothing}

      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Threshold rule builder
  // ---------------------------------------------------------------------------

  private _renderRuleBuilder(
    entityId: string,
    prop: 'icon' | 'text',
    rules: ThresholdRule[],
    defaultColor: string,
  ) {
    return html`
      <div class="rules-container">
        <span class="rule-label">Rules (top to bottom):</span>
        ${rules.map((rule, i) => html`
          <div class="rule">
            <span class="rule-label">If</span>
            <select
              .value=${rule.operator}
              @change=${(e: Event) => this._updateRule(entityId, prop, i, {
                operator: (e.target as HTMLSelectElement).value as ThresholdRule['operator'],
              })}
            >
              <option value="<"  ?selected=${rule.operator === '<'}>&lt;</option>
              <option value="<=" ?selected=${rule.operator === '<='}>&lt;=</option>
              <option value=">"  ?selected=${rule.operator === '>'}>&gt;</option>
              <option value=">=" ?selected=${rule.operator === '>='}>&gt;=</option>
              <option value="==" ?selected=${rule.operator === '=='}>==</option>
              <option value="!=" ?selected=${rule.operator === '!='}>!=</option>
            </select>
            <input
              type="number"
              .value=${String(rule.value)}
              @change=${(e: Event) => this._updateRule(entityId, prop, i, {
                value: parseFloat((e.target as HTMLInputElement).value) || 0,
              })}
            />
            <span class="rule-label">→</span>
            <cms-color-picker
              compact
              .value=${rule.color}
              @color-changed=${(e: CustomEvent) => this._updateRule(entityId, prop, i, { color: e.detail.value })}
            ></cms-color-picker>
            <button @click=${() => this._removeRule(entityId, prop, i)}>×</button>
          </div>
        `)}
        <button class="add-rule-btn" @click=${() => this._addRule(entityId, prop)}>+ Add Rule</button>
        <div class="control-row" style="margin-top:4px">
          <span class="control-label">Default color</span>
          <div class="control-right">
            <cms-color-picker
              compact
              .value=${defaultColor}
              @color-changed=${(e: CustomEvent) => {
                const key = prop === 'icon' ? 'iconDefault' : 'textDefault';
                this._updateRow(entityId, { [key]: e.detail.value });
              }}
            ></cms-color-picker>
            <span class="rule-label">${defaultColor}</span>
          </div>
        </div>
      </div>
    `;
  }

  private _setMode(entityId: string, prop: 'icon' | 'text', mode: 'static' | 'threshold') {
    const current = this.styles[entityId] ?? { iconColor: '', textColor: '' };
    if (prop === 'icon') {
      this._updateRow(entityId, {
        iconMode: mode,
        iconColor: mode === 'static' ? (current.iconColor || '#2196F3') : '',
        iconRules: mode === 'threshold' ? (current.iconRules ?? []) : undefined,
        iconDefault: mode === 'threshold' ? (current.iconDefault ?? '#888888') : undefined,
      });
    } else {
      this._updateRow(entityId, {
        textMode: mode,
        textColor: mode === 'static' ? (current.textColor || '#e1e1e1') : '',
        textRules: mode === 'threshold' ? (current.textRules ?? []) : undefined,
        textDefault: mode === 'threshold' ? (current.textDefault ?? '#888888') : undefined,
      });
    }
  }

  private _addRule(entityId: string, prop: 'icon' | 'text') {
    const current = this.styles[entityId] ?? { iconColor: '', textColor: '' };
    const key = prop === 'icon' ? 'iconRules' : 'textRules';
    const rules = [...(current[key] ?? [])];
    rules.push({
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      operator: '<',
      value: 0,
      color: '#2196F3',
    });
    this._updateRow(entityId, { [key]: rules });
  }

  private _removeRule(entityId: string, prop: 'icon' | 'text', index: number) {
    const current = this.styles[entityId] ?? { iconColor: '', textColor: '' };
    const key = prop === 'icon' ? 'iconRules' : 'textRules';
    const rules = [...(current[key] ?? [])];
    rules.splice(index, 1);
    this._updateRow(entityId, { [key]: rules });
  }

  private _updateRule(entityId: string, prop: 'icon' | 'text', index: number, changes: Partial<ThresholdRule>) {
    const current = this.styles[entityId] ?? { iconColor: '', textColor: '' };
    const key = prop === 'icon' ? 'iconRules' : 'textRules';
    const rules = [...(current[key] ?? [])];
    rules[index] = { ...rules[index], ...changes };
    this._updateRow(entityId, { [key]: rules });
  }
}

customElements.define('cms-entities-rows-module', EntitiesRowsModule);

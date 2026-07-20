import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { EntitiesCardRow, EntitiesRowStyle, EntitiesRowStyles, ThresholdRule } from '../types/index.js';
import { moduleStyles, renderOverrideHint } from './module-base.js';
import { getCachedPalette } from '../utils/palette-storage.js';
import { findRowExtraCssConflicts } from '../utils/style-conflicts.js';
import '../components/cms-color-picker.js';

/** The color a freshly-enabled row icon/color control starts from — the
 *  Palette Manager's ON-default override when set, else the same built-in
 *  the card-level Icon Color module uses. Keeps "what enabling something
 *  starts with" consistent between card level and row level. */
function defaultOnColor(): string {
  return getCachedPalette().defaults.onColor ?? '#2196F3';
}

export class EntitiesRowsModule extends LitElement {
  /** May contain bare-string rows ('sensor.x') — the YAML shorthand form. */
  @property({ attribute: false }) rows: Array<EntitiesCardRow | string> = [];
  /** Keyed POSITIONALLY by String(rowIndex) — see rowStyleKey in
   *  studio-state.ts. Two rows may share an entity_id (valid entities-card
   *  YAML) and must keep independent style slots (ROADMAP #24). */
  @property({ attribute: false }) styles: EntitiesRowStyles = {};

  /** Open sections, by the same positional row key as `styles`. */
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
        width: 8px;
        height: 8px;
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
      /* Same metrics as the card-level Threshold module's .add-btn. */
      .add-rule-btn {
        margin-top: 4px;
        padding: 6px 12px;
        cursor: pointer;
        background: rgba(33, 150, 243, 0.15);
        color: #2196f3;
        border: 1px solid rgba(33, 150, 243, 0.3);
        border-radius: 4px;
        font-size: 12px;
        width: 100%;
      }
      .add-rule-btn:hover { background: rgba(33, 150, 243, 0.25); }
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

  private _updateRow(rowKey: string, changes: Partial<EntitiesRowStyle>) {
    const current = this.styles[rowKey] ?? { iconColor: '', textColor: '' };
    const updated = { ...current, ...changes };
    this.dispatchEvent(
      new CustomEvent<EntitiesRowStyles>('styles-changed', {
        detail: { ...this.styles, [rowKey]: updated },
      }),
    );
  }

  private _toggleRow(rowKey: string) {
    const next = new Set(this._openRows);
    if (next.has(rowKey)) next.delete(rowKey);
    else next.add(rowKey);
    this._openRows = next;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  override render() {
    // Rows arrive in whatever form the YAML uses — the bare-string
    // shorthand ('sensor.x') is normalized to object form here so it's
    // just as styleable (see EntitiesRowLike in studio-state.ts). The
    // ORIGINAL config index rides along: it's the positional style key
    // (rows without an entity are skipped in the UI but still occupy
    // their index, keeping keys aligned with the config).
    const entityRows = this.rows
      .map((r, index) => ({
        row: typeof r === 'string' ? ({ entity: r } as EntitiesCardRow) : r,
        index,
      }))
      .filter((x): x is { row: EntitiesCardRow & { entity: string }; index: number } => !!x.row.entity);
    if (!entityRows.length) return nothing;

    // Duplicate-entity rows are valid YAML and hold independent styles —
    // number the repeats ("(2)", "(3)") so the sections are tellable apart.
    const seen = new Map<string, number>();

    return html`
      <div class="module">
        <div class="module-header" style="cursor:default; pointer-events:none">
          <span class="module-title">🏠 Entity Rows</span>
        </div>
        <div class="module-body">
          ${entityRows.map(({ row, index }) => {
            const occurrence = (seen.get(row.entity) ?? 0) + 1;
            seen.set(row.entity, occurrence);
            return this._renderRow(row, index, occurrence);
          })}
        </div>
      </div>
    `;
  }

  private _renderRow(row: EntitiesCardRow & { entity: string }, index: number, occurrence: number) {
    const rowKey = String(index);
    const id = row.entity;
    const baseLabel = row.name || id.split('.')[1] || id;
    const label = occurrence > 1 ? `${baseLabel} (${occurrence})` : baseLabel;
    const isOpen = this._openRows.has(rowKey);
    const rowStyle = this.styles[rowKey] ?? { iconColor: '', textColor: '' };
    const hasStyle = !!(
      rowStyle.iconColor ||
      rowStyle.iconMode === 'threshold' ||
      rowStyle.textColor ||
      rowStyle.textMode === 'threshold' ||
      rowStyle.fontSizePx ||
      rowStyle.fontWeight ||
      rowStyle.extraCss
    );

    const conflicts = findRowExtraCssConflicts(rowStyle);

    return html`
      <div class="entity-section">
        <div class="entity-header" @click=${() => this._toggleRow(rowKey)}>
          <span class="entity-chevron">${isOpen ? '▼' : '▶'}</span>
          <span class="entity-name">${label}</span>
          <span class="entity-id">${id}</span>
          ${conflicts.length
            ? html`<span class="override-badge" title="Hand-written CSS on this row is overriding these controls">⚠️</span>`
            : nothing}
          ${hasStyle ? html`<span class="style-dot"></span>` : nothing}
        </div>
        ${isOpen ? this._renderBody(rowKey, rowStyle, conflicts) : nothing}
      </div>
    `;
  }

  private _renderBody(rowKey: string, rowStyle: EntitiesRowStyle, conflicts: string[] = []) {
    const iconEnabled = !!(rowStyle.iconColor || rowStyle.iconMode === 'threshold');
    const iconIsThreshold = rowStyle.iconMode === 'threshold';
    const textEnabled = !!(rowStyle.textColor || rowStyle.textMode === 'threshold');
    const textIsThreshold = rowStyle.textMode === 'threshold';

    return html`
      <div class="entity-body">
        ${renderOverrideHint(conflicts.length > 0, conflicts.join(', '))}

        <!-- Icon color -->
        <div class="control-row">
          <span class="control-label">Icon color</span>
          <div class="control-right">
            ${iconEnabled
              ? html`<div class="mode-toggle">
                    <button
                      class="mode-btn ${!iconIsThreshold ? 'active' : ''}"
                      @click=${(e: Event) => { e.stopPropagation(); this._setMode(rowKey, 'icon', 'static'); }}
                    >Static</button>
                    <button
                      class="mode-btn ${iconIsThreshold ? 'active' : ''}"
                      @click=${(e: Event) => { e.stopPropagation(); this._setMode(rowKey, 'icon', 'threshold'); }}
                    >Threshold</button>
                  </div>`
              : nothing}
            <ha-switch
              .checked=${iconEnabled}
              @change=${(e: Event) => {
                const on = (e.target as HTMLInputElement).checked;
                this._updateRow(rowKey, on
                  ? { iconColor: defaultOnColor(), iconMode: 'static' }
                  : { iconColor: '', iconMode: undefined, iconRules: undefined, iconDefault: undefined });
              }}
            ></ha-switch>
          </div>
        </div>
        ${iconEnabled && !iconIsThreshold
          ? html`<cms-color-picker
                .value=${rowStyle.iconColor}
                @color-changed=${(e: CustomEvent) => this._updateRow(rowKey, { iconColor: e.detail.value })}
              ></cms-color-picker>`
          : nothing}
        ${iconEnabled && iconIsThreshold
          ? this._renderRuleBuilder(rowKey, 'icon', rowStyle.iconRules ?? [], rowStyle.iconDefault ?? '#888888')
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
                      @click=${(e: Event) => { e.stopPropagation(); this._setMode(rowKey, 'text', 'static'); }}
                    >Static</button>
                    <button
                      class="mode-btn ${textIsThreshold ? 'active' : ''}"
                      @click=${(e: Event) => { e.stopPropagation(); this._setMode(rowKey, 'text', 'threshold'); }}
                    >Threshold</button>
                  </div>`
              : nothing}
            <ha-switch
              .checked=${textEnabled}
              @change=${(e: Event) => {
                const on = (e.target as HTMLInputElement).checked;
                this._updateRow(rowKey, on
                  ? { textColor: '#e1e1e1', textMode: 'static' }
                  : { textColor: '', textMode: undefined, textRules: undefined, textDefault: undefined });
              }}
            ></ha-switch>
          </div>
        </div>
        ${textEnabled && !textIsThreshold
          ? html`<cms-color-picker
                .value=${rowStyle.textColor}
                @color-changed=${(e: CustomEvent) => this._updateRow(rowKey, { textColor: e.detail.value })}
              ></cms-color-picker>`
          : nothing}
        ${textEnabled && textIsThreshold
          ? this._renderRuleBuilder(rowKey, 'text', rowStyle.textRules ?? [], rowStyle.textDefault ?? '#888888')
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
                this._updateRow(rowKey, on
                  ? { fontSizePx: 16, fontWeight: 'normal' }
                  : { fontSizePx: undefined, fontWeight: undefined });
              }}
            ></ha-switch>
          </div>
        </div>
        ${rowStyle.fontSizePx || rowStyle.fontWeight
          ? html`
              <div class="control-row">
                <span class="control-label">Text size</span>
                <div class="control-right">
                  <ha-slider
                    min="8"
                    max="48"
                    step="1"
                    .value=${String(rowStyle.fontSizePx ?? 16)}
                    @change=${(e: Event) =>
                      this._updateRow(rowKey, {
                        fontSizePx: Math.max(8, parseFloat((e.target as HTMLInputElement).value) || 16),
                      })}
                  ></ha-slider>
                  <span class="value-label">${rowStyle.fontSizePx ?? 16}px</span>
                </div>
              </div>
              <div class="control-row">
                <span class="control-label">Weight</span>
                <div class="control-right">
                  <select
                    .value=${rowStyle.fontWeight ?? 'normal'}
                    @change=${(e: Event) =>
                      this._updateRow(rowKey, {
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
    rowKey: string,
    prop: 'icon' | 'text',
    rules: ThresholdRule[],
    defaultColor: string,
  ) {
    return html`
      <div class="rules-container">
        <span class="rule-label">Rules — order doesn't matter, they're sorted automatically:</span>
        ${rules.map((rule, i) => html`
          <div class="rule">
            <span class="rule-label">If value</span>
            <select
              .value=${rule.operator}
              @change=${(e: Event) => this._updateRule(rowKey, prop, i, {
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
              @change=${(e: Event) => this._updateRule(rowKey, prop, i, {
                value: parseFloat((e.target as HTMLInputElement).value) || 0,
              })}
            />
            <span class="rule-label">→</span>
            <cms-color-picker
              compact
              .value=${rule.color}
              @color-changed=${(e: CustomEvent) => this._updateRule(rowKey, prop, i, { color: e.detail.value })}
            ></cms-color-picker>
            <button @click=${() => this._removeRule(rowKey, prop, i)}>×</button>
          </div>
        `)}
        <button class="add-rule-btn" @click=${() => this._addRule(rowKey, prop)}>+ Add Rule</button>
        <div class="control-row" style="margin-top:4px">
          <span class="control-label">Default color</span>
          <div class="control-right">
            <cms-color-picker
              compact
              .value=${defaultColor}
              @color-changed=${(e: CustomEvent) => {
                const key = prop === 'icon' ? 'iconDefault' : 'textDefault';
                this._updateRow(rowKey, { [key]: e.detail.value });
              }}
            ></cms-color-picker>
            <span class="color-label">${defaultColor}</span>
          </div>
        </div>
      </div>
    `;
  }

  private _setMode(rowKey: string, prop: 'icon' | 'text', mode: 'static' | 'threshold') {
    const current = this.styles[rowKey] ?? { iconColor: '', textColor: '' };
    if (prop === 'icon') {
      this._updateRow(rowKey, {
        iconMode: mode,
        iconColor: mode === 'static' ? (current.iconColor || defaultOnColor()) : '',
        iconRules: mode === 'threshold' ? (current.iconRules ?? []) : undefined,
        iconDefault: mode === 'threshold' ? (current.iconDefault ?? '#888888') : undefined,
      });
    } else {
      this._updateRow(rowKey, {
        textMode: mode,
        textColor: mode === 'static' ? (current.textColor || '#e1e1e1') : '',
        textRules: mode === 'threshold' ? (current.textRules ?? []) : undefined,
        textDefault: mode === 'threshold' ? (current.textDefault ?? '#888888') : undefined,
      });
    }
  }

  private _addRule(rowKey: string, prop: 'icon' | 'text') {
    const current = this.styles[rowKey] ?? { iconColor: '', textColor: '' };
    const key = prop === 'icon' ? 'iconRules' : 'textRules';
    const rules = [...(current[key] ?? [])];
    rules.push({
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      operator: '<',
      value: 0,
      color: defaultOnColor(),
    });
    this._updateRow(rowKey, { [key]: rules });
  }

  private _removeRule(rowKey: string, prop: 'icon' | 'text', index: number) {
    const current = this.styles[rowKey] ?? { iconColor: '', textColor: '' };
    const key = prop === 'icon' ? 'iconRules' : 'textRules';
    const rules = [...(current[key] ?? [])];
    rules.splice(index, 1);
    this._updateRow(rowKey, { [key]: rules });
  }

  private _updateRule(rowKey: string, prop: 'icon' | 'text', index: number, changes: Partial<ThresholdRule>) {
    const current = this.styles[rowKey] ?? { iconColor: '', textColor: '' };
    const key = prop === 'icon' ? 'iconRules' : 'textRules';
    const rules = [...(current[key] ?? [])];
    rules[index] = { ...rules[index], ...changes };
    this._updateRow(rowKey, { [key]: rules });
  }
}

customElements.define('cms-entities-rows-module', EntitiesRowsModule);

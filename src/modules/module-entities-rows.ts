import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { EntitiesCardRow, EntitiesRowStyle, EntitiesRowStyles, HomeAssistant, ThresholdRule } from '../types/index.js';
import { moduleStyles, renderOverrideHint, onHeaderKeydown } from './module-base.js';
import { getCachedPalette } from '../utils/palette-storage.js';
import { findRowExtraCssConflicts } from '../utils/style-conflicts.js';
import { THEME_TEXT_COLOR } from '../parser/state-mapper.js';
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
  /** Only used for row labels (friendly names); rows render without it. */
  @property({ attribute: false }) hass?: HomeAssistant;

  /** Open sections, by the same positional row key as `styles`. */
  @state() private _openRows = new Set<string>();

  static override styles = [
    moduleStyles,
    css`
      .entity-section {
        border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
        border-radius: 6px;
        overflow: hidden;
      }
      .entity-header {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        box-sizing: border-box;
        padding: 6px 12px;
        background: var(--cms-fill);
        cursor: pointer;
        user-select: none;
        transition: background 0.15s ease;
      }
      .entity-header:hover {
        background: var(--cms-fill-hover);
      }
      .entity-header:focus-visible {
        outline: 2px solid var(--primary-color, #03a9f4);
        outline-offset: -2px;
      }
      .entity-chevron {
        font-size: 10px;
        color: var(--secondary-text-color, #727272);
        width: 14px;
        flex-shrink: 0;
      }
      /* Name may shrink (ellipsis) so a long friendly name can't push the
         entity id and the styled-dot out of a phone-width header. */
      .entity-name {
        font-size: 13px;
        font-weight: 500;
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .entity-id {
        font-size: 11px;
        color: var(--secondary-text-color, #727272);
        font-family: monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1 1 0;
        min-width: 40px;
      }
      .style-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--primary-color, #03a9f4);
        flex-shrink: 0;
      }
      .entity-body {
        padding: 12px 14px;
        border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .while-on {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 10px;
      }
      .while-on-btn {
        width: auto;
        padding: 5px 10px;
        border-style: solid;
      }
      /* Static/Threshold + its switch: on the narrowest phones the pair
         wraps (switch under the toggle) instead of the toggle shrinking
         and its buttons spilling out of it. */
      .entity-body .control-right {
        flex-wrap: wrap;
        row-gap: 6px;
      }
      .mode-toggle {
        display: flex;
        flex-shrink: 0;
        border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
        border-radius: 4px;
        overflow: hidden;
      }
      .mode-btn {
        min-height: 28px;
        padding: 3px 8px;
        font-size: 12px;
        cursor: pointer;
        background: transparent;
        color: var(--secondary-text-color, #727272);
        border: none;
      }
      .mode-btn:hover:not(.active) {
        background: var(--cms-fill-hover);
      }
      .mode-btn.active {
        background: var(--cms-tint-primary-hover);
        color: var(--cms-ink-primary);
        font-weight: 500;
      }
      /* Threshold rule rows — same look as the card-level Threshold module. */
      .rule {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        padding: 6px 8px;
        background: var(--cms-fill);
        border-radius: 4px;
      }
      .rule select {
        width: 64px;
        flex: 0 0 auto;
      }
      .rule input[type='number'] {
        flex: 1 1 64px;
        width: auto;
        min-width: 56px;
        max-width: 110px;
      }
      .rule > button {
        background: var(--cms-tint-error);
        border: 1px solid var(--cms-line-error);
        border-radius: 4px;
        color: var(--cms-ink-error);
        cursor: pointer;
        font-size: 15px;
        line-height: 1;
        min-width: 28px;
        min-height: 28px;
        padding: 2px 8px;
        margin-left: auto;
      }
      .rule > button:hover { background: var(--cms-tint-error-hover); }
      .rule-label {
        font-size: 11px;
        color: var(--secondary-text-color, #727272);
      }
      /* Same look as the card-level Threshold module's .add-btn. */
      .add-rule-btn {
        margin-top: 4px;
        padding: 7px 12px;
        cursor: pointer;
        background: var(--cms-tint-primary);
        color: var(--cms-ink-primary);
        border: 1px dashed var(--cms-line-primary);
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        width: 100%;
      }
      .add-rule-btn:hover { background: var(--cms-tint-primary-hover); }
      .rules-container {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 6px;
      }
      .divider {
        border: none;
        border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
        margin: 4px 0;
      }
      /* Rows whose styling can't be rewritten faithfully (mixed-form). */
      .frozen-note {
        margin: 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--secondary-text-color, #727272);
      }
      @media (pointer: coarse) {
        .mode-btn { min-height: 36px; }
        .rule > button { min-width: 36px; min-height: 36px; }
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
      .filter((x): x is { row: EntitiesCardRow & { entity: string }; index: number } => !!x.row?.entity);
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
    // Same precedence as HA's own row: explicit `name:`, then the entity's
    // friendly name, then the object id as a last resort.
    const friendly = this.hass?.states?.[id]?.attributes?.friendly_name;
    const baseLabel = row.name || (typeof friendly === 'string' && friendly) || id.split('.')[1] || id;
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
        <div
          class="entity-header"
          role="button"
          tabindex="0"
          aria-expanded=${isOpen ? 'true' : 'false'}
          @click=${() => this._toggleRow(rowKey)}
          @keydown=${onHeaderKeydown}
        >
          <span class="entity-chevron">${isOpen ? '▼' : '▶'}</span>
          <span class="entity-name">${label}</span>
          <span class="entity-id">${id}</span>
          ${conflicts.length
            ? html`<span class="override-badge" title="Hand-written CSS on this row is overriding these controls">⚠️</span>`
            : nothing}
          ${hasStyle ? html`<span class="style-dot" title="This row has styling"></span>` : nothing}
        </div>
        ${isOpen ? (rowStyle.frozen ? this._renderFrozen() : this._renderBody(rowKey, rowStyle, conflicts, row.state_color === false)) : nothing}
      </div>
    `;
  }

  /** A row the save path leaves untouched (EntitiesRowStyle.frozen) gets a
   *  lock note instead of controls whose edits would be silently dropped
   *  (audit v0.10 #9). */
  private _renderFrozen() {
    return html`<div class="entity-body">
      <p class="when-hint frozen-note">
        🔒 This row's styling mixes a plain style and a dictionary-form style (or its
        <code>.</code> entry isn't plain CSS) — preserved as-is; edit it in YAML.
      </p>
    </div>`;
  }

  private _renderBody(rowKey: string, rowStyle: EntitiesRowStyle, conflicts: string[] = [], stateColorOff = false) {
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
        ${iconEnabled && !stateColorOff && !rowStyle.iconWhileOn
          ? html`<div class="when-hint warn while-on">
              While this entity is on, Home Assistant colors its icon itself
              (lights always do), so this color only shows while it's off.
              <button
                class="btn-add while-on-btn"
                @click=${(e: Event) => { e.stopPropagation(); this._updateRow(rowKey, { iconWhileOn: true }); }}
              >Always use this color</button>
            </div>`
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
                  ? { textColor: THEME_TEXT_COLOR, textMode: 'static' }
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
        textColor: mode === 'static' ? (current.textColor || THEME_TEXT_COLOR) : '',
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

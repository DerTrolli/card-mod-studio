import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { EntitiesCardRow, EntitiesRowStyle, EntitiesRowStyles, HomeAssistant, ThresholdRule } from '../types/index.js';
import {
  moduleStyles, renderOverrideHint, onHeaderKeydown, renderResetButton, renderDefaultOption,
} from './module-base.js';
import { commitNumberInput, markNumberInput, revertNumberInput } from '../utils/number-input.js';
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

/** `hass.formatEntityName` (HA 2026.11+): what HA's own entities-card row
 *  calls — `formatEntityName(stateObj, row.name)` — so a row with no `name:`
 *  reads "device name + entity name". Not in the shared HomeAssistant type. */
type FormatEntityName = (stateObj: unknown, name?: unknown) => string;

/**
 * The label for an entities-card row. On HA 2026.11+ this IS HA's own text
 * (verified live: identical to the rendered row for every entity tried);
 * on older HA, or if the helper is missing or throws, the old precedence:
 * explicit `name:`, the friendly name, then the object id.
 */
export function entityRowLabel(hass: HomeAssistant | undefined, entityId: string, name?: unknown): string {
  const explicit = typeof name === 'string' && name ? name : undefined;
  const stateObj = hass?.states?.[entityId];
  const fmt = (hass as unknown as { formatEntityName?: FormatEntityName } | undefined)?.formatEntityName;
  if (stateObj && typeof fmt === 'function') {
    try {
      const text = fmt.call(hass, stateObj, explicit);
      if (typeof text === 'string' && text) return text;
    } catch {
      /* fall through to the old precedence */
    }
  }
  const friendly = stateObj?.attributes?.friendly_name;
  return explicit || (typeof friendly === 'string' && friendly) || entityId.split('.')[1] || entityId;
}

/**
 * Labels for every styleable row of an entities card, keyed by config index.
 * A label shared by several rows (two rows on one entity, or two entities
 * with the same name) is numbered on ALL of them ("Name (1)", "Name (2)");
 * a label that is unique stays bare. A generated number never lands on a
 * label some row really has ("Lamp" x2 beside a row named "Lamp (2)" become
 * "Lamp (1)" and "Lamp (3)"). Exported for the preview's hover chip.
 */
export function entityRowLabels(
  hass: HomeAssistant | undefined,
  rows: Array<EntitiesCardRow | string>,
): Map<number, string> {
  const base: Array<[number, string]> = [];
  rows.forEach((r, index) => {
    const row = typeof r === 'string' ? ({ entity: r } as EntitiesCardRow) : r;
    if (row && typeof row === 'object' && row.entity) base.push([index, entityRowLabel(hass, row.entity, row.name)]);
  });
  const total = new Map<string, number>();
  for (const [, l] of base) total.set(l, (total.get(l) ?? 0) + 1);
  const taken = new Set(base.map(([, l]) => l));
  const next = new Map<string, number>();
  const out = new Map<number, string>();
  for (const [index, l] of base) {
    if ((total.get(l) ?? 0) < 2) {
      out.set(index, l);
      continue;
    }
    let n = next.get(l) ?? 1;
    while (taken.has(`${l} (${n})`)) n++;
    next.set(l, n + 1);
    taken.add(`${l} (${n})`);
    out.set(index, `${l} (${n})`);
  }
  return out;
}

/** An entities-card row's text size when nothing is set (measured on HA 2026.11).
 *  Display-only: never written into a style. */
const ROW_NATIVE_FONT_SIZE = 14;

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
  /** Rows whose Font switch is on without anything set yet (nothing to store). */
  @state() private _fontOpen = new Set<string>();
  /** Size slider value while dragged, per row (emitted on release only). */
  @state() private _fontLive: Record<string, number> = {};

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
      .rule input.num {
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
      .rows-note {
        margin: 2px 0 0;
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

  /** Once a row's font control was used, its switch stays on even if every
   *  value is reset back to "not set". */
  private _keepFontOpen(rowKey: string) {
    if (this._fontOpen.has(rowKey)) return;
    this._fontOpen = new Set(this._fontOpen).add(rowKey);
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
    // Section / divider / weblink / entity-less button rows get no section.
    const unstyleable = this.rows.length - entityRows.length;
    if (!entityRows.length && !unstyleable) return nothing;

    // Duplicate-entity rows are valid YAML and hold independent styles —
    // an ambiguous label is numbered on every row sharing it.
    const labels = entityRowLabels(this.hass, this.rows);

    return html`
      <div class="module">
        <div class="module-header" style="cursor:default; pointer-events:none">
          <span class="module-title">🏠 Entity Rows</span>
        </div>
        <div class="module-body">
          ${entityRows.map(({ row, index }) => {
            return this._renderRow(row, index, labels.get(index) ?? row.entity);
          })}
          ${unstyleable
            ? html`<p class="when-hint rows-note">Section, divider and link rows have no styling controls.</p>`
            : nothing}
        </div>
      </div>
    `;
  }

  private _renderRow(row: EntitiesCardRow & { entity: string }, index: number, label: string) {
    const rowKey = String(index);
    const id = row.entity;
    const isOpen = this._openRows.has(rowKey);
    const rowStyle = this.styles[rowKey] ?? { iconColor: '', textColor: '' };
    const hasStyle = !!(
      rowStyle.iconColor ||
      rowStyle.iconMode === 'threshold' ||
      rowStyle.textColor ||
      rowStyle.textMode === 'threshold' ||
      rowStyle.fontSizePx != null ||
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
    const hasFont = rowStyle.fontSizePx != null || !!rowStyle.fontWeight;
    // The switch only reveals the controls; nothing is written until one is set.
    const fontOn = hasFont || this._fontOpen.has(rowKey);
    const liveSize = this._fontLive[rowKey];
    const shownSize = liveSize ?? rowStyle.fontSizePx;
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
              aria-label="Font (this row)"
              .checked=${fontOn}
              @change=${(e: Event) => {
                const on = (e.target as HTMLInputElement).checked;
                const open = new Set(this._fontOpen);
                if (on) {
                  open.add(rowKey);
                  this._fontOpen = open;
                  return;
                }
                open.delete(rowKey);
                this._fontOpen = open;
                // Nothing was set: clearing would only re-run the panel's
                // save over every row for no change.
                if (hasFont) this._updateRow(rowKey, { fontSizePx: undefined, fontWeight: undefined });
              }}
            ></ha-switch>
          </div>
        </div>
        ${fontOn
          ? html`
              <div class="control-row">
                <span class="control-label">Text size</span>
                <div class="control-right">
                  <ha-slider
                    aria-label="Text size (this row)"
                    min="8"
                    max="48"
                    step="1"
                    .value=${String(shownSize ?? ROW_NATIVE_FONT_SIZE)}
                    @input=${(e: Event) => {
                      this._fontLive = { ...this._fontLive, [rowKey]: parseFloat((e.target as HTMLInputElement).value) };
                    }}
                    @change=${(e: Event) => {
                      const { [rowKey]: _live, ...rest } = this._fontLive;
                      this._fontLive = rest;
                      this._keepFontOpen(rowKey);
                      this._updateRow(rowKey, {
                        fontSizePx: Math.max(8, parseFloat((e.target as HTMLInputElement).value) || ROW_NATIVE_FONT_SIZE),
                      });
                    }}
                  ></ha-slider>
                  ${shownSize === undefined
                    ? html`<span class="value-label unset">Default (${ROW_NATIVE_FONT_SIZE}px)</span>`
                    : html`<span class="value-label">${shownSize}px</span>${renderResetButton(() => {
                        this._keepFontOpen(rowKey);
                        this._updateRow(rowKey, { fontSizePx: undefined });
                      }, 'Reset text size to default')}`}
                </div>
              </div>
              <div class="control-row">
                <span class="control-label">Weight</span>
                <div class="control-right">
                  <select
                    aria-label="Weight (this row)"
                    .value=${rowStyle.fontWeight ?? ''}
                    @change=${(e: Event) => {
                      this._keepFontOpen(rowKey);
                      this._updateRow(rowKey, {
                        fontWeight: ((e.target as HTMLSelectElement).value || undefined) as EntitiesRowStyle['fontWeight'],
                      });
                    }}
                  >
                    ${renderDefaultOption(!rowStyle.fontWeight)}
                    <option value="normal" ?selected=${rowStyle.fontWeight === 'normal'}>Normal</option>
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
              type="text"
              class="num"
              aria-label="${prop === 'icon' ? 'Icon' : 'Text'} rule ${i + 1} value"
              aria-invalid="false"
              spellcheck="false"
              autocomplete="off"
              .value=${String(rule.value)}
              @input=${markNumberInput}
              @change=${(e: Event) => {
                // Empty / unparseable: keep the previous value (cue shows until blur).
                const n = commitNumberInput(e);
                if (n !== undefined) this._updateRule(rowKey, prop, i, { value: n });
              }}
              @blur=${(e: Event) => revertNumberInput(e, rule.value)}
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

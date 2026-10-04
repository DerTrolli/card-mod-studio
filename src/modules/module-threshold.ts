import { LitElement, html, css, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { property, state } from 'lit/decorators.js';
import type { ThresholdModuleState, ThresholdProperty, ThresholdRule, ColorStop, HomeAssistant } from '../types/index.js';
import { DEFAULT_THRESHOLD } from '../parser/state-mapper.js';
import { moduleStyles, renderOverrideBadge, renderOverrideHint, onHeaderKeydown } from './module-base.js';
import { sortThresholdRules } from '../generator/css-generator.js';
import { previewHexFor } from '../components/cms-color-picker.js';
import { thresholdPropertyAllowed } from '../utils/card-caps.js';
import { getCachedPalette } from '../utils/palette-storage.js';
import '../components/cms-color-picker.js';
import '../components/cms-entity-picker.js';

const PROPERTY_OPTIONS: Array<{ value: ThresholdProperty; label: string }> = [
  { value: 'icon-color', label: 'Icon Color' },
  { value: 'accent-color', label: 'Accent Color' },
  { value: 'background', label: 'Background' },
  { value: 'text-color', label: 'Text Color' },
  { value: 'border-color', label: 'Border Color' },
];

/** Default property order when the module is first switched on: the first
 *  one this card type supports (a gauge prefers its dial). */
const DEFAULT_PROPERTY_ORDER: ThresholdProperty[] = ['icon-color', 'background', 'text-color', 'accent-color', 'border-color'];

export class ThresholdModule extends LitElement {
  @property({ attribute: false }) state: ThresholdModuleState = {
    ...DEFAULT_THRESHOLD,
  };
  @property({ type: String }) cardEntity = '';
  /** The card's type — hides properties whose selectors don't exist there
   *  (e.g. Icon Color on a gauge) and labels Accent Color as the gauge dial. */
  @property({ type: String }) cardType = '';

  @property({ attribute: false }) hass?: HomeAssistant;

  /** True when Advanced CSS overrides this module's output — shows the
   *  warning badge/hint (computed by the panel via style-conflicts.ts). */
  @property({ attribute: false }) overridden = false;
  @property({ attribute: false }) overriddenDetail = '';

  @state() private _open = false;

  static override styles = [
    moduleStyles,
    css`
      /* Rule / fade-point rows wrap instead of clipping their delete button
         on phones and inside stack children. */
      .rule,
      .stop {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        margin-bottom: 8px;
        padding: 8px;
        background: var(--cms-fill);
        border-radius: 4px;
      }
      .rule select {
        width: 64px;
        flex: 0 0 auto;
      }
      .rule input[type='number'],
      .stop input[type='number'] {
        flex: 1 1 64px;
        width: auto;
        min-width: 56px;
        max-width: 110px;
      }
      .rule > button,
      .stop > button {
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
      .rule > button:hover:not(:disabled),
      .stop > button:hover:not(:disabled) {
        background: var(--cms-tint-error-hover);
      }
      .stop > button:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .rule-label {
        font-size: 11px;
        color: var(--secondary-text-color, #727272);
      }
      .add-btn {
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
      .add-btn:hover {
        background: var(--cms-tint-primary-hover);
      }
      .property-checks {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 14px;
      }
      .property-check {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 28px;
        font-size: 12px;
        cursor: pointer;
      }
      .property-check input {
        width: 16px;
        height: 16px;
        margin: 0;
        cursor: pointer;
        accent-color: var(--primary-color, #03a9f4);
      }
      .rules-container {
        margin-top: 12px;
      }
      .rules-label {
        font-size: 11px;
        color: var(--secondary-text-color, #727272);
        margin-bottom: 8px;
        display: block;
      }
      .legend {
        margin-top: 12px;
        padding: 10px;
        background: var(--cms-fill);
        border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .legend-title {
        font-size: 11px;
        font-weight: 600;
        color: var(--secondary-text-color, #727272);
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
        color: var(--primary-text-color, #212121);
        font-variant-numeric: tabular-nums;
      }
      .legend-sw {
        width: 26px;
        height: 16px;
        border-radius: 3px;
        box-shadow: inset 0 0 0 1px var(--cms-outline);
        flex-shrink: 0;
      }
      .stop-move {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .move-btn {
        min-width: 26px;
        padding: 1px 6px;
        cursor: pointer;
        background: var(--cms-fill);
        color: var(--secondary-text-color, #727272);
        border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
        border-radius: 3px;
        font-size: 10px;
        line-height: 1.4;
      }
      .move-btn:hover:not(:disabled) {
        background: var(--cms-fill-hover);
        color: var(--primary-text-color, #212121);
      }
      .move-btn:disabled {
        opacity: 0.3;
        cursor: default;
      }
      .gradient-bar {
        height: 20px;
        border-radius: 4px;
        box-shadow: inset 0 0 0 1px var(--cms-outline);
        margin-bottom: 6px;
      }
      .gradient-labels {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: var(--secondary-text-color, #727272);
        font-variant-numeric: tabular-nums;
        margin-bottom: 12px;
      }
      @media (pointer: coarse) {
        .move-btn {
          min-width: 34px;
          min-height: 22px;
          font-size: 11px;
        }
        .rule > button,
        .stop > button {
          min-width: 36px;
          min-height: 36px;
        }
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
    // Enabling fresh on a card where the default 'icon-color' does nothing
    // (no reachable icon): start from a property that's actually visible —
    // the dial on a gauge, else the first one this card type supports.
    if (
      this.cardType &&
      changes.enabled &&
      newState.rules.length === 0 &&
      newState.properties.length === 1 &&
      newState.properties[0] === 'icon-color' &&
      !thresholdPropertyAllowed('icon-color', this.cardType)
    ) {
      const first = this.cardType === 'gauge'
        ? 'accent-color'
        : DEFAULT_PROPERTY_ORDER.find((p) => thresholdPropertyAllowed(p, this.cardType));
      if (first) newState.properties = [first];
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
        <div
          class="module-header"
          role="button"
          tabindex="0"
          aria-expanded=${this._open ? 'true' : 'false'}
          @click=${this._toggleOpen}
          @keydown=${onHeaderKeydown}
        >
          <span class="module-chevron">${this._open ? '▼' : '▶'}</span>
          <span class="module-title">🎯 Threshold Colors</span>
          ${renderOverrideBadge(this.overridden)}
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

  /** PROPERTY_OPTIONS filtered/relabelled for this card type. A property
   *  already selected (e.g. parsed from existing YAML) is always shown so
   *  it stays visible and un-checkable rather than invisibly stuck on. */
  private _propertyOptions(): Array<{ value: ThresholdProperty; label: string }> {
    return PROPERTY_OPTIONS.filter(
      (opt) =>
        !this.cardType ||
        thresholdPropertyAllowed(opt.value, this.cardType) ||
        this.state.properties.includes(opt.value),
    ).map((opt) =>
      opt.value === 'accent-color' && this.cardType === 'gauge'
        ? { ...opt, label: 'Gauge / Accent Color' }
        : opt,
    );
  }

  private _renderBody() {
    return html`
      <div class="module-body">
        ${renderOverrideHint(this.overridden, this.overriddenDetail)}
        <div class="control-row">
          <span class="control-label">Entity</span>
          <div class="control-right">
            <cms-entity-picker
              .hass=${this.hass}
              .value=${this.state.entityId}
              .placeholder=${this.cardEntity || 'sensor.temperature'}
              label=""
              @value-changed=${(e: CustomEvent<{ value: string }>) =>
                this._emit({ entityId: e.detail.value.trim(), attribute: '' })}
            ></cms-entity-picker>
          </div>
        </div>

        ${this._renderAttributeSelect()}

        <div class="control-row">
          <span class="control-label">Apply to</span>
        </div>
        <div class="property-checks">
          ${this._propertyOptions().map(
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
                  <ha-slider
                    min="1"
                    max="16"
                    step="1"
                    .value=${String(this.state.borderWidth ?? 2)}
                    @change=${(e: Event) =>
                      this._emit({
                        borderWidth: Math.max(1, parseFloat((e.target as HTMLInputElement).value) || 2),
                      })}
                  ></ha-slider>
                  <span class="value-label">${this.state.borderWidth ?? 2}px</span>
                </div>
              </div>
            `
          : nothing}

        <div class="control-row" style="margin-top: 12px;">
          <span class="control-label">Value mode</span>
          <div class="control-right">
            <select
              .value=${this.state.valueMode}
              @change=${(e: Event) =>
                this._emit({
                  valueMode: (e.target as HTMLSelectElement).value as ThresholdModuleState['valueMode'],
                })}
            >
              <option value="switch" ?selected=${this.state.valueMode === 'switch'}>
                Step — color switches at each rule
              </option>
              <option value="gradient" ?selected=${this.state.valueMode === 'gradient'}>
                Fade — color blends smoothly between points
              </option>
            </select>
          </div>
        </div>

        ${this.state.valueMode === 'gradient' ? this._renderGradientBody() : this._renderSwitchBody()}
      </div>
    `;
  }

  /** Numeric attributes of the picked entity (rules compare via float(),
   *  so string/list attributes would always read 0). The stored attribute
   *  is always offered even when it's not currently numeric — an entity
   *  that's unavailable right now shouldn't hide the active selection. */
  private _numericAttributes(): string[] {
    const entityId = this.state.entityId || this.cardEntity;
    const attrs = this.hass?.states?.[entityId]?.attributes ?? {};
    const names = Object.keys(attrs).filter((k) => {
      const v = (attrs as Record<string, unknown>)[k];
      return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)));
    });
    const current = this.state.attribute;
    if (current && !names.includes(current)) names.unshift(current);
    return names;
  }

  private _renderAttributeSelect() {
    const options = this._numericAttributes();
    if (options.length === 0 && !this.state.attribute) return nothing;
    return html`
      <div class="control-row" style="margin-top: 8px;">
        <span class="control-label">Value read from</span>
        <div class="control-right">
          <select
            .value=${this.state.attribute ?? ''}
            @change=${(e: Event) => this._emit({ attribute: (e.target as HTMLSelectElement).value })}
          >
            <option value="" ?selected=${!this.state.attribute}>State (default)</option>
            ${options.map(
              (name) => html`<option value=${name} ?selected=${this.state.attribute === name}>
                Attribute: ${name}
              </option>`,
            )}
          </select>
        </div>
      </div>
    `;
  }

  private _renderSwitchBody() {
    return html`
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
    `;
  }

  private _renderGradientBody() {
    const stops = [...this.state.colorStops].sort((a, b) => a.value - b.value);
    return html`
      <div class="rules-container">
        <span class="rules-label">
          Points — the color fades smoothly between them; values outside this range stay
          clamped to the nearest end:
        </span>
        ${repeat(
          stops,
          (stop) => stop.id,
          (stop, sortedIndex) => this._renderStop(stop, sortedIndex, stops.length),
        )}
        <button class="add-btn" @click=${this._addStop}>+ Add Point</button>
      </div>
      ${this._renderGradientPreview(stops)}
    `;
  }

  private _renderGradientPreview(stops: ColorStop[]) {
    if (stops.length < 2) {
      return html`<div class="when-hint">Add at least 2 points to see a preview.</div>`;
    }
    const hexStops = stops.map((s) => `${previewHexFor(s.color)} ${(
      ((s.value - stops[0].value) / (stops[stops.length - 1].value - stops[0].value || 1)) * 100
    ).toFixed(1)}%`);
    return html`
      <div class="gradient-bar" style="background: linear-gradient(90deg, ${hexStops.join(', ')})"></div>
      <div class="gradient-labels">
        <span>${stops[0].value}</span>
        <span>${stops[stops.length - 1].value}</span>
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
          @change=${(e: Event) =>
            this._onValueChange(index, (e.target as HTMLInputElement).value)}
        />
        <span class="rule-label">→</span>
        <cms-color-picker
          compact
          .value=${rule.color}
          @color-changed=${(e: CustomEvent) => this._onRuleColorChange(index, e.detail.value)}
        ></cms-color-picker>
        <button aria-label="Remove rule" title="Remove rule" @click=${() => this._removeRule(index)}>×</button>
      </div>
    `;
  }

  private _renderStop(stop: ColorStop, sortedIndex: number, sortedCount: number) {
    const index = this.state.colorStops.findIndex((s) => s.id === stop.id);
    return html`
      <div class="stop">
        <div class="stop-move">
          <button
            class="move-btn"
            @click=${() => this._swapStop(sortedIndex, -1)}
            ?disabled=${sortedIndex === 0}
            title="Swap with the point above"
            aria-label="Move point up"
          >▲</button>
          <button
            class="move-btn"
            @click=${() => this._swapStop(sortedIndex, 1)}
            ?disabled=${sortedIndex === sortedCount - 1}
            title="Swap with the point below"
            aria-label="Move point down"
          >▼</button>
        </div>
        <span class="rule-label">At value</span>
        <input
          type="number"
          .value=${String(stop.value)}
          @change=${(e: Event) =>
            this._onStopValueChange(index, (e.target as HTMLInputElement).value)}
        />
        <span class="rule-label">→</span>
        <cms-color-picker
          compact
          .value=${stop.color}
          @color-changed=${(e: CustomEvent) => this._onStopColorChange(index, e.detail.value)}
        ></cms-color-picker>
        <button
          @click=${() => this._removeStop(index)}
          ?disabled=${this.state.colorStops.length <= 2}
          title=${this.state.colorStops.length <= 2 ? 'At least 2 points are required' : 'Remove point'}
          aria-label="Remove point"
        >×</button>
      </div>
    `;
  }

  private _addRule() {
    const newRule: ThresholdRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      operator: '<',
      value: 0,
      // Same "what a fresh control starts with" convention as the row-level
      // builder and the Icon/Accent modules: palette ON-default when set.
      color: getCachedPalette().defaults.onColor ?? '#2196F3',
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

  private _addStop() {
    const values = this.state.colorStops.map((s) => s.value);
    const nextValue = values.length ? Math.max(...values) + 10 : 0;
    const newStop: ColorStop = {
      id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      value: nextValue,
      // Stops need concrete hex (interpolation) — previewHexFor resolves a
      // palette var() ON-default the same way stop color picks resolve.
      color: previewHexFor(getCachedPalette().defaults.onColor ?? '#2196F3'),
    };
    this._emit({ colorStops: [...this.state.colorStops, newStop] });
  }

  private _removeStop(index: number) {
    if (this.state.colorStops.length <= 2) return; // gradientToRules needs at least 2
    const colorStops = [...this.state.colorStops];
    colorStops.splice(index, 1);
    this._emit({ colorStops });
  }

  private _onStopValueChange(index: number, value: string) {
    const colorStops = [...this.state.colorStops];
    colorStops[index] = { ...colorStops[index], value: parseFloat(value) || 0 };
    this._emit({ colorStops });
  }

  private _onStopColorChange(index: number, color: string) {
    // Gradient interpolation needs concrete RGB — resolve a palette var(--x-color)
    // pick (or a bare CSS color name) to its hex equivalent, same as legend swatches do.
    const colorStops = [...this.state.colorStops];
    colorStops[index] = { ...colorStops[index], color: previewHexFor(color) };
    this._emit({ colorStops });
  }

  /**
   * Swaps the *colors* of two adjacent (by sorted value) points, leaving
   * their values fixed — "move this point up/down" reads naturally, but
   * what it needs to actually do is exchange which color sits at which
   * value slot. Swapping the values instead would be a no-op once
   * re-sorted (the two rows would just trade places and look identical).
   */
  private _swapStop(sortedIndex: number, direction: -1 | 1) {
    const sorted = [...this.state.colorStops].sort((a, b) => a.value - b.value);
    const other = sorted[sortedIndex + direction];
    const current = sorted[sortedIndex];
    if (!other || !current) return;
    const colorStops = this.state.colorStops.map((s) => {
      if (s.id === current.id) return { ...s, color: other.color };
      if (s.id === other.id) return { ...s, color: current.color };
      return s;
    });
    this._emit({ colorStops });
  }
}

customElements.define('cms-threshold-module', ThresholdModule);

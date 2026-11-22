import { LitElement, html, css, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { property, state } from 'lit/decorators.js';
import type { ThresholdModuleState, ThresholdProperty, ThresholdRule, ColorStop, HomeAssistant } from '../types/index.js';
import { isTextRule } from '../types/index.js';
import { commitTextRuleValue, normalizeRule, rawRuleValue, revertTextRuleValue, withOperator } from '../utils/threshold-rules.js';
import { DEFAULT_THRESHOLD } from '../parser/state-mapper.js';
import { moduleStyles, renderOverrideHint, renderModuleHeader, guardSliderTouch, nameSwitches, prepareSliders,
  editState,
} from './module-base.js';
import { thresholdSummary } from './module-summary.js';
import { sortThresholdRules } from '../generator/css-generator.js';
import { commitNumberInput, markNumberInput, revertNumberInput } from '../utils/number-input.js';
import { previewHexFor } from '../components/cms-color-picker.js';
import { thresholdPropertyAllowed } from '../utils/card-caps.js';
import { thresholdColorsWithoutTriplet, tripletHint } from '../utils/rgb-triplet.js';
import { colorDefaults } from '../utils/palette-storage.js';
import '../components/cms-color-picker.js';
import '../components/cms-entity-picker.js';
import { LangController, t, type MessageKey } from '../i18n/index.js';

/** The legend's {op} and {value} for a rule: a text rule reads `is "heating"`. */
export function legendParts(r: ThresholdRule): { op: string; value: string } {
  if (!isTextRule(r)) return { op: r.operator, value: String(r.value) };
  return { op: t(r.operator === 'is' ? 'threshold.opIs' : 'threshold.opIsNot'), value: `“${r.value}”` };
}

const PROPERTY_OPTIONS: Array<{ value: ThresholdProperty; label: MessageKey }> = [
  { value: 'icon-color', label: 'threshold.prop.iconColor' },
  { value: 'accent-color', label: 'threshold.prop.accentColor' },
  { value: 'background', label: 'threshold.prop.background' },
  { value: 'text-color', label: 'threshold.prop.textColor' },
  { value: 'border-color', label: 'threshold.prop.borderColor' },
];

/** Default property order when the module is first switched on: the first
 *  one this card type supports (a gauge prefers its dial). */
const DEFAULT_PROPERTY_ORDER: ThresholdProperty[] = ['icon-color', 'background', 'text-color', 'accent-color', 'border-color'];

export class ThresholdModule extends LitElement {
  protected readonly i18n = new LangController(this);
  @property({ attribute: false }) state: ThresholdModuleState = {
    ...DEFAULT_THRESHOLD,
  };
  @property({ type: String }) cardEntity = '';
  /** The card's type — hides properties whose selectors don't exist there
   *  (e.g. Icon Color on a gauge) and labels Accent Color as the gauge dial. */
  @property({ type: String }) cardType = '';
  /** The card's own config — some properties are dead while it sets e.g.
   *  `icon_color` (a custom profile's configGates). */
  @property({ attribute: false }) cardConfig?: object;
  /** The card writes Accent as `R, G, B` (Mushroom) — unconvertible colours get a hint. */
  @property({ type: Boolean, attribute: 'triplet-accent' }) tripletAccent = false;

  @property({ attribute: false }) hass?: HomeAssistant;

  /** True when Advanced CSS overrides this module's output — shows the
   *  warning badge/hint (computed by the panel via style-conflicts.ts). */
  @property({ attribute: false }) overridden = false;
  @property({ attribute: false }) overriddenDetail = '';
  /** v1.0: offer "Let this module take over" (plain Advanced CSS only). */
  @property({ attribute: false }) takeOver = false;

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
      /* "is not" (and its translations) needs more than a symbol's width. */
      .rule select.text-op {
        width: auto;
        min-width: 64px;
        max-width: 132px;
      }
      .rule input.text-value {
        flex: 1 1 96px;
        width: auto;
        min-width: 72px;
        max-width: 180px;
      }
      .now-value {
        margin: 6px 0;
        overflow-wrap: anywhere;
      }
      .rule input.num,
      .stop input.num {
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
      .property-check {
        position: relative;
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
        /* The two move buttons stack at 22px each; side by side they can each
           be 40 x 40 without making the row any taller (the row wraps). */
        .stop-move {
          flex-direction: row;
          gap: 4px;
        }
        .move-btn {
          min-width: 40px;
          min-height: 40px;
          font-size: 11px;
        }
        .rule > button,
        .stop > button {
          min-width: 40px;
          min-height: 40px;
        }
        /* "+ Add Rule" / "+ Add Point": 30px high on a mouse. */
        .add-btn {
          min-height: 40px;
        }
        /* The checkbox is 16px; its label is the tap target — reach 40px high
           without taller rows. */
        .property-checks {
          row-gap: 12px;
        }
        .property-check::before {
          content: '';
          position: absolute;
          inset: -6px -4px;
        }
      }
    `,
  ];

  override updated(changed: Map<PropertyKey, unknown>) {
    nameSwitches(this.renderRoot);
    prepareSliders(this.renderRoot);
    if (changed.has('state')) {
      const prev = changed.get('state') as ThresholdModuleState | undefined;
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
    }
  }

  private _toggleOpen() {
    this._open = !this._open;
  }

  private get _cfg(): Record<string, unknown> | undefined {
    return this.cardConfig as Record<string, unknown> | undefined;
  }

  private _emit(changes: Partial<ThresholdModuleState>) {
    const newState = editState(this.state, changes);
    // Switched on now — by its switch, or by a first change while it was off.
    const enabling = newState.enabled && !this.state.enabled;
    // Auto-set entityId to cardEntity when enabling if empty
    if (enabling && !newState.entityId && this.cardEntity) {
      newState.entityId = this.cardEntity;
    }
    // Enabling fresh on a card where the default 'icon-color' does nothing
    // (no reachable icon): start from a property that's actually visible —
    // the dial on a gauge, else the first one this card type supports.
    if (
      this.cardType &&
      enabling &&
      newState.rules.length === 0 &&
      newState.properties.length === 1 &&
      newState.properties[0] === 'icon-color' &&
      !thresholdPropertyAllowed('icon-color', this.cardType, this._cfg)
    ) {
      const first = this.cardType === 'gauge'
        ? 'accent-color'
        : DEFAULT_PROPERTY_ORDER.find((p) => thresholdPropertyAllowed(p, this.cardType, this._cfg));
      if (first) newState.properties = [first];
    }
    this.dispatchEvent(
      new CustomEvent<ThresholdModuleState>('state-changed', {
        detail: newState,
      }),
    );
  }

  override connectedCallback() {
    super.connectedCallback();
    guardSliderTouch(this.renderRoot);
  }

  override render() {
    return html`
      <div class="module">
        ${renderModuleHeader({
          icon: 'mdi:stairs',
          summary: this.state.enabled ? thresholdSummary(this.state) : undefined,
          title: t('threshold.title'),
          open: this._open,
          onToggle: () => this._toggleOpen(),
          overridden: this.overridden,
          enable: {
            checked: this.state.enabled,
            onChange: (enabled) => this._emit({ enabled }),
          },
        })}
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
  private _propertyOptions(): Array<{ value: ThresholdProperty; label: MessageKey }> {
    return PROPERTY_OPTIONS.filter(
      (opt) =>
        !this.cardType ||
        thresholdPropertyAllowed(opt.value, this.cardType, this._cfg) ||
        this.state.properties.includes(opt.value),
    ).map((opt) =>
      opt.value === 'accent-color' && this.cardType === 'gauge'
        ? { ...opt, label: 'threshold.prop.gaugeAccent' as MessageKey }
        : opt,
    );
  }

  private _renderBody() {
    return html`
      <div class="module-body" id="module-body">
        ${renderOverrideHint(this.overridden, this.overriddenDetail, this.takeOver ? 'threshold' : undefined)}
        ${this.tripletAccent && thresholdColorsWithoutTriplet(this.state).length
          ? html`<div class="when-hint warn">${tripletHint(thresholdColorsWithoutTriplet(this.state))}</div>`
          : nothing}
        <div class="control-row">
          <span class="control-label">${t('base.entity')}</span>
          <div class="control-right">
            <cms-entity-picker
              .hass=${this.hass}
              .value=${this.state.entityId}
              .placeholder=${this.cardEntity || 'sensor.temperature'}
              label=""
              accessible-name=${t('cond.valueEntity')}
              @value-changed=${(e: CustomEvent<{ value: string }>) =>
                this._emit({ entityId: e.detail.value.trim(), attribute: '' })}
            ></cms-entity-picker>
          </div>
        </div>

        ${this._renderAttributeSelect()}

        <div class="control-row">
          <span class="control-label">${t('threshold.applyTo')}</span>
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
                ${t(opt.label)}
              </label>
            `,
          )}
        </div>
        ${this.state.properties.length === 0
          ? html`<div class="when-hint">${t('threshold.selectOne')}</div>`
          : nothing}

        ${this.state.properties.includes('border-color')
          ? html`
              <div class="control-row">
                <span class="control-label">${t('border.width')}</span>
                <div class="control-right">
                  <ha-slider
                    label=${t('border.width')}
                    aria-label=${t('border.width')}
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
          <span class="control-label" id="lbl-value-mode">${t('threshold.valueMode')}</span>
          <div class="control-right">
            <select
              aria-labelledby="lbl-value-mode"
              .value=${this.state.valueMode}
              @change=${(e: Event) =>
                this._emit({
                  valueMode: (e.target as HTMLSelectElement).value as ThresholdModuleState['valueMode'],
                })}
            >
              <option value="switch" ?selected=${this.state.valueMode === 'switch'}>
                ${t('threshold.step')}
              </option>
              <option value="gradient" ?selected=${this.state.valueMode === 'gradient'}>
                ${t('threshold.fade')}
              </option>
            </select>
          </div>
        </div>

        ${this.state.valueMode === 'gradient' ? this._renderGradientBody() : this._renderSwitchBody()}
      </div>
    `;
  }

  /** Numeric attributes of the picked entity (number rules compare via
   *  float(), so string/list attributes would always read 0) — plus text
   *  attributes (`hvac_action`, …) while a text rule exists (v1.0.0-beta.2).
   *  The stored attribute is always offered even when it's not currently
   *  numeric — an entity that's unavailable right now shouldn't hide the
   *  active selection. */
  private _numericAttributes(): string[] {
    const entityId = this.state.entityId || this.cardEntity;
    const attrs = this.hass?.states?.[entityId]?.attributes ?? {};
    const text = this.state.valueMode !== 'gradient' && this.state.rules.some(isTextRule);
    const names = Object.keys(attrs).filter((k) => {
      const v = (attrs as Record<string, unknown>)[k];
      if (text && (typeof v === 'string' || typeof v === 'boolean')) return true;
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
        <span class="control-label" id="lbl-value-read-from">${t('cond.valueReadFrom')}</span>
        <div class="control-right">
          <select
            aria-labelledby="lbl-value-read-from"
            .value=${this.state.attribute ?? ''}
            @change=${(e: Event) => this._emit({ attribute: (e.target as HTMLSelectElement).value })}
          >
            <option value="" ?selected=${!this.state.attribute}>${t('cond.state')}</option>
            ${options.map(
              (name) => html`<option value=${name} ?selected=${this.state.attribute === name}>
                ${t('cond.attribute', { name })}
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
        <span class="rules-label">${t('threshold.rulesLabel')}</span>
        ${this.state.rules.map((rule, i) => this._renderRule(rule, i))}
        <button class="add-btn" @click=${this._addRule}>${t('threshold.addRule')}</button>
        ${this._renderNowValue()}
      </div>

      <div class="control-row" style="margin-top: 12px;">
        <span class="control-label" id="lbl-default-color">${t('threshold.defaultColor')}</span>
        <div class="control-right">
          <cms-color-picker
            label=${t('threshold.defaultColor')}
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
        <span class="rules-label">${t('threshold.pointsLabel')}</span>
        ${repeat(
          stops,
          (stop) => stop.id,
          (stop, sortedIndex) => this._renderStop(stop, sortedIndex, stops.length),
        )}
        <button class="add-btn" @click=${this._addStop}>${t('threshold.addPoint')}</button>
      </div>
      ${this._renderGradientPreview(stops)}
    `;
  }

  private _renderGradientPreview(stops: ColorStop[]) {
    if (stops.length < 2) {
      return html`<div class="when-hint">${t('threshold.previewNeeds2')}</div>`;
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
          <span class="legend-title">${t('threshold.result')}</span>
          <div class="legend-row">
            <span class="legend-cond">${t('when.always')}</span>${defaultSwatch}
          </div>
        </div>
      `;
    }

    return html`
      <div class="legend">
        <span class="legend-title">${t('threshold.resultFirst')}</span>
        ${sorted.map(
          (r, i) => html`
            <div class="legend-row">
              <span class="legend-cond">
                ${t(i === 0 ? 'threshold.legendIf' : 'threshold.legendElseIf', legendParts(r))}
              </span>
              <span class="legend-sw" style="background:${previewHexFor(r.color)}"></span>
            </div>
          `,
        )}
        <div class="legend-row">
          <span class="legend-cond">${t('threshold.otherwise')}</span>${defaultSwatch}
        </div>
      </div>
    `;
  }

  /** Text rules compare the raw state: show what it is right now. */
  private _renderNowValue() {
    if (!this.state.rules.some(isTextRule)) return nothing;
    const now = rawRuleValue(this.hass, this.state.entityId || this.cardEntity, this.state.attribute || undefined);
    return html`<div class="when-hint now-value">${now === null ? t('threshold.textHint') : t('threshold.nowValue', { value: now })}</div>`;
  }

  private _renderRule(rule: ThresholdRule, index: number) {
    const text = isTextRule(rule);
    const now = text ? rawRuleValue(this.hass, this.state.entityId || this.cardEntity, this.state.attribute || undefined) : null;
    return html`
      <div class="rule">
        <span class="rule-label">${t('threshold.ifValue')}</span>
        <select
          class=${text ? 'text-op' : ''}
          aria-label=${t('threshold.ruleOperator', { n: index + 1 })}
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
          <option value="is" ?selected=${rule.operator === 'is'}>${t('threshold.opIs')}</option>
          <option value="is-not" ?selected=${rule.operator === 'is-not'}>${t('threshold.opIsNot')}</option>
        </select>
        ${text
          ? html`<input
              type="text"
              class="text-value"
              aria-label=${t('threshold.ruleText', { n: index + 1 })}
              aria-invalid="false"
              spellcheck="false"
              autocomplete="off"
              placeholder=${now ?? ''}
              .value=${String(rule.value)}
              @change=${(e: Event) => this._onTextValueChange(index, e)}
              @blur=${(e: Event) => revertTextRuleValue(e, String(rule.value))}
            />`
          : html`<input
              type="text"
              class="num"
              aria-label=${t('threshold.ruleValue', { n: index + 1 })}
              aria-invalid="false"
              spellcheck="false"
              autocomplete="off"
              .value=${String(rule.value)}
              @input=${markNumberInput}
              @change=${(e: Event) => this._onValueChange(index, e)}
              @blur=${(e: Event) => revertNumberInput(e, Number(rule.value))}
            />`}
        <span class="rule-label">→</span>
        <cms-color-picker
          label=${t('threshold.ruleColor', { n: index + 1 })}
          compact
          .value=${rule.color}
          @color-changed=${(e: CustomEvent) => this._onRuleColorChange(index, e.detail.value)}
        ></cms-color-picker>
        <button aria-label=${t('threshold.removeRuleN', { n: index + 1 })} title=${t('threshold.removeRule')} @click=${() => this._removeRule(index)}>×</button>
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
            title=${t('threshold.swapUp')}
            aria-label=${t('threshold.stopUp', { n: index + 1 })}
          >▲</button>
          <button
            class="move-btn"
            @click=${() => this._swapStop(sortedIndex, 1)}
            ?disabled=${sortedIndex === sortedCount - 1}
            title=${t('threshold.swapDown')}
            aria-label=${t('threshold.stopDown', { n: index + 1 })}
          >▼</button>
        </div>
        <span class="rule-label">${t('threshold.atValue')}</span>
        <input
          type="text"
          class="num"
          aria-label=${t('threshold.stopValue', { n: index + 1 })}
          aria-invalid="false"
          spellcheck="false"
          autocomplete="off"
          .value=${String(stop.value)}
          @input=${markNumberInput}
          @change=${(e: Event) => this._onStopValueChange(index, e)}
          @blur=${(e: Event) => revertNumberInput(e, stop.value)}
        />
        <span class="rule-label">→</span>
        <cms-color-picker
          label=${t('threshold.stopColor', { n: index + 1 })}
          compact
          .value=${stop.color}
          @color-changed=${(e: CustomEvent) => this._onStopColorChange(index, e.detail.value)}
        ></cms-color-picker>
        <button
          @click=${() => this._removeStop(index)}
          ?disabled=${this.state.colorStops.length <= 2}
          title=${this.state.colorStops.length <= 2 ? t('threshold.minPoints') : t('threshold.removePoint')}
          aria-label=${t('threshold.removeStopN', { n: index + 1 })}
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
      color: colorDefaults().onColor ?? '#2196F3',
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
    let next = withOperator(rules[index], operator as ThresholdRule['operator']);
    // A new text rule starts from the state right now (e.g. `heating`) when
    // that is text; a number state would make it a number rule (normalizeRule).
    if (isTextRule(next) && !isTextRule(rules[index])) {
      const now = rawRuleValue(this.hass, this.state.entityId || this.cardEntity, this.state.attribute || undefined);
      if (now && isTextRule(normalizeRule({ ...next, value: now }))) next = { ...next, value: now };
    }
    rules[index] = next;
    this._emit({ rules });
  }

  private _onTextValueChange(index: number, e: Event) {
    const value = commitTextRuleValue(e);
    if (value === undefined) return;
    const rules = [...this.state.rules];
    rules[index] = normalizeRule({ ...rules[index], value });
    this._emit({ rules });
  }

  /** An empty / unparseable field stores nothing (it keeps the previous value
   *  and its invalid cue); a rule always exists with a number — "Add rule"
   *  creates it as 0, so there is no empty NEW rule. */
  private _onValueChange(index: number, e: Event) {
    const value = commitNumberInput(e);
    if (value === undefined) return;
    const rules = [...this.state.rules];
    rules[index] = { ...rules[index], value };
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
      color: previewHexFor(colorDefaults().onColor ?? '#2196F3'),
    };
    this._emit({ colorStops: [...this.state.colorStops, newStop] });
  }

  private _removeStop(index: number) {
    if (this.state.colorStops.length <= 2) return; // gradientToRules needs at least 2
    const colorStops = [...this.state.colorStops];
    colorStops.splice(index, 1);
    this._emit({ colorStops });
  }

  private _onStopValueChange(index: number, e: Event) {
    const value = commitNumberInput(e);
    if (value === undefined) return;
    const colorStops = [...this.state.colorStops];
    colorStops[index] = { ...colorStops[index], value };
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

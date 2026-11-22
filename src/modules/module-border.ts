import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { BorderModuleState, HomeAssistant } from '../types/index.js';
import { DEFAULT_BORDER } from '../parser/state-mapper.js';
import {
  moduleStyles,
  renderOverrideHint,
  renderThresholdOwnedHint,
  renderCondition,
  renderModuleHeader,
  guardSliderTouch, nameSwitches, prepareSliders,
} from './module-base.js';
import { borderSummary } from './module-summary.js';
import '../components/cms-color-picker.js';
import { stateKindFor } from '../utils/card-caps.js';
import { LangController, t } from '../i18n/index.js';

export class BorderModule extends LitElement {
  @property({ attribute: false }) state: BorderModuleState = { ...DEFAULT_BORDER };
  @property({ type: Boolean, attribute: 'state-aware' }) stateAware = true;
  /** The card's own entity id — tells an OFF-only entity (climate) from a never-on/off one. */
  @property({ type: String }) cardEntity = '';
  @property({ attribute: false }) hass?: HomeAssistant;

  /** True when Advanced CSS overrides this module's output — shows the
   *  warning badge/hint (computed by the panel via style-conflicts.ts). */
  @property({ attribute: false }) overridden = false;
  @property({ attribute: false }) overriddenDetail = '';
  /** v1.0: offer "Let this module take over" (plain Advanced CSS only). */
  @property({ attribute: false }) takeOver = false;
  /** Threshold Colors is currently writing this module's property. */
  @property({ attribute: false }) thresholdOwned = false;

  protected readonly i18n = new LangController(this);

  @state() private _open = false;
  @state() private _radiusPx = DEFAULT_BORDER.radiusPx;
  @state() private _borderWidth = DEFAULT_BORDER.borderWidth;

  static override styles = [moduleStyles, css``];

  override firstUpdated() {
    this._open = this.state.enabled;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    nameSwitches(this.renderRoot);
    prepareSliders(this.renderRoot);
    if (changed.has('state')) {
      const prev = changed.get('state') as BorderModuleState | undefined;
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
      this._radiusPx = this.state.radiusPx;
      this._borderWidth = this.state.borderWidth;
    }
  }

  private _toggleOpen() {
    this._open = !this._open;
  }

  private _emit(changes: Partial<BorderModuleState>) {
    this.dispatchEvent(
      new CustomEvent<BorderModuleState>('state-changed', {
        detail: { ...this.state, ...changes },
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
          icon: 'mdi:rounded-corner',
          summary: this.state.enabled ? borderSummary(this.state) : undefined,
          title: t('border.title'),
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

  private _renderBody() {
    return html`
      <div class="module-body" id="module-body">
        ${renderOverrideHint(this.overridden, this.overriddenDetail, this.takeOver ? 'border' : undefined)}
        ${renderThresholdOwnedHint(this.thresholdOwned, 'noun.borderColor', 'threshold.prop.borderColor')}
        <div class="control-row">
          <span class="control-label">${t('border.radius')}</span>
          <div class="control-right">
            <ha-slider
              label=${t('border.radius')}
              aria-label=${t('border.radius')}
              min="0"
              max="50"
              step="1"
              ?disabled=${!!this.state.squareCorners}
              .value=${String(this.state.squareCorners ? 0 : this._radiusPx)}
              @input=${(e: Event) => {
                this._radiusPx = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) =>
                this._emit({
                  radiusPx: parseFloat((e.target as HTMLInputElement).value),
                })}
            ></ha-slider>
            ${this.state.squareCorners || this._radiusPx > 0
              ? html`<span class="value-label">${this.state.squareCorners ? 0 : this._radiusPx}px</span>`
              : html`<span class="value-label unset">${t('border.cardDefaultLabel')}</span>`}
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">${t('border.square')}</span>
          <div class="control-right">
            <ha-switch
              aria-label=${t('border.square')}
              .checked=${!!this.state.squareCorners}
              @change=${(e: Event) => {
                const on = (e.target as HTMLInputElement).checked;
                this._emit(on ? { squareCorners: true, radiusPx: 0 } : { squareCorners: undefined });
              }}
            ></ha-switch>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">${t('border.width')}</span>
          <div class="control-right">
            <ha-slider
              label=${t('border.width')}
              aria-label=${t('border.width')}
              min="0"
              max="8"
              step="1"
              .value=${String(this._borderWidth)}
              @input=${(e: Event) => {
                this._borderWidth = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) =>
                this._emit({
                  borderWidth: parseFloat((e.target as HTMLInputElement).value),
                })}
            ></ha-slider>
            <span class="value-label">${this._borderWidth}px</span>
          </div>
        </div>

        ${this.state.borderWidth > 0 || this._borderWidth > 0
          ? html`
              <div class="control-row">
                <span class="control-label">${t('border.color')}</span>
                <div class="control-right">
                  <cms-color-picker
                    label=${t('border.color')}
                    .value=${this.state.borderColor}
                    @color-changed=${(e: CustomEvent) =>
                      this._emit({ borderColor: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
              ${renderCondition({
                condition: this.state.widthWhen,
                stateAware: this.stateAware,
                offOnly: stateKindFor(this.stateAware, this.cardEntity) === 'off-only',
                noun: 'noun.border',
                hass: this.hass,
                onChange: (c) => this._emit({ widthWhen: c }),
              })}
              ${this.state.widthWhen && this.state.widthWhen.when !== 'always'
                ? html`
                    <div class="control-row">
                      <span class="control-label">${t('border.widthOtherwise')}</span>
                      <div class="control-right">
                        <ha-slider
                          label=${t('border.widthOtherwise')}
                          aria-label=${t('border.widthOtherwise')}
                          min="0"
                          max="8"
                          step="1"
                          .value=${String(this.state.widthOffPx ?? 0)}
                          @change=${(e: Event) =>
                            this._emit({
                              widthOffPx: parseFloat((e.target as HTMLInputElement).value),
                            })}
                        ></ha-slider>
                        <span class="value-label">
                          ${(this.state.widthOffPx ?? 0) > 0
                            ? `${this.state.widthOffPx}px`
                            : t('border.cardDefault')}
                        </span>
                      </div>
                    </div>
                  `
                : nothing}
            `
          : nothing}
      </div>
    `;
  }
}

customElements.define('cms-border-module', BorderModule);

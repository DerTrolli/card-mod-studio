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
  guardSliderTouch,
} from './module-base.js';
import '../components/cms-color-picker.js';
import { stateKindFor } from '../utils/card-caps.js';

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
  /** Threshold Colors is currently writing this module's property. */
  @property({ attribute: false }) thresholdOwned = false;

  @state() private _open = false;
  @state() private _radiusPx = DEFAULT_BORDER.radiusPx;
  @state() private _borderWidth = DEFAULT_BORDER.borderWidth;

  static override styles = [moduleStyles, css``];

  override firstUpdated() {
    this._open = this.state.enabled;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
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
          icon: '📐',
          title: 'Border & Radius',
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
        ${renderOverrideHint(this.overridden, this.overriddenDetail)}
        ${renderThresholdOwnedHint(this.thresholdOwned, 'border color', 'Border Color')}
        <div class="control-row">
          <span class="control-label">Border radius</span>
          <div class="control-right">
            <ha-slider
              label="Border radius"
              aria-label="Border radius"
              min="0"
              max="50"
              step="1"
              .value=${String(this._radiusPx)}
              @input=${(e: Event) => {
                this._radiusPx = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) =>
                this._emit({
                  radiusPx: parseFloat((e.target as HTMLInputElement).value),
                })}
            ></ha-slider>
            <span class="value-label">${this._radiusPx}px</span>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Border width</span>
          <div class="control-right">
            <ha-slider
              label="Border width"
              aria-label="Border width"
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
                <span class="control-label">Border color</span>
                <div class="control-right">
                  <cms-color-picker
                    label="Border color"
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
                noun: 'border',
                hass: this.hass,
                onChange: (c) => this._emit({ widthWhen: c }),
              })}
              ${this.state.widthWhen && this.state.widthWhen.when !== 'always'
                ? html`
                    <div class="control-row">
                      <span class="control-label">Width otherwise</span>
                      <div class="control-right">
                        <ha-slider
                          label="Width otherwise"
                          aria-label="Width otherwise"
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
                            : 'card default'}
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

import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { BackgroundModuleState, HomeAssistant } from '../types/index.js';
import { DEFAULT_BACKGROUND } from '../parser/state-mapper.js';
import { moduleStyles, renderWhen, renderOverrideBadge, renderOverrideHint } from './module-base.js';
import '../components/cms-color-picker.js';

export class BackgroundModule extends LitElement {
  @property({ attribute: false }) state: BackgroundModuleState = {
    ...DEFAULT_BACKGROUND,
  };

  /** False when the card has no binary entity state (e.g. sensor cards). */
  @property({ type: Boolean, attribute: 'state-aware' }) stateAware = true;

  @property({ attribute: false }) hass?: HomeAssistant;

  /** True when Advanced CSS overrides this module's output — shows the
   *  warning badge/hint (computed by the panel via style-conflicts.ts). */
  @property({ attribute: false }) overridden = false;
  @property({ attribute: false }) overriddenDetail = '';

  @state() private _open = false;
  @state() private _angle = DEFAULT_BACKGROUND.angle;

  static override styles = [moduleStyles, css``];

  override firstUpdated() {
    this._open = this.state.enabled;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('state')) {
      const prev = changed.get('state') as BackgroundModuleState | undefined;
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
      this._angle = this.state.angle;
    }
  }

  private _toggleOpen() {
    this._open = !this._open;
  }

  private _emit(changes: Partial<BackgroundModuleState>) {
    this.dispatchEvent(
      new CustomEvent<BackgroundModuleState>('state-changed', {
        detail: { ...this.state, ...changes },
      }),
    );
  }

  override render() {
    return html`
      <div class="module">
        <div class="module-header" @click=${this._toggleOpen}>
          <span class="module-chevron">${this._open ? '▼' : '▶'}</span>
          <span class="module-title">🖼️ Background</span>
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

  private _renderBody() {
    return html`
      <div class="module-body">
        ${renderOverrideHint(this.overridden, this.overriddenDetail)}
        <div class="control-row">
          <span class="control-label">Type</span>
          <div class="control-right">
            <select
              .value=${this.state.type}
              @change=${(e: Event) =>
                this._emit({
                  type: (e.target as HTMLSelectElement).value as 'solid' | 'gradient',
                })}
            >
              <option value="solid" ?selected=${this.state.type === 'solid'}>Solid color</option>
              <option value="gradient" ?selected=${this.state.type === 'gradient'}>
                Gradient
              </option>
            </select>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">
            ${this.state.type === 'gradient' ? 'Color 1' : 'Color'}
          </span>
          <div class="control-right">
            <cms-color-picker
              .value=${this.state.color1}
              @color-changed=${(e: CustomEvent) =>
                this._emit({ color1: e.detail.value })}
            ></cms-color-picker>
          </div>
        </div>

        ${this.state.type === 'gradient'
          ? html`
              <div class="control-row">
                <span class="control-label">Color 2</span>
                <div class="control-right">
                  <cms-color-picker
                    .value=${this.state.color2}
                    @color-changed=${(e: CustomEvent) =>
                      this._emit({ color2: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>

              <div class="control-row">
                <span class="control-label">Angle</span>
                <div class="control-right">
                  <ha-slider
                    min="0"
                    max="360"
                    step="5"
                    .value=${String(this._angle)}
                    @input=${(e: Event) => {
                      this._angle = parseFloat((e.target as HTMLInputElement).value);
                    }}
                    @change=${(e: Event) =>
                      this._emit({
                        angle: parseFloat((e.target as HTMLInputElement).value),
                      })}
                  ></ha-slider>
                  <span class="value-label">${this._angle}°</span>
                </div>
              </div>
            `
          : nothing}

        ${renderWhen({
          value: this.state.applyWhen,
          stateAware: this.stateAware,
          noun: 'background',
          allowCustom: true,
          customEntity: this.state.customEntity,
          hass: this.hass,
          onChange: (v) => this._emit({ applyWhen: v as BackgroundModuleState['applyWhen'] }),
          onCustomEntity: (id) => this._emit({ customEntity: id }),
        })}
      </div>
    `;
  }
}

customElements.define('cms-background-module', BackgroundModule);

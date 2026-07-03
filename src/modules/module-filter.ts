import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { FilterModuleState, HomeAssistant } from '../types/index.js';
import { DEFAULT_FILTER } from '../parser/state-mapper.js';
import { moduleStyles, renderWhen } from './module-base.js';

export class FilterModule extends LitElement {
  @property({ attribute: false }) state: FilterModuleState = { ...DEFAULT_FILTER };

  /** False when the card has no binary entity state (e.g. sensor cards). */
  @property({ type: Boolean, attribute: 'state-aware' }) stateAware = true;

  @property({ attribute: false }) hass?: HomeAssistant;

  @state() private _open = false;
  @state() private _brightness = DEFAULT_FILTER.brightness;
  @state() private _blur = DEFAULT_FILTER.blur;
  @state() private _transitionMs = DEFAULT_FILTER.transitionMs;

  static override styles = [moduleStyles, css``];

  override firstUpdated() {
    this._open = this.state.enabled;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('state')) {
      const prev = changed.get('state') as FilterModuleState | undefined;
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
      this._brightness = this.state.brightness;
      this._blur = this.state.blur;
      this._transitionMs = this.state.transitionMs;
    }
  }

  private _toggleOpen() {
    this._open = !this._open;
  }

  private _emit(changes: Partial<FilterModuleState>) {
    this.dispatchEvent(
      new CustomEvent<FilterModuleState>('state-changed', {
        detail: { ...this.state, ...changes },
      }),
    );
  }

  override render() {
    return html`
      <div class="module">
        <div class="module-header" @click=${this._toggleOpen}>
          <span class="module-chevron">${this._open ? '▼' : '▶'}</span>
          <span class="module-title">🔲 Visual Filters</span>
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
        <!-- Grayscale -->
        <div class="control-row">
          <span class="control-label">Grayscale</span>
          <div class="control-right">
            <ha-switch
              .checked=${this.state.grayscale}
              @change=${(e: Event) =>
                this._emit({ grayscale: (e.target as HTMLInputElement).checked })}
            ></ha-switch>
          </div>
        </div>

        ${this.state.grayscale
          ? renderWhen({
              value: this.state.grayscaleWhen,
              stateAware: this.stateAware,
              noun: 'grayscale',
              allowCustom: true,
              customEntity: this.state.customEntity,
              hass: this.hass,
              onChange: (v) =>
                this._emit({ grayscaleWhen: v as FilterModuleState['grayscaleWhen'] }),
              onCustomEntity: (id) => this._emit({ customEntity: id }),
            })
          : nothing}

        <!-- Brightness -->
        <div class="control-row">
          <span class="control-label">Brightness</span>
          <div class="control-right">
            <ha-slider
              min="0"
              max="200"
              step="5"
              .value=${String(this._brightness)}
              @input=${(e: Event) => {
                this._brightness = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) =>
                this._emit({
                  brightness: parseFloat((e.target as HTMLInputElement).value),
                })}
            ></ha-slider>
            <span class="value-label">${this._brightness}%</span>
          </div>
        </div>

        <!-- Blur -->
        <div class="control-row">
          <span class="control-label">Blur</span>
          <div class="control-right">
            <ha-slider
              min="0"
              max="20"
              step="1"
              .value=${String(this._blur)}
              @input=${(e: Event) => {
                this._blur = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) =>
                this._emit({ blur: parseFloat((e.target as HTMLInputElement).value) })}
            ></ha-slider>
            <span class="value-label">${this._blur}px</span>
          </div>
        </div>

        <!-- Transition speed -->
        <div class="control-row">
          <span class="control-label">Transition speed</span>
          <div class="control-right">
            <ha-slider
              min="0"
              max="2000"
              step="50"
              .value=${String(this._transitionMs)}
              @input=${(e: Event) => {
                this._transitionMs = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) =>
                this._emit({
                  transitionMs: parseFloat((e.target as HTMLInputElement).value),
                })}
            ></ha-slider>
            <span class="value-label">${this._transitionMs}ms</span>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('cms-filter-module', FilterModule);

import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { BackgroundModuleState } from '../types/index.js';
import { DEFAULT_BACKGROUND } from '../parser/state-mapper.js';
import { moduleStyles } from './module-base.js';

export class BackgroundModule extends LitElement {
  @property({ attribute: false }) state: BackgroundModuleState = {
    ...DEFAULT_BACKGROUND,
  };

  @state() private _angle = DEFAULT_BACKGROUND.angle;

  static override styles = [moduleStyles, css``];

  override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('state')) {
      this._angle = this.state.angle;
    }
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
        <div class="module-header">
          <span class="module-title">🖼️ Background</span>
          <ha-switch
            .checked=${this.state.enabled}
            @change=${(e: Event) =>
              this._emit({ enabled: (e.target as HTMLInputElement).checked })}
          ></ha-switch>
        </div>
        ${this.state.enabled ? this._renderBody() : nothing}
      </div>
    `;
  }

  private _renderBody() {
    return html`
      <div class="module-body">
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
            <input
              type="color"
              .value=${this.state.color1}
              @input=${(e: Event) =>
                this._emit({ color1: (e.target as HTMLInputElement).value })}
            />
            <span class="color-label">${this.state.color1}</span>
          </div>
        </div>

        ${this.state.type === 'gradient'
          ? html`
              <div class="control-row">
                <span class="control-label">Color 2</span>
                <div class="control-right">
                  <input
                    type="color"
                    .value=${this.state.color2}
                    @input=${(e: Event) =>
                      this._emit({ color2: (e.target as HTMLInputElement).value })}
                  />
                  <span class="color-label">${this.state.color2}</span>
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

        <div class="control-row">
          <span class="control-label">Apply when</span>
          <div class="control-right">
            <select
              .value=${this.state.applyWhen}
              @change=${(e: Event) =>
                this._emit({
                  applyWhen: (e.target as HTMLSelectElement).value as
                    | 'always'
                    | 'on'
                    | 'off',
                })}
            >
              <option value="always" ?selected=${this.state.applyWhen === 'always'}>
                Always
              </option>
              <option value="on" ?selected=${this.state.applyWhen === 'on'}>
                Entity ON
              </option>
              <option value="off" ?selected=${this.state.applyWhen === 'off'}>
                Entity OFF
              </option>
            </select>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('cms-background-module', BackgroundModule);

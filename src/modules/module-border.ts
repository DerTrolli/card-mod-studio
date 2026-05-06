import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { BorderModuleState } from '../types/index.js';
import { DEFAULT_BORDER } from '../parser/state-mapper.js';
import { moduleStyles } from './module-base.js';

export class BorderModule extends LitElement {
  @property({ attribute: false }) state: BorderModuleState = { ...DEFAULT_BORDER };

  @state() private _radiusPx = DEFAULT_BORDER.radiusPx;
  @state() private _borderWidth = DEFAULT_BORDER.borderWidth;

  static override styles = [moduleStyles, css``];

  override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('state')) {
      this._radiusPx = this.state.radiusPx;
      this._borderWidth = this.state.borderWidth;
    }
  }

  private _emit(changes: Partial<BorderModuleState>) {
    this.dispatchEvent(
      new CustomEvent<BorderModuleState>('state-changed', {
        detail: { ...this.state, ...changes },
      }),
    );
  }

  override render() {
    return html`
      <div class="module">
        <div class="module-header">
          <span class="module-title">⬛ Border & Radius</span>
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
          <span class="control-label">Border radius</span>
          <div class="control-right">
            <ha-slider
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
                  <input
                    type="color"
                    .value=${this.state.borderColor}
                    @input=${(e: Event) =>
                      this._emit({ borderColor: (e.target as HTMLInputElement).value })}
                  />
                  <span class="color-label">${this.state.borderColor}</span>
                </div>
              </div>
            `
          : nothing}
      </div>
    `;
  }
}

customElements.define('cms-border-module', BorderModule);

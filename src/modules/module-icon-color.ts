import { LitElement, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import type { IconColorModuleState } from '../types/index.js';
import { DEFAULT_ICON_COLOR } from '../parser/state-mapper.js';
import { moduleStyles } from './module-base.js';

export class IconColorModule extends LitElement {
  @property({ attribute: false }) state: IconColorModuleState = {
    ...DEFAULT_ICON_COLOR,
  };

  /**
   * When false the card has no binary entity state (e.g. sensor cards).
   * In that case we default to plain mode and hide the on/off pickers.
   */
  @property({ type: Boolean, attribute: 'state-aware' }) stateAware = true;

  static override styles = [moduleStyles];

  private _emit(changes: Partial<IconColorModuleState>) {
    this.dispatchEvent(
      new CustomEvent<IconColorModuleState>('state-changed', {
        detail: { ...this.state, ...changes },
      }),
    );
  }

  override render() {
    return html`
      <div class="module">
        <div class="module-header">
          <span class="module-title">🎨 Icon Color</span>
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
    // Force plain mode when not state-aware (e.g. sensor cards)
    const effectiveMode = !this.stateAware ? 'plain' : this.state.mode;

    return html`
      <div class="module-body">
        ${this.stateAware
          ? html`
              <div class="control-row">
                <span class="control-label">Mode</span>
                <div class="control-right">
                  <select
                    .value=${effectiveMode}
                    @change=${(e: Event) =>
                      this._emit({
                        mode: (e.target as HTMLSelectElement).value as
                          | 'plain'
                          | 'conditional',
                      })}
                  >
                    <option value="plain" ?selected=${effectiveMode === 'plain'}>
                      Single color
                    </option>
                    <option
                      value="conditional"
                      ?selected=${effectiveMode === 'conditional'}
                    >
                      ON / OFF colors
                    </option>
                  </select>
                </div>
              </div>
            `
          : nothing}

        ${effectiveMode === 'plain'
          ? html`
              <div class="control-row">
                <span class="control-label">Color</span>
                <div class="control-right">
                  <input
                    type="color"
                    .value=${this._toHex(this.state.color)}
                    @input=${(e: Event) =>
                      this._emit({ color: (e.target as HTMLInputElement).value })}
                  />
                  <span class="color-label">${this.state.color}</span>
                </div>
              </div>
            `
          : html`
              <div class="control-row">
                <span class="control-label">Color when ON</span>
                <div class="control-right">
                  <input
                    type="color"
                    .value=${this._toHex(this.state.colorOn)}
                    @input=${(e: Event) =>
                      this._emit({ colorOn: (e.target as HTMLInputElement).value })}
                  />
                  <span class="color-label">${this.state.colorOn}</span>
                </div>
              </div>
              <div class="control-row">
                <span class="control-label">Color when OFF</span>
                <div class="control-right">
                  <input
                    type="color"
                    .value=${this._toHex(this.state.colorOff)}
                    @input=${(e: Event) =>
                      this._emit({ colorOff: (e.target as HTMLInputElement).value })}
                  />
                  <span class="color-label">${this.state.colorOff}</span>
                </div>
              </div>
            `}
      </div>
    `;
  }

  /**
   * `<input type="color">` requires a valid 6-digit hex string.
   * Named colors (like "yellow") and 3-digit hex can't be set as .value directly.
   * We pass through hex strings and fall back to the default blue for named colors.
   */
  private _toHex(value: string): string {
    if (value.startsWith('#') && (value.length === 4 || value.length === 7)) {
      return value;
    }
    // Expand 3-digit hex
    if (value.startsWith('#') && value.length === 4) {
      const [, r, g, b] = value;
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    // Can't reliably convert named colors here — return the default
    return DEFAULT_ICON_COLOR.colorOn;
  }
}

customElements.define('cms-icon-color-module', IconColorModule);

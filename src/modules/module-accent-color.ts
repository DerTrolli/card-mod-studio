import { LitElement, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import type { AccentColorModuleState } from '../types/index.js';
import { DEFAULT_ACCENT_COLOR } from '../parser/state-mapper.js';
import { moduleStyles } from './module-base.js';

export class AccentColorModule extends LitElement {
  @property({ attribute: false }) state: AccentColorModuleState = {
    ...DEFAULT_ACCENT_COLOR,
  };

  static override styles = [moduleStyles];

  private _emit(changes: Partial<AccentColorModuleState>) {
    this.dispatchEvent(
      new CustomEvent<AccentColorModuleState>('state-changed', {
        detail: { ...this.state, ...changes },
      }),
    );
  }

  /**
   * Converts named CSS colors to a hex string usable by <input type="color">.
   * Named colors that can't be mapped fall back to the default.
   */
  private _toHex(value: string): string {
    if (value.startsWith('#') && (value.length === 4 || value.length === 7)) return value;
    // For named colors we can't easily convert in pure JS — return default
    return DEFAULT_ACCENT_COLOR.color;
  }

  override render() {
    return html`
      <div class="module">
        <div class="module-header">
          <span class="module-title">🌈 Accent Color</span>
          <ha-switch
            .checked=${this.state.enabled}
            @change=${(e: Event) =>
              this._emit({ enabled: (e.target as HTMLInputElement).checked })}
          ></ha-switch>
        </div>
        ${this.state.enabled
          ? html`
              <div class="module-body">
                <div class="control-row">
                  <span class="control-label">Color (--accent-color)</span>
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
                <p
                  style="margin:4px 0 0;font-size:11px;color:var(--secondary-text-color,#9e9e9e);"
                >
                  Sets the CSS variable <code>--accent-color</code> on ha-card.
                  Affects graph line color, highlighted borders, and other themed
                  elements depending on card type.
                </p>
              </div>
            `
          : nothing}
      </div>
    `;
  }
}

customElements.define('cms-accent-color-module', AccentColorModule);

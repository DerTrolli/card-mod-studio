import { LitElement, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import type { IconColorModuleState } from '../types/index.js';
import { DEFAULT_ICON_COLOR } from '../parser/state-mapper.js';
import { moduleStyles } from './module-base.js';

export class IconColorModule extends LitElement {
  @property({ attribute: false }) state: IconColorModuleState = {
    ...DEFAULT_ICON_COLOR,
  };

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
    return html`
      <div class="module-body">
        <div class="control-row">
          <span class="control-label">Color when ON</span>
          <div class="control-right">
            <input
              type="color"
              .value=${this.state.colorOn}
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
              .value=${this.state.colorOff}
              @input=${(e: Event) =>
                this._emit({ colorOff: (e.target as HTMLInputElement).value })}
            />
            <span class="color-label">${this.state.colorOff}</span>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('cms-icon-color-module', IconColorModule);

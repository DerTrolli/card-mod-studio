import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { IconColorModuleState } from '../types/index.js';
import { DEFAULT_ICON_COLOR } from '../parser/state-mapper.js';
import { moduleStyles } from './module-base.js';
import '../components/cms-color-picker.js';

export class IconColorModule extends LitElement {
  @property({ attribute: false }) state: IconColorModuleState = {
    ...DEFAULT_ICON_COLOR,
  };

  /** When false the card has no binary entity state (e.g. sensor cards). */
  @property({ type: Boolean, attribute: 'state-aware' }) stateAware = true;
  /** When true a third "Light color" mode is offered that reads rgb_color attribute. */
  @property({ type: Boolean, attribute: 'is-light-card' }) isLightCard = false;

  @state() private _open = false;

  static override styles = [moduleStyles];

  override firstUpdated() {
    this._open = this.state.enabled;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('state')) {
      const prev = changed.get('state') as IconColorModuleState | undefined;
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
    }
  }

  private _toggleOpen() {
    this._open = !this._open;
  }

  private _emit(changes: Partial<IconColorModuleState>) {
    const detail = { ...this.state, ...changes };
    // Cards without a binary entity state can't use on/off or light modes — the
    // UI already forces the plain color picker, so pin the emitted mode to
    // 'plain' too. Otherwise the generator would emit an is_state() template
    // that never matches and the icon would render the wrong (off) color.
    if (!this.stateAware) detail.mode = 'plain';
    this.dispatchEvent(
      new CustomEvent<IconColorModuleState>('state-changed', { detail }),
    );
  }

  override render() {
    return html`
      <div class="module">
        <div class="module-header" @click=${this._toggleOpen}>
          <span class="module-chevron">${this._open ? '▼' : '▶'}</span>
          <span class="module-title">🎨 Icon Color</span>
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
                          | 'conditional'
                          | 'light',
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
                    ${this.isLightCard
                      ? html`<option value="light" ?selected=${effectiveMode === 'light'}>
                          Light color (auto)
                        </option>`
                      : nothing}
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
                  <cms-color-picker
                    .value=${this.state.color}
                    @color-changed=${(e: CustomEvent) =>
                      this._emit({ color: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
            `
          : effectiveMode === 'light'
          ? html`
              <div class="control-row">
                <span class="control-label">Color when OFF</span>
                <div class="control-right">
                  <cms-color-picker
                    .value=${this.state.colorOff}
                    @color-changed=${(e: CustomEvent) =>
                      this._emit({ colorOff: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
              <div class="control-row">
                <span class="control-label" style="font-size:11px;color:var(--secondary-text-color,#9e9e9e)">
                  When ON: uses the light's actual color automatically
                </span>
              </div>
            `
          : html`
              <div class="control-row">
                <span class="control-label">Color when ON</span>
                <div class="control-right">
                  <cms-color-picker
                    .value=${this.state.colorOn}
                    @color-changed=${(e: CustomEvent) =>
                      this._emit({ colorOn: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
              <div class="control-row">
                <span class="control-label">Color when OFF</span>
                <div class="control-right">
                  <cms-color-picker
                    .value=${this.state.colorOff}
                    @color-changed=${(e: CustomEvent) =>
                      this._emit({ colorOff: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
            `}
      </div>
    `;
  }
}

customElements.define('cms-icon-color-module', IconColorModule);

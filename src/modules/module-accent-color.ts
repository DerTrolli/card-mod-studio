import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { AccentColorModuleState, HomeAssistant } from '../types/index.js';
import { DEFAULT_ACCENT_COLOR } from '../parser/state-mapper.js';
import { moduleStyles } from './module-base.js';
import '../components/cms-color-picker.js';
import '../components/cms-entity-picker.js';

export class AccentColorModule extends LitElement {
  @property({ attribute: false }) state: AccentColorModuleState = {
    ...DEFAULT_ACCENT_COLOR,
  };

  /** False when the card has no binary entity state (e.g. sensor cards). */
  @property({ type: Boolean, attribute: 'state-aware' }) stateAware = true;
  /** The card's own entity — used as the picker's placeholder and as the implicit default when entityId is unset. */
  @property({ type: String }) cardEntity = '';
  /** The card's type — gauge gets an extra needle-mode hint (see _renderBody). */
  @property({ type: String }) cardType = '';

  @property({ attribute: false }) hass?: HomeAssistant;

  @state() private _open = false;

  static override styles = [moduleStyles];

  override firstUpdated() {
    this._open = this.state.enabled;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('state')) {
      const prev = changed.get('state') as AccentColorModuleState | undefined;
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
    }
  }

  private _toggleOpen() {
    this._open = !this._open;
  }

  private _emit(changes: Partial<AccentColorModuleState>) {
    this.dispatchEvent(
      new CustomEvent<AccentColorModuleState>('state-changed', {
        detail: { ...this.state, ...changes },
      }),
    );
  }

  override render() {
    return html`
      <div class="module">
        <div class="module-header" @click=${this._toggleOpen}>
          <span class="module-chevron">${this._open ? '▼' : '▶'}</span>
          <span class="module-title">🌈 Accent Color</span>
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
    const mode = this.state.mode;
    const ownEntityUseless = !this.stateAware && !this.state.entityId;

    return html`
      <div class="module-body">
        <div class="control-row">
          <span class="control-label">Color mode</span>
          <div class="control-right">
            <select
              .value=${mode}
              @change=${(e: Event) =>
                this._emit({
                  mode: (e.target as HTMLSelectElement).value as 'plain' | 'conditional',
                })}
            >
              <option value="plain" ?selected=${mode === 'plain'}>One fixed color</option>
              <option value="conditional" ?selected=${mode === 'conditional'}>
                Different for ON / OFF
              </option>
            </select>
          </div>
        </div>
        <div class="when-hint">
          ${mode === 'plain'
            ? 'One color, shown all the time.'
            : 'One color while the controlling entity is on, another while off.'}
        </div>
        ${this.cardType === 'gauge'
          ? html`<div class="when-hint">
              Colors the gauge dial. With <code>needle: true</code> the dial shows your
              configured segment colors instead, so this has no effect there.
            </div>`
          : nothing}

        ${mode === 'conditional'
          ? html`
              <div class="control-row">
                <span class="control-label">Controlled by</span>
                <div class="control-right">
                  <cms-entity-picker
                    .hass=${this.hass}
                    .value=${this.state.entityId ?? ''}
                    .placeholder=${this.stateAware ? this.cardEntity : 'binary_sensor.example'}
                    label="Entity (default: this card's entity)"
                    @value-changed=${(e: CustomEvent<{ value: string }>) =>
                      this._emit({ entityId: e.detail.value.trim() })}
                  ></cms-entity-picker>
                </div>
              </div>
              <div class="when-hint" style=${ownEntityUseless ? 'color:var(--warning-color,#ffa600)' : ''}>
                ${this.state.entityId
                  ? `Uses ${this.state.entityId}'s on/off state, not this card's own entity.`
                  : ownEntityUseless
                  ? `This card's entity (${this.cardEntity || 'none'}) has no on/off state of its own — pick a toggleable entity above, or this mode won't do anything.`
                  : "Leave empty to use this card's own entity."}
              </div>
            `
          : nothing}

        ${mode === 'plain'
          ? html`
              <div class="control-row">
                <span class="control-label">Color</span>
                <div class="control-right">
                  <cms-color-picker
                    .value=${this.state.color}
                    @color-changed=${(e: CustomEvent) => this._emit({ color: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
            `
          : html`
              <div class="control-row">
                <span class="control-label">Color when ON</span>
                <div class="control-right">
                  <cms-color-picker
                    .value=${this.state.colorOn}
                    @color-changed=${(e: CustomEvent) => this._emit({ colorOn: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
              <div class="control-row">
                <span class="control-label">Color when OFF</span>
                <div class="control-right">
                  <cms-color-picker
                    .value=${this.state.colorOff}
                    @color-changed=${(e: CustomEvent) => this._emit({ colorOff: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
            `}
      </div>
    `;
  }
}

customElements.define('cms-accent-color-module', AccentColorModule);

import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { IconColorModuleState, HomeAssistant } from '../types/index.js';
import { DEFAULT_ICON_COLOR } from '../parser/state-mapper.js';
import { moduleStyles } from './module-base.js';
import '../components/cms-color-picker.js';
import '../components/cms-entity-picker.js';

export class IconColorModule extends LitElement {
  @property({ attribute: false }) state: IconColorModuleState = {
    ...DEFAULT_ICON_COLOR,
  };

  /** When false the card has no binary entity state (e.g. sensor cards). */
  @property({ type: Boolean, attribute: 'state-aware' }) stateAware = true;
  /** When true a third "Light color" mode is offered that reads rgb_color attribute. */
  @property({ type: Boolean, attribute: 'is-light-card' }) isLightCard = false;
  /** The card's own entity — used as the picker's placeholder and as the implicit default when entityId is unset. */
  @property({ type: String }) cardEntity = '';

  @property({ attribute: false }) hass?: HomeAssistant;

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
    const mode = this.state.mode;
    // Only relevant once mode !== 'plain': does falling back to the card's
    // own entity (an empty "Controlled by" field) actually mean anything?
    // Not for a card whose own entity has no on/off state (e.g. a `button`)
    // unless a different, toggleable entity is picked below.
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
                  mode: (e.target as HTMLSelectElement).value as
                    | 'plain'
                    | 'conditional'
                    | 'light',
                })}
            >
              <option value="plain" ?selected=${mode === 'plain'}>
                One fixed color
              </option>
              <option value="conditional" ?selected=${mode === 'conditional'}>
                Different for ON / OFF
              </option>
              ${this.isLightCard
                ? html`<option value="light" ?selected=${mode === 'light'}>
                    Match the light's color
                  </option>`
                : nothing}
            </select>
          </div>
        </div>
        <div class="when-hint">
          ${mode === 'plain'
            ? 'One color, shown all the time.'
            : mode === 'light'
            ? "Uses the light's real color while on; your chosen color while off."
            : 'One color while the controlling entity is on, another while off.'}
        </div>
        ${mode !== 'plain'
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
                    @color-changed=${(e: CustomEvent) =>
                      this._emit({ color: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
            `
          : mode === 'light'
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

import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { IconColorModuleState, HomeAssistant } from '../types/index.js';
import { DEFAULT_ICON_COLOR } from '../parser/state-mapper.js';
import {
  moduleStyles,
  renderOverrideBadge,
  renderOverrideHint,
  renderCondition,
} from './module-base.js';
import '../components/cms-color-picker.js';
import '../components/cms-entity-picker.js';
import { TOGGLE_DOMAINS } from '../components/cms-entity-picker.js';

export class IconColorModule extends LitElement {
  @property({ attribute: false }) state: IconColorModuleState = {
    ...DEFAULT_ICON_COLOR,
  };

  /** When false the card has no binary entity state (e.g. sensor cards). */
  @property({ type: Boolean, attribute: 'state-aware' }) stateAware = true;
  /** When true a third "Light color" mode is offered that reads rgb_color attribute. */
  @property({ type: Boolean, attribute: 'is-light-card' }) isLightCard = false;
  /** When true the icon-size controls are offered (ICON_SIZE_TYPES only —
   *  the size variables are dead or harmful elsewhere, see card-caps.ts). */
  @property({ type: Boolean, attribute: 'allow-size' }) allowSize = false;
  /** The card's own entity — used as the picker's placeholder and as the implicit default when entityId is unset. */
  @property({ type: String }) cardEntity = '';

  @property({ attribute: false }) hass?: HomeAssistant;

  /** True when Advanced CSS overrides this module's output — shows the
   *  warning badge/hint (computed by the panel via style-conflicts.ts). */
  @property({ attribute: false }) overridden = false;
  @property({ attribute: false }) overriddenDetail = '';

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
    const mode = this.state.mode;
    // Only relevant once mode !== 'plain': does falling back to the card's
    // own entity (an empty "Controlled by" field) actually mean anything?
    // Not for a card whose own entity has no on/off state (e.g. a `button`)
    // unless a different, toggleable entity is picked below.
    const ownEntityUseless = !this.stateAware && !this.state.entityId;

    return html`
      <div class="module-body">
        ${renderOverrideHint(this.overridden, this.overriddenDetail)}
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
                    .includeDomains=${mode === 'light' ? ['light'] : TOGGLE_DOMAINS}
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
              <div class="when-hint">When ON: uses the light's actual color automatically.</div>
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
        ${this.allowSize ? this._renderSize() : nothing}
      </div>
    `;
  }

  /** Icon size (v0.9) — 0 = leave the theme size alone; with a condition,
   *  the size switches between "Icon size" and "Size otherwise" (24px = the
   *  HA default when unset). */
  private _renderSize() {
    const sizePx = this.state.sizePx ?? 0;
    return html`
      <div class="control-row">
        <span class="control-label">Icon size</span>
        <div class="control-right">
          <ha-slider
            min="0"
            max="64"
            step="2"
            .value=${String(sizePx)}
            @change=${(e: Event) => {
              const v = parseFloat((e.target as HTMLInputElement).value);
              this._emit(
                v > 0
                  ? { sizePx: v }
                  : { sizePx: undefined, sizeOffPx: undefined, sizeWhen: undefined },
              );
            }}
          ></ha-slider>
          <span class="value-label">${sizePx > 0 ? `${sizePx}px` : 'theme'}</span>
        </div>
      </div>
      ${sizePx > 0
        ? html`
            ${renderCondition({
              condition: this.state.sizeWhen,
              stateAware: this.stateAware,
              noun: 'icon size',
              hass: this.hass,
              onChange: (c) => this._emit({ sizeWhen: c }),
            })}
            ${this.state.sizeWhen && this.state.sizeWhen.when !== 'always'
              ? html`
                  <div class="control-row">
                    <span class="control-label">Size otherwise</span>
                    <div class="control-right">
                      <ha-slider
                        min="16"
                        max="64"
                        step="2"
                        .value=${String(this.state.sizeOffPx ?? 24)}
                        @change=${(e: Event) =>
                          this._emit({
                            sizeOffPx: parseFloat((e.target as HTMLInputElement).value),
                          })}
                      ></ha-slider>
                      <span class="value-label">${this.state.sizeOffPx ?? 24}px</span>
                    </div>
                  </div>
                `
              : nothing}
          `
        : nothing}
    `;
  }
}

customElements.define('cms-icon-color-module', IconColorModule);

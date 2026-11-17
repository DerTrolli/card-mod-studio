import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { AccentColorModuleState, HomeAssistant } from '../types/index.js';
import { DEFAULT_ACCENT_COLOR } from '../parser/state-mapper.js';
import { accentColorsWithoutTriplet, tripletHint } from '../utils/rgb-triplet.js';
import { moduleStyles, renderOverrideHint, renderThresholdOwnedHint, renderWatchHint, renderModuleHeader, nameSwitches,
} from './module-base.js';
import { stateKindFor } from '../utils/card-caps.js';
import '../components/cms-color-picker.js';
import '../components/cms-entity-picker.js';
import { TOGGLE_DOMAINS } from '../components/cms-entity-picker.js';
import { LangController, t, tParts } from '../i18n/index.js';

export class AccentColorModule extends LitElement {
  protected readonly i18n = new LangController(this);
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

  /** True when Advanced CSS overrides this module's output — shows the
   *  warning badge/hint (computed by the panel via style-conflicts.ts). */
  @property({ attribute: false }) overridden = false;
  @property({ attribute: false }) overriddenDetail = '';
  /** Threshold Colors is currently writing this module's property. */
  @property({ attribute: false }) thresholdOwned = false;
  /** The card writes Accent as `R, G, B` (Mushroom) — unconvertible colours get a hint. */
  @property({ type: Boolean, attribute: 'triplet-accent' }) tripletAccent = false;

  @state() private _open = false;

  static override styles = [moduleStyles];

  override firstUpdated() {
    this._open = this.state.enabled;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    nameSwitches(this.renderRoot);
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
        ${renderModuleHeader({
          icon: '🌈',
          title: t('accent.title'),
          open: this._open,
          onToggle: () => this._toggleOpen(),
          overridden: this.overridden,
          enable: {
            checked: this.state.enabled,
            onChange: (enabled) => this._emit({ enabled }),
          },
        })}
        ${this._open ? this._renderBody() : nothing}
      </div>
    `;
  }

  private _renderBody() {
    const mode = this.state.mode;
    const kind = stateKindFor(this.stateAware, this.cardEntity);

    return html`
      <div class="module-body" id="module-body">
        ${renderOverrideHint(this.overridden, this.overriddenDetail)}
        ${renderThresholdOwnedHint(this.thresholdOwned, 'noun.accentColor', 'threshold.prop.accentColor')}
        <div class="control-row">
          <span class="control-label" id="lbl-color-mode">${t('accent.colorMode')}</span>
          <div class="control-right">
            <select
              aria-labelledby="lbl-color-mode"
              .value=${mode}
              @change=${(e: Event) =>
                this._emit({
                  mode: (e.target as HTMLSelectElement).value as 'plain' | 'conditional',
                })}
            >
              <option value="plain" ?selected=${mode === 'plain'}>${t('accent.oneFixed')}</option>
              <option value="conditional" ?selected=${mode === 'conditional'}>
                ${t('accent.onOff')}
              </option>
            </select>
          </div>
        </div>
        <div class="when-hint">
          ${mode === 'plain'
            ? t('accent.hintPlain')
            : t('accent.hintOnOff')}
        </div>
        ${this.tripletAccent && accentColorsWithoutTriplet(this.state).length
          ? html`<div class="when-hint warn">${tripletHint(accentColorsWithoutTriplet(this.state))}</div>`
          : nothing}
        ${this.cardType === 'gauge'
          ? html`<div class="when-hint">
              ${tParts('accent.gaugeHint', { needle: html`<code>needle: true</code>` })}
            </div>`
          : nothing}

        ${mode === 'conditional'
          ? html`
              <div class="control-row">
                <span class="control-label">${t('accent.controlledBy')}</span>
                <div class="control-right">
                  <cms-entity-picker
                    .hass=${this.hass}
                    .value=${this.state.entityId ?? ''}
                    .includeDomains=${TOGGLE_DOMAINS}
                    .placeholder=${this.stateAware ? this.cardEntity : 'binary_sensor.example'}
                    label=""
                    accessible-name=${t('base.entityToWatch')}
                    @value-changed=${(e: CustomEvent<{ value: string }>) =>
                      this._emit({ entityId: e.detail.value.trim() })}
                  ></cms-entity-picker>
                </div>
              </div>
              ${renderWatchHint({ entityId: this.state.entityId, cardEntity: this.cardEntity, kind })}
            `
          : nothing}

        ${mode === 'plain'
          ? html`
              <div class="control-row">
                <span class="control-label">${t('accent.color')}</span>
                <div class="control-right">
                  <cms-color-picker
                    label=${t('accent.accentColor')}
                    .value=${this.state.color}
                    @color-changed=${(e: CustomEvent) => this._emit({ color: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
            `
          : html`
              <div class="control-row">
                <span class="control-label">${t('accent.colorOn')}</span>
                <div class="control-right">
                  <cms-color-picker
                    label=${t('accent.accentColorOn')}
                    .value=${this.state.colorOn}
                    @color-changed=${(e: CustomEvent) => this._emit({ colorOn: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
              <div class="control-row">
                <span class="control-label">${t('accent.colorOff')}</span>
                <div class="control-right">
                  <cms-color-picker
                    label=${t('accent.accentColorOff')}
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

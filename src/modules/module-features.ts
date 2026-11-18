/**
 * Features (v1.0) — the feature rows of a tile card (brightness slider,
 * toggles, presets, …): their height, corner radius and colour, written to
 * HA's `hui-card-features` (see featuresBlock). Shown on tile cards only,
 * where it was measured. Each control writes only once touched; ↺ goes back
 * to Home Assistant's own value.
 */
import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { FeaturesModuleState } from '../types/index.js';
import { DEFAULT_FEATURES } from '../parser/state-mapper.js';
import {
  moduleStyles,
  renderModuleHeader,
  renderOverrideHint,
  renderResetButton,
  guardSliderTouch,
  nameSwitches,
  prepareSliders,
} from './module-base.js';
import '../components/cms-color-picker.js';
import { LangController, t } from '../i18n/index.js';

/** Home Assistant's own values (hui-card-features, HA 2025.9–2026.11). */
export const HA_FEATURE_HEIGHT = 42;
export const HA_FEATURE_RADIUS = 12;

export class FeaturesModule extends LitElement {
  @property({ attribute: false }) state: FeaturesModuleState = { ...DEFAULT_FEATURES };
  /** The card has no feature rows: the module explains instead of offering dead controls. */
  @property({ type: Boolean }) noFeatures = false;
  @property({ attribute: false }) overridden = false;
  @property({ attribute: false }) overriddenDetail = '';

  protected readonly i18n = new LangController(this);

  @state() private _open = false;
  @state() private _height = 0;
  @state() private _radius = -1;

  static override styles = [moduleStyles, css``];

  override firstUpdated() {
    this._open = this.state.enabled;
  }

  override connectedCallback() {
    super.connectedCallback();
    guardSliderTouch(this.renderRoot);
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    nameSwitches(this.renderRoot);
    prepareSliders(this.renderRoot);
    if (changed.has('state')) {
      const prev = changed.get('state') as FeaturesModuleState | undefined;
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
      this._height = this.state.heightPx;
      this._radius = this.state.radiusPx;
    }
  }

  private _emit(changes: Partial<FeaturesModuleState>) {
    this.dispatchEvent(new CustomEvent<FeaturesModuleState>('state-changed', { detail: { ...this.state, ...changes } }));
  }

  override render() {
    return html`
      <div class="module">
        ${renderModuleHeader({
          icon: '🎚️',
          title: t('features.title'),
          open: this._open,
          onToggle: () => (this._open = !this._open),
          overridden: this.overridden,
          enable: { checked: this.state.enabled, onChange: (enabled) => this._emit({ enabled }) },
        })}
        ${this._open ? this._renderBody() : nothing}
      </div>
    `;
  }

  private _renderBody() {
    const height = this._height > 0 ? this._height : HA_FEATURE_HEIGHT;
    const radius = this._radius >= 0 ? this._radius : HA_FEATURE_RADIUS;
    return html`
      <div class="module-body" id="module-body">
        ${renderOverrideHint(this.overridden, this.overriddenDetail)}
        ${this.noFeatures ? html`<div class="when-hint">${t('features.none')}</div>` : nothing}
        <div class="control-row">
          <span class="control-label">${t('features.height')}</span>
          <div class="control-right">
            <ha-slider
              label=${t('features.height')}
              aria-label=${t('features.height')}
              min="24"
              max="96"
              step="1"
              .value=${String(height)}
              @input=${(e: Event) => {
                this._height = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) => this._emit({ heightPx: parseFloat((e.target as HTMLInputElement).value) })}
            ></ha-slider>
            ${this._height > 0
              ? html`<span class="value-label">${this._height}px</span>${renderResetButton(() => this._emit({ heightPx: 0 }))}`
              : html`<span class="value-label">${t('base.defaultWith', { value: `${HA_FEATURE_HEIGHT}px` })}</span>`}
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">${t('features.radius')}</span>
          <div class="control-right">
            <ha-slider
              label=${t('features.radius')}
              aria-label=${t('features.radius')}
              min="0"
              max="40"
              step="1"
              .value=${String(radius)}
              @input=${(e: Event) => {
                this._radius = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) => this._emit({ radiusPx: parseFloat((e.target as HTMLInputElement).value) })}
            ></ha-slider>
            ${this._radius >= 0
              ? html`<span class="value-label">${this._radius}px</span>${renderResetButton(() => this._emit({ radiusPx: -1 }))}`
              : html`<span class="value-label">${t('base.defaultWith', { value: `${HA_FEATURE_RADIUS}px` })}</span>`}
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">${t('features.color')}</span>
          <div class="control-right">
            <cms-color-picker
              label=${t('features.color')}
              .value=${this.state.color}
              @color-changed=${(e: CustomEvent) => this._emit({ color: e.detail.value })}
            ></cms-color-picker>
            ${this.state.color ? renderResetButton(() => this._emit({ color: '' })) : nothing}
          </div>
        </div>
        <div class="when-hint">${this.state.color ? t('features.colorHint') : t('features.colorDefault')}</div>
      </div>
    `;
  }
}

customElements.define('cms-features-module', FeaturesModule);

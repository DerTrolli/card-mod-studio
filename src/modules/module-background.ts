import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { BackgroundModuleState, HomeAssistant } from '../types/index.js';
import { DEFAULT_BACKGROUND } from '../parser/state-mapper.js';
import { moduleStyles, renderWhen,  renderOverrideHint, renderThresholdOwnedHint, renderModuleHeader, guardSliderTouch, nameSwitches, prepareSliders,
} from './module-base.js';
import { backgroundSummary } from './module-summary.js';
import '../components/cms-color-picker.js';
import { stateKindFor } from '../utils/card-caps.js';
import { isValidCssColor } from '../utils/css-color.js';
import { LangController, t } from '../i18n/index.js';

export class BackgroundModule extends LitElement {
  @property({ attribute: false }) state: BackgroundModuleState = {
    ...DEFAULT_BACKGROUND,
  };

  /** False when the card has no binary entity state (e.g. sensor cards). */
  @property({ type: Boolean, attribute: 'state-aware' }) stateAware = true;
  /** The card's own entity id — tells an OFF-only entity (climate) from a never-on/off one. */
  @property({ type: String }) cardEntity = '';

  @property({ attribute: false }) hass?: HomeAssistant;

  /** True when Advanced CSS overrides this module's output — shows the
   *  warning badge/hint (computed by the panel via style-conflicts.ts). */
  @property({ attribute: false }) overridden = false;
  @property({ attribute: false }) overriddenDetail = '';
  /** v1.0: offer "Let this module take over" (plain Advanced CSS only). */
  @property({ attribute: false }) takeOver = false;
  /** Threshold Colors is currently writing this module's property. */
  @property({ attribute: false }) thresholdOwned = false;

  protected readonly i18n = new LangController(this);

  @state() private _open = false;
  @state() private _angle = DEFAULT_BACKGROUND.angle;

  static override styles = [moduleStyles, css``];

  override updated(changed: Map<PropertyKey, unknown>) {
    nameSwitches(this.renderRoot);
    prepareSliders(this.renderRoot);
    if (changed.has('state')) {
      const prev = changed.get('state') as BackgroundModuleState | undefined;
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
      this._angle = this.state.angle;
    }
  }

  private _toggleOpen() {
    this._open = !this._open;
  }

  private _emit(changes: Partial<BackgroundModuleState>) {
    this.dispatchEvent(
      new CustomEvent<BackgroundModuleState>('state-changed', {
        detail: { ...this.state, ...changes },
      }),
    );
  }

  /** Solid takes images, a gradient stop does not (and the other way round
   *  for `red 0%`): a value the TARGET field would refuse is not carried over
   *  — it would write invalid CSS under a hint-less field. */
  private _changeType(type: 'solid' | 'gradient') {
    const mode = type === 'gradient' ? 'stop' : 'background';
    const keep = (v: string, fallback: string) => (isValidCssColor(v, mode) ? v : fallback);
    this._emit({
      type,
      color1: keep(this.state.color1, DEFAULT_BACKGROUND.color1),
      ...(type === 'gradient' ? { color2: keep(this.state.color2, DEFAULT_BACKGROUND.color2) } : {}),
    });
  }

  override connectedCallback() {
    super.connectedCallback();
    guardSliderTouch(this.renderRoot);
  }

  override render() {
    return html`
      <div class="module">
        ${renderModuleHeader({
          icon: 'mdi:format-paint',
          summary: this.state.enabled ? backgroundSummary(this.state) : undefined,
          title: t('background.title'),
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
    return html`
      <div class="module-body" id="module-body">
        ${renderOverrideHint(this.overridden, this.overriddenDetail, this.takeOver ? 'background' : undefined)}
        ${renderThresholdOwnedHint(this.thresholdOwned, 'noun.background', 'threshold.prop.background')}
        <div class="control-row">
          <span class="control-label" id="lbl-type">${t('background.type')}</span>
          <div class="control-right">
            <select
              aria-labelledby="lbl-type"
              .value=${this.state.type}
              @change=${(e: Event) =>
                this._changeType((e.target as HTMLSelectElement).value as 'solid' | 'gradient')}
            >
              <option value="solid" ?selected=${this.state.type === 'solid'}>${t('background.solid')}</option>
              <option value="gradient" ?selected=${this.state.type === 'gradient'}>
                ${t('background.gradient')}
              </option>
            </select>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">
            ${this.state.type === 'gradient' ? t('background.color1') : t('background.color')}
          </span>
          <div class="control-right">
            <cms-color-picker
              label=${this.state.type === 'gradient' ? t('background.gradientColor1') : t('background.backgroundColor')}
              .validation=${this.state.type === 'gradient' ? 'stop' : 'background'}
              .value=${this.state.color1}
              @color-changed=${(e: CustomEvent) =>
                this._emit({ color1: e.detail.value })}
            ></cms-color-picker>
          </div>
        </div>

        ${this.state.type === 'gradient'
          ? html`
              <div class="control-row">
                <span class="control-label">${t('background.color2')}</span>
                <div class="control-right">
                  <cms-color-picker
                    label=${t('background.gradientColor2')}
                    .validation=${'stop'}
                    .value=${this.state.color2}
                    @color-changed=${(e: CustomEvent) =>
                      this._emit({ color2: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>

              <div class="control-row">
                <span class="control-label">${t('background.angle')}</span>
                <div class="control-right">
                  <ha-slider
                    label=${t('background.angle')}
                    aria-label=${t('background.angle')}
                    min="0"
                    max="360"
                    step="5"
                    .value=${String(this._angle)}
                    @input=${(e: Event) => {
                      this._angle = parseFloat((e.target as HTMLInputElement).value);
                    }}
                    @change=${(e: Event) =>
                      this._emit({
                        angle: parseFloat((e.target as HTMLInputElement).value),
                      })}
                  ></ha-slider>
                  <span class="value-label">${this._angle}°</span>
                </div>
              </div>
            `
          : nothing}

        ${renderWhen({
          value: this.state.applyWhen,
          stateAware: this.stateAware,
          offOnly: stateKindFor(this.stateAware, this.cardEntity) === 'off-only',
          noun: 'noun.background',
          allowCustom: true,
          customEntity: this.state.customEntity,
          hass: this.hass,
          onChange: (v) => this._emit({ applyWhen: v as BackgroundModuleState['applyWhen'], condition: undefined }),
          onCustomEntity: (id) => this._emit({ customEntity: id }),
          // "A value matches" (v1.0.0, #42): applyWhen stays 'always' (what
          // versions before 1.0.0 then show).
          allowValue: true,
          condition: this.state.condition,
          onCondition: (c) => this._emit({ condition: c, applyWhen: 'always' }),
        })}
      </div>
    `;
  }
}

customElements.define('cms-background-module', BackgroundModule);

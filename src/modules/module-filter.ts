import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { FilterModuleState, HomeAssistant } from '../types/index.js';
import { DEFAULT_FILTER } from '../parser/state-mapper.js';
import {
  moduleStyles,
  renderWhen,
  renderOverrideHint,
  renderCondition,
  renderModuleHeader,
} from './module-base.js';
import { stateKindFor } from '../utils/card-caps.js';

export class FilterModule extends LitElement {
  @property({ attribute: false }) state: FilterModuleState = { ...DEFAULT_FILTER };

  /** False when the card has no binary entity state (e.g. sensor cards). */
  @property({ type: Boolean, attribute: 'state-aware' }) stateAware = true;
  /** The card's own entity id — tells an OFF-only entity (climate) from a never-on/off one. */
  @property({ type: String }) cardEntity = '';

  @property({ attribute: false }) hass?: HomeAssistant;

  /** True when Advanced CSS overrides this module's output — shows the
   *  warning badge/hint (computed by the panel via style-conflicts.ts). */
  @property({ attribute: false }) overridden = false;
  @property({ attribute: false }) overriddenDetail = '';

  @state() private _open = false;
  @state() private _brightness = DEFAULT_FILTER.brightness;
  @state() private _blur = DEFAULT_FILTER.blur;
  @state() private _opacity = 100;
  @state() private _transitionMs = DEFAULT_FILTER.transitionMs;

  static override styles = [moduleStyles, css``];

  override firstUpdated() {
    this._open = this.state.enabled;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('state')) {
      const prev = changed.get('state') as FilterModuleState | undefined;
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
      this._brightness = this.state.brightness;
      this._blur = this.state.blur;
      this._opacity = this.state.opacity ?? 100;
      this._transitionMs = this.state.transitionMs;
    }
  }

  private _toggleOpen() {
    this._open = !this._open;
  }

  private _emit(changes: Partial<FilterModuleState>) {
    this.dispatchEvent(
      new CustomEvent<FilterModuleState>('state-changed', {
        detail: { ...this.state, ...changes },
      }),
    );
  }

  /** Switching Grayscale on starts as "Always" where "Only while OFF" (the
   *  factory default) could never match — an entity with no `off` state of its
   *  own (sensor, lock, cover…). Any other stored condition is kept as is. */
  private _grayscaleChanges(on: boolean): Partial<FilterModuleState> {
    if (on && this.state.grayscaleWhen === 'off' && stateKindFor(this.stateAware, this.cardEntity) === 'none') {
      return { grayscale: true, grayscaleWhen: 'always' };
    }
    return { grayscale: on };
  }

  override render() {
    return html`
      <div class="module">
        ${renderModuleHeader({
          icon: '🎚️',
          title: 'Visual Filters',
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
        ${renderOverrideHint(this.overridden, this.overriddenDetail)}
        <!-- Grayscale -->
        <div class="control-row">
          <span class="control-label">Grayscale</span>
          <div class="control-right">
            <ha-switch
              aria-label="Grayscale"
              .checked=${this.state.grayscale}
              @change=${(e: Event) => this._emit(this._grayscaleChanges((e.target as HTMLInputElement).checked))}
            ><span class="sr-only">Grayscale</span></ha-switch>
          </div>
        </div>

        ${this.state.grayscale
          ? renderWhen({
              value: this.state.grayscaleWhen,
              stateAware: this.stateAware,
              offOnly: stateKindFor(this.stateAware, this.cardEntity) === 'off-only',
              noun: 'grayscale',
              allowCustom: true,
              customEntity: this.state.customEntity,
              hass: this.hass,
              onChange: (v) =>
                this._emit({ grayscaleWhen: v as FilterModuleState['grayscaleWhen'] }),
              onCustomEntity: (id) => this._emit({ customEntity: id }),
            })
          : nothing}

        <!-- Brightness -->
        <div class="control-row">
          <span class="control-label">Brightness</span>
          <div class="control-right">
            <ha-slider
              label="Brightness"
              aria-label="Brightness"
              min="0"
              max="200"
              step="5"
              .value=${String(this._brightness)}
              @input=${(e: Event) => {
                this._brightness = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) =>
                this._emit({
                  brightness: parseFloat((e.target as HTMLInputElement).value),
                })}
            ></ha-slider>
            <span class="value-label">${this._brightness}%</span>
          </div>
        </div>

        <!-- Blur -->
        <div class="control-row">
          <span class="control-label">Blur</span>
          <div class="control-right">
            <ha-slider
              label="Blur"
              aria-label="Blur"
              min="0"
              max="20"
              step="1"
              .value=${String(this._blur)}
              @input=${(e: Event) => {
                this._blur = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) =>
                this._emit({ blur: parseFloat((e.target as HTMLInputElement).value) })}
            ></ha-slider>
            <span class="value-label">${this._blur}px</span>
          </div>
        </div>

        <!-- Opacity -->
        <div class="control-row">
          <span class="control-label">Opacity</span>
          <div class="control-right">
            <ha-slider
              label="Opacity"
              aria-label="Opacity"
              min="10"
              max="100"
              step="5"
              .value=${String(this._opacity)}
              @input=${(e: Event) => {
                this._opacity = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) =>
                this._emit({ opacity: parseFloat((e.target as HTMLInputElement).value) })}
            ></ha-slider>
            <span class="value-label">${this._opacity}%</span>
          </div>
        </div>

        ${!this.state.grayscale
          ? renderCondition({
              condition: this.state.effectsWhen,
              stateAware: this.stateAware,
              offOnly: stateKindFor(this.stateAware, this.cardEntity) === 'off-only',
              noun: 'effects',
              hass: this.hass,
              onChange: (c) => this._emit({ effectsWhen: c }),
            })
          : nothing}

        <!-- Transition speed -->
        <div class="control-row">
          <span class="control-label">Transition speed</span>
          <div class="control-right">
            <ha-slider
              label="Transition speed"
              aria-label="Transition speed"
              min="0"
              max="2000"
              step="50"
              .value=${String(this._transitionMs)}
              @input=${(e: Event) => {
                this._transitionMs = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) =>
                this._emit({
                  transitionMs: parseFloat((e.target as HTMLInputElement).value),
                })}
            ></ha-slider>
            <span class="value-label">${this._transitionMs}ms</span>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('cms-filter-module', FilterModule);

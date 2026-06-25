import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { AnimationModuleState } from '../types/index.js';
import { DEFAULT_ANIMATION } from '../parser/state-mapper.js';
import { moduleStyles, renderWhen } from './module-base.js';

type AnimationPreset = AnimationModuleState['preset'];
type AnimationTrigger = AnimationModuleState['trigger'];

const PRESETS: Array<{ value: AnimationPreset; label: string }> = [
  { value: 'pulse', label: 'Pulse (gentle scale)' },
  { value: 'breathe', label: 'Breathe (opacity fade)' },
  { value: 'gradient-shift', label: 'Gradient Shift (requires gradient bg)' },
  { value: 'blink', label: 'Blink (alert pulse)' },
  { value: 'bounce', label: 'Bounce (vertical)' },
];

export class AnimationModule extends LitElement {
  @property({ attribute: false }) state: AnimationModuleState = {
    ...DEFAULT_ANIMATION,
  };

  /** False when the card has no binary entity state (e.g. sensor cards). */
  @property({ type: Boolean, attribute: 'state-aware' }) stateAware = true;

  @state() private _open = false;
  @state() private _speedS = DEFAULT_ANIMATION.speedS;

  static override styles = [moduleStyles, css``];

  override firstUpdated() {
    this._open = this.state.enabled;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('state')) {
      const prev = changed.get('state') as AnimationModuleState | undefined;
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
      this._speedS = this.state.speedS;
    }
  }

  private _toggleOpen() {
    this._open = !this._open;
  }

  private _emit(changes: Partial<AnimationModuleState>) {
    this.dispatchEvent(
      new CustomEvent<AnimationModuleState>('state-changed', {
        detail: { ...this.state, ...changes },
      }),
    );
  }

  override render() {
    return html`
      <div class="module">
        <div class="module-header" @click=${this._toggleOpen}>
          <span class="module-chevron">${this._open ? '▼' : '▶'}</span>
          <span class="module-title">✨ Animation</span>
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
    return html`
      <div class="module-body">
        <div class="control-row">
          <span class="control-label">Preset</span>
          <div class="control-right">
            <select
              .value=${this.state.preset}
              @change=${(e: Event) =>
                this._emit({
                  preset: (e.target as HTMLSelectElement).value as AnimationPreset,
                })}
            >
              ${PRESETS.map(
                (p) => html`
                  <option value=${p.value} ?selected=${this.state.preset === p.value}>
                    ${p.label}
                  </option>
                `,
              )}
            </select>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Speed</span>
          <div class="control-right">
            <ha-slider
              min="0.5"
              max="10"
              step="0.5"
              .value=${String(this._speedS)}
              @input=${(e: Event) => {
                this._speedS = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) =>
                this._emit({
                  speedS: parseFloat((e.target as HTMLInputElement).value),
                })}
            ></ha-slider>
            <span class="value-label">${this._speedS}s</span>
          </div>
        </div>

        ${renderWhen({
          value: this.state.trigger,
          stateAware: this.stateAware,
          allowCustom: true,
          noun: 'animation',
          customEntity: this.state.customEntity,
          onChange: (v) => this._emit({ trigger: v as AnimationTrigger }),
          onCustomEntity: (id) => this._emit({ customEntity: id }),
        })}

        ${this.state.preset === 'gradient-shift'
          ? html`
              <p
                style="margin:0;font-size:11px;color:var(--secondary-text-color,#9e9e9e);"
              >
                ⚠️ Gradient Shift requires a gradient background to be set.
              </p>
            `
          : nothing}
      </div>
    `;
  }
}

customElements.define('cms-animation-module', AnimationModule);

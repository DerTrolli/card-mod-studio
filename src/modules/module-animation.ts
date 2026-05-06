import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { AnimationModuleState } from '../types/index.js';
import { DEFAULT_ANIMATION } from '../parser/state-mapper.js';
import { moduleStyles } from './module-base.js';

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

  @state() private _speedS = DEFAULT_ANIMATION.speedS;

  static override styles = [moduleStyles, css``];

  override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('state')) {
      this._speedS = this.state.speedS;
    }
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
        <div class="module-header">
          <span class="module-title">✨ Animation</span>
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

        <div class="control-row">
          <span class="control-label">Trigger</span>
          <div class="control-right">
            <select
              .value=${this.state.trigger}
              @change=${(e: Event) =>
                this._emit({
                  trigger: (e.target as HTMLSelectElement).value as AnimationTrigger,
                })}
            >
              <option value="always" ?selected=${this.state.trigger === 'always'}>
                Always
              </option>
              <option value="on" ?selected=${this.state.trigger === 'on'}>
                When entity ON
              </option>
              <option value="off" ?selected=${this.state.trigger === 'off'}>
                When entity OFF
              </option>
              <option value="custom" ?selected=${this.state.trigger === 'custom'}>
                Custom entity
              </option>
            </select>
          </div>
        </div>

        ${this.state.trigger === 'custom'
          ? html`
              <div class="control-row">
                <span class="control-label">Entity</span>
                <div class="control-right">
                  <input
                    type="text"
                    placeholder="input_boolean.my_entity"
                    .value=${this.state.customEntity ?? ''}
                    @change=${(e: Event) =>
                      this._emit({
                        customEntity: (e.target as HTMLInputElement).value.trim(),
                      })}
                    style="flex:1;background:var(--card-background-color,#1c1c1c);color:var(--primary-text-color,#e1e1e1);border:1px solid var(--divider-color,#383838);border-radius:4px;padding:6px 8px;font-size:12px;"
                  />
                </div>
              </div>
            `
          : nothing}

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

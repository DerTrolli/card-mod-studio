import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { AnimationModuleState, HomeAssistant } from '../types/index.js';
import { DEFAULT_ANIMATION } from '../parser/state-mapper.js';
import { moduleStyles, renderOverrideHint, renderModuleHeader, offeredOnOff, guardSliderTouch, } from './module-base.js';
import { commitNumberInput, markNumberInput, revertNumberInput } from '../utils/number-input.js';
import { stateKindFor } from '../utils/card-caps.js';
import '../components/cms-entity-picker.js';
import { TOGGLE_DOMAINS } from '../components/cms-entity-picker.js';

type AnimationPreset = AnimationModuleState['preset'];
type AnimationTrigger = AnimationModuleState['trigger'];
type ValueOperator = NonNullable<AnimationModuleState['valueOperator']>;

const PRESETS: Array<{ value: AnimationPreset; label: string }> = [
  { value: 'pulse', label: 'Pulse (gentle scale)' },
  { value: 'breathe', label: 'Breathe (opacity fade)' },
  { value: 'gradient-shift', label: 'Gradient Shift (requires gradient bg)' },
  { value: 'blink', label: 'Blink (alert pulse)' },
  { value: 'bounce', label: 'Bounce (vertical)' },
  { value: 'shake', label: 'Shake (horizontal)' },
  { value: 'spin', label: 'Spin (360° rotation)' },
  { value: 'glow', label: 'Glow (pulsing shadow)' },
  { value: 'heartbeat', label: 'Heartbeat (double beat)' },
];

const VALUE_OPERATORS: ValueOperator[] = ['<', '<=', '>', '>=', '==', '!='];

export class AnimationModule extends LitElement {
  @property({ attribute: false }) state: AnimationModuleState = {
    ...DEFAULT_ANIMATION,
  };

  /** False when the card has no binary entity state (e.g. sensor cards). */
  @property({ type: Boolean, attribute: 'state-aware' }) stateAware = true;
  /** The card's own entity id — tells an OFF-only entity (climate) from a never-on/off one. */
  @property({ type: String }) cardEntity = '';

  @property({ attribute: false }) hass?: HomeAssistant;
  /** Presets this card cannot use (card-caps noAnimationPresets); the saved one stays listed. */
  @property({ attribute: false }) hiddenPresets: string[] = [];

  /** True when Advanced CSS overrides this module's output — shows the
   *  warning badge/hint (computed by the panel via style-conflicts.ts). */
  @property({ attribute: false }) overridden = false;
  @property({ attribute: false }) overriddenDetail = '';

  @state() private _open = false;
  @state() private _speedS = DEFAULT_ANIMATION.speedS;

  static override styles = [moduleStyles];

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

  private _onTriggerChange(trigger: AnimationTrigger) {
    const changes: Partial<AnimationModuleState> = { trigger };
    // Seed the value-condition fields so the animation starts as soon as an
    // entity is picked (the generator needs operator + threshold present).
    if (trigger === 'value') {
      changes.valueOperator = this.state.valueOperator ?? '>';
      changes.valueThreshold = this.state.valueThreshold ?? 0;
    }
    this._emit(changes);
  }

  override connectedCallback() {
    super.connectedCallback();
    guardSliderTouch(this.renderRoot);
  }

  override render() {
    return html`
      <div class="module">
        ${renderModuleHeader({
          icon: '✨',
          title: 'Animation',
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
        <div class="control-row">
          <span class="control-label" id="lbl-preset">Preset</span>
          <div class="control-right">
            <select
              aria-labelledby="lbl-preset"
              .value=${this.state.preset}
              @change=${(e: Event) =>
                this._emit({
                  preset: (e.target as HTMLSelectElement).value as AnimationPreset,
                })}
            >
              ${PRESETS.filter((p) => !this.hiddenPresets.includes(p.value) || p.value === this.state.preset).map(
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
          <span class="control-label">Duration</span>
          <div class="control-right">
            <ha-slider
              label="Duration"
              aria-label="Duration"
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
        <div class="when-hint">Seconds per cycle — lower is faster.</div>

        ${this._renderTrigger()}

        ${this.state.preset === 'gradient-shift'
          ? html`<div class="when-hint">⚠️ Gradient Shift requires a gradient background to be set.</div>`
          : nothing}
      </div>
    `;
  }

  /**
   * Same options + hint conventions as the shared renderWhen control, plus
   * the animation-only "While a value matches…" trigger (renderWhen's
   * WhenValue union has no 'value', so the select is rendered locally).
   * On/off options follow renderWhen's rule: hidden on non-state-aware
   * cards unless one is already the stored value.
   */
  private _renderTrigger() {
    const { showOn, showOff } = offeredOnOff(
      this.stateAware,
      stateKindFor(this.stateAware, this.cardEntity) === 'off-only',
      this.state.trigger === 'on' || this.state.trigger === 'off',
    );

    const opts: Array<{ v: AnimationTrigger; label: string }> = [
      { v: 'always', label: 'Always' },
    ];
    if (showOn) opts.push({ v: 'on', label: 'Only while entity is ON' });
    if (showOff) opts.push({ v: 'off', label: 'Only while entity is OFF' });
    opts.push({ v: 'custom', label: 'While another entity is ON…' });
    opts.push({ v: 'value', label: 'While a value matches…' });

    return html`
      <div class="control-row">
        <span class="control-label" id="lbl-apply-when">Apply when</span>
        <div class="control-right">
          <select
            aria-labelledby="lbl-apply-when"
            .value=${this.state.trigger}
            @change=${(e: Event) =>
              this._onTriggerChange((e.target as HTMLSelectElement).value as AnimationTrigger)}
          >
            ${opts.map(
              (opt) =>
                html`<option value=${opt.v} ?selected=${this.state.trigger === opt.v}>
                  ${opt.label}
                </option>`,
            )}
          </select>
        </div>
      </div>
      ${this.state.trigger === 'custom'
        ? html`
            <div class="control-row">
              <span class="control-label">Entity</span>
              <div class="control-right">
                <cms-entity-picker
                  .hass=${this.hass}
                  .value=${this.state.customEntity ?? ''}
                  .includeDomains=${TOGGLE_DOMAINS}
                  label=""
                  accessible-name="Entity to watch"
                  placeholder="input_boolean.my_entity"
                  @value-changed=${(e: CustomEvent<{ value: string }>) =>
                    this._emit({ customEntity: e.detail.value.trim() })}
                ></cms-entity-picker>
              </div>
            </div>
          `
        : nothing}
      ${this.state.trigger === 'value' ? this._renderValueCondition() : nothing}
      <div class="when-hint">${this._triggerHint()}</div>
    `;
  }

  private _triggerHint(): string {
    switch (this.state.trigger) {
      case 'on':
        return `Applies the animation only while this card's entity is on (removed when off).`;
      case 'off':
        return `Applies the animation only while this card's entity is off (removed when on).`;
      case 'custom':
        return `Applies the animation only while ${this.state.customEntity || 'the chosen entity'} is on.`;
      case 'value':
        return 'Runs the animation only while the condition matches.';
      default:
        return 'Always applies the animation.';
    }
  }

  /** Numeric attributes of the picked value entity (the condition compares
   *  via float(), so string/list attributes would always read 0). The stored
   *  attribute is always offered even when it's not currently numeric — an
   *  entity that's unavailable right now shouldn't hide the active selection.
   *  Same pattern as the Threshold module's _numericAttributes. */
  private _numericAttributes(): string[] {
    const entityId = this.state.valueEntity ?? '';
    const attrs = this.hass?.states?.[entityId]?.attributes ?? {};
    const names = Object.keys(attrs).filter((k) => {
      const v = (attrs as Record<string, unknown>)[k];
      return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)));
    });
    const current = this.state.valueAttribute;
    if (current && !names.includes(current)) names.unshift(current);
    return names;
  }

  private _renderAttributeSelect() {
    const options = this._numericAttributes();
    if (options.length === 0 && !this.state.valueAttribute) return nothing;
    return html`
      <div class="control-row">
        <span class="control-label" id="lbl-value-read-from">Value read from</span>
        <div class="control-right">
          <select
            aria-labelledby="lbl-value-read-from"
            .value=${this.state.valueAttribute ?? ''}
            @change=${(e: Event) =>
              this._emit({ valueAttribute: (e.target as HTMLSelectElement).value })}
          >
            <option value="" ?selected=${!this.state.valueAttribute}>State (default)</option>
            ${options.map(
              (name) => html`<option value=${name} ?selected=${this.state.valueAttribute === name}>
                Attribute: ${name}
              </option>`,
            )}
          </select>
        </div>
      </div>
    `;
  }

  private _renderValueCondition() {
    return html`
      <div class="control-row">
        <span class="control-label">Entity</span>
        <div class="control-right">
          <cms-entity-picker
            .hass=${this.hass}
            .value=${this.state.valueEntity ?? ''}
            label=""
            accessible-name="Entity to read the value from"
            placeholder="sensor.temperature"
            @value-changed=${(e: CustomEvent<{ value: string }>) =>
              this._emit({ valueEntity: e.detail.value.trim(), valueAttribute: '' })}
          ></cms-entity-picker>
        </div>
      </div>
      ${this._renderAttributeSelect()}
      <div class="control-row">
        <span class="control-label" id="lbl-condition">Condition</span>
        <div class="control-right">
          <select
            aria-labelledby="lbl-condition"
            .value=${this.state.valueOperator ?? '>'}
            @change=${(e: Event) =>
              this._emit({
                valueOperator: (e.target as HTMLSelectElement).value as ValueOperator,
              })}
          >
            ${VALUE_OPERATORS.map(
              (op) =>
                html`<option value=${op} ?selected=${(this.state.valueOperator ?? '>') === op}>
                  value ${op}
                </option>`,
            )}
          </select>
        </div>
      </div>
      <div class="control-row">
        <span class="control-label">Threshold</span>
        <div class="control-right">
          <input
            type="text"
            class="num"
            aria-label="Threshold value"
            aria-invalid="false"
            spellcheck="false"
            autocomplete="off"
            .value=${String(this.state.valueThreshold ?? 0)}
            @input=${markNumberInput}
            @change=${(e: Event) => {
              // Empty / unparseable: keep the previous value (cue shows until blur).
              const n = commitNumberInput(e);
              if (n !== undefined) this._emit({ valueThreshold: n });
            }}
            @blur=${(e: Event) => revertNumberInput(e, this.state.valueThreshold ?? 0)}
          />
        </div>
      </div>
    `;
  }
}

customElements.define('cms-animation-module', AnimationModule);

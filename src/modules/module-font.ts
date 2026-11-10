import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { FontModuleState } from '../types/index.js';
import { DEFAULT_FONT } from '../parser/state-mapper.js';
import { GAUGE_SIZE, NUMBER_SIZE_DEFAULT } from '../utils/owned-entries.js';
import {
  moduleStyles, renderOverrideBadge, renderOverrideHint, onHeaderKeydown, renderResetButton, renderDefaultOption,
} from './module-base.js';
import '../components/cms-color-picker.js';

/** Preset font-family values shown in the dropdown. '' = leave the theme's
 *  own font-family alone (the common case — most people only want size/color).
 *  Shared with the Heading Style module so both font-family selects offer
 *  the identical list (+ the same Custom… free-text escape hatch). */
export const FONT_FAMILY_PRESETS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Theme default' },
  { value: 'sans-serif', label: 'Sans-serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'monospace', label: 'Monospace' },
];

/** The text size each card shows with no Font style, as measured on Home
 *  Assistant 2026.11 (the thing the Text size slider scales: the card's name /
 *  title text; Home Assistant's base is 14px). Display-only placeholders —
 *  never written into a style. A card not listed (custom cards, anything not
 *  measured) gets a neutral "Default" without a number rather than a guess. */
export const NATIVE_FONT_SIZE: Readonly<Record<string, number>> = {
  tile: 14, button: 16, entity: 16, sensor: 16, light: 16.8, gauge: 14, thermostat: 16,
  markdown: 14, entities: 14, glance: 14, 'picture-elements': 14, 'media-control': 14,
};

/** The "Default (Npx)" number for a card, or undefined when not known. */
export function fontNativeSize(cardType?: string): number | undefined {
  return cardType ? NATIVE_FONT_SIZE[cardType] : undefined;
}

export class FontModule extends LitElement {
  @property({ attribute: false }) state: FontModuleState = {
    ...DEFAULT_FONT,
  };

  /** True when Advanced CSS overrides this module's output — shows the
   *  warning badge/hint (computed by the panel via style-conflicts.ts). */
  @property({ attribute: false }) overridden = false;
  @property({ attribute: false }) overriddenDetail = '';
  /** False on cards whose text carries its own colour (NO_TEXT_COLOR_TYPES)
   *  — the colour picker would be a dead control there. */
  @property({ attribute: false }) allowColor = true;
  /** False on cards that size their own text (NO_FONT_SIZE_TYPES). */
  @property({ attribute: false }) allowSize = true;
  /** 'gauge' / 'thermostat' on cards with a Number size control (v0.11),
   *  '' elsewhere. */
  @property({ attribute: false }) numberSize: '' | 'gauge' | 'thermostat' = '';
  /** The card's profile key — picks the "Default (Npx)" placeholder. */
  @property({ attribute: false }) cardType?: string;

  @state() private _open = false;
  /** Live slider value (undefined = not set); re-synced from `state`. */
  @state() private _fontSize?: number = undefined;
  /** What the user typed in the Custom family field, kept while the select
   *  moves to another family and back (not stored in the style). */
  @state() private _customText = '';
  /** The family this element last emitted — a different one arriving in
   *  `state` came from elsewhere (another card, a preset, a reopen). */
  private _emittedFamily?: string;
  /** Number size while the slider is dragged (null = the state's value). */
  @state() private _numberSizeLive: number | null = null;
  /** "Custom…" chosen but nothing typed yet — picking it changes no state,
   *  so without this the text field never appeared. */
  @state() private _customPicked = false;

  static override styles = [moduleStyles];

  override firstUpdated() {
    this._open = this.state.enabled || (!!this.numberSize && this.state.numberSizeEnabled);
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('cardType') && changed.get('cardType') !== undefined) {
      this._customText = '';
      this._customPicked = false;
    }
    if (changed.has('state')) {
      const prev = changed.get('state') as FontModuleState | undefined;
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
      if (this.state.numberSizeEnabled && prev && !prev.numberSizeEnabled) this._open = true;
      // A family arriving from outside (typed, preset, reopen) decides
      // what the select shows again.
      if (prev && prev.fontFamily !== this.state.fontFamily) {
        this._customPicked = false;
        // Not our own emit: the remembered text belongs to what was open
        // before, and would be written into this card on the next "Custom…".
        if (this.state.fontFamily !== this._emittedFamily) this._customText = '';
      }
      this._fontSize = this.state.fontSize;
      this._numberSizeLive = null;
    }
  }

  private _toggleOpen() {
    this._open = !this._open;
  }

  private _emit(changes: Partial<FontModuleState>) {
    if (changes.fontFamily !== undefined) this._emittedFamily = changes.fontFamily;
    this.dispatchEvent(
      new CustomEvent<FontModuleState>('state-changed', {
        detail: { ...this.state, ...changes },
      }),
    );
  }

  /** The stored family is a typed one (not a preset or empty). */
  private get _isCustomStored(): boolean {
    return !FONT_FAMILY_PRESETS.some((p) => p.value === this.state.fontFamily);
  }

  private get _isCustomFamily(): boolean {
    return this._customPicked || !FONT_FAMILY_PRESETS.some((p) => p.value === this.state.fontFamily);
  }

  override render() {
    return html`
      <div class="module">
        <div
          class="module-header"
          role="button"
          tabindex="0"
          aria-expanded=${this._open ? 'true' : 'false'}
          @click=${this._toggleOpen}
          @keydown=${onHeaderKeydown}
        >
          <span class="module-chevron">${this._open ? '▼' : '▶'}</span>
          <span class="module-title">🔠 Font</span>
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
    const family = this.state.fontFamily;
    const isCustom = this._isCustomFamily;
    const native = fontNativeSize(this.cardType);

    return html`
      <div class="module-body">
        ${renderOverrideHint(this.overridden, this.overriddenDetail)}
        ${this.allowSize ? html`<div class="control-row">
          <span class="control-label">Text size</span>
          <div class="control-right">
            <ha-slider
              aria-label="Text size"
              min="10"
              max="48"
              step="1"
              .value=${String(this._fontSize ?? Math.round(native ?? 14))}
              @input=${(e: Event) => {
                this._fontSize = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) =>
                this._emit({
                  fontSize: parseFloat((e.target as HTMLInputElement).value),
                })}
            ></ha-slider>
            ${this._fontSize === undefined
              ? html`<span class="value-label unset">${native === undefined ? 'Default' : `Default (${native}px)`}</span>`
              : html`<span class="value-label">${this._fontSize}px</span>${renderResetButton(
                  () => this._emit({ fontSize: undefined }),
                  'Reset text size to default',
                )}`}
          </div>
        </div>` : nothing}

        <div class="control-row">
          <span class="control-label">Weight</span>
          <div class="control-right">
            <select
              aria-label="Weight"
              .value=${this.state.fontWeight ?? ''}
              @change=${(e: Event) =>
                this._emit({
                  fontWeight: ((e.target as HTMLSelectElement).value || undefined) as FontModuleState['fontWeight'],
                })}
            >
              ${renderDefaultOption(!this.state.fontWeight)}
              <option value="normal" ?selected=${this.state.fontWeight === 'normal'}>Normal</option>
              <option value="medium" ?selected=${this.state.fontWeight === 'medium'}>Medium</option>
              <option value="bold" ?selected=${this.state.fontWeight === 'bold'}>Bold</option>
            </select>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Font family</span>
          <div class="control-right">
            <select
              .value=${isCustom ? 'custom' : family}
              @change=${(e: Event) => {
                const v = (e.target as HTMLSelectElement).value;
                this._customPicked = v === 'custom';
                // Back to Custom: the remembered text applies again.
                if (v === 'custom' && this._customText) this._emit({ fontFamily: this._customText });
                if (v !== 'custom') {
                  // Leaving a typed custom family: remember the text.
                  if (this._isCustomStored) this._customText = family;
                  this._emit({ fontFamily: v });
                }
              }}
            >
              ${FONT_FAMILY_PRESETS.map(
                (p) => html`<option value=${p.value} ?selected=${!isCustom && family === p.value}>
                  ${p.label}
                </option>`,
              )}
              <option value="custom" ?selected=${isCustom}>Custom…</option>
            </select>
          </div>
        </div>
        ${isCustom
          ? html`
              <div class="control-row">
                <span class="control-label">Custom family</span>
                <div class="control-right">
                  <input
                    type="text"
                    style="width:100%;box-sizing:border-box;"
                    aria-label="Custom family"
                    .value=${this._isCustomStored ? family : this._customText}
                    placeholder="'My Font', sans-serif"
                    @change=${(e: Event) => {
                      this._customText = (e.target as HTMLInputElement).value.trim();
                      this._emit({ fontFamily: this._customText });
                    }}
                  />
                </div>
              </div>
            `
          : nothing}

        ${this.allowColor
          ? html`<div class="control-row">
              <span class="control-label">Text color</span>
              <div class="control-right">
                <cms-color-picker
                  clearable
                  .placeholder=${'Default'}
                  .value=${this.state.color ?? ''}
                  @color-changed=${(e: CustomEvent) => this._emit({ color: e.detail.value || undefined })}
                ></cms-color-picker>
              </div>
            </div>`
          : nothing}
        ${this.numberSize ? this._renderNumberSize(this.numberSize) : nothing}
      </div>
    `;
  }

  /**
   * The gauge value / thermostat big number (v0.11). Own switch — it's
   * independent of the base Font switch above — and written as a
   * Studio-owned pierced entry (docs/V0.11_PLAN.md C1.0). The gauge fits
   * its number into a box of its own, so its control scales that box (%,
   * 100 = HA's size, up to GAUGE_SIZE.max — the dial leaves no room beyond,
   * and wide values stop growing slightly earlier); the thermostat's is
   * plain px.
   */
  private _renderNumberSize(kind: 'gauge' | 'thermostat') {
    const s = this.state;
    const def = NUMBER_SIZE_DEFAULT[kind];
    const size = this._numberSizeLive ?? (s.numberSize || def);
    const isGauge = kind === 'gauge';
    // Shown on only while it is actually written (Font on as well).
    const on = s.numberSizeEnabled && s.enabled;
    const label = isGauge ? 'Number size' : 'Temperature size';
    if (s.numberSizeLocked) {
      return html`<div class="control-row">
        <span class="control-label">${label}</span>
        <div class="control-right">
          <span class="when-hint">Set by your own CSS for this card (listed read-only in Advanced CSS) — edit it in the card's YAML.</span>
        </div>
      </div>`;
    }
    return html`<div class="control-row">
      <span class="control-label">${label}</span>
      <div class="control-right">
        <ha-switch
          .checked=${on}
          aria-label="${label}"
          @change=${(e: Event) => {
            const checked = (e.target as HTMLInputElement).checked;
            // Written only while Font is on, so switching it on switches Font on.
            this._emit({ numberSizeEnabled: checked, numberSize: size, ...(checked ? { enabled: true } : {}) });
          }}
        ></ha-switch>
        <ha-slider
          min=${isGauge ? GAUGE_SIZE.min : 24}
          max=${isGauge ? GAUGE_SIZE.max : 96}
          step=${isGauge ? GAUGE_SIZE.step : 1}
          .value=${String(size)}
          ?disabled=${!on}
          @input=${(e: Event) => { this._numberSizeLive = parseFloat((e.target as HTMLInputElement).value); }}
          @change=${(e: Event) => this._emit({ numberSize: parseFloat((e.target as HTMLInputElement).value) })}
        ></ha-slider>
        <span class="value-label">${size}${isGauge ? '%' : 'px'}</span>
      </div>
    </div>`;
  }
}

customElements.define('cms-font-module', FontModule);

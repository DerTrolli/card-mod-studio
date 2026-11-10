import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { HeadingStyleModuleState } from '../types/index.js';
import { DEFAULT_HEADING_STYLE } from '../parser/state-mapper.js';
import {
  moduleStyles, renderOverrideHint, renderModuleHeader, renderResetButton, renderDefaultOption,
} from './module-base.js';
import { FONT_FAMILY_PRESETS } from './module-font.js';
import '../components/cms-color-picker.js';

/** What Home Assistant's heading card shows when nothing is set (measured on
 *  HA 2026.11: title vs subtitle differ in size, weight and colour). Shown as
 *  display-only placeholders — never written into the style. */
export const HEADING_NATIVE = {
  title: { fontSize: 16, weight: 'normal', color: 'var(--primary-text-color)', colorLabel: 'primary text', iconSize: 18 },
  subtitle: { fontSize: 14, weight: 'medium', color: 'var(--secondary-text-color)', colorLabel: 'secondary text', iconSize: 18 },
} as const;

/** Native look for a card's `heading_style` (HA's default is `title`). */
export function headingNative(headingStyle?: string) {
  return headingStyle === 'subtitle' ? HEADING_NATIVE.subtitle : HEADING_NATIVE.title;
}

export class HeadingStyleModule extends LitElement {
  @property({ attribute: false }) state: HeadingStyleModuleState = {
    ...DEFAULT_HEADING_STYLE,
  };

  /** True when Advanced CSS overrides this module's output — shows the
   *  warning badge/hint (computed by the panel via style-conflicts.ts). */
  @property({ attribute: false }) overridden = false;
  @property({ attribute: false }) overriddenDetail = '';

  /** The heading card's `heading_style` (`title` | `subtitle`), so the
   *  "Default (…)" placeholders match what that variant really looks like. */
  @property({ attribute: false }) headingStyle?: string;

  @state() private _open = false;
  @state() private _fontSize?: number = undefined;
  /** "Custom…" chosen but nothing typed yet — picking it changes no state,
   *  so without this the text field never appeared. */
  @state() private _customPicked = false;
  @state() private _iconSize?: number = undefined;

  static override styles = [moduleStyles];

  override firstUpdated() {
    this._open = this.state.enabled;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('state')) {
      const prev = changed.get('state') as HeadingStyleModuleState | undefined;
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
      // A family arriving from outside (typed, preset, reopen) decides
      // what the select shows again.
      if (prev && prev.fontFamily !== this.state.fontFamily) this._customPicked = false;
      this._fontSize = this.state.fontSize;
      this._iconSize = this.state.iconSize;
    }
  }

  private _toggleOpen() {
    this._open = !this._open;
  }

  private _emit(changes: Partial<HeadingStyleModuleState>) {
    this.dispatchEvent(
      new CustomEvent<HeadingStyleModuleState>('state-changed', {
        detail: { ...this.state, ...changes },
      }),
    );
  }

  override render() {
    return html`
      <div class="module">
        ${renderModuleHeader({
          icon: '🔤',
          title: 'Heading Style',
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

  private get _isCustomFamily(): boolean {
    return this._customPicked || !FONT_FAMILY_PRESETS.some((p) => p.value === (this.state.fontFamily ?? ''));
  }

  private _renderBody() {
    const family = this.state.fontFamily ?? '';
    const isCustom = this._isCustomFamily;
    const native = headingNative(this.headingStyle);

    return html`
      <div class="module-body" id="module-body">
        ${renderOverrideHint(this.overridden, this.overriddenDetail)}
        <div class="control-row">
          <span class="control-label">Text size</span>
          <div class="control-right">
            <ha-slider
              label="Text size"
              aria-label="Text size"
              min="12"
              max="48"
              step="1"
              .value=${String(this._fontSize ?? native.fontSize)}
              @input=${(e: Event) => {
                this._fontSize = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) =>
                this._emit({
                  fontSize: parseFloat((e.target as HTMLInputElement).value),
                })}
            ></ha-slider>
            ${this._fontSize === undefined
              ? html`<span class="value-label unset">Default (${native.fontSize}px)</span>`
              : html`<span class="value-label">${this._fontSize}px</span>${renderResetButton(
                  () => this._emit({ fontSize: undefined }),
                  'Reset text size to default',
                )}`}
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Weight</span>
          <div class="control-right">
            <select
              aria-label="Weight"
              .value=${this.state.fontWeight ?? ''}
              @change=${(e: Event) =>
                this._emit({
                  fontWeight: ((e.target as HTMLSelectElement).value || undefined) as HeadingStyleModuleState['fontWeight'],
                })}
            >
              ${renderDefaultOption(!this.state.fontWeight, native.weight)}
              <option value="normal" ?selected=${this.state.fontWeight === 'normal'}>Normal</option>
              <option value="medium" ?selected=${this.state.fontWeight === 'medium'}>Medium</option>
              <option value="bold" ?selected=${this.state.fontWeight === 'bold'}>Bold</option>
            </select>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label" id="lbl-font-family">Font family</span>
          <div class="control-right">
            <select
              aria-labelledby="lbl-font-family"
              .value=${isCustom ? 'custom' : family}
              @change=${(e: Event) => {
                const v = (e.target as HTMLSelectElement).value;
                this._customPicked = v === 'custom';
                if (v !== 'custom') this._emit({ fontFamily: v });
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
                <span class="control-label" id="lbl-custom-family">Custom family</span>
                <div class="control-right">
                  <input
                    aria-labelledby="lbl-custom-family"
                    type="text"
                    style="width:100%;box-sizing:border-box;"
                    .value=${family}
                    placeholder="'My Font', sans-serif"
                    @change=${(e: Event) =>
                      this._emit({ fontFamily: (e.target as HTMLInputElement).value.trim() })}
                  />
                </div>
              </div>
            `
          : nothing}

        <div class="control-row">
          <span class="control-label">Text color</span>
          <div class="control-right">
            <cms-color-picker
              label="Text color"
              clearable
              .placeholder=${`Default (${native.colorLabel})`}
              .placeholderColor=${native.color}
              .value=${this.state.textColor ?? ''}
              @color-changed=${(e: CustomEvent) =>
                this._emit({ textColor: e.detail.value || undefined })}
            ></cms-color-picker>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Icon size</span>
          <div class="control-right">
            <ha-slider
              label="Icon size"
              aria-label="Icon size"
              min="12"
              max="48"
              step="1"
              .value=${String(this._iconSize ?? native.iconSize)}
              @input=${(e: Event) => {
                this._iconSize = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) =>
                this._emit({
                  iconSize: parseFloat((e.target as HTMLInputElement).value),
                })}
            ></ha-slider>
            ${this._iconSize === undefined
              ? html`<span class="value-label unset">Default (${native.iconSize}px)</span>`
              : html`<span class="value-label">${this._iconSize}px</span>${renderResetButton(
                  () => this._emit({ iconSize: undefined }),
                  'Reset icon size to default',
                )}`}
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Icon color</span>
          <div class="control-right">
            <cms-color-picker
              label="Icon color"
              clearable
              .placeholder=${`Default (${native.colorLabel})`}
              .placeholderColor=${native.color}
              .value=${this.state.iconColor ?? ''}
              @color-changed=${(e: CustomEvent) =>
                this._emit({ iconColor: e.detail.value || undefined })}
            ></cms-color-picker>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Alignment</span>
          <div class="control-right">
            <select
              aria-label="Alignment"
              .value=${this.state.alignment ?? ''}
              @change=${(e: Event) =>
                this._emit({
                  alignment: ((e.target as HTMLSelectElement).value || undefined) as
                    | 'left'
                    | 'center'
                    | 'right'
                    | undefined,
                })}
            >
              ${renderDefaultOption(!this.state.alignment, 'spread')}
              <option value="left" ?selected=${this.state.alignment === 'left'}>Left</option>
              <option value="center" ?selected=${this.state.alignment === 'center'}>Center</option>
              <option value="right" ?selected=${this.state.alignment === 'right'}>Right</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('cms-heading-style-module', HeadingStyleModule);

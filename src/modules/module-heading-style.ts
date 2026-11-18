import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { HeadingStyleModuleState } from '../types/index.js';
import { DEFAULT_HEADING_STYLE } from '../parser/state-mapper.js';
import {
  moduleStyles, renderOverrideHint, renderModuleHeader, renderResetButton, renderDefaultOption,
  guardSliderTouch, nameSwitches, prepareSliders,
} from './module-base.js';
import { FONT_FAMILY_PRESETS } from './module-font.js';
import '../components/cms-color-picker.js';
import { LangController, t } from '../i18n/index.js';

/** What Home Assistant's heading card shows when nothing is set (measured on
 *  HA 2026.11: title vs subtitle differ in size, weight and colour). Shown as
 *  display-only placeholders — never written into the style. */
export const HEADING_NATIVE = {
  title: { fontSize: 16, weight: 'normal', color: 'var(--primary-text-color)', colorLabel: 'heading.primaryText', iconSize: 18 },
  subtitle: { fontSize: 14, weight: 'medium', color: 'var(--secondary-text-color)', colorLabel: 'heading.secondaryText', iconSize: 18 },
} as const;

/** Native look for a card's `heading_style` (HA's default is `title`). */
export function headingNative(headingStyle?: string) {
  return headingStyle === 'subtitle' ? HEADING_NATIVE.subtitle : HEADING_NATIVE.title;
}

export class HeadingStyleModule extends LitElement {
  protected readonly i18n = new LangController(this);
  @property({ attribute: false }) state: HeadingStyleModuleState = {
    ...DEFAULT_HEADING_STYLE,
  };

  /** True when Advanced CSS overrides this module's output — shows the
   *  warning badge/hint (computed by the panel via style-conflicts.ts). */
  @property({ attribute: false }) overridden = false;
  @property({ attribute: false }) overriddenDetail = '';
  /** v1.0: offer "Let this module take over" (plain Advanced CSS only). */
  @property({ attribute: false }) takeOver = false;

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
    nameSwitches(this.renderRoot);
    prepareSliders(this.renderRoot);
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

  override connectedCallback() {
    super.connectedCallback();
    guardSliderTouch(this.renderRoot);
  }

  override render() {
    return html`
      <div class="module">
        ${renderModuleHeader({
          icon: '🔤',
          title: t('heading.title'),
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
        ${renderOverrideHint(this.overridden, this.overriddenDetail, this.takeOver ? 'headingStyle' : undefined)}
        <div class="control-row">
          <span class="control-label">${t('font.textSize')}</span>
          <div class="control-right">
            <ha-slider
              label=${t('font.textSize')}
              aria-label=${t('font.textSize')}
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
              ? html`<span class="value-label unset">${t('base.defaultWith', { value: `${native.fontSize}px` })}</span>`
              : html`<span class="value-label">${this._fontSize}px</span>${renderResetButton(
                  () => this._emit({ fontSize: undefined }),
                  t('font.resetSize'),
                )}`}
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">${t('font.weight')}</span>
          <div class="control-right">
            <select
              aria-label=${t('font.weight')}
              .value=${this.state.fontWeight ?? ''}
              @change=${(e: Event) =>
                this._emit({
                  fontWeight: ((e.target as HTMLSelectElement).value || undefined) as HeadingStyleModuleState['fontWeight'],
                })}
            >
              ${renderDefaultOption(!this.state.fontWeight, t(native.weight === 'normal' ? 'heading.weightNormal' : 'heading.weightMedium'))}
              <option value="normal" ?selected=${this.state.fontWeight === 'normal'}>${t('font.weight.normal')}</option>
              <option value="medium" ?selected=${this.state.fontWeight === 'medium'}>${t('font.weight.medium')}</option>
              <option value="bold" ?selected=${this.state.fontWeight === 'bold'}>${t('font.weight.bold')}</option>
            </select>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label" id="lbl-font-family">${t('font.family')}</span>
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
                  ${t(p.label)}
                </option>`,
              )}
              <option value="custom" ?selected=${isCustom}>${t('font.custom')}</option>
            </select>
          </div>
        </div>
        ${isCustom
          ? html`
              <div class="control-row">
                <span class="control-label" id="lbl-custom-family">${t('font.customFamily')}</span>
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
          <span class="control-label">${t('font.textColor')}</span>
          <div class="control-right">
            <cms-color-picker
              label=${t('font.textColor')}
              clearable
              .placeholder=${t('base.defaultWith', { value: t(native.colorLabel) })}
              .placeholderColor=${native.color}
              .value=${this.state.textColor ?? ''}
              @color-changed=${(e: CustomEvent) =>
                this._emit({ textColor: e.detail.value || undefined })}
            ></cms-color-picker>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">${t('icon.size')}</span>
          <div class="control-right">
            <ha-slider
              label=${t('icon.size')}
              aria-label=${t('icon.size')}
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
              ? html`<span class="value-label unset">${t('base.defaultWith', { value: `${native.iconSize}px` })}</span>`
              : html`<span class="value-label">${this._iconSize}px</span>${renderResetButton(
                  () => this._emit({ iconSize: undefined }),
                  t('heading.resetIconSize'),
                )}`}
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">${t('icon.iconColor')}</span>
          <div class="control-right">
            <cms-color-picker
              label=${t('icon.iconColor')}
              clearable
              .placeholder=${t('base.defaultWith', { value: t(native.colorLabel) })}
              .placeholderColor=${native.color}
              .value=${this.state.iconColor ?? ''}
              @color-changed=${(e: CustomEvent) =>
                this._emit({ iconColor: e.detail.value || undefined })}
            ></cms-color-picker>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">${t('heading.alignment')}</span>
          <div class="control-right">
            <select
              aria-label=${t('heading.alignment')}
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
              ${renderDefaultOption(!this.state.alignment, t('heading.spread'))}
              <option value="left" ?selected=${this.state.alignment === 'left'}>${t('heading.left')}</option>
              <option value="center" ?selected=${this.state.alignment === 'center'}>${t('heading.center')}</option>
              <option value="right" ?selected=${this.state.alignment === 'right'}>${t('heading.right')}</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('cms-heading-style-module', HeadingStyleModule);

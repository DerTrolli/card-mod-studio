import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { HeadingStyleModuleState } from '../types/index.js';
import { DEFAULT_HEADING_STYLE } from '../parser/state-mapper.js';
import { moduleStyles, renderOverrideBadge, renderOverrideHint } from './module-base.js';
import { FONT_FAMILY_PRESETS } from './module-font.js';
import '../components/cms-color-picker.js';

export class HeadingStyleModule extends LitElement {
  @property({ attribute: false }) state: HeadingStyleModuleState = {
    ...DEFAULT_HEADING_STYLE,
  };

  /** True when Advanced CSS overrides this module's output — shows the
   *  warning badge/hint (computed by the panel via style-conflicts.ts). */
  @property({ attribute: false }) overridden = false;
  @property({ attribute: false }) overriddenDetail = '';

  @state() private _open = false;
  @state() private _fontSize = DEFAULT_HEADING_STYLE.fontSize;
  @state() private _iconSize = DEFAULT_HEADING_STYLE.iconSize;

  static override styles = [moduleStyles];

  override firstUpdated() {
    this._open = this.state.enabled;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('state')) {
      const prev = changed.get('state') as HeadingStyleModuleState | undefined;
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
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
        <div class="module-header" @click=${this._toggleOpen}>
          <span class="module-chevron">${this._open ? '▼' : '▶'}</span>
          <span class="module-title">🔤 Heading Style</span>
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

  private get _isCustomFamily(): boolean {
    return !FONT_FAMILY_PRESETS.some((p) => p.value === (this.state.fontFamily ?? ''));
  }

  private _renderBody() {
    const family = this.state.fontFamily ?? '';
    const isCustom = this._isCustomFamily;

    return html`
      <div class="module-body">
        ${renderOverrideHint(this.overridden, this.overriddenDetail)}
        <div class="control-row">
          <span class="control-label">Text size</span>
          <div class="control-right">
            <ha-slider
              min="12"
              max="48"
              step="1"
              .value=${String(this._fontSize)}
              @input=${(e: Event) => {
                this._fontSize = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) =>
                this._emit({
                  fontSize: parseFloat((e.target as HTMLInputElement).value),
                })}
            ></ha-slider>
            <span class="value-label">${this._fontSize}px</span>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Weight</span>
          <div class="control-right">
            <select
              .value=${this.state.fontWeight ?? 'normal'}
              @change=${(e: Event) =>
                this._emit({
                  fontWeight: (e.target as HTMLSelectElement).value as HeadingStyleModuleState['fontWeight'],
                })}
            >
              <option value="normal" ?selected=${(this.state.fontWeight ?? 'normal') === 'normal'}>Normal</option>
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
                <span class="control-label">Custom family</span>
                <div class="control-right">
                  <input
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
              .value=${this.state.textColor}
              @color-changed=${(e: CustomEvent) =>
                this._emit({ textColor: e.detail.value })}
            ></cms-color-picker>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Icon size</span>
          <div class="control-right">
            <ha-slider
              min="12"
              max="48"
              step="1"
              .value=${String(this._iconSize)}
              @input=${(e: Event) => {
                this._iconSize = parseFloat((e.target as HTMLInputElement).value);
              }}
              @change=${(e: Event) =>
                this._emit({
                  iconSize: parseFloat((e.target as HTMLInputElement).value),
                })}
            ></ha-slider>
            <span class="value-label">${this._iconSize}px</span>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Icon color</span>
          <div class="control-right">
            <cms-color-picker
              .value=${this.state.iconColor}
              @color-changed=${(e: CustomEvent) =>
                this._emit({ iconColor: e.detail.value })}
            ></cms-color-picker>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Alignment</span>
          <div class="control-right">
            <select
              .value=${this.state.alignment}
              @change=${(e: Event) =>
                this._emit({
                  alignment: (e.target as HTMLSelectElement).value as
                    | 'left'
                    | 'center'
                    | 'right',
                })}
            >
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

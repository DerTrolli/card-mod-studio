import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { FontModuleState } from '../types/index.js';
import { DEFAULT_FONT } from '../parser/state-mapper.js';
import { moduleStyles } from './module-base.js';
import '../components/cms-color-picker.js';

/** Preset font-family values shown in the dropdown. '' = leave the theme's
 *  own font-family alone (the common case — most people only want size/color). */
const FONT_FAMILY_PRESETS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Theme default' },
  { value: 'sans-serif', label: 'Sans-serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'monospace', label: 'Monospace' },
];

export class FontModule extends LitElement {
  @property({ attribute: false }) state: FontModuleState = {
    ...DEFAULT_FONT,
  };

  @state() private _open = false;
  @state() private _fontSize = DEFAULT_FONT.fontSize;

  static override styles = [moduleStyles];

  override firstUpdated() {
    this._open = this.state.enabled;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('state')) {
      const prev = changed.get('state') as FontModuleState | undefined;
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
      this._fontSize = this.state.fontSize;
    }
  }

  private _toggleOpen() {
    this._open = !this._open;
  }

  private _emit(changes: Partial<FontModuleState>) {
    this.dispatchEvent(
      new CustomEvent<FontModuleState>('state-changed', {
        detail: { ...this.state, ...changes },
      }),
    );
  }

  private get _isCustomFamily(): boolean {
    return !FONT_FAMILY_PRESETS.some((p) => p.value === this.state.fontFamily);
  }

  override render() {
    return html`
      <div class="module">
        <div class="module-header" @click=${this._toggleOpen}>
          <span class="module-chevron">${this._open ? '▼' : '▶'}</span>
          <span class="module-title">🔠 Font</span>
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

    return html`
      <div class="module-body">
        <div class="control-row">
          <span class="control-label">Text size</span>
          <div class="control-right">
            <ha-slider
              min="10"
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
              .value=${this.state.fontWeight}
              @change=${(e: Event) =>
                this._emit({
                  fontWeight: (e.target as HTMLSelectElement).value as FontModuleState['fontWeight'],
                })}
            >
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
              .value=${this.state.color}
              @color-changed=${(e: CustomEvent) => this._emit({ color: e.detail.value })}
            ></cms-color-picker>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('cms-font-module', FontModule);

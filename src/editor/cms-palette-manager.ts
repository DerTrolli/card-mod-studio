/**
 * cms-palette-manager — the Color Palette Manager panel (0.8.0 roadmap).
 *
 * Lets the user maintain "My colors" — named custom colors that then show
 * up as swatches in every cms-color-picker — and override the built-in
 * defaults a freshly-enabled Icon/Accent Color module starts from (the ON
 * and OFF colors). Persistence + change broadcasting live in
 * utils/palette-storage.ts; this component is pure UI over that store.
 */
import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { HomeAssistant } from '../types/index.js';
import {
  getCachedPalette,
  savePalette,
  PALETTE_CHANGED_EVENT,
  type CustomPalette,
  type CustomColor,
} from '../utils/palette-storage.js';
import { DEFAULT_ICON_COLOR } from '../parser/state-mapper.js';
import { moduleStyles } from '../modules/module-base.js';

export class CmsPaletteManager extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;

  @state() private _open = false;

  static override styles = [
    moduleStyles,
    css`
      .color-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }
      .color-row input[type='color'] {
        width: 32px;
        height: 26px;
        padding: 0;
        border: 1px solid var(--divider-color, #383838);
        border-radius: 4px;
        cursor: pointer;
        background: none;
      }
      .color-row input[type='text'] {
        flex: 1;
        min-width: 0;
        padding: 4px 6px;
        font-size: 12px;
        background: var(--card-background-color, #1c1c1c);
        color: var(--primary-text-color, #e1e1e1);
        border: 1px solid var(--divider-color, #383838);
        border-radius: 4px;
      }
      .color-row .del-btn {
        padding: 2px 8px;
        cursor: pointer;
        background: rgba(255, 0, 0, 0.15);
        color: #ff6b6b;
        border: 1px solid rgba(255, 0, 0, 0.3);
        border-radius: 4px;
        font-size: 14px;
        line-height: 1;
      }
      .color-row .del-btn:hover {
        background: rgba(255, 0, 0, 0.25);
      }
      .add-btn {
        margin-top: 4px;
        padding: 6px 12px;
        cursor: pointer;
        background: rgba(33, 150, 243, 0.15);
        color: #2196f3;
        border: 1px solid rgba(33, 150, 243, 0.3);
        border-radius: 4px;
        font-size: 12px;
        width: 100%;
      }
      .add-btn:hover {
        background: rgba(33, 150, 243, 0.25);
      }
      .reset-btn {
        padding: 2px 8px;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.06);
        color: var(--secondary-text-color, #9e9e9e);
        border: 1px solid var(--divider-color, #383838);
        border-radius: 4px;
        font-size: 11px;
      }
      .reset-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        color: var(--primary-text-color, #e1e1e1);
      }
      .section-label {
        font-size: 11px;
        color: var(--secondary-text-color, #9e9e9e);
        margin: 10px 0 6px;
        display: block;
      }
      .hint {
        font-size: 11px;
        color: var(--secondary-text-color, #9e9e9e);
        margin-top: 8px;
      }
    `,
  ];

  private _paletteChangedHandler = () => this.requestUpdate();

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener(PALETTE_CHANGED_EVENT, this._paletteChangedHandler);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener(PALETTE_CHANGED_EVENT, this._paletteChangedHandler);
  }

  private _save(palette: CustomPalette) {
    void savePalette(palette, this.hass);
  }

  private _addColor() {
    const palette = getCachedPalette();
    const color: CustomColor = {
      id: `color-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: `My color ${palette.colors.length + 1}`,
      hex: '#03a9f4',
    };
    this._save({ ...palette, colors: [...palette.colors, color] });
  }

  private _updateColor(id: string, changes: Partial<CustomColor>) {
    const palette = getCachedPalette();
    this._save({
      ...palette,
      colors: palette.colors.map((c) => (c.id === id ? { ...c, ...changes } : c)),
    });
  }

  private _deleteColor(id: string) {
    const palette = getCachedPalette();
    this._save({ ...palette, colors: palette.colors.filter((c) => c.id !== id) });
  }

  private _setDefault(key: 'onColor' | 'offColor', value: string | undefined) {
    const palette = getCachedPalette();
    const defaults = { ...palette.defaults };
    if (value) defaults[key] = value;
    else delete defaults[key];
    this._save({ ...palette, defaults });
  }

  override render() {
    const palette = getCachedPalette();
    const hasContent = palette.colors.length > 0 || !!palette.defaults.onColor || !!palette.defaults.offColor;
    return html`
      <div class="module">
        <div class="module-header" @click=${() => (this._open = !this._open)}>
          <span class="module-chevron">${this._open ? '▼' : '▶'}</span>
          <span class="module-title">🎨 My Color Palette</span>
          ${hasContent && !this._open
            ? html`<span style="font-size: 11px; color: var(--secondary-text-color, #9e9e9e);">
                ${palette.colors.length ? `${palette.colors.length} color${palette.colors.length === 1 ? '' : 's'}` : 'defaults set'}
              </span>`
            : nothing}
        </div>
        ${this._open ? this._renderBody(palette) : nothing}
      </div>
    `;
  }

  private _renderBody(palette: CustomPalette) {
    return html`
      <div class="module-body">
        <span class="section-label">My colors — shown as extra swatches in every color picker:</span>
        ${palette.colors.map(
          (c) => html`
            <div class="color-row">
              <input
                type="color"
                .value=${c.hex}
                @input=${(e: Event) => this._updateColor(c.id, { hex: (e.target as HTMLInputElement).value })}
              />
              <input
                type="text"
                .value=${c.name}
                placeholder="Name"
                @change=${(e: Event) => this._updateColor(c.id, { name: (e.target as HTMLInputElement).value })}
              />
              <button class="del-btn" title="Delete color" @click=${() => this._deleteColor(c.id)}>×</button>
            </div>
          `,
        )}
        <button class="add-btn" @click=${this._addColor}>+ Add color</button>

        <span class="section-label">
          Default ON / OFF colors — what Icon Color and Accent Color start with when you enable them:
        </span>
        ${this._renderDefaultRow('ON default', 'onColor', palette.defaults.onColor, DEFAULT_ICON_COLOR.colorOn)}
        ${this._renderDefaultRow('OFF default', 'offColor', palette.defaults.offColor, DEFAULT_ICON_COLOR.colorOff)}
        <div class="hint">
          Changing these doesn't touch already-styled cards — only what a newly-enabled module starts from.
        </div>
      </div>
    `;
  }

  private _renderDefaultRow(
    label: string,
    key: 'onColor' | 'offColor',
    value: string | undefined,
    builtin: string,
  ) {
    return html`
      <div class="color-row">
        <input
          type="color"
          .value=${value ?? builtin}
          @input=${(e: Event) => this._setDefault(key, (e.target as HTMLInputElement).value)}
        />
        <span style="flex: 1; font-size: 12px;">${label}${value ? '' : html` <span style="color: var(--secondary-text-color, #9e9e9e);">(built-in ${builtin})</span>`}</span>
        ${value
          ? html`<button class="reset-btn" @click=${() => this._setDefault(key, undefined)}>Reset</button>`
          : nothing}
      </div>
    `;
  }
}

customElements.define('cms-palette-manager', CmsPaletteManager);

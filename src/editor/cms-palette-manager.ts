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
import { moduleStyles, onHeaderKeydown } from '../modules/module-base.js';
import { ArmGuard } from '../utils/arm-guard.js';

/** Rapid commits (e.g. several swatch changes in a row) become one storage write. */
const COMMIT_DEBOUNCE_MS = 250;

/** `#rgb` / `#rrggbb` (any case, surrounding spaces ok) → lowercase `#rrggbb`, else undefined.
 *  No alpha: the native colour input and the stored swatches are opaque. */
export function normalizeHex(raw: string): string | undefined {
  const t = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(t)) return t;
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : undefined;
}

type Edit = (p: CustomPalette) => CustomPalette;

export class CmsPaletteManager extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;

  @state() private _open = false;
  /** Uncommitted colour per row (native dialog drag / typed text): shown live,
   *  never written to storage until committed. */
  @state() private _live = new Map<string, { hex: string; src: 'pick' | 'type' }>();
  /** Rows whose hex field holds text that isn't a colour. */
  @state() private _invalid = new Set<string>();
  /** The entry whose remove button is armed ("Remove 'x'?"). */
  @state() private _armed: string | null = null;

  /** Commits waiting on the debounce, keyed per field so the last edit wins. */
  /** Disarms the remove button on a press elsewhere or after a few seconds
   *  (blur alone never fires where a click doesn't focus the button). */
  private _armGuard = new ArmGuard(() => {
    this._armed = null;
  });
  private _pending = new Map<string, Edit>();
  private _timer: ReturnType<typeof setTimeout> | undefined;

  static override styles = [
    moduleStyles,
    css`
      .color-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 8px;
        margin-bottom: 6px;
      }
      /* input[type='color'] deliberately NOT restyled here — it inherits the
       * shared round swatch look from moduleStyles, same as everywhere else. */
      .color-row input[type='text'] {
        flex: 1;
        min-width: 0;
      }
      .color-row input.name-input {
        flex: 1 1 110px;
      }
      .color-row input[type='text'].hex-input {
        flex: 0 0 84px;
        width: 84px;
        font-family: var(--code-font-family, monospace);
      }
      .color-row input[aria-invalid='true'] {
        border-color: var(--cms-line-error);
        background: var(--cms-tint-error);
        color: var(--cms-ink-error);
      }
      .color-row input[type='color']:focus-visible {
        outline: 2px solid var(--primary-color, #03a9f4);
        outline-offset: 2px;
      }
      .color-row .del-btn {
        background: var(--cms-tint-error);
        border: 1px solid var(--cms-line-error);
        border-radius: 4px;
        color: var(--cms-ink-error);
        cursor: pointer;
        font-size: 15px;
        line-height: 1;
        min-width: 28px;
        min-height: 28px;
        padding: 2px 8px;
        flex-shrink: 0;
      }
      .color-row .del-btn:hover,
      .color-row .del-btn.armed {
        background: var(--cms-tint-error-hover);
      }
      .color-row .del-btn.armed {
        font-size: 12px;
        font-weight: 600;
      }
      .add-btn {
        margin-top: 4px;
        padding: 7px 12px;
        cursor: pointer;
        background: var(--cms-tint-primary);
        color: var(--cms-ink-primary);
        border: 1px dashed var(--cms-line-primary);
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        width: 100%;
      }
      .add-btn:hover {
        background: var(--cms-tint-primary-hover);
      }
      .reset-btn {
        min-height: 28px;
        padding: 2px 10px;
        cursor: pointer;
        background: var(--cms-fill);
        color: var(--secondary-text-color, #727272);
        border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
        border-radius: 4px;
        font-size: 12px;
      }
      .reset-btn:hover {
        background: var(--cms-fill-hover);
        color: var(--primary-text-color, #212121);
      }
      @media (pointer: coarse) {
        .color-row .del-btn,
        .reset-btn {
          min-width: 36px;
          min-height: 36px;
        }
      }
      .section-label {
        font-size: 11px;
        color: var(--secondary-text-color, #727272);
        margin: 10px 0 6px;
        display: block;
      }
      .hint {
        font-size: 11px;
        color: var(--secondary-text-color, #727272);
        margin-top: 8px;
      }
      .header-summary {
        font-size: 11px;
        color: var(--secondary-text-color, #727272);
      }
      .default-label {
        flex: 1 1 90px;
        font-size: 12px;
      }
      .default-builtin {
        color: var(--secondary-text-color, #727272);
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
    this._armGuard.stop();
    this._flush(); // a commit still waiting on the debounce must not be lost
  }

  /** Queues one palette edit; rapid commits collapse into a single storage write. */
  private _queue(key: string, edit: Edit) {
    this._pending.set(key, edit);
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._flush(), COMMIT_DEBOUNCE_MS);
  }

  private _flush() {
    clearTimeout(this._timer);
    if (!this._pending.size) return;
    let palette = getCachedPalette();
    for (const edit of this._pending.values()) palette = edit(palette);
    for (const key of this._pending.keys()) this._live.delete(key);
    this._pending.clear();
    void savePalette(palette, this.hass);
    this.requestUpdate();
  }

  /** Add / remove are single deliberate actions: applied at once, after any waiting edit. */
  private _saveNow(edit: Edit) {
    this._flush();
    void savePalette(edit(getCachedPalette()), this.hass);
  }

  private _focus(selector: string) {
    (this.renderRoot?.querySelector?.(selector) as HTMLElement | null | undefined)?.focus();
  }

  private _addColor() {
    const id = `color-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this._saveNow((palette) => ({
      ...palette,
      colors: [...palette.colors, { id, name: `My color ${palette.colors.length + 1}`, hex: '#03a9f4' }],
    }));
    // Keyboard users land on the new entry's name, ready to rename it.
    void this.updateComplete.then(() => this._focus(`[data-row="${id}"] .name-input`));
  }

  private _updateColor(id: string, field: 'hex' | 'name', value: string) {
    this._queue(`${id}:${field}`, (palette) => ({
      ...palette,
      colors: palette.colors.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    }));
  }

  private _disarm() {
    this._armed = null;
    this._armGuard.stop();
  }

  private _deleteColor(id: string) {
    this._disarm();
    this._saveNow((palette) => ({ ...palette, colors: palette.colors.filter((c) => c.id !== id) }));
    // The focused button is gone; keep keyboard users in the manager.
    void this.updateComplete.then(() => this._focus('.add-btn'));
  }

  private _setDefault(key: 'onColor' | 'offColor', value: string | undefined) {
    this._queue(key, (palette) => {
      const defaults = { ...palette.defaults };
      if (value) defaults[key] = value;
      else delete defaults[key];
      return { ...palette, defaults };
    });
  }

  // --- colour field behaviour shared by entries and the ON/OFF defaults ----

  private _setInvalid(rowKey: string, on: boolean) {
    if (this._invalid.has(rowKey) === on) return;
    if (on) this._invalid.add(rowKey);
    else this._invalid.delete(rowKey);
    this.requestUpdate();
  }

  /** Dragging in the native dialog: follow it on screen, write nothing yet. */
  private _onPick(rowKey: string, e: Event) {
    this._live.set(rowKey, { hex: (e.target as HTMLInputElement).value, src: 'pick' });
    this._setInvalid(rowKey, false);
    this.requestUpdate();
  }

  /** Typing is validated live (the cue) but only `change` stores. */
  private _onTyping(rowKey: string, e: Event) {
    const hex = normalizeHex((e.target as HTMLInputElement).value);
    if (hex) this._live.set(rowKey, { hex, src: 'type' });
    else this._live.delete(rowKey);
    this._setInvalid(rowKey, !hex);
    this.requestUpdate();
  }

  /** Native `change` = the dialog closed; text `change` = Enter or blur. */
  private _commitHex(rowKey: string, e: Event, stored: string, save: (hex: string) => void) {
    const input = e.target as HTMLInputElement;
    const hex = normalizeHex(input.value);
    if (!hex) {
      this._setInvalid(rowKey, true); // never stored; the field reverts on blur
      return;
    }
    this._setInvalid(rowKey, false);
    const src = input.type === 'color' ? 'pick' : 'type';
    if (src === 'type') input.value = hex;
    // Back to what's stored (and nothing queued): nothing to write.
    if (hex === stored.toLowerCase() && !this._pending.has(rowKey)) {
      this._live.delete(rowKey);
      this.requestUpdate();
      return;
    }
    this._live.set(rowKey, { hex, src });
    save(hex);
  }

  private _revertHex(rowKey: string, e: Event, stored: string) {
    if (!this._invalid.has(rowKey)) return;
    (e.target as HTMLInputElement).value = stored;
    this._live.delete(rowKey);
    this._setInvalid(rowKey, false);
    this.requestUpdate();
  }

  override render() {
    const palette = getCachedPalette();
    const hasContent = palette.colors.length > 0 || !!palette.defaults.onColor || !!palette.defaults.offColor;
    return html`
      <div class="module">
        <div
          class="module-header"
          role="button"
          tabindex="0"
          aria-expanded=${this._open ? 'true' : 'false'}
          @click=${() => (this._open = !this._open)}
          @keydown=${onHeaderKeydown}
        >
          <span class="module-chevron" aria-hidden="true">${this._open ? '▼' : '▶'}</span>
          <span class="module-title">🖌️ My Color Palette</span>
          ${hasContent && !this._open
            ? html`<span class="header-summary">
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
        ${palette.colors.map((c, i) => this._renderColorRow(c, i))}
        <button class="add-btn" @click=${this._addColor}>+ Add Color</button>

        <span class="section-label">
          Default ON / OFF colors — what Icon Color and Accent Color start with when you enable them:
        </span>
        ${this._renderDefaultRow('ON', 'onColor', palette.defaults.onColor, DEFAULT_ICON_COLOR.colorOn)}
        ${this._renderDefaultRow('OFF', 'offColor', palette.defaults.offColor, DEFAULT_ICON_COLOR.colorOff)}
        <div class="hint">
          Changing these doesn't touch already-styled cards — only what a newly-enabled module starts from.
        </div>
        <div class="hint">
          Saved straight to your Home Assistant profile. Cards keep the colour they were given — changing an entry
          here doesn't restyle them.
        </div>
      </div>
    `;
  }

  /** Native swatch + hex field for one colour; `rowKey` ties them to their live/invalid state. */
  private _renderColorFields(rowKey: string, stored: string, subject: string, save: (hex: string) => void) {
    const live = this._live.get(rowKey);
    const invalid = this._invalid.has(rowKey);
    return html`
      <input
        type="color"
        class="swatch-input"
        aria-label="Colour of ${subject}"
        .value=${live?.hex ?? stored}
        @input=${(e: Event) => this._onPick(rowKey, e)}
        @change=${(e: Event) => this._commitHex(rowKey, e, stored, save)}
      />
      <input
        type="text"
        class="hex-input"
        aria-label="Hex value of ${subject}"
        aria-invalid=${invalid ? 'true' : 'false'}
        placeholder="#rrggbb"
        spellcheck="false"
        autocomplete="off"
        maxlength="9"
        .value=${live?.src === 'pick' ? live.hex : stored}
        @input=${(e: Event) => this._onTyping(rowKey, e)}
        @change=${(e: Event) => this._commitHex(rowKey, e, stored, save)}
        @blur=${(e: Event) => this._revertHex(rowKey, e, stored)}
      />
    `;
  }

  private _renderColorRow(c: CustomColor, index: number) {
    const label = c.name || `colour ${index + 1}`;
    const armed = this._armed === c.id;
    const removeLabel = armed ? `Remove '${label}'?` : `Remove '${label}'`;
    return html`
      <div class="color-row" data-row=${c.id}>
        ${this._renderColorFields(`${c.id}:hex`, c.hex, `'${label}'`, (hex) => this._updateColor(c.id, 'hex', hex))}
        <input
          type="text"
          class="name-input"
          .value=${c.name}
          placeholder="Name"
          aria-label="Name of colour ${index + 1}"
          @change=${(e: Event) => this._updateColor(c.id, 'name', (e.target as HTMLInputElement).value)}
        />
        <button
          class="del-btn ${armed ? 'armed' : ''}"
          title=${removeLabel}
          aria-label=${removeLabel}
          @click=${(e: Event) => {
            if (armed) this._deleteColor(c.id);
            else {
              this._armed = c.id;
              this._armGuard.start(e?.currentTarget);
            }
          }}
          @blur=${() => {
            if (this._armed === c.id) this._disarm();
          }}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'Escape' && this._armed === c.id) {
              e.stopPropagation(); // disarm only; don't also close the card dialog
              this._disarm();
            }
          }}
        >${armed ? 'Remove?' : '×'}</button>
      </div>
    `;
  }

  private _renderDefaultRow(
    which: 'ON' | 'OFF',
    key: 'onColor' | 'offColor',
    value: string | undefined,
    builtin: string,
  ) {
    const subject = `default ${which} colour`;
    return html`
      <div class="color-row" data-row=${key}>
        ${this._renderColorFields(key, value ?? builtin, subject, (hex) => this._setDefault(key, hex))}
        <span class="default-label">${which} default${value ? '' : html` <span class="default-builtin">(built-in ${builtin})</span>`}</span>
        ${value
          ? html`<button class="reset-btn" aria-label="Reset ${subject} to built-in" @click=${() => this._setDefault(key, undefined)}>Reset</button>`
          : nothing}
      </div>
    `;
  }
}

customElements.define('cms-palette-manager', CmsPaletteManager);

import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

export interface ColorPreset {
  name: string;
  variable: string;  // e.g., 'var(--red-color)'
  hex: string;       // for preview swatch
}

export const HA_COLOR_PRESETS: ColorPreset[] = [
  { name: 'Red', variable: 'var(--red-color)', hex: '#F44336' },
  { name: 'Pink', variable: 'var(--pink-color)', hex: '#E91E63' },
  { name: 'Purple', variable: 'var(--purple-color)', hex: '#9C27B0' },
  { name: 'Blue', variable: 'var(--blue-color)', hex: '#2196F3' },
  { name: 'Cyan', variable: 'var(--cyan-color)', hex: '#00BCD4' },
  { name: 'Teal', variable: 'var(--teal-color)', hex: '#009688' },
  { name: 'Green', variable: 'var(--green-color)', hex: '#4CAF50' },
  { name: 'Yellow', variable: 'var(--yellow-color)', hex: '#FFEB3B' },
  { name: 'Orange', variable: 'var(--orange-color)', hex: '#FF9800' },
  { name: 'Grey', variable: 'var(--grey-color)', hex: '#9E9E9E' },
];

/**
 * Resolves any CSS color a threshold rule/swatch might hold — a palette
 * var(--x-color) reference, a hex string, or a bare CSS color keyword like
 * "red" (the third form `parseThresholdJinja` also recognises, for
 * round-tripping hand-written CSS) — to a hex preview color.
 */
export function previewHexFor(value: string): string {
  const preset = HA_COLOR_PRESETS.find((p) => p.variable === value);
  if (preset) return preset.hex;
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return value;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch {
    return '#888888';
  }
}

@customElement('cms-color-picker')
export class CmsColorPicker extends LitElement {
  @property() value = '#ffffff';
  /** Compact mode: renders a single small swatch button that opens a floating popover on click, instead of always showing the full picker inline. Use where many pickers appear in a dense list (e.g. one per threshold rule) and the always-expanded form would be too tall. */
  @property({ type: Boolean }) compact = false;

  @state() private _popoverOpen = false;
  @state() private _popoverPos: { top: number; left: number } | null = null;

  private _outsideClickHandler = (e: MouseEvent) => {
    if (!this.contains(e.target as Node) && !(e.composedPath().includes(this))) {
      this._closePopover();
    }
  };

  static styles = css`
    :host { display: block; }
    .container { display: flex; flex-direction: column; gap: 8px; }
    .presets { display: flex; flex-wrap: wrap; gap: 4px; }
    .preset {
      width: 24px; height: 24px;
      border-radius: 4px;
      border: 2px solid transparent;
      cursor: pointer;
    }
    .preset:hover { border-color: var(--primary-color, #03a9f4); }
    .preset.selected { border-color: var(--primary-color, #03a9f4); }
    .custom { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
    .custom input[type="color"] { width: 32px; height: 24px; padding: 0; border: none; }
    .custom input[type="text"] { flex: 1; padding: 4px; font-size: 12px; }

    .swatch-trigger {
      width: 32px;
      height: 24px;
      padding: 0;
      border: 1px solid var(--divider-color, #383838);
      border-radius: 4px;
      cursor: pointer;
    }

    .popover {
      position: fixed;
      z-index: 999999;
      background: var(--card-background-color, #1c1c1c);
      border: 1px solid var(--divider-color, #383838);
      border-radius: 8px;
      padding: 10px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      width: 200px;
    }
  `;

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._outsideClickHandler, true);
  }

  render() {
    if (!this.compact) {
      return this._renderPickerBody();
    }

    return html`
      <button
        class="swatch-trigger"
        style="background: ${previewHexFor(this.value)}"
        title="${this.value}"
        @click=${this._toggleCompactPopover}
      ></button>
      ${this._popoverOpen && this._popoverPos
        ? html`
            <div
              class="popover"
              style="top: ${this._popoverPos.top}px; left: ${this._popoverPos.left}px;"
              @click=${(e: Event) => e.stopPropagation()}
            >
              ${this._renderPickerBody()}
            </div>
          `
        : nothing}
    `;
  }

  private _renderPickerBody() {
    return html`
      <div class="container">
        <div class="presets">
          ${HA_COLOR_PRESETS.map(p => html`
            <div
              class="preset ${this.value === p.variable ? 'selected' : ''}"
              style="background: ${p.hex}"
              title="${p.name} (${p.variable})"
              @click=${() => this._selectPreset(p)}
            ></div>
          `)}
        </div>
        <div class="custom">
          <input type="color" .value=${this._toHex(this.value)} @input=${this._onColorInput} />
          <input type="text" .value=${this.value} @change=${this._onTextChange} placeholder="Color or var(--name)" />
        </div>
      </div>
    `;
  }

  private _toggleCompactPopover(e: Event) {
    e.stopPropagation();
    if (this._popoverOpen) {
      this._closePopover();
      return;
    }
    const trigger = e.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    // 200px popover width (see .popover) — keep it on-screen if the trigger
    // sits near the right edge, which is common in a dense rule row.
    const left = Math.min(rect.left, window.innerWidth - 216);
    this._popoverPos = { top: rect.bottom + 4, left: Math.max(8, left) };
    this._popoverOpen = true;
    // Capture phase so this fires before the click that opened it finishes
    // bubbling — otherwise it would immediately close itself.
    document.addEventListener('click', this._outsideClickHandler, true);
  }

  private _closePopover() {
    this._popoverOpen = false;
    this._popoverPos = null;
    document.removeEventListener('click', this._outsideClickHandler, true);
  }

  private _selectPreset(preset: ColorPreset) {
    this.value = preset.variable;
    this._emit();
    if (this.compact) this._closePopover();
  }

  private _onColorInput(e: Event) {
    this.value = (e.target as HTMLInputElement).value;
    this._emit();
  }

  private _onTextChange(e: Event) {
    this.value = (e.target as HTMLInputElement).value;
    this._emit();
    if (this.compact) this._closePopover();
  }

  private _toHex(val: string): string {
    // If it's a var(), return a fallback color for the picker
    if (val.startsWith('var(')) {
      const preset = HA_COLOR_PRESETS.find(p => p.variable === val);
      return preset?.hex || '#888888';
    }
    return val;
  }

  private _emit() {
    this.dispatchEvent(new CustomEvent('color-changed', {
      detail: { value: this.value },
      bubbles: true, composed: true
    }));
  }
}

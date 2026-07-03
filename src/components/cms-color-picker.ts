import { LitElement, html, css, render as litRender } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

/**
 * Walks up through shadow-root hosts *and* slot assignments — the
 * "flattened tree" — so ancestor lookups work correctly across nested
 * shadow DOM/slotting (a plain `parentElement`/`closest()` walk stops at a
 * shadow boundary and misses the host chain; it also never crosses INTO the
 * slot a light-DOM node is projected into).
 */
function flattenedParent(node: Node): Node | null {
  if (node instanceof Element && node.assignedSlot) return node.assignedSlot;
  const el = node as Element;
  if (el.parentElement) return el.parentElement;
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/**
 * Finds the nearest open, modal native `<dialog>` ancestor (piercing shadow
 * boundaries and slotting via flattenedParent). HA's card-edit dialog nests
 * one two shadow roots deep (ha-dialog -> wa-dialog -> <dialog>) and shows
 * it via showModal() — see _ensurePortal's doc comment for why that matters.
 */
function findModalDialogAncestor(start: Element): HTMLDialogElement | null {
  let node: Node | null = start;
  while (node) {
    if (node instanceof HTMLDialogElement && node.open) return node;
    node = flattenedParent(node);
  }
  return null;
}

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

/**
 * Popover-only styles, shared between this component's own shadow root
 * (unused when compact, harmless to keep loaded) and the portal shadow root
 * created in _ensurePortal — see that method's doc comment for why the
 * popover can't just be a normal child of this element's own shadow DOM.
 */
const popoverStyles = css`
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
`;

@customElement('cms-color-picker')
export class CmsColorPicker extends LitElement {
  @property() value = '#ffffff';
  /** Compact mode: renders a single small swatch button that opens a floating popover on click, instead of always showing the full picker inline. Use where many pickers appear in a dense list (e.g. one per threshold rule) and the always-expanded form would be too tall. */
  @property({ type: Boolean }) compact = false;

  @state() private _popoverOpen = false;
  @state() private _popoverPos: { top: number; left: number } | null = null;

  private _portalHost: HTMLDivElement | null = null;
  private _portalShadow: ShadowRoot | null = null;
  private _containingDialog: HTMLDialogElement | null = null;

  private _outsideClickHandler = (e: MouseEvent) => {
    // The popover lives in a portal outside this element's own subtree (see
    // _ensurePortal), so a click inside it doesn't appear under `this` in
    // composedPath() — check the portal host too.
    const path = e.composedPath();
    if (!path.includes(this) && !(this._portalHost && path.includes(this._portalHost))) {
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
  `;

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._destroyPortal();
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
    `;
  }

  override updated() {
    // The popover is rendered imperatively into the portal (below), not
    // through this element's own template — Lit's declarative render()
    // only ever touches this.shadowRoot, so a state change that should
    // update the open popover's content needs an explicit re-render here.
    if (this._popoverOpen) this._renderPortalContent();
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

  /**
   * Renders the popover into a <div> appended outside this element's own
   * shadow DOM, to escape two independent problems HA's card-edit dialog
   * causes for a normal shadow-DOM `position: fixed` child:
   *
   * 1. The dialog nests a native <dialog> two shadow roots deep (ha-dialog
   *    -> wa-dialog -> <dialog>), which carries `transform: matrix(1,0,0,1,0,0)`
   *    — an identity matrix with no visible effect, but per the CSS spec
   *    *any* transform value other than `none` still establishes a new
   *    containing block for `position: fixed` descendants (and clips them
   *    via the dialog's own `overflow: hidden`). A popover positioned with
   *    viewport-relative getBoundingClientRect() coordinates renders
   *    hundreds of pixels off from its trigger as a result.
   * 2. The dialog is shown via showModal(), which promotes it to the
   *    browser's "top layer" — content paints above *any* top-layer
   *    element only if it is itself in the top layer (or a descendant of
   *    one); no z-index outside the dialog can win against it.
   *
   * These two pull in opposite directions: escaping (1) means rendering
   * outside the dialog (e.g. straight on document.body), but that loses
   * the top-layer promotion needed for (2), making the popover invisible
   * behind the modal. The fix used here: find the nearest open modal
   * <dialog> ancestor and append the portal as ITS direct child instead —
   * that keeps the popover in the top layer (fixing #2), and since the
   * dialog is now deliberately the portal's containing block, position is
   * computed relative to the dialog's own rect instead of the viewport's
   * (see _toggleCompactPopover), which is correct *because of* #1, not in
   * spite of it. Falls back to document.body (viewport-relative) when
   * there's no dialog ancestor, e.g. this component used standalone.
   *
   * Confirmed empirically against a live HA instance for both problems.
   */
  private _ensurePortal(): ShadowRoot {
    if (!this._portalShadow) {
      this._portalHost = document.createElement('div');
      (this._containingDialog ?? document.body).appendChild(this._portalHost);
      this._portalShadow = this._portalHost.attachShadow({ mode: 'open' });
    }
    return this._portalShadow;
  }

  private _renderPortalContent() {
    if (!this._portalShadow || !this._popoverPos) return;
    litRender(
      html`
        <style>${popoverStyles}</style>
        <div
          class="popover"
          style="top: ${this._popoverPos.top}px; left: ${this._popoverPos.left}px;"
          @click=${(e: Event) => e.stopPropagation()}
        >
          ${this._renderPickerBody()}
        </div>
      `,
      this._portalShadow,
      { host: this },
    );
  }

  private _destroyPortal() {
    document.removeEventListener('click', this._outsideClickHandler, true);
    this._portalHost?.remove();
    this._portalHost = null;
    this._portalShadow = null;
    this._containingDialog = null;
  }

  private _toggleCompactPopover(e: Event) {
    e.stopPropagation();
    if (this._popoverOpen) {
      this._closePopover();
      return;
    }
    const trigger = e.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    this._containingDialog = findModalDialogAncestor(this);
    // Position (and clamp) relative to whatever the popover's actual
    // containing block will be: the dialog's own rect when one is present
    // (its overflow:hidden clips anything positioned outside it, so the
    // viewport's full bounds aren't the relevant limit), otherwise the
    // viewport itself.
    const bounds = this._containingDialog
      ? this._containingDialog.getBoundingClientRect()
      : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const relLeft = rect.left - bounds.left;
    const relTop = rect.top - bounds.top;
    const relBottom = rect.bottom - bounds.top;

    // 200px popover width (see .popover) — keep it within bounds
    // horizontally if the trigger sits near either edge, common in a dense
    // rule row.
    const left = Math.max(8, Math.min(relLeft, bounds.width - 216));
    // ~132px estimated height (10 presets in a wrapped grid + the custom
    // row is effectively fixed-height content) — open upward instead of
    // down when there isn't room below, same idea as the horizontal clamp
    // above but for a trigger near the bottom of a short viewport/dialog.
    const ESTIMATED_HEIGHT = 132;
    const top = relBottom + ESTIMATED_HEIGHT + 4 <= bounds.height
      ? relBottom + 4
      : Math.max(8, relTop - ESTIMATED_HEIGHT - 4);
    this._popoverPos = { top, left };
    this._popoverOpen = true;
    this._ensurePortal();
    this._renderPortalContent();
    // Capture phase so this fires before the click that opened it finishes
    // bubbling — otherwise it would immediately close itself.
    document.addEventListener('click', this._outsideClickHandler, true);
  }

  private _closePopover() {
    this._popoverOpen = false;
    this._popoverPos = null;
    this._destroyPortal();
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

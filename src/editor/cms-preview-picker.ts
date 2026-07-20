/**
 * cms-preview-picker.ts — the click-to-edit overlay for the live preview
 * (v0.9.0). Fills the preview wrapper, hit-tests the pointer down into the
 * preview card's shadow DOM, shows a highlight box + label chip naming the
 * module that controls the hovered element, and on click dispatches a
 * 'cms-pick' event for the panel to scroll/open/flash that module.
 *
 * The overlay OWNS all pointer events: the preview wrapper keeps its
 * pointer-events:none, so the live card never receives a click — a tap here
 * must never toggle a real light.
 */

import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import {
  mapElementToMatch,
  ENTITY_ROW_TAG_RE,
  type PickChainElement,
  type PickTarget,
} from '../utils/preview-map.js';

interface HighlightBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export class CmsPreviewPicker extends LitElement {
  /** The preview card's `type:` — drives the module mapping. */
  @property({ attribute: false }) cardType = '';
  /** Entities cards: entity_id per row, in config order (undefined for
   *  rows without one, so indices stay aligned with the DOM row order). */
  @property({ attribute: false }) rows: Array<string | undefined> = [];
  /** Optional explicit preview card element. When unset (the normal case —
   *  the panel's keyed() re-renders would make a stored reference stale),
   *  the picker re-queries its parent for `hui-card` on every hit-test. */
  @property({ attribute: false }) cardEl: HTMLElement | null = null;

  @state() private _box: HighlightBox | null = null;
  @state() private _label = '';

  private _target: PickTarget | null = null;

  static override styles = css`
    :host {
      position: absolute;
      inset: 0;
      z-index: 2;
      display: block;
    }

    .overlay {
      position: absolute;
      inset: 0;
      pointer-events: auto;
      cursor: pointer;
      background: transparent;
    }

    /* Highlight box — module-base-ish accents: 2px pink/accent border with a
       faint fill, label pill pinned to the box's top-left corner. */
    .hl {
      position: absolute;
      pointer-events: none;
      border: 2px solid var(--accent-color, #ff4081);
      background: rgba(255, 64, 129, 0.08);
      border-radius: 4px;
      box-sizing: border-box;
      z-index: 1;
    }

    .hl-label {
      position: absolute;
      top: 2px;
      left: 2px;
      max-width: calc(100% - 4px);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 2px 7px;
      border-radius: 10px;
      background: var(--accent-color, #ff4081);
      color: #fff;
      font-size: 10px;
      font-weight: 500;
      line-height: 1.4;
      font-family: var(--primary-font-family, sans-serif);
    }
  `;

  // ---------------------------------------------------------------------------
  // Hit-testing
  // ---------------------------------------------------------------------------

  private get _resolvedCardEl(): HTMLElement | null {
    return this.cardEl ?? this.parentElement?.querySelector('hui-card') ?? null;
  }

  /** HA cards paint transparent interaction layers (the tile's full-card
   *  `div.background` tap surface, ripple elements) ABOVE their visual
   *  content — a plain elementFromPoint returns those instead of the icon
   *  or text underneath (verified live against hui-tile-card). Anything
   *  matching this is skipped in favor of the next element in the stack. */
  private static _isInteractionOverlay(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    if (tag === 'ha-ripple' || tag === 'mwc-ripple' || tag === 'md-ripple') return true;
    if (tag !== 'div' && tag !== 'span' && tag !== 'button') return false;
    const cls = el.className?.toString?.() ?? '';
    return /(^|\s)(background|ripple|overlay|mdc-ripple[\w-]*)(\s|$)/.test(cls);
  }

  /**
   * Geometric hit-test: walk the card's composed tree (piercing open shadow
   * roots) and return the smallest-area element whose rect contains the
   * point. elementFromPoint is a dead end here — HA cards set
   * pointer-events:none on their CONTENT (only a transparent full-card tap
   * layer is interactive, e.g. the tile's div.background), which makes the
   * icon/text invisible to browser hit-testing entirely (verified live).
   * Rects don't care about pointer-events. Overlay/ripple layers are still
   * skipped so the full-card tap surface never wins over real content.
   */
  private _deepElementFromPoint(x: number, y: number): Element | null {
    const cardEl = this._resolvedCardEl;
    if (!cardEl) return null;
    let best: Element | null = null;
    let bestArea = Infinity;
    const stack: Element[] = [cardEl];
    let guard = 0;
    while (stack.length && guard++ < 2000) {
      const el = stack.pop()!;
      if (el.shadowRoot) stack.push(...Array.from(el.shadowRoot.children));
      stack.push(...Array.from(el.children));
      if (CmsPreviewPicker._isInteractionOverlay(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const area = r.width * r.height;
      // <= so a deeper element of equal size wins over its wrapper
      if (area <= bestArea) {
        best = el;
        bestArea = area;
      }
    }
    return best;
  }

  /**
   * Hit-test the point into the preview card. The overlay sits on top and the
   * wrapper is pointer-events:none, so both are temporarily flipped around the
   * (synchronous) elementFromPoint walk and restored in a finally.
   */
  private _hitTest(x: number, y: number): Element | null {
    // Purely geometric (see _deepElementFromPoint) — no pointer-events
    // flipping needed, and the walk is scoped to the card so the result is
    // always inside it.
    return this._deepElementFromPoint(x, y);
  }

  /** Next node up the flattened tree (light parent, or shadow host). */
  private static _flatParent(el: Element): Element | null {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }

  /** Ancestor chain from `deepest` up to and including `cardEl`, or null if
   *  the element isn't inside the preview card at all. */
  private _buildChain(deepest: Element, cardEl: HTMLElement): Element[] | null {
    const chain: Element[] = [];
    let node: Element | null = deepest;
    while (node) {
      chain.push(node);
      if (node === cardEl) return chain;
      node = CmsPreviewPicker._flatParent(node);
    }
    return null; // walked off the top without meeting cardEl
  }

  private static _describe(el: Element): PickChainElement {
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id ?? '',
      classes: Array.from(el.classList),
    };
  }

  /** All entity-row elements inside the card, in document order — used to
   *  translate a hovered row element into an index into `this.rows`. */
  private static _collectRows(node: Element, out: Element[]): void {
    if (ENTITY_ROW_TAG_RE.test(node.tagName.toLowerCase())) {
      out.push(node);
      return; // rows don't nest
    }
    if (node.shadowRoot) {
      for (const child of Array.from(node.shadowRoot.children)) {
        CmsPreviewPicker._collectRows(child, out);
      }
    }
    for (const child of Array.from(node.children)) {
      CmsPreviewPicker._collectRows(child, out);
    }
  }

  private _resolveRowEntity(rowEl: Element, cardEl: HTMLElement): string | undefined {
    const allRows: Element[] = [];
    CmsPreviewPicker._collectRows(cardEl, allRows);
    const index = allRows.indexOf(rowEl);
    return index !== -1 ? this.rows[index] : undefined;
  }

  // ---------------------------------------------------------------------------
  // Pointer handling
  // ---------------------------------------------------------------------------

  /** Recompute target + highlight for a pointer position. Returns the target
   *  (also cached in _target), or null when the point hits nothing pickable. */
  private _updateFromPoint(x: number, y: number): PickTarget | null {
    const cardEl = this._resolvedCardEl;
    const deepest = cardEl ? this._hitTest(x, y) : null;
    const chain = deepest && cardEl ? this._buildChain(deepest, cardEl) : null;
    if (!chain || !cardEl) {
      this._clear();
      return null;
    }

    const match = mapElementToMatch(chain.map(CmsPreviewPicker._describe), this.cardType);
    if (!match) {
      this._clear();
      return null;
    }

    const target: PickTarget = { ...match.target };
    if (target.module === 'cms-entities-rows-module') {
      const rowEl = chain.find((el) => ENTITY_ROW_TAG_RE.test(el.tagName.toLowerCase()));
      if (rowEl) target.rowEntity = this._resolveRowEntity(rowEl, cardEl);
    }

    // Highlight the matched (meaningful) ancestor's rect, not the deepest
    // text node's, positioned relative to this host.
    const rect = chain[match.index].getBoundingClientRect();
    const hostRect = this.getBoundingClientRect();
    this._box = {
      left: rect.left - hostRect.left,
      top: rect.top - hostRect.top,
      width: rect.width,
      height: rect.height,
    };
    this._label = target.rowEntity ? `${target.label} — ${target.rowEntity}` : target.label;
    this._target = target;
    return target;
  }

  private _clear() {
    this._box = null;
    this._label = '';
    this._target = null;
  }

  private _onMouseMove(ev: MouseEvent) {
    this._updateFromPoint(ev.clientX, ev.clientY);
  }

  private _onMouseLeave() {
    this._clear();
  }

  private _onClick(ev: MouseEvent) {
    // The overlay owns the click — it must never reach the live card (and the
    // card is pointer-events:none anyway; this also stops outer handlers).
    ev.preventDefault();
    ev.stopPropagation();
    // Recompute at the click point so tap-without-hover (mobile) works too;
    // fall back to the last hover target if the recompute finds nothing.
    const target = this._updateFromPoint(ev.clientX, ev.clientY) ?? this._target;
    if (!target) return;
    this.dispatchEvent(
      new CustomEvent<PickTarget>('cms-pick', {
        detail: target,
        bubbles: true,
        composed: true,
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  override render() {
    return html`
      <div
        class="overlay"
        @mousemove=${this._onMouseMove}
        @mouseleave=${this._onMouseLeave}
        @click=${this._onClick}
      ></div>
      ${this._box
        ? html`
            <div
              class="hl"
              style="left:${this._box.left}px;top:${this._box.top}px;width:${this._box.width}px;height:${this._box.height}px"
            >
              <span class="hl-label">${this._label}</span>
            </div>
          `
        : nothing}
    `;
  }
}

customElements.define('cms-preview-picker', CmsPreviewPicker);

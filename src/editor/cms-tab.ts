/**
 * cms-tab-button — the "Style" button that appears inside the HA card editor.
 *
 * When clicked it toggles the cms-panel open/closed alongside the native editor.
 * The button is designed to look native next to HA's own ha-icon-button elements.
 */

import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';

export class CmsTabButton extends LitElement {
  /** Whether the Style panel is currently open. */
  @property({ type: Boolean, reflect: true }) active = false;

  static override styles = css`
    :host {
      display: inline-flex;
      align-items: center;
    }

    button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: none;
      border-radius: 20px;
      cursor: pointer;
      font-size: 13px;
      font-family: var(--primary-font-family, sans-serif);
      font-weight: 500;
      transition: background 0.15s ease, color 0.15s ease;
      background: transparent;
      color: var(--secondary-text-color, #727272);
    }

    button:hover {
      background: var(--secondary-background-color, #f5f5f5);
      color: var(--primary-text-color, #212121);
    }

    :host([active]) button {
      background: var(--primary-color, #03a9f4);
      color: #fff;
    }

    :host([active]) button:hover {
      background: var(--dark-primary-color, #0288d1);
    }

    .icon {
      font-size: 16px;
      line-height: 1;
    }
  `;

  private _handleClick() {
    this.active = !this.active;
    this.dispatchEvent(
      new CustomEvent('cms-tab-toggle', {
        detail: { active: this.active },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`
      <button
        @click=${this._handleClick}
        title="${this.active ? 'Close Card-Mod Studio' : 'Open Card-Mod Studio style editor'}"
        aria-pressed="${this.active}"
      >
        <span class="icon">🎨</span>
        Style
      </button>
    `;
  }
}

customElements.define('cms-tab-button', CmsTabButton);

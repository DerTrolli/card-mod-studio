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
      min-height: 36px;
      padding: 6px 14px;
      border: none;
      border-radius: 18px;
      cursor: pointer;
      font-size: 14px;
      font-family: var(--primary-font-family, sans-serif);
      font-weight: 500;
      transition: background 0.15s ease, color 0.15s ease;
      background: transparent;
      color: var(--primary-color, #03a9f4);
    }

    button:hover {
      background: color-mix(in srgb, var(--primary-color, #03a9f4) 10%, transparent);
    }

    button:focus-visible {
      outline: 2px solid var(--primary-color, #03a9f4);
      outline-offset: 2px;
    }

    /* Active = filled, the same treatment as HA's own primary button. */
    :host([active]) button {
      background: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
    }

    :host([active]) button:hover {
      background: var(--dark-primary-color, #0288d1);
    }

    .icon {
      font-size: 16px;
      line-height: 1;
    }

    /* Phones: HA's dialog footer is already full (code-editor toggle,
       Cancel, Save) — the labelled pill squeezed "Show code editor" onto
       three lines. Icon-only there; the accessible name stays "Style". */
    @media (max-width: 500px) {
      button {
        padding: 6px 10px;
      }
      .label {
        display: none;
      }
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
        aria-label="Style"
        aria-pressed="${this.active}"
      >
        <span class="icon" aria-hidden="true">🎨</span>
        <span class="label">Style</span>
      </button>
    `;
  }
}

customElements.define('cms-tab-button', CmsTabButton);

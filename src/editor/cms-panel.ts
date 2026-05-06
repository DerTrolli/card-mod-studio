/**
 * cms-panel — the main Card-Mod Studio style editor panel.
 *
 * Phase 1: renders a placeholder UI so injection can be verified.
 * Future phases add visual modules (filter, icon color, background, etc.)
 */

import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { CardModCardConfig, HomeAssistant } from '../types/index.js';
import { isCardModInstalled } from '../utils/dom-helpers.js';

export class CmsPanel extends LitElement {
  /** The full card config object — passed in by the injector. */
  @property({ attribute: false }) config?: CardModCardConfig;
  /** HA instance — passed in by the injector. */
  @property({ attribute: false }) hass?: HomeAssistant;

  /** Tracks whether card-mod is detected in the browser. */
  @state() private _cardModPresent = false;

  override connectedCallback() {
    super.connectedCallback();
    this._cardModPresent = isCardModInstalled();
  }

  static override styles = css`
    :host {
      display: block;
      position: absolute;
      inset: 0;
      z-index: 10;
      overflow-y: auto;
      padding: 16px;
      background: var(--card-background-color, var(--ha-card-background, #1c1c1c));
      font-family: var(--primary-font-family, sans-serif);
      color: var(--primary-text-color, #e1e1e1);
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }

    .header-icon {
      font-size: 24px;
    }

    .header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 500;
      color: var(--primary-text-color, #212121);
    }

    .header .version {
      font-size: 11px;
      color: var(--secondary-text-color, #727272);
      margin-left: auto;
    }

    .warning-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--warning-color, #ff9800);
      color: #fff;
      font-size: 13px;
      margin-bottom: 16px;
    }

    .placeholder {
      padding: 32px 16px;
      text-align: center;
      color: var(--secondary-text-color, #727272);
      border: 2px dashed var(--divider-color, #e0e0e0);
      border-radius: 8px;
    }

    .placeholder p {
      margin: 8px 0 0;
      font-size: 13px;
    }

    .card-info {
      margin-top: 20px;
      padding: 12px;
      background: var(--secondary-background-color, #f5f5f5);
      border-radius: 8px;
      font-size: 12px;
    }

    .card-info h3 {
      margin: 0 0 8px;
      font-size: 13px;
      font-weight: 500;
    }

    .card-info code {
      display: block;
      background: var(--code-editor-background-color, #1e1e1e);
      color: #d4d4d4;
      padding: 10px;
      border-radius: 4px;
      font-family: var(--code-font-family, monospace);
      font-size: 12px;
      white-space: pre;
      overflow-x: auto;
      margin-top: 4px;
    }

    .coming-soon {
      margin-top: 20px;
    }

    .coming-soon h3 {
      font-size: 13px;
      font-weight: 500;
      margin: 0 0 8px;
      color: var(--secondary-text-color, #727272);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .feature-list {
      display: grid;
      gap: 6px;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .feature-list li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--secondary-background-color, #f5f5f5);
      border-radius: 6px;
      font-size: 13px;
      color: var(--secondary-text-color, #727272);
    }

    .feature-list li .icon {
      font-size: 18px;
    }
  `;

  override render() {
    return html`
      <div class="header">
        <span class="header-icon">🎨</span>
        <h2>Card-Mod Studio</h2>
        <span class="version">v0.1.0 — Phase 1</span>
      </div>

      ${!this._cardModPresent
        ? html`
          <div class="warning-banner">
            ⚠️ card-mod not detected. Install card-mod first, then your generated styles will apply.
          </div>
        `
        : nothing}

      <div class="placeholder">
        <strong>Style editor is loading...</strong>
        <p>
          Injection successful! Visual controls will appear here in Phase 3.<br />
          For now you can verify the tab appears and this panel opens correctly.
        </p>
      </div>

      ${this.config
        ? html`
          <div class="card-info">
            <h3>Current card config</h3>
            <code>${JSON.stringify(this.config, null, 2)}</code>
          </div>
        `
        : nothing}

      <div class="coming-soon">
        <h3>Planned modules</h3>
        <ul class="feature-list">
          <li><span class="icon">🔲</span> Visual Filters (grayscale, brightness, blur)</li>
          <li><span class="icon">🎨</span> Icon Color (on/off states)</li>
          <li><span class="icon">🖼️</span> Background (solid &amp; gradient)</li>
          <li><span class="icon">✨</span> Animation Presets</li>
          <li><span class="icon">⬛</span> Border &amp; Border Radius</li>
          <li><span class="icon">⌨️</span> Advanced Raw CSS Editor</li>
        </ul>
      </div>
    `;
  }
}

customElements.define('cms-panel', CmsPanel);

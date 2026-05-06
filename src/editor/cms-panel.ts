/**
 * cms-panel — the main Card-Mod Studio style editor panel.
 *
 * Phase 1: shell with placeholder content, injection proof-of-concept.
 * Phase 2: wires up the YAML/CSS parser and shows the parsed state.
 * Phase 3 (upcoming): replaces the placeholder with real visual controls.
 */

import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { CardModCardConfig, HomeAssistant, StudioState } from '../types/index.js';
import { isCardModInstalled } from '../utils/dom-helpers.js';
import { parseCardModConfig } from '../parser/yaml-parser.js';
import { mapToStudioState } from '../parser/state-mapper.js';

export class CmsPanel extends LitElement {
  /** The full card config object — passed in by the injector. */
  @property({ attribute: false }) config?: CardModCardConfig;
  /** HA instance — passed in by the injector. */
  @property({ attribute: false }) hass?: HomeAssistant;

  @state() private _cardModPresent = false;
  /** Parsed state derived from the card's existing card_mod block, if any. */
  @state() private _parsedState: StudioState | null = null;
  /** True when the card has an existing card_mod block. */
  @state() private _hasExistingCardMod = false;

  override connectedCallback() {
    super.connectedCallback();
    this._cardModPresent = isCardModInstalled();
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    super.updated(changed);
    // Re-parse whenever the card config changes.
    if (changed.has('config')) {
      this._parseConfig();
    }
  }

  private _parseConfig() {
    if (!this.config) {
      this._parsedState = null;
      this._hasExistingCardMod = false;
      return;
    }
    this._hasExistingCardMod = !!this.config.card_mod?.style;
    if (this._hasExistingCardMod) {
      const parsed = parseCardModConfig(this.config);
      this._parsedState = mapToStudioState(parsed);
    } else {
      this._parsedState = null;
    }
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
      border-bottom: 1px solid var(--divider-color, #383838);
    }

    .header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 500;
    }

    .header .version {
      font-size: 11px;
      color: var(--secondary-text-color, #9e9e9e);
      margin-left: auto;
    }

    .warning-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(255, 152, 0, 0.15);
      border: 1px solid #ff9800;
      color: #ff9800;
      font-size: 13px;
      margin-bottom: 16px;
    }

    .parsed-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 6px;
      background: rgba(76, 175, 80, 0.15);
      border: 1px solid #4caf50;
      color: #4caf50;
      font-size: 12px;
      margin-bottom: 16px;
    }

    .section {
      margin-bottom: 16px;
      border: 1px solid var(--divider-color, #383838);
      border-radius: 8px;
      overflow: hidden;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: rgba(255,255,255,0.04);
      font-size: 13px;
      font-weight: 500;
      border-bottom: 1px solid var(--divider-color, #383838);
    }

    .section-body {
      padding: 12px 14px;
      font-size: 12px;
    }

    .prop-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }

    .prop-row:last-child {
      border-bottom: none;
    }

    .prop-name {
      color: var(--secondary-text-color, #9e9e9e);
    }

    .prop-value {
      font-weight: 500;
    }

    .prop-value.active {
      color: #4caf50;
    }

    .placeholder {
      padding: 24px 16px;
      text-align: center;
      color: var(--secondary-text-color, #9e9e9e);
      border: 2px dashed var(--divider-color, #383838);
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .placeholder p {
      margin: 8px 0 0;
      font-size: 13px;
      line-height: 1.5;
    }

    .raw-css {
      font-family: var(--code-font-family, monospace);
      font-size: 11px;
      background: rgba(0,0,0,0.3);
      padding: 10px;
      border-radius: 4px;
      white-space: pre-wrap;
      word-break: break-all;
      color: #d4d4d4;
      max-height: 200px;
      overflow-y: auto;
    }

    .coming-soon h3 {
      font-size: 12px;
      font-weight: 500;
      margin: 0 0 8px;
      color: var(--secondary-text-color, #9e9e9e);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .feature-list {
      display: grid;
      gap: 5px;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .feature-list li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
      background: rgba(255,255,255,0.04);
      border-radius: 6px;
      font-size: 12px;
      color: var(--secondary-text-color, #9e9e9e);
    }
  `;

  override render() {
    return html`
      <div class="header">
        <span>🎨</span>
        <h2>Card-Mod Studio</h2>
        <span class="version">v0.1.1 — Phase 2</span>
      </div>

      ${!this._cardModPresent ? html`
        <div class="warning-banner">
          ⚠️ card-mod not detected — install card-mod first or generated YAML won't apply.
        </div>
      ` : nothing}

      ${this._hasExistingCardMod && this._parsedState ? html`
        <div class="parsed-badge">
          ✓ Existing card_mod styles detected and parsed
        </div>
        ${this._renderParsedState(this._parsedState)}
      ` : html`
        <div class="placeholder">
          <strong>No card_mod styles yet</strong>
          <p>Visual controls will appear here in Phase 3.<br/>
          Add a card_mod block to this card to see it parsed here.</p>
        </div>
      `}

      <div class="coming-soon">
        <h3>Visual controls — Phase 3</h3>
        <ul class="feature-list">
          <li>🔲 Visual Filters (grayscale, brightness, blur)</li>
          <li>🎨 Icon Color (on/off states)</li>
          <li>🖼️ Background (solid &amp; gradient)</li>
          <li>✨ Animation Presets</li>
          <li>⬛ Border &amp; Border Radius</li>
          <li>⌨️ Advanced Raw CSS Editor</li>
        </ul>
      </div>
    `;
  }

  private _renderParsedState(state: StudioState) {
    return html`
      ${state.filter.enabled ? html`
        <div class="section">
          <div class="section-header">🔲 Filter</div>
          <div class="section-body">
            ${this._row('Grayscale when off', state.filter.grayscaleWhenOff)}
            ${this._row('Brightness', `${state.filter.brightness}%`)}
            ${state.filter.blur > 0 ? this._row('Blur', `${state.filter.blur}px`) : nothing}
            ${this._row('Transition', `${state.filter.transitionMs}ms`)}
          </div>
        </div>
      ` : nothing}

      ${state.iconColor.enabled ? html`
        <div class="section">
          <div class="section-header">🎨 Icon Color</div>
          <div class="section-body">
            ${this._row('Color ON', state.iconColor.colorOn)}
            ${this._row('Color OFF', state.iconColor.colorOff)}
          </div>
        </div>
      ` : nothing}

      ${state.background.enabled ? html`
        <div class="section">
          <div class="section-header">🖼️ Background</div>
          <div class="section-body">
            ${this._row('Type', state.background.type)}
            ${this._row('Color 1', state.background.color1)}
            ${state.background.type === 'gradient' ? html`
              ${this._row('Color 2', state.background.color2)}
              ${this._row('Angle', `${state.background.angle}°`)}
            ` : nothing}
          </div>
        </div>
      ` : nothing}

      ${state.border.enabled ? html`
        <div class="section">
          <div class="section-header">⬛ Border</div>
          <div class="section-body">
            ${this._row('Border radius', `${state.border.radiusPx}px`)}
            ${state.border.borderWidth > 0 ? html`
              ${this._row('Border width', `${state.border.borderWidth}px`)}
              ${this._row('Border color', state.border.borderColor)}
            ` : nothing}
          </div>
        </div>
      ` : nothing}

      ${state.advanced.rawCss ? html`
        <div class="section">
          <div class="section-header">⌨️ Raw CSS (preserved)</div>
          <div class="section-body">
            <div class="raw-css">${state.advanced.rawCss}</div>
          </div>
        </div>
      ` : nothing}
    `;
  }

  private _row(label: string, value: boolean | string | number) {
    const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
    const active = value === true || (typeof value === 'string' && value !== 'No');
    return html`
      <div class="prop-row">
        <span class="prop-name">${label}</span>
        <span class="prop-value ${active ? 'active' : ''}">${display}</span>
      </div>
    `;
  }
}

customElements.define('cms-panel', CmsPanel);

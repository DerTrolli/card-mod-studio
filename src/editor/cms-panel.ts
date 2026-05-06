/**
 * cms-panel — the Card-Mod Studio style editor panel.
 *
 * Phase 3: full visual module controls + CSS/YAML generation.
 *
 * Data flow
 * ---------
 *  1. `config` prop is set by the injector whenever hui-dialog-edit-card
 *     updates its _cardConfig.
 *  2. On first load (or when config changes from an external source), the
 *     parser pipeline runs: parseCardModConfig → mapToStudioState.
 *  3. The resulting StudioState is passed down to each module component.
 *  4. When a module fires `state-changed`, we update _studioState, regenerate
 *     CSS via generateCss(), merge it back into the card config via
 *     applyCardModStyle(), and fire a composed `config-changed` event.
 *  5. hui-dialog-edit-card catches config-changed, updates _cardConfig, and
 *     saves it when the user clicks the Save button.
 *
 * Re-parse guard
 * --------------
 * After we fire config-changed, HA passes the updated config back to us as a
 * new `config` prop.  Without a guard we'd re-parse our own output and reset
 * any in-flight UI state.  We prevent this by storing the JSON of the last
 * config we emitted and skipping re-parse when they match.
 */

import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type {
  CardModCardConfig,
  HomeAssistant,
  StudioState,
  FilterModuleState,
  IconColorModuleState,
  BackgroundModuleState,
  AnimationModuleState,
  BorderModuleState,
  AdvancedModuleState,
} from '../types/index.js';
import { isCardModInstalled } from '../utils/dom-helpers.js';
import { parseCardModConfig } from '../parser/yaml-parser.js';
import { mapToStudioState } from '../parser/state-mapper.js';
import { generateCss } from '../generator/css-generator.js';
import { applyCardModStyle } from '../generator/yaml-generator.js';

// Side-effect imports — register the custom elements
import '../modules/module-filter.js';
import '../modules/module-icon-color.js';
import '../modules/module-background.js';
import '../modules/module-animation.js';
import '../modules/module-border.js';
import '../modules/module-advanced.js';

export class CmsPanel extends LitElement {
  @property({ attribute: false }) config?: CardModCardConfig;
  @property({ attribute: false }) hass?: HomeAssistant;

  @state() private _cardModPresent = false;
  @state() private _studioState: StudioState | null = null;

  /** JSON of the last config we emitted — used to skip re-parse of our own output. */
  private _lastEmittedConfigJson: string | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this._cardModPresent = isCardModInstalled();
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    super.updated(changed);
    if (changed.has('config')) {
      this._initState();
    }
  }

  private _initState() {
    if (!this.config) {
      this._studioState = null;
      this._lastEmittedConfigJson = null;
      return;
    }

    // Skip re-parse when this config was produced by our own emit
    const configJson = JSON.stringify(this.config);
    if (configJson === this._lastEmittedConfigJson) return;

    const parsed = parseCardModConfig(this.config);
    this._studioState = mapToStudioState(parsed);
  }

  // ---------------------------------------------------------------------------
  // Module state handlers
  // ---------------------------------------------------------------------------

  private _onFilterChanged(e: CustomEvent<FilterModuleState>) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, filter: e.detail };
    this._emitConfigChanged();
  }

  private _onIconColorChanged(e: CustomEvent<IconColorModuleState>) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, iconColor: e.detail };
    this._emitConfigChanged();
  }

  private _onBackgroundChanged(e: CustomEvent<BackgroundModuleState>) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, background: e.detail };
    this._emitConfigChanged();
  }

  private _onAnimationChanged(e: CustomEvent<AnimationModuleState>) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, animation: e.detail };
    this._emitConfigChanged();
  }

  private _onBorderChanged(e: CustomEvent<BorderModuleState>) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, border: e.detail };
    this._emitConfigChanged();
  }

  private _onAdvancedChanged(e: CustomEvent<AdvancedModuleState>) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, advanced: e.detail };
    this._emitConfigChanged();
  }

  private _emitConfigChanged() {
    if (!this.config || !this._studioState) return;
    const css = generateCss(this._studioState);
    const newConfig = applyCardModStyle(css, this.config);
    this._lastEmittedConfigJson = JSON.stringify(newConfig);
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        bubbles: true,
        composed: true,
        detail: { config: newConfig },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

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
      box-sizing: border-box;
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

    .no-config {
      padding: 24px 16px;
      text-align: center;
      color: var(--secondary-text-color, #9e9e9e);
      border: 2px dashed var(--divider-color, #383838);
      border-radius: 8px;
      font-size: 13px;
    }
  `;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  override render() {
    return html`
      <div class="header">
        <span>🎨</span>
        <h2>Card-Mod Studio</h2>
        <span class="version">v0.2.0 — Phase 3</span>
      </div>

      ${!this._cardModPresent
        ? html`
            <div class="warning-banner">
              ⚠️ card-mod not detected — install card-mod first or generated YAML won't apply.
            </div>
          `
        : nothing}

      ${this._studioState
        ? this._renderModules(this._studioState)
        : html`<div class="no-config">No card selected.</div>`}
    `;
  }

  private _renderModules(s: StudioState) {
    return html`
      <cms-filter-module
        .state=${s.filter}
        @state-changed=${this._onFilterChanged}
      ></cms-filter-module>

      <cms-icon-color-module
        .state=${s.iconColor}
        @state-changed=${this._onIconColorChanged}
      ></cms-icon-color-module>

      <cms-background-module
        .state=${s.background}
        @state-changed=${this._onBackgroundChanged}
      ></cms-background-module>

      <cms-animation-module
        .state=${s.animation}
        @state-changed=${this._onAnimationChanged}
      ></cms-animation-module>

      <cms-border-module
        .state=${s.border}
        @state-changed=${this._onBorderChanged}
      ></cms-border-module>

      <cms-advanced-module
        .state=${s.advanced}
        @state-changed=${this._onAdvancedChanged}
      ></cms-advanced-module>
    `;
  }
}

customElements.define('cms-panel', CmsPanel);

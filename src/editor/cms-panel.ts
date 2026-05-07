/**
 * cms-panel — Card-Mod Studio style editor panel (Phase 3).
 *
 * Data flow
 * ---------
 *  1. `config` prop set by injector from hui-dialog-edit-card._cardConfig.
 *  2. On first load or external config change, parser pipeline runs.
 *  3. StudioState is passed to each module component.
 *  4. Module fires `state-changed` → panel updates state, regenerates CSS,
 *     fires composed `config-changed` → HA updates _cardConfig → saves on
 *     user click. The preview re-renders automatically (HA reactive state).
 *
 * Re-parse guard
 * --------------
 * Stores JSON of last emitted config; skips re-parse when incoming config
 * matches — prevents feedback loop when HA passes our own config back.
 *
 * Entity-state awareness
 * ----------------------
 * Checks whether the card entity has binary on/off states by inspecting
 * `hass.states[entity]`. Passes this to modules so they can hide irrelevant
 * on/off controls for sensor-type cards.
 */

import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type {
  CardModCardConfig,
  HomeAssistant,
  StudioState,
  FilterModuleState,
  IconColorModuleState,
  AccentColorModuleState,
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

import '../modules/module-filter.js';
import '../modules/module-icon-color.js';
import '../modules/module-accent-color.js';
import '../modules/module-background.js';
import '../modules/module-animation.js';
import '../modules/module-border.js';
import '../modules/module-advanced.js';

/** Card types that don't have binary on/off entity states. */
const NON_STATE_CARD_TYPES = new Set([
  'sensor', 'gauge', 'history-graph', 'statistics-graph', 'statistic',
  'energy-distribution', 'energy-usage-graph', 'calendar', 'todo-list',
  'weather-forecast', 'sun', 'map', 'media-control',
]);

export class CmsPanel extends LitElement {
  @property({ attribute: false }) config?: CardModCardConfig;
  @property({ attribute: false }) hass?: HomeAssistant;

  @state() private _cardModPresent = false;
  @state() private _studioState: StudioState | null = null;

  private _lastEmittedConfigJson: string | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this._cardModPresent = isCardModInstalled();
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    super.updated(changed);
    if (changed.has('config') || changed.has('hass')) {
      this._initState();
    }
  }

  private _initState() {
    if (!this.config) {
      this._studioState = null;
      this._lastEmittedConfigJson = null;
      return;
    }
    const configJson = JSON.stringify(this.config);
    if (configJson === this._lastEmittedConfigJson) return;

    const parsed = parseCardModConfig(this.config);
    this._studioState = mapToStudioState(parsed);
  }

  /**
   * Returns true when the card's entity has binary on/off states.
   * Falls back to true (show all controls) when unknown.
   */
  private get _isStateAware(): boolean {
    const entityId = this.config?.entity as string | undefined;
    if (!entityId || !this.hass) {
      // No entity or no hass — check card type as fallback
      return !NON_STATE_CARD_TYPES.has(this.config?.type ?? '');
    }
    const entity = this.hass.states[entityId];
    if (!entity) return !NON_STATE_CARD_TYPES.has(this.config?.type ?? '');

    const domain = entityId.split('.')[0];
    const binaryDomains = [
      'switch', 'light', 'binary_sensor', 'input_boolean', 'lock',
      'fan', 'cover', 'climate', 'alarm_control_panel', 'person',
      'automation', 'script', 'timer', 'group', 'input_button',
    ];
    return binaryDomains.includes(domain) || ['on', 'off'].includes(entity.state);
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

  private _onAccentColorChanged(e: CustomEvent<AccentColorModuleState>) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, accentColor: e.detail };
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

    .header h2 { margin: 0; font-size: 18px; font-weight: 500; }
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

    .info-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 8px;
      background: rgba(33, 150, 243, 0.1);
      border: 1px solid #2196F3;
      color: #2196F3;
      font-size: 12px;
      margin-bottom: 12px;
    }

    .no-config {
      padding: 24px 16px;
      text-align: center;
      color: var(--secondary-text-color, #9e9e9e);
      border: 2px dashed var(--divider-color, #383838);
      border-radius: 8px;
      font-size: 13px;
    }

    .preview-hint {
      font-size: 11px;
      color: var(--secondary-text-color, #9e9e9e);
      text-align: center;
      margin-bottom: 12px;
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
        <span class="version">v0.3.0 — Phase 3</span>
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
    const stateAware = this._isStateAware;
    // Auto-expand Advanced CSS when there's unrecognised content to show
    const hasUnrecognisedCss = !!s.advanced.rawCss.trim();

    return html`
      <p class="preview-hint">
        💡 Changes apply live — watch the card preview on the right.
      </p>

      ${hasUnrecognisedCss
        ? html`
            <div class="info-banner">
              ℹ️ Some existing styles weren't recognised by visual modules — they're
              preserved in Advanced CSS below.
            </div>
          `
        : nothing}

      <cms-filter-module
        .state=${s.filter}
        @state-changed=${this._onFilterChanged}
      ></cms-filter-module>

      <cms-accent-color-module
        .state=${s.accentColor}
        @state-changed=${this._onAccentColorChanged}
      ></cms-accent-color-module>

      <cms-icon-color-module
        .state=${s.iconColor}
        ?state-aware=${stateAware}
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
        ?open=${hasUnrecognisedCss}
        @state-changed=${this._onAdvancedChanged}
      ></cms-advanced-module>
    `;
  }
}

customElements.define('cms-panel', CmsPanel);

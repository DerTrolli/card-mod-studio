import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { keyed } from 'lit/directives/keyed.js';
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
  ThresholdModuleState,
  AdvancedModuleState,
  HeadingStyleModuleState,
  EntitiesCardRow,
  EntitiesRowStyle,
  EntitiesRowStyles,
} from '../types/index.js';
import { isCardModInstalled, isUixInstalled } from '../utils/dom-helpers.js';
import { isUixOnlyStyle, usesUixOnlyFeatures, hasUixOnlyRow, resolveStyle } from '../utils/style-compat.js';
import { loadPresets, savePresets } from '../utils/preset-storage.js';
import type { StylePreset } from '../utils/preset-storage.js';
import { parseCardModConfig } from '../parser/yaml-parser.js';
import { mapToStudioState, parseEntityRowCss } from '../parser/state-mapper.js';
import { generateCss, buildThresholdJinja } from '../generator/css-generator.js';
import { applyCardModStyle, pickOutputKey } from '../generator/yaml-generator.js';

import '../modules/module-filter.js';
import '../modules/module-icon-color.js';
import '../modules/module-accent-color.js';
import '../modules/module-background.js';
import '../modules/module-animation.js';
import '../modules/module-border.js';
import '../modules/module-threshold.js';
import '../modules/module-advanced.js';
import '../modules/module-heading-style.js';
import '../modules/module-entities-rows.js';

declare const __APP_VERSION__: string;
const VERSION = __APP_VERSION__;

const NON_STATE_CARD_TYPES = new Set([
  'sensor', 'gauge', 'history-graph', 'statistics-graph', 'statistic',
  'energy-distribution', 'energy-usage-graph', 'calendar', 'todo-list',
  'weather-forecast', 'sun', 'map', 'media-control',
]);

const CONTAINER_CARD_TYPES = new Set([
  'grid', 'vertical-stack', 'horizontal-stack', 'sections', 'conditional',
]);

const NO_ANIMATION_TYPES = new Set([
  'gauge', 'history-graph', 'statistics-graph', 'statistic',
  'energy-distribution', 'energy-usage-graph',
  'thermostat', 'humidifier', 'light', 'alarm-panel',
  'media-control', 'weather-forecast', 'calendar', 'logbook', 'activity',
  'map', 'iframe', 'webpage', 'shopping-list', 'todo-list',
  'heading', 'picture', 'picture-entity', 'picture-glance', 'picture-elements',
]);

const NO_BACKGROUND_TYPES = new Set([
  'picture', 'picture-entity', 'picture-glance', 'picture-elements',
  'iframe', 'webpage', 'map',
  // heading cards have no painted ha-card box — background has no visual effect
  // (verified empirically). See docs/CARD_SUPPORT_MATRIX.md.
  'heading',
]);

// Border (width/colour + radius) has no visual effect on heading cards (no
// painted box). Radius/filter aside, the whole module is moot there.
const NO_BORDER_TYPES = new Set([
  'heading',
]);

const NO_ICON_COLOR_TYPES = new Set([
  'gauge', 'history-graph', 'statistics-graph', 'statistic',
  'energy-distribution', 'energy-usage-graph',
  'thermostat', 'humidifier',
  'weather-forecast', 'calendar', 'logbook', 'activity',
  'markdown', 'map', 'iframe', 'webpage', 'shopping-list', 'todo-list',
  'picture', 'picture-entity',
  'heading',
  // glance renders its icon inside a nested <state-badge> shadow root that a
  // card-mod rule can't pierce, and the colour is applied inline from state —
  // no selector recolours it (verified empirically), so don't offer a dead
  // control. alarm-panel and media-control DO honour icon colour (plain mode)
  // and are intentionally NOT listed here.
  'glance',
]);

export class CmsPanel extends LitElement {
  @property({ attribute: false }) config?: CardModCardConfig;
  @property({ attribute: false }) hass?: HomeAssistant;

  @state() private _cardModPresent = false;
  @state() private _uixPresent = false;
  @state() private _studioState: StudioState | null = null;
  @state() private _previewConfig: CardModCardConfig | undefined = undefined;
  @state() private _previewKey = 0;
  @state() private _presets: StylePreset[] = [];
  @state() private _selectedPreset = '';
  @state() private _entityRowStyles: EntitiesRowStyles = {};
  /** True when the panel is too narrow for the side-by-side preview. */
  @state() private _narrow = false;

  private _lastEmittedConfigJson: string | null = null;
  private _resizeObserver?: ResizeObserver;

  override connectedCallback() {
    super.connectedCallback();
    this._cardModPresent = isCardModInstalled();
    this._uixPresent = isUixInstalled();
    // Load from localStorage immediately (sync); HA sync happens when hass arrives
    void loadPresets(undefined).then((p) => { this._presets = p; });
    // Width-responsive: the side preview is a fixed 280px, so below ~600px the
    // controls get crushed. Observe our own width and stack the preview instead.
    this._resizeObserver = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) this._narrow = w < 600;
    });
    this._resizeObserver.observe(this);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    super.updated(changed);
    if (changed.has('config') || changed.has('hass')) {
      this._initState();
      this._previewConfig = undefined;
    }
    // When hass first becomes available, reload presets from HA (cross-device sync)
    if (changed.has('hass') && this.hass && !changed.get('hass')) {
      void loadPresets(this.hass).then((p) => { this._presets = p; });
    }
  }

  private _initState() {
    if (!this.config) {
      this._studioState = null;
      this._entityRowStyles = {};
      this._lastEmittedConfigJson = null;
      return;
    }
    const configJson = JSON.stringify(this.config);
    if (configJson === this._lastEmittedConfigJson) return;

    const parsed = parseCardModConfig(this.config);
    this._studioState = mapToStudioState(parsed);
    this._initEntityRowStyles();
  }

  private _initEntityRowStyles() {
    if (this.config?.type !== 'entities') {
      this._entityRowStyles = {};
      return;
    }
    const rows = (this.config as unknown as { entities?: EntitiesCardRow[] }).entities;
    if (!rows?.length) { this._entityRowStyles = {}; return; }

    const styles: EntitiesRowStyles = {};
    for (const row of rows) {
      if (!row.entity) continue;
      // Same uix:/card_mod: precedence UIX itself uses (see style-compat.ts),
      // so a row hand-authored (or previously saved) under uix: reads back
      // correctly, and an explicit-but-empty uix.style doesn't mask a real
      // card_mod.style.
      const modStyle = resolveStyle(row);
      if (typeof modStyle === 'string') {
        styles[row.entity] = parseEntityRowCss(modStyle);
      }
    }
    this._entityRowStyles = styles;
  }

  private _generateEntityRowCss(style: EntitiesRowStyle, entityId: string): string {
    const decls: string[] = [];

    if (style.iconMode === 'threshold' && style.iconRules?.length && style.iconDefault) {
      decls.push(`  --state-icon-color: ${buildThresholdJinja(style.iconRules, style.iconDefault, entityId)};`);
    } else if (style.iconColor) {
      decls.push(`  --state-icon-color: ${style.iconColor};`);
    }

    if (style.textMode === 'threshold' && style.textRules?.length && style.textDefault) {
      decls.push(`  color: ${buildThresholdJinja(style.textRules, style.textDefault, entityId)};`);
    } else if (style.textColor) {
      decls.push(`  color: ${style.textColor};`);
    }

    if (!decls.length) return '';
    return `:host {\n${decls.join('\n')}\n}`;
  }

  private _applyEntityRowStyles(config: CardModCardConfig): CardModCardConfig {
    const rows = (config as unknown as { entities?: EntitiesCardRow[] }).entities;
    if (!rows?.length) return config;

    const outputKey = pickOutputKey();
    const updatedRows = rows.map((row) => {
      if (!row.entity) return row;
      const rowStyle = this._entityRowStyles[row.entity];
      // A row is "styled" if it has a static color OR a threshold mode with at
      // least one rule. Checking only static colors would silently discard
      // threshold-mode rows (whose static colors are empty by design).
      const hasIcon = !!(
        rowStyle?.iconColor ||
        (rowStyle?.iconMode === 'threshold' && rowStyle?.iconRules?.length)
      );
      const hasText = !!(
        rowStyle?.textColor ||
        (rowStyle?.textMode === 'threshold' && rowStyle?.textRules?.length)
      );
      const rowCss = hasIcon || hasText
        ? this._generateEntityRowCss(rowStyle!, row.entity)
        : '';
      return applyCardModStyle(rowCss, row as unknown as CardModCardConfig, outputKey) as unknown as EntitiesCardRow;
    });

    return { ...(config as unknown as object), entities: updatedRows } as unknown as CardModCardConfig;
  }

  // ---------------------------------------------------------------------------
  // card-mod / UIX compatibility
  // ---------------------------------------------------------------------------

  /**
   * True when this card's own top-level styling lives only under uix:
   * (nothing under card_mod: to fall back to) and UIX isn't currently
   * installed to read it — i.e. this specific card is about to render
   * unstyled, distinct from the generic "neither engine detected" case.
   */
  private get _uixOnlyAtRisk(): boolean {
    return !this._uixPresent && !!this.config && isUixOnlyStyle(this.config);
  }

  /** Same risk, but for an entities card's individual rows — rows carry their own independent card_mod/uix blocks. */
  private get _uixOnlyRowsAtRisk(): boolean {
    return !this._uixPresent && !!this.config && hasUixOnlyRow(this.config);
  }

  private get _uixOnlyUsesMacros(): boolean {
    return !!this.config && usesUixOnlyFeatures(this.config);
  }

  /**
   * True when card-mod is the active write target (pickOutputKey() would
   * resolve to 'card_mod') and a uix: block using macros/billets sits
   * alongside it. Studio edits keep updating card_mod:, but — since that
   * uix: content can't be safely regenerated (see applyCardModStyle's doc
   * comment) — it's deliberately left untouched, and UIX (if actually
   * installed) keeps rendering it unchanged rather than the studio's edits.
   * Purely informational: there's nothing to "fix," just something worth
   * knowing. Mirrors pickOutputKey()'s own condition rather than checking
   * this.config.card_mod directly, since the sync-skip applies the moment
   * card-mod is the target, even on a card with no card_mod block yet.
   */
  private get _uixMacrosCoexist(): boolean {
    return !!this.config && this._cardModPresent && usesUixOnlyFeatures(this.config);
  }

  /**
   * True when UIX is the active write target (pickOutputKey() would resolve
   * to 'uix' — UIX installed, card-mod not) and the card's existing uix:
   * block already uses macros/billets. Unlike the card_mod-primary case
   * above, there's no fallback key to write to instead, so studio edits here
   * DO overwrite uix.style directly — this is a heads-up that doing so will
   * replace the hand-authored macro/billet-driven styling, not a "safe, no
   * data lost" guarantee.
   */
  private get _uixMacrosWillBeOverwritten(): boolean {
    return !!this.config && this._uixPresent && !this._cardModPresent && usesUixOnlyFeatures(this.config);
  }

  /**
   * Re-saves the card with its current studio state so uix-only styling (card
   * level and/or per-row) gets a card_mod: block too. Since _studioState and
   * _entityRowStyles were parsed from uix.style with the same precedence UIX
   * itself uses, and pickOutputKey() already resolves to 'card_mod' whenever
   * UIX isn't installed, this is just "save now" without waiting for the user
   * to touch an unrelated control first — _emitConfigChanged() already
   * reapplies every row for entities cards, so this fixes rows too.
   */
  private _copyUixStyleToCardMod() {
    this._emitConfigChanged();
  }

  // ---------------------------------------------------------------------------
  // Card-type helpers
  // ---------------------------------------------------------------------------

  private get _isContainerCard(): boolean {
    return CONTAINER_CARD_TYPES.has(this.config?.type ?? '');
  }

  private get _showIconColor(): boolean {
    if (this.config?.type === 'entities') return false;
    return !NO_ICON_COLOR_TYPES.has(this.config?.type ?? '');
  }

  private get _isEntitiesCard(): boolean {
    return this.config?.type === 'entities';
  }

  private get _showAnimation(): boolean {
    return !NO_ANIMATION_TYPES.has(this.config?.type ?? '');
  }

  private get _showBackground(): boolean {
    return !NO_BACKGROUND_TYPES.has(this.config?.type ?? '');
  }

  private get _showBorder(): boolean {
    return !NO_BORDER_TYPES.has(this.config?.type ?? '');
  }

  private get _showHeadingStyle(): boolean {
    return this.config?.type === 'heading';
  }

  private get _isLightCard(): boolean {
    return this.config?.type === 'light';
  }

  private get _isStateAware(): boolean {
    const entityId = this.config?.entity as string | undefined;
    if (!entityId || !this.hass) {
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

  private _onHeadingStyleChanged(e: CustomEvent<HeadingStyleModuleState>) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, headingStyle: e.detail };
    this._emitConfigChanged();
  }

  private _onThresholdChanged(e: CustomEvent<ThresholdModuleState>) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, threshold: e.detail };
    this._emitConfigChanged();
  }

  private _emitConfigChanged() {
    if (!this.config || !this._studioState) return;
    const css = generateCss(this._studioState, this.config?.type);
    let newConfig = applyCardModStyle(css, this.config, pickOutputKey());
    if (this.config.type === 'entities') {
      newConfig = this._applyEntityRowStyles(newConfig);
    }
    this._previewConfig = newConfig;
    this._previewKey++;
    this._lastEmittedConfigJson = JSON.stringify(newConfig);
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        bubbles: true,
        composed: true,
        detail: { config: newConfig },
      }),
    );
  }

  private _onEntityRowStylesChanged(e: CustomEvent<EntitiesRowStyles>) {
    this._entityRowStyles = e.detail;
    this._emitConfigChanged();
  }

  // ---------------------------------------------------------------------------
  // Preset management
  // ---------------------------------------------------------------------------

  private _saveCurrentAsPreset() {
    if (!this._studioState) return;
    const name = window.prompt('Preset name:');
    if (!name?.trim()) return;
    const trimmed = name.trim();
    const updated = [
      ...this._presets.filter((p) => p.name !== trimmed),
      { name: trimmed, state: { ...this._studioState } },
    ];
    this._presets = updated;
    this._selectedPreset = trimmed;
    void savePresets(updated, this.hass);
  }

  private _onPresetSelect(e: Event) {
    const name = (e.target as HTMLSelectElement).value;
    this._selectedPreset = name;
    if (!name) return;
    const preset = this._presets.find((p) => p.name === name);
    if (!preset) return;
    this._studioState = { ...preset.state };
    this._emitConfigChanged();
  }

  private _deleteSelectedPreset() {
    if (!this._selectedPreset) return;
    const updated = this._presets.filter((p) => p.name !== this._selectedPreset);
    this._presets = updated;
    this._selectedPreset = '';
    void savePresets(updated, this.hass);
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      position: absolute;
      inset: 0;
      z-index: 10;
      background: var(--card-background-color, var(--ha-card-background, #1c1c1c));
      font-family: var(--primary-font-family, sans-serif);
      color: var(--primary-text-color, #e1e1e1);
      box-sizing: border-box;
      overflow: hidden;
    }

    /* ---- Header ---- */

    .header {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--divider-color, #383838);
    }

    .header h2 { margin: 0; font-size: 16px; font-weight: 500; }
    .header .version {
      font-size: 11px;
      color: var(--secondary-text-color, #9e9e9e);
      margin-left: auto;
    }

    /* ---- Two-column body ---- */

    .panel-body {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 280px;
      overflow: hidden;
      min-height: 0;
    }

    .panel-body.no-preview {
      grid-template-columns: 1fr;
    }

    /* Narrow editors (mobile / slim side panel): stack the preview below the
       controls instead of starving them of width. */
    .panel-body.narrow {
      grid-template-columns: 1fr;
      overflow-y: auto;
    }
    .panel-body.narrow .modules-col {
      overflow: visible;
    }
    .panel-body.narrow .preview-col {
      border-left: none;
      border-top: 1px solid var(--divider-color, #383838);
      overflow: visible;
    }
    .panel-body.narrow .preview-card-wrapper {
      min-height: 160px;
    }

    /* ---- Left column: modules ---- */

    .modules-col {
      overflow-y: auto;
      padding: 10px 14px 16px;
      min-width: 0;
    }

    /* ---- Preset bar ---- */

    .preset-bar {
      display: flex;
      gap: 6px;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--divider-color, #383838);
    }

    .preset-bar select {
      flex: 1;
      min-width: 0;
      padding: 5px 8px;
      font-size: 12px;
      background: var(--card-background-color, #1c1c1c);
      color: var(--primary-text-color, #e1e1e1);
      border: 1px solid var(--divider-color, #383838);
      border-radius: 4px;
    }

    .btn-preset-save {
      padding: 5px 10px;
      font-size: 12px;
      cursor: pointer;
      background: rgba(33, 150, 243, 0.15);
      color: #2196f3;
      border: 1px solid rgba(33, 150, 243, 0.3);
      border-radius: 4px;
      white-space: nowrap;
    }

    .btn-preset-save:hover { background: rgba(33, 150, 243, 0.25); }

    .btn-preset-delete {
      padding: 5px 8px;
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
      background: rgba(255, 0, 0, 0.12);
      color: #ff6b6b;
      border: 1px solid rgba(255, 0, 0, 0.25);
      border-radius: 4px;
    }

    .btn-preset-delete:hover { background: rgba(255, 0, 0, 0.22); }

    /* ---- Banners ---- */

    .warning-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 8px;
      background: rgba(255, 152, 0, 0.15);
      border: 1px solid #ff9800;
      color: #ff9800;
      font-size: 12px;
      margin-bottom: 10px;
    }

    .btn-banner-action {
      padding: 5px 10px;
      font-size: 12px;
      cursor: pointer;
      background: rgba(255, 152, 0, 0.15);
      color: #ff9800;
      border: 1px solid rgba(255, 152, 0, 0.4);
      border-radius: 4px;
      white-space: nowrap;
      margin-left: auto;
    }

    .btn-banner-action:hover { background: rgba(255, 152, 0, 0.28); }

    .info-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      border-radius: 8px;
      background: rgba(33, 150, 243, 0.1);
      border: 1px solid #2196F3;
      color: #2196F3;
      font-size: 12px;
      margin-bottom: 10px;
    }

    .no-config {
      padding: 24px 16px;
      text-align: center;
      color: var(--secondary-text-color, #9e9e9e);
      border: 2px dashed var(--divider-color, #383838);
      border-radius: 8px;
      font-size: 13px;
    }

    .container-banner {
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(156, 39, 176, 0.12);
      border: 1px solid #9c27b0;
      color: #ce93d8;
      font-size: 12px;
      line-height: 1.5;
      margin-bottom: 10px;
    }

    .container-banner strong {
      display: block;
      margin-bottom: 4px;
      color: #e1bee7;
    }

    /* ---- Right column: preview ---- */

    .preview-col {
      border-left: 1px solid var(--divider-color, #383838);
      padding: 10px 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .preview-col-label {
      flex-shrink: 0;
      font-size: 11px;
      color: var(--secondary-text-color, #9e9e9e);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .preview-card-wrapper {
      flex: 1;
      overflow: auto;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      background: var(--lovelace-background, #111111);
      border-radius: 8px;
      padding: 12px;
      min-height: 0;
      /* Prevent clicking live card elements */
      pointer-events: none;
    }

    .preview-card-wrapper hui-card {
      width: 100%;
    }

    .preview-unavailable {
      font-size: 11px;
      color: var(--secondary-text-color, #9e9e9e);
      text-align: center;
      margin: auto;
    }
  `;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  override render() {
    const hasPreview = !!(this.config && this.hass);
    return html`
      <div class="header">
        <span>🎨</span>
        <h2>Card-Mod Studio</h2>
        <span class="version">v${VERSION}</span>
      </div>

      <div class="panel-body ${hasPreview ? '' : 'no-preview'} ${this._narrow ? 'narrow' : ''}">
        <div class="modules-col">
          ${this._renderCompatBanner()}

          ${this._studioState
            ? html`
                ${this._renderPresetBar()}
                ${this._renderModuleList(this._studioState)}
              `
            : html`<div class="no-config">No card selected.</div>`}
        </div>

        ${hasPreview
          ? html`
              <div class="preview-col">
                <span class="preview-col-label">Preview</span>
                <div class="preview-card-wrapper">
                  ${this._renderPreviewContent()}
                </div>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private _renderPreviewContent() {
    if (!this.config || !this.hass) return nothing;
    const hasHuiCard = Boolean(customElements.get('hui-card'));
    if (!hasHuiCard) {
      return html`<p class="preview-unavailable">Preview unavailable — open a card editor first.</p>`;
    }
    const previewConfig = this._previewConfig ?? this.config;
    return keyed(
      this._previewKey,
      html`<hui-card .hass=${this.hass} .config=${previewConfig}></hui-card>`,
    );
  }

  private _renderCompatBanner() {
    // Checked first: if neither engine is installed, that's the root cause —
    // showing the more specific uix-only banner instead would offer a "copy
    // to card_mod" fix that can't actually work (card-mod isn't there to
    // read it either), and hide the fact that nothing renders regardless.
    if (!this._cardModPresent && !this._uixPresent) {
      return html`<div class="warning-banner">
        ⚠️ card-mod/UIX not detected — install one of them first or styles won't apply.
      </div>`;
    }

    const atRisk = this._uixOnlyAtRisk || this._uixOnlyRowsAtRisk;
    if (atRisk) {
      if (this._uixOnlyUsesMacros) {
        return html`<div class="warning-banner">
          ⚠️ This card's styling uses UIX-only macros/billets and UIX isn't detected — it won't apply, and
          card-mod cannot run these features under any key. Reinstall UIX, or restyle this card manually.
        </div>`;
      }
      const what = this._uixOnlyAtRisk && this._uixOnlyRowsAtRisk
        ? "This card's styling, and one or more entity rows,"
        : this._uixOnlyRowsAtRisk
          ? 'One or more entity rows on this card'
          : "This card's styling";
      return html`<div class="warning-banner">
        ⚠️ ${what} is only under uix: and UIX isn't detected — it won't apply.
        <button class="btn-banner-action" @click=${this._copyUixStyleToCardMod}>Copy to card_mod</button>
      </div>`;
    }

    if (this._uixMacrosCoexist) {
      return html`<div class="info-banner">
        ℹ️ This card also has uix: macros/billets — studio edits update card_mod:, but UIX will keep
        rendering your uix: styling unchanged (macros/billets can't be auto-synced).
      </div>`;
    }

    if (this._uixMacrosWillBeOverwritten) {
      return html`<div class="info-banner">
        ℹ️ This card's uix: styling uses macros/billets — editing it here will replace that with
        plain generated CSS (macros/billets can't be regenerated from the visual controls).
      </div>`;
    }

    return nothing;
  }

  private _renderPresetBar() {
    return html`
      <div class="preset-bar">
        <select .value=${this._selectedPreset} @change=${this._onPresetSelect}>
          <option value="">📋 Load preset…</option>
          ${this._presets.map(
            (p) => html`<option value=${p.name} ?selected=${p.name === this._selectedPreset}>${p.name}</option>`,
          )}
        </select>
        ${this._selectedPreset
          ? html`<button class="btn-preset-delete" title="Delete preset" @click=${this._deleteSelectedPreset}>×</button>`
          : nothing}
        <button class="btn-preset-save" @click=${this._saveCurrentAsPreset}>💾 Save</button>
      </div>
    `;
  }

  private _renderModuleList(s: StudioState) {
    if (this._isContainerCard) {
      return this._renderContainerCard(s);
    }

    const stateAware = this._isStateAware;
    const showIconColor = this._showIconColor;
    const showAnimation = this._showAnimation;
    const showBackground = this._showBackground;
    const showBorder = this._showBorder;
    const showHeadingStyle = this._showHeadingStyle;
    const hasUnrecognisedCss = !!s.advanced.rawCss.trim();

    return html`
      ${hasUnrecognisedCss
        ? html`<div class="info-banner">
            ℹ️ Some existing styles weren't recognised — preserved in Advanced CSS.
          </div>`
        : nothing}

      ${showHeadingStyle
        ? html`<cms-heading-style-module
            .state=${s.headingStyle}
            @state-changed=${this._onHeadingStyleChanged}
          ></cms-heading-style-module>`
        : nothing}

      <cms-filter-module
        .state=${s.filter}
        .stateAware=${stateAware}
        @state-changed=${this._onFilterChanged}
      ></cms-filter-module>

      ${!showHeadingStyle && !this._isEntitiesCard
        ? html`<cms-accent-color-module
            .state=${s.accentColor}
            @state-changed=${this._onAccentColorChanged}
          ></cms-accent-color-module>`
        : nothing}

      ${showIconColor
        ? html`<cms-icon-color-module
            .state=${s.iconColor}
            .stateAware=${stateAware}
            .isLightCard=${this._isLightCard}
            @state-changed=${this._onIconColorChanged}
          ></cms-icon-color-module>`
        : nothing}

      ${!this._isEntitiesCard
        ? html`<cms-threshold-module
              .state=${s.threshold}
              .cardEntity=${this.config?.entity ?? ''}
              @state-changed=${this._onThresholdChanged}
            ></cms-threshold-module>`
        : nothing}

      ${showBackground
        ? html`<cms-background-module
            .state=${s.background}
            .stateAware=${stateAware}
            @state-changed=${this._onBackgroundChanged}
          ></cms-background-module>`
        : nothing}

      ${showAnimation
        ? html`<cms-animation-module
            .state=${s.animation}
            .stateAware=${stateAware}
            @state-changed=${this._onAnimationChanged}
          ></cms-animation-module>`
        : nothing}

      ${showBorder
        ? html`<cms-border-module
            .state=${s.border}
            @state-changed=${this._onBorderChanged}
          ></cms-border-module>`
        : nothing}

      <cms-advanced-module
        .state=${s.advanced}
        ?open=${hasUnrecognisedCss}
        @state-changed=${this._onAdvancedChanged}
      ></cms-advanced-module>

      ${this.config?.type === 'entities'
        ? html`<cms-entities-rows-module
              .rows=${(this.config as unknown as { entities?: EntitiesCardRow[] }).entities ?? []}
              .styles=${this._entityRowStyles}
              @styles-changed=${this._onEntityRowStylesChanged}
            ></cms-entities-rows-module>`
        : nothing}
    `;
  }

  private _renderContainerCard(s: StudioState) {
    const cardType = this.config?.type ?? 'layout';
    const hasUnrecognisedCss = !!s.advanced.rawCss.trim();
    return html`
      <div class="container-banner">
        <strong>🗂️ Layout card — style the child cards</strong>
        "${cardType}" is a container. Card-mod styles applied here have no
        visual effect. Open each child card individually and click the Style
        button there.
      </div>

      ${hasUnrecognisedCss
        ? html`<div class="info-banner">
            ℹ️ Some existing styles weren't recognised — preserved in Advanced CSS.
          </div>`
        : nothing}

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

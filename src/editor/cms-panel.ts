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
  FontModuleState,
  EntitiesCardRow,
  EntitiesRowStyles,
} from '../types/index.js';
import { isCardModInstalled, isUixInstalled } from '../utils/dom-helpers.js';
import {
  isUixOnlyStyle,
  usesUixOnlyFeatures,
  usesUixMacroBlockFeatures,
  hasUixOnlyRow,
  hasUixOnlySelectorRow,
  hasStyleContent,
  hasDictFormStyle,
  hasUnsupportedDictRoot,
} from '../utils/style-compat.js';
import {
  CONTAINER_CARD_TYPES,
  STYLABLE_CHILDREN_CARD_TYPES,
  NO_ANIMATION_TYPES,
  NO_BACKGROUND_TYPES,
  NO_BORDER_TYPES,
  NO_ICON_COLOR_TYPES,
  NO_FONT_TYPES,
  ICON_SIZE_TYPES,
  isStateAware,
} from '../utils/card-caps.js';
import { buildMergedStudioState, initEntityRowStyles, applyEntityRowStyles } from './studio-state.js';
import './cms-child-card-section.js';
import './cms-preview-picker.js';
import type { PickEventDetail } from './cms-preview-picker.js';
import { loadPresets, savePresets } from '../utils/preset-storage.js';
import type { StylePreset } from '../utils/preset-storage.js';
import { filterPresetStateForCardType } from '../utils/preset-caps.js';
import { ConfigEchoGuard } from '../utils/config-echo.js';
import { initPaletteCache } from '../utils/palette-storage.js';
import { findAdvancedCssConflicts } from '../utils/style-conflicts.js';
import './cms-palette-manager.js';
import { generateCss, thresholdOwnedProperties } from '../generator/css-generator.js';
import { applyCardModStyle, pickOutputKey } from '../generator/yaml-generator.js';
import { cmsTokens } from '../modules/module-base.js';

import '../modules/module-filter.js';
import '../modules/module-icon-color.js';
import '../modules/module-accent-color.js';
import '../modules/module-background.js';
import '../modules/module-animation.js';
import '../modules/module-border.js';
import '../modules/module-threshold.js';
import '../modules/module-advanced.js';
import '../modules/module-heading-style.js';
import '../modules/module-font.js';
import '../modules/module-entities-rows.js';

declare const __APP_VERSION__: string;
const VERSION = __APP_VERSION__;

// Per-card-type capability tables live in ../utils/card-caps.ts, shared with
// cms-child-card-section so a stack child gets the exact same module gating
// as a top-level card of that type.

/** The parts of HA's hui-card-element-editor (this panel's shadow host) the
 *  panel reads — public getters on HA's HuiElementEditor. */
interface HaElementEditor extends HTMLElement {
  GUImode?: boolean;
  hasWarning?: boolean;
  hasError?: boolean;
  _guiSupported?: boolean;
}

/** HA's dark-mode flag — `hass.themes.darkMode` (typed loosely upstream). */
function isDarkTheme(hass: HomeAssistant | undefined): boolean {
  const themes = hass?.themes as { darkMode?: boolean } | undefined;
  return themes?.darkMode === true;
}

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

  /** Own-echo guard: skips state rebuilds for configs we ourselves just
   *  emitted, while advancing its baseline on every genuine external
   *  rebuild (see ConfigEchoGuard for the revert-to-A regression). */
  private _echoGuard = new ConfigEchoGuard();
  private _resizeObserver?: ResizeObserver;

  override connectedCallback() {
    super.connectedCallback();
    this._cardModPresent = isCardModInstalled();
    this._uixPresent = isUixInstalled();
    // Load from localStorage immediately (sync); HA sync happens when hass arrives
    void loadPresets(undefined).then((p) => { this._presets = p; });
    void initPaletteCache(this.hass);
    // Width-responsive: the side preview is a fixed 280px, so the controls
    // column only stays comfortable (>= ~420px: dense rule rows, colour
    // grids) when the panel is at least ~720px wide. Below that, stack the
    // preview under the controls instead (600px left 600-720px panels —
    // small windows, tablet split view — with clipped rule rows).
    this._resizeObserver = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) this._narrow = w < 720;
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
    if (changed.has('hass')) {
      // HA's own dark-mode flag (not prefers-color-scheme — a user can run a
      // dark HA theme on a light OS). HA sets no color-scheme on the page,
      // so without this, browser-drawn parts of the panel (scrollbars,
      // native dropdown lists, number spinners) stayed light in dark mode.
      this.toggleAttribute('dark', isDarkTheme(this.hass));
    }
    if (changed.has('config') || changed.has('hass')) {
      this._initState();
      this._previewConfig = undefined;
    }
    // When hass first becomes available, reload presets from HA (cross-device sync)
    // and re-evaluate UIX presence with the backend component list — the
    // registry-only probe in connectedCallback has a transient false-negative
    // window right after page load (see isUixInstalled).
    if (changed.has('hass') && this.hass && !changed.get('hass')) {
      void loadPresets(this.hass).then((p) => { this._presets = p; });
      void initPaletteCache(this.hass);
      this._uixPresent = isUixInstalled(this.hass);
    }
  }

  private _initState() {
    if (!this.config) {
      this._studioState = null;
      this._entityRowStyles = {};
      this._echoGuard.reset();
      return;
    }
    if (!this._echoGuard.shouldRebuild(JSON.stringify(this.config))) return;

    this._studioState = this._buildMergedState(this.config);
    this._initEntityRowStyles();
  }

  /** See buildMergedStudioState in studio-state.ts — extracted so
   *  cms-child-card-section runs the identical merge for stack children. */
  private _buildMergedState(config: CardModCardConfig): StudioState {
    return buildMergedStudioState(config, this.hass);
  }

  private _initEntityRowStyles() {
    this._entityRowStyles = this.config ? initEntityRowStyles(this.config, this.hass) : {};
  }

  /** See applyEntityRowStyles in studio-state.ts — extracted so
   *  cms-child-card-section runs the identical pipeline for an entities
   *  card nested inside a stack. */
  private _applyEntityRowStyles(config: CardModCardConfig): CardModCardConfig {
    return applyEntityRowStyles(config, this._entityRowStyles, this.hass);
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
    // Rows count too: a row's uix dict with `$$`/`&` keys can't run under
    // card_mod either, so no "Copy to card_mod" offer (audit v0.10 #18).
    return !!this.config && (usesUixOnlyFeatures(this.config) || hasUixOnlySelectorRow(this.config));
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
    // Macro/billet-only (usesUixMacroBlockFeatures, not the selector-aware
    // check): a dict-form uix style with $$/& keys is preserved or frozen
    // outright (mixed-form gate), so this "can't be auto-synced" note
    // doesn't describe it.
    return !!this.config && this._cardModPresent && usesUixMacroBlockFeatures(this.config.uix);
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
    // Macro/billet-only for the same reason as _uixMacrosCoexist: a uix-keyed
    // save on a dict-form style rebuilds it around `.` with every pierced
    // ($$/&) entry byte-identical — nothing is overwritten there.
    return !!this.config && this._uixPresent && !this._cardModPresent && usesUixMacroBlockFeatures(this.config.uix);
  }

  /**
   * Copies uix.style (card level and/or per at-risk row) verbatim into
   * card_mod.style, leaving uix.style completely untouched.
   *
   * Deliberately does NOT go through _emitConfigChanged() -> applyCardModStyle():
   * that path clears the *other* key once it's confident which engine is
   * active, which is right for a genuine settings edit but wrong here — this
   * button exists precisely because neither engine could be confirmed
   * installed (_uixOnlyAtRisk / _uixOnlyRowsAtRisk only fire when UIX isn't
   * detected), so clearing uix.style on a guess would destroy the original
   * hand-authored styling if that guess is wrong (UIX actually is installed
   * some other way, or gets installed later). A verbatim copy is also more
   * faithful than re-deriving through parse -> state -> generate, which is
   * lossy for anything the recognisers don't perfectly round-trip (and for
   * dict-form uix.style, which mapToStudioState can't represent losslessly
   * at all).
   */
  private _copyUixStyleToCardMod() {
    if (!this.config) return;
    let next: CardModCardConfig = { ...this.config };

    // Spread the existing card_mod: its class:/debug: siblings must survive
    // the copy (audit v0.10 #13).
    if (hasStyleContent(this.config.uix?.style) && !hasStyleContent(this.config.card_mod?.style)) {
      next = { ...next, card_mod: { ...this.config.card_mod, style: this.config.uix!.style! } };
    }

    if (this.config.type === 'entities') {
      const rows = (this.config as unknown as { entities?: EntitiesCardRow[] }).entities;
      if (rows?.length) {
        const updatedRows = rows.map((row) =>
          row && typeof row === 'object' && hasStyleContent(row.uix?.style) && !hasStyleContent(row.card_mod?.style)
            ? { ...row, card_mod: { ...row.card_mod, style: row.uix!.style! } }
            : row,
        );
        next = { ...(next as unknown as object), entities: updatedRows } as unknown as CardModCardConfig;
      }
    }

    this._emitConfig(next);
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

  /** A dict-form style the Studio can't rewrite faithfully (mixed-form, or
   *  a `.` that isn't plain CSS) — the card-level modules are replaced by
   *  the lock banner (see _renderModuleList). */
  private get _isLocked(): boolean {
    return hasDictFormStyle(this.config ?? {}) && !this._studioState?.dictSource;
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

  private get _showFont(): boolean {
    return !NO_FONT_TYPES.has(this.config?.type ?? '');
  }

  private get _isLightCard(): boolean {
    return this.config?.type === 'light';
  }

  private get _isStateAware(): boolean {
    return isStateAware(this.config?.type, this.config?.entity as string | undefined, this.hass);
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

  private _onFontChanged(e: CustomEvent<FontModuleState>) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, font: e.detail };
    this._emitConfigChanged();
  }

  private _onThresholdChanged(e: CustomEvent<ThresholdModuleState>) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, threshold: e.detail };
    this._emitConfigChanged();
  }

  /**
   * Hands a new card config to HA (the dialog listens for config-changed on
   * hui-card-element-editor, whose shadow root hosts this panel).
   *
   * The dialog copies `guiModeAvailable` from every config-changed it gets
   * and disables "Show code editor" when it's missing. HA's own editor
   * re-fires the right value only when the config actually changed, so a
   * Studio edit that leaves it identical (a module switched on at defaults
   * that emit nothing) left the button greyed out. Send the value HA's
   * editor would compute itself.
   *
   * If HA's editor is in YAML mode ("Show code editor"), its ha-yaml-editor
   * only reads its value when first rendered, so it would keep showing the
   * pre-edit YAML — and typing in it afterwards would re-emit that stale text
   * and silently undo the Studio edit. setValue() refreshes the text without
   * firing value-changed (the same call HA itself uses to load it).
   */
  private _emitConfig(next: CardModCardConfig) {
    this._previewConfig = next;
    this._previewKey++;
    this._echoGuard.noteEmitted(JSON.stringify(next));
    const root = this.getRootNode?.() as (ShadowRoot & { host?: HaElementEditor }) | undefined;
    const editor = root?.host;
    const guiModeAvailable = editor && 'hasWarning' in editor
      ? !(editor.hasWarning || editor.hasError || editor._guiSupported === false)
      : true;
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        bubbles: true,
        composed: true,
        detail: { config: next, guiModeAvailable },
      }),
    );
    if (editor?.GUImode === false) {
      const yamlEditor = root?.querySelector('ha-yaml-editor') as (HTMLElement & { setValue?: (v: unknown) => void }) | null;
      yamlEditor?.setValue?.(next);
    }
  }

  private _emitConfigChanged() {
    if (!this.config || !this._studioState) return;
    const css = generateCss(this._studioState, this.config?.type, {
      gaugeNeedle: (this.config as { needle?: boolean }).needle === true,
    });
    let newConfig = applyCardModStyle(css, this.config, pickOutputKey(this.hass), this._studioState.dictSource);
    if (this.config.type === 'entities') {
      newConfig = this._applyEntityRowStyles(newConfig);
    }
    this._emitConfig(newConfig);
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
    // A dict card's carrier (its pierced entries) belongs to THAT card — a
    // preset must never carry it (audit v0.10 #8).
    const { dictSource: _cardDict, ...presetState } = this._studioState;
    const updated = [
      ...this._presets.filter((p) => p.name !== trimmed),
      { name: trimmed, state: presetState },
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
    // Keep THIS card's preserved Advanced CSS unless the preset itself
    // carries some — the parser went to lengths to preserve unrecognised
    // hand-authored CSS, and a preset from a different card shouldn't be
    // the thing that wipes it.
    const currentAdvanced = this._studioState?.advanced;
    const presetHasAdvanced = !!preset.state.advanced?.rawCss?.trim();
    // The dict carrier always comes from THIS card: a stored preset has
    // none (the save then froze and the panel flipped to "Mixed-form"), and
    // an in-session one could carry stale/foreign pierced entries (audit
    // v0.10 #8).
    const currentDictSource = this._studioState?.dictSource;
    const { dictSource: _presetDict, ...presetState } = preset.state;
    // Reset any module THIS card type's panel hides back to its disabled
    // default — a preset saved on a different card type must not smuggle in
    // styling (e.g. tile animation onto a heading card) that the hidden
    // module offers no control to ever disable. See preset-caps.ts.
    this._studioState = {
      ...filterPresetStateForCardType(
        {
          ...presetState,
          ...(presetHasAdvanced || !currentAdvanced ? {} : { advanced: currentAdvanced }),
        },
        this.config?.type,
      ),
      ...(currentDictSource ? { dictSource: currentDictSource } : {}),
    };
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

  static override styles = [cmsTokens, css`
    :host {
      display: flex;
      flex-direction: column;
      position: absolute;
      inset: 0;
      z-index: 10;
      background: var(--card-background-color, var(--ha-card-background, #fff));
      font-family: var(--primary-font-family, sans-serif);
      color: var(--primary-text-color, #212121);
      box-sizing: border-box;
      overflow: hidden;
    }

    :host([dark]) {
      color-scheme: dark;
    }

    /* ---- Header ---- */

    .header {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    }

    .header h2 { margin: 0; font-size: 16px; font-weight: 500; }
    .header .version {
      font-size: 11px;
      color: var(--secondary-text-color, #727272);
      margin-left: auto;
    }

    /* ---- Two-column body ---- */

    /* minmax(0, …): a plain 1fr track can't shrink below its widest
       child's min-content — a card preview with a fixed minimum width (the
       thermostat dial, ~385px) stretched the whole column past a 360px
       phone screen and clipped every module. The preview scrolls inside
       its own box instead. */
    .panel-body {
      flex: 1;
      display: grid;
      /* Preview wide enough to show a card at roughly dashboard width
         (280px truncated entity names) without starving the controls. */
      grid-template-columns: minmax(0, 1fr) clamp(300px, 38%, 420px);
      overflow: hidden;
      min-height: 0;
    }

    .panel-body.no-preview {
      grid-template-columns: minmax(0, 1fr);
    }

    /* Narrow editors (mobile / slim side panel): stack the preview below the
       controls instead of starving them of width. */
    .panel-body.narrow {
      grid-template-columns: minmax(0, 1fr);
      overflow-y: auto;
      overflow-x: hidden;
    }
    /* Scrolling past the end of the panel must not chain into HA's dialog
       behind it (on phones that slid our header under the dialog title).
       Scrollbars use HA's own scrollbar colour, like HA's panels. */
    .panel-body.narrow,
    .modules-col,
    .preview-card-wrapper {
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: var(--scrollbar-thumb-color, rgba(128, 128, 128, 0.5)) transparent;
    }
    .panel-body.narrow .modules-col {
      overflow: visible;
    }
    .panel-body.narrow .preview-col {
      border-left: none;
      border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      overflow: visible;
    }
    .panel-body.narrow .preview-card-wrapper {
      min-height: 72px;
    }

    /* ---- Left column: modules ---- */

    .modules-col {
      overflow-y: auto;
      padding: 10px 14px 16px;
      min-width: 0;
    }
    .panel-body.narrow .modules-col {
      padding: 10px 10px 16px;
    }

    /* ---- Preset bar ---- */

    .preset-bar {
      display: flex;
      gap: 6px;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    }

    .preset-bar select {
      flex: 1;
      min-width: 0;
      box-sizing: border-box;
      min-height: 32px;
      padding: 5px 8px;
      font: inherit;
      font-size: 12px;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color, #212121);
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      border-radius: 4px;
      cursor: pointer;
    }

    .btn-preset-save,
    .btn-preset-delete,
    .btn-banner-action {
      box-sizing: border-box;
      min-height: 32px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 4px;
      white-space: nowrap;
    }

    .btn-preset-save {
      padding: 5px 12px;
      background: var(--cms-tint-primary);
      color: var(--cms-ink-primary);
      border: 1px solid var(--cms-line-primary);
    }

    .btn-preset-save:hover { background: var(--cms-tint-primary-hover); }

    .btn-preset-delete {
      min-width: 32px;
      padding: 5px 8px;
      font-size: 15px;
      line-height: 1;
      background: var(--cms-tint-error);
      color: var(--cms-ink-error);
      border: 1px solid var(--cms-line-error);
    }

    .btn-preset-delete:hover { background: var(--cms-tint-error-hover); }

    :is(.btn-preset-save, .btn-preset-delete, .btn-banner-action, .preset-bar select):focus-visible {
      outline: 2px solid var(--primary-color, #03a9f4);
      outline-offset: 2px;
    }

    /* ---- Banners ----
       Semantic colour carries the border + tint; the text itself uses the
       theme's own text colour so it's readable in light AND dark mode (the
       old same-hue text measured under 2:1 on a light theme). */

    .warning-banner,
    .info-banner,
    .container-banner {
      font-size: 12px;
      line-height: 1.5;
      border-radius: 8px;
      margin-bottom: 10px;
      color: var(--primary-text-color, #212121);
    }

    .warning-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--cms-tint-warning);
      border: 1px solid var(--warning-color, #ffa600);
    }

    .btn-banner-action {
      padding: 5px 12px;
      margin-left: auto;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color, #212121);
      border: 1px solid var(--warning-color, #ffa600);
    }

    .btn-banner-action:hover { background: var(--cms-tint-warning); }

    .info-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--cms-tint-primary);
      border: 1px solid var(--cms-line-primary);
    }

    .no-config {
      padding: 24px 16px;
      text-align: center;
      color: var(--secondary-text-color, #727272);
      border: 2px dashed var(--divider-color, rgba(0, 0, 0, 0.12));
      border-radius: 8px;
      font-size: 13px;
    }

    .container-banner {
      padding: 10px 14px;
      background: color-mix(in srgb, #9c27b0 9%, transparent);
      border: 1px solid color-mix(in srgb, #9c27b0 55%, transparent);
      border-left: 4px solid #9c27b0;
    }

    .container-banner strong {
      display: block;
      margin-bottom: 4px;
      font-weight: 600;
    }

    /* ---- Right column: preview ---- */

    .preview-col {
      min-width: 0;
      border-left: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      padding: 10px 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .preview-col-label {
      flex-shrink: 0;
      font-size: 11px;
      color: var(--secondary-text-color, #727272);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    /* The preview sits on the dashboard background the card will really
       live on: the theme's --lovelace-background when it sets one, else
       --primary-background-color (what HA's own card-editor preview uses) —
       never a fixed dark slab, which looked broken on light themes and
       misjudged translucent card designs. */
    /* Sized to the card (a short card used to sit at the top of a
       full-height empty box); a tall card scrolls inside it. */
    .preview-card-wrapper {
      flex: 0 1 auto;
      overflow: auto;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      background: var(--lovelace-background, var(--primary-background-color, #fafafa));
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      border-radius: 8px;
      padding: 12px;
      min-height: 0;
      /* Prevent clicking live card elements — the cms-preview-picker overlay
         (positioned against this wrapper) owns all pointer events instead. */
      pointer-events: none;
      position: relative;
    }

    .preview-hint {
      flex-shrink: 0;
      font-size: 11px;
      color: var(--secondary-text-color, #727272);
      line-height: 1.4;
    }

    .preview-stage {
      position: relative;
      flex-shrink: 0;
    }

    .preview-card-wrapper hui-card {
      width: 100%;
    }

    .preview-unavailable {
      font-size: 11px;
      color: var(--secondary-text-color, #727272);
      text-align: center;
      margin: auto;
    }
  `];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  override render() {
    const hasPreview = !!(this.config && this.hass);
    return html`
      <div class="header">
        <span aria-hidden="true">🎨</span>
        <h2>Card-Mod Studio</h2>
        <span class="version">v${VERSION}</span>
      </div>

      <div class="panel-body ${hasPreview ? '' : 'no-preview'} ${this._narrow ? 'narrow' : ''}">
        <div class="modules-col">
          ${this._renderCompatBanner()}

          ${this._studioState
            ? html`
                ${this._isLocked ? nothing : this._renderPresetBar()}
                <cms-palette-manager .hass=${this.hass}></cms-palette-manager>
                ${this._renderModuleList(this._studioState)}
              `
            : html`<div class="no-config">No card selected.</div>`}
        </div>

        ${hasPreview
          ? html`
              <div class="preview-col">
                <span class="preview-col-label">Preview</span>
                ${this._pickerActive
                  ? html`<span class="preview-hint">Click any part of the preview to jump to its control</span>`
                  : nothing}
                <div class="preview-card-wrapper">
                  ${this._renderPreviewContent()}
                </div>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  /** True when the click-to-edit picker overlays the preview. Container
   *  cards are skipped: their children/sections make per-element mapping
   *  ambiguous (which child's module would a click mean?). */
  private get _pickerActive(): boolean {
    return (
      !!this.config &&
      !!this.hass &&
      !this._isContainerCard &&
      // Locked card: no card-level modules to jump to (entities rows still are).
      !(this._isLocked && !this._isEntitiesCard) &&
      Boolean(customElements.get('hui-card'))
    );
  }

  private _renderPreviewContent() {
    if (!this.config || !this.hass) return nothing;
    const hasHuiCard = Boolean(customElements.get('hui-card'));
    if (!hasHuiCard) {
      return html`<p class="preview-unavailable">Preview unavailable — open a card editor first.</p>`;
    }
    const previewConfig = this._previewConfig ?? this.config;
    // The picker re-queries its parent for `hui-card` on every hit-test, so
    // keyed() swapping the card element out from under it is harmless.
    // The stage (not the scrolling wrapper) is the picker's positioning
    // box, so its inset:0 overlay spans the card's FULL height — against the
    // scroll container it only covered the first screenful of a tall
    // preview (lower entity rows weren't pickable).
    return html`
      <div class="preview-stage">
        ${keyed(
          this._previewKey,
          html`<hui-card .hass=${this.hass} .config=${previewConfig}></hui-card>`,
        )}
        ${this._pickerActive
          ? html`<cms-preview-picker
              .cardType=${this.config.type ?? ''}
              .rows=${this._rowEntityIds()}
              @cms-pick=${this._onPreviewPick}
            ></cms-preview-picker>`
          : nothing}
      </div>
    `;
  }

  /** Entities cards: entity_id per row in config order (undefined for rows
   *  without one, keeping indices aligned with the DOM row order). */
  private _rowEntityIds(): Array<string | undefined> {
    if (this.config?.type !== 'entities') return [];
    const rows = (this.config as unknown as { entities?: Array<EntitiesCardRow | string> }).entities ?? [];
    return rows.map((r) => (typeof r === 'string' ? r : r?.entity));
  }

  /** Click-to-edit: scroll to the picked module, open it, flash it. */
  private _onPreviewPick(e: CustomEvent<PickEventDetail>) {
    const { module, rowEntity, rowIndex } = e.detail;
    const el = this.shadowRoot?.querySelector(module) as
      | (HTMLElement & { _open?: boolean; open?: boolean; _openRows?: Set<string> })
      | null;
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Open it: most modules collapse via a private `_open` @state (assigning
    // from outside still triggers a reactive update); cms-advanced-module
    // uses a public `open`; cms-entities-rows-module is always open but keeps
    // per-row sections in `_openRows`, keyed by row INDEX (positional, like
    // the row-style map — duplicate entity_ids are valid, so the index is
    // the only unambiguous row identity). The rowEntity fallback (older
    // pick details without an index) opens the FIRST matching row.
    if (module === 'cms-advanced-module') {
      el.open = true;
    } else if (module === 'cms-entities-rows-module') {
      const index = typeof rowIndex === 'number' && rowIndex >= 0
        ? rowIndex
        : rowEntity
          ? this._rowEntityIds().indexOf(rowEntity)
          : -1;
      if (index >= 0 && el._openRows) {
        el._openRows = new Set([...el._openRows, String(index)]);
      }
    } else {
      el._open = true;
    }

    // Brief flash so the eye lands on the right module.
    el.style.transition = 'box-shadow 0.3s ease';
    el.style.borderRadius = '8px';
    el.style.boxShadow = '0 0 0 2px var(--accent-color, #2196f3)';
    window.setTimeout(() => {
      el.style.boxShadow = '';
      window.setTimeout(() => {
        el.style.transition = '';
        el.style.borderRadius = '';
      }, 350);
    }, 1200);
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
          ⚠️ This card's styling uses UIX-only features (macros/billets, or $$/&amp; selectors) and UIX
          isn't detected — it won't apply, and card-mod cannot run these features under any key.
          Reinstall UIX, or restyle this card manually.
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
        <button class="btn-preset-save" title="Save the current styling as a preset" @click=${this._saveCurrentAsPreset}>💾 Save preset</button>
      </div>
    `;
  }

  private _renderModuleList(s: StudioState) {
    if (this._isContainerCard) {
      return this._renderContainerCard(s);
    }

    // Dictionary-form styles are editable (v0.10): the `.` entry runs
    // through the normal module pipeline and every pierced entry is
    // preserved byte-identically (dictSource carrier). A dict style with
    // NO carrier can't be rewritten faithfully — mixed-form (a dict plus a
    // different style on the other key) or a dict whose `.` isn't plain
    // CSS — so the save path preserves it verbatim and the card-level
    // modules would be dead controls: show the lock banner instead. Rows
    // stay editable on entities cards (separate row configs, own guard).
    if (this._isLocked) {
      return html`
        <div class="container-banner">
          ${hasUnsupportedDictRoot(this.config?.card_mod?.style) || hasUnsupportedDictRoot(this.config?.uix?.style)
            ? html`<strong>🔒 Dictionary-form styling — preserved as-is</strong>
                This card's dictionary-form (<code>$</code> shadow-piercing)
                style has a <code>.</code> entry that isn't plain CSS, so the
                Studio can't rebuild it faithfully. Nothing here will
                overwrite it — your styling is preserved exactly as written.
                Make <code>.</code> a plain CSS string in YAML to edit it
                visually.`
            : html`<strong>🔒 Mixed-form styling — preserved as-is</strong>
                This card carries a hand-written dictionary-form
                (<code>$</code> shadow-piercing) style alongside a different
                style on the other engine key. The Studio can't rewrite that
                combination faithfully, so nothing here will overwrite it —
                your styling is preserved exactly as written. Consolidate to
                one key in YAML to edit it visually.`}
          ${this._isEntitiesCard
            ? html`Per-row styling below still works as usual.`
            : nothing}
        </div>
        ${this._renderEntityRowsModule()}
      `;
    }

    const stateAware = this._isStateAware;
    const showIconColor = this._showIconColor;
    const showAnimation = this._showAnimation;
    const showBackground = this._showBackground;
    const showBorder = this._showBorder;
    const showHeadingStyle = this._showHeadingStyle;
    const showFont = this._showFont;
    const hasUnrecognisedCss = !!s.advanced.rawCss.trim();
    // "Custom CSS is overriding this control" warnings (style-conflicts.ts)
    const conflicts = findAdvancedCssConflicts(s.advanced.rawCss, s);
    const thresholdOwned = thresholdOwnedProperties(s.threshold);

    return html`
      ${hasUnrecognisedCss
        ? html`<div class="info-banner">
            ℹ️ Some existing styles weren't recognised — preserved in Advanced CSS.
          </div>`
        : nothing}

      ${showHeadingStyle
        ? html`<cms-heading-style-module
            .overridden=${!!conflicts.headingStyle}
            .overriddenDetail=${(conflicts.headingStyle ?? []).join(", ")}
            .state=${s.headingStyle}
            @state-changed=${this._onHeadingStyleChanged}
          ></cms-heading-style-module>`
        : nothing}

      ${showFont
        ? html`<cms-font-module
            .overridden=${!!conflicts.font}
            .overriddenDetail=${(conflicts.font ?? []).join(", ")}
            .state=${s.font}
            @state-changed=${this._onFontChanged}
          ></cms-font-module>`
        : nothing}

      <cms-filter-module
        .overridden=${!!conflicts.filter}
        .overriddenDetail=${(conflicts.filter ?? []).join(", ")}
        .state=${s.filter}
        .stateAware=${stateAware}
        .hass=${this.hass}
        @state-changed=${this._onFilterChanged}
      ></cms-filter-module>

      ${!showHeadingStyle && !this._isEntitiesCard
        ? html`<cms-accent-color-module
            .overridden=${!!conflicts.accentColor}
            .overriddenDetail=${(conflicts.accentColor ?? []).join(", ")}
            .thresholdOwned=${thresholdOwned.has('accent-color')}
            .state=${s.accentColor}
            .stateAware=${stateAware}
            .cardEntity=${this.config?.entity ?? ''}
            .cardType=${this.config?.type ?? ''}
            .hass=${this.hass}
            @state-changed=${this._onAccentColorChanged}
          ></cms-accent-color-module>`
        : nothing}

      ${showIconColor
        ? html`<cms-icon-color-module
            .overridden=${!!conflicts.iconColor}
            .overriddenDetail=${(conflicts.iconColor ?? []).join(", ")}
            .thresholdOwned=${thresholdOwned.has('icon-color')}
            .state=${s.iconColor}
            .stateAware=${stateAware}
            .isLightCard=${this._isLightCard}
            .allowSize=${ICON_SIZE_TYPES.has(this.config?.type ?? '')}
            .cardEntity=${this.config?.entity ?? ''}
            .hass=${this.hass}
            @state-changed=${this._onIconColorChanged}
          ></cms-icon-color-module>`
        : nothing}

      ${!this._isEntitiesCard
        ? html`<cms-threshold-module
              .overridden=${!!conflicts.threshold}
              .overriddenDetail=${(conflicts.threshold ?? []).join(", ")}
              .state=${s.threshold}
              .cardEntity=${this.config?.entity ?? ''}
              .cardType=${this.config?.type ?? ''}
              .hass=${this.hass}
              @state-changed=${this._onThresholdChanged}
            ></cms-threshold-module>`
        : nothing}

      ${showBackground
        ? html`<cms-background-module
            .overridden=${!!conflicts.background}
            .overriddenDetail=${(conflicts.background ?? []).join(", ")}
            .thresholdOwned=${thresholdOwned.has('background')}
            .state=${s.background}
            .stateAware=${stateAware}
            .hass=${this.hass}
            @state-changed=${this._onBackgroundChanged}
          ></cms-background-module>`
        : nothing}

      ${showAnimation
        ? html`<cms-animation-module
            .overridden=${!!conflicts.animation}
            .overriddenDetail=${(conflicts.animation ?? []).join(", ")}
            .state=${s.animation}
            .stateAware=${stateAware}
            .hass=${this.hass}
            @state-changed=${this._onAnimationChanged}
          ></cms-animation-module>`
        : nothing}

      ${showBorder
        ? html`<cms-border-module
            .overridden=${!!conflicts.border}
            .overriddenDetail=${(conflicts.border ?? []).join(", ")}
            .thresholdOwned=${thresholdOwned.has('border-color')}
            .state=${s.border}
            .stateAware=${stateAware}
            .hass=${this.hass}
            @state-changed=${this._onBorderChanged}
          ></cms-border-module>`
        : nothing}

      <cms-advanced-module
        .state=${s.advanced}
        .pierced=${s.dictSource?.entries ?? []}
        ?open=${hasUnrecognisedCss || (s.dictSource?.entries.length ?? 0) > 0}
        @state-changed=${this._onAdvancedChanged}
      ></cms-advanced-module>

      ${this._renderEntityRowsModule()}
    `;
  }

  private _renderEntityRowsModule() {
    return this.config?.type === 'entities'
      ? html`<cms-entities-rows-module
            .hass=${this.hass}
            .rows=${(this.config as unknown as { entities?: EntitiesCardRow[] }).entities ?? []}
            .styles=${this._entityRowStyles}
            @styles-changed=${this._onEntityRowStylesChanged}
          ></cms-entities-rows-module>`
      : nothing;
  }

  private _onChildConfigChanged(e: CustomEvent<{ index: number; config: CardModCardConfig }>) {
    e.stopPropagation();
    if (!this.config) return;
    const cards = (this.config as unknown as { cards?: CardModCardConfig[] }).cards;
    if (!Array.isArray(cards) || !cards[e.detail.index]) return;
    const updatedCards = cards.map((c, i) => (i === e.detail.index ? e.detail.config : c));
    const newConfig = { ...(this.config as unknown as object), cards: updatedCards } as unknown as CardModCardConfig;

    this._emitConfig(newConfig);
  }

  private _renderContainerCard(s: StudioState) {
    const cardType = this.config?.type ?? 'layout';
    const hasUnrecognisedCss = !!s.advanced.rawCss.trim();
    const childCards = STYLABLE_CHILDREN_CARD_TYPES.has(cardType)
      ? ((this.config as unknown as { cards?: CardModCardConfig[] }).cards ?? [])
      : null;

    return html`
      ${childCards
        ? html`
            <div class="container-banner">
              <strong>🗂️ Layout card — style each child card below</strong>
              "${cardType}" is a container: styles at this level have no
              visual effect, so every card inside it gets its own styling
              section here. Changes are saved into that child's own
              configuration — exactly what you'd get styling it as a
              standalone card.
            </div>
            ${childCards.map(
              (child, i) => html`<cms-child-card-section
                .childConfig=${child}
                .index=${i}
                .hass=${this.hass}
                @child-config-changed=${this._onChildConfigChanged}
              ></cms-child-card-section>`,
            )}
          `
        : html`
            <div class="container-banner">
              <strong>🗂️ Layout card — child styling isn't supported here yet</strong>
              "${cardType}" is a container: card-mod styles applied at this
              level have no visual effect, and this container type doesn't
              carry an editable <code>cards:</code> list the Studio can offer
              per-child sections for yet. To style a card inside it today,
              add the child's <code>card_mod:</code> in YAML by hand.
            </div>
          `}

      ${hasUnrecognisedCss
        ? html`<div class="info-banner">
            ℹ️ Some existing styles weren't recognised — preserved in Advanced CSS.
          </div>`
        : nothing}

      <cms-advanced-module
        .state=${s.advanced}
        .pierced=${s.dictSource?.entries ?? []}
        ?open=${hasUnrecognisedCss || (s.dictSource?.entries.length ?? 0) > 0}
        @state-changed=${this._onAdvancedChanged}
      ></cms-advanced-module>
    `;
  }
}

customElements.define('cms-panel', CmsPanel);

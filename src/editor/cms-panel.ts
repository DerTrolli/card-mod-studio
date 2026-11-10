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
import { keepEnterInStudio } from '../utils/enter-guard.js';
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
  capsFor,
  panelStateAware,
} from '../utils/card-caps.js';
import { profileKeyOf, isUnprofiledCustomCard, UNPROFILED_CARD_NOTICE } from '../utils/custom-card-profiles.js';
import { buildMergedStudioState, initEntityRowStyles, applyEntityRowStyles, refreshPaletteDefaults, applyStudioState, refreshCarrier } from './studio-state.js';
import { withCardNumberSize, userEntries, numberSizeKind } from '../utils/owned-entries.js';
import './cms-child-card-section.js';
import './cms-preview-picker.js';
import type { PickEventDetail } from './cms-preview-picker.js';
import { loadPresets, updatePresets, applyPresetChange, type PresetChange } from '../utils/preset-storage.js';
import type { StylePreset } from '../utils/preset-storage.js';
import { ArmGuard } from '../utils/arm-guard.js';
import { filterPresetStateForCardType, presetFont } from '../utils/preset-caps.js';
import { ConfigEchoGuard } from '../utils/config-echo.js';
import { initPaletteCache, PALETTE_CHANGED_EVENT } from '../utils/palette-storage.js';
import { findAdvancedCssConflicts } from '../utils/style-conflicts.js';
import './cms-palette-manager.js';
import { thresholdOwnedProperties, settleEntityless } from '../generator/css-generator.js';
import { cmsTokens } from '../modules/module-base.js';
import { hasTopLevelJinjaStatement, templateStatementNote, anyModuleOn } from '../utils/css-lint.js';
import { uixStyleUsesMacro } from '../utils/uix-macro-use.js';

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
/** Longest preset name the bar accepts. */
const PRESET_NAME_MAX = 60;

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
  /** Inline "name this preset" field is showing (replaces window.prompt —
   *  unstyled, outside HA's UI, and not reliably available in the HA
   *  Companion app's web views). */
  @state() private _namingPreset = false;
  @state() private _presetName = '';
  /** Save was attempted with no name — keeps the "type a name" hint up. */
  @state() private _presetNameTried = false;
  /** First click on the delete (x) control arms it; the second deletes. */
  @state() private _deleteArmed = false;
  /** The last preset change could not reach Home Assistant (read or write
   *  failed): it is saved on this device only. Clears on the next write that does. */
  @state() private _presetsLocalOnly = false;
  /** Storage is full: the last preset change is not even saved on this device. */
  @state() private _presetsUnsaved = false;
  /** Disarms the delete control on a press elsewhere or after a few seconds
   *  (blur alone never fires where a click doesn't focus the button). */
  private _deleteGuard = new ArmGuard(() => {
    this._deleteArmed = false;
  });
  @state() private _entityRowStyles: EntitiesRowStyles = {};
  /** The card arrived with CSS the modules didn't adopt (now in Advanced
   *  CSS) — drives the "weren't recognised" note, which must not appear
   *  just because the user types their own CSS. */
  @state() private _loadedRawCss = false;
  /** The loaded style has a top-level `{% … %}` statement: the parser kept all
   *  of it in Advanced CSS and every module is off (explained by a banner). */
  @state() private _loadedWholeStyleKept = false;
  /** True when the panel is too narrow for the side-by-side preview. */
  @state() private _narrow = false;

  /** Own-echo guard: skips state rebuilds for configs we ourselves just
   *  emitted, while advancing its baseline on every genuine external
   *  rebuild (see ConfigEchoGuard for the revert-to-A regression). */
  private _echoGuard = new ConfigEchoGuard();
  private _resizeObserver?: ResizeObserver;

  override connectedCallback() {
    super.connectedCallback();
    // One place for every field the Studio renders (modules, stack children,
    // palette manager and preset bar all live in this subtree).
    this.addEventListener('keydown', keepEnterInStudio);
    this._cardModPresent = isCardModInstalled();
    this._uixPresent = isUixInstalled();
    // Load from localStorage immediately (sync); HA sync happens when hass arrives
    void loadPresets(undefined).then((p) => { this._presets = p; });
    void initPaletteCache(this.hass);
    // Width-responsive: the side preview takes 300–420px, so the controls
    // column only stays comfortable (>= ~420px: dense rule rows, colour
    // grids) when the panel is at least ~720px wide. Below that, stack the
    // preview under the controls instead (600px left 600-720px panels —
    // small windows, tablet split view — with clipped rule rows).
    window.addEventListener(PALETTE_CHANGED_EVENT, this._onPaletteChanged);
    this._resizeObserver = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) this._narrow = w < 720;
    });
    this._resizeObserver.observe(this);
  }

  /** Palette ON/OFF defaults edited in this session apply to modules that
   *  aren't on yet — no config change (they emit nothing until enabled). */
  private _onPaletteChanged = () => {
    if (this._studioState) this._studioState = refreshPaletteDefaults(this._studioState);
  };

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('keydown', keepEnterInStudio);
    window.removeEventListener(PALETTE_CHANGED_EVENT, this._onPaletteChanged);
    this._deleteGuard.stop(); // an armed panel leaving the page keeps no window listener
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
    this._loadedRawCss = !!this._studioState.advanced.rawCss.trim();
    this._loadedWholeStyleKept = hasTopLevelJinjaStatement(this._studioState.advanced.rawCss);
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
    // Only relevant when a uix.style exists to keep rendering — macros
    // defined next to no uix style change nothing for the user.
    return !!this.config && this._cardModPresent && usesUixMacroBlockFeatures(this.config.uix) && !!this.config.uix?.style;
  }

  /**
   * UIX is the active write target and the card's uix style CALLS a macro or
   * billet. A save replaces uix.style with the generated CSS, but the Studio
   * keeps the macro call verbatim in Advanced CSS (so the card renders as
   * before) and never rewrites `uix.macros` / `billets` — nothing is lost,
   * so this is informational. Macros merely defined next to plain CSS don't
   * qualify.
   */
  private get _uixMacroStyleKept(): boolean {
    return !!this.config && this._uixPresent && !this._cardModPresent && uixStyleUsesMacro(this.config.uix);
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

    if (this._caps.isEntities) {
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

  /** The card's profile key (D2) — derived once from the config; every
   *  gating read below goes through capsFor(this._profileKey). */
  private get _profileKey(): string {
    return profileKeyOf(this.config);
  }

  /** The capabilities for this card — config-aware (a profile can hide a
   *  module while the card config sets e.g. `icon_color`). */
  private get _caps() {
    return capsFor(this._profileKey, this.config as unknown as Record<string, unknown>);
  }

  private get _isContainerCard(): boolean {
    return this._caps.isContainer;
  }

  /** A card with no style modules at all (Mushroom's empty card renders
   *  nothing): only Advanced CSS reaches it. Decided from the capabilities,
   *  so containers (their own layout) and entities (row styling) don't match. */
  private get _nothingToStyle(): boolean {
    const caps = this._caps;
    return !caps.isContainer && !caps.isEntities && Object.values(caps.modules).every((on) => !on);
  }

  private get _showIconColor(): boolean {
    return this._caps.modules.iconColor;
  }

  /** A dict-form style the Studio can't rewrite faithfully (mixed-form, or
   *  a `.` that isn't plain CSS) — the card-level modules are replaced by
   *  the lock banner (see _renderModuleList). */
  private get _isLocked(): boolean {
    return hasDictFormStyle(this._written ?? this.config ?? {}) && !this._studioState?.dictSource;
  }

  /** The config this panel just emitted, until HA feeds it back as
   *  `config`: the state's carrier already describes it, so judging the
   *  lock against the older config flashed the lock banner for a frame
   *  when Number size turned a dict back into a string. */
  private _written?: CardModCardConfig;

  override willUpdate(changed: Map<PropertyKey, unknown>) {
    if (changed.has('config')) this._written = undefined;
  }

  private get _isEntitiesCard(): boolean {
    return this._caps.isEntities;
  }

  private get _showAnimation(): boolean {
    return this._caps.modules.animation;
  }

  private get _showBackground(): boolean {
    return this._caps.modules.background;
  }

  private get _showBorder(): boolean {
    return this._caps.modules.border;
  }

  private get _showHeadingStyle(): boolean {
    return this._caps.modules.headingStyle;
  }

  private get _showFont(): boolean {
    return this._caps.modules.font;
  }

  private get _isLightCard(): boolean {
    return this._caps.isLight;
  }

  private get _isStateAware(): boolean {
    return panelStateAware(this._profileKey, this.config as unknown as Record<string, unknown>, this.hass);
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
    let newConfig = applyStudioState(this._studioState, this.config, this.hass);
    if (this._caps.isEntities) {
      newConfig = this._applyEntityRowStyles(newConfig);
    }
    this._written = newConfig;
    this._studioState = refreshCarrier(this._studioState, newConfig, this.hass);
    this._emitConfig(newConfig);
  }

  private _onEntityRowStylesChanged(e: CustomEvent<EntitiesRowStyles>) {
    this._entityRowStyles = e.detail;
    this._emitConfigChanged();
  }

  // ---------------------------------------------------------------------------
  // Preset management
  // ---------------------------------------------------------------------------

  /** The stored preset a typed name refers to: names are compared trimmed
   *  and case-sensitively ("Warm" and "warm" stay two presets). */
  private _presetNamed(typed: string): StylePreset | undefined {
    const name = typed.trim();
    return name ? this._presets.find((p) => p.name.trim() === name) : undefined;
  }

  private _startNamingPreset() {
    // With a preset selected the field starts on its full name, so Overwrite is
    // one click — even for a name stored before the length cap.
    this._presetName = this._presets.find((p) => p.name === this._selectedPreset)?.name ?? '';
    this._presetNameTried = false;
    this._namingPreset = true;
    void this.updateComplete.then(() => {
      const input = this.shadowRoot?.querySelector('.preset-name') as HTMLInputElement | null;
      input?.focus();
      input?.select(); // typing a new name replaces the prefilled one
    });
  }

  private _cancelNamingPreset() {
    this._namingPreset = false;
    this._presetName = '';
    this._presetNameTried = false;
  }

  /** Leading blanks are dropped and the length capped as the user types; the
   *  trailing end is only trimmed on save (trimming it here would make
   *  "my preset" untypeable). The cap is for NEW names: a name that is
   *  already a preset is left whole. */
  private _onPresetNameInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const typed = input.value.replace(/^\s+/, '');
    const name = this._presetNamed(typed) ? typed : typed.slice(0, PRESET_NAME_MAX);
    // Blanks only: nothing is left to show, so say why Save stays disabled.
    if (!name && input.value) this._presetNameTried = true;
    if (name !== input.value) input.value = name;
    this._presetName = name;
  }

  private _onPresetNameKeydown(e: KeyboardEvent) {
    // Keep Enter/Escape inside the field — Escape would otherwise close
    // HA's whole card-edit dialog.
    // Enter that accepts an IME candidate (Japanese, Chinese, …) is not a save.
    // Escape that cancels a candidate belongs to the IME: it must not cancel
    // the naming nor be default-prevented, but it must still not reach HA's
    // dialog.
    if (e.isComposing || e.keyCode === 229) {
      if (e.key === 'Escape') e.stopPropagation();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      this._saveCurrentAsPreset();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this._cancelNamingPreset();
    }
  }

  /** Saves the current styling under the name typed into the preset bar. */
  private _saveCurrentAsPreset() {
    if (!this._studioState) return;
    const typed = this._presetName.trim();
    // An existing preset is overwritten under ITS name, whatever its length;
    // only a new name is capped.
    const trimmed = this._presetNamed(typed)?.name ?? typed.slice(0, PRESET_NAME_MAX);
    if (!trimmed) {
      this._presetNameTried = true;
      return;
    }
    this._namingPreset = false;
    this._presetName = '';
    // A dict card's carrier (its pierced entries) belongs to THAT card — a
    // preset must never carry it (audit v0.10 #8).
    // Nor Number size: its units differ per card and it can sit under a
    // hand-written entry (v0.11) — it stays the card's own setting.
    const { dictSource: _cardDict, ...cardState } = this._studioState;
    const presetState = { ...cardState, font: presetFont(cardState.font) };
    const preset = { name: trimmed, state: presetState };
    this._selectedPreset = trimmed;
    this._commitPresetChange({ kind: 'save', preset });
  }

  /** Shows the change at once, writes it against the STORED list (another
   *  browser may have saved since this panel loaded), then shows what was
   *  actually written. */
  private _commitPresetChange(change: PresetChange) {
    this._presets = applyPresetChange(this._presets, change);
    void updatePresets(change, this.hass, (reachedHa, kept) => {
      this._presetsLocalOnly = !reachedHa;
      this._presetsUnsaved = !kept;
    }, this._presets)
      .then((written) => { this._presets = written; });
  }

  private _disarmDelete() {
    this._deleteArmed = false;
    this._deleteGuard.stop();
  }

  private _onPresetDeleteKeydown(e: KeyboardEvent) {
    // Escape would otherwise close HA's whole card-edit dialog.
    if (e.key === 'Escape' && this._deleteArmed) {
      e.preventDefault();
      e.stopPropagation();
      this._disarmDelete();
    }
  }

  private _onPresetSelect(e: Event) {
    this._disarmDelete();
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
    const current = this._studioState;
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
        this._profileKey,
        this.config as unknown as Record<string, unknown>,
      ),
      ...(currentDictSource ? { dictSource: currentDictSource } : {}),
    };
    if (current) this._studioState = { ...this._studioState, font: withCardNumberSize(this._studioState.font, current.font) };
    this._emitConfigChanged();
  }

  /** Two-step: the first click only arms the control (its label asks), the
   *  second deletes. Blur, Escape, a press elsewhere and a short timeout
   *  disarm it. */
  private _deleteSelectedPreset(e?: Event) {
    if (!this._selectedPreset) return;
    if (!this._deleteArmed) {
      this._deleteArmed = true;
      this._deleteGuard.start(e?.currentTarget);
      return;
    }
    this._disarmDelete();
    const name = this._selectedPreset;
    this._selectedPreset = '';
    this._commitPresetChange({ kind: 'delete', name });
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
      /* The injector hides HA's editor underneath (issue #36) — this host
         lives inside it, so it opts back in. */
      visibility: visible;
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
      /* Module label column (module-base .control-label) — narrower on
         phones so the controls beside it keep enough room. Inherits into
         the modules' shadow roots. */
      --cms-label-width: 96px;
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
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
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
    .btn-preset-save:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .preset-bar .preset-name {
      flex: 1;
      min-width: 0;
      box-sizing: border-box;
      min-height: 32px;
      padding: 5px 8px;
      font: inherit;
      font-size: 12px;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color, #212121);
      border: 1px solid var(--cms-line-primary);
      border-radius: 4px;
    }

    .btn-preset-cancel {
      box-sizing: border-box;
      min-height: 32px;
      padding: 5px 10px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 4px;
      background: transparent;
      color: var(--primary-text-color, #212121);
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    }
    .btn-preset-cancel:hover { background: var(--cms-fill-hover); }

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
    .btn-preset-delete.armed {
      font-size: 12px;
      font-weight: 600;
    }

    .preset-bar.has-hint { flex-wrap: wrap; }

    /* Touch: a finger needs more than the desktop 32px. */
    @media (pointer: coarse) {
      .preset-bar select,
      .btn-preset-save { min-height: 40px; }
    }

    /* One line inside the bar, only while a hint applies. */
    .preset-hint {
      flex: 1 0 100%;
      font-size: 11px;
      line-height: 1.4;
      color: var(--secondary-text-color, #727272);
    }

    :is(.btn-preset-save, .btn-preset-delete, .btn-preset-cancel, .btn-banner-action, .preset-bar select, .preset-name):focus-visible {
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

    /* Read by screen readers, takes no space: the preview card is inert. */
    .preview-sr-note {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
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
                ${this._isLocked || this._nothingToStyle ? nothing : this._renderPresetBar()}
                <cms-palette-manager .hass=${this.hass}></cms-palette-manager>
                ${this._renderNothingToStyleNote()}
                ${this._renderUnprofiledNotice()}
                ${this._renderModuleList(settleEntityless(this._studioState, this.config as unknown as Record<string, unknown>))}
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
    // `inert` sits on the card itself, not the wrapper: it removes the real
    // card from Tab, key presses and the accessibility tree (pointer-events
    // alone left it a keyboard tab stop that could switch a real entity),
    // while the picker overlay — a sibling — keeps working and still reads
    // the card's rects. aria-hidden would be redundant with inert.
    // The sr-only note beside it
    // (outside the inert card) is what tells a screen-reader user it exists.
    return html`
      <div class="preview-stage">
        <span class="preview-sr-note">Live preview of the card (not interactive)</span>
        ${keyed(
          this._previewKey,
          html`<hui-card inert .hass=${this.hass} .config=${previewConfig}></hui-card>`,
        )}
        ${this._pickerActive
          ? html`<cms-preview-picker
              .cardType=${this._profileKey}
              .cardConfig=${this.config as unknown as Record<string, unknown>}
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
    if (!this._caps.isEntities) return [];
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

    if (this._uixMacroStyleKept) {
      return html`<div class="info-banner">
        ℹ️ This card's uix: style uses macros/billets. They are kept as they are — the part of the style
        that calls them stays in Advanced CSS.
      </div>`;
    }

    return nothing;
  }

  /** D7: a custom card without a profile keeps every module, plus a one-line
   *  hint that some may not reach it. Not shown over the lock banner. */
  private _renderUnprofiledNotice() {
    if (this._isLocked || !isUnprofiledCustomCard(this.config)) return nothing;
    return html`<div class="info-banner">ℹ️ ${UNPROFILED_CARD_NOTICE}</div>`;
  }

  /** A card that renders nothing: say so instead of an empty preview. */
  private _renderNothingToStyleNote() {
    if (this._isLocked || !this._nothingToStyle) return nothing;
    return html`<div class="info-banner">ℹ️ This card renders nothing, so there is nothing to style — Advanced CSS still applies.</div>`;
  }

  private _renderPresetBar() {
    if (this._namingPreset) {
      const name = this._presetName.trim();
      const exists = !!this._presetNamed(name);
      const hint = !name && (this._presetName.length > 0 || this._presetNameTried)
        ? 'Type a name to save this preset.'
        : exists
          ? `Replaces the existing preset "${name}".`
          : '';
      return html`
        <div class="preset-bar ${hint ? 'has-hint' : ''}">
          <input
            class="preset-name"
            type="text"
            aria-label="Preset name"
            aria-describedby=${hint ? 'preset-hint' : nothing}
            placeholder="Preset name"
            maxlength=${PRESET_NAME_MAX}
            .value=${this._presetName}
            @input=${this._onPresetNameInput}
            @keydown=${this._onPresetNameKeydown}
          />
          <button
            class="btn-preset-save"
            ?disabled=${!name}
            @click=${this._saveCurrentAsPreset}
          >${exists ? '💾 Overwrite' : '💾 Save'}</button>
          <button class="btn-preset-cancel" @click=${this._cancelNamingPreset}>Cancel</button>
          ${hint ? html`<div class="preset-hint" id="preset-hint" role="status">${hint}</div>` : nothing}
        </div>
      `;
    }
    const armedLabel = `Delete '${this._selectedPreset}'?`;
    return html`
      <div class="preset-bar ${this._presetsLocalOnly || this._presetsUnsaved ? 'has-hint' : ''}">
        <select aria-label="Load preset" .value=${this._selectedPreset} @change=${this._onPresetSelect}>
          <option value="">Load preset…</option>
          ${this._presets.map(
            (p) => html`<option value=${p.name} ?selected=${p.name === this._selectedPreset}>${p.name}</option>`,
          )}
        </select>
        ${this._selectedPreset
          ? html`<button
              class="btn-preset-delete ${this._deleteArmed ? 'armed' : ''}"
              title=${this._deleteArmed ? armedLabel : 'Delete preset'}
              aria-label=${this._deleteArmed ? armedLabel : `Delete preset '${this._selectedPreset}'`}
              @click=${this._deleteSelectedPreset}
              @blur=${this._disarmDelete}
              @keydown=${this._onPresetDeleteKeydown}
            >${this._deleteArmed ? 'Delete?' : '×'}</button>`
          : nothing}
        <button class="btn-preset-save" title="Save the current styling as a preset" @click=${this._startNamingPreset}><span aria-hidden="true">💾</span> Save preset</button>
        ${this._presetsUnsaved
          ? html`<div class="preset-hint" role="status">Couldn't save this preset — this browser's storage is full.</div>`
          : this._presetsLocalOnly
            ? html`<div class="preset-hint" role="status">Couldn't reach your Home Assistant profile — saved on this device only.</div>`
            : nothing}
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
    const loadedCss = this._loadedRawCss && !!s.advanced.rawCss.trim();
    // A module-less card has nothing that could have recognised anything.
    const hasUnrecognisedCss = loadedCss && !this._nothingToStyle;
    // "Custom CSS is overriding this control" warnings (style-conflicts.ts)
    const conflicts = findAdvancedCssConflicts(s.advanced.rawCss, s, this._profileKey);
    const thresholdOwned = thresholdOwnedProperties(s.threshold);

    return html`
      ${hasUnrecognisedCss && this._loadedWholeStyleKept
        ? html`<div class="info-banner">
            ℹ️ ${templateStatementNote(anyModuleOn(s))}
          </div>`
        : hasUnrecognisedCss
          ? html`<div class="info-banner">
              ℹ️ Some existing styles weren't recognised — preserved in Advanced CSS.
            </div>`
          : nothing}

      ${showHeadingStyle
        ? html`<cms-heading-style-module
            .headingStyle=${(this.config as unknown as Record<string, unknown> | undefined)?.heading_style as string | undefined}
            .overridden=${!!conflicts.headingStyle}
            .overriddenDetail=${(conflicts.headingStyle ?? []).join(", ")}
            .state=${s.headingStyle}
            @state-changed=${this._onHeadingStyleChanged}
          ></cms-heading-style-module>`
        : nothing}

      ${showFont
        ? html`<cms-font-module
            .allowColor=${this._caps.fontColor}
            .thresholdOwned=${thresholdOwned.has('text-color') && !(this._caps.custom && !this._caps.modules.threshold)}
            .allowSize=${this._caps.fontSize}
            .numberSize=${numberSizeKind(this._profileKey)}
            .cardType=${this._profileKey}
            .overridden=${!!conflicts.font}
            .overriddenDetail=${(conflicts.font ?? []).join(", ")}
            .state=${s.font}
            @state-changed=${this._onFontChanged}
          ></cms-font-module>`
        : nothing}

      ${this._caps.modules.filter
        ? html`<cms-filter-module
            .cardEntity=${this.config?.entity ?? ''}
            .overridden=${!!conflicts.filter}
            .overriddenDetail=${(conflicts.filter ?? []).join(", ")}
            .state=${s.filter}
            .stateAware=${stateAware}
            .hass=${this.hass}
            @state-changed=${this._onFilterChanged}
          ></cms-filter-module>`
        : nothing}

      ${this._caps.modules.accentColor
        ? html`<cms-accent-color-module
            .overridden=${!!conflicts.accentColor}
            .overriddenDetail=${(conflicts.accentColor ?? []).join(", ")}
            .thresholdOwned=${thresholdOwned.has('accent-color')}
            .state=${s.accentColor}
            .stateAware=${stateAware}
            .cardEntity=${this.config?.entity ?? ''}
            .cardType=${this._profileKey}
            .tripletAccent=${this._caps.accentTriplet}
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
            .allowSize=${this._caps.iconSize}
            .sizeMax=${this._caps.iconSizeMax}
            .allowColor=${!this._caps.iconColorless}
            .cardEntity=${this.config?.entity ?? ''}
            .hass=${this.hass}
            @state-changed=${this._onIconColorChanged}
          ></cms-icon-color-module>`
        : nothing}

      ${this._caps.modules.threshold
        ? html`<cms-threshold-module
              .overridden=${!!conflicts.threshold}
              .overriddenDetail=${(conflicts.threshold ?? []).join(", ")}
              .state=${s.threshold}
              .cardEntity=${this.config?.entity ?? ''}
              .cardType=${this._profileKey}
              .cardConfig=${this.config}
              .tripletAccent=${this._caps.accentTriplet}
              .hass=${this.hass}
              @state-changed=${this._onThresholdChanged}
            ></cms-threshold-module>`
        : nothing}

      ${showBackground
        ? html`<cms-background-module
            .cardEntity=${this.config?.entity ?? ''}
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
            .cardEntity=${this.config?.entity ?? ''}
            .overridden=${!!conflicts.animation}
            .overriddenDetail=${(conflicts.animation ?? []).join(", ")}
            .state=${s.animation}
            .hiddenPresets=${this._caps.noAnimationPresets}
            .stateAware=${stateAware}
            .hass=${this.hass}
            @state-changed=${this._onAnimationChanged}
          ></cms-animation-module>`
        : nothing}

      ${showBorder
        ? html`<cms-border-module
            .cardEntity=${this.config?.entity ?? ''}
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
        .pierced=${userEntries(s.dictSource)}
        .autoOpen=${loadedCss || userEntries(s.dictSource).length > 0}
        @state-changed=${this._onAdvancedChanged}
      ></cms-advanced-module>

      ${this._renderEntityRowsModule()}
    `;
  }

  private _renderEntityRowsModule() {
    return this._caps.isEntities
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
    // Its CSS all lives in Advanced CSS by design — nothing was "unrecognised".
    const loadedCss = this._loadedRawCss && !!s.advanced.rawCss.trim();
    const childCards = this._caps.stylableChildren
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

      <cms-advanced-module
        .state=${s.advanced}
        .pierced=${userEntries(s.dictSource)}
        .autoOpen=${loadedCss || userEntries(s.dictSource).length > 0}
        @state-changed=${this._onAdvancedChanged}
      ></cms-advanced-module>
    `;
  }
}

customElements.define('cms-panel', CmsPanel);

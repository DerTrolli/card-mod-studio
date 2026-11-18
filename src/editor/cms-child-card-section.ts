/**
 * cms-child-card-section — one collapsible styling section for a child card
 * inside a container (vertical-stack / horizontal-stack / grid: `cards[i]`;
 * conditional / entity-filter: `card` — see child-slots.ts).
 *
 * A container's config carries every child's FULL card config in `cards: []`
 * — the same shape an entities card's `entities: []` rows have — so child
 * styling doesn't need to hook Home Assistant's embedded child editor at
 * all: this section runs the exact same parse → modules → generate → apply
 * pipeline as a top-level card (studio-state.ts) against `cards[index]` and
 * emits the updated child config for cms-panel to fold back into the stack.
 * Both card-mod and UIX natively apply a child card's own card_mod:/uix:
 * block wherever the card is rendered, so the output works unchanged.
 *
 * Module visibility/gating comes from the same card-caps tables the
 * top-level panel uses — a gauge child gets the gauge treatment, a tile
 * child the tile treatment, etc.
 *
 * A child that is itself a container (a stack inside a stack, a
 * conditional inside a grid, …) gets its own child sections, recursively
 * (v1.0): a nested section's change is caught here, folded into this
 * child's config and re-emitted for THIS slot — so the panel only ever
 * receives changes for its own direct children, whatever the depth.
 * An entities-card child gets per-row styling like a top-level one.
 * Mixed-form child styles (string + dict together) are preserved untouched,
 * same as everywhere (pure dict-form IS editable — v0.10).
 */
import { hasTopLevelJinjaStatement, templateStatementNote, anyModuleOn } from '../utils/css-lint.js';
import { userEntries, numberSizeKind } from '../utils/owned-entries.js';
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
  ThresholdModuleState,
  AdvancedModuleState,
  HeadingStyleModuleState,
  FontModuleState,
  FeaturesModuleState,
  EntitiesCardRow,
  EntitiesRowStyles,
} from '../types/index.js';
import {
  buildMergedStudioState,
  applyStudioState,
  refreshCarrier,
  initEntityRowStyles,
  applyEntityRowStyles,
  refreshPaletteDefaults,
} from './studio-state.js';
import { PALETTE_CHANGED_EVENT } from '../utils/palette-storage.js';
import {
  capsFor,
  panelStateAware,
} from '../utils/card-caps.js';
import { childKindLabel, profileKeyOf, isUnprofiledCustomCard, unprofiledCardNotice } from '../utils/custom-card-profiles.js';
import { moduleStyles, onHeaderKeydown } from '../modules/module-base.js';
import { findAdvancedCssConflicts } from '../utils/style-conflicts.js';
import { cardThresholdOwned, settleEntityless } from '../generator/css-generator.js';
import { hasDictFormStyle, hasUnsupportedDictRoot } from '../utils/style-compat.js';
import { ConfigEchoGuard } from '../utils/config-echo.js';
import { childSlots, withChild, type ChildSlot } from '../utils/child-slots.js';

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
import '../modules/module-features.js';
import { DEFAULT_FEATURES } from '../parser/state-mapper.js';
import '../modules/module-entities-rows.js';
import { LangController, t, tParts } from '../i18n/index.js';

export class CmsChildCardSection extends LitElement {
  protected readonly i18n = new LangController(this);
  @property({ attribute: false }) childConfig?: CardModCardConfig;
  @property({ attribute: false }) hass?: HomeAssistant;
  /** Where this child sits in its container: `cards[slot]` or `card`. */
  @property({ attribute: false }) childSlot: ChildSlot = 0;
  /** entity-filter without a `card:` (HA's default entities card). */
  @property({ type: Boolean }) implicit = false;
  /** How deep in nested containers (indents the section). */
  @property({ type: Number }) depth = 0;

  /** Older name of `slot` for a `cards[]` child. */
  set index(i: number) {
    this.childSlot = i;
  }
  get index(): number {
    return typeof this.childSlot === 'number' ? this.childSlot : 0;
  }

  @state() private _studioState: StudioState | null = null;
  @state() private _entityRowStyles: EntitiesRowStyles = {};
  @state() private _open = false;
  /** See CmsPanel._loadedRawCss. */
  @state() private _loadedRawCss = false;
  /** See CmsPanel._loadedWholeStyleKept. */
  @state() private _loadedWholeStyleKept = false;

  /** Mirror of cms-panel's own-echo dedup guard: when the panel reflects
   *  our own emitted child config back down, don't rebuild state mid-edit.
   *  The guard advances its baseline on every external rebuild (see
   *  ConfigEchoGuard for the revert-to-A regression this prevents). */
  private _echoGuard = new ConfigEchoGuard();

  static override styles = [
    moduleStyles,
    css`
      :host {
        display: block;
      }
      .child-section {
        border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
        border-radius: 8px;
        margin-bottom: 8px;
        overflow: hidden;
      }
      .child-header {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 44px;
        box-sizing: border-box;
        padding: 6px 12px;
        background: var(--cms-fill);
        cursor: pointer;
        user-select: none;
        transition: background 0.15s ease;
      }
      .child-header:hover {
        background: var(--cms-fill-hover);
      }
      .child-header:focus-visible {
        outline: 2px solid var(--primary-color, #03a9f4);
        outline-offset: -2px;
      }
      .child-title {
        font-weight: 500;
        font-size: 13px;
        flex-shrink: 0;
      }
      .child-sub {
        font-size: 11px;
        color: var(--secondary-text-color, #727272);
        font-family: monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        min-width: 0;
      }
      /* Same "this item carries styling" indicator as the entities rows
       * module's .style-dot — one concept, one look. */
      .styled-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--primary-color, #03a9f4);
        flex-shrink: 0;
      }
      /* Tight side padding: modules nested in a child already carry their
         own border + padding, and every pixel counts at phone width. */
      .child-body {
        padding: 10px 6px 0;
        border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      }
      /* A container inside a container: its children, indented. */
      .child-body.nested {
        padding: 8px 4px 2px 10px;
        border-left: 3px solid var(--cms-line-primary);
      }
      .child-hint {
        font-size: 12px;
        line-height: 1.5;
        color: var(--primary-text-color, #212121);
        background: var(--cms-tint-primary);
        border: 1px solid var(--cms-line-primary);
        border-radius: 8px;
        padding: 6px 10px;
        margin-bottom: 8px;
      }
      .child-note {
        font-size: 12px;
        line-height: 1.5;
        color: var(--secondary-text-color, #727272);
        padding: 8px 12px 12px;
      }
    `,
  ];

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener(PALETTE_CHANGED_EVENT, this._onPaletteChanged);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener(PALETTE_CHANGED_EVENT, this._onPaletteChanged);
  }

  /** See CmsPanel._onPaletteChanged. */
  private _onPaletteChanged = () => {
    if (this._studioState) this._studioState = refreshPaletteDefaults(this._studioState);
  };

  /** The child config just emitted, until it comes back as childConfig —
   *  see cms-panel's _written. */
  private _written?: CardModCardConfig;

  override willUpdate(changed: Map<PropertyKey, unknown>) {
    if (changed.has('childConfig')) {
      this._written = undefined;
      if (!this.childConfig) {
        this._studioState = null;
        this._entityRowStyles = {};
        this._echoGuard.reset();
        return;
      }
      if (this._echoGuard.shouldRebuild(JSON.stringify(this.childConfig))) {
        this._studioState = buildMergedStudioState(this.childConfig, this.hass);
        this._loadedRawCss = !!this._studioState.advanced.rawCss.trim();
        this._loadedWholeStyleKept = hasTopLevelJinjaStatement(this._studioState.advanced.rawCss);
        this._entityRowStyles = initEntityRowStyles(this.childConfig, this.hass);
      }
    }
  }

  private _emitChanged(changes: Partial<StudioState>) {
    if (!this.childConfig || !this._studioState) return;
    this._studioState = { ...this._studioState, ...changes };
    this._emitChildConfig();
  }

  private _onRowStylesChanged(e: CustomEvent<EntitiesRowStyles>) {
    this._entityRowStyles = e.detail;
    this._emitChildConfig();
  }

  private _emitChildConfig() {
    if (!this.childConfig || !this._studioState) return;
    let newChild = applyStudioState(this._studioState, this.childConfig, this.hass);
    if (capsFor(profileKeyOf(this.childConfig)).isEntities) {
      newChild = applyEntityRowStyles(newChild, this._entityRowStyles, this.hass);
    }
    this._send(newChild);
  }

  private _send(newChild: CardModCardConfig) {
    this._written = newChild;
    if (this._studioState) this._studioState = refreshCarrier(this._studioState, newChild, this.hass);
    this._echoGuard.noteEmitted(JSON.stringify(newChild));
    this.dispatchEvent(
      new CustomEvent<{ slot: ChildSlot; index: number; config: CardModCardConfig }>('child-config-changed', {
        detail: { slot: this.childSlot, index: this.index, config: newChild },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** A grandchild changed: fold it into this (container) child and pass it up for this slot. */
  private _onNestedChange(e: CustomEvent<{ slot: ChildSlot; config: CardModCardConfig }>) {
    e.stopPropagation();
    const base = this._written ?? this.childConfig;
    if (!base || !childSlots(base)?.some((c) => c.slot === e.detail.slot)) return;
    this._send(withChild(base, e.detail.slot, e.detail.config));
  }

  private get _isStyled(): boolean {
    return !!(this.childConfig?.card_mod?.style || this.childConfig?.uix?.style);
  }

  override render() {
    const c = this.childConfig;
    if (!c) return nothing;
    const kind = childKindLabel(c);
    const label = typeof this.childSlot === 'number'
      ? `${this.childSlot + 1}. ${kind}`
      : this.implicit
        ? t('child.implicitCard', { type: kind })
        : t('child.innerCard', { type: kind });
    const sub = (c.entity as string | undefined) ?? (c.title as string | undefined) ?? (c.name as string | undefined) ?? '';

    return html`
      <div class="child-section">
        <div
          class="child-header"
          role="button"
          tabindex="0"
          aria-expanded=${this._open ? 'true' : 'false'}
          @click=${() => (this._open = !this._open)}
          @keydown=${onHeaderKeydown}
        >
          <span class="module-chevron" aria-hidden="true">${this._open ? '▼' : '▶'}</span>
          <span class="child-title">${label}</span>
          <span class="child-sub">${sub}</span>
          ${this._isStyled ? html`<span class="styled-dot" title=${t('child.hasStyle')}></span>` : nothing}
        </div>
        ${this._open ? this._renderBody() : nothing}
      </div>
    `;
  }

  private _renderBody() {
    const c = this.childConfig!;
    // Settled for a child without an entity: what the controls show is what
    // gets saved (see settleEntityless).
    const s = this._studioState && settleEntityless(this._studioState, c as unknown as Record<string, unknown>);
    if (!s) return nothing;

    const caps = capsFor(profileKeyOf(c), c as unknown as Record<string, unknown>);
    if (caps.isContainer) {
      const inner = this._written ?? c;
      const kids = childSlots(inner);
      if (!kids) {
        return html`<div class="child-note">${t('child.nestedContainer', { type: String(c.type) })}</div>`;
      }
      return html`<div class="child-body nested">
        <div class="child-hint">🗂️ ${t('child.nestedChildren', { type: String(c.type) })}</div>
        ${kids.map(
          (k) => html`<cms-child-card-section
            .childConfig=${k.config}
            .childSlot=${k.slot}
            .implicit=${!!k.implicit}
            .depth=${this.depth + 1}
            .hass=${this.hass}
            @child-config-changed=${this._onNestedChange}
          ></cms-child-card-section>`,
        )}
        ${kids.length ? nothing : html`<div class="child-note">${t('child.noChildren')}</div>`}
      </div>`;
    }

    // v0.10: dict-form child styles are editable when the parsed state
    // carries the dict (dictSource) — the `.` entry runs through the normal
    // module pipeline and every pierced entry is preserved verbatim on save.
    // Only the MIXED form (active string style + dict on the secondary key)
    // still freezes: there's no faithful single-key rewrite for it, so the
    // save path preserves both keys untouched (same gate as cms-panel).
    if (hasDictFormStyle(this._written ?? c) && !s.dictSource) {
      // Per-row styling stays editable, exactly like the top-level panel's
      // mixed-form gate (audit v0.10 #17).
      return html`<div class="child-note">
        ${hasUnsupportedDictRoot(c.card_mod?.style) || hasUnsupportedDictRoot(c.uix?.style)
          ? html`🔒 ${tParts('child.dictLocked', { dot: html`<code>.</code>` })}`
          : html`🔒 ${t('child.mixedLocked')}`}
      </div>${caps.isEntities
        ? html`<div class="child-body"><cms-entities-rows-module
            .hass=${this.hass}
            .rows=${(c as unknown as { entities?: EntitiesCardRow[] }).entities ?? []}
            .styles=${this._entityRowStyles}
            @styles-changed=${this._onRowStylesChanged}
          ></cms-entities-rows-module></div>`
        : nothing}`;
    }

    const cardType = profileKeyOf(c);
    const mods = caps.modules;
    const entity = (c.entity as string | undefined) ?? '';
    const stateAware = panelStateAware(cardType, c as unknown as Record<string, unknown>, this.hass);
    const showHeading = mods.headingStyle;
    const isEntities = caps.isEntities;
    const hasUnrecognisedCss = this._loadedRawCss && !!s.advanced.rawCss.trim();
    const conflicts = findAdvancedCssConflicts(s.advanced.rawCss, s, cardType);
    const thresholdOwned = cardThresholdOwned(s.threshold, caps);

    return html`
      <div class="child-body">
        ${hasUnrecognisedCss && this._loadedWholeStyleKept
          ? html`<div class="child-hint">ℹ️ ${templateStatementNote(anyModuleOn(s))}</div>`
          : nothing}
        ${isUnprofiledCustomCard(c)
          ? html`<div class="child-hint">ℹ️ ${unprofiledCardNotice()}</div>`
          : nothing}

        ${showHeading
          ? html`<cms-heading-style-module
              .headingStyle=${(c as unknown as Record<string, unknown>).heading_style as string | undefined}
              .overridden=${!!conflicts.headingStyle}
              .overriddenDetail=${(conflicts.headingStyle ?? []).join(", ")}
              .state=${s.headingStyle}
              @state-changed=${(e: CustomEvent<HeadingStyleModuleState>) =>
                this._emitChanged({ headingStyle: e.detail })}
            ></cms-heading-style-module>`
          : nothing}

        ${mods.font
          ? html`<cms-font-module
              .allowColor=${caps.fontColor}
              .thresholdOwned=${thresholdOwned.has('text-color')}
              .allowSize=${caps.fontSize}
              .numberSize=${numberSizeKind(cardType)}
              .cardType=${cardType}
              .overridden=${!!conflicts.font}
              .overriddenDetail=${(conflicts.font ?? []).join(", ")}
              .state=${s.font}
              @state-changed=${(e: CustomEvent<FontModuleState>) => this._emitChanged({ font: e.detail })}
            ></cms-font-module>`
          : nothing}

        ${mods.filter
          ? html`<cms-filter-module
              .cardEntity=${entity}
              .overridden=${!!conflicts.filter}
              .overriddenDetail=${(conflicts.filter ?? []).join(", ")}
              .state=${s.filter}
              .stateAware=${stateAware}
              .hass=${this.hass}
              @state-changed=${(e: CustomEvent<FilterModuleState>) => this._emitChanged({ filter: e.detail })}
            ></cms-filter-module>`
          : nothing}

        ${mods.accentColor
          ? html`<cms-accent-color-module
              .overridden=${!!conflicts.accentColor}
              .overriddenDetail=${(conflicts.accentColor ?? []).join(", ")}
              .thresholdOwned=${thresholdOwned.has('accent-color')}
              .state=${s.accentColor}
              .stateAware=${stateAware}
              .cardEntity=${entity}
              .cardType=${cardType}
              .tripletAccent=${caps.accentTriplet}
              .hass=${this.hass}
              @state-changed=${(e: CustomEvent<AccentColorModuleState>) =>
                this._emitChanged({ accentColor: e.detail })}
            ></cms-accent-color-module>`
          : nothing}

        ${mods.iconColor
          ? html`<cms-icon-color-module
              .overridden=${!!conflicts.iconColor}
              .overriddenDetail=${(conflicts.iconColor ?? []).join(", ")}
              .thresholdOwned=${thresholdOwned.has('icon-color')}
              .state=${s.iconColor}
              .stateAware=${stateAware}
              .isLightCard=${caps.isLight}
              .allowSize=${caps.iconSize}
              .sizeMax=${caps.iconSizeMax}
              .allowColor=${!caps.iconColorless}
              .cardEntity=${entity}
              .hass=${this.hass}
              @state-changed=${(e: CustomEvent<IconColorModuleState>) =>
                this._emitChanged({ iconColor: e.detail })}
            ></cms-icon-color-module>`
          : nothing}

        ${mods.threshold
          ? html`<cms-threshold-module
              .overridden=${!!conflicts.threshold}
              .overriddenDetail=${(conflicts.threshold ?? []).join(", ")}
              .state=${s.threshold}
              .cardEntity=${entity}
              .cardType=${cardType}
              .cardConfig=${c}
              .tripletAccent=${caps.accentTriplet}
              .hass=${this.hass}
              @state-changed=${(e: CustomEvent<ThresholdModuleState>) =>
                this._emitChanged({ threshold: e.detail })}
            ></cms-threshold-module>`
          : nothing}

        ${mods.background
          ? html`<cms-background-module
              .cardEntity=${entity}
              .overridden=${!!conflicts.background}
              .overriddenDetail=${(conflicts.background ?? []).join(", ")}
              .thresholdOwned=${thresholdOwned.has('background')}
              .state=${s.background}
              .stateAware=${stateAware}
              .hass=${this.hass}
              @state-changed=${(e: CustomEvent<BackgroundModuleState>) =>
                this._emitChanged({ background: e.detail })}
            ></cms-background-module>`
          : nothing}

        ${mods.animation
          ? html`<cms-animation-module
              .cardEntity=${entity}
              .overridden=${!!conflicts.animation}
              .overriddenDetail=${(conflicts.animation ?? []).join(", ")}
              .state=${s.animation}
              .hiddenPresets=${caps.noAnimationPresets}
              .stateAware=${stateAware}
              .hass=${this.hass}
              @state-changed=${(e: CustomEvent<AnimationModuleState>) =>
                this._emitChanged({ animation: e.detail })}
            ></cms-animation-module>`
          : nothing}

        ${mods.border
          ? html`<cms-border-module
              .cardEntity=${entity}
              .overridden=${!!conflicts.border}
              .overriddenDetail=${(conflicts.border ?? []).join(", ")}
              .thresholdOwned=${thresholdOwned.has('border-color')}
              .state=${s.border}
              .stateAware=${stateAware}
              .hass=${this.hass}
              @state-changed=${(e: CustomEvent<BorderModuleState>) => this._emitChanged({ border: e.detail })}
            ></cms-border-module>`
          : nothing}

        ${caps.features
          ? html`<cms-features-module
              .state=${s.features ?? DEFAULT_FEATURES}
              .noFeatures=${!Array.isArray((c as unknown as { features?: unknown[] }).features) || !(c as unknown as { features: unknown[] }).features.length}
              .overridden=${!!conflicts.features}
              .overriddenDetail=${(conflicts.features ?? []).join(", ")}
              @state-changed=${(e: CustomEvent<FeaturesModuleState>) => this._emitChanged({ features: e.detail })}
            ></cms-features-module>`
          : nothing}

        <cms-advanced-module
          .state=${s.advanced}
          .pierced=${userEntries(s.dictSource)}
          .autoOpen=${hasUnrecognisedCss || userEntries(s.dictSource).length > 0}
          @state-changed=${(e: CustomEvent<AdvancedModuleState>) => this._emitChanged({ advanced: e.detail })}
        ></cms-advanced-module>

        ${isEntities
          ? html`<cms-entities-rows-module
              .hass=${this.hass}
              .rows=${(c as unknown as { entities?: EntitiesCardRow[] }).entities ?? []}
              .styles=${this._entityRowStyles}
              @styles-changed=${this._onRowStylesChanged}
            ></cms-entities-rows-module>`
          : nothing}
      </div>
    `;
  }
}

customElements.define('cms-child-card-section', CmsChildCardSection);

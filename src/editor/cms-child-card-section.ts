/**
 * cms-child-card-section — one collapsible styling section for a child card
 * inside a container (vertical-stack / horizontal-stack / grid).
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
 * Not handled here (v1 scope, noted inline in the UI):
 * - container children (a stack inside a stack) — no recursion yet;
 * - an entities-card child's per-ROW styling (the card-level modules work);
 * - mixed-form child styles (string + dict together) are preserved
 *   untouched, same as everywhere (pure dict-form IS editable — v0.10).
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
  ThresholdModuleState,
  AdvancedModuleState,
  HeadingStyleModuleState,
  FontModuleState,
  EntitiesCardRow,
  EntitiesRowStyles,
} from '../types/index.js';
import {
  buildMergedStudioState,
  applyStudioState,
  initEntityRowStyles,
  applyEntityRowStyles,
  refreshPaletteDefaults,
} from './studio-state.js';
import { PALETTE_CHANGED_EVENT } from '../utils/palette-storage.js';
import {
  CONTAINER_CARD_TYPES,
  NO_ANIMATION_TYPES,
  NO_BACKGROUND_TYPES,
  NO_BORDER_TYPES,
  NO_ICON_COLOR_TYPES,
  NO_FONT_TYPES,
  NO_THRESHOLD_TYPES,
  ICON_SIZE_TYPES,
  isStateAware,
} from '../utils/card-caps.js';
import { moduleStyles, onHeaderKeydown } from '../modules/module-base.js';
import { findAdvancedCssConflicts } from '../utils/style-conflicts.js';
import { thresholdOwnedProperties } from '../generator/css-generator.js';
import { hasDictFormStyle, hasUnsupportedDictRoot } from '../utils/style-compat.js';
import { ConfigEchoGuard } from '../utils/config-echo.js';

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

export class CmsChildCardSection extends LitElement {
  @property({ attribute: false }) childConfig?: CardModCardConfig;
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: Number }) index = 0;

  @state() private _studioState: StudioState | null = null;
  @state() private _entityRowStyles: EntitiesRowStyles = {};
  @state() private _open = false;
  /** See CmsPanel._loadedRawCss. */
  @state() private _loadedRawCss = false;

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

  override willUpdate(changed: Map<PropertyKey, unknown>) {
    if (changed.has('childConfig')) {
      if (!this.childConfig) {
        this._studioState = null;
        this._entityRowStyles = {};
        this._echoGuard.reset();
        return;
      }
      if (this._echoGuard.shouldRebuild(JSON.stringify(this.childConfig))) {
        this._studioState = buildMergedStudioState(this.childConfig, this.hass);
        this._loadedRawCss = !!this._studioState.advanced.rawCss.trim();
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
    if (this.childConfig.type === 'entities') {
      newChild = applyEntityRowStyles(newChild, this._entityRowStyles, this.hass);
    }
    this._echoGuard.noteEmitted(JSON.stringify(newChild));
    this.dispatchEvent(
      new CustomEvent<{ index: number; config: CardModCardConfig }>('child-config-changed', {
        detail: { index: this.index, config: newChild },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private get _isStyled(): boolean {
    return !!(this.childConfig?.card_mod?.style || this.childConfig?.uix?.style);
  }

  override render() {
    const c = this.childConfig;
    if (!c) return nothing;
    const label = `${this.index + 1}. ${c.type}`;
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
          <span class="module-chevron">${this._open ? '▼' : '▶'}</span>
          <span class="child-title">${label}</span>
          <span class="child-sub">${sub}</span>
          ${this._isStyled ? html`<span class="styled-dot" title="This card has styling"></span>` : nothing}
        </div>
        ${this._open ? this._renderBody() : nothing}
      </div>
    `;
  }

  private _renderBody() {
    const c = this.childConfig!;
    const s = this._studioState;
    if (!s) return nothing;

    if (CONTAINER_CARD_TYPES.has(c.type)) {
      return html`<div class="child-note">
        This child is itself a "${c.type}" container — open it as its own card
        (or edit its YAML) to style the cards inside it. Nested container
        styling isn't supported yet.
      </div>`;
    }

    // v0.10: dict-form child styles are editable when the parsed state
    // carries the dict (dictSource) — the `.` entry runs through the normal
    // module pipeline and every pierced entry is preserved verbatim on save.
    // Only the MIXED form (active string style + dict on the secondary key)
    // still freezes: there's no faithful single-key rewrite for it, so the
    // save path preserves both keys untouched (same gate as cms-panel).
    if (hasDictFormStyle(c) && !s.dictSource) {
      // Per-row styling stays editable, exactly like the top-level panel's
      // mixed-form gate (audit v0.10 #17).
      return html`<div class="child-note">
        ${hasUnsupportedDictRoot(c.card_mod?.style) || hasUnsupportedDictRoot(c.uix?.style)
          ? html`🔒 This child's dictionary-form ($ shadow-piercing) style has a
              <code>.</code> entry that isn't plain CSS, so the Studio can't
              rebuild it — it is preserved exactly as written.`
          : html`🔒 Mixed-form styling — this child has a dictionary-form
              ($ shadow-piercing) style and a different style on the other
              engine key. The Studio can't edit that combination, so it is
              preserved exactly as written.`}
      </div>${c.type === 'entities'
        ? html`<div class="child-body"><cms-entities-rows-module
            .hass=${this.hass}
            .rows=${(c as unknown as { entities?: EntitiesCardRow[] }).entities ?? []}
            .styles=${this._entityRowStyles}
            @styles-changed=${this._onRowStylesChanged}
          ></cms-entities-rows-module></div>`
        : nothing}`;
    }

    const cardType = c.type ?? '';
    const entity = (c.entity as string | undefined) ?? '';
    const stateAware = isStateAware(cardType, entity, this.hass);
    const showHeading = cardType === 'heading';
    const isEntities = cardType === 'entities';
    const hasUnrecognisedCss = this._loadedRawCss && !!s.advanced.rawCss.trim();
    const conflicts = findAdvancedCssConflicts(s.advanced.rawCss, s);
    const thresholdOwned = thresholdOwnedProperties(s.threshold);

    return html`
      <div class="child-body">
        ${showHeading
          ? html`<cms-heading-style-module
              .overridden=${!!conflicts.headingStyle}
              .overriddenDetail=${(conflicts.headingStyle ?? []).join(", ")}
              .state=${s.headingStyle}
              @state-changed=${(e: CustomEvent<HeadingStyleModuleState>) =>
                this._emitChanged({ headingStyle: e.detail })}
            ></cms-heading-style-module>`
          : nothing}

        ${!NO_FONT_TYPES.has(cardType)
          ? html`<cms-font-module
              .overridden=${!!conflicts.font}
              .overriddenDetail=${(conflicts.font ?? []).join(", ")}
              .state=${s.font}
              @state-changed=${(e: CustomEvent<FontModuleState>) => this._emitChanged({ font: e.detail })}
            ></cms-font-module>`
          : nothing}

        <cms-filter-module
          .overridden=${!!conflicts.filter}
          .overriddenDetail=${(conflicts.filter ?? []).join(", ")}
          .state=${s.filter}
          .stateAware=${stateAware}
          .hass=${this.hass}
          @state-changed=${(e: CustomEvent<FilterModuleState>) => this._emitChanged({ filter: e.detail })}
        ></cms-filter-module>

        ${!showHeading && !isEntities
          ? html`<cms-accent-color-module
              .overridden=${!!conflicts.accentColor}
              .overriddenDetail=${(conflicts.accentColor ?? []).join(", ")}
              .thresholdOwned=${thresholdOwned.has('accent-color')}
              .state=${s.accentColor}
              .stateAware=${stateAware}
              .cardEntity=${entity}
              .cardType=${cardType}
              .hass=${this.hass}
              @state-changed=${(e: CustomEvent<AccentColorModuleState>) =>
                this._emitChanged({ accentColor: e.detail })}
            ></cms-accent-color-module>`
          : nothing}

        ${!isEntities && !NO_ICON_COLOR_TYPES.has(cardType)
          ? html`<cms-icon-color-module
              .overridden=${!!conflicts.iconColor}
              .overriddenDetail=${(conflicts.iconColor ?? []).join(", ")}
              .thresholdOwned=${thresholdOwned.has('icon-color')}
              .state=${s.iconColor}
              .stateAware=${stateAware}
              .isLightCard=${cardType === 'light'}
              .allowSize=${ICON_SIZE_TYPES.has(cardType)}
              .cardEntity=${entity}
              .hass=${this.hass}
              @state-changed=${(e: CustomEvent<IconColorModuleState>) =>
                this._emitChanged({ iconColor: e.detail })}
            ></cms-icon-color-module>`
          : nothing}

        ${!isEntities && !NO_THRESHOLD_TYPES.has(cardType)
          ? html`<cms-threshold-module
              .overridden=${!!conflicts.threshold}
              .overriddenDetail=${(conflicts.threshold ?? []).join(", ")}
              .state=${s.threshold}
              .cardEntity=${entity}
              .cardType=${cardType}
              .hass=${this.hass}
              @state-changed=${(e: CustomEvent<ThresholdModuleState>) =>
                this._emitChanged({ threshold: e.detail })}
            ></cms-threshold-module>`
          : nothing}

        ${!NO_BACKGROUND_TYPES.has(cardType)
          ? html`<cms-background-module
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

        ${!NO_ANIMATION_TYPES.has(cardType)
          ? html`<cms-animation-module
              .overridden=${!!conflicts.animation}
              .overriddenDetail=${(conflicts.animation ?? []).join(", ")}
              .state=${s.animation}
              .stateAware=${stateAware}
              .hass=${this.hass}
              @state-changed=${(e: CustomEvent<AnimationModuleState>) =>
                this._emitChanged({ animation: e.detail })}
            ></cms-animation-module>`
          : nothing}

        ${!NO_BORDER_TYPES.has(cardType)
          ? html`<cms-border-module
              .overridden=${!!conflicts.border}
              .overriddenDetail=${(conflicts.border ?? []).join(", ")}
              .thresholdOwned=${thresholdOwned.has('border-color')}
              .state=${s.border}
              .stateAware=${stateAware}
              .hass=${this.hass}
              @state-changed=${(e: CustomEvent<BorderModuleState>) => this._emitChanged({ border: e.detail })}
            ></cms-border-module>`
          : nothing}

        <cms-advanced-module
          .state=${s.advanced}
          .pierced=${s.dictSource?.entries ?? []}
          .autoOpen=${hasUnrecognisedCss || (s.dictSource?.entries.length ?? 0) > 0}
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

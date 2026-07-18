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
 * - dict-form child styles are preserved untouched, same as everywhere.
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
import { buildMergedStudioState, applyStudioState, initEntityRowStyles, applyEntityRowStyles } from './studio-state.js';
import {
  CONTAINER_CARD_TYPES,
  NO_ANIMATION_TYPES,
  NO_BACKGROUND_TYPES,
  NO_BORDER_TYPES,
  NO_ICON_COLOR_TYPES,
  NO_FONT_TYPES,
  isStateAware,
} from '../utils/card-caps.js';
import { moduleStyles } from '../modules/module-base.js';
import { findAdvancedCssConflicts } from '../utils/style-conflicts.js';

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

  /** Mirror of cms-panel's _lastEmittedConfigJson dedup guard: when the
   *  panel reflects our own emitted child config back down, don't rebuild
   *  state mid-edit. */
  private _lastEmittedChildJson: string | null = null;

  static override styles = [
    moduleStyles,
    css`
      :host {
        display: block;
      }
      .child-section {
        border: 1px solid var(--divider-color, #383838);
        border-radius: 6px;
        margin-bottom: 8px;
        background: rgba(255, 255, 255, 0.02);
      }
      .child-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        cursor: pointer;
        user-select: none;
      }
      .child-title {
        font-weight: 600;
        font-size: 13px;
      }
      .child-sub {
        font-size: 11px;
        color: var(--secondary-text-color, #9e9e9e);
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
        background: var(--accent-color, #2196f3);
        flex-shrink: 0;
      }
      .child-body {
        padding: 4px 8px 8px;
        border-top: 1px solid var(--divider-color, #383838);
      }
      .child-note {
        font-size: 12px;
        color: var(--secondary-text-color, #9e9e9e);
        padding: 8px 12px;
      }
    `,
  ];

  override willUpdate(changed: Map<PropertyKey, unknown>) {
    if (changed.has('childConfig')) {
      if (!this.childConfig) {
        this._studioState = null;
        this._entityRowStyles = {};
        this._lastEmittedChildJson = null;
        return;
      }
      const json = JSON.stringify(this.childConfig);
      if (json !== this._lastEmittedChildJson) {
        this._studioState = buildMergedStudioState(this.childConfig, this.hass);
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
    this._lastEmittedChildJson = JSON.stringify(newChild);
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
        <div class="child-header" @click=${() => (this._open = !this._open)}>
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

    const cardType = c.type ?? '';
    const entity = (c.entity as string | undefined) ?? '';
    const stateAware = isStateAware(cardType, entity, this.hass);
    const showHeading = cardType === 'heading';
    const isEntities = cardType === 'entities';
    const hasUnrecognisedCss = !!s.advanced.rawCss.trim();
    const conflicts = findAdvancedCssConflicts(s.advanced.rawCss, s);

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
              .state=${s.iconColor}
              .stateAware=${stateAware}
              .isLightCard=${cardType === 'light'}
              .cardEntity=${entity}
              .hass=${this.hass}
              @state-changed=${(e: CustomEvent<IconColorModuleState>) =>
                this._emitChanged({ iconColor: e.detail })}
            ></cms-icon-color-module>`
          : nothing}

        ${!isEntities
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
              .state=${s.border}
              @state-changed=${(e: CustomEvent<BorderModuleState>) => this._emitChanged({ border: e.detail })}
            ></cms-border-module>`
          : nothing}

        <cms-advanced-module
          .state=${s.advanced}
          ?open=${hasUnrecognisedCss}
          @state-changed=${(e: CustomEvent<AdvancedModuleState>) => this._emitChanged({ advanced: e.detail })}
        ></cms-advanced-module>

        ${isEntities
          ? html`<cms-entities-rows-module
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

import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { IconColorModuleState, HomeAssistant } from '../types/index.js';
import { DEFAULT_ICON_COLOR } from '../parser/state-mapper.js';
import { colorDefaults } from '../utils/palette-storage.js';
import { hasOwnEntity, stateKindFor, type OwnStateKind } from '../utils/card-caps.js';
import {
  moduleStyles,
  renderOverrideHint,
  renderThresholdOwnedHint,
  renderWatchHint,
  renderCondition,
  renderModuleHeader,
  guardSliderTouch, nameSwitches, prepareSliders,
} from './module-base.js';
import '../components/cms-color-picker.js';
import '../components/cms-entity-picker.js';
import { TOGGLE_DOMAINS } from '../components/cms-entity-picker.js';
import { LangController, t } from '../i18n/index.js';

/** True once the user (or the loaded style) has made a colour choice — a mode
 *  other than the factory one, a watched entity, or colours off the defaults
 *  (palette overrides count as defaults). */
function hasColourIntent(s: IconColorModuleState): boolean {
  const { onColor, offColor } = colorDefaults();
  return (
    s.mode !== DEFAULT_ICON_COLOR.mode ||
    !!s.entityId ||
    s.color !== s.colorOn ||
    s.colorOn !== (onColor || DEFAULT_ICON_COLOR.colorOn) ||
    s.colorOff !== (offColor || DEFAULT_ICON_COLOR.colorOff)
  );
}

/**
 * What switching the module on writes. A card with an Icon size control starts
 * in "Keep the card's colour" (no colour written — the size is the point); an
 * entity-less card has nothing for ON / OFF to watch, so its colour starts
 * fixed; so does one whose entity can't be ON (sensor, lock, cover, climate…),
 * where ON / OFF would show the OFF colour in every state. A module the user
 * already configured keeps its mode.
 */
export function enableChanges(
  s: IconColorModuleState,
  allowSize: boolean,
  hasEntity: boolean,
  kind: OwnStateKind = 'on-off',
): Partial<IconColorModuleState> {
  if (hasColourIntent(s)) return { enabled: true };
  if (allowSize) return { enabled: true, mode: 'none' };
  if (!hasEntity || kind !== 'on-off') return { enabled: true, mode: 'plain' };
  return { enabled: true };
}

export class IconColorModule extends LitElement {
  protected readonly i18n = new LangController(this);
  @property({ attribute: false }) state: IconColorModuleState = {
    ...DEFAULT_ICON_COLOR,
  };

  /** When false the card has no binary entity state (e.g. sensor cards). */
  @property({ type: Boolean, attribute: 'state-aware' }) stateAware = true;
  /** When true a third "Light color" mode is offered that reads rgb_color attribute. */
  @property({ type: Boolean, attribute: 'is-light-card' }) isLightCard = false;
  /** When true the icon-size controls are offered (ICON_SIZE_TYPES only —
   *  the size variables are dead or harmful elsewhere, see card-caps.ts). */
  @property({ type: Boolean, attribute: 'allow-size' }) allowSize = false;
  /** The Icon size slider's top end (capsFor(card).iconSizeMax). */
  @property({ type: Number, attribute: 'size-max' }) sizeMax = 64;
  /** False when the card's icons can't take a colour (Mushroom chips): the
   *  module is then a size-only control. */
  @property({ type: Boolean, attribute: 'allow-color' }) allowColor = true;
  /** The card's own entity — used as the picker's placeholder and as the implicit default when entityId is unset. */
  @property({ type: String }) cardEntity = '';

  @property({ attribute: false }) hass?: HomeAssistant;

  /** True when Advanced CSS overrides this module's output — shows the
   *  warning badge/hint (computed by the panel via style-conflicts.ts). */
  @property({ attribute: false }) overridden = false;
  @property({ attribute: false }) overriddenDetail = '';
  /** v1.0: offer "Let this module take over" (plain Advanced CSS only). */
  @property({ attribute: false }) takeOver = false;
  /** Threshold Colors is currently writing this module's property. */
  @property({ attribute: false }) thresholdOwned = false;

  @state() private _open = false;

  static override styles = [moduleStyles];

  override firstUpdated() {
    this._open = this.state.enabled;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    nameSwitches(this.renderRoot);
    prepareSliders(this.renderRoot);
    if (changed.has('state')) {
      const prev = changed.get('state') as IconColorModuleState | undefined;
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
    }
  }

  private _toggleOpen() {
    this._open = !this._open;
  }

  private _emit(changes: Partial<IconColorModuleState>) {
    const detail = { ...this.state, ...changes };
    this.dispatchEvent(
      new CustomEvent<IconColorModuleState>('state-changed', { detail }),
    );
  }

  override connectedCallback() {
    super.connectedCallback();
    guardSliderTouch(this.renderRoot);
  }

  override render() {
    return html`
      <div class="module">
        ${renderModuleHeader({
          icon: '🎨',
          title: t('icon.title'),
          open: this._open,
          onToggle: () => this._toggleOpen(),
          overridden: this.overridden,
          enable: {
            checked: this.state.enabled,
            onChange: (on) =>
              this._emit(
                on
                  ? enableChanges(
                      this.state,
                      this.allowSize,
                      hasOwnEntity({ entity: this.cardEntity }),
                      stateKindFor(this.stateAware, this.cardEntity),
                    )
                  : { enabled: false },
              ),
          },
        })}
        ${this._open ? this._renderBody() : nothing}
      </div>
    `;
  }

  private _renderBody() {
    if (!this.allowColor) {
      return html`
        <div class="module-body" id="module-body">
          ${renderOverrideHint(this.overridden, this.overriddenDetail, this.takeOver ? 'iconColor' : undefined)}
          <div class="when-hint">${t('icon.sizeOnly')}</div>
          ${this.allowSize ? this._renderSize() : nothing}
        </div>
      `;
    }
    const mode = this.state.mode;
    // A card that offers no size can't use 'none' — but a stored one (preset)
    // still shows as itself rather than a blank select.
    const offerNone = this.allowSize || mode === 'none';
    const watches = mode === 'conditional' || mode === 'light';
    // Only relevant while the colour watches an entity: does falling back to the card's
    // own entity (an empty "Controlled by" field) actually mean anything?
    // Not for a card whose own entity has no on/off state (e.g. a `button`)
    // unless a different, toggleable entity is picked below.
    const kind = stateKindFor(this.stateAware, this.cardEntity);

    return html`
      <div class="module-body" id="module-body">
        ${renderOverrideHint(this.overridden, this.overriddenDetail, this.takeOver ? 'iconColor' : undefined)}
        ${renderThresholdOwnedHint(this.thresholdOwned, 'noun.iconColor', 'threshold.prop.iconColor')}
        <div class="control-row">
          <span class="control-label" id="lbl-color-mode">${t('accent.colorMode')}</span>
          <div class="control-right">
            <select
              aria-labelledby="lbl-color-mode"
              .value=${mode}
              @change=${(e: Event) =>
                this._emit({
                  mode: (e.target as HTMLSelectElement).value as
                    | 'plain'
                    | 'conditional'
                    | 'light'
                    | 'none',
                })}
            >
              ${offerNone
                ? html`<option value="none" ?selected=${mode === 'none'}>
                    ${t('icon.keep')}
                  </option>`
                : nothing}
              <option value="plain" ?selected=${mode === 'plain'}>
                ${t('accent.oneFixed')}
              </option>
              <option value="conditional" ?selected=${mode === 'conditional'}>
                ${t('accent.onOff')}
              </option>
              ${this.isLightCard || mode === 'light'
                ? html`<option value="light" ?selected=${mode === 'light'}>
                    ${t('icon.matchLight')}
                  </option>`
                : nothing}
            </select>
          </div>
        </div>
        <div class="when-hint">
          ${mode === 'none'
            ? this.allowSize
              ? t('icon.hintKeepSize')
              : t('icon.hintKeep')
            : mode === 'plain'
            ? t('accent.hintPlain')
            : mode === 'light'
            ? t('icon.hintLight')
            : t('accent.hintOnOff')}
        </div>
        ${watches
          ? html`
              <div class="control-row">
                <span class="control-label">${t('accent.controlledBy')}</span>
                <div class="control-right">
                  <cms-entity-picker
                    .hass=${this.hass}
                    .value=${this.state.entityId ?? ''}
                    .includeDomains=${mode === 'light' ? ['light'] : TOGGLE_DOMAINS}
                    .placeholder=${this.stateAware ? this.cardEntity : 'binary_sensor.example'}
                    label=""
                    accessible-name=${t('base.entityToWatch')}
                    @value-changed=${(e: CustomEvent<{ value: string }>) =>
                      this._emit({ entityId: e.detail.value.trim() })}
                  ></cms-entity-picker>
                </div>
              </div>
              ${renderWatchHint({ entityId: this.state.entityId, cardEntity: this.cardEntity, kind })}
            `
          : nothing}

        ${mode === 'none'
          ? nothing
          : mode === 'plain'
          ? html`
              <div class="control-row">
                <span class="control-label">${t('accent.color')}</span>
                <div class="control-right">
                  <cms-color-picker
                    label=${t('icon.iconColor')}
                    .value=${this.state.color}
                    @color-changed=${(e: CustomEvent) =>
                      this._emit({ color: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
            `
          : mode === 'light'
          ? html`
              <div class="control-row">
                <span class="control-label">${t('accent.colorOff')}</span>
                <div class="control-right">
                  <cms-color-picker
                    label=${t('icon.iconColorOff')}
                    .value=${this.state.colorOff}
                    @color-changed=${(e: CustomEvent) =>
                      this._emit({ colorOff: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
              <div class="when-hint">${t('icon.lightOn')}</div>
            `
          : html`
              <div class="control-row">
                <span class="control-label">${t('accent.colorOn')}</span>
                <div class="control-right">
                  <cms-color-picker
                    label=${t('icon.iconColorOn')}
                    .value=${this.state.colorOn}
                    @color-changed=${(e: CustomEvent) =>
                      this._emit({ colorOn: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
              <div class="control-row">
                <span class="control-label">${t('accent.colorOff')}</span>
                <div class="control-right">
                  <cms-color-picker
                    label=${t('icon.iconColorOff')}
                    .value=${this.state.colorOff}
                    @color-changed=${(e: CustomEvent) =>
                      this._emit({ colorOff: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
            `}
        ${this.allowSize ? this._renderSize() : nothing}
      </div>
    `;
  }

  /** Icon size (v0.9) — 0 = leave the theme size alone; with a condition,
   *  the size switches between "Icon size" and "Size otherwise" (24px = the
   *  HA default when unset). */
  private _renderSize() {
    const sizePx = this.state.sizePx ?? 0;
    return html`
      <div class="control-row">
        <span class="control-label">${t('icon.size')}</span>
        <div class="control-right">
          <ha-slider
            label=${t('icon.size')}
            aria-label=${t('icon.size')}
            min="0"
            max=${Math.max(this.sizeMax, sizePx)}
            step="2"
            .value=${String(sizePx)}
            @change=${(e: Event) => {
              const v = parseFloat((e.target as HTMLInputElement).value);
              this._emit(
                v > 0
                  ? { sizePx: v }
                  : { sizePx: undefined, sizeOffPx: undefined, sizeWhen: undefined },
              );
            }}
          ></ha-slider>
          <span class="value-label">${sizePx > 0 ? `${sizePx}px` : t('icon.theme')}</span>
        </div>
      </div>
      ${sizePx > 0
        ? html`
            ${renderCondition({
              condition: this.state.sizeWhen,
              stateAware: this.stateAware,
              noun: 'noun.iconSize',
              hass: this.hass,
              onChange: (c) => this._emit({ sizeWhen: c }),
            })}
            ${this.state.sizeWhen && this.state.sizeWhen.when !== 'always'
              ? html`
                  <div class="control-row">
                    <span class="control-label">${t('icon.sizeOtherwise')}</span>
                    <div class="control-right">
                      <ha-slider
                        label=${t('icon.sizeOtherwise')}
                        aria-label=${t('icon.sizeOtherwise')}
                        min="16"
                        max=${Math.max(this.sizeMax, this.state.sizeOffPx ?? 0)}
                        step="2"
                        .value=${String(this.state.sizeOffPx ?? 24)}
                        @change=${(e: Event) =>
                          this._emit({
                            sizeOffPx: parseFloat((e.target as HTMLInputElement).value),
                          })}
                      ></ha-slider>
                      <span class="value-label">${this.state.sizeOffPx ?? 24}px</span>
                    </div>
                  </div>
                `
              : nothing}
          `
        : nothing}
    `;
  }
}

customElements.define('cms-icon-color-module', IconColorModule);

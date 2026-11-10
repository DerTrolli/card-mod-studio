import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { IconColorModuleState, HomeAssistant } from '../types/index.js';
import { DEFAULT_ICON_COLOR } from '../parser/state-mapper.js';
import { getCachedPalette } from '../utils/palette-storage.js';
import { hasOwnEntity, stateKindFor, type OwnStateKind } from '../utils/card-caps.js';
import {
  moduleStyles,
  renderOverrideBadge,
  renderOverrideHint,
  renderThresholdOwnedHint,
  renderWatchHint,
  renderCondition,
  onHeaderKeydown,
} from './module-base.js';
import '../components/cms-color-picker.js';
import '../components/cms-entity-picker.js';
import { TOGGLE_DOMAINS } from '../components/cms-entity-picker.js';

/** True once the user (or the loaded style) has made a colour choice — a mode
 *  other than the factory one, a watched entity, or colours off the defaults
 *  (palette overrides count as defaults). */
function hasColourIntent(s: IconColorModuleState): boolean {
  const { onColor, offColor } = getCachedPalette().defaults;
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
  /** Threshold Colors is currently writing this module's property. */
  @property({ attribute: false }) thresholdOwned = false;

  @state() private _open = false;

  static override styles = [moduleStyles];

  override firstUpdated() {
    this._open = this.state.enabled;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
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

  override render() {
    return html`
      <div class="module">
        <div
          class="module-header"
          role="button"
          tabindex="0"
          aria-expanded=${this._open ? 'true' : 'false'}
          @click=${this._toggleOpen}
          @keydown=${onHeaderKeydown}
        >
          <span class="module-chevron">${this._open ? '▼' : '▶'}</span>
          <span class="module-title">🎨 Icon Color</span>
          ${renderOverrideBadge(this.overridden)}
          <ha-switch
            .checked=${this.state.enabled}
            @click=${(e: Event) => e.stopPropagation()}
            @change=${(e: Event) =>
              this._emit(
                (e.target as HTMLInputElement).checked
                  ? enableChanges(
                      this.state,
                      this.allowSize,
                      hasOwnEntity({ entity: this.cardEntity }),
                      stateKindFor(this.stateAware, this.cardEntity),
                    )
                  : { enabled: false },
              )}
          ></ha-switch>
        </div>
        ${this._open ? this._renderBody() : nothing}
      </div>
    `;
  }

  private _renderBody() {
    if (!this.allowColor) {
      return html`
        <div class="module-body">
          ${renderOverrideHint(this.overridden, this.overriddenDetail)}
          <div class="when-hint">This card's icons can't take a colour from a style — only their size.</div>
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
      <div class="module-body">
        ${renderOverrideHint(this.overridden, this.overriddenDetail)}
        ${renderThresholdOwnedHint(this.thresholdOwned, 'icon color', 'Icon Color')}
        <div class="control-row">
          <span class="control-label">Color mode</span>
          <div class="control-right">
            <select
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
                    Keep the card's colour
                  </option>`
                : nothing}
              <option value="plain" ?selected=${mode === 'plain'}>
                One fixed color
              </option>
              <option value="conditional" ?selected=${mode === 'conditional'}>
                Different for ON / OFF
              </option>
              ${this.isLightCard || mode === 'light'
                ? html`<option value="light" ?selected=${mode === 'light'}>
                    Match the light's color
                  </option>`
                : nothing}
            </select>
          </div>
        </div>
        <div class="when-hint">
          ${mode === 'none'
            ? this.allowSize
              ? "The card's own icon colour stays as it is — only the size below changes."
              : "The card's own icon colour stays as it is — this mode writes no colour."
            : mode === 'plain'
            ? 'One color, shown all the time.'
            : mode === 'light'
            ? "Uses the light's real color while on; your chosen color while off."
            : 'One color while the controlling entity is on, another while off.'}
        </div>
        ${watches
          ? html`
              <div class="control-row">
                <span class="control-label">Controlled by</span>
                <div class="control-right">
                  <cms-entity-picker
                    .hass=${this.hass}
                    .value=${this.state.entityId ?? ''}
                    .includeDomains=${mode === 'light' ? ['light'] : TOGGLE_DOMAINS}
                    .placeholder=${this.stateAware ? this.cardEntity : 'binary_sensor.example'}
                    label=""
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
                <span class="control-label">Color</span>
                <div class="control-right">
                  <cms-color-picker
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
                <span class="control-label">Color when OFF</span>
                <div class="control-right">
                  <cms-color-picker
                    .value=${this.state.colorOff}
                    @color-changed=${(e: CustomEvent) =>
                      this._emit({ colorOff: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
              <div class="when-hint">When ON: uses the light's actual color automatically.</div>
            `
          : html`
              <div class="control-row">
                <span class="control-label">Color when ON</span>
                <div class="control-right">
                  <cms-color-picker
                    .value=${this.state.colorOn}
                    @color-changed=${(e: CustomEvent) =>
                      this._emit({ colorOn: e.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
              <div class="control-row">
                <span class="control-label">Color when OFF</span>
                <div class="control-right">
                  <cms-color-picker
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
        <span class="control-label">Icon size</span>
        <div class="control-right">
          <ha-slider
            min="0"
            max="64"
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
          <span class="value-label">${sizePx > 0 ? `${sizePx}px` : 'theme'}</span>
        </div>
      </div>
      ${sizePx > 0
        ? html`
            ${renderCondition({
              condition: this.state.sizeWhen,
              stateAware: this.stateAware,
              noun: 'icon size',
              hass: this.hass,
              onChange: (c) => this._emit({ sizeWhen: c }),
            })}
            ${this.state.sizeWhen && this.state.sizeWhen.when !== 'always'
              ? html`
                  <div class="control-row">
                    <span class="control-label">Size otherwise</span>
                    <div class="control-right">
                      <ha-slider
                        min="16"
                        max="64"
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

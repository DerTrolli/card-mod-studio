/**
 * cms-entity-picker.ts
 *
 * Thin wrapper around HA's own `<ha-entity-picker>` — the searchable,
 * autocompleting entity selector every native HA card editor uses. HA
 * registers it globally on the custom element registry before Card-Mod
 * Studio ever runs (we're injected into the already-loaded frontend), so no
 * import is needed — same convention this project already uses for
 * `<ha-switch>` / `<ha-slider>`.
 *
 * Falls back to a plain text input when `hass` isn't available yet (e.g. a
 * brief window during panel init, or a standalone test harness) so nothing
 * crashes — `ha-entity-picker` requires `.hass` to function at all.
 */
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { HomeAssistant } from '../types/index.js';

/**
 * Domains whose entities genuinely carry an on/off state that
 * `is_state(x, 'on')` can test — the filter every "controlled by" picker in
 * an on/off-conditional module uses, so the list doesn't offer entities
 * (temperature sensors, weather, ...) that would silently never match.
 * Intentionally NOT applied to value-based pickers (Threshold reads
 * numbers, not on/off).
 */
export const TOGGLE_DOMAINS = [
  'binary_sensor',
  'switch',
  'light',
  'input_boolean',
  'fan',
  'humidifier',
  'siren',
  'remote',
];

@customElement('cms-entity-picker')
export class CmsEntityPicker extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property() value = '';
  @property() label = 'Entity';
  /** Shown as the fallback input's placeholder, and as ha-entity-picker's default-entity hint. */
  @property() placeholder = '';
  /** Restricts ha-entity-picker's list to these domains (e.g. TOGGLE_DOMAINS
   *  for on/off bindings). Undefined = unfiltered. Typing a custom entity_id
   *  outside the filter is still allowed (allowCustomEntity), so an unusual
   *  but working setup isn't blocked — the filter shapes the list, not the value. */
  @property({ attribute: false }) includeDomains?: string[];

  static override styles = css`
    :host {
      display: block;
      flex: 1;
      min-width: 0;
    }
    ha-entity-picker {
      width: 100%;
    }
    .fallback-input {
      width: 100%;
      box-sizing: border-box;
      background: var(--card-background-color, #1c1c1c);
      color: var(--primary-text-color, #e1e1e1);
      border: 1px solid var(--divider-color, #383838);
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 12px;
      font-family: monospace;
    }
  `;

  private _emit(value: string) {
    this.dispatchEvent(
      new CustomEvent<{ value: string }>('value-changed', { detail: { value } }),
    );
  }

  override render() {
    if (this.hass) {
      return html`
        <ha-entity-picker
          .hass=${this.hass}
          .value=${this.value}
          .label=${this.label}
          .includeDomains=${this.includeDomains}
          .allowCustomEntity=${true}
          @value-changed=${(e: CustomEvent<{ value?: string }>) => {
            e.stopPropagation();
            this._emit(e.detail.value ?? '');
          }}
        ></ha-entity-picker>
      `;
    }

    return html`
      <input
        class="fallback-input"
        type="text"
        .value=${this.value}
        placeholder=${this.placeholder || 'sensor.example'}
        @change=${(e: Event) => this._emit((e.target as HTMLInputElement).value.trim())}
      />
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cms-entity-picker': CmsEntityPicker;
  }
}

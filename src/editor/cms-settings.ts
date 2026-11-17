/**
 * cms-settings — the Studio's own settings (a collapsible section like My
 * Color Palette), and cms-language-notice — the one-time question which
 * language the Studio should use.
 *
 * Language: "Auto-detect" (recommended) follows the language Home Assistant
 * shows for this user; otherwise one of the shipped languages. Stored per
 * Home Assistant user (settings-storage.ts), so it is asked once, not once
 * per device. The notice is inline and takes no focus: nothing is blocked
 * while it is open, and closing it keeps Auto-detect.
 */
import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { HomeAssistant } from '../types/index.js';
import { moduleStyles, onHeaderKeydown } from '../modules/module-base.js';
import {
  LANGUAGES,
  LangController,
  autoLanguage,
  getLanguageSetting,
  isLanguageSetting,
  t,
  type LanguageCode,
  type LanguageSetting,
} from '../i18n/index.js';
import { getSettings, initSettings, updateSettings, SETTINGS_CHANGED_EVENT } from '../utils/settings-storage.js';

/** The language select both views share. */
function renderLanguageSelect(id: string, value: LanguageSetting, onChange: (v: LanguageSetting) => void) {
  const auto = autoLanguage();
  const haName = auto.haLanguage ? LANGUAGES[auto.code].name : undefined;
  return html`<select
    id=${id}
    .value=${value}
    @change=${(e: Event) => {
      const v = (e.target as HTMLSelectElement).value;
      if (isLanguageSetting(v)) onChange(v);
    }}
  >
    <option value="auto" ?selected=${value === 'auto'}>
      ${haName ? t('settings.autoWith', { language: haName }) : t('settings.auto')}
    </option>
    ${(Object.keys(LANGUAGES) as LanguageCode[]).map(
      (code) => html`<option value=${code} ?selected=${value === code}>${LANGUAGES[code].name}</option>`,
    )}
  </select>`;
}

/** Re-renders on settings changes made elsewhere (another panel, a reload of HA's copy). */
abstract class SettingsView extends LitElement {
  protected readonly i18n = new LangController(this);
  @property({ attribute: false }) hass?: HomeAssistant;

  private _onSettings = () => this.requestUpdate();

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener(SETTINGS_CHANGED_EVENT, this._onSettings);
    void initSettings(this.hass);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener(SETTINGS_CHANGED_EVENT, this._onSettings);
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('hass') && this.hass) void initSettings(this.hass);
  }
}

export class CmsSettings extends SettingsView {
  @state() private _open = false;

  static override styles = [
    moduleStyles,
    css`
      .module-body select {
        width: 100%;
      }
    `,
  ];

  override render() {
    return html`
      <div class="module">
        <div
          class="module-header"
          role="button"
          tabindex="0"
          aria-expanded=${this._open ? 'true' : 'false'}
          @click=${() => (this._open = !this._open)}
          @keydown=${onHeaderKeydown}
        >
          <span class="module-chevron" aria-hidden="true">${this._open ? '▼' : '▶'}</span>
          <span class="module-title"><span aria-hidden="true">⚙️</span> ${t('settings.title')}</span>
        </div>
        ${this._open
          ? html`<div class="module-body">
              <div class="control-row">
                <label class="control-label" for="cms-language">${t('settings.language')}</label>
                <div class="control-right">
                  ${renderLanguageSelect('cms-language', getLanguageSetting(), (language) =>
                    void updateSettings({ language, languageChosen: true }, this.hass),
                  )}
                </div>
              </div>
              <div class="when-hint">${t('settings.languageHint')}</div>
            </div>`
          : nothing}
      </div>
    `;
  }
}

export class CmsLanguageNotice extends SettingsView {
  /** The choice shown in the select before OK (starts at the stored one). */
  @state() private _pick?: LanguageSetting;

  static override styles = [
    moduleStyles,
    css`
      :host {
        display: block;
      }
      .notice {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 10px;
        padding: 8px 12px;
        background: var(--cms-tint-primary);
        border: 1px solid var(--cms-line-primary);
        border-radius: 8px;
        margin-bottom: 12px;
      }
      .notice .text {
        flex: 1 1 220px;
      }
      .notice select {
        flex: 1 1 160px;
        min-width: 0;
      }
    `,
  ];

  override render() {
    if (getSettings().languageChosen) return nothing;
    const pick = this._pick ?? getLanguageSetting();
    return html`<div class="notice" role="region" aria-label=${t('settings.noticeLabel')}>
      <span class="text"><span aria-hidden="true">🌐</span> ${t('settings.noticeText')}</span>
      ${renderLanguageSelect('cms-language-notice', pick, (v) => {
        this._pick = v;
      })}
      <button class="btn-add" @click=${() => void updateSettings({ language: pick, languageChosen: true }, this.hass)}>
        ${t('settings.ok')}
      </button>
    </div>`;
  }
}

customElements.define('cms-settings', CmsSettings);
customElements.define('cms-language-notice', CmsLanguageNotice);

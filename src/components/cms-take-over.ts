/**
 * cms-take-over — "Let this module take over" in a module's override hint
 * (v1.0). Shows what it would remove before removing anything: the first
 * click lists the hand-written declarations, the second fires `take-over`
 * ({ module }), which the panel (or a child section) answers by removing
 * exactly those from Advanced CSS (style-conflicts.ts →
 * removeAdvancedCssConflicts). Cancel, Escape or leaving puts it back.
 */
import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { LangController, t, tParts } from '../i18n/index.js';

export class CmsTakeOver extends LitElement {
  /** The module (ConflictableModule) the event names. */
  @property({ type: String }) module = '';
  /** What would be removed, as the hint shows it ("ha-card { background }"). */
  @property({ type: String }) detail = '';
  @state() private _armed = false;

  protected readonly i18n = new LangController(this);

  static override styles = css`
    :host {
      display: block;
      margin-top: 6px;
    }
    button {
      font: inherit;
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 4px;
      cursor: pointer;
      border: 1px solid var(--warning-color, #ffa600);
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color, #212121);
      margin-right: 6px;
    }
    button.go {
      background: var(--warning-color, #ffa600);
      color: #000;
    }
    code {
      font-size: 11px;
    }
    .confirm {
      margin-bottom: 6px;
    }
  `;

  override render() {
    if (!this._armed) {
      return html`<button type="button" @click=${() => (this._armed = true)}>${t('base.takeOver')}</button>`;
    }
    return html`<div @keydown=${(e: KeyboardEvent) => {
        if (e.key === 'Escape') { e.stopPropagation(); this._armed = false; }
      }}>
      <div class="confirm" role="status">${tParts('base.takeOverConfirm', { what: html`<code>${this.detail}</code>` })}</div>
      <button type="button" class="go" @click=${this._fire}>${t('base.takeOverRemove')}</button>
      <button type="button" @click=${() => (this._armed = false)}>${t('preset.cancel')}</button>
    </div>`;
  }

  override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('_armed') && this._armed) this.renderRoot.querySelector<HTMLButtonElement>('button.go')?.focus();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._armed = false;
  }

  private _fire() {
    this._armed = false;
    this.dispatchEvent(new CustomEvent('take-over', { detail: { module: this.module }, bubbles: true, composed: true }));
  }
}

if (!customElements.get('cms-take-over')) customElements.define('cms-take-over', CmsTakeOver);
void nothing;

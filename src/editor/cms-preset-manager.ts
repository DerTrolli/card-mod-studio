/**
 * cms-preset-manager — "My Presets": rename, reorder, duplicate and delete
 * the stored presets, and share styles as text (v1.0).
 *
 * Share: "Copy this card's style" / "Copy all presets" put a small JSON text
 * (style-transfer.ts) on the clipboard — or, where the browser doesn't allow
 * that (Home Assistant over plain http), into a field to copy by hand. "Paste"
 * takes such a text: a style is applied to this card, presets are added (a
 * name that exists gets " (2)").
 *
 * The panel owns the preset list (it loads and writes it); this view gets it
 * as a property and asks for changes with events:
 *   preset-change  { change: PresetChange }  — one stored-list change
 *   style-paste    { state: StudioState }    — apply to this card
 */
import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { StudioState } from '../types/index.js';
import type { PresetChange, StylePreset } from '../utils/preset-storage.js';
import { exportPresets, exportStyle, parseTransfer, uniqueNames, TRANSFER_NAME_MAX } from '../utils/style-transfer.js';
import { moduleStyles, renderIcon, renderStaticHeader } from '../modules/module-base.js';
import { ArmGuard } from '../utils/arm-guard.js';
import { LangController, t } from '../i18n/index.js';

export class CmsPresetManager extends LitElement {
  protected readonly i18n = new LangController(this);
  @property({ attribute: false }) presets: StylePreset[] = [];
  /** The card's current style (what "Copy this card's style" copies). */
  @property({ attribute: false }) cardState?: StudioState;

  /** The preset whose delete button is armed. */
  @state() private _armed: string | null = null;
  /** A rename that was refused, and why (shown under the list). */
  @state() private _renameError = '';
  /** Text to copy (after a Copy button), and what it holds. */
  @state() private _exportText = '';
  @state() private _exportNote = '';
  @state() private _pasteText = '';
  @state() private _pasteNote = '';
  @state() private _pasteOk = false;

  private _armGuard = new ArmGuard(() => {
    this._armed = null;
  });

  static override styles = [
    moduleStyles,
    css`
      .preset-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
      }
      .preset-row input {
        flex: 1 1 auto;
        min-width: 0;
      }
      .icon-btn,
      .del-btn,
      .share-btn {
        flex-shrink: 0;
        min-width: 30px;
        min-height: 30px;
        padding: 2px 8px;
        cursor: pointer;
        border-radius: 4px;
        font-size: 13px;
        line-height: 1;
        background: var(--cms-fill);
        color: var(--primary-text-color, #212121);
        border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      }
      .icon-btn:hover:not([disabled]),
      .share-btn:hover {
        background: var(--cms-fill-hover);
      }
      .icon-btn[disabled] {
        opacity: 0.4;
        cursor: default;
      }
      .del-btn {
        background: var(--cms-tint-error);
        border-color: var(--cms-line-error);
        color: var(--cms-ink-error);
      }
      .del-btn.armed {
        font-size: 12px;
        font-weight: 600;
      }
      .share-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 6px;
      }
      .share-btn {
        font-size: 12px;
        padding: 6px 10px;
      }
      textarea {
        width: 100%;
        box-sizing: border-box;
        min-height: 90px;
        font-family: var(--code-font-family, monospace);
        font-size: 11px;
        resize: vertical;
        margin-bottom: 6px;
        background: var(--cms-field);
        color: var(--primary-text-color, #212121);
        border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
        border-radius: 4px;
        padding: 6px;
      }
      .section-label {
        font-size: 11px;
        color: var(--secondary-text-color, #727272);
        margin: 10px 0 6px;
        display: block;
      }
      .hint,
      .header-summary {
        font-size: 11px;
        color: var(--secondary-text-color, #727272);
      }
      .hint {
        margin: 4px 0 6px;
      }
      .note-error {
        color: var(--cms-ink-error);
      }
      .note-ok {
        color: var(--cms-ink-primary);
      }
      @media (pointer: coarse) {
        .icon-btn,
        .del-btn,
        .share-btn {
          min-width: 36px;
          min-height: 36px;
        }
      }
    `,
  ];

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._armGuard.stop();
  }

  private _change(change: PresetChange) {
    this.dispatchEvent(new CustomEvent('preset-change', { detail: { change }, bubbles: true, composed: true }));
  }

  private _rename(from: string, input: HTMLInputElement) {
    const to = input.value.trim().slice(0, TRANSFER_NAME_MAX);
    if (!to || to === from) {
      input.value = from;
      this._renameError = to ? '' : t('presets.renameEmpty');
      return;
    }
    if (this.presets.some((p) => p.name === to)) {
      input.value = from;
      this._renameError = t('presets.renameTaken', { name: to });
      return;
    }
    this._renameError = '';
    this._change({ kind: 'rename', from, to });
  }

  private _move(name: string, index: number) {
    this._change({ kind: 'move', name, index });
    // keep the keyboard on the same preset's button after the re-render
    void this.updateComplete.then(() => {
      const row = this.shadowRoot?.querySelector(`.preset-row[data-name="${CSS.escape(name)}"]`);
      (row?.querySelector('.icon-btn:not([disabled])') as HTMLElement | null)?.focus();
    });
  }

  private _duplicate(p: StylePreset, index: number) {
    const [copy] = uniqueNames([{ name: t('presets.copyName', { name: p.name }).slice(0, TRANSFER_NAME_MAX), state: p.state }], this.presets.map((x) => x.name));
    this._change({ kind: 'save', preset: copy });
    this._change({ kind: 'move', name: copy.name, index: index + 1 });
  }

  private _delete(name: string, e: Event) {
    if (this._armed !== name) {
      this._armed = name;
      this._armGuard.start(e.currentTarget);
      return;
    }
    this._armed = null;
    this._armGuard.stop();
    this._change({ kind: 'delete', name });
  }

  private async _copy(kind: 'style' | 'presets') {
    if (kind === 'style' && !this.cardState) return;
    const text = kind === 'style' ? exportStyle(this.cardState!) : exportPresets(this.presets);
    this._exportText = text;
    let copied = false;
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }
    const what = kind === 'style' ? t('presets.whatStyle') : t('presets.whatPresets', { n: this.presets.length });
    this._exportNote = copied ? t('presets.copied', { what }) : t('presets.copyByHand', { what });
    if (!copied) {
      void this.updateComplete.then(() => {
        const area = this.shadowRoot?.querySelector('textarea.export') as HTMLTextAreaElement | null;
        area?.focus();
        area?.select();
      });
    }
  }

  private _paste() {
    const result = parseTransfer(this._pasteText);
    this._pasteOk = result.kind !== 'error';
    if (result.kind === 'error') {
      this._pasteNote = t(`presets.pasteError.${result.reason}`);
      return;
    }
    if (result.kind === 'style') {
      this.dispatchEvent(new CustomEvent('style-paste', { detail: { state: result.state }, bubbles: true, composed: true }));
      this._pasteNote = t('presets.pastedStyle');
    } else {
      const named = uniqueNames(result.presets, this.presets.map((p) => p.name));
      for (const preset of named) this._change({ kind: 'save', preset });
      const renamed = named.filter((p, i) => p.name !== result.presets[i].name).length;
      this._pasteNote = renamed
        ? t('presets.pastedPresetsRenamed', { n: named.length, renamed })
        : t('presets.pastedPresets', { n: named.length });
    }
    this._pasteText = '';
  }

  override render() {
    const n = this.presets.length;
    return html`
      <div class="module">
        ${renderStaticHeader('mdi:bookmark-multiple-outline', t('presets.title'),
          n ? html`<span class="module-summary">${t(n === 1 ? 'presets.one' : 'presets.many', { n })}</span>` : nothing)}
        ${this._renderBody()}
      </div>
    `;
  }

  private _renderBody() {
    const last = this.presets.length - 1;
    return html`
      <div class="module-body">
        ${this.presets.length
          ? this.presets.map((p, i) => {
              const armed = this._armed === p.name;
              return html`<div class="preset-row" data-name=${p.name}>
                <input
                  type="text"
                  maxlength=${TRANSFER_NAME_MAX}
                  .value=${p.name}
                  aria-label=${t('presets.nameOf', { name: p.name })}
                  @change=${(e: Event) => this._rename(p.name, e.target as HTMLInputElement)}
                  @keydown=${(e: KeyboardEvent) => {
                    // Escape would close HA's whole card dialog; Enter commits the name.
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      (e.target as HTMLInputElement).value = p.name;
                    } else if (e.key === 'Enter' && !e.isComposing) {
                      e.preventDefault();
                      e.stopPropagation();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
                <button class="icon-btn" ?disabled=${i === 0} title=${t('presets.up', { name: p.name })} aria-label=${t('presets.up', { name: p.name })} @click=${() => this._move(p.name, i - 1)}>↑</button>
                <button class="icon-btn" ?disabled=${i === last} title=${t('presets.down', { name: p.name })} aria-label=${t('presets.down', { name: p.name })} @click=${() => this._move(p.name, i + 1)}>↓</button>
                <button class="icon-btn" title=${t('presets.duplicate', { name: p.name })} aria-label=${t('presets.duplicate', { name: p.name })} @click=${() => this._duplicate(p, i)}>⧉</button>
                <button
                  class="del-btn ${armed ? 'armed' : ''}"
                  title=${armed ? t('presets.deleteArmed', { name: p.name }) : t('presets.delete', { name: p.name })}
                  aria-label=${armed ? t('presets.deleteArmed', { name: p.name }) : t('presets.delete', { name: p.name })}
                  @click=${(e: Event) => this._delete(p.name, e)}
                  @blur=${() => {
                    if (this._armed === p.name) this._armed = null;
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === 'Escape' && armed) {
                      e.stopPropagation();
                      this._armed = null;
                    }
                  }}
                >${armed ? t('presets.deleteQ') : '×'}</button>
              </div>`;
            })
          : html`<div class="hint">${t('presets.none')}</div>`}
        ${this._renameError ? html`<div class="hint note-error" role="status">${this._renameError}</div>` : nothing}

        <span class="section-label">${t('presets.shareLabel')}</span>
        <div class="share-row">
          <button class="share-btn" ?disabled=${!this.cardState} @click=${() => void this._copy('style')}>${renderIcon('mdi:content-copy')}${t('presets.copyStyle')}</button>
          <button class="share-btn" ?disabled=${!this.presets.length} @click=${() => void this._copy('presets')}>${renderIcon('mdi:content-copy')}${t('presets.copyAll')}</button>
        </div>
        ${this._exportText
          ? html`<div class="hint note-ok" role="status">${this._exportNote}</div>
              <textarea class="export" readonly aria-label=${t('presets.exportField')} .value=${this._exportText}></textarea>`
          : nothing}

        <label class="section-label" for="cms-paste">${t('presets.pasteLabel')}</label>
        <textarea
          id="cms-paste"
          placeholder=${t('presets.pastePlaceholder')}
          .value=${this._pasteText}
          @input=${(e: Event) => {
            this._pasteText = (e.target as HTMLTextAreaElement).value;
            this._pasteNote = '';
          }}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'Escape') e.stopPropagation();
          }}
        ></textarea>
        <div class="share-row">
          <button class="share-btn" ?disabled=${!this._pasteText.trim()} @click=${this._paste}>${renderIcon('mdi:content-paste')}${t('presets.paste')}</button>
        </div>
        ${this._pasteNote
          ? html`<div class="hint ${this._pasteOk ? 'note-ok' : 'note-error'}" role="status">${this._pasteNote}</div>`
          : nothing}
        <div class="hint">${t('presets.shareHint')}</div>
      </div>
    `;
  }
}

customElements.define('cms-preset-manager', CmsPresetManager);

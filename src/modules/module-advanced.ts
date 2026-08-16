import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import type { AdvancedModuleState, PiercedEntry } from '../types/index.js';
import { moduleStyles } from './module-base.js';

export class AdvancedModule extends LitElement {
  @property({ attribute: false }) state: AdvancedModuleState = { rawCss: '' };
  /** When true the editor is expanded; false collapses it. */
  @property({ type: Boolean }) open = false;
  /** Dict-form cards (v0.10): preserved shadow-piercing entries, shown
   *  read-only — the Studio guarantees they survive every edit verbatim
   *  but doesn't offer visual editing for them yet. */
  @property({ attribute: false }) pierced: PiercedEntry[] = [];

  static override styles = [
    moduleStyles,
    css`
      .editor-wrap {
        padding: 0 14px 12px;
        border-top: 1px solid var(--divider-color, #383838);
      }
      ha-code-editor {
        display: block;
        --code-mirror-height: 180px;
      }
      .hint {
        font-size: 11px;
        color: var(--secondary-text-color, #9e9e9e);
        margin: 6px 0 0;
      }
      .pierced {
        margin-top: 10px;
        border-top: 1px dashed var(--divider-color, #383838);
        padding-top: 8px;
      }
      .pierced pre {
        margin: 4px 0 0;
        padding: 6px 8px;
        font-size: 11px;
        line-height: 1.5;
        background: var(--secondary-background-color, #1c1c1c);
        border-radius: 6px;
        overflow-x: auto;
        white-space: pre-wrap;
        opacity: 0.85;
      }
    `,
  ];

  private _onValueChanged(e: CustomEvent<{ value: string }>) {
    this.dispatchEvent(
      new CustomEvent<AdvancedModuleState>('state-changed', {
        detail: { rawCss: e.detail.value },
      }),
    );
  }

  override render() {
    return html`
      <div class="module">
        <div
          class="module-header"
          @click=${() => {
            this.open = !this.open;
          }}
        >
          <span class="module-chevron">${this.open ? '▼' : '▶'}</span>
          <span class="module-title">⌨️ Advanced CSS</span>
        </div>
        ${this.open
          ? html`
              <div class="editor-wrap">
                <ha-code-editor
                  mode="jinja2"
                  .value=${this.state.rawCss}
                  @value-changed=${this._onValueChanged}
                ></ha-code-editor>
                <p class="hint">
                  Raw CSS appended after visual module output. Supports Jinja2
                  templates just like card-mod.
                </p>
                ${this.pierced.length > 0
                  ? html`
                      <div class="pierced">
                        <p class="hint">
                          🔒 Hand-written shadow-piercing entries — preserved
                          exactly as written on every save (read-only here;
                          edit them in YAML):
                        </p>
                        <pre>${this._renderPierced()}</pre>
                      </div>
                    `
                  : ''}
              </div>
            `
          : ''}
      </div>
    `;
  }

  /** YAML-ish read-only rendering of the preserved dict entries. */
  private _renderPierced(): string {
    const fmt = (value: unknown, indent: string): string => {
      if (typeof value === 'string') {
        const lines = value.trim().split('\n');
        return ' |\n' + lines.map((l) => `${indent}  ${l}`).join('\n');
      }
      if (value && typeof value === 'object') {
        return '\n' + Object.entries(value as Record<string, unknown>)
          .map(([k, v]) => `${indent}  ${JSON.stringify(k)}:${fmt(v, indent + '  ')}`)
          .join('\n');
      }
      return ` ${String(value)}`;
    };
    return this.pierced
      .map((e) => `${JSON.stringify(e.key)}:${fmt(e.value, '')}`)
      .join('\n');
  }
}

customElements.define('cms-advanced-module', AdvancedModule);

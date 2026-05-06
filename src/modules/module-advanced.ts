import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import type { AdvancedModuleState } from '../types/index.js';
import { moduleStyles } from './module-base.js';

export class AdvancedModule extends LitElement {
  @property({ attribute: false }) state: AdvancedModuleState = { rawCss: '' };
  /** When true the editor is expanded; false collapses it. */
  @property({ type: Boolean }) open = false;

  static override styles = [
    moduleStyles,
    css`
      .toggle-btn {
        background: none;
        border: none;
        color: var(--secondary-text-color, #9e9e9e);
        font-size: 11px;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        gap: 4px;
      }
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
        <div class="module-header">
          <span class="module-title">⌨️ Advanced CSS</span>
          <button
            class="toggle-btn"
            @click=${() => {
              this.open = !this.open;
            }}
          >
            ${this.open ? '▲ Hide' : '▼ Show'}
          </button>
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
              </div>
            `
          : ''}
      </div>
    `;
  }
}

customElements.define('cms-advanced-module', AdvancedModule);

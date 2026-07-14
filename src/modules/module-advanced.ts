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
              </div>
            `
          : ''}
      </div>
    `;
  }
}

customElements.define('cms-advanced-module', AdvancedModule);

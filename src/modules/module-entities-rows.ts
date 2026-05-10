import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { EntitiesCardRow, EntitiesRowStyle, EntitiesRowStyles } from '../types/index.js';
import { moduleStyles } from './module-base.js';

export class EntitiesRowsModule extends LitElement {
  @property({ attribute: false }) rows: EntitiesCardRow[] = [];
  @property({ attribute: false }) styles: EntitiesRowStyles = {};

  @state() private _openRows = new Set<string>();

  static override styles = [
    moduleStyles,
    css`
      .entity-section {
        border: 1px solid var(--divider-color, #383838);
        border-radius: 6px;
        overflow: hidden;
      }
      .entity-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.03);
        cursor: pointer;
        user-select: none;
      }
      .entity-header:hover {
        background: rgba(255, 255, 255, 0.07);
      }
      .entity-chevron {
        font-size: 9px;
        color: var(--secondary-text-color, #9e9e9e);
        width: 12px;
        flex-shrink: 0;
      }
      .entity-name {
        font-size: 12px;
        font-weight: 500;
        flex-shrink: 0;
      }
      .entity-id {
        font-size: 11px;
        color: var(--secondary-text-color, #9e9e9e);
        font-family: monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
      }
      .style-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--accent-color, #2196f3);
        flex-shrink: 0;
      }
      .entity-body {
        padding: 10px 12px;
        border-top: 1px solid var(--divider-color, #383838);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .toggle-btn {
        padding: 3px 10px;
        font-size: 11px;
        border-radius: 4px;
        cursor: pointer;
        border: 1px solid var(--divider-color, #383838);
        background: rgba(255, 255, 255, 0.04);
        color: var(--secondary-text-color, #9e9e9e);
      }
      .toggle-btn.active {
        background: rgba(33, 150, 243, 0.15);
        color: #2196f3;
        border-color: rgba(33, 150, 243, 0.3);
      }
      .clear-btn {
        margin-top: 4px;
        padding: 4px 10px;
        font-size: 11px;
        cursor: pointer;
        background: rgba(255, 0, 0, 0.1);
        color: #ff6b6b;
        border: 1px solid rgba(255, 0, 0, 0.25);
        border-radius: 4px;
        width: 100%;
      }
      .clear-btn:hover {
        background: rgba(255, 0, 0, 0.2);
      }
    `,
  ];

  private _emit(entityId: string, changes: Partial<EntitiesRowStyle>) {
    const current = this.styles[entityId] ?? { iconColor: '', textColor: '' };
    const updated = { ...current, ...changes };
    const newStyles = { ...this.styles, [entityId]: updated };
    this.dispatchEvent(
      new CustomEvent<EntitiesRowStyles>('styles-changed', { detail: newStyles }),
    );
  }

  private _toggleRow(entityId: string) {
    const next = new Set(this._openRows);
    if (next.has(entityId)) next.delete(entityId);
    else next.add(entityId);
    this._openRows = next;
  }

  override render() {
    const entityRows = this.rows.filter(
      (r): r is EntitiesCardRow & { entity: string } => !!r.entity,
    );
    if (!entityRows.length) return nothing;

    return html`
      <div class="module">
        <div class="module-header" style="cursor:default; pointer-events:none">
          <span class="module-title">👥 Entity Row Styles</span>
        </div>
        <div class="module-body">
          ${entityRows.map((row) => this._renderRow(row))}
        </div>
      </div>
    `;
  }

  private _renderRow(row: EntitiesCardRow & { entity: string }) {
    const id = row.entity;
    const label = row.name || id.split('.')[1] || id;
    const isOpen = this._openRows.has(id);
    const rowStyle = this.styles[id] ?? { iconColor: '', textColor: '' };
    const hasStyle = !!(rowStyle.iconColor || rowStyle.textColor);

    return html`
      <div class="entity-section">
        <div class="entity-header" @click=${() => this._toggleRow(id)}>
          <span class="entity-chevron">${isOpen ? '▼' : '▶'}</span>
          <span class="entity-name">${label}</span>
          <span class="entity-id">${id}</span>
          ${hasStyle ? html`<span class="style-dot"></span>` : nothing}
        </div>
        ${isOpen ? this._renderBody(id, rowStyle) : nothing}
      </div>
    `;
  }

  private _renderBody(entityId: string, rowStyle: EntitiesRowStyle) {
    return html`
      <div class="entity-body">
        <div class="control-row">
          <span class="control-label">Icon color</span>
          <div class="control-right">
            ${rowStyle.iconColor
              ? html`<input
                    type="color"
                    .value=${this._toHex(rowStyle.iconColor)}
                    @input=${(e: Event) =>
                      this._emit(entityId, {
                        iconColor: (e.target as HTMLInputElement).value,
                      })}
                  />`
              : nothing}
            <button
              class="toggle-btn ${rowStyle.iconColor ? 'active' : ''}"
              @click=${() =>
                this._emit(entityId, {
                  iconColor: rowStyle.iconColor ? '' : '#2196F3',
                })}
            >
              ${rowStyle.iconColor ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Text color</span>
          <div class="control-right">
            ${rowStyle.textColor
              ? html`<input
                    type="color"
                    .value=${this._toHex(rowStyle.textColor)}
                    @input=${(e: Event) =>
                      this._emit(entityId, {
                        textColor: (e.target as HTMLInputElement).value,
                      })}
                  />`
              : nothing}
            <button
              class="toggle-btn ${rowStyle.textColor ? 'active' : ''}"
              @click=${() =>
                this._emit(entityId, {
                  textColor: rowStyle.textColor ? '' : '#e1e1e1',
                })}
            >
              ${rowStyle.textColor ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        ${rowStyle.iconColor || rowStyle.textColor
          ? html`<button
                class="clear-btn"
                @click=${() => this._emit(entityId, { iconColor: '', textColor: '' })}
              >
                Clear row styles
              </button>`
          : nothing}
      </div>
    `;
  }

  private _toHex(value: string): string {
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    if (/^#[0-9a-fA-F]{3}$/.test(value)) {
      return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    } catch {
      return '#888888';
    }
  }
}

customElements.define('cms-entities-rows-module', EntitiesRowsModule);

import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { EntitiesCardRow, EntitiesRowStyle, EntitiesRowStyles } from '../types/index.js';
import { moduleStyles } from './module-base.js';
import '../components/cms-color-picker.js';

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
        padding: 9px 12px;
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
        font-size: 13px;
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
        padding: 12px 14px;
        border-top: 1px solid var(--divider-color, #383838);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      cms-color-picker {
        margin-top: 4px;
      }
    `,
  ];

  private _emit(entityId: string, changes: Partial<EntitiesRowStyle>) {
    const current = this.styles[entityId] ?? { iconColor: '', textColor: '' };
    const updated = { ...current, ...changes };
    this.dispatchEvent(
      new CustomEvent<EntitiesRowStyles>('styles-changed', {
        detail: { ...this.styles, [entityId]: updated },
      }),
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
          <span class="module-title">🏠 Entities</span>
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
            <ha-switch
              .checked=${!!rowStyle.iconColor}
              @change=${(e: Event) =>
                this._emit(entityId, {
                  iconColor: (e.target as HTMLInputElement).checked ? '#2196F3' : '',
                })}
            ></ha-switch>
          </div>
        </div>
        ${rowStyle.iconColor
          ? html`<cms-color-picker
                .value=${rowStyle.iconColor}
                @color-changed=${(e: CustomEvent) =>
                  this._emit(entityId, { iconColor: e.detail.value })}
              ></cms-color-picker>`
          : nothing}

        <div class="control-row">
          <span class="control-label">Text / state color</span>
          <div class="control-right">
            <ha-switch
              .checked=${!!rowStyle.textColor}
              @change=${(e: Event) =>
                this._emit(entityId, {
                  textColor: (e.target as HTMLInputElement).checked ? '#e1e1e1' : '',
                })}
            ></ha-switch>
          </div>
        </div>
        ${rowStyle.textColor
          ? html`<cms-color-picker
                .value=${rowStyle.textColor}
                @color-changed=${(e: CustomEvent) =>
                  this._emit(entityId, { textColor: e.detail.value })}
              ></cms-color-picker>`
          : nothing}
      </div>
    `;
  }
}

customElements.define('cms-entities-rows-module', EntitiesRowsModule);

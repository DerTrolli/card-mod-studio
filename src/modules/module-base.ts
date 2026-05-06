/**
 * module-base.ts — shared Lit CSS for all visual module components.
 */

import { css } from 'lit';

export const moduleStyles = css`
  :host {
    display: block;
  }

  .module {
    border: 1px solid var(--divider-color, #383838);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 12px;
  }

  .module-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.04);
  }

  .module-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
  }

  .module-body {
    padding: 12px 14px;
    border-top: 1px solid var(--divider-color, #383838);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .control-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 36px;
    gap: 8px;
  }

  .control-label {
    font-size: 12px;
    color: var(--secondary-text-color, #9e9e9e);
    flex-shrink: 0;
  }

  .control-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    justify-content: flex-end;
  }

  ha-slider {
    flex: 1;
    min-width: 100px;
    max-width: 160px;
  }

  .value-label {
    font-size: 11px;
    color: var(--secondary-text-color, #9e9e9e);
    min-width: 36px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  input[type='color'] {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--divider-color, #383838);
    cursor: pointer;
    padding: 0;
    background: none;
    flex-shrink: 0;
  }

  .color-label {
    font-size: 11px;
    color: var(--secondary-text-color, #9e9e9e);
    font-family: monospace;
  }

  .sub-label {
    font-size: 11px;
    color: var(--secondary-text-color, #9e9e9e);
    margin-bottom: 4px;
  }

  ha-select {
    width: 100%;
  }

  select {
    background: var(--card-background-color, #1c1c1c);
    color: var(--primary-text-color, #e1e1e1);
    border: 1px solid var(--divider-color, #383838);
    border-radius: 4px;
    padding: 6px 8px;
    font-size: 12px;
    cursor: pointer;
    width: 100%;
  }
`;

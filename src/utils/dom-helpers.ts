/**
 * Shadow DOM / environment utilities.
 *
 * HA wraps everything in Shadow DOM, so these helpers expose the few probes the
 * injector and panel actually need (card-mod presence + the HA element names we
 * patch). Keep this surface small — add helpers here only when something uses
 * them.
 */

/**
 * Checks whether card-mod is installed by probing the custom elements registry.
 * card-mod registers the 'card-mod' element when it loads.
 */
export function isCardModInstalled(): boolean {
  return customElements.get('card-mod') !== undefined;
}

/**
 * HA internal element names. Kept as constants so a future HA rename is a
 * one-line fix in this file rather than scattered string literals.
 *
 * - HA_DIALOG_ELEMENT      — the card-editor dialog we patch (button injection)
 * - HA_CARD_EDITOR_ELEMENT — the inner editor whose shadow root hosts our panel
 */
export const HA_CARD_EDITOR_ELEMENT = 'hui-card-element-editor' as const;
export const HA_DIALOG_ELEMENT = 'hui-dialog-edit-card' as const;

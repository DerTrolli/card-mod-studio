/**
 * Shadow DOM / environment utilities.
 *
 * HA wraps everything in Shadow DOM, so these helpers expose the few probes the
 * injector and panel actually need (card-mod/UIX presence + the HA element names
 * we patch). Keep this surface small — add helpers here only when something uses
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
 * Checks whether UIX (github.com/Lint-Free-Technology/uix, the card-mod-derived
 * HA integration) is installed by probing the custom elements registry. UIX
 * registers 'uix-node' when it loads — it never registers 'card-mod', so this
 * is independent of isCardModInstalled().
 *
 * When a hass object is available, its backend component list is consulted
 * too: the frontend registry probe has a transient false-negative window
 * right after page load, before UIX's frontend resource has executed
 * (observed live in the sandbox), while `hass.config.components` is backend
 * truth independent of frontend-load timing. card-mod has no backend
 * component, so isCardModInstalled() has no equivalent fallback.
 */
export function isUixInstalled(hass?: { config?: { components?: string[] } }): boolean {
  if (customElements.get('uix-node') !== undefined) return true;
  return !!hass?.config?.components?.includes('uix');
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

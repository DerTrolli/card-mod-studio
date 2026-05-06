/**
 * Shadow DOM traversal and injection utilities.
 *
 * HA wraps everything in Shadow DOM, so normal querySelector cannot
 * cross component boundaries. These helpers navigate that tree safely.
 */

/**
 * Queries an element's shadow root, returning null instead of throwing
 * when the element has no shadow root or hasn't been upgraded yet.
 */
export function shadowRoot(el: Element): ShadowRoot | null {
  return el.shadowRoot ?? null;
}

/**
 * querySelector that crosses one shadow boundary.
 * Equivalent to: el.shadowRoot.querySelector(selector)
 */
export function shadowQuery<T extends Element>(
  el: Element,
  selector: string,
): T | null {
  return (el.shadowRoot?.querySelector<T>(selector)) ?? null;
}

/**
 * querySelectorAll that crosses one shadow boundary.
 */
export function shadowQueryAll<T extends Element>(
  el: Element,
  selector: string,
): NodeListOf<T> | null {
  return el.shadowRoot?.querySelectorAll<T>(selector) ?? null;
}

/**
 * Walks UP the DOM tree, including through shadow boundaries, looking for
 * a host element that matches the selector. Returns null if not found within
 * maxDepth levels.
 */
export function shadowClosest(
  node: Node,
  selector: string,
  maxDepth = 20,
): Element | null {
  let current: Node | null = node;
  let depth = 0;
  while (current && depth < maxDepth) {
    if (current instanceof Element && current.matches(selector)) return current;
    if (current.parentNode) {
      current = current.parentNode;
    } else if (current instanceof ShadowRoot) {
      current = current.host;
    } else {
      break;
    }
    depth++;
  }
  return null;
}

/**
 * Returns the deepest active element, following shadow roots.
 * Useful for debugging focus within HA's shadow tree.
 */
export function deepActiveElement(): Element | null {
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  return el;
}

/**
 * Checks whether card-mod is installed by probing the custom elements registry.
 * card-mod registers the 'card-mod' element when it loads.
 */
export function isCardModInstalled(): boolean {
  return customElements.get('card-mod') !== undefined;
}

/**
 * Returns the HA element name for the card editor dialog.
 * Kept as a constant so a future HA rename is a one-line fix.
 */
export const HA_CARD_EDITOR_ELEMENT = 'hui-card-element-editor' as const;
export const HA_DIALOG_ELEMENT = 'hui-dialog-edit-card' as const;

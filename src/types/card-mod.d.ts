/**
 * Type declarations for card-mod's runtime presence.
 * card-mod registers a 'card-mod' custom element when it is installed.
 * We probe this to warn the user when card-mod is missing.
 */

declare global {
  interface HTMLElementTagNameMap {
    // card-mod's own element — exists only when card-mod is installed.
    'card-mod': HTMLElement;

    // Our plugin elements registered via customElements.define()
    'cms-panel': import('../editor/cms-panel').CmsPanel;
    'cms-tab-button': import('../editor/cms-tab').CmsTabButton;
  }
}

export {};

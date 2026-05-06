/**
 * cms-injector — the core injection engine for Card-Mod Studio.
 *
 * Strategy
 * --------
 * We hook into Home Assistant's card editor by prototype-patching
 * `hui-card-element-editor`. This element lives INSIDE the dialog and has
 * direct access to the card config + the HA instance. card-mod uses the same
 * technique, making it the most battle-tested approach available.
 *
 * The patch overrides the element's `updated()` lifecycle method. Every time
 * HA re-renders the editor (config change, tab switch, etc.) we re-check
 * whether our button and panel are still present and inject them if not.
 *
 * Timing
 * ------
 * Custom elements are defined lazily by HA when the relevant code is first
 * needed. We use `customElements.whenDefined()` to block until the class
 * exists, then patch its prototype. If the dialog is already open we also
 * run a one-shot sync injection.
 *
 * Failure handling
 * ----------------
 * If a structural HA change means our injection point disappears, we log a
 * clear warning and do nothing — we never throw or break the native editor.
 */

import { HA_CARD_EDITOR_ELEMENT } from '../utils/dom-helpers.js';
import type { CardModCardConfig, HomeAssistant } from '../types/index.js';

const CMS_BUTTON_ATTR = 'data-cms-injected';
const CMS_PANEL_ID = 'cms-style-panel';

// ---------------------------------------------------------------------------
// Types for the internal HA element shape we interact with
// ---------------------------------------------------------------------------

interface HuiCardElementEditor extends HTMLElement {
  /** The card config object — set by HA when the user opens the editor. */
  _config?: CardModCardConfig;
  /** The HA instance — set by HA when the user opens the editor. */
  hass?: HomeAssistant;
  /** Guard flag so multiple CMS registrations don't double-patch. */
  _cmsPatched?: boolean;
}

// ---------------------------------------------------------------------------
// Panel toggle logic — called when the user clicks our Style button
// ---------------------------------------------------------------------------

function togglePanel(editor: HuiCardElementEditor, active: boolean): void {
  const root = editor.shadowRoot;
  if (!root) return;

  let panel = root.getElementById(CMS_PANEL_ID) as
    | import('../editor/cms-panel.js').CmsPanel
    | null;

  if (active) {
    if (!panel) {
      panel = document.createElement('cms-panel') as import('../editor/cms-panel.js').CmsPanel;
      panel.id = CMS_PANEL_ID;
      // Pass current card config and hass into the panel
      panel.config = editor._config;
      panel.hass = editor.hass;
      // Append after the native editor content
      root.appendChild(panel);
    } else {
      // Update in case config changed while panel was closed
      panel.config = editor._config;
      panel.hass = editor.hass;
      panel.style.display = 'block';
    }
  } else {
    if (panel) {
      panel.style.display = 'none';
    }
  }
}

// ---------------------------------------------------------------------------
// Button injection — adds the 🎨 Style button to the editor's action area
// ---------------------------------------------------------------------------

function injectButton(editor: HuiCardElementEditor): void {
  const root = editor.shadowRoot;
  if (!root) return;

  // Already injected into this editor instance?
  if (root.querySelector(`[${CMS_BUTTON_ATTR}]`)) return;

  // HA wraps the secondary action buttons in a container. Try the most
  // common selectors; if none match we log and bail — never throw.
  const actionContainer =
    root.querySelector('div.action-items') ??
    root.querySelector('.header') ??
    root.querySelector('ha-card') ??
    // Last resort: append directly to the shadow root host area
    root.querySelector(':first-child');

  if (!actionContainer) {
    console.warn(
      '[Card-Mod Studio] Could not find action container in hui-card-element-editor. ' +
        'The Style button will not appear. This may be caused by a Home Assistant update. ' +
        'Please report this at https://github.com/dertrolli/card-mod-visual-editor/issues',
    );
    return;
  }

  // Create our tab button
  const tabButton = document.createElement('cms-tab-button');
  tabButton.setAttribute(CMS_BUTTON_ATTR, 'true');

  // Listen for toggle events
  tabButton.addEventListener('cms-tab-toggle', (ev: Event) => {
    const detail = (ev as CustomEvent<{ active: boolean }>).detail;
    togglePanel(editor, detail.active);
  });

  // Insert before the first existing action button if possible, otherwise append
  const firstAction = actionContainer.querySelector('ha-icon-button, ha-button');
  if (firstAction) {
    actionContainer.insertBefore(tabButton, firstAction);
  } else {
    actionContainer.appendChild(tabButton);
  }
}

// ---------------------------------------------------------------------------
// Prototype patch — hooks into hui-card-element-editor's lifecycle
// ---------------------------------------------------------------------------

function patchEditorElement(EditorClass: CustomElementConstructor): void {
  const proto = EditorClass.prototype as HuiCardElementEditor & {
    updated?: (changedProps: Map<string, unknown>) => void;
  };

  if (proto._cmsPatched) {
    // Another version of CMS already patched this class — skip to avoid double injection.
    console.info('[Card-Mod Studio] Editor already patched by another CMS instance, skipping.');
    return;
  }
  proto._cmsPatched = true;

  const originalUpdated = proto.updated;

  proto.updated = function (
    this: HuiCardElementEditor,
    changedProps: Map<string, unknown>,
  ): void {
    // Always call the original first so HA's own render completes.
    if (originalUpdated) {
      originalUpdated.call(this, changedProps);
    }

    // After HA has rendered, inject our button.
    // requestAnimationFrame defers by one paint to ensure the shadow DOM
    // is fully populated before we query it.
    requestAnimationFrame(() => {
      try {
        injectButton(this);

        // If the panel is visible, keep its config in sync with any config changes.
        const root = this.shadowRoot;
        if (!root) return;
        const panel = root.getElementById(CMS_PANEL_ID) as
          | import('../editor/cms-panel.js').CmsPanel
          | null;
        if (panel && panel.style.display !== 'none') {
          panel.config = this._config;
          panel.hass = this.hass;
        }
      } catch (err) {
        console.error('[Card-Mod Studio] Error during injection:', err);
      }
    });
  };

  console.info(
    '[Card-Mod Studio] hui-card-element-editor patched successfully.',
  );
}

// ---------------------------------------------------------------------------
// Sync injection for dialogs already open when the plugin loads
// ---------------------------------------------------------------------------

function injectIntoExistingEditors(): void {
  const editors = document.querySelectorAll<HuiCardElementEditor>(
    HA_CARD_EDITOR_ELEMENT,
  );
  editors.forEach((editor) => {
    requestAnimationFrame(() => {
      try {
        injectButton(editor);
      } catch (err) {
        console.error('[Card-Mod Studio] Error injecting into existing editor:', err);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Starts the injection process. Should be called once from the plugin entry point.
 * Returns a Promise that resolves when the patch is applied.
 */
export async function startInjector(): Promise<void> {
  console.info('[Card-Mod Studio] Waiting for hui-card-element-editor...');

  // Wait until HA defines the editor element (happens lazily when first card editor opens).
  await customElements.whenDefined(HA_CARD_EDITOR_ELEMENT);

  const EditorClass = customElements.get(HA_CARD_EDITOR_ELEMENT);
  if (!EditorClass) {
    console.error(
      '[Card-Mod Studio] hui-card-element-editor was defined but could not be retrieved. ' +
        'This is unexpected — please report this issue.',
    );
    return;
  }

  patchEditorElement(EditorClass);

  // Also inject into any editor instances that might already be open
  // (e.g. if the plugin loads while an editor dialog is already shown).
  injectIntoExistingEditors();
}

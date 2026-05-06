/**
 * cms-injector — the core injection engine for Card-Mod Studio.
 *
 * Strategy (verified against card-mod source and HA frontend source)
 * ------------------------------------------------------------------
 * We patch `hui-dialog-edit-card` (NOT `hui-card-element-editor`).
 * This is the same element card-mod patches for its brush icon indicator.
 * The dialog's shadow root contains `ha-button[slot=secondaryAction]` —
 * confirmed by the card-mod source at:
 *   src/patch/hui-card-element-editor.ts → HuiDialogEditCardPatch
 *
 * The card config lives on the dialog as `_cardConfig` (seen in card-mod source).
 * The hass instance is also available on the dialog.
 *
 * The patch overrides `updated()` on the prototype. This fires after every
 * HA re-render of the dialog, giving us a stable insertion point.
 *
 * Key corrections vs initial implementation
 * ------------------------------------------
 * - Target: hui-dialog-edit-card (not hui-card-element-editor)
 * - Config property: _cardConfig (not _config, not value)
 * - Injection point: ha-button[slot=secondaryAction] — confirmed from card-mod
 * - Our button needs slot="secondaryAction" to appear in the same footer area
 */

import { HA_DIALOG_ELEMENT } from '../utils/dom-helpers.js';
import type { CardModCardConfig, HomeAssistant } from '../types/index.js';

const CMS_BUTTON_ATTR = 'data-cms-injected';
const CMS_PANEL_ID = 'cms-style-panel';

// Confirmed by card-mod source: this is the selector that finds the
// Cancel/Save buttons inside hui-dialog-edit-card's shadow root.
const SECONDARY_ACTION_SELECTOR = 'ha-button[slot=secondaryAction]';

// ---------------------------------------------------------------------------
// Types for the internal HA element shape we interact with
// ---------------------------------------------------------------------------

interface HuiDialogEditCard extends HTMLElement {
  /** The card config object. Name confirmed from card-mod source. */
  _cardConfig?: CardModCardConfig;
  /** The HA instance — inherited from parent. */
  hass?: HomeAssistant;
  /** Guard flag so multiple CMS loads don't double-patch. */
  _cmsPatched?: boolean;
}

// ---------------------------------------------------------------------------
// Panel toggle — shows/hides cms-panel inside the dialog's shadow root
// ---------------------------------------------------------------------------

function togglePanel(dialog: HuiDialogEditCard, active: boolean): void {
  const root = dialog.shadowRoot;
  if (!root) return;

  let panel = root.getElementById(CMS_PANEL_ID) as
    | import('./cms-panel.js').CmsPanel
    | null;

  if (active) {
    if (!panel) {
      panel = document.createElement('cms-panel') as import('./cms-panel.js').CmsPanel;
      panel.id = CMS_PANEL_ID;
      panel.config = dialog._cardConfig;
      panel.hass = dialog.hass;
      root.appendChild(panel);
    } else {
      panel.config = dialog._cardConfig;
      panel.hass = dialog.hass;
      panel.style.display = 'block';
    }
  } else {
    if (panel) {
      panel.style.display = 'none';
    }
  }
}

// ---------------------------------------------------------------------------
// Button injection — inserts cms-tab-button next to the existing Cancel button
// ---------------------------------------------------------------------------

function injectButton(dialog: HuiDialogEditCard): void {
  const root = dialog.shadowRoot;
  if (!root) return;

  // Already injected into this dialog instance?
  if (root.querySelector(`[${CMS_BUTTON_ATTR}]`)) return;

  // card-mod confirms this selector finds the footer button(s) inside
  // hui-dialog-edit-card's shadow root. The button is a light-DOM child
  // of <ha-dialog> (rendered by hui-dialog-edit-card's template) slotted
  // into ha-dialog's "secondaryAction" slot.
  const existingButton = root.querySelector(SECONDARY_ACTION_SELECTOR);

  if (!existingButton) {
    // Log exactly what IS in the shadow root so the developer can debug.
    const children = Array.from(root.children).map(
      (el) =>
        el.tagName.toLowerCase() +
        (el.id ? `#${el.id}` : '') +
        (el.className ? `.${[...el.classList].join('.')}` : '') +
        (el.getAttribute('slot') ? `[slot=${el.getAttribute('slot')}]` : ''),
    );
    console.warn(
      '[Card-Mod Studio] Could not find ha-button[slot=secondaryAction] in ' +
        'hui-dialog-edit-card shadow root. Style button will not appear. ' +
        'This may be caused by a Home Assistant update. ' +
        'Shadow root direct children: ' +
        (children.length ? children.join(', ') : '(none)') +
        '\nPlease report at https://github.com/dertrolli/card-mod-visual-editor/issues',
    );
    return;
  }

  const tabButton = document.createElement('cms-tab-button');
  tabButton.setAttribute(CMS_BUTTON_ATTR, 'true');
  // Must carry slot="secondaryAction" so it appears in the same footer area
  // as the existing Cancel button — it's slotted into ha-dialog.
  tabButton.setAttribute('slot', 'secondaryAction');

  tabButton.addEventListener('cms-tab-toggle', (ev: Event) => {
    const detail = (ev as CustomEvent<{ active: boolean }>).detail;
    togglePanel(dialog, detail.active);
  });

  // Insert before the Cancel button so Style appears to its left.
  existingButton.parentNode?.insertBefore(tabButton, existingButton);
}

// ---------------------------------------------------------------------------
// Prototype patch — hooks into hui-dialog-edit-card's Lit lifecycle
// ---------------------------------------------------------------------------

function patchDialogElement(DialogClass: CustomElementConstructor): void {
  // PropertyKey covers string | number | symbol — matches Lit's PropertyValues map key type.
  const proto = DialogClass.prototype as HuiDialogEditCard & {
    updated?: (changedProps: Map<PropertyKey, unknown>) => void;
  };

  if (proto._cmsPatched) {
    console.info(
      '[Card-Mod Studio] Dialog already patched by another CMS instance, skipping.',
    );
    return;
  }
  proto._cmsPatched = true;

  const originalUpdated = proto.updated;

  proto.updated = function (
    this: HuiDialogEditCard,
    changedProps: Map<PropertyKey, unknown>,
  ): void {
    // Always call the original first — HA's own render must complete before we query.
    if (originalUpdated) {
      originalUpdated.call(this, changedProps);
    }

    // Defer by one animation frame so the shadow DOM is fully settled.
    requestAnimationFrame(() => {
      try {
        injectButton(this);

        // Keep panel config in sync whenever HA re-renders the dialog
        // (e.g. user changes a config value in the native editor).
        const root = this.shadowRoot;
        if (!root) return;
        const panel = root.getElementById(CMS_PANEL_ID) as
          | import('./cms-panel.js').CmsPanel
          | null;
        if (panel && panel.style.display !== 'none') {
          panel.config = this._cardConfig;
          panel.hass = this.hass;
        }
      } catch (err) {
        console.error('[Card-Mod Studio] Error during injection:', err);
      }
    });
  };

  console.info('[Card-Mod Studio] hui-dialog-edit-card patched successfully.');
}

// ---------------------------------------------------------------------------
// Sync injection — handles dialogs already open at plugin load time
// ---------------------------------------------------------------------------

function injectIntoExistingDialogs(): void {
  document.querySelectorAll<HuiDialogEditCard>(HA_DIALOG_ELEMENT).forEach((dialog) => {
    requestAnimationFrame(() => {
      try {
        injectButton(dialog);
      } catch (err) {
        console.error('[Card-Mod Studio] Error injecting into existing dialog:', err);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Starts the injection process. Called once from card-mod-studio.ts.
 * Waits for HA to define hui-dialog-edit-card (lazy, happens when first
 * card editor is opened), then patches its prototype.
 */
export async function startInjector(): Promise<void> {
  console.info('[Card-Mod Studio] Waiting for hui-dialog-edit-card...');

  await customElements.whenDefined(HA_DIALOG_ELEMENT);

  const DialogClass = customElements.get(HA_DIALOG_ELEMENT);
  if (!DialogClass) {
    console.error(
      '[Card-Mod Studio] hui-dialog-edit-card was defined but could not be retrieved. ' +
        'This is unexpected — please report this issue.',
    );
    return;
  }

  patchDialogElement(DialogClass);
  injectIntoExistingDialogs();
}

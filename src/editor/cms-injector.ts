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

import { HA_DIALOG_ELEMENT, HA_CARD_EDITOR_ELEMENT } from '../utils/dom-helpers.js';
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
// Panel toggle — shows/hides cms-panel inside hui-card-element-editor
// ---------------------------------------------------------------------------

/**
 * Returns the best shadow root to host the cms-panel.
 *
 * We target hui-card-element-editor's shadow root so the panel overlays
 * the card config area (left pane) rather than appearing outside the dialog.
 * Falls back to the dialog's own shadow root if the editor isn't found.
 */
function getPanelHost(dialog: HuiDialogEditCard): ShadowRoot | null {
  const root = dialog.shadowRoot;
  if (!root) return null;
  const cardEditor = root.querySelector(HA_CARD_EDITOR_ELEMENT);
  return cardEditor?.shadowRoot ?? root;
}

/**
 * Attempts to expand the HA dialog to use more vertical space. A short-content
 * card (e.g. tile with only a couple of native fields) otherwise produces a
 * dialog too small for our 2-column panel, forcing constant internal scrolling.
 *
 * HA has (as of the "Web Awesome" dialog redesign) two different dialog
 * implementations in the wild, so this targets both:
 *
 * - Legacy MDC-based `ha-dialog`: setting `--mdc-dialog-max-height` directly
 *   on `ha-dialog` works.
 * - Current `ha-dialog`, which wraps a `<wa-dialog>` custom element whose own
 *   shadow root contains the actual native `<dialog part="dialog">` that
 *   controls rendered size: `--mdc-dialog-max-height` on `ha-dialog` (or any
 *   custom property on `wa-dialog` itself) is a no-op here — confirmed
 *   empirically against a live HA instance (getComputedStyle inspection of
 *   the nested shadow roots) — only a style set directly on that innermost
 *   `<dialog>` element takes effect. We use `max-height` (not `height`) so a
 *   card with genuinely little content still sizes to fit it rather than
 *   always taking the full 92vh.
 *
 * Both branches are no-ops (silently, via optional chaining) if their target
 * structure isn't found, so a future HA redesign degrades gracefully instead
 * of throwing — same tradeoff as the rest of this file's selectors.
 */
function tryExpandDialog(dialog: HuiDialogEditCard): void {
  const root = dialog.shadowRoot;
  if (!root) return;

  const haDialog = root.querySelector('ha-dialog') as HTMLElement | null;
  if (haDialog) {
    haDialog.style.setProperty('--mdc-dialog-max-height', '92vh');

    const nativeDialogEl = haDialog.shadowRoot
      ?.querySelector('wa-dialog')
      ?.shadowRoot?.querySelector('dialog') as HTMLElement | null;
    nativeDialogEl?.style.setProperty('max-height', '92vh');
  }

  // Force hui-card-element-editor to be tall enough for our 2-column panel.
  // Without this, a simple card with few native options produces a tiny dialog.
  const cardEditor = root.querySelector('hui-card-element-editor') as HTMLElement | null;
  if (cardEditor) {
    // hui-card-element-editor has no explicit `display` set on current HA, so
    // it defaults to `inline` — and min-height (like height/max-height) is a
    // no-op on inline elements per the CSS spec. Confirmed empirically: with
    // display left as-is, min-height:72vh silently did nothing (stayed at its
    // ~364px content height); forcing block unblocks it (grows to the full
    // 720px), which is also what lets the wa-dialog max-height fix above
    // actually matter — the outer dialog only grows because this inner
    // content now genuinely needs the room.
    cardEditor.style.display = 'block';
    cardEditor.style.minHeight = '72vh';
  }
}

function togglePanel(dialog: HuiDialogEditCard, active: boolean): void {
  const host = getPanelHost(dialog);
  if (!host) return;

  let panel = host.getElementById(CMS_PANEL_ID) as
    | import('./cms-panel.js').CmsPanel
    | null;

  if (active) {
    tryExpandDialog(dialog);
    if (!panel) {
      panel = document.createElement('cms-panel') as import('./cms-panel.js').CmsPanel;
      panel.id = CMS_PANEL_ID;
      panel.config = dialog._cardConfig;
      panel.hass = dialog.hass;
      host.appendChild(panel);
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
        '\nPlease report at https://github.com/dertrolli/card-mod-studio/issues',
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
        const host = getPanelHost(this);
        if (!host) return;
        const panel = host.getElementById(CMS_PANEL_ID) as
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

// ---------------------------------------------------------------------------
// hui-form-editor shim — keeps the visual editor usable with uix:/card_mod:
// ---------------------------------------------------------------------------

/**
 * HA validates card configs in the GUI editor against strict superstruct
 * schemas that reject unknown keys ("Key 'uix' is not expected or not
 * supported by the visual editor" → forced YAML mode). card-mod and UIX
 * both work around this by stripping their key before validation — but
 * their patch hooks `getConfigElement()`, and HA has been migrating cards
 * (entity, and more over time) to `getConfigForm()`, whose generic
 * `hui-form-editor` neither engine patches. Result: adding a uix:/card_mod:
 * block via the Studio breaks those cards' visual editors.
 *
 * This shim patches hui-form-editor.setConfig to run the strict
 * `assertConfig` against a COPY with uix/card_mod removed, while the editor
 * keeps the full original config — ha-form preserves keys outside its
 * schema on save (`{ ...data, ...newValue }`), so the style block survives
 * GUI edits untouched. Idempotent alongside a future engine-side fix: a
 * second strip of an already-stripped copy is a no-op. Remove once UIX
 * ships its own hui-form-editor handling (upstream issue filed).
 */
async function patchFormEditor(): Promise<void> {
  await customElements.whenDefined('hui-form-editor');

  const FormEditorClass = customElements.get('hui-form-editor');
  if (!FormEditorClass) return;

  const proto = FormEditorClass.prototype as HTMLElement & {
    _cmsFormPatched?: boolean;
    assertConfig?: (config: unknown) => void;
    setConfig?: (config: Record<string, unknown>) => void;
  };
  if (proto._cmsFormPatched || typeof proto.setConfig !== 'function') return;
  proto._cmsFormPatched = true;

  const originalSetConfig = proto.setConfig;
  proto.setConfig = function (
    this: typeof proto,
    config: Record<string, unknown>,
  ): void {
    const originalAssert = this.assertConfig;
    if (originalAssert && config && (config.uix || config.card_mod)) {
      this.assertConfig = (c: unknown) => {
        const copy = { ...(c as Record<string, unknown>) };
        delete copy.uix;
        delete copy.card_mod;
        originalAssert.call(this, copy);
      };
    }
    try {
      originalSetConfig.call(this, config);
    } finally {
      if (originalAssert) this.assertConfig = originalAssert;
    }
  };

  console.info('[Card-Mod Studio] hui-form-editor patched (uix:/card_mod: tolerated by visual editor).');
}

/**
 * Starts the injection process. Called once from card-mod-studio.ts.
 * Waits for HA to define hui-dialog-edit-card (lazy, happens when first
 * card editor is opened), then patches its prototype.
 */
export async function startInjector(): Promise<void> {
  console.info('[Card-Mod Studio] Waiting for hui-dialog-edit-card...');

  // Independent of the dialog patch: hui-form-editor is defined lazily when
  // the first form-based card editor loads.
  void patchFormEditor().catch((err) =>
    console.error('[Card-Mod Studio] hui-form-editor patch failed:', err),
  );

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

/**
 * cms-section-injector — the Studio in Home Assistant's "Section
 * configuration" dialog (`hui-dialog-edit-section`, sections views; v1.0).
 *
 * A section's config is a grid — `{ type: 'grid', cards: [...] }` — so the
 * panel treats it exactly like a grid card: one styling section per card
 * inside (saved into that card), and Advanced CSS for the section itself,
 * where `:host { … }` styles the section (both engines; measured on HA
 * 2026.11 with card-mod 4.2.1 and UIX 9.0.0).
 *
 * The dialog is built like the card dialog (checked live, HA 2026.11):
 * `.content > .element-editor + .element-preview` and a footer with
 * `ha-button[slot=secondaryAction]`. The section config lives in `_config`
 * and the dialog takes edits through `_configChanged({ detail: { value } })`
 * (its own editor's path, which also updates the Save button's dirty state).
 * While the Studio is open it takes the dialog's content area (its tabs and
 * form are hidden, not removed) and the dialog grows to fit it; HA's own
 * preview is hidden meanwhile — the panel has its own, as in the card dialog.
 * Anything not found degrades to "no Style button", like the card injector.
 */
import type { CardModCardConfig, HomeAssistant } from '../types/index.js';
import { languageOfHass, setHomeAssistantLanguage } from '../i18n/index.js';
import { initSettings } from '../utils/settings-storage.js';

export const HA_SECTION_DIALOG_ELEMENT = 'hui-dialog-edit-section' as const;

const BUTTON_ATTR = 'data-cms-injected';
const PANEL_ID = 'cms-section-panel';
const OPEN_ATTR = 'data-cms-studio-open';

interface HuiDialogEditSection extends HTMLElement {
  _config?: CardModCardConfig;
  hass?: HomeAssistant;
  _yamlMode?: boolean;
  _configChanged?: (e: { stopPropagation(): void; detail: { value: unknown } }) => void;
  requestUpdate?: () => void;
  _cmsSectionPatched?: boolean;
}

type Panel = import('./cms-panel.js').CmsPanel;

function editorColumn(dialog: HuiDialogEditSection): HTMLElement | null {
  return dialog.shadowRoot?.querySelector<HTMLElement>('.content > .element-editor') ?? null;
}

function panelOf(dialog: HuiDialogEditSection): Panel | null {
  return (editorColumn(dialog)?.querySelector(`#${PANEL_ID}`) as Panel | null) ?? null;
}

/** Hand the Studio's edit to the dialog the way its own editor does. */
function writeBack(dialog: HuiDialogEditSection, config: CardModCardConfig): void {
  if (typeof dialog._configChanged === 'function') {
    dialog._configChanged({ stopPropagation() {}, detail: { value: config } });
  } else {
    dialog._config = config;
    dialog.requestUpdate?.();
  }
}

/** Room for the two-column panel (as tryExpandDialog does for the card
 *  dialog): the dialog sizes to its content, which collapsed to ~300px. */
function expand(dialog: HuiDialogEditSection, column: HTMLElement, active: boolean): void {
  const haDialog = dialog.shadowRoot?.querySelector('ha-dialog') as HTMLElement | null;
  const native = haDialog?.shadowRoot?.querySelector('wa-dialog')?.shadowRoot?.querySelector('dialog') as HTMLElement | null;
  if (active) {
    haDialog?.style.setProperty('--mdc-dialog-max-height', '92vh');
    native?.style.setProperty('max-height', '92vh');
  }
  column.style.minHeight = active ? '72vh' : '';
  column.style.flex = active ? '1 1 auto' : '';
  // The panel has its own live preview (with click-to-edit): HA's is hidden
  // meanwhile, like in the card dialog.
  const preview = dialog.shadowRoot?.querySelector<HTMLElement>('.content > .element-preview');
  if (preview) preview.style.display = active ? 'none' : '';
}

export function toggleSectionPanel(dialog: HuiDialogEditSection, active: boolean): void {
  const column = editorColumn(dialog);
  if (!column) return;
  expand(dialog, column, active);
  // Cover the dialog's own tabs and form (not removed: they stay alive).
  for (const child of Array.from(column.children)) {
    if ((child as HTMLElement).id === PANEL_ID) continue;
    (child as HTMLElement).style.display = active ? 'none' : '';
  }
  column.toggleAttribute(OPEN_ATTR, active);
  let panel = panelOf(dialog);
  if (!active) {
    if (panel) panel.style.display = 'none';
    return;
  }
  if (!panel) {
    panel = document.createElement('cms-panel') as Panel;
    panel.id = PANEL_ID;
    panel.section = true;
    panel.addEventListener('config-changed', (ev: Event) => {
      ev.stopPropagation();
      const cfg = (ev as CustomEvent<{ config: CardModCardConfig }>).detail?.config;
      if (cfg) writeBack(dialog, cfg);
    });
    column.appendChild(panel);
  }
  panel.config = dialog._config;
  panel.hass = dialog.hass;
  panel.style.display = '';
}

function injectButton(dialog: HuiDialogEditSection): void {
  const root = dialog.shadowRoot;
  if (!root || root.querySelector(`[${BUTTON_ATTR}]`)) return;
  const existing = root.querySelector('ha-button[slot=secondaryAction]');
  if (!existing || !editorColumn(dialog)) return; // another layout: no Style button
  setHomeAssistantLanguage(languageOfHass(dialog.hass));
  void initSettings(dialog.hass);
  const tab = document.createElement('cms-tab-button');
  tab.setAttribute(BUTTON_ATTR, 'true');
  tab.setAttribute('slot', 'secondaryAction');
  tab.addEventListener('cms-tab-toggle', (ev: Event) => {
    toggleSectionPanel(dialog, (ev as CustomEvent<{ active: boolean }>).detail.active);
  });
  existing.parentNode?.insertBefore(tab, existing);
}

/** The YAML editor replaces the form: close the Studio, like the card dialog. */
function closeOnYaml(dialog: HuiDialogEditSection, changed: Map<PropertyKey, unknown>): void {
  if (!changed.has('_yamlMode') || changed.get('_yamlMode') === undefined || !dialog._yamlMode) return;
  const tab = dialog.shadowRoot?.querySelector(`[${BUTTON_ATTR}]`) as { active?: boolean } | null;
  if (!tab?.active) return;
  tab.active = false;
  toggleSectionPanel(dialog, false);
}

function patch(DialogClass: CustomElementConstructor): void {
  const proto = DialogClass.prototype as HuiDialogEditSection & {
    updated?: (changed: Map<PropertyKey, unknown>) => void;
  };
  if (proto._cmsSectionPatched) return;
  proto._cmsSectionPatched = true;
  const original = proto.updated;
  proto.updated = function (this: HuiDialogEditSection, changed: Map<PropertyKey, unknown>): void {
    if (original) original.call(this, changed);
    try {
      closeOnYaml(this, changed);
    } catch (err) {
      console.error('[Card-Mod Studio] Error closing Studio in the section dialog:', err);
    }
    requestAnimationFrame(() => {
      try {
        injectButton(this);
        const panel = panelOf(this);
        if (panel && panel.style.display !== 'none') {
          panel.config = this._config;
          panel.hass = this.hass;
        }
      } catch (err) {
        console.error('[Card-Mod Studio] Error during section-dialog injection:', err);
      }
    });
  };
  console.info('[Card-Mod Studio] hui-dialog-edit-section patched successfully.');
}

/** Waits for Home Assistant's section dialog (sections views only) and patches it. */
export async function startSectionInjector(): Promise<void> {
  await customElements.whenDefined(HA_SECTION_DIALOG_ELEMENT);
  const DialogClass = customElements.get(HA_SECTION_DIALOG_ELEMENT);
  if (DialogClass) patch(DialogClass);
  document.querySelectorAll<HuiDialogEditSection>(HA_SECTION_DIALOG_ELEMENT).forEach((d) =>
    requestAnimationFrame(() => injectButton(d)),
  );
}

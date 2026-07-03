/**
 * card-mod-studio.ts — Plugin entry point.
 *
 * This file is the single module that Home Assistant loads as a Lovelace resource.
 * It does three things:
 *   1. Guards against being loaded twice (e.g. with different ?v= cache-busters)
 *   2. Registers our Lit web components with the browser
 *   3. Starts the injection engine that patches the HA card editor
 *
 * To load this plugin in Home Assistant go to:
 *   Settings → Dashboards → ⋮ → Resources → + Add Resource
 *   URL:  /local/card-mod-studio.js?v=0.1.0
 *   Type: JavaScript Module
 */

import './editor/cms-panel.js';
import './editor/cms-tab.js';
import './components/cms-color-picker.js';
import { startInjector } from './editor/cms-injector.js';
import { isCardModInstalled, isUixInstalled } from './utils/dom-helpers.js';
import type { CardModStudioMeta } from './types/index.js';

declare const __APP_VERSION__: string;
const VERSION = __APP_VERSION__;

// ---------------------------------------------------------------------------
// Guard against double-loading
// ---------------------------------------------------------------------------

if (window.cardModStudio) {
  console.warn(
    `[Card-Mod Studio] Already loaded (v${window.cardModStudio.version}). ` +
      `Skipping load of v${VERSION}. ` +
      `If you see duplicate "Style" buttons, clear your browser cache.`,
  );
} else {
  const meta: CardModStudioMeta = { version: VERSION, injected: false };
  window.cardModStudio = meta;

  // Check for card-mod/UIX at load time and warn immediately so the user sees
  // it in the browser console even before they open any card editor.
  const cardModPresent = isCardModInstalled();
  const uixPresent = isUixInstalled();
  if (!cardModPresent && !uixPresent) {
    console.warn(
      '[Card-Mod Studio] Neither card-mod nor UIX is detected. ' +
        'Install one of them via HACS first. ' +
        'The style editor UI will still open, but generated YAML will not apply until one is present.',
    );
  } else if (uixPresent && !cardModPresent) {
    console.info('[Card-Mod Studio] UIX detected ✓');
  } else {
    console.info('[Card-Mod Studio] card-mod detected ✓');
  }

  // Start the injection engine asynchronously.
  // It blocks internally until hui-dialog-edit-card is defined by HA.
  startInjector()
    .then(() => {
      meta.injected = true;
      console.info(
        `%c CARD-MOD STUDIO %c v${VERSION} `,
        'color: white; background: #03a9f4; font-weight: bold; padding: 2px 4px; border-radius: 3px 0 0 3px;',
        'color: #03a9f4; background: #fff; font-weight: bold; padding: 2px 4px; border-radius: 0 3px 3px 0; border: 1px solid #03a9f4;',
      );
    })
    .catch((err: unknown) => {
      console.error('[Card-Mod Studio] Injection failed:', err);
    });
}

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
import { isCardModInstalled } from './utils/dom-helpers.js';
import type { CardModStudioMeta } from './types/index.js';

const VERSION = '0.3.15';

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

  // Check for card-mod at load time and warn immediately so the user sees it
  // in the browser console even before they open any card editor.
  if (!isCardModInstalled()) {
    console.warn(
      '[Card-Mod Studio] card-mod is not detected. ' +
        'Install card-mod via HACS first. ' +
        'The style editor UI will still open, but generated YAML will not apply until card-mod is present.',
    );
  } else {
    console.info('[Card-Mod Studio] card-mod detected ✓');
  }

  // Start the injection engine asynchronously.
  // It blocks internally until hui-dialog-edit-card is defined by HA.
  startInjector()
    .then(() => {
      meta.injected = true;
      console.info(`[Card-Mod Studio] v${VERSION} loaded and injected successfully.`);
    })
    .catch((err: unknown) => {
      console.error('[Card-Mod Studio] Injection failed:', err);
    });
}

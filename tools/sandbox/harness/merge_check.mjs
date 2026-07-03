// card_mod:/uix: merge-and-cleanup-on-edit verification.
//
// Bug report: editing an already-styled card left a stale duplicate of the
// *other* key's content sitting alongside the new one instead of
// consolidating into a single source of truth. Runs against run-uix.sh's
// UIX-only sandbox (UIX present, card-mod absent) since that's the
// environment the report was filed against, and mounts the real cms-panel
// editor (same technique as compat_check.mjs / uix_matrix.mjs) to verify:
//   1. A card_mod-only card, edited after UIX became the active engine,
//      gets "renamed" to uix: — not duplicated across both keys.
//   2. A card with divergent settings under each key (icon color only in
//      card_mod, an accent-color threshold only in uix) has both merged
//      into the single active uix: block, with card_mod: cleared entirely.
//   3. The user's exact real-world card: both sides define a conflicting
//      accent-color threshold (different rules) *and* card_mod has an
//      extra icon-color block uix doesn't — the active engine's threshold
//      wins outright (not a field-by-field merge of two different rule
//      sets), while the icon color still gets carried over.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { waitForHassReady, makeRecorder, finish } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HA = process.env.HA_URL || 'http://127.0.0.1:8124';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, 'tokens-uix.json'), 'utf8'));

const { results, record } = makeRecorder();

// Mounts cms-panel with `config`, waits for it to settle, then dispatches a
// state-changed event on the named module (the exact event a real user
// interaction with that module produces) to trigger a save, and returns the
// emitted config-changed detail.
const mountEditAndCapture = async (page, config, moduleTag, eventDetail) => page.evaluate(async ({ cfg, moduleTag, eventDetail }) => {
  const hass = document.querySelector('home-assistant').hass;
  let host = document.getElementById('merge-check-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'merge-check-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:900px;z-index:2147483647;';
    document.body.appendChild(host);
  }
  host.innerHTML = '';
  const panel = document.createElement('cms-panel');
  panel.hass = hass; panel.config = cfg; host.appendChild(panel);
  await panel.updateComplete?.catch(() => {});
  await new Promise((r) => setTimeout(r, 500));

  let emitted = null;
  panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });

  const mod = panel.shadowRoot?.querySelector(moduleTag);
  mod?.dispatchEvent(new CustomEvent('state-changed', { detail: eventDetail, bubbles: true, composed: true }));
  await new Promise((r) => setTimeout(r, 300));

  return emitted;
}, { cfg: config, moduleTag, eventDetail });

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });

  const env = await page.evaluate(() => ({
    cardMod: !!customElements.get('card-mod'),
    uix: !!customElements.get('uix-node'),
  }));
  record('sandbox is UIX-only (control for this check)', env.cardMod === false && env.uix === true, JSON.stringify(env));

  // -----------------------------------------------------------------------
  // 1. Rename, not duplicate: card_mod-only card, UIX is the active engine.
  // -----------------------------------------------------------------------
  const renamed = await mountEditAndCapture(
    page,
    { type: 'tile', entity: 'light.ceiling_lights', card_mod: { style: 'ha-state-icon {\n  color: red !important;\n}' } },
    'cms-icon-color-module',
    { enabled: true, mode: 'plain', color: 'red', colorOn: '#2196F3', colorOff: '#6b6b6b' },
  );
  record(
    'card_mod-only card is renamed to uix: (not duplicated) once edited under UIX',
    !!renamed?.uix?.style?.includes('color: red') && renamed?.card_mod === undefined,
    JSON.stringify(renamed),
  );

  // -----------------------------------------------------------------------
  // 2. Merge: icon color only in card_mod, accent color only in uix.
  // -----------------------------------------------------------------------
  const merged = await mountEditAndCapture(
    page,
    {
      type: 'tile',
      entity: 'light.ceiling_lights',
      card_mod: { style: 'ha-state-icon {\n  color: red !important;\n}' },
      uix: { style: 'ha-card {\n  --accent-color: blue;\n}' },
    },
    'cms-icon-color-module',
    { enabled: true, mode: 'plain', color: 'red', colorOn: '#2196F3', colorOff: '#6b6b6b' },
  );
  record(
    'settings unique to each key are merged into uix:, and card_mod: is cleared',
    !!merged?.uix?.style?.includes('color: red') && !!merged?.uix?.style?.includes('--accent-color: blue') && merged?.card_mod === undefined,
    JSON.stringify(merged),
  );

  // -----------------------------------------------------------------------
  // 3. The user's real card: conflicting accent-color thresholds on both
  //    sides (different rules/entities) plus an icon-color block only in
  //    card_mod. The active engine's threshold should win outright (not a
  //    field merge of two different rule sets); icon color still merges in.
  // -----------------------------------------------------------------------
  const real = await mountEditAndCapture(
    page,
    {
      type: 'sensor',
      graph: 'line',
      entity: 'sensor.filament_dryer_ventilator_leistung',
      card_mod: {
        style:
          "ha-card {\n  --accent-color: var(--red-color);\n}\n\nha-state-icon {\n  color: var(--red-color) !important;\n}\n\nha-card {\n  --accent-color: {{ '#f44336' if states('sensor.filament_dryer_ventilator_leistung') | float(0) > 0 else '#888888' }};\n}",
      },
      uix: {
        style:
          "ha-card {\n  --accent-color: var(--red-color);\n  --state-icon-color: var(--red-color);\n  --paper-item-icon-active-color: var(--red-color);\n}\n\nha-card {\n  --accent-color: {{ '#9e9e9e' if states('sensor.filament_dryer_ventilator_leistung') | float(0) <= 0 else '#f44336' }};\n}",
      },
    },
    'cms-icon-color-module',
    { enabled: true, mode: 'plain', color: 'var(--red-color)', colorOn: '#2196F3', colorOff: '#6b6b6b' },
  );
  record(
    "real-world card: uix's own threshold wins outright (its '<= 0' rule, not card_mod's '> 0')",
    !!real?.uix?.style?.includes('<= 0') && !real?.uix?.style?.includes('> 0'),
    JSON.stringify(real?.uix?.style),
  );
  record(
    "real-world card: icon color (only in card_mod) is merged into the active uix: block",
    !!real?.uix?.style?.includes("color: var(--red-color)"),
    JSON.stringify(real?.uix?.style),
  );
  record(
    'real-world card: the stale card_mod: block is fully cleared, not left duplicated',
    real?.card_mod === undefined,
    JSON.stringify(real?.card_mod),
  );

  // -----------------------------------------------------------------------
  // 4. Same merge-and-clean, but for an entities-card row — a separate code
  //    path in cms-panel.ts (_entityRowStyles / _applyEntityRowStyles) from
  //    the card-level one exercised above.
  // -----------------------------------------------------------------------
  const rowResult = await page.evaluate(async () => {
    const hass = document.querySelector('home-assistant').hass;
    let host = document.getElementById('merge-check-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'merge-check-host';
      host.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:900px;z-index:2147483647;';
      document.body.appendChild(host);
    }
    host.innerHTML = '';
    const panel = document.createElement('cms-panel');
    panel.hass = hass;
    panel.config = {
      type: 'entities',
      entities: [{
        entity: 'light.ceiling_lights',
        card_mod: { style: '--state-icon-color: red;' },
        uix: { style: 'color: blue;' },
      }],
    };
    host.appendChild(panel);
    await panel.updateComplete?.catch(() => {});
    await new Promise((r) => setTimeout(r, 500));

    let emitted = null;
    panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });

    const rowsModule = panel.shadowRoot?.querySelector('cms-entities-rows-module');
    // Re-dispatch the same (already-merged) row styles a real edit would
    // produce, to trigger a save without changing the visible outcome.
    rowsModule?.dispatchEvent(new CustomEvent('styles-changed', {
      detail: { 'light.ceiling_lights': { iconColor: 'red', textColor: 'blue' } },
      bubbles: true,
      composed: true,
    }));
    await new Promise((r) => setTimeout(r, 300));

    const row = emitted?.entities?.[0];
    return { uixStyle: row?.uix?.style, cardModStyle: row?.card_mod?.style };
  });
  record(
    'entities-row: icon (card_mod-only) + text (uix-only) merge into the active uix: row block',
    !!rowResult.uixStyle?.includes('--state-icon-color: red') && !!rowResult.uixStyle?.includes('color: blue'),
    JSON.stringify(rowResult),
  );
  record(
    'entities-row: the stale card_mod: row block is cleared, not left duplicated',
    rowResult.cardModStyle === undefined,
    JSON.stringify(rowResult),
  );

  await browser.close();
  finish(writeFileSync, resolve, HERE, 'merge-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

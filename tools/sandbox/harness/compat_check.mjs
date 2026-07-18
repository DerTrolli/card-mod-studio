// card_mod: / uix: cross-compatibility banner verification.
//
// Runs against run.sh's card-mod-only sandbox (card-mod present, UIX absent —
// the exact environment src/utils/style-compat.ts targets). Mounts the real
// cms-panel editor, same technique as editor_audit.mjs, and confirms:
//   1. A card whose only styling is uix: shows the "copy to card_mod" banner,
//      and clicking its button actually populates card_mod.style — i.e. the
//      real _copyUixStyleToCardMod() -> _emitConfigChanged() -> pickOutputKey()
//      chain works end-to-end, not just in isolated unit tests.
//   2. A card whose uix: block uses macros shows the incompatibility warning
//      instead, with no (misleading) fix button.
//   3. A normal card_mod:-only card shows no banner at all (control/regression
//      check — the new banner logic must not fire on ordinary cards).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { waitForHassReady, makeRecorder, finish } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, process.env.TOKENS_FILE || 'tokens.json'), 'utf8'));

const { results, record } = makeRecorder();

const mountPanel = async (page, config) => page.evaluate(async (cfg) => {
  const hass = document.querySelector('home-assistant').hass;
  let host = document.getElementById('compat-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'compat-host';
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

  const banner = panel.shadowRoot?.querySelector('.warning-banner')?.textContent?.replace(/\s+/g, ' ').trim() || null;
  const hasFixButton = !!panel.shadowRoot?.querySelector('.warning-banner .btn-banner-action');

  if (hasFixButton) {
    panel.shadowRoot.querySelector('.warning-banner .btn-banner-action').click();
    await new Promise((r) => setTimeout(r, 300));
  }

  return { banner, hasFixButton, emitted };
}, config);

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });
  // card-mod can register slightly after cms-panel does — wait for it too,
  // or the control check below can flake on a slow/cold run.
  await page.waitForFunction(() => !!customElements.get('card-mod'), { timeout: 30000 }).catch(() => {});

  // Sanity: this sandbox really is card-mod-only, or the checks below prove nothing.
  const env = await page.evaluate(() => ({
    cardMod: !!customElements.get('card-mod'),
    uix: !!customElements.get('uix-node'),
  }));
  record('sandbox is card-mod-only (control for this check)', env.cardMod === true && env.uix === false, JSON.stringify(env));

  const uixOnly = await mountPanel(page, {
    type: 'tile', entity: 'light.ceiling_lights',
    uix: { style: 'ha-card {\n  background: rgb(238, 17, 17);\n}' },
  });
  record(
    'uix-only card shows the copy-to-card_mod banner with a fix button',
    !!uixOnly.banner?.includes('only under uix:') && uixOnly.hasFixButton,
    JSON.stringify(uixOnly.banner),
  );
  record(
    'clicking the fix button populates card_mod.style and keeps uix.style',
    !!uixOnly.emitted?.card_mod?.style && !!uixOnly.emitted?.uix?.style,
    JSON.stringify(uixOnly.emitted),
  );

  const uixMacros = await mountPanel(page, {
    type: 'tile', entity: 'light.ceiling_lights',
    uix: { style: 'ha-card {\n  background: red;\n}', macros: { a: 1 } },
  });
  record(
    'uix macros card shows the incompatibility warning with no fix button',
    !!uixMacros.banner?.includes('macros/billets') && !uixMacros.hasFixButton,
    JSON.stringify(uixMacros.banner),
  );

  const normal = await mountPanel(page, {
    type: 'tile', entity: 'light.ceiling_lights',
    card_mod: { style: 'ha-card {\n  background: red;\n}' },
  });
  record('ordinary card_mod:-only card shows no banner (control/regression check)', normal.banner === null, JSON.stringify(normal.banner));

  await browser.close();

  finish(writeFileSync, resolve, HERE, 'compat-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

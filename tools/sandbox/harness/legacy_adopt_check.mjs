// v0.8.1: legacy/hand-written CSS adoption + "custom CSS is overriding"
// warnings, against the real panel. Also covers the card-mod-authored-card
// -under-UIX flow when run on the UIX sandbox (STYLE_KEY=uix): the input
// card carries card_mod: (as a card-mod-era user would have), the panel
// must read it and write the active engine's key.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { waitForHassReady, makeRecorder, finish } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
mkdirSync(resolve(HERE, 'shots'), { recursive: true });
const HA = process.env.HA_URL || 'http://127.0.0.1:8124';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, process.env.TOKENS_FILE || 'tokens-uix.json'), 'utf8'));
const { results, record } = makeRecorder();

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });

  const probe = async (config, mutateSrc) => page.evaluate(async ({ config, mutateSrc }) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = config;
    host.appendChild(panel);
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));
    const out = { state: JSON.parse(JSON.stringify(panel._studioState)) };
    if (mutateSrc) {
      panel._studioState = new Function('s', `return (${mutateSrc})(s);`)(panel._studioState);
      let emitted = null;
      panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
      panel._emitConfigChanged();
      await new Promise((r) => setTimeout(r, 300));
      out.emitted = emitted;
    }
    // override badge presence on the icon module
    const icon = panel.shadowRoot.querySelector('cms-icon-color-module');
    out.iconOverridden = icon ? icon.overridden : null;
    host.remove();
    return out;
  }, { config, mutateSrc });

  // 1. Legacy v0.3.x :host var adopts into Icon Color; editing overwrites
  //    with today's syntax under the ACTIVE engine key.
  const legacy = await probe(
    { type: 'sensor', entity: 'sensor.outside_temperature',
      card_mod: { style: ':host {\n  --paper-item-icon-color: #ff0000;\n}' } },
    `(s) => ({ ...s, iconColor: { ...s.iconColor, color: '#00ff00', colorOn: '#00ff00' } })`,
  );
  const emittedStyle = legacy.emitted?.uix?.style ?? legacy.emitted?.card_mod?.style ?? '';
  record('legacy :host icon var adopts into Icon Color (plain, red)',
    legacy.state.iconColor.enabled === true && legacy.state.iconColor.color === '#ff0000' &&
      legacy.state.advanced.rawCss === '',
    JSON.stringify(legacy.state.iconColor));
  record('editing regenerates in current syntax and removes the legacy line',
    emittedStyle.includes('ha-state-icon') && emittedStyle.includes('#00ff00') &&
      !emittedStyle.includes('--paper-item-icon-color'),
    emittedStyle.slice(0, 140));

  // 2. Unsupported variant stays verbatim; enabled module shows the warning.
  const conflict = await probe(
    { type: 'sensor', entity: 'sensor.outside_temperature',
      card_mod: { style:
        "ha-state-icon {\n  color: #2196f3 !important;\n}\n\nha-card {\n  --state-icon-color: {{ 'red' if is_state('a.b','heat') else 'blue' if is_state('a.b','cool') else 'grey' }};\n}" } },
  );
  record('unsupported multi-branch variant preserved in Advanced CSS untouched',
    conflict.state.advanced.rawCss.includes('--state-icon-color') &&
      conflict.state.advanced.rawCss.includes('cool'),
    conflict.state.advanced.rawCss.slice(0, 100));
  record('Icon Color module shows the "custom CSS is overriding" badge',
    conflict.iconOverridden === true, String(conflict.iconOverridden));

  await browser.close();
  finish(writeFileSync, resolve, HERE, 'legacy-adopt-check.json', results);
};
run().catch((e) => { console.error('ERR', e); process.exit(1); });

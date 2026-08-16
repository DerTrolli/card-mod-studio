// v0.9.1 hotfix: dictionary-form ($-pierce) styles are preserved verbatim
// through the REAL panel. Verifies:
//   1. A card with a nested dict card_mod.style shows the "preserved as-is"
//      banner and does NOT render the (dead) card-level modules.
//   2. An entities card with a dict-form CARD style keeps per-row editing:
//      a row edit emits a config whose card-level dict is byte-identical
//      and whose row gained the new style.
//   3. A stack child with dict-form styling shows the child-note instead of
//      module controls.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { waitForHassReady, makeRecorder, finish } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, process.env.TOKENS_FILE || 'tokens.json'), 'utf8'));
const STYLE_KEY = process.env.STYLE_KEY || 'card_mod';

const { results, record } = makeRecorder();

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript((t) => { localStorage.setItem('hassTokens', JSON.stringify(t)); }, tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });

  const out = await page.evaluate(async ({ styleKey }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const mk = async (config) => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
      document.querySelector('home-assistant').shadowRoot.appendChild(host);
      const panel = document.createElement('cms-panel');
      panel.hass = document.querySelector('home-assistant').hass;
      panel.config = config;
      host.appendChild(panel);
      await panel.updateComplete;
      await sleep(1200);
      return { panel, host };
    };

    const res = {};

    // ---- 1. nested dict card: banner + no dead modules -------------------
    const dictStyle = { 'ha-state-control-climate-temperature$': { 'ha-big-number$': '.value { font-size: 30px; }' } };
    const a = await mk({ type: 'thermostat', entity: 'climate.heatpump', [styleKey]: { style: dictStyle } });
    const bannerText = [...a.panel.shadowRoot.querySelectorAll('.container-banner')]
      .map((el) => el.textContent).join(' ');
    res.bannerShown = /dictionary form/.test(bannerText) && /preserved/i.test(bannerText);
    res.modulesHidden = !a.panel.shadowRoot.querySelector('cms-icon-color-module, cms-border-module, cms-filter-module');
    a.host.remove();

    // ---- 2. entities card: dict card style frozen, rows still editable ---
    const rowDict = { 'ha-card $': 'h1 { color: purple; }' };
    const b = await mk({
      type: 'entities',
      entities: ['sensor.outside_temperature', 'sensor.outside_humidity'],
      [styleKey]: { style: rowDict },
    });
    let emitted = null;
    b.panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
    const rowsModule = b.panel.shadowRoot.querySelector('cms-entities-rows-module');
    res.rowsModulePresent = !!rowsModule;
    // simulate a row icon-color edit through the panel's own state pipe
    b.panel._entityRowStyles = {
      ...b.panel._entityRowStyles,
      '0': { ...(b.panel._entityRowStyles['0'] ?? {}), iconColor: '#ff0000', textColor: '' },
    };
    b.panel._emitConfigChanged();
    await sleep(400);
    res.rowEditEmitted = !!emitted;
    res.cardDictIntact = JSON.stringify(emitted?.[styleKey]?.style) === JSON.stringify(rowDict);
    const row0 = emitted?.entities?.[0];
    const row0Style = row0?.uix?.style ?? row0?.card_mod?.style ?? null;
    res.rowGotStyle = typeof row0Style === 'string' && row0Style.includes('#ff0000');
    b.host.remove();

    // ---- 3. stack child with dict style: child-note, no controls ---------
    const c = await mk({
      type: 'vertical-stack',
      cards: [
        { type: 'tile', entity: 'light.ceiling_lights', [styleKey]: { style: { 'ha-tile-icon$': 'ha-state-icon { color: red; }' } } },
      ],
    });
    const section = c.panel.shadowRoot.querySelector('cms-child-card-section');
    if (section) { section._open = true; await sleep(400); }
    const noteText = section?.shadowRoot?.textContent ?? '';
    res.childNoteShown = /dictionary form/.test(noteText) && /preserved/i.test(noteText);
    res.childModulesHidden = !section?.shadowRoot?.querySelector('cms-icon-color-module');
    c.host.remove();

    return res;
  }, { styleKey: STYLE_KEY === 'uix' ? 'uix' : 'card_mod' });

  record('dict-form card shows the preserved-as-is banner', out.bannerShown === true, JSON.stringify({ bannerShown: out.bannerShown }));
  record('card-level modules are not rendered for a dict-form card (no dead controls)', out.modulesHidden === true, JSON.stringify({ modulesHidden: out.modulesHidden }));
  record('entities card with dict card style keeps the per-row module', out.rowsModulePresent === true, JSON.stringify({ rowsModulePresent: out.rowsModulePresent }));
  record('a row edit emits with the card-level dict byte-identical', out.rowEditEmitted === true && out.cardDictIntact === true, JSON.stringify({ emitted: out.rowEditEmitted, cardDictIntact: out.cardDictIntact }));
  record('…and the edited row actually gained its style', out.rowGotStyle === true, JSON.stringify({ rowGotStyle: out.rowGotStyle }));
  record('stack child with dict style shows the preserved note instead of controls', out.childNoteShown === true && out.childModulesHidden === true, JSON.stringify({ note: out.childNoteShown, hidden: out.childModulesHidden }));

  await page.screenshot({ path: resolve(SHOTS, 'dict-preserve-01.png') });
  await browser.close();
  finish(writeFileSync, resolve, HERE, 'dict-preserve-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

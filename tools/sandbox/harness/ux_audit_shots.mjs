// One-off visual audit: screenshots of the consistency-pass UI states —
// heading module (reordered + Custom… family), entities rows (per-row font
// slider rows, renamed header, unified add-button), palette manager
// (round swatches, header summary), threshold (attribute select, border
// width slider), advanced module (standard chevron header).
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { waitForHassReady } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });
const HA = process.env.HA_URL || 'http://127.0.0.1:8124';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, process.env.TOKENS_FILE || 'tokens-uix.json'), 'utf8'));

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
  await page.addInitScript((t) => {
    localStorage.setItem('hassTokens', JSON.stringify(t));
    localStorage.setItem('cms-palette', JSON.stringify({
      colors: [{ id: 'c1', name: 'Brand teal', hex: '#00c8aa' }],
      defaults: { offColor: '#123456' },
    }));
  }, tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });

  const mount = async (config, prep) => {
    await page.evaluate(async ({ config, prep }) => {
      document.getElementById('ux-audit-host')?.remove();
      const host = document.createElement('div');
      host.id = 'ux-audit-host';
      host.style.cssText = 'position:fixed;left:0;top:0;width:1000px;height:1400px;background:#111;z-index:2147483647;overflow:auto;';
      document.body.appendChild(host);
      const panel = document.createElement('cms-panel');
      panel.hass = document.querySelector('home-assistant').hass;
      panel.config = config;
      host.appendChild(panel);
      await panel.updateComplete;
      await new Promise((r) => setTimeout(r, 600));
      if (prep) await new Function('panel', `return (async () => { ${prep} })();`)(panel);
      await new Promise((r) => setTimeout(r, 400));
    }, { config, prep });
  };

  // 1. Heading card — module open, custom family selected
  await mount(
    { type: 'heading', heading: 'My Heading', card_mod: { style: '.title p {\n  font-size: 28px;\n  font-weight: 500;\n  font-family: \'Comic Sans MS\';\n  color: #ff0000;\n}' } },
  );
  await page.evaluate(async () => {
    const panel = document.querySelector('#ux-audit-host cms-panel');
    const mod = panel.shadowRoot.querySelector('cms-heading-style-module');
    mod._open = true; await mod.updateComplete;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(SHOTS, 'ux-audit-1-heading.png'), fullPage: false });

  // 2. Entities card — rows module with a row open + per-row font on; palette manager open
  await mount({
    type: 'entities',
    title: 'Sensors',
    entities: ['sensor.outside_temperature', { entity: 'sensor.outside_humidity', card_mod: { style: ':host {\n  font-size: 20px;\n  font-weight: bold;\n}' } }],
  });
  await page.evaluate(async () => {
    const panel = document.querySelector('#ux-audit-host cms-panel');
    const pm = panel.shadowRoot.querySelector('cms-palette-manager');
    pm._open = true; await pm.updateComplete;
    const rows = panel.shadowRoot.querySelector('cms-entities-rows-module');
    rows._openRows = new Set(['sensor.outside_humidity']); await rows.updateComplete;
    const adv = panel.shadowRoot.querySelector('cms-advanced-module');
    adv.open = false;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(SHOTS, 'ux-audit-2-entities-rows-palette.png'), fullPage: false });

  // 3. Sensor card — threshold open with attribute select + border-color property (slider)
  await mount({ type: 'sensor', entity: 'sensor.outside_temperature' });
  await page.evaluate(async () => {
    const panel = document.querySelector('#ux-audit-host cms-panel');
    panel._studioState = {
      ...panel._studioState,
      threshold: {
        ...panel._studioState.threshold,
        enabled: true,
        entityId: 'zone.home',
        attribute: 'latitude',
        properties: ['icon-color', 'border-color'],
        rules: [{ id: 'a', operator: '>=', value: 10, color: '#ff0000' }],
        defaultColor: '#888888',
      },
    };
    await panel.updateComplete;
    const t = panel.shadowRoot.querySelector('cms-threshold-module');
    t._open = true; await t.updateComplete;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(SHOTS, 'ux-audit-3-threshold.png'), fullPage: false });

  await page.evaluate(() => document.getElementById('ux-audit-host')?.remove());
  await browser.close();
  console.log('shots written');
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

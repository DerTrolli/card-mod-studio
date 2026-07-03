// One-off visual verification at a real desktop viewport (1920x1080) — a
// narrow viewport can hide/distort the panel's responsive layout (it stacks
// below ~600px), so this deliberately uses a wide window to confirm the new
// compat banners render correctly at normal desktop size, not just narrow.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { waitForHassReady } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

async function shoot(haUrl, tokensFile, config, filename) {
  const tokens = JSON.parse(readFileSync(resolve(HERE, tokensFile), 'utf8'));
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${haUrl}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });

  await page.evaluate((cfg) => {
    const host = document.createElement('div');
    host.id = 'shot-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:1600px;height:1000px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const hass = document.querySelector('home-assistant').hass;
    const panel = document.createElement('cms-panel');
    panel.hass = hass; panel.config = cfg; host.appendChild(panel);
  }, config);
  await page.waitForTimeout(900);

  await page.screenshot({ path: resolve(SHOTS, filename), clip: { x: 0, y: 0, width: 1600, height: 1000 } });
  await browser.close();
  console.log('wrote', filename);
}

const CARD_MOD_HA = process.env.CARD_MOD_HA || 'http://127.0.0.1:8123';
const UIX_HA = process.env.UIX_HA || 'http://127.0.0.1:8124';

await shoot(CARD_MOD_HA, 'tokens.json', { type: 'tile', entity: 'light.ceiling_lights', card_mod: { style: 'ha-card { background: #223; }' } }, 'desktop-01-normal-cardmod.png');
await shoot(CARD_MOD_HA, 'tokens.json', { type: 'tile', entity: 'light.ceiling_lights', uix: { style: 'ha-card { background: #223; }' } }, 'desktop-02-uixonly-fix-banner.png');
await shoot(CARD_MOD_HA, 'tokens.json', { type: 'tile', entity: 'light.ceiling_lights', uix: { style: 'ha-card { background: #223; }', macros: { a: 1 } } }, 'desktop-03-macros-warning-banner.png');
await shoot(CARD_MOD_HA, 'tokens.json', { type: 'entities', entities: [{ entity: 'light.ceiling_lights', uix: { style: '--state-icon-color: red;' } }] }, 'desktop-04-uixonly-row-banner.png');
await shoot(UIX_HA, 'tokens-uix.json', { type: 'tile', entity: 'light.ceiling_lights', card_mod: { style: 'ha-card { background: #223; }' } }, 'desktop-05-normal-uix.png');

console.log('\nAll screenshots in', SHOTS);

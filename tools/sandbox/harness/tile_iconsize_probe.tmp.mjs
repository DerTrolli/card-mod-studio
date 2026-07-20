import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { waitForHassReady } from './harness-utils.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(resolve(HERE, 'tokens.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.addInitScript((t) => { localStorage.setItem('hassTokens', JSON.stringify(t)); }, tokens);
await page.goto(`http://127.0.0.1:8123/lovelace/0`, { waitUntil: 'domcontentloaded' });
await waitForHassReady(page);
await page.waitForFunction(() => !!(customElements.get('card-mod') || customElements.get('uix-node')), { timeout: 30000 });
const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const variants = {
    'ha-tile-icon var': 'ha-tile-icon {\n  --mdc-icon-size: 40px;\n}',
    'ha-card tile-icon vars': 'ha-card {\n  --tile-icon-size: 40px;\n  --ha-tile-icon-size: 40px;\n}',
  };
  const res = {};
  for (const [name, style] of Object.entries(variants)) {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:500px;z-index:2147483647;background:#111;';
    document.querySelector('home-assistant').shadowRoot.appendChild(host);
    const helpers = await window.loadCardHelpers();
    const card = helpers.createCardElement({ type: 'tile', entity: 'light.ceiling_lights', card_mod: { style } });
    card.hass = document.querySelector('home-assistant').hass;
    host.appendChild(card);
    await sleep(1800);
    const sizes = [];
    const stack = [card];
    while (stack.length) {
      const n = stack.pop();
      const t = n.tagName?.toLowerCase();
      if (t === 'ha-svg-icon' || t === 'ha-tile-icon') {
        const r = n.getBoundingClientRect();
        sizes.push(t + ':' + Math.round(r.width));
      }
      if (n.shadowRoot) stack.push(...n.shadowRoot.children);
      if (n.children) stack.push(...n.children);
    }
    res[name] = sizes;
    host.remove();
  }
  return res;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();

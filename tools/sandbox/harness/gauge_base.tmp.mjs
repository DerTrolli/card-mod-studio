import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const HERE = '/home/user/card-mod-studio/tools/sandbox/harness';
const { waitForHassReady } = await import(resolve(HERE, 'harness-utils.mjs'));
const tokens = JSON.parse(readFileSync(resolve(HERE, 'tokens.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.addInitScript((t) => { localStorage.setItem('hassTokens', JSON.stringify(t)); }, tokens);
await page.goto(`http://127.0.0.1:8123/lovelace/0`, { waitUntil: 'domcontentloaded' });
await waitForHassReady(page);
await page.waitForFunction(() => !!customElements.get('card-mod'), { timeout: 30000 });
const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await customElements.whenDefined('hui-card');
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:460px;z-index:2147483647;background:#fff;';
  document.querySelector('home-assistant').shadowRoot.appendChild(host);
  const measure = async (style) => {
    const card = document.createElement('hui-card');
    card.hass = document.querySelector('home-assistant').hass;
    card.config = { type: 'gauge', entity: 'sensor.outside_temperature', ...(style ? { card_mod: { style } } : {}) };
    host.appendChild(card);
    await sleep(3000);
    const s = [card]; let t = null;
    while (s.length) { const n = s.pop(); if (n.matches?.('ha-gauge')) { t = n.shadowRoot?.querySelector('.value-text'); break; } if (n.shadowRoot) s.push(...n.shadowRoot.children); if (n.children) s.push(...n.children); }
    const r = t?.getBoundingClientRect();
    const out = t ? { fontSize: getComputedStyle(t).fontSize, h: Math.round(r.height), w: Math.round(r.width) } : null;
    card.remove();
    return out;
  };
  const base = await measure(null);
  const small = await measure({ 'ha-gauge$': 'text.value-text {\n  font-size: 8px !important;\n}' });
  const big = await measure({ 'ha-gauge$': 'text.value-text {\n  font-size: 30px !important;\n}' });
  host.remove();
  return { base, small, big };
});
console.log(JSON.stringify(out));
await browser.close();

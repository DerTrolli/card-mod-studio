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
  // structure first: mount a bare glance card, inspect where the icon lives + color source
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:460px;z-index:2147483647;background:#fff;';
  document.querySelector('home-assistant').shadowRoot.appendChild(host);
  const mk = async (style) => {
    const card = document.createElement('hui-card');
    card.hass = document.querySelector('home-assistant').hass;
    card.config = { type: 'glance', entities: ['light.ceiling_lights'], ...(style ? { card_mod: { style } } : {}) };
    host.appendChild(card);
    await sleep(2500);
    const find = (sel) => { const s = [card]; while (s.length) { const n = s.pop(); if (n.matches?.(sel)) return n; if (n.shadowRoot) s.push(...n.shadowRoot.children); if (n.children) s.push(...n.children); } return null; };
    return { card, find };
  };
  const a = await mk(null);
  const badge = a.find('state-badge');
  const icon = a.find('ha-state-icon');
  const struct = {
    iconInBadgeShadow: badge?.shadowRoot ? [...badge.shadowRoot.querySelectorAll('*')].includes(icon) : null,
    badgeInlineStyle: badge?.getAttribute('style'),
    iconInlineStyle: icon?.getAttribute('style'),
    badgeShadowHtml: badge?.shadowRoot?.innerHTML?.slice(0, 250) ?? null,
    baselineColor: icon ? getComputedStyle(icon).color : null,
  };
  a.card.remove();
  const variants = {
    'state-badge$ :host': { 'state-badge$': ':host {\n  color: rgb(255, 0, 0) !important;\n}' },
    'state-badge$ ha-state-icon': { 'state-badge$': 'ha-state-icon {\n  color: rgb(255, 0, 0) !important;\n}' },
    'plain state-badge selector': 'state-badge {\n  color: rgb(255, 0, 0) !important;\n}',
  };
  const results = {};
  for (const [name, style] of Object.entries(variants)) {
    const b = await mk(style);
    const i2 = b.find('ha-state-icon');
    results[name] = i2 ? getComputedStyle(i2).color : null;
    b.card.remove();
  }
  host.remove();
  return { struct, results };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();

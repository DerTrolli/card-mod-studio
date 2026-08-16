// v0.10 feasibility probe: dict-form $-pierce unlocks, on real card-mod.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const HERE = '/home/user/card-mod-studio/tools/sandbox/harness';
const { waitForHassReady } = await import(resolve(HERE, 'harness-utils.mjs'));
const TOKENS_FILE = process.env.TOKENS_FILE || 'tokens.json';
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const STYLE_KEY = process.env.STYLE_KEY || 'card_mod';
const tokens = JSON.parse(readFileSync(resolve(HERE, TOKENS_FILE), 'utf8'));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.addInitScript((t) => { localStorage.setItem('hassTokens', JSON.stringify(t)); }, tokens);
await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
await waitForHassReady(page);
await page.waitForFunction(() => !!(customElements.get('card-mod') || customElements.get('uix-node')), { timeout: 30000 });

const CASES = [
  {
    name: 'glance icon color via state-badge$ pierce',
    cfg: { type: 'glance', entities: ['light.ceiling_lights'] },
    style: { 'state-badge$': 'ha-state-icon {\n  color: rgb(255, 0, 0) !important;\n}' },
    probe: `(find) => {
      const icon = find('ha-state-icon');
      if (!icon) return null;
      const c = getComputedStyle(icon).color;
      return { value: c, hit: c === 'rgb(255, 0, 0)' };
    }`,
  },
  {
    name: 'thermostat big number size via double pierce',
    cfg: { type: 'thermostat', entity: 'climate.heatpump' },
    style: { 'ha-state-control-climate-temperature$': { 'ha-big-number$': '.value {\n  font-size: 30px !important;\n}' } },
    probe: `(find) => {
      const bn = find('ha-big-number');
      const p = bn?.shadowRoot?.querySelector('.value');
      if (!p) return null;
      const fs = getComputedStyle(p).fontSize;
      return { value: fs, hit: fs === '30px' };
    }`,
  },
  {
    name: 'gauge value-text size via ha-gauge$ (honesty check — SVG auto-scale)',
    cfg: { type: 'gauge', entity: 'sensor.outside_temperature' },
    style: { 'ha-gauge$': 'text.value-text {\n  font-size: 30px !important;\n}' },
    probe: `(find) => {
      const g = find('ha-gauge');
      const t = g?.shadowRoot?.querySelector('.value-text');
      if (!t) return null;
      const r = t.getBoundingClientRect();
      const fs = getComputedStyle(t).fontSize;
      return { value: fs + ' rendered ' + Math.round(r.height) + 'px tall', hit: fs === '30px' };
    }`,
  },
];
for (const c of CASES) {
  const out = await page.evaluate(async ({ cfg, style, styleKey, probeSrc }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await customElements.whenDefined('hui-card');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:460px;z-index:2147483647;background:#fff;';
    document.querySelector('home-assistant').shadowRoot.appendChild(host);
    const card = document.createElement('hui-card');
    card.hass = document.querySelector('home-assistant').hass;
    card.config = { ...cfg, [styleKey]: { style } };
    host.appendChild(card);
    const findDeep = (sel) => { const s = [card]; while (s.length) { const n = s.pop(); if (n.matches?.(sel)) return n; if (n.shadowRoot) s.push(...n.shadowRoot.children); if (n.children) s.push(...n.children); } return null; };
    const probe = new Function('find', `return (${probeSrc})(find);`);
    let out = null;
    for (let i = 0; i < 25; i++) {
      await sleep(400);
      card.hass = { ...document.querySelector('home-assistant').hass };
      out = probe(findDeep);
      if (out?.hit) break;
    }
    host.remove();
    return out;
  }, { cfg: c.cfg, style: c.style, styleKey: STYLE_KEY === 'uix' ? 'uix' : 'card_mod', probeSrc: c.probe });
  console.log((out?.hit ? '✅' : '❌'), c.name, JSON.stringify(out));
}
await browser.close();

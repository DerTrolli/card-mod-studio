// Utility: render each card type standalone and report whether it mounts cleanly
// (real ha-card, no hui-warning/error). Use this to discover which card types
// can be measured programmatically vs need a real dashboard (see button_matrix).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, 'tokens.json'), 'utf8'));

const CARDS = {
  tile: { type: 'tile', entity: 'light.ceiling_lights' },
  button: { type: 'button', entity: 'light.ceiling_lights' },
  entity: { type: 'entity', entity: 'light.ceiling_lights' },
  glance: { type: 'glance', entities: ['light.ceiling_lights', 'switch.decorative_lights'] },
  sensor: { type: 'sensor', entity: 'sensor.outside_temperature', graph: 'none' },
  gauge: { type: 'gauge', entity: 'sensor.outside_temperature', min: 0, max: 40 },
  light: { type: 'light', entity: 'light.ceiling_lights' },
  thermostat: { type: 'thermostat', entity: 'climate.heatpump' },
  humidifier: { type: 'humidifier', entity: 'humidifier.humidifier' },
  'alarm-panel': { type: 'alarm-panel', entity: 'alarm_control_panel.security' },
  'media-control': { type: 'media-control', entity: 'media_player.living_room' },
  'weather-forecast': { type: 'weather-forecast', entity: 'weather.demo_weather_south' },
  'history-graph': { type: 'history-graph', entities: ['sensor.outside_temperature'] },
  markdown: { type: 'markdown', content: 'Hello' },
  heading: { type: 'heading', heading: 'My Heading', icon: 'mdi:home' },
  entities: { type: 'entities', entities: ['light.ceiling_lights', 'sensor.outside_temperature'] },
};

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 420, height: 320 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const ha = document.querySelector('home-assistant');
    return !!(ha && ha.hass && ha.hass.states && Object.keys(ha.hass.states).length > 10);
  }, { timeout: 60000 });
  await page.evaluate(() => customElements.whenDefined('hui-card'));

  const results = await page.evaluate(async (CARDS) => {
    const hass = document.querySelector('home-assistant').hass;
    const h = document.createElement('div'); h.style.cssText = 'position:fixed;left:0;top:0;width:380px;z-index:9999'; document.body.appendChild(h);
    const all = (root, tag) => { const o = []; const s = [root]; tag = tag.toLowerCase();
      while (s.length) { const n = s.pop(); if (n.tagName && n.tagName.toLowerCase() === tag) o.push(n);
        if (n.shadowRoot) s.push(...n.shadowRoot.children); if (n.children) s.push(...n.children); } return o; };
    const out = {};
    for (const [name, cfg] of Object.entries(CARDS)) {
      h.innerHTML = '';
      const c = document.createElement('hui-card'); c.hass = hass; c.config = cfg; h.appendChild(c);
      if (c.updateComplete) await c.updateComplete;
      await new Promise((r) => setTimeout(r, 1600));
      const err = all(c, 'hui-error-card').length || all(c, 'hui-warning').length;
      out[name] = { ok: !err && !!all(c, 'ha-card').length, stateIcon: all(c, 'ha-state-icon').length };
    }
    return out;
  }, CARDS);

  console.log('type'.padEnd(18), 'mount', 'state-icon');
  for (const [k, v] of Object.entries(results)) console.log(k.padEnd(18), (v.ok ? 'OK' : 'FAIL').padEnd(5), v.stateIcon);
  await browser.close();
};
run().catch((e) => { console.error('ERR', e); process.exit(1); });

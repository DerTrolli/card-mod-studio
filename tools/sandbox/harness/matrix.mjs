// Empirical card x setting support matrix.
// Renders each card type via <hui-card>, applies the CSS the tool emits per
// setting, and measures whether the target element's computed style actually
// changed vs baseline. Output: matrix.json + matrix.md.
//
// Covers the 15 card types that mount cleanly standalone. The `button` card
// can't mount standalone (needs real dashboard context) — see button_matrix.mjs.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, 'tokens.json'), 'utf8'));

const CARDS = {
  tile: { type: 'tile', entity: 'light.ceiling_lights' },
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
  markdown: { type: 'markdown', content: 'Hello world' },
  heading: { type: 'heading', heading: 'My Heading', icon: 'mdi:home' },
  entities: { type: 'entities', entities: ['light.ceiling_lights', 'sensor.outside_temperature'] },
};

// setting -> { css the tool emits, target element tag, computed property }
export const SETTINGS = {
  icon_color:    { css: 'ha-state-icon {\n  color: #ee1111 !important;\n}', tag: 'ha-state-icon', prop: 'color' },
  accent_color:  { css: 'ha-card {\n  --accent-color: #ee1111;\n  --tile-color: #ee1111;\n  --gauge-color: #ee1111;\n  --state-icon-color: #ee1111;\n  --paper-item-icon-active-color: #ee1111;\n}', tag: 'ha-state-icon', prop: 'color' },
  background:    { css: 'ha-card {\n  background: #112244;\n}', tag: 'ha-card', prop: 'background-color' },
  border_radius: { css: 'ha-card {\n  border-radius: 28px;\n}', tag: 'ha-card', prop: 'border-top-left-radius' },
  border:        { css: 'ha-card {\n  border: 3px solid #11ee11;\n}', tag: 'ha-card', prop: 'border-top-width' },
  filter:        { css: 'ha-card {\n  filter: grayscale(100%);\n}', tag: 'ha-card', prop: 'filter' },
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

  await page.evaluate(() => {
    window.__all = (root, tag) => { const o = []; const s = [root]; tag = tag.toLowerCase();
      while (s.length) { const n = s.pop(); if (n.tagName && n.tagName.toLowerCase() === tag) o.push(n);
        if (n.shadowRoot) s.push(...n.shadowRoot.children); if (n.children) s.push(...n.children); } return o; };
    const h = document.createElement('div'); h.id = 'bench';
    h.style.cssText = 'position:fixed;left:0;top:0;width:380px;z-index:2147483647;background:#0b0b0b;padding:12px';
    document.body.appendChild(h);
    window.__render = async (cfg) => {
      const hass = document.querySelector('home-assistant').hass;
      const b = document.getElementById('bench'); b.innerHTML = '';
      const c = document.createElement('hui-card'); c.hass = hass; c.config = cfg; b.appendChild(c);
      if (c.updateComplete) await c.updateComplete;
      await new Promise((r) => setTimeout(r, 1200));
      return c;
    };
    window.__read = (tag, prop) => {
      const el = window.__all(document.querySelector('#bench hui-card'), tag)[0];
      if (!el) return null;
      const cs = getComputedStyle(el);
      return prop.startsWith('--') ? cs.getPropertyValue(prop).trim() : cs[prop];
    };
  });

  const matrix = {};
  for (const [cname, base] of Object.entries(CARDS)) {
    matrix[cname] = {};
    await page.evaluate((cfg) => window.__render(cfg), base);
    const baseVals = {};
    for (const [skey, s] of Object.entries(SETTINGS)) baseVals[skey] = await page.evaluate(({ t, p }) => window.__read(t, p), { t: s.tag, p: s.prop });
    for (const [skey, s] of Object.entries(SETTINGS)) {
      await page.evaluate((cfg) => window.__render(cfg), { ...base, card_mod: { style: s.css } });
      const v = await page.evaluate(({ t, p }) => window.__read(t, p), { t: s.tag, p: s.prop });
      const verdict = v === null ? 'no-target' : v !== baseVals[skey] ? 'effect' : 'no-effect';
      matrix[cname][skey] = { verdict, before: baseVals[skey], after: v };
    }
    console.log('measured', cname);
  }
  await browser.close();

  const ICON = { effect: '✅', 'no-effect': '❌', 'no-target': '—', missing: '?' };
  const skeys = Object.keys(SETTINGS);
  let md = '| card | ' + skeys.join(' | ') + ' |\n|' + '---|'.repeat(skeys.length + 1) + '\n';
  for (const c of Object.keys(matrix)) md += `| ${c} | ` + skeys.map((s) => ICON[matrix[c][s].verdict]).join(' | ') + ' |\n';
  writeFileSync(resolve(HERE, 'matrix.json'), JSON.stringify(matrix, null, 2));
  writeFileSync(resolve(HERE, 'matrix.md'), md);
  console.log('\n' + md + '\nlegend: ✅ effect  ❌ no-effect  — element not present');
  console.log('wrote matrix.json + matrix.md  (run button_matrix.mjs to add the button row)');
};

// Only run when invoked directly (button_matrix.mjs imports SETTINGS from here).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run().catch((e) => { console.error('ERR', e); process.exit(1); });
}

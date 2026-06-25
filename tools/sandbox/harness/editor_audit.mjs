// Editor-panel UX audit: render the REAL cms-panel editor for each card type,
// screenshot it, and extract which modules are offered. The panel renders its
// editor UI independent of whether the card itself mounts, so every card type
// can be audited (including button). Requires the built plugin to be loaded as
// a resource (run.sh copies dist/card-mod-studio.js into config/www).
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, 'tokens.json'), 'utf8'));

const CARDS = {
  tile: { type: 'tile', entity: 'light.ceiling_lights' },
  entity: { type: 'entity', entity: 'light.ceiling_lights' },
  button: { type: 'button', entity: 'light.ceiling_lights' },
  light: { type: 'light', entity: 'light.ceiling_lights' },
  sensor: { type: 'sensor', entity: 'sensor.outside_temperature' },
  gauge: { type: 'gauge', entity: 'sensor.outside_temperature' },
  thermostat: { type: 'thermostat', entity: 'climate.heatpump' },
  'alarm-panel': { type: 'alarm-panel', entity: 'alarm_control_panel.security' },
  'media-control': { type: 'media-control', entity: 'media_player.living_room' },
  glance: { type: 'glance', entities: ['light.ceiling_lights'] },
  heading: { type: 'heading', heading: 'H', icon: 'mdi:home' },
  entities: { type: 'entities', entities: ['light.ceiling_lights'] },
  markdown: { type: 'markdown', content: 'hi' },
  grid: { type: 'grid', cards: [] },
};

// Render wide enough that the fixed 280px preview pane doesn't crowd the controls.
const W = Number(process.env.AUDIT_WIDTH || 880);

const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: W, height: 1200 }, deviceScaleFactor: 2 });
await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const h = document.querySelector('home-assistant'); return !!(h && h.hass && h.hass.states && Object.keys(h.hass.states).length > 10); }, { timeout: 60000 });
await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });
await page.evaluate((w) => {
  const host = document.createElement('div'); host.id = 'audit-host';
  host.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:1180px;background:var(--card-background-color,#1c1c1c);z-index:2147483647;overflow:hidden;`;
  document.body.appendChild(host);
}, W);

const audit = {};
for (const [name, config] of Object.entries(CARDS)) {
  const modules = await page.evaluate(async (config) => {
    const hass = document.querySelector('home-assistant').hass;
    const host = document.getElementById('audit-host'); host.innerHTML = '';
    const panel = document.createElement('cms-panel');
    panel.hass = hass; panel.config = config; host.appendChild(panel);
    await panel.updateComplete?.catch(() => {});
    await new Promise((r) => setTimeout(r, 700));
    const found = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        const tag = el.tagName.toLowerCase();
        if (tag.startsWith('cms-') && tag.endsWith('-module')) found.push(el.shadowRoot?.querySelector('.module-title')?.textContent?.trim() || tag);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    if (panel.shadowRoot) walk(panel.shadowRoot);
    const banner = panel.shadowRoot?.querySelector('.container-banner,.info-banner')?.textContent?.trim()?.slice(0, 80) || null;
    return { found, banner };
  }, config);
  audit[name] = modules;
  const h = await page.evaluate(() => {
    const sr = document.querySelector('#audit-host cms-panel')?.shadowRoot;
    if (!sr) return 200; let t = 0; for (const c of sr.children) t += c.scrollHeight;
    return Math.min(Math.max(t + 24, 120), 1180);
  });
  await page.screenshot({ path: resolve(SHOTS, `editor-${name}.png`), clip: { x: 0, y: 0, width: W, height: h } });
  console.log(name.padEnd(15), '->', modules.found.join(' | ') || (modules.banner ? `[banner] ${modules.banner}` : '(none)'));
}
writeFileSync(resolve(HERE, 'editor-audit.json'), JSON.stringify(audit, null, 2));
await b.close();
console.log('\nscreenshots in', SHOTS);

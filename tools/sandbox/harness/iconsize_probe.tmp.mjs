// TEMP probe: does `ha-card { --mdc-icon-size / --ha-icon-size }` resize the
// main icon on each card type where the Icon Color module is offered?
import { chromium } from 'playwright';
import { readFileSync, } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { waitForHassReady } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const STYLE_KEY = process.env.STYLE_KEY || 'card_mod';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, process.env.TOKENS_FILE || 'tokens.json'), 'utf8'));

const CARDS = [
  { type: 'tile', entity: 'light.ceiling_lights' },
  { type: 'button', entity: 'light.ceiling_lights' },
  { type: 'entity', entity: 'sensor.outside_temperature' },
  { type: 'sensor', entity: 'sensor.outside_temperature' },
  { type: 'light', entity: 'light.ceiling_lights' },
  { type: 'alarm-panel', entity: 'alarm_control_panel.security' },
  { type: 'media-control', entity: 'media_player.living_room' },
  { type: 'picture-glance', entities: ['light.ceiling_lights'], image: 'https://demo.home-assistant.io/stub_config/bedroom.png' },
  { type: 'glance', entities: ['sensor.outside_temperature'] },
  { type: 'entities', entities: ['sensor.outside_temperature'] },
];
const STYLE = 'ha-card {\n  --mdc-icon-size: 40px;\n  --ha-icon-size: 40px;\n}';

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript((t) => { localStorage.setItem('hassTokens', JSON.stringify(t)); }, tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!(customElements.get('card-mod') || customElements.get('uix-node')), { timeout: 30000 });

  for (const base of CARDS) {
    const out = await page.evaluate(async ({ cfg, styleKey, style }) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const mk = async (config) => {
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:0;top:0;width:500px;z-index:2147483647;background:#111;';
        document.querySelector('home-assistant').shadowRoot.appendChild(host);
        const helpers = await window.loadCardHelpers();
        const card = helpers.createCardElement(config);
        card.hass = document.querySelector('home-assistant').hass;
        host.appendChild(card);
        await sleep(1800);
        // find candidate icons: first ha-state-icon / ha-svg-icon / ha-icon in tree
        const icons = [];
        const stack = [card];
        while (stack.length) {
          const n = stack.pop();
          const t = n.tagName?.toLowerCase();
          if (t === 'ha-svg-icon') {
            const r = n.getBoundingClientRect();
            if (r.width > 0) icons.push(Math.round(r.width));
          }
          if (n.shadowRoot) stack.push(...n.shadowRoot.children);
          if (n.children) stack.push(...n.children);
        }
        return { icons, host };
      };
      const a = await mk(cfg);
      const b = await mk({ ...cfg, [styleKey]: { style } });
      a.host.remove(); b.host.remove();
      return { before: a.icons, after: b.icons };
    }, { cfg: base, styleKey: STYLE_KEY === 'uix' ? 'uix' : 'card_mod', style: STYLE });
    console.log(base.type.padEnd(16), 'before', JSON.stringify(out.before), ' after', JSON.stringify(out.after));
  }
  await browser.close();
};
run().catch((e) => { console.error('ERR', e.message); process.exit(1); });

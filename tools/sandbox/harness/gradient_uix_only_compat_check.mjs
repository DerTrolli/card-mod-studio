// UIX-only counterpart to gradient_uix_compat_check.mjs — same question
// (does the brace-free gradient marker actually apply against the real
// engine, not just this project's own parser?), but against a genuine UIX
// install via a uix: style block, not card_mod:. Run against
// tools/sandbox/run-uix.sh's instance (port 8124, tokens-uix.json), not
// the card-mod sandbox.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { waitForHassReady, makeRecorder, finish } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });
const HA = process.env.HA_URL || 'http://127.0.0.1:8124';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, 'tokens-uix.json'), 'utf8'));

const { results, record } = makeRecorder();
const ENTITY = 'sensor.outside_temperature';

const STOPS_MARKER = '50:#9E9E9E,100:#FFEB3B,130:#FF9800,180:#F44336,250:#9C27B0';
const style = (entity) => `ha-state-icon {
  --cms-gradient-stops: '${STOPS_MARKER}';
  color: {{ '#FFEB3B' if is_state('${entity}', 'on') else '#9E9E9E' }} !important;
}`;

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);

  // Poll: uix-node registers when UIX's frontend resource executes, which can
  // lag domcontentloaded by several seconds right after a sandbox (re)start —
  // a single instantaneous probe here produced a false FAIL against a
  // perfectly working UIX install. The backend component list is checked as
  // the authoritative fallback, mirroring isUixInstalled() in the product.
  const uixDetected = await page.evaluate(async () => {
    for (let i = 0; i < 20; i++) {
      if (customElements.get('uix-node')) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return !!document.querySelector('home-assistant')?.hass?.config?.components?.includes('uix');
  });
  record('UIX is actually installed in this sandbox', uixDetected);

  const rendered = await page.evaluate(async ({ entity, style }) => {
    await customElements.whenDefined('hui-card');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:200px;z-index:2147483647;';
    document.body.appendChild(host);
    const hass = document.querySelector('home-assistant').hass;
    const card = document.createElement('hui-card');
    card.hass = hass;
    card.config = { type: 'tile', entity, uix: { style } };
    host.appendChild(card);

    const findAll = (root, tag) => {
      const out = []; const stack = [root];
      while (stack.length) {
        const n = stack.pop();
        if (n.tagName && n.tagName.toLowerCase() === tag) out.push(n);
        if (n.shadowRoot) stack.push(...n.shadowRoot.children);
        if (n.children) stack.push(...n.children);
      }
      return out;
    };

    let icon = null;
    let color = null;
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 500));
      icon = findAll(card, 'ha-state-icon')[0];
      if (icon) {
        color = getComputedStyle(icon).color;
        if (color && color !== 'rgba(0, 0, 0, 0)') break;
      }
    }
    return { iconFound: !!icon, color };
  }, { entity: ENTITY, style: style(ENTITY) });

  await page.screenshot({ path: resolve(SHOTS, 'gradient-uix-only-01.png') });

  // sensor.outside_temperature has no on/off state, so is_state(...,'on')
  // is false -> expect the gray (#9E9E9E = rgb(158,158,158)) else-branch.
  record('ha-state-icon found in the real UIX-rendered card', rendered.iconFound, JSON.stringify(rendered));
  record(
    'UIX applied the color declaration correctly (uix: block, brace-free marker present in the same block)',
    rendered.color === 'rgb(158, 158, 158)',
    rendered.color,
  );

  await browser.close();
  finish(writeFileSync, resolve, HERE, 'gradient-uix-only-compat-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

// Confirms the full pipeline works against *real* card-mod: drives the
// actual Studio UI to produce gradient-mode CSS for 5 points (matching a
// real user report almost exactly), then mounts that exact generated style
// on a genuine <hui-card> (not the Studio's own editor) and checks the
// rendered getComputedStyle color — the real signal, not just "did a
// <style> tag show up" (unreliable — see the whenDefined() note below) or
// "did the config get accepted without throwing."
//
// This exists because of a real, confirmed bug: the original gradient
// marker was JSON (`--cms-gradient-stops: '[{"v":0,...}]'`), and real
// card-mod's own style-string parsing — not this project's — silently
// fails to apply ANY declaration in the block the instant a `{`/`}`
// character appears in a custom property's value, even safely inside a
// quoted string a spec-compliant CSS tokenizer would treat as inert.
// Confirmed by isolating single-character-class variants against a live
// card-mod instance. Fixed by switching to a brace-free `value:color,...`
// encoding (encodeGradientStops in css-generator.ts).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { waitForHassReady, makeRecorder, finish } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, 'tokens.json'), 'utf8'));

const { results, record } = makeRecorder();
const ENTITY = 'sensor.outside_temperature';

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });
  await page.evaluate(() => customElements.whenDefined('hui-card'));

  // Step 1 — drive the real Studio UI (not a hand-written string) to
  // produce the exact CSS it would generate for 5 gradient points.
  const generated = await page.evaluate(async (entity) => {
    const host = document.createElement('div');
    host.id = 'compat-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:1200px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const hass = document.querySelector('home-assistant').hass;
    const panel = document.createElement('cms-panel');
    panel.hass = hass;
    panel.config = { type: 'tile', entity, card_mod: { style: '' } };
    host.appendChild(panel);
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 500)); // let cms-panel's async _initState settle

    const mod = panel.shadowRoot.querySelector('cms-threshold-module');
    if (!mod) return null;
    await mod.updateComplete;
    const sw = mod.shadowRoot.querySelector('ha-switch');
    sw.checked = true;
    sw.dispatchEvent(new Event('change', { bubbles: true }));
    await mod.updateComplete;
    await panel.updateComplete;
    await mod.updateComplete;
    const modeSelect = [...mod.shadowRoot.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'gradient'));
    modeSelect.value = 'gradient';
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await mod.updateComplete;

    let emitted = null;
    panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
    mod.dispatchEvent(new CustomEvent('state-changed', {
      detail: {
        ...mod.state,
        colorStops: [
          { id: 'a', value: 50, color: '#9E9E9E' },
          { id: 'b', value: 100, color: '#FFEB3B' },
          { id: 'c', value: 130, color: '#FF9800' },
          { id: 'd', value: 180, color: '#F44336' },
          { id: 'e', value: 250, color: '#9C27B0' },
        ],
      },
    }));
    await mod.updateComplete;
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 300));
    host.remove();
    return emitted?.card_mod?.style ?? null;
  }, ENTITY);

  record('Studio UI generated a gradient style for 5 points', !!generated, generated?.slice(0, 150));
  record('Generated marker line contains no braces', !generated?.split('\n').find((l) => l.includes('--cms-gradient-stops'))?.match(/[{}]/), 'checked');

  const entityValue = await page.evaluate((entity) => {
    const hass = document.querySelector('home-assistant').hass;
    return parseFloat(hass.states[entity]?.state ?? 'nan');
  }, ENTITY);

  // Step 2 — mount that exact generated style on a genuine <hui-card> (not
  // the Studio's editor) and read the real computed color. Poll instead of
  // a fixed sleep since card-mod's Jinja render is an async server round
  // trip with variable latency.
  const rendered = await page.evaluate(async ({ entity, style }) => {
    await customElements.whenDefined('hui-card');
    const host = document.createElement('div');
    host.id = 'compat-render-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:200px;z-index:2147483647;';
    document.body.appendChild(host);
    const hass = document.querySelector('home-assistant').hass;
    const card = document.createElement('hui-card');
    card.hass = hass;
    card.config = { type: 'tile', entity, card_mod: { style } };
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
        // rgb(158, 158, 158) is exactly the lowest stop's gray — a real
        // signal the style landed, not just "some default color exists".
        if (color && color !== 'rgba(0, 0, 0, 0)') break;
      }
    }
    return { iconFound: !!icon, color };
  }, { entity: ENTITY, style: generated });

  await page.screenshot({ path: resolve(SHOTS, 'gradient-uix-compat-01.png') });

  // Independently recompute the expected color from the same stops.
  const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const stops = [
    { v: 50, c: '#9E9E9E' }, { v: 100, c: '#FFEB3B' }, { v: 130, c: '#FF9800' },
    { v: 180, c: '#F44336' }, { v: 250, c: '#9C27B0' },
  ];
  const clamped = Math.max(stops[0].v, Math.min(stops[stops.length - 1].v, entityValue));
  let seg = stops[0], next = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i].v && clamped <= stops[i + 1].v) { seg = stops[i]; next = stops[i + 1]; break; }
  }
  const t = next.v === seg.v ? 0 : (clamped - seg.v) / (next.v - seg.v);
  const [r1, g1, b1] = hexToRgb(seg.c);
  const [r2, g2, b2] = hexToRgb(next.c);
  const expected = [r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t].map(Math.round);
  const actual = (rendered.color?.match(/\d+/g) ?? []).map(Number).slice(0, 3);
  const closeEnough = actual.length === 3 && actual.every((v, i) => Math.abs(v - expected[i]) <= 12); // step-approximation tolerance

  record('ha-state-icon found in the real rendered card', rendered.iconFound, JSON.stringify(rendered));
  record(
    `Rendered color matches the expected interpolated color at value=${entityValue} (within step-approximation tolerance)`,
    closeEnough,
    `rendered=rgb(${actual.join(',')}) expected~=rgb(${expected.join(',')})`,
  );

  await browser.close();
  finish(writeFileSync, resolve, HERE, 'gradient-uix-compat-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

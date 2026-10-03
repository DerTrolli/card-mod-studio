// Heading Style on HA 2026.9 AND 2026.10 (v0.10.0).
//
// HA 2026.10 replaced the heading title's <p> with <h2 class="heading">
// (<h3> for heading_style: subtitle), so the pre-v0.10 `.title p` output
// stopped styling anything. This drives the REAL panel, renders the config
// it EMITS, and measures the rendered result:
//   1. title-style heading: size / colour / weight / family / icon size /
//      icon colour / alignment all land;
//   2. the same for a subtitle-style heading (never reached before v0.10);
//   3. a pre-v0.10 config (`.title p` / `.title ha-icon`) opened in the
//      panel and saved is migrated to the working shape and renders.
// Run it on every rig (STYLE_KEY / HA_URL / TOKENS_FILE like the others).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { waitForHassReady, makeRecorder, finish } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, process.env.TOKENS_FILE || 'tokens.json'), 'utf8'));
const STYLE_KEY = process.env.STYLE_KEY === 'uix' ? 'uix' : 'card_mod';

const { results, record } = makeRecorder();

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });
  await page.evaluate(() => customElements.whenDefined('hui-card'));
  const haVersion = await page.evaluate(() => document.querySelector('home-assistant').hass.config.version);

  const out = await page.evaluate(async ({ styleKey }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const all = (root, pred) => { const o = []; const s = [root]; while (s.length) { const x = s.pop(); if (x.nodeType === 1 && pred(x)) o.push(x); if (x.shadowRoot) s.push(...x.shadowRoot.children); if (x.children) s.push(...x.children); } return o; };
    const haRoot = document.querySelector('home-assistant').shadowRoot;
    const hass = document.querySelector('home-assistant').hass;

    // Render a card config and measure the heading it produces.
    const measure = async (config) => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:520px;background:#fff;z-index:2147483000;padding:10px';
      haRoot.appendChild(host);
      const card = document.createElement('hui-card');
      card.hass = hass; card.config = config; host.appendChild(card);
      await sleep(2500);
      const content = all(card, (x) => x.classList?.contains('content') && (x.classList.contains('title') || x.classList.contains('subtitle')))[0];
      const text = content && [...content.querySelectorAll('*')].find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === 'Living room'));
      const icon = content?.querySelector('ha-icon');
      const container = all(card, (x) => x.classList?.contains('container'))[0];
      const cs = text ? getComputedStyle(text) : null;
      const res = text ? {
        textTag: text.tagName.toLowerCase(), size: cs.fontSize, color: cs.color, weight: cs.fontWeight, family: cs.fontFamily,
        iconW: icon ? Math.round(icon.getBoundingClientRect().width) : null, iconColor: icon ? getComputedStyle(icon).color : null,
        justify: container ? getComputedStyle(container).justifyContent : null,
      } : { error: 'title text not found' };
      host.remove();
      return res;
    };

    // Drive the real panel: enable Heading Style with explicit values, emit.
    const emitFromPanel = async (config, headingPatch) => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:1000px;height:800px;z-index:2147483600;background:#111';
      haRoot.appendChild(host);
      const panel = document.createElement('cms-panel');
      panel.hass = hass; panel.config = config; host.appendChild(panel);
      await panel.updateComplete; await sleep(900);
      let emitted = null;
      panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
      const adopted = { ...panel._studioState.headingStyle };
      panel._studioState = { ...panel._studioState, headingStyle: { ...panel._studioState.headingStyle, ...headingPatch } };
      panel._emitConfigChanged();
      await sleep(400);
      host.remove();
      return { emitted, adopted };
    };

    const patch = {
      enabled: true, fontSize: 30, textColor: 'rgb(200, 0, 0)', fontWeight: 'bold',
      fontFamily: 'monospace', iconSize: 40, iconColor: 'rgb(0, 0, 200)', alignment: 'center',
    };
    const res = {};
    res.baselineTitle = await measure({ type: 'heading', heading: 'Living room', icon: 'mdi:sofa' }); // warm-up + baseline
    res.baselineTitle = await measure({ type: 'heading', heading: 'Living room', icon: 'mdi:sofa' });
    for (const kind of ['title', 'subtitle']) {
      const base = { type: 'heading', heading: 'Living room', icon: 'mdi:sofa', heading_style: kind };
      const { emitted } = await emitFromPanel(base, patch);
      res[kind] = { emittedStyle: emitted?.[styleKey]?.style ?? null, rendered: emitted ? await measure(emitted) : null };
    }
    // Legacy (pre-v0.10) output, opened + saved with an unrelated change.
    const legacy = {
      type: 'heading', heading: 'Living room', icon: 'mdi:sofa',
      [styleKey]: { style: '.container {\n  justify-content: center !important;\n}\n\n.title p {\n  font-size: 30px;\n  color: rgb(200, 0, 0) !important;\n  font-weight: bold;\n}\n\n.title ha-icon {\n  --mdc-icon-size: 40px;\n  --ha-icon-size: 40px;\n  color: rgb(0, 0, 200) !important;\n}' },
    };
    res.legacyBefore = await measure(legacy);
    const mig = await emitFromPanel(legacy, {}); // no change to heading values — just a save
    res.legacyAdopted = mig.adopted;
    res.legacyEmitted = mig.emitted?.[styleKey]?.style ?? null;
    res.legacyAfter = mig.emitted ? await measure(mig.emitted) : null;
    return res;
  }, { styleKey: STYLE_KEY });

  const ok = (r, expectFamily = true) => !!r && r.size === '30px' && r.color === 'rgb(200, 0, 0)' && r.weight === '700'
    && (!expectFamily || /monospace/.test(r.family)) && r.iconW === 40 && r.iconColor === 'rgb(0, 0, 200)' && r.justify === 'center';

  record(`[HA ${haVersion}] control: unstyled heading renders the default title`, out.baselineTitle?.size === '16px', JSON.stringify(out.baselineTitle));
  record(`[HA ${haVersion}] title heading: size/colour/weight/family/icon/alignment all render (${out.title?.rendered?.textTag})`, ok(out.title?.rendered), JSON.stringify(out.title?.rendered));
  record(`[HA ${haVersion}] subtitle heading: the same, on heading_style: subtitle (${out.subtitle?.rendered?.textTag})`, ok(out.subtitle?.rendered), JSON.stringify(out.subtitle?.rendered));
  record('emitted style uses HA heading variables, not .title p', typeof out.title?.emittedStyle === 'string' && out.title.emittedStyle.includes('--ha-heading-card-title-font-size: 30px') && !out.title.emittedStyle.includes('.title p'), JSON.stringify(out.title?.emittedStyle));
  record('legacy .title p config: adopted into the module on open', out.legacyAdopted?.enabled === true && out.legacyAdopted?.fontSize === 30 && out.legacyAdopted?.iconSize === 40, JSON.stringify(out.legacyAdopted));
  record('legacy config: saving migrates it to the variable shape', typeof out.legacyEmitted === 'string' && !out.legacyEmitted.includes('.title p') && out.legacyEmitted.includes('--ha-heading-card-title-color: rgb(200, 0, 0)'), JSON.stringify(out.legacyEmitted));
  record(`[HA ${haVersion}] migrated legacy config renders (size/colour/weight/icon/alignment)`, ok(out.legacyAfter, false), JSON.stringify({ before: out.legacyBefore, after: out.legacyAfter }));

  await browser.close();
  finish(writeFileSync, resolve, HERE, `heading-check-${STYLE_KEY}.json`, results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

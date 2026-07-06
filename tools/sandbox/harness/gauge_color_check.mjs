// Gauge-card color support (v0.7.1). hui-gauge-card writes its
// severity-computed color as an *inline style* on <ha-gauge> on every
// render, so the old output (--gauge-color inherited from ha-card, no
// !important) was always overridden — Accent Color silently did nothing on
// gauge cards (live user report). The fix targets ha-gauge directly with
// !important, the one thing that beats a non-important inline style.
// Verifies, against a real gauge card in a real HA:
//   1. the OLD broken form really doesn't apply (documents why the fix exists)
//   2. cms-panel with Accent Color enabled emits the ha-gauge block
//   3. that emitted style actually recolors the rendered gauge arc
//   4. Threshold (gradient mode, accent-color property) recolors the arc too
//   5. round-trip: reopening the emitted config keeps Accent Color
//      recognised with zero Advanced-CSS leftovers
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
// TOKENS_FILE=tokens-uix.json STYLE_KEY=uix HA_URL=http://127.0.0.1:8124 → run against run-uix.sh's instance
const tokens = JSON.parse(readFileSync(resolve(HERE, process.env.TOKENS_FILE || 'tokens.json'), 'utf8'));

const { results, record } = makeRecorder();
const ENTITY = 'sensor.outside_temperature';
const STYLE_KEY = process.env.STYLE_KEY || 'card_mod'; // 'uix' when run against run-uix.sh

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });

  // Renders a gauge hui-card with the given style and returns the computed
  // stroke of the value arc inside ha-gauge's shadow root (polling — style
  // application is async).
  const renderArc = async (style) => page.evaluate(async ({ entity, style, styleKey }) => {
    await customElements.whenDefined('hui-card');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;z-index:2147483647;background:#fff;';
    document.body.appendChild(host);
    const card = document.createElement('hui-card');
    card.hass = document.querySelector('home-assistant').hass;
    card.config = { type: 'gauge', entity, [styleKey]: { style } };
    host.appendChild(card);
    const findAll = (root, sel) => {
      const out = []; const stack = [root];
      while (stack.length) {
        const n = stack.pop();
        if (n.matches?.(sel)) out.push(n);
        if (n.shadowRoot) stack.push(...n.shadowRoot.children);
        if (n.children) stack.push(...n.children);
      }
      return out;
    };
    let stroke = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const gauge = findAll(card, 'ha-gauge')[0];
      const value = gauge?.shadowRoot?.querySelector('.value');
      if (value) {
        stroke = getComputedStyle(value).stroke;
        // Non-default color reached — style has applied.
        if (stroke && stroke !== 'rgb(3, 155, 229)') break;
      }
    }
    host.remove();
    return stroke;
  }, { entity: ENTITY, style, styleKey: STYLE_KEY });

  // 1. The old broken form must NOT apply (this is the bug the fix replaces;
  //    if this ever starts applying, HA changed gauge internals and the
  //    !important form should be re-evaluated).
  const oldForm = await renderArc(`ha-card {\n  --gauge-color: #ff0000;\n}`);
  record(
    'old form (--gauge-color on ha-card, no !important) does NOT recolor the arc — documents why the ha-gauge block exists',
    oldForm !== 'rgb(255, 0, 0)',
    `arc stroke=${oldForm}`,
  );

  // 2. cms-panel with Accent Color enabled on a gauge emits the ha-gauge block.
  const emitted = await page.evaluate(async ({ entity }) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = { type: 'gauge', entity };
    host.appendChild(panel);
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));

    panel._studioState = {
      ...panel._studioState,
      accentColor: { ...panel._studioState.accentColor, enabled: true, mode: 'plain', color: '#ff0000' },
    };
    let emitted = null;
    panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
    panel._emitConfigChanged();
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 300));
    host.remove();
    return emitted?.uix?.style ?? emitted?.card_mod?.style ?? null;
  }, { entity: ENTITY });

  record(
    'cms-panel (gauge card, Accent Color on) emits an ha-gauge block with !important',
    !!emitted && /ha-gauge\s*\{[^}]*--gauge-color: #ff0000 !important/.test(emitted),
    emitted?.slice(0, 200),
  );

  // 3. The emitted style really recolors the rendered arc.
  const fixedArc = emitted ? await renderArc(emitted) : null;
  record(
    'the emitted style recolors the real gauge arc',
    fixedArc === 'rgb(255, 0, 0)',
    `arc stroke=${fixedArc}`,
  );

  // 4. Threshold gradient mode driving accent-color recolors the arc with the
  //    interpolated color for the entity's current value.
  const entityValue = await page.evaluate((entity) => {
    const hass = document.querySelector('home-assistant').hass;
    return parseFloat(hass.states[entity]?.state ?? 'nan');
  }, ENTITY);

  const gradientEmitted = await page.evaluate(async ({ entity }) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = { type: 'gauge', entity };
    host.appendChild(panel);
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));

    panel._studioState = {
      ...panel._studioState,
      threshold: {
        ...panel._studioState.threshold,
        enabled: true,
        entityId: entity,
        properties: ['accent-color'],
        valueMode: 'gradient',
        colorStops: [
          { id: 'a', value: 0, color: '#0000ff' },
          { id: 'b', value: 40, color: '#ff0000' },
        ],
      },
    };
    let emitted = null;
    panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
    panel._emitConfigChanged();
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 300));
    host.remove();
    return emitted?.uix?.style ?? emitted?.card_mod?.style ?? null;
  }, { entity: ENTITY });

  const gradientArc = gradientEmitted ? await renderArc(gradientEmitted) : null;
  // Expected: lerp(#0000ff -> #ff0000) at clamp(entityValue, 0, 40), matching
  // the 32-step approximation to a tolerance.
  const t = Math.max(0, Math.min(40, entityValue)) / 40;
  const expected = [Math.round(255 * t), 0, Math.round(255 * (1 - t))];
  const actual = (gradientArc?.match(/\d+/g) ?? []).map(Number).slice(0, 3);
  const close = actual.length === 3 && actual.every((v, i) => Math.abs(v - expected[i]) <= 15);
  record(
    `threshold gradient (accent-color) recolors the gauge arc with the interpolated color at value=${entityValue}`,
    close,
    `rendered=rgb(${actual.join(',')}) expected~=rgb(${expected.join(',')})`,
  );

  // 5. Round-trip: reopening a panel on the emitted config keeps Accent Color
  //    recognised, with no Advanced CSS leftovers (the aux-variable leak this
  //    release also fixed).
  const reopened = await page.evaluate(async ({ entity, style, styleKey }) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = { type: 'gauge', entity, [styleKey]: { style } };
    host.appendChild(panel);
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));
    const s = panel._studioState;
    host.remove();
    return {
      accentEnabled: s?.accentColor?.enabled,
      accentColor: s?.accentColor?.color,
      advancedLeftover: s?.advanced?.rawCss ?? null,
    };
  }, { entity: ENTITY, style: emitted, styleKey: STYLE_KEY });

  record(
    'reopening the emitted config round-trips Accent Color with zero Advanced-CSS leftover',
    reopened.accentEnabled === true && reopened.accentColor === '#ff0000' && reopened.advancedLeftover === '',
    JSON.stringify(reopened),
  );

  await page.screenshot({ path: resolve(SHOTS, 'gauge-color-01.png') });
  await browser.close();
  finish(writeFileSync, resolve, HERE, 'gauge-color-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

// Font module (issue #25 — "font styling, I mostly fail by changing the
// size"). Verifies the two distinct mechanisms this module relies on, both
// only confirmable against a REAL render (not source reading):
//   1. Plain CSS inheritance: entities-card row text and markdown content
//      have no internal font-size override, so a bare `ha-card { font-size }`
//      should reach them directly.
//   2. hui-tile-card's <ha-tile-info> reads its OWN --ha-tile-info-* CSS
//      variables for primary/secondary text, not plain font-size/weight/
//      color — a bare ha-card declaration should have NO effect there, and
//      the companion-variable form should.
// Also: module hidden on heading (dedicated control) and iframe/webpage/map;
// round-trip after reopening the panel.
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
const tokens = JSON.parse(readFileSync(resolve(HERE, process.env.TOKENS_FILE || 'tokens.json'), 'utf8'));
const STYLE_KEY = process.env.STYLE_KEY || 'card_mod';

const { results, record } = makeRecorder();

const findAllSrc = `
  const out = []; const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (n.matches && n.matches(sel)) out.push(n);
    if (n.shadowRoot) stack.push(...n.shadowRoot.children);
    if (n.children) stack.push(...n.children);
  }
  return out;
`;

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });

  const emitStyle = async (config, mutateSrc) => page.evaluate(async ({ config, mutateSrc }) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = config;
    host.appendChild(panel);
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));
    const mutate = new Function('s', `return (${mutateSrc})(s);`);
    panel._studioState = mutate(panel._studioState);
    let emitted = null;
    panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
    panel._emitConfigChanged();
    await new Promise((r) => setTimeout(r, 300));
    host.remove();
    return emitted?.uix?.style ?? emitted?.card_mod?.style ?? null;
  }, { config, mutateSrc });

  const setFont = `(s) => ({ ...s, font: { ...s.font, enabled: true, fontSize: 26, fontWeight: 'bold', color: '#ff0000' } })`;

  // --- 1. Plain inheritance: entities-card row text ---
  const entitiesStyle = await emitStyle(
    { type: 'entities', entities: ['sensor.outside_temperature', 'sensor.outside_humidity'] },
    setFont,
  );
  record('entities card: panel emits ha-card font-size/weight/color', !!entitiesStyle && entitiesStyle.includes('font-size: 26px') && entitiesStyle.includes('color: #ff0000'), entitiesStyle?.slice(0, 160));

  const entitiesRendered = await page.evaluate(async ({ style, styleKey, findAllSrc }) => {
    const findAll = new Function('root', 'sel', findAllSrc);
    await customElements.whenDefined('hui-card');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:420px;height:300px;z-index:2147483647;background:#fff;';
    document.body.appendChild(host);
    const card = document.createElement('hui-card');
    card.hass = document.querySelector('home-assistant').hass;
    card.config = { type: 'entities', entities: ['sensor.outside_temperature'], [styleKey]: { style } };
    host.appendChild(card);
    let fontSize = null, color = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const name = findAll(card, '.info.text-content')[0];
      if (name) {
        const cs = getComputedStyle(name);
        fontSize = cs.fontSize; color = cs.color;
        if (fontSize === '26px') break;
      }
    }
    host.remove();
    return { fontSize, color };
  }, { style: entitiesStyle, styleKey: STYLE_KEY, findAllSrc });

  record(
    'entities card: row text actually renders at 26px / red (plain inheritance works)',
    entitiesRendered.fontSize === '26px' && entitiesRendered.color === 'rgb(255, 0, 0)',
    JSON.stringify(entitiesRendered),
  );

  // --- 2. Tile card companion variables ---
  const tileStyle = await emitStyle({ type: 'tile', entity: 'light.ceiling_lights' }, setFont);
  record(
    'tile: panel emits --ha-tile-info-* companion variables',
    !!tileStyle && tileStyle.includes('--ha-tile-info-primary-font-size: 26px') && tileStyle.includes('--ha-tile-info-primary-color: #ff0000'),
    tileStyle?.slice(0, 220),
  );

  const tileOld = `ha-card {\n  font-size: 26px;\n  color: #ff0000;\n}`;
  const tileRendered = async (style) => page.evaluate(async ({ entity, style, styleKey, findAllSrc }) => {
    const findAll = new Function('root', 'sel', findAllSrc);
    await customElements.whenDefined('hui-card');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:200px;z-index:2147483647;background:#fff;';
    document.body.appendChild(host);
    const card = document.createElement('hui-card');
    card.hass = document.querySelector('home-assistant').hass;
    card.config = { type: 'tile', entity, [styleKey]: { style } };
    host.appendChild(card);
    let fontSize = null, color = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const info = findAll(card, 'ha-tile-info')[0];
      const primary = info?.shadowRoot?.querySelector('.primary');
      if (primary) {
        const cs = getComputedStyle(primary);
        fontSize = cs.fontSize; color = cs.color;
      }
      if (fontSize === '26px') break;
    }
    host.remove();
    return { fontSize, color };
  }, { entity: 'light.ceiling_lights', style, styleKey: STYLE_KEY, findAllSrc });

  const oldResult = await tileRendered(tileOld);
  record(
    'tile: the OLD bare ha-card form does NOT resize ha-tile-info text (documents why the companion vars exist)',
    oldResult.fontSize !== '26px',
    JSON.stringify(oldResult),
  );

  const newResult = await tileRendered(tileStyle);
  record(
    'tile: the companion-variable form DOES resize/recolor the real ha-tile-info primary text',
    newResult.fontSize === '26px' && newResult.color === 'rgb(255, 0, 0)',
    JSON.stringify(newResult),
  );

  // --- 3. Module gating ---
  const gating = await page.evaluate(async ({ findAllSrc }) => {
    const findAll = new Function('root', 'sel', findAllSrc);
    const check = async (config) => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
      document.body.appendChild(host);
      const panel = document.createElement('cms-panel');
      panel.hass = document.querySelector('home-assistant').hass;
      panel.config = config;
      host.appendChild(panel);
      await panel.updateComplete;
      await new Promise((r) => setTimeout(r, 300));
      const present = !!findAll(panel, 'cms-font-module')[0];
      host.remove();
      return present;
    };
    return {
      heading: await check({ type: 'heading', heading: 'Test' }),
      tile: await check({ type: 'tile', entity: 'light.ceiling_lights' }),
      map: await check({ type: 'map', entities: [] }),
    };
  }, { findAllSrc });

  record('Font module hidden on heading cards (dedicated Heading Style control already covers it)', gating.heading === false, JSON.stringify(gating));
  record('Font module shown on tile cards', gating.tile === true, JSON.stringify(gating));
  record('Font module hidden on map cards (no HA-templated text)', gating.map === false, JSON.stringify(gating));

  // --- 4. Round-trip ---
  const reopened = await page.evaluate(async ({ entity, style, styleKey, findAllSrc }) => {
    const findAll = new Function('root', 'sel', findAllSrc);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = { type: 'tile', entity, [styleKey]: { style } };
    host.appendChild(panel);
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));
    const s = panel._studioState;
    host.remove();
    return {
      enabled: s?.font?.enabled, fontSize: s?.font?.fontSize,
      fontWeight: s?.font?.fontWeight, color: s?.font?.color,
      advancedLeftover: s?.advanced?.rawCss ?? null,
    };
  }, { entity: 'light.ceiling_lights', style: tileStyle, styleKey: STYLE_KEY, findAllSrc });

  record(
    'reopening a tile styled with Font round-trips (right values, no Advanced-CSS leftover)',
    reopened.enabled === true && reopened.fontSize === 26 && reopened.fontWeight === 'bold' &&
      reopened.color === '#ff0000' && reopened.advancedLeftover === '',
    JSON.stringify(reopened),
  );

  await page.screenshot({ path: resolve(SHOTS, 'font-module-01.png') });
  await browser.close();
  finish(writeFileSync, resolve, HERE, 'font-module-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

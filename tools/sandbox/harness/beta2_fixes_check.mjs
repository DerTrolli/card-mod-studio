// v0.7.1-beta.2 fixes, verified against a real HA instance:
//   1. needle gauge — the generated style recolors the actual needle path
//      (fill via --primary-text-color on ha-gauge; inline-style-beating
//      !important), where beta.1 visibly did nothing (live user report).
//   2. tile card — --tile-color with !important beats hui-tile-card's own
//      inline styleMap on ha-card (an ACTIVE light tile, where the tile
//      computes a state color inline, is the case that used to lose).
//   3. tile features — --feature-color derives from --tile-color inside the
//      tile's shadow styles, so the accent color must reach a rendered
//      feature (bar gauge / toggle) too.
//   4. on/off "controlled by" pickers pass a domain filter down to
//      ha-entity-picker; Threshold's value-based picker stays unfiltered.
//   5. the layout-card banner no longer claims a per-child Style button
//      exists.
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
const SENSOR = 'sensor.outside_temperature';
const LIGHT = 'light.ceiling_lights';

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });

  // Body for `new Function('root', 'sel', findAllFn)` inside page.evaluate —
  // a plain eval'd `const` wouldn't escape the eval scope in strict mode.
  const findAllFn = `
    const out = []; const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      if (n.matches && n.matches(sel)) out.push(n);
      if (n.shadowRoot) stack.push(...n.shadowRoot.children);
      if (n.children) stack.push(...n.children);
    }
    return out;
  `;

  // Runs a cms-panel against `config`, applies `mutate` to _studioState,
  // returns the emitted style string.
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

  const enableRedAccent = `(s) => ({ ...s, accentColor: { ...s.accentColor, enabled: true, mode: 'plain', color: '#ff0000' } })`;

  // --- 1. Needle gauge ---
  const needleStyle = await emitStyle(
    { type: 'gauge', entity: SENSOR, needle: true },
    enableRedAccent,
  );
  record(
    'needle gauge: panel emits --primary-text-color !important alongside --gauge-color',
    !!needleStyle && needleStyle.includes('--primary-text-color: #ff0000 !important') &&
      needleStyle.includes('--gauge-color: #ff0000 !important'),
    needleStyle?.slice(0, 200),
  );

  const needleFill = await page.evaluate(async ({ entity, style, styleKey, findAllSrc }) => {
    const findAll = new Function("root", "sel", findAllSrc);
    await customElements.whenDefined('hui-card');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;z-index:2147483647;background:#fff;';
    document.body.appendChild(host);
    const card = document.createElement('hui-card');
    card.hass = document.querySelector('home-assistant').hass;
    card.config = { type: 'gauge', entity, needle: true, [styleKey]: { style } };
    host.appendChild(card);
    let fill = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const gauge = findAll(card, 'ha-gauge')[0];
      const needle = gauge?.shadowRoot?.querySelector('.needle');
      if (needle) {
        fill = getComputedStyle(needle).fill;
        if (fill === 'rgb(255, 0, 0)') break;
      }
    }
    host.remove();
    return fill;
  }, { entity: SENSOR, style: needleStyle, styleKey: STYLE_KEY, findAllSrc: findAllFn });
  record('needle gauge: the actual needle path renders red', needleFill === 'rgb(255, 0, 0)', `needle fill=${needleFill}`);

  // --- 2 + 3. Tile card (ACTIVE light => inline --tile-color set) + feature ---
  await page.evaluate(async (entity) => {
    const hass = document.querySelector('home-assistant').hass;
    if (hass.states[entity]?.state !== 'on') {
      await hass.callService('light', 'turn_on', { entity_id: entity });
      await new Promise((r) => setTimeout(r, 800));
    }
  }, LIGHT);

  const tileStyle = await emitStyle({ type: 'tile', entity: LIGHT }, enableRedAccent);
  record(
    'tile: panel emits --tile-color with !important',
    !!tileStyle && tileStyle.includes('--tile-color: #ff0000 !important'),
    tileStyle?.slice(0, 160),
  );

  const tile = await page.evaluate(async ({ entity, style, styleKey, findAllSrc }) => {
    const findAll = new Function("root", "sel", findAllSrc);
    await customElements.whenDefined('hui-card');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;z-index:2147483647;background:#fff;';
    document.body.appendChild(host);
    const card = document.createElement('hui-card');
    card.hass = document.querySelector('home-assistant').hass;
    card.config = {
      type: 'tile', entity,
      features: [{ type: 'toggle' }],
      [styleKey]: { style },
    };
    host.appendChild(card);
    let tileColor = null, featureColor = null, inlineTileColor = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const haCard = findAll(card, 'ha-card')[0];
      const features = findAll(card, 'hui-card-features')[0];
      if (haCard) {
        inlineTileColor = haCard.style.getPropertyValue('--tile-color').trim() || null;
        tileColor = getComputedStyle(haCard).getPropertyValue('--tile-color').trim();
      }
      if (features) featureColor = getComputedStyle(features).getPropertyValue('--feature-color').trim();
      if (tileColor === '#ff0000' && featureColor) break;
    }
    host.remove();
    return { tileColor, featureColor, inlineTileColor };
  }, { entity: LIGHT, style: tileStyle, styleKey: STYLE_KEY, findAllSrc: findAllFn });

  record(
    'tile (active light, inline --tile-color present): our !important value wins on ha-card',
    tile.tileColor === '#ff0000',
    JSON.stringify(tile),
  );
  record(
    'tile feature row: --feature-color resolves to the accent color',
    tile.featureColor === '#ff0000',
    `feature=${tile.featureColor}`,
  );

  // --- 4. Picker domain filtering ---
  const pickers = await page.evaluate(async ({ entity, findAllSrc }) => {
    const findAll = new Function("root", "sel", findAllSrc);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = { type: 'button', entity };
    host.appendChild(panel);
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));

    // Turn on Accent Color conditional + Threshold so both pickers render.
    panel._studioState = {
      ...panel._studioState,
      accentColor: { ...panel._studioState.accentColor, enabled: true, mode: 'conditional' },
      threshold: { ...panel._studioState.threshold, enabled: true, entityId: 'sensor.outside_temperature' },
    };
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));

    const accentModule = panel.shadowRoot.querySelector('cms-accent-color-module');
    const thresholdModule = panel.shadowRoot.querySelector('cms-threshold-module');
    const accentPicker = accentModule && findAll(accentModule, 'cms-entity-picker')[0];
    const thresholdPicker = thresholdModule && findAll(thresholdModule, 'cms-entity-picker')[0];
    const accentInner = accentPicker && findAll(accentPicker, 'ha-entity-picker')[0];
    const out = {
      accentDomains: accentInner?.includeDomains ?? accentPicker?.includeDomains ?? null,
      // Existence tracked separately — "unfiltered" is undefined includeDomains,
      // which a ?? chain can't tell apart from the picker not rendering at all.
      thresholdPickerExists: !!thresholdPicker,
      thresholdDomains: thresholdPicker?.includeDomains ?? null,
    };
    host.remove();
    return out;
  }, { entity: 'switch.decorative_lights', findAllSrc: findAllFn });

  record(
    'accent "controlled by" picker carries the toggle-domain filter down to ha-entity-picker',
    Array.isArray(pickers.accentDomains) && pickers.accentDomains.includes('switch') && pickers.accentDomains.includes('binary_sensor'),
    JSON.stringify(pickers.accentDomains),
  );
  record(
    'threshold entity picker stays UNFILTERED (numeric sensors must be offered)',
    pickers.thresholdPickerExists && pickers.thresholdDomains === null,
    JSON.stringify({ exists: pickers.thresholdPickerExists, domains: pickers.thresholdDomains }),
  );

  // --- 5. Layout-card banner copy ---
  const banner = await page.evaluate(async () => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = { type: 'vertical-stack', cards: [{ type: 'tile', entity: 'light.ceiling_lights' }] };
    host.appendChild(panel);
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 300));
    const text = panel.shadowRoot.querySelector('.container-banner')?.textContent ?? '';
    host.remove();
    return text.replace(/\s+/g, ' ').trim();
  });

  record(
    'layout banner: no longer claims a per-child Style button exists; explains the YAML workaround',
    banner.includes("isn't supported here yet") && banner.includes('card_mod:') && !banner.includes('click the Style button there'),
    banner.slice(0, 160),
  );

  await page.screenshot({ path: resolve(SHOTS, 'beta2-fixes-01.png') });
  await browser.close();
  finish(writeFileSync, resolve, HERE, 'beta2-fixes-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

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

  // --- 5. Per-card companions (v0.8.0-beta.2): the card types that override
  //        fonts internally must each render the emitted style for real. ---
  const renderCase = async (config, probeBody) => page.evaluate(async ({ config, probeBody }) => {
    await customElements.whenDefined('hui-card');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:420px;height:360px;z-index:2147483647;background:#fff;';
    document.body.appendChild(host);
    const card = document.createElement('hui-card');
    card.hass = document.querySelector('home-assistant').hass;
    card.config = config;
    host.appendChild(card);
    const fn = new Function('card', probeBody);
    let result = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      try { result = fn(card); } catch (e) { result = { err: String(e) }; }
      if (result && result.hit) break;
    }
    host.remove();
    return result;
  }, { config, probeBody });

  const fontFor = async (type, extra = {}) => {
    const style = await emitStyle(
      { type, ...extra },
      `(s) => ({ ...s, font: { ...s.font, enabled: true, fontSize: 24, fontWeight: 'bold', color: '#ff0000' } })`,
    );
    return style;
  };

  const lightStyle = await fontFor('light', { entity: 'light.ceiling_lights' });
  const lightR = await renderCase(
    { type: 'light', entity: 'light.ceiling_lights', [STYLE_KEY]: { style: lightStyle } },
    `const inner = card.querySelector('hui-light-card');
     const info = inner?.shadowRoot?.querySelector('#info');
     if (!info) return { found: false };
     const s = getComputedStyle(info);
     return { size: s.fontSize, weight: s.fontWeight, color: s.color,
              hit: s.fontSize === '24px' && s.fontWeight === '700' && s.color === 'rgb(255, 0, 0)' };`,
  );
  record('light card: name/state text renders at the chosen size/weight/color', !!lightR?.hit, JSON.stringify(lightR));

  const sensorStyle = await fontFor('sensor', { entity: 'sensor.outside_temperature' });
  const sensorR = await renderCase(
    { type: 'sensor', entity: 'sensor.outside_temperature', [STYLE_KEY]: { style: sensorStyle } },
    `const inner = card.querySelector('hui-sensor-card');
     const name = inner?.shadowRoot?.querySelector('.name');
     const value = inner?.shadowRoot?.querySelector('.value');
     if (!name || !value) return { found: false };
     const ns = getComputedStyle(name), vs = getComputedStyle(value);
     return { name: ns.fontSize + '/' + ns.color, value: vs.fontSize,
              hit: ns.fontSize === '24px' && ns.color === 'rgb(255, 0, 0)' && vs.fontSize === '42px' };`,
  );
  record('sensor card: name AND value follow (value at 1.75x), not just the unit', !!sensorR?.hit, JSON.stringify(sensorR));

  const gaugeStyle = await fontFor('gauge', { entity: 'sensor.outside_temperature' });
  const gaugeR = await renderCase(
    { type: 'gauge', entity: 'sensor.outside_temperature', [STYLE_KEY]: { style: gaugeStyle } },
    `const inner = card.querySelector('hui-gauge-card');
     const title = inner?.shadowRoot?.querySelector('.title');
     const vt = inner?.shadowRoot?.querySelector('ha-gauge')?.shadowRoot?.querySelector('.value-text');
     if (!title || !vt) return { found: false };
     const ts = getComputedStyle(title), vs = getComputedStyle(vt);
     return { title: ts.fontSize + '/' + ts.color, fill: vs.fill,
              hit: ts.fontSize === '24px' && ts.color === 'rgb(255, 0, 0)' && vs.fill === 'rgb(255, 0, 0)' };`,
  );
  record('gauge card: title follows size/color and the SVG value text recolors (fill)', !!gaugeR?.hit, JSON.stringify(gaugeR));

  const entitiesStyle2 = await fontFor('entities', { title: 'MyTitle', entities: ['sensor.outside_temperature'] });
  const entitiesR = await renderCase(
    { type: 'entities', title: 'MyTitle', entities: ['sensor.outside_temperature'], [STYLE_KEY]: { style: entitiesStyle2 } },
    `const inner = card.querySelector('hui-entities-card');
     const header = inner?.shadowRoot?.querySelector('.card-header');
     if (!header) return { found: false };
     const s = getComputedStyle(header);
     return { size: s.fontSize, color: s.color, weight: s.fontWeight,
              hit: s.fontSize === '36px' && s.color === 'rgb(255, 0, 0)' && s.fontWeight === '700' };`,
  );
  record('entities card: the TITLE follows too (1.5x header size, color, weight)', !!entitiesR?.hit, JSON.stringify(entitiesR));

  // --- 6. Per-row font on an entities card, through the real rows pipeline ---
  const rowStyled = await page.evaluate(async () => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = { type: 'entities', entities: ['sensor.outside_temperature', 'sensor.outside_humidity'] };
    host.appendChild(panel);
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));
    panel._entityRowStyles = {
      ...panel._entityRowStyles,
      'sensor.outside_temperature': {
        ...(panel._entityRowStyles['sensor.outside_temperature'] ?? { iconColor: '', textColor: '' }),
        fontSizePx: 20,
        fontWeight: 'bold',
      },
    };
    let emitted = null;
    panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
    panel._emitConfigChanged();
    await new Promise((r) => setTimeout(r, 300));
    host.remove();
    const row0 = emitted?.entities?.[0];
    const row1 = emitted?.entities?.[1];
    return {
      row0Style: row0?.uix?.style ?? row0?.card_mod?.style ?? null,
      row1Untouched: !row1?.uix && !row1?.card_mod,
    };
  });
  record(
    'entities per-row font: row 0 gets :host font-size/weight, row 1 untouched',
    !!rowStyled.row0Style && rowStyled.row0Style.includes('font-size: 20px') &&
      rowStyled.row0Style.includes('font-weight: bold') && rowStyled.row1Untouched,
    JSON.stringify(rowStyled),
  );

  // --- 7. hui-form-editor shim: a form-based editor (entity card) must not
  //        reject uix:/card_mod: into YAML-only mode. Must run through the
  //        REAL edit-card dialog — hui-card-element-editor is lazily defined
  //        with the dialog bundle (an ad-hoc createElement never upgrades,
  //        and customElements.whenDefined would wait forever). Same dialog
  //        recipe as dialog_popover_check.mjs.
  const DASHBOARD = 'font-form-editor-check';
  await page.evaluate(async ({ urlPath, cardConfig }) => {
    const hass = document.querySelector('home-assistant').hass;
    try {
      await hass.connection.sendMessagePromise({
        type: 'lovelace/dashboards/create', url_path: urlPath, title: 'FontProbe',
        icon: 'mdi:bug', show_in_sidebar: false, require_admin: false,
      });
    } catch (e) {
      if (!String(e?.message || e).includes('already')) throw e;
    }
    await hass.connection.sendMessagePromise({
      type: 'lovelace/config/save', url_path: urlPath,
      config: { views: [{ title: 'FontProbe', cards: [cardConfig] }] },
    });
  }, {
    urlPath: DASHBOARD,
    cardConfig: {
      type: 'entity',
      entity: 'sensor.outside_temperature',
      [STYLE_KEY]: { style: 'ha-state-icon {\n  color: var(--grey-color) !important;\n}' },
    },
  });

  await page.goto(`${HA}/${DASHBOARD}/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForTimeout(800);

  const allByTagSrc = `
    const o = []; const s = [root]; tag = tag.toLowerCase();
    while (s.length) {
      const n = s.pop();
      if (n.tagName && n.tagName.toLowerCase() === tag) o.push(n);
      if (n.shadowRoot) s.push(...n.shadowRoot.children);
      if (n.children) s.push(...n.children);
    }
    return o;
  `;

  // Kebab menu -> Edit dashboard -> the card's Edit button.
  const menuBtn = await page.evaluate(({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const huiRoot = all(document.querySelector('home-assistant'), 'hui-root')[0];
    const btns = [...huiRoot.shadowRoot.querySelectorAll('ha-icon-button')];
    const last = btns[btns.length - 1];
    const r = last.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { allByTagSrc });
  await page.mouse.click(menuBtn.x, menuBtn.y);
  await page.waitForTimeout(500);

  const editDashboardItem = await page.evaluate(() => {
    const o = []; const s = [document.body];
    while (s.length) {
      const n = s.pop();
      o.push(n);
      if (n.shadowRoot) s.push(...n.shadowRoot.children);
      if (n.children) s.push(...n.children);
    }
    const clickable = o.find(
      (el) => el.tagName === 'HA-DROPDOWN-ITEM' && (el.textContent || '').toLowerCase().includes('edit dashboard'),
    );
    if (!clickable) return null;
    const r = clickable.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!editDashboardItem) throw new Error('Edit dashboard menu item not found');
  await page.mouse.click(editDashboardItem.x, editDashboardItem.y);
  await page.waitForTimeout(1200);

  const editLink = await page.evaluate(({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const huiRoot = all(document.querySelector('home-assistant'), 'hui-root')[0];
    const cardOptions = all(huiRoot, 'hui-card-options')[0];
    if (!cardOptions) return null;
    const o = []; const s = [cardOptions];
    while (s.length) {
      const n = s.pop();
      if (n.nodeType === 1) o.push(n);
      if (n.shadowRoot) s.push(...n.shadowRoot.children);
      if (n.children) s.push(...n.children);
    }
    const btn = o.find((el) => (el.textContent || '').trim().toLowerCase() === 'edit' && el.children.length === 0);
    if (!btn) return null;
    const clickable = btn.closest('mwc-button, ha-button, button') || btn;
    const r = clickable.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { allByTagSrc });
  if (!editLink) throw new Error('Card "Edit" link not found');
  await page.mouse.click(editLink.x, editLink.y);

  // The dialog loads the editor bundle; poll for the element editor's verdict.
  let formEditor = null;
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(400);
    formEditor = await page.evaluate(({ allByTagSrc }) => {
      const all = new Function('root', 'tag', allByTagSrc);
      const editor = all(document.body, 'hui-card-element-editor')[0];
      if (!editor) return null;
      const warnings = editor._warnings ?? null;
      const gui = editor.GUImode;
      const formEl = editor.shadowRoot?.querySelector('hui-form-editor');
      if (!formEl && !warnings && gui !== false) return null; // still loading
      return { gui, warnings, hasFormEditor: !!formEl, hit: gui !== false && !warnings && !!formEl };
    }, { allByTagSrc });
    if (formEditor?.hit) break;
  }
  record(
    'form-editor shim: entity card WITH a style block keeps its visual editor (no "not expected" warning)',
    !!formEditor?.hit,
    JSON.stringify(formEditor),
  );

  await page.screenshot({ path: resolve(SHOTS, 'font-module-01.png') });
  await browser.close();
  finish(writeFileSync, resolve, HERE, 'font-module-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

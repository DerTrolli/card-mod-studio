// Regenerates the README screenshots (images/*.png) against a REAL Home
// Assistant edit-card dialog — not ad-hoc mounts — so what's pictured is
// exactly what users see (including entity pickers, which only render with
// a real <home-assistant> ancestor). Run against either sandbox; shots are
// engine-agnostic (the panel looks the same under card-mod and UIX).
//
//   node readme_shots.mjs           # writes to shots/readme/
//
// Then review and copy over the repo's images/ files.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { waitForHassReady } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'shots', 'readme');
mkdirSync(OUT, { recursive: true });
const HA = process.env.HA_URL || 'http://127.0.0.1:8124';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, process.env.TOKENS_FILE || 'tokens-uix.json'), 'utf8'));

const DASHBOARD = 'readme-shots';

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

/** Dashboard cards the shots are taken from (index matters). */
const CARDS = [
  { // 0 — overview tile, pre-styled so the preview shows something
    type: 'tile',
    entity: 'sensor.outside_temperature',
    card_mod: { style: 'ha-card {\n  --accent-color: #03a9f4;\n  --tile-color: #03a9f4 !important;\n  border: 2px solid #03a9f4;\n}' },
  },
  { // 1 — light card for Icon/Accent conditional shots
    type: 'light',
    entity: 'light.ceiling_lights',
  },
  { // 2 — entities card for per-row shots
    type: 'entities',
    title: 'Climate',
    entities: [
      'sensor.outside_temperature',
      'sensor.outside_humidity',
      { entity: 'light.ceiling_lights', name: 'Ceiling lights' },
    ],
  },
  { // 3 — stack for the child-sections shot
    type: 'vertical-stack',
    cards: [
      { type: 'tile', entity: 'light.ceiling_lights' },
      { type: 'gauge', entity: 'sensor.outside_temperature', name: 'Outside' },
      { type: 'entities', entities: ['sensor.outside_temperature', 'sensor.outside_humidity'] },
    ],
  },
];

async function openEditDialog(page, innerCardTag) {
  await page.goto(`${HA}/${DASHBOARD}/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  // hui-root renders a beat after hass is ready on a cold dashboard load.
  await page.waitForFunction(({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    return all(document.querySelector('home-assistant'), 'hui-root').length > 0;
  }, { allByTagSrc }, { timeout: 30000 });
  await page.waitForTimeout(900);

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
      const n = s.pop(); o.push(n);
      if (n.shadowRoot) s.push(...n.shadowRoot.children);
      if (n.children) s.push(...n.children);
    }
    const el = o.find((x) => x.tagName === 'HA-DROPDOWN-ITEM' && (x.textContent || '').toLowerCase().includes('edit dashboard'));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!editDashboardItem) throw new Error('Edit dashboard item not found');
  await page.mouse.click(editDashboardItem.x, editDashboardItem.y);
  await page.waitForTimeout(1200);

  const editLink = await page.evaluate(({ allByTagSrc, innerCardTag }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const huiRoot = all(document.querySelector('home-assistant'), 'hui-root')[0];
    // Identify the wanted card by the card element it renders — index-based
    // selection is unreliable (shadow-DOM walk order != dashboard order).
    const cardOptions = all(huiRoot, 'hui-card-options').find(
      (co) =>
        all(co, innerCardTag).length > 0 &&
        // the stack card contains a tile and an entities card of its own —
        // only match the stack when the stack is what's asked for
        (innerCardTag === 'hui-vertical-stack-card' || all(co, 'hui-vertical-stack-card').length === 0),
    );
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
  }, { allByTagSrc, innerCardTag });
  if (!editLink) throw new Error(`Card ${innerCardTag} Edit link not found`);
  await page.mouse.click(editLink.x, editLink.y);
  await page.waitForTimeout(1200);
}

async function clickStyleTab(page) {
  const styleBtn = await page.evaluate(({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const btn = all(document.body, 'cms-tab-button').filter((x) => x.isConnected && x.getBoundingClientRect().width > 0).pop();
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { allByTagSrc });
  if (!styleBtn) throw new Error('Style tab button not found');
  await page.mouse.click(styleBtn.x, styleBtn.y);
  await page.waitForTimeout(900);
}

/** Rect of the native dialog surface (the visible dialog box). */
async function dialogRect(page) {
  return page.evaluate(({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const haDialog = all(document.body, 'ha-dialog')[0];
    const native = haDialog?.shadowRoot?.querySelector('wa-dialog')?.shadowRoot?.querySelector('dialog');
    const r = (native ?? haDialog).getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }, { allByTagSrc });
}

/** Rect of an element inside the cms-panel's shadow root, scrolled into view. */
async function panelElementRect(page, selector, extraSelector = null) {
  return page.evaluate(async ({ allByTagSrc, selector, extraSelector }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const panel = all(document.body, 'cms-panel').filter((x) => x.isConnected && x.getBoundingClientRect().width > 0).pop();
    const el = panel.shadowRoot.querySelector(selector);
    if (!el) return null;
    el.scrollIntoView({ block: 'start' });
    await new Promise((r) => setTimeout(r, 250));
    let top = el.getBoundingClientRect();
    let bottom = top;
    if (extraSelector) {
      const el2 = panel.shadowRoot.querySelector(extraSelector);
      if (el2) bottom = el2.getBoundingClientRect();
    }
    const left = Math.min(top.left, bottom.left);
    const right = Math.max(top.right, bottom.right);
    const t = Math.min(top.top, bottom.top);
    const b = Math.max(top.bottom, bottom.bottom);
    return { x: left - 6, y: t - 6, width: right - left + 12, height: b - t + 12 };
  }, { allByTagSrc, selector, extraSelector });
}

const shot = async (page, rect, file) => {
  const clip = {
    x: Math.max(0, rect.x),
    y: Math.max(0, rect.y),
    width: Math.min(rect.width, 1920),
    height: Math.min(rect.height, 1400),
  };
  await page.screenshot({ path: resolve(OUT, file), clip });
  console.log('📸', file);
};

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1400 } });
  await page.addInitScript((t) => {
    localStorage.setItem('hassTokens', JSON.stringify(t));
    localStorage.setItem('cms-palette', JSON.stringify({
      colors: [
        { id: 'c1', name: 'Brand blue', hex: '#03a9f4' },
        { id: 'c2', name: 'Warm amber', hex: '#ffb300' },
      ],
      defaults: {},
    }));
  }, tokens);

  // Create the shots dashboard
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.evaluate(async ({ urlPath, cards }) => {
    const hass = document.querySelector('home-assistant').hass;
    try {
      await hass.connection.sendMessagePromise({
        type: 'lovelace/dashboards/create', url_path: urlPath, title: 'Readme',
        icon: 'mdi:camera', show_in_sidebar: false, require_admin: false,
      });
    } catch (e) {
      if (!String(e?.message || e).includes('already')) throw e;
    }
    await hass.connection.sendMessagePromise({
      type: 'lovelace/config/save', url_path: urlPath,
      config: { views: [{ title: 'Readme', cards }] },
    });
  }, { urlPath: DASHBOARD, cards: CARDS });

  // --- 01: the Style button in the editor footer (dialog before Style) ---
  await openEditDialog(page, 'hui-tile-card');
  await shot(page, await dialogRect(page), '01 Style button.png');

  // --- 02: the full two-column panel with live preview ---
  await clickStyleTab(page);
  await page.waitForTimeout(600);
  await shot(page, await dialogRect(page), '02 Card-Mod Studio.png');

  // --- 03: Icon + Accent Color, conditional mode with "Controlled by" ---
  await openEditDialog(page, 'hui-light-card');
  await clickStyleTab(page);
  await page.evaluate(async ({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const panel = all(document.body, 'cms-panel').filter((x) => x.isConnected && x.getBoundingClientRect().width > 0).pop();
    panel._studioState = {
      ...panel._studioState,
      accentColor: { ...panel._studioState.accentColor, enabled: true, mode: 'conditional', colorOn: '#ffb300', colorOff: '#455a64' },
      iconColor: { ...panel._studioState.iconColor, enabled: true, mode: 'light', colorOff: '#6b6b6b' },
    };
    await panel.updateComplete;
    for (const sel of ['cms-accent-color-module', 'cms-icon-color-module']) {
      const m = panel.shadowRoot.querySelector(sel);
      if (!m) throw new Error(sel + ' missing; panel has: ' + [...panel.shadowRoot.querySelectorAll('*')].map((x) => x.tagName).filter((t) => t.startsWith('CMS-')).join(',') + ' state=' + JSON.stringify({hasState: !!panel._studioState, type: panel.config?.type}));
      m._open = true; await m.updateComplete;
    }
    panel._emitConfigChanged();
    await new Promise((r) => setTimeout(r, 400));
  }, { allByTagSrc });
  await shot(page, await panelElementRect(page, 'cms-accent-color-module', 'cms-icon-color-module'), '03 Accent and Icon Color.png');

  // --- 04: Background gradient + Apply when ---
  await page.evaluate(async ({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const panel = all(document.body, 'cms-panel').filter((x) => x.isConnected && x.getBoundingClientRect().width > 0).pop();
    panel._studioState = {
      ...panel._studioState,
      background: { enabled: true, type: 'gradient', color1: '#03a9f4', color2: '#ff8c00', angle: 135, applyWhen: 'on' },
    };
    await panel.updateComplete;
    const m = panel.shadowRoot.querySelector('cms-background-module');
    m._open = true; await m.updateComplete;
    panel._emitConfigChanged();
    await new Promise((r) => setTimeout(r, 400));
  }, { allByTagSrc });
  await shot(page, await panelElementRect(page, 'cms-background-module'), '04 Background Color.png');

  // --- 07: Threshold — Fade mode with attribute source + gradient preview ---
  await page.evaluate(async ({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const panel = all(document.body, 'cms-panel').filter((x) => x.isConnected && x.getBoundingClientRect().width > 0).pop();
    panel._studioState = {
      ...panel._studioState,
      threshold: {
        ...panel._studioState.threshold,
        enabled: true,
        entityId: 'sensor.outside_temperature',
        attribute: '',
        properties: ['icon-color', 'accent-color'],
        valueMode: 'gradient',
        rules: [],
        defaultColor: '#888888',
        colorStops: [
          { id: 'a', value: 0, color: '#2196f3' },
          { id: 'b', value: 20, color: '#4caf50' },
          { id: 'c', value: 35, color: '#f44336' },
        ],
      },
    };
    await panel.updateComplete;
    const m = panel.shadowRoot.querySelector('cms-threshold-module');
    m._open = true; await m.updateComplete;
    panel._emitConfigChanged();
    await new Promise((r) => setTimeout(r, 400));
  }, { allByTagSrc });
  await shot(page, await panelElementRect(page, 'cms-threshold-module'), '07 Threshold Fade.png');

  // --- 09: Font module + My Color Palette ---
  await page.evaluate(async ({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const panel = all(document.body, 'cms-panel').filter((x) => x.isConnected && x.getBoundingClientRect().width > 0).pop();
    panel._studioState = {
      ...panel._studioState,
      font: { enabled: true, fontSize: 18, fontFamily: '', fontWeight: 'medium', color: '#e1f5fe' },
    };
    await panel.updateComplete;
    const pm = panel.shadowRoot.querySelector('cms-palette-manager');
    pm._open = true; await pm.updateComplete;
    const fm = panel.shadowRoot.querySelector('cms-font-module');
    fm._open = true; await fm.updateComplete;
    await new Promise((r) => setTimeout(r, 300));
  }, { allByTagSrc });
  await shot(page, await panelElementRect(page, 'cms-palette-manager', 'cms-font-module'), '09 Font and Palette.png');

  // --- 05 + 06: entities card per-row styling ---
  await openEditDialog(page, 'hui-entities-card');
  await clickStyleTab(page);
  await page.evaluate(async ({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const panel = all(document.body, 'cms-panel').filter((x) => x.isConnected && x.getBoundingClientRect().width > 0).pop();
    const rows = panel.shadowRoot.querySelector('cms-entities-rows-module');
    rows._openRows = new Set(['sensor.outside_temperature']);
    await rows.updateComplete;
    rows.scrollIntoView?.();
    await new Promise((r) => setTimeout(r, 300));
  }, { allByTagSrc });
  await shot(page, await panelElementRect(page, 'cms-entities-rows-module'), '05 Entities Card.png');

  await page.evaluate(async ({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const panel = all(document.body, 'cms-panel').filter((x) => x.isConnected && x.getBoundingClientRect().width > 0).pop();
    panel._entityRowStyles = {
      ...panel._entityRowStyles,
      'sensor.outside_temperature': {
        iconColor: '',
        textColor: '',
        iconMode: 'threshold',
        iconRules: [
          { id: 'r1', operator: '<', value: 18, color: 'var(--blue-color)' },
          { id: 'r2', operator: '>=', value: 25, color: 'var(--red-color)' },
        ],
        iconDefault: 'var(--green-color)',
        fontSizePx: 18,
        fontWeight: 'medium',
      },
    };
    const rows = panel.shadowRoot.querySelector('cms-entities-rows-module');
    rows.styles = panel._entityRowStyles;
    await rows.updateComplete;
    panel._emitConfigChanged();
    await new Promise((r) => setTimeout(r, 500));
  }, { allByTagSrc });
  await shot(page, await panelElementRect(page, 'cms-entities-rows-module'), '06 Entities Card Modifications.png');

  // --- 08: stack child styling sections ---
  await openEditDialog(page, 'hui-vertical-stack-card');
  await clickStyleTab(page);
  await page.evaluate(async ({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const panel = all(document.body, 'cms-panel').filter((x) => x.isConnected && x.getBoundingClientRect().width > 0).pop();
    const sections = panel.shadowRoot.querySelectorAll('cms-child-card-section');
    if (sections[1]) { sections[1]._open = true; await sections[1].updateComplete; }
    await new Promise((r) => setTimeout(r, 300));
  }, { allByTagSrc });
  await shot(page, await dialogRect(page), '08 Stack Children.png');

  await browser.close();
  console.log('done →', OUT);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

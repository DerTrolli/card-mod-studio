// Regenerates the README screenshots (images/*.png) against a REAL Home
// Assistant edit-card dialog — not ad-hoc mounts — so what's pictured is
// exactly what users see (including entity pickers, which only render with
// a real <home-assistant> ancestor). Each shot is cropped to the section
// it illustrates and annotated with arrows + labels pointing at the
// controls the README text talks about, so the whole set is reproducible
// after UI changes (no hand-drawn arrows to redo).
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

/** Dashboard cards the shots are taken from. */
const CARDS = [
  { // overview tile, pre-styled so the preview shows something
    type: 'tile',
    entity: 'sensor.outside_temperature',
    card_mod: { style: 'ha-card {\n  --accent-color: #03a9f4;\n  --tile-color: #03a9f4 !important;\n  border: 2px solid #03a9f4;\n}' },
  },
  { type: 'light', entity: 'light.ceiling_lights' },
  {
    type: 'entities',
    title: 'Climate',
    entities: [
      'sensor.outside_temperature',
      'sensor.outside_humidity',
      { entity: 'light.ceiling_lights', name: 'Ceiling lights' },
    ],
  },
  {
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

/**
 * Draws arrow + label annotations into the dialog's top layer (a normal
 * document.body overlay would paint BEHIND the modal — the dialog is in
 * the browser top layer, so the overlay must live inside it; its CSS
 * transform then makes the dialog the containing block, so coordinates
 * are dialog-relative).
 *
 * Each annotation: { find, label, side } where find is one of
 *   { global: 'tag-name' }                      — anywhere in the document
 *   { panel: '.selector' }                      — in cms-panel's shadow root
 *   { module: 'cms-x-module', sel, text }       — inside a module's shadow
 *     root, optionally filtered to the element whose textContent includes
 *     `text`.
 * side: which side of the target the label sits on ('left'|'right'|'top'|'bottom').
 * Returns the union bbox (viewport coords) of targets + labels for cropping.
 */
async function annotate(page, anns) {
  return page.evaluate(async ({ allByTagSrc, anns }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const haDialog = all(document.body, 'ha-dialog')[0];
    const dialog = haDialog?.shadowRoot?.querySelector('wa-dialog')?.shadowRoot?.querySelector('dialog') ?? document.body;
    const dRect = dialog.getBoundingClientRect();
    const panel = all(document.body, 'cms-panel').filter((x) => x.isConnected && x.getBoundingClientRect().width > 0).pop();

    dialog.querySelector('#cms-annotate-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'cms-annotate-overlay';
    overlay.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:2147483647;overflow:visible;';
    dialog.appendChild(overlay);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', String(dRect.width));
    svg.setAttribute('height', String(dRect.height));
    svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;';
    svg.innerHTML = `<defs><marker id="cms-arrowhead" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="#d81b60"/></marker></defs>`;
    overlay.appendChild(svg);

    const bboxes = [];

    const findEl = (f) => {
      if (f.global) return all(document.body, f.global).filter((x) => x.getBoundingClientRect().width > 0).pop();
      if (f.panel) return panel?.shadowRoot?.querySelector(f.panel);
      if (f.module) {
        const mod = panel?.shadowRoot?.querySelector(f.module);
        if (!mod) return null;
        const root = mod.shadowRoot ?? mod;
        if (!f.sel) return mod;
        const cands = [...root.querySelectorAll(f.sel)];
        return f.text ? cands.find((c) => (c.textContent || '').includes(f.text)) : cands[0];
      }
      return null;
    };

    for (const a of anns) {
      const el = findEl(a.find);
      if (!el) { console.warn('[annotate] target not found', a); continue; }
      const r = el.getBoundingClientRect();
      bboxes.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

      // Label pill
      const label = document.createElement('div');
      label.textContent = a.label;
      label.style.cssText =
        'position:absolute;background:#d81b60;color:#fff;font:600 13px/1.35 Roboto,system-ui,sans-serif;' +
        'padding:5px 11px;border-radius:15px;box-shadow:0 2px 8px rgba(0,0,0,.35);white-space:nowrap;';
      overlay.appendChild(label);
      const lw = label.getBoundingClientRect().width;
      const lh = label.getBoundingClientRect().height;

      // Target point (dialog-relative) + label placement per side
      const side = a.side ?? 'left';
      const GAP = 42; // arrow length
      let tx, ty, lx, ly; // arrow tip, label top-left (dialog-relative)
      if (side === 'left') {
        tx = r.left - dRect.left - 4; ty = r.top - dRect.top + r.height / 2;
        lx = tx - GAP - lw; ly = ty - lh / 2;
      } else if (side === 'right') {
        tx = r.right - dRect.left + 4; ty = r.top - dRect.top + r.height / 2;
        lx = tx + GAP; ly = ty - lh / 2;
      } else if (side === 'top') {
        tx = r.left - dRect.left + Math.min(r.width / 2, 160); ty = r.top - dRect.top - 4;
        lx = tx - lw / 2 + (a.shiftX ?? 0); ly = ty - GAP - lh;
      } else if (side === 'insideRight') {
        // Label sits at the right end INSIDE the row (for full-width rows
        // whose visible content ends mid-row); arrow points left at it.
        lx = r.right - dRect.left - lw - 10; ly = r.top - dRect.top + r.height / 2 - lh / 2;
        tx = lx - GAP; ty = ly + lh / 2;
      } else { // bottom
        tx = r.left - dRect.left + Math.min(r.width / 2, 160); ty = r.bottom - dRect.top + 4;
        lx = tx - lw / 2 + (a.shiftX ?? 0); ly = ty + GAP;
      }
      // Clamp the label inside the dialog horizontally
      lx = Math.max(8, Math.min(lx, dRect.width - lw - 8));
      label.style.left = `${lx}px`;
      label.style.top = `${ly}px`;

      // Arrow from the label edge nearest the target to the target point
      const ax = side === 'left' || side === 'insideRight' ? lx + lw + 3 : side === 'right' ? lx - 3 : Math.max(lx + 10, Math.min(tx, lx + lw - 10));
      const ay = side === 'top' ? ly + lh + 3 : side === 'bottom' ? ly - 3 : ly + lh / 2;
      const fixAx = side === 'insideRight' ? lx - 3 : ax;
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', String(fixAx));
      line.setAttribute('y1', String(ay));
      line.setAttribute('x2', String(tx));
      line.setAttribute('y2', String(ty));
      line.setAttribute('stroke', '#d81b60');
      line.setAttribute('stroke-width', '2.5');
      line.setAttribute('marker-end', 'url(#cms-arrowhead)');
      svg.appendChild(line);

      const lr = label.getBoundingClientRect();
      bboxes.push({ left: lr.left, top: lr.top, right: lr.right, bottom: lr.bottom });
    }

    if (bboxes.length === 0) return null;
    const left = Math.min(...bboxes.map((b) => b.left));
    const top = Math.min(...bboxes.map((b) => b.top));
    const right = Math.max(...bboxes.map((b) => b.right));
    const bottom = Math.max(...bboxes.map((b) => b.bottom));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }, { allByTagSrc, anns });
}

async function clearAnnotations(page) {
  await page.evaluate(({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const haDialog = all(document.body, 'ha-dialog')[0];
    const dialog = haDialog?.shadowRoot?.querySelector('wa-dialog')?.shadowRoot?.querySelector('dialog') ?? document.body;
    dialog.querySelector('#cms-annotate-overlay')?.remove();
  }, { allByTagSrc });
}

const union = (a, b) => {
  if (!b) return a;
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
};

const pad = (r, p) => ({ x: r.x - p, y: r.y - p, width: r.width + 2 * p, height: r.height + 2 * p });

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

  // --- 01: the Style button in the editor footer ---
  await openEditDialog(page, 'hui-tile-card');
  {
    const ann = await annotate(page, [
      { find: { global: 'cms-tab-button' }, label: 'Opens the Card-Mod Studio panel', side: 'top', shiftX: 280 },
    ]);
    const d = await dialogRect(page);
    // Crop to the lower part of the dialog — the button is the story here.
    const lower = { x: d.x, y: d.y + d.height * 0.66, width: d.width, height: d.height * 0.34 };
    await shot(page, union(lower, ann ? pad(ann, 14) : null), '01 Style button.png');
    await clearAnnotations(page);
  }

  // --- 02: the full two-column panel with live preview ---
  await clickStyleTab(page);
  await page.waitForTimeout(600);
  {
    const ann = await annotate(page, [
      { find: { panel: '.preview-card-wrapper hui-card' }, label: 'Live preview — updates as you edit', side: 'bottom' },
    ]);
    await shot(page, union(await dialogRect(page), ann ? pad(ann, 10) : null), '02 Card-Mod Studio.png');
    await clearAnnotations(page);
  }

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
      m._open = true; await m.updateComplete;
    }
    panel._emitConfigChanged();
    await new Promise((r) => setTimeout(r, 400));
  }, { allByTagSrc });
  {
    const content = await panelElementRect(page, 'cms-accent-color-module', 'cms-icon-color-module');
    const ann = await annotate(page, [
      { find: { module: 'cms-accent-color-module', sel: 'cms-entity-picker' }, label: 'Any entity can drive the colors', side: 'insideRight' },
    ]);
    await shot(page, union(content, ann ? pad(ann, 12) : null), '03 Accent and Icon Color.png');
    await clearAnnotations(page);
  }

  // --- 04: Background gradient + Apply when ---
  await page.evaluate(async ({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const panel = all(document.body, 'cms-panel').filter((x) => x.isConnected && x.getBoundingClientRect().width > 0).pop();
    panel._studioState = {
      ...panel._studioState,
      accentColor: { ...panel._studioState.accentColor, enabled: false },
      iconColor: { ...panel._studioState.iconColor, enabled: false },
      background: { enabled: true, type: 'gradient', color1: '#03a9f4', color2: '#ff8c00', angle: 135, applyWhen: 'on' },
    };
    await panel.updateComplete;
    for (const sel of ['cms-accent-color-module', 'cms-icon-color-module']) {
      const m = panel.shadowRoot.querySelector(sel);
      m._open = false; await m.updateComplete;
    }
    const m = panel.shadowRoot.querySelector('cms-background-module');
    m._open = true; await m.updateComplete;
    panel._emitConfigChanged();
    await new Promise((r) => setTimeout(r, 400));
  }, { allByTagSrc });
  {
    const content = await panelElementRect(page, 'cms-background-module');
    const ann = await annotate(page, [
      { find: { module: 'cms-background-module', sel: '.control-row', text: 'Apply when' }, label: 'Only while the entity is ON / OFF', side: 'bottom', shiftX: -140 },
    ]);
    await shot(page, union(content, ann ? pad(ann, 12) : null), '04 Background Color.png');
    await clearAnnotations(page);
  }

  // --- 07: Threshold — Fade mode + attribute source ---
  await page.evaluate(async ({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const panel = all(document.body, 'cms-panel').filter((x) => x.isConnected && x.getBoundingClientRect().width > 0).pop();
    panel._studioState = {
      ...panel._studioState,
      background: { ...panel._studioState.background, enabled: false },
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
    const bg = panel.shadowRoot.querySelector('cms-background-module');
    bg._open = false; await bg.updateComplete;
    const m = panel.shadowRoot.querySelector('cms-threshold-module');
    m._open = true; await m.updateComplete;
    panel._emitConfigChanged();
    await new Promise((r) => setTimeout(r, 400));
  }, { allByTagSrc });
  {
    const content = await panelElementRect(page, 'cms-threshold-module');
    const ann = await annotate(page, [
      { find: { module: 'cms-threshold-module', sel: '.control-row', text: 'Apply to' }, label: 'One rule set can drive several properties', side: 'insideRight' },
      { find: { module: 'cms-threshold-module', sel: '.gradient-bar' }, label: 'Fade mode — smooth value → color blend', side: 'bottom', shiftX: -150 },
    ]);
    await shot(page, union(content, ann ? pad(ann, 12) : null), '07 Threshold Fade.png');
    await clearAnnotations(page);
  }

  // --- 09: Font module + My Color Palette ---
  await page.evaluate(async ({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const panel = all(document.body, 'cms-panel').filter((x) => x.isConnected && x.getBoundingClientRect().width > 0).pop();
    panel._studioState = {
      ...panel._studioState,
      threshold: { ...panel._studioState.threshold, enabled: false },
      font: { enabled: true, fontSize: 18, fontFamily: '', fontWeight: 'medium', color: '#e1f5fe' },
    };
    await panel.updateComplete;
    const t = panel.shadowRoot.querySelector('cms-threshold-module');
    t._open = false; await t.updateComplete;
    const pm = panel.shadowRoot.querySelector('cms-palette-manager');
    pm._open = true; await pm.updateComplete;
    const fm = panel.shadowRoot.querySelector('cms-font-module');
    fm._open = true; await fm.updateComplete;
    await new Promise((r) => setTimeout(r, 300));
  }, { allByTagSrc });
  {
    const content = await panelElementRect(page, 'cms-palette-manager', 'cms-font-module');
    const ann = await annotate(page, [
      { find: { module: 'cms-palette-manager', sel: '.color-row' }, label: 'Your named colors — in every color picker', side: 'top', shiftX: 230 },
    ]);
    await shot(page, union(content, ann ? pad(ann, 12) : null), '09 Font and Palette.png');
    await clearAnnotations(page);
  }

  // --- 05 + 06: entities card per-row styling ---
  await openEditDialog(page, 'hui-entities-card');
  await clickStyleTab(page);
  await page.evaluate(async ({ allByTagSrc }) => {
    const all = new Function('root', 'tag', allByTagSrc);
    const panel = all(document.body, 'cms-panel').filter((x) => x.isConnected && x.getBoundingClientRect().width > 0).pop();
    const rows = panel.shadowRoot.querySelector('cms-entities-rows-module');
    rows._openRows = new Set(['sensor.outside_temperature']);
    await rows.updateComplete;
    await new Promise((r) => setTimeout(r, 300));
  }, { allByTagSrc });
  {
    const content = await panelElementRect(page, 'cms-entities-rows-module');
    const ann = await annotate(page, [
      { find: { module: 'cms-entities-rows-module', sel: '.entity-header' }, label: 'One section per entity row', side: 'bottom', shiftX: 190 },
    ]);
    await shot(page, union(content, ann ? pad(ann, 12) : null), '05 Entities Card.png');
    await clearAnnotations(page);
  }

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
  {
    const content = await panelElementRect(page, 'cms-entities-rows-module');
    const ann = await annotate(page, [
      { find: { module: 'cms-entities-rows-module', sel: '.rule' }, label: 'Value-based rules for just this row', side: 'insideRight' },
      { find: { module: 'cms-entities-rows-module', sel: 'ha-slider' }, label: 'Per-row font override', side: 'left' },
    ]);
    await shot(page, union(content, ann ? pad(ann, 12) : null), '06 Entities Card Modifications.png');
    await clearAnnotations(page);
  }

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
  {
    const ann = await annotate(page, [
      { find: { panel: 'cms-child-card-section' }, label: 'One styling section per card in the stack', side: 'bottom', shiftX: 200 },
    ]);
    await shot(page, union(await dialogRect(page), ann ? pad(ann, 10) : null), '08 Stack Children.png');
    await clearAnnotations(page);
  }

  await browser.close();
  console.log('done →', OUT);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

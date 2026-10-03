// Release QA — visual + automated UI-quality sweep through HA's REAL card-edit
// dialog, for every theme × viewport × scenario card.
//
// Per run (one engine rig, chosen by HA_URL / TOKENS_FILE / STYLE_KEY like
// every other check):
//   - opens the real dialog (storage dashboard + ?edit=1 + the card's Edit
//     button), clicks the injected Style button — real mouse clicks only;
//   - enables EVERY module switch and expands EVERY module (plus the first
//     entities row / first stack child), exactly as a user would;
//   - measures, over every visible element of the panel:
//       * text contrast (WCAG 2.x), alpha-composited against the backgrounds
//         actually painted behind each element (4.5:1, 3:1 for large text);
//       * clipping / horizontal overflow (element extends past an ancestor
//         that hides overflow, or past the panel itself);
//       * light native controls rendered on a dark theme (white boxes);
//       * touch targets under 24×24px (WCAG 2.5.8) on phone viewports;
//       * page errors / console errors raised while driving the panel;
//   - saves labeled screenshots, clipped to the dialog: the HA dialog before
//     Style is clicked (footer), then scroll frames through the whole panel
//     on "full capture" viewports, plus a color-popover and preview-picker
//     hover shot on the tile scenario;
//   - on desktop-light, clicks HA's own Save and verifies the styling was
//     persisted to the dashboard config and renders on the dashboard.
//
// Light/dark: Playwright's prefers-color-scheme emulation — HA's default
// theme is "auto" on a fresh profile, so it follows it (verified per run via
// --primary-background-color).
//
// env: QA_THEMES (light,dark)  QA_VIEWPORTS (see VIEWPORTS)  QA_SCENARIOS
//      QA_FULL (viewports that get full scroll capture)  QA_OUT (dir)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { waitForHassReady, ensureStorageDashboard } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, process.env.TOKENS_FILE || 'tokens.json'), 'utf8'));
const STYLE_KEY = process.env.STYLE_KEY === 'uix' ? 'uix' : 'card_mod';
const RIG = STYLE_KEY === 'uix' ? 'uix' : 'cardmod';
const OUT = resolve(process.env.QA_OUT || resolve(HERE, 'shots', 'qa', RIG));

const VIEWPORTS = {
  phone360: { width: 360, height: 740, mobile: true },
  phone390: { width: 390, height: 844, mobile: true },
  split700: { width: 700, height: 900, mobile: false },
  tablet1024: { width: 1024, height: 768, mobile: true },
  desktop1440: { width: 1440, height: 900, mobile: false },
  wide1920: { width: 1920, height: 1080, mobile: false },
};
const list = (v, d) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : d);
const THEMES = list(process.env.QA_THEMES, ['light', 'dark']);
const VPS = list(process.env.QA_VIEWPORTS, Object.keys(VIEWPORTS));
const FULL = new Set(list(process.env.QA_FULL, ['phone390', 'desktop1440']));

const other = STYLE_KEY === 'uix' ? 'card_mod' : 'uix';
const SCENARIOS = {
  tile: { type: 'tile', entity: 'light.ceiling_lights' },
  entities: {
    type: 'entities',
    title: 'Living room',
    entities: [
      { entity: 'light.ceiling_lights', [STYLE_KEY]: { style: ':host {\n  --state-icon-color: #e91e63;\n}' } },
      'sensor.outside_temperature',
      'switch.decorative_lights',
    ],
  },
  stack: {
    type: 'vertical-stack',
    cards: [
      { type: 'tile', entity: 'light.ceiling_lights' },
      { type: 'entities', entities: ['sensor.outside_humidity', 'light.kitchen_lights'] },
    ],
  },
  heading: { type: 'heading', heading: 'Living room', icon: 'mdi:sofa' },
  gauge: { type: 'gauge', entity: 'sensor.outside_temperature', min: 0, max: 40 },
  thermostat: { type: 'thermostat', entity: 'climate.heatpump' },
  button: { type: 'button', entity: 'light.ceiling_lights' },
  dict: {
    type: 'gauge', entity: 'sensor.outside_temperature', min: 0, max: 40,
    [STYLE_KEY]: { style: { '.': 'ha-card {\n  border-radius: 20px;\n}', 'ha-gauge$': 'text.value-text {\n  font-weight: 700;\n}' } },
  },
  mixed: {
    type: 'tile', entity: 'light.ceiling_lights',
    [STYLE_KEY]: { style: 'ha-card {\n  border-radius: 20px;\n}' },
    [other]: { style: { 'ha-tile-icon$': '.x {\n  color: red;\n}' } },
  },
  // Only meaningful where UIX is absent: the "only under uix:" warning.
  ...(RIG === 'cardmod' ? { uixonly: { type: 'tile', entity: 'light.ceiling_lights', uix: { style: 'ha-card {\n  background: #224466;\n}' } } } : {}),
};
const SCEN = list(process.env.QA_SCENARIOS, Object.keys(SCENARIOS)).filter((s) => SCENARIOS[s]);

// ---------------------------------------------------------------------------
// In-page instrumentation (installed once per page)
// ---------------------------------------------------------------------------
const INSTALL = () => {
  const Q = {};
  // Pre-order (document order) walk through shadow roots, so "the first
  // match" really is the first one on screen (a plain stack walk returns
  // siblings in reverse).
  Q.deepAll = (root) => {
    const out = []; const st = [root];
    while (st.length) {
      const n = st.pop();
      if (n.nodeType === 1) out.push(n);
      const kids = [...(n.shadowRoot ? n.shadowRoot.children : []), ...(n.children || [])];
      for (let i = kids.length - 1; i >= 0; i--) st.push(kids[i]);
    }
    return out;
  };
  Q.find = (tag) => Q.deepAll(document.body).filter((n) => n.tagName?.toLowerCase() === tag);
  // visual parent: slot for slotted nodes, else parent / shadow host
  Q.vparent = (n) => n.assignedSlot || n.parentElement || n.getRootNode()?.host || null;
  Q.inside = (n, pred) => { for (let x = n; x; x = Q.vparent(x)) if (pred(x)) return x; return null; };
  // same, but never looks at or above `stop` (HA's modal <dialog> is itself
  // position:fixed, so unbounded "inside a fixed box" checks match everything)
  Q.insideBelow = (n, pred, stop) => { for (let x = n; x && x !== stop; x = Q.vparent(x)) if (pred(x)) return x; return null; };
  Q.parse = (s) => {
    if (!s) return null;
    let m = s.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    m = s.match(/^color\(srgb\s+([^)]+)\)$/);
    if (m) {
      const [rgb, a] = m[1].split('/');
      const p = rgb.trim().split(/\s+/).map(Number);
      return [p[0] * 255, p[1] * 255, p[2] * 255, a !== undefined ? Number(a) : 1];
    }
    return null;
  };
  Q.lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  Q.ratio = (a, b) => { const [x, y] = [Q.lum(a), Q.lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  Q.mix = (top, bottom) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)); };
  Q.pageBg = () => Q.parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1];
  Q.bgOf = (el) => {
    const layers = [];
    for (let n = el; n; n = Q.vparent(n)) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // gradient/image: can't judge
      const c = Q.parse(cs.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; }
    }
    let base = Q.pageBg().slice(0, 3);
    if (layers.length && layers[layers.length - 1][3] >= 0.999) base = layers.pop().slice(0, 3);
    for (let i = layers.length - 1; i >= 0; i--) base = Q.mix(layers[i], base);
    return base;
  };
  Q.opacityOf = (el) => { let o = 1; for (let n = el; n; n = Q.vparent(n)) o *= Number(getComputedStyle(n).opacity || 1); return o; };
  Q.visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Q.opacityOf(el) > 0.05;
  };
  Q.label = (el) => {
    const parts = [];
    for (let n = el, i = 0; n && i < 4; n = Q.vparent(n), i++) {
      const cls = typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/)[0] : '';
      parts.unshift(n.tagName.toLowerCase() + cls);
      if (n.tagName.includes('-') && n.tagName.toLowerCase().startsWith('cms-')) break;
    }
    return parts.join(' > ');
  };
  Q.panel = () => Q.find('cms-panel')[0] || null;
  Q.isPreview = (n) => !!Q.inside(n, (x) => x.classList?.contains('preview-card-wrapper') || x.classList?.contains('preview-col'));
  Q.isHaComponent = (n) => !!Q.insideBelow(n, (x) => /^(ha-code-editor|ha-entity-picker|ha-combo-box|ha-switch|ha-slider|ha-select|ha-textfield|ha-icon-button|ha-svg-icon|ha-icon|ha-list-item|mwc-|wa-)/.test(x.tagName?.toLowerCase() || ''), Q.panel());
  Q.audit = (opts) => {
    const panel = Q.panel();
    if (!panel) return { error: 'no panel' };
    const pr = panel.getBoundingClientRect();
    const els = Q.deepAll(panel).filter((e) => e !== panel);
    const contrast = []; const clipped = []; const lightCtrl = []; const tiny = []; const haContrast = [];
    const seen = new Set();
    for (const el of els) {
      if (Q.isPreview(el)) continue;
      if (Q.insideBelow(el, (x) => getComputedStyle(x).position === 'fixed', panel)) continue; // popovers judged separately
      if (!Q.visible(el)) continue;
      const tag = el.tagName.toLowerCase();
      const cs = getComputedStyle(el);
      const haComp = Q.isHaComponent(el);
      // --- contrast: elements carrying their own text, plus form controls
      const ownText = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join('').trim();
      const isCtrl = tag === 'select' || (tag === 'input' && ['text', 'number', 'search', ''].includes(el.type)) || tag === 'textarea';
      if ((ownText && !/^[\p{Extended_Pictographic}\s▶▼]+$/u.test(ownText)) || isCtrl) {
        const bg = Q.bgOf(el);
        const fg = Q.parse(cs.color);
        if (bg && fg) {
          const a = fg[3] * Q.opacityOf(el);
          const eff = Q.mix([fg[0], fg[1], fg[2], a], bg);
          const r = Q.ratio(eff, bg);
          const px = parseFloat(cs.fontSize); const w = Number(cs.fontWeight) || 400;
          const large = px >= 24 || (px >= 18.66 && w >= 700);
          const need = large ? 3 : 4.5;
          const disabled = !!Q.inside(el, (x) => x.hasAttribute?.('disabled'));
          if (r < need && haComp) haContrast.push({ el: Q.label(el), text: (ownText || el.value || '').slice(0, 40), ratio: +r.toFixed(2) });
          if (r < need && !disabled && !haComp) {
            const key = Q.label(el) + '|' + (ownText || el.value || '').slice(0, 30);
            if (!seen.has('c' + key)) {
              seen.add('c' + key);
              contrast.push({ el: Q.label(el), text: (ownText || el.value || '').slice(0, 50), ratio: +r.toFixed(2), need, fontPx: px, haComponent: haComp, fg: cs.color, bg: `rgb(${bg.map(Math.round).join(', ')})` });
            }
          }
        }
      }
      // --- clipping / overflow
      const r = el.getBoundingClientRect();
      if (!haComp && !Q.insideBelow(el, (x) => x.tagName?.toLowerCase() === 'ha-code-editor', panel)) {
        let clipper = null;
        for (let n = Q.vparent(el); n && n !== panel; n = Q.vparent(n)) {
          const ncs = getComputedStyle(n);
          if (/(hidden|auto|scroll|clip)/.test(ncs.overflowX) || /(hidden|clip)/.test(ncs.overflow)) { clipper = n; break; }
        }
        const box = clipper ? clipper.getBoundingClientRect() : pr;
        if (r.right > box.right + 1.5 || r.left < box.left - 1.5) {
          const key = 'o' + Q.label(el);
          if (!seen.has(key)) { seen.add(key); clipped.push({ el: Q.label(el), text: (ownText || '').slice(0, 40), right: Math.round(r.right), boxRight: Math.round(box.right), by: clipper ? Q.label(clipper) : 'panel' }); }
        }
      }
      // --- native controls painted light on a dark theme
      const isSwatch = el.classList?.contains('preset') || el.classList?.contains('swatch-trigger');
      if (opts.dark && !haComp && !isSwatch && ['input', 'select', 'textarea', 'button'].includes(tag) && el.type !== 'color' && el.type !== 'checkbox' && el.type !== 'range') {
        const bg = Q.bgOf(el);
        if (bg && Q.lum(bg) > 0.35) {
          const key = 'l' + Q.label(el);
          if (!seen.has(key)) { seen.add(key); lightCtrl.push({ el: Q.label(el), bg: `rgb(${bg.map(Math.round).join(', ')})` }); }
        }
      }
      // --- touch targets (phones)
      if (opts.touch) {
        const interactive = (['button', 'select', 'input', 'ha-switch', 'ha-icon-button', 'label'].includes(tag)
          || el.getAttribute?.('role') === 'button' || el.classList?.contains('module-header') || el.classList?.contains('preset')
          || el.classList?.contains('swatch-trigger') || el.classList?.contains('child-header') || el.classList?.contains('entity-header'))
          && !(tag === 'label' && !el.querySelector('input'));
        // a control inside a bigger tappable parent (e.g. checkbox in its label) is covered by the parent
        const coveredBy = Q.insideBelow(Q.vparent(el), (x) => { const xr = x.getBoundingClientRect(); return (['button', 'select', 'label', 'ha-switch'].includes(x.tagName?.toLowerCase()) || x.classList?.contains('module-header')) && xr.width >= 24 && xr.height >= 24; }, panel);
        if (interactive && !haComp && !coveredBy && (r.width < 24 || r.height < 24) && el.type !== 'hidden') {
          const key = 't' + Q.label(el);
          if (!seen.has(key)) { seen.add(key); tiny.push({ el: Q.label(el), w: Math.round(r.width), h: Math.round(r.height), text: (ownText || el.title || '').slice(0, 30) }); }
        }
      }
    }
    const docOverflow = document.scrollingElement.scrollWidth > innerWidth + 1;
    return { contrast, clipped, lightCtrl, tiny, haContrast, docOverflow, panelWidth: Math.round(pr.width), narrow: !!panel.shadowRoot.querySelector('.panel-body.narrow') };
  };
  Q.dialogRect = () => {
    const d = Q.deepAll(document.body).find((n) => n.tagName === 'DIALOG' && n.open);
    const r = (d || document.documentElement).getBoundingClientRect();
    return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(innerWidth, r.right) - Math.max(0, r.left), height: Math.min(innerHeight, r.bottom) - Math.max(0, r.top) };
  };
  Q.center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };
  window.__qa = Q;
};

// ---------------------------------------------------------------------------
const clickEl = async (page, fnSrc, arg) => {
  const pt = await page.evaluate(({ fnSrc, arg }) => {
    // eslint-disable-next-line no-new-func
    const el = new Function('Q', 'arg', fnSrc)(window.__qa, arg);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    return window.__qa.center(el);
  }, { fnSrc, arg });
  if (!pt || pt.w < 1) return false;
  await page.mouse.click(pt.x, pt.y);
  return true;
};

async function openStyle(page, urlPath) {
  await page.goto(`${HA}/${urlPath}/0?edit=1`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });
  await page.waitForTimeout(1800);
  await page.evaluate(INSTALL);
  // the card's "Edit" button in hui-card-options
  let ok = false;
  for (let i = 0; i < 10 && !ok; i++) {
    ok = await clickEl(page, `
      const opts = Q.find('hui-card-options')[0]; if (!opts) return null;
      const els = Q.deepAll(opts);
      const t = els.find((el) => (el.textContent || '').trim().toLowerCase() === 'edit' && el.children.length === 0);
      return t ? (t.closest('ha-button, mwc-button, button') || t) : null;`);
    if (!ok) await page.waitForTimeout(700);
  }
  if (!ok) {
    // Narrow viewports: HA collapses the card-options footer to "− n + ⋮"
    // (the ⋮ menu is icon-only and has no Edit entry) — on a phone you edit
    // a card by tapping the card itself, so do that.
    ok = await clickEl(page, `
      const opts = Q.find('hui-card-options')[0]; if (!opts) return null;
      return Q.deepAll(opts).find((n) => n.tagName === 'HA-CARD' && Q.visible(n)) || null;`);
    if (ok) {
      await page.waitForFunction(() => window.__qa.find('cms-tab-button').length > 0, { timeout: 8000 }).catch(() => { ok = false; });
    }
  }
  if (!ok) throw new Error('card Edit button not found');
  await page.waitForFunction(() => window.__qa.find('cms-tab-button').length > 0, { timeout: 20000 });
  await page.waitForTimeout(900);
}

async function clickStyle(page) {
  const ok = await clickEl(page, `return Q.find('cms-tab-button')[0];`);
  if (!ok) throw new Error('Style button not found');
  await page.waitForFunction(() => !!window.__qa.panel(), { timeout: 15000 });
  await page.waitForTimeout(900);
}

/** Expands child/row/module sections and enables every module switch, with real clicks. */
async function exerciseAll(page, scenario) {
  const acts = [];
  if (scenario === 'stack') {
    if (await clickEl(page, `return Q.deepAll(Q.panel()).find((n) => n.classList?.contains('child-header'));`)) acts.push('child expanded');
    await page.waitForTimeout(500);
  }
  // enable every module switch (headers only), one at a time
  for (let i = 0; i < 30; i++) {
    const did = await clickEl(page, `
      return Q.deepAll(Q.panel()).find((n) => n.tagName === 'HA-SWITCH' && n.parentElement?.classList?.contains('module-header') && !n.checked && Q.visible(n));`);
    if (!did) break;
    acts.push('switch');
    await page.waitForTimeout(350);
  }
  // expand every closed module (click the title so we don't hit the switch)
  for (let i = 0; i < 30; i++) {
    const did = await clickEl(page, `
      const mods = Q.deepAll(Q.panel()).filter((n) => n.classList?.contains('module') && Q.visible(n));
      for (const m of mods) {
        const h = m.querySelector(':scope > .module-header'); if (!h) continue;
        if (getComputedStyle(h).pointerEvents === 'none') continue;
        const host = m.getRootNode().host;
        const open = host && ('_open' in host ? host._open : host.open);
        if (!open) return h.querySelector('.module-title') || h;
      }
      return null;`);
    if (!did) break;
    acts.push('expand');
    await page.waitForTimeout(300);
  }
  if (scenario === 'entities' || scenario === 'stack') {
    if (await clickEl(page, `return Q.deepAll(Q.panel()).find((n) => n.classList?.contains('entity-header') && Q.visible(n));`)) acts.push('row expanded');
    await page.waitForTimeout(400);
  }
  return acts;
}

async function scrollFrames(page, dir, prefix) {
  const files = [];
  await page.evaluate(() => {
    const p = window.__qa.panel();
    const sc = p.shadowRoot.querySelector('.panel-body.narrow') || p.shadowRoot.querySelector('.modules-col');
    window.__qaScroller = sc; sc.scrollTop = 0;
    // scrollIntoView() during the clicks also scrolls OUTER containers
    // (HA's dialog content, even overflow:hidden hosts) — a user scrolling
    // the panel never does; reset them so frames show the real layout.
    for (let n = window.__qa.vparent(p); n; n = window.__qa.vparent(n)) {
      if (n.scrollTop) n.scrollTop = 0;
      if (n.scrollLeft) n.scrollLeft = 0;
    }
    if (p.scrollTop) p.scrollTop = 0;
  });
  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(250);
    const clip = await page.evaluate(() => window.__qa.dialogRect());
    const f = resolve(dir, `${prefix}-${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: f, clip });
    files.push(f);
    const moved = await page.evaluate(() => {
      const sc = window.__qaScroller; const before = sc.scrollTop;
      sc.scrollTop = before + sc.clientHeight * 0.85;
      return sc.scrollTop > before + 2;
    });
    if (!moved) break;
  }
  return files;
}

// ---------------------------------------------------------------------------
const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const report = { rig: RIG, styleKey: STYLE_KEY, startedAt: new Date().toISOString(), runs: [] };

  // one-time: dashboards per scenario
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
    await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
    await waitForHassReady(page);
    report.haVersion = await page.evaluate(() => document.querySelector('home-assistant').hass.config.version);
    for (const s of SCEN) await ensureStorageDashboard(page, `qa-${s}`, [{ title: s, cards: [SCENARIOS[s]] }]);
    await ctx.close();
  }

  for (const theme of THEMES) {
    for (const vpName of VPS) {
      const vp = VIEWPORTS[vpName];
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1,
        colorScheme: theme, isMobile: vp.mobile, hasTouch: vp.mobile,
      });
      for (const scen of SCEN) {
        const dir = resolve(OUT, theme, vpName); mkdirSync(dir, { recursive: true });
        const rec = { theme, viewport: vpName, scenario: scen, errors: [] };
        const page = await ctx.newPage();
        page.on('pageerror', (e) => rec.errors.push('pageerror: ' + String(e.message || e).slice(0, 300)));
        page.on('console', (m) => { if (m.type() === 'error') rec.errors.push('console: ' + m.text().slice(0, 300)); });
        await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
        try {
          // fresh dashboard config each time (Save on a previous run mutates it)
          await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
          await waitForHassReady(page);
          await ensureStorageDashboard(page, `qa-${scen}`, [{ title: scen, cards: [SCENARIOS[scen]] }]);
          await openStyle(page, `qa-${scen}`);
          rec.themeBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary-background-color').trim());
          await page.screenshot({ path: resolve(dir, `${scen}-00-dialog.png`), clip: await page.evaluate(() => window.__qa.dialogRect()) });
          await clickStyle(page);
          await page.screenshot({ path: resolve(dir, `${scen}-01-style.png`), clip: await page.evaluate(() => window.__qa.dialogRect()) });
          rec.actions = await exerciseAll(page, scen);
          await page.waitForTimeout(600);
          rec.audit = await page.evaluate((o) => window.__qa.audit(o), { dark: theme === 'dark', touch: vp.mobile && vp.width < 500 });
          rec.emitted = await page.evaluate(() => {
            const d = window.__qa.find('hui-dialog-edit-card')[0];
            return d?._cardConfig ? JSON.stringify(d._cardConfig).slice(0, 4000) : null;
          });
          if (FULL.has(vpName)) {
            rec.frames = (await scrollFrames(page, dir, `${scen}-10-scroll`)).length;
            if (scen === 'tile') {
              // colour popover from the first swatch trigger in an open module
              if (await clickEl(page, `return Q.deepAll(Q.panel()).find((n) => n.classList?.contains('swatch-trigger') && Q.visible(n));`)) {
                await page.waitForTimeout(500);
                await page.screenshot({ path: resolve(dir, `${scen}-20-popover.png`), clip: await page.evaluate(() => window.__qa.dialogRect()) });
                rec.popover = await page.evaluate(() => {
                  const pop = window.__qa.deepAll(document.body).find((n) => n.classList?.contains('popover') && window.__qa.visible(n));
                  if (!pop) return { found: false };
                  const r = pop.getBoundingClientRect();
                  const d = window.__qa.dialogRect();
                  return { found: true, onScreen: r.left >= d.x - 0.5 && r.top >= d.y - 0.5 && r.right <= d.x + d.width + 0.5 && r.bottom <= d.y + d.height + 0.5, rect: [r.left, r.top, r.right, r.bottom].map(Math.round), dialog: [d.x, d.y, d.x + d.width, d.y + d.height].map(Math.round) };
                });
                await page.keyboard.press('Escape').catch(() => {});
                await page.mouse.click(5, 5).catch(() => {});
                await page.waitForTimeout(300);
              }
              // preview-picker hover label
              const pv = await page.evaluate(() => {
                const p = window.__qa.panel();
                const w = p.shadowRoot.querySelector('.preview-card-wrapper');
                if (!w) return null;
                w.scrollIntoView({ block: 'center' });
                const card = window.__qa.deepAll(w).find((n) => n.tagName === 'HA-CARD') || w;
                const c = window.__qa.center(card);
                return { x: c.x - c.w * 0.3, y: c.y, w: 0, h: 0 }; // icon side of the card
              });
              if (pv) {
                await page.mouse.move(pv.x, pv.y, { steps: 4 });
                await page.waitForTimeout(400);
                await page.screenshot({ path: resolve(dir, `${scen}-21-picker.png`), clip: await page.evaluate(() => window.__qa.dialogRect()) });
                rec.pickerLabel = await page.evaluate(() => {
                  const lab = window.__qa.deepAll(document.body).find((n) => n.classList?.contains('hl-label'));
                  if (!lab) return { found: false };
                  const r = lab.getBoundingClientRect(); const host = lab.getRootNode().host.getBoundingClientRect();
                  return { found: true, text: lab.textContent.trim(), withinPreview: r.left >= host.left - 1 && r.right <= host.right + 1 };
                });
              }
            }
          }
          // E2E save through HA's own Save button (desktop-light only)
          if (vpName === 'desktop1440' && theme === 'light' && !['mixed', 'uixonly'].includes(scen)) {
            const saved = await clickEl(page, `
              const d = Q.find('hui-dialog-edit-card')[0];
              const btns = Q.deepAll(d).filter((n) => /^(HA-BUTTON|MWC-BUTTON|BUTTON)$/.test(n.tagName));
              return btns.find((b) => (b.textContent || '').trim().toLowerCase() === 'save') || null;`);
            await page.waitForTimeout(2500);
            rec.e2e = await page.evaluate(async ({ urlPath, key }) => {
              const hass = document.querySelector('home-assistant').hass;
              const cfg = await hass.callWS({ type: 'lovelace/config', url_path: urlPath });
              const card = cfg.views[0].cards[0];
              // the styled object may be the card itself or any stack child
              const style = card[key]?.style ?? (card.cards || []).map((c) => c?.[key]?.style).find((x) => x !== undefined);
              return { dialogClosed: window.__qa.find('hui-dialog-edit-card').every((d) => !d._cardConfig || !d.shadowRoot?.querySelector('ha-dialog')?.open), persisted: !!style, styleKind: typeof style, stylePreview: JSON.stringify(style ?? null).slice(0, 160) };
            }, { urlPath: `qa-${scen}`, key: STYLE_KEY });
            rec.e2e.saveClicked = saved;
            await page.goto(`${HA}/qa-${scen}/0`, { waitUntil: 'domcontentloaded' });
            await waitForHassReady(page);
            await page.waitForTimeout(4000);
            await page.screenshot({ path: resolve(dir, `${scen}-30-dashboard-after-save.png`) });
          }
        } catch (e) {
          rec.failure = String(e?.message || e).slice(0, 400);
          await page.screenshot({ path: resolve(dir, `${scen}-99-failure.png`) }).catch(() => {});
        }
        report.runs.push(rec);
        const a = rec.audit || {};
        console.log(`${RIG} ${theme} ${vpName} ${scen}: ${rec.failure ? 'FAIL ' + rec.failure : `contrast=${a.contrast?.length} clipped=${a.clipped?.length} lightCtrl=${a.lightCtrl?.length} tiny=${a.tiny?.length} errors=${rec.errors.length} narrow=${a.narrow} panelW=${a.panelWidth}${rec.popover ? ' popoverOnScreen=' + rec.popover.onScreen : ''}${rec.pickerLabel ? ' pickerLabelInside=' + rec.pickerLabel.withinPreview : ''}${rec.e2e ? ' e2e=' + (rec.e2e.persisted ? 'saved' : 'NOT-SAVED') : ''}`}`);
        await page.close();
      }
      await ctx.close();
    }
  }
  report.finishedAt = new Date().toISOString();
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log('report:', resolve(OUT, 'report.json'));
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

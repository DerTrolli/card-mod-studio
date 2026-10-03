// Functional UI check — shared library (see ../functional_ui_check.mjs).
//
// Everything here drives Card-Mod Studio the way a user does: Playwright
// locators (which pierce open shadow roots) + real mouse clicks, keyboard
// input and <select> choices on the REAL controls inside HA's REAL
// card-edit dialog. State is only ever READ directly (the dialog's
// `_cardConfig`, computed styles of the live preview) — never written.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, isAbsolute } from 'node:path';

export const HARNESS = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Rig / auth
// ---------------------------------------------------------------------------

export function rigEnv() {
  const HA = (process.env.HA_URL || 'http://127.0.0.1:8123').replace(/\/$/, '');
  const tf = process.env.TOKENS_FILE || 'tokens.json';
  const tokensFile = isAbsolute(tf) ? tf : resolve(HARNESS, tf);
  const KEY = process.env.STYLE_KEY === 'uix' ? 'uix' : 'card_mod';
  return {
    HA,
    tokensFile,
    KEY,
    OTHER: KEY === 'uix' ? 'card_mod' : 'uix',
    CHROME: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    // FUI_SHARED_USER=1: run as the rig's own user (the tokens file) instead
    // of the isolated `fui` user. Presets + palette are per HA user, so the
    // default isolates them from every other session using the rig.
    sharedUser: process.env.FUI_SHARED_USER === '1',
    only: (process.env.FUI_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean),
    skip: (process.env.FUI_SKIP || '').split(',').map((s) => s.trim()).filter(Boolean),
    headed: process.env.FUI_HEADED === '1',
  };
}

async function postForm(url, data) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(data).toString(),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

/** Minimal HA websocket client (Node 22 global WebSocket). */
export class HaWs {
  constructor(HA, accessToken) {
    this.url = HA.replace(/^http/, 'ws') + '/api/websocket';
    this.token = accessToken;
    this.id = 0;
    this.pending = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((res, rej) => {
      this.ws.onerror = (e) => rej(new Error('ws error ' + (e?.message || '')));
      this.ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.type === 'auth_required') this.ws.send(JSON.stringify({ type: 'auth', access_token: this.token }));
        else if (m.type === 'auth_ok') res();
        else if (m.type === 'auth_invalid') rej(new Error('auth_invalid'));
        else if (m.type === 'result' && this.pending.has(m.id)) {
          const p = this.pending.get(m.id);
          this.pending.delete(m.id);
          if (m.success) p.res(m.result);
          else p.rej(new Error(JSON.stringify(m.error)));
        }
      };
    });
    return this;
  }
  call(msg) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ ...msg, id }));
    });
  }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

async function accessFromRefresh(HA, bundle) {
  const tok = await postForm(`${HA}/auth/token`, {
    grant_type: 'refresh_token', refresh_token: bundle.refresh_token, client_id: bundle.clientId,
  });
  return tok.access_token;
}

/**
 * Ensures the dedicated `fui` admin user exists on this rig and returns a
 * hassTokens bundle for it (fresh login every run — nothing cached on disk).
 * Falls back to the rig's own tokens when FUI_SHARED_USER=1.
 */
export async function fuiTokens(env) {
  const dev = JSON.parse(readFileSync(env.tokensFile, 'utf8'));
  if (env.sharedUser) return { tokens: dev, user: 'shared(dev)' };
  const HA = env.HA;
  const clientId = `${HA}/`;
  const devAccess = await accessFromRefresh(HA, dev);
  const ws = await new HaWs(HA, devAccess).connect();
  const USERNAME = 'fui';
  const PASSWORD = 'fui-qa-sandbox-pass';
  try {
    const users = await ws.call({ type: 'config/auth/list' });
    const exists = users.some((u) => u.username === USERNAME || (u.credentials || []).some((c) => c.type === 'homeassistant' && u.name === 'FUI QA'));
    if (!exists) {
      const { user } = await ws.call({ type: 'config/auth/create', name: 'FUI QA', group_ids: ['system-admin'], local_only: false });
      await ws.call({ type: 'config/auth_provider/homeassistant/create', user_id: user.id, username: USERNAME, password: PASSWORD });
    }
  } finally {
    ws.close();
  }
  // Login flow → auth code → tokens.
  const r1 = await fetch(`${HA}/auth/login_flow`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, handler: ['homeassistant', null], redirect_uri: `${HA}/?auth_callback=1` }),
  }).then((r) => r.json());
  const r2 = await fetch(`${HA}/auth/login_flow/${r1.flow_id}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, username: USERNAME, password: PASSWORD }),
  }).then((r) => r.json());
  if (r2.type !== 'create_entry') throw new Error('fui login failed: ' + JSON.stringify(r2).slice(0, 300));
  const tok = await postForm(`${HA}/auth/token`, { grant_type: 'authorization_code', code: r2.result, client_id: clientId });
  return {
    tokens: {
      access_token: tok.access_token,
      token_type: 'Bearer',
      expires_in: tok.expires_in,
      hassUrl: HA,
      clientId,
      expires: Date.now() + tok.expires_in * 1000,
      refresh_token: tok.refresh_token,
    },
    user: USERNAME,
  };
}

// ---------------------------------------------------------------------------
// In-page helpers (installed on every navigation via addInitScript)
// ---------------------------------------------------------------------------

export const INIT = () => {
  const Q = {};
  // Pre-order, document-order walk through open shadow roots.
  Q.all = (root) => {
    const out = []; const st = [root];
    while (st.length) {
      const n = st.pop();
      if (!n) continue;
      if (n.nodeType === 1) out.push(n);
      const kids = [...(n.shadowRoot ? n.shadowRoot.children : []), ...(n.children || [])];
      for (let i = kids.length - 1; i >= 0; i--) st.push(kids[i]);
    }
    return out;
  };
  Q.q = (root, sel) => (root ? Q.all(root).filter((n) => n.matches && n.matches(sel)) : []);
  Q.q1 = (root, sel) => Q.q(root, sel)[0] || null;
  Q.dialog = () => {
    const ds = Q.q(document.body, 'hui-dialog-edit-card');
    return ds.find((d) => d._cardConfig) || null;
  };
  Q.cfg = () => {
    const d = Q.dialog();
    return d && d._cardConfig ? JSON.parse(JSON.stringify(d._cardConfig)) : null;
  };
  Q.panel = () => Q.q(document.body, 'cms-panel').find((p) => p.isConnected && p.style.display !== 'none' && p.getBoundingClientRect().width > 0) || null;
  Q.prev = () => Q.panel()?.shadowRoot?.querySelector('.preview-card-wrapper hui-card') || null;
  Q.pq = (sel) => Q.q(Q.prev(), sel);
  Q.pq1 = (sel) => Q.pq(sel)[0] || null;
  Q.rgb = (v) => {
    if (!v) return null;
    const d = document.createElement('div');
    d.style.color = 'rgb(1, 2, 3)';
    d.style.color = v;
    document.body.appendChild(d);
    const c = getComputedStyle(d).color;
    d.remove();
    return c;
  };
  Q.cs = (el) => (el ? getComputedStyle(el) : null);
  Q.varRgb = (el, name) => {
    if (!el) return null;
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    return v ? Q.rgb(v) : null;
  };
  Q.txt = (el) => (el ? (el.textContent || '').trim().replace(/\s+/g, ' ') : null);
  Q.vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  // tile name text: ha-tile-info .primary — shadow (2026.9) or slotted (2026.10)
  Q.tilePrimary = (root) => {
    const info = Q.q1(root, 'ha-tile-info');
    if (!info) return null;
    return Q.q1(info, '.primary');
  };
  // The text element of a heading card title/subtitle (p on 2026.9, h2/h3.heading on 2026.10)
  Q.headingText = (root) => {
    const content = Q.q(root, '.content').find((x) => x.classList.contains('title') || x.classList.contains('subtitle'));
    if (!content) return null;
    return [...content.querySelectorAll('*')].find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) || null;
  };
  window.__fui = Q;
};

// ---------------------------------------------------------------------------
// Test context
// ---------------------------------------------------------------------------

export async function launch(env, tokens) {
  const browser = await chromium.launch({ executablePath: env.CHROME, headless: !env.headed, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light' });
  await ctx.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  return { browser, ctx, page };
}

export async function waitHass(page, timeout = 60000) {
  await page.waitForFunction(() => {
    const ha = document.querySelector('home-assistant');
    return !!(ha && ha.hass && ha.hass.states && Object.keys(ha.hass.states).length > 10);
  }, null, { timeout });
}

/** Builds the per-run test context T used by every section. */
export function makeT({ page, env, record, shotsDir, ws }) {
  const T = {
    page, env, ws, record, shotsDir,
    HA: env.HA, KEY: env.KEY, OTHER: env.OTHER,
    section: '',
    pageErrors: [],
    notes: [],
  };
  // Native dialogs: leaving a page with a dirty card editor raises
  // beforeunload (accept — every section starts from a fresh page);
  // window.prompt answers come from T.promptAnswer (preset save).
  T.dialogs = [];
  T.promptAnswer = null;
  page.on('dialog', async (d) => {
    T.dialogs.push({ section: T.section, type: d.type(), message: d.message() });
    if (d.type() === 'beforeunload') return d.accept();
    if (d.type() === 'prompt' && T.promptAnswer !== null) {
      const a = T.promptAnswer;
      T.promptAnswer = null;
      return d.accept(a);
    }
    return d.dismiss();
  });
  page.on('pageerror', (e) => T.pageErrors.push({ section: T.section, msg: String(e?.message || e).slice(0, 400), stack: String(e?.stack || '').slice(0, 800) }));
  T.check = (name, pass, detail) => record(`[${T.section}] ${name}`, !!pass, detail === undefined ? undefined : typeof detail === 'string' ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500));
  T.note = (msg) => T.notes.push(`[${T.section}] ${msg}`);
  return T;
}

export async function shot(T, name) {
  mkdirSync(T.shotsDir, { recursive: true });
  const f = resolve(T.shotsDir, `${T.section}-${name}.png`.replace(/[^\w.-]+/g, '_'));
  await T.page.screenshot({ path: f }).catch(() => {});
  return f;
}

// ---------------------------------------------------------------------------
// Dashboards / dialog
// ---------------------------------------------------------------------------

export async function saveDashboard(T, urlPath, cards) {
  try {
    await T.ws.call({ type: 'lovelace/dashboards/create', url_path: urlPath, mode: 'storage', title: 'FUI ' + urlPath, show_in_sidebar: false });
  } catch { /* exists */ }
  await T.ws.call({ type: 'lovelace/config/save', url_path: urlPath, config: { views: [{ title: urlPath, cards }] } });
}

/**
 * Shows a dashboard the way a user reaches it: load another dashboard, then
 * navigate client-side (HA's own navigate(): pushState + location-changed,
 * what a sidebar link does). card-mod installed as a dashboard RESOURCE (as
 * on these rigs) never styles cards created during the very first page load
 * — verified with the Studio script blocked too, so it's a card-mod/rig
 * property, not the Studio's (see the report).
 */
export async function viewDashboard(T, urlPath) {
  const { page } = T;
  await page.goto(`${T.HA}/fui-home/0`, { waitUntil: 'domcontentloaded' });
  await waitHass(page);
  await page.waitForFunction(() => !!(customElements.get('card-mod') || customElements.get('uix-node')), null, { timeout: 30000 });
  await page.evaluate((p) => {
    history.pushState(null, '', p);
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  }, `/${urlPath}/0`);
}

export async function readDashboardCards(T, urlPath) {
  const cfg = await T.ws.call({ type: 'lovelace/config', url_path: urlPath });
  return cfg.views[0].cards;
}

/** Fresh dashboard → edit mode → the card's own Edit button (real click). */
export async function openEditor(T, urlPath, cards, cardIndex = 0) {
  const { page } = T;
  if (cards) await saveDashboard(T, urlPath, cards);
  await page.goto(`${T.HA}/${urlPath}/0?edit=1`, { waitUntil: 'domcontentloaded' });
  await waitHass(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), null, { timeout: 30000 });
  // card-mod / UIX engine element registered (cold start)
  await page.waitForFunction(() => !!(customElements.get('card-mod') || customElements.get('uix-node')), null, { timeout: 30000 });
  const opts = page.locator('hui-card-options');
  await page.waitForFunction((n) => window.__fui.q(document.body, 'hui-card-options').length >= n, cards ? cards.length : 1, { timeout: 30000 });
  await clickEditOn(T, cardIndex);
  return opts;
}

export async function clickEditOn(T, cardIndex = 0) {
  const { page } = T;
  let clicked = false;
  for (let attempt = 0; attempt < 3 && !clicked; attempt++) {
    const opts = page.locator('hui-card-options').nth(cardIndex);
    const edit = opts.getByText('Edit', { exact: true });
    if (await edit.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
      await edit.click();
      clicked = true;
      break;
    }
    // HA sometimes renders hui-card-options before its lovelace translations
    // arrive and never re-renders the label (an empty "Edit" button) — an HA
    // quirk, not the Studio's. Reload and try again.
    T.note(`hui-card-options rendered without its "Edit" label (attempt ${attempt + 1}) — reloading`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitHass(page);
    await page.waitForFunction((n) => window.__fui.q(document.body, 'hui-card-options').length > n, cardIndex, { timeout: 30000 });
  }
  if (!clicked) throw new Error('card Edit button never got its label');
  await page.locator('cms-tab-button').filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const d = window.__fui.dialog();
    const ed = d?.shadowRoot?.querySelector('hui-card-element-editor');
    return !!(d && d._cardConfig && ed && ed.shadowRoot && ed.shadowRoot.childElementCount > 0);
  }, null, { timeout: 30000 });
  await sleep(400);
}

export const styleBtn = (T) => T.page.locator('cms-tab-button').filter({ visible: true }).first().locator('button');
export const panelLoc = (T) => T.page.locator('cms-panel').filter({ visible: true }).first();

export async function panelVisible(T) {
  return T.page.evaluate(() => !!window.__fui.panel());
}

export async function openStudio(T) {
  const { page } = T;
  if (!(await panelVisible(T))) await styleBtn(T).click();
  await page.waitForFunction(() => {
    const p = window.__fui.panel();
    return !!(p && p.shadowRoot?.querySelector('.modules-col') && (p._studioState || p.shadowRoot.querySelector('.no-config')));
  }, null, { timeout: 15000 });
  await waitPreviewRendered(T);
}

export async function waitPreviewRendered(T, timeout = 15000) {
  await T.page.waitForFunction(() => {
    const c = window.__fui.prev();
    return !!(c && window.__fui.q1(c, 'ha-card'));
  }, null, { timeout }).catch(() => {});
}

export async function getCfg(T) {
  return T.page.evaluate(() => window.__fui.cfg());
}

export const styleOf = (T, cfg) => cfg?.[T.KEY]?.style;
export const styleStr = (T, cfg) => {
  const s = styleOf(T, cfg);
  return typeof s === 'string' ? s : s ? JSON.stringify(s) : '';
};

/** Polls the emitted config until pred(cfg) is truthy. */
export async function waitCfg(T, pred, timeout = 8000) {
  const t0 = Date.now();
  let cfg = null;
  while (Date.now() - t0 < timeout) {
    cfg = await getCfg(T);
    let ok = false;
    try { ok = !!pred(cfg); } catch { ok = false; }
    if (ok) return { ok: true, cfg };
    await sleep(120);
  }
  return { ok: false, cfg };
}

/** Asserts the emitted config: pred passes AND (unless allowOther) the
 *  inactive engine key carries no style. */
export async function expectCfg(T, name, pred, { allowOther = false, timeout = 8000, show } = {}) {
  const r = await waitCfg(T, (c) => pred(c) && (allowOther || !c?.[T.OTHER]?.style), timeout);
  const full = show ? show(r.cfg) : styleStr(T, r.cfg) || JSON.stringify(r.cfg);
  T.check(name, r.ok, r.ok ? undefined : 'GOT: ' + String(full).slice(0, 1200));
  return r;
}

/** Polls an in-page probe until pred(value) is truthy; records the result. */
export async function expectPage(T, name, probe, arg, pred, { timeout = 12000, record = true } = {}) {
  const t0 = Date.now();
  let v;
  let ok = false;
  while (Date.now() - t0 < timeout) {
    try { v = await T.page.evaluate(probe, arg); } catch (e) { v = { probeError: String(e.message || e).slice(0, 200) }; }
    try { ok = !!pred(v); } catch { ok = false; }
    if (ok) break;
    await sleep(200);
  }
  if (record) T.check(name, ok, JSON.stringify(v));
  return { ok, v };
}

export async function pollPage(T, probe, arg, pred, timeout = 8000) {
  return expectPage(T, '', probe, arg, pred, { timeout, record: false });
}

export async function resolveRgb(T, value) {
  return T.page.evaluate((v) => window.__fui.rgb(v), value);
}

export async function entityState(T, id) {
  return T.page.evaluate((i) => {
    const s = document.querySelector('home-assistant').hass.states[i];
    return s ? { state: s.state, attributes: s.attributes } : null;
  }, id);
}

// ---------------------------------------------------------------------------
// Controls (real input only)
// ---------------------------------------------------------------------------

/** Locator for a module inside the visible panel (or inside `scope`). */
export const mod = (T, tag, scope) => (scope || panelLoc(T)).locator(tag).first();

export async function isOpen(m) {
  return (await m.locator('.module-header').first().getAttribute('aria-expanded')) === 'true';
}

/** Expands a module by clicking its title (not the switch). */
export async function expand(m) {
  if (await isOpen(m)) return;
  await m.locator('.module-header .module-title').first().click();
  await m.locator('.module-header[aria-expanded="true"]').first().waitFor({ timeout: 5000 });
}

export async function collapse(m) {
  if (!(await isOpen(m))) return;
  await m.locator('.module-header .module-title').first().click();
}

export async function switchOn(sw) {
  return sw.evaluate((e) => !!e.checked);
}

/** Flips an ha-switch with a real click until it reads `on`. */
export async function setSwitch(sw, on) {
  if ((await switchOn(sw)) === on) return false;
  await sw.click();
  for (let i = 0; i < 25; i++) {
    if ((await switchOn(sw)) === on) return true;
    await sleep(80);
  }
  throw new Error(`switch did not become ${on}`);
}

export async function enable(m, on = true) {
  return setSwitch(m.locator('.module-header ha-switch').first(), on);
}

/** <select>: Playwright's selectOption on the real element (fires input+change). */
export async function choose(sel, value) {
  await sel.selectOption(value);
}

/** ha-slider (Web Awesome): click the track at the target's position, then
 *  fine-tune with the arrow keys until aria-valuenow reads the target —
 *  what a careful user does. */
export async function setSlider(T, slider, target) {
  const knob = slider.locator('#slider');
  await knob.scrollIntoViewIfNeeded();
  const meta = await knob.evaluate((k) => ({
    min: Number(k.getAttribute('aria-valuemin')), max: Number(k.getAttribute('aria-valuemax')), now: Number(k.getAttribute('aria-valuenow')),
  }));
  const track = await slider.locator('#track').boundingBox();
  if (!track) throw new Error('slider track not visible');
  const frac = Math.max(0, Math.min(1, (target - meta.min) / (meta.max - meta.min || 1)));
  if (meta.now !== target) {
    await T.page.mouse.click(track.x + 2 + frac * (track.width - 4), track.y + track.height / 2);
  } else {
    await knob.focus();
  }
  for (let i = 0; i < 80; i++) {
    const now = await knob.evaluate((k) => Number(k.getAttribute('aria-valuenow')));
    if (now === target) return;
    // keep focus on the slider (a re-render may have dropped it)
    const focused = await knob.evaluate((k) => k.getRootNode().activeElement === k);
    if (!focused) await knob.focus();
    await T.page.keyboard.press(now < target ? 'ArrowRight' : 'ArrowLeft');
    await sleep(40);
  }
  throw new Error(`slider never reached ${target}`);
}

/** Types into an <input> like a user (select-all, type, Tab away → change). */
export async function typeInto(input, text) {
  await input.click();
  await input.press('Control+a');
  await input.pressSequentially(String(text), { delay: 5 });
  await input.press('Tab');
}

/** Inline cms-color-picker: click a preset swatch by its name. */
export async function pickSwatch(picker, name) {
  await picker.locator(`button.preset[aria-label="${name}"]`).first().click();
}

/** Inline cms-color-picker: type a value into its text field. */
export async function pickText(picker, value) {
  await typeInto(picker.locator('.custom input[type="text"]').first(), value);
}

/** Compact cms-color-picker: open the popover (portalled into the dialog),
 *  click a swatch there. */
export async function pickCompact(T, picker, name) {
  await picker.locator('.swatch-trigger').first().click();
  const pop = T.page.locator('div.popover').filter({ visible: true }).first();
  await pop.waitFor({ state: 'visible', timeout: 5000 });
  await pop.locator(`button.preset[aria-label="${name}"]`).first().click();
  await pop.waitFor({ state: 'hidden', timeout: 5000 });
}

export async function pickCompactText(T, picker, value) {
  await picker.locator('.swatch-trigger').first().click();
  const pop = T.page.locator('div.popover').filter({ visible: true }).first();
  await pop.waitFor({ state: 'visible', timeout: 5000 });
  await typeInto(pop.locator('.custom input[type="text"]').first(), value);
}

/** cms-entity-picker (HA's ha-entity-picker): click it, type the entity id
 *  into HA's search field, click the matching list entry. */
export async function pickEntity(T, cmsPicker, entityId) {
  const { page } = T;
  const friendly = await page.evaluate((id) => document.querySelector('home-assistant').hass.states[id]?.attributes?.friendly_name || id, entityId);
  await cmsPicker.scrollIntoViewIfNeeded();
  // the visible field of HA's picker
  await cmsPicker.locator('ha-picker-field, ha-combo-box-item').filter({ visible: true }).first().click();
  // wait for HA's search input to take focus
  await page.waitForFunction(() => {
    let a = document.activeElement; const chain = [];
    while (a) { chain.push(a.tagName); a = a.shadowRoot?.activeElement; }
    return chain.includes('HA-PICKER-COMBO-BOX') && chain[chain.length - 1] === 'INPUT';
  }, null, { timeout: 8000 });
  await page.keyboard.type(entityId, { delay: 8 });
  // the first VISIBLE list entry naming the entity (not "Add custom item")
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(150);
    target = await cmsPicker.evaluate((host, { friendly }) => {
      const Q = window.__fui;
      const box = Q.q(host, 'ha-picker-combo-box').find((b) => Q.vis(b));
      if (!box) return null;
      const br = box.getBoundingClientRect();
      const items = Q.q(box, 'ha-combo-box-item').filter((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top >= br.top - 1 && r.bottom <= br.bottom + 1;
      });
      const norm = (s) => (s || '').trim().replace(/\s+/g, ' ');
      const cands = items.filter((n) => norm(n.textContent).startsWith(friendly) && !/^Add custom/i.test(norm(n.textContent)));
      cands.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const t = cands[0];
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: norm(t.textContent) };
    }, { friendly });
  }
  if (!target) throw new Error(`entity ${entityId} (${friendly}) not offered by the picker`);
  await page.mouse.click(target.x, target.y);
  await sleep(300);
  return target.text;
}

export async function waitDialogClosed(T, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const open = await T.page.evaluate(() => {
      const Q = window.__fui;
      return Q.q(document.body, 'hui-dialog-edit-card').some((d) => { const h = d.shadowRoot?.querySelector('ha-dialog'); return h && Q.vis(h); });
    });
    if (!open) return true;
    await sleep(150);
  }
  return false;
}

/** HA dialog footer buttons by label. */
export function dialogButton(T, label) {
  return T.page.locator('hui-dialog-edit-card ha-button').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`, 'i') }).filter({ visible: true }).first();
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A module's `.control-row` by its exact label text. */
export function rowOf(T, scope, label) {
  return scope.locator('.control-row').filter({ has: T.page.locator('.control-label', { hasText: new RegExp(`^\\s*${esc(label)}\\s*$`) }) }).first();
}

/** A button by its exact (trimmed) text inside scope. */
export function btn(scope, text) {
  return scope.locator('button').filter({ hasText: new RegExp(`^\\s*${esc(text)}\\s*$`) }).first();
}

/** Color values (rgb strings) compared loosely (rgb/rgba, spacing). */
export function sameRgb(a, b) {
  const p = (s) => (String(s || '').match(/[\d.]+/g) || []).slice(0, 3).map((x) => Math.round(Number(x)));
  const x = p(a); const y = p(b);
  return x.length === 3 && y.length === 3 && x.every((v, i) => Math.abs(v - y[i]) <= 1);
}

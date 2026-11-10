// Click driver — a small Playwright toolkit for manual-style QA of Card-Mod
// Studio on a real Home Assistant dashboard (HA 2026.11 storage dashboard,
// masonry view). It operates the product the way a person does.
//
// THE REAL-INPUT RULE (this is the whole point of the driver)
// -----------------------------------------------------------
// Everything a user would do with mouse or keyboard is done with trusted input:
//   ALLOWED for acting:  page.mouse.*, page.keyboard.*, and locator.click() /
//     dblclick() / hover() / press() / pressSequentially() / dragTo() on a
//     visible element WITHOUT { force: true } (Playwright really moves the
//     pointer there and fails if something else covers the element - such a
//     failure is a QA finding, never something to bypass). page.goto() only to
//     load the dashboard URL itself.
//   FORBIDDEN for acting: page.evaluate / locator.evaluate that clicks, sets
//     .value / .checked / properties, dispatches events, calls component
//     methods or fires config-changed; locator.fill(), selectOption(),
//     setChecked(), dispatchEvent(); { force: true }; ?edit=1 or any other URL
//     shortcut into edit mode or a dialog; saving a card's config through the
//     websocket.
//   ALLOWED in code: (a) fixture setup before a test starts - logging in by
//     token, creating a storage dashboard and seeding its cards through the
//     websocket (launch, seedDashboard); (b) observation - reading computed
//     styles, DOM, the saved dashboard config, console errors, screenshots.
//   If a control cannot be operated by trusted input in headless Chromium, the
//     nearest real alternative the UI offers is used (hex text field instead of
//     the OS colour dialog, keyboard arrows on a focused <select>). Only if
//     none exists would a helper use minimal code and log an "EXCEPTION:" line.
//     (Currently no helper needs an exception.)
//
// Observation helpers (listSections / listControls) stamp harmless marker
// attributes (data-qa-sec / data-qa-ctl) on elements so a returned `locator`
// can find them again; they never touch properties or fire events. A stamp is
// only valid until the panel re-renders: re-list before acting if in doubt.
//
// RIGS
// ----
//   rig 'cm'  -> tokens.json (card-mod rig, http://127.0.0.1:8123)
//   rig 'uix' -> $UIX_TOKENS_FILE, else tokens-uix.json next to this file
//   The HA URL is taken from the token file's hassUrl (override: haUrl option).
//   The chromium binary: $CHROME_BIN, else Playwright's own; if Playwright's
//   expected build is missing (the browsers folder holds an older revision),
//   the newest chromium under $PLAYWRIGHT_BROWSERS_PATH (default
//   /opt/pw-browsers) is used. Never run `playwright install`.
//
// DOM FACTS (HA 2026.11)
//   * Edit mode: top-right "Open dashboard menu" (kebab) -> menu item
//     "Edit dashboard" (storage dashboards only; YAML ones cannot be edited).
//     Done = the "Done" button in the same toolbar.
//   * Every top-level card is wrapped in <hui-card-options> whose footer has
//     an "Edit" button (on very narrow viewports the footer collapses and the
//     driver clicks the card itself instead, as a phone user taps it).
//   * Edit dialog = <hui-dialog-edit-card>; footer has Style (the Studio's
//     <cms-tab-button>), "Show code editor", Cancel, Save.
//   * Studio = <cms-panel>; sections are collapsible "modules" (a header with a
//     chevron, a title and usually an enable switch). A module must be
//     enabled before it can be expanded.
//   * Masonry layout with max_columns:1 is used so DOM order == config order,
//     and every card has its own Edit button.
//
// EXPORTS
//   chromium                                  re-export of Playwright's chromium
//   launch({rig, viewport, colorScheme, haUrl, tokensFile, headless})
//        -> { browser, context, page, ha, rig, styleKey, errors, close() }
//        logged in, HA ready, console/page errors collected into `errors`.
//   seedDashboard(page, urlPath, cards, {title, view})   FIXTURE: (re)create a
//        storage dashboard with one masonry view holding `cards`.
//   gotoDashboard(page, urlPath, {view, engine}) load URL, wait for cards rendered; recovers (NOTE: line) when the
//        card-mod/uix engine cold-start race left styled cards unstyled (see below). Returns { reloads }.
//   enterEditMode(page)                       kebab -> Edit dashboard (+ take control).
//   exitEditMode(page)                        click Done.
//   openCardEditor(page, cardIndex)           click that card's Edit; wait for dialog.
//   saveCard(page) / cancelCard(page)         click Save / Cancel; wait for dialog closed.
//   openStudio(page) / closeStudio(page)      click Style; returns the cms-panel locator.
//   studioPanel(page)                         locator for cms-panel.
//   listSections(page)                        OBSERVE sections: [{index,title,name,kind,
//        level,open,enabled,locator,toggle}].
//   expandSection(page, title) / collapseSection(page, title)   real click on the header.
//   setSectionEnabled(page, title, on)        real click on the section's enable switch.
//   listControls(page, section?)              OBSERVE controls: [{section,label,kind,
//        value,disabled,visible,meta,locator}] kind in slider|toggle|checkbox|
//        color|select|text|number|entity|code|button|native-color.
//   setSlider(ctrl, value)                    mouse click on track + keyboard arrows; verified.
//   typeText(ctrl, text, {commit})            click, select all, type, then Tab (default) / Enter / none.
//   setColor(ctrl, value)                     type into the picker's text field (opens popover if compact).
//   pickSwatch(ctrl, name)                    click a preset swatch (aria-label, e.g. "Red").
//   toggle(ctrl, expected?)                   click a switch/checkbox; verify it flipped (or reached expected).
//   chooseOption(ctrl, label)                 focus <select>, ArrowUp/Down to the option; verified.
//   savedCards(page, urlPath, {view})         OBSERVE stored config: the view's cards.
//   dashboardCard(page, cardIndex)            -> { locator, style(path, prop), waitStyle(path, prop, expected, opts) }
//   computedStyle(page, cardIndex, path, prop)  path = array of selectors, each looked up in the
//        previous element's shadow root (else its light DOM); first step relative to <hui-card>,
//        e.g. ['hui-tile-card','ha-card']. Empty path = the hui-card itself.
//   waitForComputed(page, cardIndex, path, prop, expected, {timeout})  poll until equal/matching.
//   settle(page, ms)                          short fixed settle (HA after save/reload).
//   shot(page, path)                          screenshot (creates the folder).
//
// All `ctrl` arguments accept either a record from listControls or a bare Locator.

import { chromium } from 'playwright';
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { waitForHassReady, ensureStorageDashboard } from './harness-utils.mjs';

export { chromium };

const HERE = dirname(fileURLToPath(import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const state = new WeakMap(); // page -> { ha, rig, styleKey }

// ---------------------------------------------------------------------------
// launch
// ---------------------------------------------------------------------------
function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  try { if (existsSync(chromium.executablePath())) return undefined; } catch { /* fall through */ }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  const rev = (d) => Number(d.split('-').pop()) || 0;
  const dirs = readdirSync(root).sort((a, b) => rev(b) - rev(a));
  for (const d of dirs.filter((x) => x.startsWith('chromium_headless_shell-'))) {
    const p = join(root, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    if (existsSync(p)) return p;
  }
  for (const d of dirs.filter((x) => /^chromium-\d+$/.test(x))) {
    const p = join(root, d, 'chrome-linux64', 'chrome');
    if (existsSync(p)) return p;
  }
  return undefined;
}

export async function launch({ rig = 'cm', viewport = { width: 1440, height: 900 }, colorScheme, haUrl, tokensFile, headless = true } = {}) {
  const file = tokensFile
    || (rig === 'uix' ? (process.env.UIX_TOKENS_FILE || resolve(HERE, 'tokens-uix.json')) : resolve(HERE, 'tokens.json'));
  const tokens = JSON.parse(readFileSync(file, 'utf8'));
  const ha = (haUrl || tokens.hassUrl).replace(/\/$/, '');
  const executablePath = findChrome();
  const browser = await chromium.launch({ headless, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...(colorScheme ? { colorScheme } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message || e).slice(0, 400)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 400)); });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${ha}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  state.set(page, { ha, rig, styleKey: rig === 'uix' ? 'uix' : 'card_mod' });
  return { browser, context, page, ha, rig, styleKey: rig === 'uix' ? 'uix' : 'card_mod', errors, close: () => browser.close() };
}

const haOf = (page) => {
  const s = state.get(page);
  if (!s) throw new Error('page was not created by click-driver launch()');
  return s.ha;
};

// ---------------------------------------------------------------------------
// fixtures + navigation
// ---------------------------------------------------------------------------
/** FIXTURE (websocket): create/overwrite a storage dashboard: one masonry view,
 *  max_columns 1 (DOM order == config order), holding `cards`. */
export async function seedDashboard(page, urlPath, cards, { title = 'QA', view = {} } = {}) {
  return ensureStorageDashboard(page, urlPath, [{ title, max_columns: 1, ...view, cards }]);
}

const CARD_SEL = 'hui-masonry-view :is(.column, hui-card-options) > hui-card';

/** Observation: does this <hui-card> contain a card-mod / uix engine element anywhere in its (shadow) subtree? */
const hasEngineElement = (root) => {
  const st = [root];
  while (st.length) {
    const n = st.pop();
    if (n.nodeType !== 1) continue;
    if (n.tagName === 'CARD-MOD' || n.tagName === 'UIX-NODE') return true;
    for (const k of [...(n.shadowRoot ? n.shadowRoot.children : []), ...n.children]) st.push(k);
  }
  return false;
};

/** Loads the dashboard URL and waits until cards are rendered. Returns { reloads }.
 *  Engine cold-start race (card-mod rig, HA 2026.11): on a fresh page load the cards sometimes render
 *  before card-mod has bound to them and then stay unstyled until the next load (seen on roughly half of
 *  loads, silent, nothing in the console). When the stored config contains card_mod/uix styles and no
 *  engine element attached, the driver reloads the page - as a user would - up to `maxReloads` times and
 *  prints a "NOTE:" line (first via sidebar click + browser Back, which rebuilds the cards with the engine
 *  already loaded; then plain reloads). Pass { engine: false } to skip this check. */
export async function gotoDashboard(page, urlPath, { view = 0, engine = true, maxReloads = 6 } = {}) {
  const url = `${haOf(page)}/${urlPath}/${view}`;
  const rendered = async () => {
    await page.locator(CARD_SEL).first().waitFor({ state: 'visible', timeout: 30000 });
    // HA's launch splash fades out over the first frames; screenshots/computed styles are only meaningful after it is gone
    await page.locator('#ha-launch-screen').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
    // card contents (lazy card elements) have rendered once every card has a child element with a shadow root
    await page.waitForFunction(() => {
      const cards = [];
      const st = [document.body];
      while (st.length) {
        const n = st.pop();
        if (n.tagName === 'HUI-CARD') cards.push(n);
        for (const k of [...(n.shadowRoot ? n.shadowRoot.children : []), ...n.children]) st.push(k);
      }
      return cards.length > 0 && cards.every((c) => c.firstElementChild && (c.firstElementChild.shadowRoot || c.firstElementChild.children.length));
    }, null, { timeout: 30000 });
  };
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await rendered();
  let reloads = 0;
  if (engine) {
    const cards = await savedCards(page, urlPath, { view });
    const styledIdx = cards.map((c, i) => (/"(card_mod|uix)"/.test(JSON.stringify(c)) ? i : -1)).filter((i) => i >= 0);
    const allBound = async () => {
      for (const i of styledIdx) if (!(await page.locator(CARD_SEL).nth(i).evaluate(hasEngineElement))) return false;
      return true;
    };
    while (styledIdx.length) {
      const deadline = Date.now() + 4000;
      let ok = false;
      while (Date.now() < deadline && !(ok = await allBound())) await wait(250);
      if (ok) break;
      if (reloads >= maxReloads) throw new Error(`style engine never attached to the styled cards after ${reloads} reloads`);
      reloads++;
      // Recovery like a user: leave the dashboard through the sidebar and press Back (the SPA rebuilds the
      // cards with the engine already loaded - worked every time); a plain reload is the fallback.
      const link = page.locator('ha-sidebar a[href="/map"], ha-sidebar a[href="/lovelace/0"]').first();
      if (reloads <= 2 && (await link.isVisible().catch(() => false))) {
        console.log(`NOTE: style engine did not attach on load of ${urlPath}; sidebar click + Back (${reloads})`);
        await link.click();
        await wait(1200);
        await page.goBack();
      } else {
        console.log(`NOTE: style engine did not attach on load of ${urlPath}; reloading (${reloads})`);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForHassReady(page);
      }
      await rendered();
    }
  }
  return { reloads };
}

export async function enterEditMode(page) {
  await page.getByRole('button', { name: 'Open dashboard menu' }).click();
  await page.getByRole('menuitem', { name: /Edit dashboard/i }).click();
  const done = page.getByRole('button', { name: 'Done', exact: true });
  const take = page.getByRole('button', { name: /take control/i });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await done.isVisible().catch(() => false)) return;
    if (await take.isVisible().catch(() => false)) { await take.click(); }
    await wait(250);
  }
  throw new Error('edit mode did not start (no Done button)');
}

export async function exitEditMode(page) {
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ state: 'hidden', timeout: 10000 });
}

// ---------------------------------------------------------------------------
// card editor dialog
// ---------------------------------------------------------------------------
const dialogOf = (page) => page.locator('hui-dialog-edit-card');

export async function openCardEditor(page, cardIndex) {
  const opts = page.locator('hui-card-options').nth(cardIndex);
  await opts.waitFor({ state: 'visible', timeout: 15000 });
  const edit = opts.getByRole('button', { name: 'Edit', exact: true });
  if (await edit.isVisible().catch(() => false)) await edit.click();
  else await opts.locator('hui-card').click(); // narrow viewport: footer collapsed, tap the card
  await dialogOf(page).getByRole('button', { name: 'Save', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('cms-tab-button').first().waitFor({ state: 'visible', timeout: 20000 });
  return dialogOf(page);
}

async function dialogClosed(page, timeout = 15000) {
  await dialogOf(page).getByRole('button', { name: 'Save', exact: true }).waitFor({ state: 'hidden', timeout });
}

export async function saveCard(page) {
  await dialogOf(page).getByRole('button', { name: 'Save', exact: true }).click();
  await dialogClosed(page);
  await settle(page, 700);
}

export async function cancelCard(page) {
  await dialogOf(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const saveVisible = await dialogOf(page).getByRole('button', { name: 'Save', exact: true }).isVisible().catch(() => false);
    if (!saveVisible) return;
    // "discard changes?" confirmation, if HA shows one
    const discard = page.getByRole('button', { name: /^(discard|yes|close without saving|leave)/i }).first();
    if (await discard.isVisible().catch(() => false)) { await discard.click(); }
    await wait(200);
  }
  await dialogClosed(page, 5000);
}

// ---------------------------------------------------------------------------
// Studio open / close
// ---------------------------------------------------------------------------
export const studioPanel = (page) => page.locator('cms-panel').first();

export async function openStudio(page) {
  const btn = page.locator('cms-tab-button button').first();
  await btn.waitFor({ state: 'visible', timeout: 20000 });
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
  const panel = studioPanel(page);
  await panel.waitFor({ state: 'visible', timeout: 15000 });
  await settle(page, 500);
  return panel;
}

export async function closeStudio(page) {
  const btn = page.locator('cms-tab-button button').first();
  if ((await btn.getAttribute('aria-pressed')) === 'true') await btn.click();
  await studioPanel(page).waitFor({ state: 'hidden', timeout: 10000 });
}

// ---------------------------------------------------------------------------
// observation: sections and controls
// ---------------------------------------------------------------------------
const stripEmoji = (s) => s.replace(/^[\s\p{Extended_Pictographic}️‍▶▼]+/u, '').trim();

/** In-page scan (observation only; stamps data-qa-* markers). */
function scanPanel() {
  const panel = document.querySelector('cms-panel') || (() => {
    const st = [document.body];
    while (st.length) { const n = st.pop(); if (n.tagName === 'CMS-PANEL') return n; for (const k of [...(n.shadowRoot ? n.shadowRoot.children : []), ...n.children]) st.push(k); }
    return null;
  })();
  if (!panel) return null;
  const preorder = (root, visit) => {
    const st = [root];
    while (st.length) {
      const n = st.pop();
      if (n.nodeType !== 1) continue;
      if (visit(n) === false) continue; // false = do not descend
      const kids = [...(n.shadowRoot ? n.shadowRoot.children : []), ...n.children];
      for (let i = kids.length - 1; i >= 0; i--) st.push(kids[i]);
    }
  };
  // clear previous stamps
  preorder(panel, (n) => { n.removeAttribute?.('data-qa-sec'); n.removeAttribute?.('data-qa-ctl'); });
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const parentOf = (n) => n.assignedSlot || n.parentElement || (n.getRootNode() instanceof ShadowRoot ? n.getRootNode().host : null);
  const HEADER = ['module-header', 'child-header', 'entity-header'];
  const sections = [];
  const containers = new Map(); // container element -> section
  preorder(panel, (n) => {
    if (n.classList && HEADER.some((c) => n.classList.contains(c)) && n.parentElement) {
      const container = n.parentElement;
      const title = (n.querySelector('.module-title, .child-title, .entity-title, .title')?.textContent || n.textContent || '').replace(/\s+/g, ' ').trim();
      const chev = n.querySelector('.module-chevron, .chevron')?.textContent || '';
      const sw = n.querySelector('ha-switch');
      const host = container.getRootNode().host;
      let open = chev.includes('▼') ? true : chev.includes('▶') ? false : null;
      if (open === null && host) open = !!(('_open' in host) ? host._open : host.open);
      const sec = {
        index: sections.length, title, kind: HEADER.find((c) => n.classList.contains(c)).replace('-header', ''),
        open, enabled: sw ? !!sw.checked : null, visible: visible(n), level: 0,
      };
      for (let p = parentOf(container); p; p = parentOf(p)) if (containers.has(p)) sec.level++;
      n.setAttribute('data-qa-sec', String(sec.index));
      if (sw) sw.setAttribute('data-qa-sec-switch', String(sec.index));
      containers.set(container, sec);
      sections.push(sec);
    }
  });
  const ownerOf = (el) => { for (let p = parentOf(el); p; p = parentOf(p)) if (containers.has(p)) return containers.get(p); return null; };
  const labelOf = (el) => {
    for (let p = el, i = 0; p && i < 8; p = parentOf(p), i++) {
      if (p.classList?.contains('control-row')) {
        const l = p.querySelector(':scope > .control-label, .control-label');
        if (l) return l.textContent.replace(/\s+/g, ' ').trim();
      }
    }
    const lab = el.closest?.('label');
    const own = (el.getAttribute?.('aria-label') || el.getAttribute?.('title') || el.getAttribute?.('placeholder') || (lab ? lab.textContent.replace(/\s+/g, ' ').trim() : '')).trim();
    return own;
  };
  const SKIP = (n) => n.classList?.contains('preview-col') || n.classList?.contains('preview-card-wrapper') || n.tagName === 'CMS-PREVIEW-PICKER';
  const HOSTS = new Set(['HA-SLIDER', 'HA-SWITCH', 'CMS-COLOR-PICKER', 'CMS-ENTITY-PICKER', 'HA-CODE-EDITOR', 'HA-ENTITY-PICKER']);
  const controls = [];
  preorder(panel, (n) => {
    if (SKIP(n)) return false;
    const tag = n.tagName;
    let c = null;
    if (tag === 'HA-SLIDER') c = { kind: 'slider', value: Number(n.value), meta: { min: Number(n.min), max: Number(n.max), step: Number(n.step) || 1 } };
    else if (tag === 'HA-SWITCH') c = { kind: 'toggle', value: !!n.checked, meta: {} };
    else if (tag === 'CMS-COLOR-PICKER') c = { kind: 'color', value: n.value, meta: { compact: !!n.compact } };
    else if (tag === 'CMS-ENTITY-PICKER') c = { kind: 'entity', value: n.value ?? '', meta: {} };
    else if (tag === 'HA-CODE-EDITOR') c = { kind: 'code', value: n.value ?? '', meta: {} };
    else if (tag === 'SELECT') c = { kind: 'select', value: n.selectedOptions[0]?.textContent.trim() ?? '', meta: { options: [...n.options].map((o) => ({ label: o.textContent.trim(), value: o.value, disabled: o.disabled })) } };
    else if (tag === 'TEXTAREA') c = { kind: 'text', value: n.value, meta: { multiline: true } };
    else if (tag === 'INPUT') {
      const t = n.type;
      if (t === 'checkbox') c = { kind: 'checkbox', value: n.checked, meta: {} };
      else if (t === 'number') c = { kind: 'number', value: n.value, meta: { min: n.min, max: n.max, step: n.step } };
      else if (t === 'color') c = { kind: 'native-color', value: n.value, meta: {} };
      else if (['text', 'search', '', 'url'].includes(t)) c = { kind: 'text', value: n.value, meta: { placeholder: n.placeholder } };
    } else if (tag === 'BUTTON') {
      c = { kind: 'button', value: (n.textContent || '').replace(/\s+/g, ' ').trim() || n.getAttribute('aria-label') || n.title || '', meta: {} };
    }
    if (c) {
      const sec = ownerOf(n);
      const id = controls.length;
      n.setAttribute('data-qa-ctl', String(id));
      Object.assign(c, {
        id, section: sec ? sec.title : '(panel)', sectionIndex: sec ? sec.index : -1,
        label: (tag === 'HA-SWITCH' && n.hasAttribute('data-qa-sec-switch') ? 'Enable ' + (sec?.title || '') : labelOf(n)) || c.value || '', disabled: !!(n.disabled || n.hasAttribute('disabled') || n.getAttribute('aria-disabled') === 'true'),
        visible: visible(n),
      });
      controls.push(c);
    }
    if (HOSTS.has(tag)) return false;
    return true;
  });
  return { sections, controls };
}

async function scan(page) {
  const r = await page.evaluate(scanPanel);
  if (!r) throw new Error('Studio panel (cms-panel) is not on the page - call openStudio first');
  return r;
}

/** OBSERVE: every section header: {index,title,name,kind,level,open,enabled,visible,locator,toggle}. */
export async function listSections(page) {
  const { sections } = await scan(page);
  return sections.map((s) => ({
    ...s,
    name: stripEmoji(s.title),
    locator: page.locator(`[data-qa-sec="${s.index}"]`),
    toggle: s.enabled === null ? null : page.locator(`[data-qa-sec-switch="${s.index}"]`),
  }));
}

function matchSection(sections, title) {
  const t = title.toLowerCase();
  const norm = (s) => stripEmoji(s).toLowerCase();
  return sections.find((s) => norm(s.title) === t) || sections.find((s) => norm(s.title).includes(t));
}

export async function expandSection(page, title) {
  let s = matchSection(await listSections(page), title);
  if (!s) throw new Error(`no section "${title}"`);
  if (s.open) return s;
  await s.locator.click({ position: { x: 24, y: 14 } }); // chevron/title area, not the switch at the far right
  for (let i = 0; i < 20; i++) {
    await wait(150);
    s = matchSection(await listSections(page), title);
    if (s?.open) return s;
  }
  throw new Error(`section "${title}" did not expand after a click (enabled=${s?.enabled})`);
}

export async function collapseSection(page, title) {
  let s = matchSection(await listSections(page), title);
  if (!s) throw new Error(`no section "${title}"`);
  if (!s.open) return s;
  await s.locator.click({ position: { x: 24, y: 14 } });
  for (let i = 0; i < 20; i++) {
    await wait(150);
    s = matchSection(await listSections(page), title);
    if (s && !s.open) return s;
  }
  throw new Error(`section "${title}" did not collapse`);
}

export async function setSectionEnabled(page, title, on = true) {
  const s = matchSection(await listSections(page), title);
  if (!s) throw new Error(`no section "${title}"`);
  if (!s.toggle) throw new Error(`section "${title}" has no enable switch`);
  if (s.enabled !== on) await toggle(s.toggle, on);
  return matchSection(await listSections(page), title);
}

/** OBSERVE: controls of the Studio panel (all, or of one section by title). Hidden ones are included with visible:false. */
export async function listControls(page, section) {
  const { sections, controls } = await scan(page);
  let list = controls;
  if (section) {
    const s = matchSection(sections.map((x) => ({ ...x, title: x.title })), section);
    if (!s) throw new Error(`no section "${section}"`);
    list = controls.filter((c) => c.sectionIndex === s.index);
  }
  return list.map((c) => ({ ...c, section: stripEmoji(c.section), locator: page.locator(`[data-qa-ctl="${c.id}"]`) }));
}

// ---------------------------------------------------------------------------
// input helpers (trusted input only)
// ---------------------------------------------------------------------------
const locOf = (ctrl) => (typeof ctrl?.evaluate === 'function' ? ctrl : ctrl.locator);
const pageOf = (loc) => loc.page();

/** Mouse-click the track at the target fraction, then fine-tune with arrow keys; verified. */
export async function setSlider(ctrl, value) {
  const loc = locOf(ctrl);
  const meta = await loc.evaluate((e) => ({ min: Number(e.min), max: Number(e.max), step: Number(e.step) || 1, value: Number(e.value) }));
  if (value < meta.min || value > meta.max) throw new Error(`slider value ${value} outside ${meta.min}..${meta.max}`);
  const box = await loc.boundingBox();
  if (!box) throw new Error('slider is not visible');
  const pad = 10; // thumb radius: the track starts/ends this far inside the box
  const frac = (value - meta.min) / (meta.max - meta.min || 1);
  await loc.click({ position: { x: pad + frac * (box.width - 2 * pad), y: box.height / 2 } });
  for (let i = 0; i < 400; i++) {
    const cur = Number(await loc.evaluate((e) => e.value));
    const diff = Math.round((value - cur) / meta.step);
    if (diff === 0) break;
    await loc.press(diff > 0 ? 'ArrowRight' : 'ArrowLeft');
  }
  const final = Number(await loc.evaluate((e) => e.value));
  if (Math.abs(final - value) > meta.step / 2) throw new Error(`slider ended at ${final}, wanted ${value}`);
  return final;
}

/** click, select all, type; commit = 'Tab' (default, blur fires change) | 'Enter' | null. */
export async function typeText(ctrl, text, { commit = 'Tab' } = {}) {
  const loc = locOf(ctrl);
  const page = pageOf(loc);
  await loc.click();
  await page.keyboard.press('Control+A');
  if (text === '') await page.keyboard.press('Delete');
  else await page.keyboard.type(text);
  if (commit) await page.keyboard.press(commit);
}

async function pickerParts(loc) {
  const compact = await loc.evaluate((e) => !!e.compact);
  const page = pageOf(loc);
  if (!compact) return { compact, root: loc, close: async () => {} };
  await loc.locator('.swatch-trigger').click();
  const pop = page.locator('.popover').first();
  await pop.waitFor({ state: 'visible', timeout: 5000 });
  return { compact, root: pop, close: async () => { await page.keyboard.press('Escape'); await pop.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {}); } };
}

/** Type a colour (hex or any CSS colour / var(--x)) into the picker's text field; the OS colour dialog is never used. */
export async function setColor(ctrl, value) {
  const loc = locOf(ctrl);
  const { root, close } = await pickerParts(loc);
  await typeText(root.locator('input[type="text"]'), value, { commit: 'Enter' });
  await settle(pageOf(loc), 150);
  await close();
  return loc.evaluate((e) => e.value);
}

/** Click a preset swatch by its aria-label (e.g. "Red"), or a "My colors" swatch by name/hex. */
export async function pickSwatch(ctrl, name) {
  const loc = locOf(ctrl);
  const { root, close } = await pickerParts(loc);
  await root.locator(`.preset[aria-label="${name}"]`).click();
  await settle(pageOf(loc), 150);
  await close();
  return loc.evaluate((e) => e.value);
}

/** Click a switch / checkbox and verify it flipped (or reached `expected`). */
export async function toggle(ctrl, expected) {
  const loc = locOf(ctrl);
  const read = () => loc.evaluate((e) => !!e.checked);
  const before = await read();
  if (expected !== undefined && before === expected) return before;
  await loc.click();
  for (let i = 0; i < 20; i++) {
    await wait(100);
    const now = await read();
    if (now !== before) {
      if (expected !== undefined && now !== expected) throw new Error(`toggle ended ${now}, wanted ${expected}`);
      return now;
    }
  }
  throw new Error(`toggle did not change (still ${before}) after a click`);
}

/** Native <select>: focus it and use ArrowUp/ArrowDown to reach the option with that label; verified. */
export async function chooseOption(ctrl, label) {
  const loc = locOf(ctrl);
  const info = await loc.evaluate((e) => ({ opts: [...e.options].map((o) => ({ t: o.textContent.trim(), v: o.value, d: o.disabled })), idx: e.selectedIndex }));
  const norm = (s) => s.toLowerCase();
  let target = info.opts.findIndex((o) => o.t === label || o.v === label);
  if (target < 0) target = info.opts.findIndex((o) => norm(o.t).includes(norm(label)));
  if (target < 0) throw new Error(`no option "${label}" in [${info.opts.map((o) => o.t).join(' | ')}]`);
  if (info.opts[target].d) throw new Error(`option "${label}" is disabled`);
  for (let i = 0; i < info.opts.length + 2; i++) {
    const idx = await loc.evaluate((e) => e.selectedIndex);
    if (idx === target) break;
    await loc.press(target > idx ? 'ArrowDown' : 'ArrowUp');
  }
  const now = await loc.evaluate((e) => e.selectedOptions[0]?.textContent.trim());
  if (now !== info.opts[target].t) throw new Error(`select ended on "${now}", wanted "${info.opts[target].t}"`);
  return now;
}

// ---------------------------------------------------------------------------
// observation: dashboard
// ---------------------------------------------------------------------------
export async function savedCards(page, urlPath, { view = 0 } = {}) {
  return page.evaluate(async ({ urlPath, view }) => {
    const hass = document.querySelector('home-assistant').hass;
    const cfg = await hass.callWS({ type: 'lovelace/config', url_path: urlPath, force: true });
    return cfg.views[view].cards || [];
  }, { urlPath, view });
}

const readStyle = (el, { path, prop }) => {
  let cur = el;
  for (const sel of path) {
    const next = (cur.shadowRoot && cur.shadowRoot.querySelector(sel)) || cur.querySelector(sel);
    if (!next) return { error: `selector "${sel}" not found under <${cur.tagName.toLowerCase()}>` };
    cur = next;
  }
  const cs = getComputedStyle(cur);
  return { value: prop.startsWith('--') ? cs.getPropertyValue(prop).trim() : cs.getPropertyValue(prop) || cs[prop] };
};

export async function computedStyle(page, cardIndex, path, prop) {
  const r = await page.locator(CARD_SEL).nth(cardIndex).evaluate(readStyle, { path: [].concat(path || []), prop });
  if (r.error) throw new Error(r.error);
  return r.value;
}

export async function waitForComputed(page, cardIndex, path, prop, expected, { timeout = 15000 } = {}) {
  const ok = (v) => (expected instanceof RegExp ? expected.test(v) : typeof expected === 'function' ? expected(v) : v === expected);
  const deadline = Date.now() + timeout;
  let last, err;
  while (Date.now() < deadline) {
    try { last = await computedStyle(page, cardIndex, path, prop); err = null; if (ok(last)) return last; } catch (e) { err = e; }
    await wait(250);
  }
  throw new Error(`computed ${prop} of card ${cardIndex} [${[].concat(path || []).join(' > ')}] was ${JSON.stringify(last)}${err ? ' (' + err.message + ')' : ''}, expected ${expected}`);
}

/** Handle to the rendered card element (works in view and edit mode). */
export function dashboardCard(page, cardIndex) {
  return {
    locator: page.locator(CARD_SEL).nth(cardIndex),
    style: (path, prop) => computedStyle(page, cardIndex, path, prop),
    waitStyle: (path, prop, expected, opts) => waitForComputed(page, cardIndex, path, prop, expected, opts),
  };
}

export const settle = (page, ms = 600) => page.waitForTimeout(ms);

export async function shot(page, path, opts = {}) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  await page.screenshot({ path, ...opts });
  return path;
}

// Click driver — a small Playwright toolkit for manual-style QA of Card-Mod
// Studio on a real Home Assistant dashboard (HA 2026.11 storage dashboard,
// masonry or sections view). It operates the product the way a person does.
//
// THE REAL-INPUT RULE (this is the whole point of the driver)
// -----------------------------------------------------------
// Everything a user would do with mouse or keyboard is done with trusted input:
//   ALLOWED for acting:  page.mouse.*, page.keyboard.*, page.touchscreen.*, and
//     locator.click() / dblclick() / hover() / press() / pressSequentially() /
//     dragTo() on a visible element WITHOUT { force: true } (Playwright really
//     moves the pointer there and fails if something else covers the element -
//     such a failure is a QA finding, never something to bypass). page.goto()
//     only to load the dashboard URL itself.
//   FORBIDDEN for acting: page.evaluate / locator.evaluate that clicks, sets
//     .value / .checked / properties, dispatches events, calls component
//     methods or fires config-changed; locator.fill(), selectOption(),
//     setChecked(), dispatchEvent(); { force: true }; ?edit=1 or any other URL
//     shortcut into edit mode or a dialog; saving a card's config through the
//     websocket.
//   ALLOWED in code: (a) fixture setup before a test starts - logging in by
//     token, creating a storage dashboard and seeding its cards through the
//     websocket (launch, seedDashboard, seedSectionsDashboard), setting entity
//     states through the REST API (haFetch, setState); (b) observation -
//     reading computed styles, DOM, element properties (a card's config, a
//     control's value), the saved dashboard config, console errors, screenshots.
//   If a control cannot be operated by trusted input in headless Chromium, the
//     nearest real alternative the UI offers is used (hex text field instead of
//     the OS colour dialog, keyboard arrows on a focused <select>). Only if
//     none exists would a helper use minimal code and log an "EXCEPTION:" line.
//     (Currently no helper needs an exception.)
//
// Observation helpers (listSections / listControls / the card resolver) stamp
// harmless marker attributes (data-qa-sec / data-qa-ctl / data-qa-card /
// data-qa-opt) on elements so a returned `locator` can find them again; they
// never touch properties or fire events. A stamp is only valid until the page
// re-renders: re-list / re-resolve before acting if in doubt (every action
// helper below does so itself).
//
// RIGS
// ----
//   rig 'cm'  -> tokens.json next to this file (card-mod rig, http://127.0.0.1:8123)
//   rig 'uix' -> $UIX_TOKENS_FILE, else tokens-uix.json next to this file. That default
//                file belongs to an OLD UIX rig (port 8124) and normally does not
//                answer: point $UIX_TOKENS_FILE (or the tokensFile option) at the token
//                file of the UIX rig you actually run (e.g. the UIX 9 rig on :8125).
//                launch() checks that the tokens' hassUrl answers and otherwise throws
//                an error that names UIX_TOKENS_FILE.
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
//   * MASONRY view: every top-level card is wrapped in <hui-card-options> whose footer
//     has an "Edit" button (on very narrow viewports the footer collapses and the
//     driver clicks/taps the card itself instead). With more than ~4 cards the view
//     lays out 2-3 columns even when the view says max_columns: 1, so DOM order is NOT
//     config order - the driver therefore never addresses cards by DOM position (see
//     "Addressing cards").
//   * SECTIONS view (type: sections): cards live in <hui-section> grids; in edit mode each
//     is wrapped in <hui-card-edit-mode>, and a click on that wrapper (the card itself)
//     opens the card editor - there is no Edit footer button.
//   * Edit dialog = <hui-dialog-edit-card>; its footer (<ha-dialog-footer>, buttons slotted as
//     primaryAction / secondaryAction) has Style (the Studio's <cms-tab-button>), "Show code
//     editor", Cancel, Save. The Studio's own preset-name field also has a "Cancel" button,
//     which is why the driver scopes Save/Cancel to the dialog footer.
//   * Studio = <cms-panel>; sections are collapsible headers (role=button, aria-expanded):
//     modules (.module-header; enable switch inside the header, or - newer markup - a sibling
//     of the header button), stack children (.child-header, "1. tile"), entity rows
//     (.entity-header, per row of an Entities card). "Entity Rows" itself is a static header
//     (no aria-expanded, not collapsible). A module must be enabled before it can be expanded.
//   * Compact colour picker (Threshold rule colours, "Default color"): a swatch button opens a
//     popover (.popover, portalled into the dialog). Committing the text field (Tab or Enter)
//     closes the popover by itself; Escape closes the popover but - when it was already
//     closed - the WHOLE card dialog. The driver never sends Escape to a picker.
//   * HA entity picker: <ha-entity-picker> -> <ha-generic-picker> with an <ha-picker-field>
//     trigger; the list is a popover (<ha-picker-combo-box>, <ha-list-item-option role=option>
//     whose .value is the entity id; a typed id that is not an entity adds an "Add custom item"
//     option). The search field takes focus a moment after opening - typing earlier drops
//     characters.
//
// ADDRESSING CARDS
//   Wherever a function takes `ref` it is one of
//     number                     index in CONFIG order (masonry: views[v].cards[i]; sections:
//                                all sections' cards flattened in section order)
//     { section, index }         card `index` inside section `section` (sections views)
//     string                     a card whose name / title / heading / entity equals it
//     object (no `section`)      partial config match, e.g. { type: 'gauge' } or { name: 'x' }
//     function (config, meta)    predicate; meta = { index, section, indexInSection }
//   The driver reads the dashboard's saved config (websocket, observation), reads each
//   rendered <hui-card>'s `config` and pairs them (identical configs pair in DOM order), so
//   index addressing is correct whatever column layout HA picked. The first match wins;
//   listCards() / findCards() return all.
//
// EXPORTS
//   chromium                                  re-export of Playwright's chromium
//   launch({rig, viewport, colorScheme, haUrl, tokensFile, headless, hasTouch, isMobile,
//           deviceScaleFactor}) -> { browser, context, page, ha, rig, styleKey, tokensFile,
//        errors, close() }   logged in, HA ready, console/page errors collected into `errors`.
//        Phone: launch({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true,
//        deviceScaleFactor:3 }) and use tap().
//   tap(locator)                              scroll into view, then a real touch tap at the centre
//        via page.touchscreen (needs hasTouch); throws when another element covers the point.
//   haFetch(ctx, method, path, body)          REST call with a fresh access token (refreshes from the
//        refresh token in the tokens file like the frontend; the one in the file expires after
//        30 min). ctx = launch() handle or page. Returns parsed JSON (or text); throws on non-2xx.
//   setState(ctx, entityId, state, attributes)   POST /api/states/<id> via haFetch (fixture).
//   seedDashboard(page, urlPath, cards, {title, view})   FIXTURE: (re)create a storage
//        dashboard with one masonry view holding `cards`.
//   seedSectionsDashboard(page, urlPath, sections, {title, view})   FIXTURE: same with one
//        `type: sections` view. `sections` = array of sections, each either an array of cards
//        or { cards, ...sectionProps } (type defaults to 'grid').
//   gotoDashboard(page, urlPath, {view, engine, expectStyled, maxReloads})   load URL, wait for
//        cards rendered; verifies the style engine bound to the cards expected to be styled and
//        recovers (NOTE: line) when it did not (see below). Returns { reloads }.
//   enterEditMode(page) / exitEditMode(page) kebab -> Edit dashboard (+ take control) / Done.
//   listCards(page) / findCards(page, ref) / findCard(page, ref) / cardAt(page, ref)
//        OBSERVE rendered top-level cards: [{index, section, indexInSection, config, locator,
//        options}] (cardAt additionally has style()/waitStyle()).
//   openCardEditor(page, ref)                 masonry: click that card's Edit; sections: click the card
//        (tap when the page is touch-enabled and the footer is collapsed); wait for dialog.
//   saveCard(page) / cancelCard(page)         click the dialog footer's Save / Cancel; wait for dialog closed.
//   openStudio(page) / closeStudio(page)      click Style; returns the cms-panel locator.
//   studioPanel(page)                         locator for cms-panel.
//   listSections(page)                        OBSERVE sections: [{index,title,name,sub,kind,level,parent,
//        collapsible,open,enabled,visible,locator,toggle}]; kind module|child|entity.
//   expandSection(page, key, {within}) / collapseSection(...)   real click on the header; key = exact
//        title (emoji ignored) | RegExp | index; falls back to a substring only when unambiguous,
//        otherwise throws listing the candidates. Entity rows also match by entity id. `within` =
//        another section key: only sections nested under it (e.g. a stack child's "Background").
//   setSectionEnabled(page, key, on)          real click on the section's enable switch.
//   listControls(page, section?, {within, deep})   OBSERVE controls: [{section,label,kind,value,disabled,
//        visible,meta,locator}] kind in slider|toggle|checkbox|color|select|text|number|entity|code|
//        button|native-color. deep: include controls of nested sections.
//   findControl(page, section, label)         the one control whose label equals `label` (else unambiguous
//        substring), throws on none / several.
//   setSlider(ctrl, value)                    mouse click on track + keyboard arrows; verified.
//   typeText(ctrl, text, {commit})            click, select all, type, then Tab (default) / Enter / none.
//   setColor(ctrl, value, {commit})           type into the picker's text field (opens the popover if compact),
//        commit with Tab (default) or Enter - exactly one key, never Escape - then verify the popover
//        state and the picker's value.
//   pickSwatch(ctrl, name)                    click a preset swatch (aria-label, e.g. "Red").
//   pickEntity(ctrl, entityId, {custom})      HA entity picker: open, wait until the search field has focus,
//        type the whole id, click the option whose value is exactly that id (inside the picker's own list),
//        verify the control's value.
//   toggle(ctrl, expected?)                   click a switch/checkbox; verify it flipped (or reached expected).
//   chooseOption(ctrl, label)                 focus <select>, ArrowUp/Down to the option; verified.
//   savedCards(page, urlPath, {view})         OBSERVE stored config: the view's cards (sections: flattened).
//   dashboardCard(page, ref)                  -> { locator, style(path, prop), waitStyle(path, prop, expected, opts) };
//        a numeric ref gives a (stamp based) locator synchronously, any other ref: use cardAt().
//   computedStyle(page, ref, path, prop)      path = array of selectors, each looked up in the
//        previous element's shadow root (else its light DOM); first step relative to <hui-card>,
//        e.g. ['hui-tile-card','ha-card']. Empty path = the hui-card itself.
//   waitForComputed(page, ref, path, prop, expected, {timeout})  poll until equal/matching.
//   settle(page, ms)                          short fixed settle (HA after save/reload).
//   shot(page, path)                          screenshot (creates the folder).
//
// STYLE ENGINE RACE (gotoDashboard)
//   card-mod only patches cards created AFTER it has evaluated. The rig loads it through
//   `frontend: extra_module_url` (card-mod's recommended install), which the frontend waits
//   for - cold loads are then styled almost always (measured 18/20 and 19/20; as a plain
//   dashboard resource it was 0/5 and 2/5). When a cold load still leaves styled cards unbound,
//   gotoDashboard recovers like a user would (sidebar + Back, then reloads) and prints a
//   "NOTE:" line - seeing that line is a rig signal, not noise. The check is explicit:
//   expectStyled = [ref | { card: ref, path, prop, expected }, ...] names the cards that must
//   be styled (a plain ref: the card's OWN card-mod/uix element must exist - a nested
//   element of an inner component such as the assist chips of alarm-panel / history-graph /
//   statistics-graph does not count; an object: that computed style must equal/match
//   `expected`). Without it every card whose stored config carries card_mod/uix is checked.
//   Pass engine:false (or expectStyled:false) to skip the check.
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
const state = new WeakMap(); // page -> { ha, rig, styleKey, tokensFile, hasTouch }

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

/** Throws a clear error when the rig's Home Assistant does not answer (any HTTP status counts as answering). */
async function assertRigAnswers(ha, rig, file) {
  try {
    await fetch(`${ha}/api/`, { signal: AbortSignal.timeout(6000) });
  } catch (e) {
    const hint = rig === 'uix'
      ? 'Set UIX_TOKENS_FILE (or pass tokensFile) to the tokens file of the UIX rig you run, e.g. the UIX 9 rig on :8125; the default tokens-uix.json next to the driver belongs to an old rig on :8124.'
      : 'Check that the card-mod rig container (ha-sandbox) is running, or pass tokensFile / haUrl.';
    throw new Error(`rig '${rig}': Home Assistant at ${ha} (hassUrl from ${file}) does not answer (${e.message || e}). ${hint}`);
  }
}

export async function launch({ rig = 'cm', viewport = { width: 1440, height: 900 }, colorScheme, haUrl, tokensFile, headless = true, hasTouch = false, isMobile = false, deviceScaleFactor = 1 } = {}) {
  const file = tokensFile
    || (rig === 'uix' ? (process.env.UIX_TOKENS_FILE || resolve(HERE, 'tokens-uix.json')) : resolve(HERE, 'tokens.json'));
  if (!existsSync(file)) {
    throw new Error(`rig '${rig}': tokens file ${file} does not exist.${rig === 'uix' ? ' Set UIX_TOKENS_FILE to the tokens file of your UIX rig.' : ''}`);
  }
  const tokens = JSON.parse(readFileSync(file, 'utf8'));
  const ha = (haUrl || tokens.hassUrl).replace(/\/$/, '');
  await assertRigAnswers(ha, rig, file);
  const executablePath = findChrome();
  const browser = await chromium.launch({ headless, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({ viewport, deviceScaleFactor, hasTouch, isMobile, ...(colorScheme ? { colorScheme } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message || e).slice(0, 400)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 400)); });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${ha}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  const styleKey = rig === 'uix' ? 'uix' : 'card_mod';
  state.set(page, { ha, rig, styleKey, tokensFile: file, hasTouch });
  return { browser, context, page, ha, rig, styleKey, tokensFile: file, errors, close: () => browser.close() };
}

const haOf = (page) => {
  const s = state.get(page);
  if (!s) throw new Error('page was not created by click-driver launch()');
  return s.ha;
};

// ---------------------------------------------------------------------------
// REST fixtures
// ---------------------------------------------------------------------------
const tokenCache = new Map(); // tokens file -> { access, exp }

/** A fresh access token the way the frontend gets one: refresh_token grant at /auth/token. */
async function freshToken(info) {
  const hit = tokenCache.get(info.tokensFile);
  if (hit && hit.exp - Date.now() > 60_000) return hit.access;
  const t = JSON.parse(readFileSync(info.tokensFile, 'utf8'));
  const res = await fetch(`${info.ha}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: t.clientId || `${info.ha}/` }),
  });
  if (!res.ok) throw new Error(`token refresh failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  tokenCache.set(info.tokensFile, { access: j.access_token, exp: Date.now() + (j.expires_in || 1800) * 1000 });
  return j.access_token;
}

const ctxInfo = (ctx) => {
  const info = ctx && ctx.page ? state.get(ctx.page) : state.get(ctx);
  if (!info) throw new Error('haFetch/setState: pass the launch() handle (or its page)');
  return info;
};

/** REST call to Home Assistant with a fresh token. `path` like '/api/states/sensor.x'. Returns parsed JSON (text if not JSON), throws on non-2xx. */
export async function haFetch(ctx, method, path, body) {
  const info = ctxInfo(ctx);
  const token = await freshToken(info);
  const res = await fetch(path.startsWith('http') ? path : `${info.ha}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return text; }
}

/** FIXTURE: set an entity's state (and attributes) through the REST API. */
export const setState = (ctx, entityId, stateValue, attributes = {}) =>
  haFetch(ctx, 'POST', `/api/states/${entityId}`, { state: String(stateValue), attributes });

// ---------------------------------------------------------------------------
// touch
// ---------------------------------------------------------------------------
/** Real touch tap at the centre of `loc` (page.touchscreen). Needs launch({ hasTouch: true }). */
export async function tap(loc) {
  const page = loc.page();
  const s = state.get(page);
  if (s && !s.hasTouch) throw new Error('tap(): the page has no touch support - launch({ hasTouch: true, isMobile: true })');
  await loc.waitFor({ state: 'visible', timeout: 15000 });
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  if (!box) throw new Error('tap(): element has no box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const hit = await loc.evaluate((el, pt) => {
    let root = document;
    let top = null;
    for (;;) {
      const e = root.elementFromPoint(pt.x, pt.y);
      if (!e) break;
      top = e;
      const inner = e.shadowRoot && e.shadowRoot.elementFromPoint(pt.x, pt.y);
      if (inner && inner !== e) root = e.shadowRoot; else break;
    }
    for (let p = top; p; p = p.assignedSlot || p.parentElement || (p.getRootNode() && p.getRootNode().host)) if (p === el) return true;
    return false;
  }, { x, y });
  if (!hit) throw new Error('tap(): another element covers the tap point of the target');
  await page.touchscreen.tap(x, y);
}

// ---------------------------------------------------------------------------
// fixtures + navigation
// ---------------------------------------------------------------------------
/** FIXTURE (websocket): create/overwrite a storage dashboard: one masonry view holding `cards`.
 *  (max_columns 1 is set, but HA 2026.11 still lays out 2-3 columns with more than ~4 cards, so DOM order
 *  is not config order - address cards through ref / findCard, never by DOM position.) */
export async function seedDashboard(page, urlPath, cards, { title = 'QA', view = {} } = {}) {
  return ensureStorageDashboard(page, urlPath, [{ title, max_columns: 1, ...view, cards }]);
}

/** FIXTURE (websocket): create/overwrite a storage dashboard with one `type: sections` view.
 *  `sections`: array of sections; a section is an array of cards or { cards, ...props } (type defaults to 'grid'). */
export async function seedSectionsDashboard(page, urlPath, sections, { title = 'QA', view = {} } = {}) {
  const secs = sections.map((s) => (Array.isArray(s) ? { type: 'grid', cards: s } : { type: 'grid', ...s }));
  return ensureStorageDashboard(page, urlPath, [{ title, type: 'sections', max_columns: 2, ...view, sections: secs }]);
}

// top-level cards of the current view (masonry, sections or panel), in either mode
const CARD_SEL = 'hui-masonry-view :is(.column, hui-card-options) > hui-card, hui-sections-view hui-section hui-card, hui-panel-view hui-card';

/** Observation: the engine element belonging to THIS card (a direct child of the card's own element), not
 *  those card-mod attaches to inner components (assist chips etc.). Runs in the page. */
const hasOwnEngineElement = (huiCard) => {
  const cardEl = huiCard.firstElementChild;
  const isEngine = (n) => n.tagName === 'CARD-MOD' || n.tagName === 'UIX-NODE';
  const direct = [...huiCard.children, ...(cardEl ? [...cardEl.children, ...(cardEl.shadowRoot ? cardEl.shadowRoot.children : [])] : [])];
  return direct.some(isEngine);
};

/** Observation: does this card (of the rendered page) carry a config with a card-mod / uix style? */
const styledConfig = (c) => /"(card_mod|uix)"/.test(JSON.stringify(c));

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

/** Loads the dashboard URL and waits until cards are rendered. Returns { reloads }.
 *  See "STYLE ENGINE RACE" in the header: the engine check is explicit (expectStyled) and, with card-mod loaded
 *  via extra_module_url, the recovery (NOTE: line) should be rare. */
export async function gotoDashboard(page, urlPath, { view = 0, engine = true, expectStyled, maxReloads = 6 } = {}) {
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
  if (engine && expectStyled !== false) {
    let targets;
    if (Array.isArray(expectStyled)) {
      targets = expectStyled.map((t) => (t && typeof t === 'object' && !Array.isArray(t) && 'card' in t && ('prop' in t) ? t : { card: t }));
    } else {
      const flat = flattenView(await savedView(page, urlPath, { view }));
      targets = flat.filter((e) => styledConfig(e.config)).map((e) => ({ card: e.index }));
    }
    // a card that is not rendered at all (hidden by a conditional card, say) cannot be bound
    const bound = async (t) => {
      let c;
      try { c = await findCard(page, t.card, { timeout: 1500 }); } catch { return false; }
      if (t.prop) {
        const r = await c.locator.evaluate(readStyle, { path: [].concat(t.path || []), prop: t.prop }).catch((e) => ({ error: String(e) }));
        if (r.error) return false;
        const exp = t.expected;
        return exp instanceof RegExp ? exp.test(r.value) : typeof exp === 'function' ? !!exp(r.value) : r.value === exp;
      }
      return c.locator.evaluate(hasOwnEngineElement);
    };
    const allBound = async () => { for (const t of targets) if (!(await bound(t))) return false; return true; };
    while (targets.length) {
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
  await resolveCards(page).catch(() => {});
  return { reloads };
}

export async function enterEditMode(page) {
  await page.getByRole('button', { name: 'Open dashboard menu' }).click();
  await page.getByRole('menuitem', { name: /Edit dashboard/i }).click();
  const done = page.getByRole('button', { name: 'Done', exact: true });
  const take = page.getByRole('button', { name: /take control/i });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await done.isVisible().catch(() => false)) { await resolveCards(page).catch(() => {}); return; }
    if (await take.isVisible().catch(() => false)) { await take.click(); }
    await wait(250);
  }
  throw new Error('edit mode did not start (no Done button)');
}

export async function exitEditMode(page) {
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ state: 'hidden', timeout: 10000 });
  await resolveCards(page).catch(() => {});
}

// ---------------------------------------------------------------------------
// observation: cards (config <-> rendered element)
// ---------------------------------------------------------------------------
/** The view's stored config (websocket). The view is taken from the page URL unless `view` is given. */
export async function savedView(page, urlPath, { view } = {}) {
  return page.evaluate(async ({ urlPath, view }) => {
    const hass = document.querySelector('home-assistant').hass;
    const cfg = await hass.callWS({ type: 'lovelace/config', url_path: urlPath === 'lovelace' ? null : urlPath, force: true });
    let v = view;
    if (typeof v === 'string' && !/^\d+$/.test(v)) v = cfg.views.findIndex((x) => x.path === v);
    return cfg.views[Number(v) || 0];
  }, { urlPath, view });
}

/** Cards of a view config in CONFIG order with their position: masonry/panel views, or sections flattened. */
function flattenView(v) {
  if (!v) return [];
  if (v.type === 'sections' || Array.isArray(v.sections)) {
    const out = [];
    (v.sections || []).forEach((s, si) => (s.cards || []).forEach((c, ci) => out.push({ index: out.length, section: si, indexInSection: ci, config: c })));
    return out;
  }
  return (v.cards || []).map((c, i) => ({ index: i, section: null, indexInSection: i, config: c }));
}

const currentDashboard = (page) => {
  const parts = new URL(page.url()).pathname.split('/').filter(Boolean);
  if (!parts.length) throw new Error('no dashboard is open (URL has no path)');
  return { urlPath: parts[0], view: parts[1] ?? '0' };
};

/** In-page: pair the saved configs with the rendered top-level <hui-card>s and stamp data-qa-card=<config index>. */
function stampCardsInPage({ flat }) {
  const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((kk) => [kk, x[kk]])) : x));
  const cards = [];
  const st = [document.body];
  while (st.length) {
    const n = st.pop();
    if (n.nodeType !== 1) continue;
    if (n.tagName === 'HUI-CARD') cards.push(n);
    const kids = [...(n.shadowRoot ? n.shadowRoot.children : []), ...n.children];
    for (let i = kids.length - 1; i >= 0; i--) st.push(kids[i]);
  }
  cards.forEach((c) => c.removeAttribute('data-qa-card'));
  const top = cards.filter((c) => {
    let inView = false;
    for (let p = c.assignedSlot || c.parentElement || (c.getRootNode() && c.getRootNode().host); p; p = p.assignedSlot || p.parentElement || (p.getRootNode() && p.getRootNode().host)) {
      if (p.tagName === 'HUI-CARD' || p.tagName === 'HUI-DIALOG-EDIT-CARD' || p.tagName === 'HUI-CARD-PREVIEW') return false;
      if (p.tagName === 'HUI-MASONRY-VIEW' || p.tagName === 'HUI-SECTIONS-VIEW' || p.tagName === 'HUI-PANEL-VIEW') inView = true;
    }
    return inView;
  });
  const used = new Set();
  const matched = [];
  const unmatched = [];
  for (const e of flat) {
    const want = stable(e.config);
    const el = top.find((c) => !used.has(c) && c.config && stable(c.config) === want);
    if (el) { used.add(el); el.setAttribute('data-qa-card', String(e.index)); matched.push(e.index); } else unmatched.push(e.index);
  }
  return { rendered: top.length, matched, unmatched };
}

/** Pair config <-> rendered cards (waits until every config card has a rendered element, up to `timeout`). */
async function resolveCards(page, { timeout = 8000 } = {}) {
  const { urlPath, view } = currentDashboard(page);
  const flat = flattenView(await savedView(page, urlPath, { view }));
  const deadline = Date.now() + timeout;
  let r;
  do {
    r = await page.evaluate(stampCardsInPage, { flat });
    if (!r.unmatched.length) break;
    await wait(250);
  } while (Date.now() < deadline);
  return { flat, ...r };
}

const matchesRef = (ref, e) => {
  if (typeof ref === 'number') return e.index === ref;
  if (typeof ref === 'function') return !!ref(e.config, { index: e.index, section: e.section, indexInSection: e.indexInSection });
  if (typeof ref === 'string') return [e.config.name, e.config.title, e.config.heading, e.config.entity].includes(ref);
  if (ref && typeof ref === 'object') {
    if ('section' in ref && ('index' in ref) && Object.keys(ref).length === 2) return e.section === ref.section && e.indexInSection === ref.index;
    return Object.entries(ref).every(([k, v]) => (v && typeof v === 'object' ? JSON.stringify(e.config[k]) === JSON.stringify(v) : e.config[k] === v));
  }
  return false;
};

const toRecord = (page, e, rendered) => ({
  index: e.index, section: e.section, indexInSection: e.indexInSection, config: e.config, rendered,
  locator: page.locator(`hui-card[data-qa-card="${e.index}"]`),
  options: page.locator(`hui-card[data-qa-card="${e.index}"]`).locator('xpath=ancestor::hui-card-options | ancestor::hui-card-edit-mode').first(),
});

/** OBSERVE: all configured top-level cards of the open dashboard with their rendered <hui-card> locator. */
export async function listCards(page) {
  const r = await resolveCards(page);
  return r.flat.map((e) => toRecord(page, e, r.matched.includes(e.index)));
}

/** All cards matching `ref` (see "Addressing cards"). */
export async function findCards(page, ref) {
  return (await listCards(page)).filter((e) => matchesRef(ref, e));
}

/** The first card matching `ref`; throws when none matches or the match is not rendered. */
export async function findCard(page, ref, { timeout } = {}) {
  const r = await resolveCards(page, timeout !== undefined ? { timeout } : {});
  const hit = r.flat.find((e) => matchesRef(ref, e));
  if (!hit) throw new Error(`no card matches ${typeof ref === 'function' ? 'the predicate' : JSON.stringify(ref)} among ${r.flat.length} configured cards`);
  if (!r.matched.includes(hit.index)) throw new Error(`card ${hit.index} (${JSON.stringify(hit.config).slice(0, 80)}) is configured but not rendered`);
  return toRecord(page, hit, true);
}

const styleApi = (page, ref) => ({
  style: (path, prop) => computedStyle(page, ref, path, prop),
  waitStyle: (path, prop, expected, opts) => waitForComputed(page, ref, path, prop, expected, opts),
});

/** findCard + style()/waitStyle() helpers. */
export async function cardAt(page, ref) {
  const c = await findCard(page, ref);
  return { ...c, ...styleApi(page, ref) };
}

// ---------------------------------------------------------------------------
// card editor dialog
// ---------------------------------------------------------------------------
const dialogOf = (page) => page.locator('hui-dialog-edit-card');
/** A dialog footer button (scoped to the footer: the Studio has its own "Cancel" / "Save preset" buttons). */
const footerBtn = (page, name) => dialogOf(page)
  .locator('ha-dialog-footer, [slot="primaryAction"], [slot="secondaryAction"]')
  .getByRole('button', { name, exact: true });

export async function openCardEditor(page, ref) {
  const card = await findCard(page, ref);
  await card.locator.waitFor({ state: 'visible', timeout: 15000 });
  const opts = card.locator.locator('xpath=ancestor::hui-card-options');
  if (await opts.count()) {
    // masonry: the card's Edit footer button
    const edit = opts.getByRole('button', { name: 'Edit', exact: true });
    if (await edit.isVisible().catch(() => false)) await edit.click();
    else if (state.get(page)?.hasTouch) await tap(opts.locator('hui-card')); // narrow viewport: footer collapsed, tap the card
    else await opts.locator('hui-card').click();
  } else {
    // sections: edit mode wraps each card in <hui-card-edit-mode>; clicking the card opens the editor
    const wrap = card.locator.locator('xpath=ancestor::hui-card-edit-mode');
    if (!(await wrap.count())) throw new Error('card has no edit wrapper - call enterEditMode(page) first');
    if (state.get(page)?.hasTouch) await tap(wrap); else await wrap.click();
  }
  await footerBtn(page, 'Save').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('cms-tab-button').first().waitFor({ state: 'visible', timeout: 20000 });
  return dialogOf(page);
}

async function dialogClosed(page, timeout = 15000) {
  await footerBtn(page, 'Save').waitFor({ state: 'hidden', timeout });
}

export async function saveCard(page) {
  await footerBtn(page, 'Save').click();
  await dialogClosed(page);
  await settle(page, 700);
  await resolveCards(page).catch(() => {});
}

export async function cancelCard(page) {
  await footerBtn(page, 'Cancel').click();
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const saveVisible = await footerBtn(page, 'Save').isVisible().catch(() => false);
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

/** In-page scan (observation only; stamps data-qa-* markers). Written against roles / aria-expanded; the
 *  class names and the chevron glyph are fallbacks for markup without them. */
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
  preorder(panel, (n) => { n.removeAttribute?.('data-qa-sec'); n.removeAttribute?.('data-qa-ctl'); n.removeAttribute?.('data-qa-sec-switch'); });
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const parentOf = (n) => n.assignedSlot || n.parentElement || (n.getRootNode() instanceof ShadowRoot ? n.getRootNode().host : null);
  const HEADER = ['module-header', 'child-header', 'entity-header'];
  const TITLE_SEL = '.module-title, .child-title, .entity-name, .entity-title';
  const CHEV_SEL = '.module-chevron, .entity-chevron, .chevron';
  const isHeader = (n) => n.classList && (HEADER.some((c) => n.classList.contains(c)) || (n.hasAttribute('aria-expanded') && !!n.querySelector(TITLE_SEL)));
  const clean = (s) => s.replace(/\s+/g, ' ').replace(/^[\s▶▼]+/, '').trim();
  const textWithout = (el, sel) => { const c = el.cloneNode(true); c.querySelectorAll(sel).forEach((x) => x.remove()); return c.textContent || ''; };
  const sections = [];
  const containers = new Map(); // container element -> section
  preorder(panel, (n) => {
    if (!isHeader(n) || !n.parentElement) return true;
    const container = n.closest('.module, .child-section, .entity-section') || n.parentElement;
    const kind = n.classList.contains('child-header') ? 'child' : n.classList.contains('entity-header') ? 'entity' : 'module';
    const tEl = n.querySelector(TITLE_SEL);
    const title = clean(tEl ? textWithout(tEl, '[aria-hidden="true"]') : textWithout(n, '[aria-hidden="true"], ha-switch, ' + CHEV_SEL + ', .child-sub, .entity-id'));
    const sub = (n.querySelector('.child-sub, .entity-id')?.textContent || '').trim();
    // open state: aria-expanded (on the header or the button inside it), else the chevron glyph, else the host's flag;
    // a header with none of these (the "Entity Rows" label) is static
    const chev = n.querySelector(CHEV_SEL);
    const ae = n.getAttribute('aria-expanded') ?? n.querySelector('[aria-expanded]')?.getAttribute('aria-expanded') ?? null;
    const host = container.getRootNode().host;
    let open;
    let collapsible = true;
    if (ae !== null) open = ae === 'true';
    else if (chev && chev.textContent.includes('▼')) open = true;
    else if (chev && chev.textContent.includes('▶')) open = false;
    else if (chev && host) open = !!(('_open' in host) ? host._open : host.open);
    else { open = true; collapsible = false; }
    // enable switch: inside the header, or a sibling of the header button on the same row
    let sw = n.querySelector('ha-switch');
    if (!sw) {
      const hr = n.getBoundingClientRect();
      sw = [...container.querySelectorAll('ha-switch')].find((x) => {
        if (n.contains(x)) return false;
        const r = x.getBoundingClientRect();
        const cy = r.top + r.height / 2;
        return r.width > 0 && cy >= hr.top - 2 && cy <= hr.bottom + 2 && (x.closest('.module, .child-section, .entity-section') === container);
      }) || null;
    }
    const sec = {
      index: sections.length, title, sub, kind,
      collapsible, open, enabled: sw ? !!sw.checked : null, visible: visible(n), level: 0, parent: -1,
    };
    for (let p = parentOf(container); p; p = parentOf(p)) {
      if (containers.has(p)) { if (sec.parent < 0) sec.parent = containers.get(p).index; sec.level++; }
    }
    n.setAttribute('data-qa-sec', String(sec.index));
    if (sw) sw.setAttribute('data-qa-sec-switch', String(sec.index));
    containers.set(container, sec);
    sections.push(sec);
    return true;
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
    if (c && c.kind === 'button' && isHeader(n)) c = null; // a header button is a section, not a control
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

/** OBSERVE: every section header: {index,title,name,sub,kind,level,parent,collapsible,open,enabled,visible,locator,toggle}. */
export async function listSections(page) {
  const { sections } = await scan(page);
  return sections.map((s) => ({
    ...s,
    name: stripEmoji(s.title),
    locator: page.locator(`[data-qa-sec="${s.index}"]`),
    toggle: s.enabled === null ? null : page.locator(`[data-qa-sec-switch="${s.index}"]`),
  }));
}

const describeSection = (s) => `#${s.index} ${s.kind}${s.level ? ' L' + s.level : ''} "${s.name}"${s.sub ? ' (' + s.sub + ')' : ''}`;

/** Resolve a section key (index | RegExp | title). Exact title (emoji ignored, case-insensitive; entity rows also by entity id) wins;
 *  a substring is accepted only when exactly one section contains it; several candidates throw. `within` limits to the sections
 *  nested under another section. Returns null when nothing matches. */
function matchSection(sections, key, { within } = {}) {
  let pool = sections;
  if (within !== undefined && within !== null) {
    const w = matchSection(sections, within);
    if (!w) throw new Error(`no section "${within}" to search within`);
    pool = sections.filter((s) => { for (let p = s.parent; p >= 0; p = sections[p].parent) if (p === w.index) return true; return false; });
  }
  if (typeof key === 'number') return sections.find((s) => s.index === key) || null;
  if (key && typeof key === 'object' && !(key instanceof RegExp)) return matchSection(sections, key.title ?? key.name, { within: key.within ?? within });
  const norm = (s) => stripEmoji(s).toLowerCase();
  if (key instanceof RegExp) {
    const hits = pool.filter((s) => key.test(s.name ?? stripEmoji(s.title)));
    if (hits.length > 1) throw new Error(`section ${key} is ambiguous: ${hits.map(describeSection).join('; ')}`);
    return hits[0] || null;
  }
  const t = String(key).toLowerCase().trim();
  const exact = pool.filter((s) => norm(s.title) === t || (s.sub && s.sub.toLowerCase() === t));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new Error(`section "${key}" is ambiguous: ${exact.map(describeSection).join('; ')} - pass the index or { within }`);
  const part = pool.filter((s) => norm(s.title).includes(t) || (s.sub && s.sub.toLowerCase().includes(t)));
  if (part.length === 1) return part[0];
  if (part.length > 1) throw new Error(`section "${key}" matches several sections: ${part.map(describeSection).join('; ')} - use the exact title or the index`);
  return null;
}

async function sectionFor(page, key, opts) {
  const sections = await listSections(page);
  const s = matchSection(sections, key, opts);
  if (!s) throw new Error(`no section "${key}" among: ${sections.map((x) => x.name).join(' | ')}`);
  return s;
}

/** Real click on the header's left part (chevron / title), never the enable switch. */
async function clickHeader(s) {
  const box = await s.locator.boundingBox();
  if (!box) throw new Error(`section "${s.name}" header is not visible`);
  await s.locator.scrollIntoViewIfNeeded();
  await s.locator.click({ position: { x: Math.min(24, Math.max(4, box.width / 4)), y: box.height / 2 } });
}

async function setOpen(page, key, wantOpen, opts) {
  let s = await sectionFor(page, key, opts);
  if (!s.collapsible || s.open === wantOpen) return s;
  const idx = s.index;
  await clickHeader(s);
  for (let i = 0; i < 20; i++) {
    await wait(150);
    const all = await listSections(page);
    // headers above this one do not change on a click, so the index still names it; fall back to a fresh match
    s = (all[idx] && all[idx].title === s.title) ? all[idx] : matchSection(all, key, opts);
    if (s && s.open === wantOpen) return s;
  }
  throw new Error(wantOpen
    ? `section "${s?.name ?? key}" did not expand after a click (enabled=${s?.enabled})`
    : `section "${s?.name ?? key}" did not collapse`);
}

export const expandSection = (page, key, opts) => setOpen(page, key, true, opts);
export const collapseSection = (page, key, opts) => setOpen(page, key, false, opts);

export async function setSectionEnabled(page, key, on = true, opts) {
  const s = await sectionFor(page, key, opts);
  if (!s.toggle) throw new Error(`section "${s.name}" has no enable switch`);
  if (s.enabled !== on) await toggle(s.toggle, on);
  return (await listSections(page))[s.index];
}

/** OBSERVE: controls of the Studio panel (all, or of one section by key). Hidden ones are included with visible:false. */
export async function listControls(page, section, { within, deep = false } = {}) {
  const { sections, controls } = await scan(page);
  let list = controls;
  if (section !== undefined && section !== null) {
    const s = matchSection(sections.map((x) => ({ ...x, name: stripEmoji(x.title) })), section, { within });
    if (!s) throw new Error(`no section "${section}"`);
    const inside = (idx) => { for (let p = idx; p >= 0; p = sections[p].parent) if (p === s.index) return true; return false; };
    list = controls.filter((c) => (deep ? c.sectionIndex >= 0 && inside(c.sectionIndex) : c.sectionIndex === s.index));
  }
  return list.map((c) => ({ ...c, section: stripEmoji(c.section), locator: page.locator(`[data-qa-ctl="${c.id}"]`) }));
}

/** The control labelled `label` in `section` (exact label first, then an unambiguous substring); throws on none / several. */
export async function findControl(page, section, label, opts) {
  const all = await listControls(page, section, opts);
  const t = label.toLowerCase();
  const pick = (f) => { const m = all.filter(f); return m.length > 1 && m.some((c) => c.visible) ? m.filter((c) => c.visible) : m; };
  let hits = pick((c) => c.label.toLowerCase() === t);
  if (!hits.length) hits = pick((c) => c.label.toLowerCase().includes(t));
  if (hits.length !== 1) {
    throw new Error(hits.length
      ? `control "${label}" is ambiguous in "${section ?? 'panel'}": ${hits.map((c) => `${c.kind}:${c.label}`).join(' | ')}`
      : `control "${label}" not found in "${section ?? 'panel'}" (${all.map((c) => c.label).join(' | ')})`);
  }
  return hits[0];
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

const popoverOf = (page) => page.locator('.popover').first();

async function pickerParts(loc) {
  const compact = await loc.evaluate((e) => !!e.compact);
  const page = pageOf(loc);
  if (!compact) return { compact, root: loc, trigger: null };
  const trigger = loc.locator('.swatch-trigger');
  await trigger.click();
  const pop = popoverOf(page);
  await pop.waitFor({ state: 'visible', timeout: 5000 });
  return { compact, root: pop, trigger };
}

/** After a commit the compact popover closes by itself. If it is still open (nothing was committed), close it by clicking the
 *  trigger again (a toggle) - never Escape: Escape on a closed popover closes the whole card dialog. */
async function settlePopover(page, trigger) {
  const pop = popoverOf(page);
  for (let i = 0; i < 12; i++) {
    if (!(await pop.isVisible().catch(() => false))) return true;
    await wait(100);
  }
  await trigger.click();
  await pop.waitFor({ state: 'hidden', timeout: 5000 });
  return false;
}

/** Type a colour (hex or any CSS colour / var(--x)) into the picker's text field; the OS colour dialog is never used.
 *  commit: 'Tab' (default) or 'Enter' - exactly one key. A compact picker's popover closes itself on commit; the helper
 *  verifies that (and the resulting value) instead of pressing anything else. Throws when the value was not accepted. */
export async function setColor(ctrl, value, { commit = 'Tab' } = {}) {
  const loc = locOf(ctrl);
  const page = pageOf(loc);
  const { compact, root, trigger } = await pickerParts(loc);
  await typeText(root.locator('input[type="text"]'), value, { commit });
  await settle(page, 150);
  let committed = true;
  if (compact) committed = await settlePopover(page, trigger);
  const now = await loc.evaluate((e) => e.value);
  if (String(now).trim().toLowerCase() !== String(value).trim().toLowerCase()) {
    throw new Error(`colour picker holds "${now}" after typing "${value}" (value rejected as invalid?${compact && !committed ? ' popover stayed open' : ''})`);
  }
  return now;
}

/** Click a preset swatch by its aria-label (e.g. "Red"), or a "My colors" swatch by name/hex. A compact popover closes itself. */
export async function pickSwatch(ctrl, name) {
  const loc = locOf(ctrl);
  const page = pageOf(loc);
  const { compact, root, trigger } = await pickerParts(loc);
  await root.locator(`.preset[aria-label="${name}"]`).click();
  await settle(page, 150);
  if (compact) await settlePopover(page, trigger);
  return loc.evaluate((e) => e.value);
}

/** HA entity picker (cms-entity-picker / ha-entity-picker): open, wait for the search field to have focus, type the whole id,
 *  click the option whose value is exactly `entityId` (searched only in this picker's own list), verify the control's value.
 *  `custom: true` also accepts the "Add custom item" option for an id that is not an entity. */
export async function pickEntity(ctrl, entityId, { custom = false, timeout = 12000 } = {}) {
  const loc = locOf(ctrl);
  const page = pageOf(loc);
  const read = () => loc.evaluate((e) => e.value ?? '');
  // no hass yet: the picker degrades to a plain text input
  const fallback = loc.locator('input.fallback-input');
  if (await fallback.count()) { await typeText(fallback, entityId, { commit: 'Tab' }); return read(); }
  if ((await read()) === entityId) return entityId;
  await loc.scrollIntoViewIfNeeded();
  await loc.locator('ha-picker-field').first().click();
  const combo = loc.locator('ha-picker-combo-box');
  await combo.waitFor({ state: 'visible', timeout: 8000 });
  // ready = options rendered and the search field focused (typing earlier loses the first characters)
  const focused = () => loc.evaluate((el) => {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    for (let p = a; p; p = p.assignedSlot || p.parentElement || (p.getRootNode() && p.getRootNode().host)) if (p === el) return /^(INPUT|TEXTAREA)$/.test(a.tagName);
    return false;
  });
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await focused()) && (await loc.locator('ha-list-item-option').count())) break;
    await wait(100);
  }
  if (!(await focused())) throw new Error('entity picker: the search field never took focus');
  await wait(150);
  const typed = () => loc.locator('ha-input-search').evaluate((e) => e.value ?? e.shadowRoot?.querySelector('input')?.value ?? '').catch(() => null);
  await page.keyboard.type(entityId, { delay: 25 });
  if ((await typed()) !== entityId) {
    await page.keyboard.press('Control+A');
    await page.keyboard.type(entityId, { delay: 40 });
    const t2 = await typed();
    if (t2 !== entityId) throw new Error(`entity picker: search field holds "${t2}" after typing "${entityId}"`);
  }
  let stamped = null;
  while (Date.now() < deadline && !stamped) {
    stamped = await loc.evaluate((el, { id, custom }) => {
      const items = [];
      const st = [el];
      while (st.length) {
        const n = st.pop();
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'HA-LIST-ITEM-OPTION') items.push(n);
        for (const k of [...(n.shadowRoot ? n.shadowRoot.children : []), ...n.children]) st.push(k);
      }
      items.forEach((i) => i.removeAttribute('data-qa-opt'));
      const isCustom = (i) => /^\s*Add custom item/i.test(i.textContent || '');
      const hit = items.find((i) => i.value === id && !isCustom(i)) || (custom ? items.find((i) => i.value === id && isCustom(i)) : null);
      if (hit) { hit.setAttribute('data-qa-opt', '1'); return true; }
      return null;
    }, { id: entityId, custom });
    if (!stamped) await wait(200);
  }
  if (!stamped) {
    const seen = await loc.evaluate((el) => {
      const out = [];
      const st = [el];
      while (st.length) { const n = st.pop(); if (n.nodeType !== 1) continue; if (n.tagName === 'HA-LIST-ITEM-OPTION') out.push(n.value); for (const k of [...(n.shadowRoot ? n.shadowRoot.children : []), ...n.children]) st.push(k); }
      return out.slice(0, 8);
    });
    throw new Error(`entity picker: no option with exactly "${entityId}" (list shows: ${seen.join(', ') || 'nothing'})`);
  }
  await loc.locator('[data-qa-opt="1"]').click();
  for (let i = 0; i < 40; i++) {
    if ((await read()) === entityId) return entityId;
    await wait(100);
  }
  throw new Error(`entity picker: value is "${await read()}" after choosing "${entityId}"`);
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
/** The view's cards as stored (sections views: all sections' cards flattened in section order). */
export async function savedCards(page, urlPath, { view = 0 } = {}) {
  return flattenView(await savedView(page, urlPath, { view })).map((e) => e.config);
}

export async function computedStyle(page, ref, path, prop) {
  const c = await findCard(page, ref);
  const r = await c.locator.evaluate(readStyle, { path: [].concat(path || []), prop });
  if (r.error) throw new Error(r.error);
  return r.value;
}

export async function waitForComputed(page, ref, path, prop, expected, { timeout = 15000 } = {}) {
  const ok = (v) => (expected instanceof RegExp ? expected.test(v) : typeof expected === 'function' ? expected(v) : v === expected);
  const deadline = Date.now() + timeout;
  let last, err;
  while (Date.now() < deadline) {
    try { last = await computedStyle(page, ref, path, prop); err = null; if (ok(last)) return last; } catch (e) { err = e; }
    await wait(250);
  }
  throw new Error(`computed ${prop} of card ${typeof ref === 'function' ? 'by predicate' : JSON.stringify(ref)} [${[].concat(path || []).join(' > ')}] was ${JSON.stringify(last)}${err ? ' (' + err.message + ')' : ''}, expected ${expected}`);
}

/** Handle to the rendered card element (works in view and edit mode). A numeric ref gives a locator right away (it relies on
 *  the stamps the driver's navigation helpers refresh); for any other ref use `await cardAt(page, ref)`. */
export function dashboardCard(page, ref) {
  return {
    locator: typeof ref === 'number' ? page.locator(`hui-card[data-qa-card="${ref}"]`) : undefined,
    style: (path, prop) => computedStyle(page, ref, path, prop),
    waitStyle: (path, prop, expected, opts) => waitForComputed(page, ref, path, prop, expected, opts),
  };
}

export const settle = (page, ms = 600) => page.waitForTimeout(ms);

export async function shot(page, path, opts = {}) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  await page.screenshot({ path, ...opts });
  return path;
}

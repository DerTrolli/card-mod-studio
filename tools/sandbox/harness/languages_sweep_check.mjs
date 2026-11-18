// Every shipped language (v1.0), through the real Settings selector: the
// panel follows it, and nothing in it runs out of the panel sideways.
//   node languages_sweep_check.mjs                  (card-mod rig, desktop 1440×900)
//   PHONE=1 node languages_sweep_check.mjs          (390×844, touch)
//   RIG=uix UIX_TOKENS_FILE=/path/tokens.json node languages_sweep_check.mjs
//   SHOTS_DIR=/path node languages_sweep_check.mjs  (one screenshot per language)
// The card is a vertical stack (a heading, a tile with a feature row, an
// entities card), with every module switched on, every section open, two
// rules in every Threshold module and two saved presets, so the longest
// labels, hints and warnings of each language are on screen. Nothing is
// saved: the editor is cancelled. Changes the rig user's Studio settings and
// clears them at the end, so run it on its own.
import * as D from './click-driver.mjs';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const PHONE = process.env.PHONE === '1';
const SHOTS = process.env.SHOTS_DIR || '';
const tokensFile = process.env.TOKENS_FILE || undefined;
const URLPATH = 'qa-languages';
const results = [];
const need = (cond, msg) => { if (!cond) throw new Error(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const HA_OWN_ERRORS = [
  /Transition was skipped/,
  /Failure writing unhandled promise rejection to system log/,
  /status of 500 \(Internal Server Error\)/,
  /Error getting Image Colors.*media_player_proxy/,
  /themesReady: Timeout waiting for themes/,
];
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push(true);
    console.log('PASS', name, detail ?? '');
  } catch (e) {
    results.push(false);
    console.log('FAIL', name, '-', String(e.message || e).split('\n')[0]);
  }
};

// The shipped languages and two titles each, read from the sources.
const i18nDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/i18n');
const indexTs = readFileSync(resolve(i18nDir, 'index.ts'), 'utf8');
const codes = [...indexTs.matchAll(/^ {2}'?([\w-]+)'?: \{ name: '([^']+)'/gm)].map((m) => ({ code: m[1], name: m[2] }));
const msg = (code, key) => {
  const src = readFileSync(resolve(i18nDir, `${code}.ts`), 'utf8');
  const m = new RegExp(`'${key.replace('.', '\\.')}': (['"])((?:\\\\.|(?!\\1).)*)\\1`).exec(src);
  if (!m) throw new Error(`${code}: no ${key}`);
  return m[2].replace(/\\(.)/g, '$1');
};
if (codes.length !== readdirSync(i18nDir).filter((f) => /^[\w-]+\.ts$/.test(f) && f !== 'index.ts').length) {
  console.log('FAIL setup - LANGUAGES in index.ts and the dictionary files differ');
  process.exit(1);
}

const ws = (page, m) => page.evaluate((x) => document.querySelector('home-assistant').hass.connection.sendMessagePromise(x), m);
const setSettings = (page, value) => ws(page, { type: 'frontend/set_user_data', key: 'cms_settings', value });
const settingsSelect = (page) => page.locator('cms-settings select');

/** Everything in the panel (through shadow roots) that sticks out of it sideways. */
const overflow = (page) => page.evaluate(() => {
  const panel = document.querySelector('home-assistant') && (() => {
    const find = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (el.tagName === 'CMS-PANEL') return el;
        if (el.shadowRoot) { const f = find(el.shadowRoot); if (f) return f; }
      }
      return null;
    };
    return find(document);
  })();
  if (!panel) return { error: 'no panel' };
  const box = panel.getBoundingClientRect();
  const out = [];
  const cut = [];
  const spill = [];
  // Where the element's own text is drawn, against its box (scrollWidth also
  // counts invisible touch targets such as a ::before inset -4px).
  const textOutside = (el) => {
    const r = el.getBoundingClientRect();
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const tr of range.getClientRects()) {
        if (tr.width > 0 && (tr.right > r.right + 1 || tr.left < r.left - 1)) return true;
      }
    }
    return false;
  };
  const inPreview = (el) => {
    for (let p = el; p && p !== panel; p = p.parentElement || p.getRootNode().host) {
      if (p.classList && (p.classList.contains('preview-card-wrapper') || p.classList.contains('preview-stage'))) return true;
    }
    return false;
  };
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.right > box.right + 1 || r.left < box.left - 1)) {
        const cs = getComputedStyle(el);
        // Clipped by an ancestor inside the panel (e.g. Home Assistant's own
        // slider fill, parked beside its track): nothing shows outside.
        let clipped = false;
        for (let p = el.parentElement || el.getRootNode().host; p && p !== panel; p = p.parentElement || p.getRootNode().host) {
          const ox = getComputedStyle(p).overflowX;
          const pr = p.getBoundingClientRect();
          if (ox !== 'visible' && pr.left >= box.left - 1 && pr.right <= box.right + 1) { clipped = true; break; }
        }
        if (!clipped && cs.visibility !== 'hidden' && cs.position !== 'fixed') {
          const path = [];
          for (let p = el; p && path.length < 6; p = p.parentElement || p.getRootNode().host) path.push(p.tagName.toLowerCase() + (p.className && typeof p.className === 'string' ? '.' + p.className.split(' ')[0] : ''));
          out.push(`${path.reverse().join('>')} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40)}" ${Math.round(r.left)}–${Math.round(r.right)} (panel ${Math.round(box.left)}–${Math.round(box.right)})`);
        }
      }
      // Studio text cut off inside its own box (ellipsis / hidden overflow)
      // (not: screen-reader-only text, 1px by design; entity ids, which end in … on purpose)
      if (!/^(INPUT|SELECT|TEXTAREA|CODE|PRE)$/.test(el.tagName) && el.clientWidth > 1
          && !/^[a-z_]+\.[\w]+$/.test(el.textContent.trim())
          && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
          && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') {
        cut.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 50)}" ${el.scrollWidth}>${el.clientWidth}`);
      }
      // Studio text running out of its own box inside the panel (over a
      // neighbouring control); Home Assistant's card in the preview is not ours
      if (!/^(INPUT|SELECT|TEXTAREA|CODE|PRE)$/.test(el.tagName) && el.clientWidth > 1
          && !inPreview(el)
          && !/^[a-z_]+\.[\w]+$/.test(el.textContent.trim())
          && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
          && getComputedStyle(el).overflowX === 'visible' && textOutside(el)) {
        spill.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} "${el.textContent.trim().slice(0, 50)}" box ${Math.round(el.getBoundingClientRect().width)}px`);
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  if (panel.shadowRoot) walk(panel.shadowRoot);
  walk(panel);
  // the panel itself: no sideways scrolling
  const sideways = panel.scrollWidth > panel.clientWidth + 1;
  return { out, cut, spill, sideways, vw: window.innerWidth, panel: [Math.round(box.left), Math.round(box.right)] };
});

/** Sections still closed / modules still off (visible ones). */
async function notOpen(page) {
  const all = (await D.listSections(page)).filter((s) => s.visible);
  return {
    all: all.length,
    closed: all.filter((s) => s.collapsible && !s.open).map((s) => s.name),
    off: all.filter((s) => s.enabled === false).map((s) => s.name),
    on: all.filter((s) => s.enabled === true).length,
  };
}

/** Switch every module on and open every section (several passes: new sections appear). */
async function openEverything(page) {
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const s of await D.listSections(page)) {
      if (!s.visible) continue;
      if (s.enabled === false) { await D.setSectionEnabled(page, s.index, true).catch(() => {}); changed = true; }
      if (s.collapsible && !s.open) { await D.expandSection(page, s.index).catch(() => {}); changed = true; }
    }
    if (!changed) break;
    await wait(300);
  }
}

const h = await D.launch({
  rig: RIG,
  viewport: PHONE ? { width: 390, height: 844 } : { width: 1440, height: Number(process.env.VH) || 900 }, // VH=6000: the whole panel in one screenshot
  hasTouch: PHONE,
  ...(tokensFile ? { tokensFile } : {}),
});
const { page } = h;
let presetsBefore = null;
try {
  // Fixture (not a UI action): a chosen English, so the first-run question stays away.
  await setSettings(page, { language: 'en', languageChosen: true, updatedAt: Date.now() });
  // the user's presets are put aside (restored at the end): two are saved below
  presetsBefore = (await ws(page, { type: 'frontend/get_user_data', key: 'cms_presets' }))?.value ?? null;
  await ws(page, { type: 'frontend/set_user_data', key: 'cms_presets', value: null });
  await page.evaluate(() => localStorage.removeItem('cms-presets'));
  await D.seedDashboard(page, URLPATH, [{
    type: 'vertical-stack',
    cards: [
      { type: 'heading', heading: 'Kitchen' },
      { type: 'tile', entity: 'light.ceiling_lights', features: [{ type: 'light-brightness' }] },
      { type: 'entities', entities: ['light.ceiling_lights', 'sensor.outside_temperature'] },
    ],
  }]);
  await D.gotoDashboard(page, URLPATH, { engine: false });
  await D.enterEditMode(page);
  await D.openCardEditor(page, 0);
  await D.openStudio(page);
  await openEverything(page);
  // two presets through the preset bar, so 📚 My Presets shows its rows
  for (const name of ['Warm', 'Cool']) {
    await page.locator('cms-panel .btn-preset-save').first().click();
    await page.locator('cms-panel input.preset-name').pressSequentially(name);
    await page.locator('cms-panel input.preset-name').press('Enter');
    await wait(500);
  }
  // two Threshold rules in every Threshold module, so the rule rows are on screen
  const addRule = page.locator('cms-threshold-module button.add-btn', { hasText: 'Add rule' });
  const nAdd = await addRule.count();
  for (let i = 0; i < nAdd; i++) {
    for (let k = 0; k < 2; k++) { await addRule.nth(i).click(); await wait(150); }
  }
  await openEverything(page);
  const st = await notOpen(page);
  console.log(`fixture: ${nAdd} Threshold modules with 2 rules each, 2 presets`);
  console.log(`setup: ${codes.length} languages, ${st.all} sections (${st.on} modules on; closed: ${st.closed.length}, off: ${st.off.length}) (${PHONE ? '390 phone' : '1440 desktop'})`);
  if (st.closed.length || st.off.length) throw new Error(`not everything open: closed ${st.closed.join(', ')}; off ${st.off.join(', ')}`);

  for (const { code, name } of (process.env.ONLY ? codes.filter((c) => process.env.ONLY.split(",").includes(c.code)) : codes)) {
    await step(`${code} (${name}): the panel switches, nothing sticks out or is cut off`, async () => {
      await D.chooseOption(settingsSelect(page), name);
      await wait(400);
      await openEverything(page);
      const now = await notOpen(page);
      need(!now.closed.length && !now.off.length, `closed: ${now.closed.join(', ')}; off: ${now.off.join(', ')}`);
      const titles = (await D.listSections(page)).map((s) => s.name);
      const border = msg(code, 'border.title');
      const settings = msg(code, 'settings.title');
      need(titles.includes(border), `no "${border}" in ${titles.slice(0, 6).join(' | ')}…`);
      need(titles.includes(settings), `no "${settings}"`);
      const o = await overflow(page);
      need(!o.error, o.error);
      need(!o.sideways, `panel scrolls sideways (${JSON.stringify(o.panel)})`);
      need(o.out.length === 0, `${o.out.length} sticking out: ${o.out.slice(0, 3).join(' || ')}`);
      need(o.cut.length === 0, `${o.cut.length} cut off: ${o.cut.slice(0, 4).join(' || ')}`);
      need(o.spill.length === 0, `${o.spill.length} running out of their box: ${o.spill.slice(0, 4).join(' || ')}`);
      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: `${SHOTS}/lang-${code}-${PHONE ? 390 : 1440}.png` });
      }
      return `${now.all} sections open, ${now.on} modules on`;
    });
  }

  await step('no console errors', async () => {
    const own = h.errors.filter((e) => !HA_OWN_ERRORS.some((re) => re.test(e)));
    need(own.length === 0, own.slice(0, 3).join(' || '));
  });
  await D.cancelCard(page).catch(() => {});
} catch (e) {
  results.push(false);
  console.log('FAIL setup -', String(e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  try { await setSettings(page, null); await page.evaluate(() => localStorage.removeItem('cms-settings')); } catch { /* closed */ }
  try {
    await ws(page, { type: 'frontend/set_user_data', key: 'cms_presets', value: presetsBefore });
    await page.evaluate(() => localStorage.removeItem('cms-presets'));
  } catch { /* closed */ }
  await h.close().catch(() => {});
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

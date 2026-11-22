// User simulation — updating from an older release (the 1.0.0 release run).
//
// A user on an older Card Style Studio styles two cards and saves a preset
// through that version's own editor (real clicks), then the bundle is
// replaced by the current one, as an update does. Checked with the current
// bundle: the dashboard looks the same (computed styles), every styled card
// opens with its modules on, Cancel changes nothing, a save writes the
// current names (`cms-pulse` → `cstudio-pulse` for versions before
// 1.0.0-beta.2) and the card still looks the same, and the old preset loads.
//
//   OLD_BUNDLE=/path/old/card-mod-studio.js OLD_LABEL=v0.11.0 node upgrade_sim.mjs
//   NEW_BUNDLE=…   the current build (default ../../../dist/card-mod-studio.js)
//   WWW=…          the rig's www folder (default ../config/www, the card-mod rig)
// The current bundle is put back at the end, whatever happens.
import * as D from './click-driver.mjs';
import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OLD = process.env.OLD_BUNDLE;
const LABEL = process.env.OLD_LABEL || 'old';
const NEW = process.env.NEW_BUNDLE || resolve(HERE, '../../../dist/card-mod-studio.js');
const WWW = process.env.WWW || resolve(HERE, '../config/www');
if (!OLD) { console.log('FAIL setup - set OLD_BUNDLE'); process.exit(1); }
const URLPATH = 'qa-upgrade';
const PRESET = `Upgrade ${LABEL}`;
const results = [];
const need = (cond, msg) => { if (!cond) throw new Error(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const deploy = (file) => copyFileSync(file, resolve(WWW, 'card-mod-studio.js'));
const HA_OWN = /themesReady: Timeout|status of 50[02]|Error getting Image Colors|Transition was skipped|Cannot parse given Error object/;

let h; let page; let KEY;
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push(true);
    console.log('PASS', `[${LABEL}]`, name, detail ?? '');
  } catch (e) {
    results.push(false);
    console.log('FAIL', `[${LABEL}]`, name, '-', String(e.message || e).split('\n')[0]);
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/upgrade-${LABEL}-fail-${results.length}.png` }).catch(() => {});
    await D.cancelCard(page).catch(() => {});
  }
};
const ws = (msg) => page.evaluate((m) => document.querySelector('home-assistant').hass.connection.sendMessagePromise(m), msg);
const open = async (n) => {
  try { await D.openCardEditor(page, n); } catch {
    await D.gotoDashboard(page, URLPATH, { engine: false });
    await D.enterEditMode(page);
    await D.openCardEditor(page, n);
  }
  await D.openStudio(page);
};
/** What the dashboard shows of the n-th tile (outside the editor). */
const look = (n) => page.evaluate((n) => {
  const all = []; const walk = (root) => { for (const el of root.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } }; walk(document);
  const card = all.filter((e) => e.tagName === 'HUI-TILE-CARD' && !e.closest('hui-dialog-edit-card'))[n];
  const ha = card && (card.shadowRoot ?? card).querySelector('ha-card');
  if (!ha) return null;
  const cs = getComputedStyle(ha);
  return { bg: cs.backgroundColor, radius: cs.borderRadius, border: `${cs.borderTopWidth} ${cs.borderTopStyle}`, anim: cs.animationName.replace(/^cms-|^cstudio-/, '*-') };
}, n);
const looks = async () => [await look(0), await look(1)];
const settle = async (want) => {
  let v;
  for (let i = 0; i < 30; i++) { v = JSON.stringify(await looks()); if (!want || v === want) return v; await wait(400); }
  return v;
};

let presetsBefore = null;
let saved = null;
let before = null;
try {
  // ---------------------------------------------------------------- old
  deploy(OLD);
  h = await D.launch({ rig: 'cm' });
  ({ page } = h);
  KEY = h.styleKey;
  presetsBefore = (await ws({ type: 'frontend/get_user_data', key: 'cms_presets' }))?.value ?? null;
  await D.seedDashboard(page, URLPATH, [
    { type: 'tile', entity: 'light.ceiling_lights' },
    { type: 'tile', entity: 'switch.decorative_lights' },
  ], { view: { type: 'masonry' } });
  await D.gotoDashboard(page, URLPATH, { engine: false });
  const version = await page.evaluate(() => customElements.get('cms-panel') ? 'loaded' : 'missing');
  need(version === 'loaded', 'the old bundle did not load');
  await D.enterEditMode(page);

  await step(`with ${LABEL}: style a card (Background red, Animation, Border) and save it as a preset`, async () => {
    await open(0);
    await D.setSectionEnabled(page, 'Background', true);
    await D.pickSwatch(await D.findControl(page, 'Background', 'Color'), 'Red');
    await D.setSectionEnabled(page, 'Animation', true);
    await D.setSectionEnabled(page, 'Border & Radius', true);
    // the preset bar sat at the top of the panel before 1.0, on the Presets tab since
    if ((await D.listTabs(page)).length) await D.selectTab(page, 'presets');
    await page.locator('cms-panel .btn-preset-save').first().click();
    await page.locator('cms-panel input.preset-name').pressSequentially(PRESET);
    await page.locator('cms-panel input.preset-name').press('Enter');
    await wait(800);
    await D.saveCard(page);
    const css = (await D.savedCards(page, URLPATH))[0]?.[KEY]?.style ?? '';
    need(/background: var\(--red-color\)/.test(css) && /animation: (cms|cstudio)-pulse/.test(css), css.slice(0, 300));
    return css.match(/animation: [\w-]+/)?.[0];
  });

  await step(`with ${LABEL}: a second card (Background blue)`, async () => {
    await open(1);
    await D.setSectionEnabled(page, 'Background', true);
    await D.pickSwatch(await D.findControl(page, 'Background', 'Color'), 'Blue');
    await D.saveCard(page);
  });

  await D.exitEditMode(page).catch(() => {});
  saved = await D.savedCards(page, URLPATH);
  before = await settle();
  console.log(`[${LABEL}] dashboard: ${before}`);
  await h.close();

  // ---------------------------------------------------------------- new
  deploy(NEW);
  h = await D.launch({ rig: 'cm' });
  ({ page } = h);
  await D.gotoDashboard(page, URLPATH, { engine: false });

  await step('after the update: the dashboard looks the same', async () => {
    const after = await settle(before);
    need(after === before, `${after} ≠ ${before}`);
    return after;
  });

  await step('the panel is the current version', async () => {
    await D.enterEditMode(page);
    await open(0);
    const v = await page.locator('cms-panel .version').first().textContent();
    need(/v1\.0\.0$/.test((v ?? '').trim()), `version "${v}"`);
    await D.cancelCard(page);
    return v.trim();
  });

  await step('each styled card opens with its modules on; Cancel changes nothing', async () => {
    const out = [];
    for (const [n, mods] of [[0, ['Background', 'Animation', 'Border & Radius']], [1, ['Background']]]) {
      await open(n);
      const secs = await D.listSections(page);
      for (const m of mods) {
        const s = secs.find((x) => x.name === m);
        need(s?.enabled === true, `card ${n}: ${m} enabled=${s?.enabled}`);
      }
      const bgSum = await page.locator('cms-background-module .module-summary').first().count();
      need(bgSum === 1, `card ${n}: no summary on the closed Background`);
      await D.cancelCard(page);
      out.push(`card ${n}: ${mods.join(', ')}`);
    }
    const now = await D.savedCards(page, URLPATH);
    need(JSON.stringify(now) === JSON.stringify(saved), 'the saved cards changed');
    return out.join('; ');
  });

  await step('a save (Border off and on again) writes the current names; the card looks the same', async () => {
    await open(0);
    await D.setSectionEnabled(page, 'Border & Radius', false);
    await D.setSectionEnabled(page, 'Border & Radius', true);
    await D.saveCard(page);
    const css = (await D.savedCards(page, URLPATH))[0]?.[KEY]?.style ?? '';
    need(css.includes('animation: cstudio-pulse') && !/\bcms-pulse\b/.test(css), css.slice(0, 300));
    await D.exitEditMode(page).catch(() => {});
    const after = await settle(before);
    need(after === before, `${after} ≠ ${before}`);
    return 'cstudio-pulse';
  });

  await step(`the preset saved with ${LABEL} loads onto the second card`, async () => {
    await D.enterEditMode(page);
    await open(1);
    await D.selectTab(page, 'presets');
    const opts = await page.locator('cms-panel .preset-bar select option').evaluateAll((els) => els.map((e) => e.value));
    need(opts.includes(PRESET), `presets: ${opts.join(', ')}`);
    await page.locator('cms-panel .preset-bar select').selectOption(PRESET);
    await wait(800);
    await D.selectTab(page, 'style');
    const secs = await D.listSections(page);
    for (const m of ['Background', 'Animation', 'Border & Radius']) need(secs.find((x) => x.name === m)?.enabled === true, `${m} not on after the load`);
    await D.cancelCard(page);
    return 'Background, Animation, Border & Radius';
  });

  await step('no console errors with the current bundle', async () => {
    const errs = h.errors.filter((e) => !HA_OWN.test(e));
    need(errs.length === 0, errs.slice(0, 3).join(' || '));
  });
} catch (e) {
  results.push(false);
  console.log('FAIL', `[${LABEL}]`, 'setup -', String(e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  try { deploy(NEW); } catch (e) { console.log('FAIL could not put the current bundle back:', e.message); results.push(false); }
  try { if (page) await ws({ type: 'frontend/set_user_data', key: 'cms_presets', value: presetsBefore }); } catch { /* closed */ }
  await h?.close().catch(() => {});
}
const passed = results.filter(Boolean).length;
console.log(`[${LABEL}] ${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

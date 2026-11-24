// Language (v1.0): the one-time question, the Settings selector, live
// switching, the per-user setting, and German Home Assistant with Auto-detect.
//   node language_check.mjs                       (card-mod rig, tokens.json)
//   RIG=uix UIX_TOKENS_FILE=/path/tokens.json node language_check.mjs
// Runs as the rig's own user and changes that user's Studio settings, so run
// it on its own, not alongside other checks. The settings are cleared at the
// start and at the end. Prints PASS/FAIL per step and "N/M checks passed".
process.env.CMS_FIRST_RUN = '1'; // keep the question: this check is about it
import * as D from './click-driver.mjs';
import { mkdirSync } from 'node:fs';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const URLPATH = 'qa-language';
const SHOTS = process.env.SHOTS_DIR || '';
const tokensFile = process.env.TOKENS_FILE || undefined;
const results = [];
const need = (cond, msg) => { if (!cond) throw new Error(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Not the Studio's, not counted: Home Assistant 2026.2's own page transitions
// (see the v0.11.0 release notes), the demo media players' artwork that HA's
// image proxy fails to serve on the 2025.9 rig (500 + "Image Colors"), and the
// engines' theme wait.
const HA_OWN_ERRORS = [
  /Transition was skipped/,
  /Failure writing unhandled promise rejection to system log/,
  /status of 500 \(Internal Server Error\)/,
  /Error getting Image Colors.*media_player_proxy/,
  // card-mod 4.2.1 / UIX wait for hass.themes.theme, which HA 2026.11 no longer has
  // (docs/research/2026-11-v0.11.0-release-qa.md)
  /themesReady: Timeout waiting for themes/,
];
const ownErrors = (h) => h.errors.filter((e) => !HA_OWN_ERRORS.some((re) => re.test(e)));

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

// --- fixture helpers (websocket / storage; never used to act on the UI) ---
const ws = (page, msg) => page.evaluate((m) => document.querySelector('home-assistant').hass.connection.sendMessagePromise(m), msg);
const storedSettings = async (page) => (await ws(page, { type: 'frontend/get_user_data', key: 'cms_settings' }))?.value ?? null;
const clearSettings = async (page) => {
  await ws(page, { type: 'frontend/set_user_data', key: 'cms_settings', value: null });
  await page.evaluate(() => localStorage.removeItem('cms-settings'));
};

// --- observation ---
const notice = (page) => page.locator('cms-language-notice .notice');
const noticeSelect = (page) => page.locator('cms-language-notice select');
const settingsSelect = (page) => page.locator('cms-settings select');
const selectedText = (loc) => loc.evaluate((e) => e.selectedOptions[0]?.textContent.trim());
const names = async (page) => (await D.listSections(page)).map((s) => s.name);
const hasSection = async (page, name) => (await names(page)).includes(name);
/** The panel's tab labels (v1.0), "Style|Presets|Palette|Settings". */
const tabLabels = async (page) => (await D.listTabs(page)).map((t) => t.label).join('|');
const styleButtonText = (page) => page.locator('cms-tab-button button').first().innerText();

/** Dashboard menu → Edit dashboard → a card's Edit, in English or German Home Assistant. */
async function openEditor(page, touch = false) {
  await page.getByRole('button', { name: /^(Open dashboard menu|Dashboard-Menü öffnen|.*[Mm]enü.*)$/ }).first().click();
  await page.getByRole('menuitem', { name: /Edit dashboard|Dashboard bearbeiten/i }).click();
  const done = page.getByRole('button', { name: /^(Done|Fertig)$/ });
  const take = page.getByRole('button', { name: /take control|Kontrolle übernehmen/i });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await done.isVisible().catch(() => false)) break;
    if (await take.isVisible().catch(() => false)) await take.click();
    await wait(250);
  }
  const opts = page.locator('hui-card-options').first();
  const edit = opts.getByRole('button', { name: /^(Edit|Bearbeiten)$/ });
  if (await edit.isVisible().catch(() => false)) await edit.click();
  else if (touch) await D.tap(opts.locator('hui-card'));
  else await opts.locator('hui-card').click(); // HA 2025.9: no footer Edit button, a click on the card opens it
  await page.locator('cms-tab-button button').first().waitFor({ state: 'visible', timeout: 20000 });
}

async function openStudio(page) {
  const btn = page.locator('cms-tab-button button').first();
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
  await page.locator('cms-panel').first().waitFor({ state: 'visible', timeout: 15000 });
  await wait(500);
}

async function session({ haLanguage, viewport, hasTouch = false, fresh = false }) {
  const h = await D.launch({ rig: RIG, viewport, hasTouch, ...(tokensFile ? { tokensFile } : {}) });
  const { page } = h;
  if (haLanguage) {
    await page.addInitScript((l) => localStorage.setItem('selectedLanguage', JSON.stringify(l)), haLanguage);
  }
  if (fresh) await clearSettings(page);
  return h;
}

const all = [];
try {
  // ------------------------------------------------------------------ A
  const a = await session({ viewport: { width: 1440, height: 900 }, fresh: true });
  all.push(a);
  const pa = a.page;
  await D.seedDashboard(pa, URLPATH, [{ type: 'tile', entity: 'light.ceiling_lights' }]);
  await D.gotoDashboard(pa, URLPATH, { engine: false });
  await openEditor(pa);
  await openStudio(pa);

  await step('first run (HA English): the question shows, Auto-detect preselected and named', async () => {
    await notice(pa).waitFor({ state: 'visible', timeout: 10000 });
    const sel = await selectedText(noticeSelect(pa));
    need(sel === 'Auto-detect: English (recommended)', `preselected "${sel}"`);
    need(await hasSection(pa, 'Border & Radius'), 'panel not English while asking');
    return `"${sel}"`;
  });

  await step('the question blocks nothing: a module opens while it is shown', async () => {
    await D.expandSection(pa, 'Border & Radius');
    need(await notice(pa).isVisible(), 'notice went away');
    return 'Border & Radius expanded';
  });

  await step('choosing Deutsch + OK: German at once, question gone, saved for the HA user', async () => {
    await D.chooseOption(noticeSelect(pa), 'Deutsch');
    await pa.locator('cms-language-notice').getByRole('button', { name: 'OK' }).click();
    await notice(pa).waitFor({ state: 'hidden', timeout: 5000 });
    need(await hasSection(pa, 'Rahmen & Radius'), `sections: ${(await names(pa)).join(' | ')}`);
    need((await styleButtonText(pa)).includes('Stil'), `Style button "${await styleButtonText(pa)}"`);
    const s = await storedSettings(pa);
    need(s?.language === 'de' && s?.languageChosen === true, `stored ${JSON.stringify(s)}`);
    return JSON.stringify({ language: s.language, languageChosen: s.languageChosen });
  });

  await step('the open module stays open across the switch', async () => {
    const s = (await D.listSections(pa)).find((x) => x.name === 'Rahmen & Radius');
    need(s?.open === true, `open=${s?.open}`);
  });

  await step('Settings → English switches the open panel live', async () => {
    await D.expandSection(pa, 'Einstellungen');
    const sel = settingsSelect(pa);
    need((await selectedText(sel)) === 'Deutsch', `settings shows "${await selectedText(sel)}"`);
    await D.chooseOption(sel, 'English');
    await wait(300);
    need(await hasSection(pa, 'Settings'), 'Settings title not English');
    need((await tabLabels(pa)) === 'Style|Presets|Palette|Settings', `tabs ${await tabLabels(pa)}`);
    need((await storedSettings(pa))?.language === 'en', 'not stored');
    return 'Settings; tabs Style | Presets | Palette | Settings';
  });

  await step('Settings → Auto-detect follows HA (English); back to Deutsch for the next step', async () => {
    const sel = settingsSelect(pa);
    await D.chooseOption(sel, 'Auto-detect: English (recommended)');
    await wait(300);
    need((await storedSettings(pa))?.language === 'auto', 'auto not stored');
    need((await tabLabels(pa)) === 'Style|Presets|Palette|Settings', `not English: ${await tabLabels(pa)}`);
    await D.chooseOption(settingsSelect(pa), 'Deutsch');
    await wait(300);
    need((await tabLabels(pa)) === 'Stil|Vorlagen|Palette|Einstellungen', `not German again: ${await tabLabels(pa)}`);
    await D.selectTab(pa, 'style');
    need(await hasSection(pa, 'Rahmen & Radius'), `Style tab: ${(await names(pa)).join(' | ')}`);
  });

  await step('no console errors (A)', async () => {
    need(ownErrors(a).length === 0, ownErrors(a).join(' || '));
  });
  await a.close();

  // ------------------------------------------------------------------ B
  const b = await session({ viewport: { width: 1440, height: 900 } });
  all.push(b);
  const pb = b.page;
  await D.gotoDashboard(pb, URLPATH, { engine: false });
  await openEditor(pb);
  await openStudio(pb);
  await step('another device (empty browser storage): no question, German from the HA user', async () => {
    // Watched for 2 s once the panel has opened (the unit tests cover the wait
    // itself): the question must not appear on a second device (answering it
    // would overwrite the stored choice).
    for (let i = 0; i < 20; i++) {
      need(!(await notice(pb).isVisible().catch(() => false)), `question shown again (after ${i * 100} ms)`);
      await wait(100);
    }
    need(await hasSection(pb, 'Rahmen & Radius'), `sections: ${(await names(pb)).join(' | ')}`);
    return 'Rahmen & Radius';
  });
  await step('no console errors (B)', async () => { need(ownErrors(b).length === 0, ownErrors(b).join(' || ')); });
  await b.close();

  // ------------------------------------------------------------------ C
  const c = await session({ haLanguage: 'de', viewport: { width: 390, height: 844 }, hasTouch: true, fresh: true });
  all.push(c);
  const pc = c.page;
  await pc.reload({ waitUntil: 'domcontentloaded' });
  await D.gotoDashboard(pc, URLPATH, { engine: false });
  await openEditor(pc, true);
  await openStudio(pc);
  await step('HA in German, first run at phone width: German before answering, Auto-detect names Deutsch', async () => {
    await notice(pc).waitFor({ state: 'visible', timeout: 10000 });
    const sel = await selectedText(noticeSelect(pc));
    need(sel === 'Automatisch: Deutsch (empfohlen)', `preselected "${sel}"`);
    need(await hasSection(pc, 'Rahmen & Radius'), `sections: ${(await names(pc)).join(' | ')}`);
    return `"${sel}"`;
  });
  await step('the question fits 390px (no sideways overflow)', async () => {
    const box = await notice(pc).evaluate((e) => {
      const r = e.getBoundingClientRect();
      return { left: r.left, right: r.right, sw: e.scrollWidth, cw: e.clientWidth, vw: window.innerWidth };
    });
    need(box.left >= 0 && box.right <= box.vw && box.sw <= box.cw + 1, JSON.stringify(box));
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await notice(pc).scrollIntoViewIfNeeded();
      await pc.screenshot({ path: `${SHOTS}/language-question-de-390.png` });
    }
    return JSON.stringify(box);
  });
  await step('OK keeps Auto-detect', async () => {
    await pc.locator('cms-language-notice').getByRole('button', { name: 'OK' }).click();
    await notice(pc).waitFor({ state: 'hidden', timeout: 5000 });
    const s = await storedSettings(pc);
    need(s?.language === 'auto' && s?.languageChosen === true, JSON.stringify(s));
    need(await hasSection(pc, 'Rahmen & Radius'), 'not German');
  });
  await step('no console errors (C)', async () => { need(ownErrors(c).length === 0, ownErrors(c).join(' || ')); });
} catch (e) {
  results.push(false);
  console.log('FAIL setup -', String(e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  // leave the rig user as the other checks expect it: no stored Studio settings
  for (const h of all) {
    try {
      if (!h.page.isClosed()) { await clearSettings(h.page); break; }
    } catch { /* closed */ }
  }
  try {
    const h = await D.launch({ rig: RIG, ...(tokensFile ? { tokensFile } : {}) });
    await clearSettings(h.page);
    await h.close();
  } catch (e) {
    console.log('WARN could not clear the stored settings:', String(e.message || e));
  }
  for (const h of all) await h.close().catch(() => {});
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

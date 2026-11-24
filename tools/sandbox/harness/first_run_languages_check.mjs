// The one-time language question (v1.0) in every shipped language: with
// Auto-detect and no choice made yet, Home Assistant is switched to each
// language the way its own profile page does it, and the question has to
// follow — its text, the preselected "Auto-detect: <language>" option, and
// the panel around it — without sticking out of the panel.
//   node first_run_languages_check.mjs              (card-mod rig, 1440×900)
//   PHONE=1 node first_run_languages_check.mjs      (390×844, touch)
//   RIG=uix UIX_TOKENS_FILE=/path/tokens.json node first_run_languages_check.mjs
//   ONLY=de,ja node first_run_languages_check.mjs
// Changes the rig user's Home Assistant language (back to English at the end)
// and Studio settings (cleared at the end), so run it on its own.
process.env.CMS_FIRST_RUN = '1'; // keep the question: this check is about it
import * as D from './click-driver.mjs';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const PHONE = process.env.PHONE === '1';
const tokensFile = process.env.TOKENS_FILE || undefined;
const URLPATH = 'qa-first-run';
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

// The shipped languages and their messages, read from the sources.
const i18nDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/i18n');
const codes = [...readFileSync(resolve(i18nDir, 'index.ts'), 'utf8').matchAll(/^ {2}'?([\w-]+)'?: \{ name: '([^']+)'/gm)]
  .map((m) => ({ code: m[1], name: m[2] }));
const msg = (code, key) => {
  const src = readFileSync(resolve(i18nDir, `${code}.ts`), 'utf8');
  const m = new RegExp(`'${key.replace('.', '\\.')}': (['"])((?:\\\\.|(?!\\1).)*)\\1`).exec(src);
  if (!m) throw new Error(`${code}: no ${key}`);
  return m[2].replace(/\\(.)/g, '$1');
};
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const ws = (page, m) => page.evaluate((x) => document.querySelector('home-assistant').hass.connection.sendMessagePromise(x), m);
const clearSettings = async (page) => {
  await ws(page, { type: 'frontend/set_user_data', key: 'cms_settings', value: null });
  await page.evaluate(() => localStorage.removeItem('cms-settings'));
};
/** Home Assistant's own language switch (what its profile page fires). */
const selectHaLanguage = async (page, code) => {
  await page.evaluate((c) => {
    const ha = document.querySelector('home-assistant');
    ha.dispatchEvent(new CustomEvent('hass-language-select', { detail: c, bubbles: true, composed: true }));
  }, code);
  await page.waitForFunction((c) => document.querySelector('home-assistant')?.hass?.language === c, code, { timeout: 20000 });
};

/** The question's box and any of its text drawn outside it or outside the panel. */
const noticeLayout = (page) => page.evaluate(() => {
  const find = (root, tag) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.tagName === tag) return el;
      if (el.shadowRoot) { const f = find(el.shadowRoot, tag); if (f) return f; }
    }
    return null;
  };
  const panel = find(document, 'CMS-PANEL');
  const host = panel && find(panel.shadowRoot || panel, 'CMS-LANGUAGE-NOTICE');
  const box = host?.shadowRoot?.querySelector('.notice');
  if (!box) return { error: 'no question' };
  const pr = panel.getBoundingClientRect();
  const br = box.getBoundingClientRect();
  const out = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) {
          if (r.width > 0 && (r.right > br.right + 1 || r.left < br.left - 1)) out.push(n.textContent.trim().slice(0, 40));
        }
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(box);
  return {
    inside: br.left >= pr.left - 1 && br.right <= pr.right + 1,
    sideways: box.scrollWidth > box.clientWidth + 1,
    out,
    box: [Math.round(br.left), Math.round(br.right)],
    panel: [Math.round(pr.left), Math.round(pr.right)],
  };
});

const h = await D.launch({
  rig: RIG,
  viewport: PHONE ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  hasTouch: PHONE,
  ...(tokensFile ? { tokensFile } : {}),
});
const { page } = h;
/** HA stores the profile language as user data `language`; switching back to
 *  English would leave {language: 'en'} there, which then overrides a
 *  browser's own language choice in later checks (language_check). Put back
 *  exactly what was stored before. */
const userLanguage = (value) => page.evaluate(async (v) => {
  const hass = document.querySelector('home-assistant')?.hass;
  if (!hass) return undefined;
  if (v === undefined) return (await hass.callWS({ type: 'frontend/get_user_data', key: 'language' }))?.value ?? null;
  await hass.callWS({ type: 'frontend/set_user_data', key: 'language', value: v });
  return v;
}, value);
let storedLanguage;
try {
  await clearSettings(page);
  await D.seedDashboard(page, URLPATH, [{ type: 'tile', entity: 'light.ceiling_lights' }]);
  await D.gotoDashboard(page, URLPATH, { engine: false });
  storedLanguage = await userLanguage();
  await D.enterEditMode(page);
  await D.openCardEditor(page, 0);
  await D.openStudio(page);
  const notice = page.locator('cms-language-notice .notice');
  await notice.waitFor({ state: 'visible', timeout: 10000 });

  const list = process.env.ONLY ? codes.filter((c) => process.env.ONLY.split(',').includes(c.code)) : codes;
  for (const { code, name } of list) {
    await step(`${code}: HA in ${name} → the question follows and fits`, async () => {
      await selectHaLanguage(page, code);
      await wait(600);
      need(await notice.isVisible(), 'question gone');
      const text = norm(await notice.locator('.text').innerText());
      const wantText = norm(msg(code, 'settings.noticeText'));
      need(text.includes(wantText), `text "${text.slice(0, 60)}", want "${wantText.slice(0, 60)}"`);
      const sel = norm(await page.locator('cms-language-notice select').evaluate((e) => e.selectedOptions[0]?.textContent));
      const wantSel = norm(msg(code, 'settings.autoWith').replace('{language}', name));
      need(sel === wantSel, `preselected "${sel}", want "${wantSel}"`);
      const ok = norm(await page.locator('cms-language-notice button').first().innerText());
      need(ok === norm(msg(code, 'settings.ok')), `button "${ok}"`);
      const names = (await D.listSections(page)).map((s) => s.name);
      need(names.includes(msg(code, 'border.title')), `panel not in ${name}: ${names.slice(0, 4).join(' | ')}`);
      const l = await noticeLayout(page);
      need(!l.error, l.error);
      need(l.inside && !l.sideways && l.out.length === 0, JSON.stringify(l));
      return `"${sel}"`;
    });
  }

  await step('nothing was stored: the question is still unanswered', async () => {
    const s = (await ws(page, { type: 'frontend/get_user_data', key: 'cms_settings' }))?.value ?? null;
    need(!s || s.languageChosen !== true, JSON.stringify(s));
  });
  await step('no console errors', async () => {
    const own = h.errors.filter((e) => !HA_OWN_ERRORS.some((re) => re.test(e)));
    need(own.length === 0, own.slice(0, 3).join(' || '));
  });
} catch (e) {
  results.push(false);
  console.log('FAIL setup -', String(e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  try { await selectHaLanguage(page, 'en'); } catch (e) { console.log('WARN could not switch Home Assistant back to English:', String(e.message || e)); }
  if (storedLanguage !== undefined) {
    try { await userLanguage(storedLanguage); } catch (e) { console.log('WARN could not restore the stored profile language:', String(e.message || e)); }
  }
  try { await clearSettings(page); } catch { /* closed */ }
  await h.close().catch(() => {});
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

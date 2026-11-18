// The optional Card-Mod Studio integration (v1.0), through Home Assistant's
// own UI with real input: Settings → Devices & services → Add integration →
// Card-Mod Studio → Submit; then Configure (the options dialog) → change the
// language → Submit; the Studio's websocket command returns the options.
//   node integration_check.mjs                  (card-mod rig, tokens.json)
//   TOKENS_FILE=/path/tokens.json node integration_check.mjs
// Needs custom_components/card_mod_studio copied into the rig's config and a
// restart. Leaves the entry in place with its options back on the defaults
// (language Auto-detect, ask each user) unless KEEP_OPTIONS=1.
// Prints PASS/FAIL per step and "N/M checks passed".
process.env.CMS_FIRST_RUN = '1'; // the Studio steps look for the question
import * as D from './click-driver.mjs';

const tokensFile = process.env.TOKENS_FILE || undefined;
const results = [];
const need = (cond, msg) => { if (!cond) throw new Error(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ICON_TITLE = 'Cor do ícone'; // pt-BR 'icon.title' (src/i18n/pt-BR.ts)
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push(true);
    console.log('PASS', name, detail ?? '');
  } catch (e) {
    results.push(false);
    console.log('FAIL', name, '-', String(e.message || e).split('\n')[0]);
    const at = String(e.stack || '').split('\n').find((l) => l.includes('integration_check.mjs'));
    if (at) console.log('     at', at.trim());
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/integration-fail-${results.length}.png` }).catch(() => {});
  }
};
const ws = (page, msg) => page.evaluate((m) => document.querySelector('home-assistant').hass.connection.sendMessagePromise(m), msg);
const entries = (page) => ws(page, { type: 'config_entries/get', domain: 'card_mod_studio' });

const h = await D.launch({ rig: 'cm', ...(tokensFile ? { tokensFile } : {}) });
const { page, ha } = h;
const missing = new Set();
page.on('response', (r) => { if (r.status() === 404) missing.add(r.url()); });
try {
  // A previous run's entry: remove it through the API (fixture), so the add flow runs for real.
  for (const e of await entries(page)) {
    await ws(page, { type: 'config_entries/delete', entry_id: e.entry_id }).catch(() =>
      D.haFetch(h, 'DELETE', `/api/config/config_entries/entry/${e.entry_id}`));
  }

  await step('Add integration → Card-Mod Studio → Submit creates the entry', async () => {
    await page.goto(`${ha}/config/integrations/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /add integration/i }).first().click();
    const search = page.getByRole('textbox', { name: /search/i }).last();
    await search.waitFor({ state: 'visible', timeout: 15000 });
    await search.pressSequentially('Card-Mod Studio', { delay: 20 });
    await page.getByText('Card-Mod Studio', { exact: true }).last().click();
    const submit = page.getByRole('button', { name: /^submit$/i });
    await submit.waitFor({ state: 'visible', timeout: 15000 });
    await submit.click();
    const finish = page.getByRole('button', { name: /^finish$/i });
    await finish.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    if (await finish.isVisible().catch(() => false)) await finish.click();
    const list = await entries(page);
    need(list.length === 1, `${list.length} entries`);
    return list[0].title;
  });

  await step('the loaded integration is listed in hass.config.components', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('home-assistant')?.hass?.config?.components, null, { timeout: 30000 });
    const comps = await page.evaluate(() => document.querySelector('home-assistant').hass.config.components);
    need(comps.includes('card_mod_studio'), 'card_mod_studio not in hass.config.components');
  });

  await step('a second Add is refused (single entry)', async () => {
    const r = await ws(page, { type: 'config_entries/flow/progress' }).catch(() => []);
    const res = await page.evaluate(async () => {
      const hass = document.querySelector('home-assistant').hass;
      const r = await hass.callApi('POST', 'config/config_entries/flow', { handler: 'card_mod_studio', show_advanced_options: false });
      return r;
    });
    need(res.type === 'abort' && res.reason === 'single_instance_allowed', JSON.stringify(res).slice(0, 200));
    return `${res.reason} (${r.length} flows open)`;
  });

  await step('the Studio command answers with the defaults', async () => {
    const c = await ws(page, { type: 'card_mod_studio/config' });
    need(c.configured === true && c.language === 'auto' && c.ask_language === true && c.on_color === null, JSON.stringify(c));
    return JSON.stringify(c);
  });

  await step('Configure → options dialog: Language Português (Brasil), ON colour Green, ask off → Submit; open subscriptions get it', async () => {
    await page.goto(`${ha}/config/integrations/integration/card_mod_studio`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('home-assistant')?.hass?.connection, null, { timeout: 30000 });
    // listen like the Studio does: a subscription that gets every change
    await page.evaluate(() => {
      window.__cmsPushes = [];
      document.querySelector('home-assistant').hass.connection.subscribeMessage(
        (m) => window.__cmsPushes.push(m), { type: 'card_mod_studio/subscribe' });
    });
    const configure = page.getByRole('button', { name: /^configure$/i }).first();
    // HA 2025.9 can show "No entries" for a moment after a fresh entry: reload once
    if (!(await configure.waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false))) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await configure.waitFor({ state: 'visible', timeout: 40000 });
    }
    await page.waitForTimeout(1000);
    try {
      await configure.click({ timeout: 10000 });
    } catch (e) {
      if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/integration-configure.png` });
      throw e;
    }
    const dialog = page.locator('dialog-data-entry-flow');
    await dialog.getByText('Card-Mod Studio settings').first().waitFor({ state: 'visible', timeout: 15000 });
    // HA's dropdowns: click the field, then the option in the list that opens
    const choose = async (label, option) => {
      const field = dialog.locator('ha-select').filter({ hasText: label }).first();
      await field.click();
      // HA 2026.11: menu items inside the select; older HA: list options
      const item = field.getByRole('menuitem', { name: option, exact: true })
        .or(page.getByRole('option', { name: option, exact: true })).first();
      try {
        await item.click({ timeout: 8000 });
      } catch (e) {
        if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/integration-${label}.png` });
        throw new Error(`${label} → ${option}: ${String(e.message).split('\n')[0]}`);
      }
      await page.waitForTimeout(300);
    };
    await choose('Language', 'Português (Brasil)'); // a code with a region: pt-br in HA, pt-BR in the Studio
    await choose('Default ON colour', 'Green');
    await dialog.locator('ha-switch').first().click(); // Ask each user: off
    await dialog.getByRole('button', { name: /^submit$/i }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    const c = await ws(page, { type: 'card_mod_studio/config' });
    need(c.language === 'pt-br' && c.ask_language === false && c.on_color === 'var(--green-color)' && c.off_color === null, JSON.stringify(c));
    const pushes = await page.evaluate(() => window.__cmsPushes);
    need(pushes.length >= 2 && pushes.at(-1).language === 'pt-br', `pushes ${JSON.stringify(pushes)}`);
    return `${JSON.stringify(c)}; ${pushes.length} pushes, last language ${pushes.at(-1).language}`;
  });

  await step('the Studio follows the admin: Português (Brasil), no question, ON colour Green', async () => {
    // a user who never chose (no stored Studio settings)
    await ws(page, { type: 'frontend/set_user_data', key: 'cms_settings', value: null });
    await page.evaluate(() => localStorage.removeItem('cms-settings'));
    await D.seedDashboard(page, 'qa-integration', [{ type: 'tile', entity: 'light.ceiling_lights' }]);
    await D.gotoDashboard(page, 'qa-integration', { engine: false });
    await D.enterEditMode(page);
    await D.openCardEditor(page, 0);
    await D.openStudio(page);
    await page.waitForTimeout(1500);
    const names = (await D.listSections(page)).map((x) => x.name);
    need(names.includes(ICON_TITLE), `sections: ${names.join(' | ')}`);
    need(!(await page.locator('cms-language-notice .notice').isVisible().catch(() => false)), 'question shown although the admin turned it off');
    await D.setSectionEnabled(page, ICON_TITLE, true);
    await page.waitForTimeout(500);
    const on = await page.evaluate(() => {
      const find = (root) => {
        for (const el of root.querySelectorAll('*')) {
          if (el.tagName === 'CMS-PANEL') return el;
          if (el.shadowRoot) { const f = find(el.shadowRoot); if (f) return f; }
        }
        return null;
      };
      return find(document)?._studioState?.iconColor?.colorOn;
    });
    need(on === 'var(--green-color)', `Icon Color starts from ${on}`);
    await D.cancelCard(page);
    return `sections Português (Brasil), Icon Color ON = ${on}`;
  });

  await step('no console errors', async () => {
    // The rig is offline: Home Assistant's own brand icons come from its CDN and 404 here.
    // Before HA 2026.x, icons come from brands.home-assistant.io only — a custom
    // integration not listed there has none (ours on HA 2025.9).
    const ours = [...missing].map((u) => new URL(u)).filter((u) => u.hostname !== 'brands.home-assistant.io'
      && (!u.pathname.startsWith('/api/brands/') || u.pathname.includes('/card_mod_studio/'))).map((u) => u.pathname);
    // …and card-mod's theme wait on HA 2026.11 (docs/research/2026-11-v0.11.0-release-qa.md)
    const errs = h.errors.filter((e) => !/status of 404/.test(e) && !/themesReady: Timeout/.test(e)
      // the 2025.9 rig's demo media players: HA's image proxy can't fetch their artwork offline
      && !/status of 500/.test(e) && !/Error getting Image Colors.*media_player_proxy/.test(e));
    need(ours.length === 0 && errs.length === 0, `${[...new Set(errs)].join(' || ')} — 404s: ${ours.join(', ')}`);
  });
} catch (e) {
  results.push(false);
  console.log('FAIL setup -', String(e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  if (process.env.KEEP_OPTIONS !== '1') {
    // back to the defaults so the other checks see Auto-detect (fixture reset)
    for (const e of await entries(page).catch(() => [])) {
      await page.evaluate(async (id) => {
        const hass = document.querySelector('home-assistant').hass;
        const f = await hass.callApi('POST', 'config/config_entries/options/flow', { handler: id });
        await hass.callApi('POST', `config/config_entries/options/flow/${f.flow_id}`, { language: 'auto', ask_language: true, on_color: 'default', off_color: 'default' });
      }, e.entry_id).catch((err) => console.log('WARN reset options:', String(err)));
    }
  }
  await h.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

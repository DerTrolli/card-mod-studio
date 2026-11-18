// The Studio in Home Assistant's "Section configuration" dialog (sections
// views, v1.0) with real input: section menu → Edit → 🎨 Style → a card inside
// the section gets its own styling section; Background Red on the tile →
// Save → saved into that card of the section; the tile is red on the
// dashboard; reopened, the module reads back.
//   node sections_check.mjs                  (card-mod rig)
//   RIG=uix UIX_TOKENS_FILE=/path/tokens.json node sections_check.mjs
// Prints PASS/FAIL per step and "N/M checks passed".
import * as D from './click-driver.mjs';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const URLPATH = 'qa-sections';
const results = [];
const need = (cond, msg) => { if (!cond) throw new Error(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const h = await D.launch({ rig: RIG, ...(process.env.TOKENS_FILE ? { tokensFile: process.env.TOKENS_FILE } : {}) });
const { page } = h;
const KEY = h.styleKey;
const dialog = () => page.locator('hui-dialog-edit-section');
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push(true);
    console.log('PASS', name, detail ?? '');
  } catch (e) {
    results.push(false);
    console.log('FAIL', name, '-', String(e.message || e).split('\n')[0]);
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/sections-fail-${results.length}.png` }).catch(() => {});
    await dialog().getByRole('button', { name: 'Cancel', exact: true }).click().catch(() => {});
  }
};
const savedSection = () => page.evaluate(async (url) => {
  const cfg = await document.querySelector('home-assistant').hass.callWS({ type: 'lovelace/config', url_path: url });
  return cfg.views[0].sections[0];
}, URLPATH);
const tileBg = () => page.evaluate(() => {
  const walk = (root, acc) => { for (const el of root.querySelectorAll('*')) { acc.push(el); if (el.shadowRoot) walk(el.shadowRoot, acc); } return acc; };
  const tile = walk(document, []).find((e) => e.tagName === 'HUI-TILE-CARD' && !e.closest?.('hui-dialog-edit-section'));
  const ha = tile?.shadowRoot?.querySelector('ha-card');
  return ha ? getComputedStyle(ha).backgroundColor : null;
});
const openSectionDialog = async () => {
  const menu = page.locator('hui-section-edit-mode').getByRole('button', { name: 'Menu' }).first();
  if (await menu.isVisible().catch(() => false)) {
    // HA 2026.x: the section's menu → Edit
    await menu.click();
    await page.getByRole('menuitem', { name: /^edit$/i }).first().click();
  } else {
    // Older HA (2025.9, 2026.2): a toolbar on the section (drag, pencil,
    // delete) with unlabelled buttons — the pencil is the one that opens it
    const buttons = page.locator(':is(hui-section-edit-mode, hui-sections-view .section-header) ha-icon-button');
    const n = await buttons.count();
    for (let k = 0; k < n; k++) {
      const path = await buttons.nth(k).evaluate((e) => e.path ?? e.getAttribute('path') ?? '');
      if (!/^M20\.71,7\.04/.test(path)) continue; // mdiPencil
      await buttons.nth(k).click();
      break;
    }
  }
  await dialog().waitFor({ state: 'attached', timeout: 15000 });
  await dialog().getByRole('button', { name: 'Save', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await wait(1000);
  return await dialog().evaluate((d) => !!d.shadowRoot?.querySelector('.content > .element-editor'));
};

try {
  await D.seedSectionsDashboard(page, URLPATH, [[
    { type: 'heading', heading: 'QA section' },
    { type: 'tile', entity: 'light.ceiling_lights' },
  ]]);
  await D.gotoDashboard(page, URLPATH, { engine: false });
  await D.enterEditMode(page);

  // Older Home Assistant (2025.9, 2026.2) has a small "Edit section" dialog
  // without an editor column or preview: the Studio is not offered there.
  const newLayout = await openSectionDialog();
  if (!newLayout) {
    await step('older "Edit section" dialog: no Style button, the dialog still saves', async () => {
      need(!(await dialog().locator('cms-tab-button').count()), 'Style button shown in the older dialog');
      await dialog().getByRole('button', { name: 'Save', exact: true }).click();
      await dialog().waitFor({ state: 'hidden', timeout: 10000 });
      return 'not offered (as designed)';
    });
    await step('no console errors', async () => {
      const errs = h.errors.filter((e) => !/themesReady: Timeout|status of 50[02]|Error getting Image Colors|Transition was skipped|Failure writing unhandled promise rejection/.test(e));
      need(errs.length === 0, errs.slice(0, 3).join(' || '));
    });
    throw Object.assign(new Error('done'), { done: true });
  }

  await step('section menu → Edit: the dialog has a 🎨 Style button; it opens the Studio in place of the form, with room', async () => {
    await dialog().locator('cms-tab-button').first().waitFor({ state: 'visible', timeout: 15000 });
    await dialog().locator('cms-tab-button button').first().click();
    await page.locator('#cms-section-panel').waitFor({ state: 'visible', timeout: 10000 });
    const formHidden = await dialog().locator('hui-section-settings-editor').evaluate((e) => getComputedStyle(e).display === 'none');
    const panelH = await page.locator('#cms-section-panel').evaluate((e) => Math.round(e.getBoundingClientRect().height));
    need(formHidden && panelH > 450, JSON.stringify({ formHidden, panelH }));
    const banner = await page.locator('#cms-section-panel').locator('.info-banner, .layout-banner, [class*=banner]').allInnerTexts();
    need(banner.some((b) => /Section — style each card below/.test(b) && /:host/.test(b)), banner.join(' || ').slice(0, 200));
    const names = (await D.listSections(page)).map((s) => s.name);
    need(names.some((n) => /^1\. heading/.test(n)) && names.some((n) => /^2\. tile/.test(n)), names.join(' | '));
    return names.filter((n) => /^\d\./.test(n)).join(' | ');
  });

  await step('Background Red on the tile inside → Save → saved into that card of the section', async () => {
    const tile = (await D.listSections(page)).find((s) => /^2\. tile/.test(s.name));
    await D.expandSection(page, tile.index);
    const bgSec = (await D.listSections(page)).find((s) => s.name === 'Background' && s.parent === tile.index);
    need(bgSec, 'no Background inside the tile section');
    await D.setSectionEnabled(page, bgSec.index, true);
    await D.pickSwatch(await D.findControl(page, bgSec.index, 'Color'), 'Red');
    const save = dialog().getByRole('button', { name: 'Save', exact: true });
    need(await save.isEnabled(), 'Save stayed disabled (the dialog did not see the change)');
    await save.click();
    await dialog().waitFor({ state: 'hidden', timeout: 15000 });
    const sec = await savedSection();
    const css = sec.cards?.[1]?.[KEY]?.style ?? '';
    need(/background: var\(--red-color\)/.test(css), JSON.stringify(sec));
    need(sec.type === 'grid' && sec.cards.length === 2 && !sec[KEY], JSON.stringify(sec));
    return css.replace(/\n/g, ' ');
  });

  await step('on the dashboard the tile in the section is red', async () => {
    await D.exitEditMode(page).catch(() => {});
    let v;
    for (let i = 0; i < 30; i++) { v = await tileBg(); if (v === 'rgb(244, 67, 54)') return v; await wait(400); }
    throw new Error(`tile background ${v}`);
  });

  await step('reopened: the tile’s Background is on and Red; Cancel changes nothing', async () => {
    await D.enterEditMode(page);
    await openSectionDialog();
    await dialog().locator('cms-tab-button button').first().click();
    await page.locator('#cms-section-panel').waitFor({ state: 'visible', timeout: 10000 });
    const tile = (await D.listSections(page)).find((s) => /^2\. tile/.test(s.name));
    await D.expandSection(page, tile.index);
    const bg = (await D.listSections(page)).find((s) => s.name === 'Background' && s.parent === tile.index);
    need(bg?.enabled === true, `Background enabled=${bg?.enabled}`);
    const before = JSON.stringify(await savedSection());
    await dialog().getByRole('button', { name: 'Cancel', exact: true }).click();
    await dialog().waitFor({ state: 'hidden', timeout: 10000 });
    need(JSON.stringify(await savedSection()) === before, 'config changed on Cancel');
  });

  await step('no console errors', async () => {
    const errs = h.errors.filter((e) => !/themesReady: Timeout|status of 50[02]|Error getting Image Colors|Transition was skipped/.test(e));
    need(errs.length === 0, errs.slice(0, 3).join(' || '));
  });
} catch (e) {
  if (e?.done) { /* older layout: its steps ran above */ } else {
  results.push(false);
  console.log('FAIL setup -', String(e.stack || e).split('\n').slice(0, 3).join(' | '));
  }
} finally {
  await h.close().catch(() => {});
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

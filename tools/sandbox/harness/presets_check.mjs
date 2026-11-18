// My Presets (v1.0) through the real card editor with real input: rename,
// reorder, duplicate and delete presets; copy one card's style and paste it
// onto another card; copy all presets and paste them back.
//   node presets_check.mjs                    (card-mod rig)
//   RIG=uix UIX_TOKENS_FILE=/path/tokens.json node presets_check.mjs
// Changes the rig user's stored presets (restored at the end).
// Prints PASS/FAIL per step and "N/M checks passed".
import * as D from './click-driver.mjs';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const URLPATH = 'qa-presets';
const results = [];
const need = (cond, msg) => { if (!cond) throw new Error(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const h = await D.launch({ rig: RIG, ...(process.env.TOKENS_FILE ? { tokensFile: process.env.TOKENS_FILE } : {}) });
const { page } = h;
const KEY = h.styleKey;
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push(true);
    console.log('PASS', name, detail ?? '');
  } catch (e) {
    results.push(false);
    console.log('FAIL', name, '-', String(e.message || e).split('\n')[0]);
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/presets-fail-${results.length}.png` }).catch(() => {});
  }
};
const ws = (msg) => page.evaluate((m) => document.querySelector('home-assistant').hass.connection.sendMessagePromise(m), msg);
const stored = async () => ((await ws({ type: 'frontend/get_user_data', key: 'cms_presets' }))?.value ?? []).map((p) => p.name);
const mgr = () => page.locator('cms-preset-manager');
const rows = async () => mgr().locator('.preset-row input').evaluateAll((els) => els.map((e) => e.value));
const until = async (fn, what, ms = 8000) => {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last === true) return;
    await wait(200);
  }
  throw new Error(`${what} (last: ${JSON.stringify(last)})`);
};
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b) || a;

// fixture: the user's presets are saved and replaced by two known ones
const before = (await ws({ type: 'frontend/get_user_data', key: 'cms_presets' }))?.value ?? null;
try {
  await page.evaluate(() => localStorage.removeItem('cms-presets'));
  await D.seedDashboard(page, URLPATH, [
    { type: 'tile', entity: 'light.ceiling_lights' },
    { type: 'tile', entity: 'light.bed_light' },
  ]);
  await D.gotoDashboard(page, URLPATH, { engine: false });
  await D.enterEditMode(page);
  await D.openCardEditor(page, 0);
  await D.openStudio(page);

  // two presets saved the normal way (preset bar)
  for (const name of ['A', 'B']) {
    await page.locator('cms-panel .btn-preset-save').first().click();
    await page.locator('cms-panel input.preset-name').pressSequentially(name);
    await page.locator('cms-panel input.preset-name').press('Enter');
    await wait(500);
  }
  await until(async () => sameList(await stored(), ['A', 'B']), 'stored after saving A and B');

  await step('My Presets lists them in order', async () => {
    await mgr().locator('.module-header').click();
    await until(async () => sameList(await rows(), ['A', 'B']), 'rows');
  });

  await step('rename A → Alpha (type, Enter): stored, same place, preset bar follows', async () => {
    const input = mgr().locator('.preset-row input').first();
    await input.click({ clickCount: 3 });
    await input.pressSequentially('Alpha');
    await input.press('Enter');
    await until(async () => sameList(await stored(), ['Alpha', 'B']), 'stored');
    const opts = await page.locator('cms-panel .preset-bar select option').evaluateAll((els) => els.map((e) => e.value).filter(Boolean));
    need(sameList(opts, ['Alpha', 'B']) === true, `bar ${opts}`);
  });

  await step('a taken name is refused and explained', async () => {
    const input = mgr().locator('.preset-row input').nth(1);
    await input.click({ clickCount: 3 });
    await input.pressSequentially('Alpha');
    await input.press('Enter');
    await wait(400);
    need(sameList(await stored(), ['Alpha', 'B']) === true, `stored ${await stored()}`);
    need((await mgr().locator('.note-error').innerText()).includes('Alpha'), 'no message');
    need((await rows())[1] === 'B', 'field not reverted');
  });

  await step('↑ moves B to the top', async () => {
    await mgr().getByRole('button', { name: 'Move B up' }).click();
    await until(async () => sameList(await stored(), ['B', 'Alpha']), 'stored');
  });

  await step('⧉ duplicates Alpha right after it', async () => {
    await mgr().getByRole('button', { name: 'Duplicate Alpha' }).click();
    await until(async () => sameList(await stored(), ['B', 'Alpha', 'Alpha (copy)']), 'stored');
  });

  await step('× deletes in two clicks', async () => {
    const del = mgr().getByRole('button', { name: 'Delete Alpha (copy)' });
    await del.click();
    await mgr().getByRole('button', { name: /Delete Alpha \(copy\)\? / }).click();
    await until(async () => sameList(await stored(), ['B', 'Alpha']), 'stored');
  });

  let styleText = '';
  await step("copy this card's style (Border on) gives the text", async () => {
    await D.setSectionEnabled(page, 'Border & Radius', true);
    await mgr().getByRole('button', { name: /Copy this card's style/ }).click();
    const area = mgr().locator('textarea.export');
    await area.waitFor({ state: 'visible', timeout: 5000 });
    styleText = await area.inputValue();
    const obj = JSON.parse(styleText);
    need(obj.type === 'style' && obj.state.border.enabled === true, styleText.slice(0, 200));
    return (await mgr().locator('.note-ok').first().innerText()).slice(0, 80);
  });

  await D.cancelCard(page);

  await step('paste it on the second card → Border on, saved with the card', async () => {
    await D.openCardEditor(page, 1);
    await D.openStudio(page);
    await mgr().locator('.module-header').click();
    const area = mgr().locator('#cms-paste');
    await area.click();
    await page.keyboard.insertText(styleText); // what a paste does
    await mgr().getByRole('button', { name: /Apply/ }).click();
    await wait(600);
    const border = (await D.listSections(page)).find((s) => s.name === 'Border & Radius');
    need(border?.enabled === true, `Border ${border?.enabled}`);
    await D.saveCard(page);
    const cards = await D.savedCards(page, URLPATH);
    need(/border/.test(cards[1]?.[KEY]?.style ?? ''), `saved ${JSON.stringify(cards[1]?.[KEY])}`);
    return 'border saved';
  });

  await step('copy all presets, then paste them into an empty list', async () => {
    await D.openCardEditor(page, 0);
    await D.openStudio(page);
    await mgr().locator('.module-header').click();
    await mgr().getByRole('button', { name: /Copy all presets/ }).click();
    const text = await mgr().locator('textarea.export').inputValue();
    // empty the list through the UI (two deletes)
    for (const name of ['B', 'Alpha']) {
      await mgr().getByRole('button', { name: `Delete ${name}` }).click();
      await mgr().getByRole('button', { name: new RegExp(`Delete ${name}\\? `) }).click();
      await wait(400);
    }
    await until(async () => sameList(await stored(), []), 'emptied');
    await mgr().locator('#cms-paste').click();
    await page.keyboard.insertText(text);
    await mgr().getByRole('button', { name: /Apply/ }).click();
    await until(async () => sameList(await stored(), ['B', 'Alpha']), 'stored after paste');
    return await mgr().locator('.note-ok').last().innerText();
  });

  await step('pasting something else explains, changes nothing', async () => {
    await mgr().locator('#cms-paste').click();
    await page.keyboard.insertText('ha-card { color: red; }');
    await mgr().getByRole('button', { name: /Apply/ }).click();
    need((await mgr().locator('.note-error').last().innerText()).length > 10, 'no message');
    need(sameList(await stored(), ['B', 'Alpha']) === true, 'list changed');
    await D.cancelCard(page);
  });

  await step('no console errors', async () => {
    const errs = h.errors.filter((e) => !/themesReady: Timeout/.test(e));
    need(errs.length === 0, errs.join(' || '));
  });
} catch (e) {
  results.push(false);
  console.log('FAIL setup -', String(e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  await ws({ type: 'frontend/set_user_data', key: 'cms_presets', value: before }).catch(() => {});
  await page.evaluate(() => localStorage.removeItem('cms-presets')).catch(() => {});
  await h.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

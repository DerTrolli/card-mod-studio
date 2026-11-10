// End-to-end proof of click-driver.mjs on one rig, with real input only.
//   RIG=cm  node click_driver_smoke.mjs     (card-mod rig, tokens.json)
//   RIG=uix UIX_TOKENS_FILE=/path/tokens.json node click_driver_smoke.mjs
// env: QA_OUT (screenshot dir, default shots/click-smoke/<rig>)
// Prints PASS/FAIL per step; exits 1 when any step fails.
import { resolve, dirname } from 'node:path';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as D from './click-driver.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const OUT = resolve(process.env.QA_OUT || resolve(HERE, 'shots', 'click-smoke', RIG));
rmSync(OUT, { recursive: true, force: true });
const URLPATH = 'qa-smoke';
const ENTITY = 'light.ceiling_lights';
const results = [];
let n = 0;
const png = (name) => resolve(OUT, `${String(++n).padStart(2, '0')}-${name}.png`);

const h = await D.launch({ rig: RIG });
const { page } = h;
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, pass: true });
    console.log('PASS', name, detail ?? '');
  } catch (e) {
    results.push({ name, pass: false });
    console.log('FAIL', name, '-', String(e.message || e).split('\n')[0]);
    await D.shot(page, png('FAIL-' + name.replace(/\W+/g, '_'))).catch(() => {});
    throw e;
  }
};
const hex = (v) => String(v).toLowerCase();
const CARD_PATH = ['hui-tile-card', 'ha-card'];
const COLOR = '#ff0000';
const RADIUS = 24;

const control = async (section, label) => {
  const c = (await D.listControls(page, section)).find((x) => x.label.includes(label));
  if (!c) throw new Error(`control "${label}" not found in "${section}"`);
  return c;
};
const enableAndExpand = async (title) => {
  await D.setSectionEnabled(page, title, true);
  await D.expandSection(page, title);
};

try {
  await step('seed dashboard (fixture)', async () => {
    await D.seedDashboard(page, URLPATH, [{ type: 'tile', entity: ENTITY }, { type: 'button', entity: ENTITY }]);
  });
  let base;
  await step('load dashboard, 2 cards rendered', async () => {
    await D.gotoDashboard(page, URLPATH);
    await D.settle(page, 800);
    const cnt = await page.locator('hui-masonry-view .column > hui-card').count();
    if (cnt !== 2) throw new Error(`expected 2 cards, got ${cnt}`);
    base = {
      bg: await D.computedStyle(page, 0, CARD_PATH, 'background-color'),
      radius: await D.computedStyle(page, 0, CARD_PATH, 'border-top-left-radius'),
      filter: await D.computedStyle(page, 0, CARD_PATH, 'filter'),
    };
    await D.shot(page, png('dashboard-before'));
    return JSON.stringify(base);
  });
  await step('enter edit mode by clicks', async () => { await D.enterEditMode(page); await D.shot(page, png('edit-mode')); });
  await step('open tile card editor by click', async () => { await D.openCardEditor(page, 0); await D.shot(page, png('card-editor')); });
  await step('open Studio by click', async () => {
    const panel = await D.openStudio(page);
    const secs = await D.listSections(page);
    await D.shot(page, png('studio-open'));
    if (!(await panel.isVisible())) throw new Error('panel not visible');
    return `${secs.length} sections: ${secs.map((s) => s.name).join(', ')}`;
  });
  await step('colour: Background > Color = ' + COLOR + ' (text field)', async () => {
    await enableAndExpand('Background');
    const c = await control('Background', 'Color');
    const v = await D.setColor(c, COLOR);
    if (hex(v) !== COLOR) throw new Error(`picker value ${v}`);
    await D.shot(page, png('after-colour'));
    return v;
  });
  await step(`slider: Border radius = ${RADIUS} (mouse + arrows)`, async () => {
    await enableAndExpand('Border');
    const c = await control('Border', 'Border radius');
    const v = await D.setSlider(c, RADIUS);
    await D.shot(page, png('after-slider'));
    return v;
  });
  await step('toggle: Visual Filters > Grayscale on (click)', async () => {
    await enableAndExpand('Visual Filters');
    const c = await control('Visual Filters', 'Grayscale');
    const v = await D.toggle(c, true);
    await D.shot(page, png('after-toggle'));
    return v;
  });
  await step('select: Visual Filters > Apply when = Always (focus + arrow keys)', async () => {
    // the default "Only while entity is OFF" would not show on this lit light
    const c = await control('Visual Filters', 'Apply when');
    const v = await D.chooseOption(c, 'Always');
    await D.shot(page, png('after-select'));
    return v;
  });
  await step('controls re-listed show the new values', async () => {
    const bg = await control('Background', 'Color');
    const rad = await control('Border', 'Border radius');
    const gs = await control('Visual Filters', 'Grayscale');
    if (hex(bg.value) !== COLOR || rad.value !== RADIUS || gs.value !== true) throw new Error(JSON.stringify([bg.value, rad.value, gs.value]));
  });
  await step('Save in the dialog', async () => { await D.saveCard(page); await D.shot(page, png('after-save')); });
  await step('stored config has the style', async () => {
    const cards = await D.savedCards(page, URLPATH);
    const st = cards[0]?.[h.styleKey]?.style;
    if (!st) throw new Error('no ' + h.styleKey + ' in ' + JSON.stringify(cards[0]));
    return JSON.stringify(st).slice(0, 120);
  });
  await step('Done (exit edit mode)', async () => { await D.exitEditMode(page); await D.shot(page, png('after-done')); });
  const verify = async () => {
    await D.waitForComputed(page, 0, CARD_PATH, 'background-color', 'rgb(255, 0, 0)', { timeout: 20000 });
    await D.waitForComputed(page, 0, CARD_PATH, 'border-top-left-radius', `${RADIUS}px`, { timeout: 5000 });
    await D.waitForComputed(page, 0, CARD_PATH, 'filter', /grayscale/, { timeout: 5000 });
    const other = await D.computedStyle(page, 1, ['hui-button-card', 'ha-card'], 'background-color');
    return `bg=rgb(255,0,0) radius=${RADIUS}px filter=grayscale; untouched button card bg=${other}`;
  };
  await step('rendered card shows the style (computed)', async () => { const d = await verify(); await D.shot(page, png('dashboard-after')); return d; });
  await step('reload: style still applied', async () => {
    await D.gotoDashboard(page, URLPATH);
    const d = await verify();
    await D.shot(page, png('dashboard-reloaded'));
    return d;
  });
  await step('reopen editor + Studio by click; controls show saved values', async () => {
    await D.enterEditMode(page);
    await D.openCardEditor(page, 0);
    await D.openStudio(page);
    await D.expandSection(page, 'Background');
    await D.expandSection(page, 'Border');
    await D.expandSection(page, 'Visual Filters');
    const bg = await control('Background', 'Color');
    const rad = await control('Border', 'Border radius');
    const gs = await control('Visual Filters', 'Grayscale');
    await D.shot(page, png('studio-reopened'));
    if (hex(bg.value) !== COLOR || rad.value !== RADIUS || gs.value !== true) throw new Error(JSON.stringify([bg.value, rad.value, gs.value]));
    return JSON.stringify([bg.value, rad.value, gs.value]);
  });
  await step('close Studio, Cancel, Done', async () => {
    await D.closeStudio(page);
    await D.cancelCard(page);
    await D.exitEditMode(page);
    await D.shot(page, png('end'));
  });
} catch (e) { /* reported by step() */ }

const real = h.errors.filter((e) => !/Failed to load resource|ResizeObserver/.test(e));
console.log(`page/console errors: ${h.errors.length} (${real.length} non-resource)`);
real.slice(0, 8).forEach((e) => console.log('  ', e.slice(0, 200)));
await h.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${RIG}: ${results.length - failed.length}/${results.length} steps passed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);

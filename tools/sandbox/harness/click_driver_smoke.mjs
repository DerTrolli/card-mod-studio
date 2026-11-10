// End-to-end proof of click-driver.mjs on one rig, with real input only.
//   RIG=cm  node click_driver_smoke.mjs     (card-mod rig, tokens.json)
//   RIG=uix UIX_TOKENS_FILE=/path/tokens.json node click_driver_smoke.mjs
// env: QA_OUT (screenshot dir, default shots/click-smoke/<rig>)
// Covers every helper: the original 17 steps, then REST fixtures, index/name/predicate card addressing in a
// 3-column masonry view, compact colour pickers (Tab / Enter once / swatch / invalid), the HA entity picker,
// cancelCard with the preset-name field open, entity-row and stack-child headers, a sections view, a phone tap.
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

  // ---- second round: addressing, compact pickers, entity picker, sections, REST, touch ----
  const MULTI = 'qa-smoke-multi';
  // observation: the config the open card editor holds (hui-card-element-editor.value)
  const dialogConfig = () => page.evaluate(() => {
    const st = [document.body];
    while (st.length) {
      const n = st.pop();
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'HUI-CARD-ELEMENT-EDITOR') return n.value ?? null;
      for (const k of [...(n.shadowRoot ? n.shadowRoot.children : []), ...n.children]) st.push(k);
    }
    return null;
  });
  const dialogOpen = () => page.locator('hui-dialog-edit-card').getByRole('button', { name: 'Save', exact: true }).isVisible().catch(() => false);
  const popoverOpen = () => page.locator('.popover').first().isVisible().catch(() => false);
  await step('REST fixture: setState + haFetch read back', async () => {
    await D.setState(h, 'sensor.qa_smoke', '42', { unit_of_measurement: '%', friendly_name: 'QA smoke' });
    const st = await D.haFetch(h, 'GET', '/api/states/sensor.qa_smoke');
    if (st.state !== '42') throw new Error('state ' + st.state);
    return `sensor.qa_smoke=${st.state}`;
  });
  await step('seed 8 cards (masonry lays out columns) and load', async () => {
    const cards = [0, 1, 2, 3, 4].map((i) => ({ type: 'tile', entity: ENTITY, name: `Card ${i}` }));
    cards.push({ type: 'gauge', entity: 'sensor.qa_smoke', name: 'Gauge card' });
    cards.push({ type: 'entities', title: 'Rows card', entities: ['light.ceiling_lights', 'light.bed_light', 'switch.decorative_lights'] });
    cards.push({ type: 'vertical-stack', cards: [{ type: 'tile', entity: ENTITY }, { type: 'tile', entity: 'light.bed_light' }] });
    await D.seedDashboard(page, MULTI, cards);
    await D.gotoDashboard(page, MULTI);
    const cols = await page.locator('hui-masonry-view .column').count();
    const c5 = await D.findCard(page, 5);
    if (c5.config.name !== 'Gauge card') throw new Error('index 5 resolved to ' + JSON.stringify(c5.config));
    return `${cols} columns; index 5 = ${c5.config.name}`;
  });
  await step('address cards by index, by name, by predicate', async () => {
    const t3 = await D.computedStyle(page, 'Card 3', ['hui-tile-card', 'ha-card'], 'border-top-left-radius');
    const byPred = await D.cardAt(page, (c) => c.type === 'entities');
    const byIdx = await D.dashboardCard(page, 4).style(['hui-tile-card', 'ha-card'], 'border-top-left-radius');
    const c2 = await D.cardAt(page, 'Card 2');
    const txt = await c2.locator.evaluate((e) => e.firstElementChild?.shadowRoot?.textContent || '');
    if (!/Card 2/.test(txt)) throw new Error('"Card 2" element shows: ' + txt.replace(/\s+/g, ' ').slice(0, 60));
    return `radius Card 3=${t3} Card 4=${byIdx}; predicate -> index ${byPred.index}`;
  });
  await step('open the gauge editor BY NAME (columns do not matter)', async () => {
    await D.enterEditMode(page);
    await D.openCardEditor(page, { name: 'Gauge card' });
    const cfg = await dialogConfig();
    if (cfg?.name !== 'Gauge card') throw new Error('dialog holds ' + JSON.stringify(cfg));
    await D.openStudio(page);
    return 'dialog card = ' + cfg.name;
  });
  await step('compact colour pickers: rule colour (Tab), Default color (Enter once), swatch - dialog stays open', async () => {
    await enableAndExpand('Threshold Colors');
    const add = await D.findControl(page, 'Threshold Colors', '+ Add Rule');
    await add.locator.click();
    await D.settle(page, 300);
    const compact = (await D.listControls(page, 'Threshold Colors')).filter((c) => c.kind === 'color' && c.meta.compact);
    if (compact.length < 2) throw new Error(`expected >=2 compact colour pickers, got ${compact.length}`);
    const v1 = await D.setColor(compact[0], '#00aa00');
    if (!(await dialogOpen())) throw new Error('dialog closed after setColor (Tab)');
    const dflt = () => D.findControl(page, 'Threshold Colors', 'Default color');
    const v2 = await D.setColor(await dflt(), '#123456', { commit: 'Enter' });
    if (!(await dialogOpen())) throw new Error('dialog closed after setColor (Enter)');
    if (await popoverOpen()) throw new Error('popover still open');
    const v3 = await D.pickSwatch(await dflt(), 'Red');
    if (!(await dialogOpen())) throw new Error('dialog closed after pickSwatch');
    await D.shot(page, png('compact-pickers'));
    return `${v1} ${v2} swatch=${v3}`;
  });
  await step('invalid colour: setColor throws, popover closed by its trigger, dialog stays open', async () => {
    const dflt = await D.findControl(page, 'Threshold Colors', 'Default color');
    let err = null;
    try { await D.setColor(dflt, 'not-a-colour'); } catch (e) { err = e; }
    if (!err) throw new Error('setColor accepted an invalid colour');
    if (!(await dialogOpen())) throw new Error('dialog closed');
    if (await popoverOpen()) throw new Error('popover left open');
    return err.message.slice(0, 100);
  });
  await step('pickEntity: Threshold entity -> sensor.outside_humidity (exact option)', async () => {
    const ent = (await D.listControls(page, 'Threshold Colors')).find((c) => c.kind === 'entity');
    const v = await D.pickEntity(ent, 'sensor.outside_humidity');
    if (v !== 'sensor.outside_humidity') throw new Error(v);
    if (!(await dialogOpen())) throw new Error('dialog closed');
    await D.shot(page, png('entity-picked'));
    return v;
  });
  await step('cancelCard with the preset-name field open (it has its own Cancel button)', async () => {
    await page.locator('cms-panel button.btn-preset-save').click();
    await page.locator('cms-panel button.btn-preset-cancel').waitFor({ state: 'visible', timeout: 5000 });
    await D.cancelCard(page);
    if (await dialogOpen()) throw new Error('dialog still open');
  });
  await step('entity-row headers: names, state, exact match, static header, ambiguity', async () => {
    await D.openCardEditor(page, { type: 'entities' });
    await D.openStudio(page);
    const secs = await D.listSections(page);
    const rows = secs.filter((s) => s.kind === 'entity');
    if (rows.length !== 3 || rows.some((r) => r.open !== false || !r.collapsible)) throw new Error(JSON.stringify(rows.map((r) => [r.title, r.open])));
    const stat = secs.find((s) => s.name === 'Entity Rows');
    if (!stat || stat.collapsible) throw new Error('"Entity Rows" should be a static header');
    await D.expandSection(page, 'Entity Rows'); // no-op, must not time out
    const open = await D.expandSection(page, 'Ceiling Lights');
    if (!open.open) throw new Error('row did not open');
    let amb = null;
    try { await D.expandSection(page, 'Lights'); } catch (e) { amb = e; }
    if (!amb || !/ambiguous|several/.test(amb.message)) throw new Error('substring "Lights" should be ambiguous: ' + amb);
    const byId = await D.expandSection(page, 'switch.decorative_lights');
    await D.collapseSection(page, 'Ceiling Lights');
    await D.shot(page, png('entity-rows'));
    return `rows: ${rows.map((r) => r.name).join(', ')}; opened ${byId.name} by entity id`;
  });
  await step('stack child headers: state, nested sections, within-scoped lookup', async () => {
    await D.cancelCard(page);
    await D.openCardEditor(page, { type: 'vertical-stack' });
    await D.openStudio(page);
    const kids = (await D.listSections(page)).filter((s) => s.kind === 'child');
    if (kids.length !== 2 || kids.some((k) => k.open !== false)) throw new Error(JSON.stringify(kids.map((k) => [k.title, k.open])));
    await D.expandSection(page, '1. tile');
    const nested = (await D.listSections(page)).filter((s) => s.level >= 1 && s.kind === 'module');
    if (!nested.length) throw new Error('no nested modules listed under the opened child');
    const bg = await D.expandSection(page, 'Background', { within: '1. tile' }).catch((e) => e);
    if (bg instanceof Error) throw bg;
    await D.shot(page, png('stack-child'));
    await D.cancelCard(page);
    await D.exitEditMode(page);
    return `child 1 open, ${nested.length} nested modules; within-scoped Background open=${bg.open}`;
  });
  await step('sections view: seedSectionsDashboard, open editor by section/index and by name', async () => {
    await D.seedSectionsDashboard(page, 'qa-smoke-sections', [
      [{ type: 'heading', heading: 'Sec A' }, { type: 'tile', entity: ENTITY, name: 'A1' }, { type: 'tile', entity: 'light.bed_light', name: 'A2' }],
      [{ type: 'heading', heading: 'Sec B' }, { type: 'tile', entity: 'light.kitchen_lights', name: 'B1' }],
    ]);
    await D.gotoDashboard(page, 'qa-smoke-sections');
    await D.enterEditMode(page);
    await D.openCardEditor(page, { section: 1, index: 1 });
    const cfg = await dialogConfig();
    if (cfg?.name !== 'B1') throw new Error('dialog holds ' + JSON.stringify(cfg));
    await D.openStudio(page);
    await D.cancelCard(page);
    await D.openCardEditor(page, 'A2');
    const cfg2 = await dialogConfig();
    if (cfg2?.name !== 'A2') throw new Error('dialog holds ' + JSON.stringify(cfg2));
    await D.cancelCard(page);
    await D.exitEditMode(page);
    const idx = (await D.findCard(page, 4)).config.name;
    if (idx !== 'B1') throw new Error('flat index 4 is ' + idx);
    return `section 1 / index 1 = ${cfg.name}, by name = ${cfg2.name}, flat index 4 = ${idx}`;
  });
  await step('phone: launch with touch, tap() opens the dashboard menu', async () => {
    const m = await D.launch({ rig: RIG, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
    try {
      await D.gotoDashboard(m.page, MULTI);
      await D.tap(m.page.getByRole('button', { name: 'Open dashboard menu' }));
      await m.page.getByRole('menuitem', { name: /Edit dashboard/i }).waitFor({ state: 'visible', timeout: 8000 });
      const dpr = await m.page.evaluate(() => window.devicePixelRatio);
      await D.shot(m.page, png('phone-menu'));
      return `dpr=${dpr}, menu open after tap`;
    } finally { await m.close(); }
  });
} catch (e) { /* reported by step() */ }

const real = h.errors.filter((e) => !/Failed to load resource|ResizeObserver/.test(e));
console.log(`page/console errors: ${h.errors.length} (${real.length} non-resource)`);
real.slice(0, 8).forEach((e) => console.log('  ', e.slice(0, 200)));
await h.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${RIG}: ${results.length - failed.length}/${results.length} steps passed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);

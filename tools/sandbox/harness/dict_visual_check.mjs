// v0.10.0-beta.1 VISUAL verification of dict-form editing, per card type.
//
// For every card type that mounts standalone (matrix.mjs's 15; `button`
// needs a real dashboard — covered by button_card_binding_check + unit
// corpus), this:
//   1. renders the card via <hui-card> with a dict-form style — a visible
//      `.` entry (background + border) plus a pierce entry with a VISIBLE
//      effect where one is known to work (gauge value 30px, thermostat
//      big-number 30px, tile icon red) — and measures computed styles vs
//      an unstyled baseline;
//   2. pushes the card through the REAL panel edit pipeline (mount
//      cms-panel, add an outline via Advanced, capture the emitted
//      config), asserting the pierce entries survive byte-identically;
//   3. re-renders the EMITTED config and measures that the '.' effects,
//      the new outline, and the pierce effects all still render.
// Screenshots: dict-visual-before.png / dict-visual-after.png (labeled
// grid of every card), dict-visual-panel-pierced.png (Advanced showing
// the read-only pierced entries), dict-visual-panel-mixed.png (the
// mixed-form freeze banner) — for human inspection.
// Also covers an entities-card dict ROW visually (red text → edited blue).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { waitForHassReady, makeRecorder, finish } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, process.env.TOKENS_FILE || 'tokens.json'), 'utf8'));
const STYLE_KEY = process.env.STYLE_KEY === 'uix' ? 'uix' : 'card_mod';

const { results, record } = makeRecorder();

const ROOT_CSS = 'ha-card {\n  background: #113355;\n  border: 3px solid #22cc22;\n}';
// !important: clickable cards (entity/sensor/weather-forecast) carry HA's
// own `outline: none` on ha-card, which beats a plain outline declaration.
const EDIT_CSS = 'ha-card {\n  outline: 4px dashed #ff9900 !important;\n}';

// pierce = extra dict entries; measure = [tag, prop, expected] read AFTER the
// pierce is applied (null = no visible pierce probe for this card — a
// harmless no-match pierce entry is still included to exercise preservation).
const NOOP_PIERCE = { 'ha-card $': '.cms-noop {\n  color: red;\n}' };
const CARDS = {
  // NOTE: tile carries only a preservation pierce — ha-tile-icon SLOTS its
  // ha-state-icon (light DOM), so there is no verified pierce path into it;
  // the two probe-verified pierce render paths are gauge + thermostat
  // (docs/V0.10_PLAN.md §2), and those are asserted visually below.
  tile: { base: { type: 'tile', entity: 'light.ceiling_lights' }, pierce: NOOP_PIERCE, measure: null },
  entity: { base: { type: 'entity', entity: 'light.ceiling_lights' }, pierce: NOOP_PIERCE, measure: null },
  glance: { base: { type: 'glance', entities: ['light.ceiling_lights', 'switch.decorative_lights'] }, pierce: NOOP_PIERCE, measure: null },
  sensor: { base: { type: 'sensor', entity: 'sensor.outside_temperature', graph: 'none' }, pierce: NOOP_PIERCE, measure: null },
  gauge: {
    base: { type: 'gauge', entity: 'sensor.outside_temperature', min: 0, max: 40 },
    pierce: { 'ha-gauge$': 'text.value-text {\n  font-size: 30px;\n}' },
    measure: ['text.value-text', 'font-size', '30px'],
  },
  light: { base: { type: 'light', entity: 'light.ceiling_lights' }, pierce: NOOP_PIERCE, measure: null },
  thermostat: {
    base: { type: 'thermostat', entity: 'climate.heatpump' },
    pierce: { 'ha-state-control-climate-temperature$': { 'ha-big-number$': '.value {\n  font-size: 30px;\n}' } },
    measure: ['ha-big-number>>.value', 'font-size', '30px'],
  },
  humidifier: { base: { type: 'humidifier', entity: 'humidifier.humidifier' }, pierce: NOOP_PIERCE, measure: null },
  'alarm-panel': { base: { type: 'alarm-panel', entity: 'alarm_control_panel.security' }, pierce: NOOP_PIERCE, measure: null },
  'media-control': { base: { type: 'media-control', entity: 'media_player.living_room' }, pierce: NOOP_PIERCE, measure: null },
  'weather-forecast': { base: { type: 'weather-forecast', entity: 'weather.demo_weather_south' }, pierce: NOOP_PIERCE, measure: null },
  'history-graph': { base: { type: 'history-graph', entities: ['sensor.outside_temperature'] }, pierce: NOOP_PIERCE, measure: null },
  markdown: { base: { type: 'markdown', content: 'Hello **dict** world' }, pierce: NOOP_PIERCE, measure: null },
  heading: { base: { type: 'heading', heading: 'My Heading', icon: 'mdi:home' }, pierce: NOOP_PIERCE, measure: null, noBox: true },
  entities: {
    base: {
      type: 'entities',
      entities: [
        { entity: 'light.ceiling_lights', [STYLE_KEY]: { style: { '.': ':host {\n  color: #ff2200;\n}', 'div$': '.cms-noop {\n  x: y;\n}' } } },
        'sensor.outside_temperature',
      ],
    },
    pierce: NOOP_PIERCE,
    measure: null,
  },
};

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1540, height: 2900 } });
  await page.addInitScript((t) => { localStorage.setItem('hassTokens', JSON.stringify(t)); }, tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });
  await page.evaluate(() => customElements.whenDefined('hui-card'));

  // Shared in-page helpers: deep-walking element finder, grid renderer.
  await page.evaluate(() => {
    window.__all = (root, sel) => {
      const out = []; const stack = [root];
      while (stack.length) {
        const n = stack.pop();
        if (n.matches && (() => { try { return n.matches(sel); } catch { return false; } })()) out.push(n);
        if (n.shadowRoot) stack.push(...n.shadowRoot.children);
        if (n.children) stack.push(...n.children);
      }
      return out;
    };
    const haRoot = document.querySelector('home-assistant').shadowRoot;
    const grid = document.createElement('div');
    grid.id = 'cms-vgrid';
    grid.style.cssText = 'position:fixed;left:0;top:0;width:1540px;min-height:2900px;background:#0b0b0b;z-index:2147483000;display:grid;grid-template-columns:repeat(4,360px);gap:14px;padding:12px;align-content:start;';
    haRoot.appendChild(grid);
    window.__renderGrid = async (list) => {
      grid.innerHTML = '';
      const hass = document.querySelector('home-assistant').hass;
      const cells = {};
      for (const { name, config } of list) {
        const cell = document.createElement('div');
        const label = document.createElement('div');
        label.textContent = name;
        label.style.cssText = 'color:#eee;font:600 13px sans-serif;margin:0 0 4px;';
        const card = document.createElement('hui-card');
        card.hass = hass; card.config = config;
        cell.appendChild(label); cell.appendChild(card);
        grid.appendChild(cell);
        cells[name] = card;
      }
      await new Promise((r) => setTimeout(r, 300));
      // hass re-assignment after mount (HA 2026.8 gotcha for graph footers etc.)
      for (const card of Object.values(cells)) card.hass = hass;
      await new Promise((r) => setTimeout(r, 2500));
      window.__cells = cells;
      return Object.keys(cells);
    };
    window.__measure = (name, sel, prop) => {
      const card = window.__cells[name];
      if (!card) return null;
      // '>>' chains deep-walk scopes: 'ha-big-number>>.value' finds the
      // first ha-big-number anywhere, then the first .value inside IT.
      let scope = card;
      for (const step of sel.split('>>')) {
        scope = window.__all(scope, step)[0];
        if (!scope) return null;
      }
      return getComputedStyle(scope)[prop] ?? getComputedStyle(scope).getPropertyValue(prop);
    };
    window.__measureRow = (name) => {
      const card = window.__cells[name];
      if (!card) return null;
      // The styled row is the LIGHT row specifically — the sensor row also
      // contains a hui-generic-entity-row internally, so a loose tag match
      // can land on the wrong (unstyled) row.
      const row = window.__all(card, 'hui-toggle-entity-row, hui-light-entity-row')[0];
      return row ? getComputedStyle(row).color : null;
    };
  });

  const names = Object.keys(CARDS);

  // ---- phase 0: unstyled baseline measurements --------------------------
  await page.evaluate((list) => window.__renderGrid(list),
    names.map((name) => ({ name, config: { ...CARDS[name].base } })));
  const baseline = {};
  for (const name of names) {
    baseline[name] = {
      bg: await page.evaluate((n) => window.__measure(n, 'ha-card', 'background-color'), name),
      bw: await page.evaluate((n) => window.__measure(n, 'ha-card', 'border-top-width'), name),
    };
  }
  const rowBaseline = await page.evaluate(() => window.__measureRow('entities'));

  // ---- phase A: dict-styled render + screenshot -------------------------
  const styled = names.map((name) => ({
    name,
    config: { ...CARDS[name].base, [STYLE_KEY]: { style: { '.': ROOT_CSS, ...CARDS[name].pierce } } },
  }));
  await page.evaluate((list) => window.__renderGrid(list), styled);
  await page.screenshot({ path: resolve(SHOTS, 'dict-visual-before.png') });

  const beforeVals = {};
  for (const name of names) {
    const spec = CARDS[name];
    beforeVals[name] = {
      bg: await page.evaluate((n) => window.__measure(n, 'ha-card', 'background-color'), name),
      bw: await page.evaluate((n) => window.__measure(n, 'ha-card', 'border-top-width'), name),
      pierce: spec.measure
        ? await page.evaluate(({ n, sel, prop }) => window.__measure(n, sel, prop), { n: name, sel: spec.measure[0], prop: spec.measure[1] })
        : null,
    };
  }
  const rowBefore = await page.evaluate(() => window.__measureRow('entities'));

  // ---- phase B: REAL panel edit per card --------------------------------
  const editedConfigs = {};
  const editMeta = {};
  for (const { name, config } of styled) {
    const meta = await page.evaluate(async ({ cfg, editCss, styleKey }) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const haRoot = document.querySelector('home-assistant').shadowRoot;
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-2200px;top:0;width:1000px;height:900px;z-index:2147483600;background:#111;';
      haRoot.appendChild(host);
      const panel = document.createElement('cms-panel');
      panel.hass = document.querySelector('home-assistant').hass;
      panel.config = cfg;
      host.appendChild(panel);
      await panel.updateComplete;
      await sleep(900);

      const frozen = [...panel.shadowRoot.querySelectorAll('.container-banner')]
        .some((el) => /Mixed-form/i.test(el.textContent));
      let emitted = null;
      panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
      if (panel._studioState) {
        panel._studioState = {
          ...panel._studioState,
          advanced: { ...panel._studioState.advanced, rawCss: `${panel._studioState.advanced.rawCss}\n\n${editCss}`.trim() },
        };
        panel._emitConfigChanged();
        await sleep(400);
      }
      host.remove();
      const style = emitted?.[styleKey]?.style ?? null;
      return {
        frozen,
        emitted,
        stillDict: !!style && typeof style !== 'string',
        rootHasEdit: !!style && String(style['.'] ?? '').includes('outline: 4px dashed'),
        pierceJson: style ? JSON.stringify(Object.entries(style).filter(([k]) => k !== '.')) : null,
      };
    }, { cfg: config, editCss: EDIT_CSS, styleKey: STYLE_KEY });
    editedConfigs[name] = meta.emitted;
    const wantPierce = JSON.stringify(Object.entries(CARDS[name].pierce));
    editMeta[name] = {
      ok: !meta.frozen && meta.stillDict && meta.rootHasEdit && meta.pierceJson === wantPierce,
      detail: { frozen: meta.frozen, stillDict: meta.stillDict, rootHasEdit: meta.rootHasEdit, piercedIdentical: meta.pierceJson === wantPierce },
    };
  }

  // entities row edit (textColor red -> blue) rides the same emitted config:
  // re-run the panel for entities with a row edit instead of Advanced.
  const rowEdit = await page.evaluate(async ({ cfg, styleKey }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const haRoot = document.querySelector('home-assistant').shadowRoot;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-2200px;top:0;width:1000px;height:900px;z-index:2147483600;background:#111;';
    haRoot.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = cfg;
    host.appendChild(panel);
    await panel.updateComplete;
    await sleep(900);
    let emitted = null;
    panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
    panel._entityRowStyles = {
      ...panel._entityRowStyles,
      '0': { ...(panel._entityRowStyles['0'] ?? {}), textColor: '#2266ff' },
    };
    panel._emitConfigChanged();
    await sleep(400);
    host.remove();
    const rowStyle = emitted?.entities?.[0]?.[styleKey]?.style ?? null;
    return {
      emitted,
      rowStillDict: !!rowStyle && typeof rowStyle !== 'string',
      rowPierceKept: rowStyle?.['div$'] === '.cms-noop {\n  x: y;\n}',
      rowRootBlue: String(rowStyle?.['.'] ?? '').includes('#2266ff'),
    };
  }, { cfg: editedConfigs['entities'] ?? styled.find((s) => s.name === 'entities').config, styleKey: STYLE_KEY });
  if (rowEdit.emitted) editedConfigs['entities'] = rowEdit.emitted;

  // ---- phase C: re-render EMITTED configs + screenshot ------------------
  await page.evaluate((list) => window.__renderGrid(list),
    names.map((name) => ({ name, config: editedConfigs[name] ?? styled.find((s) => s.name === name).config })));
  await page.screenshot({ path: resolve(SHOTS, 'dict-visual-after.png') });

  const afterVals = {};
  for (const name of names) {
    const spec = CARDS[name];
    afterVals[name] = {
      bg: await page.evaluate((n) => window.__measure(n, 'ha-card', 'background-color'), name),
      outline: await page.evaluate((n) => window.__measure(n, 'ha-card', 'outline-style'), name),
      pierce: spec.measure
        ? await page.evaluate(({ n, sel, prop }) => window.__measure(n, sel, prop), { n: name, sel: spec.measure[0], prop: spec.measure[1] })
        : null,
    };
  }
  const rowAfter = await page.evaluate(() => window.__measureRow('entities'));

  // ---- phase D: panel-UI screenshots (pierced display + mixed banner) ---
  await page.evaluate(async ({ styleKey }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const haRoot = document.querySelector('home-assistant').shadowRoot;
    document.getElementById('cms-vgrid')?.remove?.();
    const grid = haRoot.querySelector('#cms-vgrid'); grid?.remove();
    const mk = (id, cfg, x) => {
      const host = document.createElement('div');
      host.id = id;
      host.style.cssText = `position:fixed;left:${x}px;top:0;width:740px;height:1400px;z-index:2147483600;background:#161616;overflow:auto;`;
      haRoot.appendChild(host);
      const panel = document.createElement('cms-panel');
      panel.hass = document.querySelector('home-assistant').hass;
      panel.config = cfg;
      host.appendChild(panel);
      return panel;
    };
    const p1 = mk('cms-shot-pierced', {
      type: 'gauge', entity: 'sensor.outside_temperature', min: 0, max: 40,
      [styleKey]: { style: { 'ha-gauge$': 'text.value-text {\n  font-size: 30px;\n}', '.': 'ha-card {\n  background: #113355;\n}' } },
    }, 0);
    mk('cms-shot-mixed', {
      type: 'gauge', entity: 'sensor.outside_temperature', min: 0, max: 40,
      [styleKey]: { style: 'ha-card {\n  color: red;\n}' },
      [styleKey === 'uix' ? 'card_mod' : 'uix']: { style: { 'ha-gauge$': 'text {\n  fill: blue;\n}' } },
    }, 760);
    await p1.updateComplete;
    await sleep(1200);
    // open the Advanced module so the pierced section is visible
    const adv = p1.shadowRoot.querySelector('cms-advanced-module');
    if (adv && !adv.open) { adv.shadowRoot.querySelector('.module-header')?.click(); await sleep(400); }
  }, { styleKey: STYLE_KEY });
  await page.setViewportSize({ width: 1540, height: 1400 });
  await page.screenshot({ path: resolve(SHOTS, 'dict-visual-panels.png') });
  await page.evaluate(() => {
    const haRoot = document.querySelector('home-assistant').shadowRoot;
    haRoot.querySelector('#cms-shot-pierced')?.remove();
    haRoot.querySelector('#cms-shot-mixed')?.remove();
  });

  // ---- verdicts ---------------------------------------------------------
  const offenders = (obj) => JSON.stringify(obj);
  const boxCards = names.filter((n) => !CARDS[n].noBox);

  const bgApplied = boxCards.filter((n) => beforeVals[n].bg !== baseline[n].bg && beforeVals[n].bg === 'rgb(17, 51, 85)');
  record(`'.' background renders on ${bgApplied.length}/${boxCards.length} box cards (dict form, engine-applied)`,
    bgApplied.length === boxCards.length,
    offenders(Object.fromEntries(boxCards.map((n) => [n, beforeVals[n].bg]))));

  const bwApplied = boxCards.filter((n) => beforeVals[n].bw === '3px');
  record(`'.' border renders on ${bwApplied.length}/${boxCards.length} box cards`,
    bwApplied.length === boxCards.length,
    offenders(Object.fromEntries(boxCards.map((n) => [n, beforeVals[n].bw]))));

  const pierceCards = names.filter((n) => CARDS[n].measure);
  const pierceOk = pierceCards.filter((n) => beforeVals[n].pierce === CARDS[n].measure[2]);
  record(`pierce entries visibly render before edit (${pierceCards.join(', ')})`,
    pierceOk.length === pierceCards.length,
    offenders(Object.fromEntries(pierceCards.map((n) => [n, beforeVals[n].pierce]))));

  const editOk = names.filter((n) => editMeta[n].ok);
  record(`panel edit per card: editable + '.' updated + pierced byte-identical (${editOk.length}/${names.length})`,
    editOk.length === names.length,
    offenders(Object.fromEntries(names.filter((n) => !editMeta[n].ok).map((n) => [n, editMeta[n].detail]))));

  const afterBg = boxCards.filter((n) => afterVals[n].bg === 'rgb(17, 51, 85)');
  const afterOutline = boxCards.filter((n) => afterVals[n].outline === 'dashed');
  record(`re-rendered EMITTED config: background still applied (${afterBg.length}) AND new outline renders (${afterOutline.length}) on all box cards`,
    afterBg.length === boxCards.length && afterOutline.length === boxCards.length,
    offenders(Object.fromEntries(boxCards.map((n) => [n, { bg: afterVals[n].bg, outline: afterVals[n].outline }]))));

  const afterPierce = pierceCards.filter((n) => afterVals[n].pierce === CARDS[n].measure[2]);
  record('pierce effects still render after the studio edit',
    afterPierce.length === pierceCards.length,
    offenders(Object.fromEntries(pierceCards.map((n) => [n, afterVals[n].pierce]))));

  record('entities dict ROW: red before edit, blue after, pierce kept',
    rowBefore === 'rgb(255, 34, 0)' && rowEdit.rowStillDict && rowEdit.rowPierceKept && rowEdit.rowRootBlue && rowAfter === 'rgb(34, 102, 255)',
    offenders({ rowBaseline, rowBefore, rowAfter, ...rowEdit, emitted: undefined }));

  await browser.close();
  finish(writeFileSync, resolve, HERE, 'dict-visual-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

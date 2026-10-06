// Structural sections: entities rows, stack children, presets, palette,
// preview picker, dict-form / mixed-form cards, uix-only compat banners.
import {
  sleep, openEditor, clickEditOn, openStudio, mod, isOpen, expand, enable, setSwitch, choose, setSlider,
  typeInto, pickSwatch, pickCompact, expectCfg, expectPage, pollPage, getCfg, styleStr, styleOf, rowOf, btn,
  resolveRgb, sameRgb, entityState, panelLoc, dialogButton, readDashboardCards, viewDashboard,
  waitDialogClosed,
} from './lib.mjs';
import { P_CARD, P_ROWS, P_PANEL, P_GAUGE } from './probes.mjs';
import { cancelDialog } from './s-core.mjs';

const S = (T, c) => styleStr(T, c);
const has = (T, ...parts) => (c) => parts.every((p) => S(T, c).includes(p));
const deepSorted = (v) => (Array.isArray(v) ? v.map(deepSorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, deepSorted(v[k])])) : v);
const same = (a, b) => JSON.stringify(deepSorted(a)) === JSON.stringify(deepSorted(b));
const rowStyle = (T, row) => (row && typeof row === 'object' ? row[T.KEY]?.style || '' : '');

// ---------------------------------------------------------------------------
// Entities card rows
// ---------------------------------------------------------------------------

async function entitiesSection(T) {
  const rows = ['sensor.outside_temperature', { entity: 'switch.ac' }, 'switch.ac', 'light.ceiling_lights'];
  await openEditor(T, 'fui-entities', [{ type: 'entities', title: 'Rows', entities: rows }]);
  await openStudio(T);
  const pv = await T.page.evaluate(P_PANEL);
  T.check('entities: no card-level Accent / Icon / Threshold modules; rows module present', !pv.modules.includes('cms-accent-color-module') && !pv.modules.includes('cms-icon-color-module') && !pv.modules.includes('cms-threshold-module') && pv.modules.includes('cms-entities-rows-module'), JSON.stringify(pv.modules));
  const rm = mod(T, 'cms-entities-rows-module');
  const sec = (i) => rm.locator('.entity-section').nth(i);
  const names = (await rm.locator('.entity-name').allTextContents()).map((t) => t.trim());
  T.check('one section per row; the duplicate is numbered "(2)"', names.length === 4 && names[2] === `${names[1]} (2)` && names[1] !== names[0], JSON.stringify(names));
  T.note(`row labels: ${JSON.stringify(names)}`);

  // row 0 — a bare-string row
  await sec(0).locator('.entity-header').click();
  T.check('clicking a row header expands it', (await sec(0).locator('.entity-header').getAttribute('aria-expanded')) === 'true');
  await setSwitch(rowOf(T, sec(0), 'Icon color').locator('ha-switch'), true);
  let r = await expectCfg(T, 'row 0 icon on → bare string promoted to object with :host --state-icon-color', (c) => typeof c.entities[0] === 'object' && c.entities[0].entity === 'sensor.outside_temperature' && rowStyle(T, c.entities[0]).includes('--state-icon-color: #2196F3;'), { show: (c) => JSON.stringify(c?.entities) });
  T.check('row 0 shows the "has styling" dot', (await sec(0).locator('.style-dot').count()) === 1);
  await expectPage(T, 'preview: row 0 icon #2196F3', P_ROWS, 0, (v) => sameRgb(v?.[0]?.iconColor, 'rgb(33, 150, 243)'));
  await pickSwatch(sec(0).locator('.entity-body > cms-color-picker').first(), 'Red');
  const red = await resolveRgb(T, 'var(--red-color)');
  await expectPage(T, 'preview: row 0 icon red', P_ROWS, 0, (v) => sameRgb(v?.[0]?.iconColor, red));
  await btn(sec(0), 'Threshold').click();
  await sec(0).locator('.add-rule-btn').first().click();
  await expectCfg(T, 'row 0 icon threshold: + Add Rule (< 0)', (c) => rowStyle(T, c.entities[0]).includes(`--state-icon-color: {{ '#2196F3' if states('sensor.outside_temperature') | float(0) < 0 else '#888888' }};`), { show: (c) => JSON.stringify(c?.entities?.[0]) });
  const rule = sec(0).locator('.rule').first();
  await choose(rule.locator('select'), '>');
  await typeInto(rule.locator('input[type="number"]'), '10');
  await pickCompact(T, rule.locator('cms-color-picker'), 'Green');
  await expectCfg(T, 'row rule > 10 green', (c) => rowStyle(T, c.entities[0]).includes(`'var(--green-color)' if states('sensor.outside_temperature') | float(0) > 10`), { show: (c) => JSON.stringify(c?.entities?.[0]) });
  const temp = Number((await entityState(T, 'sensor.outside_temperature')).state);
  const green = await resolveRgb(T, 'var(--green-color)');
  await pickCompact(T, rowOf(T, sec(0), 'Default color').locator('cms-color-picker'), 'Grey');
  const grey = await resolveRgb(T, 'var(--grey-color)');
  await expectPage(T, `preview: row 0 icon by threshold (${temp} > 10 → ${temp > 10 ? 'green' : 'grey'})`, P_ROWS, 0, (v) => sameRgb(v?.[0]?.iconColor, temp > 10 ? green : grey));
  await btn(rule, '×').click();
  await expectCfg(T, 'removing the only row rule drops the icon declaration', (c) => !rowStyle(T, c.entities[0]).includes('--state-icon-color'), { show: (c) => JSON.stringify(c?.entities?.[0]) });
  await btn(sec(0), 'Static').click();
  await expectCfg(T, 'back to Static → static colour again', (c) => /--state-icon-color: (#2196F3|var\(--red-color\));/.test(rowStyle(T, c.entities[0])), { show: (c) => JSON.stringify(c?.entities?.[0]) });

  // text colour
  await setSwitch(rowOf(T, sec(0), 'Text / state color').locator('ha-switch'), true);
  await expectCfg(T, 'row 0 text colour on → color: var(--primary-text-color)', (c) => rowStyle(T, c.entities[0]).includes('color: var(--primary-text-color);'), { show: (c) => JSON.stringify(c?.entities?.[0]) });
  await pickSwatch(sec(0).locator('.entity-body > cms-color-picker').last(), 'Purple');
  const purple = await resolveRgb(T, 'var(--purple-color)');
  await expectPage(T, 'preview: row 0 text purple', P_ROWS, 0, (v) => sameRgb(v?.[0]?.textColor, purple));
  const textModes = sec(0).locator('.mode-toggle').last();
  await btn(textModes, 'Threshold').click();
  await sec(0).locator('.add-rule-btn').last().click();
  const trule = sec(0).locator('.rule').last();
  await choose(trule.locator('select'), '<');
  await typeInto(trule.locator('input[type="number"]'), '100');
  await pickCompact(T, trule.locator('cms-color-picker'), 'Orange');
  await expectCfg(T, 'row 0 text threshold < 100 orange', (c) => rowStyle(T, c.entities[0]).includes(`color: {{ 'var(--orange-color)' if states('sensor.outside_temperature') | float(0) < 100 else '#888888' }};`), { show: (c) => JSON.stringify(c?.entities?.[0]) });
  const orange = await resolveRgb(T, 'var(--orange-color)');
  await expectPage(T, 'preview: row 0 text by threshold (orange)', P_ROWS, 0, (v) => sameRgb(v?.[0]?.textColor, temp < 100 ? orange : 'rgb(136, 136, 136)'));

  // per-row font
  await setSwitch(rowOf(T, sec(0), 'Font (this row)').locator('ha-switch'), true);
  await expectCfg(T, 'row font on → 16px normal', (c) => rowStyle(T, c.entities[0]).includes('font-size: 16px;') && rowStyle(T, c.entities[0]).includes('font-weight: normal;'), { show: (c) => JSON.stringify(c?.entities?.[0]) });
  await setSlider(T, rowOf(T, sec(0), 'Text size').locator('ha-slider'), 20);
  await choose(rowOf(T, sec(0), 'Weight').locator('select'), 'bold');
  await expectCfg(T, 'row font 20px bold', (c) => rowStyle(T, c.entities[0]).includes('font-size: 20px;') && rowStyle(T, c.entities[0]).includes('font-weight: bold;'), { show: (c) => JSON.stringify(c?.entities?.[0]) });
  await expectPage(T, 'preview: row 0 text 20px / 700; row 1 untouched size', P_ROWS, 0, (v) => v?.[0]?.fontSize === '20px' && v[0].fontWeight === '700' && v[1]?.fontSize !== '20px');

  // duplicate-entity rows stay independent
  await sec(1).locator('.entity-header').click();
  await setSwitch(rowOf(T, sec(1), 'Icon color').locator('ha-switch'), true);
  await pickSwatch(sec(1).locator('.entity-body > cms-color-picker').first(), 'Orange');
  await sec(2).locator('.entity-header').click();
  await setSwitch(rowOf(T, sec(2), 'Icon color').locator('ha-switch'), true);
  await pickSwatch(sec(2).locator('.entity-body > cms-color-picker').first(), 'Teal');
  r = await expectCfg(T, 'duplicate rows (switch.ac ×2) get independent styles', (c) => rowStyle(T, c.entities[1]).includes('var(--orange-color)') && rowStyle(T, c.entities[2]).includes('var(--teal-color)') && !rowStyle(T, c.entities[1]).includes('teal') && c.entities[2].entity === 'switch.ac', { show: (c) => JSON.stringify(c?.entities) });
  T.check('untouched row 3 stays a bare string', r.cfg?.entities?.[3] === 'light.ceiling_lights', JSON.stringify(r.cfg?.entities?.[3]));
  const teal = await resolveRgb(T, 'var(--teal-color)');
  const acOn = (await entityState(T, 'switch.ac'))?.state === 'on';
  await expectPage(T, `preview: row 1 orange, row 2 teal (switch.ac ${acOn ? 'on' : 'off'})`, P_ROWS, 0, (v) => sameRgb(v?.[1]?.iconColor, orange) && sameRgb(v?.[2]?.iconColor, teal));
  T.check('card-level config has no style (rows only)', !styleOf(T, r.cfg));
}

// ---------------------------------------------------------------------------
// Stack children
// ---------------------------------------------------------------------------

async function stackSection(T) {
  const cards = [{ type: 'vertical-stack', cards: [{ type: 'tile', entity: 'light.ceiling_lights' }, { type: 'entities', entities: ['sensor.outside_humidity', 'switch.ac'] }] }];
  await openEditor(T, 'fui-stack', cards);
  await openStudio(T);
  const pv = await T.page.evaluate(P_PANEL);
  T.check('vertical-stack: container banner + one section per child', (pv.container[0] || '').includes('style each child card below') && (await panelLoc(T).locator('cms-child-card-section').count()) === 2, JSON.stringify(pv.container));
  T.check('container card: no click-to-edit picker overlay', (await panelLoc(T).locator('cms-preview-picker').count()) === 0);
  const child = (i) => panelLoc(T).locator('cms-child-card-section').nth(i);
  T.check('child headers name type + entity', ((await child(0).locator('.child-header').textContent()) || '').replace(/\s+/g, ' ').includes('1. tile light.ceiling_lights'));
  await child(0).locator('.child-header').click();
  const bg = mod(T, 'cms-background-module', child(0));
  await enable(bg);
  await pickSwatch(rowOf(T, bg, 'Color').locator('cms-color-picker'), 'Red');
  const red = await resolveRgb(T, 'var(--red-color)');
  await expectCfg(T, 'child 0 edit lands in cards[0]; stack + sibling untouched', (c) => rowStyle(T, c.cards?.[0]).includes('background: var(--red-color);') && !c[T.KEY] && same(c.cards[1], cards[0].cards[1]), { show: (c) => JSON.stringify(c) });
  await expectPage(T, 'preview: first child card red', P_CARD, 0, (v) => sameRgb(v?.bg, red));
  T.check('child 0 header shows the styled dot', (await child(0).locator('.styled-dot').count()) === 1);

  await child(1).locator('.child-header').click();
  const font = mod(T, 'cms-font-module', child(1));
  await enable(font);
  await setSlider(T, rowOf(T, font, 'Text size').locator('ha-slider'), 20);
  await expectCfg(T, 'child 1 (entities) Font → cards[1] style', (c) => rowStyle(T, c.cards?.[1]).includes('font-size: 20px;'), { show: (c) => JSON.stringify(c?.cards?.[1]) });
  const rm = mod(T, 'cms-entities-rows-module', child(1));
  T.check('nested entities child offers per-row styling', (await rm.count()) === 1);
  await rm.locator('.entity-section').nth(0).locator('.entity-header').click();
  await setSwitch(rowOf(T, rm.locator('.entity-section').nth(0), 'Icon color').locator('ha-switch'), true);
  await pickSwatch(rm.locator('.entity-section').nth(0).locator('.entity-body > cms-color-picker').first(), 'Purple');
  await expectCfg(T, 'nested row edit lands in cards[1].entities[0]', (c) => rowStyle(T, c.cards?.[1]?.entities?.[0]).includes('--state-icon-color: var(--purple-color);') && c.cards[1].entities[1] === 'switch.ac' && rowStyle(T, c.cards?.[0]).includes('var(--red-color)'), { show: (c) => JSON.stringify(c?.cards?.[1]) });
  const purple = await resolveRgb(T, 'var(--purple-color)');
  await expectPage(T, 'preview: nested row icon purple + child text 20px', P_ROWS, 0, (v) => sameRgb(v?.[0]?.iconColor, purple) && v[0].fontSize === '20px');

  // horizontal-stack
  const h = [{ type: 'horizontal-stack', cards: [{ type: 'tile', entity: 'light.ceiling_lights' }, { type: 'button', entity: 'switch.decorative_lights' }] }];
  await openEditor(T, 'fui-hstack', h);
  await openStudio(T);
  await child(1).locator('.child-header').click();
  const border = mod(T, 'cms-border-module', child(1));
  await enable(border);
  await setSlider(T, rowOf(T, border, 'Border radius').locator('ha-slider'), 20);
  await expectCfg(T, 'horizontal-stack child 1 (button) border → cards[1]', (c) => rowStyle(T, c.cards?.[1]).includes('border-radius: 20px;') && !c.cards[0][T.KEY], { show: (c) => JSON.stringify(c) });
  await expectPage(T, 'preview: second child radius 20px', P_CARD, 1, (v) => v?.radius === '20px');

  // grid
  const g = [{ type: 'grid', columns: 2, square: false, cards: [{ type: 'tile', entity: 'light.ceiling_lights' }, { type: 'tile', entity: 'switch.decorative_lights' }] }];
  await openEditor(T, 'fui-grid', g);
  await openStudio(T);
  await child(0).locator('.child-header').click();
  const anim = mod(T, 'cms-animation-module', child(0));
  await enable(anim);
  await expectCfg(T, 'grid child 0 animation → cards[0]', (c) => rowStyle(T, c.cards?.[0]).includes('animation: cms-pulse 2s ease-in-out infinite;') && !c.cards[1][T.KEY], { show: (c) => JSON.stringify(c) });
  await expectPage(T, 'preview: first grid child pulses', P_CARD, 0, (v) => v?.anim === 'cms-pulse');
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

async function presetsSection(T) {
  const cards = [{ type: 'tile', entity: 'light.ceiling_lights' }, { type: 'heading', heading: 'Preset target', icon: 'mdi:sofa' }, { type: 'tile', entity: 'switch.decorative_lights' }];
  const NAME = `fui-preset-${Date.now().toString(36)}`;
  await openEditor(T, 'fui-presets', cards, 0);
  await openStudio(T);
  const bg = mod(T, 'cms-background-module');
  await enable(bg);
  await pickSwatch(rowOf(T, bg, 'Color').locator('cms-color-picker'), 'Red');
  await enable(mod(T, 'cms-animation-module'));
  const icon = mod(T, 'cms-icon-color-module');
  await enable(icon);
  await choose(rowOf(T, icon, 'Color mode').locator('select'), 'plain');
  await pickSwatch(rowOf(T, icon, 'Color').locator('cms-color-picker'), 'Pink');
  const border = mod(T, 'cms-border-module');
  await enable(border);
  await setSlider(T, rowOf(T, border, 'Border radius').locator('ha-slider'), 20);
  await expectCfg(T, 'source card styled (bg, animation, icon, radius)', has(T, 'background: var(--red-color);', 'cms-pulse', 'color: var(--pink-color) !important;', 'border-radius: 20px;'));

  const presetSel = panelLoc(T).locator('.preset-bar select');
  // "Save preset" swaps the bar for an inline name field (no window.prompt —
  // unreliable in the Companion app). Escape cancels without closing HA's dialog.
  await panelLoc(T).locator('.btn-preset-save').click();
  const nameField = panelLoc(T).locator('.preset-bar .preset-name');
  T.check('💾 Save preset shows an inline name field (focused), Save disabled while empty', (await nameField.isVisible()) && (await nameField.evaluate((e) => e.getRootNode().activeElement === e)) && (await panelLoc(T).locator('.preset-bar .btn-preset-save').isDisabled()));
  await nameField.press('Escape');
  T.check('Escape cancels naming — the dropdown is back and HA\'s dialog stays open', (await presetSel.isVisible()) && !!(await T.page.evaluate(() => window.__fui.dialog())));
  await panelLoc(T).locator('.btn-preset-save').click();
  await nameField.fill(NAME);
  await nameField.press('Enter');
  await presetSel.locator(`option[value="${NAME}"]`).waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
  T.check('typing a name + Enter adds the preset to the dropdown', (await presetSel.locator(`option[value="${NAME}"]`).count()) === 1);
  T.check('no native browser dialog was used', !T.dialogs.some((d) => d.type === 'prompt'), JSON.stringify(T.dialogs.slice(-2)));
  T.check('the new preset is selected, with a delete (×) button', (await presetSel.evaluate((s) => s.value)) === NAME && (await panelLoc(T).locator('.btn-preset-delete').count()) === 1);
  let stored = await T.ws.call({ type: 'frontend/get_user_data', key: 'cms_presets' });
  T.check('preset synced to HA per-user storage', (stored?.value || []).some((p) => p.name === NAME));
  await cancelDialog(T);

  // load onto a heading: hidden modules must not leak
  await clickEditOn(T, 1);
  await openStudio(T);
  await choose(panelLoc(T).locator('.preset-bar select'), NAME);
  await sleep(800);
  const hc = await getCfg(T);
  const hs = S(T, hc);
  T.check('preset loaded onto a HEADING: no hidden-module styling leaks (bg/animation/icon/border)', !/background|animation|ha-state-icon|border-radius|@keyframes/.test(hs), hs.slice(0, 300) || '(no style — correct)');
  await cancelDialog(T);

  // load onto another tile
  await clickEditOn(T, 2);
  await openStudio(T);
  await choose(panelLoc(T).locator('.preset-bar select'), NAME);
  await expectCfg(T, 'preset loaded onto another tile reproduces the styling', has(T, 'background: var(--red-color);', 'animation: cms-pulse', 'color: var(--pink-color) !important;', 'border-radius: 20px;'));
  const red = await resolveRgb(T, 'var(--red-color)');
  const pink = await resolveRgb(T, 'var(--pink-color)');
  await expectPage(T, 'preview: preset look (red bg, pulse, pink icon, 20px radius)', P_CARD, 0, (v) => sameRgb(v?.bg, red) && v.anim === 'cms-pulse' && sameRgb(v.iconColor, pink) && v.radius === '20px');
  T.check('modules reflect the loaded preset (Background switch on)', await mod(T, 'cms-background-module').locator('.module-header ha-switch').evaluate((e) => e.checked));

  // delete
  await panelLoc(T).locator('.btn-preset-delete').click();
  await sleep(500);
  T.check('× deletes the preset from the dropdown', (await panelLoc(T).locator(`.preset-bar select option[value="${NAME}"]`).count()) === 0);
  stored = await T.ws.call({ type: 'frontend/get_user_data', key: 'cms_presets' });
  T.check('…and from HA per-user storage', !(stored?.value || []).some((p) => p.name === NAME));
  T.check('deleting a preset leaves the card styling alone', S(T, await getCfg(T)).includes('background: var(--red-color);'));
  await cancelDialog(T);
}

// ---------------------------------------------------------------------------
// My Color Palette
// ---------------------------------------------------------------------------

async function paletteSection(T) {
  const snapshot = await T.ws.call({ type: 'frontend/get_user_data', key: 'cms_palette' });
  await T.ws.call({ type: 'frontend/set_user_data', key: 'cms_palette', value: { colors: [], defaults: {} } });
  try {
    const cards = [{ type: 'tile', entity: 'light.ceiling_lights' }];
    await openEditor(T, 'fui-palette', cards, 0);
    await openStudio(T);
    const pm = mod(T, 'cms-palette-manager');
    await pm.locator('.module-header').click();
    await btn(pm, '+ Add Color').click();
    const row = pm.locator('.color-row').first();
    T.check('+ Add Color adds a row named "My color 1" (#03a9f4)', (await row.locator('input[type="text"]').inputValue()) === 'My color 1' && (await row.locator('input[type="color"]').inputValue()) === '#03a9f4');
    await typeInto(row.locator('input[type="text"]'), 'FUI Magenta');
    await row.locator('input[type="color"]').fill('#ab12cd');
    await sleep(400);
    let stored = await T.ws.call({ type: 'frontend/get_user_data', key: 'cms_palette' });
    T.check('renamed + recoloured custom colour saved to HA user data', (stored?.value?.colors || []).some((c) => c.name === 'FUI Magenta' && c.hex === '#ab12cd'), JSON.stringify(stored?.value));

    const bg = mod(T, 'cms-background-module');
    await enable(bg);
    const bgPicker = rowOf(T, bg, 'Color').locator('cms-color-picker');
    const sw = bgPicker.locator('button.preset[aria-label="FUI Magenta"]');
    T.check('the custom colour appears as a swatch in the Background picker', (await sw.count()) === 1);
    await sw.click();
    await expectCfg(T, 'clicking it writes its hex value', has(T, 'background: #ab12cd;'));
    await expectPage(T, 'preview: background #ab12cd', P_CARD, 0, (v) => sameRgb(v?.bg, 'rgb(171, 18, 205)'));
    const font = mod(T, 'cms-font-module');
    await expand(font);
    T.check('…and in the Font picker', (await rowOf(T, font, 'Text color').locator('button.preset[aria-label="FUI Magenta"]').count()) === 1);
    const thr = mod(T, 'cms-threshold-module');
    await enable(thr);
    await btn(thr, '+ Add Rule').click();
    await pickCompact(T, thr.locator('.rule').first().locator('cms-color-picker'), 'FUI Magenta');
    await expectCfg(T, '…and in a compact (popover) picker: threshold rule gets #ab12cd', has(T, "'#ab12cd' if states("));
    await enable(thr, false);

    await row.locator('.del-btn').click();
    await sleep(400);
    T.check('deleting the custom colour removes its swatch from the pickers', (await bgPicker.locator('button.preset[aria-label="FUI Magenta"]').count()) === 0);
    T.check('…without touching styling that already uses it', S(T, await getCfg(T)).includes('background: #ab12cd;'));
    stored = await T.ws.call({ type: 'frontend/get_user_data', key: 'cms_palette' });
    T.check('…and from HA user data', (stored?.value?.colors || []).length === 0, JSON.stringify(stored?.value));

    // ON / OFF default overrides
    const onRow = pm.locator('.color-row').filter({ hasText: 'ON default' });
    const offRow = pm.locator('.color-row').filter({ hasText: 'OFF default' });
    T.check('ON/OFF default rows show the built-in values', ((await onRow.textContent()) || '').includes('built-in #2196F3') && ((await offRow.textContent()) || '').includes('built-in #6b6b6b'));
    await onRow.locator('input[type="color"]').fill('#112233');
    await offRow.locator('input[type="color"]').fill('#445566');
    await sleep(500);
    T.check('overrides show a Reset button each', (await onRow.locator('.reset-btn').count()) === 1 && (await offRow.locator('.reset-btn').count()) === 1);
    stored = await T.ws.call({ type: 'frontend/get_user_data', key: 'cms_palette' });
    T.check('overrides saved to HA user data', stored?.value?.defaults?.onColor === '#112233' && stored?.value?.defaults?.offColor === '#445566', JSON.stringify(stored?.value));
    // same session: freshly enable Icon Color / Accent Color
    await enable(mod(T, 'cms-icon-color-module'));
    const sess = await expectCfg(T, 'same session: a freshly enabled Icon Color starts from the new ON/OFF defaults', has(T, `{{ '#112233' if is_state(config.entity, 'on') else '#445566' }}`), { timeout: 3000 });
    await enable(mod(T, 'cms-accent-color-module'));
    await expectCfg(T, 'same session: a freshly enabled Accent Color starts from the new ON default', has(T, '--accent-color: #112233;'), { timeout: 3000 });
    if (!sess.ok) T.note(`palette defaults in-session: icon emitted ${S(T, sess.cfg).match(/ha-state-icon[^}]+/)?.[0]}`);
    await cancelDialog(T);
    // after reopening the dialog
    await clickEditOn(T, 0);
    await openStudio(T);
    await enable(mod(T, 'cms-icon-color-module'));
    await expectCfg(T, 'after reopening: a freshly enabled Icon Color starts from the ON/OFF defaults', has(T, `{{ '#112233' if is_state(config.entity, 'on') else '#445566' }}`));
    await enable(mod(T, 'cms-accent-color-module'));
    await expectCfg(T, 'after reopening: Accent Color starts from the ON default', has(T, '--accent-color: #112233;'));
    const pm2 = mod(T, 'cms-palette-manager');
    T.check('collapsed palette header summarises "defaults set"', ((await pm2.locator('.header-summary').textContent().catch(() => '')) || '').includes('defaults set'));
    await pm2.locator('.module-header').click();
    await pm2.locator('.color-row').filter({ hasText: 'ON default' }).locator('.reset-btn').click();
    await pm2.locator('.color-row').filter({ hasText: 'OFF default' }).locator('.reset-btn').click();
    await sleep(500);
    stored = await T.ws.call({ type: 'frontend/get_user_data', key: 'cms_palette' });
    T.check('Reset clears both overrides', !stored?.value?.defaults?.onColor && !stored?.value?.defaults?.offColor, JSON.stringify(stored?.value));
    T.check('rows show the built-ins again', ((await pm2.locator('.color-row').filter({ hasText: 'ON default' }).textContent()) || '').includes('built-in'));
    await cancelDialog(T);
  } finally {
    await T.ws.call({ type: 'frontend/set_user_data', key: 'cms_palette', value: snapshot?.value ?? { colors: [], defaults: {} } });
  }
}

// ---------------------------------------------------------------------------
// Preview picker (click-to-edit)
// ---------------------------------------------------------------------------

async function hoverAt(T, pt) {
  await T.page.mouse.move(pt.x - 5, pt.y - 5);
  await T.page.mouse.move(pt.x, pt.y, { steps: 3 });
  const r = await pollPage(T, () => {
    const Q = window.__fui;
    const lab = Q.q(Q.panel(), '.hl-label')[0];
    return lab ? Q.txt(lab) : null;
  }, null, (v) => !!v, 3000);
  return r.v;
}

const rectOf = (T, fnBody, arg) => T.page.evaluate(({ fnBody, arg }) => {
  // eslint-disable-next-line no-new-func
  const el = new Function('Q', 'arg', fnBody)(window.__fui, arg);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height };
}, { fnBody, arg });

async function moduleInView(T, tag) {
  return T.page.evaluate((tag) => {
    const Q = window.__fui;
    const p = Q.panel();
    const m = p.shadowRoot.querySelector(tag);
    const col = p.shadowRoot.querySelector('.modules-col');
    const a = m.getBoundingClientRect(); const b = col.getBoundingClientRect();
    return a.bottom > b.top + 10 && a.top < b.bottom - 10;
  }, tag);
}

async function pickerSection(T) {
  const cards = [
    { type: 'tile', entity: 'light.ceiling_lights' },
    { type: 'entities', entities: ['sensor.outside_temperature', 'switch.ac', 'switch.ac'] },
    { type: 'heading', heading: 'Picker heading', icon: 'mdi:sofa' },
  ];
  await openEditor(T, 'fui-picker', cards, 0);
  await openStudio(T);
  const before = (await entityState(T, 'light.ceiling_lights')).state;
  T.check('preview hint "Click any part of the preview…" shown', (await panelLoc(T).locator('.preview-hint').count()) === 1);
  // icon
  let pt = await rectOf(T, 'return Q.q1(Q.prev(), "ha-state-icon");');
  let label = await hoverAt(T, pt);
  T.check('hover tile icon → label "Icon Color"', label === 'Icon Color', label);
  await T.page.mouse.click(pt.x, pt.y);
  await sleep(900);
  T.check('click → Icon Color module opened + scrolled into view', (await isOpen(mod(T, 'cms-icon-color-module'))) && (await moduleInView(T, 'cms-icon-color-module')));
  // name text
  pt = await rectOf(T, 'const i = Q.q1(Q.prev(), "ha-tile-info"); return i;');
  pt = { x: pt.left + 20, y: pt.y };
  label = await hoverAt(T, pt);
  T.check('hover tile name → label "Font"', label === 'Font', label);
  await T.page.mouse.click(pt.x, pt.y);
  await sleep(900);
  T.check('click → Font module opened + in view', (await isOpen(mod(T, 'cms-font-module'))) && (await moduleInView(T, 'cms-font-module')));
  // card surface
  // a point on the card's own surface: inside ha-card, outside icon + info blocks
  pt = await T.page.evaluate(() => {
    const Q = window.__fui; const c = Q.prev();
    const card = Q.q1(c, 'ha-card').getBoundingClientRect();
    const avoid = ['ha-tile-icon', 'ha-tile-info', 'hui-card-features'].map((s) => Q.q1(c, s)).filter(Boolean).map((e) => e.getBoundingClientRect());
    const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    const cands = [[card.left + 4, card.top + 4], [card.right - 4, card.top + 4], [card.right - 4, card.top + card.height / 2], [card.left + card.width / 2, card.bottom - 4], [card.left + 4, card.bottom - 4]];
    const ok = cands.find(([x, y]) => !avoid.some((r) => inside(r, x, y)));
    return ok ? { x: ok[0], y: ok[1] } : null;
  });
  T.check('tile has a reachable bare card surface (outside icon/info)', !!pt);
  label = pt ? await hoverAt(T, pt) : null;
  T.check('hover empty card surface → "Background & card surface"', label === 'Background & card surface', label);
  if (pt) await T.page.mouse.click(pt.x, pt.y);
  await sleep(900);
  T.check('click → Background module opened + in view', (await isOpen(mod(T, 'cms-background-module'))) && (await moduleInView(T, 'cms-background-module')));
  T.check('picker clicks never reach the live card (light state unchanged)', (await entityState(T, 'light.ceiling_lights')).state === before);
  await cancelDialog(T);

  // entities rows
  await clickEditOn(T, 1);
  await openStudio(T);
  const rowRect = (i, sel) => rectOf(T, `const c = Q.prev(); const rows = Q.all(c).filter((n) => /-entity-row$/.test(n.tagName.toLowerCase()) && n.tagName !== 'HUI-GENERIC-ENTITY-ROW'); const r = rows[arg.i]; return arg.sel ? Q.q1(r, arg.sel) : r;`, { i, sel });
  pt = await rowRect(2, 'state-badge');
  label = await hoverAt(T, pt);
  T.check('hover the 3rd row\'s icon → "Entity Rows — switch.ac"', label === 'Entity Rows — switch.ac', label);
  await T.page.mouse.click(pt.x, pt.y);
  await sleep(900);
  const heads = await mod(T, 'cms-entities-rows-module').locator('.entity-header').evaluateAll((hs) => hs.map((h) => h.getAttribute('aria-expanded')));
  T.check('click → exactly that (duplicate) row section opens', JSON.stringify(heads) === JSON.stringify(['false', 'false', 'true']), JSON.stringify(heads));
  pt = await rowRect(0, '.info');
  label = await hoverAt(T, pt);
  T.note(`hovering row 0's NAME text labels "${label}"`);
  pt = await rowRect(0, null);
  pt = { x: pt.right - 30, y: pt.y };
  label = await hoverAt(T, pt);
  T.note(`hovering row 0's state value labels "${label}"`);
  await cancelDialog(T);

  // heading
  await clickEditOn(T, 2);
  await openStudio(T);
  pt = await rectOf(T, 'return Q.headingText(Q.prev());');
  label = await hoverAt(T, pt);
  T.check('hover heading title → "Heading Style"', label === 'Heading Style', label);
  await T.page.mouse.click(pt.x, pt.y);
  await sleep(900);
  T.check('click → Heading Style opened + in view', (await isOpen(mod(T, 'cms-heading-style-module'))) && (await moduleInView(T, 'cms-heading-style-module')));
  await cancelDialog(T);
}

// ---------------------------------------------------------------------------
// Dict-form card (`.` + pierced entry)
// ---------------------------------------------------------------------------

async function dictSection(T) {
  const PIERCE = 'text.value-text {\n  font-weight: 700;\n}';
  const card = { type: 'gauge', entity: 'sensor.outside_humidity', min: 0, max: 100, [T.KEY]: { style: { '.': 'ha-card {\n  border-radius: 20px;\n}', 'ha-gauge$': PIERCE } } };
  await openEditor(T, 'fui-dict', [card]);
  await openStudio(T);
  const pv = await T.page.evaluate(P_PANEL);
  T.check('dict-form card: editable (modules shown, no lock banner)', pv.modules.includes('cms-border-module') && !pv.container.some((t) => t.includes('Mixed-form')), JSON.stringify(pv));
  const adv = mod(T, 'cms-advanced-module');
  T.check('Advanced CSS opens itself and lists the pierced entry read-only', (await isOpen(adv)) && ((await adv.locator('.pierced pre').textContent()) || '').includes('"ha-gauge$"') && ((await adv.locator('.pierced pre').textContent()) || '').includes('font-weight: 700;'));
  const border = mod(T, 'cms-border-module');
  T.check('the `.` entry was adopted: Border on at 20px', (await border.locator('.module-header ha-switch').evaluate((e) => e.checked)) && ((await rowOf(T, border, 'Border radius').locator('.value-label').textContent()) || '').trim() === '20px');
  await setSlider(T, rowOf(T, border, 'Border radius').locator('ha-slider'), 8);
  const bg = mod(T, 'cms-background-module');
  await enable(bg);
  await pickSwatch(rowOf(T, bg, 'Color').locator('cms-color-picker'), 'Red');
  const r = await expectCfg(T, 'edits rewrite `.` only; pierced entry byte-identical; key order kept', (c) => {
    const st = c?.[T.KEY]?.style;
    return st && typeof st === 'object' && JSON.stringify(Object.keys(st)) === '[".","ha-gauge$"]' && st['ha-gauge$'] === PIERCE && st['.'].includes('border-radius: 8px;') && st['.'].includes('background: var(--red-color);');
  }, { show: (c) => JSON.stringify(c?.[T.KEY]) });
  const red = await resolveRgb(T, 'var(--red-color)');
  await expectPage(T, 'preview: radius 8px + red, pierced value-text still bold', P_GAUGE, null, (v) => v?.radius === '8px' && sameRgb(v.bg, red) && v.vtWeight === '700');
  await dialogButton(T, 'Save').click();
  T.check('HA Save closes the dialog', await waitDialogClosed(T));
  const saved = (await readDashboardCards(T, 'fui-dict'))[0];
  T.check('Save persists the dict exactly (pierced bytes kept)', same(saved, r.cfg) && saved?.[T.KEY]?.style?.['ha-gauge$'] === PIERCE, JSON.stringify(saved?.[T.KEY]));
  await viewDashboard(T, 'fui-dict');
  await expectPage(T, 'dashboard: saved dict card renders (8px, red, value text 700)', () => {
    const Q = window.__fui;
    const g = Q.q(document.body, 'hui-gauge-card')[0];
    const hc = g && Q.q1(g, 'ha-card'); const vt = g && Q.q1(g, '.value-text');
    return hc ? { radius: getComputedStyle(hc).borderTopLeftRadius, bg: getComputedStyle(hc).backgroundColor, vtWeight: vt ? getComputedStyle(vt).fontWeight : null } : null;
  }, null, (v) => v?.radius === '8px' && sameRgb(v.bg, red) && v.vtWeight === '700', { timeout: 20000 });
}

// ---------------------------------------------------------------------------
// Mixed-form card
// ---------------------------------------------------------------------------

async function mixedSection(T) {
  const card = { type: 'tile', entity: 'light.ceiling_lights', [T.KEY]: { style: 'ha-card {\n  border-radius: 20px;\n}' }, [T.OTHER]: { style: { 'ha-tile-icon$': '.x {\n  color: red;\n}' } } };
  await openEditor(T, 'fui-mixed', [card]);
  await openStudio(T);
  const pv = await T.page.evaluate(P_PANEL);
  T.check('mixed-form: lock banner shown', pv.container.some((t) => t.includes('Mixed-form styling — preserved as-is')), JSON.stringify(pv.container));
  T.check('mixed-form: no module controls offered', !pv.modules.some((t) => /font|filter|accent|icon|threshold|background|animation|border|advanced/.test(t)), JSON.stringify(pv.modules));
  await sleep(800);
  T.check('mixed-form: opening it changes nothing in the config', same(await getCfg(T), card));
  T.check('HA Save stays disabled (nothing dirty)', await dialogButton(T, 'Save').evaluate((b) => b.disabled || b.hasAttribute('disabled')));
}

// ---------------------------------------------------------------------------
// uix-only / macros compat banners
// ---------------------------------------------------------------------------

async function uixOnlySection(T) {
  const STYLE = 'ha-card {\n  background: rgb(34, 68, 102);\n}';
  const cards = [
    { type: 'tile', entity: 'light.ceiling_lights', uix: { style: STYLE }, card_mod: { class: 'fui-class' } },
    { type: 'tile', entity: 'light.ceiling_lights', uix: { style: 'ha-card {\n  background: red;\n}', macros: { fui_macro: { params: [], template: 'red' } } } },
  ];
  await openEditor(T, 'fui-uixonly', cards, 0);
  await openStudio(T);
  let pv = await T.page.evaluate(P_PANEL);
  if (T.KEY === 'card_mod') {
    T.check('card-mod rig: uix-only card shows the "only under uix:" warning + Copy button', (pv.warning || '').includes('only under uix:') && pv.hasCopyBtn, JSON.stringify(pv));
    await panelLoc(T).locator('.btn-banner-action').click();
    await expectCfg(T, 'Copy to card_mod: card_mod.style = uix.style, class kept, uix untouched', (c) => c.card_mod?.style === STYLE && c.card_mod?.class === 'fui-class' && c.uix?.style === STYLE, { allowOther: true, show: (c) => JSON.stringify(c) });
    await expectPage(T, 'preview: card-mod now renders the copied style', P_CARD, 0, (v) => sameRgb(v?.bg, 'rgb(34, 68, 102)'));
    await cancelDialog(T);
    await clickEditOn(T, 1);
    await openStudio(T);
    pv = await T.page.evaluate(P_PANEL);
    T.check('card-mod rig: uix macros card shows the incompatibility warning WITHOUT a Copy button', (pv.warning || '').includes('UIX-only features') && !pv.hasCopyBtn, JSON.stringify(pv));
  } else {
    T.check('UIX rig: a uix-only card shows no compat warning', !pv.warning && !pv.hasCopyBtn, JSON.stringify(pv));
    await expectPage(T, 'UIX rig: preview renders the uix style', P_CARD, 0, (v) => sameRgb(v?.bg, 'rgb(34, 68, 102)'));
    await cancelDialog(T);
    await clickEditOn(T, 1);
    await openStudio(T);
    pv = await T.page.evaluate(P_PANEL);
    T.check('UIX rig: macros card warns that editing replaces macro styling', (pv.info || []).some((t) => t.includes('macros/billets')) && !pv.hasCopyBtn, JSON.stringify(pv));
  }
  await cancelDialog(T);
}

export const SECTIONS = [
  { id: 'entities', run: entitiesSection },
  { id: 'stack', run: stackSection },
  { id: 'presets', run: presetsSection },
  { id: 'palette', run: paletteSection },
  { id: 'picker', run: pickerSection },
  { id: 'dict', run: dictSection },
  { id: 'mixed', run: mixedSection },
  { id: 'uixonly', run: uixOnlySection },
];

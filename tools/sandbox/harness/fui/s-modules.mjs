// Module sections: every control of every visual module, real input only.
import {
  sleep, openEditor, openStudio, mod, isOpen, expand, enable, setSwitch, choose, setSlider, typeInto,
  pickSwatch, pickText, pickCompact, pickEntity, expectCfg, expectPage, styleStr, resolveRgb, entityState,
  sameRgb, rowOf, btn, shot, getCfg, panelLoc,
} from './lib.mjs';
import { P_CARD, P_EL, P_HEADING, P_GAUGE, P_PANEL } from './probes.mjs';

const S = (T, c) => styleStr(T, c);
const has = (T, ...parts) => (c) => parts.every((p) => S(T, c).includes(p));
const lacks = (T, ...parts) => (c) => parts.every((p) => !S(T, c).includes(p));
const noStyle = (T) => (c) => !c?.[T.KEY]?.style && !c?.[T.OTHER]?.style;
const isOn = async (T, id) => (await entityState(T, id))?.state === 'on';

const TILE_LIGHT = { type: 'tile', entity: 'light.ceiling_lights' };

// ---------------------------------------------------------------------------
// Font
// ---------------------------------------------------------------------------

async function fontTile(T) {
  await openEditor(T, 'fui-font', [TILE_LIGHT]);
  await openStudio(T);
  const m = mod(T, 'cms-font-module');
  await enable(m);
  await expectCfg(T, 'tile: enabling Font emits the ha-card block + --ha-tile-info-* companions', has(T, 'font-size: 16px', '--ha-tile-info-primary-font-size: 16px'));
  T.check('module expands itself when switched on', await isOpen(m));

  await setSlider(T, rowOf(T, m, 'Text size').locator('ha-slider'), 24);
  await expectCfg(T, 'tile: Text size slider → 24px emitted (base + companion)', has(T, 'font-size: 24px', '--ha-tile-info-primary-font-size: 24px', '--ha-tile-info-secondary-font-size: 24px'));
  T.check('Text size value label reads 24px', (await rowOf(T, m, 'Text size').locator('.value-label').textContent()).trim() === '24px');
  await expectPage(T, 'tile preview: name text renders at 24px', P_CARD, 0, (v) => v?.pSize === '24px');

  const weight = rowOf(T, m, 'Weight').locator('select');
  for (const [w, css, cw] of [['medium', '500', '500'], ['bold', 'bold', '700'], ['normal', 'normal', '400']]) {
    await choose(weight, w);
    await expectCfg(T, `Weight "${w}" → font-weight: ${css}`, has(T, `font-weight: ${css};`, `--ha-tile-info-primary-font-weight: ${css};`));
    await expectPage(T, `tile preview: weight ${w} renders ${cw}`, P_CARD, 0, (v) => v?.pWeight === cw);
  }

  const fam = rowOf(T, m, 'Font family').locator('select');
  for (const f of ['serif', 'monospace', 'sans-serif']) {
    await choose(fam, f);
    await expectCfg(T, `Font family "${f}" → font-family: ${f}`, has(T, `font-family: ${f};`));
    await expectPage(T, `tile preview: name renders in ${f}`, P_CARD, 0, (v) => (v?.pFamily || '').includes(f));
  }
  await choose(fam, '');
  await expectCfg(T, 'Font family "Theme default" → no font-family declaration', lacks(T, 'font-family'));

  // Custom… : the free-text family field must appear
  await choose(fam, 'custom');
  const custom = rowOf(T, m, 'Custom family').locator('input');
  const appeared = await custom.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
  T.check('Font family "Custom…" reveals the custom family text field', appeared, appeared ? undefined : `select now shows "${await fam.evaluate((s) => s.value)}" but no "Custom family" input rendered; config unchanged: ${S(T, await getCfg(T)).includes('font-family') ? 'has font-family' : 'no font-family'}`);
  if (appeared) {
    await typeInto(custom, 'Georgia, serif');
    await expectCfg(T, 'custom family typed → font-family: Georgia, serif', has(T, 'font-family: Georgia, serif;'));
    await expectPage(T, 'tile preview: custom family renders', P_CARD, 0, (v) => (v?.pFamily || '').includes('Georgia'));
    await choose(fam, '');
    await expectCfg(T, 'back to Theme default removes the custom family', lacks(T, 'font-family'));
  } else {
    await shot(T, 'custom-family-missing');
  }

  const picker = rowOf(T, m, 'Text color').locator('cms-color-picker');
  await pickSwatch(picker, 'Red');
  await expectCfg(T, 'Text color swatch Red → color + tile color vars use var(--red-color)', has(T, 'color: var(--red-color);', '--ha-tile-info-primary-color: var(--red-color);'));
  const red = await resolveRgb(T, 'var(--red-color)');
  await expectPage(T, 'tile preview: name renders red', P_CARD, 0, (v) => sameRgb(v?.pColor, red));
  T.check('Red swatch shows as selected', (await picker.locator('button.preset[aria-label="Red"]').getAttribute('aria-pressed')) === 'true');
  await pickText(picker, '#123456');
  await expectCfg(T, 'Text color typed #123456 → color: #123456', has(T, 'color: #123456;'));
  await expectPage(T, 'tile preview: name renders #123456', P_CARD, 0, (v) => sameRgb(v?.pColor, 'rgb(18, 52, 86)'));

  await enable(m, false);
  await expectCfg(T, 'switching Font off removes the whole style', noStyle(T));
  await expectPage(T, 'tile preview: name back to its theme size', P_CARD, 0, (v) => v && v.pSize !== '24px');
}

async function fontOn(T, label, card, probes) {
  await openEditor(T, 'fui-font-' + card.type, [card]);
  await openStudio(T);
  const m = mod(T, 'cms-font-module');
  await enable(m);
  await setSlider(T, rowOf(T, m, 'Text size').locator('ha-slider'), 22);
  await choose(rowOf(T, m, 'Weight').locator('select'), 'bold');
  await pickSwatch(rowOf(T, m, 'Text color').locator('cms-color-picker'), 'Purple');
  await expectCfg(T, `${label}: size 22 / bold / Purple emitted`, has(T, 'font-size: 22px', 'font-weight: bold', 'var(--purple-color)'));
  const purple = await resolveRgb(T, 'var(--purple-color)');
  for (const p of probes) {
    await expectPage(T, `${label} preview: ${p.what}`, P_EL, p.arg, (v) => p.ok(v, purple));
  }
}

async function fontSection(T) {
  await fontTile(T);
  await fontOn(T, 'light card', { type: 'light', entity: 'light.ceiling_lights' }, [
    { what: '#info text 22px / 700 / purple', arg: { within: 'hui-light-card', sel: '#info', props: ['fontSize', 'fontWeight', 'color'] }, ok: (v, p) => v?.fontSize === '22px' && v.fontWeight === '700' && sameRgb(v.color, p) },
  ]);
  await fontOn(T, 'sensor card', { type: 'sensor', entity: 'sensor.outside_temperature' }, [
    { what: 'name 22px purple', arg: { within: 'hui-sensor-card', sel: '.name', props: ['fontSize', 'color'] }, ok: (v, p) => v?.fontSize === '22px' && sameRgb(v.color, p) },
    { what: 'value 1.75× = 38.5px', arg: { within: 'hui-sensor-card', sel: '.value', props: ['fontSize'] }, ok: (v) => v?.fontSize === '38.5px' },
  ]);
  await fontOn(T, 'entities card', { type: 'entities', title: 'FUI', entities: ['sensor.outside_temperature', 'switch.ac'] }, [
    { what: 'row text 22px / 700 / purple', arg: { within: 'hui-entities-card', sel: '.info', props: ['fontSize', 'fontWeight', 'color'] }, ok: (v, p) => v?.fontSize === '22px' && v.fontWeight === '700' && sameRgb(v.color, p) },
    { what: 'title 1.5× = 33px purple bold', arg: { within: 'hui-entities-card', sel: '.card-header', props: ['fontSize', 'fontWeight', 'color'] }, ok: (v, p) => v?.fontSize === '33px' && v.fontWeight === '700' && sameRgb(v.color, p) },
  ]);
  await fontOn(T, 'gauge card', { type: 'gauge', entity: 'sensor.outside_humidity', min: 0, max: 100 }, [
    { what: 'title 22px / 700 / purple', arg: { within: 'hui-gauge-card', sel: '.title, .name', props: ['fontSize', 'fontWeight', 'color'] }, ok: (v, p) => v?.fontSize === '22px' && v.fontWeight === '700' && sameRgb(v.color, p) },
    { what: 'SVG value text recoloured purple (fill)', arg: { within: 'hui-gauge-card', sel: '.value-text', props: ['fill'] }, ok: (v, p) => sameRgb(v?.fill, p) },
  ]);
  await fontOn(T, 'thermostat card', { type: 'thermostat', entity: 'climate.heatpump' }, [
    { what: 'title 22px / 700 / purple', arg: { within: 'hui-thermostat-card', sel: '.title', props: ['fontSize', 'fontWeight', 'color'] }, ok: (v, p) => v?.fontSize === '22px' && v.fontWeight === '700' && sameRgb(v.color, p) },
  ]);
}

// ---------------------------------------------------------------------------
// Visual Filters
// ---------------------------------------------------------------------------

async function filterSection(T) {
  await openEditor(T, 'fui-filter', [TILE_LIGHT]);
  await openStudio(T);
  const m = mod(T, 'cms-filter-module');
  await enable(m);
  await expectCfg(T, 'enabling with neutral defaults emits nothing (no filter decl)', noStyle(T));
  T.check('module expands itself when switched on', await isOpen(m));
  const lightOn = await isOn(T, 'light.ceiling_lights');

  // ---- grayscale + its "Apply when" ----
  await setSwitch(rowOf(T, m, 'Grayscale').locator('ha-switch'), true);
  await expectCfg(T, 'Grayscale on (default "OFF") → conditional grayscale on own entity off', has(T, "filter: {{ 'grayscale(100%)' if is_state(config.entity, 'off') else 'none' }};"));
  const applyWhen = rowOf(T, m, 'Apply when').locator('select');
  const opts = await applyWhen.locator('option').evaluateAll((os) => os.map((o) => o.value));
  T.check('grayscale "Apply when" offers Always / ON / OFF / another entity', JSON.stringify(opts) === JSON.stringify(['always', 'on', 'off', 'custom']), JSON.stringify(opts));
  await expectPage(T, `preview: grayscale-when-OFF follows the light (${lightOn ? 'on → none' : 'off → gray'})`, P_CARD, 0, (v) => (lightOn ? v?.filter === 'none' : v?.filter?.includes('grayscale(1)')));
  await choose(applyWhen, 'always');
  // tile: the transition is !important (the tile's own stylesheet overrides a plain one)
  await expectCfg(T, 'Apply when Always → filter: grayscale(100%)', has(T, 'filter: grayscale(100%);', 'transition: filter 300ms ease !important;'));
  await expectPage(T, 'preview: grayscale applied', P_CARD, 0, (v) => v?.filter === 'grayscale(1)');
  await choose(applyWhen, 'on');
  await expectCfg(T, 'Apply when ON → is_state(config.entity, on)', has(T, "if is_state(config.entity, 'on') else 'none'"));
  await expectPage(T, 'preview: grayscale-when-ON follows the light', P_CARD, 0, (v) => (lightOn ? v?.filter === 'grayscale(1)' : v?.filter === 'none'));
  await choose(applyWhen, 'custom');
  const ent = rowOf(T, m, 'Entity').locator('cms-entity-picker');
  await ent.waitFor({ state: 'visible' });
  await expectCfg(T, 'another entity, none picked yet → unconditional grayscale', has(T, 'filter: grayscale(100%);'));
  await pickEntity(T, ent, 'switch.ac');
  await expectCfg(T, 'entity picked (switch.ac) via HA picker → is_state(\'switch.ac\', \'on\')', has(T, "is_state('switch.ac', 'on')"));
  const acOn = await isOn(T, 'switch.ac');
  await expectPage(T, `preview: grayscale follows switch.ac (${acOn ? 'on' : 'off'})`, P_CARD, 0, (v) => (acOn ? v?.filter === 'grayscale(1)' : v?.filter === 'none'));
  T.check('hint names the chosen entity', (await m.locator('.when-hint').first().textContent()).includes('switch.ac'));
  await setSwitch(rowOf(T, m, 'Grayscale').locator('ha-switch'), false);
  await expectCfg(T, 'Grayscale off → no filter (neutral sliders)', noStyle(T));

  // ---- sliders ----
  await setSlider(T, rowOf(T, m, 'Brightness').locator('ha-slider'), 150);
  await expectCfg(T, 'Brightness 150 → filter: brightness(150%)', has(T, 'filter: brightness(150%);'));
  await expectPage(T, 'preview: brightness(1.5)', P_CARD, 0, (v) => v?.filter === 'brightness(1.5)');
  await setSlider(T, rowOf(T, m, 'Blur').locator('ha-slider'), 4);
  await expectCfg(T, 'Blur 4 → blur(4px) added', has(T, 'filter: brightness(150%) blur(4px);'));
  await setSlider(T, rowOf(T, m, 'Opacity').locator('ha-slider'), 50);
  await expectCfg(T, 'Opacity 50 → opacity(50%) added', has(T, 'filter: brightness(150%) blur(4px) opacity(50%);'));
  await expectPage(T, 'preview: brightness+blur+opacity all applied', P_CARD, 0, (v) => v?.filter === 'brightness(1.5) blur(4px) opacity(0.5)');
  await setSlider(T, rowOf(T, m, 'Transition speed').locator('ha-slider'), 600);
  await expectCfg(T, 'Transition speed 600 → transition: filter 600ms ease !important (tile)', has(T, 'transition: filter 600ms ease !important;'));
  await expectPage(T, 'preview: transition-duration 0.6s on filter', P_CARD, 0, (v) => v?.transDur === '0.6s' && v.transProp === 'filter');

  // ---- "Reacts to" (effects condition) ----
  const reacts = rowOf(T, m, 'Reacts to').locator('select');
  const ropts = await reacts.locator('option').evaluateAll((os) => os.map((o) => o.value));
  T.check('"Reacts to" offers Always / ON / OFF / another entity / value', JSON.stringify(ropts) === JSON.stringify(['always', 'on', 'off', 'custom', 'value']), JSON.stringify(ropts));
  const FX = 'brightness(150%) blur(4px) opacity(50%)';
  const FXV = 'brightness(1.5) blur(4px) opacity(0.5)';
  await choose(reacts, 'on');
  await expectCfg(T, 'Reacts to ON → ternary on own entity', has(T, `filter: {{ '${FX}' if is_state(config.entity, 'on') else 'none' }};`));
  await expectPage(T, 'preview: effects follow the light (ON)', P_CARD, 0, (v) => (lightOn ? v?.filter === FXV : v?.filter === 'none'));
  await choose(reacts, 'off');
  await expectCfg(T, 'Reacts to OFF → ternary on own entity off', has(T, `if is_state(config.entity, 'off') else 'none'`));
  await expectPage(T, 'preview: effects follow the light (OFF)', P_CARD, 0, (v) => (!lightOn ? v?.filter === FXV : v?.filter === 'none'));
  await choose(reacts, 'custom');
  await pickEntity(T, rowOf(T, m, 'Entity').locator('cms-entity-picker'), 'switch.decorative_lights');
  await expectCfg(T, 'Reacts to another entity (switch.decorative_lights)', has(T, `if is_state('switch.decorative_lights', 'on') else 'none'`));
  const decoOn = await isOn(T, 'switch.decorative_lights');
  await expectPage(T, 'preview: effects follow switch.decorative_lights', P_CARD, 0, (v) => (decoOn ? v?.filter === FXV : v?.filter === 'none'));
  await choose(reacts, 'value');
  await pickEntity(T, rowOf(T, m, 'Entity').locator('cms-entity-picker'), 'light.ceiling_lights');
  const attrSel = rowOf(T, m, 'Value read from').locator('select');
  await attrSel.waitFor({ state: 'visible' });
  const attrs = await attrSel.locator('option').evaluateAll((os) => os.map((o) => o.value));
  T.check('"Value read from" lists State + numeric attributes (brightness)', attrs[0] === '' && attrs.includes('brightness'), JSON.stringify(attrs));
  await choose(attrSel, 'brightness');
  await choose(rowOf(T, m, 'Condition').locator('select'), '>');
  await typeInto(rowOf(T, m, 'Threshold').locator('input'), '100');
  await expectCfg(T, 'value condition: brightness attribute > 100', has(T, `if state_attr('light.ceiling_lights', 'brightness') | float(0) > 100 else 'none'`));
  const bri = Number((await entityState(T, 'light.ceiling_lights'))?.attributes?.brightness ?? 0);
  await expectPage(T, `preview: brightness ${bri} > 100 → effects ${bri > 100 ? 'on' : 'off'}`, P_CARD, 0, (v) => (bri > 100 ? v?.filter === FXV : v?.filter === 'none'));
  await choose(rowOf(T, m, 'Condition').locator('select'), '<=');
  await typeInto(rowOf(T, m, 'Threshold').locator('input'), '1000');
  await expectCfg(T, 'operator <= and threshold 1000 typed', has(T, `| float(0) <= 1000 else 'none'`));
  await expectPage(T, 'preview: <= 1000 holds → effects on', P_CARD, 0, (v) => v?.filter === FXV);
  await choose(reacts, 'always');
  await expectCfg(T, 'Reacts to Always → unconditional again', has(T, `filter: ${FX};`));

  // transition speed on a non-tile card (scopes the tile result above)
  await openEditor(T, 'fui-filter-sensor', [{ type: 'sensor', entity: 'sensor.outside_temperature' }]);
  await openStudio(T);
  const m2 = mod(T, 'cms-filter-module');
  await enable(m2);
  await setSlider(T, rowOf(T, m2, 'Brightness').locator('ha-slider'), 50);
  await setSlider(T, rowOf(T, m2, 'Transition speed').locator('ha-slider'), 1000);
  await expectCfg(T, 'sensor card: brightness 50 + transition 1000ms', has(T, 'filter: brightness(50%);', 'transition: filter 1000ms ease;'));
  await expectPage(T, 'sensor card preview: filter + 1s filter transition applied', P_CARD, 0, (v) => v?.filter === 'brightness(0.5)' && v.transDur === '1s' && v.transProp === 'filter');
  const opts2 = await rowOf(T, m2, 'Reacts to').locator('select option').evaluateAll((os) => os.map((o) => o.value));
  T.check('non-state card (sensor): "Reacts to" hides the ON/OFF options', JSON.stringify(opts2) === JSON.stringify(['always', 'custom', 'value']), JSON.stringify(opts2));
}

// ---------------------------------------------------------------------------
// Accent Color
// ---------------------------------------------------------------------------

async function accentSection(T) {
  // tile
  await openEditor(T, 'fui-accent', [TILE_LIGHT]);
  await openStudio(T);
  let m = mod(T, 'cms-accent-color-module');
  await enable(m);
  await expectCfg(T, 'tile: enabling emits --accent-color + --tile-color !important', has(T, '--accent-color: #03a9f4;', '--tile-color: #03a9f4 !important;', '--state-icon-color: #03a9f4;'));
  await expectPage(T, 'tile preview: --tile-color resolves to #03a9f4', P_CARD, 0, (v) => sameRgb(v?.tileColor, 'rgb(3, 169, 244)'));
  await pickSwatch(rowOf(T, m, 'Color').locator('cms-color-picker'), 'Green');
  const green = await resolveRgb(T, 'var(--green-color)');
  await expectCfg(T, 'swatch Green → var(--green-color)', has(T, '--tile-color: var(--green-color) !important;'));
  const lightOn = await isOn(T, 'light.ceiling_lights');
  await expectPage(T, 'tile preview: tile colour (and active icon) green', P_CARD, 0, (v) => sameRgb(v?.tileColor, green) && (!lightOn || sameRgb(v.iconColor, green)));
  await choose(rowOf(T, m, 'Color mode').locator('select'), 'conditional');
  await rowOf(T, m, 'Color when ON').waitFor();
  T.check('ON/OFF mode shows Controlled by + both colour pickers', (await rowOf(T, m, 'Controlled by').count()) === 1 && (await rowOf(T, m, 'Color when OFF').count()) === 1);
  await pickSwatch(rowOf(T, m, 'Color when ON').locator('cms-color-picker'), 'Red');
  await pickSwatch(rowOf(T, m, 'Color when OFF').locator('cms-color-picker'), 'Orange');
  await expectCfg(T, 'ON Red / OFF Orange → ternary on own entity', has(T, `--tile-color: {{ 'var(--red-color)' if is_state(config.entity, 'on') else 'var(--orange-color)' }} !important;`));
  const red = await resolveRgb(T, 'var(--red-color)');
  const orange = await resolveRgb(T, 'var(--orange-color)');
  await expectPage(T, `tile preview: light ${lightOn ? 'on → red' : 'off → orange'}`, P_CARD, 0, (v) => sameRgb(v?.tileColor, lightOn ? red : orange));
  await pickEntity(T, rowOf(T, m, 'Controlled by').locator('cms-entity-picker'), 'switch.ac');
  await expectCfg(T, 'Controlled by switch.ac → is_state(\'switch.ac\', \'on\')', has(T, `{{ 'var(--red-color)' if is_state('switch.ac', 'on') else 'var(--orange-color)' }}`));
  const acOn = await isOn(T, 'switch.ac');
  await expectPage(T, `tile preview: follows switch.ac (${acOn ? 'red' : 'orange'})`, P_CARD, 0, (v) => sameRgb(v?.tileColor, acOn ? red : orange));
  T.check('hint says it uses switch.ac', (await m.locator('.when-hint').allTextContents()).some((t) => t.includes("Uses switch.ac's on/off state")));

  // gauge (dial)
  await openEditor(T, 'fui-accent-gauge', [{ type: 'gauge', entity: 'sensor.outside_humidity', min: 0, max: 100 }]);
  await openStudio(T);
  m = mod(T, 'cms-accent-color-module');
  await enable(m);
  T.check('gauge: needle-mode note shown', (await m.locator('.when-hint').allTextContents()).some((t) => t.includes('needle: true')));
  await pickSwatch(rowOf(T, m, 'Color').locator('cms-color-picker'), 'Purple');
  await expectCfg(T, 'gauge: separate ha-gauge block with --gauge-color !important', has(T, 'ha-gauge {\n  --gauge-color: var(--purple-color) !important;\n}'));
  const purple = await resolveRgb(T, 'var(--purple-color)');
  await expectPage(T, 'gauge preview: dial value arc stroked purple', P_GAUGE, null, (v) => sameRgb(v?.stroke, purple));

  // gauge needle mode
  await openEditor(T, 'fui-accent-needle', [{ type: 'gauge', entity: 'sensor.outside_humidity', min: 0, max: 100, needle: true, segments: [{ from: 0, color: '#4caf50' }, { from: 60, color: '#f44336' }] }]);
  await openStudio(T);
  m = mod(T, 'cms-accent-color-module');
  await enable(m);
  await pickSwatch(rowOf(T, m, 'Color').locator('cms-color-picker'), 'Teal');
  await expectCfg(T, 'needle gauge: also emits --primary-text-color !important on ha-gauge', has(T, '--gauge-color: var(--teal-color) !important;', '--primary-text-color: var(--teal-color) !important;'));
  const teal = await resolveRgb(T, 'var(--teal-color)');
  await expectPage(T, 'needle gauge preview: needle filled teal', P_GAUGE, null, (v) => sameRgb(v?.needleFill, teal));

  // light card: nothing on it reads the accent colour (module_effect_audit,
  // v0.10.0) — the module isn't offered there, nor Threshold's Accent option.
  await openEditor(T, 'fui-accent-light', [{ type: 'light', entity: 'light.ceiling_lights' }]);
  await openStudio(T);
  T.check('light card: Accent Color not offered (no visible effect there)', (await panelLoc(T).locator('cms-accent-color-module').count()) === 0);
  const thr = mod(T, 'cms-threshold-module');
  await enable(thr);
  await expand(thr);
  const opts = await thr.locator('label.property-check').allTextContents();
  T.check('light card: Threshold offers no Accent option', !opts.some((t) => /accent/i.test(t)), JSON.stringify(opts.map((t) => t.trim())));
}

// ---------------------------------------------------------------------------
// Icon Color
// ---------------------------------------------------------------------------

async function iconSection(T) {
  await openEditor(T, 'fui-icon', [TILE_LIGHT]);
  await openStudio(T);
  let m = mod(T, 'cms-icon-color-module');
  await enable(m);
  const lightOn = await isOn(T, 'light.ceiling_lights');
  await expectCfg(T, 'tile: enabling → default ON/OFF ternary on own entity', has(T, `ha-state-icon {\n  color: {{ '#2196F3' if is_state(config.entity, 'on') else '#6b6b6b' }} !important;\n}`));
  await expectPage(T, `tile preview: icon ${lightOn ? '#2196F3' : '#6b6b6b'}`, P_CARD, 0, (v) => sameRgb(v?.iconColor, lightOn ? 'rgb(33, 150, 243)' : 'rgb(107, 107, 107)'));
  const modeSel = rowOf(T, m, 'Color mode').locator('select');
  const modes = await modeSel.locator('option').evaluateAll((os) => os.map((o) => o.value));
  T.check('tile: modes are fixed / ON-OFF (no light mode)', JSON.stringify(modes) === JSON.stringify(['plain', 'conditional']), JSON.stringify(modes));
  await choose(modeSel, 'plain');
  await expectCfg(T, 'One fixed color → plain !important rule', has(T, 'ha-state-icon {\n  color: #2196F3 !important;\n}'));
  await pickSwatch(rowOf(T, m, 'Color').locator('cms-color-picker'), 'Pink');
  const pink = await resolveRgb(T, 'var(--pink-color)');
  await expectCfg(T, 'swatch Pink', has(T, 'color: var(--pink-color) !important;'));
  await expectPage(T, 'tile preview: icon pink', P_CARD, 0, (v) => sameRgb(v?.iconColor, pink));
  await pickText(rowOf(T, m, 'Color').locator('cms-color-picker'), '#00ff00');
  await expectPage(T, 'typed #00ff00 → icon rgb(0, 255, 0)', P_CARD, 0, (v) => sameRgb(v?.iconColor, 'rgb(0, 255, 0)'));
  await choose(modeSel, 'conditional');
  await pickSwatch(rowOf(T, m, 'Color when ON').locator('cms-color-picker'), 'Red');
  await pickSwatch(rowOf(T, m, 'Color when OFF').locator('cms-color-picker'), 'Grey');
  await expectCfg(T, 'ON Red / OFF Grey', has(T, `{{ 'var(--red-color)' if is_state(config.entity, 'on') else 'var(--grey-color)' }}`));
  const red = await resolveRgb(T, 'var(--red-color)');
  const grey = await resolveRgb(T, 'var(--grey-color)');
  await expectPage(T, 'tile preview: ON/OFF icon follows the light', P_CARD, 0, (v) => sameRgb(v?.iconColor, lightOn ? red : grey));
  await pickEntity(T, rowOf(T, m, 'Controlled by').locator('cms-entity-picker'), 'switch.ac');
  const acOn = await isOn(T, 'switch.ac');
  await expectCfg(T, 'Controlled by switch.ac', has(T, `is_state('switch.ac', 'on') else 'var(--grey-color)'`));
  await expectPage(T, 'tile preview: icon follows switch.ac', P_CARD, 0, (v) => sameRgb(v?.iconColor, acOn ? red : grey));

  // icon size (tile)
  const size = rowOf(T, m, 'Icon size');
  T.check('tile: Icon size control offered', (await size.count()) === 1);
  T.check('Icon size starts at "theme"', (await size.locator('.value-label').textContent()).trim() === 'theme');
  await setSlider(T, size.locator('ha-slider'), 40);
  await expectCfg(T, 'Icon size 40 → ha-tile-icon { --mdc-icon-size: 40px }', has(T, 'ha-tile-icon {\n  --mdc-icon-size: 40px;\n}'));
  await expectPage(T, 'tile preview: icon renders 40px', P_CARD, 0, (v) => v?.svgW === 40);
  const sizeReacts = m.locator('.control-row').filter({ hasText: 'Reacts to' }).locator('select');
  await choose(sizeReacts, 'off');
  await expectCfg(T, 'size Reacts to OFF → ternary with 24px fallback', has(T, `--mdc-icon-size: {{ '40px' if is_state(config.entity, 'off') else '24px' }};`));
  await expectPage(T, `tile preview: size follows the light (${lightOn ? '24' : '40'}px)`, P_CARD, 0, (v) => v?.svgW === (lightOn ? 24 : 40));
  await setSlider(T, rowOf(T, m, 'Size otherwise').locator('ha-slider'), 32);
  await expectCfg(T, 'Size otherwise 32', has(T, `else '32px' }}`));
  await expectPage(T, `tile preview: ${lightOn ? 'otherwise-size 32px' : 'still 40px'}`, P_CARD, 0, (v) => v?.svgW === (lightOn ? 32 : 40));
  await setSlider(T, size.locator('ha-slider'), 0);
  await expectCfg(T, 'Icon size back to 0 → size block removed', lacks(T, 'ha-tile-icon', '--mdc-icon-size'));

  // entity card
  await openEditor(T, 'fui-icon-entity', [{ type: 'entity', entity: 'sensor.outside_temperature' }]);
  await openStudio(T);
  m = mod(T, 'cms-icon-color-module');
  await enable(m);
  await choose(rowOf(T, m, 'Color mode').locator('select'), 'plain');
  await pickSwatch(rowOf(T, m, 'Color').locator('cms-color-picker'), 'Red');
  await expectPage(T, 'entity card preview: icon red', P_EL, { within: 'hui-entity-card', sel: 'ha-state-icon', props: ['color'] }, (v) => sameRgb(v?.color, red));
  await setSlider(T, rowOf(T, m, 'Icon size').locator('ha-slider'), 36);
  await expectCfg(T, 'entity card: size 36 → --mdc-icon-size/--ha-icon-size on ha-card', has(T, '--mdc-icon-size: 36px;', '--ha-icon-size: 36px;'));
  await expectPage(T, 'entity card preview: icon renders 36px', P_EL, { within: 'hui-entity-card', sel: 'ha-svg-icon', props: ['width'] }, (v) => v?.width === 36);

  // button card
  await openEditor(T, 'fui-icon-button', [{ type: 'button', entity: 'switch.decorative_lights' }]);
  await openStudio(T);
  m = mod(T, 'cms-icon-color-module');
  await enable(m);
  await choose(rowOf(T, m, 'Color mode').locator('select'), 'plain');
  await pickSwatch(rowOf(T, m, 'Color').locator('cms-color-picker'), 'Orange');
  const orange = await resolveRgb(T, 'var(--orange-color)');
  await expectPage(T, 'button card preview: icon orange', P_EL, { within: 'hui-button-card', sel: 'ha-state-icon', props: ['color'] }, (v) => sameRgb(v?.color, orange));
  T.check('button card: no Icon size control (not in the allowlist)', (await rowOf(T, m, 'Icon size').count()) === 0);

  // light card: "match the light's colour"
  const rgbLight = await T.page.evaluate(() => {
    const st = document.querySelector('home-assistant').hass.states;
    return Object.keys(st).find((id) => id.startsWith('light.') && st[id].state === 'on' && Array.isArray(st[id].attributes.rgb_color)) || null;
  });
  await openEditor(T, 'fui-icon-light', [{ type: 'light', entity: rgbLight || 'light.living_room_rgbww_lights' }]);
  await openStudio(T);
  m = mod(T, 'cms-icon-color-module');
  await enable(m);
  const lmodes = await rowOf(T, m, 'Color mode').locator('select option').evaluateAll((os) => os.map((o) => o.value));
  T.check('light card: "Match the light\'s color" mode offered', lmodes.includes('light'), JSON.stringify(lmodes));
  await choose(rowOf(T, m, 'Color mode').locator('select'), 'light');
  T.check('light mode shows only "Color when OFF"', (await rowOf(T, m, 'Color when OFF').count()) === 1 && (await rowOf(T, m, 'Color when ON').count()) === 0);
  await expectCfg(T, 'light mode → rgb_color Jinja on own entity', has(T, "state_attr(config.entity, 'rgb_color')", "else '#6b6b6b' }} !important;"));
  if (rgbLight) {
    const rgb = (await entityState(T, rgbLight)).attributes.rgb_color;
    await expectPage(T, `light card preview: icon = the light's rgb_color (${rgb})`, P_EL, { within: 'hui-light-card', sel: 'ha-state-icon', props: ['color'] }, (v) => sameRgb(v?.color, `rgb(${rgb.join(', ')})`));
  } else {
    T.note('no light with rgb_color on → light-mode render not measured');
  }
  await pickEntity(T, rowOf(T, m, 'Controlled by').locator('cms-entity-picker'), 'light.bed_light');
  await expectCfg(T, 'light mode Controlled by light.bed_light', has(T, "state_attr('light.bed_light', 'rgb_color')"));
  const bedOn = await isOn(T, 'light.bed_light');
  if (!bedOn) await expectPage(T, 'light card preview: bed light off → OFF colour #6b6b6b', P_EL, { within: 'hui-light-card', sel: 'ha-state-icon', props: ['color'] }, (v) => sameRgb(v?.color, 'rgb(107, 107, 107)'));
  T.check('light card: no Icon size control', (await rowOf(T, m, 'Icon size').count()) === 0);
}

// ---------------------------------------------------------------------------
// Threshold Colors
// ---------------------------------------------------------------------------

// Mirrors css-generator's gradientToRules/colorAtValue (Fade mode) so the
// expected rendered colour can be computed independently.
function hexToRgb(h) {
  let x = h.replace('#', '');
  if (x.length === 3) x = [...x].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
}
function colorAt(stops, v) {
  const s = [...stops].sort((a, b) => a.value - b.value);
  if (v <= s[0].value) return hexToRgb(s[0].color);
  if (v >= s[s.length - 1].value) return hexToRgb(s[s.length - 1].color);
  for (let i = 0; i < s.length - 1; i++) {
    if (v >= s[i].value && v <= s[i + 1].value) {
      const t = (v - s[i].value) / (s[i + 1].value - s[i].value || 1);
      const a = hexToRgb(s[i].color); const b = hexToRgb(s[i + 1].color);
      return a.map((c, k) => Math.max(0, Math.min(255, Math.round(c + (b[k] - c) * t))));
    }
  }
  return hexToRgb(s[s.length - 1].color);
}
function fadeExpected(stops, x) {
  const s = [...stops].sort((a, b) => a.value - b.value);
  const min = s[0].value; const max = s[s.length - 1].value;
  let pick = null;
  for (let i = 1; i <= 32; i++) {
    const v = Math.round((min + ((max - min) * i) / 32) * 100) / 100;
    if (x >= v) pick = v;
  }
  const c = pick === null ? hexToRgb(s[0].color) : colorAt(s, pick);
  return `rgb(${c.join(', ')})`;
}
function decodeMarker(style) {
  const m = style.match(/--cms-gradient-stops: '([^']+)'/);
  if (!m) return null;
  return m[1].split(',').map((p) => { const [v, c] = p.split(':'); return { value: Number(v), color: c }; });
}

async function thresholdSection(T) {
  const ENT = 'sensor.outside_humidity';
  await openEditor(T, 'fui-threshold', [{ type: 'tile', entity: ENT }]);
  await openStudio(T);
  const m = mod(T, 'cms-threshold-module');
  await enable(m);
  const hum = Number((await entityState(T, ENT)).state);
  T.check('enabling pre-fills the card\'s own entity', (await m.locator('cms-entity-picker').first().evaluate((p) => p.value)) === ENT);
  await expectCfg(T, 'no rules yet → nothing emitted', noStyle(T));
  T.check('Result legend reads "Always" + default swatch', (await m.locator('.legend').textContent()).includes('Always'));

  const addRule = btn(m, '+ Add Rule');
  await addRule.click();
  await expectCfg(T, '+ Add Rule → default rule (< 0, palette ON default) on icon colour', has(T, `ha-state-icon {\n  color: {{ '#2196F3' if states('${ENT}') | float(0) < 0 else '#888888' }} !important;\n}`));
  await expectPage(T, `preview: ${hum} < 0 false → default #888888`, P_CARD, 0, (v) => sameRgb(v?.iconColor, 'rgb(136, 136, 136)'));
  const rule0 = m.locator('.rule').nth(0);
  await choose(rule0.locator('select'), '>');
  await typeInto(rule0.locator('input[type="number"]'), '50');
  await expectCfg(T, 'operator > and value 50 typed', has(T, `'#2196F3' if states('${ENT}') | float(0) > 50 else '#888888'`));
  await expectPage(T, `preview: ${hum} > 50 → #2196F3`, P_CARD, 0, (v) => sameRgb(v?.iconColor, hum > 50 ? 'rgb(33, 150, 243)' : 'rgb(136, 136, 136)'));
  await pickCompact(T, rule0.locator('cms-color-picker'), 'Red');
  const red = await resolveRgb(T, 'var(--red-color)');
  await expectCfg(T, 'rule colour via compact popover swatch → var(--red-color)', has(T, `'var(--red-color)' if states('${ENT}') | float(0) > 50`));
  await expectPage(T, 'preview: rule colour red', P_CARD, 0, (v) => sameRgb(v?.iconColor, hum > 50 ? red : 'rgb(136, 136, 136)'));
  await addRule.click();
  const rule1 = m.locator('.rule').nth(1);
  await choose(rule1.locator('select'), '>');
  await typeInto(rule1.locator('input[type="number"]'), '80');
  await pickCompact(T, rule1.locator('cms-color-picker'), 'Green');
  await expectCfg(T, 'second rule > 80 green, sorted first (highest > first)', has(T, `{{ 'var(--green-color)' if states('${ENT}') | float(0) > 80 else ('var(--red-color)' if states('${ENT}') | float(0) > 50 else '#888888') }}`));
  const legend = (await m.locator('.legend .legend-cond').allTextContents()).map((t) => t.trim().replace(/\s+/g, ' '));
  T.check('Result legend lists rules in evaluation order + default', JSON.stringify(legend) === JSON.stringify(['If value > 80', 'else if value > 50', 'otherwise (default)']), JSON.stringify(legend));
  // Escape closes just the popover — not the whole card editor (current HA)
  // and not ignored (older MDC-dialog HA).
  const defPicker = rowOf(T, m, 'Default color').locator('cms-color-picker');
  await defPicker.locator('.swatch-trigger').first().click();
  const openPop = T.page.locator('div.popover').filter({ visible: true }).first();
  await openPop.waitFor({ state: 'visible', timeout: 5000 });
  await T.page.keyboard.press('Escape');
  await openPop.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  await sleep(600);
  T.check('Escape in a colour popover closes only the popover (Studio stays open)',
    !(await openPop.isVisible().catch(() => false)) && await panelLoc(T).isVisible().catch(() => false));
  await pickCompact(T, defPicker, 'Blue');
  await expectCfg(T, 'Default color via compact popover → var(--blue-color)', has(T, `else 'var(--blue-color)')`));
  T.check('Default color label shows the value', (await rowOf(T, m, 'Default color').locator('.color-label').textContent()).trim() === 'var(--blue-color)');
  await rule0.locator('button[aria-label="Remove rule"]').click();
  await expectCfg(T, 'removing the > 50 rule leaves only > 80', (c) => S(T, c).includes('> 80') && !S(T, c).includes('> 50'));
  const blue = await resolveRgb(T, 'var(--blue-color)');
  const green = await resolveRgb(T, 'var(--green-color)');
  await expectPage(T, `preview: ${hum} > 80 ? green : default blue`, P_CARD, 0, (v) => sameRgb(v?.iconColor, hum > 80 ? green : blue));
  const expectThr = hum > 80 ? green : blue;

  // Apply to
  const checkbox = (label) => m.locator('label.property-check').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).locator('input');
  const props = await m.locator('label.property-check').allTextContents();
  T.check('tile: Apply-to offers all 5 properties', props.map((t) => t.trim()).join('|') === 'Icon Color|Accent Color|Background|Text Color|Border Color', props.join('|'));
  await checkbox('Background').click();
  await expectCfg(T, 'Apply to Background → ha-card background block', has(T, `ha-card {\n  background: {{ 'var(--green-color)'`));
  await expectPage(T, 'preview: card background follows the rules', P_CARD, 0, (v) => sameRgb(v?.bg, expectThr));
  await checkbox('Text Color').click();
  await expectCfg(T, 'Apply to Text Color → ha-card color block', has(T, `ha-card {\n  color: {{ 'var(--green-color)'`));
  await expectPage(T, 'preview: card text colour follows the rules', P_CARD, 0, (v) => sameRgb(v?.color, expectThr));
  await checkbox('Border Color').click();
  await expectCfg(T, 'Apply to Border Color → 2px border block', has(T, `border: 2px solid {{ 'var(--green-color)'`));
  const bw = rowOf(T, m, 'Border width');
  T.check('Border Color reveals a Border width slider', (await bw.count()) === 1);
  await setSlider(T, bw.locator('ha-slider'), 5);
  await expectCfg(T, 'Border width 5', has(T, 'border: 5px solid {{'));
  await expectPage(T, 'preview: 5px border in the rule colour', P_CARD, 0, (v) => v?.bw === '5px' && sameRgb(v.bc, expectThr));
  await checkbox('Accent Color').click();
  await expectCfg(T, 'Apply to Accent Color → --accent-color + --tile-color !important', has(T, `--accent-color: {{ 'var(--green-color)'`, `!important;`, '--tile-color: {{'));
  await expectPage(T, 'preview: tile colour follows the rules', P_CARD, 0, (v) => sameRgb(v?.tileColor, expectThr));
  for (const l of ['Icon Color', 'Accent Color', 'Background', 'Text Color', 'Border Color']) await checkbox(l).click();
  await expectCfg(T, 'all properties unchecked → threshold emits nothing', noStyle(T));
  T.check('"Select at least one property" hint shown', (await m.locator('.when-hint').allTextContents()).some((t) => t.includes('Select at least one property')));
  await checkbox('Icon Color').click();

  // entity + attribute
  await pickEntity(T, m.locator('cms-entity-picker').first(), 'light.ceiling_lights');
  const attr = rowOf(T, m, 'Value read from').locator('select');
  await attr.waitFor({ state: 'visible' });
  await choose(attr, 'brightness');
  await expectCfg(T, 'entity light.ceiling_lights + attribute brightness', has(T, `state_attr('light.ceiling_lights', 'brightness') | float(0) > 80`));
  const bri = Number((await entityState(T, 'light.ceiling_lights'))?.attributes?.brightness ?? 0);
  await expectPage(T, `preview: brightness ${bri} > 80 → ${bri > 80 ? 'green' : 'blue'}`, P_CARD, 0, (v) => sameRgb(v?.iconColor, bri > 80 ? green : blue));
  await pickEntity(T, m.locator('cms-entity-picker').first(), ENT);
  await expectCfg(T, 'switching entity back resets the attribute to State', has(T, `states('${ENT}') | float(0) > 80`));

  // Fade mode
  await choose(rowOf(T, m, 'Value mode').locator('select'), 'gradient');
  await expectCfg(T, 'Fade mode → 32-step rules + stops marker', has(T, "--cms-gradient-stops: '0:#9e9e9e,100:#f44336';"));
  let stops = decodeMarker(S(T, await getCfg(T)));
  await expectPage(T, `preview: fade colour at ${hum}`, P_CARD, 0, (v) => sameRgb(v?.iconColor, fadeExpected(stops, hum)));
  T.check('gradient preview bar + min/max labels', (await m.locator('.gradient-bar').count()) === 1 && (await m.locator('.gradient-labels').textContent()).replace(/\s+/g, ' ').trim() === '0 100');
  await btn(m, '+ Add Point').click();
  await expectCfg(T, '+ Add Point → third stop at max+10 in the ON default', (c) => /'0:#9e9e9e,100:#f44336,110:#2196f3'/i.test(S(T, c)));
  const stop = (i) => m.locator('.stop').nth(i);
  await typeInto(stop(2).locator('input[type="number"]'), '200');
  await expectCfg(T, 'point value edited 110 → 200', (c) => /,200:#2196f3'/i.test(S(T, c)));
  await pickCompact(T, stop(1).locator('cms-color-picker'), 'Green');
  await expectCfg(T, 'point colour via swatch is stored as concrete hex', (c) => /100:#4caf50/i.test(S(T, c)));
  await stop(0).locator('button[aria-label="Move point down"]').click();
  await expectCfg(T, '▼ on the first point swaps its colour with the next', (c) => /'0:#4caf50,100:#9e9e9e,200:#2196f3'/i.test(S(T, c)));
  await stop(1).locator('button[aria-label="Move point up"]').click();
  await expectCfg(T, '▲ swaps it back', (c) => /'0:#9e9e9e,100:#4caf50,200:#2196f3'/i.test(S(T, c)));
  T.check('first point ▲ and last point ▼ are disabled', await stop(0).locator('button[aria-label="Move point up"]').isDisabled() && await stop(2).locator('button[aria-label="Move point down"]').isDisabled());
  await stop(2).locator('button[aria-label="Remove point"]').click();
  await expectCfg(T, 'removing a point (3 → 2)', (c) => /'0:#9e9e9e,100:#4caf50'/i.test(S(T, c)));
  T.check('with 2 points left both remove buttons are disabled', await stop(0).locator('button[aria-label="Remove point"]').isDisabled() && await stop(1).locator('button[aria-label="Remove point"]').isDisabled());
  stops = decodeMarker(S(T, await getCfg(T)));
  await expectPage(T, `preview: edited fade colour at ${hum}`, P_CARD, 0, (v) => sameRgb(v?.iconColor, fadeExpected(stops, hum)));
  await choose(rowOf(T, m, 'Value mode').locator('select'), 'switch');
  await expectCfg(T, 'back to Step mode keeps the step rules', has(T, `> 80 else 'var(--blue-color)'`));

  // gauge: no icon → Icon Color hidden, accent labelled as the dial, enabled fresh on accent
  await openEditor(T, 'fui-threshold-gauge', [{ type: 'gauge', entity: ENT, min: 0, max: 100 }]);
  await openStudio(T);
  const g = mod(T, 'cms-threshold-module');
  await enable(g);
  const gprops = (await g.locator('label.property-check').allTextContents()).map((t) => t.trim());
  T.check('gauge: Apply-to hides Icon Color and names the dial "Gauge / Accent Color"', !gprops.includes('Icon Color') && gprops.includes('Gauge / Accent Color'), JSON.stringify(gprops));
  T.check('gauge: enabling fresh pre-selects the dial colour', await g.locator('label.property-check').filter({ hasText: 'Gauge / Accent Color' }).locator('input').isChecked());
  await btn(g, '+ Add Rule').click();
  const gr = g.locator('.rule').first();
  await choose(gr.locator('select'), '>');
  await typeInto(gr.locator('input[type="number"]'), '10');
  await pickCompact(T, gr.locator('cms-color-picker'), 'Red');
  await expectCfg(T, 'gauge: rule drives the ha-gauge !important block', has(T, `ha-gauge {\n  --gauge-color: {{ 'var(--red-color)' if states('${ENT}') | float(0) > 10 else '#888888' }} !important;`));
  await expectPage(T, `gauge preview: dial follows the rule (${hum} > 10 → red)`, P_GAUGE, null, (v) => sameRgb(v?.stroke, hum > 10 ? red : 'rgb(136, 136, 136)'));
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

async function backgroundSection(T) {
  await openEditor(T, 'fui-background', [TILE_LIGHT]);
  await openStudio(T);
  const m = mod(T, 'cms-background-module');
  await enable(m);
  await expectCfg(T, 'enable → solid #03a9f4', has(T, 'background: #03a9f4;'));
  await expectPage(T, 'preview: background #03a9f4', P_CARD, 0, (v) => sameRgb(v?.bg, 'rgb(3, 169, 244)'));
  const c1 = rowOf(T, m, 'Color').locator('cms-color-picker');
  await pickSwatch(c1, 'Cyan');
  const cyan = await resolveRgb(T, 'var(--cyan-color)');
  await expectPage(T, 'swatch Cyan → preview cyan', P_CARD, 0, (v) => sameRgb(v?.bg, cyan));
  await pickText(c1, 'rgb(10, 20, 30)');
  await expectCfg(T, 'typed rgb(10, 20, 30)', has(T, 'background: rgb(10, 20, 30);'));
  await expectPage(T, 'preview: rgb(10, 20, 30)', P_CARD, 0, (v) => sameRgb(v?.bg, 'rgb(10, 20, 30)'));
  const type = rowOf(T, m, 'Type').locator('select');
  T.check('Type offers Solid + Gradient', JSON.stringify(await type.locator('option').evaluateAll((os) => os.map((o) => o.value))) === '["solid","gradient"]');
  await choose(type, 'gradient');
  await expectCfg(T, 'Gradient → linear-gradient(135deg, c1, #ff8c00)', has(T, 'background: linear-gradient(135deg, rgb(10, 20, 30), #ff8c00);'));
  T.check('gradient shows Color 1 / Color 2 / Angle', (await rowOf(T, m, 'Color 1').count()) === 1 && (await rowOf(T, m, 'Color 2').count()) === 1 && (await rowOf(T, m, 'Angle').count()) === 1);
  await pickSwatch(rowOf(T, m, 'Color 2').locator('cms-color-picker'), 'Yellow');
  await setSlider(T, rowOf(T, m, 'Angle').locator('ha-slider'), 90);
  await expectCfg(T, 'Color 2 Yellow + Angle 90', has(T, 'background: linear-gradient(90deg, rgb(10, 20, 30), var(--yellow-color));'));
  await expectPage(T, 'preview: background-image is the 90deg gradient', P_CARD, 0, (v) => (v?.bgImg || '').startsWith('linear-gradient(90deg, rgb(10, 20, 30)'));
  const lightOn = await isOn(T, 'light.ceiling_lights');
  const when = rowOf(T, m, 'Apply when').locator('select');
  await choose(when, 'on');
  await expectCfg(T, 'Apply when ON', has(T, `background: {{ 'linear-gradient(90deg, rgb(10, 20, 30), var(--yellow-color))' if is_state(config.entity, 'on') else 'none' }};`));
  await expectPage(T, `preview: ON → ${lightOn ? 'gradient' : 'none'}`, P_CARD, 0, (v) => (lightOn ? (v?.bgImg || '').startsWith('linear-gradient') : v?.bgImg === 'none'));
  await choose(when, 'off');
  await expectPage(T, `preview: OFF → ${lightOn ? 'none' : 'gradient'}`, P_CARD, 0, (v) => (!lightOn ? (v?.bgImg || '').startsWith('linear-gradient') : v?.bgImg === 'none'));
  await choose(type, 'solid');
  await choose(when, 'custom');
  await pickEntity(T, rowOf(T, m, 'Entity').locator('cms-entity-picker'), 'switch.decorative_lights');
  await expectCfg(T, 'Apply when another entity (switch.decorative_lights)', has(T, `background: {{ 'rgb(10, 20, 30)' if is_state('switch.decorative_lights', 'on') else 'none' }};`));
  const decoOn = await isOn(T, 'switch.decorative_lights');
  await expectPage(T, 'preview: follows switch.decorative_lights', P_CARD, 0, (v) => (decoOn ? sameRgb(v?.bg, 'rgb(10, 20, 30)') : v?.bg === 'rgba(0, 0, 0, 0)'));
  await choose(when, 'always');
  await expectCfg(T, 'Apply when Always', has(T, 'background: rgb(10, 20, 30);'));
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

async function animationSection(T) {
  await openEditor(T, 'fui-animation', [TILE_LIGHT]);
  await openStudio(T);
  const m = mod(T, 'cms-animation-module');
  await enable(m);
  await expectCfg(T, 'enable → pulse 2s always + keyframes', has(T, '@keyframes cms-pulse', 'animation: cms-pulse 2s ease-in-out infinite;'));
  await expectPage(T, 'preview: animation cms-pulse 2s', P_CARD, 0, (v) => v?.anim === 'cms-pulse' && v.animDur === '2s');
  const preset = rowOf(T, m, 'Preset').locator('select');
  const presets = await preset.locator('option').evaluateAll((os) => os.map((o) => o.value));
  T.check('9 presets offered', presets.length === 9, JSON.stringify(presets));
  for (const p of presets) {
    await choose(preset, p);
    await expectCfg(T, `preset ${p} → @keyframes cms-${p} + animation`, has(T, `@keyframes cms-${p}`, `animation: cms-${p} 2s ${p === 'spin' ? 'linear' : 'ease-in-out'} infinite;`));
    await expectPage(T, `preview: animation-name cms-${p}`, P_CARD, 0, (v) => v?.anim === `cms-${p}`);
    if (p === 'gradient-shift') {
      T.check('gradient-shift shows the "requires gradient bg" warning', (await m.locator('.when-hint').allTextContents()).some((t) => t.includes('Gradient Shift requires a gradient background')));
      await expectCfg(T, 'gradient-shift adds background-size: 200% auto', has(T, 'background-size: 200% auto;'));
    }
  }
  await choose(preset, 'breathe');
  await setSlider(T, rowOf(T, m, 'Speed').locator('ha-slider'), 4);
  await expectCfg(T, 'Speed 4s', has(T, 'animation: cms-breathe 4s ease-in-out infinite;'));
  await expectPage(T, 'preview: animation-duration 4s', P_CARD, 0, (v) => v?.animDur === '4s');
  const lightOn = await isOn(T, 'light.ceiling_lights');
  const trig = rowOf(T, m, 'Apply when').locator('select');
  await choose(trig, 'on');
  await expectCfg(T, 'trigger ON', has(T, `animation: {{ 'cms-breathe 4s ease-in-out infinite' if is_state(config.entity, 'on') else 'none' }};`));
  await expectPage(T, `preview: ON → ${lightOn ? 'animating' : 'none'}`, P_CARD, 0, (v) => v?.anim === (lightOn ? 'cms-breathe' : 'none'));
  await choose(trig, 'off');
  await expectPage(T, `preview: OFF → ${lightOn ? 'none' : 'animating'}`, P_CARD, 0, (v) => v?.anim === (!lightOn ? 'cms-breathe' : 'none'));
  await choose(trig, 'custom');
  await pickEntity(T, rowOf(T, m, 'Entity').locator('cms-entity-picker'), 'switch.ac');
  await expectCfg(T, 'trigger another entity (switch.ac)', has(T, `if is_state('switch.ac', 'on') else 'none'`));
  const acOn = await isOn(T, 'switch.ac');
  await expectPage(T, 'preview: follows switch.ac', P_CARD, 0, (v) => v?.anim === (acOn ? 'cms-breathe' : 'none'));
  await choose(trig, 'value');
  await expectCfg(T, 'value trigger without an entity → unconditional (W8)', has(T, 'animation: cms-breathe 4s ease-in-out infinite;'));
  await pickEntity(T, rowOf(T, m, 'Entity').locator('cms-entity-picker'), 'sensor.outside_humidity');
  T.check('sensor without numeric attributes → no "Value read from" select', (await rowOf(T, m, 'Value read from').count()) === 0);
  await choose(rowOf(T, m, 'Condition').locator('select'), '<');
  await typeInto(rowOf(T, m, 'Threshold').locator('input'), '60');
  await expectCfg(T, 'value condition states(sensor.outside_humidity) < 60', has(T, `if states('sensor.outside_humidity') | float(0) < 60 else 'none'`));
  const hum = Number((await entityState(T, 'sensor.outside_humidity')).state);
  await expectPage(T, `preview: ${hum} < 60 → ${hum < 60 ? 'animating' : 'none'}`, P_CARD, 0, (v) => v?.anim === (hum < 60 ? 'cms-breathe' : 'none'));
  await pickEntity(T, rowOf(T, m, 'Entity').locator('cms-entity-picker'), 'light.ceiling_lights');
  await choose(rowOf(T, m, 'Value read from').locator('select'), 'brightness');
  await choose(rowOf(T, m, 'Condition').locator('select'), '>=');
  await typeInto(rowOf(T, m, 'Threshold').locator('input'), '1000');
  await expectCfg(T, 'attribute brightness >= 1000', has(T, `if state_attr('light.ceiling_lights', 'brightness') | float(0) >= 1000 else 'none'`));
  await expectPage(T, 'preview: brightness >= 1000 false → none', P_CARD, 0, (v) => v?.anim === 'none');
}

// ---------------------------------------------------------------------------
// Border & Radius
// ---------------------------------------------------------------------------

async function borderSection(T) {
  await openEditor(T, 'fui-border', [TILE_LIGHT]);
  await openStudio(T);
  const m = mod(T, 'cms-border-module');
  await enable(m);
  await expectCfg(T, 'enable → border-radius: 12px (width 0 → no border)', (c) => S(T, c).includes('border-radius: 12px;') && !/\bborder:/.test(S(T, c)));
  await expectPage(T, 'preview: radius 12px', P_CARD, 0, (v) => v?.radius === '12px');
  T.check('width 0 hides colour + Reacts to', (await rowOf(T, m, 'Border color').count()) === 0);
  await setSlider(T, rowOf(T, m, 'Border radius').locator('ha-slider'), 20);
  await expectCfg(T, 'radius slider 20', has(T, 'border-radius: 20px;'));
  await expectPage(T, 'preview: radius 20px', P_CARD, 0, (v) => v?.radius === '20px');
  await setSlider(T, rowOf(T, m, 'Border width').locator('ha-slider'), 3);
  await expectCfg(T, 'width 3 → border: 3px solid #03a9f4', has(T, 'border: 3px solid #03a9f4;'));
  await expectPage(T, 'preview: 3px border #03a9f4', P_CARD, 0, (v) => v?.bw === '3px' && sameRgb(v.bc, 'rgb(3, 169, 244)'));
  await pickSwatch(rowOf(T, m, 'Border color').locator('cms-color-picker'), 'Red');
  const red = await resolveRgb(T, 'var(--red-color)');
  await expectPage(T, 'swatch Red → preview border red', P_CARD, 0, (v) => sameRgb(v?.bc, red));
  const lightOn = await isOn(T, 'light.ceiling_lights');
  const reacts = rowOf(T, m, 'Reacts to').locator('select');
  await choose(reacts, 'off');
  await expectCfg(T, 'Reacts to OFF → width ternary (else none)', has(T, `border: {{ '3px solid var(--red-color)' if is_state(config.entity, 'off') else 'none' }};`));
  await expectPage(T, `preview: OFF condition → ${lightOn ? '0px' : '3px'}`, P_CARD, 0, (v) => v?.bw === (lightOn ? '0px' : '3px'));
  const other = rowOf(T, m, 'Width otherwise');
  T.check('conditional width shows "Width otherwise" ("no border")', (await other.locator('.value-label').textContent()).trim() === 'no border');
  await setSlider(T, other.locator('ha-slider'), 1);
  await expectCfg(T, 'Width otherwise 1', has(T, `else '1px solid var(--red-color)' }};`));
  await expectPage(T, `preview: ${lightOn ? 'otherwise 1px' : '3px'}`, P_CARD, 0, (v) => v?.bw === (lightOn ? '1px' : '3px'));
  await choose(reacts, 'on');
  await expectPage(T, `preview: ON condition → ${lightOn ? '3px' : '1px'}`, P_CARD, 0, (v) => v?.bw === (lightOn ? '3px' : '1px'));
  await choose(reacts, 'custom');
  await pickEntity(T, rowOf(T, m, 'Entity').locator('cms-entity-picker'), 'switch.ac');
  const acOn = await isOn(T, 'switch.ac');
  await expectCfg(T, 'Reacts to switch.ac', has(T, `if is_state('switch.ac', 'on') else '1px solid var(--red-color)'`));
  await expectPage(T, 'preview: follows switch.ac', P_CARD, 0, (v) => v?.bw === (acOn ? '3px' : '1px'));
  await choose(reacts, 'value');
  await pickEntity(T, rowOf(T, m, 'Entity').locator('cms-entity-picker'), 'sensor.outside_humidity');
  await choose(rowOf(T, m, 'Condition').locator('select'), '>');
  await typeInto(rowOf(T, m, 'Threshold').locator('input'), '50');
  const hum = Number((await entityState(T, 'sensor.outside_humidity')).state);
  await expectCfg(T, 'Reacts to value: humidity > 50', has(T, `if states('sensor.outside_humidity') | float(0) > 50 else`));
  await expectPage(T, `preview: ${hum} > 50 → ${hum > 50 ? '3px' : '1px'}`, P_CARD, 0, (v) => v?.bw === (hum > 50 ? '3px' : '1px'));
}

// ---------------------------------------------------------------------------
// Heading Style
// ---------------------------------------------------------------------------

async function headingSection(T) {
  const cards = [
    { type: 'heading', heading: 'Living room', icon: 'mdi:sofa' },
    { type: 'heading', heading: 'Living room', icon: 'mdi:sofa', heading_style: 'subtitle' },
  ];
  await openEditor(T, 'fui-heading', cards, 0);
  await openStudio(T);
  const pv = await T.page.evaluate(P_PANEL);
  const want = ['cms-heading-style-module', 'cms-filter-module', 'cms-advanced-module'];
  // Threshold is hidden too (v0.10.0): none of its colours reaches a heading
  // (measured on a real dashboard — no box for background/border, and the
  // title has its own colour variable).
  const hidden = ['cms-font-module', 'cms-background-module', 'cms-border-module', 'cms-animation-module', 'cms-icon-color-module', 'cms-accent-color-module', 'cms-threshold-module'];
  T.check('heading: Heading Style shown; Font/Background/Border/Animation/Icon/Accent/Threshold hidden', want.every((t) => pv.modules.includes(t)) && hidden.every((t) => !pv.modules.includes(t)), JSON.stringify(pv.modules));
  const base = await T.page.evaluate(P_HEADING);
  const m = mod(T, 'cms-heading-style-module');
  await enable(m);
  await expectCfg(T, 'enable → HA heading variables on .container', has(T, '.container {', '--ha-heading-card-title-font-size: 24px;', '--ha-heading-card-subtitle-font-size: 24px;', '.content ha-icon {'));
  await setSlider(T, rowOf(T, m, 'Text size').locator('ha-slider'), 30);
  await pickSwatch(rowOf(T, m, 'Text color').locator('cms-color-picker'), 'Red');
  await choose(rowOf(T, m, 'Weight').locator('select'), 'bold');
  await choose(rowOf(T, m, 'Font family').locator('select'), 'monospace');
  await setSlider(T, rowOf(T, m, 'Icon size').locator('ha-slider'), 40);
  await pickSwatch(rowOf(T, m, 'Icon color').locator('cms-color-picker'), 'Blue');
  await choose(rowOf(T, m, 'Alignment').locator('select'), 'center');
  await expectCfg(T, 'size 30 / red / bold / monospace / icon 40 blue / center emitted', has(T, '--ha-heading-card-title-font-size: 30px;', '--ha-heading-card-title-color: var(--red-color);', '--ha-heading-card-title-font-weight: bold;', 'font-family: monospace;', '--mdc-icon-size: 40px;', 'color: var(--blue-color) !important;', 'justify-content: center !important;'));
  const red = await resolveRgb(T, 'var(--red-color)');
  const blue = await resolveRgb(T, 'var(--blue-color)');
  await expectPage(T, `title heading preview (${base?.tag}): 30px red 700 monospace, icon 40px blue, centred`, P_HEADING, null, (v) => v?.size === '30px' && sameRgb(v.color, red) && v.weight === '700' && /monospace/.test(v.family) && v.iconW === 40 && sameRgb(v.iconColor, blue) && v.justify === 'center');
  for (const [a, j] of [['right', 'flex-end'], ['left', 'flex-start']]) {
    await choose(rowOf(T, m, 'Alignment').locator('select'), a);
    await expectPage(T, `alignment ${a} → justify-content ${j}`, P_HEADING, null, (v) => v?.justify === j);
  }
  await choose(rowOf(T, m, 'Weight').locator('select'), 'medium');
  await expectPage(T, 'weight medium → 500', P_HEADING, null, (v) => v?.weight === '500');
  const fam = rowOf(T, m, 'Font family').locator('select');
  await choose(fam, 'custom');
  const custom = rowOf(T, m, 'Custom family').locator('input');
  const appeared = await custom.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
  T.check('Heading "Custom…" family reveals the custom text field', appeared);
  if (appeared) {
    await typeInto(custom, 'Georgia, serif');
    await expectPage(T, 'custom family renders', P_HEADING, null, (v) => /Georgia/.test(v?.family || ''));
  }

  // subtitle-style heading
  await openEditor(T, 'fui-heading', null, 1);
  await openStudio(T);
  const m2 = mod(T, 'cms-heading-style-module');
  await enable(m2);
  await setSlider(T, rowOf(T, m2, 'Text size').locator('ha-slider'), 20);
  await pickSwatch(rowOf(T, m2, 'Text color').locator('cms-color-picker'), 'Green');
  await choose(rowOf(T, m2, 'Weight').locator('select'), 'bold');
  const green = await resolveRgb(T, 'var(--green-color)');
  await expectPage(T, 'subtitle heading preview: 20px green 700', P_HEADING, null, (v) => v?.size === '20px' && sameRgb(v.color, green) && v.weight === '700');
}

// ---------------------------------------------------------------------------
// Advanced CSS
// ---------------------------------------------------------------------------

async function typeCode(T, m, text, { replace = false } = {}) {
  const content = m.locator('ha-code-editor .cm-content').first();
  await content.click();
  if (replace) {
    // select all and type over it (the document is never empty in between)
    await T.page.keyboard.press('Control+a');
  } else {
    await T.page.keyboard.press('Control+End');
  }
  await T.page.keyboard.type(text, { delay: 15 });
  await sleep(400);
  return m.locator('ha-code-editor').first().evaluate((e) => e.value);
}

async function advancedSection(T) {
  await openEditor(T, 'fui-advanced', [TILE_LIGHT]);
  await openStudio(T);
  const m = mod(T, 'cms-advanced-module');
  T.check('Advanced CSS starts collapsed on an unstyled card', !(await isOpen(m)));
  await expand(m);
  await m.locator('ha-code-editor').first().waitFor({ state: 'visible' });
  const typed = await typeCode(T, m, 'ha-card { min-height: 123px; }');
  T.check('typing in the CodeMirror editor yields exactly the typed CSS', typed.trim() === 'ha-card { min-height: 123px; }', JSON.stringify(typed));
  await expectCfg(T, 'typed CSS emitted verbatim', has(T, 'ha-card { min-height: 123px; }'));
  await expectPage(T, 'preview: min-height 123px applied', P_CARD, 0, (v) => v?.minH === '123px');

  const bg = mod(T, 'cms-background-module');
  await enable(bg);
  await expectCfg(T, 'Background on (module output first, custom CSS after)', (c) => { const s = S(T, c); return s.indexOf('background: #03a9f4;') !== -1 && s.indexOf('background: #03a9f4;') < s.indexOf('min-height'); });
  T.check('no override badge before a conflicting rule exists', (await bg.locator('.override-badge').count()) === 0);
  await typeCode(T, m, ' ha-card { background: rgb(9, 8, 7); }');
  await expectCfg(T, 'conflicting custom rule emitted after the module output', has(T, 'ha-card { background: rgb(9, 8, 7); }'));
  await bg.locator('.override-badge').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  T.check('Background header shows the ⚠️ "overriding" badge', (await bg.locator('.override-badge').count()) === 1);
  await expand(bg);
  const hint = (await bg.locator('.override-hint').textContent().catch(() => '')) || '';
  T.check('Background body explains the override (names ha-card { background })', hint.includes('Custom CSS is currently overriding this control') && hint.includes('ha-card { background }'), hint.replace(/\s+/g, ' ').slice(0, 200));
  await expectPage(T, 'preview: custom CSS wins (rgb(9, 8, 7))', P_CARD, 0, (v) => sameRgb(v?.bg, 'rgb(9, 8, 7)'));
  const other = await T.page.evaluate(P_PANEL);
  T.check('no badge on modules that are not overridden', (await mod(T, 'cms-border-module').locator('.override-badge').count()) === 0, JSON.stringify(other.modules));
  await typeCode(T, m, 'ha-card { min-height: 123px; }', { replace: true });
  await expectCfg(T, 'conflict removed from the editor', (c) => !S(T, c).includes('rgb(9, 8, 7)') && S(T, c).includes('min-height: 123px'));
  await bg.locator('.override-badge').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  T.check('badge disappears once the conflict is gone', (await bg.locator('.override-badge').count()) === 0);
  await expectPage(T, 'preview: module background back (#03a9f4)', P_CARD, 0, (v) => sameRgb(v?.bg, 'rgb(3, 169, 244)'));
  const banner = await T.page.evaluate(P_PANEL);
  T.note(`info banners while custom CSS is typed in this session: ${JSON.stringify(banner.info)}`);

  // Clearing the editor completely (select all + Delete) — a normal way to start over.
  await m.locator('ha-code-editor .cm-content').first().click();
  await T.page.keyboard.press('Control+a');
  await T.page.keyboard.press('Delete');
  await sleep(700);
  const stillOpen = await isOpen(m);
  const focus = await T.page.evaluate(() => { let a = document.activeElement; const p = []; while (a) { p.push(a.tagName); a = a.shadowRoot?.activeElement; } return p; });
  T.check('clearing Advanced CSS (select-all + Delete) keeps the editor open and focused', stillOpen && focus.includes('HA-CODE-EDITOR'), `module open=${stillOpen}; focus chain=${focus.join('>')}`);
  await expectCfg(T, 'cleared Advanced CSS → only the Background output remains', (c) => S(T, c).trim() === 'ha-card {\n  background: #03a9f4;\n}');
  if (!stillOpen) await shot(T, 'advanced-collapsed-after-clear');
}

export const SECTIONS = [
  { id: 'font', run: fontSection },
  { id: 'filter', run: filterSection },
  { id: 'accent', run: accentSection },
  { id: 'icon', run: iconSection },
  { id: 'threshold', run: thresholdSection },
  { id: 'background', run: backgroundSection },
  { id: 'animation', run: animationSection },
  { id: 'border', run: borderSection },
  { id: 'heading', run: headingSection },
  { id: 'advanced', run: advancedSection },
];

// "A value matches" with text (v1.0.0, issue #42) through the real card
// editor: Background and grayscale get the option in "Apply when", the
// Animation trigger and the effects condition compare a text; the dashboard
// follows the state live; the card reopens with the same settings; a number
// comparison still works next to it.
//   node conditions_text_check.mjs             (card-mod rig)
//   RIG=uix UIX_TOKENS_FILE=/path/tokens.json node conditions_text_check.mjs
// Prints PASS/FAIL per step and "N/M checks passed".
import * as D from './click-driver.mjs';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const URLPATH = 'qa-conditions-text';
const ENT = 'sensor.qa_mode';
const NUM = 'sensor.qa_level';
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
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/conditions-text-fail-${results.length}.png` }).catch(() => {});
    await D.cancelCard(page).catch(() => {});
  }
};

const setMode = (state, attrs = {}) => D.setState(h, ENT, state, { friendly_name: 'QA mode', icon: 'mdi:fan', ...attrs });
const setLevel = (n) => D.setState(h, NUM, String(n), { friendly_name: 'QA level', unit_of_measurement: '%' });
const styleOf = async (n = 0) => (await D.savedCards(page, URLPATH))[n]?.[KEY]?.style ?? '';
/** Computed style of the n-th tile's ha-card on the dashboard (not in the editor). */
const cardCss = (n, prop) => page.evaluate(({ n, prop }) => {
  const all = []; const walk = (root) => { for (const el of root.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } }; walk(document);
  const card = all.filter((e) => e.tagName === 'HUI-TILE-CARD' && !e.closest('hui-dialog-edit-card'))[n];
  const ha = card && (card.shadowRoot ?? card).querySelector('ha-card');
  return ha ? getComputedStyle(ha)[prop] : null;
}, { n, prop });
const waitCss = async (n, prop, test, what) => {
  let v;
  for (let i = 0; i < 30; i++) { v = await cardCss(n, prop); if (test(v)) return v; await wait(400); }
  throw new Error(`card ${n} ${prop} = ${v}, want ${what}`);
};
/** Re-open after Cancel on HA 2025.9 can time out in this driver: reload once. */
const open = async (n) => {
  try { await D.openCardEditor(page, n); } catch {
    await D.gotoDashboard(page, URLPATH, { engine: false });
    await D.enterEditMode(page);
    await D.openCardEditor(page, n);
  }
  await D.openStudio(page);
};
const mod = (tag) => page.locator(tag).first();
/** Picks "A value matches", the entity, "value is" (prefilled with the state). */
const valueIs = async (m, whenSelect, entity) => {
  await m.locator(whenSelect).selectOption('value');
  await D.pickEntity(m.locator('cms-entity-picker').last(), entity);
  await m.locator('select[aria-labelledby="cond-op-label"]').selectOption('is');
  const field = m.locator('input.text-value');
  await field.waitFor({ state: 'visible', timeout: 5000 });
  return field.inputValue();
};
const panelState = () => page.evaluate(() => {
  const find = (root) => { for (const el of root.querySelectorAll('*')) { if (el.tagName === 'CMS-PANEL') return el; if (el.shadowRoot) { const f = find(el.shadowRoot); if (f) return f; } } return null; };
  return find(document)?._studioState ?? null;
});

try {
  await setMode('heating', { hvac_action: 'heating' });
  await setLevel(40);
  await D.seedDashboard(page, URLPATH, [
    { type: 'tile', entity: ENT },
    { type: 'tile', entity: ENT },
    { type: 'tile', entity: NUM },
  ], { view: { type: 'masonry' } });
  await D.gotoDashboard(page, URLPATH, { engine: false });
  const ownBg = await cardCss(0, 'backgroundColor');
  await D.enterEditMode(page);

  await step('Background → Apply when → "A value matches" → value is heating: red only while heating', async () => {
    await open(0);
    await D.setSectionEnabled(page, 'Background', true);
    const m = mod('cms-background-module');
    const prefilled = await valueIs(m, 'select[aria-labelledby="when-label"]', ENT);
    need(prefilled === 'heating', `text starts with "${prefilled}"`);
    const hint = (await m.locator('.now-value').textContent())?.trim() ?? '';
    need(/Right now: heating/.test(hint), `hint "${hint}"`);
    await D.pickSwatch(await D.findControl(page, 'Background', 'Color'), 'Red');
    await D.saveCard(page);
    const css = await styleOf(0);
    need(css.includes(`if states('${ENT}') == 'heating' else ''`), css);
    const a = await waitCss(0, 'backgroundColor', (v) => v === 'rgb(244, 67, 54)', 'red');
    await setMode('idle', { hvac_action: 'idle' });
    const b = await waitCss(0, 'backgroundColor', (v) => v === ownBg, `the card's own ${ownBg}`);
    await setMode('heating', { hvac_action: 'heating' });
    await waitCss(0, 'backgroundColor', (v) => v === 'rgb(244, 67, 54)', 'red again');
    return `heating → ${a}, idle → ${b}`;
  });

  await step('it reopens with "A value matches", value is heating; nothing in Advanced CSS', async () => {
    await open(0);
    const s = await panelState();
    need(s?.background?.condition?.valueText === 'heating' && s.background.condition.valueTextOperator === 'is' && s.advanced.rawCss === '', JSON.stringify({ bg: s?.background, adv: s?.advanced }));
    const m = mod('cms-background-module');
    need((await m.locator('select[aria-labelledby="when-label"]').inputValue()) === 'value', 'Apply when is not "A value matches"');
    need((await m.locator('select[aria-labelledby="cond-op-label"]').inputValue()) === 'is', 'condition is not "value is"');
    await D.cancelCard(page);
  });

  await step('Animation → "A value matches" → value is not idle: runs while heating, stops while idle', async () => {
    await open(1);
    await D.setSectionEnabled(page, 'Animation', true);
    const m = mod('cms-animation-module');
    await valueIs(m, 'select[aria-labelledby="lbl-apply-when"]', ENT);
    await m.locator('select[aria-labelledby="cond-op-label"]').selectOption('is-not');
    const f = m.locator('input.text-value');
    await f.fill('idle');
    await f.press('Tab');
    await D.saveCard(page);
    const css = await styleOf(1);
    need(css.includes(`if states('${ENT}') != 'idle' else 'none'`), css);
    const a = await waitCss(1, 'animationName', (v) => v === 'cstudio-pulse', 'cstudio-pulse');
    await setMode('idle', { hvac_action: 'idle' });
    const b = await waitCss(1, 'animationName', (v) => v === 'none', 'none');
    await setMode('heating', { hvac_action: 'heating' });
    return `heating → ${a}, idle → ${b}`;
  });

  await step('Visual Filters grayscale → "A value matches" on an attribute (hvac_action is heating)', async () => {
    await open(1);
    await D.setSectionEnabled(page, 'Visual Filters', true);
    const m = mod('cms-filter-module');
    await D.toggle(await D.findControl(page, 'Visual Filters', 'Grayscale'), true);
    await valueIs(m, 'select[aria-labelledby="when-label"]', ENT);
    await m.locator('select[aria-labelledby="cond-read-label"]').selectOption('hvac_action');
    const f = m.locator('input.text-value');
    await f.fill('heating');
    await f.press('Tab');
    await D.saveCard(page);
    const css = await styleOf(1);
    need(css.includes(`if state_attr('${ENT}', 'hvac_action') | string == 'heating' else 'none'`), css);
    const a = await waitCss(1, 'filter', (v) => /grayscale\(1\)/.test(v), 'grayscale');
    await setMode('heating', { hvac_action: 'idle' });
    const b = await waitCss(1, 'filter', (v) => v === 'none', 'none');
    await setMode('heating', { hvac_action: 'heating' });
    return `heating → ${a}, idle → ${b}`;
  });

  await step('a number comparison still works: Background while the level is > 50', async () => {
    await open(2);
    await D.setSectionEnabled(page, 'Background', true);
    const m = mod('cms-background-module');
    await m.locator('select[aria-labelledby="when-label"]').selectOption('value');
    await D.pickEntity(m.locator('cms-entity-picker').last(), NUM);
    await m.locator('select[aria-labelledby="cond-op-label"]').selectOption('>');
    const n = m.locator('input.num').last();
    await n.fill('50');
    await n.press('Tab');
    await D.pickSwatch(await D.findControl(page, 'Background', 'Color'), 'Red');
    await D.saveCard(page);
    const css = await styleOf(2);
    need(css.includes(`if states('${NUM}') | float(0) > 50 else ''`), css);
    const own = await waitCss(2, 'backgroundColor', (v) => v !== 'rgb(244, 67, 54)', 'its own (40 < 50)');
    await setLevel(70);
    const red = await waitCss(2, 'backgroundColor', (v) => v === 'rgb(244, 67, 54)', 'red');
    return `40 → ${own}, 70 → ${red}`;
  });

  await step('no console errors', async () => {
    const errs = h.errors.filter((e) => !/themesReady: Timeout|status of 50[02]|Error getting Image Colors|Transition was skipped|Cannot parse given Error object/.test(e));
    need(errs.length === 0, errs.slice(0, 3).join(' || '));
  });
} catch (e) {
  results.push(false);
  console.log('FAIL setup -', String(e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  await h.close().catch(() => {});
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

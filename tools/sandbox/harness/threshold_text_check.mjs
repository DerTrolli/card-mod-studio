// Threshold text rules (v1.0.0-beta.2, issue #41) through the real card
// editor: "is" starts from the entity's current state; the colour follows the
// state on the dashboard (is / is not, a text rule before a number rule
// for `unavailable`, an attribute); it reopens with the same rules; a number
// typed into "is" becomes the number rule `==`.
//   node threshold_text_check.mjs             (card-mod rig)
//   RIG=uix UIX_TOKENS_FILE=/path/tokens.json node threshold_text_check.mjs
// Prints PASS/FAIL per step and "N/M checks passed".
import * as D from './click-driver.mjs';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const URLPATH = 'qa-threshold-text';
const ENT = 'sensor.qa_mode';
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
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/threshold-text-fail-${results.length}.png` }).catch(() => {});
    await D.cancelCard(page).catch(() => {});
  }
};

const BLUE = 'rgb(33, 150, 243)'; // the rule colour a new rule starts with (#2196F3)
const GREY = 'rgb(136, 136, 136)'; // the default (#888888)
const RED = 'rgb(244, 67, 54)';
const setMode = (state, attrs = {}) => D.setState(h, ENT, state, { friendly_name: 'QA mode', icon: 'mdi:fan', ...attrs });
const styleOf = async () => (await D.savedCards(page, URLPATH))[0]?.[KEY]?.style ?? '';
const iconColor = () => page.evaluate(() => {
  const all = []; const walk = (root) => { for (const el of root.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } }; walk(document);
  const card = all.find((e) => e.tagName === 'HUI-TILE-CARD' && !e.closest('hui-dialog-edit-card'));
  if (!card) return null;
  const inner = []; const w2 = (root) => { for (const el of root.querySelectorAll('*')) { inner.push(el); if (el.shadowRoot) w2(el.shadowRoot); } }; w2(card.shadowRoot ?? card);
  const icon = inner.find((e) => e.tagName === 'HA-STATE-ICON');
  return icon ? getComputedStyle(icon).color : null;
});
const waitIcon = async (want) => {
  let v;
  for (let i = 0; i < 30; i++) { v = await iconColor(); if (v === want) return v; await wait(400); }
  throw new Error(`icon ${v}, want ${want}`);
};
/** Open the card's editor and the Studio. On HA 2025.9 a second open after
 *  Cancel can time out in this driver (also without the Studio, and with
 *  v1.0.0-beta.1): reload the dashboard once and try again. */
const openStudio = async () => {
  try {
    await D.openCardEditor(page, 0);
  } catch {
    await D.gotoDashboard(page, URLPATH, { engine: false });
    await D.enterEditMode(page);
    await D.openCardEditor(page, 0);
  }
  await D.openStudio(page);
};
const rule = (n) => page.locator('cms-threshold-module .rule').nth(n);
const addRule = () => page.locator('cms-threshold-module').getByRole('button', { name: '+ Add Rule' }).click();
const studioRules = () => page.evaluate(() => {
  const find = (root) => { for (const el of root.querySelectorAll('*')) { if (el.tagName === 'CMS-PANEL') return el; if (el.shadowRoot) { const f = find(el.shadowRoot); if (f) return f; } } return null; };
  const s = find(document)?._studioState;
  return s ? { on: s.threshold.enabled, rules: s.threshold.rules.map((r) => `${r.operator} ${r.value}`), attribute: s.threshold.attribute ?? '', adv: s.advanced.rawCss } : null;
});

try {
  await setMode('heating', { hvac_action: 'heating' });
  await D.seedDashboard(page, URLPATH, [{ type: 'tile', entity: ENT }], { view: { type: 'masonry' } });
  await D.gotoDashboard(page, URLPATH, { engine: false });
  await D.enterEditMode(page);

  await step('"is" starts from the current state and colours the icon while it matches', async () => {
    await openStudio();
    await D.setSectionEnabled(page, 'Threshold Colors', true);
    await addRule();
    await rule(0).locator('select').selectOption('is');
    const field = rule(0).locator('input.text-value');
    await field.waitFor({ state: 'visible', timeout: 5000 });
    const prefilled = await field.inputValue();
    need(prefilled === 'heating', `field starts with "${prefilled}"`);
    const hint = (await page.locator('cms-threshold-module .now-value').textContent())?.trim() ?? '';
    need(/Right now: heating/.test(hint), `hint "${hint}"`);
    await D.saveCard(page);
    const css = await styleOf();
    need(css.includes(`'#2196F3' if states('${ENT}') == 'heating' else '#888888'`), css);
    return `${await waitIcon(BLUE)}; ${hint}`;
  });

  await step('another state → the default colour; back to heating → the rule colour', async () => {
    await setMode('idle', { hvac_action: 'idle' });
    await waitIcon(GREY);
    await setMode('heating', { hvac_action: 'heating' });
    return waitIcon(BLUE);
  });

  await step('it reopens with the text rule, nothing in Advanced CSS', async () => {
    await openStudio();
    const s = await studioRules();
    need(s?.on && JSON.stringify(s.rules) === JSON.stringify(['is heating']) && s.adv === '', JSON.stringify(s));
    need((await rule(0).locator('select').inputValue()) === 'is' && (await rule(0).locator('input.text-value').inputValue()) === 'heating', 'controls differ');
    await D.cancelCard(page);
  });

  await step('"is not", and a text rule for unavailable checked before a number rule', async () => {
    await openStudio();
    await rule(0).locator('select').selectOption('is-not');
    const f0 = rule(0).locator('input.text-value');
    await f0.fill('off');
    await f0.press('Tab');
    await addRule(); // < 0 → `< 5`, red
    await rule(1).locator('input.num').fill('5');
    await rule(1).locator('input.num').press('Tab');
    await D.pickSwatch(rule(1).locator('cms-color-picker'), 'Red').catch(async () => {
      // compact picker: open it first
      await rule(1).locator('cms-color-picker .swatch-trigger').first().click();
      await page.locator('div.popover').filter({ visible: true }).getByTitle('Red').first().click();
    });
    await D.saveCard(page);
    const css = await styleOf();
    need(css.includes(`'#2196F3' if states('${ENT}') != 'off' else ('var(--red-color)' if states('${ENT}') | float(0) < 5 else '#888888')`), css);
    // `unavailable` reads as 0 for the number rule; the text rule comes first.
    await setMode('unavailable');
    const a = await waitIcon(BLUE);
    await setMode('off');
    const b = await waitIcon(RED); // not "not off"; off → 0 < 5
    return `unavailable → ${a}, off → ${b}`;
  });

  await step('an attribute (hvac_action) as the source', async () => {
    await setMode('heat', { hvac_action: 'heating' });
    await openStudio();
    await D.chooseOption(page.locator('cms-threshold-module select[aria-labelledby="lbl-value-read-from"]'), 'Attribute: hvac_action').catch(async () => {
      await page.locator('cms-threshold-module select[aria-labelledby="lbl-value-read-from"]').selectOption('hvac_action');
    });
    await rule(1).getByRole('button', { name: /Remove rule 2|×/ }).click().catch(async () => { await rule(1).locator('button').last().click(); });
    await rule(0).locator('select').selectOption('is');
    const f0 = rule(0).locator('input.text-value');
    await f0.fill('heating');
    await f0.press('Tab');
    await D.saveCard(page);
    const css = await styleOf();
    need(css.includes(`'#2196F3' if state_attr('${ENT}', 'hvac_action') | string == 'heating' else '#888888'`), css);
    const a = await waitIcon(BLUE);
    await setMode('heat', { hvac_action: 'idle' });
    const b = await waitIcon(GREY);
    return `hvac_action heating → ${a}, idle → ${b}`;
  });

  await step('a number typed into "is" becomes the number rule ==', async () => {
    await openStudio();
    const f0 = rule(0).locator('input.text-value');
    await f0.fill('12');
    await f0.press('Tab');
    await wait(400);
    need((await rule(0).locator('select').inputValue()) === '==', `operator ${await rule(0).locator('select').inputValue()}`);
    need((await rule(0).locator('input.num').inputValue()) === '12', 'value');
    await D.cancelCard(page);
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

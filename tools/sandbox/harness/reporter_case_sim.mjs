// User simulation — the reporter's case of issue #42 (the 1.0.0 release run).
//
// One tile for a vacuum-like entity whose state is a word (cleaning, docked,
// error), styled through the real editor with every text condition at once:
//   Background red          while the state is "error"
//   Animation (Pulse)       while it is "cleaning"
//   Grayscale               while it is "docked"
//   Threshold icon colour   blue for "cleaning", grey otherwise
// Then the state changes live and the dashboard follows; the card reopens
// with its modules closed, each summary naming its condition.
//   node reporter_case_sim.mjs        (card-mod rig)
//   RIG=uix UIX_TOKENS_FILE=… node reporter_case_sim.mjs
import * as D from './click-driver.mjs';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const URLPATH = 'qa-reporter-case';
const ENT = 'sensor.qa_vac';
const results = [];
const need = (cond, msg) => { if (!cond) throw new Error(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const HA_OWN = /themesReady: Timeout|status of 50[02]|Error getting Image Colors|Transition was skipped|Cannot parse given Error object/;

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
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/reporter-case-fail-${results.length}.png` }).catch(() => {});
    await D.cancelCard(page).catch(() => {});
  }
};
const setVac = (state) => D.setState(h, ENT, state, { friendly_name: 'QA vacuum', icon: 'mdi:robot-vacuum' });
const mod = (tag) => page.locator(tag).first();
const open = async () => {
  try { await D.openCardEditor(page, 0); } catch {
    await D.gotoDashboard(page, URLPATH, { engine: false });
    await D.enterEditMode(page);
    await D.openCardEditor(page, 0);
  }
  await D.openStudio(page);
};
/** "A value matches" → the entity → "is" / "is not" → a text. */
const textCondition = async (m, whenSelect, op, text) => {
  await m.locator(whenSelect).selectOption('value');
  await D.pickEntity(m.locator('cms-entity-picker').last(), ENT);
  await m.locator('select[aria-labelledby="cond-op-label"]').selectOption(op);
  const f = m.locator('input.text-value');
  await f.waitFor({ state: 'visible', timeout: 5000 });
  await f.fill(text);
  await f.press('Tab');
};
/** The dashboard tile (not the editor's preview). */
const look = () => page.evaluate(() => {
  const all = []; const walk = (root) => { for (const el of root.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } }; walk(document);
  const card = all.find((e) => e.tagName === 'HUI-TILE-CARD' && !e.closest('hui-dialog-edit-card'));
  const ha = card && (card.shadowRoot ?? card).querySelector('ha-card');
  if (!ha) return null;
  const inner = []; const w2 = (root) => { for (const el of root.querySelectorAll('*')) { inner.push(el); if (el.shadowRoot) w2(el.shadowRoot); } }; w2(card.shadowRoot ?? card);
  const icon = inner.find((e) => e.tagName === 'HA-STATE-ICON');
  const cs = getComputedStyle(ha);
  return { bg: cs.backgroundColor, anim: cs.animationName, filter: cs.filter, icon: icon ? getComputedStyle(icon).color : null };
});
const RED = 'rgb(244, 67, 54)';
const BLUE = 'rgb(33, 150, 243)';
const GREY = 'rgb(136, 136, 136)';
const until = async (test, what) => {
  let v;
  for (let i = 0; i < 30; i++) { v = await look(); if (v && test(v)) return v; await wait(400); }
  throw new Error(`${what}: ${JSON.stringify(v)}`);
};

try {
  await setVac('cleaning');
  await D.seedDashboard(page, URLPATH, [{ type: 'tile', entity: ENT }], { view: { type: 'masonry' } });
  await D.gotoDashboard(page, URLPATH, { engine: false });
  const own = await look();
  await D.enterEditMode(page);

  await step('style it through the editor: four text conditions on one card', async () => {
    await open();
    await D.setSectionEnabled(page, 'Background', true);
    await textCondition(mod('cms-background-module'), 'select[aria-labelledby="when-label"]', 'is', 'error');
    await D.pickSwatch(await D.findControl(page, 'Background', 'Color'), 'Red');
    await D.setSectionEnabled(page, 'Animation', true);
    await textCondition(mod('cms-animation-module'), 'select[aria-labelledby="lbl-apply-when"]', 'is', 'cleaning');
    await D.setSectionEnabled(page, 'Visual Filters', true);
    await D.toggle(await D.findControl(page, 'Visual Filters', 'Grayscale'), true);
    await textCondition(mod('cms-filter-module'), 'select[aria-labelledby="when-label"]', 'is', 'docked');
    await D.setSectionEnabled(page, 'Threshold Colors', true);
    const thr = mod('cms-threshold-module');
    await thr.getByRole('button', { name: '+ Add Rule' }).click();
    await thr.locator('.rule').first().locator('select').selectOption('is');
    const f = thr.locator('.rule').first().locator('input.text-value');
    await f.waitFor({ state: 'visible', timeout: 5000 });
    need((await f.inputValue()) === 'cleaning', `the rule starts with "${await f.inputValue()}"`);
    await D.saveCard(page);
    const css = (await D.savedCards(page, URLPATH))[0]?.[KEY]?.style ?? '';
    for (const want of [
      `if states('${ENT}') == 'error' else ''`,
      `if states('${ENT}') == 'cleaning' else 'none'`,
      `if states('${ENT}') == 'docked' else 'none'`,
      `'#2196F3' if states('${ENT}') == 'cleaning' else '#888888'`,
    ]) need(css.includes(want), `missing ${want}`);
    await D.exitEditMode(page).catch(() => {});
    return '4 conditions written';
  });

  await step('cleaning: pulsing, in colour, blue icon, the card\'s own background', async () => {
    const v = await until((x) => x.anim === 'cstudio-pulse' && x.filter === 'none' && x.icon === BLUE && x.bg === own.bg, 'cleaning');
    return JSON.stringify(v);
  });
  await step('docked: grey (grayscale), still, grey icon', async () => {
    await setVac('docked');
    const v = await until((x) => x.anim === 'none' && /grayscale\(1\)/.test(x.filter) && x.icon === GREY && x.bg === own.bg, 'docked');
    return JSON.stringify(v);
  });
  await step('error: red background, still, in colour', async () => {
    await setVac('error');
    const v = await until((x) => x.bg === RED && x.anim === 'none' && x.filter === 'none' && x.icon === GREY, 'error');
    return JSON.stringify(v);
  });
  await step('cleaning again: back to pulsing, blue icon', async () => {
    await setVac('cleaning');
    const v = await until((x) => x.anim === 'cstudio-pulse' && x.icon === BLUE && x.bg === own.bg, 'cleaning again');
    return JSON.stringify(v);
  });

  await step('it reopens with its modules closed, each summary naming its condition', async () => {
    await D.enterEditMode(page);
    await open();
    const sum = async (tag) => ((await mod(tag).locator('.module-summary').textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const got = {
      background: await sum('cms-background-module'),
      animation: await sum('cms-animation-module'),
      filter: await sum('cms-filter-module'),
      threshold: await sum('cms-threshold-module'),
    };
    need(got.background === `when ${ENT} is “error”`, JSON.stringify(got));
    need(got.animation.startsWith('Pulse · ') && got.animation.endsWith(`when ${ENT} is “cleaning”`), JSON.stringify(got));
    need(got.filter === `Grayscale · when ${ENT} is “docked”`, JSON.stringify(got));
    need(got.threshold === ENT, JSON.stringify(got));
    await D.cancelCard(page);
    return JSON.stringify(got);
  });

  await step('no console errors', async () => {
    const errs = h.errors.filter((e) => !HA_OWN.test(e));
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

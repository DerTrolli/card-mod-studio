// The rename to Card Style Studio (v1.0.0-beta.2) through the real card
// editor: the new name in the panel; a card styled by an older version (the
// `cms-` names) still runs, opens with its controls, and is not changed by
// opening or cancelling; the next save writes the `cstudio-` names, which
// run on the dashboard; a hand-written rule that uses an old name keeps its
// keyframes.
//   node rename_check.mjs                 (card-mod rig)
//   RIG=uix UIX_TOKENS_FILE=/path/tokens.json node rename_check.mjs
// Prints PASS/FAIL per step and "N/M checks passed".
import * as D from './click-driver.mjs';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const URLPATH = 'qa-rename';
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
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/rename-fail-${results.length}.png` }).catch(() => {});
    await D.cancelCard(page).catch(() => {});
  }
};

// What v1.0.0-beta.1 wrote for Animation → Pulse, always.
const OLD_KF = '@keyframes cms-pulse {\n  0%, 100% { transform: scale(1); }\n  50% { transform: scale(1.05); }\n}';
const OLD = `${OLD_KF}\n\nha-card {\n  animation: cms-pulse 2s ease-in-out infinite;\n}`;
// …plus a rule of the user's own that uses the same keyframes.
const OLD_HAND = `${OLD}\n\nha-tile-icon {\n  animation: cms-pulse 1s linear 2;\n}`;

const styleOf = async (index) => (await D.savedCards(page, URLPATH))[index]?.[KEY]?.style ?? '';
/** The panel's state and texts (read only). */
const panel = () => page.evaluate(() => {
  const find = (root, tag) => { for (const el of root.querySelectorAll('*')) { if (el.tagName === tag) return el; if (el.shadowRoot) { const f = find(el.shadowRoot, tag); if (f) return f; } } return null; };
  const p = find(document, 'CMS-PANEL');
  const tab = find(document, 'CMS-TAB-BUTTON');
  const tabText = tab ? [tab.getAttribute('aria-label'), tab.getAttribute('title'), ...[...(tab.shadowRoot?.querySelectorAll('[aria-label],[title]') ?? [])].flatMap((e) => [e.getAttribute('aria-label'), e.getAttribute('title')])].filter(Boolean).join(' | ') : '';
  return { state: p?._studioState ?? null, h2: p?.shadowRoot?.querySelector('h2')?.textContent?.trim() ?? null, tabText };
});
/** The card config HA's editor dialog holds right now (unsaved). */
const dialogStyle = () => page.evaluate((key) => {
  const all = []; const walk = (root) => { for (const el of root.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } }; walk(document);
  const d = all.find((e) => e.tagName === 'HUI-DIALOG-EDIT-CARD' && e._cardConfig);
  return d ? (d._cardConfig[key]?.style ?? '') : null;
}, KEY);
const animName = (n) => page.evaluate((n) => {
  const all = []; const walk = (root) => { for (const el of root.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } }; walk(document);
  const card = all.filter((e) => e.tagName === 'HUI-TILE-CARD')[n];
  const ha = card && (card.shadowRoot ?? card).querySelector('ha-card');
  return ha ? getComputedStyle(ha).animationName : null;
}, n);
const waitAnim = async (n, want) => {
  let v;
  for (let i = 0; i < 30; i++) { v = await animName(n); if (v === want) return v; await wait(400); }
  throw new Error(`card ${n} animation-name ${v}, want ${want}`);
};

try {
  await D.seedDashboard(page, URLPATH, [
    { type: 'tile', entity: 'light.ceiling_lights', [KEY]: { style: OLD } },
    { type: 'tile', entity: 'light.ceiling_lights', [KEY]: { style: OLD_HAND } },
  ], { view: { type: 'masonry' } });
  await D.gotoDashboard(page, URLPATH, { engine: false });

  await step('a card styled by an older version still runs its animation (cms-pulse)', async () => waitAnim(0, 'cms-pulse'));

  await D.enterEditMode(page);

  await step('the panel and the Style button carry the new name', async () => {
    await D.openCardEditor(page, 0);
    await D.openStudio(page);
    const p = await panel();
    need(p.h2 === 'Card Style Studio', `heading ${p.h2}`);
    need(/Card Style Studio/.test(p.tabText) && !/Card-Mod Studio/.test(p.tabText), `tab ${p.tabText}`);
    return `${p.h2}; ${p.tabText}`;
  });

  await step('the old style opens with Animation → Pulse on and nothing left in Advanced CSS', async () => {
    const { state } = await panel();
    need(state?.animation?.enabled && state.animation.preset === 'pulse' && state.animation.trigger === 'always', JSON.stringify(state?.animation));
    need((state.advanced?.rawCss ?? '') === '', `advanced: ${state.advanced?.rawCss}`);
  });

  await step('opening it changes nothing: the editor still holds the old text; Cancel keeps it', async () => {
    const s = await dialogStyle();
    need(s === OLD, `editor holds: ${JSON.stringify(s)}`);
    await D.cancelCard(page);
    need((await styleOf(0)) === OLD, 'stored style changed');
  });

  await step('the next save writes the cstudio- names, and the dashboard runs them', async () => {
    await D.openCardEditor(page, 0);
    await D.openStudio(page);
    await D.setSectionEnabled(page, 'Background', true);
    await D.saveCard(page);
    const css = await styleOf(0);
    need(css.includes('@keyframes cstudio-pulse {') && css.includes('animation: cstudio-pulse 2s ease-in-out infinite;'), css);
    need(!css.includes('cms-'), `old names left: ${css}`);
    return waitAnim(0, 'cstudio-pulse');
  });

  await step('it reopens with the same controls and the editor holds the saved text unchanged', async () => {
    const first = await styleOf(0);
    await D.openCardEditor(page, 0);
    await D.openStudio(page);
    const { state } = await panel();
    need(state?.animation?.enabled && state.background?.enabled && (state.advanced?.rawCss ?? '') === '', JSON.stringify({ a: state?.animation, adv: state?.advanced }));
    need((await dialogStyle()) === first, `editor holds: ${JSON.stringify(await dialogStyle())}`);
    await D.cancelCard(page);
  });

  await step('a hand-written rule that uses an old name keeps its keyframes; the module writes its own', async () => {
    await D.openCardEditor(page, 1);
    await D.openStudio(page);
    await D.setSectionEnabled(page, 'Background', true);
    await D.saveCard(page);
    const css = await styleOf(1);
    need(css.split('@keyframes cms-pulse {').length - 1 === 1, `old block: ${css}`);
    need(css.includes('animation: cms-pulse 1s linear 2;'), `hand-written rule: ${css}`);
    need(css.split('@keyframes cstudio-pulse {').length - 1 === 1 && css.includes('animation: cstudio-pulse 2s ease-in-out infinite;'), `module: ${css}`);
    return waitAnim(1, 'cstudio-pulse');
  });

  await step('no console errors', async () => {
    const errs = h.errors.filter((e) => !/themesReady: Timeout|status of 50[02]|Error getting Image Colors|Transition was skipped/.test(e));
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

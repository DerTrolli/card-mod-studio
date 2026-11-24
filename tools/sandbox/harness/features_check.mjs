// Tile Features (v1.0) through the real card editor with real input: switch
// Features on, drag Height and Corner radius, pick a colour, save; measure the
// brightness slider on the dashboard; reopen and see the module read back.
//   node features_check.mjs                  (card-mod rig)
//   RIG=uix UIX_TOKENS_FILE=/path/tokens.json node features_check.mjs
// Prints PASS/FAIL per step and "N/M checks passed".
import * as D from './click-driver.mjs';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const URLPATH = 'qa-features-ui';
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
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/features-fail-${results.length}.png` }).catch(() => {});
    await D.cancelCard(page).catch(() => {});
  }
};

/** The brightness slider of the first tile on the dashboard. */
const measure = () => page.evaluate(() => {
  const walk = (root, acc) => { for (const el of root.querySelectorAll('*')) { acc.push(el); if (el.shadowRoot) walk(el.shadowRoot, acc); } return acc; };
  const tile = walk(document, []).find((e) => e.tagName === 'HUI-TILE-CARD');
  const all = tile ? walk(tile.shadowRoot, []) : [];
  const slider = all.find((e) => e.tagName === 'HA-CONTROL-SLIDER');
  const inner = slider ? walk(slider.shadowRoot, []) : [];
  const box = inner.find((e) => e.classList?.contains('slider'));
  const bar = inner.find((e) => e.classList?.contains('slider-track-bar'));
  return slider && box && bar
    ? { height: Math.round(slider.getBoundingClientRect().height), radius: getComputedStyle(box).borderTopLeftRadius, bar: getComputedStyle(bar).backgroundColor }
    : null;
});

try {
  await D.seedDashboard(page, URLPATH, [
    { type: 'tile', entity: 'light.ceiling_lights', features: [{ type: 'light-brightness' }], features_position: 'bottom' },
    { type: 'tile', entity: 'light.bed_light' },
  ]);
  await D.gotoDashboard(page, URLPATH, { engine: false });
  const before = await measure();
  await D.enterEditMode(page);

  await step('Features is offered on a tile; on a tile without features it says how to add them', async () => {
    await D.openCardEditor(page, 1);
    await D.openStudio(page);
    await D.setSectionEnabled(page, 'Features', true);
    const text = await page.locator('cms-features-module .when-hint').first().innerText();
    need(/no features yet/i.test(text), text);
    await D.cancelCard(page);
    return text.slice(0, 60);
  });

  await step('Height 60, Corner radius 4, Colour Red → saved as hui-card-features', async () => {
    await D.openCardEditor(page, 0);
    await D.openStudio(page);
    await D.setSectionEnabled(page, 'Features', true);
    await D.setSlider(await D.findControl(page, 'Features', 'Height'), 60);
    await D.setSlider(await D.findControl(page, 'Features', 'Corner radius'), 4);
    await D.pickSwatch(await D.findControl(page, 'Features', 'Color'), 'Red');
    await D.saveCard(page);
    const css = (await D.savedCards(page, URLPATH))[0]?.[KEY]?.style ?? '';
    need(/hui-card-features \{[^}]*--feature-height: 60px;[^}]*--feature-border-radius: 4px;[^}]*--feature-color: var\(--red-color\) !important;/.test(css), css);
    return css.replace(/\n/g, ' ');
  });

  await step('on the dashboard the slider is 60px high, 4px rounded, red', async () => {
    await D.exitEditMode(page).catch(() => {});
    let m;
    for (let i = 0; i < 20; i++) {
      m = await measure();
      if (m?.height === 60) break;
      await wait(500);
    }
    need(m && m.height === 60 && m.radius === '4px' && /rgb\(2[0-9]{2}, [0-9]{1,2}, [0-9]{1,2}\)/.test(m.bar), JSON.stringify({ before, after: m }));
    return JSON.stringify({ before, after: m });
  });

  await step('reopened: Features is on with the saved values, nothing in Advanced CSS', async () => {
    await D.enterEditMode(page);
    await D.openCardEditor(page, 0);
    await D.openStudio(page);
    const sec = (await D.listSections(page)).find((s) => s.name === 'Features');
    need(sec?.enabled === true, `enabled=${sec?.enabled}`);
    const st = await page.evaluate(() => {
      const find = (root) => { for (const el of root.querySelectorAll('*')) { if (el.tagName === 'CMS-PANEL') return el; if (el.shadowRoot) { const f = find(el.shadowRoot); if (f) return f; } } return null; };
      const p = find(document);
      return { f: p?._studioState?.features, adv: p?._studioState?.advanced?.rawCss };
    });
    need(st.f?.heightPx === 60 && st.f?.radiusPx === 4 && st.f?.color === 'var(--red-color)' && !st.adv?.trim(), JSON.stringify(st));
    await D.cancelCard(page);
  });

  await step('no console errors', async () => {
    const errs = h.errors.filter((e) => !/themesReady: Timeout/.test(e) && !/status of 502/.test(e));
    need(errs.length === 0, errs.join(' || '));
  });
} catch (e) {
  results.push(false);
  console.log('FAIL setup -', String(e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  await h.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

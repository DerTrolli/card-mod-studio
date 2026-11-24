// The pinned preview on a phone (v1.0): at 390px the preview comes first and
// stays in view while the modules scroll under it; a change shows in it at
// once; Hide folds it and the choice is kept when the editor is reopened.
//   node phone_preview_check.mjs             (card-mod rig)
//   RIG=uix UIX_TOKENS_FILE=/path/tokens.json node phone_preview_check.mjs
//   SHOTS_DIR=/path node phone_preview_check.mjs
// Prints PASS/FAIL per step and "N/M checks passed".
import * as D from './click-driver.mjs';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const URLPATH = 'qa-phone-preview';
const SHOTS = process.env.SHOTS_DIR || '';
const results = [];
const need = (cond, msg) => { if (!cond) throw new Error(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const h = await D.launch({ rig: RIG, viewport: { width: 390, height: 844 }, hasTouch: true, ...(process.env.TOKENS_FILE ? { tokensFile: process.env.TOKENS_FILE } : {}) });
const { page } = h;
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push(true);
    console.log('PASS', name, detail ?? '');
  } catch (e) {
    results.push(false);
    console.log('FAIL', name, '-', String(e.message || e).split('\n')[0]);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-preview-fail-${results.length}.png` }).catch(() => {});
  }
};
const geom = () => page.evaluate(() => {
  const find = (root) => { for (const el of root.querySelectorAll('*')) { if (el.tagName === 'CMS-PANEL') return el; if (el.shadowRoot) { const f = find(el.shadowRoot); if (f) return f; } } return null; };
  const p = find(document);
  const r = p.shadowRoot;
  const body = r.querySelector('.panel-body');
  const col = r.querySelector('.preview-col');
  const wrap = r.querySelector('.preview-card-wrapper');
  const b = body.getBoundingClientRect();
  const c = col.getBoundingClientRect();
  return {
    bodyTop: Math.round(b.top), colTop: Math.round(c.top), colBottom: Math.round(c.bottom), colH: Math.round(c.height),
    scroll: Math.round(body.scrollTop), wrapShown: !!wrap && getComputedStyle(wrap).display !== 'none',
    previewBg: (() => { const card = wrap?.querySelector('hui-card'); const all = []; const walk = (n) => { for (const el of n.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } }; if (card) walk(card); const ha = all.find((e) => e.tagName === 'HA-CARD'); return ha ? getComputedStyle(ha).backgroundColor : null; })(),
  };
});

try {
  await page.evaluate(() => { try { localStorage.removeItem('cms-preview-folded'); } catch { /* */ } });
  await D.seedDashboard(page, URLPATH, [{ type: 'tile', entity: 'light.ceiling_lights' }]);
  await D.gotoDashboard(page, URLPATH, { engine: false });
  await D.enterEditMode(page);
  await D.openCardEditor(page, 0);
  await D.openStudio(page);

  await step('390px: the preview comes first, pinned at the top of the panel, at most about a quarter of the screen', async () => {
    const g = await geom();
    need(Math.abs(g.colTop - g.bodyTop) <= 2 && g.wrapShown, JSON.stringify(g));
    need(g.colH <= 844 * 0.4, `preview strip ${g.colH}px high`);
    return JSON.stringify(g);
  });

  await step('it stays in view while the modules scroll under it', async () => {
    await D.setSectionEnabled(page, 'Background', true);
    await D.expandSection(page, 'Border & Radius');
    const before = await geom();
    await page.evaluate(() => {
      const find = (root) => { for (const el of root.querySelectorAll('*')) { if (el.tagName === 'CMS-PANEL') return el; if (el.shadowRoot) { const f = find(el.shadowRoot); if (f) return f; } } return null; };
      find(document).shadowRoot.querySelector('.panel-body').scrollTop = 900;
    });
    await wait(300);
    const after = await geom();
    need(after.scroll > 200 && Math.abs(after.colTop - after.bodyTop) <= 2, JSON.stringify({ before, after }));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-preview-scrolled.png` });
    return `scrolled ${after.scroll}px, preview still at ${after.colTop}`;
  });

  await step('a change shows in the pinned preview', async () => {
    await D.pickSwatch(await D.findControl(page, 'Background', 'Color'), 'Red');
    let g;
    for (let i = 0; i < 20; i++) { g = await geom(); if (g.previewBg === 'rgb(244, 67, 54)') break; await wait(300); }
    need(g.previewBg === 'rgb(244, 67, 54)', `preview background ${g.previewBg}`);
    return g.previewBg;
  });

  await step('Hide folds it; reopening the editor keeps it folded; Show brings it back', async () => {
    const toggle = page.locator('cms-panel .preview-toggle');
    await D.tap(toggle);
    need(!(await geom()).wrapShown, 'still shown after Hide');
    await D.cancelCard(page);
    await D.openCardEditor(page, 0);
    await D.openStudio(page);
    need(!(await geom()).wrapShown, 'shown again after reopening');
    await D.tap(page.locator('cms-panel .preview-toggle'));
    need((await geom()).wrapShown, 'not shown after Show');
    await D.cancelCard(page);
  });

  await step('no console errors', async () => {
    const errs = h.errors.filter((e) => !/themesReady: Timeout|status of 50[02]|Error getting Image Colors|Transition was skipped/.test(e));
    need(errs.length === 0, errs.slice(0, 3).join(' || '));
  });
} catch (e) {
  results.push(false);
  console.log('FAIL setup -', String(e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  await page.evaluate(() => { try { localStorage.removeItem('cms-preview-folded'); } catch { /* */ } }).catch(() => {});
  await h.close().catch(() => {});
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

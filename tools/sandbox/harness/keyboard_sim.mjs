// User simulation — keyboard only (the 1.0.0 release run).
//
// From the card editor's Style button to a saved card without the mouse:
// Enter opens the Studio; Tab reaches the tab list, the arrow keys / Home /
// End move between Style, Presets, Palette and Settings; Tab reaches a
// module, Enter opens it, Space switches Background on; the swatch row is
// one Tab stop (Home, then Enter picks Red); Enter in a text field stays in
// the Studio; Tab out to HA's Save and Enter saves.
//   node keyboard_sim.mjs        (card-mod rig)
import * as D from './click-driver.mjs';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const URLPATH = 'qa-keyboard';
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
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/keyboard-fail-${results.length}.png` }).catch(() => {});
  }
};

/** The focused element, through shadow roots: what a keyboard user is on. */
const active = () => page.evaluate(() => {
  let a = document.activeElement;
  let host = null; // the component around the focused element (its label may be slotted text)
  while (a && a.shadowRoot && a.shadowRoot.activeElement) { host = a; a = a.shadowRoot.activeElement; }
  if (!a) return null;
  let mod = '';
  for (let p = a; p; p = p.parentElement || p.getRootNode().host) {
    if (p.tagName && /^CMS-.*-MODULE$/.test(p.tagName)) { mod = p.tagName.toLowerCase(); break; }
  }
  let inPanel = false;
  for (let p = a; p; p = p.parentElement || p.getRootNode().host) if (p.tagName === 'CMS-PANEL') { inPanel = true; break; }
  return {
    tag: a.tagName.toLowerCase(), type: a.type || '', role: a.getAttribute('role') || '', tab: a.dataset?.tab || '', selected: a.getAttribute('aria-selected'),
    expanded: a.getAttribute('aria-expanded'), label: (a.getAttribute('aria-label') || a.title || (a.textContent || '').trim() || host?.getAttribute?.('aria-label') || (host?.textContent || '').trim()).replace(/\s+/g, ' ').trim().slice(0, 60),
    cls: typeof a.className === 'string' ? a.className : '', mod, inPanel,
  };
});
/** Presses Tab until `test(active)` holds (at most `max` times). */
const tabTo = async (test, what, max = 250, key = 'Tab') => {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(key);
    await wait(30);
    const a = await active();
    if (a && test(a)) return { a, presses: i + 1 };
  }
  throw new Error(`no ${what} within ${max} × ${key} (now on ${JSON.stringify(await active())})`);
};
const studioState = () => page.evaluate(() => {
  const find = (root) => { for (const el of root.querySelectorAll('*')) { if (el.tagName === 'CMS-PANEL') return el; if (el.shadowRoot) { const f = find(el.shadowRoot); if (f) return f; } } return null; };
  const s = find(document)?._studioState;
  return s ? { bg: s.background.enabled, color: s.background.color1 } : null;
});

try {
  await D.seedDashboard(page, URLPATH, [{ type: 'tile', entity: 'light.ceiling_lights' }], { view: { type: 'masonry' } });
  await D.gotoDashboard(page, URLPATH, { engine: false });
  await D.enterEditMode(page);
  await D.openCardEditor(page, 0);

  await step('the Style button: focus it, Enter opens the Studio', async () => {
    await page.locator('cms-tab-button button').first().focus();
    await page.keyboard.press('Enter');
    await page.locator('cms-panel').first().waitFor({ state: 'visible', timeout: 10000 });
    await wait(600);
  });

  await step('Tab reaches the tab list on the selected tab (Style)', async () => {
    const { a, presses } = await tabTo((x) => x.role === 'tab', 'tab');
    need(a.tab === 'style' && a.selected === 'true', JSON.stringify(a));
    return `${presses} × Tab`;
  });

  await step('arrow keys, End and Home move between the tabs and open them', async () => {
    const seen = [];
    for (const key of ['ArrowRight', 'ArrowRight', 'End', 'ArrowRight', 'ArrowLeft', 'Home']) {
      await page.keyboard.press(key);
      await wait(150);
      const a = await active();
      need(a?.role === 'tab' && a.selected === 'true', `${key}: ${JSON.stringify(a)}`);
      seen.push(a.tab);
    }
    need(seen.join(',') === 'presets,palette,settings,style,settings,style', seen.join(','));
    return seen.join(' → ');
  });

  await step('Tab goes from the tab list into the modules; Enter opens one and closes it again', async () => {
    const { a } = await tabTo((x) => x.cls.includes('module-toggle'), 'module header', 10);
    need(a.expanded === 'false', JSON.stringify(a));
    await page.keyboard.press('Enter');
    await wait(200);
    need((await active())?.expanded === 'true', 'Enter did not open it');
    await page.keyboard.press('Enter');
    await wait(200);
    need((await active())?.expanded === 'false', 'Enter did not close it');
    return `${a.mod} (${a.label})`;
  });

  await step('Tab to Background\'s switch, Space switches it on (and opens it)', async () => {
    // focus lands on the switch's own control inside ha-switch (role "switch")
    const { presses } = await tabTo((x) => x.mod === 'cms-background-module' && x.role === 'switch', 'Background switch');
    await page.keyboard.press('Space');
    await wait(400);
    const s = await studioState();
    need(s?.bg === true, JSON.stringify(s));
    return `${presses} × Tab`;
  });

  await step('the swatch row is one Tab stop: Home, then Enter picks Red', async () => {
    await tabTo((x) => x.mod === 'cms-background-module' && x.cls.includes('preset'), 'swatch', 30);
    await page.keyboard.press('Home');
    await wait(100);
    const a = await active();
    need(/red/i.test(a.label), `Home is on ${a.label}`);
    await page.keyboard.press('Enter');
    await wait(400);
    const s = await studioState();
    need(s?.color === 'var(--red-color)', JSON.stringify(s));
    // one Tab stop: the next Tab leaves the row
    await page.keyboard.press('Tab');
    await wait(50);
    need(!(await active())?.cls.includes('preset'), 'Tab stayed in the swatch row');
    return s.color;
  });

  await step('Enter in a text field (the colour value) stays in the Studio', async () => {
    const isText = (x) => x.mod === 'cms-background-module' && x.tag === 'input' && x.type === 'text';
    const { a } = await tabTo(isText, 'text field', 10).catch(() => tabTo(isText, 'text field', 10, 'Shift+Tab'));
    await page.keyboard.press('Enter');
    await wait(400);
    need(await page.locator('cms-panel').first().isVisible(), 'the dialog closed');
    return a.label;
  });

  await step('Tab out of the Studio to HA\'s Save; Enter saves the card', async () => {
    await tabTo((x) => !x.inPanel && /^save$/i.test(x.label), 'Save button', 400);
    await page.keyboard.press('Enter');
    await wait(1500);
    const css = (await D.savedCards(page, URLPATH))[0]?.[KEY]?.style ?? '';
    need(css.includes('background: var(--red-color)'), css.slice(0, 200));
    return 'saved: background red';
  });

  await step('no console errors', async () => {
    const errs = h.errors.filter((e) => !HA_OWN.test(e));
    need(errs.length === 0, errs.slice(0, 3).join(' || '));
  });
} catch (e) {
  results.push(false);
  console.log('FAIL setup -', String(e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  await D.cancelCard(page).catch(() => {});
  await h.close().catch(() => {});
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

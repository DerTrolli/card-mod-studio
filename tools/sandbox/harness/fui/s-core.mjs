// Core flows: the injected Style button + HA's own editor interplay, and
// HA's Save / Cancel end to end (dashboard config read back over WS, the
// saved card rendered on the real dashboard).
import {
  sleep, openEditor, clickEditOn, openStudio, styleBtn, panelVisible, mod, enable, expand, setSlider, choose, pickSwatch,
  expectCfg, expectPage, getCfg, styleStr, waitCfg, rowOf, dialogButton, readDashboardCards, resolveRgb, sameRgb, waitHass,
  saveDashboard, shot, viewDashboard, pollPage, waitDialogClosed,
} from './lib.mjs';
import { P_CARD, P_HIT, P_PANEL } from './probes.mjs';

const S = (T, c) => styleStr(T, c);
const has = (T, ...parts) => (c) => parts.every((p) => S(T, c).includes(p));
const stable = (o) => JSON.stringify(o, Object.keys(o || {}).sort());
const deepSorted = (v) => (Array.isArray(v) ? v.map(deepSorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, deepSorted(v[k])])) : v);
const same = (a, b) => JSON.stringify(deepSorted(a)) === JSON.stringify(deepSorted(b));

/** A point in the left (editor) pane: is it the Studio or HA's editor the user sees there? */
async function editorPaneHit(T) {
  const pt = await T.page.evaluate(() => {
    const d = window.__fui.dialog();
    const ed = d?.shadowRoot?.querySelector('hui-card-element-editor');
    const r = ed?.getBoundingClientRect();
    return r ? { x: r.left + Math.min(200, r.width / 3), y: r.top + 60 } : null;
  });
  return pt ? T.page.evaluate(P_HIT, pt) : null;
}

/** Clicks HA's Cancel (or the X) and confirms any "discard changes" prompt HA raises. */
export async function cancelDialog(T) {
  await dialogButton(T, 'Cancel').click();
  for (let i = 0; i < 30; i++) {
    await sleep(150);
    const state = await T.page.evaluate(() => {
      const Q = window.__fui;
      const boxes = Q.q(document.body, 'dialog-box').filter((b) => Q.vis(b));
      const d = Q.dialog();
      const open = !!(d && d.shadowRoot?.querySelector('ha-dialog') && Q.vis(d.shadowRoot.querySelector('ha-dialog')));
      return { confirm: boxes.length > 0, open };
    });
    if (state.confirm) {
      T.note('Cancel with unsaved changes raised a confirmation dialog');
      const confirm = T.page.locator('dialog-box ha-button').filter({ visible: true }).last();
      await confirm.click();
      continue;
    }
    if (!state.open) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------

async function styleButtonSection(T) {
  const cards = [{ type: 'tile', entity: 'light.ceiling_lights' }, { type: 'tile', entity: 'switch.decorative_lights' }];
  await openEditor(T, 'fui-stylebtn', cards, 0);
  const b = styleBtn(T);
  T.check('Style button injected in the dialog footer, labelled "Style", not pressed', (await b.textContent()).includes('Style') && (await b.getAttribute('aria-pressed')) === 'false');
  const before = await getCfg(T);
  let hit = await editorPaneHit(T);
  T.check('before Style: the left pane is HA\'s own editor', hit && !hit.inPanel, JSON.stringify(hit));

  await b.click();
  await openStudio(T);
  T.check('Style click → Studio panel visible + button pressed', (await panelVisible(T)) && (await b.getAttribute('aria-pressed')) === 'true');
  hit = await editorPaneHit(T);
  T.check('the Studio covers HA\'s editor pane (what the user clicks is the Studio)', hit?.inPanel, JSON.stringify(hit));
  const pv = await T.page.evaluate(P_PANEL);
  T.check('panel header shows the plugin version', /^v\d+\.\d+\.\d+/.test(pv?.version || ''), pv?.version);
  T.check('opening the Studio alone does not change the config', same(await getCfg(T), before));

  const font = mod(T, 'cms-font-module');
  await enable(font);
  await setSlider(T, rowOf(T, font, 'Text size').locator('ha-slider'), 20);
  await expectCfg(T, 'Font on + 20px emitted', has(T, 'font-size: 20px;'));

  await b.click();
  await T.page.waitForFunction(() => !window.__fui.panel(), null, { timeout: 5000 }).catch(() => {});
  T.check('second Style click hides the panel + unpresses the button', !(await panelVisible(T)) && (await b.getAttribute('aria-pressed')) === 'false');
  hit = await editorPaneHit(T);
  T.check('HA\'s own editor is back in the left pane', hit && !hit.inPanel, JSON.stringify(hit));
  T.check('config keeps the Studio edit while the panel is hidden', S(T, await getCfg(T)).includes('font-size: 20px;'));

  await b.click();
  await openStudio(T);
  T.check('re-open: Font still enabled', await mod(T, 'cms-font-module').locator('.module-header ha-switch').evaluate((e) => e.checked));
  T.check('re-open: Text size still 20px', ((await rowOf(T, mod(T, 'cms-font-module'), 'Text size').locator('.value-label').textContent()) || '').trim() === '20px');

  // HA's "Show code editor" while the Studio is OPEN
  const cfgA = await getCfg(T);
  const codeBtn = dialogButton(T, 'Show code editor');
  T.check('HA "Show code editor" button present next to Style', (await codeBtn.count()) === 1);
  await codeBtn.click();
  await dialogButton(T, 'Show visual editor').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  T.check('code editor toggled while the Studio is open (button now "Show visual editor")', (await dialogButton(T, 'Show visual editor').count()) === 1);
  T.check('config intact after toggling HA\'s YAML mode', same(await getCfg(T), cfgA));
  T.check('Studio still visible over the YAML editor', await panelVisible(T));
  await choose(rowOf(T, mod(T, 'cms-font-module'), 'Weight').locator('select'), 'bold');
  await expectCfg(T, 'Studio edits still emit while HA is in YAML mode', has(T, 'font-weight: bold;', 'font-size: 20px;'));
  await b.click();
  await T.page.waitForFunction(() => !window.__fui.panel(), null, { timeout: 5000 }).catch(() => {});
  const yaml = await T.page.evaluate(() => {
    const Q = window.__fui;
    const d = Q.dialog();
    const ed = Q.q(d, 'ha-code-editor').find((e) => Q.vis(e));
    return ed ? ed.value : null;
  });
  T.check(`HA's YAML editor text reflects the Studio edit made in YAML mode (font-weight: bold)`, !!yaml && yaml.includes(`${T.KEY}:`) && yaml.includes('font-weight: bold'), (yaml || 'no visible ha-code-editor').slice(0, 400));
  // A real keystroke in HA's YAML editor makes HA re-parse ITS text.
  const cm = T.page.locator('hui-card-element-editor ha-code-editor .cm-content').filter({ visible: true }).first();
  await cm.click();
  await T.page.keyboard.press('Control+End');
  await T.page.keyboard.press('Enter');
  await T.page.keyboard.type('name: Typed in YAML', { delay: 10 });
  const typedR = await waitCfg(T, (c) => c?.name === 'Typed in YAML', 6000);
  T.check('typing in HA\'s YAML editor lands in the config', typedR.ok, JSON.stringify(typedR.cfg).slice(0, 300));
  T.check('…and keeps the Studio edit made while YAML mode was active (font-weight: bold)', typedR.ok && S(T, typedR.cfg).includes('font-weight: bold;'), S(T, typedR.cfg).slice(0, 200));
  // YAML mode → visual mode while the Studio is CLOSED, then reopen it
  await dialogButton(T, 'Show visual editor').click();
  await codeBtn.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  T.check('back to HA\'s visual editor with the Studio closed', (await codeBtn.count()) === 1);
  await b.click();
  await openStudio(T);
  T.check('Studio reopened after the YAML round trip: Font still on at 20px', (await mod(T, 'cms-font-module').locator('.module-header ha-switch').evaluate((e) => e.checked)) && ((await rowOf(T, mod(T, 'cms-font-module'), 'Text size').locator('.value-label').textContent()) || '').trim() === '20px');
  await choose(rowOf(T, mod(T, 'cms-font-module'), 'Weight').locator('select'), 'bold');
  await expectCfg(T, 'a Studio edit after a YAML edit keeps the YAML-side change (name)', (c) => S(T, c).includes('font-weight: bold;') && c?.name === 'Typed in YAML');
  // HA code editor toggled while the Studio is CLOSED and the Studio opened IN yaml mode
  await b.click();
  await codeBtn.click();
  await b.click();
  await openStudio(T);
  T.check('Studio opens fine while HA is in YAML mode', await panelVisible(T));
  await choose(rowOf(T, mod(T, 'cms-font-module'), 'Weight').locator('select'), 'medium');
  await expectCfg(T, 'edit made from YAML mode lands in the config', has(T, 'font-weight: 500;'));
  await dialogButton(T, 'Show visual editor').click().catch(() => {});

  // Cancel discards
  const ok = await cancelDialog(T);
  T.check('Cancel closes the dialog', ok);
  const saved = await readDashboardCards(T, 'fui-stylebtn');
  T.check('Cancel discarded everything (dashboard card unchanged)', same(saved[0], cards[0]), JSON.stringify(saved[0]));

  // Reopen the editor on the OTHER card (HA may reuse the dialog element)
  await clickEditOn(T, 1);
  const btnState = await styleBtn(T).getAttribute('aria-pressed');
  const vis = await panelVisible(T);
  T.check('editing another card: Style button and panel visibility agree', (btnState === 'true') === vis, `aria-pressed=${btnState} panelVisible=${vis}`);
  if (!vis) await styleBtn(T).click();
  await openStudio(T);
  const cfg2 = await getCfg(T);
  T.check('second card: dialog config is the second card', cfg2?.entity === 'switch.decorative_lights', JSON.stringify(cfg2));
  T.check('second card: no Font leaked from the cancelled first card', !(await mod(T, 'cms-font-module').locator('.module-header ha-switch').evaluate((e) => e.checked)));
  const name2 = await T.page.evaluate(() => window.__fui.txt(window.__fui.q1(window.__fui.prev(), 'ha-tile-info')));
  T.check('second card: preview shows the second card', /Decorative/i.test(name2 || ''), name2);
  await cancelDialog(T);
}

// ---------------------------------------------------------------------------

async function saveCancelSection(T) {
  const cards = [{ type: 'tile', entity: 'light.ceiling_lights' }];
  await openEditor(T, 'fui-save', cards, 0);
  await openStudio(T);
  const bg = mod(T, 'cms-background-module');
  await enable(bg);
  await pickSwatch(rowOf(T, bg, 'Color').locator('cms-color-picker'), 'Red');
  const border = mod(T, 'cms-border-module');
  await enable(border);
  await setSlider(T, rowOf(T, border, 'Border width').locator('ha-slider'), 2);
  const r = await expectCfg(T, 'background red + 2px border emitted', has(T, 'background: var(--red-color);', 'border: 2px solid #03a9f4;'));
  const emitted = r.cfg;
  await dialogButton(T, 'Save').click();
  T.check('HA Save closes the dialog', await waitDialogClosed(T));
  const saved = (await readDashboardCards(T, 'fui-save'))[0];
  T.check(`saved dashboard card === emitted config exactly (${T.KEY})`, same(saved, emitted), JSON.stringify({ saved, emitted }).slice(0, 900));
  T.check('saved config carries no inactive-engine key', !saved?.[T.OTHER]);

  const red = await resolveRgb(T, 'var(--red-color)');
  const dashProbe = () => {
    const Q = window.__fui;
    const card = Q.q(document.body, 'hui-tile-card')[0];
    const hc = card && Q.q1(card, 'ha-card');
    if (!hc) return null;
    const cs = getComputedStyle(hc);
    return { bg: cs.backgroundColor, bw: cs.borderTopWidth };
  };
  // Direct reload (informational): card-mod as a dashboard resource misses cards built during first load.
  await T.page.goto(`${T.HA}/fui-save/0`, { waitUntil: 'domcontentloaded' });
  await waitHass(T.page);
  const direct = await pollPage(T, dashProbe, null, (v) => sameRgb(v?.bg, red), 8000);
  T.note(`saved card on a DIRECT page load of the dashboard: ${direct.ok ? 'styled' : 'NOT styled'} (${JSON.stringify(direct.v)}) — engine ${JSON.stringify(T.engines)}`);
  await viewDashboard(T, 'fui-save');
  await expectPage(T, 'dashboard (navigated to, not edit mode): saved card renders red with a 2px border', dashProbe, null, (v) => sameRgb(v?.bg, red) && v.bw === '2px', { timeout: 20000 });

  // Cancel discards a later edit
  await T.page.goto(`${T.HA}/fui-save/0?edit=1`, { waitUntil: 'domcontentloaded' });
  await waitHass(T.page);
  await T.page.waitForFunction(() => window.__fui.q(document.body, 'hui-card-options').length > 0, null, { timeout: 30000 });
  await clickEditOn(T, 0);
  await openStudio(T);
  const bg2 = mod(T, 'cms-background-module');
  T.check('reopened saved card: Background module adopted (enabled)', await bg2.locator('.module-header ha-switch').evaluate((e) => e.checked));
  await expectPage(T, 'reopened saved card: preview renders the saved red', P_CARD, 0, (v) => sameRgb(v?.bg, red));
  const pv = await T.page.evaluate(P_PANEL);
  T.check('round-trip: no "weren\'t recognised" banner (all CSS adopted by modules)', !(pv.info || []).some((t) => t.includes("weren't recognised")), JSON.stringify(pv.info));
  await expand(bg2);
  await pickSwatch(rowOf(T, bg2, 'Color').locator('cms-color-picker'), 'Green');
  await expectCfg(T, 'edit to green emitted (pending, unsaved)', has(T, 'background: var(--green-color);'));
  T.check('Cancel closes the dialog', await cancelDialog(T));
  const after = (await readDashboardCards(T, 'fui-save'))[0];
  T.check('Cancel: dashboard still holds the saved (red) config', same(after, emitted), JSON.stringify(after).slice(0, 400));
  await viewDashboard(T, 'fui-save');
  await expectPage(T, 'dashboard: still red after Cancel', dashProbe, null, (v) => sameRgb(v?.bg, red), { timeout: 20000 });
  await saveDashboard(T, 'fui-save', cards);
}

export const SECTIONS = [
  { id: 'stylebutton', run: styleButtonSection },
  { id: 'savecancel', run: saveCancelSection },
];

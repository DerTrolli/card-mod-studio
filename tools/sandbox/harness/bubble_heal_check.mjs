// Live check — the Bubble Card repair (src/utils/bubble-heal.ts), 1.0.0.
//
// card-mod / UIX sometimes attach their style element to a Bubble card before
// Bubble has its shadow root, so the element lands in the card's light DOM
// and the card shows unstyled (and a later save changes nothing on the
// dashboard). The Studio moves that element into the shadow root.
//
//   1. Loads a busy dashboard (Bubble card last of ten) LOADS times. An
//      observer installed before the page loads records every time the
//      engine's element lands in the Bubble card's light DOM. After the
//      Studio's checks have run: the card is styled on every load, the
//      Studio's repair ran exactly on the loads where the element was
//      misplaced (never otherwise), and nothing is left in the light DOM.
//      One exception is counted apart, not failed: a load where Home
//      Assistant's theme setting (hass.themes.theme) is missing and the
//      engine's element sits in place but empty — the engine waiting for
//      that setting (card-mod's / UIX's "themesReady" wait, a 1.0.0 known
//      limitation; measured in release run 2: the setting stayed missing
//      for the whole page, the repair moved nothing). More than a fifth of
//      the loads like that fails the step (a rig problem).
//   2. The review's case, five times: an unstyled Bubble card on that
//      dashboard, edit mode, Accent Blue through the Studio, Save — the
//      dashboard card shows it without a reload (entering edit mode often
//      re-renders the card into the race; the Studio repairs it), and its
//      edit button still opens the editor.
//
//   node bubble_heal_check.mjs                     (card-mod rig)
//   RIG=uix UIX_TOKENS_FILE=… node bubble_heal_check.mjs
//   HA_URL=… TOKENS_FILE=… node bubble_heal_check.mjs   (older rigs)
import * as D from './click-driver.mjs';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const LOADS = Number(process.env.LOADS || 25);
const URLPATH = 'qa-bubble-heal';
const results = [];
const need = (cond, msg) => { if (!cond) throw new Error(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BLUE = 'rgb(33, 150, 243)';

const h = await D.launch({ rig: RIG, ...(process.env.TOKENS_FILE ? { tokensFile: process.env.TOKENS_FILE } : {}) });
const { page } = h;
const KEY = h.styleKey;
const heals = [];
page.on('console', (m) => { if (/Re-attached the style of \d+ Bubble card/.test(m.text())) heals.push(m.text()); });
await page.addInitScript(() => {
  // a passive observer on each Bubble card from the moment it is created:
  // counts every time an engine element lands in the card's light DOM
  window.__misplaced = 0;
  const create = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, ...rest) {
    const el = create.call(this, tag, ...rest);
    if (String(tag).toLowerCase() === 'bubble-card') {
      new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && /^(CARD-MOD|UIX-NODE)$/.test(n.tagName)) window.__misplaced++;
      }).observe(el, { childList: true });
    }
    return el;
  };
});
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push(true);
    console.log('PASS', name, detail ?? '');
  } catch (e) {
    results.push(false);
    console.log('FAIL', name, '-', String(e.message || e).split('\n')[0]);
  }
};
const look = () => page.evaluate(() => {
  const all = []; const walk = (r) => { for (const el of r.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } }; walk(document);
  const b = all.find((e) => e.tagName === 'BUBBLE-CARD' && !e.closest('hui-dialog-edit-card'));
  const fill = b?.shadowRoot?.querySelector('.bubble-range-fill');
  return {
    fill: fill ? getComputedStyle(fill).backgroundColor : null,
    light: [...(b?.children ?? [])].filter((c) => /^(CARD-MOD|UIX-NODE)$/.test(c.tagName)).length,
    inShadow: [...(b?.shadowRoot?.children ?? [])].filter((c) => /^(CARD-MOD|UIX-NODE)$/.test(c.tagName)).length,
    // characters of style inside the engine's element (an empty one has only whitespace)
    styleChars: [...(b?.shadowRoot?.children ?? [])].filter((c) => /^(CARD-MOD|UIX-NODE)$/.test(c.tagName)).map((c) => [...c.querySelectorAll('style')].map((x) => x.textContent).join('').trim().length).join(','),
    theme: document.querySelector('home-assistant')?.hass?.themes?.theme ?? null,
    misplaced: window.__misplaced,
  };
});

const ids = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states));
const filler = [
  { type: 'heading', heading: 'Living room' },
  { type: 'tile', entity: 'light.ceiling_lights' },
  { type: 'tile', entity: 'sensor.outside_temperature' },
  { type: 'entities', entities: ['light.bed_light', 'switch.decorative_lights'] },
  { type: 'gauge', entity: 'sensor.outside_temperature', min: 0, max: 40 },
  { type: 'button', entity: 'switch.ac' },
  ...(ids.includes('climate.heatpump') ? [{ type: 'thermostat', entity: 'climate.heatpump' }] : []),
  { type: 'vertical-stack', cards: [{ type: 'tile', entity: 'switch.decorative_lights' }, { type: 'gauge', entity: 'sensor.outside_humidity' }] },
];
const bubble = { type: 'custom:bubble-card', card_type: 'button', entity: 'light.ceiling_lights', name: 'Kitchen', button_type: 'slider' };
const style = '.bubble-range-fill {\n  background-color: var(--blue-color) !important;\n  opacity: 1 !important;\n}';

try {
  await step(`${LOADS} loads of a styled Bubble card: styled every time, repaired exactly where misplaced`, async () => {
    await D.seedDashboard(page, URLPATH, [...filler, { ...bubble, [KEY]: { style } }], { view: { type: 'masonry' } });
    let misplacedLoads = 0; let healEvents = 0; const bad = []; const engineWait = [];
    for (let i = 0; i < LOADS; i++) {
      heals.length = 0;
      await page.goto(`${h.ha}/${URLPATH}/0`, { waitUntil: 'domcontentloaded' });
      await wait(9500); // the Studio checks at 1.5, 4 and 8 s
      const v = await look();
      if (v.misplaced) misplacedLoads++;
      healEvents += heals.length;
      const waiting = v.fill !== BLUE && !v.theme && !v.light && v.inShadow && /^0(,0)*$/.test(v.styleChars) && !heals.length;
      if (waiting) engineWait.push(i + 1);
      else if (v.fill !== BLUE || v.light) bad.push(`load ${i + 1}: ${JSON.stringify(v)}`);
      if (heals.length && !v.misplaced) bad.push(`load ${i + 1}: repaired although nothing was misplaced`);
      if (v.misplaced && !heals.length) bad.push(`load ${i + 1}: misplaced but not repaired`);
    }
    if (engineWait.length > LOADS / 5) bad.push(`${engineWait.length} loads with the engine waiting for Home Assistant's theme (loads ${engineWait.join(', ')}): a rig problem`);
    need(bad.length === 0, bad.slice(0, 3).join(' || '));
    const waitNote = engineWait.length ? `; ${engineWait.length} load(s) the engine waited for Home Assistant's theme setting, which stayed missing (load ${engineWait.join(', ')}; known limitation, counted apart)` : '';
    return `${misplacedLoads} of ${LOADS} loads had the engine element misplaced, ${healEvents} repair(s), all styled${waitNote}`;
  });

  await step('the review\'s case, 5 times: style a Bubble card in the editor and save; the dashboard shows it without a reload', async () => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      heals.length = 0;
      await D.seedDashboard(page, URLPATH, [...filler, bubble], { view: { type: 'masonry' } });
      await D.gotoDashboard(page, URLPATH, { engine: false });
      await wait(3000);
      await D.enterEditMode(page);
      await D.openCardEditor(page, filler.length);
      await D.openStudio(page);
      await D.setSectionEnabled(page, 'Accent Color', true);
      await D.pickSwatch(await D.findControl(page, 'Accent Color', 'Color'), 'Blue');
      await D.saveCard(page);
      let v; let at = 0;
      for (let k = 0; k < 25; k++) { await wait(300); v = await look(); if (v.fill === BLUE) { at = (k + 1) * 300; break; } }
      need(at && !v.light, `save ${i + 1}: ${JSON.stringify(v)}`);
      // the card's edit button still opens the editor
      await D.openCardEditor(page, filler.length);
      await D.cancelCard(page);
      await D.exitEditMode(page).catch(() => {});
      out.push(`${at} ms${heals.length ? ' (repaired)' : ''}`);
    }
    return out.join(', ');
  });

  await step('no console errors', async () => {
    const errs = h.errors.filter((e) => !/themesReady: Timeout|status of 50[02]|status of 404|Error getting Image Colors|Transition was skipped|Cannot parse given Error object/.test(e));
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

// User simulation — a long editing session (the 1.0.0 release run).
//
// Many rounds over several cards: first Home Assistant's own editor alone
// (the baseline), then with the Studio: open it, switch a module on, change
// a colour, visit another tab, then Cancel (or, every fifth round, Save).
// Afterwards: no Studio panel left in the page, the Studio's heap growth per
// round over the baseline (after a garbage collection) stays small, every
// save landed, and the console is clean.
//   ROUNDS=30 node long_session_sim.mjs        (card-mod rig)
import * as D from './click-driver.mjs';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const URLPATH = 'qa-long-session';
const ROUNDS = Number(process.env.ROUNDS) || 30;
const results = [];
const need = (cond, msg) => { if (!cond) throw new Error(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const HA_OWN = /themesReady: Timeout|status of 50[02]|Error getting Image Colors|Transition was skipped|Cannot parse given Error object/;

const h = await D.launch({ rig: RIG, ...(process.env.TOKENS_FILE ? { tokensFile: process.env.TOKENS_FILE } : {}) });
const { page } = h;
const KEY = h.styleKey;
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
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
const heapMB = async () => {
  await cdp.send('HeapProfiler.collectGarbage');
  await wait(300);
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Math.round((metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0) / 1e5) / 10;
};
const panels = () => page.evaluate(() => {
  let n = 0;
  const walk = (root) => { for (const el of root.querySelectorAll('*')) { if (el.tagName === 'CMS-PANEL') n++; if (el.shadowRoot) walk(el.shadowRoot); } };
  walk(document);
  return n;
});
const open = async (n) => {
  try { await D.openCardEditor(page, n); } catch {
    await D.gotoDashboard(page, URLPATH, { engine: false });
    await D.enterEditMode(page);
    await D.openCardEditor(page, n);
  }
  await D.openStudio(page);
};

const CARDS = [
  { type: 'tile', entity: 'light.ceiling_lights' },
  { type: 'tile', entity: 'sensor.outside_temperature' },
  { type: 'entities', entities: ['light.bed_light', 'switch.decorative_lights'] },
  { type: 'button', entity: 'switch.decorative_lights' },
];
const MODS = ['Background', 'Border & Radius', 'Animation', 'Visual Filters'];
const SWATCH = ['Red', 'Blue', 'Green', 'Orange'];
const TABS = ['presets', 'palette', 'settings'];

const heap = [];
let saves = 0;
try {
  await D.seedDashboard(page, URLPATH, CARDS, { view: { type: 'masonry' } });
  await D.gotoDashboard(page, URLPATH, { engine: false });
  await D.enterEditMode(page);

  // Home Assistant itself keeps every closed card editor in memory (measured
  // 2026-11-22 with the Studio's file blocked: 12 of 12 dialogs and editors
  // still alive after 12 open / Cancel rounds), and the Studio's panel lives
  // inside that editor. So the check is the Studio's EXTRA growth per round
  // over the same rounds without it, not the heap as a whole.
  const slope = (h) => (h[h.length - 1][1] - h[0][1]) / Math.max(1, h[h.length - 1][0] - h[0][0]);
  const base = [];
  await step(`baseline: ${ROUNDS} rounds of Home Assistant's own editor (open, Cancel), no Studio`, async () => {
    for (let r = 0; r < ROUNDS; r++) {
      try { await D.openCardEditor(page, r % CARDS.length); } catch (e) { throw new Error(`round ${r + 1}: ${String(e.message).split('\n')[0]}`); }
      await page.waitForTimeout(600);
      await D.cancelCard(page);
      if (r === 3 || r === ROUNDS - 1 || r % 10 === 9) base.push([r + 1, await heapMB()]);
    }
    return `heap (MB after GC) by round: ${base.map(([r, mb]) => `${r}:${mb}`).join(' ')}`;
  });

  await step(`${ROUNDS} rounds with the Studio: open, switch a module on, a colour, another tab, Cancel (Save every fifth)`, async () => {
    for (let r = 0; r < ROUNDS; r++) {
      const n = r % CARDS.length;
      try {
        await open(n);
        const secs = (await D.listSections(page)).map((s) => s.name);
        const m = MODS.find((x) => secs.includes(x) && !(n === 2 && x === 'Animation'));
        if (m) await D.setSectionEnabled(page, m, true);
        if (secs.includes('Background')) {
          await D.setSectionEnabled(page, 'Background', true);
          // a different colour on every visit to a card: a Save round always has a change
          // (HA keeps Save disabled when nothing changed)
          await D.pickSwatch(await D.findControl(page, 'Background', 'Color'), SWATCH[(r + Math.floor(r / CARDS.length)) % SWATCH.length]);
        }
        await D.selectTab(page, TABS[r % TABS.length]);
        await D.selectTab(page, 'style');
        if (r % 5 === 4) { await D.saveCard(page); saves++; } else await D.cancelCard(page);
      } catch (e) {
        throw new Error(`round ${r + 1} (card ${n}): ${String(e.message).split('\n')[0]}`);
      }
      if (r === 3 || r === ROUNDS - 1 || r % 10 === 9) heap.push([r + 1, await heapMB()]);
    }
    return `heap (MB after GC) by round: ${heap.map(([r, mb]) => `${r}:${mb}`).join(' ')}`;
  });

  await step('no Studio panel left in the page after the dialogs closed', async () => {
    await wait(500);
    const n = await panels();
    need(n === 0, `${n} cms-panel elements still in the page`);
  });

  await step('the Studio adds under 1 MB per opened editor over Home Assistant\'s own growth', async () => {
    need(base.length > 1 && heap.length > 1, 'not enough measurements');
    const extra = slope(heap) - slope(base);
    need(extra < 1, `${slope(heap).toFixed(2)} MB/round with the Studio, ${slope(base).toFixed(2)} without: +${extra.toFixed(2)}`);
    return `${slope(heap).toFixed(2)} MB/round with the Studio, ${slope(base).toFixed(2)} without (Home Assistant's own): +${extra.toFixed(2)} MB/round`;
  });

  await step('every save landed', async () => {
    const cards = await D.savedCards(page, URLPATH);
    const styled = cards.filter((c) => c?.[KEY]?.style).length;
    need(styled >= Math.min(saves, CARDS.length), `${styled} styled cards after ${saves} saves`);
    return `${saves} saves, ${styled} cards styled`;
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

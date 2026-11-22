// Screenshots for a UI / UX review of the whole panel: the overview, then
// every module expanded on its own (switched on), on a tile card and an
// entities card. Not a check — it only takes pictures.
//   OUT_DIR=/path node ux_review_shots.mjs
//   WIDTH=390 HEIGHT=844 TOUCH=1 …   phone
//   SCHEME=dark …                     browser in dark mode (HA follows it)
//   LANG_CODE=de …                    Home Assistant in German
//   RIG=uix UIX_TOKENS_FILE=…         the UIX rig
import * as D from './click-driver.mjs';
import { mkdirSync } from 'node:fs';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const OUT = process.env.OUT_DIR || './shots/ux';
const W = Number(process.env.WIDTH || 1440);
const H = Number(process.env.HEIGHT || 1000);
const TAG = process.env.TAG || `${W}${process.env.SCHEME === 'dark' ? '-dark' : ''}${process.env.LANG_CODE ? '-' + process.env.LANG_CODE : ''}`;
mkdirSync(OUT, { recursive: true });

const h = await D.launch({
  rig: RIG,
  viewport: { width: W, height: H },
  hasTouch: process.env.TOUCH === '1',
  ...(process.env.SCHEME ? { colorScheme: process.env.SCHEME } : {}),
  ...(process.env.TOKENS_FILE ? { tokensFile: process.env.TOKENS_FILE } : {}),
});
const { page } = h;
if (process.env.LANG_CODE) {
  await page.addInitScript((l) => localStorage.setItem('selectedLanguage', JSON.stringify(l)), process.env.LANG_CODE);
}
const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${TAG}-${name}.png` });
};

/** The panel's scroll area, scrolled so `sec` starts at its top. */
const scrollTo = (sec) => page.evaluate((idx) => {
  const find = (root) => { for (const el of root.querySelectorAll('*')) { if (el.tagName === 'CMS-PANEL') return el; if (el.shadowRoot) { const f = find(el.shadowRoot); if (f) return f; } } return null; };
  const p = find(document);
  const body = p?.shadowRoot?.querySelector('.panel-body .modules-col') ?? p?.shadowRoot?.querySelector('.panel-body');
  const all = []; const walk = (root) => { for (const el of root.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } }; walk(document);
  const el = all.find((e) => e.getAttribute && e.getAttribute('data-qa-sec') === String(idx));
  el?.scrollIntoView({ block: 'start' });
  return !!body;
}, sec.index);

async function studyCard(index, label) {
  await D.openCardEditor(page, index);
  await D.openStudio(page);
  await shot(`${label}-00-overview`);
  const sections = (await D.listSections(page)).filter((s) => !s.parent || s.parent < 0);
  let n = 1;
  for (const s of sections) {
    try {
      if (s.enabled === false) await D.setSectionEnabled(page, s.index, true);
      else await D.expandSection(page, s.index);
      await scrollTo(s);
      await shot(`${label}-${String(n).padStart(2, '0')}-${s.name.replace(/[^\w]+/g, '_').slice(0, 30)}`);
      await D.collapseSection(page, s.index).catch(() => {});
    } catch (e) {
      console.log('skip', label, s.name, String(e.message).split('\n')[0]);
    }
    n++;
  }
  // every module now on and closed: the summaries under their titles
  await page.evaluate(() => {
    const find = (root) => { for (const el of root.querySelectorAll('*')) { if (el.tagName === 'CMS-PANEL') return el; if (el.shadowRoot) { const f = find(el.shadowRoot); if (f) return f; } } return null; };
    find(document)?.shadowRoot?.querySelector('.modules-col')?.scrollTo(0, 0);
  });
  await shot(`${label}-${String(n++).padStart(2, '0')}-summaries`);
  for (const tab of (await D.listTabs(page)).filter((t) => t.id !== 'style')) {
    await D.selectTab(page, tab.id);
    await shot(`${label}-${String(n++).padStart(2, '0')}-tab-${tab.id}`);
  }
  await D.selectTab(page, 'style').catch(() => {});
  await D.cancelCard(page);
}

try {
  await D.seedDashboard(page, 'qa-ux-review', [
    { type: 'tile', entity: 'light.ceiling_lights' },
    { type: 'entities', entities: ['light.bed_light', 'sensor.outside_temperature', 'switch.decorative_lights'] },
  ], { view: { type: 'masonry' } });
  await D.gotoDashboard(page, 'qa-ux-review', { engine: false });
  await D.enterEditMode(page);
  await studyCard(0, 'tile');
  if (process.env.ONLY_TILE !== '1') await studyCard(1, 'entities');
  console.log('done', OUT);
} catch (e) {
  console.log('FAIL', String(e.stack || e).split('\n').slice(0, 3).join(' | '));
  await page.screenshot({ path: `${OUT}/${TAG}-error.png` }).catch(() => {});
} finally {
  await h.close().catch(() => {});
}

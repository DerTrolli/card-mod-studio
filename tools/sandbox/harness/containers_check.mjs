// Containers (v1.0) through the real card editor with real input: the card
// inside a conditional, the default entities card of an entity-filter, and a
// tile inside a horizontal-stack inside a vertical-stack. Each is styled from
// the outer card's editor (Animation on — a style that writes at once), saved,
// and checked in the stored config (exactly that card, nothing else) and on
// the dashboard (the animation runs on that card's ha-card).
//   node containers_check.mjs                  (card-mod rig)
//   RIG=uix UIX_TOKENS_FILE=/path/tokens.json node containers_check.mjs
// Prints PASS/FAIL per step and "N/M checks passed".
import * as D from './click-driver.mjs';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const URLPATH = 'qa-containers';
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
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/containers-fail-${results.length}.png` }).catch(() => {});
    await D.cancelCard(page).catch(() => {});
  }
};

/** Every ha-card on the dashboard whose animation is the Studio's pulse. */
const pulsing = () => page.evaluate(() => {
  const out = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.tagName === 'HA-CARD' && getComputedStyle(el).animationName.includes('cms-pulse')) {
        let host = el.getRootNode()?.host;
        out.push(host ? host.tagName.toLowerCase() : 'ha-card');
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return out;
});
const styleAt = (obj, path) => path.reduce((o, k) => o?.[k], obj)?.[KEY]?.style ?? '';

try {
  await D.seedDashboard(page, URLPATH, [
    { type: 'conditional', conditions: [], card: { type: 'tile', entity: 'light.ceiling_lights' } },
    { type: 'entity-filter', entities: ['light.ceiling_lights', 'light.bed_light'], state_filter: ['on', 'off'] },
    {
      type: 'vertical-stack',
      cards: [
        { type: 'tile', entity: 'light.kitchen_lights' },
        { type: 'horizontal-stack', cards: [{ type: 'tile', entity: 'light.bed_light' }, { type: 'entities', entities: ['light.ceiling_lights', 'light.bed_light'] }] },
      ],
    },
  ]);
  await D.gotoDashboard(page, URLPATH, { engine: false });
  await D.enterEditMode(page);

  await step('conditional: the card inside gets a section; Animation saved into card:', async () => {
    await D.openCardEditor(page, 0);
    await D.openStudio(page);
    const names = (await D.listSections(page)).map((s) => s.name);
    need(names.includes('Card inside: tile'), `sections: ${names.join(' | ')}`);
    await D.expandSection(page, 'Card inside: tile');
    await D.setSectionEnabled(page, { title: 'Animation', within: 'Card inside: tile' }, true);
    await D.saveCard(page);
    const cards = await D.savedCards(page, URLPATH);
    need(styleAt(cards[0], ['card']).includes('cms-pulse'), JSON.stringify(cards[0]));
    need(!cards[0][KEY], 'the conditional itself got a style');
    return 'card.' + KEY + '.style has the pulse';
  });

  await step("entity-filter: HA's default entities card gets a section; saved as card:", async () => {
    await D.openCardEditor(page, 1);
    await D.openStudio(page);
    const names = (await D.listSections(page)).map((s) => s.name);
    const title = names.find((n) => n.startsWith('Card inside: entities'));
    need(title, `sections: ${names.join(' | ')}`);
    await D.expandSection(page, title);
    await D.setSectionEnabled(page, { title: 'Animation', within: title }, true);
    await D.saveCard(page);
    const cards = await D.savedCards(page, URLPATH);
    need(cards[1].card?.type === 'entities' && styleAt(cards[1], ['card']).includes('cms-pulse'), JSON.stringify(cards[1]));
    need(JSON.stringify(cards[1].entities) === JSON.stringify(['light.ceiling_lights', 'light.bed_light']), 'entities changed');
    return title;
  });

  await step('stack in a stack: the inner tile gets a section; saved into exactly that card', async () => {
    await D.openCardEditor(page, 2);
    await D.openStudio(page);
    await D.expandSection(page, '2. horizontal-stack');
    const names = (await D.listSections(page)).map((s) => s.name);
    need(names.includes('2. entities'), `nested sections: ${names.join(' | ')}`);
    await D.expandSection(page, { title: '1. tile', within: '2. horizontal-stack' });
    await D.setSectionEnabled(page, { title: 'Animation', within: '2. horizontal-stack' }, true);
    await D.saveCard(page);
    const cards = await D.savedCards(page, URLPATH);
    need(styleAt(cards[2], ['cards', 1, 'cards', 0]).includes('cms-pulse'), JSON.stringify(cards[2]));
    need(!cards[2].cards[0][KEY] && !cards[2].cards[1][KEY] && !cards[2].cards[1].cards[1][KEY] && !cards[2][KEY], 'another card got a style');
    return 'cards[1].cards[0]';
  });

  await step('a nested entities card offers per-row styling', async () => {
    await D.openCardEditor(page, 2);
    await D.openStudio(page);
    await D.expandSection(page, '2. horizontal-stack');
    await D.expandSection(page, { title: '2. entities', within: '2. horizontal-stack' });
    const rows = (await D.listSections(page)).filter((s) => s.kind === 'entity');
    need(rows.length >= 2, `rows: ${rows.map((r) => r.name).join(' | ')}`);
    await D.cancelCard(page);
    return rows.map((r) => r.sub || r.name).join(', ');
  });

  await step('on the dashboard: the three styled cards pulse, the others not', async () => {
    await D.exitEditMode(page).catch(() => {});
    await D.gotoDashboard(page, URLPATH, { engine: true, expectStyled: true }).catch(() => {});
    await wait(1500);
    const p = await pulsing();
    need(p.length === 3, `pulsing: ${p.join(', ')}`);
    return p.join(', ');
  });

  await step('no console errors', async () => {
    // rig noise: card-mod's theme wait, the offline map tiles (502)
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

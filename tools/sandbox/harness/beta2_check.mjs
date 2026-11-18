// 1.0.0-beta.2 features through the real card editor with real input:
// Square corners (Border & Radius), … — each saved, measured on the dashboard
// and read back on reopen.
//   node beta2_check.mjs                  (card-mod rig)
//   RIG=uix UIX_TOKENS_FILE=/path/tokens.json node beta2_check.mjs
// Prints PASS/FAIL per step and "N/M checks passed".
import * as D from './click-driver.mjs';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const URLPATH = 'qa-beta2';
const results = [];
const need = (cond, msg) => { if (!cond) throw new Error(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const h = await D.launch({ rig: RIG, ...(process.env.TOKENS_FILE ? { tokensFile: process.env.TOKENS_FILE } : {}) });
const { page } = h;
const KEY = h.styleKey;
let errSeen = 0;
const step = async (name, fn) => {
  if (process.env.DEBUG_ERRS) { const n = h.errors.length; if (n > errSeen) console.log('ERRS before', name, h.errors.slice(errSeen)); errSeen = n; }
  try {
    const detail = await fn();
    results.push(true);
    console.log('PASS', name, detail ?? '');
  } catch (e) {
    results.push(false);
    console.log('FAIL', name, '-', String(e.message || e).split('\n')[0]);
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/beta2-fail-${results.length}.png` }).catch(() => {});
    await D.cancelCard(page).catch(() => {});
  }
};

/** The panel's state (read only). */
const studioState = () => page.evaluate(() => {
  const find = (root) => { for (const el of root.querySelectorAll('*')) { if (el.tagName === 'CMS-PANEL') return el; if (el.shadowRoot) { const f = find(el.shadowRoot); if (f) return f; } } return null; };
  return find(document)?._studioState ?? null;
});
/** A computed style on the n-th card of the given tag on the dashboard. */
const cardStyle = (tag, prop, n = 0) => page.evaluate(({ tag, prop, n }) => {
  const walk = (root, acc) => { for (const el of root.querySelectorAll('*')) { acc.push(el); if (el.shadowRoot) walk(el.shadowRoot, acc); } return acc; };
  const card = walk(document, []).filter((e) => e.tagName === tag)[n];
  const ha = card && (card.shadowRoot ?? card).querySelector('ha-card');
  return ha ? getComputedStyle(ha)[prop] : null;
}, { tag, prop, n });
/** The colour of the first text node equal to `text` inside the n-th card of a tag. */
const textColor = (tag, text, n = 0) => page.evaluate(({ tag, text, n }) => {
  const walk = (root, acc) => { for (const el of root.querySelectorAll('*')) { acc.push(el); if (el.shadowRoot) walk(el.shadowRoot, acc); } return acc; };
  const card = walk(document, []).filter((e) => e.tagName === tag)[n];
  if (!card) return null;
  const el = walk(card.shadowRoot ?? card, []).find((e) => [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim() === text));
  return el ? getComputedStyle(el).color : null;
}, { tag, text, n });
const RED = 'rgb(244, 67, 54)'; // var(--red-color)
const waitText = async (tag, text, want, n = 0) => {
  let v;
  for (let i = 0; i < 30; i++) { v = await textColor(tag, text, n); if (v === want) return v; await wait(400); }
  throw new Error(`${tag} "${text}" colour ${v}, want ${want}`);
};
const waitStyle = async (tag, prop, want, n = 0) => {
  let v;
  for (let i = 0; i < 30; i++) { v = await cardStyle(tag, prop, n); if (v === want) return v; await wait(400); }
  throw new Error(`${tag} ${prop} = ${v}, want ${want}`);
};

try {
  await D.seedDashboard(page, URLPATH, [
    { type: 'tile', entity: 'light.ceiling_lights' },
    // no name: — HA 2025.9's alarm panel logs "Invalid configuration" for it (its own)
    { type: 'alarm-panel', entity: 'alarm_control_panel.security' },
    { type: 'picture-elements', image: '/static/icons/favicon-192x192.png', elements: [{ type: 'state-label', entity: 'light.ceiling_lights', style: { top: '50%', left: '50%' } }] },
    { type: 'heading', heading: 'QA heading' },
    { type: 'tile', entity: 'light.bed_light', [KEY]: { style: 'ha-card {\n  background: #ff0000;\n}\n\n@media (min-width: 0px) {\n  .keep { color: red; }\n}\n\nha-card {\n  background: #0000ff;\n}\n' } },
  ], { view: { type: 'masonry' } });
  await D.gotoDashboard(page, URLPATH, { engine: false });
  const before = await cardStyle('HUI-TILE-CARD', 'borderTopLeftRadius');
  await D.enterEditMode(page);

  // ------------------------------------------------------------ #1 square
  await step('Square corners: switch on → saved as border-radius: 0px', async () => {
    await D.openCardEditor(page, 0);
    await D.openStudio(page);
    await D.setSectionEnabled(page, 'Border & Radius', true);
    await D.toggle(await D.findControl(page, 'Border & Radius', 'Square corners'), true);
    const slider = page.locator('cms-border-module ha-slider').first();
    need(await slider.evaluate((e) => e.hasAttribute('disabled') || e.disabled === true), 'radius slider still enabled');
    await D.saveCard(page);
    const css = (await D.savedCards(page, URLPATH))[0]?.[KEY]?.style ?? '';
    need(/ha-card \{[^}]*border-radius: 0px;/.test(css), css);
    return `${css.replace(/\n/g, ' ')} (card was ${before})`;
  });

  await step('on the dashboard the tile has square corners', async () => {
    await D.exitEditMode(page).catch(() => {});
    return await waitStyle('HUI-TILE-CARD', 'borderTopLeftRadius', '0px');
  });

  await step('reopened: Square corners is on, nothing in Advanced CSS; off again → the card’s own rounding', async () => {
    await D.enterEditMode(page);
    await D.openCardEditor(page, 0);
    await D.openStudio(page);
    const st = await studioState();
    need(st?.border?.enabled && st.border.squareCorners === true && !st.advanced?.rawCss?.trim(), JSON.stringify({ b: st?.border, adv: st?.advanced }));
    await D.expandSection(page, 'Border & Radius');
    await D.toggle(await D.findControl(page, 'Border & Radius', 'Square corners'), false);
    await D.saveCard(page);
    const css = (await D.savedCards(page, URLPATH))[0]?.[KEY]?.style ?? '';
    need(!/border-radius/.test(css), css);
    await D.exitEditMode(page).catch(() => {});
    return await waitStyle('HUI-TILE-CARD', 'borderTopLeftRadius', before);
  });

  // ------------------------------------------------- #2 unhidden controls
  await step('alarm panel: Font → Text color Red reaches the title; Threshold offers Text color', async () => {
    await D.enterEditMode(page);
    await D.openCardEditor(page, 1);
    await D.openStudio(page);
    await D.setSectionEnabled(page, 'Font', true);
    await D.pickSwatch(await D.findControl(page, 'Font', 'Text color'), 'Red');
    await D.setSectionEnabled(page, 'Threshold Colors', true);
    const applyTo = await page.locator('cms-threshold-module .property-check').allInnerTexts();
    need(applyTo.some((t) => /Text Color/i.test(t)), `Apply to: ${applyTo.join(' | ')}`);
    await D.setSectionEnabled(page, 'Threshold Colors', false);
    await D.saveCard(page);
    await D.exitEditMode(page).catch(() => {});
    const title = await page.evaluate(() => document.querySelector('home-assistant').hass.states['alarm_control_panel.security'].attributes.friendly_name);
    return `title "${title}" ${await waitText('HUI-ALARM-PANEL-CARD', title, RED)}; Apply to: ${applyTo.join(', ')}`;
  });

  await step('picture-elements: Font → Text color Red reaches the state label', async () => {
    await D.enterEditMode(page);
    await D.openCardEditor(page, 2);
    await D.openStudio(page);
    await D.setSectionEnabled(page, 'Font', true);
    await D.pickSwatch(await D.findControl(page, 'Font', 'Text color'), 'Red');
    await D.saveCard(page);
    await D.exitEditMode(page).catch(() => {});
    const label = await page.evaluate(() => document.querySelector('home-assistant').hass.formatEntityState(document.querySelector('home-assistant').hass.states['light.ceiling_lights']));
    return `label "${label}" ${await waitText('HUI-PICTURE-ELEMENTS-CARD', label, RED)}`;
  });

  await step('heading: Animation offered without Glow / Spin / Gradient Shift; Bounce runs on the dashboard', async () => {
    await D.enterEditMode(page);
    await D.openCardEditor(page, 3);
    await D.openStudio(page);
    await D.setSectionEnabled(page, 'Animation', true);
    const sel = await D.findControl(page, 'Animation', 'Preset');
    const names = await page.locator('cms-animation-module select').first().evaluate((e) => [...e.options].map((o) => o.textContent.trim()));
    need(!names.some((n) => /^(Glow|Spin|Gradient Shift)/.test(n)), names.join(' | '));
    await D.chooseOption(sel, 'Bounce (vertical)');
    await D.saveCard(page);
    await D.exitEditMode(page).catch(() => {});
    return `${await waitStyle('HUI-HEADING-CARD', 'animationName', 'cstudio-bounce')}; presets: ${names.join(', ')}`;
  });

  // ------------------------------------------------------- #3 take over
  await step('take over: the override warning offers it, shows what goes, Remove applies the module', async () => {
    await D.enterEditMode(page);
    await D.openCardEditor(page, 4);
    await D.openStudio(page);
    await D.expandSection(page, 'Background');
    const hint = page.locator('cms-background-module .override-hint');
    await hint.waitFor({ state: 'visible', timeout: 10000 });
    await hint.locator('cms-take-over button').click();
    const confirm = await hint.locator('cms-take-over .confirm').innerText();
    need(/ha-card \{ background \}/.test(confirm), confirm);
    await hint.locator('cms-take-over button.go').click();
    await hint.waitFor({ state: 'hidden', timeout: 5000 });
    const st = await studioState();
    need(st.advanced.rawCss.trim() === '@media (min-width: 0px) {\n  .keep { color: red; }\n}', JSON.stringify(st.advanced.rawCss));
    await D.saveCard(page);
    const css = (await D.savedCards(page, URLPATH))[4]?.[KEY]?.style ?? '';
    need(!/#0000ff/.test(css) && /background: #ff0000;/.test(css) && /\.keep \{ color: red; \}/.test(css), css);
    await D.exitEditMode(page).catch(() => {});
    return `${await waitStyle('HUI-TILE-CARD', 'backgroundColor', 'rgb(255, 0, 0)', 1)}; confirm: ${confirm.slice(0, 80)}`;
  });

  // ------------------------------------- Settings: key + integration note
  await step('⚙️ Settings names the key styles are written under, and the integration', async () => {
    await D.enterEditMode(page);
    await D.openCardEditor(page, 0);
    await D.openStudio(page);
    await D.expandSection(page, 'Settings');
    const body = await page.locator('cms-settings .module-body').innerText();
    const key = await page.locator('cms-settings .module-body code').first().innerText();
    need(key === `${KEY}:`, `shows ${key}, the rig writes ${KEY}:`);
    const loaded = await page.evaluate(() => document.querySelector('home-assistant').hass.config.components.includes('card_mod_studio'));
    if (loaded) need(/administrator sets defaults/i.test(body), body);
    else {
      const href = await page.locator('cms-settings .site-note a').getAttribute('href');
      need(/wiki\/Integration$/.test(href ?? ''), `link ${href}`);
    }
    await D.cancelCard(page);
    return `${key} — integration ${loaded ? 'installed: administrator note' : 'missing: install link'}`;
  });

  await step('no console errors', async () => {
    // Home Assistant's own (see language_check.mjs): HA 2025.9's media proxy 500s, the engines' theme wait
    const errs = h.errors.filter((e) => !/themesReady: Timeout|status of 50[02]|Error getting Image Colors|Transition was skipped/.test(e));
    need(errs.length === 0, errs.join(' || '));
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

// Live check for Font → Number size (v0.11, docs/V0.11_PLAN.md G1/C1.5):
// in HA's real card editor, on a gauge and a thermostat, the Studio's
// "Number size" control writes its exact pierced dict entry, the number in
// the preview really changes size and stays inside the card at both ends
// of the slider, switching it off returns the style to a plain string, and
// a reopened card reads the setting back.
//
//   HA_URL=… TOKENS_FILE=… STYLE_KEY=card_mod|uix node pierce_check.mjs
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rigEnv, fuiTokens, launch, makeT, HaWs, sleep, openEditor, openStudio, mod, expand, rowOf, setSlider, getCfg } from './fui/lib.mjs';
import { makeRecorder, finish, resetTheme } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const env = rigEnv();
const { tokens } = await fuiTokens(env);
const ws = await new HaWs(env.HA, tokens.access_token).connect();
const { browser, page } = await launch(env, tokens);
const { results, record } = makeRecorder();
const T = makeT({ page, env, record, shotsDir: resolve(HERE, 'shots'), ws });
const KEY = T.KEY;

// What the preview renders: the number's font size, and whether it sits
// inside its own box (gauge: the SVG's viewBox; thermostat: the ha-card).
const measure = (kind) => page.evaluate((kind) => {
  const Q = window.__fui;
  const card = Q.prev();
  if (!card) return null;
  if (kind === 'gauge') {
    // The gauge refits its number into its own SVG box, so what shows is
    // the rendered height — and the SVG clips, so "inside" is the SVG's box.
    const t = Q.q1(card, 'text.value-text');
    const svg = t?.ownerSVGElement;
    if (!t || !svg) return { missing: true };
    // Glyph boxes poke a pixel or two past the SVG even at HA's default, so
    // the test is "no more overflow than the default has".
    const r = t.getBoundingClientRect(); const c = svg.getBoundingClientRect();
    const overflow = Math.round(Math.max(0, c.left - r.left, r.right - c.right, c.top - r.top, r.bottom - c.bottom));
    return { h: Math.round(r.height), overflow };
  }
  const v = Q.q1(card, 'ha-big-number')?.shadowRoot?.querySelector('.value') ?? Q.q1(card, '.value');
  const hc = Q.q1(card, 'ha-card');
  if (!v || !hc) return { missing: true };
  const r = v.getBoundingClientRect(); const c = hc.getBoundingClientRect();
  return { size: getComputedStyle(v).fontSize, h: Math.round(r.height), inside: r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1 };
}, kind);

const waitStyle = async (pred, timeout = 6000) => {
  const t0 = Date.now();
  let cfg;
  while (Date.now() - t0 < timeout) {
    cfg = await getCfg(T);
    if (pred(cfg?.[KEY]?.style)) return cfg;
    await sleep(200);
  }
  return cfg;
};

const CASES = {
  gauge: {
    card: { type: 'gauge', entity: 'sensor.outside_humidity', min: 0, max: 100 },
    label: 'Number size', key: 'ha-gauge$',
    // slider value (% of HA's number box) → expected entry; rendered height vs HA's default
    steps: [[125, 'bigger'], [50, 'smaller'], [150, 'bigger']],
    entry: (pct) => `.text {\n  max-width: ${Math.round(55 * pct / 10) / 10}% !important;\n  max-height: ${Math.round(40 * pct / 10) / 10}% !important;\n}`,
  },
  thermostat: {
    card: { type: 'thermostat', entity: 'climate.heatpump' },
    label: 'Temperature size', key: 'ha-state-control-climate-temperature$',
    steps: [[30, '30px'], [24, '24px'], [96, '96px']],
    entry: (px) => ({ 'ha-big-number$': `.value {\n  font-size: ${px} !important;\n}` }),
  },
};

for (const [kind, c] of Object.entries(CASES)) {
  T.section = kind;
  await openEditor(T, `pierce-${kind}`, [{ ...c.card, [KEY]: { style: 'ha-card {\n  border: 2px solid rgb(1, 2, 3);\n}' } }]);
  if (kind === 'gauge') {
    const was = await resetTheme(page);
    if (was) console.log(`theme reset to default (was ${JSON.stringify(was)})`);
  }
  await openStudio(T);
  const base = await measure(kind);
  const font = mod(T, 'cms-font-module');
  await expand(font);
  const row = rowOf(T, font, c.label);
  record(`[${kind}] Number size row offered`, (await row.count()) === 1);
  await row.locator('ha-switch').click();
  let cfg = await waitStyle((s) => s && typeof s === 'object' && s[c.key]);
  const style = cfg?.[KEY]?.style;
  record(`[${kind}] switching on writes a dict with '.' + the owned entry`, typeof style === 'object' && typeof style['.'] === 'string' && style['.'].includes('border') && !!style[c.key], JSON.stringify(style));

  for (const [v, expect] of c.steps) {
    const want = kind === 'gauge' ? c.entry(v) : c.entry(expect);
    await setSlider(T, row.locator('ha-slider'), v);
    cfg = await waitStyle((s) => s && JSON.stringify(s[c.key]) === JSON.stringify(want));
    record(`[${kind}] slider ${v} → exact entry`, JSON.stringify(cfg?.[KEY]?.style?.[c.key]) === JSON.stringify(want), JSON.stringify(cfg?.[KEY]?.style?.[c.key]));
    await sleep(1200);
    const m = await measure(kind);
    const sized = kind === 'gauge'
      ? (expect === 'bigger' ? m?.h > base?.h : m?.h < base?.h)
      : m?.size === expect;
    const notClipped = kind === 'gauge' ? m?.overflow <= (base?.overflow ?? 0) + 1 : m?.inside;
    record(`[${kind}] preview number renders ${kind === 'gauge' ? expect : 'at ' + expect}, not clipped`, !!(m && sized && notClipped), JSON.stringify({ base, now: m }));
    if (process.env.PIERCE_SHOTS) await page.locator('cms-panel').filter({ visible: true }).first().screenshot({ path: resolve(HERE, 'shots', `pierce-${kind}-${v}.png`) });
  }

  // reopen: the setting is read back, Advanced CSS stays empty
  await openEditor(T, `pierce-${kind}`, [cfg]);
  await openStudio(T);
  await expand(mod(T, 'cms-font-module'));
  const reread = await rowOf(T, mod(T, 'cms-font-module'), c.label).locator('ha-switch').evaluate((e) => e.checked);
  const adv = await page.evaluate(() => window.__fui.panel()?._studioState?.advanced?.rawCss ?? null);
  record(`[${kind}] reopened card reads Number size back, Advanced CSS empty`, reread && adv === '', JSON.stringify({ reread, adv }));

  // switch off → plain string again
  await rowOf(T, mod(T, 'cms-font-module'), c.label).locator('ha-switch').click();
  cfg = await waitStyle((s) => typeof s === 'string');
  record(`[${kind}] switching off returns a plain string style`, typeof cfg?.[KEY]?.style === 'string' && cfg[KEY].style.includes('border'), JSON.stringify(cfg?.[KEY]?.style));
}

await browser.close();
ws.close();
finish(writeFileSync, resolve, HERE, `pierce-check-${KEY}.json`, results);

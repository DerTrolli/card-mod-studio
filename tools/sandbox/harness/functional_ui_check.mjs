// Functional UI check (v0.10.0 release gate) — drives EVERY control of EVERY
// Card-Mod Studio module through real user input inside HA's REAL card-edit
// dialog, and verifies both the emitted config (`hui-dialog-edit-card.
// _cardConfig`, under the rig's engine key) and the rendered result (computed
// styles of the panel's live preview, and of the real dashboard after Save).
//
// Real input only: Playwright locators (they pierce open shadow roots) with
// actionability checks, mouse clicks on visible controls, keyboard typing,
// selectOption on the real <select>s, ha-slider via a track click + arrow
// keys, HA's own entity picker via click + type + click on the list entry,
// the preset bar's inline name field (any native dialog is recorded in
// notes.json). Internal state is only ever READ.
//
// One rig per run, chosen like every other check:
//   HA_URL=http://127.0.0.1:8124 TOKENS_FILE=tokens-uix.json STYLE_KEY=uix node functional_ui_check.mjs
// Optional: FUI_ONLY=font,filter  FUI_SKIP=palette  FUI_RIG=<label>
//           FUI_SHARED_USER=1 (run as the tokens' own user instead of the
//           isolated `fui` admin user this check creates on first run —
//           presets/palette are per HA user, isolation keeps concurrent
//           sessions on the same rig from seeing each other's palette).
// Output: functional-ui-check-<rig>.json (makeRecorder/finish shape) +
//         shots/fui/<rig>/ (screenshots of failures and key states).
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeRecorder, finish } from './harness-utils.mjs';
import { HARNESS, rigEnv, fuiTokens, launch, waitHass, makeT, HaWs, shot } from './fui/lib.mjs';
import { SECTIONS as CORE } from './fui/s-core.mjs';
import { SECTIONS as MODULES } from './fui/s-modules.mjs';
import { SECTIONS as STRUCTURE } from './fui/s-structure.mjs';

const ALL = [...CORE, ...MODULES, ...STRUCTURE];

const run = async () => {
  const env = rigEnv();
  const { results, record } = makeRecorder();
  const { tokens, user } = await fuiTokens(env);
  const ws = await new HaWs(env.HA, tokens.access_token).connect();
  const { browser, page } = await launch(env, tokens);

  // A storage dashboard of our own: lovelace resources (card-mod) only load on dashboards.
  try { await ws.call({ type: 'lovelace/dashboards/create', url_path: 'fui-home', mode: 'storage', title: 'FUI home', show_in_sidebar: false }); } catch { /* exists */ }
  await ws.call({ type: 'lovelace/config/save', url_path: 'fui-home', config: { views: [{ title: 'fui', cards: [{ type: 'tile', entity: 'light.ceiling_lights' }] }] } });
  await page.goto(`${env.HA}/fui-home/0`, { waitUntil: 'domcontentloaded' });
  await waitHass(page);
  const meta = await page.evaluate(() => {
    const hass = document.querySelector('home-assistant').hass;
    return { version: hass.config.version, user: hass.user?.name, admin: hass.user?.is_admin };
  });
  await page.waitForFunction(() => !!(customElements.get('card-mod') || customElements.get('uix-node')), null, { timeout: 30000 });
  const engines = await page.evaluate(() => ({ cardMod: !!customElements.get('card-mod'), uix: !!customElements.get('uix-node') }));
  const RIG = process.env.FUI_RIG || `${env.KEY === 'uix' ? 'uix' : 'cardmod'}-${meta.version}`;
  const shotsDir = resolve(HARNESS, 'shots', 'fui', RIG);
  const T = makeT({ page, env, record, shotsDir, ws });
  T.rig = RIG;
  T.haVersion = meta.version;
  T.engines = engines;
  console.log(`rig ${RIG}: HA ${meta.version}, user ${meta.user} (${user}, admin=${meta.admin}), engines ${JSON.stringify(engines)}, key ${env.KEY}`);

  T.section = 'rig';
  T.check(`rig sanity: engine matches STYLE_KEY (${env.KEY})`, env.KEY === 'uix' ? engines.uix && !engines.cardMod : engines.cardMod && !engines.uix, JSON.stringify(engines));

  const t0 = Date.now();
  for (const s of ALL) {
    if (env.only.length && !env.only.includes(s.id)) continue;
    if (env.skip.includes(s.id)) continue;
    if (s.when && !s.when(T)) continue;
    T.section = s.id;
    const ts = Date.now();
    const before = results.length;
    const errsBefore = T.pageErrors.length;
    try {
      await s.run(T);
    } catch (e) {
      T.check('section ran to completion (no harness exception)', false, String(e?.stack || e).slice(0, 900));
      await shot(T, 'exception');
    }
    const newErrs = T.pageErrors.slice(errsBefore);
    T.check('no uncaught page errors while driving this section', newErrs.length === 0, newErrs.map((e) => e.msg).join(' | ') || undefined);
    const secRes = results.slice(before);
    console.log(`   ↳ ${s.id}: ${secRes.filter((r) => r.pass).length}/${secRes.length} in ${((Date.now() - ts) / 1000).toFixed(1)}s`);
  }

  ws.close();
  await browser.close();
  const file = `functional-ui-check-${RIG}.json`;
  mkdirSync(shotsDir, { recursive: true });
  writeFileSync(resolve(shotsDir, 'notes.json'), JSON.stringify({ rig: RIG, haVersion: meta.version, key: env.KEY, seconds: Math.round((Date.now() - t0) / 1000), notes: T.notes, dialogs: T.dialogs, pageErrors: T.pageErrors }, null, 2));
  finish(writeFileSync, resolve, HARNESS, file, results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

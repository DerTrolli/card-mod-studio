// v0.10 dict-form model: dictionary styles are EDITABLE — the '.' entry
// runs through the normal module pipeline while every pierced entry is
// preserved byte-identically, in original key order, through real panel
// edits. Verifies:
//   1. A card with a dict style (pierce entries, no '.') renders the full
//      module set — no freeze banner — and the Advanced module shows the
//      pierced entries read-only.
//   2. A panel edit on that card emits a config whose pierced entries are
//      byte-identical, with the new '.' entry added first.
//   3. A dict style WITH a '.' mid-dict: an edit updates '.' in place —
//      key order preserved, pierced bytes untouched.
//   4. Mixed-form (string style + dict on the other key) still freezes:
//      banner shown, modules hidden, both keys byte-identical after a save.
//   5. An entities card's dict-form ROW is editable the same way: a row
//      edit rebuilds the row dict around '.' keeping its pierced entry.
//   6. A stack child with a dict style gets editable modules and preserves
//      its pierced entries through a child edit.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { waitForHassReady, makeRecorder, finish } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, process.env.TOKENS_FILE || 'tokens.json'), 'utf8'));
const STYLE_KEY = process.env.STYLE_KEY || 'card_mod';

const { results, record } = makeRecorder();

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript((t) => { localStorage.setItem('hassTokens', JSON.stringify(t)); }, tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });

  const out = await page.evaluate(async ({ styleKey }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const mk = async (config) => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
      document.querySelector('home-assistant').shadowRoot.appendChild(host);
      const panel = document.createElement('cms-panel');
      panel.hass = document.querySelector('home-assistant').hass;
      panel.config = config;
      host.appendChild(panel);
      await panel.updateComplete;
      await sleep(1200);
      return { panel, host };
    };
    const editAdvanced = async (panel, rawCss) => {
      let emitted = null;
      const onCfg = (e) => { emitted = e.detail.config; };
      panel.addEventListener('config-changed', onCfg);
      panel._studioState = {
        ...panel._studioState,
        advanced: { ...panel._studioState.advanced, rawCss },
      };
      panel._emitConfigChanged();
      await sleep(400);
      panel.removeEventListener('config-changed', onCfg);
      return emitted;
    };

    const res = {};

    // ---- 1+2. dict card (pierce-only): editable, pierced preserved -------
    const pierced = 'text.value-text {\n  font-size: 30px;\n}';
    const a = await mk({ type: 'gauge', entity: 'sensor.outside_temperature', [styleKey]: { style: { 'ha-gauge$': pierced } } });
    const bannerA = [...a.panel.shadowRoot.querySelectorAll('.container-banner')].map((el) => el.textContent).join(' ');
    res.noFreezeBanner = !/Mixed-form|preserved as-is/i.test(bannerA);
    res.modulesVisible = !!a.panel.shadowRoot.querySelector('cms-border-module') && !!a.panel.shadowRoot.querySelector('cms-filter-module');
    const advA = a.panel.shadowRoot.querySelector('cms-advanced-module');
    const piercedBlock = advA?.shadowRoot?.querySelector('.pierced');
    res.piercedShown = !!piercedBlock && piercedBlock.textContent.includes('ha-gauge$');
    const emittedA = await editAdvanced(a.panel, 'ha-card { clip-path: circle(40%); }');
    const styleA = emittedA?.[styleKey]?.style;
    res.editKeptDict = !!styleA && typeof styleA !== 'string';
    res.editKeptPierced = styleA?.['ha-gauge$'] === pierced;
    res.editAddedRootFirst = !!styleA && Object.keys(styleA)[0] === '.' && String(styleA['.']).includes('clip-path');
    a.host.remove();

    // ---- 3. dict with '.' mid-dict: order + bytes survive an edit --------
    const b = await mk({
      type: 'gauge', entity: 'sensor.outside_temperature',
      [styleKey]: { style: { 'ha-gauge$': pierced, '.': 'ha-card {\n  clip-path: circle(40%);\n}' } },
    });
    const emittedB = await editAdvanced(b.panel, 'ha-card { clip-path: ellipse(30% 40%); }');
    const styleB = emittedB?.[styleKey]?.style;
    res.orderPreserved = !!styleB && JSON.stringify(Object.keys(styleB)) === JSON.stringify(['ha-gauge$', '.']);
    res.rootUpdatedInPlace = styleB?.['ha-gauge$'] === pierced && String(styleB?.['.'] ?? '').includes('ellipse');
    b.host.remove();

    // ---- 4. mixed-form still freezes -------------------------------------
    const otherKey = styleKey === 'uix' ? 'card_mod' : 'uix';
    const mixed = await mk({
      type: 'gauge', entity: 'sensor.outside_temperature',
      [styleKey]: { style: 'ha-card {\n  color: red;\n}' },
      [otherKey]: { style: { 'ha-gauge$': pierced } },
    });
    const bannerM = [...mixed.panel.shadowRoot.querySelectorAll('.container-banner')].map((el) => el.textContent).join(' ');
    res.mixedBanner = /Mixed-form/i.test(bannerM);
    res.mixedModulesHidden = !mixed.panel.shadowRoot.querySelector('cms-border-module');
    mixed.host.remove();

    // ---- 5. entities dict ROW is editable, pierced kept ------------------
    const rowPierce = 'x {\n  y: z;\n}';
    const c = await mk({
      type: 'entities',
      entities: [
        { entity: 'sensor.outside_temperature', [styleKey]: { style: { '.': ':host {\n  color: red;\n}', 'div$': rowPierce } } },
        'sensor.outside_humidity',
      ],
    });
    let emittedC = null;
    c.panel.addEventListener('config-changed', (e) => { emittedC = e.detail.config; });
    res.rowParsedFromDot = c.panel._entityRowStyles['0']?.textColor === 'red';
    c.panel._entityRowStyles = {
      ...c.panel._entityRowStyles,
      '0': { ...(c.panel._entityRowStyles['0'] ?? {}), textColor: 'blue' },
    };
    c.panel._emitConfigChanged();
    await sleep(400);
    const rowStyle = emittedC?.entities?.[0]?.[styleKey]?.style;
    res.rowDictRebuilt = !!rowStyle && typeof rowStyle !== 'string'
      && rowStyle['div$'] === rowPierce
      && String(rowStyle['.'] ?? '').includes('blue')
      && JSON.stringify(Object.keys(rowStyle)) === JSON.stringify(['.', 'div$']);
    c.host.remove();

    // ---- 6. stack child dict: editable + pierced preserved ---------------
    const childPierce = 'ha-state-icon {\n  color: red;\n}';
    const d = await mk({
      type: 'vertical-stack',
      cards: [
        { type: 'tile', entity: 'light.ceiling_lights', [styleKey]: { style: { 'ha-tile-icon$': childPierce } } },
      ],
    });
    const section = d.panel.shadowRoot.querySelector('cms-child-card-section');
    if (section) { section._open = true; await sleep(400); }
    res.childModulesVisible = !!section?.shadowRoot?.querySelector('cms-icon-color-module');
    let childEmitted = null;
    section?.addEventListener('child-config-changed', (e) => { childEmitted = e.detail.config; });
    if (section?._studioState) {
      section._studioState = {
        ...section._studioState,
        advanced: { ...section._studioState.advanced, rawCss: 'ha-card { opacity: 0.9; }' },
      };
      section._emitChildConfig();
      await sleep(400);
    }
    const childStyle = childEmitted?.[styleKey]?.style;
    res.childPiercedKept = !!childStyle && childStyle['ha-tile-icon$'] === childPierce && String(childStyle['.'] ?? '').includes('opacity');
    d.host.remove();

    return res;
  }, { styleKey: STYLE_KEY === 'uix' ? 'uix' : 'card_mod' });

  record('dict card: no freeze banner, full modules rendered', out.noFreezeBanner === true && out.modulesVisible === true, JSON.stringify({ noFreezeBanner: out.noFreezeBanner, modulesVisible: out.modulesVisible }));
  record('Advanced shows the pierced entries read-only', out.piercedShown === true, JSON.stringify({ piercedShown: out.piercedShown }));
  record('edit keeps dict form, pierced bytes identical, "." added first', out.editKeptDict === true && out.editKeptPierced === true && out.editAddedRootFirst === true, JSON.stringify({ dict: out.editKeptDict, pierced: out.editKeptPierced, rootFirst: out.editAddedRootFirst }));
  record('"." mid-dict: key order preserved, "." updated in place', out.orderPreserved === true && out.rootUpdatedInPlace === true, JSON.stringify({ order: out.orderPreserved, updated: out.rootUpdatedInPlace }));
  record('mixed-form (string + dict) still freezes with banner', out.mixedBanner === true && out.mixedModulesHidden === true, JSON.stringify({ banner: out.mixedBanner, hidden: out.mixedModulesHidden }));
  record('dict ROW: "." parsed into row state and rebuilt with pierced kept', out.rowParsedFromDot === true && out.rowDictRebuilt === true, JSON.stringify({ parsed: out.rowParsedFromDot, rebuilt: out.rowDictRebuilt }));
  record('stack child dict: modules visible, pierced kept through edit', out.childModulesVisible === true && out.childPiercedKept === true, JSON.stringify({ visible: out.childModulesVisible, kept: out.childPiercedKept }));

  await page.screenshot({ path: resolve(SHOTS, 'dict-preserve-01.png') });
  await browser.close();
  finish(writeFileSync, resolve, HERE, 'dict-preserve-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

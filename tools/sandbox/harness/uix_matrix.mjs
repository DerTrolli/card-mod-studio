// UIX (github.com/Lint-Free-Technology/uix) end-to-end verification.
//
// Runs against the SEPARATE UIX sandbox instance (tools/sandbox/run-uix.sh),
// not the card-mod one — see ../config-uix/configuration.yaml for why.
//
// Confirms, against a REAL running UIX integration (not just source-reading):
//   1. isUixInstalled()'s customElements.get('uix-node') probe is accurate,
//      and isCardModInstalled() correctly stays false in a UIX-only install
//   2. UIX actually applies a `uix:` style block
//   3. UIX actually applies a `card_mod:` style block (its documented fallback)
//   4. UIX prioritizes `uix:` over `card_mod:` when a card has both — the
//      precedence yaml-parser.ts/yaml-generator.ts assume
//   5. The real cms-panel editor: no "not detected" warning banner, and
//      editing a setting emits `uix:` (not `card_mod:`) — i.e. pickOutputKey()
//      picks correctly against a live UIX install, not just in unit tests
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const HA = process.env.HA_URL || 'http://127.0.0.1:8124';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TOKENS_IN = process.env.TOKENS_IN || resolve(HERE, 'tokens-uix.json');
const tokens = JSON.parse(readFileSync(TOKENS_IN, 'utf8'));

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail: detail ?? null });
  console.log(pass ? '✅' : '❌', name, detail ?? '');
};

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const ha = document.querySelector('home-assistant');
    return !!(ha && ha.hass && ha.hass.states && Object.keys(ha.hass.states).length > 10);
  }, { timeout: 60000 });

  // ---------------------------------------------------------------------
  // 1. Detection probes, against the real install.
  // ---------------------------------------------------------------------
  await page.waitForFunction(() => !!customElements.get('uix-node'), { timeout: 30000 }).catch(() => {});
  const detect = await page.evaluate(() => ({
    uix: !!customElements.get('uix-node'),
    cardMod: !!customElements.get('card-mod'),
  }));
  record('isUixInstalled() probe (uix-node registered)', detect.uix === true, JSON.stringify(detect));
  record('isCardModInstalled() probe stays false (sandbox is UIX-only)', detect.cardMod === false, JSON.stringify(detect));

  // ---------------------------------------------------------------------
  // 2-4. Real rendering checks via a bare hui-card (same technique as
  // matrix.mjs, but reading background-color since that's easy to assert
  // distinct RGB values for).
  // ---------------------------------------------------------------------
  await page.evaluate(() => {
    window.__all = (root, tag) => {
      const o = []; const s = [root]; tag = tag.toLowerCase();
      while (s.length) {
        const n = s.pop();
        if (n.tagName && n.tagName.toLowerCase() === tag) o.push(n);
        if (n.shadowRoot) s.push(...n.shadowRoot.children);
        if (n.children) s.push(...n.children);
      }
      return o;
    };
    const h = document.createElement('div'); h.id = 'bench';
    h.style.cssText = 'position:fixed;left:0;top:0;width:380px;z-index:2147483647;background:#0b0b0b;padding:12px';
    document.body.appendChild(h);
    window.__render = async (cfg) => {
      const hass = document.querySelector('home-assistant').hass;
      const b = document.getElementById('bench'); b.innerHTML = '';
      const c = document.createElement('hui-card'); c.hass = hass; c.config = cfg; b.appendChild(c);
      if (c.updateComplete) await c.updateComplete;
      await new Promise((r) => setTimeout(r, 1200));
      return c;
    };
    window.__readBg = () => {
      const el = window.__all(document.querySelector('#bench hui-card'), 'ha-card')[0];
      return el ? getComputedStyle(el).backgroundColor : null;
    };
  });

  const base = { type: 'tile', entity: 'light.ceiling_lights' };
  const RED = 'ha-card {\n  background: rgb(238, 17, 17);\n}';
  const BLUE = 'ha-card {\n  background: rgb(17, 68, 238);\n}';

  await page.evaluate((cfg) => window.__render(cfg), base);
  const baseline = await page.evaluate(() => window.__readBg());

  await page.evaluate((cfg) => window.__render(cfg), { ...base, uix: { style: RED } });
  const uixOnly = await page.evaluate(() => window.__readBg());
  record('UIX applies a uix: style block', uixOnly !== baseline, `baseline=${baseline} after=${uixOnly}`);

  await page.evaluate((cfg) => window.__render(cfg), { ...base, card_mod: { style: BLUE } });
  const cardModOnly = await page.evaluate(() => window.__readBg());
  record('UIX applies a card_mod: style block (documented fallback)', cardModOnly !== baseline, `baseline=${baseline} after=${cardModOnly}`);

  await page.evaluate((cfg) => window.__render(cfg), { ...base, uix: { style: RED }, card_mod: { style: BLUE } });
  const both = await page.evaluate(() => window.__readBg());
  record(
    'UIX prioritizes uix: over card_mod: when a card has both',
    both === uixOnly && both !== cardModOnly,
    `uix-alone=${uixOnly} card_mod-alone=${cardModOnly} both=${both}`,
  );

  // ---------------------------------------------------------------------
  // 5. The real cms-panel editor against this UIX-only environment.
  // ---------------------------------------------------------------------
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });
  const panelResult = await page.evaluate(async (config) => {
    const hass = document.querySelector('home-assistant').hass;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:900px;z-index:2147483647;';
    document.body.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = hass; panel.config = config; host.appendChild(panel);
    await panel.updateComplete?.catch(() => {});
    await new Promise((r) => setTimeout(r, 500));

    const banner = panel.shadowRoot?.querySelector('.warning-banner')?.textContent?.trim() || null;

    let emitted = null;
    panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });

    // Drive the Background module exactly the way the panel's own template
    // wires it up (`@state-changed=${this._onBackgroundChanged}` on the
    // <cms-background-module> element) — dispatch the same event a real
    // user interaction would produce, rather than reaching into private
    // panel internals.
    const bgModule = panel.shadowRoot?.querySelector('cms-background-module');
    bgModule?.dispatchEvent(new CustomEvent('state-changed', {
      detail: { enabled: true, type: 'solid', color1: '#ee1111', color2: '#ee1111', angle: 0, applyWhen: 'always' },
      bubbles: true,
      composed: true,
    }));
    await new Promise((r) => setTimeout(r, 300));

    return { banner, hasBackgroundModule: !!bgModule, emitted };
  }, { type: 'tile', entity: 'light.ceiling_lights' });

  record('warning banner absent (UIX detected)', panelResult.banner === null, JSON.stringify(panelResult.banner));
  record('background module rendered', panelResult.hasBackgroundModule === true);
  record(
    'editor emits uix: (not card_mod:) in this UIX-only environment',
    !!panelResult.emitted?.uix?.style && !panelResult.emitted?.card_mod,
    JSON.stringify(panelResult.emitted),
  );

  await browser.close();

  writeFileSync(resolve(HERE, 'uix-matrix.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((c) => !c.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.error('FAILED:', failed.map((c) => c.name));
    process.exit(1);
  }
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

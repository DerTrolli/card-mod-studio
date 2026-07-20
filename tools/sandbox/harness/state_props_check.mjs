// v0.9.0-beta.3: state-driven numeric properties. Verifies against a REAL
// card-mod/UIX render that:
//   1./2. A conditional border ({{ '3px solid …' if <value cond> else 'none' }})
//         renders 3px when the condition is TRUE and 0px when FALSE.
//   3./4. Conditional filter effects (blur+opacity ternary) apply when TRUE
//         and resolve to 'none' when FALSE.
//   5.    Icon size: the emitted variables actually resize the MAIN state
//         icon to 40px on every supported card type (tile via the
//         ha-tile-icon companion block; entity/sensor/picture-glance via
//         the ha-card variable pair).
//   6.    A conditional icon size whose condition is FALSE renders the
//         24px fallback.
//   7.    The panel round-trips all three new states (border.widthWhen,
//         filter.effectsWhen, iconColor.sizePx) out of generated CSS.
//   8.    The icon-size control is NOT offered on a light card (harmful
//         there — the variable only reaches its more-info icon).
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

// A light's state string is 'on'/'off' → float(0) is always 0, so `>= 0` is
// always TRUE and `> 999999` always FALSE regardless of the demo's state.
const COND_TRUE = `states('light.ceiling_lights') | float(0) >= 0`;
const COND_FALSE = `states('light.ceiling_lights') | float(0) > 999999`;

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript((t) => { localStorage.setItem('hassTokens', JSON.stringify(t)); }, tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });
  await page.waitForFunction(() => !!(customElements.get('card-mod') || customElements.get('uix-node')), { timeout: 30000 });

  // Mounts a card with the style applied and polls a computed value until
  // `probe` reports a hit (or the poll runs out). Mounted INSIDE the
  // <home-assistant> tree (context-consuming cards render "Entity not
  // found" outside it).
  const measure = (config, probeSrc, expected) =>
    page.evaluate(async ({ config, probeSrc, expected }) => {
      await customElements.whenDefined('hui-card');
      const probe = new Function('card', 'expected', `return (${probeSrc})(card, expected);`);
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:460px;z-index:2147483647;background:#fff;';
      document.querySelector('home-assistant').shadowRoot.appendChild(host);
      const card = document.createElement('hui-card');
      card.hass = document.querySelector('home-assistant').hass;
      card.config = config;
      host.appendChild(card);
      let out = null;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 400));
        out = probe(card, expected);
        if (out?.hit) break;
      }
      host.remove();
      return out;
    }, { config, probeSrc, expected });

  const findDeep = `(card, sel) => {
    const stack = [card];
    while (stack.length) {
      const n = stack.pop();
      if (n.matches && n.matches(sel)) return n;
      if (n.shadowRoot) stack.push(...n.shadowRoot.children);
      if (n.children) stack.push(...n.children);
    }
    return null;
  }`;

  // ---- 1./2. conditional border ------------------------------------------
  const borderStyle = (cond) =>
    `ha-card {\n  border: {{ '3px solid #ff0000' if ${cond} else 'none' }};\n}`;
  const borderProbe = `(card, expected) => {
    const find = ${findDeep};
    const haCard = find(card, 'ha-card');
    if (!haCard) return null;
    const w = getComputedStyle(haCard).borderTopWidth;
    return { value: w, hit: w === expected };
  }`;
  const bTrue = await measure(
    { type: 'tile', entity: 'light.ceiling_lights', [STYLE_KEY]: { style: borderStyle(COND_TRUE) } },
    borderProbe, '3px',
  );
  record('conditional border renders 3px while the value condition is TRUE', !!bTrue?.hit, JSON.stringify(bTrue));
  const bFalse = await measure(
    { type: 'tile', entity: 'light.ceiling_lights', [STYLE_KEY]: { style: borderStyle(COND_FALSE) } },
    borderProbe, '0px',
  );
  record('conditional border renders no border while the condition is FALSE', !!bFalse?.hit, JSON.stringify(bFalse));

  // ---- 3./4. conditional filter effects ----------------------------------
  const filterStyle = (cond) =>
    `ha-card {\n  filter: {{ 'blur(4px) opacity(50%)' if ${cond} else 'none' }};\n  transition: filter 300ms ease;\n}`;
  const filterProbe = `(card, expected) => {
    const find = ${findDeep};
    const haCard = find(card, 'ha-card');
    if (!haCard) return null;
    const f = getComputedStyle(haCard).filter;
    const hit = expected === 'none' ? f === 'none' : f.includes('blur(4px)') && f.includes('opacity(0.5)');
    return { value: f, hit };
  }`;
  const fTrue = await measure(
    { type: 'tile', entity: 'light.ceiling_lights', [STYLE_KEY]: { style: filterStyle(COND_TRUE) } },
    filterProbe, 'applied',
  );
  record('conditional blur+opacity applies while the condition is TRUE', !!fTrue?.hit, JSON.stringify(fTrue));
  const fFalse = await measure(
    { type: 'tile', entity: 'light.ceiling_lights', [STYLE_KEY]: { style: filterStyle(COND_FALSE) } },
    filterProbe, 'none',
  );
  record('conditional filter resolves to none while the condition is FALSE', !!fFalse?.hit, JSON.stringify(fFalse));

  // ---- 5. icon size on every supported card type -------------------------
  // The main state icon must measure 40px. The probe searches within the
  // right container so a more-info button icon can't false-positive.
  const iconProbe = `(card, expected) => {
    const find = ${findDeep};
    const scopeEl = expected.scope ? find(card, expected.scope) : card;
    if (!scopeEl) return null;
    const icon = find(scopeEl, 'ha-svg-icon');
    if (!icon) return null;
    const w = Math.round(icon.getBoundingClientRect().width);
    return { value: w, hit: w === expected.px };
  }`;
  const ICON_CASES = [
    { type: 'tile', cfg: { type: 'tile', entity: 'light.ceiling_lights' }, style: `ha-tile-icon {\n  --mdc-icon-size: 40px;\n}`, scope: 'ha-tile-icon' },
    { type: 'entity', cfg: { type: 'entity', entity: 'sensor.outside_temperature' }, style: `ha-card {\n  --mdc-icon-size: 40px;\n  --ha-icon-size: 40px;\n}`, scope: null },
    { type: 'sensor', cfg: { type: 'sensor', entity: 'sensor.outside_temperature' }, style: `ha-card {\n  --mdc-icon-size: 40px;\n  --ha-icon-size: 40px;\n}`, scope: null },
    { type: 'picture-glance', cfg: { type: 'picture-glance', entities: ['light.ceiling_lights'], image: 'https://demo.home-assistant.io/stub_config/bedroom.png' }, style: `ha-card {\n  --mdc-icon-size: 40px;\n  --ha-icon-size: 40px;\n}`, scope: null },
  ];
  for (const c of ICON_CASES) {
    const out = await measure(
      { ...c.cfg, [STYLE_KEY]: { style: c.style } },
      iconProbe, { px: 40, scope: c.scope },
    );
    record(`icon size 40px resizes the main icon on ${c.type}`, !!out?.hit, JSON.stringify(out));
  }

  // ---- 6. conditional icon size, FALSE branch ----------------------------
  const condSize = await measure(
    {
      type: 'entity', entity: 'sensor.outside_temperature',
      [STYLE_KEY]: { style: `ha-card {\n  --mdc-icon-size: {{ '40px' if ${COND_FALSE} else '24px' }};\n  --ha-icon-size: {{ '40px' if ${COND_FALSE} else '24px' }};\n}` },
    },
    iconProbe, { px: 24, scope: null },
  );
  record('conditional icon size renders the 24px fallback while FALSE', !!condSize?.hit, JSON.stringify(condSize));

  // ---- 7./8. panel round-trip + per-card size gating ---------------------
  const panelOut = await page.evaluate(async ({ styleKey }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const mk = async (config) => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;z-index:2147483647;background:#111;';
      document.querySelector('home-assistant').shadowRoot.appendChild(host);
      const panel = document.createElement('cms-panel');
      panel.hass = document.querySelector('home-assistant').hass;
      panel.config = config;
      host.appendChild(panel);
      await panel.updateComplete;
      await sleep(1500);
      return { panel, host };
    };

    // Exactly what generateCss emits for: filter {blur:4, opacity:50,
    // effectsWhen custom}, border {3px #ff0000, widthWhen on}, icon color
    // plain #2196F3 + sizePx 40 — on a tile card.
    const style = [
      `ha-card {`,
      `  filter: {{ 'blur(4px) opacity(50%)' if is_state('binary_sensor.preheat_active', 'on') else 'none' }};`,
      `  transition: filter 300ms ease;`,
      `  border: {{ '3px solid #ff0000' if is_state(config.entity, 'on') else 'none' }};`,
      `}`,
      ``,
      `ha-state-icon {`,
      `  color: #2196F3 !important;`,
      `}`,
      ``,
      `ha-tile-icon {`,
      `  --mdc-icon-size: 40px;`,
      `}`,
    ].join('\n');
    const a = await mk({ type: 'tile', entity: 'light.ceiling_lights', [styleKey]: { style } });
    const border = a.panel.shadowRoot.querySelector('cms-border-module');
    const filter = a.panel.shadowRoot.querySelector('cms-filter-module');
    const icon = a.panel.shadowRoot.querySelector('cms-icon-color-module');
    const advanced = a.panel.shadowRoot.querySelector('cms-advanced-module');
    const roundTrip = {
      borderWhen: border?.state?.widthWhen?.when ?? null,
      borderWidth: border?.state?.borderWidth ?? null,
      effectsWhen: filter?.state?.effectsWhen?.when ?? null,
      effectsEntity: filter?.state?.effectsWhen?.customEntity ?? null,
      opacity: filter?.state?.opacity ?? null,
      sizePx: icon?.state?.sizePx ?? null,
      sizeControlShown: !!icon?.shadowRoot?.textContent?.includes('Icon size'),
      advancedRaw: advanced?.state?.rawCss ?? null,
    };
    a.host.remove();

    // Light card: the icon module must NOT offer the size control.
    const b = await mk({ type: 'light', entity: 'light.ceiling_lights' });
    const lightIcon = b.panel.shadowRoot.querySelector('cms-icon-color-module');
    // open the module body so the (absent) control would render if offered
    if (lightIcon) { lightIcon._open = true; await sleep(300); }
    const lightSizeShown = !!lightIcon?.shadowRoot?.textContent?.includes('Icon size');
    b.host.remove();
    return { roundTrip, lightSizeShown };
  }, { styleKey: STYLE_KEY });

  const rt = panelOut.roundTrip;
  record(
    'panel round-trips border.widthWhen / filter.effectsWhen+opacity / iconColor.sizePx from generated CSS (nothing left in Advanced)',
    rt.borderWhen === 'on' && rt.borderWidth === 3 &&
    rt.effectsWhen === 'custom' && rt.effectsEntity === 'binary_sensor.preheat_active' &&
    rt.opacity === 50 && rt.sizePx === 40 && rt.advancedRaw === '',
    JSON.stringify(rt),
  );
  record('icon-size control is NOT offered on a light card', panelOut.lightSizeShown === false, JSON.stringify({ lightSizeShown: panelOut.lightSizeShown }));

  await page.screenshot({ path: resolve(SHOTS, 'state-props-01.png') });
  await browser.close();
  finish(writeFileSync, resolve, HERE, 'state-props-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

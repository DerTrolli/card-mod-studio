// v0.8.0-beta.2 additions: attribute-based thresholds (roadmap #16) and the
// Color Palette Manager. Verifies against a REAL card-mod/UIX render:
//   1. A state_attr()-based threshold expression actually recolors the icon
//      (the only new runtime dependency: the engine's Jinja pass rendering
//      state_attr the same way it renders states()).
//   2. The panel round-trips the attribute back into the Threshold module.
//   3. The Palette Manager's stored custom palette (localStorage fallback
//      path) feeds the panel: cms-palette-manager renders, and the default
//      OFF-color override lands in a fresh card's Icon Color module state.
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
  await page.addInitScript((t) => {
    localStorage.setItem('hassTokens', JSON.stringify(t));
    // Palette Manager storage (localStorage fallback path): one custom color
    // and an OFF-default override, present before the bundle loads.
    localStorage.setItem('cms-palette', JSON.stringify({
      colors: [{ id: 'c1', name: 'Brand teal', hex: '#00c8aa' }],
      defaults: { offColor: '#123456' },
    }));
  }, tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });
  // card-mod/UIX cold-start: styles won't apply until the engine element is defined.
  await page.waitForFunction(() => !!(customElements.get('card-mod') || customElements.get('uix-node')), { timeout: 30000 });

  // Pick a demo entity with a numeric attribute the threshold can read.
  const probeEntity = await page.evaluate(() => {
    const states = document.querySelector('home-assistant').hass.states;
    for (const [id, st] of Object.entries(states)) {
      for (const [attr, val] of Object.entries(st.attributes ?? {})) {
        if (typeof val === 'number' && isFinite(val)) return { id, attr, val };
      }
    }
    return null;
  });
  record('found a demo entity with a numeric attribute', !!probeEntity, JSON.stringify(probeEntity));
  if (!probeEntity) throw new Error('no numeric attribute in demo states');

  // --- 1. state_attr threshold renders: rule always true -> red icon ---
  const style =
    `ha-state-icon {\n  color: {{ '#ff0000' if state_attr('${probeEntity.id}', '${probeEntity.attr}') | float(0) >= ${probeEntity.val - 1} else '#00ff00' }} !important;\n}`;
  const rendered = await page.evaluate(async ({ entity, style, styleKey }) => {
    await customElements.whenDefined('hui-card');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:420px;height:200px;z-index:2147483647;background:#fff;';
    document.body.appendChild(host);
    const card = document.createElement('hui-card');
    card.hass = document.querySelector('home-assistant').hass;
    card.config = { type: 'entity', entity, [styleKey]: { style } };
    host.appendChild(card);
    let out = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const stack = [card]; let icon = null;
      while (stack.length) {
        const n = stack.pop();
        if (n.matches && n.matches('ha-state-icon')) { icon = n; break; }
        if (n.shadowRoot) stack.push(...n.shadowRoot.children);
        if (n.children) stack.push(...n.children);
      }
      if (icon) {
        const c = getComputedStyle(icon).color;
        out = { color: c, hit: c === 'rgb(255, 0, 0)' };
        if (out.hit) break;
      }
    }
    host.remove();
    return out;
  }, { entity: probeEntity.id, style, styleKey: STYLE_KEY });
  record('state_attr() threshold actually recolors the icon (engine renders the Jinja)', !!rendered?.hit, JSON.stringify(rendered));

  // --- 2. Panel round-trips the attribute into the Threshold module ---
  const roundTrip = await page.evaluate(async ({ entity, style, styleKey, attr }) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = { type: 'entity', entity, [styleKey]: { style } };
    host.appendChild(panel);
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));
    const t = panel._studioState?.threshold;
    // And regenerating must keep the state_attr source.
    let emitted = null;
    panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
    panel._emitConfigChanged();
    await new Promise((r) => setTimeout(r, 300));
    host.remove();
    const emittedStyle = emitted?.uix?.style ?? emitted?.card_mod?.style ?? '';
    return {
      enabled: t?.enabled, entityId: t?.entityId, attribute: t?.attribute,
      leftover: panel._studioState?.advanced?.rawCss ?? null,
      regenKeepsAttr: emittedStyle.includes(`state_attr('${entity}', '${attr}')`),
    };
  }, { entity: probeEntity.id, style, styleKey: STYLE_KEY, attr: probeEntity.attr });
  record(
    'panel reads the attribute back into the Threshold module and regenerates it unchanged',
    roundTrip.enabled === true && roundTrip.attribute === probeEntity.attr && roundTrip.leftover === '' && roundTrip.regenKeepsAttr,
    JSON.stringify(roundTrip),
  );

  // --- 3. Palette Manager: element renders + OFF-default override applies ---
  const palette = await page.evaluate(async () => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = { type: 'light', entity: 'light.ceiling_lights' };
    host.appendChild(panel);
    await panel.updateComplete;
    // initPaletteCache is async (HA user-data first, then localStorage) —
    // give it a beat, then re-init state so the override is visible.
    await new Promise((r) => setTimeout(r, 800));
    panel.config = { type: 'light', entity: 'light.ceiling_lights', card_mod: { style: '' } };
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));
    const manager = panel.shadowRoot?.querySelector('cms-palette-manager') ?? null;
    const iconColor = panel._studioState?.iconColor;
    host.remove();
    return {
      managerRendered: !!manager,
      colorOff: iconColor?.colorOff,
      hit: !!manager && iconColor?.colorOff === '#123456',
    };
  });
  record(
    'Palette Manager renders in the panel and its OFF-default override reaches a fresh card\'s Icon Color state',
    !!palette?.hit,
    JSON.stringify(palette),
  );

  await page.screenshot({ path: resolve(SHOTS, 'attr-palette-01.png') });
  await browser.close();
  finish(writeFileSync, resolve, HERE, 'attr-palette-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

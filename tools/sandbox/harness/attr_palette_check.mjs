// v0.8.0-beta.2 additions: attribute-based thresholds (roadmap #16) and the
// Color Palette Manager. Verifies against a REAL card-mod/UIX render:
//   1. A state_attr()-based threshold expression actually recolors the icon
//      (the only new runtime dependency: the engine's Jinja pass rendering
//      state_attr the same way it renders states()).
//   2. The panel round-trips the attribute back into the Threshold module.
//   3. The Palette Manager's stored custom palette feeds the panel:
//      cms-palette-manager renders, and the default OFF-color override lands
//      in a fresh card's Icon Color module state. The palette is read from
//      Home Assistant's per-user storage first (the local copy is only the
//      fallback when HA holds nothing), so the check seeds it there, and a
//      different value in localStorage proves which source wins.
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
    // Palette Manager local copy: a decoy, only used when HA holds no palette.
    localStorage.setItem('cms-palette', JSON.stringify({
      colors: [{ id: 'c1', name: 'Brand teal', hex: '#00c8aa' }],
      defaults: { offColor: '#654321' }, // decoy: HA user data must win over this
    }));
  }, tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });
  // card-mod/UIX cold-start: styles won't apply until the engine element is defined.
  await page.waitForFunction(() => !!(customElements.get('card-mod') || customElements.get('uix-node')), { timeout: 30000 });

  // Seed the palette in Home Assistant's per-user storage (the primary source)
  // before any panel exists: the panel loads it once, when it first sees hass.
  const origPalette = await page.evaluate(async () => {
    const conn = document.querySelector('home-assistant').hass.connection;
    const prev = await conn.sendMessagePromise({ type: 'frontend/get_user_data', key: 'cms_palette' });
    await conn.sendMessagePromise({
      type: 'frontend/set_user_data', key: 'cms_palette',
      value: { colors: [{ id: 'c1', name: 'Brand teal', hex: '#00c8aa' }], defaults: { offColor: '#123456' } },
    });
    return prev?.value ?? null;
  });

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
  const probeIcon = () => page.evaluate(async ({ entity, style, styleKey }) => {
    await customElements.whenDefined('hui-card');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:420px;height:200px;z-index:2147483647;background:#fff;';
    window.__cmsMount(host);
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
  // card-mod can leave the very first card of a page load unstyled (its element
  // is defined before the page's styling pass has run); a reload fixes it. If
  // the icon is still its own colour after the polling window, reload once and
  // read again, and say so in the log line.
  let rendered = await probeIcon();
  if (!rendered?.hit) {
    const first = rendered;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForHassReady(page);
    await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });
    await page.waitForFunction(() => !!(customElements.get('card-mod') || customElements.get('uix-node')), { timeout: 30000 });
    rendered = await probeIcon();
    if (rendered) rendered.reloadedAfter = first;
  }
  record('state_attr() threshold actually recolors the icon (engine renders the Jinja)', !!rendered?.hit, JSON.stringify(rendered));

  // --- 2. Panel round-trips the attribute into the Threshold module ---
  const roundTrip = await page.evaluate(async ({ entity, style, styleKey, attr }) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    window.__cmsMount(host);
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
    window.__cmsMount(host);
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
      hit: !!manager && iconColor?.colorOff === '#123456', // HA value, not the local '#654321'
    };
  });
  record(
    'Palette Manager renders in the panel and its OFF-default override reaches a fresh card\'s Icon Color state',
    !!palette?.hit,
    JSON.stringify(palette),
  );

  // Put the user's palette back the way it was before the check seeded it.
  await page.evaluate(async (prev) => {
    await document.querySelector('home-assistant').hass.connection.sendMessagePromise({
      type: 'frontend/set_user_data', key: 'cms_palette', value: prev,
    });
  }, origPalette);

  await page.screenshot({ path: resolve(SHOTS, 'attr-palette-01.png') });
  await browser.close();
  finish(writeFileSync, resolve, HERE, 'attr-palette-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

// v0.9.0-beta.1 additions: animation pack presets (shake/spin/glow/heartbeat)
// and the value-conditional animation trigger. Verifies against a REAL
// card-mod/UIX render:
//   1. A value-trigger animation whose condition is always TRUE actually
//      animates ha-card (computed animation-name is the cms-* keyframes —
//      the only new runtime dependency: the engine's Jinja pass rendering
//      states()/float comparisons inside an `animation:` value).
//   2. The same style with an always-FALSE condition resolves to 'none'.
//   3. The panel round-trips the value trigger back into the Animation
//      module's state (trigger/entity/operator/threshold).
//   4. A new preset (shake) round-trips through the panel with its
//      @keyframes cms-shake block present in the regenerated style text.
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

const ENTITY = 'light.ceiling_lights';

// Exactly what generateCss emits for {preset:'pulse', speedS:2, trigger:'value',
// valueEntity: ENTITY, valueOperator:'>=', valueThreshold:0}. A light's state
// is 'on'/'off' → float(0) is always 0, so `>= 0` is always true and
// `> 999999` (below) is always false — regardless of the demo light's state.
const KEYFRAMES = `@keyframes cms-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}`;
const styleFor = (operator, threshold) =>
  `${KEYFRAMES}\n\nha-card {\n  animation: {{ 'cms-pulse 2s ease-in-out infinite' if states('${ENTITY}') | float(0) ${operator} ${threshold} else 'none' }};\n}`;
const STYLE_TRUE = styleFor('>=', 0);
const STYLE_FALSE = styleFor('>', 999999);

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript((t) => {
    localStorage.setItem('hassTokens', JSON.stringify(t));
  }, tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });
  // card-mod/UIX cold-start: styles won't apply until the engine element is defined.
  await page.waitForFunction(() => !!(customElements.get('card-mod') || customElements.get('uix-node')), { timeout: 30000 });

  // Mounts a tile card with the given style and polls ha-card's computed
  // animation-name until it equals `expected` (or the poll runs out).
  const animationNameFor = async (style, expected) =>
    page.evaluate(async ({ entity, style, styleKey, expected }) => {
      await customElements.whenDefined('hui-card');
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:420px;height:200px;z-index:2147483647;background:#fff;';
      document.body.appendChild(host);
      const card = document.createElement('hui-card');
      card.hass = document.querySelector('home-assistant').hass;
      card.config = { type: 'tile', entity, [styleKey]: { style } };
      host.appendChild(card);
      let out = null;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 400));
        const stack = [card]; let haCard = null;
        while (stack.length) {
          const n = stack.pop();
          if (n.matches && n.matches('ha-card')) { haCard = n; break; }
          if (n.shadowRoot) stack.push(...n.shadowRoot.children);
          if (n.children) stack.push(...n.children);
        }
        if (haCard) {
          const name = getComputedStyle(haCard).animationName;
          out = { animationName: name, hit: name === expected };
          if (out.hit) break;
        }
      }
      host.remove();
      return out;
    }, { entity: ENTITY, style, styleKey: STYLE_KEY, expected });

  // --- 1. Always-true value condition -> the cms-pulse animation runs ---
  const trueCase = await animationNameFor(STYLE_TRUE, 'cms-pulse');
  record(
    'always-true value condition animates ha-card (computed animation-name is cms-pulse)',
    !!trueCase?.hit,
    JSON.stringify(trueCase),
  );

  // --- 2. Always-false value condition -> animation resolves to none ---
  const falseCase = await animationNameFor(STYLE_FALSE, 'none');
  record(
    "always-false value condition leaves ha-card unanimated (animation-name 'none')",
    !!falseCase?.hit,
    JSON.stringify(falseCase),
  );

  // --- 3. Panel round-trip: value trigger lands in the Animation module ---
  const roundTrip = await page.evaluate(async ({ entity, style, styleKey }) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = { type: 'tile', entity, [styleKey]: { style } };
    host.appendChild(panel);
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));
    const a = panel._studioState?.animation;
    host.remove();
    return {
      enabled: a?.enabled, trigger: a?.trigger, preset: a?.preset, speedS: a?.speedS,
      valueEntity: a?.valueEntity, valueOperator: a?.valueOperator, valueThreshold: a?.valueThreshold,
      leftover: panel._studioState?.advanced?.rawCss ?? null,
    };
  }, { entity: ENTITY, style: STYLE_TRUE, styleKey: STYLE_KEY });
  record(
    'panel reads the value trigger back into the Animation module (entity/operator/threshold intact, no leftover CSS)',
    roundTrip.enabled === true && roundTrip.trigger === 'value' && roundTrip.preset === 'pulse' &&
      roundTrip.valueEntity === ENTITY && roundTrip.valueOperator === '>=' && roundTrip.valueThreshold === 0 &&
      roundTrip.leftover === '',
    JSON.stringify(roundTrip),
  );

  // --- 4. New preset: shake round-trips and its keyframes are emitted ---
  const SHAKE_STYLE = `@keyframes cms-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

ha-card {
  animation: cms-shake 1s ease-in-out infinite;
}`;
  const shake = await page.evaluate(async ({ entity, style, styleKey }) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = { type: 'tile', entity, [styleKey]: { style } };
    host.appendChild(panel);
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));
    const a = panel._studioState?.animation;
    let emitted = null;
    panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
    panel._emitConfigChanged();
    await new Promise((r) => setTimeout(r, 300));
    host.remove();
    const emittedStyle = emitted?.uix?.style ?? emitted?.card_mod?.style ?? '';
    return {
      preset: a?.preset, trigger: a?.trigger,
      keyframesEmitted: emittedStyle.includes('@keyframes cms-shake'),
      shakeTransform: emittedStyle.includes('translateX(-4px)'),
    };
  }, { entity: ENTITY, style: SHAKE_STYLE, styleKey: STYLE_KEY });
  record(
    'shake preset round-trips through the panel and re-emits its @keyframes cms-shake block',
    shake.preset === 'shake' && shake.trigger === 'always' && shake.keyframesEmitted && shake.shakeTransform,
    JSON.stringify(shake),
  );

  await page.screenshot({ path: resolve(SHOTS, 'animation-pack-01.png') });
  await browser.close();
  finish(writeFileSync, resolve, HERE, 'animation-pack-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

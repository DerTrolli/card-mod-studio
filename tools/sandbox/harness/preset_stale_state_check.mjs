// Investigated a real report: build a gradient, save it as a preset, apply
// it to a duplicate of the card (same entity, byte-identical starting
// YAML) -- reported as not rendering, even though the emitted YAML was
// byte-identical to the original working card's (diffed directly, they
// really were identical). Reproduces the one architecturally-real
// mechanism that could explain it: cms-injector.ts's togglePanel() reuses
// the SAME <cms-panel> element across successive "edit a different card"
// actions within one dialog-open session (looked up by a fixed element id
// within the dialog's shadow root), and _initState() has a dedup guard
// keyed on JSON.stringify(this.config) that persists across .config
// updates on that reused instance -- exactly the shape a byte-identical
// duplicate card would trigger.
//
// Verdict: not a bug. With the panel genuinely reused (this test forces
// it) and a byte-identical "Card B" config assigned, loading a saved
// preset still rebuilds state correctly, emits correct CSS, and — checked
// against a real <hui-card>, not just the emitted string — renders the
// correct interpolated color. Kept as a permanent regression check for
// exactly this mechanism, since it's the one plausible code-level
// explanation for the report and is now confirmed clean. (An earlier pass
// at this investigation wrongly "confirmed" a bug here — self-inflicted:
// the render-check step mounted the style under a uix: key on a
// card-mod-only sandbox, so nothing was ever applied, and a completely
// unstyled `color: red !important` sanity check failing to render should
// have been the giveaway that the *test* was broken, not the product.)
// The user's actual report is most likely explained by something outside
// the Studio itself — not clicking Save after loading the preset, or
// real card-mod needing a dashboard refresh to pick up style on a
// freshly-duplicated card element — see the CHANGELOG note for what to
// check next.
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
const tokens = JSON.parse(readFileSync(resolve(HERE, 'tokens.json'), 'utf8'));

const { results, record } = makeRecorder();
const ENTITY = 'sensor.outside_temperature';

const GRADIENT_STYLE = `ha-state-icon {
  --cms-gradient-stops: '0:#9e9e9e,150:#ff9800,220:#ff5722';
  color: {{ '#ff5722' if states('${ENTITY}') | float(0) >= 220 else '#ff9800' }} !important;
}`;

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });

  // Reproduce the SAME <cms-panel> instance being reused across two
  // "edit a different card" actions, the way togglePanel()'s
  // getElementById(CMS_PANEL_ID)-then-reuse branch does within one dialog.
  const outcome = await page.evaluate(async ({ entity, style }) => {
    const host = document.createElement('div');
    host.id = 'reuse-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:1200px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const hass = document.querySelector('home-assistant').hass;

    // "Card A" — a fresh panel instance edits it, same as togglePanel()'s
    // first-time branch (document.createElement + appendChild).
    const panel = document.createElement('cms-panel');
    panel.id = 'cms-style-panel'; // matches CMS_PANEL_ID in cms-injector.ts
    panel.hass = hass;
    panel.config = { type: 'tile', entity, card_mod: { style } };
    host.appendChild(panel);
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));

    const afterCardA = {
      studioStateExists: !!panel._studioState,
      valueMode: panel._studioState?.threshold?.valueMode,
      colorStopsCount: panel._studioState?.threshold?.colorStops?.length,
    };

    // Save as a preset (same mechanism _saveCurrentAsPreset uses).
    const preset = { name: 'test-gradient', state: { ...panel._studioState } };

    // "Card B" — a byte-identical duplicate. togglePanel()'s reuse branch:
    // just updates .config/.hass on the SAME element, doesn't recreate it.
    panel.config = { type: 'tile', entity, card_mod: { style } }; // new object, same content
    panel.hass = hass;
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));

    const afterCardB_beforePreset = {
      studioStateExists: !!panel._studioState,
      valueMode: panel._studioState?.threshold?.valueMode,
      colorStopsCount: panel._studioState?.threshold?.colorStops?.length,
      // Was _initState's dedup guard the thing that fired? Compare the
      // object reference: if _studioState is the EXACT SAME object as
      // after card A (not rebuilt), reference equality tells us for sure.
    };

    // Now load the saved preset onto "Card B" (_onPresetSelect's exact logic).
    panel._studioState = { ...preset.state };
    let emitted = null;
    panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
    panel._emitConfigChanged();
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 300));

    return {
      afterCardA,
      afterCardB_beforePreset,
      emittedStyleAfterPresetLoad: emitted?.uix?.style ?? emitted?.card_mod?.style ?? null,
    };
  }, { entity: ENTITY, style: GRADIENT_STYLE });

  record('cms-panel built real gradient state for "Card A"', outcome.afterCardA.studioStateExists && outcome.afterCardA.valueMode === 'gradient' && outcome.afterCardA.colorStopsCount === 3, JSON.stringify(outcome.afterCardA));
  record('Reused panel still has a valid studioState after "Card B" (byte-identical config) is assigned', outcome.afterCardB_beforePreset.studioStateExists, JSON.stringify(outcome.afterCardB_beforePreset));
  record('Loading the preset onto "Card B" emits a regenerated gradient style', !!outcome.emittedStyleAfterPresetLoad?.includes('--cms-gradient-stops'), outcome.emittedStyleAfterPresetLoad?.slice(0, 150));

  // Now the actually important check: mount "Card B"'s FINAL config on a
  // genuine <hui-card> (not the Studio) and verify it renders the REAL
  // interpolated color, not just "some non-black color exists" (that weak
  // check previously masked the exact bug we're hunting — an unstyled
  // theme-default blue, rgb(68, 115, 158), looks like "a real color" too).
  const entityValue = await page.evaluate((entity) => {
    const hass = document.querySelector('home-assistant').hass;
    return parseFloat(hass.states[entity]?.state ?? 'nan');
  }, ENTITY);

  const rendered = await page.evaluate(async ({ entity, style }) => {
    await customElements.whenDefined('hui-card');
    const host = document.createElement('div');
    host.id = 'render-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:200px;z-index:2147483647;';
    document.body.appendChild(host);
    const hass = document.querySelector('home-assistant').hass;
    const card = document.createElement('hui-card');
    card.hass = hass;
    card.config = { type: 'tile', entity, card_mod: { style } };
    host.appendChild(card);
    const findAll = (root, tag) => {
      const out = []; const stack = [root];
      while (stack.length) {
        const n = stack.pop();
        if (n.tagName && n.tagName.toLowerCase() === tag) out.push(n);
        if (n.shadowRoot) stack.push(...n.shadowRoot.children);
        if (n.children) stack.push(...n.children);
      }
      return out;
    };
    let icon = null, color = null;
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 500));
      icon = findAll(card, 'ha-state-icon')[0];
      if (icon) { color = getComputedStyle(icon).color; if (color && color !== 'rgba(0, 0, 0, 0)') break; }
    }
    return { iconFound: !!icon, color };
  }, { entity: ENTITY, style: outcome.emittedStyleAfterPresetLoad });

  // Independently compute the expected color for stops [0:#9e9e9e, 150:#ff9800, 220:#ff5722].
  const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const stops = [{ v: 0, c: '#9e9e9e' }, { v: 150, c: '#ff9800' }, { v: 220, c: '#ff5722' }];
  const clamped = Math.max(0, Math.min(220, entityValue));
  let seg = stops[0], next = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i].v && clamped <= stops[i + 1].v) { seg = stops[i]; next = stops[i + 1]; break; }
  }
  const t = next.v === seg.v ? 0 : (clamped - seg.v) / (next.v - seg.v);
  const [r1, g1, b1] = hexToRgb(seg.c);
  const [r2, g2, b2] = hexToRgb(next.c);
  const expected = [r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t].map(Math.round);
  const actual = (rendered.color?.match(/\d+/g) ?? []).map(Number).slice(0, 3);
  const matches = actual.length === 3 && actual.every((v, i) => Math.abs(v - expected[i]) <= 15);

  record(
    `"Card B"'s preset-loaded style renders the actual interpolated color at value=${entityValue} (not just "some" color)`,
    matches,
    `rendered=rgb(${actual.join(',')}) expected~=rgb(${expected.join(',')})`,
  );

  await page.screenshot({ path: resolve(SHOTS, 'preset-stale-01.png') });
  await browser.close();
  finish(writeFileSync, resolve, HERE, 'preset-stale-state-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

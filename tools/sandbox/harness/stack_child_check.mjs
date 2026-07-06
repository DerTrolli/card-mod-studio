// Stack child styling (v0.8.0-beta.1): a vertical-stack's children each get
// their own full styling section in the panel, writing card_mod:/uix: into
// cards[i] — verified end-to-end against a real HA instance:
//   1. the panel renders one cms-child-card-section per child
//   2. styling child 0 (tile, accent red) emits a stack config with
//      cards[0].card_mod.style and leaves cards[1] untouched
//   3. the emitted stack config actually renders — the child tile's ha-card
//      carries the red --tile-color through a real <hui-card> of the STACK
//   4. reopening a fresh panel on the emitted config restores the child
//      section's state (accent enabled, right color, no Advanced leftovers)
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

const STACK_CONFIG = {
  type: 'vertical-stack',
  cards: [
    { type: 'tile', entity: 'light.ceiling_lights' },
    { type: 'gauge', entity: 'sensor.outside_temperature' },
  ],
};

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });

  // 1+2: panel renders child sections; styling child 0 emits an updated stack.
  const emitted = await page.evaluate(async ({ config }) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = config;
    host.appendChild(panel);
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));

    const sections = [...panel.shadowRoot.querySelectorAll('cms-child-card-section')];
    const sectionCount = sections.length;
    let emittedConfig = null;
    if (sectionCount === 2) {
      const section = sections[0];
      section._open = true;
      await section.updateComplete;
      panel.addEventListener('config-changed', (e) => { emittedConfig = e.detail.config; });
      // Drive the section the way its accent module would.
      section._emitChanged({
        accentColor: { ...section._studioState.accentColor, enabled: true, mode: 'plain', color: '#ff0000' },
      });
      await new Promise((r) => setTimeout(r, 300));
    }
    host.remove();
    return { sectionCount, emittedConfig };
  }, { config: STACK_CONFIG });

  record(
    'panel renders one child section per stack child',
    emitted.sectionCount === 2,
    `sections=${emitted.sectionCount}`,
  );

  const child0Style = emitted.emittedConfig?.cards?.[0]?.[STYLE_KEY]?.style
    ?? emitted.emittedConfig?.cards?.[0]?.card_mod?.style ?? null;
  record(
    'styling child 0 writes card_mod/uix into cards[0] with the tile !important companion',
    !!child0Style && child0Style.includes('--tile-color: #ff0000 !important'),
    child0Style?.slice(0, 140),
  );
  record(
    'sibling child (cards[1]) is untouched',
    !!emitted.emittedConfig &&
      !emitted.emittedConfig.cards[1].card_mod && !emitted.emittedConfig.cards[1].uix,
    JSON.stringify(emitted.emittedConfig?.cards?.[1] ?? null),
  );

  // 3: the emitted STACK config renders the styled child for real.
  const rendered = await page.evaluate(async ({ config }) => {
    await customElements.whenDefined('hui-card');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:420px;height:600px;z-index:2147483647;background:#fff;';
    document.body.appendChild(host);
    const card = document.createElement('hui-card');
    card.hass = document.querySelector('home-assistant').hass;
    card.config = config;
    host.appendChild(card);
    const findAll = (root, sel) => {
      const out = []; const stack = [root];
      while (stack.length) {
        const n = stack.pop();
        if (n.matches && n.matches(sel)) out.push(n);
        if (n.shadowRoot) stack.push(...n.shadowRoot.children);
        if (n.children) stack.push(...n.children);
      }
      return out;
    };
    let tileColor = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const tile = findAll(card, 'hui-tile-card')[0];
      const haCard = tile && findAll(tile, 'ha-card')[0];
      if (haCard) {
        tileColor = getComputedStyle(haCard).getPropertyValue('--tile-color').trim();
        if (tileColor === '#ff0000') break;
      }
    }
    host.remove();
    return tileColor;
  }, { config: emitted.emittedConfig });

  record(
    'the emitted stack renders: child tile\'s ha-card resolves --tile-color to the picked color',
    rendered === '#ff0000',
    `tileColor=${rendered}`,
  );

  // 4: reopening a fresh panel on the emitted config restores child state.
  const reopened = await page.evaluate(async ({ config }) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = config;
    host.appendChild(panel);
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 400));
    const section = panel.shadowRoot.querySelectorAll('cms-child-card-section')[0];
    const s = section?._studioState;
    const out = {
      accentEnabled: s?.accentColor?.enabled,
      accentColor: s?.accentColor?.color,
      advancedLeftover: s?.advanced?.rawCss ?? null,
      styledDot: !!section?.shadowRoot?.querySelector('.styled-dot'),
    };
    host.remove();
    return out;
  }, { config: emitted.emittedConfig });

  record(
    'reopening restores the child section state (accent on, right color, no Advanced leftovers, styled indicator)',
    reopened.accentEnabled === true && reopened.accentColor === '#ff0000' &&
      reopened.advancedLeftover === '' && reopened.styledDot === true,
    JSON.stringify(reopened),
  );

  await page.screenshot({ path: resolve(SHOTS, 'stack-child-01.png') });
  await browser.close();
  finish(writeFileSync, resolve, HERE, 'stack-child-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

// Verifies the compact color-picker palette added to Threshold Colors (card
// level and entities-row level): var(--x-color) rules round-trip instead of
// falling into Advanced CSS, the popover opens/positions sanely, picking a
// preset updates the rule, and the live preview actually reflects it.
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

const mountPanel = (config) => (page) => page.evaluate((cfg) => {
  let host = document.getElementById('palette-check-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'palette-check-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:1600px;height:1000px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
  }
  host.innerHTML = '';
  const hass = document.querySelector('home-assistant').hass;
  const panel = document.createElement('cms-panel');
  panel.hass = hass; panel.config = cfg; host.appendChild(panel);
}, config);

const allInPanel = async (page, tag) => page.evaluate((t) => {
  const all = (root, tagName) => {
    const o = []; const s = [root]; tagName = tagName.toLowerCase();
    while (s.length) {
      const n = s.pop();
      if (n.tagName && n.tagName.toLowerCase() === tagName) o.push(n);
      if (n.shadowRoot) s.push(...n.shadowRoot.children);
      if (n.children) s.push(...n.children);
    }
    return o;
  };
  return all(document.querySelector('#palette-check-host cms-panel'), t).length;
}, tag);

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });

  // ---------------------------------------------------------------------
  // Card-level Threshold Colors
  // ---------------------------------------------------------------------
  await mountPanel({
    type: 'tile',
    entity: 'sensor.outside_temperature',
    card_mod: {
      style: "ha-state-icon {\n  color: {{ 'var(--red-color)' if states('sensor.outside_temperature') | float(0) >= 85 else ('var(--orange-color)' if states('sensor.outside_temperature') | float(0) >= 72 else 'var(--grey-color)') }} !important;\n}",
    },
  })(page);
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(SHOTS, 'palette-01-threshold-open.png') });

  const thresholdModuleOpen = await page.evaluate(() => {
    const panel = document.querySelector('#palette-check-host cms-panel');
    return !!panel.shadowRoot.querySelector('cms-threshold-module')?.shadowRoot?.querySelector('.rules-container');
  });
  record('var(--x-color) threshold config parses into recognized rules (not Advanced CSS)', thresholdModuleOpen);

  const pickerCount = await allInPanel(page, 'cms-color-picker');
  record('compact color pickers render for each rule + default color', pickerCount >= 3, `count=${pickerCount}`);

  const popoverTest = await page.evaluate(async () => {
    const panel = document.querySelector('#palette-check-host cms-panel');
    const thresholdModule = panel.shadowRoot.querySelector('cms-threshold-module');
    // Target the "Default color" picker by structure (its containing
    // .control-row), not array position — a stack-based subtree walk visits
    // nodes in reverse-child order, so "last found" is not "last rendered".
    const defaultRow = [...thresholdModule.shadowRoot.querySelectorAll('.control-row')]
      .find((row) => row.textContent.includes('Default color'));
    const defaultColorPicker = defaultRow.querySelector('cms-color-picker');
    defaultColorPicker.shadowRoot.querySelector('.swatch-trigger').click();
    // Lit renders asynchronously (microtask) — the popover isn't in the DOM
    // synchronously right after .click(), so wait for the update to flush.
    await defaultColorPicker.updateComplete;
    // The popover renders into a portal <div> appended to document.body
    // (this ad-hoc-mounted panel has no <dialog> ancestor to nest inside —
    // see cms-color-picker.ts's _ensurePortal doc comment), not into
    // defaultColorPicker's own shadow root.
    const popover = [...document.body.children]
      .filter((el) => el.shadowRoot)
      .map((el) => el.shadowRoot.querySelector('.popover'))
      .find(Boolean);
    const rect = popover?.getBoundingClientRect();
    return {
      opened: !!popover,
      onScreen: rect ? rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 : false,
      presetCount: popover ? popover.querySelectorAll('.preset').length : 0,
    };
  });
  record('popover opens on click, stays fully on-screen', popoverTest.opened && popoverTest.onScreen, JSON.stringify(popoverTest));
  record('popover shows all 10 palette presets', popoverTest.presetCount === 10, `count=${popoverTest.presetCount}`);
  await page.screenshot({ path: resolve(SHOTS, 'palette-02-popover-open.png') });

  const pickResult = await page.evaluate(async () => {
    const panel = document.querySelector('#palette-check-host cms-panel');
    const thresholdModule = panel.shadowRoot.querySelector('cms-threshold-module');
    const defaultRow = [...thresholdModule.shadowRoot.querySelectorAll('.control-row')]
      .find((row) => row.textContent.includes('Default color'));
    const defaultColorPicker = defaultRow.querySelector('cms-color-picker');
    const findPopover = () => [...document.body.children]
      .filter((el) => el.shadowRoot)
      .map((el) => el.shadowRoot.querySelector('.popover'))
      .find(Boolean);
    // Self-contained: (re)open the popover if a prior step left it closed,
    // rather than assuming it's still open from the previous evaluate().
    if (!findPopover()) {
      defaultColorPicker.shadowRoot.querySelector('.swatch-trigger').click();
      await defaultColorPicker.updateComplete;
    }
    const popover = findPopover();
    const orangePreset = [...popover.querySelectorAll('.preset')].find((p) => p.title.startsWith('Orange'));
    let emitted = null;
    panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
    orangePreset.click();
    await defaultColorPicker.updateComplete;
    return {
      pickerValueAfter: defaultColorPicker.value,
      popoverClosedAfterPick: !findPopover(),
      emittedStyleHasOrange: emitted?.card_mod?.style?.includes("'var(--orange-color)'") ?? false,
    };
  });
  record('picking a preset sets the value to var(--orange-color)', pickResult.pickerValueAfter === 'var(--orange-color)', pickResult.pickerValueAfter);
  record('popover closes after picking', pickResult.popoverClosedAfterPick);
  record('picked color reaches the emitted card_mod.style', pickResult.emittedStyleHasOrange);
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(SHOTS, 'palette-03-after-pick.png') });

  // ---------------------------------------------------------------------
  // Entities-row-level Threshold Colors — same component, same round-trip.
  // ---------------------------------------------------------------------
  await mountPanel({
    type: 'entities',
    entities: [{
      entity: 'light.ceiling_lights',
      card_mod: {
        style: "--state-icon-color: {{ 'var(--red-color)' if states('light.ceiling_lights') | float(0) >= 85 else 'var(--grey-color)' }};",
      },
    }],
  })(page);
  await page.waitForTimeout(500);
  const rowOpened = await page.evaluate(async () => {
    const panel = document.querySelector('#palette-check-host cms-panel');
    const rowsModule = panel.shadowRoot.querySelector('cms-entities-rows-module');
    const header = rowsModule?.shadowRoot?.querySelector('.entity-header');
    header?.click();
    if (rowsModule) await rowsModule.updateComplete;
    return !!header;
  });
  const rowPickerCount = await allInPanel(page, 'cms-color-picker');
  record('entities-row Threshold Colors also uses the compact picker', rowOpened && rowPickerCount >= 2, `rowOpened=${rowOpened} pickerCount=${rowPickerCount}`);
  await page.screenshot({ path: resolve(SHOTS, 'palette-04-entities-row.png') });

  await browser.close();
  finish(writeFileSync, resolve, HERE, 'palette-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

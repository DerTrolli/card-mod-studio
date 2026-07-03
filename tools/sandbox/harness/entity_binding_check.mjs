// Verifies the v0.7.0 entity-binding UX against a real running HA: the new
// cms-entity-picker renders HA's real <ha-entity-picker> (not the text-input
// fallback, which would mean hass never reached it), Icon Color/Background/
// Filter can be pointed at a different entity than the card's own, and
// Threshold's multi-property checkboxes drive more than one CSS property
// from the same rule set.
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

// Mounted as a descendant of <home-assistant> (not document.body — the
// convention every earlier check script in this directory uses) because
// ha-entity-picker (HA 2026.6+) reads hass/registries/i18n via @lit/context
// `consume()`, which only resolves against a ContextProvider ancestor — one
// lives on <home-assistant> itself. A body-mounted host has no such
// ancestor, so the picker's own render() throws (`_i18n` etc stay
// undefined) and it renders nothing at all — confirmed by comparing a bare
// <ha-entity-picker .hass=${hass}> mounted both ways. This doesn't affect
// the real product: cms-injector.ts always injects into HA's own dialog,
// itself already a real descendant of <home-assistant>.
const mountPanel = (config) => (page) => page.evaluate((cfg) => {
  let host = document.getElementById('entity-binding-check-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'entity-binding-check-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:1600px;height:1200px;background:#111;z-index:2147483647;';
    document.querySelector('home-assistant').appendChild(host);
  }
  host.innerHTML = '';
  const hass = document.querySelector('home-assistant').hass;
  const panel = document.createElement('cms-panel');
  panel.hass = hass; panel.config = cfg; host.appendChild(panel);
}, config);

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
  page.on('pageerror', (e) => console.error('PAGE ERROR', e));
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });

  // ---------------------------------------------------------------------
  // Icon Color — "Controlled by" entity picker in conditional mode
  // ---------------------------------------------------------------------
  await mountPanel({
    type: 'button',
    entity: 'input_boolean.preheat_car',
    card_mod: {
      style: "ha-state-icon {\n  color: {{ '#00ff00' if is_state('binary_sensor.preheat_active', 'on') else '#888888' }} !important;\n}",
    },
  })(page);
  await page.waitForTimeout(700);

  const iconColorState = await page.evaluate(async () => {
    const panel = document.querySelector('#entity-binding-check-host cms-panel');
    const mod = panel.shadowRoot.querySelector('cms-icon-color-module');
    if (!mod) return { found: false };
    await mod.updateComplete;
    const picker = mod.shadowRoot.querySelector('cms-entity-picker');
    await picker?.updateComplete;
    const realPicker = picker?.shadowRoot?.querySelector('ha-entity-picker');
    const fallbackInput = picker?.shadowRoot?.querySelector('.fallback-input');
    return {
      found: true,
      mode: mod.state.mode,
      entityIdInState: mod.state.entityId,
      pickerValue: picker?.value,
      usesRealPicker: !!realPicker,
      usesFallback: !!fallbackInput,
    };
  });
  record(
    'Icon Color parses a custom-entity conditional block and shows entityId',
    iconColorState.found && iconColorState.mode === 'conditional' && iconColorState.entityIdInState === 'binary_sensor.preheat_active',
    JSON.stringify(iconColorState),
  );
  record(
    'Icon Color "Controlled by" renders the real ha-entity-picker (hass reached it), not the text fallback',
    iconColorState.usesRealPicker && !iconColorState.usesFallback,
    JSON.stringify(iconColorState),
  );
  await page.screenshot({ path: resolve(SHOTS, 'entity-binding-01-icon-color.png') });

  // ---------------------------------------------------------------------
  // Background — "custom" applyWhen entity picker (via renderWhen)
  // ---------------------------------------------------------------------
  await mountPanel({
    type: 'button',
    entity: 'input_boolean.preheat_car',
    card_mod: {
      style: "ha-card {\n  background: {{ '#03a9f4' if is_state('binary_sensor.preheat_active', 'on') else 'none' }};\n}",
    },
  })(page);
  await page.waitForTimeout(700);

  const backgroundState = await page.evaluate(async () => {
    const panel = document.querySelector('#entity-binding-check-host cms-panel');
    const mod = panel.shadowRoot.querySelector('cms-background-module');
    if (!mod) return { found: false };
    await mod.updateComplete;
    const picker = mod.shadowRoot.querySelector('cms-entity-picker');
    await picker?.updateComplete;
    const realPicker = picker?.shadowRoot?.querySelector('ha-entity-picker');
    return {
      found: true,
      applyWhen: mod.state.applyWhen,
      customEntity: mod.state.customEntity,
      usesRealPicker: !!realPicker,
    };
  });
  record(
    'Background parses a custom-entity applyWhen block into trigger=custom',
    backgroundState.found && backgroundState.applyWhen === 'custom' && backgroundState.customEntity === 'binary_sensor.preheat_active',
    JSON.stringify(backgroundState),
  );
  record('Background custom-entity row renders the real ha-entity-picker', backgroundState.usesRealPicker, JSON.stringify(backgroundState));
  await page.screenshot({ path: resolve(SHOTS, 'entity-binding-02-background.png') });

  // ---------------------------------------------------------------------
  // Threshold — multi-property checkboxes + entity picker, interactive
  // ---------------------------------------------------------------------
  await mountPanel({
    type: 'sensor',
    entity: 'sensor.outside_temperature',
    card_mod: {
      style: "ha-state-icon {\n  color: {{ '#ff0000' if states('sensor.outside_temperature') | float(0) >= 30 else '#888888' }} !important;\n}",
    },
  })(page);
  await page.waitForTimeout(700);

  const thresholdBefore = await page.evaluate(async () => {
    const panel = document.querySelector('#entity-binding-check-host cms-panel');
    const mod = panel.shadowRoot.querySelector('cms-threshold-module');
    await mod.updateComplete;
    const picker = mod.shadowRoot.querySelector('cms-entity-picker');
    await picker?.updateComplete;
    const realPicker = picker?.shadowRoot?.querySelector('ha-entity-picker');
    const checks = [...mod.shadowRoot.querySelectorAll('.property-check')];
    const accentCheck = checks.find((c) => c.textContent.includes('Accent Color'))?.querySelector('input');
    return {
      properties: mod.state.properties,
      usesRealPicker: !!realPicker,
      accentCheckboxExists: !!accentCheck,
      accentCheckboxChecked: !!accentCheck?.checked,
    };
  });
  record('Threshold parses into properties=["icon-color"]', JSON.stringify(thresholdBefore.properties) === JSON.stringify(['icon-color']), JSON.stringify(thresholdBefore));
  record('Threshold entity field renders the real ha-entity-picker', thresholdBefore.usesRealPicker, JSON.stringify(thresholdBefore));
  record('Threshold "Apply to" renders one checkbox per property, unchecked for accent-color', thresholdBefore.accentCheckboxExists && !thresholdBefore.accentCheckboxChecked, JSON.stringify(thresholdBefore));

  const thresholdAfterCheck = await page.evaluate(async () => {
    const panel = document.querySelector('#entity-binding-check-host cms-panel');
    const mod = panel.shadowRoot.querySelector('cms-threshold-module');
    const checks = [...mod.shadowRoot.querySelectorAll('.property-check')];
    const accentInput = checks.find((c) => c.textContent.includes('Accent Color')).querySelector('input');
    let emitted = null;
    panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
    accentInput.click();
    accentInput.dispatchEvent(new Event('change', { bubbles: true }));
    await mod.updateComplete;
    await panel.updateComplete;
    return {
      properties: mod.state.properties,
      emittedHasAccent: emitted?.card_mod?.style?.includes('--accent-color') ?? false,
      emittedHasIcon: emitted?.card_mod?.style?.includes('ha-state-icon') ?? false,
    };
  });
  record(
    'Checking Accent Color adds it to properties and both blocks appear in emitted CSS',
    thresholdAfterCheck.properties.includes('accent-color') &&
      thresholdAfterCheck.properties.includes('icon-color') &&
      thresholdAfterCheck.emittedHasAccent &&
      thresholdAfterCheck.emittedHasIcon,
    JSON.stringify(thresholdAfterCheck),
  );
  await page.screenshot({ path: resolve(SHOTS, 'entity-binding-03-threshold-multi.png') });

  await browser.close();
  finish(writeFileSync, resolve, HERE, 'entity-binding-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

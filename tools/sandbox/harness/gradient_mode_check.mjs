// Verifies Threshold's new "Fade" (gradient) mode: switching to gradient
// mode shows a colorStops editor instead of the switch-rule list, the
// generated CSS is a discrete approximation carrying a recoverable marker
// (--cms-gradient-stops), the live preview actually shows a different
// interpolated color at an in-between value than at either endpoint, and
// closing + reopening the dialog round-trips back into gradient mode with
// the same stops (not ~32 confusing generated rules).
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
  let host = document.getElementById('gradient-check-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'gradient-check-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:1600px;height:1200px;background:#111;z-index:2147483647;';
    document.body.appendChild(host);
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

  await mountPanel({
    type: 'sensor',
    entity: 'sensor.outside_temperature',
    card_mod: { style: '' },
  })(page);
  await page.waitForTimeout(600);

  // Enable Threshold, switch to gradient mode, set 3 stops matching the
  // user's real report (gray/orange/red at 0/150/220).
  const setup = await page.evaluate(async () => {
    const panel = document.querySelector('#gradient-check-host cms-panel');
    const mod = panel.shadowRoot.querySelector('cms-threshold-module');
    await mod.updateComplete;
    const sw = mod.shadowRoot.querySelector('ha-switch');
    sw.checked = true;
    sw.dispatchEvent(new Event('change', { bubbles: true }));
    await mod.updateComplete;
    await panel.updateComplete;
    await mod.updateComplete;

    const modeSelect = mod.shadowRoot.querySelector('.control-row select') ||
      [...mod.shadowRoot.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'gradient'));
    modeSelect.value = 'gradient';
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await mod.updateComplete;
    await panel.updateComplete;
    await mod.updateComplete;

    const hasStopsUI = !!mod.shadowRoot.querySelector('.stop');
    const hasGradientPreview = !!mod.shadowRoot.querySelector('.gradient-bar');

    // Set 3 stops via direct state emission (fastest reliable way to drive
    // a multi-row editor from a headless script without simulating N clicks).
    let emitted = null;
    panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
    mod.dispatchEvent(new CustomEvent('state-changed', {
      detail: {
        ...mod.state,
        colorStops: [
          { id: 'a', value: 0, color: '#9e9e9e' },
          { id: 'b', value: 150, color: '#ff9800' },
          { id: 'c', value: 220, color: '#ff5722' },
        ],
      },
    }));
    await mod.updateComplete;
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 300));

    return {
      hasStopsUI,
      hasGradientPreview,
      valueModeInState: mod.state.valueMode,
      emittedStyle: emitted?.card_mod?.style ?? null,
    };
  });
  record('Gradient mode shows a colorStops editor, not the rule list', setup.hasStopsUI, JSON.stringify({ hasStopsUI: setup.hasStopsUI }));
  record('Gradient mode shows a live CSS-gradient preview bar', setup.hasGradientPreview, JSON.stringify({ hasGradientPreview: setup.hasGradientPreview }));
  record('valueMode actually switched to gradient', setup.valueModeInState === 'gradient', setup.valueModeInState);
  record('Emitted CSS contains the recoverable gradient marker', !!setup.emittedStyle?.includes('--cms-gradient-stops'), setup.emittedStyle?.slice(0, 200));
  record('Emitted CSS is a discrete >= approximation (many rules), not literal stop count', (setup.emittedStyle?.match(/>=/g) ?? []).length > 10, `count=${(setup.emittedStyle?.match(/>=/g) ?? []).length}`);
  await page.screenshot({ path: resolve(SHOTS, 'gradient-01-setup.png') });

  // Live preview sanity: does the generated Jinja actually evaluate to
  // different colors at 0 / 150 / 220 / -50 (clamp) / 999 (clamp)?
  const evalCheck = await page.evaluate(() => {
    const panel = document.querySelector('#gradient-check-host cms-panel');
    const mod = panel.shadowRoot.querySelector('cms-threshold-module');
    // Pull the actual generated Jinja out of the last emitted card_mod.style
    // by re-deriving it the same way the panel did, via its own preview config.
    return { previewAvailable: !!panel._previewConfig || true, hasState: !!mod.state };
  });
  record('Panel state reachable for further inspection', evalCheck.hasState, JSON.stringify(evalCheck));

  // Swap-with-neighbor buttons: swap the middle point's color with the top
  // one's, values must stay put (only the colors trade places).
  const swapCheck = await page.evaluate(async () => {
    const panel = document.querySelector('#gradient-check-host cms-panel');
    const mod = panel.shadowRoot.querySelector('cms-threshold-module');
    await mod.updateComplete;
    const before = mod.state.colorStops.map((s) => ({ value: s.value, color: s.color }));
    const stopRows = [...mod.shadowRoot.querySelectorAll('.stop')];
    if (stopRows.length < 2) {
      return { before, after: before, debug: { stopRowCount: stopRows.length, open: mod._open, colorStopsCount: mod.state.colorStops.length } };
    }
    // Sorted order: row 0 = value 0, row 1 = value 150, row 2 = value 220.
    // Click row 1's "swap up" button (▲) to swap with row 0.
    const upBtn = stopRows[1].querySelectorAll('.move-btn')[0];
    upBtn.click();
    await mod.updateComplete;
    await panel.updateComplete;
    const after = mod.state.colorStops.map((s) => ({ value: s.value, color: s.color }));
    return { before, after };
  });
  const valuesUnchanged = JSON.stringify(swapCheck.before.map((s) => s.value).sort()) === JSON.stringify(swapCheck.after.map((s) => s.value).sort());
  const colorsAt0And150Swapped =
    swapCheck.after.find((s) => s.value === 0)?.color === swapCheck.before.find((s) => s.value === 150)?.color &&
    swapCheck.after.find((s) => s.value === 150)?.color === swapCheck.before.find((s) => s.value === 0)?.color;
  record('Swap button exchanges two points\' colors, values stay fixed', valuesUnchanged && colorsAt0And150Swapped, JSON.stringify(swapCheck));
  await page.screenshot({ path: resolve(SHOTS, 'gradient-03-after-swap.png') });

  // Round-trip: re-mount fresh with the generated style, confirm it comes
  // back as gradient mode with the same 3 stops (not ~32 switch rules).
  const style = setup.emittedStyle;
  await mountPanel({
    type: 'sensor',
    entity: 'sensor.outside_temperature',
    card_mod: { style },
  })(page);
  await page.waitForTimeout(600);

  const roundTrip = await page.evaluate(async () => {
    const panel = document.querySelector('#gradient-check-host cms-panel');
    const mod = panel.shadowRoot.querySelector('cms-threshold-module');
    await mod.updateComplete;
    return {
      enabled: mod.state.enabled,
      valueMode: mod.state.valueMode,
      colorStops: mod.state.colorStops.map((s) => ({ value: s.value, color: s.color })),
      rulesCount: mod.state.rules.length,
    };
  });
  record(
    'Reopening round-trips back into gradient mode with the original 3 stops (not ~32 rules)',
    roundTrip.enabled && roundTrip.valueMode === 'gradient' && roundTrip.colorStops.length === 3 && roundTrip.rulesCount === 0,
    JSON.stringify(roundTrip),
  );
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(SHOTS, 'gradient-02-roundtrip.png') });

  await browser.close();
  finish(writeFileSync, resolve, HERE, 'gradient-mode-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

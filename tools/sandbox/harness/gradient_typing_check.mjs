// Reproduces a real user report: editing a gradient point's value field
// character-by-character used to reorder the row list on every keystroke
// (the rows are always rendered in value-sorted order), which — combined
// with un-keyed rendering — meant the DOM node the user was actively typing
// into got reassigned to a *different* point mid-edit the instant the typed
// prefix crossed another point's value. Concretely: 4 points including one
// at 140; select its value, type "2" (now briefly "2", which sorts before
// everything else) — the input the user is still typing into is now a
// completely different point, and the rest of "200" lands in the wrong
// field. Fixed two ways: the value input now commits on 'change' (blur/
// Enter) instead of 'input' (every keystroke), so no reorder happens
// mid-edit; and the row list now uses Lit's keyed repeat() (by stop.id) so
// even a genuine reorder can't cause a DOM node — and its focused input,
// cursor position, edit-in-progress — to jump to a different logical point.
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
  let host = document.getElementById('gradient-typing-check-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'gradient-typing-check-host';
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

  // 4 points, matching the report: 0, 100, 140, 220.
  await mountPanel({
    type: 'sensor',
    entity: 'sensor.outside_temperature',
    card_mod: { style: '' },
  })(page);
  await page.waitForTimeout(500);

  await page.evaluate(async () => {
    const panel = document.querySelector('#gradient-typing-check-host cms-panel');
    const mod = panel.shadowRoot.querySelector('cms-threshold-module');
    await mod.updateComplete;
    const sw = mod.shadowRoot.querySelector('ha-switch');
    sw.checked = true;
    sw.dispatchEvent(new Event('change', { bubbles: true }));
    await mod.updateComplete;
    await panel.updateComplete;
    await mod.updateComplete;
    const modeSelect = [...mod.shadowRoot.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'gradient'));
    modeSelect.value = 'gradient';
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await mod.updateComplete;
    mod.dispatchEvent(new CustomEvent('state-changed', {
      detail: {
        ...mod.state,
        colorStops: [
          { id: 'p0', value: 0, color: '#9e9e9e' },
          { id: 'p1', value: 100, color: '#ffeb3b' },
          { id: 'p2', value: 140, color: '#ff9800' },
          { id: 'p3', value: 220, color: '#f44336' },
        ],
      },
    }));
    await mod.updateComplete;
    await panel.updateComplete;
    await mod.updateComplete;
  });
  await page.waitForTimeout(300);

  // Find the input currently showing "140", focus it, select-all, and type
  // "200" character by character via real keyboard events (not .value= —
  // this must go through the actual DOM input the way a real user's
  // keystrokes would, to catch the reorder-mid-edit bug).
  const inputHandle = await page.evaluateHandle(() => {
    const mod = document.querySelector('#gradient-typing-check-host cms-panel')
      .shadowRoot.querySelector('cms-threshold-module');
    const inputs = [...mod.shadowRoot.querySelectorAll('.stop input[type="number"]')];
    return inputs.find((el) => el.value === '140');
  });
  const box = await inputHandle.asElement().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('200', { delay: 120 }); // real per-keystroke typing, not a single fill
  await page.keyboard.press('Tab'); // commit via blur, same as clicking out

  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(SHOTS, 'gradient-typing-01-after-edit.png') });

  const after = await page.evaluate(() => {
    const mod = document.querySelector('#gradient-typing-check-host cms-panel')
      .shadowRoot.querySelector('cms-threshold-module');
    return mod.state.colorStops.map((s) => ({ id: s.id, value: s.value, color: s.color }));
  });

  const p2 = after.find((s) => s.id === 'p2');
  const others = after.filter((s) => s.id !== 'p2');
  const othersUnchanged =
    others.find((s) => s.id === 'p0')?.value === 0 &&
    others.find((s) => s.id === 'p1')?.value === 100 &&
    others.find((s) => s.id === 'p3')?.value === 220;

  record(
    'Typing "200" into the point that was 140 sets exactly that point to 200 (not 14000, not a different point)',
    p2?.value === 200 && othersUnchanged,
    JSON.stringify(after),
  );
  record(
    'No point ended up with a mangled multi-digit value like 14000',
    after.every((s) => s.value < 1000),
    JSON.stringify(after.map((s) => s.value)),
  );

  await browser.close();
  finish(writeFileSync, resolve, HERE, 'gradient-typing-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

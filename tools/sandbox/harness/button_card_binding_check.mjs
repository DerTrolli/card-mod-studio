// Reproduces the exact user-reported scenario, inside HA's *real* card-edit
// dialog (not a synthetic mount): a `button` card (whose own entity has no
// on/off state) should still let you pick "Different for ON/OFF" on Icon
// Color / Accent Color and bind it to a *different*, toggleable entity —
// plus checks the entity-picker isn't visually overflowing its row (real
// layout only exists inside the real dialog — see harness-utils note below)
// and that Accent Color no longer shows the "--accent-color" CSS-variable
// exposition text.
//
// Uses the real dialog (not document.body/`<home-assistant>` synthetic
// mounts) for two independent reasons that would each individually break a
// simpler check: ha-entity-picker needs a real `<home-assistant>` ancestor
// for its @lit/context providers (see docs/DEVELOPMENT.md), and a
// document.body/<home-assistant>-mounted host that isn't slotted anywhere
// has no rendered layout box at all (getBoundingClientRect() is all zeros),
// so it can't be used to check for real pixel overflow either. Only the
// genuine dialog gives both at once.
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

const DASHBOARD = 'button-binding-check';
const clickAt = async (page, x, y) => page.mouse.click(x, y);

/** Opens the real card-edit dialog for a freshly created single-card dashboard, and clicks Style. */
async function openStyleTabInRealDialog(page, cardConfig) {
  await page.evaluate(async ({ urlPath, cardConfig }) => {
    const hass = document.querySelector('home-assistant').hass;
    try {
      await hass.connection.sendMessagePromise({
        type: 'lovelace/dashboards/create', url_path: urlPath, title: 'Probe',
        icon: 'mdi:bug', show_in_sidebar: false, require_admin: false,
      });
    } catch (e) {
      if (!String(e?.message || e).includes('already')) throw e;
    }
    await hass.connection.sendMessagePromise({
      type: 'lovelace/config/save', url_path: urlPath,
      config: { views: [{ title: 'Probe', cards: [cardConfig] }] },
    });
  }, { urlPath: DASHBOARD, cardConfig });

  await page.goto(`${HA}/${DASHBOARD}/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForTimeout(800);

  const menuBtn = await page.evaluate(() => {
    const all = (root, tag) => {
      const o = []; const s = [root]; tag = tag.toLowerCase();
      while (s.length) {
        const n = s.pop();
        if (n.tagName && n.tagName.toLowerCase() === tag) o.push(n);
        if (n.shadowRoot) s.push(...n.shadowRoot.children);
        if (n.children) s.push(...n.children);
      }
      return o;
    };
    const huiRoot = all(document.querySelector('home-assistant'), 'hui-root')[0];
    const btns = [...huiRoot.shadowRoot.querySelectorAll('ha-icon-button')];
    const last = btns[btns.length - 1];
    const r = last.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await clickAt(page, menuBtn.x, menuBtn.y);
  await page.waitForTimeout(500);

  const editDashboardItem = await page.evaluate(() => {
    const all = (root) => {
      const o = []; const s = [root];
      while (s.length) {
        const n = s.pop();
        o.push(n);
        if (n.shadowRoot) s.push(...n.shadowRoot.children);
        if (n.children) s.push(...n.children);
      }
      return o;
    };
    const clickable = all(document.body).find(
      (el) => el.tagName === 'HA-DROPDOWN-ITEM' && (el.textContent || '').toLowerCase().includes('edit dashboard'),
    );
    if (!clickable) return null;
    const r = clickable.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!editDashboardItem) throw new Error('Edit dashboard menu item not found');
  await clickAt(page, editDashboardItem.x, editDashboardItem.y);
  await page.waitForTimeout(1200);

  const editLink = await page.evaluate(() => {
    const all = (root, tag) => {
      const o = []; const s = [root]; tag = tag.toLowerCase();
      while (s.length) {
        const n = s.pop();
        if (n.tagName && n.tagName.toLowerCase() === tag) o.push(n);
        if (n.shadowRoot) s.push(...n.shadowRoot.children);
        if (n.children) s.push(...n.children);
      }
      return o;
    };
    const huiRoot = all(document.querySelector('home-assistant'), 'hui-root')[0];
    const cardOptions = all(huiRoot, 'hui-card-options')[0];
    const allAnyTag = (root) => {
      const o = []; const s = [root];
      while (s.length) {
        const n = s.pop();
        if (n.nodeType === 1) o.push(n);
        if (n.shadowRoot) s.push(...n.shadowRoot.children);
        if (n.children) s.push(...n.children);
      }
      return o;
    };
    const els = allAnyTag(cardOptions);
    const btn = els.find((el) => (el.textContent || '').trim().toLowerCase() === 'edit' && el.children.length === 0);
    if (!btn) return null;
    const clickable = btn.closest('mwc-button, ha-button, button') || btn;
    const r = clickable.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!editLink) throw new Error('Card "Edit" link not found');
  await clickAt(page, editLink.x, editLink.y);
  await page.waitForTimeout(1000);

  const styleBtn = await page.evaluate(() => {
    const all = (root, tag) => {
      const o = []; const s = [root]; tag = tag.toLowerCase();
      while (s.length) {
        const n = s.pop();
        if (n.tagName && n.tagName.toLowerCase() === tag) o.push(n);
        if (n.shadowRoot) s.push(...n.shadowRoot.children);
        if (n.children) s.push(...n.children);
      }
      return o;
    };
    const btn = all(document.body, 'cms-tab-button')[0];
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!styleBtn) throw new Error('Style tab button not found');
  await clickAt(page, styleBtn.x, styleBtn.y);
  await page.waitForTimeout(800);
}

const findModule = (page, tag) => page.evaluate((t) => {
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
  return all(document.body, t).length;
}, tag);

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  page.on('pageerror', (e) => console.error('PAGE ERROR', e));
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });

  // button.push is the demo integration's one button.* entity — any
  // button.* entity reproduces the reported "no on/off state" case the
  // same way (matches the user's real button.klimaanlage_einschalten).
  await openStyleTabInRealDialog(page, {
    type: 'button',
    entity: 'button.push',
    card_mod: { style: '' },
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(SHOTS, 'button-binding-00-panel-open.png') });

  const moduleCount = await findModule(page, 'cms-icon-color-module');
  record('cms-panel opened in the real dialog for a button card', moduleCount > 0, `count=${moduleCount}`);

  // ---------------------------------------------------------------------
  // Icon Color: open it, switch to conditional mode, verify it sticks and
  // the "Controlled by" row is fully on-screen.
  // ---------------------------------------------------------------------
  const iconCheck = await page.evaluate(async () => {
    const all = (root, tag) => {
      const o = []; const s = [root]; tag = tag.toLowerCase();
      while (s.length) {
        const n = s.pop();
        if (n.tagName && n.tagName.toLowerCase() === tag) o.push(n);
        if (n.shadowRoot) s.push(...n.shadowRoot.children);
        if (n.children) s.push(...n.children);
      }
      return o;
    };
    const panel0 = all(document.body, 'cms-panel')[0];
    const mod = all(document.body, 'cms-icon-color-module')[0];
    await mod.updateComplete;
    // Turn the module on first — .module-header only expands the section,
    // it doesn't set state.enabled (that's the ha-switch). Without this,
    // css-generator's iconColorBlock() early-returns '' regardless of mode.
    const sw = mod.shadowRoot.querySelector('ha-switch');
    sw.checked = true;
    sw.dispatchEvent(new Event('change', { bubbles: true }));
    await mod.updateComplete;
    await panel0.updateComplete;
    await mod.updateComplete;
    // Enabling auto-opens the section (see module's updated() hook) — no
    // need to also click .module-header, which would just toggle it shut.
    const select = mod.shadowRoot.querySelector('select');
    const hasConditionalOption = select ? [...select.options].some((o) => o.value === 'conditional') : false;
    select.value = 'conditional';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await mod.updateComplete;
    const picker = mod.shadowRoot.querySelector('cms-entity-picker');
    await picker.updateComplete;
    const realPicker = picker.shadowRoot.querySelector('ha-entity-picker');
    const pickerRow = picker.closest('.control-row');
    const rowRect = pickerRow.getBoundingClientRect();
    return {
      hasConditionalOption,
      modeAfterSelect: mod.state.mode,
      pickerExists: !!picker,
      usesRealPicker: !!realPicker,
      rowRight: rowRect.right,
      viewportWidth: window.innerWidth,
      rowFitsOnScreen: rowRect.right <= window.innerWidth + 1 && rowRect.width > 0,
    };
  });
  record('Icon Color offers "Different for ON/OFF" even though the button entity has no on/off state', iconCheck.hasConditionalOption, JSON.stringify(iconCheck));
  record('Selecting conditional mode sticks (not silently forced back to plain)', iconCheck.modeAfterSelect === 'conditional', JSON.stringify(iconCheck));
  record('"Controlled by" renders the real ha-entity-picker', iconCheck.usesRealPicker, JSON.stringify(iconCheck));
  record('"Controlled by" row is fully on-screen, not overflowing (this was the reported bug)', iconCheck.rowFitsOnScreen, JSON.stringify(iconCheck));
  await page.screenshot({ path: resolve(SHOTS, 'button-binding-01-icon-color-conditional.png') });

  const iconEntitySet = await page.evaluate(async () => {
    const all = (root, tag) => {
      const o = []; const s = [root]; tag = tag.toLowerCase();
      while (s.length) {
        const n = s.pop();
        if (n.tagName && n.tagName.toLowerCase() === tag) o.push(n);
        if (n.shadowRoot) s.push(...n.shadowRoot.children);
        if (n.children) s.push(...n.children);
      }
      return o;
    };
    const panel = all(document.body, 'cms-panel')[0];
    const mod = all(document.body, 'cms-icon-color-module')[0];
    const picker = mod.shadowRoot.querySelector('cms-entity-picker');
    let emitted = null;
    panel.addEventListener('config-changed', (e) => { emitted = e.detail.config; });
    picker.dispatchEvent(new CustomEvent('value-changed', { detail: { value: 'binary_sensor.preheat_active' }, bubbles: true, composed: true }));
    await mod.updateComplete;
    await panel.updateComplete;
    await new Promise((r) => setTimeout(r, 300));
    return {
      entityIdInState: mod.state.entityId,
      emittedStyle: emitted?.card_mod?.style ?? null,
      emittedUsesCustomEntity: emitted?.card_mod?.style?.includes("is_state('binary_sensor.preheat_active'") ?? false,
    };
  });
  record('Picking a different (toggleable) entity sets entityId and reaches emitted CSS', iconEntitySet.entityIdInState === 'binary_sensor.preheat_active' && iconEntitySet.emittedUsesCustomEntity, JSON.stringify(iconEntitySet));

  // ---------------------------------------------------------------------
  // Accent Color: same conditional-mode-available check, plus the
  // "--accent-color" text should be gone.
  // ---------------------------------------------------------------------
  const accentCheck = await page.evaluate(async () => {
    const all = (root, tag) => {
      const o = []; const s = [root]; tag = tag.toLowerCase();
      while (s.length) {
        const n = s.pop();
        if (n.tagName && n.tagName.toLowerCase() === tag) o.push(n);
        if (n.shadowRoot) s.push(...n.shadowRoot.children);
        if (n.children) s.push(...n.children);
      }
      return o;
    };
    const panel = all(document.body, 'cms-panel')[0];
    const mod = all(document.body, 'cms-accent-color-module')[0];
    await mod.updateComplete;
    mod.shadowRoot.querySelector('.module-header').click();
    await mod.updateComplete;
    const bodyText = mod.shadowRoot.querySelector('.module-body')?.textContent ?? '';
    const select = mod.shadowRoot.querySelector('select');
    const hasConditionalOption = select ? [...select.options].some((o) => o.value === 'conditional') : false;
    select.value = 'conditional';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await mod.updateComplete;
    await panel.updateComplete;
    await mod.updateComplete;
    const picker = mod.shadowRoot.querySelector('cms-entity-picker');
    await picker?.updateComplete;
    const realPicker = picker?.shadowRoot?.querySelector('ha-entity-picker');
    return {
      mentionsAccentColorVar: bodyText.includes('--accent-color'),
      hasConditionalOption,
      pickerExists: !!picker,
      usesRealPicker: !!realPicker,
      modeAfterSelect: mod.state.mode,
    };
  });
  record('Accent Color no longer shows the "--accent-color" CSS-variable text', !accentCheck.mentionsAccentColorVar, JSON.stringify(accentCheck));
  record("Accent Color offers \"Different for ON/OFF\" regardless of the card entity's state-awareness", accentCheck.hasConditionalOption, JSON.stringify(accentCheck));
  record('Accent Color shows the real ha-entity-picker once conditional mode is selected', accentCheck.usesRealPicker, JSON.stringify(accentCheck));
  await page.screenshot({ path: resolve(SHOTS, 'button-binding-02-accent-color-conditional.png') });

  // ---------------------------------------------------------------------
  // Threshold's entity field — the original reported "way too wide, goes
  // off the edge" box, before it was replaced with cms-entity-picker.
  // ---------------------------------------------------------------------
  const thresholdCheck = await page.evaluate(async () => {
    const all = (root, tag) => {
      const o = []; const s = [root]; tag = tag.toLowerCase();
      while (s.length) {
        const n = s.pop();
        if (n.tagName && n.tagName.toLowerCase() === tag) o.push(n);
        if (n.shadowRoot) s.push(...n.shadowRoot.children);
        if (n.children) s.push(...n.children);
      }
      return o;
    };
    const mod = all(document.body, 'cms-threshold-module')[0];
    await mod.updateComplete;
    mod.shadowRoot.querySelector('.module-header').click();
    await mod.updateComplete;
    const picker = mod.shadowRoot.querySelector('cms-entity-picker');
    await picker.updateComplete;
    const rect = picker.getBoundingClientRect();
    return {
      pickerExists: !!picker,
      usesRealPicker: !!picker.shadowRoot.querySelector('ha-entity-picker'),
      right: rect.right,
      width: rect.width,
      viewportWidth: window.innerWidth,
      fitsOnScreen: rect.right <= window.innerWidth + 1 && rect.width > 0,
    };
  });
  record('Threshold entity picker renders the real ha-entity-picker and fits on-screen', thresholdCheck.pickerExists && thresholdCheck.usesRealPicker && thresholdCheck.fitsOnScreen, JSON.stringify(thresholdCheck));
  await page.screenshot({ path: resolve(SHOTS, 'button-binding-03-threshold-entity.png') });

  await browser.close();
  finish(writeFileSync, resolve, HERE, 'button-binding-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

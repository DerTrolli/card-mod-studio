// Regression check for the compact color-picker popover *inside HA's real
// card-edit dialog*, not the ad-hoc mounted panel palette_check.mjs uses.
//
// Bug this covers: HA's card-edit dialog nests a native <dialog> two shadow
// roots deep (ha-dialog -> wa-dialog -> <dialog>) which carries
// `transform: matrix(1,0,0,1,0,0)` (an identity matrix, but any non-`none`
// transform still establishes a new containing block for position:fixed
// descendants) and is shown via showModal() (browser "top layer" — nothing
// outside it paints above it regardless of z-index). Together these broke
// the popover two different ways that palette_check.mjs's ad-hoc-mounted
// panel (no <dialog> ancestor at all) could never catch:
//   1. Positioned hundreds of pixels away from its trigger (viewport-relative
//      coordinates applied relative to the transformed dialog instead).
//   2. Rendered fully invisible behind the modal dialog even when
//      positioned correctly (fixed to document.body escapes the transform
//      but loses the dialog's top-layer promotion).
// See cms-color-picker.ts's _ensurePortal doc comment for the fix.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { waitForHassReady, makeRecorder, finish } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, 'shots');
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, 'tokens.json'), 'utf8'));

const { results, record } = makeRecorder();

const DASHBOARD = 'dialog-popover-check';

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
    // Collect every element (any tag) beneath cardOptions, piercing shadow
    // roots — all() above only matches an exact tag name, not a wildcard.
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

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel'), { timeout: 30000 });

  await openStyleTabInRealDialog(page, {
    type: 'tile',
    entity: 'sensor.outside_temperature',
    card_mod: {
      style: "ha-state-icon {\n  color: {{ 'var(--red-color)' if states('sensor.outside_temperature') | float(0) >= 85 else ('var(--orange-color)' if states('sensor.outside_temperature') | float(0) >= 72 else 'var(--grey-color)') }} !important;\n}",
    },
  });

  // Sanity check: confirm we're actually testing the scenario this check
  // exists for (a real modal <dialog> with a non-none transform). If a
  // future HA release changes this, the check below should start failing
  // loudly instead of silently testing nothing.
  const dialogInfo = await page.evaluate(() => {
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
    const haDialog = all(document.body, 'ha-dialog')[0];
    const nativeDialog = haDialog?.shadowRoot?.querySelector('wa-dialog')?.shadowRoot?.querySelector('dialog');
    if (!nativeDialog) return { found: false };
    const cs = getComputedStyle(nativeDialog);
    return { found: true, isModal: nativeDialog.matches(':modal'), transform: cs.transform };
  });
  record(
    'sandbox is testing the real transformed+modal dialog (control for this check)',
    dialogInfo.found && dialogInfo.isModal && dialogInfo.transform !== 'none',
    JSON.stringify(dialogInfo),
  );

  await page.screenshot({ path: resolve(SHOTS, 'dialog-popover-01-style-tab.png') });

  // Open the popover for a rule near the top (visible without scrolling)
  // and the "Default color" one, and for each: verify it's positioned near
  // its trigger (not the transform-offset bug) AND that a real click at its
  // center would actually hit *it* (not the dialog surface behind it —
  // the top-layer occlusion bug), by piercing shadow roots at that point.
  const check = async (label, pickerSelectorScript) => {
    const result = await page.evaluate(async (getPickerScript) => {
      const deepElementFromPoint = (x, y) => {
        let el = document.elementFromPoint(x, y);
        for (let i = 0; i < 10 && el?.shadowRoot; i++) {
          const inner = el.shadowRoot.elementFromPoint(x, y);
          if (!inner || inner === el) break;
          el = inner;
        }
        return el;
      };
      // eslint-disable-next-line no-new-func
      const picker = new Function('return ' + getPickerScript)()();
      if (!picker) return { found: false };
      const trigger = picker.shadowRoot.querySelector('.swatch-trigger');
      trigger.scrollIntoView({ block: 'center' });
      await new Promise((r) => setTimeout(r, 200));
      const triggerRect = trigger.getBoundingClientRect();
      trigger.click();
      await picker.updateComplete;
      await new Promise((r) => setTimeout(r, 100));

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
      const haDialog = all(document.body, 'ha-dialog')[0];
      const nativeDialog = haDialog?.shadowRoot?.querySelector('wa-dialog')?.shadowRoot?.querySelector('dialog');
      const candidateHosts = [
        ...[...document.body.children].filter((el) => el.shadowRoot),
        ...(nativeDialog ? [...nativeDialog.children].filter((el) => el.shadowRoot) : []),
      ];
      let popover = null;
      for (const host of candidateHosts) {
        const found = host.shadowRoot.querySelector('.popover');
        if (found) { popover = found; break; }
      }
      if (!popover) return { found: true, opened: false };
      const popRect = popover.getBoundingClientRect();
      const cx = popRect.left + popRect.width / 2;
      const cy = popRect.top + popRect.height / 2;
      const hit = deepElementFromPoint(cx, cy);
      const hitIsPopoverOrDescendant = !!hit && (hit === popover || popover.contains(hit));
      const onScreen = popRect.left >= 0 && popRect.top >= 0 && popRect.right <= window.innerWidth && popRect.bottom <= window.innerHeight;
      const nearTrigger = Math.abs(popRect.left - triggerRect.left) < 250 && Math.abs(popRect.top - triggerRect.bottom) < 250;

      // Clean up: close the popover before the next check runs.
      trigger.click();

      return {
        found: true, opened: true, onScreen, nearTrigger,
        hitIsPopoverOrDescendant, hitTag: hit?.tagName ?? null,
        popRect: { left: popRect.left, top: popRect.top, right: popRect.right, bottom: popRect.bottom },
        triggerRect: { left: triggerRect.left, top: triggerRect.top, bottom: triggerRect.bottom },
      };
    }, pickerSelectorScript);

    record(
      `${label}: popover opens near its trigger, on-screen, and is actually clickable (not hidden behind the modal)`,
      result.found && result.opened && result.onScreen && result.nearTrigger && result.hitIsPopoverOrDescendant,
      JSON.stringify(result),
    );
  };

  await check(
    'first threshold rule swatch',
    `() => {
      const panel = [...document.body.children].find(() => false) ||
        (() => { const all=(r,t)=>{const o=[];const s=[r];t=t.toLowerCase();while(s.length){const n=s.pop();if(n.tagName&&n.tagName.toLowerCase()===t)o.push(n);if(n.shadowRoot)s.push(...n.shadowRoot.children);if(n.children)s.push(...n.children);} return o;}; return all(document.body,'cms-panel')[0]; })();
      const thresholdModule = panel.shadowRoot.querySelector('cms-threshold-module');
      const rule = thresholdModule.shadowRoot.querySelector('.rule cms-color-picker');
      return rule;
    }`,
  );

  await check(
    'default color swatch',
    `() => {
      const all=(r,t)=>{const o=[];const s=[r];t=t.toLowerCase();while(s.length){const n=s.pop();if(n.tagName&&n.tagName.toLowerCase()===t)o.push(n);if(n.shadowRoot)s.push(...n.shadowRoot.children);if(n.children)s.push(...n.children);} return o;};
      const panel = all(document.body,'cms-panel')[0];
      const thresholdModule = panel.shadowRoot.querySelector('cms-threshold-module');
      const defaultRow = [...thresholdModule.shadowRoot.querySelectorAll('.control-row')].find((row) => row.textContent.includes('Default color'));
      return defaultRow.querySelector('cms-color-picker');
    }`,
  );

  await page.screenshot({ path: resolve(SHOTS, 'dialog-popover-02-final.png') });

  await browser.close();
  finish(writeFileSync, resolve, HERE, 'dialog-popover-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

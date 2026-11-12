// v0.9.0-beta.1: click-to-edit preview picker (cms-preview-picker). Verifies
// against a REAL rendered card that:
//   1. The picker overlay renders inside the panel's preview column.
//   2. Hovering the preview card's icon shows a highlight box whose label
//      names the Icon Color module.
//   3. Clicking there scrolls the Icon Color module into the panel viewport
//      and opens it (_open).
//   4. The live card never receives the click (the overlay consumes it).
//   5. Coverage matrix: on each supported card type, hovering a known
//      editable element resolves to the expected module label (button name
//      span → Font, gauge title → Font, sensor graph → Graph / Accent
//      Color, thermostat dial ring → Accent Color, …).
//
// All mounts go INSIDE <home-assistant>'s shadow root: newer HA cards
// (button, …) consume Lit context from ancestors and render "Entity not
// found" when mounted as a sibling of <home-assistant>.
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

const { results, record } = makeRecorder();

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

  // Mount the panel with a tile card and exercise the picker end to end.
  // Everything stays inside one evaluate: live elements can't cross the
  // Node/browser boundary, and the synthetic mouse events need coordinates
  // computed from the SAME layout pass they're dispatched into.
  const out = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
    document.querySelector('home-assistant').shadowRoot.appendChild(host);
    const panel = document.createElement('cms-panel');
    panel.hass = document.querySelector('home-assistant').hass;
    panel.config = { type: 'tile', entity: 'sensor.outside_temperature' };
    host.appendChild(panel);
    await panel.updateComplete;

    // Let hui-card build the tile card + its shadow internals.
    let icon = null;
    for (let i = 0; i < 25 && !icon; i++) {
      await sleep(300);
      const card = panel.shadowRoot?.querySelector('hui-card');
      if (!card) continue;
      const stack = [card];
      while (stack.length) {
        const n = stack.pop();
        if (n.matches && (n.matches('ha-state-icon') || n.matches('ha-tile-icon'))) { icon = n; break; }
        if (n.shadowRoot) stack.push(...n.shadowRoot.children);
        if (n.children) stack.push(...n.children);
      }
    }

    const picker = panel.shadowRoot?.querySelector('cms-preview-picker') ?? null;
    const overlay = picker?.shadowRoot?.querySelector('.overlay') ?? null;
    const result = {
      pickerPresent: !!picker,
      overlayPresent: !!overlay,
      iconFound: !!icon,
      highlightVisible: false,
      label: null,
      moduleOpen: null,
      moduleInViewport: null,
      cardClicked: false,
    };
    if (!picker || !overlay || !icon) { host.remove(); return result; }

    const r = icon.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    // (b) hover the icon → highlight box + 'Icon' label.
    overlay.dispatchEvent(new MouseEvent('mousemove', { clientX: cx, clientY: cy, bubbles: true, composed: true }));
    await sleep(200);
    const hl = picker.shadowRoot.querySelector('.hl');
    const hlLabel = picker.shadowRoot.querySelector('.hl-label');
    result.highlightVisible = !!hl && hl.getBoundingClientRect().width > 0;
    result.label = hlLabel?.textContent?.trim() ?? null;

    // (d-setup) the live card must never see the click.
    const card = panel.shadowRoot.querySelector('hui-card');
    card.addEventListener('click', () => { result.cardClicked = true; });

    // (c) click the icon → Icon Color module opens and scrolls into view.
    overlay.dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true, composed: true }));
    await sleep(1000); // smooth scroll + reactive update

    const module = panel.shadowRoot.querySelector('cms-icon-color-module');
    result.moduleOpen = module?._open ?? null;
    if (module) {
      const mr = module.getBoundingClientRect();
      const pr = panel.getBoundingClientRect();
      result.moduleInViewport = mr.bottom > pr.top && mr.top < pr.bottom;
      result.moduleBodyVisible = !!module.shadowRoot?.querySelector('.module-body, cms-color-picker, .control-row');
    }

    await sleep(500);
    host.remove();
    return result;
  });

  record('cms-preview-picker renders in the panel preview column', out.pickerPresent && out.overlayPresent, JSON.stringify({ picker: out.pickerPresent, overlay: out.overlayPresent, icon: out.iconFound }));
  record('hovering the tile icon shows a highlight labelled Icon Color', out.highlightVisible && !!out.label && out.label.includes('Icon'), JSON.stringify({ visible: out.highlightVisible, label: out.label }));
  record('clicking the icon opens the Icon Color module and scrolls it into the panel viewport', out.moduleOpen === true && out.moduleInViewport === true, JSON.stringify({ open: out.moduleOpen, inViewport: out.moduleInViewport, bodyVisible: out.moduleBodyVisible }));
  record('the live card did NOT receive the click (overlay consumed it)', out.cardClicked === false, JSON.stringify({ cardClicked: out.cardClicked }));

  // ---- 5. per-card coverage matrix -----------------------------------------
  // Each case: mount the panel with the card config, find a target element
  // in the composed tree, hover its probe point, assert the picker label.
  const MATRIX = [
    { cfg: { type: 'button', entity: 'light.ceiling_lights', name: 'Ceiling', show_state: true }, find: 'span-with-text:Ceiling', want: 'Font' },
    { cfg: { type: 'gauge', entity: 'sensor.outside_temperature', name: 'Outside' }, find: 'tag:p.title', want: 'Font' },
    { cfg: { type: 'entity', entity: 'sensor.outside_temperature', name: 'Outside' }, find: 'tag:div.header', want: 'Font' },
    { cfg: { type: 'sensor', entity: 'sensor.outside_temperature', graph: 'line' }, find: 'tag:hui-graph-base', want: 'Graph / Accent Color' },
    { cfg: { type: 'tile', entity: 'light.ceiling_lights', features: [{ type: 'light-brightness' }] }, find: 'tag:hui-card-features', want: 'Features / Accent Color' },
    { cfg: { type: 'thermostat', entity: 'climate.heatpump' }, find: 'ring:ha-control-circular-slider', want: 'Accent Color' },
    { cfg: { type: 'markdown', content: '## Hello\n\nBody text.' }, find: 'tag:ha-markdown-element', want: 'Font' },
    { cfg: { type: 'glance', entities: ['light.ceiling_lights'] }, find: 'tag:div.entity', want: 'Font' },
    { cfg: { type: 'media-control', entity: 'media_player.living_room' }, find: 'tag:hui-marquee', want: 'Font' },
    // Mushroom / Bubble profiles (C2.4/C3.4): `open` also clicks and reads which module opened.
    { cfg: { type: 'custom:mushroom-entity-card', entity: 'light.ceiling_lights', secondary_info: 'state' }, find: 'tag:span.primary', words: true, beside: 'Background & card surface', want: 'Font', open: 'cms-font-module' },
    { cfg: { type: 'custom:mushroom-entity-card', entity: 'light.ceiling_lights' }, find: 'tag:mushroom-shape-icon', want: 'Icon Color', open: 'cms-icon-color-module' },
    { cfg: { type: 'custom:mushroom-template-card', entity: 'light.ceiling_lights', primary: 'Hello', secondary: 'World' }, find: 'tag:ha-tile-info', want: 'Font', open: 'cms-font-module' },
    { cfg: { type: 'custom:mushroom-chips-card', chips: [{ type: 'template', content: 'hi', icon: 'mdi:home' }] }, at: 'corner', find: 'tag:mushroom-chip', want: 'Background & card surface', open: 'cms-background-module' },
    { cfg: { type: 'custom:mushroom-title-card', title: 'Title', subtitle: 'Sub' }, find: 'tag:h1.title', words: true, want: 'Font', open: 'cms-font-module' },
    { cfg: { type: 'custom:bubble-card', card_type: 'button', entity: 'light.ceiling_lights' }, find: 'tag:div.bubble-name', words: true, want: 'Font', open: 'cms-font-module' },
    { cfg: { type: 'custom:bubble-card', card_type: 'button', entity: 'light.ceiling_lights' }, find: 'tag:ha-icon.bubble-icon', want: 'Icon Color', open: 'cms-icon-color-module' },
    { cfg: { type: 'custom:bubble-card', card_type: 'button', entity: 'light.ceiling_lights' }, at: 'corner', find: 'tag:div.bubble-button-background', want: 'Background & card surface', open: 'cms-background-module' },
    // Slider fill → Accent is unit-tested only: the fill is the same size as the (transparent) button
    // background drawn over it, so the geometric hit-test never returns the fill (measured live).
    { cfg: { type: 'custom:bubble-card', card_type: 'separator', name: 'Sep', icon: 'mdi:home' }, find: 'tag:h4.bubble-name', want: 'Font', open: 'cms-font-module' },
    { cfg: { type: 'custom:bubble-card', card_type: 'cover', entity: 'cover.kitchen_window' }, at: 'corner', find: 'tag:div.bubble-background', want: 'Background & card surface', open: 'cms-background-module' },
    { cfg: { type: 'picture-glance', entities: ['light.ceiling_lights'], image: 'https://demo.home-assistant.io/stub_config/bedroom.png', title: 'Bedroom' }, find: 'tag:div.title', words: true, want: 'Font' },
  ];
  const matrixOut = await page.evaluate(async (cases) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const results = [];
    for (const { cfg, find, want, open, at, words, beside } of cases) {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:900px;background:#111;z-index:2147483647;';
      document.querySelector('home-assistant').shadowRoot.appendChild(host);
      const panel = document.createElement('cms-panel');
      panel.hass = document.querySelector('home-assistant').hass;
      panel.config = cfg;
      host.appendChild(panel);
      await panel.updateComplete;

      // find the target element in the composed tree (retry while rendering)
      const [mode, spec] = find.split(':');
      const matches = (n) => {
        if (mode === 'span-with-text') return n.tagName === 'SPAN' && n.textContent.trim() === spec;
        const [tag, cls] = spec.split('.');
        if (n.tagName.toLowerCase() !== tag) return false;
        return !cls || n.classList.contains(cls);
      };
      let target = null;
      for (let i = 0; i < 20 && !target; i++) {
        await sleep(300);
        // Re-assign hass each retry: since HA 2026.8 some cards forward
        // hass to child elements (sensor's graph header-footer) only on
        // hass UPDATES — a one-shot assignment leaves them un-hydrated,
        // which never happens on a live dashboard.
        panel.hass = { ...document.querySelector('home-assistant').hass };
        const card = panel.shadowRoot?.querySelector('hui-card');
        if (!card) continue;
        const stack = [card];
        while (stack.length) {
          const n = stack.pop();
          if (matches(n)) { target = n; break; }
          if (n.shadowRoot) stack.push(...n.shadowRoot.children);
          if (n.children) stack.push(...n.children);
        }
      }
      const picker = panel.shadowRoot?.querySelector('cms-preview-picker');
      // Text parts (words: true) only read as Font over the words themselves
      // (the element is often wider than its text), so probe the middle of the
      // text's own box, not of the element.
      const probeRect = (t) => {
        if (!words) return t.getBoundingClientRect();
        const rg = document.createRange();
        rg.selectNodeContents(t);
        const w = [...rg.getClientRects()].find((q) => q.width > 0 && q.height > 0);
        return w || t.getBoundingClientRect();
      };
      let label = null;
      if (target && picker) {
        const r = probeRect(target);
        // 'ring' targets are annular — probe the bottom-center of the rect
        // (the exposed bottom arc): the sides/top of the ring sit behind the
        // dial's transparent div.info text block, which rightly wins there.
        // 'corner' / 'top': the box's own padding, clear of the text/icon sitting on it
        const x = at === 'corner' ? r.left + 3 : at === 'top' ? r.left + r.width * 0.6 : r.left + r.width / 2;
        const y = at === 'corner' || at === 'top' ? r.top + 3 : mode === 'ring' ? r.bottom - 8 : r.top + r.height / 2;
        label = picker._updateFromPoint(x, y)?.label ?? null;
      }
      let opened = null;
      if (open && target && picker) {
        const r = probeRect(target);
        const ov = picker.shadowRoot.querySelector('.overlay');
        const cx = at === 'corner' ? r.left + 3 : at === 'top' ? r.left + r.width * 0.6 : r.left + r.width / 2, cy = at === 'corner' || at === 'top' ? r.top + 3 : r.top + r.height / 2;
        ov.dispatchEvent(new MouseEvent('mousemove', { clientX: cx, clientY: cy, bubbles: true, composed: true }));
        ov.dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true, composed: true }));
        await sleep(900);
        opened = panel.shadowRoot.querySelector(open)?._open === true ? open : 'none';
      }
      // Blank space inside the element but beside its words is the card
      // surface, not Font (only when the element is wider than its words).
      let besideLabel = null;
      if (beside && target && picker) {
        const el = target.getBoundingClientRect();
        const wr = probeRect(target);
        if (el.right - wr.right > 12) besideLabel = picker._updateFromPoint(el.right - 4, wr.top + wr.height / 2)?.label ?? null;
        else besideLabel = beside; // element is not wider than its words here; nothing to probe
      }
      results.push({ type: cfg.card_type ? `${cfg.type}/${cfg.card_type}` : cfg.type, found: !!target, label, want, ...(open ? { open, opened } : {}), ...(beside ? { beside, besideLabel } : {}) });
      host.remove();
    }
    return results;
  }, MATRIX);
  for (const m of matrixOut) {
    record(`coverage: ${m.type} → ${m.want}${m.open ? ' (click opens ' + m.open + ')' : ''}`, m.found && m.label === m.want && (!m.open || m.opened === m.open) && (!m.beside || m.besideLabel === m.beside), JSON.stringify(m));
  }

  await page.screenshot({ path: resolve(SHOTS, 'preview-picker-01.png') });
  await browser.close();
  finish(writeFileSync, resolve, HERE, 'preview-picker-check.json', results);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

// Module-effect audit: for EVERY card type, does each module the Studio
// SHOWS actually change something on that card — and does any module it
// HIDES secretly work?
//
// For each card type it mounts the real cms-panel (as the card editor would),
// reads which modules the panel renders, then switches each module on — shown
// and hidden alike — with a distinctive setting, through the panel's own
// state → generator → config path. The panel's live preview (a real
// <hui-card> styled by the installed engine) is snapshotted before and after:
// a pixel comparison of the rendered card (the verdict: does anything you can
// SEE change?) plus, for diagnosis, every element's computed style through
// every shadow root. Pixels that change on their own (graphs, clocks) are
// masked out first. A module that changes no pixel is "dead".
//
//   shown + effect   ✅   working control
//   shown + no effect ❌  DEAD CONTROL (should be hidden or fixed)
//   hidden + effect   ⚠️  missed opportunity (worth a look)
//   hidden + none     ·    correctly hidden
//
// Threshold Colors is tested once per "Apply to" property the module offers
// on that card (each property is its own control).
//
//   HA_URL=… TOKENS_FILE=… STYLE_KEY=card_mod|uix node module_effect_audit.mjs
//   → module-effect-audit-<engine>-<haVersion>.json + .md
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, isAbsolute } from 'node:path';
import { waitForHassReady } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tf = process.env.TOKENS_FILE || 'tokens.json';
const tokens = JSON.parse(readFileSync(isAbsolute(tf) ? tf : resolve(HERE, tf), 'utf8'));
const ONLY = (process.env.AUDIT_CARDS || '').split(',').filter(Boolean);

const L = 'light.ceiling_lights';
const T = 'sensor.outside_temperature';
const IMG = '/static/icons/favicon-192x192.png';
// Every built-in card type that renders in the sandbox (containers are
// covered separately: they show no card-level modules at all).
const CARDS = {
  'alarm-panel': { entity: 'alarm_control_panel.security' },
  area: { area: 'living_room' },
  button: { entity: L },
  calendar: { entities: ['calendar.calendar_1'] },
  entities: { entities: [L, T] },
  entity: { entity: T },
  gauge: { entity: T, min: 0, max: 40 },
  glance: { entities: [L, 'switch.decorative_lights'] },
  heading: { heading: 'My Heading', icon: 'mdi:home' },
  'history-graph': { entities: [T] },
  humidifier: { entity: 'humidifier.humidifier' },
  iframe: { url: 'https://www.home-assistant.io', aspect_ratio: '50%' },
  light: { entity: L },
  logbook: { target: { entity_id: [L] } },
  map: { entities: ['device_tracker.demo_paulus'] },
  markdown: { content: 'Hello **world**' },
  'media-control': { entity: 'media_player.living_room' },
  picture: { image: IMG },
  'picture-elements': { image: IMG, elements: [{ type: 'state-icon', entity: L, style: { top: '50%', left: '50%' } }] },
  'picture-entity': { entity: 'camera.demo_camera' },
  'picture-glance': { camera_image: 'camera.demo_camera', entities: [L] },
  sensor: { entity: T, graph: 'line' },
  statistic: { entity: T, stat_type: 'mean', period: { calendar: { period: 'day' } } },
  'statistics-graph': { entities: [T], chart_type: 'line' },
  thermostat: { entity: 'climate.heatpump' },
  tile: { entity: L },
  'todo-list': { entity: 'todo.shopping_list' },
  'weather-forecast': { entity: 'weather.demo_weather_south', show_forecast: true },
  'entity-filter': { entities: [L, 'switch.decorative_lights'], state_filter: ['on'] },
  'vertical-stack': { cards: [{ type: 'tile', entity: L }] },
  grid: { cards: [{ type: 'tile', entity: L }] },
};

const RED = '#ee1111';
const GREEN = '#11ee11';
// One distinctive setting per module (state slice merged over the defaults).
const MODULES = {
  'cms-font-module': (s) => ({ font: { ...s.font, enabled: true, fontSize: 23, fontWeight: 'bold', fontFamily: 'monospace' } }),
  'cms-filter-module': (s) => ({ filter: { ...s.filter, enabled: true, grayscale: true, grayscaleWhen: 'always', brightness: 60, blur: 3 } }),
  'cms-accent-color-module': (s) => ({ accentColor: { ...s.accentColor, enabled: true, mode: 'plain', color: RED } }),
  'cms-icon-color-module': (s) => ({ iconColor: { ...s.iconColor, enabled: true, mode: 'plain', color: RED } }),
  'cms-background-module': (s) => ({ background: { ...s.background, enabled: true, type: 'solid', color1: '#112244', applyWhen: 'always' } }),
  'cms-animation-module': (s) => ({ animation: { ...s.animation, enabled: true, preset: 'pulse', trigger: 'always' } }),
  'cms-border-module': (s) => ({ border: { ...s.border, enabled: true, radiusPx: 28, borderWidth: 4, borderColor: GREEN } }),
  'cms-heading-style-module': (s) => ({ headingStyle: { ...s.headingStyle, enabled: true, fontSize: 33, textColor: RED, iconColor: RED, iconSize: 40, fontWeight: 'bold' } }),
};
const THRESHOLD_PROPS = ['icon-color', 'accent-color', 'background', 'text-color', 'border-color'];
const threshold = (s, prop, entity) => ({
  threshold: {
    ...s.threshold, enabled: true, entityId: entity, attribute: '', properties: [prop], valueMode: 'switch',
    rules: [{ id: 'r0', operator: '>', value: -1000000, color: RED }], defaultColor: GREEN, borderWidth: 4,
  },
});

/** Changed pixels needed to call an effect visible (anti-aliasing noise). */
const PX_MIN = 30;
let measurePx = async () => 0;
let setPxBase = async () => {};
const atobCount = (b64) => { const s = Buffer.from(b64, 'base64'); let n = 0; for (const v of s) if (v) n++; return n; };

const PROPS = ['color', 'background-color', 'background-image', 'fill', 'stroke', 'font-size', 'font-weight', 'font-family',
  'filter', 'border-top-width', 'border-top-color', 'border-top-left-radius', 'animation-name', 'width', 'height', 'opacity'];

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await waitForHassReady(page);
  await page.waitForFunction(() => !!customElements.get('cms-panel') && !!customElements.get('hui-card'), null, { timeout: 30000 });
  await page.waitForFunction(() => !!(customElements.get('card-mod') || customElements.get('uix-node')), null, { timeout: 30000 });
  const meta = await page.evaluate(() => ({
    version: document.querySelector('home-assistant').hass.config.version,
    engine: customElements.get('uix-node') ? 'uix' : 'card-mod',
  }));
  await page.waitForTimeout(2500);

  await page.evaluate((PROPS) => {
    const deep = (root) => { const out = []; const st = [[root, 'r']];
      while (st.length) { const [n, p] = st.pop(); if (n.nodeType === 1) out.push([n, p]);
        const kids = [...(n.shadowRoot ? n.shadowRoot.children : []), ...(n.children || [])];
        kids.forEach((k, i) => st.push([k, `${p}/${k.tagName ? k.tagName.toLowerCase() : '#'}${i}`])); }
      return out; };
    window.__audit = {
      host: null,
      async mount(config) {
        const hass = document.querySelector('home-assistant').hass;
        let host = document.getElementById('audit-host');
        if (!host) {
          host = document.createElement('div'); host.id = 'audit-host';
          host.style.cssText = 'position:fixed;left:0;top:0;width:1100px;height:900px;z-index:2147483647;background:var(--card-background-color,#fff);';
          // inside home-assistant's shadow root so HA's theme variables apply
          (document.querySelector('home-assistant').shadowRoot || document.body).appendChild(host);
        }
        host.innerHTML = '';
        const panel = document.createElement('cms-panel');
        panel.hass = hass; panel.config = config; host.appendChild(panel);
        this.panel = panel;
        await panel.updateComplete; await new Promise((r) => setTimeout(r, 600));
        return [...panel.shadowRoot.querySelectorAll('*')].map((e) => e.tagName.toLowerCase()).filter((t) => /^cms-.*-module$/.test(t));
      },
      preview() { return this.panel.shadowRoot.querySelector('.preview-card-wrapper hui-card'); },
      snap() {
        const c = this.preview(); if (!c) return null;
        const m = {};
        for (const [el, path] of deep(c)) { const cs = getComputedStyle(el); m[path] = PROPS.map((p) => cs.getPropertyValue(p)).join('|'); }
        return m;
      },
      async apply(slice) {
        const p = this.panel;
        p._studioState = { ...p._studioState, ...slice };
        p._emitConfigChanged();
        await p.updateComplete;
      },
      async thresholdOptions() {
        // What a user sees once the module is on: the options list always
        // keeps an already-ticked property, and the untouched default is
        // icon-color — so read it with nothing ticked.
        const m = this.panel.shadowRoot.querySelector('cms-threshold-module');
        if (!m?._propertyOptions) return [];
        const prev = m.state;
        m.state = { ...prev, properties: [] };
        const opts = m._propertyOptions().map((o) => o.value);
        m.state = prev;
        return opts;
      },
      rect() {
        const w = this.panel.shadowRoot.querySelector('.preview-card-wrapper');
        const r = w.getBoundingClientRect();
        return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(r.width, innerWidth - r.left), height: Math.min(r.height, innerHeight - r.top) };
      },
      async pixels(b64) {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, c.width, c.height).data;
      },
      // changed-pixel count between two PNGs, ignoring pixels in `mask`
      async pxdiff(a, b, maskB64) {
        const A = await this.pixels(a); const B = await this.pixels(b);
        if (A.length !== B.length) return { n: 999999, mask: null };
        const M = maskB64 ? Uint8Array.from(atob(maskB64), (ch) => ch.charCodeAt(0)) : null;
        let n = 0; const out = new Uint8Array(A.length / 4);
        for (let i = 0, p = 0; i < A.length; i += 4, p++) {
          const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
          if (d > 40) { out[p] = 1; if (!M || !M[p]) n++; }
        }
        let bin = ''; for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i] | (M ? M[i] : 0));
        return { n, mask: btoa(bin) };
      },
      state() { return JSON.parse(JSON.stringify(this.panel._studioState)); },
      emitted() { return JSON.parse(JSON.stringify(this.panel._previewConfig || null)); },
    };
  }, PROPS);

  // Elements that change on their own (graphs, clocks, maps) are measured
  // first with nothing applied and ignored afterwards.
  let noisy = new Set();
  const diff = (a, b) => {
    if (!a || !b) return -1;
    let n = 0;
    for (const k of Object.keys(b)) if (k in a && a[k] !== b[k] && !noisy.has(k)) n++;
    return n;
  };
  // Poll until the preview differs from baseline (engines apply async).
  let lastDetail = [];
  const measure = async (base) => {
    let d = 0;
    lastDetail = [];
    for (let i = 0; i < 14; i++) {
      await page.waitForTimeout(350);
      const now = await page.evaluate(() => window.__audit.snap());
      d = diff(base, now);
      if (d > 0) {
        for (const k of Object.keys(now)) {
          if (!(k in base) || base[k] === now[k] || noisy.has(k)) continue;
          const a = base[k].split('|'); const b = now[k].split('|');
          const props = PROPS.filter((_, j) => a[j] !== b[j]).map((pp) => `${pp}: ${a[PROPS.indexOf(pp)]} → ${b[PROPS.indexOf(pp)]}`);
          lastDetail.push(`${k.split('/').slice(-3).join('/')} {${props.join('; ')}}`);
          if (lastDetail.length >= 4) break;
        }
        return d;
      }
    }
    return d;
  };

  const results = [];
  for (const [type, extra] of Object.entries(CARDS)) {
    if (ONLY.length && !ONLY.includes(type)) continue;
    const config = { type, ...extra };
    const entity = extra.entity || (Array.isArray(extra.entities) ? extra.entities[0] : null) || T;
    const row = { type, shown: [], tests: [] };
    try {
      row.shown = await page.evaluate((c) => window.__audit.mount(c), config);
      await page.waitForTimeout(1500);
      const base = await page.evaluate(() => window.__audit.snap());
      noisy = new Set();
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(500);
        const again = await page.evaluate(() => window.__audit.snap());
        if (base && again) for (const k of Object.keys(again)) if (base[k] !== again[k]) noisy.add(k);
      }
      row.noisy = noisy.size;
      const clip = await page.evaluate(() => window.__audit.rect());
      const shot = async () => (await page.screenshot({ clip })).toString('base64');
      let pxBase = await shot();
      const pxBase0 = pxBase;
      setPxBase = async (b) => { pxBase = b ?? await shot(); };
      let pxMask = null;
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(400);
        const r = await page.evaluate(([a, b, m]) => window.__audit.pxdiff(a, b, m), [pxBase, await shot(), pxMask]);
        pxMask = r.mask;
      }
      row.pxNoise = pxMask ? atobCount(pxMask) : 0;
      measurePx = async () => {
        let best = 0;
        for (let i = 0; i < 8; i++) {
          await page.waitForTimeout(300);
          const r = await page.evaluate(([a, b, m]) => window.__audit.pxdiff(a, b, m), [pxBase, await shot(), pxMask]);
          best = Math.max(best, r.n);
          if (best > PX_MIN) break;
        }
        return best;
      };
      if (!base) { row.error = 'preview did not render'; results.push(row); console.log(type, 'NO PREVIEW'); continue; }
      const thrOffered = row.shown.includes('cms-threshold-module') ? await page.evaluate(() => window.__audit.thresholdOptions()) : [];
      row.thresholdOffers = thrOffered;
      const initial = await page.evaluate(() => window.__audit.state());
      const cases = [
        ...Object.entries(MODULES).map(([mod, f]) => ({ mod, label: mod.replace(/^cms-|-module$/g, ''), slice: f(initial), shown: row.shown.includes(mod) })),
        ...THRESHOLD_PROPS.map((p) => ({ mod: 'cms-threshold-module', label: `threshold:${p}`, slice: threshold(initial, p, entity), shown: row.shown.includes('cms-threshold-module') && thrOffered.includes(p) })),
        // Font's colour picker on its own: Font already on at defaults, then only the colour changes.
        { mod: 'cms-font-module', label: 'font:color', pre: { font: { ...initial.font, enabled: true } }, slice: { font: { ...initial.font, enabled: true, color: RED } }, shown: row.shown.includes('cms-font-module') },
      ];
      for (const c of cases) {
        let cBase = base;
        if (c.pre) {
          await page.evaluate((s) => window.__audit.apply(s), c.pre);
          await page.waitForTimeout(2500);
          cBase = await page.evaluate(() => window.__audit.snap());
          await setPxBase();
        }
        await page.evaluate((s) => window.__audit.apply(s), c.slice);
        const changed = await measure(cBase);
        const px = await measurePx();
        if (c.pre) await setPxBase(pxBase0);
        const style = await page.evaluate((k) => { const e = window.__audit.emitted(); const s = e?.[k]?.style; return typeof s === 'string' ? s : JSON.stringify(s ?? ''); }, process.env.STYLE_KEY === 'uix' ? 'uix' : 'card_mod');
        row.tests.push({ label: c.label, shown: c.shown, changed, px, visible: px > PX_MIN, emitted: !!style && style !== '""', detail: lastDetail });
        // reset to the untouched state, and wait for the preview to settle back
        await page.evaluate((s) => window.__audit.apply(s), initial);
        for (let i = 0; i < 10; i++) { await page.waitForTimeout(250); if (diff(base, await page.evaluate(() => window.__audit.snap())) === 0) break; }
      }
    } catch (e) {
      row.error = String(e.message || e).slice(0, 200);
    }
    results.push(row);
    const verdicts = row.tests.map((t) => `${t.label}:${t.shown ? (t.visible ? '✅' : '❌') : (t.visible ? '⚠️' : '·')}`);
    console.log(type.padEnd(17), row.error ? `ERROR ${row.error}` : verdicts.join(' '));
  }

  await browser.close();
  const dead = results.flatMap((r) => r.tests.filter((t) => t.shown && !t.visible).map((t) => `${r.type} › ${t.label}`));
  const missed = results.flatMap((r) => r.tests.filter((t) => !t.shown && t.visible).map((t) => `${r.type} › ${t.label}`));
  const tag = `${meta.engine}-${meta.version}`;
  writeFileSync(resolve(HERE, `module-effect-audit-${tag}.json`), JSON.stringify({ meta, results, dead, missed }, null, 2));
  const md = [`# Module effect audit — ${meta.engine} on HA ${meta.version}`, '',
    '✅ shown + works · ❌ shown but changes nothing (dead) · ⚠️ hidden but would work · `·` hidden, no effect', '',
    `| card | ${(results.find((r) => r.tests.length)?.tests ?? []).map((t) => t.label.replace('threshold:', 'thr:')).join(' | ')} |`,
    `|---|${(results.find((r) => r.tests.length)?.tests ?? []).map(() => '---').join('|')}|`,
    ...results.map((r) => `| ${r.type} | ${r.error ? `error: ${r.error}` : r.tests.map((t) => (t.shown ? (t.visible ? '✅' : '❌') : (t.visible ? '⚠️' : '·'))).join(' | ')} |`),
    '', `**Dead controls (${dead.length}):** ${dead.join(', ') || 'none'}`, '', `**Hidden but working (${missed.length}):** ${missed.join(', ') || 'none'}`];
  writeFileSync(resolve(HERE, `module-effect-audit-${tag}.md`), md.join('\n') + '\n');
  console.log(`\nDEAD (${dead.length}): ${dead.join(', ') || 'none'}\nHIDDEN-BUT-WORKS (${missed.length}): ${missed.join(', ') || 'none'}`);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

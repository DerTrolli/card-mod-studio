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
//   shown, effect inside a noisy card's floor ❔  inconclusive (see NOISE FLOOR below)
//   hidden + effect   ⚠️  missed opportunity (worth a look)
//   hidden + none     ·    correctly hidden
//
// Threshold Colors is tested once per "Apply to" property the module offers
// on that card (each property is its own control).
//
// Icon Color is audited as the two controls the panel can offer: its colour
// (only where `allowColor`) and its size (only where `allowSize`, tested on top
// of a colour already applied) — a size-only card (Mushroom chips) gets only
// the size test, like Font's colour/size pair.
//
//   HA_URL=… TOKENS_FILE=… STYLE_KEY=card_mod|uix node module_effect_audit.mjs
//   → module-effect-audit-<engine>-<haVersion>.json + .md
//
// AUDIT_CUSTOM=1   audit the custom-card profiles instead of the built-ins:
//                  all 18 registered Mushroom types (14 state cards, template,
//                  chips, title, empty) and the 4 Bubble profile kinds (button,
//                  button+slider, separator, cover), entities taken from
//                  hass.states. Writes module-effect-audit-custom-….json/.md.
// AUDIT_CUSTOM=all the built-ins AND the custom cards in one run (same files
//                  as the built-in audit).
// Mushroom 5.x and Bubble Card 3.x must be installed on the rig.
//
// NOISE FLOOR: a card can change pixels on its own (the demo camera swaps its picture every few seconds, a canvas
// chart redraws). Around EVERY test the audit therefore screenshots the UNSTYLED card twice - right before the module is
// switched on and again after it is switched back off - and the difference of those two (the card against itself over the
// test's duration, known-moving pixels masked) is that test's noise floor. A test during which the card changed on its own
// (floor > 30 px) is repeated, up to 3 attempts. An effect only counts as visible when its changed-pixel count clearly
// exceeds the floor: px > 30 + 2 x floor (a static card, floor 0, keeps the old "> 30" gate). The per-card floor in the
// output is the largest floor of its tests. A shown module that stays inside a persistently noisy card's floor is not called
// dead when the computed style of some element did change - it is listed as INCONCLUSIVE (pixels cannot tell); DEAD still
// means "shown, and no pixel clearly changes".
// A 2.5 px ring along the card's rounded outline is ignored when counting pixels: with an opaque picture filling the card
// a background colour still bleeds through the anti-aliased edge (a ~1 px fringe, ~1200 px) - that is not a visible effect.
// MEDIA-CONTROL: the card draws its own colour block (and the artwork) over its whole face in every player state, so the
// audit tests it twice: the row `media-control` uses the demo player while it plays (every media-control test), and the row
// `media-control (off)` runs ONLY the two Background controls (background, threshold:background) against a player that is
// switched OFF for the duration of the row (media_player.kitchen: turn_off, switched back on afterwards) - the state in
// which a Background could have shown; the other media-control tests stay on the playing player. A
// Background control that is dead in BOTH rows (as measured: red pixels on the card face in off, unavailable, idle, paused
// and playing) is correctly hidden by the panel. The report (.md) carries the same note under the table.
// AUDIT_CARDS=media-control,media-control (off)   runs only those two rows (any card types, comma separated).
// CANVAS CHARTS: the history graph draws its line on a canvas from `--graph-color-1`, so when only the colour changes no
// element's plain computed style differs. The snapshot therefore also records the custom properties set on every ha-card
// (key `…#vars`); on a persistently noisy card such a change makes the control INCONCLUSIVE (the variable reached the card,
// pixels cannot decide) instead of DEAD. A static card is still judged by pixels alone.
// FONT WEIGHT: the test value is chosen against the card's own text weight (read from the unstyled preview, recorded as
// `nativeWeight` per row): Normal when the text is natively 550 or heavier (Mushroom chips are 700, Bubble's separator
// name 600 - "Bold" would change no pixel there), otherwise Bold. A card where neither end changes a pixel is still DEAD.
// AUDIT_BUNDLE=/path/card-mod-studio.js   audit that build instead of the one the rig serves (a local `vite build` output).
// AUDIT_TAG=name   adds -name to the output file names (keeps the committed result files untouched).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, isAbsolute } from 'node:path';
import { waitForHassReady } from './harness-utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tf = process.env.TOKENS_FILE || 'tokens.json';
const tokens = JSON.parse(readFileSync(isAbsolute(tf) ? tf : resolve(HERE, tf), 'utf8'));
const ONLY = (process.env.AUDIT_CARDS || '').split(',').filter(Boolean);

// the opaque picture must be served from the rig's www/ (/local/…)
async function ensureImageFixture() {
  const served = async () => { try { const r = await fetch(`${HA}/local/${IMG_FILE}`); return r.ok && /image\//.test(r.headers.get('content-type') || ''); } catch { return false; } };
  if (await served()) return;
  const dir = process.env.AUDIT_WWW_DIR || resolve(HERE, '../config/www');
  mkdirSync(dir, { recursive: true });
  copyFileSync(resolve(HERE, 'fixtures', IMG_FILE), resolve(dir, IMG_FILE));
  for (let i = 0; i < 10; i++) { if (await served()) return; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`${HA}/local/${IMG_FILE} is not served after copying the fixture to ${dir} - set AUDIT_WWW_DIR to the rig's config/www folder`);
}

const L = 'light.ceiling_lights';
const T = 'sensor.outside_temperature';
// An OPAQUE test image for the picture family (the old test image was a transparent favicon, so a background showed
// THROUGH the picture and looked like an effect). The fixture ships in fixtures/ and is served from the rig's www/
// (copied there when missing; AUDIT_WWW_DIR overrides the target folder, default ../config/www next to the harness).
const IMG_FILE = 'audit-opaque.png';
const IMG = `/local/${IMG_FILE}`;
// Every built-in card type that renders in the sandbox (containers are
// covered separately: they show no card-level modules at all). Cards that
// can carry a title get one, as real ones usually do — on chart/list cards
// it's often the only HTML text (graph labels are canvas-drawn).
const CARDS = {
  'alarm-panel': { entity: 'alarm_control_panel.security' },
  area: { area: 'living_room' },
  button: { entity: L },
  calendar: { title: 'Calendar', entities: ['calendar.calendar_1'] },
  entities: { entities: [L, T] },
  entity: { entity: T },
  gauge: { entity: T, min: 0, max: 40 },
  glance: { title: 'Glance', entities: [L, 'switch.decorative_lights'] },
  heading: { heading: 'My Heading', icon: 'mdi:home' },
  'history-graph': { title: 'History', entities: [T] },
  humidifier: { entity: 'humidifier.humidifier' },
  iframe: { url: 'https://www.home-assistant.io', aspect_ratio: '50%' },
  light: { entity: L },
  logbook: { title: 'Logbook', target: { entity_id: [L] } },
  map: { entities: ['device_tracker.demo_paulus'] },
  markdown: { content: 'Hello **world**' },
  'media-control': { entity: 'media_player.living_room' },
  // the same card against a player that is switched off for the row (see MEDIA-CONTROL in the header)
  'media-control (off)': { _type: 'media-control', entity: 'media_player.kitchen', _playerOff: true, _onlyLabels: ['background', 'threshold:background'] },
  picture: { image: IMG },
  // an icon AND a text element: with an icon alone there is no text for the Font module's weight / family to style
  'picture-elements': { image: IMG, elements: [{ type: 'state-icon', entity: L, style: { top: '50%', left: '50%' } }, { type: 'state-label', entity: T, style: { top: '80%', left: '50%' } }] },
  'picture-entity': { entity: 'camera.demo_camera' },
  'picture-glance': { title: 'Garden', camera_image: 'camera.demo_camera', entities: [L] },
  sensor: { entity: T, graph: 'line' },
  statistic: { entity: T, stat_type: 'mean', period: { calendar: { period: 'day' } } },
  'statistics-graph': { title: 'Statistics', entities: [T], chart_type: 'line' },
  thermostat: { entity: 'climate.heatpump' },
  tile: { entity: L },
  'todo-list': { title: 'To-do', entity: 'todo.shopping_list' },
  'weather-forecast': { entity: 'weather.demo_weather_south', show_forecast: true },
  'entity-filter': { entities: [L, 'switch.decorative_lights'], state_filter: ['on'] },
  'vertical-stack': { cards: [{ type: 'tile', entity: L }] },
  grid: { cards: [{ type: 'tile', entity: L }] },
};
// AUDIT_EXTRA_CARDS='{"custom:mushroom-entity-card":{"entity":"light.ceiling_lights"}}'
// adds card configs (e.g. custom cards installed on the rig) to the sweep.
if (process.env.AUDIT_EXTRA_CARDS) Object.assign(CARDS, JSON.parse(process.env.AUDIT_EXTRA_CARDS));

// Custom-card configs (AUDIT_CUSTOM). `_type` is the card's real `type:`; the
// map key names the audit row. Entities come from hass.states (first match of
// the preferred ids, else the first of the domain), so the same list runs on
// every rig. `_entity` is the entity Threshold is pointed at.
const MUSHROOM_CLASSIC = {
  'alarm-control-panel': ['alarm_control_panel', []], climate: ['climate', ['climate.heatpump']],
  cover: ['cover', ['cover.kitchen_window']], entity: ['light', ['light.ceiling_lights']],
  fan: ['fan', ['fan.living_room_fan']], humidifier: ['humidifier', ['humidifier.humidifier']],
  light: ['light', ['light.ceiling_lights']], lock: ['lock', ['lock.front_door']],
  'media-player': ['media_player', ['media_player.living_room']], number: ['number', ['number.volume']],
  person: ['person', []], select: ['select', []], update: ['update', []], vacuum: ['vacuum', []],
};
function customCards(states) {
  // `states` = { entity_id: state }. Prefer the named entity, but never an
  // inactive one while an active one exists: Mushroom's Accent colours the
  // ACTIVE look (off/unavailable read --rgb-disabled), so on an `off` fan it
  // would rightly show no change.
  const ids = Object.keys(states);
  const idle = (e) => ['off', 'unavailable', 'unknown', 'docked'].includes(states[e]);
  const pick = (domain, prefer = []) => {
    const pool = ids.filter((e) => e.startsWith(domain + '.'));
    const named = prefer.filter((e) => pool.includes(e));
    return [...named, ...pool].find((e) => !idle(e)) ?? named[0] ?? pool[0];
  };
  const light = pick('light', ['light.ceiling_lights']);
  const cards = {};
  for (const [t, [domain, prefer]] of Object.entries(MUSHROOM_CLASSIC)) {
    const entity = pick(domain, prefer);
    // secondary info on, so the secondary text (and its font variables) is on screen
    cards[`custom:mushroom-${t}-card`] = { _entity: entity, entity, ...(t === 'entity' || t === 'select' ? { secondary_info: 'state' } : {}) };
  }
  cards['custom:mushroom-template-card'] = { _entity: light, entity: light, primary: 'Primary', secondary: 'Secondary', icon: 'mdi:home' };
  cards['custom:mushroom-chips-card'] = { _entity: light, chips: [{ type: 'entity', entity: light }, { type: 'template', content: 'chip', icon: 'mdi:home' }] };
  cards['custom:mushroom-title-card'] = { _entity: light, title: 'Title', subtitle: 'Subtitle' };
  cards['custom:mushroom-empty-card'] = { _entity: light };
  const cover = pick('cover', ['cover.kitchen_window']);
  cards['custom:bubble-card/button'] = { _type: 'custom:bubble-card', _entity: light, card_type: 'button', entity: light, show_state: true };
  cards['custom:bubble-card/button/slider'] = { _type: 'custom:bubble-card', _entity: light, card_type: 'button', button_type: 'slider', entity: light, show_state: true };
  cards['custom:bubble-card/separator'] = { _type: 'custom:bubble-card', _entity: light, card_type: 'separator', name: 'Separator', icon: 'mdi:home' };
  cards['custom:bubble-card/cover'] = { _type: 'custom:bubble-card', _entity: cover, card_type: 'cover', entity: cover, show_state: true };
  return cards;
}
const AUDIT_CUSTOM = process.env.AUDIT_CUSTOM || '';

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
let pxd = async () => ({ n: 0 });
let setPxBase = async () => {};
const atobCount = (b64) => { const s = Buffer.from(b64, 'base64'); let n = 0; for (const v of s) if (v) n++; return n; };

const PROPS = ['color', 'background-color', 'background-image', 'fill', 'stroke', 'font-size', 'font-weight', 'font-family',
  'filter', 'border-top-width', 'border-top-color', 'border-top-left-radius', 'animation-name', 'width', 'height', 'opacity'];

const run = async () => {
  await ensureImageFixture();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  if (process.env.AUDIT_BUNDLE) await page.route('**/local/card-mod-studio.js*', (r) => r.fulfill({ path: process.env.AUDIT_BUNDLE, contentType: 'application/javascript' }));
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
        let host = window.__cmsFind('#audit-host');
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
        for (const [el, path] of deep(c)) {
          const cs = getComputedStyle(el); m[path] = PROPS.map((p) => cs.getPropertyValue(p)).join('|');
          // the card's own custom properties (--graph-color-1 …): a canvas chart draws from them, so no element's
          // plain computed style changes when they do; they show that the variable reached the card
          if (el.tagName === 'HA-CARD') { const v = []; for (let i = 0; i < cs.length; i++) if (cs[i].startsWith('--')) v.push(cs[i] + ':' + cs.getPropertyValue(cs[i])); m[path + '#vars'] = v.sort().join(';'); }
        }
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
      // the card's rounded outline in screenshot coordinates (for the ignored edge ring)
      geom() {
        const w = this.panel.shadowRoot.querySelector('.preview-card-wrapper');
        const c = this.preview(); if (!w || !c) return null;
        const clip = this.rect();
        const el = c.firstElementChild?.shadowRoot?.querySelector('ha-card') || c;
        const r = el.getBoundingClientRect();
        const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
        return { x: r.left - clip.x, y: r.top - clip.y, w: r.width, h: r.height, r: Math.min(rad, r.width / 2, r.height / 2), W: clip.width };
      },
      async pxdiff(a, b, maskB64, geom) {
        const A = await this.pixels(a); const B = await this.pixels(b);
        if (A.length !== B.length) return { n: 999999, mask: null };
        const M = maskB64 ? Uint8Array.from(atob(maskB64), (ch) => ch.charCodeAt(0)) : null;
        const RING = 2.5;
        const width = geom ? geom.W : 0;
        const edge = (p) => {
          if (!geom) return false;
          const px = (p % width) + 0.5 - (geom.x + geom.w / 2), py = Math.floor(p / width) + 0.5 - (geom.y + geom.h / 2);
          const qx = Math.abs(px) - (geom.w / 2 - geom.r), qy = Math.abs(py) - (geom.h / 2 - geom.r);
          return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - geom.r > -RING;
        };
        let n = 0; const out = new Uint8Array(A.length / 4);
        for (let i = 0, p = 0; i < A.length; i += 4, p++) {
          const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
          if (d > 40) { out[p] = 1; if ((!M || !M[p]) && !edge(p)) n++; }
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
          if (k.endsWith('#vars')) { lastDetail.push(`${k.split('/').slice(-2).join('/')} {custom properties changed}`); if (lastDetail.length >= 4) break; continue; }
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
  const readStates = () => page.evaluate(() => Object.fromEntries(Object.entries(document.querySelector('home-assistant').hass.states).map(([k, v]) => [k, v.state])));
  let states = AUDIT_CUSTOM ? await readStates() : {};
  // A demo rig can have every fan off / every vacuum docked: start one so the
  // card has an active look to colour (Accent colours the active look only).
  if (AUDIT_CUSTOM) {
    let started = false;
    for (const [domain, service, idleStates] of [['fan', 'turn_on', ['off']], ['vacuum', 'start', ['docked']]]) {
      const ids = Object.keys(states).filter((k) => k.startsWith(domain + '.'));
      if (ids.length && ids.every((k) => idleStates.includes(states[k]) || ['unavailable', 'unknown'].includes(states[k]))) {
        await page.evaluate(([d, sv, id]) => document.querySelector('home-assistant').hass.callService(d, sv, { entity_id: id }), [domain, service, ids[0]]);
        started = true;
      }
    }
    if (started) { await page.waitForTimeout(1500); states = await readStates(); }
  }
  const custom = AUDIT_CUSTOM ? customCards(states) : {};
  const sweep = AUDIT_CUSTOM === 'all' ? { ...CARDS, ...custom } : AUDIT_CUSTOM ? custom : CARDS;
  for (const [type, spec] of Object.entries(sweep)) {
    if (ONLY.length && !ONLY.includes(type)) continue;
    const { _type, _entity, _playerOff, _onlyLabels, ...extra } = spec;
    const config = { type: _type ?? type, ...extra };
    const entity = _entity || extra.entity || (Array.isArray(extra.entities) ? extra.entities[0] : null) || T;
    const row = { type, shown: [], tests: [] };
    const player = (service) => page.evaluate(([sv, id]) => document.querySelector('home-assistant').hass.callService('media_player', sv, { entity_id: id }), [service, extra.entity]);
    if (_playerOff) { await player('turn_off'); await page.waitForTimeout(1500); }
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
      setPxBase = async (b) => { pxBase = b ?? await shot(); };
      let pxMask = null;
      const geom = await page.evaluate(() => window.__audit.geom());
      pxd = (a, b) => page.evaluate(([x, y, m, g]) => window.__audit.pxdiff(x, y, m, g), [a, b, pxMask, geom]);
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(400);
        const r = await pxd(pxBase, await shot());
        pxMask = r.mask;
      }
      row.pxNoise = pxMask ? atobCount(pxMask) : 0;
      row.floor = 0;
      // an effect is accepted early once it is clearly above any floor an accepted attempt can have (<= PX_MIN)
      measurePx = async () => {
        let best = 0;
        for (let i = 0; i < 8; i++) {
          await page.waitForTimeout(300);
          const r = await pxd(pxBase, await shot());
          best = Math.max(best, r.n);
          if (best > 3 * PX_MIN) break;
        }
        return best;
      };
      if (!base) { row.error = 'preview did not render'; results.push(row); console.log(type, 'NO PREVIEW'); continue; }
      const thrOffered = row.shown.includes('cms-threshold-module') ? await page.evaluate(() => window.__audit.thresholdOptions()) : [];
      row.thresholdOffers = thrOffered;
      const fontColorShown = await page.evaluate(() => window.__audit.panel.shadowRoot.querySelector('cms-font-module')?.allowColor !== false);
      const fontSizeShown = await page.evaluate(() => window.__audit.panel.shadowRoot.querySelector('cms-font-module')?.allowSize !== false);
      // Weight's row is offered through capsFor (module-font `_allowWeight`: the card's caps, or a weight already stored)
      const fontWeightShown = await page.evaluate(() => window.__audit.panel.shadowRoot.querySelector('cms-font-module')?._allowWeight !== false);
      const iconColorShown = await page.evaluate(() => window.__audit.panel.shadowRoot.querySelector('cms-icon-color-module')?.allowColor !== false);
      const iconSizeShown = await page.evaluate(() => window.__audit.panel.shadowRoot.querySelector('cms-icon-color-module')?.allowSize === true);
      const initial = await page.evaluate(() => window.__audit.state());
      // Weight's test value must differ from what the card's text already has: Mushroom chips (700) and Bubble's
      // separator name (600) are bold by default, so "bold" changes nothing there. Read the native weight of the
      // unstyled card's text (style/script elements excluded) and test the opposite end of the control's options:
      // Normal on a card whose text is native 550 or heavier, else Bold.
      const nativeWeight = await page.evaluate(() => {
        let w = 0;
        const walk = (n) => {
          if (n.nodeType === 1 && !/^(style|script)$/i.test(n.tagName)) {
            if ([...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) w = Math.max(w, parseInt(getComputedStyle(n).fontWeight, 10) || 0);
          }
          [...(n.shadowRoot ? n.shadowRoot.children : []), ...(n.children || [])].forEach(walk);
        };
        const p = window.__audit.preview(); if (p) walk(p);
        return w;
      });
      const testWeight = nativeWeight >= 550 ? 'normal' : 'bold';
      row.nativeWeight = nativeWeight;
      const cases = [
        ...Object.entries(MODULES).map(([mod, f]) => ({
          mod, label: mod.replace(/^cms-|-module$/g, ''), slice: f(initial),
          // Icon Color's colour control is offered only where the panel passes allowColor
          shown: row.shown.includes(mod) && (mod !== 'cms-icon-color-module' || iconColorShown),
        })),
        ...THRESHOLD_PROPS.map((p) => ({ mod: 'cms-threshold-module', label: `threshold:${p}`, slice: threshold(initial, p, entity), shown: row.shown.includes('cms-threshold-module') && thrOffered.includes(p) })),
        // Icon Color's size on its own: the colour is already on at its test value,
        // then only the size changes (offered only where the panel shows the slider).
        { mod: 'cms-icon-color-module', label: 'icon:size', pre: { iconColor: { ...initial.iconColor, enabled: true, mode: 'plain', color: RED } }, slice: { iconColor: { ...initial.iconColor, enabled: true, mode: 'plain', color: RED, sizePx: 40 } }, shown: row.shown.includes('cms-icon-color-module') && iconSizeShown },
        // Font's colour picker on its own: Font already on at defaults, then only the colour changes.
        { mod: 'cms-font-module', label: 'font:color', pre: { font: { ...initial.font, enabled: true } }, slice: { font: { ...initial.font, enabled: true, color: RED } }, shown: row.shown.includes('cms-font-module') && fontColorShown },
        // …and its size on its own: the combined `font` case also changes the
        // family, which reaches custom cards whose text ignores the size.
        { mod: 'cms-font-module', label: 'font:size', pre: { font: { ...initial.font, enabled: true } }, slice: { font: { ...initial.font, enabled: true, fontSize: 26 } }, shown: row.shown.includes('cms-font-module') && fontSizeShown },
        // …and weight and family each on their own: a row can be dead on one card while the others work
        // (area: only the family reaches its text; alert: family only), which the combined `font` case hides.
        { mod: 'cms-font-module', label: 'font:weight', pre: { font: { ...initial.font, enabled: true } }, slice: { font: { ...initial.font, enabled: true, fontWeight: testWeight } }, shown: row.shown.includes('cms-font-module') && fontWeightShown },
        { mod: 'cms-font-module', label: 'font:family', pre: { font: { ...initial.font, enabled: true } }, slice: { font: { ...initial.font, enabled: true, fontFamily: 'monospace' } }, shown: row.shown.includes('cms-font-module') },
      ];
      for (const c of cases) {
        if (_onlyLabels && !_onlyLabels.includes(c.label)) continue;
        let res = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          let cBase = base;
          // the unstyled card right now: the reference for this attempt and, compared with the one taken after the
          // reset, its noise floor
          const u1 = await shot();
          await setPxBase(u1);
          if (c.pre) {
            await page.evaluate((s) => window.__audit.apply(s), c.pre);
            await page.waitForTimeout(2500);
            cBase = await page.evaluate(() => window.__audit.snap());
            await setPxBase();
          }
          await page.evaluate((s) => window.__audit.apply(s), c.slice);
          const changed = await measure(cBase);
          const detail = lastDetail;
          const px = await measurePx();
          const style = await page.evaluate((k) => { const e = window.__audit.emitted(); const s = e?.[k]?.style; return typeof s === 'string' ? s : JSON.stringify(s ?? ''); }, process.env.STYLE_KEY === 'uix' ? 'uix' : 'card_mod');
          // reset to the untouched state, and wait for the preview to settle back
          await page.evaluate((s) => window.__audit.apply(s), initial);
          for (let i = 0; i < 10; i++) { await page.waitForTimeout(250); if (diff(base, await page.evaluate(() => window.__audit.snap())) === 0) break; }
          await page.waitForTimeout(400);
          const floor = (await pxd(u1, await shot())).n;
          res = { changed, px, style, floor, detail, attempts: attempt };
          if (floor <= PX_MIN) break; // the unstyled card stayed put during this test
        }
        const visible = res.px > PX_MIN + 2 * res.floor;
        // shown, nothing clearly above a persistently noisy card's floor, but a computed style did change: pixels cannot decide
        const inconclusive = c.shown && !visible && res.floor > PX_MIN && res.changed > 0;
        row.floor = Math.max(row.floor, res.floor);
        row.tests.push({ label: c.label, shown: c.shown, changed: res.changed, px: res.px, floor: res.floor, attempts: res.attempts, visible, inconclusive, emitted: !!res.style && res.style !== '""', detail: res.detail });
      }
    } catch (e) {
      row.error = String(e.message || e).slice(0, 200);
    }
    if (_playerOff) await player('turn_on').catch(() => {});
    results.push(row);
    const verdicts = row.tests.map((t) => `${t.label}:${t.shown ? (t.visible ? '✅' : t.inconclusive ? '❔' : '❌') : (t.visible ? '⚠️' : '·')}`);
    console.log(type.padEnd(17), `floor=${row.floor ?? '-'}`.padEnd(11), row.error ? `ERROR ${row.error}` : verdicts.join(' '));
  }

  await browser.close();
  const dead = results.flatMap((r) => r.tests.filter((t) => t.shown && !t.visible && !t.inconclusive).map((t) => `${r.type} › ${t.label}`));
  const inconclusive = results.flatMap((r) => r.tests.filter((t) => t.inconclusive).map((t) => `${r.type} › ${t.label}`));
  const floors = results.filter((r) => r.floor > 0).map((r) => `${r.type}=${r.floor}`);
  const missed = results.flatMap((r) => r.tests.filter((t) => !t.shown && t.visible).map((t) => `${r.type} › ${t.label}`));
  const tag = `${AUDIT_CUSTOM === '1' ? 'custom-' : ''}${meta.engine}-${meta.version}${process.env.AUDIT_TAG ? '-' + process.env.AUDIT_TAG : ''}`;
  writeFileSync(resolve(HERE, `module-effect-audit-${tag}.json`), JSON.stringify({ meta, results, dead, missed, inconclusive }, null, 2));
  const md = [`# Module effect audit — ${meta.engine} on HA ${meta.version}`, '',
    '✅ shown + works · ❌ shown but changes nothing (dead) · ❔ shown, effect inside the card\'s noise floor (inconclusive) · ⚠️ hidden but would work · `·` hidden, no effect', '',
    `| card | ${(results.find((r) => r.tests.length)?.tests ?? []).map((t) => t.label.replace('threshold:', 'thr:')).join(' | ')} |`,
    `|---|${(results.find((r) => r.tests.length)?.tests ?? []).map(() => '---').join('|')}|`,
    ...results.map((r) => `| ${r.type} | ${r.error ? `error: ${r.error}` : (results.find((x) => x.tests.length)?.tests ?? r.tests).map((c) => r.tests.find((x) => x.label === c.label)).map((t) => (!t ? '–' : t.shown ? (t.visible ? '✅' : t.inconclusive ? '❔' : '❌') : (t.visible ? '⚠️' : '·'))).join(' | ')} |`),
    '', '`media-control` is tested against the demo player while it plays; `media-control (off)` runs only the two Background controls against a player switched off for that row. The card paints its own colour block over its whole face in every player state, so a Background that is dead in both rows is correctly hidden.',
    '', `**Dead controls (${dead.length}):** ${dead.join(', ') || 'none'}`, '', `**Inconclusive, shown but within the noise floor (${inconclusive.length}):** ${inconclusive.join(', ') || 'none'}`, '', `**Hidden but working (${missed.length}):** ${missed.join(', ') || 'none'}`,
    '', `**Noise floor (changed pixels of the unstyled card during a test, largest per card; an effect must exceed 30 + 2 x floor; 2.5 px edge ring ignored):** ${floors.join(', ') || 'all cards static (0)'}`];
  writeFileSync(resolve(HERE, `module-effect-audit-${tag}.md`), md.join('\n') + '\n');
  console.log(`\nDEAD (${dead.length}): ${dead.join(', ') || 'none'}\nINCONCLUSIVE (${inconclusive.length}): ${inconclusive.join(', ') || 'none'}\nHIDDEN-BUT-WORKS (${missed.length}): ${missed.join(', ') || 'none'}\nNOISE FLOOR: ${floors.join(', ') || 'all cards static (0)'}`);
};

run().catch((e) => { console.error('ERR', e); process.exit(1); });

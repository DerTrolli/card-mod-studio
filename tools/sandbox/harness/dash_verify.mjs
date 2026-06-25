// Faithful re-verification in a REAL sections/grid dashboard (not a standalone
// hui-card mount). Use this to confirm any contested matrix cell — standalone
// mounting can diverge from a real view (e.g. the button card). Cards are
// matched by a marker embedded in name/title/heading, so layout reordering and
// lazy-loading don't matter.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CFG = resolve(HERE, '../config/ui-lovelace.yaml');
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, 'tokens.json'), 'utf8'));

const ICON = 'ha-state-icon {\n  color: #ee1111 !important;\n}';
const BG = 'ha-card {\n  background: rgb(17, 34, 68);\n}';
const BORDER = 'ha-card {\n  border: 3px solid rgb(17, 238, 17);\n}';
const m = (k) => `CMS:${k}`;

// name-bearing cards use `name`; glance uses `title`; heading uses `heading`.
const cards = [
  { type: 'tile', entity: 'light.ceiling_lights', name: m('tile:base') },
  { type: 'tile', entity: 'light.ceiling_lights', name: m('tile:icon'), card_mod: { style: ICON } },
  { type: 'alarm-panel', entity: 'alarm_control_panel.security', name: m('alarm:base') },
  { type: 'alarm-panel', entity: 'alarm_control_panel.security', name: m('alarm:icon'), card_mod: { style: ICON } },
  { type: 'media-control', entity: 'media_player.living_room', name: m('media:base') },
  { type: 'media-control', entity: 'media_player.living_room', name: m('media:icon'), card_mod: { style: ICON } },
  { type: 'glance', entities: ['light.ceiling_lights', 'switch.decorative_lights'], title: m('glance:base') },
  { type: 'glance', entities: ['light.ceiling_lights', 'switch.decorative_lights'], title: m('glance:icon'), card_mod: { style: ICON } },
  { type: 'heading', icon: 'mdi:home', heading: m('heading:base') },
  { type: 'heading', icon: 'mdi:home', heading: m('heading:bg'), card_mod: { style: BG } },
  { type: 'heading', icon: 'mdi:home', heading: m('heading:border'), card_mod: { style: BORDER } },
];
writeFileSync(CFG, JSON.stringify({ title: 'V', views: [{ title: 'T', type: 'sections', sections: [{ type: 'grid', cards }] }] }, null, 2));

const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1400, height: 2600 } });
await p.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
await p.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => { const h = document.querySelector('home-assistant'); return !!(h && h.hass && h.hass.states && Object.keys(h.hass.states).length > 10); }, { timeout: 60000 });
const all = `(r, t) => { const o = []; const s = [r]; t = t.toLowerCase(); while (s.length) { const x = s.pop(); if (x.tagName && x.tagName.toLowerCase() === t) o.push(x); if (x.shadowRoot) s.push(...x.shadowRoot.children); if (x.children) s.push(...x.children); } return o; }`;
await p.waitForFunction((args) => {
  const [n, allSrc] = args; const allFn = eval(allSrc);
  return allFn(document.querySelector('home-assistant'), 'hui-card').filter((c) => ((c.config || {}).name || (c.config || {}).title || (c.config || {}).heading || '').startsWith('CMS:')).length >= n;
}, [cards.length, all], { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(2000);

const res = await p.evaluate((allSrc) => {
  const allFn = eval(allSrc);
  const out = {};
  for (const c of allFn(document.querySelector('home-assistant'), 'hui-card')) {
    const cf = c.config || {};
    const marker = (cf.name || cf.title || cf.heading || '');
    if (!marker.startsWith('CMS:')) continue;
    const icons = allFn(c, 'ha-state-icon');
    const icon = icons[icons.length - 1];
    const haCard = allFn(c, 'ha-card')[0];
    out[marker.slice(4)] = {
      iconColor: icon ? getComputedStyle(icon).color : null,
      bg: haCard ? getComputedStyle(haCard).backgroundColor : null,
      borderTop: haCard ? getComputedStyle(haCard).borderTopWidth : null,
    };
  }
  return out;
}, all);
await b.close();

const v = (base, styled, prop) => (!res[base] || !res[styled]) ? 'MISSING'
  : (res[base][prop] == null || res[styled][prop] == null) ? 'no-target'
  : res[styled][prop] === res[base][prop] ? 'NO-EFFECT' : 'EFFECT';
console.log(JSON.stringify(res, null, 2));
console.log('\n--- REAL DASHBOARD verdicts ---');
console.log('tile  icon-color (sanity):', v('tile:base', 'tile:icon', 'iconColor'));
console.log('alarm icon-color         :', v('alarm:base', 'alarm:icon', 'iconColor'));
console.log('media icon-color         :', v('media:base', 'media:icon', 'iconColor'));
console.log('glance icon-color        :', v('glance:base', 'glance:icon', 'iconColor'));
console.log('heading background       :', v('heading:base', 'heading:bg', 'bg'));
console.log('heading border          :', v('heading:base', 'heading:border', 'borderTop'));

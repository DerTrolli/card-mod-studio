// The button card can't mount standalone (it needs real dashboard context), so
// measure it inside a real YAML dashboard. Writes ui-lovelace.yaml (as JSON,
// which is valid YAML), reloads, matches cards by a name marker (the masonry
// layout reorders the DOM, so index mapping is unreliable), measures, and
// merges a `button` row into matrix.json / matrix.md.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SETTINGS } from './matrix.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CFG = resolve(HERE, '../config/ui-lovelace.yaml');
const HA = process.env.HA_URL || 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const tokens = JSON.parse(readFileSync(resolve(HERE, 'tokens.json'), 'utf8'));

const ENT = 'light.ceiling_lights';
const skeys = Object.keys(SETTINGS);
const cards = [{ type: 'button', entity: ENT, name: 'CMS:baseline', show_icon: true }];
for (const k of skeys) cards.push({ type: 'button', entity: ENT, name: `CMS:${k}`, show_icon: true, card_mod: { style: SETTINGS[k].css } });
writeFileSync(CFG, JSON.stringify({ title: 'Sandbox', views: [{ title: 'Test', cards }] }, null, 2));

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 500, height: 2400 } });
  await page.addInitScript((t) => localStorage.setItem('hassTokens', JSON.stringify(t)), tokens);
  await page.goto(`${HA}/lovelace/0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const ha = document.querySelector('home-assistant');
    return !!(ha && ha.hass && ha.hass.states && Object.keys(ha.hass.states).length > 10);
  }, { timeout: 60000 });
  await page.waitForFunction((n) => {
    const all = (root, tag) => { const o = []; const s = [root]; tag = tag.toLowerCase();
      while (s.length) { const x = s.pop(); if (x.tagName && x.tagName.toLowerCase() === tag) o.push(x);
        if (x.shadowRoot) s.push(...x.shadowRoot.children); if (x.children) s.push(...x.children); } return o; };
    return all(document.querySelector('home-assistant'), 'hui-button-card').length >= n;
  }, cards.length, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const res = await page.evaluate(({ skeys, SETTINGS }) => {
    const all = (root, tag) => { const o = []; const s = [root]; tag = tag.toLowerCase();
      while (s.length) { const x = s.pop(); if (x.tagName && x.tagName.toLowerCase() === tag) o.push(x);
        if (x.shadowRoot) s.push(...x.shadowRoot.children); if (x.children) s.push(...x.children); } return o; };
    const read = (card, tag, prop) => { const el = all(card, tag)[0]; if (!el) return null;
      const cs = getComputedStyle(el); return prop.startsWith('--') ? cs.getPropertyValue(prop).trim() : cs[prop]; };
    const byKey = {};
    for (const c of all(document.querySelector('home-assistant'), 'hui-card'))
      if (c.config && typeof c.config.name === 'string' && c.config.name.startsWith('CMS:')) byKey[c.config.name.slice(4)] = c;
    const cells = {};
    const baseCard = byKey['baseline'];
    skeys.forEach((k) => {
      const s = SETTINGS[k];
      const before = baseCard ? read(baseCard, s.tag, s.prop) : null;
      const after = byKey[k] ? read(byKey[k], s.tag, s.prop) : 'MISSING';
      const verdict = after === null ? 'no-target' : after === 'MISSING' ? 'missing' : after !== before ? 'effect' : 'no-effect';
      cells[k] = { verdict, before, after };
    });
    return { found: Object.keys(byKey), cells };
  }, { skeys, SETTINGS });

  console.log('button cards matched:', res.found.join(', '));
  console.log(JSON.stringify(res.cells, null, 2));

  const matrix = JSON.parse(readFileSync(resolve(HERE, 'matrix.json'), 'utf8'));
  matrix.button = res.cells;
  writeFileSync(resolve(HERE, 'matrix.json'), JSON.stringify(matrix, null, 2));
  const ICON = { effect: '✅', 'no-effect': '❌', 'no-target': '—', missing: '?' };
  let md = '| card | ' + skeys.join(' | ') + ' |\n|' + '---|'.repeat(skeys.length + 1) + '\n';
  for (const c of Object.keys(matrix)) md += `| ${c} | ` + skeys.map((s) => ICON[matrix[c][s].verdict]).join(' | ') + ' |\n';
  writeFileSync(resolve(HERE, 'matrix.md'), md);
  console.log('\n' + md);
  await browser.close();
};
run().catch((e) => { console.error('ERR', e); process.exit(1); });

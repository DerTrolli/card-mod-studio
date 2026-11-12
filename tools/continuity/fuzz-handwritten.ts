// Hand-written CSS fuzz: random styles (many of them look like Studio output,
// many do not) are loaded and re-saved with NO edit. Invariant: for every
// selector + property the declaration that wins the cascade in the input must
// still win, with the same value, in the output; nothing throws; saves settle.
import { mapToStudioState } from '../../src/parser/state-mapper.js';
import { parseStyleValue } from '../../src/parser/yaml-parser.js';
import { generateCss } from '../../src/generator/css-generator.js';
import { extract } from './extract.js';
import { mkdirSync, writeFileSync } from 'node:fs';

const WORK = process.env.CONT_WORK || new URL('./.work', import.meta.url).pathname;
mkdirSync(WORK, { recursive: true });

let seed = Number(process.env.SEED || 20261111);
const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;

const TYPES = ['tile', 'button', 'entity', 'sensor', 'light', 'gauge', 'thermostat', 'humidifier', 'heading', 'glance', 'markdown', 'entities',
  'picture', 'picture-entity', 'picture-glance', 'picture-elements', 'media-control', 'alarm-panel', 'weather-forecast', 'calendar', 'history-graph',
  'statistic', 'logbook', 'todo-list', 'map', 'area', 'custom:mushroom-entity-card', 'custom:mushroom-template-card', 'custom:mushroom-chips-card',
  'custom:mushroom-title-card', 'custom:bubble-card/button', 'custom:bubble-card/button/slider', 'custom:bubble-card/separator', 'custom:something-else'];
const CFG: Record<string, any> = { heading: { heading: 'H' }, markdown: { content: 'x' }, glance: { entities: ['light.a'] }, entities: { entities: ['light.a'] }, picture: { image: '/x.png' } };
const SEL = ['ha-card', 'ha-card', 'ha-card', ':host', '.name', '.state', '.value', '.measurement', '.title', '.card-header', 'ha-state-icon', 'ha-tile-icon',
  '.container', '.content ha-icon', '.content p, .content .heading', '.bubble-container', '.bubble-button-background', '.bubble-name', '.bubble-icon', '.info',
  'ha-card .foo', 'ha-card:hover', 'ha-card > div', '#info', '.brightness', 'ha-gauge', '.primary', 'ha-card::before'];
const COL = ['red', '#ff0000', '#F00', 'rgb(255, 0, 0)', 'rgba(0,0,0,.5)', 'var(--red-color)', 'var(--x, blue)', 'transparent', 'inherit', 'currentColor', 'hsl(10 50% 50%)', 'RED'];
const ENT = ["is_state(config.entity, 'on')", "is_state(config.entity, 'off')", "is_state('switch.x', 'on')", "states('sensor.t') | float(0) > 20", "state_attr('sensor.t', 'battery') | float(0) <= 15.5", "is_state('light.a', 'unavailable')", 'states(config.entity) == "on"'];
const tern = (a: string, b: string) => `{{ '${a}' if ${pick(ENT)} else '${b}' }}`;
const col = () => chance(0.25) ? tern(pick(COL), pick([...COL, 'none', '', 'inherit'])) : chance(0.06) ? `{{ states('sensor.color') }}` : pick(COL);
const px = () => `${pick([0, 1, 2, 3, 4, 8, 12, 14, 16, 18, 20, 24, 30, 36, 48])}px`;
const PROPS: Record<string, () => string> = {
  background: () => pick([col(), col(), `linear-gradient(${pick([45, 90, 135])}deg, ${pick(COL)}, ${pick(COL)})`, `url('/local/a.png')`, 'url("/local/a.png") center / cover no-repeat', 'none', `url(/local/a.png), ${pick(COL)}`, tern("url(\\'/local/a.png\\')", '')]),
  'background-color': col, 'background-size': () => pick(['cover', '200% auto']), 'background-image': () => pick(['none', "url('/local/b.png')"]),
  border: () => pick([`${px()} solid ${col()}`, 'none', '0', tern('2px solid red', 'none'), tern('3px solid #00aa00', ''), `${px()} dashed ${pick(COL)}`]),
  'border-radius': () => pick([px(), '50%', '12px 0', `${px()} !important`]), 'border-width': px, 'border-color': col, 'border-style': () => pick(['solid', 'dotted']),
  color: col, 'font-size': () => pick([px(), '1.2em', 'calc(16px * 1.5)', 'larger']), 'font-weight': () => pick(['bold', 'normal', '500', '700', '300', 'medium']),
  'font-family': () => pick(['monospace', 'Georgia, serif', "'Segoe UI', sans-serif", '"Roboto Mono"', 'var(--ha-font-family-body)']),
  filter: () => pick(['grayscale(100%)', 'brightness(60%) blur(3px)', 'none', tern('grayscale(100%)', 'none'), 'opacity(50%)', 'drop-shadow(0 0 2px red)', 'brightness(80%) grayscale(100%) blur(1px) opacity(70%)']),
  opacity: () => pick(['0.5', '1', '.3']), transition: () => pick(['filter 300ms ease', 'filter 300ms ease !important', 'all 0.2s', 'filter 800ms ease']),
  animation: () => pick(['cms-pulse 2s ease-in-out infinite', 'cms-spin 2s linear infinite', 'cms-pulse 2s ease-in-out 3', 'mine 1s infinite', tern('cms-blink 1s step-start infinite', 'none'), 'none', 'cms-shake 3s ease-in-out infinite']),
  '--accent-color': col, '--state-icon-color': col, '--tile-color': () => `${col()}${chance(0.5) ? ' !important' : ''}`, '--mdc-icon-size': px, '--ha-icon-size': px, '--tile-icon-size': px,
  '--primary-text-color': col, '--ha-card-header-color': col, '--ha-card-header-font-size': () => pick(['calc(20px * 1.5)', '24px']), '--ha-font-weight-normal': () => pick(['bold', 'normal']),
  '--card-primary-font-size': px, '--card-secondary-font-size': px, '--card-primary-line-height': px, '--card-secondary-line-height': px, '--chip-background': col, '--chip-font-weight': () => pick(['bold', '500']),
  '--gauge-color': col, '--graph-color-1': col, '--primary-color': col, '--paper-item-icon-color': col, '--paper-item-icon-active-color': col,
  'box-shadow': () => pick(['none', '0 0 4px red', '0 2px 8px rgba(0,0,0,.3) !important']), padding: px, transform: () => pick(['scale(1.1)', 'rotate(3deg)']),
  '--my-var': () => pick(['1', 'red', "'a;b'"]), 'line-height': () => pick(['1.2', '20px']), 'text-transform': () => 'uppercase', 'max-width': () => '55%', 'max-height': () => '44%',
  '--ha-heading-card-title-font-size': px, '--ha-heading-card-title-color': col, 'justify-content': () => pick(['center', 'flex-end']),
  '--ha-tile-info-primary-color': col, '--ha-tile-info-primary-font-size': px, '--rgb-state-light': () => '244, 67, 54', '--icon-color': col, '--bubble-accent-color': col,
};
const PN = Object.keys(PROPS);
const decl = () => { const p = pick(PN); let v = PROPS[p](); if (chance(0.15) && !/!important/.test(v)) v += pick([' !important', '!important', ' ! important']); return [p, v] as const; };
const KF = { 'cms-pulse': '0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); }', mine: 'from { opacity: 0; } to { opacity: 1; }', 'cms-spin': 'from { transform: rotate(0deg); } to { transform: rotate(360deg); }' };
function gen(): string {
  const nl = chance(0.05) ? '\r\n' : '\n';
  const parts: string[] = [];
  const n = 1 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    if (chance(0.08)) { const k = pick(Object.keys(KF)) as keyof typeof KF; parts.push(`@keyframes ${k} { ${KF[k]} }`); continue; }
    if (chance(0.03)) { parts.push(`/* note ${i} */`); continue; }
    if (chance(0.03)) { parts.push(`{% set x = states('sensor.t') %}`); continue; }
    const sel = pick(SEL);
    const m = 1 + Math.floor(rnd() * 5);
    const ds: string[] = [];
    for (let j = 0; j < m; j++) { const [p, v] = decl(); ds.push(chance(0.1) ? `${p}:${v}` : chance(0.05) ? `${p.toUpperCase().startsWith('--') ? p : p.toUpperCase()}: ${v}` : `${p}: ${v}`); }
    const body = chance(0.85) ? ds.map((d) => `  ${d};`).join(nl) : ds.join('; ') + (chance(0.5) ? ';' : '');
    const rule = chance(0.85) ? `${sel} {${nl}${body}${nl}}` : `${sel}{ ${ds.join('; ')} }`;
    parts.push(chance(0.06) ? `@media (max-width: 600px) {${nl}${rule}${nl}}` : rule);
  }
  return parts.join(chance(0.9) ? nl + nl : nl);
}

/** cascade winner per "path :: prop" -> normalised value (important beats plain; later wins among equals) */
function winners(css: string): Map<string, string> {
  const w = new Map<string, string>();
  for (const [k, vals] of extract(css)) {
    let best = '', bestImp = false;
    for (const raw of vals) { const imp = /!\s*important\s*$/i.test(raw); if (imp || !bestImp) { best = raw; bestImp = imp; } }
    w.set(k.replace(/ :: .*$/, (m) => m.toLowerCase()), best.replace(/\s*!\s*important\s*$/i, ' !important').replace(/\s+/g, ' ').trim());
  }
  return w;
}

const N = Number(process.env.N || 30000);
const groups = new Map<string, { n: number; ex: any }>();
const bump = (k: string, ex: any) => { const g = groups.get(k) ?? groups.set(k, { n: 0, ex }).get(k)!; g.n++; };
const tot: Record<string, number> = { cases: 0, identical: 0, threw: 0, lost: 0, changed: 0, added: 0, unstable: 0, slow: 0 };
let maxMs = 0;
for (let i = 0; i < N; i++) {
  const css = gen(); const type = pick(TYPES); const config = { type: type.split('/')[0], entity: 'light.a', ...(CFG[type] ? { entity: undefined, ...CFG[type] } : {}) };
  tot.cases++;
  let css1 = '', css2 = '', css3 = '';
  const t0 = performance.now();
  try {
    css1 = generateCss(mapToStudioState(parseStyleValue(css), type, config), type, { config });
    css2 = generateCss(mapToStudioState(parseStyleValue(css1), type, config), type, { config });
    css3 = generateCss(mapToStudioState(parseStyleValue(css2), type, config), type, { config });
  } catch (e: any) { tot.threw++; bump(`THREW | ${String(e?.message).slice(0, 90)}`, { type, css }); continue; }
  const ms = performance.now() - t0; maxMs = Math.max(maxMs, ms); if (ms > 150) { tot.slow++; bump('SLOW', { type, ms, css }); }
  if (css1.trim() === css.replace(/\r\n/g, '\n').trim()) tot.identical++;
  if (css3 !== css2) {
    // how many saves until it settles?
    let cur = css3, steps = 3;
    for (; steps < 8; steps++) { const nx = generateCss(mapToStudioState(parseStyleValue(cur), type, config), type, { config }); if (nx === cur) break; cur = nx; }
    tot.unstable++; bump(steps >= 8 ? `NEVER-SETTLES | ${type}` : `UNSTABLE(settles after ${steps} saves) | ${type}`, { type, css, css1, css2, css3 });
  }
  const A = winners(css.replace(/\r\n/g, '\n')), B = winners(css1);
  let l = false, c = false, a = false;
  for (const [k, v] of A) {
    if (k.endsWith(':: <raw>')) continue;
    const b = B.get(k);
    if (b === undefined) {
      l = true;
      const kf = k.match(/^@keyframes (cms-[\w-]+) \|/);
      // a kept block must stay while an animation still names it
      const referenced = kf && new RegExp(`animation[^;{}]*\\b${kf[1]}\\b`, 'i').test(css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ''));
      bump(kf ? (referenced && !new RegExp(`@keyframes ${kf[1]}\\b`).test(css1) ? `LOST-REFERENCED-KEYFRAMES | ${kf[1]}` : 'LOST | unreferenced or regenerated cms keyframes') : `LOST | ${k.replace(/^.* \| /, '… | ')}`, { type, k, v, css, css1 });
    }
    else if (b !== v) { c = true; bump(`CHANGED | ${k.split(' :: ')[1]} | ${v.includes('{{') ? 'template' : 'plain'}`, { type, k, old: v, neu: b, css, css1 }); }
  }
  for (const [k, v] of B) if (!A.has(k)) { a = true; bump(`ADDED | ${k}`, { type, k, v, css, css1 }); }
  if (l) tot.lost++; if (c) tot.changed++; if (a) tot.added++;
}
const rows = [...groups.entries()].map(([k, g]) => ({ key: k, n: g.n, ex: g.ex })).sort((x, y) => y.n - x.n);
writeFileSync(`${WORK}/fuzz-result.json`, JSON.stringify({ tot, rows }, null, 1));
console.log(JSON.stringify(tot), 'maxMs', maxMs.toFixed(1));
for (const kind of ['THREW', 'SLOW', 'NEVER-SETTLES', 'UNSTABLE', 'LOST-REFERENCED', 'LOST', 'CHANGED', 'ADDED']) {
  const r = rows.filter((x) => x.key.startsWith(kind));
  console.log(`\n== ${kind}: ${r.length} groups, ${r.reduce((s, x) => s + x.n, 0)} hits`);
  for (const x of r.slice(0, Number(process.env.TOP || 30))) console.log(String(x.n).padStart(6), x.key.slice(0, 120));
}

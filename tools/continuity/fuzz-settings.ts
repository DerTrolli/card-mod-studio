// Self round-trip with RANDOM setting combinations (current tree): build a
// random module state the panel could produce for a card, write it, read it
// back the way the editor does, write again. Reports:
//   RESAVE-DIFF   second save differs from the first
//   REMAINDER     Studio-written CSS that no module took back (lands in Advanced CSS)
//   MODULE-OFF    a module that wrote something comes back switched off
//   MODULE-ON     a module that was off comes back switched on
//   THREW
import { mapToStudioState } from '../../src/parser/state-mapper.js';
import { parseStyleValue } from '../../src/parser/yaml-parser.js';
import { generateCss, settleEntityless } from '../../src/generator/css-generator.js';
import { filterPresetStateForCardType } from '../../src/utils/preset-caps.js';
import { capsFor } from '../../src/utils/card-caps.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const WORK = process.env.CONT_WORK || new URL('./.work', import.meta.url).pathname;
mkdirSync(WORK, { recursive: true });
const src = readFileSync(new URL('./gen-corpus.ts', import.meta.url).pathname, 'utf8');
const at = src.indexOf('const CARDS');
const CARDS: Record<string, any> = new Function(`return (${src.slice(src.indexOf('{', at), src.indexOf('\n};', at) + 2)})`)();

let seed = Number(process.env.SEED || 777);
const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const maybe = (p: number) => rnd() < p;
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const COL = ['#ff0000', '#00aa00', 'var(--red-color)', 'rgba(255, 0, 0, 0.5)', '#123456', 'red'];
const ENT = ['switch.decorative_lights', 'light.bed_light', 'sensor.outside_temperature'];
const cond = () => pick<any>([
  undefined, { when: 'always' }, { when: 'on' }, { when: 'off' }, { when: 'custom', customEntity: pick(ENT) },
  { when: 'value', valueEntity: 'sensor.outside_temperature', valueOperator: pick(['<', '<=', '>', '>=', '==', '!=']), valueThreshold: pick([0, 20, -5.5, 100]) },
  { when: 'value', valueEntity: 'sensor.outside_temperature', valueAttribute: 'battery_level', valueOperator: '<=', valueThreshold: 15.5 },
]);
const rules = () => Array.from({ length: 1 + Math.floor(rnd() * 3) }, (_, i) => ({ id: `r${i}`, operator: pick(['<', '<=', '>', '>=', '==', '!=']), value: pick([-10, 0, 10, 20.5, 50, 100]) + i, color: pick(COL) }));
const stops = () => [{ id: 's1', value: 0, color: '#2196f3' }, ...(maybe(0.5) ? [{ id: 's2', value: 50, color: '#ffeb3b' }] : []), { id: 's3', value: 100, color: '#ff0000' }];

function randomState(key: string, config: any): any {
  const caps: any = capsFor(key, config);
  const s: any = clone(mapToStudioState(parseStyleValue(''), key, config));
  const P = 0.38;
  if (maybe(P)) {
    const f = s.filter; f.enabled = true;
    if (maybe(0.5)) { f.grayscale = true; f.grayscaleWhen = pick(['always', 'on', 'off', 'custom']); if (f.grayscaleWhen === 'custom') f.customEntity = pick(ENT); }
    if (maybe(0.5)) f.brightness = pick([0, 60, 120, 200]);
    if (maybe(0.4)) f.blur = pick([1, 3]);
    if (maybe(0.4)) f.opacity = pick([0, 50, 100]);
    if (!f.grayscale && maybe(0.4)) f.effectsWhen = cond();
    if (maybe(0.4)) f.transitionMs = pick([0, 300, 800]);
  }
  if (maybe(P)) {
    const ic = s.iconColor; ic.enabled = true;
    ic.mode = pick(caps.iconSize ? ['plain', 'conditional', 'light', 'none'] : ['plain', 'conditional', 'light']);
    if (maybe(0.7)) ic.color = pick(COL);
    if (maybe(0.7)) { ic.colorOn = pick(COL); ic.colorOff = pick(COL); }
    if (maybe(0.3)) ic.entityId = pick(ENT);
    if (caps.iconSize && (ic.mode === 'none' || maybe(0.5))) {
      ic.sizePx = pick([12, 24, 30, caps.iconSizeMax ?? 64]);
      if (maybe(0.4)) { ic.sizeWhen = cond(); ic.sizeOffPx = pick([12, 20]); }
    }
  }
  if (maybe(P)) {
    const a = s.accentColor; a.enabled = true; a.mode = pick(['plain', 'conditional']);
    if (maybe(0.7)) a.color = pick(COL);
    if (maybe(0.7)) { a.colorOn = pick(COL); a.colorOff = pick(COL); }
    if (maybe(0.3)) a.entityId = pick(ENT);
  }
  if (maybe(P)) {
    const b = s.background; b.enabled = true; b.type = pick(['solid', 'gradient']);
    if (maybe(0.8)) b.color1 = pick(COL);
    if (maybe(0.8)) b.color2 = pick(COL);
    if (maybe(0.5)) b.angle = pick([0, 45, 90, 180, 360]);
    b.applyWhen = pick(['always', 'always', 'on', 'off', 'custom']); if (b.applyWhen === 'custom') b.customEntity = pick(ENT);
  }
  if (maybe(P)) {
    const a = s.animation; a.enabled = true;
    a.preset = pick(['pulse', 'breathe', 'gradient-shift', 'bounce', 'blink', 'shake', 'spin', 'glow', 'heartbeat'].filter((p) => !caps.noAnimationPresets?.includes(p)));
    if (maybe(0.5)) a.speedS = pick([0.5, 1, 3, 10]);
    a.trigger = pick(['always', 'always', 'on', 'off', 'custom', 'value']);
    if (a.trigger === 'custom') a.customEntity = pick(ENT);
    if (a.trigger === 'value') Object.assign(a, { valueEntity: 'sensor.outside_temperature', valueOperator: pick(['<', '>', '>=', '==']), valueThreshold: pick([0, 20, -3.5]) }, maybe(0.3) ? { valueAttribute: 'battery_level' } : {});
    if (a.preset === 'gradient-shift' && maybe(0.7)) Object.assign(s.background, { enabled: true, type: 'gradient', color1: pick(COL), color2: pick(COL), applyWhen: 'always' });
  }
  if (maybe(P)) {
    const b = s.border; b.enabled = true;
    if (maybe(0.6)) b.radiusPx = pick([0, 4, 12, 20, 50]);
    if (maybe(0.6)) { b.borderWidth = pick([1, 2, 5]); b.borderColor = pick(COL); if (maybe(0.4)) { b.widthWhen = cond(); b.widthOffPx = pick([0, 1]); } }
  }
  if (maybe(P)) {
    const h = s.headingStyle; h.enabled = true;
    if (maybe(0.5)) h.fontSize = pick([12, 20, 30, 48]);
    if (maybe(0.5)) h.textColor = pick(COL);
    if (maybe(0.5)) h.fontWeight = pick(['normal', 'medium', 'bold']);
    if (maybe(0.4)) h.fontFamily = pick(['monospace', 'Georgia, serif']);
    if (maybe(0.4)) h.iconSize = pick([16, 32]);
    if (maybe(0.4)) h.iconColor = pick(COL);
    if (maybe(0.4)) h.alignment = pick(['left', 'center', 'right']);
  }
  if (maybe(P + 0.1)) {
    const f = s.font; f.enabled = true;
    if (maybe(0.45)) f.fontSize = pick([10, 14, 20, 32]);
    if (maybe(0.45)) f.fontWeight = pick(['normal', 'medium', 'bold']);
    if (maybe(0.45)) f.fontFamily = pick(['monospace', 'Georgia, serif', "'Courier New', monospace"]);
    if (maybe(0.45)) f.color = pick(COL);
  }
  if (maybe(P)) {
    const t = s.threshold; t.enabled = true; t.entityId = 'sensor.outside_temperature';
    if (maybe(0.25)) t.attribute = 'battery_level';
    t.properties = ['icon-color', 'background', 'text-color', 'accent-color', 'border-color'].filter(() => maybe(0.4));
    if (!t.properties.length) t.properties = [pick(['icon-color', 'background', 'text-color', 'accent-color', 'border-color'])];
    t.valueMode = pick(['switch', 'gradient']);
    if (t.valueMode === 'switch') { t.rules = rules(); if (maybe(0.5)) t.defaultColor = pick(COL); } else t.colorStops = stops();
    if (t.properties.includes('border-color') && maybe(0.6)) t.borderWidth = pick([1, 2, 4]);
  }
  return settleEntityless(filterPresetStateForCardType(s, key, config), config);
}

const MODS = ['filter', 'iconColor', 'accentColor', 'background', 'animation', 'border', 'headingStyle', 'font', 'threshold'];
type G = { n: number; ex: any; types: Set<string> };
const groups = new Map<string, G>();
const bump = (k: string, type: string, ex: any) => { const g = groups.get(k) ?? groups.set(k, { n: 0, ex, types: new Set() }).get(k)!; g.n++; g.types.add(type); };
const tot: Record<string, number> = {};
const t = (k: string) => (tot[k] = (tot[k] || 0) + 1);
const keys = Object.keys(CARDS);
const N = Number(process.env.N || 20000);
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const key = pick(keys);
  const type = key.split('/')[0];
  const config = { type, ...CARDS[key] };
  const gen = (s: any) => generateCss(s, key, { config, gaugeNeedle: config.needle === true });
  let state: any, css = '', back: any, css2 = '';
  try {
    state = randomState(key, config);
    css = gen(state);
    if (!css.trim()) { t('empty'); continue; }
    t('cases');
    back = settleEntityless(mapToStudioState(parseStyleValue(css), key, config), config);
    css2 = gen(back);
  } catch (e: any) { t('threw'); bump(`THREW | ${String(e?.message).slice(0, 90)}`, key, { key, state, css }); continue; }
  const on = MODS.filter((m) => state[m].enabled);
  const sig = on.join('+');
  if (css2 !== css) { t('resaveDiff'); bump(`RESAVE-DIFF | ${key}`, key, { key, on: sig, state: Object.fromEntries(on.map((m) => [m, state[m]])), css, css2 }); }
  if (back.advanced.rawCss.trim()) { t('remainder'); bump(`REMAINDER | ${on.length <= 3 ? sig : on.length + ' modules'}`, key, { key, on: sig, state: Object.fromEntries(on.map((m) => [m, state[m]])), rest: back.advanced.rawCss.slice(0, 400), css: css.slice(0, 900) }); }
  for (const m of MODS) {
    if (state[m].enabled && !back[m].enabled) {
      // did the module write anything at all?
      const without = gen({ ...state, [m]: { ...state[m], enabled: false } });
      if (without !== css) { t('moduleOff'); bump(`MODULE-OFF | ${m}`, key, { key, on: sig, mod: state[m], css: css.slice(0, 900), rest: back.advanced.rawCss.slice(0, 300) }); }
    } else if (!state[m].enabled && back[m].enabled) { t('moduleOn'); bump(`MODULE-ON | ${m}`, key, { key, on: sig, got: back[m], css: css.slice(0, 900) }); }
  }
}
const rows = [...groups.entries()].map(([k, g]) => ({ key: k, n: g.n, types: [...g.types], ex: g.ex })).sort((a, b) => b.n - a.n);
writeFileSync(`${WORK}/fuzz-settings-result.json`, JSON.stringify({ tot, rows }, null, 1));
console.log(JSON.stringify(tot), `${Date.now() - t0} ms`);
for (const kind of ['THREW', 'RESAVE-DIFF', 'MODULE-OFF', 'MODULE-ON', 'REMAINDER']) {
  const r = rows.filter((x) => x.key.startsWith(kind));
  console.log(`\n== ${kind}: ${r.length} groups, ${r.reduce((a, x) => a + x.n, 0)} hits`);
  for (const x of r.slice(0, Number(process.env.TOP || 14))) console.log(String(x.n).padStart(6), x.key.slice(0, 110), `[${x.types.length}t: ${x.types.slice(0, 6).join(',')}]`);
}

// Runs INSIDE an extracted old release tree (cwd = that tree): makes that
// version's own generator write styles for many settings x card types.
// Output: corpus.json = [{ type, config, mut, css }]
import { mapToStudioState } from './src/parser/state-mapper.js';
import { parseStyleValue } from './src/parser/yaml-parser.js';
import { generateCss } from './src/generator/css-generator.js';
import { writeFileSync } from 'node:fs';
import * as CAPS from './src/utils/card-caps.js';

type S = Record<string, any>;
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

// card type -> a plausible config (entity where the card has one)
const CARDS: Record<string, S> = {
  tile: { entity: 'light.ceiling_lights' },
  button: { entity: 'light.ceiling_lights' },
  entity: { entity: 'sensor.outside_temperature' },
  sensor: { entity: 'sensor.outside_temperature' },
  light: { entity: 'light.ceiling_lights' },
  gauge: { entity: 'sensor.outside_temperature' },
  thermostat: { entity: 'climate.hvac' },
  humidifier: { entity: 'humidifier.humidifier' },
  heading: { heading: 'Living room', icon: 'mdi:sofa' },
  glance: { entities: ['light.ceiling_lights', 'sensor.outside_temperature'] },
  markdown: { content: 'Hello **world**' },
  entities: { entities: ['light.ceiling_lights', 'sensor.outside_temperature'] },
  picture: { image: '/local/x.png' },
  'picture-entity': { entity: 'light.ceiling_lights', image: '/local/x.png' },
  'picture-glance': { entities: ['light.ceiling_lights'], image: '/local/x.png', title: 'Room' },
  'picture-elements': { image: '/local/x.png', elements: [] },
  'media-control': { entity: 'media_player.living_room' },
  'alarm-panel': { entity: 'alarm_control_panel.security' },
  'weather-forecast': { entity: 'weather.demo_weather_south' },
  calendar: { entities: ['calendar.calendar_1'] },
  'history-graph': { entities: ['sensor.outside_temperature'] },
  'statistics-graph': { entities: ['sensor.outside_temperature'] },
  statistic: { entity: 'sensor.outside_temperature', stat_type: 'mean' },
  logbook: { entities: ['light.ceiling_lights'] },
  'todo-list': { entity: 'todo.shopping_list' },
  map: { entities: ['zone.home'] },
  iframe: { url: 'https://example.com' },
  area: { area: 'living_room' },
  clock: {},
  'custom:mushroom-entity-card': { entity: 'light.ceiling_lights' },
  'custom:mushroom-light-card': { entity: 'light.ceiling_lights' },
  'custom:mushroom-template-card': { entity: 'light.ceiling_lights', primary: 'Hi', icon: 'mdi:star' },
  'custom:mushroom-chips-card': { chips: [{ type: 'entity', entity: 'light.ceiling_lights' }] },
  'custom:mushroom-title-card': { title: 'Title', subtitle: 'Sub' },
  'custom:mushroom-climate-card': { entity: 'climate.hvac' },
  'custom:bubble-card/button': { card_type: 'button', button_type: 'switch', entity: 'light.ceiling_lights' },
  'custom:bubble-card/button/slider': { card_type: 'button', button_type: 'slider', entity: 'light.ceiling_lights' },
  'custom:bubble-card/separator': { card_type: 'separator', name: 'Sep', icon: 'mdi:sofa' },
  'custom:bubble-card/cover': { card_type: 'cover', entity: 'cover.kitchen_window' },
};

const RULES = [
  { id: 'r1', operator: '<', value: 10, color: '#2196f3' },
  { id: 'r2', operator: '>=', value: 20, color: '#ff0000' },
];
const STOPS = [
  { id: 's1', value: 0, color: '#2196f3' },
  { id: 's2', value: 50, color: '#ffeb3b' },
  { id: 's3', value: 100, color: '#ff0000' },
];
const VAL = { when: 'value', valueEntity: 'sensor.outside_temperature', valueOperator: '>', valueThreshold: 20 };

// name -> mutation of a fresh default state
const M: Record<string, (s: S) => void> = {
  'filter:gray-off': (s) => Object.assign(s.filter, { enabled: true, grayscale: true, grayscaleWhen: 'off' }),
  'filter:gray-always': (s) => Object.assign(s.filter, { enabled: true, grayscale: true, grayscaleWhen: 'always' }),
  'filter:gray-on': (s) => Object.assign(s.filter, { enabled: true, grayscale: true, grayscaleWhen: 'on' }),
  'filter:gray-custom': (s) => Object.assign(s.filter, { enabled: true, grayscale: true, grayscaleWhen: 'custom', customEntity: 'switch.decorative_lights' }),
  'filter:bright-blur': (s) => Object.assign(s.filter, { enabled: true, brightness: 60, blur: 3 }),
  'filter:opacity': (s) => Object.assign(s.filter, { enabled: true, opacity: 50 }),
  'filter:effects-off': (s) => Object.assign(s.filter, { enabled: true, brightness: 50, effectsWhen: { when: 'off' } }),
  'filter:effects-value': (s) => Object.assign(s.filter, { enabled: true, blur: 2, effectsWhen: clone(VAL) }),
  'filter:transition': (s) => Object.assign(s.filter, { enabled: true, brightness: 120, transitionMs: 800 }),
  'filter:all': (s) => Object.assign(s.filter, { enabled: true, grayscale: true, grayscaleWhen: 'off', brightness: 80, blur: 1, opacity: 70 }),

  'icon:plain': (s) => Object.assign(s.iconColor, { enabled: true, mode: 'plain', color: '#ff0000' }),
  'icon:plain-var': (s) => Object.assign(s.iconColor, { enabled: true, mode: 'plain', color: 'var(--red-color)' }),
  'icon:cond-default': (s) => Object.assign(s.iconColor, { enabled: true, mode: 'conditional' }),
  'icon:cond': (s) => Object.assign(s.iconColor, { enabled: true, mode: 'conditional', colorOn: '#00ff00', colorOff: '#333333' }),
  'icon:cond-entity': (s) => Object.assign(s.iconColor, { enabled: true, mode: 'conditional', colorOn: '#00ff00', colorOff: '#333333', entityId: 'switch.decorative_lights' }),
  'icon:light': (s) => Object.assign(s.iconColor, { enabled: true, mode: 'light', colorOff: '#333333' }),
  'icon:plain-size': (s) => Object.assign(s.iconColor, { enabled: true, mode: 'plain', color: '#ff0000', sizePx: 30 }),
  'icon:cond-size': (s) => Object.assign(s.iconColor, { enabled: true, mode: 'conditional', colorOn: '#00ff00', colorOff: '#333333', sizePx: 30, sizeOffPx: 20, sizeWhen: { when: 'on' } }),

  'accent:plain': (s) => Object.assign(s.accentColor, { enabled: true, mode: 'plain', color: '#ff00ff' }),
  'accent:plain-var': (s) => Object.assign(s.accentColor, { enabled: true, mode: 'plain', color: 'var(--teal-color)' }),
  'accent:cond': (s) => Object.assign(s.accentColor, { enabled: true, mode: 'conditional', colorOn: '#ff00ff', colorOff: '#444444' }),
  'accent:cond-entity': (s) => Object.assign(s.accentColor, { enabled: true, mode: 'conditional', colorOn: '#ff00ff', colorOff: '#444444', entityId: 'switch.decorative_lights' }),

  'bg:solid': (s) => Object.assign(s.background, { enabled: true, type: 'solid', color1: '#ff0000' }),
  'bg:solid-rgba': (s) => Object.assign(s.background, { enabled: true, type: 'solid', color1: 'rgba(255, 0, 0, 0.5)' }),
  'bg:solid-var': (s) => Object.assign(s.background, { enabled: true, type: 'solid', color1: 'var(--primary-color)' }),
  'bg:gradient': (s) => Object.assign(s.background, { enabled: true, type: 'gradient', color1: '#ff0000', color2: '#0000ff', angle: 90 }),
  'bg:solid-on': (s) => Object.assign(s.background, { enabled: true, type: 'solid', color1: '#ff0000', applyWhen: 'on' }),
  'bg:solid-off': (s) => Object.assign(s.background, { enabled: true, type: 'solid', color1: '#ff0000', applyWhen: 'off' }),
  'bg:solid-custom': (s) => Object.assign(s.background, { enabled: true, type: 'solid', color1: '#ff0000', applyWhen: 'custom', customEntity: 'switch.decorative_lights' }),
  'bg:gradient-on': (s) => Object.assign(s.background, { enabled: true, type: 'gradient', color1: '#ff0000', color2: '#0000ff', angle: 45, applyWhen: 'on' }),

  ...Object.fromEntries(['pulse', 'breathe', 'gradient-shift', 'bounce', 'blink', 'shake', 'spin', 'glow', 'heartbeat'].map((p) =>
    [`anim:${p}`, (s: S) => Object.assign(s.animation, { enabled: true, preset: p, speedS: 3 })])),
  'anim:pulse-on': (s) => Object.assign(s.animation, { enabled: true, preset: 'pulse', trigger: 'on' }),
  'anim:pulse-off': (s) => Object.assign(s.animation, { enabled: true, preset: 'pulse', trigger: 'off' }),
  'anim:blink-custom': (s) => Object.assign(s.animation, { enabled: true, preset: 'blink', trigger: 'custom', customEntity: 'switch.decorative_lights' }),
  'anim:shake-value': (s) => Object.assign(s.animation, { enabled: true, preset: 'shake', trigger: 'value', valueEntity: 'sensor.outside_temperature', valueOperator: '>', valueThreshold: 20 }),
  'anim:glow-value-attr': (s) => Object.assign(s.animation, { enabled: true, preset: 'glow', trigger: 'value', valueEntity: 'sensor.outside_temperature', valueAttribute: 'battery_level', valueOperator: '<=', valueThreshold: 15.5 }),
  'anim:gshift+bg': (s) => { Object.assign(s.animation, { enabled: true, preset: 'gradient-shift' }); Object.assign(s.background, { enabled: true, type: 'gradient', color1: '#ff0000', color2: '#0000ff', angle: 90 }); },

  'border:radius': (s) => Object.assign(s.border, { enabled: true, radiusPx: 20 }),
  'border:width': (s) => Object.assign(s.border, { enabled: true, borderWidth: 2, borderColor: '#00aa00' }),
  'border:width-r0': (s) => Object.assign(s.border, { enabled: true, borderWidth: 3, borderColor: 'var(--red-color)', radiusPx: 0 }),
  'border:width-on': (s) => Object.assign(s.border, { enabled: true, borderWidth: 3, borderColor: '#00aa00', widthWhen: { when: 'on' }, widthOffPx: 1 }),
  'border:width-off0': (s) => Object.assign(s.border, { enabled: true, borderWidth: 3, borderColor: '#00aa00', widthWhen: { when: 'off' }, widthOffPx: 0 }),
  'border:width-value': (s) => Object.assign(s.border, { enabled: true, borderWidth: 4, borderColor: '#00aa00', widthWhen: clone(VAL), widthOffPx: 0 }),

  'heading:size': (s) => Object.assign(s.headingStyle, { enabled: true, fontSize: 30 }),
  'heading:all': (s) => Object.assign(s.headingStyle, { enabled: true, fontSize: 28, textColor: '#ff0000', fontWeight: 'bold', fontFamily: 'monospace', iconSize: 32, iconColor: '#00ff00', alignment: 'center' }),
  'heading:default-on': (s) => Object.assign(s.headingStyle, { enabled: true }),

  'font:default-on': (s) => Object.assign(s.font, { enabled: true }),
  'font:size': (s) => Object.assign(s.font, { enabled: true, fontSize: 20 }),
  'font:weight': (s) => Object.assign(s.font, { enabled: true, fontWeight: 'bold' }),
  'font:family': (s) => Object.assign(s.font, { enabled: true, fontFamily: 'monospace' }),
  'font:color': (s) => Object.assign(s.font, { enabled: true, color: '#ff0000' }),
  'font:all': (s) => Object.assign(s.font, { enabled: true, fontSize: 22, fontWeight: 'medium', fontFamily: 'Georgia, serif', color: '#ff0000' }),
  'font:number': (s) => Object.assign(s.font, { enabled: true, numberSizeEnabled: true, numberSize: 125 }),
  'font:number-only': (s) => Object.assign(s.font, { numberSizeEnabled: true, numberSize: 80 }),

  'thr:icon': (s) => Object.assign(s.threshold, { enabled: true, entityId: 'sensor.outside_temperature', properties: ['icon-color'], rules: clone(RULES) }),
  'thr:bg-text': (s) => Object.assign(s.threshold, { enabled: true, entityId: 'sensor.outside_temperature', properties: ['background', 'text-color'], rules: clone(RULES) }),
  'thr:accent-border': (s) => Object.assign(s.threshold, { enabled: true, entityId: 'sensor.outside_temperature', properties: ['accent-color', 'border-color'], rules: clone(RULES), borderWidth: 2 }),
  'thr:attr': (s) => Object.assign(s.threshold, { enabled: true, entityId: 'sensor.outside_temperature', attribute: 'battery_level', properties: ['icon-color'], rules: clone(RULES) }),
  'thr:gradient-bg': (s) => Object.assign(s.threshold, { enabled: true, entityId: 'sensor.outside_temperature', properties: ['background'], valueMode: 'gradient', colorStops: clone(STOPS) }),
  'thr:gradient-icon': (s) => Object.assign(s.threshold, { enabled: true, entityId: 'sensor.outside_temperature', properties: ['icon-color'], valueMode: 'gradient', colorStops: clone(STOPS) }),
  'thr:all': (s) => Object.assign(s.threshold, { enabled: true, entityId: 'sensor.outside_temperature', properties: ['icon-color', 'background', 'text-color', 'accent-color', 'border-color'], rules: clone(RULES), borderWidth: 1 }),
  'thr:mixed': (s) => Object.assign(s.threshold, { enabled: true, entityId: 'sensor.outside_temperature', properties: ['background'], rules: [{ id: 'r1', operator: '<=', value: 10, color: '#2196f3' }, { id: 'r2', operator: '>=', value: 1, color: '#ff0000' }] }),
  'thr:mixed3': (s) => Object.assign(s.threshold, { enabled: true, entityId: 'sensor.outside_temperature', properties: ['icon-color', 'text-color'], rules: [{ id: 'r1', operator: '>', value: 5, color: '#2196f3' }, { id: 'r2', operator: '<', value: 30, color: '#ff0000' }, { id: 'r3', operator: '>=', value: 20, color: '#00aa00' }] }),
  'thr:one-rule-eq': (s) => Object.assign(s.threshold, { enabled: true, entityId: 'sensor.outside_temperature', properties: ['background'], rules: [{ id: 'r1', operator: '==', value: 0, color: '#123456' }], defaultColor: '#abcdef' }),

  'adv:simple': (s) => { s.advanced.rawCss = 'ha-card {\n  box-shadow: none;\n}'; },
  'adv:nested': (s) => { s.advanced.rawCss = '.name {\n  letter-spacing: 2px;\n}\n\n@media (max-width: 600px) {\n  ha-card {\n    padding: 4px;\n  }\n}'; },
};

const names = Object.keys(M);
// representative one-per-module set for pairs
const REP = ['filter:bright-blur', 'icon:cond', 'accent:cond', 'bg:solid-on', 'anim:pulse-on', 'border:width', 'font:all', 'thr:bg-text', 'adv:simple'];
const combos: string[][] = names.map((n) => [n]);
for (let i = 0; i < REP.length; i++) for (let j = i + 1; j < REP.length; j++) combos.push([REP[i], REP[j]]);
// seeded triples / quads
let seed = Number(process.env.SEED || 12345);
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let k = 0; k < Number(process.env.RAND || 80); k++) {
  const n = 3 + Math.floor(rnd() * 3);
  const set = new Set<string>();
  while (set.size < n) set.add(names[Math.floor(rnd() * names.length)]);
  combos.push([...set]);
}
combos.push(['filter:all', 'icon:cond-size', 'accent:cond', 'bg:gradient-on', 'anim:pulse-on', 'border:width-on', 'font:all', 'thr:all', 'adv:simple']);
combos.push(['heading:all', 'filter:bright-blur', 'anim:pulse', 'adv:simple']);

// Only what that version's own panel offered for the card type.
const C: any = CAPS;
const has = (set: string, type: string) => C[set] instanceof Set && C[set].has(type);
const OWN_COND = /^(bg:(solid|gradient)-(on|off)|icon:cond(-default|-size)?$|icon:light|accent:cond$|anim:pulse-(on|off)|filter:gray-on|filter:effects-off|border:width-(on|off0))/;
function allowed(name: string, key: string, config: S): boolean {
  const type = key.split('/')[0];
  const mod = name.split(':')[0];
  if (mod === 'heading') return type === 'heading';
  if (typeof C.capsFor === 'function') {
    const m = C.capsFor(key, config).modules ?? {};
    const map: S = { filter: 'filter', icon: 'iconColor', accent: 'accentColor', bg: 'background', anim: 'animation', border: 'border', font: 'font', thr: 'threshold' };
    if (map[mod] && m[map[mod]] === false) return false;
  } else {
    if (mod === 'anim' && has('NO_ANIMATION_TYPES', type)) return false;
    if (mod === 'bg' && has('NO_BACKGROUND_TYPES', type)) return false;
    if (mod === 'border' && has('NO_BORDER_TYPES', type)) return false;
    if (mod === 'icon' && has('NO_ICON_COLOR_TYPES', type)) return false;
    if (mod === 'accent' && has('NO_ACCENT_TYPES', type)) return false;
    if (mod === 'font' && has('NO_FONT_TYPES', type)) return false;
    if (mod === 'thr' && has('NO_THRESHOLD_TYPES', type)) return false;
  }
  if (name.includes('size') && mod === 'icon' && !(C.ICON_SIZE_TYPES instanceof Set && C.ICON_SIZE_TYPES.has(type)) && typeof C.capsFor !== 'function') return false;
  if (name.startsWith('font:number') && type !== 'gauge' && type !== 'thermostat') return false;
  // a card without an entity of its own never offered "while this entity is ON / OFF"
  if (OWN_COND.test(name) && (has('NON_STATE_CARD_TYPES', type) || !config.entity)) return false;
  return true;
}
function thrProps(s: S, key: string): boolean {
  if (!s.threshold?.enabled || typeof C.thresholdPropertyAllowed !== 'function') return true;
  s.threshold.properties = s.threshold.properties.filter((p: string) => { try { return C.thresholdPropertyAllowed(p, key); } catch { return true; } });
  return s.threshold.properties.length > 0;
}

const out: any[] = [];
const presets: any[] = [];
let errors = 0;
for (const [key, extra] of Object.entries(CARDS)) {
  const type = key.split('/')[0];
  const config = { type, ...extra };
  let base: S;
  try { base = mapToStudioState(parseStyleValue(''), key) as S; } catch { continue; }
  for (const c of combos) {
    const s = clone(base);
    const use = c.filter((n) => allowed(n, key, config));
    if (!use.length) continue;
    try {
      for (const n of use) M[n](s);
      if (!thrProps(s, key)) continue;
      const css = (generateCss as any)(s, key, { config });
      if (typeof css === 'string' && css.trim()) { out.push({ type: key, config, mut: use.join('+'), css }); if (['tile','gauge','heading','entities','button','light'].includes(key)) presets.push({ type: key, config, mut: use.join('+'), css, state: s }); }
    } catch (e) { errors++; }
  }
}
writeFileSync(process.env.OUT || 'corpus.json', JSON.stringify(out));
if (!process.env.OUT) writeFileSync('presets.json', JSON.stringify(presets));
console.log(`cases=${out.length} errors=${errors} cards=${Object.keys(CARDS).length} combos=${combos.length}`);

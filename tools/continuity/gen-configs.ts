// Runs inside an old release tree: writes whole card configs (string and
// dictionary form, incl. the Studio's own Number size entry) with that
// version's applyStudioState.
(globalThis as any).customElements = { get: (n: string) => (n === (process.env.ENGINE || 'card-mod') ? class {} : undefined), define() {}, whenDefined: () => Promise.resolve() };
const { buildMergedStudioState, applyStudioState } = await import('./src/editor/studio-state.js');
import { writeFileSync } from 'node:fs';
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const BASES: any[] = [
  { type: 'gauge', entity: 'sensor.outside_temperature' },
  { type: 'gauge', entity: 'sensor.outside_temperature', needle: true },
  { type: 'thermostat', entity: 'climate.hvac' },
  { type: 'tile', entity: 'light.ceiling_lights' },
  // hand-written dictionary styles
  { type: 'gauge', entity: 'sensor.outside_temperature', card_mod: { style: { '.': 'ha-card {\n  border-radius: 20px;\n}', 'ha-gauge$': 'text.value-text {\n  font-weight: 700;\n}' } } },
  { type: 'tile', entity: 'light.ceiling_lights', card_mod: { style: { 'ha-tile-icon$': '.container {\n  border-radius: 4px;\n}', '.': 'ha-card {\n  background: #112233;\n}' } } },
  { type: 'thermostat', entity: 'climate.hvac', card_mod: { style: { 'ha-state-control-climate-temperature$': '.x {\n  color: red;\n}' } } },
  { type: 'entities', entities: [{ entity: 'light.bed_light', card_mod: { style: { '.': ':host {\n  color: red;\n}', 'hui-generic-entity-row$': '.info {\n  opacity: 0.5;\n}' } } }, 'sensor.outside_temperature'], card_mod: { style: 'ha-card {\n  border-radius: 8px;\n}' } },
];
const MUTS: Record<string, (s: any) => void> = {
  none: () => {},
  bg: (s) => Object.assign(s.background, { enabled: true, type: 'solid', color1: '#ff0000' }),
  'font-size': (s) => Object.assign(s.font, { enabled: true, fontSize: 20 }),
  'font-family': (s) => Object.assign(s.font, { enabled: true, fontFamily: 'monospace' }),
  ...Object.fromEntries([50, 80, 100, 125, 130, 150].map((n) => [`number-${n}`, (s: any) => Object.assign(s.font, { enabled: true, numberSizeEnabled: true, numberSize: n })])),
  'number-120+size': (s) => Object.assign(s.font, { enabled: true, fontSize: 18, numberSizeEnabled: true, numberSize: 120 }),
  'number-90+accent': (s) => { Object.assign(s.font, { enabled: true, numberSizeEnabled: true, numberSize: 90 }); Object.assign(s.accentColor, { enabled: true, mode: 'plain', color: '#ff00ff' }); },
  'number-only-font-off': (s) => Object.assign(s.font, { numberSizeEnabled: true, numberSize: 110 }),
  'adv': (s) => { s.advanced.rawCss = [s.advanced.rawCss, '.name {\n  letter-spacing: 2px;\n}'].filter(Boolean).join('\n\n'); },
};
const out: any[] = []; let errors = 0;
for (const base of BASES) for (const [mut, f] of Object.entries(MUTS)) {
  if (/number/.test(mut) && base.type !== 'gauge' && base.type !== 'thermostat') continue;
  try {
    const state: any = clone(buildMergedStudioState(clone(base)));
    f(state);
    const written = (applyStudioState as any)(state, clone(base));
    out.push({ base, mut, written });
  } catch (e: any) { errors++; console.log('ERR', base.type, mut, String(e?.message).slice(0, 100)); }
}
writeFileSync('configs.json', JSON.stringify(out));
console.log(`configs=${out.length} errors=${errors}`);

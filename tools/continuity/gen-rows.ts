import { generateEntityRowCss } from './src/editor/studio-state.js';
import { writeFileSync } from 'node:fs';
const RULES = [{ id: 'r1', operator: '<', value: 10, color: '#2196f3' }, { id: 'r2', operator: '>=', value: 20.5, color: '#ff0000' }];
const base = { iconColor: '', textColor: '' };
const M: Record<string, any> = {
  icon: { iconColor: '#ff0000' },
  'icon-var': { iconColor: 'var(--red-color)' },
  text: { textColor: '#00aa00' },
  both: { iconColor: '#ff0000', textColor: '#00aa00' },
  'icon-thr': { iconMode: 'threshold', iconRules: RULES, iconDefault: '#888888' },
  'text-thr': { textMode: 'threshold', textRules: RULES, textDefault: '#888888' },
  'both-thr': { iconMode: 'threshold', iconRules: RULES, iconDefault: '#888888', textMode: 'threshold', textRules: RULES, textDefault: '#444444' },
  'icon-thr+text': { iconMode: 'threshold', iconRules: RULES, iconDefault: '#888888', textColor: '#00aa00' },
  size: { fontSizePx: 20 },
  weight: { fontWeight: 'bold' },
  'size+weight': { fontSizePx: 18, fontWeight: 'medium' },
  'all-static': { iconColor: '#ff0000', textColor: '#00aa00', fontSizePx: 20, fontWeight: 'bold' },
  extra: { extraCss: ':host {\n  opacity: 0.5;\n}' },
  'icon+extra': { iconColor: '#ff0000', extraCss: '.info {\n  letter-spacing: 1px;\n}' },
  'icon-while-on': { iconColor: '#ff0000', iconWhileOn: true },
  'all': { iconMode: 'threshold', iconRules: RULES, iconDefault: '#888888', textColor: '#00aa00', fontSizePx: 22, fontWeight: 'bold', extraCss: ':host {\n  opacity: 0.8;\n}' },
};
const out: any[] = []; let errors = 0;
for (const entity of ['light.ceiling_lights', 'sensor.outside_temperature', 'switch.ac']) for (const [name, m] of Object.entries(M)) {
  try { const css = (generateEntityRowCss as any)({ ...base, ...JSON.parse(JSON.stringify(m)) }, entity); if (typeof css === 'string' && css.trim()) out.push({ entity, mut: name, css }); } catch (e) { errors++; }
}
writeFileSync('rows.json', JSON.stringify(out));
console.log(`rows=${out.length} errors=${errors}`);

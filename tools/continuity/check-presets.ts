import { migrateStudioState } from '../../src/parser/state-mapper.js';
import { generateCss } from '../../src/generator/css-generator.js';
import { filterPresetStateForCardType } from '../../src/utils/preset-caps.js';
import { extract } from './extract.js';
import { readFileSync } from 'node:fs';
const WORK = process.env.CONT_WORK || new URL('./.work', import.meta.url).pathname;
const groups = new Map<string, { n: number; ex: any; v: Set<string>; t: Set<string> }>();
const bump = (k: string, v: string, t: string, ex: any) => { const g = groups.get(k) ?? groups.set(k, { n: 0, ex, v: new Set(), t: new Set() }).get(k)!; g.n++; g.v.add(v); g.t.add(t); };
let n = 0, threw = 0, same = 0;
for (const v of (process.env.VERS || 'v0.8.1,v0.9.1,v0.10.0,v0.10.1,v0.10.2,v0.11.0-beta.1,v0.11.0-beta.2,v0.11.0-beta.3').split(',')) {
  for (const c of JSON.parse(readFileSync(`${WORK}/${v}/presets.json`, 'utf8'))) {
    n++;
    try {
      const st = migrateStudioState(JSON.parse(JSON.stringify(c.state)));
      const filtered = (filterPresetStateForCardType as any)(st, c.type, c.config);
      const css = generateCss(filtered, c.type, { config: c.config });
      if (css === c.css) { same++; continue; }
      const A = extract(c.css), B = extract(css);
      for (const [k, av] of A) { const bv = B.get(k); if (!bv) bump(`LOST | ${k}`, v, c.type, { v, type: c.type, mut: c.mut, old: av[0].slice(0, 110) }); else if ([...av].sort().join('¦') !== [...bv].sort().join('¦')) bump(`CHANGED | ${k}`, v, c.type, { v, type: c.type, mut: c.mut, old: av[0].slice(0, 110), neu: bv[0].slice(0, 110) }); }
      for (const [k, bv] of B) if (!A.has(k)) bump(`ADDED | ${k}`, v, c.type, { mut: c.mut, neu: bv[0].slice(0, 90) });
    } catch (e: any) { threw++; bump(`THREW | ${String(e?.message).slice(0, 90)}`, v, c.type, { v, type: c.type, mut: c.mut }); }
  }
}
console.log({ n, threw, sameCss: same });
for (const kind of ['THREW', 'LOST', 'CHANGED', 'ADDED']) {
  const r = [...groups.entries()].filter(([k]) => k.startsWith(kind)).sort((a, b) => b[1].n - a[1].n);
  console.log(`\n== ${kind}: ${r.length} groups`);
  for (const [k, g] of r.slice(0, 40)) console.log(String(g.n).padStart(5), k.slice(0, 80).padEnd(80), `v=${[...g.v].map((x) => x.replace('v0.', '')).join(',')} t=${[...g.t].join(',')} | ${JSON.stringify(g.ex).slice(0, 230)}`);
}

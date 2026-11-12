// Runs against the CURRENT source (HEAD): loads every style an old release
// wrote, re-saves it, and reports what was lost / changed / added, what did not
// reach a module (left in Advanced CSS) and whether a second save is stable.
import { mapToStudioState } from '../../src/parser/state-mapper.js';
import { parseStyleValue } from '../../src/parser/yaml-parser.js';
import { generateCss } from '../../src/generator/css-generator.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { extract } from './extract.js';

const WORK = process.env.CONT_WORK || new URL('./.work', import.meta.url).pathname;
const VERSIONS = (process.env.VERS || 'v0.8.1,v0.9.1,v0.10.0,v0.10.1,v0.10.2,v0.11.0-beta.1,v0.11.0-beta.2,v0.11.0-beta.3').split(',');

type G = { n: number; versions: Set<string>; types: Set<string>; ex: any };
const groups = new Map<string, G>();
const bump = (key: string, v: string, type: string, ex: any) => {
  const g = groups.get(key) ?? groups.set(key, { n: 0, versions: new Set(), types: new Set(), ex }).get(key)!;
  g.n++; g.versions.add(v); g.types.add(type);
};
const totals: Record<string, number> = {};
const t = (k: string) => (totals[k] = (totals[k] || 0) + 1);

const t0 = Date.now();
for (const v of VERSIONS) {
  const corpus = JSON.parse(readFileSync(`${WORK}/${v}/${process.env.CORPUS || "corpus.json"}`, 'utf8')) as { type: string; config: any; mut: string; css: string }[];
  for (const c of corpus) {
    t('cases');
    let css1 = '', css2 = '', s1: any;
    try {
      s1 = mapToStudioState(parseStyleValue(c.css), c.type, c.config);
      css1 = generateCss(s1, c.type, { config: c.config });
      const s2 = mapToStudioState(parseStyleValue(css1), c.type, c.config);
      css2 = generateCss(s2, c.type, { config: c.config });
    } catch (e: any) {
      t('threw'); bump(`THREW | ${String(e?.message).slice(0, 80)}`, v, c.type, { v, type: c.type, mut: c.mut, css: c.css.slice(0, 300) });
      continue;
    }
    if (css1 === c.css) t('byteIdentical');
    if (css2 !== css1) { t('unstable'); bump(`UNSTABLE | ${c.type}`, v, c.type, { v, type: c.type, mut: c.mut, css: c.css, css1, css2 }); }
    const A = extract(c.css), B = extract(css1);
    let any = false;
    for (const [k, av] of A) {
      const bv = B.get(k);
      if (!bv) { any = true; bump(`LOST | ${k}`, v, c.type, { v, type: c.type, mut: c.mut, old: av[0] }); continue; }
      const a = [...av].sort().join(' ¦ '), b = [...bv].sort().join(' ¦ ');
      if (a !== b) { any = true; bump(`CHANGED | ${k}`, v, c.type, { v, type: c.type, mut: c.mut, old: a.slice(0, 200), neu: b.slice(0, 200) }); }
    }
    for (const [k, bv] of B) if (!A.has(k)) { any = true; bump(`ADDED | ${k}`, v, c.type, { v, type: c.type, mut: c.mut, neu: bv[0].slice(0, 160) }); }
    if (any) t('differs');
    // Studio-written CSS that no module adopted
    if (!/adv:/.test(c.mut) && s1.advanced?.rawCss?.trim()) {
      t('remainder');
      for (const k of extract(s1.advanced.rawCss).keys()) bump(`REMAINDER | ${k}`, v, c.type, { v, type: c.type, mut: c.mut, rest: s1.advanced.rawCss.slice(0, 240) });
    }
  }
}
const rows = [...groups.entries()].map(([k, g]) => ({ key: k, n: g.n, versions: [...g.versions], types: [...g.types], ex: g.ex })).sort((a, b) => b.n - a.n);
writeFileSync(`${WORK}/${process.env.RESULT || "result.json"}`, JSON.stringify({ totals, rows }, null, 1));
console.log(JSON.stringify(totals), `${Date.now() - t0} ms`);
for (const kind of ['THREW', 'UNSTABLE', 'LOST', 'REMAINDER', 'CHANGED', 'ADDED']) {
  const r = rows.filter((x) => x.key.startsWith(kind));
  console.log(`\n== ${kind}: ${r.length} groups, ${r.reduce((a, x) => a + x.n, 0)} hits`);
  for (const x of r.slice(0, Number(process.env.TOP || 25))) console.log(String(x.n).padStart(6), x.key.slice(0, 150), `[${x.versions.length}v ${x.types.length}t]`);
}

import { parseEntityRowCss } from '../../src/parser/state-mapper.js';
import { generateEntityRowCss } from '../../src/editor/studio-state.js';
import { readFileSync } from 'node:fs';
const WORK = process.env.CONT_WORK || new URL('./.work', import.meta.url).pathname;
const one = (s: string) => s.replace(/\n\s*/g, ' ').replace(/\s+/g, ' ');
let n = 0, same = 0, unstable = 0; const seen = new Set<string>();
for (const v of (process.env.VERS || 'v0.8.1,v0.9.1,v0.10.0,v0.10.1,v0.10.2,v0.11.0-beta.1,v0.11.0-beta.2,v0.11.0-beta.3').split(',')) {
  for (const c of JSON.parse(readFileSync(`${WORK}/${v}/rows.json`, 'utf8'))) {
    n++;
    const st: any = parseEntityRowCss(c.css, c.entity);
    const css1 = generateEntityRowCss(st, c.entity);
    const css2 = generateEntityRowCss(parseEntityRowCss(css1, c.entity), c.entity);
    if (css1 === c.css) { same++; }
    if (css2 !== css1) { unstable++; console.log('UNSTABLE', v, c.entity, c.mut, '\n  1:', one(css1), '\n  2:', one(css2)); }
    if (css1 !== c.css) {
      const key = `${c.mut}|${one(c.css).replace(c.entity, 'E')}|${one(css1).replace(c.entity, 'E')}`;
      if (!seen.has(key)) { seen.add(key); console.log(`\n[${v} ${c.mut} ${c.entity}]\n  OLD: ${one(c.css)}\n  NEW: ${one(css1)}\n  extraCss: ${JSON.stringify(st.extraCss ?? '')}`); }
    }
  }
}
console.log({ n, byteIdentical: same, unstable, distinctDiffs: seen.size });

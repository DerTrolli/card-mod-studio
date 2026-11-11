// Current tree: opens each config an old release wrote, saves it untouched,
// and compares the whole card config.
(globalThis as any).customElements = { get: (n: string) => (n === (process.env.ENGINE || 'card-mod') ? class {} : undefined), define() {}, whenDefined: () => Promise.resolve() };
const { buildMergedStudioState, applyStudioState } = await import('../../src/editor/studio-state.js');
import { readFileSync } from 'node:fs';
const WORK = process.env.CONT_WORK || new URL('./.work', import.meta.url).pathname;
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
let n = 0, same = 0, threw = 0, unstable = 0; const seen = new Map<string, { n: number; ex: any }>();
for (const v of (process.env.VERS || 'v0.10.2,v0.11.0-beta.1,v0.11.0-beta.2,v0.11.0-beta.3').split(',')) {
  for (const c of JSON.parse(readFileSync(`${WORK}/${v}/configs.json`, 'utf8'))) {
    n++;
    try {
      const st: any = buildMergedStudioState(clone(c.written));
      const again: any = applyStudioState(st, clone(c.written));
      const twice: any = applyStudioState(buildMergedStudioState(clone(again)), clone(again));
      if (JSON.stringify(twice) !== JSON.stringify(again)) unstable++;
      if (JSON.stringify(again) === JSON.stringify(c.written)) { same++; continue; }
      const key = `${v} | ${c.base.type}${c.base.card_mod ? ' (dict)' : ''}${c.base.needle ? ' needle' : ''} | ${c.mut}`;
      const g = seen.get(key) ?? seen.set(key, { n: 0, ex: { old: c.written.card_mod ?? c.written.entities, neu: again.card_mod ?? again.entities, font: st.font } }).get(key)!; g.n++;
    } catch (e: any) { threw++; console.log('THREW', v, c.base.type, c.mut, String(e?.message).slice(0, 120)); }
  }
}
console.log(JSON.stringify({ n, same, threw, unstable, differing: seen.size }));
const by = new Map<string, number>();
for (const [k, g] of seen) { const short = k.replace(/ \| number-[\w+-]*$/, ' | Number size'); by.set(short, (by.get(short) ?? 0) + g.n); }
for (const [k, c] of by) console.log(String(c).padStart(5), k);
if (process.env.VERBOSE) for (const [k, g] of seen) console.log('\n####', k, '\n OLD', JSON.stringify(g.ex.old).slice(0, 420), '\n NEW', JSON.stringify(g.ex.neu).slice(0, 420), '\n font', JSON.stringify(g.ex.font));

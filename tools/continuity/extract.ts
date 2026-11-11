// Declaration extractor that shares no code with the Studio's parser, so the
// checks do not inherit its blind spots.
/** Independent declaration extractor: Map "path :: prop" -> values[] */
export function extract(css: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (path: string, raw: string) => {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (!t) return;
    // property = text before the first ':' that is not inside a template
    let depth = 0, idx = -1;
    for (let i = 0; i < t.length; i++) {
      if (t.startsWith('{{', i) || t.startsWith('{%', i)) { depth++; i++; continue; }
      if (t.startsWith('}}', i) || t.startsWith('%}', i)) { depth--; i++; continue; }
      if (depth === 0 && t[i] === ':') { idx = i; break; }
    }
    const prop = idx > 0 ? t.slice(0, idx).trim().toLowerCase() : '';
    const val = idx > 0 ? t.slice(idx + 1).trim() : t;
    const key = `${path} :: ${prop || '<raw>'}`;
    (out.get(key) ?? out.set(key, []).get(key)!).push(val);
  };
  let i = 0;
  const block = (path: string): void => {
    let buf = '';
    while (i < css.length) {
      const two = css.substr(i, 2);
      if (two === '/*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 2; continue; }
      if (two === '{{' || two === '{%' || two === '{#') {
        const close = two === '{{' ? '}}' : two === '{%' ? '%}' : '#}';
        const e = css.indexOf(close, i + 2); const end = e < 0 ? css.length : e + 2;
        buf += css.slice(i, end); i = end; continue;
      }
      const ch = css[i];
      if (ch === '"' || ch === "'") {
        let j = i + 1; while (j < css.length && css[j] !== ch) { if (css[j] === '\\') j++; j++; }
        buf += css.slice(i, j + 1); i = j + 1; continue;
      }
      if (ch === '{') { const sel = buf.replace(/\s+/g, ' ').trim(); buf = ''; i++; block(path ? `${path} | ${sel}` : sel); continue; }
      if (ch === '}') { add(path, buf); i++; return; }
      if (ch === ';') { add(path, buf); buf = ''; i++; continue; }
      buf += ch; i++;
    }
    add(path, buf);
  };
  block('');
  return out;
}

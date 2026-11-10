/**
 * Lightweight, non-blocking checks for the Advanced CSS text. Pure; never
 * rewrites anything. It only looks for text that will break the card:
 * card-mod renders Jinja BEFORE parsing CSS, so a template that fails to
 * render drops the whole style, while an unclosed `{` only spoils the
 * rules after it.
 *
 * Jinja is recognised first, anywhere (inside CSS strings and comments
 * too, as the template engine does), as one atomic token: its own braces
 * and quotes never reach the CSS checks. `{{ {'a': 1} }}` is handled the
 * way Jinja's lexer does — `}}` only closes when no inner `{` is open.
 */

export interface CssIssue {
  message: string;
  /** 1-based line the problem starts on. */
  line: number;
}

const FATAL = ' — the whole card would lose its styling';

/** Blocks that need a closing tag, and what closes them. */
const END_OF: Record<string, string> = {
  endif: 'if', endfor: 'for', endmacro: 'macro', endcall: 'call', endfilter: 'filter',
  endblock: 'block', endwith: 'with', endautoescape: 'autoescape', endset: 'set',
};
const OPENERS = new Set(['if', 'for', 'macro', 'call', 'filter', 'block', 'with', 'autoescape']);

/** Index just past the closing delimiter of a `{{` / `{%` tag starting its body at `from`, or -1. */
function endOfTag(s: string, from: number, close: '}}' | '%}'): number {
  let braces = 0;
  let quote = '';
  for (let i = from; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (close === '}}' && ch === '{') braces++;
    else if (close === '}}' && ch === '}') {
      if (braces > 0) braces--;
      else if (s[i + 1] === '}') return i + 2;
    } else if (close === '%}' && ch === '%' && s[i + 1] === '}') return i + 2;
  }
  return -1;
}

interface Found { issue: CssIssue; rank: number }

let lastText: string | undefined;
let lastIssue: CssIssue | undefined;
/** Scans actually run — lets a test see that an unchanged text isn't re-linted. */
export const lintStats = { scans: 0 };

/** The most serious problem found (template failures first), or undefined.
 *  The module renders on every state change, so the last result is reused
 *  while the text is the same. */
export function lintAdvancedCss(text: string): CssIssue | undefined {
  if (text === lastText) return lastIssue;
  lintStats.scans++;
  lastIssue = scan(text);
  lastText = text;
  return lastIssue;
}

function scan(text: string): CssIssue | undefined {
  const found: Found[] = [];
  // Newline offsets once, so each lookup is a binary search, not a rescan.
  const newlines: number[] = [];
  for (let k = text.indexOf('\n'); k >= 0; k = text.indexOf('\n', k + 1)) newlines.push(k);
  const lineAt = (idx: number) => {
    let lo = 0, hi = newlines.length; // count of newlines before idx
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (newlines[mid] < idx) lo = mid + 1; else hi = mid;
    }
    return lo + 1;
  };
  const add = (rank: number, line: number, message: string) => found.push({ rank, issue: { line, message: `${message} (line ${line})` } });

  const tags: Array<{ name: string; line: number; braces: number }> = [];
  const braceLines: number[] = [];
  let state: 'css' | 'comment' | 'string' = 'css';
  let quote = '';
  let startLine = 0;
  // Jinja emits `{% raw %}` content literally, so the CSS sees it; but we
  // can't tell whether a `{` or `}` there is meant to pair up with the CSS
  // around it, so braces inside raw count when they pair and never warn.
  let rawEnd = -1;

  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    const jinja = i >= rawEnd;

    if (jinja && two === '{{') {
      const end = endOfTag(text, i + 2, '}}');
      if (end < 0) { add(0, lineAt(i), `Unterminated {{ — missing }}${FATAL}`); break; }
      i = end;
      continue;
    }
    if (jinja && two === '{#') {
      const end = text.indexOf('#}', i + 2);
      if (end < 0) { add(0, lineAt(i), `Unterminated {# comment — missing #}${FATAL}`); break; }
      i = end + 2;
      continue;
    }
    if (jinja && two === '{%') {
      const end = endOfTag(text, i + 2, '%}');
      if (end < 0) { add(0, lineAt(i), `Unterminated {% — missing %}${FATAL}`); break; }
      const line = lineAt(i);
      const body = text.slice(i + 2, end - 2).replace(/^[-+]/, '').replace(/[-+]$/, '').trim();
      const name = /^\w+/.exec(body)?.[0] ?? '';
      i = end;
      if (name === 'raw') {
        const close = /\{%[-+]?\s*endraw\s*[-+]?%\}/.exec(text.slice(i));
        if (!close) { add(1, line, `{% raw %} without {% endraw %}${FATAL}`); break; }
        rawEnd = i + close.index;
      } else if (OPENERS.has(name) || (name === 'set' && !/(?:^|[^=!<>])=(?!=)/.test(body.replace(/(["'])(?:\\.|(?!\1).)*\1/g, '')))) {
        // `{% set x %}` without `=` is the block form; `{% set x = 1 %}` is one tag.
        tags.push({ name, line, braces: braceLines.length });
      } else if (name === 'elif' || name === 'else') {
        const top = tags[tags.length - 1];
        if (!top || (top.name !== 'if' && !(name === 'else' && top.name === 'for'))) {
          add(1, line, `{% ${name} %} without a matching {% if %}${FATAL}`);
        } else {
          // Each branch is checked on its own: `{ … }` may open in one
          // branch and close in the next only when the totals agree.
          braceLines.length = top.braces;
        }
      } else if (name in END_OF) {
        const want = END_OF[name];
        const top = tags[tags.length - 1];
        if (!top) add(1, line, `{% ${name} %} without a matching {% ${want} %}${FATAL}`);
        else if (top.name !== want) {
          add(1, line, `{% ${name} %} closes the wrong block — {% ${top.name} %} from line ${top.line} is still open${FATAL}`);
          tags.pop();
        } else tags.pop();
      }
      continue;
    }

    const ch = text[i];
    if (state === 'comment') {
      if (two === '*/') { state = 'css'; i += 2; } else i++;
    } else if (state === 'string') {
      if (ch === '\\') i += text[i + 1] === '\r' && text[i + 2] === '\n' ? 3 : 2; // `\`+CRLF continues the string
      else {
        if (ch === quote) state = 'css';
        else if (ch === '\n') { add(3, startLine, `Unterminated string — missing closing ${quote}`); state = 'css'; }
        i++;
      }
    } else if (two === '/*') {
      state = 'comment';
      startLine = lineAt(i);
      i += 2;
    } else if (ch === '"' || ch === "'") {
      state = 'string';
      quote = ch;
      startLine = lineAt(i);
      i++;
    } else if (ch === '\\') {
      i += 2;
    } else {
      if (ch === '{') braceLines.push(jinja ? lineAt(i) : -lineAt(i));
      else if (ch === '}') {
        if (braceLines.length) braceLines.pop();
        else if (jinja) add(4, lineAt(i), 'Unmatched } — there is no { to close');
      }
      i++;
    }
  }

  if (state === 'comment') add(2, startLine, 'Unterminated /* comment — missing */');
  if (state === 'string') add(3, startLine, `Unterminated string — missing closing ${quote}`);
  const open = tags[tags.length - 1];
  if (open) {
    const end = open.name === 'set' ? 'endset' : `end${open.name}`;
    add(1, open.line, `{% ${open.name} %} without {% ${end} %}${FATAL}`);
  }
  const unclosed = braceLines.filter((n) => n > 0); // never one opened inside raw
  if (unclosed.length) add(4, unclosed[unclosed.length - 1], 'Unclosed { — a rule is missing its closing brace');

  found.sort((a, b) => a.rank - b.rank || a.issue.line - b.issue.line);
  return found[0]?.issue;
}

/**
 * True when a Jinja STATEMENT (`{% … %}`) sits outside every CSS `{ … }` —
 * the exact case where the parser keeps the whole style verbatim in
 * Advanced CSS (css-parser.ts splitIntoBlocks → `verbatim`), leaving every
 * module off. Deliberately mirrors that parser: Jinja spans are cut out
 * with the same non-greedy pattern, braces are counted outside CSS comments
 * only (not strings), a statement in a depth-0 comment still counts, and
 * `{{ … }}` values never do.
 */
export function hasTopLevelJinjaStatement(css: string): boolean {
  if (!css.includes('{%')) return false;
  const cleaned = css.replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g, (m) => (m[1] === '%' ? '\u0001' : '\u0002'));
  let depth = 0;
  let inComment = false;
  // A statement since the last rule closed: the parser tests the text after
  // the last complete block too, so a `{% %}` inside a `{` that never closes
  // also keeps the style verbatim.
  let sinceClose = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '\u0001') {
      if (depth === 0) return true;
      sinceClose = true;
    }
    if (inComment) {
      if (ch === '*' && cleaned[i + 1] === '/') { inComment = false; i++; }
      continue;
    }
    if (ch === '/' && cleaned[i + 1] === '*') { inComment = true; i++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { if (depth > 0 && --depth === 0) sinceClose = false; }
  }
  return depth > 0 && sinceClose;
}

/** The banner sentence for a style the Studio keeps whole. "The modules stay
 *  off" is only true when none is on — a `uix` key can still supply module
 *  state beside a verbatim `card_mod` style. */
export function templateStatementNote(modulesOn: boolean): string {
  return `This style uses template statements ({% … %}), so the Studio keeps all of it as written in Advanced CSS${modulesOn ? '.' : ' and the modules stay off.'}`;
}

/** True when any styling module of the state is switched on. */
export function anyModuleOn(s: object): boolean {
  return Object.entries(s).some(([k, m]) => k !== 'advanced' && !!m && typeof m === 'object' && (m as { enabled?: unknown }).enabled === true);
}

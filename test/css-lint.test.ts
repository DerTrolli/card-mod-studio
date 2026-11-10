/**
 * Advanced CSS lint (non-blocking warning line) and top-level Jinja
 * statement detection. Pure-function tables + the RENDERED Advanced module.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { FakeCustomElementRegistry, templateText } from './v010-audit-helpers.js';
import { lintAdvancedCss, hasTopLevelJinjaStatement } from '../src/utils/css-lint.js';
import { parseCssDetailed } from '../src/parser/css-parser.js';
import { generateCss } from '../src/generator/css-generator.js';
import {
  DEFAULT_FILTER, DEFAULT_ICON_COLOR, DEFAULT_ACCENT_COLOR, DEFAULT_BACKGROUND, DEFAULT_ANIMATION, DEFAULT_BORDER,
  DEFAULT_HEADING_STYLE, DEFAULT_FONT, DEFAULT_THRESHOLD,
} from '../src/parser/state-mapper.js';
import type { StudioState } from '../src/types/index.js';

const registry = new FakeCustomElementRegistry();
(globalThis as { customElements: unknown }).customElements = registry;
registry.define('card-mod', class {});

const msg = (css: string) => lintAdvancedCss(css)?.message;

// [name, text, expected message fragment, expected line]
const BROKEN: Array<[string, string, string, number]> = [
  ['missing closing brace', 'ha-card { outline: 3px solid lime;', 'Unclosed { — a rule is missing its closing brace', 1],
  ['missing brace, later line', 'ha-card {\n  color: red;\n}\nha-state-icon {\n  color: blue;', 'Unclosed {', 4],
  ['nested rule missing a brace', '@media (min-width: 1px) {\n  ha-card {\n    color: red;\n}', 'Unclosed {', 1],
  ['stray closing brace', 'ha-card { color: red; } }', 'Unmatched }', 1],
  ['stray brace first', '}\nha-card { color: red; }', 'Unmatched }', 1],
  ['unclosed {% if %}', "ha-card {\n  {% if is_state('a','on') %}\n  color: red;\n}", '{% if %} without {% endif %} — the whole card would lose its styling', 2],
  ['{% endif %} alone', 'ha-card { color: red; }\n{% endif %}', '{% endif %} without a matching {% if %}', 2],
  ['unclosed for', '{% for i in range(3) %}\nha-card { color: red; }', '{% for %} without {% endfor %}', 1],
  ['unclosed macro', '{% macro m(x) %}{{ x }}', '{% macro %} without {% endmacro %}', 1],
  ['unclosed block set', '{% set x %}red', '{% set %} without {% endset %}', 1],
  ['wrong closer', '{% if a %}x{% endfor %}', '{% endfor %} closes the wrong block — {% if %} from line 1 is still open', 1],
  ['else without if', 'a { b: c }\n{% else %}', '{% else %} without a matching {% if %}', 2],
  ['elif after for', '{% for x in y %}{% elif z %}{% endfor %}', '{% elif %} without a matching {% if %}', 1],
  ['unterminated {{', "ha-card { color: {{ states('a') ; }", 'Unterminated {{ — missing }}', 1],
  ['unterminated {%', 'ha-card { }\n{% if a', 'Unterminated {% — missing %}', 2],
  ['unterminated {#', '{# note\nha-card { }', 'Unterminated {# comment — missing #}', 1],
  ['unterminated css comment', 'ha-card { color: red; }\n/* oops\nha-card { }', 'Unterminated /* comment — missing */', 2],
  ['unterminated string (EOF)', 'a { content: "x', 'Unterminated string — missing closing "', 1],
  ['unterminated string (newline)', "a { content: 'x;\n  color: red; }", "Unterminated string — missing closing '", 1],
  ['unclosed raw', '{% raw %} a { ', '{% raw %} without {% endraw %}', 1],
  ['quote inside {{ }} does not hide the missing end', 'a { b: {{ "x }; }', 'Unterminated {{', 1],
];

describe('lintAdvancedCss — flags text that will break the card', () => {
  it.each(BROKEN)('%s', (_n, text, fragment, line) => {
    const issue = lintAdvancedCss(text);
    expect(issue?.message).toContain(fragment);
    expect(issue?.line).toBe(line);
    expect(issue?.message).toContain(`(line ${line})`);
  });
  it('a template failure outranks a brace problem (it drops the whole style)', () => {
    expect(msg('a { b: c;\n{% if x %}')).toContain('{% if %} without {% endif %}');
  });
  it('is one line of text', () => {
    for (const [, t] of BROKEN) expect(msg(t)).not.toContain('\n');
  });
});

const VALID: Array<[string, string]> = [
  ['empty', ''],
  ['whitespace', '  \n '],
  ['plain rule', 'ha-card {\n  color: red;\n}'],
  ['no whitespace', 'ha-card{background:red}'],
  ['media + nesting', '@media (max-width: 600px) {\n  ha-card {\n    padding: 0;\n  }\n}\nha-card {\n  &:hover {\n    color: red;\n  }\n}'],
  ['keyframes', '@keyframes blink {\n  50% { opacity: 0; }\n}'],
  ['braces and quotes in a comment', '/* a { " \' */\nha-card { color: red; }'],
  ['braces in a string', 'a::after { content: "{ not a rule }"; }'],
  ['escaped quote and brace in string', 'a::after { content: "a\\"{\\""; }'],
  ['escaped brace outside string', '.a\\{b { color: red; }'],
  ['url with data', 'a { background: url("data:image/svg+xml;utf8,<svg xmlns=\'http://x\'></svg>"); }'],
  ['{{ }} value', "ha-card {\n  background: {{ 'red' if is_state(config.entity, 'on') else 'blue' }};\n}"],
  ['{{ }} with dict braces', "a { b: {{ {'x': {'y': 1}}['x']['y'] }}px; }"],
  ['{{ }} with }} inside a string', "a { b: {{ '}}' ~ \"{{\" }}; }"],
  ['{{ }} inside a CSS string', "a::after { content: \"{{ state_attr('a', \"b\") }}\"; }"],
  ['{{ }} with whitespace control', 'a { b: {{- x -}}; }'],
  ['{# #} comment with braces and quotes', "{# don't { break #}\na { b: c; }"],
  ['if / endif inside a rule', "ha-card {\n  {% if is_state('sun.sun', 'above_horizon') %}\n  color: orange;\n  {% endif %}\n}"],
  ['if / elif / else', '{% if a %}x{% elif b %}y{% else %}z{% endif %}'],
  ['whitespace-controlled tags', '{%- if a -%}x{%- endif -%}'],
  ['for / else', '{% for i in l %}{{ i }}{% else %}none{% endfor %}'],
  ['nested blocks', '{% for i in l %}{% if i %}{{ i }}{% endif %}{% endfor %}'],
  ['macro + call', '{% macro m(x) %}{{ x }}{% endmacro %}\na { b: {{ m(1) }}; }'],
  ['call block', '{% call m() %}x{% endcall %}'],
  ['inline set', "{% set x = 1 %}\n{% set ns = namespace(a=1) %}\na { b: {{ x }}; }"],
  ['inline set with string containing =', "{% set x = 'a=b' %}"],
  ['block set', '{% set x %}red{% endset %}a { b: {{ x }}; }'],
  ['block set with filter', '{% set x | upper %}red{% endset %}'],
  ['raw', '{% raw %}{{ not jinja }} { {% endraw %}'],
  ['branches that each open a brace', '{% if a %}.a { {% else %}.b { {% endif %} c: d; }'],
  ['jinja in selector', "{{ 'ha-card' }} { color: red; }"],
  ['declaration value statements', 'ha-card { color: {% if a %}red{% else %}blue{% endif %}; }'],
  ['important and vendor', 'a { -webkit-x: y !important; }'],
];

describe('lintAdvancedCss — no false alarms on valid input', () => {
  it.each(VALID)('%s', (_n, text) => expect(lintAdvancedCss(text)).toBeUndefined());

  it('the wiki examples (fenced css / yaml style blocks)', () => {
    let count = 0;
    for (const file of ['Advanced-CSS.md', 'Recipes.md']) {
      const md = readFileSync(new URL(`../docs/wiki/${file}`, import.meta.url), 'utf8');
      for (const m of md.matchAll(/```(\w*)\n([\s\S]*?)```/g)) {
        const [, lang, body] = m;
        const samples: string[] = [];
        if (lang === 'css' || lang === 'jinja' || lang === 'jinja2') samples.push(body);
        if (lang === 'yaml') {
          // `style: |` or `.: |` literal blocks → de-indented text.
          for (const b of body.matchAll(/^( *)[^\n]*:\s*\|[-+]?\n((?:\1 +[^\n]*\n?|\n)+)/gm)) {
            const lines = b[2].split('\n');
            const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
            samples.push(lines.map((l) => l.slice(indent)).join('\n'));
          }
        }
        for (const s of samples) { count++; expect(lintAdvancedCss(s), `${file}: ${s}`).toBeUndefined(); }
      }
    }
    expect(count).toBeGreaterThan(1); // the extractor really found samples
  });

  it('hand-written snippets and corpus entries used across the other suites', () => {
    const SAMPLES = [
      'ha-card {\n  background: rgba(var(--rgb-primary-color), 0.2);\n}',
      "ha-state-icon {\n  color: {{ 'red' if is_state(config.entity, 'on') else 'gray' }};\n}",
      "ha-card {\n  filter: {{ 'grayscale(100%)' if is_state(config.entity, 'off') else 'none' }};\n  transition: filter 300ms ease;\n}",
      "ha-card {\n  border: {{ '2px solid red' if is_state(config.entity, 'on') else 'none' }};\n}",
      "ha-card {\n  background: {{ 'red' if states('sensor.t') | float(0) > 20 else 'blue' }};\n}",
      "ha-card {\n  background: {{ 'red' if states('sensor.a') | float(0) > 20 else ('blue' if states('sensor.b') | float(0) > 10 else 'green') }};\n}",
      'ha-card {\n  animation: blink 2s linear infinite;\n}\n@keyframes blink {\n  50% { opacity: 0; }\n}',
      "ha-card {\n  background: url('/local/img.png');\n  background-size: cover;\n}",
      "ha-card {\n  font-family: 'Comic Sans MS', cursive;\n}",
      '/* note */\nha-card {\n  padding: 4px;\n}',
      'ha-card {\n  box-shadow: 0 0 4px red !important;\n}\n\nha-card {\n  box-shadow: none;\n}',
      "{% set c = 'red' %}\nha-card {\n  color: {{ c }};\n}",
      "{% if is_state('sun.sun','above_horizon') %}\nha-card {\n  color: orange;\n}\n{% endif %}",
      'ha-card {\n  --accent-color: {{ macros.foo() }};\n}',
    ];
    for (const s of SAMPLES) expect(lintAdvancedCss(s), s).toBeUndefined();
  });

  it('dictionary-form styles: every entry (the read-only view text) is clean', () => {
    const dict = { '.': 'ha-card { border-radius: 20px; }', 'ha-gauge$': 'text.value-text { font-weight: 700; }', 'x$': { 'y$': 'z { w: 1; }' } };
    const flat = (v: unknown): string[] => (typeof v === 'string' ? [v] : Object.values(v as object).flatMap(flat));
    for (const s of flat(dict)) expect(lintAdvancedCss(s)).toBeUndefined();
  });

  it('everything the generator itself emits (conditionals, thresholds, gradients, animations)', () => {
    const base = (): StudioState => ({
      filter: { ...DEFAULT_FILTER }, iconColor: { ...DEFAULT_ICON_COLOR }, accentColor: { ...DEFAULT_ACCENT_COLOR },
      background: { ...DEFAULT_BACKGROUND }, animation: { ...DEFAULT_ANIMATION }, border: { ...DEFAULT_BORDER },
      headingStyle: { ...DEFAULT_HEADING_STYLE }, font: { ...DEFAULT_FONT }, threshold: { ...DEFAULT_THRESHOLD },
      advanced: { rawCss: '' },
    });
    const value = { when: 'value' as const, valueEntity: 'sensor.t', valueOperator: '>' as const, valueThreshold: 2.5 };
    const states: StudioState[] = [
      { ...base(), iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'conditional', colorOn: '#ff0000', colorOff: 'var(--grey-color)' } },
      { ...base(), iconColor: { ...DEFAULT_ICON_COLOR, enabled: true, mode: 'light', colorOff: '#888888' } },
      { ...base(), accentColor: { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'conditional', colorOn: '#ff0000', colorOff: '#00ff00' } },
      { ...base(), filter: { ...DEFAULT_FILTER, enabled: true, grayscale: true, grayscaleWhen: 'off', effectsWhen: value, brightness: 80 } },
      { ...base(), border: { ...DEFAULT_BORDER, enabled: true, borderWidth: 2, borderColor: '#ff0000', widthWhen: value, widthOffPx: 0 } },
      { ...base(), background: { ...DEFAULT_BACKGROUND, enabled: true, type: 'gradient', applyWhen: 'on' } },
      { ...base(), animation: { ...DEFAULT_ANIMATION, enabled: true, preset: 'pulse', trigger: 'value', ...value } },
      { ...base(), threshold: { ...DEFAULT_THRESHOLD, enabled: true, entityId: 'sensor.t', properties: ['icon-color', 'background', 'text-color', 'border-color'],
        rules: [{ id: 'a', operator: '<', value: -3.5, color: '#0000ff' }, { id: 'b', operator: '>=', value: 20, color: 'var(--red-color)' }], defaultColor: '#00ff00' } },
      { ...base(), threshold: { ...DEFAULT_THRESHOLD, enabled: true, entityId: 'sensor.t', attribute: 'temperature', valueMode: 'gradient', properties: ['background'],
        colorStops: [{ id: 's0', value: 0, color: '#000000' }, { id: 's1', value: 50, color: '#ffffff' }] } },
    ];
    for (const s of states) {
      for (const type of ['tile', 'button', 'entity', 'light']) {
        const css = generateCss(s, type);
        expect(css.length).toBeGreaterThan(0);
        expect(lintAdvancedCss(css), css).toBeUndefined();
      }
    }
  });
});

describe('hasTopLevelJinjaStatement — the parser keeps the whole style verbatim', () => {
  const YES = [
    "{% if a %}\nha-card { color: red; }\n{% endif %}",
    "{% set c = 'red' %}\nha-card { color: {{ c }}; }",
    'ha-card { color: red; }\n{% endif %}',
    '{% macro m() %}x{% endmacro %}',
    'ha-card { color: red; }\n/* {% note %} */\n',
    '@media (min-width: 1px) { a { b: c; } }\n{% if x %}',
    // a statement inside a `{` that never closes: the parser's trailing text holds it
    "ha-card { color: red; }\nha-state-icon {\n  {% if a %}color: red;{% endif %}\n",
    'a { {% if a %}b: c;{% endif %}',
  ];
  const NO = [
    '',
    'ha-card { background: #ff0000; }',
    "ha-card { background: {{ 'red' if is_state(config.entity, 'on') else 'blue' }}; }",
    "ha-card {\n  {% if is_state('a', 'on') %}\n  color: orange;\n  {% endif %}\n}",
    'ha-card { color: {% if a %}red{% else %}blue{% endif %}; }',
    '{# a comment #}\nha-card { color: red; }',
    "ha-card { color: {{ '{% not a statement %}' }}; }",
    '/* { */ ha-card { color: red; } /* } */',
    // statement in a CLOSED rule, then an unclosed one with none in it
    'a { {% if a %}b: c;{% endif %} }\nd { e: f;',
  ];
  it.each(YES)('statement at top level: %j', (css) => expect(hasTopLevelJinjaStatement(css)).toBe(true));
  it.each(NO)('no top-level statement: %j', (css) => expect(hasTopLevelJinjaStatement(css)).toBe(false));

  it('agrees with the parser: a claimable rule in front is dropped for YES, still claimed for NO', () => {
    const probe = (css: string) => parseCssDetailed(`ha-card { background: #ff0000; }\n${css}`).targets.length;
    for (const css of YES) expect(probe(css), css).toBe(0);
    for (const css of NO.filter((c) => c.trim())) expect(probe(css), css).toBeGreaterThan(0);
  });
});

// ---- the rendered Advanced CSS module -------------------------------------

describe('Advanced CSS warning line', () => {
  type Adv = { state: { rawCss: string }; open: boolean; render(): unknown };
  let Adv: new () => Adv;
  beforeAll(async () => {
    (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown;
      constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } };
    await import('../src/modules/module-advanced.js');
    Adv = registry.get('cms-advanced-module') as new () => Adv;
  });
  const text = (rawCss: string) => {
    const m = new Adv();
    m.open = true;
    m.state = { rawCss };
    return templateText(m.render());
  };

  it('a broken text shows one polite status line naming the problem and the line', () => {
    const t = text('ha-card {\n  color: red;');
    expect(t).toContain('class="lint-warning" role="status"');
    expect(t).toContain('Unclosed { — a rule is missing its closing brace');
  });
  it('an unclosed template block says the whole card would lose its styling', () => {
    expect(text("{% if a %}\nha-card { color: red; }")).toContain('the whole card would lose its styling');
  });
  it('valid text adds no row at all', () => {
    expect(text('ha-card { color: red; }')).not.toContain('lint-warning');
    expect(text('')).not.toContain('lint-warning');
  });
  it('never blocks or rewrites: the editor still gets the text verbatim', () => {
    const t = text('ha-card { outline: 3px solid lime;');
    expect(t).toContain('<ha-code-editor');
    expect(t).not.toContain('disabled');
  });
});

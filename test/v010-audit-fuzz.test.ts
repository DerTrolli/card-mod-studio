/**
 * v0.10.0 audit — deterministic (seeded) fuzz + hand-written corpus.
 *
 * 1. Random module states → generateCss → open (parse + map) → save must be
 *    byte-stable — string form under both engines, and wrapped as a
 *    dict-form `.` entry next to pierced entries.
 * 2. Random entities-row configs (dict/string, both engines, bare-string,
 *    duplicate and section rows) round-trip byte-stably.
 * 3. Random combinations of realistic hand-written snippets (incl. Jinja
 *    statements, @media, CSS nesting) are idempotent across repeated
 *    open → unrelated edit → save, and never produce unbalanced braces.
 * 4. A realistic hand-written corpus keeps every declaration (same
 *    selector, equivalent value) through an unrelated edit — except the
 *    documented, deliberate adoptions listed in KNOWN_NORMALISATIONS.
 */
import { describe, it, expect, afterEach } from 'vitest';
import type { StudioState, ThresholdProperty, StyleCondition, EntitiesRowStyle, ThresholdRule } from '../src/types/index.js';
import { buildMergedStudioState, applyStudioState, initEntityRowStyles, applyEntityRowStyles, generateEntityRowCss } from '../src/editor/studio-state.js';
import { generateCss } from '../src/generator/css-generator.js';
import { parseCssDetailed } from '../src/parser/css-parser.js';
import {
  DEFAULT_FILTER, DEFAULT_ICON_COLOR, DEFAULT_ACCENT_COLOR, DEFAULT_BACKGROUND,
  DEFAULT_ANIMATION, DEFAULT_BORDER, DEFAULT_HEADING_STYLE, DEFAULT_FONT, DEFAULT_THRESHOLD,
} from '../src/parser/state-mapper.js';
import { filterPresetStateForCardType } from '../src/utils/preset-caps.js';
import { installEngines, restoreEngines, cfg, rng } from './v010-audit-helpers.js';

afterEach(() => restoreEngines());

const TYPES = ['tile', 'button', 'entity', 'sensor', 'light', 'gauge', 'thermostat', 'heading', 'glance', 'markdown', 'entities', 'picture-glance', 'media-control', 'alarm-panel'];
const COLORS = ['#ff0000', '#00ff00', '#123abc', 'var(--red-color)', 'rgb(1, 2, 3)', '#abc'];

function randomState(r: () => number, cardType: string): StudioState {
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const coin = (p = 0.5) => r() < p;
  const cond = (): StyleCondition | undefined => {
    const w = pick(['always', 'on', 'off', 'custom', 'value'] as const);
    if (w === 'always') return coin() ? undefined : { when: 'always' };
    if (w === 'custom') return { when: 'custom', customEntity: 'light.other' };
    if (w === 'value') {
      return {
        when: 'value', valueEntity: 'sensor.t', valueOperator: pick(['<', '>', '>=', '<=', '==', '!='] as const),
        valueThreshold: pick([0, 10, 25.5, -3]), ...(coin(0.3) ? { valueAttribute: 'temperature' } : {}),
      };
    }
    return { when: w };
  };
  const s: StudioState = {
    filter: coin(0.4) ? {
      ...DEFAULT_FILTER, enabled: true, grayscale: coin(), grayscaleWhen: pick(['always', 'on', 'off', 'custom'] as const),
      customEntity: 'light.other', brightness: pick([100, 50, 150]), blur: pick([0, 2]),
      ...(coin(0.3) ? { opacity: pick([50, 80]) } : {}), transitionMs: pick([300, 0, 500]),
      ...(coin(0.3) ? { effectsWhen: cond() } : {}),
    } : { ...DEFAULT_FILTER },
    iconColor: coin(0.4) ? {
      ...DEFAULT_ICON_COLOR, enabled: true, mode: pick(['plain', 'conditional', 'light'] as const),
      color: pick(COLORS), colorOn: pick(COLORS), colorOff: pick(COLORS),
      ...(coin(0.3) ? { entityId: 'light.other' } : {}),
      ...(coin(0.3) ? { sizePx: pick([20, 32]), ...(coin() ? { sizeWhen: cond(), sizeOffPx: pick([0, 16]) } : {}) } : {}),
    } : { ...DEFAULT_ICON_COLOR },
    accentColor: coin(0.4) ? {
      ...DEFAULT_ACCENT_COLOR, enabled: true, mode: pick(['plain', 'conditional'] as const),
      color: pick(COLORS), colorOn: pick(COLORS), colorOff: pick(COLORS), ...(coin(0.3) ? { entityId: 'light.other' } : {}),
    } : { ...DEFAULT_ACCENT_COLOR },
    background: coin(0.4) ? {
      ...DEFAULT_BACKGROUND, enabled: true, type: pick(['solid', 'gradient'] as const), color1: pick(COLORS), color2: pick(COLORS),
      angle: pick([0, 90, 135]), applyWhen: pick(['always', 'on', 'off', 'custom'] as const), customEntity: 'light.other',
    } : { ...DEFAULT_BACKGROUND },
    animation: coin(0.3) ? {
      ...DEFAULT_ANIMATION, enabled: true,
      preset: pick(['pulse', 'breathe', 'gradient-shift', 'bounce', 'blink', 'shake', 'spin', 'glow', 'heartbeat'] as const),
      speedS: pick([1, 2, 0.5]), trigger: pick(['always', 'on', 'off', 'custom', 'value'] as const), customEntity: 'light.other',
      valueEntity: 'sensor.t', valueOperator: '>', valueThreshold: 5,
    } : { ...DEFAULT_ANIMATION },
    border: coin(0.4) ? {
      ...DEFAULT_BORDER, enabled: true, radiusPx: pick([0, 12, 30]), borderWidth: pick([0, 2]), borderColor: pick(COLORS),
      ...(coin(0.3) ? { widthWhen: cond(), widthOffPx: pick([0, 1]) } : {}),
    } : { ...DEFAULT_BORDER },
    headingStyle: coin(0.4) ? {
      ...DEFAULT_HEADING_STYLE, enabled: true, fontSize: pick([16, 30]), textColor: pick(COLORS),
      fontWeight: pick(['normal', 'medium', 'bold'] as const), fontFamily: pick(['', 'monospace']),
      iconSize: pick([24, 40]), iconColor: pick(COLORS), alignment: pick(['left', 'center', 'right'] as const),
    } : { ...DEFAULT_HEADING_STYLE },
    font: coin(0.4) ? {
      ...DEFAULT_FONT, enabled: true, fontSize: pick([12, 16, 22]), fontFamily: pick(['', 'serif']),
      fontWeight: pick(['normal', 'medium', 'bold'] as const), color: pick(COLORS),
    } : { ...DEFAULT_FONT },
    threshold: coin(0.3) ? (() => {
      const props = (['icon-color', 'background', 'text-color', 'accent-color', 'border-color'] as ThresholdProperty[]).filter(() => coin(0.4));
      const gradient = coin(0.3);
      return {
        ...DEFAULT_THRESHOLD, enabled: true, entityId: 'sensor.t', attribute: coin(0.2) ? 'temperature' : '',
        properties: props.length ? props : ['icon-color'], valueMode: gradient ? 'gradient' : 'switch',
        rules: [
          { id: 'a', operator: '<', value: 10, color: '#0000ff' },
          ...(coin() ? [{ id: 'b', operator: '>=' as const, value: 30, color: '#ff0000' }] : []),
        ],
        defaultColor: '#00ff00',
        colorStops: [{ id: 's0', value: 0, color: '#000000' }, { id: 's1', value: 50, color: '#ffffff' }],
        ...(coin(0.3) ? { borderWidth: 3 } : {}),
      };
    })() : {
      ...DEFAULT_THRESHOLD, properties: [...DEFAULT_THRESHOLD.properties], rules: [],
      colorStops: DEFAULT_THRESHOLD.colorStops.map((x) => ({ ...x })),
    },
    advanced: { rawCss: '' },
  };
  return filterPresetStateForCardType(s, cardType);
}

describe('fuzz 1 — generated module output is byte-stable through open/save', () => {
  const N = 1500;
  for (const [engines, key] of [[['card-mod'], 'card_mod'], [['uix'], 'uix']] as const) {
    it(`string form under ${key}: ${N} random states (seeded)`, () => {
      installEngines([...engines]);
      const r = rng(key === 'uix' ? 77 : 1234);
      const fails: string[] = [];
      for (let i = 0; i < N; i++) {
        const type = TYPES[Math.floor(r() * TYPES.length)];
        const state = randomState(r, type);
        const needle = type === 'gauge' && r() < 0.3;
        const css1 = generateCss(state, type, { gaugeNeedle: needle });
        if (!css1) continue;
        const config = cfg({ type, entity: type === 'gauge' || type === 'sensor' ? 'sensor.t' : 'light.a', ...(needle ? { needle: true } : {}), [key]: { style: css1 } });
        const saved = applyStudioState(buildMergedStudioState(config), config) as unknown as Record<string, { style?: unknown }>;
        if (saved[key]?.style !== css1 && fails.length < 5) fails.push(`#${i} ${type}\n${css1}\n--- after:\n${String(saved[key]?.style)}`);
      }
      expect(fails).toEqual([]);
    });
  }

  it(`dict form: ${N} random states as '.' next to pierced entries (seeded)`, () => {
    installEngines(['card-mod']);
    const r = rng(99);
    const fails: string[] = [];
    for (let i = 0; i < N; i++) {
      const type = TYPES[Math.floor(r() * TYPES.length)];
      const css1 = generateCss(randomState(r, type), type, { gaugeNeedle: false });
      if (!css1) continue;
      const style = r() < 0.5 ? { 'x-el$': 'y { z: 1; }', '.': css1 } : { '.': css1, 'x-el$': { 'deep$': 'q { w: 2; }' } };
      const config = cfg({ type, entity: 'light.a', card_mod: { style } });
      const saved = applyStudioState(buildMergedStudioState(config), config);
      if (JSON.stringify(saved.card_mod?.style) !== JSON.stringify(style) && fails.length < 5) fails.push(`#${i} ${type}\n${JSON.stringify(style)}\n${JSON.stringify(saved.card_mod?.style)}`);
    }
    expect(fails).toEqual([]);
  });
});

describe('fuzz 2 — entities rows round-trip byte-stably', () => {
  const ROW_COLORS = ['#ff0000', 'red', 'var(--x-color)', 'rgb(1, 2, 3)'];
  function randomRowStyle(r: () => number): EntitiesRowStyle {
    const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
    const rules = (): ThresholdRule[] => [
      { id: '0', operator: '<', value: 10, color: '#0000ff' },
      ...(r() < 0.5 ? [{ id: '1', operator: '<=' as const, value: 20.5, color: '#ff0000' }] : []),
    ];
    const s: EntitiesRowStyle = { iconColor: '', textColor: '' };
    const icon = pick(['none', 'static', 'threshold'] as const);
    if (icon === 'static') s.iconColor = pick(ROW_COLORS);
    if (icon === 'threshold') Object.assign(s, { iconMode: 'threshold', iconRules: rules(), iconDefault: '#00ff00' });
    const text = pick(['none', 'static', 'threshold'] as const);
    if (text === 'static') s.textColor = pick(ROW_COLORS);
    if (text === 'threshold') Object.assign(s, { textMode: 'threshold', textRules: rules(), textDefault: '#00ff00' });
    if (r() < 0.3) s.fontSizePx = pick([12, 18.5]);
    if (r() < 0.3) s.fontWeight = pick(['normal', 'medium', 'bold'] as const);
    return s;
  }

  for (const engine of ['card-mod', 'uix'] as const) {
    it(`1000 random entities cards (${engine}, seeded)`, () => {
      installEngines([engine]);
      const key = engine === 'uix' ? 'uix' : 'card_mod';
      const r = rng(engine === 'uix' ? 7 : 3);
      const fails: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const rows: unknown[] = [];
        const n = 1 + Math.floor(r() * 4);
        for (let j = 0; j < n; j++) {
          const kind = r();
          const entity = r() < 0.3 ? 'light.dup' : `sensor.s${j}`;
          if (kind < 0.15) { rows.push(entity); continue; }
          if (kind < 0.25) { rows.push({ type: 'section', label: 'S' }); continue; }
          const css = generateEntityRowCss(randomRowStyle(r), entity);
          if (!css) { rows.push({ entity }); continue; }
          const style = r() < 0.4 ? { '.': css, 'hui-generic-entity-row $': 'x { y: 1; }' } : css;
          rows.push({ entity, name: 'N', [key]: { style } });
        }
        const config = cfg({ type: 'entities', entities: rows });
        const out = applyEntityRowStyles(config, initEntityRowStyles(config)) as unknown as { entities: unknown[] };
        if (JSON.stringify(rows) !== JSON.stringify(out.entities) && fails.length < 5) fails.push(`#${i}\n${JSON.stringify(rows)}\n${JSON.stringify(out.entities)}`);
      }
      expect(fails).toEqual([]);
    });
  }
});

describe('fuzz 3 — hand-written snippet combinations are idempotent and brace-balanced', () => {
  const SNIPPETS = [
    'ha-card {\n  box-shadow: none;\n}',
    'ha-card {\n  border-radius: 20px;\n}',
    'ha-card {\n  background: rgba(var(--rgb-primary-color), 0.2);\n}',
    "ha-card {\n  background: {{ 'red' if is_state(config.entity, 'on') else 'blue' }};\n}",
    "ha-state-icon {\n  color: {{ 'red' if is_state(config.entity, 'on') else 'gray' }};\n}",
    '@keyframes spin2 {\n  to { transform: rotate(360deg); }\n}',
    ':host {\n  --mdc-icon-size: 30px;\n}',
    'ha-card .name {\n  font-size: 18px;\n}',
    "ha-card {\n  filter: {{ 'grayscale(100%)' if is_state(config.entity, 'off') else 'none' }};\n  transition: filter 300ms ease;\n}",
    'ha-card {\n  --accent-color: #ff0000;\n}',
    'ha-card {\n  font-size: 14px;\n  font-weight: bold;\n}',
    "ha-card {\n  border: {{ '2px solid red' if is_state(config.entity, 'on') else 'none' }};\n}",
    "ha-card {\n  background: {{ 'red' if states('sensor.t') | float(0) > 20 else 'blue' }};\n}",
    'ha-card {\n  animation: cms-blink 2s ease-in-out infinite;\n}',
    'ha-card:hover {\n  transform: scale(1.02);\n}',
    '/* note */\nha-card {\n  padding: 4px;\n}',
    '@media (max-width: 600px) {\n  ha-card {\n    padding: 0;\n  }\n}',
    "ha-card {\n  {% if is_state('sun.sun', 'above_horizon') %}\n  color: orange;\n  {% endif %}\n}",
    'ha-card {\n  &:hover {\n    color: red;\n  }\n}',
    'ha-card {\n  border: 2px dashed red;\n}',
    'ha-card {\n  box-shadow: 0 0 2px red !important;\n}',
  ];
  const balanced = (css: string) => (css.match(/\{/g) ?? []).length === (css.match(/\}/g) ?? []).length;

  it('2000 combinations (seeded): save₂ === save₃, braces balanced', () => {
    installEngines(['card-mod']);
    const r = rng(42);
    const fails: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const n = 1 + Math.floor(r() * 4);
      const parts: string[] = [];
      for (let j = 0; j < n; j++) parts.push(SNIPPETS[Math.floor(r() * SNIPPETS.length)]);
      const style = parts.join('\n\n');
      const type = ['tile', 'button', 'entity', 'light', 'gauge'][Math.floor(r() * 5)];
      const dict = r() < 0.3;
      const mk = (st: unknown) => cfg({ type, entity: 'light.a', card_mod: { style: dict ? { 'p$': 'q {}', '.': st } : st } });
      const editOnce = (c: ReturnType<typeof mk>) => {
        const s = buildMergedStudioState(c);
        return applyStudioState({ ...s, border: { ...s.border, enabled: true, radiusPx: 7 } }, c);
      };
      const s1 = editOnce(mk(style));
      const s2 = editOnce(s1);
      const s3 = editOnce(s2);
      const root = (c: ReturnType<typeof mk>) => {
        const st = c.card_mod?.style as unknown;
        return String(dict ? (st as Record<string, string>)['.'] : st);
      };
      if (JSON.stringify(s2.card_mod) !== JSON.stringify(s3.card_mod) || !balanced(root(s1))) {
        if (fails.length < 5) fails.push(`#${i}\nIN ${JSON.stringify(style)}\nS2 ${JSON.stringify(s2.card_mod)}\nS3 ${JSON.stringify(s3.card_mod)}`);
      }
    }
    expect(fails).toEqual([]);
  });
});

describe('corpus — hand-written declarations survive an unrelated edit', () => {
  const CORPUS: Array<[string, string]> = [
    ['tile', 'ha-card {\n  --ha-card-background: rgba(0,0,0,0.5);\n  box-shadow: none;\n}'],
    ['tile', "ha-card {\n  background: url('/local/img.png');\n  background-size: cover;\n}"],
    ['entity', ':host {\n  --mdc-icon-size: 40px;\n}'],
    ['entities', 'ha-card .card-header {\n  font-size: 20px;\n}'],
    ['tile', 'ha-card {\n  border: 1px solid red;\n}'],
    ['tile', 'ha-card {\n  border: 2px dashed var(--primary-color);\n}'],
    ['tile', 'ha-card {\n  transition: all 0.5s;\n}'],
    ['tile', 'ha-card, .header {\n  color: red;\n}'],
    ['tile', 'ha-card:hover {\n  transform: scale(1.02);\n}'],
    ['tile', "ha-card {\n  background: {{ 'red' if states('sensor.t')|float > 20 else 'blue' }};\n}"],
    ['tile', 'ha-card {\n  border-radius: 0 0 12px 12px;\n}'],
    ['tile', 'ha-card {\n  border-radius: 50%;\n}'],
    ['tile', 'ha-card {\n  border-width: 2px;\n  border-style: dashed;\n  border-color: red;\n}'],
    ['tile', 'ha-card {\n  font-size: 1.2em;\n}'],
    ['tile', 'ha-card {\n  background: linear-gradient(to right, red, blue);\n}'],
    ['tile', 'ha-card {\n  background: linear-gradient(135deg, red, green, blue);\n}'],
    ['tile', 'ha-card {\n  background: red url(x.png) no-repeat;\n}'],
    ['tile', 'ha-card {\n  filter: drop-shadow(0 0 2px red);\n}'],
    ['tile', 'ha-card {\n  color: red;\n  font-weight: bold;\n}'],
    ['tile', "ha-card {\n  font-family: 'Comic Sans MS', cursive;\n}"],
    ['tile', 'ha-card {\n  animation: blink 2s linear infinite;\n}\n@keyframes blink {\n  50% { opacity: 0; }\n}'],
    ['tile', 'ha-card {\n  animation: cms-pulse 2s ease-in-out infinite alternate;\n}'],
    ['tile', 'ha-state-icon {\n  color: red;\n  width: 50px;\n}'],
    ['heading', '.title p {\n  font-size: 2em;\n  color: red;\n}'],
    ['tile', "ha-card {\n  filter: {{ 'grayscale(100%)' if is_state(config.entity, 'off') else 'none' }};\n  transition: filter 300ms ease, transform 1s;\n}"],
    ['tile', 'ha-card {\n  filter: brightness(80%);\n  transition: filter 1s, opacity 2s;\n}'],
    ['tile', "ha-card {\n  background: {{ 'red' if states('sensor.t') | float(0) > 20 and is_state('light.a','on') else 'blue' }};\n}"],
    ['tile', "ha-card {\n  background: {{ 'red' if states('sensor.a') | float(0) > 20 else ('blue' if states('sensor.b') | float(0) > 10 else 'green') }};\n}"],
    ['tile', 'ha-card {\n  border: 3px none red;\n}'],
    ['tile', 'ha-card {\n  box-shadow: 0 0 4px red !important;\n}\n\nha-card {\n  box-shadow: none;\n}'],
    ['tile', 'ha-card {\n  padding: 16px;\n}\n\n@media (max-width: 600px) {\n  ha-card {\n    padding: 0;\n  }\n}'],
    ['tile', 'HA-CARD {\n  Background: Red;\n}'],
    ['tile', 'ha-card{background:red}'],
  ];
  /** Documented, deliberate adoptions (wiki "Equivalent phrasings get
   *  adopted"): the hand-written form is replaced by the module's own
   *  equivalent spelling. Nothing else may change. */
  const KNOWN_NORMALISATIONS = new Set<string>([
    // Icon Color adopts `ha-state-icon { color }` and re-emits its own
    // `!important` spelling (v0.8.1 adoption).
    'tile|ha-state-icon::color',
    // Heading Style adopts the color; the module re-emits it with its own
    // `!important` (ROADMAP #25 — partially hand-authored styles; known).
    'heading|.title p::color',
  ]);

  function decls(css: string): Map<string, string> {
    const m = new Map<string, string>();
    for (const t of parseCssDetailed(css).targets) {
      for (const p of t.properties) {
        m.set(`${t.selector.trim().toLowerCase()}::${p.property}`, `${p.value.replace(/\s+/g, ' ').trim().toLowerCase()}${p.important ? ' !important' : ''}`);
      }
    }
    return m;
  }

  it.each(CORPUS)('[%s] %j', (type, style) => {
    installEngines(['card-mod']);
    const config = cfg({ type, entity: 'light.a', card_mod: { style } });
    const s = buildMergedStudioState(config);
    // Unrelated edit — but never Border or Filter on styles that use them.
    const ed: StudioState = /border|filter/.test(style) ? s : { ...s, border: { ...s.border, enabled: true, radiusPx: 8 } };
    const out = String(applyStudioState(ed, config).card_mod?.style ?? '');
    const after = decls(out);
    for (const [k, v] of decls(style)) {
      if (KNOWN_NORMALISATIONS.has(`${type}|${k}`)) continue;
      expect(after.get(k), `${k} in ${JSON.stringify(out)}`).toBe(v);
    }
    const tail = parseCssDetailed(style).tailCss;
    if (tail) expect(out.endsWith(tail)).toBe(true);
  });
});

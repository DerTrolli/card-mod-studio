/**
 * Hand-written CSS that looks like something a module writes. Found by
 * loading and re-saving tens of thousands of random styles without touching
 * them; all of it was already so in v0.9 – v0.11.0-beta.3:
 *
 *  - a hand-written `!important` was dropped when a module took the rule over
 *    (`ha-card { background: red !important }` came back as `background: red`),
 *    on a card and on an entities-card row;
 *  - rules on the heading card's selectors (`.title p`, `.container`,
 *    `.content ha-icon`) were turned into Heading Style on ANY card;
 *  - `! important` / `!IMPORTANT` were not seen as the flag, so of two twins
 *    the one the browser ignores was kept;
 *  - `border-radius: 0px` and `border: 0px solid …` were taken over by Border,
 *    which never writes a zero back, and vanished;
 *  - `background-size: 200% auto` was claimed next to any animation preset.
 *
 * What the Studio itself writes must keep loading exactly as before.
 */
import { describe, it, expect } from 'vitest';
import { mapToStudioState, parseEntityRowCss, DEFAULT_ANIMATION, DEFAULT_BACKGROUND } from '../src/parser/state-mapper.js';
import { generateEntityRowCss } from '../src/editor/studio-state.js';
import { findRowExtraCssConflicts } from '../src/utils/style-conflicts.js';
import { parseStyleValue } from '../src/parser/yaml-parser.js';
import { parseCss } from '../src/parser/css-parser.js';
import { generateCss } from '../src/generator/css-generator.js';

const load = (css: string, type?: string, config?: Record<string, unknown>) =>
  mapToStudioState(parseStyleValue(css), type, config);
/** Load and save the way the editor does: with the card's own config. */
const resave = (css: string, type: string, config: Record<string, unknown> = { type, entity: 'light.a' }) =>
  generateCss(load(css, type, config), type, { config });
const modulesOn = (css: string, type?: string) =>
  Object.entries(load(css, type) as unknown as Record<string, { enabled?: boolean }>)
    .filter(([, v]) => v && typeof v === 'object' && v.enabled)
    .map(([k]) => k);

describe('a hand-written !important survives', () => {
  const CASES: [string, string][] = [
    ['tile', 'ha-card {\n  background: red !important;\n}'],
    ['tile', 'ha-card {\n  border-radius: 20px !important;\n}'],
    ['tile', 'ha-card {\n  border-radius: 20px !important;\n  border: 2px solid red !important;\n}'],
    ['tile', 'ha-card {\n  filter: grayscale(100%) !important;\n}'],
    ['tile', 'ha-card {\n  --accent-color: red !important;\n}'],
    ['tile', 'ha-card {\n  animation: cms-pulse 2s ease-in-out infinite !important;\n}'],
    ['tile', 'ha-card {\n  font-size: 20px !important;\n}'],
    ['entities', 'ha-card {\n  background: transparent !important;\n  box-shadow: none !important;\n  border: none !important;\n}'],
    ['gauge', 'ha-card {\n  --accent-color: red !important;\n}'],
    ['glance', 'ha-card {\n  background: #112233 !important;\n}'],
  ];
  for (const [type, css] of CASES) {
    it(`${type}: ${css.replace(/\s+/g, ' ')}`, () => {
      expect(modulesOn(css, type)).toEqual([]);
      expect(load(css, type).advanced.rawCss).toBe(css);
      expect(resave(css, type)).toBe(css);
    });
  }

  it('the rest of the style is still read: only the flagged declaration stays hand-written', () => {
    const css = 'ha-card {\n  background: red !important;\n  border-radius: 20px;\n}';
    const s = load(css, 'tile');
    expect(s.background.enabled).toBe(false);
    expect(s.border).toMatchObject({ enabled: true, radiusPx: 20 });
    const out = resave(css, 'tile');
    expect(out).toContain('background: red !important;');
    expect(out).toContain('border-radius: 20px;');
  });

  it('what the Studio writes with the flag itself is still taken over', () => {
    // tile: the filter transition is written !important
    const tile = generateCss(load('ha-card {\n  filter: brightness(60%);\n}', 'tile'), 'tile');
    expect(tile).toContain('transition: filter 300ms ease !important;');
    expect(modulesOn(tile, 'tile')).toEqual(['filter']);
    expect(resave(tile, 'tile')).toBe(tile);
    // tile accent: --tile-color is written !important
    const accent = 'ha-card {\n  --accent-color: red;\n  --tile-color: red !important;\n  --state-icon-color: red;\n}';
    expect(modulesOn(accent, 'tile')).toEqual(['accentColor']);
    expect(resave(accent, 'tile')).toBe(accent);
    // icon colour is written !important
    const icon = 'ha-state-icon {\n  color: red !important;\n}';
    expect(modulesOn(icon, 'tile')).toEqual(['iconColor']);
    expect(resave(icon, 'tile')).toBe(icon);
  });

  it('markdown: the background is written !important on a text-only card only, and read to match', () => {
    const css = 'ha-card {\n  background: #112233 !important;\n}';
    const textOnly = { type: 'markdown', content: 'x', text_only: true };
    const normal = { type: 'markdown', content: 'x' };
    // text-only: the Studio's own shape
    const s = load(css, 'markdown', textOnly);
    expect(s.background).toMatchObject({ enabled: true, color1: '#112233' });
    expect(generateCss(s, 'markdown', { config: textOnly })).toBe(css);
    // a normal markdown card would get it back plain: it stays hand-written
    expect(load(css, 'markdown', normal).background.enabled).toBe(false);
    expect(resave(css, 'markdown', normal)).toBe(css);
    // config unknown: the benefit of the doubt, as before
    expect(load(css, 'markdown').background.enabled).toBe(true);
  });

  it('without a card type nothing is held back (the per-card flag is unknown there)', () => {
    const s = load('ha-card {\n  background: red !important;\n}');
    expect(s.background.enabled).toBe(true);
  });
});

describe('entities-card rows: a hand-written !important survives an edit of the row', () => {
  const E = 'light.bed_light';
  const rowSave = (css: string) => generateEntityRowCss(parseEntityRowCss(css, E), E);
  const KEPT = [
    ':host {\n  --state-icon-color: red !important;\n}',
    ':host {\n  --paper-item-icon-color: red !important;\n}',
    ':host {\n  color: red !important;\n}',
    ':host {\n  font-size: 20px !important;\n}',
    ':host {\n  font-weight: bold !important;\n}',
    `:host {\n  --state-icon-color: {{ 'red' if states('${E}') | float(0) > 20 else 'blue' }} !important;\n}`,
  ];
  for (const css of KEPT) {
    it(css.replace(/\s+/g, ' '), () => {
      const row = parseEntityRowCss(css, E);
      expect(row).toMatchObject({ iconColor: '', textColor: '' });
      expect(row.iconMode).toBeUndefined();
      expect(row.fontSizePx).toBeUndefined();
      expect(row.fontWeight).toBeUndefined();
      expect(rowSave(css)).toBe(css);
    });
  }
  it('a bare declaration list keeps the flag too', () => {
    expect(rowSave('color: red !important;')).toBe(':host {\n  color: red !important;\n}');
  });
  it('the plain declarations next to it are still read', () => {
    const row = parseEntityRowCss(':host {\n  color: red !important;\n  --state-icon-color: blue;\n  font-size: 18px;\n}', E);
    expect(row).toMatchObject({ iconColor: 'blue', textColor: '', fontSizePx: 18 });
    const out = generateEntityRowCss(row, E);
    expect(out).toContain('--state-icon-color: blue;');
    expect(out).toContain('font-size: 18px;');
    expect(out).toContain('color: red !important;');
    expect(generateEntityRowCss(parseEntityRowCss(out, E), E)).toBe(out);
  });
  it('an alias next to a flagged declaration is not read in its place', () => {
    const css = ':host {\n  --state-icon-color: red !important;\n  --paper-item-icon-color: blue;\n}';
    expect(parseEntityRowCss(css, E).iconColor).toBe('');
    expect(rowSave(css)).toBe(css);
  });
  it('setting the same thing with a row control shows the override warning', () => {
    const row = { ...parseEntityRowCss(':host {\n  color: red !important;\n}', E), textColor: 'blue' };
    expect(findRowExtraCssConflicts(row)).toEqual([':host { color }']);
  });
  it('what the Studio writes for a row is read as before', () => {
    const css = ':host {\n  --state-icon-color: red;\n  color: blue;\n  font-size: 18px;\n  font-weight: bold;\n}';
    expect(parseEntityRowCss(css, E)).toMatchObject({ iconColor: 'red', textColor: 'blue', fontSizePx: 18, fontWeight: 'bold' });
    expect(rowSave(css)).toBe(css);
  });
});

describe('Heading Style is read on the heading card only', () => {
  const RULES = [
    '.title p {\n  font-size: 30px;\n}',
    '.title p {\n  font-size: 30px;\n  color: red !important;\n  font-weight: bold;\n}',
    '.container {\n  justify-content: center;\n}',
    '.container {\n  --ha-heading-card-title-color: red;\n}',
    '.content ha-icon {\n  color: red;\n}',
    '.title ha-icon {\n  --mdc-icon-size: 30px;\n}',
  ];
  for (const type of ['tile', 'markdown', 'sensor', 'picture-entity', 'custom:something-else', 'custom:mushroom-entity-card']) {
    it(`${type}: such rules stay the user's`, () => {
      for (const css of RULES) {
        expect(load(css, type).headingStyle.enabled, css).toBe(false);
        expect(resave(css, type), css).toBe(css);
      }
    });
  }
  it('heading: the old shape is still upgraded, the current one still read', () => {
    const old = load('.title p {\n  font-size: 30px;\n}', 'heading');
    expect(old.headingStyle).toMatchObject({ enabled: true, fontSize: 30 });
    expect(generateCss(old, 'heading')).toContain('--ha-heading-card-title-font-size: 30px;');
    const now = '.container {\n  --ha-heading-card-title-font-size: 30px;\n  --ha-heading-card-subtitle-font-size: 30px;\n}';
    expect(load(now, 'heading').headingStyle).toMatchObject({ enabled: true, fontSize: 30 });
    expect(resave(now, 'heading', { type: 'heading', heading: 'x' })).toBe(now);
  });
  it('no card type: read as before', () => {
    expect(load('.title p {\n  font-size: 30px;\n}').headingStyle.enabled).toBe(true);
  });
});

describe('"! important" and "!IMPORTANT" are the flag', () => {
  it('the parser sets the flag and strips the suffix', () => {
    for (const v of ['red ! important', 'red !IMPORTANT', 'red!important', 'red !  Important ']) {
      const [t] = parseCss(`.x { color: ${v}; }`);
      expect(t.properties[0], v).toMatchObject({ property: 'color', value: 'red', important: true });
    }
  });
  it('of two twins the flagged one wins, whatever its spelling', () => {
    expect(resave('.primary {\n  padding: 14px ! important;\n  padding: 20px;\n}', 'tile')).toBe('.primary {\n  padding: 14px !important;\n}');
    expect(resave('.primary {\n  padding: 14px !IMPORTANT;\n  padding: 20px;\n}', 'tile')).toBe('.primary {\n  padding: 14px !important;\n}');
    expect(resave('.primary {\n  padding: 14px;\n  padding: 20px ! important;\n}', 'tile')).toBe('.primary {\n  padding: 20px !important;\n}');
  });
});

describe('Border leaves a zero to the user', () => {
  it('border-radius: 0px (square corners) is kept', () => {
    const css = 'ha-card {\n  border-radius: 0px;\n}';
    expect(modulesOn(css, 'tile')).toEqual([]);
    expect(resave(css, 'tile')).toBe(css);
  });
  it('border: 0px solid … (no outline) is kept', () => {
    const css = 'ha-card {\n  border: 0px solid #ff0000;\n}';
    expect(modulesOn(css, 'tile')).toEqual([]);
    expect(resave(css, 'tile')).toBe(css);
  });
  it('a real border next to a zero radius: the border is read, the radius kept, no default radius added', () => {
    const css = 'ha-card {\n  border-radius: 0px;\n  border: 2px solid red;\n}';
    const s = load(css, 'tile');
    expect(s.border).toMatchObject({ enabled: true, borderWidth: 2, radiusPx: 0 });
    const out = resave(css, 'tile');
    expect(out).toContain('border: 2px solid red;');
    expect(out).toContain('border-radius: 0px;');
    expect(out).not.toContain('12px');
    expect(resave(out, 'tile')).toBe(out);
  });
  it('a radius above zero is read as before', () => {
    const css = 'ha-card {\n  border-radius: 12px;\n}';
    expect(load(css, 'tile').border).toMatchObject({ enabled: true, radiusPx: 12 });
    expect(resave(css, 'tile')).toBe(css);
  });
});

describe('background-size belongs to Gradient Shift only', () => {
  it('next to another preset it is kept', () => {
    const css = 'ha-card {\n  background-size: 200% auto;\n  animation: cms-spin 2s linear infinite;\n}';
    const s = load(css, 'tile');
    expect(s.animation).toMatchObject({ enabled: true, preset: 'spin' });
    expect(resave(css, 'tile')).toContain('background-size: 200% auto;');
  });
  it('Gradient Shift as the Studio writes it still round-trips', () => {
    const state = {
      ...load('', 'tile'),
      background: { ...DEFAULT_BACKGROUND, enabled: true, type: 'gradient' as const, color1: '#ff0000', color2: '#0000ff', angle: 90 },
      animation: { ...DEFAULT_ANIMATION, enabled: true, preset: 'gradient-shift' as const },
    };
    const css = generateCss(state, 'tile');
    expect(css).toContain('background-size: 200% auto;');
    expect(load(css, 'tile').advanced.rawCss).toBe('');
    expect(resave(css, 'tile')).toBe(css);
  });
});

describe('random hand-written styles, loaded and saved untouched', () => {
  // A small deterministic slice of the run that found the above: properties
  // and selectors no module migrates elsewhere, on cards without a profile.
  let seed = 4711;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const TYPES = ['tile', 'button', 'entity', 'sensor', 'light', 'gauge', 'thermostat', 'glance', 'markdown', 'entities', 'picture', 'media-control', 'alarm-panel', 'statistic'];
  const SEL = ['ha-card', 'ha-card', ':host', '.name', '.state', '.value', '.info', 'ha-card > div', 'ha-card:hover', '.primary'];
  const COL = ['red', '#ff0000', 'rgb(255, 0, 0)', 'var(--red-color)', 'transparent'];
  const PROPS: Record<string, () => string> = {
    background: () => pick([...COL, 'none', `linear-gradient(90deg, ${pick(COL)}, ${pick(COL)})`]),
    border: () => pick([`${pick([1, 2, 3])}px solid ${pick(COL)}`, 'none', '0']),
    'border-radius': () => pick(['0px', '8px', '20px', '50%']),
    filter: () => pick(['grayscale(100%)', 'brightness(60%) blur(3px)', 'none']),
    animation: () => pick(['cms-pulse 2s ease-in-out infinite', 'mine 1s infinite', 'none']),
    color: () => pick(COL),
    'font-size': () => pick(['14px', '20px', '1.2em']),
    'font-weight': () => pick(['bold', '500']),
    '--accent-color': () => pick(COL),
    padding: () => pick(['2px', '8px']),
    'box-shadow': () => pick(['none', '0 0 4px red']),
    opacity: () => pick(['0.5', '1']),
    '--my-var': () => pick(['1', 'red']),
    'text-transform': () => 'uppercase',
  };
  const NAMES = Object.keys(PROPS);
  const winners = (css: string) => {
    const w = new Map<string, { value: string; important: boolean }>();
    for (const t of parseCss(css)) for (const p of t.properties) w.set(`${t.selector} :: ${p.property}`, { value: p.value, important: !!p.important });
    return w;
  };
  it('never throws, settles, and never loses an !important', () => {
    for (let i = 0; i < 2500; i++) {
      const blocks: string[] = [];
      for (let b = 0, n = 1 + Math.floor(rnd() * 3); b < n; b++) {
        const decls: string[] = [];
        for (let d = 0, m = 1 + Math.floor(rnd() * 4); d < m; d++) {
          const p = pick(NAMES);
          decls.push(`  ${p}: ${PROPS[p]()}${rnd() < 0.3 ? pick([' !important', ' ! important']) : ''};`);
        }
        blocks.push(`${pick(SEL)} {\n${decls.join('\n')}\n}`);
      }
      const css = blocks.join('\n\n');
      const type = pick(TYPES);
      const once = resave(css, type);
      const twice = resave(once, type);
      expect(resave(twice, type), `settles\n${type}\n${css}`).toBe(twice);
      const before = winners(css);
      const after = winners(once);
      for (const [k, v] of before) {
        if (!v.important) continue;
        expect(after.get(k)?.important, `!important kept for ${k}\n${type}\n${css}\n---\n${once}`).toBe(true);
        expect(after.get(k)?.value, `value kept for ${k}\n${type}\n${css}\n---\n${once}`).toBe(v.value);
      }
    }
  });
});

describe('Font without a size next to Threshold Colors (the Studio\'s own output)', () => {
  // Threshold is read after Font; what it writes on `ha-card` looked
  // hand-written to Font's "nothing else beside me" check, so a Font with only
  // a family, weight or colour came back switched off, its declarations under
  // Advanced CSS (v0.11.0-beta.3, where an untouched Font size is not written).
  const STOPS = [{ value: 0, color: '#2196f3' }, { value: 50, color: '#ffeb3b' }, { value: 100, color: '#ff0000' }];
  const RULES = [{ id: 'r1', operator: '<' as const, value: 10, color: '#2196f3' }, { id: 'r2', operator: '>=' as const, value: 20.5, color: '#ff0000' }];
  const FONTS: [string, Record<string, unknown>][] = [
    ['family', { fontFamily: 'monospace' }],
    ['weight', { fontWeight: 'bold' }],
    ['colour', { color: '#ff0000' }],
    ['family + weight', { fontFamily: 'Georgia, serif', fontWeight: 'medium' }],
  ];
  const THRESHOLDS: [string, Record<string, unknown>][] = [
    ['gradient background', { properties: ['background'], valueMode: 'gradient', colorStops: STOPS }],
    ['rules background', { properties: ['background'], rules: RULES }],
    ['gradient border', { properties: ['border-color'], valueMode: 'gradient', colorStops: STOPS }],
  ];
  for (const type of ['tile', 'glance', 'gauge', 'entities']) {
    for (const [fontName, font] of FONTS) {
      for (const [thrName, thr] of THRESHOLDS) {
        it(`${type}: Font ${fontName} + Threshold ${thrName}`, () => {
          const config = { type, entity: 'sensor.outside_temperature' };
          const state = structuredClone(load('', type, config));
          Object.assign(state.font, { enabled: true }, font);
          Object.assign(state.threshold, { enabled: true, entityId: 'sensor.outside_temperature' }, structuredClone(thr));
          const css = generateCss(state, type, { config });
          const back = load(css, type, config);
          expect(back.font).toMatchObject({ enabled: true, ...font });
          expect(back.threshold.enabled).toBe(true);
          expect(back.advanced.rawCss).toBe('');
          expect(generateCss(back, type, { config })).toBe(css);
        });
      }
    }
  }
  it('a hand-written declaration beside it still keeps Font off (nothing is split or reordered)', () => {
    const css = 'ha-card {\n  font-family: monospace;\n  letter-spacing: 1px;\n}';
    const back = load(css, 'tile');
    expect(back.font.enabled).toBe(false);
    expect(resave(css, 'tile')).toBe(css);
  });
});

describe('Threshold Colors with rules pointing both ways (the Studio\'s own output)', () => {
  // The generator sorts by the first rule's direction. `<= 10` then `>= 1` is
  // written as `>= 1 … else <= 10`, and that order sorted again starts the
  // other way round: the expression looked hand-written, Threshold Colors
  // came back switched off and its CSS sat under Advanced CSS.
  const E = 'sensor.outside_temperature';
  const LISTS: { operator: '<' | '<=' | '>' | '>=' | '==' | '!='; value: number; color: string }[][] = [
    [{ operator: '<=', value: 10, color: '#ff0000' }, { operator: '>=', value: 1, color: '#123456' }],
    [{ operator: '<', value: 10, color: '#ff0000' }, { operator: '>=', value: -9, color: '#00aa00' }, { operator: '<=', value: 2, color: '#0000ff' }],
    [{ operator: '>', value: 5, color: '#ff0000' }, { operator: '<', value: 30, color: '#00aa00' }, { operator: '>=', value: 20, color: '#0000ff' }],
    [{ operator: '<', value: 5, color: '#2196f3' }, { operator: '>', value: 25, color: '#ff0000' }],
  ];
  const withIds = (list: (typeof LISTS)[number]) => list.map((r, i) => ({ id: `r${i}`, ...r }));
  for (const list of LISTS) {
    const name = list.map((r) => `${r.operator} ${r.value}`).join(', ');
    for (const type of ['tile', 'entities', 'gauge']) {
      it(`${type}: ${name}`, () => {
        const config = { type, entity: E };
        const state = structuredClone(load('', type, config));
        Object.assign(state.threshold, { enabled: true, entityId: E, properties: ['background'], rules: withIds(list) });
        const css = generateCss(state, type, { config });
        const back = load(css, type, config);
        expect(back.threshold.enabled).toBe(true);
        expect(back.advanced.rawCss).toBe('');
        expect(back.threshold.rules.map(({ operator, value, color }) => `${operator}${value}${color}`).sort()).toEqual(
          list.map(({ operator, value, color }) => `${operator}${value}${color}`).sort(),
        );
        expect(generateCss(back, type, { config })).toBe(css);
      });
    }
    it(`entities row icon: ${name}`, () => {
      const css = generateEntityRowCss({ iconColor: '', textColor: '', iconMode: 'threshold', iconRules: withIds(list), iconDefault: '#888888' }, E);
      const row = parseEntityRowCss(css, E);
      expect(row.iconMode).toBe('threshold');
      expect(row.extraCss).toBeUndefined();
      expect(generateEntityRowCss(row, E)).toBe(css);
    });
  }
  it('a hand-written chain in an order the Studio never writes stays hand-written', () => {
    const css = `ha-card {\n  background: {{ '#ff0000' if states('${E}') | float(0) > 5 else ('#00aa00' if states('${E}') | float(0) > 10 else '#888888') }};\n}`;
    const back = load(css, 'tile');
    expect(back.threshold.enabled).toBe(false);
    expect(resave(css, 'tile')).toBe(css);
  });
});

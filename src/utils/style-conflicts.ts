/**
 * style-conflicts.ts — detects when a user's Advanced CSS (or a row's
 * hidden extraCss passthrough) sets the same visual property an *enabled*
 * module also drives.
 *
 * Advanced CSS is deliberately emitted AFTER module output, so hand-written
 * CSS always wins — that's the contract that makes the escape hatch safe.
 * The flip side is a classic confusion: the user drags a color picker and
 * nothing changes, because a custom rule is silently overriding it. This
 * module powers the "Custom CSS is currently overriding this control"
 * warnings that explain exactly that (v0.8.1).
 *
 * Detection is deliberately conservative-in-reverse: it only *warns*, never
 * touches the CSS — a false positive costs a harmless hint, so matching is
 * by property name/selector class rather than exact value analysis.
 */

import { parseCss } from '../parser/css-parser.js';
import type { StudioState, EntitiesRowStyle } from '../types/index.js';

export type ConflictableModule =
  | 'iconColor'
  | 'accentColor'
  | 'background'
  | 'font'
  | 'headingStyle'
  | 'border'
  | 'filter'
  | 'animation'
  | 'threshold';

export type ModuleConflicts = Partial<Record<ConflictableModule, string[]>>;

interface Rule {
  module: ConflictableModule;
  /** Substring the target selector must contain ('' = any selector). */
  selector: string;
  /** Property names (lowercase) that collide with the module's output. */
  props: string[];
}

/** What each module writes, by selector-class + property. A custom
 *  declaration matching a rule overrides that module's output (custom CSS
 *  is emitted last). `--state-icon-color`-family vars are claimed by BOTH
 *  icon and accent rules — whichever module is enabled gets the warning. */
const RULES: Rule[] = [
  { module: 'iconColor', selector: 'ha-state-icon', props: ['color'] },
  { module: 'iconColor', selector: 'ha-icon', props: ['color'] },
  { module: 'iconColor', selector: 'ha-card', props: ['--state-icon-color', '--paper-item-icon-color'] },
  { module: 'iconColor', selector: ':host', props: ['--state-icon-color', '--paper-item-icon-color'] },
  { module: 'accentColor', selector: 'ha-card', props: [
    '--accent-color', '--tile-color', '--state-icon-color', '--paper-item-icon-active-color',
    '--state-climate-heat-color', '--state-climate-cool-color', '--control-circular-slider-color', '--gauge-color',
  ] },
  { module: 'accentColor', selector: 'ha-gauge', props: ['--gauge-color', '--primary-text-color'] },
  { module: 'background', selector: 'ha-card', props: ['background', 'background-color', 'background-image'] },
  { module: 'font', selector: 'ha-card', props: [
    'font-size', 'font-weight', 'font-family', 'color',
    '--ha-tile-info-primary-font-size', '--ha-tile-info-primary-font-weight', '--ha-tile-info-primary-color',
    '--ha-card-header-font-size', '--ha-card-header-color', '--ha-card-header-font-family',
  ] },
  { module: 'headingStyle', selector: '.title', props: ['font-size', 'font-weight', 'font-family', 'color', '--mdc-icon-size', '--ha-icon-size'] },
  { module: 'border', selector: 'ha-card', props: ['border', 'border-radius', 'border-width', 'border-color'] },
  { module: 'filter', selector: 'ha-card', props: ['filter', '-webkit-filter'] },
  { module: 'animation', selector: 'ha-card', props: ['animation', 'animation-name'] },
];

/** The properties Threshold drives, per selected target property. */
const THRESHOLD_PROPS: Record<string, Rule[]> = {
  'icon-color': [{ module: 'threshold', selector: 'ha-state-icon', props: ['color'] }],
  'accent-color': [
    { module: 'threshold', selector: 'ha-card', props: ['--accent-color', '--tile-color'] },
    { module: 'threshold', selector: 'ha-gauge', props: ['--gauge-color'] },
  ],
  background: [{ module: 'threshold', selector: 'ha-card', props: ['background'] }],
  'text-color': [{ module: 'threshold', selector: 'ha-card', props: ['color'] }],
  'border-color': [{ module: 'threshold', selector: 'ha-card', props: ['border', 'border-color'] }],
};

function isEnabled(state: StudioState, module: ConflictableModule): boolean {
  switch (module) {
    case 'iconColor': return state.iconColor.enabled;
    case 'accentColor': return state.accentColor.enabled;
    case 'background': return state.background.enabled;
    case 'font': return state.font.enabled;
    case 'headingStyle': return state.headingStyle.enabled;
    case 'border': return state.border.enabled;
    case 'filter': return state.filter.enabled || state.filter.grayscale;
    case 'animation': return state.animation.enabled;
    case 'threshold': return state.threshold.enabled;
  }
}

/**
 * Which enabled modules the given Advanced CSS overrides, mapped to
 * human-readable descriptions of the offending declarations
 * (e.g. "ha-card { background }") for the warning hint.
 */
export function findAdvancedCssConflicts(rawCss: string, state: StudioState): ModuleConflicts {
  const trimmed = rawCss.trim();
  if (!trimmed) return {};

  let targets;
  try {
    targets = parseCss(trimmed);
  } catch {
    return {};
  }

  const activeRules: Rule[] = RULES.filter((r) => isEnabled(state, r.module));
  if (state.threshold.enabled) {
    for (const p of state.threshold.properties) {
      activeRules.push(...(THRESHOLD_PROPS[p] ?? []));
    }
  }
  if (activeRules.length === 0) return {};

  const out: ModuleConflicts = {};
  for (const target of targets) {
    const sel = target.selector.toLowerCase();
    for (const prop of target.properties) {
      const name = prop.property.toLowerCase();
      for (const rule of activeRules) {
        if (rule.selector && !sel.includes(rule.selector)) continue;
        if (!rule.props.includes(name)) continue;
        (out[rule.module] ??= []).push(`${target.selector} { ${prop.property} }`);
      }
    }
  }
  // Dedupe descriptions per module
  for (const k of Object.keys(out) as ConflictableModule[]) {
    out[k] = [...new Set(out[k])];
  }
  return out;
}

/** Row-level twin: does a row's hidden extraCss passthrough override the
 *  row's visible controls? Returns descriptions or an empty array. */
export function findRowExtraCssConflicts(style: EntitiesRowStyle): string[] {
  const extra = style.extraCss?.trim();
  if (!extra) return [];

  const iconOn = !!(style.iconColor || style.iconMode === 'threshold');
  const textOn = !!(style.textColor || style.textMode === 'threshold');
  const fontOn = !!(style.fontSizePx || style.fontWeight);
  if (!iconOn && !textOn && !fontOn) return [];

  let targets;
  try {
    targets = parseCss(extra.includes('{') ? extra : `:host{${extra}}`);
  } catch {
    return [];
  }

  const hits: string[] = [];
  for (const target of targets) {
    for (const prop of target.properties) {
      const name = prop.property.toLowerCase();
      if (iconOn && (name === '--state-icon-color' || name === '--paper-item-icon-color')) {
        hits.push(`${target.selector} { ${prop.property} }`);
      }
      if (textOn && name === 'color') hits.push(`${target.selector} { color }`);
      if (fontOn && (name === 'font-size' || name === 'font-weight')) {
        hits.push(`${target.selector} { ${prop.property} }`);
      }
    }
  }
  return [...new Set(hits)];
}

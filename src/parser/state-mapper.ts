/**
 * state-mapper.ts
 *
 * Converts a parsed CardModStyleState into a StudioState by recognising the
 * CSS patterns that our own generator produces.
 *
 * Design rules
 * ------------
 * 1. Only patterns we generate ourselves are recognised.  Anything else goes
 *    into the Advanced module's rawCss.
 * 2. Each recogniser "claims" the CSS properties it consumed.  Unclaimed
 *    properties are reconstructed into rawCss to prevent double-emission.
 */

import type {
  CardModStyleState,
  CssTarget,
  CssProperty,
  FilterModuleState,
  IconColorModuleState,
  AccentColorModuleState,
  BackgroundModuleState,
  BorderModuleState,
  HeadingStyleModuleState,
  AnimationModuleState,
  ThresholdModuleState,
  ThresholdRule,
  ThresholdProperty,
  ColorStop,
  AdvancedModuleState,
  StudioState,
  EntitiesRowStyle,
} from '../types/index.js';
import { parseCss, parseCssDetailed } from './css-parser.js';
import { GRADIENT_MARKER_PROPERTY, decodeGradientStops } from '../generator/css-generator.js';

// ---------------------------------------------------------------------------
// Default states
// ---------------------------------------------------------------------------

export const DEFAULT_FILTER: FilterModuleState = {
  enabled: false,
  grayscale: false,
  grayscaleWhen: 'off',
  brightness: 100,
  blur: 0,
  transitionMs: 300,
};

export const DEFAULT_ICON_COLOR: IconColorModuleState = {
  enabled: false,
  mode: 'conditional',
  color: '#2196F3',
  colorOn: '#2196F3',
  colorOff: '#6b6b6b',
};

export const DEFAULT_ACCENT_COLOR: AccentColorModuleState = {
  enabled: false,
  mode: 'plain',
  color: '#03a9f4',
  colorOn: '#03a9f4',
  colorOff: '#6b6b6b',
};

export const DEFAULT_BACKGROUND: BackgroundModuleState = {
  enabled: false,
  type: 'solid',
  color1: '#03a9f4',
  color2: '#ff8c00',
  angle: 135,
  applyWhen: 'always',
};

export const DEFAULT_ANIMATION = {
  enabled: false,
  preset: 'pulse' as const,
  speedS: 2,
  trigger: 'always' as const,
  customEntity: undefined,
};

export const DEFAULT_BORDER: BorderModuleState = {
  enabled: false,
  radiusPx: 12,
  borderWidth: 0,
  borderColor: '#03a9f4',
};

export const DEFAULT_HEADING_STYLE: HeadingStyleModuleState = {
  enabled: false,
  fontSize: 24,
  textColor: '#e1e1e1',
  iconSize: 24,
  iconColor: '#e1e1e1',
  alignment: 'left',
};

export const DEFAULT_THRESHOLD: ThresholdModuleState = {
  enabled: false,
  entityId: '',
  properties: ['icon-color'],
  valueMode: 'switch',
  rules: [],
  defaultColor: '#888888',
  colorStops: [
    { id: 'stop-0', value: 0, color: '#9e9e9e' },
    { id: 'stop-1', value: 100, color: '#f44336' },
  ],
};

/**
 * Normalises a StudioState of ANY historical schema (e.g. a preset saved by
 * v0.6.x, before multi-property/gradient threshold and conditional accent
 * existed) to the current shape. Without this, loading an old preset crashes
 * the panel: generateCss reads `threshold.properties.length`, the threshold
 * module calls `properties.includes`, and the accent module's mode checks
 * all assume current fields. Every module is default-merged, and renamed
 * fields are translated (v0.6.x `threshold.property` → `properties: [...]`).
 * Safe on current-schema input (idempotent).
 */
export function migrateStudioState(raw: unknown): StudioState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Record<string, unknown> | undefined>;

  const threshold = { ...DEFAULT_THRESHOLD, ...(r.threshold ?? {}) } as ThresholdModuleState &
    Record<string, unknown>;
  // v0.6.x had a single `property` field instead of `properties[]`.
  if (!Array.isArray(threshold.properties) || threshold.properties.length === 0) {
    const legacy = threshold['property'];
    threshold.properties = typeof legacy === 'string'
      ? [legacy as ThresholdProperty]
      : [...DEFAULT_THRESHOLD.properties];
  }
  delete threshold['property'];
  if (threshold.valueMode !== 'gradient') threshold.valueMode = 'switch';
  if (!Array.isArray(threshold.rules)) threshold.rules = [];
  if (!Array.isArray(threshold.colorStops) || threshold.colorStops.length === 0) {
    threshold.colorStops = DEFAULT_THRESHOLD.colorStops.map((s) => ({ ...s }));
  }

  const accentColor = { ...DEFAULT_ACCENT_COLOR, ...(r.accentColor ?? {}) } as AccentColorModuleState;
  if (accentColor.mode !== 'conditional') accentColor.mode = 'plain';

  return {
    filter: { ...DEFAULT_FILTER, ...(r.filter ?? {}) } as FilterModuleState,
    iconColor: { ...DEFAULT_ICON_COLOR, ...(r.iconColor ?? {}) } as IconColorModuleState,
    accentColor,
    background: { ...DEFAULT_BACKGROUND, ...(r.background ?? {}) } as BackgroundModuleState,
    animation: { ...DEFAULT_ANIMATION, ...(r.animation ?? {}) } as AnimationModuleState,
    border: { ...DEFAULT_BORDER, ...(r.border ?? {}) } as BorderModuleState,
    headingStyle: { ...DEFAULT_HEADING_STYLE, ...(r.headingStyle ?? {}) } as HeadingStyleModuleState,
    threshold,
    advanced: { rawCss: typeof r.advanced?.rawCss === 'string' ? (r.advanced.rawCss as string) : '' },
  };
}

// ---------------------------------------------------------------------------
// Claimed-property tracking
// ---------------------------------------------------------------------------

function claimKey(selector: string, property: string): string {
  return `${selector.trim().toLowerCase()}::${property.trim().toLowerCase()}`;
}

/**
 * The card-type companion variables the generator emits alongside
 * --accent-color (see accentAuxDecls/gaugeColorBlock in css-generator.ts).
 * When an accent value is recognised, any of these carrying the *same*
 * value are generated companions and must be claimed with it — otherwise
 * every reopen dumps them into Advanced CSS, where the stale copies then
 * override the accent color the user picks next (Advanced CSS is emitted
 * last, so its duplicates win the cascade). A companion with a *different*
 * value is treated as deliberate hand-written CSS and left alone.
 */
const ACCENT_AUX_VARS = [
  '--tile-color',
  '--state-icon-color',
  '--paper-item-icon-active-color',
  '--state-climate-heat-color',
  '--state-climate-cool-color',
  '--state-climate-auto-color',
  '--state-climate-idle-color',
  '--control-circular-slider-color',
];

/** Claims accent companion variables matching `value` — on ha-card the
 *  ACCENT_AUX_VARS set, on ha-gauge the --gauge-color block. */
function claimAccentAux(
  haCard: CssTarget | null,
  haGauge: CssTarget | null,
  value: string,
  claimed: Set<string>,
): void {
  if (haCard) {
    for (const aux of ACCENT_AUX_VARS) {
      const prop = findProp(haCard, aux);
      if (prop && prop.value.trim() === value) claimed.add(claimKey(haCard.selector, aux));
    }
  }
  if (haGauge) {
    // --gauge-color drives the non-needle value arc; --primary-text-color is
    // emitted alongside it for needle-mode gauges (needle + value text share
    // that variable inside ha-gauge's shadow styles).
    for (const aux of ['--gauge-color', '--primary-text-color']) {
      const prop = findProp(haGauge, aux);
      if (prop && prop.value.trim() === value) claimed.add(claimKey(haGauge.selector, aux));
    }
  }
}

// ---------------------------------------------------------------------------
// Animation module
// ---------------------------------------------------------------------------

function mapAnimation(
  haCard: CssTarget | null,
  claimed: Set<string>,
): AnimationModuleState {
  if (!haCard) return { ...DEFAULT_ANIMATION };

  const animProp = findProp(haCard, 'animation');
  if (!animProp) return { ...DEFAULT_ANIMATION };

  // Pattern: cms-{preset} {speed}s ease-in-out infinite
  const ANIM_PATTERN = /^cms-(pulse|breathe|gradient-shift|blink|bounce)\s+([\d.]+)s\s+ease-in-out\s+infinite$/;

  // gradient-shift needs `background-size: 200% auto;` alongside the
  // animation (see animationDecls) — claim it with the animation, or it
  // leaks into Advanced CSS and outlives switching to a different preset.
  const claimCompanions = () => {
    claimed.add(claimKey(haCard.selector, 'animation'));
    const bgSize = findProp(haCard, 'background-size');
    if (bgSize && bgSize.value.trim() === '200% auto') {
      claimed.add(claimKey(haCard.selector, 'background-size'));
    }
  };

  // Parse unconditional animation (trigger=always)
  if (!animProp.hasCondition) {
    const match = animProp.value.match(ANIM_PATTERN);
    if (match) {
      claimCompanions();
      return {
        enabled: true,
        preset: match[1] as 'pulse' | 'breathe' | 'gradient-shift' | 'blink' | 'bounce',
        speedS: parseFloat(match[2]),
        trigger: 'always',
      };
    }
  } else {
    // Parse conditional animation (trigger=on/off/custom entity)
    const onValue = animProp.onValue?.trim() || '';
    const offValue = animProp.offValue?.trim() || '';

    // Check which value has the animation
    const animValue = onValue.match(ANIM_PATTERN) ? onValue :
                      offValue.match(ANIM_PATTERN) ? offValue : null;

    if (animValue) {
      const match = animValue.match(ANIM_PATTERN);
      if (match) {
        claimCompanions();

        const base = {
          enabled: true,
          preset: match[1] as 'pulse' | 'breathe' | 'gradient-shift' | 'blink' | 'bounce',
          speedS: parseFloat(match[2]),
        };

        // A quoted entity in the is_state(...) condition means "animate
        // while a DIFFERENT entity is on" — losing it here silently rebound
        // the animation to the card's own entity on the next save.
        if (animProp.entityId && onValue.match(ANIM_PATTERN)) {
          return { ...base, trigger: 'custom', customEntity: animProp.entityId };
        }

        // Determine trigger: if animation is in onValue, trigger is 'on'
        const trigger = onValue.match(ANIM_PATTERN) ? 'on' : 'off';
        return { ...base, trigger: trigger as 'on' | 'off' };
      }
    }
  }

  return { ...DEFAULT_ANIMATION };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function mapToStudioState(parsed: CardModStyleState): StudioState {
  const haCard = findTarget(parsed.targets, 'ha-card');
  const haStateIcon = findTarget(parsed.targets, 'ha-state-icon');
  const haGauge = findTarget(parsed.targets, 'ha-gauge');
  const titleP = findTarget(parsed.targets, '.title p');
  const titleIcon = findTarget(parsed.targets, '.title ha-icon');
  const container = findTarget(parsed.targets, '.container');

  const claimed = new Set<string>();

  return {
    filter: mapFilter(haCard, claimed),
    iconColor: mapIconColor(haStateIcon, claimed),
    accentColor: mapAccentColor(haCard, haGauge, claimed),
    background: mapBackground(haCard, claimed),
    animation: mapAnimation(haCard, claimed),
    border: mapBorder(haCard, claimed),
    headingStyle: mapHeadingStyle(titleP, titleIcon, container, claimed),
    threshold: mapThreshold(haCard, haStateIcon, haGauge, claimed),
    advanced: mapAdvanced(parsed, claimed),
  };
}

/**
 * Merges two independently-parsed StudioStates — typically one from a
 * card's card_mod.style and one from its uix.style, which can genuinely
 * diverge (e.g. edited under card-mod, then separately edited again after
 * switching to UIX) — into one, so no module's settings are lost just
 * because they only live under the currently-inactive key.
 *
 * For each module, `primary` (the currently active engine's key — see
 * pickOutputKey()) wins whenever it has that module enabled; a module only
 * enabled in `secondary` fills the gap. This matches what a merge-and-clean
 * edit should produce: primary's settings for anything it already defines,
 * secondary's settings folded in for anything primary doesn't. rawCss is
 * primary's, falling back to secondary's only when primary has none —
 * unstructured CSS can't be safely merged declaration-by-declaration the
 * way the recognised modules can, so this is a whole-or-nothing choice
 * rather than a partial merge.
 */
export function mergeStudioStates(primary: StudioState, secondary: StudioState): StudioState {
  return {
    filter: primary.filter.enabled ? primary.filter : secondary.filter,
    iconColor: primary.iconColor.enabled ? primary.iconColor : secondary.iconColor,
    accentColor: primary.accentColor.enabled ? primary.accentColor : secondary.accentColor,
    background: primary.background.enabled ? primary.background : secondary.background,
    animation: primary.animation.enabled ? primary.animation : secondary.animation,
    border: primary.border.enabled ? primary.border : secondary.border,
    headingStyle: primary.headingStyle.enabled ? primary.headingStyle : secondary.headingStyle,
    threshold: primary.threshold.enabled ? primary.threshold : secondary.threshold,
    advanced: { rawCss: mergeRawCss(primary.advanced.rawCss, secondary.advanced.rawCss) },
  };
}

/**
 * Unstructured CSS can't be merged declaration-by-declaration the way the
 * recognised modules can — but the old whole-or-nothing pick (primary ||
 * secondary) silently DESTROYED the secondary key's unrecognised CSS
 * whenever the primary had any of its own: the next save clears the
 * secondary key on the premise everything was merged. When both sides have
 * different leftovers, concatenate them (primary last, so at equal
 * specificity its declarations win — matching which key the active engine
 * actually reads). Identical content is kept once, so the common
 * mirrored-key case doesn't duplicate.
 */
function mergeRawCss(primary: string, secondary: string): string {
  const p = primary.trim();
  const s = secondary.trim();
  if (!p) return s;
  if (!s || s === p) return p;
  return `${s}\n\n${p}`;
}

// ---------------------------------------------------------------------------
// Target + property lookup
// ---------------------------------------------------------------------------

function findTarget(targets: CssTarget[], selector: string): CssTarget | null {
  const norm = selector.trim().toLowerCase();
  return targets.find((t) => t.selector.trim().toLowerCase() === norm) ?? null;
}

function findProp(target: CssTarget, property: string): CssProperty | null {
  const norm = property.trim().toLowerCase();
  return target.properties.find((p) => p.property === norm) ?? null;
}

// ---------------------------------------------------------------------------
// Filter module
// ---------------------------------------------------------------------------

function mapFilter(haCard: CssTarget | null, claimed: Set<string>): FilterModuleState {
  if (!haCard) return { ...DEFAULT_FILTER };

  const filterProp = findProp(haCard, 'filter');
  const transitionProp = findProp(haCard, 'transition');

  const state: FilterModuleState = { ...DEFAULT_FILTER };
  let filterClaimed = false;

  if (filterProp) {
    if (filterProp.hasCondition) {
      // Conditional grayscale — detect which state triggers grayscale
      const offHasGrayscale = filterProp.offValue?.trim().startsWith('grayscale(');
      const onHasGrayscale = filterProp.onValue?.trim().startsWith('grayscale(');
      // A custom (non-card-entity) entity in the condition means this was
      // generated from the "controlled by a different entity" option —
      // see entityRef() in css-generator.ts.
      const customEntity = filterProp.entityId;

      // The non-grayscale branch is 'none' when grayscale is the only
      // filter, but with brightness/blur set it's the same filter list
      // minus grayscale() (see filterDecls: grayVal vs otherVal). Only
      // matching the literal 'none' silently dropped grayscale from any
      // combined filter on reopen.
      const matchesOther = (grayBranch: string | undefined, other: string | undefined): boolean => {
        if (other?.trim() === 'none') return true;
        if (!grayBranch || !other) return false;
        const remainder = grayBranch.replace(/grayscale\([^)]*\)\s*/, '').trim();
        return remainder.length > 0 && other.trim() === remainder;
      };

      if (offHasGrayscale && matchesOther(filterProp.offValue, filterProp.onValue)) {
        // grayscale when off, none when on
        state.enabled = true;
        state.grayscale = true;
        if (customEntity) {
          state.grayscaleWhen = 'custom';
          state.customEntity = customEntity;
        } else {
          state.grayscaleWhen = 'off';
        }
        filterClaimed = true;
      } else if (onHasGrayscale && matchesOther(filterProp.onValue, filterProp.offValue)) {
        // grayscale when on, none when off
        state.enabled = true;
        state.grayscale = true;
        if (customEntity) {
          state.grayscaleWhen = 'custom';
          state.customEntity = customEntity;
        } else {
          state.grayscaleWhen = 'on';
        }
        filterClaimed = true;
      }

      // Brightness from on/off values
      const brightnessSource = filterProp.onValue ?? filterProp.offValue ?? filterProp.value;
      const bm = brightnessSource.match(/brightness\(\s*(\d+(?:\.\d+)?)%\s*\)/);
      if (bm) { state.enabled = true; state.brightness = parseFloat(bm[1]); filterClaimed = true; }

      // Blur from on/off values
      const blurSource = filterProp.onValue ?? filterProp.offValue ?? filterProp.value;
      const blm = blurSource.match(/blur\(\s*(\d+(?:\.\d+)?)px\s*\)/);
      if (blm) { state.enabled = true; state.blur = parseFloat(blm[1]); filterClaimed = true; }

    } else {
      // Plain (non-conditional) filter value
      const val = filterProp.value;

      if (val.trim().startsWith('grayscale(')) {
        state.enabled = true;
        state.grayscale = true;
        state.grayscaleWhen = 'always';
        filterClaimed = true;
      }

      const bm = val.match(/brightness\(\s*(\d+(?:\.\d+)?)%\s*\)/);
      if (bm) { state.enabled = true; state.brightness = parseFloat(bm[1]); filterClaimed = true; }

      const blm = val.match(/blur\(\s*(\d+(?:\.\d+)?)px\s*\)/);
      if (blm) { state.enabled = true; state.blur = parseFloat(blm[1]); filterClaimed = true; }
    }

    if (filterClaimed) claimed.add(claimKey(haCard.selector, 'filter'));
  }

  // Only claim a transition when the filter module itself was recognised —
  // the generator only re-emits `transition:` alongside filter declarations
  // (see filterDecls), so claiming a hand-authored standalone transition
  // here would delete it on the next save: claimed (not in Advanced CSS)
  // but never regenerated.
  if (transitionProp && state.enabled) {
    if (transitionProp.value.includes('filter') || transitionProp.value.includes('all')) {
      const msMatch = transitionProp.value.match(/(\d+)ms/);
      const sMatch = transitionProp.value.match(/(\d*\.?\d+)s(?:\s|$|,)/);
      if (msMatch) {
        state.transitionMs = parseInt(msMatch[1], 10);
        claimed.add(claimKey(haCard.selector, 'transition'));
      } else if (sMatch) {
        state.transitionMs = Math.round(parseFloat(sMatch[1]) * 1000);
        claimed.add(claimKey(haCard.selector, 'transition'));
      }
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// Icon color module
// ---------------------------------------------------------------------------

function mapIconColor(
  haStateIcon: CssTarget | null,
  claimed: Set<string>,
): IconColorModuleState {
  if (!haStateIcon) return { ...DEFAULT_ICON_COLOR };

  const colorProp = findProp(haStateIcon, 'color');
  if (!colorProp) return { ...DEFAULT_ICON_COLOR };

  // Claiming happens per-branch below, not unconditionally here — a value
  // this function doesn't recognize (e.g. a threshold's multi-branch
  // ternary, which has hasCondition:true but no onValue/offValue) must stay
  // unclaimed so mapThreshold or mapAdvanced still get a chance to read it.
  // Claiming it here regardless, then falling through to DEFAULT_ICON_COLOR,
  // used to silently erase that content on the next save.

  // Light mode — contains rgb_color attribute access. This shape (uses `~`
  // string concatenation and `and`) doesn't match ENTITY_STATE_PATTERN, so
  // any custom entity has to be pulled out of the raw text directly instead
  // of via CssProperty.entityId.
  if (colorProp.hasCondition && colorProp.value.includes('rgb_color')) {
    claimed.add(claimKey(haStateIcon.selector, 'color'));
    const fallbackMatch = colorProp.value.match(/else\s+'([^']+)'/);
    const colorOff = fallbackMatch ? fallbackMatch[1] : DEFAULT_ICON_COLOR.colorOff;
    const entityMatch = colorProp.value.match(/is_state\(\s*'([^']+)'\s*,/);
    return {
      enabled: true,
      mode: 'light',
      color: colorOff,
      colorOn: colorOff,
      colorOff,
      ...(entityMatch ? { entityId: entityMatch[1] } : {}),
    };
  }

  if (colorProp.hasCondition && colorProp.onValue && colorProp.offValue) {
    // Jinja2 on/off conditional — map to conditional mode
    claimed.add(claimKey(haStateIcon.selector, 'color'));
    return {
      enabled: true,
      mode: 'conditional',
      color: colorProp.onValue,
      colorOn: colorProp.onValue,
      colorOff: colorProp.offValue,
      ...(colorProp.entityId ? { entityId: colorProp.entityId } : {}),
    };
  }

  // Plain static color (e.g. "color: yellow !important" — !important stripped by parser)
  if (!colorProp.hasCondition && colorProp.value.trim()) {
    claimed.add(claimKey(haStateIcon.selector, 'color'));
    return {
      enabled: true,
      mode: 'plain',
      color: colorProp.value.trim(),
      colorOn: colorProp.value.trim(),
      colorOff: DEFAULT_ICON_COLOR.colorOff,
    };
  }

  return { ...DEFAULT_ICON_COLOR };
}

// ---------------------------------------------------------------------------
// Accent color module
// ---------------------------------------------------------------------------

function mapAccentColor(
  haCard: CssTarget | null,
  haGauge: CssTarget | null,
  claimed: Set<string>,
): AccentColorModuleState {
  if (!haCard) return { ...DEFAULT_ACCENT_COLOR };

  const prop = findProp(haCard, '--accent-color');
  if (!prop) return { ...DEFAULT_ACCENT_COLOR };

  if (prop.hasCondition) {
    // Jinja2 on/off conditional — map to conditional mode (mirrors mapIconColor).
    if (prop.onValue && prop.offValue) {
      claimed.add(claimKey(haCard.selector, '--accent-color'));
      claimAccentAux(haCard, haGauge, prop.value.trim(), claimed);
      return {
        ...DEFAULT_ACCENT_COLOR,
        enabled: true,
        mode: 'conditional',
        colorOn: prop.onValue,
        colorOff: prop.offValue,
        ...(prop.entityId ? { entityId: prop.entityId } : {}),
      };
    }
    // A more complex conditional (e.g. threshold's multi-branch ternary) —
    // leave unclaimed so mapThreshold or Advanced CSS gets a chance at it.
    return { ...DEFAULT_ACCENT_COLOR };
  }

  const value = prop.value.trim();
  if (!value) return { ...DEFAULT_ACCENT_COLOR };

  claimed.add(claimKey(haCard.selector, '--accent-color'));
  claimAccentAux(haCard, haGauge, value, claimed);
  return { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'plain', color: value };
}

// ---------------------------------------------------------------------------
// Background module
// ---------------------------------------------------------------------------

function mapBackground(
  haCard: CssTarget | null,
  claimed: Set<string>,
): BackgroundModuleState {
  if (!haCard) return { ...DEFAULT_BACKGROUND };

  const bgProp = findProp(haCard, 'background');
  if (!bgProp) return { ...DEFAULT_BACKGROUND };

  // Conditional background: {{ 'color' if is_state(..., 'on'/'off') else 'none' }}
  if (bgProp.hasCondition && bgProp.onValue !== undefined && bgProp.offValue !== undefined) {
    const onVal = bgProp.onValue.trim();
    const offVal = bgProp.offValue.trim();
    let applyWhen: 'on' | 'off' | 'custom' | null = null;
    let colorVal = '';
    if (offVal === 'none' && onVal && onVal !== 'none') {
      applyWhen = bgProp.entityId ? 'custom' : 'on';
      colorVal = onVal;
    } else if (onVal === 'none' && offVal && offVal !== 'none') {
      applyWhen = bgProp.entityId ? 'custom' : 'off';
      colorVal = offVal;
    }
    if (applyWhen && colorVal) {
      claimed.add(claimKey(haCard.selector, 'background'));
      const customEntity = applyWhen === 'custom' ? { customEntity: bgProp.entityId } : {};
      const gradientMatch = colorVal.match(
        /^linear-gradient\(\s*(\d+)deg\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i,
      );
      if (gradientMatch) {
        return {
          enabled: true, type: 'gradient',
          color1: gradientMatch[2].trim(), color2: gradientMatch[3].trim(),
          angle: parseInt(gradientMatch[1], 10), applyWhen, ...customEntity,
        };
      }
      return { ...DEFAULT_BACKGROUND, enabled: true, type: 'solid', color1: colorVal, applyWhen, ...customEntity };
    }
    return { ...DEFAULT_BACKGROUND };
  }

  if (bgProp.hasCondition) return { ...DEFAULT_BACKGROUND };

  const value = bgProp.value.trim();

  const gradientMatch = value.match(
    /^linear-gradient\(\s*(\d+)deg\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i,
  );
  if (gradientMatch) {
    claimed.add(claimKey(haCard.selector, 'background'));
    return {
      enabled: true,
      type: 'gradient',
      color1: gradientMatch[2].trim(),
      color2: gradientMatch[3].trim(),
      angle: parseInt(gradientMatch[1], 10),
      applyWhen: 'always',
    };
  }

  if (value && !value.includes('url(') && !value.includes('{{')) {
    claimed.add(claimKey(haCard.selector, 'background'));
    return { ...DEFAULT_BACKGROUND, enabled: true, type: 'solid', color1: value };
  }

  return { ...DEFAULT_BACKGROUND };
}

// ---------------------------------------------------------------------------
// Border module
// ---------------------------------------------------------------------------

function mapBorder(haCard: CssTarget | null, claimed: Set<string>): BorderModuleState {
  if (!haCard) return { ...DEFAULT_BORDER };

  const radiusProp = findProp(haCard, 'border-radius');
  const borderProp = findProp(haCard, 'border');

  const state: BorderModuleState = { ...DEFAULT_BORDER };

  if (radiusProp && !radiusProp.hasCondition) {
    const match = radiusProp.value.match(/^(\d+(?:\.\d+)?)px$/);
    if (match) {
      state.enabled = true;
      state.radiusPx = parseFloat(match[1]);
      claimed.add(claimKey(haCard.selector, 'border-radius'));
    }
  }

  if (borderProp && !borderProp.hasCondition) {
    const match = borderProp.value.match(
      /^(\d+)px\s+(solid|dashed|dotted|double|groove|ridge|inset|outset|none)\s+(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/i,
    );
    if (match) {
      state.enabled = true;
      state.borderWidth = parseInt(match[1], 10);
      state.borderColor = match[3];
      claimed.add(claimKey(haCard.selector, 'border'));
      // A hand-authored `border:` with no `border-radius:` must not gain
      // the module's default 12px radius on the next save — only emit a
      // radius the CSS actually had.
      if (!radiusProp) state.radiusPx = 0;
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// Heading style module
// ---------------------------------------------------------------------------

const JUSTIFY_TO_ALIGN: Record<string, 'left' | 'center' | 'right'> = {
  'flex-start': 'left',
  center: 'center',
  'flex-end': 'right',
};

const TEXT_ALIGN_MAP: Record<string, 'left' | 'center' | 'right'> = {
  left: 'left',
  center: 'center',
  right: 'right',
};

function mapHeadingStyle(
  titleP: CssTarget | null,
  titleIcon: CssTarget | null,
  container: CssTarget | null,
  claimed: Set<string>,
): HeadingStyleModuleState {
  if (!titleP && !titleIcon && !container) return { ...DEFAULT_HEADING_STYLE };

  const state: HeadingStyleModuleState = { ...DEFAULT_HEADING_STYLE };

  if (titleP) {
    const fontSizeProp = findProp(titleP, 'font-size');
    if (fontSizeProp && !fontSizeProp.hasCondition) {
      const m = fontSizeProp.value.match(/^(\d+(?:\.\d+)?)px$/);
      if (m) {
        state.enabled = true;
        state.fontSize = parseFloat(m[1]);
        claimed.add(claimKey(titleP.selector, 'font-size'));
      }
    }

    const colorProp = findProp(titleP, 'color');
    if (colorProp && !colorProp.hasCondition && colorProp.value.trim()) {
      state.enabled = true;
      state.textColor = colorProp.value.trim();
      claimed.add(claimKey(titleP.selector, 'color'));
    }

    const textAlignProp = findProp(titleP, 'text-align');
    if (textAlignProp && !textAlignProp.hasCondition) {
      const a = TEXT_ALIGN_MAP[textAlignProp.value.trim()];
      if (a) {
        state.enabled = true;
        state.alignment = a;
        claimed.add(claimKey(titleP.selector, 'text-align'));
      }
    }
  }

  if (titleIcon) {
    const iconSizeProp = findProp(titleIcon, '--mdc-icon-size');
    if (iconSizeProp && !iconSizeProp.hasCondition) {
      const m = iconSizeProp.value.match(/^(\d+(?:\.\d+)?)px$/);
      if (m) {
        state.enabled = true;
        state.iconSize = parseFloat(m[1]);
        claimed.add(claimKey(titleIcon.selector, '--mdc-icon-size'));
        // The generator emits --ha-icon-size as a forward-compatible twin of
        // --mdc-icon-size (see headingStyleBlocks) — claim it too when it
        // matches, or it leaks into Advanced CSS as a stale size override.
        const haIconSize = findProp(titleIcon, '--ha-icon-size');
        if (haIconSize && haIconSize.value.trim() === iconSizeProp.value.trim()) {
          claimed.add(claimKey(titleIcon.selector, '--ha-icon-size'));
        }
      }
    }

    const iconColorProp = findProp(titleIcon, 'color');
    if (iconColorProp && !iconColorProp.hasCondition && iconColorProp.value.trim()) {
      state.enabled = true;
      state.iconColor = iconColorProp.value.trim();
      claimed.add(claimKey(titleIcon.selector, 'color'));
    }
  }

  if (container) {
    const justifyProp = findProp(container, 'justify-content');
    if (justifyProp && !justifyProp.hasCondition) {
      const a = JUSTIFY_TO_ALIGN[justifyProp.value.trim()];
      if (a) {
        state.enabled = true;
        state.alignment = a;
        claimed.add(claimKey(container.selector, 'justify-content'));
      }
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// Threshold module
// ---------------------------------------------------------------------------

export function parseThresholdJinja(value: string): {
  entityId: string;
  rules: ThresholdRule[];
  defaultColor: string;
} | null {
  if (!value.includes('float(0)')) return null;

  // Color token accepts hex, a bare CSS color name, or var(--xxx-color) —
  // the last form is what the palette presets (see cms-color-picker.ts)
  // write, so a rule picked from the palette round-trips back into a rule
  // instead of falling through to Advanced CSS.
  // Threshold value accepts an optional leading minus — freezer/outdoor
  // temperatures are routinely negative, and without `-?` those rules were
  // silently deleted on reopen (matched-and-claimed but never re-parsed).
  const RULE_RE =
    /'(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\)|[a-zA-Z]+)'\s+if\s+states\('([^']+)'\)\s*\|\s*float\(0\)\s*(>=|<=|>|<|==|!=)\s*(-?[\d.]+(?:\.\d+)?)/g;
  const DEFAULT_RE = /else\s+'(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\)|[a-zA-Z]+)'\s*[)}\s]/;

  const rules: ThresholdRule[] = [];
  let entityId = '';
  let idx = 0;
  let match: RegExpExecArray | null;

  while ((match = RULE_RE.exec(value)) !== null) {
    const [, color, entity, operator, numStr] = match;
    entityId = entity;
    rules.push({
      id: String(idx++),
      operator: operator as ThresholdRule['operator'],
      value: parseFloat(numStr),
      color,
    });
  }

  if (rules.length === 0 || !entityId) return null;

  const defaultMatch = DEFAULT_RE.exec(value);
  const defaultColor = defaultMatch ? defaultMatch[1] : DEFAULT_THRESHOLD.defaultColor;

  return { entityId, rules, defaultColor };
}

/**
 * Recognises an entities-card row's card_mod/uix style text into row-level
 * UI state. Our own generator always wraps row declarations in ":host { }"
 * (see cms-panel.ts → _generateEntityRowCss); if a hand-authored value omits
 * the selector, a synthetic one is used instead. Delegating to parseCss
 * (rather than regexing the raw text directly) matters because a naive
 * value capture like `[^;}\n]+` truncates at the first "}" — fatal for any
 * {{ ... }} threshold expression, which always ends in "}}".
 */
export function parseEntityRowCss(css: string): EntitiesRowStyle {
  const style: EntitiesRowStyle = { iconColor: '', textColor: '' };

  const detailed = parseCssDetailed(css);
  let targets = detailed.targets;
  if (targets.length === 0) targets = parseCss(`:host{${css}}`);
  const [target, ...otherTargets] = targets;
  const properties = target?.properties ?? [];
  const consumed = new Set<string>();
  const valueOf = (...names: string[]): string => {
    for (const name of names) {
      const found = properties.find((p) => p.property === name);
      if (found) {
        consumed.add(name);
        return found.value.trim();
      }
    }
    return '';
  };

  const iconVal = valueOf('--state-icon-color', '--paper-item-icon-color');
  if (iconVal.includes('float(0)')) {
    const parsed = parseThresholdJinja(iconVal);
    if (parsed) {
      style.iconMode = 'threshold';
      style.iconRules = parsed.rules;
      style.iconDefault = parsed.defaultColor;
    } else {
      // Recognised the shape but not the content — leave it in extraCss
      // rather than silently dropping it on the next save.
      consumed.delete('--state-icon-color');
      consumed.delete('--paper-item-icon-color');
    }
  } else {
    style.iconColor = iconVal;
  }

  const textVal = valueOf('color');
  if (textVal.includes('float(0)')) {
    const parsed = parseThresholdJinja(textVal);
    if (parsed) {
      style.textMode = 'threshold';
      style.textRules = parsed.rules;
      style.textDefault = parsed.defaultColor;
    } else {
      consumed.delete('color');
    }
  } else {
    style.textColor = textVal;
  }

  // Everything the recogniser didn't consume — extra declarations on the
  // first selector, whole extra selectors, @-blocks — is preserved verbatim,
  // the row-level counterpart of the card's Advanced CSS passthrough.
  // Without this, any unrelated panel edit rewrites the row and deletes it.
  const extraParts: string[] = [];
  if (detailed.passthroughCss) extraParts.push(detailed.passthroughCss);
  if (target) {
    const leftover = properties.filter((p) => !consumed.has(p.property));
    if (leftover.length > 0) {
      const decls = leftover
        .map((p) => `  ${p.property}: ${p.value}${p.important ? ' !important' : ''};`)
        .join('\n');
      extraParts.push(`${target.selector} {\n${decls}\n}`);
    }
  }
  for (const t of otherTargets) {
    const decls = t.properties
      .map((p) => `  ${p.property}: ${p.value}${p.important ? ' !important' : ''};`)
      .join('\n');
    extraParts.push(`${t.selector} {\n${decls}\n}`);
  }
  if (extraParts.length > 0) style.extraCss = extraParts.join('\n\n');

  return style;
}

/**
 * Row-level counterpart to mergeStudioStates — merges two independently
 * parsed EntitiesRowStyles (a row's card_mod.style and uix.style) so a
 * setting that only lives under the currently-inactive key isn't lost.
 * Icon and text are merged independently: primary wins whichever one it has
 * set (static color or threshold rules), secondary fills in whichever one
 * primary doesn't have.
 */
export function mergeEntityRowStyles(primary: EntitiesRowStyle, secondary: EntitiesRowStyle): EntitiesRowStyle {
  const iconSet = !!(primary.iconColor || primary.iconMode === 'threshold');
  const textSet = !!(primary.textColor || primary.textMode === 'threshold');
  return {
    iconColor: iconSet ? primary.iconColor : secondary.iconColor,
    iconMode: iconSet ? primary.iconMode : secondary.iconMode,
    iconRules: iconSet ? primary.iconRules : secondary.iconRules,
    iconDefault: iconSet ? primary.iconDefault : secondary.iconDefault,
    textColor: textSet ? primary.textColor : secondary.textColor,
    textMode: textSet ? primary.textMode : secondary.textMode,
    textRules: textSet ? primary.textRules : secondary.textRules,
    textDefault: textSet ? primary.textDefault : secondary.textDefault,
    // Same whole-or-nothing choice as mergeStudioStates' rawCss: unstructured
    // CSS can't be merged declaration-by-declaration safely.
    ...(primary.extraCss || secondary.extraCss
      ? { extraCss: primary.extraCss || secondary.extraCss }
      : {}),
  };
}

/** True when two parsed threshold blocks are the same rule set (ignoring rule `id`s, which are re-minted per parse). */
function sameThreshold(
  a: { entityId: string; rules: ThresholdRule[]; defaultColor: string },
  b: { entityId: string; rules: ThresholdRule[]; defaultColor: string },
): boolean {
  if (a.entityId !== b.entityId || a.defaultColor !== b.defaultColor) return false;
  if (a.rules.length !== b.rules.length) return false;
  return a.rules.every(
    (r, i) => r.operator === b.rules[i].operator && r.value === b.rules[i].value && r.color === b.rules[i].color,
  );
}

function mapThreshold(
  haCard: CssTarget | null,
  haStateIcon: CssTarget | null,
  haGauge: CssTarget | null,
  claimed: Set<string>,
): ThresholdModuleState {
  type Candidate = {
    target: CssTarget;
    cssProperty: string;
    thresholdProperty: ThresholdProperty;
  };

  const candidates: Candidate[] = [];

  if (haCard) {
    const bgProp = findProp(haCard, 'background');
    if (bgProp?.hasCondition && !bgProp.onValue)
      candidates.push({ target: haCard, cssProperty: 'background', thresholdProperty: 'background' });

    const colorProp = findProp(haCard, 'color');
    if (colorProp?.hasCondition && !colorProp.onValue)
      candidates.push({ target: haCard, cssProperty: 'color', thresholdProperty: 'text-color' });

    const accentProp = findProp(haCard, '--accent-color');
    if (accentProp?.hasCondition && !accentProp.onValue)
      candidates.push({ target: haCard, cssProperty: '--accent-color', thresholdProperty: 'accent-color' });

    const borderColorProp = findProp(haCard, 'border-color');
    if (borderColorProp?.hasCondition && !borderColorProp.onValue)
      candidates.push({ target: haCard, cssProperty: 'border-color', thresholdProperty: 'border-color' });

    // Also recognise "border: 2px solid {{ jinja }}" shorthand
    const borderShorthandProp = findProp(haCard, 'border');
    if (borderShorthandProp?.hasCondition && !borderShorthandProp.onValue)
      candidates.push({ target: haCard, cssProperty: 'border', thresholdProperty: 'border-color' });
  }

  if (haStateIcon) {
    const colorProp = findProp(haStateIcon, 'color');
    if (colorProp?.hasCondition && !colorProp.onValue)
      candidates.push({ target: haStateIcon, cssProperty: 'color', thresholdProperty: 'icon-color' });
  }

  // Collect every candidate whose parsed rules match the *first* matching
  // candidate's rules — e.g. icon-color and accent-color both driven by the
  // same threshold rules become one ThresholdModuleState with two entries in
  // `properties`. A candidate with genuinely different rules (a real
  // conflict, not the same setting duplicated) is left unclaimed and falls
  // through to Advanced CSS rather than being silently merged or dropped.
  let base: { entityId: string; rules: ThresholdRule[]; defaultColor: string } | null = null;
  const properties: ThresholdProperty[] = [];
  let borderWidth: number | undefined;
  let gradientStops: ColorStop[] | null = null;

  for (const { target, cssProperty, thresholdProperty } of candidates) {
    const prop = findProp(target, cssProperty)!;
    const parsed = parseThresholdJinja(prop.value);
    if (!parsed) continue;
    if (base && !sameThreshold(base, parsed)) continue;

    base ??= parsed;
    claimed.add(claimKey(target.selector, cssProperty));
    if (!properties.includes(thresholdProperty)) properties.push(thresholdProperty);

    // accent-color emits card-type companion variables carrying the same
    // Jinja expression (accentAuxDecls/gaugeColorBlock) — claim them with it.
    if (thresholdProperty === 'accent-color') {
      claimAccentAux(haCard, haGauge, prop.value.trim(), claimed);
    }

    // For "border: 2px solid {{ ... }}" extract the width from the leading non-Jinja part
    if (cssProperty === 'border') {
      const bwMatch = prop.value.match(/^(\d+)px/);
      borderWidth = bwMatch ? parseInt(bwMatch[1], 10) : 2;
    }

    // Gradient mode leaves its real anchor points in a sibling custom
    // property on the same target — see encodeGradientStops/GRADIENT_MARKER_PROPERTY
    // in css-generator.ts. Without this, gradient-driven cards would round-trip
    // back as ~32 confusing switch-mode rules instead of the actual stops.
    if (!gradientStops) {
      const markerProp = findProp(target, GRADIENT_MARKER_PROPERTY);
      if (markerProp) {
        const unquoted = markerProp.value.trim().replace(/^'|'$/g, '');
        const decoded = decodeGradientStops(unquoted);
        if (decoded) {
          gradientStops = decoded;
          claimed.add(claimKey(target.selector, GRADIENT_MARKER_PROPERTY));
        }
      }
    }
  }

  if (!base || properties.length === 0) return { ...DEFAULT_THRESHOLD };

  return {
    enabled: true,
    entityId: base.entityId,
    properties,
    valueMode: gradientStops ? 'gradient' : 'switch',
    rules: gradientStops ? [] : base.rules,
    defaultColor: gradientStops ? DEFAULT_THRESHOLD.defaultColor : base.defaultColor,
    colorStops: gradientStops ?? DEFAULT_THRESHOLD.colorStops,
    ...(borderWidth !== undefined ? { borderWidth } : {}),
  };
}

// ---------------------------------------------------------------------------
// Advanced module — unclaimed CSS remainder
// ---------------------------------------------------------------------------

function mapAdvanced(
  parsed: CardModStyleState,
  claimed: Set<string>,
): AdvancedModuleState {
  const parts: string[] = [];

  // Blocks the structured parser can't model (@keyframes, @media, ...) —
  // preserved verbatim so a hand-authored @keyframes isn't deleted on save.
  if (parsed.passthroughCss) parts.push(parsed.passthroughCss);

  for (const target of parsed.targets) {
    const unclaimed = target.properties.filter(
      (p) => !claimed.has(claimKey(target.selector, p.property)),
    );
    if (unclaimed.length > 0) {
      const decls = unclaimed
        .map((p) => `  ${p.property}: ${p.value}${p.important ? ' !important' : ''};`)
        .join('\n');
      parts.push(`${target.selector} {\n${decls}\n}`);
    }
  }

  return { rawCss: parts.join('\n\n') };
}

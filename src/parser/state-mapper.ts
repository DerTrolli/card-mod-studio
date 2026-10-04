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
  FontModuleState,
  AnimationModuleState,
  ThresholdModuleState,
  ThresholdRule,
  ThresholdProperty,
  ColorStop,
  AdvancedModuleState,
  StudioState,
  EntitiesRowStyle,
  StyleCondition,
} from '../types/index.js';
import { parseCss, parseCssDetailed, isBareDeclarations } from './css-parser.js';
import {
  GRADIENT_MARKER_PROPERTY,
  ANIMATION_TIMING,
  decodeGradientStops,
  headerFontSize,
  valueFontSize,
  buildThresholdJinja,
  sortThresholdRules,
  HEADING_FAMILY_SELECTOR,
  HEADING_ICON_SELECTOR,
} from '../generator/css-generator.js';
import { NO_ICON_COLOR_TYPES, ICON_SIZE_TYPES } from '../utils/card-caps.js';

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
  // trigger === 'value' fields — undefined until that trigger is used, so
  // spreads/toEqual comparisons of older states keep working unchanged.
  valueEntity: undefined,
  valueAttribute: undefined,
  valueOperator: undefined,
  valueThreshold: undefined,
};

export const DEFAULT_BORDER: BorderModuleState = {
  enabled: false,
  radiusPx: 12,
  borderWidth: 0,
  borderColor: '#03a9f4',
};

/** Default text colour for freshly enabled text modules: the THEME's text
 *  colour, so turning a module on changes nothing until a colour is picked.
 *  (Was #e1e1e1 — near-invisible light grey on light themes.) */
export const THEME_TEXT_COLOR = 'var(--primary-text-color)';

export const DEFAULT_HEADING_STYLE: HeadingStyleModuleState = {
  enabled: false,
  fontSize: 24,
  textColor: THEME_TEXT_COLOR,
  fontWeight: 'normal',
  fontFamily: '',
  iconSize: 24,
  iconColor: THEME_TEXT_COLOR,
  alignment: 'left',
};

export const DEFAULT_FONT: FontModuleState = {
  enabled: false,
  fontSize: 16,
  fontFamily: '',
  fontWeight: 'normal',
  color: THEME_TEXT_COLOR,
};

export const DEFAULT_THRESHOLD: ThresholdModuleState = {
  enabled: false,
  entityId: '',
  attribute: '',
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
    font: { ...DEFAULT_FONT, ...(r.font ?? {}) } as FontModuleState,
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
// Shared state-condition recognizer (v0.9 state-driven numeric controls)
// ---------------------------------------------------------------------------

/** Splits `{{ 'A' if COND else 'B' }}` into its three parts. Anchored and
 *  single-branch — richer Jinja stays unmatched (→ Advanced CSS). */
const COND_TERNARY_PATTERN = /^\{\{\s*'([^']*)'\s+if\s+(.+?)\s+else\s+'([^']*)'\s*\}\}$/;

const COND_ON_OFF_PATTERN = /^is_state\(config\.entity,\s*'(on|off)'\)$/;
const COND_CUSTOM_PATTERN = /^is_state\('([^']+)',\s*'on'\)$/;
const COND_VALUE_PATTERN =
  /^(?:states\('([^']+)'\)|state_attr\('([^']+)',\s*'([^']+)'\))\s*\|\s*float\(0\)\s*(>=|<=|>|<|==|!=)\s*(-?[\d.]+)$/;

/**
 * Parses a condition expression into a StyleCondition — exactly the
 * spellings conditionExpr (css-generator.ts) emits, nothing more. Returns
 * null for anything else so callers leave the declaration unclaimed.
 */
function parseConditionExpr(cond: string): StyleCondition | null {
  const trimmed = cond.trim();
  const onOff = trimmed.match(COND_ON_OFF_PATTERN);
  if (onOff) return { when: onOff[1] as 'on' | 'off' };
  const custom = trimmed.match(COND_CUSTOM_PATTERN);
  if (custom) return { when: 'custom', customEntity: custom[1] };
  const value = trimmed.match(COND_VALUE_PATTERN);
  if (value) {
    const [, stateEntity, attrEntity, attrName, operator, numStr] = value;
    return {
      when: 'value',
      valueEntity: stateEntity ?? attrEntity,
      ...(attrName ? { valueAttribute: attrName } : {}),
      valueOperator: operator as StyleCondition['valueOperator'],
      valueThreshold: parseFloat(numStr),
    };
  }
  return null;
}

/** Parses a full `{{ 'A' if COND else 'B' }}` value; null when the shape or
 *  the condition isn't ours. */
function parseCondTernary(
  value: string,
): { onValue: string; offValue: string; condition: StyleCondition } | null {
  const match = value.trim().match(COND_TERNARY_PATTERN);
  if (!match) return null;
  const condition = parseConditionExpr(match[2]);
  if (!condition) return null;
  return { onValue: match[1], offValue: match[3], condition };
}

// ---------------------------------------------------------------------------
// Animation module
// ---------------------------------------------------------------------------

/** Pattern: cms-{preset} {speed}s {timing} infinite (see animationDecls). */
const ANIM_PATTERN =
  /^cms-(pulse|breathe|gradient-shift|blink|bounce|shake|spin|glow|heartbeat)\s+([\d.]+)s\s+(ease-in-out|linear)\s+infinite$/;

/**
 * The value-conditional animation form (trigger === 'value'):
 *   {{ 'cms-… …s … infinite' if states('id') | float(0) OP N else 'none' }}
 * (or the state_attr('id', 'attr') source). Anchored, single-branch, and
 * `else 'none'` only — a multi-branch or otherwise richer expression stays
 * unmatched and falls through to Advanced CSS untouched.
 * Groups: [1]=animation value, [2]=states entity, [3]=attr entity,
 * [4]=attribute, [5]=operator, [6]=threshold number.
 */
const ANIM_VALUE_TRIGGER_PATTERN =
  /^\{\{\s*'([^']+)'\s+if\s+(?:states\('([^']+)'\)|state_attr\('([^']+)',\s*'([^']+)'\))\s*\|\s*float\(0\)\s*(>=|<=|>|<|==|!=)\s*(-?[\d.]+)\s+else\s+'none'\s*\}\}$/;

/**
 * Parses "cms-{preset} {speed}s {timing} infinite" into preset + speed.
 * The timing function must be exactly what the generator emits for that
 * preset (ANIMATION_TIMING) — a hand-edited timing is not something the
 * module can reproduce, so it must fall through unclaimed.
 */
function parseAnimValue(
  value: string,
): { preset: AnimationModuleState['preset']; speedS: number } | null {
  const match = value.match(ANIM_PATTERN);
  if (!match) return null;
  const preset = match[1] as AnimationModuleState['preset'];
  if (match[3] !== ANIMATION_TIMING[preset]) return null;
  return { preset, speedS: parseFloat(match[2]) };
}

function mapAnimation(
  haCard: CssTarget | null,
  claimed: Set<string>,
): AnimationModuleState {
  if (!haCard) return { ...DEFAULT_ANIMATION };

  const animProp = findProp(haCard, 'animation');
  if (!animProp) return { ...DEFAULT_ANIMATION };

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
    const parsed = parseAnimValue(animProp.value);
    if (parsed) {
      claimCompanions();
      return { enabled: true, ...parsed, trigger: 'always' };
    }
  } else if (animProp.onValue || animProp.offValue) {
    // Parse conditional animation (trigger=on/off/custom entity)
    const onValue = animProp.onValue?.trim() || '';
    const offValue = animProp.offValue?.trim() || '';

    const onParsed = parseAnimValue(onValue);
    const parsed = onParsed ?? parseAnimValue(offValue);

    if (parsed) {
      // An animation on the OFF side of a CUSTOM entity has no
      // representable trigger ('custom' means while-ON): claiming it used
      // to drop the entity and rebind the animation to config.entity on
      // save (audit W1). Leave it unclaimed → Advanced CSS, verbatim.
      if (animProp.entityId && !onParsed) return { ...DEFAULT_ANIMATION };

      claimCompanions();

      const base = { enabled: true, ...parsed };

      // A quoted entity in the is_state(...) condition means "animate
      // while a DIFFERENT entity is on" — losing it here silently rebound
      // the animation to the card's own entity on the next save.
      if (animProp.entityId && onParsed) {
        return { ...base, trigger: 'custom', customEntity: animProp.entityId };
      }

      return { ...base, trigger: onParsed ? 'on' : 'off' };
    }
  } else {
    // Jinja the on/off analyzer didn't recognise — try the value-conditional
    // form (trigger === 'value'). Anything else stays unclaimed.
    const match = animProp.value.trim().match(ANIM_VALUE_TRIGGER_PATTERN);
    if (match) {
      const [, animValue, stateEntity, attrEntity, attrName, operator, numStr] = match;
      const parsed = parseAnimValue(animValue);
      if (parsed) {
        claimCompanions();
        return {
          enabled: true,
          ...parsed,
          trigger: 'value',
          valueEntity: stateEntity ?? attrEntity,
          ...(attrName ? { valueAttribute: attrName } : {}),
          valueOperator: operator as AnimationModuleState['valueOperator'],
          valueThreshold: parseFloat(numStr),
        };
      }
    }
  }

  return { ...DEFAULT_ANIMATION };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function mapToStudioState(parsed: CardModStyleState, cardType?: string): StudioState {
  const haCard = findTarget(parsed.targets, 'ha-card');
  const haStateIcon = findTarget(parsed.targets, 'ha-state-icon');
  const haIcon = findTarget(parsed.targets, 'ha-icon');
  // Card-level :host — the shape v0.3.1–v0.3.8 generated icon colors into
  // (`:host { --paper-item-icon-color: … }`), and a hand-written idiom.
  const hostTarget = findTarget(parsed.targets, ':host');
  const haGauge = findTarget(parsed.targets, 'ha-gauge');
  const haTileIcon = findTarget(parsed.targets, 'ha-tile-icon');
  // Heading card: the v0.10 shape (HA's --ha-heading-card-* variables on
  // .container, `.content` selectors) and the pre-v0.10 one (`.title p` /
  // `.title ha-icon`, dead since HA 2026.10) — both recognised, so an old
  // config is adopted and rewritten in the working shape on save.
  const titleP = findTarget(parsed.targets, '.title p');
  const headingIcon =
    findTargetNormalized(parsed.targets, HEADING_ICON_SELECTOR) ?? findTarget(parsed.targets, '.title ha-icon');
  const headingFamily = findTargetNormalized(parsed.targets, HEADING_FAMILY_SELECTOR);
  const container = findTarget(parsed.targets, '.container');

  const claimed = new Set<string>();

  return {
    filter: mapFilter(haCard, claimed),
    iconColor: mapIconColor(haStateIcon, haIcon, haCard, hostTarget, haTileIcon, cardType, claimed),
    accentColor: mapAccentColor(haCard, haGauge, claimed),
    background: mapBackground(haCard, claimed),
    animation: mapAnimation(haCard, claimed),
    border: mapBorder(haCard, claimed),
    headingStyle: mapHeadingStyle(titleP, headingIcon, container, headingFamily, claimed),
    font: mapFont(parsed.targets, haCard, claimed),
    threshold: mapThreshold(haCard, haStateIcon, haGauge, hostTarget, cardType, claimed),
    advanced: mapAdvanced(parsed, claimed),
    // Dict-form carrier (v0.10): threaded to the save path so the dict is
    // rebuilt byte-identically around the regenerated `.` entry.
    ...(parsed.dictSource ? { dictSource: parsed.dictSource } : {}),
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
    font: primary.font.enabled ? primary.font : secondary.font,
    threshold: primary.threshold.enabled ? primary.threshold : secondary.threshold,
    advanced: { rawCss: mergeRawCss(primary.advanced.rawCss, secondary.advanced.rawCss) },
    // The dict carrier always follows the PRIMARY (active-key) style — a
    // dict-form secondary is the mixed-form case the save path freezes.
    ...(primary.dictSource ? { dictSource: primary.dictSource } : {}),
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

/** Like findTarget, but insensitive to whitespace around/after commas and
 *  between compound parts — for multi-selector rules the generator writes
 *  one-per-line (`a,\nb`) that a hand edit may re-flow (`a, b`). */
function findTargetNormalized(targets: CssTarget[], selector: string): CssTarget | null {
  const norm = (sel: string) => sel.trim().toLowerCase().replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ');
  const want = norm(selector);
  return targets.find((t) => norm(t.selector) === want) ?? null;
}

function findProp(target: CssTarget, property: string): CssProperty | null {
  const norm = property.trim().toLowerCase();
  return target.properties.find((p) => p.property === norm) ?? null;
}

// ---------------------------------------------------------------------------
// Filter module
// ---------------------------------------------------------------------------

/**
 * Parses a filter-effects list into its values — but only when the string
 * is EXACTLY `brightness(N%)? blur(Npx)? opacity(N%)?` in that (canonical
 * generator) order. `allowEmpty` accepts '' (the grayscale-only case).
 * Returns null otherwise, so callers leave the declaration unclaimed.
 */
function parseEffectParts(
  value: string,
  allowEmpty: boolean,
): { brightness?: number; blur?: number; opacity?: number } | null {
  if (value === '') return allowEmpty ? {} : null;
  const match = value.match(
    /^(?:brightness\((\d+(?:\.\d+)?)%\))?\s*(?:blur\((\d+(?:\.\d+)?)px\))?\s*(?:opacity\((\d+(?:\.\d+)?)%\))?$/,
  );
  if (!match || (match[1] === undefined && match[2] === undefined && match[3] === undefined)) {
    return null;
  }
  return {
    ...(match[1] !== undefined ? { brightness: parseFloat(match[1]) } : {}),
    ...(match[2] !== undefined ? { blur: parseFloat(match[2]) } : {}),
    ...(match[3] !== undefined ? { opacity: parseFloat(match[3]) } : {}),
  };
}

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
      // combined filter on reopen. The 'none' shortcut is only valid when
      // the gray branch is grayscale-ONLY — otherwise ride-along effects
      // were silently dropped from the other branch (audit W2). Exactly
      // grayscale(100%) is required: grayscale(50%) is not something the
      // module can express and used to be rewritten to 100% (audit W2).
      const grayRemainder = (branch: string | undefined): string =>
        (branch ?? '').replace(/^grayscale\(100%\)\s*/, '').trim();
      const matchesOther = (grayBranch: string | undefined, other: string | undefined): boolean => {
        if (!grayBranch?.trim().startsWith('grayscale(100%)')) return false;
        const remainder = grayRemainder(grayBranch);
        if (other?.trim() === 'none') return remainder.length === 0;
        if (!other) return false;
        return remainder.length > 0 && other.trim() === remainder;
      };

      if (offHasGrayscale && matchesOther(filterProp.offValue, filterProp.onValue)) {
        // grayscale when off, none when on. With a CUSTOM entity this shape
        // is NOT claimable: 'custom' means "while the entity is ON", so
        // claiming an off-side custom conditional inverted it on the next
        // save (audit W1).
        if (!customEntity) {
          state.enabled = true;
          state.grayscale = true;
          state.grayscaleWhen = 'off';
          filterClaimed = true;
        }
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

      if (filterClaimed) {
        // Brightness/blur/opacity riding along in the grayscale branches —
        // read from the branch that actually CARRIES the grayscale (the
        // old onValue-first read grabbed the wrong branch for off-side
        // conditionals, audit W2). A remainder that isn't exactly our
        // effects list (hand-written hue-rotate etc.) reverts the claim.
        const source = (offHasGrayscale ? filterProp.offValue : filterProp.onValue) ?? filterProp.value;
        const parts = parseEffectParts(grayRemainder(source), true);
        if (parts) {
          if (parts.brightness !== undefined) state.brightness = parts.brightness;
          if (parts.blur !== undefined) state.blur = parts.blur;
          if (parts.opacity !== undefined) state.opacity = parts.opacity;
        } else {
          state.enabled = false;
          state.grayscale = false;
          state.grayscaleWhen = DEFAULT_FILTER.grayscaleWhen;
          delete state.customEntity;
          filterClaimed = false;
        }
      } else {
        // Conditional filter WITHOUT grayscale — the v0.9 effects-condition
        // form: {{ 'brightness(…) blur(…) opacity(…)' if COND else 'none' }}.
        // Anything else (a condition we can't spell, a branch that isn't an
        // exact effects list) stays UNCLAIMED — the old code here salvaged
        // brightness/blur out of the raw Jinja and silently flattened the
        // condition away on the next save.
        const ternary = parseCondTernary(filterProp.value);
        const parts = ternary && ternary.offValue === 'none'
          ? parseEffectParts(ternary.onValue, false)
          : null;
        if (ternary && parts) {
          state.enabled = true;
          if (parts.brightness !== undefined) state.brightness = parts.brightness;
          if (parts.blur !== undefined) state.blur = parts.blur;
          if (parts.opacity !== undefined) state.opacity = parts.opacity;
          state.effectsWhen = ternary.condition;
          filterClaimed = true;
        }
      }

    } else {
      // Plain (non-conditional) filter value. Claimed only when the value
      // is EXACTLY the parts this module emits (canonical order, grayscale
      // exactly 100% — grayscale(50%) used to be rewritten to 100%, audit
      // W2) — a hand-written `hue-rotate(90deg) brightness(80%)` used to
      // have its brightness salvaged and the rest silently dropped on save.
      const val = filterProp.value.trim();
      const grayscale = val.startsWith('grayscale(100%)');
      if (!grayscale && val.startsWith('grayscale(')) {
        // A grayscale amount the module can't express — leave unclaimed.
      } else {
        const rest = grayscale ? val.replace(/^grayscale\(100%\)\s*/, '').trim() : val;
        const parts = parseEffectParts(rest, true);
        // Claim only when regeneration re-emits something: an all-defaults
        // list like `brightness(100%)` produced state the generator emits
        // NOTHING for — claimed-then-deleted on save (audit W2).
        const emittable =
          (parts?.brightness !== undefined && parts.brightness !== 100) ||
          (parts?.blur !== undefined && parts.blur > 0) ||
          (parts?.opacity !== undefined && parts.opacity < 100);
        if (parts && (grayscale || emittable)) {
          state.enabled = true;
          if (grayscale) {
            state.grayscale = true;
            state.grayscaleWhen = 'always';
          }
          if (parts.brightness !== undefined) state.brightness = parts.brightness;
          if (parts.blur !== undefined) state.blur = parts.blur;
          if (parts.opacity !== undefined) state.opacity = parts.opacity;
          filterClaimed = true;
        }
      }
    }

    if (filterClaimed) claimed.add(claimKey(haCard.selector, 'filter'));
  }

  // Only claim a transition when the filter module itself was recognised —
  // the generator only re-emits `transition:` alongside filter declarations
  // (see filterDecls), so claiming a hand-authored standalone transition
  // here would delete it on the next save: claimed (not in Advanced CSS)
  // but never regenerated.
  // …and only a transition whose property list is exactly `filter` — a
  // hand-written `transition: all …` was claimed and NARROWED to
  // `transition: filter …` on save (audit W2). An `all` transition now
  // stays verbatim in Advanced CSS (it keeps winning — emitted last).
  // …and only the exact single-transition shape the generator emits
  // (`filter <duration> [ease]`): a list (`filter 300ms, transform 1s`), a
  // custom easing or a delay used to be claimed and dropped (audit v0.10 #11).
  if (transitionProp && state.enabled) {
    const m = transitionProp.value.trim().match(/^filter\s+(\d+(?:\.\d+)?)(ms|s)(?:\s+ease)?$/);
    const ms = m ? parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1) : NaN;
    if (Number.isFinite(ms) && Math.abs(ms - Math.round(ms)) < 1e-6) {
      state.transitionMs = Math.round(ms);
      claimed.add(claimKey(haCard.selector, 'transition'));
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// Icon color module
// ---------------------------------------------------------------------------

/**
 * Adopting a hand-written equivalent phrasing is only safe when (a) the
 * card type actually offers the Icon Color module (regenerating in module
 * syntax must land on a card where `ha-state-icon { color !important }`
 * verifiably works — see CARD_SUPPORT_MATRIX.md), and (b) the value is
 * something the module can express exactly. Anything else stays verbatim
 * in Advanced CSS — never reinterpreted, never dropped (v0.8.1).
 */
function iconAdoptionAllowed(cardType?: string): boolean {
  // No card type known (defensive callers) → don't adopt, only preserve.
  if (!cardType) return false;
  if (cardType === 'entities') return false; // rows, not a card icon
  return !NO_ICON_COLOR_TYPES.has(cardType);
}

function mapIconColor(
  haStateIcon: CssTarget | null,
  haIcon: CssTarget | null,
  haCard: CssTarget | null,
  hostTarget: CssTarget | null,
  haTileIcon: CssTarget | null,
  cardType: string | undefined,
  claimed: Set<string>,
): IconColorModuleState {
  const state = mapIconColorCore(haStateIcon, haIcon, haCard, hostTarget, cardType, claimed);

  if (!state.enabled) {
    // Icon SIZE must survive even when the color side wasn't recognized —
    // specifically when Threshold owns icon-color (the ha-state-icon color
    // is then a multi-branch ternary this mapper deliberately doesn't
    // claim). Bailing out here lost the size setting and leaked the size
    // vars into Advanced CSS on reopen (audit W5/BUG-8). Only that
    // threshold-shaped case may re-enable the module for size: a PLAIN
    // unrecognized color stays fully unclaimed, since enabled:true would
    // make the generator emit a default color over the hand-written one.
    const colorProp = haStateIcon ? findProp(haStateIcon, 'color') : undefined;
    const thresholdShaped =
      !!colorProp && colorProp.hasCondition && !colorProp.onValue && !colorProp.offValue;
    if (!thresholdShaped) return state;
    applyIconSize(state, haCard, haTileIcon, cardType, claimed);
    if (state.sizePx !== undefined && state.sizePx > 0) state.enabled = true;
    return state;
  }

  return applyIconSize(state, haCard, haTileIcon, cardType, claimed);
}

/** v0.9 icon size — the ha-card variable pair, or tile's ha-tile-icon
 *  block (see iconSizeDecls/tileIconSizeBlock). Claimed only on card
 *  types the generator re-emits it for (ICON_SIZE_TYPES): claiming it
 *  elsewhere would silently drop the declaration on the next save. */
function applyIconSize(
  state: IconColorModuleState,
  haCard: CssTarget | null,
  haTileIcon: CssTarget | null,
  cardType: string | undefined,
  claimed: Set<string>,
): IconColorModuleState {
  const applySize = (raw: string): boolean => {
    const staticMatch = raw.trim().match(/^(\d+(?:\.\d+)?)px$/);
    if (staticMatch) {
      state.sizePx = parseFloat(staticMatch[1]);
      return true;
    }
    const ternary = parseCondTernary(raw.trim());
    const on = ternary?.onValue.match(/^(\d+(?:\.\d+)?)px$/);
    const off = ternary?.offValue.match(/^(\d+(?:\.\d+)?)px$/);
    if (!ternary || !on || !off) return false;
    state.sizePx = parseFloat(on[1]);
    const offPx = parseFloat(off[1]);
    if (offPx !== 24) state.sizeOffPx = offPx; // 24 = the generator's default else-branch
    state.sizeWhen = ternary.condition;
    return true;
  };

  if (cardType === 'tile') {
    const tileMdc = haTileIcon ? findProp(haTileIcon, '--mdc-icon-size') : undefined;
    if (haTileIcon && tileMdc && applySize(tileMdc.value)) {
      claimed.add(claimKey(haTileIcon.selector, '--mdc-icon-size'));
    }
  } else if (cardType && ICON_SIZE_TYPES.has(cardType) && haCard) {
    const mdc = findProp(haCard, '--mdc-icon-size');
    const haSize = findProp(haCard, '--ha-icon-size');
    if (mdc && haSize && mdc.value.trim() === haSize.value.trim() && applySize(mdc.value)) {
      claimed.add(claimKey(haCard.selector, '--mdc-icon-size'));
      claimed.add(claimKey(haCard.selector, '--ha-icon-size'));
    }
  }

  return state;
}

function mapIconColorCore(
  haStateIcon: CssTarget | null,
  haIcon: CssTarget | null,
  haCard: CssTarget | null,
  hostTarget: CssTarget | null,
  cardType: string | undefined,
  claimed: Set<string>,
): IconColorModuleState {
  // Hand-written equivalents, tried only when the canonical ha-state-icon
  // form is absent (if both exist, the canonical one wins and the other is
  // surfaced by the Advanced-CSS override warning instead of guessed at):
  // 1. `ha-icon { color: X }` — ha-icon sits inside ha-state-icon and
  //    inherits its color, so the module's phrasing is equivalent.
  // 2. `ha-card { --state-icon-color: X }` / `--paper-item-icon-color` —
  //    the standard icon-color variables; equivalent on every card type
  //    the module is offered for.
  if (!haStateIcon || !findProp(haStateIcon, 'color')) {
    if (iconAdoptionAllowed(cardType)) {
      if (haIcon) {
        const adopted = mapIconColorCore(haIcon, null, null, null, cardType, claimed);
        if (adopted.enabled) return adopted;
      }
      for (const target of [haCard, hostTarget]) {
        if (!target) continue;
        // Skip when the variable is an Accent Color companion (same value
        // as --accent-color) — that belongs to the accent module's claims.
        const accentProp = haCard ? findProp(haCard, '--accent-color') : undefined;
        for (const varName of ['--state-icon-color', '--paper-item-icon-color']) {
          const prop = findProp(target, varName);
          if (!prop) continue;
          if (accentProp && accentProp.value.trim() === prop.value.trim()) continue;
          const adopted = mapIconColorCore(
            { selector: target.selector, properties: [{ ...prop, property: 'color' }] } as CssTarget,
            null, null, null, cardType, new Set(),
          );
          if (adopted.enabled) {
            claimed.add(claimKey(target.selector, varName));
            return adopted;
          }
        }
      }
    }
    return { ...DEFAULT_ICON_COLOR };
  }

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

/** Parses `linear-gradient(NNdeg, c1, c2)` splitting on TOP-LEVEL commas —
 *  palette colors are `var(--x-color)` and hand-typed ones can be
 *  `rgb(r, g, b)`, both of which broke the old `[^,]+` capture and dumped
 *  the whole gradient string into color1 as a "solid" (audit W7). */
function parseLinearGradient(value: string): { angle: number; color1: string; color2: string } | null {
  const m = value.trim().match(/^linear-gradient\(\s*(\d+)deg\s*,([\s\S]+)\)$/i);
  if (!m) return null;
  const body = m[2];
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  if (parts.length !== 2) return null;
  const color1 = parts[0].trim();
  const color2 = parts[1].trim();
  if (!color1 || !color2) return null;
  return { angle: parseInt(m[1], 10), color1, color2 };
}

// ---------------------------------------------------------------------------

function mapBackground(
  haCard: CssTarget | null,
  claimed: Set<string>,
): BackgroundModuleState {
  if (!haCard) return { ...DEFAULT_BACKGROUND };

  let bgProp = findProp(haCard, 'background');

  // Hand-written equivalent: `background-color: X` (the longhand). Adopted
  // as a solid background ONLY when it's a plain static value and no other
  // background-* longhand sits next to it — the module regenerates as the
  // `background` shorthand, which would reset a coexisting
  // background-image/position/size. Anything richer stays in Advanced CSS.
  if (!bgProp) {
    const bgColorProp = findProp(haCard, 'background-color');
    const otherBgLonghands = haCard.properties.some(
      (p) => p.property.startsWith('background-') && p.property !== 'background-color',
    );
    if (bgColorProp && !bgColorProp.hasCondition && bgColorProp.value.trim() && !otherBgLonghands) {
      claimed.add(claimKey(haCard.selector, 'background-color'));
      return {
        ...DEFAULT_BACKGROUND,
        enabled: true,
        type: 'solid',
        color1: bgColorProp.value.trim(),
        applyWhen: 'always',
      };
    }
    return { ...DEFAULT_BACKGROUND };
  }

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
      // Background on the OFF side of a CUSTOM entity is NOT claimable:
      // 'custom' regenerates as "while the entity is ON" — claiming this
      // shape INVERTED the user's condition on save (audit W1). Falls to
      // Advanced CSS, preserved verbatim.
      if (bgProp.entityId) return { ...DEFAULT_BACKGROUND };
      applyWhen = 'off';
      colorVal = offVal;
    }
    if (applyWhen && colorVal) {
      claimed.add(claimKey(haCard.selector, 'background'));
      const customEntity = applyWhen === 'custom' ? { customEntity: bgProp.entityId } : {};
      const gradient = parseLinearGradient(colorVal);
      if (gradient) {
        return {
          enabled: true, type: 'gradient',
          color1: gradient.color1, color2: gradient.color2,
          angle: gradient.angle, applyWhen, ...customEntity,
        };
      }
      return { ...DEFAULT_BACKGROUND, enabled: true, type: 'solid', color1: colorVal, applyWhen, ...customEntity };
    }
    return { ...DEFAULT_BACKGROUND };
  }

  if (bgProp.hasCondition) return { ...DEFAULT_BACKGROUND };

  const value = bgProp.value.trim();

  const gradient = parseLinearGradient(value);
  if (gradient) {
    claimed.add(claimKey(haCard.selector, 'background'));
    return {
      enabled: true,
      type: 'gradient',
      color1: gradient.color1,
      color2: gradient.color2,
      angle: gradient.angle,
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
    // `solid` only — the module has no style setting and the generator
    // always emits solid, so dashed/dotted/none/… used to be rewritten to a
    // (visible!) solid border on the next save (audit v0.10 #10).
    const match = borderProp.value.match(
      /^(\d+)px\s+(solid)\s+(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\)|rgba?\([\d\s.,%]+\)|[a-zA-Z]+)$/i,
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
  } else if (borderProp) {
    // v0.9 state-driven width: {{ 'Npx solid C' if COND else 'none'|'Mpx
    // solid C' }} — solid only, same color both branches (exactly what
    // borderDecls emits). Anything else stays unclaimed → Advanced CSS.
    const ternary = parseCondTernary(borderProp.value);
    if (ternary) {
      const BRANCH = /^(\d+)px\s+solid\s+(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\)|rgba?\([\d\s.,%]+\)|[a-zA-Z]+)$/i;
      const on = ternary.onValue.match(BRANCH);
      const off = ternary.offValue === 'none' ? 'none' : ternary.offValue.match(BRANCH);
      const colorsMatch = off === 'none' || (off !== null && on !== null && off[2] === on[2]);
      if (on && off !== null && colorsMatch) {
        state.enabled = true;
        state.borderWidth = parseInt(on[1], 10);
        state.borderColor = on[2];
        state.widthWhen = ternary.condition;
        if (off !== 'none') state.widthOffPx = parseInt(off[1], 10);
        claimed.add(claimKey(haCard.selector, 'border'));
        if (!radiusProp) state.radiusPx = 0;
      }
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
  family: CssTarget | null,
  claimed: Set<string>,
): HeadingStyleModuleState {
  if (!titleP && !titleIcon && !container && !family) return { ...DEFAULT_HEADING_STYLE };

  const state: HeadingStyleModuleState = { ...DEFAULT_HEADING_STYLE };

  // v0.10 shape: HA's own heading variables on .container. The title set is
  // the source of truth; each subtitle twin is claimed only when it carries
  // the same value (that's what the generator writes) — a hand-written,
  // different subtitle value stays in Advanced CSS untouched.
  if (container) {
    const plain = (name: string) => {
      const p = findProp(container, name);
      return p && !p.hasCondition && !p.important && p.value.trim() ? p.value.trim() : null;
    };
    const claimWithTwin = (aspect: string) => {
      claimed.add(claimKey(container.selector, `--ha-heading-card-title-${aspect}`));
      const title = plain(`--ha-heading-card-title-${aspect}`);
      if (title !== null && plain(`--ha-heading-card-subtitle-${aspect}`) === title) {
        claimed.add(claimKey(container.selector, `--ha-heading-card-subtitle-${aspect}`));
      }
    };
    const size = plain('--ha-heading-card-title-font-size')?.match(/^(\d+(?:\.\d+)?)px$/);
    if (size) {
      state.enabled = true;
      state.fontSize = parseFloat(size[1]);
      claimWithTwin('font-size');
    }
    const color = plain('--ha-heading-card-title-color');
    if (color) {
      state.enabled = true;
      state.textColor = color;
      claimWithTwin('color');
    }
    const weight = plain('--ha-heading-card-title-font-weight');
    if (weight && FONT_WEIGHT_FROM_VALUE[weight]) {
      state.enabled = true;
      state.fontWeight = FONT_WEIGHT_FROM_VALUE[weight];
      claimWithTwin('font-weight');
    }
  }

  if (family) {
    const familyProp = findProp(family, 'font-family');
    if (familyProp && !familyProp.hasCondition && familyProp.value.trim()) {
      state.enabled = true;
      state.fontFamily = familyProp.value.trim();
      claimed.add(claimKey(family.selector, 'font-family'));
    }
  }

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

    const weightProp = findProp(titleP, 'font-weight');
    if (weightProp && !weightProp.hasCondition && FONT_WEIGHT_FROM_VALUE[weightProp.value.trim()]) {
      state.enabled = true;
      state.fontWeight = FONT_WEIGHT_FROM_VALUE[weightProp.value.trim()];
      claimed.add(claimKey(titleP.selector, 'font-weight'));
    }

    const familyProp = findProp(titleP, 'font-family');
    if (familyProp && !familyProp.hasCondition && familyProp.value.trim()) {
      state.enabled = true;
      state.fontFamily = familyProp.value.trim();
      claimed.add(claimKey(titleP.selector, 'font-family'));
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
// Font module
// ---------------------------------------------------------------------------

const FONT_WEIGHT_FROM_VALUE: Record<string, FontModuleState['fontWeight']> = {
  normal: 'normal',
  '500': 'medium',
  bold: 'bold',
};

/** Claims the tile companion variables (see fontAuxDecls in css-generator.ts)
 *  matching the recognised size/weight/color — same pattern as claimAccentAux. */
/**
 * Claims every per-card-type companion the Font generator can emit (see
 * fontCompanionDecls/fontCompanionBlocks in css-generator.ts) whose value
 * matches the recognised size/weight/color/family — same pattern as
 * claimAccentAux. The parser doesn't know the card type, so it checks all
 * known companion shapes; only exact value matches are claimed, so a
 * hand-written declaration with a different value stays in Advanced CSS.
 */
function claimFontCompanions(
  targets: CssTarget[],
  haCard: CssTarget,
  sizePx: number,
  size: string,
  weight: string,
  color: string | null,
  family: string | null,
  claimed: Set<string>,
): void {
  const claimIf = (target: CssTarget | null, property: string, expected: string | null) => {
    if (!target || expected === null) return;
    const prop = findProp(target, property);
    if (prop && prop.value.trim() === expected) claimed.add(claimKey(target.selector, property));
  };

  // ha-card variable companions
  for (const [name, expected] of [
    ['--ha-tile-info-primary-font-size', size],
    ['--ha-tile-info-secondary-font-size', size],
    ['--ha-tile-info-primary-font-weight', weight],
    ['--ha-tile-info-secondary-font-weight', weight],
    ['--ha-tile-info-primary-color', color],
    ['--ha-tile-info-secondary-color', color],
    ['--primary-text-color', color],
    ['--ha-font-size-l', size],
    ['--ha-font-weight-medium', weight],
    ['--ha-card-header-font-size', headerFontSize(sizePx)],
    ['--ha-card-header-color', color],
    ['--ha-card-header-font-family', family],
  ] as Array<[string, string | null]>) {
    claimIf(haCard, name, expected);
  }

  // Selector-block companions (light/sensor/entity/gauge/thermostat/entities)
  const name = findTarget(targets, '.name');
  claimIf(name, 'font-size', size);
  claimIf(name, 'font-weight', weight);
  claimIf(name, 'color', color);

  const value = findTarget(targets, '.value');
  claimIf(value, 'font-size', valueFontSize(sizePx));

  const measurement = findTarget(targets, '.measurement');
  claimIf(measurement, 'font-size', size);
  claimIf(measurement, 'color', color);

  for (const sel of ['#info', '.brightness']) {
    claimIf(findTarget(targets, sel), 'font-size', size);
  }

  const title = findTarget(targets, '.title');
  claimIf(title, 'font-size', size);
  claimIf(title, 'font-weight', weight);
  claimIf(title, 'color', color);

  claimIf(findTarget(targets, '.card-header'), 'font-weight', weight);
}

/**
 * Recognises a plain (non-conditional) font-size/font-weight/color/font-family
 * on ha-card — everything the Font module generates. font-size anchors
 * "is this module enabled at all"; weight/color/family are each recognised
 * independently so a hand-edited partial version (e.g. someone deleted just
 * the color line) still round-trips size/weight rather than falling through
 * whole-cloth to Advanced CSS.
 */
function mapFont(targets: CssTarget[], haCard: CssTarget | null, claimed: Set<string>): FontModuleState {
  if (!haCard) return { ...DEFAULT_FONT };

  const fontSizeProp = findProp(haCard, 'font-size');
  if (!fontSizeProp || fontSizeProp.hasCondition) return { ...DEFAULT_FONT };
  const sizeMatch = fontSizeProp.value.trim().match(/^(\d+(?:\.\d+)?)px$/);
  if (!sizeMatch) return { ...DEFAULT_FONT };

  const state: FontModuleState = { ...DEFAULT_FONT, enabled: true, fontSize: parseFloat(sizeMatch[1]) };
  claimed.add(claimKey(haCard.selector, 'font-size'));
  const sizeStr = fontSizeProp.value.trim();

  let weightStr = 'normal';
  const weightProp = findProp(haCard, 'font-weight');
  if (weightProp && !weightProp.hasCondition && FONT_WEIGHT_FROM_VALUE[weightProp.value.trim()]) {
    weightStr = weightProp.value.trim();
    state.fontWeight = FONT_WEIGHT_FROM_VALUE[weightStr];
    claimed.add(claimKey(haCard.selector, 'font-weight'));
  }

  let colorStr: string | null = null;
  const colorProp = findProp(haCard, 'color');
  if (colorProp && !colorProp.hasCondition && colorProp.value.trim()) {
    colorStr = colorProp.value.trim();
    state.color = colorStr;
    claimed.add(claimKey(haCard.selector, 'color'));
  }

  let familyStr: string | null = null;
  const familyProp = findProp(haCard, 'font-family');
  if (familyProp && !familyProp.hasCondition && familyProp.value.trim()) {
    familyStr = familyProp.value.trim();
    state.fontFamily = familyStr;
    claimed.add(claimKey(haCard.selector, 'font-family'));
  }

  claimFontCompanions(targets, haCard, state.fontSize, sizeStr, weightStr, colorStr, familyStr, claimed);

  return state;
}

// ---------------------------------------------------------------------------
// Threshold module
// ---------------------------------------------------------------------------

export function parseThresholdJinja(value: string): {
  entityId: string;
  /** Set when the rules read state_attr(entity, attribute) instead of the state. */
  attribute?: string;
  rules: ThresholdRule[];
  defaultColor: string;
} | null {
  if (!value.includes('float(0)')) return null;

  // Color token accepts hex, a bare CSS color name, var(--xxx-color) — the
  // var form is what the palette presets (see cms-color-picker.ts) write,
  // so a rule picked from the palette round-trips back into a rule instead
  // of falling through to Advanced CSS — or rgb()/rgba() (roadmap #26:
  // comma-containing color functions generated fine but never re-parsed,
  // so the whole block fell to Advanced CSS on reopen).
  // Threshold value accepts an optional leading minus — freezer/outdoor
  // temperatures are routinely negative, and without `-?` those rules were
  // silently deleted on reopen (matched-and-claimed but never re-parsed).
  // The value source is either states('id') or state_attr('id', 'attr')
  // (attribute-based thresholds, roadmap #16).
  const RULE_RE =
    /'(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\)|rgba?\([\d\s.,%]+\)|[a-zA-Z]+)'\s+if\s+(?:states\('([^']+)'\)|state_attr\('([^']+)',\s*'([^']+)'\))\s*\|\s*float\(0\)\s*(>=|<=|>|<|==|!=)\s*(-?[\d.]+(?:\.\d+)?)/g;
  // Trailing anchor is `)` or `}` ONLY — the final else is always followed
  // by `}}` (or `)` inside a wrapping expression). With `\s` in the class
  // this used to match an INTERMEDIATE `else 'color' if …` of a multi-rule
  // chain, reading rule 2's color as the default.
  const DEFAULT_RE = /else\s+'(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\)|rgba?\([\d\s.,%]+\)|[a-zA-Z]+)'\s*[)}]/;

  // The value must be exactly ONE {{ … }} expression — anything around it
  // (a `url()` after it, a second template) can't be regenerated.
  const trimmed = value.trim();
  if (!trimmed.startsWith('{{') || !trimmed.endsWith('}}') || trimmed.indexOf('{{', 2) !== -1) return null;

  const rules: ThresholdRule[] = [];
  let entityId = '';
  let attribute: string | undefined;
  let idx = 0;
  let match: RegExpExecArray | null;

  while ((match = RULE_RE.exec(trimmed)) !== null) {
    const [, color, stateEntity, attrEntity, attrName, operator, numStr] = match;
    const ruleEntity = stateEntity ?? attrEntity;
    // Every rule must read the SAME source — rules on two entities used
    // to be silently rebound to the last one (audit v0.10 #2).
    if (idx > 0 && (ruleEntity !== entityId || attrName !== attribute)) return null;
    entityId = ruleEntity;
    attribute = attrName;
    rules.push({
      id: String(idx++),
      operator: operator as ThresholdRule['operator'],
      value: parseFloat(numStr),
      color,
    });
  }

  if (rules.length === 0 || !entityId) return null;

  // A literal default is required — a non-literal else (another entity's
  // state, a template) used to be replaced by #888888 (audit v0.10 #2).
  const defaultMatch = DEFAULT_RE.exec(trimmed);
  if (!defaultMatch) return null;
  const defaultColor = defaultMatch[1];

  // Claim only what the generator reproduces: same rule ORDER (the
  // generator sorts, which changes first-match semantics of a hand-written
  // chain) and the exact expression, modulo whitespace and redundant
  // parentheses. Extra logic (`and is_state(…)`, arithmetic) used to be
  // silently dropped on regenerate (audit v0.10 #2).
  if (sortThresholdRules(rules).some((r, i) => r !== rules[i])) return null;
  if (!sameThresholdExpression(trimmed, buildThresholdJinja(rules, defaultColor, entityId, attribute))) return null;

  return { entityId, attribute, rules, defaultColor };
}

/** Whitespace-insensitive comparison that also accepts the flat (unparenthesised)
 *  spelling of the generator's right-nested `else (…)` chain — Jinja's
 *  conditional expression is right-associative, so both mean the same. */
function sameThresholdExpression(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, '');
  const flat = (s: string) => norm(s).replace(/else\(/g, 'else').replace(/\)+\}\}$/, '}}');
  return norm(a) === norm(b) || flat(a) === flat(b);
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
export function parseEntityRowCss(css: string, rowEntity?: string): EntitiesRowStyle {
  const style: EntitiesRowStyle = { iconColor: '', textColor: '' };

  // The synthetic `:host` wrapper is only for a BARE declaration list — an
  // @-block-only style (or Jinja statements) wrapped in `:host{…}` wrote
  // corrupt CSS back on every other save (audit v0.10 #15).
  const detailed = isBareDeclarations(css)
    ? { targets: parseCss(`:host{${css}}`), passthroughCss: '', tailCss: '' }
    : parseCssDetailed(css);
  const targets = detailed.targets;
  // Only the row's own `:host` rule is recognised. A rule scoped to a
  // sub-element (state-badge, hui-generic-entity-row, …) used to be read as
  // if it were :host and rewritten as a whole-row rule (audit v0.10 #7).
  const target = targets.find((t) => t.selector.trim().toLowerCase() === ':host');
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
    // Rows have no attribute-threshold UI — an attribute-form expression
    // would silently lose its state_attr() source on regeneration, so it
    // falls through to the row's extraCss passthrough instead. Same for a
    // threshold on ANOTHER entity: the row generator always reads the row's
    // own entity (audit v0.10 #2).
    if (parsed && !parsed.attribute && (!rowEntity || parsed.entityId === rowEntity)) {
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
    if (parsed && !parsed.attribute && (!rowEntity || parsed.entityId === rowEntity)) {
      style.textMode = 'threshold';
      style.textRules = parsed.rules;
      style.textDefault = parsed.defaultColor;
    } else {
      consumed.delete('color');
    }
  } else {
    style.textColor = textVal;
  }

  // Per-row font (issue #25 follow-up)
  const rowFontSize = valueOf('font-size');
  const sizeM = rowFontSize.match(/^(\d+(?:\.\d+)?)px$/);
  if (sizeM) {
    style.fontSizePx = parseFloat(sizeM[1]);
  } else if (rowFontSize) {
    consumed.delete('font-size'); // unrecognised value — keep it in extraCss
  }

  const rowWeight = valueOf('font-weight');
  if (rowWeight && FONT_WEIGHT_FROM_VALUE[rowWeight]) {
    style.fontWeight = FONT_WEIGHT_FROM_VALUE[rowWeight];
  } else if (rowWeight) {
    consumed.delete('font-weight');
  }

  // Everything the recogniser didn't consume — extra declarations on the
  // first selector, whole extra selectors, @-blocks — is preserved verbatim,
  // the row-level counterpart of the card's Advanced CSS passthrough.
  // Without this, any unrelated panel edit rewrites the row and deletes it.
  const extraParts: string[] = [];
  if (detailed.passthroughCss) extraParts.push(detailed.passthroughCss);
  for (const t of targets) {
    const leftover = t === target ? properties.filter((p) => !consumed.has(p.property)) : t.properties;
    if (leftover.length > 0) {
      const decls = leftover
        .map((p) => `  ${p.property}: ${p.value}${p.important ? ' !important' : ''};`)
        .join('\n');
      extraParts.push(`${t.selector} {\n${decls}\n}`);
    }
  }
  if (detailed.tailCss) extraParts.push(detailed.tailCss);
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
    ...(primary.fontSizePx ?? secondary.fontSizePx
      ? { fontSizePx: primary.fontSizePx ?? secondary.fontSizePx }
      : {}),
    ...(primary.fontWeight ?? secondary.fontWeight
      ? { fontWeight: primary.fontWeight ?? secondary.fontWeight }
      : {}),
    // Same rule as mergeStudioStates' rawCss (mergeRawCss): both sides'
    // unrecognised row CSS is kept — the old whole-or-nothing pick deleted
    // the secondary key's on ANY row edit, since the save clears that key
    // (audit v0.10 #5).
    ...(primary.extraCss || secondary.extraCss
      ? { extraCss: mergeRawCss(primary.extraCss ?? '', secondary.extraCss ?? '') }
      : {}),
    // Same rule as mergeStudioStates: the dict carrier always follows the
    // PRIMARY (active-key) style — a secondary dict never merges (the
    // caller freezes that case instead).
    ...(primary.dictSource ? { dictSource: primary.dictSource } : {}),
  };
}

/** True when two parsed threshold blocks are the same rule set (ignoring rule `id`s, which are re-minted per parse). */
function sameThreshold(
  a: { entityId: string; attribute?: string; rules: ThresholdRule[]; defaultColor: string },
  b: { entityId: string; attribute?: string; rules: ThresholdRule[]; defaultColor: string },
): boolean {
  if (a.entityId !== b.entityId || a.defaultColor !== b.defaultColor) return false;
  if ((a.attribute ?? '') !== (b.attribute ?? '')) return false;
  if (a.rules.length !== b.rules.length) return false;
  return a.rules.every(
    (r, i) => r.operator === b.rules[i].operator && r.value === b.rules[i].value && r.color === b.rules[i].color,
  );
}

function mapThreshold(
  haCard: CssTarget | null,
  haStateIcon: CssTarget | null,
  haGauge: CssTarget | null,
  hostTarget: CssTarget | null,
  cardType: string | undefined,
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

  // Legacy (v0.3.1–v0.3.8) and hand-written icon-threshold forms: the same
  // Jinja chain written into an icon-color VARIABLE on ha-card/:host.
  // Adopted (and regenerated in today's ha-state-icon form) only on card
  // types where that regeneration is verifiably equivalent.
  if (iconAdoptionAllowed(cardType)) {
    for (const target of [haCard, hostTarget]) {
      if (!target) continue;
      // An icon-var whose value EQUALS --accent-color's is that module's
      // own companion (accentAuxDecls), not a hand-written icon threshold —
      // adopting it added an unrequested 'icon-color' property to the
      // threshold on every reopen (audit W4). Same skip mapIconColorCore
      // does for its adoption path.
      const accentProp = haCard ? findProp(haCard, '--accent-color') : undefined;
      for (const varName of ['--state-icon-color', '--paper-item-icon-color']) {
        const prop = findProp(target, varName);
        if (!prop?.hasCondition || prop.onValue) continue;
        if (accentProp && accentProp.value.trim() === prop.value.trim()) continue;
        candidates.push({ target, cssProperty: varName, thresholdProperty: 'icon-color' });
      }
    }
  }

  // Collect every candidate whose parsed rules match the *first* matching
  // candidate's rules — e.g. icon-color and accent-color both driven by the
  // same threshold rules become one ThresholdModuleState with two entries in
  // `properties`. A candidate with genuinely different rules (a real
  // conflict, not the same setting duplicated) is left unclaimed and falls
  // through to Advanced CSS rather than being silently merged or dropped.
  let base: { entityId: string; attribute?: string; rules: ThresholdRule[]; defaultColor: string } | null = null;
  const properties: ThresholdProperty[] = [];
  let borderWidth: number | undefined;
  let gradientStops: ColorStop[] | null = null;

  for (const { target, cssProperty, thresholdProperty } of candidates) {
    const prop = findProp(target, cssProperty)!;
    // The border shorthand is `Npx solid {{ … }}` (thresholdPropertyBlock);
    // any other prefix/style can't be regenerated, so it isn't claimed.
    const borderMatch = cssProperty === 'border'
      ? prop.value.trim().match(/^\d+px\s+solid\s+(\{\{[\s\S]*\}\})$/)
      : null;
    if (cssProperty === 'border' && !borderMatch) continue;
    const parsed = parseThresholdJinja(borderMatch ? borderMatch[1] : prop.value);
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
    // text-color on a tile also writes the tile's own text variables.
    if (thresholdProperty === 'text-color') {
      for (const v of ['--ha-tile-info-primary-color', '--ha-tile-info-secondary-color']) {
        const aux = findProp(target, v);
        if (aux && aux.value.trim() === prop.value.trim()) claimed.add(claimKey(target.selector, v));
      }
    }

    // For "border: 2px solid {{ ... }}" extract the width from the leading non-Jinja part
    if (cssProperty === 'border') {
      const bwMatch = prop.value.match(/^(\d+)px/);
      borderWidth = bwMatch ? parseInt(bwMatch[1], 10) : 2;
    }

    // Gradient mode leaves its real anchor points in a sibling custom
    // property on EVERY property block the generator emitted (see
    // thresholdPropertyBlock) — claim the marker on each claimed target,
    // not just the first: the unclaimed copies accreted as orphan blocks
    // in Advanced CSS on every save (audit W3).
    const markerProp = findProp(target, GRADIENT_MARKER_PROPERTY);
    if (markerProp) {
      const unquoted = markerProp.value.trim().replace(/^'|'$/g, '');
      const decoded = decodeGradientStops(unquoted);
      if (decoded) {
        gradientStops ??= decoded;
        claimed.add(claimKey(target.selector, GRADIENT_MARKER_PROPERTY));
      }
    }
  }

  if (!base || properties.length === 0) return { ...DEFAULT_THRESHOLD };

  return {
    enabled: true,
    entityId: base.entityId,
    attribute: base.attribute ?? '',
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

  // Order-sensitive remainder (@media overrides, nested rules, Jinja
  // statements) — byte-for-byte and LAST, exactly where it sat relative to
  // everything above (audit v0.10 #3).
  if (parsed.tailCss) parts.push(parsed.tailCss);

  return { rawCss: parts.join('\n\n') };
}

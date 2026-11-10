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
  DictSource,
} from '../types/index.js';
import { parseCss, parseCssDetailed, isBareDeclarations, keptCmsKeyframes } from './css-parser.js';
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
  GLYPH_SCALE,
  tileCirclePx,
  TILE_GLYPH_NATIVE_PX,
  conditionExpr,
  iconSizeValue,
  fontBlock,
  headerWeightViaToken,
  buttonStateFontSize,
} from '../generator/css-generator.js';
import { capsFor } from '../utils/card-caps.js';
import { isValidCssColor } from '../utils/css-color.js';
import {
  getCustomCardProfile,
  emitKeyOf,
  scaledFontClaims,
  type ClaimRule,
  type ClaimRole,
  type CustomCardProfile,
} from '../utils/custom-card-profiles.js';
import { JINJA_STR_BODY, JINJA_STR_BODY_1, hasForeignEscape, unescapeJinjaStr } from '../utils/jinja-str.js';
import { fromRgbTriplet, toRgbTriplet, TRIPLET_TOKEN_SRC } from '../utils/rgb-triplet.js';
import { ownedEntryKey, parseOwnedEntry, fontHasBaseSettings } from '../utils/owned-entries.js';

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
  fontFamily: '',
};

/** Size, weight and colour start unset: enabling Font writes nothing until a
 *  control is touched (the panel defaults were never the cards' own values). */
export const DEFAULT_FONT: FontModuleState = {
  enabled: false,
  fontFamily: '',
  numberSizeEnabled: false,
  numberSize: 0,
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

/** A decimal number written as text: sign, digits with an optional fraction,
 *  optional exponent. Not hex ("0x10"), units ("12px") or "Infinity", which
 *  Number() would take. */
const DECIMAL_TEXT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * Gives each entry's `value` the number the editor and generator expect: a
 * numeric string ("12.5") becomes the number. An entry whose value is not a
 * finite number after that (empty, "abc", missing) is dropped — it would
 * write `> abc` into the CSS template, or turn a fade's arithmetic into
 * string concatenation. Entries already in the current shape are returned as
 * the same objects.
 */
function coerceNumericValues<T extends { value: unknown }>(items: T[]): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const v = item.value;
    if (typeof v === 'number') {
      if (Number.isFinite(v)) out.push(item);
    } else if (typeof v === 'string' && DECIMAL_TEXT.test(v.trim()) && Number.isFinite(Number(v))) {
      out.push({ ...item, value: Number(v) });
    }
  }
  return out;
}

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
  // Very old presets stored a rule's / stop's value as text ("12.5").
  threshold.rules = coerceNumericValues(threshold.rules);
  if (Array.isArray(threshold.colorStops)) threshold.colorStops = coerceNumericValues(threshold.colorStops);
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
/** Accent companions written for one card type only (HA 2026.10). */
const ACCENT_AUX_ONLY_ON: Record<string, string> = {
  '--primary-color': 'calendar',
  '--graph-color-1': 'history-graph',
};

const ACCENT_AUX_VARS = [
  '--tile-color',
  '--primary-color',
  '--graph-color-1',
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
  cardType?: string,
): void {
  if (haCard) {
    // Only the variables accentAuxDecls writes for THIS card: a hand-written
    // --primary-color equal to the accent on any other card is the user's.
    const emitType = emitKeyOf(cardType);
    const vars = ACCENT_AUX_VARS.filter((v) => !(v in ACCENT_AUX_ONLY_ON) || ACCENT_AUX_ONLY_ON[v] === emitType);
    for (const aux of vars) {
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
const COND_TERNARY_PATTERN = new RegExp(
  String.raw`^\{\{\s*'(${JINJA_STR_BODY})'\s+if\s+(.+?)\s+else\s+'(${JINJA_STR_BODY})'\s*\}\}$`,
);

/** The value source of a numeric condition: `states('id')` or
 *  `state_attr('id', 'attr')`, both literals escape-aware (jinjaStr).
 *  Groups: [1]=states entity, [2]=attr entity, [3]=attribute. */
const VALUE_SOURCE_SRC = String.raw`(?:states\('(${JINJA_STR_BODY_1})'\)|state_attr\('(${JINJA_STR_BODY_1})',\s*'(${JINJA_STR_BODY_1})'\))`;

const COND_ON_OFF_PATTERN = /^is_state\(config\.entity,\s*'(on|off)'\)$/;
const COND_CUSTOM_PATTERN = new RegExp(String.raw`^is_state\('(${JINJA_STR_BODY_1})',\s*'on'\)$`);
const COND_VALUE_PATTERN = new RegExp(
  String.raw`^${VALUE_SOURCE_SRC}\s*\|\s*float\(0\)\s*(>=|<=|>|<|==|!=)\s*(-?[\d.]+)$`,
);

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
  if (custom) return { when: 'custom', customEntity: unescapeJinjaStr(custom[1]) };
  const value = trimmed.match(COND_VALUE_PATTERN);
  if (value) {
    const [, stateEntity, attrEntity, attrName, operator, numStr] = value;
    return {
      when: 'value',
      valueEntity: unescapeJinjaStr((stateEntity ?? attrEntity)!),
      ...(attrName ? { valueAttribute: unescapeJinjaStr(attrName) } : {}),
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
  if (!match || hasForeignEscape(value)) return null;
  const condition = parseConditionExpr(match[2]);
  if (!condition) return null;
  return { onValue: unescapeJinjaStr(match[1]), offValue: unescapeJinjaStr(match[3]), condition };
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
const ANIM_VALUE_TRIGGER_PATTERN = new RegExp(
  String.raw`^\{\{\s*'([^']+)'\s+if\s+${VALUE_SOURCE_SRC}\s*\|\s*float\(0\)\s*(>=|<=|>|<|==|!=)\s*(-?[\d.]+)\s+else\s+'none'\s*\}\}$`,
);

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
    if (match && !hasForeignEscape(animProp.value)) {
      const [, animValue, stateEntity, attrEntity, attrName, operator, numStr] = match;
      const parsed = parseAnimValue(animValue);
      if (parsed) {
        claimCompanions();
        return {
          enabled: true,
          ...parsed,
          trigger: 'value',
          valueEntity: unescapeJinjaStr((stateEntity ?? attrEntity)!),
          ...(attrName ? { valueAttribute: unescapeJinjaStr(attrName) } : {}),
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

/** `cardType` is the card's profile key (profileKeyOf(config)); equal to
 *  `config.type` for every built-in card. */
export function mapToStudioState(fullParsed: CardModStyleState, cardType?: string): StudioState {
  // Custom profiles only: a hand-written `!important` declaration that the
  // generator would write back WITHOUT `!important` is not ours to claim — the
  // module would regenerate it weaker. It stays in Advanced CSS (which is built
  // from `fullParsed`); every recogniser below sees the filtered view.
  const parsed = withoutUnclaimableImportant(fullParsed, cardType);
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
  const numberSize = claimNumberSize(parsed.dictSource, cardType);
  // A custom profile reads its own declarations back through its claims
  // (C2.2); everything else keeps the built-in recognisers.
  const profile = getCustomCardProfile(cardType ?? '');
  const pc = profile ? new ProfileClaims(parsed.targets, profile) : null;
  // On a custom profile a module its panel HIDES adopts nothing from the
  // built-in recognisers: the state would be invisible (and un-editable), so
  // those declarations stay in Advanced CSS. Built-in cards: unchanged.
  const mods = profile ? capsFor(cardType).modules : null;
  const hidden = (m: keyof NonNullable<typeof mods>): boolean => !!mods && !mods[m];
  const caps = profile ? capsFor(cardType) : null;

  // A profile that writes Icon Color on its own selector (Bubble `.bubble-icon`)
  // reads it back from there only: the built-in `ha-state-icon` / `ha-icon` /
  // `--state-icon-color` equivalents are not its output and are not adopted.
  const ownIcon = pc?.has('iconColor') ? pc : null;
  const iconTarget = ownIcon ? ownIcon.target('iconColor') : haStateIcon;

  const state: Omit<StudioState, 'advanced'> = {
    filter: hidden('filter') ? { ...DEFAULT_FILTER } : mapFilter(haCard, claimed),
    iconColor: hidden('iconColor')
      ? { ...DEFAULT_ICON_COLOR }
      : mapIconColor(
          iconTarget,
          ownIcon ? null : haIcon,
          ownIcon ? null : haCard,
          ownIcon ? null : hostTarget,
          haTileIcon,
          cardType,
          claimed,
          pc,
        ),
    accentColor: hidden('accentColor')
      ? { ...DEFAULT_ACCENT_COLOR }
      : pc?.has('accent')
        ? mapAccentProfile(pc, claimed)
        : mapAccentColor(haCard, haGauge, claimed, cardType),
    background: hidden('background')
      ? { ...DEFAULT_BACKGROUND }
      : mapBackground(haCard, claimed, pc?.has('background') ? pc : null, cardType !== 'markdown'),
    animation: hidden('animation') ? { ...DEFAULT_ANIMATION } : mapAnimation(haCard, claimed),
    border: hidden('border')
      ? { ...DEFAULT_BORDER }
      : pc?.has('borderDirect')
        ? mapBorder(pc.target('borderDirect'), claimed)
        : pc?.has('borderRadius') || pc?.has('borderWidth')
          ? mapBorderProfile(pc, claimed)
          : mapBorder(haCard, claimed),
    headingStyle: hidden('headingStyle')
      ? { ...DEFAULT_HEADING_STYLE }
      : mapHeadingStyle(titleP, headingIcon, container, headingFamily, claimed),
    font: {
      ...(hidden('font')
        ? { ...DEFAULT_FONT }
        : pc?.has('fontSize')
          ? mapFontProfile(pc, claimed)
          : mapFont(parsed.targets, haCard, claimed, cardType)),
      ...numberSize.font,
    },
    threshold: hidden('threshold')
      ? { ...DEFAULT_THRESHOLD }
      : mapThreshold(haCard, haStateIcon, haGauge, hostTarget, cardType, claimed, pc, caps),
    // Dict-form carrier (v0.10): threaded to the save path so the dict is
    // rebuilt byte-identically around the regenerated `.` entry.
    ...(numberSize.dictSource ? { dictSource: numberSize.dictSource } : {}),
  };
  // Companion declarations ride only with their recognised module.
  if (pc && state.background.enabled) pc.claimCompanions('background', claimed);
  if (pc && state.accentColor.enabled) pc.claimCompanions('accentColor', claimed);
  if (pc && state.border.enabled) pc.claimCompanions('border', claimed);
  return {
    ...state,
    // The generator writes the enabled preset's keyframes itself.
    advanced: mapAdvanced(fullParsed, claimed, state.animation.enabled ? `cms-${state.animation.preset}` : undefined),
  };
}

/**
 * Font → Number size (v0.11): flags the Studio's own gauge/thermostat entry
 * in the dict carrier and reads its size back; a hand-written entry under
 * the same key stays the user's (unflagged, listed in Advanced CSS) and
 * locks the control. Never mutates the parsed carrier.
 */
function claimNumberSize(
  dictSource: DictSource | undefined,
  cardType: string | undefined,
): { font: Partial<FontModuleState>; dictSource?: DictSource } {
  const key = ownedEntryKey(cardType);
  if (!dictSource || !key) return { font: {}, dictSource };
  const font: Partial<FontModuleState> = {};
  const entries = dictSource.entries.map((e) => {
    if (e.key !== key) return e;
    const px = parseOwnedEntry(cardType, e.key, e.value);
    if (px === null) {
      font.numberSizeLocked = true;
      return e;
    }
    font.numberSizeEnabled = true;
    font.numberSize = px;
    // Number size is only written while Font is on: the entry switches it on.
    font.enabled = true;
    return { ...e, owned: true as const };
  });
  if (!font.numberSizeEnabled) return { font, dictSource };
  return {
    font,
    dictSource: { ...dictSource, entries, studioCreated: entries.every((e) => e.owned) },
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
    // Number size lives in the primary's dict (a string secondary can't
    // carry it), whichever side's base font wins.
    // A Font switched on only by that entry (nothing else set) is not a
    // base font: the other side's real one still wins.
    font: {
      ...(primary.font.enabled && (!primary.font.numberSizeEnabled || fontHasBaseSettings(primary.font)) ? primary.font : secondary.font),
      enabled: primary.font.enabled || secondary.font.enabled,
      numberSizeEnabled: primary.font.numberSizeEnabled,
      numberSize: primary.font.numberSize,
      ...(primary.font.numberSizeLocked ? { numberSizeLocked: true } : {}),
    },
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
// `!important` on a custom profile (review fix T2b)
// ---------------------------------------------------------------------------

const normSelector = (sel: string): string => sel.trim().toLowerCase().replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ');

/** Does the profile's generator write `prop` of a claim rule with `!important`? */
function claimWritesImportant(profile: CustomCardProfile, rule: ClaimRule, prop: string): boolean {
  const e = profile.emitters;
  switch (rule.role) {
    case 'iconColor': return true; // Icon Color is always `color: … !important`
    case 'accent': return !!e?.accent?.important;
    // Only on the emitter's own selector: an older shape's rule (Bubble's
    // pill in 0.11.0-beta.2) never carried `!important`.
    case 'borderDirect':
      return !!e?.border?.important?.includes(prop) && normSelector(e.border.selector) === normSelector(rule.selector);
    case 'companion': {
      const list = [
        ...(e?.accent?.companions ?? []),
        ...(e?.background?.companions ?? []),
        ...(e?.border?.companions ?? []),
      ];
      return list.some((c) => c.prop.toLowerCase() === prop && !!c.important);
    }
    default: return false;
  }
}

/** A direct-border rule whose generator also resets the inner pieces
 *  (`companions`) is ours WITH `!important` only while those resets are there:
 *  a lone hand-written `.bubble-container { border-radius: 8px !important }`
 *  looks exactly like our radius and would otherwise be adopted. */
function borderCompanionsPresent(profile: CustomCardProfile, parsed: CardModStyleState): boolean {
  const cs = profile.emitters?.border?.companions ?? [];
  return cs.every((c) => {
    const t = findTargetNormalized(parsed.targets, c.selector ?? profile.emitters!.border!.selector);
    const p = t ? findProp(t, c.prop.toLowerCase()) : null;
    return !!p && !p.hasCondition && p.value.trim() === c.value;
  });
}

/** Plain properties the built-in recognisers read off `ha-card`: none of them
 *  is ever written with `!important`. */
const HA_CARD_PLAIN_PROPS = new Set([
  'background', 'background-color', 'background-image', 'border', 'border-radius', 'border-width',
  'border-color', 'filter', '-webkit-filter', 'animation', 'animation-name', 'transition',
  'font-size', 'font-weight', 'font-family', 'color',
]);

/**
 * For a CUSTOM profile: `parsed` without the `!important` declarations whose
 * regenerated form would lose the flag. Built-in cards (and unprofiled ones)
 * get `parsed` back untouched.
 */
function withoutUnclaimableImportant(parsed: CardModStyleState, cardType?: string): CardModStyleState {
  const profile = getCustomCardProfile(cardType ?? '');
  if (!profile || !parsed.targets.some((t) => t.properties.some((p) => p.important))) return parsed;
  const rules = profile.claims ?? [];
  const companionsOk = borderCompanionsPresent(profile, parsed);
  const targets = parsed.targets.map((t) => {
    const sel = normSelector(t.selector);
    const mine = rules.filter((r) => normSelector(r.selector) === sel);
    const properties = t.properties.filter((p) => {
      if (!p.important) return true;
      const hit = mine.filter((r) => r.props.includes(p.property));
      // A companion keeps its `!important` only with the value the generator
      // writes (`border-radius: 8px !important` on Bubble's pill is the user's).
      if (hit.length) {
        return hit.some(
          (r) =>
            claimWritesImportant(profile, r, p.property) &&
            (r.role !== 'borderDirect' || companionsOk) &&
            (r.role !== 'companion' || p.hasCondition || p.value.trim() === r.equals),
        );
      }
      return !(sel === 'ha-card' && HA_CARD_PLAIN_PROPS.has(p.property));
    });
    return properties.length === t.properties.length ? t : { ...t, properties };
  });
  return { ...parsed, targets };
}

// ---------------------------------------------------------------------------
// Custom-card profile claims (C2.2)
// ---------------------------------------------------------------------------

/**
 * A profile's claim rules applied to one parsed style. A rule names a selector
 * and the properties that carry one role (font size, accent, …); `present()`
 * returns those properties actually in the CSS, in the rule's order — the first
 * is the anchor. `!important` is irrelevant here: the parser strips it into a
 * flag, so a claimed declaration is recognised with or without it.
 */
class ProfileClaims {
  constructor(
    readonly targets: CssTarget[],
    readonly profile: CustomCardProfile,
  ) {}

  /** The role's rule whose selector is present AND carries one of its
   *  properties, else the first present selector, else its first rule. A
   *  profile lists a role's older selectors after the current one, so styles
   *  written by an earlier version still parse (and re-save in the current
   *  shape) — also next to a hand-written rule on the current selector, which
   *  must not shadow them. With claimable properties on both, the first
   *  (current) rule wins and the older selector's stay in Advanced CSS. */
  rule(role: ClaimRole): ClaimRule | undefined {
    const rules = (this.profile.claims ?? []).filter((c) => c.role === role);
    const present = rules.flatMap((r) => {
      const t = findTargetNormalized(this.targets, r.selector);
      return t ? [{ r, t }] : [];
    });
    return (present.find(({ r, t }) => r.props.some((p) => findProp(t, p))) ?? present[0])?.r ?? rules[0];
  }

  has(role: ClaimRole): boolean {
    return !!this.rule(role);
  }

  target(role: ClaimRole): CssTarget | null {
    const r = this.rule(role);
    return r ? findTargetNormalized(this.targets, r.selector) : null;
  }

  present(role: ClaimRole): Array<{ target: CssTarget; prop: CssProperty }> {
    const r = this.rule(role);
    const t = this.target(role);
    if (!r || !t) return [];
    return r.props.flatMap((name) => {
      const prop = findProp(t, name);
      return prop ? [{ target: t, prop }] : [];
    });
  }

  /** A recognised module's companion declarations (`opacity: 1 !important`):
   *  claimed only when they carry exactly the value the generator writes. */
  claimCompanions(module: ClaimRule['module'], claimed: Set<string>): void {
    for (const rule of this.profile.claims ?? []) {
      if (rule.role !== 'companion' || rule.module !== module) continue;
      // An older shape's companion (slider Background's pill opacity) is
      // claimed only when that older selector is the one adopted.
      const older = (this.profile.claims ?? []).find(
        (r) => r.role !== 'companion' && r.module === module && r.selector === rule.selector && !r.props.includes(rule.props[0]),
      );
      if (older && this.rule(older.role)?.selector !== older.selector) continue;
      const target = findTargetNormalized(this.targets, rule.selector);
      for (const name of rule.props) {
        const prop = target ? findProp(target, name) : null;
        if (!target || !prop) continue;
        // Plain, or riding on the module's own condition: the value on one
        // branch and nothing (the declaration dropped) on the other.
        const plain = !prop.hasCondition && prop.value.trim() === rule.equals;
        const branches = prop.hasCondition ? [prop.onValue?.trim(), prop.offValue?.trim()] : [];
        const conditional = branches.length === 2 && branches.includes(rule.equals) && branches.includes('');
        if (plain || conditional) claimed.add(claimKey(target.selector, prop.property));
      }
    }
  }

  /** Claims every present property of the role that carries `value` (the
   *  anchor included); a different value is the user's and stays out. */
  claimEqual(role: ClaimRole, value: string, claimed: Set<string>): void {
    for (const { target, prop } of this.present(role)) {
      if (prop.value.trim() === value.trim()) claimed.add(claimKey(target.selector, prop.property));
    }
  }
}

/** Font through a profile's claims. A plain px size variable anchors the
 *  module (like `font-size` on ha-card does for built-in cards). Without one,
 *  a role (weight / colour / family) is adopted only when EVERY variable of
 *  it is present, plain and equal — the module writes them all together, so
 *  a lone `--card-primary-font-weight` is the user's and stays in Advanced
 *  CSS instead of growing its secondary twin on the next save. */
function mapFontProfile(pc: ProfileClaims, claimed: Set<string>): FontModuleState {
  const plain = (role: ClaimRole) =>
    pc.present(role).find(({ prop }) => !prop.hasCondition && prop.value.trim())?.prop;
  const size = plain('fontSize');
  const sizeMatch = size?.value.trim().match(/^(\d+(?:\.\d+)?)px$/);
  if (size && !sizeMatch) return { ...DEFAULT_FONT };

  /** The role's value when the size-less rule above holds. */
  const wholeRole = (role: ClaimRole): string | null => {
    const want = pc.rule(role)?.props.length ?? 0;
    const have = pc.present(role);
    if (!want || have.length !== want || have.some(({ prop }) => prop.hasCondition || !prop.value.trim())) return null;
    const first = have[0].prop.value.trim();
    return have.every(({ prop }) => prop.value.trim() === first) ? first : null;
  };
  const pick = (role: ClaimRole): string | null => (sizeMatch ? (plain(role)?.value.trim() ?? null) : wholeRole(role));

  const state: FontModuleState = { ...DEFAULT_FONT, enabled: true };
  if (sizeMatch) {
    state.fontSize = parseFloat(sizeMatch[1]);
    pc.claimEqual('fontSize', size!.value, claimed);
    // The derived line-height / box height rides with the size: claimed only
    // when it is exactly what the generator writes for it (a hand-set value
    // stays in Advanced CSS and wins, being written after the module's).
    for (const { target, prop } of pc.present('fontScaled')) {
      const v = pc.profile.emitters?.font?.scaled?.find((x) => x.prop.toLowerCase() === prop.property.toLowerCase());
      if (v && !prop.hasCondition && scaledFontClaims(v, state.fontSize!).includes(prop.value.trim())) {
        claimed.add(claimKey(target.selector, prop.property));
      }
    }
  }

  const weight = pick('fontWeight');
  if (weight && FONT_WEIGHT_FROM_VALUE[weight]) {
    state.fontWeight = FONT_WEIGHT_FROM_VALUE[weight];
    pc.claimEqual('fontWeight', weight, claimed);
  }
  const color = pick('fontColor');
  if (color) {
    state.color = color;
    pc.claimEqual('fontColor', color, claimed);
  }
  const family = pick('fontFamily');
  if (family) {
    state.fontFamily = family;
    pc.claimEqual('fontFamily', family, claimed);
  }
  // Nothing recognised and no size: not ours.
  if (!sizeMatch && state.fontWeight === undefined && state.color === undefined && !state.fontFamily) {
    return { ...DEFAULT_FONT };
  }
  return state;
}

/** Accent through a profile's claims: the `R, G, B` variables, plain or as the
 *  on/off ternary. A threshold-shaped value (multi-branch) is left for
 *  mapThreshold, anything not exactly ours stays in Advanced CSS. */
function mapAccentProfile(pc: ProfileClaims, claimed: Set<string>): AccentColorModuleState {
  const anchor = pc.present('accent')[0]?.prop;
  if (!anchor) return { ...DEFAULT_ACCENT_COLOR };
  // `triplet: false` (Bubble): the variable carries the colour as written.
  const direct = pc.profile.emitters?.accent?.triplet === false;
  const asColor = (v: string): string | null => (direct ? v.trim() || null : fromRgbTriplet(v));
  if (anchor.hasCondition) {
    if (!anchor.onValue || !anchor.offValue) return { ...DEFAULT_ACCENT_COLOR };
    const on = asColor(anchor.onValue);
    const off = asColor(anchor.offValue);
    if (!on || !off) return { ...DEFAULT_ACCENT_COLOR };
    pc.claimEqual('accent', anchor.value, claimed);
    return {
      ...DEFAULT_ACCENT_COLOR,
      enabled: true,
      mode: 'conditional',
      colorOn: on,
      colorOff: off,
      ...(anchor.entityId ? { entityId: anchor.entityId } : {}),
    };
  }
  const color = asColor(anchor.value);
  if (!color) return { ...DEFAULT_ACCENT_COLOR };
  pc.claimEqual('accent', anchor.value, claimed);
  return { ...DEFAULT_ACCENT_COLOR, enabled: true, mode: 'plain', color };
}

/** Border through a profile's claims (radius / width / colour variables). The
 *  width is left alone while the colour variable is threshold-shaped: then the
 *  Threshold module wrote it (mapThreshold claims it with the colour). */
function mapBorderProfile(pc: ProfileClaims, claimed: Set<string>): BorderModuleState {
  const state: BorderModuleState = { ...DEFAULT_BORDER };
  const plain = (role: ClaimRole) => pc.present(role).find(({ prop }) => !prop.hasCondition && prop.value.trim())?.prop;

  const radius = plain('borderRadius');
  const radiusMatch = radius?.value.trim().match(/^(\d+(?:\.\d+)?)px$/);
  if (radius && radiusMatch) {
    state.enabled = true;
    state.radiusPx = parseFloat(radiusMatch[1]);
    pc.claimEqual('borderRadius', radius.value, claimed);
  }

  const colorFirst = pc.present('borderColor')[0]?.prop;
  // "Width otherwise" 0 writes a conditional COLOUR too (`… else 'inherit'`,
  // see borderVarDecls) — that is ours, not a threshold's.
  const ownColor = colorFirst?.hasCondition ? parseCondTernary(colorFirst.value.trim()) : null;
  const ownColorShape = ownColor && ownColor.offValue.trim() === 'inherit' ? ownColor : null;
  const thresholdShaped = !!colorFirst?.hasCondition && !colorFirst.onValue && !ownColorShape;
  const widthProp = thresholdShaped ? undefined : pc.present('borderWidth')[0]?.prop;
  if (widthProp) {
    const v = widthProp.value.trim();
    const PX = /^(\d+)px$/;
    const stat = !widthProp.hasCondition ? v.match(PX) : null;
    const ternary = widthProp.hasCondition ? parseCondTernary(v) : null;
    const on = ternary?.onValue.match(PX);
    const offTrim = ternary?.offValue.trim();
    const off = ternary?.offValue.match(PX);
    // The card's own width: `inherit`, or (older saves) a literal `0px`.
    const ownWidth = offTrim === 'inherit' || (!!off && parseInt(off[1], 10) === 0);
    // A conditional colour belongs to the "own border" shape only, and must
    // carry the same condition as the width.
    const colorOk = !ownColorShape || (ownWidth && JSON.stringify(ownColorShape.condition) === JSON.stringify(ternary?.condition));
    if (colorOk && (stat || (ternary && on && (off || offTrim === 'inherit')))) {
      state.enabled = true;
      state.borderWidth = parseInt((stat ?? on!)[1], 10);
      if (ternary && on) {
        state.widthWhen = ternary.condition;
        if (off && parseInt(off[1], 10) > 0) state.widthOffPx = parseInt(off[1], 10);
      }
      pc.claimEqual('borderWidth', widthProp.value, claimed);
      if (ownColorShape && colorFirst) {
        state.borderColor = ownColorShape.onValue.trim();
        pc.claimEqual('borderColor', colorFirst.value, claimed);
      } else {
        const color = plain('borderColor');
        if (color) {
          state.borderColor = color.value.trim();
          pc.claimEqual('borderColor', color.value, claimed);
        }
      }
    }
  }
  // A width/colour with no radius must not gain the module's default radius.
  if (state.enabled && !radius) state.radiusPx = 0;
  return state;
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
  return capsFor(cardType).modules.iconColor;
}

function mapIconColor(
  haStateIcon: CssTarget | null,
  haIcon: CssTarget | null,
  haCard: CssTarget | null,
  hostTarget: CssTarget | null,
  haTileIcon: CssTarget | null,
  cardType: string | undefined,
  claimed: Set<string>,
  pc: ProfileClaims | null = null,
): IconColorModuleState {
  // A profile with its own icon-size claims reads the size through them (the
  // size variables differ per card). A colourless profile (chips) has no
  // colour to recognise: the module is "on" exactly when its size is set.
  const sized = pc?.has('iconSize') ? pc : null;
  if (sized && pc!.profile.emitters?.iconSize?.colorless) {
    const bare = applyIconSizeProfile({ ...DEFAULT_ICON_COLOR }, sized, claimed);
    return bare.sizePx !== undefined && bare.sizePx > 0 ? { ...bare, enabled: true } : { ...DEFAULT_ICON_COLOR };
  }
  const applyIconSize_ = (st: IconColorModuleState) =>
    sized ? applyIconSizeProfile(st, sized, claimed) : applyIconSize(st, haCard, haTileIcon, cardType, claimed);
  const state = mapIconColorCore(haStateIcon, haIcon, haCard, hostTarget, cardType, claimed);

  if (!state.enabled) {
    // No colour recognised. A size alone is a real style (the slider used to
    // be reachable only together with a colour): adopt it as "keep the
    // card's colour". Safe because 'none' writes no colour, so a hand-written
    // one (left in Advanced CSS, or Threshold's multi-branch ternary) is never
    // overwritten. Also keeps the size when Threshold owns icon-color (W5/BUG-8).
    applyIconSize_(state);
    if (state.sizePx !== undefined && state.sizePx > 0) {
      state.enabled = true;
      state.mode = 'none';
    }
    return state;
  }

  return applyIconSize_(state);
}

/** `Npx`, or the quoted on/off ternary of `Npx` branches → the module's size
 *  fields (sizePx, and sizeOffPx / sizeWhen for the conditional form). */
function applySizeValue(state: IconColorModuleState, raw: string): boolean {
  const staticMatch = raw.trim().match(/^(\d+(?:\.\d+)?)px$/);
  if (staticMatch) {
    // 0 means "theme size": the module writes nothing for it, so claiming a
    // hand-written 0px would delete it on the next save. Leave it verbatim.
    if (!(parseFloat(staticMatch[1]) > 0)) return false;
    state.sizePx = parseFloat(staticMatch[1]);
    return true;
  }
  const ternary = parseCondTernary(raw.trim());
  const on = ternary?.onValue.match(/^(\d+(?:\.\d+)?)px$/);
  const off = ternary?.offValue.match(/^(\d+(?:\.\d+)?)px$/);
  if (!ternary || !on || !off) return false;
  if (!(parseFloat(on[1]) > 0)) return false; // same: a 0 size isn't written back
  state.sizePx = parseFloat(on[1]);
  const offPx = parseFloat(off[1]);
  if (offPx !== 24) state.sizeOffPx = offPx; // 24 = the generator's default else-branch
  state.sizeWhen = ternary.condition;
  return true;
}

/** Icon size through a profile's claims: the `box` variables carry the
 *  module's value; `glyph` variables are claimed only when they carry exactly
 *  the glyph share the generator would write for it. */
function applyIconSizeProfile(
  state: IconColorModuleState,
  pc: ProfileClaims,
  claimed: Set<string>,
): IconColorModuleState {
  const anchor = pc.present('iconSize')[0]?.prop;
  if (!anchor) return state;
  const probe = { ...state };
  if (!applySizeValue(probe, anchor.value)) return state;
  Object.assign(state, {
    sizePx: probe.sizePx,
    sizeOffPx: probe.sizeOffPx,
    sizeWhen: probe.sizeWhen,
  });
  if (state.sizeOffPx === undefined) delete state.sizeOffPx;
  if (state.sizeWhen === undefined) delete state.sizeWhen;
  pc.claimEqual('iconSize', anchor.value, claimed);
  const expected = iconSizeValue(state, GLYPH_SCALE);
  if (expected) {
    const norm = (v: string) => v.replace(/\s+/g, '');
    for (const { target, prop } of pc.present('iconGlyph')) {
      if (norm(prop.value) === norm(expected)) claimed.add(claimKey(target.selector, prop.property));
    }
  }
  return state;
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
  const applySize = (raw: string): boolean => applySizeValue(state, raw);

  if (emitKeyOf(cardType) === 'tile') {
    const tileMdc = haTileIcon ? findProp(haTileIcon, '--mdc-icon-size') : undefined;
    if (haTileIcon && tileMdc && applySize(tileMdc.value)) {
      claimed.add(claimKey(haTileIcon.selector, '--mdc-icon-size'));
      // The circle the generator derives from that glyph is ours too — but it
      // writes one only for a glyph above the native size (mirrors
      // tileIconSizeBlock); any other `--tile-icon-size` is hand-written and
      // stays in Advanced CSS.
      const circle = findProp(haTileIcon, '--tile-icon-size');
      const offPx =
        state.sizeWhen && state.sizeWhen.when !== 'always' && state.sizeOffPx && state.sizeOffPx > 0
          ? state.sizeOffPx
          : TILE_GLYPH_NATIVE_PX;
      const writesCircle =
        (state.sizePx ?? 0) > TILE_GLYPH_NATIVE_PX || (!!conditionExpr(state.sizeWhen) && offPx > TILE_GLYPH_NATIVE_PX);
      const expected = writesCircle ? iconSizeValue(state, tileCirclePx) : null;
      if (circle && expected && circle.value.replace(/\s+/g, '') === expected.replace(/\s+/g, '')) {
        claimed.add(claimKey(haTileIcon.selector, '--tile-icon-size'));
      }
    }
  } else if (cardType && capsFor(cardType).iconSize && haCard) {
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
    if (hasForeignEscape(colorProp.value)) return { ...DEFAULT_ICON_COLOR };
    claimed.add(claimKey(haStateIcon.selector, 'color'));
    const fallbackMatch = colorProp.value.match(new RegExp(String.raw`else\s+'(${JINJA_STR_BODY_1})'`));
    const colorOff = fallbackMatch ? unescapeJinjaStr(fallbackMatch[1]) : DEFAULT_ICON_COLOR.colorOff;
    const entityMatch = colorProp.value.match(new RegExp(String.raw`is_state\(\s*'(${JINJA_STR_BODY_1})'\s*,`));
    return {
      enabled: true,
      mode: 'light',
      color: colorOff,
      colorOn: colorOff,
      colorOff,
      ...(entityMatch ? { entityId: unescapeJinjaStr(entityMatch[1]) } : {}),
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
  cardType?: string,
): AccentColorModuleState {
  if (!haCard) return { ...DEFAULT_ACCENT_COLOR };

  const prop = findProp(haCard, '--accent-color');
  if (!prop) return { ...DEFAULT_ACCENT_COLOR };

  if (prop.hasCondition) {
    // Jinja2 on/off conditional — map to conditional mode (mirrors mapIconColor).
    if (prop.onValue && prop.offValue) {
      claimed.add(claimKey(haCard.selector, '--accent-color'));
      claimAccentAux(haCard, haGauge, prop.value.trim(), claimed, cardType);
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
  claimAccentAux(haCard, haGauge, value, claimed, cardType);
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

/** The "condition not met" branch of a Background / Border ternary on
 *  `property`: empty (a property) or `inherit` (a custom property), or `none`
 *  (written by earlier versions). See ownLookBranch in css-generator.ts. */
function isOwnLookBranch(v: string, property: string): boolean {
  const t = v.trim();
  return t === 'none' || t === (property.startsWith('--') ? 'inherit' : '');
}

function mapBackground(
  haCardTarget: CssTarget | null,
  claimed: Set<string>,
  /** A profile whose background rides on variables (chips): they replace
   *  `background` here — a plain `background` is not recognised then. */
  pc: ProfileClaims | null = null,
  /** False on a card whose `background` the generator may write with
   *  `!important` depending on card config the parser does not see (a text-only
   *  markdown card): an image is not adopted there. */
  imageAdoptable = true,
): BackgroundModuleState {
  const haCard = pc ? pc.target('background') : haCardTarget;
  if (!haCard) return { ...DEFAULT_BACKGROUND };

  let bgProp: CssProperty | null = pc ? (pc.present('background')[0]?.prop ?? null) : findProp(haCard, 'background');
  // Claims the declaration(s) that carried the value: `background`, or every
  // profile variable holding it.
  const claimBg = () => {
    if (pc && bgProp) pc.claimEqual('background', bgProp.value, claimed);
    else claimed.add(claimKey(haCard.selector, 'background'));
  };

  // Hand-written equivalent: `background-color: X` (the longhand). Adopted
  // as a solid background ONLY when it's a plain static value and no other
  // background-* longhand sits next to it — the module regenerates as the
  // `background` shorthand, which would reset a coexisting
  // background-image/position/size. Anything richer stays in Advanced CSS.
  if (!bgProp && pc) return { ...DEFAULT_BACKGROUND };
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

  // Conditional background: {{ 'color' if is_state(..., 'on'/'off') else '' }}
  // (a variable's other branch is `inherit`; older saves wrote `none` — all
  // three mean "no background of ours" and are read the same).
  if (bgProp.hasCondition && bgProp.onValue !== undefined && bgProp.offValue !== undefined) {
    const onVal = bgProp.onValue.trim();
    const offVal = bgProp.offValue.trim();
    let applyWhen: 'on' | 'off' | 'custom' | null = null;
    let colorVal = '';
    if (isOwnLookBranch(offVal, bgProp.property) && onVal && !isOwnLookBranch(onVal, bgProp.property)) {
      applyWhen = bgProp.entityId ? 'custom' : 'on';
      colorVal = onVal;
    } else if (isOwnLookBranch(onVal, bgProp.property) && offVal && !isOwnLookBranch(offVal, bgProp.property)) {
      // Background on the OFF side of a CUSTOM entity is NOT claimable:
      // 'custom' regenerates as "while the entity is ON" — claiming this
      // shape INVERTED the user's condition on save (audit W1). Falls to
      // Advanced CSS, preserved verbatim.
      if (bgProp.entityId) return { ...DEFAULT_BACKGROUND };
      applyWhen = 'off';
      colorVal = offVal;
    }
    if (applyWhen && colorVal) {
      claimBg();
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
    claimBg();
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
    claimBg();
    return { ...DEFAULT_BACKGROUND, enabled: true, type: 'solid', color1: value };
  }

  // An image (the solid field accepts any `background` value: url(...),
  // lists with a colour). The image form used to stay in Advanced CSS only
  // because `url(` is not a colour; it is adopted now when the module writes
  // exactly this declaration back: a value the field's validator accepts (one
  // image or colour per layer, no `;`, so `url(data:...;base64,...)` and
  // `url(x.png) center / cover` stay), no `!important`, and no
  // background-* longhand beside it that the shorthand would reset or that
  // the save would reorder.
  if (
    value &&
    value.includes('url(') &&
    !value.includes('{{') &&
    !pc &&
    imageAdoptable &&
    !bgProp.important &&
    isValidCssColor(value, 'background') &&
    !haCard.properties.some((p) => p.property.startsWith('background-'))
  ) {
    claimBg();
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
    // State-driven width: {{ 'Npx solid C' if COND else ''|'Mpx solid C' }}
    // — solid only, same color both branches (exactly what borderDecls
    // emits). An empty (or, from older saves, `none`) other branch = the
    // card's own border. Anything else stays unclaimed → Advanced CSS.
    const ternary = parseCondTernary(borderProp.value);
    if (ternary) {
      const BRANCH = /^(\d+)px\s+solid\s+(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\)|rgba?\([\d\s.,%]+\)|[a-zA-Z]+)$/i;
      const on = ternary.onValue.match(BRANCH);
      const offTrim = ternary.offValue.trim();
      const off = offTrim === '' || offTrim === 'none' ? 'none' : ternary.offValue.match(BRANCH);
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

/** Claim key -> whether the generator writes it with `!important`, for every
 *  declaration in a generated CSS block. */
function writtenKeys(css: string): Map<string, boolean> {
  return new Map(
    parseCss(css).flatMap((t) => t.properties.map((p): [string, boolean] => [claimKey(t.selector, p.property), !!p.important])),
  );
}

/** Whether the Font generator writes a companion with `!important` (used when
 *  no card type narrows it down): the selector-block ones do, except the
 *  entities `.card-header` weight; the ha-card variables never do. */
function companionImportant(selector: string, property: string): boolean {
  const sel = selector.trim().toLowerCase();
  return sel !== 'ha-card' && !(sel === '.card-header' && property === 'font-weight');
}

/**
 * Claims the per-card-type companions of the Font generator (see
 * fontCompanionDecls/fontCompanionBlocks in css-generator.ts) whose value
 * matches the recognised size/weight/color/family — same pattern as
 * claimAccentAux. `allowed` is the set of declarations the generator writes
 * back for THIS card type: anything else is hand-written and stays in
 * Advanced CSS (claiming it would delete it on the next save). `null` (the
 * caller has no card type) checks every known companion shape.
 */
function claimFontCompanions(
  targets: CssTarget[],
  haCard: CssTarget,
  sizePx: number | null,
  size: string | null,
  weight: string | null,
  color: string | null,
  family: string | null,
  claimed: Set<string>,
  cardType: string | undefined,
  headerWeight: boolean,
  allowed: Map<string, boolean> | null,
): void {
  const claimIf = (target: CssTarget | null, property: string, expected: string | null) => {
    if (!target || expected === null) return;
    const key = claimKey(target.selector, property);
    if (allowed && !allowed.has(key)) return;
    const prop = findProp(target, property);
    // The `!important` flag must match what the generator writes back: a
    // plain hand-written `font-size: 20px` would come back as `!important`
    // (stronger in the cascade), a flagged one would lose its flag.
    const writtenImportant = allowed ? allowed.get(key)! : companionImportant(target.selector, property);
    if (prop && prop.value.trim() === expected && !!prop.important === writtenImportant) claimed.add(key);
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
    ['--ha-card-header-font-size', sizePx != null ? headerFontSize(sizePx) : null],
    ['--ha-card-header-color', color],
    ['--ha-card-header-font-family', family],
  ] as Array<[string, string | null]>) {
    claimIf(haCard, name, expected);
  }

  // No untyped form: known only from the card type (`allowed` gates the rest).
  if (headerWeight) claimIf(haCard, '--ha-font-weight-normal', weight);
  if (cardType === 'button') {
    const state = findTarget(targets, '.state');
    claimIf(state, 'font-size', sizePx != null ? buttonStateFontSize(sizePx) : null);
    claimIf(state, 'color', color);
  }

  // Selector-block companions (light/sensor/entity/gauge/thermostat/entities)
  const name = findTarget(targets, '.name');
  claimIf(name, 'font-size', size);
  claimIf(name, 'font-weight', weight);
  claimIf(name, 'color', color);

  const value = findTarget(targets, '.value');
  claimIf(value, 'font-size', sizePx != null ? valueFontSize(sizePx) : null);

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

/** Declarations the Font generator gained in 0.11 for one card type (button
 *  `.state`, the title-weight token, markdown / alarm-panel header variables,
 *  statistic `.name/.value/.measurement`, humidifier's mode-label weight,
 *  picture-glance `.title` weight). A size-less style written by an older
 *  Studio lacks them, so they are optional when deciding to adopt it: the
 *  next save adds them. Every other companion stays required — a bare
 *  hand-written `ha-card { color: red }` on a tile must not be adopted. */
function isNewFontCompanion(emitKey: string | undefined, selector: string, property: string): boolean {
  const sel = selector.trim().toLowerCase();
  if (sel === 'ha-card') {
    if (property === '--ha-font-weight-normal') return true;
    if (property === '--ha-font-weight-medium') return emitKey === 'humidifier';
    return (emitKey === 'markdown' || emitKey === 'alarm-panel') && property.startsWith('--ha-card-header-');
  }
  if (emitKey === 'button') return sel === '.state';
  if (emitKey === 'statistic') return sel === '.name' || sel === '.value' || sel === '.measurement';
  return emitKey === 'picture-glance' && sel === '.title';
}

/** True when every declaration of `emitted` is already in `targets` with the
 *  same value, `!important` flag and order, with nothing hand-written beside
 *  them — i.e. adopting the module and saving again changes nothing (the
 *  size-less anchors' reproducibility guard). `optional` names declarations
 *  that may be absent (see isNewFontCompanion). */
function reemitsExactly(
  emitted: string,
  targets: CssTarget[],
  claimed: Set<string>,
  optional?: (selector: string, property: string) => boolean,
  legacy?: (selector: string, property: string, value: string) => boolean,
): boolean {
  const want = parseCss(emitted).flatMap((t) => {
    const present = findTarget(targets, t.selector);
    const properties = t.properties.filter(
      (p) => !(optional?.(t.selector, p.property) && !(present && findProp(present, p.property))),
    );
    return properties.length ? [{ ...t, properties }] : [];
  });
  if (!want.length) return false;
  return want.every((t) => {
    const have = findTarget(targets, t.selector);
    const start = have ? have.properties.findIndex((h) => h.property === t.properties[0].property) : -1;
    return (
      !!have &&
      t.properties.every((p) => {
        const h = findProp(have, p.property);
        return !!h && !h.hasCondition && h.value.trim() === p.value.trim() && !!h.important === !!p.important;
      }) &&
      // Same order, no foreign declaration between them: the next save must
      // not reorder or split the user's hand-written block.
      t.properties.every((p, i) => have.properties[start + i]?.property === p.property) &&
      // Nothing else in those rules may be hand-written: it would come back as
      // a second block. Declarations another module claimed are its to write.
      have.properties.every(
        (h) =>
          claimed.has(claimKey(have.selector, h.property)) ||
          t.properties.some((p) => p.property === h.property) ||
          // Older output's extra declarations (see mapFont): tolerated, then
          // claimed and dropped on the next save.
          (!h.hasCondition && !!legacy?.(have.selector, h.property, h.value.trim())),
      )
    );
  });
}

/**
 * Recognises a plain (non-conditional) font-size/font-weight/color/font-family
 * on ha-card — everything the Font module generates.
 *
 * A plain px font-size anchors "is this module enabled at all"; weight/color/
 * family are each recognised independently, so a hand-edited partial (someone
 * deleted just the color line) still round-trips size/weight rather than
 * falling through whole-cloth to Advanced CSS.
 *
 * Without any font-size (the module's own output when only weight/colour/
 * family were set) the style is adopted only if the module would write exactly
 * those declarations back: a bare `ha-card { color: red }` on a tile would
 * grow `--ha-tile-info-*` companions, so it stays the user's (Advanced CSS);
 * on a markdown card it re-emits identically and is adopted.
 */
function mapFont(
  targets: CssTarget[],
  haCard: CssTarget | null,
  claimed: Set<string>,
  cardType?: string,
): FontModuleState {
  if (!haCard) return { ...DEFAULT_FONT };

  const fontSizeProp = findProp(haCard, 'font-size');
  if (fontSizeProp?.hasCondition) return { ...DEFAULT_FONT };
  const sizeMatch = fontSizeProp?.value.trim().match(/^(\d+(?:\.\d+)?)px$/);
  // A font-size that isn't plain px is the user's; leave the rest with it.
  if (fontSizeProp && !sizeMatch) return { ...DEFAULT_FONT };

  const state: FontModuleState = { ...DEFAULT_FONT, enabled: true };
  if (sizeMatch) state.fontSize = parseFloat(sizeMatch[1]);

  let weightStr: string | null = null;
  const weightProp = findProp(haCard, 'font-weight');
  if (weightProp && !weightProp.hasCondition && FONT_WEIGHT_FROM_VALUE[weightProp.value.trim()]) {
    weightStr = weightProp.value.trim();
    state.fontWeight = FONT_WEIGHT_FROM_VALUE[weightStr];
  }

  let colorStr: string | null = null;
  const colorProp = findProp(haCard, 'color');
  if (colorProp && !colorProp.hasCondition && colorProp.value.trim()) {
    colorStr = colorProp.value.trim();
    state.color = colorStr;
  }

  let familyStr: string | null = null;
  const familyProp = findProp(haCard, 'font-family');
  if (familyProp && !familyProp.hasCondition && familyProp.value.trim()) {
    familyStr = familyProp.value.trim();
    state.fontFamily = familyStr;
  }

  // Only what the generator writes back for this card type may be claimed —
  // anything more would vanish on the next save. No card type (some callers
  // parse without one): every known companion shape.
  const emitKey = emitKeyOf(cardType) || undefined;
  const caps = capsFor(cardType);
  let allowed: Map<string, boolean> | null = null;
  if (!sizeMatch) {
    if (!weightStr && !colorStr && !familyStr) return { ...DEFAULT_FONT };
    const emitted = fontBlock(state, emitKey, caps);
    // v0.8.0-beta.2 .. v0.10.1 wrote the header colour / family variables on
    // picture-glance (its title is not a card header; dropped in 0.10.2).
    // Without a size there is no header-size variable to expect.
    const legacyHeader = (sel: string, prop: string, value: string) =>
      emitKey === 'picture-glance' &&
      sel.trim().toLowerCase() === 'ha-card' &&
      ((prop === '--ha-card-header-color' && !!colorStr && value === colorStr) ||
        (prop === '--ha-card-header-font-family' && !!familyStr && value === familyStr));
    if (!reemitsExactly(emitted, targets, claimed, (sel, prop) => isNewFontCompanion(emitKey, sel, prop), legacyHeader)) {
      return { ...DEFAULT_FONT };
    }
    allowed = writtenKeys(emitted);
    if (emitKey === 'picture-glance') {
      allowed.set(claimKey('ha-card', '--ha-card-header-color'), false);
      allowed.set(claimKey('ha-card', '--ha-card-header-font-family'), false);
    }
  } else if (cardType) {
    allowed = writtenKeys(fontBlock(state, emitKey, caps));
    // v0.10.1 wrote the header variables on picture-glance too; they stay
    // claimed (and are dropped on the next save): a deliberate clean-up.
    if (emitKey === 'picture-glance') {
      for (const p of ['--ha-card-header-font-size', '--ha-card-header-color', '--ha-card-header-font-family']) {
        allowed.set(claimKey('ha-card', p), false);
      }
    }
  }

  const headerWeight = headerWeightViaToken(emitKey, caps);
  const sizeStr = sizeMatch ? fontSizeProp!.value.trim() : null;
  if (sizeStr) claimed.add(claimKey(haCard.selector, 'font-size'));
  if (weightStr) claimed.add(claimKey(haCard.selector, 'font-weight'));
  if (colorStr) claimed.add(claimKey(haCard.selector, 'color'));
  if (familyStr) claimed.add(claimKey(haCard.selector, 'font-family'));

  claimFontCompanions(targets, haCard, state.fontSize ?? null, sizeStr, weightStr, colorStr, familyStr, claimed, emitKey, headerWeight, allowed);

  return state;
}

// ---------------------------------------------------------------------------
// Threshold module
// ---------------------------------------------------------------------------

export function parseThresholdJinja(value: string, format: 'css' | 'rgb-triplet' = 'css'): {
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
  // `rgb-triplet` (a profile's accent variables): colours are `R, G, B`
  // (or HA's `var(--rgb-…)`), converted back to the Studio's colour below.
  const COLOR_TOKEN =
    format === 'rgb-triplet'
      ? TRIPLET_TOKEN_SRC
      : String.raw`#[0-9a-fA-F]{3,8}|var\(--[\w-]+\)|rgba?\([\d\s.,%]+\)|[a-zA-Z]+`;
  const RULE_RE = new RegExp(
    String.raw`'(${COLOR_TOKEN})'\s+if\s+${VALUE_SOURCE_SRC}\s*\|\s*float\(0\)\s*(>=|<=|>|<|==|!=)\s*(-?[\d.]+(?:\.\d+)?)`,
    'g',
  );
  // Trailing anchor is `)` or `}` ONLY — the final else is always followed
  // by `}}` (or `)` inside a wrapping expression). With `\s` in the class
  // this used to match an INTERMEDIATE `else 'color' if …` of a multi-rule
  // chain, reading rule 2's color as the default.
  const DEFAULT_RE = new RegExp(String.raw`else\s+'(${COLOR_TOKEN})'\s*[)}]`);

  // The value must be exactly ONE {{ … }} expression — anything around it
  // (a `url()` after it, a second template) can't be regenerated.
  const trimmed = value.trim();
  if (!trimmed.startsWith('{{') || !trimmed.endsWith('}}') || trimmed.indexOf('{{', 2) !== -1) return null;
  if (hasForeignEscape(trimmed)) return null;

  const rules: ThresholdRule[] = [];
  let entityId = '';
  let attribute: string | undefined;
  let idx = 0;
  let match: RegExpExecArray | null;

  while ((match = RULE_RE.exec(trimmed)) !== null) {
    const [, rawColor, stateEntity, attrEntity, attrName, operator, numStr] = match;
    const color = format === 'rgb-triplet' ? fromRgbTriplet(rawColor) : rawColor;
    if (color === null) return null;
    const ruleEntity = unescapeJinjaStr((stateEntity ?? attrEntity)!);
    const ruleAttr = attrName === undefined ? undefined : unescapeJinjaStr(attrName);
    // Every rule must read the SAME source — rules on two entities used
    // to be silently rebound to the last one (audit v0.10 #2).
    if (idx > 0 && (ruleEntity !== entityId || ruleAttr !== attribute)) return null;
    entityId = ruleEntity;
    attribute = ruleAttr;
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
  const defaultColor = format === 'rgb-triplet' ? fromRgbTriplet(defaultMatch[1]) : defaultMatch[1];
  if (defaultColor === null) return null;

  // Claim only what the generator reproduces: same rule ORDER (the
  // generator sorts, which changes first-match semantics of a hand-written
  // chain) and the exact expression, modulo whitespace and redundant
  // parentheses. Extra logic (`and is_state(…)`, arithmetic) used to be
  // silently dropped on regenerate (audit v0.10 #2).
  if (sortThresholdRules(rules).some((r, i) => r !== rules[i])) return null;
  const mapColor = format === 'rgb-triplet' ? (c: string) => toRgbTriplet(c) ?? c : undefined;
  if (!sameThresholdExpression(trimmed, buildThresholdJinja(rules, defaultColor, entityId, attribute, mapColor))) return null;

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
  let animationRefs = detailed.tailCss;
  for (const t of targets) {
    const leftover = t === target ? properties.filter((p) => !consumed.has(p.property)) : t.properties;
    for (const p of leftover) if (ANIMATION_PROP_RE.test(p.property)) animationRefs += `\n${p.value}`;
    if (leftover.length > 0) {
      const decls = leftover
        .map((p) => `  ${p.property}: ${p.value}${p.important ? ' !important' : ''};`)
        .join('\n');
      extraParts.push(`${t.selector} {\n${decls}\n}`);
    }
  }
  // A row has no Animation module: every `@keyframes cms-*` a leftover
  // declaration still names stays (the parser leaves them out of passthroughCss).
  const keptKf = keptCmsKeyframes(css, animationRefs);
  if (keptKf) extraParts.unshift(keptKf);
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
    // `!= null`, not truthiness: a 0px size is a real value.
    ...((primary.fontSizePx ?? secondary.fontSizePx) != null
      ? { fontSizePx: primary.fontSizePx ?? secondary.fontSizePx }
      : {}),
    ...((primary.fontWeight ?? secondary.fontWeight) != null
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

/** `part` is `whole` with some rules left out (same source and default). */
function isRuleSubset(
  whole: { entityId: string; attribute?: string; rules: ThresholdRule[]; defaultColor: string },
  part: { entityId: string; attribute?: string; rules: ThresholdRule[]; defaultColor: string },
): boolean {
  if (whole.entityId !== part.entityId || (whole.attribute ?? '') !== (part.attribute ?? '')) return false;
  if (!sameColor(whole.defaultColor, part.defaultColor)) return false;
  let i = 0;
  for (const r of part.rules) {
    while (i < whole.rules.length && !(whole.rules[i].operator === r.operator && whole.rules[i].value === r.value && sameColor(whole.rules[i].color, r.color))) i++;
    if (i === whole.rules.length) return false;
    i++;
  }
  return true;
}

/** Same colour — spelled alike, or the same exact `R, G, B` (a profile's accent
 *  block stores colours as triplets and reads them back as lowercase hex). */
function sameColor(a: string, b: string): boolean {
  if (a === b || a.toLowerCase() === b.toLowerCase()) return true;
  const ta = toRgbTriplet(a);
  return ta !== null && ta === toRgbTriplet(b);
}

/** True when two parsed threshold blocks are the same rule set (ignoring rule `id`s, which are re-minted per parse). */
function sameThreshold(
  a: { entityId: string; attribute?: string; rules: ThresholdRule[]; defaultColor: string },
  b: { entityId: string; attribute?: string; rules: ThresholdRule[]; defaultColor: string },
): boolean {
  if (a.entityId !== b.entityId || !sameColor(a.defaultColor, b.defaultColor)) return false;
  if ((a.attribute ?? '') !== (b.attribute ?? '')) return false;
  if (a.rules.length !== b.rules.length) return false;
  return a.rules.every(
    (r, i) => r.operator === b.rules[i].operator && r.value === b.rules[i].value && sameColor(r.color, b.rules[i].color),
  );
}

function mapThreshold(
  haCard: CssTarget | null,
  haStateIcon: CssTarget | null,
  haGauge: CssTarget | null,
  hostTarget: CssTarget | null,
  cardType: string | undefined,
  claimed: Set<string>,
  pc: ProfileClaims | null = null,
  /** Custom profile: a property its panel doesn't offer is not adopted. */
  caps: { thresholdProperty(p: string): boolean } | null = null,
): ThresholdModuleState {
  type Candidate = {
    target: CssTarget;
    cssProperty: string;
    thresholdProperty: ThresholdProperty;
    /** A profile's variable: read through its claims (accent: `R, G, B`). */
    profileRole?: ClaimRole;
  };

  const candidates: Candidate[] = [];

  // A property a profile rides on its own variables is read ONLY there: the
  // built-in `ha-card` shape reaches nothing on those cards and is not adopted.
  const profileOwns = (role: ClaimRole) => !!pc?.has(role);
  const profileCandidate = (role: ClaimRole, thresholdProperty: ThresholdProperty): void => {
    // A border colour whose other branch is `inherit` is the Border module's
    // own "card's own border" shape (borderVarDecls) — a threshold always
    // ends on a colour.
    const ownBorderColor = (v: string) =>
      role === 'borderColor' && parseCondTernary(v.trim())?.offValue.trim() === 'inherit';
    const first = pc?.present(role).find(({ prop }) => prop.hasCondition && !prop.onValue && !ownBorderColor(prop.value));
    if (first) candidates.push({ target: first.target, cssProperty: first.prop.property, thresholdProperty, profileRole: role });
  };
  profileCandidate('background', 'background');
  profileCandidate('fontColor', 'text-color');
  profileCandidate('accent', 'accent-color');
  profileCandidate('borderColor', 'border-color');

  if (haCard) {
    const bgProp = findProp(haCard, 'background');
    if (!profileOwns('background') && bgProp?.hasCondition && !bgProp.onValue)
      candidates.push({ target: haCard, cssProperty: 'background', thresholdProperty: 'background' });

    const colorProp = findProp(haCard, 'color');
    if (!profileOwns('fontColor') && colorProp?.hasCondition && !colorProp.onValue)
      candidates.push({ target: haCard, cssProperty: 'color', thresholdProperty: 'text-color' });

    const accentProp = findProp(haCard, '--accent-color');
    if (!profileOwns('accent') && accentProp?.hasCondition && !accentProp.onValue)
      candidates.push({ target: haCard, cssProperty: '--accent-color', thresholdProperty: 'accent-color' });

    const borderColorProp = findProp(haCard, 'border-color');
    if (!profileOwns('borderColor') && borderColorProp?.hasCondition && !borderColorProp.onValue)
      candidates.push({ target: haCard, cssProperty: 'border-color', thresholdProperty: 'border-color' });

    // Also recognise "border: 2px solid {{ jinja }}" shorthand
    const borderShorthandProp = findProp(haCard, 'border');
    if (!profileOwns('borderColor') && borderShorthandProp?.hasCondition && !borderShorthandProp.onValue)
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

  // A profile's accent block may lack the rules whose colour has no exact
  // `R, G, B` form (thresholdAccentJinja): read it LAST, against the full
  // rule set the other properties carry, so those rules are not lost.
  candidates.sort((a, b) => Number(a.profileRole === 'accent') - Number(b.profileRole === 'accent'));

  if (caps) {
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (!caps.thresholdProperty(candidates[i].thresholdProperty)) candidates.splice(i, 1);
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

  for (const { target, cssProperty, thresholdProperty, profileRole } of candidates) {
    const prop = findProp(target, cssProperty)!;
    // The border shorthand is `Npx solid {{ … }}` (thresholdPropertyBlock);
    // any other prefix/style can't be regenerated, so it isn't claimed.
    const borderMatch = cssProperty === 'border'
      ? prop.value.trim().match(/^\d+px\s+solid\s+(\{\{[\s\S]*\}\})$/)
      : null;
    if (cssProperty === 'border' && !borderMatch) continue;
    const parsed = parseThresholdJinja(
      borderMatch ? borderMatch[1] : prop.value,
      profileRole === 'accent' ? 'rgb-triplet' : 'css',
    );
    if (!parsed) continue;
    if (base && !sameThreshold(base, parsed) && !(profileRole === 'accent' && isRuleSubset(base, parsed))) continue;

    base ??= parsed;
    if (profileRole) {
      // Every variable of the role carrying the same expression is the
      // generator's twin of this one (classic Mushroom writes several).
      pc!.claimEqual(profileRole, prop.value, claimed);
      if (profileRole === 'borderColor') {
        // the width the generator writes beside the colour variable
        const w = pc!.present('borderWidth')[0]?.prop;
        const wm = w && !w.hasCondition ? w.value.trim().match(/^(\d+)px$/) : null;
        if (w && wm) {
          borderWidth = parseInt(wm[1], 10);
          pc!.claimEqual('borderWidth', w.value, claimed);
        }
      }
    } else {
      claimed.add(claimKey(target.selector, cssProperty));
    }
    if (!properties.includes(thresholdProperty)) properties.push(thresholdProperty);

    // accent-color emits card-type companion variables carrying the same
    // Jinja expression (accentAuxDecls/gaugeColorBlock) — claim them with it.
    if (thresholdProperty === 'accent-color' && !profileRole) {
      claimAccentAux(haCard, haGauge, prop.value.trim(), claimed, cardType);
    }
    // text-color also writes the tile's text / the card title's colour
    // variables (thresholdPropertyBlock).
    if (thresholdProperty === 'text-color' && !profileRole) {
      for (const v of ['--ha-tile-info-primary-color', '--ha-tile-info-secondary-color', '--ha-card-header-color']) {
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

const ANIMATION_PROP_RE = /^(?:-\w+-)?animation(?:-name)?$/i;

function mapAdvanced(
  parsed: CardModStyleState,
  claimed: Set<string>,
  regeneratedKeyframes?: string,
): AdvancedModuleState {
  const parts: string[] = [];
  // Text a kept `@keyframes cms-*` may still be referenced from: the
  // unclaimed animation declarations and the verbatim tail.
  let animationRefs = parsed.tailCss ?? '';

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
      for (const p of unclaimed) if (ANIMATION_PROP_RE.test(p.property)) animationRefs += `\n${p.value}`;
    }
  }

  // The parser leaves `@keyframes cms-*` out of passthroughCss because the
  // Animation module regenerates them — true only when the module adopted
  // the declaration. One a hand-written `animation` still names comes back
  // with it, in front of the blocks that use it (as the generator writes it).
  const kept = keptCmsKeyframes(parsed.rawCss ?? '', animationRefs, regeneratedKeyframes);
  if (kept) parts.unshift(kept);

  // Order-sensitive remainder (@media overrides, nested rules, Jinja
  // statements) — byte-for-byte and LAST, exactly where it sat relative to
  // everything above (audit v0.10 #3).
  if (parsed.tailCss) parts.push(parsed.tailCss);

  return { rawCss: parts.join('\n\n') };
}

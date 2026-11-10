/**
 * css-generator.ts
 *
 * Converts a StudioState into a CSS string suitable for card_mod.style.
 */

import type {
  StudioState,
  FilterModuleState,
  IconColorModuleState,
  AccentColorModuleState,
  BackgroundModuleState,
  AnimationModuleState,
  BorderModuleState,
  HeadingStyleModuleState,
  FontModuleState,
  ThresholdModuleState,
  ThresholdRule,
  ThresholdProperty,
  ColorStop,
  StyleCondition,
} from '../types/index.js';
import { capsFor, hasOwnEntity, type CardCaps } from '../utils/card-caps.js';
import {
  getCustomCardProfile,
  emitKeyOf,
  type AccentEmitter,
  type BorderEmitter,
  type FontEmitter,
  type IconSizeEmitter,
  type ProfileEmitters,
  type Companion,
} from '../utils/custom-card-profiles.js';
import { toRgbTriplet } from '../utils/rgb-triplet.js';

/**
 * Renders the entity reference used inside an `is_state(...)`/`state_attr(...)`
 * Jinja2 call: the card's own entity (`config.entity`, unquoted — a template
 * variable card-mod provides) when no override is set, or a quoted entity_id
 * literal when a module is bound to a different entity. Shared by every
 * module below so a "controlled by [entity]" binding round-trips the same
 * way everywhere (see ENTITY_STATE_PATTERN in css-parser.ts).
 */
function entityRef(entityId?: string): string {
  return entityId ? `'${entityId}'` : 'config.entity';
}

// ---------------------------------------------------------------------------
// Animation @keyframes presets
// ---------------------------------------------------------------------------

const KEYFRAMES: Record<string, string> = {
  pulse: `@keyframes cms-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}`,
  breathe: `@keyframes cms-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}`,
  'gradient-shift': `@keyframes cms-gradient-shift {
  0% { background-position: 0% center; }
  50% { background-position: 100% center; }
  100% { background-position: 0% center; }
}`,
  blink: `@keyframes cms-blink {
  0%, 49%, 100% { opacity: 1; }
  50%, 99% { opacity: 0.3; }
}`,
  bounce: `@keyframes cms-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}`,
  shake: `@keyframes cms-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}`,
  spin: `@keyframes cms-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}`,
  glow: `@keyframes cms-glow {
  0%, 100% { box-shadow: 0 0 2px 0 currentColor; }
  50% { box-shadow: 0 0 12px 2px currentColor; }
}`,
  heartbeat: `@keyframes cms-heartbeat {
  0%, 28%, 70%, 100% { transform: scale(1); }
  14%, 42% { transform: scale(1.12); }
}`,
};

/**
 * Per-preset animation-timing-function: spin needs a constant angular
 * velocity (ease-in-out visibly stalls at every rotation boundary);
 * everything else keeps the original ease-in-out. Exported for the parser
 * (mapAnimation only claims an `animation:` whose timing matches its
 * preset exactly, so anything else falls through to Advanced CSS).
 */
export const ANIMATION_TIMING: Record<AnimationModuleState['preset'], string> = {
  pulse: 'ease-in-out',
  breathe: 'ease-in-out',
  'gradient-shift': 'ease-in-out',
  blink: 'ease-in-out',
  bounce: 'ease-in-out',
  shake: 'ease-in-out',
  spin: 'linear',
  glow: 'ease-in-out',
  heartbeat: 'ease-in-out',
};

// ---------------------------------------------------------------------------
// Per-module declaration builders
// ---------------------------------------------------------------------------

/**
 * The Jinja condition expression for a StyleCondition (v0.9 state-driven
 * numeric controls: border width, filter effects, icon size). Spellings
 * deliberately mirror animationDecls' trigger forms so the parser's
 * condition recognizer (parseConditionExpr in state-mapper.ts) covers both
 * features identically. Returns null for 'always' or an incomplete
 * condition — callers emit the unconditional form then.
 */
export function conditionExpr(c: StyleCondition | undefined): string | null {
  if (!c || c.when === 'always') return null;
  if (c.when === 'on') return `is_state(config.entity, 'on')`;
  if (c.when === 'off') return `is_state(config.entity, 'off')`;
  if (c.when === 'custom') {
    return c.customEntity ? `is_state('${c.customEntity}', 'on')` : null;
  }
  // when === 'value'
  if (!c.valueEntity || !c.valueOperator || c.valueThreshold === undefined) return null;
  const src = c.valueAttribute
    ? `state_attr('${c.valueEntity}', '${c.valueAttribute}') | float(0)`
    : `states('${c.valueEntity}') | float(0)`;
  return `${src} ${c.valueOperator} ${c.valueThreshold}`;
}

function filterDecls(s: FilterModuleState, caps: CardCaps, rawCss = ''): string[] {
  if (!s.enabled) return [];

  const decls: string[] = [];

  if (s.grayscale) {
    const grayParts = ['grayscale(100%)'];
    const otherParts: string[] = [];
    if (s.brightness !== 100) {
      grayParts.push(`brightness(${s.brightness}%)`);
      otherParts.push(`brightness(${s.brightness}%)`);
    }
    if (s.blur > 0) {
      grayParts.push(`blur(${s.blur}px)`);
      otherParts.push(`blur(${s.blur}px)`);
    }
    if (s.opacity !== undefined && s.opacity < 100) {
      grayParts.push(`opacity(${s.opacity}%)`);
      otherParts.push(`opacity(${s.opacity}%)`);
    }
    const grayVal = grayParts.join(' ');
    const otherVal = otherParts.length > 0 ? otherParts.join(' ') : 'none';

    if (s.grayscaleWhen === 'always') {
      decls.push(`filter: ${grayVal};`);
    } else if (s.grayscaleWhen === 'off') {
      decls.push(
        `filter: {{ '${grayVal}' if is_state(config.entity, 'off') else '${otherVal}' }};`,
      );
    } else if (s.grayscaleWhen === 'custom') {
      // Custom with no entity picked yet emits the UNCONDITIONAL form —
      // falling into the 'on' branch here silently changed the condition
      // (audit W8/BUG-3); matches conditionExpr's incomplete-guard.
      decls.push(
        s.customEntity
          ? `filter: {{ '${grayVal}' if is_state(${entityRef(s.customEntity)}, 'on') else '${otherVal}' }};`
          : `filter: ${grayVal};`,
      );
    } else {
      decls.push(
        `filter: {{ '${grayVal}' if is_state(config.entity, 'on') else '${otherVal}' }};`,
      );
    }
  } else {
    const parts: string[] = [];
    if (s.brightness !== 100) parts.push(`brightness(${s.brightness}%)`);
    if (s.blur > 0) parts.push(`blur(${s.blur}px)`);
    if (s.opacity !== undefined && s.opacity < 100) parts.push(`opacity(${s.opacity}%)`);
    if (parts.length > 0) {
      // v0.9: the effects can react to a state condition (grayscale-off
      // path only — grayscale's own grayscaleWhen governs the combined
      // filter above, and two independent conditions in one filter value
      // aren't representable).
      const cond = conditionExpr(s.effectsWhen);
      decls.push(
        cond
          ? `filter: {{ '${parts.join(' ')}' if ${cond} else 'none' }};`
          : `filter: ${parts.join(' ')};`,
      );
    }
  }

  if (decls.length > 0) {
    // These cards' own stylesheets set `ha-card { transition: … }` and,
    // being adopted after card-mod's/UIX's injected <style>, win a plain
    // declaration — filter changes snapped instead of fading. Measured on
    // both engines: tile only on HA 2026.9; tile, sensor, entity and area on
    // HA 2026.10.4 (harmless where not needed). Same mechanism as the
    // button card's font size. Not when Advanced CSS sets a transition
    // itself: hand-written CSS must keep winning, as it does everywhere else.
    const important = caps.transitionImportant && !/(^|[\s;{])transition\s*:/.test(rawCss);
    decls.push(`transition: filter ${s.transitionMs}ms ease${important ? ' !important' : ''};`);
  }

  return decls;
}

/**
 * What a style means on a card WITHOUT an entity of its own: every "own
 * entity is ON / OFF" condition falls back to unconditional ("always").
 * `config.entity` would be undefined there, `is_state()` on it fails
 * to render, and the style engine then drops the card's WHOLE style — so
 * generateCss() applies this as its last line of defence, and the panel and
 * the loader apply it too so what the controls show is what gets saved.
 * Conditions on another entity or on a value are untouched; a card that has
 * an entity gets its state back unchanged (same object).
 */
export function settleEntityless(state: StudioState, config?: Record<string, unknown> | null): StudioState {
  if (config == null || hasOwnEntity(config)) return state;
  const own = (w?: string) => w === 'on' || w === 'off';
  const cond = (c?: StyleCondition) => (c && own(c.when) ? undefined : c);
  const { filter: f, background: b, border: bo, animation: a, iconColor: ic } = state;
  return {
    ...state,
    filter: {
      ...f,
      grayscaleWhen: own(f.grayscaleWhen) ? 'always' : f.grayscaleWhen,
      effectsWhen: cond(f.effectsWhen),
    },
    background: { ...b, applyWhen: own(b.applyWhen) ? 'always' : b.applyWhen },
    border: { ...bo, widthWhen: cond(bo.widthWhen) },
    animation: { ...a, trigger: own(a.trigger) ? 'always' : a.trigger },
    iconColor: { ...ic, sizeWhen: cond(ic.sizeWhen) },
  };
}

/**
 * Icon Color / Accent in their on/off (or light) mode with no entity picked
 * fall back to the card's own entity — which an entity-less card doesn't
 * have, so there is nothing to watch yet: write NO colour (the OFF grey used
 * to be written as a fixed colour nobody chose). The icon size is a separate
 * setting and is still written. Not part of settleEntityless: the panel keeps
 * the mode, so the user can still pick the entity to watch.
 */
function withoutUnwatchedEntity(state: StudioState, config?: Record<string, unknown> | null): StudioState {
  if (config == null || hasOwnEntity(config)) return state;
  const { iconColor: ic, accentColor: ac } = state;
  return {
    ...state,
    iconColor: (ic.mode === 'conditional' || ic.mode === 'light') && !ic.entityId ? { ...ic, mode: 'none' } : ic,
    accentColor: ac.mode === 'conditional' && !ac.entityId ? { ...ac, enabled: false } : ac,
  };
}

/** The single accent value (static color or on/off Jinja ternary) every
 *  accent-color declaration shares — extracted so the ha-card declarations
 *  and the gauge's separate ha-gauge block can't drift apart. */
function accentValue(s: AccentColorModuleState): string {
  return s.mode === 'conditional'
    ? `{{ '${s.colorOn}' if is_state(${entityRef(s.entityId)}, 'on') else '${s.colorOff}' }}`
    : s.color;
}

/**
 * The card-type-specific companion variables that make an accent value
 * actually visible on each card — --accent-color alone does nothing on a
 * tile/thermostat/button. Shared by the Accent Color module and the
 * Threshold module's accent-color property so both stay in sync, and
 * mirrored by ACCENT_AUX_VARS in state-mapper.ts so every variable emitted
 * here is re-claimed on parse instead of leaking into Advanced CSS.
 */
function accentAuxDecls(value: string, cardType?: string): string[] {
  // Tile card: icon background/state color is driven by --tile-color.
  // hui-tile-card writes its state-computed color as an *inline style* on
  // ha-card itself (styleMap in its render), so — same as the gauge — a
  // plain declaration silently loses whenever the tile computes a color.
  // !important is required for the value to actually win, and it also
  // cascades into tile features: hui-card-features derives
  // `--feature-color: var(--tile-color)`, so the bar-gauge/toggle feature
  // rows follow the accent color too (live user report: bar gauge never
  // changed color).
  if (cardType === 'tile') {
    return [`--tile-color: ${value} !important;`, `--state-icon-color: ${value};`];
  }

  // Thermostat cards use climate state color variables
  if (cardType === 'thermostat') {
    return [
      `--state-climate-heat-color: ${value};`,
      `--state-climate-cool-color: ${value};`,
      `--state-climate-auto-color: ${value};`,
      `--state-climate-idle-color: ${value};`,
      `--control-circular-slider-color: ${value};`,
    ];
  }

  // Gauge gets a separate ha-gauge block (see gaugeAccentBlock) — nothing
  // extra in the ha-card block itself. Heading has no accent consumers.
  if (cardType === 'gauge' || cardType === 'heading') return [];

  // HA 2026.10 stopped reading --accent-color/--state-icon-color here:
  // the calendar colours with --primary-color, the history graph draws its
  // first line in --graph-color-1 (measured on HA 2026.10.4, both engines).
  // The old variable stays for older HA.
  if (cardType === 'calendar') return [`--state-icon-color: ${value};`, `--primary-color: ${value};`];
  if (cardType === 'history-graph') return [`--state-icon-color: ${value};`, `--graph-color-1: ${value};`];

  // Button card (HA built-in) and generic entity-state cards. The legacy
  // --paper-item-icon-active-color companion is no longer emitted (roadmap
  // #6) — nothing in current HA reads it; the parser still claims it on
  // old configs (ACCENT_AUX_VARS), so a legacy save upgrades cleanly.
  return [`--state-icon-color: ${value};`];
}

function accentColorDecls(s: AccentColorModuleState, cardType?: string): string[] {
  if (!s.enabled) return [];
  const value = accentValue(s);
  return [`--accent-color: ${value};`, ...accentAuxDecls(value, cardType)];
}

/** The accent value in Mushroom's `R, G, B` form (static, or the on/off
 *  ternary with both branches converted). null when a colour has no exact
 *  `R, G, B` form (see rgb-triplet.ts) — then nothing is written. */
function accentTripletValue(s: AccentColorModuleState): string | null {
  if (s.mode !== 'conditional') return toRgbTriplet(s.color);
  const on = toRgbTriplet(s.colorOn);
  const off = toRgbTriplet(s.colorOff);
  return on && off ? `{{ '${on}' if is_state(${entityRef(s.entityId)}, 'on') else '${off}' }}` : null;
}

/** A profile's companion declarations (`opacity: 1 !important`), written only
 *  next to declarations their module actually wrote. */
function companionDecls(decls: string[], companions: Companion[] | undefined): string[] {
  if (!decls.length || !companions?.length) return decls;
  return [...decls, ...companions.map((c) => `${c.prop}: ${c.value}${c.important ? ' !important' : ''};`)];
}

/** Accent through a profile emitter: each variable gets the `R, G, B` value —
 *  or, with `triplet: false`, the colour as written (optionally `!important`). */
function accentVarDecls(s: AccentColorModuleState, e: AccentEmitter): string[] {
  if (!s.enabled) return [];
  const value = e.triplet === false ? accentValue(s) : accentTripletValue(s);
  const imp = e.important ? ' !important' : '';
  return value ? companionDecls(e.vars.map((v) => `${v}: ${value}${imp};`), e.companions) : [];
}

/** Border through a profile emitter (radius / width / colour as variables). A
 *  state-driven width becomes a quoted-branch ternary on the width variable. */
function borderVarDecls(s: BorderModuleState, e: BorderEmitter, skipColor = false): string[] {
  if (!s.enabled) return [];
  const decls: string[] = [];
  if (s.radiusPx > 0) for (const v of e.radius ?? []) decls.push(`${v}: ${s.radiusPx}px;`);
  if (!skipColor && s.borderWidth > 0) {
    const cond = conditionExpr(s.widthWhen);
    const width = cond
      ? `{{ '${s.borderWidth}px' if ${cond} else '${s.widthOffPx && s.widthOffPx > 0 ? s.widthOffPx : 0}px' }}`
      : `${s.borderWidth}px`;
    for (const v of e.width ?? []) decls.push(`${v}: ${width};`);
    for (const v of e.color ?? []) decls.push(`${v}: ${s.borderColor};`);
  }
  return decls;
}

/**
 * Options threaded from the card's full config into generation — cardType
 * alone doesn't carry everything that changes what CSS is meaningful.
 */
export interface GenerateCssOptions {
  /** The card's own config: a profile's `configGates` (Mushroom's Accent while
   *  the card sets `icon_color`) switch emission off here too. */
  config?: Record<string, unknown> | null;
  /** The gauge card's `needle: true` — switches which ha-gauge variable the
   *  accent value drives (see gaugeColorBlock). */
  gaugeNeedle?: boolean;
}

/**
 * Whether a value reads the custom property it would be assigned to.
 * `--x: var(--x)` is a dependency cycle: invalid at computed-value time, so
 * everything reading --x falls back to its initial value — the gauge's value
 * text turned black on dark themes with the theme-default text colour.
 * Leaving the declaration out keeps the inherited theme value, which is what
 * the value meant anyway.
 */
function refersTo(value: string, name: string): boolean {
  return new RegExp(`var\\(\\s*${name}\\s*[,)]`).test(value);
}

/**
 * Gauge cards ignore an inherited --gauge-color: hui-gauge-card writes the
 * severity-computed color as an *inline style* on <ha-gauge> on every render
 * (styleMap in hui-gauge-card.ts), and inline wins over anything inherited
 * from ha-card. An author-stylesheet `!important` on the element itself is
 * the one thing that beats a non-important inline style, so the gauge needs
 * its own block targeting ha-gauge directly — verified live against a real
 * gauge card (tools/sandbox/harness/gauge_color_check.mjs).
 *
 * In needle mode the value arc doesn't exist and --gauge-color is unused —
 * the needle itself is the value indicator, and its fill is
 * `var(--primary-text-color)` (ha-gauge's own shadow styles), which
 * inherits from the ha-gauge host. Setting that instead recolors the
 * needle (and, sharing the same variable, the value text under it — they
 * match, which reads as intentional). Both variables are emitted so the
 * style keeps working if `needle:` is toggled later without re-editing.
 */
function gaugeColorBlock(
  value: string,
  cardType: string | undefined,
  marker: string | null,
  opts?: GenerateCssOptions,
): string {
  if (cardType !== 'gauge') return '';
  const markerLine = marker ? `  ${GRADIENT_MARKER_PROPERTY}: ${marker};\n` : '';
  const needleLine = opts?.gaugeNeedle && !refersTo(value, '--primary-text-color')
    ? `  --primary-text-color: ${value} !important;\n`
    : '';
  return `ha-gauge {\n${markerLine}  --gauge-color: ${value} !important;\n${needleLine}}`;
}

/** `names`: the property (or, for a profile's background emitter, the
 *  variables) that carry the value — `background` by default. */
function backgroundDecls(s: BackgroundModuleState, names: string[] = ['background']): string[] {
  if (!s.enabled) return [];
  return backgroundValueDecls(s).flatMap((d) => names.map((n) => d.replace(/^background:/, `${n}:`)));
}

function backgroundValueDecls(s: BackgroundModuleState): string[] {

  const bgValue =
    s.type === 'gradient'
      ? `linear-gradient(${s.angle}deg, ${s.color1}, ${s.color2})`
      : s.color1;

  if (s.applyWhen === 'always') return [`background: ${bgValue};`];
  if (s.applyWhen === 'custom') {
    // No entity picked yet → unconditional. The old fallthrough mapped an
    // incomplete 'custom' to the 'off' branch — the background instantly
    // INVERTED and the intent was rewritten to applyWhen:'off' on reopen
    // (audit W8/BUG-2).
    return s.customEntity
      ? [`background: {{ '${bgValue}' if is_state(${entityRef(s.customEntity)}, 'on') else 'none' }};`]
      : [`background: ${bgValue};`];
  }
  const when = s.applyWhen === 'on' ? 'on' : 'off';
  return [
    `background: {{ '${bgValue}' if is_state(config.entity, '${when}') else 'none' }};`,
  ];
}

/**
 * @param skipColor  Omit the `border: Npx solid COLOR` declaration — used
 *   when the Threshold module already owns border-color for this card, so
 *   the two modules don't emit conflicting `border` declarations in the
 *   same `ha-card` block (border-radius still applies either way).
 */
function borderDecls(s: BorderModuleState, skipColor = false): string[] {
  if (!s.enabled) return [];
  const decls: string[] = [];
  if (s.radiusPx > 0) decls.push(`border-radius: ${s.radiusPx}px;`);
  if (!skipColor && s.borderWidth > 0) {
    const cond = conditionExpr(s.widthWhen);
    if (cond) {
      // v0.9: width reacts to a state condition. Same color both branches —
      // this control drives WIDTH; a state-driven color is Threshold's job.
      const onVal = `${s.borderWidth}px solid ${s.borderColor}`;
      const offVal =
        s.widthOffPx && s.widthOffPx > 0 ? `${s.widthOffPx}px solid ${s.borderColor}` : 'none';
      decls.push(`border: {{ '${onVal}' if ${cond} else '${offVal}' }};`);
    } else {
      decls.push(`border: ${s.borderWidth}px solid ${s.borderColor};`);
    }
  }
  return decls;
}

function animationKeyframes(s: AnimationModuleState): string {
  if (!s.enabled) return '';
  return KEYFRAMES[s.preset] ?? '';
}

function animationDecls(s: AnimationModuleState): string[] {
  if (!s.enabled) return [];

  const animValue = `cms-${s.preset} ${s.speedS}s ${ANIMATION_TIMING[s.preset]} infinite`;
  const decls: string[] = [];

  if (s.preset === 'gradient-shift') decls.push('background-size: 200% auto;');

  if (s.trigger === 'always') {
    decls.push(`animation: ${animValue};`);
  } else if (s.trigger === 'on') {
    decls.push(
      `animation: {{ '${animValue}' if is_state(config.entity, 'on') else 'none' }};`,
    );
  } else if (s.trigger === 'off') {
    decls.push(
      `animation: {{ '${animValue}' if is_state(config.entity, 'off') else 'none' }};`,
    );
  } else if (s.trigger === 'custom') {
    // Incomplete (no entity picked yet) → the UNCONDITIONAL form. The old
    // code emitted NOTHING here, leaving an orphan @keyframes block that
    // reset the whole module to disabled on reopen (audit W8/BUG-4).
    decls.push(
      s.customEntity
        ? `animation: {{ '${animValue}' if is_state('${s.customEntity}', 'on') else 'none' }};`
        : `animation: ${animValue};`,
    );
  } else if (s.trigger === 'value') {
    if (s.valueEntity && s.valueOperator && s.valueThreshold !== undefined) {
      // Same value-source expressions as buildThresholdJinja, so both
      // features read a numeric state/attribute in the identical spelling.
      const stateExpr = s.valueAttribute
        ? `state_attr('${s.valueEntity}', '${s.valueAttribute}') | float(0)`
        : `states('${s.valueEntity}') | float(0)`;
      decls.push(
        `animation: {{ '${animValue}' if ${stateExpr} ${s.valueOperator} ${s.valueThreshold} else 'none' }};`,
      );
    } else {
      decls.push(`animation: ${animValue};`); // incomplete → unconditional (W8)
    }
  }

  return decls;
}

/**
 * Heading card. HA 2026.10 replaced the title's `<p>` with
 * `<h2 class="heading">` (`<h3>` for `heading_style: subtitle`) whose font
 * properties inherit from HA's public `--ha-heading-card-{title,subtitle}-*`
 * variables: the old `.title p` selector stopped matching, and even a
 * `.heading` selector can't set size/weight there (HA's `inherit` wins).
 * The variables work on 2026.9 AND 2026.10 alike (verified live, card-mod
 * and UIX), so size / colour / weight go through them — for both heading
 * styles, which also makes the module work on "Subtitle" headings (it never
 * reached them before). Font family has no variable: a selector list
 * covering the old `<p>` and the new `.heading` sets it on both versions.
 * `.content` wraps the icon + text in either style.
 *
 * The pre-v0.10 shape (`.title p` / `.title ha-icon`) is still recognised
 * by mapHeadingStyle, so opening an old config and saving migrates it.
 */
export const HEADING_FAMILY_SELECTOR = '.content p,\n.content .heading';
export const HEADING_ICON_SELECTOR = '.content ha-icon';

function headingStyleBlocks(s: HeadingStyleModuleState): string {
  if (!s.enabled) return '';

  const alignMap: Record<string, string> = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
  };

  // Each property is written only when set: an untouched one must leave the
  // card's native value alone (it differs between title and subtitle).
  const containerDecls = [
    ...(s.alignment ? [`justify-content: ${alignMap[s.alignment] ?? 'flex-start'} !important;`] : []),
    ...(['title', 'subtitle'] as const).flatMap((kind) => [
      ...(s.fontSize != null ? [`--ha-heading-card-${kind}-font-size: ${s.fontSize}px;`] : []),
      ...(s.textColor ? [`--ha-heading-card-${kind}-color: ${s.textColor};`] : []),
      ...(s.fontWeight ? [`--ha-heading-card-${kind}-font-weight: ${FONT_WEIGHT_VALUE[s.fontWeight]};`] : []),
    ]),
  ];
  const container = containerDecls.length
    ? `.container {\n${containerDecls.map((d) => `  ${d}`).join('\n')}\n}`
    : '';

  const family = s.fontFamily?.trim()
    ? `${HEADING_FAMILY_SELECTOR} {\n  font-family: ${s.fontFamily.trim()};\n}`
    : '';

  // --mdc-icon-size is what ha-icon honours (still, as of HA 2026.10 —
  // HA's own usage grew); the pre-v0.10 `--ha-icon-size` twin was inert and
  // is no longer emitted (still recognised when reading older configs).
  const iconDecls = [
    ...(s.iconSize != null ? [`--mdc-icon-size: ${s.iconSize}px;`] : []),
    ...(s.iconColor ? [`color: ${s.iconColor} !important;`] : []),
  ];
  const icon = iconDecls.length
    ? `${HEADING_ICON_SELECTOR} {\n${iconDecls.map((d) => `  ${d}`).join('\n')}\n}`
    : '';

  return [container, family, icon].filter(Boolean).join('\n\n');
}

/** CSS value per Font-module weight name. Exported for the parser's
 *  companion-claiming and the entities-row generator. */
export const FONT_WEIGHT_VALUE: Record<NonNullable<FontModuleState['fontWeight']>, string> = {
  normal: 'normal',
  medium: '500',
  bold: 'bold',
};

/** Header title scales at 1.5× the body size (HA default: 24px header vs
 *  16px body), so "make the text bigger" keeps the hierarchy intact.
 *  Exported for the parser's companion-claiming (exact-string match). */
export function headerFontSize(sizePx: number): string {
  return `calc(${sizePx}px * 1.5)`;
}

/** The entity/sensor cards' big value keeps its 1.75× ratio over the body
 *  size (HA default: 28px value vs 16px name). Exported for the parser. */
export function valueFontSize(sizePx: number): string {
  return `calc(${sizePx}px * 1.75)`;
}

/**
 * Many stock cards override some font property internally, each their own
 * way — a bare inherited `ha-card { font-size }` only reaches the ones that
 * don't (entities rows, markdown, glance names...). This table encodes the
 * per-card-type companions, every one verified against a LIVE render (see
 * tools/sandbox/harness/font_module_check.mjs), not just source reading:
 *
 * - tile: <ha-tile-info> reads its own --ha-tile-info-* variables.
 * - light: #info/.brightness set font-size from --name-font-size (1.2rem),
 *   declared by the card itself on ha-card — needs !important on the
 *   elements (they're in the card's own shadow root, so reachable).
 * - button: ha-card's own adopted stylesheet sets font-size — adopted
 *   sheets order AFTER injected <style> tags, so the injected declaration
 *   needs !important to win at equal specificity.
 * - sensor/entity: .name/.value/.measurement carry explicit sizes
 *   (name also weight+color, measurement also color) — direct selectors.
 * - gauge: .title has explicit size/color; the value text is SVG inside
 *   ha-gauge's nested shadow root — its color is `fill:
 *   var(--primary-text-color)` (reachable by variable only); its SIZE is
 *   Font → Number size, a Studio-owned pierced entry scaling the box
 *   ha-gauge fits it into (src/utils/owned-entries.ts) — a font-size there
 *   is refitted away by HA.
 * - thermostat: .title has explicit size; the hvac label reads
 *   --ha-font-size-l / --ha-font-weight-medium; the big number (57px, two
 *   shadow roots deep) takes weight/color by inheritance and its size from
 *   Font → Temperature size (owned pierced entry, owned-entries.ts).
 * - header-title cards: see HEADER_TITLE_CARD_TYPES in card-caps.
 *
 * All returned as extra top-level blocks joined after the base ha-card block.
 */
function fontCompanionBlocks(
  cardType: string | undefined,
  size: string | null,
  sizePx: number | null,
  weight: string | null,
  color: string | null,
): string[] {
  const blocks: string[] = [];
  const block = (selector: string, decls: Array<string | null>) => {
    const d = decls.filter((x): x is string => !!x);
    if (d.length) blocks.push(`${selector} {\n${d.join('\n')}\n}`);
  };
  const sizeDecl = size ? `  font-size: ${size} !important;` : null;
  const weightDecl = weight ? `  font-weight: ${weight} !important;` : null;
  const colorDecl = color ? `  color: ${color} !important;` : null;

  if (cardType === 'light') {
    block('#info', [sizeDecl]);
    block('.brightness', [sizeDecl]);
  }

  if (cardType === 'sensor' || cardType === 'entity') {
    block('.name', [sizeDecl, weightDecl, colorDecl]);
    block('.value', [sizePx != null ? `  font-size: ${valueFontSize(sizePx)} !important;` : null]);
    block('.measurement', [sizeDecl, colorDecl]);
  }

  if (cardType === 'gauge' || cardType === 'thermostat') {
    const titleDecls = [sizeDecl, weightDecl, colorDecl];
    block('.title', titleDecls);
    // On older HA the gauge's name is a div.name (checked live on 2026.2 and
    // 2025.9; 2026.6+ uses p.title); current HA has no .name in the gauge, so
    // this is inert there.
    if (cardType === 'gauge') block('.name', titleDecls);
  }

  if (cardType === 'entities') {
    // The slotted h1 is in the card's own shadow root — a plain rule beats
    // ha-card's internal ::slotted() styling, no !important needed. Weight
    // has no dedicated header variable, hence the direct rule.
    if (weight) blocks.push(`.card-header {\n  font-weight: ${weight};\n}`);
  }

  return blocks;
}

/** ha-card-block companion declarations (variables that must ride in the
 *  same block as the base font declarations). Each one is written only when
 *  the value it derives from is set. */
function fontCompanionDecls(
  cardType: string | undefined,
  size: string | null,
  sizePx: number | null,
  weight: string | null,
  color: string | null,
  family: string | null,
  caps: CardCaps,
): string[] {
  const decls: string[] = [];

  if (cardType === 'tile') {
    if (size) {
      decls.push(`--ha-tile-info-primary-font-size: ${size};`, `--ha-tile-info-secondary-font-size: ${size};`);
    }
    if (weight) {
      decls.push(`--ha-tile-info-primary-font-weight: ${weight};`, `--ha-tile-info-secondary-font-weight: ${weight};`);
    }
    if (color) {
      decls.push(`--ha-tile-info-primary-color: ${color};`, `--ha-tile-info-secondary-color: ${color};`);
    }
  }

  if (cardType === 'gauge' && color && !refersTo(color, '--primary-text-color')) {
    // The gauge's SVG value text is `fill: var(--primary-text-color)` inside
    // a nested shadow root — the variable is the only way in. Scoped to this
    // card's ha-card, so nothing outside the gauge is affected. (Accent
    // Color's needle-mode !important on ha-gauge deliberately outranks it.)
    // The theme default needs no override (and must not get one: see refersTo).
    decls.push(`--primary-text-color: ${color};`);
  }

  if (cardType === 'thermostat') {
    // hvac-action/current-temperature label inside the nested climate
    // control reads these tokens.
    if (size) decls.push(`--ha-font-size-l: ${size};`);
    if (weight) decls.push(`--ha-font-weight-medium: ${weight};`);
  }

  if (caps.headerTitle) {
    if (sizePx != null) decls.push(`--ha-card-header-font-size: ${headerFontSize(sizePx)};`);
    if (color) decls.push(`--ha-card-header-color: ${color};`);
    if (family) decls.push(`--ha-card-header-font-family: ${family};`);
  }

  return decls;
}

/** Font through a profile emitter: variables (size `Npx`, weight, colour) on
 *  the emitter's selector, plus a plain `font-family` when it asks for one.
 *  Each list is written only when its value is set. */
function fontVarBlock(s: FontModuleState, e: FontEmitter, skipColor = false): string {
  if (!s.enabled) return '';
  const family = s.fontFamily.trim();
  const weight = s.fontWeight ? FONT_WEIGHT_VALUE[s.fontWeight] : null;
  const decls = [
    ...(s.fontSize != null ? (e.size ?? []).map((v) => `${v}: ${s.fontSize}px;`) : []),
    ...(weight ? (e.weight ?? []).map((v) => `${v}: ${weight};`) : []),
    ...(skipColor || !s.color ? [] : (e.color ?? []).map((v) => `${v}: ${s.color};`)),
    ...(e.family && family ? [`font-family: ${family};`] : []),
  ];
  return decls.length ? `${e.selector} {\n${decls.map((d) => `  ${d}`).join('\n')}\n}` : '';
}

/**
 * @param skipColor  Omit the `color` declarations (base and companions) —
 *   used when Threshold already owns the 'text-color' property for this
 *   card, so the two modules don't emit conflicting `color` declarations
 *   into the same ha-card block (size/weight/family still apply either way).
 *
 * Exported for the parser's size-less reproducibility check.
 */
export function fontBlock(s: FontModuleState, cardType: string | undefined, caps: CardCaps, skipColor = false): string {
  if (!s.enabled) return '';

  const sizePx = s.fontSize ?? null;
  const size = sizePx != null ? `${sizePx}px` : null;
  const weight = s.fontWeight ? FONT_WEIGHT_VALUE[s.fontWeight] : null;
  const color = skipColor ? null : s.color || null;
  const family = s.fontFamily.trim() || null;

  // Button: ha-card's own adopted stylesheet declares font-size, and adopted
  // sheets order after injected <style> elements — !important required.
  const sizeImportant = cardType === 'button' ? ' !important' : '';
  const decls: string[] = [];
  if (size) decls.push(`font-size: ${size}${sizeImportant};`);
  if (weight) decls.push(`font-weight: ${weight};`);
  if (color) decls.push(`color: ${color};`);
  if (family) decls.push(`font-family: ${family};`);
  decls.push(...fontCompanionDecls(cardType, size, sizePx, weight, color, family, caps));

  const base = decls.length ? `ha-card {\n${decls.map((d) => `  ${d}`).join('\n')}\n}` : '';
  return [base, ...fontCompanionBlocks(cardType, size, sizePx, weight, color)].filter(Boolean).join('\n\n');
}

/**
 * The icon-size value: static `Npx`, or a quoted-branch ternary when the
 * size reacts to a condition (sizeOffPx falls back to HA's 24px default).
 */
export function iconSizeValue(s: IconColorModuleState, scale: (px: number) => number = (px) => px): string | null {
  if (!s.sizePx || s.sizePx <= 0) return null;
  const cond = conditionExpr(s.sizeWhen);
  if (!cond) return `${scale(s.sizePx)}px`;
  const offPx = s.sizeOffPx && s.sizeOffPx > 0 ? s.sizeOffPx : 24;
  return `{{ '${scale(s.sizePx)}px' if ${cond} else '${scale(offPx)}px' }}`;
}

/** A profile icon-size emitter's glyph/box ratio (Mushroom: 24px glyph in a
 *  36px shape) — the glyph variables get this share of the slider value. */
export const GLYPH_SCALE = (px: number): number => Math.round((px * 2) / 3);

/** Icon size through a profile emitter: `box` variables get the slider value,
 *  `glyph` ones its glyph share. Returns the declarations (no selector). */
function iconSizeVarDecls(s: IconColorModuleState, e: IconSizeEmitter): string[] {
  if (!s.enabled) return [];
  const box = iconSizeValue(s);
  if (!box) return [];
  const glyph = e.glyph?.length ? iconSizeValue(s, GLYPH_SCALE) : null;
  return [...e.box.map((v) => `${v}: ${box};`), ...(glyph ? e.glyph!.map((v) => `${v}: ${glyph};`) : [])];
}

/**
 * Icon-size declarations for the ha-card block (entity/sensor/
 * picture-glance — the vars cascade to exactly the main state icon there,
 * live-verified) — tile instead needs the separate ha-tile-icon block
 * below. Gated on capsFor(key).iconSize (ICON_SIZE_TYPES): everywhere else the vars either do
 * nothing or hit the wrong icons (see card-caps.ts).
 */
function iconSizeDecls(s: IconColorModuleState, cardType: string | undefined, caps: CardCaps): string[] {
  if (!s.enabled || !cardType || cardType === 'tile' || !caps.iconSize) return [];
  const value = iconSizeValue(s);
  return value ? [`--mdc-icon-size: ${value};`, `--ha-icon-size: ${value};`] : [];
}

/** Tile's icon pins its own size — the variable only works set directly on
 *  ha-tile-icon (live-verified; `--ha-icon-size` is untested there and
 *  deliberately not emitted). */
function tileIconSizeBlock(s: IconColorModuleState, cardType?: string): string {
  if (!s.enabled || cardType !== 'tile') return '';
  const value = iconSizeValue(s);
  return value ? `ha-tile-icon {\n  --mdc-icon-size: ${value};\n}` : '';
}

/** Icon Color's colour declaration (always `!important`: Bubble and HA both
 *  set the icon colour on the element itself). */
function iconColorDecl(s: IconColorModuleState): string | null {
  if (!s.enabled || s.mode === 'none') return null;
  if (s.mode === 'plain') return `color: ${s.color} !important;`;

  const ref = entityRef(s.entityId);
  if (s.mode === 'light') {
    return (
      `color: {{ 'rgb(' ~ (state_attr(${ref}, 'rgb_color') | join(', ')) ~ ')' ` +
      `if is_state(${ref}, 'on') and state_attr(${ref}, 'rgb_color') ` +
      `else '${s.colorOff}' }} !important;`
    );
  }
  return `color: {{ '${s.colorOn}' if is_state(${ref}, 'on') else '${s.colorOff}' }} !important;`;
}

function iconColorBlock(s: IconColorModuleState): string {
  const decl = iconColorDecl(s);
  return decl ? `ha-state-icon {\n  ${decl}\n}` : '';
}

/**
 * Sorts threshold rules into evaluation order: highest value first for `>`/`>=`
 * (so the largest matching threshold wins), lowest first for `<`/`<=`. The first
 * rule's operator decides the direction. Exported so the editor can show the
 * exact same order it will generate. Returns a new array; input is untouched.
 */
export function sortThresholdRules(rules: ThresholdRule[]): ThresholdRule[] {
  const firstOp = rules[0]?.operator ?? '>';
  const sorted = [...rules];
  if (firstOp === '>' || firstOp === '>=') {
    sorted.sort((a, b) => b.value - a.value);
  } else if (firstOp === '<' || firstOp === '<=') {
    sorted.sort((a, b) => a.value - b.value);
  }
  return sorted;
}

/**
 * Builds the nested Jinja2 ternary string used for threshold color expressions.
 * Exported so the entity-row generator can reuse it.
 */
export function buildThresholdJinja(
  rules: ThresholdRule[],
  defaultColor: string,
  entityId: string,
  attribute?: string,
  /** Rewrites each colour before it is written (Mushroom: `R, G, B`). */
  mapColor: (color: string) => string = (c) => c,
): string {
  const stateExpr = attribute
    ? `state_attr('${entityId}', '${attribute}') | float(0)`
    : `states('${entityId}') | float(0)`;
  const sortedRules = sortThresholdRules(rules);
  let jinja = '{{ ';
  for (let i = 0; i < sortedRules.length; i++) {
    const rule = sortedRules[i];
    if (i > 0) jinja += ' else (';
    jinja += `'${mapColor(rule.color)}' if ${stateExpr} ${rule.operator} ${rule.value}`;
  }
  jinja += ` else '${mapColor(defaultColor)}'`;
  jinja += ')'.repeat(sortedRules.length - 1);
  jinja += ' }}';
  return jinja;
}

// ---------------------------------------------------------------------------
// Gradient (fade) mode — approximates a continuous fade between colorStops
// as a chain of closely-spaced discrete threshold rules, reusing the exact
// same generation/parsing/entity-binding/multi-property machinery switch
// mode already has. True continuous color math isn't reasonably expressible
// in HA's sandboxed Jinja2 (no hex-formatting filter to build a color string
// from computed numbers) — a dense discrete approximation is invisible in
// practice at normal HA update rates, and far more robust.
// ---------------------------------------------------------------------------

const GRADIENT_STEPS = 32;
/** Custom property carrying the real anchor points, so re-opening the editor
 *  recovers your actual stops instead of GRADIENT_STEPS generated rules. */
export const GRADIENT_MARKER_PROPERTY = '--cms-gradient-stops';

function normalizeHex(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  const short = value.match(/^#([0-9a-fA-F]{3})[0-9a-fA-F]?$/);
  if (short) return `#${[...short[1]].map((c) => c + c).join('')}`;
  // 8-digit (#rrggbbaa) — drop the alpha channel rather than falling through
  // to gray: the interpolation math is RGB-only, and a color picker that
  // emits alpha shouldn't silently turn a user's gradient gray.
  const long = value.match(/^#([0-9a-fA-F]{6})[0-9a-fA-F]{2}$/);
  if (long) return `#${long[1]}`;
  return '#888888';
}

function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex).slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;
}

/** Linearly interpolates between two hex colors; t=0 -> c1, t=1 -> c2. */
export function lerpColor(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** The color a gradient with these stops would show at a given value — clamped at the ends. */
export function colorAtValue(stops: ColorStop[], value: number): string {
  const sorted = [...stops].sort((a, b) => a.value - b.value);
  if (sorted.length === 0) return '#888888';
  if (sorted.length === 1) return normalizeHex(sorted[0].color);
  if (value <= sorted[0].value) return normalizeHex(sorted[0].color);
  const last = sorted[sorted.length - 1];
  if (value >= last.value) return normalizeHex(last.color);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (value >= a.value && value <= b.value) {
      const t = b.value === a.value ? 0 : (value - a.value) / (b.value - a.value);
      return lerpColor(a.color, b.color, t);
    }
  }
  return normalizeHex(last.color);
}

/**
 * Approximates colorStops as GRADIENT_STEPS discrete '>=' rules plus a
 * default (the clamp-below-minimum color) — the exact shape thresholdBlock
 * already knows how to turn into Jinja2 via buildThresholdJinja.
 */
export function gradientToRules(stops: ColorStop[]): { rules: ThresholdRule[]; defaultColor: string } {
  const sorted = [...stops].sort((a, b) => a.value - b.value);
  if (sorted.length < 2) return { rules: [], defaultColor: normalizeHex(sorted[0]?.color ?? '#888888') };

  const min = sorted[0].value;
  const max = sorted[sorted.length - 1].value;
  const rules: ThresholdRule[] = [];
  for (let i = 1; i <= GRADIENT_STEPS; i++) {
    const value = Math.round((min + ((max - min) * i) / GRADIENT_STEPS) * 100) / 100;
    rules.push({ id: `grad-${i}`, operator: '>=', value, color: colorAtValue(sorted, value) });
  }
  return { rules, defaultColor: normalizeHex(sorted[0].color) };
}

/**
 * Deliberately NOT JSON. Real card-mod's own style-string parsing (not
 * this project's) breaks — silently, with no error, no style applied at
 * all — the moment a `{`/`}` character appears inside a CSS custom
 * property's value, even safely inside a quoted string a spec-compliant
 * CSS tokenizer would treat as inert. Confirmed directly against a live
 * card-mod instance: a JSON-braced marker produced zero applied style,
 * an otherwise-identical brace-free one worked correctly every time. A
 * simple `value:color,value:color` list needs no braces at all.
 */
export function encodeGradientStops(stops: ColorStop[]): string {
  return stops.map((s) => `${s.value}:${s.color}`).join(',');
}

/** Inverse of encodeGradientStops — returns null on anything malformed. */
export function decodeGradientStops(encoded: string): ColorStop[] | null {
  const parts = encoded.split(',').filter((p) => p.trim());
  if (parts.length < 2) return null;
  const stops: ColorStop[] = [];
  for (let i = 0; i < parts.length; i++) {
    // Only real hex lengths (3/4/6/8 digits) — `{3,8}` also accepted
    // invalid 5- and 7-digit values.
    const m = parts[i].trim().match(/^(-?\d+(?:\.\d+)?):(#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8}))$/);
    if (!m) return null;
    stops.push({ id: `stop-${i}`, value: parseFloat(m[1]), color: m[2] });
  }
  return stops;
}

/**
 * A threshold's accent expression in `R, G, B` form for a profile's accent
 * variables. A rule whose colour has no exact form is LEFT OUT (the others
 * keep working); no convertible rule, or an unconvertible default, → null and
 * nothing is written for that property.
 */
export function thresholdAccentJinja(s: ThresholdModuleState | undefined): string | null {
  if (!s || !s.entityId) return null;
  let rules = s.rules;
  let defaultColor = s.defaultColor;
  if (s.valueMode === 'gradient') {
    if (s.colorStops.length < 2) return null;
    ({ rules, defaultColor } = gradientToRules(s.colorStops));
  }
  const usable = rules.filter((r) => toRgbTriplet(r.color) !== null);
  if (usable.length === 0 || toRgbTriplet(defaultColor) === null) return null;
  return buildThresholdJinja(usable, defaultColor, s.entityId, s.attribute || undefined, (c) => toRgbTriplet(c)!);
}

/** What the generator knows about the card when it writes a module. */
interface EmitCtx {
  /** A profile's accent variables are switched off by a config gate. */
  skipAccent?: boolean;
  /** The key built-in emitter choices compare against (the profile's `emitAs`). */
  emitType: string | undefined;
  caps: CardCaps;
  em: ProfileEmitters | undefined;
  opts?: GenerateCssOptions;
}

const varLines = (selector: string, marker: string, decls: string[]): string =>
  `${selector} {\n${marker}${decls.map((d) => `  ${d}`).join('\n')}\n}`;

function thresholdPropertyBlock(
  property: ThresholdProperty,
  jinja: string,
  borderWidth: number,
  gradientMarker: string | null,
  ctx: EmitCtx,
  /** the same expression with every colour as `R, G, B` (null: not exact) */
  tripletJinja: string | null,
): string {
  const { emitType: cardType, caps, em, opts } = ctx;
  const marker = gradientMarker ? `  ${GRADIENT_MARKER_PROPERTY}: ${gradientMarker};\n` : '';
  switch (property) {
    case 'icon-color':
      return `ha-state-icon {\n${marker}  color: ${jinja} !important;\n}`;
    case 'background':
      if (em?.background) {
        return varLines(em.background.selector, marker, em.background.vars.map((v) => `${v}: ${jinja};`));
      }
      return `ha-card {\n${marker}  background: ${jinja};\n}`;
    case 'text-color': {
      // A profile's own text-colour variables (no plain `color`: it reaches
      // nothing on those cards).
      if (em?.font?.color?.length) {
        return varLines(em.font.selector, marker, em.font.color.map((v) => `${v}: ${jinja};`));
      }
      // The same colour companions the Font module writes: tile text reads
      // its own --ha-tile-info-* colours, card titles --ha-card-header-color
      // — neither inherits ha-card's colour.
      const aux = cardType === 'tile'
        ? `  --ha-tile-info-primary-color: ${jinja};\n  --ha-tile-info-secondary-color: ${jinja};\n`
        : caps.headerTitle
          ? `  --ha-card-header-color: ${jinja};\n`
          : '';
      return `ha-card {\n${marker}  color: ${jinja};\n${aux}}`;
    }
    case 'accent-color': {
      if (em?.accent) {
        return tripletJinja ? varLines(em.accent.selector, marker, em.accent.vars.map((v) => `${v}: ${tripletJinja};`)) : '';
      }
      // Same card-type companion variables as the Accent Color module —
      // --accent-color alone is invisible on tile/thermostat/button/gauge.
      const decls = [`--accent-color: ${jinja};`, ...accentAuxDecls(jinja, cardType)]
        .map((d) => `  ${d}`)
        .join('\n');
      const haCardBlock = `ha-card {\n${marker}${decls}\n}`;
      const gauge = gaugeColorBlock(jinja, cardType, null, opts);
      return gauge ? `${haCardBlock}\n\n${gauge}` : haCardBlock;
    }
    case 'border-color':
      if (em?.border?.color?.length) {
        return varLines(em.border.selector, marker, [
          ...(em.border.width ?? []).map((v) => `${v}: ${borderWidth}px;`),
          ...em.border.color.map((v) => `${v}: ${jinja};`),
        ]);
      }
      return `ha-card {\n${marker}  border: ${borderWidth}px solid ${jinja};\n}`;
    default:
      return '';
  }
}

/**
 * The properties the Threshold module is currently writing — empty until it
 * has an entity, at least one rule (gradient: two stops) and a property,
 * i.e. exactly when thresholdBlock() emits something. The static module for
 * each of these properties steps aside (see generateCss).
 */
export function thresholdOwnedProperties(s: ThresholdModuleState | undefined): Set<ThresholdProperty> {
  if (!s || !s.enabled || !s.entityId || s.properties.length === 0) return new Set();
  if (s.valueMode === 'gradient' ? s.colorStops.length < 2 : s.rules.length === 0) return new Set();
  return new Set(s.properties);
}

/**
 * Threshold rules can drive more than one CSS property at once (e.g. icon
 * color AND accent color changing together off the same rule set) — one
 * block is emitted per selected property, all sharing the same computed
 * Jinja2 expression.
 */
function thresholdBlock(s: ThresholdModuleState | undefined, ctx: EmitCtx): string {
  if (!s || !s.enabled || !s.entityId || s.properties.length === 0) return '';
  // A profile with its own emitters that hides Threshold (Bubble: no probed
  // target) writes none — a preset's threshold state would be dead CSS there.
  if (ctx.caps.custom && !ctx.caps.modules.threshold) return '';

  let rules = s.rules;
  let defaultColor = s.defaultColor;
  let gradientMarker: string | null = null;

  if (s.valueMode === 'gradient') {
    if (s.colorStops.length < 2) return '';
    ({ rules, defaultColor } = gradientToRules(s.colorStops));
    gradientMarker = `'${encodeGradientStops(s.colorStops)}'`;
  } else if (rules.length === 0) {
    return '';
  }

  const jinja = buildThresholdJinja(rules, defaultColor, s.entityId, s.attribute || undefined);
  // The accent variables of a profile take `R, G, B` (thresholdAccentJinja:
  // a rule with no exact form is left out, nothing convertible → no block).
  const tripletJinja = ctx.em?.accent ? thresholdAccentJinja(s) : null;
  // Canonical property order, matching the parser's candidate-collection
  // order exactly — without this, a reopen reordered the blocks and broke
  // the byte-stable round-trip once (audit C1).
  const CANONICAL: ThresholdProperty[] = ['background', 'text-color', 'accent-color', 'border-color', 'icon-color'];
  const ordered = [...s.properties]
    .filter((p) => !(p === 'accent-color' && ctx.skipAccent && ctx.em?.accent))
    .sort((a, b) => CANONICAL.indexOf(a) - CANONICAL.indexOf(b));
  return ordered
    .map((property) => thresholdPropertyBlock(property, jinja, s.borderWidth ?? 2, gradientMarker, ctx, tripletJinja))
    .filter(Boolean)
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * `cardType` is the card's PROFILE KEY (profileKeyOf(config); equal to
 * `config.type` for every built-in card) — passed once, here. Gating reads go
 * through capsFor(); the emitter choice below still compares the key against
 * the built-in names, and a custom profile's `emitters` (later chunks) hook
 * in at those same points.
 */
export function generateCss(state: StudioState, cardType?: string, opts?: GenerateCssOptions): string {
  const parts: string[] = [];

  // No own entity → no `config.entity` anywhere in the output (see
  // settleEntityless). Without `opts.config` the card is unknown: unchanged.
  state = withoutUnwatchedEntity(settleEntityless(state, opts?.config), opts?.config);

  // What the card's profile says (C2.2): `emitAs` borrows a built-in card's
  // emitter choices, `emitters` replace a module's output with the profile's
  // own variables. Gating questions go through the capabilities lookup.
  const caps = capsFor(cardType, opts?.config);
  const profile = getCustomCardProfile(cardType ?? '');
  const em = profile?.emitters;
  // A config gate that hides Accent (Mushroom `icon_color`) means the accent
  // variables reach nothing — write none (also from a loaded preset).
  const skipAccent = !!em?.accent && !caps.modules.accentColor;
  const ctx: EmitCtx = { emitType: emitKeyOf(cardType) || undefined, caps, em, opts, skipAccent };
  const emitType = ctx.emitType;

  // Keyframes only ever ride along an actual `animation:` declaration — an
  // orphan @keyframes block resets the module on reopen (audit W8/BUG-4).
  const animDecls = animationDecls(state.animation);
  const kf = animDecls.some((d) => d.startsWith('animation')) ? animationKeyframes(state.animation) : '';
  if (kf) parts.push(kf);

  // A property the Threshold module already drives is skipped in the
  // corresponding static module's output — both would otherwise write the
  // same declaration into the same ha-card block, and only the one that
  // happens to render later would actually take effect (silently ignoring
  // the static module's own control).
  // Only once Threshold actually writes something: an enabled-but-unfinished
  // Threshold (no entity / no rules yet) used to silently disable e.g.
  // Background on a thermostat or Accent on a gauge (its default property).
  // A custom profile that hides Threshold writes no threshold block (see
  // thresholdBlock), so it owns nothing: a stray threshold state (a preset's)
  // must not silence the static modules.
  const thresholdProps = new Set(caps.custom && !caps.modules.threshold ? [] : thresholdOwnedProperties(state.threshold));
  // …but only for what is actually written: a profile's accent property with
  // nothing convertible (or gated off) emits no block, so it must not silence
  // the Accent module's own, valid value.
  if (em?.accent && (skipAccent || thresholdAccentJinja(state.threshold) === null)) thresholdProps.delete('accent-color');

  // Profile emitters on a selector other than ha-card get their own block —
  // one per selector, in first-use order (Bubble: background + border share
  // `.bubble-button-background`, icon colour + size share `.bubble-icon`).
  const extraBlocks = new Map<string, string[]>();
  const onHaCard = (selector: string, decls: string[]): string[] => {
    if (selector.trim().toLowerCase() === 'ha-card') return decls;
    if (decls.length > 0) extraBlocks.set(selector, [...(extraBlocks.get(selector) ?? []), ...decls]);
    return [];
  };

  // ha-card block
  const haCardDecls = [
    ...(thresholdProps.has('accent-color')
      ? []
      : em?.accent
        ? skipAccent
          ? []
          : onHaCard(em.accent.selector, accentVarDecls(state.accentColor, em.accent))
        : accentColorDecls(state.accentColor, emitType)),
    ...filterDecls(state.filter, caps, state.advanced.rawCss),
    ...(thresholdProps.has('background')
      ? []
      : em?.background
        ? onHaCard(
            em.background.selector,
            companionDecls(backgroundDecls(state.background, em.background.vars), em.background.companions),
          )
        : backgroundDecls(state.background)),
    ...(em?.border
      ? onHaCard(
          em.border.selector,
          em.border.direct
            ? borderDecls(state.border, thresholdProps.has('border-color')).map((d) =>
                em.border!.important?.some((p) => d.startsWith(`${p}:`)) ? d.replace(/;$/, ' !important;') : d,
              )
            : borderVarDecls(state.border, em.border, thresholdProps.has('border-color')),
        )
      : borderDecls(state.border, thresholdProps.has('border-color'))),
    ...animDecls,
    // Icon colour on a profile's own selector (Bubble `.bubble-icon`): joins the
    // icon-size block below instead of writing `ha-state-icon`.
    ...(em?.iconColor
      ? onHaCard(
          em.iconColor.selector,
          [!(thresholdProps.has('icon-color') || caps.iconColorless) ? iconColorDecl(state.iconColor) : null].filter(
            (d): d is string => !!d,
          ),
        )
      : []),
    ...(em?.iconSize
      ? onHaCard(em.iconSize.selector, iconSizeVarDecls(state.iconColor, em.iconSize))
      : iconSizeDecls(state.iconColor, emitType, caps)),
  ];
  if (haCardDecls.length > 0) {
    const body = haCardDecls.map((d) => `  ${d}`).join('\n');
    parts.push(`ha-card {\n${body}\n}`);
  }
  // (the extra blocks above were queued while building the ha-card list)
  for (const [selector, decls] of extraBlocks) parts.push(varLines(selector, '', decls));

  // Gauge dial color needs its own ha-gauge block (see gaugeColorBlock).
  if (!thresholdProps.has('accent-color') && state.accentColor.enabled) {
    const gauge = gaugeColorBlock(accentValue(state.accentColor), emitType, null, opts);
    if (gauge) parts.push(gauge);
  }

  // Skip icon-color module when threshold is already driving icon color — both
  // emit ha-state-icon { color } and the second block would silently win.
  // (A colourless profile — chips — has no icon the colour could reach.)
  const iconColor =
    em?.iconColor || thresholdProps.has('icon-color') || caps.iconColorless ? '' : iconColorBlock(state.iconColor);
  if (iconColor) parts.push(iconColor);

  const tileIconSize = em?.iconSize ? '' : tileIconSizeBlock(state.iconColor, emitType);
  if (tileIconSize) parts.push(tileIconSize);

  const threshold = thresholdBlock(state.threshold, ctx);
  if (threshold) parts.push(threshold);

  const headingStyle = headingStyleBlocks(state.headingStyle);
  if (headingStyle) parts.push(headingStyle);

  const font = em?.font
    ? fontVarBlock(state.font, em.font, thresholdProps.has('text-color'))
    : fontBlock(state.font, emitType, caps, thresholdProps.has('text-color'));
  if (font) parts.push(font);

  if (state.advanced.rawCss.trim()) {
    parts.push(state.advanced.rawCss.trim());
  }

  return parts.join('\n\n');
}

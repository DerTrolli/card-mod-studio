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
  ThresholdModuleState,
  ThresholdRule,
  ThresholdProperty,
  ColorStop,
} from '../types/index.js';

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
};

// ---------------------------------------------------------------------------
// Per-module declaration builders
// ---------------------------------------------------------------------------

function filterDecls(s: FilterModuleState): string[] {
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
    const grayVal = grayParts.join(' ');
    const otherVal = otherParts.length > 0 ? otherParts.join(' ') : 'none';

    if (s.grayscaleWhen === 'always') {
      decls.push(`filter: ${grayVal};`);
    } else if (s.grayscaleWhen === 'off') {
      decls.push(
        `filter: {{ '${grayVal}' if is_state(config.entity, 'off') else '${otherVal}' }};`,
      );
    } else if (s.grayscaleWhen === 'custom' && s.customEntity) {
      decls.push(
        `filter: {{ '${grayVal}' if is_state(${entityRef(s.customEntity)}, 'on') else '${otherVal}' }};`,
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
    if (parts.length > 0) decls.push(`filter: ${parts.join(' ')};`);
  }

  if (decls.length > 0) {
    decls.push(`transition: filter ${s.transitionMs}ms ease;`);
  }

  return decls;
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
  // Tile card: icon background/state color is driven by --tile-color
  if (cardType === 'tile') {
    return [`--tile-color: ${value};`, `--state-icon-color: ${value};`];
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

  // Button card (HA built-in) and generic entity-state cards
  return [`--state-icon-color: ${value};`, `--paper-item-icon-active-color: ${value};`];
}

function accentColorDecls(s: AccentColorModuleState, cardType?: string): string[] {
  if (!s.enabled) return [];
  const value = accentValue(s);
  return [`--accent-color: ${value};`, ...accentAuxDecls(value, cardType)];
}

/**
 * Gauge cards ignore an inherited --gauge-color: hui-gauge-card writes the
 * severity-computed color as an *inline style* on <ha-gauge> on every render
 * (styleMap in hui-gauge-card.ts), and inline wins over anything inherited
 * from ha-card. An author-stylesheet `!important` on the element itself is
 * the one thing that beats a non-important inline style, so the gauge needs
 * its own block targeting ha-gauge directly — verified live against a real
 * gauge card (tools/sandbox/harness/gauge_color_check.mjs). In needle mode
 * the value arc doesn't exist and --gauge-color is unused — the dial shows
 * the configured segment colors instead; nothing any CSS can recolor
 * without piercing ha-gauge's shadow root.
 */
function gaugeColorBlock(value: string, cardType: string | undefined, marker: string | null): string {
  if (cardType !== 'gauge') return '';
  const markerLine = marker ? `  ${GRADIENT_MARKER_PROPERTY}: ${marker};\n` : '';
  return `ha-gauge {\n${markerLine}  --gauge-color: ${value} !important;\n}`;
}

function backgroundDecls(s: BackgroundModuleState): string[] {
  if (!s.enabled) return [];

  const bgValue =
    s.type === 'gradient'
      ? `linear-gradient(${s.angle}deg, ${s.color1}, ${s.color2})`
      : s.color1;

  if (s.applyWhen === 'always') return [`background: ${bgValue};`];
  if (s.applyWhen === 'custom' && s.customEntity) {
    return [
      `background: {{ '${bgValue}' if is_state(${entityRef(s.customEntity)}, 'on') else 'none' }};`,
    ];
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
  if (!skipColor && s.borderWidth > 0) decls.push(`border: ${s.borderWidth}px solid ${s.borderColor};`);
  return decls;
}

function animationKeyframes(s: AnimationModuleState): string {
  if (!s.enabled) return '';
  return KEYFRAMES[s.preset] ?? '';
}

function animationDecls(s: AnimationModuleState): string[] {
  if (!s.enabled) return [];

  const animValue = `cms-${s.preset} ${s.speedS}s ease-in-out infinite`;
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
  } else if (s.trigger === 'custom' && s.customEntity) {
    decls.push(
      `animation: {{ '${animValue}' if is_state('${s.customEntity}', 'on') else 'none' }};`,
    );
  }

  return decls;
}

function headingStyleBlocks(s: HeadingStyleModuleState): string {
  if (!s.enabled) return '';

  const alignMap: Record<string, string> = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
  };

  const titlePDecls = [
    `font-size: ${s.fontSize}px;`,
    `color: ${s.textColor} !important;`,
  ];
  const titleP = `.title p {\n${titlePDecls.map((d) => `  ${d}`).join('\n')}\n}`;

  // --mdc-icon-size is the var the heading icon honours today, but MDC custom
  // properties are deprecated in HA (2026.4+). Emit --ha-icon-size alongside it
  // as a forward-compatible fallback so sizing survives the MDC removal.
  const iconDecls = [
    `--mdc-icon-size: ${s.iconSize}px;`,
    `--ha-icon-size: ${s.iconSize}px;`,
    `color: ${s.iconColor} !important;`,
  ];
  const titleIcon = `.title ha-icon {\n${iconDecls.map((d) => `  ${d}`).join('\n')}\n}`;

  const alignVal = alignMap[s.alignment] ?? 'flex-start';
  const container = `.container {\n  justify-content: ${alignVal} !important;\n}`;

  return [container, titleP, titleIcon].join('\n\n');
}

function iconColorBlock(s: IconColorModuleState): string {
  if (!s.enabled) return '';

  if (s.mode === 'plain') {
    return `ha-state-icon {\n  color: ${s.color} !important;\n}`;
  }

  const ref = entityRef(s.entityId);

  if (s.mode === 'light') {
    const jinja =
      `{{ 'rgb(' ~ (state_attr(${ref}, 'rgb_color') | join(', ')) ~ ')' ` +
      `if is_state(${ref}, 'on') and state_attr(${ref}, 'rgb_color') ` +
      `else '${s.colorOff}' }}`;
    return `ha-state-icon {\n  color: ${jinja} !important;\n}`;
  }

  // Conditional mode
  return (
    `ha-state-icon {\n` +
    `  color: {{ '${s.colorOn}' if is_state(${ref}, 'on') else '${s.colorOff}' }} !important;\n` +
    `}`
  );
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
): string {
  const stateExpr = `states('${entityId}') | float(0)`;
  const sortedRules = sortThresholdRules(rules);
  let jinja = '{{ ';
  for (let i = 0; i < sortedRules.length; i++) {
    const rule = sortedRules[i];
    if (i > 0) jinja += ' else (';
    jinja += `'${rule.color}' if ${stateExpr} ${rule.operator} ${rule.value}`;
  }
  jinja += ` else '${defaultColor}'`;
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

function thresholdPropertyBlock(
  property: ThresholdProperty,
  jinja: string,
  borderWidth: number,
  gradientMarker: string | null,
  cardType?: string,
): string {
  const marker = gradientMarker ? `  ${GRADIENT_MARKER_PROPERTY}: ${gradientMarker};\n` : '';
  switch (property) {
    case 'icon-color':
      return `ha-state-icon {\n${marker}  color: ${jinja} !important;\n}`;
    case 'background':
      return `ha-card {\n${marker}  background: ${jinja};\n}`;
    case 'text-color':
      return `ha-card {\n${marker}  color: ${jinja};\n}`;
    case 'accent-color': {
      // Same card-type companion variables as the Accent Color module —
      // --accent-color alone is invisible on tile/thermostat/button/gauge.
      const decls = [`--accent-color: ${jinja};`, ...accentAuxDecls(jinja, cardType)]
        .map((d) => `  ${d}`)
        .join('\n');
      const haCardBlock = `ha-card {\n${marker}${decls}\n}`;
      const gauge = gaugeColorBlock(jinja, cardType, null);
      return gauge ? `${haCardBlock}\n\n${gauge}` : haCardBlock;
    }
    case 'border-color':
      return `ha-card {\n${marker}  border: ${borderWidth}px solid ${jinja};\n}`;
    default:
      return '';
  }
}

/**
 * Threshold rules can drive more than one CSS property at once (e.g. icon
 * color AND accent color changing together off the same rule set) — one
 * block is emitted per selected property, all sharing the same computed
 * Jinja2 expression.
 */
function thresholdBlock(s: ThresholdModuleState | undefined, cardType?: string): string {
  if (!s || !s.enabled || !s.entityId || s.properties.length === 0) return '';

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

  const jinja = buildThresholdJinja(rules, defaultColor, s.entityId);
  return s.properties
    .map((property) => thresholdPropertyBlock(property, jinja, s.borderWidth ?? 2, gradientMarker, cardType))
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateCss(state: StudioState, cardType?: string): string {
  const parts: string[] = [];

  const kf = animationKeyframes(state.animation);
  if (kf) parts.push(kf);

  // A property the Threshold module already drives is skipped in the
  // corresponding static module's output — both would otherwise write the
  // same declaration into the same ha-card block, and only the one that
  // happens to render later would actually take effect (silently ignoring
  // the static module's own control).
  const thresholdProps = new Set(state.threshold.enabled ? state.threshold.properties : []);

  // ha-card block
  const haCardDecls = [
    ...(thresholdProps.has('accent-color') ? [] : accentColorDecls(state.accentColor, cardType)),
    ...filterDecls(state.filter),
    ...(thresholdProps.has('background') ? [] : backgroundDecls(state.background)),
    ...borderDecls(state.border, thresholdProps.has('border-color')),
    ...animationDecls(state.animation),
  ];
  if (haCardDecls.length > 0) {
    const body = haCardDecls.map((d) => `  ${d}`).join('\n');
    parts.push(`ha-card {\n${body}\n}`);
  }

  // Gauge dial color needs its own ha-gauge block (see gaugeColorBlock).
  if (!thresholdProps.has('accent-color') && state.accentColor.enabled) {
    const gauge = gaugeColorBlock(accentValue(state.accentColor), cardType, null);
    if (gauge) parts.push(gauge);
  }

  // Skip icon-color module when threshold is already driving icon color — both
  // emit ha-state-icon { color } and the second block would silently win.
  const iconColor = thresholdProps.has('icon-color') ? '' : iconColorBlock(state.iconColor);
  if (iconColor) parts.push(iconColor);

  const threshold = thresholdBlock(state.threshold, cardType);
  if (threshold) parts.push(threshold);

  const headingStyle = headingStyleBlocks(state.headingStyle);
  if (headingStyle) parts.push(headingStyle);

  if (state.advanced.rawCss.trim()) {
    parts.push(state.advanced.rawCss.trim());
  }

  return parts.join('\n\n');
}

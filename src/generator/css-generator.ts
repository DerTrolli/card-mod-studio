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

function accentColorDecls(s: AccentColorModuleState, cardType?: string): string[] {
  if (!s.enabled) return [];

  const value =
    s.mode === 'conditional'
      ? `{{ '${s.colorOn}' if is_state(${entityRef(s.entityId)}, 'on') else '${s.colorOff}' }}`
      : s.color;

  const decls = [`--accent-color: ${value};`];

  // Tile card: icon background/state color is driven by --tile-color
  if (cardType === 'tile') {
    decls.push(`--tile-color: ${value};`, `--state-icon-color: ${value};`);
  }

  // Thermostat cards use climate state color variables
  if (cardType === 'thermostat') {
    decls.push(
      `--state-climate-heat-color: ${value};`,
      `--state-climate-cool-color: ${value};`,
      `--state-climate-auto-color: ${value};`,
      `--state-climate-idle-color: ${value};`,
      `--control-circular-slider-color: ${value};`,
    );
  }

  // Gauge card uses its own color variable
  if (cardType === 'gauge') {
    decls.push(`--gauge-color: ${value};`);
  }

  // Button card (HA built-in) and generic entity-state cards
  if (!['tile', 'thermostat', 'gauge', 'heading'].includes(cardType ?? '')) {
    decls.push(`--state-icon-color: ${value};`, `--paper-item-icon-active-color: ${value};`);
  }

  return decls;
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

function thresholdPropertyBlock(property: ThresholdProperty, jinja: string, borderWidth: number): string {
  switch (property) {
    case 'icon-color':
      return `ha-state-icon {\n  color: ${jinja} !important;\n}`;
    case 'background':
      return `ha-card {\n  background: ${jinja};\n}`;
    case 'text-color':
      return `ha-card {\n  color: ${jinja};\n}`;
    case 'accent-color':
      return `ha-card {\n  --accent-color: ${jinja};\n}`;
    case 'border-color':
      return `ha-card {\n  border: ${borderWidth}px solid ${jinja};\n}`;
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
function thresholdBlock(s: ThresholdModuleState | undefined): string {
  if (!s || !s.enabled || !s.entityId || s.rules.length === 0 || s.properties.length === 0) return '';

  const jinja = buildThresholdJinja(s.rules, s.defaultColor, s.entityId);
  return s.properties
    .map((property) => thresholdPropertyBlock(property, jinja, s.borderWidth ?? 2))
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

  // Skip icon-color module when threshold is already driving icon color — both
  // emit ha-state-icon { color } and the second block would silently win.
  const iconColor = thresholdProps.has('icon-color') ? '' : iconColorBlock(state.iconColor);
  if (iconColor) parts.push(iconColor);

  const threshold = thresholdBlock(state.threshold);
  if (threshold) parts.push(threshold);

  const headingStyle = headingStyleBlocks(state.headingStyle);
  if (headingStyle) parts.push(headingStyle);

  if (state.advanced.rawCss.trim()) {
    parts.push(state.advanced.rawCss.trim());
  }

  return parts.join('\n\n');
}

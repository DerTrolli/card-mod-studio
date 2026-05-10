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
} from '../types/index.js';

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

  const decls = [`--accent-color: ${s.color};`];

  // Tile card: icon background/state color is driven by --tile-color
  if (cardType === 'tile') {
    decls.push(`--tile-color: ${s.color};`, `--state-icon-color: ${s.color};`);
  }

  // Thermostat cards use climate state color variables
  if (cardType === 'thermostat') {
    decls.push(
      `--state-climate-heat-color: ${s.color};`,
      `--state-climate-cool-color: ${s.color};`,
      `--state-climate-auto-color: ${s.color};`,
      `--state-climate-idle-color: ${s.color};`,
      `--control-circular-slider-color: ${s.color};`,
    );
  }

  // Gauge card uses its own color variable
  if (cardType === 'gauge') {
    decls.push(`--gauge-color: ${s.color};`);
  }

  // Button card (HA built-in) and generic entity-state cards
  if (!['tile', 'thermostat', 'gauge', 'heading'].includes(cardType ?? '')) {
    decls.push(`--state-icon-color: ${s.color};`, `--paper-item-icon-active-color: ${s.color};`);
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
  const when = s.applyWhen === 'on' ? 'on' : 'off';
  return [
    `background: {{ '${bgValue}' if is_state(config.entity, '${when}') else 'none' }};`,
  ];
}

function borderDecls(s: BorderModuleState): string[] {
  if (!s.enabled) return [];
  const decls: string[] = [];
  if (s.radiusPx > 0) decls.push(`border-radius: ${s.radiusPx}px;`);
  if (s.borderWidth > 0) decls.push(`border: ${s.borderWidth}px solid ${s.borderColor};`);
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

  const iconDecls = [
    `--mdc-icon-size: ${s.iconSize}px;`,
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

  if (s.mode === 'light') {
    const jinja =
      `{{ 'rgb(' ~ (state_attr(config.entity, 'rgb_color') | join(', ')) ~ ')' ` +
      `if is_state(config.entity, 'on') and state_attr(config.entity, 'rgb_color') ` +
      `else '${s.colorOff}' }}`;
    return `ha-state-icon {\n  color: ${jinja} !important;\n}`;
  }

  // Conditional mode
  return (
    `ha-state-icon {\n` +
    `  color: {{ '${s.colorOn}' if is_state(config.entity, 'on') else '${s.colorOff}' }} !important;\n` +
    `}`
  );
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
  const firstOp = rules[0]?.operator ?? '>';
  const sortedRules = [...rules];
  if (firstOp === '>' || firstOp === '>=') {
    sortedRules.sort((a, b) => b.value - a.value);
  } else if (firstOp === '<' || firstOp === '<=') {
    sortedRules.sort((a, b) => a.value - b.value);
  }
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

function thresholdBlock(s: ThresholdModuleState | undefined): string {
  if (!s || !s.enabled || !s.entityId || s.rules.length === 0) return '';

  const jinja = buildThresholdJinja(s.rules, s.defaultColor, s.entityId);

  // Generate CSS based on property type
  switch (s.property) {
    case 'icon-color':
      return `ha-state-icon {\n  color: ${jinja} !important;\n}`;
    case 'background':
      return `ha-card {\n  background: ${jinja};\n}`;
    case 'text-color':
      return `ha-card {\n  color: ${jinja};\n}`;
    case 'accent-color':
      return `ha-card {\n  --accent-color: ${jinja};\n}`;
    case 'border-color':
      return `ha-card {\n  border: ${s.borderWidth ?? 2}px solid ${jinja};\n}`;
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateCss(state: StudioState, cardType?: string): string {
  const parts: string[] = [];

  const kf = animationKeyframes(state.animation);
  if (kf) parts.push(kf);

  // ha-card block
  const haCardDecls = [
    ...accentColorDecls(state.accentColor, cardType),
    ...filterDecls(state.filter),
    ...backgroundDecls(state.background),
    ...borderDecls(state.border),
    ...animationDecls(state.animation),
  ];
  if (haCardDecls.length > 0) {
    const body = haCardDecls.map((d) => `  ${d}`).join('\n');
    parts.push(`ha-card {\n${body}\n}`);
  }

  // Skip icon-color module when threshold is already driving icon color — both
  // emit ha-state-icon { color } and the second block would silently win.
  const thresholdOwnsIconColor =
    state.threshold.enabled && state.threshold.property === 'icon-color';
  const iconColor = thresholdOwnsIconColor ? '' : iconColorBlock(state.iconColor);
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

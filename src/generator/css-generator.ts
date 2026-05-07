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

function iconColorBlock(s: IconColorModuleState, cardType?: string): string {
  if (!s.enabled) return '';

  // Sensor cards use CSS variable approach
  const useCssVar = cardType === 'sensor' || cardType === 'entity';

  if (s.mode === 'plain') {
    if (useCssVar) {
      return `:host {\n  --paper-item-icon-color: ${s.color};\n}`;
    }
    return `ha-state-icon {\n  color: ${s.color} !important;\n}`;
  }

  // Conditional mode
  if (useCssVar) {
    return (
      `:host {\n` +
      `  --paper-item-icon-color: {{ '${s.colorOn}' if is_state(config.entity, 'on') else '${s.colorOff}' }};\n` +
      `}`
    );
  }
  return (
    `ha-state-icon {\n` +
    `  color: {{ '${s.colorOn}' if is_state(config.entity, 'on') else '${s.colorOff}' }} !important;\n` +
    `}`
  );
}

function thresholdBlock(s: ThresholdModuleState | undefined, cardType?: string): string {
  if (!s || !s.enabled || !s.entityId || s.rules.length === 0) return '';

  // Build nested Jinja2 ternary expression
  // {{ '#blue' if states('sensor.temp') | float(0) < 18 else ('#red' if ... else '#default') }}

  const stateExpr = `states('${s.entityId}') | float(0)`;

  let jinja = '{{ ';
  for (let i = 0; i < s.rules.length; i++) {
    const rule = s.rules[i];
    if (i > 0) jinja += ' else (';
    jinja += `'${rule.color}' if ${stateExpr} ${rule.operator} ${rule.value}`;
  }
  jinja += ` else '${s.defaultColor}'`;
  jinja += ')'.repeat(s.rules.length - 1);
  jinja += ' }}';

  // Generate CSS based on property type
  switch (s.property) {
    case 'icon-color': {
      const useCssVar = cardType === 'sensor' || cardType === 'entity';
      if (useCssVar) {
        return `:host {\n  --paper-item-icon-color: ${jinja};\n}`;
      }
      return `ha-state-icon {\n  color: ${jinja} !important;\n}`;
    }
    case 'background':
      return `ha-card {\n  background: ${jinja};\n}`;
    case 'text-color':
      return `ha-card {\n  color: ${jinja};\n}`;
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

  const iconColor = iconColorBlock(state.iconColor, cardType);
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

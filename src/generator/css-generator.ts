/**
 * css-generator.ts
 *
 * Converts a StudioState into a CSS string suitable for card_mod.style.
 *
 * Output contract
 * ---------------
 * - ha-card properties: filter, transition, background, border-radius, border,
 *   animation, background-size (gradient-shift only)
 * - ha-state-icon properties: color
 * - @keyframes blocks appear before the ha-card selector block
 * - rawCss from the Advanced module is appended verbatim at the end
 *
 * Round-trip guarantee: generateCss(mapToStudioState(parseCss(css))) should
 * produce semantically equivalent CSS for all patterns we recognise.
 */

import type {
  StudioState,
  FilterModuleState,
  IconColorModuleState,
  BackgroundModuleState,
  AnimationModuleState,
  BorderModuleState,
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
  100% { background-position: 100% center; }
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

  if (s.grayscaleWhenOff) {
    const offParts = ['grayscale(100%)'];
    const onParts: string[] = [];
    if (s.brightness !== 100) {
      offParts.push(`brightness(${s.brightness}%)`);
      onParts.push(`brightness(${s.brightness}%)`);
    }
    if (s.blur > 0) {
      offParts.push(`blur(${s.blur}px)`);
      onParts.push(`blur(${s.blur}px)`);
    }
    const offVal = offParts.join(' ');
    const onVal = onParts.length > 0 ? onParts.join(' ') : 'none';
    decls.push(
      `filter: {{ '${offVal}' if is_state(config.entity, 'off') else '${onVal}' }};`,
    );
  } else {
    const parts: string[] = [];
    if (s.brightness !== 100) parts.push(`brightness(${s.brightness}%)`);
    if (s.blur > 0) parts.push(`blur(${s.blur}px)`);
    if (parts.length > 0) decls.push(`filter: ${parts.join(' ')};`);
  }

  // Only emit transition when there is actually a filter to transition
  if (decls.length > 0) {
    decls.push(`transition: filter ${s.transitionMs}ms ease;`);
  }

  return decls;
}

function backgroundDecls(s: BackgroundModuleState): string[] {
  if (!s.enabled) return [];

  const bgValue =
    s.type === 'gradient'
      ? `linear-gradient(${s.angle}deg, ${s.color1}, ${s.color2})`
      : s.color1;

  if (s.applyWhen === 'always') {
    return [`background: ${bgValue};`];
  }
  const state = s.applyWhen === 'on' ? 'on' : 'off';
  return [
    `background: {{ '${bgValue}' if is_state(config.entity, '${state}') else 'none' }};`,
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

  // gradient-shift requires a wide background-size so the position can animate
  if (s.preset === 'gradient-shift') {
    decls.push('background-size: 200% auto;');
  }

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

function iconColorBlock(s: IconColorModuleState): string {
  if (!s.enabled) return '';
  return (
    `ha-state-icon {\n` +
    `  color: {{ '${s.colorOn}' if is_state(config.entity, 'on') else '${s.colorOff}' }} !important;\n` +
    `}`
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts a full StudioState to a CSS string ready for card_mod.style.
 * Returns an empty string when no module is enabled and rawCss is empty.
 */
export function generateCss(state: StudioState): string {
  const parts: string[] = [];

  // @keyframes must appear before the selector block that references them
  const kf = animationKeyframes(state.animation);
  if (kf) parts.push(kf);

  // ha-card block
  const haCardDecls = [
    ...filterDecls(state.filter),
    ...backgroundDecls(state.background),
    ...borderDecls(state.border),
    ...animationDecls(state.animation),
  ];
  if (haCardDecls.length > 0) {
    const body = haCardDecls.map((d) => `  ${d}`).join('\n');
    parts.push(`ha-card {\n${body}\n}`);
  }

  // ha-state-icon block
  const iconColor = iconColorBlock(state.iconColor);
  if (iconColor) parts.push(iconColor);

  // Unclaimed / user-edited raw CSS — appended verbatim
  if (state.advanced.rawCss.trim()) {
    parts.push(state.advanced.rawCss.trim());
  }

  return parts.join('\n\n');
}

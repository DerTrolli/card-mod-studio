/**
 * state-mapper.ts
 *
 * Converts a parsed CardModStyleState into a StudioState by recognising the
 * CSS patterns that our own generator produces.
 *
 * Design rules
 * ------------
 * 1. Only patterns we generate ourselves (deterministic, known structure) are
 *    recognised.  Anything else goes into the Advanced module's rawCss so the
 *    user always sees exactly what card-mod will apply.
 * 2. Each recogniser "claims" the CSS properties it consumed.  Unclaimed
 *    properties are reconstructed into rawCss — this prevents double-emitting
 *    the same property when we re-generate CSS from the StudioState.
 */

import type {
  CardModStyleState,
  CssTarget,
  CssProperty,
  FilterModuleState,
  IconColorModuleState,
  BackgroundModuleState,
  BorderModuleState,
  AdvancedModuleState,
  StudioState,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Default states
// ---------------------------------------------------------------------------

export const DEFAULT_FILTER: FilterModuleState = {
  enabled: false,
  grayscaleWhenOff: false,
  brightness: 100,
  blur: 0,
  transitionMs: 300,
};

export const DEFAULT_ICON_COLOR: IconColorModuleState = {
  enabled: false,
  colorOn: '#2196F3',
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

// ---------------------------------------------------------------------------
// Claimed-property tracking
// ---------------------------------------------------------------------------

/** Canonical key for a selector+property pair, used to track claimed props. */
function claimKey(selector: string, property: string): string {
  return `${selector.trim().toLowerCase()}::${property.trim().toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function mapToStudioState(parsed: CardModStyleState): StudioState {
  const haCard = findTarget(parsed.targets, 'ha-card');
  const haStateIcon = findTarget(parsed.targets, 'ha-state-icon');

  // All recognisers share this set and add entries as they consume properties.
  const claimed = new Set<string>();

  return {
    filter: mapFilter(haCard, claimed),
    iconColor: mapIconColor(haStateIcon, claimed),
    background: mapBackground(haCard, claimed),
    animation: { ...DEFAULT_ANIMATION },
    border: mapBorder(haCard, claimed),
    advanced: mapAdvanced(parsed, claimed),
  };
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
    // Grayscale-when-off: off-value starts with "grayscale(", on-value is "none"
    if (
      filterProp.hasCondition &&
      filterProp.offValue?.trim().startsWith('grayscale(') &&
      filterProp.onValue?.trim() === 'none'
    ) {
      state.enabled = true;
      state.grayscaleWhenOff = true;
      filterClaimed = true;
    }

    // Brightness — check on/off values first, then plain value
    const brightnessSource =
      filterProp.onValue ?? filterProp.offValue ?? filterProp.value;
    const brightnessMatch = brightnessSource.match(
      /brightness\(\s*(\d+(?:\.\d+)?)%\s*\)/,
    );
    if (brightnessMatch) {
      state.enabled = true;
      state.brightness = parseFloat(brightnessMatch[1]);
      filterClaimed = true;
    }

    // Blur — same source priority
    const blurSource = filterProp.onValue ?? filterProp.offValue ?? filterProp.value;
    const blurMatch = blurSource.match(/blur\(\s*(\d+(?:\.\d+)?)px\s*\)/);
    if (blurMatch) {
      state.enabled = true;
      state.blur = parseFloat(blurMatch[1]);
      filterClaimed = true;
    }

    if (filterClaimed) {
      claimed.add(claimKey(haCard.selector, 'filter'));
    }
  }

  if (transitionProp) {
    // Claim transition only when it's a filter/all transition we can round-trip
    if (
      transitionProp.value.includes('filter') ||
      transitionProp.value.includes('all')
    ) {
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
  if (!colorProp?.hasCondition) return { ...DEFAULT_ICON_COLOR };

  claimed.add(claimKey(haStateIcon.selector, 'color'));

  return {
    enabled: true,
    colorOn: colorProp.onValue ?? DEFAULT_ICON_COLOR.colorOn,
    colorOff: colorProp.offValue ?? DEFAULT_ICON_COLOR.colorOff,
  };
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
  if (!bgProp || bgProp.hasCondition) return { ...DEFAULT_BACKGROUND };

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
    return {
      ...DEFAULT_BACKGROUND,
      enabled: true,
      type: 'solid',
      color1: value,
    };
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
      // match[1]=width, match[2]=style keyword, match[3]=color
      state.enabled = true;
      state.borderWidth = parseInt(match[1], 10);
      state.borderColor = match[3];
      claimed.add(claimKey(haCard.selector, 'border'));
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// Advanced module — unclaimed CSS remainder
// ---------------------------------------------------------------------------

function mapAdvanced(
  parsed: CardModStyleState,
  claimed: Set<string>,
): AdvancedModuleState {
  const parts: string[] = [];

  for (const target of parsed.targets) {
    const unclaimed = target.properties.filter(
      (p) => !claimed.has(claimKey(target.selector, p.property)),
    );
    if (unclaimed.length > 0) {
      const decls = unclaimed.map((p) => `  ${p.property}: ${p.value};`).join('\n');
      parts.push(`${target.selector} {\n${decls}\n}`);
    }
  }

  return { rawCss: parts.join('\n\n') };
}

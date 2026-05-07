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
  AdvancedModuleState,
  StudioState,
} from '../types/index.js';

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
  color: '#03a9f4',
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

function claimKey(selector: string, property: string): string {
  return `${selector.trim().toLowerCase()}::${property.trim().toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function mapToStudioState(parsed: CardModStyleState): StudioState {
  const haCard = findTarget(parsed.targets, 'ha-card');
  const haStateIcon = findTarget(parsed.targets, 'ha-state-icon');

  const claimed = new Set<string>();

  return {
    filter: mapFilter(haCard, claimed),
    iconColor: mapIconColor(haStateIcon, claimed),
    accentColor: mapAccentColor(haCard, claimed),
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
    if (filterProp.hasCondition) {
      // Conditional grayscale — detect which state triggers grayscale
      const offHasGrayscale = filterProp.offValue?.trim().startsWith('grayscale(');
      const onHasGrayscale = filterProp.onValue?.trim().startsWith('grayscale(');

      if (offHasGrayscale && filterProp.onValue?.trim() === 'none') {
        // grayscale when off, none when on
        state.enabled = true;
        state.grayscale = true;
        state.grayscaleWhen = 'off';
        filterClaimed = true;
      } else if (onHasGrayscale && filterProp.offValue?.trim() === 'none') {
        // grayscale when on, none when off
        state.enabled = true;
        state.grayscale = true;
        state.grayscaleWhen = 'on';
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

  if (transitionProp) {
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

  claimed.add(claimKey(haStateIcon.selector, 'color'));

  if (colorProp.hasCondition && colorProp.onValue && colorProp.offValue) {
    // Jinja2 on/off conditional — map to conditional mode
    return {
      enabled: true,
      mode: 'conditional',
      color: colorProp.onValue,
      colorOn: colorProp.onValue,
      colorOff: colorProp.offValue,
    };
  }

  // Plain static color (e.g. "color: yellow !important" — !important stripped by parser)
  if (!colorProp.hasCondition && colorProp.value.trim()) {
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
  claimed: Set<string>,
): AccentColorModuleState {
  if (!haCard) return { ...DEFAULT_ACCENT_COLOR };

  const prop = findProp(haCard, '--accent-color');
  if (!prop || prop.hasCondition) return { ...DEFAULT_ACCENT_COLOR };

  const value = prop.value.trim();
  if (!value) return { ...DEFAULT_ACCENT_COLOR };

  claimed.add(claimKey(haCard.selector, '--accent-color'));
  return { enabled: true, color: value };
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

/**
 * state-mapper.ts
 *
 * Converts a parsed CardModStyleState into a partial StudioState by
 * recognising the CSS patterns that our own generator (Phase 4) produces.
 *
 * Design rule
 * -----------
 * We only recognise patterns that are deterministic and that we generate
 * ourselves. Anything we don't recognise is left at its default value in
 * the returned state — the raw CSS is preserved in the Advanced module so
 * the user always sees exactly what card-mod will apply.
 *
 * If new modules are added in Phase 3/4, add a corresponding recogniser
 * function here following the same pattern.
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
// Default states — returned when no matching pattern is found
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
// Public API
// ---------------------------------------------------------------------------

/**
 * Maps a parsed CardModStyleState to a partial StudioState.
 * Only recognised patterns are populated; everything else uses defaults.
 */
export function mapToStudioState(parsed: CardModStyleState): StudioState {
  const haCard = findTarget(parsed.targets, 'ha-card');
  const haStateIcon = findTarget(parsed.targets, 'ha-state-icon');

  return {
    filter: mapFilter(haCard),
    iconColor: mapIconColor(haStateIcon),
    background: mapBackground(haCard),
    animation: { ...DEFAULT_ANIMATION },
    border: mapBorder(haCard),
    advanced: mapAdvanced(parsed),
  };
}

// ---------------------------------------------------------------------------
// Target lookup
// ---------------------------------------------------------------------------

/**
 * Finds a target by its selector (case-insensitive, trims whitespace).
 * Returns null if not found.
 */
function findTarget(targets: CssTarget[], selector: string): CssTarget | null {
  const normalised = selector.trim().toLowerCase();
  return (
    targets.find((t) => t.selector.trim().toLowerCase() === normalised) ?? null
  );
}

/**
 * Finds a property by name within a target (case-insensitive).
 */
function findProp(target: CssTarget, property: string): CssProperty | null {
  const normalised = property.trim().toLowerCase();
  return target.properties.find((p) => p.property === normalised) ?? null;
}

// ---------------------------------------------------------------------------
// Filter module recogniser
// ---------------------------------------------------------------------------

/**
 * Recognises filter patterns on ha-card:
 *
 *   grayscaleWhenOff — filter value is a conditional Jinja2 whose off-value
 *                      starts with "grayscale(" and on-value is "none"
 *
 *   brightness       — filter value contains brightness(N%)
 *
 *   transitionMs     — transition property includes "filter" with a duration
 */
function mapFilter(haCard: CssTarget | null): FilterModuleState {
  if (!haCard) return { ...DEFAULT_FILTER };

  const filterProp = findProp(haCard, 'filter');
  const transitionProp = findProp(haCard, 'transition');

  const state: FilterModuleState = { ...DEFAULT_FILTER };

  if (filterProp) {
    // Grayscale when off: off-value starts with "grayscale(" and on-value is "none"
    if (
      filterProp.hasCondition &&
      filterProp.offValue?.trim().startsWith('grayscale(') &&
      filterProp.onValue?.trim() === 'none'
    ) {
      state.enabled = true;
      state.grayscaleWhenOff = true;
    }

    // Brightness: look for brightness(N%) in either the plain value or the on/off values
    const brightnessSource =
      filterProp.onValue ?? filterProp.offValue ?? filterProp.value;
    const brightnessMatch = brightnessSource.match(/brightness\(\s*(\d+(?:\.\d+)?)%\s*\)/);
    if (brightnessMatch) {
      state.enabled = true;
      state.brightness = parseFloat(brightnessMatch[1]);
    }

    // Blur: check the same sources as brightness — on/off values first, then raw value.
    const blurSource = filterProp.onValue ?? filterProp.offValue ?? filterProp.value;
    const blurMatch = blurSource.match(/blur\(\s*(\d+(?:\.\d+)?)px\s*\)/);
    if (blurMatch) {
      state.enabled = true;
      state.blur = parseFloat(blurMatch[1]);
    }
  }

  if (transitionProp) {
    // Look for a duration in a transition that includes "filter"
    // Handles: "filter 0.3s ease", "all 0.3s ease", "filter 300ms linear"
    if (transitionProp.value.includes('filter') || transitionProp.value.includes('all')) {
      const msMatch = transitionProp.value.match(/(\d+)ms/);
      const sMatch = transitionProp.value.match(/(\d*\.?\d+)s(?:\s|$|,)/);
      if (msMatch) {
        state.transitionMs = parseInt(msMatch[1], 10);
      } else if (sMatch) {
        state.transitionMs = Math.round(parseFloat(sMatch[1]) * 1000);
      }
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// Icon color module recogniser
// ---------------------------------------------------------------------------

/**
 * Recognises color patterns on ha-state-icon:
 *
 *   colorOn / colorOff — color property is a conditional Jinja2 expression
 *                        whose on/off values are hex colours
 */
function mapIconColor(haStateIcon: CssTarget | null): IconColorModuleState {
  if (!haStateIcon) return { ...DEFAULT_ICON_COLOR };

  const colorProp = findProp(haStateIcon, 'color');
  if (!colorProp?.hasCondition) return { ...DEFAULT_ICON_COLOR };

  return {
    enabled: true,
    colorOn: colorProp.onValue ?? DEFAULT_ICON_COLOR.colorOn,
    colorOff: colorProp.offValue ?? DEFAULT_ICON_COLOR.colorOff,
  };
}

// ---------------------------------------------------------------------------
// Background module recogniser
// ---------------------------------------------------------------------------

/**
 * Recognises background patterns on ha-card:
 *
 *   solid    — background is a plain color value
 *   gradient — background is linear-gradient(Ndeg, COLOR1, COLOR2)
 */
function mapBackground(haCard: CssTarget | null): BackgroundModuleState {
  if (!haCard) return { ...DEFAULT_BACKGROUND };

  const bgProp = findProp(haCard, 'background');
  if (!bgProp || bgProp.hasCondition) return { ...DEFAULT_BACKGROUND };

  const value = bgProp.value.trim();

  // Gradient: linear-gradient(Ndeg, color1, color2)
  const gradientMatch = value.match(
    /^linear-gradient\(\s*(\d+)deg\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i,
  );
  if (gradientMatch) {
    return {
      enabled: true,
      type: 'gradient',
      color1: gradientMatch[2].trim(),
      color2: gradientMatch[3].trim(),
      angle: parseInt(gradientMatch[1], 10),
      applyWhen: 'always',
    };
  }

  // Solid: any other non-empty value that doesn't look like a URL or complex expression
  if (value && !value.includes('url(') && !value.includes('{{')) {
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
// Border module recogniser
// ---------------------------------------------------------------------------

/**
 * Recognises border-radius and border properties on ha-card.
 */
function mapBorder(haCard: CssTarget | null): BorderModuleState {
  if (!haCard) return { ...DEFAULT_BORDER };

  const radiusProp = findProp(haCard, 'border-radius');
  const borderProp = findProp(haCard, 'border');

  const state: BorderModuleState = { ...DEFAULT_BORDER };

  if (radiusProp && !radiusProp.hasCondition) {
    const match = radiusProp.value.match(/^(\d+(?:\.\d+)?)px$/);
    if (match) {
      state.enabled = true;
      state.radiusPx = parseFloat(match[1]);
    }
  }

  if (borderProp && !borderProp.hasCondition) {
    // Minimal parsing: "2px solid #color" — use explicit border-style keywords
    // so that only valid CSS (e.g. "solid", "dashed") is accepted, and match
    // is case-insensitive for both style keyword and color name.
    const match = borderProp.value.match(
      /^(\d+)px\s+(solid|dashed|dotted|double|groove|ridge|inset|outset|none)\s+(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/i,
    );
    if (match) {
      // match[1]=width, match[2]=style keyword, match[3]=color
      state.enabled = true;
      state.borderWidth = parseInt(match[1], 10);
      state.borderColor = match[3];
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// Advanced module — captures everything we couldn't parse structurally
// ---------------------------------------------------------------------------

/**
 * The Advanced module always gets the full raw CSS so the user can see and
 * edit anything that the visual modules don't cover.
 */
function mapAdvanced(parsed: CardModStyleState): AdvancedModuleState {
  return { rawCss: parsed.rawCss };
}

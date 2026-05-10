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
  AnimationModuleState,
  ThresholdModuleState,
  ThresholdRule,
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

export const DEFAULT_HEADING_STYLE: HeadingStyleModuleState = {
  enabled: false,
  fontSize: 24,
  textColor: '#e1e1e1',
  iconSize: 24,
  iconColor: '#e1e1e1',
  alignment: 'left',
};

export const DEFAULT_THRESHOLD: ThresholdModuleState = {
  enabled: false,
  entityId: '',
  property: 'icon-color',
  rules: [],
  defaultColor: '#888888',
};

// ---------------------------------------------------------------------------
// Claimed-property tracking
// ---------------------------------------------------------------------------

function claimKey(selector: string, property: string): string {
  return `${selector.trim().toLowerCase()}::${property.trim().toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Animation module
// ---------------------------------------------------------------------------

function mapAnimation(
  haCard: CssTarget | null,
  claimed: Set<string>,
): AnimationModuleState {
  if (!haCard) return { ...DEFAULT_ANIMATION };

  const animProp = findProp(haCard, 'animation');
  if (!animProp) return { ...DEFAULT_ANIMATION };

  // Pattern: cms-{preset} {speed}s ease-in-out infinite
  const ANIM_PATTERN = /^cms-(pulse|breathe|gradient-shift|blink|bounce)\s+([\d.]+)s\s+ease-in-out\s+infinite$/;

  // Parse unconditional animation (trigger=always)
  if (!animProp.hasCondition) {
    const match = animProp.value.match(ANIM_PATTERN);
    if (match) {
      claimed.add(claimKey(haCard.selector, 'animation'));
      return {
        enabled: true,
        preset: match[1] as 'pulse' | 'breathe' | 'gradient-shift' | 'blink' | 'bounce',
        speedS: parseFloat(match[2]),
        trigger: 'always',
      };
    }
  } else {
    // Parse conditional animation (trigger=on/off)
    const onValue = animProp.onValue?.trim() || '';
    const offValue = animProp.offValue?.trim() || '';

    // Check which value has the animation
    const animValue = onValue.match(ANIM_PATTERN) ? onValue :
                      offValue.match(ANIM_PATTERN) ? offValue : null;

    if (animValue) {
      const match = animValue.match(ANIM_PATTERN);
      if (match) {
        claimed.add(claimKey(haCard.selector, 'animation'));

        // Determine trigger: if animation is in onValue, trigger is 'on'
        const trigger = onValue.match(ANIM_PATTERN) ? 'on' : 'off';

        return {
          enabled: true,
          preset: match[1] as 'pulse' | 'breathe' | 'gradient-shift' | 'blink' | 'bounce',
          speedS: parseFloat(match[2]),
          trigger: trigger as 'on' | 'off',
        };
      }
    }
  }

  return { ...DEFAULT_ANIMATION };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function mapToStudioState(parsed: CardModStyleState): StudioState {
  const haCard = findTarget(parsed.targets, 'ha-card');
  const haStateIcon = findTarget(parsed.targets, 'ha-state-icon');
  const titleP = findTarget(parsed.targets, '.title p');
  const titleIcon = findTarget(parsed.targets, '.title ha-icon');
  const container = findTarget(parsed.targets, '.container');

  const claimed = new Set<string>();

  return {
    filter: mapFilter(haCard, claimed),
    iconColor: mapIconColor(haStateIcon, claimed),
    accentColor: mapAccentColor(haCard, claimed),
    background: mapBackground(haCard, claimed),
    animation: mapAnimation(haCard, claimed),
    border: mapBorder(haCard, claimed),
    headingStyle: mapHeadingStyle(titleP, titleIcon, container, claimed),
    threshold: mapThreshold(haCard, haStateIcon, claimed),
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

  // Light mode — contains rgb_color attribute access
  if (colorProp.hasCondition && colorProp.value.includes('rgb_color')) {
    const fallbackMatch = colorProp.value.match(/else\s+'([^']+)'/);
    const colorOff = fallbackMatch ? fallbackMatch[1] : DEFAULT_ICON_COLOR.colorOff;
    return {
      enabled: true,
      mode: 'light',
      color: colorOff,
      colorOn: colorOff,
      colorOff,
    };
  }

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
  if (!bgProp) return { ...DEFAULT_BACKGROUND };

  // Conditional background: {{ 'color' if is_state(..., 'on'/'off') else 'none' }}
  if (bgProp.hasCondition && bgProp.onValue !== undefined && bgProp.offValue !== undefined) {
    const onVal = bgProp.onValue.trim();
    const offVal = bgProp.offValue.trim();
    let applyWhen: 'on' | 'off' | null = null;
    let colorVal = '';
    if (offVal === 'none' && onVal && onVal !== 'none') {
      applyWhen = 'on';
      colorVal = onVal;
    } else if (onVal === 'none' && offVal && offVal !== 'none') {
      applyWhen = 'off';
      colorVal = offVal;
    }
    if (applyWhen && colorVal) {
      claimed.add(claimKey(haCard.selector, 'background'));
      const gradientMatch = colorVal.match(
        /^linear-gradient\(\s*(\d+)deg\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i,
      );
      if (gradientMatch) {
        return {
          enabled: true, type: 'gradient',
          color1: gradientMatch[2].trim(), color2: gradientMatch[3].trim(),
          angle: parseInt(gradientMatch[1], 10), applyWhen,
        };
      }
      return { ...DEFAULT_BACKGROUND, enabled: true, type: 'solid', color1: colorVal, applyWhen };
    }
    return { ...DEFAULT_BACKGROUND };
  }

  if (bgProp.hasCondition) return { ...DEFAULT_BACKGROUND };

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
  claimed: Set<string>,
): HeadingStyleModuleState {
  if (!titleP && !titleIcon && !container) return { ...DEFAULT_HEADING_STYLE };

  const state: HeadingStyleModuleState = { ...DEFAULT_HEADING_STYLE };

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
// Threshold module
// ---------------------------------------------------------------------------

function parseThresholdJinja(value: string): {
  entityId: string;
  rules: ThresholdRule[];
  defaultColor: string;
} | null {
  if (!value.includes('float(0)')) return null;

  const RULE_RE =
    /'(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)'\s+if\s+states\('([^']+)'\)\s*\|\s*float\(0\)\s*(>=|<=|>|<|==|!=)\s*([\d.]+(?:\.\d+)?)/g;
  const DEFAULT_RE = /else\s+'(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)'\s*[)}\s]/;

  const rules: ThresholdRule[] = [];
  let entityId = '';
  let idx = 0;
  let match: RegExpExecArray | null;

  while ((match = RULE_RE.exec(value)) !== null) {
    const [, color, entity, operator, numStr] = match;
    entityId = entity;
    rules.push({
      id: String(idx++),
      operator: operator as ThresholdRule['operator'],
      value: parseFloat(numStr),
      color,
    });
  }

  if (rules.length === 0 || !entityId) return null;

  const defaultMatch = DEFAULT_RE.exec(value);
  const defaultColor = defaultMatch ? defaultMatch[1] : DEFAULT_THRESHOLD.defaultColor;

  return { entityId, rules, defaultColor };
}

function mapThreshold(
  haCard: CssTarget | null,
  haStateIcon: CssTarget | null,
  claimed: Set<string>,
): ThresholdModuleState {
  type Candidate = {
    target: CssTarget;
    cssProperty: string;
    thresholdProperty: ThresholdModuleState['property'];
  };

  const candidates: Candidate[] = [];

  if (haCard) {
    const bgProp = findProp(haCard, 'background');
    if (bgProp?.hasCondition && !bgProp.onValue)
      candidates.push({ target: haCard, cssProperty: 'background', thresholdProperty: 'background' });

    const colorProp = findProp(haCard, 'color');
    if (colorProp?.hasCondition && !colorProp.onValue)
      candidates.push({ target: haCard, cssProperty: 'color', thresholdProperty: 'text-color' });

    const accentProp = findProp(haCard, '--accent-color');
    if (accentProp?.hasCondition && !accentProp.onValue)
      candidates.push({ target: haCard, cssProperty: '--accent-color', thresholdProperty: 'accent-color' });

    const borderColorProp = findProp(haCard, 'border-color');
    if (borderColorProp?.hasCondition && !borderColorProp.onValue)
      candidates.push({ target: haCard, cssProperty: 'border-color', thresholdProperty: 'border-color' });

    // Also recognise "border: 2px solid {{ jinja }}" shorthand
    const borderShorthandProp = findProp(haCard, 'border');
    if (borderShorthandProp?.hasCondition && !borderShorthandProp.onValue)
      candidates.push({ target: haCard, cssProperty: 'border', thresholdProperty: 'border-color' });
  }

  if (haStateIcon) {
    const colorProp = findProp(haStateIcon, 'color');
    if (colorProp?.hasCondition && !colorProp.onValue)
      candidates.push({ target: haStateIcon, cssProperty: 'color', thresholdProperty: 'icon-color' });
  }

  for (const { target, cssProperty, thresholdProperty } of candidates) {
    const prop = findProp(target, cssProperty)!;
    const parsed = parseThresholdJinja(prop.value);
    if (parsed) {
      claimed.add(claimKey(target.selector, cssProperty));
      // For "border: 2px solid {{ ... }}" extract the width from the leading non-Jinja part
      let borderWidth: number | undefined;
      if (cssProperty === 'border') {
        const bwMatch = prop.value.match(/^(\d+)px/);
        borderWidth = bwMatch ? parseInt(bwMatch[1], 10) : 2;
      }
      return {
        enabled: true,
        entityId: parsed.entityId,
        property: thresholdProperty,
        rules: parsed.rules,
        defaultColor: parsed.defaultColor,
        ...(borderWidth !== undefined ? { borderWidth } : {}),
      };
    }
  }

  return { ...DEFAULT_THRESHOLD };
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

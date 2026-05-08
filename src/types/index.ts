/**
 * Shared TypeScript interfaces for Card-Mod Studio.
 * All public-facing types live here so they can be imported by any module.
 */

// ---------------------------------------------------------------------------
// Home Assistant ambient types
// These mirror the shapes HA passes to custom cards without requiring the
// full @home-assistant/frontend dependency (not published to npm).
// ---------------------------------------------------------------------------

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  language: string;
  locale: { language: string };
  themes: unknown;
  user: { name: string; is_admin: boolean };
  callService(domain: string, service: string, data?: Record<string, unknown>): Promise<void>;
}

export interface LovelaceCardConfig {
  type: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Card-Mod Studio internal state types
// ---------------------------------------------------------------------------

/** The top-level config that card-mod reads from a card's YAML. */
export interface CardModConfig {
  style?: string | Record<string, string>;
}

/** A card config that may include a card_mod block. */
export interface CardModCardConfig extends LovelaceCardConfig {
  card_mod?: CardModConfig;
}

/**
 * Internal representation of a CSS property that may have a Jinja2 condition.
 */
export interface CssProperty {
  property: string;
  value: string;
  /** True when the value contains a Jinja2 {{ ... }} expression. */
  hasCondition: boolean;
  /** On-state value when hasCondition is true. */
  onValue?: string;
  /** Off-state value when hasCondition is true. */
  offValue?: string;
}

/** CSS target block — one selector with its properties. */
export interface CssTarget {
  selector: string;
  properties: CssProperty[];
}

/**
 * The parsed representation of a card_mod style block.
 * This is what all modules read from and write to.
 */
export interface CardModStyleState {
  targets: CssTarget[];
  /** Raw CSS that could not be parsed into structured targets. */
  rawCss: string;
}

// ---------------------------------------------------------------------------
// Module state types
// Each visual module has its own state shape, all collected here.
// ---------------------------------------------------------------------------

export interface FilterModuleState {
  enabled: boolean;
  grayscale: boolean;
  grayscaleWhen: 'always' | 'on' | 'off';
  brightness: number;       // 0–200, default 100
  blur: number;             // px, default 0
  transitionMs: number;     // default 300
}

export interface IconColorModuleState {
  enabled: boolean;
  /** plain = single static color; conditional = on/off entity-state colors; light = use actual light rgb_color attribute */
  mode: 'plain' | 'conditional' | 'light';
  color: string;            // used when mode='plain'
  colorOn: string;          // used when mode='conditional'
  colorOff: string;         // used when mode='conditional'
}

export interface AccentColorModuleState {
  enabled: boolean;
  color: string;
}

export interface BackgroundModuleState {
  enabled: boolean;
  type: 'solid' | 'gradient';
  color1: string;
  color2: string;           // only for gradient
  angle: number;            // degrees, only for gradient
  applyWhen: 'always' | 'on' | 'off';
}

export interface AnimationModuleState {
  enabled: boolean;
  preset: 'pulse' | 'breathe' | 'gradient-shift' | 'bounce' | 'blink';
  speedS: number;           // seconds
  trigger: 'always' | 'on' | 'off' | 'custom';
  customEntity?: string;    // entity_id when trigger === 'custom'
}

export interface BorderModuleState {
  enabled: boolean;
  radiusPx: number;         // 0–50
  borderWidth: number;      // 0 = no border
  borderColor: string;
}

export interface AdvancedModuleState {
  rawCss: string;
}

export interface HeadingStyleModuleState {
  enabled: boolean;
  fontSize: number;        // px, 12–48
  textColor: string;       // CSS color for ha-card .title p
  iconSize: number;        // px for --mdc-icon-size on ha-card .title ha-icon
  iconColor: string;       // CSS color for ha-card .title ha-icon
  alignment: 'left' | 'center' | 'right';
}

export interface ThresholdRule {
  id: string;
  operator: '<' | '<=' | '>' | '>=' | '==' | '!=';
  value: number;
  color: string;
}

export interface ThresholdModuleState {
  enabled: boolean;
  entityId: string;
  property: 'icon-color' | 'background' | 'text-color' | 'accent-color' | 'border-color';
  rules: ThresholdRule[];
  defaultColor: string;
}

/** Aggregate state of the entire Style panel. */
export interface StudioState {
  filter: FilterModuleState;
  iconColor: IconColorModuleState;
  accentColor: AccentColorModuleState;
  background: BackgroundModuleState;
  animation: AnimationModuleState;
  border: BorderModuleState;
  headingStyle: HeadingStyleModuleState;
  threshold: ThresholdModuleState;
  advanced: AdvancedModuleState;
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/** Fired by cms-panel when the user changes any style setting. */
export interface StyleChangedDetail {
  config: CardModCardConfig;
}

// ---------------------------------------------------------------------------
// Injection / versioning
// ---------------------------------------------------------------------------

/** Metadata injected on the window so multiple versions can coexist. */
export interface CardModStudioMeta {
  version: string;
  injected: boolean;
}

declare global {
  interface Window {
    cardModStudio?: CardModStudioMeta;
    /** HA's custom card registry. */
    customCards?: Array<{ type: string; name: string; description: string }>;
  }
}

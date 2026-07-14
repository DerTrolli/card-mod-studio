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
  /** Backend config — components lists every loaded integration ('uix', ...). */
  config?: { components?: string[] };
  callService(domain: string, service: string, data?: Record<string, unknown>): Promise<void>;
  connection: {
    sendMessagePromise(msg: Record<string, unknown>): Promise<unknown>;
  };
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

/**
 * The top-level config that UIX (github.com/Lint-Free-Technology/uix) reads
 * from a card's YAML. UIX reads `uix` in preference to `card_mod` when both
 * are present, falling back to `card_mod` otherwise — see yaml-parser.ts.
 */
export interface UixConfig {
  style?: string | Record<string, string>;
  debug?: boolean;
  macros?: unknown;
  billets?: unknown;
  /** UIX-only per-card theme override — no card_mod equivalent exists
   *  (card-mod has `class:` but nothing that swaps the theme). */
  theme?: string;
  /** Adds a CSS class to the card; card-mod's `card_mod: class:` is the
   *  equivalent spelling, so this one IS portable across engines. */
  class?: string;
}

/** A card config that may include a card_mod and/or uix block. */
export interface CardModCardConfig extends LovelaceCardConfig {
  card_mod?: CardModConfig;
  uix?: UixConfig;
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
  /**
   * The entity_id an `is_state(...)` condition checks, when it's a literal
   * quoted entity rather than the card's own `config.entity`. Undefined
   * means "the card's own entity" — see entityRef() in css-generator.ts.
   */
  entityId?: string;
  /** True when the declaration carried `!important`. The flag (not the
   *  suffix) is stored so recognisers can match values without stripping
   *  it themselves; mapAdvanced re-appends it for unclaimed declarations
   *  so preserved CSS doesn't silently lose specificity on save. */
  important?: boolean;
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
  /** Valid-but-unmodelable blocks (@keyframes, @media, ...) preserved
   *  verbatim — mapAdvanced re-emits them so they survive a save. */
  passthroughCss?: string;
}

// ---------------------------------------------------------------------------
// Module state types
// Each visual module has its own state shape, all collected here.
// ---------------------------------------------------------------------------

export interface FilterModuleState {
  enabled: boolean;
  grayscale: boolean;
  grayscaleWhen: 'always' | 'on' | 'off' | 'custom';
  /** entity_id when grayscaleWhen === 'custom' — a different entity than the card's own. */
  customEntity?: string;
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
  /** Which entity's on/off state drives conditional/light mode. Empty/undefined = the card's own entity. */
  entityId?: string;
}

export interface AccentColorModuleState {
  enabled: boolean;
  /** plain = single static color; conditional = on/off entity-state colors */
  mode: 'plain' | 'conditional';
  color: string;            // used when mode='plain'
  colorOn: string;          // used when mode='conditional'
  colorOff: string;         // used when mode='conditional'
  /** Which entity's on/off state drives conditional mode. Empty/undefined = the card's own entity. */
  entityId?: string;
}

export interface BackgroundModuleState {
  enabled: boolean;
  type: 'solid' | 'gradient';
  color1: string;
  color2: string;           // only for gradient
  angle: number;            // degrees, only for gradient
  applyWhen: 'always' | 'on' | 'off' | 'custom';
  /** entity_id when applyWhen === 'custom' — a different entity than the card's own. */
  customEntity?: string;
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

export interface FontModuleState {
  enabled: boolean;
  fontSize: number;        // px, 10-48
  /** '' = leave the theme's font-family alone. */
  fontFamily: string;
  fontWeight: 'normal' | 'medium' | 'bold';
  color: string;
}

export interface ThresholdRule {
  id: string;
  operator: '<' | '<=' | '>' | '>=' | '==' | '!=';
  value: number;
  color: string;
}

export type ThresholdProperty =
  | 'icon-color'
  | 'background'
  | 'text-color'
  | 'accent-color'
  | 'border-color';

/** One value→color anchor point for gradient (fade) mode. Color is always hex — interpolation needs concrete RGB. */
export interface ColorStop {
  id: string;
  value: number;
  color: string;
}

export interface ThresholdModuleState {
  enabled: boolean;
  entityId: string;
  /**
   * Every property these rules drive, all sharing the same entity/rules/
   * default color — e.g. icon AND accent color changing together off one
   * threshold. Each selected property gets its own generated CSS block.
   */
  properties: ThresholdProperty[];
  /**
   * switch = discrete step rules (original behavior): first matching rule
   * wins, everything else falls to defaultColor.
   * gradient = smoothly fades between colorStops, clamped at the ends.
   * Both modes share entityId/properties above.
   */
  valueMode: 'switch' | 'gradient';
  // switch mode
  rules: ThresholdRule[];
  defaultColor: string;
  // gradient mode — at least 2 stops, sorted by value ascending
  colorStops: ColorStop[];
  /** Border width in px — only used when properties includes 'border-color'. Defaults to 2. */
  borderWidth?: number;
}

// ---------------------------------------------------------------------------
// Entities card per-row style types
// ---------------------------------------------------------------------------

export interface EntitiesRowStyle {
  iconColor: string;            // static icon color; '' = not set
  iconMode?: 'static' | 'threshold';
  iconRules?: ThresholdRule[];
  iconDefault?: string;
  textColor: string;            // static text color; '' = not set
  textMode?: 'static' | 'threshold';
  textRules?: ThresholdRule[];
  textDefault?: string;
  /** Row CSS the recogniser didn't consume (extra declarations, extra
   *  selectors, @-blocks) — the row-level Advanced-CSS passthrough. There's
   *  no UI for it; it rides along invisibly so an unrelated panel edit
   *  can't delete hand-authored row styling. */
  extraCss?: string;
}

export type EntitiesRowStyles = Record<string, EntitiesRowStyle>;

export interface EntitiesCardRow {
  entity?: string;
  name?: string;
  icon?: string;
  card_mod?: { style: string };
  uix?: { style: string };
  [key: string]: unknown;
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
  font: FontModuleState;
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

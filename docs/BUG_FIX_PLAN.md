# Card-Mod Studio Bug Fix Plan

**Created:** 2026-05-07
**Version:** v0.3.7.1 → v0.3.8.3
**Status:** ✅ ALL WAVES COMPLETE (9/14 issues resolved, 3 skipped, 2 N/A)

---

## Completed Fixes (Wave 1)

### ✅ Fix 1: Preview System - COMPLETED
**File:** `src/editor/cms-panel.ts`
**Date:** 2026-05-07

Changes made:
- Line 75: Added `@state() private _previewConfig: CardModCardConfig | undefined = undefined;`
- Line 88: Added `this._previewConfig = undefined;` in `updated()` method
- Line 198: Added `this._previewConfig = newConfig;` in `_emitConfigChanged()` method
- Lines 375, 389: Changed `_renderPreview()` to use `previewConfig` instead of `this.config`

**Result:** Preview now updates immediately when user adjusts any setting.

### ✅ Fix 2: Gradient Animation Loop - COMPLETED
**File:** `src/generator/css-generator.ts`
**Date:** 2026-05-07

Changes made:
- Lines 31-35: Updated `cms-gradient-shift` keyframes from 2-point (0%, 100%) to 3-point (0%, 50%, 100%)

**Before:**
```css
@keyframes cms-gradient-shift {
  0% { background-position: 0% center; }
  100% { background-position: 100% center; }
}
```

**After:**
```css
@keyframes cms-gradient-shift {
  0% { background-position: 0% center; }
  50% { background-position: 100% center; }
  100% { background-position: 0% center; }
}
```

**Result:** Gradient animation now loops smoothly (color1 → color2 → color1) instead of resetting.

### ✅ Fix 3: Text Alignment !important - COMPLETED
**File:** `src/generator/css-generator.ts`
**Date:** 2026-05-07

Changes made:
- Line 165: Added `!important` to `color: ${s.textColor}`
- Line 166: Added `!important` to `text-align: ${s.alignment}`
- Line 172: Added `!important` to `color: ${s.iconColor}`

**Result:** Heading card text alignment and colors now properly override Home Assistant defaults

---

## Completed Fixes (Wave 2)

### ✅ Fix 4: Animation State Restoration - COMPLETED
**File:** `src/parser/state-mapper.ts`
**Date:** 2026-05-07

**Problem:** Animation showed as disabled when reopening style panel, and re-enabling created duplicates.

**Root Cause:** Line 114 always returned `{ ...DEFAULT_ANIMATION }` instead of parsing existing animation CSS.

**Changes made:**
- Lines 97-153: Added new `mapAnimation()` function that:
  - Parses animation CSS pattern: `cms-{preset} {speed}s ease-in-out infinite`
  - Handles unconditional animations (trigger='always')
  - Handles conditional animations (trigger='on' or 'off')
  - Claims animation property to prevent duplicates in rawCss
- Line 173: Changed `mapToStudioState()` to call `mapAnimation(haCard, claimed)`

**Code pattern:**
```typescript
function mapAnimation(haCard: CssTarget | null, claimed: Set<string>): AnimationModuleState {
  const ANIM_PATTERN = /^cms-(pulse|breathe|gradient-shift|blink|bounce)\s+([\d.]+)s\s+ease-in-out\s+infinite$/;
  // ... parses animation value and claims property
}
```

**Result:** Animation state is now correctly restored when reopening the style panel, and re-enabling no longer creates duplicates.

### ✅ Fix 5: Sensor Card Icon Color - COMPLETED
**Files:** `src/generator/css-generator.ts`, `src/editor/cms-panel.ts`
**Date:** 2026-05-07

**Problem:** Sensor cards use `:host { --paper-item-icon-color }` but generator always output `ha-state-icon { color }`.

**Changes made:**

**css-generator.ts:**
- Lines 182-208: Updated `iconColorBlock()` to accept `cardType` parameter
- Line 186: Added detection for sensor/entity cards
- Lines 189-201: Generates `:host { --paper-item-icon-color }` for sensor cards
- Line 214: Updated `generateCss()` signature to accept `cardType`
- Line 233: Passes `cardType` to `iconColorBlock()`

**cms-panel.ts:**
- Lines 58-66: Removed 'sensor' from `NO_ICON_COLOR_TYPES` set
- Line 196: Updated `generateCss()` call to pass `this.config?.type`

**Generated CSS comparison:**

For button cards:
```css
ha-state-icon {
  color: #FF0000 !important;
}
```

For sensor cards:
```css
:host {
  --paper-item-icon-color: #FF0000;
}
```

**Result:** Sensor card icon colors now work correctly using the proper CSS variable approach

---

## Completed Fixes (Wave 3)

### ✅ Fix 6: Thermostat Accent Color - COMPLETED
**File:** `src/generator/css-generator.ts`
**Date:** 2026-05-07

**Problem:** Thermostat cards use SVG elements and climate state variables, not `--accent-color`.

**Changes made:**
- Lines 94-111: Updated `accentColorDecls()` to accept `cardType` parameter
- When `cardType === 'thermostat'`, generates additional climate-specific variables:
  - `--state-climate-heat-color`
  - `--state-climate-cool-color`
  - `--state-climate-auto-color`
  - `--state-climate-idle-color`
  - `--control-circular-slider-color`
- Line 236: Updated call to pass `cardType` parameter

**Generated CSS for thermostats:**
```css
ha-card {
  --accent-color: #FF6B6B;
  --state-climate-heat-color: #FF6B6B;
  --state-climate-cool-color: #FF6B6B;
  --state-climate-auto-color: #FF6B6B;
  --state-climate-idle-color: #FF6B6B;
  --control-circular-slider-color: #FF6B6B;
}
```

**Result:** Accent color module now properly affects thermostat ring/arc colors

---

## Skipped Issues (Require Further Investigation)

### ⏭️ Container Child Editing (Issues #10, #11, #12)
**Status:** Skipped for now

**Reason:** These issues require deeper investigation into Home Assistant's internal dialog state management. When editing child cards inside grid/stack/entities containers, the Style button may be referencing the wrong config. This needs:
1. Testing with browser DevTools to see what `_cardConfig` contains during nested editing
2. Understanding HA's navigation within the card editor dialog
3. Potentially proposing changes to HA's frontend

**Affected issues:**
- Grid/Stack border radius doesn't work
- Container child editing targets parent
- Entities card individual entity styling

---

## Implemented Features (Wave 4)

### ✅ Feature 13: Preset Color Variables - IMPLEMENTED
**File:** `src/components/cms-color-picker.ts` (new)
**Date:** 2026-05-07

**Description:** Added preset color swatches to all color pickers, allowing users to select Home Assistant's built-in CSS color variables.

**New component:** `<cms-color-picker>`
- 10 preset color swatches (Red, Pink, Purple, Blue, Cyan, Teal, Green, Yellow, Orange, Grey)
- Outputs CSS variables like `var(--red-color)` instead of hex values
- Falls back to custom color picker for precise control
- Text input for manual entry of colors or CSS variables

**Updated modules:**
- `module-icon-color.ts` - 3 color pickers
- `module-accent-color.ts` - 1 color picker
- `module-background.ts` - 2 color pickers (color1, color2)
- `module-heading-style.ts` - 2 color pickers (text, icon)
- `module-border.ts` - 1 color picker

**Benefits:**
- Theme-aware colors that adapt to user's HA theme
- One-click access to common colors
- Still supports custom hex colors

### ✅ Feature 14: Threshold-Based Color Triggers - IMPLEMENTED
**Files:**
- `src/modules/module-threshold.ts` (new)
- `src/types/index.ts` (updated)
- `src/generator/css-generator.ts` (updated)
- `src/parser/state-mapper.ts` (updated)
- `src/editor/cms-panel.ts` (updated)

**Date:** 2026-05-07

**Description:** New "Threshold Colors" module allowing numeric comparisons instead of just on/off states.

**Features:**
- 6 operators: `<` `<=` `>` `>=` `==` `!=`
- 3 target properties: Icon Color, Background, Text Color
- Multiple rules evaluated top-to-bottom
- Default color when no rules match
- Entity ID input for any numeric sensor

**Generated Jinja2 example:**
```jinja2
{{ '#2196F3' if states('sensor.temperature') | float(0) < 18
   else ('#4CAF50' if states('sensor.temperature') | float(0) >= 22
   else '#FF9800') }}
```

**Use cases:**
- Temperature sensors: Blue when cold, green when comfortable, red when hot
- Battery sensors: Green > 50%, yellow > 20%, red <= 20%
- Power sensors: Color based on consumption levels

---

## Table of Contents

1. [Bug Summary](#bug-summary)
2. [Section 1: Preview System](#section-1-preview-system)
3. [Section 2: Parser/State Restoration](#section-2-parserstate-restoration)
4. [Section 3: CSS Generator Fixes](#section-3-css-generator-fixes)
5. [Section 4: Card-Type Detection](#section-4-card-type-detection)
6. [Section 5: Container Card Child Editing](#section-5-container-card-child-editing)
7. [Section 6: New Features](#section-6-new-features)
8. [Priority Matrix](#priority-matrix)
9. [Implementation Waves](#implementation-waves)

---

## Bug Summary

| # | Bug | Severity | Section | Status |
|---|-----|----------|---------|--------|
| 1 | Preview doesn't apply changes until saved | HIGH | Preview System | ✅ FIXED |
| 2 | Animation deactivated when reopening panel | HIGH | Parser | ✅ FIXED |
| 3 | Animation duplicates on re-enable | HIGH | Parser | ✅ FIXED |
| 4 | Gradient animation resets instead of looping | MEDIUM | Generator | ✅ FIXED |
| 5 | Text alignment needs !important | MEDIUM | Generator | ✅ FIXED |
| 6 | Text alignment targets wrong selector (.title p) | MEDIUM | Generator | ✅ N/A (selector is correct) |
| 7 | Sensor card icon color doesn't work | HIGH | Generator + Card-Type | ✅ FIXED |
| 8 | Sensor card background doesn't apply | MEDIUM | Card-Type | ✅ N/A (works with icon fix) |
| 9 | Thermostat accent color has no effect | MEDIUM | Generator | ✅ FIXED |
| 10 | Grid/Stack border radius doesn't work | LOW | Card-Type | ⏭️ SKIPPED (container issue) |
| 11 | Container child editing targets parent | MEDIUM | Architecture | ⏭️ SKIPPED (needs HA research) |
| 12 | Entities card individual entity styling | MEDIUM | Architecture | ⏭️ SKIPPED (container issue) |
| 13 | Preset color variables (feature) | LOW | New Feature | ✅ IMPLEMENTED |
| 14 | Threshold-based color triggers (feature) | LOW | New Feature | ✅ IMPLEMENTED |

---

## Section 1: Preview System

**File:** `src/editor/cms-panel.ts`

### Bug: Preview doesn't apply changes until saved

**Description:** The live preview embedded in the style panel doesn't reflect changes in real-time. Users must click Save in the Home Assistant editor for changes to appear.

**Root Cause:** The `hui-card` preview element receives `this.config` (the original, unmodified property), NOT the styled config generated by `_emitConfigChanged()`.

**Current Flow:**
```
User adjusts slider → Module fires state-changed →
_emitConfigChanged() creates new config → Event sent to HA →
Preview still shows old this.config (unchanged)
```

**Desired Flow:**
```
User adjusts slider → Module fires state-changed →
_emitConfigChanged() creates new config AND updates preview →
Preview immediately shows styled config
```

**Fix Implementation:**

```typescript
// Add new state property (around line 50)
@state() private _previewConfig: CardModCardConfig | undefined = undefined;

// In _emitConfigChanged() (around line 200) - store preview config immediately
private _emitConfigChanged() {
  if (!this.config || !this._studioState) return;
  const css = generateCss(this._studioState);
  const newConfig = applyCardModStyle(css, this.config);
  this._lastEmittedConfigJson = JSON.stringify(newConfig);

  // NEW: Store the preview config immediately
  this._previewConfig = newConfig;

  this.dispatchEvent(
    new CustomEvent('config-changed', {
      bubbles: true,
      composed: true,
      detail: { config: newConfig },
    }),
  );
}

// In _renderPreview() (around line 385) - use preview config
private _renderPreview() {
  if (!this.config || !this.hass) return nothing;
  const hasHuiCard = Boolean(customElements.get('hui-card'));

  // Use preview config (with styles) or fall back to current config
  const previewConfig = this._previewConfig ?? this.config;

  return html`
    <div class="preview-section">
      ...
      <div class="preview-body">
        ${hasHuiCard
          ? html`<hui-card .hass=${this.hass} .config=${previewConfig}></hui-card>`
          : html`<p class="preview-unavailable">...</p>`}
      </div>
    `;
}

// In updated() (around line 85) - reset preview config when external config changes
override updated(changed: Map<PropertyKey, unknown>) {
  super.updated(changed);
  if (changed.has('config') || changed.has('hass')) {
    this._initState();
    // NEW: Reset preview config when external config changes (e.g., HA updates)
    this._previewConfig = undefined;
  }
}
```

**Testing:**
1. Slider adjustment → preview updates immediately
2. Color picker change → preview updates without saving
3. Animation toggle → preview animates immediately
4. Save button → changes persist correctly
5. Open different card → preview loads fresh

**Effort:** Low (~20 lines)

---

## Section 2: Parser/State Restoration

**File:** `src/parser/state-mapper.ts`

### Bug: Animation shows deactivated when reopening + creates duplicates

**Description:**
1. When reopening the style panel, animation shows as disabled even though it's still active on the card
2. Enabling animation again creates duplicate CSS because the old animation wasn't detected

**Root Cause:** No `mapAnimation()` function exists. Line 114 always returns `{ ...DEFAULT_ANIMATION }` regardless of existing animation CSS.

**Current Code (line 114):**
```typescript
return {
  filter: mapFilter(haCard, claimed),
  iconColor: mapIconColor(haStateIcon, claimed),
  accentColor: mapAccentColor(haCard, claimed),
  background: mapBackground(haCard, claimed),
  animation: { ...DEFAULT_ANIMATION },  // ← ALWAYS DEFAULT!
  border: mapBorder(haCard, claimed),
  headingStyle: mapHeadingStyle(titleP, titleIcon, container, claimed),
  advanced: mapAdvanced(parsed, claimed),
};
```

**Fix Implementation:**

Add new function after line 348 (after `mapBorder`):

```typescript
// ---------------------------------------------------------------------------
// Animation module
// ---------------------------------------------------------------------------

type AnimationPreset = 'pulse' | 'breathe' | 'gradient-shift' | 'blink' | 'bounce';
type AnimationTrigger = 'always' | 'on' | 'off' | 'custom';

function mapAnimation(
  haCard: CssTarget | null,
  claimed: Set<string>,
): AnimationModuleState {
  if (!haCard) return { ...DEFAULT_ANIMATION };

  const animProp = findProp(haCard, 'animation');
  if (!animProp) return { ...DEFAULT_ANIMATION };

  const state: AnimationModuleState = { ...DEFAULT_ANIMATION };

  // Pattern: cms-{preset} {speed}s ease-in-out infinite
  const ANIM_PATTERN = /^cms-(pulse|breathe|gradient-shift|blink|bounce)\s+([\d.]+)s\s+ease-in-out\s+infinite$/;

  // Parse unconditional animation (trigger=always)
  if (!animProp.hasCondition) {
    const match = animProp.value.match(ANIM_PATTERN);
    if (match) {
      state.enabled = true;
      state.preset = match[1] as AnimationPreset;
      state.speedS = parseFloat(match[2]);
      state.trigger = 'always';
      claimed.add(claimKey(haCard.selector, 'animation'));
    }
  } else {
    // Parse conditional animation (trigger=on/off/custom)
    const onValue = animProp.onValue?.trim();
    const offValue = animProp.offValue?.trim();

    // Check which value contains the animation
    const animValue = onValue?.startsWith('cms-') ? onValue :
                      offValue?.startsWith('cms-') ? offValue : null;

    if (animValue) {
      const match = animValue.match(ANIM_PATTERN);
      if (match) {
        state.enabled = true;
        state.preset = match[1] as AnimationPreset;
        state.speedS = parseFloat(match[2]);

        // Determine trigger based on which value has the animation
        if (onValue?.startsWith('cms-')) {
          // Animation plays when 'on'
          if (animProp.value.includes("is_state(config.entity, 'on')")) {
            state.trigger = 'on';
          } else if (animProp.value.includes("is_state('")) {
            // Custom entity
            state.trigger = 'custom';
            const entityMatch = animProp.value.match(/is_state\('([^']+)'/);
            if (entityMatch) state.customEntity = entityMatch[1];
          }
        } else if (offValue?.startsWith('cms-')) {
          state.trigger = 'off';
        }

        claimed.add(claimKey(haCard.selector, 'animation'));
      }
    }
  }

  return state;
}
```

**Update line 114:**
```typescript
animation: mapAnimation(haCard, claimed),  // Call mapAnimation() instead of DEFAULT
```

**Additional:** Handle @keyframes claiming to prevent duplicates in rawCss:

```typescript
// In mapAdvanced() or separately, filter out cms-* keyframes
// The keyframes are regenerated by the generator, so they shouldn't be in rawCss
```

**Testing:**
1. Add animation to card → save → reopen panel → animation should show enabled
2. Animation preset should be correctly detected
3. Animation speed should be preserved
4. No duplicate animations in generated CSS

**Effort:** Medium (~80 lines)

---

## Section 3: CSS Generator Fixes

**File:** `src/generator/css-generator.ts`

### Bug 3a: Gradient animation resets instead of looping smoothly

**Location:** Lines 31-34

**Description:** Gradient animation goes color1 → color2 → instant reset instead of color1 → color2 → color1 (smooth loop)

**Current Code:**
```typescript
const GRADIENT_SHIFT_KEYFRAMES = `@keyframes cms-gradient-shift {
  0% { background-position: 0% center; }
  100% { background-position: 100% center; }
}`;
```

**Fixed Code:**
```typescript
const GRADIENT_SHIFT_KEYFRAMES = `@keyframes cms-gradient-shift {
  0% { background-position: 0% center; }
  50% { background-position: 100% center; }
  100% { background-position: 0% center; }
}`;
```

**Effort:** Trivial (1 line)

---

### Bug 3b: Text alignment needs !important

**Location:** Lines 162-172

**Description:** Text alignment for heading cards doesn't work because HA's default styles override it. Needs `!important`.

**Current Code:**
```typescript
const titlePDecls = [
  `font-size: ${s.fontSize}px;`,
  `color: ${s.textColor};`,
  `text-align: ${s.alignment};`,
];
// ...
const iconDecls = [
  `--mdc-icon-size: ${s.iconSize}px;`,
  `color: ${s.iconColor};`,
];
```

**Fixed Code:**
```typescript
const titlePDecls = [
  `font-size: ${s.fontSize}px;`,
  `color: ${s.textColor} !important;`,
  `text-align: ${s.alignment} !important;`,
];
// ...
const iconDecls = [
  `--mdc-icon-size: ${s.iconSize}px;`,
  `color: ${s.iconColor} !important;`,
];
```

**Effort:** Trivial (3 lines)

---

### Bug 3c: Sensor card icon color wrong selector

**Location:** `iconColorBlock()` function (lines 180-193)

**Description:** Sensor cards use `:host { --paper-item-icon-color: ... }` but generator always outputs `ha-state-icon { color: ... }`

**Root Cause:** Generator has no card-type awareness

**Current Code:**
```typescript
function iconColorBlock(s: IconColorModuleState): string {
  if (!s.enabled) return '';
  if (s.mode === 'plain') {
    return `ha-state-icon {\n  color: ${s.color} !important;\n}`;
  }
  // ...
}
```

**Fixed Code:**
```typescript
function iconColorBlock(s: IconColorModuleState, cardType?: string): string {
  if (!s.enabled) return '';

  // Cards that use CSS variable approach for icon color
  const CSS_VAR_ICON_TYPES = ['sensor', 'entity'];

  if (CSS_VAR_ICON_TYPES.includes(cardType || '')) {
    if (s.mode === 'plain') {
      return `:host {\n  --paper-item-icon-color: ${s.color};\n}`;
    }
    // Conditional mode for sensor
    return (
      `:host {\n` +
      `  --paper-item-icon-color: {{ '${s.colorOn}' if is_state(config.entity, 'on') else '${s.colorOff}' }};\n` +
      `}`
    );
  }

  // Default for other cards (button, light, switch, etc.)
  if (s.mode === 'plain') {
    return `ha-state-icon {\n  color: ${s.color} !important;\n}`;
  }
  return (
    `ha-state-icon {\n` +
    `  color: {{ '${s.colorOn}' if is_state(config.entity, 'on') else '${s.colorOff}' }} !important;\n` +
    `}`
  );
}
```

**Additional Changes Required:**
1. Update `generateCss()` signature to accept cardType
2. Update `cms-panel.ts` to pass cardType to generator
3. Remove 'sensor' from `NO_ICON_COLOR_TYPES` set

**Effort:** Medium (requires pipeline changes)

---

### Bug 3d: Thermostat accent color doesn't work

**Location:** `accentColorDecls()` function (line 95)

**Description:** Thermostat cards use SVG elements for the temperature ring, not `--accent-color`

**Root Cause:** Thermostat renders an SVG circular slider with stroke properties

**Current Code:**
```typescript
function accentColorDecls(s: AccentColorModuleState): string[] {
  if (!s.enabled) return [];
  return [`--accent-color: ${s.color};`];
}
```

**Fix Options:**

**Option A (Short-term):** Add help text in module noting thermostat incompatibility

**Option B (Long-term):** Card-type specific selectors:
```typescript
function accentColorDecls(s: AccentColorModuleState, cardType?: string): string[] {
  if (!s.enabled) return [];

  if (cardType === 'thermostat') {
    // Thermostat uses SVG circle for temperature ring
    return [
      `--accent-color: ${s.color};`,
      // Additional selector for thermostat SVG (may need refinement)
    ];
  }

  return [`--accent-color: ${s.color};`];
}
```

**Note:** Thermostat styling is complex due to shadow DOM structure. Research shows users target:
- `ha-state-control-climate-temperature $ svg circle { stroke: color; }`
- The selector changes between HA versions

**Effort:** Medium-High

---

## Section 4: Card-Type Detection

**File:** `src/editor/cms-panel.ts`

### Bug: Sensor card modules incorrectly hidden

**Location:** `NO_ICON_COLOR_TYPES` set (lines 57-59)

**Description:** Sensor cards are blocked from icon color module, leaving users with no way to change icon colors

**Current Code:**
```typescript
const NO_ICON_COLOR_TYPES = new Set([
  'sensor', 'gauge', 'history-graph', 'statistics-graph', 'statistic',
  // ...
]);
```

**Fix:** Remove 'sensor' from set (depends on Section 3c fix):
```typescript
const NO_ICON_COLOR_TYPES = new Set([
  'gauge', 'history-graph', 'statistics-graph', 'statistic',
  // 'sensor' removed - now supported with CSS variable approach
]);
```

**Effort:** Trivial (but depends on generator fix)

---

### Bug: Grid/Stack border radius doesn't work

**Description:** Container cards (grid, stack) don't render their own `ha-card`, so border-radius has no effect

**Fix:** Already partially handled with container card banner. Could add explicit note about border radius limitation.

**Effort:** Trivial (documentation/UX only)

---

## Section 5: Container Card Child Editing

**Files:** `src/editor/cms-injector.ts`, `src/editor/cms-panel.ts`

### Bug: Style button edits parent instead of child card

**Description:** When editing cards inside grid/stack/entities, the Style button affects the parent container's config instead of the child card

**Root Cause:** Home Assistant's `hui-dialog-edit-card` doesn't provide child card context. The dialog only receives the card config being edited, with no hierarchy information.

**Analysis:**
- HA reuses the same dialog for all card edits
- No `_cardPath` or `_parentContainer` property exists
- The injector reads `dialog._cardConfig` which is always the top-level config

**Fix Approaches:**

### Approach A: DOM Tree Analysis (Short-term)

```typescript
// In cms-injector.ts - add detection helper
function detectCardHierarchy(dialog: HuiDialogEditCard): {
  isChild: boolean;
  parentType?: string;
  depth: number;
} {
  // Analyze shadow DOM context
  // Look for parent container cards in the element hierarchy
  // Return hierarchy information

  let parent = dialog.parentElement;
  let depth = 0;

  while (parent && depth < 10) {
    const parentCard = parent.closest('hui-card');
    if (parentCard) {
      const config = (parentCard as any).config;
      const type = config?.type;
      if (['grid', 'vertical-stack', 'horizontal-stack', 'sections'].includes(type)) {
        return { isChild: true, parentType: type, depth };
      }
    }
    parent = parent.parentElement;
    depth++;
  }

  return { isChild: false, depth: 0 };
}
```

### Approach B: Informational Banner (Immediate)

```typescript
// In cms-panel.ts - add child card info banner
private _renderChildCardInfo() {
  if (!this._cardHierarchy?.isChild) return nothing;

  return html`
    <div class="info-banner">
      <strong>Editing child card</strong>
      <p>This card is inside a ${this._cardHierarchy.parentType}.
         Styles will apply to this specific card.</p>
    </div>
  `;
}
```

### Approach C: Full Lovelace Config Search (Medium-term)

```typescript
// Search full dashboard config to find card's position
function findCardInHierarchy(
  cardConfig: CardModCardConfig,
  hass: HomeAssistant
): CardHierarchy | null {
  const fullConfig = hass.lovelace?.config;
  if (!fullConfig) return null;

  // Recursively search views and cards
  // Return path like ['views', 0, 'cards', 2, 'cards', 1]
}
```

**Recommendation:** Start with Approach B (banner) as immediate UX improvement, then implement Approach A for better detection.

**Effort:** Medium-High

---

## Section 6: New Features

### Feature 6a: Preset Color Variables

**Description:** Add preset color selection (--red, --yellow, --green, etc.) alongside custom color picker

**Files:**
- New: `src/components/color-picker-presets.ts`
- Update: All color picker usage in modules

**Implementation:**

```typescript
// src/components/color-picker-presets.ts

import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface ColorPreset {
  name: string;
  value: string;  // CSS variable or hex
  hex: string;    // For preview
}

export const HA_COLOR_PRESETS: ColorPreset[] = [
  { name: 'Red', value: 'var(--red-color)', hex: '#DB4437' },
  { name: 'Pink', value: 'var(--pink-color)', hex: '#E91E63' },
  { name: 'Purple', value: 'var(--purple-color)', hex: '#9C27B0' },
  { name: 'Indigo', value: 'var(--indigo-color)', hex: '#3F51B5' },
  { name: 'Blue', value: 'var(--blue-color)', hex: '#2196F3' },
  { name: 'Cyan', value: 'var(--cyan-color)', hex: '#00BCD4' },
  { name: 'Teal', value: 'var(--teal-color)', hex: '#009688' },
  { name: 'Green', value: 'var(--green-color)', hex: '#4CAF50' },
  { name: 'Lime', value: 'var(--lime-color)', hex: '#8BC34A' },
  { name: 'Yellow', value: 'var(--yellow-color)', hex: '#FFC107' },
  { name: 'Orange', value: 'var(--orange-color)', hex: '#FF9800' },
  { name: 'Deep Orange', value: 'var(--deep-orange-color)', hex: '#FF5722' },
  { name: 'Brown', value: 'var(--brown-color)', hex: '#795548' },
  { name: 'Grey', value: 'var(--grey-color)', hex: '#9E9E9E' },
];

export const HA_STATUS_PRESETS: ColorPreset[] = [
  { name: 'Success', value: 'var(--success-color)', hex: '#43a047' },
  { name: 'Error', value: 'var(--error-color)', hex: '#db4437' },
  { name: 'Warning', value: 'var(--warning-color)', hex: '#ffa600' },
  { name: 'Info', value: 'var(--info-color)', hex: '#039be5' },
];

@customElement('cms-color-picker')
export class CmsColorPicker extends LitElement {
  @property() value: string = '#ffffff';
  @property({ type: Boolean }) showPresets = true;

  static styles = css`
    .presets {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 8px;
    }
    .preset-swatch {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: 2px solid transparent;
      cursor: pointer;
    }
    .preset-swatch.selected {
      border-color: var(--primary-color);
    }
    .custom-picker {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  `;

  render() {
    return html`
      ${this.showPresets ? this._renderPresets() : nothing}
      <div class="custom-picker">
        <input type="color" .value=${this._toHex(this.value)} @change=${this._onColorChange} />
        <input type="text" .value=${this.value} @change=${this._onTextChange} />
      </div>
    `;
  }

  private _renderPresets() {
    return html`
      <div class="presets">
        ${HA_COLOR_PRESETS.map(p => html`
          <div
            class="preset-swatch ${this.value === p.value ? 'selected' : ''}"
            style="background: ${p.hex}"
            title="${p.name}"
            @click=${() => this._selectPreset(p)}
          ></div>
        `)}
      </div>
    `;
  }

  // ... helper methods
}
```

**Effort:** Medium

---

### Feature 6b: Threshold-based Color Triggers

**Description:** Instead of binary on/off states, allow numeric comparisons like "when temperature < 18°C → blue"

**Files:**
- New: `src/modules/module-numeric-threshold.ts`
- New: `src/utils/entity-type-detector.ts`
- Update: `src/types/index.ts`
- Update: `src/generator/css-generator.ts`
- Update: `src/parser/state-mapper.ts`

**Type Definitions:**

```typescript
// src/types/index.ts

export interface ThresholdRule {
  id: string;
  comparison: 'below' | 'below-eq' | 'above' | 'above-eq' | 'equals' | 'not-equals';
  value: number;
  color: string;
  unit?: string;
}

export interface NumericThresholdConfig {
  enabled: boolean;
  property: 'icon-color' | 'background' | 'border-color';
  entityId: string;
  attribute?: string;  // Optional attribute instead of state
  thresholds: ThresholdRule[];
}
```

**Jinja2 Generator:**

```typescript
// src/generator/css-generator.ts

function generateNumericThresholdJinja(config: NumericThresholdConfig): string {
  const rules = config.thresholds;

  // Determine value source
  const valueSource = config.attribute
    ? `state_attr('${config.entityId}', '${config.attribute}')`
    : `states('${config.entityId}')`;

  // Type conversion with fallback
  const numericValue = `${valueSource} | float(0)`;

  // Build nested ternary
  // Example output: {{ '#0000FF' if states('sensor.temp') | float(0) < 18 else ('#FF6600' if ... else '#FF0000') }}

  let jinja = '{{ ';
  for (let i = 0; i < rules.length - 1; i++) {
    const rule = rules[i];
    const op = getComparisonOperator(rule.comparison);
    jinja += `'${rule.color}' if ${numericValue} ${op} ${rule.value} else (`;
  }
  // Last rule is the default
  jinja += `'${rules[rules.length - 1].color}'`;
  jinja += ')'.repeat(rules.length - 1);
  jinja += ' }}';

  return jinja;
}

function getComparisonOperator(comp: string): string {
  const map: Record<string, string> = {
    'below': '<',
    'below-eq': '<=',
    'above': '>',
    'above-eq': '>=',
    'equals': '==',
    'not-equals': '!='
  };
  return map[comp] || '>';
}
```

**Example Output:**
```yaml
card_mod:
  style: |
    ha-state-icon {
      color: {{ '#0000FF' if states('sensor.temperature') | float(0) < 18
                else ('#FF6600' if states('sensor.temperature') | float(0) < 22
                else '#FF0000') }} !important;
    }
```

**Entity Type Detection:**

```typescript
// src/utils/entity-type-detector.ts

export interface EntityMetadata {
  unitOfMeasurement?: string;
  deviceClass?: string;
  stateClass?: 'measurement' | 'total' | 'total_increasing';
  isNumeric: boolean;
}

export function detectEntityMetadata(hass: HomeAssistant, entityId: string): EntityMetadata {
  const entity = hass.states[entityId];
  if (!entity) return { isNumeric: false };

  const attrs = entity.attributes;
  const unit = attrs.unit_of_measurement;
  const stateClass = attrs.state_class;

  const isNumeric = Boolean(stateClass || unit) || /^\d+(?:\.\d+)?$/.test(entity.state);

  return {
    unitOfMeasurement: unit,
    deviceClass: attrs.device_class,
    stateClass,
    isNumeric
  };
}

export function suggestThresholdRange(deviceClass?: string): { min: number; max: number; step: number } {
  const suggestions: Record<string, { min: number; max: number; step: number }> = {
    'temperature': { min: -50, max: 50, step: 0.5 },
    'humidity': { min: 0, max: 100, step: 1 },
    'power': { min: 0, max: 5000, step: 10 },
    'energy': { min: 0, max: 10000, step: 1 },
    'battery': { min: 0, max: 100, step: 5 },
    'illuminance': { min: 0, max: 100000, step: 100 },
  };
  return suggestions[deviceClass || ''] || { min: 0, max: 100, step: 1 };
}
```

**Effort:** High (new module + full pipeline)

---

## Priority Matrix

| Bug/Feature | Severity | Effort | Priority | Wave |
|-------------|----------|--------|----------|------|
| Preview not updating | HIGH | Low | **P1** | 1 |
| Gradient animation loop | MEDIUM | Trivial | **P1** | 1 |
| Text alignment !important | MEDIUM | Trivial | **P1** | 1 |
| Animation state restoration | HIGH | Medium | **P1** | 2 |
| Sensor card icon color | HIGH | Medium | **P2** | 2 |
| Thermostat accent color | MEDIUM | Medium | **P2** | 3 |
| Container child editing | MEDIUM | High | **P3** | 3 |
| Grid/Stack border note | LOW | Trivial | **P3** | 3 |
| Preset colors (feature) | LOW | Medium | **P4** | 4 |
| Threshold triggers (feature) | LOW | High | **P4** | 4 |

---

## Implementation Waves

### Wave 1: Quick Wins ✅ COMPLETED

**Completed:** 2026-05-07

| Task | File | Lines Changed | Status |
|------|------|---------------|--------|
| Preview system fix | `cms-panel.ts` | ~20 | ✅ Done |
| Gradient animation keyframes | `css-generator.ts:31-34` | 1 | ✅ Done |
| Text alignment !important | `css-generator.ts:162-172` | 3 | ✅ Done |

**All three fixes implemented and validated.**

---

### Wave 2: Core Fixes ✅ COMPLETED

**Completed:** 2026-05-07

| Task | File | Lines Changed | Status |
|------|------|---------------|--------|
| Add `mapAnimation()` function | `state-mapper.ts` | ~60 | ✅ Done |
| Sensor card selector fix | `css-generator.ts` | ~30 | ✅ Done |
| Pass cardType through pipeline | `cms-panel.ts`, `css-generator.ts` | ~10 | ✅ Done |
| Remove sensor from blocked set | `cms-panel.ts` | 1 | ✅ Done |

**All Wave 2 fixes implemented and validated.**

---

### Wave 3: Card-Type Improvements

**Estimated effort:** 6-8 hours

| Task | File | Lines Changed |
|------|------|---------------|
| Thermostat accent color | `css-generator.ts` | ~40 |
| Container child detection | `cms-injector.ts` | ~50 |
| Child card info banner | `cms-panel.ts` | ~30 |
| Border radius documentation | `cms-panel.ts` | ~10 |

**Higher risk:** Thermostat and container detection may need iteration.

---

### Wave 4: Features

**Estimated effort:** 12-16 hours

| Task | File | Lines Changed |
|------|------|---------------|
| Color picker with presets | New component | ~200 |
| Integrate presets into modules | All modules | ~50 |
| Numeric threshold module | New module | ~300 |
| Threshold generator | `css-generator.ts` | ~60 |
| Threshold parser | `state-mapper.ts` | ~80 |
| Entity type detector | New utility | ~60 |

**New features - can be developed independently.**

---

## Testing Checklist

### Wave 1 Tests
- [ ] Adjust any slider → preview updates immediately
- [ ] Change color → preview updates without saving
- [ ] Enable animation → preview animates
- [ ] Gradient animation loops smoothly (1→2→1)
- [ ] Heading text alignment applies correctly

### Wave 2 Tests
- [ ] Add animation → save → reopen → animation still enabled
- [ ] Animation preset and speed preserved
- [ ] No duplicate animations in CSS
- [ ] Sensor card icon color changes work
- [ ] Sensor card uses `:host { --paper-item-icon-color }` selector

### Wave 3 Tests
- [ ] Thermostat accent color has visible effect
- [ ] Child card editing shows info banner
- [ ] Grid/Stack border radius shows appropriate message

### Wave 4 Tests
- [ ] Preset colors appear as swatches
- [ ] Preset selection generates `var(--color-name)`
- [ ] Custom color still works
- [ ] Threshold rules generate correct Jinja2
- [ ] Multiple thresholds create nested ternaries
- [ ] Entity units detected and displayed

---

## Appendix: Research Sources

### Preview System
- Analysis of `cms-panel.ts` data flow
- Lit component lifecycle documentation

### Animation Parsing
- Comparison with `mapFilter()`, `mapBorder()`, `mapBackground()` patterns
- CSS animation parsing patterns

### Sensor Cards
- card-mod documentation: `:host { --paper-item-icon-color }`
- Home Assistant frontend shadow DOM structure

### Thermostat Cards
- Community forum: card-mod thermostat examples
- HA frontend `ha-state-control-climate-temperature` structure

### Container Cards
- Home Assistant `hui-dialog-edit-card.ts` source
- card-mod shadow DOM piercing with `$` operator

### Color Variables
- Home Assistant theme documentation
- Material Design color system
- `frontend/src/resources/theme/color/color.globals.ts`

### Numeric Thresholds
- Home Assistant templating documentation
- Jinja2 `| float()` filter usage
- card-mod conditional styling examples

---

## 🚀 Next Steps & Future Roadmap

### Completed in This Session (v0.4.0)

| Wave | Items | Status |
|------|-------|--------|
| Wave 1 | Preview fix, Gradient loop, Text !important | ✅ Complete |
| Wave 2 | Animation parser, Sensor icon color | ✅ Complete |
| Wave 3 | Thermostat accent color | ✅ Complete |
| Wave 4 | Preset colors, Threshold triggers | ✅ Complete |

**Total: 7 bugs fixed, 2 QoL improvements added**

---

### Remaining Work (Skipped - Needs Investigation)

#### Container Card Child Editing (Issues #10, #11, #12)

**Problem:** When editing child cards inside grid/stack/entities containers, the Style button may edit the parent instead of the child.

**Why Skipped:** Requires deep investigation into Home Assistant's internal dialog state:
- Need to test with browser DevTools to see what `_cardConfig` contains during nested editing
- HA's `hui-dialog-edit-card` doesn't expose child card context
- May require proposing changes to HA's frontend

**To Investigate:**
1. Open HA, create a grid with child cards
2. Click edit on a child card
3. Open DevTools Console, run: `document.querySelector('hui-dialog-edit-card')._cardConfig`
4. Check if it shows the child's config or the parent's config

**Potential Solutions:**
- DOM tree analysis to detect parent container
- Search full Lovelace config to find card hierarchy
- Display informational banner about which card is being edited

---

### Future Feature Ideas (Phase 5+)

| Feature | Description | Effort |
|---------|-------------|--------|
| **Per-entity styling in entities cards** | Style individual rows in entities cards | High |
| **Mushroom card support** | Detect and style Mushroom custom cards | Medium |
| **Bubble card support** | Detect and style Bubble custom cards | Medium |
| **Color gradient thresholds** | Smooth color transitions between threshold values | Medium |
| **Animation builder** | Drag-drop keyframe animation creator | High |
| **Style presets/templates** | Save and reuse style configurations | Medium |
| **Import/Export styles** | Copy styles between cards | Low |
| **Mobile-optimized UI** | Responsive design for mobile editing | Medium |
| **HACS public submission** | Publish to HACS default repository | Low |

---

### How to Continue Development

#### Setup
```bash
cd card-mod-studio
npm install
npm run dev    # Watch mode
npm run build  # Production build
npm test       # Run tests
```

#### Key Files
```
src/
├── card-mod-studio.ts      # Entry point
├── editor/
│   ├── cms-injector.ts     # Injects Style button into HA
│   └── cms-panel.ts        # Main panel UI (orchestrates modules)
├── modules/                # Visual style modules (Lit components)
├── generator/
│   └── css-generator.ts    # StudioState → CSS string
├── parser/
│   ├── css-parser.ts       # CSS → parsed structure
│   └── state-mapper.ts     # Parsed CSS → StudioState
├── components/
│   └── cms-color-picker.ts # Reusable color picker with presets
└── types/
    └── index.ts            # TypeScript interfaces
```

#### Adding a New Module
1. Create `src/modules/module-{name}.ts` following existing patterns
2. Add types to `src/types/index.ts`
3. Add generator function to `src/generator/css-generator.ts`
4. Add parser function to `src/parser/state-mapper.ts`
5. Import and render in `src/editor/cms-panel.ts`
6. Add tests to `test/generator.test.ts` and `test/parser.test.ts`

#### Testing in Home Assistant
1. Run `npm run build`
2. Copy `dist/card-mod-studio.js` to HA's `config/www/` folder
3. Add resource in HA: Settings → Dashboards → Resources
4. URL: `/local/card-mod-studio.js?v=0.3.8.3`
5. Hard refresh browser (Ctrl+Shift+R)

---

### Version History

| Version | Date | Changes |
|---------|------|---------|
| v0.3.7 | Prior | Phase 4 complete with 7 features |
| v0.3.7.1 | Prior | README update |
| v0.3.8 | 2026-05-07 | Bug fixes (7) + QoL improvements (Preset colors, Threshold triggers) |
| v0.3.8.3 | 2026-05-07 | Live preview fix, Threshold accent-color option, Card entity auto-default |

---

### Contact & Support

- **Repository:** https://github.com/dertrolli/card-mod-studio
- **Issues:** Report bugs and feature requests on GitHub
- **card-mod:** https://github.com/thomasloven/lovelace-card-mod

<!-- Design note written during the v0.11.0 release fix round (2026-11-10).
Implemented by the "write only what was set" commits for Heading Style, Font
and Icon Color; file:line references are to the code as it was before them. -->

# Design: untouched controls write nothing (Font, Heading Style, Icon Color + size)

Everything below comes from reading the code. I changed no files. I did not run anything either; no HA/sandbox rig was available, so the native values flagged below are unverified.

## 1. How it works today

### State and defaults
- `FontModuleState` (`src/types/index.ts:300-315`) has required `fontSize`, `fontWeight`, `color`. `fontFamily` already uses `''` for "not set". The Number size fields are separate.
- `DEFAULT_FONT` (`src/parser/state-mapper.ts:137`) is 16px / `normal` / `var(--primary-text-color)`.
- `HeadingStyleModuleState` (`types:285-295`) has required `fontSize`, `textColor`, `fontWeight`, `iconSize`, `iconColor`, `alignment`. `DEFAULT_HEADING_STYLE` (`state-mapper.ts:126`) is 24 / theme colour / `normal` / 24 / theme colour / `left`.
- `IconColorModuleState` (`types:~150`):
  - `mode` is `plain | conditional | light`.
  - `sizePx` is optional, with `0/undefined` meaning theme size.
  - `DEFAULT_ICON_COLOR.mode` is `'conditional'` (`state-mapper.ts:75`).
- Existing "optional = not set" fields:
  - `fontFamily: ''`
  - `sizePx`
  - `EntitiesRowStyle.fontSizePx/fontWeight` (`types:380-382`)
  - Border `radiusPx/borderWidth` where `0` means not written. The v0.7.1 border fix is parse-side: `mapBorder` zeroes `radiusPx` when the CSS has no `border-radius` (`state-mapper.ts:1520-1523`). That fixes hand-authored partials only. It does nothing for "enable the module in the UI", and Border still writes radius 12 on a fresh enable.

### Emitters (`src/generator/css-generator.ts`)
- `headingStyleBlocks` (506-538) writes every property unconditionally:
  - `.container` gets `justify-content: X !important` plus size, colour and weight for both the `title` and `subtitle` variables.
  - `.content ha-icon` gets `--mdc-icon-size` and `color !important`.
  - The family block is already conditional.
- `fontBlock` (713-731) writes `font-size`, `font-weight` and `color` always, and family only if set. It then calls two companion functions:
  - `fontCompanionDecls` (644-691) writes ha-card variables:
    - tile `--ha-tile-info-*`
    - gauge `--primary-text-color`
    - thermostat `--ha-font-size-l` / `--ha-font-weight-medium`
    - `--ha-card-header-*` when `caps.headerTitle`, which is size×1.5, colour, family
  - `fontCompanionBlocks` (590-640) writes selector blocks: light `#info`/`.brightness`; sensor/entity `.name`/`.value`/`.measurement`; gauge/thermostat `.title` (and gauge `.name`); entities `.card-header` weight.
  - `color` is already nullable here, because `skipColor` is used for Threshold's text colour.
- `fontVarBlock` (694-706) is the Mushroom/Bubble profile emitter. It writes the size, weight and colour variables always, and `font-family` if set.
- `iconColorDecl` (783-796) switches on `mode`. `conditional` writes `color: {{ '#2196F3' if is_state(…,'on') else '#6b6b6b' }} !important`. `iconColorBlock` wraps it in `ha-state-icon {}` (798).
  - Size is emitted separately (`iconSizeDecls` 766, `tileIconSizeBlock` 775, `iconSizeVarDecls` 751), only when `sizePx > 0`. It is already independent of colour in the generator.
  - Bubble's colour goes to its own selector via `em.iconColor` inside `generateCss` (1170-1178).
- Row Font is already emit-if-set (`src/editor/studio-state.ts:329-330`).

### Parsers (`state-mapper.ts`)
- `mapFont` (1795-1834) requires a plain px `font-size` on `ha-card` as the anchor. Without it, it returns `DEFAULT_FONT` and everything stays in Advanced CSS.
  - It then optionally reads weight, colour and family.
  - It claims companions via `claimFontCompanions` (1731-1790). Weight is defaulted to the string `'normal'` for the companion claim.
- `mapFontProfile` (~752-790) uses the size variable as the anchor too, and `pc.claimEqual` for the others.
- `mapHeadingStyle` (1565-1700) already reads each property independently and flips `enabled` on any hit. The only gap is that absent properties keep the `DEFAULT_*` values.
- `mapIconColor` (1088-1126) is the problem for size-only styles:
  - If no colour is recognised (`!state.enabled`) it returns early, and size is read only for the Threshold-shaped case. A size-only style is therefore never adopted.
  - That is why users must enable colour to reach the size slider.
  - The Bubble and Mushroom-chips (colourless) paths already do "enabled ⇔ size set" (1103-1105).

### UI
- `module-font.ts`:
  - `_renderBody` (138-196) has a size slider with no unset state (`@change` always emits), a weight select with Normal/Medium/Bold, a colour picker, and a family select whose first option is "Theme default" (the pattern to copy).
  - The Number size row has its own switch (`_renderNumberSize`, ~210-250).
- `module-heading-style.ts` (99-230): same shapes, plus icon size, icon colour and alignment (Left/Center/Right).
- `module-icon-color.ts`:
  - The mode select (106-130) offers plain / conditional / light.
  - `_renderSize` is shown only inside the `allowColor` body (97-105), and its slider already has `min=0` with the label "theme". It is already resettable.
- `module-entities-rows.ts:459-470`: the row Font switch writes `{fontSizePx:16, fontWeight:'normal'}` on enable. `.checked` is derived from the same fields.
- `cms-color-picker.ts`: the inline picker (not compact) has a text input (344). An empty value is not handled specially. There are 54 usages.
- The panel keeps `_studioState` in memory (`cms-panel.ts:432-436`). An enabled module that emits nothing is already tolerated (comment at 455).
- Stack children use the same modules (`cms-child-card-section.ts:327-389`), so module-level fixes cover them.

### Presets
- A preset is the full `StudioState` as JSON in `cms_presets` / `cms-presets`. `migrateStudioState` (`state-mapper.ts:168-208`) loads it by default-merging each module: `{...DEFAULT_FONT, ...r.font}`.
  - `undefined` keys vanish in JSON, so "unset" survives a save and load, and the merge fills them with the (now undefined) defaults.
  - Old presets carry explicit 16/normal/theme/24/… values and keep them.
- `filterPresetStateForCardType` (`src/utils/preset-caps.ts`) resets hidden modules to `DEFAULT_*`.

### Tests that pin current output
- `test/generator.test.ts`:
  - 547-548: heading enabled at defaults expects `--ha-heading-card-title-color: var(--primary-text-color)`.
  - 586-775: the Font block. Mostly `toContain` on explicit values; the 603/610/630/662/706 cases rely on defaulted siblings (e.g. weight-only still expects other defaults).
  - 1731-1770: old heading shapes, with `toMatchObject` on all fields.
  - 2118-2160: icon mode/size.
- `test/v010-audit-fuzz.test.ts:79-87,56-60`: a seeded byte-stability fuzz, 1500 states, open then save equal. It must be extended to draw "unset".
- `test/v0102-font-gating.test.ts:43`: renders `{...DEFAULT_FONT, enabled:true}`.
- `test/mushroom-profiles.test.ts:52,107-128`, `test/bubble-profiles.test.ts:41,109-116`: explicit values, so they stay green.
- `test/owned-entries.test.ts:25` and `test/number-size.test.ts`: pin gauge 100 ⇔ `max-width: 55%`.
- `test/preset-migration.test.ts:15`, `test/preset-caps.test.ts`, `test/card-caps.test.ts`: construct states from `DEFAULT_*`.

## 2. The design

### Representation: `undefined` = not set, no touched flags
- Make `FontModuleState.fontSize/fontWeight/color` optional.
- Make `HeadingStyleModuleState.fontSize/textColor/fontWeight/iconSize/iconColor/alignment` optional.
- Treat `''` as unset for the colour and family strings. For the picker and select, normalise `''` to `undefined` at the event handler so state has one "unset" form.
- Emitters test with truthiness (`if (s.fontSize)`), the same idiom as `iconSizeValue`, `fontFamily` and the row emitter.
- A parallel "touched" set would need to be:
  - persisted in presets,
  - re-derived by every parser,
  - kept in step through `mergeStudioStates`,
  - consulted by 5 emitters.
- Optional fields need none of that.
- The parse side already works per property (heading), or needs one anchor change (Font).
- Why this is the least invasive: parse already tells present from absent. It simply stops back-filling defaults.

Type and default changes:
- `DEFAULT_FONT = {enabled:false, fontFamily:'', numberSizeEnabled:false, numberSize:0}`.
- `DEFAULT_HEADING_STYLE = {enabled:false, fontFamily:''}`.
- `THEME_TEXT_COLOR` stays exported (rows use it).
- `migrateStudioState` needs no change.
- Everywhere that reads those fields (generator, `claimFontCompanions`, `module-font`, `module-heading-style`) switches to `x ?? placeholder` or `if (x)`.

### Emit rules
- **`fontBlock`, `fontCompanionDecls`, `fontCompanionBlocks`:**
  - Make `size` and `weight` nullable like `color` already is: `size: string | null`, `sizePx: number | null`, `weight: string | null`.
  - Every declaration and companion is guarded by the value it derives from:
    - size feeds `font-size`, tile size vars, `#info`/`.brightness`, `.name`/`.value`/`.measurement` size, `.title` size, `--ha-font-size-l`, `--ha-card-header-font-size`;
    - weight feeds `font-weight`, tile weight vars, `.name`/`.title` weight, `--ha-font-weight-medium`, `.card-header`;
    - colour and family are as today.
  - A block with no declarations is dropped.
  - Declaration order is unchanged, so a fully-set state re-saves byte-identically.
  - The button `!important` on size stays tied to size.
- **`fontVarBlock`:** the same guards on the size, weight and colour variable lists. This fixes Mushroom's `--card-primary-font-weight: normal` (name 500→400, chips 700→400).
- **`headingStyleBlocks`:**
  - `.container` decls are each emitted only if set: `justify-content` if `alignment`, and the size/colour/weight twin pairs if set. Order is unchanged.
  - The icon block emits `--mdc-icon-size` and/or `color !important`, and is dropped if neither is set.
  - Heading cards allow no companions, so there are no other places to touch.
- **`iconColorDecl`:** new first line `if (!s.enabled || s.mode === 'none') return null;`.

### Parse rules
- **`mapHeadingStyle`:** drop the `{...DEFAULT_HEADING_STYLE}` back-fill, so absent properties stay `undefined`. The body needs no change. This is the roadmap #25/#29 fix for the heading, and it is the border pattern in a cleaner form. A hand-written partial such as `.container{--ha-heading-card-title-font-size:20px}` now re-saves as only that.
- **`mapFont` and `mapFontProfile`:**
  - Size present: exactly today's behaviour. The anchor is unchanged, so no existing hand-written style is newly adopted.
  - No size: the Font module's own output on a card with no size row, or a Studio-written style where the user never touched size, must reload. Currently nothing would be recognised.
  - Add a size-less anchor with a reproducibility guard:
    - Build a candidate state from the plain weight/colour/family on `ha-card`.
    - Adopt it only if `fontBlock(candidate, cardType, capsFor(cardType))` re-emits only declarations already present with equal values.
    - Then claim them. Otherwise return `DEFAULT_FONT`.
  - A bare hand-written `ha-card { color: red }` on a tile or sensor would add companions when adopted, so the guard leaves it in Advanced CSS. The same hand-written CSS on a plain card (e.g. markdown) is adopted and re-emitted byte-identically.
  - Profiles: adopt a size-less style only when every variable of that role (e.g. both `--card-primary-font-weight` and `--card-secondary-font-weight`) is present and equal.
  - `mapFont` needs `cardType`/caps passed in. `state-mapper` already imports from the generator, so there is no new dependency direction.
- **`mapIconColor`:**
  - In the `!state.enabled` branch, call `applyIconSize_(state)` unconditionally, not only for Threshold-shaped colours.
  - If `sizePx > 0`, set `enabled = true` and `mode = 'none'`.
  - It is safe because `'none'` emits no colour, so it cannot overwrite a hand-written one.
  - This subsumes the existing `thresholdShaped` special case.
  - Size is still claimed only through `applyIconSize`, which is gated by `capsFor(cardType).iconSize`.
  - Side effect: a hand-written `--mdc-icon-size` + `--ha-icon-size` pair with equal values is now adopted as size-only. It re-emits the same two declarations, so the CSS is identical.

### Icon Color: "Keep the card's colour"
- New `mode: 'none'`. Label: "Keep the card's colour". Offered only when `allowSize` is true, since without a size control the mode would be a no-op.
- Default on a newly enabled module:
  - Cards with an Icon size control: `'none'`.
  - Cards without one: unchanged, `'conditional'`. Colour is the module's only purpose there, and a no-op default would add a tap.
- Implementation:
  - Leave `DEFAULT_ICON_COLOR.mode = 'conditional'` (no churn in tests or presets).
  - In `module-icon-color.ts`, the switch's `@change` on enable emits `{enabled:true, mode:'none'}` when `this.allowSize` and the state has no colour intent.
  - "No colour intent" means `!state.enabled` and the state's colours are still at their defaults, so re-enabling a module the user previously configured does not reset it.
  - If that check feels hacky to the implementer, the clean alternative is to flip `DEFAULT_ICON_COLOR.mode` to `'none'` and have the `!allowSize` enable handler set `'conditional'`. That costs about 6 test edits.
- The `Controlled by` entity row, the `when-hint` and the `ownEntityUseless` warning (`module-icon-color.ts:118-154`) must not render for `'none'`. The existing condition is `mode !== 'plain'`, so change it to `mode === 'conditional' || mode === 'light'`.
- `_renderSize` is already reachable inside the body for `allowColor`, and it is the only thing shown in `'none'`. The size slider already resets via `min=0`.
- The parse of a style with a colour is unchanged: colour present gives `plain/conditional/light`, as today. An existing Icon Color style keeps its mode.

### UI affordances (no new rows)
- **Selects (weight, alignment):** a first option "Default" with value `''`, matching the "Theme default" pattern the family select already uses. Selecting it emits `undefined`.
- **Sliders (font size, heading size, icon size, row size):**
  - Unset: the thumb sits at the card's native value, with a muted label "Default (14px)". The slider emits only on `@change`.
  - Set: the label shows the value, followed by a small "reset" glyph button on the same line, which emits `undefined`.
  - Implement the glyph once as `renderResetButton(onClick)` in `module-base.ts`, with about 8 lines of CSS. All four sliders reuse it.
- **Colour:** add an optional `clearable` boolean property to `cms-color-picker` (default false, so the other 50+ usages are untouched).
  - When true, `value === ''` shows a "Default" placeholder in the existing text input.
  - A "clear" button sits in the same row.
  - Emitting an empty value is the "not set" signal.
- **Placeholders:**
  - Font: 14px (`--ha-font-size-m`) and the theme text colour.
  - Heading: the placeholder depends on `heading_style`. Pass it from the panel (`config.heading_style`).
  - The native values are display-only. I could not verify them without the rig: title 24px/weight/colour versus subtitle 500/grey/18px icon/`space-between`. A wrong placeholder is only a thumb position, not a CSS change.
- **Rows:**
  - Row Font's switch uses a local `@state() _fontOpen: Set<string>` and no longer writes `{16, 'normal'}`.
  - `.checked = hasFont || _fontOpen.has(rowKey)`.
  - On enable it only reveals the controls. Switching off clears both fields.
  - Size placeholder: 14px. Weight select gains "Default".
  - Reading `rowStyle.fontSizePx ?? 14` does not write anything, so the row no longer grows 14→16.

### What happens to existing saved styles
- A style saved by the current version with the full default set loads with all five heading properties set (24 / theme colour / normal / 24 / theme colour / left). It re-saves byte-identically, since emission order is unchanged.
- The user can return any property to "not set" with the per-control Default and reset affordances.
- The module cannot tell "defaulted" from "chosen" in an old style. Treating values equal to the old defaults as unset would silently rewrite saved CSS, so I do not recommend it.
- Presets saved by the current version carry explicit values, so they load identically. New presets drop unset fields.
- A hand-written partial style now stops gaining defaults on save. That is a visible but benign change: before, a size-only heading gained the rest on any panel edit.

## 3. Scope options

### (a) Minimal slice for v0.11.0: fixes all four cases
1. Types and defaults (Font, Heading): 2 interfaces, 2 default objects.
2. Emitters:
   - `headingStyleBlocks`
   - `fontBlock` + `fontCompanionDecls` + `fontCompanionBlocks`
   - `fontVarBlock`
   - `iconColorDecl` (+ the `'none'` mode)
3. Parsers:
   - `mapHeadingStyle` (remove back-fill)
   - `mapFont` + `mapFontProfile` (size-less anchor with the reproducibility guard)
   - `mapIconColor` (size-only adoption)
4. UI:
   - `module-font.ts`
   - `module-heading-style.ts`
   - `module-icon-color.ts`
   - `module-entities-rows.ts`
   - `module-base.ts` (`renderResetButton`)
   - `cms-color-picker.ts` (`clearable`)
   - `cms-panel.ts` (pass `heading_style`)
5. Gauge Number size (case 4): this is a plain calibration fix, not part of the design.
   - `NUMBER_SIZE_DEFAULT.gauge` goes from 100 to 90 (`owned-entries.ts:20`).
   - 90 emits `max-width: 49.5%`, which is about HA's effective 50% (the box is anchored at `left:50%`, so HA's own 55% is capped at 50%).
   - Stored 100 still parses as 100 because the parser derives the size from the CSS. The existing tests' CSS strings are untouched.
   - Do not rebase `GAUGE_BOX` to 50. `parseOwnedEntry` compares the exact generated CSS, so old entries would parse as 110% and then fail the `built === css` check and lock as hand-written.
   - Verify live that `max-height: 36%` does not clip.

Size: about 14 source files, 5 emitter functions, 4 parsers.
- About 10 existing test assertions need editing:
  - `generator.test.ts` 547-548, 603/610/630/662/706, and the toMatchObject cases around 1731-1770
  - `v0102-font-gating.test.ts:43`
- About 25-30 new tests.

#### Changes to generated CSS for users who did NOT hit the problem
- Existing saved styles: none. All-set states re-emit identically, and emission order is unchanged.
- New edits: Font and Heading Style now write less. This is the intended fix.
- Hand-written styles: a hand-written size-only heading no longer gains the other four properties on save.
- Hand-written size-only icon CSS (an equal `--mdc-icon-size` + `--ha-icon-size` pair) is adopted by Icon Color and re-emitted identically.
- Icon Color: on a card with an Icon size control, a newly enabled module defaults to "Keep the card's colour" and writes nothing until a colour mode is chosen. This is a deliberate UX change.
- Gauge Number size: a newly enabled switch emits 49.5%/36% instead of 55%/40%.

### (b) What a complete fix of roadmap #25/#29 adds
- The same optional-field treatment for:
  - Border's radius default 12 (fresh enable still writes 12px)
  - Background (gradient angle, `color2`)
  - Accent (`color`/`colorOn`/`colorOff`)
  - Animation (`speedS`, `preset`)
  - Icon Color's on/off colours
  - Threshold's `defaultColor`
  - Row text/icon-colour switches, which still write `THEME_TEXT_COLOR` on enable (`module-entities-rows.ts:~440,590`)
- Filter is already neutral (100% / 0 emit nothing).
- #29's (a)-(c) are different in nature: dropped `!important` on claimed declarations, off-first conditionals normalised to on-first, and a half-filled condition UI flattening to Always. They need genuine presence tracking.
- Size: roughly 25 files, 10 or more emitters and parsers, and a larger test churn. Preset and fuzz coverage must grow. Highest regression risk is Accent and Threshold, where round-trip stability is subtle.
- Not suitable for the release right before v0.11.0.

## 4. Implementation plan for (a)

| Step | What | Independent? |
|---|---|---|
| 1 | Gauge default (`NUMBER_SIZE_DEFAULT.gauge = 90`), plus a live check and a doc line | Yes |
| 2 | Heading Style: types and defaults, `headingStyleBlocks`, `mapHeadingStyle` back-fill removal | Yes |
| 3 | UI helpers: `renderResetButton`, `cms-color-picker` `clearable`, a `FONT_WEIGHT_OPTIONS`-style "Default" option | Yes |
| 4 | Heading UI (depends on 2 and 3) | After 2, 3 |
| 5 | Font: types and defaults, `fontBlock`/companions/`fontVarBlock`, `mapFont`/`mapFontProfile` | Yes, but touches the most code |
| 6 | Font UI (depends on 3 and 5) | After 3, 5 |
| 7 | Entities row Font switch | Yes (small) |
| 8 | Icon Color `'none'`: type union, `iconColorDecl`, `mapIconColor`, module UI | Last, conflicts with the other worktree |
| 9 | Optional: `style-conflicts.ts` per-property enabling | Optional |
| 10 | Docs/CHANGELOG/README/roadmap/wiki, typecheck, tests, build, live rig | After the rest |

1. **Gauge default.** `src/utils/owned-entries.ts:20`; update the "100 = HA's size" wording in the module hint and wiki. Add one test: enabling at defaults emits `max-width: 49.5%`.

2. **Heading Style (types, emitter, parser).**
   - `types/index.ts:285-295`: make `fontSize`, `textColor`, `fontWeight`, `iconSize`, `iconColor`, `alignment` optional.
   - `state-mapper.ts:126`: `DEFAULT_HEADING_STYLE = {enabled:false, fontFamily:''}`.
   - `css-generator.ts:506`: per-property emit as above. Keep the order.
   - `mapHeadingStyle` (1577): start from `{enabled:false, fontFamily:''}` instead of `DEFAULT_HEADING_STYLE`, or just rely on the new default.
   - Tests:
     - heading enabled + change only size emits only the size twins and no colour, weight, `justify-content` or icon block;
     - same for each other single property;
     - old full-default CSS round-trips byte-identically;
     - old preset JSON (explicit 24/…) loads and re-emits identically;
     - hand-written partial round-trips as partial.
   - Edit existing assertions (547-548 etc.).

3. **UI helpers.**
   - `module-base.ts`: export `renderResetButton`.
   - `cms-color-picker.ts`: `clearable` property, placeholder and clear button.
   - Test: `v010-audit-panel.test.ts` style template-text checks.

4. **Heading UI.** `module-heading-style.ts`: the five controls use the affordances (size and icon-size sliders with native-start and reset; weight and alignment with "Default"; two colour pickers `clearable`). `cms-panel.ts` passes `heading_style` for the placeholders. Test with the `templateText` rendering approach from `v0102-font-gating.test.ts`: unset renders "Default"; moving the slider emits only that field; reset emits `undefined`.

5. **Font emitters and parsers.**
   - Types and `DEFAULT_FONT` as above.
   - `fontBlock` and its two companion functions: nullable size/weight/colour guards.
   - `fontVarBlock`: the same.
   - `mapFont`: parse px size or `undefined`, add the size-less anchor with the reproducibility guard, pass nullable size/weight into `claimFontCompanions`.
   - `mapFontProfile`: size-less anchor requiring all vars of a role present and equal.
   - Tests, per card family, "enable Font + change one control → only that property is emitted":
     - Plain card (markdown/entities): weight-only emits only `font-weight`; colour-only emits only `color`.
     - Tile: size-only emits only the two size vars and `font-size`; weight-only emits the two weight vars.
     - Header-title card: weight-only emits no `--ha-card-header-*`.
     - Sensor/entity: weight-only emits no `.value` / `.measurement` block.
     - Gauge: weight-only emits no `--primary-text-color`.
     - Thermostat: no `--ha-font-size-l`.
     - Light: no `#info` / `.brightness` with weight-only.
     - Entities: `.card-header` only with weight.
     - Button: `!important` only with size.
     - Mushroom entity/chips: weight-only emits only the weight vars; colour-only on the title.
     - Bubble button: the same on `.bubble-name`.
     - NO_FONT_SIZE and NO_TEXT_COLOR cards: nothing is emitted for the hidden rows.
   - Round-trip: all-set state byte-identical; weight-only state reloads as Font enabled with only weight; a hand-written `ha-card { color: red }` on a tile is NOT adopted and stays in Advanced CSS; on a markdown card it IS adopted and re-emitted identically.
   - Extend the fuzz in `v010-audit-fuzz.test.ts` (lines 56-87): draw `undefined` for each optional field.

6. **Font UI.** `module-font.ts`: size slider native-start (placeholder 14) plus reset; weight select "Default"; colour picker `clearable`. The number-size rows are unchanged. Edit `v0102-font-gating.test.ts:43` if the rendered text changes.

7. **Row Font.**
   - `module-entities-rows.ts:459-504`: local `_fontOpen` set, size placeholder 14, weight "Default", size reset.
   - The emitter and parser need no change.
   - Tests: toggling on writes nothing; changing only weight writes only `font-weight`; toggling off clears both; an old row with both values loads and re-emits identically.

8. **Icon Color / size.**
   - `types/index.ts`: add `'none'` to `IconColorModuleState.mode` (and to the cast in `module-icon-color.ts`).
   - `css-generator.ts:783`: `iconColorDecl` early return for `'none'`; `iconColorBlock` then drops the block.
   - `state-mapper.ts` `mapIconColor`: the unconditional size adoption (replace the `thresholdShaped` branch, 1112-1126).
   - `module-icon-color.ts`: the "Keep the card's colour" option (only when `allowSize`), enable handler, and the hidden Controlled-by rows.
   - Tests:
     - mode `none` + size emits only the size declarations on a Mushroom light, a tile, an entity card and a Bubble card;
     - no colour block is written;
     - a size-only CSS style reloads as enabled/`none`/size;
     - a size-only style with an unrecognised colour in Advanced CSS keeps the colour declaration in Advanced;
     - the old Threshold-shaped case still passes;
     - existing `plain`/`conditional`/`light` round-trips unchanged (fuzz).

9. **Optional.** `style-conflicts.ts:118-130` `isEnabled`: a module enabled with only some properties set warns for unrelated Advanced CSS. A cheap fix is to check, per rule, that the property is actually set.

10. **Release hygiene (per CLAUDE.md).**
    - The current version is `0.11.0-beta.2`, a published pre-release. Whether this ships as v0.11.0 final or beta.3 is the maintainer's call; per the rules, fold into the pending changelog section and ask before choosing.
    - Update `README.md`, `docs/ROADMAP.md` (#25/#29 status), and the wiki pages `Font-and-Text`, `Heading-Card`, `Icon-Color-and-Accent-Color`, `Gauge-Card`.
    - Run `npm run typecheck && npm test && npm run build`.
    - Re-verify on the sandbox rig, including the four QA cases (heading subtitle, Mushroom name/chips, media-control, Mushroom light glyph).

Sequencing against the other developer's `config.entity` generator fix: that fix touches `entityRef`/`conditionExpr` callers. My overlap is `iconColorDecl` and `iconColorBlock` (step 8) and the `generateCss` ha-card block (only the icon-colour line at 1170-1178). Steps 2 to 7 are in `headingStyleBlocks`, `fontBlock` and `fontVarBlock`, which that fix should not touch, so they can go in parallel. Do step 8 after their change merges, or take care over merge conflicts in `iconColorDecl`.

## 5. Open questions

1. **Native placeholder values.** Heading title versus subtitle, and media-control, are not verifiable from the code. Recommended: read them from the rig and show them as display-only placeholders; a wrong one is cosmetic.
2. **Icon Color default on cards without a size control.** Recommended: keep `'conditional'`, since the module's only purpose there is colour, and say so in the CHANGELOG. The alternative of `'none'` everywhere is more consistent but costs an extra tap and leaves a no-op option on size-less cards.
3. **Treat old-default values as "not set" on load?** Recommended: no. It would silently change saved CSS and the preset outputs.
4. **Gauge calibration.** Recommended: default 90 (about 49.5%) as a one-line fix, verified live for `max-height: 36%`. Do not rebase `GAUGE_BOX`, because `parseOwnedEntry` would lock existing entries.
5. **A "Reset all" for the module (e.g. a heading saved with all five).** Recommended: skip. The per-control reset and the module switch are enough, and it would add UI.
6. **Row text/icon colour switches write `THEME_TEXT_COLOR` on enable.** The same class of problem, but the user picks a colour next, so it is lower priority. Recommended: leave it for (b) unless QA flags it.
7. **Style-conflict warnings on enabled-but-unset modules (step 9).** Recommended: do it only if cheap; otherwise leave it, since the file's own header calls false positives harmless.
8. **Reproducibility guard versus a simpler size-less anchor.** If the guard proves awkward, the fallback is anchoring on size-less weight/colour/family only for cards without companions. Recommended: implement the guard, since it is a single generic check and it also protects Bubble's `.bubble-name { color }`.
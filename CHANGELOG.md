# Changelog

All notable changes to Card-Mod Studio are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.1-beta.2] — 2026-07-06

**Pre-release**, continuing the 0.7.1 beta cycle. Fixes from live beta.1
testing on a real dashboard.

### Fixed
- **Needle gauges (`needle: true`) now color the needle and value text.**
  In needle mode there's no value arc for `--gauge-color` to drive, so
  beta.1's fix visibly did nothing there. The needle's fill is
  `var(--primary-text-color)` inside `ha-gauge`, which the accent value now
  also drives (with the same inline-style-beating `!important`) whenever the
  card has `needle: true` — needle and value text follow your color, while
  the dial keeps showing the configured segments. The gauge hint in the
  panel now says exactly that.
- **Tile cards: the accent color now actually wins — including tile
  features like the bar gauge.** Same root cause as beta.1's gauge fix, one
  card over: `hui-tile-card` writes its state-computed color as an *inline
  style* on `ha-card` (`--tile-color`), so the Studio's plain declaration
  silently lost whenever the tile computed a color (active/state-colored
  entities — exactly the interesting cases). Now emitted with `!important`,
  which also cascades into `hui-card-features` (`--feature-color` derives
  from `--tile-color`), so bar-gauge/toggle feature rows follow the accent
  color too. Applies to both the Accent Color module and threshold-driven
  accent color.
- **On/off entity pickers are now filtered to entities that actually have
  an on/off state** (switches, lights, binary sensors, input booleans, fans,
  humidifiers, sirens, remotes) — a temperature sensor in a "controlled by"
  list was never going to match `is_state(..., 'on')`. The Icon Color
  "match the light's color" mode filters to lights only. Typing an entity
  outside the filter is still allowed, and value-based pickers (Threshold)
  stay unfiltered.
- **The layout-card message no longer sends you in a circle.** It claimed
  you could open a child card and press Style there — but Home Assistant
  edits stack children *inside the same dialog*, so the button kept binding
  to the container and showing the same message. The banner is now honest
  about the limitation and describes the YAML workaround; real in-place
  child styling is a planned roadmap item.

## [0.7.1-beta.1] — 2026-07-06

A pure correctness release, from a full audit of the codebase (every module
round-trip re-derived from first principles, plus live verification against
real card-mod and real UIX instances). No new features — a long list of
bugs found and fixed, several of them silent data loss.

### Fixed — gauge cards

- **Accent Color on a gauge card never actually applied.** HA's
  `hui-gauge-card` writes its severity-computed color as an *inline style*
  on `<ha-gauge>` on every render, so the `--gauge-color` variable the
  Studio set on `ha-card` was always overridden — silently. The Studio now
  targets `ha-gauge` directly with `!important` (the one thing that beats a
  non-important inline style), verified against a live gauge card. The same
  applies to the Threshold module's accent-color property, so threshold
  rules — including Fade mode — can now genuinely drive a gauge's dial
  color (e.g. a temperature gauge fading smoothly blue→red, something the
  gauge's own discrete `severity` segments can't do). One inherent
  limitation, now noted in the panel: with `needle: true` the value arc
  doesn't exist, and the dial shows your configured segment colors instead.
- The Threshold module no longer offers **Icon Color on cards with no
  reachable icon** (gauge, glance, thermostat, …) — it was a dead checkbox
  generating CSS that matched nothing. On those cards, enabling Threshold
  now starts from a property that's actually visible there (the dial color
  on a gauge, the card background elsewhere), and on gauges the property is
  labelled "Gauge / Accent Color".

### Fixed — "the color won't change" (stale-override class)

- **The companion variables Accent Color emits per card type**
  (`--tile-color`, `--state-icon-color`, climate variables, …) **were never
  re-recognised on reopen** — every edit session dumped them into Advanced
  CSS as stale copies, and since Advanced CSS is emitted last, *the old
  color kept winning over any new one you picked*. They're now claimed
  back into the module when they match; a hand-written companion with a
  deliberately different value still survives in Advanced CSS untouched.
- **Threshold's accent-color property was invisible on tile, thermostat,
  and gauge cards** — it emitted only `--accent-color`, which those cards
  don't read. It now emits the same card-type companions the Accent Color
  module does, sharing one code path.
- Heading's forward-compatible `--ha-icon-size` twin and gradient-shift's
  `background-size: 200% auto` companion had the same leak-into-Advanced
  problem — both are now claimed with their module.

### Fixed — silent data loss

- **Editing anything in the panel destroyed hand-authored styling on
  entities-card rows.** Every save rewrote every row's style from only what
  the Studio recognises (icon/text color), deleting anything else — a
  `font-weight: bold`, an extra selector, everything. Rows now carry their
  unrecognised CSS through edits verbatim (a row-level counterpart of the
  Advanced CSS passthrough), and rows styled in dictionary form (which the
  Studio can't parse yet) are left completely untouched instead of wiped.
- **A hand-authored `@keyframes` or `@media` block was deleted on the first
  save** — the parser skipped @-blocks as unmodelable but nothing preserved
  them. They now pass through to Advanced CSS verbatim (the Studio's own
  `@keyframes cms-*` are excluded — the Animation module regenerates
  those).
- **A standalone hand-authored `transition:` on ha-card was eaten on save**
  when the Filter module was off — claimed by the filter recogniser but
  only ever re-emitted alongside filter declarations. It's now only claimed
  when a filter is actually recognised.
- **`!important` was silently stripped from preserved-but-unrecognised
  CSS** on every round-trip, weakening its specificity. It's preserved now.
- **When `card_mod:` and `uix:` both carried different unrecognised CSS,
  an edit permanently destroyed the inactive key's copy** (the merge kept
  only one, then the save cleared the other key). Differing leftovers are
  now concatenated (active key's last, so it wins conflicts); identical
  mirrored content is kept once.

### Fixed — crashes & presets

- **A preset saved by v0.6.x crashed the panel when loaded** (the threshold
  model changed shape in 0.7.0: singular `property` → `properties[]`, new
  gradient fields; accent colors gained modes). Stored presets are now
  migrated to the current schema on every load, with defaults for anything
  missing — and garbage input can't throw.
- **Loading a preset wiped the card's own preserved Advanced CSS**,
  replacing it with whatever the preset happened to capture. A preset now
  keeps the current card's Advanced CSS unless the preset itself carries
  some.

### Fixed — round-trip fidelity

- **Negative threshold values were silently deleted on reopen** (the rule
  parser's number pattern had no `-?` — freezer/outdoor temperature rules
  simply vanished on the next save).
- **Grayscale was dropped from a conditional filter whenever brightness or
  blur was also set** — the parser only recognised grayscale when the
  other branch was exactly `none`, but the generator emits the remaining
  filters there.
- **An animation triggered by a different entity silently rebound to the
  card's own entity on reopen** — the custom entity in the condition was
  parsed but never read back into the module.
- **A hand-authored `border:` with no `border-radius:` gained the module's
  default 12px radius on save.** Only a radius the CSS actually had is
  emitted now.
- **An 8-digit hex color (with alpha) in a Fade point turned the whole
  gradient gray** — the interpolation math now drops the alpha channel
  instead of falling back to gray.

### Fixed — editor UX

- **Threshold switch-mode rule values and entities-row rule values now
  commit on blur/Enter instead of every keystroke** — the same
  mid-edit-scramble/snap-to-0 class of bug fixed for gradient points in
  0.7.0, in the two spots that hadn't been converted.
- A `uix:` block carrying a per-card `theme:` override (a UIX-only feature
  with no card-mod equivalent) is now recognised as UIX-only by the
  reverse-compatibility warning, the same as macros/billets already were.
- **UIX detection no longer has a false-negative window right after page
  load.** The registry probe (`uix-node`) can lag UIX's frontend resource
  executing by several seconds (observed live); detection now also consults
  `hass.config.components` — backend truth, independent of frontend-load
  timing — so the output-key choice and the reverse-compat warning can't
  flap on a freshly-loaded page.

## [0.7.0] — 2026-07-03

The first big step toward v1.0: making cross-entity styling a first-class,
discoverable feature instead of something only possible by hand-typing an
entity_id, letting one set of threshold rules drive more than one visual
property at once, and adding a genuine smooth-fade alternative to discrete
step rules.

### Added
- **Searchable entity picker everywhere.** Every entity field in the panel
  (Threshold's entity, Animation's custom trigger entity, and every
  "controlled by" field below) uses HA's own `<ha-entity-picker>` (search by
  name, domain icons, autocomplete) via a new shared `cms-entity-picker`
  component, instead of a bare text input you had to get the entity_id
  exactly right in.
- **Icon Color, Background, Filter, and Accent Color can all be controlled
  by a different entity than the card's own** — the same capability
  Threshold and Animation already had, generalized to every conditional
  module. Styling one card's appearance off a *different* entity's state
  (e.g. a toggle card whose icon color reflects a separate status sensor,
  not the toggle entity itself) is now a first-class option everywhere, not
  just something the card's own entity could drive. Available regardless of
  whether the card's own entity has an on/off state at all — a card like
  `button` (whose entity has none) still offers conditional coloring bound
  to a different, toggleable entity, with a clear inline warning if neither
  the card's own entity nor a picked one is toggleable.
- **Accent Color gained the same conditional/entity-binding capability
  every other module already had** — previously static-color-only. Also
  dropped the `--accent-color` CSS-variable name and its explanation from
  the panel; no other module exposes its underlying CSS variable name this
  way, and the code editor is there for anyone who wants to see it.
- **Threshold rules can drive multiple properties at once** — e.g. icon
  color *and* accent color changing together off one shared rule set,
  instead of duplicating the same rules per property. "Apply to" is a set
  of checkboxes; round-trip parsing recognises matching threshold blocks
  across properties and merges them into one module state (a genuine
  mismatch is left alone rather than silently merged, and preserved in
  Advanced CSS instead of dropped).
- **Threshold Colors "Fade" mode** — a genuine alternative to discrete step
  rules: define value→color points (e.g. 0→gray, 150→orange, 220→red) and
  the color blends smoothly between them, clamped at the ends, with a live
  gradient-bar preview and per-point ▲/▼ swap buttons for reordering
  colors without recomputing values by hand. Internally approximated as
  ~32 closely-spaced step rules — HA's sandboxed Jinja2 has no way to build
  a color string from interpolated numbers, so true continuous color math
  isn't reasonably expressible there — but your actual points, not the ~32
  generated ones, come back correctly when reopening the editor, via a
  small marker alongside the real rules in the generated CSS.

### Fixed
- **`ha-state-icon`'s `color` property could be silently claimed by the Icon
  Color recognizer even when it didn't understand the value**, permanently
  blocking Threshold (and Advanced CSS) from ever reading it on save —
  reachable whenever a card had a threshold-driven icon color alongside a
  *different*, unrelated threshold-driven property. Icon Color now only
  claims the property in branches where it actually recognises the value.
- **Gradient mode's colors could fail to apply against real card-mod
  entirely**, with no error anywhere. Root cause: real card-mod's own
  style-string parsing — not this project's — silently drops an entire
  style block the instant a `{`/`}` character appears in any declaration's
  value, even safely inside a quoted string a spec-compliant CSS tokenizer
  would treat as inert. The gradient marker's first encoding was JSON,
  which hit exactly that. Confirmed directly against a live card-mod
  instance by isolating single-character-class variants; fixed by
  switching to a brace-free `value:color,value:color,...` encoding, and
  re-verified end-to-end (Studio UI → generated CSS → real `<hui-card>`
  render → correct `getComputedStyle` color) against both real card-mod
  and a real UIX install independently, rather than trusted from source
  reading alone.
- **Typing a new value into a gradient point could scramble a different
  point's value mid-edit** — the point list re-sorts by value on every
  keystroke, and rows weren't keyed, so Lit's DOM diffing could reuse an
  input element positionally instead of per-point the instant a partial
  value crossed another point's position. Fixed by committing the value on
  blur/Enter instead of every keystroke, and keying the row list by point
  id so a genuine reorder can't steal a focused, in-progress edit.

## [0.6.2] — 2026-07-03

Fixes a real bug in the v0.6.1 threshold color-palette popover, reported
with a screenshot right after v0.6.1 shipped: the popover opened hundreds
of pixels off to the side, half off-screen.

### Fixed
- **The threshold color-palette popover opened far off to the side (or was
  invisible entirely) when used inside HA's real card-edit dialog.** Root
  cause was two-fold, and only reproducible inside the *real* dialog —
  `palette_check.mjs`'s standalone-mounted panel (no `<dialog>` ancestor)
  never exercised either path:
  1. HA's dialog nests a native `<dialog>` two shadow roots deep
     (`ha-dialog` → `wa-dialog` → `<dialog>`), and that `<dialog>` carries
     `transform: matrix(1,0,0,1,0,0)` — an identity matrix with no visible
     effect, but per the CSS spec *any* transform value other than `none`
     still establishes a new containing block for `position: fixed`
     descendants. The popover's `top`/`left` (computed from viewport-relative
     coordinates) were being applied relative to that dialog's own top-left
     corner instead of the viewport, and clipped by its `overflow: hidden`.
  2. The dialog is shown via `showModal()`, promoting it to the browser's
     "top layer" — nothing outside it can paint above it regardless of
     z-index, so naively fixing #1 by rendering the popover into a portal
     on `document.body` made it correctly positioned but fully invisible,
     hidden behind the modal.
  Fixed by rendering the popover into a portal appended as a child of the
  nearest open modal `<dialog>` ancestor when one exists (found by walking
  the *flattened* DOM tree — piercing shadow hosts and `<slot>` assignments,
  not just `parentElement`) — keeping it in the top layer — with position
  computed relative to that dialog's own rect instead of the viewport's,
  since the dialog is now deliberately its containing block. Falls back to
  `document.body` with viewport-relative positioning when there's no dialog
  ancestor (e.g. used standalone, as in `palette_check.mjs`). Verified
  against a live HA instance across six viewport sizes (1920×1080 down to
  800×600) and with a new permanent regression check that opens the real
  dialog and confirms the popover isn't just present in the DOM but
  genuinely clickable at its rendered position, piercing shadow roots via
  nested `elementFromPoint` calls
  (`tools/sandbox/harness/dialog_popover_check.mjs`).

## [0.6.1] — 2026-07-03

UX polish on top of v0.6.0, plus real correctness fixes found while building
it: a consistent color palette for Threshold Colors, a resizable style
dialog, a silent data-loss bug in entities-row threshold parsing, and a
card_mod:/uix: duplication bug reported after v0.6.1's own initial release —
this changelog entry covers everything that shipped under the v0.6.1 tag.

### Added
- **Color palette for Threshold Colors** — `cms-color-picker` gained a
  `compact` mode: a small swatch button that opens a popover with the same
  10-color preset palette already used by Icon Color, plus a raw hex/`var()`
  text field. Used for every threshold rule's color and the default color,
  at both the card level (`cms-threshold-module`) and the entities-card
  row level (`cms-entities-rows-module`), so a consistent palette is always
  one click away instead of hunting down hex values to reuse. The popover is
  `position: fixed` and clamps to the viewport so it can't render off-screen
  or get clipped by an ancestor's `overflow: hidden`.
- **Threshold parser accepts palette `var(--x-color)` values** —
  `parseThresholdJinja`'s rule/default regexes now recognise
  `var(--red-color)`-style tokens (not just hex), so a rule picked from the
  palette round-trips back into a recognised rule instead of falling through
  to Advanced CSS.

### Fixed
- **Style dialog no longer stays pinned to a short card's height when you
  open Style.** Editing a card with few controls (e.g. a tile card) made
  HA size the dialog to fit that short content; switching to the Style tab
  didn't grow it, forcing constant scrolling through a long module list in a
  cramped window. Root cause was two-fold: HA's dialog migrated from
  MDC/MWC to a "Web Awesome" `wa-dialog` wrapping a native `<dialog>`, so the
  legacy `--mdc-dialog-max-height` custom property no longer reaches the
  element that actually controls sizing; and `hui-card-element-editor` is
  `display: inline` by default, on which `min-height` is a CSS no-op. Fixed
  by setting `max-height` directly on the native `<dialog>` (reached through
  two nested shadow roots) and switching the card editor host to
  `display: block` before applying `min-height`. Verified empirically
  against a live HA instance — both fixes were necessary; neither alone
  resolved it.
- **Entities-row threshold default color was silently discarded on every
  re-open of the panel.** `_parseEntityRowCss`'s value-extraction regex
  (`[^;}\n]+`) excluded `}` from the captured value, which truncates *any*
  Jinja `{{ ... }}` expression right before its closing `}}` — the rule
  conditions still parsed correctly, but the trailing `else '<default>'`
  was cut off, so the default color silently fell back to the hardcoded
  `#888888` instead of the value the user actually configured (e.g. a
  palette `var(--grey-color)`). If the user then touched anything else on
  that row, the wrong default got written back into their YAML. Fixed by
  replacing the ad-hoc regex with the existing Jinja-safe `parseCss` (the
  same parser already used for card-level CSS), reused via a new exported
  `parseEntityRowCss` in `state-mapper.ts` — which also makes this path unit
  testable for the first time (9 new tests in `test/parser.test.ts`).
- **Editing an already-styled card left a stale duplicate of the *other*
  key's content sitting alongside the new one, instead of consolidating to
  a single source of truth.** Reported: a card styled under `card_mod:`
  from before UIX was installed, edited after switching to UIX, ended up
  with *both* a new `uix:` block *and* the old, now-dead `card_mod:` block
  still present. On open, the panel now merges settings from **both** keys
  (not just whichever `resolveStyle()` would pick) when both carry real
  content, so a setting that only lives under the currently-inactive key —
  left over from switching engines, or from editing each key separately —
  isn't invisible to the editor or silently dropped on the next save
  (`mergeStudioStates` / `mergeEntityRowStyles` in `state-mapper.ts`, wired
  in via `cms-panel.ts`'s `_buildMergedState`). On save, `applyCardModStyle`
  now writes the merged result to the active key and **clears** the other
  key's `.style` — rename instead of duplicate when only one side had
  content, consolidate-and-clear when both did — rather than leaving it
  stale or syncing it forever. A `uix:` block using macros/billets is still
  never touched (can't be safely parsed into recognised state or determined
  redundant), matching the existing untouchable-content rule. The distinct
  "Copy to card_mod" fix button (for when neither engine can be confirmed
  installed) now has its own implementation that copies `uix.style` into
  `card_mod.style` **verbatim** and deliberately leaves `uix.style` alone —
  it's a defensive fallback-add, not a settings edit, so the new
  clear-the-other-key behavior doesn't apply to it.
- **A style with the same selector declared twice — e.g. a static default
  in one `ha-card { }` block, later overridden by a conditional value in a
  second `ha-card { }` block, a common hand-edited pattern — silently lost
  the second (actually live) declaration entirely, not even preserving it
  in Advanced CSS.** `findTarget`/`findProp` only ever looked at the first
  matching selector, and the "unclaimed → Advanced CSS" reconciliation keys
  purely on `selector+property` strings, so the second block's property
  collided with the first's claim key and was dropped without ever being
  read into any module's state. `parseCss` now coalesces same-selector
  blocks (and de-duplicates repeated properties within one block) using
  real CSS cascade semantics — later declaration wins — before any
  recognizer runs, matching what actually renders. Found via a real
  user-reported card that used exactly this pattern for a threshold
  override; both the coalescing itself and the merge fix above are needed
  to correctly round-trip that card (5 new tests in `test/parser.test.ts` +
  `test/generator.test.ts`, plus a dedicated `test/merge-dedup.test.ts` and
  a new live sandbox check, `tools/sandbox/harness/merge_check.mjs`,
  covering both fixes against a real UIX instance).

## [0.6.0] — 2026-07-03

Adds first-class support for [UIX](https://uix.lf.technology/), the
card-mod-derived HA integration, alongside card-mod — read, generate, and
warn about cross-compatibility correctly regardless of which one (or neither)
is installed. Verified against real running instances of both engines in
Docker (`tools/sandbox/run.sh` and `tools/sandbox/run-uix.sh`), not just
source-reading or unit tests. Fixes #20.

### Added
- **UIX detection** — `isUixInstalled()` probes for UIX's `uix-node` custom
  element, independent of the existing card-mod probe. The "card-mod not
  detected" warning now only shows when neither engine is found.
- **Reads `uix:` style blocks** with the same `uix:` > `card_mod:` precedence
  UIX itself uses, so a card styled under `uix:` (by hand, or by UIX's own
  tooling) reads back correctly into the panel — including entities-card
  **rows**, which carry independent `card_mod:`/`uix:` blocks from the card
  itself.
- **Generates the right key automatically** — output stays `card_mod:` by
  default (UIX fully supports it as a fallback), switching to `uix:` only
  when UIX is installed and card-mod is not. This mirrors a real constraint:
  UIX's own installer refuses to set up alongside a `card-mod.js` Lovelace
  resource, so "both installed" isn't a state its own tooling lets you reach
  — defaulting to `card_mod:` whenever card-mod is present is the safe
  choice, not a guess.
- **Reverse-compatibility warnings** — if a card's styling (or an individual
  entities-card row's) lives only under `uix:` and UIX isn't installed, the
  panel warns about that specific card/row instead of silently rendering
  unstyled, with a one-click "copy to card_mod" fix for plain CSS. `uix:`
  content using macros/billets gets a clear incompatibility warning instead
  (worded differently depending on whether card-mod or UIX is the active
  engine) — those features have no card-mod equivalent and can't be safely
  regenerated by the studio, so there's no valid "fix" to offer, just a
  heads-up.
- **UIX sandbox** (`tools/sandbox/run-uix.sh`) — a second Dockerised HA rig
  running a real UIX integration, set up headlessly through its actual config
  flow. Verifies detection, both style keys, `uix:`-over-`card_mod:`
  precedence, and the live editor's output key against the real integration.
  `tools/sandbox/harness/compat_check.mjs` covers the reverse direction
  (card-mod-only) against the existing card-mod sandbox.

### Correctness details worth knowing
- **Clearing a style clears it under both keys.** If you clear all styling on
  a card that has stale content under the *other* key (e.g. old `card_mod:`
  from before you switched to UIX-only), that stale value is cleared too —
  otherwise it would silently reactivate via whichever engine's fallback
  precedence applies, so "clear" wouldn't actually mean no styling.
- **Editing card_mod: keeps a plain uix: value in sync** (UIX prioritizes
  `uix:` over `card_mod:`, so without this a card_mod edit could silently
  have no visible effect under UIX) **but never touches a uix: block using
  macros/billets** — that's hand-authored content the studio can't safely
  regenerate, so it's left untouched rather than silently overwritten. An
  info banner explains when this applies.
- **Editing uix: directly does overwrite existing macro/billet content**,
  since (unlike the case above) there's no fallback key to preserve it in —
  the panel warns about this before it happens rather than silently
  proceeding or silently doing nothing.
- Explicit-but-empty style values (`uix: {style: ''}` or `{style: {}}`) are
  treated as "not set," matching UIX's own effective behavior, so they can't
  accidentally mask a real `card_mod:` fallback.

## [0.5.0] — 2026-06-25

A UX-focused release that overhauls the confusing conditional ("if state")
controls, makes the threshold stack understandable, corrects which controls each
card type offers, and adds a width-responsive layout. **No generated CSS changed
for existing configs** — the underlying data model is untouched, so dashboards
built with 0.4.x round-trip identically.

### Added
- **Unified "Apply when" control** across Background, Visual Filters, and
  Animation: one consistent label, ordering, and wording, plus a plain-language
  hint under each describing exactly what triggers the style (e.g. "Applies the
  grayscale only while this card's entity is off").
- **Threshold "Result" legend** — a read-only "first match wins (top to bottom)"
  summary that lists every rule in its real evaluation order with colour
  swatches, ending in the default. You can now see which value maps to which
  colour, and rules are sorted automatically so input order no longer matters.
- **Width-responsive editor** — on narrow editors (mobile, slim side panels) the
  live preview now stacks below the controls instead of crowding them into a thin
  column.
- **Real-Home-Assistant testing sandbox** (`tools/sandbox/`): a Dockerised HA +
  Playwright harness that renders both cards and the editor panel and measures
  real computed styles, plus `docs/CARD_SUPPORT_MATRIX.md` documenting which
  settings actually take effect per card type.

### Changed
- **Per-card module availability corrected** (each decision verified in a real
  dashboard, not a mock):
  - **Heading:** Background and Border are hidden — a heading card has no painted
    `ha-card` box, so they had no effect. Heading Style is unchanged.
  - **Glance:** Icon Color is hidden — the icon lives in a nested `state-badge`
    shadow root that a card-mod rule can't reach.
  - **Alarm-panel** and **Media-control:** Icon Color is now offered — both
    honour it (they were wrongly hidden before).
- **Icon Color** mode labels are clearer ("One fixed color" / "Different for
  ON / OFF" / "Match the light's color") with an explanatory hint.
- **Conditional ON/OFF options are gated on entity state** — cards without an
  on/off state (sensor, gauge, …) no longer offer conditions that can never
  match; they show "Always applies …" instead. Existing on/off values are
  preserved and stay editable.
- **Heading icon size** now emits a `--mdc-icon-size` + `--ha-icon-size` fallback
  chain so sizing survives the deprecation of MDC custom properties in HA.

### Fixed
- The state-aware gating never actually engaged: `stateAware` / `isLightCard`
  were bound as boolean **attributes** that default to `true`, so binding `false`
  on a fresh element left them `true` (a Lit footgun). Switched to property
  binding — verified in the sandbox that a sensor now correctly hides ON/OFF.

## [0.4.1] — 2026-06-25

Maintenance release: correctness fixes, consistency cleanup, and new
documentation. No new features.

### Fixed
- **Entities card:** per-row **threshold** styles (icon/text color rules) were
  silently dropped when the card was saved. The save path only checked for
  static colors, which are empty by design in threshold mode, so threshold rows
  were treated as "unstyled" and their `card_mod` was removed.
- **Icon Color on non-state-aware cards** (e.g. `sensor`): the editor showed a
  single color picker, but the generator still emitted an
  `is_state(config.entity, 'on')` template that never matches — so the icon
  rendered the *off* color instead of the chosen one. Non-state-aware cards now
  emit a plain static color.

### Changed
- **Installation is now via the HACS default store** — Card-Mod Studio was
  accepted into HACS, so no custom repository is required. README badge and
  install instructions updated accordingly.
- The style panel header now shows the real version from `package.json` instead
  of a hardcoded string.
- All repository references updated from `card-mod-visual-editor` to
  `card-mod-studio` (README, docs, and the in-app "report an issue" link).

### Removed
- Dead/unused code: `utils/debounce.ts`, `utils/hass-helpers.ts`, and the unused
  shadow-DOM helpers in `utils/dom-helpers.ts`.
- Stale committed `dist/card-mod-studio.js` — `dist/` is gitignored and the
  release artifact is built by CI on tag.

### Docs
- Added **`docs/COMPATIBILITY_AUDIT.md`** — an output-level audit against
  card-mod 4.x and Home Assistant 2026.6.
- Added **`docs/ROADMAP.md`** — consolidated forward plan.
- Corrected the injection docs (`docs/DEVELOPMENT.md`, `docs/PHASE-1.md`) to
  describe the actual `hui-dialog-edit-card` injection approach.

## [0.4.0] — 2026-05

- HACS preparation: validation CI, badges, attribution, and metadata.

Earlier version history (Phases 1–6) is documented in
[`README.md`](README.md#implementation-status) and the files under `docs/`.

[0.7.1-beta.2]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.7.1-beta.2
[0.7.1-beta.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.7.1-beta.1
[0.7.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.7.0
[0.6.2]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.6.2
[0.6.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.6.1
[0.6.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.6.0
[0.5.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.5.0
[0.4.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.4.1
[0.4.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.4.0

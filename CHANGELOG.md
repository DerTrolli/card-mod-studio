# Changelog

All notable changes to Card-Mod Studio are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0-beta.4] — 2026-07-03

**Pre-release**, continuing the same 0.7.0 beta cycle — see the note under
`[0.7.0-beta.1]` below for what that means. Two real bugs found while
dogfooding `beta.3` against a real card.

### Fixed
- **Gradient (Fade) mode's colors never actually applied against real
  card-mod** — reported as "the color isn't changing at all," and it
  wasn't: real card-mod's own style-string parsing silently fails to apply
  *any* declaration in a block the instant a `{`/`}` character appears in a
  CSS custom property's value — even safely inside a quoted string, which
  a spec-compliant CSS tokenizer would treat as inert text. The `beta.3`
  gradient marker was JSON (`--cms-gradient-stops: '[{"v":0,...}]'`), which
  hit exactly that. No error, no warning — the whole style block was just
  silently dropped. Confirmed directly against a live card-mod instance by
  isolating single-character-class variants (this took real live testing
  to catch; it wasn't visible from the generated CSS just *looking*
  syntactically valid, because it is — the bug is in card-mod's own
  parsing, not CSS's). Fixed by switching the marker to a brace-free
  `value:color,value:color,...` encoding — same information, no JSON.
  Re-verified against real card-mod end-to-end (Studio UI → generated CSS
  → real `<hui-card>` render → correct `getComputedStyle` color) rather
  than trusting the fix from source reading alone.
- **Typing a new value into a gradient point could scramble a different
  point's value mid-edit** — e.g. selecting "140" and typing "2" (partway
  through typing "200") could, the instant the partial value sorted before
  another point, silently redirect the rest of your keystrokes into that
  *other* point's now-relocated input field. Caused by two compounding
  issues: the point list re-sorts by value on every keystroke (`input`
  event), and the rows weren't keyed, so Lit's DOM diffing reused input
  elements positionally rather than per-point. Fixed both ways: the value
  field now commits on blur/Enter (`change` event) instead of every
  keystroke, so no reorder happens mid-edit; and the row list now uses
  Lit's keyed `repeat()` (by point id), so even a genuine reorder can't
  cause a focused, in-progress edit to jump to a different point.

## [0.7.0-beta.3] — 2026-07-03

**Pre-release**, continuing the same 0.7.0 beta cycle — see the note under
`[0.7.0-beta.1]` below for what that means.

### Added
- **Threshold Colors can now fade smoothly instead of switching at fixed
  points.** A new "Value mode" choice — **Step** (the original behavior:
  color switches abruptly at each rule) or **Fade** (new: define value→color
  points, e.g. 0→gray, 150→orange, 220→red, and the color blends smoothly
  between them, clamped to the nearest end outside that range) — with a
  live gradient-bar preview in the editor. This replaces the old
  rules-with-a-"default"-catch-all model for anyone who wants a genuine
  gradient rather than discrete steps, and sidesteps a real point of
  confusion the old model had: a "default" color is really "below the
  lowest rule," not "the extreme/alarm case," which is easy to set up
  backwards (found from a real report — a sensor showing red at both a
  clearly-safe low reading and the intended high-alarm reading, because
  the default color had been set to the alarm color without realizing
  default fires below the lowest threshold, not above the highest one).
  Under the hood, Fade mode is approximated as ~32 closely-spaced Step
  rules (HA's sandboxed Jinja2 has no way to build a color string from
  interpolated numbers, so true continuous color math isn't reasonably
  expressible there) — invisible at normal sensor update rates, and reuses
  all the same entity-binding/multi-property machinery Step mode already
  has. Your actual points (not the ~32 generated ones) are recovered
  correctly when reopening the editor, via a small marker alongside the
  real rules in the generated CSS.
- **Fade-mode points can be reordered with ▲/▼ swap buttons** — swaps the
  colors between two adjacent points while keeping their values fixed
  (editing a point's value directly already re-sorts it to the right
  position automatically; these buttons are for "these two colors are
  backwards" without recomputing any values by hand).

## [0.7.0-beta.2] — 2026-07-03

**Pre-release**, continuing the same 0.7.0 beta cycle — see the note under
`[0.7.0-beta.1]` below for what that means. Bug fixes found while dogfooding
`beta.1` against a real dashboard (a `button` card, whose entity has no
on/off state of its own).

### Fixed
- **Icon Color and Accent Color couldn't be set to "Different for ON/OFF"
  at all on cards whose own entity has no on/off state** (e.g. a `button`
  card) — the mode dropdown was hidden outright, so there was no way to
  reach the "controlled by a different entity" option `beta.1` had just
  added, even though binding to a *different*, toggleable entity would
  have worked fine. Both modules now always offer the conditional mode;
  when the card's own entity genuinely has no on/off state and no other
  entity has been picked yet, an inline warning explains why (rather than
  the mode silently doing nothing).
- **Accent Color had no conditional/entity-binding option at all** — it was
  static-color-only, unlike every other conditional module. It's now on
  equal footing with Icon Color: a mode switch (one fixed color / different
  for ON-OFF), on/off colors, and a "Controlled by" entity picker.
- **The `--accent-color` CSS-variable name and its explanatory paragraph
  were shown in the Accent Color panel** (`Color (--accent-color)`, "Sets
  `--accent-color` on ha-card…") — no other module exposes its underlying
  CSS variable name this way, and it wasn't adding anything a user editing
  visually needs; removed. (Anyone who wants to see the generated CSS
  already has the code editor for that.)

### Verified
- Reproduced the exact reported scenario live against HA's real card-edit
  dialog (not a synthetic mount) — a `button` card, entity with no on/off
  state, both modules' "Controlled by" picker fully on-screen at 900px
  width, picking a different entity reaching the emitted `card_mod.style`.
  See `tools/sandbox/harness/button_card_binding_check.mjs`.

## [0.7.0-beta.1] — 2026-07-03

**Pre-release** — install manually or via HACS with beta versions enabled
for this repository; not yet the default update for existing installs. Once
this settles, a final `[0.7.0]` entry will replace this heading rather than
sitting alongside it (this section's history will just be folded into that
one — beta iterations aren't separate shipped versions of their own).

The first step of a broader push toward v1.0: making cross-entity styling a
first-class, discoverable feature instead of something only possible by
hand-typing an entity_id, and letting one set of threshold rules drive more
than one visual property at once.

### Added
- **Searchable entity picker everywhere.** Every entity field in the panel —
  Threshold's entity, Animation's custom trigger entity, and the new
  "controlled by" fields below — now uses HA's own `<ha-entity-picker>`
  (search by name, domain icons, autocomplete) via a new shared
  `cms-entity-picker` component, instead of a bare text input you had to get
  the entity_id exactly right in.
- **Icon Color, Background, and Filter can now be controlled by a different
  entity than the card's own** — the same capability Threshold and
  Animation already had, generalized to every conditional module. This is
  the direct fix for "style this card's icon/background off a *different*
  entity's on/off state" (e.g. a toggle card whose icon color reflects a
  separate status sensor, not the toggle entity itself): Icon Color gained a
  "Controlled by" entity field in conditional/light mode; Background and
  Filter gained a "While another entity is ON…" option alongside their
  existing Always/On/Off choices, matching the option Animation already had.
- **Threshold rules can now drive multiple properties at once** — e.g. icon
  color *and* accent color changing together off one shared rule set,
  instead of needing to duplicate the same rules once per property. "Apply
  to" is now a set of checkboxes instead of a single dropdown. Generated CSS
  emits one block per selected property, all sharing the same computed
  Jinja2 expression; round-trip parsing recognises matching threshold blocks
  across properties and merges them back into one module state (a genuine
  mismatch — two different properties driven by different rules/entities —
  is left alone rather than silently merged, and the second one is
  preserved in Advanced CSS instead of being merged incorrectly or dropped).

### Fixed
- **`ha-state-icon`'s `color` property could be silently claimed by the Icon
  Color recognizer even when it didn't understand the value**, permanently
  blocking Threshold (and Advanced CSS) from ever reading it on save. This
  was latent before this release too — reachable whenever a card had a
  threshold-driven icon color alongside a *different*, unrelated
  threshold-driven property (e.g. accent color with its own separate rule
  set) — but was only found while building the multi-property threshold
  support above and testing that exact "two different threshold configs on
  one card" case. Icon Color now only claims the property in the branches
  where it actually recognises and uses the value.

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

[0.7.0-beta.4]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.7.0-beta.4
[0.7.0-beta.3]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.7.0-beta.3
[0.7.0-beta.2]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.7.0-beta.2
[0.7.0-beta.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.7.0-beta.1
[0.6.2]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.6.2
[0.6.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.6.1
[0.6.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.6.0
[0.5.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.5.0
[0.4.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.4.1
[0.4.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.4.0

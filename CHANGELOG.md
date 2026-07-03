# Changelog

All notable changes to Card-Mod Studio are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.1] — 2026-07-03

UX polish on top of v0.6.0, plus a real correctness fix found while building
it: a consistent color palette for Threshold Colors, a resizable style
dialog, and a silent data-loss bug in entities-row threshold parsing.

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

[0.5.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.5.0
[0.4.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.4.1
[0.4.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.4.0

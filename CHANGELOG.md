# Changelog

All notable changes to Card-Mod Studio are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **UIX support** — Card-Mod Studio now detects [UIX](https://uix.lf.technology/)
  (a card-mod-derived HA integration) alongside card-mod, and reads `uix:` style
  blocks with the same precedence UIX itself uses (`uix:` over `card_mod:`).
  Generated output stays `card_mod:` by default (UIX supports it as a fallback),
  switching to `uix:` only when UIX is installed and card-mod is not. The
  "card-mod not detected" warning now only shows when neither engine is found.
  Fixes #20.
- **Reverse-compatibility warning** — if a card's styling lives only under
  `uix:` (e.g. you've since uninstalled UIX and gone back to card-mod), the
  panel now warns specifically about that card instead of showing nothing
  wrong, with a one-click "copy to card_mod" fix for plain CSS. Cards whose
  `uix:` block uses macros/billets get a clear incompatibility warning instead
  — those features have no card-mod equivalent, so there's no valid fix to offer.

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

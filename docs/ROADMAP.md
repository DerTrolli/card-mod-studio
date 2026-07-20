# Card-Mod Studio — Roadmap

**Last updated:** 2026-07-20 · **Current version:** v0.9.0-beta.1 (pre-release) — v0.9.0-beta.2 (preview picker per-card coverage: button/entity/sensor/gauge/markdown/glance/media/picture text → Font, graph/features/dial → Accent) is code-complete on this branch, pre-release pending

Phases 1–7 are complete (scaffold → parser → visual modules → config
integration → card-type awareness → 2-column layout + presets → entities per-row
styling → HACS prep). This document is the forward-looking plan — the original
phase-by-phase planning docs it superseded (`CARD_TYPE_PLAN.md`,
`docs/BUG_FIX_PLAN.md`, `docs/PHASE-1.md`) have been retired now that their
content is either shipped or captured here.

Priorities reflect both user value and the findings in
[COMPATIBILITY_AUDIT.md](COMPATIBILITY_AUDIT.md).

## Path to v1.0

The goal for v1.0 isn't "every card-mod/UIX feature" — it's that Card-Mod
Studio is a confident, professional default for styling HA's built-in cards
without touching CSS or Jinja2 by hand: state-driven styling off *any*
entity/attribute, a real color system, and correct editing inside nested
dashboard layouts. Rough shape (effort, not calendar time):

| Version | Theme | Contents |
|---|---|---|
| v0.7 ✅ | Entity binding foundation | **Shipped** — see below. Searchable entity picker everywhere; Icon Color/Background/Filter can target a different entity than the card's own; Threshold rules can drive multiple properties at once. |
| v0.8 ✅ | Structure + color system | **Shipped** — stack child styling (per-child styling sections for vertical-stack/horizontal-stack/grid, written into each child's own config) + a Font module (size/weight/family/color, closing [#25](https://github.com/dertrolli/card-mod-studio/issues/25)) in beta.1; beta.2 added the per-card font companions the beta test demanded (light/button/sensor/gauge/thermostat/entities title/heading weight+family/per-row fonts), the form-editor `uix:` rejection shim, the Color Palette Manager (custom colors in every picker + ON/OFF default overrides, cross-device storage), and attribute-based thresholds (item #16 below — done). |
| v0.9 | Depth | Property-level templating beyond color (border width, icon size, blur/opacity driven by entity state — natural extension of v0.7's entity binding). Plus dict-form/`$`-pierce round-trip safety (item #1 below), which unblocks nested-shadow-DOM targets (glance icon, Mushroom/Bubble). |
| v1.0 | Structural completeness | The remaining container gaps (item #7 — `conditional` cards, containers nested in containers, per-row styling of nested entities cards) + tile feature-row styling (item #9) + preset/import-export polish (items #12/#13). |
| Post-1.0 | Stretch | Official Mushroom/Bubble selectors, a multi-entity AND/OR condition builder, a visual animation builder, bulk dashboard key migration (item #22). |

## Recently shipped (v0.8.0)

The v0.8 cycle consolidated (beta.1–beta.4). Stack child styling and the
Font module (below, from beta.1), plus beta.2's per-card font companions
(light/button/sensor/gauge/thermostat/list-card titles — with the gauge and
thermostat value-number *size* documented as unreachable), the
hui-form-editor `uix:` rejection shim, per-row fonts (incl. entities cards
nested in stacks and bare-string rows), the Color Palette Manager,
attribute-based thresholds, and beta.4's README overhaul with regenerated,
annotated screenshots (`tools/sandbox/harness/readme_shots.mjs`).

Beta.3's UX/consistency pass (no generator/parser changes): Heading Style
mirrors the Font module (order, labels, and the Custom… font-family
free-text option); per-row font uses the same slider controls; the row
threshold builder uses the card builder's wording (its "top to bottom"
label was simply wrong — rows auto-sort too); threshold border width is a
slider like the Border module; Palette-Manager ON-defaults now seed every
freshly-enabled control (row icon color, threshold rules, fade points) —
not just the card-level modules; the "styled" indicator dot is one size and
color everywhere; Advanced CSS opens via the standard chevron header. See
`CHANGELOG.md` for the itemized list.

### The beta.2 fix round in detail

Beta.1's live font-module test round (project owner, real dashboard) showed
the plain-inheritance approach fails on every card that overrides fonts
internally. Beta.2 fixes all of it plus the rest of the planned v0.8 cycle:

- **Per-card font companions** — light (`#info`/brightness), button
  (`!important` vs the adopted-stylesheet cascade), sensor/entity
  (`.name`/`.value` at 1.75×/`.measurement`), gauge + thermostat (`.title`,
  value-text color via variables), entities-and-friends card **titles**
  (`--ha-card-header-*`), heading weight/family. Two documented
  unreachables: gauge value-text *size* (SVG auto-scale) and the
  thermostat's big number *size* (hard-coded 57px, no hook).
- **Form-editor shim** — HA's newer schema-driven card editors
  (`getConfigForm()`) rejected any card carrying `uix:`/`card_mod:` into
  YAML-only mode ("Key 'uix' is not expected"); neither engine patches that
  path (upstream gap, reported to UIX). The injector now shims the form
  editor's validation to ignore both keys.
- **Per-row fonts + rows-in-stacks** — per-entity font size/weight
  overrides; the per-entity rows section now also appears for an entities
  card nested in a stack; bare-string rows (`entities: [sensor.a]`) are now
  styleable at all (they were silently skipped — promoted to object form
  only when styled).
- **Color Palette Manager** — named custom colors as swatches in every
  picker + ON/OFF default overrides, stored per HA user like presets.
- **Attribute-based thresholds** (item #16 — done) — "Value read from"
  selector per threshold; generates/round-trips `state_attr(...)` Jinja.

### The beta.1 feature round in detail

- **Stack child styling** — vertical-stack/horizontal-stack/grid cards show
  one styling section per child, each with the full module set for that
  child's card type, written into the child's own `card_mod:`/`uix:` block.
  Went from "planned for v1.0 via embedded-editor hooking" to shipped in a
  day once the simpler framing landed (proposed by the project owner):
  a container's `cards:[]` is the same shape as an entities card's
  `entities:[]` rows, and both engines natively apply a child's own style
  block — so no editor hooking is needed at all. The open/save pipeline was
  extracted to `src/editor/studio-state.ts` and is now literally shared
  between top-level cards and stack children (the merge-dedup test suite
  exercises the real exported functions instead of a mirror).
- **Font module** ([#25](https://github.com/dertrolli/card-mod-studio/issues/25))
  — text size, weight, family, and color for cards other than headings
  (entities-card rows, markdown, tile, sensor, glance, …). Most cards
  needed nothing special — `font-size`/`color`/`font-family` are genuinely
  inherited CSS properties that reach them from `ha-card` with no shadow
  piercing. Tile cards were the exception, and a genuinely new instance of
  the gauge/tile "component reads its own CSS variable" class of bug from
  v0.7.1: `<ha-tile-info>` reads `--ha-tile-info-{primary,secondary}-*`
  variables rather than the plain properties it'd normally inherit, so the
  naive form silently did nothing there — caught by live-testing the naive
  form as a negative control (see `docs/DEVELOPMENT.md`), not source
  reading alone.

## Recently shipped (v0.7.1)

A pure correctness release from a full-codebase audit (agent-assisted code
review of every parser/generator round-trip + primary-source re-verification
of the card-mod/UIX compatibility assumptions + live checks against both
engines). Highlights — see `CHANGELOG.md` for the complete list:

- **Gauge and tile colors finally work** — Accent Color (and Threshold's
  accent-color property, including Fade mode) now actually recolors a gauge
  card's arc, a needle gauge's needle + value text, a tile card's icon on
  active/state-colored entities, and tile feature rows (bar gauge/toggle).
  Root cause across all of them: HA writes these colors as *inline styles*
  per render (`--gauge-color` on `<ha-gauge>`, `--tile-color` on the tile's
  `ha-card`), which silently beat the Studio's inherited variables; the fix
  is `!important` on the right target (see `docs/DEVELOPMENT.md`'s
  inline-styleMap pattern note).
- **"The color won't change" stale-override class fixed** — Accent Color's
  per-card-type companion variables leaked into Advanced CSS on every
  reopen and, being emitted last, overrode every newly-picked color.
- **On/off "controlled by" entity pickers filter to genuinely toggleable
  domains**; the layout-card banner no longer promises a per-child Style
  button that doesn't exist (see item #7).
- **Several silent data-loss paths closed**: entities-row hand-authored CSS
  wiped by any unrelated edit (rows now have their own invisible
  Advanced-CSS passthrough); hand-authored `@keyframes`/`@media` deleted on
  first save; standalone `transition:` eaten; `!important` stripped from
  preserved CSS; differing `card_mod:`/`uix:` leftovers destroying one side
  on merge.
- **Pre-0.7.0 presets no longer crash the panel** — stored presets are
  schema-migrated on load.
- Round-trip fidelity: negative threshold values, grayscale+brightness
  combinations, custom-entity animation triggers, hand-authored borders
  (no more invented 12px radius), 8-digit hex in Fade points.

## Recently shipped (v0.7.0)

- **Searchable entity picker everywhere** — every entity field (Threshold's
  entity, Animation's custom trigger, and the new "controlled by" fields
  below) now uses HA's own `<ha-entity-picker>` via a shared
  `cms-entity-picker` component, instead of a bare text input.
- **Cross-entity control for Icon Color, Accent Color, Background, and
  Filter** — these modules can now be driven by a different entity than the
  card's own, matching what Threshold and Animation already supported.
  Directly answers the most-requested pattern: styling one card's appearance
  off a *different* entity's state (e.g. a button card's icon reflecting a
  separate status sensor).
- **Icon Color and Accent Color's conditional mode is no longer hidden on
  cards whose own entity has no on/off state** (e.g. a `button` card) — it
  now always offers "Different for ON/OFF," with a clear warning if neither
  the card's own entity nor a picked "controlled by" entity is toggleable.
  Dropped the `--accent-color` CSS-variable name/explanation from the
  Accent Color panel — no other module exposes its underlying variable.
- **Multi-property threshold rules** — one shared rule set can now drive
  several CSS properties at once (e.g. icon color *and* accent color
  together), instead of needing the same rules duplicated per property.
- **Threshold Colors "Fade" mode** — an alternative to discrete step rules:
  define value→color points and the color blends smoothly between them,
  clamped at the ends. Approximated internally as ~32 tightly-spaced step
  rules (reusing the existing engine) but round-trips back to your actual
  points, not the generated ones, on reopen. Points can be reordered with
  ▲/▼ swap buttons.
- **Fixed a latent silent-data-loss bug** in the Icon Color recognizer
  (claimed `ha-state-icon.color` even when it didn't understand the value,
  permanently blocking Threshold/Advanced CSS from ever reading it) — found
  while testing the multi-property threshold work.
- **Fixed: Gradient mode's colors could fail to apply against real
  card-mod.** The internal marker property originally encoded the gradient's
  anchor points as JSON; real card-mod's own parsing silently drops an
  entire style block the instant a `{`/`}` character appears anywhere in a
  custom property's value, even inside a quoted string. Switched to a
  brace-free encoding, verified end-to-end against both a live card-mod and
  a live UIX instance.
- **Fixed: typing a new value into a gradient point could scramble a
  different point's value mid-edit**, because the list re-sorted on every
  keystroke with unkeyed rows. Value now commits on blur/Enter; rows are
  keyed by point id.

## Recently shipped (v0.6.1)

- **Consistent color palette for Threshold Colors** — the compact swatch +
  popover picker already used elsewhere now covers every threshold rule
  color and default color, at both the card and entities-row level, instead
  of hand-typed/copy-pasted hex values. `parseThresholdJinja` recognises
  `var(--x-color)` palette tokens so a picked preset round-trips correctly.
- **Resizable style dialog** — opening Style on a short-content card (e.g.
  tile) no longer traps the module list in the card's original short dialog
  height. Root-caused to HA's MDC → "Web Awesome" dialog migration (stale
  `--mdc-dialog-max-height` targeting) plus `hui-card-element-editor`
  defaulting to `display: inline` (on which `min-height` is a no-op) — fixed
  both, verified live.
- **Fixed silent data loss in entities-row threshold parsing** — the
  default color of a per-row threshold rule was being discarded on every
  panel re-open (regex truncation at the Jinja `{{ ... }}` boundary),
  silently replaced with a hardcoded fallback. Found while building the
  palette feature above; fixed by routing through the existing Jinja-safe
  `parseCss` instead of an ad-hoc regex. Now unit tested
  (`parseEntityRowCss` in `state-mapper.ts`).
- **Fixed card_mod:/uix: duplication on edit** — editing an already-styled
  card left a stale copy of the *other* key sitting alongside the new one
  instead of consolidating to a single source of truth. The panel now merges
  settings from both keys on open (`mergeStudioStates`/`mergeEntityRowStyles`)
  so nothing is lost, and clears the inactive key on save instead of leaving
  it stale or syncing it forever (`applyCardModStyle`). The separate "Copy to
  card_mod" fix button keeps its own verbatim-copy behavior, since it exists
  specifically for when neither engine can be confirmed installed.
- **Fixed silent CSS data loss when a selector is declared twice** — a
  hand-edited pattern (static default in one `ha-card { }` block, later
  overridden by a conditional value in a second `ha-card { }` block) made
  the second, actually-live declaration vanish during parsing instead of
  either being recognised or falling through to Advanced CSS. `parseCss`
  now coalesces same-selector blocks using real CSS cascade semantics
  (later declaration wins) before any module recognizer runs. Found via a
  real user-reported card and required to correctly round-trip it alongside
  the merge fix above.

## Recently shipped (v0.6.2)

- **Fixed the threshold color-palette popover opening far off-screen (or
  invisible) inside HA's real card-edit dialog** — reported with a
  screenshot right after v0.6.1 shipped. HA's dialog nests a native
  `<dialog>` two shadow roots deep that carries a CSS transform (breaking
  `position: fixed`'s normal viewport-relative behavior for any descendant)
  and is shown via `showModal()` (browser "top layer" — no z-index outside
  it can paint above it). The popover now renders into a portal appended as
  a child of that dialog when one is present (staying in the top layer),
  positioned relative to the dialog's own rect instead of the viewport's;
  falls back to `document.body`/viewport-relative when there's no dialog.
  Verified live across six viewport sizes with a new permanent check that
  opens the real dialog and confirms the popover is genuinely clickable at
  its rendered position, not just present in the DOM
  (`tools/sandbox/harness/dialog_popover_check.mjs`) — the standalone-
  mounted `palette_check.mjs` has no `<dialog>` ancestor and could never
  have caught this.

## Recently shipped (v0.6.0)

- **UIX support** — detects [UIX](https://uix.lf.technology/) (a card-mod-derived
  HA integration) alongside card-mod, reads `uix:` style blocks with UIX's own
  `uix:` > `card_mod:` precedence, and switches generated output to `uix:` only
  when UIX is installed and card-mod is not (`card_mod:` stays the default —
  UIX fully supports it as a fallback). Verified against a real running UIX
  integration in Docker, not just source-reading — see `tools/sandbox/run-uix.sh`.
- **Reverse-compatibility warning** — a card (or an individual `entities`-card
  **row** — checked independently, not just the top-level card) styled only
  under `uix:` now gets a specific warning (with a one-click "copy to
  card_mod" fix for plain CSS) if UIX isn't installed, instead of silently
  rendering unstyled. `uix:` content using macros/billets gets an
  incompatibility warning instead (worded differently depending on whether
  card-mod or UIX is the active target — see `usesUixOnlyFeatures` call sites
  in `cms-panel.ts`), since card-mod can't run those under any key and the
  studio can't safely regenerate them either.

## Recently shipped (v0.5.0)

- **Unified "Apply when" controls** + plain-language hints across Background /
  Visual Filters / Animation; ON/OFF gated on entity state (no more no-op
  conditions); state-gating bug (Lit boolean-attr footgun) fixed.
- **Threshold "first match wins" legend** with auto-sort, so the rule stack is
  finally understandable.
- **Per-card module availability corrected** (heading bg/border hidden, glance
  icon-color hidden, alarm-panel/media-control icon-color exposed) — item #3 below
  is now **partly done**; the remaining piece is making unreachable selectors
  *work* via `$`-pierce.
- **Heading icon-size fallback** (`--mdc-icon-size` + `--ha-icon-size`) — item #2
  **done**.
- **Width-responsive panel** — item #14 **done**.

> **Tooling unlock:** a real-HA Docker + Playwright sandbox now lives in
> `tools/sandbox/` (renders cards *and* the editor, measures computed styles, and
> screenshots the panel per card type). The "needs live HA / manual testing"
> blocker called out on items #3, #8, #9, #10 below **no longer applies** — they
> are now empirically testable.

Effort key: **S** ≈ <½ day · **M** ≈ 1–2 days · **L** ≈ 3+ days / needs live HA.

---

## Now — correctness & compatibility (target: v0.4.x)

These keep the tool correct against current card-mod / HA. Several come straight
from the audit.

| # | Item | Why | Effort |
|---|---|---|---|
| 1 | **Protect dictionary-form `card_mod` from lossy save** | Opening + saving a hand-written `$`-pierce/dict style can corrupt it (audit §4). Detect dict form on open; preserve verbatim or show a read-only banner instead of flattening to string. | M |
| 2 ✅ | **Heading module: stop relying on `--mdc-icon-size`** | **Done (v0.5.0)** — now emits `--mdc-icon-size` + `--ha-icon-size`. Sandbox confirmed `--mdc-icon-size` still sizes the heading icon today and `--ha-icon-size` is the harmless forward-compat fallback. | S |
| 3 ◐ | **Per-card icon-color selectors** | **Partly done (v0.5.0):** dead/missing controls corrected (glance hidden, alarm-panel/media-control exposed). **Remaining:** actually *style* icons that live in nested shadow roots (glance) via card-mod `$`-pierce — depends on #1. | L |
| 4 ✅ | **Reconcile docs with code** | **Done (v0.6.2 repo cleanup)** — the retired `docs/BUG_FIX_PLAN.md` described a sensor `--paper-item-icon-color` path that was never in the shipped generator (`iconColorBlock()` has no card-type branching and never has); confirmed against current source, and against `CARD_SUPPORT_MATRIX.md` showing plain `ha-state-icon` already works for sensor cards. Stale section retired along with the rest of that file. | S |
| 5 | **Pin card-mod version in README** | State "tested against card-mod 4.2.x / HA 2026.6" in the compatibility table so users know the support baseline. | S |
| 6 | **Phase out `--paper-item-icon-active-color`** in the accent module | Legacy paper var (audit §5). Low risk, low urgency. | S |

---

## Next — high-value features (target: v0.5)

| # | Item | Description | Effort |
|---|---|---|---|
| 7 ✅* | **Container child-card editing** | **Mostly done (v0.8.0-beta.1)** for vertical-stack/horizontal-stack/grid: per-child styling sections write into `cards[i]`'s own `card_mod:`/`uix:` — no embedded-editor hooking needed (a container's `cards:[]` is the same shape as entities rows; approach proposed by the project owner). Remaining: `conditional` cards (single `card:` key), containers nested inside containers (no recursion yet), per-row styling of a nested entities card. The originally-sketched embedded-editor binding is now unnecessary and retired. | M |
| 8 | **Modern card coverage: `sections` / `heading` / `area`** | **Verified (v0.5.0):** heading module selectors (`.title p`, `.title ha-icon`, `.container`) still match current HA, and `sections` views work in production. **Remaining:** the `area` card and styling hooks for section **heading badges**. | M |
| 9 | **Tile card feature styling** | The tile card gained features (trend graph, bar gauge, media/fan/valve controls, inline vs bottom position, `state_content`). Sandbox confirms features render in `hui-card-features` — **recommended next build**: targeted controls/selectors for feature rows rather than Advanced CSS. | M |
| 10 | **Custom-card support: Mushroom & Bubble** | Most-requested. Detect the custom card type and offer the correct shadow-DOM selectors (these need `$`-pierce, so depends on #1 landing first). | L |

---

## Later — polish & reach

| # | Item | Description | Effort |
|---|---|---|---|
| 11 ✅ | **Smooth/gradient thresholds** | **Done (v0.7.0)** — "Fade" value mode, approximated as ~32 dense step rules with the real anchor points recovered on reopen via a marker property. | M |
| 12 | **Import / export styles** | Copy a card's full style config to clipboard / paste onto another card (complements presets). | S |
| 13 | **Preset management UX** | Rename, reorder, duplicate, and export presets; today it's load/save/delete only. | S |
| 14 ✅ | **Mobile-friendly panel** | **Done (v0.5.0)** — a ResizeObserver stacks the preview below the controls below ~600px instead of starving them. | M |
| 15 | **Animation builder** | Visual keyframe editor beyond the 5 presets. | L |
| 16 | **More threshold sources** | Allow thresholds on an entity **attribute** (e.g. `battery_level`) and on `state_attr(...)`, not just the state value. | M |
| 19 ✅ | **Per-row entities uix-only warning** | **Done (v0.6.0)** — `isUixOnlyRowStyle`/`hasUixOnlyRow` (`style-compat.ts`) extend the reverse-compat warning to entities-card rows, not just the top-level card. | S |
| 23 | **Dict-form entities-row styles aren't read back** | Pre-existing limitation, same class as item #1 but at the row level: `_initEntityRowStyles` only recognises string-form `card_mod`/`uix` style on a row, so a hand-authored dictionary/shadow-pierce-form row style isn't parsed into the editor. ~~Worse, the next unrelated edit silently wipes it~~ — **the wipe half was fixed in v0.7.1** (dict-form rows are now left completely untouched on save); what remains is that they're invisible to the editor. Depends on #1 landing first (shared root cause: dict-form round-trip). | M |
| 24 | **Rows sharing an entity ID cross-contaminate styling** | `_entityRowStyles` is keyed by `row.entity`, so two rows referencing the same entity (valid `entities`-card YAML) silently collapse to one style slot — editing either row's color in the studio overwrites both. Needs a positional (index-based) key instead of entity-based, which touches the existing (pre-UIX) row-styling data model, not just the UIX addition. | M |
| 25 | **Partially hand-authored styles gain module defaults on save** | Found in the v0.7.1 audit, the border case fixed there (`border:` no longer gains a 12px radius); the same class remains for Heading (a bare `.title p { font-size }` gains icon color/size + alignment defaults on save, because the module always emits its full control set) and Filter (a bare `filter: brightness()` gains a `transition:`). Fixing properly means modules tracking which fields were actually present vs. defaulted — a data-model change, not a one-liner. | M |
| 26 | **`rgb()`/`rgba()` colors in threshold rules aren't re-parsed** | A rule colored via a comma-containing color function generates fine but `parseThresholdJinja`'s rule regex can't read it back — the whole block falls to Advanced CSS on reopen (preserved verbatim, just no longer editable as rules). The color picker only emits hex/`var()` tokens today, so this needs hand-typed values to hit. | S |
| 20 | **UIX billets module** | A small key/value table editor for [UIX billets](https://uix.lf.technology/) (reusable named style constants) — bounded scope, unlike macros below. Nobody's asked for it yet; build when there's a real request. | S |
| 21 | **UIX macros — raw editor only** | UIX macros are user-defined parameterized Jinja2 snippets; a *visual* composer doesn't generalize the way color-picker/slider modules do. The tractable version is a raw-text editor for `uix.macros`, same philosophy as the existing Advanced CSS escape hatch — today the Studio doesn't read or write `uix.macros` at all (it's preserved untouched if present, but can't be created). Low priority; scope for real if requested. | M |
| 22 | **Bulk dashboard `card_mod:`/`uix:` key migration** | Explicitly requested and explicitly **parked** — since the Studio always keeps `card_mod:` working as a fallback, nothing *needs* migrating for correctness, only for YAML tidiness. Mechanically this is a key rename, not a content transform (both engines share CSS/Jinja2 syntax), but the Studio currently only ever sees one card at a time via the injected per-card editor. A real bulk tool means reading/rewriting the *whole* dashboard over HA's websocket API — meaningfully higher blast radius than anything else in this tool (a bug could touch every card at once). Needs its own dry-run/preview design before any code, not just a "next roadmap item." | L |

---

## HACS / distribution

| # | Item | Description | Effort |
|---|---|---|---|
| 17 | ✅ **HACS default repository** | **Done** — accepted into the HACS default store (2026-06). README updated to the default-store install flow. | — |
| 18 | **Release hygiene** | `dist/` is built by CI on tag (`release.yml`) and is correctly gitignored (no longer committed). Keep `package.json` the single version source; the panel header now reads `__APP_VERSION__`. Ensure each release bumps `package.json` and tags `vX.Y.Z`. | S |

---

## Engineering / maintenance

- **Selector resilience:** injection depends on internal HA element names
  (`hui-dialog-edit-card`, `hui-card-element-editor`, `ha-button[slot=secondaryAction]`).
  Keep these centralised (`dom-helpers.ts` / `cms-injector.ts`) and add a smoke
  test / manual checklist after each major HA release.
- **Parser test corpus:** grow `test/parser.test.ts` with real-world hand-written
  `card_mod` snippets (especially dict form) to lock in round-trip behaviour as
  #1 and #10 land.
- **Tree-shaking:** dead utility code was removed in v0.4.0; keep the helper
  surface minimal (add helpers only when used).

---

## Explicitly out of scope

Not worth supporting:

- `iframe` / `webpage`, `map` — cross-origin / Leaflet; only border/radius apply.
- Deep `energy-*` SVG styling — Advanced CSS only.
- Arbitrary Jinja2 logic in the visual UI — the Advanced CSS editor is the
  intended escape hatch for anything beyond on/off and numeric thresholds.
- **A UIX Forge equivalent.** [Forge](https://uix.lf.technology/) is UIX's own
  first-party visual template builder. Rebuilding it inside Card-Mod Studio
  would be a worse clone of a tool that already exists for exactly that job,
  and pulls the project away from what makes it useful: working the same way
  whether someone has card-mod or UIX. A UIX-only user who wants Forge-level
  power should just use Forge.

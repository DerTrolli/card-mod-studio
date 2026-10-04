# Changelog

All notable changes to Card-Mod Studio are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] — 2026-10-04

The "Piercing + polish" release — the v0.10 cycle consolidated (beta.1,
field-tested since 2026-08-17) plus a full release-readiness pass:
re-verification against the newest engines, an HA 2026.10 compatibility
fix, a 20-bug audit of how hand-written CSS survives an edit, and a
light-mode / dark-mode / phone overhaul of the editor UI.

Verified live on **four** Home Assistant instances — **HA 2026.9.4** (the
current stable) and **HA 2026.10.0b0** (2026.10.0 ships 2026-10-07), each
with **card-mod 4.2.1** and with **UIX 8.3.1** separately: the full
live-check suite, a new real-dialog functional test of every control,
and a visual QA sweep in light and dark mode at six screen sizes (360px
phone → 1920px desktop) with automated contrast, clipping and touch-target
measurements.

### Added

- **Dict-form (`$` shadow-piercing) styles are editable.** The `.` entry
  of a dictionary style — the CSS for the card itself — runs through the
  normal visual modules, exactly like a plain style. Every *other* entry
  (pierced `selector$` chains, nested dicts, UIX `$$`/`&` extensions) is
  preserved **byte-identically, in original key order**, through every
  edit and save; an edit on a dict that had no `.` yet inserts one first.
  Works for top-level cards, stack children and entities-card rows. A
  dictionary that is the card's only style is editable whichever key
  holds it; a `uix:` dictionary using UIX-only features stays under
  `uix:`.
- The **Advanced CSS module lists a dict card's pierced entries
  read-only**, so hand-written shadow-piercing styling is visible in the
  panel.
- **Heading Style now also styles "Subtitle" headings**
  (`heading_style: subtitle`), which it never reached before.
- **Keyboard access**: every collapsible section (modules, stack
  children, entity rows) is reachable with Tab and toggles with
  Enter/Space; colour swatches are real buttons with accessible names;
  visible focus rings throughout.

### Fixed — Home Assistant 2026.10

- **Heading Style stopped working on HA 2026.10.** HA 2026.10 changes the
  heading card's title from `<p>` to `<h2 class="heading">`, so the
  `.title p` rule the module wrote no longer matched anything. The module
  now uses HA's own `--ha-heading-card-*` variables (size / colour /
  weight — verified on 2026.9 and 2026.10, card-mod and UIX) plus a font
  family rule that matches both versions. **Existing heading styles are
  migrated automatically**: open the card in the Studio and save once.

### Fixed — hand-written CSS is never rewritten or lost

Found by a dedicated audit (every item reproduced first, now covered by
134 regression tests, including seeded fuzz suites):

- **Jinja statements** (`{% if %}`, `{% set %}`, `{# … #}`) are kept
  exactly as written — an `{% endif %}` used to be dropped (breaking the
  whole style) and an `{% if %}` wrapper could vanish, making a
  conditional style unconditional.
- **`@media` / `@supports` blocks keep their position**, so responsive
  overrides keep working (they used to be moved above the rules they
  override). Nested rules (CSS nesting, nested `@media`) are no longer
  corrupted.
- **Threshold colours are only adopted when the Studio would write them
  back identically** — expressions with extra conditions
  (`and is_state(…)`), a non-colour fallback, several entities,
  arithmetic, or a rule order the Studio would re-sort now stay in
  Advanced CSS instead of being silently simplified.
- A **`uix:` style using macros, billets or a theme is never deleted**
  when the Studio saves to `card_mod:` (including "clear all styling").
- **Entity rows** keep their hand-written CSS from *both* `card_mod:` and
  `uix:` after an edit; a row rule aimed at part of the row
  (`state-badge`, `hui-generic-entity-row`, …) is no longer turned into a
  whole-row rule; a row style that is only an `@media` block no longer
  gains a corrupt duplicate.
- **Border**: only `solid` borders are adopted — `dashed`, `dotted`,
  `none` etc. stay as written instead of becoming solid.
- **Filter transition**: lists, custom easing and delays are kept
  (only a plain `transition: filter <duration>` is adopted).
- **`!important` wins over source order** when the same selector appears
  twice, as in the browser.
- **Dictionary styles**: a dict under only one key, or the identical dict
  under both keys (what "Copy to card_mod" produces), is no longer frozen
  behind a wrong "Mixed-form" banner; an empty `style: {}` no longer
  freezes the card; a dict whose `.` isn't plain CSS is preserved behind
  an accurate banner instead of silently discarding edits; presets on a
  dict card apply correctly and never carry another card's pierced
  entries.
- **Rows that can't be rewritten** (mixed-form) show a lock note instead
  of controls whose edits were silently dropped; a mixed-form stack child
  keeps its entity rows editable.
- **"Copy to card_mod"** keeps existing `card_mod: class:` / `debug:`.
- A row-level `uix:` dictionary with `$$`/`&` keys gets the UIX-only
  warning instead of a "Copy to card_mod" offer that couldn't work.
- A `null` entry in `entities:` no longer breaks the panel.
- The "custom CSS is overriding this control" warning also sees rules
  that come after an `@media` or nested block.

### Fixed — light mode, dark mode and phones

- **Readable in light mode.** Warning/info banners, the mixed-form and
  stack banners, "+ Add" / delete / preset buttons, override hints and
  the "no on/off state" hint used coloured text on a tint of the same
  colour — down to 1.4:1 contrast on light themes. Everything now meets
  WCAG AA (4.5:1) in light AND dark mode, measured on the real dialog.
- **Turning on Font or Heading Style no longer paints the card's text
  near-white** on light themes — new text colours default to the theme's
  own text colour (`var(--primary-text-color)`), and colour swatches show
  what a `var()` colour really resolves to.
- **The preview sits on your theme's dashboard background** instead of a
  black box.
- **Phones**: the panel never gets wider than the screen — on a 360px
  phone a thermostat (or any card with a wide preview) used to push every
  module's right edge, toggles included, off-screen; rule rows, colour
  grids and control rows wrap instead of clipping their buttons;
  scrolling past the end of the panel no longer drags HA's dialog along;
  the side-by-side preview only appears from 720px panel width; the Style
  button is icon-only on narrow screens so HA's dialog footer fits; touch
  targets grow on touch screens (no target under 24px anywhere in the
  panel).
- Native inputs and selects follow the theme (no white boxes in dark
  mode) and use HA's font; scrollbars, dropdown lists and other
  browser-drawn parts follow HA's dark mode too (HA's own setting, not
  the operating system's) and use HA's scrollbar colour; round colour
  inputs are actually round; the selected colour swatch is visible on
  every colour (it disappeared on blue/cyan); light swatches have an
  outline; swatches wrap as two even rows on narrow screens.
- Click-to-edit works on the whole preview of a tall card — on a long
  entities card the lower rows weren't clickable once the preview was
  scrolled.
- The colour popover is placed using its real height (it could run off
  the bottom with custom colours) and never past the screen edge on
  phones; the click-to-edit preview label is readable on any card and
  stays inside the preview.
- Entity pickers no longer show HA's large floating label next to the
  row's own label.
- Entity rows are labelled with the entity's friendly name ("Outside
  Temperature"), like HA does, instead of its object id
  (`outside_temperature`).
- **Tidier layout.** Every control in a module starts at the same left
  edge (labels share one column instead of pushing each control to a
  different spot); sliders use the full width. The side-by-side preview is
  wider, so entity names no longer get cut off ("Outside Te…"), and its box
  fits the card instead of filling the whole column.
- The **Style button** looks like a button before you open it (an outlined
  pill — on phones it used to be a bare 🎨), the preset button says
  **Save preset** (it sat right above HA's own Save), and the Visual
  Filters / Border & Radius / Advanced CSS icons are visible on dark and
  light themes (⬛ disappeared on dark cards).
- A card the Studio can't edit (🔒 preserved as-is) no longer offers
  presets or "click the preview" — neither could do anything there.

### Fixed — working alongside HA's card editor

- Styling a card while HA's editor is in YAML mode ("Show code editor")
  now updates the YAML text too. It used to keep showing the old YAML, and
  typing anything in it afterwards silently undid the Studio's changes.
- HA's "Show code editor" button no longer greys out after switching on a
  module that doesn't change anything yet (e.g. Visual Filters at its
  defaults).
- Clearing all text in **Advanced CSS** no longer collapses the editor
  mid-edit — the next keystrokes used to land on the page and open HA's
  quick bar over the dialog. The "some existing styles weren't recognised"
  note now only appears for CSS the card already had, not for CSS you type.
- **Presets are named in the panel** instead of a browser pop-up, which
  doesn't work reliably in the Home Assistant app.

### Fixed — modules

- Switching on **Threshold Colors** before it's set up (no entity or no
  rules yet) no longer silently disables another module: on a thermostat
  the Background switch did nothing, on a gauge the Accent Color switch did
  nothing. Once Threshold Colors *is* driving a property, the module it
  takes over now says so instead of looking broken.
- **Font on a gauge in dark mode**: with the default (theme) text colour,
  the gauge's value turned black — unreadable on a dark card.
- **Font family "Custom…"** (Font and Heading Style) now shows its text
  field — choosing it did nothing, so a custom family could only be typed
  in YAML.
- **Visual Filters "Transition speed" works on tile cards** (the tile's own
  styles overrode it, so filter changes snapped instead of fading).
- **My Color Palette** ON/OFF defaults apply as soon as you change them,
  not only after reopening the editor.
- **Click-to-edit on an entities card opens the row you clicked** —
  anywhere on the row (icon, name, state); it used to open no row at all,
  or the card-level Font module.
- **Threshold Colors is no longer offered on heading cards**, where none of
  its colours had any visible effect (use Heading Style's text colour).
- **No more controls that do nothing.** Every module was switched on, one
  at a time, on every built-in card type — with card-mod and with UIX — and
  the rendered card compared pixel by pixel. What changed nothing is now
  hidden on that card: Accent Color on cards that never use the accent
  colour (button, light, glance, markdown, humidifier, alarm panel, area,
  picture cards, map, iframe, to-do list, logbook, statistics graph,
  weather), Font's text colour where the card colours its own text, Icon
  Color on area and picture-elements cards, Font on plain picture cards.
  Threshold Colors' "Apply to" list now offers exactly the colours the
  matching modules offer on that card, and presets drop what a card hides.
  An `entity-filter` card is treated as a container — a style on the filter
  itself never reached the card it shows.
- **Threshold Colors → Text Color now works on tile cards** (the tile's
  text uses its own colour variables; Font already handled them).
- **Entity row icon colours now show while the entity is on.** HA colours
  an active entity's icon itself (lights always do), which beat the row
  colour, so it only showed while the entity was off. Setting a row icon
  colour now also sets HA's own `state_color: false` on that row (and
  removing the colour removes it); rows you don't touch are left as they
  are — a row coloured with an earlier version shows an **Always use this
  color** button that adds it.

### Changed

- **Mixed-form styling still freezes** — a card or row carrying a plain
  style on one key and a *different* dictionary style on the other has no
  faithful single-key rewrite, so both keys stay preserved verbatim
  behind a lock banner. This is the only remaining frozen case.
- The macro/billet info banners no longer fire for dict styles with
  `$$`/`&` keys (those are never overwritten under the new model).
- The heading icon rule no longer emits the inert `--ha-icon-size` twin
  (HA never read it); older output that has it is still recognised.

### Compatibility notes

- **card-mod 4.2.1** (still the newest release) works, but is
  effectively unmaintained: on HA ≥ 2026.8 it hangs if your *theme*
  defines `card-mod-*-yaml` variables (card-mod issues #606/#617). UIX is
  a drop-in replacement and the Studio fully supports it.
- **UIX 8.4** (in beta) will require HA 2026.10 or newer.

### Not in this release

- The planned Font-module size controls for the gauge value number and
  the thermostat big number moved to **v0.11** — they need a new
  generated-dictionary path in the save logic, which deserves its own
  beta round (see `docs/ROADMAP.md`).

## [0.9.1] — 2026-08-07

A pure correctness release: the v0.10 planning audit plus a full-codebase
bug hunt (two audit passes with ~2,900 fuzzed round-trips and empirical
repros; every fix below inverts a REPRODUCED bug). 46 new unit tests, a
new live check, and the full live suite green on card-mod 4.2.1 AND
UIX 8.0.0, both on HA 2026.8.0.

### Fixed — data loss

- **Dictionary-form (`$` shadow-piercing) styles are now preserved
  verbatim.** Hand-written dict styles were badly mishandled on the first
  Studio edit: a *nested* dict deleted the entire `card_mod:` key, a
  pierce-key dict was corrupted into invalid flat CSS, a flat dict was
  silently flattened, and a dict-form `uix.style` was cleared by the save
  path. The save path now freezes both style keys untouched whenever
  either is dictionary-form, and the panel shows a dedicated "preserved
  as-is" banner instead of dead controls (per-row styling on entities
  cards stays fully editable). Visual editing of this form is the v0.10
  cycle (see `docs/V0.10_PLAN.md`).
- **A `}` inside a CSS comment (or a stray brace) wiped the entire
  hand-written style on save** — the block splitter now tracks comments
  and floors its depth counter.
- **Semicolons inside `url(data:…)` or quoted strings corrupted the
  declaration on save** — declarations now split with a paren/quote-aware
  scanner.
- **`card_mod: class:` / `debug:` were deleted by any Studio edit** (and
  by clear-all, and by switching the output key to `uix:`) — non-style
  card_mod keys are now preserved everywhere, including the reverse-compat
  "copy to card_mod" fix button.

### Fixed — wrong output (silent behavior changes)

- **Hand-written conditionals bound to another entity's OFF state were
  claimed and INVERTED on save** (filter/background) or rebound to the
  card's own entity (animation) — such shapes now stay verbatim in
  Advanced CSS; the modules genuinely can't express "while another entity
  is off".
- **Filter adoption over-claimed non-equivalent filters**:
  `grayscale(50%)` was rewritten to 100%, ride-along effects were dropped
  from conditional branches, `transition: all` was narrowed to
  `transition: filter`, and a no-op `brightness(100%)` was
  claimed-then-deleted. All now stay untouched unless exactly
  expressible.
- **Icon size was destroyed when Threshold drove icon color**: reopening
  disabled the Icon Color module, lost the size slider, and leaked the
  size variables into Advanced CSS.
- **Gradient thresholds driving multiple properties accreted orphan
  `--cms-gradient-stops` blocks** in Advanced CSS on every reopen.
- **Accent-color thresholds gained a phantom `icon-color` property** on
  reopen (the accent module's own companion variable was re-adopted as a
  hand-written icon threshold).
- **Palette `var(--x-color)` and `rgb()` colors broke recognition** in
  borders (control lost to Advanced CSS) and gradients (whole gradient
  string mis-parsed as a solid color) — both now round-trip.
- **Half-filled conditions generated a DIFFERENT condition**: background's
  "another entity" mode with no entity picked yet inverted to while-OFF
  (and rewrote the choice on reopen), grayscale's fell to while-ON, and an
  animation with an incomplete trigger emitted an orphan `@keyframes` that
  reset the whole module on reopen. Incomplete conditions now emit the
  unconditional form.
- **Loading a preset onto a card type that hides some of its modules**
  saved styling that could never be seen or disabled again from the UI —
  hidden modules now reset to defaults on preset load.
- **Threshold property blocks now emit in a canonical order** so
  multi-property thresholds round-trip byte-stably.

### Fixed — UI

- Re-opening the Style panel after toggling it off broke the column
  layout (content below the fold became unreachable — an inline
  `display:block` beat the panel's flex layout).
- A race between the palette cache's initial load and an immediate first
  save could permanently revert the save.
- An external edit-and-revert of the card config could leave the panel
  showing stale state (own-echo guard baseline now advances correctly).
- The preview picker's tap-without-hover fallback (mobile) was dead code.
- Override warnings now also cover the thermostat accent variables and
  the tile-secondary/thermostat/gauge font variables.

### Notes

- Deferred (cosmetic/nuance, recorded as roadmap item #29): `!important`
  dropped from claimed hand-written declarations; off-first binary
  conditionals normalizing to on-first (third-state nuance); half-picked
  conditions flattening to "Always" on reopen.

## [0.9.0] — 2026-08-06

The "make styling discoverable + state-aware" release — the v0.9 cycle
consolidated (beta.1–beta.3, field-tested since 2026-07-18). Every feature
was verified live on real card-mod AND real UIX renders (computed-style
assertions, not source reading), and the final release was re-verified
end-to-end against the newest engines: **card-mod 4.2.1 and UIX 8.0.0,
both on Home Assistant 2026.8.0** — the full live-check suite is green on
both. (UIX 8.0.0 itself requires HA ≥ 2026.8.0; its styling contract is
unchanged, so cards styled by the Studio behave identically across
UIX 7.x and 8.x.)

### Added — click-to-edit preview picker

Hover any part of the live preview and a highlight box names the control
that styles it ("Icon Color", "Font", "Entity Rows: sensor.x", …); click,
and the panel scrolls to that module, opens it, and flashes it briefly.
Works per entity row on entities cards — clicking a row opens exactly that
row's section. The overlay never forwards events to the live card, so you
can point at a light card's toggle without switching anything on. Coverage
was probed card-by-card across all 17 supported card types on both
engines: button name/state, entity/sensor names, gauge/thermostat/
humidifier titles, markdown body, glance columns, media-control titles,
and picture-card footers resolve to Font; the sensor graph line, tile
feature rows, and the thermostat dial resolve to Accent Color; things the
Studio genuinely can't style (more-info buttons, keypads, raw images)
honestly fall back to the card surface instead of pointing at a dead
control. (Under the hood: a geometric hit-test over the card's composed
tree — HA cards hide their content from browser hit-testing behind a
full-card tap layer, so rect math is the only reliable route.)

### Added — state-driven styling depth

- **Four new animation presets** — Shake, Spin (linear timing), Glow,
  Heartbeat — alongside the existing five.
- **Value-conditional animations** — "While a value matches…": entity (or
  one of its numeric attributes) + operator + threshold; the animation
  runs only while the condition holds. Pulse while the freezer is above
  -10°, glow while battery_level < 15.
- **One shared "Reacts to" condition control** (always / entity ON / OFF /
  another entity ON / while a value matches) now also drives three numeric
  controls:
  - **Border width** — appears only while the condition matches, with an
    optional fallback width.
  - **Filter effects** — brightness/blur/**opacity (new control)** apply
    only while the condition matches (grayscale keeps its own condition).
  - **Icon size (new control)** — static or conditional with a fallback
    size; offered exactly where live probing shows the size variables
    reach the main state icon: tile, entity, sensor, picture-glance.

All conditional forms generate anchored single-branch Jinja ternaries that
round-trip byte-stably; hand-written conditions the modules can't express
exactly stay untouched in Advanced CSS.

### Fixed

- **Two entities-card rows with the same entity no longer share one style
  slot** — per-row styles are keyed by row position, so duplicate-entity
  rows hold independent styling.
- **`rgb()`/`rgba()` threshold colors survive reopen** as editable rules;
  and multi-rule thresholds no longer mis-read their default color from an
  intermediate branch of the rule chain.
- **Hand-written filters are no longer flattened**: a conditional or
  combined `filter:` the module can't express exactly (e.g. containing
  `hue-rotate(…)`) stays verbatim in Advanced CSS instead of losing parts
  on save.
- **UIX Forge safety**: cards carrying UIX 8's `forge:` / `foundry:` /
  `uix.macros` config keep them byte-identical through every Studio edit
  (now locked in by regression tests).

### Changed

- The Accent Color module no longer emits the legacy
  `--paper-item-icon-active-color` companion — nothing in current HA reads
  it; old configs upgrade cleanly on the next save.
- README compatibility table pins the live-verification baseline
  (HA 2026.8.0, card-mod 4.2.1, UIX 8.0.0), and documents an HA 2026.8
  platform change: YAML-mode dashboards can no longer enter edit mode, so
  the visual card editor (and the Style button) is only reachable on
  normal storage-mode dashboards.

## [0.8.1] — 2026-07-14

A robustness release for everyone arriving with **existing styles** — from
older Card-Mod Studio versions, from hand-written card-mod, or mid-switch
between card-mod and UIX. Verified with a legacy-output audit across the
generator's full git history, 14 new unit tests, and live checks against a
real UIX instance.

### Added — "Custom CSS is currently overriding this control"

- Every module (and every entities-card row) now detects when hand-written
  CSS in Advanced CSS (or a row's preserved custom CSS) sets the same
  property the module drives, and shows a ⚠️ badge plus an explanation of
  exactly which declaration is winning and why — custom CSS is applied
  last *by design* (hand-written styles always take priority), and until
  now the only symptom was "I drag the color picker and nothing happens".
  The warning names the offending selector/property so it's a ten-second
  fix instead of a mystery.

### Added — safe adoption of equivalent hand-written phrasings

The Studio now recognises well-known *equivalent* ways of writing what its
modules generate, and takes them over cleanly — open the card, the matching
control is pre-filled; change it, and the hand-written line is replaced by
the Studio's own syntax:

- `ha-card { --state-icon-color: … }` and `--paper-item-icon-color`
  (incl. the `:host { … }` form Card-Mod Studio v0.3.1–v0.3.8 itself
  generated on sensor/entity cards) → Icon Color — plain, ON/OFF
  conditional, and value-threshold forms.
- `ha-icon { color: … }` → Icon Color (equivalent via inheritance).
- `ha-card { background-color: … }` → Background (solid).

**Adoption is deliberately conservative**: it only happens on card types
where the regenerated form is verifiably equivalent (never on entities
cards or cards without a reachable icon), only for values the module can
express *exactly*, and never next to contradicting declarations (a
`background-color` beside a `background-image` stays untouched; a
multi-branch Jinja expression the modules can't represent stays untouched).
Everything not adopted is preserved verbatim in Advanced CSS, exactly as
before — with the new override warning pointing at it when relevant.

### Verified — migration paths

- **Old-version configs**: every CSS shape any released Card-Mod Studio
  version ever generated was audited against today's parser; all either
  round-trip into module state or are preserved harmlessly. The one
  genuinely dangerous legacy shape (v0.3.x icon variables, which could
  silently override a newly picked icon color forever) is the one now
  adopted and cleaned up.
- **card-mod → UIX switch**: styling everything with card-mod, deleting
  card-mod and installing UIX keeps every card working with no action
  (UIX reads `card_mod:` natively); the first Studio edit after the switch
  reads the `card_mod:` styling and rewrites it under `uix:` — covered by
  a new permanent live check against a real UIX install. (The reverse
  switch keeps its existing per-card warnings and one-click fix.)

## [0.8.0] — 2026-07-14

The "structure + color system" release — the v0.8 roadmap cycle, developed
and live-tested through four pre-releases (beta.1–beta.4, consolidated
here). Every per-card behavior below was verified against a live Home
Assistant render on both card-mod and UIX, not just source reading.

### Added

- **Style the cards inside a stack — directly from the stack's editor.**
  Vertical-stack, horizontal-stack, and grid cards show one styling section
  per child card instead of a dead-end banner. Each section carries the
  full module set for that child's card type — a gauge child gets the gauge
  treatment (dial/needle/Fade), a tile child the tile treatment,
  thresholds, animations, everything — running through exactly the same
  parse → modules → generate pipeline as a top-level card (shared code:
  `src/editor/studio-state.ts`). Changes are written into the child's own
  `card_mod:`/`uix:` block inside the stack config, applied natively by
  both engines; the live preview shows the whole stack update as you edit.
  An entities-card child even gets the per-entity rows section. Not
  covered yet: containers nested inside containers, `conditional` cards.
- **A new Font module** — text size, weight, family (incl. custom
  free-text), and color for any card not already covered by Heading Style
  (closes [#25](https://github.com/dertrolli/card-mod-studio/issues/25)).
  Cards that override fonts internally get the card-specific companion
  selectors/variables they need: light name/brightness text, button label
  (`!important` vs its adopted-stylesheet cascade), sensor/entity name +
  value (value scales at its native 1.75× ratio) + unit, gauge and
  thermostat titles, tile text (`--ha-tile-info-*` variables), and the
  card **title** of list-style cards (entities, glance, calendar, … via
  `--ha-card-header-*`). Two documented unreachables: the gauge value
  number and the thermostat's big temperature number can't change *size*
  (HA hard-codes them out of reach) — weight and color still work there.
- **Color Palette Manager** — a "My Color Palette" section: define named
  custom colors once and they appear as extra swatches in every color
  picker (card-level and per-row); plus overrides for the default ON/OFF
  colors every freshly-enabled control starts from (Icon/Accent Color,
  row colors, new threshold rules and fade points). Stored per HA user
  (same cross-device storage as presets), with localStorage fallback.
- **Attribute-based thresholds** — Threshold Colors can read an entity
  **attribute** (e.g. `battery_level`, `current_temperature`) instead of
  the state: a "Value read from" selector lists the picked entity's
  numeric attributes. Works in Step and Fade modes, round-trips on reopen,
  and generates standard `state_attr(...)` Jinja both engines render.
- **Per-row font settings on entities cards** — each entity row gets an
  optional text size/weight override, layered on top of the card-level
  Font module; heading cards gained the missing **weight** and **family**
  options in Heading Style.

### Fixed

- **"Visual editor not supported" on cards with a `uix:`/`card_mod:`
  block.** HA is migrating simple cards to schema-driven form editors
  (`getConfigForm()`) whose strict validation neither card-mod nor UIX
  patches — opening e.g. an entity card styled under `uix:` kicked the
  editor into YAML-only mode with "Key 'uix' is not expected". The Studio
  now shims that form editor's validation to ignore both keys (they're
  preserved untouched through edits). Engine-level gap, reported upstream.
- **Plain-string entity rows couldn't be styled at all** (silently): the
  common YAML shorthand `entities: [sensor.a]` produced rows the per-row
  editor didn't recognise and the save path skipped. String rows now
  appear in the rows section and are promoted to `- entity: sensor.a`
  object form the moment they gain styling (unstyled rows stay plain
  strings — no YAML churn).

### Changed

- **UX consistency pass across the whole panel** — the same concept now
  uses the same control, labels, and behavior everywhere: Heading Style
  mirrors the Font module (order, wording, Custom… family — a
  hand-authored family now round-trips into the visible control); per-row
  font uses the same slider controls; the row-level threshold builder
  matches the card-level one (its "top to bottom" label was factually
  wrong — rows auto-sort too); Threshold's border width is a slider like
  the Border module; one "this is styled" indicator dot (size and color)
  for stack children and entity rows; Advanced CSS opens via the standard
  chevron header; unified hint styles, button metrics/labels, and round
  color swatches; palette ON-defaults seed every fresh control, not just
  card-level modules.
- The container-level Border module (which had no visual effect — stacks
  paint no `ha-card` box of their own) is no longer offered; container
  Advanced CSS remains available.

### Docs

- **README overhauled**: all screenshots regenerated from v0.8.0 through a
  real HA edit dialog, cropped per section and annotated with callout
  arrows; new sections for the Font module, Color Palette Manager, stack
  child styling, per-row fonts, and the expanded Threshold capabilities.
  The screenshot set is reproducible via
  `tools/sandbox/harness/readme_shots.mjs`.
- **A full GitHub Wiki** — 14 user-facing pages (module-by-module reference,
  per-card support & limitations, card-mod vs UIX, troubleshooting/FAQ,
  recipes) with navigation sidebar. Sources are maintained in `docs/wiki/`
  (the wiki is a separate git repo GitHub attaches to the project — see
  `docs/wiki/README.md` for how it's published).

## [0.7.1] — 2026-07-06

A pure correctness release, from a full audit of the codebase (every module
round-trip re-derived from first principles, plus live verification against
real card-mod and real UIX instances) and two rounds of live beta testing
on a real dashboard. No new features — a long list of bugs found and
fixed, several of them silent data loss.

### Fixed — gauge & tile cards

- **Accent Color on a gauge card never actually applied.** HA's
  `hui-gauge-card` writes its severity-computed color as an *inline style*
  on `<ha-gauge>` on every render, so the `--gauge-color` variable the
  Studio set on `ha-card` was always overridden — silently. The Studio now
  targets `ha-gauge` directly with `!important` (the one thing that beats a
  non-important inline style), verified against a live gauge card. The same
  applies to the Threshold module's accent-color property, so threshold
  rules — including Fade mode — can now genuinely drive a gauge's dial
  color (e.g. a temperature gauge fading smoothly blue→red, something the
  gauge's own discrete `severity` segments can't do).
- **Needle gauges (`needle: true`) color the needle and value text**
  instead of doing nothing — in needle mode there's no value arc, and the
  needle's fill is `var(--primary-text-color)` inside `ha-gauge`, which the
  accent value now drives the same way. The dial keeps showing the
  configured segments; the panel hint explains this.
- **Tile cards: the accent color now actually wins — including tile
  features like the bar gauge.** Same root cause, one card over:
  `hui-tile-card` writes its state-computed color as an *inline style* on
  `ha-card` (`--tile-color`), so the Studio's plain declaration silently
  lost whenever the tile computed a color (active/state-colored entities —
  exactly the interesting cases). Now emitted with `!important`, which also
  cascades into `hui-card-features` (`--feature-color` derives from
  `--tile-color`), so bar-gauge/toggle feature rows follow the accent color
  too.
- The Threshold module no longer offers **Icon Color on cards with no
  reachable icon** (gauge, glance, thermostat, …) — it was a dead checkbox
  generating CSS that matched nothing. On those cards, enabling Threshold
  now starts from a property that's actually visible there, and on gauges
  the property is labelled "Gauge / Accent Color".

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
  about the limitation and describes the YAML workaround.
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

[0.10.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.10.0
[0.9.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.9.1
[0.9.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.9.0
[0.8.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.8.1
[0.8.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.8.0
[0.7.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.7.1
[0.7.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.7.0
[0.6.2]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.6.2
[0.6.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.6.1
[0.6.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.6.0
[0.5.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.5.0
[0.4.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.4.1
[0.4.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.4.0

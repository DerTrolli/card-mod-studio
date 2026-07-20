# Card-Mod Studio — testing sandbox

A self-contained rig that runs **real Home Assistant + real card-mod** in Docker
and uses **Playwright** to measure exactly what a `card_mod` style does to a real
card — by reading the *computed style* of the rendered element, not by guessing.

It exists so an **AI agent (or CI) can verify card styling itself** instead of a
human manually applying a setting, eyeballing the result, and reporting back. The
agent gets ground truth: "did `--tile-color` actually change the tile icon? yes →
`rgb(255,0,0)`, no → unchanged."

This rig produced [`docs/CARD_SUPPORT_MATRIX.md`](../../docs/CARD_SUPPORT_MATRIX.md).

---

## Why this design

card-mod's whole job is injecting a `<style>` into a card's shadow DOM. Whether a
setting "works" depends entirely on the card's **real** shadow-DOM structure and
which CSS variables it honors. So the rig must use the **real HA card components**
— mockups would only test our own guesses. Hence: real HA in Docker.

---

## Prerequisites (agent sandbox)

This is built for a root-capable cloud agent sandbox like the one Card-Mod Studio
is developed in:

- **Docker-in-Docker**: `docker` CLI present and the process can start `dockerd`
  (we run as root; the daemon comes up with the default overlayfs driver).
- **Chromium preinstalled** for Playwright at `PLAYWRIGHT_BROWSERS_PATH`
  (`/opt/pw-browsers/...`). The harness points `executablePath` straight at the
  binary, so the `playwright` npm version doesn't need to match the browser build.
  Override with `CHROME_BIN=/path/to/chrome` if your build differs.
- **Outbound HTTPS** to pull the HA image and `card-mod.js` (`run.sh`), or the
  HA image and a `git clone` of the UIX repo (`run-uix.sh` — see below).
- Node 18+ and Python 3.8+.

> Everything the rig generates at runtime (the HA image, `.storage`, the built
> plugin, `card-mod.js`, tokens, screenshots, matrix output) is **gitignored** —
> only the source of the rig is committed, so it can be rebuilt from scratch.

---

## Run it

```bash
tools/sandbox/run.sh
```

That builds the plugin, fetches card-mod, starts HA, completes onboarding, and
runs the matrix. Results land in `tools/sandbox/harness/matrix.md` + `matrix.json`.

To re-run just the measurement after HA is already up:

```bash
cd tools/sandbox/harness
node matrix.mjs          # 15 standalone-mountable card types
node button_matrix.mjs   # adds the button row via a real dashboard
node compat_check.mjs    # card_mod:/uix: cross-compat warning banner (real cms-panel)
node palette_check.mjs   # threshold color-palette picker (card + entities-row level)
node dialog_popover_check.mjs  # same popover, but inside HA's real (transformed, modal) card-edit dialog
node entity_binding_check.mjs  # cms-entity-picker + cross-entity binding (Icon Color/Background/Filter) + multi-property threshold
node button_card_binding_check.mjs  # conditional mode available on cards with no on/off state (e.g. button) + Accent Color entity binding
node gradient_mode_check.mjs  # Threshold "Fade" (gradient) mode — generation, marker round-trip, live preview
node gradient_typing_check.mjs  # typing a value into a gradient point can't scramble a different point mid-edit
node gradient_uix_compat_check.mjs  # gradient marker actually applies against REAL card-mod (getComputedStyle), not just this project's own parser
node preset_stale_state_check.mjs  # reused-panel + preset-load edge case that was suspected (wrongly) to lose gradient state on a duplicated card
node gauge_color_check.mjs  # gauge dial color: ha-gauge !important block applies (accent + threshold-gradient), old ha-card form documented broken
node beta2_fixes_check.mjs  # v0.7.1-beta.2: needle-gauge needle color, tile inline --tile-color beaten by !important (+ feature rows), picker domain filters, layout banner copy
node stack_child_check.mjs  # v0.8.0: per-child styling sections on a vertical-stack — emit into cards[i], sibling untouched, real stack render, reopen restores
node font_module_check.mjs  # v0.8.0: Font module — plain-inheritance on entities-card rows, ha-tile-info's own --ha-tile-info-* vars on tile cards (bare ha-card form negative-controlled to genuinely fail), module gating, reopen round-trip; beta.2 added per-card companion renders (light/sensor/gauge/entities title), per-row fonts, and the hui-form-editor shim (through the REAL edit dialog — the element is lazily defined with the dialog bundle, so whenDefined() on it outside a dialog hangs forever)
node animation_pack_check.mjs  # v0.9.0: new presets + value-conditional trigger (computed animationName true/false cases, panel round-trip)
node preview_picker_check.mjs  # v0.9.0: click-to-edit picker (geometric hit-test finds the tile icon behind HA's tap layer, label + jump-to-module, overlay consumes clicks) + per-card coverage matrix (button/gauge/entity/sensor/tile/thermostat/markdown/glance/media/picture-glance hover → expected module label)
node legacy_adopt_check.mjs  # v0.8.1: legacy/hand-written CSS adoption (v0.3.x :host icon vars -> Icon Color, regenerate-on-edit removes the legacy line), conservative non-adoption, and the override-warning badge; run on the UIX rig it also covers card-mod-authored cards being rewritten under uix:
node attr_palette_check.mjs  # v0.8.0-beta.2: attribute-based thresholds (state_attr Jinja renders + panel round-trip) and Color Palette Manager (custom colors + OFF-default override reaching fresh module state)
node ux_audit_shots.mjs  # screenshot-only: renders the consistency-pass UI states (heading module, entity rows + palette manager, threshold) into shots/ for visual review — no assertions
node readme_shots.mjs  # screenshot-only: regenerates every README image (images/*.png) through the REAL edit dialog into shots/readme/ — review, then copy over the repo's images/
node scan.mjs            # which card types mount cleanly standalone
```

Environment overrides: `HA_URL`, `CHROME_BIN`, `HA_IMAGE`, `CARD_MOD_TAG`.

---

## How it works

```
run.sh
  ├─ start dockerd (if needed)
  ├─ npm ci && vite build        → dist/card-mod-studio.js → config/www/
  ├─ download card-mod.js        → config/www/
  ├─ docker run HA  (-v config:/config, demo integration, YAML dashboard)
  ├─ onboard.py     → POST /api/onboarding/* → tokens.json
  └─ harness (Playwright)
        ├─ inject tokens.json into localStorage(hassTokens)  → logged in
        ├─ open the dashboard, wait for hass + card-mod
        ├─ render a card via <hui-card> with a card_mod block
        ├─ card-mod (loaded as a resource) applies the style
        └─ pierce the shadow DOM, read getComputedStyle of the target
```

- **`config/configuration.yaml`** — minimal HA: the `demo` integration (≈117 test
  entities), YAML-mode dashboard, card-mod + the plugin as resources.
- **`harness/onboard.py`** — drives HA's onboarding HTTP API to create a user and
  emit `tokens.json` (no manual login, no `.storage` seeding).
- **`harness/matrix.mjs`** — renders each card type, applies the CSS the tool
  emits per setting, classifies each cell `effect` / `no-effect` / `no-target`.
- **`harness/button_matrix.mjs`** — the button card can't mount standalone, so it
  is measured inside a real YAML dashboard (cards matched by a `name` marker
  because the masonry layout reorders the DOM).
- **`harness/compat_check.mjs`** — mounts the real `cms-panel` editor (same
  technique as `editor_audit.mjs`) against this card-mod-only instance and
  verifies `src/utils/style-compat.ts`'s warning banner: a `uix:`-only card
  shows a "copy to card_mod" fix (and the fix button really populates
  `card_mod.style`), a `uix:` block using macros/billets shows an
  incompatibility warning with no fix button instead, and an ordinary
  `card_mod:`-only card shows no banner at all.
- **`harness/palette_check.mjs`** — mounts the real `cms-panel` editor
  standalone (`document.createElement('cms-panel')`, no `<dialog>` involved)
  and verifies the compact color-picker palette on Threshold Colors: a
  `var(--x-color)` rule parses into recognised rules instead of falling to
  Advanced CSS, the popover opens fully on-screen with all 10 presets,
  picking a preset updates the value/closes the popover/reaches the emitted
  `card_mod.style`, and the entities-card row-level threshold builder uses
  the same picker.
- **`harness/dialog_popover_check.mjs`** — the same popover, but reached the
  way a real user does: opens HA's *actual* card-edit dialog (overflow menu
  → Edit dashboard → a card's Edit link → Style tab), not a standalone
  mount. This matters because the standalone mount in `palette_check.mjs`
  has no `<dialog>` ancestor at all, so it can't catch a real bug found this
  way: HA's dialog nests a native `<dialog>` two shadow roots deep
  (`ha-dialog` → `wa-dialog` → `<dialog>`) that (a) carries a CSS
  `transform` (an identity matrix, but any non-`none` value still creates a
  new containing block for `position: fixed` descendants) and (b) is shown
  via `showModal()`, promoting it to the browser's "top layer" where no
  z-index outside it can paint above it. Together these silently broke the
  popover two different ways — positioned hundreds of pixels from its
  trigger, and (once that was naively fixed by rendering into a
  `document.body` portal) invisible behind the modal — that a same-shadow-
  root or bare-`document.body` test would never surface. The check verifies
  the popover opens near its trigger, stays on-screen, *and* is genuinely
  clickable at its rendered position (piercing shadow roots via nested
  `elementFromPoint` calls) rather than just present-but-occluded in the
  DOM. See `cms-color-picker.ts`'s `_ensurePortal` doc comment for the fix.
- **`harness/entity_binding_check.mjs`** — the v0.7.0 entity-binding UX:
  `cms-entity-picker` renders HA's real `<ha-entity-picker>` (not its
  text-input fallback), Icon Color/Background/Filter round-trip a
  "controlled by a different entity" block instead of always assuming
  `config.entity`, and Threshold's multi-property checkboxes correctly
  drive more than one CSS property from one shared rule set. Mounts its
  host under `<home-assistant>` rather than `document.body` — see
  `docs/DEVELOPMENT.md`'s "`<ha-entity-picker>` needs a real ancestor" note
  for why every other check script's `document.body` convention doesn't
  work for this one.
- **`harness/button_card_binding_check.mjs`** — reproduces a real user
  report against a `button` card (entity with no on/off state of its own):
  Icon Color and Accent Color's "Different for ON/OFF" mode used to be
  hidden entirely in that case, with no way to reach the "controlled by a
  different entity" option that would have made it work anyway. Verifies
  the mode is always offered, a warning explains why it's inert without a
  toggleable entity picked, picking one actually reaches the emitted CSS,
  and the entity-picker rows fit on-screen at 900px width (the original
  bug report: the old plain-text entity input "goes off the edge"). Uses
  the real card-edit dialog, not a synthetic mount, for the same
  `<ha-entity-picker>` context reason as `entity_binding_check.mjs`.
- **`harness/gradient_mode_check.mjs`** — Threshold's "Fade" (gradient)
  value mode: switching to it shows a colorStops editor and a live
  CSS-gradient preview bar instead of the rule list; the generated CSS is
  a ~32-rule discrete approximation (verified: not "many" in name only —
  the actual rule count) carrying a `--cms-gradient-stops` marker property;
  reopening a saved gradient-mode card recovers the real anchor points, not
  the ~32 generated rules; and the ▲/▼ swap buttons exchange two points'
  colors while leaving their values untouched.
- **`harness/gradient_typing_check.mjs`** — types a real per-keystroke
  value into a gradient point that briefly sorts before its neighbors
  mid-edit (via `page.keyboard.type`, not `.value=`, since the bug only
  reproduces with genuine incremental keystrokes) and verifies the typed
  value lands on the point you were actually editing, not a different one
  the list reordered underneath your cursor.
- **`harness/gradient_uix_compat_check.mjs`** — the gradient marker
  actually applies against **real card-mod**, checked via
  `getComputedStyle` on a genuine `<hui-card>`, not just that this
  project's own parser can read it back. Exists because the `beta.3`
  marker (JSON) was spec-valid CSS but silently broke real card-mod's own
  parsing anyway — invisible from source reading or this project's unit
  tests, only caught by mounting a real card and reading the rendered
  color. See `docs/DEVELOPMENT.md`'s "Real card-mod silently drops a whole
  style block" note for the full story and why a fixed `setTimeout` isn't
  enough to reliably catch this class of bug (poll instead).

---

## Known limitations / gotchas

- **`button` won't mount standalone** via `document.createElement('hui-card')` — it
  renders an error card. Other 15 tested types mount fine. button is handled via a
  real dashboard (`button_matrix.mjs`); other awkward custom cards may need the
  same treatment.
- **Lazy-loading / masonry**: dashboard cards render on scroll and the masonry
  layout reorders the DOM — never map cards by index, match by a marker.
- **card-mod registers lazily**: `customElements.get('card-mod')` can read `false`
  until the first `card_mod` card renders. Don't gate on it; the resource 200 +
  observed effects confirm it's working.
- **`dockerd` can get reaped** between steps in some sandboxes — `run.sh` restarts
  it; long sessions may need a re-check.
- **The matrix measures the icon** for `icon_color`/`accent_color`. `—` means the
  card has no icon; for `accent_color` on gauge/thermostat that does **not** mean
  accent has no effect on the arc/ring (not yet measured).

---

## Extending

Add a card type or entity to the `CARDS` map and/or a setting to `SETTINGS` in
`matrix.mjs`. Each setting is `{ css, tag, prop }`: the CSS the tool emits, the
target element to find, and the computed property to compare. To test exactly what
the tool produces end-to-end, import and call the real `css-generator` output
instead of the hand-written CSS strings.

---

## UIX sandbox (`run-uix.sh`)

A second, **separate** rig that runs real Home Assistant + real
[UIX](https://uix.lf.technology/) (github.com/Lint-Free-Technology/uix, the
card-mod-derived HA integration the studio also supports) instead of card-mod,
and verifies the same way: real render, real computed style.

```bash
tools/sandbox/run-uix.sh
```

Results land in `harness/uix-matrix.json`. Override `UIX_TAG` (default `v7.6.1`)
and `HOST_PORT` (default `8124`) as needed.

### Why a separate instance, not just another resource on run.sh's rig

UIX's own config flow (`custom_components/uix/config_flow.py`) **refuses to set
up if it detects any Lovelace resource URL containing the substring
`"card-mod.js"`** (`old_frontend_script_resource` abort) — confirmed by reading
`checks.py`/`const.py` and reproduced live. So `config-uix/configuration.yaml`
intentionally has no card-mod resource, and this runs as its own container
(`ha-sandbox-uix`, host port `8124` by default) against `config-uix/`, entirely
independent of `run.sh`'s `ha-sandbox` container and `config/`.

### How it's installed (headlessly)

UIX ships as a real HA **integration** (`custom_components/uix`, `config_flow:
true`), not a droppable JS resource, so setup is a different shape than
card-mod's:

1. `git clone --depth 1 --branch $UIX_TAG` the upstream repo and copy
   `custom_components/uix` into `config-uix/custom_components/uix` before the
   container starts, so HA picks it up on boot. (Not a tarball download —
   `codeload.github.com`, GitHub's archive/zip endpoint, is blocked by some
   outbound network policies even when `github.com` itself is reachable; plain
   `git clone` over the smart-HTTP protocol works.)
2. `harness/uix_setup.py` completes the integration's config flow headlessly:
   `POST /api/config/config_entries/flow {"handler": "uix"}`. Reading
   `config_flow.py`'s `async_step_user`, it takes no user input — it either
   aborts (single-instance guard, or the check above) or immediately returns
   `async_create_entry`. So one authenticated POST is enough; no UI, no form.
3. `harness/onboard.py` (shared with `run.sh`) handles the initial HA user
   onboarding exactly as before — `TOKENS_OUT`/`TOKENS_IN` env vars point both
   scripts at `tokens-uix.json` instead of the default `tokens.json` so the two
   rigs' credentials never collide if both exist on disk at once.

### What `uix_matrix.mjs` verifies

Against the real running integration (not just source-reading or unit tests):

1. `isUixInstalled()`'s `customElements.get('uix-node')` probe is accurate, and
   `isCardModInstalled()` correctly stays `false` in a UIX-only install.
2. UIX actually applies a `uix:` style block to a real card.
3. UIX actually applies a `card_mod:` style block (its documented fallback).
4. UIX prioritizes `uix:` over `card_mod:` when a card has both — the exact
   precedence `src/parser/yaml-parser.ts` and `src/generator/yaml-generator.ts`
   assume.
5. The real `cms-panel` editor, mounted standalone as in `editor_audit.mjs`:
   the "not detected" warning banner is absent, and editing a setting (driven
   by dispatching the same `state-changed` event the Background module's own
   template binding listens for) emits `uix:` — not `card_mod:` — proving
   `pickOutputKey()` picks correctly against a live UIX install.

### `merge_check.mjs` — card_mod:/uix: merge-and-cleanup on edit

Also runs against `run-uix.sh`'s UIX-only rig (the environment the bug this
covers was reported against). Mounts the real `cms-panel` editor and drives a
real edit (dispatching the same `state-changed`/`styles-changed` events the
modules' own template bindings listen for) to verify: a `card_mod:`-only card
edited once UIX is active gets **renamed** to `uix:` (not duplicated); a card
with divergent settings under each key gets them **merged** into the single
active key, with the inactive key **cleared**; and the same for an individual
entities-card row, a separate code path from the card-level one. Includes the
exact real-world card that surfaced both this bug and the same-selector
CSS-parsing bug fixed alongside it (see `test/merge-dedup.test.ts` for the
equivalent unit-level coverage, and `src/generator/yaml-generator.ts`'s
`applyCardModStyle` doc comment for the design).

### `gradient_uix_only_compat_check.mjs` — the gradient marker against real UIX

Also runs against `run-uix.sh`'s UIX-only rig: the exact same brace-free
`--cms-gradient-stops` marker verified against real card-mod in
`gradient_uix_compat_check.mjs`, here applied via a `uix:` style block on a
real card and checked via `getComputedStyle`. UIX is a separate
reimplementation, not literally card-mod's code, so passing against one
engine doesn't guarantee the other — this was worth checking independently
given the bug this marker format fixed (see `docs/DEVELOPMENT.md`'s "Real
card-mod silently drops a whole style block" note) was specific to how
card-mod's own parsing handles a declaration's value, not something
`uix_matrix.mjs`'s existing checks happened to cover.

```bash
cd tools/sandbox/harness
HA_URL=http://127.0.0.1:8124 node gradient_uix_only_compat_check.mjs
```

### `gauge_color_check.mjs` — gauge dial color really applies

HA's `hui-gauge-card` writes its severity-computed color as an *inline
style* on `<ha-gauge>` on every render (a `styleMap` in the card's own
template), so an inherited `--gauge-color` set on `ha-card` — the Studio's
pre-0.7.1 output — silently never applied. The fix targets `ha-gauge`
directly with `!important`, the one thing in the cascade that beats a
non-important inline style. This check keeps both halves honest against a
real gauge card: the OLD form must still *fail* to recolor the arc (if it
ever starts working, HA changed gauge internals and the `!important` form
should be re-evaluated) and the new form — from the real `cms-panel`, both
Accent Color and a Fade-mode Threshold — must produce the exact expected
`getComputedStyle` stroke on the arc, plus a clean round-trip with zero
Advanced-CSS leftovers. Also runs against the UIX rig:

```bash
cd tools/sandbox/harness
TOKENS_FILE=tokens-uix.json STYLE_KEY=uix HA_URL=http://127.0.0.1:8124 node gauge_color_check.mjs
```

Needle-mode gauges (`needle: true`) have no value arc at all — the dial
shows the configured segment colors, and no CSS can recolor it without
piercing `ha-gauge`'s shadow root. Inherent limitation, hinted in the panel.

### `preset_stale_state_check.mjs` — reused-panel preset load

Investigated a real report ("save a gradient as a preset, apply it to a
duplicate of the card, it doesn't render — but rebuilding it from scratch
on the same card works") that turned out not to be a bug: reproduces the
one architecturally-real mechanism that could explain it — `cms-injector.ts`
reuses the same `<cms-panel>` instance across successive "edit a different
card" actions within one dialog session, and `_initState()`'s dedup guard
persists across `.config` updates on that reused instance, which a
byte-identical duplicate card would trigger. Forces exactly that reuse and
confirms state still rebuilds correctly and the result still renders the
right color. Kept as a permanent regression check for this mechanism.

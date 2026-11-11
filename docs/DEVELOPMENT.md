# Development Guide

This document explains how to set up a local development environment and test Card-Mod Studio against a real Home Assistant instance.

---

## Prerequisites

| Tool | Minimum version | Notes |
|---|---|---|
| Node.js | 18 | 20 LTS recommended |
| npm | 9 | Comes with Node |
| Home Assistant | 2025.9.0 | The plugin's minimum (`hacs.json`); any install method works. The sandbox rigs pin 2026.11.0 |
| card-mod **or** UIX | card-mod 4.x / [UIX](https://uix.lf.technology/) 7.x to 9.x (the 2026.11 sandbox pins UIX 9.0.0; 8.3.1 and 8.4.0 were the last on older HA) | One of the two must be installed in HA — see [README's UIX section](../README.md#uix-support) |

---

## First-time setup

```bash
git clone https://github.com/dertrolli/card-mod-studio
cd card-mod-studio
npm install
```

---

## Building

```bash
# Single build — output goes to dist/card-mod-studio.js
npm run build

# Watch mode — rebuilds on every .ts file change
npm run dev

# Type check only (no output)
npm run typecheck
```

The Vite config produces a single ES module bundle. No chunking.

---

## Deploying to Home Assistant

### Option A — Manual copy

After each build, copy the output:

```bash
cp dist/card-mod-studio.js /path/to/ha/config/www/
```

Then in HA's browser: `Ctrl + Shift + R` (hard refresh).

If styles seem stale, bump the `?v=` in the resource URL:

```
/local/card-mod-studio.js?v=0.1.1
```

### Option B — Automated copy (watch + copy)

You can wire up a simple shell one-liner to auto-copy on rebuild:

```bash
# In one terminal: watch for changes
npm run dev

# In another terminal: watch dist/ and copy on change
while inotifywait -e close_write dist/card-mod-studio.js; do
  cp dist/card-mod-studio.js /path/to/ha/config/www/
  echo "Copied at $(date +%H:%M:%S)"
done
```

Or if you have `fswatch` (macOS):
```bash
fswatch dist/card-mod-studio.js | xargs -I{} cp {} /path/to/ha/config/www/
```

### Option C — n8n automation

If you have n8n running alongside HA, you can create a workflow that watches the `dist/` folder via the filesystem node and copies to `www/` automatically.

---

## Registering the resource in HA

1. Go to **Settings → Dashboards → ⋮ (top right) → Resources**
2. Click **+ Add Resource**
3. Set:
   - **URL:** `/local/card-mod-studio.js?v=0.1.0`
   - **Resource type:** JavaScript Module
4. Click Create
5. Hard-refresh the browser

> You only need to do this once. On subsequent rebuilds, just hard-refresh the browser (update `?v=` if caching is a problem).

---

## Dev workflow

```
1. Open VS Code with the project
2. Run: npm run dev   (watch mode)
3. In HA: open any card editor
4. Open browser DevTools → Console tab
5. Edit a .ts file → Vite rebuilds → copy dist file → Ctrl+Shift+R in HA
6. Check console for "[Card-Mod Studio]" log messages
7. Verify the 🎨 Style button appears in the editor header
```

---

## Debugging injection issues

If the Style button doesn't appear:

1. Open browser DevTools (F12) → Console
2. Look for `[Card-Mod Studio]` messages:
   - `Waiting for hui-dialog-edit-card...` — plugin loaded, waiting for HA to define the element
   - `hui-dialog-edit-card patched successfully.` — injection worked
   - `Could not find ha-button[slot=secondaryAction]...` — HA's internal structure changed, see below
3. If you see that warning, inspect the shadow DOM of `hui-dialog-edit-card` to find the current structure and update `cms-injector.ts`

### Inspecting the shadow DOM

In DevTools Console (with a card editor open):
```javascript
// Find the dialog element
const dlg = document.querySelector('hui-dialog-edit-card');

// Inspect its shadow root
dlg.shadowRoot.innerHTML;

// Or list child elements
Array.from(dlg.shadowRoot.children).map(el => el.tagName + '.' + el.className);

// Confirm the footer button selector still resolves
dlg.shadowRoot.querySelector('ha-button[slot=secondaryAction]');
```

This tells you what selectors to update in `injectButton()` inside `cms-injector.ts`.

---

## Testing

Unit tests live in `test/`. Run with:

```bash
npm test
```

Tests use Vitest and cover the pure logic layer: the CSS/YAML generator, the
parser, the card-mod/UIX detection probes, and the card_mod:/uix:
cross-compatibility checks. UI injection and real-DOM rendering are **not**
covered by Vitest (no jsdom/happy-dom in this project) — they're verified
against a real Home Assistant + real card-mod/UIX instance in Docker instead.
See [`tools/sandbox/README.md`](../tools/sandbox/README.md) — `run.sh` for
card-mod, `run-uix.sh` for UIX. Both produce real computed-style measurements
and screenshots, not simulated ones. The two rigs are separate containers on
separate ports and run side by side; the env overrides (`CFG`, `CONTAINER`,
`HOST_PORT`, `TOKENS`) also allow extra instances, e.g. a second one on the
HA `:beta` image. For release-readiness work, `release_qa.mjs` drives the real
card-edit dialog per theme × viewport × scenario and measures contrast,
clipping and touch targets (details in the sandbox README).

---

## Releasing

- **Release from the branch that carries the version.** Beta tags come from
  the 0.11 branch, not `main`: in GitHub's "Draft a new release" form choose
  that branch as the **target**. (2026-11-07: v0.11.0-beta.2 was created from
  `main`, so its asset was v0.10.2 code; the owner deleted the release and
  tag and re-published it on 2026-11-10 from the 0.11 branch.)
- **Tag = `"v"` + `package.json` version** (`v0.11.0`, `v0.11.0-beta.2`).
- `.github/workflows/release.yml` runs on the tag, builds
  `dist/card-mod-studio.js` and attaches it. It **fails the release when the
  tag differs from `v<package.json version>`**, and marks any tag containing
  `-` (e.g. `-beta.N`) as a GitHub **pre-release** (`prerelease:
  ${{ contains(github.ref_name, '-') }}`). Listed in the v0.11.0-beta.3
  CHANGELOG section.
- Version and changelog rules live in `CLAUDE.md`: a published pre-release
  counts as released (a later fix gets the next beta number or version, never
  an edit of a published changelog entry); beta numbers are sequential.
- Before tagging: typecheck, full unit suite, build, the live suite on both
  rigs, and bookkeeping (`package.json`, `CHANGELOG.md`, README cache-bust URL
  and status table, `docs/ROADMAP.md`).
- The wiki is published from `main` by `.github/workflows/wiki.yml`, and the
  README screenshots are hot-linked from `main` — so wiki and image changes
  made on a release branch go live only when it is merged to `main`.

## Rig recovery

- After a machine recycle Docker is down: start the daemon with
  `sudo -n dockerd` (in the background), then `docker start <containers>`
  (the card-mod and UIX rig containers; `docker ps -a` lists them).
- `tools/sandbox/run.sh` / `run-uix.sh` rebuild a rig from scratch with the
  current pins (HA 2026.11.0, UIX v9.0.0, Mushroom v5.2.3, Bubble v3.4.3).
- HA can't start on a config folder migrated by a newer HA — use a fresh
  `CFG=` folder for older images.
- Live suite: `harness/run_suite.sh <label> <card-mod|uix> <url> <tokens>
  <outdir>`; custom-card audit: `AUDIT_CUSTOM=1 node harness/module_effect_audit.mjs`;
  README screenshots: `harness/readme_shots.mjs` (`SHOT_SCALE=2`, `resetTheme`
  first so the default theme is used).

## Project architecture

### Injection mechanism

The plugin patches the `updated()` lifecycle method on `hui-dialog-edit-card`'s prototype (the card-editor dialog). This is the same element and technique card-mod itself patches for its brush-icon indicator.

```
Browser loads card-mod-studio.js
  → registers cms-panel and cms-tab-button custom elements
  → calls startInjector()
    → customElements.whenDefined('hui-dialog-edit-card')
    → patches the dialog class prototype's updated()

User opens card editor
  → HA creates hui-dialog-edit-card
  → HA calls updated() → our patch runs
  → requestAnimationFrame defers by one paint
  → injectButton() inserts <cms-tab-button> next to
    ha-button[slot=secondaryAction] (the Cancel/Save footer)
  → User clicks button → togglePanel() creates/shows <cms-panel>
    inside hui-card-element-editor's shadow root
  → …and marks hui-card-element-editor [data-cms-studio-open]: a <style>
    in the dialog's shadow root hides HA's editor and its .element-preview
    (visibility) while the panel is shown
```

The panel is `position: absolute; inset: 0` over the dialog body, so HA's own
editor and preview are still underneath it. They're hidden while it's open
(`visibility: hidden`, the panel opts back in with `visibility: visible`)
because on themes with translucent card/dialog backgrounds they showed
through the panel (issue #36). The sandbox configs ship a **Glass QA** theme
for exactly this case (`settheme` event with `{ theme: 'Glass QA', dark }`);
`functional_ui_check`'s stylebutton section asserts the hide/restore.
**HA saves that choice to the test user's profile**, so every later run on
that rig (fresh browser contexts included) keeps the glass theme and a
forced dark/light mode — reset it afterwards with
`settheme { theme: 'default', dark: undefined }` (found 2026-10-27, when a
whole visual pass had silently run on the glass theme).

The card config is read from the dialog's `_cardConfig` property and the
`hass` object from the dialog; changes are emitted back via a `config-changed`
CustomEvent that HA's normal save flow picks up.

### Data flow

```
User adjusts UI control in cms-panel
  → module emits state-changed event
  → cms-panel collects all module states
  → css-generator.ts builds CSS string
  → dom-helpers.ts: isCardModInstalled() / isUixInstalled() probe the environment
  → yaml-generator.ts: pickOutputKey() picks card_mod (default) or uix
      (only when UIX is installed and card-mod is not)
  → yaml-generator.ts: applyCardModStyle() wraps the CSS in that key,
      and clears the *other* key's .style — not syncs it — since the state
      it was built from was already merged from both keys on open (below),
      so the other key is redundant by the time this runs. Left untouched
      instead if it's a uix: block using macros/billets, which can't be
      safely parsed or determined redundant.
  → cms-panel fires config-changed CustomEvent
  → HA's editor picks this up → marks card as modified
  → User clicks Save → HA saves the config
  → card-mod/UIX reads card_mod.style or uix.style → applies CSS
```

Reading works the other way: `yaml-parser.ts`'s `parseCardModConfig()` reads
`config.uix?.style ?? config.card_mod?.style` (`resolveStyle()`, the same
precedence UIX itself uses) for the *single-key* case. But cms-panel.ts's
`_buildMergedState`/`_buildMergedRowStyle` go further — when **both** keys
carry real content (e.g. left over from switching card-mod ↔ UIX, or edited
separately under each), they parse both independently and merge them
(`mergeStudioStates`/`mergeEntityRowStyles` in `state-mapper.ts`): the active
key (per `pickOutputKey()`) wins per-module on conflicts, a module only
enabled under the *inactive* key fills the gap. This is what lets the next
save consolidate to one key without losing a setting that only lived under
the other one.

A related parser subtlety worth knowing when touching `css-parser.ts`: the
same selector can legally appear in more than one block in a single style
(e.g. a static default in one `ha-card { }`, later overridden by a
conditional value in a second `ha-card { }`) — real CSS treats the later
declaration of a repeated property as the one that renders. `parseCss`
coalesces same-selector blocks (and de-dupes repeated properties within one
block) this way *before* any module recognizer sees them, so `findTarget`
picking "the" target for a selector is always looking at the fully-merged,
actually-live view — not just the first block that happened to match.

---

## Compatibility notes

### HA 2026.8 sandbox/harness gotchas (2026-08 audit)

Found while re-verifying against HA 2026.8.0 + UIX 8.0.0 — all
harness-side, no product code needed changing:

- **YAML-mode dashboards can't enter edit mode at all** anymore — checks
  that need the REAL card-edit dialog must drive a storage-mode dashboard
  (created over websocket: `lovelace/dashboards/create` +
  `lovelace/config/save`).
- **The kebab → "Edit dashboard" dropdown ignores synthetic clicks**
  (new `ha-dropdown-item` component). Navigate with `?edit=1` on a
  storage dashboard instead — it lands on the same `hui-card-options`
  overlay (which is otherwise unchanged, as is `hui-dialog-edit-card`).
- **`http.server_host` in configuration.yaml now triggers a BLOCKING
  "Confirm new HTTP server configuration" dialog** on every page load
  after restart (auto-reverting after ~10s!) — it silently eats
  Playwright mouse events aimed at anything underneath. Removed from both
  rig configs (binding all interfaces is the container default anyway).
- **Sensor-card footer graphs render NOTHING without recorder history**
  (2026.7 still drew a placeholder rect) — both rigs now enable
  `recorder:` + `history:`. Additionally the sensor card forwards `hass`
  to its `hui-graph-header-footer` only on hass UPDATES, so a
  probe-mounted card whose hass is assigned exactly once never hydrates
  its graph — re-assign `panel.hass = {...hass}` after mount (see
  preview_picker_check). (HA's source forwards `hass` to that footer on
  `ll-upgrade` from 2026.9 on, so the workaround is redundant there — kept,
  it is harmless.)

### HA 2026.9 / 2026.10 sandbox/harness gotchas (v0.10.0 release QA)

Found while re-verifying against HA 2026.9.4 and 2026.10.0b0 with card-mod
4.2.1 and UIX 8.3.1 — again harness-side only:

- **card-mod, loaded as a dashboard resource, applies later than before.**
  It applies asynchronously after the cards first render, and on HA 2026.9
  that settles well past the old fixed 1.5s sleep in `button_matrix.mjs`.
  Wait for the `<card-mod>` element to attach on the styled cards instead of
  sleeping (`button_matrix.mjs` now polls until every styled marker card has
  one) — the same lesson as "Fresh-page probes race the engine's cold start"
  further down.
- **At ~360px the dashboard card-edit footer collapses "Edit" into the ⋮
  menu.** On a phone-width viewport HA reduces the `hui-card-options` footer
  to "− n + ⋮"; a harness that clicks the "Edit" link must fall back to
  ⋮ → Edit (`release_qa.mjs`'s `openStyle` does exactly that, which is also
  what a phone user taps).
- **The two rigs run side by side.** `run.sh` and `run-uix.sh` use
  different containers, ports, config dirs and token files, and accept
  `CFG` / `CONTAINER` / `HOST_PORT` / `TOKENS` overrides — so a second
  instance of either (for example on the `:beta` HA image) can run beside the
  default one. (Historical: `run-uix.sh` defaulted to UIX v8.3.1 in the 2026.9/2026.10 era; it now defaults to v9.0.0 — see "HA 2026.11 sandbox/harness notes" below. Pin `UIX_TAG=v8.3.1` for older HA.)

### HA 2026.11 sandbox/harness notes

- **Mount detached test cards inside `<home-assistant>`'s shadow root, never
  under `document.body`.** Since 2026.11, glance, gauge, light, alarm-panel,
  media-control and weather-forecast read `hass`, i18n and formatters through
  Lit context. A card outside `<home-assistant>` throws "Cannot read
  properties of undefined (reading 'localize')" and renders nothing. Harness
  scripts call `window.__cmsMount(host)` (defined by `installMountHelper` in
  `harness/harness-utils.mjs`, which `waitForHassReady` runs for you) instead
  of `document.body.appendChild(host)`, and look the host up again with
  `window.__cmsFind('#host-id cms-panel')` — a shadow-aware lookup, because
  `document.getElementById` can't see into `<home-assistant>`'s shadow root.
  Gauge, alarm-panel and media-control
  also lazy-load their element definitions, so `waitForHassReady` pre-loads
  them via `window.__cmsReady([...])`; call that yourself before polling for
  any other lazily-defined card.
- **HA will not start on a config folder that a newer HA has migrated.** To
  test an older HA image, point `CFG=` at a fresh folder rather than reusing
  `config/` or `config-uix/` (they are migrated by whichever HA ran last).
- **The rigs are pinned.** `run.sh` and `run-uix.sh` default `HA_IMAGE` to
  `ghcr.io/home-assistant/home-assistant:2026.11.0`, and `run-uix.sh` defaults
  `UIX_TAG` to `v9.0.0` (UIX 9 requires HA 2026.11; 8.x is for older HA).
  Both rigs also download Mushroom (`MUSHROOM_TAG`, default `v5.2.3`) and
  Bubble Card (`BUBBLE_TAG`, default `v3.4.3` — the release fixed for HA
  2026.11); `CUSTOM_CARDS=0` skips that.
  Override per run, e.g. `HA_IMAGE=ghcr.io/home-assistant/home-assistant:beta
  CFG=/tmp/ha-beta bash run.sh` or `UIX_TAG=v8.3.1 HA_IMAGE=...:2026.10.0
  CFG=/tmp/ha-old bash run-uix.sh`.
- `harness/run_suite.sh <label> <card-mod|uix> <url> <tokens> <outdir>` runs
  the whole live suite against one rig (a failing check is retried once; set
  `SUITE_ONLY="check_a check_b"` to run a subset). The list per engine includes
  `pierce_check` (Font → Number size on the gauge and thermostat, through the
  real editor). `harness-utils.mjs`'s `resetTheme` resets a theme left behind
  by an earlier probe.
- **Custom-card audit.** `module_effect_audit.mjs` audits the built-in cards by
  default; `AUDIT_CUSTOM=1` audits the custom-card profiles instead — all 18
  registered Mushroom types and the 4 Bubble kinds (button, button + slider,
  separator, cover), with entities taken from `hass.states` — and writes
  `module-effect-audit-custom-<engine>-<ha version>.json/.md`;
  `AUDIT_CUSTOM=all` runs both in one go (same file names as the built-in
  audit). Mushroom and Bubble must be installed on the rig (they are, unless
  `CUSTOM_CARDS=0`). `AUDIT_CARDS=a,b` limits the sweep to those cards and
  `AUDIT_EXTRA_CARDS='{"custom:…":{…}}'` adds cards. The audit run on the 2026.11
  rigs (both engines) found 0 controls without effect.
- **Icon Color is audited as two controls**: its *colour* (only where the panel
  offers colour, `allowColor`) and its *size* (`icon:size`, only where
  `allowSize`, tested on top of an already-applied colour). A size-only card
  (Mushroom chips) therefore gets only the size test, the way Font's colour and
  size are audited separately (`font:color`, `font:size`).
- **Custom-card profiles are data.** Mushroom and Bubble knowledge lives in
  `src/utils/profiles/mushroom.ts` and `bubble.ts` and is read through
  `capsFor` in `src/utils/card-caps.ts` — never gate on a card type anywhere
  else. The probe evidence for every selector and variable is in
  `docs/research/2026-10-v0.11.md` §3.3.1; unit tests are
  `test/mushroom-profiles.test.ts`, `test/bubble-profiles.test.ts` and
  `test/custom-card-profiles.test.ts`. When Mushroom or Bubble ships a new
  version, re-run `AUDIT_CUSTOM=1` on both rigs before trusting a profile.

### Test rig and QA tooling (v0.11.0-beta.3)

- **card-mod is loaded through `frontend: extra_module_url` on the rig**
  (`tools/sandbox/config/configuration.yaml`, `- /local/card-mod.js`), as
  card-mod's own README recommends; the Studio, Mushroom and Bubble stay
  dashboard resources. As a plain dashboard resource card-mod evaluates
  10–60 ms *after* the first card is built on a cold page load, and it only
  patches cards created afterwards, so styled cards stayed unstyled. Measured
  on the rig (20 cold loads each, headless Chromium on a loaded 4-core
  machine): as a dashboard resource 0/5 and 2/5 styled (storage dashboard,
  YAML dashboard; HA 2026.11 with the Studio loaded); with `extra_module_url`
  18/20 (storage) and 19/20 (YAML). So the setting makes the failure rare,
  not impossible; it is not a Studio effect (the rate is the same with and
  without the Studio loaded) and UIX showed the same race now and then. `run.sh`
  warns when an existing config folder lacks the setting.
- **`gotoDashboard` in `tools/sandbox/harness/click-driver.mjs` still
  recovers from a missed load** (sidebar and Back, then reloads) and prints a
  `NOTE: style engine did not attach on load of …` line. Seeing that line is
  a rig signal, not noise; a run with many of them is a rig problem. Pass
  `expectStyled` to name the cards that must be styled.
- **The real-input click driver** `tools/sandbox/harness/click-driver.mjs`
  operates the product like a person: real pointer, keyboard and touch input
  on a real dashboard (edit mode, the card's Edit, the Style button, the
  controls, Save, Done); code is used only for fixtures (login by token,
  seeding a storage or sections dashboard through the websocket, setting
  entity states through REST) and for observation (computed styles, DOM,
  saved config). `locator.fill()`, `selectOption()`, `{ force: true }`,
  `page.evaluate` that acts, and URL shortcuts into edit mode are not allowed;
  a control that cannot be operated that way is a finding. Cards are addressed
  by config (index, `{ section, index }`, name, partial config, predicate),
  never by DOM position (masonry lays out 2–3 columns). The header comment of
  the file lists every helper (`launch` with `hasTouch` / `isMobile` for a
  phone, `tap`, `seedDashboard`, `seedSectionsDashboard`, `haFetch` /
  `setState`, `listSections` / `listControls` / `findControl`, `setSlider`,
  `typeText`, `setColor`, `pickSwatch`, `pickEntity`, `toggle`,
  `chooseOption`, `computedStyle`, …). `listSections` no longer counts the toggle button inside a module header as a second section. `setColor` commits with Tab (or Enter
  once) and never sends Escape, which would close the whole dialog. The UIX
  rig needs `UIX_TOKENS_FILE` (the default token file belongs to an old rig).
  Its smoke test `tools/sandbox/harness/click_driver_smoke.mjs` (29 steps,
  `RIG=cm` or `RIG=uix`; prints PASS/FAIL per step and exits 1 on a failure)
  exercises every helper: cm 29/29 and uix 29/29 in the last full run, with
  one unexplained flake on "reload: style still applied" on card-mod.
- **`module_effect_audit.mjs`: noise floor and an opaque picture fixture.**
  Cards can change pixels on their own (a camera, a canvas chart). The audit
  screenshots the *unstyled* card before and after every test; the
  difference is that test's noise floor, a test whose floor is above 30 px is
  repeated (up to 3 attempts), and an effect counts only above
  `30 + 2 × floor`. A shown module that stays inside a noisy card's floor but
  changed a computed style is listed as inconclusive instead of dead. A
  2.5 px ring along the card outline is ignored, and the picture cards use an
  opaque PNG served from the rig's `www/` (copied from `harness/fixtures`
  when missing) instead of a transparent favicon, so their Background no
  longer reads as an artefact. `AUDIT_TAG=name` keeps result files apart.
- **Audit and tooling updates for beta.3.** `module_effect_audit.mjs` tests
  Font weight with a value that differs from the card's own text weight
  (Normal for text that is natively 550 or heavier, otherwise Bold; it tries the other weight when the first shows nothing, as on cards that mix bold and regular text such as calendar and markdown), treats a
  changed custom property on a noisy canvas card (history-graph) as
  inconclusive rather than dead, has a `media-control (off)` row, and takes
  `AUDIT_CARDS=a,b` and `AUDIT_BUNDLE=/path/card-mod-studio.js` (audit a local
  build). `readme_shots.mjs` seeds its demo palette in the Home Assistant user
  profile and restores it. The functional check, the suite checks and the click
  driver were updated for the beta.3 behaviour. Slider facts per Home
  Assistant version: `docs/COMPATIBILITY_AUDIT.md`.
- **`gradient_mode_check.mjs`** picks the select that offers `gradient` (and a
  sensor without numeric attributes): on HA 2025.9.4 it used to take the
  "Value read from" select first and scored 1/8; it scores 8/8.

### hui-dialog-edit-card

This is an internal HA element name. If HA renames it:
1. The warning `Could not find ha-button[slot=secondaryAction]` will appear
   in the console
2. Update the constant `HA_DIALOG_ELEMENT` in `src/utils/dom-helpers.ts`
3. Update the `SECONDARY_ACTION_SELECTOR` and panel-host lookup in
   `src/editor/cms-injector.ts`

### Shadow DOM selectors

`injectButton()` finds the dialog footer via a single confirmed selector:
```typescript
const SECONDARY_ACTION_SELECTOR = 'ha-button[slot=secondaryAction]';
```

The `<cms-tab-button>` is inserted before the existing Cancel/Save button and
carries `slot="secondaryAction"` so it lands in the same footer area. The panel
itself is hosted in `hui-card-element-editor`'s shadow root (see `getPanelHost`),
falling back to the dialog's own shadow root. If HA restructures the dialog,
update these in `cms-injector.ts`. Always inspect the live shadow DOM first
(see Debugging section).

### `position: fixed` popovers inside the dialog

Any UI that pops out of normal flow with `position: fixed` (like
`cms-color-picker`'s compact-mode popover) has to account for two properties
of HA's card-edit dialog that a component's own shadow DOM doesn't shield it
from:

1. **The native `<dialog>` (nested `ha-dialog` → `wa-dialog` → `<dialog>`,
   two shadow roots deep) carries a CSS `transform`.** It's an identity
   matrix with no visible effect, but per the CSS spec *any* transform
   value other than `none` still establishes a new containing block for
   `position: fixed` descendants — so `top`/`left` computed from
   viewport-relative `getBoundingClientRect()` coordinates get applied
   relative to the dialog's own top-left corner instead, and get clipped
   by its `overflow: hidden`.
2. **The dialog is shown via `showModal()`**, which promotes it to the
   browser's "top layer" — nothing outside that layer can paint above it,
   regardless of z-index. Escaping #1 by rendering into a portal on
   `document.body` fixes the positioning but makes the popover invisible,
   hidden behind the modal.

`cms-color-picker.ts`'s `_ensurePortal`/`findModalDialogAncestor` is the
reference implementation: find the nearest open modal `<dialog>` ancestor by
walking the *flattened* tree (piercing shadow hosts and `<slot>`
assignments — a plain `parentElement`/`closest()` walk misses both), append
the popover portal as that dialog's direct child when found (keeping it in
the top layer), and compute position relative to the dialog's own rect
instead of the viewport's. Falls back to `document.body` +
viewport-relative positioning when there's no dialog ancestor (e.g. a
component mounted standalone, as in the sandbox's `palette_check.mjs`).

**This is untestable with a standalone-mounted panel.** Any check that does
`document.createElement('cms-panel')` straight onto `document.body` has no
`<dialog>` ancestor at all, so it can't exercise either problem above —
`tools/sandbox/harness/dialog_popover_check.mjs` opens the *real* HA dialog
(overflow menu → Edit dashboard → a card's Edit link → Style tab) instead,
and verifies the popover is genuinely clickable at its rendered position
(piercing shadow roots via nested `elementFromPoint` calls), not just
present in the DOM — a purely positional/`getBoundingClientRect()` check
can't tell "on-screen" apart from "on-screen but painted behind the modal".

### `<ha-entity-picker>` needs a real ancestor, not just `.hass`

Every entity field in the panel (`cms-entity-picker.ts`) wraps HA's own
`<ha-entity-picker>`. As of HA 2026.6/2026.7, that component no longer reads
`hass`/registries/i18n off a plain `.hass` property internally — it consumes
them via `@lit/context` (`@consume({ context: statesContext, subscribe: true })`
and similar for registries/i18n/config). Context-request events bubble up
the DOM looking for a provider; HA's provider lives on `<home-assistant>`
itself. Setting `.hass` is still required (it's a real, separate property
the component also reads directly), but it's no longer sufficient on its
own — the element also has to be a genuine DOM descendant of
`<home-assistant>` for those `consume()` calls to resolve at all.

Mount a bare `<ha-entity-picker>` (or anything containing one) directly on
`document.body` — the pattern every check script in this directory used
before v0.7.0 — and its own `render()` throws (`_i18n`/`_registries` stay
`undefined`) on the very first paint; Lit doesn't clear old content on a
failed render, and there is no old content yet, so it renders as an empty
shadow root: present in the DOM, completely invisible, no error surfaced
anywhere except the browser console. Confirmed by mounting the same bare
element both ways in a throwaway script — identical `.hass`, only the
ancestor differed. This doesn't affect the real product (`cms-injector.ts`
always injects into HA's own dialog element, itself already a descendant of
`<home-assistant>`) — it's purely a test-mounting concern.
`tools/sandbox/harness/entity_binding_check.mjs` appends its mount host to
`document.querySelector('home-assistant')` instead of `document.body` for
exactly this reason; any future check exercising an entity/device/area
picker needs the same.

### Real card-mod silently drops a whole style block if a `{`/`}` appears in *any* declaration's value — even a quoted string

Gradient mode (`v0.7.0-beta.3`) needed to smuggle its real anchor points
through the generated CSS so reopening the editor could recover them —
see `encodeGradientStops` in `css-generator.ts`. The first attempt encoded
them as JSON in a custom property: `--cms-gradient-stops: '[{"v":0,...}]';`.
This is entirely valid CSS — the braces sit safely inside a single-quoted
string, which a spec-compliant CSS tokenizer treats as opaque text, exactly
like this project's own `css-parser.ts` already does (see its
brace-depth-counting note in `splitIntoBlocks`).

Real card-mod doesn't care that it's spec-valid. Its own style-string
parsing (not the browser's CSS parser — this happens before the string
ever reaches a `<style>` tag) silently failed to apply *any* declaration in
the block the moment that property was present — not just the malformed
one, the `color: {{ ... }}` declaration right next to it too. No console
error, no warning, nothing — `card_mod`/`uix` info logs still show
"detected", the config still validates, the dialog still shows a preview
pane; the only symptom is the icon/background/whatever just never changes
color, which reads exactly like a logic bug in the generated Jinja rather
than a parsing failure two layers away.

**This is invisible from source reading and even from this project's own
unit tests** — `parseCss`/round-trip tests only exercise *this project's*
parser, which correctly tolerates the braces (that's what made the bug
look safe). It only shows up by mounting a real `<hui-card>` with the
generated style and reading `getComputedStyle` — and even then, reliably
seeing it requires `await customElements.whenDefined('hui-card')` before
creating the element and *polling* for the computed color to settle
(card-mod's Jinja render is an async server round-trip with real latency
variance) rather than a fixed `setTimeout` — a fixed sleep produces
inconsistent pass/fail noise that looks like flakiness and masks the real,
fully-reproducible signal underneath it. Isolating the exact trigger took
bisecting single-character-class variants (`'#fff'` alone vs `'a:b'` vs
`'50:#fff,100:#000'` vs the full JSON) against a live instance —
`tools/sandbox/harness/gradient_uix_compat_check.mjs` is the permanent
regression check, and it verifies the full real pipeline (Studio UI →
generated CSS → real `<hui-card>` render → `getComputedStyle`), not just
that `parseCss` can read the marker back.

The bug was specific to card-mod's own parsing, but the fix was also
independently verified against a real UIX install
(`gradient_uix_only_compat_check.mjs`, against `run-uix.sh`'s rig) rather
than assumed safe by similarity — UIX is a separate reimplementation, not
literally card-mod's code, so passing against one doesn't guarantee the
other.

Fixed by encoding the marker as a brace-free `value:color,value:color,...`
string instead of JSON — same information, no braces anywhere. **Any
future marker/metadata smuggled through generated CSS must avoid `{` and
`}` in its encoding entirely**, regardless of how safely quoted it looks.

### A raw `<hui-card>` test only applies style under the key the *installed engine* actually reads — get it wrong and everything "silently fails"

`run.sh`'s sandbox has card-mod installed, not UIX. `run-uix.sh`'s has UIX,
not card-mod (the two *engines* can't share one HA instance — UIX's own
config flow aborts setup if it detects a `card-mod.js` resource — but the
two *rigs* are separate containers and run side by side). A raw
`card.config = { ..., uix: { style } }` on `run.sh`'s rig is never read by
anything — card-mod only looks at `card_mod:`. This produces exactly the
same *symptom* as the JSON-braces bug above (icon never changes color, no
error anywhere) for a completely
unrelated reason, and it's easy to fall into while iterating quickly on a
debug script, since `cms-panel` itself parses *either* key regardless of
which engine is installed (that's it correctly supporting both card-mod
and UIX users) — so state built through the Studio's own UI still looks
completely correct, and only the final real-render check silently no-ops.
**A trivial `color: red !important` under the wrong key fails to render
too** — if even that doesn't show up, suspect the config key before
suspecting the generated CSS. `preset_stale_state_check.mjs` was itself
written with this exact mistake mid-investigation and briefly "confirmed" a
product bug that didn't exist — caught by noticing a completely inert
sanity-check style also failed, which a *real* bug in gradient generation
specifically could never cause.

### A card that sets its variable as an *inline style* beats anything you inherit — target the element itself with `!important`

HA's `hui-gauge-card` computes its severity color per render and writes it
as an inline style directly on `<ha-gauge>` (a `styleMap` in the card's own
template): `<ha-gauge style="--gauge-color: var(--info-color)">`. An
inherited `--gauge-color` set on `ha-card` — however high its specificity —
can never win against that: inline styles beat author rules for the same
property on the same element. The Studio's pre-0.7.1 gauge output was
exactly that dead pattern, which is why "Accent Color does nothing on my
gauge" was true from day one despite the CSS looking perfectly reasonable.

The one thing in the cascade that DOES beat a non-important inline style is
an author declaration with `!important` on the element itself:

```css
ha-gauge {
  --gauge-color: #ff0000 !important;
}
```

Custom properties inherit into shadow roots, so setting it on the
`ha-gauge` *host* reaches the internal `.value { stroke: var(--gauge-color) }`
arc without any shadow piercing. Verified live in
`tools/sandbox/harness/gauge_color_check.mjs`, which also pins the broken
form as *expected-to-fail* so an HA-side change to gauge internals shows up
as a check failure.

This is a *pattern*, not a one-off. Two built-in cards are known to styleMap
a variable per render:

- `hui-gauge-card` → `--gauge-color` inline on `<ha-gauge>` (above). In
  needle mode there's no value arc; the needle's fill is
  `var(--primary-text-color)`, which the same `!important`-on-`ha-gauge`
  trick drives instead (shared with the value text — they match).
- `hui-tile-card` → `--tile-color` inline on `<ha-card>` itself, whenever
  the tile computes a state color (active/state-colored entities — i.e.
  exactly the interesting cases). Same fix: `--tile-color: X !important` in
  the injected `ha-card` block. Bonus: tile *features* derive
  `--feature-color: var(--tile-color)` in the tile's shadow styles, so
  winning `--tile-color` on ha-card recolors the bar-gauge/toggle feature
  rows too. Verified live in `tools/sandbox/harness/beta2_fixes_check.mjs`
  against an active light tile (inline `--tile-color` present and beaten).

When any card's color "mysteriously doesn't apply," check the element's
`style` attribute for the variable before suspecting the generated CSS.

### A related but distinct trap: a component reading its OWN CSS variable instead of the plain property — no `!important` needed, just the right variable name

The gauge/tile cases above are about *inline styles* winning the cascade.
`hui-tile-card`'s name/state text (`<ha-tile-info>`) has a different,
easier-to-miss problem: its internal `.primary`/`.secondary` rules don't
read the plain `font-size`/`font-weight`/`color` properties they'd normally
inherit — they read their own custom properties instead:

```css
.primary {
  font-size: var(--tile-info-primary-font-size);
  /* --tile-info-primary-font-size falls back to
     var(--ha-tile-info-primary-font-size, var(--ha-font-size-m)) */
  ...
}
```

So a bare `ha-card { font-size: 22px; }` is silently ignored there — not
because anything overrides it with higher specificity (no `!important`
fight, no inline style), but because the component never looks at
`font-size` at all once its own named variable resolves. The fix is just
setting the variable it actually reads: `--ha-tile-info-primary-font-size`
(+ `-secondary-` for the second line, `-font-weight` similarly, `-color`
falls back to `--primary-text-color` rather than inherited `color`).
`font-family` is *not* affected — `.primary`/`.secondary` never declare it,
so it inherits normally, same as everywhere else.

This is why "does setting X on ha-card actually work" can't be answered
from source reading alone even when there's no inline-style culprit to spot
— you have to check what CSS custom property (if any) the target's own
rule resolves, which only shows up by reading the component's own
`static styles`. Verified live in
`tools/sandbox/harness/font_module_check.mjs`, which pins the bare
`font-size` form on a tile as *expected-to-fail* alongside the working
companion-variable form, and confirms plain inheritance (no special
handling needed) on cards without such an override — entities-card rows,
markdown, glance — by checking their real rendered `getComputedStyle`.

### Fresh-page probes race the engine's cold start — wait for the engine element, not a fixed sleep

A Playwright probe that mounts a `<hui-card>` right after page load can see
*every* style silently fail — baselines unchanged, `!important` ignored,
nothing in the console — because card-mod/UIX itself hasn't finished
loading yet (its custom element isn't defined, so style blocks are simply
never processed). Bumping a fixed wait from 2.5s to 8s doesn't reliably fix
it; waiting on the actual readiness signal does:

```js
await page.waitForFunction(() =>
  !!(customElements.get('card-mod') || customElements.get('uix-node')));
```

Checks that happen to mount `cms-panel` first never hit this (the panel's
resource chain forces everything to load), which is exactly what made the
failure look intermittent across scripts.

### `customElements.whenDefined()` on a lazily-bundled editor element hangs forever

`hui-card-element-editor` (and the editors inside it, like
`hui-form-editor`) are only defined once HA loads the edit-dialog bundle —
which never happens on a plain dashboard view. `await
customElements.whenDefined('hui-card-element-editor')` therefore blocks
*indefinitely* (the promise only rejects for invalid names; `.catch()`
doesn't help), silently hanging the whole check. To exercise those
elements, open the **real** edit-card dialog first (kebab menu → Edit
dashboard → card Edit — the recipe in `dialog_popover_check.mjs` /
`font_module_check.mjs` section 7) and only then query for the editor.

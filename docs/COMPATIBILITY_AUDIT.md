# Card-Mod Studio — card-mod 4.x / HA 2026 Compatibility Audit

**Audit date:** 2026-06-25 (card-mod/HA) · 2026-07-03 (UIX addendum, §9) · 2026-10-03 (v0.10.0 refresh, §11)
**Audited version:** v0.4.0 (card-mod/HA) · v0.6.0 (UIX) · v0.6.1 (entities-row parser fix §10 item 5a, card_mod:/uix: dedup-on-edit §10 item 5b, same-selector-twice parse bug §10 item 5c) · v0.6.2 (dialog-transform popover positioning §10 item 5d) · v0.10.0 (§11)
**Reference targets:**
- card-mod **v4.2.1** (latest; released 2026-02-08). Major breaking release was
  **v4.0.0** (2026-11-18, requires HA 2025.11+).
- Home Assistant **2026.6** (latest stable, 2026-06-03).
- UIX **v7.6.1** ([Lint-Free-Technology/uix](https://github.com/Lint-Free-Technology/uix),
  latest as of the audit; see §9).
- **Refreshed 2026-10-03 (v0.10.0):** HA **2026.9.4** (stable) and
  **2026.10.0b0**, card-mod **4.2.1** (still the newest release), UIX
  **8.3.1** — see §11. The sections below keep the original audit text;
  statements the refresh overturned are annotated in place.

This document records how the YAML/CSS that Card-Mod Studio **generates** holds
up against current card-mod and Home Assistant, what is safe, and what needs
attention. It is deliberately concrete: each section is tied to the exact output
of `src/generator/css-generator.ts`.

---

## TL;DR

✅ **The tool is broadly safe on card-mod 4.x.** It emits almost exclusively the
**string form** (`card_mod: { style: "<css>" }`) targeting `ha-card` and
`ha-state-icon`. card-mod's v4.0.0 breaking changes were about the **dictionary
/ `$` shadow-pierce form** and **theme-class selectors** — neither of which the
generator produces. So the generated output was essentially unaffected by v4.

⚠️ **Three things to watch**, in priority order *(statuses updated for
v0.10.0 — see §11)*:
1. **`--mdc-icon-size`** (heading module) — the original audit expected MDC
   variables to be deprecated from HA 2026.4 on and to need migration.
   **Not borne out:** it is still HA's live icon-size variable and its use
   in HA's frontend grew (179 → 192 → 208 references across 2026.8.0 →
   2026.9.4 → 2026.10.0b0). No migration needed (§5).
2. **Dict / `$` shadow-pierce round-trip is lossy** — opening and saving a card
   that was hand-written in card-mod's dictionary form could corrupt those
   styles. **Resolved:** preserved verbatim since v0.9.1, *editable* since
   v0.10.0 (§4).
3. **Icon-color selector is `ha-state-icon` for every card type** — correct for
   button/tile/entity, but not all cards expose `ha-state-icon`, so icon color
   silently does nothing on some card types.

None of these are regressions; they are pre-existing limitations made visible by
this audit. See **Action items** at the end.

---

## 1. What we actually emit (output inventory)

| Module | Generated CSS (string form) |
|---|---|
| Accent color | `ha-card { --accent-color; … }` + card-type extras (`--tile-color`, `--gauge-color`, `--state-climate-*`, `--control-circular-slider-color`, `--state-icon-color`, `--paper-item-icon-active-color`) |
| Filter | `ha-card { filter; transition }` |
| Background | `ha-card { background }` (solid / `linear-gradient` / Jinja2 conditional) |
| Border | `ha-card { border-radius; border }` |
| Animation | `@keyframes cms-*` + `ha-card { animation; background-size }` |
| Icon color | `ha-state-icon { color }` (plain / on-off Jinja2 / light `rgb_color`) |
| Threshold | `ha-state-icon { color }` **or** `ha-card { background | color | --accent-color | border }` driven by a Jinja2 ternary chain |
| Heading style | v0.10.0: `.container { justify-content; --ha-heading-card-{title,subtitle}-{font-size,color,font-weight} }`, `.content p, .content .heading { font-family }`, `.content ha-icon { --mdc-icon-size; color }`. (Up to v0.9.x: `.title p { font-size; color }` and `.title ha-icon { --mdc-icon-size; --ha-icon-size; color }` — the `.title p` rule stopped matching on HA 2026.10, see §11.) |
| Font | `ha-card { font-size; font-weight; color; font-family }` + tile-card extras (`--ha-tile-info-{primary,secondary}-{font-size,font-weight,color}`) |
| Entity rows | `:host { --state-icon-color; color }` per row |

All of the above is wrapped as `card_mod: { style: "<string>" }` by
`yaml-generator.ts → applyCardModStyle`. **We never turn a string style into
a dictionary.** *(Since v0.10.0 a card that was already dictionary-form is
rebuilt in dictionary form around its regenerated `.` entry — see §4.)* This
inventory is the v0.4.0 snapshot; only the heading row is refreshed — later
modules and per-card companions are listed in `CHANGELOG.md`.

---

## 2. card-mod 4.x breaking changes — impact assessment

card-mod v4.0.0 changed (per the project's release notes / issue tracker):

| v4 breaking change | Do we emit it? | Impact |
|---|---|---|
| Theme-class styling `ha-card.myClass {}` → `:host(.myClass) ha-card {}` | ❌ No | **None** — we don't generate theme classes. |
| Shadow-root pierce `$: …` → `ha-card $: …` | ❌ No (output) | **None on output.** See §4 for the *input* round-trip risk. |
| `mod-card` now requires the `card_mod:` wrapper | ✅ We always wrap | **None** — we always emit a proper `card_mod:` block. |

**Verdict:** generated output is compatible with card-mod 3.x **and** 4.x. The
string form targeting `ha-card` / `ha-state-icon` has been stable across both
major versions.

---

## 3. Jinja2 templating — still valid

The tool emits these template constructs:

- `{{ '…' if is_state(config.entity, 'on') else '…' }}` (icon, background, filter, animation)
- `{{ '…' if states('sensor.x') | float(0) > N else (…) }}` (thresholds)
- `{{ 'rgb(' ~ (state_attr(config.entity, 'rgb_color') | join(', ')) ~ ')' if … }}` (light mode)

All use card-mod's documented template surface: **`config.entity`**, **`states()`**,
**`is_state()`**, **`state_attr()`**. These remain supported in card-mod 4.x.

> Note: card-mod does **not** expose the `hass` object directly inside templates;
> it exposes the `states()` / `is_state()` functions instead. The generator only
> uses the function forms, so this is fine. Templates are also cached ~20s by
> card-mod, which is expected behaviour, not a bug.

**Verdict:** ✅ no changes required.

---

## 4. Dictionary / `$` shadow-pierce round-trip (fixed in v0.9.1: preserved verbatim; editable since v0.10.0)

> **v0.9.1 addendum (2026-08):** the empirical re-audit for the v0.10 plan
> found this was WORSE than documented below — besides the corruption case,
> a *nested* dict-form style caused the whole `card_mod:` key to be
> **deleted** on the first edit, and a dict-form `uix.style` was cleared by
> the save path's uix-consolidation branch. All of it is fixed in v0.9.1:
> `applyCardModStyle` now short-circuits when EITHER style key is
> dictionary-form (`hasDictFormStyle`, style-compat.ts) and preserves both
> keys byte-identically; the panel shows a dedicated "preserved as-is"
> banner instead of dead controls (rows stay editable). Covered by 7 unit
> regressions + `dict_preserve_check.mjs` live on both engines. Visual
> EDITING of the dict form followed in v0.10.0 (addendum below) — see
> docs/V0.10_PLAN.md.

> **v0.10.0 addendum (2026-10):** dictionary-form styles are now **editable**.
> The `.` entry — the CSS for the card itself — runs through the normal
> visual modules; every other entry (pierced `selector$` chains, nested
> dicts, UIX `$$`/`&` keys) is preserved byte-identically in original key
> order and listed read-only in Advanced CSS. This holds for top-level
> cards, stack children and entities rows. Only *mixed-form* styling (a
> plain style on one key plus a *different* dictionary on the other, or a
> dictionary whose `.` isn't plain CSS) still freezes, behind a lock banner
> (a lock note on a row). The Studio still never converts a string style
> into a dictionary.

### Original finding (pre-v0.9.1, kept for history)

`parser/yaml-parser.ts → parseDictStyle` reads the dictionary form by treating
each key as a selector and wrapping its value: `` `${selector} { ${decls} }` ``.

- For simple keys (`"ha-card": "color: red;"`) this round-trips fine.
- For shadow-pierce keys (`"ha-card $": "h1 { color: purple; }"`) the wrap
  produces `ha-card $ { h1 { color: purple; } }`, which is **not** what the user
  wrote, and the nested block is not parsed correctly.

Because `applyCardModStyle` **always re-emits the string form**, opening a
dictionary-form card in the Studio and saving it **converts it to string form**
and can corrupt `$`-pierce rules.

**Current mitigation:** unrecognised CSS is preserved in the Advanced module and
the panel shows *"Some existing styles weren't recognised — preserved in
Advanced CSS."* That protects most flat CSS, but not nested `$`-pierce blocks.

**Recommendation (roadmap):** detect dictionary-form `card_mod.style` on open
and either (a) refuse to overwrite it (read-only banner), or (b) preserve it
verbatim and only append. Do **not** silently flatten. See ROADMAP.

---

## 5. Legacy / deprecated CSS variables

| Variable | Where we emit it | Status | Action |
|---|---|---|---|
| `--mdc-icon-size` | Heading module (`.content ha-icon`; `.title ha-icon` before v0.10.0), tile/entity/sensor icon size | ~~Deprecated in HA 2026.4+~~ — **not borne out (v0.10.0 re-audit).** Still the live icon-size variable (`ha-svg-icon` reads `var(--mdc-icon-size, 24px)`); HA's own use grew 179 → 192 → 208 references (2026.8.0 → 2026.9.4 → 2026.10.0b0). | None — keep. (The original "track HA's replacement variable" action found no replacement.) |
| `--ha-icon-size` | Heading module until v0.9.x, and the Icon size control (both a "forward-compat twin" of `--mdc-icon-size`) | **Inert — nothing in HA's frontend reads it** (0 uses at 2026.8.0, 2026.9.4 and 2026.10.0b0). | Dropped from the heading icon rule in v0.10.0 (older output carrying it is still recognised on open). The Icon size control still writes it next to `--mdc-icon-size` — harmless; a candidate for removal. |
| `--ha-heading-card-{title,subtitle}-{font-size,color,font-weight}` | Heading module (v0.10.0) | Current — HA's public heading-card variables, present from 2026.8.0 through 2026.10.0b0 and honoured by card-mod and UIX alike. | None. |
| `--paper-item-icon-active-color` | Accent color (generic cards) *(no longer emitted since v0.9.0-beta.3)* | Legacy "paper" variable; dead — 0 uses in HA 2026.8.0 → 2026.10.0b0. Still claimed when reading old configs. | None. |
| `--state-icon-color` | Accent color, entity rows | Current, supported. | None. |
| `--tile-color` | Accent color (tile cards) | Current (tile card var). | None. |
| `--gauge-color` | Accent color (gauge) | Current. | None. |
| `--state-climate-*`, `--control-circular-slider-color` | Accent color (thermostat) | Current climate control vars. | None. |

> `--paper-item-icon-color` is **not** emitted by the shipped generator.
> `iconColorBlock()` has never had card-type branching — icon color is
> emitted as `ha-state-icon { color }` for all card types (see §6), and
> `CARD_SUPPORT_MATRIX.md` confirms that selector already works for sensor
> cards. An earlier historical planning doc describing a sensor-specific
> `:host { --paper-item-icon-color }` path had drifted from the code and was
> retired (§10 item 4).

---

## 6. Card-type selector coverage (known gap)

`iconColorBlock()` always emits `ha-state-icon { color: … !important }`,
regardless of card type. This is correct for `button`, `tile`, `entity`,
`glance`, `light`, but **some card types do not render an `ha-state-icon`**, so
icon color silently has no effect there. The panel already hides the Icon Color
module for the worst offenders (`NO_ICON_COLOR_TYPES`), but coverage is
heuristic, not selector-verified.

This audit does **not** change generator behaviour for this — per-card icon
selectors need live HA testing across card types and belong on the roadmap. The
v0.4.0 fix in this pass (icon color now emits a *static* color instead of a
broken `is_state()` template on non-state-aware cards like `sensor`) removes the
most visible wrong-output case.

---

## 7. Injection-point compatibility

The Style button is injected by patching `hui-dialog-edit-card` and inserting
next to `ha-button[slot=secondaryAction]`; the panel is hosted in
`hui-card-element-editor`'s shadow root. These are internal HA element names.

- card-mod patches the **same** `hui-dialog-edit-card`, so this approach tracks a
  well-trodden integration point.
- HA's 2026.2 dashboard-editor overhaul and 2026.6 "pick a card" picker changed
  the *card-picker* flow but not the per-card **edit dialog** element, so the
  injection point remains valid as of 2026.6.
- If HA renames the element, the console logs
  `Could not find ha-button[slot=secondaryAction]…` and the button silently does
  not appear. The fix is localised to `HA_DIALOG_ELEMENT` /
  `HA_CARD_EDITOR_ELEMENT` in `src/utils/dom-helpers.ts` and the selector in
  `src/editor/cms-injector.ts`.

**Verdict:** ✅ valid on HA 2026.6; single-point-of-failure documented.
*(Re-verified through the real dialog in v0.10.0 on HA 2026.9.4 and
2026.10.0b0: `hui-dialog-edit-card`, `hui-card-element-editor`, `hui-form-editor`
and the `ha-button[slot=secondaryAction]` footer are unchanged — §11.)*

---

## 8. Summary verdict

| Area | Status |
|---|---|
| String-form output on card-mod 4.x | ✅ Compatible |
| Jinja2 template surface | ✅ Compatible |
| Injection point (HA 2026.6; re-verified 2026.9.4 / 2026.10.0b0, §11) | ✅ Valid |
| `--mdc-icon-size` (heading) | ✅ Still live — not deprecated (§5, §11) |
| Dict / `$`-pierce round-trip | ✅ Preserved verbatim (v0.9.1), editable (v0.10.0) |
| Per-card icon selector coverage | ⚠️ Heuristic gap |
| `--paper-item-icon-active-color` legacy | 🟡 Harmless, plan to drop |
| UIX support (v7.6.1 in §9; re-verified on 8.3.1, §11) | ✅ Compatible, verified live |
| Reverse-compat warning: top-level card | ✅ Covered |
| Reverse-compat warning: entities-row level | ✅ Covered (v0.6.0) |
| Reverse-compat warning: dict-form / duplicate-entity-ID rows | ✅ Resolved — dict-form rows (ROADMAP #23, v0.10.0) and duplicate IDs (#24, v0.9.0-beta.3) |

---

## 9. UIX compatibility (addendum, 2026-07-03)

[UIX](https://uix.lf.technology/) (`Lint-Free-Technology/uix`) is a card-mod-derived
HA integration built by card-mod's own current maintainer (its `LICENSE.txt`
still carries Thomas Lovén's original card-mod copyright). Unlike card-mod
(a single Lovelace JS resource), UIX ships as a real HA **integration**
(`custom_components/uix`, `config_flow: true`) that self-manages its own
frontend resource.

**What we verified, and how** — not just source-reading: a real UIX instance
running in Docker (`tools/sandbox/run-uix.sh`), driven headlessly through its
actual config flow, rendering real cards and reading real computed styles
(`tools/sandbox/harness/uix_matrix.mjs`), plus the real `cms-panel` editor
mounted against it (`tools/sandbox/harness/compat_check.mjs` covers the
reverse direction, card-mod-only).

| Finding | Verified |
|---|---|
| UIX registers `uix-node` as a custom element (never `card-mod`) | ✅ Live |
| UIX reads `config.uix` in preference to `config.card_mod` (`uix:` wins when a card has both) | ✅ Live |
| UIX fully applies `card_mod:` as a documented fallback — no `uix:` block required | ✅ Live |
| The Studio's `cms-panel` editor correctly detects UIX-only and emits `uix:` (not `card_mod:`) | ✅ Live |
| UIX's own config flow **aborts setup** (`old_frontend_script_resource`) if any Lovelace resource URL contains the substring `"card-mod.js"` | ✅ Live (reproduced in `config_flow.py`'s `async_step_user`) |
| UIX's config flow otherwise takes no user input — a single authenticated `POST /api/config/config_entries/flow {"handler":"uix"}` completes setup | ✅ Live |

**Practical implication of the abort check:** UIX and card-mod cannot
realistically coexist via UIX's own guided install — its installer refuses to
run alongside a `card-mod.js` resource. This is *why* `pickOutputKey()`
(`src/generator/yaml-generator.ts`) only ever switches to `uix:` output when
card-mod is absent: the "both installed" state isn't one UIX's own tooling
lets a user reach organically, so defaulting to `card_mod:` whenever card-mod
is present is the safe, conservative choice, not a guess.

**Reverse-compatibility warning covers both card-level and per-row.** A card
(or an individual `entities`-card row, checked independently via
`isUixOnlyRowStyle`/`hasUixOnlyRow`) styled only under `uix:` gets a specific
warning instead of silently rendering unstyled. Two distinct info banners
(not warnings — nothing's broken, just worth knowing) cover the "macros/billets
coexist with other styling" cases: `_uixMacrosCoexist` (card-mod is the active
target; the `uix:` macro content is deliberately left untouched, not synced)
and `_uixMacrosWillBeOverwritten` (UIX is the active target and *is* the only
place to write, so an edit here does overwrite hand-authored macro styling —
this one's a heads-up, not a "nothing happens" guarantee, since there's no
fallback key to write to instead).

**Known gaps, not yet covered — both pre-existing, not introduced by UIX
support** *(both since resolved: dict-form rows are read back and editable
as of v0.10.0 (ROADMAP #23); rows sharing an entity ID got positional keys in
v0.9.0-beta.3 (#24))*: `_initEntityRowStyles` only recognises **string-form** row styles;
a hand-authored dictionary/shadow-pierce-form row style isn't read back, and
(more seriously) the next unrelated edit on that card silently clears it,
same failure class as the card-level dict-form issue in §4 (ROADMAP #23).
Separately, `_entityRowStyles` is keyed by entity ID, so two rows referencing
the same entity collapse to one style slot (ROADMAP #24) — this predates UIX
support entirely; it just happens to be the same data model the new row-level
`uix:` checks build on.

**Not verified / explicitly out of scope for this audit:** UIX-exclusive
features with no card-mod equivalent (macros, billets, Forge, the `$$`/`&`
selector extensions) — the Studio doesn't generate any of these; see ROADMAP
for why (macros/billets are low-priority future work, Forge is explicitly not
being duplicated).

---

## 10. Action items (feed into ROADMAP)

1. ✅ **[High] Heading module — migrate off `--mdc-icon-size`** once HA publishes
   the Web Awesome icon-size replacement. Add a fallback chain in the interim.
   — **Closed (v0.10.0 re-audit):** no replacement has appeared —
   `--mdc-icon-size` is still the live variable (§5, §11). The interim
   `--ha-icon-size` fallback turned out to be inert.
2. ✅ **[High] Protect dictionary-form `card_mod`** from lossy string flattening
   (detect on open; preserve verbatim or go read-only). — **Done (v0.9.1:
   preserved verbatim; v0.10.0: editable).**
3. **[Med] Per-card icon-color selectors** — verify which card types expose
   `ha-state-icon`; emit the correct selector/variable per type. *(Glance was
   re-probed in the v0.10 cycle with pierced selectors on both engines: not
   achievable — documented limitation.)*
4. ✅ **[Med] Per-row entities uix-only warning** (§9) — **Done (v0.6.0)**.
   ROADMAP #19.
5. ✅ **[Med] Dict-form entities-row styles** (§9) — same fix as #2, at the row
   level. ROADMAP #23. — **Done (v0.10.0).**
5a. ✅ **[Med] Entities-row threshold default color silently discarded on
   parse** — **Fixed (v0.6.1)**. A distinct bug from #5 (string-form, not
   dict-form): `_parseEntityRowCss`'s value regex (`[^;}\n]+`) truncated
   right before a Jinja expression's closing `}}`, so `DEFAULT_RE` could
   never match and the row's real default color silently fell back to
   `#888888` on every panel re-open. Fixed by routing through the existing
   Jinja-safe `parseCss` instead (now exported as `parseEntityRowCss` in
   `state-mapper.ts`, with unit test coverage).
5b. ✅ **[High] card_mod:/uix: duplication instead of consolidation on edit**
   — **Fixed (v0.6.1)**. `applyCardModStyle`'s `outputKey === 'uix'` branch
   wrote the new `uix.style` but left an existing `card_mod.style`
   completely untouched (and the `outputKey === 'card_mod'` branch only
   *synced* `uix.style` to match, never clearing it) — repeated edits after
   switching engines left both keys populated indefinitely, with the
   inactive one silently going stale. The panel now merges settings from
   both keys on open (when both carry real content) and clears the inactive
   key's `.style` on save, so a genuine edit consolidates to one source of
   truth instead of accumulating duplicates. A `uix:` block using
   macros/billets is still never touched. The "Copy to card_mod" fix button
   (§9, item 4 above) is unaffected — it now has its own verbatim-copy
   implementation that deliberately doesn't clear `uix.style`, since it's a
   defensive fallback-add for when neither engine is confirmed installed,
   not a settings edit.
5c. ✅ **[High] Same selector declared twice loses the second (live)
   declaration entirely** — **Fixed (v0.6.1)**. `findTarget`/`findProp`
   only ever inspected the first target matching a given selector, and the
   "unclaimed → Advanced CSS" fallback keys purely on `selector+property`
   strings — so a CSS pattern like a static default in one `ha-card { }`
   block later overridden by a conditional value in a second `ha-card { }`
   block (a plausible hand-edit, and exactly what a real user-reported card
   contained) had its second, actually-rendered declaration collide with
   the first's claim key and vanish without a trace — not recognised as a
   module, not preserved in Advanced CSS either. `parseCss` now coalesces
   same-selector blocks (and de-dupes repeated properties within one block)
   using real CSS cascade semantics — later declaration wins — before any
   recognizer runs.
5d. ✅ **[High] Threshold color-palette popover mispositioned/invisible
   inside HA's real card-edit dialog** — **Fixed (v0.6.2)**. Reported with
   a screenshot showing the popover rendered hundreds of pixels off to the
   side. HA's dialog nests a native `<dialog>` two shadow roots deep
   (`ha-dialog` → `wa-dialog` → `<dialog>`) that carries a CSS `transform`
   (an identity matrix with no visible effect, but per spec any non-`none`
   transform still creates a new containing block for `position: fixed`
   descendants — breaking the popover's viewport-relative positioning) and
   is shown via `showModal()` (browser "top layer" — nothing outside it can
   paint above it, so a naive document.body-portal fix positioned it
   correctly but rendered it invisible). Fixed by rendering into a portal
   appended as a child of the nearest open modal `<dialog>` ancestor
   (found via a flattened-tree walk piercing shadow hosts and slot
   assignments) when one exists — keeping it in the top layer — with
   position computed relative to that dialog's rect instead of the
   viewport's; falls back to `document.body`/viewport-relative otherwise.
   `palette_check.mjs`'s standalone-mounted panel has no `<dialog>`
   ancestor and could never have caught this; a new permanent check
   (`tools/sandbox/harness/dialog_popover_check.mjs`) opens the real
   dialog and verifies the popover is genuinely clickable at its rendered
   position (piercing shadow roots via `elementFromPoint`), not just
   present in the DOM.
6. ✅ **[Med] Duplicate-entity-ID rows cross-contaminate styling** (§9) — needs a
   positional row key instead of entity-keyed. ROADMAP #24. — **Done
   (v0.9.0-beta.3).**
7. ✅ **[Low] Phase out `--paper-item-icon-active-color`** in the accent module.
   — **Done (v0.9.0-beta.3).**
8. ✅ **[Low] Pin/verify card-mod version** in docs (state "tested against card-mod
   4.2.x") and add it to the compatibility table in the README. — **Done**
   (README compatibility table, refreshed every release).
9. ✅ **[Housekeeping] Reconcile `docs/BUG_FIX_PLAN.md`** with the shipped
   `iconColorBlock()` — **Done (v0.6.2 repo cleanup)**. Confirmed the sensor
   `--paper-item-icon-color` path it described was never in the shipped
   generator; retired the file (ROADMAP #4).

---

## 11. v0.10.0 refresh (2026-10-03)

Re-audited from upstream source and release notes, then re-verified live in
the sandbox on **four** instances: **HA 2026.9.4** (current stable) and
**HA 2026.10.0b0** (2026.10.0 releases 2026-10-07), each with **card-mod
4.2.1** and with **UIX 8.3.1** — the full live-check suite, a functional UI
check of every control, and a theme × viewport visual QA sweep. (Previous
baseline: HA 2026.8.0 + card-mod 4.2.1 + UIX 8.0.0.)

| Finding | Detail |
|---|---|
| Editor injection surface unchanged | `hui-dialog-edit-card`, `hui-card-element-editor`, `hui-element-editor`, `hui-form-editor`, `ha-dialog`/`ha-dialog-footer` and the `ha-button[slot=secondaryAction]` footer are functionally identical from HA 2026.8.0 to 2026.10.0b0 (a couple of CSS lines and imports differ). The `hui-form-editor` shim is still required — UIX has no `getConfigForm()` handling either. |
| **Heading card markup changed in HA 2026.10** | The title is now `<h2 class="heading">` (`<h3>` for `heading_style: subtitle`) instead of `<p>`, so the `.title p` rule the Heading Style module wrote silently stopped matching (`.title ha-icon` and `.container` still matched). **Fixed in v0.10.0** — the module now writes HA's public `--ha-heading-card-*` variables (present on 2026.8.0 through 2026.10.0b0) plus `.content p, .content .heading` (font family) and `.content ha-icon` (icon), and also reaches Subtitle headings. Old `.title p` styles are adopted and migrated on save. |
| Light card slider replaced (HA 2026.10) | `round-slider` → `ha-control-circular-slider`. The Font module's light selectors (`#info`, `.brightness`) are unchanged and the Studio emits no round-slider variable. |
| `--mdc-icon-size` is live; `--ha-icon-size` is inert | Usage counts across HA's frontend at 2026.8.0 / 2026.9.4 / 2026.10.0b0: `--mdc-icon-size` 179 / 192 / 208; `--ha-icon-size` 0 / 0 / 0. The §5 "MDC deprecated in 2026.4+" expectation is not borne out; see §5. |
| card-mod 4.2.1 is effectively unmaintained | Still the newest release (no commits on `master` since 2026-02-09; the only newer tag is a side-branch pre-release for HA 2026.4 dialogs). On HA ≥ 2026.8 it **hangs if the active theme defines `card-mod-*-yaml` variables** (its `yaml2json` bootstrap waits for a developer-tools element HA no longer defines; HA 2026.9 adds a second crash in the mock it builds) — upstream issues #606 / #617, open. Users on the default theme or a theme without those variables are unaffected. UIX is a drop-in replacement (and parses theme YAML with `js-yaml` directly since 8.1.0, so it does not hang). |
| UIX 8.0.0 → 8.3.1 | 8.1.0 icon/entity-picture styling and per-entity overrides, 8.2.0 the UIX Broker, 8.3.0 Broker directives and lifecycle events, 8.3.1 Map spark fix for HA 2026.9. The styling contract is unchanged: `uix:` over `card_mod:` precedence, the `card_mod:` fallback, the config-flow abort on a `card-mod.js` resource. |
| UIX 8.4 (beta) will require HA ≥ 2026.10 | Its `hacs.json` minimum was bumped on `dev` (8.4.0-beta.7 shipped 2026-10-03); 8.4.0 final will not install through HACS on older HA. UIX 8.x currently requires HA ≥ 2026.8.0. |
| Visual-only shifts in HA 2026.9/2026.10 | `ha-card` header padding and line-height changed; entities rows render `secondary_info` through `state-display`. The `--ha-card-header-*` variables and the per-row selectors the Studio uses are still read. |

Full detail and sources: `docs/ROADMAP.md` ("Engine watch").

---

## 12. Older Home Assistant quick checks (2026-10-04)

Quick checks (not the full release suite) on four older HA versions, card-mod
only (UIX 8.x requires HA ≥ 2026.8), each in its own Docker rig
(`tools/sandbox` images pinned to the version):

| HA | card-mod | Scripted live checks¹ | Functional (real dialog) | Visual (light/dark × desktop/phone) | Verdict |
|---|---|---|---|---|---|
| 2026.6.4 | 4.2.1 | 30/30 | 397/397 | 20/20 clean | ✅ works |
| 2026.2.3 | 4.2.1 | 30/30 | 397/397 | 20/20 clean | ✅ works |
| 2025.9.4 | 3.4.5 | 30/30 | 392/397 — the 5 misses are Font on a tile's text (known gap, below) | VISUAL | 🟡 works, one gap |
| 2025.3.4 | 3.4.5 | 30/30² | — | — | ❌ Style button never appears |

¹ `compat_check`, `heading_check`, `dict_visual_check`, `state_props_check`.
² These mount the panel directly; in the real card editor the button has no
injection point (the footer has no `ha-button[slot=secondaryAction]`).

Found and fixed on the way (all versions benefit):

- **Colour pop-ups couldn't be clicked on 2026.2** — HA's MDC-style
  `ha-dialog` registers with the blocking-elements polyfill, which makes
  everything outside it `inert`; the pop-up portal now goes into the
  blocking element's shadow root (`blockingElementRoot()` in
  `cms-color-picker.ts`) with an offset correction for its containing block.
- **Escape** closed the whole editor (2026.9) or nothing (2025.9/2026.2) —
  now closes just the pop-up.
- **Gauge name** is `div.name` on 2026.2 and 2025.9 (`p.title` from 2026.6):
  Font now emits a `.name` block for gauges too (inert on current HA).

Known gap on 2025.9: `ha-tile-info` reads hard-coded
`var(--primary-text-color)` / `var(--ha-font-size-m)` — the
`--ha-tile-info-*` variables Font writes (present on 2026.2+) don't exist
yet, so Font doesn't reach a tile's name/state text there. Other tile
styling and Font on other cards work. The harness gained 2025.x fallbacks
for the Material `ha-slider` and the vaadin entity-picker overlay; HA
frontend errors unrelated to the Studio (`recovery_mode` of null) were
ignored. `hacs.json` minimum set to **2025.9.0**.


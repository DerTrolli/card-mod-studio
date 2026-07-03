# Card-Mod Studio — card-mod 4.x / HA 2026 Compatibility Audit

**Audit date:** 2026-06-25 (card-mod/HA) · 2026-07-03 (UIX addendum, §9)
**Audited version:** v0.4.0 (card-mod/HA) · v0.6.0 (UIX) · v0.6.1 (entities-row parser fix §10 item 5a, card_mod:/uix: dedup-on-edit §10 item 5b, same-selector-twice parse bug §10 item 5c)
**Reference targets:**
- card-mod **v4.2.1** (latest; released 2026-02-08). Major breaking release was
  **v4.0.0** (2026-11-18, requires HA 2025.11+).
- Home Assistant **2026.6** (latest stable, 2026-06-03).
- UIX **v7.6.1** ([Lint-Free-Technology/uix](https://github.com/Lint-Free-Technology/uix),
  latest as of the audit; see §9).

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

⚠️ **Three things to watch**, in priority order:
1. **`--mdc-icon-size`** (heading module) — MDC variables are deprecated in HA
   2026.4+. Still works in 2026.6 but will need migration.
2. **Dict / `$` shadow-pierce round-trip is lossy** — opening and saving a card
   that was hand-written in card-mod's dictionary form can corrupt those styles.
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
| Heading style | `.container { justify-content }`, `.title p { font-size; color }`, `.title ha-icon { --mdc-icon-size; color }` |
| Entity rows | `:host { --state-icon-color; color }` per row |

All of the above is wrapped as `card_mod: { style: "<string>" }` by
`yaml-generator.ts → applyCardModStyle`. **We never write the dictionary form.**

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

## 4. Dictionary / `$` shadow-pierce round-trip (⚠️ lossy)

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
| `--mdc-icon-size` | Heading module (`.title ha-icon`) | **Deprecated in HA 2026.4+** (MDC → "Web Awesome" migration). Works in 2026.6. | Track HA's replacement var; migrate the heading module when finalised. |
| `--paper-item-icon-active-color` | Accent color (generic cards) | Legacy "paper" variable; aging but still honoured. Harmless if ignored. | Low priority; keep for backward compat, plan to drop. |
| `--state-icon-color` | Accent color, entity rows | Current, supported. | None. |
| `--tile-color` | Accent color (tile cards) | Current (tile card var). | None. |
| `--gauge-color` | Accent color (gauge) | Current. | None. |
| `--state-climate-*`, `--control-circular-slider-color` | Accent color (thermostat) | Current climate control vars. | None. |

> `--paper-item-icon-color` is **not** emitted by the shipped generator. Note
> that `docs/BUG_FIX_PLAN.md` describes a sensor-specific
> `:host { --paper-item-icon-color }` path, but that path is **not present** in
> the current `iconColorBlock()` — icon color is emitted as
> `ha-state-icon { color }` for all card types (see §6). The bug-fix doc is a
> historical session log and has drifted from the code here.

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

---

## 8. Summary verdict

| Area | Status |
|---|---|
| String-form output on card-mod 4.x | ✅ Compatible |
| Jinja2 template surface | ✅ Compatible |
| Injection point (HA 2026.6) | ✅ Valid |
| `--mdc-icon-size` (heading) | ⚠️ Deprecated, works for now |
| Dict / `$`-pierce round-trip | ⚠️ Lossy on save |
| Per-card icon selector coverage | ⚠️ Heuristic gap |
| `--paper-item-icon-active-color` legacy | 🟡 Harmless, plan to drop |
| UIX support (v7.6.1, see §9) | ✅ Compatible, verified live |
| Reverse-compat warning: top-level card | ✅ Covered |
| Reverse-compat warning: entities-row level | ✅ Covered (v0.6.0) |
| Reverse-compat warning: dict-form / duplicate-entity-ID rows | ⚠️ Pre-existing gap, ROADMAP #23/#24 |

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
support:** `_initEntityRowStyles` only recognises **string-form** row styles;
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

1. **[High] Heading module — migrate off `--mdc-icon-size`** once HA publishes
   the Web Awesome icon-size replacement. Add a fallback chain in the interim.
2. **[High] Protect dictionary-form `card_mod`** from lossy string flattening
   (detect on open; preserve verbatim or go read-only).
3. **[Med] Per-card icon-color selectors** — verify which card types expose
   `ha-state-icon`; emit the correct selector/variable per type.
4. ✅ **[Med] Per-row entities uix-only warning** (§9) — **Done (v0.6.0)**.
   ROADMAP #19.
5. **[Med] Dict-form entities-row styles** (§9) — same fix as #2, at the row
   level. ROADMAP #23.
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
6. **[Med] Duplicate-entity-ID rows cross-contaminate styling** (§9) — needs a
   positional row key instead of entity-keyed. ROADMAP #24.
7. **[Low] Phase out `--paper-item-icon-active-color`** in the accent module.
8. **[Low] Pin/verify card-mod version** in docs (state "tested against card-mod
   4.2.x") and add it to the compatibility table in the README.
9. **[Housekeeping] Reconcile `docs/BUG_FIX_PLAN.md`** with the shipped
   `iconColorBlock()` (the sensor `--paper-item-icon-color` path is not in code).

# Card × Setting Support Matrix (empirical)

**Generated:** 2026-06-25 · **Against:** Home Assistant 2026.x + card-mod 4.2.1
**Method:** real cards rendered in a real HA instance, each `card_mod` setting
applied by real card-mod, verdict = did the target element's **computed style**
actually change vs baseline. Reproduce with [`tools/sandbox`](../tools/sandbox/README.md).

> ⚠️ **Methodology caveat — standalone mount vs real dashboard.** The bulk of
> this matrix mounts each card standalone via `document.createElement('hui-card')`,
> which is fast but can diverge from a real dashboard: the `button` card *errors*
> standalone yet renders fine in a view. **Treat standalone results as a lead, not
> a verdict.** Decisions that changed code were re-verified in a real
> `sections`/`grid` dashboard (`tools/sandbox/harness/dash_verify.mjs`); those are
> marked ✔︎ verified below. Single-property measurements can also mislead — see
> the accent-color correction.

This complements (not blindly supersedes) `CARD_TYPE_PLAN.md`; where they disagree
and the cell was dashboard-verified, trust this doc.

> **UIX note (v0.6.0):** this matrix was measured against card-mod, but the CSS
> the Studio generates is identical either way — UIX applies the same
> `ha-card`/`ha-state-icon` targets the same way card-mod does. These results
> hold for UIX installs too. See [COMPATIBILITY_AUDIT.md §9](COMPATIBILITY_AUDIT.md)
> and `tools/sandbox/run-uix.sh` for UIX-specific verification (detection,
> precedence, fallback).

---

## Matrix

| card | icon_color | accent_color | background | border_radius | border | filter |
|---|---|---|---|---|---|---|
| tile | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| entity | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| glance | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| sensor | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| gauge | — | — | ✅ | ✅ | ✅ | ✅ |
| light | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| thermostat | — | — | ✅ | ✅ | ✅ | ✅ |
| humidifier | — | — | ✅ | ✅ | ✅ | ✅ |
| alarm-panel | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| media-control | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| weather-forecast | — | — | ✅ | ✅ | ✅ | ✅ |
| history-graph | — | — | ✅ | ✅ | ✅ | ✅ |
| markdown | — | — | ✅ | ✅ | ✅ | ✅ |
| heading | — | — | ❌ | ✅ | ❌ | ✅ |
| entities | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| button | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |

**Legend:** ✅ measurably changed · ❌ applied but no effect · — no such element to measure.

### What each column applies (the CSS the tool emits)

| setting | CSS | measured on |
|---|---|---|
| `icon_color` | `ha-state-icon { color: … !important }` | `ha-state-icon` `color` |
| `accent_color` | `ha-card { --accent-color/--tile-color/--gauge-color/--state-icon-color/--paper-item-icon-active-color: … }` (no `!important`) | `ha-state-icon` `color` |
| `background` | `ha-card { background: … }` | `ha-card` `background-color` |
| `border_radius` | `ha-card { border-radius: … }` | `ha-card` `border-top-left-radius` |
| `border` | `ha-card { border: …px solid … }` | `ha-card` `border-top-width` |
| `filter` | `ha-card { filter: grayscale(100%) }` | `ha-card` `filter` |

**Caveats:** the `icon_color` and `accent_color` columns are measured **only on the
icon** (`ha-state-icon` `color`). So `—` means "no icon element," and the
`accent_color` column answers *only* "does accent recolor the icon" — **not**
"does accent do anything." That distinction broke finding #1 below.

---

## Findings & recommended changes

### 1. ~~Accent color is broadly broken~~ — RETRACTED (the column was measuring the wrong thing)
The `accent_color` column shows ❌ for many cards, but that only means **accent
doesn't recolor the icon** — which is mostly *not what accent is for*. On a
`sensor` card the accent colours the **graph line**; on a `tile` it themes the
`--tile-color`. Verified against a real production dashboard: accent-coloured
sensor graphs render correctly with the current (no-`!important`) output.

An earlier attempt to "fix" this by stamping `!important` on the accent vars was
**reverted** because it is net-harmful: it only changes the icon on `tile`, does
nothing for entity/light/alarm/media (their icons live in a nested `state-badge`
shadow root card-mod can't reach), and it would **break the common dynamic-accent
pattern** — a static `--accent-color: X !important` block would override a later
threshold-driven `--accent-color: {{ … }}` block that has no `!important`.
→ **No generator change.** If static accent on tiles is ever wanted, it must also
make the threshold accent block `!important` so the dynamic value still wins.

### 2. `heading` doesn't honor background or border ✔︎ verified (real dashboard)
A heading card's `ha-card` has no painted box: background stays `rgba(0,0,0,0)` and
`border-top-width` stays `0px` when styled (`dash_verify.mjs`). The panel used to
show Background (and Border) for headings — dead controls.
→ **Done:** `heading` added to `NO_BACKGROUND_TYPES` and a new `NO_BORDER_TYPES`.
Heading styling stays available via the dedicated Heading Style module.

### 3. `glance` icon color doesn't work ✔︎ verified (real dashboard)
Glance renders its icon inside a nested `<state-badge>` shadow root, coloured
inline from state; six candidate selectors (`ha-state-icon`, `state-badge`,
`.entity`, `--state-icon-color`, `--paper-item-icon-color`, `--mdc-icon-color`) all
left it unchanged, and so did a real-dashboard re-test.
→ **Done:** `glance` added to `NO_ICON_COLOR_TYPES`. (A future option: emit
card-mod's nested shadow-piercing syntax for glance.)

### 4. `alarm-panel` and `media-control` icon color *do* work, but were hidden ✔︎ verified
Both went white→red in a real dashboard, yet both were in `NO_ICON_COLOR_TYPES`.
→ **Done:** removed both from `NO_ICON_COLOR_TYPES` (plain mode is used for the
non-state `media-control`).

### 5. `entities` card-level icon color = ❌ (confirms design)
Card-level `ha-state-icon { color }` doesn't reach entity rows — which is exactly
why the tool styles entities **per-row**. No change; validation of the approach.

### 6. ha-card-level styling is the reliable foundation
`background` / `border_radius` / `border` / `filter` work on essentially every
card (heading excepted, per #2). These are safe defaults across card types.

---

## What changed in the tool from these findings

Only **panel module visibility** changed (which controls are shown per card type);
**no generated CSS changed**, so existing dashboards are unaffected:
- `heading`: Background + Border modules hidden (Heading Style remains).
- `glance`: Icon Color hidden.
- `alarm-panel`, `media-control`: Icon Color now shown.

## Notes for re-running

- 15 card types mount cleanly standalone and are measured programmatically; the
  `button` card needs a real dashboard (`button_matrix.mjs`). Use `dash_verify.mjs`
  to re-confirm any contested cell in a real `sections`/`grid` view.
- To extend: measure accent on the **graph line / gauge arc / thermostat ring**
  (not the icon), and add `threshold` / `animation` / `heading-style` settings.

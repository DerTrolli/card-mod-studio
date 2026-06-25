# Card-Mod Studio — Roadmap

**Last updated:** 2026-06-25 · **Current version:** v0.5.0

Phases 1–7 are complete (scaffold → parser → visual modules → config
integration → card-type awareness → 2-column layout + presets → entities per-row
styling → HACS prep). This document is the forward-looking plan. It supersedes
the scattered "Future" sections in `CARD_TYPE_PLAN.md` and `BUG_FIX_PLAN.md`.

Priorities reflect both user value and the findings in
[COMPATIBILITY_AUDIT.md](COMPATIBILITY_AUDIT.md).

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
| 4 | **Reconcile docs with code** | `BUG_FIX_PLAN.md` describes a sensor `--paper-item-icon-color` path that isn't in the shipped generator. Update or retire the stale section. | S |
| 5 | **Pin card-mod version in README** | State "tested against card-mod 4.2.x / HA 2026.6" in the compatibility table so users know the support baseline. | S |
| 6 | **Phase out `--paper-item-icon-active-color`** in the accent module | Legacy paper var (audit §5). Low risk, low urgency. | S |

---

## Next — high-value features (target: v0.5)

| # | Item | Description | Effort |
|---|---|---|---|
| 7 | **Container child-card editing** | The long-standing gap (`CARD_TYPE_PLAN.md` Phase 7; `BUG_FIX_PLAN.md` #10–12). When editing a child inside a grid/stack/sections card, HA's dialog only exposes the top-level `_cardConfig`, so styles target the wrong card. Investigate: (a) DOM-hierarchy detection of the parent container, (b) searching `hass.lovelace.config` for the card's path, (c) attaching when HA opens a nested child editor. Start with the detection + an accurate "editing child of `<type>`" banner. | L |
| 8 | **Modern card coverage: `sections` / `heading` / `area`** | **Verified (v0.5.0):** heading module selectors (`.title p`, `.title ha-icon`, `.container`) still match current HA, and `sections` views work in production. **Remaining:** the `area` card and styling hooks for section **heading badges**. | M |
| 9 | **Tile card feature styling** | The tile card gained features (trend graph, bar gauge, media/fan/valve controls, inline vs bottom position, `state_content`). Sandbox confirms features render in `hui-card-features` — **recommended next build**: targeted controls/selectors for feature rows rather than Advanced CSS. | M |
| 10 | **Custom-card support: Mushroom & Bubble** | Most-requested. Detect the custom card type and offer the correct shadow-DOM selectors (these need `$`-pierce, so depends on #1 landing first). | L |

---

## Later — polish & reach

| # | Item | Description | Effort |
|---|---|---|---|
| 11 | **Smooth/gradient thresholds** | Interpolate color between threshold stops instead of hard steps. | M |
| 12 | **Import / export styles** | Copy a card's full style config to clipboard / paste onto another card (complements presets). | S |
| 13 | **Preset management UX** | Rename, reorder, duplicate, and export presets; today it's load/save/delete only. | S |
| 14 ✅ | **Mobile-friendly panel** | **Done (v0.5.0)** — a ResizeObserver stacks the preview below the controls below ~600px instead of starving them. | M |
| 15 | **Animation builder** | Visual keyframe editor beyond the 5 presets. | L |
| 16 | **More threshold sources** | Allow thresholds on an entity **attribute** (e.g. `battery_level`) and on `state_attr(...)`, not just the state value. | M |

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

Carried over from `CARD_TYPE_PLAN.md` — not worth supporting:

- `iframe` / `webpage`, `map` — cross-origin / Leaflet; only border/radius apply.
- Deep `energy-*` SVG styling — Advanced CSS only.
- Arbitrary Jinja2 logic in the visual UI — the Advanced CSS editor is the
  intended escape hatch for anything beyond on/off and numeric thresholds.

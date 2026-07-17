The road to v1.0 — what's coming, in what order, and what's deliberately
out of scope. Source of truth:
[docs/ROADMAP.md](https://github.com/DerTrolli/card-mod-studio/blob/main/docs/ROADMAP.md)
(this page is the user-facing summary; effort estimates, not dates).

## The v1.0 goal

Not "every card-mod/UIX feature" — the goal is that Card-Mod Studio is a
confident, professional default for styling HA's built-in cards without
touching CSS or Jinja2 by hand: state-driven styling off any entity or
attribute, a real color system, and correct editing inside nested layouts.

## v0.8 ✅ (current) — structure + color system

Stack child styling, the Font module with per-card support, the Color
Palette Manager, attribute-based thresholds, per-row fonts. See the
[changelog](https://github.com/DerTrolli/card-mod-studio/blob/main/CHANGELOG.md).

## v0.9 — depth

- **Property-level templating beyond color** — border width, icon size,
  blur/opacity driven by entity state, the natural extension of the
  threshold engine.
- **Dictionary-form (`$` shadow-piercing) style support** — the single
  biggest unlock. It's what makes the current "unreachable" list reachable:
  - glance icons ([why they're blocked today](Glance-Card#why-no-icon-color))
  - the thermostat's big-number **size** and the gauge value **size**
  - proper Mushroom/Bubble custom-card selectors
  It also closes the round-trip gap where hand-written dict-form styles are
  preserved but not editable.

## v1.0 — structural completeness

- `conditional` cards and containers nested inside containers
  ([current status](Container-Cards#not-covered-yet))
- Tile **feature-row** styling (trend graph, bar gauge, controls) with
  dedicated controls
- Preset management UX (rename/duplicate/reorder) and style
  **import/export** (copy a card's style to the clipboard, paste elsewhere)

## Post-1.0 stretch

- Official Mushroom / Bubble card support
- A multi-entity AND/OR condition builder
- A visual keyframe animation builder (beyond the 5 presets)
- Bulk dashboard `card_mod:` → `uix:` key migration (parked deliberately:
  since `card_mod:` keeps working under UIX, nothing *needs* migrating —
  and a whole-dashboard rewrite tool needs its own dry-run design first)

## Explicitly out of scope

- Restyling **iframe/webpage/map** content ([why](Minimal-Support-Cards))
- Deep `energy-*` SVG internals — Advanced CSS only
- Arbitrary Jinja2 logic in the visual UI — Advanced CSS is the escape hatch
- **A UIX Forge clone** — Forge is UIX's own first-party template builder;
  rebuilding it here would be a worse copy of a tool that already exists.
  A UIX-only user wanting Forge-level power should use Forge.

*A roadmap is a plan, not a promise — items shift as real-world reports come
in (several v0.7/v0.8 features started as user requests).*

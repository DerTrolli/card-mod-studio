The road to v1.0 — what's coming, in what order, and what's deliberately
out of scope. Source of truth:
[docs/ROADMAP.md](https://github.com/DerTrolli/card-mod-studio/blob/main/docs/ROADMAP.md)
(this page is the user-facing summary; effort estimates, not dates).

## The v1.0 goal

Not "every card-mod/UIX feature" — the goal is that Card-Mod Studio is a
confident, professional default for styling HA's built-in cards without
touching CSS or Jinja2 by hand: state-driven styling off any entity or
attribute, a real color system, and correct editing inside nested layouts.

## v0.8 ✅ — structure + color system

Stack child styling, the Font module with per-card support, the Color
Palette Manager, attribute-based thresholds, per-row fonts. See the
[changelog](https://github.com/DerTrolli/card-mod-studio/blob/main/CHANGELOG.md).

## v0.9 ✅ — discoverability + state-aware depth

The click-to-edit preview picker, more animation presets, value-conditional
animations, and "Reacts to" conditions beyond color (border width, filter
effects, icon size).

## v0.10 ✅ (current) — piercing + polish

- **Dictionary-form (`$` shadow-piercing) styles are editable.** The `.` entry
  runs through the normal controls; every other entry is preserved
  byte-for-byte and shown read-only in Advanced CSS — for cards, stack
  children and entities rows. Only mixed-form styling stays frozen (behind a
  lock banner). See
  [Advanced CSS](Advanced-CSS#dictionary-form-styles-shadow-piercing).
- **Heading Style works on HA 2026.10** and now also styles Subtitle headings
  ([Heading card](Heading-Card)).
- A 20-bug audit of how hand-written CSS survives an edit, a light/dark/phone
  overhaul of the editor, and keyboard access to every collapsible section.

## v0.11 — Font size unlocks

- **Gauge value number and thermostat big number size** in the Font module,
  built on the dictionary-form machinery from v0.10 (both are reachable with
  shadow-piercing styles). They need a new generated-dictionary path in the
  save logic — which deserves its own beta round — and the gauge's SVG text
  also needs a scale-based control design. See the
  [Gauge](Gauge-Card) and [Thermostat](Thermostat-and-Humidifier-Cards)
  pages.
- Glance icon color stays out: even shadow-piercing styles don't reach it
  ([why](Glance-Card#why-no-icon-color)).

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
- A visual keyframe animation builder (beyond the built-in presets)
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

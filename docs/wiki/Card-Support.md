The at-a-glance overview of which modules appear on which card types, and
the honest list of what can't be styled. The panel only ever shows controls
that can actually do something on the current card — a hidden module here
isn't a bug.

**For depth, every card has its own guide** — see the *Per-card guides*
section in the sidebar (Tile, Gauge, Thermostat, Light, Button,
Sensor/Entity, Entities, Glance, Heading, Markdown, Graphs & Data, Picture,
Media & Alarm, Containers, iframe/map) — each lists all available options
on that card, its quirks, and its limits.

Everything below is **measured against real rendered cards** (the project
maintains a Docker + Playwright rig that renders each card with real
card-mod/UIX and checks computed styles), not guessed from source. Details:
[CARD_SUPPORT_MATRIX.md](https://github.com/DerTrolli/card-mod-studio/blob/main/docs/CARD_SUPPORT_MATRIX.md).

## The reliable foundation

**Background, Border & Radius, Visual Filters, Font, Animation, Threshold,
Advanced CSS** work on essentially every card that paints a card box.
Exceptions and specials:

| Card type | Specifics |
|---|---|
| heading | Uses the dedicated **Heading Style** module (text/icon/alignment, Title and Subtitle styles, HA 2026.9 and 2026.10); Background/Border/Font hidden — a heading paints no card box |
| entities | Card-level Icon/Accent/Threshold hidden — use [per-row styling](Entities-Card-Per-Row-Styling); Font styles rows + title |
| vertical-stack / horizontal-stack / grid | Per-child styling sections — see [Cards Inside Stacks](Styling-Cards-Inside-Stacks) |
| glance | Icon Color hidden: the icon lives in a nested shadow root, colored inline from state — no reachable selector (measured) |
| gauge / thermostat / humidifier / weather / graphs | Icon Color hidden (no `ha-state-icon` to color); Accent works on the meaningful target (gauge dial, etc.) |
| light | Icon Color gains "Match the light's color" mode |
| alarm-panel / media-control | Icon Color available (verified working) |
| iframe / webpage / map | Only border/radius/filter apply (cross-origin / map-library content) |

## Known limitations (v0.10.0)

- **Gauge value number: size** can't change from the Font module yet (HA
  auto-scales the SVG to fill the dial). Color works. A size control is
  planned for v0.11.
- **Thermostat big temperature: size** can't change from the Font module yet
  (two shadow roots deep, no variable). Weight and color work. A size control
  is planned for v0.11.
- **Glance icons** can't be recolored (nested shadow root + inline state
  color — probed with shadow-piercing styles on both engines too: they don't
  reach it either). A documented limitation, not planned.
- **Custom cards** (Mushroom, Bubble, …) have their own shadow-DOM layouts —
  card-box-level modules generally work; icon/text specifics may need
  [Advanced CSS](Advanced-CSS). Dedicated support is on the
  [roadmap](https://github.com/DerTrolli/card-mod-studio/blob/main/docs/ROADMAP.md).
- **Nested containers / `conditional` cards** — see
  [Cards Inside Stacks](Styling-Cards-Inside-Stacks#not-covered-yet).
- **Deep energy-card SVG styling** — Advanced CSS only.

Most of the "can't reach it" entries share one root cause: the target lives
in a nested shadow root that string-form card-mod/UIX styles can't pierce.
Dictionary-form (`$`) styles can — v0.10.0 made hand-written ones fully
editable and preserved, and the two size controls above are the first
planned use of them for *generated* styles (v0.11). Glance is the exception:
even pierced styles don't reach it.

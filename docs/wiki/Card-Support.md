The at-a-glance overview of which modules appear on which card types, and
the honest list of what can't be styled. The panel only ever shows controls
that can actually do something on the current card — a hidden module here
isn't a bug.

**For depth, every card has its own guide** — see the *Per-card guides*
section in the sidebar (Tile, Gauge, Thermostat, Light, Button,
Sensor/Entity, Entities, Glance, Heading, Markdown, Graphs & Data, Picture,
Media & Alarm, Containers, iframe/map, and — new in 0.11 (beta) —
[Mushroom](Mushroom-Cards) and [Bubble Card](Bubble-Card)) — each lists all available options
on that card, its quirks, and its limits.

Everything below is **measured against real rendered cards**, not guessed
from source: for v0.10.0 every module was switched on, one at a time, on
every built-in card type with card-mod and with UIX, and the rendered card
was compared pixel-by-pixel — a control that changed nothing visible was
hidden (`tools/sandbox/harness/module_effect_audit.mjs`). For v0.11.0-beta.2 the audit was re-run on HA 2026.11.0 (card-mod 4.2.1 and
UIX 9.0.0) over the built-in cards, all 18 Mushroom card types and the four
Bubble kinds: no control is shown that changes nothing. Where a later beta
offers a module on more cards (Animation, card-level Threshold on entities,
Icon Color on statistic) or hides one, the table above is current. For v0.11.0-beta.3 the audit was re-run on HA 2026.11.0: with card-mod, built-in cards 0 controls without effect (1 inconclusive: Threshold "Text Color" on the gauge, whose needle animation hides small pixel changes) and all 18 Mushroom types and 4 Bubble kinds 0; with UIX, Mushroom and Bubble Card 0 and the built-in cards 1 (Threshold "Accent Color" on the history graph, see [Graphs & Data](Graph-and-Data-Cards)). Details:
[CARD_SUPPORT_MATRIX.md](https://github.com/DerTrolli/card-mod-studio/blob/main/docs/CARD_SUPPORT_MATRIX.md).

## The reliable foundation

**Background, Border & Radius, Visual Filters, Font, Animation, Threshold,
Advanced CSS** work on essentially every card that paints a card box.
Exceptions and specials:

| Card type | Specifics |
|---|---|
| heading | Uses the dedicated **Heading Style** module (text/icon/alignment, Title and Subtitle styles, HA 2026.9 and 2026.10); Background/Border/Font/Threshold hidden — a heading paints no card box, and its title has its own color variable |
| entities | Card-level Icon/Accent hidden — use [per-row styling](Entities-Card-Per-Row-Styling); card-level Threshold offers Background, Text Color and Border Color only (v0.11.0-beta.3); Font styles rows + title |
| vertical-stack / horizontal-stack / grid | Per-child styling sections — see [Cards Inside Stacks](Styling-Cards-Inside-Stacks) |
| glance | Icon Color hidden: the icon lives in a nested shadow root, colored inline from state — no reachable selector (measured) |
| gauge / thermostat / humidifier / weather / graphs | Icon Color hidden (no `ha-state-icon` to color); Accent works on the meaningful target where there is one (gauge dial, thermostat slider, history-graph lines, statistic card) and is hidden on humidifier, weather and statistics-graph (see below) |
| statistic | Icon Color (colour and a size of 12–64px) works on its one icon, as well as Accent (v0.11.0-beta.3) |
| Animation | Offered on every built-in card except heading, the energy cards, activity, webpage and shopping-list. Presets that cannot work are left out per card: **Spin** on thermostat, humidifier, light and map; **Gradient Shift** wherever Background is hidden (picture, picture-entity, picture-glance, picture-elements, iframe, map, media-control) and on Bubble Card and the Mushroom title card (v0.11.0-beta.3) |
| Icon size limit | The Icon size slider stops where the card still fits the icon: tile 36px, picture-glance 40px, Mushroom 56px, Bubble Card 50px (56px in the large layout; separator 40/33px), everything else 64px |
| Accent Color | Hidden wherever nothing on the card reads the accent colour: button, light, glance, markdown, humidifier, alarm-panel, area, picture cards, map, iframe, todo-list, logbook, statistics-graph, weather-forecast, date and alert (the last two new in HA 2026.11) |
| Font text color | Hidden where the card colours its own text (media-control, area, picture-entity, picture-glance, picture-elements, date, alert) — size/weight/family still offered. On chart cards it colours the title (graph labels are drawn by the chart). On alarm-panel the title takes it, but Threshold's Text Color target is hidden there |
| Font text size | Hidden where the card sizes its own text: area, humidifier, picture-entity, picture-glance, weather-forecast, date and alert (weight, family and colour stay where they work) |
| Font weight | Hidden on area, date and alert (it changed nothing there). On calendar, logbook, alarm-panel and other header-title cards it reaches the title and also other text drawn with Home Assistant's normal weight — see [Font & Text](Font-and-Text) |
| Threshold Colors | Its "Apply to" list only offers the colours the matching module offers on that card |
| area | Icon Color hidden (the area icon doesn't take it); everything card-box-level works |
| date (new in HA 2026.11) | Icon Color, Accent Color, Font size and Font text color hidden (and their Threshold targets) — measured on HA 2026.11.0; Font weight/family, Background, Border, Filters and Animation work |
| alert (new in HA 2026.11) | Accent Color and Font text color are hidden, and so are Threshold's Accent and Text color targets — measured on HA 2026.11.0; the rest works |
| entity-filter | Treated as a container: a style on the filter reaches nothing — Advanced CSS only; style its inner `card:` in YAML |
| Mushroom (5.2.3, beta — [guide](Mushroom-Cards)) | The 14 state cards: Font → primary/secondary text, icon size, Accent → the card's active colour (hidden when the card sets its own `icon_color`; Icon Color, Accent and Font are also hidden where the card's options such as `icon_type: none` remove their target), Threshold, Background, Border. Template card is styled like a tile. Chips: chip text/icon size, chip background and border (no Accent, no text colour). Title card: title text only (no Background/Border/Icon/Accent). Empty card: nothing to style. |
| Bubble Card (3.x, measured on 3.4.3, beta — [guide](Bubble-Card)) | button (incl. slider button), separator, cover: Font → name/state, icon colour and size, Background and Border on the card's visible box. Threshold is hidden, and so is Accent except on slider buttons, where Accent colours the slider fill. Icon Color/Icon size are hidden with `show_icon: false`, Font when neither name nor state line is shown. The card's own `styles:` is preserved untouched. Other Bubble card types keep all modules for now |
| light | Icon Color gains "Match the light's color" mode |
| alarm-panel / media-control | Icon Color available (verified working) |
| media-control | **Background is hidden** (and Threshold's Background target and Gradient Shift): the card paints its own colour block over its whole face in every player state; Border & Radius work. A stored Background is kept |
| iframe / webpage / map | Only border/radius/filter apply (cross-origin / map-library content) |

## Known limitations (v0.11)

- **Glance icons** can't be recolored (nested shadow root + inline state
  color — probed with shadow-piercing styles on both engines too: they don't
  reach it either). A documented limitation, not planned.
- **Custom cards** — Mushroom and Bubble Card (button, separator, cover) are
  supported in beta (see the table above); any other custom card still shows
  every module and has its own shadow-DOM layout, so card-box-level modules
  generally work while icon/text specifics may need
  [Advanced CSS](Advanced-CSS). The panel shows a notice on such a card
  (v0.11.0-beta.3): "Card-Mod Studio doesn't know this custom card yet — some
  controls may not reach it; Advanced CSS always works." Per-card guides:
  [Mushroom](Mushroom-Cards) and [Bubble Card](Bubble-Card).
- **ON / OFF conditions** are offered only when the card has an entity of its
  own and that entity can be on or off; see
  [Icon Color & Accent Color](Icon-Color-and-Accent-Color).
- **Nested containers / `conditional` cards** — see
  [Cards Inside Stacks](Styling-Cards-Inside-Stacks#not-covered-yet).
- **Deep energy-card SVG styling** — Advanced CSS only.

Most of the "can't reach it" entries share one root cause: the target lives
in a nested shadow root that string-form card-mod/UIX styles can't pierce.
Dictionary-form (`$`) styles can — v0.10.0 made hand-written ones fully
editable and preserved, and v0.11's Number size controls (gauge value,
thermostat temperature) are the first *generated* ones. Glance is the
exception: even pierced styles don't reach it.

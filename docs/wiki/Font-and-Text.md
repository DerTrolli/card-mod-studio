## The Font module

Text **size** (slider), **weight** (Normal / Medium / Bold), **family**
(Theme default / Sans-serif / Serif / Monospace / Custom… free text), and
**color** — for almost any card, not just headings. A freshly enabled text
color starts from your theme's own text color (`var(--primary-text-color)`),
so turning the module on doesn't turn the text near-white on a light theme.

![Font module](https://raw.githubusercontent.com/DerTrolli/card-mod-studio/main/images/09%20Font%20and%20Palette.png)

### Per-card behavior

Many HA cards override fonts internally, so a plain `font-size` on the card
would silently do nothing. The module emits the card-specific companion
selectors/variables each card actually needs — you don't have to know any of
this, it just works:

| Card | What follows the Font module |
|---|---|
| entities / markdown / glance rows | Everything (plain inheritance) |
| entities, glance, calendar, todo-list, logbook, history/statistics-graph, picture-glance | …plus the **card title** (at 1.5× your chosen size — the header's native ratio) |
| light | Name/state text and the brightness % |
| button | The label |
| sensor / entity | Name, unit, **and the big value** (value at 1.75× your size — its native ratio) |
| tile | Name and state text (via the tile's own font variables — HA 2026.2+; on HA 2025.9 these variables don't exist yet, so the tile text keeps its size/colour) |
| gauge | The title (also on older HA, where it's a different element); the value number follows **color** (size: see limits) |
| thermostat | The title and mode label; the big number follows **weight/color** (size: see limits) |

### Known limits (for now)

- **Gauge value number — size can't change from this module yet.** It's SVG
  text that HA auto-scales to fill the dial. Color works.
- **Thermostat big temperature — size can't change from this module yet.**
  It sits two shadow roots deep with no variable to reach it. Weight and
  color work.

Both are reachable with card-mod/UIX dictionary-form (`$` shadow-piercing)
styles — you can write one by hand in the card's YAML editor and the Studio
will [preserve it](Advanced-CSS#dictionary-form-styles-shadow-piercing) — but
the Font module can't generate them yet. Size controls for both are
**planned for v0.11** (they need a new generated-dictionary path in the save
logic, and the gauge's SVG text needs a scale-based control design). See
[What's Planned](Whats-Planned).

### Not offered on

`heading` (it has the dedicated module below), `iframe`/`webpage`/`map`
(no HA-templated text to style), and plain `picture` cards (no text).

**Text color** is hidden (size/weight/family stay) where the card colours
its own text and a colour set here would never show: alarm-panel,
media-control, area, picture-entity, picture-glance and picture-elements.

## The Heading Style module

`heading` cards get their own module with the same text controls (size,
weight, family incl. Custom…, color) **plus** icon size, icon color, and
text alignment (left/center/right).

It works on both **Title** and **Subtitle** heading styles (v0.10.0 — the
module never reached Subtitle headings before), and on Home Assistant
2026.10's new heading markup. Details, and what happens to headings you
styled with an older version, are on the [Heading card](Heading-Card) page.

## Per-row fonts

On entities cards, each row can override text size and weight individually,
layered on top of the card-level Font module — see
[Entities Card Per-Row Styling](Entities-Card-Per-Row-Styling).

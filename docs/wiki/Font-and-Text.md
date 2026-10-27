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
| gauge | The title (also on older HA, where it's a different element); the value number follows **color**, and **Number size** sizes it (below) |
| thermostat | The title and mode label; the big number follows **weight/color**, and **Temperature size** sizes it (below) |

### Number size — gauge value and thermostat temperature (v0.11)

On gauge and thermostat cards the module has one more row with its own
switch — it works with or without the rest of the Font module:

- **Gauge → Number size**, 50–150 %: scales the box HA fits the value into
  (HA fits the number into that box, so a plain font size wouldn't show).
  It stops growing where the dial leaves no room.
- **Thermostat → Temperature size**, 24–96px (HA's default is 57px).

Both numbers sit inside nested shadow roots, so the Studio writes them as a
dictionary-form (`$` shadow-piercing) entry and keeps it editable. If the
card already has your own hand-written CSS for that number, the row shows as
locked and your CSS is [preserved](Advanced-CSS#dictionary-form-styles-shadow-piercing)
unchanged.

### Not offered on

`heading` (it has the dedicated module below), `iframe`/`webpage`/`map`
(no HA-templated text to style), and plain `picture` cards (no text).

**Text color** is hidden (size/weight/family stay) where the card colours
its own text and a colour set here would never show: alarm-panel,
media-control, area, picture-entity, picture-glance and picture-elements.
**Text size** is hidden where the card sizes its own text: alarm-panel,
area, humidifier, picture-entity, picture-glance and weather-forecast
(measured with the module-effect audit on HA 2026.6 and 2026.10).

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

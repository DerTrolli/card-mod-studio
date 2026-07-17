## The Font module

Text **size** (slider), **weight** (Normal / Medium / Bold), **family**
(Theme default / Sans-serif / Serif / Monospace / Custom… free text), and
**color** — for almost any card, not just headings.

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
| tile | Name and state text (via the tile's own font variables) |
| gauge | The title; the value number follows **color** (see limits) |
| thermostat | The title and mode label; the big number follows **weight/color** (see limits) |

### Known limits (HA hard-codes these out of reach)

- **Gauge value number — size can't change.** It's SVG text that HA
  auto-scales to always fill the same fraction of the dial. Color works.
- **Thermostat big temperature — size can't change.** Hard-coded two shadow
  roots deep with no variable or selector to reach it. Weight and color work.

These need card-mod's dictionary-form shadow-piercing styles, which the
Studio doesn't generate yet (planned — see the
[roadmap](https://github.com/DerTrolli/card-mod-studio/blob/main/docs/ROADMAP.md)).

### Not offered on

`heading` (it has the dedicated module below), and `iframe`/`webpage`/`map`
(no HA-templated text to style).

## The Heading Style module

`heading` cards get their own module with the same text controls (size,
weight, family incl. Custom…, color) **plus** icon size, icon color, and
text alignment (left/center/right).

## Per-row fonts

On entities cards, each row can override text size and weight individually,
layered on top of the card-level Font module — see
[Entities Card Per-Row Styling](Entities-Card-Per-Row-Styling).

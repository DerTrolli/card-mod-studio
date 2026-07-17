`type: entities` cards get an **Entity Rows** section — one collapsible
styling section per row, because card-level icon/text styling can't reach
into individual rows (each row is its own shadow-DOM element).

![Per-row styling](https://raw.githubusercontent.com/DerTrolli/card-mod-studio/main/images/06%20Entities%20Card%20Modifications.png)

## Per row, you can style

- **Icon color** — *Static* (a fixed color) or *Threshold* (the same
  first-match-wins rule builder as the card-level
  [Threshold Colors](Threshold-Colors), evaluated against this row's entity)
- **Text / state color** — Static or Threshold, same way
- **Font (this row)** — a text size + weight override, layered on top of the
  card-level [Font module](Font-and-Text)

A dot on the row header marks rows that carry styling.

## Row forms — both work

```yaml
entities:
  - sensor.temperature          # bare-string shorthand
  - entity: sensor.humidity     # object form
    name: Humidity
```

Bare-string rows are styleable too (since v0.8.0); they're converted to the
object form automatically the moment they gain styling, because only the
object form can carry a style block. Unstyled string rows are left untouched.

## The generated YAML

Row styles are written into each row's own `card_mod:`/`uix:` block:

```yaml
entities:
  - entity: sensor.temperature
    card_mod:
      style: |
        :host {
          --state-icon-color: {{ '#ff0000' if states('sensor.temperature') | float(0) >= 25 else '#2196f3' }};
          font-size: 18px;
        }
```

## Also available inside stacks

An entities card nested in a vertical/horizontal stack or grid gets the same
Entity Rows section inside its child styling section — see
[Styling Cards Inside Stacks](Styling-Cards-Inside-Stacks).

## Current limitations

- Two rows referencing the **same entity ID** share one style slot.
- Hand-written **dictionary-form** row styles (card-mod's `$`-piercing
  syntax) aren't parsed back into the controls; they're preserved untouched
  on save, just not editable visually.

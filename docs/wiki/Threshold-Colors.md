The most powerful module: colors driven by a **live numeric value**, with no
YAML or Jinja2 to write.

![Fade mode](https://raw.githubusercontent.com/DerTrolli/card-mod-studio/main/images/07%20Threshold%20Fade.png)

## The value source

- **Entity** — any entity, not just the card's own.
- **Value read from** — the entity's *state* by default, or any of its
  **numeric attributes** (e.g. `battery_level`, `current_temperature`,
  `brightness`). The dropdown lists the attributes that currently hold a
  numeric value.

## Apply to — one rule set, several properties

Tick any combination of target properties; they all follow the same rules:

| Property | What it colors |
|---|---|
| Icon Color | The card's main icon |
| Accent Color | The card's accent (tile tint, gauge dial/needle, graph line) |
| Background | The whole card background |
| Text Color | The card's text |
| Border Color | A card border (width slider appears when selected) |

While Threshold drives a property, the corresponding static module for that
property steps aside automatically — no fighting declarations.

## Step mode (rules)

Each rule is `operator + value → color` (operators: `<` `<=` `>` `>=` `==` `!=`),
plus a **default color** when nothing matches. Rules are evaluated
**first-match-wins** and sorted automatically — enter them in any order; the
**Result legend** at the bottom shows exactly what will happen at every value.

Example — a temperature icon: blue `< 18`, red `>= 25`, default green.

## Fade mode (gradient)

Instead of discrete steps, define **value → color points**; the color blends
smoothly between them and clamps at the ends. A live gradient bar previews
the whole range. Points can be reordered with the ▲/▼ buttons (they swap
colors between value slots).

Under the hood, Fade is approximated as a dense chain of ~32 step rules —
invisible at normal update rates — but **your actual points are what you get
back** when you reopen the editor, not the generated rules.

## Generated YAML

Standard card-mod/UIX Jinja2, e.g.:

```yaml
card_mod:
  style: |
    ha-state-icon {
      color: {{ '#ff0000' if states('sensor.temp') | float(0) >= 25 else '#2196f3' }} !important;
    }
```

Attribute mode uses `state_attr('entity', 'attribute')` instead of
`states(...)`. Both engines render this natively.

## Per-row thresholds

Entities cards support the same rule builder **per entity row** — see
[Entities Card Per-Row Styling](Entities-Card-Per-Row-Styling).

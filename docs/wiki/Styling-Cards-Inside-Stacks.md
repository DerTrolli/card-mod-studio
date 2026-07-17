Vertical-stack, horizontal-stack, and grid cards are containers — they paint
no card box of their own, so styling "the stack" mostly means styling the
cards inside it. Opening a container in the Studio shows **one styling
section per child card**.

![Stack children](https://raw.githubusercontent.com/DerTrolli/card-mod-studio/main/images/08%20Stack%20Children.png)

## How it works

- Each child section carries the **full module set for that child's card
  type** — a gauge child gets the gauge treatment (dial/needle/Fade), a tile
  child the tile treatment, an entities child even gets the
  [per-row section](Entities-Card-Per-Row-Styling).
- Changes are written into **that child's own** `card_mod:`/`uix:` block
  inside the stack config — exactly the YAML you'd get styling the card
  standalone, applied natively by both engines:

```yaml
type: vertical-stack
cards:
  - type: gauge
    entity: sensor.outside_temperature
    card_mod:
      style: |
        ha-gauge { --gauge-color: #03a9f4 !important; }
  - type: tile
    entity: light.ceiling_lights
```

- The live preview renders the **whole stack** and updates as you edit any
  child.
- A dot marks children that carry styling; reopening the editor restores
  every child's settings.

Because the output is per-child standard YAML, a card moved out of the stack
keeps its styling, and cards styled standalone keep theirs when moved in.

## Container-level styling

The container itself only offers [Advanced CSS](Advanced-CSS) — background/
border/etc. at container level have no visual effect (there's no `ha-card`
box), which is why those modules aren't shown there.

## Not covered yet

- Containers nested inside containers (a stack in a stack) — open the inner
  stack as its own card to style its children.
- `conditional` cards (single `card:` instead of `cards:`).
- `sections` view containers.

See the [roadmap](https://github.com/DerTrolli/card-mod-studio/blob/main/docs/ROADMAP.md)
— these are planned for the path to v1.0.

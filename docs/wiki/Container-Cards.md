`vertical-stack`, `horizontal-stack`, `grid`, `conditional` and
`entity-filter` — and containers inside containers *(new in 1.0, beta)*.
Not covered yet: `sections` view containers.

## Stacks & grid

Containers paint **no card box of their own**, so the panel shows **one
styling section per child card** instead of dead container-level controls —
the full story is on **[Styling Cards Inside Stacks](Styling-Cards-Inside-Stacks)**.
Children can be built-in cards or custom cards the Studio knows
([Mushroom](Mushroom-Cards), [Bubble Card](Bubble-Card)).

At the container level itself, only [Advanced CSS](Advanced-CSS) is offered
(for the rare layout tweak like `gap` between children).

## Conditional and entity-filter *(new in 1.0, beta)*

- **`conditional`** shows one section for the card inside it (`card:`); the
  style is saved into that card, so it shows whenever the condition does.
- **`entity-filter`** shows one section for the card it renders. Without a
  `card:` of its own Home Assistant uses an entities card, and the section
  says so; styling it writes that `card:` (`type: entities`) into the
  config, so the style has somewhere to live.

## Containers inside containers *(new in 1.0, beta)*

A stack in a stack, a grid in a conditional, … each inner container gets its
own section with one nested section per card inside it, as deep as the
nesting goes. Each card's style is saved into exactly that card. An entities
card anywhere inside keeps its [per-row section](Entities-Card-Per-Row-Styling),
and a tile card its [Features](Tile-Card#features-new-in-10-beta) module.

## Not covered yet

| Type | Status |
|---|---|
| `sections` view containers | Edited through a different HA dialog — planned ([What's Planned](Whats-Planned)) |
| Custom containers (layout-card, …) | No editable `cards:` the Studio can reach — a banner explains; style the inner cards in YAML |

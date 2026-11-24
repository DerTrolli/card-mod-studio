`vertical-stack`, `horizontal-stack`, `grid`, `conditional` and
`entity-filter` — and containers inside containers *(new in 1.0)*.
Sections in sections views *(new in 1.0.0-beta.2)* — see below.

## Stacks & grid

Containers paint **no card box of their own**, so the panel shows **one
styling section per child card** instead of dead container-level controls —
the full story is on **[Styling Cards Inside Stacks](Styling-Cards-Inside-Stacks)**.
Children can be built-in cards or custom cards the Studio knows
([Mushroom](Mushroom-Cards), [Bubble Card](Bubble-Card)).

At the container level itself, only [Advanced CSS](Advanced-CSS) is offered
(for the rare layout tweak like `gap` between children).

## Conditional and entity-filter *(new in 1.0)*

- **`conditional`** shows one section for the card inside it (`card:`); the
  style is saved into that card, so it shows whenever the condition does.
- **`entity-filter`** shows one section for the card it renders. Without a
  `card:` of its own Home Assistant uses an entities card, and the section
  says so; styling it writes that `card:` (`type: entities`) into the
  config, so the style has somewhere to live.

## Containers inside containers *(new in 1.0)*

A stack in a stack, a grid in a conditional, … each inner container gets its
own section with one nested section per card inside it, as deep as the
nesting goes. Each card's style is saved into exactly that card. An entities
card anywhere inside keeps its [per-row section](Entities-Card-Per-Row-Styling),
and a tile card its [Features](Tile-Card#features-new-in-10) module.

## Sections *(new in 1.0.0-beta.2)*

In a sections view, open a section's menu → **Edit**: Home Assistant's
**Section configuration** dialog now has the 🎨 **Style** button too. A
section is a grid, so the Studio shows one styling section per card in it,
saved into that card. **Advanced CSS** at this level styles the section
itself with `:host { … }` — for example `:host { background: … }` (both
card-mod and UIX apply it). The dialog grows to fit the Studio, which shows
its own preview while it's open.

Verified on Home Assistant 2026.11. Older Home Assistant (checked: 2025.9,
2026.2) has the small "Edit section" dialog without a preview; the Style
button isn't offered there — each card in the section still has its own.

## Not covered yet

| Type | Status |
|---|---|
| Custom containers (layout-card, …) | No editable `cards:` the Studio can reach — a banner explains; style the inner cards in YAML |

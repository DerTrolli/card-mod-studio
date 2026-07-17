`vertical-stack`, `horizontal-stack`, `grid` — plus the not-yet-covered
`conditional` and `sections`.

## Stacks & grid

Containers paint **no card box of their own**, so the panel shows **one
styling section per child card** instead of dead container-level controls —
the full story is on **[Styling Cards Inside Stacks](Styling-Cards-Inside-Stacks)**.

At the container level itself, only [Advanced CSS](Advanced-CSS) is offered
(for the rare layout tweak like `gap` between children).

## Not covered yet

| Type | Status |
|---|---|
| `conditional` | Uses a single `card:` instead of `cards:` — per-child styling planned ([What's Planned](Whats-Planned)); style the inner card standalone for now |
| `sections` view containers | Edited through a different HA dialog — same plan |
| A stack **inside** a stack | No recursion yet — open the inner stack as its own card |

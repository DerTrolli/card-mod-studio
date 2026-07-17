`type: entities` — the list card. Styling is split between **card level**
(the frame around the list) and **row level** (each entity line).

## Card-level options

| Module | Available | Notes |
|---|---|---|
| Font | ✅ | All rows at once, **plus the card title** (title at 1.5× your size — its native ratio) |
| Visual Filters | ✅ | |
| Accent Color | — hidden | Nothing card-wide to accent — use per-row colors |
| Icon Color | — hidden | Card-level icon CSS can't reach into rows (each row is its own shadow-DOM element) — use per-row |
| Threshold Colors | — hidden | Same reason — thresholds live per row |
| Background | ✅ | |
| Animation | ✅ | |
| Border & Radius | ✅ | |
| Advanced CSS | ✅ | |
| **Entity Rows** | ✅ | The per-row section — see below |

## Row-level options

Each row gets its own section: **icon color** (static or threshold),
**text/state color** (static or threshold), and a **per-row font override**
(size + weight, layered over the card-level Font).

Full details, YAML shape, and the bare-string-row behavior:
**[Entities Card — Per-Row Styling](Entities-Card-Per-Row-Styling)**.

## Inside stacks

An entities card nested in a stack gets the same row section in its child
styling panel — see [Styling Cards Inside Stacks](Styling-Cards-Inside-Stacks).

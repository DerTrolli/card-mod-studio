`type: glance` — the compact multi-entity grid.

## Available options

| Module | Available | Notes |
|---|---|---|
| Font | ✅ | Entity names/states, **plus the card title** |
| Visual Filters | ✅ | |
| Accent Color | ✅ | Generic variables — limited visible effect on this card |
| Icon Color | — hidden | See below — genuinely unreachable |
| Threshold Colors | ✅ | Background/text-color properties work; icon color doesn't (same reason) |
| Background | ✅ | |
| Animation | ✅ | |
| Border & Radius | ✅ | |
| Advanced CSS | ✅ | |

## Why no icon color?

Glance renders each icon inside a nested `<state-badge>` shadow root and
colors it inline from entity state. Six candidate selectors were tested
against a real render — none had any effect — so the Studio hides the
control instead of offering a dead one. Reaching it needs shadow-piercing
styles: planned, see [What's Planned](Whats-Planned).

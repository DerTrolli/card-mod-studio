`type: glance` — the compact multi-entity grid.

## Available options

| Module | Available | Notes |
|---|---|---|
| Font | ✅ | Entity names/states, **plus the card title** |
| Visual Filters | ✅ | |
| Accent Color | — hidden | Nothing on a glance card reads the accent colour (measured, v0.10.0) |
| Icon Color | — hidden | See below — genuinely unreachable |
| Threshold Colors | ✅ | Background / Text / Border Color (Icon and Accent aren't offered — same reasons) |
| Background | ✅ | |
| Animation | ✅ | |
| Border & Radius | ✅ | |
| Advanced CSS | ✅ | |

## Why no icon color?

Glance renders each icon inside a nested `<state-badge>` shadow root and
colors it inline from entity state. Six candidate selectors were tested
against a real render — none had any effect — and in the v0.10 cycle the
dictionary-form (`$` shadow-piercing) variants were probed on both card-mod
and UIX too: they don't reach it either, because the per-state color is set
inline on the icon inside the badge's shadow root. So the Studio hides the
control instead of offering a dead one — this is a documented limitation,
not a planned feature.

`type: sensor` and `type: entity` — the simple "name + big value" cards.

## Available options

| Module | Available | Notes |
|---|---|---|
| Font | ✅ | Name, unit, **and the big value** — the value scales at 1.75× your chosen size (its native ratio) |
| Visual Filters | ✅ | |
| Accent Color | ✅ | On `sensor`, this colors the **mini graph line** |
| Icon Color | ✅ | |
| Threshold Colors | ✅ | The natural fit: icon/text color from the value |
| Background | ✅ | |
| Animation | ✅ | |
| Border & Radius | ✅ | |
| Advanced CSS | ✅ | |

## Card-specific behavior

- Since v0.8.0, Font reaches the **name and value**, not just the unit —
  each internal text element carries explicit styles that are now all
  targeted (with the value kept proportionally larger, so 16px doesn't
  shrink your reading to body-text size).
- A numeric sensor has no on/off state: ON/OFF conditional modes use
  "Controlled by", while **Threshold Colors reads the value directly** —
  usually what you actually want on these cards.
- Since v0.8.0 these cards use HA's newer form-based editor — the Studio
  ships a shim so adding styles no longer breaks the visual editor
  ("Key 'uix' is not expected").

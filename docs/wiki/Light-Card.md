`type: light` — the round brightness-dial card.

## Available options

| Module | Available | Notes |
|---|---|---|
| Font | ✅ | Name/state text (`#info`) and the brightness % both follow the size |
| Visual Filters | ✅ | Grayscale-while-off is great here |
| Accent Color | ✅ | Generic accent variables |
| Icon Color | ✅ | Has the extra **"Match the light's color"** mode |
| Threshold Colors | ✅ | e.g. color by `brightness` attribute |
| Background | ✅ | Gradient-while-on = "glow" effect |
| Animation | — hidden | Interferes with the dial rendering |
| Border & Radius | ✅ | |
| Advanced CSS | ✅ | |

## Card-specific behavior

- **Match the light's color** (Icon Color mode): while on, the icon follows
  the bulb's real `rgb_color` attribute live; you choose the off color.
- Light entities are fully state-aware — every ON/OFF conditional mode
  works against the card's own entity with no extra setup.

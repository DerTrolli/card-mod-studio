`type: media-control` and `type: alarm-panel`.

## Available options

| Module | Available | Notes |
|---|---|---|
| Icon Color | ✅ | Verified working on both (they were wrongly hidden pre-v0.5.0) |
| Font | ✅ | |
| Visual Filters | ✅ | |
| Accent Color | ✅ | Generic variables |
| Threshold Colors | ✅ | |
| Background | ✅ | |
| Border & Radius | ✅ | |
| Animation | — hidden | Interferes with artwork / keypad rendering |
| Advanced CSS | ✅ | |

## Notes

- **alarm-panel**: `alarm_control_panel` entities count as toggleable, so
  ON/OFF conditional modes work directly against the card's own entity
  (armed ≈ on). Classic use: icon red while armed.
- **media-control**: no meaningful on/off state — use "Controlled by" for
  conditional colors (e.g. tint while a `media_player` group is playing,
  driven by a template binary sensor).
- The media card's artwork background is drawn by HA from the media itself —
  the Background module colors the card behind it.

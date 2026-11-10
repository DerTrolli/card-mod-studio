`type: media-control` and `type: alarm-panel`.

## Available options

| Module | Available | Notes |
|---|---|---|
| Icon Color | ✅ | Verified working on both (they were wrongly hidden pre-v0.5.0) |
| Font | ✅ | Size/weight/family. **Text color is hidden** — both cards colour their text themselves (measured, v0.10.0). On the alarm panel, size and family reach the title, the code field and keypad, and weight reaches the title plus other text drawn with Home Assistant's normal weight (state label, arm buttons). Threshold's Text Color on the alarm panel also recolours its title |
| Visual Filters | ✅ | |
| Accent Color | media-control only | alarm-panel never reads the accent colour (measured, v0.10.0) |
| Threshold Colors | ✅ | Icon / Background / Border Color (+ Accent on media-control); no Text Color (see Font) |
| Background | ✅ | |
| Border & Radius | ✅ | |
| Animation | ✅ | Offered since v0.11.0-beta.3; the keypad and the media buttons still work while a preset runs |
| Advanced CSS | ✅ | |

## Notes

- **alarm-panel**: an `alarm_control_panel` entity is never `on` or `off` (its
  states are disarmed, armed_home, armed_away, …), so ON/OFF choices aren't
  offered against the card's own entity — pick another entity under
  "Controlled by", or use Threshold Colors.
- **media-control**: no meaningful on/off state — use "Controlled by" for
  conditional colors (e.g. tint while a `media_player` group is playing,
  driven by a template binary sensor).
- The media card's artwork background is drawn by HA from the media itself —
  the Background module colors the card behind it. While something with
  artwork is playing, the artwork can cover the card background so that the
  Background colour is hardly visible; it shows when nothing is playing or
  the media has no artwork. <!-- to be confirmed by QA -->

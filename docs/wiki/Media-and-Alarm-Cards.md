`type: media-control` and `type: alarm-panel`.

## Available options

| Module | Available | Notes |
|---|---|---|
| Icon Color | ✅ | Verified working on both (they were wrongly hidden pre-v0.5.0) |
| Font | ✅ | Size/weight/family. **Text color is hidden** — both cards colour their text themselves (measured, v0.10.0). On the alarm panel, size and family reach the title, the code field and keypad, and weight reaches the title plus other text drawn with Home Assistant's normal weight (state label, arm buttons). Threshold's Text Color on the alarm panel also recolours its title |
| Visual Filters | ✅ | |
| Accent Color | media-control only | alarm-panel never reads the accent colour (measured, v0.10.0) |
| Threshold Colors | ✅ | Icon / Border Color (+ Accent on media-control), and Background on the alarm panel only; no Text Color (see Font) |
| Background | alarm-panel only | Hidden on media-control: the card paints its own colour block over its whole face (see below) |
| Border & Radius | ✅ | |
| Animation | ✅ | Offered since v0.11.0-beta.3; the keypad and the media buttons still work while a preset runs. **Gradient Shift** is left out on media-control (no Background to shift) |
| Advanced CSS | ✅ | |

## Notes

- **alarm-panel**: an `alarm_control_panel` entity is never `on` or `off` (its
  states are disarmed, armed_home, armed_away, …), so ON/OFF choices aren't
  offered against the card's own entity — pick another entity under
  "Controlled by", or use Threshold Colors.
- **media-control**: no meaningful on/off state — use "Controlled by" for
  conditional colors (e.g. tint while a `media_player` group is playing,
  driven by a template binary sensor).
- **No Background on media-control (v0.11.0-beta.3).** The card paints its
  own colour block over its whole face — the theme's primary colour, or the
  artwork, greyed while the player is off — in every state (playing with and
  without artwork, paused, idle, off, unavailable), so a card background only
  showed as a hairline rim. The module, Threshold's Background target and the
  Gradient Shift preset are therefore not offered; a Background already in the
  card's style is kept and written back unchanged. **Border & Radius** work in
  every state, and clicking a blank part of the card in the preview leads to
  Border.

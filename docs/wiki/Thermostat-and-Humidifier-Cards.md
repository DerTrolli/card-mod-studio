`type: thermostat` and `type: humidifier` — the big circular-slider cards.

## Available options

| Module | Available | Notes |
|---|---|---|
| Font | ✅ | Title + mode label follow fully; the big number: **weight/color only** for now (see limits) |
| Visual Filters | ✅ | |
| Accent Color | thermostat only | Recolors the circular slider + the heat/cool/auto/idle state colors together. Hidden on humidifier: its slider keeps HA's state colour (measured, v0.10.0) |
| Icon Color | — hidden | No reachable standalone icon |
| Threshold Colors | ✅ | e.g. slider color driven by `current_temperature` (use **Value read from: Attribute**) |
| Background | ✅ | |
| Animation | — hidden | Interferes with the slider rendering |
| Border & Radius | ✅ | |
| Advanced CSS | ✅ | |

## Card-specific behavior

- **Thermostat accent** sets the whole family of climate state variables
  (`--state-climate-heat/cool/auto/idle-color`) plus the circular slider
  color, so the card looks coherent instead of half-recolored. (Humidifier
  offers no Accent: nothing on that card reads it.)
- A classic recipe: Threshold Colors → Accent, **Value read from:
  Attribute → current_temperature**, Fade blue→red.

## Limits

- **The big temperature number's size can't be changed from the Font module
  yet** — it sits two shadow roots deep with no variable to reach it.
  **Weight and color work.** A size control is **planned for v0.11**: the
  number is reachable with a dictionary-form (`$` shadow-piercing) style, but
  the Font module can't generate one yet (see
  [What's Planned](Whats-Planned)).

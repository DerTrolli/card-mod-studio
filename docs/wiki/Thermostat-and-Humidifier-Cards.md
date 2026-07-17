`type: thermostat` and `type: humidifier` — the big circular-slider cards.

## Available options

| Module | Available | Notes |
|---|---|---|
| Font | ✅ | Title + mode label follow fully; the big number: **weight/color only** (see limits) |
| Visual Filters | ✅ | |
| Accent Color | ✅ | Thermostat: recolors the circular slider + the heat/cool/auto/idle state colors together |
| Icon Color | — hidden | No reachable standalone icon |
| Threshold Colors | ✅ | e.g. slider color driven by `current_temperature` (use **Value read from: Attribute**) |
| Background | ✅ | |
| Animation | — hidden | Interferes with the slider rendering |
| Border & Radius | ✅ | |
| Advanced CSS | ✅ | |

## Card-specific behavior

- **Thermostat accent** sets the whole family of climate state variables
  (`--state-climate-heat/cool/auto/idle-color`) plus the circular slider
  color, so the card looks coherent instead of half-recolored. Humidifier
  uses the generic accent variables — coverage is more basic there.
- A classic recipe: Threshold Colors → Accent, **Value read from:
  Attribute → current_temperature**, Fade blue→red.

## Limits

- **The big temperature number's size can't be changed** — hard-coded two
  shadow roots deep with no variable or selector to reach it. **Weight and
  color work.** (Fixable only with shadow-piercing styles — see
  [What's Planned](Whats-Planned).)

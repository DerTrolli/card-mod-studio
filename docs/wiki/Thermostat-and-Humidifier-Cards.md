`type: thermostat` and `type: humidifier` — the big circular-slider cards.

## Available options

| Module | Available | Notes |
|---|---|---|
| Font | ✅ | Title and mode label follow size and weight (the mode label — "Heating", "Humidifying" — keeps its own state colour); the big number: weight/color, and **Temperature size** (v0.11) |
| Visual Filters | ✅ | |
| Accent Color | thermostat only | Recolors the circular slider + the heat/cool/auto/idle state colors together. Hidden on humidifier: its slider keeps HA's state colour (measured, v0.10.0) |
| Icon Color | — hidden | No reachable standalone icon |
| Threshold Colors | ✅ | e.g. slider color driven by `current_temperature` (use **Value read from: Attribute**) |
| Background | ✅ | |
| Animation | ✅ | Offered since v0.11.0-beta.3, without **Spin**: a rotating card drags the circular slider's handle away from the pointer. The other presets leave the slider working |
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

- **Temperature size** (Font module, v0.11) sets the big number's size,
  24–96px (HA's default is 57px). It has its own switch and is written, as a
  shadow-piercing (`$`) dictionary entry the Studio keeps editable, only while
  the Font module is on: switching it on switches Font on, and a card that
  already has the entry opens with Font on. Your own hand-written CSS for that
  number locks the control instead of being changed.
- **Humidifier:** the Font text-size slider is hidden — the card sizes its
  own text (measured); weight, family and color still apply, and the weight
  also reaches the mode label ("Humidifying"). Animation is offered without
  Spin.
- **ON / OFF conditions:** a thermostat's or water heater's state can be
  `off` but is never `on`, so Icon Color, Accent, Background and the other
  conditional controls offer **OFF** but not ON there. A humidifier is a
  normal on/off entity.

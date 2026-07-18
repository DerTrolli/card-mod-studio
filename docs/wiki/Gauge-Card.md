`type: gauge` — well supported, with the dial color as the star and one
documented hard limit.

## Available options

| Module | Available | Notes on this card |
|---|---|---|
| Font | ✅ | Title: size/weight/color. Value number: **color only** (see limits) |
| Visual Filters | ✅ | |
| Accent Color | ✅ | Labeled "Gauge / Accent Color" — colors the **dial's value arc** |
| Icon Color | — hidden | A gauge has no icon |
| Threshold Colors | ✅ | Enabling it defaults to the Accent property here; **Fade mode** gives a smoothly blending dial |
| Background | ✅ | |
| Animation | — hidden | Interferes with the gauge's own rendering |
| Border & Radius | ✅ | |
| Advanced CSS | ✅ | |

## Card-specific behavior

- **The dial color:** HA writes its severity-computed color as an inline
  style on `<ha-gauge>` every render; the Studio targets `ha-gauge` with
  `--gauge-color: … !important`, which is the only thing that wins (v0.7.1
  fix — before that, gauge accent silently did nothing).
- **Needle gauges (`needle: true`):** there is no value arc — the accent
  colors the **needle and value text** instead, while the dial keeps
  showing your configured `segments`. The panel hints at this.
- **Fade thresholds on the dial** do what the gauge's own `severity`
  option can't: a continuous blue→green→red blend instead of hard steps.
- A gauge's entity has no on/off state — conditional color modes use the
  "Controlled by" picker.

## Limits

- **The value number's size can't be changed** — it's SVG text that HA
  auto-scales to always fill the same fraction of the dial. Its **color**
  follows the Font module's text color.

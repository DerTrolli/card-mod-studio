`type: gauge` — well supported, with the dial color as the star; since v0.11
the value number's size can be changed too.

## Available options

| Module | Available | Notes on this card |
|---|---|---|
| Font | ✅ | Title: size/weight/color. Value number: color, and **Number size** (v0.11) |
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

- **Number size** (Font module, v0.11) scales the box HA fits the value
  into — 50–150 % of HA's own size. HA always fits the number into that box,
  so the number stops growing where the dial leaves no room (around 125–150 %,
  depending on the card's width). It has its own switch in the Font module
  and is written as a shadow-piercing (`$`) dictionary entry the Studio keeps
  editable; if you already wrote your own `ha-gauge$` CSS, the control shows
  as locked and your CSS stays as it is.

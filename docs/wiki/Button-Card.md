`type: button` — the HA built-in button card (not the custom
`button-card`).

## Available options

| Module | Available | Notes |
|---|---|---|
| Font | ✅ | The label **and the state line** (shown with `show_state: true`): size (the state line at 0.7875× yours, its native ratio) and colour follow, and with `show_name: false` the state line is the only text. Size needed special handling internally (`!important`), done automatically |
| Visual Filters | ✅ | |
| Accent Color | — hidden | The button card never reads the accent colour — switching it on changed nothing (measured, v0.10.0) |
| Icon Color | ✅ | Plain or ON/OFF conditional |
| Threshold Colors | ✅ | Icon / Background / Text / Border Color |
| Background | ✅ | |
| Animation | ✅ | Pulse/blink on a doorbell button, etc. |
| Border & Radius | ✅ | |
| Advanced CSS | ✅ | |

## Card-specific behavior

- **Older Font styles change on the next save:** a Font colour or a hand-written
  `ha-card { color: … }` is loaded into the Font module, and saving adds the
  state-line colour too, so the state line changes colour with it.
- Buttons often have **no entity** (pure `tap_action` buttons). Conditional
  modes still work — pick the driving entity in **"Controlled by"** (the
  panel warns you when a condition would otherwise never match).
- This is the poster child for cross-entity styling: a scene button whose
  icon turns red while the alarm is armed, etc.

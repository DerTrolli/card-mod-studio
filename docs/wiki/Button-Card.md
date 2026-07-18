`type: button` — the HA built-in button card (not the custom
`button-card`).

## Available options

| Module | Available | Notes |
|---|---|---|
| Font | ✅ | The label — size needed special handling internally (`!important`), done automatically |
| Visual Filters | ✅ | |
| Accent Color | ✅ | Generic accent variables |
| Icon Color | ✅ | Plain or ON/OFF conditional |
| Threshold Colors | ✅ | |
| Background | ✅ | |
| Animation | ✅ | Pulse/blink on a doorbell button, etc. |
| Border & Radius | ✅ | |
| Advanced CSS | ✅ | |

## Card-specific behavior

- Buttons often have **no entity** (pure `tap_action` buttons). Conditional
  modes still work — pick the driving entity in **"Controlled by"** (the
  panel warns you when a condition would otherwise never match).
- This is the poster child for cross-entity styling: a scene button whose
  icon turns red while the alarm is armed, etc.

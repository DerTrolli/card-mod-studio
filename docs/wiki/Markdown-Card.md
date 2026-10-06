`type: markdown` — free-form text/Jinja content.

## Available options

| Module | Available | Notes |
|---|---|---|
| Font | ✅ | The whole rendered content inherits size/weight/family/color |
| Visual Filters | ✅ | |
| Accent Color | — hidden | Nothing in rendered markdown reads the accent colour (links use the theme's primary colour) (measured, v0.10.0) |
| Icon Color | — hidden | No icon |
| Threshold Colors | ✅ | Background / Text / Border Color from any entity's value |
| Background | ✅ | |
| Animation | ✅ | |
| Border & Radius | ✅ | |
| Advanced CSS | ✅ | Target specific markdown elements (`h1`, `code`, …) here |

Markdown cards have no entity of their own — conditional modes use
"Controlled by" / "While another entity is ON…" pickers.

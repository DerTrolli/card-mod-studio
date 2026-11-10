`type: markdown` — free-form text/Jinja content.

## Available options

| Module | Available | Notes |
|---|---|---|
| Font | ✅ | The whole rendered content inherits size/weight/family/color |
| Visual Filters | ✅ | |
| Accent Color | — hidden | Nothing in rendered markdown reads the accent colour (links use the theme's primary colour) (measured, v0.10.0) |
| Icon Color | — hidden | No icon |
| Threshold Colors | ✅ | Background / Text / Border Color from any entity's value (Text Color recolours the card title too) |
| Background | ✅ | |
| Animation | ✅ | |
| Border & Radius | ✅ | |
| Advanced CSS | ✅ | Target specific markdown elements (`h1`, `code`, …) here |

Markdown cards have no entity of their own — conditional modes use
"Controlled by" / "While another entity is ON…" pickers; "Only while entity is
ON/OFF" about the card's own entity isn't offered.

A markdown card with `text_only: true` (what a sections view's "Add title"
creates) has Home Assistant's own rule that removes its background, border and
shadow. Since v0.11.0-beta.3 the Studio's Background, Border and Threshold
background / border colour win over it there. Font weight and the title:
weight reaches the card title through Home Assistant's normal-weight token.

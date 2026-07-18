The picture family: `picture`, `picture-entity`, `picture-glance`,
`picture-elements`.

## Available options

| Module | Available | Notes |
|---|---|---|
| Border & Radius | ✅ | The most useful one here — rounds/frames the image |
| Visual Filters | ✅ | Grayscale/brightness/blur applied to the picture itself |
| Font | ✅ | The caption/state text; `picture-glance` also gets its title styled |
| Threshold Colors | ✅ | Border color from a value makes a nice status frame |
| Background | — hidden | The image covers the card — a background can't show |
| Animation | — hidden | |
| Icon Color | picture-glance only | Offered for its bottom icon row; `picture`/`picture-entity` have no reachable icon |
| Accent Color | ✅/limited | Generic variables |
| Advanced CSS | ✅ | |

## Recipe: camera card with an alert frame

`picture-entity` on a camera + Threshold Colors → **Border Color** driven by
a motion/person-count sensor: the image gets a red frame when something's
detected. Filters' grayscale-while-off pairs well for unavailable cameras.

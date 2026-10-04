The picture family: `picture`, `picture-entity`, `picture-glance`,
`picture-elements`.

## Available options

| Module | Available | Notes |
|---|---|---|
| Border & Radius | ✅ | The most useful one here — rounds/frames the image |
| Visual Filters | ✅ | Grayscale/brightness/blur applied to the picture itself |
| Font | picture-entity, picture-glance, picture-elements | Caption/state text and the `picture-glance` title. Text color hidden — these cards draw their captions in their own colour over the image; plain `picture` has no text (measured, v0.10.0) |
| Threshold Colors | ✅ | Border Color from a value makes a nice status frame (plus Icon/Text where the card has them) |
| Background | — hidden | The image covers the card — a background can't show |
| Animation | — hidden | |
| Icon Color | picture-glance only | Offered for its bottom icon row; the others have no reachable icon (picture-elements' state icons are coloured by state) |
| Accent Color | — hidden | Nothing on a picture card reads the accent colour (measured, v0.10.0) |
| Advanced CSS | ✅ | |

## Recipe: camera card with an alert frame

`picture-entity` on a camera + Threshold Colors → **Border Color** driven by
a motion/person-count sensor: the image gets a red frame when something's
detected. Filters' grayscale-while-off pairs well for unavailable cameras.

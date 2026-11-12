The picture family: `picture`, `picture-entity`, `picture-glance`,
`picture-elements`.

## Available options

| Module | Available | Notes |
|---|---|---|
| Border & Radius | ✅ | The most useful one here — rounds/frames the image |
| Visual Filters | ✅ | Grayscale/brightness/blur applied to the picture itself |
| Font | picture-entity, picture-glance, picture-elements | Caption/state text (picture-entity and picture-glance: weight, family only — no size row; on picture-glance the weight reaches the title). Text color hidden — these cards draw their captions in their own colour over the image; plain `picture` has no text (measured, v0.10.0) |
| Threshold Colors | ✅ | Border Color from a value makes a nice status frame (plus Icon/Text where the card has them) |
| Background | — hidden | The image covers the card — a background can't show |
| Animation | ✅ (not Gradient Shift) | Offered since v0.11.0-beta.3; **Gradient Shift** is left out because there's no Background to shift |
| Icon Color | picture-glance only | Offered for its bottom icon row (icon size up to 40px — the buttons are 40px wide and sit edge to edge); the others have no reachable icon (picture-elements' state icons are coloured by state) |
| Accent Color | — hidden | Nothing on a picture card reads the accent colour (measured, v0.10.0) |
| Advanced CSS | ✅ | |

## Click-to-edit

In the live preview, the words of a caption name Font, picture-glance's
entity buttons name Icon Color, and a part nothing styles (the image itself)
names Border, since Background is hidden on these cards.

## Recipe: camera card with an alert frame

`picture-entity` on a camera + Threshold Colors → **Border Color** driven by
a motion/person-count sensor: the image gets a red frame when something's
detected. Filters' grayscale-while-off pairs well for unavailable cameras.

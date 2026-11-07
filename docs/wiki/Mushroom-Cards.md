[Mushroom](https://github.com/piitaya/lovelace-mushroom) cards (`custom:mushroom-*-card`) — **new in 0.11 (beta)**. All 18 Mushroom card types have their own set of controls, each one wired to the part of the card it actually reaches. Controls with nothing to reach are hidden, as on every other card.

> Beta: Mushroom support first shipped in v0.11.0-beta.2. It was measured on
> **Mushroom 5.2.3**, **HA 2026.11.0**, **card-mod 4.2.1** and **UIX 9.0.0**
> (identical on both engines): the module-effect audit finds no control that
> changes nothing on any of the 18 types. Other Mushroom versions aren't measured — if a control stops working
> after a Mushroom update, [open an issue](https://github.com/DerTrolli/card-mod-studio/issues).

## Which cards

| Group | Card types |
|---|---|
| **Classic state cards** (14) | `alarm-control-panel`, `climate`, `cover`, `entity`, `fan`, `humidifier`, `light`, `lock`, `media-player`, `number`, `person`, `select`, `update`, `vacuum` — e.g. `custom:mushroom-light-card` |
| **Template card** | `custom:mushroom-template-card` — styled like a [tile](Tile-Card) |
| **Chips card** | `custom:mushroom-chips-card` |
| **Title card** | `custom:mushroom-title-card` |
| **Empty card** | `custom:mushroom-empty-card` — draws nothing, so there's nothing to style and the Studio offers no controls |

## Available options

### Classic state cards (14)

| Module | Available | What it styles |
|---|---|---|
| Font | ✅ | **Primary text** (the name) and **secondary text** (the state) together: size, weight, family and colour |
| Icon Color | ✅ | The icon's colour, plus an **Icon size** slider that resizes the icon shape and its glyph together |
| Accent Color | ✅ — hidden when the card sets `icon_color` | The card's **active colour**: icon, icon shape and, on the light card, the brightness slider. Cards that have several states (climate modes, cover open/closed, lock states, …) are coloured for every active state; off, idle and unknown states keep Mushroom's own disabled colour |
| Threshold Colors | ✅ | Icon, Accent, Background, Text and Border colour from a value (Accent follows the Accent rule above) |
| Background | ✅ | The card's background |
| Border & Radius | ✅ | The card's border and corner radius |
| Visual Filters, Animation | ✅ | The whole card |
| Advanced CSS | ✅ | Anything else |

### Template card

Styled like a tile: Font → name and state text, Accent → the tile colour, Icon Color (colour and size), Threshold, Background, Border, Filters and Animation. See the [Tile card](Tile-Card) page for how those behave.

### Chips card

A chips card is a row of small chips, so the controls are chip-shaped:

| Module | Available | What it styles |
|---|---|---|
| Font | ✅ (no text colour) | Chip text size, weight and family. The text colour isn't offered: the only thing that reaches chip text also recolours everything else under it |
| Icon Color | size only | The chips' icon size. The panel says so: the icons can't take a colour from a style |
| Background | ✅ | The chip background |
| Border & Radius | ✅ | Chip border width, colour and corner radius |
| Threshold Colors | Background, Border colour | The other targets have nothing to reach |
| Accent Color | — hidden | Chips have no accent colour |
| Visual Filters, Animation | ✅ | The whole card |

### Title card

Text only; the card paints no box and has no icon.

| Module | Available | What it styles |
|---|---|---|
| Font | ✅ | The **title**: size, weight, family and colour. The subtitle is not touched |
| Threshold Colors | Text colour only | |
| Visual Filters, Animation | ✅ | The whole card |
| Background, Border, Icon Color, Accent Color | — hidden | The title card has no box and no icon, so these do nothing |

## Card-specific behavior

- **Accent needs an exact colour.** Mushroom takes its accent as a red/green/blue triple, so the Studio converts your colour. Hex, `rgb()`, `hsl()`, colour names, HA palette swatches and HA's own theme colours (such as `var(--primary-color)`) convert, and so do colours from [My Color Palette](Presets-and-My-Color-Palette). Transparency is dropped, since Mushroom's accent has none. A colour that can't be converted (for example your own `var(--my-colour)`) isn't written, and the module says so under the colour mode — pick another colour.
- **Accent is hidden when the card sets its own `icon_color`.** Mushroom then ignores the accent variables entirely (measured), so the control would do nothing. Remove `icon_color` from the card's YAML to get Accent back. With a Threshold rule set, the Accent target disappears for the same reason.
- **Off states keep their look.** Accent colours what the card shows while active; Mushroom's own disabled colour for off, idle and unknown states is deliberately left alone.
- **Your hand-written CSS is preserved.** Anything on a Mushroom card that the Studio doesn't recognise stays in [Advanced CSS](Advanced-CSS) and is written back unchanged, including your own `!important` rules. Where a hand-written rule overrides a control, that control shows the usual ⚠️ warning.

## Click-to-edit

Point at the preview and the highlight names the control that styles that part; a click jumps to it.

- **Classic cards:** primary and secondary text → Font, the icon (shape and glyph) → Icon Color, anything else on the card → Background.
- **Template card:** the name/state block → Font, the icon → Icon Color.
- **Chips:** a chip's text → Font, its glyph → Icon Color, the rest of the chip → Background.
- **Title card:** the title → Font. The subtitle isn't claimed by any control.

## Limits

- **Tested versions:** Mushroom 5.2.3 on HA 2026.11.0 with card-mod 4.2.1 and UIX 9.0.0.
- **Chips:** no text colour and no icon colour (see above).
- **Title card:** the subtitle can't be styled from the Studio — use [Advanced CSS](Advanced-CSS).
- **Mushroom cards inside a stack** get their own styling section like any other child — see [Cards Inside Stacks](Styling-Cards-Inside-Stacks).

See also: [Bubble Card](Bubble-Card) · [Card Support & Limits](Card-Support).

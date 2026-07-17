Two closely related modules for the card's main colors.

![Icon and Accent Color](https://raw.githubusercontent.com/DerTrolli/card-mod-studio/main/images/03%20Accent%20and%20Icon%20Color.png)

## Icon Color

Colors the card's main icon (`ha-state-icon`). Three modes:

- **One fixed color** — always the same color.
- **Different for ON / OFF** — one color while the controlling entity is on,
  another while off (a Jinja2 condition is generated).
- **Match the light's color** *(light cards only)* — while on, the icon
  follows the light's real `rgb_color` attribute; you pick the off color.

## Accent Color

The card's "theme" color. What it actually paints depends on the card type —
the module emits the right variable(s) per card:

| Card | What accent colors |
|---|---|
| tile | The tile color (icon + state text tint), incl. tile features like bar gauges |
| gauge | The dial's value arc — or with `needle: true`, the needle + value text |
| sensor | The graph line |
| everything else | `--accent-color` and the state icon color |

Modes: **One fixed color** or **Different for ON / OFF**, same as Icon Color.

## "Controlled by" — drive colors from a different entity

In ON/OFF mode, the condition doesn't have to come from the card's own
entity. The **Controlled by** picker accepts any toggleable entity — e.g. a
button card whose icon reflects a separate status sensor. Leave it empty to
use the card's own entity. If the card's own entity has no on/off state
(e.g. a plain sensor), the panel warns you to pick one.

## Notes

- Fresh modules start from your **ON/OFF default colors** if you've set them
  in [My Color Palette](Presets-and-My-Color-Palette).
- Want the color to follow a *numeric value* instead of on/off? That's
  [Threshold Colors](Threshold-Colors) — it can drive icon and accent color
  (and more) from the same rule set.
- Some cards have no reachable icon (see [Card Support](Card-Support)) — the
  Icon Color module is hidden there rather than showing a dead control.

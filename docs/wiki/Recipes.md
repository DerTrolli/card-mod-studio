Practical, copy-along walkthroughs — each takes under a minute in the panel.
All of them work identically with card-mod or UIX.

## 1. Battery rows that turn red when low

*An entities card listing battery sensors; low ones should stand out.*

1. Open the entities card → **🎨 Style** → scroll to **Entity Rows**
2. Expand a battery row → enable **Icon color** → switch to **Threshold**
3. Add rules: `< 20` → red, `< 50` → orange · **Default color** → green
4. Repeat per row (or style one, **Save** it as a preset piece for later)

Same idea works for **Text / state color** — or both together.

## 2. A temperature gauge that fades blue → green → red

1. Open the gauge card → **Threshold Colors** → enable
2. **Apply to:** Accent Color · **Value mode:** *Fade*
3. Points: `0` → blue, `20` → green, `30` → red
4. The gradient bar previews the whole range; the dial now blends smoothly
   with the live value — something the gauge's own `severity` segments
   (discrete steps only) can't do.

## 3. Pulse while the washing machine runs

1. Open the machine's card → **Animation** → enable
2. Preset **Pulse**, speed to taste
3. **Apply when:** *Only while entity is ON* — or *While another entity is
   ON…* and pick e.g. `binary_sensor.washer_running`

## 4. "Dead" look for offline / off devices

1. **Visual Filters** → enable → **Grayscale** on
2. **Apply when:** *Only while entity is OFF*
3. Optional: drop **Brightness** to ~70% for extra effect

## 5. A card that glows with the light's color

*A light card whose icon follows the bulb's real color:*

1. **Icon Color** → enable → mode **Match the light's color**
2. Pick the OFF color (e.g. grey)

*Bonus glow:* **Background** → gradient, **Apply when:** *Only while ON*.

## 6. One card's color driven by a different entity

*A button card that shows red when the alarm is armed:*

1. **Icon Color** → enable → **Different for ON / OFF**
2. **Controlled by:** pick the alarm/status entity
3. Color when ON → red, OFF → default grey

Works the same in Accent Color, Background ("While another entity is ON…"),
Filters, Animation, and Threshold Colors (which additionally reads numeric
values and [attributes](Threshold-Colors#the-value-source)).

## 7. Style by battery *attribute* instead of state

*Some devices expose battery as an attribute, not a sensor:*

1. **Threshold Colors** → enable → pick the device's entity
2. **Value read from:** *Attribute: battery_level*
3. Rules as in recipe 1

## 8. A consistent look across the whole dashboard

1. Define your colors once in **🖌️ My Color Palette** — they appear as
   swatches in every picker
2. Style one card the way you like → **💾 Save** as a preset
3. Open each other card → **📋 Load preset…** — done
4. Optional: set the palette's **ON / OFF defaults** so every newly-enabled
   module starts on-brand

## Something the recipes don't cover?

The [Advanced CSS](Advanced-CSS) editor accepts anything card-mod/UIX can
do. And if a visual control *should* exist for it,
[open a feature request](https://github.com/DerTrolli/card-mod-studio/issues)
— several modules on these pages started exactly that way.

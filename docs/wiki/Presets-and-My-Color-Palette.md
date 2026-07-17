Two features for keeping a consistent look across your dashboard, both
stored **per HA user** in Home Assistant's backend — they sync automatically
to every device and browser logged in as the same user (localStorage is kept
as an instant local fallback).

## Style presets

The bar at the top of the panel:

- **💾 Save** — stores the card's *entire* current style configuration under
  a name.
- **📋 Load preset…** — applies a saved preset to any other card, in one
  click. Card-type-specific parts adapt (the same accent preset colors a
  gauge's dial and a tile's tint).
- **×** — deletes the selected preset.

Loading a preset keeps the current card's hand-written Advanced CSS unless
the preset itself carries Advanced CSS — a preset from a different card
won't silently wipe your custom rules.

## My Color Palette

![My Color Palette](https://raw.githubusercontent.com/DerTrolli/card-mod-studio/main/images/09%20Font%20and%20Palette.png)

The **🖌️ My Color Palette** section (below the preset bar):

- **My colors** — named custom colors that appear as an extra swatch row in
  **every** color picker: card modules, threshold rules, fade points, and
  per-row controls alike. Define your brand/theme colors once.
- **Default ON / OFF colors** — override what a freshly-enabled control
  starts with: Icon Color / Accent Color's ON and OFF colors, a new
  threshold rule's color, a new fade point, a row's icon color. Changing
  these never touches already-styled cards — only what *new* controls start
  from. **Reset** returns to the built-ins.

## Where exactly is this stored?

HA's per-user frontend storage (`frontend/set_user_data`) — on the server in
`.storage/frontend.user_data_<user_id>`, not in the browser. No extra
entity, no cloud. Presets saved by old versions are migrated automatically
when loaded by a newer version.

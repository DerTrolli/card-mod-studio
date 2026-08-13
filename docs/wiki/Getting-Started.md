## Opening the panel

1. Edit any card (pencil icon in dashboard edit mode)
2. Click the **🎨 Style** button in the editor footer
3. The Card-Mod Studio panel opens in place of the card's normal config form

![The panel](https://raw.githubusercontent.com/DerTrolli/card-mod-studio/main/images/02%20Card-Mod%20Studio.png)

The layout:

- **Left column** — the preset bar, [My Color Palette](Presets-and-My-Color-Palette),
  and the style modules. Only modules that can actually do something on this
  card type are shown (see [Card Support](Card-Support)).
- **Right column** — a live preview of the real card that re-renders on every
  change. On narrow screens the preview stacks below the controls.

Each module has a **toggle** (enables its output) and a collapsible body.
A module that's off contributes nothing to the generated YAML.

**Not sure which control styles what?** Since v0.9.0, just point at it:
hovering any part of the preview shows a highlight box naming the control
that styles that element, and clicking jumps straight to it (the preview
stays safe — clicks never reach your real entities).

## Saving

There is no separate save step — the Studio writes into the card's config as
you edit, and you save with the editor's normal **Save** button. Cancel
discards everything, exactly like any other card edit.

## What actually gets saved

The Studio serializes your settings to CSS (+ Jinja2 templates for anything
state-driven) under the card's `card_mod:` key — or `uix:` when UIX is the
only engine installed (see [card-mod vs UIX](card-mod-vs-UIX)). Example — a
tile with an accent color and a border:

```yaml
type: tile
entity: sensor.outside_temperature
card_mod:
  style: |
    ha-card {
      --accent-color: #03a9f4;
      --tile-color: #03a9f4 !important;
      border: 2px solid #03a9f4;
    }
```

You can inspect it any time via **Show code editor** — the generated YAML is
plain card-mod/UIX syntax with no runtime dependency on Card-Mod Studio.
**If you uninstall the Studio, every styled card keeps working** — the engine
(card-mod/UIX) is what renders the styles.

## Editing cards that already have styles

Opening a card that carries hand-written `card_mod:`/`uix:` CSS pre-fills the
controls: everything the Studio recognises becomes editable module state —
including well-known *equivalent* phrasings (icon-color variables,
`ha-icon { color }`, `background-color`, and the shapes very old Studio
versions generated), which are adopted into the matching control and
rewritten in current syntax the moment you edit them. Anything it doesn't
fully understand is preserved verbatim in [Advanced CSS](Advanced-CSS) —
unrecognised styling is never reinterpreted or deleted, and if it overrides
an enabled control, that control tells you so with a ⚠️ warning.

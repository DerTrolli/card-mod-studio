Welcome to the **Card-Mod Studio** wiki — the detailed manual. The
[README](https://github.com/DerTrolli/card-mod-studio#readme) covers what the
project is and how to install it; these pages cover how everything works,
module by module, plus recipes, troubleshooting, and exact per-card support.

**Current version:** v0.8.0

## What is Card-Mod Studio?

A visual GUI editor for [card-mod](https://github.com/thomasloven/lovelace-card-mod)
/ [UIX](https://uix.lf.technology/) styles in Home Assistant. It adds a
**🎨 Style** button to the normal card editor; instead of hand-writing
YAML + CSS + Jinja2, you use color pickers, sliders, and rule builders — and
the correct `card_mod:`/`uix:` YAML is generated, previewed live, and saved
through HA's normal save flow.

## Pages

**Setup**
- [Installation](Installation) — HACS, manual, requirements
- [Getting Started](Getting-Started) — the panel, saving, how the YAML works

**Style modules**
- [Icon Color & Accent Color](Icon-Color-and-Accent-Color)
- [Threshold Colors](Threshold-Colors) — rules, Fade mode, attributes, multi-property
- [Font & Text](Font-and-Text) — Font module, Heading Style, per-card details
- [Background, Filters, Animation & Border](Background-Filters-Animation-Border)
- [Advanced CSS](Advanced-CSS) — the escape hatch, and what's always preserved

**Structure**
- [Entities Card — Per-Row Styling](Entities-Card-Per-Row-Styling)
- [Styling Cards Inside Stacks](Styling-Cards-Inside-Stacks)

**Workflow**
- [Presets & My Color Palette](Presets-and-My-Color-Palette)

**Reference**
- [card-mod vs UIX](card-mod-vs-UIX) — engines, keys, migration
- [Card Support & Known Limitations](Card-Support)
- [Troubleshooting & FAQ](Troubleshooting-FAQ)

## Getting help

- Something broken? [Open an issue](https://github.com/DerTrolli/card-mod-studio/issues).
- Feature idea? Issues are welcome — several shipped features started as user requests
  (the Font module, stack styling).

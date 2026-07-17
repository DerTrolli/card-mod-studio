The escape hatch for anything the visual modules don't cover — a raw CSS
editor (with Jinja2 support) whose content is appended after the generated
module output.

## What it's for

- Selectors the modules don't target (deep card internals, sub-elements)
- Arbitrary Jinja2 logic beyond on/off and numeric thresholds
- card-mod / UIX syntax of any kind — whatever the engine supports works
  here, including `@keyframes`, `@media`, and templates:

```css
ha-card {
  box-shadow: 0 0 12px {{ 'red' if is_state('alarm_control_panel.home', 'triggered') else 'transparent' }};
}
```

## The preservation guarantee

Advanced CSS doubles as the safety net for existing hand-written styles.
When the Studio opens a card:

- Everything it **recognises** becomes editable module state.
- Everything it **doesn't** recognise — unknown declarations, extra
  selectors, `@keyframes`/`@media` blocks, `!important` flags, complex
  Jinja2 — lands in Advanced CSS **verbatim** and is written back unchanged
  on every save. An unrelated edit can't delete your hand-written styling.
- The same guarantee applies **per entity row** on entities cards (rows have
  an invisible passthrough — hand-written row CSS survives edits even though
  there's no visible row-level editor for it).
- **Dictionary-form** card-mod styles (the `$`-shadow-piercing YAML syntax)
  can't be represented in this editor; those cards/rows are left completely
  untouched rather than flattened.

If a card opens with the note *"Some existing styles weren't recognised —
preserved in Advanced CSS"*, that's this mechanism, working.

## Evaluation order

Module output first, Advanced CSS last — so your raw CSS can override any
module's declaration when selectors and specificity match.

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
- Jinja **statements** (`{% if %}`, `{% set %}`, `{# … #}`) are kept exactly
  as written, and `@media` / `@supports` blocks **keep their position** — so
  a responsive override stays after the rules it overrides and keeps winning.
- **Dictionary-form** card-mod styles (the `$` shadow-piercing YAML syntax)
  are editable and preserved — see
  [below](#dictionary-form-styles-shadow-piercing).

On **custom cards** (Mushroom, Bubble Card — see their
[Mushroom](Mushroom-Cards) and [Bubble Card](Bubble-Card) guides) your
hand-written rules, including ones with `!important`, stay here and are
written back unchanged; on a Bubble card the card's own `styles:` option is
never touched either.

If a card opens with the note *"Some existing styles weren't recognised —
preserved in Advanced CSS"*, that's this mechanism, working. (Containers and
other cards that have no modules don't show it: their CSS lives here by
design.)

**Template statements switch the modules off.** If your style contains a
top-level `{% … %}` statement (outside a rule's braces), the Studio keeps
the whole style as written in Advanced CSS and leaves every module switched
off — the card looks the same, but the controls can't take it over. The panel
says so in a note. `{{ … }}` values and statements inside a rule don't
trigger it. A style that calls a UIX macro or billet keeps the part that
calls it here as well, and the panel notes that too.

## Warnings under the editor

A one-line, non-blocking warning appears under the editor when the text will
break the card (v0.11.0-beta.3), with the line number: an unbalanced `{` or
`}`, a Jinja block (`if`, `for`, `macro`, `call`, `filter`, `block`, `with`,
`set`) that is never closed or has no start, an unterminated `{{`, `{%` or
`{#`, or an unterminated comment or string. This matters because card-mod
renders the templates before it reads the CSS: a template that fails to
render drops the **whole** style of the card, while an unclosed `{` only
spoils the rules after it. The text is never blocked or rewritten.

The editor itself is Home Assistant's code editor; it can auto-indent or add a
stray `%}` while you type a block — check the result.

## Dictionary-form styles (shadow-piercing)

card-mod and UIX also accept a *dictionary* in place of a CSS string — the
form used to reach inside nested shadow roots:

```yaml
card_mod:
  style:
    .: |
      ha-card { border-radius: 20px; }
    ha-gauge$: |
      text.value-text { font-weight: 700; }
```

Since v0.10.0 the Studio edits these instead of freezing them:

- The **`.` entry** — the CSS for the card itself — runs through the normal
  visual modules exactly like a plain style: the controls read it and
  editing them rewrites it. If the dictionary has no `.` yet, the first edit
  inserts one.
- Every **other entry** (pierced `selector$` chains, nested dictionaries,
  UIX-only `$$` and `&` keys) is preserved **byte-for-byte, in its original
  order**, through every edit and save. They're listed read-only at the
  bottom of the Advanced CSS module; change them in the YAML editor.
- It works for top-level cards, cards inside stacks, and
  [entities-card rows](Entities-Card-Per-Row-Styling). A dictionary that is
  the card's only style is editable whichever key (`card_mod:` or `uix:`)
  holds it; a `uix:` dictionary that uses UIX-only features stays under
  `uix:`.
- A dictionary under only one key, or the identical dictionary under both
  keys (what "Copy to card_mod" produces), edits normally.

**The one case that stays frozen: mixed-form styling.** A plain style on one
key together with a *different* dictionary on the other key — or a
dictionary whose `.` entry isn't plain CSS — has no faithful single-key
rewrite. The panel shows a 🔒 *"preserved as-is"* banner instead of the
module controls (a lock note on a row); nothing is overwritten, your styling
is kept exactly as written. To edit it visually, consolidate it to one key
(or make `.` a plain CSS string) in the YAML editor. On an entities card the
per-row sections stay available.

## Evaluation order — and the override warning

Module output first, Advanced CSS last — so your raw CSS can override any
module's declaration when selectors and specificity match. **Your custom
CSS always wins by design.**

Since v0.8.1, when custom CSS sets a property an *enabled* module also
drives (e.g. a hand-written `ha-card { background }` next to an enabled
Background module), that module shows a ⚠️ badge and names the exact
declaration that's winning — so "I changed the picker and nothing
happened" is never a mystery. Remove or edit the named lines to hand
control back to the module.

## Equivalent phrasings get adopted (v0.8.1)

A few well-known hand-written equivalents of what the modules generate are
recognised directly into the matching control: icon-color variables
(`--state-icon-color`, `--paper-item-icon-color`, incl. the `:host` form
very old Studio versions generated), `ha-icon { color }`, and
`background-color`. Editing the control then replaces the hand-written line
with the Studio's own syntax. Adoption is strictly conservative — only on
card types where the two forms are verifiably equivalent, and only for
values the control can express exactly; anything else stays verbatim here.
Examples: only `solid` borders are adopted (a hand-written `dashed` or
`dotted` border stays as written); only a plain `transition: filter <duration>`
is adopted (lists, custom easing and delays are kept); a threshold color
expression is adopted only if the Studio would write it back identically —
extra conditions (`and is_state(…)`), several entities, arithmetic or a rule
order the Studio would re-sort keep it here instead of being silently
simplified.

## The Style button doesn't appear

1. Hard-refresh the browser (Ctrl+Shift+R) — stale bundle is the usual cause.
   With a manual install, also bump the `?v=` in the resource URL.
2. Check the resource exists: **Settings → Dashboards → ⋮ → Resources**
   (HACS installs it automatically; type must be *JavaScript Module*).
3. Check the browser console for a Card-Mod Studio warning: the button is
   injected into HA's card-edit dialog (`hui-dialog-edit-card`), and a major
   HA update can rename internals. If that happens, check
   [the issues](https://github.com/DerTrolli/card-mod-studio/issues) —
   compatibility fixes ship quickly after HA releases.

## A module shows a ⚠️ "Custom CSS is currently overriding this control"

Working as intended: hand-written CSS in Advanced CSS always takes
priority over the visual controls (that's what makes the escape hatch
safe). The warning names the selector/property that's winning — edit or
remove those lines in Advanced CSS if you want the module's setting to
apply instead. See [Advanced CSS](Advanced-CSS).

## Styles save but nothing changes on the card

- **Is card-mod or UIX actually installed and loading?** The Studio only
  *generates* YAML; an engine must apply it. The panel shows a warning
  banner when it can't detect either.
- **Styled under `uix:` but running card-mod?** card-mod never reads `uix:` —
  the panel warns about this per card and offers a one-click
  "Copy to card_mod" fix. See [card-mod vs UIX](card-mod-vs-UIX).
- Hard-refresh after engine installs/updates.

## "Visual editor not supported — Key 'uix' is not expected…"

Fixed in **v0.8.0**. HA's newer schema-validated card editors rejected cards
carrying `card_mod:`/`uix:` keys; the Studio now shims that validation. If
you still see it, update Card-Mod Studio and hard-refresh.

## Font size does nothing on my gauge / thermostat number

That's the one thing that genuinely can't be done today — see
[Card Support § Known limitations](Card-Support#known-limitations-v080).
Weight and color work on both; size doesn't.

## Accent color on a needle gauge

With `needle: true` there is no value arc — the accent colors the **needle
and value text** instead, while the dial keeps showing your configured
segment colors. That's the intended behavior (the panel hints at it).

## I edited the YAML by hand — will the Studio destroy it?

No. Recognised styles become editable controls; everything else is preserved
verbatim in [Advanced CSS](Advanced-CSS) and written back unchanged. The one
thing the Studio won't edit (but also won't touch) is dictionary-form
card-mod syntax.

## If I uninstall Card-Mod Studio, do my styles break?

No — the generated YAML is plain card-mod/UIX syntax with no runtime
dependency on the Studio. Cards keep rendering exactly as styled; you just
lose the visual editor.

## Where are presets stored? Do they sync?

Per HA user, server-side — they follow you to any device logged in as the
same user. See [Presets & My Color Palette](Presets-and-My-Color-Palette).

## Does this work on mobile / the companion app?

Yes — the panel is width-responsive (the preview stacks below the controls
on narrow screens). Editing dashboards is naturally more comfortable on a
larger screen.

## How do I report a bug well?

Include: the card's YAML (from *Show code editor*), your HA version, which
engine (card-mod or UIX) and its version, and what you expected vs saw.
A screenshot of the panel helps.

## Something else?

[Open an issue](https://github.com/DerTrolli/card-mod-studio/issues) — the
project actively fixes real-world reports (most of the v0.7/v0.8 fix lists
came directly from user testing).

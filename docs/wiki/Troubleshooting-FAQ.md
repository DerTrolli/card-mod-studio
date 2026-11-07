## The Style button doesn't appear

1. Hard-refresh the browser (Ctrl+Shift+R) — stale bundle is the usual cause.
   Also check your HA version: Card-Mod Studio needs **2025.9 or newer**
   (older card editors have no spot for the button).
   With a manual install, also bump the `?v=` in the resource URL.
2. Check the resource exists: **Settings → Dashboards → ⋮ → Resources**
   (HACS or the Marketplace installs it automatically; type must be
   *JavaScript Module*)
3. Check the browser console for a Card-Mod Studio warning: the button is
   injected into HA's card-edit dialog (`hui-dialog-edit-card`), and a major
   HA update can rename internals. If that happens, check
   [the issues](https://github.com/DerTrolli/card-mod-studio/issues) —
   compatibility fixes ship quickly after HA releases.

## I can't find HACS on HA 2026.11

HA 2026.11 folds HACS into core as the **Marketplace**, so there is no
separate HACS to install or open. Existing HACS installs migrate
automatically, with custom repositories and update entities carried over.
Look for Card-Mod Studio in the Marketplace instead. If the Style button
doesn't appear after installing and your dashboard resources are in **YAML
mode**, add the resource manually — see
[Installation](Installation#manual-install).

## The panel is hard to read — I can see HA's editor through it

That happens on themes with see-through ("glass") card or dialog
backgrounds in v0.10.0 and earlier: HA's own editor and preview underneath
showed through the panel. **Fixed in v0.10.1** — update, then hard-refresh
the browser (Ctrl+Shift+R).

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
- **card-mod 4.2.1 on HA 2026.8 or newer with a theme that defines
  `card-mod-*-yaml` variables?** That combination hangs card-mod (upstream
  issues #606 / #617), so its styling can stop working altogether. UIX is a drop-in
  replacement and doesn't have the problem; otherwise use a theme without
  those variables. See [card-mod vs UIX](card-mod-vs-UIX).
- Hard-refresh after engine installs/updates.

## "Visual editor not supported — Key 'uix' is not expected…"

Fixed in **v0.8.0**. HA's newer schema-validated card editors rejected cards
carrying `card_mod:`/`uix:` keys; the Studio now shims that validation. If
you still see it, update Card-Mod Studio and hard-refresh.

## My heading card's text styling stopped working on HA 2026.10

HA 2026.10 changed the heading card's markup (the title became an
`<h2 class="heading">` instead of a `<p>`), so the `.title p` rule that
older Card-Mod Studio versions wrote no longer matches anything. Update to
v0.10.0, then **open the card in the Studio and save once** — the old style
is recognised and rewritten to the new shape (HA's own
`--ha-heading-card-*` variables). Details on the
[Heading card](Heading-Card#headings-styled-with-an-older-version) page.

## A card shows "🔒 Mixed-form styling — preserved as-is"

The card (or a stack child, or an entities row) carries a hand-written
dictionary-form (`$` shadow-piercing) style *together with* a different style
on the other key (`card_mod:` vs `uix:`), or a dictionary whose `.` entry
isn't plain CSS. There's no faithful single-key rewrite of that, so the
Studio leaves it exactly as written rather than risk changing it. To edit it
visually, consolidate it to one key (or make `.` a plain CSS string) in the
YAML editor. Plain dictionary-form styles are *not* frozen — see
[Advanced CSS](Advanced-CSS#dictionary-form-styles-shadow-piercing).

## The Font module has no text-size slider on my card

On cards that size their own text — alarm panel, area, humidifier,
picture-entity, picture-glance, weather and the date card (HA 2026.11) — the
slider changed nothing when it was measured, so it's hidden. Weight, family
and (where the card doesn't colour its own text) colour stay. See
[Font & Text](Font-and-Text#not-offered-on).

## Font size does nothing on my gauge / thermostat number

Use the dedicated control instead: with the Font module on, **Number size** (gauge,
50–150 %) and **Temperature size** (thermostat, 24–96px) size those two numbers
(v0.11). A plain text-size would be ignored there. If the row shows as locked,
your card already has hand-written CSS for that number — it's preserved, and
the control stays out of its way. See [Font & Text](Font-and-Text#number-size--gauge-value-and-thermostat-temperature-v011).
A gauge that stops growing at about 118–125 % is a v0.11.0-beta.1 behaviour;
update to beta.2 or newer.

## There's no Accent Color on my Mushroom card

Mushroom ignores the accent variables while the card sets its own `icon_color`,
so the Studio hides Accent (and Threshold's Accent target) there. Remove
`icon_color` from the YAML to get it back. If Accent is shown but a colour
isn't written, it can't be converted to the red/green/blue form Mushroom
needs — the module tells you; pick a hex, `rgb()`, `hsl()`, named or palette
colour. See [Mushroom](Mushroom-Cards).

## My Bubble Card shows every control, and some do nothing

Only the button (including slider buttons), separator and cover kinds are
supported so far; any other Bubble `card_type` (or none) still shows every
module. Use [Advanced CSS](Advanced-CSS) for those. See [Bubble Card](Bubble-Card).

## A Bubble Card setting isn't winning over my own `styles:`

Between the Studio and the card's own Bubble `styles:`, equal-specificity rules
go to the Studio, but your own `!important` beats a plain Studio rule, and a more
specific selector of yours with `!important` beats the Studio's `!important`. Add `!important` to
your value, or turn the Studio control off. See
[Bubble Card](Bubble-Card#your-own-bubble-styles-and-the-studio).

## Accent color on a needle gauge

With `needle: true` there is no value arc — the accent colors the **needle
and value text** instead, while the dial keeps showing your configured
segment colors. That's the intended behavior (the panel hints at it).

## I edited the YAML by hand — will the Studio destroy it?

No. Recognised styles become editable controls; everything else is preserved
verbatim in [Advanced CSS](Advanced-CSS) and written back unchanged —
including Jinja statements, `@media` blocks and, in dictionary-form styles
(the `$` shadow-piercing syntax), every entry except `.`, which are kept
byte-for-byte (shown read-only in Advanced CSS). The one thing the Studio
won't edit (but also won't touch) is *mixed-form* styling — see the 🔒 entry
above.

## If I uninstall Card-Mod Studio, do my styles break?

No — the generated YAML is plain card-mod/UIX syntax with no runtime
dependency on the Studio. Cards keep rendering exactly as styled; you just
lose the visual editor.

## Where are presets stored? Do they sync?

Per HA user, server-side — they follow you to any device logged in as the
same user. See [Presets & My Color Palette](Presets-and-My-Color-Palette).

## Does this work on mobile / the companion app?

Yes — the panel is built to work on phones: below about 720px panel width
the preview stacks under the controls, rows and color grids wrap instead of
clipping, touch targets are larger on touch screens, and the **🎨 Style**
button turns icon-only on narrow screens so HA's dialog footer fits. On very
narrow screens HA itself moves the card's "Edit" link into the ⋮ menu.
Editing dashboards is still more comfortable on a larger screen.

## How do I report a bug well?

Include: the card's YAML (from *Show code editor*), your HA version, which
engine (card-mod or UIX) and its version, and what you expected vs saw.
A screenshot of the panel helps.

## Something else?

[Open an issue](https://github.com/DerTrolli/card-mod-studio/issues) — the
project actively fixes real-world reports (most of the v0.7/v0.8 fix lists
came directly from user testing).

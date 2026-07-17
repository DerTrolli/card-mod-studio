Card-Mod Studio works with **both** style engines and behaves sensibly in
every combination. This page explains exactly what it writes and when.

## The engines

- **[card-mod](https://github.com/thomasloven/lovelace-card-mod)** — the
  classic frontend module by thomasloven. Reads `card_mod:`.
- **[UIX](https://uix.lf.technology/)** — a card-mod-derived *integration*
  by card-mod's current maintainer. Reads `uix:` **in preference to**
  `card_mod:`, but fully supports `card_mod:` as a fallback. Adds its own
  extras (macros, billets, the Forge template builder).

## Which key does the Studio write?

| Installed | Studio writes | Why |
|---|---|---|
| card-mod only | `card_mod:` | The native key |
| card-mod + UIX | `card_mod:` | UIX reads it fine; maximum portability |
| UIX only | `uix:` | UIX's installer refuses to run alongside a `card-mod.js` resource, so this is the common UIX-only case |
| neither | `card_mod:` (+ a warning banner) | Styles will be saved but nothing renders until an engine is installed |

Either way, the panel **reads back whichever key is present** — including
cards you styled by hand under the other key. If a card carries diverging
settings under *both* keys, they're merged on open (active key wins on
conflicts) and consolidated to one source of truth on save, so nothing is
silently lost or duplicated.

## Switching engines later

- **UIX → card-mod:** card-mod never reads `uix:`, so a card styled only
  under `uix:` would go silently unstyled. The panel detects exactly that
  (per card *and* per entities-card row) and offers a one-click
  **"Copy to card_mod"** fix for plain CSS.
- **UIX macros/billets:** those are UIX-exclusive — card-mod can't run them
  under any key, so instead of a fake fix you get a clear incompatibility
  warning. Studio edits never destroy an existing `uix.macros` block.
- **card-mod → UIX:** nothing to do — UIX reads `card_mod:` natively.

## Compatibility notes

- Generated CSS is identical for both engines and is verified against **real
  running instances** of each (card-mod 4.2.x and UIX 7.x in the project's
  Docker test rig) before every release.
- Since v0.8.0 the Studio also works around an engine-level gap in both:
  HA's newer schema-validated card editors rejected any card carrying a
  `card_mod:`/`uix:` key into YAML-only mode ("Key 'uix' is not expected").
  The Studio shims that validation so the visual editor keeps working.

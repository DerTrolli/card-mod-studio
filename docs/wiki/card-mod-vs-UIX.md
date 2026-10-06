Card-Mod Studio works with **both** style engines and behaves sensibly in
every combination. This page explains exactly what it writes and when.

## The engines

- **[card-mod](https://github.com/thomasloven/lovelace-card-mod)** — the
  classic frontend module by thomasloven. Reads `card_mod:`.
- **[UIX](https://uix.lf.technology/)** — a card-mod-derived *integration*
  by card-mod's current maintainer. Reads `uix:` **in preference to**
  `card_mod:`, but fully supports `card_mod:` as a fallback. Adds its own
  extras (macros, billets, and the UIX Forge template surface — molds,
  server-stored "foundries", and add-on "sparks").

**Tested versions** (2026-10, Card-Mod Studio v0.10.0): card-mod **4.2.1**
and UIX **8.3.1**, each fully verified live on HA 2026.9.4 (current stable)
and HA 2026.10.0b0. card-mod was also quick-checked on older HA: 4.2.1 on
2026.6.4 and 2026.2.3, and 3.4.5 (the newest card-mod 3.x; 4.2.1 needs
HA ≥ 2026.2) on 2025.9.4 — see [Installation](Installation#requirements).
Note UIX 8.x itself requires HA ≥ 2026.8.0, and UIX 8.4 (in beta) will
require HA ≥ 2026.10; its styling contract (what the Studio reads/writes)
is unchanged from 7.x. The Studio doesn't edit UIX Forge config
(`forge:`/`foundry:` keys) but preserves it untouched through every edit.

**Which engine should I use?** Both work equally well with the Studio.
card-mod 4.2.1 is still the newest card-mod release, but it is effectively
unmaintained: on HA 2026.8 or newer it **hangs if your active theme defines
`card-mod-*-yaml` variables** (upstream issues
[#606](https://github.com/thomasloven/lovelace-card-mod/issues/606) /
[#617](https://github.com/thomasloven/lovelace-card-mod/issues/617)). UIX is
actively developed and, per its own docs, a drop-in replacement for card-mod
up to 4.2.1 (all card-mod card and theme configurations are supported), so if
you're affected — or starting fresh — UIX is the safer choice.

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
- **card-mod → UIX:** nothing to do — UIX reads `card_mod:` natively, so
  deleting card-mod and installing UIX keeps every styled card working
  as-is. The first Studio edit of a card after the switch reads its
  `card_mod:` styling and rewrites it under `uix:` (verified by a
  permanent live check against a real UIX install).

## UIX-only dictionary keys

In card-mod's dictionary-form styles (the `$` shadow-piercing syntax), UIX
adds two extensions that card-mod can't run: **`$$`** (a recursive deep-search
"express" selector) and **`&`-prefixed host-filter keys**. The Studio never
generates them, but it **preserves them byte-for-byte** through every edit
(they're shown read-only in [Advanced CSS](Advanced-CSS#dictionary-form-styles-shadow-piercing)),
and — like macros and billets — they're treated as UIX-only: if card-mod is
the only engine installed, the panel warns instead of offering a "Copy to
card_mod" fix that couldn't work, and a `uix:` dictionary using them stays
under `uix:` rather than moving to `card_mod:`.

## Compatibility notes

- Generated CSS is identical for both engines and is verified against **real
  running instances** of each (card-mod 4.2.x and UIX 8.x in the project's
  Docker test rig) before every release.
- Since v0.8.0 the Studio also works around an engine-level gap in both:
  HA's newer schema-validated card editors rejected any card carrying a
  `card_mod:`/`uix:` key into YAML-only mode ("Key 'uix' is not expected").
  The Studio shims that validation so the visual editor keeps working.

# Language & Settings

*New in 1.0 (beta).*

Card Style Studio's own text — module names, labels, hints, warnings, the
CSS checks in Advanced CSS — comes in **22 languages**:

| | | | |
|---|---|---|---|
| English | Deutsch | Nederlands | Français |
| Español | Italiano | Polski | Português |
| Português (Brasil) | Svenska | Dansk | Norsk bokmål |
| Čeština | Slovenčina | Magyar | Suomi |
| Русский | Українська | 简体中文 | 繁體中文 |
| 日本語 | 한국어 | | |

English and German are written by hand. **The other 20 are machine
translations that no native speaker has read yet.** Each one uses Home
Assistant's own words wherever Home Assistant already has one (its own
translation of *entity*, *card*, *icon*, *background*, *opacity*, *features*
and so on, taken from Home Assistant's translation files), so the Studio
reads like the rest of Home Assistant in that language. If something reads
wrong, please [open an issue](https://github.com/DerTrolli/card-mod-studio/issues)
with the better wording.

## The one-time question

The first time you open the Studio, a short notice at the top of the panel
asks which language it should use:

- **Auto-detect (recommended)** is preselected. It follows the language Home
  Assistant shows for you (your profile's language). Regional variants find
  their language (de-CH → Deutsch, zh-TW → 繁體中文, pt-PT → Português,
  es-419 → Español, no/nn → Norsk bokmål); a language the Studio doesn't
  have falls back to English. The option names the language it picked,
  for example *Auto-detect: English (recommended)*.
- Any language in the list keeps the Studio in that language whatever Home
  Assistant uses.

Pick one and press **OK**. The notice doesn't block anything: you can style
the card while it's shown, and until you answer the Studio uses Auto-detect.

## Changing it later

Open the **⚙️ Settings** section (right below My Color Palette) and choose a
different **Language**. The panel switches at once; open sections stay open
and nothing you were editing is lost.

## Also in ⚙️ Settings *(v1.0.0-beta.2)*

- **Styles are written under** — which key the Studio writes: `uix:` when
  UIX is installed (UIX's own key; a card styled under `card_mod:` moves to
  `uix:` the next time you save it in the Studio), otherwise `card_mod:`
  (read by card-mod and by UIX).
- Whether the optional [integration](Integration) is installed: with it,
  that your administrator sets defaults for everyone; without it, for
  administrators, a link to how to install it.

## Where the choice is stored

Like presets and My Color Palette, the setting is stored **per Home
Assistant user**, so you're asked once, not once per phone, tablet or
browser. A copy is kept in the browser as well; if Home Assistant couldn't
be reached when you chose, the choice is sent to it later.

## Defaults for everyone (optional integration)

An administrator can set the language, whether users are asked, and the
default ON/OFF colours for the whole Home Assistant on **Settings → Devices &
services**, with the optional [Card Style Studio integration](Integration).
A user's own choice still wins.

## What isn't translated

- The **generated YAML and CSS** are the same in every language (they are
  code, read by card-mod or UIX).
- Names that come from Home Assistant or your setup — entity names, card
  names, theme variable names, your preset and palette names — appear as
  they are.
- The Style button's footer neighbours (Save, Cancel, …) are Home
  Assistant's own. On a phone with Home Assistant in a language with long
  words, Home Assistant's own footer labels can wrap; that's the same
  without the Studio.

## Better wording, or a new language

Corrections are welcome as issues or pull requests. A new language is
about 390 short messages; see
[`docs/DEVELOPMENT.md`](https://github.com/DerTrolli/card-mod-studio/blob/main/docs/DEVELOPMENT.md#translations)
for how a language is added and checked.

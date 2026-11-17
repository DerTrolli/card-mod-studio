# Language & Settings

*New in 0.12 (beta).*

Card-Mod Studio's own text — module names, labels, hints, warnings, the
CSS checks in Advanced CSS — is available in **English** and **German
(Deutsch)**.

## The one-time question

The first time you open the Studio, a short notice at the top of the panel
asks which language it should use:

- **Auto-detect (recommended)** is preselected. It follows the language Home
  Assistant shows for you (your profile's language): German if Home
  Assistant is in German (any variant, such as de-CH), otherwise English. The
  option names the language it picked, for example
  *Auto-detect: English (recommended)*.
- **English** or **Deutsch** keeps the Studio in that language whatever Home
  Assistant uses.

Pick one and press **OK**. The notice doesn't block anything: you can style
the card while it's shown, and until you answer the Studio uses Auto-detect.

## Changing it later

Open the **⚙️ Settings** section (right below My Color Palette) and choose a different **Language**. The panel switches at once;
open sections stay open and nothing you were editing is lost.

## Where the choice is stored

Like presets and My Color Palette, the setting is stored **per Home
Assistant user**, so you're asked once, not once per phone, tablet or
browser. A copy is kept in the browser as well; if Home Assistant couldn't
be reached when you chose, the choice is sent to it later.

## What isn't translated

- The **generated YAML and CSS** are the same in every language (they are
  code, read by card-mod or UIX).
- Names that come from Home Assistant or your setup — entity names, card
  names, theme variable names, your preset and palette names — appear as
  they are.
- The Style button's footer neighbours (Save, Cancel, …) are Home
  Assistant's own. On a phone with Home Assistant in German, Home
  Assistant's own footer labels are long enough to wrap; that's the same
  without the Studio.

## Other languages

Only English and German ship today. Dutch and other languages are welcome
as contributions: the whole Studio is about 350 short messages (around
1,500 words, 10–15 KB of text per language). See
[`docs/DEVELOPMENT.md`](https://github.com/DerTrolli/card-mod-studio/blob/main/docs/DEVELOPMENT.md#translations)
for how a language is added. A language is only shipped once a native
speaker has read it.

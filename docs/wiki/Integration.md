# Integration (Settings page)

*New in 1.0 (beta). Optional.*

Card-Mod Studio itself is a dashboard resource and needs nothing else. The
small **Card-Mod Studio integration** adds an entry under **Settings →
Devices & services**, where an administrator sets defaults for everyone on
this Home Assistant:

| Option | What it does |
|---|---|
| **Language** | The Studio's language for users who haven't chosen one: Auto-detect (each user's Home Assistant language) or any of the [22 languages](Language-and-Settings) |
| **Ask each user which language to use** | On: the one-time question appears the first time a user opens the Studio. Off: nobody is asked; the language above is used |
| **Default ON colour** / **Default OFF colour** | What a newly switched-on Icon Color, Accent Color or threshold rule starts with, as one of Home Assistant's named colours (red, pink, purple, blue, cyan, teal, green, yellow, orange, grey), or the Studio's own |

A user's own choice always wins: their ⚙️ Settings language and their
[My Color Palette](Presets-and-My-Color-Palette#my-color-palette) defaults.
A change applies at once to every open Studio, without a reload. The
options dialog is translated into the same 22 languages and follows the
administrator's Home Assistant language.

The integration keeps no entities and no data besides these options, and
can be removed at any time (the Studio then goes back to its own defaults).

## Install

HACS / the Marketplace installs Card-Mod Studio as a dashboard plugin and
can't add an integration from the same repository, so the integration is
installed by hand:

1. Download `card_mod_studio.zip` from the
   [latest release](https://github.com/DerTrolli/card-mod-studio/releases)
   (the same release as the Studio itself — keep the two on the same version).
2. Unzip it into your config folder so that you have
   `config/custom_components/card_mod_studio/manifest.json`.
3. Restart Home Assistant.
4. **Settings → Devices & services → + Add integration → Card-Mod Studio →
   Submit.** (Only one entry is allowed.)
5. On the entry, **Configure** opens the options.

Requires Home Assistant 2025.9 or newer, like the Studio. Tested with real
input on Home Assistant 2026.11.0 and 2025.9.4.

## Update or remove

- **Update:** replace the `card_mod_studio` folder with the one from the new
  release's zip and restart.
- **Remove:** delete the entry under Devices & services, then the folder,
  and restart.

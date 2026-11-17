"""Constants for the Card-Mod Studio integration."""

DOMAIN = "card_mod_studio"

CONF_LANGUAGE = "language"
CONF_ASK_LANGUAGE = "ask_language"
CONF_ON_COLOR = "on_color"
CONF_OFF_COLOR = "off_color"

#: "auto" follows the language Home Assistant shows each user. Keep in step
#: with LANGUAGES in src/i18n/index.ts.
LANGUAGE_OPTIONS = [
    "auto",
    "en",
    "de",
]

#: Home Assistant's named theme colours, as the Studio's colour picker offers
#: them ("default": the Studio's own). Sent to the Studio as var(--<name>-color).
COLOR_OPTIONS = [
    "default",
    "red",
    "pink",
    "purple",
    "blue",
    "cyan",
    "teal",
    "green",
    "yellow",
    "orange",
    "grey",
]

DEFAULT_OPTIONS = {
    CONF_LANGUAGE: "auto",
    CONF_ASK_LANGUAGE: True,
    CONF_ON_COLOR: "default",
    CONF_OFF_COLOR: "default",
}

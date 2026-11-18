"""Constants for the Card Style Studio integration."""

DOMAIN = "card_mod_studio"

#: The entry's title. Before 1.0.0-beta.2 the Studio was called Card-Mod
#: Studio; an entry still titled that is renamed when it is set up.
TITLE = "Card Style Studio"
OLD_TITLE = "Card-Mod Studio"

CONF_LANGUAGE = "language"
CONF_ASK_LANGUAGE = "ask_language"
CONF_ON_COLOR = "on_color"
CONF_OFF_COLOR = "off_color"

#: "auto" follows the language Home Assistant shows each user. Keep in step
#: with LANGUAGES in src/i18n/index.ts (lower case: Home Assistant only allows
#: lower-case option keys; the Studio maps them back, pt-br → pt-BR).
LANGUAGE_OPTIONS = [
    "auto",
    "en",
    "de",
    "nl",
    "fr",
    "es",
    "it",
    "pl",
    "pt",
    "pt-br",
    "sv",
    "da",
    "nb",
    "cs",
    "sk",
    "hu",
    "fi",
    "ru",
    "uk",
    "zh-hans",
    "zh-hant",
    "ja",
    "ko",
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

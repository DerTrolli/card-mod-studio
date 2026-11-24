"""Card Style Studio — settings for the Card Style Studio card editor.

The Studio itself is a frontend plugin (card-mod-studio.js). This optional
integration gives it an entry on Settings → Devices & services, whose options
are defaults for everyone on this Home Assistant: the Studio's language,
whether each user is asked which language they want, and the default ON/OFF
colours. A user's own choices in the Studio still win.

The Studio reads the options with the websocket command
``card_mod_studio/config`` and keeps them current with
``card_mod_studio/subscribe``, which pushes the new options to every open
browser when an admin changes them (any signed-in user may read them).
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import (
    CONF_ASK_LANGUAGE,
    CONF_LANGUAGE,
    CONF_OFF_COLOR,
    CONF_ON_COLOR,
    COLOR_OPTIONS,
    DEFAULT_OPTIONS,
    DOMAIN,
    OLD_TITLE,
    TITLE,
)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

#: Fired when the options change; open subscriptions resend the config.
EVENT_UPDATED = f"{DOMAIN}_updated"


def _color(name: Any) -> str | None:
    """A named theme colour → the CSS the Studio writes; 'default' → None."""
    if isinstance(name, str) and name in COLOR_OPTIONS and name != "default":
        return f"var(--{name}-color)"
    return None


def studio_config(hass: HomeAssistant) -> dict[str, Any]:
    """What the Studio gets: the options with defaults filled in."""
    entries = [e for e in hass.config_entries.async_entries(DOMAIN) if e.state is ConfigEntryState.LOADED]
    options: dict[str, Any] = {**DEFAULT_OPTIONS, **(entries[0].options if entries else {})}
    return {
        "configured": bool(entries),
        "language": options.get(CONF_LANGUAGE, "auto"),
        "ask_language": bool(options.get(CONF_ASK_LANGUAGE, True)),
        "on_color": _color(options.get(CONF_ON_COLOR)),
        "off_color": _color(options.get(CONF_OFF_COLOR)),
    }


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/config"})
@callback
def ws_config(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Send the Studio its instance-wide defaults."""
    connection.send_result(msg["id"], studio_config(hass))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/subscribe"})
@callback
def ws_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Send the config now and again after every change, until unsubscribed."""

    @callback
    def push(_event: Event | None = None) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], studio_config(hass)))

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(EVENT_UPDATED, push)
    connection.send_result(msg["id"])
    push()


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the websocket commands once."""
    websocket_api.async_register_command(hass, ws_config)
    websocket_api.async_register_command(hass, ws_subscribe)
    return True


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    hass.bus.async_fire(EVENT_UPDATED)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Tell open Studios about option changes."""
    # Renamed in 1.0.0-beta.2: an entry added under the old name shows the new
    # one (a title the user set themselves is left alone).
    if entry.title == OLD_TITLE:
        hass.config_entries.async_update_entry(entry, title=TITLE)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    hass.bus.async_fire(EVENT_UPDATED)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Open Studios fall back to their own defaults."""
    hass.bus.async_fire(EVENT_UPDATED)
    return True

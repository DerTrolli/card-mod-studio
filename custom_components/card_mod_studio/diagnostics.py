"""Diagnostics for Card-Mod Studio: the options as the Studio receives them."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import studio_config


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: ConfigEntry) -> dict[str, Any]:
    """Nothing secret is stored: the options and what the Studio is sent."""
    return {"options": dict(entry.options), "sent_to_studio": studio_config(hass)}

"""Config flow and options dialog for Card-Mod Studio."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    CONF_ASK_LANGUAGE,
    CONF_LANGUAGE,
    CONF_OFF_COLOR,
    CONF_ON_COLOR,
    COLOR_OPTIONS,
    DEFAULT_OPTIONS,
    DOMAIN,
    LANGUAGE_OPTIONS,
)


class CardModStudioConfigFlow(ConfigFlow, domain=DOMAIN):
    """One entry, no questions: everything is in the options."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title="Card-Mod Studio", data={}, options=dict(DEFAULT_OPTIONS))
        return self.async_show_form(step_id="user")

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return CardModStudioOptionsFlow()


class CardModStudioOptionsFlow(OptionsFlow):
    """The settings dialog (Configure)."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)

        current = {**DEFAULT_OPTIONS, **self.config_entry.options}
        schema: dict[Any, Any] = {
            vol.Required(CONF_LANGUAGE, default=current[CONF_LANGUAGE]): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=LANGUAGE_OPTIONS,
                    translation_key="language",
                    mode=selector.SelectSelectorMode.DROPDOWN,
                )
            ),
            vol.Required(CONF_ASK_LANGUAGE, default=current[CONF_ASK_LANGUAGE]): selector.BooleanSelector(),
        }
        for key in (CONF_ON_COLOR, CONF_OFF_COLOR):
            schema[vol.Required(key, default=current[key])] = selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=COLOR_OPTIONS,
                    translation_key="color",
                    mode=selector.SelectSelectorMode.DROPDOWN,
                )
            )
        return self.async_show_form(step_id="init", data_schema=vol.Schema(schema))

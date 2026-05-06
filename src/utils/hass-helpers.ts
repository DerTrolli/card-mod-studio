/**
 * Helpers for working with Home Assistant entity state.
 */

import type { HomeAssistant, HassEntity } from '../types/index.js';

/** Returns the entity state object or undefined if not found. */
export function getEntity(
  hass: HomeAssistant,
  entityId: string,
): HassEntity | undefined {
  return hass.states[entityId];
}

/** Returns the state string of an entity, e.g. 'on', 'off', 'unavailable'. */
export function getState(
  hass: HomeAssistant,
  entityId: string,
): string | undefined {
  return hass.states[entityId]?.state;
}

/** Returns true when the entity state matches the given value. */
export function isState(
  hass: HomeAssistant,
  entityId: string,
  state: string,
): boolean {
  return hass.states[entityId]?.state === state;
}

/** Returns a friendly name for the entity, falling back to its entity_id. */
export function friendlyName(
  hass: HomeAssistant,
  entityId: string,
): string {
  const name = hass.states[entityId]?.attributes?.friendly_name;
  return typeof name === 'string' ? name : entityId;
}

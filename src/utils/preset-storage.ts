/**
 * preset-storage.ts
 *
 * Cross-device preset storage for Card-Mod Studio.
 *
 * Primary:  HA per-user WebSocket storage via frontend/get_user_data +
 *           frontend/set_user_data. Data lives in HA's backend under
 *           .storage/frontend.user_data_<user_id>.json — accessible from
 *           any device logged in as the same HA user, no entity required.
 *
 * Fallback: browser localStorage (device-local, always written as a backup).
 */

import type { StudioState } from '../types/index.js';
import { migrateStudioState } from '../parser/state-mapper.js';

export interface StylePreset {
  name: string;
  state: StudioState;
}

/** Presets persist across app versions — every load path migrates each
 *  stored state to the current schema (see migrateStudioState) so a preset
 *  saved by an older version can't crash the panel. */
function migratePresets(presets: StylePreset[]): StylePreset[] {
  return presets
    .filter((p) => p && typeof p === 'object' && typeof p.name === 'string')
    .map((p) => ({ name: p.name, state: migrateStudioState(p.state) }));
}

interface HassConnection {
  sendMessagePromise(msg: Record<string, unknown>): Promise<unknown>;
}

interface HassSub {
  connection: HassConnection;
}

const HA_KEY = 'cms_presets';
const LS_KEY = 'cms-presets';

function hassAvailable(hass: HassSub | undefined): hass is HassSub {
  return !!hass?.connection?.sendMessagePromise;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load presets. Tries HA WebSocket storage first (cross-device); falls back
 * to localStorage. Returns [] if both fail or are empty.
 */
export async function loadPresets(hass: HassSub | undefined): Promise<StylePreset[]> {
  if (hassAvailable(hass)) {
    try {
      const result = await hass.connection.sendMessagePromise({
        type: 'frontend/get_user_data',
        key: HA_KEY,
      }) as { value: StylePreset[] | null } | null;
      const value = result?.value;
      if (Array.isArray(value)) return migratePresets(value);
    } catch (err) {
      console.warn('[Card-Mod Studio] Preset load from HA failed, using localStorage:', err);
    }
  }

  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as StylePreset[]) : [];
    return Array.isArray(parsed) ? migratePresets(parsed) : [];
  } catch {
    return [];
  }
}

/**
 * Save presets. Always writes localStorage immediately, then asynchronously
 * syncs to HA WebSocket storage if available.
 */
export async function savePresets(presets: StylePreset[], hass: HassSub | undefined): Promise<void> {
  // localStorage — instant, no async risk
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(presets));
  } catch {
    // quota exceeded — silently continue
  }

  // HA WebSocket — cross-device sync
  if (hassAvailable(hass)) {
    try {
      await hass.connection.sendMessagePromise({
        type: 'frontend/set_user_data',
        key: HA_KEY,
        value: presets,
      });
    } catch (err) {
      console.warn('[Card-Mod Studio] Preset sync to HA failed (saved to localStorage only):', err);
    }
  }
}

/** One change a panel makes to the stored list. */
export type PresetChange =
  | { kind: 'save'; preset: StylePreset }
  | { kind: 'delete'; name: string };

/** Pure: the list after one change (save adds, or overwrites by name). */
export function applyPresetChange(list: StylePreset[], change: PresetChange): StylePreset[] {
  const name = change.kind === 'save' ? change.preset.name : change.name;
  const without = list.filter((p) => p.name !== name);
  return change.kind === 'save' ? [...without, change.preset] : without;
}

// Changes from one page run one after another: two quick ones would each
// read the same stored list and the later write would drop the earlier.
let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * Applies ONE change to the list as currently stored and writes it back.
 * The panel's in-memory list can be stale (another browser saved since it
 * loaded) — writing that whole list back lost the other browser's presets.
 * Resolves with the list that was written, for the panel to show.
 */
export function updatePresets(change: PresetChange, hass: HassSub | undefined): Promise<StylePreset[]> {
  const run = async (): Promise<StylePreset[]> => {
    const next = applyPresetChange(await loadPresets(hass), change);
    await savePresets(next, hass);
    return next;
  };
  const result = writeQueue.then(run, run);
  writeQueue = result.catch(() => undefined);
  return result;
}

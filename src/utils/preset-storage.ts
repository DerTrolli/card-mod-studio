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
/** Changes made while Home Assistant could not be read or written. */
const LS_UNSYNCED = 'cms-presets-unsynced';

function hassAvailable(hass: HassSub | undefined): hass is HassSub {
  return !!hass?.connection?.sendMessagePromise;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** A read that also says whether Home Assistant was asked and failed. */
async function readPresets(hass: HassSub | undefined): Promise<{ list: StylePreset[]; readFailed: boolean }> {
  let readFailed = false;
  if (hassAvailable(hass)) {
    try {
      const result = await hass.connection.sendMessagePromise({
        type: 'frontend/get_user_data',
        key: HA_KEY,
      }) as { value: StylePreset[] | null } | null;
      const value = result?.value;
      if (Array.isArray(value)) return { list: migratePresets(value), readFailed };
    } catch (err) {
      readFailed = true;
      console.warn('[Card-Mod Studio] Preset load from HA failed, using localStorage:', err);
    }
  }

  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as StylePreset[]) : [];
    return { list: Array.isArray(parsed) ? migratePresets(parsed) : [], readFailed };
  } catch {
    return { list: [], readFailed };
  }
}

/**
 * Load presets. Tries HA WebSocket storage first (cross-device); falls back
 * to localStorage. Returns [] if both fail or are empty. The first
 * successful Home Assistant read after an outage also replays the changes
 * made meanwhile (see `updatePresets`) and writes the result back.
 */
export function loadPresets(hass: HassSub | undefined): Promise<StylePreset[]> {
  if (!hassAvailable(hass) || readUnsynced().length === 0) return readPresets(hass).then((r) => r.list);
  const run = async (): Promise<StylePreset[]> => {
    const { list, readFailed } = await readPresets(hass);
    const backlog = readUnsynced();
    if (readFailed || backlog.length === 0) return list;
    const merged = backlog.reduce(applyPresetChange, list);
    if (await savePresets(merged, hass)) writeUnsynced([]);
    return merged;
  };
  const result = writeQueue.then(run, run);
  writeQueue = result.catch(() => undefined);
  return result;
}

function readUnsynced(): PresetChange[] {
  try {
    const raw = localStorage.getItem(LS_UNSYNCED);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as PresetChange[]).filter((c) => c && (c.kind === 'save' || c.kind === 'delete')) : [];
  } catch {
    return [];
  }
}

function writeUnsynced(changes: PresetChange[]): void {
  try {
    localStorage.setItem(LS_UNSYNCED, JSON.stringify(changes));
  } catch {
    // quota exceeded — the change still sits in the device list
  }
}

/**
 * Save presets. Always writes localStorage immediately, then asynchronously
 * syncs to HA WebSocket storage if available. Resolves false when HA was
 * asked and the write failed (the list is then on this device only).
 */
export async function savePresets(presets: StylePreset[], hass: HassSub | undefined): Promise<boolean> {
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
      return false;
    }
  }
  return true;
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
 *
 * If Home Assistant could not be read, the list in hand is only this
 * browser's older copy: the change is kept on this device and NOT written to
 * Home Assistant (that would replace the real list with the old copy).
 * `onSync(false)` says the change is on this device only (read or write
 * failed); `onSync(true)` that it reached Home Assistant. Not called when
 * there is no Home Assistant connection to sync with.
 */
export function updatePresets(
  change: PresetChange,
  hass: HassSub | undefined,
  onSync?: (reachedHa: boolean) => void,
): Promise<StylePreset[]> {
  const run = async (): Promise<StylePreset[]> => {
    const { list, readFailed } = await readPresets(hass);
    // Earlier changes that never reached Home Assistant go back on top of
    // what it holds now, then this one. A name saved both here during the
    // outage and elsewhere keeps the version saved here (applied last); a
    // delete made during the outage stays deleted.
    const backlog = hassAvailable(hass) && !readFailed ? readUnsynced() : [];
    const next = applyPresetChange(backlog.reduce(applyPresetChange, list), change);
    const wrote = await savePresets(next, readFailed ? undefined : hass);
    if (hassAvailable(hass)) {
      const reached = !readFailed && wrote;
      writeUnsynced(reached ? [] : [...(readFailed ? readUnsynced() : backlog), change]);
      onSync?.(reached);
    }
    return next;
  };
  const result = writeQueue.then(run, run);
  writeQueue = result.catch(() => undefined);
  return result;
}

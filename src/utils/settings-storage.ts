/**
 * settings-storage.ts — the Studio's own settings (for now: its language).
 *
 * Stored like the palette and presets: Home Assistant's per-user storage
 * (frontend/get_user_data / set_user_data — the same on every device the user
 * signs in on) with localStorage as the always-written copy for when Home
 * Assistant can't be reached. Each copy carries `updatedAt`; the newer wins,
 * so a choice made while Home Assistant was unreachable is not lost.
 *
 * Applying the settings is immediate: the cache updates, the language layer
 * switches, and SETTINGS_CHANGED_EVENT tells open views.
 */
import { isLanguageSetting, setLanguageSetting, type LanguageSetting } from '../i18n/index.js';

export interface StudioSettings {
  /** 'auto' follows the language Home Assistant shows for this user. */
  language: LanguageSetting;
  /** The user confirmed a language (the first-run notice stays away). */
  languageChosen: boolean;
  /** ms since epoch of the last change; 0 = never changed. */
  updatedAt: number;
}

export const SETTINGS_CHANGED_EVENT = 'cms-settings-changed';

const HA_KEY = 'cms_settings';
const LS_KEY = 'cms-settings';

export const DEFAULT_SETTINGS: StudioSettings = { language: 'auto', languageChosen: false, updatedAt: 0 };

interface HassSub {
  connection?: { sendMessagePromise(msg: Record<string, unknown>): Promise<unknown> };
}

function sanitize(raw: unknown): StudioSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const o = raw as Partial<StudioSettings>;
  return {
    language: isLanguageSetting(o.language) ? o.language : 'auto',
    languageChosen: o.languageChosen === true,
    updatedAt: typeof o.updatedAt === 'number' && Number.isFinite(o.updatedAt) ? o.updatedAt : 0,
  };
}

let cache: StudioSettings = { ...DEFAULT_SETTINGS };
let loadedLocal = false;
let loadedFromHa = false;
/** The last attempt to read Home Assistant's copy failed (this device's copy is all there is). */
let haFailed = false;
let haLoad: Promise<void> | null = null;

function apply(next: StudioSettings, notify = true): void {
  cache = next;
  setLanguageSetting(next.language);
  if (notify && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
}

function readLocal(): StudioSettings | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(s: StudioSettings): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    // storage full or blocked: Home Assistant still has it
  }
}

export function getSettings(): StudioSettings {
  if (!loadedLocal) {
    loadedLocal = true;
    const local = readLocal();
    if (local) apply(local, false);
  }
  return cache;
}

/**
 * Loads the settings: the local copy at once, Home Assistant's once `hass`
 * is there (once per page). Safe to call on every render.
 */
export function initSettings(hass: HassSub | undefined): Promise<void> {
  getSettings();
  const conn = hass?.connection;
  if (!conn?.sendMessagePromise || loadedFromHa) return haLoad ?? Promise.resolve();
  if (haLoad) return haLoad;
  haLoad = (async () => {
    try {
      const result = (await conn.sendMessagePromise({ type: 'frontend/get_user_data', key: HA_KEY })) as
        | { value?: unknown }
        | null;
      loadedFromHa = true;
      const remote = result?.value ? sanitize(result.value) : null;
      const local = cache;
      if (remote && remote.updatedAt >= local.updatedAt) {
        writeLocal(remote);
        if (JSON.stringify(remote) !== JSON.stringify(local)) apply(remote);
      } else if (local.updatedAt > (remote?.updatedAt ?? 0)) {
        // Chosen while Home Assistant was unreachable: bring it up to date.
        await conn.sendMessagePromise({ type: 'frontend/set_user_data', key: HA_KEY, value: local });
      }
    } catch (err) {
      haFailed = true;
      console.warn('[Card-Mod Studio] Settings load from HA failed, using this device:', err);
    } finally {
      haLoad = null;
      // Settled either way: views waiting on Home Assistant's copy re-render.
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
    }
  })();
  return haLoad;
}

/**
 * True once the settings are as good as they get on this page: Home
 * Assistant's copy was read (or reading it failed), or there is no
 * connection to read it from. Until then a choice stored on another device
 * may still arrive — the one-time question waits for it.
 */
export function settingsSettled(hass: HassSub | undefined): boolean {
  if (!hass?.connection?.sendMessagePromise) return true;
  return loadedFromHa || haFailed;
}

/** Changes settings: applied at once, saved here and to Home Assistant. */
export async function updateSettings(change: Partial<Omit<StudioSettings, 'updatedAt'>>, hass: HassSub | undefined): Promise<void> {
  const next = sanitize({ ...getSettings(), ...change, updatedAt: Date.now() });
  apply(next);
  writeLocal(next);
  const conn = hass?.connection;
  if (!conn?.sendMessagePromise) return;
  try {
    await conn.sendMessagePromise({ type: 'frontend/set_user_data', key: HA_KEY, value: next });
  } catch (err) {
    console.warn('[Card-Mod Studio] Settings sync to HA failed (saved on this device only):', err);
  }
}

/** Test helper. */
export function resetSettingsForTests(): void {
  cache = { ...DEFAULT_SETTINGS };
  loadedLocal = false;
  loadedFromHa = false;
  haFailed = false;
  haLoad = null;
  setLanguageSetting('auto');
}

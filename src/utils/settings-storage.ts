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
 *
 * Site defaults (v0.12): the optional Card-Mod Studio integration (Settings →
 * Devices & services) holds defaults for everyone on this Home Assistant —
 * the language, whether each user is asked, the default ON/OFF colours. They
 * arrive over the websocket subscription `card_mod_studio/subscribe` (pushed
 * again whenever an admin changes them), only when Home Assistant lists the
 * integration as loaded. Precedence: the user's own choice → the site
 * default → Auto-detect.
 */
import { isLanguageSetting, setLanguageSetting, toLanguageSetting, type LanguageSetting } from '../i18n/index.js';
import { PALETTE_CHANGED_EVENT, setSiteColorDefaults } from './palette-storage.js';

export interface StudioSettings {
  /** 'auto' follows the language Home Assistant shows for this user. */
  language: LanguageSetting;
  /** The user confirmed a language (the first-run notice stays away). */
  languageChosen: boolean;
  /** ms since epoch of the last change; 0 = never changed. */
  updatedAt: number;
}

export const SETTINGS_CHANGED_EVENT = 'cms-settings-changed';

/** Defaults an admin set in the integration's options (absent: not installed). */
export interface SiteDefaults {
  language: LanguageSetting;
  askLanguage: boolean;
  /** CSS colour (`var(--green-color)`) or undefined for the Studio's own. */
  onColor?: string;
  offColor?: string;
}

const INTEGRATION = 'card_mod_studio';

const HA_KEY = 'cms_settings';
const LS_KEY = 'cms-settings';

export const DEFAULT_SETTINGS: StudioSettings = { language: 'auto', languageChosen: false, updatedAt: 0 };

interface HassSub {
  connection?: {
    sendMessagePromise(msg: Record<string, unknown>): Promise<unknown>;
    subscribeMessage?(cb: (msg: unknown) => void, msg: Record<string, unknown>): Promise<() => void>;
  };
  config?: { components?: string[] };
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
let site: SiteDefaults | null = null;
/** The integration's first answer arrived (or subscribing failed). */
let siteReceived = false;
let siteSubscribed = false;

function integrationLoaded(hass: HassSub | undefined): boolean {
  return !!hass?.config?.components?.includes(INTEGRATION);
}

/** The language setting in force: the user's choice, else the site default, else auto. */
export function effectiveLanguageSetting(s: StudioSettings = cache): LanguageSetting {
  return s.languageChosen ? s.language : (site?.language ?? 'auto');
}

/** The integration's defaults, or null when it isn't installed / hasn't answered. */
export function getSiteDefaults(): SiteDefaults | null {
  return site;
}

/** Whether the one-time question should be asked at all (the admin may turn it off). */
export function askLanguage(): boolean {
  return site?.askLanguage !== false;
}

function sanitizeSite(raw: unknown): SiteDefaults | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.configured !== true) return null;
  const color = (v: unknown) => (typeof v === 'string' && /^var\(--[a-z-]+-color\)$/.test(v) ? v : undefined);
  return {
    language: toLanguageSetting(o.language) ?? 'auto',
    askLanguage: o.ask_language !== false,
    onColor: color(o.on_color),
    offColor: color(o.off_color),
  };
}

/** Test helper / subscription callback: new site defaults arrived. */
export function applySiteDefaults(raw: unknown): void {
  const next = sanitizeSite(raw);
  const changed = JSON.stringify(next) !== JSON.stringify(site);
  site = next;
  siteReceived = true;
  setLanguageSetting(effectiveLanguageSetting());
  const colorsChanged = setSiteColorDefaults({ onColor: next?.onColor, offColor: next?.offColor });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
    if (changed) window.dispatchEvent(new CustomEvent(SITE_DEFAULTS_CHANGED_EVENT));
    // Open modules re-read their starting colours like after a palette edit.
    if (colorsChanged) window.dispatchEvent(new CustomEvent(PALETTE_CHANGED_EVENT));
  }
}

/** Fired when the integration's defaults change (palette defaults follow). */
export const SITE_DEFAULTS_CHANGED_EVENT = 'cms-site-defaults-changed';

function subscribeSite(hass: HassSub | undefined): void {
  if (siteSubscribed || !integrationLoaded(hass)) return;
  const conn = hass?.connection;
  if (!conn?.subscribeMessage) return;
  siteSubscribed = true;
  conn.subscribeMessage((msg) => applySiteDefaults(msg), { type: `${INTEGRATION}/subscribe` }).catch((err) => {
    console.warn('[Card-Mod Studio] Could not read the integration settings:', err);
    siteReceived = true;
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
  });
}
let loadedLocal = false;
let loadedFromHa = false;
/** The last attempt to read Home Assistant's copy failed (this device's copy is all there is). */
let haFailed = false;
let haLoad: Promise<void> | null = null;

function apply(next: StudioSettings, notify = true): void {
  cache = next;
  setLanguageSetting(effectiveLanguageSetting(next));
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
  subscribeSite(hass);
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
  if (haLoad) return false; // a read started elsewhere is still on its way
  // The admin may have turned the question off or chosen a language: wait for it.
  if (integrationLoaded(hass) && !siteReceived) return false;
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
  site = null;
  setSiteColorDefaults({});
  siteReceived = false;
  siteSubscribed = false;
  setLanguageSetting('auto');
}

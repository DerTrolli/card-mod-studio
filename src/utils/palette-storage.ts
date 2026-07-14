/**
 * palette-storage.ts — the Color Palette Manager's persistence + cache.
 *
 * Custom colors the user defines once and then picks from every
 * cms-color-picker, plus overrides for the built-in module defaults (what
 * a freshly-enabled Icon/Accent Color module starts with for ON and OFF).
 *
 * Storage mirrors preset-storage.ts: HA per-user WebSocket storage
 * (frontend/get_user_data / set_user_data — cross-device, per HA user)
 * with localStorage as the always-written fallback.
 *
 * Unlike presets (loaded on demand by the panel), the palette is read
 * synchronously in hot paths — every color-picker popover render and every
 * buildMergedStudioState call — so this module keeps an in-memory cache,
 * primed once via initPaletteCache() when the panel first sees `hass`.
 * Writers update the cache first and broadcast PALETTE_CHANGED_EVENT so
 * open pickers re-render.
 */

export interface CustomColor {
  id: string;
  name: string;
  hex: string;
}

export interface PaletteDefaults {
  /** Overrides DEFAULT_ICON_COLOR/DEFAULT_ACCENT_COLOR's colorOn for freshly-enabled modules. */
  onColor?: string;
  /** Same for colorOff — "what 'off' defaults to". */
  offColor?: string;
}

export interface CustomPalette {
  colors: CustomColor[];
  defaults: PaletteDefaults;
}

export const PALETTE_CHANGED_EVENT = 'cms-palette-changed';

const HA_KEY = 'cms_palette';
const LS_KEY = 'cms-palette';

const EMPTY_PALETTE: CustomPalette = { colors: [], defaults: {} };

interface HassConnection {
  sendMessagePromise(msg: Record<string, unknown>): Promise<unknown>;
}

interface HassSub {
  connection: HassConnection;
}

function hassAvailable(hass: HassSub | undefined): hass is HassSub {
  return !!hass?.connection?.sendMessagePromise;
}

function sanitize(raw: unknown): CustomPalette {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PALETTE };
  const obj = raw as Partial<CustomPalette>;
  const colors = Array.isArray(obj.colors)
    ? obj.colors.filter(
        (c): c is CustomColor =>
          !!c && typeof c === 'object' && typeof c.id === 'string' &&
          typeof c.name === 'string' && typeof c.hex === 'string',
      )
    : [];
  const defaults: PaletteDefaults = {};
  if (obj.defaults && typeof obj.defaults === 'object') {
    if (typeof obj.defaults.onColor === 'string' && obj.defaults.onColor) defaults.onColor = obj.defaults.onColor;
    if (typeof obj.defaults.offColor === 'string' && obj.defaults.offColor) defaults.offColor = obj.defaults.offColor;
  }
  return { colors, defaults };
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let cache: CustomPalette = { ...EMPTY_PALETTE };
let initPromise: Promise<void> | null = null;

/** Synchronous read for hot paths (picker renders, state building). Returns
 *  the empty palette until initPaletteCache has completed. */
export function getCachedPalette(): CustomPalette {
  return cache;
}

/** Primes the cache from storage once; subsequent calls are no-ops (the
 *  cache is then kept current by savePalette). Safe to call repeatedly. */
export function initPaletteCache(hass: HassSub | undefined): Promise<void> {
  initPromise ??= (async () => {
    cache = await loadPalette(hass);
    window.dispatchEvent(new CustomEvent(PALETTE_CHANGED_EVENT));
  })();
  return initPromise;
}

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

export async function loadPalette(hass: HassSub | undefined): Promise<CustomPalette> {
  if (hassAvailable(hass)) {
    try {
      const result = (await hass.connection.sendMessagePromise({
        type: 'frontend/get_user_data',
        key: HA_KEY,
      })) as { value: unknown } | null;
      if (result?.value) return sanitize(result.value);
    } catch (err) {
      console.warn('[Card-Mod Studio] Palette load from HA failed, using localStorage:', err);
    }
  }

  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? sanitize(JSON.parse(raw)) : { ...EMPTY_PALETTE };
  } catch {
    return { ...EMPTY_PALETTE };
  }
}

/** Updates the cache immediately (and notifies listeners), then persists —
 *  localStorage synchronously, HA WebSocket storage best-effort. */
export async function savePalette(palette: CustomPalette, hass: HassSub | undefined): Promise<void> {
  cache = sanitize(palette);
  window.dispatchEvent(new CustomEvent(PALETTE_CHANGED_EVENT));

  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cache));
  } catch {
    // quota exceeded — silently continue
  }

  if (hassAvailable(hass)) {
    try {
      await hass.connection.sendMessagePromise({
        type: 'frontend/set_user_data',
        key: HA_KEY,
        value: cache,
      });
    } catch (err) {
      console.warn('[Card-Mod Studio] Palette sync to HA failed (saved to localStorage only):', err);
    }
  }
}

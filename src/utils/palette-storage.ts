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
/** True once any save has written the cache. From that point the in-memory
 *  palette is strictly newer than whatever a still-in-flight init load will
 *  resolve with, so initPaletteCache must not assign over it — doing so
 *  would revert the cache to the pre-save palette, and the NEXT save would
 *  then persist that stale palette (permanent loss of the first save). */
let cacheDirty = false;

/** Synchronous read for hot paths (picker renders, state building). Returns
 *  the empty palette until initPaletteCache has completed. */
export function getCachedPalette(): CustomPalette {
  return cache;
}

/** Primes the cache from storage once; subsequent calls are no-ops (the
 *  cache is then kept current by savePalette). Safe to call repeatedly. */
export function initPaletteCache(hass: HassSub | undefined): Promise<void> {
  initPromise ??= (async () => {
    const loaded = await loadPalette(hass);
    // A savePalette that landed while the load was in flight already put
    // newer data in the cache (and persisted it) — keep it. Assigning the
    // just-loaded palette here would clobber that save with stale data.
    if (cacheDirty) return;
    cache = loaded;
    window.dispatchEvent(new CustomEvent(PALETTE_CHANGED_EVENT));
  })();
  return initPromise;
}

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

/** A read that also says whether Home Assistant was asked and failed. */
async function readPalette(hass: HassSub | undefined): Promise<{ palette: CustomPalette; readFailed: boolean }> {
  let readFailed = false;
  if (hassAvailable(hass)) {
    try {
      const result = (await hass.connection.sendMessagePromise({
        type: 'frontend/get_user_data',
        key: HA_KEY,
      })) as { value: unknown } | null;
      if (result?.value) return { palette: sanitize(result.value), readFailed };
    } catch (err) {
      readFailed = true;
      console.warn('[Card-Mod Studio] Palette load from HA failed, using localStorage:', err);
    }
  }

  try {
    const raw = localStorage.getItem(LS_KEY);
    return { palette: raw ? sanitize(JSON.parse(raw)) : { ...EMPTY_PALETTE }, readFailed };
  } catch {
    return { palette: { ...EMPTY_PALETTE }, readFailed };
  }
}

export async function loadPalette(hass: HassSub | undefined): Promise<CustomPalette> {
  return (await readPalette(hass)).palette;
}

/** Updates the cache immediately (and notifies listeners), then persists —
 *  localStorage synchronously, HA WebSocket storage best-effort. */
export async function savePalette(palette: CustomPalette, hass: HassSub | undefined): Promise<void> {
  cache = sanitize(palette);
  cacheDirty = true;
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

/** One change to the palette. Must be idempotent (it can run twice: once on
 *  the local copy right away, once on the freshly re-read stored palette). */
export type PaletteEdit = (palette: CustomPalette) => CustomPalette;

let pendingUpdates = 0;
/** Changes that are on this device only because Home Assistant could not be
 *  read (or written) when they were made. They are applied again, in order,
 *  to the next palette that is read successfully. */
let unsynced: PaletteEdit[] = [];
// One write after another: two quick ones would each read the same stored
// palette and the later write would drop the earlier.
let writeQueue: Promise<unknown> = Promise.resolve();

function storeLocal(palette: CustomPalette): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(palette));
  } catch {
    // quota exceeded — silently continue
  }
}

/**
 * Applies ONE change to the palette as currently stored and writes it back.
 * The in-memory cache can be stale (another browser edited since it loaded),
 * and writing the whole cached palette back overwrote that edit. The change
 * also shows and is kept locally at once, so the UI is instant and a page
 * unload right after still has it. Resolves with the palette written.
 *
 * If Home Assistant could not be read, what is in hand is only this
 * browser's older copy: the change stays on this device and is NOT written
 * to Home Assistant (that would replace the real palette with the old copy,
 * dropping colours added elsewhere). It is retried with the next successful
 * read. A failed write is retried the same way.
 */
export function updatePalette(edit: PaletteEdit, hass: HassSub | undefined): Promise<CustomPalette> {
  cache = sanitize(edit(cache));
  cacheDirty = true;
  storeLocal(cache);
  window.dispatchEvent(new CustomEvent(PALETTE_CHANGED_EVENT));

  pendingUpdates++;
  const run = async (): Promise<CustomPalette> => {
    let next: CustomPalette;
    try {
      const { palette, readFailed } = await readPalette(hass);
      if (readFailed) {
        unsynced.push(edit);
        next = sanitize(edit(palette));
        storeLocal(next);
      } else {
        const backlog = unsynced;
        next = sanitize([...backlog, edit].reduce((p, e) => e(p), palette));
        storeLocal(next);
        if (hassAvailable(hass)) {
          try {
            await hass.connection.sendMessagePromise({ type: 'frontend/set_user_data', key: HA_KEY, value: next });
            unsynced = [];
          } catch (err) {
            unsynced = [...backlog, edit];
            console.warn('[Card-Mod Studio] Palette sync to HA failed (saved to localStorage only):', err);
          }
        }
      }
    } finally {
      pendingUpdates--;
    }
    // A later change already showed itself in the cache; its own run refreshes it.
    if (pendingUpdates === 0) {
      cache = next;
      window.dispatchEvent(new CustomEvent(PALETTE_CHANGED_EVENT));
    }
    return next;
  };
  const result = writeQueue.then(run, run);
  writeQueue = result.catch(() => undefined);
  return result;
}

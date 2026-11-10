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
/** Changes made while Home Assistant could not be read or written. */
const LS_UNSYNCED = 'cms-palette-unsynced';

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

/** Whether the one-shot init ran against Home Assistant. The panel first
 *  calls it before `hass` exists (local copy only); the call that brings
 *  `hass` must still do the real read, and replay what an earlier outage left. */
let initWithHass = false;

/** Primes the cache from storage once (again when `hass` first shows up);
 *  after that the cache is kept current by the writers. Safe to call
 *  repeatedly. Edits kept from an outage are replayed onto the palette read
 *  from Home Assistant here, not only on the next edit. */
export function initPaletteCache(hass: HassSub | undefined): Promise<void> {
  if (initPromise && (initWithHass || !hassAvailable(hass))) return initPromise;
  initWithHass = hassAvailable(hass);
  initPromise = (async () => {
    // Only when there is something to replay: queued behind running writes,
    // so the replay and a writer's own replay never interleave.
    let loaded: CustomPalette;
    let replayed = false;
    if (initWithHass && readUnsynced().length > 0) {
      replayed = true;
      const task = writeQueue.then(() => replayBacklog(hass), () => replayBacklog(hass));
      writeQueue = task.then(() => undefined, () => undefined);
      loaded = await task;
    } else {
      loaded = await loadPalette(hass);
    }
    // A savePalette that landed while the load was in flight already put
    // newer data in the cache (and persisted it) — keep it. Assigning the
    // just-loaded palette here would clobber that save with stale data.
    // Edits still kept after a read/write that failed: let the next call
    // (the panel calls this whenever it gets `hass`) try the replay again.
    if (initWithHass && readUnsynced().length > 0) initPromise = null;
    // The replay ran behind every write, so with none pending its result holds
    // this page's own edits too (kept ones included) and is the newer copy:
    // edits made before `hass` existed set cacheDirty but the cache then lacks
    // what Home Assistant holds.
    if (cacheDirty && !(replayed && pendingUpdates === 0)) return;
    cache = loaded;
    window.dispatchEvent(new CustomEvent(PALETTE_CHANGED_EVENT));
  })();
  return initPromise;
}

/** Reads Home Assistant, puts the kept edits on top and writes it back. */
async function replayBacklog(hass: HassSub | undefined): Promise<CustomPalette> {
  const { palette, readFailed } = await readPalette(hass);
  const backlog = readUnsynced();
  if (readFailed || backlog.length === 0) return palette;
  const next = sanitize(backlog.reduce(applyPaletteEdit, palette));
  storeLocal(next);
  if (hassAvailable(hass)) {
    try {
      writing++;
      try {
        await hass.connection.sendMessagePromise({ type: 'frontend/set_user_data', key: HA_KEY, value: next });
      } finally {
        writing--;
      }
      writeUnsynced(flushed ? inFlight : []);
    } catch (err) {
      console.warn('[Card-Mod Studio] Palette sync to HA failed (saved to localStorage only):', err);
    }
  }
  return next;
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

/** One change to the palette, as DATA so the ones that could not be synced
 *  can be kept in localStorage and replayed after a reload. Each is
 *  idempotent (it can run twice: once on the local copy right away, once on
 *  the freshly re-read stored palette, and again from the kept list). */
export type PaletteEdit =
  | { kind: 'add'; color: CustomColor }
  | { kind: 'remove'; id: string }
  | { kind: 'set'; id: string; field: 'hex' | 'name'; value: string }
  | { kind: 'default'; key: 'onColor' | 'offColor'; value?: string };

export function applyPaletteEdit(p: CustomPalette, e: PaletteEdit): CustomPalette {
  switch (e.kind) {
    case 'add':
      return p.colors.some((c) => c.id === e.color.id) ? p : { ...p, colors: [...p.colors, e.color] };
    case 'remove':
      return { ...p, colors: p.colors.filter((c) => c.id !== e.id) };
    case 'set':
      return { ...p, colors: p.colors.map((c) => (c.id === e.id ? { ...c, [e.field]: e.value } : c)) };
    case 'default': {
      const defaults = { ...p.defaults };
      if (e.value) defaults[e.key] = e.value;
      else delete defaults[e.key];
      return { ...p, defaults };
    }
  }
}

const isStr = (x: unknown): x is string => typeof x === 'string';

/** An edit read back from storage, or null when its shape is wrong (never throws). */
function validEdit(raw: unknown): PaletteEdit | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const c = e.color as Record<string, unknown> | null | undefined;
  switch (e.kind) {
    case 'add':
      return c && typeof c === 'object' && isStr(c.id) && isStr(c.name) && isStr(c.hex)
        ? { kind: 'add', color: { id: c.id, name: c.name, hex: c.hex } }
        : null;
    case 'remove':
      return isStr(e.id) ? { kind: 'remove', id: e.id } : null;
    case 'set':
      return isStr(e.id) && (e.field === 'hex' || e.field === 'name') && isStr(e.value)
        ? { kind: 'set', id: e.id, field: e.field, value: e.value }
        : null;
    case 'default':
      return (e.key === 'onColor' || e.key === 'offColor') && (e.value === undefined || isStr(e.value))
        ? { kind: 'default', key: e.key, ...(e.value === undefined ? {} : { value: e.value }) }
        : null;
    default:
      return null;
  }
}

/** What an edit changes: a later edit of the same target replaces it. */
const targetOf = (e: PaletteEdit) =>
  e.kind === 'set' ? `set:${e.id}:${e.field}` : e.kind === 'default' ? `default:${e.key}` : null;

/** Repeated changes of one field keep only the last (rapid renames of a
 *  colour would otherwise pile up in storage). */
function compact(list: PaletteEdit[]): PaletteEdit[] {
  return list.filter((e, i) => {
    const t = targetOf(e);
    return t === null || !list.slice(i + 1).some((l) => targetOf(l) === t);
  });
}

const sameEdit = (a: PaletteEdit, b: PaletteEdit) => JSON.stringify(a) === JSON.stringify(b);

/** Set while the list could not be written to localStorage (quota): the
 *  in-memory copy is then the only one and wins over what is stored. */
let memUnsynced: PaletteEdit[] | null = null;

/** Changes that are on this device only: Home Assistant could not be read
 *  or written when they were made (or the page left before they were).
 *  Persisted, so they survive a reload; applied again, in order, to the next
 *  palette that is read successfully; cleared only after a successful write. */
function readUnsynced(): PaletteEdit[] {
  if (memUnsynced) return memUnsynced;
  try {
    const raw = localStorage.getItem(LS_UNSYNCED);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(validEdit).filter((e): e is PaletteEdit => e !== null) : [];
  } catch {
    return [];
  }
}

/** False when the list could not be persisted (it is then kept in memory). */
function writeUnsynced(list: PaletteEdit[]): boolean {
  const next = compact(list);
  try {
    localStorage.setItem(LS_UNSYNCED, JSON.stringify(next));
    memUnsynced = null;
    return true;
  } catch {
    memUnsynced = next; // quota exceeded: kept for this page's lifetime
    return false;
  }
}

let pendingUpdates = 0;
/** Updates whose read of Home Assistant has started and not finished. */
let reading = 0;
/** Writes to Home Assistant that have been sent and not answered. A page
 *  that leaves meanwhile must not send its cache read-less on top of one. */
let writing = 0;
/** Changes of updates that have not finished. Only written to the kept list
 *  when the page is hidden or leaving (see flushPaletteOnUnload). */
let inFlight: PaletteEdit[] = [];
/** inFlight is currently part of the kept list. */
let flushed = false;
// One write after another: two quick ones would each read the same stored
// palette and the later write would drop the earlier.
let writeQueue: Promise<unknown> = Promise.resolve();

/** False when the browser refused the write (quota); the palette then only
 *  lives in memory unless Home Assistant or the kept list has it. */
function storeLocal(palette: CustomPalette): boolean {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(palette));
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies change(s) to the palette as currently stored and writes it back.
 * The in-memory cache can be stale (another browser edited since it loaded),
 * and writing the whole cached palette back overwrote that edit. The change
 * also shows and is kept locally at once, so the UI is instant and a page
 * unload right after still has it. Resolves with the palette written.
 *
 * If Home Assistant could not be read, what is in hand is only this
 * browser's older copy: the change stays on this device and is NOT written
 * to Home Assistant (that would replace the real palette with the old copy,
 * dropping colours added elsewhere). It is kept in localStorage and replayed
 * with the next successful read — in this page or after a reload. A failed
 * write is retried the same way.
 */
export function updatePalette(
  change: PaletteEdit | PaletteEdit[],
  hass: HassSub | undefined,
  onSync?: (reachedHa: boolean, kept: boolean) => void,
): Promise<CustomPalette> {
  const edits = Array.isArray(change) ? change : [change];
  cache = sanitize(edits.reduce(applyPaletteEdit, cache));
  cacheDirty = true;
  let local = storeLocal(cache);
  window.dispatchEvent(new CustomEvent(PALETTE_CHANGED_EVENT));

  pendingUpdates++;
  inFlight = [...inFlight, ...edits];
  if (flushed) writeUnsynced([...readUnsynced(), ...edits]);
  const run = async (): Promise<CustomPalette> => {
    let next: CustomPalette;
    let reached = false;
    let onList = false;
    try {
      reading++;
      let read: Awaited<ReturnType<typeof readPalette>>;
      try {
        read = await readPalette(hass);
      } finally {
        reading--;
      }
      const { palette, readFailed } = read;
      if (readFailed) {
        onList = writeUnsynced([...readUnsynced(), ...edits]);
        next = sanitize(edits.reduce(applyPaletteEdit, palette));
        local = storeLocal(next);
      } else {
        const backlog = readUnsynced();
        const all = [...backlog, ...edits];
        next = sanitize(all.reduce(applyPaletteEdit, palette));
        local = storeLocal(next);
        if (!hassAvailable(hass)) {
          // Nothing to sync with yet (no `hass`): keep the edit so it replays
          // when `hass` arrives, exactly as after a failed read.
          onList = writeUnsynced(all);
        } else {
          try {
            writing++;
            try {
              await hass.connection.sendMessagePromise({ type: 'frontend/set_user_data', key: HA_KEY, value: next });
            } finally {
              writing--;
            }
            reached = true;
            // Written: what was kept is in Home Assistant now. Edits of other
            // updates still running stay kept if they were persisted.
            inFlight = inFlight.filter((e) => !edits.includes(e));
            writeUnsynced(flushed ? inFlight : []);
          } catch (err) {
            onList = writeUnsynced(all);
            console.warn('[Card-Mod Studio] Palette sync to HA failed (saved to localStorage only):', err);
          }
        }
      }
    } finally {
      pendingUpdates--;
      inFlight = inFlight.filter((e) => !edits.includes(e));
      if (pendingUpdates === 0) flushed = false;
    }
    // A later change already showed itself in the cache; its own run refreshes it.
    if (pendingUpdates === 0) {
      cache = next;
      window.dispatchEvent(new CustomEvent(PALETTE_CHANGED_EVENT));
    }
    onSync?.(reached, reached || local || onList);
    return next;
  };
  const result = writeQueue.then(run, run);
  writeQueue = result.catch(() => undefined);
  return result;
}

/**
 * The page is hidden or going away with an update not finished (its re-read
 * of Home Assistant is still to come, or under way).
 *
 * Always: keep this page's cache locally and put the unfinished changes in
 * the kept list, so if the page then dies, the next load replays them onto
 * Home Assistant's copy — nothing needs a network round trip here.
 *
 * `leaving` (a real `pagehide`, not a bfcache one) only: also send the
 * current cache to Home Assistant with no read first, fire and forget — a
 * real unload cancels the read the queued update is waiting for, and
 * without this Home Assistant stays on its older copy until the replay.
 * That write replaces what Home Assistant holds with this page's cache, so
 * it is never done for a tab that merely went to the background (the page
 * lives on, the queued update re-reads what the write just clobbered and a
 * colour added on another device in between would be lost), nor while a
 * queued update's own read or write is already running (let it finish; the
 * kept list covers a page that dies first: a write that did not land is
 * replayed on the next load, and one that did is idempotent), nor after a failed read (the cache is
 * then only this browser's older copy, see updatePalette).
 */
export function flushPaletteOnUnload(hass: HassSub | undefined, leaving = true): void {
  if (pendingUpdates === 0) return;
  storeLocal(cache);
  const keptBefore = readUnsynced().filter((k) => !inFlight.some((f) => sameEdit(f, k)));
  writeUnsynced([...readUnsynced(), ...inFlight]);
  flushed = true;
  if (!leaving || reading > 0 || writing > 0 || keptBefore.length > 0 || !hassAvailable(hass)) return;
  hass.connection
    .sendMessagePromise({ type: 'frontend/set_user_data', key: HA_KEY, value: cache })
    .catch(() => undefined);
}

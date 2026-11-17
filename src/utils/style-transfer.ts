/**
 * style-transfer.ts — a card's style or a set of presets as text, to copy to
 * another card, another Home Assistant or a forum post, and back.
 *
 *   { "cardModStudio": "0.12.0", "type": "style",   "state": { … } }
 *   { "cardModStudio": "0.12.0", "type": "presets", "presets": [{ "name": …, "state": { … } }] }
 *
 * The state is the Studio's own (what a preset stores), not the generated
 * CSS: it carries the module settings, so the receiving Studio can show and
 * edit them. Pasted text is untrusted: size-capped, parsed as JSON only,
 * every state migrated like a stored preset (migrateStudioState fills in and
 * drops what doesn't fit), names trimmed and capped. A card's own pierced
 * entries (dictSource) and its Number size never travel (same as a preset).
 */
import type { StudioState } from '../types/index.js';
import { migrateStudioState } from '../parser/state-mapper.js';
import type { StylePreset } from './preset-storage.js';
import { presetFont } from './preset-caps.js';

declare const __APP_VERSION__: string;

/** Pasted text larger than this is refused (a big preset set is ~50 kB). */
export const TRANSFER_MAX_CHARS = 512 * 1024;
/** Same cap as a preset name typed in the panel. */
export const TRANSFER_NAME_MAX = 60;

export type TransferResult =
  | { kind: 'style'; state: StudioState }
  | { kind: 'presets'; presets: StylePreset[] }
  | { kind: 'error'; reason: 'empty' | 'tooLarge' | 'notJson' | 'notOurs' | 'nothingUsable' };

const version = (): string => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev');

/** Strips what belongs to the card it came from (see preset saving in cms-panel). */
function portable(state: StudioState): StudioState {
  const { dictSource: _card, ...rest } = state;
  return { ...rest, font: presetFont(rest.font) } as StudioState;
}

export function exportStyle(state: StudioState): string {
  return JSON.stringify({ cardModStudio: version(), type: 'style', state: portable(state) }, null, 2);
}

export function exportPresets(presets: StylePreset[]): string {
  return JSON.stringify(
    { cardModStudio: version(), type: 'presets', presets: presets.map((p) => ({ name: p.name, state: portable(p.state) })) },
    null,
    2,
  );
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

function cleanState(raw: unknown): StudioState | null {
  if (!isObj(raw)) return null;
  try {
    return portable(migrateStudioState(raw as unknown as StudioState));
  } catch {
    return null;
  }
}

/** Reads pasted text. Never throws. */
export function parseTransfer(text: string): TransferResult {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return { kind: 'error', reason: 'empty' };
  if (trimmed.length > TRANSFER_MAX_CHARS) return { kind: 'error', reason: 'tooLarge' };
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return { kind: 'error', reason: 'notJson' };
  }
  if (!isObj(data) || !('cardModStudio' in data)) return { kind: 'error', reason: 'notOurs' };
  if (data.type === 'style') {
    const state = cleanState(data.state);
    return state ? { kind: 'style', state } : { kind: 'error', reason: 'nothingUsable' };
  }
  if (data.type === 'presets' && Array.isArray(data.presets)) {
    const presets: StylePreset[] = [];
    for (const p of data.presets) {
      if (!isObj(p) || typeof p.name !== 'string') continue;
      const name = p.name.trim().slice(0, TRANSFER_NAME_MAX);
      const state = cleanState(p.state);
      if (name && state) presets.push({ name, state });
    }
    return presets.length ? { kind: 'presets', presets } : { kind: 'error', reason: 'nothingUsable' };
  }
  return { kind: 'error', reason: 'notOurs' };
}

/**
 * Names for imported presets that don't collide with `existing` (or each
 * other): "Warm" → "Warm (2)". Returns the presets with their final names.
 */
export function uniqueNames(incoming: StylePreset[], existing: string[]): StylePreset[] {
  const taken = new Set(existing);
  return incoming.map((p) => {
    let name = p.name;
    for (let n = 2; taken.has(name); n++) {
      const suffix = ` (${n})`;
      name = p.name.slice(0, TRANSFER_NAME_MAX - suffix.length) + suffix;
    }
    taken.add(name);
    return { ...p, name };
  });
}

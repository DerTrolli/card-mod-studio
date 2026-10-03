/**
 * Shared helpers for the v0.10.0 audit regression suites (test/v010-audit-*).
 * Not a test file itself.
 *
 * pickOutputKey() consults customElements (a DOM global) — installEngines()
 * swaps in a fake registry with the requested engines "installed", the same
 * pattern as merge-dedup.test.ts / dict-form.test.ts.
 */
import type { CardModCardConfig, StudioState } from '../src/types/index.js';
import { buildMergedStudioState, applyStudioState } from '../src/editor/studio-state.js';

export class FakeCustomElementRegistry {
  private registry = new Map<string, unknown>();
  define(name: string, ctor: unknown) { this.registry.set(name, ctor); }
  get(name: string) { return this.registry.get(name); }
}
const FAKE = class {};

let saved: unknown;
export function installEngines(engines: Array<'card-mod' | 'uix'>) {
  saved = (globalThis as { customElements?: unknown }).customElements;
  const r = new FakeCustomElementRegistry();
  if (engines.includes('card-mod')) r.define('card-mod', FAKE);
  if (engines.includes('uix')) r.define('uix-node', FAKE);
  (globalThis as { customElements: unknown }).customElements = r;
}
export function restoreEngines() {
  (globalThis as { customElements: unknown }).customElements = saved;
}

export const cfg = (o: unknown) => o as CardModCardConfig;

/** The real open → edit → save pipeline (cms-panel / stack children). */
export function openEditSave(
  config: CardModCardConfig,
  edit: (s: StudioState) => StudioState = (s) => s,
): CardModCardConfig {
  return applyStudioState(edit(buildMergedStudioState(config)), config);
}

/** An UNRELATED edit: enable the Border module's radius. */
export const enableBorderRadius = (s: StudioState): StudioState => ({
  ...s,
  border: { ...s.border, enabled: true, radiusPx: 8 },
});

/** Opens a card_mod string style (card-mod engine), applies an unrelated
 *  edit, saves, and returns the saved card_mod.style string. */
export function saveStringStyle(
  style: string,
  edit: (s: StudioState) => StudioState = enableBorderRadius,
  type = 'tile',
): string {
  installEngines(['card-mod']);
  try {
    const config = cfg({ type, entity: 'light.a', card_mod: { style } });
    return String(openEditSave(config, edit).card_mod?.style ?? '');
  } finally {
    restoreEngines();
  }
}

/** Seeded PRNG (mulberry32) — fuzz suites must be deterministic. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Flattens a lit TemplateResult tree into its static strings + values. */
export function templateText(t: unknown): string {
  if (!t || typeof t !== 'object') return typeof t === 'string' ? t : '';
  if (Array.isArray(t)) return (t as unknown[]).map(templateText).join('');
  const r = t as { strings?: readonly string[]; values?: unknown[] };
  return (r.strings ?? []).join('') + (r.values ?? []).map(templateText).join('');
}

/**
 * studio-names.ts — the names the Studio writes into a card's CSS.
 *
 * Its own `@keyframes` (and the `animation:` value that names them) and the
 * Threshold gradient's marker property carry a prefix so they can be told
 * apart from hand-written ones. Until v1.0.0-beta.1 the prefix was `cms-`
 * (from the old name, Card-Mod Studio); since v1.0.0-beta.2 the Studio
 * writes `cstudio-`. Both are read; a card moves to the new prefix the next
 * time it is saved in the Studio. Hand-written CSS in Advanced CSS that
 * names an old `cms-…` keyframes block keeps that block (it is never
 * rewritten).
 */

/** The prefix the Studio writes. */
export const STUDIO_PREFIX = 'cstudio-';

/** Prefixes earlier versions wrote; read, never written. */
export const LEGACY_PREFIXES: readonly string[] = ['cms-'];

/** Regex source matching any prefix the Studio reads (new first). */
export const ANY_PREFIX_SRC = `(?:${[STUDIO_PREFIX, ...LEGACY_PREFIXES].map((p) => p.replace(/-$/, '')).join('|')})-`;

/** The Threshold gradient's marker property the Studio writes. */
export const GRADIENT_MARKER_PROPERTY = `--${STUDIO_PREFIX}gradient-stops`;

/** Every marker property the Studio reads (new first). */
export const GRADIENT_MARKER_PROPERTIES: readonly string[] = [
  GRADIENT_MARKER_PROPERTY,
  ...LEGACY_PREFIXES.map((p) => `--${p}gradient-stops`),
];

/** The keyframes / animation name for an Animation preset, as written. */
export function animationName(preset: string): string {
  return `${STUDIO_PREFIX}${preset}`;
}

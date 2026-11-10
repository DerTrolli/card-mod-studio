/**
 * Roving tabindex for a row of buttons (the colour swatches): the row is ONE
 * Tab stop and the arrow keys move between its members.
 */

/**
 * Where focus goes for a key pressed on member `current` of `count`, or null
 * when the key is not a movement key (or has a modifier). Arrows wrap, Home
 * and End jump; Right/Down go forward, Left/Up back.
 */
export function rovingTarget(
  key: string,
  current: number,
  count: number,
  mods: { ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean } = {},
): number | null {
  if (count <= 0 || mods.ctrlKey || mods.altKey || mods.metaKey) return null;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (current + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** The one member of a row that is in the Tab order: the one the user last
 *  moved to, else the selected one, else the first. */
export function tabStopIndex(count: number, selected: number, moved: number | undefined): number {
  if (moved !== undefined && moved >= 0 && moved < count) return moved;
  return selected >= 0 && selected < count ? selected : 0;
}

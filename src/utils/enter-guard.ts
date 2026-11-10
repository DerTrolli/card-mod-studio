/**
 * Enter typed into one of the Studio's fields must stay in the Studio.
 *
 * Older Home Assistant (seen on 2025.9 and 2026.2) treats Enter anywhere in
 * the card-edit dialog as "Save" and closes it. The fields only commit on
 * `change`, which the browser fires AFTER the keydown has been dispatched, so
 * the dialog saved the previous value. Stopping the keydown on its way up
 * (bubble phase, so the field and CodeMirror have already seen it) keeps the
 * dialog out of it; the browser's own default action still commits the field,
 * and nothing is preventDefault-ed (a select still opens, a newline is still
 * typed). Escape is deliberately not handled here.
 */

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file']);
/** Home Assistant components whose real input may sit behind a closed shadow root. */
const HA_TEXT_HOSTS = new Set(['HA-CODE-EDITOR', 'HA-TEXTFIELD', 'HA-ENTITY-PICKER', 'HA-COMBO-BOX']);

interface MaybeElement {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  getAttribute?: (n: string) => string | null;
  classList?: { contains(c: string): boolean };
}

function isTextLike(el: MaybeElement): boolean {
  const tag = (el.tagName ?? '').toUpperCase();
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has((el.type ?? 'text').toLowerCase());
  if (tag === 'SELECT' || tag === 'TEXTAREA' || HA_TEXT_HOSTS.has(tag)) return true;
  if (el.isContentEditable) return true;
  const ce = el.getAttribute?.('contenteditable');
  if (ce != null && ce !== 'false') return true;
  return !!el.classList?.contains('cm-editor');
}

/** keydown listener for the panel and for the colour picker's popover portal. */
export function keepEnterInStudio(e: KeyboardEvent): void {
  if (e.key !== 'Enter') return;
  // Not e.target: it is retargeted to the shadow host by the time it gets here.
  const path = (e.composedPath?.() ?? []) as MaybeElement[];
  const origin = path[0];
  if (origin && (isTextLike(origin) || path.some((el) => HA_TEXT_HOSTS.has((el.tagName ?? '').toUpperCase())))) {
    e.stopPropagation();
  }
}

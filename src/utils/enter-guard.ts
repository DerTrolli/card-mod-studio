/**
 * Enter pressed inside the Studio must stay in the Studio.
 *
 * Older Home Assistant (read on 2025.9 and 2026.2) has a bubble-phase
 * `keydown` listener on the edit dialog's `.mdc-dialog` that clicks Save for
 * ANY Enter whose first path element is not a textarea or a menu/select list
 * item. So Enter on a module header, a switch, a checkbox, a slider, a button
 * or a swatch saved and closed the dialog with a half-made edit, and in
 * fields the save ran before `change` had committed the value.
 *
 * Stop every Enter keydown at the panel host / popover portal. Bubble phase,
 * so the target and CodeMirror have already handled it; stopPropagation only,
 * never preventDefault, so a button's click, a header's own handler, a select
 * opening and a typed newline all keep working. Escape and other keys are not
 * touched. keyup and keypress are left alone on purpose: the dialog's
 * listener is keydown only.
 */

/** keydown listener for the panel and for the colour picker's popover portal. */
export function keepEnterInStudio(e: KeyboardEvent): void {
  if (e.key === 'Enter') e.stopPropagation();
}

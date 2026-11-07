/**
 * helpers.ts — builds the READ side (claims) and the override-conflict rows of
 * a custom-card profile from its WRITE side (emitters), so a profile's data
 * module declares each variable once and the generator / parser / conflict
 * warnings cannot drift apart. Types only are imported from
 * custom-card-profiles.ts (erased at build time: no runtime import cycle).
 */

import type { ClaimRule, ConflictRow, ProfileEmitters } from '../custom-card-profiles.js';

export function claimsFromEmitters(e: ProfileEmitters): ClaimRule[] {
  const out: ClaimRule[] = [];
  const add = (module: ClaimRule['module'], selector: string, role: ClaimRule['role'], props?: string[]) => {
    if (props?.length) out.push({ module, selector, role, props: props.map((p) => p.toLowerCase()) });
  };
  if (e.font) {
    add('font', e.font.selector, 'fontSize', e.font.size);
    add('font', e.font.selector, 'fontWeight', e.font.weight);
    add('font', e.font.selector, 'fontColor', e.font.color);
    if (e.font.family) add('font', e.font.selector, 'fontFamily', ['font-family']);
  }
  if (e.iconSize) {
    add('iconColor', e.iconSize.selector, 'iconSize', e.iconSize.box);
    add('iconColor', e.iconSize.selector, 'iconGlyph', e.iconSize.glyph);
  }
  if (e.accent) add('accentColor', e.accent.selector, 'accent', e.accent.vars);
  if (e.background) add('background', e.background.selector, 'background', e.background.vars);
  if (e.border) {
    add('border', e.border.selector, 'borderRadius', e.border.radius);
    add('border', e.border.selector, 'borderWidth', e.border.width);
    add('border', e.border.selector, 'borderColor', e.border.color);
  }
  return out;
}

export function conflictsFromEmitters(e: ProfileEmitters): ConflictRow[] {
  const out: ConflictRow[] = [];
  const add = (module: ConflictRow['module'], selector: string, props: string[], property?: string) => {
    if (props.length) out.push({ module, selector, props: props.map((p) => p.toLowerCase()), ...(property ? { property } : {}) });
  };
  if (e.font) {
    const f = e.font;
    add('font', f.selector, [...(f.size ?? []), ...(f.weight ?? []), ...(f.color ?? [])]);
    add('threshold', f.selector, f.color ?? [], 'text-color');
  }
  if (e.iconSize) add('iconColor', e.iconSize.selector, [...e.iconSize.box, ...(e.iconSize.glyph ?? [])]);
  if (e.accent) {
    add('accentColor', e.accent.selector, e.accent.vars);
    add('threshold', e.accent.selector, e.accent.vars, 'accent-color');
  }
  if (e.background) {
    add('background', e.background.selector, e.background.vars);
    add('threshold', e.background.selector, e.background.vars, 'background');
  }
  if (e.border) {
    const b = e.border;
    add('border', b.selector, [...(b.radius ?? []), ...(b.width ?? []), ...(b.color ?? [])]);
    add('threshold', b.selector, [...(b.width ?? []), ...(b.color ?? [])], 'border-color');
  }
  return out;
}

/**
 * helpers.ts — builds the READ side (claims) and the override-conflict rows of
 * a custom-card profile from its WRITE side (emitters), so a profile's data
 * module declares each variable once and the generator / parser / conflict
 * warnings cannot drift apart. Types only are imported from
 * custom-card-profiles.ts (erased at build time: no runtime import cycle).
 */

import type { ClaimRule, ClickRule, Companion, ConflictRow, ProfileEmitters } from '../custom-card-profiles.js';

/** Click-to-edit rows (preview-map): a chain element → the panel module. */
export const CLICK_FONT = { module: 'cms-font-module', label: 'Font' } as const;
export const CLICK_ICON = { module: 'cms-icon-color-module', label: 'Icon Color' } as const;
export const CLICK_ACCENT = { module: 'cms-accent-color-module', label: 'Accent Color' } as const;
export const CLICK_BACKGROUND = { module: 'cms-background-module', label: 'Background & card surface' } as const;

export const clickTag = (tag: string, to: Pick<ClickRule, 'module' | 'label'>): ClickRule => ({ tag, ...to });
export const clickClass = (className: string, to: Pick<ClickRule, 'module' | 'label'>): ClickRule => ({ className, ...to });

function companionClaim(module: ClaimRule['module'], selector: string, c: Companion): ClaimRule {
  return { module, selector: c.selector ?? selector, role: 'companion', props: [c.prop.toLowerCase()], equals: c.value };
}

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
  if (e.iconColor) add('iconColor', e.iconColor.selector, 'iconColor', ['color']);
  if (e.accent) {
    add('accentColor', e.accent.selector, 'accent', e.accent.vars);
    for (const c of e.accent.companions ?? []) out.push(companionClaim('accentColor', e.accent.selector, c));
  }
  if (e.background) {
    add('background', e.background.selector, 'background', e.background.vars);
    for (const c of e.background.companions ?? []) out.push(companionClaim('background', e.background.selector, c));
  }
  if (e.border?.direct) {
    add('border', e.border.selector, 'borderDirect', ['border-radius', 'border']);
    for (const c of e.border.companions ?? []) out.push(companionClaim('border', e.border.selector, c));
  } else if (e.border) {
    add('border', e.border.selector, 'borderRadius', e.border.radius);
    add('border', e.border.selector, 'borderWidth', e.border.width);
    add('border', e.border.selector, 'borderColor', e.border.color);
  }
  return out;
}

export function conflictsFromEmitters(e: ProfileEmitters): ConflictRow[] {
  const out: ConflictRow[] = [];
  // A comma list is one row per selector; the conflict check matches each
  // row's selector against the user's rule by selector tokens (`tokens`).
  const add = (module: ConflictRow['module'], selector: string, props: string[], property?: string) => {
    if (!props.length) return;
    for (const sel of selector.split(',').map((x) => x.trim()).filter(Boolean)) {
      out.push({ module, selector: sel, props: props.map((p) => p.toLowerCase()), tokens: true, ...(property ? { property } : {}) });
    }
  };
  const comp = (cs?: Companion[]) => (cs ?? []).map((c) => c.prop);
  if (e.font) {
    const f = e.font;
    add('font', f.selector, [...(f.size ?? []), ...(f.weight ?? []), ...(f.color ?? [])]);
    add('threshold', f.selector, f.color ?? [], 'text-color');
  }
  if (e.iconSize) add('iconColor', e.iconSize.selector, [...e.iconSize.box, ...(e.iconSize.glyph ?? [])]);
  if (e.iconColor) add('iconColor', e.iconColor.selector, ['color']);
  if (e.accent) {
    add('accentColor', e.accent.selector, [...e.accent.vars, ...comp(e.accent.companions)]);
    add('threshold', e.accent.selector, e.accent.vars, 'accent-color');
  }
  if (e.background) {
    add('background', e.background.selector, [...e.background.vars, ...comp(e.background.companions)]);
    add('threshold', e.background.selector, e.background.vars, 'background');
  }
  if (e.border?.direct) {
    add('border', e.border.selector, ['border-radius', 'border']);
    for (const c of e.border.companions ?? []) add('border', c.selector ?? e.border.selector, [c.prop]);
  } else if (e.border) {
    const b = e.border;
    add('border', b.selector, [...(b.radius ?? []), ...(b.width ?? []), ...(b.color ?? [])]);
    add('threshold', b.selector, [...(b.width ?? []), ...(b.color ?? [])], 'border-color');
  }
  return out;
}

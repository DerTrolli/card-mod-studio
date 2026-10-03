// In-page probes (serialized into page.evaluate) measuring the panel's live
// preview card. Every probe reads window.__fui (installed by lib.mjs INIT).

/** Tile / generic single card: ha-card box, icon, tile name text. */
export const P_CARD = (idx = 0) => {
  const Q = window.__fui;
  const c = Q.prev();
  if (!c) return null;
  const card = Q.q(c, 'ha-card')[idx];
  if (!card) return null;
  const scope = card;
  const icon = Q.q1(scope, 'ha-state-icon');
  const svg = Q.q1(Q.q1(scope, 'ha-tile-icon') || icon || scope, 'ha-svg-icon');
  const prim = Q.tilePrimary(scope);
  const cs = getComputedStyle(card);
  const ps = prim && getComputedStyle(prim);
  const is = icon && getComputedStyle(icon);
  return {
    bg: cs.backgroundColor, bgImg: cs.backgroundImage, filter: cs.filter,
    transDur: cs.transitionDuration, transProp: cs.transitionProperty,
    radius: cs.borderTopLeftRadius, bw: cs.borderTopWidth, bc: cs.borderTopColor, bs: cs.borderTopStyle,
    anim: cs.animationName, animDur: cs.animationDuration, color: cs.color, minH: cs.minHeight,
    tileColor: Q.varRgb(card, '--tile-color'), accent: Q.varRgb(card, '--accent-color'),
    iconColor: is ? is.color : null, svgW: svg ? Math.round(svg.getBoundingClientRect().width) : null,
    pSize: ps ? ps.fontSize : null, pWeight: ps ? ps.fontWeight : null, pFamily: ps ? ps.fontFamily : null, pColor: ps ? ps.color : null,
  };
};

/** A named element inside the preview: computed props of the first match. */
export const P_EL = ({ sel, within, props, idx = 0 }) => {
  const Q = window.__fui;
  const c = Q.prev();
  if (!c) return null;
  const root = within ? Q.q1(c, within) : c;
  const el = Q.q(root, sel)[idx];
  if (!el) return { missing: sel };
  const cs = getComputedStyle(el);
  const out = {};
  for (const p of props) {
    if (p === 'width') out.width = Math.round(el.getBoundingClientRect().width);
    else if (p.startsWith('--')) out[p] = Q.varRgb(el, p);
    else out[p] = cs[p];
  }
  return out;
};

/** Entities-card rows of the preview (or of the idx-th entities card inside a stack). */
export const P_ROWS = (cardIdx = 0) => {
  const Q = window.__fui;
  const c = Q.prev();
  if (!c) return null;
  const card = Q.q(c, 'hui-entities-card')[cardIdx];
  if (!card) return null;
  const rows = Q.all(card).filter((n) => /-entity-row$/.test(n.tagName.toLowerCase()) && n.tagName !== 'HUI-GENERIC-ENTITY-ROW');
  return rows.map((r) => {
    const icon = Q.q1(r, 'ha-state-icon');
    const info = Q.q1(r, '.info');
    const ics = icon && getComputedStyle(icon);
    const fcs = info && getComputedStyle(info);
    return {
      tag: r.tagName.toLowerCase(),
      iconColor: ics ? ics.color : null,
      textColor: fcs ? fcs.color : null,
      fontSize: fcs ? fcs.fontSize : null,
      fontWeight: fcs ? fcs.fontWeight : null,
    };
  });
};

/** Heading card title/subtitle. */
export const P_HEADING = () => {
  const Q = window.__fui;
  const c = Q.prev();
  if (!c) return null;
  const text = Q.headingText(c);
  const content = Q.q(c, '.content').find((x) => x.classList.contains('title') || x.classList.contains('subtitle'));
  const icon = content ? content.querySelector('ha-icon') : null;
  const container = Q.q1(c, '.container');
  if (!text) return { missing: 'heading text' };
  const cs = getComputedStyle(text);
  return {
    tag: text.tagName.toLowerCase(), size: cs.fontSize, color: cs.color, weight: cs.fontWeight, family: cs.fontFamily,
    iconW: icon ? Math.round(icon.getBoundingClientRect().width) : null, iconColor: icon ? getComputedStyle(icon).color : null,
    justify: container ? getComputedStyle(container).justifyContent : null,
  };
};

/** Gauge internals. */
export const P_GAUGE = () => {
  const Q = window.__fui;
  const c = Q.prev();
  if (!c) return null;
  const g = Q.q1(c, 'ha-gauge');
  const value = g?.shadowRoot?.querySelector('.value');
  const needle = g?.shadowRoot?.querySelector('.needle');
  const vt = g?.shadowRoot?.querySelector('.value-text');
  const title = Q.q1(c, '.title');
  const card = Q.q1(c, 'ha-card');
  return {
    stroke: value ? getComputedStyle(value).stroke : null,
    needleFill: needle ? getComputedStyle(needle).fill : null,
    vtFill: vt ? getComputedStyle(vt).fill : null,
    vtWeight: vt ? getComputedStyle(vt).fontWeight : null,
    titleSize: title ? getComputedStyle(title).fontSize : null,
    titleColor: title ? getComputedStyle(title).color : null,
    titleWeight: title ? getComputedStyle(title).fontWeight : null,
    radius: card ? getComputedStyle(card).borderTopLeftRadius : null,
    bg: card ? getComputedStyle(card).backgroundColor : null,
  };
};

/** Panel-side UI facts (banners, modules present, labels). */
export const P_PANEL = () => {
  const Q = window.__fui;
  const p = Q.panel();
  if (!p) return null;
  const sr = p.shadowRoot;
  const mods = [...sr.querySelectorAll('.modules-col > *')].map((n) => n.tagName.toLowerCase()).filter((t) => t.startsWith('cms-'));
  return {
    modules: mods,
    warning: Q.txt(sr.querySelector('.warning-banner')),
    info: [...sr.querySelectorAll('.info-banner')].map((n) => Q.txt(n)),
    container: [...sr.querySelectorAll('.container-banner')].map((n) => Q.txt(n)),
    hasCopyBtn: !!sr.querySelector('.btn-banner-action'),
    version: Q.txt(sr.querySelector('.version')),
  };
};

/** Deep elementFromPoint: is the point inside the visible cms-panel? */
export const P_HIT = ({ x, y }) => {
  let el = document.elementFromPoint(x, y);
  const chain = [];
  for (let i = 0; el && i < 30; i++) {
    chain.push(el);
    const inner = el.shadowRoot?.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  const deepest = chain[chain.length - 1];
  const up = [];
  for (let n = deepest; n; n = n.assignedSlot || n.parentElement || n.getRootNode()?.host) up.push(n.tagName?.toLowerCase());
  return { inPanel: up.includes('cms-panel'), deepest: deepest?.tagName?.toLowerCase(), up: up.slice(0, 8) };
};

/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const t$2 = globalThis, e$3 = t$2.ShadowRoot && (void 0 === t$2.ShadyCSS || t$2.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, s$2 = Symbol(), o$4 = /* @__PURE__ */ new WeakMap();
let n$3 = class n {
  constructor(t2, e2, o2) {
    if (this._$cssResult$ = true, o2 !== s$2) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t2, this.t = e2;
  }
  get styleSheet() {
    let t2 = this.o;
    const s2 = this.t;
    if (e$3 && void 0 === t2) {
      const e2 = void 0 !== s2 && 1 === s2.length;
      e2 && (t2 = o$4.get(s2)), void 0 === t2 && ((this.o = t2 = new CSSStyleSheet()).replaceSync(this.cssText), e2 && o$4.set(s2, t2));
    }
    return t2;
  }
  toString() {
    return this.cssText;
  }
};
const r$4 = (t2) => new n$3("string" == typeof t2 ? t2 : t2 + "", void 0, s$2), i$5 = (t2, ...e2) => {
  const o2 = 1 === t2.length ? t2[0] : e2.reduce((e3, s2, o3) => e3 + ((t3) => {
    if (true === t3._$cssResult$) return t3.cssText;
    if ("number" == typeof t3) return t3;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t3 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s2) + t2[o3 + 1], t2[0]);
  return new n$3(o2, t2, s$2);
}, S$1 = (s2, o2) => {
  if (e$3) s2.adoptedStyleSheets = o2.map((t2) => t2 instanceof CSSStyleSheet ? t2 : t2.styleSheet);
  else for (const e2 of o2) {
    const o3 = document.createElement("style"), n3 = t$2.litNonce;
    void 0 !== n3 && o3.setAttribute("nonce", n3), o3.textContent = e2.cssText, s2.appendChild(o3);
  }
}, c$2 = e$3 ? (t2) => t2 : (t2) => t2 instanceof CSSStyleSheet ? ((t3) => {
  let e2 = "";
  for (const s2 of t3.cssRules) e2 += s2.cssText;
  return r$4(e2);
})(t2) : t2;
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const { is: i$4, defineProperty: e$2, getOwnPropertyDescriptor: h$1, getOwnPropertyNames: r$3, getOwnPropertySymbols: o$3, getPrototypeOf: n$2 } = Object, a$1 = globalThis, c$1 = a$1.trustedTypes, l$1 = c$1 ? c$1.emptyScript : "", p$2 = a$1.reactiveElementPolyfillSupport, d$1 = (t2, s2) => t2, u$1 = { toAttribute(t2, s2) {
  switch (s2) {
    case Boolean:
      t2 = t2 ? l$1 : null;
      break;
    case Object:
    case Array:
      t2 = null == t2 ? t2 : JSON.stringify(t2);
  }
  return t2;
}, fromAttribute(t2, s2) {
  let i4 = t2;
  switch (s2) {
    case Boolean:
      i4 = null !== t2;
      break;
    case Number:
      i4 = null === t2 ? null : Number(t2);
      break;
    case Object:
    case Array:
      try {
        i4 = JSON.parse(t2);
      } catch (t3) {
        i4 = null;
      }
  }
  return i4;
} }, f$1 = (t2, s2) => !i$4(t2, s2), b$1 = { attribute: true, type: String, converter: u$1, reflect: false, useDefault: false, hasChanged: f$1 };
Symbol.metadata ??= Symbol("metadata"), a$1.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
let y$1 = class y extends HTMLElement {
  static addInitializer(t2) {
    this._$Ei(), (this.l ??= []).push(t2);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t2, s2 = b$1) {
    if (s2.state && (s2.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t2) && ((s2 = Object.create(s2)).wrapped = true), this.elementProperties.set(t2, s2), !s2.noAccessor) {
      const i4 = Symbol(), h2 = this.getPropertyDescriptor(t2, i4, s2);
      void 0 !== h2 && e$2(this.prototype, t2, h2);
    }
  }
  static getPropertyDescriptor(t2, s2, i4) {
    const { get: e2, set: r2 } = h$1(this.prototype, t2) ?? { get() {
      return this[s2];
    }, set(t3) {
      this[s2] = t3;
    } };
    return { get: e2, set(s3) {
      const h2 = e2?.call(this);
      r2?.call(this, s3), this.requestUpdate(t2, h2, i4);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t2) {
    return this.elementProperties.get(t2) ?? b$1;
  }
  static _$Ei() {
    if (this.hasOwnProperty(d$1("elementProperties"))) return;
    const t2 = n$2(this);
    t2.finalize(), void 0 !== t2.l && (this.l = [...t2.l]), this.elementProperties = new Map(t2.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(d$1("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d$1("properties"))) {
      const t3 = this.properties, s2 = [...r$3(t3), ...o$3(t3)];
      for (const i4 of s2) this.createProperty(i4, t3[i4]);
    }
    const t2 = this[Symbol.metadata];
    if (null !== t2) {
      const s2 = litPropertyMetadata.get(t2);
      if (void 0 !== s2) for (const [t3, i4] of s2) this.elementProperties.set(t3, i4);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t3, s2] of this.elementProperties) {
      const i4 = this._$Eu(t3, s2);
      void 0 !== i4 && this._$Eh.set(i4, t3);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(s2) {
    const i4 = [];
    if (Array.isArray(s2)) {
      const e2 = new Set(s2.flat(1 / 0).reverse());
      for (const s3 of e2) i4.unshift(c$2(s3));
    } else void 0 !== s2 && i4.push(c$2(s2));
    return i4;
  }
  static _$Eu(t2, s2) {
    const i4 = s2.attribute;
    return false === i4 ? void 0 : "string" == typeof i4 ? i4 : "string" == typeof t2 ? t2.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t2) => this.enableUpdating = t2), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t2) => t2(this));
  }
  addController(t2) {
    (this._$EO ??= /* @__PURE__ */ new Set()).add(t2), void 0 !== this.renderRoot && this.isConnected && t2.hostConnected?.();
  }
  removeController(t2) {
    this._$EO?.delete(t2);
  }
  _$E_() {
    const t2 = /* @__PURE__ */ new Map(), s2 = this.constructor.elementProperties;
    for (const i4 of s2.keys()) this.hasOwnProperty(i4) && (t2.set(i4, this[i4]), delete this[i4]);
    t2.size > 0 && (this._$Ep = t2);
  }
  createRenderRoot() {
    const t2 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S$1(t2, this.constructor.elementStyles), t2;
  }
  connectedCallback() {
    this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(true), this._$EO?.forEach((t2) => t2.hostConnected?.());
  }
  enableUpdating(t2) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t2) => t2.hostDisconnected?.());
  }
  attributeChangedCallback(t2, s2, i4) {
    this._$AK(t2, i4);
  }
  _$ET(t2, s2) {
    const i4 = this.constructor.elementProperties.get(t2), e2 = this.constructor._$Eu(t2, i4);
    if (void 0 !== e2 && true === i4.reflect) {
      const h2 = (void 0 !== i4.converter?.toAttribute ? i4.converter : u$1).toAttribute(s2, i4.type);
      this._$Em = t2, null == h2 ? this.removeAttribute(e2) : this.setAttribute(e2, h2), this._$Em = null;
    }
  }
  _$AK(t2, s2) {
    const i4 = this.constructor, e2 = i4._$Eh.get(t2);
    if (void 0 !== e2 && this._$Em !== e2) {
      const t3 = i4.getPropertyOptions(e2), h2 = "function" == typeof t3.converter ? { fromAttribute: t3.converter } : void 0 !== t3.converter?.fromAttribute ? t3.converter : u$1;
      this._$Em = e2;
      const r2 = h2.fromAttribute(s2, t3.type);
      this[e2] = r2 ?? this._$Ej?.get(e2) ?? r2, this._$Em = null;
    }
  }
  requestUpdate(t2, s2, i4, e2 = false, h2) {
    if (void 0 !== t2) {
      const r2 = this.constructor;
      if (false === e2 && (h2 = this[t2]), i4 ??= r2.getPropertyOptions(t2), !((i4.hasChanged ?? f$1)(h2, s2) || i4.useDefault && i4.reflect && h2 === this._$Ej?.get(t2) && !this.hasAttribute(r2._$Eu(t2, i4)))) return;
      this.C(t2, s2, i4);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t2, s2, { useDefault: i4, reflect: e2, wrapped: h2 }, r2) {
    i4 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t2) && (this._$Ej.set(t2, r2 ?? s2 ?? this[t2]), true !== h2 || void 0 !== r2) || (this._$AL.has(t2) || (this.hasUpdated || i4 || (s2 = void 0), this._$AL.set(t2, s2)), true === e2 && this._$Em !== t2 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t2));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t3) {
      Promise.reject(t3);
    }
    const t2 = this.scheduleUpdate();
    return null != t2 && await t2, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
        for (const [t4, s3] of this._$Ep) this[t4] = s3;
        this._$Ep = void 0;
      }
      const t3 = this.constructor.elementProperties;
      if (t3.size > 0) for (const [s3, i4] of t3) {
        const { wrapped: t4 } = i4, e2 = this[s3];
        true !== t4 || this._$AL.has(s3) || void 0 === e2 || this.C(s3, void 0, i4, e2);
      }
    }
    let t2 = false;
    const s2 = this._$AL;
    try {
      t2 = this.shouldUpdate(s2), t2 ? (this.willUpdate(s2), this._$EO?.forEach((t3) => t3.hostUpdate?.()), this.update(s2)) : this._$EM();
    } catch (s3) {
      throw t2 = false, this._$EM(), s3;
    }
    t2 && this._$AE(s2);
  }
  willUpdate(t2) {
  }
  _$AE(t2) {
    this._$EO?.forEach((t3) => t3.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t2)), this.updated(t2);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t2) {
    return true;
  }
  update(t2) {
    this._$Eq &&= this._$Eq.forEach((t3) => this._$ET(t3, this[t3])), this._$EM();
  }
  updated(t2) {
  }
  firstUpdated(t2) {
  }
};
y$1.elementStyles = [], y$1.shadowRootOptions = { mode: "open" }, y$1[d$1("elementProperties")] = /* @__PURE__ */ new Map(), y$1[d$1("finalized")] = /* @__PURE__ */ new Map(), p$2?.({ ReactiveElement: y$1 }), (a$1.reactiveElementVersions ??= []).push("2.1.2");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const t$1 = globalThis, i$3 = (t2) => t2, s$1 = t$1.trustedTypes, e$1 = s$1 ? s$1.createPolicy("lit-html", { createHTML: (t2) => t2 }) : void 0, h = "$lit$", o$2 = `lit$${Math.random().toFixed(9).slice(2)}$`, n$1 = "?" + o$2, r$2 = `<${n$1}>`, l = document, c = () => l.createComment(""), a = (t2) => null === t2 || "object" != typeof t2 && "function" != typeof t2, u = Array.isArray, d = (t2) => u(t2) || "function" == typeof t2?.[Symbol.iterator], f = "[ 	\n\f\r]", v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, _ = /-->/g, m$1 = />/g, p$1 = RegExp(`>|${f}(?:([^\\s"'>=/]+)(${f}*=${f}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), g = /'/g, $ = /"/g, y2 = /^(?:script|style|textarea|title)$/i, x = (t2) => (i4, ...s2) => ({ _$litType$: t2, strings: i4, values: s2 }), b = x(1), E = Symbol.for("lit-noChange"), A = Symbol.for("lit-nothing"), C = /* @__PURE__ */ new WeakMap(), P = l.createTreeWalker(l, 129);
function V(t2, i4) {
  if (!u(t2) || !t2.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e$1 ? e$1.createHTML(i4) : i4;
}
const N = (t2, i4) => {
  const s2 = t2.length - 1, e2 = [];
  let n3, l2 = 2 === i4 ? "<svg>" : 3 === i4 ? "<math>" : "", c2 = v;
  for (let i5 = 0; i5 < s2; i5++) {
    const s3 = t2[i5];
    let a2, u2, d2 = -1, f2 = 0;
    for (; f2 < s3.length && (c2.lastIndex = f2, u2 = c2.exec(s3), null !== u2); ) f2 = c2.lastIndex, c2 === v ? "!--" === u2[1] ? c2 = _ : void 0 !== u2[1] ? c2 = m$1 : void 0 !== u2[2] ? (y2.test(u2[2]) && (n3 = RegExp("</" + u2[2], "g")), c2 = p$1) : void 0 !== u2[3] && (c2 = p$1) : c2 === p$1 ? ">" === u2[0] ? (c2 = n3 ?? v, d2 = -1) : void 0 === u2[1] ? d2 = -2 : (d2 = c2.lastIndex - u2[2].length, a2 = u2[1], c2 = void 0 === u2[3] ? p$1 : '"' === u2[3] ? $ : g) : c2 === $ || c2 === g ? c2 = p$1 : c2 === _ || c2 === m$1 ? c2 = v : (c2 = p$1, n3 = void 0);
    const x2 = c2 === p$1 && t2[i5 + 1].startsWith("/>") ? " " : "";
    l2 += c2 === v ? s3 + r$2 : d2 >= 0 ? (e2.push(a2), s3.slice(0, d2) + h + s3.slice(d2) + o$2 + x2) : s3 + o$2 + (-2 === d2 ? i5 : x2);
  }
  return [V(t2, l2 + (t2[s2] || "<?>") + (2 === i4 ? "</svg>" : 3 === i4 ? "</math>" : "")), e2];
};
class S {
  constructor({ strings: t2, _$litType$: i4 }, e2) {
    let r2;
    this.parts = [];
    let l2 = 0, a2 = 0;
    const u2 = t2.length - 1, d2 = this.parts, [f2, v2] = N(t2, i4);
    if (this.el = S.createElement(f2, e2), P.currentNode = this.el.content, 2 === i4 || 3 === i4) {
      const t3 = this.el.content.firstChild;
      t3.replaceWith(...t3.childNodes);
    }
    for (; null !== (r2 = P.nextNode()) && d2.length < u2; ) {
      if (1 === r2.nodeType) {
        if (r2.hasAttributes()) for (const t3 of r2.getAttributeNames()) if (t3.endsWith(h)) {
          const i5 = v2[a2++], s2 = r2.getAttribute(t3).split(o$2), e3 = /([.?@])?(.*)/.exec(i5);
          d2.push({ type: 1, index: l2, name: e3[2], strings: s2, ctor: "." === e3[1] ? I : "?" === e3[1] ? L : "@" === e3[1] ? z : H }), r2.removeAttribute(t3);
        } else t3.startsWith(o$2) && (d2.push({ type: 6, index: l2 }), r2.removeAttribute(t3));
        if (y2.test(r2.tagName)) {
          const t3 = r2.textContent.split(o$2), i5 = t3.length - 1;
          if (i5 > 0) {
            r2.textContent = s$1 ? s$1.emptyScript : "";
            for (let s2 = 0; s2 < i5; s2++) r2.append(t3[s2], c()), P.nextNode(), d2.push({ type: 2, index: ++l2 });
            r2.append(t3[i5], c());
          }
        }
      } else if (8 === r2.nodeType) if (r2.data === n$1) d2.push({ type: 2, index: l2 });
      else {
        let t3 = -1;
        for (; -1 !== (t3 = r2.data.indexOf(o$2, t3 + 1)); ) d2.push({ type: 7, index: l2 }), t3 += o$2.length - 1;
      }
      l2++;
    }
  }
  static createElement(t2, i4) {
    const s2 = l.createElement("template");
    return s2.innerHTML = t2, s2;
  }
}
function M(t2, i4, s2 = t2, e2) {
  if (i4 === E) return i4;
  let h2 = void 0 !== e2 ? s2._$Co?.[e2] : s2._$Cl;
  const o2 = a(i4) ? void 0 : i4._$litDirective$;
  return h2?.constructor !== o2 && (h2?._$AO?.(false), void 0 === o2 ? h2 = void 0 : (h2 = new o2(t2), h2._$AT(t2, s2, e2)), void 0 !== e2 ? (s2._$Co ??= [])[e2] = h2 : s2._$Cl = h2), void 0 !== h2 && (i4 = M(t2, h2._$AS(t2, i4.values), h2, e2)), i4;
}
class R {
  constructor(t2, i4) {
    this._$AV = [], this._$AN = void 0, this._$AD = t2, this._$AM = i4;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t2) {
    const { el: { content: i4 }, parts: s2 } = this._$AD, e2 = (t2?.creationScope ?? l).importNode(i4, true);
    P.currentNode = e2;
    let h2 = P.nextNode(), o2 = 0, n3 = 0, r2 = s2[0];
    for (; void 0 !== r2; ) {
      if (o2 === r2.index) {
        let i5;
        2 === r2.type ? i5 = new k(h2, h2.nextSibling, this, t2) : 1 === r2.type ? i5 = new r2.ctor(h2, r2.name, r2.strings, this, t2) : 6 === r2.type && (i5 = new Z(h2, this, t2)), this._$AV.push(i5), r2 = s2[++n3];
      }
      o2 !== r2?.index && (h2 = P.nextNode(), o2++);
    }
    return P.currentNode = l, e2;
  }
  p(t2) {
    let i4 = 0;
    for (const s2 of this._$AV) void 0 !== s2 && (void 0 !== s2.strings ? (s2._$AI(t2, s2, i4), i4 += s2.strings.length - 2) : s2._$AI(t2[i4])), i4++;
  }
}
class k {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t2, i4, s2, e2) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t2, this._$AB = i4, this._$AM = s2, this.options = e2, this._$Cv = e2?.isConnected ?? true;
  }
  get parentNode() {
    let t2 = this._$AA.parentNode;
    const i4 = this._$AM;
    return void 0 !== i4 && 11 === t2?.nodeType && (t2 = i4.parentNode), t2;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t2, i4 = this) {
    t2 = M(this, t2, i4), a(t2) ? t2 === A || null == t2 || "" === t2 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t2 !== this._$AH && t2 !== E && this._(t2) : void 0 !== t2._$litType$ ? this.$(t2) : void 0 !== t2.nodeType ? this.T(t2) : d(t2) ? this.k(t2) : this._(t2);
  }
  O(t2) {
    return this._$AA.parentNode.insertBefore(t2, this._$AB);
  }
  T(t2) {
    this._$AH !== t2 && (this._$AR(), this._$AH = this.O(t2));
  }
  _(t2) {
    this._$AH !== A && a(this._$AH) ? this._$AA.nextSibling.data = t2 : this.T(l.createTextNode(t2)), this._$AH = t2;
  }
  $(t2) {
    const { values: i4, _$litType$: s2 } = t2, e2 = "number" == typeof s2 ? this._$AC(t2) : (void 0 === s2.el && (s2.el = S.createElement(V(s2.h, s2.h[0]), this.options)), s2);
    if (this._$AH?._$AD === e2) this._$AH.p(i4);
    else {
      const t3 = new R(e2, this), s3 = t3.u(this.options);
      t3.p(i4), this.T(s3), this._$AH = t3;
    }
  }
  _$AC(t2) {
    let i4 = C.get(t2.strings);
    return void 0 === i4 && C.set(t2.strings, i4 = new S(t2)), i4;
  }
  k(t2) {
    u(this._$AH) || (this._$AH = [], this._$AR());
    const i4 = this._$AH;
    let s2, e2 = 0;
    for (const h2 of t2) e2 === i4.length ? i4.push(s2 = new k(this.O(c()), this.O(c()), this, this.options)) : s2 = i4[e2], s2._$AI(h2), e2++;
    e2 < i4.length && (this._$AR(s2 && s2._$AB.nextSibling, e2), i4.length = e2);
  }
  _$AR(t2 = this._$AA.nextSibling, s2) {
    for (this._$AP?.(false, true, s2); t2 !== this._$AB; ) {
      const s3 = i$3(t2).nextSibling;
      i$3(t2).remove(), t2 = s3;
    }
  }
  setConnected(t2) {
    void 0 === this._$AM && (this._$Cv = t2, this._$AP?.(t2));
  }
}
class H {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t2, i4, s2, e2, h2) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t2, this.name = i4, this._$AM = e2, this.options = h2, s2.length > 2 || "" !== s2[0] || "" !== s2[1] ? (this._$AH = Array(s2.length - 1).fill(new String()), this.strings = s2) : this._$AH = A;
  }
  _$AI(t2, i4 = this, s2, e2) {
    const h2 = this.strings;
    let o2 = false;
    if (void 0 === h2) t2 = M(this, t2, i4, 0), o2 = !a(t2) || t2 !== this._$AH && t2 !== E, o2 && (this._$AH = t2);
    else {
      const e3 = t2;
      let n3, r2;
      for (t2 = h2[0], n3 = 0; n3 < h2.length - 1; n3++) r2 = M(this, e3[s2 + n3], i4, n3), r2 === E && (r2 = this._$AH[n3]), o2 ||= !a(r2) || r2 !== this._$AH[n3], r2 === A ? t2 = A : t2 !== A && (t2 += (r2 ?? "") + h2[n3 + 1]), this._$AH[n3] = r2;
    }
    o2 && !e2 && this.j(t2);
  }
  j(t2) {
    t2 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t2 ?? "");
  }
}
class I extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t2) {
    this.element[this.name] = t2 === A ? void 0 : t2;
  }
}
class L extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t2) {
    this.element.toggleAttribute(this.name, !!t2 && t2 !== A);
  }
}
class z extends H {
  constructor(t2, i4, s2, e2, h2) {
    super(t2, i4, s2, e2, h2), this.type = 5;
  }
  _$AI(t2, i4 = this) {
    if ((t2 = M(this, t2, i4, 0) ?? A) === E) return;
    const s2 = this._$AH, e2 = t2 === A && s2 !== A || t2.capture !== s2.capture || t2.once !== s2.once || t2.passive !== s2.passive, h2 = t2 !== A && (s2 === A || e2);
    e2 && this.element.removeEventListener(this.name, this, s2), h2 && this.element.addEventListener(this.name, this, t2), this._$AH = t2;
  }
  handleEvent(t2) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t2) : this._$AH.handleEvent(t2);
  }
}
class Z {
  constructor(t2, i4, s2) {
    this.element = t2, this.type = 6, this._$AN = void 0, this._$AM = i4, this.options = s2;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t2) {
    M(this, t2);
  }
}
const B = t$1.litHtmlPolyfillSupport;
B?.(S, k), (t$1.litHtmlVersions ??= []).push("3.3.2");
const D = (t2, i4, s2) => {
  const e2 = s2?.renderBefore ?? i4;
  let h2 = e2._$litPart$;
  if (void 0 === h2) {
    const t3 = s2?.renderBefore ?? null;
    e2._$litPart$ = h2 = new k(i4.insertBefore(c(), t3), t3, void 0, s2 ?? {});
  }
  return h2._$AI(t2), h2;
};
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const s = globalThis;
let i$2 = class i extends y$1 {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    const t2 = super.createRenderRoot();
    return this.renderOptions.renderBefore ??= t2.firstChild, t2;
  }
  update(t2) {
    const r2 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t2), this._$Do = D(r2, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    super.connectedCallback(), this._$Do?.setConnected(true);
  }
  disconnectedCallback() {
    super.disconnectedCallback(), this._$Do?.setConnected(false);
  }
  render() {
    return E;
  }
};
i$2._$litElement$ = true, i$2["finalized"] = true, s.litElementHydrateSupport?.({ LitElement: i$2 });
const o$1 = s.litElementPolyfillSupport;
o$1?.({ LitElement: i$2 });
(s.litElementVersions ??= []).push("4.2.2");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const t = (t2) => (e2, o2) => {
  void 0 !== o2 ? o2.addInitializer(() => {
    customElements.define(t2, e2);
  }) : customElements.define(t2, e2);
};
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const o = { attribute: true, type: String, converter: u$1, reflect: false, hasChanged: f$1 }, r$1 = (t2 = o, e2, r2) => {
  const { kind: n3, metadata: i4 } = r2;
  let s2 = globalThis.litPropertyMetadata.get(i4);
  if (void 0 === s2 && globalThis.litPropertyMetadata.set(i4, s2 = /* @__PURE__ */ new Map()), "setter" === n3 && ((t2 = Object.create(t2)).wrapped = true), s2.set(r2.name, t2), "accessor" === n3) {
    const { name: o2 } = r2;
    return { set(r3) {
      const n4 = e2.get.call(this);
      e2.set.call(this, r3), this.requestUpdate(o2, n4, t2, true, r3);
    }, init(e3) {
      return void 0 !== e3 && this.C(o2, void 0, t2, e3), e3;
    } };
  }
  if ("setter" === n3) {
    const { name: o2 } = r2;
    return function(r3) {
      const n4 = this[o2];
      e2.call(this, r3), this.requestUpdate(o2, n4, t2, true, r3);
    };
  }
  throw Error("Unsupported decorator location: " + n3);
};
function n2(t2) {
  return (e2, o2) => "object" == typeof o2 ? r$1(t2, e2, o2) : ((t3, e3, o3) => {
    const r2 = e3.hasOwnProperty(o3);
    return e3.constructor.createProperty(o3, t3), r2 ? Object.getOwnPropertyDescriptor(e3, o3) : void 0;
  })(t2, e2, o2);
}
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
function r(r2) {
  return n2({ ...r2, state: true, attribute: false });
}
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const e = (t2) => (...e2) => ({ _$litDirective$: t2, values: e2 });
let i$1 = class i2 {
  constructor(t2) {
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AT(t2, e2, i4) {
    this._$Ct = t2, this._$AM = e2, this._$Ci = i4;
  }
  _$AS(t2, e2) {
    return this.update(t2, e2);
  }
  update(t2, e2) {
    return this.render(...e2);
  }
};
/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const m = {}, p = (o2, t2 = m) => o2._$AH = t2;
/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const i3 = e(class extends i$1 {
  constructor() {
    super(...arguments), this.key = A;
  }
  render(r2, t2) {
    return this.key = r2, t2;
  }
  update(r2, [t2, e2]) {
    return t2 !== this.key && (p(r2), this.key = t2), e2;
  }
});
function isCardModInstalled() {
  return customElements.get("card-mod") !== void 0;
}
const HA_DIALOG_ELEMENT = "hui-dialog-edit-card";
const HA_KEY = "cms_presets";
const LS_KEY = "cms-presets";
function hassAvailable(hass) {
  return !!hass?.connection?.sendMessagePromise;
}
async function loadPresets(hass) {
  if (hassAvailable(hass)) {
    try {
      const result = await hass.connection.sendMessagePromise({
        type: "frontend/get_user_data",
        key: HA_KEY
      });
      const value = result?.value;
      if (Array.isArray(value)) return value;
    } catch (err) {
      console.warn("[Card-Mod Studio] Preset load from HA failed, using localStorage:", err);
    }
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
async function savePresets(presets, hass) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(presets));
  } catch {
  }
  if (hassAvailable(hass)) {
    try {
      await hass.connection.sendMessagePromise({
        type: "frontend/set_user_data",
        key: HA_KEY,
        value: presets
      });
    } catch (err) {
      console.warn("[Card-Mod Studio] Preset sync to HA failed (saved to localStorage only):", err);
    }
  }
}
const PLACEHOLDER_PREFIX = "__CMS_J";
const PLACEHOLDER_SUFFIX = "__";
function extractJinja(css) {
  const map = /* @__PURE__ */ new Map();
  let index = 0;
  const cleaned = css.replace(/\{\{[\s\S]*?\}\}/g, (match) => {
    const key = `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
    map.set(key, match);
    index++;
    return key;
  });
  return { cleaned, map };
}
function restoreJinja(value, map) {
  let result = value;
  for (const [key, original] of map) {
    result = result.split(key).join(original);
  }
  return result;
}
const ENTITY_STATE_PATTERN = /^\{\{\s*'([^']*)'\s+if\s+is_state\(\s*config\.entity\s*,\s*'(on|off)'\s*\)\s+else\s+'([^']*)'\s*\}\}$/;
function analyzeJinja(value) {
  const trimmed = value.trim();
  const match = trimmed.match(ENTITY_STATE_PATTERN);
  if (match) {
    const [, val1, state, val2] = match;
    if (state === "off") {
      return { hasCondition: true, offValue: val1, onValue: val2 };
    }
    return { hasCondition: true, onValue: val1, offValue: val2 };
  }
  if (trimmed.includes("{{")) {
    return { hasCondition: true };
  }
  return { hasCondition: false };
}
function splitIntoBlocks(css) {
  const blocks = [];
  let depth = 0;
  let blockStart = -1;
  let selectorStart = 0;
  for (let i4 = 0; i4 < css.length; i4++) {
    const ch = css[i4];
    if (ch === "{") {
      if (depth === 0) {
        blockStart = i4 + 1;
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && blockStart !== -1) {
        const selector = css.slice(selectorStart, blockStart - 1).trim();
        const declarationBlock = css.slice(blockStart, i4).trim();
        if (selector && declarationBlock && !selector.startsWith("@")) {
          blocks.push({ selector, declarationBlock });
        }
        selectorStart = i4 + 1;
        blockStart = -1;
      }
    }
  }
  return blocks;
}
function parseDeclarations(declarationBlock, jinjaMap) {
  const properties = [];
  const declarations = declarationBlock.split(";");
  for (const decl of declarations) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const propertyName = trimmed.slice(0, colonIdx).trim().toLowerCase();
    let rawValue = trimmed.slice(colonIdx + 1).trim();
    rawValue = rawValue.replace(/\s*!important\s*$/, "").trim();
    if (!propertyName) continue;
    const value = restoreJinja(rawValue, jinjaMap);
    const jinjaInfo = analyzeJinja(value);
    properties.push({
      property: propertyName,
      value,
      ...jinjaInfo
    });
  }
  return properties;
}
function parseCss(css) {
  if (!css || !css.trim()) return [];
  const { cleaned, map } = extractJinja(css);
  const blocks = splitIntoBlocks(cleaned);
  return blocks.map(({ selector, declarationBlock }) => {
    const restoredSelector = restoreJinja(selector, map);
    const properties = parseDeclarations(declarationBlock, map);
    return {
      selector: restoredSelector,
      properties
    };
  }).filter((target) => target.properties.length > 0);
}
function parseCardModConfig(config) {
  const style = config.card_mod?.style;
  if (!style) {
    return emptyState();
  }
  if (typeof style === "string") {
    return parseStyleString(style);
  }
  if (typeof style === "object" && style !== null) {
    return parseDictStyle(style);
  }
  return emptyState();
}
function parseStyleString(css) {
  const trimmed = css.trim();
  if (!trimmed) return emptyState();
  try {
    const targets = parseCss(trimmed);
    return { targets, rawCss: trimmed };
  } catch {
    return { targets: [], rawCss: trimmed };
  }
}
function parseDictStyle(dict) {
  const targets = [];
  const rawParts = [];
  for (const [selector, declarations] of Object.entries(dict)) {
    if (typeof declarations !== "string") continue;
    const trimmedDecls = declarations.trim();
    if (!trimmedDecls) continue;
    const synthetic = `${selector} { ${trimmedDecls} }`;
    rawParts.push(synthetic);
    try {
      const parsed = parseCss(synthetic);
      targets.push(...parsed);
    } catch {
    }
  }
  return {
    targets,
    rawCss: rawParts.join("\n")
  };
}
function emptyState() {
  return { targets: [], rawCss: "" };
}
const DEFAULT_FILTER = {
  enabled: false,
  grayscale: false,
  grayscaleWhen: "off",
  brightness: 100,
  blur: 0,
  transitionMs: 300
};
const DEFAULT_ICON_COLOR = {
  enabled: false,
  mode: "conditional",
  color: "#2196F3",
  colorOn: "#2196F3",
  colorOff: "#6b6b6b"
};
const DEFAULT_ACCENT_COLOR = {
  enabled: false,
  color: "#03a9f4"
};
const DEFAULT_BACKGROUND = {
  enabled: false,
  type: "solid",
  color1: "#03a9f4",
  color2: "#ff8c00",
  angle: 135,
  applyWhen: "always"
};
const DEFAULT_ANIMATION = {
  enabled: false,
  preset: "pulse",
  speedS: 2,
  trigger: "always",
  customEntity: void 0
};
const DEFAULT_BORDER = {
  enabled: false,
  radiusPx: 12,
  borderWidth: 0,
  borderColor: "#03a9f4"
};
const DEFAULT_HEADING_STYLE = {
  enabled: false,
  fontSize: 24,
  textColor: "#e1e1e1",
  iconSize: 24,
  iconColor: "#e1e1e1",
  alignment: "left"
};
const DEFAULT_THRESHOLD = {
  enabled: false,
  entityId: "",
  property: "icon-color",
  rules: [],
  defaultColor: "#888888"
};
function claimKey(selector, property) {
  return `${selector.trim().toLowerCase()}::${property.trim().toLowerCase()}`;
}
function mapAnimation(haCard, claimed) {
  if (!haCard) return { ...DEFAULT_ANIMATION };
  const animProp = findProp(haCard, "animation");
  if (!animProp) return { ...DEFAULT_ANIMATION };
  const ANIM_PATTERN = /^cms-(pulse|breathe|gradient-shift|blink|bounce)\s+([\d.]+)s\s+ease-in-out\s+infinite$/;
  if (!animProp.hasCondition) {
    const match = animProp.value.match(ANIM_PATTERN);
    if (match) {
      claimed.add(claimKey(haCard.selector, "animation"));
      return {
        enabled: true,
        preset: match[1],
        speedS: parseFloat(match[2]),
        trigger: "always"
      };
    }
  } else {
    const onValue = animProp.onValue?.trim() || "";
    const offValue = animProp.offValue?.trim() || "";
    const animValue = onValue.match(ANIM_PATTERN) ? onValue : offValue.match(ANIM_PATTERN) ? offValue : null;
    if (animValue) {
      const match = animValue.match(ANIM_PATTERN);
      if (match) {
        claimed.add(claimKey(haCard.selector, "animation"));
        const trigger = onValue.match(ANIM_PATTERN) ? "on" : "off";
        return {
          enabled: true,
          preset: match[1],
          speedS: parseFloat(match[2]),
          trigger
        };
      }
    }
  }
  return { ...DEFAULT_ANIMATION };
}
function mapToStudioState(parsed) {
  const haCard = findTarget(parsed.targets, "ha-card");
  const haStateIcon = findTarget(parsed.targets, "ha-state-icon");
  const titleP = findTarget(parsed.targets, ".title p");
  const titleIcon = findTarget(parsed.targets, ".title ha-icon");
  const container = findTarget(parsed.targets, ".container");
  const claimed = /* @__PURE__ */ new Set();
  return {
    filter: mapFilter(haCard, claimed),
    iconColor: mapIconColor(haStateIcon, claimed),
    accentColor: mapAccentColor(haCard, claimed),
    background: mapBackground(haCard, claimed),
    animation: mapAnimation(haCard, claimed),
    border: mapBorder(haCard, claimed),
    headingStyle: mapHeadingStyle(titleP, titleIcon, container, claimed),
    threshold: mapThreshold(haCard, haStateIcon, claimed),
    advanced: mapAdvanced(parsed, claimed)
  };
}
function findTarget(targets, selector) {
  const norm = selector.trim().toLowerCase();
  return targets.find((t2) => t2.selector.trim().toLowerCase() === norm) ?? null;
}
function findProp(target, property) {
  const norm = property.trim().toLowerCase();
  return target.properties.find((p2) => p2.property === norm) ?? null;
}
function mapFilter(haCard, claimed) {
  if (!haCard) return { ...DEFAULT_FILTER };
  const filterProp = findProp(haCard, "filter");
  const transitionProp = findProp(haCard, "transition");
  const state = { ...DEFAULT_FILTER };
  let filterClaimed = false;
  if (filterProp) {
    if (filterProp.hasCondition) {
      const offHasGrayscale = filterProp.offValue?.trim().startsWith("grayscale(");
      const onHasGrayscale = filterProp.onValue?.trim().startsWith("grayscale(");
      if (offHasGrayscale && filterProp.onValue?.trim() === "none") {
        state.enabled = true;
        state.grayscale = true;
        state.grayscaleWhen = "off";
        filterClaimed = true;
      } else if (onHasGrayscale && filterProp.offValue?.trim() === "none") {
        state.enabled = true;
        state.grayscale = true;
        state.grayscaleWhen = "on";
        filterClaimed = true;
      }
      const brightnessSource = filterProp.onValue ?? filterProp.offValue ?? filterProp.value;
      const bm = brightnessSource.match(/brightness\(\s*(\d+(?:\.\d+)?)%\s*\)/);
      if (bm) {
        state.enabled = true;
        state.brightness = parseFloat(bm[1]);
        filterClaimed = true;
      }
      const blurSource = filterProp.onValue ?? filterProp.offValue ?? filterProp.value;
      const blm = blurSource.match(/blur\(\s*(\d+(?:\.\d+)?)px\s*\)/);
      if (blm) {
        state.enabled = true;
        state.blur = parseFloat(blm[1]);
        filterClaimed = true;
      }
    } else {
      const val = filterProp.value;
      if (val.trim().startsWith("grayscale(")) {
        state.enabled = true;
        state.grayscale = true;
        state.grayscaleWhen = "always";
        filterClaimed = true;
      }
      const bm = val.match(/brightness\(\s*(\d+(?:\.\d+)?)%\s*\)/);
      if (bm) {
        state.enabled = true;
        state.brightness = parseFloat(bm[1]);
        filterClaimed = true;
      }
      const blm = val.match(/blur\(\s*(\d+(?:\.\d+)?)px\s*\)/);
      if (blm) {
        state.enabled = true;
        state.blur = parseFloat(blm[1]);
        filterClaimed = true;
      }
    }
    if (filterClaimed) claimed.add(claimKey(haCard.selector, "filter"));
  }
  if (transitionProp) {
    if (transitionProp.value.includes("filter") || transitionProp.value.includes("all")) {
      const msMatch = transitionProp.value.match(/(\d+)ms/);
      const sMatch = transitionProp.value.match(/(\d*\.?\d+)s(?:\s|$|,)/);
      if (msMatch) {
        state.transitionMs = parseInt(msMatch[1], 10);
        claimed.add(claimKey(haCard.selector, "transition"));
      } else if (sMatch) {
        state.transitionMs = Math.round(parseFloat(sMatch[1]) * 1e3);
        claimed.add(claimKey(haCard.selector, "transition"));
      }
    }
  }
  return state;
}
function mapIconColor(haStateIcon, claimed) {
  if (!haStateIcon) return { ...DEFAULT_ICON_COLOR };
  const colorProp = findProp(haStateIcon, "color");
  if (!colorProp) return { ...DEFAULT_ICON_COLOR };
  claimed.add(claimKey(haStateIcon.selector, "color"));
  if (colorProp.hasCondition && colorProp.value.includes("rgb_color")) {
    const fallbackMatch = colorProp.value.match(/else\s+'([^']+)'/);
    const colorOff = fallbackMatch ? fallbackMatch[1] : DEFAULT_ICON_COLOR.colorOff;
    return {
      enabled: true,
      mode: "light",
      color: colorOff,
      colorOn: colorOff,
      colorOff
    };
  }
  if (colorProp.hasCondition && colorProp.onValue && colorProp.offValue) {
    return {
      enabled: true,
      mode: "conditional",
      color: colorProp.onValue,
      colorOn: colorProp.onValue,
      colorOff: colorProp.offValue
    };
  }
  if (!colorProp.hasCondition && colorProp.value.trim()) {
    return {
      enabled: true,
      mode: "plain",
      color: colorProp.value.trim(),
      colorOn: colorProp.value.trim(),
      colorOff: DEFAULT_ICON_COLOR.colorOff
    };
  }
  return { ...DEFAULT_ICON_COLOR };
}
function mapAccentColor(haCard, claimed) {
  if (!haCard) return { ...DEFAULT_ACCENT_COLOR };
  const prop = findProp(haCard, "--accent-color");
  if (!prop || prop.hasCondition) return { ...DEFAULT_ACCENT_COLOR };
  const value = prop.value.trim();
  if (!value) return { ...DEFAULT_ACCENT_COLOR };
  claimed.add(claimKey(haCard.selector, "--accent-color"));
  return { enabled: true, color: value };
}
function mapBackground(haCard, claimed) {
  if (!haCard) return { ...DEFAULT_BACKGROUND };
  const bgProp = findProp(haCard, "background");
  if (!bgProp) return { ...DEFAULT_BACKGROUND };
  if (bgProp.hasCondition && bgProp.onValue !== void 0 && bgProp.offValue !== void 0) {
    const onVal = bgProp.onValue.trim();
    const offVal = bgProp.offValue.trim();
    let applyWhen = null;
    let colorVal = "";
    if (offVal === "none" && onVal && onVal !== "none") {
      applyWhen = "on";
      colorVal = onVal;
    } else if (onVal === "none" && offVal && offVal !== "none") {
      applyWhen = "off";
      colorVal = offVal;
    }
    if (applyWhen && colorVal) {
      claimed.add(claimKey(haCard.selector, "background"));
      const gradientMatch2 = colorVal.match(
        /^linear-gradient\(\s*(\d+)deg\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i
      );
      if (gradientMatch2) {
        return {
          enabled: true,
          type: "gradient",
          color1: gradientMatch2[2].trim(),
          color2: gradientMatch2[3].trim(),
          angle: parseInt(gradientMatch2[1], 10),
          applyWhen
        };
      }
      return { ...DEFAULT_BACKGROUND, enabled: true, type: "solid", color1: colorVal, applyWhen };
    }
    return { ...DEFAULT_BACKGROUND };
  }
  if (bgProp.hasCondition) return { ...DEFAULT_BACKGROUND };
  const value = bgProp.value.trim();
  const gradientMatch = value.match(
    /^linear-gradient\(\s*(\d+)deg\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i
  );
  if (gradientMatch) {
    claimed.add(claimKey(haCard.selector, "background"));
    return {
      enabled: true,
      type: "gradient",
      color1: gradientMatch[2].trim(),
      color2: gradientMatch[3].trim(),
      angle: parseInt(gradientMatch[1], 10),
      applyWhen: "always"
    };
  }
  if (value && !value.includes("url(") && !value.includes("{{")) {
    claimed.add(claimKey(haCard.selector, "background"));
    return { ...DEFAULT_BACKGROUND, enabled: true, type: "solid", color1: value };
  }
  return { ...DEFAULT_BACKGROUND };
}
function mapBorder(haCard, claimed) {
  if (!haCard) return { ...DEFAULT_BORDER };
  const radiusProp = findProp(haCard, "border-radius");
  const borderProp = findProp(haCard, "border");
  const state = { ...DEFAULT_BORDER };
  if (radiusProp && !radiusProp.hasCondition) {
    const match = radiusProp.value.match(/^(\d+(?:\.\d+)?)px$/);
    if (match) {
      state.enabled = true;
      state.radiusPx = parseFloat(match[1]);
      claimed.add(claimKey(haCard.selector, "border-radius"));
    }
  }
  if (borderProp && !borderProp.hasCondition) {
    const match = borderProp.value.match(
      /^(\d+)px\s+(solid|dashed|dotted|double|groove|ridge|inset|outset|none)\s+(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/i
    );
    if (match) {
      state.enabled = true;
      state.borderWidth = parseInt(match[1], 10);
      state.borderColor = match[3];
      claimed.add(claimKey(haCard.selector, "border"));
    }
  }
  return state;
}
const JUSTIFY_TO_ALIGN = {
  "flex-start": "left",
  center: "center",
  "flex-end": "right"
};
const TEXT_ALIGN_MAP = {
  left: "left",
  center: "center",
  right: "right"
};
function mapHeadingStyle(titleP, titleIcon, container, claimed) {
  if (!titleP && !titleIcon && !container) return { ...DEFAULT_HEADING_STYLE };
  const state = { ...DEFAULT_HEADING_STYLE };
  if (titleP) {
    const fontSizeProp = findProp(titleP, "font-size");
    if (fontSizeProp && !fontSizeProp.hasCondition) {
      const m2 = fontSizeProp.value.match(/^(\d+(?:\.\d+)?)px$/);
      if (m2) {
        state.enabled = true;
        state.fontSize = parseFloat(m2[1]);
        claimed.add(claimKey(titleP.selector, "font-size"));
      }
    }
    const colorProp = findProp(titleP, "color");
    if (colorProp && !colorProp.hasCondition && colorProp.value.trim()) {
      state.enabled = true;
      state.textColor = colorProp.value.trim();
      claimed.add(claimKey(titleP.selector, "color"));
    }
    const textAlignProp = findProp(titleP, "text-align");
    if (textAlignProp && !textAlignProp.hasCondition) {
      const a2 = TEXT_ALIGN_MAP[textAlignProp.value.trim()];
      if (a2) {
        state.enabled = true;
        state.alignment = a2;
        claimed.add(claimKey(titleP.selector, "text-align"));
      }
    }
  }
  if (titleIcon) {
    const iconSizeProp = findProp(titleIcon, "--mdc-icon-size");
    if (iconSizeProp && !iconSizeProp.hasCondition) {
      const m2 = iconSizeProp.value.match(/^(\d+(?:\.\d+)?)px$/);
      if (m2) {
        state.enabled = true;
        state.iconSize = parseFloat(m2[1]);
        claimed.add(claimKey(titleIcon.selector, "--mdc-icon-size"));
      }
    }
    const iconColorProp = findProp(titleIcon, "color");
    if (iconColorProp && !iconColorProp.hasCondition && iconColorProp.value.trim()) {
      state.enabled = true;
      state.iconColor = iconColorProp.value.trim();
      claimed.add(claimKey(titleIcon.selector, "color"));
    }
  }
  if (container) {
    const justifyProp = findProp(container, "justify-content");
    if (justifyProp && !justifyProp.hasCondition) {
      const a2 = JUSTIFY_TO_ALIGN[justifyProp.value.trim()];
      if (a2) {
        state.enabled = true;
        state.alignment = a2;
        claimed.add(claimKey(container.selector, "justify-content"));
      }
    }
  }
  return state;
}
function parseThresholdJinja(value) {
  if (!value.includes("float(0)")) return null;
  const RULE_RE = /'(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)'\s+if\s+states\('([^']+)'\)\s*\|\s*float\(0\)\s*(>=|<=|>|<|==|!=)\s*([\d.]+(?:\.\d+)?)/g;
  const DEFAULT_RE = /else\s+'(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)'\s*[)}\s]/;
  const rules = [];
  let entityId = "";
  let idx = 0;
  let match;
  while ((match = RULE_RE.exec(value)) !== null) {
    const [, color, entity, operator, numStr] = match;
    entityId = entity;
    rules.push({
      id: String(idx++),
      operator,
      value: parseFloat(numStr),
      color
    });
  }
  if (rules.length === 0 || !entityId) return null;
  const defaultMatch = DEFAULT_RE.exec(value);
  const defaultColor = defaultMatch ? defaultMatch[1] : DEFAULT_THRESHOLD.defaultColor;
  return { entityId, rules, defaultColor };
}
function mapThreshold(haCard, haStateIcon, claimed) {
  const candidates = [];
  if (haCard) {
    const bgProp = findProp(haCard, "background");
    if (bgProp?.hasCondition && !bgProp.onValue)
      candidates.push({ target: haCard, cssProperty: "background", thresholdProperty: "background" });
    const colorProp = findProp(haCard, "color");
    if (colorProp?.hasCondition && !colorProp.onValue)
      candidates.push({ target: haCard, cssProperty: "color", thresholdProperty: "text-color" });
    const accentProp = findProp(haCard, "--accent-color");
    if (accentProp?.hasCondition && !accentProp.onValue)
      candidates.push({ target: haCard, cssProperty: "--accent-color", thresholdProperty: "accent-color" });
    const borderColorProp = findProp(haCard, "border-color");
    if (borderColorProp?.hasCondition && !borderColorProp.onValue)
      candidates.push({ target: haCard, cssProperty: "border-color", thresholdProperty: "border-color" });
    const borderShorthandProp = findProp(haCard, "border");
    if (borderShorthandProp?.hasCondition && !borderShorthandProp.onValue)
      candidates.push({ target: haCard, cssProperty: "border", thresholdProperty: "border-color" });
  }
  if (haStateIcon) {
    const colorProp = findProp(haStateIcon, "color");
    if (colorProp?.hasCondition && !colorProp.onValue)
      candidates.push({ target: haStateIcon, cssProperty: "color", thresholdProperty: "icon-color" });
  }
  for (const { target, cssProperty, thresholdProperty } of candidates) {
    const prop = findProp(target, cssProperty);
    const parsed = parseThresholdJinja(prop.value);
    if (parsed) {
      claimed.add(claimKey(target.selector, cssProperty));
      let borderWidth;
      if (cssProperty === "border") {
        const bwMatch = prop.value.match(/^(\d+)px/);
        borderWidth = bwMatch ? parseInt(bwMatch[1], 10) : 2;
      }
      return {
        enabled: true,
        entityId: parsed.entityId,
        property: thresholdProperty,
        rules: parsed.rules,
        defaultColor: parsed.defaultColor,
        ...borderWidth !== void 0 ? { borderWidth } : {}
      };
    }
  }
  return { ...DEFAULT_THRESHOLD };
}
function mapAdvanced(parsed, claimed) {
  const parts = [];
  for (const target of parsed.targets) {
    const unclaimed = target.properties.filter(
      (p2) => !claimed.has(claimKey(target.selector, p2.property))
    );
    if (unclaimed.length > 0) {
      const decls = unclaimed.map((p2) => `  ${p2.property}: ${p2.value};`).join("\n");
      parts.push(`${target.selector} {
${decls}
}`);
    }
  }
  return { rawCss: parts.join("\n\n") };
}
const KEYFRAMES = {
  pulse: `@keyframes cms-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}`,
  breathe: `@keyframes cms-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}`,
  "gradient-shift": `@keyframes cms-gradient-shift {
  0% { background-position: 0% center; }
  50% { background-position: 100% center; }
  100% { background-position: 0% center; }
}`,
  blink: `@keyframes cms-blink {
  0%, 49%, 100% { opacity: 1; }
  50%, 99% { opacity: 0.3; }
}`,
  bounce: `@keyframes cms-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}`
};
function filterDecls(s2) {
  if (!s2.enabled) return [];
  const decls = [];
  if (s2.grayscale) {
    const grayParts = ["grayscale(100%)"];
    const otherParts = [];
    if (s2.brightness !== 100) {
      grayParts.push(`brightness(${s2.brightness}%)`);
      otherParts.push(`brightness(${s2.brightness}%)`);
    }
    if (s2.blur > 0) {
      grayParts.push(`blur(${s2.blur}px)`);
      otherParts.push(`blur(${s2.blur}px)`);
    }
    const grayVal = grayParts.join(" ");
    const otherVal = otherParts.length > 0 ? otherParts.join(" ") : "none";
    if (s2.grayscaleWhen === "always") {
      decls.push(`filter: ${grayVal};`);
    } else if (s2.grayscaleWhen === "off") {
      decls.push(
        `filter: {{ '${grayVal}' if is_state(config.entity, 'off') else '${otherVal}' }};`
      );
    } else {
      decls.push(
        `filter: {{ '${grayVal}' if is_state(config.entity, 'on') else '${otherVal}' }};`
      );
    }
  } else {
    const parts = [];
    if (s2.brightness !== 100) parts.push(`brightness(${s2.brightness}%)`);
    if (s2.blur > 0) parts.push(`blur(${s2.blur}px)`);
    if (parts.length > 0) decls.push(`filter: ${parts.join(" ")};`);
  }
  if (decls.length > 0) {
    decls.push(`transition: filter ${s2.transitionMs}ms ease;`);
  }
  return decls;
}
function accentColorDecls(s2, cardType) {
  if (!s2.enabled) return [];
  const decls = [`--accent-color: ${s2.color};`];
  if (cardType === "tile") {
    decls.push(`--tile-color: ${s2.color};`, `--state-icon-color: ${s2.color};`);
  }
  if (cardType === "thermostat") {
    decls.push(
      `--state-climate-heat-color: ${s2.color};`,
      `--state-climate-cool-color: ${s2.color};`,
      `--state-climate-auto-color: ${s2.color};`,
      `--state-climate-idle-color: ${s2.color};`,
      `--control-circular-slider-color: ${s2.color};`
    );
  }
  if (cardType === "gauge") {
    decls.push(`--gauge-color: ${s2.color};`);
  }
  if (!["tile", "thermostat", "gauge", "heading"].includes(cardType ?? "")) {
    decls.push(`--state-icon-color: ${s2.color};`, `--paper-item-icon-active-color: ${s2.color};`);
  }
  return decls;
}
function backgroundDecls(s2) {
  if (!s2.enabled) return [];
  const bgValue = s2.type === "gradient" ? `linear-gradient(${s2.angle}deg, ${s2.color1}, ${s2.color2})` : s2.color1;
  if (s2.applyWhen === "always") return [`background: ${bgValue};`];
  const when = s2.applyWhen === "on" ? "on" : "off";
  return [
    `background: {{ '${bgValue}' if is_state(config.entity, '${when}') else 'none' }};`
  ];
}
function borderDecls(s2) {
  if (!s2.enabled) return [];
  const decls = [];
  if (s2.radiusPx > 0) decls.push(`border-radius: ${s2.radiusPx}px;`);
  if (s2.borderWidth > 0) decls.push(`border: ${s2.borderWidth}px solid ${s2.borderColor};`);
  return decls;
}
function animationKeyframes(s2) {
  if (!s2.enabled) return "";
  return KEYFRAMES[s2.preset] ?? "";
}
function animationDecls(s2) {
  if (!s2.enabled) return [];
  const animValue = `cms-${s2.preset} ${s2.speedS}s ease-in-out infinite`;
  const decls = [];
  if (s2.preset === "gradient-shift") decls.push("background-size: 200% auto;");
  if (s2.trigger === "always") {
    decls.push(`animation: ${animValue};`);
  } else if (s2.trigger === "on") {
    decls.push(
      `animation: {{ '${animValue}' if is_state(config.entity, 'on') else 'none' }};`
    );
  } else if (s2.trigger === "off") {
    decls.push(
      `animation: {{ '${animValue}' if is_state(config.entity, 'off') else 'none' }};`
    );
  } else if (s2.trigger === "custom" && s2.customEntity) {
    decls.push(
      `animation: {{ '${animValue}' if is_state('${s2.customEntity}', 'on') else 'none' }};`
    );
  }
  return decls;
}
function headingStyleBlocks(s2) {
  if (!s2.enabled) return "";
  const alignMap = {
    left: "flex-start",
    center: "center",
    right: "flex-end"
  };
  const titlePDecls = [
    `font-size: ${s2.fontSize}px;`,
    `color: ${s2.textColor} !important;`
  ];
  const titleP = `.title p {
${titlePDecls.map((d2) => `  ${d2}`).join("\n")}
}`;
  const iconDecls = [
    `--mdc-icon-size: ${s2.iconSize}px;`,
    `color: ${s2.iconColor} !important;`
  ];
  const titleIcon = `.title ha-icon {
${iconDecls.map((d2) => `  ${d2}`).join("\n")}
}`;
  const alignVal = alignMap[s2.alignment] ?? "flex-start";
  const container = `.container {
  justify-content: ${alignVal} !important;
}`;
  return [container, titleP, titleIcon].join("\n\n");
}
function iconColorBlock(s2) {
  if (!s2.enabled) return "";
  if (s2.mode === "plain") {
    return `ha-state-icon {
  color: ${s2.color} !important;
}`;
  }
  if (s2.mode === "light") {
    const jinja = `{{ 'rgb(' ~ (state_attr(config.entity, 'rgb_color') | join(', ')) ~ ')' if is_state(config.entity, 'on') and state_attr(config.entity, 'rgb_color') else '${s2.colorOff}' }}`;
    return `ha-state-icon {
  color: ${jinja} !important;
}`;
  }
  return `ha-state-icon {
  color: {{ '${s2.colorOn}' if is_state(config.entity, 'on') else '${s2.colorOff}' }} !important;
}`;
}
function thresholdBlock(s2) {
  if (!s2 || !s2.enabled || !s2.entityId || s2.rules.length === 0) return "";
  const stateExpr = `states('${s2.entityId}') | float(0)`;
  const firstOp = s2.rules[0]?.operator ?? ">";
  const sortedRules = [...s2.rules];
  if (firstOp === ">" || firstOp === ">=") {
    sortedRules.sort((a2, b2) => b2.value - a2.value);
  } else if (firstOp === "<" || firstOp === "<=") {
    sortedRules.sort((a2, b2) => a2.value - b2.value);
  }
  let jinja = "{{ ";
  for (let i4 = 0; i4 < sortedRules.length; i4++) {
    const rule = sortedRules[i4];
    if (i4 > 0) jinja += " else (";
    jinja += `'${rule.color}' if ${stateExpr} ${rule.operator} ${rule.value}`;
  }
  jinja += ` else '${s2.defaultColor}'`;
  jinja += ")".repeat(sortedRules.length - 1);
  jinja += " }}";
  switch (s2.property) {
    case "icon-color":
      return `ha-state-icon {
  color: ${jinja} !important;
}`;
    case "background":
      return `ha-card {
  background: ${jinja};
}`;
    case "text-color":
      return `ha-card {
  color: ${jinja};
}`;
    case "accent-color":
      return `ha-card {
  --accent-color: ${jinja};
}`;
    case "border-color":
      return `ha-card {
  border: ${s2.borderWidth ?? 2}px solid ${jinja};
}`;
    default:
      return "";
  }
}
function generateCss(state, cardType) {
  const parts = [];
  const kf = animationKeyframes(state.animation);
  if (kf) parts.push(kf);
  const haCardDecls = [
    ...accentColorDecls(state.accentColor, cardType),
    ...filterDecls(state.filter),
    ...backgroundDecls(state.background),
    ...borderDecls(state.border),
    ...animationDecls(state.animation)
  ];
  if (haCardDecls.length > 0) {
    const body = haCardDecls.map((d2) => `  ${d2}`).join("\n");
    parts.push(`ha-card {
${body}
}`);
  }
  const thresholdOwnsIconColor = state.threshold.enabled && state.threshold.property === "icon-color";
  const iconColor = thresholdOwnsIconColor ? "" : iconColorBlock(state.iconColor);
  if (iconColor) parts.push(iconColor);
  const threshold = thresholdBlock(state.threshold);
  if (threshold) parts.push(threshold);
  const headingStyle = headingStyleBlocks(state.headingStyle);
  if (headingStyle) parts.push(headingStyle);
  if (state.advanced.rawCss.trim()) {
    parts.push(state.advanced.rawCss.trim());
  }
  return parts.join("\n\n");
}
function applyCardModStyle(css, existingConfig) {
  const trimmed = css.trim();
  if (!trimmed) {
    const { card_mod: _removed, ...rest } = existingConfig;
    return rest;
  }
  return {
    ...existingConfig,
    card_mod: { style: trimmed }
  };
}
const moduleStyles = i$5`
  :host {
    display: block;
  }

  .module {
    border: 1px solid var(--divider-color, #383838);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 12px;
  }

  .module-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;
    user-select: none;
    transition: background 0.15s ease;
  }

  .module-header:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .module-chevron {
    font-size: 9px;
    color: var(--secondary-text-color, #9e9e9e);
    width: 14px;
    flex-shrink: 0;
    transition: transform 0.15s ease;
  }

  .module-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
    flex: 1;
  }

  .module-body {
    padding: 12px 14px;
    border-top: 1px solid var(--divider-color, #383838);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .control-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 36px;
    gap: 8px;
  }

  .control-label {
    font-size: 12px;
    color: var(--secondary-text-color, #9e9e9e);
    flex-shrink: 0;
  }

  .control-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    justify-content: flex-end;
  }

  ha-slider {
    flex: 1;
    min-width: 100px;
    max-width: 160px;
  }

  .value-label {
    font-size: 11px;
    color: var(--secondary-text-color, #9e9e9e);
    min-width: 36px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  input[type='color'] {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--divider-color, #383838);
    cursor: pointer;
    padding: 0;
    background: none;
    flex-shrink: 0;
  }

  .color-label {
    font-size: 11px;
    color: var(--secondary-text-color, #9e9e9e);
    font-family: monospace;
  }

  .sub-label {
    font-size: 11px;
    color: var(--secondary-text-color, #9e9e9e);
    margin-bottom: 4px;
  }

  ha-select {
    width: 100%;
  }

  select {
    background: var(--card-background-color, #1c1c1c);
    color: var(--primary-text-color, #e1e1e1);
    border: 1px solid var(--divider-color, #383838);
    border-radius: 4px;
    padding: 6px 8px;
    font-size: 12px;
    cursor: pointer;
    width: 100%;
  }
`;
var __defProp$c = Object.defineProperty;
var __decorateClass$c = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i4 = decorators.length - 1, decorator; i4 >= 0; i4--)
    if (decorator = decorators[i4])
      result = decorator(target, key, result) || result;
  if (result) __defProp$c(target, key, result);
  return result;
};
class FilterModule extends i$2 {
  constructor() {
    super(...arguments);
    this.state = { ...DEFAULT_FILTER };
    this._open = false;
    this._brightness = DEFAULT_FILTER.brightness;
    this._blur = DEFAULT_FILTER.blur;
    this._transitionMs = DEFAULT_FILTER.transitionMs;
  }
  static {
    this.styles = [moduleStyles, i$5``];
  }
  firstUpdated() {
    this._open = this.state.enabled;
  }
  updated(changed) {
    if (changed.has("state")) {
      const prev = changed.get("state");
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
      this._brightness = this.state.brightness;
      this._blur = this.state.blur;
      this._transitionMs = this.state.transitionMs;
    }
  }
  _toggleOpen() {
    this._open = !this._open;
  }
  _emit(changes) {
    this.dispatchEvent(
      new CustomEvent("state-changed", {
        detail: { ...this.state, ...changes }
      })
    );
  }
  render() {
    return b`
      <div class="module">
        <div class="module-header" @click=${this._toggleOpen}>
          <span class="module-chevron">${this._open ? "▼" : "▶"}</span>
          <span class="module-title">🔲 Visual Filters</span>
          <ha-switch
            .checked=${this.state.enabled}
            @click=${(e2) => e2.stopPropagation()}
            @change=${(e2) => this._emit({ enabled: e2.target.checked })}
          ></ha-switch>
        </div>
        ${this._open ? this._renderBody() : A}
      </div>
    `;
  }
  _renderBody() {
    return b`
      <div class="module-body">
        <!-- Grayscale -->
        <div class="control-row">
          <span class="control-label">Grayscale</span>
          <div class="control-right">
            <ha-switch
              .checked=${this.state.grayscale}
              @change=${(e2) => this._emit({ grayscale: e2.target.checked })}
            ></ha-switch>
          </div>
        </div>

        ${this.state.grayscale ? b`
              <div class="control-row">
                <span class="control-label">Apply when</span>
                <div class="control-right">
                  <select
                    .value=${this.state.grayscaleWhen}
                    @change=${(e2) => this._emit({
      grayscaleWhen: e2.target.value
    })}
                  >
                    <option
                      value="always"
                      ?selected=${this.state.grayscaleWhen === "always"}
                    >Always</option>
                    <option
                      value="off"
                      ?selected=${this.state.grayscaleWhen === "off"}
                    >Entity OFF</option>
                    <option
                      value="on"
                      ?selected=${this.state.grayscaleWhen === "on"}
                    >Entity ON</option>
                  </select>
                </div>
              </div>
            ` : A}

        <!-- Brightness -->
        <div class="control-row">
          <span class="control-label">Brightness</span>
          <div class="control-right">
            <ha-slider
              min="0"
              max="200"
              step="5"
              .value=${String(this._brightness)}
              @input=${(e2) => {
      this._brightness = parseFloat(e2.target.value);
    }}
              @change=${(e2) => this._emit({
      brightness: parseFloat(e2.target.value)
    })}
            ></ha-slider>
            <span class="value-label">${this._brightness}%</span>
          </div>
        </div>

        <!-- Blur -->
        <div class="control-row">
          <span class="control-label">Blur</span>
          <div class="control-right">
            <ha-slider
              min="0"
              max="20"
              step="1"
              .value=${String(this._blur)}
              @input=${(e2) => {
      this._blur = parseFloat(e2.target.value);
    }}
              @change=${(e2) => this._emit({ blur: parseFloat(e2.target.value) })}
            ></ha-slider>
            <span class="value-label">${this._blur}px</span>
          </div>
        </div>

        <!-- Transition speed -->
        <div class="control-row">
          <span class="control-label">Transition speed</span>
          <div class="control-right">
            <ha-slider
              min="0"
              max="2000"
              step="50"
              .value=${String(this._transitionMs)}
              @input=${(e2) => {
      this._transitionMs = parseFloat(e2.target.value);
    }}
              @change=${(e2) => this._emit({
      transitionMs: parseFloat(e2.target.value)
    })}
            ></ha-slider>
            <span class="value-label">${this._transitionMs}ms</span>
          </div>
        </div>
      </div>
    `;
  }
}
__decorateClass$c([
  n2({ attribute: false })
], FilterModule.prototype, "state");
__decorateClass$c([
  r()
], FilterModule.prototype, "_open");
__decorateClass$c([
  r()
], FilterModule.prototype, "_brightness");
__decorateClass$c([
  r()
], FilterModule.prototype, "_blur");
__decorateClass$c([
  r()
], FilterModule.prototype, "_transitionMs");
customElements.define("cms-filter-module", FilterModule);
var __defProp$b = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass$b = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i4 = decorators.length - 1, decorator; i4 >= 0; i4--)
    if (decorator = decorators[i4])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp$b(target, key, result);
  return result;
};
const HA_COLOR_PRESETS = [
  { name: "Red", variable: "var(--red-color)", hex: "#F44336" },
  { name: "Pink", variable: "var(--pink-color)", hex: "#E91E63" },
  { name: "Purple", variable: "var(--purple-color)", hex: "#9C27B0" },
  { name: "Blue", variable: "var(--blue-color)", hex: "#2196F3" },
  { name: "Cyan", variable: "var(--cyan-color)", hex: "#00BCD4" },
  { name: "Teal", variable: "var(--teal-color)", hex: "#009688" },
  { name: "Green", variable: "var(--green-color)", hex: "#4CAF50" },
  { name: "Yellow", variable: "var(--yellow-color)", hex: "#FFEB3B" },
  { name: "Orange", variable: "var(--orange-color)", hex: "#FF9800" },
  { name: "Grey", variable: "var(--grey-color)", hex: "#9E9E9E" }
];
let CmsColorPicker = class extends i$2 {
  constructor() {
    super(...arguments);
    this.value = "#ffffff";
  }
  render() {
    return b`
      <div class="container">
        <div class="presets">
          ${HA_COLOR_PRESETS.map((p2) => b`
            <div
              class="preset ${this.value === p2.variable ? "selected" : ""}"
              style="background: ${p2.hex}"
              title="${p2.name} (${p2.variable})"
              @click=${() => this._selectPreset(p2)}
            ></div>
          `)}
        </div>
        <div class="custom">
          <input type="color" .value=${this._toHex(this.value)} @input=${this._onColorInput} />
          <input type="text" .value=${this.value} @change=${this._onTextChange} placeholder="Color or var(--name)" />
        </div>
      </div>
    `;
  }
  _selectPreset(preset) {
    this.value = preset.variable;
    this._emit();
  }
  _onColorInput(e2) {
    this.value = e2.target.value;
    this._emit();
  }
  _onTextChange(e2) {
    this.value = e2.target.value;
    this._emit();
  }
  _toHex(val) {
    if (val.startsWith("var(")) {
      const preset = HA_COLOR_PRESETS.find((p2) => p2.variable === val);
      return preset?.hex || "#888888";
    }
    return val;
  }
  _emit() {
    this.dispatchEvent(new CustomEvent("color-changed", {
      detail: { value: this.value },
      bubbles: true,
      composed: true
    }));
  }
};
CmsColorPicker.styles = i$5`
    :host { display: block; }
    .container { display: flex; flex-direction: column; gap: 8px; }
    .presets { display: flex; flex-wrap: wrap; gap: 4px; }
    .preset {
      width: 24px; height: 24px;
      border-radius: 4px;
      border: 2px solid transparent;
      cursor: pointer;
    }
    .preset:hover { border-color: var(--primary-color, #03a9f4); }
    .preset.selected { border-color: var(--primary-color, #03a9f4); }
    .custom { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
    .custom input[type="color"] { width: 32px; height: 24px; padding: 0; border: none; }
    .custom input[type="text"] { flex: 1; padding: 4px; font-size: 12px; }
  `;
__decorateClass$b([
  n2()
], CmsColorPicker.prototype, "value", 2);
CmsColorPicker = __decorateClass$b([
  t("cms-color-picker")
], CmsColorPicker);
var __defProp$a = Object.defineProperty;
var __decorateClass$a = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i4 = decorators.length - 1, decorator; i4 >= 0; i4--)
    if (decorator = decorators[i4])
      result = decorator(target, key, result) || result;
  if (result) __defProp$a(target, key, result);
  return result;
};
class IconColorModule extends i$2 {
  constructor() {
    super(...arguments);
    this.state = {
      ...DEFAULT_ICON_COLOR
    };
    this.stateAware = true;
    this.isLightCard = false;
    this._open = false;
  }
  static {
    this.styles = [moduleStyles];
  }
  firstUpdated() {
    this._open = this.state.enabled;
  }
  updated(changed) {
    if (changed.has("state")) {
      const prev = changed.get("state");
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
    }
  }
  _toggleOpen() {
    this._open = !this._open;
  }
  _emit(changes) {
    this.dispatchEvent(
      new CustomEvent("state-changed", {
        detail: { ...this.state, ...changes }
      })
    );
  }
  render() {
    return b`
      <div class="module">
        <div class="module-header" @click=${this._toggleOpen}>
          <span class="module-chevron">${this._open ? "▼" : "▶"}</span>
          <span class="module-title">🎨 Icon Color</span>
          <ha-switch
            .checked=${this.state.enabled}
            @click=${(e2) => e2.stopPropagation()}
            @change=${(e2) => this._emit({ enabled: e2.target.checked })}
          ></ha-switch>
        </div>
        ${this._open ? this._renderBody() : A}
      </div>
    `;
  }
  _renderBody() {
    const effectiveMode = !this.stateAware ? "plain" : this.state.mode;
    return b`
      <div class="module-body">
        ${this.stateAware ? b`
              <div class="control-row">
                <span class="control-label">Mode</span>
                <div class="control-right">
                  <select
                    .value=${effectiveMode}
                    @change=${(e2) => this._emit({
      mode: e2.target.value
    })}
                  >
                    <option value="plain" ?selected=${effectiveMode === "plain"}>
                      Single color
                    </option>
                    <option
                      value="conditional"
                      ?selected=${effectiveMode === "conditional"}
                    >
                      ON / OFF colors
                    </option>
                    ${this.isLightCard ? b`<option value="light" ?selected=${effectiveMode === "light"}>
                          Light color (auto)
                        </option>` : A}
                  </select>
                </div>
              </div>
            ` : A}

        ${effectiveMode === "plain" ? b`
              <div class="control-row">
                <span class="control-label">Color</span>
                <div class="control-right">
                  <cms-color-picker
                    .value=${this.state.color}
                    @color-changed=${(e2) => this._emit({ color: e2.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
            ` : effectiveMode === "light" ? b`
              <div class="control-row">
                <span class="control-label">Color when OFF</span>
                <div class="control-right">
                  <cms-color-picker
                    .value=${this.state.colorOff}
                    @color-changed=${(e2) => this._emit({ colorOff: e2.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
              <div class="control-row">
                <span class="control-label" style="font-size:11px;color:var(--secondary-text-color,#9e9e9e)">
                  When ON: uses the light's actual color automatically
                </span>
              </div>
            ` : b`
              <div class="control-row">
                <span class="control-label">Color when ON</span>
                <div class="control-right">
                  <cms-color-picker
                    .value=${this.state.colorOn}
                    @color-changed=${(e2) => this._emit({ colorOn: e2.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
              <div class="control-row">
                <span class="control-label">Color when OFF</span>
                <div class="control-right">
                  <cms-color-picker
                    .value=${this.state.colorOff}
                    @color-changed=${(e2) => this._emit({ colorOff: e2.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
            `}
      </div>
    `;
  }
}
__decorateClass$a([
  n2({ attribute: false })
], IconColorModule.prototype, "state");
__decorateClass$a([
  n2({ type: Boolean, attribute: "state-aware" })
], IconColorModule.prototype, "stateAware");
__decorateClass$a([
  n2({ type: Boolean, attribute: "is-light-card" })
], IconColorModule.prototype, "isLightCard");
__decorateClass$a([
  r()
], IconColorModule.prototype, "_open");
customElements.define("cms-icon-color-module", IconColorModule);
var __defProp$9 = Object.defineProperty;
var __decorateClass$9 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i4 = decorators.length - 1, decorator; i4 >= 0; i4--)
    if (decorator = decorators[i4])
      result = decorator(target, key, result) || result;
  if (result) __defProp$9(target, key, result);
  return result;
};
class AccentColorModule extends i$2 {
  constructor() {
    super(...arguments);
    this.state = {
      ...DEFAULT_ACCENT_COLOR
    };
    this._open = false;
  }
  static {
    this.styles = [moduleStyles];
  }
  firstUpdated() {
    this._open = this.state.enabled;
  }
  updated(changed) {
    if (changed.has("state")) {
      const prev = changed.get("state");
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
    }
  }
  _toggleOpen() {
    this._open = !this._open;
  }
  _emit(changes) {
    this.dispatchEvent(
      new CustomEvent("state-changed", {
        detail: { ...this.state, ...changes }
      })
    );
  }
  render() {
    return b`
      <div class="module">
        <div class="module-header" @click=${this._toggleOpen}>
          <span class="module-chevron">${this._open ? "▼" : "▶"}</span>
          <span class="module-title">🌈 Accent Color</span>
          <ha-switch
            .checked=${this.state.enabled}
            @click=${(e2) => e2.stopPropagation()}
            @change=${(e2) => this._emit({ enabled: e2.target.checked })}
          ></ha-switch>
        </div>
        ${this._open ? b`
              <div class="module-body">
                <div class="control-row">
                  <span class="control-label">Color (--accent-color)</span>
                  <div class="control-right">
                    <cms-color-picker
                      .value=${this.state.color}
                      @color-changed=${(e2) => this._emit({ color: e2.detail.value })}
                    ></cms-color-picker>
                  </div>
                </div>
                <p
                  style="margin:4px 0 0;font-size:11px;color:var(--secondary-text-color,#9e9e9e);"
                >
                  Sets <code>--accent-color</code> on ha-card. Affects graph line
                  color, highlighted borders, and other themed elements.
                </p>
              </div>
            ` : A}
      </div>
    `;
  }
}
__decorateClass$9([
  n2({ attribute: false })
], AccentColorModule.prototype, "state");
__decorateClass$9([
  r()
], AccentColorModule.prototype, "_open");
customElements.define("cms-accent-color-module", AccentColorModule);
var __defProp$8 = Object.defineProperty;
var __decorateClass$8 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i4 = decorators.length - 1, decorator; i4 >= 0; i4--)
    if (decorator = decorators[i4])
      result = decorator(target, key, result) || result;
  if (result) __defProp$8(target, key, result);
  return result;
};
class BackgroundModule extends i$2 {
  constructor() {
    super(...arguments);
    this.state = {
      ...DEFAULT_BACKGROUND
    };
    this._open = false;
    this._angle = DEFAULT_BACKGROUND.angle;
  }
  static {
    this.styles = [moduleStyles, i$5``];
  }
  firstUpdated() {
    this._open = this.state.enabled;
  }
  updated(changed) {
    if (changed.has("state")) {
      const prev = changed.get("state");
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
      this._angle = this.state.angle;
    }
  }
  _toggleOpen() {
    this._open = !this._open;
  }
  _emit(changes) {
    this.dispatchEvent(
      new CustomEvent("state-changed", {
        detail: { ...this.state, ...changes }
      })
    );
  }
  render() {
    return b`
      <div class="module">
        <div class="module-header" @click=${this._toggleOpen}>
          <span class="module-chevron">${this._open ? "▼" : "▶"}</span>
          <span class="module-title">🖼️ Background</span>
          <ha-switch
            .checked=${this.state.enabled}
            @click=${(e2) => e2.stopPropagation()}
            @change=${(e2) => this._emit({ enabled: e2.target.checked })}
          ></ha-switch>
        </div>
        ${this._open ? this._renderBody() : A}
      </div>
    `;
  }
  _renderBody() {
    return b`
      <div class="module-body">
        <div class="control-row">
          <span class="control-label">Type</span>
          <div class="control-right">
            <select
              .value=${this.state.type}
              @change=${(e2) => this._emit({
      type: e2.target.value
    })}
            >
              <option value="solid" ?selected=${this.state.type === "solid"}>Solid color</option>
              <option value="gradient" ?selected=${this.state.type === "gradient"}>
                Gradient
              </option>
            </select>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">
            ${this.state.type === "gradient" ? "Color 1" : "Color"}
          </span>
          <div class="control-right">
            <cms-color-picker
              .value=${this.state.color1}
              @color-changed=${(e2) => this._emit({ color1: e2.detail.value })}
            ></cms-color-picker>
          </div>
        </div>

        ${this.state.type === "gradient" ? b`
              <div class="control-row">
                <span class="control-label">Color 2</span>
                <div class="control-right">
                  <cms-color-picker
                    .value=${this.state.color2}
                    @color-changed=${(e2) => this._emit({ color2: e2.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>

              <div class="control-row">
                <span class="control-label">Angle</span>
                <div class="control-right">
                  <ha-slider
                    min="0"
                    max="360"
                    step="5"
                    .value=${String(this._angle)}
                    @input=${(e2) => {
      this._angle = parseFloat(e2.target.value);
    }}
                    @change=${(e2) => this._emit({
      angle: parseFloat(e2.target.value)
    })}
                  ></ha-slider>
                  <span class="value-label">${this._angle}°</span>
                </div>
              </div>
            ` : A}

        <div class="control-row">
          <span class="control-label">Apply when</span>
          <div class="control-right">
            <select
              .value=${this.state.applyWhen}
              @change=${(e2) => this._emit({
      applyWhen: e2.target.value
    })}
            >
              <option value="always" ?selected=${this.state.applyWhen === "always"}>
                Always
              </option>
              <option value="on" ?selected=${this.state.applyWhen === "on"}>
                Entity ON
              </option>
              <option value="off" ?selected=${this.state.applyWhen === "off"}>
                Entity OFF
              </option>
            </select>
          </div>
        </div>
      </div>
    `;
  }
}
__decorateClass$8([
  n2({ attribute: false })
], BackgroundModule.prototype, "state");
__decorateClass$8([
  r()
], BackgroundModule.prototype, "_open");
__decorateClass$8([
  r()
], BackgroundModule.prototype, "_angle");
customElements.define("cms-background-module", BackgroundModule);
var __defProp$7 = Object.defineProperty;
var __decorateClass$7 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i4 = decorators.length - 1, decorator; i4 >= 0; i4--)
    if (decorator = decorators[i4])
      result = decorator(target, key, result) || result;
  if (result) __defProp$7(target, key, result);
  return result;
};
const PRESETS = [
  { value: "pulse", label: "Pulse (gentle scale)" },
  { value: "breathe", label: "Breathe (opacity fade)" },
  { value: "gradient-shift", label: "Gradient Shift (requires gradient bg)" },
  { value: "blink", label: "Blink (alert pulse)" },
  { value: "bounce", label: "Bounce (vertical)" }
];
class AnimationModule extends i$2 {
  constructor() {
    super(...arguments);
    this.state = {
      ...DEFAULT_ANIMATION
    };
    this._open = false;
    this._speedS = DEFAULT_ANIMATION.speedS;
  }
  static {
    this.styles = [moduleStyles, i$5``];
  }
  firstUpdated() {
    this._open = this.state.enabled;
  }
  updated(changed) {
    if (changed.has("state")) {
      const prev = changed.get("state");
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
      this._speedS = this.state.speedS;
    }
  }
  _toggleOpen() {
    this._open = !this._open;
  }
  _emit(changes) {
    this.dispatchEvent(
      new CustomEvent("state-changed", {
        detail: { ...this.state, ...changes }
      })
    );
  }
  render() {
    return b`
      <div class="module">
        <div class="module-header" @click=${this._toggleOpen}>
          <span class="module-chevron">${this._open ? "▼" : "▶"}</span>
          <span class="module-title">✨ Animation</span>
          <ha-switch
            .checked=${this.state.enabled}
            @click=${(e2) => e2.stopPropagation()}
            @change=${(e2) => this._emit({ enabled: e2.target.checked })}
          ></ha-switch>
        </div>
        ${this._open ? this._renderBody() : A}
      </div>
    `;
  }
  _renderBody() {
    return b`
      <div class="module-body">
        <div class="control-row">
          <span class="control-label">Preset</span>
          <div class="control-right">
            <select
              .value=${this.state.preset}
              @change=${(e2) => this._emit({
      preset: e2.target.value
    })}
            >
              ${PRESETS.map(
      (p2) => b`
                  <option value=${p2.value} ?selected=${this.state.preset === p2.value}>
                    ${p2.label}
                  </option>
                `
    )}
            </select>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Speed</span>
          <div class="control-right">
            <ha-slider
              min="0.5"
              max="10"
              step="0.5"
              .value=${String(this._speedS)}
              @input=${(e2) => {
      this._speedS = parseFloat(e2.target.value);
    }}
              @change=${(e2) => this._emit({
      speedS: parseFloat(e2.target.value)
    })}
            ></ha-slider>
            <span class="value-label">${this._speedS}s</span>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Trigger</span>
          <div class="control-right">
            <select
              .value=${this.state.trigger}
              @change=${(e2) => this._emit({
      trigger: e2.target.value
    })}
            >
              <option value="always" ?selected=${this.state.trigger === "always"}>
                Always
              </option>
              <option value="on" ?selected=${this.state.trigger === "on"}>
                When entity ON
              </option>
              <option value="off" ?selected=${this.state.trigger === "off"}>
                When entity OFF
              </option>
              <option value="custom" ?selected=${this.state.trigger === "custom"}>
                Custom entity
              </option>
            </select>
          </div>
        </div>

        ${this.state.trigger === "custom" ? b`
              <div class="control-row">
                <span class="control-label">Entity</span>
                <div class="control-right">
                  <input
                    type="text"
                    placeholder="input_boolean.my_entity"
                    .value=${this.state.customEntity ?? ""}
                    @change=${(e2) => this._emit({
      customEntity: e2.target.value.trim()
    })}
                    style="flex:1;background:var(--card-background-color,#1c1c1c);color:var(--primary-text-color,#e1e1e1);border:1px solid var(--divider-color,#383838);border-radius:4px;padding:6px 8px;font-size:12px;"
                  />
                </div>
              </div>
            ` : A}

        ${this.state.preset === "gradient-shift" ? b`
              <p
                style="margin:0;font-size:11px;color:var(--secondary-text-color,#9e9e9e);"
              >
                ⚠️ Gradient Shift requires a gradient background to be set.
              </p>
            ` : A}
      </div>
    `;
  }
}
__decorateClass$7([
  n2({ attribute: false })
], AnimationModule.prototype, "state");
__decorateClass$7([
  r()
], AnimationModule.prototype, "_open");
__decorateClass$7([
  r()
], AnimationModule.prototype, "_speedS");
customElements.define("cms-animation-module", AnimationModule);
var __defProp$6 = Object.defineProperty;
var __decorateClass$6 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i4 = decorators.length - 1, decorator; i4 >= 0; i4--)
    if (decorator = decorators[i4])
      result = decorator(target, key, result) || result;
  if (result) __defProp$6(target, key, result);
  return result;
};
class BorderModule extends i$2 {
  constructor() {
    super(...arguments);
    this.state = { ...DEFAULT_BORDER };
    this._open = false;
    this._radiusPx = DEFAULT_BORDER.radiusPx;
    this._borderWidth = DEFAULT_BORDER.borderWidth;
  }
  static {
    this.styles = [moduleStyles, i$5``];
  }
  firstUpdated() {
    this._open = this.state.enabled;
  }
  updated(changed) {
    if (changed.has("state")) {
      const prev = changed.get("state");
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
      this._radiusPx = this.state.radiusPx;
      this._borderWidth = this.state.borderWidth;
    }
  }
  _toggleOpen() {
    this._open = !this._open;
  }
  _emit(changes) {
    this.dispatchEvent(
      new CustomEvent("state-changed", {
        detail: { ...this.state, ...changes }
      })
    );
  }
  render() {
    return b`
      <div class="module">
        <div class="module-header" @click=${this._toggleOpen}>
          <span class="module-chevron">${this._open ? "▼" : "▶"}</span>
          <span class="module-title">⬛ Border & Radius</span>
          <ha-switch
            .checked=${this.state.enabled}
            @click=${(e2) => e2.stopPropagation()}
            @change=${(e2) => this._emit({ enabled: e2.target.checked })}
          ></ha-switch>
        </div>
        ${this._open ? this._renderBody() : A}
      </div>
    `;
  }
  _renderBody() {
    return b`
      <div class="module-body">
        <div class="control-row">
          <span class="control-label">Border radius</span>
          <div class="control-right">
            <ha-slider
              min="0"
              max="50"
              step="1"
              .value=${String(this._radiusPx)}
              @input=${(e2) => {
      this._radiusPx = parseFloat(e2.target.value);
    }}
              @change=${(e2) => this._emit({
      radiusPx: parseFloat(e2.target.value)
    })}
            ></ha-slider>
            <span class="value-label">${this._radiusPx}px</span>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Border width</span>
          <div class="control-right">
            <ha-slider
              min="0"
              max="8"
              step="1"
              .value=${String(this._borderWidth)}
              @input=${(e2) => {
      this._borderWidth = parseFloat(e2.target.value);
    }}
              @change=${(e2) => this._emit({
      borderWidth: parseFloat(e2.target.value)
    })}
            ></ha-slider>
            <span class="value-label">${this._borderWidth}px</span>
          </div>
        </div>

        ${this.state.borderWidth > 0 || this._borderWidth > 0 ? b`
              <div class="control-row">
                <span class="control-label">Border color</span>
                <div class="control-right">
                  <cms-color-picker
                    .value=${this.state.borderColor}
                    @color-changed=${(e2) => this._emit({ borderColor: e2.detail.value })}
                  ></cms-color-picker>
                </div>
              </div>
            ` : A}
      </div>
    `;
  }
}
__decorateClass$6([
  n2({ attribute: false })
], BorderModule.prototype, "state");
__decorateClass$6([
  r()
], BorderModule.prototype, "_open");
__decorateClass$6([
  r()
], BorderModule.prototype, "_radiusPx");
__decorateClass$6([
  r()
], BorderModule.prototype, "_borderWidth");
customElements.define("cms-border-module", BorderModule);
var __defProp$5 = Object.defineProperty;
var __decorateClass$5 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i4 = decorators.length - 1, decorator; i4 >= 0; i4--)
    if (decorator = decorators[i4])
      result = decorator(target, key, result) || result;
  if (result) __defProp$5(target, key, result);
  return result;
};
class ThresholdModule extends i$2 {
  constructor() {
    super(...arguments);
    this.state = {
      ...DEFAULT_THRESHOLD
    };
    this.cardEntity = "";
    this._open = false;
  }
  static {
    this.styles = [
      moduleStyles,
      i$5`
      .rule {
        display: flex;
        gap: 6px;
        align-items: center;
        margin-bottom: 8px;
        padding: 8px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 4px;
      }
      .rule select,
      .rule input[type='number'] {
        padding: 4px 6px;
        font-size: 12px;
        background: var(--card-background-color, #1c1c1c);
        color: var(--primary-text-color, #e1e1e1);
        border: 1px solid var(--divider-color, #383838);
        border-radius: 4px;
      }
      .rule input[type='number'] {
        width: 70px;
      }
      .rule select {
        width: 60px;
      }
      .rule input[type='color'] {
        width: 32px;
        height: 24px;
        padding: 0;
        border: 1px solid var(--divider-color, #383838);
        border-radius: 4px;
        cursor: pointer;
      }
      .rule button {
        padding: 2px 8px;
        cursor: pointer;
        background: rgba(255, 0, 0, 0.15);
        color: #ff6b6b;
        border: 1px solid rgba(255, 0, 0, 0.3);
        border-radius: 4px;
        font-size: 14px;
        line-height: 1;
      }
      .rule button:hover {
        background: rgba(255, 0, 0, 0.25);
      }
      .rule-label {
        font-size: 11px;
        color: var(--secondary-text-color, #9e9e9e);
      }
      .add-btn {
        margin-top: 8px;
        padding: 6px 12px;
        cursor: pointer;
        background: rgba(33, 150, 243, 0.15);
        color: #2196f3;
        border: 1px solid rgba(33, 150, 243, 0.3);
        border-radius: 4px;
        font-size: 12px;
        width: 100%;
      }
      .add-btn:hover {
        background: rgba(33, 150, 243, 0.25);
      }
      .entity-input {
        width: 100%;
        padding: 6px 8px;
        font-size: 12px;
        background: var(--card-background-color, #1c1c1c);
        color: var(--primary-text-color, #e1e1e1);
        border: 1px solid var(--divider-color, #383838);
        border-radius: 4px;
        font-family: monospace;
      }
      .rules-container {
        margin-top: 12px;
      }
      .rules-label {
        font-size: 11px;
        color: var(--secondary-text-color, #9e9e9e);
        margin-bottom: 8px;
        display: block;
      }
    `
    ];
  }
  firstUpdated() {
    this._open = this.state.enabled;
  }
  updated(changed) {
    if (changed.has("state")) {
      const prev = changed.get("state");
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
    }
  }
  _toggleOpen() {
    this._open = !this._open;
  }
  _emit(changes) {
    const newState = { ...this.state, ...changes };
    if (changes.enabled && !newState.entityId && this.cardEntity) {
      newState.entityId = this.cardEntity;
    }
    this.dispatchEvent(
      new CustomEvent("state-changed", {
        detail: newState
      })
    );
  }
  render() {
    return b`
      <div class="module">
        <div class="module-header" @click=${this._toggleOpen}>
          <span class="module-chevron">${this._open ? "▼" : "▶"}</span>
          <span class="module-title">🎯 Threshold Colors</span>
          <ha-switch
            .checked=${this.state.enabled}
            @click=${(e2) => e2.stopPropagation()}
            @change=${(e2) => this._emit({ enabled: e2.target.checked })}
          ></ha-switch>
        </div>
        ${this._open ? this._renderBody() : A}
      </div>
    `;
  }
  _renderBody() {
    return b`
      <div class="module-body">
        <div class="control-row">
          <span class="control-label">Entity ID</span>
        </div>
        <input
          class="entity-input"
          type="text"
          .value=${this.state.entityId || this.cardEntity}
          @input=${(e2) => this._emit({ entityId: e2.target.value })}
          placeholder=${this.cardEntity || "sensor.temperature"}
        />

        <div class="control-row">
          <span class="control-label">Apply to</span>
          <div class="control-right">
            <select
              .value=${this.state.property}
              @change=${(e2) => this._emit({
      property: e2.target.value
    })}
            >
              <option value="icon-color" ?selected=${this.state.property === "icon-color"}>
                Icon Color
              </option>
              <option value="accent-color" ?selected=${this.state.property === "accent-color"}>
                Accent Color
              </option>
              <option value="background" ?selected=${this.state.property === "background"}>
                Background
              </option>
              <option value="text-color" ?selected=${this.state.property === "text-color"}>
                Text Color
              </option>
              <option value="border-color" ?selected=${this.state.property === "border-color"}>
                Border Color
              </option>
            </select>
          </div>
        </div>

        ${this.state.property === "border-color" ? b`
              <div class="control-row">
                <span class="control-label">Border width</span>
                <div class="control-right">
                  <input
                    type="number"
                    min="1"
                    max="16"
                    style="width:60px"
                    .value=${String(this.state.borderWidth ?? 2)}
                    @input=${(e2) => this._emit({
      borderWidth: Math.max(1, parseFloat(e2.target.value) || 2)
    })}
                  />
                  <span class="rule-label">px</span>
                </div>
              </div>
            ` : A}

        <div class="rules-container">
          <span class="rules-label">Rules (evaluated top to bottom):</span>
          ${this.state.rules.map((rule, i4) => this._renderRule(rule, i4))}
          <button class="add-btn" @click=${this._addRule}>+ Add Rule</button>
        </div>

        <div class="control-row" style="margin-top: 12px;">
          <span class="control-label">Default color</span>
          <div class="control-right">
            <input
              type="color"
              .value=${this._toHex(this.state.defaultColor)}
              @input=${(e2) => this._emit({ defaultColor: e2.target.value })}
            />
            <span class="color-label">${this.state.defaultColor}</span>
          </div>
        </div>
      </div>
    `;
  }
  _renderRule(rule, index) {
    return b`
      <div class="rule">
        <span class="rule-label">If value</span>
        <select
          .value=${rule.operator}
          @change=${(e2) => this._onOperatorChange(index, e2.target.value)}
        >
          <option value="<" ?selected=${rule.operator === "<"}>&lt;</option>
          <option value="<=" ?selected=${rule.operator === "<="}>&lt;=</option>
          <option value=">" ?selected=${rule.operator === ">"}>&gt;</option>
          <option value=">=" ?selected=${rule.operator === ">="}>&gt;=</option>
          <option value="==" ?selected=${rule.operator === "=="}>==</option>
          <option value="!=" ?selected=${rule.operator === "!="}>!=</option>
        </select>
        <input
          type="number"
          .value=${String(rule.value)}
          @input=${(e2) => this._onValueChange(index, e2.target.value)}
        />
        <span class="rule-label">→</span>
        <input
          type="color"
          .value=${this._toHex(rule.color)}
          @input=${(e2) => this._onRuleColorChange(index, e2.target.value)}
        />
        <button @click=${() => this._removeRule(index)}>×</button>
      </div>
    `;
  }
  _addRule() {
    const newRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      operator: "<",
      value: 0,
      color: "#2196F3"
    };
    this._emit({ rules: [...this.state.rules, newRule] });
  }
  _removeRule(index) {
    const rules = [...this.state.rules];
    rules.splice(index, 1);
    this._emit({ rules });
  }
  _onOperatorChange(index, operator) {
    const rules = [...this.state.rules];
    rules[index] = {
      ...rules[index],
      operator
    };
    this._emit({ rules });
  }
  _onValueChange(index, value) {
    const rules = [...this.state.rules];
    rules[index] = { ...rules[index], value: parseFloat(value) || 0 };
    this._emit({ rules });
  }
  _onRuleColorChange(index, color) {
    const rules = [...this.state.rules];
    rules[index] = { ...rules[index], color };
    this._emit({ rules });
  }
  /** Resolves any CSS color to a 6-digit hex for <input type="color">. */
  _toHex(value) {
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    if (/^#[0-9a-fA-F]{3}$/.test(value)) {
      return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r2, g2, b2] = ctx.getImageData(0, 0, 1, 1).data;
      return `#${r2.toString(16).padStart(2, "0")}${g2.toString(16).padStart(2, "0")}${b2.toString(16).padStart(2, "0")}`;
    } catch {
      return "#888888";
    }
  }
}
__decorateClass$5([
  n2({ attribute: false })
], ThresholdModule.prototype, "state");
__decorateClass$5([
  n2({ type: String })
], ThresholdModule.prototype, "cardEntity");
__decorateClass$5([
  r()
], ThresholdModule.prototype, "_open");
customElements.define("cms-threshold-module", ThresholdModule);
var __defProp$4 = Object.defineProperty;
var __decorateClass$4 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i4 = decorators.length - 1, decorator; i4 >= 0; i4--)
    if (decorator = decorators[i4])
      result = decorator(target, key, result) || result;
  if (result) __defProp$4(target, key, result);
  return result;
};
class AdvancedModule extends i$2 {
  constructor() {
    super(...arguments);
    this.state = { rawCss: "" };
    this.open = false;
  }
  static {
    this.styles = [
      moduleStyles,
      i$5`
      .toggle-btn {
        background: none;
        border: none;
        color: var(--secondary-text-color, #9e9e9e);
        font-size: 11px;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .editor-wrap {
        padding: 0 14px 12px;
        border-top: 1px solid var(--divider-color, #383838);
      }
      ha-code-editor {
        display: block;
        --code-mirror-height: 180px;
      }
      .hint {
        font-size: 11px;
        color: var(--secondary-text-color, #9e9e9e);
        margin: 6px 0 0;
      }
    `
    ];
  }
  _onValueChanged(e2) {
    this.dispatchEvent(
      new CustomEvent("state-changed", {
        detail: { rawCss: e2.detail.value }
      })
    );
  }
  render() {
    return b`
      <div class="module">
        <div class="module-header">
          <span class="module-title">⌨️ Advanced CSS</span>
          <button
            class="toggle-btn"
            @click=${() => {
      this.open = !this.open;
    }}
          >
            ${this.open ? "▲ Hide" : "▼ Show"}
          </button>
        </div>
        ${this.open ? b`
              <div class="editor-wrap">
                <ha-code-editor
                  mode="jinja2"
                  .value=${this.state.rawCss}
                  @value-changed=${this._onValueChanged}
                ></ha-code-editor>
                <p class="hint">
                  Raw CSS appended after visual module output. Supports Jinja2
                  templates just like card-mod.
                </p>
              </div>
            ` : ""}
      </div>
    `;
  }
}
__decorateClass$4([
  n2({ attribute: false })
], AdvancedModule.prototype, "state");
__decorateClass$4([
  n2({ type: Boolean })
], AdvancedModule.prototype, "open");
customElements.define("cms-advanced-module", AdvancedModule);
var __defProp$3 = Object.defineProperty;
var __decorateClass$3 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i4 = decorators.length - 1, decorator; i4 >= 0; i4--)
    if (decorator = decorators[i4])
      result = decorator(target, key, result) || result;
  if (result) __defProp$3(target, key, result);
  return result;
};
class HeadingStyleModule extends i$2 {
  constructor() {
    super(...arguments);
    this.state = {
      ...DEFAULT_HEADING_STYLE
    };
    this._open = false;
    this._fontSize = DEFAULT_HEADING_STYLE.fontSize;
    this._iconSize = DEFAULT_HEADING_STYLE.iconSize;
  }
  static {
    this.styles = [moduleStyles];
  }
  firstUpdated() {
    this._open = this.state.enabled;
  }
  updated(changed) {
    if (changed.has("state")) {
      const prev = changed.get("state");
      if (this.state.enabled && prev && !prev.enabled) this._open = true;
      this._fontSize = this.state.fontSize;
      this._iconSize = this.state.iconSize;
    }
  }
  _toggleOpen() {
    this._open = !this._open;
  }
  _emit(changes) {
    this.dispatchEvent(
      new CustomEvent("state-changed", {
        detail: { ...this.state, ...changes }
      })
    );
  }
  render() {
    return b`
      <div class="module">
        <div class="module-header" @click=${this._toggleOpen}>
          <span class="module-chevron">${this._open ? "▼" : "▶"}</span>
          <span class="module-title">🔤 Heading Style</span>
          <ha-switch
            .checked=${this.state.enabled}
            @click=${(e2) => e2.stopPropagation()}
            @change=${(e2) => this._emit({ enabled: e2.target.checked })}
          ></ha-switch>
        </div>
        ${this._open ? this._renderBody() : A}
      </div>
    `;
  }
  _renderBody() {
    return b`
      <div class="module-body">
        <div class="control-row">
          <span class="control-label">Font size</span>
          <div class="control-right">
            <ha-slider
              min="12"
              max="48"
              step="1"
              .value=${String(this._fontSize)}
              @input=${(e2) => {
      this._fontSize = parseFloat(e2.target.value);
    }}
              @change=${(e2) => this._emit({
      fontSize: parseFloat(e2.target.value)
    })}
            ></ha-slider>
            <span class="value-label">${this._fontSize}px</span>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Text color</span>
          <div class="control-right">
            <cms-color-picker
              .value=${this.state.textColor}
              @color-changed=${(e2) => this._emit({ textColor: e2.detail.value })}
            ></cms-color-picker>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Icon size</span>
          <div class="control-right">
            <ha-slider
              min="12"
              max="48"
              step="1"
              .value=${String(this._iconSize)}
              @input=${(e2) => {
      this._iconSize = parseFloat(e2.target.value);
    }}
              @change=${(e2) => this._emit({
      iconSize: parseFloat(e2.target.value)
    })}
            ></ha-slider>
            <span class="value-label">${this._iconSize}px</span>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Icon color</span>
          <div class="control-right">
            <cms-color-picker
              .value=${this.state.iconColor}
              @color-changed=${(e2) => this._emit({ iconColor: e2.detail.value })}
            ></cms-color-picker>
          </div>
        </div>

        <div class="control-row">
          <span class="control-label">Alignment</span>
          <div class="control-right">
            <select
              .value=${this.state.alignment}
              @change=${(e2) => this._emit({
      alignment: e2.target.value
    })}
            >
              <option value="left" ?selected=${this.state.alignment === "left"}>Left</option>
              <option value="center" ?selected=${this.state.alignment === "center"}>Center</option>
              <option value="right" ?selected=${this.state.alignment === "right"}>Right</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }
}
__decorateClass$3([
  n2({ attribute: false })
], HeadingStyleModule.prototype, "state");
__decorateClass$3([
  r()
], HeadingStyleModule.prototype, "_open");
__decorateClass$3([
  r()
], HeadingStyleModule.prototype, "_fontSize");
__decorateClass$3([
  r()
], HeadingStyleModule.prototype, "_iconSize");
customElements.define("cms-heading-style-module", HeadingStyleModule);
var __defProp$2 = Object.defineProperty;
var __decorateClass$2 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i4 = decorators.length - 1, decorator; i4 >= 0; i4--)
    if (decorator = decorators[i4])
      result = decorator(target, key, result) || result;
  if (result) __defProp$2(target, key, result);
  return result;
};
class EntitiesRowsModule extends i$2 {
  constructor() {
    super(...arguments);
    this.rows = [];
    this.styles = {};
    this._openRows = /* @__PURE__ */ new Set();
  }
  static {
    this.styles = [
      moduleStyles,
      i$5`
      .entity-section {
        border: 1px solid var(--divider-color, #383838);
        border-radius: 6px;
        overflow: hidden;
      }
      .entity-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        background: rgba(255, 255, 255, 0.03);
        cursor: pointer;
        user-select: none;
      }
      .entity-header:hover {
        background: rgba(255, 255, 255, 0.07);
      }
      .entity-chevron {
        font-size: 9px;
        color: var(--secondary-text-color, #9e9e9e);
        width: 12px;
        flex-shrink: 0;
      }
      .entity-name {
        font-size: 13px;
        font-weight: 500;
        flex-shrink: 0;
      }
      .entity-id {
        font-size: 11px;
        color: var(--secondary-text-color, #9e9e9e);
        font-family: monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
      }
      .style-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--accent-color, #2196f3);
        flex-shrink: 0;
      }
      .entity-body {
        padding: 12px 14px;
        border-top: 1px solid var(--divider-color, #383838);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      cms-color-picker {
        margin-top: 4px;
      }
    `
    ];
  }
  _emit(entityId, changes) {
    const current = this.styles[entityId] ?? { iconColor: "", textColor: "" };
    const updated = { ...current, ...changes };
    this.dispatchEvent(
      new CustomEvent("styles-changed", {
        detail: { ...this.styles, [entityId]: updated }
      })
    );
  }
  _toggleRow(entityId) {
    const next = new Set(this._openRows);
    if (next.has(entityId)) next.delete(entityId);
    else next.add(entityId);
    this._openRows = next;
  }
  render() {
    const entityRows = this.rows.filter(
      (r2) => !!r2.entity
    );
    if (!entityRows.length) return A;
    return b`
      <div class="module">
        <div class="module-header" style="cursor:default; pointer-events:none">
          <span class="module-title">🏠 Entities</span>
        </div>
        <div class="module-body">
          ${entityRows.map((row) => this._renderRow(row))}
        </div>
      </div>
    `;
  }
  _renderRow(row) {
    const id = row.entity;
    const label = row.name || id.split(".")[1] || id;
    const isOpen = this._openRows.has(id);
    const rowStyle = this.styles[id] ?? { iconColor: "", textColor: "" };
    const hasStyle = !!(rowStyle.iconColor || rowStyle.textColor);
    return b`
      <div class="entity-section">
        <div class="entity-header" @click=${() => this._toggleRow(id)}>
          <span class="entity-chevron">${isOpen ? "▼" : "▶"}</span>
          <span class="entity-name">${label}</span>
          <span class="entity-id">${id}</span>
          ${hasStyle ? b`<span class="style-dot"></span>` : A}
        </div>
        ${isOpen ? this._renderBody(id, rowStyle) : A}
      </div>
    `;
  }
  _renderBody(entityId, rowStyle) {
    return b`
      <div class="entity-body">
        <div class="control-row">
          <span class="control-label">Icon color</span>
          <div class="control-right">
            <ha-switch
              .checked=${!!rowStyle.iconColor}
              @change=${(e2) => this._emit(entityId, {
      iconColor: e2.target.checked ? "#2196F3" : ""
    })}
            ></ha-switch>
          </div>
        </div>
        ${rowStyle.iconColor ? b`<cms-color-picker
                .value=${rowStyle.iconColor}
                @color-changed=${(e2) => this._emit(entityId, { iconColor: e2.detail.value })}
              ></cms-color-picker>` : A}

        <div class="control-row">
          <span class="control-label">Text / state color</span>
          <div class="control-right">
            <ha-switch
              .checked=${!!rowStyle.textColor}
              @change=${(e2) => this._emit(entityId, {
      textColor: e2.target.checked ? "#e1e1e1" : ""
    })}
            ></ha-switch>
          </div>
        </div>
        ${rowStyle.textColor ? b`<cms-color-picker
                .value=${rowStyle.textColor}
                @color-changed=${(e2) => this._emit(entityId, { textColor: e2.detail.value })}
              ></cms-color-picker>` : A}
      </div>
    `;
  }
}
__decorateClass$2([
  n2({ attribute: false })
], EntitiesRowsModule.prototype, "rows");
__decorateClass$2([
  n2({ attribute: false })
], EntitiesRowsModule.prototype, "styles");
__decorateClass$2([
  r()
], EntitiesRowsModule.prototype, "_openRows");
customElements.define("cms-entities-rows-module", EntitiesRowsModule);
var __defProp$1 = Object.defineProperty;
var __decorateClass$1 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i4 = decorators.length - 1, decorator; i4 >= 0; i4--)
    if (decorator = decorators[i4])
      result = decorator(target, key, result) || result;
  if (result) __defProp$1(target, key, result);
  return result;
};
const NON_STATE_CARD_TYPES = /* @__PURE__ */ new Set([
  "sensor",
  "gauge",
  "history-graph",
  "statistics-graph",
  "statistic",
  "energy-distribution",
  "energy-usage-graph",
  "calendar",
  "todo-list",
  "weather-forecast",
  "sun",
  "map",
  "media-control"
]);
const CONTAINER_CARD_TYPES = /* @__PURE__ */ new Set([
  "grid",
  "vertical-stack",
  "horizontal-stack",
  "sections",
  "conditional"
]);
const NO_ANIMATION_TYPES = /* @__PURE__ */ new Set([
  "gauge",
  "history-graph",
  "statistics-graph",
  "statistic",
  "energy-distribution",
  "energy-usage-graph",
  "thermostat",
  "humidifier",
  "light",
  "alarm-panel",
  "media-control",
  "weather-forecast",
  "calendar",
  "logbook",
  "activity",
  "map",
  "iframe",
  "webpage",
  "shopping-list",
  "todo-list",
  "heading",
  "picture",
  "picture-entity",
  "picture-glance",
  "picture-elements"
]);
const NO_BACKGROUND_TYPES = /* @__PURE__ */ new Set([
  "picture",
  "picture-entity",
  "picture-glance",
  "picture-elements",
  "iframe",
  "webpage",
  "map"
]);
const NO_ICON_COLOR_TYPES = /* @__PURE__ */ new Set([
  "gauge",
  "history-graph",
  "statistics-graph",
  "statistic",
  "energy-distribution",
  "energy-usage-graph",
  "thermostat",
  "humidifier",
  "alarm-panel",
  "media-control",
  "weather-forecast",
  "calendar",
  "logbook",
  "activity",
  "markdown",
  "map",
  "iframe",
  "webpage",
  "shopping-list",
  "todo-list",
  "picture",
  "picture-entity",
  "heading"
]);
class CmsPanel extends i$2 {
  constructor() {
    super(...arguments);
    this._cardModPresent = false;
    this._studioState = null;
    this._previewConfig = void 0;
    this._previewKey = 0;
    this._presets = [];
    this._selectedPreset = "";
    this._entityRowStyles = {};
    this._lastEmittedConfigJson = null;
  }
  connectedCallback() {
    super.connectedCallback();
    this._cardModPresent = isCardModInstalled();
    void loadPresets(void 0).then((p2) => {
      this._presets = p2;
    });
  }
  updated(changed) {
    super.updated(changed);
    if (changed.has("config") || changed.has("hass")) {
      this._initState();
      this._previewConfig = void 0;
    }
    if (changed.has("hass") && this.hass && !changed.get("hass")) {
      void loadPresets(this.hass).then((p2) => {
        this._presets = p2;
      });
    }
  }
  _initState() {
    if (!this.config) {
      this._studioState = null;
      this._entityRowStyles = {};
      this._lastEmittedConfigJson = null;
      return;
    }
    const configJson = JSON.stringify(this.config);
    if (configJson === this._lastEmittedConfigJson) return;
    const parsed = parseCardModConfig(this.config);
    this._studioState = mapToStudioState(parsed);
    this._initEntityRowStyles();
  }
  _initEntityRowStyles() {
    if (this.config?.type !== "entities") {
      this._entityRowStyles = {};
      return;
    }
    const rows = this.config.entities;
    if (!rows?.length) {
      this._entityRowStyles = {};
      return;
    }
    const styles = {};
    for (const row of rows) {
      if (!row.entity) continue;
      const cardModStyle = row.card_mod?.style;
      if (typeof cardModStyle === "string") {
        styles[row.entity] = this._parseEntityRowCss(cardModStyle);
      }
    }
    this._entityRowStyles = styles;
  }
  _parseEntityRowCss(css2) {
    const style = { iconColor: "", textColor: "" };
    const stateIconMatch = css2.match(/--state-icon-color\s*:\s*([^;}\n]+)/);
    const paperIconMatch = css2.match(/--paper-item-icon-color\s*:\s*([^;}\n]+)/);
    style.iconColor = (stateIconMatch?.[1] ?? paperIconMatch?.[1] ?? "").trim();
    const textMatch = css2.match(/(?<!--)(?:^|[;\s{])color\s*:\s*([^;}\n]+)/m);
    if (textMatch) style.textColor = textMatch[1].trim();
    return style;
  }
  _generateEntityRowCss(style) {
    const decls = [];
    if (style.iconColor) {
      decls.push(`  --state-icon-color: ${style.iconColor};`);
    }
    if (style.textColor) decls.push(`  color: ${style.textColor};`);
    if (!decls.length) return "";
    return `:host {
${decls.join("\n")}
}`;
  }
  _applyEntityRowStyles(config) {
    const rows = config.entities;
    if (!rows?.length) return config;
    const updatedRows = rows.map((row) => {
      if (!row.entity) return row;
      const rowStyle = this._entityRowStyles[row.entity];
      if (!rowStyle?.iconColor && !rowStyle?.textColor) {
        const { card_mod: _cm, ...rest } = row;
        return rest;
      }
      const rowCss = this._generateEntityRowCss(rowStyle);
      return { ...row, card_mod: { style: rowCss } };
    });
    return { ...config, entities: updatedRows };
  }
  // ---------------------------------------------------------------------------
  // Card-type helpers
  // ---------------------------------------------------------------------------
  get _isContainerCard() {
    return CONTAINER_CARD_TYPES.has(this.config?.type ?? "");
  }
  get _showIconColor() {
    if (this.config?.type === "entities") return false;
    return !NO_ICON_COLOR_TYPES.has(this.config?.type ?? "");
  }
  get _isEntitiesCard() {
    return this.config?.type === "entities";
  }
  get _showAnimation() {
    return !NO_ANIMATION_TYPES.has(this.config?.type ?? "");
  }
  get _showBackground() {
    return !NO_BACKGROUND_TYPES.has(this.config?.type ?? "");
  }
  get _showHeadingStyle() {
    return this.config?.type === "heading";
  }
  get _isLightCard() {
    return this.config?.type === "light";
  }
  get _isStateAware() {
    const entityId = this.config?.entity;
    if (!entityId || !this.hass) {
      return !NON_STATE_CARD_TYPES.has(this.config?.type ?? "");
    }
    const entity = this.hass.states[entityId];
    if (!entity) return !NON_STATE_CARD_TYPES.has(this.config?.type ?? "");
    const domain = entityId.split(".")[0];
    const binaryDomains = [
      "switch",
      "light",
      "binary_sensor",
      "input_boolean",
      "lock",
      "fan",
      "cover",
      "climate",
      "alarm_control_panel",
      "person",
      "automation",
      "script",
      "timer",
      "group",
      "input_button"
    ];
    return binaryDomains.includes(domain) || ["on", "off"].includes(entity.state);
  }
  // ---------------------------------------------------------------------------
  // Module state handlers
  // ---------------------------------------------------------------------------
  _onFilterChanged(e2) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, filter: e2.detail };
    this._emitConfigChanged();
  }
  _onIconColorChanged(e2) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, iconColor: e2.detail };
    this._emitConfigChanged();
  }
  _onAccentColorChanged(e2) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, accentColor: e2.detail };
    this._emitConfigChanged();
  }
  _onBackgroundChanged(e2) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, background: e2.detail };
    this._emitConfigChanged();
  }
  _onAnimationChanged(e2) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, animation: e2.detail };
    this._emitConfigChanged();
  }
  _onBorderChanged(e2) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, border: e2.detail };
    this._emitConfigChanged();
  }
  _onAdvancedChanged(e2) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, advanced: e2.detail };
    this._emitConfigChanged();
  }
  _onHeadingStyleChanged(e2) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, headingStyle: e2.detail };
    this._emitConfigChanged();
  }
  _onThresholdChanged(e2) {
    if (!this._studioState) return;
    this._studioState = { ...this._studioState, threshold: e2.detail };
    this._emitConfigChanged();
  }
  _emitConfigChanged() {
    if (!this.config || !this._studioState) return;
    const css2 = generateCss(this._studioState, this.config?.type);
    let newConfig = applyCardModStyle(css2, this.config);
    if (this.config.type === "entities") {
      newConfig = this._applyEntityRowStyles(newConfig);
    }
    this._previewConfig = newConfig;
    this._previewKey++;
    this._lastEmittedConfigJson = JSON.stringify(newConfig);
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        bubbles: true,
        composed: true,
        detail: { config: newConfig }
      })
    );
  }
  _onEntityRowStylesChanged(e2) {
    this._entityRowStyles = e2.detail;
    this._emitConfigChanged();
  }
  // ---------------------------------------------------------------------------
  // Preset management
  // ---------------------------------------------------------------------------
  _saveCurrentAsPreset() {
    if (!this._studioState) return;
    const name = window.prompt("Preset name:");
    if (!name?.trim()) return;
    const trimmed = name.trim();
    const updated = [
      ...this._presets.filter((p2) => p2.name !== trimmed),
      { name: trimmed, state: { ...this._studioState } }
    ];
    this._presets = updated;
    this._selectedPreset = trimmed;
    void savePresets(updated, this.hass);
  }
  _onPresetSelect(e2) {
    const name = e2.target.value;
    this._selectedPreset = name;
    if (!name) return;
    const preset = this._presets.find((p2) => p2.name === name);
    if (!preset) return;
    this._studioState = { ...preset.state };
    this._emitConfigChanged();
  }
  _deleteSelectedPreset() {
    if (!this._selectedPreset) return;
    const updated = this._presets.filter((p2) => p2.name !== this._selectedPreset);
    this._presets = updated;
    this._selectedPreset = "";
    void savePresets(updated, this.hass);
  }
  static {
    this.styles = i$5`
    :host {
      display: flex;
      flex-direction: column;
      position: absolute;
      inset: 0;
      z-index: 10;
      background: var(--card-background-color, var(--ha-card-background, #1c1c1c));
      font-family: var(--primary-font-family, sans-serif);
      color: var(--primary-text-color, #e1e1e1);
      box-sizing: border-box;
      overflow: hidden;
    }

    /* ---- Header ---- */

    .header {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--divider-color, #383838);
    }

    .header h2 { margin: 0; font-size: 16px; font-weight: 500; }
    .header .version {
      font-size: 11px;
      color: var(--secondary-text-color, #9e9e9e);
      margin-left: auto;
    }

    /* ---- Two-column body ---- */

    .panel-body {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 280px;
      overflow: hidden;
      min-height: 0;
    }

    .panel-body.no-preview {
      grid-template-columns: 1fr;
    }

    /* ---- Left column: modules ---- */

    .modules-col {
      overflow-y: auto;
      padding: 10px 14px 16px;
      min-width: 0;
    }

    /* ---- Preset bar ---- */

    .preset-bar {
      display: flex;
      gap: 6px;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--divider-color, #383838);
    }

    .preset-bar select {
      flex: 1;
      min-width: 0;
      padding: 5px 8px;
      font-size: 12px;
      background: var(--card-background-color, #1c1c1c);
      color: var(--primary-text-color, #e1e1e1);
      border: 1px solid var(--divider-color, #383838);
      border-radius: 4px;
    }

    .btn-preset-save {
      padding: 5px 10px;
      font-size: 12px;
      cursor: pointer;
      background: rgba(33, 150, 243, 0.15);
      color: #2196f3;
      border: 1px solid rgba(33, 150, 243, 0.3);
      border-radius: 4px;
      white-space: nowrap;
    }

    .btn-preset-save:hover { background: rgba(33, 150, 243, 0.25); }

    .btn-preset-delete {
      padding: 5px 8px;
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
      background: rgba(255, 0, 0, 0.12);
      color: #ff6b6b;
      border: 1px solid rgba(255, 0, 0, 0.25);
      border-radius: 4px;
    }

    .btn-preset-delete:hover { background: rgba(255, 0, 0, 0.22); }

    /* ---- Banners ---- */

    .warning-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 8px;
      background: rgba(255, 152, 0, 0.15);
      border: 1px solid #ff9800;
      color: #ff9800;
      font-size: 12px;
      margin-bottom: 10px;
    }

    .info-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      border-radius: 8px;
      background: rgba(33, 150, 243, 0.1);
      border: 1px solid #2196F3;
      color: #2196F3;
      font-size: 12px;
      margin-bottom: 10px;
    }

    .no-config {
      padding: 24px 16px;
      text-align: center;
      color: var(--secondary-text-color, #9e9e9e);
      border: 2px dashed var(--divider-color, #383838);
      border-radius: 8px;
      font-size: 13px;
    }

    .container-banner {
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(156, 39, 176, 0.12);
      border: 1px solid #9c27b0;
      color: #ce93d8;
      font-size: 12px;
      line-height: 1.5;
      margin-bottom: 10px;
    }

    .container-banner strong {
      display: block;
      margin-bottom: 4px;
      color: #e1bee7;
    }

    /* ---- Right column: preview ---- */

    .preview-col {
      border-left: 1px solid var(--divider-color, #383838);
      padding: 10px 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .preview-col-label {
      flex-shrink: 0;
      font-size: 11px;
      color: var(--secondary-text-color, #9e9e9e);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .preview-card-wrapper {
      flex: 1;
      overflow: auto;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      background: var(--lovelace-background, #111111);
      border-radius: 8px;
      padding: 12px;
      min-height: 0;
      /* Prevent clicking live card elements */
      pointer-events: none;
    }

    .preview-card-wrapper hui-card {
      width: 100%;
    }

    .preview-unavailable {
      font-size: 11px;
      color: var(--secondary-text-color, #9e9e9e);
      text-align: center;
      margin: auto;
    }
  `;
  }
  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  render() {
    const hasPreview = !!(this.config && this.hass);
    return b`
      <div class="header">
        <span>🎨</span>
        <h2>Card-Mod Studio</h2>
        <span class="version">v0.3.15</span>
      </div>

      <div class="panel-body ${hasPreview ? "" : "no-preview"}">
        <div class="modules-col">
          ${!this._cardModPresent ? b`<div class="warning-banner">
                ⚠️ card-mod not detected — install card-mod first or styles won't apply.
              </div>` : A}

          ${this._studioState ? b`
                ${this._renderPresetBar()}
                ${this._renderModuleList(this._studioState)}
              ` : b`<div class="no-config">No card selected.</div>`}
        </div>

        ${hasPreview ? b`
              <div class="preview-col">
                <span class="preview-col-label">Preview</span>
                <div class="preview-card-wrapper">
                  ${this._renderPreviewContent()}
                </div>
              </div>
            ` : A}
      </div>
    `;
  }
  _renderPreviewContent() {
    if (!this.config || !this.hass) return A;
    const hasHuiCard = Boolean(customElements.get("hui-card"));
    if (!hasHuiCard) {
      return b`<p class="preview-unavailable">Preview unavailable — open a card editor first.</p>`;
    }
    const previewConfig = this._previewConfig ?? this.config;
    return i3(
      this._previewKey,
      b`<hui-card .hass=${this.hass} .config=${previewConfig}></hui-card>`
    );
  }
  _renderPresetBar() {
    return b`
      <div class="preset-bar">
        <select .value=${this._selectedPreset} @change=${this._onPresetSelect}>
          <option value="">📋 Load preset…</option>
          ${this._presets.map(
      (p2) => b`<option value=${p2.name} ?selected=${p2.name === this._selectedPreset}>${p2.name}</option>`
    )}
        </select>
        ${this._selectedPreset ? b`<button class="btn-preset-delete" title="Delete preset" @click=${this._deleteSelectedPreset}>×</button>` : A}
        <button class="btn-preset-save" @click=${this._saveCurrentAsPreset}>💾 Save</button>
      </div>
    `;
  }
  _renderModuleList(s2) {
    if (this._isContainerCard) {
      return this._renderContainerCard(s2);
    }
    const stateAware = this._isStateAware;
    const showIconColor = this._showIconColor;
    const showAnimation = this._showAnimation;
    const showBackground = this._showBackground;
    const showHeadingStyle = this._showHeadingStyle;
    const hasUnrecognisedCss = !!s2.advanced.rawCss.trim();
    return b`
      ${hasUnrecognisedCss ? b`<div class="info-banner">
            ℹ️ Some existing styles weren't recognised — preserved in Advanced CSS.
          </div>` : A}

      ${showHeadingStyle ? b`<cms-heading-style-module
            .state=${s2.headingStyle}
            @state-changed=${this._onHeadingStyleChanged}
          ></cms-heading-style-module>` : A}

      <cms-filter-module
        .state=${s2.filter}
        @state-changed=${this._onFilterChanged}
      ></cms-filter-module>

      ${!showHeadingStyle && !this._isEntitiesCard ? b`<cms-accent-color-module
            .state=${s2.accentColor}
            @state-changed=${this._onAccentColorChanged}
          ></cms-accent-color-module>` : A}

      ${showIconColor ? b`<cms-icon-color-module
            .state=${s2.iconColor}
            ?state-aware=${stateAware}
            ?is-light-card=${this._isLightCard}
            @state-changed=${this._onIconColorChanged}
          ></cms-icon-color-module>` : A}

      ${!this._isEntitiesCard ? b`<cms-threshold-module
              .state=${s2.threshold}
              .cardEntity=${this.config?.entity ?? ""}
              @state-changed=${this._onThresholdChanged}
            ></cms-threshold-module>` : A}

      ${showBackground ? b`<cms-background-module
            .state=${s2.background}
            @state-changed=${this._onBackgroundChanged}
          ></cms-background-module>` : A}

      ${showAnimation ? b`<cms-animation-module
            .state=${s2.animation}
            @state-changed=${this._onAnimationChanged}
          ></cms-animation-module>` : A}

      <cms-border-module
        .state=${s2.border}
        @state-changed=${this._onBorderChanged}
      ></cms-border-module>

      <cms-advanced-module
        .state=${s2.advanced}
        ?open=${hasUnrecognisedCss}
        @state-changed=${this._onAdvancedChanged}
      ></cms-advanced-module>

      ${this.config?.type === "entities" ? b`<cms-entities-rows-module
              .rows=${this.config.entities ?? []}
              .styles=${this._entityRowStyles}
              @styles-changed=${this._onEntityRowStylesChanged}
            ></cms-entities-rows-module>` : A}
    `;
  }
  _renderContainerCard(s2) {
    const cardType = this.config?.type ?? "layout";
    const hasUnrecognisedCss = !!s2.advanced.rawCss.trim();
    return b`
      <div class="container-banner">
        <strong>🗂️ Layout card — style the child cards</strong>
        "${cardType}" is a container. Card-mod styles applied here have no
        visual effect. Open each child card individually and click the Style
        button there.
      </div>

      ${hasUnrecognisedCss ? b`<div class="info-banner">
            ℹ️ Some existing styles weren't recognised — preserved in Advanced CSS.
          </div>` : A}

      <cms-border-module
        .state=${s2.border}
        @state-changed=${this._onBorderChanged}
      ></cms-border-module>

      <cms-advanced-module
        .state=${s2.advanced}
        ?open=${hasUnrecognisedCss}
        @state-changed=${this._onAdvancedChanged}
      ></cms-advanced-module>
    `;
  }
}
__decorateClass$1([
  n2({ attribute: false })
], CmsPanel.prototype, "config");
__decorateClass$1([
  n2({ attribute: false })
], CmsPanel.prototype, "hass");
__decorateClass$1([
  r()
], CmsPanel.prototype, "_cardModPresent");
__decorateClass$1([
  r()
], CmsPanel.prototype, "_studioState");
__decorateClass$1([
  r()
], CmsPanel.prototype, "_previewConfig");
__decorateClass$1([
  r()
], CmsPanel.prototype, "_previewKey");
__decorateClass$1([
  r()
], CmsPanel.prototype, "_presets");
__decorateClass$1([
  r()
], CmsPanel.prototype, "_selectedPreset");
__decorateClass$1([
  r()
], CmsPanel.prototype, "_entityRowStyles");
customElements.define("cms-panel", CmsPanel);
var __defProp = Object.defineProperty;
var __decorateClass = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i4 = decorators.length - 1, decorator; i4 >= 0; i4--)
    if (decorator = decorators[i4])
      result = decorator(target, key, result) || result;
  if (result) __defProp(target, key, result);
  return result;
};
class CmsTabButton extends i$2 {
  constructor() {
    super(...arguments);
    this.active = false;
  }
  static {
    this.styles = i$5`
    :host {
      display: inline-flex;
      align-items: center;
    }

    button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: none;
      border-radius: 20px;
      cursor: pointer;
      font-size: 13px;
      font-family: var(--primary-font-family, sans-serif);
      font-weight: 500;
      transition: background 0.15s ease, color 0.15s ease;
      background: transparent;
      color: var(--secondary-text-color, #727272);
    }

    button:hover {
      background: var(--secondary-background-color, #f5f5f5);
      color: var(--primary-text-color, #212121);
    }

    :host([active]) button {
      background: var(--primary-color, #03a9f4);
      color: #fff;
    }

    :host([active]) button:hover {
      background: var(--dark-primary-color, #0288d1);
    }

    .icon {
      font-size: 16px;
      line-height: 1;
    }
  `;
  }
  _handleClick() {
    this.active = !this.active;
    this.dispatchEvent(
      new CustomEvent("cms-tab-toggle", {
        detail: { active: this.active },
        bubbles: true,
        composed: true
      })
    );
  }
  render() {
    return b`
      <button
        @click=${this._handleClick}
        title="${this.active ? "Close Card-Mod Studio" : "Open Card-Mod Studio style editor"}"
        aria-pressed="${this.active}"
      >
        <span class="icon">🎨</span>
        Style
      </button>
    `;
  }
}
__decorateClass([
  n2({ type: Boolean, reflect: true })
], CmsTabButton.prototype, "active");
customElements.define("cms-tab-button", CmsTabButton);
const CMS_BUTTON_ATTR = "data-cms-injected";
const CMS_PANEL_ID = "cms-style-panel";
const SECONDARY_ACTION_SELECTOR = "ha-button[slot=secondaryAction]";
function getPanelHost(dialog) {
  const root = dialog.shadowRoot;
  if (!root) return null;
  const cardEditor = root.querySelector("hui-card-element-editor");
  return cardEditor?.shadowRoot ?? root;
}
function tryExpandDialog(dialog) {
  const root = dialog.shadowRoot;
  if (!root) return;
  const haDialog = root.querySelector("ha-dialog");
  if (haDialog) {
    haDialog.style.setProperty("--mdc-dialog-max-height", "92vh");
  }
  const cardEditor = root.querySelector("hui-card-element-editor");
  if (cardEditor) {
    cardEditor.style.minHeight = "72vh";
  }
}
function togglePanel(dialog, active) {
  const host = getPanelHost(dialog);
  if (!host) return;
  let panel = host.getElementById(CMS_PANEL_ID);
  if (active) {
    tryExpandDialog(dialog);
    if (!panel) {
      panel = document.createElement("cms-panel");
      panel.id = CMS_PANEL_ID;
      panel.config = dialog._cardConfig;
      panel.hass = dialog.hass;
      host.appendChild(panel);
    } else {
      panel.config = dialog._cardConfig;
      panel.hass = dialog.hass;
      panel.style.display = "block";
    }
  } else {
    if (panel) {
      panel.style.display = "none";
    }
  }
}
function injectButton(dialog) {
  const root = dialog.shadowRoot;
  if (!root) return;
  if (root.querySelector(`[${CMS_BUTTON_ATTR}]`)) return;
  const existingButton = root.querySelector(SECONDARY_ACTION_SELECTOR);
  if (!existingButton) {
    const children = Array.from(root.children).map(
      (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (el.className ? `.${[...el.classList].join(".")}` : "") + (el.getAttribute("slot") ? `[slot=${el.getAttribute("slot")}]` : "")
    );
    console.warn(
      "[Card-Mod Studio] Could not find ha-button[slot=secondaryAction] in hui-dialog-edit-card shadow root. Style button will not appear. This may be caused by a Home Assistant update. Shadow root direct children: " + (children.length ? children.join(", ") : "(none)") + "\nPlease report at https://github.com/dertrolli/card-mod-visual-editor/issues"
    );
    return;
  }
  const tabButton = document.createElement("cms-tab-button");
  tabButton.setAttribute(CMS_BUTTON_ATTR, "true");
  tabButton.setAttribute("slot", "secondaryAction");
  tabButton.addEventListener("cms-tab-toggle", (ev) => {
    const detail = ev.detail;
    togglePanel(dialog, detail.active);
  });
  existingButton.parentNode?.insertBefore(tabButton, existingButton);
}
function patchDialogElement(DialogClass) {
  const proto = DialogClass.prototype;
  if (proto._cmsPatched) {
    console.info(
      "[Card-Mod Studio] Dialog already patched by another CMS instance, skipping."
    );
    return;
  }
  proto._cmsPatched = true;
  const originalUpdated = proto.updated;
  proto.updated = function(changedProps) {
    if (originalUpdated) {
      originalUpdated.call(this, changedProps);
    }
    requestAnimationFrame(() => {
      try {
        injectButton(this);
        const host = getPanelHost(this);
        if (!host) return;
        const panel = host.getElementById(CMS_PANEL_ID);
        if (panel && panel.style.display !== "none") {
          panel.config = this._cardConfig;
          panel.hass = this.hass;
        }
      } catch (err) {
        console.error("[Card-Mod Studio] Error during injection:", err);
      }
    });
  };
  console.info("[Card-Mod Studio] hui-dialog-edit-card patched successfully.");
}
function injectIntoExistingDialogs() {
  document.querySelectorAll(HA_DIALOG_ELEMENT).forEach((dialog) => {
    requestAnimationFrame(() => {
      try {
        injectButton(dialog);
      } catch (err) {
        console.error("[Card-Mod Studio] Error injecting into existing dialog:", err);
      }
    });
  });
}
async function startInjector() {
  console.info("[Card-Mod Studio] Waiting for hui-dialog-edit-card...");
  await customElements.whenDefined(HA_DIALOG_ELEMENT);
  const DialogClass = customElements.get(HA_DIALOG_ELEMENT);
  if (!DialogClass) {
    console.error(
      "[Card-Mod Studio] hui-dialog-edit-card was defined but could not be retrieved. This is unexpected — please report this issue."
    );
    return;
  }
  patchDialogElement(DialogClass);
  injectIntoExistingDialogs();
}
const VERSION = "0.3.15";
if (window.cardModStudio) {
  console.warn(
    `[Card-Mod Studio] Already loaded (v${window.cardModStudio.version}). Skipping load of v${VERSION}. If you see duplicate "Style" buttons, clear your browser cache.`
  );
} else {
  const meta = { version: VERSION, injected: false };
  window.cardModStudio = meta;
  if (!isCardModInstalled()) {
    console.warn(
      "[Card-Mod Studio] card-mod is not detected. Install card-mod via HACS first. The style editor UI will still open, but generated YAML will not apply until card-mod is present."
    );
  } else {
    console.info("[Card-Mod Studio] card-mod detected ✓");
  }
  startInjector().then(() => {
    meta.injected = true;
    console.info(`[Card-Mod Studio] v${VERSION} loaded and injected successfully.`);
  }).catch((err) => {
    console.error("[Card-Mod Studio] Injection failed:", err);
  });
}
//# sourceMappingURL=card-mod-studio.js.map

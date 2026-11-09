// Minimal DOM, enough for preact 10 to mount App and run its effects (probe use only).
class Node {
  constructor(type, name) { this.nodeType = type; this.nodeName = name; this.localName = name && name.toLowerCase(); this.childNodes = []; this.parentNode = null; this.attributes = {}; this.style = new Style(); this.listeners = {}; this._data = ''; }
  get firstChild() { return this.childNodes[0] || null; }
  get nextSibling() { if (!this.parentNode) return null; const c = this.parentNode.childNodes; return c[c.indexOf(this) + 1] || null; }
  appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  insertBefore(n, ref) { if (!ref) return this.appendChild(n); if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(ref), 0, n); return n; }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  removeAttribute(k) { delete this.attributes[k]; }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  hasAttribute(k) { return k in this.attributes; }
  addEventListener(t, f) { (this.listeners[t] ||= new Set()).add(f); }
  removeEventListener(t, f) { this.listeners[t]?.delete(f); }
  get data() { return this._data; } set data(v) { this._data = String(v); }
  get nodeValue() { return this._data; } set nodeValue(v) { this._data = String(v); }
  get textContent() { return this.nodeType === 3 ? this._data : this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.childNodes = []; if (v) this.appendChild(doc.createTextNode(v)); }
  get className() { return this.attributes.class || ''; }
  getBoundingClientRect() { return { height: globalThis.__heightOf ? globalThis.__heightOf(this) : 0, width: 360 }; }
  closest() { return null; }
  focus() {} blur() {}
  matches(sel) { return match(this, sel); }
  querySelector(sel) { return find(this, sel); }
  querySelectorAll(sel) { const out = []; walk(this, (n) => { if (n !== this && match(n, sel)) out.push(n); }); return out; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc; }
}
class Style { setProperty(k, v) { this[k] = v; } removeProperty(k) { delete this[k]; } getPropertyValue(k) { return this[k] ?? ''; } }
function walk(n, f) { f(n); for (const c of n.childNodes) walk(c, f); }
function match(n, sel) {
  if (n.nodeType !== 1) return false;
  const m = sel.match(/^([a-z0-9]*)(\.[\w-]+)*(\[name="([^"]+)"\])?$/i); if (!m) return false;
  const tag = sel.match(/^[a-z0-9]+/i)?.[0]; const classes = [...sel.matchAll(/\.([\w-]+)/g)].map((x) => x[1]);
  if (tag && n.localName !== tag.toLowerCase()) return false;
  const have = (n.attributes.class || '').split(/\s+/);
  if (!classes.every((c) => have.includes(c))) return false;
  if (m[4] && n.attributes.name !== m[4]) return false;
  return true;
}
function find(root, sel) { let hit = null; walk(root, (n) => { if (!hit && n !== root && match(n, sel)) hit = n; }); return hit; }
const doc = new Node(9, '#document');
doc.createElement = (t) => new Node(1, t.toUpperCase());
doc.createElementNS = (ns, t) => new Node(1, t);
doc.createTextNode = (t) => { const n = new Node(3, '#text'); n._data = String(t); return n; };
const html = doc.createElement('html'); doc.appendChild(html); doc.documentElement = html;
const head = doc.createElement('head'); html.appendChild(head); const meta = doc.createElement('meta'); meta.setAttribute('name', 'theme-color'); head.appendChild(meta);
const body = doc.createElement('body'); html.appendChild(body); doc.body = body;
doc.activeElement = body; doc.visibilityState = 'visible';
globalThis.document = doc;
globalThis.Node = Node; globalThis.Element = Node; globalThis.HTMLElement = Node; globalThis.SVGElement = Node;
globalThis.window = globalThis;
globalThis.history = { state: null, length: 1, pushState(s) { this.state = s; this.length++; }, replaceState(s) { this.state = s; }, back() {}, go() {}, forward() {} };
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0); globalThis.cancelAnimationFrame = (t) => clearTimeout(t);
globalThis.__dark = false;
globalThis.matchMedia = (q) => ({ matches: /dark/.test(q) ? globalThis.__dark : false, addEventListener() {}, removeEventListener() {} });
globalThis.__ros = [];
globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; this.els = []; globalThis.__ros.push(this); } observe(el) { this.els.push(el); this.cb([{ target: el }]); } disconnect() { this.els = []; } fire() { for (const el of this.els) this.cb([{ target: el }]); } };
export { doc };
const winL = {};
globalThis.addEventListener = (t, f) => { (winL[t] ||= new Set()).add(f); };
globalThis.removeEventListener = (t, f) => { winL[t]?.delete(f); };

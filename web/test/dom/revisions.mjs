// Revisions (2026-11-18, Lorico): bottom-bar order Now/Plan/Log/More, the panel strip,
// GitHub-only bug reports, and the end of the $5 bug bounty + free-paid-version perk.
//
// The strip pins (S) replace the touch-pager pins: the pager classified touches and
// yielded to any control, and the Plan panel is four full-width buttons, so on a real
// phone the swipe worked once (Now → Plan) and never again — while this lane's old pins
// stayed green because they aimed their synthetic gestures at <main> itself, a target
// no finger ever hits over content (see HANDOFF-SWIPE.md). The strip is The Daily
// Number's mechanism: native scroll-snap, so the pins drive the strip the way the
// browser does — set scrollLeft, fire scroll, let the rAF + settle machinery run —
// with the strip's geometry stubbed onto the shim node (clientWidth 400, an instant
// scrollTo that records its calls). Every pin reports on its own line; exit 1 on a fail.
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
let Tms = new Date(2026, 10, 10, 14, 14, 5).getTime(); // local wall time: Tue Nov 10 2026, 14:14
Date.now = () => Tms;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'revisions';
// Deterministic rAF: the strip's scroll handler runs its rAF callback inline.
globalThis.requestAnimationFrame = (cb) => { cb(0); return 1; };
globalThis.cancelAnimationFrame = () => {};
const { render, h } = await import('preact');
const { readFileSync, readdirSync } = await import('node:fs');
const A = await import('../../src/app.tsx');
const S = await import('../../src/store.ts');
const { App, setLaunchNotice, openSheet, PANEL_ORDER } = A;
const { setState, getState, deviceTz } = S;
setLaunchNotice?.(false);
const sleep = (ms) => new Promise((r) => rawSetTimeout(r, ms));
const res = [];
const pin = async (name, f) => { try { const r = await f(); res.push([r === true ? 'PASS' : 'FAIL', name, r === true ? '' : String(r)]); } catch (e) { res.push(['FAIL', name, 'threw: ' + (e && e.message || e)]); } };
const root = document.createElement('div'); document.body.appendChild(root);
const T = Math.floor(Tms / 60000); // "now", epoch minutes
const base = () => ({ tentative: [], drivingView: true, zoneAck: null, seededAt: null, dayCloses: [], historyAcknowledged: true, theme: 'day', themeChosen: true, darkDriveAtNight: true, disclaimerAcked: true, tzChosen: true, alertsOn: false, speakAlerts: false, speechAsked: true, speakAskOpen: false, nowOverride: null, tab: 'now', nowCard: 'dial', nowCardAsked: true, config: { ...getState().config, timeZone: deviceTz } });
const seed = async (rec) => { openSheet(null); setState({ ...base(), ...rec }); await sleep(60); };
// DOM helpers (same shape as the other lanes: fire a node's own listeners, no bubbling)
const all = (pred) => { const out = []; const w = (n) => { if (pred(n)) out.push(n); n.childNodes.forEach(w); }; w(root); return out; };
const fire = (node, type, extra = {}) => { for (const t of [type, type[0].toUpperCase() + type.slice(1)].filter(Boolean)) { const ev = { type: t, target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...extra }; for (const f of node.listeners[t] ?? []) f.call(node, ev); } };
const segs = { segments: [{ status: 'OFF', start: T - 900, end: T - 300 }, { status: 'D', start: T - 300, end: T - 60 }], current: { status: 'ON', since: T - 60 } };

render(h(App, {}), root); await sleep(120);

/* ---------------- the strip, with stubbed geometry ---------------- */
const strip = () => all((n) => n.localName === 'main' && (n.attributes.class || '').split(/\s+/).includes('pages'))[0];
const pages = () => { const m = strip(); return m ? m.childNodes.filter((n) => n.localName === 'section') : []; };
const scrollCalls = [];
const applyingScrollTo = (el) => (opts) => { scrollCalls.push(opts); if (opts && typeof opts.left === 'number') el.scrollLeft = opts.left; };
{
  const el = strip();
  if (el) {
    el.clientWidth = 400;
    el.scrollLeft = 0;
    el.scrollTo = applyingScrollTo(el);
  }
}
// A finished scroll gesture at pixel offset px: the browser fires scroll events while
// the strip moves and the snap lands it; the app's settle timer (120ms) then commits.
const scrollStripTo = async (px) => { const el = strip(); el.scrollLeft = px; fire(el, 'scroll'); await sleep(220); };
const litTab = () => { const nav = all((n) => n.localName === 'nav' && (n.attributes.class || '').includes('tabs'))[0]; const on = nav.childNodes.filter((n) => n.localName === 'button').find((b) => (b.attributes.class || '').split(/\s+/).includes('on')); return on ? on.textContent.trim() : null; };

/* ---------------- (a) the bottom bar shows Now, Plan, Log, More ---------------- */
await pin('A1. PANEL_ORDER is now/plan/log/settings', async () => {
  return JSON.stringify(PANEL_ORDER) === JSON.stringify(['now', 'plan', 'log', 'settings']) || `got ${JSON.stringify(PANEL_ORDER)}`;
});
await pin('A2. the rendered tab bar reads Now, Plan, Log, More in that order', async () => {
  await seed({ ...segs });
  const nav = all((n) => n.localName === 'nav' && (n.attributes.class || '').includes('tabs'))[0];
  if (!nav) return 'no tab bar rendered';
  const labels = nav.childNodes.filter((n) => n.localName === 'button').map((b) => b.textContent.trim());
  return JSON.stringify(labels) === JSON.stringify(['Now', 'Plan', 'Log', 'More']) || `got ${JSON.stringify(labels)}`;
});
await pin('A3. the app still lands on Now by default', async () => getState().tab === 'now' || `tab=${getState().tab}`);

/* ---------------- (s) the snap strip ---------------- */
await pin('S1. <main> is the strip: four pages side by side, Now/Plan/Log/More order', async () => {
  const ps = pages();
  if (ps.length !== 4) return `pages=${ps.length}`;
  const want = ['page-now', 'page-plan', 'page-log', 'page-settings'];
  const got = ps.map((p) => (p.attributes.class || '').split(/\s+/).find((c) => c.startsWith('page-')));
  return JSON.stringify(got) === JSON.stringify(want) || `got ${JSON.stringify(got)}`;
});
await pin('S2. all four panels stay mounted at once (the strip never unmounts a page)', async () => {
  await seed({ tab: 'now', ...segs });
  const txt = root.textContent;
  const marks = ['Plan a sleeper split', 'Report a bug (GitHub)'];
  const missing = marks.filter((m) => !txt.includes(m));
  const entry = all((n) => n.localName === 'button' && (n.attributes.class || '').split(/\s+/).includes('entry'))[0];
  if (!entry) missing.push('log entry');
  return missing.length === 0 || `missing while tab=now: ${missing.join('; ')}`;
});
await pin('S3. scrolling the strip walks the tab — and the bar follows — at every snap point', async () => {
  await seed({ tab: 'now', ...segs });
  const stops = [[400, 'plan', 'Plan'], [800, 'log', 'Log'], [1200, 'settings', 'More']];
  for (const [px, tab, label] of stops) {
    await scrollStripTo(px);
    if (getState().tab !== tab) return `at ${px}px tab=${getState().tab}, want ${tab}`;
    if (litTab() !== label) return `at ${px}px lit=${litTab()}, want ${label}`;
  }
  return true;
});
await pin('S4. REPEATED walks keep working — the full ring, forth and back, twice (Lorico\u2019s one-swipe bug)', async () => {
  const ring = [[800, 'log'], [400, 'plan'], [0, 'now'], [400, 'plan'], [800, 'log'], [1200, 'settings'], [800, 'log'], [400, 'plan'], [0, 'now'], [400, 'plan'], [800, 'log'], [1200, 'settings']];
  for (const [px, tab] of ring) {
    await scrollStripTo(px);
    if (getState().tab !== tab) return `at ${px}px tab=${getState().tab}, want ${tab}`;
  }
  return true;
});
await pin('S5. the page nodes are the same objects after the walks (scroll state lives on them)', async () => {
  const before = pages();
  await scrollStripTo(0); await scrollStripTo(1200); await scrollStripTo(0);
  const after = pages();
  return (before.length === 4 && after.length === 4 && before.every((p, i) => p === after[i])) || 'a page node was replaced';
});
await pin('S6. a tab tap scrolls the strip to that page', async () => {
  await seed({ tab: 'now', ...segs });
  strip().scrollLeft = 0; scrollCalls.length = 0;
  const nav = all((n) => n.localName === 'nav' && (n.attributes.class || '').includes('tabs'))[0];
  const more = nav.childNodes.filter((n) => n.localName === 'button').find((b) => b.textContent.trim() === 'More');
  fire(more, 'click');
  await sleep(60);
  if (getState().tab !== 'settings') return `tab=${getState().tab}`;
  const last = scrollCalls[scrollCalls.length - 1];
  return (last && last.left === 1200 && litTab() === 'More') || `scrollTo=${JSON.stringify(last)} lit=${litTab()}`;
});
await pin('S7. a programmatic tab change (restore / deep link / back) scrolls the strip to match', async () => {
  strip().scrollLeft = 0; scrollCalls.length = 0;
  await seed({ tab: 'log', ...segs });
  const last = scrollCalls[scrollCalls.length - 1];
  return (last && last.left === 800) || `scrollTo=${JSON.stringify(last)}`;
});
await pin('S8. a planning sub-screen sits on the Plan page; a settle there never walks it back to the menu', async () => {
  scrollCalls.length = 0;
  await seed({ tab: 'split', ...segs });
  const last = scrollCalls[scrollCalls.length - 1];
  if (!last || last.left !== 400) return `strip went to ${JSON.stringify(last)}, want plan (400)`;
  const planPage = pages()[1];
  if (!planPage.textContent.includes('Break 1')) return 'Split Lab content not in the Plan page';
  await scrollStripTo(400);
  if (getState().tab !== 'split') return `settle clobbered the sub-screen: tab=${getState().tab}`;
  await scrollStripTo(800);
  return getState().tab === 'log' || `swiping away from a sub-screen: tab=${getState().tab}, want log`;
});
await pin('S9. the pages off the settled panel are inert and aria-hidden; the settled page is neither', async () => {
  await seed({ tab: 'log', ...segs });
  const ps = pages();
  const off = (p) => (p.attributes.inert !== undefined && p.attributes.inert !== 'false') || p.inert === true;
  const hid = (p) => p.attributes['aria-hidden'] === 'true' || p.attributes['aria-hidden'] === true;
  const bad = [];
  ps.forEach((p, i) => {
    const active = i === 2;
    if (active && (off(p) || hid(p))) bad.push(`log page inert=${off(p)} hidden=${hid(p)}`);
    if (!active && (!off(p) || !hid(p))) bad.push(`page ${i} inert=${off(p)} hidden=${hid(p)}`);
  });
  return bad.length === 0 || bad.join('; ');
});
await pin('S10. while a sheet is open, a strip settle does not change the tab', async () => {
  await seed({ tab: 'now', ...segs });
  openSheet({ kind: 'status' });
  await sleep(60);
  await scrollStripTo(800);
  const t = getState().tab;
  openSheet(null);
  return t === 'now' || `tab=${t} under an open sheet`;
});
await pin('S11. a settle that fires mid-flight (a tab tap\u2019s smooth scroll pausing its events) never commits the panel it is passing', async () => {
  const el = strip();
  el.scrollTo = (opts) => { scrollCalls.push(opts); }; // travelling: records, does not land
  await seed({ tab: 'settings', ...segs });
  el.scrollTo = applyingScrollTo(el);
  if (getState().tab !== 'settings') return `setup tab=${getState().tab}`;
  await scrollStripTo(400); // the strip is passing Plan with a quiet spell in its events
  if (getState().tab !== 'settings') return `mid-flight settle committed ${getState().tab}`;
  await scrollStripTo(1200); // it lands on its goal
  if (getState().tab !== 'settings') return `arrival tab=${getState().tab}`;
  await scrollStripTo(800); // and once arrived, the driver\u2019s own scrolls commit again
  return getState().tab === 'log' || `after arrival, scroll to 800 gave ${getState().tab}`;
});

/* ---------------- (h) feel round 2 (2026-11-19): the haptic click on a swipe settle ---------------- */
// navigator.vibrate stubbed: every call recorded. fire() runs a node's own listeners only (no
// document capture), so the global button tap tick never runs here — every call these pins
// see comes from the strip's settle path.
const vib = [];
const setVibrate = (f) => Object.defineProperty(globalThis.navigator, 'vibrate', { value: f, configurable: true, writable: true });
setVibrate((p) => { vib.push(p); return true; });
// A finger on the strip: the touchstart/pointerdown a real swipe begins with (it clears any
// programmatic scroll goal the seed's own tab change left behind, exactly as on a phone).
// (Matched case-blind: preact registers onTouchStart under whichever casing the shim exposes.)
const grab = () => { const el = strip(); for (const k of Object.keys(el.listeners)) if (/^(touchstart|pointerdown)$/i.test(k)) for (const f of el.listeners[k]) f.call(el, { type: k, target: el, currentTarget: el, preventDefault() {}, stopPropagation() {} }); };
const tapNav = (label) => { const nav = all((n) => n.localName === 'nav' && (n.attributes.class || '').includes('tabs'))[0]; fire(nav.childNodes.filter((n) => n.localName === 'button').find((b) => b.textContent.trim() === label), 'click'); };
await pin('H1. a swipe that settles on a NEW panel gives exactly one short haptic click — none during the drag', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 0; vib.length = 0; grab();
  // the drag: a run of scroll events closer together than the settle window
  const el = strip();
  for (const px of [40, 120, 210, 300, 370]) { el.scrollLeft = px; fire(el, 'scroll'); await sleep(30); }
  if (vib.length) return `buzzed during the drag: ${JSON.stringify(vib)}`;
  await scrollStripTo(400); // the snap lands it on Plan and the settle commits
  if (getState().tab !== 'plan') return `tab=${getState().tab}`;
  if (vib.length !== 1) return `vibrate calls: ${JSON.stringify(vib)}`;
  const p = vib[0], ms = Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p;
  if (!(ms > 0 && ms <= 30)) return `not a short tick: ${JSON.stringify(p)}`;
  await sleep(200); // a quiet strip after the commit never buzzes again
  return vib.length === 1 || `buzzed again at rest: ${JSON.stringify(vib)}`;
});
await pin('H2. once per panel change: walking Now → Plan → Log → More gives three clicks, one each', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 0; vib.length = 0;
  grab(); await scrollStripTo(400); grab(); await scrollStripTo(800); grab(); await scrollStripTo(1200);
  return (getState().tab === 'settings' && vib.length === 3) || `tab=${getState().tab} vibrate×${vib.length}`;
});
await pin('H3. a swipe that springs back to the same panel is silent', async () => {
  await seed({ tab: 'log', ...segs }); strip().scrollLeft = 800; vib.length = 0; grab();
  const el = strip(); el.scrollLeft = 900; fire(el, 'scroll'); await sleep(30);
  await scrollStripTo(800);
  return (getState().tab === 'log' && vib.length === 0) || `tab=${getState().tab} vibrate×${vib.length}`;
});
// A real click: the document's capture listeners first (the app's global button tap tick lives
// there), then the node's own. The shim's closest() is a stub, so the clicked node is given a
// real one for the duration — it walks up to the nearest <button>, as a browser's would.
const realClick = (node) => {
  const had = Object.prototype.hasOwnProperty.call(node, 'closest'), prev = node.closest;
  node.closest = (sel) => { if (sel !== 'button') return null; let n = node; while (n) { if (n.localName === 'button') return n; n = n.parentNode; } return null; };
  try { for (const f of document.listeners.click ?? []) f({ type: 'click', target: node, currentTarget: document, preventDefault() {}, stopPropagation() {} }); fire(node, 'click'); }
  finally { if (had) node.closest = prev; else delete node.closest; }
};
const navBtn = (label) => all((n) => n.localName === 'nav' && (n.attributes.class || '').includes('tabs'))[0].childNodes.filter((n) => n.localName === 'button').find((b) => b.textContent.trim() === label);
await pin('H4. a tab-bar tap to a DIFFERENT panel: zero ticks at tap time; Now → Log ticks once passing Plan and once at the lock (haptic timing + amendment A, 2026-11-20)', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 0; fire(strip(), 'scroll'); await sleep(220); vib.length = 0;
  const el = strip(); el.scrollTo = (opts) => { scrollCalls.push(opts); }; // a smooth glide: travels, lands later
  realClick(navBtn('Log'));
  el.scrollTo = applyingScrollTo(el);
  if (getState().tab !== 'log') return `tab=${getState().tab}`;
  if (vib.length) return `ticked on the tap itself: ${JSON.stringify(vib)}`;
  await sleep(60);
  // mid-glide: scroll events closer together than the settle window, then the arrival
  el.scrollLeft = 200; fire(el, 'scroll'); await sleep(30);
  if (vib.length) return `ticked before reaching Plan: ${JSON.stringify(vib)}`;
  el.scrollLeft = 500; fire(el, 'scroll'); await sleep(30);
  if (vib.length !== 1) return `passing Plan: vibrate×${vib.length}, want 1`;
  el.scrollLeft = 700; fire(el, 'scroll'); await sleep(30);
  if (vib.length !== 1) return `between Plan and Log: vibrate×${vib.length}, want still 1`;
  await scrollStripTo(800); await sleep(60);
  if (vib.length !== 2) return `at the lock: vibrate×${vib.length} ${JSON.stringify(vib)}, want exactly 2 (Plan pass + Log lock)`;
  await sleep(200);
  if (vib.length !== 2) return `ticked again at rest: ${JSON.stringify(vib)}`;
  // a second tap, Log → Plan (next door, nothing passed): one more tick, at the lock only
  el.scrollTo = (opts) => { scrollCalls.push(opts); };
  realClick(navBtn('Plan'));
  el.scrollTo = applyingScrollTo(el);
  if (vib.length !== 2) return `second tap ticked at tap time: ${JSON.stringify(vib)}`;
  el.scrollLeft = 600; fire(el, 'scroll'); await sleep(30);
  if (vib.length !== 2) return `second tap ticked mid-glide: ${JSON.stringify(vib)}`;
  await scrollStripTo(400); await sleep(60);
  return (getState().tab === 'plan' && vib.length === 3) || `tab=${getState().tab} vibrate×${vib.length}: ${JSON.stringify(vib)}`;
});
// Amendment A (Lorico 2026-11-20): a tab tap's glide ticks as it passes each panel, plus the lock.
// glideTap: tap `label` with a travelling (smooth) scrollTo, then walk the strip through `path`
// in scroll events closer together than the settle window, recording the tick count after
// each step; the last px is the arrival and is left to settle.
const glideTap = async (label, path) => {
  const el = strip(); el.scrollTo = (opts) => { scrollCalls.push(opts); };
  vib.length = 0;
  realClick(navBtn(label));
  const atPress = vib.length;
  await sleep(60); // the store → strip effect sends the glide on its way (travelling, not landed)
  el.scrollTo = applyingScrollTo(el);
  if (vib.length !== atPress) return { atPress: vib.length, seen: [], beforeLock: -1, total: vib.length };
  const seen = [];
  for (const px of path.slice(0, -1)) { el.scrollLeft = px; fire(el, 'scroll'); await sleep(30); seen.push(vib.length); }
  el.scrollLeft = path[path.length - 1]; fire(el, 'scroll'); await sleep(30);
  const beforeLock = vib.length;
  await sleep(220);
  return { atPress, seen, beforeLock, total: vib.length };
};
await pin('H10. amendment A: a Now → More tab tap yields exactly 3 ticks — passing Plan, passing Log, the lock at More — none at press', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 0; fire(strip(), 'scroll'); await sleep(220);
  const r = await glideTap('More', [150, 350, 420, 600, 790, 810, 1000, 1150, 1200]);
  const want = [0, 0, 1, 1, 1, 2, 2, 2];
  if (r.atPress !== 0) return `ticked at press: ${r.atPress}`;
  if (JSON.stringify(r.seen) !== JSON.stringify(want)) return `ticks along the glide ${JSON.stringify(r.seen)}, want ${JSON.stringify(want)}`;
  if (r.beforeLock !== 2) return `ticked on arrival before the lock: ${r.beforeLock}`;
  if (getState().tab !== 'settings') return `tab=${getState().tab}`;
  if (r.total !== 3) return `total ${r.total}, want 3`;
  await sleep(200);
  return vib.length === 3 || `ticked again at rest: ${vib.length}`;
});
await pin('H11. amendment A: a Now → Plan tab tap (one panel over) yields exactly 1 tick, at the lock', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 0; fire(strip(), 'scroll'); await sleep(220);
  const r = await glideTap('Plan', [100, 250, 390, 400]);
  return (r.atPress === 0 && r.seen.every((n) => n === 0) && r.beforeLock === 0 && r.total === 1 && getState().tab === 'plan')
    || `press=${r.atPress} glide=${JSON.stringify(r.seen)} beforeLock=${r.beforeLock} total=${r.total} tab=${getState().tab}`;
});
await pin('H12. amendment A, backwards: More → Now ticks at Log, at Plan, and at the lock (3); a fast glide that skips past two panels in one frame still counts each', async () => {
  await seed({ tab: 'settings', ...segs }); strip().scrollLeft = 1200; fire(strip(), 'scroll'); await sleep(220);
  const r = await glideTap('Now', [1000, 790, 600, 390, 0]);
  if (!(r.atPress === 0 && JSON.stringify(r.seen) === '[0,1,1,2]' && r.total === 3 && getState().tab === 'now')) return `back: press=${r.atPress} glide=${JSON.stringify(r.seen)} total=${r.total} tab=${getState().tab}`;
  const r2 = await glideTap('More', [900, 1200]); // Plan and Log both passed between two frames
  return (r2.atPress === 0 && JSON.stringify(r2.seen) === '[2]' && r2.total === 3 && getState().tab === 'settings') || `skip: press=${r2.atPress} glide=${JSON.stringify(r2.seen)} total=${r2.total}`;
});
await pin('H13. amendment A leaves swipes alone: a fling from Now across Plan to Log is ONE tick at settle; a reduced-motion tap (instant jump, nothing seen passing) is one tick at the lock', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 0; fire(strip(), 'scroll'); await sleep(220); vib.length = 0;
  grab(); const el = strip();
  for (const px of [100, 300, 420, 600, 790]) { el.scrollLeft = px; fire(el, 'scroll'); await sleep(30); }
  if (vib.length) return `swipe ticked mid-fling: ${vib.length}`;
  await scrollStripTo(800);
  if (getState().tab !== 'log' || vib.length !== 1) return `swipe: tab=${getState().tab} vibrate×${vib.length}, want 1`;
  // reduced motion: the tap jumps (behavior auto) straight to the goal
  const mm = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: /reduce/.test(q) ? true : mm(q).matches, addEventListener() {}, removeEventListener() {} });
  try {
    vib.length = 0; scrollCalls.length = 0;
    el.scrollTo = applyingScrollTo(el);
    realClick(navBtn('Now')); await sleep(60);
    if (!scrollCalls.length || scrollCalls[scrollCalls.length - 1].behavior !== 'auto') return `reduced motion did not jump: ${JSON.stringify(scrollCalls)}`;
    fire(el, 'scroll'); await sleep(30);
    const beforeLock = vib.length; await sleep(220);
    return (beforeLock === 0 && vib.length === 1 && getState().tab === 'now') || `reduced-motion tap: beforeLock=${beforeLock} total=${vib.length}`;
  } finally { globalThis.matchMedia = mm; }
});
await pin('H7. a tap on the tab of the panel already showing never ticks — not on the tap, not later', async () => {
  await seed({ tab: 'log', ...segs }); strip().scrollLeft = 800; fire(strip(), 'scroll'); await sleep(220); vib.length = 0;
  realClick(navBtn('Log')); await sleep(60);
  fire(strip(), 'scroll'); await sleep(220);
  if (getState().tab !== 'log' || vib.length) return `tab=${getState().tab} vibrate×${vib.length}`;
  // and from a planning sub-screen, Plan's tab (same panel: back to the Plan menu) is silent too
  await seed({ tab: 'split', ...segs }); fire(strip(), 'scroll'); await sleep(220); vib.length = 0;
  realClick(navBtn('Plan')); await sleep(60); fire(strip(), 'scroll'); await sleep(220);
  return (getState().tab === 'plan' && vib.length === 0) || `tab=${getState().tab} vibrate×${vib.length}`;
});
await pin('H8. a tab tap whose glide the driver grabs and swipes back to where it started is silent; one swiped on to a third panel ticks once', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 0; fire(strip(), 'scroll'); await sleep(220); vib.length = 0;
  const el = strip(); el.scrollTo = (opts) => { scrollCalls.push(opts); };
  realClick(navBtn('Log')); el.scrollTo = applyingScrollTo(el); await sleep(60);
  el.scrollLeft = 300; fire(el, 'scroll'); await sleep(30);
  grab(); await scrollStripTo(0); await sleep(60);
  if (getState().tab !== 'now' || vib.length) return `back to start: tab=${getState().tab} vibrate×${vib.length}`;
  el.scrollTo = (opts) => { scrollCalls.push(opts); };
  realClick(navBtn('Log')); el.scrollTo = applyingScrollTo(el); await sleep(60);
  el.scrollLeft = 300; fire(el, 'scroll'); await sleep(30);
  grab(); await scrollStripTo(400); await sleep(60);
  return (getState().tab === 'plan' && vib.length === 1) || `swiped on to Plan: tab=${getState().tab} vibrate×${vib.length}`;
});
await pin('H9. every other button keeps its instant click tick (the global handler is untouched); only the four tab buttons opt out', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 0; fire(strip(), 'scroll'); await sleep(220);
  const btns = all((n) => n.localName === 'button' && n.attributes['data-haptic'] == null && !n.attributes.disabled && !(n.parentNode && n.parentNode.localName === 'nav'));
  if (btns.length < 3) return `only ${btns.length} plain buttons found`;
  const b = btns.find((x) => /Exceptions this shift/.test(x.textContent)) ?? btns[0];
  vib.length = 0;
  realClick(b);
  const got = vib.slice(); openSheet(null); await sleep(60);
  if (got.length !== 1 || got[0] !== 12) return `plain button "${b.textContent.trim().slice(0, 30)}": ${JSON.stringify(got)}, want [12] at the click`;
  // the tab buttons are the only new opt-out: each carries data-haptic, nothing else changed
  const tabs = all((n) => n.localName === 'nav' && (n.attributes.class || '').includes('tabs'))[0].childNodes.filter((n) => n.localName === 'button');
  if (tabs.length !== 4 || !tabs.every((t) => t.attributes['data-haptic'] === 'lock')) return `tab buttons: ${tabs.map((t) => t.attributes['data-haptic']).join(',')}`;
  return true;
});
await pin('H5. a programmatic change (restore / back / shortcut) and a settle under an open sheet are silent', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 0; vib.length = 0;
  await seed({ tab: 'settings', ...segs }); fire(strip(), 'scroll'); await sleep(220);
  openSheet({ kind: 'status' }); await sleep(60);
  await scrollStripTo(400);
  openSheet(null); await sleep(30);
  return vib.length === 0 || `vibrate×${vib.length}`;
});
await pin('H6. no vibration API (iPhone) — or one that throws — the swipe still commits, nothing throws', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 0;
  const nav = globalThis.navigator;
  delete nav.vibrate;
  if ('vibrate' in nav) return 'could not remove vibrate for the test';
  grab(); await scrollStripTo(400);
  if (getState().tab !== 'plan') return `no-API: tab=${getState().tab}`;
  setVibrate(() => { throw new Error('blocked'); });
  grab(); await scrollStripTo(800);
  setVibrate((p) => { vib.push(p); return true; });
  return getState().tab === 'log' || `throwing API: tab=${getState().tab}`;
});

/* ---------------- (c) no bounty / perk text in the built output ---------------- */
await pin('C1. the built bundle carries no bounty, $5-for, free-paid-version, email-report or bugEmail text', async () => {
  const dir = `${process.cwd()}/dist`;
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  if (!files.length) return 'no built js found in dist/ — run the production build first';
  const banned = ['bounty', '$5 for', 'paid App Store version free', 'paid version free', 'Prefer email instead', 'bugEmail'];
  const hits = [];
  for (const f of files) { const src = readFileSync(`${dir}/${f}`, 'utf8'); for (const b of banned) if (src.includes(b)) hits.push(`${f}: ${b}`); }
  return hits.length === 0 || `found ${hits.join('; ')}`;
});
await pin('C2. the settings screen offers GitHub as the only report channel', async () => {
  await seed({ tab: 'settings', ...segs });
  const txt = root.textContent;
  return (/Report a bug \(GitHub\)/.test(txt) && !/Prefer email instead/.test(txt)) || 'bug reports card wrong';
});

let fails = 0;
for (const [st, name, why] of res) { console.log(`${st} ${name}${why ? ` — ${why}` : ''}`); if (st === 'FAIL') fails++; }
console.log(`revisions: ${res.length - fails}/${res.length} pins pass`);
render(null, root);
process.exit(fails ? 1 : 0);

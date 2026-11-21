// Revisions (2026-11-18, Lorico; re-aimed 2026-11-20 nowplain): bottom-bar order
// Plan/Now/Log/More, equal plain Now tab (no tab-now plate), TimeHead headers traveling with
// Log/Plan, the panel strip, open-on-Now, driving-view return (R1), GitHub-only bug reports,
// and end of the $5 bounty + free-paid perk.
//
// The strip pins (S) replace the touch-pager pins: the pager classified touches and
// yielded to any control, and the Plan panel is four full-width buttons, so on a real
// phone the swipe worked once (Now → Plan) and never again — while this lane's old pins
// stayed green because they aimed their synthetic gestures at <main> itself, a target
// no finger ever hits over content (see HANDOFF-SWIPE.md). The strip is The Daily
// Number's mechanism: native scroll-snap, so the pins drive the strip the way the
// browser does — set scrollLeft, fire scroll, let the rAF + settle machinery run —
// with the strip's geometry stubbed onto every mounted <main> node (clientWidth 400, an
// instant scrollTo that records its calls). Every pin reports on its own line; exit 1 on a fail.
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
// Stub strip geometry on every <main> at creation time so first-mount placement (R2) and
// driving-view remount placement (R1) are observable in the DOM shim.
const scrollCalls = [];
const applyingScrollTo = (el) => (opts) => { scrollCalls.push(opts); if (opts && typeof opts.left === 'number') el.scrollLeft = opts.left; };
{
  const initMain = (n, t) => {
    if (String(t).toLowerCase() === 'main') {
      n.clientWidth = 400;
      n.scrollLeft = 0;
      n.scrollTo = applyingScrollTo(n);
    }
    return n;
  };
  const rawCreate = document.createElement.bind(document);
  const rawCreateNS = document.createElementNS.bind(document);
  document.createElement = (t) => initMain(rawCreate(t), t);
  document.createElementNS = (ns, t) => initMain(rawCreateNS(ns, t), t);
}
const { render, h } = await import('preact');
const { readFileSync, readdirSync } = await import('node:fs');
const A = await import('../../src/app.tsx');
const S = await import('../../src/store.ts');
const { App, setLaunchNotice, setDrivingPeek, openSheet, PANEL_ORDER } = A;
const { setState, getState, deviceTz } = S;
setLaunchNotice?.(false);
const sleep = (ms) => new Promise((r) => rawSetTimeout(r, ms));
const res = [];
const pin = async (name, f) => { try { const r = await f(); res.push([r === true ? 'PASS' : 'FAIL', name, r === true ? '' : String(r)]); } catch (e) { res.push(['FAIL', name, 'threw: ' + (e && e.message || e)]); } };
const root = document.createElement('div'); document.body.appendChild(root);
const T = Math.floor(Tms / 60000); // "now", epoch minutes
const base = () => ({ tentative: [], drivingView: true, zoneAck: null, seededAt: null, dayCloses: [], historyAcknowledged: true, theme: 'day', themeChosen: true, darkDriveAtNight: true, disclaimerAcked: true, tzChosen: true, alertsOn: false, speakAlerts: false, speechAsked: true, speakAskOpen: false, nowOverride: null, tab: 'now', nowCard: 'dial', nowCardAsked: true, logResolved: false, config: { ...getState().config, timeZone: deviceTz } });
const seed = async (rec) => { openSheet(null); setState({ ...base(), ...rec }); await sleep(60); };
// DOM helpers (same shape as the other lanes: fire a node's own listeners, no bubbling)
const all = (pred, scope = root) => { const out = []; const w = (n) => { if (pred(n)) out.push(n); n.childNodes.forEach(w); }; w(scope); return out; };
const cls = (n) => (n.attributes && n.attributes.class) || '';
const has = (n, c) => cls(n).split(/\s+/).includes(c);
const fire = (node, type, extra = {}) => { for (const t of [type, type[0].toUpperCase() + type.slice(1)].filter(Boolean)) { const ev = { type: t, target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...extra }; for (const f of node.listeners[t] ?? []) f.call(node, ev); } };
const segs = { segments: [{ status: 'OFF', start: T - 900, end: T - 300 }, { status: 'D', start: T - 300, end: T - 60 }], current: { status: 'ON', since: T - 60 } };

const strip = () => all((n) => n.localName === 'main' && has(n, 'pages'))[0];
const pages = () => { const m = strip(); return m ? m.childNodes.filter((n) => n.localName === 'section') : []; };
const litTab = () => { const nav = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0]; const on = nav && nav.childNodes.filter((n) => n.localName === 'button').find((b) => has(b, 'on')); return on ? on.textContent.trim() : null; };

render(h(App, {}), root); await sleep(120);
// Snapshot fresh-mount state before any seed() runs (DESIGN-NAV §3 item 2 / R2).
const freshMount = {
  tab: getState().tab,
  lit: litTab(),
  nowActive: !!pages().find((p) => has(p, 'page-now') && has(p, 'is-active')),
  scrollLeft: strip()?.scrollLeft,
  firstScrollCall: scrollCalls[0] ?? null,
};

// A finished scroll gesture at pixel offset px: the browser fires scroll events while
// the strip moves and the snap lands it; the app's settle timer (120ms) then commits.
const scrollStripTo = async (px) => { const el = strip(); el.scrollLeft = px; fire(el, 'scroll'); await sleep(220); };

/* ---------------- (a) the bottom bar shows Plan, Now, Log, More ---------------- */
// Re-aimed (2026-11-20 nowplain): Log and Plan swapped — bar order is Plan — Now — Log — More.
await pin('A1. PANEL_ORDER is plan/now/log/settings', async () => {
  return JSON.stringify(PANEL_ORDER) === JSON.stringify(['plan', 'now', 'log', 'settings']) || `got ${JSON.stringify(PANEL_ORDER)}`;
});
// Re-aimed (2026-11-20 nowplain): bottom bar is derived from PANEL_ORDER (Plan, Now, Log, More).
await pin('A2. the rendered tab bar reads Plan, Now, Log, More in that order', async () => {
  await seed({ ...segs });
  const nav = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0];
  if (!nav) return 'no tab bar rendered';
  const labels = nav.childNodes.filter((n) => n.localName === 'button').map((b) => b.textContent.trim());
  return JSON.stringify(labels) === JSON.stringify(['Plan', 'Now', 'Log', 'More']) || `got ${JSON.stringify(labels)}`;
});
await pin('A3. the app still lands on Now by default, seated at 1 × width on fresh mount (DESIGN-NAV R2)', async () => {
  const ok = freshMount.tab === 'now'
    && freshMount.lit === 'Now'
    && freshMount.nowActive
    && freshMount.scrollLeft === 400
    && freshMount.firstScrollCall && freshMount.firstScrollCall.left === 400 && freshMount.firstScrollCall.behavior === 'auto';
  return ok || JSON.stringify(freshMount);
});

/* ---------------- (s) the snap strip ---------------- */
// Re-aimed (2026-11-20 nowplain): strip section order matches PANEL_ORDER (page-plan, page-now, page-log, page-settings) and the bar.
await pin('S1. <main> is the strip: four pages side by side, Plan/Now/Log/More order, matching PANEL_ORDER and bar', async () => {
  const ps = pages();
  if (ps.length !== 4) return `pages=${ps.length}`;
  const want = ['page-plan', 'page-now', 'page-log', 'page-settings'];
  const got = ps.map((p) => cls(p).split(/\s+/).find((c) => c.startsWith('page-')));
  const expectedFromOrder = PANEL_ORDER.map((k) => `page-${k}`);
  const nav = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0];
  const barIds = nav.childNodes.filter((n) => n.localName === 'button').map((b) => ({ Plan: 'plan', Now: 'now', Log: 'log', More: 'settings' }[b.textContent.trim()]));
  return (JSON.stringify(got) === JSON.stringify(want) && JSON.stringify(got) === JSON.stringify(expectedFromOrder) && JSON.stringify(barIds) === JSON.stringify(PANEL_ORDER))
    || `strip=${JSON.stringify(got)} bar=${JSON.stringify(barIds)} PANEL_ORDER=${JSON.stringify(PANEL_ORDER)}`;
});
await pin('S2. all four panels stay mounted at once (the strip never unmounts a page)', async () => {
  await seed({ tab: 'now', ...segs });
  const txt = root.textContent;
  const marks = ['Plan a sleeper split', 'Report a bug (GitHub)'];
  const missing = marks.filter((m) => !txt.includes(m));
  const entry = all((n) => n.localName === 'button' && has(n, 'entry'))[0];
  if (!entry) missing.push('log entry');
  return missing.length === 0 || `missing while tab=now: ${missing.join('; ')}`;
});
// Re-aimed (2026-11-20 nowplain): snap stops 0=plan, 400=now, 800=log, 1200=settings.
await pin('S3. scrolling the strip walks the tab — and the bar follows — at every snap point', async () => {
  await seed({ tab: 'now', ...segs });
  const stops = [[0, 'plan', 'Plan'], [400, 'now', 'Now'], [800, 'log', 'Log'], [1200, 'settings', 'More']];
  for (const [px, tab, label] of stops) {
    await scrollStripTo(px);
    if (getState().tab !== tab) return `at ${px}px tab=${getState().tab}, want ${tab}`;
    if (litTab() !== label) return `at ${px}px lit=${litTab()}, want ${label}`;
  }
  return true;
});
// Re-aimed (2026-11-20 nowplain): ring walks 0=plan, 400=now, 800=log, 1200=settings.
await pin('S4. REPEATED walks keep working — the full ring, forth and back, twice (Lorico\u2019s one-swipe bug)', async () => {
  const ring = [[800, 'log'], [400, 'now'], [0, 'plan'], [400, 'now'], [800, 'log'], [1200, 'settings'], [800, 'log'], [400, 'now'], [0, 'plan'], [400, 'now'], [800, 'log'], [1200, 'settings']];
  for (const [px, tab] of ring) {
    await scrollStripTo(px);
    if (getState().tab !== tab) return `at ${px}px tab=${getState().tab}, want ${tab}`;
  }
  return true;
});
await pin('S5. the page nodes are the same objects after the walks (scroll state lives on them)', async () => {
  const before = pages();
  await scrollStripTo(0); await scrollStripTo(1200); await scrollStripTo(400);
  const after = pages();
  return (before.length === 4 && after.length === 4 && before.every((p, i) => p === after[i])) || 'a page node was replaced';
});
// Re-aimed (2026-11-20 nowplain): tapping each tab (Plan, Now, Log, More) opens its own screen and scrolls to its snap offset.
await pin('S6. each tab tap scrolls the strip to its own page (Plan=0, Now=400, Log=800, More=1200)', async () => {
  await seed({ tab: 'now', ...segs });
  strip().scrollLeft = 400; scrollCalls.length = 0;
  const nav = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0];
  const btn = (lbl) => nav.childNodes.filter((n) => n.localName === 'button').find((b) => b.textContent.trim() === lbl);
  for (const [lbl, tab, px, pageCls] of [['More', 'settings', 1200, 'page-settings'], ['Plan', 'plan', 0, 'page-plan'], ['Log', 'log', 800, 'page-log'], ['Now', 'now', 400, 'page-now']]) {
    scrollCalls.length = 0;
    fire(btn(lbl), 'click');
    await sleep(60);
    const last = scrollCalls[scrollCalls.length - 1];
    const activePg = pages().find((p) => has(p, 'is-active'));
    if (getState().tab !== tab || !last || last.left !== px || litTab() !== lbl || !activePg || !has(activePg, pageCls)) {
      return `tap ${lbl}: tab=${getState().tab} scrollTo=${JSON.stringify(last)} lit=${litTab()} active=${activePg && cls(activePg)}`;
    }
  }
  return true;
});
// Re-aimed (2026-11-20 nowplain): Plan is now index 0 (0px) and Log is now index 2 (800px).
await pin('S7. a programmatic tab change (restore / deep link / back) scrolls the strip to match', async () => {
  strip().scrollLeft = 1200; scrollCalls.length = 0;
  await seed({ tab: 'plan', ...segs });
  const lastPlan = scrollCalls[scrollCalls.length - 1];
  if (!lastPlan || lastPlan.left !== 0) return `plan scrollTo=${JSON.stringify(lastPlan)}`;
  scrollCalls.length = 0;
  await seed({ tab: 'log', ...segs });
  const lastLog = scrollCalls[scrollCalls.length - 1];
  return (lastLog && lastLog.left === 800) || `log scrollTo=${JSON.stringify(lastLog)}`;
});
// Re-aimed (2026-11-20 nowplain): Plan is now index 0 (0px); swiping left from Plan goes to Now (400px).
await pin('S8. a planning sub-screen sits on the Plan page; a settle there never walks it back to the menu', async () => {
  scrollCalls.length = 0;
  await seed({ tab: 'split', ...segs });
  const last = scrollCalls[scrollCalls.length - 1];
  if (!last || last.left !== 0) return `strip went to ${JSON.stringify(last)}, want plan (0)`;
  const planPage = pages()[0];
  if (!planPage.textContent.includes('Break 1')) return 'Split Lab content not in the Plan page';
  await scrollStripTo(0);
  if (getState().tab !== 'split') return `settle clobbered the sub-screen: tab=${getState().tab}`;
  await scrollStripTo(400);
  return getState().tab === 'now' || `swiping away from a sub-screen: tab=${getState().tab}, want now`;
});
// Re-aimed (2026-11-20 nowplain): Log is now panel index 2.
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
// Re-aimed (2026-11-20 nowplain): Log is at 800px between Now (400px) and More (1200px).
await pin('S11. a settle that fires mid-flight (a tab tap\u2019s smooth scroll pausing its events) never commits the panel it is passing', async () => {
  const el = strip();
  el.scrollTo = (opts) => { scrollCalls.push(opts); }; // travelling: records, does not land
  await seed({ tab: 'settings', ...segs });
  el.scrollTo = applyingScrollTo(el);
  if (getState().tab !== 'settings') return `setup tab=${getState().tab}`;
  await scrollStripTo(800); // the strip is passing Log with a quiet spell in its events
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
// Re-aimed (2026-11-20 nowplain): Now is at 400px, Log is at 800px.
await pin('H1. a swipe that settles on a NEW panel gives exactly one short haptic click — none during the drag', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 400; vib.length = 0; grab();
  // the drag: a run of scroll events closer together than the settle window
  const el = strip();
  for (const px of [440, 520, 610, 700, 770]) { el.scrollLeft = px; fire(el, 'scroll'); await sleep(30); }
  if (vib.length) return `buzzed during the drag: ${JSON.stringify(vib)}`;
  await scrollStripTo(800); // the snap lands it on Log and the settle commits
  if (getState().tab !== 'log') return `tab=${getState().tab}`;
  if (vib.length !== 1) return `vibrate calls: ${JSON.stringify(vib)}`;
  const p = vib[0], ms = Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p;
  if (!(ms > 0 && ms <= 30)) return `not a short tick: ${JSON.stringify(p)}`;
  await sleep(200); // a quiet strip after the commit never buzzes again
  return vib.length === 1 || `buzzed again at rest: ${JSON.stringify(vib)}`;
});
// Re-aimed (2026-11-20 nowplain): walking the full strip is Plan → Now → Log → More (0→400→800→1200).
await pin('H2. once per panel change: walking Plan → Now → Log → More gives three clicks, one each', async () => {
  await seed({ tab: 'plan', ...segs }); strip().scrollLeft = 0; vib.length = 0;
  grab(); await scrollStripTo(400); grab(); await scrollStripTo(800); grab(); await scrollStripTo(1200);
  return (getState().tab === 'settings' && vib.length === 3) || `tab=${getState().tab} vibrate×${vib.length}`;
});
// Re-aimed (2026-11-20 nowplain): Plan rests at 0px.
await pin('H3. a swipe that springs back to the same panel is silent', async () => {
  await seed({ tab: 'plan', ...segs }); strip().scrollLeft = 0; vib.length = 0; grab();
  const el = strip(); el.scrollLeft = 100; fire(el, 'scroll'); await sleep(30);
  await scrollStripTo(0);
  return (getState().tab === 'plan' && vib.length === 0) || `tab=${getState().tab} vibrate×${vib.length}`;
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
const navBtn = (label) => all((n) => n.localName === 'nav' && has(n, 'tabs'))[0].childNodes.filter((n) => n.localName === 'button').find((b) => b.textContent.trim() === label);
// Re-aimed (2026-11-20 nowplain): Plan(0) → Log(800) crosses Now(400) for 2 ticks, then Log(800) → Now(400) is 1 tick at lock.
await pin('H4. a tab-bar tap to a DIFFERENT panel: zero ticks at tap time; Plan → Log ticks once passing Now and once at the lock', async () => {
  await seed({ tab: 'plan', ...segs }); strip().scrollLeft = 0; fire(strip(), 'scroll'); await sleep(220); vib.length = 0;
  const el = strip(); el.scrollTo = (opts) => { scrollCalls.push(opts); }; // a smooth glide: travels, lands later
  realClick(navBtn('Log'));
  el.scrollTo = applyingScrollTo(el);
  if (getState().tab !== 'log') return `tab=${getState().tab}`;
  if (vib.length) return `ticked on the tap itself: ${JSON.stringify(vib)}`;
  await sleep(60);
  // mid-glide: scroll events closer together than the settle window, then the arrival
  el.scrollLeft = 200; fire(el, 'scroll'); await sleep(30);
  if (vib.length) return `ticked before reaching Now: ${JSON.stringify(vib)}`;
  el.scrollLeft = 500; fire(el, 'scroll'); await sleep(30);
  if (vib.length !== 1) return `passing Now: vibrate×${vib.length}, want 1`;
  el.scrollLeft = 700; fire(el, 'scroll'); await sleep(30);
  if (vib.length !== 1) return `between Now and Log: vibrate×${vib.length}, want still 1`;
  await scrollStripTo(800); await sleep(60);
  if (vib.length !== 2) return `at the lock: vibrate×${vib.length} ${JSON.stringify(vib)}, want exactly 2 (Now pass + Log lock)`;
  await sleep(200);
  if (vib.length !== 2) return `ticked again at rest: ${JSON.stringify(vib)}`;
  // a second tap, Log → Now (next door, nothing passed): one more tick, at the lock only
  el.scrollTo = (opts) => { scrollCalls.push(opts); };
  realClick(navBtn('Now'));
  el.scrollTo = applyingScrollTo(el);
  if (vib.length !== 2) return `second tap ticked at tap time: ${JSON.stringify(vib)}`;
  el.scrollLeft = 600; fire(el, 'scroll'); await sleep(30);
  if (vib.length !== 2) return `second tap ticked mid-glide: ${JSON.stringify(vib)}`;
  await scrollStripTo(400); await sleep(60);
  return (getState().tab === 'now' && vib.length === 3) || `tab=${getState().tab} vibrate×${vib.length}: ${JSON.stringify(vib)}`;
});
// Amendment A (Lorico 2026-11-20; re-aimed 2026-11-20 nowplain): a tab tap's glide ticks as it
// passes each panel, plus the lock. glideTap taps `label` with a travelling (smooth) scrollTo,
// walks the strip through `path` in scroll events closer together than the settle window, and
// lets the last px settle.
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
// Re-aimed (2026-11-20 nowplain): Plan→More=3 (pass Now, Log, lock More); Now→More=2 (pass Log, lock More).
await pin('H10. amendment A (nowplain): Plan → More yields 3 ticks (Now, Log, lock); Now → More yields 2 ticks (Log, lock)', async () => {
  await seed({ tab: 'plan', ...segs }); strip().scrollLeft = 0; fire(strip(), 'scroll'); await sleep(220);
  const r = await glideTap('More', [150, 350, 420, 600, 790, 810, 1000, 1150, 1200]);
  const want = [0, 0, 1, 1, 1, 2, 2, 2];
  if (r.atPress !== 0) return `Plan→More ticked at press: ${r.atPress}`;
  if (JSON.stringify(r.seen) !== JSON.stringify(want)) return `Plan→More glide ${JSON.stringify(r.seen)}, want ${JSON.stringify(want)}`;
  if (r.beforeLock !== 2 || getState().tab !== 'settings' || r.total !== 3) return `Plan→More beforeLock=${r.beforeLock} total=${r.total} tab=${getState().tab}`;
  await sleep(200);
  if (vib.length !== 3) return `Plan→More ticked again at rest: ${vib.length}`;
  // Now → More (1 → 3): pass Log (800), lock More (1200) = 2 ticks
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 400; fire(strip(), 'scroll'); await sleep(220);
  const r2 = await glideTap('More', [550, 780, 810, 1050, 1200]);
  return (r2.atPress === 0 && JSON.stringify(r2.seen) === '[0,0,1,1]' && r2.beforeLock === 1 && r2.total === 2 && getState().tab === 'settings')
    || `Now→More press=${r2.atPress} glide=${JSON.stringify(r2.seen)} beforeLock=${r2.beforeLock} total=${r2.total}`;
});
// Re-aimed (2026-11-20 nowplain): Now(400) → Log(800) = 1 tick, Now(400) → Plan(0) = 1 tick, both at lock only.
await pin('H11. amendment A (nowplain): Now → Log and Now → Plan (adjacent) each yield exactly 1 tick, at the lock', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 400; fire(strip(), 'scroll'); await sleep(220);
  const r1 = await glideTap('Log', [500, 650, 790, 800]);
  if (!(r1.atPress === 0 && r1.seen.every((n) => n === 0) && r1.beforeLock === 0 && r1.total === 1 && getState().tab === 'log')) {
    return `Now→Log press=${r1.atPress} glide=${JSON.stringify(r1.seen)} beforeLock=${r1.beforeLock} total=${r1.total} tab=${getState().tab}`;
  }
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 400; fire(strip(), 'scroll'); await sleep(220);
  const r2 = await glideTap('Plan', [300, 150, 10, 0]);
  return (r2.atPress === 0 && r2.seen.every((n) => n === 0) && r2.beforeLock === 0 && r2.total === 1 && getState().tab === 'plan')
    || `Now→Plan press=${r2.atPress} glide=${JSON.stringify(r2.seen)} beforeLock=${r2.beforeLock} total=${r2.total} tab=${getState().tab}`;
});
// Re-aimed (2026-11-20 nowplain): backwards More→Plan=3, More→Now=2, fast glide Plan→More skipping 2 panels still counts 3.
await pin('H12. amendment A, backwards (nowplain): More → Plan ticks 3, More → Now ticks 2; fast glide skipping two panels still counts each', async () => {
  await seed({ tab: 'settings', ...segs }); strip().scrollLeft = 1200; fire(strip(), 'scroll'); await sleep(220);
  const r1 = await glideTap('Plan', [1000, 790, 600, 390, 0]);
  if (!(r1.atPress === 0 && JSON.stringify(r1.seen) === '[0,1,1,2]' && r1.total === 3 && getState().tab === 'plan')) return `More→Plan: press=${r1.atPress} glide=${JSON.stringify(r1.seen)} total=${r1.total} tab=${getState().tab}`;
  const r2 = await glideTap('More', [900, 1200]); // Now and Log both passed between two frames
  if (!(r2.atPress === 0 && JSON.stringify(r2.seen) === '[2]' && r2.total === 3 && getState().tab === 'settings')) return `Plan→More skip: press=${r2.atPress} glide=${JSON.stringify(r2.seen)} total=${r2.total}`;
  const r3 = await glideTap('Now', [1000, 790, 600, 400]); // More → Now: passes Log, locks Now = 2
  return (r3.atPress === 0 && JSON.stringify(r3.seen) === '[0,1,1]' && r3.beforeLock === 1 && r3.total === 2 && getState().tab === 'now')
    || `More→Now: press=${r3.atPress} glide=${JSON.stringify(r3.seen)} beforeLock=${r3.beforeLock} total=${r3.total} tab=${getState().tab}`;
});
// Re-aimed (2026-11-20 nowplain): swipe fling Now(400) → Log(800) → More(1200) is 1 tick at settle; reduced-motion More → Plan is 1 tick at lock.
await pin('H13. amendment A leaves swipes alone (nowplain): fling Now → Log → More is ONE tick at settle; reduced-motion tap is one tick at lock', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 400; fire(strip(), 'scroll'); await sleep(220); vib.length = 0;
  grab(); const el = strip();
  for (const px of [500, 700, 820, 1000, 1190]) { el.scrollLeft = px; fire(el, 'scroll'); await sleep(30); }
  if (vib.length) return `swipe ticked mid-fling: ${vib.length}`;
  await scrollStripTo(1200);
  if (getState().tab !== 'settings' || vib.length !== 1) return `swipe: tab=${getState().tab} vibrate×${vib.length}, want 1`;
  // reduced motion: the tap jumps (behavior auto) straight to the goal
  const mm = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: /reduce/.test(q) ? true : mm(q).matches, addEventListener() {}, removeEventListener() {} });
  try {
    vib.length = 0; scrollCalls.length = 0;
    el.scrollTo = applyingScrollTo(el);
    realClick(navBtn('Plan')); await sleep(60);
    if (!scrollCalls.length || scrollCalls[scrollCalls.length - 1].behavior !== 'auto') return `reduced motion did not jump: ${JSON.stringify(scrollCalls)}`;
    fire(el, 'scroll'); await sleep(30);
    const beforeLock = vib.length; await sleep(220);
    return (beforeLock === 0 && vib.length === 1 && getState().tab === 'plan') || `reduced-motion tap: beforeLock=${beforeLock} total=${vib.length}`;
  } finally { globalThis.matchMedia = mm; }
});
// Re-aimed (2026-11-20 nowplain): Plan/split rests at 0px, Log at 800px.
await pin('H7. a tap on the tab of the panel already showing never ticks — not on the tap, not later', async () => {
  await seed({ tab: 'plan', ...segs }); strip().scrollLeft = 0; fire(strip(), 'scroll'); await sleep(220); vib.length = 0;
  realClick(navBtn('Plan')); await sleep(60);
  fire(strip(), 'scroll'); await sleep(220);
  if (getState().tab !== 'plan' || vib.length) return `tab=${getState().tab} vibrate×${vib.length}`;
  // and from a planning sub-screen, Plan's tab (same panel: back to the Plan menu) is silent too
  await seed({ tab: 'split', ...segs }); fire(strip(), 'scroll'); await sleep(220); vib.length = 0;
  realClick(navBtn('Plan')); await sleep(60); fire(strip(), 'scroll'); await sleep(220);
  return (getState().tab === 'plan' && vib.length === 0) || `tab=${getState().tab} vibrate×${vib.length}`;
});
// Re-aimed (2026-11-20 nowplain): Now(400) → More(1200) grabbed mid-glide (700) back to Now(400) or on to Log(800).
await pin('H8. a tab tap whose glide the driver grabs and swipes back to where it started is silent; one swiped on to a third panel ticks once', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 400; fire(strip(), 'scroll'); await sleep(220); vib.length = 0;
  const el = strip(); el.scrollTo = (opts) => { scrollCalls.push(opts); };
  realClick(navBtn('More')); el.scrollTo = applyingScrollTo(el); await sleep(60);
  el.scrollLeft = 700; fire(el, 'scroll'); await sleep(30);
  grab(); await scrollStripTo(400); await sleep(60);
  if (getState().tab !== 'now' || vib.length) return `back to start: tab=${getState().tab} vibrate×${vib.length}`;
  el.scrollTo = (opts) => { scrollCalls.push(opts); };
  realClick(navBtn('More')); el.scrollTo = applyingScrollTo(el); await sleep(60);
  el.scrollLeft = 700; fire(el, 'scroll'); await sleep(30);
  grab(); await scrollStripTo(800); await sleep(60);
  return (getState().tab === 'log' && vib.length === 1) || `swiped on to Log: tab=${getState().tab} vibrate×${vib.length}`;
});
// Re-aimed (DESIGN-NAV §2.1): Now rests at 400px.
await pin('H9. every other button keeps its instant click tick (the global handler is untouched); only the four tab buttons opt out', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 400; fire(strip(), 'scroll'); await sleep(220);
  const btns = all((n) => n.localName === 'button' && n.attributes['data-haptic'] == null && !n.attributes.disabled && !(n.parentNode && n.parentNode.localName === 'nav'));
  if (btns.length < 3) return `only ${btns.length} plain buttons found`;
  const b = btns.find((x) => /Exceptions this shift/.test(x.textContent)) ?? btns[0];
  vib.length = 0;
  realClick(b);
  const got = vib.slice(); openSheet(null); await sleep(60);
  if (got.length !== 1 || got[0] !== 12) return `plain button "${b.textContent.trim().slice(0, 30)}": ${JSON.stringify(got)}, want [12] at the click`;
  // the tab buttons are the only new opt-out: each carries data-haptic, nothing else changed
  const tabs = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0].childNodes.filter((n) => n.localName === 'button');
  if (tabs.length !== 4 || !tabs.every((t) => t.attributes['data-haptic'] === 'lock')) return `tab buttons: ${tabs.map((t) => t.attributes['data-haptic']).join(',')}`;
  return true;
});
// Re-aimed (2026-11-20 nowplain): Now rests at 400px, Log at 800px.
await pin('H5. a programmatic change (restore / back / shortcut) and a settle under an open sheet are silent', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 400; vib.length = 0;
  await seed({ tab: 'settings', ...segs }); fire(strip(), 'scroll'); await sleep(220);
  openSheet({ kind: 'status' }); await sleep(60);
  await scrollStripTo(800);
  openSheet(null); await sleep(30);
  return vib.length === 0 || `vibrate×${vib.length}`;
});
// Re-aimed (2026-11-20 nowplain): Now(400) → Log(800) → More(1200).
await pin('H6. no vibration API (iPhone) — or one that throws — the swipe still commits, nothing throws', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 400;
  const nav = globalThis.navigator;
  delete nav.vibrate;
  if ('vibrate' in nav) return 'could not remove vibrate for the test';
  grab(); await scrollStripTo(800);
  if (getState().tab !== 'log') return `no-API: tab=${getState().tab}`;
  setVibrate(() => { throw new Error('blocked'); });
  grab(); await scrollStripTo(1200);
  setVibrate((p) => { vib.push(p); return true; });
  return getState().tab === 'settings' || `throwing API: tab=${getState().tab}`;
});

/* ---------------- (n) DESIGN-NAV (2026-11-20): R1 driving-view return, Now-only dock, tab-now hook, TimeHead ---------------- */
await pin('N1. DESIGN-NAV R1: returning from the driving view via Details seats the newly mounted strip on Now (1 × width), silently', async () => {
  setDrivingPeek(null);
  await seed({ ...segs, current: { status: 'D', since: T - 30 }, drivingView: true, tab: 'now' });
  if (strip()) return 'driving view did not replace the shell';
  const details = all((n) => n.localName === 'button' && has(n, 'drive-details'))[0];
  if (!details) return 'no Details button in driving view';
  scrollCalls.length = 0; vib.length = 0;
  fire(details, 'click');
  await sleep(60);
  const el = strip();
  const nowPg = pages().find((p) => has(p, 'page-now'));
  const last = scrollCalls[scrollCalls.length - 1];
  const ok = !!el && el.scrollLeft === 400
    && !!nowPg && has(nowPg, 'is-active')
    && litTab() === 'Now'
    && !!last && last.left === 400 && last.behavior === 'auto'
    && vib.length === 0;
  setDrivingPeek(null);
  return ok || `el=${!!el} scrollLeft=${el?.scrollLeft} lit=${litTab()} last=${JSON.stringify(last)} vib=${vib.length}`;
});
await pin('N2. DESIGN-NAV §2.5: exactly one .dock inside section.page-now only; only page-now has has-dock; inert off Now', async () => {
  await seed({ tab: 'now', ...segs });
  const docks = all((n) => has(n, 'dock'));
  const ps = pages();
  const nowPg = ps.find((p) => has(p, 'page-now'));
  const nav = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0];
  const inNow = nowPg && all((n) => has(n, 'dock'), nowPg).length === 1;
  const inNav = nav && all((n) => has(n, 'dock'), nav).length;
  const hasDockPages = ps.filter((p) => has(p, 'has-dock')).map((p) => cls(p).split(/\s+/).find((c) => c.startsWith('page-')));
  const off = (p) => (p.attributes.inert !== undefined && p.attributes.inert !== 'false') || p.inert === true;
  const hid = (p) => p.attributes['aria-hidden'] === 'true' || p.attributes['aria-hidden'] === true;
  if (docks.length !== 1 || !inNow || inNav !== 0 || JSON.stringify(hasDockPages) !== '["page-now"]') {
    return `docks=${docks.length} inNow=${inNow} inNav=${inNav} hasDock=${JSON.stringify(hasDockPages)}`;
  }
  if (off(nowPg) || hid(nowPg)) return 'page-now inert/hidden while active';
  for (const t of ['log', 'plan', 'settings']) {
    await seed({ tab: t, ...segs });
    const np = pages().find((p) => has(p, 'page-now'));
    if (!off(np) || !hid(np)) return `on ${t}: page-now inert=${off(np)} aria-hidden=${hid(np)}`;
  }
  return true;
});
// Re-aimed (2026-11-20 nowplain): Now carries no tab-now class (matches other tabs' .on class logic, active and inactive).
await pin('N3. nowplain: zero button.tab-now anywhere in nav.tabs; Now uses plain .on active and "" inactive, matching other tabs', async () => {
  await seed({ tab: 'now', ...segs });
  const nav = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0];
  const btns = nav.childNodes.filter((n) => n.localName === 'button');
  const nowBtns = btns.filter((b) => has(b, 'tab-now'));
  if (nowBtns.length !== 0 || btns[1].textContent.trim() !== 'Now' || cls(btns[1]).trim() !== 'on') {
    return `active: tab-now count=${nowBtns.length} idx1="${btns[1].textContent.trim()}" cls="${cls(btns[1])}"`;
  }
  await seed({ tab: 'plan', ...segs });
  const btns2 = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0].childNodes.filter((n) => n.localName === 'button');
  if (btns2.some((b) => has(b, 'tab-now')) || cls(btns2[1]).trim() !== '' || cls(btns2[0]).trim() !== 'on') {
    return `inactive: now="${cls(btns2[1])}" plan="${cls(btns2[0])}"`;
  }
  return true;
});
// Re-aimed (2026-11-20 nowplain): TimeHead travels with its screen — Log (index 2) keeps past, Plan (index 0) keeps future.
await pin('N4. TimeHead travels with its screen: past on Log (index 2, before .daynav, including resolved view) and future on Plan (index 0, before h1.screen-title)', async () => {
  const checkHead = (pg, kind, wantText, beforePred) => {
    const flat = []; const w = (n) => { flat.push(n); n.childNodes.forEach(w); }; w(pg);
    const heads = flat.filter((n) => n.localName === 'p' && has(n, 'timehead') && has(n, `timehead-${kind}`));
    if (heads.length !== 1) return `${kind}: count=${heads.length}`;
    const hd = heads[0];
    const txt = hd.textContent.replace(/\u2019/g, "'").trim();
    if (txt !== wantText) return `${kind}: text="${txt}"`;
    const target = flat.find(beforePred);
    if (!target || flat.indexOf(hd) >= flat.indexOf(target)) return `${kind}: not before target`;
    const rail = all((n) => has(n, 'timehead-rail'), hd)[0];
    if (!rail || rail.attributes['aria-hidden'] !== 'true') return `${kind}: rail missing aria-hidden`;
    if (hd.attributes.role || hd.attributes.tabindex != null) return `${kind}: interactive attrs on p`;
    const badChild = all((n) => n.localName === 'button' || n.localName === 'a' || n.attributes.tabindex != null, hd);
    if (badChild.length) return `${kind}: interactive child`;
    return null;
  };
  await seed({ tab: 'log', logResolved: false, ...segs });
  const errLog1 = checkHead(pages()[2], 'past', "The past — what's already done", (n) => has(n, 'daynav'));
  if (errLog1) return errLog1;
  await seed({ tab: 'log', logResolved: true, ...segs });
  const errLog2 = checkHead(pages()[2], 'past', "The past — what's already done", (n) => has(n, 'daynav'));
  if (errLog2) return `resolved: ${errLog2}`;
  await seed({ tab: 'plan', ...segs });
  const errPlan = checkHead(pages()[0], 'future', "The future — what's still ahead", (n) => n.localName === 'h1' && has(n, 'screen-title'));
  return errPlan || true;
});
// Re-aimed (2026-11-20 nowplain): Plan sub-screens sit on pages()[0]; Now (1) and More (3) unchanged.
await pin('N5. DESIGN-NAV §2.4: TimeHead is ABSENT on Now, More, and every Plan sub-screen (split, trip, load, recap, history)', async () => {
  await seed({ tab: 'now', ...segs });
  const ps = pages();
  if (all((n) => has(n, 'timehead'), ps[1]).length !== 0) return 'timehead on Now';
  if (all((n) => has(n, 'timehead'), ps[3]).length !== 0) return 'timehead on More';
  for (const sub of ['split', 'trip', 'load', 'recap', 'history']) {
    await seed({ tab: sub, ...segs });
    if (all((n) => has(n, 'timehead'), pages()[0]).length !== 0) return `timehead on Plan sub-screen ${sub}`;
  }
  return true;
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

/* ---------------- (l) logpin (2026-11-20): Now-only header disclaimer, Log bug button removed, pinned Log layout ---------------- */
await pin('L1. logpin: header planning-only disclaimer + Details renders on Now only (absent on Log, Plan, Split, More), and first-run Now surfaces timezone picker', async () => {
  await seed({ tab: 'now', tzChosen: false, ...segs });
  const hdr = () => all((n) => n.localName === 'header' && has(n, 'top'))[0];
  const hasDisc = () => {
    const h0 = hdr();
    const d = h0 && all((n) => n.localName === 'details' && has(n, 'disclaimer-line'), h0)[0];
    return !!d && /Planning only — not a log, not an ELD/.test(d.textContent) && /Details/.test(d.textContent);
  };
  if (!hasDisc()) return 'missing disclaimer-line on Now';
  if (!/Where is your home terminal\?/.test(hdr().textContent)) return 'first-run timezone picker missing on Now';
  for (const t of ['log', 'plan', 'split', 'settings']) {
    await seed({ tab: t, tzChosen: false, ...segs });
    const h0 = hdr();
    if (all((n) => n.localName === 'details' && has(n, 'disclaimer-line'), h0).length !== 0 || /Planning only — not a log, not an ELD/.test(h0.textContent)) {
      return `disclaimer-line still present on ${t}`;
    }
  }
  return true;
});
await pin('L2. logpin: Log screen has NO "Report a bug (GitHub)" button; More screen keeps its Bug reports card', async () => {
  await seed({ tab: 'log', ...segs });
  const ps = pages();
  const logPg = ps[2], morePg = ps[3];
  const logHasBug = /Report a bug \(GitHub\)/.test(logPg.textContent);
  const moreHasBug = /Bug reports/.test(morePg.textContent) && /Report a bug \(GitHub\)/.test(morePg.textContent);
  return (!logHasBug && moreHasBug) || `logHasBug=${logHasBug} moreHasBug=${moreHasBug}`;
});
await pin('L3. logpin: Log splits into .log-pin (.daynav + graph card), .log-scroll (entries), and .log-foot (.addbtn); day nav updates both pinned graph and list', async () => {
  const twoDays = {
    segments: [
      { status: 'OFF', start: T - 1440 - 600, end: T - 1440 - 120 },
      { status: 'D', start: T - 1440 - 120, end: T - 1440 - 30 },
      { status: 'OFF', start: T - 900, end: T - 300 },
      { status: 'D', start: T - 300, end: T - 60 },
    ],
    current: { status: 'ON', since: T - 60 },
  };
  await seed({ tab: 'log', ...twoDays });
  const logPg = pages()[2];
  const pinEl = all((n) => has(n, 'log-pin'), logPg)[0];
  const scrollEl = all((n) => has(n, 'log-scroll'), logPg)[0];
  const footEl = all((n) => has(n, 'log-foot'), logPg)[0];
  if (!pinEl || !scrollEl || !footEl) return `missing regions: pin=${!!pinEl} scroll=${!!scrollEl} foot=${!!footEl}`;
  const pinHasNavAndGraph = !!all((n) => has(n, 'daynav'), pinEl)[0] && !!all((n) => has(n, 'log-graph-card'), pinEl)[0] && !!all((n) => n.localName === 'svg' && has(n, 'grid'), pinEl)[0] && !!all((n) => has(n, 'daytotals'), pinEl)[0];
  const scrollHasEntries = all((n) => n.localName === 'button' && has(n, 'entry'), scrollEl).length >= 1;
  const footHasAdd = !!all((n) => n.localName === 'button' && has(n, 'addbtn'), footEl)[0] && all((n) => n.localName === 'button' && has(n, 'addbtn'), scrollEl).length === 0;
  if (!pinHasNavAndGraph || !scrollHasEntries || !footHasAdd) return `structure wrong: pin=${pinHasNavAndGraph} scroll=${scrollHasEntries} foot=${footHasAdd}`;
  const titleBefore = all((n) => has(n, 'daynav-title'), pinEl)[0].textContent;
  const totalsBefore = all((n) => has(n, 'daytotals'), pinEl)[0].textContent;
  const entriesBefore = all((n) => n.localName === 'button' && has(n, 'entry'), scrollEl).map((e) => e.textContent).join('|');
  const prevBtn = all((n) => n.localName === 'button' && n.attributes['aria-label'] === 'Previous day', pinEl)[0];
  fire(prevBtn, 'click'); await sleep(60);
  const titleAfter = all((n) => has(n, 'daynav-title'), pinEl)[0].textContent;
  const totalsAfter = all((n) => has(n, 'daytotals'), pinEl)[0].textContent;
  const entriesAfter = all((n) => n.localName === 'button' && has(n, 'entry'), scrollEl).map((e) => e.textContent).join('|');
  if (titleAfter === titleBefore || totalsAfter === totalsBefore || entriesAfter === entriesBefore) {
    return `Previous day did not update both pinned graph and list: title "${titleBefore}"->"${titleAfter}", totals "${totalsBefore}"->"${totalsAfter}"`;
  }
  const nextBtn = all((n) => n.localName === 'button' && n.attributes['aria-label'] === 'Next day', pinEl)[0];
  fire(nextBtn, 'click'); await sleep(60);
  const titleBack = all((n) => has(n, 'daynav-title'), pinEl)[0].textContent;
  return titleBack === titleBefore || `Next day did not restore Today: "${titleBack}" vs "${titleBefore}"`;
});

/* ---------------- (p) log summary PDF follow-on (2026-11-20) ---------------- */
const E = await import('../../../engine/src/index.ts');
const PDF_DISC = 'Planning only — not a log, not an ELD. This printout is not an official record of duty status.';
const dataCard = () => all((n) => n.localName === 'section' && has(n, 'card') && all((h2) => h2.localName === 'h2' && h2.textContent.trim() === 'Data', n).length > 0, pages()[3])[0];
const daysInput = () => { const c = dataCard(); return c && all((n) => n.localName === 'input' && n.attributes.type === 'number', c)[0]; };
const pdfBtn = () => { const c = dataCard(); return c && all((n) => n.localName === 'button' && n.textContent.trim() === 'Log summary (PDF)', c)[0]; };
const reportEl = () => all((n) => n.localName === 'article' && has(n, 'print-report'))[0] ?? null;

await pin('P1. log summary PDF: More Data card has Days field (default 14) and "Log summary (PDF)" button next to Export JSON; no report mounted initially', async () => {
  A.setPrintReport(null);
  await seed({ tab: 'settings', ...segs });
  const c = dataCard();
  if (!c) return 'no Data card on More';
  const inp = daysInput();
  const btn = pdfBtn();
  const hasExport = /Export JSON/.test(c.textContent);
  const hasDaysLabel = all((n) => n.localName === 'label' && has(n, 'pdf-days') && /Days/.test(n.textContent), c).length === 1;
  const val = String(inp?.value ?? inp?.attributes?.value ?? '');
  return (hasExport && hasDaysLabel && !!inp && val === '14' && !!btn && !reportEl())
    || `export=${hasExport} label=${hasDaysLabel} val="${val}" btn=${!!btn} rep=${!!reportEl()}`;
});

await pin('P2. log summary PDF: entering 8 produces 8 day sections and 14 produces 14 (newest-first), each with Grid + engine-matching totals + header/footer disclaimers', async () => {
  A.setPrintReport(null);
  let printCalls = 0;
  const prevPrint = globalThis.print;
  globalThis.print = () => { printCalls++; };
  try {
    const cfg = { ...getState().config, dayStartHour: 0, timeZone: deviceTz };
    const d0 = E.carrierDayStart(T, cfg);
    const d1 = E.carrierDayStart(d0 - 1, cfg);
    const d2 = E.carrierDayStart(d1 - 1, cfg); // intentionally empty -> no-duty day
    const d3 = E.carrierDayStart(d2 - 1, cfg);
    const seeded = {
      tab: 'settings',
      config: cfg,
      segments: [
        { status: 'OFF', start: d3, end: d3 + 480, createdAt: 1 },
        { status: 'D', start: d3 + 480, end: d3 + 780, createdAt: 2 },
        { status: 'SB', start: d1, end: d1 + 600, createdAt: 3 },
        { status: 'ON', start: d1 + 600, end: d1 + 690, createdAt: 4 },
        { status: 'D', start: d1 + 690, end: d1 + 990, createdAt: 5 },
        { status: 'OFF', start: d0, end: d0 + 180, createdAt: 6 },
        { status: 'D', start: d0 + 180, end: d0 + 420, createdAt: 7 },
      ],
      current: { status: 'ON', since: d0 + 420, createdAt: 8 },
    };
    await seed(seeded);
    const ev = E.evaluate(S.allSegments(getState(), T), { asOf: T, config: cfg });
    const expectedDays = A.buildLogSummaryDays(getState(), T, 14);
    const checkCount = async (want) => {
      const beforeCalls = printCalls;
      const inp = daysInput();
      inp.value = String(want);
      fire(inp, 'input'); await sleep(30);
      fire(pdfBtn(), 'click'); await sleep(60);
      if (printCalls !== beforeCalls + 1) return `window.print not invoked for ${want} days (${beforeCalls}->${printCalls})`;
      const rep = reportEl();
      if (!rep) return `no .print-report rendered for ${want} days`;
      const secs = all((n) => n.localName === 'section' && has(n, 'pr-day'), rep);
      if (secs.length !== want) return `expected ${want} day sections, got ${secs.length}`;
      // Section order: newest-first (back = 0 .. want - 1, strictly descending day start)
      const starts = secs.map((s) => Number(s.attributes['data-day-start']));
      for (let i = 1; i < starts.length; i++) if (!(starts[i] < starts[i - 1])) return `sections not strictly newest-first at index ${i}`;
      if (starts[0] !== d0) return `first section is not today (${starts[0]} vs ${d0})`;
      // Header & footer disclaimers + metadata
      const head = all((n) => n.localName === 'header' && has(n, 'pr-head'), rep)[0];
      const foot = all((n) => n.localName === 'footer' && has(n, 'pr-foot'), rep)[0];
      if (!head || !head.textContent.includes('Split Decision') || !head.textContent.includes(`${want} days`) || !head.textContent.includes('Generated') || !head.textContent.includes(PDF_DISC)) {
        return `header missing required fields for ${want} days`;
      }
      if (!foot || !foot.textContent.includes(PDF_DISC)) return `footer missing disclaimer for ${want} days`;
      // Every section has an SVG Grid and a .daytotals matching engine evaluation
      for (let i = 0; i < secs.length; i++) {
        const sec = secs[i];
        const svg = all((n) => n.localName === 'svg' && has(n, 'grid'), sec)[0];
        const tot = all((n) => has(n, 'daytotals'), sec)[0];
        if (!svg || !tot) return `section ${i} missing svg or daytotals`;
        const cells = tot.childNodes.filter((c) => c.localName === 'div').map((c) => c.textContent);
        const exp = expectedDays[i];
        // Totals labels come from STATUS_LABEL ('On Duty' / 'Off Duty') — the same source the
        // Log screen's own .daytotals renders from. Sentence-case expectations here were a
        // test-authoring error in the PDF round (Ada verification, 2026-11-21).
        const wantCells = [
          `Driving${S.dur(exp.totals.D)}`,
          `On Duty${S.dur(exp.totals.ON)}`,
          `Off Duty${S.dur(exp.totals.OFF)}`,
          `Sleeper${S.dur(exp.totals.SB)}`,
        ];
        if (JSON.stringify(cells) !== JSON.stringify(wantCells)) return `section ${i} totals ${JSON.stringify(cells)} != ${JSON.stringify(wantCells)}`;
      }
      // Cross-check engine evaluate().cycle.days onDuty for days after any 34h restart
      for (const cd of ev.cycle.days) {
        const exp = expectedDays.find((x) => x.start === cd.start);
        if (!exp) return `engine cycle day missing on ${cd.label}`;
        if ((ev.cycle.restartEnd === null || cd.start >= ev.cycle.restartEnd) && exp.totals.D + exp.totals.ON !== cd.onDuty) {
          return `engine cycle day mismatch on ${cd.label}`;
        }
      }
      // Empty day (d2 = index 2) marked as no-duty day with zero entry rows
      const emptySec = secs[2];
      const emptyRows = all((n) => n.localName === 'li' && has(n, 'pr-entry'), emptySec);
      if (emptyRows.length !== 0 || !/no-duty day/i.test(emptySec.textContent)) return `empty day wrong: rows=${emptyRows.length} text="${emptySec.textContent.slice(0, 120)}"`;
      return true;
    };
    const r8 = await checkCount(8);
    if (r8 !== true) return r8;
    const r14 = await checkCount(14);
    if (r14 !== true) return r14;
    return true;
  } finally {
    globalThis.print = prevPrint;
    A.setPrintReport(null);
  }
});

await pin('P3. log summary PDF: invalid/out-of-range inputs (0, blank, 500, 14.5) show visible alert feedback, render NO report, and do not print', async () => {
  A.setPrintReport(null);
  let printCalls = 0;
  const prevPrint = globalThis.print;
  globalThis.print = () => { printCalls++; };
  try {
    await seed({ tab: 'settings', ...segs });
    for (const badVal of ['0', '', '500', '14.5']) {
      const inp = daysInput();
      inp.value = badVal;
      fire(inp, 'input'); await sleep(30);
      fire(pdfBtn(), 'click'); await sleep(50);
      const alert = all((n) => n.attributes.role === 'alert', dataCard())[0];
      if (!alert || !alert.textContent.trim()) return `no visible alert for "${badVal}"`;
      if (reportEl()) return `report unexpectedly rendered for "${badVal}"`;
      if (printCalls !== 0) return `window.print called for invalid input "${badVal}"`;
    }
    return true;
  } finally {
    globalThis.print = prevPrint;
    A.setPrintReport(null);
  }
});

let fails = 0;
for (const [st, name, why] of res) { console.log(`${st} ${name}${why ? ` — ${why}` : ''}`); if (st === 'FAIL') fails++; }
console.log(`revisions: ${res.length - fails}/${res.length} pins pass`);
render(null, root);
process.exit(fails ? 1 : 0);

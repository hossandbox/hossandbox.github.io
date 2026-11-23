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
// LoadTab scrolls each step to top; domshim has no window.scrollTo layout method.
globalThis.scrollTo = () => {};
const popListeners = new Set();
{
  const rawAdd = globalThis.addEventListener;
  const rawRem = globalThis.removeEventListener;
  globalThis.addEventListener = (t, f) => { if (t === 'popstate') popListeners.add(f); return rawAdd(t, f); };
  globalThis.removeEventListener = (t, f) => { if (t === 'popstate') popListeners.delete(f); return rawRem(t, f); };
}
const firePopState = () => { for (const f of [...popListeners]) f({ type: 'popstate' }); };
// Minimal browser-like history stack so backnav.ts's h.go(-n) settles its `ours` counter via popstate.
{
  const stack = [{ state: null }];
  let idx = 0;
  globalThis.history = {
    get state() { return stack[idx]?.state ?? null; },
    get length() { return stack.length; },
    pushState(d) { stack.length = idx + 1; stack.push({ state: d }); idx++; },
    replaceState(d) { stack[idx] = { state: d }; },
    go(delta) {
      idx = Math.max(0, Math.min(stack.length - 1, idx + delta));
      queueMicrotask(() => firePopState());
    },
    back() { this.go(-1); },
    forward() { this.go(1); },
  };
}
const pressHardwareBack = () => {
  // Simulate the phone's hardware Back button (not our own h.go): pop one entry and emit popstate.
  firePopState();
};
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
const { App, setLaunchNotice, setDrivingPeek, openSheet, PANEL_ORDER, BAR_ORDER } = A;
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
const settingsRoom = () => all((n) => n.localName === 'section' && has(n, 'page-settings'))[0];
const planRoom = () => all((n) => n.localName === 'section' && has(n, 'page-tool'))[0];
const settingsBackBtn = () => all((n) => n.localName === 'button' && has(n, 'settings-back'))[0];
const gearBtn = () => all((n) => n.localName === 'button' && n.attributes?.['aria-label'] === 'Settings')[0];
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

/* ---------------- (a) the bottom bar shows Plan, Now, Log (Settings in header gear → own room) ---------------- */
// Re-aimed (2026-11-21 transitions, Lorico): Settings is no longer a strip panel or swipe destination;
// PANEL_ORDER and BAR_ORDER both govern the 3 main panels (Plan — Now — Log).
await pin('A1. PANEL_ORDER is plan/now/log (3-panel strip; Settings lives outside as its own room)', async () => {
  return JSON.stringify(PANEL_ORDER) === JSON.stringify(['plan', 'now', 'log']) || `got ${JSON.stringify(PANEL_ORDER)}`;
});
// Re-aimed (2026-11-21 nav-gear, Lorico): bottom bar drops More/Settings and renders 3 tabs from BAR_ORDER (Plan, Now, Log).
await pin('A2. BAR_ORDER is plan/now/log and the rendered tab bar reads Plan, Now, Log in that order', async () => {
  await seed({ ...segs });
  if (JSON.stringify(BAR_ORDER) !== JSON.stringify(['plan', 'now', 'log'])) return `BAR_ORDER=${JSON.stringify(BAR_ORDER)}`;
  const nav = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0];
  if (!nav) return 'no tab bar rendered';
  const labels = nav.childNodes.filter((n) => n.localName === 'button').map((b) => b.textContent.trim());
  return JSON.stringify(labels) === JSON.stringify(['Plan', 'Now', 'Log']) || `got ${JSON.stringify(labels)}`;
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
// Re-aimed (2026-11-21 transitions + plan-dissolve, Lorico): strip has 3 panels matching PANEL_ORDER (page-plan, page-now, page-log);
// Settings and Plan tool rooms sit outside <main class="pages"> sharing the .room mechanism.
await pin('S1. <main> is the 3-page strip matching PANEL_ORDER/BAR_ORDER; Settings and Plan tool rooms live outside the strip', async () => {
  const ps = pages();
  if (ps.length !== 3) return `pages=${ps.length}`;
  const want = ['page-plan', 'page-now', 'page-log'];
  const got = ps.map((p) => cls(p).split(/\s+/).find((c) => c.startsWith('page-')));
  const expectedFromOrder = PANEL_ORDER.map((k) => `page-${k}`);
  const nav = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0];
  const barIds = nav.childNodes.filter((n) => n.localName === 'button').map((b) => ({ Plan: 'plan', Now: 'now', Log: 'log' }[b.textContent.trim()]));
  const sr = settingsRoom();
  const pr = planRoom();
  const roomsOutsideStrip = !!sr && has(sr, 'room') && has(sr, 'settings-room') && sr.parentNode !== strip()
    && !!pr && has(pr, 'room') && has(pr, 'plan-room') && pr.parentNode !== strip();
  return (JSON.stringify(got) === JSON.stringify(want) && JSON.stringify(got) === JSON.stringify(expectedFromOrder) && JSON.stringify(barIds) === JSON.stringify(BAR_ORDER) && roomsOutsideStrip)
    || `strip=${JSON.stringify(got)} bar=${JSON.stringify(barIds)} roomsOutsideStrip=${roomsOutsideStrip}`;
});
await pin('S2. all three strip panels and the Settings room stay mounted at once (never unmounts a page)', async () => {
  await seed({ tab: 'now', ...segs });
  const txt = root.textContent;
  const marks = ['Plan a sleeper split', 'Report a bug (GitHub)'];
  const missing = marks.filter((m) => !txt.includes(m));
  const entry = all((n) => n.localName === 'button' && has(n, 'entry'))[0];
  if (!entry) missing.push('log entry');
  return missing.length === 0 || `missing while tab=now: ${missing.join('; ')}`;
});
// Re-aimed (2026-11-21 transitions, Lorico): snap stops are 0=plan/Plan, 400=now/Now, 800=log/Log;
// scrolling past Log (1200) clamps to Log — Settings is not a swipe destination.
await pin('S3. scrolling the strip walks Plan/Now/Log at every snap point and never swipes into Settings', async () => {
  await seed({ tab: 'now', ...segs });
  const stops = [[0, 'plan', 'Plan'], [400, 'now', 'Now'], [800, 'log', 'Log']];
  for (const [px, tab, label] of stops) {
    await scrollStripTo(px);
    if (getState().tab !== tab) return `at ${px}px tab=${getState().tab}, want ${tab}`;
    if (litTab() !== label) return `at ${px}px lit=${litTab()}, want ${label}`;
  }
  await scrollStripTo(1200); // beyond last panel must never commit 'settings'
  if (getState().tab !== 'log') return `past-end scroll committed ${getState().tab}, want log`;
  return true;
});
// Re-aimed (2026-11-21 transitions, Lorico): 3-panel ring walks 0=plan, 400=now, 800=log, forth and back, twice.
await pin('S4. REPEATED walks keep working — the full 3-panel ring, forth and back, twice (Lorico\u2019s one-swipe bug)', async () => {
  const ring = [[800, 'log'], [400, 'now'], [0, 'plan'], [400, 'now'], [800, 'log'], [400, 'now'], [0, 'plan'], [400, 'now'], [800, 'log']];
  for (const [px, tab] of ring) {
    await scrollStripTo(px);
    if (getState().tab !== tab) return `at ${px}px tab=${getState().tab}, want ${tab}`;
  }
  return true;
});
await pin('S5. the page nodes are the same objects after the walks (scroll state lives on them)', async () => {
  const before = pages();
  const srBefore = settingsRoom();
  const prBefore = planRoom();
  await scrollStripTo(0); await scrollStripTo(800); await scrollStripTo(400);
  const after = pages();
  return (before.length === 3 && after.length === 3 && before.every((p, i) => p === after[i]) && srBefore === settingsRoom() && prBefore === planRoom()) || 'a page node was replaced';
});
// Re-aimed (2026-11-21 transitions, Lorico): Plan/Log/Now bar taps scroll the 3-panel strip to 0/800/400;
// header Settings gear dissolves into Settings room WITHOUT scrolling the strip, and Settings Back returns.
await pin('S6. each bar tap scrolls the strip (Plan=0, Log=800, Now=400); header gear opens Settings without scrolling the strip', async () => {
  await seed({ tab: 'now', ...segs });
  strip().scrollLeft = 400; scrollCalls.length = 0;
  const nav = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0];
  const btn = (lbl) => nav.childNodes.filter((n) => n.localName === 'button').find((b) => b.textContent.trim() === lbl);
  for (const [lbl, tab, px, pageCls, wantLit] of [
    ['Plan', 'plan', 0, 'page-plan', 'Plan'],
    ['Log', 'log', 800, 'page-log', 'Log'],
    ['Now', 'now', 400, 'page-now', 'Now'],
  ]) {
    scrollCalls.length = 0;
    fire(btn(lbl), 'click');
    await sleep(60);
    const last = scrollCalls[scrollCalls.length - 1];
    const activePg = pages().find((p) => has(p, 'is-active'));
    if (getState().tab !== tab || !last || last.left !== px || litTab() !== wantLit || !activePg || !has(activePg, pageCls)) {
      return `tap ${lbl}: tab=${getState().tab} scrollTo=${JSON.stringify(last)} lit=${litTab()} active=${activePg && cls(activePg)}`;
    }
  }
  scrollCalls.length = 0;
  const slBefore = strip().scrollLeft;
  fire(gearBtn(), 'click'); await sleep(60);
  if (getState().tab !== 'settings' || scrollCalls.length !== 0 || strip().scrollLeft !== slBefore || !has(settingsRoom(), 'is-active')) {
    return `gear: tab=${getState().tab} scrollCalls=${scrollCalls.length} sl=${strip().scrollLeft}/${slBefore} active=${cls(settingsRoom())}`;
  }
  fire(settingsBackBtn(), 'click'); await sleep(60);
  return (getState().tab === 'now' && scrollCalls.length === 0 && strip().scrollLeft === slBefore && litTab() === 'Now')
    || `back: tab=${getState().tab} scrollCalls=${scrollCalls.length} sl=${strip().scrollLeft}/${slBefore} lit=${litTab()}`;
});
// Re-aimed (2026-11-21 transitions, Lorico): 3-panel strip max offset is 800px (Log); Plan=0, Log=800.
await pin('S7. a programmatic tab change (restore / deep link / back) scrolls the strip to match', async () => {
  strip().scrollLeft = 800; scrollCalls.length = 0;
  await seed({ tab: 'plan', ...segs });
  const lastPlan = scrollCalls[scrollCalls.length - 1];
  if (!lastPlan || lastPlan.left !== 0) return `plan scrollTo=${JSON.stringify(lastPlan)}`;
  scrollCalls.length = 0;
  await seed({ tab: 'log', ...segs });
  const lastLog = scrollCalls[scrollCalls.length - 1];
  return (lastLog && lastLog.left === 800) || `log scrollTo=${JSON.stringify(lastLog)}`;
});
// Re-aimed (2026-11-21 plan-dissolve, Lorico): planning sub-screens open in section.page-tool.room.plan-room
// without scrolling the strip, leaving the Plan hub mounted behind them and ignoring strip scrolls while open.
await pin('S8. a planning sub-screen opens in the Plan tool room without scrolling the strip; strip scrolls never clobber it', async () => {
  await seed({ tab: 'plan', ...segs });
  strip().scrollLeft = 0; scrollCalls.length = 0;
  await seed({ tab: 'split', ...segs });
  if (scrollCalls.length !== 0 || strip().scrollLeft !== 0) return `unexpected strip scroll: calls=${JSON.stringify(scrollCalls)} sl=${strip().scrollLeft}`;
  const pr = planRoom();
  if (!has(pr, 'is-active') || !pr.textContent.includes('Break 1')) return 'Split Lab content not active in Plan tool room';
  if (!pages()[0].textContent.includes('Plan a sleeper split')) return 'Plan hub not kept mounted behind the room';
  await scrollStripTo(0);
  if (getState().tab !== 'split') return `settle at 0 clobbered the sub-screen: tab=${getState().tab}`;
  await scrollStripTo(400);
  return getState().tab === 'split' || `strip scroll behind room clobbered sub-screen: tab=${getState().tab}, want split`;
});
// Re-aimed (2026-11-21 transitions + plan-dissolve, Lorico): Log is panel index 2 of 3; both closed off-strip rooms are inert + aria-hidden.
await pin('S9. the pages off the settled panel (and closed Settings/Plan rooms) are inert and aria-hidden; the settled page is neither', async () => {
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
  const sr = settingsRoom();
  if (!off(sr) || !hid(sr)) bad.push(`settings room inert=${off(sr)} hidden=${hid(sr)}`);
  const pr = planRoom();
  if (!off(pr) || !hid(pr)) bad.push(`plan room inert=${off(pr)} hidden=${hid(pr)}`);
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
// Re-aimed (2026-11-21 transitions, Lorico): Now is at 400px between Plan (0px) and Log (800px) on the 3-panel strip.
await pin('S11. a settle that fires mid-flight (a tab tap\u2019s smooth scroll pausing its events) never commits the panel it is passing', async () => {
  await seed({ tab: 'plan', ...segs }); strip().scrollLeft = 0;
  const el = strip();
  el.scrollTo = (opts) => { scrollCalls.push(opts); }; // travelling: records, does not land
  await seed({ tab: 'log', ...segs });
  el.scrollTo = applyingScrollTo(el);
  if (getState().tab !== 'log') return `setup tab=${getState().tab}`;
  await scrollStripTo(400); // the strip is passing Now with a quiet spell in its events
  if (getState().tab !== 'log') return `mid-flight settle committed ${getState().tab}`;
  await scrollStripTo(800); // it lands on its goal
  if (getState().tab !== 'log') return `arrival tab=${getState().tab}`;
  await scrollStripTo(400); // and once arrived, the driver\u2019s own scrolls commit again
  return getState().tab === 'now' || `after arrival, scroll to 400 gave ${getState().tab}`;
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
// Re-aimed (2026-11-21 transitions, Lorico): walking the 3-panel strip Plan → Now → Log → Now → Plan gives 4 clicks, one each.
await pin('H2. once per panel change: walking Plan → Now → Log → Now → Plan gives four clicks, one each', async () => {
  await seed({ tab: 'plan', ...segs }); strip().scrollLeft = 0; vib.length = 0;
  grab(); await scrollStripTo(400); grab(); await scrollStripTo(800); grab(); await scrollStripTo(400); grab(); await scrollStripTo(0);
  return (getState().tab === 'plan' && vib.length === 4) || `tab=${getState().tab} vibrate×${vib.length}`;
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
// Amendment A (Lorico 2026-11-20; re-aimed 2026-11-21 transitions): a strip tab tap's glide ticks
// as it passes each intermediate panel, plus the lock. Settings no longer glides on the strip; it
// dissolves in with a single crisp button tap tick.
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
// Re-aimed (2026-11-21 transitions, Lorico): Settings no longer glides on the strip; Amendment A 2-panel
// forward glide is Plan→Log (2 ticks: pass Now, lock Log), while gear→Settings dissolves with 1 tap tick and zero strip travel.
await pin('H10. amendment A (transitions): Plan → Log yields 2 ticks (Now, lock Log); gear → Settings dissolves with 1 crisp tap tick and zero strip scroll', async () => {
  await seed({ tab: 'plan', ...segs }); strip().scrollLeft = 0; fire(strip(), 'scroll'); await sleep(220);
  const r = await glideTap('Log', [150, 350, 420, 600, 790, 800]);
  const want = [0, 0, 1, 1, 1];
  if (r.atPress !== 0) return `Plan→Log ticked at press: ${r.atPress}`;
  if (JSON.stringify(r.seen) !== JSON.stringify(want)) return `Plan→Log glide ${JSON.stringify(r.seen)}, want ${JSON.stringify(want)}`;
  if (r.beforeLock !== 1 || getState().tab !== 'log' || r.total !== 2) return `Plan→Log beforeLock=${r.beforeLock} total=${r.total} tab=${getState().tab}`;
  await sleep(200);
  if (vib.length !== 2) return `Plan→Log ticked again at rest: ${vib.length}`;
  // Gear → Settings room dissolve (from Log at 800px): 1 crisp [12] tap tick, zero strip scroll, no pass-through ticks
  vib.length = 0; scrollCalls.length = 0;
  realClick(gearBtn()); await sleep(220);
  return (getState().tab === 'settings' && vib.length === 1 && vib[0] === 12 && scrollCalls.length === 0 && strip().scrollLeft === 800)
    || `gear→Settings tab=${getState().tab} vib=${JSON.stringify(vib)} scrollCalls=${scrollCalls.length} sl=${strip().scrollLeft}`;
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
// Re-aimed (2026-11-21 transitions, Lorico): backwards Amendment A is Log→Plan=2 (pass Now, lock Plan) +
// fast glide Plan→Log skipping Now between frames=2; Settings Back dissolves back with 1 crisp tap tick and zero strip scroll.
await pin('H12. amendment A, backwards (transitions): Log → Plan ticks 2, fast glide Plan → Log counts 2; Settings Back returns with 1 tap tick', async () => {
  await seed({ tab: 'log', ...segs }); strip().scrollLeft = 800; fire(strip(), 'scroll'); await sleep(220);
  const r1 = await glideTap('Plan', [600, 390, 150, 0]);
  if (!(r1.atPress === 0 && JSON.stringify(r1.seen) === '[0,1,1]' && r1.beforeLock === 1 && r1.total === 2 && getState().tab === 'plan')) {
    return `Log→Plan: press=${r1.atPress} glide=${JSON.stringify(r1.seen)} beforeLock=${r1.beforeLock} total=${r1.total} tab=${getState().tab}`;
  }
  const r2 = await glideTap('Log', [600, 800]); // Now passed between two frames
  if (!(r2.atPress === 0 && JSON.stringify(r2.seen) === '[1]' && r2.total === 2 && getState().tab === 'log')) {
    return `Plan→Log skip: press=${r2.atPress} glide=${JSON.stringify(r2.seen)} total=${r2.total}`;
  }
  // Open Settings from Log, then return via Settings Back: 1 crisp [12] tap tick on departure, zero strip scroll
  fire(gearBtn(), 'click'); await sleep(60);
  vib.length = 0; scrollCalls.length = 0;
  realClick(settingsBackBtn()); await sleep(220);
  return (getState().tab === 'log' && vib.length === 1 && vib[0] === 12 && scrollCalls.length === 0 && strip().scrollLeft === 800)
    || `Settings Back→Log: tab=${getState().tab} vib=${JSON.stringify(vib)} scrollCalls=${scrollCalls.length} sl=${strip().scrollLeft}`;
});
// Re-aimed (2026-11-21 transitions, Lorico): swipe fling Plan(0) → Now(400) → Log(800) is 1 tick at settle; reduced-motion Log → Plan is 1 tick at lock.
await pin('H13. amendment A leaves swipes alone (transitions): fling Plan → Now → Log is ONE tick at settle; reduced-motion tap is one tick at lock', async () => {
  await seed({ tab: 'plan', ...segs }); strip().scrollLeft = 0; fire(strip(), 'scroll'); await sleep(220); vib.length = 0;
  grab(); const el = strip();
  for (const px of [120, 300, 440, 620, 790]) { el.scrollLeft = px; fire(el, 'scroll'); await sleep(30); }
  if (vib.length) return `swipe ticked mid-fling: ${vib.length}`;
  await scrollStripTo(800);
  if (getState().tab !== 'log' || vib.length !== 1) return `swipe: tab=${getState().tab} vibrate×${vib.length}, want 1`;
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
// Re-aimed (2026-11-21 transitions, Lorico): Settings no longer glides on the strip; mid-glide grab-and-cancel
// is tested on Plan(0) → Log(800) grabbed at 300px back to Plan(0) (0 ticks) or swiped on to Now(400) (1 tick).
await pin('H8. a Plan → Log tap whose glide the driver grabs and swipes back to Plan is silent; one swiped on to Now ticks once', async () => {
  await seed({ tab: 'plan', ...segs }); strip().scrollLeft = 0; fire(strip(), 'scroll'); await sleep(220); vib.length = 0;
  const el = strip(); el.scrollTo = (opts) => { scrollCalls.push(opts); };
  realClick(navBtn('Log')); el.scrollTo = applyingScrollTo(el); await sleep(60);
  el.scrollLeft = 300; fire(el, 'scroll'); await sleep(30);
  grab(); await scrollStripTo(0); await sleep(60);
  if (getState().tab !== 'plan' || vib.length) return `back to start: tab=${getState().tab} vibrate×${vib.length}`;
  el.scrollTo = (opts) => { scrollCalls.push(opts); };
  realClick(navBtn('Log')); el.scrollTo = applyingScrollTo(el); await sleep(60);
  el.scrollLeft = 300; fire(el, 'scroll'); await sleep(30);
  grab(); await scrollStripTo(400); await sleep(60);
  return (getState().tab === 'now' && vib.length === 1) || `swiped on to Now: tab=${getState().tab} vibrate×${vib.length}`;
});
// Re-aimed (2026-11-21 transitions, Lorico): ONLY the 3 bottom-bar strip tab buttons carry data-haptic="lock";
// every other button (including header Settings gear and Settings Back) keeps its instant [12] click tick.
await pin('H9. every non-strip button (including Settings gear & Back) keeps its instant [12] click tick; only the 3 strip tab buttons opt out', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 400; fire(strip(), 'scroll'); await sleep(220);
  const btns = all((n) => n.localName === 'button' && n.attributes['data-haptic'] == null && !n.attributes.disabled && !(n.parentNode && n.parentNode.localName === 'nav'));
  if (btns.length < 3) return `only ${btns.length} plain buttons found`;
  const b = btns.find((x) => /Exceptions this shift/.test(x.textContent)) ?? btns[0];
  vib.length = 0;
  realClick(b);
  const got = vib.slice(); openSheet(null); await sleep(60);
  if (got.length !== 1 || got[0] !== 12) return `plain button "${b.textContent.trim().slice(0, 30)}": ${JSON.stringify(got)}, want [12] at the click`;
  const tabs = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0].childNodes.filter((n) => n.localName === 'button');
  const gear = gearBtn();
  const back = settingsBackBtn();
  if (tabs.length !== 3 || !tabs.every((t) => t.attributes['data-haptic'] === 'lock') || gear?.attributes?.['data-haptic'] != null || back?.attributes?.['data-haptic'] != null) {
    return `tab buttons=${tabs.length} (${tabs.map((t) => t.attributes['data-haptic']).join(',')}) gear=${gear?.attributes?.['data-haptic']} back=${back?.attributes?.['data-haptic']}`;
  }
  return true;
});
// Re-aimed (2026-11-21 transitions, Lorico): programmatic tab changes (including Settings) and settle under open sheet are silent.
await pin('H5. a programmatic change (restore / back / shortcut / Settings) and a settle under an open sheet are silent', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 400; vib.length = 0;
  await seed({ tab: 'settings', ...segs }); await sleep(60);
  await seed({ tab: 'log', ...segs }); fire(strip(), 'scroll'); await sleep(220);
  openSheet({ kind: 'status' }); await sleep(60);
  await scrollStripTo(400);
  openSheet(null); await sleep(30);
  return vib.length === 0 || `vibrate×${vib.length}`;
});
// Re-aimed (2026-11-21 transitions, Lorico): 3-panel strip swipes Now(400) → Log(800) → Plan(0).
await pin('H6. no vibration API (iPhone) — or one that throws — the swipe still commits, nothing throws', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 400;
  const nav = globalThis.navigator;
  delete nav.vibrate;
  if ('vibrate' in nav) return 'could not remove vibrate for the test';
  grab(); await scrollStripTo(800);
  if (getState().tab !== 'log') return `no-API: tab=${getState().tab}`;
  setVibrate(() => { throw new Error('blocked'); });
  grab(); await scrollStripTo(0);
  setVibrate((p) => { vib.push(p); return true; });
  return getState().tab === 'plan' || `throwing API: tab=${getState().tab}`;
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
// Re-aimed (2026-11-21 removals): TimeHead eyebrows removed on both Log and Plan; .log-pin starts directly with .daynav and Plan keeps h1.screen-title.
await pin('N4. removals: TimeHead is ABSENT on Log (both entries and resolved views; .log-pin starts with .daynav) and ABSENT on Plan (h1.screen-title stays)', async () => {
  await seed({ tab: 'log', logResolved: false, ...segs });
  const logPg1 = pages()[2];
  if (all((n) => has(n, 'timehead'), logPg1).length !== 0 || /The past/.test(logPg1.textContent)) return 'timehead still on Log (entries)';
  const pin1 = all((n) => has(n, 'log-pin'), logPg1)[0];
  const pinFirst = pin1?.childNodes.find((n) => n.localName);
  if (!pinFirst || !has(pinFirst, 'daynav')) return `log-pin first child not daynav: ${pinFirst?.localName}.${pinFirst?.attributes?.class}`;
  await seed({ tab: 'log', logResolved: true, ...segs });
  const logPg2 = pages()[2];
  if (all((n) => has(n, 'timehead'), logPg2).length !== 0 || /The past/.test(logPg2.textContent)) return 'timehead still on Log (resolved)';
  await seed({ tab: 'plan', ...segs });
  const planPg = pages()[0];
  if (all((n) => has(n, 'timehead'), planPg).length !== 0 || /The future/.test(planPg.textContent)) return 'timehead still on Plan';
  const planH1 = all((n) => n.localName === 'h1' && has(n, 'screen-title'), planPg)[0];
  if (!planH1 || planH1.textContent.trim() !== 'Plan') return `Plan heading missing: ${planH1?.textContent}`;
  return true;
});
// Re-aimed (2026-11-21 transitions, Lorico): Settings lives outside the strip as settingsRoom().
await pin('N5. DESIGN-NAV §2.4: TimeHead is ABSENT on Now, More, and every Plan sub-screen (split, trip, load, recap, history)', async () => {
  await seed({ tab: 'now', ...segs });
  const ps = pages();
  if (all((n) => has(n, 'timehead'), ps[1]).length !== 0) return 'timehead on Now';
  if (all((n) => has(n, 'timehead'), settingsRoom()).length !== 0) return 'timehead on More';
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

/* ---------------- (l) logpin + startup disclaimer pop-up ---------------- */
await pin('L1. header planning-only disclaimer line is absent on Now, Log, Plan, Split, and More', async () => {
  const hdr = () => all((n) => n.localName === 'header' && has(n, 'top'))[0];
  for (const t of ['now', 'log', 'plan', 'split', 'settings']) {
    await seed({ tab: t, tzChosen: false, ...segs });
    const h0 = hdr();
    if (all((n) => n.localName === 'details' && has(n, 'disclaimer-line'), h0).length !== 0 || /Planning only — not a log, not an ELD/.test(h0.textContent)) {
      return `disclaimer-line still present on ${t}`;
    }
  }
  return true;
});
await pin('D1. fresh state (disclaimerAcked false): startup pop-up renders verbatim About disclaimer and single "Understood — don\'t show again" button', async () => {
  await seed({ tab: 'now', disclaimerAcked: false, segments: [], current: null });
  const dlg = all((n) => n.attributes?.role === 'dialog' && n.attributes?.['aria-labelledby'] === 'disclaimer-title')[0];
  if (!dlg) return 'missing startup disclaimer dialog';
  const morePg = settingsRoom();
  const aboutP = all((n) => n.localName === 'p' && /Split Decision — HOS What-If Planner\./.test(n.textContent), morePg)[0];
  const modalP = all((n) => n.localName === 'p', dlg)[0];
  const btns = all((n) => n.localName === 'button', dlg);
  if (!aboutP || !modalP) return 'missing About or modal paragraph';
  if (modalP.textContent !== aboutP.textContent) return `modal text differs from About: ${modalP.textContent}`;
  if (btns.length !== 1) return `expected exactly 1 button in disclaimer modal, got ${btns.length}`;
  if (btns[0].textContent.trim() !== "Understood — don't show again") return `wrong button label: ${btns[0].textContent}`;
  return true;
});
await pin('D2. tapping "Understood — don\'t show again" dismisses pop-up, persists disclaimerAcked=true, and re-render shows no pop-up', async () => {
  await seed({ tab: 'now', disclaimerAcked: false, segments: [], current: null });
  const dlg = all((n) => n.attributes?.role === 'dialog' && n.attributes?.['aria-labelledby'] === 'disclaimer-title')[0];
  const btn = dlg && all((n) => n.localName === 'button', dlg)[0];
  if (!btn) return 'missing acknowledge button';
  fire(btn, 'click');
  await sleep(60);
  if (all((n) => n.attributes?.role === 'dialog' && n.attributes?.['aria-labelledby'] === 'disclaimer-title').length !== 0) return 'dialog did not dismiss after click';
  if (getState().disclaimerAcked !== true) return 'state.disclaimerAcked not true';
  const persisted = JSON.parse(localStorage.getItem('hos-sandbox-v1') || '{}');
  if (persisted.disclaimerAcked !== true) return `localStorage did not persist disclaimerAcked=true: ${JSON.stringify(persisted.disclaimerAcked)}`;
  // Re-render from persisted state: no pop-up returns.
  render(null, root); await sleep(20);
  setState(S.parseSaved(localStorage.getItem('hos-sandbox-v1')));
  render(h(App, {}), root); await sleep(80);
  if (all((n) => n.attributes?.role === 'dialog' && n.attributes?.['aria-labelledby'] === 'disclaimer-title').length !== 0) return 'dialog reappeared after reload from persisted state';
  return true;
});
await pin('D3. acked state (disclaimerAcked true): no startup pop-up on launch and Now omits old header disclaimer line', async () => {
  await seed({ tab: 'now', disclaimerAcked: true, ...segs });
  const hasDlg = all((n) => n.attributes?.role === 'dialog' && n.attributes?.['aria-labelledby'] === 'disclaimer-title').length > 0;
  const nowPage = pages()[1];
  const hdr = all((n) => n.localName === 'header' && has(n, 'top'))[0];
  const hasOldHeader = /Planning only — not a log, not an ELD/.test(hdr.textContent) || /Planning only — not a log, not an ELD/.test(nowPage.textContent);
  return (!hasDlg && !hasOldHeader) || `hasDlg=${hasDlg} hasOldHeader=${hasOldHeader}`;
});
await pin('D4. home-terminal timezone setting remains reachable in More → Rules', async () => {
  await seed({ tab: 'settings', disclaimerAcked: true, tzChosen: false, ...segs });
  const morePg = settingsRoom();
  const tzInput = all((n) => n.localName === 'input' && n.attributes?.['aria-label'] === 'Home terminal time zone', morePg)[0];
  return (!!tzInput && /Home terminal time zone/.test(morePg.textContent)) || 'missing Home terminal time zone input in More → Rules';
});
await pin('L2. logpin: Log screen has NO "Report a bug (GitHub)" button; More screen keeps its Bug reports card', async () => {
  await seed({ tab: 'log', ...segs });
  const ps = pages();
  const logPg = ps[2], morePg = settingsRoom();
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

/* ---------------- (r) removals (2026-11-21): header summary strip & Log undo row absent ---------------- */
await pin('R1. removals: header summary strip (.compact / "of driving · Stop by" / "drive again at") is ABSENT on Plan, Log, More, Split, and Now (driving left & out of hours)', async () => {
  const hdr = () => all((n) => n.localName === 'header' && has(n, 'top'))[0];
  const outSegs = { segments: [{ status: 'OFF', start: T - 1200, end: T - 600 }, { status: 'D', start: T - 600, end: T - 10 }], current: { status: 'ON', since: T - 10 } };
  for (const [label, data] of [['hours-left', segs], ['out-of-hours', outSegs]]) {
    for (const t of ['now', 'plan', 'log', 'split', 'settings']) {
      await seed({ tab: t, ...data });
      const h0 = hdr();
      if (all((n) => has(n, 'compact'), h0).length !== 0 || /of driving · Stop by|drive again at/.test(h0.textContent)) {
        return `${label} on ${t}: "${h0.textContent}"`;
      }
    }
  }
  return true;
});
await pin('R2. removals: Log undo row is ABSENT on page-log even when undo is armed; Now keeps .status-undo and undoLast restores', async () => {
  await seed({ tab: 'log', ...segs });
  A.tapStatus('OFF', T); await sleep(40);
  if (!A.currentUndo()) return 'undo was not armed by tapStatus';
  const logPg = pages()[2], nowPg = pages()[1];
  const logUndoRows = all((n) => has(n, 'undo'), logPg);
  const nowUndoRows = all((n) => has(n, 'status-undo'), nowPg);
  const restored = A.undoLast(); await sleep(40);
  if (logUndoRows.length !== 0) return `Log still rendered undo row: ${logUndoRows[0].textContent}`;
  if (nowUndoRows.length !== 1) return `Now missing status-undo: count=${nowUndoRows.length}`;
  return (restored && getState().current?.status === 'ON') || 'undoLast did not restore status';
});

/* ---------------- (p) log summary PDF follow-on (2026-11-20) ---------------- */
const E = await import('../../../engine/src/index.ts');
const PDF_DISC = 'Planning only — not a log, not an ELD. This printout is not an official record of duty status.';
const dataCard = () => all((n) => n.localName === 'section' && has(n, 'card') && all((h2) => h2.localName === 'h2' && h2.textContent.trim() === 'Data', n).length > 0, settingsRoom())[0];
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

/* ---------------- (w) Weekly Recap vs. 34-Hour Reset & Home-Time Planner ---------------- */
await pin('W1. Plan hub lists 7 .plan-item tools with "Weekly recap vs. 34" 5th, "When to roll & PTA" 6th, and "Split-sleeper rescue" at the bottom; tapping Weekly opens verdict banner first and Back returns to Plan', async () => {
  A.openWeekPlanner(false);
  A.openRolloutPlanner(false);
  A.openRescuePlanner(false);
  await seed({ tab: 'plan', ...segs });
  const planPg = pages()[0];
  const items = all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg);
  const titles = items.map((b) => all((n) => n.localName === 'b', b)[0]?.textContent?.trim());
  if (items.length !== 7 || titles[4] !== 'Weekly recap vs. 34' || titles[5] !== 'When to roll & PTA' || titles[6] !== 'Split-sleeper rescue') return `items=${JSON.stringify(titles)}`;
  fire(items[4], 'click'); await sleep(60);
  const rm = planRoom();
  const txt = rm.textContent;
  const h1 = all((n) => n.localName === 'h1' && has(n, 'screen-title'), rm)[0]?.textContent?.trim();
  const verdict = all((n) => n.attributes?.['data-wrecap-verdict'] === '1', rm)[0];
  if (h1 !== 'Weekly recap vs. 34' || !verdict) return `h1=${h1} verdict=${!!verdict}`;
  if (txt.indexOf(verdict.textContent) > txt.indexOf('Day-by-day forecast')) return 'verdict banner is not before Day-by-day forecast';
  const back = all((n) => n.localName === 'button' && has(n, 'back'), rm)[0];
  if (!back || !/Plan/.test(back.textContent)) return `back=${back?.textContent}`;
  fire(back, 'click'); await sleep(60);
  const afterItems = all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg);
  return (!has(rm, 'is-active') && afterItems.length === 7) || `after back active=${cls(rm)} items=${afterItems.length}`;
});

await pin('W2. tight cycle fixture: verdict banner names Recap Wall & 34h reset net gain; changing budget preset & target home time updates live', async () => {
  A.openWeekPlanner(false);
  A.openRolloutPlanner(false);
  const E = await import('../../../engine/src/index.ts');
  const cfg = { ...getState().config, cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago' };
  const todayStart = E.carrierDayStart(T, cfg);
  const starts = [todayStart];
  for (let i = 1; i < 8; i++) starts.unshift(E.carrierDayStart(starts[0] - 1, cfg));
  const hrs = [6, 4, 3, 10, 11, 11, 11, 9];
  const tightSegs = hrs.map((h, i) => ({ status: 'D', start: starts[i] + 60, end: starts[i] + 60 + h * 60, createdAt: i + 1 }));
  await seed({ tab: 'plan', config: cfg, segments: tightSegs, current: null });
  const planPg = pages()[0];
  const lastBtn = all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg)[4];
  fire(lastBtn, 'click'); await sleep(60);
  const rm = planRoom();
  const v1 = all((n) => n.attributes?.['data-wrecap-verdict'] === '1', rm)[0]?.textContent ?? '';
  if (!/Recaps pinch to 5h 00m/.test(v1) || !/nets \+/.test(v1)) return `unexpected verdict: ${v1}`;
  // Select Target Home Time = 4 shifts -> Home Time summary card + cruise cap appears
  const sel = all((n) => n.localName === 'select' && n.attributes?.['aria-label'] === 'Target home time or day off', rm)[0];
  if (!sel) return 'missing home-time select';
  sel.value = '4';
  fire(sel, 'change'); await sleep(60);
  const txt = rm.textContent;
  const okHome = /Recap cruise cap/.test(txt) && /cap shifts at/.test(txt);
  // Tap 8h 30m preset button -> updates projection
  const btn85 = all((n) => n.localName === 'button' && n.textContent.trim() === '8h 30m', rm)[0];
  if (!btn85) return 'missing 8h 30m preset button';
  fire(btn85, 'click'); await sleep(60);
  const okPreset = has(btn85, 'on');
  A.openWeekPlanner(false);
  return (okHome && okPreset) || `okHome=${okHome} okPreset=${okPreset} txt=${txt.slice(0, 300)}`;
});

await pin('W3. 60/7 cycle variant & empty past days: displays 60-hour / 7-day cycle and explicitly notes unlogged days counted as 0h', async () => {
  A.openWeekPlanner(false);
  A.openRolloutPlanner(false);
  const cfg60 = { ...getState().config, cycle: '60/7', dayStartHour: 0, timeZone: 'America/Chicago' };
  await seed({ tab: 'plan', config: cfg60, segments: [], current: null, historyAcknowledged: false });
  const planPg = pages()[0];
  const lastBtn = all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg)[4];
  fire(lastBtn, 'click'); await sleep(60);
  const txt = planRoom().textContent;
  const ok = /60-hour \/ 7-day cycle/.test(txt)
    && /7 of your last 7 carrier days have no logged entries and are counted as 0h/.test(txt)
    && /Recap wall/.test(txt);
  A.openWeekPlanner(false);
  return ok || `60/7 text: ${txt.slice(0, 400)}`;
});

await pin('W4. leaving Plan tab closes Weekly recap vs. 34 sub-screen so returning to Plan shows the 7-item hub', async () => {
  A.openWeekPlanner(false);
  A.openRolloutPlanner(false);
  A.openRescuePlanner(false);
  await seed({ tab: 'plan', ...segs });
  const planPg = pages()[0];
  const lastBtn = all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg)[4];
  fire(lastBtn, 'click'); await sleep(60);
  if (!A.isWeekPlannerOpen()) return 'did not open';
  await seed({ tab: 'now', ...segs });
  await seed({ tab: 'plan', ...segs });
  const items = all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg);
  return (!A.isWeekPlannerOpen() && items.length === 7) || `open=${A.isWeekPlannerOpen()} items=${items.length}`;
});

/* ---------------- (r) Work-Backwards Appointment & Departure Planner ("When to roll & PTA") ---------------- */
const setRolloutAppt = async (planPg, dateStr, timeStr) => {
  const apptBtn = all((n) => n.localName === 'button' && n.attributes?.['data-rollout-appt-btn'] === '1', planPg)[0];
  if (!apptBtn) return 'missing rollout appointment button';
  fire(apptBtn, 'click'); await sleep(40);
  const sh = all((n) => has(n, 'sheet'))[0];
  if (!sh) return 'appointment sheet did not open';
  const dayIn = all((n) => n.localName === 'input' && has(n, 'ed-day-input'), sh)[0];
  const timeIn = all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), sh)[0];
  const applyBtn = all((n) => n.localName === 'button' && has(n, 'ed-go'), sh)[0];
  if (!dayIn || !timeIn || !applyBtn) return `missing sheet controls day=${!!dayIn} time=${!!timeIn} apply=${!!applyBtn}`;
  if (dateStr) { dayIn.value = dateStr; fire(dayIn, 'input'); await sleep(30); }
  if (timeStr) { timeIn.value = timeStr; fire(timeIn, 'input'); await sleep(30); }
  fire(applyBtn, 'click'); await sleep(60);
  return null;
};

await pin('R1. Plan hub lists 7 .plan-item tools with "When to roll & PTA" 6th and "Split-sleeper rescue" at the bottom; tapping When to roll opens verdict banner before checklist & PTA, Back returns to Plan', async () => {
  A.openWeekPlanner(false);
  A.openRolloutPlanner(false);
  A.openRescuePlanner(false);
  await seed({ tab: 'plan', ...segs });
  const planPg = pages()[0];
  const items = all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg);
  const titles = items.map((b) => all((n) => n.localName === 'b', b)[0]?.textContent?.trim());
  if (items.length !== 7 || titles[5] !== 'When to roll & PTA' || titles[6] !== 'Split-sleeper rescue') return `items=${JSON.stringify(titles)}`;
  fire(items[5], 'click'); await sleep(60);
  const rm = planRoom();
  const h1 = all((n) => n.localName === 'h1' && has(n, 'screen-title'), rm)[0]?.textContent?.trim();
  const verdict = all((n) => n.attributes?.['data-rollout-verdict'] === '1', rm)[0];
  const checklist = all((n) => n.attributes?.['data-rollout-checklist'] === '1', rm)[0];
  const pta = all((n) => n.attributes?.['data-rollout-pta'] === '1', rm)[0];
  const txt = rm.textContent;
  if (h1 !== 'When to roll & PTA' || !verdict || !checklist || !pta) return `h1=${h1} v=${!!verdict} c=${!!checklist} p=${!!pta}`;
  if (txt.indexOf(verdict.textContent) > txt.indexOf(checklist.textContent)) return 'verdict not before checklist';
  const back = all((n) => n.localName === 'button' && has(n, 'back'), rm)[0];
  fire(back, 'click'); await sleep(60);
  const afterItems = all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg);
  return (!has(rm, 'is-active') && afterItems.length === 7) || `after back active=${cls(rm)} items=${afterItems.length}`;
});

await pin('R2. cross-zone timezone toggle: 08:00 Eastern (local) vs 07:00 Central (home terminal) yields identical dual-displayed roll-out, 08:00-10:00 sweet spot & PTA', async () => {
  A.openWeekPlanner(false);
  A.openRolloutPlanner(false);
  const E = await import('../../../engine/src/index.ts');
  const cfgChi = { ...getState().config, cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false };
  const nowWed06 = E.localToMinute(2026, 11, 11, 6, 'America/Chicago');
  const prevStart = E.localToMinute(2026, 11, 10, 20, 'America/Chicago');
  const sOk = [
    { status: 'OFF', start: prevStart - 600, end: prevStart, createdAt: 1 },
    { status: 'D', start: prevStart, end: prevStart + 480, createdAt: 2 },
    { status: 'OFF', start: prevStart + 480, end: prevStart + 510, createdAt: 3 },
    { status: 'D', start: prevStart + 510, end: nowWed06, createdAt: 4 },
  ];
  await seed({ tab: 'plan', nowOverride: nowWed06, config: cfgChi, segments: sOk, current: null });
  const planPg = pages()[0];
  fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg)[5], 'click'); await sleep(60);
  const rm = planRoom();

  // Choose America/New_York, date 2026-11-12, time 08:00 in local mode via ClockPick sheet, 550 mi @ 55 mph
  const tzSel = all((n) => n.localName === 'select' && n.attributes?.['aria-label'] === 'Appointment time zone', rm)[0];
  const btn550 = all((n) => n.localName === 'button' && n.textContent.trim() === '550 mi', rm)[0];
  if (!tzSel || !btn550) return 'missing rollout controls';
  tzSel.value = 'America/New_York'; fire(tzSel, 'change'); await sleep(40);
  const errLocal = await setRolloutAppt(rm, '2026-11-12', '08:00');
  if (errLocal) return errLocal;
  fire(btn550, 'click'); await sleep(60);

  const rollLocal = all((n) => n.attributes?.['data-rollout-rollout'] === '1', rm)[0]?.textContent ?? '';
  const sweetLocal = all((n) => n.attributes?.['data-rollout-sweetspot'] === '1', rm)[0]?.textContent ?? '';
  const ptaLocal = all((n) => n.attributes?.['data-rollout-pta'] === '1', rm)[0]?.textContent ?? '';

  // Toggle to Home terminal and enter 07:00 Central via ClockPick sheet — must produce the EXACT same roll-out and PTA!
  const termBtn = all((n) => n.localName === 'button' && /Home terminal/.test(n.textContent), rm)[0];
  fire(termBtn, 'click'); await sleep(40);
  const errTerm = await setRolloutAppt(rm, '2026-11-12', '07:00');
  if (errTerm) return errTerm;

  const rollTerm = all((n) => n.attributes?.['data-rollout-rollout'] === '1', rm)[0]?.textContent ?? '';
  const ptaTerm = all((n) => n.attributes?.['data-rollout-pta'] === '1', rm)[0]?.textContent ?? '';

  A.openRolloutPlanner(false);
  const okDual = /19:30 Central/.test(rollLocal) && /20:30 Eastern/.test(rollLocal);
  const okSweet = /08:00–10:00 parking sweet spot/.test(sweetLocal);
  const okPta = /08:00 Eastern/.test(ptaLocal) && /07:15 Eastern/.test(ptaLocal) && /10:00 Eastern/.test(ptaLocal);
  const okSame = rollLocal === rollTerm && ptaLocal === ptaTerm;
  return (okDual && okSweet && okPta && okSame) || JSON.stringify({ okDual, okSweet, okPta, okSame, rollLocal, ptaLocal });
});

await pin('R3. miles + speed vs direct drive hours mode equivalence in live DOM (550 mi @ 55 mph === 10h 00m direct)', async () => {
  A.openWeekPlanner(false);
  A.openRolloutPlanner(false);
  const E = await import('../../../engine/src/index.ts');
  const cfgChi = { ...getState().config, cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false };
  const nowWed06 = E.localToMinute(2026, 11, 11, 6, 'America/Chicago');
  await seed({ tab: 'plan', nowOverride: nowWed06, config: cfgChi, segments: [], current: null });
  const planPg = pages()[0];
  fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg)[5], 'click'); await sleep(60);
  const rm = planRoom();

  const btn550 = all((n) => n.localName === 'button' && n.textContent.trim() === '550 mi', rm)[0];
  fire(btn550, 'click'); await sleep(60);
  const brkMiles = all((n) => n.attributes?.['data-rollout-break'] === '1', rm)[0]?.textContent ?? '';
  const shutMiles = all((n) => n.attributes?.['data-rollout-shutdown'] === '1', rm)[0]?.textContent ?? '';

  const hrsModeBtn = all((n) => n.localName === 'button' && n.textContent.trim() === 'Direct drive hours', rm)[0];
  fire(hrsModeBtn, 'click'); await sleep(40);
  const btn10h = all((n) => n.localName === 'button' && n.textContent.trim() === '10h', rm)[0];
  fire(btn10h, 'click'); await sleep(60);
  const brkHours = all((n) => n.attributes?.['data-rollout-break'] === '1', rm)[0]?.textContent ?? '';
  const shutHours = all((n) => n.attributes?.['data-rollout-shutdown'] === '1', rm)[0]?.textContent ?? '';

  A.openRolloutPlanner(false);
  return (brkMiles === brkHours && shutMiles === shutHours && brkMiles.length > 0)
    || JSON.stringify({ brkMiles, brkHours, shutMiles, shutHours });
});

await pin('R4. infeasible run (10h break cannot complete before roll-out): shows plain message, hides impossible checklist & PTA, one-tap shift recovers', async () => {
  A.openWeekPlanner(false);
  A.openRolloutPlanner(false);
  const E = await import('../../../engine/src/index.ts');
  const cfgChi = { ...getState().config, cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false };
  const nowWed16 = E.localToMinute(2026, 11, 11, 16, 'America/Chicago');
  const segsTired = [
    { status: 'OFF', start: nowWed16 - 1260, end: nowWed16 - 660, createdAt: 1 },
    { status: 'D', start: nowWed16 - 660, end: nowWed16 - 300, createdAt: 2 },
    { status: 'OFF', start: nowWed16 - 300, end: nowWed16 - 270, createdAt: 3 },
    { status: 'D', start: nowWed16 - 270, end: nowWed16, createdAt: 4 },
  ];
  await seed({ tab: 'plan', nowOverride: nowWed16, config: cfgChi, segments: segsTired, current: null });
  const planPg = pages()[0];
  fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg)[5], 'click'); await sleep(60);
  const rm = planRoom();

  const errSet = await setRolloutAppt(rm, '2026-11-12', '10:00');
  if (errSet) return errSet;

  const verdict = all((n) => n.attributes?.['data-rollout-verdict'] === '1', rm)[0]?.textContent ?? '';
  const infCard = all((n) => n.attributes?.['data-rollout-infeasible'] === '1', rm)[0];
  const badChecklist = all((n) => n.attributes?.['data-rollout-checklist'] === '1', rm);
  const badPta = all((n) => n.attributes?.['data-rollout-pta'] === '1', rm);
  if (!/Does not fit/.test(verdict) || !/10-hour break cannot finish/.test(verdict)) return `bad verdict: ${verdict}`;
  if (!infCard || badChecklist.length !== 0 || badPta.length !== 0) return `inf=${!!infCard} chk=${badChecklist.length} pta=${badPta.length}`;

  // One-tap shift to earliest workable appointment flips to legal timetable
  const shiftBtn = all((n) => n.localName === 'button' && /Use earliest workable appointment/.test(n.textContent), rm)[0];
  if (!shiftBtn) return 'missing recovery shift button';
  fire(shiftBtn, 'click'); await sleep(60);
  const okChecklist = all((n) => n.attributes?.['data-rollout-checklist'] === '1', rm).length === 1;
  const okPta = all((n) => n.attributes?.['data-rollout-pta'] === '1', rm).length === 1;
  A.openRolloutPlanner(false);
  return (okChecklist && okPta) || `after shift chk=${okChecklist} pta=${okPta}`;
});

await pin('R5. leaving Plan tab closes When to roll & PTA sub-screen so returning to Plan shows the 7-item hub', async () => {
  A.openWeekPlanner(false);
  A.openRolloutPlanner(false);
  A.openRescuePlanner(false);
  await seed({ tab: 'plan', ...segs });
  const planPg = pages()[0];
  const lastBtn = all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg)[5];
  fire(lastBtn, 'click'); await sleep(60);
  if (!A.isRolloutPlannerOpen()) return 'did not open';
  await seed({ tab: 'now', ...segs });
  await seed({ tab: 'plan', ...segs });
  const items = all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg);
  return (!A.isRolloutPlannerOpen() && items.length === 7) || `open=${A.isRolloutPlannerOpen()} items=${items.length}`;
});

await pin('R6. rollout screen has no raw <input type="time"> or <input type="date"> of its own; ClockPick inputs only appear inside the open sheet', async () => {
  A.openWeekPlanner(false);
  A.openRolloutPlanner(false);
  await seed({ tab: 'plan', ...segs });
  const planPg = pages()[0];
  fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg)[5], 'click'); await sleep(60);
  const rm = planRoom();

  const rawClosed = all((n) => n.localName === 'input' && (n.attributes?.type === 'time' || n.attributes?.type === 'date'), rm);
  const rootClosed = all((n) => n.localName === 'input' && (n.attributes?.type === 'time' || n.attributes?.type === 'date'));
  if (rawClosed.length !== 0 || rootClosed.length !== 0) return `closed raw=${rawClosed.length} root=${rootClosed.length}`;

  const apptBtn = all((n) => n.localName === 'button' && n.attributes?.['data-rollout-appt-btn'] === '1', rm)[0];
  if (!apptBtn) return 'missing appointment button';
  fire(apptBtn, 'click'); await sleep(40);
  const sh = all((n) => has(n, 'sheet'))[0];
  const rawOnPage = all((n) => n.localName === 'input' && (n.attributes?.type === 'time' || n.attributes?.type === 'date'), rm);
  const inSheetTime = all((n) => n.localName === 'input' && n.attributes?.type === 'time', sh);
  const inSheetDate = all((n) => n.localName === 'input' && n.attributes?.type === 'date', sh);
  // Re-aimed (2026-11-22 polish): all bottom sheets retain .is-closing across the 200ms slide-down exit then unmount.
  openSheet(null); await sleep(260);
  const rootAfter = all((n) => n.localName === 'input' && (n.attributes?.type === 'time' || n.attributes?.type === 'date'));
  A.openRolloutPlanner(false);
  return (rawOnPage.length === 0 && inSheetTime.length === 1 && inSheetDate.length === 1 && rootAfter.length === 0)
    || JSON.stringify({ rawOnPage: rawOnPage.length, inSheetTime: inSheetTime.length, inSheetDate: inSheetDate.length, rootAfter: rootAfter.length });
});

await pin('R7. tapping rollout appointment opens ClockPick sheet naming entry zone with day chips, big clock, preset rows, Another day, and enabled Apply', async () => {
  A.openWeekPlanner(false);
  A.openRolloutPlanner(false);
  const E = await import('../../../engine/src/index.ts');
  const cfgChi = { ...getState().config, cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false };
  const nowWed06 = E.localToMinute(2026, 11, 11, 6, 'America/Chicago');
  await seed({ tab: 'plan', nowOverride: nowWed06, config: cfgChi, segments: [], current: null });
  const planPg = pages()[0];
  fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg)[5], 'click'); await sleep(60);
  const rm = planRoom();

  const tzSel = all((n) => n.localName === 'select' && n.attributes?.['aria-label'] === 'Appointment time zone', rm)[0];
  tzSel.value = 'America/New_York'; fire(tzSel, 'change'); await sleep(40);

  const apptBtn = all((n) => n.localName === 'button' && n.attributes?.['data-rollout-appt-btn'] === '1', rm)[0];
  fire(apptBtn, 'click'); await sleep(40);
  const sh = all((n) => has(n, 'sheet'))[0];
  if (!sh) return 'sheet did not open';
  const title = all((n) => n.localName === 'h2', sh)[0]?.textContent ?? '';
  const dayBtns = all((n) => n.localName === 'button', all((n) => has(n, 'ed-days'), sh)[0] || { childNodes: [] });
  const clockOut = all((n) => n.localName === 'output', all((n) => has(n, 'ed-clock'), sh)[0] || { childNodes: [] })[0];
  const timeIn = all((n) => n.localName === 'input' && n.attributes?.['aria-label'] === 'Appointment time', sh)[0];
  const keyRows = all((n) => has(n, 'ed-keys'), sh);
  const keyTexts = all((n) => n.localName === 'button', sh).map((b) => b.textContent.trim());
  const anotherDay = all((n) => n.localName === 'input' && has(n, 'ed-day-input'), sh)[0];
  const applyBtn = all((n) => n.localName === 'button' && has(n, 'ed-go'), sh)[0];

  const beforeClock = clockOut?.textContent?.trim();
  const plus1h = all((n) => n.localName === 'button' && n.textContent.trim() === '+ 1 hour', sh)[0];
  if (plus1h) { fire(plus1h, 'click'); await sleep(30); }
  const afterClock = all((n) => n.localName === 'output', sh)[0]?.textContent?.trim();

  openSheet(null); await sleep(30);
  A.openRolloutPlanner(false);
  const okZone = /Eastern/.test(title) && /Eastern/.test(sh.textContent);
  const okDays = dayBtns.length === 4;
  const okClock = !!clockOut && !!timeIn && beforeClock === '08:00' && afterClock === '09:00';
  const okKeys = keyRows.length === 2 && keyTexts.includes('+ 1 hour') && keyTexts.includes('− 1 hour') && keyTexts.includes('+15') && keyTexts.includes('−15');
  const okAnyDay = !!anotherDay;
  const okApply = !!applyBtn && !applyBtn.disabled && !applyBtn.attributes?.disabled;
  return (okZone && okDays && okClock && okKeys && okAnyDay && okApply)
    || JSON.stringify({ title, okZone, days: dayBtns.length, beforeClock, afterClock, keyRows: keyRows.length, okKeys, okAnyDay, okApply });
});

await pin('R8. cross-zone (Chicago home / New York entry) sets 08:00 -> stores date + "08:00" and resolves 08:00 Eastern / 07:00 Central; same-zone (Chicago/Chicago) stores & resolves exact wall time', async () => {
  A.openWeekPlanner(false);
  A.openRolloutPlanner(false);
  const E = await import('../../../engine/src/index.ts');
  const cfgChi = { ...getState().config, cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false };
  const nowWed06 = E.localToMinute(2026, 11, 11, 6, 'America/Chicago');
  await seed({ tab: 'plan', nowOverride: nowWed06, config: cfgChi, segments: [], current: null });
  const planPg = pages()[0];
  fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg)[5], 'click'); await sleep(60);
  const rm = planRoom();

  // Cross-zone: home America/Chicago, entry America/New_York (local mode)
  const tzSel = all((n) => n.localName === 'select' && n.attributes?.['aria-label'] === 'Appointment time zone', rm)[0];
  tzSel.value = 'America/New_York'; fire(tzSel, 'change'); await sleep(40);
  const errX = await setRolloutAppt(rm, '2026-11-12', '08:00');
  if (errX) return errX;

  const btnX = all((n) => n.localName === 'button' && n.attributes?.['data-rollout-appt-btn'] === '1', rm)[0];
  const storedDateX = btnX?.attributes?.['data-rollout-appt-date'];
  const storedTimeX = btnX?.attributes?.['data-rollout-appt-time'];
  const btnTextX = btnX?.textContent ?? '';
  const arrTextX = all((n) => n.attributes?.['data-rollout-arrival'] === '1', rm)[0]?.textContent ?? '';

  // Reopen sheet to confirm ClockPick displays the exact stored wall date/time (2026-11-12, 08:00)
  fire(btnX, 'click'); await sleep(40);
  const shX = all((n) => has(n, 'sheet'))[0];
  const dayElX = all((n) => n.localName === 'input' && has(n, 'ed-day-input'), shX)[0];
  const timeElX = all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), shX)[0];
  const reopenDateX = dayElX?.value ?? dayElX?.attributes?.value;
  const reopenTimeX = timeElX?.value ?? timeElX?.attributes?.value;
  const reopenOutX = all((n) => n.localName === 'output', shX)[0]?.textContent?.trim();
  openSheet(null); await sleep(30);

  // Same-zone: home America/Chicago, entry America/Chicago
  tzSel.value = 'America/Chicago'; fire(tzSel, 'change'); await sleep(40);
  const errS = await setRolloutAppt(rm, '2026-11-12', '09:30');
  if (errS) return errS;
  const btnS = all((n) => n.localName === 'button' && n.attributes?.['data-rollout-appt-btn'] === '1', rm)[0];
  const storedDateS = btnS?.attributes?.['data-rollout-appt-date'];
  const storedTimeS = btnS?.attributes?.['data-rollout-appt-time'];
  const btnTextS = btnS?.textContent ?? '';

  fire(btnS, 'click'); await sleep(40);
  const shS = all((n) => has(n, 'sheet'))[0];
  const dayElS = all((n) => n.localName === 'input' && has(n, 'ed-day-input'), shS)[0];
  const timeElS = all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), shS)[0];
  const reopenDateS = dayElS?.value ?? dayElS?.attributes?.value;
  const reopenTimeS = timeElS?.value ?? timeElS?.attributes?.value;
  openSheet(null); await sleep(30);
  A.openRolloutPlanner(false);

  const okCross = storedDateX === '2026-11-12' && storedTimeX === '08:00'
    && /Thu Nov 12, 08:00 Eastern/.test(btnTextX) && /Thu Nov 12, 07:00 Central/.test(btnTextX)
    && /08:00 Eastern/.test(arrTextX) && /07:00 Central/.test(arrTextX)
    && reopenDateX === '2026-11-12' && reopenTimeX === '08:00' && reopenOutX === '08:00';
  const okSame = storedDateS === '2026-11-12' && storedTimeS === '09:30'
    && /Thu Nov 12, 09:30 Central/.test(btnTextS) && !/Eastern/.test(btnTextS)
    && reopenDateS === '2026-11-12' && reopenTimeS === '09:30';
  return (okCross && okSame)
    || JSON.stringify({ storedDateX, storedTimeX, btnTextX, reopenDateX, reopenTimeX, reopenOutX, storedDateS, storedTimeS, btnTextS, reopenDateS, reopenTimeS });
});

await pin('R9. recovery "Use earliest workable appointment" updates stored appointment fields and reopened ClockPick sheet reflects recovered date & time', async () => {
  A.openWeekPlanner(false);
  A.openRolloutPlanner(false);
  const E = await import('../../../engine/src/index.ts');
  const cfgChi = { ...getState().config, cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false };
  const nowWed16 = E.localToMinute(2026, 11, 11, 16, 'America/Chicago');
  const segsTired = [
    { status: 'OFF', start: nowWed16 - 1260, end: nowWed16 - 660, createdAt: 1 },
    { status: 'D', start: nowWed16 - 660, end: nowWed16 - 300, createdAt: 2 },
    { status: 'OFF', start: nowWed16 - 300, end: nowWed16 - 270, createdAt: 3 },
    { status: 'D', start: nowWed16 - 270, end: nowWed16, createdAt: 4 },
  ];
  await seed({ tab: 'plan', nowOverride: nowWed16, config: cfgChi, segments: segsTired, current: null });
  const planPg = pages()[0];
  fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), planPg)[5], 'click'); await sleep(60);
  const rm = planRoom();

  const errSet = await setRolloutAppt(rm, '2026-11-12', '10:00');
  if (errSet) return errSet;
  const beforeBtn = all((n) => n.localName === 'button' && n.attributes?.['data-rollout-appt-btn'] === '1', rm)[0];
  const beforePair = `${beforeBtn?.attributes?.['data-rollout-appt-date']} ${beforeBtn?.attributes?.['data-rollout-appt-time']}`;

  const shiftBtn = all((n) => n.localName === 'button' && /Use earliest workable appointment/.test(n.textContent), rm)[0];
  if (!shiftBtn) return 'missing recovery button';
  fire(shiftBtn, 'click'); await sleep(60);

  const afterBtn = all((n) => n.localName === 'button' && n.attributes?.['data-rollout-appt-btn'] === '1', rm)[0];
  const afterDate = afterBtn?.attributes?.['data-rollout-appt-date'];
  const afterTime = afterBtn?.attributes?.['data-rollout-appt-time'];
  const afterPair = `${afterDate} ${afterTime}`;

  fire(afterBtn, 'click'); await sleep(40);
  const sh = all((n) => has(n, 'sheet'))[0];
  const dayEl = all((n) => n.localName === 'input' && has(n, 'ed-day-input'), sh)[0];
  const timeEl = all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), sh)[0];
  const sheetDate = dayEl?.value ?? dayEl?.attributes?.value;
  const sheetTime = timeEl?.value ?? timeEl?.attributes?.value;
  openSheet(null); await sleep(30);
  A.openRolloutPlanner(false);

  return (beforePair === '2026-11-12 10:00' && afterPair !== beforePair && sheetDate === afterDate && sheetTime === afterTime)
    || JSON.stringify({ beforePair, afterPair, sheetDate, sheetTime });
});

/* ---------------- (g) nav-gear (2026-11-21, Lorico): 3-tab bar + header Settings gear ---------------- */
await pin('G1. nav-gear: bottom bar renders exactly 3 equal buttons (Plan, Now, Log) matching BAR_ORDER with 3-column CSS grid and no More/Settings tab', async () => {
  await seed({ tab: 'now', ...segs });
  const nav = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0];
  if (!nav) return 'no nav.tabs';
  const btns = nav.childNodes.filter((n) => n.localName === 'button');
  const labels = btns.map((b) => b.textContent.trim());
  const classes = btns.map((b) => cls(b).trim());
  const css = readFileSync(`${process.cwd()}/public/styles.css`, 'utf8');
  const tabsRule = css.match(/(?:^|\n)\.tabs \{([^}]*)\}/)?.[1] ?? '';
  const has3Col = /grid-template-columns:\s*(?:1fr 1fr 1fr|repeat\(3,\s*1fr\))\s*;/.test(tabsRule);
  const ok = btns.length === 3
    && JSON.stringify(labels) === JSON.stringify(['Plan', 'Now', 'Log'])
    && JSON.stringify(BAR_ORDER) === JSON.stringify(['plan', 'now', 'log'])
    && classes[0] === '' && classes[1] === 'on' && classes[2] === ''
    && !labels.some((l) => /More|Settings/i.test(l))
    && has3Col;
  return ok || JSON.stringify({ labels, classes, BAR_ORDER, tabsRule });
});

await pin('G2. nav-gear: TopBar .top-right DOM order is clock → gear → theme; gear has aria-label/title "Settings", theme-btn family class, and cog SVG', async () => {
  await seed({ tab: 'now', ...segs });
  const hdr = all((n) => n.localName === 'header' && has(n, 'top'))[0];
  const topRight = hdr && all((n) => has(n, 'top-right'), hdr)[0];
  if (!topRight) return 'missing .top-right in header.top';
  const kids = topRight.childNodes.filter((n) => n.localName);
  if (kids.length !== 3) return `expected 3 children in .top-right, got ${kids.length}: ${kids.map((k) => `${k.localName}.${cls(k)}`).join(', ')}`;
  const [clk, gear, theme] = kids;
  const clkOk = clk.localName === 'span' && has(clk, 'muted') && has(clk, 'clock');
  const gearOk = gear.localName === 'button'
    && has(gear, 'theme-btn')
    && gear.attributes?.['aria-label'] === 'Settings'
    && gear.attributes?.title === 'Settings';
  const gearPath = all((n) => n.localName === 'path', gear)[0]?.attributes?.d ?? '';
  const isCog = gearPath.length > 60 && gearPath !== 'M5 12h.01M12 12h.01M19 12h.01';
  const themeOk = theme.localName === 'button' && has(theme, 'theme-btn') && /Switch to (day|night) theme/.test(theme.attributes?.['aria-label'] || '');
  return (clkOk && gearOk && isCog && themeOk)
    || JSON.stringify({ clkOk, gearOk, isCog, gearPathLen: gearPath.length, themeOk, kids: kids.map((k) => `${k.localName}.${cls(k)}`) });
});

// Re-aimed (2026-11-21 transitions, Lorico): gear dissolves into Settings room with zero strip scrolling
// and hides/inerts main-app chrome (TopBar, strip, bottom bar).
await pin('G3. transitions: activating header gear opens Settings room with all content present, zero strip scroll, and NO main chrome active', async () => {
  await seed({ tab: 'now', ...segs });
  strip().scrollLeft = 400; scrollCalls.length = 0;
  const gear = gearBtn();
  if (!gear) return 'missing gear button';
  fire(gear, 'click'); await sleep(80);
  const appEl = all((n) => has(n, 'app'))[0];
  const hdr = all((n) => n.localName === 'header' && has(n, 'top'))[0];
  const nav = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0];
  const settingsPg = settingsRoom();
  const off = (p) => (p.attributes.inert !== undefined && p.attributes.inert !== 'false') || p.inert === true;
  const hid = (p) => p.attributes['aria-hidden'] === 'true' || p.attributes['aria-hidden'] === true;
  const navBtns = nav.childNodes.filter((n) => n.localName === 'button');
  const anyBarOn = navBtns.some((b) => has(b, 'on') || b.attributes?.['aria-current'] === 'page');
  const txt = settingsPg.textContent;
  const sections = ['Rules', 'Planning', 'Driving alerts', 'Break buttons', 'Bug reports', 'Data', 'About'];
  const missing = sections.filter((s) => !txt.includes(s));
  const ok = getState().tab === 'settings'
    && scrollCalls.length === 0 && strip().scrollLeft === 400
    && has(appEl, 'in-settings')
    && has(settingsPg, 'page-settings') && has(settingsPg, 'settings-room') && has(settingsPg, 'is-active')
    && !off(settingsPg) && !hid(settingsPg)
    && off(hdr) && hid(hdr) && off(nav) && hid(nav) && off(strip()) && hid(strip())
    && !anyBarOn && litTab() === null
    && missing.length === 0;
  return ok || JSON.stringify({ tab: getState().tab, scrollCalls, sl: strip().scrollLeft, appCls: cls(appEl), active: cls(settingsPg), offS: off(settingsPg), hidS: hid(settingsPg), offH: off(hdr), offN: off(nav), anyBarOn, lit: litTab(), missing });
});

// Re-aimed (2026-11-21 transitions, Lorico): leaving Settings via the Settings Back button restores main-app chrome
// and returns directly to the panel the driver came from (Plan, Now, or Log) with zero strip scrolling.
await pin('G4. transitions: leaving Settings via the return affordance restores chrome and lands back on Plan, Now, or Log', async () => {
  for (const [label, tab, px, pageCls] of [
    ['Plan', 'plan', 0, 'page-plan'],
    ['Now', 'now', 400, 'page-now'],
    ['Log', 'log', 800, 'page-log'],
  ]) {
    await seed({ tab, ...segs });
    strip().scrollLeft = px; scrollCalls.length = 0;
    fire(gearBtn(), 'click'); await sleep(60);
    if (getState().tab !== 'settings') return `enter from ${label}: tab=${getState().tab}`;
    const back = settingsBackBtn();
    if (!back || !back.textContent.includes(label)) return `missing/wrong back button for ${label}: ${back?.textContent}`;
    scrollCalls.length = 0;
    fire(back, 'click'); await sleep(60);
    const appEl = all((n) => has(n, 'app'))[0];
    const activePg = pages().find((p) => has(p, 'is-active'));
    const navBtns = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0].childNodes.filter((n) => n.localName === 'button');
    const onBtns = navBtns.filter((b) => has(b, 'on'));
    const curBtns = navBtns.filter((b) => b.attributes?.['aria-current'] === 'page');
    const gear = gearBtn();
    const ok = getState().tab === tab
      && !has(appEl, 'in-settings')
      && scrollCalls.length === 0 && strip().scrollLeft === px
      && !!activePg && has(activePg, pageCls)
      && onBtns.length === 1 && onBtns[0].textContent.trim() === label
      && curBtns.length === 1 && curBtns[0].textContent.trim() === label
      && gear.attributes?.['aria-current'] == null && !has(gear, 'on');
    if (!ok) {
      return `Settings→${label}: tab=${getState().tab} scrollCalls=${scrollCalls.length} sl=${strip().scrollLeft} active=${activePg && cls(activePg)} lit=${litTab()} gearCur=${gear.attributes?.['aria-current']}`;
    }
  }
  return true;
});

/* ---------------- (t) transition polish (2026-11-21, Lorico): Settings room dissolve + Day/Night theme ease ---------------- */
await pin('T1. transitions (a): tapping gear from Plan/Now/Log does NOT scroll the strip and shows Settings room with all 7 cards', async () => {
  for (const [tab, px] of [['plan', 0], ['now', 400], ['log', 800]]) {
    await seed({ tab, ...segs });
    strip().scrollLeft = px; scrollCalls.length = 0;
    fire(gearBtn(), 'click'); await sleep(60);
    const sr = settingsRoom();
    const off = (p) => (p.attributes.inert !== undefined && p.attributes.inert !== 'false') || p.inert === true;
    const hid = (p) => p.attributes['aria-hidden'] === 'true' || p.attributes['aria-hidden'] === true;
    const cards = ['Rules', 'Planning', 'Driving alerts', 'Break buttons', 'Bug reports', 'Data', 'About'];
    const missing = cards.filter((c) => !sr.textContent.includes(c));
    if (getState().tab !== 'settings' || scrollCalls.length !== 0 || strip().scrollLeft !== px || !has(sr, 'is-active') || off(sr) || hid(sr) || missing.length) {
      return `from ${tab}: tab=${getState().tab} scrollCalls=${JSON.stringify(scrollCalls)} sl=${strip().scrollLeft}/${px} active=${cls(sr)} missing=${missing.join(',')}`;
    }
    fire(settingsBackBtn(), 'click'); await sleep(60);
  }
  return true;
});

// Re-aimed (2026-11-21 plan-dissolve, Lorico): shared .app.in-room + .page.room dissolve rules govern both Settings and Plan tool rooms.
await pin('T2. transitions (b): while in Settings, header chrome, strip, and bottom bar are hidden/inert and shared room CSS dissolves Settings into the viewport', async () => {
  await seed({ tab: 'now', ...segs });
  fire(gearBtn(), 'click'); await sleep(60);
  const appEl = all((n) => has(n, 'app'))[0];
  const hdr = all((n) => n.localName === 'header' && has(n, 'top'))[0];
  const nav = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0];
  const st = strip();
  const sr = settingsRoom();
  const off = (p) => (p.attributes.inert !== undefined && p.attributes.inert !== 'false') || p.inert === true;
  const hid = (p) => p.attributes['aria-hidden'] === 'true' || p.attributes['aria-hidden'] === true;
  const css = readFileSync(`${process.cwd()}/public/styles.css`, 'utf8');
  const hidesChromeCss = /\.app\.in-room\s*>\s*header\.top[\s\S]*?\.app\.in-room\s*>\s*nav\.tabs\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/.test(css);
  // Re-aimed (2026-11-22 polish): shared room dissolve uses unified motion tokens (--dur-room/--ease-enter on enter, --dur-exit/--ease-exit on exit).
  const roomFixedCss = /\.page\.room\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*z-index:\s*20;[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;[^}]*transition:[^;]*opacity\s+var\(--dur-exit\)\s+var\(--ease-exit\)/.test(css);
  const roomActiveCss = /\.page\.room\.is-active\s*\{[^}]*opacity:\s*1;[^}]*visibility:\s*visible;[^}]*pointer-events:\s*auto;[^}]*transition:[^;]*opacity\s+var\(--dur-room\)\s+var\(--ease-enter\)/.test(css);
  const ok = has(appEl, 'in-room') && has(appEl, 'in-settings')
    && off(hdr) && hid(hdr)
    && off(st) && hid(st)
    && off(nav) && hid(nav)
    && !off(sr) && !hid(sr) && has(sr, 'room') && has(sr, 'is-active')
    && hidesChromeCss && roomFixedCss && roomActiveCss;
  return ok || JSON.stringify({ appCls: cls(appEl), offH: off(hdr), hidH: hid(hdr), offS: off(st), offN: off(nav), offR: off(sr), hidesChromeCss, roomFixedCss, roomActiveCss });
});

// Re-aimed (2026-11-21 plan-dissolve, Lorico): Split Lab and Rescue Simulator now render in section.page-tool.room.plan-room;
// leaving Settings to a main panel restores chrome immediately, while returning to an active Plan sub-screen preserves it in planRoom() until Back exits to Plan hub.
await pin('T3. transitions (c): return affordance (48px target) leaves Settings, restores header + bottom bar, and preserves origin panel & Plan sub-screen', async () => {
  const off = (p) => (p.attributes.inert !== undefined && p.attributes.inert !== 'false') || p.inert === true;
  const hid = (p) => p.attributes['aria-hidden'] === 'true' || p.attributes['aria-hidden'] === true;
  const css = readFileSync(`${process.cwd()}/public/styles.css`, 'utf8');
  const back48Css = /button\.back\.settings-back\s*\{[^}]*min-height:\s*var\(--ctl-floor\)/.test(css);
  // Origin: Plan hub -> Settings -> Back restores chrome directly
  await seed({ tab: 'plan', ...segs });
  strip().scrollLeft = 0; scrollCalls.length = 0;
  fire(gearBtn(), 'click'); await sleep(60);
  fire(settingsBackBtn(), 'click'); await sleep(60);
  const appEl = all((n) => has(n, 'app'))[0];
  const hdr = all((n) => n.localName === 'header' && has(n, 'top'))[0];
  const nav = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0];
  const sr = settingsRoom();
  const okHub = getState().tab === 'plan'
    && !has(appEl, 'in-room') && !has(appEl, 'in-settings')
    && !off(hdr) && !hid(hdr) && !off(nav) && !hid(nav) && !off(strip()) && !hid(strip())
    && off(sr) && hid(sr) && !has(sr, 'is-active')
    && scrollCalls.length === 0 && strip().scrollLeft === 0
    && back48Css;
  if (!okHub) return `plan hub return failed: tab=${getState().tab} appCls=${cls(appEl)} scrollCalls=${scrollCalls.length} back48Css=${back48Css}`;
  // Origin: Split Lab inside Plan tool room
  await seed({ tab: 'split', ...segs });
  strip().scrollLeft = 0; scrollCalls.length = 0;
  fire(gearBtn(), 'click'); await sleep(60);
  const back = settingsBackBtn();
  if (!back || back.attributes?.['aria-label'] !== 'Back to Plan' || !back.textContent.includes('Plan')) {
    return `split back btn wrong: label=${back?.attributes?.['aria-label']} text=${back?.textContent}`;
  }
  fire(back, 'click'); await sleep(60);
  const pr = planRoom();
  const okSplit = getState().tab === 'split'
    && has(appEl, 'in-room') && has(appEl, 'in-plan-tool') && !has(appEl, 'in-settings')
    && off(sr) && hid(sr) && !has(sr, 'is-active')
    && !off(pr) && !hid(pr) && has(pr, 'is-active')
    && scrollCalls.length === 0 && strip().scrollLeft === 0
    && pr.textContent.includes('Break 1')
    && pages()[0].textContent.includes('Plan a sleeper split');
  if (!okSplit) return `split return failed: tab=${getState().tab} appCls=${cls(appEl)} scrollCalls=${scrollCalls.length}`;
  // Origin: Rescue Simulator (Plan tool flag stays open across Settings visit)
  await seed({ tab: 'plan', ...segs });
  A.openRescuePlanner(true); await sleep(60);
  fire(gearBtn(), 'click'); await sleep(60);
  fire(settingsBackBtn(), 'click'); await sleep(60);
  const okRescue = getState().tab === 'plan' && A.isRescuePlannerOpen() && has(planRoom(), 'is-active');
  A.openRescuePlanner(false); await sleep(30);
  return okRescue || `rescue return failed: tab=${getState().tab} rescueOpen=${A.isRescuePlannerOpen()}`;
});

await pin('T4. transitions (d): Day/Night toggle applies CSS color/background transition (200-350ms, no geometry, reduced-motion aware), flips & persists theme', async () => {
  const css = readFileSync(`${process.cwd()}/public/styles.css`, 'utf8');
  const themeRule = css.match(/body,\s*\.app,\s*\.card[\s\S]*?\{([^}]*)\}/)?.[1] ?? '';
  const durMatch = themeRule.match(/background-color\s+(\d+)ms/);
  const dur = durMatch ? Number(durMatch[1]) : 0;
  const hasColorAndBg = /background-color\s+\d+ms\s+ease/.test(themeRule) && /color\s+\d+ms\s+ease/.test(themeRule) && /border-color\s+\d+ms\s+ease/.test(themeRule);
  const noGeometry = !/\b(width|height|padding|margin|top|left|right|bottom|font-size|gap|grid)\b/.test(themeRule);
  const hasReducedMotion = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.page\.room[\s\S]*?transition:\s*none;/.test(css);
  if (!(dur >= 200 && dur <= 350 && hasColorAndBg && noGeometry && hasReducedMotion)) {
    return `css check failed: dur=${dur} hasColorAndBg=${hasColorAndBg} noGeometry=${noGeometry} hasReducedMotion=${hasReducedMotion} rule=${themeRule}`;
  }
  await seed({ tab: 'now', theme: 'day', themeChosen: true, ...segs });
  const themeBtn = () => all((n) => n.localName === 'button' && has(n, 'theme-btn') && /Switch to (day|night) theme/.test(n.attributes?.['aria-label'] || ''))[0];
  if (document.documentElement.attributes?.['data-theme'] !== 'day') return `initial data-theme=${document.documentElement.attributes?.['data-theme']}`;
  fire(themeBtn(), 'click'); await sleep(60);
  const afterNight = {
    theme: getState().theme,
    chosen: getState().themeChosen,
    attr: document.documentElement.attributes?.['data-theme'] ?? null,
    saved: JSON.parse(localStorage.getItem('hos-sandbox-v1') || '{}').theme,
  };
  fire(themeBtn(), 'click'); await sleep(60);
  const afterDay = {
    theme: getState().theme,
    chosen: getState().themeChosen,
    attr: document.documentElement.attributes?.['data-theme'] ?? null,
    saved: JSON.parse(localStorage.getItem('hos-sandbox-v1') || '{}').theme,
  };
  const ok = afterNight.theme === 'night' && afterNight.chosen === true && afterNight.attr === null && afterNight.saved === 'night'
    && afterDay.theme === 'day' && afterDay.chosen === true && afterDay.attr === 'day' && afterDay.saved === 'day';
  return ok || JSON.stringify({ afterNight, afterDay });
});

/* ---------------- (p) plan-dissolve (2026-11-21, Lorico): all Plan tools get the Settings-room dissolve ---------------- */
await pin('P1. plan-dissolve: opening every Plan tool (load, split, trip, recap, history, week, rollout, rescue) dissolves into plan-room with chrome inert/hidden and ZERO strip scroll', async () => {
  const off = (p) => (p.attributes.inert !== undefined && p.attributes.inert !== 'false') || p.inert === true;
  const hid = (p) => p.attributes['aria-hidden'] === 'true' || p.attributes['aria-hidden'] === true;
  const tools = [
    ['load', () => { const b = all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[0]; fire(b, 'click'); }, 'How far is the load?'],
    ['split', () => { const b = all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[1]; fire(b, 'click'); }, 'Break 1'],
    ['trip', () => { const b = all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[2]; fire(b, 'click'); }, 'Clock-to-parking'],
    ['recap', () => { const b = all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[3]; fire(b, 'click'); }, 'Hours coming back'],
    ['week', () => { const b = all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[4]; fire(b, 'click'); }, 'Weekly recap vs. 34'],
    ['rollout', () => { const b = all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[5]; fire(b, 'click'); }, 'When to roll & PTA'],
    ['rescue', () => { const b = all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[6]; fire(b, 'click'); }, 'Split-sleeper rescue'],
  ];
  for (const [id, openFn, marker] of tools) {
    A.openWeekPlanner(false); A.openRolloutPlanner(false); A.openRescuePlanner(false);
    await seed({ tab: 'plan', ...segs });
    strip().scrollLeft = 0; scrollCalls.length = 0;
    openFn(); await sleep(60);
    const appEl = all((n) => has(n, 'app'))[0];
    const hdr = all((n) => n.localName === 'header' && has(n, 'top'))[0];
    const nav = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0];
    const pr = planRoom();
    const sr = settingsRoom();
    const hubItems = all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0]);
    const ok = scrollCalls.length === 0 && strip().scrollLeft === 0
      && has(appEl, 'in-room') && has(appEl, 'in-plan-tool') && !has(appEl, 'in-settings')
      && off(hdr) && hid(hdr) && off(strip()) && hid(strip()) && off(nav) && hid(nav)
      && off(sr) && hid(sr) && !has(sr, 'is-active')
      && !off(pr) && !hid(pr) && has(pr, 'room') && has(pr, 'plan-room') && has(pr, 'is-active')
      && pr.attributes?.['data-plan-tool'] === id
      && pr.textContent.includes(marker)
      && litTab() === null
      && hubItems.length === 7;
    if (!ok) return `${id} failed: scrollCalls=${scrollCalls.length} appCls=${cls(appEl)} prCls=${cls(pr)} tool=${pr.attributes?.['data-plan-tool']} lit=${litTab()} hubItems=${hubItems.length}`;
  }
  // History reached from Recap ("Your last 8 days")
  await seed({ tab: 'plan', ...segs });
  strip().scrollLeft = 0; scrollCalls.length = 0;
  fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[3], 'click'); await sleep(60);
  const histBtn = all((n) => n.localName === 'button' && has(n, 'plan-item') && /Your last 8 days/.test(n.textContent), planRoom())[0];
  if (!histBtn) return 'missing Your last 8 days door in Recap';
  fire(histBtn, 'click'); await sleep(60);
  const prH = planRoom();
  const appH = all((n) => has(n, 'app'))[0];
  const okHist = scrollCalls.length === 0 && strip().scrollLeft === 0
    && has(appH, 'in-room') && has(appH, 'in-plan-tool')
    && has(prH, 'is-active') && prH.attributes?.['data-plan-tool'] === 'history'
    && prH.textContent.includes('Your last 8 days');
  A.openWeekPlanner(false); A.openRolloutPlanner(false); A.openRescuePlanner(false);
  return okHist || `history failed: scrollCalls=${scrollCalls.length} tool=${prH.attributes?.['data-plan-tool']}`;
});

// Re-aimed (2026-11-22 polish): shared room dissolve uses unified motion tokens (--dur-room 240ms --ease-enter / --dur-exit 200ms --ease-exit).
await pin('P2. plan-dissolve: shared room CSS (motion tokens, fixed inset:0 z-index:20), reduced-motion disable, sheet/modal z-index layering, and print hiding', async () => {
  const css = readFileSync(`${process.cwd()}/public/styles.css`, 'utf8');
  const sharedChrome = /\.app\.in-room\s*>\s*header\.top,\s*\.app\.in-room\s*>\s*main\.pages,\s*\.app\.in-room\s*>\s*nav\.tabs\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;[^}]*opacity\s+var\(--dur-exit\)\s+var\(--ease-exit\)/.test(css);
  const sharedRoom = /\.page\.room\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*z-index:\s*20;[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;[^}]*transition:[^;]*opacity\s+var\(--dur-exit\)\s+var\(--ease-exit\)/.test(css);
  const sharedActive = /\.page\.room\.is-active\s*\{[^}]*opacity:\s*1;[^}]*visibility:\s*visible;[^}]*pointer-events:\s*auto;[^}]*opacity\s+var\(--dur-room\)\s+var\(--ease-enter\)/.test(css);
  const reduced = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.app\.in-room\s*>\s*header\.top[\s\S]*?\.page\.room,\s*\.page\.room\.is-active[\s\S]*?transition:\s*none;/.test(css);
  const sheetAbove = /\.sheet-wrap\s*\{[^}]*z-index:\s*40;/.test(css);
  const modalAbove = /\.backdrop\s*\{[^}]*z-index:\s*50;/.test(css);
  const printHide = /@media\s+print\s*\{[\s\S]*?\.app\.has-print-report\s*>\s*:not\(\.print-report\)\s*\{\s*display:\s*none\s*!important;/.test(css);
  const ok = sharedChrome && sharedRoom && sharedActive && reduced && sheetAbove && modalAbove && printHide;
  return ok || JSON.stringify({ sharedChrome, sharedRoom, sharedActive, reduced, sheetAbove, modalAbove, printHide });
});

await pin('P3. plan-dissolve: closing every Plan tool via its Back affordance dissolves back to origin (Plan hub / Recap / Now), restores chrome & hub scrollTop with zero strip scroll', async () => {
  const off = (p) => (p.attributes.inert !== undefined && p.attributes.inert !== 'false') || p.inert === true;
  const hid = (p) => p.attributes['aria-hidden'] === 'true' || p.attributes['aria-hidden'] === true;
  for (let idx = 0; idx < 7; idx++) {
    A.openWeekPlanner(false); A.openRolloutPlanner(false); A.openRescuePlanner(false);
    await seed({ tab: 'plan', ...segs });
    strip().scrollLeft = 0;
    pages()[0].scrollTop = 185;
    scrollCalls.length = 0;
    const item = all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[idx];
    fire(item, 'click'); await sleep(60);
    const pr = planRoom();
    const backBtn = all((n) => n.localName === 'button' && (has(n, 'back') || /Back to Plan/.test(n.attributes?.['aria-label'] || '')), pr)[0];
    if (!backBtn) return `tool[${idx}] missing back button`;
    fire(backBtn, 'click'); await sleep(60);
    const appEl = all((n) => has(n, 'app'))[0];
    const hdr = all((n) => n.localName === 'header' && has(n, 'top'))[0];
    const nav = all((n) => n.localName === 'nav' && has(n, 'tabs'))[0];
    const ok = getState().tab === 'plan'
      && !A.isWeekPlannerOpen() && !A.isRolloutPlannerOpen() && !A.isRescuePlannerOpen()
      && !has(appEl, 'in-room') && !has(appEl, 'in-plan-tool')
      && !off(hdr) && !hid(hdr) && !off(strip()) && !hid(strip()) && !off(nav) && !hid(nav)
      && off(pr) && hid(pr) && !has(pr, 'is-active')
      && has(pages()[0], 'is-active') && litTab() === 'Plan'
      && pages()[0].scrollTop === 185
      && scrollCalls.length === 0 && strip().scrollLeft === 0;
    if (!ok) return `tool[${idx}] return failed: tab=${getState().tab} appCls=${cls(appEl)} hubScroll=${pages()[0].scrollTop} scrollCalls=${scrollCalls.length} lit=${litTab()}`;
  }
  // Recap -> History -> Back to Recap -> Back to Plan (nested origin return)
  await seed({ tab: 'plan', ...segs });
  strip().scrollLeft = 0; scrollCalls.length = 0;
  fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[3], 'click'); await sleep(60);
  fire(all((n) => n.localName === 'button' && has(n, 'plan-item') && /Your last 8 days/.test(n.textContent), planRoom())[0], 'click'); await sleep(60);
  const backRecap = all((n) => n.localName === 'button' && has(n, 'back'), planRoom())[0];
  if (!backRecap || !backRecap.textContent.includes('Recap')) return `history back wrong: ${backRecap?.textContent}`;
  fire(backRecap, 'click'); await sleep(60);
  if (getState().tab !== 'recap' || !has(planRoom(), 'is-active')) return `history->recap failed: tab=${getState().tab}`;
  fire(all((n) => n.localName === 'button' && has(n, 'back'), planRoom())[0], 'click'); await sleep(60);
  if (getState().tab !== 'plan' || has(planRoom(), 'is-active') || scrollCalls.length !== 0) return `recap->plan failed: tab=${getState().tab}`;
  // Now -> Split Lab (planReturn: 'now') -> Back to Now with zero strip scroll
  await seed({ tab: 'now', ...segs });
  strip().scrollLeft = 400; scrollCalls.length = 0;
  setState({ tab: 'split', planReturn: 'now' }); await sleep(60);
  const backNow = all((n) => n.localName === 'button' && has(n, 'back'), planRoom())[0];
  if (!backNow || !backNow.textContent.includes('Now') || scrollCalls.length !== 0 || strip().scrollLeft !== 400) {
    return `now->split failed: back=${backNow?.textContent} scrollCalls=${scrollCalls.length} sl=${strip().scrollLeft}`;
  }
  fire(backNow, 'click'); await sleep(60);
  return (getState().tab === 'now' && !has(planRoom(), 'is-active') && scrollCalls.length === 0 && strip().scrollLeft === 400 && litTab() === 'Now')
    || `split->now failed: tab=${getState().tab} scrollCalls=${scrollCalls.length} sl=${strip().scrollLeft}`;
});

await pin('P4. plan-dissolve: hardware Back (popstate via backnav) closes sheet first if open, then dissolves Plan tool back to Plan hub with zero strip scroll', async () => {
  for (const [id, openFn] of [
    ['load', () => fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[0], 'click')],
    ['split', () => fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[1], 'click')],
    ['trip', () => fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[2], 'click')],
    ['recap', () => fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[3], 'click')],
    ['week', () => fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[4], 'click')],
    ['rollout', () => fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[5], 'click')],
    ['rescue', () => fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[6], 'click')],
  ]) {
    A.openWeekPlanner(false); A.openRolloutPlanner(false); A.openRescuePlanner(false);
    await seed({ tab: 'plan', ...segs });
    strip().scrollLeft = 0; scrollCalls.length = 0;
    openFn(); await sleep(60);
    if (!has(planRoom(), 'is-active')) return `${id} did not open`;
    pressHardwareBack(); await sleep(60);
    const appEl = all((n) => has(n, 'app'))[0];
    const ok = getState().tab === 'plan' && !A.isWeekPlannerOpen() && !A.isRolloutPlannerOpen() && !A.isRescuePlannerOpen()
      && !has(appEl, 'in-room') && !has(planRoom(), 'is-active') && has(pages()[0], 'is-active')
      && scrollCalls.length === 0 && strip().scrollLeft === 0;
    if (!ok) return `hw-back ${id} failed: tab=${getState().tab} appCls=${cls(appEl)} scrollCalls=${scrollCalls.length}`;
  }
  // Open a sheet inside Rollout -> first hardware Back closes sheet while keeping Rollout room open; second closes Rollout
  await seed({ tab: 'plan', ...segs });
  strip().scrollLeft = 0; scrollCalls.length = 0;
  fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[5], 'click'); await sleep(60);
  const apptBtn = all((n) => n.localName === 'button' && n.attributes?.['data-rollout-appt-btn'] === '1', planRoom())[0];
  fire(apptBtn, 'click'); await sleep(60);
  if (!all((n) => has(n, 'sheet')).length) return 'rollout sheet did not open';
  // Re-aimed (2026-11-22 polish): first hardware Back immediately clears currentSheet() and marks RolloutTimeSheet .is-closing, then unmounts after the 200ms slide-down exit.
  pressHardwareBack(); await sleep(40);
  const sheetClosedRoomOpen = A.currentSheet() === null && all((n) => has(n, 'sheet') && !has(n, 'is-closing')).length === 0 && A.isRolloutPlannerOpen() && has(planRoom(), 'is-active');
  await sleep(240);
  const sheetUnmounted = all((n) => has(n, 'sheet')).length === 0;
  pressHardwareBack(); await sleep(60);
  const roomClosed = !A.isRolloutPlannerOpen() && !has(planRoom(), 'is-active') && getState().tab === 'plan' && scrollCalls.length === 0;
  return (sheetClosedRoomOpen && sheetUnmounted && roomClosed) || `sheetClosedRoomOpen=${sheetClosedRoomOpen} sheetUnmounted=${sheetUnmounted} roomClosed=${roomClosed}`;
});

await pin('P5. plan-dissolve: opening a Plan tool resets planRoom.scrollTop to 0 (and preserves Plan hub scrollTop across tool entry/exit)', async () => {
  await seed({ tab: 'plan', ...segs });
  pages()[0].scrollTop = 240;
  planRoom().scrollTop = 310;
  fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[1], 'click'); await sleep(60);
  const afterSplit = planRoom().scrollTop;
  // Scroll inside Split Lab, return to Plan, open Recap -> resets to 0 again; hub scrollTop stays 240
  planRoom().scrollTop = 420;
  fire(all((n) => n.localName === 'button' && has(n, 'back'), planRoom())[0], 'click'); await sleep(60);
  const hubAfterSplit = pages()[0].scrollTop;
  fire(all((n) => n.localName === 'button' && has(n, 'plan-item'), pages()[0])[3], 'click'); await sleep(60);
  const afterRecap = planRoom().scrollTop;
  // Switch directly from Recap to Load -> resets planRoom.scrollTop to 0
  planRoom().scrollTop = 190;
  const loadDoor = all((n) => n.localName === 'button' && has(n, 'plan-item') && /Can I take this load\?/.test(n.textContent), planRoom())[0];
  fire(loadDoor, 'click'); await sleep(60);
  const afterLoad = planRoom().scrollTop;
  setState({ tab: 'plan' }); await sleep(60);
  return (afterSplit === 0 && hubAfterSplit === 240 && afterRecap === 0 && afterLoad === 0 && pages()[0].scrollTop === 240)
    || JSON.stringify({ afterSplit, hubAfterSplit, afterRecap, afterLoad, hubEnd: pages()[0].scrollTop });
});

/* ---------------- (n) nowstrip (2026-11-22, Lorico): Now "comes back" strip text fit + scoped slide-up sheet ---------------- */
const nowstripL4Seed = () => {
  // 7 heavy 10-hr duty days (dayStartHour: 18, America/Chicago) so 70/8 cycle binds and L4 "comes back" lever fires.
  const CD = (day, hh, m = 0) => Math.floor(new Date(2026, 10, day, hh, m).getTime() / 60000);
  const l4Segs = [];
  for (let d = 2; d <= 8; d++) {
    l4Segs.push(
      { status: 'ON', start: CD(d, 5), end: CD(d, 6) },
      { status: 'D', start: CD(d, 6), end: CD(d, 14) },
      { status: 'ON', start: CD(d, 14), end: CD(d, 15) },
      { status: 'OFF', start: CD(d, 15), end: CD(d + 1, 5) },
    );
  }
  return {
    tab: 'now',
    nowCard: 'timeline',
    nowCardAsked: true,
    drivingView: false,
    segments: l4Segs,
    current: { status: 'ON', since: CD(9, 5) },
    nowOverride: CD(9, 6, 0),
    config: { ...getState().config, cycle: '70/8', dayStartHour: 18, timeZone: 'America/Chicago' },
  };
};
const waitForLeverBtn = async () => {
  for (let i = 0; i < 40; i++) {
    const b = all((n) => n.localName === 'button' && has(n, 'lever'), pages()[1])[0];
    if (b) return b;
    await sleep(25);
  }
  return null;
};

await pin('N1. nowstrip (a): L4 "comes back" strip renders full text (time, +duration, available) inside button.lever with phone-fit reflow CSS and 64px row floor', async () => {
  await seed(nowstripL4Seed());
  const btn = await waitForLeverBtn();
  if (!btn) return 'L4 lever strip button.lever did not appear on Now';
  const txt = btn.textContent;
  const hasFull = /At\s+\w+\s+\d{2}:\d{2}\s+\(18:00\s+Central\),\s+\+\d+h\s+\d+m\s+comes back\s+→\s+\d+h\s+\d+m\s+available/.test(txt);
  const css = readFileSync(`${process.cwd()}/public/styles.css`, 'utf8');
  const block = css.slice(css.indexOf('NOW "COMES BACK" STRIP'));
  const hasReflow = /\.lever-text\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*break-word;/.test(block);
  const hasSize = /\.lever-text\s+b\s*\{[^}]*font-size:\s*14px;[^}]*line-height:\s*1\.3;/.test(block);
  const hasNarrow = /@media\s*\(max-width:\s*380px\)\s*\{[\s\S]*?\.lever-text\s+b\s*\{[^}]*font-size:\s*13\.5px;/.test(block);
  const hasSvgShrink = /\.lever\s*>\s*svg\s*\{[^}]*flex-shrink:\s*0;/.test(block);
  const noTruncate = !/text-overflow:\s*ellipsis/.test(block);
  const ok = hasFull && hasReflow && hasSize && hasNarrow && hasSvgShrink && noTruncate;
  return ok || JSON.stringify({ txt, hasFull, hasReflow, hasSize, hasNarrow, hasSvgShrink, noTruncate });
});

// Re-aimed (2026-11-22 polish): unified motion system — ALL bottom sheets share base .sheet / .sheet-wrap slide-up/down CSS (LeverSheet keeps .slide-up; all other sheet kinds also render cleanly with zero .is-closing while open).
await pin('N2. nowstrip (b) / unified sheets: LeverSheet and all other bottom sheet kinds (why, status, exceptions, add, quickstart) open cleanly under the unified bottom-sheet motion system', async () => {
  await seed(nowstripL4Seed());
  const btn = await waitForLeverBtn();
  if (!btn) return 'missing L4 lever strip';
  fire(btn, 'click'); await sleep(40);
  const leverWrap = all((n) => has(n, 'sheet-wrap'))[0];
  const leverSheet = all((n) => has(n, 'sheet'))[0];
  const leverOk = !!leverWrap && !!leverSheet && has(leverWrap, 'slide-up') && has(leverSheet, 'slide-up') && !has(leverSheet, 'is-closing');
  const others = [
    ['why', { kind: 'why' }],
    ['status', { kind: 'status' }],
    ['exceptions', { kind: 'exceptions' }],
    ['add', { kind: 'add' }],
    ['quickstart', { kind: 'quickstart' }],
  ];
  const otherBad = [];
  for (const [name, desc] of others) {
    openSheet(desc); await sleep(40);
    const wraps = all((n) => has(n, 'sheet-wrap'));
    const sheets = all((n) => has(n, 'sheet'));
    if (sheets.length !== 1 || wraps.length !== 1 || has(sheets[0], 'is-closing') || has(wraps[0], 'is-closing')) {
      otherBad.push(`${name}: wraps=${wraps.map(cls)} sheets=${sheets.map(cls)}`);
    }
  }
  openSheet(null); await sleep(260);
  return (leverOk && otherBad.length === 0) || JSON.stringify({ leverOk, leverWrap: leverWrap && cls(leverWrap), leverSheet: leverSheet && cls(leverSheet), otherBad });
});

// Re-aimed (2026-11-22 polish): ALL bottom sheets (both LeverSheet and WhySheet) now share the unified 200ms slide-down retained-exit lifecycle (.is-closing, inert + aria-hidden) before unmounting.
await pin('N3. nowstrip (b) / unified sheets: closing LeverSheet and other bottom sheets (Why?) retains .is-closing (inert + aria-hidden) across the 200ms slide-down exit then unmounts', async () => {
  await seed(nowstripL4Seed());
  const btn = await waitForLeverBtn();
  if (!btn) return 'missing L4 lever strip';
  fire(btn, 'click'); await sleep(40);
  const closeBtn = all((n) => n.localName === 'button' && n.textContent.trim() === 'Close', all((n) => has(n, 'sheet'))[0])[0];
  if (!closeBtn) return 'missing Close button in LeverSheet';
  fire(closeBtn, 'click'); await sleep(30);
  const midWrap = all((n) => has(n, 'sheet-wrap'))[0];
  const midSheet = all((n) => has(n, 'sheet'))[0];
  const off = (p) => (p.attributes.inert !== undefined && p.attributes.inert !== 'false') || p.inert === true;
  const hid = (p) => p.attributes['aria-hidden'] === 'true' || p.attributes['aria-hidden'] === true;
  const midOk = A.currentSheet() === null && !!midWrap && !!midSheet
    && has(midWrap, 'slide-up') && has(midWrap, 'is-closing') && off(midWrap) && hid(midWrap)
    && has(midSheet, 'slide-up') && has(midSheet, 'is-closing');
  await sleep(250);
  const afterClose = all((n) => has(n, 'sheet')).length === 0;
  // Other sheet kinds (why) now also share the unified retained slide-down exit
  openSheet({ kind: 'why' }); await sleep(40);
  if (all((n) => has(n, 'sheet')).length !== 1) return 'why sheet did not open';
  openSheet(null); await sleep(30);
  const whyMidWrap = all((n) => has(n, 'sheet-wrap'))[0];
  const whyMidSheet = all((n) => has(n, 'sheet'))[0];
  const whyClosingOk = A.currentSheet() === null && !!whyMidWrap && !!whyMidSheet
    && has(whyMidWrap, 'is-closing') && off(whyMidWrap) && hid(whyMidWrap) && has(whyMidSheet, 'is-closing');
  await sleep(250);
  const whyUnmounted = all((n) => has(n, 'sheet')).length === 0;
  return (midOk && afterClose && whyClosingOk && whyUnmounted) || JSON.stringify({ midOk, afterClose, whyClosingOk, whyUnmounted });
});

// Re-aimed (2026-11-22 polish): unified motion tokens (--dur-sheet: 320ms, --ease-enter: cubic-bezier(0.22, 0.14, 0.45, 1), --dur-exit: 200ms, --ease-exit: ease-out) on base .sheet rules + reduced-motion neutralization.
await pin('N4. nowstrip (c) / unified sheets: prefers-reduced-motion disables bottom-sheet CSS animation & parked transform and unmounts LeverSheet immediately on close', async () => {
  const css = readFileSync(`${process.cwd()}/public/styles.css`, 'utf8');
  const block = css.slice(css.indexOf('SPLIT DECISION MOTION SYSTEM'));
  const hasTokens = /--dur-sheet:\s*320ms;/.test(block)
    && /--dur-exit:\s*200ms;/.test(block)
    && /--ease-enter:\s*cubic-bezier\(0\.22,\s*0\.14,\s*0\.45,\s*1\);/.test(block)
    && /--ease-exit:\s*ease-out;/.test(block);
  const hasKfUp = /@keyframes\s+sheet-slide-up\s*\{\s*from\s*\{\s*transform:\s*translateY\(100%\);\s*\}\s*to\s*\{\s*transform:\s*translateY\(0\);\s*\}\s*\}/.test(block);
  const hasKfDown = /@keyframes\s+sheet-slide-down\s*\{\s*from\s*\{\s*transform:\s*translateY\(0\);\s*\}\s*to\s*\{\s*transform:\s*translateY\(100%\);\s*\}\s*\}/.test(block);
  const hasSlideRules = /\.sheet\s*\{[^}]*transform:\s*translateY\(100%\);[^}]*animation:\s*sheet-slide-up\s+var\(--dur-sheet\)\s+var\(--ease-enter\)\s+both;/.test(block)
    && /\.sheet-wrap\s*>\s*button\.sheet-backdrop\s*\{[^}]*animation:\s*sheet-backdrop-in\s+var\(--dur-sheet\)\s+var\(--ease-enter\)\s+both;/.test(block)
    && /\.sheet\.is-closing\s*\{[^}]*animation:\s*sheet-slide-down\s+var\(--dur-exit\)\s+var\(--ease-exit\)\s+both;/.test(block)
    && /\.sheet-wrap\.is-closing\s*>\s*button\.sheet-backdrop\s*\{[^}]*animation:\s*sheet-backdrop-out\s+var\(--dur-exit\)\s+var\(--ease-exit\)\s+both;/.test(block);
  const hasReducedCss = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.sheet,[\s\S]*?\.sheet\.is-closing,[\s\S]*?animation:\s*none;[^}]*transform:\s*none;/.test(block);
  const origMM = globalThis.window.matchMedia;
  let immediateUnmount = false;
  try {
    globalThis.window.matchMedia = (q) => ({ matches: /prefers-reduced-motion:\s*reduce/.test(q), addEventListener() {}, removeEventListener() {} });
    await seed(nowstripL4Seed());
    const btn = await waitForLeverBtn();
    if (!btn) return 'missing L4 lever strip under reduced motion';
    fire(btn, 'click'); await sleep(40);
    if (all((n) => has(n, 'sheet') && has(n, 'slide-up')).length !== 1) return 'LeverSheet did not open under reduced motion';
    openSheet(null); await sleep(30);
    immediateUnmount = all((n) => has(n, 'sheet')).length === 0;
  } finally {
    globalThis.window.matchMedia = origMM;
  }
  const ok = hasTokens && hasKfUp && hasKfDown && hasSlideRules && hasReducedCss && immediateUnmount;
  return ok || JSON.stringify({ hasTokens, hasKfUp, hasKfDown, hasSlideRules, hasReducedCss, immediateUnmount });
});

/* ---------------- (o) dialfade (2026-11-22, Lorico): Now hero card soft dissolve (Timeline <-> Dial) ---------------- */
const nowCardKey = (label) => all((n) => n.localName === 'button' && n.textContent.trim() === label, all((n) => has(n, 'card-switch'), pages()[1])[0])[0];
const nowHero = () => all((n) => n.localName === 'section' && has(n, 'hero'), pages()[1])[0];

await pin('DF1. dialfade: Timeline <-> Dial applies .now-card-dissolve (~200ms pure opacity fade) on incoming Now hero card body in both directions and cleans up cleanly', async () => {
  await seed({ tab: 'now', nowCard: 'timeline', nowCardAsked: true, drivingView: false, ...segs });
  // Let any cross-seed fade settle first, then verify steady state carries no dissolve class.
  await sleep(260);
  const steadyNoFade = !!nowHero() && !has(nowHero(), 'now-card-dissolve') && all((n) => has(n, 'taxis'), pages()[1]).length > 0;
  // Timeline -> Dial
  fire(nowCardKey('Dial'), 'click'); await sleep(30);
  const heroToDial = nowHero();
  const midDial = !!heroToDial && has(heroToDial, 'now-card-dissolve')
    && all((n) => has(n, 'dial'), pages()[1]).length > 0
    && all((n) => has(n, 'taxis'), pages()[1]).length === 0
    && getState().nowCard === 'dial';
  await sleep(250);
  const settledDial = !!nowHero() && !has(nowHero(), 'now-card-dissolve')
    && all((n) => has(n, 'dial'), pages()[1]).length > 0
    && nowCardKey('Dial')?.attributes['aria-pressed'] === 'true';
  // Dial -> Timeline
  fire(nowCardKey('Timeline'), 'click'); await sleep(30);
  const heroToTl = nowHero();
  const midTl = !!heroToTl && has(heroToTl, 'now-card-dissolve')
    && all((n) => has(n, 'taxis'), pages()[1]).length > 0
    && all((n) => has(n, 'dial'), pages()[1]).length === 0
    && getState().nowCard === 'timeline';
  await sleep(250);
  const settledTl = !!nowHero() && !has(nowHero(), 'now-card-dissolve')
    && all((n) => has(n, 'taxis'), pages()[1]).length > 0
    && nowCardKey('Timeline')?.attributes['aria-pressed'] === 'true';
  // CSS rules: pure opacity dissolve using unified tokens (--dur-exit 200ms --ease-state) on hero body (:not(.card-switch)), no slide/scale in now-card-dissolve, reduced-motion override
  const css = readFileSync(`${process.cwd()}/public/styles.css`, 'utf8');
  const startIdx = css.indexOf('\n.hero.now-card-dissolve');
  const endIdx = css.indexOf('@page', startIdx);
  const block = startIdx >= 0 && endIdx > startIdx ? css.slice(startIdx, endIdx) : '';
  const kfMatch = block.match(/@keyframes\s+now-card-dissolve\s*\{[\s\S]*?\}\s*\}/);
  const hasRule = /\.hero\.now-card-dissolve\s*>\s*:not\(\.card-switch\)\s*\{[^}]*animation:\s*now-card-dissolve\s+var\(--dur-exit\)\s+var\(--ease-state\)/.test(block);
  const hasKf = /@keyframes\s+now-card-dissolve\s*\{\s*from\s*\{\s*opacity:\s*0;\s*\}\s*to\s*\{\s*opacity:\s*1;\s*\}\s*\}/.test(block);
  const noTransform = !!kfMatch && !/transform|translate|scale/i.test(kfMatch[0]);
  const hasReduced = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.hero\.now-card-dissolve\s*>\s*:not\(\.card-switch\)[\s\S]*?animation:\s*none;/.test(block);
  const ok = steadyNoFade && midDial && settledDial && midTl && settledTl && hasRule && hasKf && noTransform && hasReduced;
  return ok || JSON.stringify({ steadyNoFade, midDial, settledDial, midTl, settledTl, hasRule, hasKf, noTransform, hasReduced });
});

await pin('DF2. dialfade: rapid repeated taps stay intact (never stuck/hidden) and RestHero out-of-hours toggles also dissolve cleanly in both directions', async () => {
  await seed({ tab: 'now', nowCard: 'timeline', nowCardAsked: true, drivingView: false, ...segs });
  await sleep(260);
  // Rapid toggle burst: Timeline -> Dial -> Timeline -> Dial -> Timeline
  fire(nowCardKey('Dial'), 'click'); await sleep(40);
  fire(nowCardKey('Timeline'), 'click'); await sleep(40);
  fire(nowCardKey('Dial'), 'click'); await sleep(40);
  fire(nowCardKey('Timeline'), 'click'); await sleep(30);
  const rapidMid = getState().nowCard === 'timeline' && has(nowHero(), 'now-card-dissolve') && all((n) => has(n, 'taxis'), pages()[1]).length > 0;
  await sleep(260);
  const rapidSettled = getState().nowCard === 'timeline' && !has(nowHero(), 'now-card-dissolve')
    && all((n) => has(n, 'taxis'), pages()[1]).length > 0
    && all((n) => has(n, 'dial'), pages()[1]).length === 0
    && nowCardKey('Timeline')?.attributes['aria-pressed'] === 'true';
  // Out-of-hours RestHero (ev.driveNow === 0): Timeline (with TimeAxis) <-> Dial (without TimeAxis)
  const CD = (day, hh, m = 0) => Math.floor(new Date(2026, 10, day, hh, m).getTime() / 60000);
  await seed({
    tab: 'now', nowCard: 'timeline', nowCardAsked: true, drivingView: false,
    segments: [{ status: 'OFF', start: CD(8, 0), end: CD(8, 10) }, { status: 'D', start: CD(8, 10), end: CD(8, 21) }],
    current: { status: 'OFF', since: CD(8, 21) },
    nowOverride: CD(8, 22),
  });
  await sleep(260);
  fire(nowCardKey('Dial'), 'click'); await sleep(30);
  const restDialMid = has(nowHero(), 'now-card-dissolve') && all((n) => has(n, 'taxis'), pages()[1]).length === 0;
  await sleep(250);
  const restDialDone = !has(nowHero(), 'now-card-dissolve') && all((n) => has(n, 'taxis'), pages()[1]).length === 0;
  fire(nowCardKey('Timeline'), 'click'); await sleep(30);
  const restTlMid = has(nowHero(), 'now-card-dissolve') && all((n) => has(n, 'taxis'), pages()[1]).length > 0;
  await sleep(250);
  const restTlDone = !has(nowHero(), 'now-card-dissolve') && all((n) => has(n, 'taxis'), pages()[1]).length > 0;
  const ok = rapidMid && rapidSettled && restDialMid && restDialDone && restTlMid && restTlDone;
  return ok || JSON.stringify({ rapidMid, rapidSettled, restDialMid, restDialDone, restTlMid, restTlDone });
});

await pin('DF3. dialfade: prefers-reduced-motion: reduce swaps Timeline <-> Dial instantly with no .now-card-dissolve animation in either direction', async () => {
  const origMM = globalThis.window.matchMedia;
  let toDialInstant = false, toTlInstant = false;
  try {
    globalThis.window.matchMedia = (q) => ({ matches: /prefers-reduced-motion:\s*reduce/.test(q), addEventListener() {}, removeEventListener() {} });
    await seed({ tab: 'now', nowCard: 'timeline', nowCardAsked: true, drivingView: false, ...segs });
    await sleep(40);
    fire(nowCardKey('Dial'), 'click'); await sleep(20);
    toDialInstant = getState().nowCard === 'dial'
      && !has(nowHero(), 'now-card-dissolve')
      && all((n) => has(n, 'dial'), pages()[1]).length > 0
      && all((n) => has(n, 'taxis'), pages()[1]).length === 0;
    fire(nowCardKey('Timeline'), 'click'); await sleep(20);
    toTlInstant = getState().nowCard === 'timeline'
      && !has(nowHero(), 'now-card-dissolve')
      && all((n) => has(n, 'taxis'), pages()[1]).length > 0
      && all((n) => has(n, 'dial'), pages()[1]).length === 0;
  } finally {
    globalThis.window.matchMedia = origMM;
  }
  return (toDialInstant && toTlInstant) || JSON.stringify({ toDialInstant, toTlInstant });
});

/* ---------------- (p) eldslide (2026-11-22, Lorico): "Check against my ELD" DriftSheet scoped slide-up/slide-down ---------------- */
const eldCheckBtn = () => all((n) => n.localName === 'button' && has(n, 'plan-item') && /Check against my ELD/.test(n.textContent), pages()[1])[0];

// Re-aimed (2026-11-22 polish): DriftSheet AND all other bottom sheets (why, status, exceptions, add) now share the unified bottom-sheet motion system.
await pin('ES1. eldslide / unified sheets: DriftSheet and all other bottom sheet kinds (why, status, exceptions, add) open cleanly under the unified bottom-sheet motion system', async () => {
  await seed({ tab: 'now', nowCard: 'timeline', nowCardAsked: true, drivingView: false, ...segs });
  const btn = eldCheckBtn();
  if (!btn) return 'missing "Check against my ELD" button on Now';
  fire(btn, 'click'); await sleep(40);
  const driftWrap = all((n) => has(n, 'sheet-wrap'))[0];
  const driftSheet = all((n) => has(n, 'sheet'))[0];
  const driftOk = !!driftWrap && !!driftSheet && has(driftWrap, 'slide-up') && has(driftSheet, 'slide-up') && !has(driftSheet, 'is-closing')
    && /Check against my ELD/.test(driftSheet.textContent);
  const others = [
    ['why', { kind: 'why' }],
    ['status', { kind: 'status' }],
    ['exceptions', { kind: 'exceptions' }],
    ['add', { kind: 'add' }],
  ];
  const otherBad = [];
  for (const [name, desc] of others) {
    openSheet(desc); await sleep(40);
    const wraps = all((n) => has(n, 'sheet-wrap'));
    const sheets = all((n) => has(n, 'sheet'));
    if (sheets.length !== 1 || wraps.length !== 1 || has(sheets[0], 'is-closing') || has(wraps[0], 'is-closing')) {
      otherBad.push(`${name}: wraps=${wraps.map(cls)} sheets=${sheets.map(cls)}`);
    }
  }
  openSheet(null); await sleep(260);
  return (driftOk && otherBad.length === 0) || JSON.stringify({ driftOk, driftWrap: driftWrap && cls(driftWrap), driftSheet: driftSheet && cls(driftSheet), otherBad });
});

// Re-aimed (2026-11-22 polish): ALL bottom sheets share retained .is-closing exit; direct switch / disclaimer / driving view still bypass exit retention immediately.
await pin('ES2. eldslide / unified sheets: closing DriftSheet (Close, backdrop, Escape, hw Back) and other sheets retains .is-closing (inert) then unmounts while releasing blocked immediately; direct switch/disclaimer/driving bypass retention immediately', async () => {
  const off = (p) => (p.attributes.inert !== undefined && p.attributes.inert !== 'false') || p.inert === true;
  const hid = (p) => p.attributes['aria-hidden'] === 'true' || p.attributes['aria-hidden'] === true;
  await seed({ tab: 'now', nowCard: 'timeline', nowCardAsked: true, drivingView: false, ...segs });

  const checkClosePath = async (label, closeFn) => {
    const btn = eldCheckBtn();
    if (!btn) return `${label}: missing ELD button`;
    fire(btn, 'click'); await sleep(40);
    if (all((n) => has(n, 'sheet') && has(n, 'slide-up')).length !== 1) return `${label}: DriftSheet did not open`;
    closeFn(); await sleep(30);
    const midWrap = all((n) => has(n, 'sheet-wrap'))[0];
    const midSheet = all((n) => has(n, 'sheet'))[0];
    const mainEl = strip();
    const midOk = A.currentSheet() === null && !off(mainEl)
      && !!midWrap && !!midSheet
      && has(midWrap, 'slide-up') && has(midWrap, 'is-closing') && off(midWrap) && hid(midWrap)
      && has(midSheet, 'slide-up') && has(midSheet, 'is-closing');
    if (!midOk) return `${label}: mid-close failed sheet=${JSON.stringify(A.currentSheet())} mainInert=${off(mainEl)} wrap=${midWrap && cls(midWrap)} sh=${midSheet && cls(midSheet)}`;
    await sleep(250);
    if (all((n) => has(n, 'sheet')).length !== 0) return `${label}: did not unmount after exit window`;
    return null;
  };

  for (const [label, fn] of [
    ['close-btn', () => fire(all((n) => n.localName === 'button' && n.attributes?.['aria-label'] === 'Close', all((n) => has(n, 'sheet'))[0])[0], 'click')],
    ['backdrop', () => fire(all((n) => n.localName === 'button' && has(n, 'sheet-backdrop'))[0], 'click')],
    ['escape', () => { for (const f of [...(document.listeners.keydown ?? [])]) f({ key: 'Escape', type: 'keydown', preventDefault() {}, stopPropagation() {} }); }],
    ['hw-back', () => pressHardwareBack()],
  ]) {
    const err = await checkClosePath(label, fn);
    if (err) return err;
  }

  // Direct switch to another sheet skips exit retention immediately
  fire(eldCheckBtn(), 'click'); await sleep(40);
  openSheet({ kind: 'why' }); await sleep(30);
  const swSheets = all((n) => has(n, 'sheet'));
  const swOk = swSheets.length === 1 && !has(swSheets[0], 'is-closing') && /Why/.test(swSheets[0].textContent);
  // Closing WhySheet now also plays unified retained slide-down exit then unmounts cleanly
  openSheet(null); await sleep(30);
  const whyClosing = all((n) => has(n, 'sheet') && has(n, 'is-closing')).length === 1 && A.currentSheet() === null;
  await sleep(250);
  const whyUnmounted = all((n) => has(n, 'sheet')).length === 0;

  // Showing disclaimer skips exit retention immediately
  fire(eldCheckBtn(), 'click'); await sleep(40);
  setState({ disclaimerAcked: false }); openSheet(null); await sleep(30);
  const discImmediate = all((n) => has(n, 'sheet')).length === 0;
  setState({ disclaimerAcked: true }); await sleep(260);

  // Entering driving view skips exit retention immediately
  fire(eldCheckBtn(), 'click'); await sleep(40);
  setDrivingPeek(null);
  setState({ current: { status: 'D', since: T - 10 }, drivingView: true }); openSheet(null); await sleep(30);
  const driveImmediate = all((n) => has(n, 'sheet')).length === 0;
  await seed({ tab: 'now', nowCard: 'timeline', nowCardAsked: true, drivingView: false, ...segs });

  return (swOk && whyClosing && whyUnmounted && discImmediate && driveImmediate)
    || JSON.stringify({ swOk, whyClosing, whyUnmounted, discImmediate, driveImmediate });
});

await pin('ES3. eldslide: under prefers-reduced-motion: reduce, DriftSheet has no slide animation CSS and unmounts immediately on close', async () => {
  const css = readFileSync(`${process.cwd()}/public/styles.css`, 'utf8');
  const block = css.slice(css.indexOf('SPLIT DECISION MOTION SYSTEM'));
  const hasReducedCss = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.sheet,[\s\S]*?\.sheet\.is-closing,[\s\S]*?animation:\s*none;[^}]*transform:\s*none;/.test(block);
  const origMM = globalThis.window.matchMedia;
  let immediateUnmount = false;
  try {
    globalThis.window.matchMedia = (q) => ({ matches: /prefers-reduced-motion:\s*reduce/.test(q), addEventListener() {}, removeEventListener() {} });
    await seed({ tab: 'now', nowCard: 'timeline', nowCardAsked: true, drivingView: false, ...segs });
    const btn = eldCheckBtn();
    if (!btn) return 'missing ELD button under reduced motion';
    fire(btn, 'click'); await sleep(40);
    if (all((n) => has(n, 'sheet') && has(n, 'slide-up')).length !== 1) return 'DriftSheet did not open under reduced motion';
    openSheet(null); await sleep(30);
    immediateUnmount = all((n) => has(n, 'sheet')).length === 0;
  } finally {
    globalThis.window.matchMedia = origMM;
  }
  return (hasReducedCss && immediateUnmount) || JSON.stringify({ hasReducedCss, immediateUnmount });
});

await pin('ES4. eldslide regression: LeverSheet still slides up with .sheet.slide-up, retains .is-closing (inert) on close, then unmounts cleanly', async () => {
  await seed(nowstripL4Seed());
  const btn = await waitForLeverBtn();
  if (!btn) return 'missing L4 lever strip';
  fire(btn, 'click'); await sleep(40);
  const openSheetEl = all((n) => has(n, 'sheet'))[0];
  const openWrapEl = all((n) => has(n, 'sheet-wrap'))[0];
  const openOk = !!openSheetEl && !!openWrapEl && has(openSheetEl, 'slide-up') && has(openWrapEl, 'slide-up') && !has(openSheetEl, 'is-closing');
  openSheet(null); await sleep(30);
  const midWrap = all((n) => has(n, 'sheet-wrap'))[0];
  const midSheet = all((n) => has(n, 'sheet'))[0];
  const off = (p) => (p.attributes.inert !== undefined && p.attributes.inert !== 'false') || p.inert === true;
  const hid = (p) => p.attributes['aria-hidden'] === 'true' || p.attributes['aria-hidden'] === true;
  const midOk = A.currentSheet() === null && !!midWrap && !!midSheet
    && has(midWrap, 'slide-up') && has(midWrap, 'is-closing') && off(midWrap) && hid(midWrap)
    && has(midSheet, 'slide-up') && has(midSheet, 'is-closing');
  await sleep(250);
  const unmounted = all((n) => has(n, 'sheet')).length === 0;
  return (openOk && midOk && unmounted) || JSON.stringify({ openOk, midOk, unmounted });
});

/* ---------------- (q) retime / motion system (2026-11-22 polish): Unified motion tokens + Log-entry origin morph + modals + day swaps ---------------- */
// Re-aimed (2026-11-22 polish): bottom-sheet entrance uses unified 320ms cubic-bezier(0.22, 0.14, 0.45, 1) (low peak velocity for 60Hz/120Hz parity) while exit stays 200ms ease-out with 220ms retained-exit lifecycle.
await pin('RT1. motion system: bottom-sheet entrance declares 320ms cubic-bezier(0.22, 0.14, 0.45, 1) via tokens (sheet + backdrop) while close exit stays 200ms ease-out with unchanged 220ms retained-exit lifecycle', async () => {
  const css = readFileSync(`${process.cwd()}/public/styles.css`, 'utf8');
  const startIdx = css.indexOf('SPLIT DECISION MOTION SYSTEM');
  const endIdx = css.indexOf('@page', startIdx);
  const block = startIdx >= 0 && endIdx > startIdx ? css.slice(startIdx, endIdx) : '';
  const tokens = /--dur-sheet:\s*320ms;/.test(block)
    && /--dur-exit:\s*200ms;/.test(block)
    && /--ease-enter:\s*cubic-bezier\(0\.22,\s*0\.14,\s*0\.45,\s*1\);/.test(block)
    && /--ease-exit:\s*ease-out;/.test(block);
  const sheetIn = /\.sheet\s*\{[^}]*transform:\s*translateY\(100%\);[^}]*animation:\s*sheet-slide-up\s+var\(--dur-sheet\)\s+var\(--ease-enter\)\s+both;/.test(block);
  const bdIn = /\.sheet-wrap\s*>\s*button\.sheet-backdrop\s*\{[^}]*animation:\s*sheet-backdrop-in\s+var\(--dur-sheet\)\s+var\(--ease-enter\)\s+both;/.test(block);
  const sheetOut = /\.sheet\.is-closing\s*\{[^}]*animation:\s*sheet-slide-down\s+var\(--dur-exit\)\s+var\(--ease-exit\)\s+both;/.test(block);
  const bdOut = /\.sheet-wrap\.is-closing\s*>\s*button\.sheet-backdrop\s*\{[^}]*animation:\s*sheet-backdrop-out\s+var\(--dur-exit\)\s+var\(--ease-exit\)\s+both;/.test(block);
  const kfUp = /@keyframes\s+sheet-slide-up\s*\{\s*from\s*\{\s*transform:\s*translateY\(100%\);\s*\}\s*to\s*\{\s*transform:\s*translateY\(0\);\s*\}\s*\}/.test(block);
  const kfDown = /@keyframes\s+sheet-slide-down\s*\{\s*from\s*\{\s*transform:\s*translateY\(0\);\s*\}\s*to\s*\{\s*transform:\s*translateY\(100%\);\s*\}\s*\}/.test(block);
  const kfBdIn = /@keyframes\s+sheet-backdrop-in\s*\{\s*from\s*\{\s*opacity:\s*0;\s*\}\s*to\s*\{\s*opacity:\s*1;\s*\}\s*\}/.test(block);
  const kfBdOut = /@keyframes\s+sheet-backdrop-out\s*\{\s*from\s*\{\s*opacity:\s*1;\s*\}\s*to\s*\{\s*opacity:\s*0;\s*\}\s*\}/.test(block);
  const reduced = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.sheet,[\s\S]*?\.sheet\.is-closing,[\s\S]*?\.sheet\.morph-origin,[\s\S]*?animation:\s*none;[^}]*transform:\s*none;/.test(block);
  // Both shared slide-up sheets (DriftSheet + LeverSheet) mount with .slide-up and close via retained .is-closing
  const off = (p) => (p.attributes.inert !== undefined && p.attributes.inert !== 'false') || p.inert === true;
  const hid = (p) => p.attributes['aria-hidden'] === 'true' || p.attributes['aria-hidden'] === true;
  await seed(nowstripL4Seed());
  const checkCycle = async (label, triggerBtn) => {
    if (!triggerBtn) return `${label}: missing trigger`;
    fire(triggerBtn, 'click'); await sleep(40);
    const ow = all((n) => has(n, 'sheet-wrap'))[0];
    const os = all((n) => has(n, 'sheet'))[0];
    if (!ow || !os || !has(ow, 'slide-up') || !has(os, 'slide-up') || has(os, 'is-closing')) return `${label}: bad open`;
    openSheet(null); await sleep(30);
    const mw = all((n) => has(n, 'sheet-wrap'))[0];
    const ms = all((n) => has(n, 'sheet'))[0];
    if (A.currentSheet() !== null || !mw || !ms || !has(mw, 'slide-up') || !has(mw, 'is-closing') || !off(mw) || !hid(mw) || !has(ms, 'slide-up') || !has(ms, 'is-closing')) {
      return `${label}: bad closing`;
    }
    await sleep(250);
    if (all((n) => has(n, 'sheet')).length !== 0) return `${label}: did not unmount`;
    return null;
  };
  const leverErr = await checkCycle('lever', await waitForLeverBtn());
  const driftErr = await checkCycle('drift', eldCheckBtn());
  const ok = tokens && sheetIn && bdIn && sheetOut && bdOut && kfUp && kfDown && kfBdIn && kfBdOut && reduced && !leverErr && !driftErr;
  return ok || JSON.stringify({ tokens, sheetIn, bdIn, sheetOut, bdOut, kfUp, kfDown, kfBdIn, kfBdOut, reduced, leverErr, driftErr });
});

await pin('MS1. motion system: Log-entry morph CSS, centered modal CSS, End-of-Day swap CSS, and Plan inner step dissolve CSS are all defined on unified tokens with reduced-motion resets', async () => {
  const css = readFileSync(`${process.cwd()}/public/styles.css`, 'utf8');
  const block = css.slice(css.indexOf('SPLIT DECISION MOTION SYSTEM'), css.indexOf('@page'));
  const hasMorph = /\.sheet\.morph-origin\s*\{[^}]*animation:\s*sheet-morph-in\s+var\(--dur-sheet\)\s+var\(--ease-enter\)\s+both;/.test(block)
    && /\.sheet\.morph-origin\.is-closing\s*\{[^}]*animation:\s*sheet-morph-out\s+var\(--dur-exit\)\s+var\(--ease-exit\)\s+both;/.test(block)
    && /\.sheet\.morph-origin\.is-closing\.morph-fallback\s*\{[^}]*animation:\s*sheet-slide-down\s+var\(--dur-exit\)\s+var\(--ease-exit\)\s+both;/.test(block)
    && /@keyframes\s+sheet-morph-in\s*\{/.test(block)
    && /@keyframes\s+sheet-morph-out\s*\{/.test(block);
  const hasModal = /\.backdrop\s*\{[^}]*animation:\s*modal-backdrop-in\s+var\(--dur-room\)\s+var\(--ease-enter\)\s+both;/.test(block)
    && /\.backdrop\s*>\s*\.modal\s*\{[^}]*animation:\s*modal-enter\s+var\(--dur-room\)\s+var\(--ease-enter\)\s+both;/.test(block)
    && /\.backdrop\.is-closing\s*>\s*\.modal\s*\{[^}]*animation:\s*modal-exit\s+var\(--dur-exit\)\s+var\(--ease-exit\)\s+both;/.test(block);
  const hasSwaps = /\.day-swap-in\s*\{[^}]*animation:\s*state-reveal\s+var\(--dur-exit\)\s+var\(--ease-state\)\s+both;/.test(block)
    && /\.page\.plan-room\.room-swap\s*>\s*\*\s*\{[^}]*animation:\s*state-dissolve\s+var\(--dur-exit\)\s+var\(--ease-state\)\s+both;/.test(block)
    && /\.flow-body\.step-dissolve\s*\{[^}]*animation:\s*state-dissolve\s+var\(--dur-exit\)\s+var\(--ease-state\)\s+both;/.test(block)
    && /\.sheet\[data-step-swap="1"\]\s*>\s*:not\(\.sheet-handle\):not\(\.sheet-head\)\s*\{[^}]*animation:\s*state-dissolve\s+var\(--dur-micro\)\s+var\(--ease-state\)\s+both;/.test(block);
  const hasReduced = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.sheet\.morph-origin[\s\S]*?\.backdrop\s*>\s*\.modal[\s\S]*?\.day-swap-in[\s\S]*?animation:\s*none;[^}]*transform:\s*none;[^}]*opacity:\s*1;/.test(block);
  return (hasMorph && hasModal && hasSwaps && hasReduced) || JSON.stringify({ hasMorph, hasModal, hasSwaps, hasReduced });
});

await pin('MS2. motion system: Now open-day <-> End of Day chooser <-> closed-day swaps apply .day-swap-in and keep Reopen/Undo immediately clickable', async () => {
  await seed({ tab: 'now', nowCard: 'timeline', nowCardAsked: true, drivingView: false, ...segs });
  await sleep(250);
  const endBtn = all((n) => n.localName === 'button' && n.textContent.trim() === 'End my day', pages()[1])[0];
  if (!endBtn) return 'missing End my day button';
  fire(endBtn, 'click'); await sleep(30);
  const askEl = all((n) => has(n, 'endday-ask'), pages()[1])[0];
  const askSwapOk = !!askEl && has(askEl, 'day-swap-in');
  const offBtn = all((n) => n.localName === 'button' && n.textContent.trim() === 'Off Duty', askEl)[0];
  if (!offBtn) return 'missing Off Duty in endday-ask';
  fire(offBtn, 'click'); await sleep(30);
  const closedBar = all((n) => has(n, 'undo') && /Day closed/.test(n.textContent), pages()[1])[0];
  const closedSwapOk = !!closedBar && has(closedBar, 'day-swap-in');
  const reopenBtn = all((n) => n.localName === 'button' && n.textContent.trim() === 'Reopen', closedBar)[0];
  if (!reopenBtn) return 'missing Reopen button';
  fire(reopenBtn, 'click'); await sleep(30);
  const reopenedBtn = all((n) => n.localName === 'button' && n.textContent.trim() === 'End my day', pages()[1])[0];
  const reopenSwapOk = !!reopenedBtn && has(reopenedBtn, 'day-swap-in');
  await sleep(250);
  const cleanedUp = !has(all((n) => n.localName === 'button' && n.textContent.trim() === 'End my day', pages()[1])[0], 'day-swap-in');
  return (askSwapOk && closedSwapOk && reopenSwapOk && cleanedUp) || JSON.stringify({ askSwapOk, closedSwapOk, reopenSwapOk, cleanedUp });
});

await pin('MS3. motion system: Log entry rows carry deterministic data-entry-key and tapping a row with a valid rect opens EditorSheet in .morph-origin mode', async () => {
  await seed({ tab: 'log', ...segs });
  const row = all((n) => n.localName === 'button' && has(n, 'entry') && !has(n, 'live'), pages()[2])[0];
  if (!row) return 'missing logged entry row';
  const key = row.attributes?.['data-entry-key'];
  if (!key) return 'missing data-entry-key on Log entry row';
  row.getBoundingClientRect = () => ({ left: 20, top: 380, width: 372, height: 60, right: 392, bottom: 440 });
  fire(row, 'click'); await sleep(40);
  const wrap = all((n) => has(n, 'sheet-wrap'))[0];
  const sh = all((n) => has(n, 'sheet'))[0];
  const openedMorph = !!wrap && !!sh && has(wrap, 'morph-origin') && has(sh, 'morph-origin') && has(row, 'is-morph-source');
  openSheet(null); await sleep(30);
  const closingMorph = all((n) => has(n, 'sheet') && has(n, 'morph-origin') && has(n, 'is-closing')).length === 1 && !has(row, 'is-morph-source');
  await sleep(250);
  const unmounted = all((n) => has(n, 'sheet')).length === 0;
  return (openedMorph && closingMorph && unmounted) || JSON.stringify({ key, openedMorph, closingMorph, unmounted });
});

let fails = 0;
for (const [st, name, why] of res) { console.log(`${st} ${name}${why ? ` — ${why}` : ''}`); if (st === 'FAIL') fails++; }
console.log(`revisions: ${res.length - fails}/${res.length} pins pass`);
render(null, root);
process.exit(fails ? 1 : 0);

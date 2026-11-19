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
await pin('H4. a tab-bar tap is not a swipe: its strip scroll and settle add no haptic click', async () => {
  await seed({ tab: 'now', ...segs }); strip().scrollLeft = 0; vib.length = 0;
  tapNav('Log'); await sleep(60);
  if (getState().tab !== 'log') return `tab=${getState().tab}`;
  fire(strip(), 'scroll'); await sleep(220); // the arrival's scroll event and its settle
  tapNav('Plan'); await sleep(60); fire(strip(), 'scroll'); await sleep(220);
  return (getState().tab === 'plan' && vib.length === 0) || `tab=${getState().tab} vibrate×${vib.length}: ${JSON.stringify(vib)}`;
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

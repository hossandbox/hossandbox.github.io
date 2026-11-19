// Revisions (2026-11-18, Lorico): bottom-bar order Now/Plan/Log/More, the panel swipe pager,
// GitHub-only bug reports, and the end of the $5 bug bounty + free-paid-version perk.
//
// The real App is mounted in the minimal DOM (domshim) with a controlled wall clock. Swipes are
// driven through the <main> element's own touch listeners — the shim has no event bubbling, so
// each synthetic event carries the node the gesture "started on" as its target, exactly what
// the pager's guard reads. Every pin reports on its own line; exit 1 when any pin fails.
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
let Tms = new Date(2026, 10, 10, 14, 14, 5).getTime(); // local wall time: Tue Nov 10 2026, 14:14
Date.now = () => Tms;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'revisions';
const { render, h } = await import('preact');
const { readFileSync, readdirSync } = await import('node:fs');
const A = await import('../../src/app.tsx');
const S = await import('../../src/store.ts');
const { App, setLaunchNotice, openSheet, panelSwipeTarget, swipeGuardHit, PANEL_ORDER } = A;
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
// Preact registers touch handlers under their camel name ('TouchStart') when the runtime has no
// 'ontouchstart' property to lowercase against — the shim is such a runtime — so fire that too.
const CAMEL = { touchstart: 'TouchStart', touchend: 'TouchEnd', touchcancel: 'TouchCancel' };
const fire = (node, type, extra = {}) => { for (const t of [type, type[0].toUpperCase() + type.slice(1), CAMEL[type]].filter(Boolean)) { const ev = { type: t, target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...extra }; for (const f of node.listeners[t] ?? []) f.call(node, ev); } };
const main = () => all((n) => n.localName === 'main')[0];
const swipe = async (target, x0, y0, x1, y1) => {
  const m = main(); if (!m) throw new Error('no <main> rendered');
  fire(m, 'touchstart', { target, touches: [{ clientX: x0, clientY: y0 }] });
  fire(m, 'touchend', { target, changedTouches: [{ clientX: x1, clientY: y1 }] });
  await sleep(60);
};

render(h(App, {}), root); await sleep(120);

/* ---------------- (a) the bottom bar shows Now, Plan, Log, More ---------------- */
await pin('A1. PANEL_ORDER is now/plan/log/settings', async () => {
  return JSON.stringify(PANEL_ORDER) === JSON.stringify(['now', 'plan', 'log', 'settings']) || `got ${JSON.stringify(PANEL_ORDER)}`;
});
await pin('A2. the rendered tab bar reads Now, Plan, Log, More in that order', async () => {
  await seed({ segments: [{ status: 'OFF', start: T - 900, end: T - 300 }], current: { status: 'ON', since: T - 300 } });
  const nav = all((n) => n.localName === 'nav' && (n.attributes.class || '').includes('tabs'))[0];
  if (!nav) return 'no tab bar rendered';
  const labels = nav.childNodes.filter((n) => n.localName === 'button').map((b) => b.textContent.trim());
  return JSON.stringify(labels) === JSON.stringify(['Now', 'Plan', 'Log', 'More']) || `got ${JSON.stringify(labels)}`;
});
await pin('A3. the app still lands on Now by default', async () => getState().tab === 'now' || `tab=${getState().tab}`);

/* ---------------- the pure pager math ---------------- */
await pin('P1. swipe targets walk the new order and stop at the ends', async () => {
  const cases = [['now', 1, 'plan'], ['plan', 1, 'log'], ['log', 1, 'settings'], ['settings', 1, null], ['now', -1, null], ['settings', -1, 'log'], ['log', -1, 'plan'], ['plan', -1, 'now']];
  const bad = cases.filter(([t, d, want]) => panelSwipeTarget(t, d) !== want);
  return bad.length === 0 || `wrong: ${JSON.stringify(bad)}`;
});
await pin('P2. from a planning sub-screen, a swipe walks from Plan', async () => {
  return (panelSwipeTarget('split', 1) === 'log' && panelSwipeTarget('recap', -1) === 'now') || `split+1=${panelSwipeTarget('split', 1)} recap-1=${panelSwipeTarget('recap', -1)}`;
});
await pin('P3. the guard hits controls and data-noswipe, misses open space', async () => {
  const node = (localName, parentNode, hasAttribute) => ({ localName, parentNode: parentNode ?? null, hasAttribute });
  const onButton = swipeGuardHit(node('span', node('button', node('div'))));
  const onSlider = swipeGuardHit(node('input', node('div')));
  const onTrack = swipeGuardHit(node('span', node('span'), (k) => k === 'data-noswipe'));
  const onEntryText = swipeGuardHit(node('span', node('button')));
  const open = swipeGuardHit(node('p', node('section', node('main'))));
  return (onButton && onSlider && onTrack && onEntryText && !open) || `button=${onButton} slider=${onSlider} track=${onTrack} entry=${onEntryText} open=${open}`;
});

/* ---------------- (b) swipes in the mounted app ---------------- */
await pin('B1. a left swipe on open panel space moves Now → Plan, and the bar follows', async () => {
  await seed({ tab: 'now', segments: [{ status: 'OFF', start: T - 900, end: T - 300 }], current: { status: 'ON', since: T - 300 } });
  await swipe(main(), 300, 200, 180, 205);
  if (getState().tab !== 'plan') return `tab=${getState().tab}`;
  const nav = all((n) => n.localName === 'nav' && (n.attributes.class || '').includes('tabs'))[0];
  const on = nav.childNodes.filter((n) => n.localName === 'button').find((b) => (b.attributes.class || '').split(/\s+/).includes('on'));
  return (on && on.textContent.trim() === 'Plan') || `lit tab=${on && on.textContent.trim()}`;
});
await pin('B2. a right swipe on open space moves back Plan → Now', async () => {
  await swipe(main(), 60, 200, 200, 195);
  return getState().tab === 'now' || `tab=${getState().tab}`;
});
await pin('B3. a mostly-vertical gesture on open space is a scroll, not a page', async () => {
  await swipe(main(), 200, 120, 215, 320);
  return getState().tab === 'now' || `tab=${getState().tab}`;
});
await pin('B4. a gesture starting on a log segment (a <button class="entry">) does NOT switch panels', async () => {
  await seed({ tab: 'log', segments: [{ status: 'OFF', start: T - 900, end: T - 300 }, { status: 'D', start: T - 300, end: T - 60 }], current: { status: 'ON', since: T - 60 } });
  const entry = all((n) => n.localName === 'button' && (n.attributes.class || '').split(/\s+/).includes('entry'))[0];
  if (!entry) return 'no log entry rendered to start the gesture on';
  await swipe(entry, 300, 200, 170, 205);
  return getState().tab === 'log' || `tab=${getState().tab}`;
});
await pin('B5. a swipe on open space in Log still pages forward to More', async () => {
  await swipe(main(), 300, 200, 180, 205);
  return getState().tab === 'settings' || `tab=${getState().tab}`;
});
await pin('B6. at the last panel a left swipe goes nowhere (no wrap)', async () => {
  await swipe(main(), 300, 200, 180, 205);
  return getState().tab === 'settings' || `tab=${getState().tab}`;
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
  await seed({ tab: 'settings', segments: [{ status: 'OFF', start: T - 900, end: T - 300 }], current: { status: 'ON', since: T - 300 } });
  const txt = root.textContent;
  return (/Report a bug \(GitHub\)/.test(txt) && !/Prefer email instead/.test(txt)) || 'bug reports card wrong';
});

let fails = 0;
for (const [st, name, why] of res) { console.log(`${st} ${name}${why ? ` — ${why}` : ''}`); if (st === 'FAIL') fails++; }
console.log(`revisions: ${res.length - fails}/${res.length} pins pass`);
render(null, root);
process.exit(fails ? 1 : 0);

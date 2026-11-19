// DIAGNOSTIC (temporary, not a lane): why does Lorico's on-device swipe work exactly once
// (Now → Plan) and never again? Mounts the real App in domshim and drives touch sequences
// whose targets are REAL rendered content nodes — the deepest element a finger would land
// on — instead of <main> itself, which is what the revisions lane used.
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
let Tms = new Date(2026, 10, 10, 14, 14, 5).getTime();
Date.now = () => Tms;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'diag';
const { render, h } = await import('preact');
const A = await import('../../src/app.tsx');
const S = await import('../../src/store.ts');
const { App, setLaunchNotice, openSheet, swipeGuardHit, currentSheet } = A;
const { setState, getState, deviceTz } = S;
setLaunchNotice?.(false);
const sleep = (ms) => new Promise((r) => rawSetTimeout(r, ms));
const root = document.createElement('div'); document.body.appendChild(root);
const T = Math.floor(Tms / 60000);
const base = () => ({ tentative: [], drivingView: true, zoneAck: null, seededAt: null, dayCloses: [], historyAcknowledged: true, theme: 'day', themeChosen: true, darkDriveAtNight: true, disclaimerAcked: true, tzChosen: true, alertsOn: false, speakAlerts: false, speechAsked: true, speakAskOpen: false, nowOverride: null, tab: 'now', nowCard: 'dial', nowCardAsked: true, config: { ...getState().config, timeZone: deviceTz } });
const seed = async (rec) => { openSheet(null); setState({ ...base(), ...rec }); await sleep(60); };
const all = (pred) => { const out = []; const w = (n) => { if (pred(n)) out.push(n); n.childNodes.forEach(w); }; w(root); return out; };
const CAMEL = { touchstart: 'TouchStart', touchend: 'TouchEnd', touchcancel: 'TouchCancel' };
const fire = (node, type, extra = {}) => { for (const t of [type, type[0].toUpperCase() + type.slice(1), CAMEL[type]].filter(Boolean)) { const ev = { type: t, target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...extra }; for (const f of node.listeners[t] ?? []) f.call(node, ev); } };
const main = () => all((n) => n.localName === 'main')[0];
const swipe = async (target, x0, y0, x1, y1) => {
  const m = main(); if (!m) throw new Error('no <main> rendered');
  fire(m, 'touchstart', { target, touches: [{ clientX: x0, clientY: y0 }] });
  fire(m, 'touchend', { target, changedTouches: [{ clientX: x1, clientY: y1 }] });
  await sleep(60);
};
const segs = { segments: [{ status: 'OFF', start: T - 900, end: T - 300 }, { status: 'D', start: T - 300, end: T - 60 }], current: { status: 'ON', since: T - 60 } };
// Leaf element nodes under <main>: elements with no element children (text/SVG leaves) —
// the things a real touch target resolves to.
const leaves = () => { const m = main(); const out = []; const w = (n) => { for (const c of n.childNodes) { if (c.nodeType === 1) { const kids = c.childNodes.filter((k) => k.nodeType === 1); if (kids.length === 0) out.push(c); else w(c); } } }; w(m); return out; };
const describe = (n) => `<${n.localName} class="${n.attributes.class || ''}"> "${(n.textContent || '').trim().slice(0, 28)}"`;
const coverage = (tab) => { const ls = leaves(); const hit = ls.filter((n) => swipeGuardHit(n)); return { tab, leaves: ls.length, guarded: hit.length, pct: ls.length ? Math.round((hit.length / ls.length) * 100) : 0 }; };

render(h(App, {}), root); await sleep(120);
const out = [];
const log = (s) => { out.push(s); console.log(s); };

/* ---- coverage per panel ---- */
for (const tab of ['now', 'plan', 'log', 'settings']) {
  await seed({ tab, ...segs });
  const c = coverage(tab);
  log(`COVERAGE ${tab}: ${c.guarded}/${c.leaves} leaf targets guard-hit (${c.pct}%)`);
}

/* ---- Lorico's exact walk ---- */
await seed({ tab: 'now', ...segs });
// 1. Now: a real open-space leaf (first leaf that is NOT guard-hit and not the scrub track)
const nowOpen = leaves().find((n) => !swipeGuardHit(n) && (n.textContent || '').trim().length > 0);
log(`NOW open-space target: ${nowOpen ? describe(nowOpen) : 'NONE FOUND'} guardHit=${nowOpen ? swipeGuardHit(nowOpen) : 'n/a'}`);
await swipe(nowOpen, 300, 200, 180, 205);
log(`STEP1 swipe left on Now open space -> tab=${getState().tab} (expect plan) sheet=${currentSheet()}`);

// 2. Plan: the middle of a plan-item row — the <b> title inside <span class="plan-text"> inside <button class="plan-item">
const planTitle = all((n) => n.localName === 'b' && (n.textContent || '').includes('sleeper split'))[0];
log(`PLAN row target: ${planTitle ? describe(planTitle) : 'NONE'} guardHit=${planTitle ? swipeGuardHit(planTitle) : 'n/a'}`);
await swipe(planTitle, 300, 200, 180, 205);
log(`STEP2 swipe left on Plan row -> tab=${getState().tab} (Lorico: stays plan) sheet=${currentSheet()}`);

// 3. Control A: same Plan screen, swipe starting on the <h1 class="screen-title"> (the only open space)
const h1 = all((n) => n.localName === 'h1')[0];
log(`PLAN h1 target: ${h1 ? describe(h1) : 'NONE'} guardHit=${h1 ? swipeGuardHit(h1) : 'n/a'}`);
await swipe(h1, 300, 200, 180, 205);
log(`STEP3 swipe left on Plan title -> tab=${getState().tab} (if log, the pager itself still works; the guard is the blocker)`);

// 4. Control B: back on Plan, swipe with target=<main> itself — what the old revisions lane B-pins used
await seed({ tab: 'plan', ...segs });
await swipe(main(), 300, 200, 180, 205);
log(`STEP4 swipe left with target=<main> on Plan -> tab=${getState().tab} (old lane's method: pages, but no real finger ever targets <main> over content)`);

// 5. Log panel: an entry's text leaf, then walk on
await seed({ tab: 'log', ...segs });
const entryLeaf = all((n) => n.localName === 'button' && (n.attributes.class || '').split(/\s+/).includes('entry'))[0];
log(`LOG entry target: ${entryLeaf ? describe(entryLeaf) : 'NONE'} guardHit=${entryLeaf ? swipeGuardHit(entryLeaf) : 'n/a'}`);
await swipe(entryLeaf, 300, 200, 180, 205);
log(`STEP5 swipe left on Log entry -> tab=${getState().tab} (stays log if guard-hit)`);

// 6. Settings: a typical leaf (setting row label text / select)
await seed({ tab: 'settings', ...segs });
const setLeaf = leaves().find((n) => (n.textContent || '').trim().length > 2);
log(`SETTINGS first text leaf: ${setLeaf ? describe(setLeaf) : 'NONE'} guardHit=${setLeaf ? swipeGuardHit(setLeaf) : 'n/a'}`);

render(null, root);
process.exit(0);

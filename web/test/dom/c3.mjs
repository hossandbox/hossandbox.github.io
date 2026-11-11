// Capstone C3 — "Dock & dispatch": the behavioural pin lane (audit §3 M4 load side, M5, M7,
// M8 + D10-A, M13, M14). The real App is mounted in the minimal DOM (domshim) with effects
// running and a controlled wall clock; controls are driven through their own listeners. Every
// pin reports on its own line (a soft collector), so one run on the untouched C2 base shows
// each pin red. Exit 1 when any pin fails.
//
// Fixtures are the audit's standard seed (Appendix A: America/New_York terminal, the phone's
// own zone for the clock) and its variant V3 (the cycle binds), built in the phone's local time
// the way the scrub lane builds them, so the same wall-clock values hold under TZ=America/Chicago
// and TZ=UTC.
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const CD = (day, hh, m = 0) => Math.floor(new Date(2026, 10, day, hh, m).getTime() / 60000);
let WALL = CD(9, 3, 4);
Date.now = () => WALL * 60000 + 5000;
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); }; globalThis.__BUILD__ = 'c3';
globalThis.speechSynthesis = { cancel() {}, speak() {}, getVoices: () => [] };
globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
// The phone: vibrate, the share sheet and the clipboard are recorded, never real.
const vib = [];
const shared = []; const copied = [];
let shareMode = 'ok'; // 'ok' | 'abort' | 'none'
const nav = {
  userAgent: 'c3-lane',
  vibrate: (p) => { vib.push(JSON.stringify(p)); return true; },
  clipboard: { writeText: async (t) => { copied.push(t); } },
};
Object.defineProperty(nav, 'share', { configurable: true, enumerable: true, get: () => (shareMode === 'none' ? undefined : async ({ text }) => { if (shareMode === 'abort') { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; } shared.push(text); }) });
Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
const hasShare = () => shareMode !== 'none';
// `'share' in navigator` must follow the mode, so the property itself comes and goes.
const setShare = (m) => { shareMode = m; if (m === 'none') delete nav.share; else if (!('share' in nav)) Object.defineProperty(nav, 'share', { configurable: true, enumerable: true, value: async ({ text }) => { if (shareMode === 'abort') { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; } shared.push(text); } }); };
// history: record every replaceState call with its arguments (M14).
const replaced = [];
const realReplace = globalThis.history.replaceState;
globalThis.history.replaceState = function (s, t, u) { replaced.push([s, t, u]); return realReplace.call(this, s, t, u); };
globalThis.location = { search: '' };
// The load flow scrolls each question to the top; the shim has no layout, so scrolling is a no-op here.
globalThis.scrollTo = () => {};

const { render, h } = await import('preact');
const A = await import('../../src/app.tsx');
const S = await import('../../src/store.ts');
const AL = await import('../../src/alerts.ts');
const BN = await import('../../src/backnav.ts');
const E = await import('../../../engine/src/index.ts');
const { App, setLaunchNotice, openSheet, currentSheet } = A;
const { setState, getState, INITIAL_STATE: INIT, allSegments, dur, clock, clockFull, DEFAULT_LOADCHECK, DEFAULT_SPLIT } = S;
const { readFileSync } = await import('node:fs');
setLaunchNotice(false);
const sleep = (ms) => new Promise((r) => rawSetTimeout(r, ms));
const res = [];
const pin = async (name, f) => { try { const r = await f(); res.push([r === true ? 'PASS' : 'FAIL', name, r === true ? '' : String(r)]); } catch (e) { res.push(['FAIL', name, 'threw: ' + (e && e.message || e)]); } };
const root = document.createElement('div'); document.body.appendChild(root);
const text = () => root.textContent;

const NY = { ...INIT.config, timeZone: 'America/New_York' };
const mk = (over) => ({ ...INIT, config: NY, disclaimerAcked: true, historyAcknowledged: true, tzChosen: true, zoneAck: null, speechAsked: true, alertsOn: true, speakAlerts: false, nowCard: 'timeline', nowCardAsked: true, nowOverride: null, ...over });
const seedSegs = [
  { status: 'OFF', start: CD(8, 5, 40), end: CD(8, 7, 40) }, { status: 'SB', start: CD(8, 7, 40), end: CD(8, 15, 40) },
  { status: 'ON', start: CD(8, 15, 40), end: CD(8, 16, 25) }, { status: 'D', start: CD(8, 16, 25), end: CD(8, 19, 10) },
  { status: 'OFF', start: CD(8, 19, 10), end: CD(8, 19, 40) }, { status: 'ON', start: CD(8, 19, 40), end: CD(8, 21, 55) }];
/** The standard seed, still Driving since 21:55 (big view per `drivingView`). */
const driving = (over = {}) => mk({ segments: seedSegs, current: { status: 'D', since: CD(8, 21, 55) }, tab: 'now', drivingView: false, ...over });
/** V3 (§6): seven days ON 05:00–06:00 / D 06:00–14:00 / ON 14:00–15:00, then ON from Mon 05:00; now Mon 06:00. */
const v3 = () => {
  const segs = [];
  for (let d = 2; d <= 8; d++) segs.push({ status: 'OFF', start: d === 2 ? CD(1, 15) : CD(d - 1, 15), end: CD(d, 5) }, { status: 'ON', start: CD(d, 5), end: CD(d, 6) }, { status: 'D', start: CD(d, 6), end: CD(d, 14) }, { status: 'ON', start: CD(d, 14), end: CD(d, 15) });
  segs.push({ status: 'OFF', start: CD(8, 15), end: CD(9, 5) });
  return segs;
};

// DOM helpers (the scrub lane's)
const all = (pred, from = root) => { const out = []; const w = (n) => { if (pred(n)) out.push(n); n.childNodes.forEach(w); }; w(from); return out; };
const cls = (n) => (n.attributes?.class || '').split(/\s+/);
const byClass = (c, from) => all((n) => n.nodeType === 1 && cls(n).includes(c), from);
const fire = (node, type, extra = {}) => { for (const t of [type, type[0].toUpperCase() + type.slice(1)]) { const ev = { type: t, target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...extra }; for (const f of node.listeners[t] ?? []) f.call(node, ev); } };
const disabled = (n) => n.attributes.disabled !== undefined && n.attributes.disabled !== 'false';
const buttons = (re) => all((n) => n.localName === 'button' && re.test(n.textContent));
const button = (re) => buttons(re)[0];
const click = async (re, wait = 40) => { const b = typeof re === 'object' && re.nodeType ? re : button(re); if (!b) throw new Error('no button ' + re); if (!disabled(b)) fire(b, 'click'); await sleep(wait); return b; };
const stored = () => JSON.stringify([...mem.entries()].sort());
// The document-level click listener (the tap tick) is driven like a real tap: capture listeners on document.
const docTap = (b) => { for (const f of document.listeners.click ?? []) f.call(document, { type: 'click', target: b }); };
// The DOM shim's nodes have no `closest`; give the tap tick what a browser gives it.
const withClosest = (b) => { b.closest = (sel) => (sel === 'button' ? b : null); return b; };
const visible = async () => { document.visibilityState = 'visible'; for (const f of document.listeners.visibilitychange ?? []) f.call(document, { type: 'visibilitychange' }); await sleep(60); };
const hidden = async () => { document.visibilityState = 'hidden'; for (const f of document.listeners.visibilitychange ?? []) f.call(document, { type: 'visibilitychange' }); await sleep(30); };
/** A fresh App mount: what "opening the app" is. */
const mount = async (st, search = '') => {
  render(null, root); await sleep(20);
  openSheet(null); A.resetWelcomeForTest?.();
  globalThis.location = { search };
  if (st) setState(st);
  await sleep(20);
  render(h(App, {}), root); await sleep(150);
};
const loadAnswer = async (lc, over = {}) => { await mount(driving({ tab: 'load', planReturn: 'plan', loadCheck: { ...DEFAULT_LOADCHECK, ...lc, answered: true }, ...over })); };

/* =================================== M7: dispatch mode =================================== */

await pin('M7a. question 2 gains [Pick a time] after the four chips; it opens the big clock and sets leaveIn = picked − now (no 2-hour ceiling)', async () => {
  WALL = CD(9, 3, 4);
  await mount(driving({ tab: 'load', planReturn: 'plan', loadCheck: { ...DEFAULT_LOADCHECK, miles: 300, answered: false } }));
  await click(/^Next: when you leave/);
  const chipRow = byClass('chips')[0];
  const order = chipRow ? chipRow.childNodes.map((n) => n.textContent) : [];
  if (JSON.stringify(order) !== JSON.stringify(['Now', 'In 30 min', 'In 1 hour', 'In 2 hours'])) return `chips ${JSON.stringify(order)}`;
  const pick = button(/^Pick a time$/);
  if (!pick) return 'no Pick a time';
  // it comes AFTER the chips
  const flat = all((n) => n === chipRow || n === pick);
  if (flat[0] !== chipRow) return 'Pick a time must follow the chips';
  await click(pick);
  const k = currentSheet();
  if (!k || k.kind !== 'loadtime' || k.field !== 'leave') return `sheet ${JSON.stringify(k)}`;
  if (!byClass('ed-clock').length || !button(/^\+ 1 hour$/) || !button(/^−15$/)) return 'the big clock and its keys must show';
  // the sheet starts on the next whole hour after now (04:00): +1h ×2 and +15 → 06:15, 3h 11m from 03:04
  await click(/^\+ 1 hour$/); await click(/^\+ 1 hour$/); await click(/^\+15$/);
  await click(/^Leave at /);
  const lc = getState().loadCheck;
  if (currentSheet() !== null) return 'the sheet must close on Leave at';
  if (lc.leaveIn !== CD(9, 6, 15) - CD(9, 3, 4)) return `leaveIn ${lc.leaveIn}, want ${CD(9, 6, 15) - CD(9, 3, 4)}`;
  if (!/Leaving at Mon 06:15/.test(text())) return 'the picked time must read back on the question';
  return true;
});

await pin('M7b. a typed departure in the past or past 24h is refused on the sheet (nothing set)', async () => {
  const before = getState().loadCheck.leaveIn;
  openSheet({ kind: 'loadtime', field: 'leave' }); await sleep(40);
  for (let i = 0; i < 5; i++) await click(/^− 1 hour$/, 10);
  const refusedPast = /Pick a time after now\./.test(text()) && disabled(button(/^Leave at /));
  for (let i = 0; i < 30; i++) await click(/^\+ 1 hour$/, 5);
  await sleep(30);
  const refusedFar = /Up to 24 hours from now/.test(text()) && disabled(button(/^Leave at /));
  openSheet(null); await sleep(20);
  return (refusedPast && refusedFar && getState().loadCheck.leaveIn === before) || `past ${refusedPast} far ${refusedFar} leaveIn ${getState().loadCheck.leaveIn}`;
});

await pin('M7c. question 3½ "Appointment at the receiver?" offers [No appointment] [Pick a time]; No appointment goes to the answer with none set', async () => {
  await mount(driving({ tab: 'load', planReturn: 'plan', loadCheck: { ...DEFAULT_LOADCHECK, miles: 300, answered: false } }));
  await click(/^Next: when you leave/); await click(/^Next: time at the receiver/); await click(/^Next: appointment time/);
  if (!/Appointment at the receiver\?/.test(text())) return 'no appointment question';
  if (!button(/^No appointment$/) || !button(/^Pick a time$/)) return 'both answers must be offered';
  await click(/^No appointment$/, 120);
  const lc = getState().loadCheck;
  return (/Verdict/.test(text()) && lc.answered === true && (lc.appt ?? null) === null) || `answer ${/Verdict/.test(text())} appt ${lc.appt}`;
});

const WHEELS = CD(9, 18, 32);
await pin('M7d. audit example: 300 mi, leave now, 2h on duty at the receiver → wheels stop Mon Nov 9, 18:32 (the engine)', async () => {
  await loadAnswer({ miles: 300, dwell: 120, dwellOff: false });
  const both = E.planTripAll(allSegments(getState(), WALL).filter((x) => !x.tentative), { departure: WALL, distanceMiles: 300, mph: 55, stops: [{ atMile: 300, minutes: 120, status: 'ON', label: 'Receiver' }], config: NY });
  const best = S.verdictPlan(both);
  return (best.feasible && best.driveEnd === WHEELS && text().includes(`Arrive — wheels stop${clockFull(WHEELS)}`)) || `driveEnd ${clockFull(best.driveEnd)}`;
});

await pin('M7e. appointment Mon 16:00 → "Late by 2h 32m — earliest arrival Mon Nov 9, 18:32", the No look with ✕', async () => {
  await loadAnswer({ miles: 300, dwell: 120, dwellOff: false, appt: CD(9, 16, 0) });
  const sec = all((n) => n.localName === 'section' && cls(n).includes('appt'))[0];
  if (!sec) return 'no appointment line';
  return (sec.textContent.includes('Late by 2h 32m — earliest arrival Mon Nov 9, 18:32') && cls(sec).includes('no') && /Appointment Mon Nov 9, 16:00/.test(sec.textContent)) || sec.textContent;
});

await pin('M7f. appointment Tue 06:00 → "On time — 11h 28m to spare", the Yes look', async () => {
  await loadAnswer({ miles: 300, dwell: 120, dwellOff: false, appt: CD(10, 6, 0) });
  const sec = all((n) => n.localName === 'section' && cls(n).includes('appt'))[0];
  return (sec && sec.textContent.includes('On time — 11h 28m to spare') && cls(sec).includes('yes')) || (sec ? sec.textContent : 'none');
});

await pin('M7g. boundary: an appointment exactly at wheels-stop reads "On time — 0m to spare"; one minute earlier is late by 1m', async () => {
  await loadAnswer({ miles: 300, dwell: 120, dwellOff: false, appt: WHEELS });
  const a = all((n) => n.localName === 'section' && cls(n).includes('appt'))[0]?.textContent ?? '';
  const l1 = A.apptLine(WHEELS - 1, WHEELS).text;
  return (a.includes('On time — 0m to spare') && l1 === 'Late by 1m — earliest arrival Mon Nov 9, 18:32') || `${a} | ${l1}`;
});

await pin('M7h. the appointment answer is set through its own big clock (Pick a time) and lands on the answer', async () => {
  await mount(driving({ tab: 'load', planReturn: 'plan', loadCheck: { ...DEFAULT_LOADCHECK, miles: 300, dwell: 120, answered: false } }));
  await click(/^Next: when you leave/); await click(/^Next: time at the receiver/); await click(/^Next: appointment time/);
  await click(/^Pick a time$/);
  if (currentSheet()?.field !== 'appt') return 'the appointment clock must open';
  // starts on the next whole hour after now + 3h (07:00); +1h ×9 → 16:00
  for (let i = 0; i < 9; i++) await click(/^\+ 1 hour$/, 10);
  await click(/^Appointment Mon Nov 9, 16:00$/);
  if (getState().loadCheck.appt !== CD(9, 16, 0)) return `appt ${getState().loadCheck.appt}`;
  await click(/^Show me the answer/, 120);
  return text().includes('Late by 2h 32m') || 'answer did not show the appointment line';
});

const lastShared = () => shared[shared.length - 1] ?? '';
await pin('M7i. [Text dispatch] hands the OS share sheet the card\'s plan times, ending "my ELD governs."', async () => {
  setShare('ok');
  await loadAnswer({ miles: 300, dwell: 120, dwellOff: false, appt: CD(10, 6, 0) });
  const n = shared.length;
  await click(/Text dispatch/, 60);
  const t = lastShared();
  if (shared.length !== n + 1) return 'share was not called';
  const want = 'Can take it. Wheels stop Mon Nov 9, 18:32. On time for the Tue Nov 10, 06:00 appointment — 11h 28m to spare. Planning estimate at 55 mph — my ELD governs.';
  return t === want || t;
});

await pin('M7j. the dispatch text never carries a logged row, a place, a mile marker or record/log wording; the "Leave by" clause only with a leave-by time', async () => {
  const t = lastShared();
  const logged = ['21:55', '19:40', '16:25', '15:40', '03:04'];
  if (logged.some((x) => t.includes(x))) return `a logged time leaked: ${t}`;
  if (/\bmi\b|mile|\bMM\b|record|\blog\b|logged/i.test(t)) return `forbidden wording: ${t}`;
  if (/Leave by/.test(t)) return 'no leave-by search result here (null on the standard seed), so no clause';
  const withLatest = A.dispatchText({ latest: CD(9, 17, 32), driveEnd: WHEELS, appt: null, mph: 55 });
  return (withLatest === 'Can take it. Leave by Mon Nov 9, 17:32 at the latest. Wheels stop Mon Nov 9, 18:32. Planning estimate at 55 mph — my ELD governs.' && withLatest.endsWith('my ELD governs.')) || withLatest;
});

await pin('M7k. cancelling the share sheet does NOT fall back to a copy; no share sheet → the clipboard', async () => {
  const c0 = copied.length;
  // The button is found by its row: after a cancel its label says "Couldn’t share" (patch 4).
  const dispatchBtn = () => byClass('dispatch')[0].childNodes[0];
  setShare('abort');
  await click(dispatchBtn(), 60);
  const noCopyOnCancel = copied.length === c0 && /Couldn’t share/.test(dispatchBtn().textContent);
  setShare('none');
  await click(dispatchBtn(), 60);
  const copiedWithout = copied.length === c0 + 1 && copied[copied.length - 1].endsWith('my ELD governs.') && /Copied ✓/.test(text());
  setShare('ok');
  return (noCopyOnCancel && copiedWithout) || `cancel→copy ${!noCopyOnCancel} none→copy ${copiedWithout}`;
});

await pin('M7l. appt sanitize/parse: a bad value falls back to none on a damaged save; a good one survives a reload and an import; a pre-C3 draft has no key', async () => {
  const P = (lc) => S.parseSaved(JSON.stringify({ ...INIT, loadCheck: lc })).loadCheck;
  const good = CD(10, 6, 0);
  const cases = [
    [P({ ...DEFAULT_LOADCHECK, appt: 'tomorrow' }).appt ?? null, null],
    [P({ ...DEFAULT_LOADCHECK, appt: 1e300 }).appt ?? null, null],
    [P({ ...DEFAULT_LOADCHECK, appt: 12.5 }).appt ?? null, null],
    [P({ ...DEFAULT_LOADCHECK, appt: null }).appt, null],
    [P({ ...DEFAULT_LOADCHECK, appt: good }).appt, good],
    ['appt' in P({ ...DEFAULT_LOADCHECK }), false],
    [S.applyImportedState(getState(), { segments: [], loadCheck: { ...DEFAULT_LOADCHECK, appt: good } }).loadCheck.appt, good],
    [S.draftResets({ loadCheck: { ...DEFAULT_LOADCHECK, appt: 'x' } }, getState()).length, 1],
    [S.draftResets({ loadCheck: { ...DEFAULT_LOADCHECK, appt: good } }, getState()).length, 0],
  ];
  const bad = cases.findIndex(([a, b]) => a !== b);
  return bad < 0 || `case ${bad}: ${JSON.stringify(cases[bad])}`;
});

/* =================================== M4: the load fix =================================== */

await pin('M4a. loadFixFor: leave-now and an off-duty wait get "Plan it: leave at …" at now + wait + fix; an on-duty wait or a fix past 24h gets none', async () => {
  const T = CD(9, 3, 4);
  const a = A.loadFixFor({ ...DEFAULT_LOADCHECK, leaveIn: 0 }, T, { minutes: 150 });
  const b = A.loadFixFor({ ...DEFAULT_LOADCHECK, leaveIn: 60, waitOff: true }, T, { minutes: 30 });
  const c = A.loadFixFor({ ...DEFAULT_LOADCHECK, leaveIn: 60, waitOff: false }, T, { minutes: 30 });
  const d = A.loadFixFor({ ...DEFAULT_LOADCHECK, leaveIn: 1400, waitOff: true }, T, { minutes: 60 });
  const e = A.loadFixFor({ ...DEFAULT_LOADCHECK }, T, null);
  return (a?.leaveIn === 150 && a.label === 'Plan it: leave at Mon 05:34' && b?.leaveIn === 90 && b.label === 'Plan it: leave at Mon 04:34' && c === null && d === null && e === null) || JSON.stringify([a, b, c, d, e]);
});

await pin('M4b. the tap\'s draft is the fix line\'s input: after it, the Load screen\'s own verdict is Yes and its arrival EQUALS what smallestRestFix promised (two independent calls)', async () => {
  // The shipped planner rests its way to legal, so a real No-with-fix does not occur (0 of 4,000
  // random records, proof/scratch/probe); the fix search is run here on the standard-seed load
  // directly — the same call the No branch makes — and the tap's draft patch is applied through
  // the real replaceLoadDraft. The verdict on screen is then planTripAll's, from LoadTab.
  await loadAnswer({ miles: 900, dwell: 120, dwellOff: false });
  const segs = allSegments(getState(), WALL).filter((x) => !x.tentative);
  const input = { departure: WALL, distanceMiles: 900, mph: 55, stops: [{ atMile: 900, minutes: 120, status: 'ON', label: 'Receiver' }], config: NY };
  const fix = S.smallestRestFix(segs, input);
  if (!fix) return 'no fix computed';
  const f = A.loadFixFor(getState().loadCheck, WALL, fix);
  A.replaceLoadDraft({ leaveIn: f.leaveIn, waitOff: true }); await sleep(120);
  const promised = fix.plan.arrival > fix.plan.driveEnd ? `Unloaded by ${clockFull(fix.plan.arrival)}` : `There by ${clockFull(fix.plan.driveEnd)}`;
  return (/Yes, it’s legal/.test(text()) && text().includes(promised)) || `promised ${promised}; screen ${text().slice(0, 200)}`;
});

await pin('M4c. the fix is a DRAFT edit: the record is untouched, "Load plan changed." offers Undo, and Undo restores the draft it replaced', async () => {
  await loadAnswer({ miles: 900, dwell: 120, dwellOff: false, leaveIn: 0, waitOff: false });
  const before = JSON.stringify(getState().loadCheck);
  const rec = JSON.stringify([getState().segments, getState().tentative, getState().current]);
  A.replaceLoadDraft({ leaveIn: 45, waitOff: true }); await sleep(80);
  if (JSON.stringify([getState().segments, getState().tentative, getState().current]) !== rec) return 'the record changed';
  if (!/Load plan changed\./.test(text())) return 'no draft undo offered';
  await click(/^Undo$/, 80);
  return (JSON.stringify(getState().loadCheck) === before && !/Load plan changed\./.test(text())) || `after undo ${JSON.stringify(getState().loadCheck)}`;
});

await pin('M4d. one level, shared with the Split Lab: a later load edit retires the offer; a Split replace takes the slot; a load fix takes it back', async () => {
  await loadAnswer({ miles: 900, dwell: 120 });
  A.replaceLoadDraft({ leaveIn: 45, waitOff: true });
  A.editLoadDraft({ miles: 950 });
  const retired = !A.loadDraftUndoPending();
  A.replaceLoadDraft({ leaveIn: 60, waitOff: true });
  A.replaceSplitDraft({ ...DEFAULT_SPLIT, b1: 200 });
  const splitOwns = A.splitDraftUndoPending() && !A.loadDraftUndoPending();
  A.replaceLoadDraft({ leaveIn: 75, waitOff: true });
  const loadOwns = A.loadDraftUndoPending() && !A.splitDraftUndoPending();
  A.clearLoadDraftUndo();
  return (retired && splitOwns && loadOwns) || JSON.stringify({ retired, splitOwns, loadOwns });
});

await pin('M4e. the button rides the No verdict\'s fix line, says "Plan it", and its tap is the draft replace (source)', async () => {
  const app = readFileSync('src/app.tsx', 'utf8');
  const ok = /\{!best\.feasible && loadFix && <button class="primary wide fixit" onClick=\{\(\) => replaceLoadDraft\(\{ leaveIn: loadFix\.leaveIn, waitOff: true \}\)\}>\{loadFix\.label\}<\/button>\}/.test(app)
    && /const loadFix = step === 4 && !best\.feasible \? loadFixFor\(lc, now, advice\?\.fix \?\? null\) : null;/.test(app)
    && !/Fix my log/.test(app);
  return ok || 'the No branch must render the Plan it button from loadFixFor and tap replaceLoadDraft';
});

/* ============================ D10-A + M8: Hours coming back ============================ */

await pin('D10a. the Plan hub lists 4 items; the 4th, "Hours coming back", opens tab recap with planReturn plan', async () => {
  WALL = CD(9, 3, 4);
  await mount(driving({ tab: 'plan' }));
  const items = byClass('plan-item');
  if (items.length !== 4) return `${items.length} items`;
  const fourth = items[3];
  if (!/Hours coming back/.test(fourth.textContent) || !/When your 70-hour hours return, day by day\./.test(fourth.textContent)) return fourth.textContent;
  await click(fourth, 80);
  return (getState().tab === 'recap' && getState().planReturn === 'plan') || `${getState().tab}/${getState().planReturn}`;
});

await pin('D10b. Hours coming back sits under Plan in the tab bar (navOf), title + back to Plan; History too', async () => {
  const cur = () => all((n) => n.localName === 'button' && n.attributes['aria-current'] === 'page')[0]?.textContent.trim();
  const onRecap = cur();
  const title = all((n) => n.localName === 'h1')[0]?.textContent;
  const back = all((n) => n.localName === 'button' && cls(n).includes('back'))[0]?.textContent.trim();
  setState({ tab: 'history', planReturn: 'recap' }); await sleep(60);
  const onHist = cur();
  setState({ tab: 'recap', planReturn: 'plan' }); await sleep(40);
  return (onRecap === 'Plan' && onHist === 'Plan' && title === 'Hours coming back' && back === 'Plan') || JSON.stringify({ onRecap, onHist, title, back });
});

await pin('D10c. the phone\'s Back from Hours coming back lands on Plan (History\'s still lands on Now)', async () => {
  const mkH = () => { const hh = { entries: [{ state: null }], i: 0, get state() { return this.entries[this.i].state; }, pushState(d) { this.entries.length = this.i + 1; this.entries.push({ state: d }); this.i++; }, replaceState(d) { this.entries[this.i] = { state: d }; }, go(n) { this.i += n; } }; return hh; };
  const run = (tab0) => {
    const hh = mkH(); let tab = 'now', sheet = false;
    const nav2 = BN.createBackNav(hh, () => ({ tab, sheet }), { closeSheet() { sheet = false; }, goTo(t) { tab = t; } });
    tab = tab0; nav2.sync();
    hh.i -= 1; nav2.onPop(); // the driver presses Back
    return tab;
  };
  const r = run('recap'), hst = run('history');
  return (r === 'plan' && hst === 'now') || `recap→${r} history→${hst}`;
});

await pin('D10d. V3: the one sentence reads "70 hours: 0m left · +10h 00m back at 23:00 (midnight Eastern)"', async () => {
  WALL = CD(9, 6, 0);
  await mount(mk({ segments: v3(), current: { status: 'ON', since: CD(9, 5) }, tab: 'recap', planReturn: 'plan', drivingView: false }));
  const p = byClass('hours-back')[0]?.textContent;
  // Oracle, independent of the engine's forecast: the next 00:00 on the New York clock after now,
  // read on the phone's clock (time only when it is today, else with the weekday).
  let roll = WALL + 1;
  const nyHM = (m) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(m * 60000));
  while (nyHM(roll) !== '00:00') roll++;
  const sameDay = new Date(roll * 60000).toDateString() === new Date(WALL * 60000).toDateString();
  const want = `70 hours: 0m left · +10h 00m back at ${clock(roll, !sameDay)} (midnight Eastern)`;
  const chicago = new Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/Chicago';
  if (chicago && want !== '70 hours: 0m left · +10h 00m back at 23:00 (midnight Eastern)') return `oracle drifted from the audit: ${want}`;
  return p === want || `${p} | want ${want}`;
});

await pin('D10e. the week strip: 8 bars, one per carrier day, labelled by day ("Mon", "Sun", "2 days ago"…), never "D-3"', async () => {
  const bars = byClass('wk-day');
  const labels = bars.map((b) => byClass('wk-label', b)[0]?.textContent);
  const days = E.evaluate(allSegments(getState(), WALL), { asOf: WALL, config: getState().config }).cycle.days;
  const want = days.map((d, i) => A.weekLabel(d.label, days.length - 1 - i));
  return (bars.length === 8 && JSON.stringify(labels) === JSON.stringify(want) && labels[7] === 'Mon' && labels[6] === 'Sun' && labels[5] === '2 days ago' && !labels.some((l) => /D-\d/.test(l))) || JSON.stringify(labels);
});

await pin('D10f. the strip\'s hatched minutes equal ev.cycle.forecast[0].dropsOff (one source), on the oldest day only', async () => {
  const ev = E.evaluate(allSegments(getState(), WALL), { asOf: WALL, config: getState().config });
  const hatches = byClass('wk-hatch');
  const bars = byClass('wk-day');
  const onOldest = hatches.length === 1 && byClass('wk-hatch', bars[0]).length === 1;
  return (onOldest && Number(hatches[0].attributes['data-drops']) === ev.cycle.forecast[0].dropsOff && ev.cycle.forecast[0].dropsOff === 600) || `hatches ${hatches.length} drops ${hatches[0]?.attributes['data-drops']} vs ${ev.cycle.forecast[0].dropsOff}`;
});

await pin('D10g. tapping a bar opens that day in History (back returns to Hours coming back); History\'s footer is unchanged', async () => {
  const bars = byClass('wk-day');
  const ev = E.evaluate(allSegments(getState(), WALL), { asOf: WALL, config: getState().config });
  const target = ev.cycle.days[5].start;
  await click(bars[5], 80);
  const focus = byClass('hist-focus')[0];
  const want = S.historyDays(getState(), WALL).find((d) => d.start === target);
  const foot = 'For your own review — your ELD holds the official record. Planned (what-if) time isn\'t shown here; only what you logged.';
  return (getState().tab === 'history' && getState().planReturn === 'recap' && focus && want && focus.textContent.startsWith(want.label) && text().includes(foot)) || `${getState().tab} ${focus ? focus.textContent.slice(0, 40) : 'no focus'} want ${want?.label}`;
});

await pin('D10h. the screen keeps the forecast list, "Fix a day" (the day editor) and the Load + History doors, in that order', async () => {
  setState({ tab: 'recap', planReturn: 'plan' }); await sleep(60);
  const t = text();
  const at = (s) => t.indexOf(s);
  const order = [at('Hours coming back'), at('On duty, day by day'), at('+10h 00m drops'), at('Fix a day'), at('Can I take this load?'), at('Your last 8 days')];
  return (order.every((x) => x >= 0) && order.every((x, i) => i === 0 || x > order[i - 1]) && buttons(/^(set|edit)$/).length > 0) || JSON.stringify(order);
});

await pin('D10i. More: the Recap row is gone; one plain row "Hours coming back has moved to Plan ›" goes there', async () => {
  setState({ tab: 'settings' }); await sleep(60);
  if (/Hours coming back, day by day/.test(text())) return 'the old Recap row is still there';
  const b = button(/^Hours coming back has moved to Plan ›$/);
  if (!b) return 'no pointer row';
  await click(b, 60);
  return (getState().tab === 'recap') || getState().tab;
});

await pin('D10j. RestHero points to the new place: "See Hours coming back under Plan"', async () => {
  const app = readFileSync('src/app.tsx', 'utf8');
  return (/See <b>Hours coming back<\/b> under <b>Plan<\/b> for when your \{cycleWord\} hours return\./.test(app) && !/See <b>Recap<\/b>/.test(app)) || 'RestHero still points at Recap';
});

/* =================================== M5: welcome back =================================== */

const chip = () => byClass('welcome')[0] ?? null;
await pin('M5a. trigger 1 — Driving and out of driving time ≥ 30 min (the engine\'s violations): on open, "Still Driving? Since 21:55 — …"', async () => {
  WALL = CD(9, 6, 10); // the 14 ended 05:40: 30 minutes over
  await mount(driving());
  const c = chip();
  return (c && /^Still Driving\? Since 21:55 — 8h 15m\./.test(c.textContent) && /Yes, still driving/.test(c.textContent) && /I stopped at…/.test(c.textContent)) || (c ? c.textContent : 'no chip');
});

await pin('M5b. negative: 29 minutes over → no chip; a normal 5h driving run (time left) → no chip', async () => {
  WALL = CD(9, 6, 9);
  await mount(driving());
  const at29 = chip();
  WALL = CD(9, 3, 4);
  await mount(mk({ segments: [{ status: 'OFF', start: CD(8, 12), end: CD(8, 22, 4) }], current: { status: 'D', since: CD(8, 22, 4) }, tab: 'now', drivingView: false }));
  const fiveH = chip();
  return (!at29 && !fiveH) || `29m ${!!at29} 5h ${!!fiveH}`;
});

await pin('M5c. trigger 2 — On duty more than 16h in a row (now − currentRunStart): chip; exactly 16h → none', async () => {
  WALL = CD(9, 12, 0);
  const onRun = (h, m) => mk({ segments: [{ status: 'OFF', start: CD(8, 0), end: CD(9, 12) - (h * 60 + m) }], current: { status: 'ON', since: CD(9, 12) - (h * 60 + m) }, tab: 'now' });
  await mount(onRun(16, 0));
  const at16 = chip();
  await mount(onRun(16, 1));
  const over = chip();
  return (!at16 && over && /^Still On Duty\? Since 19:59 — 16h 01m\./.test(over.textContent) && /Yes, still on duty/.test(over.textContent)) || `16h ${!!at16} 16h01 ${over ? over.textContent : 'none'}`;
});

await pin('M5d. never in the driving view: status Driving with the big view up shows no chip', async () => {
  WALL = CD(9, 6, 30);
  await mount(driving({ drivingView: true }));
  return (byClass('drive-num').length > 0 || /I've stopped|I’ve stopped/.test(text())) && !chip() ? true : `driving view ${byClass('drive-num').length} chip ${!!chip()}`;
});

await pin('M5e. the store is unchanged until a tap: mounting with the chip up writes nothing; "Yes" dismisses it for this run, also on the next return', async () => {
  WALL = CD(9, 6, 30);
  await mount(driving());
  if (!chip()) return 'no chip';
  const before = stored(); const st = JSON.stringify(getState());
  await sleep(100);
  if (stored() !== before || JSON.stringify(getState()) !== st) return 'something was written before any tap';
  await click(/^Yes, still driving$/, 60);
  if (chip()) return 'Yes must dismiss it';
  await hidden(); await visible();
  if (chip()) return 'dismissed for this run — the next return must not raise it again';
  return (stored() === before) || 'Yes must not write';
});

await pin('M5f. [I stopped at…] opens the status panel with its "N min ago" keys; a status tap there ends the run and the chip with it', async () => {
  WALL = CD(9, 6, 30);
  await mount(driving());
  await click(/^I stopped at…$/, 60);
  if (currentSheet()?.kind !== 'status' || !buttons(/min ago$/).length) return 'the status panel with its minutes-ago keys must open';
  await click(/^15 min ago$/, 20);
  const offB = byClass('big-status')[0].childNodes.find((n) => n.textContent === 'Off Duty');
  await click(offB, 120);
  return (getState().current?.status === 'OFF' && getState().current.since === CD(9, 6, 15) && !chip()) || `${JSON.stringify(getState().current)} chip ${!!chip()}`;
});

await pin('M5g. on return to the foreground the check runs again: a run that went over while hidden raises the chip then', async () => {
  WALL = CD(9, 5, 0);
  await mount(driving());
  if (chip()) return 'not over yet: no chip';
  await hidden();
  WALL = CD(9, 6, 20);
  await visible();
  return !!chip() || 'no chip after the return';
});

await pin('M5h. never under a simulated clock, and never in a preview', async () => {
  WALL = CD(9, 6, 30);
  await mount(driving({ nowOverride: CD(9, 6, 30) }));
  const sim = chip();
  // a parked driver on duty > 16h previewing: the chip hides while the preview is up
  WALL = CD(9, 12, 0);
  await mount(mk({ segments: [{ status: 'OFF', start: CD(8, 0), end: CD(8, 19) }], current: { status: 'ON', since: CD(8, 19) }, tab: 'now' }));
  const up = !!chip();
  await click(/^Preview a later time$/, 60);
  const inPreview = !!chip();
  return (!sim && up && !inPreview) || JSON.stringify({ sim: !!sim, up, inPreview });
});

/* =================================== M13: haptics =================================== */

await pin('M13a. the pattern table, exactly; alertTick\'s marks unchanged', async () => {
  const P = AL.HAPTIC_PATTERNS;
  const want = { status: [20], 60: [60, 80, 60], 30: [60, 80, 60, 80, 60], 15: [200, 100, 60, 100, 60], 0: [400, 120, 80, 120, 400] };
  const sameTable = JSON.stringify(Object.keys(want).map((k) => [k, P[k]])) === JSON.stringify(Object.keys(want).map((k) => [k, want[k]]));
  const marks = JSON.stringify([...AL.ALERT_MARKS]) === '[60,30,15,0]' && AL.REPEAT_AT_ZERO === 15;
  const map = [60, 30, 15, 0, -15].map((m) => JSON.stringify(AL.hapticForMark(m))).join(' ');
  return (sameTable && marks && map === '[60,80,60] [60,80,60,80,60] [200,100,60,100,60] [400,120,80,120,400] [400,120,80,120,400]') || `${sameTable} ${marks} ${map}`;
});

await pin('M13b. a fired mark vibrates its own pattern (also when it waited for the first tap); "Test alert" plays the 60 pattern', async () => {
  class FakeAC { constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; } resume() { this.state = 'running'; return Promise.resolve(); } createOscillator() { return { type: '', frequency: {}, connect: (g) => g, start() {}, stop() {} }; } createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (d) => d }; } }
  AL.audioForTest.reset(); vib.length = 0;
  AL.sound(false, 30); AL.sound(true, 15); // before any tap: waits, the more urgent mark wins
  globalThis.AudioContext = FakeAC; AL.unlockAudio();
  const waited = vib.slice();
  vib.length = 0; AL.sound(true, 0); const zero = vib.slice();
  vib.length = 0; AL.sound(false, 60); const sixty = vib.slice();
  await mount(driving({ tab: 'settings' }));
  vib.length = 0; await click(/^Test alert$/, 40); const test = vib.filter((x) => x !== '12');
  delete globalThis.AudioContext; AL.audioForTest.reset();
  return (JSON.stringify(waited) === '["[200,100,60,100,60]"]' && JSON.stringify(zero) === '["[400,120,80,120,400]"]' && JSON.stringify(sixty) === '["[60,80,60]"]' && JSON.stringify(test) === '["[60,80,60]"]') || JSON.stringify({ waited, zero, sixty, test });
});

await pin('M13c. the driving app crossing 60 min left sounds the 60 pattern through useDrivingAlerts (real clock, alerts on)', async () => {
  class FakeAC { constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; } resume() { return Promise.resolve(); } createOscillator() { return { type: '', frequency: {}, connect: (g) => g, start() {}, stop() {} }; } createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (d) => d }; } }
  globalThis.AudioContext = FakeAC; AL.audioForTest.reset(); AL.unlockAudio();
  WALL = CD(9, 4, 39); // 61 min left (the 14 ends 05:40)
  await mount(driving({ drivingView: true }));
  vib.length = 0;
  WALL = CD(9, 4, 40); await sleep(120); // crosses 60
  const got = vib.slice();
  delete globalThis.AudioContext; AL.audioForTest.reset();
  return JSON.stringify(got) === '["[60,80,60]"]' || JSON.stringify(got);
});

await pin('M13d. a dock key that changes the status buzzes [20] INSTEAD of the 12ms tick; alerts off or no change → the plain tick', async () => {
  WALL = CD(9, 3, 4);
  await mount(mk({ segments: [...seedSegs, { status: 'D', start: CD(8, 21, 55), end: WALL }], current: { status: 'ON', since: WALL }, tab: 'now' }));
  const dockKey = (label) => withClosest(byClass('status-buttons')[0].childNodes.find((b) => b.textContent.includes(label)));
  vib.length = 0;
  let b = dockKey('Off Duty'); docTap(b); fire(b, 'click'); await sleep(60);
  const change = vib.slice();
  vib.length = 0;
  b = dockKey('Off Duty'); docTap(b); fire(b, 'click'); await sleep(60);
  const same = vib.slice();
  A.undoLast(); await sleep(40);
  setState({ alertsOn: false }); await sleep(40);
  vib.length = 0;
  b = dockKey('Sleeper'); docTap(b); fire(b, 'click'); await sleep(60);
  const off = vib.slice();
  // any other button keeps its 12ms tick
  vib.length = 0; const other = withClosest(button(/^Fix the start time|Off Duty since|Sleeper since/) ?? byClass('rowbtn')[0]); docTap(other); const plain = vib.slice();
  setState({ alertsOn: true });
  return (JSON.stringify(change) === '["[20]"]' && JSON.stringify(same) === '["12"]' && JSON.stringify(off) === '["12"]' && JSON.stringify(plain) === '["12"]') || JSON.stringify({ change, same, off, plain });
});

await pin('M13e. no vibrate API (iPhone): a dock tap and an alert no-op without throwing; no Split Lab haptics in source', async () => {
  const saved = nav.vibrate; delete nav.vibrate;
  let threw = null;
  try { AL.statusHaptic(true, true); AL.buzz(true, 0); AL.tapTick(); } catch (e) { threw = e; }
  nav.vibrate = saved;
  const app = readFileSync('src/app.tsx', 'utf8');
  const split = app.slice(app.indexOf('function SplitTab'), app.indexOf('/* ============================================================ Recap tab */'));
  return (!threw && !/vibrate|statusHaptic|HAPTIC|buzz\(/.test(split)) || `threw ${threw} / split haptics present`;
});

/* =================================== M14: shortcuts =================================== */

await pin('M14a. manifest: identity fields byte-identical to C2; three shortcuts (load, I\'ve stopped, Hours coming back) on the 192px icon', async () => {
  const m = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  const id = JSON.stringify([m.name, m.short_name, m.description, m.start_url, m.scope, m.display, m.orientation, m.background_color, m.theme_color, m.icons]);
  const want = JSON.stringify(['Split Decision — HOS What-If Planner', 'Split Decision', 'Split-sleeper, recap and trip planning scratchpad for truck drivers. Not an ELD.', './', './', 'standalone', 'portrait', '#090c10', '#090c10',
    [{ src: './icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }, { src: './icon-192.png', sizes: '192x192', type: 'image/png' }, { src: './icon-512.png', sizes: '512x512', type: 'image/png' }, { src: './icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]]);
  const sc = (m.shortcuts || []).map((x) => [x.name, x.url, x.icons?.[0]?.src]);
  const wantSc = [['Can I take this load?', './?go=load', './icon-192.png'], ["I've stopped", './?go=stopped', './icon-192.png'], ['Hours coming back', './?go=recap', './icon-192.png']];
  return (id === want && JSON.stringify(sc) === JSON.stringify(wantSc)) || `${id === want} ${JSON.stringify(sc)}`;
});

await pin('M14b. each go value lands on its screen: load → the load question, recap → Hours coming back (both returning to Now), stopped → the status panel', async () => {
  WALL = CD(9, 3, 4);
  const land = async (q) => { await mount(driving({ tab: 'log', planReturn: 'plan', drivingView: false }), q); return [getState().tab, getState().planReturn, currentSheet()?.kind ?? null]; };
  const a = await land('?go=load'), b = await land('?go=recap'), c = await land('?go=stopped');
  const ok = JSON.stringify(a) === '["load","now",null]' && JSON.stringify(b) === '["recap","now",null]' && c[2] === 'status' && /What are you doing now\?/.test(text());
  return ok || JSON.stringify([a, b, c]);
});

await pin('M14c. an unknown go lands on Now; no go changes nothing', async () => {
  const a = await (async () => { await mount(driving({ tab: 'log', drivingView: false }), '?go=bogus'); return getState().tab; })();
  const b = await (async () => { await mount(driving({ tab: 'log', drivingView: false }), ''); return getState().tab; })();
  return (a === 'now' && b === 'log') || `${a} ${b}`;
});

await pin('M14d. the address is cleaned with replaceState(history.state, \'\', \'./\') — the existing state object, so the back-nav marker survives', async () => {
  const marker = { app: 'hos-sandbox', layer: 'tab', depth: 1 };
  history.state = marker; replaced.length = 0;
  render(null, root); await sleep(20); globalThis.location = { search: '?go=load' };
  render(h(App, {}), root); await sleep(120);
  const first = replaced[0];
  return (first && first[0] === marker && first[1] === '' && first[2] === './') || JSON.stringify(replaced.slice(0, 2));
});

await pin('M14e. go=stopped while the launch disclaimer is up waits behind it: the disclaimer shows first, the panel after it closes', async () => {
  render(null, root); await sleep(20); openSheet(null);
  setState(driving({ tab: 'now', drivingView: false })); setLaunchNotice(true);
  globalThis.location = { search: '?go=stopped' };
  render(h(App, {}), root); await sleep(120);
  const disclaimerFirst = /I understand/.test(text()) && !/What are you doing now\?/.test(text());
  await click(/I understand/, 120);
  const after = /What are you doing now\?/.test(text());
  setLaunchNotice(false); openSheet(null);
  return (disclaimerFirst && after) || JSON.stringify({ disclaimerFirst, after });
});

await pin('M14f. offline: the service worker still falls back to index.html on a miss, and its cache prefix is unchanged', async () => {
  const sw = readFileSync('public/sw.js', 'utf8');
  return (/caches\.match\('\.\/index\.html'\)/.test(sw) && /const CACHE = 'hos-sandbox-' \+/.test(sw)) || 'sw.js fallback / prefix changed';
});

render(null, root);
let fails = 0;
for (const [r, n, info] of res) { if (r === 'FAIL') fails++; console.log(`${r} ${n}${info ? ' — ' + info : ''}`); }
console.log(`\n${res.length - fails} pass, ${fails} fail`);
console.log(fails ? 'C3 LANE FAILED' : 'C3 OK');
process.exit(fails ? 1 : 0);

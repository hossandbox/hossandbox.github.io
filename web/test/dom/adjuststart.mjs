// Patch 19, Part A — "Adjust current status start": the pin lane.
// Field report: a driver went On Duty on his ELD at arrival, forgot the app, and tapped On
// Duty in the app ~7 minutes late. Two gaps: (1) the CURRENT status's start could not be
// edited after the fact; (2) the status panel's "started earlier" offered 0/5/15/30 only.
//
// The real App is mounted in the minimal DOM (domshim) with a controlled wall clock, so the
// two doors are driven through their own controls: typed boxes, real button listeners.
// Every pin reports on its own line (a soft collector, not first-throw), so one run on the
// untouched base shows every pin red. Exit 1 when any pin fails.
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
let Tms = new Date(2026, 10, 10, 14, 14, 5).getTime(); // local wall time: Tue Nov 10 2026, 14:14
Date.now = () => Tms;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); }; globalThis.__BUILD__ = 'p19';
const spoken = [];
globalThis.speechSynthesis = { cancel() {}, speak(u) { spoken.push(u.text); }, getVoices: () => [] };
globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
const { render, h } = await import('preact');
const { readFileSync } = await import('node:fs');
const A = await import('../../src/app.tsx');
const S = await import('../../src/store.ts');
const E = await import('../../../engine/src/index.ts');
const { App, tapStatus, setLaunchNotice, openSheet, currentSheet, undoLast, currentUndo, startOffsets } = A;
const { setState, getState, deviceTz, allSegments, clock, parseSaved } = S;
setLaunchNotice?.(false);
const sleep = (ms) => new Promise((r) => rawSetTimeout(r, ms));
const res = [];
const pin = async (name, f) => { try { const r = await f(); res.push([r === true ? 'PASS' : 'FAIL', name, r === true ? '' : String(r)]); } catch (e) { res.push(['FAIL', name, 'threw: ' + (e && e.message || e)]); } };
const root = document.createElement('div'); document.body.appendChild(root);
const T = Math.floor(Tms / 60000);             // "now", epoch minutes
const text = () => root.textContent;
const base = () => ({ tentative: [], drivingView: true, zoneAck: null, seededAt: null, dayCloses: [], historyAcknowledged: true, theme: 'day', themeChosen: true, darkDriveAtNight: true, disclaimerAcked: true, tzChosen: true, alertsOn: false, speakAlerts: false, speechAsked: true, speakAskOpen: false, nowOverride: null, tab: 'now', nowCard: 'dial', nowCardAsked: true, config: { ...getState().config, timeZone: deviceTz } });
// The field day: off duty 10h, driving 4h40m, then On Duty tapped at T-20 (the ELD says T-27).
const fieldDay = () => ({
  segments: [{ status: 'OFF', start: T - 900, end: T - 300, createdAt: 1 }, { status: 'D', start: T - 300, end: T - 20, createdAt: 2 }],
  current: { status: 'ON', since: T - 20, createdAt: 3 },
});
const seed = async (rec) => { openSheet(null); setState({ ...base(), ...rec }); await sleep(60); };
const plain = (s) => JSON.stringify({ segments: s.segments.map((x) => [x.status, x.start, x.end, x.note ?? null]), current: s.current && [s.current.status, s.current.since, s.current.note ?? null] });
const evalOf = (segs, cfg) => E.evaluate(segs, { asOf: T, config: cfg });
// DOM helpers
const all = (pred) => { const out = []; const w = (n) => { if (pred(n)) out.push(n); n.childNodes.forEach(w); }; w(root); return out; };
const fire = (node, type, extra = {}) => { for (const t of [type, type[0].toUpperCase() + type.slice(1)]) { const ev = { type: t, target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...extra }; for (const f of node.listeners[t] ?? []) f.call(node, ev); } };
const disabled = (n) => n.attributes.disabled !== undefined && n.attributes.disabled !== 'false';
const button = (re) => all((n) => n.localName === 'button' && re.test(n.textContent))[0];
const click = async (re) => { const b = button(re); if (!b) throw new Error('no button ' + re); if (!disabled(b)) fire(b, 'click'); await sleep(50); return b; };
const input = (label) => all((n) => n.localName === 'input' && n.attributes['aria-label'] === label)[0];
const type = async (label, value) => { const i = input(label); if (!i) throw new Error('no input ' + label); i.value = value; fire(i, 'input'); await sleep(50); return i; };
const sheetStatus = (label) => all((n) => n.localName === 'button' && n.parentNode?.attributes?.class === 'big-status' && n.textContent.includes(label))[0];
const hhmm = (min) => { const d = new Date(min * 60000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

render(h(App, {}), root); await sleep(120);

/* ---------------- the store operation ---------------- */
await pin('A1. earlier by 7: the status being left shrinks by exactly 7, current.since moves exactly 7, nothing else moves', async () => {
  await seed(fieldDay()); const s0 = getState();
  const r = S.adjustCurrentStart(s0, T - 27, T);
  if (!r.ok) return 'refused: ' + r.problem;
  const [off, d] = r.patch.segments;
  if (off !== s0.segments[0]) return 'the untouched row must keep its reference';
  if (d.start !== T - 300 || d.end !== T - 27 || (d.end - d.start) !== (s0.segments[1].end - s0.segments[1].start) - 7) return `driving row is ${d.start - T}..${d.end - T}`;
  if (r.patch.current.since !== T - 27 || r.patch.current.status !== 'ON' || r.patch.current.createdAt !== 3) return 'current: ' + JSON.stringify(r.patch.current);
  if (getState() !== s0) return 'a pure operation must not write';
  return true;
});
await pin('A2. earlier by 7: the clocks re-evaluate — 7 minutes of driving come back, matching a hand-built record', async () => {
  await seed(fieldDay()); const s0 = getState();
  const before = evalOf(allSegments(s0, T), s0.config);
  const e = A.adjustStartNow(T - 27); if (e) return 'refused: ' + e;
  const s1 = getState(); const after = evalOf(allSegments(s1, T), s1.config);
  const oracle = evalOf([{ status: 'OFF', start: T - 900, end: T - 300 }, { status: 'D', start: T - 300, end: T - 27 }, { status: 'ON', start: T - 27, end: T }], s1.config);
  const drove = (ev) => E.LIMITS.DRIVE - ev.shift.driveRemaining;
  if (after.driveNow !== oracle.driveNow || after.mustStopBy !== oracle.mustStopBy) return `app ${after.driveNow}/${after.mustStopBy} vs oracle ${oracle.driveNow}/${oracle.mustStopBy}`;
  if (drove(before) - drove(after) !== 7) return `driving used went ${drove(before)} → ${drove(after)}`;
  if (after.driveNow - before.driveNow !== 7) return `drive left went ${before.driveNow} → ${after.driveNow}`;
  return true;
});
await pin('A3. later by 7 (within bounds): the inverse — the status being left grows by exactly 7, drive left drops by 7', async () => {
  await seed(fieldDay()); const s0 = getState(); const before = evalOf(allSegments(s0, T), s0.config);
  const e = A.adjustStartNow(T - 13); if (e) return 'refused: ' + e;
  const s1 = getState(); const after = evalOf(allSegments(s1, T), s1.config);
  if (s1.segments[1].end !== T - 13 || s1.segments[1].start !== T - 300 || s1.current.since !== T - 13) return plain(s1);
  if (before.driveNow - after.driveNow !== 7) return `drive left went ${before.driveNow} → ${after.driveNow}`;
  return true;
});
await pin('A4. earlier then later by the same 7 returns the exact starting record', async () => {
  await seed(fieldDay()); const p0 = plain(getState());
  if (A.adjustStartNow(T - 27) || A.adjustStartNow(T - 20)) return 'refused';
  return plain(getState()) === p0 || `${plain(getState())} vs ${p0}`;
});
const refusal = (name, mk, at, want, nowAt = T) => pin(name, async () => {
  await seed(mk()); const s0 = getState(); const saved = mem.get('hos-sandbox-v1');
  const r = S.adjustCurrentStart(s0, at(), nowAt);
  if (r.ok || r.problem !== want) return `store said ${JSON.stringify(r.ok ? 'ok' : r.problem)}, want ${want}`;
  const e = A.adjustStartNow(at());
  if (typeof e !== 'string' || !e.length) return 'the app door must return the reason';
  if (getState() !== s0 || mem.get('hos-sandbox-v1') !== saved) return 'a refusal must change nothing';
  if (currentUndo() && /since \d\d:\d\d$/.test(currentUndo().label) && currentUndo().after.current === getState().current && currentUndo().before.current !== getState().current) return 'a refusal must not take the undo slot';
  return true;
});
await refusal('A5. refused: a future time', fieldDay, () => T + 1, 'future');
await refusal('A6. refused: newSince == now (a current status keeps its start in the past)', fieldDay, () => T, 'future');
await refusal('A7. refused: newSince AT the previous segment\'s start (would erase it)', fieldDay, () => T - 300, 'erase');
await refusal('A8. refused: newSince BEFORE the previous segment\'s start', fieldDay, () => T - 301, 'erase');
await refusal('A9. refused: no current status', () => ({ segments: fieldDay().segments, current: null }), () => T - 27, 'none');
await refusal('A10. refused: the start it already has (no-op)', fieldDay, () => T - 20, 'same');
await refusal('A11. refused: a fractional minute', fieldDay, () => T - 27.5, 'invalid');
await refusal('A12. refused: another logged entry inside the stretch the start would cross', () => ({ segments: [...fieldDay().segments, { status: 'OFF', start: T - 26, end: T - 22, createdAt: 9 }], current: fieldDay().current }), () => T - 27, 'overlap');
await pin('A13. the one-minute edges are allowed: one minute after the previous start, and one minute before now', async () => {
  await seed(fieldDay());
  const a = S.adjustCurrentStart(getState(), T - 299, T), b = S.adjustCurrentStart(getState(), T - 1, T);
  return (a.ok && b.ok && a.patch.segments[1].end - a.patch.segments[1].start === 1 && b.patch.current.since === T - 1) || JSON.stringify([a, b]);
});
await pin('A14. a current status that is the only thing in the record may move to any past time', async () => {
  await seed({ segments: [], current: { status: 'ON', since: T - 20, createdAt: 3 } });
  const r = S.adjustCurrentStart(getState(), T - 5000, T);
  return (r.ok && r.patch.current.since === T - 5000 && r.patch.segments.length === 0) || JSON.stringify(r);
});
await pin('A15. undo restores the exact prior current.since and segments, through the app\'s single undo slot, labelled like a tap', async () => {
  await seed(fieldDay()); const s0 = getState();
  if (A.adjustStartNow(T - 27)) return 'refused';
  const u = currentUndo();
  if (!u || u.label !== `On Duty since ${hhmm(T - 27)}`) return 'label: ' + (u && u.label);
  if (!/^.+ since \d{2}:\d{2}$/.test(u.label)) return 'the label must read like a tap\'s, so the chip above the dock shows it';
  if (!undoLast()) return 'undo refused';
  const s1 = getState();
  return (s1.segments === s0.segments && s1.current === s0.current && plain(s1) === plain(s0) && currentUndo() === null) || plain(s1);
});
await pin('A16. round-trip: a save taken after an adjust loads back with the adjusted since', async () => {
  await seed(fieldDay());
  if (A.adjustStartNow(T - 27)) return 'refused';
  const back = parseSaved(mem.get('hos-sandbox-v1'));
  return (back.current.since === T - 27 && back.current.status === 'ON' && back.segments[1].end === T - 27 && plain(back) === plain(getState())) || plain(back);
});
await pin('A17. the adjust is quarantined under a simulated clock like every other write (patch 15)', async () => {
  await seed(fieldDay()); const p0 = plain(getState());
  setState({ nowOverride: T }); await sleep(30);
  if (A.adjustStartNow(T - 27)) return 'refused under the simulated clock';
  if (getState().current.since !== T - 27) return 'did not land under the simulated clock';
  A.useRealClock(); await sleep(30);
  return (plain(getState()) === p0 && getState().nowOverride === null) || plain(getState());
});
await pin('A18. the adjust never speaks and never opens the speech question (patch 17 untouched)', async () => {
  await seed({ ...fieldDay(), speakAlerts: true, speechAsked: true }); spoken.length = 0;
  if (A.adjustStartNow(T - 27)) return 'refused';
  await seed({ segments: [{ status: 'OFF', start: T - 900, end: T - 300, createdAt: 1 }], current: { status: 'D', since: T - 300, createdAt: 2 }, speakAlerts: false, speechAsked: false, drivingView: false });
  if (A.adjustStartNow(T - 290)) return 'refused (driving)';
  return (spoken.length === 0 && getState().speakAskOpen === false) || JSON.stringify([spoken, getState().speakAskOpen]);
});
await pin('A19. a day-close bookmark written by the same tap moves with the start; undo puts it back', async () => {
  await seed({ segments: [{ status: 'OFF', start: T - 900, end: T - 300, createdAt: 1 }], current: { status: 'ON', since: T - 300, createdAt: 2 } });
  A.endDay(T); const closed = getState();
  if (closed.current.status !== 'OFF' || closed.dayCloses.length !== 1 || closed.dayCloses[0].at !== T) return 'setup: ' + JSON.stringify(closed.dayCloses);
  Tms += 10 * 60000; // ten minutes later, the driver fixes the close to 7 minutes before it was tapped
  const e = A.adjustStartNow(T - 7); Tms -= 10 * 60000;
  if (e) return 'refused: ' + e;
  const s1 = getState();
  if (s1.dayCloses[0].at !== T - 7 || s1.current.since !== T - 7 || !S.dayCloseToday(s1, T + 10)) return JSON.stringify(s1.dayCloses);
  undoLast();
  return getState().dayCloses[0].at === T || JSON.stringify(getState().dayCloses);
});

/* ---------------- the tap-time door (status panel) ---------------- */
const drivingDay = () => ({ segments: [{ status: 'OFF', start: T - 900, end: T - 300, createdAt: 1 }], current: { status: 'D', since: T - 300, createdAt: 2 }, drivingView: false });
await pin('B1. a tap-time custom backdate of 7 lands identically to tap-now-then-adjust', async () => {
  await seed(drivingDay());
  if (tapStatus('ON', undefined, 7) === false) return 'the 7-minute tap was refused';
  const viaTap = plain(getState()); const evTap = evalOf(allSegments(getState(), T), getState().config);
  await seed(drivingDay());
  tapStatus('ON'); if (A.adjustStartNow(T - 7)) return 'adjust refused';
  const viaAdjust = plain(getState()); const evAdj = evalOf(allSegments(getState(), T), getState().config);
  if (viaTap !== viaAdjust) return `${viaTap} vs ${viaAdjust}`;
  if (getState().current.since !== T - 7 || getState().segments[1].end !== T - 7) return viaAdjust;
  return (evTap.driveNow === evAdj.driveNow && evTap.mustStopBy === evAdj.mustStopBy) || 'clocks differ';
});
await pin('B2. the status panel has a typed whole-minutes entry beside the 0/5/15/30 presets, and typing 7 then a status lands 7 back', async () => {
  await seed(drivingDay()); openSheet({ kind: 'status' }); await sleep(60);
  for (const p of ['Now', '5 min ago', '15 min ago', '30 min ago']) if (!button(new RegExp(`^${p}$`))) return 'preset missing: ' + p;
  await type('Started this many minutes ago', '7');
  if (!text().includes(`Starts at ${clock(T - 7)}`)) return 'the panel must show the resulting start';
  fire(sheetStatus('On Duty'), 'click'); await sleep(60);
  const s1 = getState();
  return (s1.current.status === 'ON' && s1.current.since === T - 7 && s1.segments[1].end === T - 7 && currentSheet() === null) || plain(s1);
});
await pin('B3. status panel: decimal minutes ("7.5") are refused — no tap lands, the panel stays, the reason shows', async () => {
  await seed(drivingDay()); const s0 = getState(); openSheet({ kind: 'status' }); await sleep(60);
  await type('Started this many minutes ago', '7.5');
  fire(sheetStatus('On Duty'), 'click'); await sleep(60);
  if (getState() !== s0) return 'a tap landed: ' + plain(getState());
  if (currentSheet()?.kind !== 'status') return 'the panel closed';
  return /Whole minutes only/.test(text()) || 'no reason shown';
});
await pin('B4. status panel: a custom backdate that would erase the status being left is refused (at its start, and past it)', async () => {
  for (const m of ['300', '301', '5000']) {
    await seed(drivingDay()); const s0 = getState(); openSheet({ kind: 'status' }); await sleep(60);
    await type('Started this many minutes ago', m);
    fire(sheetStatus('On Duty'), 'click'); await sleep(60);
    if (getState() !== s0) return `${m} min ago landed: ${plain(getState())}`;
    if (currentSheet()?.kind !== 'status') return `${m}: the panel closed`;
    if (!/would erase it|more than a day back/.test(text())) return `${m}: no reason shown`;
  }
  await seed(drivingDay()); const s0 = getState();
  if (tapStatus('ON', undefined, 300) !== false || tapStatus('ON', undefined, 301) !== false || getState() !== s0) return 'tapStatus itself let an erasing backdate through';
  await seed(drivingDay());
  if (tapStatus('ON', undefined, 299) !== true || getState().current.since !== T - 299) return 'one minute inside the status being left must land';
  return true;
});
await pin('B5. the typed entry cannot bypass the presets\' ok-flags: wherever a preset is greyed out, the same typed value is refused', async () => {
  await seed({ segments: [], current: { status: 'ON', since: T - 15, createdAt: 2 } });
  const flags = startOffsets(getState(), T).map((o) => `${o.minutes}:${o.ok}`).join(' ');
  if (flags !== '0:true 5:true 15:false 30:false') return 'flags: ' + flags;
  for (const o of startOffsets(getState(), T)) {
    const typedOk = A.typedBackdateProblem(getState(), T, String(o.minutes)) === null;
    if (typedOk !== o.ok || A.backdateOk(getState(), T, o.minutes) !== o.ok) return `${o.minutes}: preset ${o.ok}, typed ${typedOk}`;
  }
  if (A.typedBackdateProblem(getState(), T, '14') !== null || A.typedBackdateProblem(getState(), T, '16') === null) return 'the edge is 14 ok / 15+ refused';
  return true;
});
await pin('B6. a preset tap clears the typed entry (the box never silently overrides a preset)', async () => {
  await seed(drivingDay()); openSheet({ kind: 'status' }); await sleep(60);
  await type('Started this many minutes ago', '7.5');
  await click(/^5 min ago$/);
  fire(sheetStatus('On Duty'), 'click'); await sleep(60);
  return (getState().current.status === 'ON' && getState().current.since === T - 5) || plain(getState());
});

/* ---------------- the after-the-fact door (Now) ---------------- */
await pin('C1. Now shows the current status with "Fix the start time", and it opens the editor', async () => {
  await seed(fieldDay());
  const b = button(/Fix the start time/);
  if (!b || !b.textContent.includes(`On Duty since ${clock(T - 20)}`)) return 'row: ' + (b && b.textContent);
  fire(b, 'click'); await sleep(60);
  return (currentSheet()?.kind === 'since' && /When did it really start\?/.test(text())) || 'editor not open';
});
await pin('C2. editor: typing 27 minutes ago (7 earlier) and applying moves the start exactly, and the panel shows the resulting since time', async () => {
  await seed(fieldDay()); openSheet({ kind: 'since' }); await sleep(60);
  await type('Started this many minutes ago', '27');
  const go = button(/^Set start to /);
  if (!go || !go.textContent.includes(clock(T - 27)) || disabled(go)) return 'apply button: ' + (go && go.textContent);
  fire(go, 'click'); await sleep(60);
  const s1 = getState();
  if (s1.current.since !== T - 27 || s1.segments[1].end !== T - 27) return plain(s1);
  // read the PANEL only: Now's own row behind it shows the new time too, and must not vouch for the panel
  const panel = all((n) => n.attributes?.class === 'sheet')[0]?.textContent ?? '';
  return (panel.includes(`On Duty since ${clock(T - 27)}`) && !/When did it really start\?/.test(panel)) || 'the panel does not show the resulting since time: ' + panel;
});
await pin('C3. editor: decimal minutes ("7.5") are refused — the reason shows, apply is disabled, nothing changes', async () => {
  await seed(fieldDay()); const s0 = getState(); openSheet({ kind: 'since' }); await sleep(60);
  await type('Started this many minutes ago', '7.5');
  if (!/Whole minutes only/.test(text())) return 'no reason shown';
  const go = all((n) => n.localName === 'button' && /\bed-go\b/.test(n.attributes.class ?? ''))[0];
  if (!go || !disabled(go)) return 'apply must be disabled';
  fire(go, 'click'); await sleep(60); // even a forced click must not land
  return getState() === s0 || 'state changed: ' + plain(getState());
});
await pin('C4. editor: the exact time-of-day entry sets the start to that minute', async () => {
  await seed(fieldDay()); openSheet({ kind: 'since' }); await sleep(60);
  await type('Exact start time', hhmm(T - 25));
  await click(/^Set start to /);
  return getState().current.since === T - 25 || plain(getState());
});
await pin('C5. editor: refusals show their reason before the button — a future time, and a time that would erase the status being left', async () => {
  await seed(fieldDay()); const s0 = getState(); openSheet({ kind: 'since' }); await sleep(60);
  await type('Exact start time', hhmm(T + 3));
  if (!/not in the past yet/.test(text())) return 'future: no reason';
  let go = all((n) => n.localName === 'button' && /\bed-go\b/.test(n.attributes.class ?? ''))[0];
  if (!disabled(go)) return 'future: apply enabled';
  await type('Started this many minutes ago', '300');
  // Patch L1 item 4b (sanctioned): a start at the status being left's start is no longer a flat
  // refusal. The reason still shows before the button — as the absorb warning naming the entry —
  // and the only way to apply is the one explicit "Absorb and …" confirmation; nothing changes before it.
  if (!/runs into another entry/.test(text()) || !new RegExp(`your Driving ${clock(T - 300)} → ${clock(T - 20)} would be taken in whole`).test(text())) return 'erase: no absorb warning';
  go = all((n) => n.localName === 'button' && /\bed-go\b/.test(n.attributes.class ?? ''))[0];
  if (!go || !/\bed-absorb\b/.test(go.attributes.class ?? '') || !/^Absorb and set start to /.test(go.textContent)) return 'erase: the button must be the absorb confirmation, got ' + (go && go.textContent);
  return getState() === s0 || 'state changed';
});
await pin('C6. the status panel links to the editor for the status the driver is already in', async () => {
  await seed(fieldDay()); openSheet({ kind: 'status' }); await sleep(60);
  await click(/^Still On Duty\? Fix its start time$/);
  return currentSheet()?.kind === 'since' || 'not opened';
});
await pin('C7. yesterday: a status that started yesterday is edited on its own day (day buttons, as the Log editor does)', async () => {
  await seed({ segments: [{ status: 'D', start: T - 1500, end: T - 1200, createdAt: 1 }], current: { status: 'SB', since: T - 1200, createdAt: 2 } });
  openSheet({ kind: 'since' }); await sleep(60);
  const y = button(/^Yesterday$/);
  if (!y || y.attributes['aria-pressed'] !== 'true') return 'the start\'s own day must be the selected day';
  await type('Exact start time', hhmm(T - 1210));
  await click(/^Set start to /);
  return (getState().current.since === T - 1210 && getState().segments[0].end === T - 1210) || plain(getState());
});

/* ---------------- fences ---------------- */
await pin('F1. touch floors (patch 6): every new control rides a class whose rule holds 48px general / 56px primary', async () => {
  const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  const minH = (re) => { const m = css.match(re); const v = m && /min-height: (\d+)px/.exec(m[0]); return v ? +v[1] : 0; };
  const floors = [[/\nbutton \{[^}]*\}/, 48], [/\nbutton\.wide \{[^}]*\}/, 56], [/\ninput\.num \{[^}]*\}/, 56], [/\nbutton\.rowbtn \{[^}]*\}/, 48], [/\n\.ed-keys button \{[^}]*\}/, 56], [/\n\.ed-day input \{[^}]*\}/, 48], [/\n\.ed-days button \{[^}]*\}/, 48]];
  for (const [re, f] of floors) if (minH(re) < f) return `${re} is ${minH(re)}px, floor ${f}`;
  await seed(fieldDay()); openSheet({ kind: 'since' }); await sleep(60);
  const go = all((n) => n.localName === 'button' && /\bed-go\b/.test(n.attributes.class ?? ''))[0];
  if (!go || !/\bprimary\b/.test(go.attributes.class) || !/\bwide\b/.test(go.attributes.class)) return 'the apply button must be a primary wide key';
  for (const label of ['Started this many minutes ago']) if (!/\bnum\b/.test(input(label)?.attributes.class ?? '')) return 'the minutes box must be an input.num';
  if (input('Exact start time')?.parentNode?.attributes?.class !== 'ed-day') return 'the time box must sit in an .ed-day label';
  openSheet({ kind: 'status' }); await sleep(60);
  if (!/\bnum\b/.test(input('Started this many minutes ago')?.attributes.class ?? '')) return 'status panel: the minutes box must be an input.num';
  return true;
});
await pin('F2. copy: the new surfaces carry no officer / inspection / "proof" language and name no person', async () => {
  let copy = '';
  await seed(fieldDay()); copy += text();
  openSheet({ kind: 'since' }); await sleep(60); copy += text();
  await type('Started this many minutes ago', '7.5'); copy += text();
  await type('Started this many minutes ago', '300'); copy += text();
  await type('Started this many minutes ago', '27'); await click(/^Set start to /); copy += text();
  await seed(drivingDay()); openSheet({ kind: 'status' }); await sleep(60); copy += text();
  await type('Started this many minutes ago', '7.5'); copy += text();
  await type('Started this many minutes ago', '300'); copy += text();
  for (const p of ['none', 'same', 'future', 'erase', 'overlap', 'invalid']) copy += ' ' + A.adjustStartProblemText(p, getState(), T);
  const bad = copy.match(/officer|inspect|proof|prove|audit|\bDOT\b|lorico|estrellado/i);
  return !bad || 'found: ' + bad[0];
});
await pin('F3. no new storage keys', async () => {
  const allowed = new Set(['hos-sandbox-v1', 'hos-sandbox-v1-backup', 'hos-sandbox-v1-sim', 'hos-sandbox-undo-v1']);
  const extra = [...mem.keys()].filter((k) => !allowed.has(k));
  return extra.length === 0 || 'extra keys: ' + extra.join(', ');
});

render(null, root);
for (const [k, n, i] of res) console.log(`${k} ${n}${i ? '  — ' + i : ''}`);
const fails = res.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${res.length - fails} pass, ${fails} fail`);
console.log(fails ? 'ADJUSTSTART FAIL' : 'ADJUSTSTART OK');
process.exit(fails ? 1 : 0);

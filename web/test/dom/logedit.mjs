// Patch L1 — "Log-edit fix bundle": the pin lane (driver field notes 2026-11-10/11).
//   1. the CURRENT (open) entry is editable on the Log, with the same panel as any other row;
//   2. tap the displayed time to TYPE it (0641), on a numeric keypad; the preset keys stay;
//   3. ONE clock picker (patch 19's) wherever a time is edited;
//   4. absorb, never overlap: an edit that would swallow or overlap a neighbour warns, says what
//      it trims, and saves only through ONE explicit confirmation — never a flat refusal, never a
//      silent erase, and the saved log never holds two entries for one minute (all statuses);
//   5. the Now card's Timeline / Dial switch on the card itself, one setting with More's;
//   7. store.ts: MAX_DAY_CLOSES declared before the module-load path that reads it.
// The real App runs in the minimal DOM (domshim) on a controlled clock and is driven through its
// own controls. Soft collector: every pin reports on its own line, so one run on the untouched
// base (work-c3) shows which pins are red there. Exit 1 when any pin fails.
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
let Tms = new Date(2026, 10, 10, 14, 14, 5).getTime(); // local wall time: Tue Nov 10 2026, 14:14
Date.now = () => Tms;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); }; globalThis.__BUILD__ = 'l1';
globalThis.speechSynthesis = { cancel() {}, speak() {}, getVoices: () => [] };
globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
const { render, h } = await import('preact');
const { readFileSync } = await import('node:fs');
const A = await import('../../src/app.tsx');
const S = await import('../../src/store.ts');
const { App, setLaunchNotice, openSheet, currentSheet, undoLast } = A;
const { setState, getState, deviceTz, clock } = S;
setLaunchNotice?.(false);
const sleep = (ms) => new Promise((r) => rawSetTimeout(r, ms));
const res = [];
const pin = async (name, f) => { try { const r = await f(); res.push([r === true ? 'PASS' : 'FAIL', name, r === true ? '' : String(r)]); } catch (e) { res.push(['FAIL', name, 'threw: ' + (e && e.message || e)]); } };
const root = document.createElement('div'); document.body.appendChild(root);
const T = Math.floor(Tms / 60000);
const text = () => root.textContent;
const base = () => ({ tentative: [], drivingView: false, zoneAck: null, seededAt: null, dayCloses: [], historyAcknowledged: true, theme: 'day', themeChosen: true, darkDriveAtNight: true, disclaimerAcked: true, tzChosen: true, alertsOn: false, speakAlerts: false, speechAsked: true, speakAskOpen: false, nowOverride: null, tab: 'log', nowCard: 'dial', nowCardAsked: true, logResolved: false, config: { ...getState().config, timeZone: deviceTz } });
// Off 10h, driving, then On Duty tapped at T-20.
const day = () => ({
  segments: [{ status: 'OFF', start: T - 900, end: T - 300, createdAt: 1 }, { status: 'D', start: T - 300, end: T - 20, createdAt: 2 }],
  current: { status: 'ON', since: T - 20, createdAt: 3 },
});
const seed = async (rec, extra = {}) => { openSheet(null); setState({ ...base(), ...rec, ...extra }); await sleep(60); };
const plain = (s) => JSON.stringify({ segments: [...s.segments].sort((a, b) => a.start - b.start).map((x) => [x.status, x.start - T, x.end - T, x.note ?? null]), current: s.current && [s.current.status, s.current.since - T, s.current.note ?? null] });
const hhmm = (min) => { const d = new Date(min * 60000); return `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`; };
const hh_mm = (min) => { const d = new Date(min * 60000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
/** The saved record never holds two entries for one minute: the logged rows and the open status, pairwise. */
const overlaps = (s, now = T) => {
  const rows = [...s.segments.filter((x) => !x.tentative)];
  if (s.current && now > s.current.since) rows.push({ status: s.current.status, start: s.current.since, end: now, live: true });
  rows.sort((a, b) => a.start - b.start);
  const out = [];
  for (let i = 1; i < rows.length; i++) if (rows[i].start < rows[i - 1].end) out.push(`${rows[i - 1].status}[${rows[i - 1].start - T},${rows[i - 1].end - T}) x ${rows[i].status}[${rows[i].start - T},${rows[i].end - T})`);
  return out;
};
// DOM helpers (adjuststart's)
const all = (pred) => { const out = []; const w = (n) => { if (pred(n)) out.push(n); n.childNodes.forEach(w); }; w(root); return out; };
const fire = (node, type, extra = {}) => { for (const t of [type, type[0].toUpperCase() + type.slice(1)]) { const ev = { type: t, target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...extra }; for (const f of node.listeners[t] ?? []) f.call(node, ev); } };
const disabled = (n) => n.attributes.disabled !== undefined && n.attributes.disabled !== 'false';
const cls = (n) => n.attributes.class ?? '';
const button = (re) => all((n) => n.localName === 'button' && re.test(n.textContent.trim()))[0];
const click = async (re) => { const b = typeof re === 'object' && re.localName ? re : button(re); if (!b) throw new Error('no button ' + re); if (disabled(b)) throw new Error('disabled: ' + b.textContent); fire(b, 'click'); await sleep(50); return b; };
const input = (label) => all((n) => n.localName === 'input' && n.attributes['aria-label'] === label)[0];
const type = async (label, value) => { const i = typeof label === 'string' ? input(label) : label; if (!i) throw new Error('no input ' + label); i.value = value; fire(i, 'input'); await sleep(50); return i; };
const attr = (n, k) => n.attributes[k] ?? n.attributes[k.toLowerCase()] ?? n[k];
const sheet = () => all((n) => /\bsheet\b/.test(cls(n)) && n.localName === 'div')[0];
const sheetText = () => sheet()?.textContent ?? '';
// Panel strip: every page stays mounted, and pages carry their own steppers and text
// boxes — a tree-wide first match can land on another page's control (on a phone that
// page is inert, off-screen; only the harness's global search could confuse them).
// Pins that work inside a sheet scope their finds to it.
const inSheet = (n) => { const sh = sheet(); let p = n; while (p) { if (p === sh) return true; p = p.parentNode; } return false; };
const sheetButton = (re) => all((n) => n.localName === 'button' && re.test(n.textContent.trim()) && inSheet(n))[0];
const goBtn = () => all((n) => n.localName === 'button' && /\bed-go\b/.test(cls(n)))[0];
const clockTap = () => all((n) => n.localName === 'button' && /\bed-clock-tap\b/.test(cls(n)))[0];
const liveRow = () => all((n) => n.localName === 'button' && /\bentry\b/.test(cls(n)) && /\blive\b/.test(cls(n)))[0];

render(h(App, {}), root); await sleep(120);

/* ================= item 1: the current entry is editable ================= */
await pin('1a. the Log\'s current (open) entry is a row you can tap, and it opens the same edit panel as any other row', async () => {
  await seed(day());
  const r = liveRow();
  if (!r) return 'no tappable live row (got: ' + (all((n) => /\bentry live\b/.test(cls(n)))[0]?.localName ?? 'none') + ')';
  fire(r, 'click'); await sleep(60);
  const k = currentSheet();
  if (k?.kind !== 'edit' || !k.live || k.seg.start !== T - 20) return 'sheet: ' + JSON.stringify(k);
  const t = sheetText();
  return (/What do you want to fix\?/.test(t) && /The times are wrong/.test(t) && /It wasn’t On Duty/.test(t) && /It never happened/.test(t)) || 'menu: ' + t.slice(0, 200);
});
await pin('1b. current entry → The times are wrong: the same when-step and keys as a past row; saving moves the start through the store (the row before shrinks)', async () => {
  await seed(day()); fire(liveRow(), 'click'); await sleep(60);
  await click(/^The times are wrongChange when it started or how long$/);
  if (!/When did it really start\?/.test(sheetText()) || !button(/^− 1 hour$/) || !button(/^\+15$/)) return 'not the when-step with its keys';
  await click(sheetButton(/^−5$/)); // T-25 — the sheet's own −5, not a page's
  await click(/^Next: check it$/);
  if (!/Check the change/.test(sheetText())) return 'no check step: ' + sheetText().slice(0, 120);
  await click(goBtn());
  const s = getState();
  return (s.current.since === T - 25 && s.segments.find((x) => x.status === 'D').end === T - 25 && overlaps(s).length === 0) || plain(s);
});
await pin('1c. current entry → It wasn\'t …: the open status is relabelled, its start kept, undoable', async () => {
  await seed(day()); fire(liveRow(), 'click'); await sleep(60);
  await click(/^It wasn’t On Duty/);
  await click(/^Off dutyDone with work/);
  const s = getState();
  if (!(s.current.status === 'OFF' && s.current.since === T - 20 && s.segments.length === 2)) return plain(s);
  undoLast?.();
  return getState().current.status === 'ON' || 'undo did not restore';
});
await pin('1d. current entry → It never happened: the status before it is open again (no gap, no overlap)', async () => {
  await seed(day()); fire(liveRow(), 'click'); await sleep(60);
  await click(/^It never happened/);
  const s = getState();
  return (s.current.status === 'D' && s.current.since === T - 300 && s.segments.length === 1 && overlaps(s).length === 0) || plain(s);
});
await pin('1e. current entry → a break in the middle: the open status is split around it, nothing overlaps', async () => {
  await seed({ segments: [{ status: 'OFF', start: T - 900, end: T - 300, createdAt: 1 }], current: { status: 'D', since: T - 300, createdAt: 2 } });
  fire(liveRow(), 'click'); await sleep(60);
  await click(/^I took a break in the middle/);
  const k = currentSheet();
  if (k?.kind !== 'add' || !k.inside) return 'not the add-inside flow: ' + JSON.stringify(k);
  A.commitDraft(k, { status: 'OFF', start: T - 150, len: 30 }, T);
  const s = getState();
  const ds = s.segments.filter((x) => x.status === 'D');
  return (overlaps(s).length === 0 && s.current.status === 'D' && s.current.since === T - 120 && ds.length === 1 && ds[0].start === T - 300 && ds[0].end === T - 150) || plain(s);
});

/* ================= item 2: tap the time to type it ================= */
// Feel round (2026-11-19): the EDIT flow's big clock is now the clock picker itself (pins E1–E5
// below). Owner amendment B (2026-11-20) gave the ADD flow the same picker (pins E5–E7), so the
// tap-to-type keypad is pinned here on "Fix the start time", where it still lives.
await pin('2a. tapping the displayed time opens a typed box on a NUMERIC keypad; 0641 sets 06:41 on the same day; the preset keys stay (fix-start)', async () => {
  await seed(day()); openSheet({ kind: 'since' }); await sleep(60);
  const tap = clockTap();
  if (!tap) return 'the big clock is not a tappable key';
  fire(tap, 'click'); await sleep(60);
  const box = input('Exact start time, type the time');
  if (!box) return 'no typed box after the tap';
  if (attr(box, 'inputMode') !== 'numeric') return 'inputmode: ' + attr(box, 'inputMode');
  if (attr(box, 'type') !== 'text') return 'type: ' + attr(box, 'type') + ' (a number box drops the leading 0)';
  await type(box, '0641');
  const want = new Date(T * 60000); want.setHours(6, 41, 0, 0);
  if (!goBtn().textContent.includes(clock(Math.floor(want.getTime() / 60000)))) return 'typed 0641 → ' + goBtn().textContent;
  return (!!sheetButton(/^−5$/) && !!sheetButton(/^−1$/) && !!sheetButton(/^\+1$/) && !!sheetButton(/^\+5$/)) || 'preset keys gone';
});
await pin('2b. three digits ("641") land on Done; a time that is no time ("2561") is refused with its reason, nothing guessed', async () => {
  await seed(day()); openSheet({ kind: 'since' }); await sleep(60);
  fire(clockTap(), 'click'); await sleep(50);
  const before = A.readTypedClock ? null : 'no reader';
  if (before) return before;
  await type('Exact start time, type the time', '2561');
  if (!/not a time/.test(sheetText())) return 'no reason for 2561';
  if (getState().current.since !== T - 20) return 'state changed';
  const go0 = goBtn(); if (!/Pick the real start time/.test(go0.textContent)) return 'a refused time moved the draft: ' + go0.textContent;
  await type('Exact start time, type the time', '1405');
  if (!/Set start to /.test(goBtn().textContent) || !goBtn().textContent.includes(clock(T - 9))) return 'typed 1405: ' + goBtn().textContent;
  fire(clockTap(), 'click'); await sleep(40); fire(clockTap(), 'click'); await sleep(40);
  await type('Exact start time, type the time', '1357');
  await click(/^Done$/);
  return (goBtn().textContent.includes(clock(T - 17)) && !input('Exact start time, type the time')) || 'Done: ' + goBtn().textContent;
});
await pin('2c. every typed time box in the editor, fix-start and load panels summons the number pad', async () => {
  const bad = [];
  const scan = (where) => { for (const n of all((x) => x.localName === 'input' && ['text', 'number'].includes(attr(x, 'type')) && inSheet(x))) if (attr(n, 'inputMode') !== 'numeric') bad.push(`${where}:${n.attributes['aria-label']}`); };
  await seed(day()); openSheet({ kind: 'since' }); await sleep(50); fire(clockTap(), 'click'); await sleep(40); scan('since');
  // (the log add + edit flows have no typed box any more — amendment B; E5–E7 pin their picker)
  await seed(day(), { tab: 'load' }); openSheet({ kind: 'loadtime', field: 'leave' }); await sleep(50);
  if (!clockTap()) return 'load: no tappable clock';
  fire(clockTap(), 'click'); await sleep(40); scan('load');
  return bad.length === 0 || bad.join(', ');
});

/* ================= item 3: one clock picker everywhere ================= */
await pin('3a. the same clock picker (the time picker; tap-to-type clock where the keypad stays) at every time field: editor start + end, fix-start, load leave + appointment, trip departure', async () => {
  const miss = [];
  const has = (where, timeLabel, tap = true) => { if (tap && !clockTap()) miss.push(where + ': clock key'); const t = input(timeLabel); if (!t || attr(t, 'type') !== 'time') miss.push(where + ': time picker'); };
  // amendment B: the add flow's start + end are the picker-only clock (no tap-to-type key)
  await seed(day()); openSheet({ kind: 'add', step: 'when', draft: { status: 'OFF', start: T - 60, len: 30 } }); await sleep(50); has('editor start', 'Start time', false);
  openSheet({ kind: 'add', step: 'long', draft: { status: 'OFF', start: T - 60, len: 30 } }); await sleep(50);
  has('editor end', 'End time', false);
  openSheet({ kind: 'since' }); await sleep(50); has('fix-start', 'Exact start time');
  await seed(day(), { tab: 'load' }); openSheet({ kind: 'loadtime', field: 'leave' }); await sleep(50); has('load leave', 'Exact time');
  openSheet({ kind: 'loadtime', field: 'appt' }); await sleep(50); has('load appt', 'Exact time');
  await seed(day(), { tab: 'trip' }); await sleep(30);
  const dep = all((n) => n.localName === 'button' && /\btrip-dep\b/.test(cls(n)))[0];
  if (!dep) miss.push('trip: no departure key'); else { fire(dep, 'click'); await sleep(60); has('trip departure', 'Exact departure time'); }
  return miss.length === 0 || miss.join('; ');
});
await pin('3b. one shared component, not copies: app.tsx holds exactly one time picker and one tap-to-type box; no bare datetime-local but the Testing clock', async () => {
  const app = readFileSync(new URL('../src/app.tsx', import.meta.url), 'utf8');
  const times = (app.match(/<input type="time"/g) || []).length;
  const typed = (app.match(/placeholder="0641"/g) || []).length;
  const dtl = [...app.matchAll(/<label>([^<]*)<input type="datetime-local"/g)].map((m) => m[1]);
  return (times === 1 && typed === 1 && dtl.length === 1 && /Simulated "now"/.test(dtl[0])) || `type=time ×${times}, typed boxes ×${typed}, datetime-local: ${JSON.stringify(dtl)}`;
});
await pin('3c. the trip departure picked on the shared picker is the plan\'s departure', async () => {
  await seed(day(), { tab: 'trip', trip: { ...getState().trip, dep: null } }); await sleep(30);
  const dep = all((n) => n.localName === 'button' && /\btrip-dep\b/.test(cls(n)))[0];
  if (!dep) return 'no departure key';
  fire(dep, 'click'); await sleep(60);
  const inSheet = (re) => { const out = []; const w = (n) => { if (n.localName === 'button' && re.test(n.textContent.trim())) out.push(n); n.childNodes.forEach(w); }; w(sheet()); return out[0]; };
  await click(inSheet(/^\+ 1 hour$/)); await click(inSheet(/^\+15$/));
  await click(goBtn());
  return (S.fromInput(getState().trip.dep) === T + 75 && currentSheet() === null) || 'dep ' + getState().trip.dep;
});

/* ===== feel round (Lorico 2026-11-19): the log EDIT flow has ONE time field — the clock picker ===== */
const sheetInputs = () => all((n) => n.localName === 'input' && inSheet(n));
const oneField = (where) => {
  const ins = sheetInputs();
  const times = ins.filter((n) => attr(n, 'type') === 'time');
  const typed = ins.filter((n) => ['text', 'number'].includes(attr(n, 'type')) || attr(n, 'inputMode') === 'numeric');
  if (times.length !== 1) return `${where}: ${times.length} time fields`;
  if (typed.length) return `${where}: a keypad box is still there (${typed.map((n) => n.attributes['aria-label']).join(', ')})`;
  if (all((n) => n.localName === 'button' && /\bed-clock-tap\b/.test(cls(n)) && inSheet(n)).length) return `${where}: the big clock still opens the keypad`;
  if (/Exact time/.test(sheetText())) return `${where}: the "Exact time" field is still there`;
  // the one field IS the big clock: it sits in the clock face, over the big digits
  const t = times[0], lab = t.parentNode;
  if (!/\bed-clock-input\b/.test(cls(t)) || lab?.localName !== 'label' || !/\bed-clock-pick\b/.test(cls(lab)) || !/\bed-clock\b/.test(cls(lab.parentNode))) return `${where}: the time field is not the big clock (${cls(t)} in ${lab?.localName}.${cls(lab ?? { attributes: {} })})`;
  if (!all((n) => n.localName === 'output' && n.parentNode === lab).length) return `${where}: no big digits under the picker`;
  return true;
};
await pin('E1. edit → The times are wrong → "When did it really start?": ONE time field, the big clock, and it is the clock picker (no keypad, no "Exact time")', async () => {
  await seed(day()); openSheet({ kind: 'edit', seg: getState().segments[1] }); await sleep(60);
  await click(/^The times are wrongChange when it started or how long$/);
  if (!/When did it really start\?/.test(sheetText())) return 'not the start step: ' + sheetText().slice(0, 120);
  const one = oneField('start'); if (one !== true) return one;
  const t = sheetInputs().find((n) => attr(n, 'type') === 'time');
  if (t.attributes['aria-label'] !== 'Start time') return 'label: ' + t.attributes['aria-label'];
  await type(t, '06:41');
  const want = new Date(T * 60000); want.setHours(6, 41, 0, 0);
  if (currentSheet().draft.start !== Math.floor(want.getTime() / 60000)) return 'picked 06:41 → ' + hh_mm(currentSheet().draft.start);
  if (!all((n) => n.localName === 'output' && n.textContent === '06:41' && inSheet(n)).length) return 'the big clock does not read 06:41';
  return (!!sheetButton(/^− 1 hour$/) && !!sheetButton(/^\+15$/) && !!sheetButton(/^Yesterday$/)) || 'preset keys / day chips gone';
});
// EDIT-FIX (Lorico, 2026-11-20): the edit end step is the add flow's end step — no "Ends …" tap,
// no length presets, no stepper; the end on the clock picker straight away, length derived.
const noPresets = (where) => {
  const t = sheetText();
  if (/How long did it (really )?last\?/.test(t)) return `${where}: the "How long did it last?" screen is still there`;
  if (all((n) => /\b(ed-len|ed-fine)\b/.test(cls(n)) && inSheet(n)).length || sheetButton(/^(15 min|30 min|45 min|1 hour|2 hours|10 hours)$/) || all((n) => n.attributes['aria-label'] === 'Length' && inSheet(n)).length) return `${where}: the duration presets / stepper are still there`;
  if (all((n) => n.localName === 'button' && /\bed-ends-tap\b/.test(cls(n)) && inSheet(n)).length) return `${where}: the end picker still hides behind an "Ends …" tap`;
  return true;
};
await pin('E2. EDIT-FIX: edit → the end step is "When did it really end?": ONE time field = the end clock picker shown directly (no "Ends" tap, no presets), showing the end; picking sets the end, length derived', async () => {
  await seed(day()); const seg = getState().segments[1];
  openSheet({ kind: 'edit', seg, step: 'long', draft: { status: 'D', start: seg.start, len: seg.end - seg.start } }); await sleep(60);
  if (!/When did it really end\?/.test(sheetText())) return 'not the end question: ' + sheetText().slice(0, 160);
  const np = noPresets('edit end'); if (np !== true) return np;
  const one = oneField('end'); if (one !== true) return one;
  const t = sheetInputs().find((n) => attr(n, 'type') === 'time');
  if (t.attributes['aria-label'] !== 'End time') return 'label: ' + t.attributes['aria-label'];
  if (attr(t, 'value') !== hh_mm(seg.end)) return 'the end picker shows ' + attr(t, 'value') + ', not the end ' + hh_mm(seg.end);
  if (!all((n) => n.localName === 'output' && n.textContent === hh_mm(seg.end) && inSheet(n)).length) return 'the big clock does not read the end time';
  await type(t, hh_mm(T - 10));
  if (currentSheet().draft.len !== (T - 10) - seg.start) return 'len ' + currentSheet().draft.len;
  return (/Lasted/.test(sheetText()) && sheetText().includes(S.dur((T - 10) - seg.start))) || 'the derived length is not read out: ' + sheetText().slice(-160);
});
await pin('E3. the open status too: Log → current row → The times are wrong → pick on the clock → check → save moves the start', async () => {
  await seed(day()); fire(liveRow(), 'click'); await sleep(60);
  await click(/^The times are wrong/);
  const one = oneField('live start'); if (one !== true) return one;
  await type(sheetInputs().find((n) => attr(n, 'type') === 'time'), hh_mm(T - 25));
  await click(/^Next: check it$/);
  await click(goBtn());
  const s = getState();
  return (currentSheet() === null && s.current.since === T - 25 && overlaps(s).length === 0) || plain(s);
});
await pin('E4. a tap on the edit clock asks the phone for its picker (showPicker, guarded: absent or throwing is harmless)', async () => {
  await seed(day()); openSheet({ kind: 'edit', seg: getState().segments[1], step: 'when', draft: { status: 'D', start: T - 300, len: 280 } }); await sleep(60);
  const t = sheetInputs().find((n) => attr(n, 'type') === 'time');
  if (!t) return 'no picker';
  let asked = 0;
  t.showPicker = () => { asked++; };
  fire(t, 'click'); if (asked !== 1) return 'showPicker asked ' + asked + 'x';
  t.showPicker = () => { throw new Error('NotAllowedError'); };
  fire(t, 'click');
  delete t.showPicker;
  fire(t, 'click');
  return currentSheet()?.step === 'when' || 'the sheet moved';
});
await pin('E5. scope fence (re-aimed by amendment B, 2026-11-20): the ADD flow\'s start and end are the clock picker; fix-start, the load check and the trip departure keep their tap-to-type clock and "Exact time" field, unchanged', async () => {
  const miss = [];
  const keeps = (where, label) => { if (!all((n) => n.localName === 'button' && /\bed-clock-tap\b/.test(cls(n)) && inSheet(n)).length) miss.push(where + ': keypad clock'); if (!input(label) || !/Exact time/.test(sheetText())) miss.push(where + ': exact-time field'); };
  await seed(day()); openSheet({ kind: 'add', step: 'when', draft: { status: 'OFF', start: T - 60, len: 30 } }); await sleep(50);
  let one = oneField('add start'); if (one !== true) miss.push(one);
  openSheet({ kind: 'add', step: 'long', draft: { status: 'OFF', start: T - 60, len: 30 } }); await sleep(50);
  one = oneField('add end'); if (one !== true) miss.push(one);
  // EDIT-FIX kept the add end step as it was: its own question, its step count, its Change link
  if (!/When did it end\?/.test(sheetText()) || /really/.test(sheetText()) || !/Step 3 of 3/.test(sheetText()) || !sheetButton(/^Change$/)) miss.push('add end: no longer the add step (' + sheetText().slice(0, 120) + ')');
  openSheet({ kind: 'since' }); await sleep(50); keeps('fix-start', 'Exact start time');
  await seed(day(), { tab: 'load' }); openSheet({ kind: 'loadtime', field: 'leave' }); await sleep(50); keeps('load leave', 'Exact time');
  await seed(day(), { tab: 'trip' }); await sleep(30);
  const dep = all((n) => n.localName === 'button' && /\btrip-dep\b/.test(cls(n)))[0];
  if (!dep) miss.push('trip: no departure key'); else { fire(dep, 'click'); await sleep(60); keeps('trip departure', 'Exact departure time'); }
  return miss.length === 0 || miss.join('; ');
});
// Amendment B, driven through the real Log controls: "Add a break or something I forgot" → a
// status → "When did it start?" (the clock picker) → "When did it end?" (the clock picker
// showing the END time; no 15/30/45/1h/2h preset screen; the length derived start → end) →
// check → saved. Two different statuses.
const addFlow = async (statusRe, startHM, endHM, want) => {
  await seed(day(), { segments: [{ status: 'OFF', start: T - 900, end: T - 300, createdAt: 1 }], current: { status: 'D', since: T - 300, createdAt: 2 } });
  const add = all((n) => n.localName === 'button' && /\baddbtn\b/.test(cls(n)))[0];
  if (!add) return 'no add button on the Log';
  fire(add, 'click'); await sleep(60);
  if (currentSheet()?.kind !== 'add') return 'the add flow did not open';
  await click(sheetButton(statusRe));
  if (!/When did it start\?/.test(sheetText())) return 'not the start step: ' + sheetText().slice(0, 120);
  let one = oneField('start'); if (one !== true) return one;
  const st = sheetInputs().find((n) => attr(n, 'type') === 'time');
  if (st.attributes['aria-label'] !== 'Start time') return 'start label: ' + st.attributes['aria-label'];
  await type(st, startHM);
  if (hh_mm(currentSheet().draft.start) !== startHM) return 'picked start ' + startHM + ' → ' + hh_mm(currentSheet().draft.start);
  await click(goBtn());
  const t = sheetText();
  if (currentSheet()?.step !== 'long') return 'step ' + currentSheet()?.step;
  if (!/When did it end\?/.test(t)) return 'the end step does not ask when it ended: ' + t.slice(0, 160);
  if (/How long did it last\?/.test(t)) return 'the preset-only "How long did it last?" screen is still there';
  if (all((n) => /\bed-len\b/.test(cls(n)) && inSheet(n)).length || sheetButton(/^(15 min|30 min|45 min|1 hour|2 hours)$/)) return 'the duration presets are still there';
  one = oneField('end'); if (one !== true) return one;
  const en = sheetInputs().find((n) => attr(n, 'type') === 'time');
  if (en.attributes['aria-label'] !== 'End time') return 'end label: ' + en.attributes['aria-label'];
  const d0 = currentSheet().draft;
  if (attr(en, 'value') !== hh_mm(d0.start + d0.len)) return 'the end picker shows ' + attr(en, 'value') + ', not the end ' + hh_mm(d0.start + d0.len);
  if (!all((n) => n.localName === 'output' && n.textContent === hh_mm(d0.start + d0.len) && inSheet(n)).length) return 'the big clock does not read the end time';
  await type(en, endHM);
  const d = currentSheet().draft;
  if (hh_mm(d.start + d.len) !== endHM || d.len !== want) return `picked end ${endHM} → end ${hh_mm(d.start + d.len)}, len ${d.len} (want ${want})`;
  if (!/Lasted/.test(sheetText()) || !sheetText().includes(S.dur ? S.dur(want) : '')) return 'the derived length is not read out: ' + sheetText().slice(-160);
  await click(goBtn());
  if (!/Check and add/.test(sheetText())) return 'no check step';
  await click(goBtn());
  return true;
};
await pin('E6. amendment B, Driving: Log → Add → Driving → start on the clock picker → end on the clock picker (end time shown, no preset screen, length derived) → saved', async () => {
  const startHM = hh_mm(T - 600), endHM = hh_mm(T - 540);
  const r = await addFlow(/^Driving/, startHM, endHM, 60); if (r !== true) return r;
  const s = getState();
  return (s.segments.some((x) => x.status === 'D' && x.start === T - 600 && x.end === T - 540) && overlaps(s).length === 0) || plain(s);
});
await pin('E7. amendment B, On duty: the same add flow — start and end both on the clock picker, 45-minute length derived from the two times → saved', async () => {
  const startHM = hh_mm(T - 500), endHM = hh_mm(T - 455);
  const r = await addFlow(/^On duty/, startHM, endHM, 45); if (r !== true) return r;
  const s = getState();
  return (s.segments.some((x) => x.status === 'ON' && x.start === T - 500 && x.end === T - 455) && overlaps(s).length === 0) || plain(s);
});
await pin('E8. amendment B: on the add end step the hour keys move the END, "Until now" sets the end to now, and an end before the start is refused (nothing moves)', async () => {
  await seed(day()); openSheet({ kind: 'add', step: 'long', draft: { status: 'OFF', start: T - 120, len: 30 } }); await sleep(50);
  await click(sheetButton(/^\+15$/));
  if (currentSheet().draft.len !== 45) return '+15 → len ' + currentSheet().draft.len;
  await click(sheetButton(/^Until now/));
  if (currentSheet().draft.len !== 120) return 'Until now → len ' + currentSheet().draft.len;
  await type(sheetInputs().find((n) => attr(n, 'type') === 'time'), hh_mm(T - 130));
  return currentSheet().draft.len === 120 || 'an end before the start moved the draft: len ' + currentSheet().draft.len;
});

await pin('E9. EDIT-FIX end to end: Log row → The times are wrong → start on the picker → "Next: when it ended" → end on the picker (no presets) → Check it → Save → the record carries the picked start and end', async () => {
  await seed(day());
  // the Driving row on the Log, tapped as the driver would
  const row = all((n) => n.localName === 'button' && /\bentry\b/.test(cls(n)) && !/\blive\b/.test(cls(n)) && /Driving/.test(n.textContent))[0];
  if (!row) return 'no Driving row on the Log';
  fire(row, 'click'); await sleep(60);
  if (currentSheet()?.kind !== 'edit') return 'the edit panel did not open';
  await click(/^The times are wrongChange when it started or how long$/);
  await type(sheetInputs().find((n) => attr(n, 'type') === 'time'), hh_mm(T - 290));
  const next = goBtn(); if (next.textContent.trim() !== 'Next: when it ended') return 'start step Next reads: ' + next.textContent;
  await click(next);
  if (currentSheet()?.step !== 'long' || !/When did it really end\?/.test(sheetText())) return 'not the end step: ' + sheetText().slice(0, 160);
  const np = noPresets('edit end'); if (np !== true) return np;
  const one = oneField('end'); if (one !== true) return one;
  await type(sheetInputs().find((n) => attr(n, 'type') === 'time'), hh_mm(T - 40));
  const d = currentSheet().draft;
  if (d.start !== T - 290 || d.start + d.len !== T - 40) return `draft ${hh_mm(d.start)}→${hh_mm(d.start + d.len)}`;
  if (!sheetText().includes(S.dur(250))) return 'Lasted does not read 4h 10m';
  await click(goBtn());
  if (!/Check the change/.test(sheetText())) return 'no check step';
  await click(goBtn());
  const s = getState();
  return (currentSheet() === null && s.segments.some((x) => x.status === 'D' && x.start === T - 290 && x.end === T - 40) && overlaps(s).length === 0) || plain(s);
});
await pin('E10. EDIT-FIX: the edit end step behaves as the add one — hour keys move the END, "Until now" sets it to now, an end at or before the start is ignored (nothing moves, as in add); a what-if gets no "Until now"', async () => {
  await seed(day()); const seg = getState().segments[1]; // D [T-300, T-20)
  openSheet({ kind: 'edit', seg, step: 'long', draft: { status: 'D', start: seg.start, len: 200 } }); await sleep(50);
  await click(sheetButton(/^\+15$/));
  if (currentSheet().draft.len !== 215) return '+15 → len ' + currentSheet().draft.len;
  await click(sheetButton(/^Until now/));
  if (currentSheet().draft.len !== 300) return 'Until now → len ' + currentSheet().draft.len;
  if (sheetButton(/^Until now/)) return '"Until now" still offered when the end is now (add hides it)';
  const t = () => sheetInputs().find((n) => attr(n, 'type') === 'time');
  await type(t(), hh_mm(T - 310));
  if (currentSheet().draft.len !== 300) return 'an end before the start moved the draft: len ' + currentSheet().draft.len;
  await type(t(), hh_mm(T - 300));
  if (currentSheet().draft.len !== 300) return 'an end AT the start moved the draft: len ' + currentSheet().draft.len;
  // the add flow, same inputs, same answers
  openSheet({ kind: 'add', step: 'long', draft: { status: 'D', start: T - 300, len: 300 } }); await sleep(50);
  await type(t(), hh_mm(T - 310));
  if (currentSheet().draft.len !== 300) return 'add: an end before the start moved the draft';
  // a what-if: no "Until now", a future end is allowed
  const wi = { status: 'D', start: T + 60, end: T + 120, createdAt: 9, tentative: true };
  await seed(day(), { tentative: [wi] });
  openSheet({ kind: 'edit', seg: getState().tentative[0], step: 'long', draft: { status: 'D', start: T + 60, len: 60 } }); await sleep(50);
  if (!/When did it really end\?/.test(sheetText())) return 'what-if: not the end step';
  if (sheetButton(/^Until now/)) return 'what-if: "Until now" offered';
  await type(t(), hh_mm(T + 150));
  return currentSheet().draft.len === 90 || 'what-if future end: len ' + currentSheet().draft.len;
});

/* ================= item 4: absorb, never overlap ================= */
const LABELS = [['OFF', undefined], ['SB', undefined], ['D', undefined], ['ON', undefined], ['OFF', 'PC'], ['ON', 'YM'], ['OFF', 'break:30-min break'], ['ON', 'break:Fuel']];
await pin('4a. back-filling an entry that overlaps others: warned, trimmed only on the one confirmation, and the saved log never overlaps — every status, PC, yard move, breaks', async () => {
  const bad = [];
  for (const [st, note] of LABELS) {
    // a forgotten entry from T-400 to T-200: it covers the end of OFF, the start of D
    await seed(day()); const s0 = getState();
    openSheet({ kind: 'add', step: 'check', draft: { status: st, note, start: T - 400, len: 200 } }); await sleep(50);
    const t = sheetText(), go = goBtn();
    if (!/runs into/.test(t)) { bad.push(`${st}/${note}: no warning`); continue; }
    if (!go || !/\bed-absorb\b/.test(cls(go)) || !/^Absorb and add to my log$/.test(go.textContent)) { bad.push(`${st}/${note}: button ${go && go.textContent}`); continue; }
    if (getState() !== s0) { bad.push(`${st}/${note}: changed before the confirmation`); continue; }
    fire(go, 'click'); await sleep(50);
    const s = getState(), ov = overlaps(s);
    if (ov.length) { bad.push(`${st}/${note}: overlap ${ov}`); continue; }
    const row = s.segments.find((x) => x.start === T - 400 && x.end === T - 200 && x.status === st);
    const off = s.segments.find((x) => x.status === 'OFF' && x.start === T - 900), d = s.segments.find((x) => x.status === 'D' && x.end === T - 20);
    if (!row || !off || off.end !== T - 400 || !d || d.start !== T - 200) bad.push(`${st}/${note}: ${plain(s)}`);
  }
  return bad.length === 0 || bad.join(' | ');
});
await pin('4a. the store paths themselves never save an overlap: addEntry / saveEntry over a neighbour, inside a row, over the open status', async () => {
  const bad = [];
  for (const [st, note] of LABELS) {
    await seed(day()); A.addEntry(st, T - 600, T - 500, T, note); // inside OFF: split
    let ov = overlaps(getState()); if (ov.length || getState().segments.filter((x) => x.status === 'OFF' && x.note === undefined).length < (st === 'OFF' && !note ? 1 : 2)) bad.push(`inside ${st}/${note}: ${ov} ${plain(getState())}`);
    await seed(day()); A.addEntry(st, T - 40, T - 5, T, note); // over the open status's start
    ov = overlaps(getState()); if (ov.length || getState().current.since !== T - 5) bad.push(`over current ${st}/${note}: ${ov} ${plain(getState())}`);
    await seed(day()); A.saveEntry(getState().segments[0], { status: st, start: T - 900, end: T - 100, note }, T); // edit grows over D
    ov = overlaps(getState()); if (ov.length || getState().segments.find((x) => x.status === 'D' && x.end === T - 20)?.start !== T - 100) bad.push(`edit ${st}/${note}: ${ov} ${plain(getState())}`);
  }
  return bad.length === 0 || bad.join(' | ');
});
await pin('4a. one confirmation is the whole cost, and Undo takes the absorb back exactly', async () => {
  await seed(day()); const p0 = plain(getState());
  openSheet({ kind: 'add', step: 'check', draft: { status: 'SB', start: T - 400, len: 200 } }); await sleep(50);
  fire(goBtn(), 'click'); await sleep(50);
  if (currentSheet() !== null) return 'the panel stayed open after the one confirmation';
  if (overlaps(getState()).length) return 'overlap';
  undoLast();
  return plain(getState()) === p0 || plain(getState());
});
await pin('4a. a status-only change on a row that already overlaps another (an older record) goes to the check step to confirm — no silent trim', async () => {
  await seed({ segments: [{ status: 'OFF', start: T - 900, end: T - 300, createdAt: 1 }, { status: 'D', start: T - 400, end: T - 20, createdAt: 2 }], current: { status: 'ON', since: T - 20, createdAt: 3 } });
  const s0 = getState();
  openSheet({ kind: 'edit', seg: s0.segments[1], step: 'what' }); await sleep(50);
  await click(/^On dutyWorking, not driving/);
  return (getState() === s0 && currentSheet()?.step === 'check' && /runs into/.test(sheetText())) || `sheet ${JSON.stringify(currentSheet()?.step)} state ${getState() === s0}`;
});
await pin('4b. Fix the start time: forgot to change status (On Duty ~4h ago, opened the app now) — warned + one confirmation, not refused; nothing overlaps after', async () => {
  // Driving to T-180, Off tapped at T-180 (really he went On Duty at T-240), On Duty tapped now-ish.
  await seed({ segments: [{ status: 'OFF', start: T - 1200, end: T - 600, createdAt: 1 }, { status: 'D', start: T - 600, end: T - 180, createdAt: 2 }, { status: 'OFF', start: T - 180, end: T - 2, createdAt: 3 }], current: { status: 'ON', since: T - 2, createdAt: 4 } }, { tab: 'now' });
  const s0 = getState();
  openSheet({ kind: 'since' }); await sleep(50);
  await type('Started this many minutes ago', '240');
  const t = sheetText(), go = goBtn();
  if (/would erase it|use the Log tab/.test(t)) return 'still a flat refusal: ' + t.slice(0, 200);
  if (!/runs into 2 other entries/.test(t) || !/Off Duty .* would be taken in whole/.test(t) || !/Driving .* would become/.test(t)) return 'warning: ' + t.slice(0, 300);
  if (!go || disabled(go) || !/^Absorb and set start to /.test(go.textContent)) return 'button: ' + (go && go.textContent);
  if (getState() !== s0) return 'changed before confirming';
  fire(go, 'click'); await sleep(50);
  const s = getState();
  return (s.current.since === T - 240 && s.segments.length === 2 && s.segments[1].end === T - 240 && overlaps(s).length === 0) || plain(s);
});
await pin('4b. the same absorb on the Log\'s current entry, through the shared editor; undo restores', async () => {
  await seed({ segments: [{ status: 'D', start: T - 600, end: T - 180, createdAt: 2 }, { status: 'OFF', start: T - 180, end: T - 2, createdAt: 3 }], current: { status: 'ON', since: T - 2, createdAt: 4 } });
  const p0 = plain(getState());
  fire(liveRow(), 'click'); await sleep(60);
  await click(/^The times are wrong/);
  await click(/^− 1 hour$/); await click(/^− 1 hour$/); await click(/^− 1 hour$/); await click(/^− 1 hour$/); // T-242
  await click(/^Next: check it$/);
  if (!/runs into/.test(sheetText())) return 'no warning';
  await click(/^Absorb and save the change$/);
  const s = getState();
  if (!(s.current.since === T - 242 && overlaps(s).length === 0 && !s.segments.some((x) => x.status === 'OFF'))) return plain(s);
  undoLast();
  return plain(getState()) === p0 || 'undo: ' + plain(getState());
});
await pin('4b. every status as the open one: the absorb holds for Off Duty, Sleeper, Driving, On Duty, PC, yard move', async () => {
  const bad = [];
  for (const [st, note] of LABELS.slice(0, 6)) {
    await seed({ segments: [{ status: 'D', start: T - 600, end: T - 180, createdAt: 2 }, { status: 'ON', start: T - 180, end: T - 2, createdAt: 3 }], current: { status: st, since: T - 2, createdAt: 4, ...(note ? { note } : {}) } });
    const e = A.adjustStartNow(T - 300, true);
    const s = getState();
    if (e || overlaps(s).length || s.current.since !== T - 300 || s.current.status !== st || (s.current.note ?? undefined) !== note) bad.push(`${st}/${note}: ${e ?? plain(s)}`);
  }
  return bad.length === 0 || bad.join(' | ');
});
await pin('4b. the other refusals stand: a future start is still refused with its reason', async () => {
  await seed(day(), { tab: 'now' }); const s0 = getState();
  openSheet({ kind: 'since' }); await sleep(50);
  await type('Exact start time', hh_mm(T + 3));
  return (/not in the past yet/.test(sheetText()) && disabled(goBtn()) && getState() === s0) || 'future: ' + sheetText().slice(0, 160);
});

/* ================= item 5: the Now card switch ================= */
await pin('5a. the Now card carries its own Timeline / Dial switch; it and More → Planning are one setting', async () => {
  await seed(day(), { tab: 'now', nowCard: 'dial' });
  const sw = () => all((n) => /\bcard-switch\b/.test(cls(n)))[0];
  const hero = all((n) => n.localName === 'section' && /\bhero\b/.test(cls(n)))[0];
  if (!sw() || !hero || !hero.textContent.includes(sw().textContent)) return 'no switch on the card';
  const tl = all((n) => n.localName === 'button' && n.textContent === 'Timeline' && /\bcard-switch\b/.test(cls(n.parentNode?.parentNode ?? { attributes: {} })))[0];
  if (!tl) return 'no Timeline key on the card';
  fire(tl, 'click'); await sleep(60);
  if (getState().nowCard !== 'timeline') return 'card switch did not set the setting';
  if (!all((n) => /\btaxis\b/.test(cls(n))).length) return 'the card did not become the timeline';
  setState({ tab: 'settings' }); await sleep(60);
  const more = all((n) => n.localName === 'label' && /^Main card on Now/.test(n.textContent))[0];
  const on = more && all((n) => n.localName === 'button' && n.parentNode?.parentNode === more && n.attributes['aria-pressed'] === 'true')[0];
  if (!on || on.textContent !== 'Timeline') return 'More does not show the card\'s choice: ' + (on && on.textContent);
  const dialMore = all((n) => n.localName === 'button' && n.parentNode?.parentNode === more && n.textContent === 'Dial')[0];
  fire(dialMore, 'click'); await sleep(60);
  setState({ tab: 'now' }); await sleep(60);
  const pressed = all((n) => n.localName === 'button' && /\bcard-switch\b/.test(cls(n.parentNode?.parentNode ?? { attributes: {} })) && n.attributes['aria-pressed'] === 'true')[0];
  return (getState().nowCard === 'dial' && pressed?.textContent === 'Dial' && !all((n) => /\btaxis\b/.test(cls(n))).length) || 'More → card: ' + (pressed && pressed.textContent);
});
await pin('5b. one setter: the on-card switch and More share the same option list and write path', async () => {
  const app = readFileSync(new URL('../src/app.tsx', import.meta.url), 'utf8');
  const writes = (app.match(/nowCard: /g) || []).length;
  return (typeof A.setNowCard === 'function' && (app.match(/<Toggle options=\{NOW_CARD_OPTIONS\}/g) || []).length === 2 && (app.match(/setState\(\{ nowCard: /g) || []).length === 1 && /function setNowCard\([^)]*\) \{ setState\(\{ nowCard: v, nowCardAsked: true \}\); \}/.test(app)) || `setNowCard ${typeof A.setNowCard}, writes ${writes}`;
});

/* ================= item 7 + fences ================= */
await pin('7. store.ts: MAX_DAY_CLOSES is declared before parseSaved and the module-load call that reaches it', async () => {
  const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8');
  const decl = st.indexOf('export const MAX_DAY_CLOSES'), parse = st.indexOf('export function parseSaved('), load = st.search(/\n(?:let|const) [^\n]*loadSaved\(/);
  return (decl > 0 && decl < parse && (load < 0 || decl < load) && S.MAX_DAY_CLOSES === 40) || `decl ${decl}, parseSaved ${parse}, load ${load}`;
});
await pin('F1. copy: the new surfaces name no person and carry no officer / inspection / proof language', async () => {
  let copy = '';
  await seed(day()); fire(liveRow(), 'click'); await sleep(50); copy += sheetText();
  openSheet({ kind: 'add', step: 'check', draft: { status: 'SB', start: T - 400, len: 200 } }); await sleep(50); copy += sheetText();
  openSheet({ kind: 'since' }); await sleep(50); await type('Started this many minutes ago', '400'); copy += sheetText();
  fire(clockTap(), 'click'); await sleep(40); await type('Exact start time, type the time', '9999'); copy += sheetText();
  setState({ tab: 'now' }); openSheet(null); await sleep(50); copy += text();
  const bad = copy.match(/officer|inspect|proof|prove|audit|\bDOT\b|lorico|estrellado/i);
  return !bad || 'found: ' + bad[0];
});
await pin('F2. touch floors: the clock key, the typed box, Done and the end-time key ride rules at the 56/48px floors', async () => {
  const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  const minH = (re) => { const m = css.match(re); const v = m && /min-height: (\d+)px/.exec(m[0]); return v ? +v[1] : 0; };
  const floors = [[/\n\.ed-clock-tap \{[^}]*\}/, 56], [/\ninput\.num \{[^}]*\}/, 56], [/\n\.ed-type \.ed-type-ok \{[^}]*\}/, 56], [/\n\.ed-ends-tap \{[^}]*\}/, 48], [/\n\.ed-clock-pick \{[^}]*\}/, 56]];
  for (const [re, f] of floors) if (minH(re) < f) return `${re} is ${minH(re)}px, floor ${f}`;
  return true;
});
await pin('F3. no new storage keys', async () => {
  const allowed = new Set(['hos-sandbox-v1', 'hos-sandbox-v1-backup', 'hos-sandbox-v1-sim', 'hos-sandbox-undo-v1']);
  const extra = [...mem.keys()].filter((k) => !allowed.has(k));
  return extra.length === 0 || 'extra keys: ' + extra.join(', ');
});

/* ===== quick patch (2026-11-11): the break step names the break he just tapped ===== */
await pin('Q1. a break in the middle of a drive: step one asks "Which break did you take?" — not "What happened in the middle?" again', async () => {
  await seed({ segments: [{ status: 'OFF', start: T - 900, end: T - 300, createdAt: 1 }], current: { status: 'D', since: T - 300, createdAt: 2 } });
  fire(liveRow(), 'click'); await sleep(60);
  await click(/^I took a break in the middle/);
  const t = sheetText();
  if (/What happened in the middle\?/.test(t)) return 'still the old heading: ' + t.slice(0, 160);
  return /Which break did you take\?/.test(t) || 'heading was: ' + t.slice(0, 160);
});
await pin('Q2. worked or drove in the middle of an off-duty entry: the general question stays', async () => {
  await seed(day());
  openSheet({ kind: 'edit', seg: getState().segments[0] }); await sleep(60);
  await click(/^I worked or drove in the middle/);
  const t = sheetText();
  return (/What happened in the middle\?/.test(t) && !/Which break did you take\?/.test(t)) || 'heading was: ' + t.slice(0, 160);
});

render(null, root);
for (const [k, n, i] of res) console.log(`${k} ${n}${i ? '  — ' + i : ''}`);
const fails = res.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${res.length - fails} pass, ${fails} fail`);
console.log(fails ? 'LOGEDIT FAIL' : 'LOGEDIT OK');
process.exit(fails ? 1 : 0);

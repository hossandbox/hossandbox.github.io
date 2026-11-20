// Patch L3 — "Segment-end cascade": the pin lane (driver field reports 2026-11-17).
//   1. Editing a segment's END earlier left a GAP before the next segment — worst case the
//      open (current) status, whose start stayed put (Driving ended 07:08 after the edit,
//      On Duty still "since 07:19": 11 minutes owned by nobody). The next segment's start
//      must follow the edited end, so the log stays joined.
//   2. The same join on the START side (brief item 4): moving a start later must move the
//      previous segment's end with it — the identical shared-boundary mechanism.
//   3. What must NOT change: absorb still governs an edit that swallows a neighbour (L1),
//      a gap that was already there is not the edit's to close, and pushing an end later
//      into the open status keeps working as it did.
//   4. The end of an entry is settable as an exact DATE + TIME on the shared clock picker
//      (second field report 2026-11-17): Off Duty starting Sat 00:00 could not be ended
//      Mon 18:40 — the end was a time of day on the start's day, presets capped at 10h,
//      and "Until now" was the only multi-day answer. Pins L3.8–L3.10 drive the real
//      "How long did it last?" step: day chip, typed time, and the "Another day" date.
// The saves run through the app's own saveEntry (the path the editor's Check step calls),
// on a controlled clock. Soft collector: every pin reports on its own line, so one run on
// the untouched base shows which pins are red there. Exit 1 when any pin fails.
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
let Tms = new Date(2026, 10, 17, 7, 29, 5).getTime(); // local wall time: Tue Nov 17 2026, 07:29
Date.now = () => Tms;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'l3';
globalThis.speechSynthesis = { cancel() {}, speak() {}, getVoices: () => [] };
globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
const { render, h } = await import('preact');
const A = await import('../../src/app.tsx');
const S = await import('../../src/store.ts');
const { App, setLaunchNotice, openSheet, currentSheet } = A;
const { setState, getState, deviceTz } = S;
setLaunchNotice?.(false);
const sleep = (ms) => new Promise((r) => rawSetTimeout(r, ms));
const res = [];
const pin = async (name, f) => { try { const r = await f(); res.push([r === true ? 'PASS' : 'FAIL', name, r === true ? '' : String(r)]); } catch (e) { res.push(['FAIL', name, 'threw: ' + (e && e.message || e)]); } };
const root = document.createElement('div'); document.body.appendChild(root);
const at = (day, hh, mm) => Math.floor(new Date(2026, 10, day, hh, mm).getTime() / 60000);
const T = at(17, 7, 29); // now
const base = () => ({ tentative: [], drivingView: false, zoneAck: null, seededAt: null, dayCloses: [], historyAcknowledged: true, theme: 'day', themeChosen: true, darkDriveAtNight: true, disclaimerAcked: true, tzChosen: true, alertsOn: false, speakAlerts: false, speechAsked: true, speakAskOpen: false, nowOverride: null, tab: 'log', nowCard: 'dial', nowCardAsked: true, logResolved: false, config: { ...getState().config, timeZone: deviceTz } });
// The field-report chain: On Duty Mon 18:40, Driving 18:58, On Duty 22:35,
// Driving Tue 03:10 -> 07:19, then On Duty (open) since 07:19. Now is Tue 07:29.
const fieldChain = () => ({
  segments: [
    { status: 'ON', start: at(16, 18, 40), end: at(16, 18, 58), createdAt: 1 },
    { status: 'D', start: at(16, 18, 58), end: at(16, 22, 35), createdAt: 2 },
    { status: 'ON', start: at(16, 22, 35), end: at(17, 3, 10), createdAt: 3 },
    { status: 'D', start: at(17, 3, 10), end: at(17, 7, 19), createdAt: 4 },
  ],
  current: { status: 'ON', since: at(17, 7, 19), createdAt: 5 },
});
const seed = async (rec) => { openSheet(null); setState({ ...base(), ...rec }); await sleep(20); };
/** Overlaps only (a gap is the honest outcome of a move; two entries for one minute never is). */
const overlapsOnly = (s, now = T) => {
  const rows = [...s.segments.filter((x) => !x.tentative)];
  if (s.current && now > s.current.since) rows.push({ status: s.current.status, start: s.current.since, end: now });
  rows.sort((a, b) => a.start - b.start);
  const out = [];
  for (let i = 1; i < rows.length; i++) if (rows[i].start < rows[i - 1].end) out.push(`${rows[i - 1].status} x ${rows[i].status}`);
  return out;
};
const segAt = (start) => getState().segments.find((x) => x.start === start);
// DOM helpers (logedit's)
const all = (pred) => { const out = []; const w = (n) => { if (pred(n)) out.push(n); n.childNodes.forEach(w); }; w(root); return out; };
const fire = (node, type, extra = {}) => { for (const t of [type, type[0].toUpperCase() + type.slice(1)]) { const ev = { type: t, target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...extra }; for (const f of node.listeners[t] ?? []) f.call(node, ev); } };
const cls = (n) => n.attributes.class ?? '';
const disabled = (n) => n.attributes.disabled !== undefined && n.attributes.disabled !== 'false';
const button = (re) => all((n) => n.localName === 'button' && re.test(n.textContent.trim()))[0];
const click = async (b) => { if (!b) throw new Error('no such button'); if (disabled(b)) throw new Error('disabled: ' + b.textContent); fire(b, 'click'); await sleep(50); };
const input = (label) => all((n) => n.localName === 'input' && n.attributes['aria-label'] === label)[0];
const typeIn = async (label, value) => { const i = input(label); if (!i) throw new Error('no input ' + label); i.value = value; fire(i, 'input'); await sleep(50); };
const endsTap = () => all((n) => n.localName === 'button' && /\bed-ends-tap\b/.test(cls(n)))[0];
const goBtn = () => all((n) => n.localName === 'button' && /\bed-go\b/.test(cls(n)))[0];
const overlaps = (s, now = T) => {
  const rows = [...s.segments.filter((x) => !x.tentative)];
  if (s.current && now > s.current.since) rows.push({ status: s.current.status, start: s.current.since, end: now });
  rows.sort((a, b) => a.start - b.start);
  const out = [];
  for (let i = 1; i < rows.length; i++) if (rows[i].start < rows[i - 1].end) out.push('overlap');
  // A gap between joined neighbours is the defect itself: report any hole in the chain.
  for (let i = 1; i < rows.length; i++) if (rows[i].start > rows[i - 1].end) out.push('gap');
  return out;
};

await pin('L3.1 reported case: Driving end 07:19 -> 07:08 pulls the open On Duty start to 07:08', async () => {
  await seed(fieldChain());
  const d = segAt(at(17, 3, 10));
  const e = A.saveEntry(d, { status: 'D', start: d.start, end: at(17, 7, 8) }, T);
  if (e) return 'save refused: ' + e;
  const s = getState();
  if (s.current.since !== at(17, 7, 8)) return `current.since is ${s.current.since - at(17, 0, 0)} min after midnight, want ${at(17, 7, 8) - at(17, 0, 0)}`;
  const bad = overlaps(s); if (bad.length) return 'chain not joined: ' + bad.join(',');
  return true;
});

await pin('L3.2 end pushed later into the open status still joins (07:19 -> 07:25)', async () => {
  await seed(fieldChain());
  const d = segAt(at(17, 3, 10));
  const e = A.saveEntry(d, { status: 'D', start: d.start, end: at(17, 7, 25) }, T);
  if (e) return 'save refused: ' + e;
  const s = getState();
  if (s.current.since !== at(17, 7, 25)) return 'current.since did not follow the later end';
  const bad = overlaps(s); if (bad.length) return 'chain not joined: ' + bad.join(',');
  return true;
});

await pin('L3.3 closed -> closed: On Duty end 03:10 -> 02:50 pulls the Driving start to 02:50, its end unmoved', async () => {
  await seed(fieldChain());
  const on = segAt(at(16, 22, 35));
  const e = A.saveEntry(on, { status: 'ON', start: on.start, end: at(17, 2, 50) }, T);
  if (e) return 'save refused: ' + e;
  const s = getState();
  const d = s.segments.find((x) => x.status === 'D' && x.end === at(17, 7, 19));
  if (!d) return 'the following Driving row is missing';
  if (d.start !== at(17, 2, 50)) return 'following Driving start did not follow the edited end';
  const bad = overlaps(s); if (bad.length) return 'chain not joined: ' + bad.join(',');
  return true;
});

await pin('L3.4 start side of the same join: Driving start 03:10 -> 03:25 pulls the previous On Duty end to 03:25', async () => {
  await seed(fieldChain());
  const d = segAt(at(17, 3, 10));
  const e = A.saveEntry(d, { status: 'D', start: at(17, 3, 25), end: d.end }, T);
  if (e) return 'save refused: ' + e;
  const s = getState();
  const on = s.segments.find((x) => x.status === 'ON' && x.start === at(16, 22, 35));
  if (!on) return 'the previous On Duty row is missing';
  if (on.end !== at(17, 3, 25)) return 'previous On Duty end did not follow the edited start';
  const bad = overlaps(s); if (bad.length) return 'chain not joined: ' + bad.join(',');
  return true;
});

await pin('L3.5 a gap that was already there is not closed: an edit elsewhere leaves it alone', async () => {
  await seed({
    segments: [
      { status: 'OFF', start: at(17, 1, 0), end: at(17, 2, 0), createdAt: 1 },
      { status: 'ON', start: at(17, 2, 20), end: at(17, 3, 0), createdAt: 2 },
    ],
    current: { status: 'D', since: at(17, 3, 0), createdAt: 3 },
  });
  const off = segAt(at(17, 1, 0));
  const e = A.saveEntry(off, { status: 'OFF', start: off.start, end: at(17, 1, 50) }, T);
  if (e) return 'save refused: ' + e;
  const on = getState().segments.find((x) => x.status === 'ON');
  if (on.start !== at(17, 2, 20)) return 'the pre-existing gap was closed by an unrelated edit';
  return true;
});

await pin('L3.6 absorb still governs a swallow: extending On Duty to 07:19 takes the Driving row in, nothing overlaps', async () => {
  await seed(fieldChain());
  const on = segAt(at(16, 22, 35));
  const row = { ...on, end: at(17, 7, 19) };
  const { patch, absorbed } = S.placeEntry(getState(), row, on, T);
  if (!absorbed.some((a) => a.seg.status === 'D' && a.seg.start === at(17, 3, 10))) return 'the swallowed Driving row was not reported absorbed';
  if (patch.segments.some((x) => x.status === 'D' && x.start === at(17, 3, 10))) return 'the swallowed Driving row is still in the record';
  if (patch.current.since !== at(17, 7, 19)) return 'the open status moved when it should not have';
  return true;
});

await pin('L3.7 the Log shows the open entry at the pulled-back start after the L3.1 edit', async () => {
  await seed(fieldChain());
  const d = segAt(at(17, 3, 10));
  const e = A.saveEntry(d, { status: 'D', start: d.start, end: at(17, 7, 8) }, T);
  if (e) return 'save refused: ' + e;
  render(h(App), root);
  await sleep(80);
  const t = root.textContent;
  if (!/since Tue 07:08/.test(t)) return 'live row does not read "since Tue 07:08"';
  return true;
});

await pin('L3.8 the reported dead end, now sayable: Off Duty from Sat 00:00 ends Mon 18:40 (66h 40m) in the add flow', async () => {
  await seed(fieldChain());
  render(h(App), root); await sleep(60);
  openSheet({ kind: 'add', step: 'long', draft: { status: 'OFF', start: at(14, 0, 0), len: 60, fixedLen: false } });
  await sleep(60);
  // Owner amendment B (2026-11-20): the add flow's end step IS the end clock picker (no
  // preset/stepper screen, no "Ends" tap) — its hour keys move the end.
  await click(all((n) => n.localName === 'button' && n.attributes['aria-label'] === '15 minutes later')[0]);
  if (currentSheet().draft.len !== 75) return 'end key +15: len ' + currentSheet().draft.len;
  if (!input('End time')) return 'the end clock picker is not on the add end step';
  if (!button(/^Yesterday$/)) return 'no Yesterday day chip on the end picker';
  await click(button(/^Yesterday$/));
  if (currentSheet().draft.len !== 2955) return 'chip: len ' + currentSheet().draft.len + ', want 2955 (Mon 01:15)';
  await typeIn('End time', '18:40');
  if (currentSheet().draft.len !== 4000) return 'typed: len ' + currentSheet().draft.len + ', want 4000';
  if (!root.textContent.includes('66h 40m')) return 'the length on screen does not read 66h 40m';
  await click(goBtn());
  await click(button(/^Add to my log$/));
  if (currentSheet() !== null) return 'sheet still open after save';
  const s = getState();
  const off = s.segments.find((x) => x.status === 'OFF' && x.start === at(14, 0, 0));
  if (!off || off.end !== at(16, 18, 40)) return 'saved Off Duty is not Sat 00:00 -> Mon 18:40';
  const bad = overlaps(s); if (bad.length) return 'chain not joined: ' + bad.join(',');
  return true;
});

await pin('L3.9 edit flow: the same end picker moves a three-day Off Duty end back to Mon 18:40, and the cascade joins the Driving after it', async () => {
  await seed({
    segments: [
      { status: 'OFF', start: at(14, 0, 0), end: at(17, 3, 0), createdAt: 1 },
      { status: 'D', start: at(17, 3, 0), end: at(17, 7, 19), createdAt: 2 },
    ],
    current: { status: 'ON', since: at(17, 7, 19), createdAt: 3 },
  });
  render(h(App), root); await sleep(60);
  const off = segAt(at(14, 0, 0));
  openSheet({ kind: 'edit', seg: off, step: 'long', draft: { status: 'OFF', start: off.start, len: off.end - off.start } });
  await sleep(60);
  // EDIT-FIX (Lorico, 2026-11-20): the edit end step IS the end clock picker, as in the add
  // flow — no "Ends" tap to reveal it, no length presets.
  if (endsTap()) return 'the edit end picker still hides behind an "Ends" tap';
  if (!/When did it really end\?/.test(root.textContent) || /How long did it really last\?/.test(root.textContent)) return 'the edit end step does not ask when it ended';
  if (!input('End time')) return 'the end clock picker is not shown directly on the edit end step';
  await click(button(/^Yesterday$/));
  await typeIn('End time', '18:40');
  if (currentSheet().draft.len !== 4000) return 'len ' + currentSheet().draft.len + ', want 4000';
  await click(goBtn());
  await click(button(/^Save the change$/));
  if (currentSheet() !== null) return 'sheet still open after save';
  const s = getState();
  const o = s.segments.find((x) => x.status === 'OFF');
  const d = s.segments.find((x) => x.status === 'D');
  if (!o || o.end !== at(16, 18, 40)) return 'Off Duty end is not Mon 18:40';
  if (!d || d.start !== at(16, 18, 40)) return 'the Driving start did not follow the pulled-back end';
  if (d.end !== at(17, 7, 19)) return 'the Driving end moved when it should not have';
  if (s.current.since !== at(17, 7, 19)) return 'the open status moved when it should not have';
  return true;
});

await pin('L3.10 an end beyond the chips: the "Another day" date carries Wed 20:00 -> Fri 07:30', async () => {
  await seed(fieldChain());
  render(h(App), root); await sleep(60);
  openSheet({ kind: 'add', step: 'long', draft: { status: 'OFF', start: at(11, 20, 0), len: 60, fixedLen: false } });
  await sleep(60);
  const date = all((n) => n.localName === 'input' && n.attributes.type === 'date')[0];
  if (!date) return 'no date input on the end picker';
  date.value = '2026-11-13'; fire(date, 'input'); await sleep(50);
  await typeIn('End time', '07:30');
  if (currentSheet().draft.len !== 2130) return 'len ' + currentSheet().draft.len + ', want 2130 (35h 30m)';
  return true;
});

await pin('L3.11 a whole entry MOVED past its own span drags nobody: On Duty 22:35-03:10 moved to 04:00-05:00 leaves the Driving before it alone', async () => {
  await seed(fieldChain());
  const on = segAt(at(16, 22, 35));
  const e = A.saveEntry(on, { status: 'ON', start: at(17, 4, 0), end: at(17, 5, 0) }, T);
  if (e) return 'save refused: ' + e;
  const s = getState();
  const prev = s.segments.find((x) => x.status === 'D' && x.start === at(16, 18, 58));
  if (!prev) return 'the previous Driving row is missing';
  if (prev.end !== at(16, 22, 35)) return `previous Driving end dragged to ${prev.end}, want ${at(16, 22, 35)} (unchanged)`;
  const bad = overlapsOnly(s); if (bad.length) return 'saved log overlaps: ' + bad.join(',');
  return true;
});

await pin('L3.12 a whole entry MOVED earlier does not drag the open status back with it', async () => {
  await seed(fieldChain());
  const d = segAt(at(17, 3, 10));
  const e = A.saveEntry(d, { status: 'D', start: at(16, 20, 0), end: at(16, 22, 0) }, T);
  if (e) return 'save refused: ' + e;
  const s = getState();
  if (s.current.since !== at(17, 7, 19)) return 'the open status was dragged back to ' + s.current.since;
  const bad = overlapsOnly(s); if (bad.length) return 'saved log overlaps: ' + bad.join(',');
  return true;
});

await pin('L3.13 a what-if row abutting the edited entry is never joined', async () => {
  const s0 = {
    segments: [
      { status: 'ON', start: at(17, 1, 0), end: at(17, 3, 0), createdAt: 1 },
      { status: 'D', start: at(17, 3, 0), end: at(17, 5, 0), createdAt: 2, tentative: true },
    ],
    tentative: [], current: null,
  };
  const orig = s0.segments[0];
  const { patch } = S.placeEntry(s0, { ...orig, end: at(17, 2, 30) }, orig, T);
  const wt = patch.segments.find((x) => x.tentative);
  if (!wt || wt.start !== at(17, 3, 0)) return 'the what-if row was dragged';
  return true;
});

await pin('L3.14 a status-only edit leaves every neighbour and the open status exactly as they were', async () => {
  await seed(fieldChain());
  const on = segAt(at(16, 22, 35));
  const e = A.saveEntry(on, { status: 'SB', start: on.start, end: on.end }, T);
  if (e) return 'save refused: ' + e;
  const s = getState();
  const dBefore = s.segments.find((x) => x.status === 'D' && x.end === at(16, 22, 35));
  const dAfter = s.segments.find((x) => x.status === 'D' && x.start === at(17, 3, 10));
  if (!dBefore || !dAfter) return 'a neighbouring Driving row changed shape';
  if (s.current.since !== at(17, 7, 19)) return 'the open status moved';
  return true;
});

await pin('L3.15 the Check step preview is the record the save leaves (placeEntry patch == saved state)', async () => {
  await seed(fieldChain());
  const on = segAt(at(16, 22, 35));
  const row = { ...on, end: at(17, 2, 50), createdAt: Number.MAX_SAFE_INTEGER };
  const { patch } = S.placeEntry(getState(), row, on, T);
  const e = A.saveEntry(on, { status: 'ON', start: on.start, end: at(17, 2, 50) }, T);
  if (e) return 'save refused: ' + e;
  const s = getState();
  const shape = (segs) => segs.map((x) => [x.status, x.start, x.end].join(':')).sort().join('|');
  if (shape(patch.segments) !== shape(s.segments)) return 'preview segments != saved segments';
  if ((patch.current?.since ?? null) !== (s.current?.since ?? null)) return 'preview open status != saved open status';
  return true;
});

await pin('L3.16 a what-if row ending where the edited entry starts is never joined either (the start-side filter)', async () => {
  const s0 = {
    segments: [
      { status: 'D', start: at(17, 1, 0), end: at(17, 3, 0), createdAt: 1, tentative: true },
      { status: 'ON', start: at(17, 3, 0), end: at(17, 5, 0), createdAt: 2 },
    ],
    tentative: [], current: null,
  };
  const orig = s0.segments[1];
  const { patch } = S.placeEntry(s0, { ...orig, start: at(17, 3, 30) }, orig, T);
  const wt = patch.segments.find((x) => x.tentative);
  if (!wt || wt.end !== at(17, 3, 0)) return 'the what-if row was dragged';
  const on = patch.segments.find((x) => x.status === 'ON');
  if (!on || on.start !== at(17, 3, 30)) return 'the edit itself did not land';
  return true;
});

render(null, root);
let fails = 0;
for (const [st, name, why] of res) { console.log(`${st} ${name}${why ? ' — ' + why : ''}`); if (st === 'FAIL') fails++; }
console.log(`\n${res.length - fails} pass, ${fails} fail`);
console.log(fails ? 'CASCADE FAIL' : 'CASCADE OK');
process.exit(fails ? 1 : 0);

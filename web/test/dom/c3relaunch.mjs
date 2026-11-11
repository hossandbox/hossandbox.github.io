// Capstone C3 — the relaunch pin (audit §3 M7; found by the c3 browser lane in build run 21).
// The appointment rides in the existing load draft. A save carrying one must survive a RELAUNCH:
// the store reads the save at MODULE LOAD (loadSaved → parseSaved), before later module-level
// consts exist — a const helper on that path threw in its TDZ, parseSaved's catch swallowed it,
// and the driver's whole log came up blank. The shim lane cannot see that (it imports the store
// with nothing saved), so this lane seeds the save BEFORE the first import, one fresh process.
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const T = Math.floor(new Date(2026, 10, 9, 3, 4).getTime() / 60000);
const segs = [
  { status: 'OFF', start: T - 600, end: T - 300, createdAt: 1 },
  { status: 'D', start: T - 300, end: T - 120, createdAt: 2 },
];
const lc = { miles: 300, dwell: 120, dwellOff: false, leaveIn: 0, waitOff: false, answered: true, appt: T + 540 };
mem.set('hos-sandbox-v1', JSON.stringify({ segments: segs, current: { status: 'ON', since: T - 120, createdAt: 3 }, config: { timeZone: 'America/New_York' }, tzChosen: true, loadCheck: lc }));
const S = await import('../../src/store.ts');
const st = S.getState();
const res = [];
const ok = (name, cond, info = '') => res.push({ pass: !!cond, name, info });
ok('relaunch with a saved appointment keeps the log (2 rows + the live status)', st.segments.length === 2 && st.current?.status === 'ON', JSON.stringify({ n: st.segments.length, cur: st.current }));
ok('relaunch with a saved appointment keeps the appointment', st.loadCheck.appt === T + 540, JSON.stringify(st.loadCheck));
ok('relaunch keeps the chosen zone (not a blank first-run state)', st.tzChosen === true && st.config.timeZone === 'America/New_York', JSON.stringify(st.config));
let fails = 0;
for (const r of res) { if (!r.pass) fails++; console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : '  — ' + r.info}`); }
console.log(`\n${res.length - fails} pass, ${fails} fail`);
if (fails) { console.log('C3 RELAUNCH FAIL'); process.exit(1); }
console.log('C3 RELAUNCH OK');

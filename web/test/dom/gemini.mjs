// Gemini round (2026-11-19): Gemini's live-site bug breakdown, the items this DOM lane can pin
// (the layout items C/D/E/F are pinned in a real browser by layout.mjs, section (d)).
//   A  Log: "Entries on this day (N)" counts the open entry whenever it is drawn as a row.
//   B  Load check: the counter counts the four screens it shows (n of 4; the appointment is
//      "4 of 4 · Optional"); four dots, the optional one marked.
//   G  Compare: "N long rests" counts a run of touching off-duty/sleeper steps (Sleeper 7h →
//      "Extend to a full 10-hour reset" 3h is ONE long rest), and the split card names split pairs.
//   H  More → Rules copy points at the real control: the "Exceptions this shift" row at the bottom
//      of Now — and that row is on Now, and opens the two toggles.
//   I  Load check: a typed distance the check cannot use (−100, 0, empty, 3001) says so inline and
//      holds Next; the old distance is never silently used.
// Every pin reports on its own line; exit 1 on a fail.
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
let Tms = new Date(2026, 10, 19, 16, 20, 5).getTime(); // local wall time: Thu Nov 19 2026, 16:20
Date.now = () => Tms;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'gemini';
globalThis.requestAnimationFrame = (cb) => { cb(0); return 1; };
globalThis.cancelAnimationFrame = () => {};
globalThis.scrollTo = () => {};
const { render, h } = await import('preact');
const A = await import('../../src/app.tsx');
const S = await import('../../src/store.ts');
const E = await import('../../../engine/src/index.ts');
const { App, setLaunchNotice, openSheet } = A;
const { setState, getState, deviceTz, DEFAULT_LOADCHECK } = S;
setLaunchNotice?.(false);
const sleep = (ms) => new Promise((r) => rawSetTimeout(r, ms));
const res = [];
const pin = async (name, f) => { try { const r = await f(); res.push([r === true ? 'PASS' : 'FAIL', name, r === true ? '' : String(r)]); } catch (e) { res.push(['FAIL', name, 'threw: ' + (e && e.message || e)]); } };
const root = document.createElement('div'); document.body.appendChild(root);
const T = Math.floor(Tms / 60000);
const base = () => ({ segments: [], tentative: [], current: null, drivingView: true, zoneAck: null, seededAt: null, dayCloses: [], historyAcknowledged: true, theme: 'day', themeChosen: true, darkDriveAtNight: true, disclaimerAcked: true, tzChosen: true, alertsOn: false, speakAlerts: false, speechAsked: true, speakAskOpen: false, nowOverride: null, tab: 'now', nowCard: 'dial', nowCardAsked: true, logResolved: false, loadCheck: { ...DEFAULT_LOADCHECK }, config: { ...getState().config, timeZone: deviceTz } });
const seed = async (rec) => { openSheet(null); render(null, root); setState({ ...base(), ...rec }); render(h(App, {}), root); await sleep(60); };
const all = (pred) => { const out = []; const w = (n) => { if (pred(n)) out.push(n); n.childNodes.forEach(w); }; w(root); return out; };
const cls = (n) => (n.attributes && n.attributes.class) || '';
const has = (n, c) => cls(n).split(/\s+/).includes(c);
const fire = (node, type, extra = {}) => { for (const t of [type, type[0].toUpperCase() + type.slice(1)]) { const ev = { type: t, target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...extra }; for (const f of node.listeners[t] ?? []) f.call(node, ev); } };
const activePage = () => all((n) => n.localName === 'section' && has(n, 'page') && has(n, 'is-active'))[0];
const inPage = (pred) => { const pg = activePage(); const out = []; const w = (n) => { if (pred(n)) out.push(n); n.childNodes.forEach(w); }; if (pg) w(pg); return out; };
const button = (text) => inPage((n) => n.localName === 'button' && n.textContent.includes(text))[0];
const click = async (text) => { const b = button(text); if (!b) throw new Error(`no button "${text}"`); fire(b, 'click'); await sleep(40); };
const pageText = () => (activePage() || root).textContent;
// Gemini's state: DEMO, then one status tap (Off Duty) → a current status with nothing behind it.
const gemini = { segments: [], current: { status: 'OFF', since: T - 119, createdAt: 1 }, historyAcknowledged: false };

/* ---------------- A. Log entry count ---------------- */
await pin('A1. Gemini state (open entry only): title reads "Entries on this day (1)" over the one live row', async () => {
  await seed({ ...gemini, tab: 'log' });
  const t = pageText(); const m = t.match(/Entries on this day \((\d+)\)/);
  const rows = inPage((n) => n.localName === 'button' && has(n, 'entry'));
  if (!m) return 'no title';
  return (m[1] === '1' && rows.length === 1 && has(rows[0], 'live')) || `title (${m[1]}), rows ${rows.length}`;
});
await pin('A2. closed rows + open entry: the count equals the rows drawn (2 + live = 3)', async () => {
  await seed({ tab: 'log', segments: [{ status: 'OFF', start: T - 600, end: T - 300 }, { status: 'D', start: T - 300, end: T - 60 }], current: { status: 'ON', since: T - 60 } });
  const m = pageText().match(/Entries on this day \((\d+)\)/);
  const rows = inPage((n) => n.localName === 'button' && has(n, 'entry'));
  return (m && Number(m[1]) === rows.length && rows.length === 3) || `title ${m && m[1]}, rows ${rows.length}`;
});
await pin('A3. a past day (no live row drawn) counts only its closed rows', async () => {
  await seed({ tab: 'log', segments: [{ status: 'OFF', start: T - 1440 - 600, end: T - 1440 - 300 }, { status: 'D', start: T - 1440 - 300, end: T - 1440 - 60 }], current: { status: 'ON', since: T - 60 } });
  const prev = inPage((n) => n.localName === 'button' && n.attributes['aria-label'] === 'Previous day')[0];
  fire(prev, 'click'); await sleep(40);
  const m = pageText().match(/Entries on this day \((\d+)\)/);
  const rows = inPage((n) => n.localName === 'button' && has(n, 'entry'));
  const live = rows.filter((r) => has(r, 'live')).length;
  return (m && Number(m[1]) === rows.length && live === 0) || `title ${m && m[1]}, rows ${rows.length}, live ${live}`;
});
await pin('A4. nothing logged, no status: "(0)" and the empty line', async () => {
  await seed({ tab: 'log' });
  const t = pageText();
  return (/Entries on this day \(0\)/.test(t) && /Nothing logged on this day/.test(t)) || t.slice(0, 200);
});

/* ---------------- B. Load-check step counter (re-aimed for A6, 2026-11-20) ---------------- */
// A6: Load check shares Log add's "Step N of 4" counter under the bar (.ed-count), with Appointment on step 3 (Optional) before Receiver dwell on step 4.
const counter = () => { const c = inPage((n) => has(n, 'ed-count'))[0]; return c ? c.textContent : null; };
const dots = () => { const d = inPage((n) => has(n, 'flow-dots'))[0]; return d ? d.childNodes.map((c) => cls(c).trim()) : null; };
await pin('B1. A6: the four screens read Step 1 of 4, Step 2 of 4, Step 3 of 4 — Optional, Step 4 of 4 (Appointment before Receiver)', async () => {
  await seed({ ...gemini, tab: 'load', planReturn: 'plan' });
  const seen = [counter()];
  await click('Next: when you leave'); seen.push(counter());
  await click('Next: appointment time'); seen.push(counter());
  const q3 = /Appointment at the receiver\?/.test(pageText());
  await click('Next: time at the receiver'); seen.push(counter());
  const q4 = /How long at the receiver\?/.test(pageText());
  const want = ['Step 1 of 4', 'Step 2 of 4', 'Step 3 of 4 — Optional', 'Step 4 of 4'];
  return (JSON.stringify(seen) === JSON.stringify(want) && q3 && q4) || `seen ${JSON.stringify(seen)}, q3 ${q3}, q4 ${q4}`;
});
await pin('B2. A6: four dots; the third (Appointment) is marked optional; filled up to the screen shown', async () => {
  await seed({ ...gemini, tab: 'load', planReturn: 'plan' });
  const d1 = dots();
  await click('Next: when you leave'); await click('Next: appointment time'); await click('Next: time at the receiver');
  const d4 = dots();
  const on = (d) => d.filter((c) => c.split(/\s+/).includes('on')).length;
  const opt = (d) => d.map((c, i) => c.split(/\s+/).includes('opt') ? i : -1).filter((i) => i >= 0);
  return (d1 && d4 && d1.length === 4 && d4.length === 4 && on(d1) === 1 && on(d4) === 4 && JSON.stringify(opt(d1)) === '[2]' && JSON.stringify(opt(d4)) === '[2]') || `d1 ${JSON.stringify(d1)} d4 ${JSON.stringify(d4)}`;
});
await pin('B3. A6: Back from step 4 (receiver) returns to Step 3 of 4 — Optional (appointment)', async () => {
  await seed({ ...gemini, tab: 'load', planReturn: 'plan' });
  await click('Next: when you leave'); await click('Next: appointment time'); await click('Next: time at the receiver');
  const back = inPage((n) => n.localName === 'button' && n.attributes['aria-label'] === 'Previous question')[0];
  fire(back, 'click'); await sleep(40);
  return counter() === 'Step 3 of 4 — Optional' || `counter ${counter()}`;
});

/* ---------------- G. Compare: long rests ---------------- */
const geminiPlan = () => E.planTripAll([{ status: 'OFF', start: T - 119, end: T }], {
  departure: T, distanceMiles: 1200, mph: 55, config: getState().config,
  stops: [{ atMile: 1200, minutes: 120, status: 'ON', label: 'Receiver' }],
});
await pin('G1. engine fixture (Gemini load: 1200 mi, OFF 1h59 behind): the split plan has Sleeper 7h touching "Extend to a full 10-hour reset" 3h', async () => {
  const p = geminiPlan().split.steps;
  const i = p.findIndex((st) => st.segment.status === 'SB' && st.segment.end - st.segment.start === 420);
  const nx = p[i + 1];
  return (i >= 0 && nx && /Extend to a full 10-hour reset/.test(nx.reason) && nx.segment.start === p[i].segment.end && nx.segment.end - nx.segment.start === 180) || p.map((st) => `${st.segment.status}${st.segment.end - st.segment.start}:${st.reason.slice(0, 30)}`).join(' | ');
});
await pin('G2. longRestCount: SB 7h + OFF 3h touching = 1 long rest (was counted 0)', async () => {
  const p = geminiPlan().split;
  const old = p.steps.filter((x) => x.segment.status !== 'D' && x.segment.status !== 'ON' && x.segment.end - x.segment.start >= 600).length;
  return (A.longRestCount(p) === 1 && old === 0) || `new ${A.longRestCount(p)}, old-rule ${old}`;
});
await pin('G3. longRestCount on synthetic plans: separate 7h + 3h (driving between) = 0; a 10h reset = 1; 34h = 1; 10h then later 10h = 2', async () => {
  const mk = (xs) => { let t = 0; return { steps: xs.map(([st, m, r = '']) => { const seg = { status: st, start: t, end: t + m }; t += m; return { segment: seg, fromMile: 0, toMile: 0, reason: r }; }) }; };
  const a = A.longRestCount(mk([['SB', 420], ['D', 300], ['OFF', 180]]));
  const b = A.longRestCount(mk([['D', 600], ['OFF', 600]]));
  const c = A.longRestCount(mk([['OFF', 2040]]));
  const d = A.longRestCount(mk([['OFF', 600], ['D', 600], ['SB', 300], ['OFF', 400]]));
  const e = A.longRestCount(mk([['OFF', 300], ['SB', 300], ['OFF', 300]]));
  return (a === 0 && b === 1 && c === 1 && d === 2 && e === 1) || `a ${a} b ${b} c ${c} d ${d} e ${e}`;
});
await pin('G4. splitPairCount counts the planner\'s pairing steps only', async () => {
  const mk = (xs) => ({ steps: xs.map(([st, r]) => ({ segment: { status: st, start: 0, end: 1 }, fromMile: 0, toMile: 0, reason: r })) });
  const n = A.splitPairCount(mk([['SB', 'Sleeper 7h — opens a split (long leg, §395.1(g)(1)(ii)(B))'], ['D', 'Drive 300 mi'], ['OFF', 'Off duty 3h — pairs with the 7h rest ending 04:00 (split; clocks recalc from that rest\'s end)'], ['OFF', 'Extend to a full 10-hour reset']]));
  return n === 1 || `got ${n}`;
});
// C7 (taste, 2026-11-20): plainStepReason renders "opens a split (long leg, …)" as "starts a sleeper split (7h+ in the sleeper, …)".
await pin('G5. rendered: load answer → Compare anyway → the Sleeper splits card says "1 long rest", and its schedule shows the extend-to-10h step', async () => {
  await seed({ ...gemini, tab: 'load', planReturn: 'plan', loadCheck: { ...DEFAULT_LOADCHECK, answered: true } });
  if (button('Compare anyway')) await click('Compare anyway');
  const card = inPage((n) => n.localName === 'button' && has(n, 'plancard') && n.textContent.includes('Sleeper splits'))[0];
  if (!card) return 'no Sleeper splits card: ' + pageText().slice(0, 300);
  fire(card, 'click'); await sleep(40);
  const sub = card.textContent;
  const itin = (inPage((n) => n.localName === 'ol' && has(n, 'itin'))[0] || { textContent: '' }).textContent;
  return (/\b1 long rest\b/.test(sub) && !/\b0 long rests\b/.test(sub) && /Extend to a full 10-hour reset/.test(itin) && /starts a sleeper split/.test(itin)) || `card "${sub}" | itin has extend ${/Extend/.test(itin)}`;
});

/* ---------------- H. Exceptions this shift ---------------- */
await pin('H1. More → Rules no longer promises a Now "section" (re-aimed by audit A8, 2026-11-20: the copy became a button that opens the sheet itself)', async () => {
  await seed({ ...gemini, tab: 'settings' });
  const t = pageText();
  const row = inPage((n) => n.localName === 'button' && has(n, 'rowbtn') && n.textContent.includes('Exceptions this shift'))[0];
  if (!row || /under "Exceptions this shift"/.test(t) || /scroll to the bottom/.test(t)) return `row ${!!row}`;
  fire(row, 'click'); await sleep(40);
  const all2 = root.textContent;
  return (/Adverse driving conditions/.test(all2) && /16-hour short-haul day/.test(all2)) || 'the button did not open the exceptions sheet';
});
await pin('H2. the row the copy points to is on Now, after the content and before the status dock, and opens the two exception toggles', async () => {
  await seed({ ...gemini, tab: 'now' });
  const pg = activePage(); const flat = []; const w = (n) => { flat.push(n); n.childNodes.forEach(w); }; w(pg);
  const row = flat.find((n) => n.localName === 'button' && has(n, 'rowbtn') && n.textContent.includes('Exceptions this shift'));
  const dock = flat.find((n) => has(n, 'dock'));
  if (!row || !dock) return `row ${!!row} dock ${!!dock}`;
  const before = flat.indexOf(row) < flat.indexOf(dock);
  fire(row, 'click'); await sleep(40);
  const t = root.textContent;
  return (before && /Adverse driving conditions/.test(t) && /16-hour short-haul day/.test(t)) || `before dock ${before}; sheet ${/Adverse driving/.test(t)}`;
});

/* ---------------- I. Typed miles ---------------- */
const milesInput = () => inPage((n) => n.localName === 'input' && n.attributes.type === 'number')[0];
const typeMiles = async (v) => { const i = milesInput(); i.value = v; fire(i, 'input'); await sleep(40); };
const nextBtn = () => button('Next: when you leave');
// preact writes `disabled` as a property where the node has one, else as an attribute (the shim)
const isOff = (b) => b.disabled === true || (b.attributes && 'disabled' in b.attributes && b.attributes.disabled !== 'false');
// A6 (taste, 2026-11-20): untouched fresh loadCheck defaults to LOAD_DEFAULT_MILES (550) on mount, and step counter reads "Step N of 4".
await pin('I1. typing -100: inline message, the box keeps -100, Next is disabled, the stored distance is untouched', async () => {
  await seed({ ...gemini, tab: 'load', planReturn: 'plan', loadCheck: { ...DEFAULT_LOADCHECK, miles: A.LOAD_DEFAULT_MILES } });
  await typeMiles('-100');
  const msg = inPage((n) => n.attributes && n.attributes.id === 'miles-problem')[0];
  const i = milesInput();
  return (msg && /at least 1/.test(msg.textContent) && msg.attributes.role === 'alert' && String(i.value) === '-100' && i.attributes['aria-invalid'] === 'true' && isOff(nextBtn()) && getState().loadCheck.miles === A.LOAD_DEFAULT_MILES) || `msg ${msg && msg.textContent}, value ${i.value}, next disabled ${isOff(nextBtn())}, miles ${getState().loadCheck.miles}`;
});
await pin('I2. Next on an invalid distance does not advance (no silent fall-back)', async () => {
  await seed({ ...gemini, tab: 'load', planReturn: 'plan', loadCheck: { ...DEFAULT_LOADCHECK, miles: A.LOAD_DEFAULT_MILES } });
  await typeMiles('-100');
  // fire() runs the handler even on a disabled node (the shim has no disabled semantics), so this
  // also pins the handler's own guard, not just the attribute.
  fire(nextBtn(), 'click');
  await sleep(40);
  return (/How far is the load\?/.test(pageText()) && counter() === 'Step 1 of 4') || `moved on: ${counter()}`;
});
await pin('I3. 0, empty and 3001 are refused the same way; NaN-ish (empty from the number box) too', async () => {
  const out = [];
  for (const v of ['0', '', '3001', '  ']) {
    await seed({ ...gemini, tab: 'load', planReturn: 'plan', loadCheck: { ...DEFAULT_LOADCHECK, miles: A.LOAD_DEFAULT_MILES } });
    await typeMiles(v);
    out.push(`${JSON.stringify(v)}:${isOff(nextBtn()) && !!inPage((n) => n.attributes && n.attributes.id === 'miles-problem')[0] && getState().loadCheck.miles === A.LOAD_DEFAULT_MILES}`);
  }
  return out.every((x) => x.endsWith(':true')) || out.join(' ');
});
await pin('I4. correcting to 650 clears the message, stores 650, Next advances and the check runs on 650', async () => {
  await seed({ ...gemini, tab: 'load', planReturn: 'plan', loadCheck: { ...DEFAULT_LOADCHECK, miles: A.LOAD_DEFAULT_MILES } });
  await typeMiles('-100'); await typeMiles('650');
  const msg = inPage((n) => n.attributes && n.attributes.id === 'miles-problem')[0];
  const ok1 = !msg && getState().loadCheck.miles === 650 && !isOff(nextBtn());
  await click('Next: when you leave');
  return (ok1 && counter() === 'Step 2 of 4') || `msg ${!!msg}, miles ${getState().loadCheck.miles}, counter ${counter()}`;
});
await pin('I5. a stepper or chip after a bad value clears it and applies (−100 then +50 → 600)', async () => {
  await seed({ ...gemini, tab: 'load', planReturn: 'plan', loadCheck: { ...DEFAULT_LOADCHECK, miles: A.LOAD_DEFAULT_MILES } });
  await typeMiles('-100');
  const plus = inPage((n) => n.localName === 'button' && n.attributes['aria-label'] === 'Add 50 miles')[0];
  fire(plus, 'click'); await sleep(40);
  const msg = inPage((n) => n.attributes && n.attributes.id === 'miles-problem')[0];
  return (!msg && getState().loadCheck.miles === A.LOAD_DEFAULT_MILES + 50 && String(milesInput().value) === String(A.LOAD_DEFAULT_MILES + 50) && !isOff(nextBtn())) || `msg ${!!msg}, miles ${getState().loadCheck.miles}, value ${milesInput().value}`;
});
await pin('I6. loadMilesProblem unit: 1 and 3000 pass; 0, -100, "", "abc", 3001 fail', async () => {
  const f = A.loadMilesProblem;
  return (f('1') === null && f('3000') === null && f('1200') === null && [ '0', '-100', '', 'abc', '3001', '0.4' ].every((v) => typeof f(v) === 'string')) || 'unit mismatch';
});

for (const [st, name, info] of res) console.log(`${st}  ${name}${info ? `  — ${info}` : ''}`);
const fails = res.filter((r) => r[0] !== 'PASS').length;
console.log(`\ngemini lane: ${res.length - fails}/${res.length} pass`);
render(null, root);
process.exit(fails ? 1 : 0);

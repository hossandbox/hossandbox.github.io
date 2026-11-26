// Split-Sleeper Rescue Simulator DOM & engine verification suite (Plan tool #7).
// Pins R1–R8 (+ ClockPick compliance): every expected clock/verdict is hand-computed in
// comments AND cross-checked directly against engine/src/index.ts.
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
let Tms = new Date(2026, 10, 11, 13, 0, 0).getTime(); // Wed Nov 11 2026 13:00 local
Date.now = () => Tms;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'rescue';
globalThis.requestAnimationFrame = (cb) => { cb(0); return 1; };
globalThis.cancelAnimationFrame = () => {};
{
  const initMain = (n, t) => {
    if (String(t).toLowerCase() === 'main') {
      n.clientWidth = 400;
      n.scrollLeft = 0;
      n.scrollTo = (opts) => { if (opts && typeof opts.left === 'number') n.scrollLeft = opts.left; };
    }
    return n;
  };
  const rawCreate = document.createElement.bind(document);
  const rawCreateNS = document.createElementNS.bind(document);
  document.createElement = (t) => initMain(rawCreate(t), t);
  document.createElementNS = (ns, t) => initMain(rawCreateNS(ns, t), t);
}

const { render, h } = await import('preact');
const A = await import('../../src/app.tsx');
const S = await import('../../src/store.ts');
const R = await import('../../src/rescue.ts');
const E = await import('../../../engine/src/index.ts');

const { App, setLaunchNotice, openSheet } = A;
const { setState, getState } = S;
setLaunchNotice?.(false);
A.setDriverGateBypassForTest?.(true);

const sleep = (ms) => new Promise((r) => rawSetTimeout(r, ms));
const res = [];
const pin = async (name, f) => {
  try {
    const r = await f();
    res.push([r === true ? 'PASS' : 'FAIL', name, r === true ? '' : String(r)]);
  } catch (e) {
    res.push(['FAIL', name, 'threw: ' + (e && e.stack ? e.stack.split('\n')[0] : e)]);
  }
};

const root = document.createElement('div');
document.body.appendChild(root);

const all = (pred, scope = root) => {
  const out = [];
  const w = (n) => { if (pred(n)) out.push(n); n.childNodes.forEach(w); };
  w(scope);
  return out;
};
const cls = (n) => (n.attributes && n.attributes.class) || '';
const has = (n, c) => cls(n).split(/\s+/).includes(c);
const fire = (node, type, extra = {}) => {
  for (const t of [type, type[0].toUpperCase() + type.slice(1)].filter(Boolean)) {
    const ev = { type: t, target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...extra };
    for (const f of node.listeners[t] ?? []) f.call(node, ev);
  }
};

const cfgChi = { ...S.INITIAL_STATE.config, cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false };
const chi = (d, h0, m0 = 0) => E.localToMinute(2026, 11, d, h0, 'America/Chicago') + m0;

// Shared base fixture (America/Chicago CST):
//   Tue Nov 10 20:00 -> Wed Nov 11 06:00: 10h OFF reset (plain OFF, not SB)
//   Wed Nov 11 06:00 -> 11:00: 5h D (300m driving)
//   Wed Nov 11 11:00 -> 13:00: 2h ON (120m on-duty; >=30m non-driving so 30m break clock is fresh 480m)
// At now = Wed 13:00 CST:
//   driveUsed = 300m (5h)  -> driveRemaining = 360m (6h)
//   windowUsed = 420m (7h) -> windowRemaining = 420m (7h, expires Wed 20:00)
//   cycleUsed = 420m (7h)  -> cycleRemaining = 3780m (63h)
const NOW_13 = chi(11, 13, 0);
const BASE_SEGS = [
  { status: 'OFF', start: chi(10, 20, 0), end: chi(11, 6, 0), createdAt: 1 },
  { status: 'D', start: chi(11, 6, 0), end: chi(11, 11, 0), createdAt: 2 },
  { status: 'ON', start: chi(11, 11, 0), end: NOW_13, createdAt: 3 },
];

const seed = async (rec) => {
  openSheet(null);
  A.openWeekPlanner(false);
  A.openRolloutPlanner(false);
  A.openRescuePlanner(false);
  A.openStackPlanner(false);
  A.openMotelPlanner(false);
  A.openLegalPlanner(false);
  A.openFlipPlanner(false);
  A.openMilesPlanner(false);
  setState({
    ...S.INITIAL_STATE,
    tentative: [],
    drivingView: false,
    disclaimerAcked: true,
    tzChosen: true,
    historyAcknowledged: true,
    alertsOn: false,
    speakAlerts: false,
    speechAsked: true,
    speakAskOpen: false,
    config: cfgChi,
    ...rec,
  });
  await sleep(60);
};

render(h(App, {}), root);
await sleep(100);
const planPage = () => all((n) => n.localName === 'section' && has(n, 'page-plan'))[0];
const planRoom = () => all((n) => n.localName === 'section' && has(n, 'page-tool'))[0];

/* ---------------- R1: Straight 10 misses, 8/2 rescues ---------------- */
// Math (from BASE_SEGS at Wed 13:00, dockWait = 2h = 120m, remainingDrive = 6h = 360m, deadline = Wed 21:30):
//   - Roll now: 13:00-15:00 ON + 15:00-21:00 D -> 14h window expires Wed 20:00 -> WINDOW_14 violation (60m). Illegal.
//   - Straight 10: 13:00-23:00 OFF (10h) -> release Wed 23:00 -> finish Thu 05:00 -> misses Wed 21:30 by 450m (7h 30m).
//   - 8/2 split (short-first): 13:00-15:00 OFF (2h) -> release Wed 15:00 -> 15:00-21:00 D (6h, finish Wed 21:00, 30m early!)
//     -> 21:00-05:00 SB (8h). 2h+8h=10h qualifies; 13:00-15:00 excluded from 14h => windowUsed = 13h <= 14h, drive = 11h <= 11h.
//   - 7/3 split (short-first): 13:00-16:00 OFF (3h) -> release Wed 16:00 -> finish Wed 22:00 -> misses Wed 21:30 by 30m.
await pin('R1. Straight 10 misses deadline while 8/2 split rescues (verdicts, ordering, and recommendation differ correctly)', async () => {
  const deadline2130 = chi(11, 21, 30);
  const sim = R.simulateRescue({
    segments: BASE_SEGS,
    now: NOW_13,
    config: cfgChi,
    dockWaitMinutes: 120,
    distanceMode: 'hours',
    miles: 0,
    mph: 55,
    driveMinutesDirect: 360,
    deadlineMinute: deadline2130,
  });

  const s82 = sim.strategies.find((x) => x.id === 'split82');
  const s73 = sim.strategies.find((x) => x.id === 'split73');
  const s10 = sim.strategies.find((x) => x.id === 'straight10');
  const sRoll = sim.strategies.find((x) => x.id === 'roll_now');

  const okLogic = !sim.noRescue
    && sim.recommended?.id === 'split82'
    && sim.strategies[0].id === 'split82'
    && s82?.hosLegal === true && s82.meetsDeadline === true && s82.makesIt === true && s82.recommended === true
    && s82.releaseAt === chi(11, 15, 0) && s82.finishAt === chi(11, 21, 0) && s82.deadlineSlack === 30 && s82.savedVsStraight10 === 480
    && s10?.hosLegal === true && s10.meetsDeadline === false && s10.makesIt === false && s10.recommended === false
    && s10.releaseAt === chi(11, 23, 0) && s10.finishAt === chi(12, 5, 0) && s10.deadlineSlack === -450
    && s73?.hosLegal === true && s73.meetsDeadline === false && s73.finishAt === chi(11, 22, 0) && s73.deadlineSlack === -30
    && sRoll?.hosLegal === false && sRoll.violations.some((v) => v.kind === 'WINDOW_14' && v.minutes === 60);

  return okLogic || JSON.stringify({
    noRescue: sim.noRescue,
    rec: sim.recommended?.id,
    order: sim.strategies.map((x) => [x.id, x.hosLegal, x.makesIt, x.finishShort]),
    s82: s82 && [s82.releaseAt, s82.finishAt, s82.deadlineSlack, s82.savedVsStraight10],
    s10: s10 && [s10.releaseAt, s10.finishAt, s10.deadlineSlack],
    sRollV: sRoll?.violations,
  });
});

/* ---------------- R2: 7/3 vs 8/2 differ by exact leg difference (60m) ---------------- */
// Clean short-first (BASE_SEGS, wait = 2h, drive = 6h):
//   8/2: release 15:00 (now + 2h), finish 21:00.
//   7/3: release 16:00 (now + 3h), finish 22:00.
//   Delta = exactly 60m on BOTH release and finish.
// Clean long-first (prior pending 3h OFF at 10:00-13:00; 4h D before, 5h D after; now = 18:00; wait = 0; drive = 5h):
//   7/3: 7h SB (18:00-01:00) completes pair -> anchor jumps to 13:00 (driveUsed=5h, 6h left; winUsed=5h, 9h left) -> release 01:00, finish 06:00.
//   8/2: 8h SB (18:00-02:00) completes pair -> release 02:00, finish 07:00.
//   Delta = exactly 60m on BOTH release and finish (7/3 is 60m earlier than 8/2).
await pin('R2. 7/3 vs 8/2 release and finish times differ by exact 60m leg difference in both short-first and long-first scenarios', async () => {
  const simShort = R.simulateRescue({
    segments: BASE_SEGS,
    now: NOW_13,
    config: cfgChi,
    dockWaitMinutes: 120,
    distanceMode: 'hours',
    miles: 0,
    mph: 55,
    driveMinutesDirect: 360,
    deadlineMinute: null,
  });
  const a82 = simShort.strategies.find((x) => x.id === 'split82');
  const a73 = simShort.strategies.find((x) => x.id === 'split73');
  const shortDeltaRel = a73.releaseAt - a82.releaseAt;
  const shortDeltaFin = a73.finishAt - a82.finishAt;

  const now18 = chi(11, 18, 0);
  const pendingShortSegs = [
    { status: 'OFF', start: chi(10, 20, 0), end: chi(11, 6, 0), createdAt: 1 }, // 10h reset
    { status: 'D', start: chi(11, 6, 0), end: chi(11, 10, 0), createdAt: 2 },   // 4h D
    { status: 'OFF', start: chi(11, 10, 0), end: chi(11, 13, 0), createdAt: 3 },// 3h OFF pending short leg
    { status: 'D', start: chi(11, 13, 0), end: now18, createdAt: 4 },           // 5h D (total 9h D, 12h window)
  ];
  const simLong = R.simulateRescue({
    segments: pendingShortSegs,
    now: now18,
    config: cfgChi,
    dockWaitMinutes: 0,
    distanceMode: 'hours',
    miles: 0,
    mph: 55,
    driveMinutesDirect: 300, // 5h drive
    deadlineMinute: null,
  });
  const b82 = simLong.strategies.find((x) => x.id === 'split82');
  const b73 = simLong.strategies.find((x) => x.id === 'split73');
  const longDeltaRel = b82.releaseAt - b73.releaseAt;
  const longDeltaFin = b82.finishAt - b73.finishAt;

  const ok = a82.hosLegal && a73.hosLegal && shortDeltaRel === 60 && shortDeltaFin === 60
    && b73.hosLegal && b82.hosLegal
    && b73.releaseAt === chi(12, 1, 0) && b73.finishAt === chi(12, 6, 0)
    && b82.releaseAt === chi(12, 2, 0) && b82.finishAt === chi(12, 7, 0)
    && longDeltaRel === 60 && longDeltaFin === 60;
  return ok || JSON.stringify({ shortDeltaRel, shortDeltaFin, longDeltaRel, longDeltaFin, b73: [b73.order, b73.releaseAt, b73.finishAt], b82: [b82.order, b82.releaseAt, b82.finishAt] });
});

/* ---------------- R3: Short-leg-first dock wait drive-again time ---------------- */
// Case A: BASE_SEGS (now = 13:00), dock wait = 2h 45m (165m), remaining drive = 6h (360m).
//   - 8/2: 165m >= 120m so dock wait IS the short leg -> releaseAt = 13:00 + 165m = 15:45, finishAt = 21:45.
//   - 7/3: 165m < 180m so driver extends 15m to 3h00m -> releaseAt = 13:00 + 180m = 16:00, finishAt = 22:00.
// Case B: Already 1h OFF at dock (12:00-13:00) + 1h 30m more wait (90m):
//   - Total continuous OFF at 14:30 = 150m >= 120m -> 8/2 releases right at 14:30 (no extra wait).
//   - 7/3 needs 180m continuous OFF -> releases at 12:00 + 180m = 15:00 (30m extra wait).
await pin('R3. short-leg-first uses dock wait (and any active rest already in progress) to compute exact drive-again time', async () => {
  const sim245 = R.simulateRescue({
    segments: BASE_SEGS,
    now: NOW_13,
    config: cfgChi,
    dockWaitMinutes: 165, // 2h 45m
    distanceMode: 'hours',
    miles: 0,
    mph: 55,
    driveMinutesDirect: 360,
    deadlineMinute: null,
  });
  const s82 = sim245.strategies.find((x) => x.id === 'split82');
  const s73 = sim245.strategies.find((x) => x.id === 'split73');

  const activeOffSegs = [
    { status: 'OFF', start: chi(10, 20, 0), end: chi(11, 6, 0), createdAt: 1 },
    { status: 'D', start: chi(11, 6, 0), end: chi(11, 11, 0), createdAt: 2 },
    { status: 'ON', start: chi(11, 11, 0), end: chi(11, 12, 0), createdAt: 3 },
    { status: 'OFF', start: chi(11, 12, 0), end: NOW_13, createdAt: 4 }, // already 1h OFF at dock
  ];
  const simActive = R.simulateRescue({
    segments: activeOffSegs,
    now: NOW_13,
    config: cfgChi,
    dockWaitMinutes: 90, // +1h 30m more wait -> 2h 30m continuous OFF
    distanceMode: 'hours',
    miles: 0,
    mph: 55,
    driveMinutesDirect: 360,
    deadlineMinute: null,
  });
  const a82 = simActive.strategies.find((x) => x.id === 'split82');
  const a73 = simActive.strategies.find((x) => x.id === 'split73');

  const ok = s82.order === 'short-first' && s82.releaseAt === chi(11, 15, 45) && s82.finishAt === chi(11, 21, 45)
    && s73.order === 'short-first' && s73.releaseAt === chi(11, 16, 0) && s73.finishAt === chi(11, 22, 0)
    && a82.order === 'short-first' && a82.releaseAt === chi(11, 14, 30) && a82.finishAt === chi(11, 20, 30)
    && a73.order === 'short-first' && a73.releaseAt === chi(11, 15, 0) && a73.finishAt === chi(11, 21, 0);
  return ok || JSON.stringify({
    s82: [s82.order, s82.releaseAt, s82.finishAt],
    s73: [s73.order, s73.releaseAt, s73.finishAt],
    a82: [a82.order, a82.releaseAt, a82.finishAt],
    a73: [a73.order, a73.releaseAt, a73.finishAt],
  });
});

/* ---------------- R4: Next-shift trap numbers match independent engine evaluation ---------------- */
// From BASE_SEGS, dockWait = 2h (120m), drive = 6h (360m):
//   8/2 timeline: 13:00-15:00 OFF -> 15:00-21:00 D (6h) -> 21:00-05:00 SB (8h).
//   At splitCompleteAt = Thu 05:00:
//     anchor = 15:00 (end of 1st leg); 8h SB excluded from 14h window.
//     driveUsed = 360m (6h) => driveRemaining = 660 - 360 = 300m (5h 00m).
//     windowUsed = (05:00 - 15:00) - 480m = 840 - 480 = 360m (6h) => windowRemaining = 840 - 360 = 480m (8h 00m).
//   7/3 timeline: 13:00-16:00 OFF -> 16:00-22:00 D (6h) -> 22:00-05:00 SB (7h).
//   At splitCompleteAt = Thu 05:00:
//     anchor = 16:00; 7h SB excluded => driveRemaining = 300m (5h 00m), windowRemaining = 480m (8h 00m).
await pin('R4. next-shift trap 11h/14h remaining numbers match hand calculation AND independent evaluate() of the synthetic timeline', async () => {
  const sim = R.simulateRescue({
    segments: BASE_SEGS,
    now: NOW_13,
    config: cfgChi,
    dockWaitMinutes: 120,
    distanceMode: 'hours',
    miles: 0,
    mph: 55,
    driveMinutesDirect: 360,
    deadlineMinute: null,
  });
  const s82 = sim.strategies.find((x) => x.id === 'split82');
  const s73 = sim.strategies.find((x) => x.id === 'split73');

  const ev82 = E.evaluate([...BASE_SEGS, ...s82.simSegments], { asOf: s82.splitCompleteAt, config: cfgChi });
  const ev73 = E.evaluate([...BASE_SEGS, ...s73.simSegments], { asOf: s73.splitCompleteAt, config: cfgChi });

  // Also verify DOM renders the exact trap numbers when RescueTab is open with BASE_SEGS (default 2h45m wait, 6h drive -> same 5h/8h trap)
  await seed({ tab: 'plan', nowOverride: NOW_13, segments: BASE_SEGS, current: null });
  A.openRescuePlanner(true);
  await sleep(60);
  const pg = planRoom();
  const next82Drive = all((n) => n.attributes?.['data-rescue-next-drive'] === 'split82', pg)[0]?.textContent ?? '';
  const next82Win = all((n) => n.attributes?.['data-rescue-next-window'] === 'split82', pg)[0]?.textContent ?? '';

  const ok = s82.nextShift.driveRemaining === 300 && s82.nextShift.windowRemaining === 480
    && s82.nextShift.driveRemaining === ev82.shift.driveRemaining
    && s82.nextShift.windowRemaining === ev82.shift.windowRemaining
    && s73.nextShift.driveRemaining === 300 && s73.nextShift.windowRemaining === 480
    && s73.nextShift.driveRemaining === ev73.shift.driveRemaining
    && s73.nextShift.windowRemaining === ev73.shift.windowRemaining
    && /5h 00m/.test(next82Drive) && /8h 00m/.test(next82Win);

  return ok || JSON.stringify({
    s82Trap: [s82.nextShift.driveRemaining, s82.nextShift.windowRemaining],
    ev82: [ev82.shift.driveRemaining, ev82.shift.windowRemaining],
    s73Trap: [s73.nextShift.driveRemaining, s73.nextShift.windowRemaining],
    ev73: [ev73.shift.driveRemaining, ev73.shift.windowRemaining],
    dom: [next82Drive, next82Win],
  });
});

/* ---------------- R4b: Completes-pending Next-Shift Trap is read AFTER delivery ---------------- */
// R2 long fixture (prior pending 3h OFF at 10:00-13:00; 4h D before, 5h D after; now = Wed 18:00; wait = 0; drive = 5h):
//   7/3 (completes-pending-short): 7h SB (18:00-01:00) completes pair -> 5h D (01:00-06:00), finishAt = Thu 06:00.
//   At finishAt = Thu 06:00 (after delivery):
//     anchor = end of 3h OFF = Wed 13:00.
//     driveUsed = 13:00-18:00 (5h) + 01:00-06:00 (5h) = 10h (600m) => driveRemaining = 660 - 600 = 60m (1h 00m).
//     windowUsed = (Thu 06:00 - Wed 13:00 = 17h) - 7h SB excluded = 10h (600m) => windowRemaining = 840 - 600 = 240m (4h 00m).
//   8/2 (completes-pending-short): 8h SB (18:00-02:00) -> 5h D (02:00-07:00), finishAt = Thu 07:00.
//   At finishAt = Thu 07:00: anchor = Wed 13:00, driveUsed = 10h => 60m left; window = 18h - 8h SB = 10h => 240m left.
await pin('R4b. completes-pending Next-Shift Trap reads after delivery (matches hand math & evaluate at finishAt)', async () => {
  const now18 = chi(11, 18, 0);
  const pendingShortSegs = [
    { status: 'OFF', start: chi(10, 20, 0), end: chi(11, 6, 0), createdAt: 1 }, // 10h reset
    { status: 'D', start: chi(11, 6, 0), end: chi(11, 10, 0), createdAt: 2 },   // 4h D
    { status: 'OFF', start: chi(11, 10, 0), end: chi(11, 13, 0), createdAt: 3 },// 3h OFF pending short leg
    { status: 'D', start: chi(11, 13, 0), end: now18, createdAt: 4 },           // 5h D
  ];
  const sim = R.simulateRescue({
    segments: pendingShortSegs,
    now: now18,
    config: cfgChi,
    dockWaitMinutes: 0,
    distanceMode: 'hours',
    miles: 0,
    mph: 55,
    driveMinutesDirect: 300, // 5h drive
    deadlineMinute: null,
  });
  const s73 = sim.strategies.find((x) => x.id === 'split73');
  const s82 = sim.strategies.find((x) => x.id === 'split82');

  const ev73 = E.evaluate([...pendingShortSegs, ...s73.simSegments], { asOf: s73.finishAt, config: cfgChi });
  const ev82 = E.evaluate([...pendingShortSegs, ...s82.simSegments], { asOf: s82.finishAt, config: cfgChi });

  // Also verify DOM card header uses the honest "after delivery at ..." label for completes-pending
  await seed({ tab: 'plan', nowOverride: now18, segments: pendingShortSegs, current: null });
  A.openRescuePlanner(true);
  await sleep(60);
  const pg = planRoom();
  const trap73El = all((n) => n.attributes?.['data-rescue-next-shift'] === 'split73', pg)[0];
  const trap73Head = trap73El ? (all((n) => has(n, 'rescue-trap-head'), trap73El)[0]?.textContent ?? '') : '';

  const ok = s73.order === 'completes-pending-short'
    && s73.nextShift?.at === s73.finishAt
    && s73.nextShift?.atLabel === 'after delivery'
    && s73.nextShift?.driveRemaining === 60
    && s73.nextShift?.windowRemaining === 240
    && s73.nextShift?.driveRemaining === ev73.shift.driveRemaining
    && s73.nextShift?.windowRemaining === ev73.shift.windowRemaining
    && s82.order === 'completes-pending-short'
    && s82.nextShift?.at === s82.finishAt
    && s82.nextShift?.driveRemaining === 60
    && s82.nextShift?.windowRemaining === 240
    && s82.nextShift?.driveRemaining === ev82.shift.driveRemaining
    && s82.nextShift?.windowRemaining === ev82.shift.windowRemaining
    && /after delivery at /i.test(trap73Head);

  return ok || JSON.stringify({
    s73: s73 && [s73.order, s73.finishAt, s73.nextShift?.at, s73.nextShift?.atLabel, s73.nextShift?.driveRemaining, s73.nextShift?.windowRemaining],
    ev73: [ev73.shift.driveRemaining, ev73.shift.windowRemaining],
    s82: s82 && [s82.order, s82.nextShift?.driveRemaining, s82.nextShift?.windowRemaining],
    ev82: [ev82.shift.driveRemaining, ev82.shift.windowRemaining],
    trap73Head,
  });
});

/* ---------------- R5: Sleeper-Berth-only callout renders on EVERY split strategy card ---------------- */
await pin('R5. exact callout "Long leg = Sleeper Berth ONLY; verify on your ELD." renders on every split strategy card', async () => {
  await seed({ tab: 'plan', nowOverride: NOW_13, segments: BASE_SEGS, current: null });
  A.openRescuePlanner(true);
  await sleep(60);
  const pg = planRoom();
  const c82 = all((n) => n.attributes?.['data-rescue-sb-callout'] === 'split82', pg)[0]?.textContent ?? '';
  const c73 = all((n) => n.attributes?.['data-rescue-sb-callout'] === 'split73', pg)[0]?.textContent ?? '';
  const expected = 'Long leg = Sleeper Berth ONLY; verify on your ELD.';
  const ok = c82.includes(expected) && c73.includes(expected);
  return ok || JSON.stringify({ c82, c73 });
});

/* ---------------- R6: No-rescue scenario shows plain verdict + Straight 10 finish ---------------- */
// Fixture: Driver already drove 8h (06:00-10:00 D, 10:00-10:30 OFF, 10:30-14:30 D) -> now = 14:30.
//   driveUsed = 8h (3h left), windowUsed = 8h30m (5h30m left), NO pending split leg.
//   Remaining drive needed = 6h (default in UI = 360m > 3h drive left!).
//   - Roll now: 8h + 6h = 14h > 11h -> DRIVE_11 violation (3h over).
//   - 8/2 & 7/3: without a prior pending leg, neither short-first nor long-first resets the 11h clock before driving 6h -> DRIVE_11 violation!
//   - Straight 10: 14:30-00:30 OFF (10h) -> release Thu 00:30 -> drive 6h -> finish Thu 06:30!
//   Verdict MUST be plain "No rescue — the split doesn't save this one" with Thu 06:30 Straight 10 finish and NO "Recommended" badge.
await pin('R6. no-rescue scenario shows plain "No rescue — the split doesn\'t save this one" verdict, Straight 10 finish, and no false recommendation', async () => {
  const now1430 = chi(11, 14, 30);
  const exhaustedSegs = [
    { status: 'OFF', start: chi(10, 20, 0), end: chi(11, 6, 0), createdAt: 1 },
    { status: 'D', start: chi(11, 6, 0), end: chi(11, 10, 0), createdAt: 2 },
    { status: 'OFF', start: chi(11, 10, 0), end: chi(11, 10, 30), createdAt: 3 },
    { status: 'D', start: chi(11, 10, 30), end: now1430, createdAt: 4 },
  ];
  const sim = R.simulateRescue({
    segments: exhaustedSegs,
    now: now1430,
    config: cfgChi,
    dockWaitMinutes: 165,
    distanceMode: 'hours',
    miles: 0,
    mph: 55,
    driveMinutesDirect: 360, // 6h drive > 3h remaining
    deadlineMinute: null,
  });

  await seed({ tab: 'plan', nowOverride: now1430, segments: exhaustedSegs, current: null });
  A.openRescuePlanner(true);
  await sleep(60);
  const pg = planRoom();
  const vEl = all((n) => n.attributes?.['data-rescue-verdict'] === '1', pg)[0];
  const vTxt = vEl?.textContent ?? '';
  const recBadges = all((n) => n.attributes?.['data-rescue-rec-badge'] === '1', pg);
  const s10Fin = all((n) => n.attributes?.['data-rescue-finish'] === 'straight10', pg)[0]?.textContent ?? '';

  // Also check R5 still holds on a no-rescue scenario: SB callout stays on both split cards
  const c82 = all((n) => n.attributes?.['data-rescue-sb-callout'] === 'split82', pg)[0]?.textContent ?? '';
  const c73 = all((n) => n.attributes?.['data-rescue-sb-callout'] === 'split73', pg)[0]?.textContent ?? '';

  const ok = sim.noRescue === true
    && sim.recommended === null
    && sim.headline === R.NO_RESCUE_HEADLINE
    && sim.straight10?.hosLegal === true
    && sim.straight10.releaseAt === chi(12, 0, 30)
    && sim.straight10.finishAt === chi(12, 6, 30)
    && vEl?.attributes?.['data-rescue-no-rescue'] === '1'
    && vTxt.includes("No rescue — the split doesn't save this one")
    && vTxt.includes('06:30')
    && recBadges.length === 0
    && s10Fin.includes('06:30')
    && c82.includes(R.SPLIT_SB_CALLOUT) && c73.includes(R.SPLIT_SB_CALLOUT);

  return ok || JSON.stringify({
    noRescue: sim.noRescue,
    headline: sim.headline,
    subline: sim.subline,
    s10: sim.straight10 && [sim.straight10.releaseShort, sim.straight10.finishShort],
    recBadges: recBadges.length,
    s10Fin,
  });
});

/* ---------------- R6b: No-rescue with deadline names earliest legal split, not Straight 10 ---------------- */
// Fixture (Opus D1): BASE_SEGS, now = Wed 13:00, dockWait = 2h (120m), drive = 6h (360m), deadline = Wed 20:30.
//   - Roll now: 13:00-15:00 ON + 15:00-21:00 D -> WINDOW_14 violation (60m), illegal.
//   - 8/2 split (short-first): 13:00-15:00 OFF + 15:00-21:00 D + 21:00-05:00 SB -> HOS-legal, finish Wed 21:00 (30m past Wed 20:30).
//   - 7/3 split (short-first): 13:00-16:00 OFF + 16:00-22:00 D + 22:00-05:00 SB -> HOS-legal, finish Wed 22:00 (1h 30m past).
//   - Straight 10: 13:00-23:00 OFF + 23:00-05:00 D -> HOS-legal, finish Thu 05:00 (8h 30m past).
//   No strategy makes Wed 20:30 -> noRescue === true, recommended === null.
//   Earliest legal finish is 8/2 split at Wed Nov 11, 21:00 (30m past deadline), NOT Straight 10.
//   Badge "Earliest legal" belongs on 8/2 split; Straight 10 must NOT have an "Earliest legal" badge.
await pin('R6b. no-rescue with deadline names earliest legal split (8/2 at Wed 21:00, 30m past) and does not put Earliest legal badge on Straight 10', async () => {
  const deadline2030 = chi(11, 20, 30);
  const sim = R.simulateRescue({
    segments: BASE_SEGS,
    now: NOW_13,
    config: cfgChi,
    dockWaitMinutes: 120,
    distanceMode: 'hours',
    miles: 0,
    mph: 55,
    driveMinutesDirect: 360,
    deadlineMinute: deadline2030,
  });
  const s82 = sim.strategies.find((x) => x.id === 'split82');
  const s10 = sim.strategies.find((x) => x.id === 'straight10');

  const ok = sim.noRescue === true
    && sim.recommended === null
    && sim.headline === R.NO_RESCUE_HEADLINE
    && sim.strategies[0].id === 'split82'
    && sim.subline.includes('8/2 split')
    && /Wed\b.*21:00/.test(sim.subline)
    && sim.subline.includes('30m')
    && sim.subline.includes('Straight 10: Thu 05:00 (8h 30m past)')
    && s82?.badge === 'Earliest legal'
    && !/Earliest legal/i.test(s10?.badge ?? '');

  return ok || JSON.stringify({
    noRescue: sim.noRescue,
    subline: sim.subline,
    order: sim.strategies.map((x) => [x.id, x.badge, x.finishShort]),
  });
});

/* ---------------- R7: 2h + 7h = 9h pairing does NOT qualify as a split (no paused 14h) ---------------- */
// From BASE_SEGS (now = 13:00, window expires Wed 20:00):
//   Try 2h OFF (13:00-15:00) + 6h D (15:00-21:00) + 7h SB (21:00-04:00).
//   Total rest = 2h + 7h = 9h (540m < 600m required by 49 CFR §395.1(g)(1)(ii)(C)).
//   Expected: pairQualified = false, hosLegal = false, usedChain = [], WINDOW_14 violation 20:00-21:00 (60m).
//   Also verify simulateRescue's 7/3 strategy with a 2h dock wait NEVER cheats with 2h+7h=9h:
//   it must extend the short leg to 3h (release 16:00) so 3h+7h=10h.
await pin('R7. 2h + 7h = 9h pairing fails FMCSA split qualification (no paused 14h, 60m WINDOW_14 violation) and 7/3 never cheats on a 2h wait', async () => {
  const res9h = R.evaluateSplitPairing(BASE_SEGS, NOW_13, cfgChi, 120, 360, 420, 120, 'short-first');
  const ev9h = E.evaluate([...BASE_SEGS, ...res9h.simSegments], { asOf: res9h.splitCompleteAt, config: cfgChi });

  const sim = R.simulateRescue({
    segments: BASE_SEGS,
    now: NOW_13,
    config: cfgChi,
    dockWaitMinutes: 120,
    distanceMode: 'hours',
    miles: 0,
    mph: 55,
    driveMinutesDirect: 360,
    deadlineMinute: null,
  });
  const s73 = sim.strategies.find((x) => x.id === 'split73');

  const ok = res9h.pairQualified === false
    && res9h.hosLegal === false
    && res9h.usedChain.length === 0
    && res9h.violations.some((v) => v.kind === 'WINDOW_14' && v.start === chi(11, 20, 0) && v.end === chi(11, 21, 0) && v.minutes === 60)
    && ev9h.shift.chain.length === 0
    && ev9h.violations.some((v) => v.kind === 'WINDOW_14' && v.minutes === 60)
    && s73.pairQualified === true && s73.releaseAt === chi(11, 16, 0);

  return ok || JSON.stringify({
    pairQualified: res9h.pairQualified,
    hosLegal: res9h.hosLegal,
    chainLen: res9h.usedChain.length,
    viols: res9h.violations,
    ev9hViols: ev9h.violations,
    s73Rel: s73.releaseAt,
  });
});

/* ---------------- R8: Plan hub 7th button (above Stack), opens simulator, ClockPick compliance (no <input type="time">) ---------------- */
await pin('R8. Plan hub lists "Split-sleeper rescue" 7th (above Stack, Motel & Legal), opens simulator verdict-first, uses ClockPick for deadline with zero <input type="time">', async () => {
  await seed({ tab: 'plan', nowOverride: NOW_13, segments: BASE_SEGS, current: null });
  const pg = planPage();
  const items = all((n) => n.localName === 'button' && has(n, 'plan-item'), pg);
  const titles = items.map((b) => all((n) => n.localName === 'b', b)[0]?.textContent?.trim());
  // Re-aimed (navy1 B1): Plan hub groups the 12 tools by time horizon; locate by title instead of fixed index.
  const required = ['When to roll & PTA', 'Split-sleeper rescue', 'Stack my stops & loads', 'Do I Make It Back or Motel?', 'Can I Legally Use It?', 'Flip My Clock', 'Miles Left in My 70'];
  if (items.length !== 12 || !required.every((t) => titles.includes(t))) {
    return `unexpected Plan hub items: ${JSON.stringify(titles)}`;
  }

  const rescueBtn = items[titles.indexOf('Split-sleeper rescue')];
  fire(rescueBtn, 'click');
  await sleep(60);
  if (!A.isRescuePlannerOpen()) return 'simulator did not open';

  // Re-aimed (2026-11-21 plan-dissolve): RescueTab renders in planRoom() while planPage() keeps the 8-item hub mounted.
  const rm = planRoom();
  const h1 = all((n) => n.localName === 'h1' && has(n, 'screen-title'), rm)[0]?.textContent?.trim();
  const verdictEl = all((n) => n.attributes?.['data-rescue-verdict'] === '1', rm)[0];
  const stratEl = all((n) => n.attributes?.['data-rescue-strategies'] === '1', rm)[0];
  const timeInputs = all((n) => n.localName === 'input' && n.attributes?.type === 'time', rm);
  const txt = rm.textContent;
  const vIdx = verdictEl ? txt.indexOf(verdictEl.textContent) : -1;
  const sIdx = stratEl ? txt.indexOf(stratEl.textContent) : -1;
  const verdictBeforeStrat = vIdx >= 0 && sIdx > vIdx;

  // Toggle "Set deadline" and verify shared ClockPick sheet opens and applies cleanly
  const setDlBtn = all((n) => n.localName === 'button' && /Set deadline/.test(n.textContent), rm)[0];
  if (!setDlBtn) return 'missing Set deadline toggle';
  fire(setDlBtn, 'click');
  await sleep(40);
  const timeInputsAfterToggle = all((n) => n.localName === 'input' && n.attributes?.type === 'time', rm);
  const dlBtn = all((n) => n.localName === 'button' && n.attributes?.['data-rescue-deadline-btn'] === '1', rm)[0];
  if (!dlBtn) return 'missing deadline ClockPick trigger button';
  fire(dlBtn, 'click');
  await sleep(50);

  const sh = all((n) => has(n, 'sheet'))[0];
  const dayIn = sh && all((n) => n.localName === 'input' && has(n, 'ed-day-input'), sh)[0];
  const clkIn = sh && all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), sh)[0];
  const goBtn = sh && all((n) => n.localName === 'button' && has(n, 'ed-go'), sh)[0];
  if (!sh || !dayIn || !clkIn || !goBtn) return `ClockPick sheet missing controls: sh=${!!sh} day=${!!dayIn} clk=${!!clkIn} go=${!!goBtn}`;
  dayIn.value = '2026-11-11'; fire(dayIn, 'input'); await sleep(20);
  clkIn.value = '21:50'; fire(clkIn, 'input'); await sleep(20);
  fire(goBtn, 'click'); await sleep(60);

  const afterDl = all((n) => n.localName === 'button' && n.attributes?.['data-rescue-deadline-btn'] === '1', rm)[0]?.textContent ?? '';

  // Back button returns to the 8-item Plan hub
  const backBtn = all((n) => n.localName === 'button' && has(n, 'back'), rm)[0];
  fire(backBtn, 'click');
  await sleep(60);
  const itemsAfterBack = all((n) => n.localName === 'button' && has(n, 'plan-item'), pg);

  // Re-open, then leave Plan tab -> Rescue closes cleanly and returning to Plan shows the 12-item hub
  const rescueAgainBtn = itemsAfterBack.find((b) => /Split-sleeper rescue/.test(b.textContent));
  fire(rescueAgainBtn, 'click');
  await sleep(50);
  const openedAgain = A.isRescuePlannerOpen();
  setState({ tab: 'now' }); await sleep(50);
  setState({ tab: 'plan' }); await sleep(50);
  const itemsAfterTabLeave = all((n) => n.localName === 'button' && has(n, 'plan-item'), pg);

  const ok = h1 === 'Split-sleeper rescue'
    && !!verdictEl && !!stratEl && verdictBeforeStrat
    && timeInputs.length === 0 && timeInputsAfterToggle.length === 0
    && /21:50/.test(afterDl)
    && openedAgain && !A.isRescuePlannerOpen()
    && itemsAfterBack.length === 12 && itemsAfterTabLeave.length === 12;

  return ok || JSON.stringify({
    h1,
    hasVerdict: !!verdictEl,
    hasStrat: !!stratEl,
    verdictBeforeStrat,
    vIdx,
    sIdx,
    timeInputs: timeInputs.length,
    timeInputsAfterToggle: timeInputsAfterToggle.length,
    afterDl,
    openedAgain,
    openAfterLeave: A.isRescuePlannerOpen(),
    itemsAfterBack: itemsAfterBack.length,
    itemsAfterTabLeave: itemsAfterTabLeave.length,
  });
});

/* ---------------- R9 (TRUNC): Long drive (1980m) never silently truncated in appendEngineDrive ---------------- */
// Fixture (Opus TRUNC): 10h OFF (Tue 20:00-Wed 06:00), then 7h 50m D with no break (Wed 06:00-13:50),
//   now = Wed 13:50, dockWait = 0, remaining drive = 1980m (LIMITS.DRIVE * 3, max UI input).
//   - At 13:50, breakRemaining = 480 - 470 = 10m.
//   - Roll now: 10m D + 30m break + 4 * (480m D + 30m break) + 50m D = 11 iterations -> sum(D) = 1980m.
//   - Straight 10 / 8/2 / 7/3: leading rest resets breakRemaining to 480m -> 4 * (480m D + 30m break) + 60m D = 9 iterations -> sum(D) = 1980m.
await pin('R9. long-run drive (1980m after 7h 50m driven with no break) simulates full 1980 D minutes on every strategy', async () => {
  const now1350 = chi(11, 13, 50);
  const truncSegs = [
    { status: 'OFF', start: chi(10, 20, 0), end: chi(11, 6, 0), createdAt: 1 },
    { status: 'D', start: chi(11, 6, 0), end: now1350, createdAt: 2 }, // 7h 50m = 470m D, no break
  ];
  const driveReq = E.LIMITS.DRIVE * 3; // 1980m
  const sim = R.simulateRescue({
    segments: truncSegs,
    now: now1350,
    config: cfgChi,
    dockWaitMinutes: 0,
    distanceMode: 'hours',
    miles: 0,
    mph: 55,
    driveMinutesDirect: driveReq,
    deadlineMinute: null,
  });
  const sums = sim.strategies.map((st) => [
    st.id,
    st.simSegments.filter((s) => s.status === 'D').reduce((acc, s) => acc + (s.end - s.start), 0),
  ]);
  const ok = sim.strategies.length === 4 && sums.every(([, mins]) => mins === driveReq);
  return ok || JSON.stringify({ driveReq, sums });
});

let fails = 0;
for (const [st, name, why] of res) {
  console.log(`${st} ${name}${why ? ` — ${why}` : ''}`);
  if (st === 'FAIL') fails++;
}
console.log(`rescue: ${res.length - fails}/${res.length} pins pass`);
render(null, root);
process.exit(fails ? 1 : 0);

// Stack My Stops & Loads — DOM & engine verification suite (Plan tool #8).
// Pins SK1–SK12: every expected arrival, PTA, limiting clock, split rescue, and cycle limit
// is hand-computed in comments AND cross-checked directly against engine/src/index.ts.
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
let Tms = new Date(2026, 10, 11, 6, 0, 0).getTime(); // Wed Nov 11 2026 06:00 local
Date.now = () => Tms;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'stack';
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
const ST = await import('../../src/stack.ts');
const E = await import('../../../engine/src/index.ts');

const { App, setLaunchNotice, openSheet } = A;
const { setState } = S;
setLaunchNotice?.(false);

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

// Helper: assert NO OFF/SB segment in `segs` overlaps any ON-duty dwell interval `[start, end)`.
const noRestOverlapsOnDwell = (segs, onWindows) => {
  for (const [wStart, wEnd] of onWindows) {
    const badRest = segs.find(
      (sg) => (sg.status === 'OFF' || sg.status === 'SB') && sg.start < wEnd && sg.end > wStart,
    );
    if (badRest) return false;
    const hasOn = segs.some(
      (sg) => sg.status === 'ON' && sg.start <= wStart && sg.end >= wEnd,
    );
    if (!hasOn) return false;
  }
  return true;
};

// Fresh driver at Wed Nov 11 06:00 CST (after 10h plain OFF Tue 20:00 -> Wed 06:00).
// Clocks at 06:00: 11h drive left, 14h window left (expires 20:00), 70h cycle left.
const NOW_06 = chi(11, 6, 0);
const FRESH_SEGS = [
  { status: 'OFF', start: chi(10, 20, 0), end: NOW_06, createdAt: 1 },
];

const seed = async (rec) => {
  openSheet(null);
  ST.clearStackDraft();
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

/* ---------------- SK1: Legal 3-stop chain verdict ---------------- */
// Math from FRESH_SEGS at Wed 06:00 (55 mph = 11 mi per 12 min; 165 mi = 180m = 3h, 110 mi = 120m = 2h):
//   Stop 1: 165 mi (3h D, 06:00-09:00), appt 09:30 (30m early -> OFF 09:00-09:30), 2h ON dwell (09:30-11:30)
//   Stop 2: 110 mi (2h D, 11:30-13:30), appt 14:00 (30m early -> OFF 13:30-14:00), 1h 30m ON dwell (14:00-15:30)
//   Stop 3: 110 mi (2h D, 15:30-17:30), appt 18:00 (30m early -> OFF 17:30-18:00), 1h ON dwell (18:00-19:00)
// At finish Wed 19:00:
//   Total driving = 7h (420m <= 660m -> 4h drive left; 30m breaks satisfied by dwells/waits)
//   14h window started 06:00, expires 20:00 -> 1h 00m (60m) left on 14!
//   70h cycle used = 7h D + 4.5h ON = 11.5h (690m) -> 58h 30m left.
await pin('SK1. legal 3-stop chain verdict: green ALL 3 STOPS LEGAL with exact finish time & remaining 14h/11h/70h clocks matching engine.evaluate()', async () => {
  const r = ST.evaluateStackChain({
    segments: FRESH_SEGS,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 's1', label: 'Stop 1', miles: 165, mph: 55, dwellMinutes: 120, dwellStatus: 'ON', apptMinute: chi(11, 9, 30), apptTimeZone: 'America/Chicago' },
      { id: 's2', label: 'Stop 2', miles: 110, mph: 55, dwellMinutes: 90, dwellStatus: 'ON', apptMinute: chi(11, 14, 0), apptTimeZone: 'America/Chicago' },
      { id: 's3', label: 'Stop 3', miles: 110, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 18, 0), apptTimeZone: 'America/Chicago' },
    ],
  });

  const indep = E.evaluate([...FRESH_SEGS, ...r.displayChain.simSegments], { asOf: chi(11, 19, 0), config: cfgChi });
  const ok = r.validInput
    && r.status === 'legal'
    && r.tone === 'good'
    && r.verdictSign === 'go'
    && r.firstBreakIndex === null
    && /ALL 3 STOPS LEGAL/.test(r.headline)
    && /Wed 19:00/.test(r.headline)
    && /1h 00m left on your 14/.test(r.headline)
    && r.displayChain.finishAt === chi(11, 19, 0)
    && r.displayChain.stops[0].arrival.minute === chi(11, 9, 0)
    && r.displayChain.stops[0].depart.minute === chi(11, 11, 30)
    && r.displayChain.stops[1].arrival.minute === chi(11, 13, 30)
    && r.displayChain.stops[2].arrival.minute === chi(11, 17, 30)
    && r.displayChain.endEval.shift.windowRemaining === 60
    && r.displayChain.endEval.shift.driveRemaining === 240
    && r.displayChain.endEval.shift.windowRemaining === indep.shift.windowRemaining
    && r.displayChain.endEval.shift.driveRemaining === indep.shift.driveRemaining
    && indep.violations.length === 0;

  return ok || JSON.stringify({
    status: r.status,
    headline: r.headline,
    finish: r.displayChain.finishDual.homeShort,
    winRem: r.displayChain.endEval.shift.windowRemaining,
    drvRem: r.displayChain.endEval.shift.driveRemaining,
    indepV: indep.violations,
  });
});

/* ---------------- SK2: Chain breaks at Stop 3 naming limiting clock (14-hour window) ---------------- */
// Fixture: shift started Wed 03:00 (2h D 03:00-05:00, 1h ON 05:00-06:00), now = Wed 06:00.
//   At 06:00: driveUsed = 2h (9h left), windowUsed = 3h (11h left, expires Wed 17:00).
//   Stop 1: 165 mi (3h D, 06:00-09:00), 2h ON dwell (09:00-11:00) -> 5h D used, 8h window used.
//   Stop 2: 165 mi (3h D, 11:00-14:00), 2h ON dwell (14:00-16:00) -> 8h D used, 13h window used (1h left until 17:00!).
//   Stop 3: 165 mi (3h D needed, appt Wed 19:30) -> only 1h window left before 17:00!
//   Continuous: drives 16:00-19:00 -> WINDOW_14 violation 17:00-19:00 (120m).
await pin('SK2. chain that breaks at Stop 3 names Stop 3 and limiting 14-hour window (49 CFR 395.3(a)(2)) + post-10h pushback', async () => {
  const midSegs = [
    { status: 'OFF', start: chi(10, 17, 0), end: chi(11, 3, 0), createdAt: 1 },
    { status: 'D', start: chi(11, 3, 0), end: chi(11, 5, 0), createdAt: 2 },
    { status: 'ON', start: chi(11, 5, 0), end: NOW_06, createdAt: 3 },
  ];
  const r = ST.evaluateStackChain({
    segments: midSegs,
    now: NOW_06,
    config: cfgChi,
    allowSplitBetweenStops: false,
    stops: [
      { id: 's1', label: 'Stop 1', miles: 165, mph: 55, dwellMinutes: 120, dwellStatus: 'ON', apptMinute: chi(11, 9, 0), apptTimeZone: 'America/Chicago' },
      { id: 's2', label: 'Stop 2', miles: 165, mph: 55, dwellMinutes: 120, dwellStatus: 'ON', apptMinute: chi(11, 14, 0), apptTimeZone: 'America/Chicago' },
      { id: 's3', label: 'Stop 3', miles: 165, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 19, 30), apptTimeZone: 'America/Chicago' },
    ],
  });

  // Under reset10: drives 16:00-17:00 (1h), 10h reset 17:00-03:00, drives 03:00-05:00 -> Stop 3 arrives Thu 05:00!
  const ok = r.status === 'breaks_stop'
    && r.tone === 'bad'
    && r.firstBreakIndex === 2
    && r.firstBreakLabel === 'Stop 3'
    && r.limitingClock === 'WINDOW_14'
    && r.limitingCite === '49 CFR 395.3(a)(2)'
    && /BREAKS AT STOP 3/.test(r.headline)
    && /14-hour window/.test(r.headline)
    && r.pushRescue !== null
    && r.pushRescue.kind === 'reset10'
    && r.pushRescue.breakingStopArrival.minute === chi(12, 5, 0)
    && r.pushRescue.pass.hosLegal === true;

  return ok || JSON.stringify({
    status: r.status,
    breakIdx: r.firstBreakIndex,
    limit: r.limitingClock,
    cite: r.limitingCite,
    headline: r.headline,
    pushArr: r.pushRescue?.breakingStopArrival.homeShort,
  });
});

/* ---------------- SK3 (reworked for F3 + F6): Split rescue respects ON-duty dwell ---------------- */
// Part A: Same SK2 fixture with ALL stops `dwellStatus: 'ON'` (2h live unload at Stop 1 & Stop 2, 1h at Stop 3).
//   Because Stop 1 & Stop 2 dwells are ON-duty (live unload), split rescue CANNOT convert ON dwell into OFF/SB.
//   Placing a 2h OFF leg AFTER Stop 1's ON dwell (11:00-13:00) misses Stop 2's 14:00 appt (13:00+3h=16:00).
//   Placing a 2h OFF leg AFTER Stop 2's ON dwell (16:00-18:00) misses Stop 3's 19:30 appt (18:00+3h=21:00) & breaks 14h.
//   Therefore: NO split rescue exists (`splitRescue === null`), status = 'breaks_stop', pushRescue arrives Thu 05:00.
// Part B: ON-dwell chain WITH schedule slack between Stop 1 and Stop 2:
//   Stop 1: 165 mi (3h D, 06:00-09:00), appt 09:00, 1h ON dwell (09:00-10:00).
//   Stop 2: 110 mi (2h D), appt 14:00, 2h ON dwell (14:00-16:00).
//   Stop 3: 165 mi (3h D), appt 19:30, 1h ON dwell (19:30-20:30).
//   Placing 2h OFF AFTER Stop 1's ON dwell (10:00-12:00, addedWaitMinutes = 120) still arrives Stop 2 at 14:00 on time!
//   Then 2h OFF (10:00-12:00) pairs with 8h SB after Stop 3 (20:30-04:30) -> 14h window extends 17:00->19:00!
//   Stop 3 drives 16:00-19:00 (30m early for 19:30 appt), finishes 20:30, 0 violations, NO OFF/SB overlaps any ON dwell!
await pin('SK3. split rescue never converts ON-duty dwell into rest (F3/F6): rejects tight ON-dwell split; rescues with post-dwell added wait when slack exists', async () => {
  const midSegs = [
    { status: 'OFF', start: chi(10, 17, 0), end: chi(11, 3, 0), createdAt: 1 },
    { status: 'D', start: chi(11, 3, 0), end: chi(11, 5, 0), createdAt: 2 },
    { status: 'ON', start: chi(11, 5, 0), end: NOW_06, createdAt: 3 },
  ];
  // Part A: tight all-ON-dwell fixture -> honest failure (no fabricated rest credit)
  const rTight = ST.evaluateStackChain({
    segments: midSegs,
    now: NOW_06,
    config: cfgChi,
    allowSplitBetweenStops: true,
    stops: [
      { id: 's1', label: 'Stop 1', miles: 165, mph: 55, dwellMinutes: 120, dwellStatus: 'ON', apptMinute: chi(11, 9, 0), apptTimeZone: 'America/Chicago' },
      { id: 's2', label: 'Stop 2', miles: 165, mph: 55, dwellMinutes: 120, dwellStatus: 'ON', apptMinute: chi(11, 14, 0), apptTimeZone: 'America/Chicago' },
      { id: 's3', label: 'Stop 3', miles: 165, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 19, 30), apptTimeZone: 'America/Chicago' },
    ],
  });

  // Part B: ON-dwell fixture with 2h slack after Stop 1 -> honest post-dwell split (+2h wait)
  const rSlack = ST.evaluateStackChain({
    segments: midSegs,
    now: NOW_06,
    config: cfgChi,
    allowSplitBetweenStops: true,
    stops: [
      { id: 's1', label: 'Stop 1', miles: 165, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 9, 0), apptTimeZone: 'America/Chicago' },
      { id: 's2', label: 'Stop 2', miles: 110, mph: 55, dwellMinutes: 120, dwellStatus: 'ON', apptMinute: chi(11, 14, 0), apptTimeZone: 'America/Chicago' },
      { id: 's3', label: 'Stop 3', miles: 165, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 19, 30), apptTimeZone: 'America/Chicago' },
    ],
  });

  // Part C (N2): Long-first 7/3 split with ON dwell at the split stop (Stop 1: 1h ON 09:00-10:00).
  //   Stop 2 appt 21:00 (220 mi = 4h D, 1h ON 21:00-22:00); Stop 3 appt Thu 00:00 (110 mi = 2h D).
  //   Short-first cannot extend the 17:00 window past 19:00, so ONLY long-first 7h SB AFTER Stop 1's
  //   ON dwell (10:00-17:00, +420m wait) paired with 3h OFF after Stop 3 (00:00-03:00) rescues it!
  const rLongFirst = ST.evaluateStackChain({
    segments: midSegs,
    now: NOW_06,
    config: cfgChi,
    allowSplitBetweenStops: true,
    stops: [
      { id: 'lf1', label: 'Stop 1', miles: 165, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 9, 0), apptTimeZone: 'America/Chicago' },
      { id: 'lf2', label: 'Stop 2', miles: 220, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 21, 0), apptTimeZone: 'America/Chicago' },
      { id: 'lf3', label: 'Stop 3', miles: 110, mph: 55, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: chi(12, 0, 0), apptTimeZone: 'America/Chicago' },
    ],
  });

  const sr = rSlack.splitRescue;
  const indep = sr ? E.evaluate([...midSegs, ...sr.simSegments], { asOf: sr.splitComplete.minute, config: cfgChi }) : null;
  const rests = indep ? E.restPeriods(indep.segments) : [];
  // Tighten (F6): verify the EXACT pair the rescue inserted, not any arbitrary pair!
  const r1 = sr ? rests.find((r) => r.start === sr.firstLegStart.minute && r.end === sr.firstLegEnd.minute) : null;
  const r2 = sr ? rests.find((r) => r.start === sr.longSbStart.minute && r.end === sr.longSbEnd.minute) : null;
  const exactPairOk = Boolean(r1 && r2 && r1 !== r2 && E.pairQualifies(r1, r2));
  const dwellRespected = sr ? noRestOverlapsOnDwell(sr.simSegments, [
    [chi(11, 9, 0), chi(11, 10, 0)],   // Stop 1 1h ON dwell
    [chi(11, 14, 0), chi(11, 16, 0)],  // Stop 2 2h ON dwell
    [chi(11, 19, 30), chi(11, 20, 30)], // Stop 3 1h ON dwell
  ]) : false;

  const srL = rLongFirst.splitRescue;
  const indepL = srL ? E.evaluate([...midSegs, ...srL.simSegments], { asOf: srL.splitComplete.minute, config: cfgChi }) : null;
  const restsL = indepL ? E.restPeriods(indepL.segments) : [];
  const rL1 = srL ? restsL.find((r) => r.start === chi(11, 10, 0) && r.end === chi(11, 17, 0)) : null;
  const rL2 = srL ? restsL.find((r) => r.start === chi(12, 0, 0) && r.end === chi(12, 3, 0)) : null;
  const exactPairLongOk = Boolean(rL1 && rL2 && rL1 !== rL2 && E.pairQualifies(rL1, rL2));
  const dwellRespectedLong = srL ? noRestOverlapsOnDwell(srL.simSegments, [
    [chi(11, 9, 0), chi(11, 10, 0)],   // Stop 1 1h ON dwell (before 7h SB)
    [chi(11, 21, 0), chi(11, 22, 0)],  // Stop 2 1h ON dwell
  ]) : false;

  const ok = rTight.status === 'breaks_stop'
    && rTight.splitRescue === null
    && rTight.allSplitRescues.length === 0
    && rTight.firstBreakIndex === 2
    && rTight.limitingClock === 'WINDOW_14'
    && rTight.pushRescue?.breakingStopArrival.minute === chi(12, 5, 0)
    && rSlack.status === 'rescued_by_split'
    && rSlack.firstBreakIndex === 2
    && rSlack.limitingClock === 'WINDOW_14'
    && sr !== null
    && sr.splitKind === '8/2'
    && sr.order === 'short-first'
    && sr.atStopIndex === 0 // exact: after Stop 1's ON dwell (no 0-or-1 shrug)
    && sr.addedWaitMinutes === 120
    && sr.firstLegStart.minute === chi(11, 10, 0)
    && sr.firstLegEnd.minute === chi(11, 12, 0)
    && sr.longSbStart.minute === chi(11, 20, 30)
    && sr.longSbEnd.minute === chi(12, 4, 30)
    && sr.stops[0].dwellStatus === 'ON'
    && sr.stops[0].dwellMinutes === 60
    && sr.stops[2].arrival.minute === chi(11, 19, 0)
    && sr.chainFinish.minute === chi(11, 20, 30)
    && !/\(uses dock dwell\)/.test(sr.summary)
    && sr.sbCallout === ST.STACK_SPLIT_SB_CALLOUT
    && indep !== null && indep.violations.length === 0
    && exactPairOk
    && dwellRespected
    && rLongFirst.status === 'rescued_by_split'
    && srL !== null
    && srL.splitKind === '7/3'
    && srL.order === 'long-first'
    && srL.atStopIndex === 0
    && srL.addedWaitMinutes === 420
    && srL.firstLegStatus === 'SB'
    && srL.firstLegStart.minute === chi(11, 10, 0)
    && srL.firstLegEnd.minute === chi(11, 17, 0)
    && srL.longSbStart.minute === chi(11, 10, 0)
    && srL.longSbEnd.minute === chi(11, 17, 0)
    && srL.chainFinish.minute === chi(12, 0, 0)
    && srL.splitComplete.minute === chi(12, 3, 0)
    && indepL !== null && indepL.violations.length === 0
    && exactPairLongOk
    && dwellRespectedLong;

  return ok || JSON.stringify({
    tight: { status: rTight.status, split: rTight.splitRescue?.atStopIndex ?? null, push: rTight.pushRescue?.breakingStopArrival.homeShort },
    slack: {
      status: rSlack.status,
      sr: sr && {
        kind: sr.splitKind,
        ord: sr.order,
        at: sr.atStopIndex,
        added: sr.addedWaitMinutes,
        l1: [sr.firstLegStart.homeShort, sr.firstLegEnd.homeShort],
        sb: [sr.longSbStart.homeShort, sr.longSbEnd.homeShort],
        s1Dwell: [sr.stops[0].dwellStatus, sr.stops[0].dwellMinutes],
        s3Arr: sr.stops[2].arrival.homeShort,
        fin: sr.chainFinish.homeShort,
        sum: sr.summary,
      },
      exactPairOk,
      dwellRespected,
      indepV: indep?.violations,
    },
    longFirst: {
      status: rLongFirst.status,
      srL: srL && {
        kind: srL.splitKind,
        ord: srL.order,
        at: srL.atStopIndex,
        added: srL.addedWaitMinutes,
        st: srL.firstLegStatus,
        l1: [srL.firstLegStart.homeShort, srL.firstLegEnd.homeShort],
        sb: [srL.longSbStart.homeShort, srL.longSbEnd.homeShort],
        fin: srL.chainFinish.homeShort,
        comp: srL.splitComplete.homeShort,
      },
      exactPairLongOk,
      dwellRespectedLong,
      indepLV: indepL?.violations,
    },
  });
});

/* ---------------- SK3b (new for F3 + F6): Split-rescue path with explicit OFF dock dwell ---------------- */
// Same 3 x 165 mi fixture as SK2, with Stop 2 explicitly marked `dwellStatus: 'OFF'` (driver relieved of duty
// during Stop 2's 2h unload; Stop 1 and Stop 3 remain `dwellStatus: 'ON'`).
//   Stop 1 (ON 09:00-11:00) cannot be reused; Stop 2 (OFF 14:00-16:00) IS reused with addedWaitMinutes = 0!
//   2h OFF (14:00-16:00) pairs with 8h SB after Stop 3 (20:30-04:30) -> 14h window extends 17:00 -> 19:00.
//   Stop 3 drives 16:00-19:00 (30m early for 19:30 appt), waits 19:00-19:30, 1h ON dwell 19:30-20:30.
await pin('SK3b. split-rescue with explicit OFF dwell at Stop 2 (8/2) reuses OFF dwell with 0m added wait and exact inserted pair', async () => {
  const midSegs = [
    { status: 'OFF', start: chi(10, 17, 0), end: chi(11, 3, 0), createdAt: 1 },
    { status: 'D', start: chi(11, 3, 0), end: chi(11, 5, 0), createdAt: 2 },
    { status: 'ON', start: chi(11, 5, 0), end: NOW_06, createdAt: 3 },
  ];
  const r = ST.evaluateStackChain({
    segments: midSegs,
    now: NOW_06,
    config: cfgChi,
    allowSplitBetweenStops: true,
    stops: [
      { id: 's1', label: 'Stop 1', miles: 165, mph: 55, dwellMinutes: 120, dwellStatus: 'ON', apptMinute: chi(11, 9, 0), apptTimeZone: 'America/Chicago' },
      { id: 's2', label: 'Stop 2', miles: 165, mph: 55, dwellMinutes: 120, dwellStatus: 'OFF', apptMinute: chi(11, 14, 0), apptTimeZone: 'America/Chicago' },
      { id: 's3', label: 'Stop 3', miles: 165, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 19, 30), apptTimeZone: 'America/Chicago' },
    ],
  });

  const sr = r.splitRescue;
  const indep = sr ? E.evaluate([...midSegs, ...sr.simSegments], { asOf: sr.splitComplete.minute, config: cfgChi }) : null;
  const rests = indep ? E.restPeriods(indep.segments) : [];
  const r1 = sr ? rests.find((x) => x.start === chi(11, 14, 0) && x.end === chi(11, 16, 0)) : null;
  const r2 = sr ? rests.find((x) => x.start === chi(11, 20, 30) && x.end === chi(12, 4, 30)) : null;
  const exactPairOk = Boolean(r1 && r2 && r1 !== r2 && E.pairQualifies(r1, r2));
  const onDwellsPreserved = sr ? noRestOverlapsOnDwell(sr.simSegments, [
    [chi(11, 9, 0), chi(11, 11, 0)],    // Stop 1 2h ON
    [chi(11, 19, 30), chi(11, 20, 30)], // Stop 3 1h ON
  ]) : false;

  const ok = r.status === 'rescued_by_split'
    && r.tone === 'warn'
    && r.firstBreakIndex === 2
    && r.limitingClock === 'WINDOW_14'
    && sr !== null
    && sr.splitKind === '8/2'
    && sr.order === 'short-first'
    && sr.atStopIndex === 1 // exact: Stop 2 ONLY (Stop 1 is ON)
    && sr.addedWaitMinutes === 0
    && sr.firstLegStart.minute === chi(11, 14, 0)
    && sr.firstLegEnd.minute === chi(11, 16, 0)
    && sr.longSbStart.minute === chi(11, 20, 30)
    && sr.longSbEnd.minute === chi(12, 4, 30)
    && sr.stops[2].arrival.minute === chi(11, 19, 0)
    && sr.stops[2].dwellStart.minute === chi(11, 19, 30)
    && sr.stops[2].meetsAppt === true
    && sr.chainFinish.minute === chi(11, 20, 30)
    && sr.sbCallout === ST.STACK_SPLIT_SB_CALLOUT
    && indep !== null && indep.violations.length === 0
    && exactPairOk
    && onDwellsPreserved;

  return ok || JSON.stringify({
    status: r.status,
    sr: sr && { kind: sr.splitKind, at: sr.atStopIndex, added: sr.addedWaitMinutes, l1: [sr.firstLegStart.homeShort, sr.firstLegEnd.homeShort], sb: [sr.longSbStart.homeShort, sr.longSbEnd.homeShort] },
    exactPairOk,
    onDwellsPreserved,
    indepV: indep?.violations,
  });
});

/* ---------------- SK4: 2-load back-to-back chain with a 10-hr reset between ---------------- */
// Load A (Stop 1): 385 mi (7h D, 06:00-13:00), appt Wed 16:00 (waits 13:00-16:00), 2h live unload (16:00-18:00).
// Load B (Stop 2): 220 mi (4h D), appt Thu 09:00, 1h unload (09:00-10:00).
// Between Load A finish (Wed 18:00) and Load B appt (Thu 09:00) is 15h -> 11h OFF reset (18:00-05:00) + 4h D (05:00-09:00)!
// Both loads meet appointments legally with a 10h+ reset between -> GREEN ALL 2 STOPS LEGAL!
await pin('SK4. 2-load back-to-back chain with 10-hr reset between finishes legally on time for both loads', async () => {
  const r = ST.evaluateStackChain({
    segments: FRESH_SEGS,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 'loadA', label: 'Load A delivery', miles: 385, mph: 55, dwellMinutes: 120, dwellStatus: 'ON', apptMinute: chi(11, 16, 0), apptTimeZone: 'America/Chicago' },
      { id: 'loadB', label: 'Load B pickup', miles: 220, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(12, 9, 0), apptTimeZone: 'America/Chicago' },
    ],
  });

  const indep = E.evaluate([...FRESH_SEGS, ...r.displayChain.simSegments], { asOf: r.displayChain.finishAt, config: cfgChi });
  const loadB = r.displayChain.stops[1];
  const has10hBeforeB = loadB.insertedRests.some((x) => x.kind === 'reset10' && x.minutes >= 600);

  const ok = r.status === 'legal'
    && r.tone === 'good'
    && /ALL 2 STOPS LEGAL/.test(r.headline)
    && r.displayChain.longRestCount >= 1
    && has10hBeforeB
    && r.displayChain.stops[0].meetsAppt === true
    && loadB.meetsAppt === true
    && loadB.arrival.minute <= chi(12, 9, 0)
    && loadB.depart.minute === chi(12, 10, 0)
    && r.displayChain.endEval.shift.windowRemaining === 9 * 60 // started 05:00, finished 10:00 -> 9h left on 14!
    && indep.violations.length === 0;

  return ok || JSON.stringify({
    status: r.status,
    headline: r.headline,
    longRests: r.displayChain.longRestCount,
    loadBRests: loadB.insertedRests,
    loadBArr: loadB.arrival.homeShort,
    loadBDep: loadB.depart.homeShort,
    winRem: r.displayChain.endEval.shift.windowRemaining,
    indepV: indep.violations,
  });
});

/* ---------------- SK5: 70-hour cycle is the binding limit (NOT the 14-hour window) + F7 recap >= 34h ---------------- */
// Part A: 7-prior-day history with 65h ON/D used (Nov 4: 0h; Nov 5..9: 11h each; Nov 10: 10h = 65h)
//   followed by a 14h OFF reset ending at Wed Nov 11 06:00 (11h drive fresh, 14h window fresh, 5h 00m = 300m cycle left).
//   Stop 1: 165 mi (3h D, 06:00-09:00), waits 09:00-09:30 OFF (no cycle burned), 30m ON dwell (09:30-10:00) -> 1h 30m cycle left.
//   Stop 2: 165 mi (3h D needed) + 30m ON dwell, appt Wed 14:00 -> hits 70-hour cycle after 1h 30m driving (at 11:30)!
//   At 11:30: 14h window has 8h 30m left; 11h drive has 6h 30m left -> ONLY 70h CYCLE binds!
//   - restart34 takes 34h OFF (Wed 11:30 -> Thu 21:30), drives 1h 30m -> arrives Thu 23:00.
//   - Fri Nov 13 00:00 recap wait is 36.5h (>= 34h!) -> IS itself a restart, so F7 suppresses altCycleRescue (null)
//     and never mislabels it "midnight recap wait".
// Part B: Genuine <34h recap (Nov 4: 11h, Nov 5..10: 9h each = 65h; Thu Nov 12 00:00 frees 11h after only 12.5h wait!):
//   - Primary pushRescue is 'recap' (Thu 01:30); altCycleRescue is 'restart34' (Thu 23:00).
await pin('SK5. 70-hour cycle binding limit (not 14h) + F7: suppresses >=34h recap alternative, shows genuine <34h recap vs 34h restart', async () => {
  const cycleSegs = [
    { status: 'ON', start: chi(5, 6, 0), end: chi(5, 17, 0), createdAt: 1 },
    { status: 'ON', start: chi(6, 6, 0), end: chi(6, 17, 0), createdAt: 2 },
    { status: 'ON', start: chi(7, 6, 0), end: chi(7, 17, 0), createdAt: 3 },
    { status: 'ON', start: chi(8, 6, 0), end: chi(8, 17, 0), createdAt: 4 },
    { status: 'ON', start: chi(9, 6, 0), end: chi(9, 17, 0), createdAt: 5 },
    { status: 'ON', start: chi(10, 6, 0), end: chi(10, 16, 0), createdAt: 6 },
    { status: 'OFF', start: chi(10, 16, 0), end: NOW_06, createdAt: 7 },
  ];
  const checkNow = E.evaluate(cycleSegs, { asOf: NOW_06, config: cfgChi });
  if (checkNow.cycle.remaining !== 300 || checkNow.shift.windowRemaining !== 840) {
    return `fixture clocks wrong: cyc=${checkNow.cycle.remaining} win=${checkNow.shift.windowRemaining}`;
  }

  const cycleStops = [
    { id: 'c1', label: 'Stop 1', miles: 165, mph: 55, dwellMinutes: 30, dwellStatus: 'ON', apptMinute: chi(11, 9, 30), apptTimeZone: 'America/Chicago' },
    { id: 'c2', label: 'Stop 2', miles: 165, mph: 55, dwellMinutes: 30, dwellStatus: 'ON', apptMinute: chi(11, 14, 0), apptTimeZone: 'America/Chicago' },
  ];
  const r = ST.evaluateStackChain({
    segments: cycleSegs,
    now: NOW_06,
    config: cfgChi,
    allowSplitBetweenStops: true,
    stops: cycleStops,
  });

  // Part B: Nov 4 = 11h, Nov 5..10 = 9h each = 65h -> 12.5h recap at Thu 00:00 (< 34h!)
  const shortRecapSegs = [
    { status: 'ON', start: chi(4, 6, 0), end: chi(4, 17, 0), createdAt: 1 },
    { status: 'ON', start: chi(5, 6, 0), end: chi(5, 15, 0), createdAt: 2 },
    { status: 'ON', start: chi(6, 6, 0), end: chi(6, 15, 0), createdAt: 3 },
    { status: 'ON', start: chi(7, 6, 0), end: chi(7, 15, 0), createdAt: 4 },
    { status: 'ON', start: chi(8, 6, 0), end: chi(8, 15, 0), createdAt: 5 },
    { status: 'ON', start: chi(9, 6, 0), end: chi(9, 15, 0), createdAt: 6 },
    { status: 'ON', start: chi(10, 6, 0), end: chi(10, 15, 0), createdAt: 7 },
    { status: 'OFF', start: chi(10, 15, 0), end: NOW_06, createdAt: 8 },
  ];
  const rRecap = ST.evaluateStackChain({
    segments: shortRecapSegs,
    now: NOW_06,
    config: cfgChi,
    allowSplitBetweenStops: true,
    stops: cycleStops,
  });

  const ok = r.status === 'breaks_stop'
    && r.firstBreakIndex === 1
    && r.firstBreakLabel === 'Stop 2'
    && r.limitingClock === 'CYCLE'
    && r.limitingCite === '49 CFR 395.3(b)(2)'
    && /70-hour/.test(r.limitingClockLabel)
    && /BREAKS AT STOP 2/.test(r.headline)
    && r.splitRescue === null
    && r.pushRescue !== null
    && r.pushRescue.kind === 'restart34'
    && r.pushRescue.breakingStopArrival.minute === chi(12, 23, 0)
    && r.altCycleRescue === null // F7: 36.5h wait >= 34h is suppressed, never labeled "midnight recap wait"
    && !/midnight recap wait/i.test(r.dispatchText)
    && rRecap.limitingClock === 'CYCLE'
    && rRecap.pushRescue !== null
    && rRecap.pushRescue.kind === 'recap'
    && rRecap.pushRescue.breakingStopArrival.minute === chi(12, 1, 30)
    && rRecap.altCycleRescue !== null
    && rRecap.altCycleRescue.kind === 'restart34'
    && rRecap.altCycleRescue.breakingStopArrival.minute === chi(12, 23, 0);

  return ok || JSON.stringify({
    partA: {
      status: r.status,
      limit: r.limitingClock,
      cite: r.limitingCite,
      push: r.pushRescue && [r.pushRescue.kind, r.pushRescue.breakingStopArrival.homeShort],
      alt: r.altCycleRescue && [r.altCycleRescue.kind, r.altCycleRescue.breakingStopArrival.homeShort],
      hasRecapText: /midnight recap wait/i.test(r.dispatchText),
    },
    partB: {
      limit: rRecap.limitingClock,
      push: rRecap.pushRescue && [rRecap.pushRescue.kind, rRecap.pushRescue.breakingStopArrival.homeShort],
      alt: rRecap.altCycleRescue && [rRecap.altCycleRescue.kind, rRecap.altCycleRescue.breakingStopArrival.homeShort],
    },
  });
});

/* ---------------- SK6 (tightened for F6 + F1 + F9b): Dispatch pushback copy text content ---------------- */
await pin('SK6. dispatch pushback text carries exact CFR cites (zero bogus cites on TIME_ONLY), exact ETA/PTA lines, non-legal qualifier when pushRescue is null, and ELD disclaimer', async () => {
  const midSegs = [
    { status: 'OFF', start: chi(10, 17, 0), end: chi(11, 3, 0), createdAt: 1 },
    { status: 'D', start: chi(11, 3, 0), end: chi(11, 5, 0), createdAt: 2 },
    { status: 'ON', start: chi(11, 5, 0), end: NOW_06, createdAt: 3 },
  ];
  const rSplit = ST.evaluateStackChain({
    segments: midSegs,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 's1', label: 'Stop 1', miles: 165, mph: 55, dwellMinutes: 120, dwellStatus: 'ON', apptMinute: chi(11, 9, 0), apptTimeZone: 'America/Chicago' },
      { id: 's2', label: 'Stop 2', miles: 165, mph: 55, dwellMinutes: 120, dwellStatus: 'OFF', apptMinute: chi(11, 14, 0), apptTimeZone: 'America/Chicago' },
      { id: 's3', label: 'Stop 3', miles: 165, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 19, 30), apptTimeZone: 'America/Chicago' },
    ],
  });
  const t = rSplit.dispatchText;

  const cycleSegs = [
    { status: 'ON', start: chi(5, 6, 0), end: chi(5, 17, 0), createdAt: 1 },
    { status: 'ON', start: chi(6, 6, 0), end: chi(6, 17, 0), createdAt: 2 },
    { status: 'ON', start: chi(7, 6, 0), end: chi(7, 17, 0), createdAt: 3 },
    { status: 'ON', start: chi(8, 6, 0), end: chi(8, 17, 0), createdAt: 4 },
    { status: 'ON', start: chi(9, 6, 0), end: chi(9, 17, 0), createdAt: 5 },
    { status: 'ON', start: chi(10, 6, 0), end: chi(10, 16, 0), createdAt: 6 },
    { status: 'OFF', start: chi(10, 16, 0), end: NOW_06, createdAt: 7 },
  ];
  const rCyc = ST.evaluateStackChain({
    segments: cycleSegs,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 'c1', label: 'Stop 1', miles: 165, mph: 55, dwellMinutes: 30, dwellStatus: 'ON', apptMinute: chi(11, 9, 30), apptTimeZone: 'America/Chicago' },
      { id: 'c2', label: 'Stop 2', miles: 165, mph: 55, dwellMinutes: 30, dwellStatus: 'ON', apptMinute: chi(11, 14, 0), apptTimeZone: 'America/Chicago' },
    ],
  });
  const tc = rCyc.dispatchText;

  // Probe A (TIME_ONLY): must carry ZERO CFR cites
  const rTimeOnly = ST.evaluateStackChain({
    segments: FRESH_SEGS,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 'a', label: 'A', miles: 165, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 9, 0), apptTimeZone: 'America/Chicago' },
      { id: 'b', label: 'B', miles: 220, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(12, 9, 0), apptTimeZone: 'America/Chicago' },
      { id: 'c', label: 'C', miles: 330, mph: 55, dwellMinutes: 30, dwellStatus: 'ON', apptMinute: chi(12, 11, 0), apptTimeZone: 'America/Chicago' },
    ],
  });
  const tTime = rTimeOnly.dispatchText;

  // F9(b) + N2: REAL chain (not synthetic) where no legal pass exists (12h continuous tentative D lead
  // causes post-now violations in both reset10Pass and restart34Pass -> pushRescue === null).
  const rNoLegal = ST.evaluateStackChain({
    segments: FRESH_SEGS,
    now: NOW_06,
    departure: chi(11, 18, 0),
    untilDepartureStatus: 'D',
    config: cfgChi,
    stops: [
      { id: 'nl1', label: 'Stop 1', miles: 110, mph: 55, dwellMinutes: 30, dwellStatus: 'ON', apptMinute: chi(11, 20, 0), apptTimeZone: 'America/Chicago' },
      { id: 'nl2', label: 'Stop 2', miles: 110, mph: 55, dwellMinutes: 30, dwellStatus: 'ON', apptMinute: null, apptTimeZone: 'America/Chicago' },
    ],
  });
  const tNoLegal = rNoLegal.dispatchText;

  const ok = t.includes('Cannot run Stop 3 as stacked — 14-hour window (49 CFR 395.3(a)(2)).')
    && !t.includes('395.3(a)(3)(i)') && !t.includes('395.3(b)')
    && t.includes('Stop 1: ETA Wed 09:00, PTA Wed 11:00')
    && t.includes('Stop 2: ETA Wed 14:00, PTA Wed 16:00')
    && t.includes('Stop 3: ETA Thu 05:00, PTA Thu 06:00 after 10h rest')
    && t.includes('Split option (49 CFR 395.1(g)): 8/2 sleeper split at Stop 2')
    && t.includes('Planning estimate — my ELD governs.')
    && tc.includes('Cannot run Stop 2 as stacked — 70-hour / 8-day cycle (49 CFR 395.3(b)(2)).')
    && !tc.includes('395.3(a)(2)') && !tc.includes('395.3(a)(3)(i)')
    && tc.includes('Stop 2: ETA Thu 23:00, PTA Thu 23:30 after 34h restart')
    && !/midnight recap wait/i.test(tc)
    && tc.includes('Planning estimate — my ELD governs.')
    && tTime.includes('Cannot run C as stacked — drive + dock time.')
    && !/CFR|395\.|§/i.test(tTime)
    && tTime.includes('C: ETA Thu 16:00, PTA Thu 16:30 (misses Thu 11:00 appt by 5h 00m)')
    && rNoLegal.pushRescue === null
    && rNoLegal.reset10Pass.hosLegal === false
    && rNoLegal.restart34Pass.hosLegal === false
    && tNoLegal.includes('No legal schedule found within planner bounds — as stacked (not legal):');

  return ok || JSON.stringify({ t, tc, tTime, tNoLegal, noLegalPush: rNoLegal.pushRescue });
});

/* ---------------- SK7 (expanded for F2 + F6): Dual home/local timezone engine + UI entry ---------------- */
await pin('SK7. cross-timezone stop: engine dual-TZ formatting + UI lets zone be picked before time and re-resolves wall-clock on zone switch (F2)', async () => {
  const apptET1500 = E.localToMinute(2026, 11, 11, 15, 'America/New_York'); // 15:00 ET = 14:00 CT
  const r = ST.evaluateStackChain({
    segments: FRESH_SEGS,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 'z1', label: 'Chicago pickup', miles: 165, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 9, 0), apptTimeZone: 'America/Chicago' },
      { id: 'z2', label: 'Indianapolis drop', miles: 165, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: apptET1500, apptTimeZone: 'America/New_York' },
    ],
  });
  const s2 = r.displayChain.stops[1];
  const engineOk = r.status === 'legal'
    && s2.sameZone === false
    && s2.arrival.homeShort === 'Wed 13:00'
    && s2.arrival.localShort === 'Wed 14:00'
    && s2.appt?.localShort === 'Wed 15:00'
    && s2.appt?.homeShort === 'Wed 14:00'
    && s2.apptSlack === 60
    && /Wed 14:00 Eastern \(Wed 13:00 home\)/.test(r.dispatchText);

  // UI-level F2 pin: open Stack tool with default CT stops (apptMinute === null)
  await seed({ tab: 'plan', nowOverride: NOW_06, segments: FRESH_SEGS, current: null });
  const pg = planPage();
  const stackItem = all((n) => n.localName === 'button' && has(n, 'plan-item') && /Stack my stops & loads/.test(n.textContent), pg)[0];
  fire(stackItem, 'click');
  await sleep(60);
  const rm = planRoom();

  // 1. Zone selector MUST be visible BEFORE any appointment time is set!
  const tzSel0Before = all((n) => n.localName === 'select' && n.attributes?.['aria-label'] === 'Stop 1 time zone', rm)[0];
  const tzSel1Before = all((n) => n.localName === 'select' && n.attributes?.['aria-label'] === 'Stop 2 time zone', rm)[0];
  if (!tzSel0Before || !tzSel1Before) {
    return `F2 fail: zone selector hidden before appointment set (s1=${!!tzSel0Before}, s2=${!!tzSel1Before})`;
  }

  // 2. Flow B: Enter 15:00 for Stop 2 (while still in default Central), THEN switch zone to America/New_York.
  //    Stored apptMinute MUST re-resolve wall-clock 15:00 in America/New_York (NOT stay 15:00 CT = 16:00 ET!).
  const apptBtn1 = all((n) => n.localName === 'button' && n.attributes?.['data-stack-appt-btn'] === '1', rm)[0];
  fire(apptBtn1, 'click');
  await sleep(50);
  let sh = all((n) => has(n, 'sheet'))[0];
  let dayIn = sh && all((n) => n.localName === 'input' && has(n, 'ed-day-input'), sh)[0];
  let clkIn = sh && all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), sh)[0];
  let goBtn = sh && all((n) => n.localName === 'button' && has(n, 'ed-go'), sh)[0];
  dayIn.value = '2026-11-11'; fire(dayIn, 'input'); await sleep(20);
  clkIn.value = '15:00'; fire(clkIn, 'input'); await sleep(20);
  fire(goBtn, 'click'); await sleep(60);

  const tzSel1 = all((n) => n.localName === 'select' && n.attributes?.['aria-label'] === 'Stop 2 time zone', rm)[0];
  tzSel1.value = 'America/New_York';
  fire(tzSel1, 'change');
  await sleep(60);

  const apptBtn1After = all((n) => n.localName === 'button' && n.attributes?.['data-stack-appt-btn'] === '1', rm)[0];
  const storedMinAfterSwitch = Number(apptBtn1After?.attributes?.['data-stack-appt-min'] ?? NaN);
  const btn1Text = apptBtn1After?.textContent ?? '';

  // 3. Flow A: Pick zone FIRST on Stop 1 (America/New_York while apptMinute is null), THEN enter 11:00.
  const tzSel0 = all((n) => n.localName === 'select' && n.attributes?.['aria-label'] === 'Stop 1 time zone', rm)[0];
  tzSel0.value = 'America/New_York';
  fire(tzSel0, 'change');
  await sleep(40);
  const apptBtn0 = all((n) => n.localName === 'button' && n.attributes?.['data-stack-appt-btn'] === '0', rm)[0];
  fire(apptBtn0, 'click');
  await sleep(50);
  sh = all((n) => has(n, 'sheet'))[0];
  dayIn = sh && all((n) => n.localName === 'input' && has(n, 'ed-day-input'), sh)[0];
  clkIn = sh && all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), sh)[0];
  goBtn = sh && all((n) => n.localName === 'button' && has(n, 'ed-go'), sh)[0];
  dayIn.value = '2026-11-11'; fire(dayIn, 'input'); await sleep(20);
  clkIn.value = '11:00'; fire(clkIn, 'input'); await sleep(20);
  fire(goBtn, 'click'); await sleep(60);

  const apptBtn0After = all((n) => n.localName === 'button' && n.attributes?.['data-stack-appt-btn'] === '0', rm)[0];
  const storedMinPreZone = Number(apptBtn0After?.attributes?.['data-stack-appt-min'] ?? NaN);
  const expectedET1100 = E.localToMinute(2026, 11, 11, 11, 'America/New_York');

  // 4. Flow C (N3): Home entry mode ("the time you see is the time that stays").
  //    On Stop 2 (currently America/New_York), switch entry mode to Home (Central), enter 15:00 (15:00 CT = 16:00 ET),
  //    then change zone from America/New_York -> America/Los_Angeles (two non-home zones!).
  //    The wall time typed in Home mode (15:00) MUST survive and re-resolve in Pacific (15:00 PT, NOT 16:00 PT!),
  //    and a follow-on switch Pacific -> Denver MUST keep 15:00 Mountain without drifting.
  const entryGrp1 = all((n) => n.attributes?.['aria-label'] === 'Stop 2 time entry zone', rm)[0];
  const homeModeBtn1 = entryGrp1 && all((n) => n.localName === 'button' && /Home \(Central\)/.test(n.textContent), entryGrp1)[0];
  if (!homeModeBtn1) return 'N3 fail: missing Home (Central) entry mode toggle on Stop 2';
  fire(homeModeBtn1, 'click');
  await sleep(40);
  fire(all((n) => n.localName === 'button' && n.attributes?.['data-stack-appt-btn'] === '1', rm)[0], 'click');
  await sleep(50);
  sh = all((n) => has(n, 'sheet'))[0];
  dayIn = sh && all((n) => n.localName === 'input' && has(n, 'ed-day-input'), sh)[0];
  clkIn = sh && all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), sh)[0];
  goBtn = sh && all((n) => n.localName === 'button' && has(n, 'ed-go'), sh)[0];
  dayIn.value = '2026-11-11'; fire(dayIn, 'input'); await sleep(20);
  clkIn.value = '15:00'; fire(clkIn, 'input'); await sleep(20);
  fire(goBtn, 'click'); await sleep(60);

  const btn1HomeEntered = all((n) => n.localName === 'button' && n.attributes?.['data-stack-appt-btn'] === '1', rm)[0];
  const storedHomeEntered = Number(btn1HomeEntered?.attributes?.['data-stack-appt-min'] ?? NaN);
  const btn1HomeText = btn1HomeEntered?.textContent ?? '';

  const tzSel1ToLA = all((n) => n.localName === 'select' && n.attributes?.['aria-label'] === 'Stop 2 time zone', rm)[0];
  tzSel1ToLA.value = 'America/Los_Angeles';
  fire(tzSel1ToLA, 'change');
  await sleep(60);

  const btn1AfterLA = all((n) => n.localName === 'button' && n.attributes?.['data-stack-appt-btn'] === '1', rm)[0];
  const storedMinLA = Number(btn1AfterLA?.attributes?.['data-stack-appt-min'] ?? NaN);
  const btn1LAText = btn1AfterLA?.textContent ?? '';
  const expectedPT1500 = E.localToMinute(2026, 11, 11, 15, 'America/Los_Angeles');

  const tzSel1ToDen = all((n) => n.localName === 'select' && n.attributes?.['aria-label'] === 'Stop 2 time zone', rm)[0];
  tzSel1ToDen.value = 'America/Denver';
  fire(tzSel1ToDen, 'change');
  await sleep(60);
  const storedMinDen = Number(all((n) => n.localName === 'button' && n.attributes?.['data-stack-appt-btn'] === '1', rm)[0]?.attributes?.['data-stack-appt-min'] ?? NaN);
  const expectedMT1500 = E.localToMinute(2026, 11, 11, 15, 'America/Denver');

  // 5. Flow D (N3): Nonexistent spring-forward wall time (Phoenix 02:30 on 2027-03-14 -> America/Chicago).
  //    Seed Stop 1 with a real Phoenix 02:30 appointment (avoiding deviceTz spring-forward coercion in ClockPick
  //    when the test host runs under TZ=America/Chicago), verify the button shows 02:30 Phoenix, then switch
  //    Stop 1's zone <select> to America/Chicago: engine resolves forward to 03:30 CDT and the button visibly
  //    displays 03:30 Central.
  const expectedPhx0230 = ST.resolveStackWallMinute('2027-03-14', '02:30', 'America/Phoenix');
  await seed({ tab: 'plan', nowOverride: NOW_06, segments: FRESH_SEGS, current: null });
  ST.saveStackDraft({
    stops: [
      { id: 'sf1', label: 'Stop 1', miles: 180, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: expectedPhx0230, apptTimeZone: 'America/Phoenix' },
      { id: 'sf2', label: 'Stop 2', miles: 120, mph: 55, dwellMinutes: 15, dwellStatus: 'ON', apptMinute: null, apptTimeZone: 'America/Chicago' },
    ],
    departureMinute: null,
    untilDepartureStatus: 'ON',
  });
  fire(all((n) => n.localName === 'button' && has(n, 'plan-item') && /Stack my stops & loads/.test(n.textContent), planPage())[0], 'click');
  await sleep(60);
  const rmSpring = planRoom();

  const btn0PhxBefore = all((n) => n.localName === 'button' && n.attributes?.['data-stack-appt-btn'] === '0', rmSpring)[0];
  const storedPhx0230 = Number(btn0PhxBefore?.attributes?.['data-stack-appt-min'] ?? NaN);
  const btn0PhxText = btn0PhxBefore?.textContent ?? '';

  const tzSel0Chi = all((n) => n.localName === 'select' && n.attributes?.['aria-label'] === 'Stop 1 time zone', rmSpring)[0];
  tzSel0Chi.value = 'America/Chicago';
  fire(tzSel0Chi, 'change');
  await sleep(60);

  const btn0SpringAfter = all((n) => n.localName === 'button' && n.attributes?.['data-stack-appt-btn'] === '0', rmSpring)[0];
  const storedSpringChi = Number(btn0SpringAfter?.attributes?.['data-stack-appt-min'] ?? NaN);
  const btn0SpringText = btn0SpringAfter?.textContent ?? '';
  const expectedSpringChi0330 = E.localToMinute(2027, 3, 14, 3, 'America/Chicago') + 30;

  const ok = engineOk
    && storedMinAfterSwitch === apptET1500
    && /15:00 Eastern/.test(btn1Text)
    && /14:00 Central \(home\)/.test(btn1Text)
    && storedMinPreZone === expectedET1100
    && storedHomeEntered === chi(11, 15, 0)
    && /15:00 Central \(home\)/.test(btn1HomeText)
    && storedMinLA === expectedPT1500
    && /15:00 Pacific/.test(btn1LAText)
    && /17:00 Central \(home\)/.test(btn1LAText)
    && storedMinDen === expectedMT1500
    && storedPhx0230 === expectedPhx0230
    && /02:30/.test(btn0PhxText)
    && storedSpringChi === expectedSpringChi0330
    && /03:30 Central/.test(btn0SpringText);

  return ok || JSON.stringify({
    engineOk,
    storedMinAfterSwitch,
    expectedET1500: apptET1500,
    btn1Text,
    storedMinPreZone,
    expectedET1100,
    n3Home: { storedHomeEntered, expectedCT1500: chi(11, 15, 0), btn1HomeText, storedMinLA, expectedPT1500, btn1LAText, storedMinDen, expectedMT1500 },
    n3Spring: { storedPhx0230, expectedPhx0230, btn0PhxText, storedSpringChi, expectedSpringChi0330, btn0SpringText },
  });
});

/* ---------------- SK8: Plan hub 8th item, verdict-first, quick-add chips, duration boxes, ClockPick compliance & Back ---------------- */
await pin('SK8. Plan hub lists "Stack my stops & loads" 8th (above "Do I Make It Back or Motel?"), opens verdict-first, supports +Add/presets, duration boxes, ClockPick (zero <input type="time">), and Back/tab-leave', async () => {
  await seed({ tab: 'plan', nowOverride: NOW_06, segments: FRESH_SEGS, current: null });
  const pg = planPage();
  const items = all((n) => n.localName === 'button' && has(n, 'plan-item'), pg);
  const titles = items.map((b) => all((n) => n.localName === 'b', b)[0]?.textContent?.trim());
  // Re-aimed (navy1 B1): Plan hub groups the 12 tools by time horizon; locate by title instead of fixed index.
  const required = ['Split-sleeper rescue', 'Stack my stops & loads', 'Do I Make It Back or Motel?', 'Can I Legally Use It?', 'Flip My Clock', 'Miles Left in My 70'];
  if (items.length !== 12 || !required.every((t) => titles.includes(t))) {
    return `unexpected Plan hub items: ${JSON.stringify(titles)}`;
  }

  const stackBtn = items[titles.indexOf('Stack my stops & loads')];
  fire(stackBtn, 'click');
  await sleep(60);
  if (!A.isStackPlannerOpen()) return 'stack tool did not open';

  const rm = planRoom();
  const h1 = all((n) => n.localName === 'h1' && has(n, 'screen-title'), rm)[0]?.textContent?.trim();
  const verdictEl = all((n) => n.attributes?.['data-stack-verdict'] === '1', rm)[0];
  const tlEl = all((n) => n.attributes?.['data-stack-timeline'] === '1', rm)[0];
  const edEl = all((n) => n.attributes?.['data-stack-editor'] === '1', rm)[0];
  const txt = rm.textContent;
  const verdictFirst = !!verdictEl && !!tlEl && !!edEl
    && txt.indexOf(verdictEl.textContent) < txt.indexOf(tlEl.textContent)
    && txt.indexOf(tlEl.textContent) < txt.indexOf(edEl.textContent);

  const timeInputs = all((n) => n.localName === 'input' && n.attributes?.type === 'time', rm);

  const stopsBefore = all((n) => n.attributes?.['data-stack-stop-editor'] !== undefined, rm);
  const dhBtn = all((n) => n.localName === 'button' && n.textContent.trim() === '+45m deadhead', rm)[0];
  if (!dhBtn) return 'missing +45m deadhead quick-add chip';
  fire(dhBtn, 'click');
  await sleep(40);
  const stopsAfterAdd = all((n) => n.attributes?.['data-stack-stop-editor'] !== undefined, rm);

  const durBoxes = all((n) => has(n, 'dur-boxes'), rm);

  const apptBtn = all((n) => n.localName === 'button' && n.attributes?.['data-stack-appt-btn'] === '0', rm)[0];
  if (!apptBtn) return 'missing Stop 1 appointment button';
  fire(apptBtn, 'click');
  await sleep(50);
  const sh = all((n) => has(n, 'sheet'))[0];
  const dayIn = sh && all((n) => n.localName === 'input' && has(n, 'ed-day-input'), sh)[0];
  const clkIn = sh && all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), sh)[0];
  const goBtn = sh && all((n) => n.localName === 'button' && has(n, 'ed-go'), sh)[0];
  if (!sh || !dayIn || !clkIn || !goBtn) return `ClockPick sheet missing controls: sh=${!!sh} day=${!!dayIn} clk=${!!clkIn} go=${!!goBtn}`;
  dayIn.value = '2026-11-11'; fire(dayIn, 'input'); await sleep(20);
  clkIn.value = '10:30'; fire(clkIn, 'input'); await sleep(20);
  fire(goBtn, 'click'); await sleep(60);

  const afterAppt = all((n) => n.localName === 'button' && n.attributes?.['data-stack-appt-btn'] === '0', rm)[0]?.textContent ?? '';
  const timeInputsAfterAppt = all((n) => n.localName === 'input' && n.attributes?.type === 'time', rm);

  const copyBtn = all((n) => n.localName === 'button' && n.attributes?.['data-stack-copy-btn'] === '1', rm)[0];
  const preText = all((n) => n.attributes?.['data-stack-dispatch'] === '1', rm)[0]?.textContent ?? '';

  const backBtn = all((n) => n.localName === 'button' && has(n, 'back'), rm)[0];
  fire(backBtn, 'click');
  await sleep(60);
  const closedOnBack = !A.isStackPlannerOpen() && !has(rm, 'is-active');

  fire(stackBtn, 'click');
  await sleep(50);
  const reopened = A.isStackPlannerOpen();
  setState({ tab: 'now' }); await sleep(50);
  setState({ tab: 'plan' }); await sleep(50);
  const closedOnLeave = !A.isStackPlannerOpen();

  const ok = h1 === 'Stack my stops & loads'
    && verdictFirst
    && timeInputs.length === 0 && timeInputsAfterAppt.length === 0
    && stopsBefore.length === 2 && stopsAfterAdd.length === 3
    && durBoxes.length === 3
    && /10:30/.test(afterAppt)
    && !!copyBtn && /my ELD governs/.test(preText)
    && closedOnBack && reopened && closedOnLeave;

  return ok || JSON.stringify({
    h1,
    verdictFirst,
    timeInputs: [timeInputs.length, timeInputsAfterAppt.length],
    stops: [stopsBefore.length, stopsAfterAdd.length],
    durBoxes: durBoxes.length,
    afterAppt,
    hasCopy: !!copyBtn,
    closedOnBack,
    reopened,
    closedOnLeave,
  });
});

/* ---------------- SK9 (new for F1): Probe A — voluntary overnight alignment rest is NEVER cited as binding limit ---------------- */
// Fresh driver Wed 06:00 CT:
//   A: 165 mi (3h D, 06:00-09:00), appt Wed 09:00, 1h ON dwell (09:00-10:00).
//   B: 220 mi (4h D), appt Thu 09:00 (overnight voluntary alignment rest Wed 10:00-Thu 05:00), 1h ON dwell (09:00-10:00).
//   C: 330 mi (6h D, Thu 10:00-16:00), appt Thu 11:00, 30m ON dwell (16:00-16:30).
// Pure drive+dock time miss (6h drive after 10:00 cannot reach 11:00); zero HOS violations -> TIME_ONLY, NO CFR cite anywhere!
await pin('SK9. Probe A (F1): voluntary overnight alignment rest tags NONE -> TIME_ONLY ("drive + dock time") with ZERO CFR cite in verdict or dispatch text', async () => {
  const r = ST.evaluateStackChain({
    segments: FRESH_SEGS,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 'a', label: 'A', miles: 165, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 9, 0), apptTimeZone: 'America/Chicago' },
      { id: 'b', label: 'B', miles: 220, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(12, 9, 0), apptTimeZone: 'America/Chicago' },
      { id: 'c', label: 'C', miles: 330, mph: 55, dwellMinutes: 30, dwellStatus: 'ON', apptMinute: chi(12, 11, 0), apptTimeZone: 'America/Chicago' },
    ],
  });

  const bAlignRest = r.displayChain.stops[1].insertedRests.find((x) => x.kind === 'reset10');
  const allCopy = `${r.headline}\n${r.subline}\n${r.pushRescue?.title ?? ''}\n${r.pushRescue?.restSummary ?? ''}\n${r.dispatchText}`;
  const ok = r.status === 'breaks_stop'
    && r.firstBreakIndex === 2
    && r.firstBreakLabel === 'C'
    && r.limitingClock === 'TIME_ONLY'
    && r.limitingClockLabel === 'drive + dock time'
    && r.limitingCite === null
    && bAlignRest?.triggeredBy === 'NONE'
    && !/CFR|395\.|§/i.test(allCopy)
    && !/10-hour break/i.test(r.subline)
    && /drive \+ dock time/.test(r.headline)
    && r.pushRescue !== null
    && r.pushRescue.breakingStopArrival.minute === chi(12, 16, 0);

  return ok || JSON.stringify({
    status: r.status,
    breakIdx: r.firstBreakIndex,
    limit: r.limitingClock,
    label: r.limitingClockLabel,
    cite: r.limitingCite,
    bTrig: bAlignRest?.triggeredBy,
    headline: r.headline,
    subline: r.subline,
    pushTitle: r.pushRescue?.title,
    dispatch: r.dispatchText,
  });
});

/* ---------------- SK10 (new for F4): Probe E — first breaking stop is Stop 1 even without appointment ---------------- */
// Mid-shift driver (9h drive / 11h window left at Wed 06:00: OFF Tue 17:00-Wed 03:00, D 03:00-05:00, ON 05:00-06:00).
//   Stop 1: 600 mi @ 55 mph (655m = 10h 55m), NO appointment, 0 dwell -> hits 11h driving limit on leg to Stop 1!
//           Legal reset10 inserts 10h reset before Stop 1 completes -> arrives Thu 03:25.
//   Stop 2: 110 mi @ 55 mph (2h), appt Wed 20:00, 0 dwell -> arrives Thu 05:25.
// Verdict MUST name Stop 1 (index 0) and place the 10-hour break before Stop 1!
// Guard: planned multi-shift chain (Load A -> overnight rest -> Load B on time -> Load C impossible) still breaks at Load C!
await pin('SK10. Probe E (F4): HOS violation on unappointed Stop 1 names Stop 1 with reset before Stop 1 (while planned overnight Load B stays unblamed)', async () => {
  const midSegs = [
    { status: 'OFF', start: chi(10, 17, 0), end: chi(11, 3, 0), createdAt: 1 },
    { status: 'D', start: chi(11, 3, 0), end: chi(11, 5, 0), createdAt: 2 },
    { status: 'ON', start: chi(11, 5, 0), end: NOW_06, createdAt: 3 },
  ];
  const r = ST.evaluateStackChain({
    segments: midSegs,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 'e1', label: 'Stop 1', miles: 600, mph: 55, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: null, apptTimeZone: 'America/Chicago' },
      { id: 'e2', label: 'Stop 2', miles: 110, mph: 55, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: chi(11, 20, 0), apptTimeZone: 'America/Chicago' },
    ],
  });

  // Multi-shift guard: Load A (7h D, appt Wed 16:00, 2h dwell -> 18:00) -> Load B (4h D, appt Thu 09:00, 1h dwell -> 10:00)
  // -> Load C (6h D, appt Thu 11:00). Load B's overnight rest fits Load B's appt, so Load C is the first breaking stop!
  const rMulti = ST.evaluateStackChain({
    segments: FRESH_SEGS,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 'm1', label: 'Load A', miles: 385, mph: 55, dwellMinutes: 120, dwellStatus: 'ON', apptMinute: chi(11, 16, 0), apptTimeZone: 'America/Chicago' },
      { id: 'm2', label: 'Load B', miles: 220, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(12, 9, 0), apptTimeZone: 'America/Chicago' },
      { id: 'm3', label: 'Load C', miles: 330, mph: 55, dwellMinutes: 30, dwellStatus: 'ON', apptMinute: chi(12, 11, 0), apptTimeZone: 'America/Chicago' },
    ],
  });

  const s1HasReset = r.displayChain.stops[0].insertedRests.some((x) => x.kind === 'reset10');
  const ok = r.status === 'breaks_stop'
    && r.firstBreakIndex === 0
    && r.firstBreakLabel === 'Stop 1'
    && r.limitingClock === 'DRIVE_11'
    && r.limitingCite === '49 CFR 395.3(a)(3)(i)'
    && /BREAKS AT STOP 1/.test(r.headline)
    && /Push Stop 1 past a 10-hour break/.test(r.subline)
    && r.pushRescue !== null
    && r.pushRescue.breakingStopArrival.minute === chi(12, 3, 25)
    && s1HasReset
    && rMulti.firstBreakIndex === 2
    && rMulti.firstBreakLabel === 'Load C'
    && rMulti.limitingClock === 'TIME_ONLY';

  return ok || JSON.stringify({
    probeE: {
      status: r.status,
      breakIdx: r.firstBreakIndex,
      breakLbl: r.firstBreakLabel,
      limit: r.limitingClock,
      headline: r.headline,
      subline: r.subline,
      pushArr: r.pushRescue?.breakingStopArrival.homeShort,
      s1HasReset,
    },
    multi: {
      breakIdx: rMulti.firstBreakIndex,
      breakLbl: rMulti.firstBreakLabel,
      limit: rMulti.limitingClock,
    },
  });
});

/* ---------------- SK11 (new for F5): Pinned "Start chain at" time is absolute and never drifts ---------------- */
await pin('SK11. pinned start time (F5) is stored as an absolute minute, does not drift when clock ticks, and clamps >= now', async () => {
  const baseTms = new Date(2026, 10, 11, 6, 0, 0).getTime();
  Tms = baseTms;
  await seed({ tab: 'plan', nowOverride: NOW_06, segments: FRESH_SEGS, current: null });
  const pg = planPage();
  const stackItem = all((n) => n.localName === 'button' && has(n, 'plan-item') && /Stack my stops & loads/.test(n.textContent), pg)[0];
  fire(stackItem, 'click');
  await sleep(60);
  const rm = planRoom();

  // Set "Chain starts" to Wed Nov 11 09:00 via ClockPick
  const depBtn = all((n) => n.localName === 'button' && n.attributes?.['data-stack-dep-btn'] === '1', rm)[0];
  fire(depBtn, 'click');
  await sleep(50);
  const sh = all((n) => has(n, 'sheet'))[0];
  const dayIn = sh && all((n) => n.localName === 'input' && has(n, 'ed-day-input'), sh)[0];
  const clkIn = sh && all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), sh)[0];
  const goBtn = sh && all((n) => n.localName === 'button' && has(n, 'ed-go'), sh)[0];
  dayIn.value = '2026-11-11'; fire(dayIn, 'input'); await sleep(20);
  clkIn.value = '09:00'; fire(clkIn, 'input'); await sleep(20);
  fire(goBtn, 'click'); await sleep(60);

  const expectedDep = chi(11, 9, 0);
  const depBeforeText = all((n) => n.localName === 'button' && n.attributes?.['data-stack-dep-btn'] === '1', rm)[0]?.textContent ?? '';
  const headlineBefore = all((n) => has(n, 'stack-headline'), rm)[0]?.textContent ?? '';
  const draftBefore = ST.loadStackDraft(55, 'America/Chicago');

  // Advance test clock by 45 minutes (06:00 -> 06:45): pinned 09:00 MUST NOT drift to 09:45!
  Tms = baseTms + 45 * 60000;
  setState({ nowOverride: chi(11, 6, 45) });
  await sleep(60);

  const depAfterBtn = all((n) => n.localName === 'button' && n.attributes?.['data-stack-dep-btn'] === '1', rm)[0];
  const depAfterText = depAfterBtn?.textContent ?? '';
  const depAfterMin = Number(depAfterBtn?.attributes?.['data-stack-dep-min'] ?? NaN);
  const headlineAfter = all((n) => has(n, 'stack-headline'), rm)[0]?.textContent ?? '';
  const draftAfter = ST.loadStackDraft(55, 'America/Chicago');

  // Advance clock past pinned start (09:30): departure clamps >= now (09:30)
  Tms = baseTms + 210 * 60000;
  setState({ nowOverride: chi(11, 9, 30) });
  await sleep(60);
  const depClampedBtn = all((n) => n.localName === 'button' && n.attributes?.['data-stack-dep-btn'] === '1', rm)[0];
  const depClampedMin = Number(depClampedBtn?.attributes?.['data-stack-dep-min'] ?? NaN);
  const depClampedText = depClampedBtn?.textContent ?? '';

  // Restore Tms
  Tms = baseTms;

  // N4: sanitizeStackDraft 72h future sanity bound on departureMinute (past values still pass through and clamp at compute).
  const baseStops = ST.createDefaultStops(55, 'America/Chicago');
  const dAtCap = ST.sanitizeStackDraft({ stops: baseStops, departureMinute: NOW_06 + ST.STACK_MAX_DEPARTURE_FUTURE_MIN, untilDepartureStatus: 'ON' }, 55, 'America/Chicago', NOW_06);
  const dOverCap = ST.sanitizeStackDraft({ stops: baseStops, departureMinute: NOW_06 + ST.STACK_MAX_DEPARTURE_FUTURE_MIN + 1, untilDepartureStatus: 'ON' }, 55, 'America/Chicago', NOW_06);
  const dPast = ST.sanitizeStackDraft({ stops: baseStops, departureMinute: NOW_06 - 60, untilDepartureStatus: 'ON' }, 55, 'America/Chicago', NOW_06);
  const dInf = ST.sanitizeStackDraft({ stops: baseStops, departureMinute: Infinity, untilDepartureStatus: 'ON' }, 55, 'America/Chicago', NOW_06);

  // R2: Picking beyond 72h in the "Start chain at" ClockPick clamps at pick time to now + 72h,
  // displays the clamped time visibly (never the unkept 4-day-out time), and survives draft save/load & tab re-entry unchanged.
  await seed({ tab: 'plan', nowOverride: NOW_06, segments: FRESH_SEGS, current: null });
  fire(all((n) => n.localName === 'button' && has(n, 'plan-item') && /Stack my stops & loads/.test(n.textContent), planPage())[0], 'click');
  await sleep(60);
  const rmR2 = planRoom();
  const depBtnR2 = all((n) => n.localName === 'button' && n.attributes?.['data-stack-dep-btn'] === '1', rmR2)[0];
  fire(depBtnR2, 'click');
  await sleep(50);
  const shR2 = all((n) => has(n, 'sheet'))[0];
  const dayInR2 = shR2 && all((n) => n.localName === 'input' && has(n, 'ed-day-input'), shR2)[0];
  const clkInR2 = shR2 && all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), shR2)[0];
  const goBtnR2 = shR2 && all((n) => n.localName === 'button' && has(n, 'ed-go'), shR2)[0];
  // Pick 4 days + 4h out (Sun Nov 15 10:00 vs now Wed Nov 11 06:00 -> cap is Sat Nov 14 06:00)
  dayInR2.value = '2026-11-15'; fire(dayInR2, 'input'); await sleep(20);
  clkInR2.value = '10:00'; fire(clkInR2, 'input'); await sleep(20);
  const capHintText = all((n) => n.attributes?.['data-stack-dep-cap-hint'] === '1', shR2)[0]?.textContent ?? '';
  const goBtnR2Text = goBtnR2?.textContent ?? '';
  fire(goBtnR2, 'click'); await sleep(60);

  const expectedMaxDep = NOW_06 + ST.STACK_MAX_DEPARTURE_FUTURE_MIN; // Sat Nov 14 06:00
  const depBtnR2After = all((n) => n.localName === 'button' && n.attributes?.['data-stack-dep-btn'] === '1', rmR2)[0];
  const depMinR2 = Number(depBtnR2After?.attributes?.['data-stack-dep-min'] ?? NaN);
  const depTextR2 = depBtnR2After?.textContent ?? '';
  const verdictTextR2 = all((n) => n.attributes?.['data-stack-verdict'] === '1', rmR2)[0]?.textContent ?? '';
  const draftRoundTripR2 = ST.loadStackDraft(55, 'America/Chicago', NOW_06);

  // Leave Stack tab and re-enter: clamped value MUST survive unchanged (never silently dropped to "Now").
  fire(all((n) => n.localName === 'button' && has(n, 'back'), rmR2)[0], 'click');
  await sleep(60);
  fire(all((n) => n.localName === 'button' && has(n, 'plan-item') && /Stack my stops & loads/.test(n.textContent), planPage())[0], 'click');
  await sleep(60);
  const rmR2Reenter = planRoom();
  const depBtnR2Reenter = all((n) => n.localName === 'button' && n.attributes?.['data-stack-dep-btn'] === '1', rmR2Reenter)[0];
  const depMinR2Reenter = Number(depBtnR2Reenter?.attributes?.['data-stack-dep-min'] ?? NaN);
  const depTextR2Reenter = depBtnR2Reenter?.textContent ?? '';

  const ok = /09:00/.test(depBeforeText)
    && draftBefore.departureMinute === expectedDep
    && draftAfter.departureMinute === expectedDep
    && depAfterMin === expectedDep
    && /09:00/.test(depAfterText)
    && !/09:45/.test(depAfterText)
    && headlineAfter === headlineBefore
    && depClampedMin === chi(11, 9, 30)
    && /Now \(Wed 09:30\)/.test(depClampedText)
    && dAtCap.departureMinute === NOW_06 + ST.STACK_MAX_DEPARTURE_FUTURE_MIN
    && dOverCap.departureMinute === null
    && dPast.departureMinute === NOW_06 - 60
    && dInf.departureMinute === null
    && /72h/.test(capHintText)
    && /Sat Nov 14, 06:00/.test(goBtnR2Text)
    && !/Sun Nov 15|10:00/.test(goBtnR2Text)
    && depMinR2 === expectedMaxDep
    && /Sat Nov 14, 06:00/.test(depTextR2)
    && /Capped at 72h ahead/.test(depTextR2)
    && !/Sun Nov 15|10:00/.test(depTextR2)
    && /Starting Sat 06:00/.test(verdictTextR2)
    && draftRoundTripR2.departureMinute === expectedMaxDep
    && depMinR2Reenter === expectedMaxDep
    && /Sat Nov 14, 06:00/.test(depTextR2Reenter)
    && !/Now \(/.test(depTextR2Reenter);

  return ok || JSON.stringify({
    expectedDep,
    draftBefore: draftBefore.departureMinute,
    draftAfter: draftAfter.departureMinute,
    depBeforeText,
    depAfterText,
    depAfterMin,
    headlineBefore,
    headlineAfter,
    depClampedMin,
    depClampedText,
    n4: { atCap: dAtCap.departureMinute, overCap: dOverCap.departureMinute, past: dPast.departureMinute, inf: dInf.departureMinute },
    r2: { expectedMaxDep, capHintText, goBtnR2Text, depMinR2, depTextR2, verdictTextR2, draftRT: draftRoundTripR2.departureMinute, depMinR2Reenter, depTextR2Reenter },
  });
});

/* ---------------- SK12 (new for F8 + F9a + F9c): Drive-minutes parity (93 mi @ 45 mph = 125m), badge accuracy, continuous 10h+ early-wait rest note ---------------- */
await pin('SK12. drive-minutes parity with engine (93 mi @ 45 mph = 125m, F8), continuous 10h+ early-wait rest note (F9c), and truthful breaking-stop badge (F9a)', async () => {
  // F8: 93 mi @ 45 mph: (93/45)*60 = 124.00000000000001 -> Math.ceil = 125 (matches engine planTrip!)
  const engPlan = E.planTrip(FRESH_SEGS, {
    departure: NOW_06,
    distanceMiles: 93,
    mph: 45,
    stops: [],
    restStrategy: 'reset10',
    config: cfgChi,
  });
  const engDriveMin = engPlan.driveEnd - NOW_06;
  const stackDriveMin = ST.stackLegDriveMinutes(93, 45);
  const rPar = ST.evaluateStackChain({
    segments: FRESH_SEGS,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 'p1', label: 'Stop 1', miles: 93, mph: 45, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: null, apptTimeZone: 'America/Chicago' },
      { id: 'p2', label: 'Stop 2', miles: 45, mph: 45, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: null, apptTimeZone: 'America/Chicago' },
    ],
  });
  const f8Ok = engDriveMin === 125
    && stackDriveMin === 125
    && rPar.continuousPass.stops[0].arrival.minute === NOW_06 + 125
    && rPar.reset10Pass.stops[0].arrival.minute === NOW_06 + 125;

  // F9(c) + N2: continuous pass absorbs a 10h 30m early-arrival wait at Stop 1 (09:00 -> 19:30)
  //   Assert continuousPass.longRestCount === 1 directly and match the exact rest note (no alternation).
  //   Also verify 9h early wait + 1h OFF dwell counts (longRestCount === 1) while 9h wait + 1h ON dwell does NOT (0).
  const rWait = ST.evaluateStackChain({
    segments: FRESH_SEGS,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 'w1', label: 'Stop 1', miles: 165, mph: 55, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: chi(11, 19, 30), apptTimeZone: 'America/Chicago' },
      { id: 'w2', label: 'Stop 2', miles: 440, mph: 55, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: chi(12, 5, 0), apptTimeZone: 'America/Chicago' },
    ],
  });
  const rWait9Off1 = ST.evaluateStackChain({
    segments: FRESH_SEGS,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 'wo1', label: 'Stop 1', miles: 165, mph: 55, dwellMinutes: 60, dwellStatus: 'OFF', apptMinute: chi(11, 18, 0), apptTimeZone: 'America/Chicago' },
      { id: 'wo2', label: 'Stop 2', miles: 440, mph: 55, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: chi(12, 5, 0), apptTimeZone: 'America/Chicago' },
    ],
  });
  const rWait9On1 = ST.evaluateStackChain({
    segments: FRESH_SEGS,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 'wn1', label: 'Stop 1', miles: 165, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 18, 0), apptTimeZone: 'America/Chicago' },
      { id: 'wn2', label: 'Stop 2', miles: 110, mph: 55, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: null, apptTimeZone: 'America/Chicago' },
    ],
  });
  const f9cOk = rWait.status === 'legal'
    && rWait.continuousPass.longRestCount === 1
    && rWait.continuousPass.lastLongRestStopIndex === 0
    && rWait.displayChain.longRestCount === 1
    && rWait.headline.includes('(10h 30m off-duty wait at Stop 1)')
    && rWait.subline.includes('Includes 10h 30m off-duty wait (Wed 09:00 → Wed 19:30) at Stop 1 (resets 11h/14h clocks).')
    && rWait.dispatchText.includes('Can run all 2 stops legally (includes 1 planned 10h+ rest).')
    && rWait9Off1.continuousPass.longRestCount === 1
    && rWait9On1.continuousPass.longRestCount === 0;

  // F9(a) + N2: ACTUALLY RENDER the Stack timeline badge in the DOM and assert its text!
  //   1) Real StackTab renders for BREAK_30, TIME_ONLY, and unappointed DRIVE_11 chains.
  const openWithStops = async (segs, stops) => {
    await seed({ tab: 'plan', nowOverride: NOW_06, segments: segs, current: null });
    ST.saveStackDraft({ stops, departureMinute: null, untilDepartureStatus: 'ON' });
    const pg = planPage();
    const stackItem = all((n) => n.localName === 'button' && has(n, 'plan-item') && /Stack my stops & loads/.test(n.textContent), pg)[0];
    fire(stackItem, 'click');
    await sleep(60);
    const rm = planRoom();
    const verdict = all((n) => n.attributes?.['data-stack-verdict'] === '1', rm)[0];
    const badges = all((n) => n.attributes?.['data-stack-stop-out'] !== undefined, rm).map(
      (li) => all((n) => has(n, 'rescue-badge'), li)[0]?.textContent?.trim() ?? '',
    );
    return { limit: verdict?.attributes?.['data-stack-limit'] ?? '', badges };
  };

  const domBrk30 = await openWithStops(FRESH_SEGS, [
    { id: 'b1', label: 'Stop 1', miles: 495, mph: 55, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: chi(11, 15, 15), apptTimeZone: 'America/Chicago' },
    { id: 'b2', label: 'Stop 2', miles: 55, mph: 55, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: null, apptTimeZone: 'America/Chicago' },
  ]);
  const domTimeOnly = await openWithStops(FRESH_SEGS, [
    { id: 'a', label: 'A', miles: 165, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 9, 0), apptTimeZone: 'America/Chicago' },
    { id: 'b', label: 'B', miles: 220, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(12, 9, 0), apptTimeZone: 'America/Chicago' },
    { id: 'c', label: 'C', miles: 330, mph: 55, dwellMinutes: 30, dwellStatus: 'ON', apptMinute: chi(12, 11, 0), apptTimeZone: 'America/Chicago' },
  ]);
  const midSegs = [
    { status: 'OFF', start: chi(10, 17, 0), end: chi(11, 3, 0), createdAt: 1 },
    { status: 'D', start: chi(11, 3, 0), end: chi(11, 5, 0), createdAt: 2 },
    { status: 'ON', start: chi(11, 5, 0), end: NOW_06, createdAt: 3 },
  ];
  const domDrive11 = await openWithStops(midSegs, [
    { id: 'e1', label: 'Stop 1', miles: 600, mph: 55, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: null, apptTimeZone: 'America/Chicago' },
    { id: 'e2', label: 'Stop 2', miles: 110, mph: 55, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: chi(11, 20, 0), apptTimeZone: 'America/Chicago' },
  ]);

  //   2) Directly render app.tsx's StackTimelineList in the DOM for an unappointed breaking stop
  //      across BREAK_30, TIME_ONLY, NONE, DRIVE_11, WINDOW_14, and CYCLE to exercise every badge label.
  const tlHost = document.createElement('div');
  document.body.appendChild(tlHost);
  const sampleStop = rPar.displayChain.stops[0]; // unappointed (meetsAppt: true, apptSlack: null)
  const renderTlBadge = (limitingClock) => {
    render(h(A.StackTimelineList, {
      stops: [sampleStop],
      showingSplit: false,
      firstBreakIndex: 0,
      limitingClock,
      cycleLimit: 70 * 60,
    }), tlHost);
    return all((n) => has(n, 'rescue-badge'), tlHost)[0]?.textContent?.trim() ?? '';
  };
  const badgeBrk30 = renderTlBadge('BREAK_30');
  const badgeTimeOnly = renderTlBadge('TIME_ONLY');
  const badgeNone = renderTlBadge('NONE');
  const badgeDrive11 = renderTlBadge('DRIVE_11');
  const badgeWin14 = renderTlBadge('WINDOW_14');
  const badgeCycle = renderTlBadge('CYCLE');
  render(null, tlHost);

  const f9aOk = domBrk30.limit === 'BREAK_30'
    && domBrk30.badges[0] === 'Late 15m'
    && !domBrk30.badges.includes('Hits 14h window')
    && domTimeOnly.limit === 'TIME_ONLY'
    && domTimeOnly.badges[2] === 'Late 5h 00m'
    && !domTimeOnly.badges.includes('Hits 14h window')
    && domDrive11.limit === 'DRIVE_11'
    && domDrive11.badges[0] === 'Hits 11h drive'
    && badgeBrk30 === '30-min break'
    && badgeTimeOnly === 'Drive + dock time'
    && badgeNone === 'Breaks here'
    && badgeDrive11 === 'Hits 11h drive'
    && badgeWin14 === 'Hits 14h window'
    && badgeCycle === 'Hits 70h cycle';

  return (f8Ok && f9cOk && f9aOk) || JSON.stringify({
    f8: { engDriveMin, stackDriveMin, contArr: rPar.continuousPass.stops[0].arrival.minute - NOW_06, legArr: rPar.reset10Pass.stops[0].arrival.minute - NOW_06 },
    f9c: {
      status: rWait.status,
      contLR: rWait.continuousPass.longRestCount,
      contIdx: rWait.continuousPass.lastLongRestStopIndex,
      dispLR: rWait.displayChain.longRestCount,
      off1LR: rWait9Off1.continuousPass.longRestCount,
      on1LR: rWait9On1.continuousPass.longRestCount,
      hl: rWait.headline,
      sub: rWait.subline,
      disp: rWait.dispatchText,
    },
    f9a: { domBrk30, domTimeOnly, domDrive11, badges: { badgeBrk30, badgeTimeOnly, badgeNone, badgeDrive11, badgeWin14, badgeCycle } },
  });
});

/* ---------------- SK13 (new for N1): Mandatory 30-min break on EARLIER leg binds the late stop ---------------- */
// Primary fixture (fresh driver Wed 06:00 @ 55 mph):
//   B: 55 mi (1h D, 06:00-07:00), appt Wed 07:00, 1h ON dwell (07:00-08:00; resets 8h break clock).
//   C: 470 mi (513m = 8h 33m D; 8h driving reached at 16:00 -> mandatory 30m break 16:00-16:30 -> arrives 17:03),
//      no appointment, 30m ON dwell (17:03-17:33).
//   D: 55 mi (1h D, 17:33-18:33), appt Wed 18:15, 0 dwell -> arrives Wed 18:33 (18m late).
//   Without the 30-min break on C's leg, D would arrive 18:03 (12m early)!
//   Expected: limitingClock === 'BREAK_30', cite === '49 CFR 395.3(a)(3)(ii)', and ZERO "no extra HOS rest required" copy.
// Absorbed-overnight variant:
//   A: 165 mi (3h D, Wed 06:00-09:00), appt Wed 09:00, 1h ON dwell (09:00-10:00).
//   B: 55 mi (1h D, Thu 07:00-08:00 after voluntary 21h overnight rest Wed 10:00-Thu 07:00), appt Thu 08:00, 1h ON (08:00-09:00).
//   C: 470 mi (8h 33m D; 8h driving at Thu 17:00 -> mandatory 30m break 17:00-17:30 -> arrives 18:03), 30m ON dwell (18:03-18:33).
//   D: 55 mi (1h D, Thu 18:33-19:33), appt Thu 19:15, 0 dwell -> arrives Thu 19:33 (18m late; 19:03 without break).
//   Expected: limitingClock === 'BREAK_30', cite === '49 CFR 395.3(a)(3)(ii)', and ZERO "no extra HOS rest required" copy.
await pin('SK13. N1: mandatory 30-min break on an earlier leg (both single-shift and post-overnight) binds as BREAK_30 with 395.3(a)(3)(ii) and no false "no extra HOS rest required"', async () => {
  const rPrimary = ST.evaluateStackChain({
    segments: FRESH_SEGS,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 'n1b', label: 'B', miles: 55, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 7, 0), apptTimeZone: 'America/Chicago' },
      { id: 'n1c', label: 'C', miles: 470, mph: 55, dwellMinutes: 30, dwellStatus: 'ON', apptMinute: null, apptTimeZone: 'America/Chicago' },
      { id: 'n1d', label: 'D', miles: 55, mph: 55, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: chi(11, 18, 15), apptTimeZone: 'America/Chicago' },
    ],
  });

  const rOvernight = ST.evaluateStackChain({
    segments: FRESH_SEGS,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 'o1a', label: 'A', miles: 165, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 9, 0), apptTimeZone: 'America/Chicago' },
      { id: 'o1b', label: 'B', miles: 55, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(12, 8, 0), apptTimeZone: 'America/Chicago' },
      { id: 'o1c', label: 'C', miles: 470, mph: 55, dwellMinutes: 30, dwellStatus: 'ON', apptMinute: null, apptTimeZone: 'America/Chicago' },
      { id: 'o1d', label: 'D', miles: 55, mph: 55, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: chi(12, 19, 15), apptTimeZone: 'America/Chicago' },
    ],
  });

  const rTimeOnly = ST.evaluateStackChain({
    segments: FRESH_SEGS,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 't1a', label: 'A', miles: 165, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(11, 9, 0), apptTimeZone: 'America/Chicago' },
      { id: 't1b', label: 'B', miles: 220, mph: 55, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: chi(12, 9, 0), apptTimeZone: 'America/Chicago' },
      { id: 't1c', label: 'C', miles: 330, mph: 55, dwellMinutes: 30, dwellStatus: 'ON', apptMinute: chi(12, 11, 0), apptTimeZone: 'America/Chicago' },
    ],
  });

  const allText = (r) => `${r.headline}\n${r.subline}\n${r.pushRescue?.title ?? ''}\n${r.pushRescue?.restSummary ?? ''}\n${r.dispatchText}`;
  const noFalseCopy = (r) => !/no extra HOS rest required/i.test(allText(r));

  const pC = rPrimary.displayChain.stops[1];
  const pD = rPrimary.displayChain.stops[2];
  const oB = rOvernight.displayChain.stops[1];
  const oC = rOvernight.displayChain.stops[2];
  const oD = rOvernight.displayChain.stops[3];

  const primaryOk = rPrimary.status === 'breaks_stop'
    && rPrimary.firstBreakIndex === 2
    && rPrimary.firstBreakLabel === 'D'
    && rPrimary.limitingClock === 'BREAK_30'
    && rPrimary.limitingCite === '49 CFR 395.3(a)(3)(ii)'
    && pC.insertedRests.some((x) => x.kind === 'break30' && x.start === chi(11, 16, 0) && x.end === chi(11, 16, 30))
    && pD.arrival.minute === chi(11, 18, 33)
    && pD.apptSlack === -18
    && rPrimary.pushRescue !== null
    && rPrimary.pushRescue.kind === 'reschedule'
    && /30-minute break/i.test(rPrimary.pushRescue.restSummary)
    && rPrimary.dispatchText.includes('Cannot run D as stacked — 30-minute break (49 CFR 395.3(a)(3)(ii)).')
    && noFalseCopy(rPrimary);

  const overnightOk = rOvernight.status === 'breaks_stop'
    && rOvernight.firstBreakIndex === 3
    && rOvernight.firstBreakLabel === 'D'
    && rOvernight.limitingClock === 'BREAK_30'
    && rOvernight.limitingCite === '49 CFR 395.3(a)(3)(ii)'
    && oB.insertedRests.some((x) => x.kind === 'reset10' && x.triggeredBy === 'NONE')
    && oC.insertedRests.some((x) => x.kind === 'break30' && x.start === chi(12, 17, 0) && x.end === chi(12, 17, 30))
    && oD.arrival.minute === chi(12, 19, 33)
    && oD.apptSlack === -18
    && rOvernight.pushRescue !== null
    && rOvernight.pushRescue.kind === 'reschedule'
    && /30-minute break/i.test(rOvernight.pushRescue.restSummary)
    && rOvernight.dispatchText.includes('Cannot run D as stacked — 30-minute break (49 CFR 395.3(a)(3)(ii)).')
    && noFalseCopy(rOvernight);

  const timeOnlyOk = rTimeOnly.limitingClock === 'TIME_ONLY' && noFalseCopy(rTimeOnly);

  return (primaryOk && overnightOk && timeOnlyOk) || JSON.stringify({
    primary: {
      ok: primaryOk,
      status: rPrimary.status,
      limit: rPrimary.limitingClock,
      cite: rPrimary.limitingCite,
      dArr: pD.arrival.homeShort,
      dSlack: pD.apptSlack,
      restSummary: rPrimary.pushRescue?.restSummary,
    },
    overnight: {
      ok: overnightOk,
      status: rOvernight.status,
      limit: rOvernight.limitingClock,
      cite: rOvernight.limitingCite,
      dArr: oD.arrival.homeShort,
      dSlack: oD.apptSlack,
      restSummary: rOvernight.pushRescue?.restSummary,
    },
    timeOnlyOk,
  });
});

/* ---------------- SK14 (new for R1): Any positive intermediate early wait absorbs ALL prior break30 delay ---------------- */
// Opus R1 fixture (fresh driver Wed 06:00 @ 55 mph):
//   B: 470 mi (513m = 8h 33m D; break 14:00-14:30 -> arrives 15:03), appt Wed 15:13 (waits 10m -> 15:13), 30m ON dwell (departs 15:43).
//   C: 55 mi (1h D -> arrives 16:43), appt Wed 16:35 (8m late), 0 dwell.
//   Without the break: B arrives 14:33, waits 40m, still departs 15:43, C still arrives 16:43!
//   Because B had a positive early wait (10m) even WITH the break, the break changed nothing -> TIME_ONLY, cite null, NO 395.3(a)(3)(ii)!
//   Variant: 1m wait at B (appt Wed 15:04 -> departs 15:34), C arrives 16:34 vs appt 16:32 (2m late) -> ALSO TIME_ONLY, cite null!
await pin('SK14. R1: any positive intermediate early wait absorbs all prior 30-min break delay -> TIME_ONLY with null cite and zero 395.3(a)(3)(ii) copy', async () => {
  const r = ST.evaluateStackChain({
    segments: FRESH_SEGS,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 'r1b', label: 'B', miles: 470, mph: 55, dwellMinutes: 30, dwellStatus: 'ON', apptMinute: chi(11, 15, 13), apptTimeZone: 'America/Chicago' },
      { id: 'r1c', label: 'C', miles: 55, mph: 55, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: chi(11, 16, 35), apptTimeZone: 'America/Chicago' },
    ],
  });

  const r1mWait = ST.evaluateStackChain({
    segments: FRESH_SEGS,
    now: NOW_06,
    config: cfgChi,
    stops: [
      { id: 'r1b2', label: 'B', miles: 470, mph: 55, dwellMinutes: 30, dwellStatus: 'ON', apptMinute: chi(11, 15, 4), apptTimeZone: 'America/Chicago' },
      { id: 'r1c2', label: 'C', miles: 55, mph: 55, dwellMinutes: 0, dwellStatus: 'ON', apptMinute: chi(11, 16, 32), apptTimeZone: 'America/Chicago' },
    ],
  });

  const allCopy = (x) => `${x.headline}\n${x.subline}\n${x.pushRescue?.title ?? ''}\n${x.pushRescue?.restSummary ?? ''}\n${x.dispatchText}`;
  const b = r.displayChain.stops[0];
  const c = r.displayChain.stops[1];

  const primaryOk = r.status === 'breaks_stop'
    && r.firstBreakIndex === 1
    && r.firstBreakLabel === 'C'
    && b.insertedRests.some((x) => x.kind === 'break30' && x.start === chi(11, 14, 0) && x.end === chi(11, 14, 30))
    && b.arrival.minute === chi(11, 15, 3)
    && b.earlyWaitMinutes === 10
    && b.depart.minute === chi(11, 15, 43)
    && c.arrival.minute === chi(11, 16, 43)
    && c.apptSlack === -8
    && r.limitingClock === 'TIME_ONLY'
    && r.limitingClockLabel === 'drive + dock time'
    && r.limitingCite === null
    && r.pushRescue !== null
    && r.pushRescue.kind === 'reschedule'
    && /drive \+ dock time/.test(r.headline)
    && !/30-minute break/i.test(r.headline)
    && !/30-minute break/i.test(r.pushRescue.restSummary)
    && !/395\.3\(a\)\(3\)\(ii\)|CFR|395\.|§/i.test(allCopy(r))
    && r.dispatchText.includes('Cannot run C as stacked — drive + dock time.');

  const variantOk = r1mWait.status === 'breaks_stop'
    && r1mWait.displayChain.stops[0].earlyWaitMinutes === 1
    && r1mWait.displayChain.stops[1].apptSlack === -2
    && r1mWait.limitingClock === 'TIME_ONLY'
    && r1mWait.limitingCite === null
    && !/395\.3\(a\)\(3\)\(ii\)|CFR|395\.|§/i.test(allCopy(r1mWait));

  return (primaryOk && variantOk) || JSON.stringify({
    primary: {
      ok: primaryOk,
      status: r.status,
      limit: r.limitingClock,
      cite: r.limitingCite,
      bArr: b.arrival.homeShort,
      bWait: b.earlyWaitMinutes,
      bDep: b.depart.homeShort,
      cArr: c.arrival.homeShort,
      cSlack: c.apptSlack,
      headline: r.headline,
      restSummary: r.pushRescue?.restSummary,
      dispatch: r.dispatchText,
    },
    variant: {
      ok: variantOk,
      bWait: r1mWait.displayChain.stops[0].earlyWaitMinutes,
      cSlack: r1mWait.displayChain.stops[1].apptSlack,
      limit: r1mWait.limitingClock,
      cite: r1mWait.limitingCite,
    },
  });
});

let fail = 0;
for (const [s, n, m] of res) {
  console.log(`${s}  ${n}${m ? `\n      ${m}` : ''}`);
  if (s === 'FAIL') fail++;
}
console.log(`\n${res.length - fail}/${res.length} stack pins passed`);
process.exit(fail ? 1 : 0);

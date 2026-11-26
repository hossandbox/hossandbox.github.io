// My Week — Master Week Synthesizer (Plan capstone tool #6).
// Pins MW1–MW19:
//   MW1  Section D canonical scenario (43m/13m holds, home Fri 09:13 CT, 17m cycle, 0 viols, preview trade).
//   MW2  Conflict case: Load 2 appt blocks best 34-hour reset (priced + verified trade).
//   MW3  (Re-pinned) Genuine outcome-based split trap: Leg 2 has 60m ON-duty dock blocking early SB -> 7/3 split makes Leg 3 1h 45m late vs. on time on straight 10.
//   MW4  allowSplits = No suppresses all split recommendations and split callouts.
//   MW5  store.ts persistence: export/import round-trip, garbage sanitizer, legacy backup, BACKUP_KEY, SIM_KEY.
//   MW6  Plan hub capstone presence & hygiene: .plan-capstone above 12 .plan-item tools, 0 input[type=time], Back.
//   MW7  G7 drill-downs (Rollout & Rescue prefill + Back to My Week), Load Check import, stale & provisional guardrails.
//   MW8  (Strengthened) Carrier-day 18:40 boundary chained 3-load audit() parity + 60/7 cycle parity.
//   MW9  H2/M1/M4: p3.mjs restart blindness fixed (no fabricated hold) + SEED=383857408 minimal hold, reset34 winner, strip follows winner.
//   MW10 H3/L3/L5/L8/L9: Verdict honesty (p6 home 0m slack, stale past-due conflict, SEED=1776634368 mid-week 0m cycle, hub subtitle, binding margin, detention break 18m, L8 10h break text hidden on last/split).
//   MW11 H4: Chained Load 2 drill-down (Rollout & Rescue) never claims Wed 21:02 fits cleanly; earliest legal roll = Wed 21:45.
//   MW12 H5 (Corrected): Outcomes-only split trap — (a) p7 NO trap; (b) p5 NO trap, split kept, home lateness reported without false straight-10 claim; (c) p4 NO trap, split kept, Leg 2 on time, Leg 3 15h 15m cycle-wall conflict card.
//   MW13 H6/M2/M5: Verified trades across fuzz2 seeds (5, 31337, 4242) incl. relieve-home-dock lane-flip (s0=357445184) + SEED=579532032 no stale gate on split + Copy copies applied plan.
//   MW14 H1/N1: Time-aware 15m-bucket hub cache (1 synth within window, 0 on per-minute ticks inside window, 1 recompute past 15m, 0 on Now panel) + 5-load cold budget (< 1000 ms).
//   MW15 M6/L1/L4/L7: st2.mjs damaged fields & draftResets + invalid apptTime drops appt + L1 id dedupe + L4 tz canonicalization + L7 old SIM quarantine.
//   MW16 M3: allowSplits=false hides "Dock delayed? Open Rescue" drill-down entry on load cards.
//   MW17 N1/N2/NIT: hubstale (+0/+60/+120/+240m pure + DOM) + PlanTab neutral "Review" placeholder on cold mount & off-Plan mutation + SEED=383857408 restart-wait label.
//   MW18 H5: Outcome-only trap verification — SEED=2004807488 NO trap & genuine dock-60 ON-duty trap fires with independent evaluate() brute-force proof (allowing SB from arrival).
//   MW19 H5: Dock-free early-wait SB absorption NO-trap pin — dock-0 (and dockOff) fixtures keep the split, Leg 2 on time, Leg 3 on time (earliest legal arrival Tue 08:45, 15m early).
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
let Tms = new Date(2026, 10, 10, 14, 0, 0).getTime();
Date.now = () => Tms;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true;
globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'myweek';
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

const cfgChi70 = { ...S.INITIAL_STATE.config, cycle: '70/8', dayStartHour: 0, dayStartMinute: 0, timeZone: 'America/Chicago', shortHaul: false };
const cfgChi60 = { ...cfgChi70, cycle: '60/7' };
const cfgChi1840 = { ...cfgChi70, dayStartHour: 18, dayStartMinute: 40 };
const chi = (d, h0, m0 = 0) => E.localToMinute(2026, 11, d, h0, 'America/Chicago', m0);

/** Build a gap-free logged history from daily work blocks so meaningfulGaps === []. */
function makeContinuousLog(blocks, endAt) {
  const out = [];
  let cursor = blocks[0].start;
  let id = 1;
  for (const b of blocks) {
    if (b.start > cursor) {
      out.push({ status: 'OFF', start: cursor, end: b.start, createdAt: id++ });
    }
    out.push({ status: b.status, start: b.start, end: b.end, createdAt: id++ });
    cursor = b.end;
  }
  if (endAt > cursor) {
    out.push({ status: 'OFF', start: cursor, end: endAt, createdAt: id++ });
  }
  return out;
}

// Section D canonical fixture: Tue Nov 10, 2026 14:00 CT
// Past 8 days (Tue Nov 3..Tue Nov 10) sum to 65h (3900m) -> 5h (300m) remaining now:
//   Tue Nov 3: 8h30 -> drops Wed Nov 11 00:00 CT (+8h 30m)
//   Wed Nov 4: 9h30 -> drops Thu Nov 12 00:00 CT (+9h 30m)
//   Thu Nov 5: 9h00 -> drops Fri Nov 13 00:00 CT (+9h 00m)
//   Fri Nov 6: 8h, Sat Nov 7: 8h, Sun Nov 8: 8h, Mon Nov 9: 8h, Tue Nov 10: 6h (02:00-08:00), OFF 08:00-14:00.
const NOW_SEC_D = chi(10, 14, 0);
const SEC_D_SEGS = makeContinuousLog([
  { status: 'D', start: chi(3, 1, 0), end: chi(3, 9, 30) },  // 8h30
  { status: 'D', start: chi(4, 1, 0), end: chi(4, 10, 30) }, // 9h30
  { status: 'D', start: chi(5, 1, 0), end: chi(5, 10, 0) },  // 9h00
  { status: 'D', start: chi(6, 1, 0), end: chi(6, 9, 0) },   // 8h00
  { status: 'D', start: chi(7, 1, 0), end: chi(7, 9, 0) },   // 8h00
  { status: 'D', start: chi(8, 1, 0), end: chi(8, 9, 0) },   // 8h00
  { status: 'D', start: chi(9, 1, 0), end: chi(9, 9, 0) },   // 8h00
  { status: 'D', start: chi(10, 2, 0), end: chi(10, 8, 0) }, // 6h00
], NOW_SEC_D);

const SEC_D_DRAFT = {
  loads: [
    { id: 'l1', label: 'Chi → Nash', distanceMode: 'miles', miles: 495, driveMinutes: 540, mph: null, hasAppt: true, apptDate: '2026-11-11', apptTime: '09:00', apptTimeZone: 'America/Chicago', dockMinutes: 120, dockOff: false, preTripMinutes: null, bufferMinutes: null, deadheadMiles: 0, pickupDwellMinutes: 0, pickupDwellOff: false, done: false },
    { id: 'l2', label: 'Nash → CLT', distanceMode: 'miles', miles: 410, driveMinutes: 448, mph: null, hasAppt: true, apptDate: '2026-11-12', apptTime: '06:30', apptTimeZone: 'America/New_York', dockMinutes: 120, dockOff: false, preTripMinutes: null, bufferMinutes: null, deadheadMiles: 0, pickupDwellMinutes: 0, pickupDwellOff: false, done: false },
    { id: 'l3', label: 'CLT → Home', distanceMode: 'miles', miles: 550, driveMinutes: 600, mph: null, hasAppt: false, apptDate: '', apptTime: '08:00', apptTimeZone: '', dockMinutes: 30, dockOff: false, preTripMinutes: null, bufferMinutes: null, deadheadMiles: 0, pickupDwellMinutes: 0, pickupDwellOff: false, done: false },
  ],
  homeTarget: { date: '2026-11-13', time: '09:00' },
  fillOpenNights: true,
  usualShiftStartMinutes: 21 * 60,
  usualShiftBudgetMinutes: 570,
  allowSplits: true,
  defaultPreTripMinutes: 15,
  defaultBufferMinutes: 45,
  strategyView: 'recaps',
};

const closeAllPlanners = () => {
  openSheet(null);
  A.openMyWeekPlanner?.(false);
  A.openWeekPlanner?.(false);
  A.openRolloutPlanner?.(false);
  A.openRescuePlanner?.(false);
  A.openStackPlanner?.(false);
  A.openMotelPlanner?.(false);
  A.openLegalPlanner?.(false);
  A.openFlipPlanner?.(false);
  A.openMilesPlanner?.(false);
};

const seed = async (rec = {}) => {
  closeAllPlanners();
  setState({
    ...S.INITIAL_STATE,
    tab: 'plan',
    nowOverride: NOW_SEC_D,
    segments: SEC_D_SEGS,
    tentative: [],
    current: null,
    mph: 55,
    drivingView: false,
    disclaimerAcked: true,
    tzChosen: true,
    historyAcknowledged: true,
    alertsOn: false,
    speakAlerts: false,
    speechAsked: true,
    speakAskOpen: false,
    config: cfgChi70,
    ...(S.DEFAULT_WEEK_PLAN ? { weekPlan: { ...S.DEFAULT_WEEK_PLAN, loads: [] } } : {}),
    ...rec,
  });
  await sleep(60);
};

render(h(App, {}), root);
await sleep(100);

const planPage = () => all((n) => n.localName === 'section' && has(n, 'page-plan'))[0];
const planRoom = () => all((n) => n.localName === 'section' && has(n, 'plan-room'))[0];
const openMyWeekViaCapstone = async () => {
  const pg = planPage();
  const btn = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-entry'] === '1', pg)[0];
  if (!btn) return null;
  fire(btn, 'click');
  await sleep(70);
  return { btn, rm: planRoom() };
};

/* ---------------- MW1: Section D canonical scenario ---------------- */
await pin('MW1. Section D canonical scenario: 43m midnight hold on Load 2, 13m hold on Load 3, home Fri 09:13 CT with 17m cycle margin & 0 engine violations', async () => {
  if (typeof A.synthesizeWeek !== 'function') return 'synthesizeWeek missing';
  await seed({ weekPlan: SEC_D_DRAFT });
  const opened = await openMyWeekViaCapstone();
  if (!opened) return 'My Week capstone entry missing on Plan tab';

  const syn = A.synthesizeWeek({
    segments: SEC_D_SEGS,
    now: NOW_SEC_D,
    config: cfgChi70,
    mph: 55,
    draft: SEC_D_DRAFT,
    historyBasis: 'known',
  });
  const [l1, l2, l3] = syn.recaps.loads;
  if (!l1 || !l2 || !l3) return `expected 3 chained loads, got ${syn.recaps.loads.length}`;

  // Independent engine verification of the full chained timeline
  const evFinal = E.evaluate([...SEC_D_SEGS, ...syn.recaps.simSegments], { asOf: syn.recaps.endMinute, config: cfgChi70 });
  const postViols = evFinal.violations.filter((v) => v.tentative || v.start >= NOW_SEC_D);

  const l1Ok = l1.rollOut.homeHM === '22:30' && l1.arrival.homeHM === '08:15' && l1.apptSlackMinutes === 45 && l1.pta.homeHM === '11:00' && l1.cycleRemainingAfter === 135;
  const l2Ok = l2.unconstrainedRollOut.homeHM === '21:02' && l2.midnightGateMinutes === 43 && l2.rollOut.homeHM === '21:45' && l2.arrival.apptHM === '06:28' && l2.arrival.homeHM === '05:28' && l2.apptSlackMinutes === 2 && l2.pta.apptHM === '08:30' && l2.ptaInSweetSpot === true && l2.cycleRemainingAfter === 122;
  const l3Ok = l3.midnightGateMinutes === 13 && l3.rollOut.homeHM === '21:58' && l3.pta.homeHM === '09:13' && l3.cycleRemainingAfter === 17;
  const homeOk = syn.recaps.homeCheck && syn.recaps.homeCheck.slackMinutes === -13 && syn.recaps.homeCheck.cycleRemainingAtHome === 17;
  const engOk = postViols.length === 0 && evFinal.cycle.remaining === 17;
  const verdictOk = syn.verdict.status === 'tight' && syn.verdict.tone === 'warn' && /43m/.test(syn.verdict.headline) && /09:13/.test(syn.verdict.headline) && /17m/.test(syn.verdict.headline);

  // Check DOM renders verdict + 3 load cards with exact attributes
  const rm = planRoom();
  const vNode = all((n) => n.attributes?.['data-myweek-verdict'] === '1', rm)[0];
  const l2Card = all((n) => n.attributes?.['data-myweek-load-card'] === 'l2', rm)[0];
  const l3Card = all((n) => n.attributes?.['data-myweek-load-card'] === 'l3', rm)[0];
  const domOk = Boolean(vNode && vNode.attributes?.['data-myweek-status'] === 'tight' && l2Card?.attributes?.['data-myweek-gate'] === '43' && l3Card?.attributes?.['data-myweek-cycle-after'] === '17');

  // Test 1-tap Preview Trade (relieve Load 1 dock OFF duty)
  const previewBtn = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-preview-btn'] === 'relieve-dock-l1', rm)[0];
  let previewOk = false;
  if (previewBtn) {
    fire(previewBtn, 'click');
    await sleep(60);
    const bar = all((n) => n.attributes?.['data-myweek-preview-bar'] === '1', rm)[0];
    const l2After = all((n) => n.attributes?.['data-myweek-load-card'] === 'l2', rm)[0];
    previewOk = Boolean(bar && l2After?.attributes?.['data-myweek-gate'] === '0');
  }

  return (l1Ok && l2Ok && l3Ok && homeOk && engOk && verdictOk && domOk && previewOk) || JSON.stringify({
    l1Ok, l2Ok, l3Ok, homeOk, engOk, verdictOk, domOk, previewOk,
    l1: { roll: l1.rollOut.homeHM, arr: l1.arrival.homeHM, pta: l1.pta.homeHM, cyc: l1.cycleRemainingAfter },
    l2: { unconst: l2.unconstrainedRollOut.homeHM, gate: l2.midnightGateMinutes, roll: l2.rollOut.homeHM, arr: l2.arrival.apptHM, cyc: l2.cycleRemainingAfter },
    l3: { gate: l3.midnightGateMinutes, roll: l3.rollOut.homeHM, pta: l3.pta.homeHM, cyc: l3.cycleRemainingAfter },
    evFinalCyc: evFinal.cycle.remaining, postViols: postViols.length, verdict: syn.verdict,
  });
});

/* ---------------- MW2: Conflict case — appointment blocks best 34 ---------------- */
await pin('MW2. Conflict case: Load 2 appointment blocks best 34-hour reset (conflict card rendered & priced in hours/minutes)', async () => {
  if (typeof A.synthesizeWeek !== 'function') return 'synthesizeWeek missing';
  await seed({ weekPlan: SEC_D_DRAFT });
  const opened = await openMyWeekViaCapstone();
  if (!opened) return 'My Week did not open';

  const syn = A.synthesizeWeek({
    segments: SEC_D_SEGS,
    now: NOW_SEC_D,
    config: cfgChi70,
    mph: 55,
    draft: SEC_D_DRAFT,
    historyBasis: 'known',
  });
  const c34 = syn.conflicts.find((c) => c.kind === 'reset34_blocked');
  if (!c34) return `missing reset34_blocked conflict: ${JSON.stringify(syn.conflicts.map((c) => c.kind))}`;

  const rm = planRoom();
  const cNode = all((n) => n.attributes?.['data-myweek-conflict'] === 'reset34_blocked', rm)[0];
  const hasPrice = /15h 30m|15h 28m|misses/.test(c34.priceLabel) && /Nash → CLT/.test(c34.title);
  const hasPreview = Boolean(c34.previewTrade && /push-for-34/.test(c34.previewTrade.id));

  // Verify applying the preview trade actually fits the 34 on Load 2 with 0 missed appointments
  const shifted = c34.previewTrade.apply(SEC_D_DRAFT);
  const synAfter = A.synthesizeWeek({
    segments: SEC_D_SEGS,
    now: NOW_SEC_D,
    config: cfgChi70,
    mph: 55,
    draft: shifted,
    historyBasis: 'known',
  });
  const shiftedFits = synAfter.reset34.missedApptCount === 0 && synAfter.reset34.violations.length === 0;

  return (Boolean(cNode) && hasPrice && hasPreview && shiftedFits) || JSON.stringify({
    cNode: Boolean(cNode), hasPrice, hasPreview, shiftedFits, title: c34.title, price: c34.priceLabel,
    afterMissed: synAfter.reset34.missedApptCount, afterViols: synAfter.reset34.violations.length,
  });
});

/* ---------------- MW3: Genuine outcome-based split-trap case ---------------- */
await pin('MW3. Split-trap case: Leg 2 60m ON-duty dock blocks early SB -> best split (7/3) makes Leg 3 1h 45m late vs. on time on straight 10 -> split_trap fires with honest outcome-based price', async () => {
  if (typeof A.synthesizeWeek !== 'function') return 'synthesizeWeek missing';
  // Genuine outcome-based split-trap fixture (Mon Nov 9 06:00 CT, fresh 70h cycle):
  //   Leg 1: 330 mi (6h D + 15m pre-trip) + 2h ON dock -> PTA Mon 14:15 (5h drive, 5h45m window left).
  //   Leg 2: 165 mi (3h D + 15m pre-trip), appt Mon 22:30, 60m ON-duty dock (22:30–23:30).
  //          The ON-duty dock prevents the trailing SB from absorbing the early wait, so even the best
  //          split (7/3: 3h OFF 14:15–17:15, drive 17:30–20:30, ON dock 22:30–23:30, 7h SB 23:30–06:30)
  //          cannot roll Leg 3 before Tue 06:30 (arrives Tue 11:45, 1h 45m LATE past Tue 10:00).
  //          Straight-10 arrives Leg 2 Tue 03:30 (5h late) + 60m ON dock -> PTA Tue 04:30 with 8h drive
  //          & 9h 45m window still fresh, rolling Leg 3 Tue 04:45 -> arrives Tue 10:00 (ON TIME, 0m late).
  const NOW_TRAP = chi(9, 6, 0);
  const TRAP_SEGS = makeContinuousLog([{ status: 'OFF', start: chi(8, 18, 0), end: NOW_TRAP }], NOW_TRAP);
  const TRAP_DRAFT = {
    loads: [
      { id: 't1', label: 'Leg 1', distanceMode: 'miles', miles: 330, driveMinutes: 360, mph: 55, hasAppt: true, apptDate: '2026-11-09', apptTime: '12:15', apptTimeZone: 'America/Chicago', dockMinutes: 120, dockOff: false, preTripMinutes: 15, bufferMinutes: 0, deadheadMiles: 0, pickupDwellMinutes: 0, pickupDwellOff: false, done: false },
      { id: 't2', label: 'Leg 2', distanceMode: 'miles', miles: 165, driveMinutes: 180, mph: 55, hasAppt: true, apptDate: '2026-11-09', apptTime: '22:30', apptTimeZone: 'America/Chicago', dockMinutes: 60, dockOff: false, preTripMinutes: 15, bufferMinutes: 0, deadheadMiles: 0, pickupDwellMinutes: 0, pickupDwellOff: false, done: false },
      { id: 't3', label: 'Leg 3', distanceMode: 'miles', miles: 275, driveMinutes: 300, mph: 55, hasAppt: true, apptDate: '2026-11-10', apptTime: '10:00', apptTimeZone: 'America/Chicago', dockMinutes: 0, dockOff: false, preTripMinutes: 15, bufferMinutes: 0, deadheadMiles: 0, pickupDwellMinutes: 0, pickupDwellOff: false, done: false },
    ],
    homeTarget: null,
    fillOpenNights: false,
    usualShiftStartMinutes: 21 * 60,
    usualShiftBudgetMinutes: 570,
    allowSplits: true,
    defaultPreTripMinutes: 15,
    defaultBufferMinutes: 0,
    strategyView: 'recaps',
  };

  await seed({ nowOverride: NOW_TRAP, segments: TRAP_SEGS, weekPlan: TRAP_DRAFT });
  await openMyWeekViaCapstone();

  const syn = A.synthesizeWeek({
    segments: TRAP_SEGS,
    now: NOW_TRAP,
    config: cfgChi70,
    mph: 55,
    draft: TRAP_DRAFT,
    historyBasis: 'known',
  });
  const trapConflict = syn.conflicts.find((c) => c.kind === 'split_trap');
  const l2 = syn.recaps.loads[1];
  const l3 = syn.recaps.loads[2];
  const rm = planRoom();
  const trapDom = all((n) => n.attributes?.['data-myweek-conflict'] === 'split_trap', rm)[0];
  const notSilentlyRecommended = !l2.usedSplit && l3.meetsAppt && l3.apptSlackMinutes === 0 && syn.verdict.status === 'conflict';
  const priceMatchesReeval = Boolean(
    trapConflict
    && /1h 45m/.test(trapConflict.priceLabel)
    && /7h 00m split SB/i.test(trapConflict.priceLabel)
    && /sleeper berth/i.test(trapConflict.body)
    && !/required/i.test(trapConflict.body)
    && /on time on straight 10/i.test(trapConflict.body),
  );
  // Verify the straight10-push trade clears the trap and keeps Leg 2 & Leg 3 on time with 0 violations
  let tradeOk = false;
  if (trapConflict?.previewTrade) {
    const afterPush = A.synthesizeWeek({
      segments: TRAP_SEGS, now: NOW_TRAP, config: cfgChi70, mph: 55,
      draft: trapConflict.previewTrade.apply(JSON.parse(JSON.stringify(TRAP_DRAFT))),
      historyBasis: 'known',
    });
    tradeOk = !afterPush.conflicts.some((c) => c.kind === 'split_trap')
      && afterPush.recaps.loads[1].meetsAppt
      && afterPush.recaps.loads[2].meetsAppt
      && afterPush.recaps.violations.length === 0;
  }

  return (Boolean(trapConflict) && Boolean(trapDom) && l2.splitTrapDetected && notSilentlyRecommended && priceMatchesReeval && tradeOk) || JSON.stringify({
    trapConflict: trapConflict ? { title: trapConflict.title, price: trapConflict.priceLabel, body: trapConflict.body } : null,
    trapDom: Boolean(trapDom),
    l2Split: l2.usedSplit,
    l2Trap: l2.splitTrapDetected,
    l3Slack: l3.apptSlackMinutes,
    priceMatchesReeval,
    tradeOk,
    verdict: syn.verdict,
  });
});

/* ---------------- MW4: allowSplits = No suppresses all split recommendations ---------------- */
await pin('MW4. allowSplits = No suppresses all split recommendations on a tight handoff that a split otherwise rescues', async () => {
  if (typeof A.synthesizeWeek !== 'function') return 'synthesizeWeek missing';
  // Same Leg 1 + Leg 2 WITHOUT Leg 3 (so 7/3 split cleanly rescues Leg 2 when allowSplits = true)
  const NOW_S = chi(9, 6, 0);
  const FRESH_SEGS = makeContinuousLog([
    { status: 'OFF', start: chi(8, 18, 0), end: NOW_S },
  ], NOW_S);
  const CLEAN_SPLIT_DRAFT = {
    loads: [
      { id: 's1', label: 'Leg 1', distanceMode: 'miles', miles: 275, driveMinutes: 300, mph: 55, hasAppt: true, apptDate: '2026-11-09', apptTime: '11:15', apptTimeZone: 'America/Chicago', dockMinutes: 120, dockOff: false, preTripMinutes: 15, bufferMinutes: 0, deadheadMiles: 0, pickupDwellMinutes: 0, pickupDwellOff: false, done: false },
      { id: 's2', label: 'Leg 2', distanceMode: 'miles', miles: 330, driveMinutes: 360, mph: 55, hasAppt: true, apptDate: '2026-11-10', apptTime: '02:30', apptTimeZone: 'America/Chicago', dockMinutes: 0, dockOff: false, preTripMinutes: 15, bufferMinutes: 0, deadheadMiles: 0, pickupDwellMinutes: 0, pickupDwellOff: false, done: false },
    ],
    homeTarget: null,
    fillOpenNights: false,
    usualShiftStartMinutes: 21 * 60,
    usualShiftBudgetMinutes: 570,
    allowSplits: true,
    defaultPreTripMinutes: 15,
    defaultBufferMinutes: 0,
    strategyView: 'recaps',
  };

  await seed({ nowOverride: NOW_S, segments: FRESH_SEGS, weekPlan: CLEAN_SPLIT_DRAFT });
  await openMyWeekViaCapstone();

  // With allowSplits = true: Leg 2 SHOULD use a split and show mandatory SB callout
  const synYes = A.synthesizeWeek({ segments: FRESH_SEGS, now: NOW_S, config: cfgChi70, mph: 55, draft: CLEAN_SPLIT_DRAFT, historyBasis: 'known' });
  const rm = planRoom();
  const calloutBefore = all((n) => n.attributes?.['data-myweek-split-callout'] === '1', rm)[0];
  const yesOk = synYes.recaps.usesSplit === true && synYes.recaps.loads[1].usedSplit === true && Boolean(calloutBefore);

  // Tap "Straight 10s only" in DOM -> persists allowSplits: false
  const noBtn = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-splits-no'] === '1', rm)[0];
  if (!noBtn) return 'missing Straight 10s only toggle button';
  fire(noBtn, 'click');
  await sleep(70);

  const stAfter = getState();
  const synNo = A.synthesizeWeek({ segments: FRESH_SEGS, now: NOW_S, config: cfgChi70, mph: 55, draft: stAfter.weekPlan, historyBasis: 'known' });
  const calloutAfter = all((n) => n.attributes?.['data-myweek-split-callout'] === '1', rm)[0];
  const cardAfter = all((n) => n.attributes?.['data-myweek-load-card'] === 's2', rm)[0];
  const noOk = stAfter.weekPlan.allowSplits === false
    && synNo.recaps.usesSplit === false
    && synNo.recaps.loads.every((l) => !l.usedSplit && !l.splitTrapDetected)
    && !calloutAfter
    && cardAfter?.attributes?.['data-myweek-split'] === 'none'
    && !synNo.conflicts.some((c) => c.kind === 'split_trap');

  return (yesOk && noOk) || JSON.stringify({
    yesOk, noOk,
    yesSplit: synYes.recaps.usesSplit,
    allowAfter: stAfter.weekPlan.allowSplits,
    noSplit: synNo.recaps.usesSplit,
    calloutAfter: Boolean(calloutAfter),
  });
});

/* ---------------- MW5: store.ts persistence, export/import, sanitizer, legacy, BACKUP_KEY & SIM_KEY ---------------- */
await pin('MW5. store.ts: weekPlan export/import round-trip, garbage sanitizer, legacy backup compat, BACKUP_KEY rotation & SIM_KEY quarantine', async () => {
  if (typeof S.sanitizeWeekPlan !== 'function' || !S.DEFAULT_WEEK_PLAN) return 'store.ts weekPlan schema/sanitizer missing';
  await seed({
    weekPlan: {
      ...SEC_D_DRAFT,
      allowSplits: false,
      loads: [
        { ...SEC_D_DRAFT.loads[0], deadheadMiles: 65, pickupDwellMinutes: 45, pickupDwellOff: true },
        SEC_D_DRAFT.loads[1],
      ],
    },
  });

  // 1. Export / Import round-trip
  const exportedStr = S.exportState(getState());
  const payload = JSON.parse(exportedStr);
  const hasExportedWeek = Boolean(payload.weekPlan && payload.weekPlan.loads.length === 2 && payload.weekPlan.loads[0].deadheadMiles === 65);
  const cleanResets = S.draftResets(payload, S.INITIAL_STATE);

  setState({ weekPlan: { ...S.DEFAULT_WEEK_PLAN, loads: [] } });
  setState((cur) => S.applyImportedState(cur, payload));
  const restored = getState().weekPlan;
  const roundTripOk = hasExportedWeek
    && cleanResets.length === 0
    && restored.loads.length === 2
    && restored.loads[0].deadheadMiles === 65
    && restored.loads[0].pickupDwellMinutes === 45
    && restored.loads[0].pickupDwellOff === true
    && restored.loads[1].apptTimeZone === 'America/New_York'
    && restored.allowSplits === false
    && restored.homeTarget?.date === '2026-11-13'
    && restored.homeTarget?.time === '09:00';

  // 2. Sanitizer on garbage input (parseSaved + applyImportedState + draftResets)
  const garbageWeek = {
    loads: [
      { id: 'g1', miles: 999999, driveMinutes: -50, mph: 200, hasAppt: true, apptDate: '2026-02-30', apptTime: '99:99', apptTimeZone: 'Mars/Phobos', dockMinutes: 5000, deadheadMiles: -10, pickupDwellMinutes: 9999 },
      'not-an-object',
      { id: 'g2', miles: 300 },
      { id: 'g3', miles: 300 },
      { id: 'g4', miles: 300 },
      { id: 'g5', miles: 300 },
      { id: 'g6', miles: 300 }, // exceeds max 5
    ],
    homeTarget: { date: '2026-02-30', time: '25:99' },
    allowSplits: 'yes',
    usualShiftStartMinutes: 9999,
    strategyView: 'warp_speed',
  };
  const parsedGarbage = S.parseSaved(JSON.stringify({ ...S.INITIAL_STATE, weekPlan: garbageWeek })).weekPlan;
  const garbageResets = S.draftResets({ segments: [], weekPlan: garbageWeek }, S.INITIAL_STATE);
  const sanitizeOk = parsedGarbage.loads.length === 5
    && parsedGarbage.loads[0].miles === 3000
    && parsedGarbage.loads[0].driveMinutes === 0
    && parsedGarbage.loads[0].mph === 65
    && parsedGarbage.loads[0].hasAppt === false
    && parsedGarbage.loads[0].apptTimeZone === ''
    && parsedGarbage.loads[0].dockMinutes === 720
    && parsedGarbage.loads[0].deadheadMiles === 0
    && parsedGarbage.loads[0].pickupDwellMinutes === 480
    && parsedGarbage.homeTarget === null
    && parsedGarbage.allowSplits === true
    && parsedGarbage.usualShiftStartMinutes === 1439
    && parsedGarbage.strategyView === 'recaps'
    && garbageResets.includes('My Week plan');

  // 3. Legacy backup WITHOUT weekPlan imports cleanly & parseSaved defaults safely
  const { weekPlan: _drop, ...legacyPayload } = payload;
  const legacyParsed = S.parseSaved(JSON.stringify(legacyPayload));
  const legacyResets = S.draftResets(legacyPayload, getState());
  const beforeLegacy = getState().weekPlan;
  const legacyApplied = S.applyImportedState(getState(), legacyPayload);
  const legacyOk = legacyParsed.weekPlan.loads.length === 0
    && legacyParsed.weekPlan.allowSplits === true
    && legacyResets.length === 0
    && legacyApplied.weekPlan.loads.length === beforeLegacy.loads.length;

  // 4. BACKUP_KEY rotation preserves weekPlan on corrupted main save
  setState({ weekPlan: SEC_D_DRAFT });
  setState({ mph: 56 }); // rotates previous good save (with SEC_D_DRAFT) into BACKUP_KEY
  const rawBackup = localStorage.getItem('hos-sandbox-v1-backup');
  localStorage.setItem('hos-sandbox-v1', '{corrupt-json');
  const recovered = S.loadSaved();
  const backupOk = Boolean(rawBackup) && recovered.weekPlan.loads.length === 3 && recovered.weekPlan.loads[1].label === 'Nash → CLT';
  // Restore clean save
  setState({ weekPlan: SEC_D_DRAFT, mph: 55 });

  // 5. SIM_KEY quarantine: weekPlan edits made under simulated clock are discarded by useRealClock()
  setState({ nowOverride: null, weekPlan: { ...S.DEFAULT_WEEK_PLAN, loads: [SEC_D_DRAFT.loads[0]] } });
  setState({ nowOverride: NOW_SEC_D }); // null -> value edge snapshots real weekPlan into SIM_KEY
  setState({ weekPlan: { ...S.DEFAULT_WEEK_PLAN, loads: [SEC_D_DRAFT.loads[0], SEC_D_DRAFT.loads[1], SEC_D_DRAFT.loads[2]] } });
  A.useRealClock();
  const afterSim = getState();
  const simOk = afterSim.nowOverride === null && afterSim.weekPlan.loads.length === 1 && afterSim.weekPlan.loads[0].id === 'l1';

  return (roundTripOk && sanitizeOk && legacyOk && backupOk && simOk) || JSON.stringify({
    roundTripOk, sanitizeOk, legacyOk, backupOk, simOk,
    cleanResets, garbageResets, legacyResets, afterSimLoads: afterSim.weekPlan.loads.length,
  });
});

/* ---------------- MW6: Plan hub capstone presence, ClockPick, 0 input[type=time], Back ---------------- */
await pin('MW6. Plan hub presence & hygiene: capstone card above 12 untouched .plan-item tools, shared ClockPick (0 input[type=time]), clean Back', async () => {
  await seed({ weekPlan: SEC_D_DRAFT });
  const pg = planPage();
  const capstone = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-entry'] === '1', pg)[0];
  const planItems = all((n) => n.localName === 'button' && has(n, 'plan-item'), pg);
  if (!capstone) return 'missing .plan-capstone entry on Plan tab';
  const distinctFromList = !has(capstone, 'plan-item') && has(capstone, 'plan-capstone') && planItems.length === 12;
  const hubHasSummary = /My Week/.test(capstone.textContent) && /3 loads/.test(capstone.textContent);

  fire(capstone, 'click');
  await sleep(70);
  const rm = planRoom();

  // Zero <input type="time"> inside My Week room
  const badTimeInputs = all((n) => n.localName === 'input' && n.attributes?.type === 'time', rm);

  // Open Home-time target ClockPick sheet
  const homeBtn = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-home-btn'] === '1', rm)[0];
  if (!homeBtn) return 'missing Home-time ClockPick button';
  fire(homeBtn, 'click');
  await sleep(60);
  const sheet1 = all((n) => has(n, 'sheet'))[0];
  const clk1 = sheet1 ? all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), sheet1)[0] : null;
  const nonClockPickTimeInputs = sheet1 ? all((n) => n.localName === 'input' && n.attributes?.type === 'time' && !has(n, 'ed-clock-input'), sheet1) : [];
  openSheet(null);
  await sleep(40);

  // Open Usual shift start ClockPick sheet (timeOnly)
  const usualBtn = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-usual-start-btn'] === '1', rm)[0];
  if (!usualBtn) return 'missing usual shift start ClockPick button';
  fire(usualBtn, 'click');
  await sleep(60);
  const sheet2 = all((n) => has(n, 'sheet'))[0];
  const clk2 = sheet2 ? all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), sheet2)[0] : null;
  const day2 = sheet2 ? all((n) => n.localName === 'input' && has(n, 'ed-day-input'), sheet2)[0] : null;
  openSheet(null);
  await sleep(40);

  // Estimate disclaimer & no legal-authority claims
  const rmText = rm.textContent || '';
  const copyOk = /Planning estimate/i.test(rmText) && /ELD governs/i.test(rmText) && !/official ELD|legal advice/i.test(rmText);

  // Back button closes My Week back to Plan
  const backBtn = all((n) => n.localName === 'button' && has(n, 'back'), rm)[0];
  if (backBtn) { fire(backBtn, 'click'); await sleep(60); }
  const backClosed = A.isMyWeekPlannerOpen?.() === false;

  return (distinctFromList && hubHasSummary && badTimeInputs.length === 0 && Boolean(clk1) && nonClockPickTimeInputs.length === 0 && Boolean(clk2) && !day2 && copyOk && backClosed) || JSON.stringify({
    distinctFromList, planItemsCount: planItems.length, hubHasSummary,
    badTimeInputs: badTimeInputs.length, nonClockPickTimeInputs: nonClockPickTimeInputs.length, clk1: Boolean(clk1), clk2: Boolean(clk2), day2: Boolean(day2), copyOk, backClosed,
  });
});

/* ---------------- MW7: G7 drill-downs, Load Check import, stale load & provisional guardrails ---------------- */
await pin('MW7. G7 drill-downs (Rollout & Rescue prefill + Back to My Week), Load Check import, stale load & provisional guardrails', async () => {
  if (typeof A.synthesizeWeek !== 'function') return 'synthesizeWeek missing';
  await seed({ weekPlan: SEC_D_DRAFT });
  await openMyWeekViaCapstone();
  const rm = planRoom();

  // Expand Load 2 (Nash -> CLT, 410 mi, America/New_York)
  const l2Card = all((n) => n.attributes?.['data-myweek-load-card'] === 'l2', rm)[0];
  const l2Head = l2Card ? all((n) => n.localName === 'button' && has(n, 'mw-load-head'), l2Card)[0] : null;
  if (!l2Head) return 'missing Load 2 expand button';
  fire(l2Head, 'click');
  await sleep(60);

  // Drill into When to Roll & PTA
  const drillRollBtn = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-drill-rollout'] === 'l2', rm)[0];
  if (!drillRollBtn) return 'missing Open When to Roll & PTA drill-down button';
  fire(drillRollBtn, 'click');
  await sleep(80);
  const inRollout = A.isRolloutPlannerOpen() && !A.isMyWeekPlannerOpen();
  const rolloutTxt = planRoom().textContent || '';
  const rolloutPrefilled = /410/.test(rolloutTxt) && /Eastern/.test(rolloutTxt);
  // Tap Back in Rollout -> returns to My Week!
  const rollBack = all((n) => n.localName === 'button' && has(n, 'back'), planRoom())[0];
  if (rollBack) { fire(rollBack, 'click'); await sleep(80); }
  const returnedFromRollout = A.isMyWeekPlannerOpen() && !A.isRolloutPlannerOpen();

  // Expand Load 2 again and drill into Split-Sleeper Rescue
  const l2Card2 = all((n) => n.attributes?.['data-myweek-load-card'] === 'l2', planRoom())[0];
  const l2Head2 = l2Card2 ? all((n) => n.localName === 'button' && has(n, 'mw-load-head'), l2Card2)[0] : null;
  if (l2Head2) { fire(l2Head2, 'click'); await sleep(60); }
  const drillRescueBtn = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-drill-rescue'] === 'l2', planRoom())[0];
  if (!drillRescueBtn) return 'missing Open Rescue drill-down button';
  fire(drillRescueBtn, 'click');
  await sleep(80);
  const inRescue = A.isRescuePlannerOpen() && !A.isMyWeekPlannerOpen();
  const rescueBack = all((n) => n.localName === 'button' && has(n, 'back'), planRoom())[0];
  if (rescueBack) { fire(rescueBack, 'click'); await sleep(80); }
  const returnedFromRescue = A.isMyWeekPlannerOpen() && !A.isRescuePlannerOpen();

  // Provisional guardrail: unacknowledged short history -> never All clear
  const synProv = A.synthesizeWeek({
    segments: [{ status: 'OFF', start: NOW_SEC_D - 600, end: NOW_SEC_D }],
    now: NOW_SEC_D,
    config: cfgChi70,
    mph: 55,
    draft: { ...SEC_D_DRAFT, loads: [SEC_D_DRAFT.loads[0]], homeTarget: null },
    historyBasis: 'incomplete',
  });
  const provOk = synProv.provisional === true && synProv.verdict.status === 'provisional' && synProv.verdict.tone === 'warn';

  // Stale load guardrail: past-due load excluded from forward chaining and surfaced in staleLoads
  const pastLoad = { ...SEC_D_DRAFT.loads[0], id: 'past1', label: 'Yesterday Run', apptDate: '2026-11-09', apptTime: '08:00' };
  const synStale = A.synthesizeWeek({
    segments: SEC_D_SEGS,
    now: NOW_SEC_D,
    config: cfgChi70,
    mph: 55,
    draft: { ...SEC_D_DRAFT, loads: [pastLoad, SEC_D_DRAFT.loads[0]] },
    historyBasis: 'known',
  });
  const staleOk = synStale.staleLoads.length === 1 && synStale.staleLoads[0].load.id === 'past1' && synStale.activeLoadCount === 1;

  return (inRollout && rolloutPrefilled && returnedFromRollout && inRescue && returnedFromRescue && provOk && staleOk) || JSON.stringify({
    inRollout, rolloutPrefilled, returnedFromRollout, inRescue, returnedFromRescue, provOk, staleOk,
  });
});

/* ---------------- MW8: Carrier-day 18:40 boundary chained audit() & 60/7 cycle parity ---------------- */
await pin('MW8. Shared floor parity: carrier-day 18:40 chained 3-load audit() & 60/7 cycle match evaluate() at each PTA', async () => {
  if (typeof A.synthesizeWeek !== 'function') return 'synthesizeWeek missing';
  const wallOf = (m, tz) => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(m * 60000));
    const g = (t) => p.find((x) => x.type === t).value;
    return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
  };
  // Shift Section D by +18h 40m so every load chains across real 18:40 carrier-day boundaries (Opus p2.mjs)
  const sh = 18 * 60 + 40;
  const NOW_1840 = NOW_SEC_D + sh;
  const segs1840 = makeContinuousLog([
    { status: 'D', start: chi(3, 1, 0) + sh, end: chi(3, 9, 30) + sh },
    { status: 'D', start: chi(4, 1, 0) + sh, end: chi(4, 10, 30) + sh },
    { status: 'D', start: chi(5, 1, 0) + sh, end: chi(5, 10, 0) + sh },
    { status: 'D', start: chi(6, 1, 0) + sh, end: chi(6, 9, 0) + sh },
    { status: 'D', start: chi(7, 1, 0) + sh, end: chi(7, 9, 0) + sh },
    { status: 'D', start: chi(8, 1, 0) + sh, end: chi(8, 9, 0) + sh },
    { status: 'D', start: chi(9, 1, 0) + sh, end: chi(9, 9, 0) + sh },
    { status: 'D', start: chi(10, 2, 0) + sh, end: chi(10, 8, 0) + sh },
  ], NOW_1840);
  const a1 = wallOf(chi(11, 9, 0) + sh, 'America/Chicago');
  const a2 = wallOf(E.localToMinute(2026, 11, 12, 6, 'America/New_York', 30) + sh, 'America/New_York');
  const ht = wallOf(chi(13, 9, 0) + sh, 'America/Chicago');
  const draft1840 = {
    ...SEC_D_DRAFT,
    loads: [
      { ...SEC_D_DRAFT.loads[0], apptDate: a1.date, apptTime: a1.time, apptTimeZone: 'America/Chicago' },
      { ...SEC_D_DRAFT.loads[1], apptDate: a2.date, apptTime: a2.time, apptTimeZone: 'America/New_York' },
      { ...SEC_D_DRAFT.loads[2] },
    ],
    homeTarget: ht,
  };
  const ev1840 = E.evaluate(segs1840, { asOf: NOW_1840, config: cfgChi1840 });
  const syn1840 = A.synthesizeWeek({
    segments: segs1840,
    now: NOW_1840,
    config: cfgChi1840,
    mph: 55,
    draft: draft1840,
    historyBasis: 'known',
  });
  const boundaryOk = syn1840.dayStartWord === '18:40' && syn1840.cycleRemainingNow === ev1840.cycle.remaining;

  // Independent per-load audit across 18:40 boundaries (Opus audit() pattern)
  const pruned = E.pruneHistory(segs1840, NOW_1840, cfgChi1840);
  let hist = [...pruned];
  const auditErrors = [];
  let tCursor = NOW_1840;
  for (const s of [...syn1840.recaps.simSegments].sort((x, y) => x.start - y.start)) {
    if (s.start !== tCursor) auditErrors.push(`discontinuity ${tCursor} != ${s.start}`);
    tCursor = s.end;
  }
  for (const o of syn1840.recaps.loads) {
    hist = [...hist, ...o.simSegments.map(({ tentative: _t, ...r }) => r)];
    const evPta = E.evaluate(hist, { asOf: o.pta.minute, config: cfgChi1840 });
    const vPta = evPta.violations.filter((x) => x.start >= NOW_1840);
    if (o.cycleRemainingAfter !== evPta.cycle.remaining) {
      auditErrors.push(`${o.displayName} cycleAfter ${o.cycleRemainingAfter} != indep ${evPta.cycle.remaining}`);
    }
    if (vPta.length > 0) auditErrors.push(`${o.displayName} indep violations: ${vPta.map((x) => x.kind).join(',')}`);
  }
  const [r1, r2, r3] = syn1840.recaps.loads;
  const shiftedExact = r1?.cycleRemainingAfter === 135 && r2?.midnightGateMinutes === 43 && r2?.cycleRemainingAfter === 122 && r3?.midnightGateMinutes === 13 && r3?.cycleRemainingAfter === 17 && syn1840.recaps.homeCheck?.slackMinutes === -13;

  const ev60 = E.evaluate(SEC_D_SEGS, { asOf: NOW_SEC_D, config: cfgChi60 });
  const syn60 = A.synthesizeWeek({
    segments: SEC_D_SEGS,
    now: NOW_SEC_D,
    config: cfgChi60,
    mph: 55,
    draft: { ...SEC_D_DRAFT, loads: [SEC_D_DRAFT.loads[0]], homeTarget: null },
    historyBasis: 'known',
  });
  const cycle60Ok = syn60.cycleLimit === 3600 && syn60.cycleWindowDays === 7 && syn60.cycleRemainingNow === ev60.cycle.remaining;

  return (boundaryOk && shiftedExact && auditErrors.length === 0 && cycle60Ok) || JSON.stringify({
    boundaryOk, shiftedExact, auditErrors, cycle60Ok,
    loads: syn1840.recaps.loads.map((o) => ({ n: o.displayName, g: o.midnightGateMinutes, c: o.cycleRemainingAfter })),
  });
});

/* ---------------- Shared helpers for MW9–MW16 (Opus probe fixtures & deterministic fuzz RNG) ---------------- */
const makeWall = (m, tz) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(m * 60000));
  const g = (t) => p.find((x) => x.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
};
const makeLoad = (o) => ({ ...S.DEFAULT_WEEK_LOAD, preTripMinutes: null, bufferMinutes: null, mph: null, ...o });
const makeDraft = (o) => ({ ...S.DEFAULT_WEEK_PLAN, ...o });
function generateFuzzCase(seedVal) {
  let seed = seedVal;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (arr) => arr[ri(0, arr.length - 1)];
  const [h, m] = pick([[0, 0], [18, 40], [18, 40], [6, 0]]);
  const cfg = { ...cfgChi70, dayStartHour: h, dayStartMinute: m, cycle: pick(['70/8', '60/7']) };
  const NOW = chi(10, ri(0, 23), pick([0, 17, 40]));
  const blocks = [];
  let t = NOW - 8 * 1440;
  while (t < NOW - 600) {
    const len = ri(300, 660);
    const st = t + ri(600, 900);
    if (st + len > NOW - 600) break;
    blocks.push({ status: pick(['D', 'D', 'ON']), start: st, end: st + len });
    t = st + len;
  }
  const SEGS = makeContinuousLog(blocks, NOW);
  const n = ri(2, 5);
  const loads = [];
  let ap = NOW + ri(8, 20) * 60;
  for (let k = 0; k < n; k++) {
    const tz = pick(['America/Chicago', 'America/New_York', 'America/Denver', 'America/Chicago']);
    const has = rnd() < 0.75;
    const w = makeWall(ap, tz);
    loads.push(makeLoad({ id: 'x' + k, label: 'X' + (k + 1), miles: ri(150, 650), hasAppt: has, apptDate: w.date, apptTime: w.time, apptTimeZone: tz, dockMinutes: pick([0, 30, 60, 120, 180]), dockOff: rnd() < 0.3, deadheadMiles: rnd() < 0.2 ? ri(20, 100) : 0, pickupDwellMinutes: rnd() < 0.2 ? ri(15, 90) : 0 }));
    ap += ri(14, 30) * 60;
  }
  const allow = rnd() < 0.6;
  const draft = makeDraft({ loads, allowSplits: allow, homeTarget: rnd() < 0.5 ? makeWall(ap - ri(0, 10) * 60, 'America/Chicago') : null, fillOpenNights: rnd() < 0.5 });
  const basis = pick(['known', 'known', 'known', 'incomplete']);
  return { cfg, NOW, SEGS, draft, basis };
}
function shiftLoadEarlier(o, delta) {
  const segs = o.simSegments.map((s) => ({ ...s }));
  const out = [];
  let i = 0;
  if (segs[0] && segs[0].status === 'OFF' && /^Rest before/.test(segs[0].note || '')) { out.push({ ...segs[0], end: segs[0].end - delta }); i = 1; }
  for (; i < segs.length; i++) {
    const s = segs[i];
    if (/early wait/.test(s.note || '')) { out.push({ ...s, start: s.start - delta }); i++; break; }
    if (/dock/.test(s.note || '') && o.appointment) { out.push({ status: 'OFF', start: s.start - delta, end: s.start, note: 'inserted wait' }); break; }
    out.push({ ...s, start: s.start - delta, end: s.end - delta });
  }
  for (; i < segs.length; i++) out.push(segs[i]);
  return out.filter((s) => s.end > s.start);
}

/* ---------------- MW9 (H2 + M1 + M4): Restart blindness, minimal hold, reset34 recommendation & Week Strip default ---------------- */
await pin('MW9. H2/M1/M4: p3 weekend restart has 0 fabricated hold; SEED=383857408 hold is brute-force minimal, recommends reset34, Week Strip follows winner', async () => {
  // (a) Opus p3.mjs fixture: 60/7, 18:40, OFF since Sat Nov 14 08:00, now Sun Nov 15 12:00
  const cfgP3 = { ...cfgChi70, cycle: '60/7', dayStartHour: 18, dayStartMinute: 40 };
  const NOW_P3 = chi(15, 12, 0);
  const bP3 = [];
  for (let d = 9; d <= 13; d++) {
    bP3.push({ status: 'D', start: chi(d, 20, 0), end: chi(d, 20, 0) + 660 });
    bP3.push({ status: 'ON', start: chi(d, 20, 0) + 660, end: chi(d, 20, 0) + 720 });
  }
  const SEGS_P3 = makeContinuousLog(bP3, NOW_P3);
  const draftP3 = makeDraft({
    loads: [
      makeLoad({ id: 'a', label: 'Mon load', miles: 500, hasAppt: true, apptDate: '2026-11-16', apptTime: '06:00', apptTimeZone: 'America/Chicago', dockMinutes: 60 }),
      makeLoad({ id: 'b', label: 'Tue load', miles: 400, hasAppt: true, apptDate: '2026-11-17', apptTime: '06:00', apptTimeZone: 'America/Chicago', dockMinutes: 60 }),
    ],
    allowSplits: false,
  });
  const synP3 = A.synthesizeWeek({ segments: SEGS_P3, now: NOW_P3, config: cfgP3, mph: 55, draft: draftP3, historyBasis: 'known' });
  const mon = synP3.recaps.loads[0];
  const p3Ok = mon.rollOut.homeShort === 'Sun 19:24 Central'
    && mon.midnightGateMinutes === 0
    && mon.meetsAppt === true
    && mon.violations.length === 0
    && !/Late 22h 16m/.test(mon.statusBadge);

  // (b) SEED=383857408: brute-force minimal hold on recaps + M1 recommends reset34 + M4 Week Strip defaults to reset34
  const c38 = generateFuzzCase(383857408);
  const syn38 = A.synthesizeWeek({ segments: c38.SEGS, now: c38.NOW, config: c38.cfg, mph: 55, draft: c38.draft, historyBasis: c38.basis });
  const x1 = syn38.recaps.loads[0];
  const pruned38 = E.pruneHistory(c38.SEGS, c38.NOW, c38.cfg);
  const segsAtHold = shiftLoadEarlier(x1, 0).map(({ tentative: _t, ...r }) => r);
  const segsEarlier1 = shiftLoadEarlier(x1, 1).map(({ tentative: _t, ...r }) => r);
  const evAtHold = E.evaluate([...pruned38, ...segsAtHold], { asOf: segsAtHold.at(-1).end, config: c38.cfg });
  const evEarlier1 = E.evaluate([...pruned38, ...segsEarlier1], { asOf: segsEarlier1.at(-1).end, config: c38.cfg });
  const holdViol0 = evAtHold.violations.filter((v) => v.start >= c38.NOW).length === 0;
  const earlier1Fails = evEarlier1.violations.filter((v) => v.start >= c38.NOW).length > 0;
  const m1Ok = syn38.recommendedStrategy === 'reset34';

  // M4 DOM check: strategyView starts as 'recaps', yet Week Strip displays recommended reset34 by default,
  // marks reset34 with ★, and manual toggle to recaps still works.
  await seed({ nowOverride: c38.NOW, segments: c38.SEGS, config: c38.cfg, weekPlan: { ...c38.draft, strategyView: 'recaps' } });
  await openMyWeekViaCapstone();
  const rm = planRoom();
  const btn34 = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-strat'] === 'reset34', rm)[0];
  const btnRec = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-strat'] === 'recaps', rm)[0];
  const defaultFollowsWinner = Boolean(btn34 && btn34.attributes?.['aria-pressed'] === 'true' && /★/.test(btn34.textContent));
  if (btnRec) { fire(btnRec, 'click'); await sleep(60); }
  const btnRecAfter = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-strat'] === 'recaps', planRoom())[0];
  const manualToggleWorks = Boolean(btnRecAfter && btnRecAfter.attributes?.['aria-pressed'] === 'true');

  return (p3Ok && holdViol0 && earlier1Fails && m1Ok && defaultFollowsWinner && manualToggleWorks) || JSON.stringify({
    p3Ok, monRoll: mon.rollOut.homeShort, monGate: mon.midnightGateMinutes, monBadge: mon.statusBadge,
    x1Gate: x1.midnightGateMinutes, x1Roll: x1.rollOut.homeShort, holdViol0, earlier1Fails,
    m1Rec: syn38.recommendedStrategy, defaultFollowsWinner, manualToggleWorks,
  });
});

/* ---------------- MW10 (H3 + L3 + L5 + L8 + L9): Verdict honesty, hub subtitle, stale conflict, binding margin, detention break ---------------- */
await pin('MW10. H3/L3/L5/L8/L9: p6 home 0m slack & SEED=1776634368 mid-week 0m cycle -> Tight; stale past-due -> Conflict; hub never lies; L3 18m break; L8 10h break hidden on last/split', async () => {
  const NOW_P6 = chi(16, 12, 0);
  const SEGS_P6 = makeContinuousLog([{ status: 'OFF', start: chi(12, 0, 0), end: chi(12, 1, 0) }], NOW_P6);

  // (a) p6 Home run (one 300mi run, home Tue 18:00 -> 0m slack -> Tight, hub NOT "All clear")
  const synHome0 = A.synthesizeWeek({
    segments: SEGS_P6, now: NOW_P6, config: cfgChi70, mph: 55,
    draft: makeDraft({ loads: [makeLoad({ id: 'h', label: 'Home run', miles: 300 })], homeTarget: { date: '2026-11-17', time: '18:00' } }),
    historyBasis: 'known',
  });
  const home0Ok = synHome0.recaps.homeCheck?.slackMinutes === 0
    && synHome0.verdict.status === 'tight'
    && !/All clear/i.test(synHome0.hubSummary)
    && /0m home slack/i.test(synHome0.verdict.label);

  // (b) p6 Thu load alone (45m appt slack, 62h+ cycle -> Tight, L9 names 45m appt slack, NOT 62h; hub NOT "All clear")
  const synThu = A.synthesizeWeek({
    segments: SEGS_P6, now: NOW_P6, config: cfgChi70, mph: 55,
    draft: makeDraft({ loads: [makeLoad({ id: 'f', label: 'Thu load', miles: 300, hasAppt: true, apptDate: '2026-11-19', apptTime: '14:00', apptTimeZone: 'America/Chicago' })] }),
    historyBasis: 'known',
  });
  const thuOk = synThu.verdict.status === 'tight'
    && /45m appt slack/i.test(synThu.verdict.label)
    && !/62h/.test(synThu.verdict.label)
    && !/All clear/i.test(synThu.hubSummary);

  // (c) L5: p6 past-due booked load not in log -> conflict (never All clear / "All 1 load fit")
  const synStale = A.synthesizeWeek({
    segments: SEGS_P6, now: NOW_P6, config: cfgChi70, mph: 55,
    draft: makeDraft({
      loads: [
        makeLoad({ id: 'p', label: 'Booked yesterday', miles: 400, hasAppt: true, apptDate: '2026-11-15', apptTime: '08:00', apptTimeZone: 'America/Chicago' }),
        makeLoad({ id: 'f', label: 'Thu load', miles: 300, hasAppt: true, apptDate: '2026-11-19', apptTime: '14:00', apptTimeZone: 'America/Chicago' }),
      ],
    }),
    historyBasis: 'known',
  });
  const staleConflictOk = synStale.verdict.status === 'conflict'
    && !/All clear|All 1 load fit/i.test(synStale.verdict.headline)
    && !/All clear/i.test(synStale.hubSummary);

  // (d) SEED=1776634368: Load 1 ends at 0m cycle mid-week (later drop-offs refill to 52h+) -> verdict MUST be Tight
  const c17 = generateFuzzCase(1776634368);
  const syn17 = A.synthesizeWeek({ segments: c17.SEGS, now: c17.NOW, config: c17.cfg, mph: 55, draft: c17.draft, historyBasis: 'known' });
  const midZeroOk = syn17.recaps.loads[0].cycleRemainingAfter === 0
    && syn17.verdict.status === 'tight'
    && /0m cycle/i.test(syn17.verdict.label)
    && !/All clear/i.test(syn17.hubSummary);

  // (e) L3: Section D detention breaking point = 18m (re-evaluated binary search, NOT 22m = margin+5)
  const synSecD = A.synthesizeWeek({ segments: SEC_D_SEGS, now: NOW_SEC_D, config: cfgChi70, mph: 55, draft: SEC_D_DRAFT, historyBasis: 'known' });
  const homeConf = synSecD.conflicts.find((c) => c.kind === 'home_time_short');
  const l3Ok = Boolean(homeConf && /18m/.test(homeConf.body) && !/22m/.test(homeConf.body) && synSecD.verdict.fragilityNote && /18m/.test(synSecD.verdict.fragilityNote) && !/22m/.test(synSecD.verdict.fragilityNote));

  // (f) L8: "10h break ends" hidden on last (home) load in Section D DOM, shown on Load 1
  await seed({ weekPlan: SEC_D_DRAFT });
  await openMyWeekViaCapstone();
  const rm = planRoom();
  const l1Card = all((n) => n.attributes?.['data-myweek-load-card'] === 'l1', rm)[0];
  const l3Card = all((n) => n.attributes?.['data-myweek-load-card'] === 'l3', rm)[0];
  const l8Ok = Boolean(l1Card && /10h break ends/.test(l1Card.textContent) && l3Card && !/10h break ends/.test(l3Card.textContent));

  return (home0Ok && thuOk && staleConflictOk && midZeroOk && l3Ok && l8Ok) || JSON.stringify({
    home0Ok, thuOk, staleConflictOk, midZeroOk, l3Ok, l8Ok,
    home0: { st: synHome0.verdict.status, lbl: synHome0.verdict.label, hub: synHome0.hubSummary },
    thu: { st: synThu.verdict.status, lbl: synThu.verdict.label, hub: synThu.hubSummary },
    stale: { st: synStale.verdict.status, hl: synStale.verdict.headline, hub: synStale.hubSummary },
    s17: { st: syn17.verdict.status, lbl: syn17.verdict.label, l0c: syn17.recaps.loads[0].cycleRemainingAfter },
    l3Body: homeConf?.body, l3Frag: synSecD.verdict.fragilityNote,
  });
});

/* ---------------- MW11 (H4): Chained Load 2 drill-down (Rollout & Rescue) ---------------- */
await pin('MW11. H4: Section D Load 2 drill-down seeds from chained state (does NOT claim Wed 21:02 fits cleanly; earliest legal roll = Wed 21:45)', async () => {
  await seed({ weekPlan: SEC_D_DRAFT });
  await openMyWeekViaCapstone();
  const l2Card = all((n) => n.attributes?.['data-myweek-load-card'] === 'l2', planRoom())[0];
  const l2Head = l2Card ? all((n) => n.localName === 'button' && has(n, 'mw-load-head'), l2Card)[0] : null;
  if (!l2Head) return 'missing Load 2 expand button';
  fire(l2Head, 'click');
  await sleep(60);

  const drillRollBtn = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-drill-rollout'] === 'l2', planRoom())[0];
  if (!drillRollBtn) return 'missing drill-rollout button';
  fire(drillRollBtn, 'click');
  await sleep(80);

  const rm = planRoom();
  const txt = rm.textContent || '';
  const infeasibleCard = all((n) => n.attributes?.['data-rollout-infeasible'] === '1', rm)[0];
  const noFalseFitsCleanly = !/Fits cleanly/i.test(txt) && !/already covers this/i.test(txt) && !/Wed 21:02/.test(txt);
  const showsChainedEarliest = /Wed 21:45/.test(txt) && /2h 15m/.test(txt) && !/5h 00m left/.test(txt);

  // Back to My Week, then verify Rescue drill-down also seeds from chained state (2h 15m cycle left)
  const rollBack = all((n) => n.localName === 'button' && has(n, 'back'), rm)[0];
  if (rollBack) { fire(rollBack, 'click'); await sleep(70); }
  const l2Card2 = all((n) => n.attributes?.['data-myweek-load-card'] === 'l2', planRoom())[0];
  const l2Head2 = l2Card2 ? all((n) => n.localName === 'button' && has(n, 'mw-load-head'), l2Card2)[0] : null;
  if (l2Head2) { fire(l2Head2, 'click'); await sleep(60); }
  const drillRescueBtn = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-drill-rescue'] === 'l2', planRoom())[0];
  if (!drillRescueBtn) return 'missing drill-rescue button';
  fire(drillRescueBtn, 'click');
  await sleep(80);
  const rescueTxt = planRoom().textContent || '';
  const rescueChained = /2h 15m/.test(rescueTxt) && !/5h 00m/.test(rescueTxt) && /Chi → Nash/.test(rescueTxt);

  return (Boolean(infeasibleCard) && noFalseFitsCleanly && showsChainedEarliest && rescueChained) || JSON.stringify({
    infeasible: Boolean(infeasibleCard), noFalseFitsCleanly, showsChainedEarliest, rescueChained,
    rollSnippet: txt.slice(0, 420), rescueSnippet: rescueTxt.slice(0, 320),
  });
});

/* ---------------- MW12 (H5 corrected): Outcomes-only split trap (p7/p5/p4 keep split, no false trap) ---------------- */
await pin('MW12. H5 (corrected): Outcomes-only split trap — (a) p7 NO trap; (b) p5 NO trap, split kept, home lateness honest; (c) p4 NO trap, split kept, Leg 2 on time, Leg 3 15h 15m conflict card', async () => {
  const NOW_S = chi(9, 6, 0);
  // (a) Original MW3 / Opus p7.mjs fixture: split leaves Leg 3 4h 15m late vs 9h 15m on straight-10 -> NO trap!
  const SEGS_P7 = makeContinuousLog([{ status: 'OFF', start: chi(8, 18, 0), end: NOW_S }], NOW_S);
  const mkLeg = (o) => makeLoad({ mph: 55, preTripMinutes: 15, bufferMinutes: 0, apptTimeZone: 'America/Chicago', hasAppt: true, ...o });
  const draftP7 = makeDraft({
    fillOpenNights: false, defaultBufferMinutes: 0, allowSplits: true,
    loads: [
      mkLeg({ id: 't1', label: 'Leg 1', miles: 275, apptDate: '2026-11-09', apptTime: '11:15', dockMinutes: 120 }),
      mkLeg({ id: 't2', label: 'Leg 2', miles: 330, apptDate: '2026-11-10', apptTime: '02:30', dockMinutes: 0 }),
      mkLeg({ id: 't3', label: 'Leg 3', miles: 440, apptDate: '2026-11-10', apptTime: '14:30', dockMinutes: 0 }),
    ],
  });
  const synP7 = A.synthesizeWeek({ segments: SEGS_P7, now: NOW_S, config: cfgChi70, mph: 55, draft: draftP7, historyBasis: 'known' });
  const p7Ok = !synP7.conflicts.some((c) => c.kind === 'split_trap')
    && synP7.recaps.loads[1].usedSplit === true
    && synP7.recaps.loads[2].apptSlackMinutes === -75;

  // Shared cycle-constrained history for p4 & p5 (870m cycle left, Tue drop +0, Wed +600)
  const b45 = [{ status: 'D', start: chi(3, 2, 0), end: chi(3, 12, 0) }];
  for (let d = 4; d <= 7; d++) b45.push({ status: 'D', start: chi(d, 2, 0), end: chi(d, 11, 0) });
  b45.push({ status: 'D', start: chi(8, 6, 0), end: chi(8, 15, 30) });
  const SEGS_45 = makeContinuousLog([{ status: 'OFF', start: chi(2, 0, 0), end: chi(3, 2, 0) }, ...b45], NOW_S);

  // (b) Opus p5.mjs fixture (Leg 3 no appt, home Tue 13:00): both paths arrive Wed 01:15 (12h 15m past home).
  // Split strictly dominates (Leg 2 on time vs 3h late on straight 10) -> NO trap, split KEPT, no false straight-10 claim!
  const synP5 = A.synthesizeWeek({
    segments: SEGS_45, now: NOW_S, config: cfgChi70, mph: 55, historyBasis: 'known',
    draft: makeDraft({
      allowSplits: true, fillOpenNights: false, defaultBufferMinutes: 0,
      homeTarget: { date: '2026-11-10', time: '13:00' },
      loads: [
        mkLeg({ id: 's1', label: 'Leg 1', miles: 275, apptDate: '2026-11-09', apptTime: '11:15', dockMinutes: 120 }),
        mkLeg({ id: 's2', label: 'Leg 2', miles: 330, apptDate: '2026-11-10', apptTime: '02:30', dockMinutes: 0 }),
        makeLoad({ id: 's3', label: 'Leg 3', miles: 110, mph: 55, hasAppt: false, dockMinutes: 0, preTripMinutes: 15, bufferMinutes: 0 }),
      ],
    }),
  });
  const homeConf5 = synP5.conflicts.find((c) => c.kind === 'home_time_short');
  const gateConf5 = synP5.conflicts.find((c) => c.kind === 'midnight_recap_gate');
  const noFalseStraight10Wording = synP5.conflicts.every((c) => !/vs\.\s*7h 30m on straight 10/i.test(c.body) && !/on straight 10/i.test(c.body));
  const p5Ok = !synP5.conflicts.some((c) => c.kind === 'split_trap')
    && synP5.recaps.loads[1].usedSplit === true
    && synP5.recaps.loads[1].meetsAppt === true
    && synP5.recaps.homeCheck?.slackMinutes === -735
    && Boolean(homeConf5 && /12h 15m/.test(homeConf5.priceLabel))
    && Boolean(gateConf5 && /12h 15m/.test(gateConf5.priceLabel))
    && noFalseStraight10Wording;

  // (c) Opus p4.mjs fixture (Leg 3 appt Tue 10:00): both paths arrive Wed 01:15 (15h 15m late).
  // Split strictly dominates -> NO trap, split KEPT, Leg 2 on time, Leg 3's 15h 15m cycle-wall lateness reported as conflict card!
  const synP4 = A.synthesizeWeek({
    segments: SEGS_45, now: NOW_S, config: cfgChi70, mph: 55, historyBasis: 'known',
    draft: makeDraft({
      allowSplits: true, fillOpenNights: false, defaultBufferMinutes: 0,
      loads: [
        mkLeg({ id: 's1', label: 'Leg 1', miles: 275, apptDate: '2026-11-09', apptTime: '11:15', dockMinutes: 120 }),
        mkLeg({ id: 's2', label: 'Leg 2', miles: 330, apptDate: '2026-11-10', apptTime: '02:30', dockMinutes: 0 }),
        mkLeg({ id: 's3', label: 'Leg 3', miles: 110, apptDate: '2026-11-10', apptTime: '10:00', dockMinutes: 0 }),
      ],
    }),
  });
  const missed4 = synP4.conflicts.find((c) => c.kind === 'appt_missed' && c.id === 'appt-missed-s3');
  const gate4 = synP4.conflicts.find((c) => c.kind === 'midnight_recap_gate' && c.id === 'midnight-gate-s3');
  const p4Ok = !synP4.conflicts.some((c) => c.kind === 'split_trap')
    && synP4.recaps.loads[1].usedSplit === true
    && synP4.recaps.loads[1].meetsAppt === true
    && synP4.recaps.loads[2].apptSlackMinutes === -915
    && Boolean(missed4 && /15h 15m/.test(missed4.priceLabel))
    && Boolean(gate4 && /15h 15m/.test(gate4.priceLabel));

  return (p7Ok && p5Ok && p4Ok) || JSON.stringify({
    p7Ok, p5Ok, p4Ok,
    p7Traps: synP7.conflicts.filter((c) => c.kind === 'split_trap').length,
    p5: { traps: synP5.conflicts.filter((c) => c.kind === 'split_trap').length, l2Split: synP5.recaps.loads[1].usedSplit, l2Meets: synP5.recaps.loads[1].meetsAppt, homeSlack: synP5.recaps.homeCheck?.slackMinutes },
    p4: { traps: synP4.conflicts.filter((c) => c.kind === 'split_trap').length, l2Split: synP4.recaps.loads[1].usedSplit, l2Meets: synP4.recaps.loads[1].meetsAppt, l3Slack: synP4.recaps.loads[2].apptSlackMinutes, missed4: missed4?.priceLabel, gate4: gate4?.priceLabel },
  });
});

/* ---------------- MW13 (H6 + M2 + M5): Verified trades across fuzz2 seeds, M2 no stale gate on split, M5 Copy applied plan ---------------- */
await pin('MW13. H6/M2/M5: Every offered trade on fuzz2 seeds (5, 31337, 4242) delivers its claimed outcome; SEED=579532032 no stale gate; Copy copies applied plan', async () => {
  let checked = 0;
  const fails = [];
  for (const initSeed of [5, 31337, 4242]) {
    let seed = initSeed;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const pick = (arr) => arr[ri(0, arr.length - 1)];
    for (let it = 0; it < 40; it++) {
      const s0 = seed;
      const [h, m] = pick([[0, 0], [18, 40], [18, 40], [6, 0]]);
      const cfg = { ...cfgChi70, dayStartHour: h, dayStartMinute: m, cycle: pick(['70/8', '60/7']) };
      const NOW = chi(10, ri(0, 23), pick([0, 17, 40]));
      const blocks = [];
      let t = NOW - 8 * 1440;
      while (t < NOW - 600) {
        const len = ri(300, 660);
        const st = t + ri(600, 900);
        if (st + len > NOW - 600) break;
        blocks.push({ status: pick(['D', 'D', 'ON']), start: st, end: st + len });
        t = st + len;
      }
      if (!blocks.length) continue;
      const SEGS = makeContinuousLog(blocks, NOW);
      const n = ri(2, 5);
      const loads = [];
      let ap = NOW + ri(8, 20) * 60;
      for (let k = 0; k < n; k++) {
        const tz = pick(['America/Chicago', 'America/New_York', 'America/Denver', 'America/Chicago']);
        const has = rnd() < 0.75;
        const w = makeWall(ap, tz);
        loads.push(makeLoad({ id: 'x' + k, label: 'X' + (k + 1), miles: ri(150, 650), hasAppt: has, apptDate: w.date, apptTime: w.time, apptTimeZone: tz, dockMinutes: pick([0, 30, 60, 120, 180]), dockOff: rnd() < 0.3, deadheadMiles: rnd() < 0.2 ? ri(20, 100) : 0, pickupDwellMinutes: rnd() < 0.2 ? ri(15, 90) : 0 }));
        ap += ri(14, 30) * 60;
      }
      const allow = rnd() < 0.6;
      const draft = makeDraft({ loads, allowSplits: allow, homeTarget: rnd() < 0.5 ? makeWall(ap - ri(0, 10) * 60, 'America/Chicago') : null, fillOpenNights: rnd() < 0.5 });
      const basis = pick(['known', 'known', 'known', 'incomplete']);
      const syn = A.synthesizeWeek({ segments: SEGS, now: NOW, config: cfg, mph: 55, draft, historyBasis: basis });
      for (const c of syn.conflicts) {
        if (!c.previewTrade) continue;
        checked++;
        const after = A.synthesizeWeek({ segments: SEGS, now: NOW, config: cfg, mph: 55, draft: c.previewTrade.apply(JSON.parse(JSON.stringify(draft))), historyBasis: basis });
        const id = c.previewTrade.id;
        const desc = c.previewTrade.description;
        if (id.startsWith('push-for-34')) {
          if (/fits cleanly/.test(desc) && (after.reset34.missedApptCount > 0 || after.reset34.violations.length > 0)) fails.push({ s0, id, desc, missed: after.reset34.missedApptCount });
          const mm = /drop from (\d+) to (\d+)/.exec(desc);
          if (mm && after.reset34.missedApptCount !== Number(mm[2])) fails.push({ s0, id, desc, got: after.reset34.missedApptCount });
        } else if (id.startsWith('shift-appt-')) {
          const lid = id.slice('shift-appt-'.length);
          const w2 = after.recommendedStrategy === 'reset34' ? after.reset34 : after.recaps;
          const o = w2.loads.find((x) => x.id === lid);
          if (/keeps your/.test(desc) && (!o || !o.meetsAppt || o.apptSlackMinutes < o.bufferMinutes)) fails.push({ s0, id, desc, slack: o?.apptSlackMinutes, buf: o?.bufferMinutes });
          if (/arrives .* early/.test(desc) && (!o || !o.meetsAppt)) fails.push({ s0, id, desc, slack: o?.apptSlackMinutes });
        } else if (id.startsWith('relieve-dock-')) {
          const gl = c.id.slice('midnight-gate-'.length);
          const w2 = after.recommendedStrategy === 'reset34' ? after.reset34 : after.recaps;
          const o = w2.loads.find((x) => x.id === gl);
          if (/clearing/.test(desc) && o && o.midnightGateMinutes > 0) fails.push({ s0, id, desc, gateAfter: o.midnightGateMinutes });
          if (/cutting/.test(desc) && o && o.midnightGateMinutes >= (syn.activeStrategy.loads.find((x) => x.id === gl)?.midnightGateMinutes ?? 0)) fails.push({ s0, id, desc, gateAfter: o.midnightGateMinutes });
        } else if (id.startsWith('relieve-home-dock-')) {
          const dm = (s) => { const m = /^(?:(\d+)h)?\s*(?:(\d+)m)?$/.exec((s || '').trim()); return m ? (Number(m[1] || 0) * 60 + Number(m[2] || 0)) : null; };
          const w0 = syn.recommendedStrategy === 'reset34' ? syn.reset34 : syn.recaps;
          const w2 = after.recommendedStrategy === 'reset34' ? after.reset34 : after.recaps;
          const h0 = w0.homeCheck;
          const h1 = w2.homeCheck;
          if (!h1) { fails.push({ s0, id, desc, why: 'no-home' }); continue; }
          const mRec = /Recovers \+([\dhm ]+) of cycle/.exec(desc);
          if (mRec && h0 && (h1.cycleRemainingAtHome - h0.cycleRemainingAtHome !== dm(mRec[1]))) fails.push({ s0, id, desc, gain: h1.cycleRemainingAtHome - h0.cycleRemainingAtHome });
          const mOn = /reaches home on time with ([\dhm ]+) cycle left/.exec(desc);
          const mPast = /leaves ([\dhm ]+) cycle left \(([\dhm ]+) past home\)/.exec(desc);
          if (mOn && (!h1.meetsTarget || h1.cycleRemainingAtHome !== dm(mOn[1]))) fails.push({ s0, id, desc, h1: { meets: h1.meetsTarget, cyc: h1.cycleRemainingAtHome } });
          if (mPast && (h1.cycleRemainingAtHome !== dm(mPast[1]) || -h1.slackMinutes !== dm(mPast[2]))) fails.push({ s0, id, desc, h1: { cyc: h1.cycleRemainingAtHome, slack: h1.slackMinutes } });
        } else if (id.startsWith('straight10-push-')) {
          const lid = id.slice('straight10-push-'.length);
          const o = after.recaps.loads.find((x) => x.id === lid);
          if (after.conflicts.some((x) => x.kind === 'split_trap') || !o?.meetsAppt) fails.push({ s0, id, desc });
        }
      }
    }
  }

  // M2: SEED=579532032 — no load has a hold to a time <= unconstrainedRollOut, and no split load carries a stale midnight gate
  const c57 = generateFuzzCase(579532032);
  const syn57 = A.synthesizeWeek({ segments: c57.SEGS, now: c57.NOW, config: c57.cfg, mph: 55, draft: c57.draft, historyBasis: c57.basis });
  const m2Ok = [syn57.recaps, syn57.reset34].every((st) => st.loads.every((o) =>
    (o.midnightGateMinutes === 0 || o.rollOut.minute > o.unconstrainedRollOut.minute)
    && (!o.usedSplit || o.midnightGateMinutes === 0),
  ));

  // M5: "Copy week summary for dispatch" ALWAYS copies the APPLIED plan, never an active unapplied preview
  await seed({ weekPlan: SEC_D_DRAFT });
  await openMyWeekViaCapstone();
  const rm = planRoom();
  const prevBtn = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-preview-btn'] === 'relieve-dock-l1', rm)[0];
  if (prevBtn) { fire(prevBtn, 'click'); await sleep(60); }
  let copiedText = '';
  const origClip = globalThis.navigator?.clipboard;
  if (globalThis.navigator) {
    globalThis.navigator.clipboard = { writeText: async (txt) => { copiedText = txt; } };
  }
  const copyBtn = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-copy-btn'] === '1', planRoom())[0];
  if (copyBtn) { fire(copyBtn, 'click'); await sleep(40); }
  if (globalThis.navigator) globalThis.navigator.clipboard = origClip;
  // Applied Section D plan has the 43m hold and 17m cycle left; the unapplied relieve-dock-l1 preview clears the 43m hold!
  const m5Ok = /43m/.test(copiedText) && /recap hold \+43m/.test(copiedText);

  return (checked > 100 && fails.length === 0 && m2Ok && m5Ok) || JSON.stringify({
    checked, failCount: fails.length, sampleFails: fails.slice(0, 3), m2Ok, m5Ok, copiedSnippet: copiedText.slice(0, 220),
  });
});

/* ---------------- MW14 (H1 + N1): Time-aware 15m-bucket hub summary cache & cold budget ---------------- */
await pin('MW14. H1/N1: Hub summary cache performs 1 synth within 15m bucket (0 on per-minute ticks inside window), 1 recompute past 15m, 0 on Now panel, & 5-load cold < 1000 ms', async () => {
  if (typeof A.getWeekHubSummary !== 'function' || typeof A.getWeekSynthesisCount !== 'function') {
    return 'H1 hub cache / synthesis counter helpers missing';
  }
  // (a) Time-aware 15-minute bucket cache:
  //     - Repeated calls & per-minute ticks INSIDE the 15-minute bucket (NOW_SEC_D, +0, +1, +14) -> 1 synthesis
  //     - Advancing past the 15-minute window (+15) -> exactly 1 recompute (count = 2)
  //     - Per-minute tick inside the new window (+16) -> 0 extra syntheses (still count = 2)
  A.clearWeekHubCache();
  A.resetWeekSynthesisCount();
  const baseInput = {
    segments: SEC_D_SEGS,
    current: { status: 'OFF', since: chi(10, 8, 0) },
    now: NOW_SEC_D,
    config: cfgChi70,
    mph: 55,
    draft: SEC_D_DRAFT,
    historyBasis: 'known',
  };
  const h1 = A.getWeekHubSummary(baseInput);
  const h2 = A.getWeekHubSummary(baseInput);
  const h3 = A.getWeekHubSummary({ ...baseInput, now: NOW_SEC_D + 1 });
  const h4 = A.getWeekHubSummary({ ...baseInput, now: NOW_SEC_D + 14 });
  const countWithinWindow = A.getWeekSynthesisCount();
  const h5 = A.getWeekHubSummary({ ...baseInput, now: NOW_SEC_D + 15 });
  const countAfterWindow = A.getWeekSynthesisCount();
  const h6 = A.getWeekHubSummary({ ...baseInput, now: NOW_SEC_D + 16 });
  const countInNextWindow = A.getWeekSynthesisCount();

  // (b) Non-Plan panel (Now tab) does NOT trigger synthesizeWeek on minute tick / state update (real render)
  await seed({ tab: 'now', weekPlan: SEC_D_DRAFT, current: { status: 'OFF', since: chi(10, 8, 0) } });
  A.clearWeekHubCache();
  A.resetWeekSynthesisCount();
  setState({ nowOverride: NOW_SEC_D + 1 });
  await sleep(60);
  setState({ nowOverride: NOW_SEC_D + 2 });
  await sleep(60);
  setState({ nowOverride: NOW_SEC_D + 20 }); // even crossing a 15m bucket on Now tab performs 0 syntheses!
  await sleep(60);
  const countOnNowPanel = A.getWeekSynthesisCount();

  // Cold synthesis of the 5-load Section D fixture completes within 1000 ms budget
  const loads5 = [
    ...SEC_D_DRAFT.loads.slice(0, 2),
    makeLoad({ id: 'l3', label: 'L3', miles: 550, hasAppt: true, apptDate: '2026-11-13', apptTime: '09:00', apptTimeZone: 'America/Chicago' }),
    makeLoad({ id: 'l4', label: 'L4', miles: 600, hasAppt: true, apptDate: '2026-11-14', apptTime: '09:00', apptTimeZone: 'America/Chicago' }),
    makeLoad({ id: 'l5', label: 'L5', miles: 500, dockMinutes: 30 }),
  ];
  const draft5 = makeDraft({ loads: loads5, homeTarget: { date: '2026-11-16', time: '09:00' } });
  const t0 = performance.now();
  const syn5 = A.synthesizeWeek({ segments: SEC_D_SEGS, now: NOW_SEC_D, config: cfgChi70, mph: 55, draft: draft5, historyBasis: 'known' });
  const coldMs = performance.now() - t0;
  const cacheOk = countWithinWindow === 1
    && countAfterWindow === 2
    && countInNextWindow === 2
    && h1.hubSummary === h2.hubSummary
    && h1.hubSummary === h3.hubSummary
    && h1.hubSummary === h4.hubSummary
    && h5.hubSummary === h6.hubSummary
    && countOnNowPanel === 0;
  const budgetOk = syn5.activeLoadCount === 5 && coldMs < 1000;

  return (cacheOk && budgetOk) || JSON.stringify({
    countWithinWindow, countAfterWindow, countInNextWindow, countOnNowPanel, coldMs: Number(coldMs.toFixed(1)), activeLoads: syn5.activeLoadCount,
  });
});

/* ---------------- MW15 (M6 + L1 + L4 + L7): store.ts st2.mjs repairs, draftResets, id dedupe, canonical tz, old SIM quarantine ---------------- */
await pin('MW15. M6/L1/L4/L7: st2 damaged fields report draftResets & invalid apptTime drops appt; L1 dedupes ids; L4 canonicalizes tz; L7 old SIM quarantines weekPlan', async () => {
  const base = S.sanitizeWeekPlan({
    loads: [{ id: 'a', hasAppt: true, apptDate: '2026-11-20', apptTime: '06:30', apptTimeZone: 'America/New_York' }],
  });
  const exp = JSON.parse(S.exportState({ ...S.INITIAL_STATE, weekPlan: base }));
  const cases = {
    badDate: { patch: { apptDate: '2026-02-30' }, check: (g) => g.hasAppt === false && g.apptDate === '' },
    badTime: { patch: { apptTime: '25:99' }, check: (g) => g.hasAppt === false },
    bigBuffer: { patch: { bufferMinutes: 999 }, check: (g) => g.bufferMinutes === 240 },
    bigPre: { patch: { preTripMinutes: 999 }, check: (g) => g.preTripMinutes === 180 },
    badMode: { patch: { distanceMode: 'km' }, check: (g) => g.distanceMode === 'miles' },
    longLabel: { patch: { label: 'z'.repeat(80) }, check: (g) => g.label.length === 40 },
  };
  const st2Fails = [];
  for (const [k, spec] of Object.entries(cases)) {
    const d = { ...exp, weekPlan: { ...exp.weekPlan, loads: [{ ...exp.weekPlan.loads[0], ...spec.patch }] } };
    const got = S.applyImportedState(S.INITIAL_STATE, d).weekPlan.loads[0];
    const resets = S.draftResets(d, S.INITIAL_STATE);
    if (!spec.check(got) || !resets.includes('My Week plan')) {
      st2Fails.push({ k, resets, got });
    }
  }

  // L1: duplicate ids deduped even when colliding with `load-${idx+1}-${usedIds.size+1}`
  const dup = S.sanitizeWeekPlan({ loads: [{ id: 'load-2-2' }, { id: 'load-2-2' }] });
  const dupResets = S.draftResets({ segments: [], weekPlan: { loads: [{ id: 'load-2-2' }, { id: 'load-2-2' }] } }, S.INITIAL_STATE);
  const l1Ok = dup.loads.length === 2 && dup.loads[0].id !== dup.loads[1].id && dupResets.includes('My Week plan');

  // L4: lowercase tz canonicalized to Intl-resolved casing so sameZone works
  const tzNorm = S.sanitizeWeekPlan({
    loads: [{ id: 'tz1', hasAppt: true, apptDate: '2026-11-20', apptTime: '08:00', apptTimeZone: 'america/new_york' }],
  });
  const l4Ok = tzNorm.loads[0].apptTimeZone === 'America/New_York';

  // L7: old SIM_KEY record WITHOUT weekPlan still discards simulated weekPlan edits on useRealClock()
  setState({ nowOverride: NOW_SEC_D, weekPlan: SEC_D_DRAFT });
  const oldSnap = {
    record: { segments: [], tentative: [], current: null, dayCloses: {}, historyAcknowledged: true, config: cfgChi70, seededAt: null, tzChosen: true },
  };
  localStorage.setItem(S.SIM_KEY, JSON.stringify(oldSnap));
  A.useRealClock();
  const l7Ok = getState().nowOverride === null && getState().weekPlan.loads.length === 0;

  return (st2Fails.length === 0 && l1Ok && l4Ok && l7Ok) || JSON.stringify({
    st2Fails, l1Ok, dupIds: dup.loads.map((l) => l.id), l4Ok, tzGot: tzNorm.loads[0].apptTimeZone, l7Ok,
  });
});

/* ---------------- MW16 (M3 + L8 split): allowSplits=false hides Rescue drill-down on load cards ---------------- */
await pin('MW16. M3/L8: allowSplits=false hides "Dock delayed? Open Rescue" on load cards; split loads hide "10h break ends"', async () => {
  // First verify L8 on split load (MW4 clean split fixture)
  const NOW_S = chi(9, 6, 0);
  const FRESH_SEGS = makeContinuousLog([{ status: 'OFF', start: chi(8, 18, 0), end: NOW_S }], NOW_S);
  const SPLIT_DRAFT = makeDraft({
    allowSplits: true, fillOpenNights: false, defaultBufferMinutes: 0,
    loads: [
      makeLoad({ id: 's1', label: 'Leg 1', miles: 275, mph: 55, hasAppt: true, apptDate: '2026-11-09', apptTime: '11:15', apptTimeZone: 'America/Chicago', dockMinutes: 120, preTripMinutes: 15, bufferMinutes: 0 }),
      makeLoad({ id: 's2', label: 'Leg 2', miles: 330, mph: 55, hasAppt: true, apptDate: '2026-11-10', apptTime: '02:30', apptTimeZone: 'America/Chicago', dockMinutes: 0, preTripMinutes: 15, bufferMinutes: 0 }),
    ],
  });
  await seed({ nowOverride: NOW_S, segments: FRESH_SEGS, weekPlan: SPLIT_DRAFT });
  await openMyWeekViaCapstone();
  const s2Card = all((n) => n.attributes?.['data-myweek-load-card'] === 's2', planRoom())[0];
  const splitHides10h = Boolean(s2Card && s2Card.attributes?.['data-myweek-split'] !== 'none' && !/10h break ends/.test(s2Card.textContent));

  // M3: expand s2 with allowSplits=true -> Rescue button visible; toggle Straight 10s only -> Rescue button hidden!
  const s2Head = s2Card ? all((n) => n.localName === 'button' && has(n, 'mw-load-head'), s2Card)[0] : null;
  if (!s2Head) return 'missing s2 expand button';
  fire(s2Head, 'click');
  await sleep(60);
  const rescueShown = Boolean(all((n) => n.localName === 'button' && n.attributes?.['data-myweek-drill-rescue'] === 's2', planRoom())[0]);
  const rolloutShownBefore = Boolean(all((n) => n.localName === 'button' && n.attributes?.['data-myweek-drill-rollout'] === 's2', planRoom())[0]);

  const noBtn = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-splits-no'] === '1', planRoom())[0];
  if (!noBtn) return 'missing Straight 10s only button';
  fire(noBtn, 'click');
  await sleep(70);

  const rescueHidden = !all((n) => n.localName === 'button' && n.attributes?.['data-myweek-drill-rescue'] === 's2', planRoom())[0];
  const rolloutStillShown = Boolean(all((n) => n.localName === 'button' && n.attributes?.['data-myweek-drill-rollout'] === 's2', planRoom())[0]);

  return (splitHides10h && rescueShown && rolloutShownBefore && rescueHidden && rolloutStillShown) || JSON.stringify({
    splitHides10h, rescueShown, rolloutShownBefore, rescueHidden, rolloutStillShown,
  });
});

/* ---------------- MW17 (N1 + N2 + NIT): hubstale tracking, neutral PlanTab placeholder, restart-wait label ---------------- */
await pin('MW17. N1/N2/NIT: hubstale (+0/+60/+120/+240m) tracks fresh verdict (pure + DOM); PlanTab inactive placeholder is neutral "Review" (never "All clear" or stale); SEED=383857408 restart wait labeled accurately', async () => {
  // (a) N1: Opus hubstale.mjs fixture — fresh driver, 300mi load with Mon 19:00 CT appt, OFF since Thu, T0 = Mon 12:00 CT
  const T0 = chi(16, 12, 0);
  const SEGS_HS = [{ status: 'D', start: chi(12, 1, 0), end: chi(12, 2, 0), createdAt: 1 }];
  const curHS = { status: 'OFF', since: chi(12, 2, 0) };
  const draftHS = makeDraft({
    loads: [makeLoad({ id: 'a', label: 'Evening drop', miles: 300, hasAppt: true, apptDate: '2026-11-16', apptTime: '19:00', apptTimeZone: 'America/Chicago' })],
  });
  A.clearWeekHubCache();
  A.resetWeekSynthesisCount();
  const hsRows = [];
  for (const dt of [0, 60, 120, 240]) {
    const nowT = T0 + dt;
    const hub = A.getWeekHubSummary({ segments: SEGS_HS, current: curHS, now: nowT, config: cfgChi70, mph: 55, draft: draftHS, historyBasis: 'known' });
    const fresh = A.synthesizeWeek({ segments: [...SEGS_HS, { status: 'OFF', start: curHS.since, end: nowT }], now: nowT, config: cfgChi70, mph: 55, draft: draftHS, historyBasis: 'known' });
    hsRows.push({ dt, hubStatus: hub.verdictStatus, freshStatus: fresh.verdict.status, hubSummary: hub.hubSummary });
  }
  const pureStaleOk = hsRows.every((r) => r.hubStatus === r.freshStatus)
    && hsRows.find((r) => r.dt === 120)?.hubStatus === 'conflict'
    && hsRows.find((r) => r.dt === 240)?.hubStatus === 'conflict';

  // DOM check for hubstale: render PlanTab at +0 (Tight), advance clock to +120 and +240 -> capstone pill flips to Conflict!
  A.clearWeekHubCache();
  await seed({ tab: 'plan', nowOverride: T0, segments: SEGS_HS, current: curHS, config: cfgChi70, weekPlan: draftHS });
  const cap0 = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-entry'] === '1', planPage())[0];
  const pill0 = cap0 ? all((n) => has(n, 'plan-capstone-pill'), cap0)[0]?.textContent : '';
  setState({ nowOverride: T0 + 120 });
  await sleep(60);
  const cap120 = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-entry'] === '1', planPage())[0];
  const pill120 = cap120 ? all((n) => has(n, 'plan-capstone-pill'), cap120)[0]?.textContent : '';
  setState({ nowOverride: T0 + 240 });
  await sleep(60);
  const cap240 = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-entry'] === '1', planPage())[0];
  const pill240 = cap240 ? all((n) => has(n, 'plan-capstone-pill'), cap240)[0]?.textContent : '';
  const domStaleOk = pill0 === 'Tight' && pill120 === 'Conflict' && pill240 === 'Conflict';

  // (b) N2: PlanTab inactive/no-cache placeholder must be neutral ("Review", no tone-good, never "All clear"),
  //     and a plan change while off Plan must NOT leave lastHubRef showing the previous plan's verdict.
  //     Reset lastHubRef via empty plan first, then mount on Now tab with a conflict week.
  await seed({ tab: 'now', nowOverride: T0 + 120, segments: SEGS_HS, current: curHS, config: cfgChi70, weekPlan: makeDraft({ loads: [] }) });
  A.clearWeekHubCache();
  A.resetWeekSynthesisCount();
  setState({ weekPlan: draftHS });
  await sleep(60);
  const capCold = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-entry'] === '1', planPage())[0];
  const pillCold = capCold ? all((n) => has(n, 'plan-capstone-pill'), capCold)[0] : null;
  const coldPlaceholderOk = Boolean(
    capCold
    && pillCold
    && pillCold.textContent === 'Review'
    && !has(capCold, 'tone-good') && !has(capCold, 'tone-warn') && !has(capCold, 'tone-bad')
    && !/All clear/i.test(capCold.textContent)
    && /1 load planned — tap to review/i.test(capCold.textContent)
    && A.getWeekSynthesisCount() === 0,
  );
  // Activate Plan tab -> computes Conflict; switch back to Now tab and edit plan -> reverts to neutral Review (0 extra synth)!
  setState({ tab: 'plan' });
  await sleep(60);
  const pillActive = all((n) => has(n, 'plan-capstone-pill'), planPage())[0]?.textContent;
  setState({ tab: 'now' });
  await sleep(60);
  A.resetWeekSynthesisCount();
  setState({ weekPlan: SEC_D_DRAFT });
  await sleep(60);
  const capAfterOffPlanEdit = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-entry'] === '1', planPage())[0];
  const pillAfterEdit = capAfterOffPlanEdit ? all((n) => has(n, 'plan-capstone-pill'), capAfterOffPlanEdit)[0] : null;
  const offPlanInvalidationOk = pillActive === 'Conflict'
    && pillAfterEdit?.textContent === 'Review'
    && !has(capAfterOffPlanEdit, 'tone-bad') && !has(capAfterOffPlanEdit, 'tone-good')
    && /3 loads planned — tap to review/i.test(capAfterOffPlanEdit?.textContent || '')
    && A.getWeekSynthesisCount() === 0;

  // (c) NIT: SEED=383857408 recaps lane X1 hold (697m ending at 34h restart completion) labeled as restart wait, NOT 18:40 midnight gate
  const c38 = generateFuzzCase(383857408);
  const syn38 = A.synthesizeWeek({ segments: c38.SEGS, now: c38.NOW, config: c38.cfg, mph: 55, draft: c38.draft, historyBasis: c38.basis });
  const x1 = syn38.recaps.loads[0];
  await seed({ nowOverride: c38.NOW, segments: c38.SEGS, config: c38.cfg, weekPlan: c38.draft });
  await openMyWeekViaCapstone();
  const btnRec = all((n) => n.localName === 'button' && n.attributes?.['data-myweek-strat'] === 'recaps', planRoom())[0];
  if (btnRec) { fire(btnRec, 'click'); await sleep(60); }
  const x1Card = all((n) => n.attributes?.['data-myweek-load-card'] === 'x0', planRoom())[0];
  const restartLabelOk = x1.midnightGateMinutes === 697
    && x1.midnightGateKind === 'restart34'
    && x1.midnightGateBoundary?.homeShort === x1.rollOut.homeShort
    && !/18:40/.test(x1.midnightGateBoundary?.homeShort || '')
    && Boolean(x1Card && /34h restart wait/i.test(x1Card.textContent) && !/for 18:40/i.test(x1Card.textContent));

  return (pureStaleOk && domStaleOk && coldPlaceholderOk && offPlanInvalidationOk && restartLabelOk) || JSON.stringify({
    pureStaleOk, hsRows, domStaleOk, pill0, pill120, pill240,
    coldPlaceholderOk, offPlanInvalidationOk, pillActive, pillAfterEdit: pillAfterEdit?.textContent,
    restartLabelOk, x1Gate: x1.midnightGateMinutes, x1Kind: x1.midnightGateKind, x1Bound: x1.midnightGateBoundary?.homeShort, x1CardTxt: x1Card?.textContent?.slice(0, 180),
  });
});

/* ---------------- MW18 (H5): Outcomes-only trap suite (SEED=2004807488 NO trap + genuine dock-60 ON trap + independent evaluate() check allowing SB from arrival) ---------------- */
await pin('MW18. H5: SEED=2004807488 NO trap (split kept on X2) & genuine dock-60 ON trap fires with independent evaluate() proof allowing SB from arrival', async () => {
  // (a) SEED=2004807488 (allowSplits forced true, matching Opus trapsweep.mjs):
  //     X3 arrives Wed 21:06 (3h 06m late) on BOTH paths; split gets X2 there on time while straight-10 makes X2 1h 06m late -> NO trap!
  const c200 = generateFuzzCase(2004807488);
  const draft200 = { ...c200.draft, allowSplits: true };
  const syn200 = A.synthesizeWeek({ segments: c200.SEGS, now: c200.NOW, config: c200.cfg, mph: 55, draft: draft200, historyBasis: c200.basis });
  const seed200Ok = !syn200.conflicts.some((c) => c.kind === 'split_trap')
    && syn200.recaps.loads[1].usedSplit === true
    && syn200.recaps.loads[1].meetsAppt === true
    && syn200.recaps.loads[1].splitTrapDetected === false;

  // (b) Independent brute-force evaluate() proof on the genuine dock-60 ON-duty trap fixture:
  //     Leg 2 has 60m ON-duty dock (Mon 22:30–23:30), Leg 3 appt Tue 10:00.
  //     The brute-force checker searches ALL legal split schedules — including SB starting AT ARRIVAL
  //     (mirroring engine evaluate() directly, never restricted to the planner's own prefix).
  //     Because the 60m ON-duty dock interrupts any continuous SB at 22:30–23:30:
  //       - Any legal split -> Leg 3 earliest legal arrival = Tue 11:45 (1h 45m late, 105m).
  //       - Straight-10 -> Leg 3 earliest legal arrival = Tue 09:45 (on time, 0m late vs Tue 10:00).
  const NOW_G = chi(9, 6, 0);
  const SEGS_G = makeContinuousLog([{ status: 'OFF', start: chi(8, 18, 0), end: NOW_G }], NOW_G);
  const mkLeg = (o) => makeLoad({ mph: 55, preTripMinutes: 15, bufferMinutes: 0, apptTimeZone: 'America/Chicago', hasAppt: true, ...o });
  const draftG = makeDraft({
    allowSplits: true, fillOpenNights: false, defaultBufferMinutes: 0,
    loads: [
      mkLeg({ id: 'g1', label: 'Leg 1', miles: 330, apptDate: '2026-11-09', apptTime: '12:15', dockMinutes: 120 }),
      mkLeg({ id: 'g2', label: 'Leg 2', miles: 165, apptDate: '2026-11-09', apptTime: '22:30', dockMinutes: 60, dockOff: false }),
      mkLeg({ id: 'g3', label: 'Leg 3', miles: 275, apptDate: '2026-11-10', apptTime: '10:00', dockMinutes: 0 }),
    ],
  });
  const synG = A.synthesizeWeek({ segments: SEGS_G, now: NOW_G, config: cfgChi70, mph: 55, draft: draftG, historyBasis: 'known' });
  const synSplit2 = A.synthesizeWeek({ segments: SEGS_G, now: NOW_G, config: cfgChi70, mph: 55, draft: { ...draftG, loads: draftG.loads.slice(0, 2) }, historyBasis: 'known' });

  const prunedG = E.pruneHistory(SEGS_G, NOW_G, cfgChi70);
  const stripT = (arr) => arr.map(({ tentative: _t, ...r }) => r);
  const leg1Segs = stripT(synG.recaps.loads[0].simSegments);
  const leg1End = Math.max(...leg1Segs.map((s) => s.end));
  const apptLeg2 = chi(9, 22, 30);
  const apptLeg3 = chi(10, 10, 0);

  // Independent brute force over ALL split schedules (2h/3h short-first, SB or OFF during early wait,
  // SB from arrival when dock-free, or SB after mandatory ON-duty dock when dock is ON).
  const earliestLeg3AnySplit = (dock2, dockOff2) => {
    let best = Infinity;
    for (const shortMin of [120, 180]) {
      for (const preStatus of ['OFF', 'SB']) {
        const roll2 = leg1End + shortMin;
        const arr2 = roll2 + 15 + 180;
        if (arr2 > apptLeg2) continue;
        const base = [
          ...prunedG,
          ...leg1Segs,
          { status: preStatus, start: leg1End, end: roll2 },
          { status: 'ON', start: roll2, end: roll2 + 15 },
          { status: 'D', start: roll2 + 15, end: arr2 },
        ];
        if (dock2 === 0 || dockOff2) {
          // Dock-free: allow SB (or OFF) starting AT ARRIVAL so it absorbs early wait + OFF dock
          const minEnd = Math.max(arr2, apptLeg2) + dock2;
          for (const waitStatus of ['SB', 'OFF']) {
            for (let x = minEnd; x < arr2 + 24 * 60; x += 5) {
              if (x + 315 >= best) break;
              const tail = [{ status: waitStatus, start: arr2, end: x }, { status: 'ON', start: x, end: x + 15 }, { status: 'D', start: x + 15, end: x + 315 }];
              const ev = E.evaluate([...base, ...tail], { asOf: x + 315, config: cfgChi70 });
              if (!ev.violations.some((v) => v.end > NOW_G)) { best = x + 315; break; }
            }
          }
        } else {
          // ON-duty dock at [apptLeg2, apptLeg2 + dock2]: allow SB or OFF before dock, SB or OFF after dock
          const dockEnd = apptLeg2 + dock2;
          for (const beforeStatus of ['SB', 'OFF']) {
            for (const afterStatus of ['SB', 'OFF']) {
              for (let x = dockEnd; x < dockEnd + 24 * 60; x += 5) {
                if (x + 315 >= best) break;
                const mid = [
                  ...(apptLeg2 > arr2 ? [{ status: beforeStatus, start: arr2, end: apptLeg2 }] : []),
                  { status: 'ON', start: apptLeg2, end: dockEnd },
                  ...(x > dockEnd ? [{ status: afterStatus, start: dockEnd, end: x }] : []),
                ];
                const tail = [{ status: 'ON', start: x, end: x + 15 }, { status: 'D', start: x + 15, end: x + 315 }];
                const ev = E.evaluate([...base, ...mid, ...tail], { asOf: x + 315, config: cfgChi70 });
                if (!ev.violations.some((v) => v.end > NOW_G)) { best = x + 315; break; }
              }
            }
          }
        }
      }
    }
    return best;
  };

  const earliestLeg3FromPrefix = (prefix) => {
    const hist = [...prunedG, ...stripT(prefix)];
    const pta = Math.max(NOW_G, ...hist.map((s) => s.end));
    for (let x = pta; x < pta + 36 * 60; x++) {
      const tail = [{ status: 'OFF', start: pta, end: x }, { status: 'ON', start: x, end: x + 15 }, { status: 'D', start: x + 15, end: x + 315 }].filter((s) => s.end > s.start);
      const ev = E.evaluate([...hist, ...tail], { asOf: x + 315, config: cfgChi70 });
      if (!ev.violations.some((v) => v.end > NOW_G)) return x + 315;
    }
    return Infinity;
  };

  const arrSplitBest = earliestLeg3AnySplit(60, false);
  const arrStraight = earliestLeg3FromPrefix(synG.recaps.loads.slice(0, 2).flatMap((o) => o.simSegments));
  const trapG = synG.conflicts.find((c) => c.kind === 'split_trap');
  const genuineTrapOk = synSplit2.recaps.loads[1].usedSplit === true
    && arrStraight <= apptLeg3
    && arrSplitBest > apptLeg3
    && (arrSplitBest - apptLeg3) === 105
    && Boolean(trapG && /1h 45m/.test(trapG.priceLabel) && /7h 00m split SB/i.test(trapG.priceLabel) && !/required/i.test(trapG.body))
    && synG.recaps.loads[1].splitTrapDetected === true
    && synG.recaps.loads[1].usedSplit === false
    && synG.recaps.loads[2].meetsAppt === true;

  return (seed200Ok && genuineTrapOk) || JSON.stringify({
    seed200Ok, genuineTrapOk,
    s200Traps: syn200.conflicts.filter((c) => c.kind === 'split_trap').length,
    s200L1: { split: syn200.recaps.loads[1].usedSplit, meets: syn200.recaps.loads[1].meetsAppt },
    arrSplitBestLate: arrSplitBest - apptLeg3, arrStraightLate: arrStraight - apptLeg3,
    trapG: trapG ? { price: trapG.priceLabel, body: trapG.body } : null,
  });
});

/* ---------------- MW19 (H5): Dock-free early-wait SB absorption NO-trap pin ---------------- */
await pin('MW19. H5: Dock-0 & dock-OFF early-wait split absorbs wait into trailing SB -> NO trap, split kept, Leg 2 on time, Leg 3 on time (earliest legal Tue 08:45, 15m early)', async () => {
  const NOW_D0 = chi(9, 6, 0);
  const SEGS_D0 = makeContinuousLog([{ status: 'OFF', start: chi(8, 18, 0), end: NOW_D0 }], NOW_D0);
  const mkLeg = (o) => makeLoad({ mph: 55, preTripMinutes: 15, bufferMinutes: 0, apptTimeZone: 'America/Chicago', hasAppt: true, ...o });

  // (a) Dock-0 fixture (Opus trapfix): Leg 2 arrives Mon 19:30 (3h early before Mon 22:30), dock 0.
  //     Trailing 8h SB starts AT ARRIVAL (Mon 19:30 -> Tue 03:30), absorbing the 3h early wait.
  //     NO trap fires, split is kept, Leg 2 on time (+180m slack), Leg 3 on time (Tue 09:00 with 0m buffer;
  //     and with 15m buffer or earliest-legal brute-force, Leg 3 lands Tue 08:45 — 15m early!).
  const draftDock0 = makeDraft({
    allowSplits: true, fillOpenNights: false, defaultBufferMinutes: 0,
    loads: [
      mkLeg({ id: 'd1', label: 'Leg 1', miles: 330, apptDate: '2026-11-09', apptTime: '12:15', dockMinutes: 120 }),
      mkLeg({ id: 'd2', label: 'Leg 2', miles: 165, apptDate: '2026-11-09', apptTime: '22:30', dockMinutes: 0 }),
      mkLeg({ id: 'd3', label: 'Leg 3', miles: 275, apptDate: '2026-11-10', apptTime: '09:00', dockMinutes: 0 }),
    ],
  });
  const synD0 = A.synthesizeWeek({ segments: SEGS_D0, now: NOW_D0, config: cfgChi70, mph: 55, draft: draftDock0, historyBasis: 'known' });
  const [l1, l2, l3] = synD0.recaps.loads;
  const sbSeg = l2.simSegments.find((s) => s.status === 'SB');
  const noEarlyWaitOff = !l2.simSegments.some((s) => /early wait/.test(s.note || '') && s.status === 'OFF');
  const sbStartsAtArrival = Boolean(sbSeg && sbSeg.start === l2.arrival.minute && sbSeg.end === l2.arrival.minute + 480);

  // Independent engine evaluate() audit of the full chained dock-0 timeline
  const prunedD0 = E.pruneHistory(SEGS_D0, NOW_D0, cfgChi70);
  const stripT = (arr) => arr.map(({ tentative: _t, ...r }) => r);
  const evD0 = E.evaluate([...prunedD0, ...stripT(synD0.recaps.simSegments)], { asOf: synD0.recaps.endMinute, config: cfgChi70 });
  const d0Viols = evD0.violations.filter((v) => v.start >= NOW_D0);

  // Earliest legal arrival for Leg 3 after Leg 2's SB-from-arrival prefix = Tue 08:45 (15m early)
  const prefix2 = [...prunedD0, ...stripT(l1.simSegments), ...stripT(l2.simSegments)];
  const evEarliest845 = E.evaluate(
    [...prefix2, { status: 'ON', start: l2.pta.minute, end: l2.pta.minute + 15 }, { status: 'D', start: l2.pta.minute + 15, end: l2.pta.minute + 315 }],
    { asOf: l2.pta.minute + 315, config: cfgChi70 },
  );
  const earliest845Ok = (l2.pta.minute + 315) === chi(10, 8, 45)
    && !evEarliest845.violations.some((v) => v.end > NOW_D0);

  // Also with 15m buffer on Leg 3, the planner itself lands Leg 3 at Tue 08:45 (+15m early)
  const draftDock0Buf15 = { ...draftDock0, loads: [draftDock0.loads[0], draftDock0.loads[1], { ...draftDock0.loads[2], bufferMinutes: 15 }] };
  const synD0Buf15 = A.synthesizeWeek({ segments: SEGS_D0, now: NOW_D0, config: cfgChi70, mph: 55, draft: draftDock0Buf15, historyBasis: 'known' });
  const buf15Lands845 = !synD0Buf15.conflicts.some((c) => c.kind === 'split_trap')
    && synD0Buf15.recaps.loads[1].usedSplit === true
    && synD0Buf15.recaps.loads[2].arrival.minute === chi(10, 8, 45)
    && synD0Buf15.recaps.loads[2].apptSlackMinutes === 15;

  const dock0Ok = !synD0.conflicts.some((c) => c.kind === 'split_trap')
    && l2.usedSplit === true
    && l2.splitTrapDetected === false
    && l2.meetsAppt === true
    && l2.arrival.minute === chi(9, 19, 30)
    && l2.pta.minute === chi(10, 3, 30)
    && noEarlyWaitOff
    && sbStartsAtArrival
    && l3.meetsAppt === true
    && l3.apptSlackMinutes === 0
    && d0Viols.length === 0
    && earliest845Ok
    && buf15Lands845;

  // (b) Dock-OFF (60m OFF-duty dock) fixture: SB from arrival (19:30 -> Tue 03:30) absorbs BOTH early wait
  //     and the 60m OFF dock (22:30 -> 23:30) -> still NO trap, split kept, Leg 2 & Leg 3 on time!
  const draftDockOff = {
    ...draftDock0,
    loads: [draftDock0.loads[0], { ...draftDock0.loads[1], dockMinutes: 60, dockOff: true }, draftDock0.loads[2]],
  };
  const synDOff = A.synthesizeWeek({ segments: SEGS_D0, now: NOW_D0, config: cfgChi70, mph: 55, draft: draftDockOff, historyBasis: 'known' });
  const dockOffOk = !synDOff.conflicts.some((c) => c.kind === 'split_trap')
    && synDOff.recaps.loads[1].usedSplit === true
    && synDOff.recaps.loads[1].meetsAppt === true
    && synDOff.recaps.loads[1].pta.minute === chi(10, 3, 30)
    && synDOff.recaps.loads[2].meetsAppt === true
    && synDOff.recaps.violations.length === 0;

  return (dock0Ok && dockOffOk) || JSON.stringify({
    dock0Ok, dockOffOk,
    traps: synD0.conflicts.filter((c) => c.kind === 'split_trap').length,
    l2: { split: l2.usedSplit, trap: l2.splitTrapDetected, arr: l2.arrival.homeShort, pta: l2.pta.homeShort, sbStartsAtArrival, noEarlyWaitOff },
    l3: { arr: l3.arrival.homeShort, slack: l3.apptSlackMinutes },
    earliest845Ok, buf15Lands845, d0Viols: d0Viols.length,
    dOffTraps: synDOff.conflicts.filter((c) => c.kind === 'split_trap').length,
  });
});

let fail = 0;
for (const [st, name, why] of res) {
  console.log(`${st.padEnd(5)} ${name}${why ? '\n      ' + why : ''}`);
  if (st === 'FAIL') fail++;
}
console.log(`\n${res.length - fail}/${res.length} myweek pins passed`);
process.exit(fail ? 1 : 0);

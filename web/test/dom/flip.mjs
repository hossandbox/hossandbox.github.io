// Flip My Clock — Shift-Start & Schedule-Flip Bridge Planner (Plan tool #11 / Spec #4).
// Pins FL1–FL12: Option A exact roll-out & evaluate() clock parity, Option B valid split-sleeper
// slide (violation-free in evaluate() with exact segment times & post-slide clocks) and absence
// when no valid slide exists, Option C tight-cycle-only midnight / custom carrier-day recap
// bridge with engine cycle parity, preset chips (21:00 Night, 00:01 Midnight Recap, 03:00 Early Bird),
// shared ClockPick for custom target & shutdown edit (zero <input type="time"> on FlipTab),
// standing non-medical framing line, Plan hub 11th-item placement, zero new localStorage keys,
// plus FL9 (F1 future-shutdown driving legality & assumption line), FL10 (F2/F6 >=24h rest default
// shutdown & actual rest start), FL11 (F3 DST fall-back repeated hour & F4 spring-forward gap note),
// and FL12 (F5 Option B Leg 1 label honesty with already-logged rest).
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
let Tms = new Date(2026, 10, 10, 12, 0, 0).getTime();
Date.now = () => Tms;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'flip';
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
const F = await import('../../src/flip.ts');
const E = await import('../../../engine/src/index.ts');

const { App, setLaunchNotice, openSheet } = A;
const { setState } = S;
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

const STANDING = 'Rest windows only — this plans legal start times, not sleep advice.';
const cfgChi = { ...S.INITIAL_STATE.config, cycle: '70/8', dayStartHour: 0, dayStartMinute: 0, timeZone: 'America/Chicago', shortHaul: false };
const chi = (d, h0, m0 = 0) => E.localToMinute(2026, 11, d, h0, 'America/Chicago') + m0;

// Mid-shift fixture (valid split slide exists for 03:00 target):
// - 10h OFF reset Mon Nov 9 20:00 -> Tue Nov 10 06:00 CST
// - D Tue 06:00 -> 11:00 (5h), ON Tue 11:00 -> 12:00 (1h), now = Tue 12:00 CST
// - At Tue 12:00: driveUsed = 5h (6h left), windowUsed = 6h (8h left), cycleUsed = 6h (64h left).
const NOW_1200 = chi(10, 12, 0);
const MID_SHIFT_SEGS = [
  { status: 'OFF', start: chi(9, 20, 0), end: chi(10, 6, 0), createdAt: 1 },
  { status: 'D', start: chi(10, 6, 0), end: chi(10, 11, 0), createdAt: 2 },
  { status: 'ON', start: chi(10, 11, 0), end: NOW_1200, createdAt: 3 },
];

const seed = async (rec = {}) => {
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
    tab: 'plan',
    nowOverride: NOW_1200,
    segments: MID_SHIFT_SEGS,
    tentative: [],
    current: null,
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
const planRoom = () => all((n) => n.localName === 'section' && has(n, 'plan-room'))[0];

const openFlipViaHub = async () => {
  const pg = planPage();
  const items = all((n) => n.localName === 'button' && has(n, 'plan-item'), pg);
  const btn = items.find((b) => /Flip My Clock/.test(b.textContent));
  if (!btn) return null;
  fire(btn, 'click');
  await sleep(60);
  return { items, btn, rm: planRoom() };
};

const tapPreset = async (id) => {
  const rm = planRoom();
  const btn = all((n) => n.localName === 'button' && n.attributes?.['data-flip-preset'] === id, rm)[0];
  if (!btn) throw new Error(`missing preset button ${id}`);
  fire(btn, 'click');
  await sleep(50);
  return planRoom();
};

const readCard = (rm, code) => all((n) => n.attributes?.['data-flip-card'] === code, rm)[0] ?? null;

/* ---------------- FL1: Option A exact roll-out, rest cost, and evaluate() clock parity ---------------- */
await pin('FL1. Option A (Extended Break): lands roll-out exactly on target with total/extra rest cost and fresh clocks matching evaluate()', async () => {
  await seed();
  const opened = await openFlipViaHub();
  if (!opened) return 'Could not open Flip My Clock';

  const rm = await tapPreset('early'); // 03:00 Early Bird -> Wed Nov 11 03:00 CST (15h total, +5h extra)
  const cardA = readCard(rm, 'A');
  if (!cardA) return 'Option A card missing';

  const wantRollOut = chi(11, 3, 0);
  const evA = E.evaluate(
    [...MID_SHIFT_SEGS, { status: 'OFF', start: NOW_1200, end: wantRollOut, tentative: true }],
    { asOf: wantRollOut, config: cfgChi },
  );

  const gotRollOut = Number(cardA.attributes['data-flip-rollout']);
  const gotTotal = Number(cardA.attributes['data-flip-total-rest']);
  const gotExtra = Number(cardA.attributes['data-flip-extra-rest']);
  const gotDrive = Number(cardA.attributes['data-flip-drive']);
  const gotWin = Number(cardA.attributes['data-flip-window']);
  const gotCyc = Number(cardA.attributes['data-flip-cycle']);
  const costTxt = all((n) => n.attributes?.['data-flip-a-cost'] === '1', cardA)[0]?.textContent ?? '';

  // Also test exact bare-10h hit (shutdown Tue 11:00 -> target 21:00 => total 600m, extra 0m)
  // and +3h 30m extended break (shutdown Tue 07:30 -> target 21:00 => total 810m, extra 210m)
  const pExact10 = F.planFlipBridges({
    segments: [{ status: 'OFF', start: chi(9, 20, 0), end: chi(10, 6, 0), createdAt: 1 }, { status: 'D', start: chi(10, 6, 0), end: chi(10, 11, 0), createdAt: 2 }],
    now: chi(10, 11, 0),
    config: cfgChi,
    shutdownMinute: chi(10, 11, 0),
    targetHour: 21,
    targetMinute: 0,
  });
  const pExt330 = F.planFlipBridges({
    segments: [{ status: 'OFF', start: chi(9, 17, 0), end: chi(10, 3, 0), createdAt: 1 }, { status: 'D', start: chi(10, 3, 0), end: chi(10, 7, 30), createdAt: 2 }],
    now: chi(10, 7, 30),
    config: cfgChi,
    shutdownMinute: chi(10, 7, 30),
    targetHour: 21,
    targetMinute: 0,
  });

  const ok = gotRollOut === wantRollOut
    && gotTotal === 900 && gotExtra === 300
    && /15h 00m/.test(costTxt) && /\+5h 00m/.test(costTxt)
    && gotDrive === evA.shift.driveRemaining
    && gotWin === evA.shift.windowRemaining
    && gotCyc === evA.cycle.remaining
    && pExact10.optionA?.rollOutMinute === chi(10, 21, 0)
    && pExact10.optionA?.totalRestMinutes === 600
    && pExact10.optionA?.extraRestMinutes === 0
    && pExt330.optionA?.rollOutMinute === chi(10, 21, 0)
    && pExt330.optionA?.totalRestMinutes === 810
    && pExt330.optionA?.extraRestMinutes === 210;

  return ok || JSON.stringify({
    gotRollOut, wantRollOut, gotTotal, gotExtra, costTxt,
    gotClocks: { gotDrive, gotWin, gotCyc },
    wantClocks: { drive: evA.shift.driveRemaining, win: evA.shift.windowRemaining, cyc: evA.cycle.remaining },
    exact10: pExact10.optionA && { roll: pExact10.optionA.rollOutMinute, tot: pExact10.optionA.totalRestMinutes, ext: pExact10.optionA.extraRestMinutes },
    ext330: pExt330.optionA && { roll: pExt330.optionA.rollOutMinute, tot: pExt330.optionA.totalRestMinutes, ext: pExt330.optionA.extraRestMinutes },
  });
});

/* ---------------- FL2: Option B appears on valid slide fixture, violation-free in evaluate(), exact segments & clocks ---------------- */
await pin('FL2. Option B (Split-Sleeper Slide): appears when legal slide exists, violation-free in evaluate(), exact segment plan & clocks', async () => {
  await seed();
  await openFlipViaHub();
  const rm = await tapPreset('early'); // Tue 12:00 -> Wed 03:00 (15h = 7h SB + 5h D + 3h OFF)

  const cardB = readCard(rm, 'B');
  if (!cardB) return 'Option B card missing on valid split-slide fixture';

  const wantRollOut = chi(11, 3, 0);
  const slideSegs = [
    ...MID_SHIFT_SEGS,
    { status: 'SB', start: chi(10, 12, 0), end: chi(10, 19, 0), tentative: true },
    { status: 'D', start: chi(10, 19, 0), end: chi(11, 0, 0), tentative: true },
    { status: 'OFF', start: chi(11, 0, 0), end: chi(11, 3, 0), tentative: true },
  ];
  const evB = E.evaluate(slideSegs, { asOf: wantRollOut, config: cfgChi });

  const gotSplit = cardB.attributes['data-flip-split'];
  const gotRollOut = Number(cardB.attributes['data-flip-rollout']);
  const gotDriveLeg = Number(cardB.attributes['data-flip-drive-leg']);
  const gotDrive = Number(cardB.attributes['data-flip-drive']);
  const gotWin = Number(cardB.attributes['data-flip-window']);
  const gotCyc = Number(cardB.attributes['data-flip-cycle']);
  const segRows = all((n) => n.attributes?.['data-flip-b-seg-status'] !== undefined, cardB);
  const segStatuses = segRows.map((n) => n.attributes['data-flip-b-seg-status']);
  const segText = segRows.map((n) => n.textContent).join(' | ');

  // Also verify logic module's own evalSegments are violation-free in evaluate()
  const plan = F.planFlipBridges({
    segments: MID_SHIFT_SEGS,
    now: NOW_1200,
    config: cfgChi,
    shutdownMinute: NOW_1200,
    targetHour: 3,
    targetMinute: 0,
  });
  const evFromPlan = plan.optionB ? E.evaluate(plan.optionB.evalSegments, { asOf: plan.optionB.rollOutMinute, config: cfgChi }) : null;

  const ok = evB.violations.length === 0
    && evFromPlan !== null && evFromPlan.violations.length === 0
    && evFromPlan.shift.chain.length >= 2
    && gotSplit === '7/3'
    && gotRollOut === wantRollOut
    && gotDriveLeg === 300
    && gotDrive === evB.shift.driveRemaining
    && gotWin === evB.shift.windowRemaining
    && gotCyc === evB.cycle.remaining
    && segStatuses.join(',') === 'SB,D,OFF'
    && /12:00/.test(segText) && /19:00/.test(segText) && /00:00/.test(segText) && /03:00/.test(segText);

  return ok || JSON.stringify({
    evBViols: evB.violations.length,
    evFromPlanViols: evFromPlan?.violations.length,
    gotSplit, gotRollOut, wantRollOut, gotDriveLeg,
    gotClocks: { gotDrive, gotWin, gotCyc },
    wantClocks: { drive: evB.shift.driveRemaining, win: evB.shift.windowRemaining, cyc: evB.cycle.remaining },
    segStatuses, segText,
  });
});

/* ---------------- FL3: Option B ABSENT when no valid split slide exists (never fudges a split) ---------------- */
await pin('FL3. Option B ABSENT when no valid split slide exists (11h drive exhausted, 14h window exhausted, or bare 10h exact hit)', async () => {
  // Fixture 1: 11h drive already used (5h + 30m break + 6h = 11h D ending Tue 17:30).
  // Target 09:00 Wed is 15h 30m away (inside split time range), yet ANY drive leg before completing a split violates DRIVE_11!
  const now1730 = chi(10, 17, 30);
  const exhaustedDriveSegs = [
    { status: 'OFF', start: chi(9, 20, 0), end: chi(10, 6, 0), createdAt: 1 },
    { status: 'D', start: chi(10, 6, 0), end: chi(10, 11, 0), createdAt: 2 },
    { status: 'OFF', start: chi(10, 11, 0), end: chi(10, 11, 30), createdAt: 3 },
    { status: 'D', start: chi(10, 11, 30), end: now1730, createdAt: 4 },
  ];
  await seed({ nowOverride: now1730, segments: exhaustedDriveSegs });
  await openFlipViaHub();

  // Set custom target 09:00 via ClockPick to verify DOM omits Option B while keeping Option A!
  const customBtn = all((n) => n.localName === 'button' && n.attributes?.['data-flip-preset'] === 'custom', planRoom())[0];
  fire(customBtn, 'click'); await sleep(40);
  const sh = all((n) => has(n, 'sheet'))[0];
  const clkIn = sh && all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), sh)[0];
  const applyBtn = sh && all((n) => n.localName === 'button' && n.attributes?.['data-flip-time-apply'] === '1', sh)[0];
  if (!clkIn || !applyBtn) return 'ClockPick sheet missing controls in FL3';
  clkIn.value = '09:00'; fire(clkIn, 'input'); await sleep(20);
  fire(applyBtn, 'click'); await sleep(50);

  const rm1 = planRoom();
  const cardA1 = readCard(rm1, 'A');
  const cardB1 = readCard(rm1, 'B');

  // Fixture 2: 14h window nearly exhausted (12h ON 06:00-18:00, only 2h window left; target 08:00 = 14h span -> 4h drive > 2h window)
  const now1800 = chi(10, 18, 0);
  const exhaustedWinPlan = F.planFlipBridges({
    segments: [
      { status: 'OFF', start: chi(9, 20, 0), end: chi(10, 6, 0), createdAt: 1 },
      { status: 'ON', start: chi(10, 6, 0), end: now1800, createdAt: 2 },
    ],
    now: now1800,
    config: cfgChi,
    shutdownMinute: now1800,
    targetHour: 8,
    targetMinute: 0,
  });

  // Fixture 3: bare 10h hits target exactly (11:00 -> 21:00 = 10h -> 0m drive leg)
  const exact10Plan = F.planFlipBridges({
    segments: [
      { status: 'OFF', start: chi(9, 20, 0), end: chi(10, 6, 0), createdAt: 1 },
      { status: 'D', start: chi(10, 6, 0), end: chi(10, 11, 0), createdAt: 2 },
    ],
    now: chi(10, 11, 0),
    config: cfgChi,
    shutdownMinute: chi(10, 11, 0),
    targetHour: 21,
    targetMinute: 0,
  });

  const ok = !!cardA1 && cardB1 === null
    && exhaustedWinPlan.optionA !== null && exhaustedWinPlan.optionB === null
    && exact10Plan.optionA !== null && exact10Plan.optionB === null;

  return ok || JSON.stringify({
    cardA1: !!cardA1,
    cardB1: !!cardB1,
    winB: exhaustedWinPlan.optionB,
    exact10B: exact10Plan.optionB,
  });
});

/* ---------------- FL4: Option C appears ONLY on tight-cycle fixture and matches engine cycle math ---------------- */
await pin('FL4. Option C (Wait-for-Midnight Recap Bridge): appears only on tight-cycle fixture with engine cycle parity; absent when roomy or zero drop-off', async () => {
  // 1. Tight cycle fixture: 70/8 cycle, Nov 3 = 10h, Nov 4..9 = 6 * 9h = 54h, Nov 10 = 4h (08:00-12:00) => 68h used (2h left!)
  // At Tue Nov 10 22:00 (after 10h break): 2h 00m cycle left.
  // At Wed Nov 11 00:01 (after midnight drop-off of Nov 3's 10h): 12h 00m cycle left (+10h 00m gain).
  const tightSegs = [
    { status: 'ON', start: chi(3, 6, 0), end: chi(3, 16, 0), createdAt: 1 },
    ...[4, 5, 6, 7, 8, 9].map((d, i) => ({ status: 'ON', start: chi(d, 6, 0), end: chi(d, 15, 0), createdAt: i + 2 })),
    { status: 'OFF', start: chi(9, 15, 0), end: chi(10, 8, 0), createdAt: 20 },
    { status: 'D', start: chi(10, 8, 0), end: NOW_1200, createdAt: 21 },
  ];

  const earlyStart = chi(10, 22, 0);
  const afterStart = chi(11, 0, 1);
  const evEarly = E.evaluate([...tightSegs, { status: 'OFF', start: NOW_1200, end: earlyStart, tentative: true }], { asOf: earlyStart, config: cfgChi });
  const evAfter = E.evaluate([...tightSegs, { status: 'OFF', start: NOW_1200, end: afterStart, tentative: true }], { asOf: afterStart, config: cfgChi });

  await seed({ nowOverride: NOW_1200, segments: tightSegs });
  await openFlipViaHub();
  const rmTight = planRoom();
  const cardCTight = readCard(rmTight, 'C');
  if (!cardCTight) return 'Option C missing on tight-cycle fixture';

  const gotEarlyStart = Number(cardCTight.attributes['data-flip-early-start']);
  const gotAfterStart = Number(cardCTight.attributes['data-flip-after-start']);
  const gotEarlyCyc = Number(cardCTight.attributes['data-flip-early-cycle']);
  const gotAfterCyc = Number(cardCTight.attributes['data-flip-after-cycle']);
  const gotGain = Number(cardCTight.attributes['data-flip-cycle-gain']);
  const cText = cardCTight.textContent;

  // 2. Roomy cycle fixture (MID_SHIFT_SEGS: 64h remaining): Option C MUST be absent!
  await seed({ nowOverride: NOW_1200, segments: MID_SHIFT_SEGS });
  await openFlipViaHub();
  const cardCRoomy = readCard(planRoom(), 'C');

  // 3. Tight cycle with ZERO drop-off at next midnight (Nov 3 = 0h, Nov 4..9 = 6*10.5h = 63h, Nov 10 = 5h => 68h used, 0h drops off at Wed 00:00)
  const zeroDropSegs = [
    ...[4, 5, 6, 7, 8, 9].map((d, i) => ({ status: 'ON', start: chi(d, 6, 0), end: chi(d, 16, 30), createdAt: i + 1 })),
    { status: 'OFF', start: chi(9, 16, 30), end: chi(10, 7, 0), createdAt: 20 },
    { status: 'D', start: chi(10, 7, 0), end: NOW_1200, createdAt: 21 },
  ];
  const zeroDropPlan = F.planFlipBridges({
    segments: zeroDropSegs,
    now: NOW_1200,
    config: cfgChi,
    shutdownMinute: NOW_1200,
    targetHour: 21,
    targetMinute: 0,
  });

  const ok = gotEarlyStart === earlyStart
    && gotAfterStart === afterStart
    && gotEarlyCyc === evEarly.cycle.remaining && gotEarlyCyc === 120
    && gotAfterCyc === evAfter.cycle.remaining && gotAfterCyc === 720
    && gotGain === 600
    && /22:00/.test(cText) && /00:01/.test(cText) && /2h 00m/.test(cText) && /12h 00m/.test(cText)
    && cardCRoomy === null
    && zeroDropPlan.optionC === null;

  return ok || JSON.stringify({
    gotEarlyStart, earlyStart, gotAfterStart, afterStart,
    gotEarlyCyc, wantEarlyCyc: evEarly.cycle.remaining,
    gotAfterCyc, wantAfterCyc: evAfter.cycle.remaining,
    gotGain, cardCRoomy: !!cardCRoomy, zeroDropC: zeroDropPlan.optionC,
  });
});

/* ---------------- FL5: Option C respects custom carrier-day boundary (06:00) ---------------- */
await pin('FL5. Option C uses configured carrier-day boundary (06:00), not hard-coded midnight, matching evaluate()', async () => {
  const cfg06 = { ...cfgChi, dayStartHour: 6, dayStartMinute: 0 };
  const now1800 = chi(10, 18, 0);
  // Carrier days start at 06:00 CST. Nov 3 06:00..Nov 4 06:00 = 10h; Nov 4..9 = 6*9h = 54h; Nov 10 14:00-18:00 = 4h => 68h used.
  // Shutdown Tue 18:00 -> earlyStart = Wed 04:00 (2h cycle left); next boundary = Wed 06:00 -> afterStart = Wed 06:01 (12h cycle left).
  const segs06 = [
    { status: 'ON', start: chi(3, 8, 0), end: chi(3, 18, 0), createdAt: 1 },
    ...[4, 5, 6, 7, 8, 9].map((d, i) => ({ status: 'ON', start: chi(d, 8, 0), end: chi(d, 17, 0), createdAt: i + 2 })),
    { status: 'OFF', start: chi(9, 17, 0), end: chi(10, 14, 0), createdAt: 20 },
    { status: 'D', start: chi(10, 14, 0), end: now1800, createdAt: 21 },
  ];
  const early04 = chi(11, 4, 0);
  const after0601 = chi(11, 6, 1);
  const evEarly = E.evaluate([...segs06, { status: 'OFF', start: now1800, end: early04, tentative: true }], { asOf: early04, config: cfg06 });
  const evAfter = E.evaluate([...segs06, { status: 'OFF', start: now1800, end: after0601, tentative: true }], { asOf: after0601, config: cfg06 });

  const plan = F.planFlipBridges({
    segments: segs06,
    now: now1800,
    config: cfg06,
    shutdownMinute: now1800,
    targetHour: 21,
    targetMinute: 0,
  });

  const c = plan.optionC;
  const ok = !!c
    && c.boundaryMinute === chi(11, 6, 0)
    && c.boundaryWord === '06:00'
    && c.earlyStart === early04
    && c.afterStart === after0601
    && c.earlyClocks.cycleRemaining === evEarly.cycle.remaining
    && c.afterClocks.cycleRemaining === evAfter.cycle.remaining
    && /06:00/.test(c.title) && !/Midnight/i.test(c.title);

  return ok || JSON.stringify({
    c: c && { title: c.title, boundary: c.boundaryMinute, word: c.boundaryWord, early: c.earlyStart, after: c.afterStart, ec: c.earlyClocks.cycleRemaining, ac: c.afterClocks.cycleRemaining },
    want: { early: early04, after: after0601, ec: evEarly.cycle.remaining, ac: evAfter.cycle.remaining },
  });
});

/* ---------------- FL6: Preset chips set documented targets (21:00 Night, 00:01 Midnight Recap, 03:00 Early Bird) ---------------- */
await pin('FL6. Preset chips set documented targets (21:00 Night, 00:01 Midnight Recap, 03:00 Early Bird) and update Option A live', async () => {
  await seed();
  await openFlipViaHub();

  const checks = [
    ['night', '21:00', chi(11, 21, 0)],
    ['midnight', '00:01', chi(11, 0, 1)],
    ['early', '03:00', chi(11, 3, 0)],
  ];
  const seen = [];
  for (const [id, wantHM, wantRoll] of checks) {
    const rm = await tapPreset(id);
    const ctrl = all((n) => n.attributes?.['data-flip-controls'] === '1', rm)[0];
    const btn = all((n) => n.localName === 'button' && n.attributes?.['data-flip-preset'] === id, rm)[0];
    const cardA = readCard(rm, 'A');
    const hm = ctrl?.attributes['data-flip-target-hm'];
    const pressed = btn?.attributes['aria-pressed'];
    const roll = cardA ? Number(cardA.attributes['data-flip-rollout']) : null;
    seen.push({ id, hm, wantHM, pressed, roll, wantRoll });
    if (hm !== wantHM || (pressed !== 'true' && pressed !== true) || roll !== wantRoll) {
      return `preset ${id} mismatch: ${JSON.stringify(seen)}`;
    }
  }
  return true;
});

/* ---------------- FL7: Shared ClockPick for custom target AND shutdown edit; zero <input type="time"> on FlipTab ---------------- */
await pin('FL7. Shared ClockPick used for custom target time and shutdown edit; zero <input type="time"> in FlipTab', async () => {
  await seed();
  await openFlipViaHub();
  const rm = planRoom();

  const timeInputsOnTab = all((n) => n.localName === 'input' && n.attributes?.type === 'time', rm).length;
  if (timeInputsOnTab !== 0) return `found ${timeInputsOnTab} <input type="time"> directly in FlipTab`;

  // 1. Custom target time via timeOnly ClockPick
  const customBtn = all((n) => n.localName === 'button' && n.attributes?.['data-flip-preset'] === 'custom', rm)[0];
  fire(customBtn, 'click'); await sleep(40);
  const shTarget = all((n) => has(n, 'sheet'))[0];
  const targetClk = shTarget && all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), shTarget)[0];
  const targetDay = shTarget && all((n) => n.localName === 'input' && has(n, 'ed-day-input'), shTarget)[0];
  const targetApply = shTarget && all((n) => n.localName === 'button' && n.attributes?.['data-flip-time-apply'] === '1', shTarget)[0];
  if (!shTarget || !targetClk || targetDay || !targetApply) {
    return `target ClockPick wrong: sh=${!!shTarget} clk=${!!targetClk} day=${!!targetDay} apply=${!!targetApply}`;
  }
  targetClk.value = '04:30'; fire(targetClk, 'input'); await sleep(20);
  fire(targetApply, 'click'); await sleep(50);

  const afterTargetHM = all((n) => n.attributes?.['data-flip-controls'] === '1', planRoom())[0]?.attributes['data-flip-target-hm'];
  const afterTargetRoll = Number(readCard(planRoom(), 'A')?.attributes['data-flip-rollout']);

  // 2. Shutdown edit via full date+time ClockPick -> Tue 15:00 -> target 04:30 Wed (13h 30m rest)
  const shutBtn = all((n) => n.localName === 'button' && n.attributes?.['data-flip-shutdown-btn'] === '1', planRoom())[0];
  fire(shutBtn, 'click'); await sleep(40);
  const shShut = all((n) => has(n, 'sheet'))[0];
  const shutClk = shShut && all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), shShut)[0];
  const shutDay = shShut && all((n) => n.localName === 'input' && has(n, 'ed-day-input'), shShut)[0];
  const shutApply = shShut && all((n) => n.localName === 'button' && n.attributes?.['data-flip-time-apply'] === '1', shShut)[0];
  if (!shShut || !shutClk || !shutDay || !shutApply) {
    return `shutdown ClockPick wrong: sh=${!!shShut} clk=${!!shutClk} day=${!!shutDay} apply=${!!shutApply}`;
  }
  shutDay.value = '2026-11-10'; fire(shutDay, 'input'); await sleep(20);
  shutClk.value = '15:00'; fire(shutClk, 'input'); await sleep(20);
  fire(shutApply, 'click'); await sleep(50);

  const afterShutBtnText = all((n) => n.localName === 'button' && n.attributes?.['data-flip-shutdown-btn'] === '1', planRoom())[0]?.textContent ?? '';
  const afterShutTotal = Number(readCard(planRoom(), 'A')?.attributes['data-flip-total-rest']);

  // Reset restores default shutdown (12:00)
  const resetBtn = all((n) => n.localName === 'button' && n.attributes?.['data-flip-shutdown-reset'] === '1', planRoom())[0];
  if (!resetBtn) return 'missing shutdown Reset button after custom edit';
  fire(resetBtn, 'click'); await sleep(40);
  const resetShutText = all((n) => n.localName === 'button' && n.attributes?.['data-flip-shutdown-btn'] === '1', planRoom())[0]?.textContent ?? '';

  const ok = afterTargetHM === '04:30'
    && afterTargetRoll === chi(11, 4, 30)
    && /15:00/.test(afterShutBtnText)
    && afterShutTotal === 810
    && /12:00/.test(resetShutText);

  return ok || JSON.stringify({ afterTargetHM, afterTargetRoll, wantRoll: chi(11, 4, 30), afterShutBtnText, afterShutTotal, resetShutText });
});

/* ---------------- FL8: Standing line, zero medical/sleep advice, default shutdown from shift end, Plan hub 11th item, Back, zero new storage keys ---------------- */
await pin('FL8. Standing line, non-medical framing, default shutdown from shift end vs now, Plan hub 11th item, Back navigation, zero new storage keys', async () => {
  // Default shutdown test: driver finished working at Tue 10:00, OFF 10:00->12:00, now = 12:00 => defaults to 10:00 (end of shift)
  const restedSegs = [
    { status: 'OFF', start: chi(9, 20, 0), end: chi(10, 6, 0), createdAt: 1 },
    { status: 'D', start: chi(10, 6, 0), end: chi(10, 10, 0), createdAt: 2 },
    { status: 'OFF', start: chi(10, 10, 0), end: NOW_1200, createdAt: 3 },
  ];
  const defRested = F.defaultShutdownMinute(restedSegs, NOW_1200);
  const defEmpty = F.defaultShutdownMinute([], NOW_1200);

  await seed({ nowOverride: NOW_1200, segments: restedSegs });
  const opened = await openFlipViaHub();
  if (!opened) return 'Could not open Flip My Clock';

  const titles = opened.items.map((b) => all((n) => n.localName === 'b', b)[0]?.textContent?.trim());
  // Re-aimed (navy1 B1): Plan hub groups the 12 tools by time horizon; verify all 12 items and required titles present.
  if (opened.items.length !== 12 || !titles.includes('Flip My Clock') || !titles.includes('Miles Left in My 70')) {
    return `Plan hub placement wrong: count=${opened.items.length} titles=${JSON.stringify(titles)}`;
  }

  const rm = opened.rm;
  const standing = all((n) => n.attributes?.['data-flip-standing'] === '1', rm)[0]?.textContent?.trim() ?? '';
  const shutTxt = all((n) => n.attributes?.['data-flip-shutdown-btn'] === '1', rm)[0]?.textContent ?? '';
  const bodyWithoutStanding = rm.textContent.replace(STANDING, '');
  const hasMedical = /alertness|circadian|fatigue|melatonin|\bnap\b|sleep advice|sleep quality|medical|health/i.test(bodyWithoutStanding);

  const backBtn = all((n) => n.localName === 'button' && has(n, 'back'), rm)[0];
  fire(backBtn, 'click'); await sleep(260);
  const closedClean = !A.isFlipPlannerOpen();

  const allowed = new Set(['hos-sandbox-v1', 'hos-sandbox-v1-backup', 'hos-sandbox-v1-sim', 'hos-sandbox-undo-v1']);
  const extraKeys = [...mem.keys()].filter((k) => !allowed.has(k));

  const ok = defRested.minute === chi(10, 10, 0) && defRested.source === 'shift_end'
    && defEmpty.minute === NOW_1200 && defEmpty.source === 'now'
    && standing === STANDING
    && /10:00/.test(shutTxt)
    && !hasMedical
    && closedClean
    && extraKeys.length === 0;

  return ok || JSON.stringify({
    defRested, defEmpty, standingOk: standing === STANDING, shutTxt, hasMedical, closedClean, extraKeys,
  });
});

/* ---------------- FL9 (F1): Future-shutdown Option B driving legality & assumption disclosure ---------------- */
await pin('FL9. F1: Future-shutdown Option B must not claim (violation-free) when driving to shutdown breaks 11h limit; shows assumption line or omits card', async () => {
  // Opus REVIEW-FLIP.md F1 fixture (America/Chicago, 70/8, midnight carrier day):
  // OFF Mon 20:00->Tue 06:00, D 06:00-10:00, OFF 10:00-10:30, D 10:30-12:00 (5.5h driven); now = Tue 12:00.
  const f1Segs = [
    { status: 'OFF', start: chi(9, 20, 0), end: chi(10, 6, 0), createdAt: 1 },
    { status: 'D', start: chi(10, 6, 0), end: chi(10, 10, 0), createdAt: 2 },
    { status: 'OFF', start: chi(10, 10, 0), end: chi(10, 10, 30), createdAt: 3 },
    { status: 'D', start: chi(10, 10, 30), end: NOW_1200, createdAt: 4 },
  ];
  const ASSUMPTION_LINE = "Assumes no driving between now and shutdown. If you'll be driving before shutdown, this slide may not hold.";

  // Variant 1: shutdown Tue 17:00 (+5h), target 05:00 -> under D: 5.5 + 5 + 2 = 12.5h (DRIVE_11 by 1h 30m)
  const shut17 = chi(10, 17, 0);
  const evD17 = E.evaluate([
    ...f1Segs,
    { status: 'D', start: NOW_1200, end: shut17, tentative: true },
    { status: 'SB', start: shut17, end: chi(11, 0, 0), tentative: true },
    { status: 'D', start: chi(11, 0, 0), end: chi(11, 2, 0), tentative: true },
    { status: 'OFF', start: chi(11, 2, 0), end: chi(11, 5, 0), tentative: true },
  ], { asOf: chi(11, 5, 0), config: cfgChi });
  const hasD17Viol = evD17.violations.some((v) => v.kind === 'DRIVE_11' && v.minutes === 90);

  const plan17 = F.planFlipBridges({
    segments: f1Segs,
    now: NOW_1200,
    config: cfgChi,
    shutdownMinute: shut17,
    targetHour: 5,
    targetMinute: 0,
  });

  // Variant 2: shutdown Tue 16:00 (+4h), target 04:00 -> under D: 5.5 + 4 + 2 = 11.5h (DRIVE_11 by 30m)
  const shut16 = chi(10, 16, 0);
  const evD16 = E.evaluate([
    ...f1Segs,
    { status: 'D', start: NOW_1200, end: shut16, tentative: true },
    { status: 'SB', start: shut16, end: chi(10, 23, 0), tentative: true },
    { status: 'D', start: chi(10, 23, 0), end: chi(11, 1, 0), tentative: true },
    { status: 'OFF', start: chi(11, 1, 0), end: chi(11, 4, 0), tentative: true },
  ], { asOf: chi(11, 4, 0), config: cfgChi });
  const hasD16Viol = evD16.violations.some((v) => v.kind === 'DRIVE_11' && v.minutes === 30);

  const plan16 = F.planFlipBridges({
    segments: f1Segs,
    now: NOW_1200,
    config: cfgChi,
    shutdownMinute: shut16,
    targetHour: 4,
    targetMinute: 0,
  });

  // Positive control: shutdown Tue 14:00 (+2h), target 02:00 -> under D: 5.5 + 2 + 2 = 9.5h <= 11h (passes D!)
  const shut14 = chi(10, 14, 0);
  const plan14 = F.planFlipBridges({
    segments: f1Segs,
    now: NOW_1200,
    config: cfgChi,
    shutdownMinute: shut14,
    targetHour: 2,
    targetMinute: 0,
  });

  // Helper to set shutdown + target in FlipTab DOM
  const setFlipInputs = async (dateStr, shutHM, targetHM) => {
    const shutBtn = all((n) => n.localName === 'button' && n.attributes?.['data-flip-shutdown-btn'] === '1', planRoom())[0];
    fire(shutBtn, 'click'); await sleep(40);
    const shShut = all((n) => has(n, 'sheet'))[0];
    const shutDay = all((n) => n.localName === 'input' && has(n, 'ed-day-input'), shShut)[0];
    const shutClk = all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), shShut)[0];
    const shutApply = all((n) => n.localName === 'button' && n.attributes?.['data-flip-time-apply'] === '1', shShut)[0];
    shutDay.value = dateStr; fire(shutDay, 'input'); await sleep(15);
    shutClk.value = shutHM; fire(shutClk, 'input'); await sleep(15);
    fire(shutApply, 'click'); await sleep(45);

    const customBtn = all((n) => n.localName === 'button' && n.attributes?.['data-flip-preset'] === 'custom', planRoom())[0];
    fire(customBtn, 'click'); await sleep(40);
    const shTgt = all((n) => has(n, 'sheet'))[0];
    const tgtClk = all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), shTgt)[0];
    const tgtApply = all((n) => n.localName === 'button' && n.attributes?.['data-flip-time-apply'] === '1', shTgt)[0];
    tgtClk.value = targetHM; fire(tgtClk, 'input'); await sleep(15);
    fire(tgtApply, 'click'); await sleep(45);
    return planRoom();
  };

  await seed({ nowOverride: NOW_1200, segments: f1Segs });
  await openFlipViaHub();

  const rm17 = await setFlipInputs('2026-11-10', '17:00', '05:00');
  const cardB17 = readCard(rm17, 'B');
  const textB17 = cardB17?.textContent ?? '';
  const dom17Ok = cardB17 === null || (
    !/violation-free/i.test(textB17) && textB17.includes(ASSUMPTION_LINE)
  );

  const rm16 = await setFlipInputs('2026-11-10', '16:00', '04:00');
  const cardB16 = readCard(rm16, 'B');
  const textB16 = cardB16?.textContent ?? '';
  const dom16Ok = cardB16 === null || (
    !/violation-free/i.test(textB16) && textB16.includes(ASSUMPTION_LINE)
  );

  const rm14 = await setFlipInputs('2026-11-10', '14:00', '02:00');
  const cardB14 = readCard(rm14, 'B');
  const textB14 = cardB14?.textContent ?? '';
  const dom14Ok = cardB14 !== null
    && /\(violation-free\)/.test(textB14)
    && !textB14.includes(ASSUMPTION_LINE);

  const ok = hasD17Viol && hasD16Viol
    && (plan17.optionB === null || plan17.optionB.assumesNoDrivingBeforeShutdown === true)
    && (plan16.optionB === null || plan16.optionB.assumesNoDrivingBeforeShutdown === true)
    && plan14.optionB !== null && plan14.optionB.assumesNoDrivingBeforeShutdown === false
    && dom17Ok && dom16Ok && dom14Ok;

  return ok || JSON.stringify({
    hasD17Viol, hasD16Viol,
    p17Assumes: plan17.optionB?.assumesNoDrivingBeforeShutdown,
    p16Assumes: plan16.optionB?.assumesNoDrivingBeforeShutdown,
    p14Assumes: plan14.optionB?.assumesNoDrivingBeforeShutdown,
    dom17Ok, dom16Ok, dom14Ok,
    textB17: textB17.slice(0, 220),
    textB16: textB16.slice(0, 220),
    textB14: textB14.slice(0, 220),
  });
});

/* ---------------- FL10 (F2 & F6): Resting >= 24h defaults to actual rest start (lastWorkEnd) ---------------- */
await pin('FL10. F2/F6: Driver resting >= 24h defaults to lastWorkEnd (Mon 10:00), Option A offers Tue 14:00 with rest figures from Mon 10:00', async () => {
  // Opus REVIEW-FLIP.md F2 fixture:
  // D Mon 00:00-10:00, OFF Mon 10:00->Tue 12:00 (26h); now = Tue 12:00; target = 14:00.
  const rested26h = [
    { status: 'D', start: chi(9, 0, 0), end: chi(9, 10, 0), createdAt: 1 },
    { status: 'OFF', start: chi(9, 10, 0), end: NOW_1200, createdAt: 2 },
  ];
  const def = F.defaultShutdownMinute(rested26h, NOW_1200);

  await seed({ nowOverride: NOW_1200, segments: rested26h });
  await openFlipViaHub();

  // Set target 14:00 via custom ClockPick
  const customBtn = all((n) => n.localName === 'button' && n.attributes?.['data-flip-preset'] === 'custom', planRoom())[0];
  fire(customBtn, 'click'); await sleep(40);
  const shTgt = all((n) => has(n, 'sheet'))[0];
  const tgtClk = all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), shTgt)[0];
  const tgtApply = all((n) => n.localName === 'button' && n.attributes?.['data-flip-time-apply'] === '1', shTgt)[0];
  tgtClk.value = '14:00'; fire(tgtClk, 'input'); await sleep(15);
  fire(tgtApply, 'click'); await sleep(45);

  const rm = planRoom();
  const shutTxt = all((n) => n.localName === 'button' && n.attributes?.['data-flip-shutdown-btn'] === '1', rm)[0]?.textContent ?? '';
  const cardA = readCard(rm, 'A');
  const gotRoll = cardA ? Number(cardA.attributes['data-flip-rollout']) : null;
  const gotTotal = cardA ? Number(cardA.attributes['data-flip-total-rest']) : null;
  const gotExtra = cardA ? Number(cardA.attributes['data-flip-extra-rest']) : null;
  const wantRoll14 = chi(10, 14, 0);

  const ev14 = E.evaluate(
    [...rested26h, { status: 'OFF', start: NOW_1200, end: wantRoll14, tentative: true }],
    { asOf: wantRoll14, config: cfgChi },
  );

  // Target 21:00 Tue -> 35h total rest from Mon 10:00 => includes34Restart = true
  const plan21 = F.planFlipBridges({
    segments: rested26h,
    now: NOW_1200,
    config: cfgChi,
    shutdownMinute: def.minute,
    targetHour: 21,
    targetMinute: 0,
  });

  // Even if a custom shutdown is set at `now` while resting since Mon 10:00, actual rest still starts Mon 10:00 (F2/F6)
  const planCustomNow21 = F.planFlipBridges({
    segments: rested26h,
    now: NOW_1200,
    config: cfgChi,
    shutdownMinute: NOW_1200,
    targetHour: 21,
    targetMinute: 0,
  });

  const ok = def.minute === chi(9, 10, 0) && def.source === 'shift_end'
    && /Mon 10:00/.test(shutTxt)
    && gotRoll === wantRoll14
    && gotTotal === 28 * 60 && gotExtra === 18 * 60
    && Number(cardA?.attributes['data-flip-drive']) === ev14.shift.driveRemaining
    && Number(cardA?.attributes['data-flip-cycle']) === ev14.cycle.remaining
    && plan21.optionA?.rollOutMinute === chi(10, 21, 0)
    && plan21.optionA?.totalRestMinutes === 35 * 60
    && plan21.optionA?.includes34Restart === true
    && planCustomNow21.optionA?.totalRestMinutes === 35 * 60
    && planCustomNow21.optionA?.includes34Restart === true;

  return ok || JSON.stringify({
    def, shutTxt, gotRoll, wantRoll14, gotTotal, gotExtra,
    p21: plan21.optionA && { roll: plan21.optionA.rollOutMinute, tot: plan21.optionA.totalRestMinutes, r34: plan21.optionA.includes34Restart },
    pCustom21: planCustomNow21.optionA && { roll: planCustomNow21.optionA.rollOutMinute, tot: planCustomNow21.optionA.totalRestMinutes, r34: planCustomNow21.optionA.includes34Restart },
  });
});

/* ---------------- FL11 (F3 & F4): DST fall-back repeated hour & spring-forward gap note ---------------- */
await pin('FL11. F3/F4: DST fall-back resolves to second 01:30 CST (not next day); spring-forward 02:30 shows Sun 03:30 with explanatory note', async () => {
  // F3 (Opus p3 fixture): Sat Oct 31 2026 15:40 CDT, target 01:30 -> bare 10h ends Sun Nov 1 01:40 CDT
  // -> must resolve to Sun Nov 1 01:30 CST (07:30Z), NOT Mon Nov 2 01:30 CST.
  const oct31_0600 = E.localToMinute(2026, 10, 31, 6, 'America/Chicago', 0);
  const oct31_1540 = E.localToMinute(2026, 10, 31, 15, 'America/Chicago', 40);
  const nov1_0130_cdt = E.localToMinute(2026, 11, 1, 1, 'America/Chicago', 30);
  const nov1_0130_cst = nov1_0130_cdt + 60;
  const fallSegs = [
    { status: 'OFF', start: oct31_0600 - 600, end: oct31_0600, createdAt: 1 },
    { status: 'D', start: oct31_0600, end: oct31_1540, createdAt: 2 },
  ];
  const fallPlan = F.planFlipBridges({
    segments: fallSegs,
    now: oct31_1540,
    config: cfgChi,
    shutdownMinute: oct31_1540,
    targetHour: 1,
    targetMinute: 30,
  });

  // F4 (Opus spring-forward fixture): Sat Mar 7 2026 15:00 CST, target 02:30 -> Sun Mar 8 03:30 CDT WITH note
  const mar7_0600 = E.localToMinute(2026, 3, 7, 6, 'America/Chicago', 0);
  const mar7_1500 = E.localToMinute(2026, 3, 7, 15, 'America/Chicago', 0);
  const mar8_0330 = E.localToMinute(2026, 3, 8, 3, 'America/Chicago', 30);
  const springSegs = [
    { status: 'OFF', start: mar7_0600 - 600, end: mar7_0600, createdAt: 1 },
    { status: 'D', start: mar7_0600, end: mar7_1500, createdAt: 2 },
  ];
  const springPlan = F.planFlipBridges({
    segments: springSegs,
    now: mar7_1500,
    config: cfgChi,
    shutdownMinute: mar7_1500,
    targetHour: 2,
    targetMinute: 30,
  });

  await seed({ nowOverride: mar7_1500, segments: springSegs });
  await openFlipViaHub();
  const customBtn = all((n) => n.localName === 'button' && n.attributes?.['data-flip-preset'] === 'custom', planRoom())[0];
  fire(customBtn, 'click'); await sleep(40);
  const shTgt = all((n) => has(n, 'sheet'))[0];
  const tgtClk = all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), shTgt)[0];
  const tgtApply = all((n) => n.localName === 'button' && n.attributes?.['data-flip-time-apply'] === '1', shTgt)[0];
  tgtClk.value = '02:30'; fire(tgtClk, 'input'); await sleep(15);
  fire(tgtApply, 'click'); await sleep(45);

  const cardASpring = readCard(planRoom(), 'A');
  const springRollTxt = all((n) => n.attributes?.['data-flip-a-rollout-text'] === '1', cardASpring)[0]?.textContent ?? '';
  const springNote = all((n) => n.attributes?.['data-flip-a-dst-note'] === '1', cardASpring)[0]?.textContent ?? '';
  const springHeroLbl = all((n) => has(n, 'flip-hero-lbl'), cardASpring)[0]?.textContent ?? '';

  const ok = fallPlan.optionA?.rollOutMinute === nov1_0130_cst
    && fallPlan.optionA?.totalRestMinutes === 650
    && fallPlan.optionA?.includes34Restart === false
    && fallPlan.optionA?.dstGapShifted === false
    && springPlan.optionA?.rollOutMinute === mar8_0330
    && springPlan.optionA?.rollOutHM === '03:30'
    && springPlan.optionA?.dstGapShifted === true
    && /Sun 03:30/.test(springRollTxt)
    && !/Roll out on target/i.test(springHeroLbl)
    && /02:30/.test(springNote) && /does not occur|doesn't occur/i.test(springNote);

  return ok || JSON.stringify({
    fallA: fallPlan.optionA && { roll: fallPlan.optionA.rollOutMinute, want: nov1_0130_cst, tot: fallPlan.optionA.totalRestMinutes, r34: fallPlan.optionA.includes34Restart, gap: fallPlan.optionA.dstGapShifted },
    springA: springPlan.optionA && { roll: springPlan.optionA.rollOutMinute, want: mar8_0330, hm: springPlan.optionA.rollOutHM, gap: springPlan.optionA.dstGapShifted },
    springRollTxt, springHeroLbl, springNote,
  });
});

/* ---------------- FL12 (F5): Option B Leg 1 label honesty with already-logged rest ---------------- */
await pin('FL12. F5: Option B Leg 1 preserves real status of already-logged rest (logged SB not called Off Duty, logged OFF not called Sleeper Berth)', async () => {
  // Case A: Logged SB (10:00->12:00) + logged OFF (12:00->12:30), now = 12:30, target = 22:00.
  // 7/3 and 8/2 cannot satisfy 7h consecutive SB because logged OFF broke SB; 3/7 wins (Leg 1 = 10:00->13:00).
  // The logged 10:00->12:00 SB portion MUST keep status 'SB' and NOT be labeled "Off Duty"!
  const now1230 = chi(10, 12, 30);
  const loggedSbSegs = [
    { status: 'OFF', start: chi(9, 20, 0), end: chi(10, 6, 0), createdAt: 1 },
    { status: 'D', start: chi(10, 6, 0), end: chi(10, 10, 0), createdAt: 2 },
    { status: 'SB', start: chi(10, 10, 0), end: chi(10, 12, 0), createdAt: 3 },
    { status: 'OFF', start: chi(10, 12, 0), end: now1230, createdAt: 4 },
  ];
  const planA = F.planFlipBridges({
    segments: loggedSbSegs,
    now: now1230,
    config: cfgChi,
    shutdownMinute: chi(10, 10, 0),
    targetHour: 22,
    targetMinute: 0,
  });
  const segsA = planA.optionB?.segments ?? [];
  const coversSbHonest = segsA.some((s) => s.status === 'SB' && s.start === chi(10, 10, 0) && s.end === chi(10, 12, 0) && /Sleeper Berth/i.test(s.label));
  const mislabeledSbAsOff = segsA.some((s) => s.status === 'OFF' && s.start < chi(10, 12, 0) && s.end > chi(10, 10, 0));

  // Verify in DOM for Case A
  await seed({ nowOverride: now1230, segments: loggedSbSegs });
  await openFlipViaHub();
  const customBtn = all((n) => n.localName === 'button' && n.attributes?.['data-flip-preset'] === 'custom', planRoom())[0];
  fire(customBtn, 'click'); await sleep(40);
  const shTgt = all((n) => has(n, 'sheet'))[0];
  const tgtClk = all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), shTgt)[0];
  const tgtApply = all((n) => n.localName === 'button' && n.attributes?.['data-flip-time-apply'] === '1', shTgt)[0];
  tgtClk.value = '22:00'; fire(tgtClk, 'input'); await sleep(15);
  fire(tgtApply, 'click'); await sleep(45);
  const cardBA = readCard(planRoom(), 'B');
  const domSegsA = cardBA ? all((n) => n.attributes?.['data-flip-b-seg-status'] !== undefined, cardBA) : [];
  const domFirstStatusA = domSegsA[0]?.attributes['data-flip-b-seg-status'] ?? null;
  const domFirstTextA = domSegsA[0]?.textContent ?? '';

  // Case B (vice versa): Logged OFF (10:00->11:00), now = 11:00, target = 22:00.
  // 7/3 fails (only 6h SB available in 11:00->17:00), 8/2 wins (1h logged OFF + 7h tentative SB = 8h Leg 1).
  // The logged 10:00->11:00 OFF portion MUST keep status 'OFF' and NOT be labeled "Sleeper Berth"!
  const now1100 = chi(10, 11, 0);
  const loggedOffSegs = [
    { status: 'OFF', start: chi(9, 20, 0), end: chi(10, 6, 0), createdAt: 1 },
    { status: 'D', start: chi(10, 6, 0), end: chi(10, 10, 0), createdAt: 2 },
    { status: 'OFF', start: chi(10, 10, 0), end: now1100, createdAt: 3 },
  ];
  const planB = F.planFlipBridges({
    segments: loggedOffSegs,
    now: now1100,
    config: cfgChi,
    shutdownMinute: chi(10, 10, 0),
    targetHour: 22,
    targetMinute: 0,
  });
  const segsB = planB.optionB?.segments ?? [];
  const coversOffHonest = segsB.some((s) => s.status === 'OFF' && s.start === chi(10, 10, 0) && s.end === chi(10, 11, 0) && /Off Duty/i.test(s.label));
  const mislabeledOffAsSb = segsB.some((s) => s.status === 'SB' && s.start < chi(10, 11, 0) && s.end > chi(10, 10, 0));

  const ok = planA.optionB?.splitPair === '3/7'
    && coversSbHonest && !mislabeledSbAsOff
    && domFirstStatusA === 'SB' && /Sleeper Berth/i.test(domFirstTextA) && /10:00/.test(domFirstTextA) && /12:00/.test(domFirstTextA)
    && planB.optionB?.splitPair === '8/2'
    && coversOffHonest && !mislabeledOffAsSb;

  return ok || JSON.stringify({
    splitA: planA.optionB?.splitPair, segsA: segsA.map((s) => ({ st: s.status, lbl: s.label, a: s.startHM, b: s.endHM })),
    domFirstStatusA, domFirstTextA,
    splitB: planB.optionB?.splitPair, segsB: segsB.map((s) => ({ st: s.status, lbl: s.label, a: s.startHM, b: s.endHM })),
  });
});

let fail = 0;
for (const [st, name, info] of res) {
  console.log(`${st.padEnd(5)} ${name}${info ? '\n      ' + info : ''}`);
  if (st === 'FAIL') fail++;
}
console.log(`\n${res.length - fail}/${res.length} flip pins passed`);
process.exit(fail ? 1 : 0);

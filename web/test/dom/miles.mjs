// Miles Left in My 70 — Weekly Miles & Governed-Truck Cycle Pace Check (Plan tool #12 / Spec #5).
// Pins ML1–ML11:
//   ML1 parity: hours-left matches independent fixture computation from evaluate() + recap drop-offs
//       (hand-built segment list, literal expected values) + 60/7 rule names 60 on card.
//   ML2 recap inclusion: large drop-off the day before cutoff adds those hours & miles vs cutoff 1 day earlier.
//   ML3 overhead binds: raising overhead by +1h/day via duration boxes lowers max miles by exact simulated amount.
//   ML4 11h cap binds: fresh 70h cycle over 4 days => miles = 4 * 11h * mph (cycle is NOT the limit).
//   ML5 verdict arithmetic: exact cushion, exact shortfall, and calm "already there" goal-met state with tank.
//   ML6 carrier-day boundary: dayStartHour=18, dayStartMinute=40 drops off at 18:40 (not midnight), matches evaluate().
//   ML7 trim lever: shown ONLY when short AND trimming 30m/day adds miles; ~N equals exact re-simulated delta.
//   ML8 hygiene: Plan hub lists 12 items ("Miles Left in My 70" 12th), shared ClockPick with 0 <input type="time">,
//       0 new localStorage keys, standing estimate framing, no medical/sleep or payroll/rate copy, clean Back.
//   ML9 Fixture A (F1 + F2): day-0 consumed 11h/14h clocks (ON 04:00-07:00, D 07:00-17:00; now Wed 17:00)
//       must yield verdict 'short', day-0 drive <= 60m, honest 34-hr / next-pay-week short copy & ceiling label.
//   ML10 Fixture B (F1): mid-10h-rest (driveRemaining 0, cutoff tonight) must yield 0 max legal miles before cutoff,
//       and inter-shift 10h rest must constrain day-1 slice start when cutoff is early next morning.
//   ML11 F3/F4/F5 + nits: over-cycle assumptions line reconciles to headline; 4h overhead names 14-hr window cap;
//       exact-boundary cutoff preserves parity with honesty note; 0-overhead 9h partial day enforces 30m break;
//       per-day displayed miles reconcile to headline total.
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
let Tms = new Date(2026, 10, 11, 12, 0, 0).getTime();
Date.now = () => Tms;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'miles';
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
const M = await import('../../src/miles.ts');
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
const typeInto = async (node, val) => {
  node.value = String(val);
  fire(node, 'input');
  await sleep(30);
};

const cfgChi70 = { ...S.INITIAL_STATE.config, cycle: '70/8', dayStartHour: 0, dayStartMinute: 0, timeZone: 'America/Chicago', shortHaul: false };
const cfgChi60 = { ...cfgChi70, cycle: '60/7' };
const cfgChi1840 = { ...cfgChi70, dayStartHour: 18, dayStartMinute: 40 };
const chi = (d, h0, m0 = 0) => E.localToMinute(2026, 11, d, h0, 'America/Chicago', m0);

// ML1/ML3/ML5/ML7 base fixture: now = Wed Nov 11, 2026 06:00 CST (18h left in Wed; Sat Nov 14 23:59 = 4 full days).
// Rolling 8 days Wed Nov 4..Wed Nov 11 (gaps <= 18h, zero 34h restarts):
//   Wed Nov 4: 8h (drops Thu Nov 12 00:00)
//   Thu Nov 5: 7h (drops Fri Nov 13 00:00)
//   Fri Nov 6: 6h (drops Sat Nov 14 00:00)
//   Sat Nov 7: 10h, Sun Nov 8: 10h, Mon Nov 9: 9h, Tue Nov 10: 8h, Wed Nov 11: 0h
//   Used = 58h (3480m), remainingNow = 12h (720m), recaps before Sat 23:59 = 8+7+6 = 21h (1260m).
//   Total cycle through Sat 23:59 = 33h 00m (1980m).
//   At 1h 15m overhead (75m) & 57 mph:
//     Wed: 12h - 1h15 = 10h45 (645m), Thu: 8h - 1h15 = 6h45 (405m),
//     Fri: 7h - 1h15 = 5h45 (345m), Sat: 6h - 1h15 = 4h45 (285m).
//     Total drive = 1680m (28h 00m) => 28 * 57 = 1,596 mi.
const NOW_WED_0600 = chi(11, 6, 0);
const ML1_SEGS = [
  { status: 'D', start: chi(4, 8, 0), end: chi(4, 16, 0), createdAt: 1 },  // 8h -> drops Thu Nov 12
  { status: 'D', start: chi(5, 8, 0), end: chi(5, 15, 0), createdAt: 2 },  // 7h -> drops Fri Nov 13
  { status: 'D', start: chi(6, 8, 0), end: chi(6, 14, 0), createdAt: 3 },  // 6h -> drops Sat Nov 14
  { status: 'D', start: chi(7, 8, 0), end: chi(7, 18, 0), createdAt: 4 },  // 10h
  { status: 'D', start: chi(8, 8, 0), end: chi(8, 18, 0), createdAt: 5 },  // 10h
  { status: 'D', start: chi(9, 8, 0), end: chi(9, 17, 0), createdAt: 6 },  // 9h
  { status: 'D', start: chi(10, 8, 0), end: chi(10, 16, 0), createdAt: 7 }, // 8h
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
    nowOverride: NOW_WED_0600,
    segments: ML1_SEGS,
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
    config: cfgChi70,
    ...rec,
  });
  await sleep(60);
};

render(h(App, {}), root);
await sleep(100);
const planPage = () => all((n) => n.localName === 'section' && has(n, 'page-plan'))[0];
const planRoom = () => all((n) => n.localName === 'section' && has(n, 'plan-room'))[0];

const openMilesViaHub = async () => {
  const pg = planPage();
  const items = all((n) => n.localName === 'button' && has(n, 'plan-item'), pg);
  const btn = items.find((b) => /Miles Left in My 70/.test(b.textContent));
  if (!btn) return null;
  fire(btn, 'click');
  await sleep(60);
  return { items, btn, rm: planRoom() };
};

const readCard = (rm = planRoom()) => all((n) => n.attributes?.['data-miles-card'] === '1', rm)[0] ?? null;

const setCutoffTimeViaClockPick = async (hour, minute) => {
  const rm = planRoom();
  const timeBtn = all((n) => n.localName === 'button' && n.attributes?.['data-miles-cutoff-time-btn'] === '1', rm)[0];
  if (!timeBtn) throw new Error('missing cutoff time button');
  fire(timeBtn, 'click');
  await sleep(50);

  const sheet = all((n) => has(n, 'sheet'))[0];
  if (!sheet) throw new Error('MilesTimeSheet did not open');
  const clk = all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), sheet)[0];
  const day = all((n) => n.localName === 'input' && has(n, 'ed-day-input'), sheet)[0];
  if (!clk || day) throw new Error(`timeOnly ClockPick wrong: clk=${!!clk} day=${!!day}`);

  clk.value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  fire(clk, 'input');
  await sleep(25);

  const applyBtn = all((n) => n.localName === 'button' && n.attributes?.['data-miles-time-apply'] === '1', sheet)[0];
  if (!applyBtn) throw new Error('missing MilesTimeSheet Apply button');
  fire(applyBtn, 'click');
  await sleep(50);
};

/* ---------------- ML1: Parity with engine evaluate() + recap drop-offs + 60/7 copy ---------------- */
await pin('ML1. Parity: hours-left equals independent evaluate() + recap drop-offs (literal 33:00 / ~1,596 mi) and 60/7 card names 60', async () => {
  await seed();
  const opened = await openMilesViaHub();
  if (!opened) return 'Could not open Miles Left in My 70';

  const card = readCard(opened.rm);
  if (!card) return 'Miles verdict card missing';

  // Independent engine computation (no calls to miles.ts helpers)
  const evNow = E.evaluate(ML1_SEGS, { asOf: NOW_WED_0600, config: cfgChi70, forecastDays: 4 });
  const evCutoff = E.evaluate(ML1_SEGS, { asOf: chi(14, 23, 59), config: cfgChi70 });
  const indepNow = evNow.cycle.remaining; // literal 720m (12h)
  const indepDrops = evNow.cycle.forecast[0].dropsOff + evNow.cycle.forecast[1].dropsOff + evNow.cycle.forecast[2].dropsOff; // 480+420+360 = 1260m (21h)
  const indepTotal = indepNow + indepDrops; // literal 1980m (33h 00m)

  const gotHoursMin = Number(card.attributes['data-miles-hours-min']);
  const gotRecapsMin = Number(card.attributes['data-miles-recaps-min']);
  const gotMaxMiles = Number(card.attributes['data-miles-max']);
  const hoursTxt = all((n) => n.attributes?.['data-miles-hours-left'] === '1', card)[0]?.textContent?.trim() ?? '';
  const maxTxt = all((n) => n.attributes?.['data-miles-max-miles'] === '1', card)[0]?.textContent?.trim() ?? '';
  const lbl70 = all((n) => n.attributes?.['data-miles-hours-label'] === '1', card)[0]?.textContent ?? '';
  const assumpTxt = all((n) => n.attributes?.['data-miles-assumptions'] === '1', card)[0]?.textContent ?? '';

  // Now switch config to 60/7 and verify the hours label names 60 (and cycle math uses 60/7)
  // On 60/7 at Wed Nov 11 06:00, window is Thu Nov 5..Wed Nov 11:
  //   Thu 5 (7h, drops Thu 12) + Fri 6 (6h, drops Fri 13) + Sat 7 (10h, drops Sat 14) + Sun 8 (10h) + Mon 9 (9h) + Tue 10 (8h) = 50h used -> 10h remainingNow!
  //   Recaps Thu(7h) + Fri(6h) + Sat(10h) = 23h -> 10h + 23h = 33h 00m (1980m) on 60/7!
  //   Check against independent evaluate() at cutoff under 60/7.
  setState({ config: cfgChi60 });
  await sleep(60);
  const card60 = readCard();
  const ev60Cutoff = E.evaluate(ML1_SEGS, { asOf: chi(14, 23, 59), config: cfgChi60 });
  const got60Min = Number(card60?.attributes['data-miles-hours-min']);
  const got60Rule = Number(card60?.attributes['data-miles-cycle-rule']);
  const lbl60 = all((n) => n.attributes?.['data-miles-hours-label'] === '1', card60)[0]?.textContent ?? '';

  const ok = indepNow === 720
    && indepDrops === 1260
    && indepTotal === 1980
    && evCutoff.cycle.remaining === 1980
    && gotHoursMin === 1980
    && gotRecapsMin === 1260
    && hoursTxt === '33:00'
    && gotMaxMiles === 1596
    && /~1,596 max legal miles/.test(maxTxt)
    && /57 mph/.test(assumpTxt)
    && /70-hr cycle/.test(lbl70)
    && got60Rule === 60
    && got60Min === ev60Cutoff.cycle.remaining
    && got60Min === 1980
    && /60-hr cycle/.test(lbl60)
    && !/70-hr cycle/.test(lbl60);

  return ok || JSON.stringify({
    indepNow, indepDrops, indepTotal, evCutoffRem: evCutoff.cycle.remaining,
    gotHoursMin, gotRecapsMin, hoursTxt, gotMaxMiles, maxTxt, assumpTxt, lbl70,
    got60Rule, got60Min, ev60Rem: ev60Cutoff.cycle.remaining, lbl60,
  });
});

/* ---------------- ML2: Recap inclusion (large drop-off day before cutoff vs 1 day earlier) ---------------- */
await pin('ML2. Recap inclusion: large 11h drop-off on Fri adds +11:00 and +613 mi vs Thu cutoff (one day earlier)', async () => {
  // Wed Nov 4: 1h (drops Thu 00:00)
  // Thu Nov 5: 11h (drops Fri 00:00 — large drop-off!)
  // Fri Nov 6..Tue Nov 10: 10h each (50h) => total used = 62h, remainingNow = 8h (480m).
  // Cutoff Thu 23:59: only Wed's 1h drops off => 9:00 (540m), drive = 6h 45m (405m) => 385 mi at 57 mph.
  // Cutoff Fri 23:59: Thu's 11h also drops off => 20:00 (1200m), drive = 6h 45m + 0 + 10h 45m = 17h 30m (1050m) => 998 mi at 57 mph.
  const ML2_SEGS = [
    { status: 'ON', start: chi(4, 8, 0), end: chi(4, 9, 0), createdAt: 1 },  // 1h -> drops Thu
    { status: 'D', start: chi(5, 8, 0), end: chi(5, 19, 0), createdAt: 2 },  // 11h -> drops Fri!
    { status: 'D', start: chi(6, 8, 0), end: chi(6, 18, 0), createdAt: 3 },  // 10h -> drops Sat
    { status: 'D', start: chi(7, 8, 0), end: chi(7, 18, 0), createdAt: 4 },  // 10h
    { status: 'D', start: chi(8, 8, 0), end: chi(8, 18, 0), createdAt: 5 },  // 10h
    { status: 'D', start: chi(9, 8, 0), end: chi(9, 18, 0), createdAt: 6 },  // 10h
    { status: 'D', start: chi(10, 8, 0), end: chi(10, 18, 0), createdAt: 7 }, // 10h
  ];
  await seed({ segments: ML2_SEGS });
  await openMilesViaHub();

  const rm = planRoom();
  const thuBtn = all((n) => n.localName === 'button' && n.attributes?.['data-miles-dow'] === '4', rm)[0];
  const friBtn = all((n) => n.localName === 'button' && n.attributes?.['data-miles-dow'] === '5', rm)[0];
  if (!thuBtn || !friBtn) return 'Missing Thu/Fri cutoff DOW chips';

  fire(thuBtn, 'click');
  await sleep(50);
  const cardThu = readCard();
  const thuHours = Number(cardThu.attributes['data-miles-hours-min']);
  const thuMiles = Number(cardThu.attributes['data-miles-max']);

  fire(friBtn, 'click');
  await sleep(50);
  const cardFri = readCard();
  const friHours = Number(cardFri.attributes['data-miles-hours-min']);
  const friMiles = Number(cardFri.attributes['data-miles-max']);

  const ok = thuHours === 540
    && friHours === 1200
    && (friHours - thuHours) === 660
    && thuMiles === 385
    && friMiles === 998
    && (friMiles - thuMiles) === 613;

  return ok || JSON.stringify({ thuHours, friHours, deltaH: friHours - thuHours, thuMiles, friMiles, deltaMi: friMiles - thuMiles });
});

/* ---------------- ML3: Overhead binds (+1h/day lowers max miles by exact simulated amount) ---------------- */
await pin('ML3. Overhead binds: raising daily overhead by +1h/day (1h 15m -> 2h 15m) lowers max miles from 1,596 to 1,368 (-228 mi)', async () => {
  await seed();
  await openMilesViaHub();

  const cardBefore = readCard();
  const beforeMiles = Number(cardBefore.attributes['data-miles-max']);
  const beforeDrive = Number(cardBefore.attributes['data-miles-drive-min']);

  // Raise overhead via the shared duration-box inputs: hours 1 -> 2 (minutes stays 15 => 2h 15m = 135m)
  const boxWrap = all((n) => n.attributes?.['data-miles-overhead-box'] === '1', planRoom())[0];
  if (!boxWrap) return 'Overhead duration boxes missing';
  const inputs = all((n) => n.localName === 'input', boxWrap);
  if (inputs.length !== 2) return `Expected 2 duration inputs, got ${inputs.length}`;
  await typeInto(inputs[0], '2');
  await sleep(40);

  const cardAfter = readCard();
  const afterMiles = Number(cardAfter.attributes['data-miles-max']);
  const afterDrive = Number(cardAfter.attributes['data-miles-drive-min']);

  const ok = beforeDrive === 1680
    && beforeMiles === 1596
    && afterDrive === 1440
    && afterMiles === 1368
    && (beforeMiles - afterMiles) === 228;

  return ok || JSON.stringify({ beforeDrive, beforeMiles, afterDrive, afterMiles, diff: beforeMiles - afterMiles });
});

/* ---------------- ML4: 11h cap binds (fresh 70h cycle over 4 days => 4 * 11h * 57 = 2,508 mi) ---------------- */
await pin('ML4. 11h cap binds: fresh 70h cycle over 4 full days yields exact 4 * 11h * 57 = 2,508 mi (cycle is NOT the limit)', async () => {
  await seed({ segments: [] }); // Fresh 70h (4200m) cycle at Wed Nov 11 06:00 -> Sat Nov 14 23:59 (4 full days)
  await openMilesViaHub();

  const card = readCard();
  const hoursMin = Number(card.attributes['data-miles-hours-min']);
  const driveMin = Number(card.attributes['data-miles-drive-min']);
  const maxMiles = Number(card.attributes['data-miles-max']);
  const dayCount = Number(card.attributes['data-miles-day-count']);
  const capNote = all((n) => n.attributes?.['data-miles-cap-note'] === '1', card)[0]?.textContent ?? '';

  // Also verify 6-day fresh-cycle case where overhead + cycle binds on Day 6:
  // Mon Nov 9 06:00 -> Sat Nov 14 23:59 (6 days, 70h fresh, 75m overhead, 57 mph):
  //   Days 0..4: 5 * 11h = 55h drive (61h 15m cycle used), Day 5: 8h 45m - 1h 15m = 7h 30m drive.
  //   Total = 62h 30m (3750m) => round(3750 * 57 / 60) = 3,563 mi (< 6*11*57 = 3,762).
  const sixDay = M.evaluateMilesLeft({
    segments: [],
    now: chi(9, 6, 0),
    config: cfgChi70,
    milesAlreadyRun: 0,
    goalMiles: 3000,
    mph: 57,
    overheadMinutes: 75,
    cutoffDow: 6,
    cutoffHour: 23,
    cutoffMinuteOfHour: 59,
  });

  const ok = hoursMin === 4200
    && dayCount === 4
    && driveMin === 4 * 660
    && maxMiles === 4 * 11 * 57 // 2508 mi, strictly < naive 70*57=3990 and < (70-5)*57=3705
    && /11-hr daily driving limit/.test(capNote)
    && sixDay.dayCount === 6
    && sixDay.totalDriveMinutes === 3750
    && sixDay.maxLegalMiles === 3563;

  return ok || JSON.stringify({
    hoursMin, dayCount, driveMin, maxMiles, capNote,
    sixDay: { days: sixDay.dayCount, drive: sixDay.totalDriveMinutes, miles: sixDay.maxLegalMiles },
  });
});

/* ---------------- ML5: Verdict arithmetic (exact cushion, exact shortfall, goal-met state) ---------------- */
await pin('ML5. Verdict arithmetic: exact cushion (+196 mi), exact shortfall (-304 mi), and calm already-there state with tank', async () => {
  await seed(); // ML1_SEGS -> maxLegalMiles = 1,596 mi at 57 mph, 1h 15m overhead
  await openMilesViaHub();

  const rm = planRoom();
  const runInput = all((n) => n.attributes?.['data-miles-run-input'] === '1', rm)[0];
  const chip2800 = all((n) => n.attributes?.['data-miles-goal-chip'] === '2800', rm)[0];
  const chip3000 = all((n) => n.attributes?.['data-miles-goal-chip'] === '3000', rm)[0];
  if (!runInput || !chip2800 || !chip3000) return 'Missing run input or goal preset chips';

  // Case 1: Doable — 1,400 run + 1,596 left = 2,996 ceiling vs 2,800 goal => ~196 mi cushion
  fire(chip2800, 'click');
  await typeInto(runInput, '1400');
  await sleep(40);
  const cDoable = readCard();
  const vDoable = all((n) => n.attributes?.['data-miles-verdict'] === '1', cDoable)[0]?.textContent ?? '';
  const doableOk = cDoable.attributes['data-miles-status'] === 'doable'
    && Number(cDoable.attributes['data-miles-ceiling']) === 2996
    && Number(cDoable.attributes['data-miles-cushion']) === 196
    && /YES — doable, ~196 mi cushion/.test(vDoable);

  // Case 2: Short — 1,100 run + 1,596 left = 2,696 ceiling vs 3,000 goal => short 304 mi
  fire(chip3000, 'click');
  await typeInto(runInput, '1100');
  await sleep(40);
  const cShort = readCard();
  const vShort = all((n) => n.attributes?.['data-miles-verdict'] === '1', cShort)[0]?.textContent ?? '';
  const shortOk = cShort.attributes['data-miles-status'] === 'short'
    && Number(cShort.attributes['data-miles-ceiling']) === 2696
    && Number(cShort.attributes['data-miles-shortfall']) === 304
    && /Ceiling 2,696 mi — short 304 mi of your goal\./.test(vShort);

  // Case 3: Goal already met — 2,850 run vs 2,800 goal => calm "Already there", tank still visible
  fire(chip2800, 'click');
  await typeInto(runInput, '2850');
  await sleep(40);
  const cMet = readCard();
  const vMet = all((n) => n.attributes?.['data-miles-verdict'] === '1', cMet)[0]?.textContent ?? '';
  const metHours = all((n) => n.attributes?.['data-miles-hours-left'] === '1', cMet)[0]?.textContent?.trim() ?? '';
  const metMax = all((n) => n.attributes?.['data-miles-max-miles'] === '1', cMet)[0]?.textContent?.trim() ?? '';
  const metTrim = all((n) => n.attributes?.['data-miles-trim'] === '1', cMet)[0] ?? null;
  const metOk = cMet.attributes['data-miles-status'] === 'met'
    && /Already there/.test(vMet)
    && /2,850 mi/.test(vMet)
    && metHours === '33:00'
    && /~1,596 max legal miles/.test(metMax)
    && metTrim === null;

  return (doableOk && shortOk && metOk) || JSON.stringify({
    doableOk, vDoable, shortOk, vShort, metOk, vMet, metHours, metMax, hasTrim: !!metTrim,
  });
});

/* ---------------- ML6: Carrier-day boundary at 18:40 (not midnight), matching evaluate() ---------------- */
await pin('ML6. Carrier-day boundary: dayStartMinute = 18:40 drops off at 18:40 (not midnight) and matches evaluate()', async () => {
  // now = Thu Nov 12, 2026 12:00 CST inside carrier day [Wed Nov 11 18:40, Thu Nov 12 18:40).
  // Oldest day in 8-day window is [Wed Nov 4 18:40, Thu Nov 5 18:40): put 10h on Thu Nov 5 06:00->16:00.
  // Next 6 carrier days each have 8h (48h total). Total used = 58h -> remainingNow = 12h (720m).
  // The 10h drop-off lands at Thu Nov 12 18:40 (NOT midnight!).
  const NOW_THU_1200 = chi(12, 12, 0);
  const ML6_SEGS = [
    { status: 'D', start: chi(5, 6, 0), end: chi(5, 16, 0), createdAt: 1 },  // 10h -> drops Thu Nov 12 18:40!
    { status: 'D', start: chi(6, 6, 0), end: chi(6, 14, 0), createdAt: 2 },  // 8h
    { status: 'D', start: chi(7, 6, 0), end: chi(7, 14, 0), createdAt: 3 },  // 8h
    { status: 'D', start: chi(8, 6, 0), end: chi(8, 14, 0), createdAt: 4 },  // 8h
    { status: 'D', start: chi(9, 6, 0), end: chi(9, 14, 0), createdAt: 5 },  // 8h
    { status: 'D', start: chi(10, 6, 0), end: chi(10, 14, 0), createdAt: 6 }, // 8h
    { status: 'D', start: chi(11, 6, 0), end: chi(11, 14, 0), createdAt: 7 }, // 8h
  ];

  await seed({ nowOverride: NOW_THU_1200, segments: ML6_SEGS, config: cfgChi1840 });
  await openMilesViaHub();

  // Select Thu cutoff chip (default time 23:59 -> AFTER 18:40, BEFORE midnight!)
  const thuBtn = all((n) => n.localName === 'button' && n.attributes?.['data-miles-dow'] === '4', planRoom())[0];
  fire(thuBtn, 'click');
  await sleep(50);

  const cardAfter1840 = readCard();
  const afterMin = Number(cardAfter1840.attributes['data-miles-hours-min']);
  const afterTxt = all((n) => n.attributes?.['data-miles-hours-left'] === '1', cardAfter1840)[0]?.textContent?.trim() ?? '';
  const daysTxt = all((n) => n.attributes?.['data-miles-days'] === '1', planRoom())[0]?.textContent ?? '';
  const evAfter = E.evaluate(ML6_SEGS, { asOf: chi(12, 23, 59), config: cfgChi1840 });

  // Now change cutoff time to 18:00 (BEFORE 18:40) via shared ClockPick
  await setCutoffTimeViaClockPick(18, 0);
  const cardBefore1840 = readCard();
  const beforeMin = Number(cardBefore1840.attributes['data-miles-hours-min']);
  const beforeTxt = all((n) => n.attributes?.['data-miles-hours-left'] === '1', cardBefore1840)[0]?.textContent?.trim() ?? '';
  const evBefore = E.evaluate(ML6_SEGS, { asOf: chi(12, 18, 0), config: cfgChi1840 });

  const ok = evBefore.cycle.remaining === 720
    && evAfter.cycle.remaining === 1320
    && beforeMin === 720
    && beforeTxt === '12:00'
    && afterMin === 1320
    && afterTxt === '22:00'
    && /18:40/.test(daysTxt)
    && !/midnight/i.test(daysTxt);

  return ok || JSON.stringify({
    evBefore: evBefore.cycle.remaining, evAfter: evAfter.cycle.remaining,
    beforeMin, beforeTxt, afterMin, afterTxt, daysTxt,
  });
});

/* ---------------- ML7: Trim lever (only when short AND adds miles; exact re-simulated delta) ---------------- */
await pin('ML7. Trim lever: shown only when short AND trimming 30m/day adds miles; ~114 mi matches re-simulated delta', async () => {
  await seed(); // ML1_SEGS, 75m overhead, 57 mph -> 1,596 mi
  await openMilesViaHub();

  const rm = planRoom();
  const runInput = all((n) => n.attributes?.['data-miles-run-input'] === '1', rm)[0];
  const chip3000 = all((n) => n.attributes?.['data-miles-goal-chip'] === '3000', rm)[0];
  const chip2800 = all((n) => n.attributes?.['data-miles-goal-chip'] === '2800', rm)[0];

  // Case A: Short + cycle-bound -> trim 75m->45m adds +30m*4 = +120m (2h) * 57 = +114 mi (1,596 -> 1,710)
  fire(chip3000, 'click');
  await typeInto(runInput, '1100');
  await sleep(40);
  const cardShort = readCard();
  const trimNode = all((n) => n.attributes?.['data-miles-trim'] === '1', cardShort)[0] ?? null;
  const trimTxt = trimNode?.textContent?.trim() ?? '';
  const trimAddsAttr = Number(cardShort.attributes['data-miles-trim-adds']);

  // Independently re-simulate via the tool with overhead - 30m (45m)
  const reSim = M.evaluateMilesLeft({
    segments: ML1_SEGS,
    now: NOW_WED_0600,
    config: cfgChi70,
    milesAlreadyRun: 1100,
    goalMiles: 3000,
    mph: 57,
    overheadMinutes: 45,
    cutoffDow: 6,
    cutoffHour: 23,
    cutoffMinuteOfHour: 59,
  });
  const expectedDelta = reSim.maxLegalMiles - 1596; // 1710 - 1596 = 114

  // Case B: Doable -> trim lever HIDDEN
  fire(chip2800, 'click');
  await typeInto(runInput, '1400');
  await sleep(40);
  const trimWhenDoable = all((n) => n.attributes?.['data-miles-trim'] === '1', readCard())[0] ?? null;

  // Case C: Short + 11h-cap-bound (fresh 70h, 4 days, 0 run vs 3,000 goal => ceiling 2,508, trim adds 0) -> HIDDEN
  await seed({ segments: [] });
  await openMilesViaHub();
  const rm2 = planRoom();
  fire(all((n) => n.attributes?.['data-miles-goal-chip'] === '3000', rm2)[0], 'click');
  await sleep(40);
  const cardCapShort = readCard();
  const trimWhenCapBound = all((n) => n.attributes?.['data-miles-trim'] === '1', cardCapShort)[0] ?? null;

  // Case D: Short + overhead < 30m (15m) -> HIDDEN
  const lowOverhead = M.evaluateMilesLeft({
    segments: ML1_SEGS,
    now: NOW_WED_0600,
    config: cfgChi70,
    milesAlreadyRun: 0,
    goalMiles: 3000,
    mph: 57,
    overheadMinutes: 15,
    cutoffDow: 6,
    cutoffHour: 23,
    cutoffMinuteOfHour: 59,
  });

  const ok = expectedDelta === 114
    && trimAddsAttr === 114
    && trimTxt === 'Trimming 30m/day of overhead adds ~114 mi.'
    && trimWhenDoable === null
    && cardCapShort.attributes['data-miles-status'] === 'short'
    && Number(cardCapShort.attributes['data-miles-trim-adds']) === 0
    && trimWhenCapBound === null
    && lowOverhead.trimLeverLine === null;

  return ok || JSON.stringify({
    expectedDelta, trimAddsAttr, trimTxt,
    hasTrimDoable: !!trimWhenDoable,
    capStatus: cardCapShort.attributes['data-miles-status'],
    capTrimAdds: cardCapShort.attributes['data-miles-trim-adds'],
    hasTrimCap: !!trimWhenCapBound,
    lowOverheadTrim: lowOverhead.trimLeverLine,
  });
});

/* ---------------- ML8: Hygiene (12 hub items, zero input[type=time], zero new storage keys, framing) ---------------- */
await pin('ML8. Hygiene: Plan hub lists 12 items (Miles 12th), shared ClockPick (0 input[type=time]), 0 new storage keys, estimate framing & clean copy', async () => {
  await seed();
  const keysBefore = new Set([...mem.keys()]);

  const opened = await openMilesViaHub();
  if (!opened) return 'Could not open Miles Left in My 70';
  const titles = opened.items.map((b) => all((n) => n.localName === 'b', b)[0]?.textContent?.trim() ?? '');

  const rm = planRoom();
  const timeInputsInTab = all((n) => n.localName === 'input' && n.attributes?.type === 'time', rm);

  // Exercise shared timeOnly ClockPick sheet and verify zero <input type="time"> in MilesTab
  const timeBtn = all((n) => n.localName === 'button' && n.attributes?.['data-miles-cutoff-time-btn'] === '1', rm)[0];
  fire(timeBtn, 'click');
  await sleep(50);
  const sheet = all((n) => has(n, 'sheet'))[0];
  const hasClockPick = sheet
    ? all((n) => n.localName === 'input' && has(n, 'ed-clock-input'), sheet).length === 1
      && all((n) => n.localName === 'input' && has(n, 'ed-day-input'), sheet).length === 0
    : false;
  openSheet(null);
  await sleep(40);

  // Apply custom cutoff time via ClockPick (e.g. 17:30) and confirm display updates
  await setCutoffTimeViaClockPick(17, 30);
  const cutoffDisp = all((n) => n.attributes?.['data-miles-cutoff-display'] === '1', planRoom())[0]?.textContent ?? '';

  // Standing estimate framing + copy hygiene (no sleep/medical advice, no payroll/rate math)
  const standingTxt = all((n) => n.attributes?.['data-miles-standing'] === '1', planRoom())[0]?.textContent?.trim() ?? '';
  const bodyTxt = planRoom().textContent ?? '';
  const hasMedical = /\b(sleep|circadian|fatigue|tired|drowsy|medical|health|doctor|alertness|melatonin|nap)\b/i.test(bodyTxt);
  const hasPayroll = /(\$|cents per mile|\bcpm\b|\bpayroll\b|\bpaycheck\b|\brate per mile\b|\bearnings\b|\bdollar)/i.test(bodyTxt);

  // Back button closes cleanly to Plan hub
  const backBtn = all((n) => n.localName === 'button' && has(n, 'back'), planRoom())[0];
  fire(backBtn, 'click');
  await sleep(50);
  const closedClean = !A.isMilesPlannerOpen() && !has(planRoom(), 'is-active');

  const extraKeys = [...mem.keys()].filter((k) => !keysBefore.has(k));

  // Re-aimed (navy1 B1): Plan hub groups the 12 tools by time horizon; verify all 12 items and required titles present.
  const ok = opened.items.length === 12
    && titles.includes('Flip My Clock')
    && titles.includes('Miles Left in My 70')
    && timeInputsInTab.length === 0
    && hasClockPick
    && /17:30/.test(cutoffDisp)
    && standingTxt === M.MILES_STANDING_LINE
    && /estimate/i.test(standingTxt)
    && !hasMedical
    && !hasPayroll
    && closedClean
    && extraKeys.length === 0;

  return ok || JSON.stringify({
    hubCount: opened.items.length,
    lastTwo: titles.slice(-2),
    timeInputsInTab: timeInputsInTab.length,
    hasClockPick,
    cutoffDisp,
    standingTxt,
    hasMedical,
    hasPayroll,
    closedClean,
    extraKeys,
  });
});

/* ---------------- ML9: Fixture A (F1 day-0 clocks + F2 honest short/ceiling copy) ---------------- */
await pin('ML9. Fixture A (F1/F2): consumed day-0 clocks (10h D + 3h ON) => short verdict, day-0 drive <= 60m, honest no-34 copy', async () => {
  // Opus Fixture A:
  //   OFF Mon Nov 9 01:00 -> Wed Nov 11 04:00
  //   ON  Wed Nov 11 04:00 -> 07:00 (3h)
  //   D   Wed Nov 11 07:00 -> 17:00 (10h)
  //   now = Wed Nov 11 17:00 CST, goal 2,100 mi, 57 mph, overhead 1h 15m, cutoff Sat 23:59.
  //   Engine: driveRemaining = 60, windowRemaining = 60, breakRemaining = 0, driveNow = 0 (BREAK_30).
  //   Legal max: 30m (after 30m break) + 3 * 660m = 2,010m = 1,910 mi (at most 60 + 3*660 = 2,040m = 1,938 mi).
  //   Verdict MUST be 'short' (never 'doable').
  const NOW_WED_1700 = chi(11, 17, 0);
  const FIX_A_SEGS = [
    { status: 'OFF', start: chi(9, 1, 0), end: chi(11, 4, 0), createdAt: 1 },
    { status: 'ON', start: chi(11, 4, 0), end: chi(11, 7, 0), createdAt: 2 },
    { status: 'D', start: chi(11, 7, 0), end: chi(11, 17, 0), createdAt: 3 },
  ];

  await seed({ nowOverride: NOW_WED_1700, segments: FIX_A_SEGS, config: cfgChi70 });
  await openMilesViaHub();

  const rm = planRoom();
  const goalInput = all((n) => n.attributes?.['data-miles-goal-input'] === '1', rm)[0];
  await typeInto(goalInput, '2100');
  await sleep(40);

  const card = readCard();
  const status = card.attributes['data-miles-status'];
  const maxMiles = Number(card.attributes['data-miles-max']);
  const totalDrive = Number(card.attributes['data-miles-drive-min']);
  const verdictTxt = all((n) => n.attributes?.['data-miles-verdict'] === '1', card)[0]?.textContent ?? '';
  const maxTxt = all((n) => n.attributes?.['data-miles-max-miles'] === '1', card)[0]?.textContent ?? '';
  const cardTxt = card.textContent ?? '';

  const dayRows = all((n) => n.attributes?.['data-miles-day'] !== undefined, planRoom());
  const day0Row = dayRows.find((n) => n.attributes['data-miles-day'] === '0');
  const day0Drive = Number(day0Row?.attributes?.['data-miles-day-drive'] ?? -1);

  const evA = E.evaluate(FIX_A_SEGS, { asOf: NOW_WED_1700, config: cfgChi70 });

  const ok = evA.shift.driveRemaining === 60
    && evA.shift.windowRemaining === 60
    && status === 'short'
    && day0Drive >= 0
    && day0Drive <= 60
    && totalDrive <= 2040
    && maxMiles < 2100
    && /34/.test(verdictTxt)
    && /next pay week/i.test(verdictTxt)
    && /(without a 34|no 34)/i.test(cardTxt)
    && /(without a 34|no 34)/i.test(maxTxt);

  return ok || JSON.stringify({
    evDriveRem: evA.shift.driveRemaining,
    evWinRem: evA.shift.windowRemaining,
    status,
    day0Drive,
    totalDrive,
    maxMiles,
    verdictTxt,
    maxTxt,
  });
});

/* ---------------- ML10: Fixture B (F1 mid-rest, driveRemaining=0, cutoff tonight => 0 mi) ---------------- */
await pin('ML10. Fixture B (F1): mid-10h-rest (driveRemaining 0, cutoff tonight) yields 0 max legal miles + day-1 rest gate', async () => {
  // Opus Fixture B:
  //   OFF Nov 9 01:00 -> Nov 11 02:00, ON 02:00-03:00, D 03:00-14:00, OFF 14:00-15:00.
  //   now = Wed Nov 11 15:00 CST. 2,400 mi run, goal 2,600 mi, cutoff Wed 23:59.
  //   Engine: driveNow = 0 (DRIVE_11), driveRemaining = 0. Ongoing rest ends Thu 00:00 (> Wed 23:59).
  //   Legally 0 mi are possible before cutoff.
  const NOW_WED_1500 = chi(11, 15, 0);
  const FIX_B_SEGS = [
    { status: 'OFF', start: chi(9, 1, 0), end: chi(11, 2, 0), createdAt: 1 },
    { status: 'ON', start: chi(11, 2, 0), end: chi(11, 3, 0), createdAt: 2 },
    { status: 'D', start: chi(11, 3, 0), end: chi(11, 14, 0), createdAt: 3 },
    { status: 'OFF', start: chi(11, 14, 0), end: chi(11, 15, 0), createdAt: 4 },
  ];

  await seed({ nowOverride: NOW_WED_1500, segments: FIX_B_SEGS, config: cfgChi70 });
  await openMilesViaHub();

  const rm = planRoom();
  const runInput = all((n) => n.attributes?.['data-miles-run-input'] === '1', rm)[0];
  const goalInput = all((n) => n.attributes?.['data-miles-goal-input'] === '1', rm)[0];
  const wedBtn = all((n) => n.localName === 'button' && n.attributes?.['data-miles-dow'] === '3', rm)[0];
  await typeInto(runInput, '2400');
  await typeInto(goalInput, '2600');
  fire(wedBtn, 'click');
  await sleep(50);

  const card = readCard();
  const status = card.attributes['data-miles-status'];
  const maxMiles = Number(card.attributes['data-miles-max']);
  const totalDrive = Number(card.attributes['data-miles-drive-min']);
  const ceiling = Number(card.attributes['data-miles-ceiling']);
  const shortfall = Number(card.attributes['data-miles-shortfall']);

  // Also verify inter-shift 10h rest gate on Day 1:
  // Driver finishes 11h shift at Wed 18:00 (now = Wed 18:00), cutoff = Thu 08:00.
  // 10h rest ends Thu 04:00 -> only 4h (240m) wall left on Thu -> drive <= 240 - 75 = 165m!
  const lateShift = M.evaluateMilesLeft({
    segments: [
      { status: 'OFF', start: chi(9, 1, 0), end: chi(11, 6, 0), createdAt: 1 },
      { status: 'ON', start: chi(11, 6, 0), end: chi(11, 7, 0), createdAt: 2 },
      { status: 'D', start: chi(11, 7, 0), end: chi(11, 18, 0), createdAt: 3 },
    ],
    now: chi(11, 18, 0),
    config: cfgChi70,
    milesAlreadyRun: 0,
    goalMiles: 500,
    mph: 57,
    overheadMinutes: 75,
    cutoffDow: 4, // Thu
    cutoffHour: 8,
    cutoffMinuteOfHour: 0,
  });

  const ok = status === 'short'
    && totalDrive === 0
    && maxMiles === 0
    && ceiling === 2400
    && shortfall === 200
    && lateShift.days.length === 2
    && lateShift.days[0].driveMinutes === 0
    && lateShift.days[1].wallMinutes === 240
    && lateShift.days[1].driveMinutes === 165;

  return ok || JSON.stringify({
    status, totalDrive, maxMiles, ceiling, shortfall,
    lateDays: lateShift.days.map((d) => ({ i: d.dayIndex, wall: d.wallMinutes, drive: d.driveMinutes })),
  });
});

/* ---------------- ML11: F3 over-cycle sum, F4 14h window cap wording, F5 boundary note, break & row-sum nits ---------------- */
await pin('ML11. F3/F4/F5 + nits: over-cycle line sums to headline, 4h overhead names 14h window cap, 18:40 boundary note, 0-overhead 30m break & row reconciliation', async () => {
  const parseHMM = (s) => {
    const m = /^(\d+):(\d{2})$/.exec(s.trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };

  // F3: Over-cycle log (ON 06:00-18:00 Nov 4..10 = 84h used; now Wed Nov 11 06:00; cutoff Sat 23:59)
  // Headline = 22:00 (1320m); assumptions line parts MUST sum to 1320 (not "0:00 now + 36:00 recaps").
  const OVER_SEGS = [];
  for (let d = 4; d <= 10; d++) {
    OVER_SEGS.push({ status: 'ON', start: chi(d, 6, 0), end: chi(d, 18, 0), createdAt: d });
  }
  await seed({ nowOverride: NOW_WED_0600, segments: OVER_SEGS, config: cfgChi70 });
  await openMilesViaHub();
  const cardF3 = readCard();
  const f3HoursMin = Number(cardF3.attributes['data-miles-hours-min']);
  const f3HoursTxt = all((n) => n.attributes?.['data-miles-hours-left'] === '1', cardF3)[0]?.textContent?.trim() ?? '';
  const f3Assump = all((n) => n.attributes?.['data-miles-assumptions'] === '1', cardF3)[0]?.textContent ?? '';
  const f3Match = /(\d+:\d{2})\s+now\s+\+\s+(\d+:\d{2})\s+(?:net\s+)?recaps/i.exec(f3Assump);
  const f3PartSum = f3Match ? parseHMM(f3Match[1]) + parseHMM(f3Match[2]) : NaN;
  const f3Ok = f3HoursMin === 1320 && f3HoursTxt === '22:00' && f3PartSum === 1320;

  // F4: 4h overhead (240m) on fresh 70h log -> 14h window binds (600m < 660m); cap note MUST name 14-hr window, NOT 11-hr limit
  await seed({ nowOverride: NOW_WED_0600, segments: [], config: cfgChi70 });
  await openMilesViaHub();
  const rmF4 = planRoom();
  const boxWrap = all((n) => n.attributes?.['data-miles-overhead-box'] === '1', rmF4)[0];
  const durInputs = all((n) => n.localName === 'input', boxWrap);
  await typeInto(durInputs[0], '4');
  await typeInto(durInputs[1], '0');
  const goalInputF4 = all((n) => n.attributes?.['data-miles-goal-input'] === '1', rmF4)[0];
  await typeInto(goalInputF4, '5000');
  await sleep(40);
  const cardF4 = readCard();
  const f4CapNote = all((n) => n.attributes?.['data-miles-cap-note'] === '1', cardF4)[0]?.textContent ?? '';
  const f4Ok = /14-hr/i.test(f4CapNote) && !/11-hr/i.test(f4CapNote);

  // F5: 18:40 carrier day start with cutoff exactly at Sat 18:40 (vs Sat 18:39) -> parity preserved + miles identical + boundary note shown
  const ML6_SEGS = [
    { status: 'D', start: chi(5, 6, 0), end: chi(5, 16, 0), createdAt: 1 },
    { status: 'D', start: chi(6, 6, 0), end: chi(6, 14, 0), createdAt: 2 },
    { status: 'D', start: chi(7, 6, 0), end: chi(7, 14, 0), createdAt: 3 },
    { status: 'D', start: chi(8, 6, 0), end: chi(8, 14, 0), createdAt: 4 },
    { status: 'D', start: chi(9, 6, 0), end: chi(9, 14, 0), createdAt: 5 },
    { status: 'D', start: chi(10, 6, 0), end: chi(10, 14, 0), createdAt: 6 },
    { status: 'D', start: chi(11, 6, 0), end: chi(11, 14, 0), createdAt: 7 },
  ];
  const f5AtBoundary = M.evaluateMilesLeft({
    segments: ML6_SEGS,
    now: chi(12, 12, 0),
    config: cfgChi1840,
    milesAlreadyRun: 0,
    goalMiles: 2000,
    mph: 57,
    overheadMinutes: 75,
    cutoffDow: 6, // Sat 18:40 exact boundary
    cutoffHour: 18,
    cutoffMinuteOfHour: 40,
  });
  const f5Before = M.evaluateMilesLeft({
    segments: ML6_SEGS,
    now: chi(12, 12, 0),
    config: cfgChi1840,
    milesAlreadyRun: 0,
    goalMiles: 2000,
    mph: 57,
    overheadMinutes: 75,
    cutoffDow: 6, // Sat 18:39 (1m before boundary)
    cutoffHour: 18,
    cutoffMinuteOfHour: 39,
  });
  const evF5 = E.evaluate(ML6_SEGS, { asOf: chi(14, 18, 40), config: cfgChi1840 });
  const f5Ok = f5AtBoundary.cycleThroughCutoffMinutes === evF5.cycle.remaining
    && f5AtBoundary.maxLegalMiles === f5Before.maxLegalMiles
    && f5AtBoundary.boundaryDropAtCutoffMinutes === 480
    && typeof f5AtBoundary.boundaryDropNote === 'string'
    && /cutoff/i.test(f5AtBoundary.boundaryDropNote);

  // Break NIT: overhead = 0, fresh log, 9h 00m (540m) partial day -> MUST subtract 30m break => 510m drive (not 540m)
  const brkRes = M.evaluateMilesLeft({
    segments: [],
    now: chi(14, 14, 59),
    config: cfgChi70,
    milesAlreadyRun: 0,
    goalMiles: 1000,
    mph: 57,
    overheadMinutes: 0,
    cutoffDow: 6, // Sat 23:59 -> 540m wall
    cutoffHour: 23,
    cutoffMinuteOfHour: 59,
  });
  const brkOk = brkRes.days.length === 1 && brkRes.days[0].wallMinutes === 540 && brkRes.days[0].driveMinutes === 510;

  // Row-sum NIT: 3 days each with 100m drive at 55 mph => exact 91.6667 each, total = 275;
  // individual Math.round would sum to 276, reconciled displayMiles MUST sum to 275.
  // Construct 3 days with 100m availCycle each (overhead = 0):
  //   Thu Nov 5: 100m (drops Fri 13), Fri Nov 6: 100m (drops Sat 14), Sat Nov 7..Tue Nov 10: 66h40m total (remainingNow = 100m)
  const ROW_SEGS = [
    { status: 'ON', start: chi(4, 8, 0), end: chi(4, 9, 40), createdAt: 1 },   // 100m drops Thu 12
    { status: 'ON', start: chi(5, 8, 0), end: chi(5, 9, 40), createdAt: 2 },   // 100m drops Fri 13
    { status: 'ON', start: chi(6, 0, 0), end: chi(6, 20, 0), createdAt: 3 },   // 20h
    { status: 'ON', start: chi(7, 0, 0), end: chi(7, 20, 0), createdAt: 4 },   // 20h
    { status: 'ON', start: chi(8, 0, 0), end: chi(8, 20, 0), createdAt: 5 },   // 20h
    { status: 'ON', start: chi(9, 0, 0), end: chi(9, 5, 0), createdAt: 6 },    // 5h => total 68h20m -> rem = 100m
  ];
  const rowRes = M.evaluateMilesLeft({
    segments: ROW_SEGS,
    now: NOW_WED_0600,
    config: cfgChi70,
    milesAlreadyRun: 0,
    goalMiles: 500,
    mph: 55,
    overheadMinutes: 0,
    cutoffDow: 5, // Fri 23:59 -> Wed(100m), Thu(100m), Fri(100m)
    cutoffHour: 23,
    cutoffMinuteOfHour: 59,
  });
  const rowSum = rowRes.days.reduce((acc, d) => acc + (d.displayMiles ?? Math.round(d.driveMilesExact)), 0);
  const rowOk = rowRes.totalDriveMinutes === 300 && rowRes.maxLegalMiles === 275 && rowSum === 275;

  const ok = f3Ok && f4Ok && f5Ok && brkOk && rowOk;
  return ok || JSON.stringify({
    f3: { f3Ok, f3HoursMin, f3HoursTxt, f3Assump, f3PartSum },
    f4: { f4Ok, f4CapNote },
    f5: { f5Ok, hours: f5AtBoundary.cycleThroughCutoffMinutes, evRem: evF5.cycle.remaining, bDrop: f5AtBoundary.boundaryDropAtCutoffMinutes, bNote: f5AtBoundary.boundaryDropNote },
    brk: { brkOk, wall: brkRes.days[0]?.wallMinutes, drive: brkRes.days[0]?.driveMinutes },
    row: { rowOk, totalDrive: rowRes.totalDriveMinutes, maxMiles: rowRes.maxLegalMiles, rowSum },
  });
});

let fail = 0;
for (const [st, name, why] of res) {
  console.log(`${st.padEnd(5)} ${name}${why ? '\n      ' + why : ''}`);
  if (st !== 'PASS') fail++;
}
console.log(`\n${res.length - fail}/${res.length} miles pins passed`);
process.exit(fail ? 1 : 0);

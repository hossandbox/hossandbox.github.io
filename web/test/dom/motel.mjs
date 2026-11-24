// Do I Make It Back or Motel? — Meet-and-Turn & Relay Wait Cutoff Timer (Plan tool #9).
// Pins M1–M8: exact cutoff math, Big Day (+2h & drive feasibility), drive & 70-hr cycle
// infeasibility (no invented cutoff), 30-min break credit, past-cutoff red motel state &
// CFR-cited dispatch alert, hook-chip minute-for-minute delta, saved lane persistence,
// and miles-vs-drive-time mode parity.
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
let Tms = new Date(2026, 10, 11, 1, 53, 0).getTime();
Date.now = () => Tms;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'motel';
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
const M = await import('../../src/motel.ts');
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

const cfgChi = { ...S.INITIAL_STATE.config, cycle: '70/8', dayStartHour: 0, dayStartMinute: 0, timeZone: 'America/Chicago', shortHaul: false };
const chi = (d, h0, m0 = 0) => E.localToMinute(2026, 11, d, h0, 'America/Chicago') + m0;

// Overnight linehaul meet-and-turn fixture:
// - 10h OFF reset Tue Nov 10 08:00 -> 18:00 CST
// - Shift starts Tue 18:00 CST -> 14h window ends Wed 08:00 CST (16h Big Day ends Wed 10:00 CST)
// - Pre-trip ON 18:00 -> 18:30 (30m), outbound D 18:30 -> 23:30 (5h 00m drive -> 6h 00m drive left)
// - Waiting OFF 23:30 -> now (at 01:53: 143m non-driving stretch, >= 30m break covered)
// - 70h cycle used = 5h 30m -> 64h 30m left
const NOW_0153 = chi(11, 1, 53);
const MEET_SEGS = [
  { status: 'OFF', start: chi(10, 8, 0), end: chi(10, 18, 0), createdAt: 1 },
  { status: 'ON', start: chi(10, 18, 0), end: chi(10, 18, 30), createdAt: 2 },
  { status: 'D', start: chi(10, 18, 30), end: chi(10, 23, 30), createdAt: 3 },
  { status: 'OFF', start: chi(10, 23, 30), end: NOW_0153, createdAt: 4 },
];

const seed = async (rec) => {
  openSheet(null);
  M.clearMotelDraft();
  A.openWeekPlanner(false);
  A.openRolloutPlanner(false);
  A.openRescuePlanner(false);
  A.openStackPlanner(false);
  A.openMotelPlanner(false);
  A.openLegalPlanner(false);
  A.openFlipPlanner(false);
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
    mph: 55,
    config: cfgChi,
    ...rec,
  });
  await sleep(60);
};

render(h(App, {}), root);
await sleep(100);
const planPage = () => all((n) => n.localName === 'section' && has(n, 'page-plan'))[0];
const planRoom = () => all((n) => n.localName === 'section' && has(n, 'plan-room'))[0];
const openMotelViaHub = async () => {
  const pg = planPage();
  const items = all((n) => n.localName === 'button' && has(n, 'plan-item'), pg);
  const btn = items.find((b) => /Do I Make It Back or Motel\?/.test(b.textContent));
  if (!btn) return null;
  fire(btn, 'click');
  await sleep(60);
  return { items, btn, rm: planRoom() };
};

/* ---------------- M1: 14-hr window binds -> cutoff = windowEnd - returnDrive - hook, exact minute ---------------- */
await pin('M1. 14-hr window binds: exact cutoff = windowEnd - returnDrive - hook, live tick, Plan hub placement & zero <input type="time">', async () => {
  // Hand-check: windowEnd = Wed 08:00; returnDrive = 275 mi @ 55 mph = 300m (5h 00m); hook = 30m.
  // cutoff = 08:00 - 5h 00m - 30m = 02:30. At now = 01:53 -> waitLeft = 37m. Back if roll now = 07:23.
  const r = M.evaluateMotel({
    segments: MEET_SEGS,
    now: NOW_0153,
    config: cfgChi,
    distanceMode: 'miles',
    miles: 275,
    mph: 55,
    driveMinutesDirect: 300,
    hookMinutes: 30,
    bigDay: false,
  });
  const wantCutoff = chi(11, 2, 30);
  if (r.status !== 'ready' || r.cutoffMinute !== wantCutoff || r.cutoffHM !== '02:30' || r.waitLeftMinutes !== 37) {
    return `math mismatch: status=${r.status} cutoff=${r.cutoffMinute} (want ${wantCutoff}) hm=${r.cutoffHM} waitLeft=${r.waitLeftMinutes}`;
  }
  if (r.backIfRollNowHM !== '07:23' || r.backAtCutoffHM !== '08:00') {
    return `back ETA mismatch: now=${r.backIfRollNowHM} atCutoff=${r.backAtCutoffHM}`;
  }
  if (!/Must roll by 02:35|Must roll by 02:30/.test(r.headline) || !/Must roll by 02:30 — 37m of wait left/.test(r.headline)) {
    return `headline mismatch: "${r.headline}"`;
  }
  if (r.binding !== 'WINDOW_14' || !/14-hr window — 49 CFR 395\.3\(a\)\(2\)/.test(r.bindingText)) {
    return `binding mismatch: ${r.binding} "${r.bindingText}"`;
  }

  // DOM check: Plan hub 9th button -> opens MotelTab verdict-first, enters 275 mi, checks live tick +10m
  await seed({ tab: 'plan', nowOverride: NOW_0153, segments: MEET_SEGS, current: { status: 'OFF', since: chi(10, 23, 30), createdAt: 4 } });
  const opened = await openMotelViaHub();
  if (!opened || opened.items.length !== 11) return `Plan hub count=${opened?.items.length}`;
  const ninthTitle = all((n) => n.localName === 'b', opened.items[8])[0]?.textContent?.trim();
  if (ninthTitle !== 'Do I Make It Back or Motel?') return `9th title="${ninthTitle}"`;
  const rm = opened.rm;
  const timeInputs = all((n) => n.localName === 'input' && n.attributes?.type === 'time', rm);
  if (timeInputs.length !== 0) return `found ${timeInputs.length} <input type="time">`;

  const milesIn = all((n) => n.localName === 'input' && n.attributes?.['data-motel-miles'] === '1', rm)[0];
  milesIn.value = '275'; fire(milesIn, 'input'); await sleep(40);
  const verdictEl = all((n) => n.attributes?.['data-motel-verdict'] === '1', rm)[0];
  const cutoffHmBefore = all((n) => n.attributes?.['data-motel-cutoff-hm'] === '1', rm)[0]?.textContent?.trim() ?? '';
  const headlineBefore = all((n) => n.attributes?.['data-motel-headline'] === '1', rm)[0]?.textContent ?? '';
  const ruleBefore = all((n) => n.attributes?.['data-motel-rule'] === '1', rm)[0]?.textContent ?? '';
  const cutoffAttrBefore = verdictEl?.attributes?.['data-motel-cutoff'] ?? '';
  const inputsEl = all((n) => n.attributes?.['data-motel-inputs'] === '1', rm)[0];
  const rmText = rm.textContent;
  const verdictFirst = verdictEl && inputsEl && rmText.indexOf(verdictEl.textContent) < rmText.indexOf(inputsEl.textContent);

  // Advance simulated clock by +10m (01:53 -> 02:03) -> wait left ticks from 37m to 27m while cutoff stays 02:30
  setState({ nowOverride: NOW_0153 + 10 }); await sleep(50);
  const headlineAfterTick = all((n) => n.attributes?.['data-motel-headline'] === '1', rm)[0]?.textContent ?? '';

  const ok = verdictFirst
    && cutoffAttrBefore === String(wantCutoff)
    && cutoffHmBefore === '02:30'
    && /Must roll by 02:30 — 37m of wait left/.test(headlineBefore)
    && /14-hr window — 49 CFR 395\.3\(a\)\(2\)/.test(ruleBefore)
    && /Must roll by 02:30 — 27m of wait left/.test(headlineAfterTick);

  return ok || JSON.stringify({
    verdictFirst,
    cutoffAttrBefore,
    cutoffHmBefore,
    headlineBefore,
    ruleBefore,
    headlineAfterTick,
  });
});

/* ---------------- M2: Big Day ON -> cutoff extends 2h; drive feasibility still enforced ---------------- */
await pin('M2. Big Day ON extends cutoff by +2h with eligibility warning; drive feasibility still enforced (infeasible stays infeasible)', async () => {
  // Base feasible trip: 275 mi @ 55 mph = 5h 00m drive (6h drive left -> feasible), 30m hook
  // 14h cutoff = 02:30; 16h Big Day cutoff = 04:30 (exact +120m)
  const r14 = M.evaluateMotel({
    segments: MEET_SEGS, now: NOW_0153, config: cfgChi,
    distanceMode: 'miles', miles: 275, mph: 55, driveMinutesDirect: 300, hookMinutes: 30, bigDay: false,
  });
  const r16 = M.evaluateMotel({
    segments: MEET_SEGS, now: NOW_0153, config: cfgChi,
    distanceMode: 'miles', miles: 275, mph: 55, driveMinutesDirect: 300, hookMinutes: 30, bigDay: true,
  });
  if (r16.status !== 'ready' || r16.cutoffMinute !== (r14.cutoffMinute ?? 0) + 120 || r16.cutoffHM !== '04:30') {
    return `16h delta wrong: 14h=${r14.cutoffMinute} (${r14.cutoffHM}) 16h=${r16.cutoffMinute} (${r16.cutoffHM}) status=${r16.status}`;
  }
  if (r16.binding !== 'WINDOW_16' || !/16-hr Big Day — 49 CFR 395\.1\(o\)/.test(r16.bindingText)) {
    return `16h binding wrong: ${r16.binding} "${r16.bindingText}"`;
  }
  if (!/previous 5 duty tours/i.test(r16.bigDayEligibilityWarning) || !/once in 7 days/i.test(r16.bigDayEligibilityWarning) || !/34-hour/i.test(r16.bigDayEligibilityWarning)) {
    return `missing eligibility warning text: "${r16.bigDayEligibilityWarning}"`;
  }

  // Infeasible on drive time: 385 mi @ 55 mph = 7h 00m drive > 6h 00m drive remaining.
  // Big Day ON must STILL be infeasible (11h drive does NOT expand under §395.1(o)).
  const rInf16 = M.evaluateMotel({
    segments: MEET_SEGS, now: NOW_0153, config: cfgChi,
    distanceMode: 'miles', miles: 385, mph: 55, driveMinutesDirect: 420, hookMinutes: 30, bigDay: true,
  });
  if (rInf16.status !== 'infeasible' || rInf16.driveFeasible !== false || rInf16.cutoffMinute !== null) {
    return `Big Day bypassed drive feasibility: status=${rInf16.status} driveFeas=${rInf16.driveFeasible} cutoff=${rInf16.cutoffMinute}`;
  }

  // DOM check: toggling Big Day checkbox shows warning and shifts cutoff +2h in DOM
  await seed({ tab: 'plan', nowOverride: NOW_0153, segments: MEET_SEGS, current: { status: 'OFF', since: chi(10, 23, 30), createdAt: 4 } });
  const { rm } = await openMotelViaHub();
  const milesIn = all((n) => n.localName === 'input' && n.attributes?.['data-motel-miles'] === '1', rm)[0];
  milesIn.value = '275'; fire(milesIn, 'input'); await sleep(30);
  const warnBefore = all((n) => n.attributes?.['data-motel-bigday-warn'] === '1', rm)[0];
  const bigChk = all((n) => n.localName === 'input' && n.attributes?.['data-motel-bigday'] === '1', rm)[0];
  bigChk.checked = true; fire(bigChk, 'change'); await sleep(40);
  const warnAfter = all((n) => n.attributes?.['data-motel-bigday-warn'] === '1', rm)[0];
  const cutoffHm = all((n) => n.attributes?.['data-motel-cutoff-hm'] === '1', rm)[0]?.textContent?.trim();
  const ruleTxt = all((n) => n.attributes?.['data-motel-rule'] === '1', rm)[0]?.textContent ?? '';

  const ok = !warnBefore && !!warnAfter
    && /previous 5 duty tours/i.test(warnAfter.textContent)
    && /once in 7 days/i.test(warnAfter.textContent)
    && cutoffHm === '04:30'
    && /16-hr Big Day — 49 CFR 395\.1\(o\)/.test(ruleTxt);
  return ok || JSON.stringify({ warnBefore: !!warnBefore, warnAfter: warnAfter?.textContent, cutoffHm, ruleTxt });
});

/* ---------------- M3: return drive > drive remaining -> infeasible verdict, NO cutoff time available (+ 70-hr cycle check) ---------------- */
await pin('M3. Return drive > drive remaining (and cycle shortfall): infeasible red verdict, no cutoff time presented as available', async () => {
  // 385 mi @ 55 mph = 7h 00m drive > 6h 00m drive remaining -> infeasible on drive time
  const rDrv = M.evaluateMotel({
    segments: MEET_SEGS, now: NOW_0153, config: cfgChi,
    distanceMode: 'miles', miles: 385, mph: 55, driveMinutesDirect: 420, hookMinutes: 30, bigDay: false,
  });
  if (rDrv.status !== 'infeasible' || rDrv.tone !== 'bad' || rDrv.cutoffMinute !== null || rDrv.cutoffHM !== null) {
    return `drive infeasible wrong: status=${rDrv.status} tone=${rDrv.tone} cutoff=${rDrv.cutoffMinute}`;
  }
  if (!/can't make it back on drive time, even rolling now/i.test(rDrv.headline)) {
    return `drive infeasible headline wrong: "${rDrv.headline}"`;
  }
  if (/Must roll by/i.test(rDrv.headline) || /Must roll by/i.test(rDrv.dispatchText)) {
    return `must not invent cutoff when drive infeasible: headline="${rDrv.headline}" dispatch="${rDrv.dispatchText}"`;
  }

  // DOM check for drive-infeasible: no cutoff-block rendered and data-motel-cutoff is empty
  await seed({ tab: 'plan', nowOverride: NOW_0153, segments: MEET_SEGS, current: { status: 'OFF', since: chi(10, 23, 30), createdAt: 4 } });
  const { rm } = await openMotelViaHub();
  const milesIn = all((n) => n.localName === 'input' && n.attributes?.['data-motel-miles'] === '1', rm)[0];
  milesIn.value = '385'; fire(milesIn, 'input'); await sleep(40);
  const vEl = all((n) => n.attributes?.['data-motel-verdict'] === '1', rm)[0];
  const cutoffBlk = all((n) => n.attributes?.['data-motel-cutoff-block'] === '1', rm)[0];
  if (vEl?.attributes?.['data-motel-status'] !== 'infeasible' || vEl?.attributes?.['data-motel-cutoff'] !== '' || cutoffBlk) {
    return `DOM showed cutoff when drive infeasible: status=${vEl?.attributes?.['data-motel-status']} attr=${vEl?.attributes?.['data-motel-cutoff']} blk=${!!cutoffBlk}`;
  }
  if (/Must roll by/i.test(vEl?.textContent ?? '')) return `DOM contains "Must roll by" on infeasible: ${vEl.textContent}`;

  // 70-hr cycle infeasibility check: 66h used over prior 6 days -> 4h 00m left on 70h cycle;
  // fresh 11h drive & 14h window, return needs 4h 00m drive + 30m hook = 4h 30m > 4h 00m cycle!
  const cycleSegs = [];
  for (let d = 5; d <= 10; d++) {
    cycleSegs.push({ status: 'D', start: chi(d, 6, 0), end: chi(d, 14, 0), createdAt: d * 2 });
    cycleSegs.push({ status: 'ON', start: chi(d, 14, 0), end: chi(d, 17, 0), createdAt: d * 2 + 1 });
  }
  // 6 days * 11h = 66h used, ends Nov 10 17:00; 10h+ OFF -> Wed Nov 11 06:00 fresh shift, 4h left on 70h
  cycleSegs.push({ status: 'OFF', start: chi(10, 17, 0), end: chi(11, 6, 0), createdAt: 99 });
  const rCyc = M.evaluateMotel({
    segments: cycleSegs, now: chi(11, 6, 0), config: cfgChi,
    distanceMode: 'miles', miles: 220, mph: 55, driveMinutesDirect: 240, hookMinutes: 30, bigDay: false,
  });
  const cycOk = rCyc.status === 'infeasible'
    && rCyc.driveFeasible === true
    && rCyc.cycleFeasible === false
    && rCyc.cutoffMinute === null
    && /not enough left on your 70/i.test(rCyc.headline)
    && /395\.3\(b\)\(2\)/.test(rCyc.bindingText);
  return cycOk || JSON.stringify({
    status: rCyc.status, driveFeas: rCyc.driveFeasible, cycleFeas: rCyc.cycleFeasible,
    cutoff: rCyc.cutoffMinute, headline: rCyc.headline, bindingText: rCyc.bindingText,
  });
});

/* ---------------- M4: 30-minute break stretch >=30m vs <30m with exact N ---------------- */
await pin('M4. 30-min break: non-driving stretch >=30m -> break-covered line; <30m -> minutes-short line with exact N', async () => {
  // Case A: stopped driving at 23:30, ON 23:30-23:45 + OFF 23:45-00:10 = 40m non-driving (>= 30m)
  const segs40 = [
    { status: 'OFF', start: chi(10, 8, 0), end: chi(10, 18, 0), createdAt: 1 },
    { status: 'D', start: chi(10, 18, 0), end: chi(10, 23, 30), createdAt: 2 },
    { status: 'ON', start: chi(10, 23, 30), end: chi(10, 23, 45), createdAt: 3 },
    { status: 'OFF', start: chi(10, 23, 45), end: chi(11, 0, 10), createdAt: 4 },
  ];
  const r40 = M.evaluateMotel({
    segments: segs40, now: chi(11, 0, 10), config: cfgChi,
    distanceMode: 'miles', miles: 220, mph: 55, driveMinutesDirect: 240, hookMinutes: 30, bigDay: false,
  });
  const wantCovered = 'This wait already covers your 30-minute break — no extra stop needed on the way back (as long as the wait counts as off duty, sleeper, or on duty not driving).';
  if (r40.currentNonDriveMinutes !== 40 || !r40.breakCovered || r40.breakMinutesShort !== 0 || r40.breakLine !== wantCovered) {
    return `>=30m case wrong: nonDrive=${r40.currentNonDriveMinutes} covered=${r40.breakCovered} short=${r40.breakMinutesShort} line="${r40.breakLine}"`;
  }

  // Case B: stopped driving at 23:30, ON 23:30-23:48 = 18m non-driving.
  // Hook counts as non-driving:
  //   - hook 0m  -> N = 12 minutes short
  //   - hook 5m  -> N = 7 minutes short
  //   - hook 30m -> 18 + 30 = 48m >= 30m -> break already covered (short = 0)
  const segs18 = [
    { status: 'OFF', start: chi(10, 8, 0), end: chi(10, 18, 0), createdAt: 1 },
    { status: 'D', start: chi(10, 18, 0), end: chi(10, 23, 30), createdAt: 2 },
    { status: 'ON', start: chi(10, 23, 30), end: chi(10, 23, 48), createdAt: 3 },
  ];
  const r18h0 = M.evaluateMotel({
    segments: segs18, now: chi(10, 23, 48), config: cfgChi,
    distanceMode: 'miles', miles: 220, mph: 55, driveMinutesDirect: 240, hookMinutes: 0, bigDay: false,
  });
  const wantShort12 = 'Another 12 minutes of this wait covers your 30-minute break.';
  if (r18h0.currentNonDriveMinutes !== 18 || r18h0.breakCovered || r18h0.breakMinutesShort !== 12 || r18h0.breakLine !== wantShort12) {
    return `<30m (0m hook) case wrong: nonDrive=${r18h0.currentNonDriveMinutes} covered=${r18h0.breakCovered} short=${r18h0.breakMinutesShort} line="${r18h0.breakLine}"`;
  }
  const r18h5 = M.evaluateMotel({
    segments: segs18, now: chi(10, 23, 48), config: cfgChi,
    distanceMode: 'miles', miles: 220, mph: 55, driveMinutesDirect: 240, hookMinutes: 5, bigDay: false,
  });
  if (r18h5.breakCovered || r18h5.breakMinutesShort !== 7 || !/Another 7 minutes/.test(r18h5.breakLine)) {
    return `<30m (5m hook) case wrong: covered=${r18h5.breakCovered} short=${r18h5.breakMinutesShort} line="${r18h5.breakLine}"`;
  }
  const r18h30 = M.evaluateMotel({
    segments: segs18, now: chi(10, 23, 48), config: cfgChi,
    distanceMode: 'miles', miles: 220, mph: 55, driveMinutesDirect: 240, hookMinutes: 30, bigDay: false,
  });
  if (!r18h30.breakCovered || r18h30.breakMinutesShort !== 0) {
    return `<30m (30m hook covers break) case wrong: covered=${r18h30.breakCovered} short=${r18h30.breakMinutesShort} line="${r18h30.breakLine}"`;
  }

  // DOM verification: default 30m hook covers the remaining 12m; setting custom hook to 0m shows N=12
  await seed({ tab: 'plan', nowOverride: chi(10, 23, 48), segments: segs18, current: { status: 'ON', since: chi(10, 23, 30), createdAt: 3 } });
  const { rm } = await openMotelViaHub();
  const brk30 = all((n) => n.attributes?.['data-motel-break'] === '1', rm)[0];
  const cov30 = brk30?.attributes?.['data-motel-break-covered'];
  const short30 = brk30?.attributes?.['data-motel-break-short'];
  const hookBoxWrap = all((n) => n.attributes?.['data-motel-hook-box'] === '1', rm)[0];
  const hIn = all((n) => n.localName === 'input' && /hours/i.test(n.attributes?.['aria-label'] ?? ''), hookBoxWrap)[0];
  const mIn = all((n) => n.localName === 'input' && /minutes/i.test(n.attributes?.['aria-label'] ?? ''), hookBoxWrap)[0];
  hIn.value = '0'; fire(hIn, 'input'); await sleep(20);
  mIn.value = '0'; fire(mIn, 'input'); await sleep(30);
  const brk0 = all((n) => n.attributes?.['data-motel-break'] === '1', rm)[0];
  const ok = cov30 === '1' && short30 === '0'
    && brk0?.attributes?.['data-motel-break-covered'] === '0'
    && brk0?.attributes?.['data-motel-break-short'] === '12'
    && brk0.textContent.includes(wantShort12);
  return ok || JSON.stringify({ cov30, short30, cov0: brk0?.attributes?.['data-motel-break-covered'], short0: brk0?.attributes?.['data-motel-break-short'], text0: brk0?.textContent });
});

/* ---------------- M5: cutoff in the past -> red motel/repower state + dispatch alert with cutoff & CFR cite ---------------- */
await pin('M5. Cutoff in the past: red motel/repower state; dispatch alert includes cutoff time and CFR cite', async () => {
  // Shift starts Tue 18:00 -> 14h window ends Wed 08:00. Return = 330 mi @ 55 mph = 6h 00m (360m), hook = 10m -> cutoff = 01:50.
  // Or return = 275 mi @ 55 mph = 5h 00m, hook = 30m -> cutoff = 02:30. At now = 03:10 -> 40m past cutoff!
  const now0310 = chi(11, 3, 10);
  const segsPast = [
    { status: 'OFF', start: chi(10, 8, 0), end: chi(10, 18, 0), createdAt: 1 },
    { status: 'ON', start: chi(10, 18, 0), end: chi(10, 18, 30), createdAt: 2 },
    { status: 'D', start: chi(10, 18, 30), end: chi(10, 23, 30), createdAt: 3 },
    { status: 'OFF', start: chi(10, 23, 30), end: now0310, createdAt: 4 },
  ];
  const rPast = M.evaluateMotel({
    segments: segsPast, now: now0310, config: cfgChi,
    distanceMode: 'miles', miles: 275, mph: 55, driveMinutesDirect: 300, hookMinutes: 30, bigDay: false,
  });
  const wantLine = 'Cutoff was 02:30. Waiting longer means a motel or a repower.';
  if (rPast.status !== 'passed' || rPast.tone !== 'bad' || rPast.sign !== 'stop' || rPast.waitLeftMinutes !== -40) {
    return `past status wrong: status=${rPast.status} tone=${rPast.tone} sign=${rPast.sign} waitLeft=${rPast.waitLeftMinutes}`;
  }
  if (rPast.headline !== wantLine) return `past headline wrong: "${rPast.headline}"`;
  if (!rPast.dispatchText.includes('02:30') || !rPast.dispatchText.includes('49 CFR 395.3(a)(2)') || !/motel|repower/i.test(rPast.dispatchText)) {
    return `past dispatch alert missing cutoff/cite: "${rPast.dispatchText}"`;
  }

  // Also verify Big Day ON past cutoff uses 49 CFR 395.1(o)
  const now0500 = chi(11, 5, 0);
  const segsPast16 = [...segsPast.slice(0, 3), { status: 'OFF', start: chi(10, 23, 30), end: now0500, createdAt: 4 }];
  const rPast16 = M.evaluateMotel({
    segments: segsPast16, now: now0500, config: cfgChi,
    distanceMode: 'miles', miles: 275, mph: 55, driveMinutesDirect: 300, hookMinutes: 30, bigDay: true,
  });
  if (rPast16.status !== 'passed' || !rPast16.dispatchText.includes('04:30') || !rPast16.dispatchText.includes('49 CFR 395.1(o)')) {
    return `Big Day past dispatch wrong: status=${rPast16.status} text="${rPast16.dispatchText}"`;
  }

  // DOM verification
  await seed({ tab: 'plan', nowOverride: now0310, segments: segsPast, current: { status: 'OFF', since: chi(10, 23, 30), createdAt: 4 } });
  const { rm } = await openMotelViaHub();
  const milesIn = all((n) => n.localName === 'input' && n.attributes?.['data-motel-miles'] === '1', rm)[0];
  milesIn.value = '275'; fire(milesIn, 'input'); await sleep(40);
  const vEl = all((n) => n.attributes?.['data-motel-verdict'] === '1', rm)[0];
  const dispEl = all((n) => n.attributes?.['data-motel-dispatch'] === '1', rm)[0];
  const copyBtn = all((n) => n.localName === 'button' && n.attributes?.['data-motel-copy-btn'] === '1', rm)[0];
  const ok = vEl?.attributes?.['data-motel-status'] === 'passed'
    && vEl.textContent.includes(wantLine)
    && !!copyBtn
    && !!dispEl && dispEl.textContent.includes('02:30') && dispEl.textContent.includes('49 CFR 395.3(a)(2)');
  return ok || JSON.stringify({ status: vEl?.attributes?.['data-motel-status'], disp: dispEl?.textContent });
});

/* ---------------- M6: hook chips move cutoff minute-for-minute (15m vs 60m = 45m difference) ---------------- */
await pin('M6. Hook preset chips (15m / 30m / 45m / 60m) and custom duration box move cutoff minute-for-minute (15m vs 60m = 45m)', async () => {
  await seed({ tab: 'plan', nowOverride: NOW_0153, segments: MEET_SEGS, current: { status: 'OFF', since: chi(10, 23, 30), createdAt: 4 } });
  const { rm } = await openMotelViaHub();
  const milesIn = all((n) => n.localName === 'input' && n.attributes?.['data-motel-miles'] === '1', rm)[0];
  milesIn.value = '275'; fire(milesIn, 'input'); await sleep(30);

  const chip = (m) => all((n) => n.localName === 'button' && n.attributes?.['data-motel-hook-chip'] === String(m), rm)[0];
  const c15 = chip(15), c30 = chip(30), c45 = chip(45), c60 = chip(60);
  if (!c15 || !c30 || !c45 || !c60) return `missing hook chips: 15=${!!c15} 30=${!!c30} 45=${!!c45} 60=${!!c60}`;

  const readCutoff = () => Number(all((n) => n.attributes?.['data-motel-verdict'] === '1', rm)[0]?.attributes?.['data-motel-cutoff']);
  fire(c15, 'click'); await sleep(30);
  const t15 = readCutoff();
  const hm15 = all((n) => n.attributes?.['data-motel-cutoff-hm'] === '1', rm)[0]?.textContent?.trim();

  fire(c60, 'click'); await sleep(30);
  const t60 = readCutoff();
  const hm60 = all((n) => n.attributes?.['data-motel-cutoff-hm'] === '1', rm)[0]?.textContent?.trim();

  // Also test custom hook duration box: 1h 15m (75m) -> 15m earlier than 60m chip (01:45)
  const hookBoxWrap = all((n) => n.attributes?.['data-motel-hook-box'] === '1', rm)[0];
  const hIn = all((n) => n.localName === 'input' && /hours/i.test(n.attributes?.['aria-label'] ?? ''), hookBoxWrap)[0];
  const mIn = all((n) => n.localName === 'input' && /minutes/i.test(n.attributes?.['aria-label'] ?? ''), hookBoxWrap)[0];
  hIn.value = '1'; fire(hIn, 'input'); await sleep(20);
  mIn.value = '15'; fire(mIn, 'input'); await sleep(30);
  const t75 = readCutoff();
  const hm75 = all((n) => n.attributes?.['data-motel-cutoff-hm'] === '1', rm)[0]?.textContent?.trim();

  const ok = t15 === chi(11, 2, 45) && hm15 === '02:45'
    && t60 === chi(11, 2, 0) && hm60 === '02:00'
    && (t15 - t60) === 45
    && t75 === chi(11, 1, 45) && hm75 === '01:45';
  return ok || JSON.stringify({ t15, hm15, t60, hm60, diff: t15 - t60, t75, hm75 });
});

/* ---------------- M7: in-session lane defaults persist across leaving/re-entering; Big Day resets OFF; honest copy ---------------- */
await pin('M7. Session lane defaults (miles/mph/hook) persist across leaving and re-entering; Big Day resets OFF; honest session copy; zero new storage keys', async () => {
  await seed({ tab: 'plan', nowOverride: NOW_0153, segments: MEET_SEGS, current: { status: 'OFF', since: chi(10, 23, 30), createdAt: 4 } });
  const { rm } = await openMotelViaHub();

  // F3 copy check: must NOT claim "saved automatically for next time"; must use honest session wording
  const rmTextInit = rm.textContent;
  if (/for next time/i.test(rmTextInit) || /saved automatically/i.test(rmTextInit)) {
    return `lane copy overclaims persistence: found forbidden wording in "${rmTextInit.slice(rmTextInit.indexOf('Return leg') - 20)}"`;
  }
  if (!/while the app stays open/i.test(rmTextInit)) {
    return 'lane copy missing honest session wording ("while the app stays open")';
  }

  // Customize lane: 165 mi @ 60 mph, 45m hook, Big Day ON
  const milesIn = all((n) => n.localName === 'input' && n.attributes?.['data-motel-miles'] === '1', rm)[0];
  const mphIn = all((n) => n.localName === 'input' && n.attributes?.['data-motel-mph'] === '1', rm)[0];
  const chip45 = all((n) => n.localName === 'button' && n.attributes?.['data-motel-hook-chip'] === '45', rm)[0];
  const bigChk = all((n) => n.localName === 'input' && n.attributes?.['data-motel-bigday'] === '1', rm)[0];
  milesIn.value = '165'; fire(milesIn, 'input'); await sleep(20);
  mphIn.value = '60'; fire(mphIn, 'input'); await sleep(20);
  fire(chip45, 'click'); await sleep(20);
  // Capture 14h cutoff BEFORE turning Big Day ON (165 mi @ 60 mph = 165m + 45m hook = 210m -> 08:00 - 3h30m = 04:30)
  const cutoff14Before = all((n) => n.attributes?.['data-motel-verdict'] === '1', rm)[0]?.attributes?.['data-motel-cutoff'];
  bigChk.checked = true; fire(bigChk, 'change'); await sleep(40);
  const cutoff16Before = all((n) => n.attributes?.['data-motel-verdict'] === '1', rm)[0]?.attributes?.['data-motel-cutoff'];
  if (Number(cutoff16Before) !== Number(cutoff14Before) + 120) {
    return `Big Day did not extend cutoff before leaving: 14h=${cutoff14Before} 16h=${cutoff16Before}`;
  }

  // Leave via Back button
  const backBtn = all((n) => n.localName === 'button' && has(n, 'back'), rm)[0];
  fire(backBtn, 'click'); await sleep(280);
  if (A.isMotelPlannerOpen()) return 'Back did not close Motel tool';

  // Re-enter via Plan hub button: miles/mph/hook kept, Big Day MUST reset to OFF!
  await openMotelViaHub();
  const rm2 = planRoom();
  const readVal = (n) => (n?.value !== undefined ? String(n.value) : String(n?.attributes?.value ?? ''));
  const readChk = (n) => Boolean(n?.checked ?? (n?.attributes?.checked !== undefined && n.attributes.checked !== false && n.attributes.checked !== 'false'));
  const milesAfterBack = readVal(all((n) => n.localName === 'input' && n.attributes?.['data-motel-miles'] === '1', rm2)[0]);
  const mphAfterBack = readVal(all((n) => n.localName === 'input' && n.attributes?.['data-motel-mph'] === '1', rm2)[0]);
  const chip45On = has(all((n) => n.localName === 'button' && n.attributes?.['data-motel-hook-chip'] === '45', rm2)[0], 'on');
  const bigAfterBack = readChk(all((n) => n.localName === 'input' && n.attributes?.['data-motel-bigday'] === '1', rm2)[0]);
  const cutoffAfterBack = all((n) => n.attributes?.['data-motel-verdict'] === '1', rm2)[0]?.attributes?.['data-motel-cutoff'];

  // Turn Big Day ON again, leave by switching to Now tab, then return -> Big Day MUST reset OFF again
  const bigChk2 = all((n) => n.localName === 'input' && n.attributes?.['data-motel-bigday'] === '1', rm2)[0];
  bigChk2.checked = true; fire(bigChk2, 'change'); await sleep(30);
  setState({ tab: 'now' }); await sleep(280);
  setState({ tab: 'plan' }); await sleep(60);
  await openMotelViaHub();
  const rm3 = planRoom();
  const milesAfterTab = readVal(all((n) => n.localName === 'input' && n.attributes?.['data-motel-miles'] === '1', rm3)[0]);
  const bigAfterTab = readChk(all((n) => n.localName === 'input' && n.attributes?.['data-motel-bigday'] === '1', rm3)[0]);

  // Verify F3 compliance: zero new localStorage keys
  const allowed = new Set(['hos-sandbox-v1', 'hos-sandbox-v1-backup', 'hos-sandbox-v1-sim', 'hos-sandbox-undo-v1']);
  const extraKeys = [...mem.keys()].filter((k) => !allowed.has(k));

  const ok = String(milesAfterBack) === '165'
    && String(mphAfterBack) === '60'
    && chip45On
    && bigAfterBack === false
    && cutoffAfterBack === cutoff14Before
    && String(milesAfterTab) === '165'
    && bigAfterTab === false
    && extraKeys.length === 0;
  return ok || JSON.stringify({
    milesAfterBack, mphAfterBack, chip45On, bigAfterBack,
    cutoff14Before, cutoffAfterBack, milesAfterTab, bigAfterTab, extraKeys,
  });
});

/* ---------------- M8: miles mode and drive-time mode produce identical cutoff for the same trip ---------------- */
await pin('M8. Miles mode and drive-time mode produce the identical cutoff for the same trip (math + DOM toggle)', async () => {
  // Math parity check 1: 220 mi @ 55 mph == 4h 00m (240m), 30m hook -> cutoff = 03:30
  const rMiles55 = M.evaluateMotel({
    segments: MEET_SEGS, now: NOW_0153, config: cfgChi,
    distanceMode: 'miles', miles: 220, mph: 55, driveMinutesDirect: 999, hookMinutes: 30, bigDay: false,
  });
  const rTime55 = M.evaluateMotel({
    segments: MEET_SEGS, now: NOW_0153, config: cfgChi,
    distanceMode: 'time', miles: 999, mph: 55, driveMinutesDirect: 240, hookMinutes: 30, bigDay: false,
  });
  // Math parity check 2: 180 mi @ 60 mph == 3h 00m (180m), 45m hook -> cutoff = 04:15
  const rMiles60 = M.evaluateMotel({
    segments: MEET_SEGS, now: NOW_0153, config: cfgChi,
    distanceMode: 'miles', miles: 180, mph: 60, driveMinutesDirect: 999, hookMinutes: 45, bigDay: false,
  });
  const rTime60 = M.evaluateMotel({
    segments: MEET_SEGS, now: NOW_0153, config: cfgChi,
    distanceMode: 'time', miles: 999, mph: 60, driveMinutesDirect: 180, hookMinutes: 45, bigDay: false,
  });
  if (rMiles55.cutoffMinute !== chi(11, 3, 30) || rMiles55.cutoffMinute !== rTime55.cutoffMinute || rMiles55.returnDriveMinutes !== rTime55.returnDriveMinutes) {
    return `55mph parity mismatch: miles=${rMiles55.cutoffMinute} (${rMiles55.returnDriveMinutes}m) time=${rTime55.cutoffMinute} (${rTime55.returnDriveMinutes}m)`;
  }
  if (rMiles60.cutoffMinute !== chi(11, 4, 15) || rMiles60.cutoffMinute !== rTime60.cutoffMinute || rMiles60.returnDriveMinutes !== rTime60.returnDriveMinutes) {
    return `60mph parity mismatch: miles=${rMiles60.cutoffMinute} (${rMiles60.returnDriveMinutes}m) time=${rTime60.cutoffMinute} (${rTime60.returnDriveMinutes}m)`;
  }

  // Math parity check 3 (non-round ratio): 137 mi @ 53 mph = 155.094m -> ceil = 156m == time mode 156m
  const rMilesNonRound = M.evaluateMotel({
    segments: MEET_SEGS, now: NOW_0153, config: cfgChi,
    distanceMode: 'miles', miles: 137, mph: 53, driveMinutesDirect: 999, hookMinutes: 30, bigDay: false,
  });
  const rTimeNonRound = M.evaluateMotel({
    segments: MEET_SEGS, now: NOW_0153, config: cfgChi,
    distanceMode: 'time', miles: 999, mph: 53, driveMinutesDirect: 156, hookMinutes: 30, bigDay: false,
  });
  if (rMilesNonRound.returnDriveMinutes !== 156 || rMilesNonRound.cutoffMinute !== rTimeNonRound.cutoffMinute) {
    return `non-round ceil parity mismatch: miles=${rMilesNonRound.returnDriveMinutes}m (${rMilesNonRound.cutoffHM}) time=${rTimeNonRound.returnDriveMinutes}m (${rTimeNonRound.cutoffHM})`;
  }

  // DOM toggle parity: enter 275 mi @ 55 mph (= 5h 00m) in miles mode, then switch to time mode and enter 5h 00m
  await seed({ tab: 'plan', nowOverride: NOW_0153, segments: MEET_SEGS, current: { status: 'OFF', since: chi(10, 23, 30), createdAt: 4 } });
  const { rm } = await openMotelViaHub();
  const milesIn = all((n) => n.localName === 'input' && n.attributes?.['data-motel-miles'] === '1', rm)[0];
  milesIn.value = '275'; fire(milesIn, 'input'); await sleep(30);
  const cutoffMilesDom = all((n) => n.attributes?.['data-motel-verdict'] === '1', rm)[0]?.attributes?.['data-motel-cutoff'];
  const hmMilesDom = all((n) => n.attributes?.['data-motel-cutoff-hm'] === '1', rm)[0]?.textContent?.trim();

  const timeModeBtn = all((n) => n.localName === 'button' && n.attributes?.['data-motel-mode'] === 'time', rm)[0];
  fire(timeModeBtn, 'click'); await sleep(30);
  const driveBoxWrap = all((n) => n.attributes?.['data-motel-drive-box'] === '1', rm)[0];
  const dhIn = all((n) => n.localName === 'input' && /hours/i.test(n.attributes?.['aria-label'] ?? ''), driveBoxWrap)[0];
  const dmIn = all((n) => n.localName === 'input' && /minutes/i.test(n.attributes?.['aria-label'] ?? ''), driveBoxWrap)[0];
  dhIn.value = '5'; fire(dhIn, 'input'); await sleep(20);
  dmIn.value = '0'; fire(dmIn, 'input'); await sleep(30);
  const cutoffTimeDom = all((n) => n.attributes?.['data-motel-verdict'] === '1', rm)[0]?.attributes?.['data-motel-cutoff'];
  const hmTimeDom = all((n) => n.attributes?.['data-motel-cutoff-hm'] === '1', rm)[0]?.textContent?.trim();

  const ok = cutoffMilesDom === String(chi(11, 2, 30))
    && cutoffTimeDom === cutoffMilesDom
    && hmMilesDom === '02:30'
    && hmTimeDom === '02:30';
  return ok || JSON.stringify({ cutoffMilesDom, hmMilesDom, cutoffTimeDom, hmTimeDom });
});

/* ---------------- M9 (F1): ON-duty waiting burns 70-hr cycle (oldest day 0h so nothing rolls off at midnight) ---------------- */
await pin('M9. F1: ON-duty waiting near 70-hr cycle (0h oldest day, no roll-off): CYCLE binds cutoff, rule pill & dispatch cite 49 CFR 395.3(b)', async () => {
  // Opus probe fixture (Chicago, 70/8, carrier day 00:00):
  // 8-day window on Nov 10 is Nov 3..Nov 10. Nov 3 = 0h (so NOTHING rolls off at midnight Nov 10->11!).
  // Days Nov 4..9 = 6 days * 10h 07m (607m) ON each = 3642m (60h 42m).
  // Today Nov 10: 10h+ OFF before 17:00, D 17:00-21:00 (240m), waiting ON 21:00-21:30 (30m), now = Nov 10 21:30.
  // Cycle used = 3912m -> cycleRemaining = 288m (4h 48m).
  // Return = 3h 00m (180m = 165 mi @ 55 mph), hook = 30m -> returnDuty = 210m.
  // Window ends Nov 11 07:00 -> window cutoff = 03:30 (6h 00m wait).
  // ON-duty cycle cutoff = 21:30 + (288 - 210) = 22:48 (1h 18m wait left)!
  const now2130 = chi(10, 21, 30);
  const segsCycle = [];
  for (let d = 4; d <= 9; d++) {
    segsCycle.push({ status: 'ON', start: chi(d, 6, 0), end: chi(d, 16, 7), createdAt: d * 10 });
  }
  segsCycle.push({ status: 'OFF', start: chi(9, 16, 7), end: chi(10, 17, 0), createdAt: 99 });
  segsCycle.push({ status: 'D', start: chi(10, 17, 0), end: chi(10, 21, 0), createdAt: 100 });
  segsCycle.push({ status: 'ON', start: chi(10, 21, 0), end: now2130, createdAt: 101 });

  const rOn = M.evaluateMotel({
    segments: segsCycle, now: now2130, config: cfgChi,
    distanceMode: 'miles', miles: 165, mph: 55, driveMinutesDirect: 180, hookMinutes: 30, bigDay: false,
    currentStatus: 'ON',
  });
  const wantCutoff = chi(10, 22, 48);
  if (rOn.status !== 'ready' || rOn.cutoffMinute !== wantCutoff || rOn.cutoffHM !== '22:48' || rOn.waitLeftMinutes !== 78) {
    return `ON-duty cycle cutoff wrong: status=${rOn.status} cutoff=${rOn.cutoffMinute} (want ${wantCutoff}) hm=${rOn.cutoffHM} waitLeft=${rOn.waitLeftMinutes}`;
  }
  if (rOn.binding !== 'CYCLE' || !/49 CFR 395\.3\(b\)/.test(rOn.bindingText) || !/70-hr cycle/i.test(rOn.headline)) {
    return `CYCLE binding/headline wrong: binding=${rOn.binding} rule="${rOn.bindingText}" headline="${rOn.headline}"`;
  }
  if (!rOn.dispatchText.includes('22:48') || !/49 CFR 395\.3\(b\)/.test(rOn.dispatchText)) {
    return `CYCLE dispatch alert wrong: "${rOn.dispatchText}"`;
  }

  // End-to-end engine legality check at cutoff (0 violations) and cutoff + 1 (CYCLE+1 violation)
  const sim = (rollAt) => E.evaluate([
    ...segsCycle,
    { status: 'ON', start: now2130, end: rollAt, createdAt: 200 },
    { status: 'ON', start: rollAt, end: rollAt + 30, createdAt: 201 },
    { status: 'D', start: rollAt + 30, end: rollAt + 30 + 180, createdAt: 202 },
  ], { asOf: rollAt + 210, config: cfgChi });
  const evAt = sim(wantCutoff);
  const evPlus1 = sim(wantCutoff + 1);
  if (evAt.violations.length !== 0) {
    return `sim at 22:48 not legal: ${JSON.stringify(evAt.violations)}`;
  }
  if (!evPlus1.violations.some((v) => v.kind === 'CYCLE' && v.minutes === 1)) {
    return `sim at 22:49 did not trigger CYCLE+1: ${JSON.stringify(evPlus1.violations)}`;
  }

  // Zero-margin ON-duty edge: return = 4h 18m (258m) + 30m hook = 288m == cycleRemaining (0m margin)
  const rZero = M.evaluateMotel({
    segments: segsCycle, now: now2130, config: cfgChi,
    distanceMode: 'time', miles: 0, mph: 55, driveMinutesDirect: 258, hookMinutes: 30, bigDay: false,
    currentStatus: 'ON',
  });
  if (rZero.status !== 'ready' || rZero.cutoffMinute !== now2130 || rZero.waitLeftMinutes !== 0 || rZero.binding !== 'CYCLE' || rZero.tone !== 'warn') {
    return `0m-margin ON-duty cycle wrong: status=${rZero.status} cutoff=${rZero.cutoffHM} wait=${rZero.waitLeftMinutes} binding=${rZero.binding} tone=${rZero.tone}`;
  }

  // Contrast: waiting OFF duty does NOT burn cycle -> full 14h window cutoff 03:30 binds
  const rOff = M.evaluateMotel({
    segments: segsCycle, now: now2130, config: cfgChi,
    distanceMode: 'miles', miles: 165, mph: 55, driveMinutesDirect: 180, hookMinutes: 30, bigDay: false,
    currentStatus: 'OFF',
  });
  if (rOff.cutoffMinute !== chi(11, 3, 30) || rOff.binding !== 'WINDOW_14') {
    return `OFF-duty contrast wrong: cutoff=${rOff.cutoffHM} binding=${rOff.binding}`;
  }

  // DOM check: render with ON currentStatus, enter 165 mi, verify 22:48 + CYCLE binding + 395.3(b) cite
  await seed({
    tab: 'plan', nowOverride: now2130,
    segments: segsCycle.slice(0, -1),
    current: { status: 'ON', since: chi(10, 21, 0), createdAt: 101 },
  });
  const { rm } = await openMotelViaHub();
  const milesIn = all((n) => n.localName === 'input' && n.attributes?.['data-motel-miles'] === '1', rm)[0];
  milesIn.value = '165'; fire(milesIn, 'input'); await sleep(40);
  const vEl = all((n) => n.attributes?.['data-motel-verdict'] === '1', rm)[0];
  const hmDom = all((n) => n.attributes?.['data-motel-cutoff-hm'] === '1', rm)[0]?.textContent?.trim();
  const ruleDom = all((n) => n.attributes?.['data-motel-rule'] === '1', rm)[0]?.textContent ?? '';
  const dispDom = all((n) => n.attributes?.['data-motel-dispatch'] === '1', rm)[0]?.textContent ?? '';
  const ok = vEl?.attributes?.['data-motel-binding'] === 'CYCLE'
    && hmDom === '22:48'
    && /49 CFR 395\.3\(b\)/.test(ruleDom)
    && dispDom.includes('22:48') && /49 CFR 395\.3\(b\)/.test(dispDom);
  return ok || JSON.stringify({ binding: vEl?.attributes?.['data-motel-binding'], hmDom, ruleDom, dispDom });
});

/* ---------------- M10 (F2): 30-min break integrated into cutoff, roll-now ETA, and hook-covers-break ---------------- */
await pin('M10. F2: 30-min break pulls cutoff -30m when waitLeft < need (Opus probe -> passed), hook>=need leaves cutoff unchanged, roll-now ETA includes en-route break', async () => {
  // Opus probe (p5.ts): Shift opened Nov 10 10:00 (window ends Nov 11 00:00),
  // D 13:00-20:00 (7h straight, breakRemaining = 60m), pulled in ON at 20:00, now = 20:05 (currentNonDrive = 5m).
  const now2005 = chi(10, 20, 5);
  const segsP5 = [
    { status: 'OFF', start: chi(10, 0, 0), end: chi(10, 10, 0), createdAt: 1 },
    { status: 'ON', start: chi(10, 10, 0), end: chi(10, 10, 15), createdAt: 2 },
    { status: 'OFF', start: chi(10, 10, 15), end: chi(10, 13, 0), createdAt: 3 },
    { status: 'D', start: chi(10, 13, 0), end: chi(10, 20, 0), createdAt: 4 },
    { status: 'ON', start: chi(10, 20, 0), end: now2005, createdAt: 5 },
  ];

  // Case A (Opus probe): return 3h 40m (220m), hook 0m.
  // Base window cutoff = 00:00 - 220m = 20:20 (waitLeft = 15m), but need = 30 - 5 - 0 = 25m > 15m
  // and breakRemaining (60m) < returnDrive (220m) -> cutoff -= 30 -> 19:50 (already PASSED, -15m)!
  const rProbe = M.evaluateMotel({
    segments: segsP5, now: now2005, config: cfgChi,
    distanceMode: 'time', miles: 0, mph: 55, driveMinutesDirect: 220, hookMinutes: 0, bigDay: false,
    currentStatus: 'ON',
  });
  const wantPassed = chi(10, 19, 50);
  if (rProbe.status !== 'passed' || rProbe.tone !== 'bad' || rProbe.cutoffMinute !== wantPassed || rProbe.cutoffHM !== '19:50' || rProbe.waitLeftMinutes !== -15) {
    return `Opus probe F2 failed: status=${rProbe.status} tone=${rProbe.tone} cutoff=${rProbe.cutoffHM} (want 19:50) waitLeft=${rProbe.waitLeftMinutes}`;
  }
  if (!/395\.3\(a\)\(3\)\(ii\)/.test(rProbe.bindingText) || !/395\.3\(a\)\(3\)\(ii\)/.test(rProbe.subline) || !/395\.3\(a\)\(3\)\(ii\)/.test(rProbe.dispatchText)) {
    return `Opus probe missing 395.3(a)(3)(ii) cite: rule="${rProbe.bindingText}" sub="${rProbe.subline}" disp="${rProbe.dispatchText}"`;
  }

  // Case B (hook covers break: hook >= 30 - currentNonDrive -> need = 0 -> cutoff unchanged):
  // Same log (currentNonDrive = 5m, breakRemaining = 60m), return 3h 15m (195m), hook 25m (5 + 25 = 30m -> need = 0).
  // Cutoff stays 00:00 - 195 - 25 = 20:20 (15m left, ROLL SOON), roll-now ETA = 20:05 + 25 + 195 = 23:45 (no extra +30m!).
  const rHookCov = M.evaluateMotel({
    segments: segsP5, now: now2005, config: cfgChi,
    distanceMode: 'time', miles: 0, mph: 55, driveMinutesDirect: 195, hookMinutes: 25, bigDay: false,
    currentStatus: 'ON',
  });
  const want2020 = chi(10, 20, 20);
  if (rHookCov.status !== 'ready' || rHookCov.cutoffMinute !== want2020 || rHookCov.cutoffHM !== '20:20' || rHookCov.waitLeftMinutes !== 15 || !rHookCov.breakCovered || rHookCov.breakMinutesShort !== 0 || rHookCov.backIfRollNowHM !== '23:45') {
    return `hook-covers-break wrong: status=${rHookCov.status} cutoff=${rHookCov.cutoffHM} wait=${rHookCov.waitLeftMinutes} cov=${rHookCov.breakCovered} short=${rHookCov.breakMinutesShort} rollNow=${rHookCov.backIfRollNowHM}`;
  }
  // Verify hook-covers-break is legal at cutoff (20:20) and WINDOW_14+1 at 20:21
  const simHook = (rollAt) => E.evaluate([
    ...segsP5,
    { status: 'ON', start: now2005, end: rollAt, createdAt: 200 },
    { status: 'ON', start: rollAt, end: rollAt + 25, createdAt: 201 },
    { status: 'D', start: rollAt + 25, end: rollAt + 25 + 195, createdAt: 202 },
  ], { asOf: rollAt + 220, config: cfgChi });
  if (simHook(want2020).violations.length !== 0) {
    return `hook-covers-break sim at 20:20 not legal: ${JSON.stringify(simHook(want2020).violations)}`;
  }
  if (!simHook(want2020 + 1).violations.some((v) => v.kind === 'WINDOW_14' && v.minutes === 1)) {
    return `hook-covers-break sim at 20:21 did not trigger WINDOW_14+1: ${JSON.stringify(simHook(want2020 + 1).violations)}`;
  }

  // Case C (F2(a) roll-now ETA includes +30m en-route break when stretch + hook < 30 and breakRemaining < returnDrive):
  // Same log (currentNonDrive = 5m, breakRemaining = 60m), return 3h 00m (180m), hook 0m.
  // Cutoff = 21:00 (waitLeft = 55m >= need 25m -> cutoff unchanged, backAtCutoff = 00:00).
  // Rolling NOW at 20:05 needs 30m en-route break -> backIfRollNow = 20:05 + 180 + 30 = 23:35 (NOT 23:05!).
  const rEta = M.evaluateMotel({
    segments: segsP5, now: now2005, config: cfgChi,
    distanceMode: 'time', miles: 0, mph: 55, driveMinutesDirect: 180, hookMinutes: 0, bigDay: false,
    currentStatus: 'ON',
  });
  if (rEta.status !== 'ready' || rEta.cutoffHM !== '21:00' || rEta.backIfRollNowHM !== '23:35' || rEta.backAtCutoffHM !== '00:00') {
    return `F2(a) roll-now ETA wrong: status=${rEta.status} cutoff=${rEta.cutoffHM} rollNow=${rEta.backIfRollNowHM} (want 23:35) atCutoff=${rEta.backAtCutoffHM}`;
  }

  // DOM check for Opus probe (time mode 3h 40m, hook 0m -> CUTOFF PASSED 19:50 citing 395.3(a)(3)(ii))
  await seed({
    tab: 'plan', nowOverride: now2005,
    segments: segsP5.slice(0, -1),
    current: { status: 'ON', since: chi(10, 20, 0), createdAt: 5 },
  });
  const { rm } = await openMotelViaHub();
  fire(all((n) => n.localName === 'button' && n.attributes?.['data-motel-mode'] === 'time', rm)[0], 'click'); await sleep(20);
  const dWrap = all((n) => n.attributes?.['data-motel-drive-box'] === '1', rm)[0];
  const dh = all((n) => n.localName === 'input' && /hours/i.test(n.attributes?.['aria-label'] ?? ''), dWrap)[0];
  const dm = all((n) => n.localName === 'input' && /minutes/i.test(n.attributes?.['aria-label'] ?? ''), dWrap)[0];
  dh.value = '3'; fire(dh, 'input'); await sleep(15);
  dm.value = '40'; fire(dm, 'input'); await sleep(15);
  const hWrap = all((n) => n.attributes?.['data-motel-hook-box'] === '1', rm)[0];
  const hh = all((n) => n.localName === 'input' && /hours/i.test(n.attributes?.['aria-label'] ?? ''), hWrap)[0];
  const hm = all((n) => n.localName === 'input' && /minutes/i.test(n.attributes?.['aria-label'] ?? ''), hWrap)[0];
  hh.value = '0'; fire(hh, 'input'); await sleep(15);
  hm.value = '0'; fire(hm, 'input'); await sleep(40);
  const vEl = all((n) => n.attributes?.['data-motel-verdict'] === '1', rm)[0];
  const hmDom = all((n) => n.attributes?.['data-motel-cutoff-hm'] === '1', rm)[0]?.textContent?.trim();
  const ok = vEl?.attributes?.['data-motel-status'] === 'passed'
    && hmDom === '19:50'
    && /395\.3\(a\)\(3\)\(ii\)/.test(vEl.textContent);
  return ok || JSON.stringify({ status: vEl?.attributes?.['data-motel-status'], hmDom, text: vEl?.textContent?.slice(0, 240) });
});

/* ---------------- M11 (F4): out-of-range mph shows visible "Still using N mph" note and agrees on blur ---------------- */
await pin('M11. F4: out-of-range typed mph shows visible "Still using N mph" note and snaps back on blur so input, "at N mph" line, and math agree', async () => {
  await seed({ tab: 'plan', nowOverride: NOW_0153, segments: MEET_SEGS, current: { status: 'OFF', since: chi(10, 23, 30), createdAt: 4 } });
  const { rm } = await openMotelViaHub();
  const mphIn = all((n) => n.localName === 'input' && n.attributes?.['data-motel-mph'] === '1', rm)[0];
  const readVal = (n) => (n?.value !== undefined ? String(n.value) : String(n?.attributes?.value ?? ''));

  // Type out-of-range low value "20" (< 25)
  mphIn.value = '20'; fire(mphIn, 'input'); await sleep(30);
  const noteLow = all((n) => n.attributes?.['data-motel-mph-note'] === '1', rm)[0]?.textContent ?? '';
  const cutoffAfterLow = all((n) => n.attributes?.['data-motel-cutoff-hm'] === '1', rm)[0]?.textContent?.trim();
  const atLineLow = rm.textContent.includes('at 55 mph');

  // Blur resets displayed field back to 55 so field, "at 55 mph" line, and math all agree
  fire(mphIn, 'blur'); await sleep(30);
  const valAfterBlur = readVal(all((n) => n.localName === 'input' && n.attributes?.['data-motel-mph'] === '1', rm)[0]);
  const noteAfterBlur = all((n) => n.attributes?.['data-motel-mph-note'] === '1', rm)[0];

  // Type out-of-range high value "95" (> 80)
  const mphIn2 = all((n) => n.localName === 'input' && n.attributes?.['data-motel-mph'] === '1', rm)[0];
  mphIn2.value = '95'; fire(mphIn2, 'input'); await sleep(30);
  const noteHigh = all((n) => n.attributes?.['data-motel-mph-note'] === '1', rm)[0]?.textContent ?? '';

  // Type valid "60" -> clears note, updates math & "at 60 mph" line (220 mi @ 60 mph = 220m, hook 30m -> 08:00 - 250m = 03:50)
  mphIn2.value = '60'; fire(mphIn2, 'input'); await sleep(30);
  const noteValid = all((n) => n.attributes?.['data-motel-mph-note'] === '1', rm)[0];
  const cutoffAfter60 = all((n) => n.attributes?.['data-motel-cutoff-hm'] === '1', rm)[0]?.textContent?.trim();
  const atLine60 = rm.textContent.includes('at 60 mph');

  const ok = /Still using 55 mph/i.test(noteLow)
    && cutoffAfterLow === '03:30'
    && atLineLow
    && valAfterBlur === '55'
    && !noteAfterBlur
    && /Still using 55 mph/i.test(noteHigh)
    && !noteValid
    && cutoffAfter60 === '03:50'
    && atLine60;
  return ok || JSON.stringify({ noteLow, cutoffAfterLow, atLineLow, valAfterBlur, noteAfterBlur: !!noteAfterBlur, noteHigh, noteValid: !!noteValid, cutoffAfter60, atLine60 });
});

/* ---------------- M12 (N1): "too early to roll" dead zone (Opus Probe G + Probe E) ---------------- */
await pin('M12. N1: "too early to roll" dead zone (Probe G + Probe E): warns earliest legal roll, flags over-window roll-now ETA, mentions in dispatch, and matches engine legality', async () => {
  // Opus Probe G: shift 10:00 (window ends 00:00), D 13:00-20:00 (7h -> breakRemaining 60m),
  // ON 20:00-20:05 (currentNonDrive = 5m), return 3h 25m (205m), hook 15m -> need = 30 - 5 - 15 = 10m.
  // Base cutoff = 00:00 - 205 - 15 = 20:20 (waitLeft = 15m >= need 10m, < 30m).
  // Legal roll window is strictly [20:15, 20:20]: rolling at 20:05..20:14 forces a 30m en-route break past 00:00!
  const now2005 = chi(10, 20, 5);
  const segsG = [
    { status: 'OFF', start: chi(10, 0, 0), end: chi(10, 10, 0), createdAt: 1 },
    { status: 'ON', start: chi(10, 10, 0), end: chi(10, 10, 15), createdAt: 2 },
    { status: 'OFF', start: chi(10, 10, 15), end: chi(10, 13, 0), createdAt: 3 },
    { status: 'D', start: chi(10, 13, 0), end: chi(10, 20, 0), createdAt: 4 },
    { status: 'ON', start: chi(10, 20, 0), end: now2005, createdAt: 5 },
  ];

  const rG = M.evaluateMotel({
    segments: segsG, now: now2005, config: cfgChi,
    distanceMode: 'time', miles: 0, mph: 55, driveMinutesDirect: 205, hookMinutes: 15, bigDay: false,
    currentStatus: 'ON',
  });
  const wantEarliestG = chi(10, 20, 15);
  const wantCutoffG = chi(10, 20, 20);
  const wantWarnG = "Don't roll before 20:15 — 10 more minutes here completes your 30-minute break; rolling earlier forces a 30-min stop that runs past your 14-hr window (49 CFR 395.3(a)(3)(ii))";
  if (rG.status !== 'ready' || rG.cutoffMinute !== wantCutoffG || rG.cutoffHM !== '20:20' || rG.waitLeftMinutes !== 15) {
    return `Probe G cutoff wrong: status=${rG.status} cutoff=${rG.cutoffHM} wait=${rG.waitLeftMinutes}`;
  }
  if (rG.earliestRollMinute !== wantEarliestG || rG.earliestRollHM !== '20:15' || rG.rollNowOverWindow !== true) {
    return `Probe G earliestRoll/overWindow wrong: earliest=${rG.earliestRollMinute} (${rG.earliestRollHM}) overWindow=${rG.rollNowOverWindow}`;
  }
  if (!rG.earliestRollWarning || !rG.earliestRollWarning.includes(wantWarnG)) {
    return `Probe G earliestRollWarning wrong: "${rG.earliestRollWarning}"`;
  }
  if (rG.backIfRollNowHM !== '00:15' || rG.backAtCutoffHM !== '00:00') {
    return `Probe G ETAs wrong: rollNow=${rG.backIfRollNowHM} atCutoff=${rG.backAtCutoffHM}`;
  }
  if (!rG.dispatchText.includes('20:15') || !rG.dispatchText.includes('20:20') || !/49 CFR 395\.3\(a\)\(3\)\(ii\)/.test(rG.dispatchText)) {
    return `Probe G dispatch text missing earliestRoll/cutoff/cite: "${rG.dispatchText}"`;
  }

  // Engine legality checks for Probe G:
  // 20:05 -> violation (WINDOW_14+15 with break, BREAK_30 without); 20:15 -> none; 20:20 -> none; 20:21 -> WINDOW_14+1
  const simG = (rollAt, withBreak) => {
    const segs = [
      ...segsG,
      { status: 'ON', start: now2005, end: rollAt, createdAt: 200 },
      { status: 'ON', start: rollAt, end: rollAt + 15, createdAt: 201 },
    ];
    if (withBreak) {
      segs.push({ status: 'D', start: rollAt + 15, end: rollAt + 15 + 60, createdAt: 202 });
      segs.push({ status: 'OFF', start: rollAt + 75, end: rollAt + 105, createdAt: 203 });
      segs.push({ status: 'D', start: rollAt + 105, end: rollAt + 105 + 145, createdAt: 204 });
      return E.evaluate(segs, { asOf: rollAt + 250, config: cfgChi });
    }
    segs.push({ status: 'D', start: rollAt + 15, end: rollAt + 15 + 205, createdAt: 202 });
    return E.evaluate(segs, { asOf: rollAt + 220, config: cfgChi });
  };
  const evG2005Brk = simG(now2005, true);
  const evG2005NoBrk = simG(now2005, false);
  const evG2015 = simG(wantEarliestG, false);
  const evG2020 = simG(wantCutoffG, false);
  const evG2021 = simG(wantCutoffG + 1, false);
  if (!evG2005Brk.violations.some((v) => v.kind === 'WINDOW_14' && v.minutes === 15)) {
    return `Probe G sim at 20:05 (with break) expected WINDOW_14+15: ${JSON.stringify(evG2005Brk.violations)}`;
  }
  if (!evG2005NoBrk.violations.some((v) => v.kind === 'BREAK_30')) {
    return `Probe G sim at 20:05 (no break) expected BREAK_30: ${JSON.stringify(evG2005NoBrk.violations)}`;
  }
  if (evG2015.violations.length !== 0) {
    return `Probe G sim at 20:15 expected 0 violations: ${JSON.stringify(evG2015.violations)}`;
  }
  if (evG2020.violations.length !== 0) {
    return `Probe G sim at 20:20 expected 0 violations: ${JSON.stringify(evG2020.violations)}`;
  }
  if (!evG2021.violations.some((v) => v.kind === 'WINDOW_14' && v.minutes === 1)) {
    return `Probe G sim at 20:21 expected WINDOW_14+1: ${JSON.stringify(evG2021.violations)}`;
  }

  // Opus Probe E (extreme shape: hook 0m, return 3h 30m = 210m -> single legal roll minute 20:30):
  const rE = M.evaluateMotel({
    segments: segsG, now: now2005, config: cfgChi,
    distanceMode: 'time', miles: 0, mph: 55, driveMinutesDirect: 210, hookMinutes: 0, bigDay: false,
    currentStatus: 'ON',
  });
  const want2030 = chi(10, 20, 30);
  const wantWarnE = "Don't roll before 20:30 — 25 more minutes here completes your 30-minute break; rolling earlier forces a 30-min stop that runs past your 14-hr window (49 CFR 395.3(a)(3)(ii))";
  if (rE.status !== 'ready' || rE.cutoffMinute !== want2030 || rE.earliestRollMinute !== want2030 || rE.earliestRollHM !== '20:30' || rE.rollNowOverWindow !== true) {
    return `Probe E wrong: status=${rE.status} cutoff=${rE.cutoffHM} earliest=${rE.earliestRollHM} overWindow=${rE.rollNowOverWindow}`;
  }
  if (!rE.earliestRollWarning || !rE.earliestRollWarning.includes(wantWarnE)) {
    return `Probe E warning wrong: "${rE.earliestRollWarning}"`;
  }
  const simE = (rollAt, withBreak) => {
    const segs = [...segsG, { status: 'ON', start: now2005, end: rollAt, createdAt: 200 }];
    if (withBreak) {
      segs.push({ status: 'D', start: rollAt, end: rollAt + 60, createdAt: 201 });
      segs.push({ status: 'OFF', start: rollAt + 60, end: rollAt + 90, createdAt: 202 });
      segs.push({ status: 'D', start: rollAt + 90, end: rollAt + 90 + 150, createdAt: 203 });
      return E.evaluate(segs, { asOf: rollAt + 240, config: cfgChi });
    }
    segs.push({ status: 'D', start: rollAt, end: rollAt + 210, createdAt: 201 });
    return E.evaluate(segs, { asOf: rollAt + 210, config: cfgChi });
  };
  if (!simE(now2005, true).violations.some((v) => v.kind === 'WINDOW_14' && v.minutes === 5)) {
    return `Probe E sim at 20:05 expected WINDOW_14+5: ${JSON.stringify(simE(now2005, true).violations)}`;
  }
  if (simE(want2030, false).violations.length !== 0) {
    return `Probe E sim at 20:30 expected 0 violations: ${JSON.stringify(simE(want2030, false).violations)}`;
  }
  if (!simE(want2030 + 1, false).violations.some((v) => v.kind === 'WINDOW_14' && v.minutes === 1)) {
    return `Probe E sim at 20:31 expected WINDOW_14+1: ${JSON.stringify(simE(want2030 + 1, false).violations)}`;
  }

  // DOM check for Probe G: renders earliest-roll warning, marks roll-now ETA over window, mentions in dispatch
  await seed({
    tab: 'plan', nowOverride: now2005,
    segments: segsG.slice(0, -1),
    current: { status: 'ON', since: chi(10, 20, 0), createdAt: 5 },
  });
  const { rm } = await openMotelViaHub();
  fire(all((n) => n.localName === 'button' && n.attributes?.['data-motel-mode'] === 'time', rm)[0], 'click'); await sleep(20);
  const dWrap = all((n) => n.attributes?.['data-motel-drive-box'] === '1', rm)[0];
  const dh = all((n) => n.localName === 'input' && /hours/i.test(n.attributes?.['aria-label'] ?? ''), dWrap)[0];
  const dm = all((n) => n.localName === 'input' && /minutes/i.test(n.attributes?.['aria-label'] ?? ''), dWrap)[0];
  dh.value = '3'; fire(dh, 'input'); await sleep(15);
  dm.value = '25'; fire(dm, 'input'); await sleep(15);
  const chip15 = all((n) => n.localName === 'button' && n.attributes?.['data-motel-hook-chip'] === '15', rm)[0];
  fire(chip15, 'click'); await sleep(40);

  const earliestEl = all((n) => n.attributes?.['data-motel-earliest-roll'] === '1', rm)[0];
  const etaEl = all((n) => n.attributes?.['data-motel-back-eta'] === '1', rm)[0];
  const dispEl = all((n) => n.attributes?.['data-motel-dispatch'] === '1', rm)[0];
  const hmDom = all((n) => n.attributes?.['data-motel-cutoff-hm'] === '1', rm)[0]?.textContent?.trim();
  const ok = hmDom === '20:20'
    && !!earliestEl && earliestEl.textContent.includes(wantWarnG)
    && etaEl?.attributes?.['data-motel-roll-now-over-window'] === '1'
    && /past 14h window/i.test(etaEl?.textContent ?? '')
    && !!dispEl && dispEl.textContent.includes('20:15') && /49 CFR 395\.3\(a\)\(3\)\(ii\)/.test(dispEl.textContent);
  return ok || JSON.stringify({
    hmDom,
    earliestText: earliestEl?.textContent,
    overAttr: etaEl?.attributes?.['data-motel-roll-now-over-window'],
    etaText: etaEl?.textContent,
    dispText: dispEl?.textContent,
  });
});

/* ---------------- M13 (N2): cycle binds + en-route break required -> break line must NOT advise waiting past cycle cutoff (Opus Probe P) ---------------- */
await pin('M13. N2: cycle binds while 30-min break needed (Probe P): cutoff 20:18 CYCLE, break line requires en-route break instead of advising 25m wait', async () => {
  // Opus Probe P: 70/8 cycle, Nov 3 = 0h (no midnight roll-off),
  // Nov 4..8 = 5 * 10h ON (3000m), Nov 9 = 9h 27m ON (567m), OFF Nov 9 15:27 -> Nov 10 10:00 (18h 33m reset),
  // Nov 10: ON 10:00-10:15 (15m), OFF 10:15-13:00, D 13:00-20:00 (420m -> breakRemaining 60m), ON 20:00-20:05 (5m).
  // Total 8-day ON+D = 4007m -> cycleRemaining = 193m (3h 13m).
  // Return = 3h 00m (180m), hook = 0m -> cycleCutoff = 20:05 + 13m = 20:18 (waitLeft 13m < need 25m).
  // Window ends 00:00 -> baseWindowCutoff = 21:00, effectiveWindowCutoff = 20:30 (with 30m en-route break).
  // CYCLE binds at 20:18, enRouteBreakAtCutoffMinutes = 30, breakAdjustedCutoff = false.
  const now2005 = chi(10, 20, 5);
  const segsP = [];
  for (let d = 4; d <= 8; d++) {
    segsP.push({ status: 'ON', start: chi(d, 6, 0), end: chi(d, 16, 0), createdAt: d * 10 });
  }
  segsP.push({ status: 'ON', start: chi(9, 6, 0), end: chi(9, 15, 27), createdAt: 90 });
  segsP.push({ status: 'OFF', start: chi(9, 15, 27), end: chi(10, 10, 0), createdAt: 99 });
  segsP.push({ status: 'ON', start: chi(10, 10, 0), end: chi(10, 10, 15), createdAt: 100 });
  segsP.push({ status: 'OFF', start: chi(10, 10, 15), end: chi(10, 13, 0), createdAt: 101 });
  segsP.push({ status: 'D', start: chi(10, 13, 0), end: chi(10, 20, 0), createdAt: 102 });
  segsP.push({ status: 'ON', start: chi(10, 20, 0), end: now2005, createdAt: 103 });

  const rP = M.evaluateMotel({
    segments: segsP, now: now2005, config: cfgChi,
    distanceMode: 'time', miles: 0, mph: 55, driveMinutesDirect: 180, hookMinutes: 0, bigDay: false,
    currentStatus: 'ON',
  });
  const want2018 = chi(10, 20, 18);
  if (rP.status !== 'ready' || rP.binding !== 'CYCLE' || rP.cutoffMinute !== want2018 || rP.cutoffHM !== '20:18' || rP.waitLeftMinutes !== 13) {
    return `Probe P cutoff/binding wrong: status=${rP.status} binding=${rP.binding} cutoff=${rP.cutoffHM} wait=${rP.waitLeftMinutes}`;
  }
  if (/Another 25 minutes/i.test(rP.breakLine)) {
    return `Probe P breakLine contradicts cycle cutoff by advising 25m wait: "${rP.breakLine}"`;
  }
  if (!/en-route 30-minute break required/i.test(rP.breakLine) || !/49 CFR 395\.3\(a\)\(3\)\(ii\)/.test(rP.breakLine)) {
    return `Probe P breakLine missing en-route break requirement / cite: "${rP.breakLine}"`;
  }
  if (rP.enRouteBreakAtCutoffMinutes !== 30 || rP.breakAdjustedCutoff !== false || rP.earliestRollMinute !== null) {
    return `Probe P break flags wrong: atCutoff=${rP.enRouteBreakAtCutoffMinutes} adj=${rP.breakAdjustedCutoff} earliest=${rP.earliestRollMinute}`;
  }

  // Engine legality checks for Probe P:
  // At 20:18 with 30m OFF en-route break -> 0 violations; at 20:19 -> CYCLE+1; waiting 25m to 20:30 -> CYCLE+12
  const simP = (rollAt, withOffBreak) => {
    const segs = [...segsP, { status: 'ON', start: now2005, end: rollAt, createdAt: 200 }];
    if (withOffBreak) {
      segs.push({ status: 'D', start: rollAt, end: rollAt + 60, createdAt: 201 });
      segs.push({ status: 'OFF', start: rollAt + 60, end: rollAt + 90, createdAt: 202 });
      segs.push({ status: 'D', start: rollAt + 90, end: rollAt + 90 + 120, createdAt: 203 });
      return E.evaluate(segs, { asOf: rollAt + 210, config: cfgChi });
    }
    segs.push({ status: 'D', start: rollAt, end: rollAt + 180, createdAt: 201 });
    return E.evaluate(segs, { asOf: rollAt + 180, config: cfgChi });
  };
  if (simP(want2018, true).violations.length !== 0) {
    return `Probe P sim at 20:18 expected 0 violations: ${JSON.stringify(simP(want2018, true).violations)}`;
  }
  if (!simP(want2018 + 1, true).violations.some((v) => v.kind === 'CYCLE' && v.minutes === 1)) {
    return `Probe P sim at 20:19 expected CYCLE+1: ${JSON.stringify(simP(want2018 + 1, true).violations)}`;
  }
  if (!simP(chi(10, 20, 30), false).violations.some((v) => v.kind === 'CYCLE' && v.minutes === 12)) {
    return `Probe P sim waiting 25m to 20:30 expected CYCLE+12: ${JSON.stringify(simP(chi(10, 20, 30), false).violations)}`;
  }

  // DOM check for Probe P: CYCLE binding 20:18, break box requires en-route break (never "Another 25 minutes")
  await seed({
    tab: 'plan', nowOverride: now2005,
    segments: segsP.slice(0, -1),
    current: { status: 'ON', since: chi(10, 20, 0), createdAt: 103 },
  });
  const { rm } = await openMotelViaHub();
  fire(all((n) => n.localName === 'button' && n.attributes?.['data-motel-mode'] === 'time', rm)[0], 'click'); await sleep(20);
  const dWrap = all((n) => n.attributes?.['data-motel-drive-box'] === '1', rm)[0];
  const dh = all((n) => n.localName === 'input' && /hours/i.test(n.attributes?.['aria-label'] ?? ''), dWrap)[0];
  const dm = all((n) => n.localName === 'input' && /minutes/i.test(n.attributes?.['aria-label'] ?? ''), dWrap)[0];
  dh.value = '3'; fire(dh, 'input'); await sleep(15);
  dm.value = '0'; fire(dm, 'input'); await sleep(15);
  const hWrap = all((n) => n.attributes?.['data-motel-hook-box'] === '1', rm)[0];
  const hh = all((n) => n.localName === 'input' && /hours/i.test(n.attributes?.['aria-label'] ?? ''), hWrap)[0];
  const hm = all((n) => n.localName === 'input' && /minutes/i.test(n.attributes?.['aria-label'] ?? ''), hWrap)[0];
  hh.value = '0'; fire(hh, 'input'); await sleep(15);
  hm.value = '0'; fire(hm, 'input'); await sleep(40);

  const vEl = all((n) => n.attributes?.['data-motel-verdict'] === '1', rm)[0];
  const hmDom = all((n) => n.attributes?.['data-motel-cutoff-hm'] === '1', rm)[0]?.textContent?.trim();
  const brkDom = all((n) => n.attributes?.['data-motel-break'] === '1', rm)[0]?.textContent ?? '';
  const earliestEl = all((n) => n.attributes?.['data-motel-earliest-roll'] === '1', rm)[0];
  const ok = vEl?.attributes?.['data-motel-binding'] === 'CYCLE'
    && hmDom === '20:18'
    && !/Another 25 minutes/i.test(brkDom)
    && /en-route 30-minute break required/i.test(brkDom)
    && /49 CFR 395\.3\(a\)\(3\)\(ii\)/.test(brkDom)
    && !earliestEl;
  return ok || JSON.stringify({ binding: vEl?.attributes?.['data-motel-binding'], hmDom, brkDom, hasEarliest: !!earliestEl });
});

/* ---------------- Summary ---------------- */
let bad = 0;
for (const [s, n, m] of res) {
  console.log(`${s.padEnd(5)} ${n}${m ? '\n      ' + m : ''}`);
  if (s === 'FAIL') bad++;
}
console.log(`\n${res.length - bad}/${res.length} motel pins passed`);
render(null, root);
process.exit(bad ? 1 : 0);

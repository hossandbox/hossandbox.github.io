// Can I Legally Use It? — 3 AM HOS Exception Sanity Check (Plan tool #10).
// Pins LG1–LG15: YES & NO terminal verdicts for all 4 exception trees (Adverse, PC, Yard Move,
// 16-Hour Big Day), PC VERIFY CARRIER POLICY Sign-label & warning pairing, Safe Haven (§397.5)
// static myth-buster card, standing advisory line on home and every verdict, live before/after
// clock previews asserted directly against engine evaluate() (never hard-coded times), editable
// <=60-char ASCII ELD annotation templates (F1), §395.2 most-recent duty-day/qualifying-rest
// Adverse Q1 (F2/NF3), cross-exception stacking honesty probes P1/P2 (F3), expired-window probe
// P9 & drive-row relabel (F4), ineligible-16h-plus-adverse probe NEW-A (NF1), stacked-plus-log-
// blocked-16h probe NEW-B (NF2), Plan hub 10th-item placement, zero <input type="time">, and
// zero new localStorage keys.
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
let Tms = new Date(2026, 10, 11, 3, 0, 0).getTime();
Date.now = () => Tms;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'legal';
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
const L = await import('../../src/legal.ts');
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

const ADVISORY = "Rule check only — not legal advice. Your carrier's policy can be stricter than FMCSA. Log and annotate on your carrier ELD.";
const cfgChi = { ...S.INITIAL_STATE.config, cycle: '70/8', dayStartHour: 0, dayStartMinute: 0, timeZone: 'America/Chicago', shortHaul: false };
const chi = (d, h0, m0 = 0) => E.localToMinute(2026, 11, d, h0, 'America/Chicago') + m0;

// Fixed 3:00 AM fixture log (window-bound before exceptions, fresh 30m break, plenty of cycle):
// - 10h OFF reset Tue Nov 10 06:00 -> 16:00 CST
// - Shift starts Tue 16:00 CST -> 14h window ends Wed 06:00 CST (16h ends Wed 08:00 CST)
// - ON 16:00 -> 18:00 (2h dock), D 18:00 -> 23:00 (5h drive), OFF 23:00 -> 03:00 (4h wait, covers 30m break)
// - At Wed 03:00 CST: windowUsed = 11h (3h left), driveUsed = 5h (6h left), breakRemaining = 8h, cycleRemaining = 63h.
// - Standard mustStopBy = 06:00 (WINDOW_14); Adverse mustStopBy = 08:00 (+2h drive & window);
//   16-Hour windowEnd extends 06:00 -> 08:00 while driveDeadline stays 09:00 (does NOT move).
const NOW_0300 = chi(11, 3, 0);
const FIXTURE_SEGS = [
  { status: 'OFF', start: chi(10, 6, 0), end: chi(10, 16, 0), createdAt: 1 },
  { status: 'ON', start: chi(10, 16, 0), end: chi(10, 18, 0), createdAt: 2 },
  { status: 'D', start: chi(10, 18, 0), end: chi(10, 23, 0), createdAt: 3 },
  { status: 'OFF', start: chi(10, 23, 0), end: NOW_0300, createdAt: 4 },
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
    nowOverride: NOW_0300,
    segments: FIXTURE_SEGS.slice(0, -1),
    current: { status: 'OFF', since: chi(10, 23, 0), createdAt: 4 },
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
const planRoom = () => all((n) => n.localName === 'section' && has(n, 'plan-room'))[0];

const openLegalViaHub = async () => {
  const pg = planPage();
  const items = all((n) => n.localName === 'button' && has(n, 'plan-item'), pg);
  const btn = items.find((b) => /Can I Legally Use It\?/.test(b.textContent));
  if (!btn) return null;
  fire(btn, 'click');
  await sleep(60);
  return { items, btn, rm: planRoom() };
};

const pickTree = async (id) => {
  const rm = planRoom();
  const btn = all((n) => n.localName === 'button' && n.attributes?.['data-legal-pick'] === id, rm)[0];
  if (!btn) throw new Error(`missing pick button ${id}`);
  fire(btn, 'click');
  await sleep(40);
  return planRoom();
};

const tapAns = async (ans) => {
  const rm = planRoom();
  const btn = all((n) => n.localName === 'button' && n.attributes?.['data-legal-ans'] === ans, rm)[0];
  if (!btn) throw new Error(`missing answer button ${ans}`);
  fire(btn, 'click');
  await sleep(40);
  return planRoom();
};

const readVerdict = (rm) => {
  const v = all((n) => n.attributes?.['data-legal-verdict'] === '1', rm)[0];
  if (!v) return null;
  const signLabel = all((n) => has(n, 'sign-word'), v)[0]?.textContent?.trim() ?? '';
  const adv = all((n) => n.attributes?.['data-legal-advisory'] === '1', v)[0]?.textContent?.trim() ?? '';
  const cite = all((n) => n.attributes?.['data-legal-cite'] === '1', v)[0]?.textContent?.trim() ?? '';
  const headline = all((n) => n.attributes?.['data-legal-headline'] === '1', v)[0]?.textContent?.trim() ?? '';
  const explain = all((n) => n.attributes?.['data-legal-explain'] === '1', v)[0]?.textContent?.trim() ?? '';
  const carrierWarn = all((n) => n.attributes?.['data-legal-carrier-warn'] === '1', v)[0]?.textContent?.trim() ?? '';
  const reminder = all((n) => n.attributes?.['data-legal-reminder'] === '1', v)[0]?.textContent?.trim() ?? '';
  const guidance = all((n) => n.attributes?.['data-legal-clock-guidance'] === '1', v)[0]?.textContent?.trim() ?? '';
  const annotation = all((n) => n.attributes?.['data-legal-annotation'] === '1', v)[0]?.textContent?.trim() ?? '';
  const copyBtn = all((n) => n.attributes?.['data-legal-copy-btn'] === '1', v)[0]?.textContent?.trim() ?? '';
  const preview = all((n) => n.attributes?.['data-legal-preview'] === '1', v)[0] ?? null;
  return {
    el: v,
    tree: v.attributes?.['data-legal-tree'] ?? '',
    result: v.attributes?.['data-legal-result'] ?? '',
    verifyCarrier: v.attributes?.['data-legal-verify-carrier'] === '1',
    signLabel,
    text: v.textContent ?? '',
    adv,
    cite,
    headline,
    explain,
    carrierWarn,
    reminder,
    guidance,
    annotation,
    copyBtn,
    preview: preview ? {
      kind: preview.attributes?.['data-legal-preview-kind'] ?? '',
      otherException: preview.attributes?.['data-legal-other-exception'] ?? '',
      head: all((n) => n.attributes?.['data-legal-preview-head'] === '1', preview)[0]?.textContent?.trim() ?? '',
      beforeLabel: all((n) => n.attributes?.['data-legal-before-lbl'] === '1', preview)[0]?.textContent?.trim() ?? '',
      stackWarn: all((n) => n.attributes?.['data-legal-stack-warn'] === '1', preview)[0]?.textContent?.trim() ?? '',
      driveLabel: all((n) => n.attributes?.['data-legal-drive-label'] === '1', preview)[0]?.textContent?.trim() ?? '',
      bindingNote: all((n) => n.attributes?.['data-legal-binding-note'] === '1', preview)[0]?.textContent?.trim() ?? '',
      beforeMustStop: Number(preview.attributes?.['data-legal-before-must-stop']),
      afterMustStop: Number(preview.attributes?.['data-legal-after-must-stop']),
      beforeWindowEnd: Number(preview.attributes?.['data-legal-before-window-end']),
      afterWindowEnd: Number(preview.attributes?.['data-legal-after-window-end']),
      beforeDriveDeadline: Number(preview.attributes?.['data-legal-before-drive-deadline']),
      afterDriveDeadline: Number(preview.attributes?.['data-legal-after-drive-deadline']),
      text: preview.textContent ?? '',
    } : null,
  };
};

/* ---------------- LG1: Adverse Driving YES verdict + engine evaluate() preview ---------------- */
await pin('LG1. Adverse Driving YES: §395.1(b)(1), editable ELD template, advisory line, and live must-stop matches evaluate() directly', async () => {
  await seed();
  const opened = await openLegalViaHub();
  if (!opened) return 'Could not open Can I Legally Use It? from Plan hub';
  await pickTree('adverse');
  await tapAns('yes'); // Unknown before duty day / qualifying rest & before dispatch
  const rm = await tapAns('yes'); // Genuinely unforeseeable
  const v = readVerdict(rm);
  if (!v) return 'No verdict rendered after Adverse YES path';

  // Direct engine evaluate() oracle (no hard-coded times!)
  const evBase = E.evaluate(FIXTURE_SEGS, { asOf: NOW_0300, config: cfgChi });
  const evAdv = E.evaluate(FIXTURE_SEGS, {
    asOf: NOW_0300,
    config: { ...cfgChi, adverseShifts: [evBase.shift.exceptionKey] },
  });
  const wantAdvWinEnd = evAdv.asOf + (evAdv.shift.limits.window - evAdv.shift.windowUsed);
  const wantAdvDrvEnd = evAdv.asOf + evAdv.shift.driveRemaining;

  const ok = v.tree === 'adverse'
    && v.result === 'YES'
    && /395\.1\(b\)\(1\)/.test(v.cite)
    && v.annotation === 'Unforeseen [crash/ice] closure [Hwy] MM [##] - 395.1(b)(1)'
    && v.copyBtn === 'Copy template (edit before saving)'
    && v.adv === ADVISORY
    && v.preview !== null
    && v.preview.kind === 'adverse'
    && /from your logged record/i.test(v.preview.head)
    && v.preview.beforeLabel === 'Before (standard)'
    && /11-hr clock runs out \(if nothing else stops you\)/i.test(v.preview.driveLabel)
    && v.preview.beforeMustStop === evBase.mustStopBy
    && v.preview.afterMustStop === evAdv.mustStopBy
    && v.preview.afterMustStop > v.preview.beforeMustStop
    && v.preview.afterWindowEnd === wantAdvWinEnd
    && v.preview.afterDriveDeadline === wantAdvDrvEnd;

  return ok || JSON.stringify({
    result: v.result, cite: v.cite, annotation: v.annotation, copyBtn: v.copyBtn, advOk: v.adv === ADVISORY,
    preview: v.preview, wantBase: evBase.mustStopBy, wantAdv: evAdv.mustStopBy, wantAdvWinEnd, wantAdvDrvEnd,
  });
});

/* ---------------- LG2: Adverse Driving NO paths terminate immediately (incl. §395.2 Q1 anchor) ---------------- */
await pin('LG2. Adverse Driving NO paths: Q1=NO (§395.2 duty-day/qualifying-rest & dispatch anchor) and Q2=NO (foreseeable/rush hour/full lot) end immediately at NO', async () => {
  await seed();
  await openLegalViaHub();
  // Path A: Q1 = NO -> immediate terminal NO; check §395.2 anchor text on Q1 & NO explanation
  const rmQ1 = await pickTree('adverse');
  const q1Text = all((n) => has(n, 'legal-q-text'), rmQ1)[0]?.textContent?.trim() ?? '';
  const q1Detail = all((n) => has(n, 'legal-q-detail'), rmQ1)[0]?.textContent?.trim() ?? '';
  const rmNo1 = await tapAns('no');
  const v1 = readVerdict(rmNo1);
  const qLeft1 = all((n) => n.attributes?.['data-legal-question'] === '1', rmNo1).length;

  // Restart -> Path B: Q1 = YES, Q2 = NO -> immediate terminal NO
  fire(all((n) => n.attributes?.['data-legal-restart'] === '1', rmNo1)[0], 'click'); await sleep(40);
  await tapAns('yes');
  const rmNo2 = await tapAns('no');
  const v2 = readVerdict(rmNo2);
  const qLeft2 = all((n) => n.attributes?.['data-legal-question'] === '1', rmNo2).length;

  const q1AnchorOk = /most recent of:\s*starting this duty day,\s*or ending your last qualifying rest/i.test(q1Text)
    && /dispatch/i.test(q1Text)
    && /10-hr/i.test(q1Detail) && /7-hr sleeper/i.test(q1Detail) && /2-hr split/i.test(q1Detail) && /30-min break does NOT count/i.test(q1Detail)
    && /most recent of those moments/i.test(q1Detail);

  const ok = q1AnchorOk
    && !!v1 && v1.result === 'NO' && qLeft1 === 0 && /395\.1\(b\)\(1\)/.test(v1.cite)
    && /395\.2/.test(v1.cite) && /most recent/i.test(v1.explain) && /duty day/i.test(v1.explain) && /qualifying rest/i.test(v1.explain) && /30-min break/i.test(v1.explain)
    && v1.adv === ADVISORY && !v1.preview && !v1.annotation
    && !!v2 && v2.result === 'NO' && qLeft2 === 0 && /395\.1\(b\)\(1\)/.test(v2.cite) && /rush hour|forecasted|full truck stop/i.test(v2.explain) && v2.adv === ADVISORY && !v2.preview;
  return ok || JSON.stringify({ q1AnchorOk, q1Text, q1Detail, v1: v1 && { result: v1.result, cite: v1.cite, explain: v1.explain, qLeft1 }, v2: v2 && { result: v2.result, cite: v2.cite, explain: v2.explain, qLeft2 } });
});

/* ---------------- LG3: Personal Conveyance YES + Sign label VERIFY CARRIER POLICY + 2018 rest condition + N6 ---------------- */
await pin('LG3. Personal Conveyance YES: Sign label itself carries VERIFY CARRIER POLICY, warning box, 2018 rest condition, FMCSA 2018 PC cite, clean guidance clock note, advisory line', async () => {
  await seed();
  await openLegalViaHub();
  await pickTree('pc');
  await tapAns('yes'); // Ordered off property
  const rm = await tapAns('yes'); // Nearest reasonable safe parking
  const v = readVerdict(rm);
  if (!v) return 'No verdict rendered on PC YES';

  const ok = v.tree === 'pc'
    && v.result === 'YES'
    && v.verifyCarrier === true
    && /VERIFY CARRIER POLICY/.test(v.signLabel)
    && /disable Personal Conveyance|disable PC/i.test(v.carrierWarn)
    && /full required off-duty rest/i.test(v.reminder)
    && /before driving on duty again/i.test(v.reminder)
    && /FMCSA 2018 PC Guidance/i.test(v.cite)
    && /\[shipper\/receiver\]/.test(v.annotation)
    && /nearest safe parking/i.test(v.annotation)
    && v.preview === null
    && /not an engine calculation/i.test(v.guidance)
    && /Off-Duty/i.test(v.guidance)
    && !/unless it is part of/i.test(v.guidance)
    && v.adv === ADVISORY;
  return ok || JSON.stringify({
    result: v.result, signLabel: v.signLabel, verifyCarrier: v.verifyCarrier, carrierWarn: v.carrierWarn,
    reminder: v.reminder, cite: v.cite, annotation: v.annotation, guidance: v.guidance, hasPreview: !!v.preview, advOk: v.adv === ADVISORY,
  });
});

/* ---------------- LG4: Personal Conveyance NO paths (F6 softened Q1 NO + N3 Q2 wording) ---------------- */
await pin('LG4. Personal Conveyance NO paths: softened Q1=NO headline, N3 nearest/not-bypassing Q2 wording, and immediate NO termination', async () => {
  await seed();
  await openLegalViaHub();
  await pickTree('pc');
  const rmNo1 = await tapAns('no');
  const v1 = readVerdict(rmNo1);
  const qLeft1 = all((n) => n.attributes?.['data-legal-question'] === '1', rmNo1).length;

  fire(all((n) => n.attributes?.['data-legal-restart'] === '1', rmNo1)[0], 'click'); await sleep(40);
  const rmQ2 = await tapAns('yes');
  const q2Text = all((n) => has(n, 'legal-q-text'), rmQ2)[0]?.textContent?.trim() ?? '';
  const rmNo2 = await tapAns('no');
  const v2 = readVerdict(rmNo2);
  const qLeft2 = all((n) => n.attributes?.['data-legal-question'] === '1', rmNo2).length;

  const q2Ok = /NEAREST reasonable safe parking/i.test(q2Text)
    && /NOT bypassing closer open parking/i.test(q2Text)
    && !/NOT heading toward home or the next pickup/i.test(q2Text);

  const ok = !!v1 && v1.result === 'NO' && qLeft1 === 0
    && v1.headline === "This check only covers being moved off a lot — for other PC uses, see your carrier's PC policy."
    && /FMCSA 2018 PC Guidance/i.test(v1.cite) && v1.adv === ADVISORY
    && q2Ok
    && !!v2 && v2.result === 'NO' && qLeft2 === 0 && /FMCSA 2018 PC Guidance/i.test(v2.cite) && /Advancing a load|bypassing closer open parking/i.test(v2.explain) && v2.adv === ADVISORY;
  return ok || JSON.stringify({ q2Ok, q2Text, v1: v1 && { result: v1.result, headline: v1.headline, qLeft1 }, v2: v2 && { result: v2.result, explain: v2.explain, qLeft2 } });
});

/* ---------------- LG5: Yard Move YES + standing ON-duty reminder ---------------- */
await pin('LG5. Yard Move YES: §395.28, standing reminder that YM is ON duty (burns 14-hr & 70-hr, spares 11-hr drive), guidance clock note, advisory line', async () => {
  await seed();
  await openLegalViaHub();
  await pickTree('yard');
  await tapAns('yes'); // Private restricted yard
  const rm = await tapAns('yes'); // Off public roads
  const v = readVerdict(rm);
  if (!v) return 'No verdict rendered on Yard Move YES';

  const ok = v.tree === 'yard'
    && v.result === 'YES'
    && /395\.28/.test(v.cite)
    && /Yard Move is ON duty/i.test(v.reminder)
    && /14-hr/i.test(v.reminder) && /70-hr/i.test(v.reminder) && /11-hr/i.test(v.reminder)
    && /395\.28/.test(v.annotation)
    && v.preview === null
    && /not an engine calculation/i.test(v.guidance)
    && v.adv === ADVISORY;
  return ok || JSON.stringify({
    result: v.result, cite: v.cite, reminder: v.reminder, annotation: v.annotation, guidance: v.guidance, advOk: v.adv === ADVISORY,
  });
});

/* ---------------- LG6: Yard Move NO paths (public truck stop / public road) ---------------- */
await pin('LG6. Yard Move NO paths: Q1=NO (public truck stop / fuel island) and Q2=NO (public road) end immediately at NO', async () => {
  await seed();
  await openLegalViaHub();
  await pickTree('yard');
  const rmNo1 = await tapAns('no');
  const v1 = readVerdict(rmNo1);
  const qLeft1 = all((n) => n.attributes?.['data-legal-question'] === '1', rmNo1).length;

  fire(all((n) => n.attributes?.['data-legal-restart'] === '1', rmNo1)[0], 'click'); await sleep(40);
  await tapAns('yes');
  const rmNo2 = await tapAns('no');
  const v2 = readVerdict(rmNo2);
  const qLeft2 = all((n) => n.attributes?.['data-legal-question'] === '1', rmNo2).length;

  const ok = !!v1 && v1.result === 'NO' && qLeft1 === 0 && /395\.28/.test(v1.cite) && /public truck stop|fuel island/i.test(v1.explain) && v1.adv === ADVISORY
    && !!v2 && v2.result === 'NO' && qLeft2 === 0 && /395\.28/.test(v2.cite) && /public street|highway/i.test(v2.explain) && v2.adv === ADVISORY;
  return ok || JSON.stringify({ v1: v1 && { result: v1.result, explain: v1.explain, qLeft1 }, v2: v2 && { result: v2.result, explain: v2.explain, qLeft2 } });
});

/* ---------------- LG7: 16-Hour Short-Haul YES + engine preview (F5 Q2 wording, N5 property-carrying) ---------------- */
await pin('LG7. 16-Hour Short-Haul YES: §395.1(o) property-carrying scope, non-double-negative Q2, 11-hr drive does NOT expand, preview matches evaluate(), plus §395.1(o)(3) log block', async () => {
  await seed();
  await openLegalViaHub();
  const rmQ1 = await pickTree('sixteen');
  const q1Detail = all((n) => has(n, 'legal-q-detail'), rmQ1)[0]?.textContent?.trim() ?? '';
  const rmQ2 = await tapAns('yes'); // Last 5 duty tours home terminal
  const q2Text = all((n) => has(n, 'legal-q-text'), rmQ2)[0]?.textContent?.trim() ?? '';
  await tapAns('yes'); // First 16-hr day in last 7 days / since 34h restart
  const rm = await tapAns('yes'); // Return to home terminal tonight
  const v = readVerdict(rm);
  if (!v) return 'No verdict rendered on 16-Hour YES';

  // Direct engine evaluate() oracle (never hard-coded times!)
  const evBase = E.evaluate(FIXTURE_SEGS, { asOf: NOW_0300, config: cfgChi });
  const ev16 = E.evaluate(FIXTURE_SEGS, {
    asOf: NOW_0300,
    config: { ...cfgChi, sixteenHourShifts: [evBase.shift.exceptionKey] },
  });
  const wantBaseWinEnd = evBase.asOf + (evBase.shift.limits.window - evBase.shift.windowUsed);
  const want16WinEnd = ev16.asOf + (ev16.shift.limits.window - ev16.shift.windowUsed);
  const wantBaseDrvEnd = evBase.asOf + evBase.shift.driveRemaining;
  const want16DrvEnd = ev16.asOf + ev16.shift.driveRemaining;

  const domOk = v.tree === 'sixteen'
    && v.result === 'YES'
    && /395\.1\(o\)/.test(v.cite)
    && /property-carrying/i.test(q1Detail)
    && /property-carrying/i.test(v.explain)
    && q2Text === 'Is this your FIRST 16-hour day in the last 7 days (or since your last 34-hr restart)?'
    && /11-hour drive limit does NOT expand/i.test(v.reminder)
    && /395\.1\(o\)/.test(v.annotation)
    && v.adv === ADVISORY
    && v.preview !== null
    && v.preview.kind === 'sixteen'
    && v.preview.beforeWindowEnd === wantBaseWinEnd
    && v.preview.afterWindowEnd === want16WinEnd
    && v.preview.afterWindowEnd > v.preview.beforeWindowEnd
    && v.preview.beforeDriveDeadline === wantBaseDrvEnd
    && v.preview.afterDriveDeadline === want16DrvEnd
    && v.preview.afterDriveDeadline === v.preview.beforeDriveDeadline
    && v.preview.afterMustStop === ev16.mustStopBy;

  // Log-blocked §395.1(o)(3) check: prior 16-hr use 2 days ago with no 34h restart -> engine refuses extension
  const priorStart = chi(8, 16, 0);
  const segsPrior16 = [
    { status: 'OFF', start: chi(8, 6, 0), end: priorStart, createdAt: 1 },
    { status: 'D', start: priorStart, end: chi(8, 21, 0), createdAt: 2 },
    { status: 'OFF', start: chi(8, 21, 0), end: chi(9, 16, 0), createdAt: 3 }, // 19h (< 34h)
    { status: 'D', start: chi(9, 16, 0), end: chi(9, 21, 0), createdAt: 4 },
    { status: 'OFF', start: chi(9, 21, 0), end: chi(10, 16, 0), createdAt: 5 }, // 19h (< 34h)
    ...FIXTURE_SEGS.slice(1),
  ];
  const cfgPrior16 = { ...cfgChi, sixteenHourShifts: [priorStart] };
  const blockedStep = L.evaluateLegalTree('sixteen', ['yes', 'yes', 'yes'], {
    segments: segsPrior16,
    now: NOW_0300,
    config: cfgPrior16,
  });
  const blockedOk = blockedStep.verdict?.verdict === 'NO'
    && blockedStep.verdict?.preview?.blockedByLog === true
    && blockedStep.verdict.preview.after.windowEnd === blockedStep.verdict.preview.before.windowEnd;

  return (domOk && blockedOk) || JSON.stringify({
    domOk, blockedOk, q1Detail, q2Text, result: v.result, cite: v.cite, reminder: v.reminder,
    preview: v.preview, wantBaseWinEnd, want16WinEnd, wantBaseDrvEnd, want16DrvEnd,
    blockedVerdict: blockedStep.verdict?.verdict, blockedByLog: blockedStep.verdict?.preview?.blockedByLog,
  });
});

/* ---------------- LG8: 16-Hour Short-Haul NO paths (all 3 questions) ---------------- */
await pin('LG8. 16-Hour Short-Haul NO paths: Q1=NO (5 tours), Q2=NO (used in 7d), Q3=NO (not returning tonight) each end immediately at NO', async () => {
  await seed();
  await openLegalViaHub();
  await pickTree('sixteen');
  const rm1 = await tapAns('no');
  const v1 = readVerdict(rm1);

  fire(all((n) => n.attributes?.['data-legal-restart'] === '1', rm1)[0], 'click'); await sleep(40);
  await tapAns('yes');
  const rm2 = await tapAns('no');
  const v2 = readVerdict(rm2);

  fire(all((n) => n.attributes?.['data-legal-restart'] === '1', rm2)[0], 'click'); await sleep(40);
  await tapAns('yes');
  await tapAns('yes');
  const rm3 = await tapAns('no');
  const v3 = readVerdict(rm3);

  const ok = !!v1 && v1.result === 'NO' && /395\.1\(o\)\(1\)/.test(v1.cite) && v1.adv === ADVISORY
    && !!v2 && v2.result === 'NO' && /395\.1\(o\)\(3\)/.test(v2.cite) && v2.adv === ADVISORY
    && !!v3 && v3.result === 'NO' && /395\.1\(o\)\(2\)/.test(v3.cite) && v3.adv === ADVISORY;
  return ok || JSON.stringify({ v1: v1?.cite, v2: v2?.cite, v3: v3?.cite });
});

/* ---------------- LG9: Safe Haven card, Home advisory line, Plan hub 10th-item placement, zero <input type="time">, zero new localStorage keys ---------------- */
await pin('LG9. Safe Haven (§397.5 explosives-only) static card from tool home, advisory line on home & card, Plan hub 10th item, zero <input type="time">, zero new storage keys', async () => {
  await seed();
  const opened = await openLegalViaHub();
  if (!opened) return 'Could not open Can I Legally Use It?';

  const items = opened.items;
  const titles = items.map((b) => all((n) => n.localName === 'b', b)[0]?.textContent?.trim());
  // Re-aimed (navy1 B1): Plan hub groups the 12 tools by time horizon; verify all 12 items and required titles present.
  if (items.length !== 12 || !titles.includes('Can I Legally Use It?') || !titles.includes('Flip My Clock') || !titles.includes('Miles Left in My 70')) {
    return `Plan hub placement wrong: count=${items.length} titles=${JSON.stringify(titles)}`;
  }

  const rmHome = opened.rm;
  const homeAdv = all((n) => n.attributes?.['data-legal-advisory'] === '1', rmHome)[0]?.textContent?.trim() ?? '';
  const timeInputsHome = all((n) => n.localName === 'input' && n.attributes?.type === 'time', rmHome).length;

  const rmSh = await pickTree('safehaven');
  const vSh = readVerdict(rmSh);
  const timeInputsSh = all((n) => n.localName === 'input' && n.attributes?.type === 'time', rmSh).length;

  // Back to tool home, then Back to Plan hub
  const backToHome = all((n) => n.localName === 'button' && has(n, 'back'), rmSh)[0];
  fire(backToHome, 'click'); await sleep(40);
  const backToPlan = all((n) => n.localName === 'button' && has(n, 'back'), planRoom())[0];
  fire(backToPlan, 'click'); await sleep(260);
  const closedClean = !A.isLegalPlannerOpen();

  // Zero new localStorage keys
  const allowed = new Set(['hos-sandbox-v1', 'hos-sandbox-v1-backup', 'hos-sandbox-v1-sim', 'hos-sandbox-undo-v1']);
  const extraKeys = [...mem.keys()].filter((k) => !allowed.has(k));

  const ok = homeAdv === ADVISORY
    && timeInputsHome === 0 && timeInputsSh === 0
    && !!vSh && vSh.tree === 'safehaven' && vSh.result === 'NO'
    && /397\.5/.test(vSh.cite)
    && /Class 1\.1, 1\.2, and 1\.3 explosives/i.test(vSh.explain)
    && /general freight/i.test(vSh.explain)
    && vSh.adv === ADVISORY
    && closedClean
    && extraKeys.length === 0;
  return ok || JSON.stringify({
    homeAdvOk: homeAdv === ADVISORY, timeInputsHome, timeInputsSh,
    vSh: vSh && { tree: vSh.tree, result: vSh.result, cite: vSh.cite, advOk: vSh.adv === ADVISORY },
    closedClean, extraKeys,
  });
});

/* ---------------- LG10: Engine preview honesty across drive-bound, cycle-bound, and already-active logs ---------------- */
await pin('LG10. Engine preview honesty: direct evaluate() parity on drive-bound (16h does not move mustStopBy), cycle-bound, and already-active adverse (flag & outcome parity)', async () => {
  // Fixture B (drive-bound): 10h OFF -> 18:00 start, D 18:00-23:00 (5h), OFF 23:00-23:30 (30m break), D 23:30-03:00 (3h30m)
  // At 03:00: driveUsed = 8h30m (2h30m left), windowUsed = 9h (5h left). DRIVE_11 binds!
  const driveBoundSegs = [
    { status: 'OFF', start: chi(10, 8, 0), end: chi(10, 18, 0), createdAt: 1 },
    { status: 'D', start: chi(10, 18, 0), end: chi(10, 23, 0), createdAt: 2 },
    { status: 'OFF', start: chi(10, 23, 0), end: chi(10, 23, 30), createdAt: 3 },
    { status: 'D', start: chi(10, 23, 30), end: NOW_0300, createdAt: 4 },
  ];
  const evBaseB = E.evaluate(driveBoundSegs, { asOf: NOW_0300, config: cfgChi });
  const evAdvB = E.evaluate(driveBoundSegs, { asOf: NOW_0300, config: { ...cfgChi, adverseShifts: [evBaseB.shift.exceptionKey] } });
  const ev16B = E.evaluate(driveBoundSegs, { asOf: NOW_0300, config: { ...cfgChi, sixteenHourShifts: [evBaseB.shift.exceptionKey] } });

  const pAdvB = L.previewExceptionClock({ kind: 'adverse', segments: driveBoundSegs, now: NOW_0300, config: cfgChi });
  const p16B = L.previewExceptionClock({ kind: 'sixteen', segments: driveBoundSegs, now: NOW_0300, config: cfgChi });

  // Fixture C (already-active adverse on config): asserts alreadyActiveOnLog flag and before/after
  // outcome parity against evaluate(). Note: duplicate keys are harmless/deduplicated inside the
  // engine itself, so the no-double-add guard is outcome-true rather than independently observable.
  const cfgAlreadyAdv = { ...cfgChi, adverseShifts: [evBaseB.shift.exceptionKey] };
  const pAdvAlready = L.previewExceptionClock({ kind: 'adverse', segments: driveBoundSegs, now: NOW_0300, config: cfgAlreadyAdv });

  // Fixture D (tight 70h cycle binds before adverse or 16h): 6 days * 11h = 66h, today 3h -> 1h cycle left
  const cycleSegs = [];
  for (let d = 5; d <= 10; d++) {
    cycleSegs.push({ status: 'D', start: chi(d, 6, 0), end: chi(d, 14, 0), createdAt: d * 2 });
    cycleSegs.push({ status: 'ON', start: chi(d, 14, 0), end: chi(d, 17, 0), createdAt: d * 2 + 1 });
  }
  cycleSegs.push({ status: 'OFF', start: chi(10, 17, 0), end: chi(11, 3, 0), createdAt: 90 });
  cycleSegs.push({ status: 'D', start: chi(11, 3, 0), end: chi(11, 6, 0), createdAt: 91 });
  const nowCyc = chi(11, 6, 0);
  const evBaseC = E.evaluate(cycleSegs, { asOf: nowCyc, config: cfgChi });
  const evAdvC = E.evaluate(cycleSegs, { asOf: nowCyc, config: { ...cfgChi, adverseShifts: [evBaseC.shift.exceptionKey] } });
  const pAdvC = L.previewExceptionClock({ kind: 'adverse', segments: cycleSegs, now: nowCyc, config: cfgChi });

  const okAdvB = pAdvB.before.mustStopBy === evBaseB.mustStopBy && pAdvB.after.mustStopBy === evAdvB.mustStopBy;
  const ok16B = p16B.before.mustStopBy === evBaseB.mustStopBy
    && p16B.after.mustStopBy === ev16B.mustStopBy
    && p16B.after.mustStopBy === p16B.before.mustStopBy // drive binds -> mustStopBy does NOT move!
    && p16B.after.driveDeadline === p16B.before.driveDeadline
    && p16B.after.windowEnd === ev16B.asOf + (ev16B.shift.limits.window - ev16B.shift.windowUsed)
    && p16B.after.windowEnd > p16B.before.windowEnd
    && /11-hr driving limit still binds/i.test(p16B.bindingNote ?? '');
  const okAlready = pAdvAlready.alreadyActiveOnLog === true
    && pAdvAlready.before.mustStopBy === evBaseB.mustStopBy
    && pAdvAlready.after.mustStopBy === evAdvB.mustStopBy;
  const okCyc = pAdvC.before.mustStopBy === evBaseC.mustStopBy
    && pAdvC.after.mustStopBy === evAdvC.mustStopBy
    && pAdvC.after.mustStopBy === pAdvC.before.mustStopBy
    && /cycle binds first/i.test(pAdvC.bindingNote ?? '');

  return (okAdvB && ok16B && okAlready && okCyc) || JSON.stringify({
    okAdvB, ok16B, okAlready, okCyc,
    p16BNote: p16B.bindingNote, pAdvCNote: pAdvC.bindingNote,
  });
});

/* ---------------- LG11: F1 — Every ELD annotation template <= 60 chars, ASCII, contains "[" placeholder ---------------- */
await pin('LG11. F1 ELD annotation templates: all four YES annotations <= 60 chars, ASCII-only, contain "[" placeholder, PC uses [shipper/receiver], copy button labels template', async () => {
  const cases = [
    ['adverse', ['yes', 'yes']],
    ['pc', ['yes', 'yes']],
    ['yard', ['yes', 'yes']],
    ['sixteen', ['yes', 'yes', 'yes']],
  ];
  const report = [];
  let allOk = true;

  for (const [id, answers] of cases) {
    await seed();
    await openLegalViaHub();
    await pickTree(id);
    let rm;
    for (const a of answers) rm = await tapAns(a);
    const v = readVerdict(rm);
    const ann = v?.annotation ?? '';
    const lenOk = ann.length > 0 && ann.length <= 60;
    const tokenOk = ann.includes('[') && ann.includes(']');
    const asciiOk = /^[\x20-\x7E]+$/.test(ann);
    const btnOk = v?.copyBtn === 'Copy template (edit before saving)';
    const pcOk = id !== 'pc' || (ann.includes('[shipper/receiver]') && !/receiver lot/i.test(ann));
    if (!(lenOk && tokenOk && asciiOk && btnOk && pcOk)) allOk = false;
    report.push({ id, len: ann.length, ann, lenOk, tokenOk, asciiOk, btnOk, pcOk });
  }
  return allOk || JSON.stringify(report);
});

/* ---------------- LG12: F3 — Opus probes P1 & P2 cross-exception stacking honesty ---------------- */
await pin('LG12. F3 cross-exception preview (P1 sixteen+Adverse on, P2 adverse+16h on): honest Before label, stacking warnbox, non-contradictory verdict copy, numbers preserved vs evaluate()', async () => {
  const evBase = E.evaluate(FIXTURE_SEGS, { asOf: NOW_0300, config: cfgChi });
  const key = evBase.shift.exceptionKey;

  // P1: kind=sixteen while cfg.adverseShifts=[currentKey] is already active
  const cfgP1 = { ...cfgChi, adverseShifts: [key] };
  const evP1Before = E.evaluate(FIXTURE_SEGS, { asOf: NOW_0300, config: cfgP1 });
  const evP1After = E.evaluate(FIXTURE_SEGS, { asOf: NOW_0300, config: { ...cfgP1, sixteenHourShifts: [key] } });
  await seed({ config: cfgP1 });
  await openLegalViaHub();
  await pickTree('sixteen');
  await tapAns('yes');
  await tapAns('yes');
  const rmP1 = await tapAns('yes');
  const vP1 = readVerdict(rmP1);

  const p1Ok = !!vP1 && vP1.result === 'YES' && vP1.preview !== null
    && vP1.preview.otherException === 'adverse'
    && vP1.preview.beforeLabel === 'Before (Adverse already on)'
    && !/Before \(standard\)/i.test(vP1.preview.beforeLabel)
    && /NOT confirmed to allow an 18-hr window/i.test(vP1.preview.stackWarn)
    && /check with your carrier/i.test(vP1.preview.stackWarn)
    && vP1.preview.beforeMustStop === evP1Before.mustStopBy
    && vP1.preview.afterMustStop === evP1After.mustStopBy
    && !/14 hours to 16 hours|14h → 16h|extends to 16 hours/i.test(vP1.explain)
    && !/extends to 16 hours/i.test(vP1.reminder)
    && /16h → 18h/.test(vP1.explain);

  // P2: kind=adverse while cfg.sixteenHourShifts=[currentKey] is already active
  const cfgP2 = { ...cfgChi, sixteenHourShifts: [key] };
  const evP2Before = E.evaluate(FIXTURE_SEGS, { asOf: NOW_0300, config: cfgP2 });
  const evP2After = E.evaluate(FIXTURE_SEGS, { asOf: NOW_0300, config: { ...cfgP2, adverseShifts: [key] } });
  await seed({ config: cfgP2 });
  await openLegalViaHub();
  await pickTree('adverse');
  await tapAns('yes');
  const rmP2 = await tapAns('yes');
  const vP2 = readVerdict(rmP2);

  const p2Ok = !!vP2 && vP2.result === 'YES' && vP2.preview !== null
    && vP2.preview.otherException === 'sixteen'
    && vP2.preview.beforeLabel === 'Before (16-hr day already on)'
    && !/Before \(standard\)/i.test(vP2.preview.beforeLabel)
    && /NOT confirmed to allow an 18-hr window/i.test(vP2.preview.stackWarn)
    && /check with your carrier/i.test(vP2.preview.stackWarn)
    && vP2.preview.beforeMustStop === evP2Before.mustStopBy
    && vP2.preview.afterMustStop === evP2After.mustStopBy
    && !/14h → 16h/.test(vP2.explain)
    && /16h → 18h/.test(vP2.explain);

  return (p1Ok && p2Ok) || JSON.stringify({
    p1Ok, p2Ok,
    p1: vP1 && { explain: vP1.explain, reminder: vP1.reminder, preview: vP1.preview },
    p2: vP2 && { explain: vP2.explain, preview: vP2.preview },
  });
});

/* ---------------- LG13: F4 — Opus probe P9 expired-window bindingNote + Drive row relabel ---------------- */
await pin('LG13. F4 expired-window probe (P9): 17h on-duty adverse preview emits ended-at-HH:MM stop-now bindingNote and relabeled 11-hr drive row', async () => {
  // P9 fixture: OFF Nov 10 00:00–10:00, then ON Nov 10 10:00 -> Nov 11 03:00 (17h on duty), adverse
  const segsP9 = [
    { status: 'OFF', start: chi(10, 0, 0), end: chi(10, 10, 0), createdAt: 1 },
    { status: 'ON', start: chi(10, 10, 0), end: NOW_0300, createdAt: 2 },
  ];
  const p9 = L.previewExceptionClock({ kind: 'adverse', segments: segsP9, now: NOW_0300, config: cfgChi });

  await seed({
    segments: segsP9.slice(0, -1),
    current: { status: 'ON', since: chi(10, 10, 0), createdAt: 2 },
    nowOverride: NOW_0300,
    config: cfgChi,
  });
  await openLegalViaHub();
  await pickTree('adverse');
  await tapAns('yes');
  const rm = await tapAns('yes');
  const v = readVerdict(rm);

  const wantNote = `Your window ended at ${p9.before.windowEndHM}; with the exception it ended at ${p9.after.windowEndHM} — stop now.`;
  const ok = !!v && v.preview !== null
    && p9.before.windowRemaining === 0
    && p9.after.windowRemaining === 0
    && p9.after.windowEnd <= NOW_0300
    && p9.before.windowEndHM === '00:00'
    && p9.after.windowEndHM === '02:00'
    && p9.bindingNote === wantNote
    && v.preview.bindingNote === wantNote
    && /11-hr clock runs out \(if nothing else stops you\)/i.test(v.preview.driveLabel)
    && /from your logged record/i.test(v.preview.head);

  return ok || JSON.stringify({
    wantNote, gotP9Note: p9.bindingNote, domNote: v?.preview?.bindingNote,
    beforeEndHM: p9.before.windowEndHM, afterEndHM: p9.after.windowEndHM,
    driveLabel: v?.preview?.driveLabel, head: v?.preview?.head,
  });
});

/* ---------------- LG14: NF1 — Opus probe NEW-A (ineligible 16h toggled + Adverse YES/YES) ---------------- */
await pin('LG14. NF1 probe NEW-A: toggled-but-ineligible 16-hr day keeps Before (standard), no stacking warnbox, and plain Adverse copy with no stacking language', async () => {
  // P6/NEW-A fixture: 16h used Nov 9, toggled again on Nov 10 shift with no 34h restart -> engine keeps window at 14h
  const priorNov9 = chi(9, 16, 0);
  const segsNewA = [
    { status: 'OFF', start: chi(9, 6, 0), end: priorNov9, createdAt: 1 },
    { status: 'D', start: priorNov9, end: chi(9, 21, 0), createdAt: 2 },
    { status: 'OFF', start: chi(9, 21, 0), end: chi(10, 16, 0), createdAt: 3 }, // 19h (< 34h restart)
    ...FIXTURE_SEGS.slice(1),
  ];
  const evBaseA = E.evaluate(segsNewA, { asOf: NOW_0300, config: cfgChi });
  const currentKey = evBaseA.shift.exceptionKey;
  const cfgNewA = { ...cfgChi, sixteenHourShifts: [priorNov9, currentKey] };
  const evRawA = E.evaluate(segsNewA, { asOf: NOW_0300, config: cfgNewA });
  const evAdvA = E.evaluate(segsNewA, { asOf: NOW_0300, config: { ...cfgNewA, adverseShifts: [currentKey] } });

  await seed({
    segments: segsNewA.slice(0, -1),
    current: { status: 'OFF', since: chi(10, 23, 0), createdAt: 4 },
    nowOverride: NOW_0300,
    config: cfgNewA,
  });
  await openLegalViaHub();
  await pickTree('adverse');
  await tapAns('yes');
  const rm = await tapAns('yes');
  const v = readVerdict(rm);

  const ok = evRawA.shift.exceptionKeys.sixteen !== null
    && evRawA.shift.limits.window === 840
    && evAdvA.shift.limits.window === 960
    && !!v && v.result === 'YES' && v.preview !== null
    && v.preview.otherException === ''
    && v.preview.beforeLabel === 'Before (standard)'
    && v.preview.stackWarn === ''
    && v.preview.beforeMustStop === evRawA.mustStopBy
    && v.preview.afterMustStop === evAdvA.mustStopBy
    && /11h → 13h/.test(v.explain) && /14h → 16h/.test(v.explain)
    && !/stacking|NOT confirmed|already has the 16-hr|an 16-hr/i.test(v.explain);

  return ok || JSON.stringify({
    rawSixteenKey: evRawA.shift.exceptionKeys.sixteen,
    rawWin: evRawA.shift.limits.window,
    advWin: evAdvA.shift.limits.window,
    result: v?.result,
    explain: v?.explain,
    preview: v?.preview,
  });
});

/* ---------------- LG15: NF2 — Opus probe NEW-B (Adverse on + prior 16h Nov 9 + 16h tree YES x3) ---------------- */
await pin('LG15. NF2 probe NEW-B: stacked + log-blocked 16-hr card cites §395.1(o)(3) and actual 16-hr window (not Adverse note and not hard-coded 14 hours)', async () => {
  const priorNov9 = chi(9, 16, 0);
  const segsNewB = [
    { status: 'OFF', start: chi(9, 6, 0), end: priorNov9, createdAt: 1 },
    { status: 'D', start: priorNov9, end: chi(9, 21, 0), createdAt: 2 },
    { status: 'OFF', start: chi(9, 21, 0), end: chi(10, 16, 0), createdAt: 3 }, // 19h (< 34h restart)
    ...FIXTURE_SEGS.slice(1),
  ];
  const evBaseB = E.evaluate(segsNewB, { asOf: NOW_0300, config: cfgChi });
  const currentKey = evBaseB.shift.exceptionKey;
  const cfgNewB = { ...cfgChi, adverseShifts: [currentKey], sixteenHourShifts: [priorNov9] };
  const evBeforeB = E.evaluate(segsNewB, { asOf: NOW_0300, config: cfgNewB });
  const evAfterB = E.evaluate(segsNewB, {
    asOf: NOW_0300,
    config: { ...cfgNewB, sixteenHourShifts: [priorNov9, currentKey] },
  });

  await seed({
    segments: segsNewB.slice(0, -1),
    current: { status: 'OFF', since: chi(10, 23, 0), createdAt: 4 },
    nowOverride: NOW_0300,
    config: cfgNewB,
  });
  await openLegalViaHub();
  await pickTree('sixteen');
  await tapAns('yes');
  await tapAns('yes');
  const rm = await tapAns('yes');
  const v = readVerdict(rm);

  const ok = evBeforeB.shift.limits.window === 960
    && evAfterB.shift.limits.window === 960
    && evAfterB.shift.notes.some((n) => /Adverse driving conditions declared/i.test(n))
    && evAfterB.shift.notes.some((n) => /§395\.1\(o\)\(3\)/.test(n))
    && !!v && v.result === 'NO'
    && v.signLabel === 'NO — ALREADY USED IN LOG'
    && /395\.1\(o\)\(3\)/.test(v.cite)
    && v.preview !== null
    && v.preview.beforeLabel === 'Before (Adverse already on)'
    && v.preview.stackWarn === ''
    && v.preview.beforeMustStop === evBeforeB.mustStopBy
    && v.preview.afterMustStop === evAfterB.mustStopBy
    && /395\.1\(o\)\(3\)/.test(v.explain)
    && /16 hours/i.test(v.explain)
    && !/Adverse driving conditions declared|395\.1\(b\)\(1\)|14 hours/i.test(v.explain)
    && /395\.1\(o\)\(3\)/.test(v.preview.bindingNote)
    && /16 hours/i.test(v.preview.bindingNote)
    && !/Adverse driving conditions declared|395\.1\(b\)\(1\)|14 hours/i.test(v.preview.bindingNote)
    && /16 hours/i.test(v.reminder) && /13-hour drive limit does NOT expand/i.test(v.reminder);

  return ok || JSON.stringify({
    notes: evAfterB.shift.notes,
    result: v?.result,
    signLabel: v?.signLabel,
    cite: v?.cite,
    explain: v?.explain,
    reminder: v?.reminder,
    preview: v?.preview,
  });
});

let bad = 0;
for (const [st, name, detail] of res) {
  console.log(`${st.padEnd(5)} ${name}${detail ? '\n      ' + detail : ''}`);
  if (st !== 'PASS') bad++;
}
console.log(`\n${res.length - bad}/${res.length} legal pins passed`);
render(null, root);
process.exit(bad ? 1 : 0);

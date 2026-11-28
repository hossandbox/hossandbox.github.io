// Logpatch2 DOM pins (closing review findings F1–F6):
//   LP1 (F1 + parity)      — Scoped compare reads LOGGED rows only (what-if OFF 07:00-09:00 driven through): Now Refresh & Log Compare today both say in-sync, zero phantom fill.
//   LP2 (F2a + parity)     — No history clipping before evaluate(): overnight shift Wed 20:00-Thu 03:00 after >=10h rest: Now Refresh & Log Compare today both say in-sync (4:00 left), zero phantom fill.
//   LP3 (F2b + F3 + F5)    — Past-day compare is TOTALS-ONLY: past day ending in >=10h OFF never reports a fresh 11:00; guide uses totals framing; mismatch reports side-by-side difference with NO apply control; matching totals report in-sync; lastEldCheckAt untouched.
//   LP4 (Today + Fences)   — Today (back===0) keeps clocks compare-and-choose WITH day-fenced fills, clocks guide framing, lastEldCheckAt stamp; Now Refresh stays unscoped; storage keys unchanged.
//   LP5 (F4)               — Disambiguated Log swipe: day-cycle swipe works on .daynav + .log-graph-card with all guards (vertical, sheet, mid-edit, 220ms swap, reduced-motion, boundaries, arrows); .log-scroll does NOT hijack horizontal swipes so Log -> Now strip paging stays intact.
import './domshim.mjs';

const rawSetTimeout = globalThis.setTimeout;
// Thu Nov 26, 2026 12:00 CST (so carrier day start 00:00 in America/Chicago gives clean midnight boundaries).
let currentNowMs = new Date('2026-11-26T18:00:00Z').getTime(); // 12:00 CST
Date.now = () => currentNowMs;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
  get length() { return mem.size; },
  key: (i) => [...mem.keys()][i] ?? null,
};
globalThis.confirm = () => true;
globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'logpatch2';
globalThis.requestAnimationFrame = (cb) => { cb(0); return 1; };
globalThis.cancelAnimationFrame = () => {};
globalThis.scrollTo = () => {};
globalThis.__reducedMotion = false;
globalThis.matchMedia = (q) => ({
  matches: /reduced-motion/.test(q) ? globalThis.__reducedMotion : /dark/.test(q) ? globalThis.__dark : false,
  addEventListener() {},
  removeEventListener() {},
});
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'logpatch2-dom-test', vibrate: () => false },
  configurable: true,
  writable: true,
});

const { render, h } = await import('preact');
const A = await import('../../src/app.tsx');
const S = await import('../../src/store.ts');
const E = await import('../../../engine/src/index.ts');

const { App } = A;
const { getState, setState, setDriverGateBypassForTest } = S;
setDriverGateBypassForTest(true);

const sleep = (ms = 40) => new Promise((r) => rawSetTimeout(r, ms));
const root = document.createElement('div');
document.body.appendChild(root);

const all = (pred, scope = root) => {
  const out = [];
  const walk = (n) => { if (pred(n)) out.push(n); n.childNodes.forEach(walk); };
  walk(scope);
  return out;
};
const has = (n, cls) => (n.attributes?.class || '').split(/\s+/).includes(cls);
const fire = (node, type, extra = {}) => {
  const want = type.toLowerCase();
  for (const k of Object.keys(node.listeners)) {
    if (k.toLowerCase() !== want) continue;
    const ev = { type: k, target: node, currentTarget: node, cancelable: true, preventDefault() {}, stopPropagation() {}, ...extra };
    for (const f of node.listeners[k] ?? []) f.call(node, ev);
  }
};
const clickNode = async (node, ms = 35) => {
  if (!node) throw new Error('clickNode: null node');
  fire(node, 'click');
  await sleep(ms);
};
const swipeNode = (node, x0, y0, dx, dy, target = node) => {
  const mkTouch = (x, y) => ({ clientX: x, clientY: y, pageX: x, pageY: y, identifier: 0 });
  fire(node, 'touchstart', { target, touches: [mkTouch(x0, y0)], changedTouches: [mkTouch(x0, y0)] });
  fire(node, 'touchmove', { target, touches: [mkTouch(x0 + dx * 0.5, y0 + dy * 0.5)], changedTouches: [mkTouch(x0 + dx * 0.5, y0 + dy * 0.5)] });
  fire(node, 'touchmove', { target, touches: [mkTouch(x0 + dx, y0 + dy)], changedTouches: [mkTouch(x0 + dx, y0 + dy)] });
  fire(node, 'touchend', { target, touches: [], changedTouches: [mkTouch(x0 + dx, y0 + dy)] });
};
const setInputVal = (node, val) => {
  if (!node) throw new Error('setInputVal: null node');
  node.value = val;
  fire(node, 'input', { target: node });
};

const ALLOWED_KEYS = new Set(['hos-sandbox-v1', 'hos-sandbox-v1-backup', 'hos-sandbox-v1-sim', 'hos-sandbox-undo-v1']);
const T12ms = new Date('2026-11-26T18:00:00Z').getTime(); // Thu Nov 26 12:00 CST
const T12 = Math.floor(T12ms / 60000);
const CFG = { ...S.INITIAL_STATE.config, timeZone: 'America/Chicago', dayStartHour: 0, dayStartMinute: 0 };
const day0Start = E.carrierDayStart(T12, CFG); // Thu Nov 26 00:00 CST
const day0End = E.nextCarrierDayStart(day0Start, CFG);
const day1Start = E.carrierDayStart(day0Start - 1, CFG); // Wed Nov 25 00:00 CST
const day1End = day0Start;
const day2Start = E.carrierDayStart(day1Start - 1, CFG); // Tue Nov 24 00:00 CST

render(h(App, {}), root);
await sleep(40);

const logPg = () => all((n) => n.localName === 'section' && has(n, 'page-log'))[0];
const nowPg = () => all((n) => n.localName === 'section' && has(n, 'page-now'))[0];
const dayTitle = () => all((n) => has(n, 'daynav-title'), logPg())[0]?.textContent || '';
const resetLogToToday = async () => {
  for (let i = 0; i < 10; i++) {
    const nextBtn = all((n) => n.localName === 'button' && n.attributes?.['aria-label'] === 'Next day', logPg())[0];
    if (!nextBtn || nextBtn.attributes?.disabled !== undefined || nextBtn.disabled) break;
    await clickNode(nextBtn, 20);
  }
};

let pass = 0, fail = 0;
const pin = async (name, fn) => {
  try {
    const r = await fn();
    if (r === true) { console.log(`PASS  ${name}`); pass++; }
    else { console.log(`FAIL  ${name}\n      ${r}`); fail++; }
  } catch (e) {
    console.log(`FAIL  ${name}\n      threw: ${e?.stack || e}`);
    fail++;
  }
};

/* ---- LP1 (F1 + Log-vs-Now parity): What-if OFF 07:00-09:00 driven through ---- */
await pin('LP1. F1: Thu 12:00 with stale what-if OFF 07:00-09:00 driven through -> Now Refresh AND Log "Compare today" both say in-sync (7:00 left), no fill offered on either surface', async () => {
  currentNowMs = T12ms;
  // Review F1 exact scenario:
  // Logged: OFF until 06:00 (>=10h rest from Wed 20:00), D 06:00-10:00 (4h -> 7:00 left),
  // unlogged gap 10:00-11:00, live ON 11:00-12:00.
  // Stale what-if: OFF 07:00-09:00 (planned break the driver drove through).
  setState({
    tab: 'now',
    config: CFG,
    nowOverride: T12,
    disclaimerAcked: true,
    historyAcknowledged: true,
    segments: [
      { status: 'OFF', start: day1Start + 1200, end: day0Start + 360, createdAt: 1 }, // Wed 20:00 -> Thu 06:00 (10h)
      { status: 'D', start: day0Start + 360, end: day0Start + 600, createdAt: 2 },   // Thu 06:00 -> 10:00 (4h)
      // unlogged gap Thu 10:00 -> 11:00
    ],
    tentative: [
      { status: 'OFF', start: day0Start + 420, end: day0Start + 540, tentative: true, createdAt: 3 }, // what-if 07:00-09:00
    ],
    current: { status: 'ON', since: day0Start + 660, createdAt: 4 }, // Thu 11:00 -> 12:00
    lastEldCheckAt: null,
  });
  A.openSheet(null);
  await sleep(40);
  const snapBefore = JSON.stringify({ segments: getState().segments, tentative: getState().tentative, current: getState().current });

  // Pure store parity check: unscoped === today-scoped
  const cmpNow = S.driftCheck(getState(), 420, T12);
  const cmpToday = S.driftCheck(getState(), 420, T12, { start: day0Start, end: day0End });
  if (cmpNow.verdict !== 'sync' || cmpNow.appLeft !== 420 || cmpNow.gap !== 0) {
    return `unscoped driftCheck wrong: ${JSON.stringify(cmpNow)}`;
  }
  if (cmpToday.verdict !== 'sync' || cmpToday.appLeft !== 420 || cmpToday.gap !== 0) {
    return `today-scoped driftCheck diverged from Now (read what-if row?): ${JSON.stringify(cmpToday)}`;
  }
  if (A.addDriftFill(420, T12, { start: day0Start, end: day0End }) !== null) {
    return 'addDriftFill wrote phantom driving on in-sync state with stale what-if';
  }

  // 1) Now Refresh UI with ELD 7:00
  const nowBtn = all((n) => n.attributes?.['data-eld-screenshot-btn'] === '1', nowPg())[0];
  await clickNode(nowBtn, 40);
  setInputVal(all((n) => n.attributes?.['data-drift-h'] === '1')[0], '7');
  setInputVal(all((n) => n.attributes?.['data-drift-m'] === '1')[0], '0');
  await sleep(20);
  await clickNode(all((n) => n.attributes?.['data-drift-compare'] === '1')[0], 40);
  const nowText = all((n) => has(n, 'sheet'))[0]?.textContent || '';
  const nowFillBtn = all((n) => n.localName === 'button' && /Add the missing driving/.test(n.textContent))[0];
  A.openSheet(null);
  await sleep(30);
  if (!/You're in sync/.test(nowText) || nowFillBtn) {
    return `Now Refresh failed parity: text="${nowText}" fillBtn=${!!nowFillBtn}`;
  }

  // 2) Log "Compare today" UI with ELD 7:00
  setState({ tab: 'log' });
  await sleep(40);
  await resetLogToToday();
  await clickNode(all((n) => n.attributes?.['data-log-eld-compare'] === '1', logPg())[0], 40);
  setInputVal(all((n) => n.attributes?.['data-drift-h'] === '1')[0], '7');
  setInputVal(all((n) => n.attributes?.['data-drift-m'] === '1')[0], '0');
  await sleep(20);
  await clickNode(all((n) => n.attributes?.['data-drift-compare'] === '1')[0], 40);
  const logText = all((n) => has(n, 'sheet'))[0]?.textContent || '';
  const logFillBtn = all((n) => n.localName === 'button' && /Add the missing driving/.test(n.textContent))[0];
  A.openSheet(null);
  await sleep(30);
  if (!/You're in sync/.test(logText) || logFillBtn) {
    return `Log Compare today diverged from Now (phantom fill offered!): text="${logText}" fillBtn=${!!logFillBtn}`;
  }
  const snapAfter = JSON.stringify({ segments: getState().segments, tentative: getState().tentative, current: getState().current });
  if (snapAfter !== snapBefore) return 'LP1 mutated segments/tentative/current';
  return true;
});

/* ---- LP2 (F2a + Log-vs-Now parity): Overnight / midnight-crossing shift ---- */
await pin('LP2. F2(a): overnight shift (10h OFF ending Wed 20:00, drives Wed 20:00-Thu 03:00) -> Log "Compare today" agrees with Now (in sync, 4:00 left), no phantom fill', async () => {
  const T5 = day0Start + 300; // Thu Nov 26 05:00 CST
  currentNowMs = T5 * 60000;
  setState({
    tab: 'now',
    config: CFG,
    nowOverride: T5,
    disclaimerAcked: true,
    historyAcknowledged: true,
    segments: [
      { status: 'OFF', start: day1Start + 600, end: day1Start + 1200, createdAt: 1 }, // Wed 10:00 -> 20:00 (10h reset)
      { status: 'D', start: day1Start + 1200, end: day1End, createdAt: 2 },           // Wed 20:00 -> 24:00 (4h)
      { status: 'D', start: day0Start, end: day0Start + 180, createdAt: 3 },          // Thu 00:00 -> 03:00 (3h; 7h total -> 4:00 left)
      { status: 'ON', start: day0Start + 180, end: day0Start + 240, createdAt: 4 },   // Thu 03:00 -> 04:00
      // unlogged gap Thu 04:00 -> 04:30 (30m)
    ],
    tentative: [],
    current: { status: 'OFF', since: day0Start + 270, createdAt: 5 }, // Thu 04:30 -> 05:00
    lastEldCheckAt: null,
  });
  A.openSheet(null);
  await sleep(40);
  const snapBefore = JSON.stringify({ segments: getState().segments, tentative: getState().tentative, current: getState().current });

  // Pure parity check
  const cmpNow = S.driftCheck(getState(), 240, T5);
  const cmpToday = S.driftCheck(getState(), 240, T5, { start: day0Start, end: day0End });
  if (cmpNow.verdict !== 'sync' || cmpNow.appLeft !== 240 || cmpNow.gap !== 0) {
    return `unscoped overnight driftCheck wrong: ${JSON.stringify(cmpNow)}`;
  }
  if (cmpToday.verdict !== 'sync' || cmpToday.appLeft !== 240 || cmpToday.gap !== 0) {
    return `today-scoped overnight driftCheck clipped prior day history: ${JSON.stringify(cmpToday)}`;
  }
  if (A.addDriftFill(240, T5, { start: day0Start, end: day0End }) !== null) {
    return 'addDriftFill wrote phantom driving on overnight shift';
  }

  // Now Refresh UI with ELD 4:00
  await clickNode(all((n) => n.attributes?.['data-eld-screenshot-btn'] === '1', nowPg())[0], 40);
  setInputVal(all((n) => n.attributes?.['data-drift-h'] === '1')[0], '4');
  setInputVal(all((n) => n.attributes?.['data-drift-m'] === '1')[0], '0');
  await sleep(20);
  await clickNode(all((n) => n.attributes?.['data-drift-compare'] === '1')[0], 40);
  const nowText = all((n) => has(n, 'sheet'))[0]?.textContent || '';
  const nowFill = all((n) => n.localName === 'button' && /Add the missing driving/.test(n.textContent))[0];
  A.openSheet(null);
  await sleep(30);
  if (!/You're in sync/.test(nowText) || !/4h/.test(nowText) || nowFill) {
    return `Now Refresh overnight wrong: text="${nowText}" fill=${!!nowFill}`;
  }

  // Log "Compare today" UI with ELD 4:00
  setState({ tab: 'log' });
  await sleep(40);
  await resetLogToToday();
  await clickNode(all((n) => n.attributes?.['data-log-eld-compare'] === '1', logPg())[0], 40);
  setInputVal(all((n) => n.attributes?.['data-drift-h'] === '1')[0], '4');
  setInputVal(all((n) => n.attributes?.['data-drift-m'] === '1')[0], '0');
  await sleep(20);
  await clickNode(all((n) => n.attributes?.['data-drift-compare'] === '1')[0], 40);
  const logText = all((n) => has(n, 'sheet'))[0]?.textContent || '';
  const logFill = all((n) => n.localName === 'button' && /Add the missing driving/.test(n.textContent))[0];
  A.openSheet(null);
  await sleep(30);
  currentNowMs = T12ms;
  if (!/You're in sync/.test(logText) || !/4h/.test(logText) || logFill) {
    return `Log Compare today overnight wrong (clipped Wed driving!): text="${logText}" fill=${!!logFill}`;
  }
  const snapAfter = JSON.stringify({ segments: getState().segments, tentative: getState().tentative, current: getState().current });
  if (snapAfter !== snapBefore) return 'LP2 mutated log state';
  return true;
});

/* ---- LP3 (F2b + F3 + F5): Past-day ending in >=10h OFF -> TOTALS-ONLY compare ---- */
await pin('LP3. F2(b)+F3+F5: past day ending in >=10h OFF uses totals-only compare (never fresh 11:00, no apply control, totals guide copy, mismatch reported as difference, match reports in-sync, lastEldCheckAt untouched)', async () => {
  currentNowMs = T12ms;
  const PRIOR_ELD_CHECK = 777000;
  // Wed Nov 25: 3h Driving (00:00-03:00), 1h 30m ON (03:00-04:30), 19h 30m OFF (04:30-24:00, >=10h OFF!).
  // Plus a tentative what-if D row on Wed (06:00-08:00) that must NOT inflate logged totals.
  setState({
    tab: 'log',
    config: CFG,
    nowOverride: T12,
    disclaimerAcked: true,
    historyAcknowledged: true,
    segments: [
      { status: 'D', start: day1Start, end: day1Start + 180, createdAt: 1 },          // Wed 3h driving
      { status: 'ON', start: day1Start + 180, end: day1Start + 270, createdAt: 2 },   // Wed 1h 30m ON
      { status: 'OFF', start: day1Start + 270, end: day1End, createdAt: 3 },          // Wed 19h 30m OFF (>=10h!)
      // Today Thu Nov 26:
      { status: 'OFF', start: day0Start, end: day0Start + 360, createdAt: 4 },
      { status: 'D', start: day0Start + 360, end: day0Start + 480, createdAt: 5 },
    ],
    tentative: [
      { status: 'D', start: day1Start + 360, end: day1Start + 480, tentative: true, createdAt: 6 }, // what-if Wed D
    ],
    current: { status: 'ON', since: day0Start + 540, createdAt: 7 },
    lastEldCheckAt: PRIOR_ELD_CHECK,
  });
  A.openSheet(null);
  await sleep(40);
  await resetLogToToday();

  // Navigate to Wed Nov 25 (back=1)
  await clickNode(all((n) => n.localName === 'button' && n.attributes?.['aria-label'] === 'Previous day', logPg())[0], 40);
  if (!/Wed, Nov 25/.test(dayTitle())) return `expected Wed, Nov 25, got "${dayTitle()}"`;
  const snapBefore = JSON.stringify({ segments: getState().segments, tentative: getState().tentative, current: getState().current });

  // Open Compare for Wed Nov 25 -> MUST be totals mode!
  await clickNode(all((n) => n.attributes?.['data-log-eld-compare'] === '1', logPg())[0], 40);
  const wrap = all((n) => n.attributes?.['data-drift-sheet'] === '1' && n.attributes?.['data-drift-mode'] === 'totals')[0];
  if (!wrap) return 'past-day DriftSheet did not open in totals mode [data-drift-mode="totals"]';
  const banner = all((n) => n.attributes?.['data-drift-day-banner'] === '1')[0];
  if (!banner || !/Comparing Wed, Nov 25/.test(banner.textContent)) return `wrong banner: "${banner?.textContent}"`;
  if (!/compare the day's totals/i.test(wrap.textContent)) return `past-day sheet missing totals framing: "${wrap.textContent}"`;

  // In-flow guide copy must use totals framing ("we'll compare the day's totals"), NOT clocks-only "not Daily Log"
  await clickNode(all((n) => n.attributes?.['data-eld-help-btn'] === '1')[0], 30);
  const picker = all((n) => n.attributes?.['data-eld-guide-picker'] === '1')[0];
  if (!picker || !/we'll compare the day's totals/i.test(picker.textContent)) {
    return `past-day EldGuideFlow picker missing totals framing: "${picker?.textContent}"`;
  }
  await clickNode(all((n) => n.attributes?.['data-eld-item'] === 'samsara')[0], 30);
  const whichScreen = all((n) => n.attributes?.['data-eld-which-screen'] === '1')[0];
  if (!whichScreen || !/we'll compare the day's totals/i.test(whichScreen.textContent) || /not Daily Log/i.test(whichScreen.textContent)) {
    return `past-day EldGuideFlow detail had wrong screen framing: "${whichScreen?.textContent}"`;
  }
  await clickNode(all((n) => n.attributes?.['data-eld-guide-return'] === '1')[0], 30);

  // OCR Daily Log totals: Driving 6:00, On Duty Not Driving 1:30, Off Duty 16:30 (Off Duty must NOT overwrite On Duty, Not Driving must NOT overwrite Driving!)
  const fakeTotalsWords = [
    { text: 'Driving', confidence: 96, bbox: { x0: 10, y0: 10, x1: 90, y1: 30 } },
    { text: '6:00', confidence: 96, bbox: { x0: 140, y0: 10, x1: 200, y1: 30 } },
    { text: 'On', confidence: 96, bbox: { x0: 10, y0: 50, x1: 40, y1: 70 } },
    { text: 'Duty', confidence: 96, bbox: { x0: 46, y0: 50, x1: 95, y1: 70 } },
    { text: 'Not', confidence: 96, bbox: { x0: 102, y0: 50, x1: 130, y1: 70 } },
    { text: 'Driving', confidence: 96, bbox: { x0: 136, y0: 50, x1: 200, y1: 70 } },
    { text: '1:30', confidence: 96, bbox: { x0: 230, y0: 50, x1: 290, y1: 70 } },
    { text: 'Off', confidence: 96, bbox: { x0: 10, y0: 90, x1: 45, y1: 110 } },
    { text: 'Duty', confidence: 96, bbox: { x0: 50, y0: 90, x1: 95, y1: 110 } },
    { text: '16:30', confidence: 96, bbox: { x0: 140, y0: 90, x1: 210, y1: 110 } },
  ];
  A.setEldOcrOverrideForTest(async () => ({ auto: fakeTotalsWords, sparse: fakeTotalsWords }));
  try {
    const driftWrap = all((n) => n.attributes?.['data-drift-sheet'] === '1' && n.attributes?.['data-drift-mode'] === 'totals')[0];
    const fileIn = all((n) => n.localName === 'input' && n.attributes?.type === 'file', driftWrap)[0];
    if (!fileIn) return 'missing file input inside past-day DriftSheet';
    fileIn.files = [{}];
    fire(fileIn, 'change');
    await sleep(60);

    // Compare mismatched totals (App Driving 3h vs ELD 6h; App On Duty 1h30m vs ELD 1h30m)
    await clickNode(all((n) => n.attributes?.['data-drift-compare'] === '1')[0], 40);
    const diffSheet = all((n) => has(n, 'sheet'))[0]?.textContent || '';
    const applyBtns = all((n) => n.localName === 'button' && /Add the missing|Apply|Fill/i.test(n.textContent));
    if (applyBtns.length > 0) return `past-day compare offered apply/fill button: ${applyBtns.map((b) => b.textContent).join(', ')}`;
    if (/11h|11:00|drive time left/i.test(diffSheet)) return `past-day compare leaked fresh 11:00 or drive-left copy: "${diffSheet}"`;
    if (!/3h/.test(diffSheet) || !/6h/.test(diffSheet) || !/more driving/i.test(diffSheet)) {
      return `past-day totals mismatch did not report side-by-side difference: "${diffSheet}"`;
    }
    if (!/1h 30m/.test(diffSheet) || !/In sync/.test(diffSheet)) {
      return `past-day On Duty matching total not shown as in sync: "${diffSheet}"`;
    }
    // F5: lastEldCheckAt MUST NOT be stamped!
    if (getState().lastEldCheckAt !== PRIOR_ELD_CHECK) {
      return `F5 violated: past-day totals compare stamped lastEldCheckAt to ${getState().lastEldCheckAt} (expected ${PRIOR_ELD_CHECK})`;
    }
    if (JSON.stringify({ segments: getState().segments, tentative: getState().tentative, current: getState().current }) !== snapBefore) {
      return 'past-day totals compare mutated log!';
    }
  } finally {
    A.setEldOcrOverrideForTest(null);
    A.openSheet(null);
    await sleep(40);
  }

  // Reopen Wed compare with MATCHING totals (Driving 3:00, On Duty 1:30) -> reports in-sync!
  await clickNode(all((n) => n.attributes?.['data-log-eld-compare'] === '1', logPg())[0], 40);
  setInputVal(all((n) => n.attributes?.['data-totals-drive-h'] === '1')[0], '3');
  setInputVal(all((n) => n.attributes?.['data-totals-drive-m'] === '1')[0], '0');
  setInputVal(all((n) => n.attributes?.['data-totals-on-h'] === '1')[0], '1');
  setInputVal(all((n) => n.attributes?.['data-totals-on-m'] === '1')[0], '30');
  await sleep(20);
  await clickNode(all((n) => n.attributes?.['data-drift-compare'] === '1')[0], 40);
  const syncSheet = all((n) => has(n, 'sheet'))[0]?.textContent || '';
  const syncApplyBtns = all((n) => n.localName === 'button' && /Add the missing|Apply|Fill/i.test(n.textContent));
  A.openSheet(null);
  await sleep(30);
  if (!/You're in sync/.test(syncSheet) || syncApplyBtns.length > 0) {
    return `matching past-day totals did not report in-sync cleanly: text="${syncSheet}" applyBtns=${syncApplyBtns.length}`;
  }
  if (getState().lastEldCheckAt !== PRIOR_ELD_CHECK) {
    return `F5 violated on matching past-day totals: lastEldCheckAt=${getState().lastEldCheckAt}`;
  }
  if (JSON.stringify({ segments: getState().segments, tentative: getState().tentative, current: getState().current }) !== snapBefore) {
    return 'matching past-day totals mutated log!';
  }
  return true;
});

/* ---- LP4 (Today clocks compare WITH day-fenced fills + Now Refresh + storage invariant) ---- */
await pin('LP4. Today (back===0) keeps clocks compare-and-choose WITH day-fenced fills, clocks guide copy, and lastEldCheckAt stamp; Now Refresh stays unscoped; storage keys unchanged', async () => {
  currentNowMs = T12ms;
  // Wed has a 2h gap (10:00-12:00) and ends with >=10h OFF (14:00-24:00).
  // Today has 2h driving (06:00-08:00), 1h gap (08:00-09:00), live ON since 09:00 -> appLeft = 9:00 (540m).
  setState({
    tab: 'log',
    config: CFG,
    nowOverride: T12,
    disclaimerAcked: true,
    historyAcknowledged: true,
    segments: [
      { status: 'OFF', start: day1Start, end: day1Start + 360, createdAt: 1 },
      { status: 'D', start: day1Start + 360, end: day1Start + 600, createdAt: 2 },
      // Wed 2h gap 10:00-12:00
      { status: 'ON', start: day1Start + 720, end: day1Start + 840, createdAt: 3 },
      { status: 'OFF', start: day1Start + 840, end: day1End, createdAt: 4 },
      // Today:
      { status: 'OFF', start: day0Start, end: day0Start + 360, createdAt: 5 },
      { status: 'D', start: day0Start + 360, end: day0Start + 480, createdAt: 6 },
      // Today 1h gap 08:00-09:00
    ],
    tentative: [],
    current: { status: 'ON', since: day0Start + 540, createdAt: 7 },
    lastEldCheckAt: null,
  });
  A.openSheet(null);
  await sleep(40);
  await resetLogToToday();

  // Open Compare today -> clocks mode + clocks guide framing
  await clickNode(all((n) => n.attributes?.['data-log-eld-compare'] === '1', logPg())[0], 40);
  const wrap = all((n) => n.attributes?.['data-drift-sheet'] === '1' && n.attributes?.['data-drift-mode'] === 'clocks')[0];
  if (!wrap) return 'Today compare did not open in clocks mode';
  await clickNode(all((n) => n.attributes?.['data-eld-help-btn'] === '1')[0], 30);
  const picker = all((n) => n.attributes?.['data-eld-guide-picker'] === '1')[0];
  if (!picker || !/countdown clocks/i.test(picker.textContent)) return `Today guide missing clocks framing: "${picker?.textContent}"`;
  await clickNode(all((n) => n.attributes?.['data-eld-guide-return'] === '1')[0], 30);

  // Enter ELD 8:00 (1h missing vs Today's 9:00)
  const snapBefore = JSON.stringify(getState().segments);
  setInputVal(all((n) => n.attributes?.['data-drift-h'] === '1')[0], '8');
  setInputVal(all((n) => n.attributes?.['data-drift-m'] === '1')[0], '0');
  await sleep(20);
  await clickNode(all((n) => n.attributes?.['data-drift-compare'] === '1')[0], 40);
  if (JSON.stringify(getState().segments) !== snapBefore) return 'Today Compare mutated log before driver tap';
  if (getState().lastEldCheckAt !== T12) return `Today Compare did not stamp lastEldCheckAt=${T12}`;
  const addBtn = all((n) => n.localName === 'button' && /Add the missing driving/.test(n.textContent))[0];
  if (!addBtn) return 'Today Compare missing "Add the missing driving" button';
  await clickNode(addBtn, 40);
  A.openSheet(null);
  await sleep(30);

  const added = getState().segments.filter((x) => x.note === S.DRIFT_NOTE);
  if (added.length !== 1 || added[0].start !== day0Start + 480 || added[0].end !== day0Start + 540) {
    return `Today fill landed in wrong range: ${JSON.stringify(added)}`;
  }

  // Now Today is 100% covered while Wed STILL has a 2h gap: Today fill must NOT spill backward into Wed!
  const spillPlan = S.planDriftFill(getState(), 60, T12, { start: day0Start, end: day0End });
  if (spillPlan !== null) return `planDriftFill spilled backward from full Today into Wed: ${JSON.stringify(spillPlan)}`;
  const spillApply = A.addDriftFill(420, T12, { start: day0Start, end: day0End });
  if (spillApply !== null) return `addDriftFill spilled backward into Wed: ${JSON.stringify(spillApply)}`;

  // Now Refresh stays unscoped (no day banner) and localStorage has only the 4 allowed keys
  setState({ tab: 'now' });
  await sleep(40);
  await clickNode(all((n) => n.attributes?.['data-eld-screenshot-btn'] === '1', nowPg())[0], 40);
  const nowBanner = all((n) => n.attributes?.['data-drift-day-banner'] === '1')[0];
  const nowWrap = all((n) => n.attributes?.['data-drift-sheet'] === '1' && n.attributes?.['data-drift-shot-mode'] === '1')[0];
  A.openSheet(null);
  await sleep(30);
  if (!nowWrap || nowBanner) return `Now Refresh broken: wrap=${!!nowWrap} banner=${!!nowBanner}`;
  const extraKeys = [...mem.keys()].filter((k) => !ALLOWED_KEYS.has(k));
  if (extraKeys.length) return `unexpected localStorage keys: ${extraKeys.join(', ')}`;
  return true;
});

/* ---- LP5 (F4): Disambiguated Log swipe (day-cycle on .daynav + .log-graph-card; .log-scroll preserved for strip paging) ---- */
await pin('LP5. F4: Log day-cycle swipe works on .daynav and .log-graph-card with all guards (vertical, sheet, mid-edit, swap, reduced-motion, boundaries, arrows), while .log-scroll preserves strip paging', async () => {
  currentNowMs = T12ms;
  const threeDaySegs = [
    { status: 'OFF', start: day2Start, end: day2Start + 600, createdAt: 1 },
    { status: 'D', start: day2Start + 600, end: day2Start + 720, createdAt: 2 },
    { status: 'OFF', start: day1Start, end: day1Start + 600, createdAt: 3 },
    { status: 'D', start: day1Start + 600, end: day1Start + 780, createdAt: 4 },
    { status: 'OFF', start: day0Start, end: day0Start + 360, createdAt: 5 },
    { status: 'D', start: day0Start + 360, end: day0Start + 480, createdAt: 6 },
  ];
  globalThis.__reducedMotion = false;
  setState({
    tab: 'log',
    config: CFG,
    nowOverride: T12,
    segments: threeDaySegs,
    tentative: [],
    current: { status: 'ON', since: day0Start + 480, createdAt: 7 },
  });
  A.openSheet(null);
  await resetLogToToday();
  await sleep(260);

  const gridZone = () => all((n) => n.attributes?.['data-log-swipe-zone'] === 'grid', logPg())[0];
  const daynavZone = () => all((n) => has(n, 'daynav'), logPg())[0];
  const scrollZone = () => all((n) => has(n, 'log-scroll'), logPg())[0];
  if (!gridZone() || !daynavZone() || !scrollZone()) {
    return `missing Log zones: grid=${!!gridZone()} daynav=${!!daynavZone()} scroll=${!!scrollZone()}`;
  }
  // F4 core disambiguation: .log-scroll MUST NOT hijack horizontal swipes into day-cycling!
  if (scrollZone().attributes?.['data-log-swipe-zone']) {
    return `.log-scroll still carries data-log-swipe-zone="${scrollZone().attributes['data-log-swipe-zone']}" (blocks Log -> Now strip paging)`;
  }

  const t0 = dayTitle();
  if (!/Today, Thu, Nov 26/.test(t0)) return `expected Today, Thu, Nov 26, got "${t0}"`;

  // 0. Rightward swipe on .log-scroll does NOT cycle day (free for strip paging Log -> Now!)
  swipeNode(scrollZone(), 80, 400, 120, 4);
  await sleep(40);
  if (dayTitle() !== t0) return `F4 violated: swipe on .log-scroll hijacked into day-cycle ("${dayTitle()}") instead of leaving it to strip paging`;

  // 1. Swipe LEFT at back===0 on grid -> no-op
  swipeNode(gridZone(), 260, 200, -120, 4);
  await sleep(40);
  if (dayTitle() !== t0) return `swipe left at back===0 changed day: "${dayTitle()}"`;

  // 2. Vertical-dominant gesture on grid and daynav -> no-op
  swipeNode(gridZone(), 200, 200, 75, 160);
  await sleep(40);
  swipeNode(daynavZone(), 200, 100, 70, -150);
  await sleep(40);
  if (dayTitle() !== t0) return `vertical-dominant swipe changed day: "${dayTitle()}"`;

  // 3. Swipe RIGHT on grid -> Yesterday (back=1, Wed Nov 25)
  swipeNode(gridZone(), 80, 200, 120, 6);
  await sleep(30);
  const t1 = dayTitle();
  if (!/Wed, Nov 25/.test(t1)) return `swipe right on grid did not move to Wed, Nov 25: "${t1}"`;

  // 4. Mid day-swap animation guard (inside 220ms logSwap) -> blocked
  swipeNode(gridZone(), 80, 200, 120, 0);
  await sleep(20);
  if (dayTitle() !== t1) return `swipe fired mid 220ms logSwap: "${dayTitle()}"`;

  // 5. After 220ms, swipe RIGHT on daynav -> 2 days ago (back=2, Tue Nov 24)
  await sleep(250);
  swipeNode(daynavZone(), 80, 100, 120, -4);
  await sleep(30);
  const t2 = dayTitle();
  if (!/Tue, Nov 24/.test(t2)) return `swipe right on daynav did not move to Tue, Nov 24: "${t2}"`;

  // 6. After 220ms, swipe RIGHT beyond canBack -> no-op
  await sleep(250);
  swipeNode(gridZone(), 80, 200, 120, 0);
  await sleep(30);
  if (dayTitle() !== t2) return `swipe right beyond canBack changed day: "${dayTitle()}"`;

  // 7. Sheet-open guard (DriftSheet) -> blocked
  await clickNode(all((n) => n.attributes?.['data-log-eld-compare'] === '1', logPg())[0], 30);
  if (!A.currentSheet()) return 'expected DriftSheet open for guard test';
  swipeNode(gridZone(), 260, 200, -120, 0);
  await sleep(30);
  if (dayTitle() !== t2) return `swipe fired while DriftSheet open: "${dayTitle()}"`;
  A.openSheet(null);
  await sleep(250);

  // 8. Mid-edit guard (open an entry editor sheet) -> blocked
  const entryBtn = all((n) => n.localName === 'button' && has(n, 'entry'), logPg())[0];
  if (!entryBtn) return 'missing entry button for mid-edit guard test';
  await clickNode(entryBtn, 30);
  if (A.currentSheet()?.kind !== 'edit') return `expected edit sheet open, got ${JSON.stringify(A.currentSheet())}`;
  swipeNode(gridZone(), 260, 200, -120, 0);
  await sleep(30);
  if (dayTitle() !== t2) return `swipe fired mid-edit: "${dayTitle()}"`;
  A.openSheet(null);
  await sleep(250);

  // 9. Swipe LEFT on grid -> back to Wed Nov 25
  swipeNode(gridZone(), 260, 200, -120, 5);
  await sleep(30);
  if (!/Wed, Nov 25/.test(dayTitle())) return `swipe left on grid did not return to Wed: "${dayTitle()}"`;

  // 10. prefers-reduced-motion: consecutive swipes fire immediately without 220ms lock
  globalThis.__reducedMotion = true;
  await sleep(250);
  swipeNode(daynavZone(), 80, 100, 120, 0);
  await sleep(20);
  if (!/Tue, Nov 24/.test(dayTitle())) return `reduced-motion swipe right failed: "${dayTitle()}"`;
  swipeNode(gridZone(), 260, 200, -120, 0);
  await sleep(20);
  if (!/Wed, Nov 25/.test(dayTitle())) return `reduced-motion immediate swipe left #1 blocked: "${dayTitle()}"`;
  swipeNode(daynavZone(), 260, 100, -120, 0);
  await sleep(20);
  if (!/Today, Thu, Nov 26/.test(dayTitle())) return `reduced-motion immediate swipe left #2 blocked: "${dayTitle()}"`;
  globalThis.__reducedMotion = false;

  // 11. Previous/Next arrows still work identically
  await clickNode(all((n) => n.localName === 'button' && n.attributes?.['aria-label'] === 'Previous day', logPg())[0], 30);
  if (!/Wed, Nov 25/.test(dayTitle())) return `Previous arrow broken: "${dayTitle()}"`;
  await clickNode(all((n) => n.localName === 'button' && n.attributes?.['aria-label'] === 'Next day', logPg())[0], 30);
  if (!/Today, Thu, Nov 26/.test(dayTitle())) return `Next arrow broken: "${dayTitle()}"`;
  return true;
});

console.log(`\nlogpatch: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

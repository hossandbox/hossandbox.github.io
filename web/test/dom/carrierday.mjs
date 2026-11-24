// Carrier-day exact start time (HH:MM) — UI, persistence, clamping & formatting pins (CD1–CD9).
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
let Tms = new Date(2026, 10, 11, 14, 0, 0).getTime(); // Wed Nov 11 2026 14:00 local
Date.now = () => Tms;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'carrierday';
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
const CD = await import('../../src/carrierday.ts');
const L = await import('../../src/levers.ts');
const RC = await import('../../src/recap.ts');
const E = await import('../../../engine/src/index.ts');

const { App, setLaunchNotice, openSheet, openWeekPlanner, openRolloutPlanner, openRescuePlanner, openStackPlanner, openMotelPlanner, openLegalPlanner, openFlipPlanner } = A;
const { setState, getState, parseSaved, loadSaved, exportState, applyImportedState, deviceTz } = S;
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
const attr = (n, k) => (n.attributes && n.attributes[k]) ?? '';
const fire = (node, type, extra = {}) => {
  for (const t of [type, type[0].toUpperCase() + type.slice(1)].filter(Boolean)) {
    const ev = { type: t, target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...extra };
    for (const f of node.listeners[t] ?? []) f.call(node, ev);
  }
};

const nowMin = Math.floor(Tms / 60000);
const otherTz = deviceTz === 'America/New_York' ? 'America/Los_Angeles' : 'America/New_York';

render(h(App, {}), root);
await sleep(20);

const resetBase = async (patch = {}) => {
  openSheet(null);
  openWeekPlanner(false);
  openRolloutPlanner(false);
  openRescuePlanner(false);
  openStackPlanner(false);
  openMotelPlanner(false);
  openLegalPlanner(false);
  openFlipPlanner(false);
  setState({
    ...S.INITIAL_STATE,
    disclaimerAcked: true,
    tzChosen: true,
    historyAcknowledged: true,
    drivingView: false,
    nowOverride: nowMin,
    config: { ...S.INITIAL_STATE.config, cycle: '70/8', dayStartHour: 0, dayStartMinute: 0, timeZone: deviceTz },
    ...patch,
  });
  await sleep(30);
};

// CD1: Settings shows Carrier day starts at 00:00 button, no hour <select>, no inline <input type="time">
await pin('CD1. Settings replaces hour-only select with Carrier day starts at 00:00 button', async () => {
  await resetBase({ tab: 'settings' });
  const settingsSec = all((n) => n.localName === 'section' && has(n, 'page-settings'))[0];
  if (!settingsSec) return 'missing section.page-settings';
  const btn = all((n) => n.localName === 'button' && attr(n, 'data-carrier-day-btn') === '1', settingsSec)[0];
  if (!btn) return 'missing data-carrier-day-btn button in Settings';
  const btnText = btn.textContent.replace(/\s+/g, ' ').trim();
  const hasLabel = btnText.includes('Carrier day starts at 00:00');
  const bareTimeInputs = all((n) => n.localName === 'input' && attr(n, 'type') === 'time', settingsSec);
  const hourSelects = all((n) => n.localName === 'select' && n.textContent.includes('23:00'), settingsSec);
  if (!hasLabel || bareTimeInputs.length !== 0 || hourSelects.length !== 0) {
    return JSON.stringify({ btnText, bareTimeInputs: bareTimeInputs.length, hourSelects: hourSelects.length });
  }
  return true;
});

// CD2: Picking 18:40 via ClockPick in Settings updates config to hour 18 / minute 40 & persists
await pin('CD2. Settings opens shared ClockPick sheet, picks 18:40, saves hour 18 / minute 40', async () => {
  await resetBase({ tab: 'settings' });
  const settingsSec = all((n) => n.localName === 'section' && has(n, 'page-settings'))[0];
  const btn = all((n) => n.localName === 'button' && attr(n, 'data-carrier-day-btn') === '1', settingsSec)[0];
  fire(btn, 'click');
  await sleep(30);

  const sheet = all((n) => has(n, 'sheet'))[0];
  if (!sheet) return 'DayStartSheet did not open';
  const clockBox = all((n) => has(n, 'ed-clock'), sheet)[0];
  const timeInput = all((n) => n.localName === 'input' && has(n, 'ed-clock-input') && attr(n, 'type') === 'time', sheet)[0];
  const dayChips = all((n) => has(n, 'ed-days'), sheet);
  if (!clockBox || !timeInput) return 'DayStartSheet missing shared ClockPick (.ed-clock / .ed-clock-input)';
  if (dayChips.length !== 0) return 'timeOnly ClockPick should omit day chips';

  // Pick 18:40 via ClockPick's TimePicker input
  timeInput.value = '18:40';
  fire(timeInput, 'input');
  await sleep(20);

  const outEl = all((n) => n.localName === 'output', clockBox)[0];
  if (!outEl || outEl.textContent.trim() !== '18:40') {
    return `ClockPick output expected 18:40, got ${outEl?.textContent}`;
  }

  // Click Apply
  const applyBtn = all((n) => n.localName === 'button' && attr(n, 'data-carrier-day-apply') === '1', sheet)[0];
  if (!applyBtn || !applyBtn.textContent.includes('18:40')) return `bad Apply button: ${applyBtn?.textContent}`;
  fire(applyBtn, 'click');
  await sleep(30);

  const cfg = getState().config;
  const btnAfter = all((n) => n.localName === 'button' && attr(n, 'data-carrier-day-btn') === '1', settingsSec)[0];
  const btnTextAfter = btnAfter?.textContent.replace(/\s+/g, ' ').trim() ?? '';
  if (cfg.dayStartHour !== 18 || cfg.dayStartMinute !== 40) {
    return `config expected 18:40, got ${cfg.dayStartHour}:${cfg.dayStartMinute}`;
  }
  if (!btnTextAfter.includes('Carrier day starts at 18:40')) {
    return `Settings button expected "Carrier day starts at 18:40", got "${btnTextAfter}"`;
  }
  return true;
});

// CD3: Save/load & export/import persistence round-trip preserves dayStartMinute = 40; legacy defaults to 0
await pin('CD3. Persistence round-trip: dayStartMinute=40 survives save/load & export/import unchanged; legacy -> 0', async () => {
  await resetBase({
    tab: 'settings',
    nowOverride: null,
    config: { ...S.INITIAL_STATE.config, cycle: '70/8', dayStartHour: 18, dayStartMinute: 40, timeZone: 'America/Chicago', shortHaul: false },
  });
  const savedRaw = localStorage.getItem('hos-sandbox-v1');
  if (!savedRaw) return 'nothing persisted to localStorage';
  const parsed = parseSaved(savedRaw);
  const loaded = loadSaved();
  if (parsed.config.dayStartHour !== 18 || parsed.config.dayStartMinute !== 40) {
    return `parseSaved lost 18:40: ${JSON.stringify(parsed.config)}`;
  }
  if (loaded.config.dayStartHour !== 18 || loaded.config.dayStartMinute !== 40) {
    return `loadSaved lost 18:40: ${JSON.stringify(loaded.config)}`;
  }
  // Export / import round-trip
  const exported = JSON.parse(exportState(getState()));
  const imported = applyImportedState(S.INITIAL_STATE, exported);
  if (imported.config.dayStartHour !== 18 || imported.config.dayStartMinute !== 40) {
    return `export/import lost 18:40: ${JSON.stringify(imported.config)}`;
  }
  // Legacy save without dayStartMinute
  const legacyRaw = JSON.stringify({
    segments: [],
    config: { cycle: '70/8', dayStartHour: 6, timeZone: 'America/Chicago', shortHaul: false },
  });
  const legacy = parseSaved(legacyRaw);
  if (legacy.config.dayStartHour !== 6 || legacy.config.dayStartMinute !== 0) {
    return `legacy save expected 06:00, got ${legacy.config.dayStartHour}:${legacy.config.dayStartMinute}`;
  }
  return true;
});

// CD4: Garbage dayStartMinute values clamped to 0 before evaluation and UI rendering
await pin('CD4. Garbage dayStartMinute values (75, -1, 40.5, "x", NaN, null) clamped to 0 before evaluation & render', async () => {
  const garbage = [75, -1, 40.5, 'x', NaN, null, undefined, Infinity, -Infinity, {}, []];
  const segs = [{ status: 'D', start: nowMin - 180, end: nowMin - 60, createdAt: 1 }];
  const baselineCfg = { cycle: '70/8', dayStartHour: 18, dayStartMinute: 0, timeZone: 'America/Chicago', shortHaul: false };
  const baselineEv = E.evaluate(segs, { asOf: nowMin, config: baselineCfg });

  for (const bad of garbage) {
    if (CD.clampDayStartMinute(bad) !== 0) return `clampDayStartMinute(${JSON.stringify(bad)}) !== 0`;
    // Simulate a tampered localStorage save with garbage dayStartMinute (store.ts is frozen so sanitizeConfig passes it through)
    const tamperedRaw = JSON.stringify({
      segments: segs,
      config: { cycle: '70/8', dayStartHour: 18, dayStartMinute: bad, timeZone: 'America/Chicago', shortHaul: false },
    });
    const parsed = parseSaved(tamperedRaw);
    const clamped = CD.safeRulesConfig(parsed.config);
    if (clamped.dayStartMinute !== 0) return `safeRulesConfig failed for ${JSON.stringify(bad)}: ${clamped.dayStartMinute}`;
    const ev = E.evaluate(segs, { asOf: nowMin, config: clamped });
    if (JSON.stringify(ev.cycle) !== JSON.stringify(baselineEv.cycle)) {
      return `evaluation differed from 0 for garbage ${JSON.stringify(bad)}`;
    }
    if (CD.formatDayStartHM(parsed.config) !== '18:00') {
      return `formatDayStartHM failed for garbage ${JSON.stringify(bad)}: ${CD.formatDayStartHM(parsed.config)}`;
    }
  }

  // Render App with dirty state directly in store and confirm UI clamps cleanly without crashing
  await resetBase({
    tab: 'settings',
    config: { ...S.INITIAL_STATE.config, dayStartHour: 18, dayStartMinute: 'x', timeZone: deviceTz },
  });
  const settingsSec = all((n) => n.localName === 'section' && has(n, 'page-settings'))[0];
  const btn = all((n) => n.localName === 'button' && attr(n, 'data-carrier-day-btn') === '1', settingsSec)[0];
  if (!btn || !btn.textContent.includes('18:00')) return `dirty render did not clamp to 18:00: ${btn?.textContent}`;
  return true;
});

// CD5: Now and Plan two-zones notices show 18:40 when config is 18:40 and terminal TZ != device TZ
await pin('CD5. Now and Plan two-zones notices show exact 18:40 boundary', async () => {
  await resetBase({
    tab: 'now',
    zoneAck: null,
    config: { ...S.INITIAL_STATE.config, cycle: '70/8', dayStartHour: 18, dayStartMinute: 40, timeZone: otherTz },
  });
  const nowSec = all((n) => n.localName === 'section' && has(n, 'page-now'))[0];
  const planSec = all((n) => n.localName === 'section' && has(n, 'page-plan'))[0];
  const nowText = nowSec?.textContent ?? '';
  const planText = planSec?.textContent ?? '';
  const nowHas = nowText.includes(`rolls at 18:40 ${otherTz}`) && nowText.includes('18:40 recap is not 18:40');
  const planHas = planText.includes(`rolls at 18:40 ${otherTz}`) && planText.includes('18:40 recap is not 18:40');
  if (!nowHas || !planHas) {
    return JSON.stringify({ otherTz, nowHas, planHas, nowSnippet: nowText.slice(0, 400), planSnippet: planText.slice(0, 400) });
  }
  return true;
});

// CD6: Log day nav, Recap, WeekRecap, History, Lever L4, and formatters show 18:40 (and 00:30 != midnight)
await pin('CD6. All app-layer boundary surfaces show exact HH:MM (18:40, 00:30, midnight for 00:00)', async () => {
  const cfg1840 = { ...S.INITIAL_STATE.config, cycle: '70/8', dayStartHour: 18, dayStartMinute: 40, timeZone: 'America/Chicago', shortHaul: false };
  const cfg0030 = { ...cfg1840, dayStartHour: 0, dayStartMinute: 30 };
  const cfg0000 = { ...cfg1840, dayStartHour: 0, dayStartMinute: 0 };

  if (CD.dayStartWord(cfg0000) !== 'midnight') return '00:00 dayStartWord should be midnight';
  if (CD.dayStartWord(cfg0030) !== '00:30') return `00:30 dayStartWord should be 00:30, got ${CD.dayStartWord(cfg0030)}`;
  if (CD.dayStartWord(cfg1840) !== '18:40') return `18:40 dayStartWord should be 18:40, got ${CD.dayStartWord(cfg1840)}`;

  // 7 heavy 10h duty days so 70/8 cycle binds and L4 lever + recap drop-offs fire
  const chi = (day, hh, mm = 0) => E.localToMinute(2026, 11, day, hh, 'America/Chicago', mm);
  const segs = [];
  for (let d = 2; d <= 8; d++) {
    segs.push(
      { status: 'ON', start: chi(d, 5), end: chi(d, 6), createdAt: d * 10 + 1 },
      { status: 'D', start: chi(d, 6), end: chi(d, 14), createdAt: d * 10 + 2 },
      { status: 'ON', start: chi(d, 14), end: chi(d, 15), createdAt: d * 10 + 3 },
      { status: 'OFF', start: chi(d, 15), end: chi(d + 1, 5), createdAt: d * 10 + 4 },
    );
  }
  const tNow = chi(9, 6, 0);
  await resetBase({
    tab: 'log',
    nowOverride: tNow,
    segments: segs,
    current: { status: 'ON', since: chi(9, 5, 0), createdAt: 999 },
    config: cfg1840,
  });

  // Log day nav
  const logSec = all((n) => n.localName === 'section' && has(n, 'page-log'))[0];
  if (!logSec.textContent.includes('Carrier day from 18:40')) {
    return `Log day nav missing 18:40: ${logSec.textContent.slice(0, 200)}`;
  }

  // L4 lever
  const ev = E.evaluate(S.allSegments(getState(), tNow), { asOf: tNow, config: cfg1840 });
  const levers = L.computeLevers(getState(), tNow, ev, 'log');
  const l4 = levers.find((x) => x.id === 'L4');
  if (!l4 || !l4.dayStartLabel.includes('18:40')) {
    return `L4 lever expected 18:40 label, got ${JSON.stringify(l4)}`;
  }

  // Recap & hoursBackSentence
  const hbs = A.hoursBackSentence(ev, tNow, cfg1840);
  if (!hbs.includes('(18:40 ')) return `hoursBackSentence missing 18:40: ${hbs}`;

  // RecapTab rendered
  setState({ tab: 'recap' });
  await sleep(30);
  const toolSec = all((n) => n.localName === 'section' && has(n, 'page-tool'))[0];
  if (!toolSec.textContent.includes('Days roll at 18:40') || !toolSec.textContent.includes('(18:40 ')) {
    return `RecapTab missing 18:40: ${toolSec.textContent.slice(0, 400)}`;
  }

  // HistoryTab rendered
  setState({ tab: 'history' });
  await sleep(30);
  if (!toolSec.textContent.includes('days roll at 18:40')) {
    return `HistoryTab missing 18:40: ${toolSec.textContent.slice(0, 300)}`;
  }

  // WeekRecapTab rendered
  setState({ tab: 'plan' });
  openWeekPlanner(true);
  await sleep(30);
  if (!toolSec.textContent.includes('rolls at 18:40')) {
    return `WeekRecapTab missing 18:40: ${toolSec.textContent.slice(0, 400)}`;
  }
  openWeekPlanner(false);
  return true;
});

// CD7: recap.ts wallMinuteInCarrierDay & projectRecapVs34 respect 18:40 boundary
await pin('CD7. recap.ts wallMinuteInCarrierDay & projectRecapVs34 honor 18:40 boundary', async () => {
  const cfg1840 = { ...S.INITIAL_STATE.config, cycle: '70/8', dayStartHour: 18, dayStartMinute: 40, timeZone: 'America/Chicago', shortHaul: false };
  const tNow = E.localToMinute(2026, 11, 10, 19, 'America/Chicago', 0);
  const ds = E.carrierDayStart(tNow, cfg1840);
  const de = E.nextCarrierDayStart(ds, cfg1840);
  // Wall time 18:15 is < 18:40 so it must land on the NEXT calendar date (Nov 11 18:15), strictly inside [ds, de)
  const w1815 = RC.wallMinuteInCarrierDay(ds, de, 18 * 60 + 15, cfg1840);
  const exp1815 = E.localToMinute(2026, 11, 11, 18, 'America/Chicago', 15);
  if (w1815 !== exp1815) return `wallMinuteInCarrierDay(18:15) expected ${exp1815}, got ${w1815}`;

  // Shift starting 16:00 for 10h crosses 18:40 -> Leg 1 = 2h40m (160m), Leg 2 = 7h20m (440m)
  const plan = RC.projectRecapVs34({
    segments: [],
    now: tNow,
    config: cfg1840,
    defaultShiftMinutes: 600,
    shiftStartMinutes: 16 * 60,
    resetStart: tNow + 24 * 60,
  });
  const sh0 = plan.recaps.shifts[0];
  if (plan.dayStartHour !== 18 || plan.dayStartMinute !== 40) {
    return `plan config fields wrong: ${plan.dayStartHour}:${plan.dayStartMinute}`;
  }
  if (sh0.plannedLeg1 !== 160 || sh0.plannedLeg2 !== 440) {
    return `16:00+10h across 18:40 expected 160+440, got ${sh0.plannedLeg1}+${sh0.plannedLeg2}`;
  }
  return true;
});

// CD8: Preset keys & Reset to 00:00 (midnight) in DayStartSheet work end-to-end
await pin('CD8. DayStartSheet preset nudge keys and Reset to 00:00 button work cleanly', async () => {
  await resetBase({
    tab: 'settings',
    config: { ...S.INITIAL_STATE.config, dayStartHour: 18, dayStartMinute: 40, timeZone: deviceTz },
  });
  const settingsSec = all((n) => n.localName === 'section' && has(n, 'page-settings'))[0];
  fire(all((n) => n.localName === 'button' && attr(n, 'data-carrier-day-btn') === '1', settingsSec)[0], 'click');
  await sleep(25);
  const sheet = all((n) => has(n, 'sheet'))[0];
  const plus5 = all((n) => n.localName === 'button' && attr(n, 'aria-label') === '5 minutes later', sheet)[0];
  const minus1 = all((n) => n.localName === 'button' && attr(n, 'aria-label') === '1 minute earlier', sheet)[0];
  if (!plus5 || !minus1) return 'missing preset nudge keys in DayStartSheet';
  fire(plus5, 'click');
  await sleep(15);
  fire(minus1, 'click');
  await sleep(15);
  const out1 = all((n) => n.localName === 'output', sheet)[0]?.textContent.trim();
  if (out1 !== '18:44') return `after +5 -1 from 18:40 expected 18:44, got ${out1}`;

  const resetBtn = all((n) => n.localName === 'button' && n.textContent.includes('Reset to 00:00'), sheet)[0];
  if (!resetBtn) return 'missing Reset to 00:00 button';
  fire(resetBtn, 'click');
  await sleep(15);
  fire(all((n) => n.localName === 'button' && attr(n, 'data-carrier-day-apply') === '1', sheet)[0], 'click');
  await sleep(25);
  const cfg = getState().config;
  if (cfg.dayStartHour !== 0 || cfg.dayStartMinute !== 0) {
    return `after reset expected 0:0, got ${cfg.dayStartHour}:${cfg.dayStartMinute}`;
  }
  return true;
});

// CD9: Importing a legacy backup (no dayStartMinute key) onto a non-zero config resets minute to 0;
// importing a backup WITH dayStartMinute preserves (clamped) minute.
await pin('CD9. Import JSON: legacy config (no dayStartMinute) resets minute to 0; explicit dayStartMinute=25 kept', async () => {
  await resetBase({
    tab: 'settings',
    config: { ...S.INITIAL_STATE.config, cycle: '70/8', dayStartHour: 18, dayStartMinute: 40, timeZone: 'America/Chicago', shortHaul: false },
  });
  const settingsSec = all((n) => n.localName === 'section' && has(n, 'page-settings'))[0];
  const fileInput = all((n) => n.localName === 'input' && attr(n, 'type') === 'file', settingsSec)[0];
  if (!fileInput) return 'missing file input in Settings';

  // 1) Legacy backup: config has dayStartHour: 6 and NO dayStartMinute key -> must land at 06:00 (not 06:40)
  const legacyPayload = {
    segments: [],
    config: { cycle: '70/8', dayStartHour: 6, timeZone: 'America/Chicago' },
  };
  fileInput.files = [{ name: 'legacy-backup.json', text: async () => JSON.stringify(legacyPayload) }];
  fire(fileInput, 'change');
  await sleep(30);

  const afterLegacy = getState().config;
  const btnLegacy = all((n) => n.localName === 'button' && attr(n, 'data-carrier-day-btn') === '1', settingsSec)[0];
  const btnLegacyText = btnLegacy?.textContent.replace(/\s+/g, ' ').trim() ?? '';
  if (afterLegacy.dayStartHour !== 6 || afterLegacy.dayStartMinute !== 0) {
    return `legacy import expected 6:0, got ${afterLegacy.dayStartHour}:${afterLegacy.dayStartMinute} (button: "${btnLegacyText}")`;
  }
  if (!btnLegacyText.includes('Carrier day starts at 06:00')) {
    return `legacy import button expected "Carrier day starts at 06:00", got "${btnLegacyText}"`;
  }

  // 2) Converse: backup WITH dayStartMinute: 25 -> must keep 25
  const withMinPayload = {
    segments: [],
    config: { cycle: '70/8', dayStartHour: 6, dayStartMinute: 25, timeZone: 'America/Chicago' },
  };
  fileInput.files = [{ name: 'modern-backup.json', text: async () => JSON.stringify(withMinPayload) }];
  fire(fileInput, 'change');
  await sleep(30);

  const afterWithMin = getState().config;
  const btnWithMin = all((n) => n.localName === 'button' && attr(n, 'data-carrier-day-btn') === '1', settingsSec)[0];
  const btnWithMinText = btnWithMin?.textContent.replace(/\s+/g, ' ').trim() ?? '';
  if (afterWithMin.dayStartHour !== 6 || afterWithMin.dayStartMinute !== 25) {
    return `modern import expected 6:25, got ${afterWithMin.dayStartHour}:${afterWithMin.dayStartMinute}`;
  }
  if (!btnWithMinText.includes('Carrier day starts at 06:25')) {
    return `modern import button expected "Carrier day starts at 06:25", got "${btnWithMinText}"`;
  }

  // 3) Garbage dayStartMinute in imported config -> clamped to 0 via safeRulesConfig
  const badMinPayload = {
    segments: [],
    config: { cycle: '70/8', dayStartHour: 14, dayStartMinute: 75, timeZone: 'America/Chicago' },
  };
  fileInput.files = [{ name: 'bad-min-backup.json', text: async () => JSON.stringify(badMinPayload) }];
  fire(fileInput, 'change');
  await sleep(30);

  const afterBadMin = getState().config;
  if (afterBadMin.dayStartHour !== 14 || afterBadMin.dayStartMinute !== 0) {
    return `garbage dayStartMinute import expected 14:0, got ${afterBadMin.dayStartHour}:${afterBadMin.dayStartMinute}`;
  }

  return true;
});

const pass = res.filter((x) => x[0] === 'PASS').length;
for (const [st, name, msg] of res) console.log(`${st}  ${name}${msg ? '\n      ' + msg : ''}`);
console.log(`\n${pass}/${res.length} carrier-day pins passed`);
render(null, root);
process.exit(pass === res.length ? 0 : 1);

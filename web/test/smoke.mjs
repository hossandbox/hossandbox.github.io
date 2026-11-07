// Node-side smoke test: render every tab with a stubbed DOM, exercising store transitions.
import { render } from 'preact-render-to-string';
import { readFile } from 'node:fs/promises';
import { h } from 'preact';

// minimal browser globals
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true;
globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'smoke';

const { App } = await import('../src/app.tsx');
const { setState, getState, nowMin, clock, clockFull, toInput, DEFAULT_TRIP } = await import('../src/store.ts');

const now = nowMin();
const out = (label) => {
  const html = render(h(App, {}));
  const heads = [...html.matchAll(/<h2>(.*?)<\/h2>/g)].map((m) => m[1]);
  const stats = [...html.matchAll(/<div class="stat-value">(.*?)<\/div>/g)].map((m) => m[1]).slice(0, 4);
  console.log(`[${label}] ${html.length}b · h2: ${heads.join(' | ')} · stats: ${stats.join(' / ')}`);
  if (/undefined|NaN/.test(html.replace(/data-[a-z-]+="undefined"/g, ''))) {
    const i = html.search(/undefined|NaN/); console.log('   ⚠ suspicious text near:', html.slice(Math.max(0, i - 80), i + 40));
  }
  return html;
};

out('log/empty');
setState({ segments: [{ status: 'OFF', start: now - 600, end: now }], current: { status: 'D', since: now - 120 } });
out('log/fresh+driving 2h');
for (const tab of ['split', 'recap', 'trip', 'settings']) { setState({ tab }); out(tab); }

// A realistic mid-split day: OFF 10h, D 5h, OFF 3h, ON 0.5h, D 4.5h, now in SB 2h (pending pair)
const t0 = now - 60 * 15;
setState({
  tab: 'split', current: { status: 'SB', since: now - 120 },
  segments: [
    { status: 'OFF', start: t0 - 600, end: t0 },
    { status: 'D', start: t0, end: t0 + 300 },
    { status: 'OFF', start: t0 + 300, end: t0 + 480 },
    { status: 'ON', start: t0 + 480, end: t0 + 510 },
    { status: 'D', start: t0 + 510, end: t0 + 780 },
  ],
});
const html = out('split/pending-pair');
const pending = /First break logged/.test(html); // patch 7 renamed the internal "Period A" into the driver's words
console.log('pending leg shown:', pending);
setState({ tab: 'log' }); out('log/violations view');

// --- new features ---
// exception toggles: flag the current shift as adverse → labels become 13/16
const evNow = (await import('../../engine/src/index.ts')).evaluate;
const st = getState();
const shiftStart = evNow([...st.segments, { status: st.current.status, start: st.current.since, end: now }], { asOf: now, config: st.config }).shift.shiftStart;
setState({ config: { ...st.config, adverseShifts: [shiftStart] } });
let hh = out('log/adverse flagged');
console.log('adverse labels:', /13-hr left/.test(hh) && /16-hr left/.test(hh), '· note shown:', /Adverse driving conditions declared/.test(hh));
setState({ config: { ...getState().config, adverseShifts: [], sixteenHourShifts: [shiftStart] } });
hh = out('log/16h flagged');
console.log('16h labels:', /11-hr left/.test(hh) && /16-hr left/.test(hh));
setState({ config: { ...getState().config, sixteenHourShifts: [] } });

// personal conveyance shows in the pill
setState({ current: { status: 'OFF', since: now - 30, note: 'PC' } });
hh = out('log/PC');
console.log('PC pill:', /Personal conveyance \(OFF\)/.test(hh));

// trip tab renders both strategies
setState({ tab: 'trip', segments: [{ status: 'OFF', start: now - 700, end: now - 100 }], current: { status: 'ON', since: now - 100 } });
hh = out('trip/both strategies');
console.log('compare cards:', (hh.match(/plancard/g) || []).length === 2, '· sleeper option present:', /Sleeper splits/.test(hh));
setState({ tab: 'recap' }); hh = out('recap/day editor');
console.log('day editor buttons:', (hh.match(/class="mini"/g) || []).length >= 7);
setState({ tab: 'settings', bugEmail: 'bugs@example.com' }); hh = out('settings/bug email');
console.log('bug button labelled:', /Report a bug<\/button>/.test(hh) || /Report a bug/.test(hh));

// Regression: "Fresh start" (only an OFF segment, then Driving) + Split Lab crashed on an undefined lastWork.end (2026-09-19)
setState({ tab: 'split', segments: [{ status: 'OFF', start: now - 600, end: now }], current: { status: 'D', since: now }, tentative: [] });
hh = out('split/fresh-start regression');
if (!/Break 1 runs straight into the rest/.test(hh)) throw new Error('fresh-start explanation missing');
if (/This tab hit a bug/.test(hh)) throw new Error('Split Lab crashed on fresh-start state');
// Every tab must render for a brand-new user (no segments at all)
for (const tab of ['log', 'split', 'recap', 'trip', 'settings']) {
  setState({ tab, segments: [], current: { status: 'OFF', since: now - 60 }, tentative: [] });
  hh = out(`empty-state/${tab}`);
  if (/This tab hit a bug/.test(hh)) throw new Error(`${tab} crashed on empty state`);
}
// Regression (consumer-review-1, 2026-09-22): Split Lab evaluated the what-if plan at endB2 + 1,
// so every result card was one minute off — "stop by" showed 09:31 and the 14-hr balance 8h 29m
// for a break ending 03:30. All result cards must share the instant Break 2 ends.
{
  const { evaluate } = await import('../../engine/src/index.ts');
  const T = Math.floor(Date.UTC(2026, 8, 22, 17, 0) / 60000); // 2026-09-22 12:00 America/Chicago
  const base = [
    { status: 'OFF', start: T - 960, end: T - 360 }, // 20:00 → 06:00 CDT
    { status: 'D', start: T - 360, end: T },         // 06:00 → 12:00 CDT
  ];
  setState({ tab: 'split', nowOverride: T, tentative: [], current: null, segments: base, config: { ...getState().config, cycle: '70/8' } });
  hh = out('split/stop-by boundary');
  // Split Lab defaults: Break 1 3h off, 30m on duty, 5h drive, Break 2 7h sleeper.
  let t = T; const plan = [];
  const push = (status, m, note) => { if (m > 0) { plan.push({ status, start: t, end: t + m, tentative: true, note }); t += m; } };
  push('OFF', 180, 'Break 1'); push('ON', 30, 'On duty'); push('D', 300, 'Drive'); push('SB', 420, 'Break 2');
  const endB2 = t;
  const evm = evaluate([...base, ...plan], { asOf: endB2, config: getState().config });
  const m = hh.match(/stop by ([^<]+)</);
  if (!m) throw new Error('Split Lab rendered no stop-by value');
  if (m[1] !== clockFull(evm.mustStopBy)) throw new Error(`Split Lab stop-by ${m[1]} != ${clockFull(evm.mustStopBy)} — result cards must share one evaluation instant`);
  if (!/8h 30m/.test(hh)) throw new Error('Split Lab 14-hr balance should be 8h 30m at the end of Break 2');
  if (m[1] !== clockFull(endB2 + 360)) throw new Error(`stop-by ${m[1]} should be 6h after Break 2 ends (${clockFull(endB2 + 360)})`);
  setState({ nowOverride: null });
  console.log('split stop-by boundary: OK');
}
// Regression (consumer-review-1, 2026-09-22): an off-duty entry dropped inside a 6h driving
// entry must leave 5h of driving — not silently delete the tail and inflate the clocks to 9h/68h.
{
  const M = (iso) => Math.floor(new Date(iso).getTime() / 60000);
  setState({
    tab: 'log', nowOverride: M('2026-09-22T17:00:00Z'), current: null, tentative: [],
    config: { ...getState().config, cycle: '70/8' },
    segments: [
      { status: 'OFF', start: M('2026-09-22T01:00:00Z'), end: M('2026-09-22T11:00:00Z') }, // 20:00→06:00 CDT
      { status: 'D', start: M('2026-09-22T11:00:00Z'), end: M('2026-09-22T17:00:00Z') },   // 06:00→12:00 CDT
      { status: 'OFF', start: M('2026-09-22T13:00:00Z'), end: M('2026-09-22T14:00:00Z') }, // 08:00→09:00 CDT
    ],
  });
  // Redesign: the clocks live on Now; the overlap warning stays on the Log, where the rows are fixed.
  setState({ tab: 'now' });
  hh = out('now/overlapping entries');
  if (/9h 00m|68h 00m/.test(hh)) throw new Error('overlapping entry inflated driving/cycle time (3h of driving vanished)');
  if (!/65h 00m/.test(hh)) throw new Error('cycle left should be 65h — 5h driven of 70');
  setState({ tab: 'log' });
  hh = out('log/overlapping entries');
  if (!/These entries overlap/.test(hh)) throw new Error('overlapping entries must be flagged to the driver');
  setState({ nowOverride: null });
  console.log('overlap repro: OK');
}
// Regression (consumer-review-2, 2026-09-22): (a) a delayed departure must show the assumed wait
// rather than quietly counting it as rest, and (b) the trip scenario must survive tab navigation.
{
  const M = (iso) => Math.floor(new Date(iso).getTime() / 60000);
  const T = M('2026-09-22T17:00:00Z'); // 12:00 America/Chicago
  setState({
    tab: 'trip', nowOverride: T, current: { status: 'ON', since: T }, tentative: [],
    config: { ...getState().config, cycle: '70/8' },
    segments: [
      { status: 'OFF', start: M('2026-09-22T01:00:00Z'), end: M('2026-09-22T11:00:00Z') },
      { status: 'D', start: M('2026-09-22T11:00:00Z'), end: T },
    ],
    trip: { ...DEFAULT_TRIP, dep: toInput(T + 180), miles: 900, pre: 0 },
  });
  hh = out('trip/delayed departure (wait On Duty)');
  if (!/assumed, not logged/.test(hh)) throw new Error('the pre-departure wait must appear as an explicit assumed row');
  if (!/900 mi/.test(hh)) throw new Error('trip distance not applied');
  if (/pairs with the/.test(hh)) throw new Error('an On Duty wait must not be usable as a split leg');

  setState({ trip: { ...getState().trip, until: 'OFF' } });
  hh = out('trip/delayed departure (wait Off Duty)');
  if (!/pairs with the/.test(hh)) throw new Error('an explicitly off-duty wait should still be eligible as a split leg');

  // navigate away and back — the draft must survive
  setState({ tab: 'recap' });
  out('recap/from trip');
  setState({ tab: 'trip' });
  hh = out('trip/returned');
  if (!/900 mi/.test(hh)) throw new Error('trip distance was discarded when switching tabs');
  if (!/Stop|Reset plan|assumed, not logged/.test(hh)) throw new Error('trip plan did not re-render on return');
  setState({ nowOverride: null });
  console.log('trip departure/draft regressions: OK');
}
// Regression (consumer-review-1/2): an assumed fresh clock must be labelled as an assumption, and
// the Log tab must be able to show the resolved timeline the clocks actually use.
{
  const M = (iso) => Math.floor(new Date(iso).getTime() / 60000);
  const T = M('2026-09-22T17:00:00Z'); // 12:00 America/Chicago
  const overlap = [
    { status: 'OFF', start: M('2026-09-22T01:00:00Z'), end: M('2026-09-22T11:00:00Z') }, // 20:00→06:00
    { status: 'D', start: M('2026-09-22T11:00:00Z'), end: T },                           // 06:00→12:00
    { status: 'OFF', start: M('2026-09-22T13:00:00Z'), end: M('2026-09-22T14:00:00Z') }, // 08:00→09:00
  ];
  setState({ tab: 'log', logResolved: false, nowOverride: T, current: null, tentative: [], segments: overlap });
  hh = out('log/resolved view off');
  if (!/Show resolved timeline/.test(hh)) throw new Error('resolved-timeline control missing');
  setState({ logResolved: true });
  hh = out('log/resolved view on');
  if (!/Resolved timeline \(4\)/.test(hh)) throw new Error('resolved timeline should show the split drive as 4 rows');
  if (!/Driving <b>5h 00m<\/b>/.test(hh)) throw new Error('resolved totals should read 5h of driving');

  // nothing logged: every number on screen is an assumption and has to say so
  setState({ logResolved: false, segments: [], tentative: [], current: null });
  hh = out('log/fresh (nothing logged)');
  if (!/Assumed fresh clock/.test(hh)) throw new Error('a fresh clock must be labelled as an assumption');
  // the load verdict moved from Recap to its own Load screen (redesign 4/5); same check, on the answer
  setState({ tab: 'load', loadCheck: { ...getState().loadCheck, answered: true } });
  hh = out('load/fresh verdict');
  if (!/This verdict rests on an incomplete basis/.test(hh)) throw new Error('the LEGAL verdict must be qualified when nothing is logged');
  // and the recap itself says the same about its own numbers
  setState({ tab: 'recap' });
  hh = out('recap/fresh');
  if (!/This recap rests on an incomplete basis/.test(hh)) throw new Error('the recap must be qualified when nothing is logged');

  // no current status + a future departure: the wait must not be credited as rest
  setState({ tab: 'trip', current: null, segments: [], trip: { ...DEFAULT_TRIP, dep: toInput(T + 180) } });
  hh = out('trip/no status, delayed departure');
  if (!/haven't set a current status/.test(hh)) throw new Error('the conservative default must be stated');
  if (/Continue /.test(hh)) throw new Error('with no current status there is nothing to "Continue"');
  if (/pairs with the/.test(hh)) throw new Error('an unlogged wait must not be credited as rest');

  setState({ nowOverride: null, tab: 'log' });
  console.log('assumptions + resolved timeline: OK');
}
// Regression (consumer-review-1/2 batch 2): exact numeric entry beside sliders, driver-facing
// violation labels, and an edit that changes the math without disturbing other rows.
{
  const M = (iso) => Math.floor(new Date(iso).getTime() / 60000);
  const T = M('2026-09-22T17:00:00Z'); // 12:00 America/Chicago

  // (a) every slider offers a numeric box and steppers, not just a drag target
  setState({ tab: 'trip', nowOverride: T, current: null, tentative: [], segments: [], trip: { ...DEFAULT_TRIP } });
  hh = out('trip/sliders with numeric entry');
  if (!/class="num"/.test(hh)) throw new Error('sliders must offer direct numeric entry');
  if (!/aria-label="Decrease Distance by 25 mi"/.test(hh)) throw new Error('slider stepper buttons missing');

  // (b) violation labels are driver-facing, never enum ids
  // "now" sits after the drive ends: a logged row can only count up to now (round 2, §2.1), and this
  // check is about the wording of a violation that has already happened.
  setState({
    tab: 'log', nowOverride: M('2026-09-23T04:00:00Z'), current: null, tentative: [], segments: [
      { status: 'OFF', start: M('2026-09-22T01:00:00Z'), end: M('2026-09-22T11:00:00Z') }, // 20:00→06:00
      { status: 'ON', start: M('2026-09-22T11:00:00Z'), end: M('2026-09-22T13:00:00Z') },  // 06:00→08:00
      { status: 'D', start: M('2026-09-22T13:00:00Z'), end: M('2026-09-23T03:00:00Z') },   // 08:00→22:00
    ],
  });
  hh = out('log/violation wording');
  if (!/14-hour duty window/.test(hh)) throw new Error('a window violation should read "14-hour duty window"');
  if (/WINDOW 14|DRIVE 11|BREAK 30/.test(hh)) throw new Error('internal enum leaked into violation copy');
  if (!/aria-label="Edit /.test(hh)) throw new Error('segment rows need a named Edit action');

  // (c) the edit transform: matched by identity, so other rows keep their reference (delete and
  // undo both depend on that) and the resolved timeline follows the change
  const { applySegmentEdit } = await import('../src/store.ts');
  const { normalize } = await import('../../engine/src/index.ts');
  const off1 = { status: 'OFF', start: M('2026-09-22T01:00:00Z'), end: M('2026-09-22T11:00:00Z') };
  const drv = { status: 'D', start: M('2026-09-22T11:00:00Z'), end: T };
  const brk = { status: 'OFF', start: M('2026-09-22T13:00:00Z'), end: M('2026-09-22T14:00:00Z') };
  const driveMins = (segs) => segs.filter((x) => x.status === 'D').reduce((a, x) => a + (x.end - x.start), 0);
  if (driveMins(normalize([off1, drv, brk])) !== 300) throw new Error('precondition: 5h of driving expected');
  const edited = applySegmentEdit({ segments: [off1, drv, brk], tentative: [] }, drv, { end: M('2026-09-22T13:00:00Z') });
  if (edited.segments[2] !== brk) throw new Error('editing one segment must not disturb the others');
  if (driveMins(normalize(edited.segments)) !== 120) throw new Error('the edit should change the resolved driving total');

  setState({ nowOverride: null });
  console.log('numeric entry + wording + edit: OK');
}
// Regression (consumer-review-3): stop/distance consistency, short distances, the 34-hour restart
// comparison, the time-zone picker and inline validation.
{
  const M = (iso) => Math.floor(new Date(iso).getTime() / 60000);
  const T = M('2026-09-23T17:00:00Z'); // Sep 23 12:00 America/Chicago
  const base = [
    { status: 'OFF', start: M('2026-09-23T01:00:00Z'), end: M('2026-09-23T11:00:00Z') },
    { status: 'D', start: M('2026-09-23T11:00:00Z'), end: T },
  ];

  // (a) the reviewer's repro: 3000-mile route with a stop at 2500, then shrink to 550
  setState({
    tab: 'trip', nowOverride: T, current: { status: 'ON', since: T }, tentative: [], segments: base,
    config: { ...getState().config, cycle: '70/8' }, logResolved: false,
    trip: { ...DEFAULT_TRIP, dep: toInput(T + 180), miles: 550, pre: 0, stopMile: 2500, stopMin: 120, until: 'CURRENT' },
  });
  hh = out('trip/stop past destination');
  if (!/Your stop is past the destination/.test(hh)) throw new Error('a stop beyond the route must be explained, not dropped');
  if (!/past the 550-mile destination/.test(hh)) throw new Error('the itinerary should carry the planner warning too');
  if (!/Move stop to mile 550/.test(hh)) throw new Error('the fix should be one tap away');
  if (!/2500 mi<\/b>/.test(hh)) throw new Error('the stop control must display the value it is explaining (2500 mi), not silently clamp it');

  // (b) a 20-mile local move is a real trip — it must not silently become 50
  setState({ trip: { ...getState().trip, miles: 20, stopMile: 0, stopMin: 0 } });
  hh = out('trip/short local run');
  if (!/20 mi/.test(hh)) throw new Error('a 20-mile run must be represented as 20 miles');
  if (!/min="1"/.test(hh)) throw new Error('the distance control must accept short runs, not floor them at 50');

  // (c) the third comparison card, and the 34-hour restart offered for a cycle-bound long haul
  setState({
    tab: 'trip', current: { status: 'OFF', since: T }, segments: base, config: { ...getState().config, cycle: '60/7' },
    trip: { ...DEFAULT_TRIP, dep: toInput(T + 180), miles: 3000, pre: 0, until: 'OFF' },
  });
  hh = out('trip/long haul, three strategies');
  if (!/34-hour restart/.test(hh)) throw new Error('the restart comparison must be offered');
  if (!/10-hour resets/.test(hh) || !/Sleeper splits/.test(hh)) throw new Error('the other two strategies must remain');
  if (!/three ways to rest/.test(hh)) throw new Error('the itinerary heading should no longer say two ways');
  if (!/34-hour restart — resets the 60\/70 cycle/.test(hh)) throw new Error('the restart plan must actually take a 34-hour restart');

  // (d) the time-zone picker exists, and an invalid zone is refused rather than crashing every tab
  setState({ tab: 'settings', nowOverride: T, config: { ...getState().config, timeZone: 'America/Chicago' } });
  hh = out('settings/time zone');
  if (!/list="tz-list"/.test(hh) || !/<datalist id="tz-list">/.test(hh)) throw new Error('time zones need a picker, not a bare text field');
  if (/isn't a time-zone name/.test(hh)) throw new Error('an untouched valid zone must not warn');
  const { isValidTimeZone } = await import('../src/store.ts');
  if (!isValidTimeZone('America/Chicago') || isValidTimeZone('Mars/Olympus')) throw new Error('zone validation must accept real zones and refuse fake ones');

  // (e) validation is inline, so it can be seen — and alert() is stubbed to throw in this harness
  setState({
    tab: 'log', current: null, tentative: [], logResolved: false,
    segments: [{ status: 'OFF', start: M('2026-09-23T01:00:00Z'), end: M('2026-09-23T11:00:00Z') }],
  });
  hh = out('log/segment list');
  if (!/aria-label="Edit /.test(hh)) throw new Error('segment rows need a named Edit action');
  setState({ tab: 'trip', trip: { ...DEFAULT_TRIP, dep: toInput(T - 180) } });
  hh = out('trip/past departure');
  if (!/in the past/.test(hh)) throw new Error('a past departure must be labelled, not silently accepted');

  setState({ nowOverride: null, tab: 'log' });
  console.log('review-3 findings: OK');
}
// Regression (consumer-review-4): the range control's exposed value must equal the real value, the
// restart explanation must not dismiss the daily reset, and a terminal zone that differs from the
// device zone must be labelled.
{
  const M = (iso) => Math.floor(new Date(iso).getTime() / 60000);
  const T = M('2026-09-23T17:00:00Z');
  const base = [
    { status: 'OFF', start: M('2026-09-23T01:00:00Z'), end: M('2026-09-23T11:00:00Z') },
    { status: 'D', start: M('2026-09-23T11:00:00Z'), end: T },
  ];
  const { deviceTz } = await import('../src/store.ts');

  // (a) a coarse step makes the browser snap the control to min + k*step: 20 reads as 26, and with
  // min=1/step=25 even the 3000 max was unreachable at 2976. step=1 makes every integer reachable.
  setState({
    tab: 'trip', nowOverride: T, current: { status: 'ON', since: T }, tentative: [], segments: base,
    config: { ...getState().config, cycle: '70/8', timeZone: deviceTz },
    trip: { ...DEFAULT_TRIP, dep: toInput(T + 60), miles: 20, pre: 0, stopMile: 0, stopMin: 0 },
  });
  hh = out('trip/distance control steps');
  if (!/min="1"/.test(hh) || !/max="3000"/.test(hh)) throw new Error('distance range should span 1–3000');
  if (/step="25"/.test(hh)) throw new Error('a coarse range step desynchronises the control from the typed value');
  if (!/step="1"/.test(hh)) throw new Error('range and number inputs must step by 1 so every value is reachable');

  // (b) the restart does satisfy the daily reset — the old copy claimed otherwise
  setState({
    tab: 'trip', current: { status: 'OFF', since: T }, config: { ...getState().config, cycle: '60/7', timeZone: deviceTz },
    trip: { ...DEFAULT_TRIP, dep: toInput(T + 180), miles: 3000, pre: 0, until: 'OFF', view: 'restart34' },
  });
  hh = out('trip/restart explanation');
  if (!/also satisfies the daily reset/.test(hh)) throw new Error('the restart also satisfies the 10-hour daily reset and the note must say so');
  if (/does nothing for the 11\/14/.test(hh)) throw new Error('the old misleading restart wording is still present');

  // (c) a terminal zone that differs from the device zone must be labelled, and must not cry wolf
  setState({ tab: 'log', config: { ...getState().config, timeZone: 'America/Los_Angeles' } });
  hh = out('log/terminal zone differs');
  if (!/Two time zones in play/.test(hh)) throw new Error('a terminal zone that differs from the device zone must be explained');
  if (!/America\/Los_Angeles/.test(hh) || !new RegExp(deviceTz.replace(/[/.]/g, '\\$&')).test(hh)) throw new Error('both zones should be named');
  setState({ config: { ...getState().config, timeZone: deviceTz } });
  hh = out('log/same zone');
  if (/Two time zones in play/.test(hh)) throw new Error('no zone note is needed when the zones agree');

  setState({ nowOverride: null, tab: 'log' });
  console.log('review-4 findings: OK');
}
// Regression (consumer-review-5): the coarse increment must be discoverable, the time-zone example
// must be concrete, and it must be computed rather than assumed.
{
  const M = (iso) => Math.floor(new Date(iso).getTime() / 60000);
  const T = M('2026-09-23T17:00:00Z');
  const { deviceTz, terminalMidnightOnDevice } = await import('../src/store.ts');

  // (a) the −/+ buttons say what they will do
  setState({
    tab: 'trip', nowOverride: T, current: { status: 'ON', since: T }, tentative: [],
    segments: [{ status: 'OFF', start: M('2026-09-23T01:00:00Z'), end: M('2026-09-23T11:00:00Z') }],
    config: { ...getState().config, timeZone: deviceTz },
    trip: { ...DEFAULT_TRIP, dep: toInput(T + 60), miles: 550, pre: 0, stopMile: 0, stopMin: 0 },
  });
  hh = out('trip/stepper increments');
  if (!/aria-label="Increase Distance by 25 mi"/.test(hh)) throw new Error('the +/− buttons must name their increment for assistive tech');
  if (!/aria-label="Decrease Distance by 25 mi"/.test(hh)) throw new Error('the −/+ buttons must name their increment for assistive tech');
  if (!/>\+25<\/button>/.test(hh)) throw new Error('the increment should be visible on the button, not just in its accessible name');
  if (!/>−25<\/button>/.test(hh)) throw new Error('the minus button should show its increment too');

  // (b) the day-roll example is concrete, and matches the reviewer's own case
  const laOnChicago = terminalMidnightOnDevice('America/Los_Angeles', 'America/Chicago', T);
  if (laOnChicago !== '02:00') throw new Error(`00:00 America/Los_Angeles should read 02:00 on a Chicago clock, got ${laOnChicago}`);
  // Phoenix does not observe DST, so the gap really does move — proof this is computed, not hardcoded
  const phxSep = terminalMidnightOnDevice('America/Phoenix', 'America/Chicago', M('2026-09-23T17:00:00Z'));
  const phxJan = terminalMidnightOnDevice('America/Phoenix', 'America/Chicago', M('2027-01-15T17:00:00Z'));
  if (phxSep !== '02:00' || phxJan !== '01:00') throw new Error(`Phoenix/Chicago should be 02:00 in summer and 01:00 in winter, got ${phxSep}/${phxJan}`);

  setState({ tab: 'recap', config: { ...getState().config, timeZone: 'America/Los_Angeles' } });
  hh = out('recap/terminal zone example');
  if (!/On your device clock/.test(hh)) throw new Error('the recap should give the device-clock reading of the terminal day roll');
  // compute the expectation against THIS harness's device zone, not a hardcoded one
  const expectedExample = terminalMidnightOnDevice('America/Los_Angeles', deviceTz, T);
  if (!new RegExp(`that is <b>${expectedExample}</b>`).test(hh)) throw new Error(`the recap should show the concrete example (${expectedExample})`);

  // (c) the export control is present; the note itself is asserted in a real browser (a click cannot
  // be simulated in a string render — see the review-5 browser check)
  setState({ tab: 'settings' });
  hh = out('settings/data');
  if (!/Export JSON/.test(hh) || !/Import JSON/.test(hh)) throw new Error('export/import controls missing');

  setState({ nowOverride: null, tab: 'log' });
  console.log('review-5 findings: OK');
}
// Regression (consumer-review-5): a full export -> import round trip must restore the log, the
// settings AND the trip scenario — the old inline import silently dropped the trip.
{
  const M = (iso) => Math.floor(new Date(iso).getTime() / 60000);
  const { exportState, applyImportedState, DEFAULT_TRIP, deviceTz: tz } = await import('../src/store.ts');

  const original = {
    ...getState(),
    // a NON-null simulated clock, so "was it ignored?" is actually testable — with null, `??` falls
    // through and the assertion would pass whether or not the field was restored
    nowOverride: M('2026-01-01T00:00:00Z'),
    segments: [
      { status: 'OFF', start: M('2026-09-23T01:00:00Z'), end: M('2026-09-23T11:00:00Z') },
      { status: 'D', start: M('2026-09-23T11:00:00Z'), end: M('2026-09-23T17:00:00Z') },
    ],
    tentative: [{ status: 'SB', start: M('2026-09-23T17:00:00Z'), end: M('2026-09-23T22:00:00Z'), tentative: true }],
    config: { ...getState().config, cycle: '60/7', timeZone: 'America/Los_Angeles' },
    mph: 40,
    trip: { ...DEFAULT_TRIP, miles: 1234, pre: 45, stopMile: 600, stopMin: 90, until: 'OFF', view: 'restart34' },
    split: { ...getState().split, drive: 222 },
    loadCheck: { ...getState().loadCheck, miles: 777, leaveIn: 60, waitOff: true, answered: true },
    bugEmail: 'roundtrip@example.com',
  };
  setState(original);
  const payload = JSON.parse(exportState(getState()));

  // import into a DIFFERENT state, as a restore would
  setState({ segments: [], tentative: [], config: { ...getState().config, cycle: '70/8', timeZone: tz }, mph: 55, trip: { ...DEFAULT_TRIP }, bugEmail: '',
    split: { ...getState().split, drive: 1 }, loadCheck: { ...getState().loadCheck, miles: 1, leaveIn: 0, waitOff: false, answered: false } });
  setState((cur) => applyImportedState(cur, payload));
  const restored = getState();

  const checks = [
    ['segments', restored.segments.length === 2 && restored.segments[0].start === original.segments[0].start],
    ['tentative', restored.tentative.length === 1],
    ['cycle', restored.config.cycle === '60/7'],
    ['time zone', restored.config.timeZone === 'America/Los_Angeles'],
    ['speed', restored.mph === 40],
    ['trip distance', restored.trip.miles === 1234],
    ['trip stop', restored.trip.stopMile === 600 && restored.trip.stopMin === 90],
    ['trip view', restored.trip.view === 'restart34'],
    ['report email', restored.bugEmail === 'roundtrip@example.com'],
    // re-check M8: the Split Lab plan and the load question are part of a backup too
    ['split plan', restored.split.drive === 222],
    ['load question', restored.loadCheck.miles === 777 && restored.loadCheck.leaveIn === 60 && restored.loadCheck.waitOff === true && restored.loadCheck.answered === true],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([n]) => n);
  if (failed.length) throw new Error(`export/import round trip lost: ${failed.join(', ')}`);

  // a simulated clock must NOT come back on its own — the payload carries one, so this is a real test
  const MY_CLOCK = M('2026-09-23T17:00:00Z');
  setState({ nowOverride: MY_CLOCK });
  setState((cur) => applyImportedState(cur, payload));
  if (getState().nowOverride !== MY_CLOCK) throw new Error('import must not silently restore a simulated clock');
  if (payload.nowOverride !== original.nowOverride) throw new Error('the payload should have carried a simulated clock for this check to mean anything');

  // a backup from before M8 has no split or load question: what is on screen stays
  const { split: _s, loadCheck: _l, ...oldPayload } = payload;
  setState({ split: { ...getState().split, drive: 111 }, loadCheck: { ...getState().loadCheck, miles: 333 } });
  setState((cur) => applyImportedState(cur, oldPayload));
  if (getState().split.drive !== 111 || getState().loadCheck.miles !== 333) throw new Error('an older backup without plans must not reset the plans on screen');

  setState({ nowOverride: null, segments: [], tentative: [], trip: { ...DEFAULT_TRIP }, config: { ...getState().config, timeZone: tz, cycle: '70/8' }, mph: 55, bugEmail: '' });
  console.log('export/import round trip: OK');
}
// Regression (day/night theme + contrast): day must stay the default, the palette must not drift
// out of WCAG AA, and status chips must follow the theme rather than carrying hardcoded hexes.
{
  const M = (iso) => Math.floor(new Date(iso).getTime() / 60000);
  const T = M('2026-09-23T17:00:00Z');
  const { applyTheme, STATUS_COLOR, deviceTz, INITIAL_STATE, chooseTheme } = await import('../src/store.ts');

  // Day is the product default (Lorico, 2026-09-25 — he drives in daylight; night is the opt-in).
  // Assert the FRESH-INSTALL default, not the current value: asserting a value the test just set
  // would pass no matter what the default actually was.
  if (INITIAL_STATE.theme !== 'day') throw new Error(`a fresh install must start in day, got ${INITIAL_STATE.theme}`);

  // Patch 7: the header switch flips the EFFECTIVE theme, and a theme only counts as picked when
  // it comes through chooseTheme — a bare stored value now follows the phone. So this section picks
  // its themes the way a driver does, instead of writing the field directly.
  chooseTheme('day');
  setState({ tab: 'log', nowOverride: T, current: { status: 'ON', since: T },
    segments: [{ status: 'OFF', start: M('2026-09-23T01:00:00Z'), end: M('2026-09-23T11:00:00Z') }],
    config: { ...getState().config, timeZone: deviceTz } });

  hh = out('log/day, theme control');
  if (!/aria-label="Switch to night theme"/.test(hh)) throw new Error('the header needs a one-tap theme switch');
  if (!/style="background:var\(--/.test(hh)) throw new Error('status chips must use theme variables, not hardcoded hexes');
  for (const k of ['OFF', 'SB', 'D', 'ON']) {
    if (!STATUS_COLOR[k].startsWith('var(--')) throw new Error(`${k} chip colour is not theme-aware: ${STATUS_COLOR[k]}`);
  }

  chooseTheme('night');
  hh = out('log/night, theme control');
  if (!/aria-label="Switch to day theme"/.test(hh)) throw new Error('the header switch must offer the way back');

  setState({ tab: 'settings', theme: 'night' });
  hh = out('settings/screen theme');
  // The toggle now reads plain "Day" / "Night" — the driver asked for the words, not a label suffix.
  // The "(default)" claim had to go somewhere or nowhere, so assert BOTH: the words, and that day is
  // still declared the default in the explainer beneath. Removing the suffix must not silently drop
  // the claim that day is the product default.
  if (!/>Day</.test(hh) || !/>Night</.test(hh)) throw new Error('the settings control must name both themes in words');
  if (!/Day is the default/.test(hh)) throw new Error('the settings control must still declare day as the default');
  if (!/contrast-checked against WCAG AA/.test(hh)) throw new Error('the setting should say the palettes are contrast-checked');

  // applyTheme must not explode when there is no DOM (the node harness has none)
  applyTheme('day');
  applyTheme('night');

  // With a DOM it must also move the browser chrome, or the address bar keeps the wrong colour after
  // a toggle. Minimal stub: only what applyTheme touches.
  {
    const attrs = { theme: null, meta: null };
    globalThis.document = {
      documentElement: {
        setAttribute: (k, v) => { if (k === 'data-theme') attrs.theme = v; },
        removeAttribute: (k) => { if (k === 'data-theme') attrs.theme = null; },
      },
      querySelector: (sel) => (sel === 'meta[name="theme-color"]' ? { setAttribute: (k, v) => { if (k === 'content') attrs.meta = v; } } : null),
    };
    // the chrome colour must be each palette's own page colour, read from the stylesheet (cab look, 2026-10-12)
    const { readFileSync: rf } = await import('node:fs');
    const css = rf('public/styles.css', 'utf8');
    const bgOf = (sel) => (css.slice(css.indexOf(sel)).match(/--bg:\s*(#[0-9a-f]{6})/i) || [])[1];
    const nightBg = bgOf(':root {'), dayBg = bgOf(':root[data-theme="day"] {');
    try {
      applyTheme('night');
      if (attrs.theme !== null) throw new Error(`night must clear data-theme, got ${attrs.theme}`);
      if (attrs.meta !== nightBg) throw new Error(`night must set the dark chrome colour ${nightBg}, got ${attrs.meta}`);
      applyTheme('day');
      if (attrs.theme !== 'day') throw new Error(`day must set data-theme=day, got ${attrs.theme}`);
      if (attrs.meta !== dayBg) throw new Error(`day must set the light chrome colour ${dayBg}, got ${attrs.meta}`);
      const html = rf('public/index.html', 'utf8'), mf = rf('public/manifest.webmanifest', 'utf8');
      if (!html.includes(`content="${dayBg}"`) || !mf.includes(`"theme_color": "${dayBg}"`)) throw new Error('index.html and the manifest must start on the day page colour');
    } finally {
      delete globalThis.document;
    }
  }

  setState({ nowOverride: null, tab: 'log' });
  console.log('theme + contrast wiring: OK');
}
// Regression (consumer-review-6): scenario persistence on every planning screen, a history
// disclosure that survives tapping a status, arrival split from unloading, hypothetical violations
// kept apart from recorded ones, and selected states exposed to assistive tech.
{
  const M = (iso) => Math.floor(new Date(iso).getTime() / 60000);
  const T = M('2026-09-23T17:00:00Z');
  const { DEFAULT_SPLIT, DEFAULT_LOADCHECK } = await import('../src/store.ts');
  const reset = { nowOverride: T, current: null, segments: [], tentative: [], historyAcknowledged: false };

  // (1) Split Lab — the reviewer's repro: set "Then drive" to 210, visit Log, come back
  setState({ ...reset, tab: 'split', split: { ...DEFAULT_SPLIT, drive: 210 } });
  hh = out('split/210 min drive');
  if (!/3h 30m/.test(hh)) throw new Error('Split Lab should show the 210-minute drive as 3h 30m');
  setState({ tab: 'log' }); out('log/from split');
  setState({ tab: 'split' });
  hh = out('split/returned from Log');
  if (!/3h 30m/.test(hh)) throw new Error('Split Lab discarded the plan when the tab changed');

  // (2) load checker — 200 miles, no dwell (moved from Recap to the Load screen, redesign 4/5)
  setState({ ...reset, tab: 'load', loadCheck: { ...DEFAULT_LOADCHECK, miles: 200, dwell: 0, answered: true } });
  hh = out('load/200 mi, no dwell');
  if (!/200 mi/.test(hh)) throw new Error('the Load answer should show the 200-mile load');
  setState({ tab: 'trip' }); out('trip/from load');
  setState({ tab: 'load' });
  hh = out('load/returned');
  // pin the slider HEAD specifically: "200 mi" also appears in the itinerary, so a loose match
  // would pass even if the field had been reset
  if (!/Load distance[\s\S]{0,60}?<b>200 mi<\/b>/.test(hh)) throw new Error('the Load screen discarded the load when the tab changed');

  // (3) the disclosure must outlive a status tap, and survive navigation
  setState({ ...reset, tab: 'log' });
  hh = out('log/nothing logged');
  if (!/Assumed fresh clock/.test(hh)) throw new Error('an empty app must say it is assuming a fresh clock');
  // declutter patch (2026-11-05): a fresh clock is stamped as the demo it is, the one-line
  // planning-only disclaimer rides every screen's header, and Recap no longer takes a tab-bar
  // slot (it lives under More). Each of these fails on the pre-patch app.tsx.
  if (!/DEMO — not your day/.test(hh)) throw new Error('a fresh clock must be stamped DEMO — not your day');
  if (!/class="app is-demo"/.test(hh)) throw new Error('a fresh clock must carry the demo stamp class on the shell');
  if (!/Planning only — not a log, not an ELD/.test(hh)) throw new Error('every screen must carry the one-line planning-only disclaimer');
  if (/Recap<\/button>/.test(hh)) throw new Error('Recap must not take a tab-bar slot');
  // patch #1.1 (2026-11-05): the dial stacks its stop-by as date over time so the full date from
  // #1 fits the ring at phone widths (pinned on the Now render in the hero section below), and
  // the Why sheet's per-rule end times use the full date (pinned in the Why-panel section).
  setState({ current: { status: 'D', since: T } });
  hh = out('log/after tapping Driving');
  if (!/History incomplete/.test(hh)) throw new Error('tapping a status is a statement about now, not about the days behind it');
  if (/Assumed fresh clock/.test(hh)) throw new Error('the fresh-clock wording should give way to the incomplete-history one');
  setState({ tab: 'trip' });
  hh = out('trip/with a status but no history');
  if (!/History incomplete/.test(hh)) throw new Error('the incomplete basis must follow the driver to other tabs');
  setState({ historyAcknowledged: true });
  hh = out('trip/after acknowledging');
  if (/History incomplete|Assumed fresh clock/.test(hh)) throw new Error('an explicit acknowledgement should stop the disclosure');

  // (4) arrival is not unloading
  setState({ ...reset, current: { status: 'ON', since: T }, segments: [
      { status: 'OFF', start: M('2026-09-23T03:30:00Z'), end: M('2026-09-23T13:30:00Z') },
      { status: 'D', start: M('2026-09-23T13:30:00Z'), end: T },
    ], historyAcknowledged: true, tab: 'load', loadCheck: { ...DEFAULT_LOADCHECK, miles: 200, dwell: 120, answered: true } });
  hh = out('load/arrive vs unload');
  if (!/Arrive — wheels stop/.test(hh)) throw new Error('the card must distinguish wheels-stop from unloading');
  if (!/Unloaded by/.test(hh)) throw new Error('unloading completion needs its own label');
  if (!/Cycle left after unloading/.test(hh)) throw new Error('the cycle figure must say which event it belongs to');

  // (5) a what-if must not be reported as a violation already committed
  setState({ ...reset, tab: 'log', historyAcknowledged: true, segments: [
      { status: 'OFF', start: M('2026-09-23T03:30:00Z'), end: M('2026-09-23T13:30:00Z') },
      { status: 'D', start: M('2026-09-23T13:30:00Z'), end: T },
    ], tentative: [{ status: 'D', start: T, end: T + 720, tentative: true, note: 'what-if' }] });
  hh = out('log/what-if violations');
  if (!/Violations in your log/.test(hh)) throw new Error('recorded violations need their own heading');
  if (!/This plan would violate/.test(hh)) throw new Error('hypothetical violations must be shown separately');
  if (!/not from duty you have logged/.test(hh)) throw new Error('the plan section must say nothing has happened yet');

  // (6) selected state must exist for assistive tech
  setState({ ...reset, tab: 'split' });
  hh = out('split/toggle selected state');
  if (!/aria-pressed="true"/.test(hh)) throw new Error('rest-type controls must expose their selected state');
  if (!/aria-pressed="false"/.test(hh)) throw new Error('the unselected half of a toggle must say so too');

  setState({ nowOverride: null, tab: 'log', historyAcknowledged: false });
  console.log('review-6 findings: OK');
}
// Regression (Opus 5.5 stress-test): the recap day-editor must clip, not delete; gaps, future-dated
// rows and cycle completeness must be visible; severity must not read as "acceptable".
{
  const M = (iso) => Math.floor(new Date(iso).getTime() / 60000);
  const { applyDayPatch } = await import('../src/store.ts');

  // 2.4 — setting a day must not erase the neighbouring day's hours
  const dayStart = M('2026-09-14T00:00:00Z');
  const dayEnd = M('2026-09-15T00:00:00Z');
  const straddle = { status: 'D', start: M('2026-09-14T20:00:00Z'), end: M('2026-09-15T03:00:00Z') };
  const out1 = applyDayPatch([straddle], dayStart, dayEnd, 4, 0, 20, 111);
  const nextDayDrive = out1.filter((x) => x.start >= dayEnd).reduce((a, x) => a + (x.end - x.start), 0);
  if (nextDayDrive !== 180) throw new Error(`the next day kept ${nextDayDrive}m of driving, expected 180m — a straddling row was deleted instead of clipped`);
  const inDay = out1.filter((x) => x.start >= dayStart && x.end <= dayEnd && x.status !== 'OFF').reduce((a, x) => a + (x.end - x.start), 0);
  // L1 — the rest of a "set" day is written as off duty, so the day leaves no unlogged hole
  const covered = out1.filter((x) => x.start >= dayStart && x.end <= dayEnd).reduce((a, x) => a + (x.end - x.start), 0);
  if (covered !== dayEnd - dayStart) throw new Error(`a recap "set" day covers ${covered}m of ${dayEnd - dayStart}m — the rest must be off duty, not unlogged`);
  if (inDay !== 240) throw new Error(`the edited day holds ${inDay}m, expected the requested 240m`);

  // 2.4b — generated rows stay inside the day they were entered for
  const out2 = applyDayPatch([], dayStart, dayEnd, 13, 2, 23, 222);
  if (out2.some((x) => x.end > dayEnd)) throw new Error('a recap entry spilled past the day it was entered for');

  // 2.5 — a hole big enough to change an answer is disclosed; a small one is not
  const D5 = { status: 'D', start: M('2026-09-15T06:00:00Z'), end: M('2026-09-15T11:00:00Z') };
  const now2130 = M('2026-09-15T21:30:00Z');
  // a 2h hole could be a split leg, so it is disclosed
  setState({ nowOverride: now2130, tab: 'recap', segments: [D5, { status: 'OFF', start: M('2026-09-15T13:00:00Z'), end: now2130 }], tentative: [], current: null, historyAcknowledged: true });
  hh = out('recap/2h hole');
  if (!/Unlogged time is being counted as off duty/.test(hh)) throw new Error('a 2h hole must be disclosed on screen');
  // the load verdict lives on its own screen since redesign 4/5
  setState({ tab: 'load', loadCheck: { ...getState().loadCheck, answered: true } });
  hh = out('load/2h hole');
  if (!/Verdict \(provisional\)/.test(hh)) throw new Error('a verdict resting on an unlogged hole must be marked provisional');
  // a 30-minute hole cannot, and nagging about it teaches the driver to ignore the warning that matters
  setState({ tab: 'recap', segments: [D5, { status: 'OFF', start: M('2026-09-15T11:30:00Z'), end: now2130 }] });
  hh = out('recap/30min hole');
  if (/Unlogged time is being counted/.test(hh)) throw new Error('a 30-minute hole must not raise the gap warning');
  setState({ tab: 'load' });
  hh = out('load/30min hole');
  if (/Verdict \(provisional\)/.test(hh)) throw new Error('a 30-minute hole must not make the verdict provisional');
  if (!/>Verdict</.test(hh)) throw new Error('the plain verdict label should be shown instead');
  // and it clears once the record covers the hole
  setState({ tab: 'recap', segments: [D5, { status: 'OFF', start: M('2026-09-15T11:00:00Z'), end: now2130 }] });
  hh = out('recap/hole filled');
  if (/Unlogged time is being counted/.test(hh)) throw new Error('the gap warning should clear once the hole is filled');

  // 2.1 — a future-dated entry is excluded and said so
  setState({ nowOverride: M('2026-09-15T10:00:00Z'), tab: 'log', historyAcknowledged: true, current: null, segments: [
      { status: 'OFF', start: M('2026-09-14T20:00:00Z'), end: M('2026-09-15T06:00:00Z') },
      { status: 'ON', start: M('2026-09-15T06:00:00Z'), end: M('2026-09-15T10:00:00Z') },
      { status: 'SB', start: M('2026-09-15T20:00:00Z'), end: M('2026-09-16T06:00:00Z') },
    ] });
  hh = out('log/with a future-dated row');
  if (!/dated in the future and is being ignored/.test(hh)) throw new Error('a future-dated entry must be reported, not silently dropped');

  // 2.8 — severity must not read as "acceptable", and the evaluation must survive a bad timestamp
  // "now" after the drive ends: only time up to now counts (round 2, §2.1)
  setState({ nowOverride: M('2026-09-15T21:30:00Z'), tab: 'log', segments: [
      { status: 'OFF', start: M('2026-09-15T00:00:00Z'), end: M('2026-09-15T10:00:00Z') },
      { status: 'D', start: M('2026-09-15T10:00:00Z'), end: M('2026-09-15T21:30:00Z') },
    ], current: null });
  hh = out('log/with violations');
  if (!/class="sev"/.test(hh)) throw new Error('a violation should carry its size in the driver\'s words');
  if (!/>well over</.test(hh) && !/>over</.test(hh)) throw new Error('severity wording missing');
  setState({ segments: [...[], { status: 'D', start: '2026-09-15T06:00', end: '2026-09-15T08:00' }] });
  hh = out('log/with an unreadable row');
  if (/This tab hit a bug/.test(hh)) throw new Error('an unreadable row crashed the tab');
  if (!/could not be read and is being ignored/.test(hh)) throw new Error('an unreadable row must be reported, not silently dropped');

  // 2.6 — the cycle needs its whole window. A record spanning three days is past the old 24-hour
  // test but nowhere near the 8-day window, so it must still say the cycle is an assumption.
  const threeDays = [
    { status: 'ON', start: M('2026-09-13T22:00:00Z'), end: M('2026-09-14T02:00:00Z') },
    { status: 'ON', start: M('2026-09-15T22:00:00Z'), end: M('2026-09-16T02:00:00Z') },
  ];
  setState({ nowOverride: M('2026-09-16T12:00:00Z'), tab: 'recap', segments: threeDays, current: null, historyAcknowledged: false });
  hh = out('recap/three days of record');
  if (!/incomplete basis/.test(hh)) throw new Error('a 3-day record must not claim to know an 8-day cycle');
  if (!/not logged — counted as 0h/.test(hh)) throw new Error('days before the record starts must be marked as counted-zero');
  setState({ historyAcknowledged: true });
  hh = out('recap/after acknowledging');
  if (/incomplete basis/.test(hh)) throw new Error('an explicit confirmation should clear the cycle warning');

  setState({ nowOverride: null, tab: 'log', historyAcknowledged: false, segments: [] });
  console.log('stress-test findings: OK');
}

// Regression (stress-test round 2, retest of build 2026-09-24 21:25).
{
  const M = (iso) => Math.floor(new Date(iso).getTime() / 60000);
  const { evaluate } = await import('../../engine/src/index.ts');
  const { allSegments, dayPatchOverflow, INITIAL_STATE } = await import('../src/store.ts');
  const cfg = { cycle: '70/8', dayStartHour: 0, timeZone: 'UTC', shortHaul: false };
  const ms = (m) => m * 60000;

  // §2.1 U1a/U1b — "off 08:00 → 22:00" typed at 08:01, then Driving tapped at 10:00. The live driving must count.
  const rows = [
    { status: 'OFF', start: M('2026-09-14T20:00:00Z'), end: M('2026-09-15T06:00:00Z'), createdAt: ms(M('2026-09-15T06:00:00Z')) },
    { status: 'ON', start: M('2026-09-15T06:00:00Z'), end: M('2026-09-15T08:00:00Z'), createdAt: ms(M('2026-09-15T08:00:00Z')) },
    { status: 'OFF', start: M('2026-09-15T08:00:00Z'), end: M('2026-09-15T22:00:00Z'), createdAt: ms(M('2026-09-15T08:01:00Z')) },
    { status: 'OFF', start: M('2026-09-15T08:00:00Z'), end: M('2026-09-15T10:00:00Z'), createdAt: ms(M('2026-09-15T10:00:00Z')) },
  ];
  const live = { status: 'D', since: M('2026-09-15T10:00:00Z'), createdAt: ms(M('2026-09-15T10:00:00Z')) };
  for (const [iso, left] of [['2026-09-15T13:00:00Z', 480], ['2026-09-15T21:00:00Z', 0]]) {
    const t = M(iso);
    const ev = evaluate(allSegments({ ...INITIAL_STATE, segments: rows, current: live }, t), { asOf: t, config: cfg });
    if (ev.shift.driveRemaining !== left) throw new Error(`live driving not counted: 11-hr left ${ev.shift.driveRemaining}m at ${iso}, expected ${left}m`);
    if (left === 0 && !ev.violations.some((v) => v.kind === 'WINDOW_14')) throw new Error('11h of live driving past the 14 must show a WINDOW_14 violation');
  }
  // a legacy live status (saved before tap stamps existed) is still treated as the newest entry
  {
    const t = M('2026-09-15T13:00:00Z');
    const ev = evaluate(allSegments({ ...INITIAL_STATE, segments: rows, current: { status: 'D', since: live.since } }, t), { asOf: t, config: cfg });
    if (ev.shift.driveRemaining !== 480) throw new Error('an unstamped (legacy) live status must not lose to older rows');
  }
  // …and a correction typed AFTER the tap still wins over the live row
  {
    const t = M('2026-09-15T13:00:00Z');
    const fuel = { status: 'ON', start: M('2026-09-15T11:00:00Z'), end: M('2026-09-15T11:30:00Z'), createdAt: ms(M('2026-09-15T12:00:00Z')) };
    const ev = evaluate(allSegments({ ...INITIAL_STATE, segments: [...rows, fuel], current: live }, t), { asOf: t, config: cfg });
    if (ev.shift.driveRemaining !== 510) throw new Error(`a later correction inside the live period must win: 11-hr left ${ev.shift.driveRemaining}m, expected 510m`);
  }

  // §2.1 — the row running past now is disclosed on screen
  setState({ nowOverride: M('2026-09-15T10:00:00Z'), tab: 'log', historyAcknowledged: true, current: null, segments: rows.slice(0, 3) });
  let hh = out('log/row running past now');
  if (!/runs past now/.test(hh)) throw new Error('a row running past now must be reported');

  // §2.3 — days before the record starts keep the badge AND the set button
  setState({ nowOverride: M('2026-09-16T12:00:00Z'), tab: 'recap', historyAcknowledged: false, current: null,
    segments: [{ status: 'ON', start: M('2026-09-16T06:00:00Z'), end: M('2026-09-16T10:00:00Z') }] });
  hh = out('recap/one day logged');
  const badges = (hh.match(/not logged — counted as 0h/g) || []).length;
  const setButtons = (hh.match(/>set</g) || []).length;
  if (badges < 7) throw new Error(`expected 7 counted-zero days, saw ${badges}`);
  if (setButtons < 7) throw new Error(`days before the record must keep their set button (saw ${setButtons})`);

  // §2.5 — an entry that doesn't fit in its day is refused, not truncated
  const d0 = M('2026-09-14T00:00:00Z'), d1 = M('2026-09-15T00:00:00Z');
  if (dayPatchOverflow(d0, d1, 13, 2, 23) !== 14 * 60 + 30) throw new Error('13h drive + 2h on at 23:00 overflows the day by 14h30');
  if (dayPatchOverflow(d0, d1, 8, 2, 6) !== 0) throw new Error('8h drive + 2h on at 06:00 fits');

  // §2.6 — the Trip tab says when its verdicts rest on an unlogged hole
  const now2130 = M('2026-09-15T21:30:00Z');
  setState({ nowOverride: now2130, tab: 'trip', historyAcknowledged: true, current: null,
    segments: [{ status: 'D', start: M('2026-09-15T06:00:00Z'), end: M('2026-09-15T11:00:00Z') }, { status: 'OFF', start: M('2026-09-15T13:00:00Z'), end: now2130 }] });
  hh = out('trip/2h hole');
  if (!/Provisional\./.test(hh)) throw new Error('Trip must mark its verdicts provisional when a relevant hole exists');

  setState({ nowOverride: null, tab: 'log', historyAcknowledged: false, segments: [], current: null });
  console.log('stress-test round 2: OK');
}

// --- reported by a driver: "Took 34 mins break. 'Limited by 30 mins break due' still display under
// drive now." A qualifying break DOES reset the 8-hour counter, but BREAK_30 can still be the binding
// limit afterwards — the 480 min of fresh break headroom can be less than the drive time left. The
// label must not then claim a break is due, because the driver has just taken one.
{
  const t = nowMin();
  // Redesign: the "limited by" line is on Now, under the driving time it explains.
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: true, current: null, segments: [
    { status: 'D', start: t - 94, end: t - 34 },   // 1h 00m driving
    { status: 'OFF', start: t - 34, end: t },      // 34-minute break — qualifies
  ] });
  const bx = out('now/after a qualifying break');
  if (!/limited by 8 hours of driving \(30-min break in 8h 00m\)/.test(bx)) throw new Error('after a qualifying break the label must count down to the NEXT break, not claim one is due');
  if (/30-min break due/.test(bx)) throw new Error('the label still says a break is due after the driver took one');

  // Approaching 8 hours with no break: the label must still say "break" (round-3 finding — the first
  // fix dropped the word until the counter hit zero, the moment the driver most needs it).
  setState({ segments: [{ status: 'D', start: t - 465, end: t }] });
  const ax = out('now/break 15 min away');
  if (!/limited by 8 hours of driving \(30-min break in 15m\)/.test(ax)) throw new Error('15 min from the 8-hour limit the label must name the break and the time left');
  if (/30-min break due/.test(ax)) throw new Error('a break 15 min away is not yet due');

  // The other half: once the counter has genuinely run out, it must still say so.
  setState({ segments: [{ status: 'D', start: t - 500, end: t }] });
  // Redesign: with no driving time left, Now leads with the out-of-hours card instead of a "limited by"
  // line, and the other screens carry it in the header. Both must still say the break is due.
  const ox = out('now/break genuinely due');
  if (!/30-min break needed/.test(ox)) throw new Error('a break the driver has actually run out of must still read as due');
  setState({ tab: 'log' });
  if (!/30-min break due · <b>drive again at/.test(out('log/break genuinely due'))) throw new Error('away from Now, the header must still say the break is due');
  setState({ tab: 'now' });

  // Startup disclaimer — never an ELD, never a legal log.
  // (patch 7.1 renamed the app: the pins in this file that quoted the disclaimer now quote
  // "Split Decision is a planning scratchpad" — the invariants they guard are unchanged.)
  const dx = out('startup disclaimer');
  if (!/Split Decision is a planning scratchpad/.test(dx)) throw new Error('the startup disclaimer must appear at launch');
  if (!/not an ELD/.test(dx)) throw new Error('the disclaimer must say the app is not an ELD');
  if (!/395\.34/.test(dx)) throw new Error('the disclaimer must point to the paper-record requirement');
  // While the dialog is open nothing behind it can take focus or be read as current (round-3 finding).
  for (const tag of ['header', 'main', 'nav']) {
    if (!new RegExp(`<${tag}[^>]*\\binert\\b`).test(dx)) throw new Error(`<${tag}> must be inert while the disclaimer is open`);
  }

  // First-run: the terminal zone is asked for, not silently inherited from the phone (round-3 item 3).
  // A driver who set the app up on the road got the phone's zone, which moves every day boundary and
  // the whole recap.
  setState({ tzChosen: false });
  const fz = out('first-run terminal zone');
  if (!/Where is your home terminal\?/.test(fz)) throw new Error('a fresh install must be asked where its terminal is, not handed the phone zone');
  if (!/Home terminal time zone/.test(fz)) throw new Error('the first-run question must offer the zone picker');
  if (!/phone's zone right now/.test(fz)) throw new Error('the first-run question must say which zone it is using until told otherwise');
  setState({ tzChosen: true });
  const fz2 = out('terminal zone already confirmed');
  if (/Where is your home terminal\?/.test(fz2)) throw new Error('once the zone is confirmed the app must stop asking');
  if (!/Split Decision is a planning scratchpad/.test(fz2)) throw new Error('the disclaimer itself must still show on every launch');

  // A legacy save (night was the default when it was written) is moved to the new day default ONCE and
  // says so — never silently (round-3 item 2).
  setState({ themeNotice: true });
  if (!/Switched to the <b>Day<\/b> theme/.test(out('legacy night save'))) throw new Error('a legacy night save must be moved to the day default with a visible notice');
  setState({ themeNotice: false });
  if (/Switched to the <b>Day<\/b> theme/.test(out('migration notice dismissed'))) throw new Error('the migration notice must clear once acknowledged');

  // The day editor renders only after its "set"/"edit" button is clicked, which a render harness cannot
  // do — so this is a source-level check, not a render check (round-3 item 5). "Start" is hours after
  // the day start (store.applyDayPatch: dayStart + startHour*60), which is clock time only when the
  // carrier day begins at midnight.
  const appSrc = await readFile(new URL('../src/app.tsx', import.meta.url), 'utf8');
  if (!/Start \(h after day start\)/.test(appSrc)) throw new Error('the Start field must be labelled as hours after the day start, not a clock time');

  // The theme toggle reads in words. `>Day<` matches only the Settings toggle: the header switch
  // renders as "☀ Day", which has the glyph between the bracket and the word.
  setState({ tab: 'settings' });
  const sx = out('settings/theme toggle');
  if (!/>Day</.test(sx) || !/>Night</.test(sx)) throw new Error('the theme toggle must read Day and Night');
  console.log('reported break label + startup disclaimer + toggle words: OK');
}
// --- round 4, reported by a driver: "After off duty driving 14 hours yesterday. I don't see any timer
// for 10 hours rest. If I clicked 'on duty' the timer for off duty rest... It should let me get on duty.
// Rest 6 hours only." Out of hours, the status bar must say WHEN driving comes back, and that on-duty
// work is allowed; going on duty mid-rest must say the rest has ended.
{
  const T = Math.floor(Date.UTC(2026, 9, 3, 14, 0) / 60000);
  const day = [
    { status: 'OFF', start: T - 2400, end: T - 1200 }, { status: 'ON', start: T - 1200, end: T - 1140 },
    { status: 'D', start: T - 1140, end: T - 840 }, { status: 'OFF', start: T - 840, end: T - 810 },
    { status: 'D', start: T - 810, end: T - 450 }, { status: 'ON', start: T - 450, end: T - 360 },
  ];
  const txt = (x) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  // 6h into the rest after a 14-hour day
  // Redesign: this card is the main card on Now (it was a box in the header on every tab).
  setState({ nowOverride: T, tab: 'now', historyAcknowledged: true, segments: day, current: { status: 'OFF', since: T - 360 } });
  let r = txt(out('now/resting 6h after a 14h day'));
  if (!r.includes(`You can drive again at ${clock(T + 240)}`)) throw new Error('resting out of hours: the status bar must say when driving comes back');
  if (!/4h 00m from now/.test(r)) throw new Error('resting out of hours: the countdown must show the time left (4h 00m)');
  if (!/Going on duty before then is allowed/.test(r)) throw new Error('the driver must be told on-duty work is allowed while resting');
  // the moment he taps On duty after 6 hours off
  setState({ segments: [...day, { status: 'OFF', start: T - 360, end: T }], current: { status: 'ON', since: T } });
  r = txt(out('now/tapped on duty after 6h off'));
  if (!/On-duty work is allowed; driving is not/.test(r)) throw new Error('on duty out of hours: say on-duty work is allowed and driving is not');
  if (r.includes(`drive again at ${clock(T + 240)}`)) throw new Error('going on duty ended the rest: the old drive-again time must not survive the tap');
  if (!/6h 00m off before this does not count toward the 10 hours/.test(r)) throw new Error('going on duty mid-rest must say the rest no longer counts');
  if (!/short half of a sleeper split/.test(r)) throw new Error('a 2h+ rest can still be half of a split, and must be described that way');
  if (!/In the sleeper berth instead/.test(r)) throw new Error('when the sleeper is faster (a split), offer it');
  // a full 10 hours: no rest line at all
  setState({ nowOverride: T + 240, segments: day, current: { status: 'OFF', since: T - 360 } });
  r = txt(out('now/rested 10h'));
  if (/drive again at/.test(r)) throw new Error('with driving time available there is nothing to wait for');
  // 8h straight driving, then 10 min fueling: the break is 20 min away, and on-duty counts toward it
  setState({ nowOverride: T + 10, segments: [{ status: 'OFF', start: T - 1080, end: T - 480 }, { status: 'D', start: T - 480, end: T }], current: { status: 'ON', since: T } });
  r = txt(out('now/break needed, fueling'));
  if (!/30-min break needed/.test(r) || !r.includes(`drive again at ${clock(T + 30)}`)) throw new Error('break case: say a break is needed and when it clears (fueling counts)');
  if (!/on-duty work like fueling/.test(r)) throw new Error('break case: on-duty time counts toward the 30 minutes and the driver must be told');
  // driving with no time left
  setState({ nowOverride: T + 90, segments: [...day, { status: 'OFF', start: T - 360, end: T }, { status: 'ON', start: T, end: T + 60 }], current: { status: 'D', since: T + 60 } });
  // Redesign 2: while Driving, Now is the full-screen driving view — it must say stop, plainly.
  r = txt(out('now/driving out of hours'));
  if (!/Out of driving time/.test(r) || !/Park as soon as it is safe/.test(r)) throw new Error('driving out of hours must say stop driving');
  if (!r.includes(`Off duty from now: drive again at ${clock(T + 690)}`)) throw new Error('driving out of hours: say when driving comes back if he parks now');
  // …and "Details" (the normal Now screen) still leads with the same instruction
  const { setDrivingPeek } = await import('../src/app.tsx');
  setDrivingPeek(T + 60);
  r = txt(out('now/driving out of hours, details'));
  setDrivingPeek(null);
  if (!/No driving time left — stop driving/.test(r)) throw new Error('driving out of hours must say stop driving');
  setState({ nowOverride: null, tab: 'log', historyAcknowledged: false, segments: [], current: null });
  console.log('round 4 (when can I drive again): OK');
}
// Regression (bug report C1/C2): an import must be validated before it replaces anything, and a bad
// time zone must never reach the engine — from a file or from storage.
{
  const { importProblem, sanitizeConfig, applyImportedState, deviceTz: tz } = await import('../src/store.ts');
  const { evaluate } = await import('../../engine/src/index.ts');
  for (const bad of [{ foo: 1 }, [], null, 42, { segments: {} }, { segments: [{ status: 'X', start: 1, end: 2 }] }, { segments: [{ status: 'D', start: 5, end: 2 }] }, { segments: [], tentative: 'x' }, { segments: [], current: { status: 'D' } }]) {
    if (!importProblem(bad)) throw new Error(`import accepted a non-export: ${JSON.stringify(bad)}`);
  }
  if (importProblem({ segments: [{ status: 'D', start: 10, end: 20 }], tentative: [], current: null, config: {} })) throw new Error('a valid export was rejected');
  const cfg = sanitizeConfig({ timeZone: 'Central', dayStartHour: 99, cycle: 'x' });
  if (cfg.timeZone !== getState().config.timeZone && cfg.timeZone !== tz) throw new Error('an invalid time zone survived sanitizeConfig');
  if (cfg.dayStartHour !== 0 || cfg.cycle !== '70/8') throw new Error('sanitizeConfig left a bad day start / cycle');
  const imported = applyImportedState(getState(), { segments: [], config: { timeZone: 'Central' } });
  evaluate([], { asOf: now, config: imported.config }); // must not throw
  // a bad zone already in state must not blank the app: it renders the recovery card instead
  const keep = getState().config;
  setState({ config: { ...keep, timeZone: 'Central' } });
  hh = render(h(App, {}));
  if (!/could not calculate your clocks/.test(hh) || !/Reset settings/.test(hh)) throw new Error('an engine error must show the recovery card, not throw');
  setState({ config: keep });
  console.log('import validation + bad time zone: OK');
}
// --- review of the QA patch (a tester): fixes on top of it
{
  const { earliestStrategy } = await import('../src/app.tsx');
  const { parseSaved, isValidTimeZone: validTz } = await import('../src/store.ts');
  const { readFileSync } = await import('node:fs');
  const P = (a) => ({ arrival: a });
  const pick = (r, sp, x) => earliestStrategy({ reset10: P(r), split: P(sp), restart34: P(x) });
  if (pick(10, 5, 5) !== 'split') throw new Error('split and 34h tied ahead of 10-hour resets: the earliest must win, not the slower reset10');
  if (pick(10, 9, 5) !== 'restart34') throw new Error('a strictly faster 34h restart must be picked (M3)');
  if (pick(5, 5, 5) !== 'reset10') throw new Error('a three-way tie goes to the simplest plan');
  // a bad saved zone is replaced AND the driver is asked again — never moved silently
  const bad = parseSaved(JSON.stringify({ segments: [], config: { timeZone: 'Central' }, tzChosen: true, themeChosen: true }));
  if (!validTz(bad.config.timeZone)) throw new Error('an invalid saved zone reached the state');
  if (bad.tzChosen) throw new Error('an invalid saved zone must bring back the zone prompt, not be replaced silently');
  const good = parseSaved(JSON.stringify({ segments: [], config: { timeZone: 'America/Chicago' }, tzChosen: true, themeChosen: true }));
  if (!good.tzChosen || good.config.timeZone !== 'America/Chicago') throw new Error('a valid saved zone must be kept as chosen');
  // the recovery card can always get the log out
  const keep2 = getState().config;
  setState({ config: { ...keep2, timeZone: 'Central' } });
  const rc = render(h(App, {}));
  if (!/Export my log/.test(rc)) throw new Error('the recovery card must offer to export the log');
  setState({ config: keep2 });
  // offline cache covers every icon the manifest names
  const sw = readFileSync('public/sw.js', 'utf8'), mf = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  for (const ic of mf.icons) { const f = './' + ic.src.replace(/^\.\//, ''); if (!sw.includes(`'${f}'`)) throw new Error(`sw.js does not precache manifest icon ${ic.src}`); }
  console.log('QA patch review fixes: OK');
}
// --- driver report 2026-10-04: "the pill gets reset every time off duty is tagged"
{
  const { statusTap, currentRunStart, setState, getState } = await import('../src/store.ts');
  const T = Math.floor(new Date('2026-10-04T03:00:00Z').getTime() / 60000);
  const keep = getState();
  const rest = { ...keep, segments: [], current: { status: 'OFF', since: T - 125, createdAt: 1 } };

  // 1. tapping the status you are already in changes nothing at all
  if (statusTap(rest, 'OFF', undefined, T) !== null) throw new Error('tapping the status you are already in must not re-stamp the row — it reset the header pill to 0m mid-rest');
  // 2. a different status still switches, and closes the row being left at the tap
  const dv = statusTap(rest, 'D', undefined, T);
  if (!dv || dv.current.status !== 'D' || dv.current.since !== T) throw new Error('changing to a different status must still start a row at the tap');
  if (dv.segments.length !== 1 || dv.segments[0].status !== 'OFF' || dv.segments[0].end !== T) throw new Error('the status being left must be closed at the tap');
  // 3. PC and Yard move change the note, so they are not duplicates and must still switch
  if (!statusTap(rest, 'OFF', 'PC', T)) throw new Error('personal conveyance must still switch — the note is part of the status');
  if (!statusTap(rest, 'ON', 'YM', T)) throw new Error('yard move must still switch');
  if (statusTap({ ...rest, current: { status: 'OFF', note: 'PC', since: T - 125 } }, 'OFF', 'PC', T) !== null) throw new Error('re-tapping the same note must also be a no-op');
  if (!statusTap({ ...rest, current: { status: 'OFF', note: 'PC', since: T - 125 } }, 'OFF', undefined, T)) throw new Error('dropping a PC note is a real change and must switch');

  // 4. the pill counts the whole continuous run, so a log already split by the old behaviour reads right
  if (currentRunStart(rest, T) !== T - 125) throw new Error('an unsplit rest is its own run start');
  const split = { ...rest, segments: [{ status: 'OFF', start: T - 605, end: T - 125, createdAt: 1 }], current: { status: 'OFF', since: T - 125, createdAt: 2 } };
  if (currentRunStart(split, T) !== T - 605) throw new Error('a rest split by a duplicate tap must still count from the original start — this is the reported bug');
  const gapped = { ...rest, segments: [{ status: 'OFF', start: T - 605, end: T - 200, createdAt: 1 }], current: { status: 'OFF', since: T - 125, createdAt: 2 } };
  if (currentRunStart(gapped, T) !== T - 125) throw new Error('rest separated by a gap must not be merged');
  const other = { ...rest, segments: [{ status: 'D', start: T - 605, end: T - 125, createdAt: 1 }], current: { status: 'OFF', since: T - 125, createdAt: 2 } };
  if (currentRunStart(other, T) !== T - 125) throw new Error('a different status must not be merged into the run');
  const noted = { ...rest, segments: [{ status: 'OFF', note: 'PC', start: T - 605, end: T - 125, createdAt: 1 }], current: { status: 'OFF', since: T - 125, createdAt: 2 } };
  if (currentRunStart(noted, T) !== T - 125) throw new Error('a PC row must not be merged into a plain off-duty run — they are different labels');

  // 5. end to end: the rendered pill reads the whole rest, not the time since the last tap
  setState({ tab: 'log', nowOverride: T, tentative: [], current: { status: 'OFF', since: T - 125, createdAt: 2 }, segments: [{ status: 'OFF', start: T - 605, end: T - 125, createdAt: 1 }], config: { ...keep.config, cycle: '70/8' } });
  const ph = render(h(App, {}));
  if (!/Off Duty · 10h 05m/.test(ph)) throw new Error(`the header pill must read the whole continuous rest (10h 05m), not the time since the last tap — got ${(ph.match(/Off Duty · [^<]*/) || ['none'])[0]}`);
  setState({ nowOverride: null, segments: keep.segments, current: keep.current, tab: keep.tab, config: keep.config });
  console.log('driver report (pill must not reset on a duplicate status tap): OK');
}
// --- round-5 retest: the pill is measured on the clocks' own timeline, so a correction cannot make it
// over-count rest (it read "Off Duty · 2h 00m" while the clocks said 1h 30m and "drive again at 16:30").
{
  const T = Math.floor(Date.UTC(2026, 9, 4, 13, 0) / 60000); // now = Sun 08:00 CDT
  const H = (x) => T + Math.round(x * 60);
  const day = [{ status: 'OFF', start: H(-26), end: H(-16), createdAt: 1 }, { status: 'ON', start: H(-16), end: H(-15), createdAt: 2 },
    { status: 'D', start: H(-15), end: H(-5), createdAt: 3 }, { status: 'ON', start: H(-5), end: H(-2), createdAt: 4 }];
  const pillOf = (segments, current) => {
    setState({ nowOverride: T, tab: 'log', historyAcknowledged: true, segments, current, tentative: [] });
    const m = render(h(App, {})).match(/class="pill"[^>]*>([^<]*)</);
    return m ? m[1] : '';
  };
  const offAt6 = { status: 'OFF', since: H(-2), createdAt: 5 };
  let p = pillOf([...day, { status: 'D', start: H(-2.5), end: H(-1.5), createdAt: 9 }], offAt6);
  if (p !== 'Off Duty · 1h 30m') throw new Error(`a correction "drove until 06:30" must move the pill's start to 06:30 (got "${p}")`);
  if (!render(h(App, {})).includes(`drive again at ${clock(H(8.5))}`)) throw new Error('the pill and "drive again at" must describe the same rest');
  p = pillOf(day, offAt6);
  if (p !== 'Off Duty · 2h 00m') throw new Error(`control without a correction (got "${p}")`);
  p = pillOf([...day, { status: 'OFF', start: H(-2), end: H(-1), createdAt: 5 }], { status: 'OFF', since: H(-1), createdAt: 6 });
  if (p !== 'Off Duty · 2h 00m') throw new Error(`an old double-tap split must still read as one run (got "${p}")`);
  p = pillOf([...day, { status: 'OFF', start: H(-2), end: H(-1.5), note: 'PC', createdAt: 5 }], { status: 'OFF', since: H(-1.5), createdAt: 6 });
  if (p !== 'Off Duty · 1h 30m') throw new Error(`plain off duty after personal conveyance counts from the switch (got "${p}")`);
  p = pillOf([...day, { status: 'OFF', start: H(-2), end: H(-1.5), createdAt: 5 }], { status: 'OFF', note: 'PC', since: H(-1.5), createdAt: 6 });
  if (!/· 1h 30m$/.test(p)) throw new Error(`personal conveyance after plain off duty counts only the PC time (got "${p}")`);
  p = pillOf([...day, { status: 'D', start: H(-1), end: H(-0.75), createdAt: 9 }], offAt6);
  if (p !== 'Off Duty · 45m') throw new Error(`a correction inside the rest restarts the run after it (got "${p}")`);
  p = pillOf([...day, { status: 'D', start: H(-1), end: T, createdAt: 9 }], offAt6);
  if (p !== 'Off Duty · 0m') throw new Error(`a correction running up to now leaves no time in the live status (got "${p}")`);
  setState({ nowOverride: null, tab: 'log', historyAcknowledged: false, segments: [], current: null });
  console.log('pill measured on the clocks timeline: OK');
}
// --- round-6: the Log tab's resolved timeline must LABEL each row by its note, not fold a
// personal-conveyance row into the plain off-duty run that follows it (cover-note section 6). The clocks
// were always right; that row's label overstated PC time on the driver's own log.
{
  const T = Math.floor(Date.UTC(2026, 9, 4, 13, 0) / 60000);
  const H = (x) => T + Math.round(x * 60);
  setState({ nowOverride: T, tab: 'log', logResolved: true, historyAcknowledged: true, current: null, tentative: [],
    segments: [
      { status: 'OFF', start: H(-3), end: H(-2.5), note: 'PC', createdAt: 1 },
      { status: 'OFF', start: H(-2.5), end: H(-0.5), createdAt: 2 },
      { status: 'D', start: H(-0.5), end: T, createdAt: 3 }
    ] });
  const html = render(h(App, {}));
  const pc = html.match(/Personal conveyance \(OFF\)<\/span><span class="muted">([^<]*)</);
  if (!pc) throw new Error('the resolved timeline must still label the personal-conveyance row');
  if (!/· 30m$/.test(pc[1])) throw new Error(`personal conveyance must show only its own 30m — folding the plain off duty that followed into it overstates PC time on the driver's own log (got "${pc[1]}")`);
  if (!/<span>Off Duty<\/span><span class="muted">[^<]*· 2h 00m/.test(html)) throw new Error('the plain off-duty row that followed personal conveyance must be its own row (2h 00m)');
  setState({ nowOverride: null, tab: 'log', logResolved: false, historyAcknowledged: false, segments: [], current: null });
  console.log('Log tab resolved timeline labels rows by their note: OK');
}
// --- driving alerts (driver report 2026-10-06: "Drive passed 16 hours should get a warning. It just keep
// let me drive.") Advance alerts at 60/30/15 min and at zero, a repeat while driving out of time, a banner
// that needs no tap, and keep-screen-on while driving.
{
  const A = await import('../src/alerts.ts');
  const { parseSaved: parse2 } = await import('../src/store.ts');
  // 1. the alert sequence, minute by minute, while driving from 75 min left to 40 min over
  let mem = A.NO_ALERTS, fired = [];
  for (let m = 0, left = 75; left >= -40; m++, left--) { const r = A.nextAlert(mem, true, left, 1000 + m); mem = r.mem; if (r.fire !== null) fired.push(`${r.fire}@${left}`); }
  if (fired.join() !== '60@60,30@30,15@15,0@0,0@-15,0@-30') throw new Error(`alert sequence wrong: ${fired.join()}`);
  // 2. opening the app mid-countdown does not replay passed marks; the next one still fires
  mem = A.NO_ALERTS; fired = [];
  for (const [i, left] of [20, 19, 16, 15, 14].entries()) { const r = A.nextAlert(mem, true, left, 2000 + i); mem = r.mem; if (r.fire !== null) fired.push(r.fire); }
  if (fired.join() !== '15') throw new Error(`opened at 20 min: expected only the 15-min alert, got ${fired.join() || 'none'}`);
  // 3. tapping Driving (or opening the app) with no time left fires at once — the driver report's moment
  if (A.nextAlert(A.NO_ALERTS, true, 0, 3000).fire !== 0) throw new Error('driving with no time left must alert immediately');
  // 4. the phone slept from 50 to 10 min left: one alert, the most urgent
  let r = A.nextAlert({ prev: 50, lastAt: null }, true, 10, 4000);
  if (r.fire !== 15) throw new Error(`a jump past several marks must fire the most urgent one once (got ${r.fire})`);
  // 5. not driving: never, even as the window runs out; and leaving Driving resets
  mem = A.NO_ALERTS;
  for (let left = 70; left >= -5; left--) { const x = A.nextAlert(mem, false, left, 5000 - left); mem = x.mem; if (x.fire !== null) throw new Error('alerts must only fire while driving'); }
  r = A.nextAlert({ prev: 31, lastAt: 1 }, false, 31, 6000);
  if (r.mem.prev !== null || A.nextAlert(r.mem, true, 45, 6001).fire !== null) throw new Error('back to Driving with time left must not alert at once');
  // 6. keep the screen on only while driving, and only if wanted
  if (!A.wantsWakeLock(true, 'D') || A.wantsWakeLock(true, 'ON') || A.wantsWakeLock(true, 'OFF') || A.wantsWakeLock(false, 'D')) throw new Error('wake lock: only while Driving, only when keepAwake');
  // 7. existing saves get the new settings switched on
  const old = parse2(JSON.stringify({ segments: [], config: { timeZone: 'America/Chicago' }, tzChosen: true, themeChosen: true }));
  if (old.alertsOn !== true || old.keepAwake !== true) throw new Error('an existing install must get alerts and keep-screen-on by default');
  // 8. the banner, rendered: driving since 06:00 after 10h off, so the 8-hour break limit binds first
  const T0 = Math.floor(Date.UTC(2026, 9, 6, 11, 0) / 60000);
  const segs = [{ status: 'OFF', start: T0 - 600, end: T0, createdAt: 1 }];
  const banner = (after, status = 'D') => {
    setState({ nowOverride: T0 + after, tab: 'log', historyAcknowledged: true, tentative: [], segments: segs, current: { status, since: T0, createdAt: 2 } });
    const m = render(h(App, {})).match(/<div class="alertbox (warn|bad)" role="alert">([\s\S]*?)<\/div>/);
    return m ? `${m[1]}: ${m[2].replace(/<[^>]+>/g, '')}` : null;
  };
  if (banner(419) !== null) throw new Error('61 min left: no banner yet');
  let b = banner(435);
  if (!b?.startsWith('warn: 45m of driving left.') || !/8-hour driving limit before a 30-minute break/.test(b)) throw new Error(`45 min left: amber banner naming the limit (got ${b})`);
  b = banner(470);
  if (!b?.startsWith('bad: 10m of driving left.')) throw new Error(`10 min left: red banner (got ${b})`);
  b = banner(600);
  if (!b?.startsWith('bad: Out of driving time.') || !/Park as soon as it is safe/.test(b)) throw new Error(`out of time while driving: red "park as soon as it is safe" (got ${b})`);
  if (banner(600, 'ON') !== null) throw new Error('on duty, not driving: no driving alert banner');
  // 9. the Settings card
  setState({ nowOverride: null, tab: 'settings', current: null, segments: [] });
  const st = render(h(App, {}));
  if (!/Driving alerts/.test(st) || !/Test alert/.test(st) || !/Keep the screen on while your status is Driving/.test(st)) throw new Error('Settings must offer the alert switches and a test');
  if (!/Your ELD is your official warning/.test(st)) throw new Error('Settings must say alerts are not the official warning');
  setState({ nowOverride: null, tab: 'log', historyAcknowledged: false, segments: [], current: null });
  console.log('driving alerts: OK');
}
// --- redesign 1 (2026-10-10): Now screen, slim header, slide-up panels, Plan
{
  const { openSheet, tapStatus, startOffsets, setLaunchNotice } = await import('../src/app.tsx');
  setLaunchNotice(false); // look behind the launch notice: panels open only once it is dismissed
  const { parseSaved: parse3, getState: gs } = await import('../src/store.ts');
  const { readFileSync: rf } = await import('node:fs');
  const T = Math.floor(Date.UTC(2026, 9, 12, 15, 45) / 60000); // Mon 10:45 CDT
  const L = (h, m = 0) => Math.floor(Date.UTC(2026, 9, 12, h + 5, m) / 60000);
  const day = [
    { status: 'OFF', start: L(-4), end: L(6), createdAt: 1 },
    { status: 'ON', start: L(6), end: L(6, 30), createdAt: 2 },
    { status: 'D', start: L(6, 30), end: L(10), createdAt: 3 },
    { status: 'OFF', start: L(10), end: L(10, 30), createdAt: 4 },
  ];
  const base = { nowOverride: T, historyAcknowledged: true, tentative: [], segments: day, current: { status: 'ON', since: L(10, 30), createdAt: 5 } };
  const txt = (x) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const header = (h) => (h.match(/<header[\s\S]*?<\/header>/) || [''])[0];

  // 1. every launch opens on Now
  if (parse3(JSON.stringify({ segments: [], tab: 'trip', tzChosen: true, themeChosen: true })).tab !== 'now') throw new Error('a launch must open on Now, not the last tab');

  // 2. Now: one big number, the stop time, the limit that sets it, every limit as a bar, status at the bottom
  setState({ ...base, tab: 'now' });
  let h = out('now/fuel stop');
  let t = txt(h);
  if (!/You can drive 7h 30m Stop by /.test(t)) throw new Error(`Now must lead with driving time and stop time (got ${t.slice(0, 200)})`);
  // Patch #1.1: the dial stacks the stop date over the stop time, so the rendered text has no comma.
  if (!t.includes(`Stop by ${clockFull(L(18, 15)).replace(', ', ' ')}`)) throw new Error('the stop time must be 6:15 PM (11-hour limit) for this day');
  if (!/class="hero-stop-date"/.test(h) || !/class="hero-stop-time"/.test(h)) throw new Error('the dial stop-by must stack date over time as separate lines (patch #1.1)');
  if (!/limited by 11-hour driving limit/.test(t)) throw new Error('the hero must name the limit in full');
  for (const re of [/11-hr driving 7h 30m left/, /14-hr window 9h 15m left/, /30-min break due in 8h 00m/, /70-hr \/ 8-day cycle 65h 45m left/]) if (!re.test(t)) throw new Error(`Now is missing a limit row: ${re}`);
  if (!/class="meter on"[^>]*><span class="meter-label">11-hr driving/.test(h)) throw new Error('the limit that sets the stop time must be marked');
  if ((h.match(/class="dock"/g) || []).length !== 1 || !/aria-pressed="true"[^>]*>[\s\S]{0,400}On Duty/.test(h)) throw new Error('Now must end with the status buttons, the current one pressed');
  if (/class="stat-value"/.test(header(h))) throw new Error('the header must no longer carry the clock tiles');
  if (/drive again at|of driving · Stop by/.test(header(h))) throw new Error('on Now the header must not repeat what the main card says');

  // 3. the header is opaque — its see-through edge drew text over the content scrolling under it
  const css = rf('public/styles.css', 'utf8');
  const top = css.match(/\n\.top \{[^}]*\}/)[0];
  if (/transparent|gradient/.test(top) || !/background: var\(--bg\)/.test(top)) throw new Error(`the sticky header must be opaque: ${top}`);

  // 3b. Patch #2: the stacked stop-by is a LAYOUT property — a string render cannot see it.
  // Mutation testing (Claudia, 2026-11-05) showed reverting these rules alone shipped GREEN:
  // the single line overflows the dial ring at phone widths. Pin the stack itself.
  const heroStop = (css.match(/\.hero \.hero-stop \{[^}]*\}/) || [''])[0];
  if (!/display: flex/.test(heroStop) || !/flex-direction: column/.test(heroStop) || !/align-items: center/.test(heroStop) || !/text-transform: uppercase/.test(heroStop)) throw new Error(`the dial stop-by must stack as a centred uppercase column (patch #1.1): ${heroStop}`);
  const stopDate = (css.match(/\.hero-stop-date \{[^}]*\}/) || [''])[0];
  const stopTime = (css.match(/\.hero-stop-time \{[^}]*\}/) || [''])[0];
  const px = (rule) => Number((rule.match(/font-size: (\d+)px/) || [])[1] || 0);
  if (!(px(stopDate) > 0) || !(px(stopTime) > px(stopDate))) throw new Error(`the stacked stop-by needs a quiet date line over a larger time (patch #1.1): date ${stopDate} · time ${stopTime}`);

  // 4. away from Now, one line of driving time in the header
  setState({ tab: 'log' });
  h = out('log/header line');
  if (!txt(header(h)).includes(`7h 30m of driving · Stop by ${clockFull(L(18, 15))}`)) throw new Error('other screens must keep one line of driving time in the header');

  // 5. Why: every rule's own end time, the earliest marked
  setState({ tab: 'now' });
  openSheet({ kind: 'why' });
  h = out('now/why panel');
  t = txt(h);
  if (!t.includes(`Why stop by ${clockFull(L(18, 15))}?`)) throw new Error('the Why panel must restate the stop time it explains');
  // the break's time is labelled as the latest start (driver question, 2026-10-10)
  // Patch #1.1: per-rule end times carry the full date, matching the sheet title.
  for (const [rule, at] of [['11-hour driving', clockFull(L(18, 15))], ['30-minute break', `latest start ${clockFull(L(18, 45))}`], ['14-hour window', clockFull(L(20))], ['70-hour / 8-day cycle', 'Not today']]) {
    if (!t.includes(`${rule} ${at}`)) throw new Error(`Why panel: ${rule} should end at ${at}`);
  }
  if ((h.match(/Earliest — this sets your stop time/g) || []).length !== 1) throw new Error('exactly one rule is the earliest');
  // Patch #3: every Why row names its rule — show your work, the citation under the prose
  for (const cite of ['49 CFR 395.3(a)(3)(i)', '49 CFR 395.3(a)(3)(ii)', '49 CFR 395.3(a)(2)', '49 CFR 395.3(b)(2)']) if (!t.includes(cite)) throw new Error(`Why panel: the rows must carry their citations (missing ${cite})`);
  if ((h.match(/class="why-cite"/g) || []).length !== 4) throw new Error('each Why row carries exactly one citation line');
  // Patch #3.1: the citation line's quiet style is pinned too — a render cannot see it
  if (!/\.why-cite \{[^}]*color: var\(--muted\)/.test(css)) throw new Error('the citation line must stay a quiet muted line (patch #3)');
  // Patch #4: the verdict as plain text for dispatch — this section's day, word for word
  const { shareText } = await import('../src/app.tsx');
  const { evaluate: evShareFn } = await import('../../engine/src/index.ts');
  const stS = gs();
  const evShare = evShareFn([...stS.segments, { status: stS.current.status, start: stS.current.since, end: T }], { asOf: T, config: stS.config });
  const wantShare = `I can drive 7h 30m. Stop by ${clockFull(L(18, 15))}.\nLimited by 11-hour driving limit (49 CFR 395.3(a)(3)(i)).`;
  if (shareText(evShare, null) !== wantShare) throw new Error(`the share text must be the dial's verdict in dispatch words (got ${shareText(evShare, null)})`);
  if (!/M12 14V4/.test(h) || !/Share<\/button>/.test(h)) throw new Error('the Now hero must offer Share beside Why? (patch #4)');
  if (!/<li class="on"><div class="why-head"><b>11-hour driving/.test(h)) throw new Error('the earliest rule must be the 11-hour one here');
  for (const tag of ['header', 'main', 'nav']) if (!new RegExp(`<${tag}[^>]*\\binert\\b`).test(h)) throw new Error(`<${tag}> must be inert while a panel is open`);
  if (!/role="dialog" aria-modal="true" aria-labelledby="sheet-title"/.test(h)) throw new Error('a panel must be a labelled modal dialog');
  openSheet(null);
  h = out('now/panel closed');
  if (/<main[^>]*\binert\b/.test(h)) throw new Error('closing the panel must make the screen usable again');

  // 5b. Patch #3.1: render the OTHER configs — a hard-coded (b)(2), or a citation that
  // ignores an active exception, must fail here rather than ship green
  const evNow31 = (await import('../../engine/src/index.ts')).evaluate;
  const st31 = gs();
  const ss31 = evNow31([...st31.segments, { status: st31.current.status, start: st31.current.since, end: T }], { asOf: T, config: st31.config }).shift.shiftStart;
  setState({ config: { ...gs().config, cycle: '60/7' } });
  openSheet({ kind: 'why' });
  t = txt(out('now/why panel 60/7'));
  if (!t.includes('60-hour / 7-day cycle') || !t.includes('49 CFR 395.3(b)(1)')) throw new Error('a 60/7 config must cite (b)(1) on the cycle row (patch #3)');
  setState({ config: { ...gs().config, cycle: '70/8', adverseShifts: [ss31] } });
  openSheet({ kind: 'why' });
  t = txt(out('now/why panel adverse'));
  if (!t.includes('13-hour driving') || (t.match(/adverse §395\.1\(b\)\(1\)/g) || []).length !== 2) throw new Error('adverse driving must qualify both the driving and the window citations (patch #3.1)');
  setState({ config: { ...gs().config, adverseShifts: [], sixteenHourShifts: [ss31] } });
  openSheet({ kind: 'why' });
  t = txt(out('now/why panel 16h'));
  if (!t.includes('16-hour window') || !t.includes('16-hour day §395.1(o)')) throw new Error('a 16-hour day must qualify the window citation (patch #3.1)');
  setState({ config: { ...gs().config, sixteenHourShifts: [] } });
  openSheet(null);

  // 5c. Patch #4, stopped: the share text names the limit and when driving comes back
  const stoppedSegs = [
    { status: 'OFF', start: L(-4), end: L(6), createdAt: 1 },
    { status: 'D', start: L(6), end: L(17), createdAt: 2 },
  ];
  const evStop = evShareFn([...stoppedSegs, { status: 'OFF', start: L(17), end: L(17) }], { asOf: L(17), config: gs().config });
  if (evStop.driveNow !== 0 || evStop.binding !== 'DRIVE_11') throw new Error('the stopped share scenario must sit at the 11-hour limit');
  const { driveAgainAt } = await import('../../engine/src/index.ts');
  const againStop = driveAgainAt(stoppedSegs, { asOf: L(17), config: gs().config }, 'OFF');
  const wantStop = `I'm out of driving time — limited by 11-hour driving limit (49 CFR 395.3(a)(3)(i)).\nI can drive again at ${clockFull(L(27))}.`;
  if (againStop !== L(27) || shareText(evStop, againStop) !== wantStop) throw new Error(`the stopped share text must say when driving comes back (got ${shareText(evStop, againStop)})`);
  setState({ segments: stoppedSegs, current: { status: 'OFF', since: L(17), createdAt: 3 }, tab: 'now' });
  if (!/Share<\/button>/.test(out('now/stopped share'))) throw new Error('the stopped hero must offer Share beside Why? (patch #4)');
  setState({ ...base });

  // 6. status panel: "started earlier" — never reaching back past the status being left
  const offs = startOffsets(gs(), T).map((o) => `${o.minutes}:${o.ok}`).join(' ');
  if (offs !== '0:true 5:true 15:false 30:false') throw new Error(`on duty since 10:30, at 10:45 only "5 min ago" can be offered (got ${offs})`);
  openSheet({ kind: 'status' });
  h = out('now/status panel');
  if (!/What are you doing now\?/.test(h) || !/Personal conveyance/.test(h) || !/Yard move/.test(h)) throw new Error('the status panel must offer every status, PC and yard move');
  if (!/disabled=""[^>]*>15 min ago|>15 min ago<\/button>/.test(h)) throw new Error('the status panel must render the start options');
  openSheet(null);
  tapStatus('D', undefined, 5);
  if (gs().current.status !== 'D' || gs().current.since !== T - 5) throw new Error('"5 min ago" must start the new status 5 minutes back');
  if (gs().segments.at(-1).status !== 'ON' || gs().segments.at(-1).end !== T - 5) throw new Error('the status left must be closed at the earlier time');
  setState({ ...base });
  tapStatus('D', undefined, 30);
  if (gs().current.status !== 'ON') throw new Error('an offset reaching past the start of the status being left must change nothing');
  tapStatus('ON');
  if (gs().current.since !== L(10, 30)) throw new Error('tapping the status you are already in must still change nothing');

  // 7. exceptions: one line on Now, the switches in a panel
  setState({ ...base, tab: 'now' });
  if (!/Exceptions this shift[\s\S]{0,80}None/.test(out('now/no exceptions'))) throw new Error('Now must say there are no exceptions');
  openSheet({ kind: 'exceptions' });
  h = out('now/exceptions panel');
  if (!/Adverse driving conditions/.test(h) || !/16-hour short-haul day/.test(h) || !/type="checkbox"/.test(h)) throw new Error('the exceptions panel must hold both switches');
  openSheet(null);

  // 8. Plan: three questions; the planning screens lead back to it and keep Plan lit in the tab bar
  setState({ ...base, tab: 'plan' });
  h = out('plan/hub');
  for (const q of ['Can I take this load?', 'Plan a sleeper split', 'Plan a run']) if (!h.includes(q)) throw new Error(`Plan must offer "${q}"`);
  for (const tab of ['split', 'trip']) {
    setState({ tab });
    h = out(`${tab}/under plan`);
    if (!/class="back"/.test(h)) throw new Error(`${tab} must lead back to Plan`);
    if (!/aria-current="page"[^>]*>[\s\S]{0,400}Plan<\/button>/.test(h)) throw new Error(`${tab} must keep Plan lit in the tab bar`);
  }
  // 9. tap targets: nothing on Now smaller than 48px by its own CSS (floor raised by patch #6;
  //    the per-class pins live in the patch 6 section at the end of this file)
  if (!/\nbutton \{[^}]*min-height: 48px/.test(css)) throw new Error('buttons must be at least 48px tall');
  setLaunchNotice(true);
  if (!/Split Decision is a planning scratchpad/.test(out('launch notice back'))) throw new Error('the launch notice must be back for the next launch');
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], current: null });
  console.log('redesign 1 (Now, header, panels, Plan): OK');
}
// --- redesign 2: the driving view
{
  const { setDrivingPeek, showsDrivingView } = await import('../src/app.tsx');
  const { getState: gs } = await import('../src/store.ts');
  const { readFileSync: rf } = await import('node:fs');
  const L = (h, m = 0) => Math.floor(Date.UTC(2026, 9, 12, h + 5, m) / 60000);
  const day = [
    { status: 'OFF', start: L(-4), end: L(6), createdAt: 1 }, { status: 'ON', start: L(6), end: L(6, 30), createdAt: 2 },
    { status: 'D', start: L(6, 30), end: L(10), createdAt: 3 }, { status: 'OFF', start: L(10), end: L(10, 30), createdAt: 4 },
    { status: 'ON', start: L(10, 30), end: L(11), createdAt: 5 },
  ];
  const txt = (x) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const at = (h, m) => { setState({ tab: 'now', nowOverride: L(h, m), historyAcknowledged: true, tentative: [], segments: day, current: { status: 'D', since: L(11), createdAt: 6 }, drivingView: true }); return out(`drive/${h}:${m}`); };
  // 1. cruising: one number, the stop time, the limit, one button — no header, no tab bar
  let h = at(12, 30), t = txt(h);
  if (!/<main class="drive calm"/.test(h)) throw new Error('driving with time left must show the calm driving view');
  // (the driving view's stop-by is a full-width glance line of its own, not the dial — it keeps
  // the single-line full date; only the Now hero dial stacks date over time, patch #1.1)
  if (!t.includes(`Driving left 6h 00m Stop by ${clockFull(L(18, 30))} limited by 11-hour driving limit`)) throw new Error(`driving view content wrong: ${t.slice(0, 220)}`);
  if (/<header|<nav/.test(h)) throw new Error('the driving view hides the header and tab bar');
  if ((h.match(/<button/g) || []).length > 3) throw new Error('while driving there must be almost nothing to tap: Details and I’ve stopped (plus the launch notice)');
  if (!/I've stopped/.test(h)) throw new Error('the driving view needs its one big button');
  // 2. an hour or less: amber, "plan where you'll park"
  h = at(17, 45); t = txt(h);
  if (!/<main class="drive warn"/.test(h) || !/Plan where you’ll park/.test(t) || !/45m/.test(t)) throw new Error('45 min left must be the amber "plan where you’ll park" view');
  // 3. none: red, "park as soon as it is safe"
  h = at(18, 30);
  if (!/<main class="drive bad"/.test(h) || !/Park as soon as it is safe/.test(h)) throw new Error('out of time must be the red view');
  // 4. day floods, night frames (no flood of light in a dark cab)
  const css = rf('public/styles.css', 'utf8');
  if (/\nmain\.drive\.warn \{[^}]*background/.test(css) || /\nmain\.drive\.bad \{[^}]*background/.test(css)) throw new Error('at night the driving view must not flood the screen with colour');
  if (!/:root\[data-theme="day"\] main\.drive\.bad \{[^}]*background: var\(--bad\)/.test(css)) throw new Error('in day the out-of-time view floods red');
  // 5. Details shows the normal Now until the status changes
  at(12, 30);
  setDrivingPeek(gs().current.since);
  if (showsDrivingView(gs()) || !/<header/.test(out('drive/details'))) throw new Error('Details must show the normal Now screen');
  setState({ current: { status: 'D', since: L(12, 31), createdAt: 7 } });
  if (!showsDrivingView(gs())) throw new Error('a new Driving status must bring the driving view back');
  setDrivingPeek(null);
  // 6. switched off in Settings, or on another tab: the normal app
  setState({ drivingView: false });
  if (showsDrivingView(gs())) throw new Error('the setting must turn the driving view off');
  setState({ drivingView: true, tab: 'log' });
  if (showsDrivingView(gs()) || !/<header/.test(out('drive/on log'))) throw new Error('only Now becomes the driving view');
  setState({ tab: 'settings', current: null });
  if (!/Big driving screen while your status is Driving/.test(out('settings/driving view switch'))) throw new Error('Settings must offer the driving view switch');
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], current: null });
  console.log('redesign 2 (driving view): OK');
}
// --- redesign 3: the Log, one day at a time; edit and add in panels
{
  const { openSheet, setLaunchNotice, saveEntry, deleteEntry, addEntry, currentUndo, undoLast } = await import('../src/app.tsx');
  const { getState: gs } = await import('../src/store.ts');
  const L = (d, h, m = 0) => Math.floor(Date.UTC(2026, 9, d, h + 5, m) / 60000); // Oct d, CDT
  const T = L(12, 10, 45);
  const yday = { status: 'D', start: L(11, 14), end: L(11, 18), createdAt: 1 };
  const day = [
    { status: 'OFF', start: L(11, 18), end: L(12, 6), createdAt: 2 }, { status: 'ON', start: L(12, 6), end: L(12, 6, 30), createdAt: 3 },
    { status: 'D', start: L(12, 6, 30), end: L(12, 10), createdAt: 4 }, { status: 'OFF', start: L(12, 10), end: L(12, 10, 30), createdAt: 5 },
  ];
  setState({ tab: 'log', logResolved: false, nowOverride: T, historyAcknowledged: true, tentative: [], segments: [yday, ...day], current: { status: 'ON', since: L(12, 10, 30), createdAt: 6 }, config: { ...gs().config, timeZone: 'America/Chicago', dayStartHour: 0 } });
  let h = out('log/day view');
  const txt = (x) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const t = txt(h);
  // 1. today's carrier day: label, grid, totals clipped to the day and to now
  if (!/Today, Mon, Oct 12/.test(t)) throw new Error(`the Log must open on today (got ${t.slice(0, 160)})`);
  if (!/class="grid"/.test(h)) throw new Error('the day needs its four-line grid');
  if (!/Driving 3h 30m On Duty 45m Off Duty 6h 30m Sleeper 0m/.test(t)) throw new Error(`day totals wrong (want D 3h30, ON 45m incl. the live 15m, OFF 6h30 from midnight): ${(t.match(/Driving \S+ \S+ On Duty.{0,60}/) || ['?'])[0]}`);
  // 2. rows are whole-width buttons; no small Edit and × targets; yesterday's row is not today's
  if ((h.match(/class="entry" aria-label="Edit /g) || []).length !== 4) throw new Error('today must list its four entries as tap-to-edit rows (yesterday’s drive excluded)');
  if (/class="x"|>Edit</.test(h)) throw new Error('the small Edit and × buttons must be gone');
  if (!/aria-label="Previous day"(?![^>]*disabled)/.test(h) || !/aria-label="Next day" disabled/.test(h)) throw new Error('from today: back allowed (older entries exist), forward not');
  // Compute the expected clock text with clock() itself. The app renders times in the DEVICE's timezone
  // (clock() uses Date#getHours), so a hard-coded "10:30" only passes on a machine whose local zone is
  // America/Chicago — it fails on a UTC box. Everything else in this suite derives its expectations, which
  // is why this was the only assertion that broke.
  if (!h.includes(`since ${clock(L(12, 10, 30))} · now — change it on Now`)) throw new Error(`the live status must show on today, pointing to Now (got ${(h.match(/since [^<]*/) || ['?'])[0]})`);
  // 3. edit panel: big steppers, delete inside, all behind an inert screen
  setLaunchNotice(false);
  openSheet({ kind: 'edit', seg: day[2] });
  h = out('log/edit panel');
  // (since the editor redesign, 2026-10-13, tapping an entry asks what is wrong with it; the steppers are a step away)
  if (!/What do you want to fix\?/.test(h) || !/The times are wrong/.test(h)) throw new Error('tapping an entry opens the fix panel');
  if (!/Delete this entry/.test(h)) throw new Error('delete lives in the edit panel');
  if (!/<main[^>]*\binert\b/.test(h)) throw new Error('the Log must be inert behind the panel');
  openSheet({ kind: 'add' });
  if (!/What were you doing\?/.test(out('log/add panel'))) throw new Error('the add panel must open');
  openSheet(null);
  setLaunchNotice(true);
  // 4. the panel's actions: refuse the impossible, save, delete, undo
  if (saveEntry(day[2], { status: 'D', start: L(12, 10), end: L(12, 9) }, T) !== 'End must be after start.') throw new Error('an end before the start must be refused');
  if (!/End is after now/.test(saveEntry(day[2], { status: 'D', start: L(12, 6, 30), end: L(12, 11) }, T) ?? '')) throw new Error('an end after now must be refused');
  if (saveEntry(day[2], { status: 'D', start: L(12, 6, 30), end: L(12, 9, 45) }, T) !== null) throw new Error('a valid edit must save');
  if (!gs().segments.some((x) => x.status === 'D' && x.end === L(12, 9, 45))) throw new Error('the edit must change the entry');
  if (!/^Edited Driving/.test(currentUndo()?.label ?? '')) throw new Error('an edit must be undo-able');
  const before = gs().segments.length;
  deleteEntry(gs().segments.find((x) => x.status === 'D' && x.end === L(12, 9, 45)));
  if (gs().segments.length !== before - 1 || !/^Deleted Driving/.test(currentUndo()?.label ?? '')) throw new Error('delete must remove the entry and offer undo');
  if (!undoLast()) throw new Error('the undo for the delete must still be valid');
  if (gs().segments.length !== before) throw new Error('undo must put it back');
  if (addEntry('SB', L(12, 1), L(12, 3), T) !== null || !gs().segments.some((x) => x.status === 'SB' && x.start === L(12, 1))) throw new Error('add must append the entry');
  if (!/End is after now/.test(addEntry('OFF', T - 10, T + 10, T) ?? '')) throw new Error('add must refuse time that has not happened');
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], current: null });
  console.log('redesign 3 (Log day view, edit and add panels): OK');
}
// --- redesign 4: "Can I take this load?" as three questions and an answer
{
  const { getState: gs, DEFAULT_LOADCHECK: DL, parseSaved: ps } = await import('../src/store.ts');
  const L = (d, h, m = 0) => Math.floor(Date.UTC(2026, 9, d, h + 5, m) / 60000); // Oct d, CDT
  const T = L(12, 10);
  setState({ nowOverride: T, historyAcknowledged: true, tentative: [], current: { status: 'ON', since: L(12, 9), createdAt: 2 },
    segments: [{ status: 'OFF', start: L(11, 20), end: L(12, 9), createdAt: 1 }],
    config: { ...gs().config, timeZone: 'America/Chicago', dayStartHour: 0 }, loadCheck: { ...DL } });
  // 1. a new question starts at question 1, one thing on screen
  setState({ tab: 'load' });
  let h = out('load/question 1');
  if (!/How far is the load\?/.test(h) || !/1 of 3/.test(h)) throw new Error('an unanswered load check must open on question 1');
  if (/Verdict|How it goes/.test(h)) throw new Error('question 1 must not show the answer yet');
  if (!/aria-label="Add 50 miles"/.test(h) || !/aria-label="Take off 10 miles"/.test(h)) throw new Error('the miles steppers need spoken labels');
  if (!/<b>1200<\/b> mi/.test(h)) throw new Error('the big number must show the current miles');
  // 2. once answered it opens on the answer, with each answer changeable
  setState({ loadCheck: { ...DL, miles: 300, dwell: 60, answered: true } });
  h = out('load/answer');
  if (!/Yes, it’s legal/.test(h)) throw new Error('300 mi on a fresh 10-hour rest is legal');
  if (!/Load distance<\/span><b>300 mi<\/b>/.test(h) || !/At the receiver<\/span><b>1h 00m on duty<\/b>/.test(h) || !/Leaving<\/span><b>now<\/b>/.test(h)) throw new Error('the answer must list what it was asked');
  if ((h.match(/>Change</g) || []).length !== 3) throw new Error('each of the three answers needs its own Change');
  if (!/Unloaded by/.test(h) || !/How it goes/.test(h)) throw new Error('the answer must keep the unload time and the plan');
  // 3. waiting to leave is planned as what he said, and said back to him
  setState({ loadCheck: { ...gs().loadCheck, leaveIn: 60, waitOff: false } });
  h = out('load/leave in an hour, on duty');
  if (!/Leaving<\/span><b>in 1h 00m, on duty till then<\/b>/.test(h)) throw new Error('a later departure must be stated with its duty status');
  if (!/On duty until departure/.test(h)) throw new Error('the wait must show in the plan as an assumed on-duty row');
  // the row's colour dot is its duty status; the label alone could say "off" while planning "on"
  const waitDot = (x) => (x.match(/background:\s*([^;"]+)[^>]*><\/span><span><b>[^<]*<\/b> (?:On|Off) duty until departure/) || [])[1];
  const onDot = waitDot(h);
  setState({ loadCheck: { ...gs().loadCheck, waitOff: true } });
  h = out('load/leave in an hour, off duty');
  if (!/Off duty until departure/.test(h)) throw new Error('an off-duty wait must be labelled off duty');
  if (!onDot || !waitDot(h) || onDot === waitDot(h)) throw new Error(`an off-duty wait must be planned as off duty, not just labelled (dots ${onDot} / ${waitDot(h)})`);
  // 4. the answer survives a reload, but the app still opens on Now
  const saved = ps(JSON.stringify({ ...gs(), tab: 'load', loadCheck: { ...DL, miles: 450, answered: true } }));
  if (saved.tab !== 'now' || saved.loadCheck.miles !== 450 || saved.loadCheck.answered !== true) throw new Error('the load answer must persist; the app must open on Now');
  const old = ps(JSON.stringify({ segments: [], loadCheck: { miles: 333, dwell: 30, dwellOff: true } }));
  if (old.loadCheck.miles !== 333 || old.loadCheck.leaveIn !== 0 || old.loadCheck.answered !== false) throw new Error('a load check saved before the redesign must load with the new fields defaulted');
  // 5. reachable from Plan, Now and Recap; Recap no longer carries its own copy
  setState({ tab: 'plan' });
  if (!/Can I take this load\?/.test(out('plan/load link'))) throw new Error('Plan must offer the load question');
  setState({ tab: 'now', current: { status: 'ON', since: L(12, 9), createdAt: 2 } });
  // patch 7.1: the quick row's smaller duplicate "Take a load?" button is gone — Now offers the
  // load question through the prominent plan-item entry patch 7 put under the hero. The invariant
  // this line guards (Now must offer the load question) is unchanged; the patch 7.1 section at
  // the end of this file pins the duplicate's absence.
  if (!/Can I take this load\?/.test(out('now/load link'))) throw new Error('Now must offer the load question');
  setState({ tab: 'recap' });
  h = out('recap/load link');
  if (!/Can I take this load\?/.test(h)) throw new Error('Recap must link to the load question');
  if (/Load distance|Verdict/.test(h)) throw new Error('Recap must not carry a second copy of the load checker');
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], current: null, loadCheck: { ...DL } });
  console.log('redesign 4 (load question as steps): OK');
}
// --- redesign 5: the typeface is self-hosted, licensed, and precached for offline use
{
  const { readFileSync, existsSync, statSync } = await import('node:fs');
  const css = readFileSync('public/styles.css', 'utf8'), sw = readFileSync('public/sw.js', 'utf8');
  const faces = css.match(/@font-face\s*\{[^}]*\}/g) || [];
  if (faces.length < 4) throw new Error(`expected 4 @font-face rules, saw ${faces.length}`);
  for (const f of faces) {
    const src = (f.match(/url\(['"]?([^'")]+)/) || [])[1];
    if (!src || /^(https?:)?\/\//.test(src)) throw new Error(`a font must be served from the app itself, not ${src}`);
    if (!existsSync('public/' + src) || statSync('public/' + src).size < 5000) throw new Error(`font file missing or empty: ${src}`);
    if (!sw.includes(`'./${src}'`)) throw new Error(`sw.js does not precache ${src}, so it would be missing offline`);
    if (!/font-display:\s*swap/.test(f)) throw new Error('fonts must not hide text while they load');
  }
  if (!/Open Font License/.test(readFileSync('public/fonts/OFL.txt', 'utf8'))) throw new Error('the font licence must ship with the font');
  // the cab look adds the Mono readout face: its own licence ships too, and both families are declared
  if (!/Open Font License/.test(readFileSync('public/fonts/OFL-mono.txt', 'utf8'))) throw new Error('the Mono licence must ship with the Mono font');
  if (!faces.some((f) => /Atkinson Hyperlegible Mono/.test(f)) || !faces.some((f) => /Atkinson Hyperlegible Next/.test(f))) throw new Error('both typefaces must be declared');
  if (!/font:[^;]*"Atkinson Hyperlegible Next",[^;]*sans-serif/.test(css)) throw new Error('the body must use the font, with a system fallback');
  if (/fonts\.googleapis|fonts\.gstatic/.test(css + readFileSync('public/index.html', 'utf8'))) throw new Error('no outside font service: nothing leaves the phone');
  console.log('redesign 5 (typeface): OK');
}
// --- report fixes: Lorico, 2026-10-10, looking at the redesign live on the preview ---
{
  // 1. "PC, yard move, or started earlier…" must LOOK tappable. It also carries `link`, which zeroes the
  // border and background; same specificity means only the properties dock-more sets survive, so that rule
  // has to re-state them or the opener renders as bare text a driver will never think to tap.
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  const rule = (css.match(/button\.dock-more \{[^}]*\}/) || [''])[0];
  if (!/border:\s*1px solid/.test(rule)) throw new Error(`the "PC, yard move, or started earlier" opener must draw a border — without one a driver cannot tell it is a button (rule: ${rule || 'MISSING'})`);
  if (!/background:\s*var\(--panel2\)/.test(rule)) throw new Error('the status-panel opener must draw a background — it reads as plain text without one');
  // The active status button reaches 5px past its own box (outline-offset 2px + 3px outline) and the dock
  // has no bottom padding, so the opener needs at least that gap or the ring is drawn across its border.
  const gap = Number((rule.match(/margin-top:\s*(\d+)px/) || [0, 0])[1]);
  if (!(gap >= 5)) throw new Error(`the opener must sit clear of the active status button's ring — 2px outline-offset + 3px outline reaches 5px past its box, and a smaller gap draws the ring over this border (gap: ${gap}px)`);
  if (!/min-height:\s*44px/.test(rule)) throw new Error('the opener must keep its original 44px height — growing it crowds the dock it sits in');

  // 2. Details must not be a one-way door: after the peek, Now has to offer the way back, and it must work.
  // This harness renders to a string (preact-render-to-string), so it cannot dispatch a click. Both halves
  // are therefore checked: the button's WIRING at source level, and the view-switching MECHANISM behaviourally.
  // A behavioural-only version was vacuum: a way-back button wired to a no-op passed it.
  const appSrc = await readFile(new URL('../src/app.tsx', import.meta.url), 'utf8');
  const wiring = (appSrc.match(/onExitPeek=\{[^\n]*\}/) || [''])[0];
  if (!/setDrivingPeek\(null\)/.test(wiring)) throw new Error(`the way-back button must actually clear the peek — a button wired to nothing is not a way back (wiring: ${wiring || 'MISSING'})`);

  const { setDrivingPeek, setLaunchNotice } = await import('../src/app.tsx');
  const T = Math.floor(Date.UTC(2026, 9, 12, 15, 45) / 60000);
  const DRIVE_VIEW = /class="drive (calm|warn|bad)"/; // unique to DrivingView (HeroDrive uses .hero)
  setLaunchNotice(false);
  setState({ tab: 'now', drivingView: true, nowOverride: T, historyAcknowledged: true, tentative: [],
    segments: [{ status: 'OFF', start: T - 720, end: T - 120, createdAt: 1 }], current: { status: 'D', since: T - 120, createdAt: 2 } });
  setDrivingPeek(null);
  if (!DRIVE_VIEW.test(render(h(App, {})))) throw new Error('driving, big view on: the driving view must show');
  setDrivingPeek(T - 120); // the driver tapped Details
  const peeked = render(h(App, {}));
  if (DRIVE_VIEW.test(peeked)) throw new Error('after Details the peek must show the normal Now screen');
  if (!/Back to the driving view/.test(peeked)) throw new Error('after tapping Details, Now must offer a way back to the driving view — otherwise the glance screen is lost for the rest of the drive');
  setDrivingPeek(null); // the driver tapped the way back
  if (!DRIVE_VIEW.test(render(h(App, {})))) throw new Error('the way back must actually restore the driving view');

  setDrivingPeek(null); setLaunchNotice(true);
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], current: null });
  console.log('report fixes (opener affordance, way back from Details): OK');
}
// --- re-check N2: an undo must never throw away changes made after it
{
  const { saveEntry, addEntry, deleteEntry, tapStatus, currentUndo, undoLast, startOver } = await import('../src/app.tsx');
  const { getState: gs } = await import('../src/store.ts');
  const T = Math.floor(Date.UTC(2026, 9, 10, 16, 0) / 60000);
  const rows = () => gs().segments.map((x) => `${x.status}@${x.start}-${x.end}`).sort().join(',');
  setState({ nowOverride: T, historyAcknowledged: true, tentative: [], current: { status: 'ON', since: T - 120, createdAt: 3 },
    segments: [{ status: 'OFF', start: T - 1200, end: T - 480, createdAt: 1 }, { status: 'D', start: T - 480, end: T - 120, createdAt: 2 }] });
  // the tester's repro: edit, add, then a status tap on Now; the edit's undo must be gone, and nothing lost
  if (saveEntry(gs().segments[1], { status: 'D', start: T - 475, end: T - 120 }, T) !== null) throw new Error('the edit should save');
  if (!currentUndo()) throw new Error('an edit must be undo-able');
  if (addEntry('SB', T - 1100, T - 1000, T) !== null) throw new Error('the add should save');
  if (!/^Added Sleeper/.test(currentUndo()?.label ?? '')) throw new Error('an add must be undo-able, and replace the edit\'s undo');
  tapStatus('OFF');
  const kept = rows();
  if (currentUndo() !== null) throw new Error('a status tap changes the record, so the pending undo must be retired');
  if (undoLast() !== false || rows() !== kept) throw new Error('a stale undo must change nothing');
  if (!gs().segments.some((x) => x.status === 'SB') || !gs().segments.some((x) => x.status === 'ON' && x.end === T)) throw new Error('the added entry and the closed On Duty row must survive');
  // an undo that is still current works, including for an add
  if (addEntry('OFF', T - 30, T - 20, T) !== null || !undoLast() || rows() !== kept) throw new Error('undoing an add must remove exactly that add');
  // a delete then another delete: only the last can be undone, and the undo restores only that one
  deleteEntry(gs().segments.find((x) => x.status === 'SB'));
  const afterFirst = rows();
  deleteEntry(gs().segments.find((x) => x.status === 'D'));
  if (!undoLast() || rows() !== afterFirst) throw new Error('undo must restore only the last delete');
  // start over is undo-able too, current status included
  const curBefore = gs().current;
  startOver(T);
  if (gs().segments.length !== 1 || !undoLast() || rows() !== afterFirst || gs().current !== curBefore) throw new Error('start over must be undo-able, current status included');
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], current: null });
  console.log('re-check N2 (undo never eats later changes): OK');
}
// --- re-check N3: alerts must not go silent when the app is reopened while driving
{
  const { sound, unlockAudio, audioReady, clearPendingSound, audioForTest } = await import('../src/alerts.ts');
  const { soundNote, setLaunchNotice, setDrivingPeek } = await import('../src/app.tsx');
  let tones = 0;
  class FakeAC { constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createOscillator() { tones++; return { type: '', frequency: {}, connect: (g) => g, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (d) => d }; } }
  audioForTest.reset();
  // before any tap: nothing can play, so the alert waits instead of being lost
  sound(false); sound(true);
  if (tones !== 0 || audioForTest.pending() !== true) throw new Error('an alert before the first tap must wait, the urgent one winning');
  globalThis.window = { AudioContext: FakeAC };
  unlockAudio();
  if (tones !== 3 || audioForTest.pending() !== null) throw new Error(`the waiting alert must play once on the first tap (tones ${tones})`);
  if (!audioReady()) throw new Error('after a tap, sound is ready');
  unlockAudio();
  if (tones !== 3) throw new Error('a second tap must not replay the alert');
  sound(false);
  if (tones !== 5) throw new Error('once unlocked, an alert plays straight away');
  // a waiting alert is dropped when the driver stops driving before tapping
  audioForTest.reset(); sound(true); clearPendingSound(); unlockAudio();
  if (tones !== 5) throw new Error('a stale alert must not play after the driver stopped driving');
  delete globalThis.window; audioForTest.reset();
  // the screen must not claim sound is on before it is
  if (soundNote(true, false) === soundNote(true, true) || !/tap the screen/.test(soundNote(true, false))) throw new Error('before a tap the driving view must say sound is off');
  if (soundNote(false, true) !== 'alerts off') throw new Error('alerts off stays alerts off');
  setLaunchNotice(false); setDrivingPeek(null);
  const T = Math.floor(Date.UTC(2026, 9, 10, 16, 0) / 60000);
  setState({ nowOverride: T, tab: 'now', drivingView: true, alertsOn: true, historyAcknowledged: true, tentative: [],
    segments: [{ status: 'OFF', start: T - 1400, end: T - 670 }], current: { status: 'D', since: T - 670 } });
  const h = out('driving view before any tap');
  if (!/sound is off until you tap the screen once/.test(h) || /sound and vibration on/.test(h)) throw new Error('the driving view must not say "sound and vibration on" before sound can play');
  setLaunchNotice(true);
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], current: null });
  console.log('re-check N3 (alerts after reopening): OK');
}
// --- re-check N1: the terminal-zone question must start from the zone already saved
{
  const { deviceTz: dz, parseSaved: ps } = await import('../src/store.ts');
  const other = dz === 'America/New_York' ? 'America/Denver' : 'America/New_York';
  // a save from before the question existed: no tzChosen, terminal zone not the phone's
  const legacy = ps(JSON.stringify({ segments: [], config: { cycle: '70/8', dayStartHour: 0, timeZone: other, shortHaul: false }, themeChosen: true }));
  if (legacy.tzChosen !== false || legacy.config.timeZone !== other) throw new Error('setup: a legacy save keeps its zone and is asked to confirm it');
  setState({ ...legacy, tab: 'now' });
  const h = out('legacy save, terminal zone not the phone zone');
  if (!new RegExp(`It is set to <b>${other}</b>`).test(h)) throw new Error('the question must name the zone actually saved');
  if (!new RegExp(`Your phone's zone right now is <b>${dz}</b>`).test(h)) throw new Error('and name the phone zone separately when they differ');
  const field = (h.match(/<input[^>]*aria-label="Home terminal time zone"[^>]*>/) || [''])[0];
  if (!field.includes(`value="${other}"`)) throw new Error(`the field must be pre-filled with the saved zone, so "I understand" keeps it (saw ${field})`);
  setState({ tzChosen: true, config: { ...getState().config, timeZone: dz } });
  console.log('re-check N1 (terminal-zone question keeps the saved zone): OK');
}
// --- re-check N6: the Log's day is the terminal's day, and its date is read in the terminal zone
{
  const { deviceTz: dz } = await import('../src/store.ts');
  const { setLaunchNotice } = await import('../src/app.tsx');
  setLaunchNotice(false);
  // a terminal zone well east of any test runner's zone: its midnight is the day before on the phone
  const east = 'Pacific/Kiritimati'; // UTC+14
  const T = Math.floor(Date.UTC(2026, 9, 10, 15, 0) / 60000); // Sat Oct 10 15:00 UTC = Sun Oct 11 05:00 in Kiritimati
  setState({ nowOverride: T, tab: 'log', tzChosen: true, historyAcknowledged: true, segments: [], tentative: [], current: { status: 'ON', since: T - 60 },
    config: { ...getState().config, timeZone: east, dayStartHour: 0 } });
  let h = out('log/terminal far east');
  if (!/Today, Sun, Oct 11/.test(h)) throw new Error(`the carrier day must carry the terminal's date (${(h.match(/Today, [^<]*/) || [''])[0]})`);
  if (dz !== east && !/Carrier day from 00:00 Pacific\/Kiritimati · [A-Z][a-z]{2} \d\d:\d\d on this phone/.test(h)) throw new Error('with two zones, say when the day rolls on the phone clock');
  // one zone: no extra words
  setState({ config: { ...getState().config, timeZone: dz } });
  h = out('log/one zone');
  if (/on this phone/.test(h)) throw new Error('with one zone the subtitle stays short');
  setLaunchNotice(true);
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], current: null });
  console.log('re-check N6 (Log date in the terminal zone): OK');
}
// --- re-check: the zone field saves only listed city names
{
  const { listedZone } = await import('../src/store.ts');
  const { setLaunchNotice } = await import('../src/app.tsx');
  for (const z of ['EST', 'MST', 'CST', 'Etc/GMT+1', 'America/New', 'America/Chicag', '']) if (listedZone(z) !== null) throw new Error(`"${z}" must not be accepted as a terminal zone`);
  if (listedZone(' america/chicago ') !== 'America/Chicago') throw new Error('a listed zone in any letter case is accepted, spelled properly');
  if (listedZone('utc') !== 'UTC') throw new Error('UTC is accepted');
  if (listedZone('US/Eastern') === null) throw new Error('an Area/City alias the browser knows (it follows daylight time) is accepted, for older browsers with a short list');
  // a zone saved before this check is kept, but the driver is told
  setLaunchNotice(false);
  setState({ tab: 'settings', tzChosen: true, config: { ...getState().config, timeZone: 'EST' } });
  const h = out('settings/short zone name saved');
  if (!/Your zone is saved as the short name &quot;<b>EST<\/b>&quot;/.test(h)) throw new Error('a saved short zone name must be flagged');
  setState({ config: { ...getState().config, timeZone: 'America/Chicago' } });
  if (/saved as the short name/.test(out('settings/listed zone'))) throw new Error('a listed zone is not flagged');
  setLaunchNotice(true);
  setState({ tab: 'now' });
  console.log('re-check (zone field: listed names only): OK');
}
// --- re-check N5: a what-if row can be edited
{
  const { saveEntry, currentUndo, undoLast, setLaunchNotice } = await import('../src/app.tsx');
  const { getState: gs } = await import('../src/store.ts');
  const T = Math.floor(Date.UTC(2026, 9, 10, 16, 0) / 60000);
  const plan = { status: 'SB', start: T + 60, end: T + 540, tentative: true, note: 'Break 1' };
  setState({ nowOverride: T, tab: 'log', historyAcknowledged: true, segments: [{ status: 'OFF', start: T - 700, end: T }], current: null, tentative: [plan] });
  if (saveEntry(plan, { status: 'SB', start: T + 60, end: T + 525 }, T) !== null) throw new Error('editing a what-if into the future must be allowed');
  const edited = gs().tentative[0];
  if (gs().tentative.length !== 1 || edited.end !== T + 525 || !edited.tentative || edited.note !== 'Break 1') throw new Error('the edit must change the what-if and keep it a what-if');
  if (!/^Edited Sleeper/.test(currentUndo()?.label ?? '') || !undoLast() || gs().tentative[0].end !== T + 540) throw new Error('a what-if edit is undo-able');
  // logged rows keep the rule
  if (!/End is after now/.test(saveEntry(gs().segments[0], { status: 'OFF', start: T - 700, end: T + 5 }, T) ?? '')) throw new Error('logged rows still stop at now');
  // the row says what it is to a screen reader
  setLaunchNotice(false);
  if (!/aria-label="Edit what-if Sleeper/.test(out('log/what-if row'))) throw new Error('a what-if row must say so in its label');
  setLaunchNotice(true);
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], tentative: [], current: null });
  console.log('re-check N5 (what-if rows can be edited): OK');
}
// --- re-check 2 (a tester) R1: a what-if plan may not be pushed back into logged time
{
  const { saveEntry, setLaunchNotice } = await import('../src/app.tsx');
  const { getState: gs, allSegments } = await import('../src/store.ts');
  const { evaluate: ev, normalize: nrm } = await import('../../engine/src/index.ts');
  const T = Math.floor(Date.UTC(2026, 9, 11, 18, 0) / 60000);
  const logged = [
    { status: 'OFF', start: T - 18 * 60, end: T - 7 * 60, createdAt: T - 5000 },
    { status: 'D', start: T - 7 * 60, end: T - 1 * 60, createdAt: T - 4000 },
  ];
  const live = { status: 'ON', since: T - 60, createdAt: T - 3000 };
  const plan = { status: 'OFF', start: T + 30, end: T + 90, tentative: true, createdAt: T - 2000 };
  setState({ nowOverride: T, tab: 'log', historyAcknowledged: true, segments: logged, current: live, tentative: [plan] });
  const cfg = gs().config;
  const before = ev(allSegments(gs(), T), { asOf: T, config: cfg });
  if (before.driveNow !== 300 || before.cycle.remaining !== 63 * 60) throw new Error(`the fixture must start at 5h / 63h left (got ${before.driveNow} / ${before.cycle.remaining})`);
  // the re-check's edit: "Started -15" x30, "Ended -15" x10 -- lands the what-if exactly on the drive
  const refused = saveEntry(plan, { status: 'OFF', start: plan.start - 450, end: plan.end - 150 }, T);
  if (!/what-if plan can only cover time from now on/.test(refused ?? '')) throw new Error(`a what-if must not be pushed into logged time (got ${JSON.stringify(refused)})`);
  if (gs().tentative[0].start !== plan.start || gs().tentative[0].end !== plan.end) throw new Error('a refused edit must leave the plan untouched');
  // and nothing may come of it: the 6h drive survives and every clock is where it was
  const after = ev(allSegments(gs(), T), { asOf: T, config: cfg });
  if (after.driveNow !== before.driveNow || after.cycle.remaining !== before.cycle.remaining || after.shift.windowRemaining !== before.shift.windowRemaining) {
    throw new Error('a refused what-if edit must not move a clock');
  }
  if (!nrm(allSegments(gs(), T)).some((r) => r.status === 'D' && r.end - r.start === 360)) throw new Error('the logged 6h drive must survive');
  // N5 still holds: a what-if inside the future is editable
  if (saveEntry(gs().tentative[0], { status: 'OFF', start: T + 45, end: T + 105 }, T) !== null) throw new Error('a future what-if must still be editable');
  setLaunchNotice(true);
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], tentative: [], current: null });
  console.log('re-check 2 R1 (a what-if cannot be pushed into logged time): OK');
}
// --- re-check 2 (a tester) R2: an imported draft the app cannot use is not merged in unchecked
{
  const { importProblem, applyImportedState, draftResets, getState: gs, DEFAULT_SPLIT, DEFAULT_LOADCHECK } = await import('../src/store.ts');
  const bad = { segments: [], split: { b1: 'abc', b1s: 'XX', dwell: -500, drive: 1e9, b2: null, b2s: 7 }, loadCheck: { miles: 10000000, leaveIn: -99999, dwell: 'x' } };
  if (importProblem(bad) !== null) throw new Error('this fixture\'s segment list is fine, so the file itself must stay importable');
  const cur = gs();
  const names = draftResets(bad, cur);
  if (!names.includes('the Split Lab plan') || !names.includes('the load question')) throw new Error(`the replaced drafts must be named so the message can say so (got ${JSON.stringify(names)})`);
  const applied = applyImportedState(cur, bad);
  // a value of the wrong type -> the default; a finite value outside the control's range -> clamped
  if (applied.split.b1 !== DEFAULT_SPLIT.b1 || applied.split.b2 !== DEFAULT_SPLIT.b2) throw new Error(`a Split Lab length that is not a number must fall back (got ${JSON.stringify(applied.split)})`);
  if (applied.split.dwell !== 0 || applied.split.drive !== 660) throw new Error(`out-of-range Split Lab lengths must be clamped to the control's range (got ${JSON.stringify(applied.split)})`);
  if (applied.split.b1s !== 'OFF' || applied.split.b2s !== 'SB') throw new Error('a Split Lab draft with an unknown break status must fall back to a legal one');
  if (applied.loadCheck.miles !== 3000 || applied.loadCheck.leaveIn !== 0) throw new Error(`out-of-range load numbers must be clamped to the control's range (got ${JSON.stringify(applied.loadCheck)})`);
  if (applied.loadCheck.dwell !== cur.loadCheck.dwell) throw new Error('a load duration that is not a number must fall back to what is on screen');
  if (applied.loadCheck.waitOff !== cur.loadCheck.waitOff || applied.loadCheck.dwellOff !== cur.loadCheck.dwellOff) throw new Error('a non-boolean flag must fall back to what is on screen');
  // merely out of range -> clamped to what the controls allow, not dropped
  const clamped = applyImportedState(cur, { segments: [], split: { ...DEFAULT_SPLIT, drive: 9999 }, loadCheck: { ...DEFAULT_LOADCHECK, miles: 9999 } });
  if (clamped.split.drive !== 660 || clamped.loadCheck.miles !== 3000) throw new Error(`out-of-range numbers must be clamped to the control's range (got ${clamped.split.drive}/${clamped.loadCheck.miles})`);
  // a bad trip draft, mph and live status have the same gap and get the same treatment
  const other = applyImportedState(cur, { segments: [], mph: 1e6, current: { status: 'XX', since: 'nope' }, trip: { miles: 1e9, until: 'NOPE', dep: 'not-a-date' } });
  if (other.mph !== 100) throw new Error(`an out-of-range mph must be clamped (got ${other.mph})`);
  if (other.current !== null) throw new Error('a live status with an unknown status and an unusable time must be dropped, not kept');
  if (other.trip.miles !== 5000 || other.trip.until !== cur.trip.until || other.trip.dep !== cur.trip.dep) throw new Error(`a bad trip draft must fall back field by field (got ${JSON.stringify(other.trip)})`);
  // the Split Lab plan built from the sanitized draft is a real plan, not a 1,900,000-year one
  const plan = [];
  let t = 0;
  const push = (status, m, note) => { if (m > 0) { plan.push({ status, start: t, end: t + m, tentative: true, note }); t += m; } };
  const sd = applied.split;
  push(sd.b1s, sd.b1, 'Break 1'); push('ON', sd.dwell, 'On duty'); push('D', sd.drive, 'Drive'); push(sd.b2s, sd.b2, 'Break 2');
  if (!plan.length || !plan.every((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)) throw new Error('the Split Lab plan must be made of real times');
  if (t > 3000) throw new Error(`the Split Lab plan spans ${t} minutes — a draft like that is what froze the screen`);
  // and M8 still holds: a file whose drafts are good comes back exactly as it went in
  const good = { segments: [], split: { b1: 210, b1s: 'SB', dwell: 45, drive: 300, b2: 420, b2s: 'OFF' }, loadCheck: { miles: 900, dwell: 60, dwellOff: true, leaveIn: 30, waitOff: false, answered: true } };
  const back = applyImportedState(cur, good);
  if (JSON.stringify(back.split) !== JSON.stringify(good.split)) throw new Error('a valid Split Lab draft must come back unchanged (M8)');
  if (JSON.stringify(back.loadCheck) !== JSON.stringify(good.loadCheck)) throw new Error('a valid load draft must come back unchanged (M8)');
  if (draftResets(good, cur).length !== 0) throw new Error('a clean file must not be reported as having replaced anything');
  console.log('re-check 2 R2 (imported drafts are checked before use): OK');
}
// --- re-check 2 (a tester) R3: a reload must not leave Back presses doing nothing
{
  const { createBackNav } = await import('../src/backnav.ts');
  // The suite's own fake history: go() lands later, as in a browser, and fires popstate once.
  const mk = () => {
    const h = { entries: [{ state: null }], i: 0, queued: [], left: false,
      get state() { return this.entries[this.i].state; },
      pushState(d) { this.entries.length = this.i + 1; this.entries.push({ state: d }); this.i++; },
      replaceState(d) { this.entries[this.i] = { state: d }; },
      go(n) { this.queued.push(n); },
      land(onPop) { while (this.queued.length) { const n = this.queued.shift(); const j = this.i + n; if (j < 0) { this.left = true; return; } this.i = j; onPop(); } },
      back(onPop) { this.go(-1); this.land(onPop); } };
    return h;
  };
  const h = mk();
  let tab = 'now', sheet = false;
  const nav = createBackNav(h, () => ({ tab, sheet }), { closeSheet: () => { sheet = false; }, goTo: (t) => { tab = t; } });
  // session 1: the driver goes Now -> Log -> Plan -> the load question, then the page reloads (or updates)
  nav.sync();
  tab = 'log'; nav.sync(); h.land(() => nav.onPop());
  tab = 'plan'; nav.sync(); h.land(() => nav.onPop());
  tab = 'load'; nav.sync(); h.land(() => nav.onPop());
  if (h.i !== 2) throw new Error(`session 1 should leave 2 app entries above the page, saw ${h.i}`);

  // the reload: same history, a fresh nav, the app opens on Now with nothing open
  let tab2 = 'now', sheet2 = false;
  const nav2 = createBackNav(h, () => ({ tab: tab2, sheet: sheet2 }), { closeSheet: () => { sheet2 = false; }, goTo: (t) => { tab2 = t; } });
  nav2.sync();
  if (h.queued.length === 0) throw new Error('a fresh load on one of our own entries must step back over the run');
  h.land(() => nav2.onPop());
  if (h.i !== 0) throw new Error(`the fresh load must end on the page entry below everything it left behind (index ${h.i})`);

  // the cleanup must not leave the nav believing a move of its own is still in flight, or every later
  // push is swallowed and Back stops working for the rest of the session
  tab2 = 'log'; nav2.sync();
  if (h.i !== 1) throw new Error('after the cleanup the nav must be able to push again');
  h.land(() => nav2.onPop());
  tab2 = 'now'; nav2.sync(); h.land(() => nav2.onPop());
  if (h.i !== 0) throw new Error('and it must still come back to the page entry');

  // so the FIRST Back press does what Back should: nothing is open, so the app is left
  h.back(() => nav2.onPop());
  if (!h.left) throw new Error('after a reload the first Back press must leave the app, not do nothing');

  // and an in-app move is not mistaken for a leftover: closing a panel still lands on our own entry
  const h3 = mk();
  let t3 = 'now', s3 = false;
  const nav3 = createBackNav(h3, () => ({ tab: t3, sheet: s3 }), { closeSheet: () => { s3 = false; }, goTo: (t) => { t3 = t; } });
  nav3.sync();
  t3 = 'log'; nav3.sync(); h3.land(() => nav3.onPop());
  s3 = true; nav3.sync(); h3.land(() => nav3.onPop());
  if (h3.i !== 2) throw new Error(`Log + a panel should sit 2 entries above the page, saw ${h3.i}`);
  s3 = false; nav3.sync(); h3.land(() => nav3.onPop());
  if (h3.i !== 1 || h3.left) throw new Error(`closing the panel must land on the Log entry, not leave (index ${h3.i})`);
  h3.back(() => nav3.onPop());
  if (t3 !== 'now') throw new Error('the next Back press must still return to Now');
  console.log('re-check 2 R3 (a reload does not swallow Back presses): OK');
}
// --- re-check: the screen lock is taken again after a drop; a simulated clock leaves no alert memory
{
  const { holdWakeLock, alertTick, nextAlert, NO_ALERTS } = await import('../src/alerts.ts');
  const tick = () => new Promise((r) => setTimeout(r, 0));
  let visible = true, requests = 0, onVis = null, timers = [];
  const locks = [];
  const env = {
    request: async () => { requests++; const l = { fns: [], released: false, release: async () => { l.released = true; }, addEventListener: (t, f) => l.fns.push(f) }; locks.push(l); return l; },
    visible: () => visible,
    onVisible: (f) => { onVis = f; return () => { onVis = null; }; },
    later: (f, ms) => timers.push([f, ms]),
  };
  const stop = holdWakeLock(env, 5000);
  await tick();
  if (requests !== 1) throw new Error('the lock is taken at once');
  // the system drops it while the app is on screen: try again later, not never
  locks[0].fns.forEach((f) => f());
  if (timers.length !== 1 || timers[0][1] !== 5000) throw new Error('a lock dropped while on screen must be retried');
  timers.shift()[0](); await tick();
  if (requests !== 2) throw new Error('the retry must take the lock again');
  // hidden: the browser drops it, no retry until the app is back on screen
  visible = false; locks[1].fns.forEach((f) => f());
  if (timers.length !== 0) throw new Error('no retry while the app is hidden');
  visible = true; onVis(); await tick();
  if (requests !== 3) throw new Error('coming back on screen takes the lock again');
  onVis(); await tick();
  if (requests !== 3) throw new Error('a lock already held is not requested twice');
  stop();
  if (!locks[2].released || onVis !== null) throw new Error('stop releases the lock and stops listening');
  locks[2].fns.forEach((f) => f());
  if (timers.length !== 0) throw new Error('a lock released by stop() is not retried');

  // a simulated clock never sounds and leaves nothing in the alert memory
  const driving = nextAlert(NO_ALERTS, true, 200, 1000).mem;
  const sim = alertTick(driving, true, 10, 1001, true);
  if (sim.fire !== null || sim.mem.prev !== null) throw new Error('a simulated tick must not sound or be remembered');
  // back on the real clock with 10 min left: like opening the app — no replay of 60/30/15 crossed in the jump
  const back = alertTick(sim.mem, true, 10, 1002, false);
  if (back.fire !== null) throw new Error('returning from a simulated clock must not fire marks crossed by the jump');
  if (alertTick(sim.mem, true, 0, 1002, false).fire !== 0) throw new Error('but out of time still alerts at once');
  console.log('re-check (screen lock retry, simulated clock): OK');
}
// --- re-check M11: the phone's Back button steps back through the app before leaving it
{
  const { createBackNav } = await import('../src/backnav.ts');
  // a fake browser history: go() lands later (as in a browser) and fires popstate
  const mk = () => {
    const h = { entries: [{ state: null }], i: 0, queued: [], left: false,
      get state() { return this.entries[this.i].state; },
      pushState(d) { this.entries.length = this.i + 1; this.entries.push({ state: d }); this.i++; },
      replaceState(d) { this.entries[this.i] = { state: d }; },
      go(n) { this.queued.push(n); },
      land(onPop) { while (this.queued.length) { const n = this.queued.shift(); const j = this.i + n; if (j < 0) { this.left = true; return; } this.i = j; onPop(); } },
      back(onPop) { this.go(-1); this.land(onPop); } };
    return h;
  };
  const h = mk();
  let tab = 'now', sheet = false;
  const nav = createBackNav(h, () => ({ tab, sheet }), { closeSheet: () => { sheet = false; }, goTo: (t) => { tab = t; } });
  const pop = () => nav.onPop();
  const ui = (t, sh) => { if (t !== undefined) tab = t; if (sh !== undefined) sheet = sh; nav.sync(); h.land(pop); };
  nav.sync();
  if (h.entries.length !== 1) throw new Error('on Now with nothing open, nothing is added to history');
  // Now -> Plan -> Load, open a panel; then press Back four times
  ui('plan'); ui('load'); ui(undefined, true);
  if (h.i !== 3) throw new Error(`expected 3 app entries above the page, saw ${h.i}`);
  h.back(pop); if (sheet !== false || tab !== 'load') throw new Error('Back must first close the panel');
  h.back(pop); if (tab !== 'plan') throw new Error('then step back from the load question to Plan');
  h.back(pop); if (tab !== 'now') throw new Error('then return to Now');
  h.back(pop); if (!h.left) throw new Error('and only then leave the app');
  // closing things inside the app removes their entries, so Back never lands on a ghost
  const h2 = mk(); tab = 'now'; sheet = false;
  const nav2 = createBackNav(h2, () => ({ tab, sheet }), { closeSheet: () => { sheet = false; }, goTo: (t) => { tab = t; } });
  const pop2 = () => nav2.onPop();
  const ui2 = (t, sh) => { if (t !== undefined) tab = t; if (sh !== undefined) sheet = sh; nav2.sync(); h2.land(pop2); };
  ui2('log'); ui2(undefined, true); ui2(undefined, false); // panel opened and closed with its own button
  if (h2.i !== 1) throw new Error('a panel closed in the app must take its history entry with it');
  ui2('recap'); if (h2.i !== 1) throw new Error('moving between tabs must not pile up entries');
  ui2('now'); if (h2.i !== 0) throw new Error('tapping Now in the tab bar must remove the tab entry');
  ui2(undefined, true); h2.back(pop2);
  if (sheet !== false || tab !== 'now' || h2.left) throw new Error('on Now, Back closes the panel without leaving');
  // a reload on top of old entries steps back OVER them, rather than just forgetting the mark: an entry
  // left behind is one the driver would otherwise press Back through for nothing (re-check 2, R3).
  const h3 = mk(); h3.pushState({ app: 'hos-sandbox', layer: 'tab' }, '');
  createBackNav(h3, () => ({ tab: 'now', sheet: false }), { closeSheet() {}, goTo() {} });
  if (h3.queued.length !== 1 || h3.queued[0] !== -1) throw new Error(`a fresh load on an old entry must step back over it (got ${JSON.stringify(h3.queued)})`);
  h3.land(() => {});
  if (h3.state !== null || h3.i !== 0) throw new Error('the leftover entry must be left behind, not counted as ours');
  console.log('re-check M11 (Back button): OK');
}
// --- re-check M9: the Split Lab hint reads the record in time order, not entry order
{
  const { DEFAULT_SPLIT: DS } = await import('../src/store.ts');
  const { setLaunchNotice } = await import('../src/app.tsx');
  setLaunchNotice(false);
  const T = Math.floor(Date.UTC(2026, 9, 10, 16, 0) / 60000);
  const rows = [
    { status: 'OFF', start: T - 2000, end: T - 1000, createdAt: 1 },
    { status: 'OFF', start: T - 700, end: T, createdAt: 2 },
    // a forgotten drive added afterwards: last in the list, but not the latest in time
    { status: 'D', start: T - 1000, end: T - 700, createdAt: 3 },
  ];
  setState({ nowOverride: T, tab: 'split', historyAcknowledged: true, tentative: [], current: null, segments: rows, split: { ...DS } });
  let h = out('split/forgotten entry added last');
  if (!/Break 1 runs straight into the rest/.test(h)) throw new Error('the driver is resting now, so Break 1 merges with that rest, whatever order the rows were entered in');
  // same record, entered in time order: same answer
  setState({ segments: [rows[0], rows[2], rows[1]] });
  h = out('split/rows in time order');
  if (!/Break 1 runs straight into the rest/.test(h)) throw new Error('setup: in time order the hint shows');
  setLaunchNotice(true);
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], current: null });
  console.log('re-check M9 (Split Lab hint in time order): OK');
}
// --- re-check: grid hour marks stay on real hours on the days the clocks change
{
  const { gridTicks } = await import('../src/app.tsx');
  const { carrierDayStart, nextCarrierDayStart } = await import('../../engine/src/index.ts');
  const cfg = { cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false };
  const at = (iso) => Math.floor(new Date(iso).getTime() / 60000);
  for (const [label, noon, hours] of [['fall back, Nov 1', '2026-11-01T18:00:00Z', 25], ['spring forward, Mar 8', '2026-03-08T18:00:00Z', 23], ['ordinary day', '2026-10-10T17:00:00Z', 24]]) {
    const from = carrierDayStart(at(noon), cfg), to = nextCarrierDayStart(from, cfg);
    if (to - from !== hours * 60) throw new Error(`setup: ${label} is ${hours}h`);
    const t = gridTicks(from, to, cfg.timeZone);
    if (t.length !== hours + 1 || t.some((k, i) => k.m !== from + i * 60)) throw new Error(`${label}: one mark per real hour`);
    const majors = t.filter((k) => k.major).map((k) => new Intl.DateTimeFormat('en-US', { timeZone: cfg.timeZone, hour: 'numeric', hourCycle: 'h23' }).format(new Date(k.m * 60000))).map(Number);
    if (majors.some((h) => h % 6 !== 0) || !majors.includes(6) || !majors.includes(12) || !majors.includes(18)) throw new Error(`${label}: heavy marks on 06/12/18 local (saw ${majors})`);
  }
  console.log('re-check (grid hours on clock-change days): OK');
}
// --- driver question (2026-10-10): is the break time a start or a finish? And the dock must rest in one place
{
  const { openSheet, setLaunchNotice } = await import('../src/app.tsx');
  const { readFileSync } = await import('node:fs');
  const T = Math.floor(Date.UTC(2026, 9, 10, 19, 42) / 60000);
  setLaunchNotice(false);
  setState({ nowOverride: T, tab: 'now', drivingView: false, historyAcknowledged: true, tentative: [],
    segments: [{ status: 'OFF', start: T - 900, end: T - 300 }, { status: 'D', start: T - 300, end: T - 100 }, { status: 'OFF', start: T - 100, end: T - 5 }],
    current: { status: 'D', since: T - 5 } });
  openSheet({ kind: 'why' });
  let h = out('why/break row');
  const row = (h.match(/<li[^>]*>(?:(?!<\/li>)[\s\S])*30-minute break(?:(?!<\/li>)[\s\S])*<\/li>/) || [''])[0];
  if (!/<small>latest start<\/small>/.test(row)) throw new Error('the break time must say it is the latest START, not a finish');
  if (!/before your driving adds up to 8 hours/.test(row) || !/any time before then/.test(row)) throw new Error('the break text must say it can come any time before 8 hours of driving');
  if (!/on duty without driving/.test(row)) throw new Error('the break text must say on-duty time that is not driving counts');
  openSheet(null);
  h = out('now/meters');
  if (!/30-min break<\/span>[\s\S]{0,400}?due in 7h 55m/.test(h)) throw new Error('the meter says the break is DUE in a time, not that it happens then');
  // the dock rests where it sticks: Now's <main> bottom padding equals the dock's sticky offset
  if (!/<main[^>]*class="has-dock"/.test(h)) throw new Error('Now must mark its main as holding the dock');
  const css = readFileSync('public/styles.css', 'utf8');
  const stick = (css.match(/\.dock \{[^}]*bottom: ([^;]+);/) || [])[1], pad = (css.match(/main\.has-dock \{ padding-bottom: ([^;]+);/) || [])[1];
  if (!stick || stick !== pad) throw new Error(`the dock's sticky offset (${stick}) and Now's bottom padding (${pad}) must match, or the dock jumps at the end of the page`);
  if (!/\.dock \{[^}]*padding: 8px 12px 12px/.test(css)) throw new Error('the dock keeps its own gap above the tab bar');
  setLaunchNotice(true); setState({ nowOverride: null, drivingView: true, historyAcknowledged: false, segments: [], current: null });
  console.log('driver question (break wording, dock rests in one place): OK');
}
// --- the cab look (2026-10-12): dials, backlit keys, the status capsule, the sleeper colour
{
  const { dialGeometry, setLaunchNotice, setDrivingPeek, openSheet } = await import('../src/app.tsx');
  const { STATUS_COLOR, getState: gs } = await import('../src/store.ts');
  const { readFileSync } = await import('node:fs');
  // 1. dial geometry: a fuel gauge over 270°, the scale outside the arc
  const S = 300, c = S / 2, r = S * 0.4, sw = S * 0.05;
  const full = dialGeometry(1, 11, S), empty = dialGeometry(0, 11, S), half = dialGeometry(0.5, 11, S);
  if (full.fill !== full.track) throw new Error('a full limit must fill the whole arc');
  if (empty.fill !== null) throw new Error('an empty limit draws no fill (and no cap)');
  if (Math.abs(half.end.x - c) > 0.01 || Math.abs(half.end.y - (c - r)) > 0.01) throw new Error(`half left must end at the top of the dial (got ${half.end.x},${half.end.y})`);
  if (dialGeometry(1.7, 11, S).fill !== full.track || dialGeometry(-1, 11, S).fill !== null) throw new Error('the share is clamped to 0–1');
  if (full.ticks.length !== 12 || dialGeometry(1, 14, S).ticks.length !== 15 || dialGeometry(1, 70, S).ticks.length !== 8) throw new Error('one mark per hour (11h: 12, 14h: 15), one per 10h for the week (70h: 8)');
  for (const t of dialGeometry(0.3, 14, S).ticks) {
    const d = Math.hypot(t.x1 - c, t.y1 - c);
    if (d < r + sw * 0.65) throw new Error('scale marks must sit outside the arc, never across the number');
  }
  if (full.scale.max !== '11h' || dialGeometry(1, 70, S).scale.max !== '70h') throw new Error('the scale is labelled with the limit');

  // 2. Now: the hero is a dial of the binding limit, the limit on a plate under it
  const T = Math.floor(Date.UTC(2026, 9, 12, 19, 0) / 60000);
  setLaunchNotice(false); setDrivingPeek(null);
  setState({ nowOverride: T, tab: 'now', drivingView: true, historyAcknowledged: true, tentative: [],
    segments: [{ status: 'OFF', start: T - 900, end: T - 210 }, { status: 'D', start: T - 210, end: T }], current: { status: 'ON', since: T } });
  let h = out('now/cab dial');
  if (!/<section class="hero"><div class="dial calm">/.test(h)) throw new Error('Now leads with the dial');
  if (!/<path class="dial-fill"/.test(h) || !/<circle class="dial-cap"/.test(h)) throw new Error('the dial shows what is left');
  // 3h30 driven: the 30-minute break binds first (4h30 left of 8h), so the dial is the break's
  if (!/class="dial-center"><div class="hero-label">You can drive<\/div><div class="hero-value good">4h 30m<\/div>/.test(h)) throw new Error('the number sits in the middle of the dial');
  if (!/<span class="limit-plate">limited by 8 hours of driving \(30-min break in 4h 30m\)<\/span>/.test(h)) throw new Error('the binding limit is named on the plate under the dial');
  if (!/<text class="dial-scale"[^>]*>8h<\/text>/.test(h)) throw new Error('the dial is scaled to the limit that binds (the break: 8h)');
  // the RENDERED arc must be the driver's real share (4h30 left of the 8h break rule), not just "a fill":
  // a dial wired to a constant reads full while the driver runs out. The share is a literal here on
  // purpose -- recomputing it through bindingShare() would test the wiring against itself.
  if (!h.includes(`class="dial-fill" d="${dialGeometry(270 / 480, 8, 270).fill}"`)) throw new Error('Now\'s dial must show the share of the binding limit that is left (4h 30m of 8h)');
  // 3. keys and capsule: LED colour through --led, not a coloured slab; the lit key also carries a check
  if (!/class="pill" style="--led: var\(--warn\)"/.test(h)) throw new Error('the status capsule takes its LED colour from the status');
  if (!/style="--led: var\(--sb\)"[^>]*aria-pressed="false"/.test(h)) throw new Error('the Sleeper key is lit in the sleeper colour');
  if (!/style="--led: var\(--warn\)" class="on" aria-pressed="true"><svg/.test(h)) throw new Error('the current status key is marked on, pressed, with a check — not by colour alone');
  if (/class="status-buttons"[\s\S]{0,400}background: var\(--/.test(h)) throw new Error('the status keys are no longer solid colour slabs');
  if (!/class="muted clock"/.test(h)) throw new Error('the header clock uses the readout face');
  // 4. the driving view: the same dial, amber at 45 min, red at zero, no bar
  // 10h15 driven with a 30-min break after 5h: the 11-hour limit binds, 45 min left
  setState({ current: { status: 'D', since: T }, segments: [{ status: 'OFF', start: T - 1400, end: T - 645 }, { status: 'D', start: T - 645, end: T - 345 }, { status: 'OFF', start: T - 345, end: T - 315 }, { status: 'D', start: T - 315, end: T }] });
  h = out('drive/cab dial 45m');
  if (!/<main class="drive warn"[\s\S]*<div class="dial warn">/.test(h)) throw new Error('45 min left: the driving dial turns amber');
  if (!/class="dial-center"><div class="drive-label">Driving left<\/div><div class="drive-num short">45m<\/div>/.test(h)) throw new Error('the driving number sits in the dial');
  // and its arc is the real share: 45 min left of the 11-hour limit (a full dial here would lie)
  if (!h.includes(`class="dial-fill" d="${dialGeometry(45 / 660, 11, 320).fill}"`)) throw new Error('the driving dial must show the share of the binding limit that is left (45m of 11h)');
  if (/drive-bar/.test(h)) throw new Error('the dial replaces the old bar');
  setState({ segments: [{ status: 'OFF', start: T - 1400, end: T - 690 }, { status: 'D', start: T - 690, end: T - 390 }, { status: 'OFF', start: T - 390, end: T - 360 }, { status: 'D', start: T - 360, end: T }] });
  h = out('drive/cab dial 0');
  if (!/<div class="dial bad">/.test(h) || /class="dial-fill"/.test(h)) throw new Error('out of time: a red, empty dial');
  // 5. Sleeper has its own colour in both palettes; the accent is free for dials and links
  if (STATUS_COLOR.SB !== 'var(--sb)') throw new Error('Sleeper must not share the accent colour');
  const css = readFileSync('public/styles.css', 'utf8');
  for (const sel of [':root {', ':root[data-theme="day"] {']) {
    const block = css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)));
    for (const v of ['--sb', '--key-hi', '--key-lo', '--screen', '--glow', '--dial-track', '--ground']) if (!block.includes(`${v}:`)) throw new Error(`${sel} must define ${v}`);
  }
  if (!/\.s-SB \{ stroke: var\(--sb\); \}/.test(css)) throw new Error('the log grid draws sleeper in the sleeper colour');
  setLaunchNotice(true);
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], current: null });
  console.log('cab look (dials, keys, capsule, sleeper colour): OK');
}
// --- break buttons (driver report 2026-10-13: "I try to edit the logs but I can't find a way to add break")
{
  const { INITIAL_STATE: IS, parseSaved: ps, sanitizeBreaks, segLabel: sl, breakNote, getState: gs, allSegments: all } = await import('../src/store.ts');
  const { addEntry, breakHint, openSheet, setLaunchNotice } = await import('../src/app.tsx');
  const { evaluate } = await import('../../engine/src/index.ts');
  // 1. one default, the federal one; a carrier's breaks are the driver's to add
  if (IS.breakPresets.length !== 1 || IS.breakPresets[0].name !== '30-min break' || IS.breakPresets[0].minutes !== 30 || IS.breakPresets[0].status !== 'OFF') throw new Error('the only default is a 30-min break, off duty');
  // 2. storage: an old save gets the default; a damaged list is cleaned, not trusted; an emptied list stays empty
  if (ps(JSON.stringify({ segments: [] })).breakPresets.length !== 1) throw new Error('a save from before break buttons gets the default');
  if (ps(JSON.stringify({ segments: [], breakPresets: [] })).breakPresets.length !== 0) throw new Error('a driver who removed every button keeps none');
  const loaded = ps(JSON.stringify({ segments: [], breakPresets: [{ name: 'Nap', minutes: 30, status: 'SB' }, { name: 'Lunch', minutes: 999, status: 'OFF' }] })).breakPresets;
  if (loaded.length !== 1 || loaded[0].name !== 'Lunch' || loaded[0].minutes !== 240) throw new Error(`a damaged saved list must be cleaned on load (got ${JSON.stringify(loaded)})`);
  const dirty = sanitizeBreaks([{ name: '  20-min paid  ', minutes: 22, status: 'ON' }, { name: '', minutes: 30, status: 'OFF' }, { name: 'x', minutes: 'abc', status: 'OFF' },
    { name: 'Nap', minutes: 30, status: 'SB' }, { name: 'Tiny', minutes: 1, status: 'OFF' }, { name: 'Huge', minutes: 999, status: 'OFF' }, 'junk', null,
    { name: 'A', minutes: 30, status: 'OFF' }, { name: 'B', minutes: 30, status: 'OFF' }, { name: 'C', minutes: 30, status: 'OFF' }, { name: 'D', minutes: 30, status: 'OFF' }]);
  if (dirty.length !== 6 || dirty[0].name !== '20-min paid' || dirty[0].minutes !== 20 || dirty[0].status !== 'ON') throw new Error(`a damaged list must be cleaned (got ${JSON.stringify(dirty)})`);
  if (dirty.some((b) => b.status !== 'OFF' && b.status !== 'ON')) throw new Error('a break is never logged as Driving or Sleeper');
  if (dirty[1].minutes !== 5 || dirty[2].minutes !== 240) throw new Error('lengths are kept within 5–240 minutes');
  if (sanitizeBreaks('nope').length !== 1) throw new Error('something that is not a list falls back to the default');
  // 3. the label travels with the row, as personal conveyance does
  if (sl('ON', breakNote('20-min paid')) !== '20-min paid (ON)' || sl('OFF', 'break:') !== 'Off Duty') throw new Error('a break row is labelled by its name and the status it was logged as');
  // 4. the rule, said plainly
  const h20 = breakHint(20, 'ON', 70).join(' '), h40 = breakHint(40, 'OFF', 70).join(' '), h30 = breakHint(30, 'OFF', 60).join(' ');
  if (!/does not satisfy the 30-minute break rule/.test(h20) || !/uses 20m of your 70-hour week/.test(h20)) throw new Error('a short on-duty break: not enough alone, and it costs week hours');
  if (!/Long enough for the 30-minute break rule/.test(h40) || !/relieved of all work/.test(h40) || !/paid is not part of that test/.test(h40)) throw new Error('an off-duty break: enough, and the off-duty test');
  if (/week/.test(h30)) throw new Error('an off-duty break costs no week hours');
  // 5. ...and the rule is what the engine does: 20 min alone does not reset the 8 hours; 20 on + 40 off back to back does; 30 on duty does
  const M = (h) => Math.floor(Date.UTC(2026, 9, 13, 0, 0) / 60000) + Math.round(h * 60);
  const cfg = { cycle: '70/8', dayStartHour: 0, timeZone: 'UTC', shortHaul: false };
  const base = [{ status: 'OFF', start: M(-12), end: M(6) }, { status: 'D', start: M(6), end: M(11) }];
  const breakLeft = (extra, at) => evaluate([...base, ...extra], { asOf: at, config: cfg }).shift.breakRemaining;
  if (breakLeft([{ status: 'OFF', start: M(11), end: M(11 + 20 / 60) }], M(11 + 20 / 60)) !== 180) throw new Error('20 minutes alone must not reset the 8 hours');
  if (breakLeft([{ status: 'ON', start: M(11), end: M(11 + 20 / 60) }, { status: 'OFF', start: M(11 + 20 / 60), end: M(12) }], M(12)) !== 480) throw new Error('20 on duty + 40 off, back to back, must reset the 8 hours');
  if (breakLeft([{ status: 'ON', start: M(11), end: M(11.5) }], M(11.5)) !== 480) throw new Error('30 minutes on duty not driving counts (since 2020)');
  // 6. adding a break from the Log into a drive already logged splits it, and the clocks follow
  setLaunchNotice(false);
  setState({ nowOverride: M(14), tab: 'log', historyAcknowledged: true, tentative: [], current: null, config: { ...gs().config, timeZone: 'UTC', dayStartHour: 0 },
    breakPresets: [{ name: '30-min break', minutes: 30, status: 'OFF' }, { name: '20-min paid', minutes: 20, status: 'ON' }, { name: '40-min lunch', minutes: 40, status: 'OFF' }],
    segments: [{ status: 'OFF', start: M(-12), end: M(8), createdAt: 1 }, { status: 'D', start: M(8), end: M(14), createdAt: 2 }] });
  if (evaluate(all(gs(), M(14)), { asOf: M(14), config: gs().config }).shift.breakRemaining !== 120) throw new Error('setup: 6h of driving leaves 2h before the break is due');
  if (addEntry('OFF', M(11), M(11.5), M(14), breakNote('30-min break')) !== null) throw new Error('the break must add');
  const after = evaluate(all(gs(), M(14)), { asOf: M(14), config: gs().config }).shift;
  if (after.breakRemaining !== 330 || after.driveUsed !== 330) throw new Error(`the break must split the drive: the 8 hours restart at 11:30, 2h30 driven since (330m left, got ${after.breakRemaining}); 5h30 driven in all (got ${after.driveUsed})`);
  let h = out('log/break row');
  if (!/30-min break \(OFF\)/.test(h)) throw new Error('the Log shows the break by name');
  // 7. the add panel offers every break button, with its length and how it is logged (since the editor
  //    redesign the four statuses come first, as most entries are not breaks; inside a drive, breaks lead)
  openSheet({ kind: 'add' });
  h = out('log/add panel with breaks');
  if (!/What were you doing\?/.test(h)) throw new Error('the panel asks what the driver was doing');
  if (!/role="group" aria-label="Break buttons"><button><b>30-min break<\/b><span>30m · off duty<\/span><\/button><button><b>20-min paid<\/b><span>20m · on duty<\/span><\/button><button><b>40-min lunch<\/b><span>40m · off duty<\/span><\/button>/.test(h)) throw new Error('every break button is offered, with its length and status');
  const pan = h.slice(h.indexOf('role="dialog"'));
  if (pan.indexOf('<b>Driving</b>') < 0 || pan.indexOf('<b>Driving</b>') > pan.indexOf('Break buttons')) throw new Error('on a plain add, the statuses come first');
  setState({ breakPresets: [] });
  h = out('log/add panel, no breaks');
  if (/Break buttons/.test(h) || !/<b>Driving<\/b>/.test(h)) throw new Error('with no break buttons the panel shows the statuses only');
  openSheet(null);
  setState({ breakPresets: [{ name: '30-min break', minutes: 30, status: 'OFF' }, { name: '20-min paid', minutes: 20, status: 'ON' }, { name: '40-min lunch', minutes: 40, status: 'OFF' }] });
  // 8. Settings: the buttons are the driver's to set
  setState({ tab: 'settings', breakPresets: [{ name: '20-min paid', minutes: 20, status: 'ON' }] });
  h = out('settings/break buttons');
  if (!/Break buttons/.test(h) || !/aria-label="20-min paid: 5 minutes shorter"/.test(h) || !/Logged on duty/.test(h) || !/Remove “20-min paid”/.test(h) || !/Add a break button/.test(h)) throw new Error('Settings lists each button with its length, status and remove, and offers another');
  setState({ breakPresets: sanitizeBreaks(Array.from({ length: 6 }, (_, i) => ({ name: `B${i}`, minutes: 30, status: 'OFF' }))) });
  if (/Add a break button/.test(out('settings/six breaks'))) throw new Error('six is the most');
  setLaunchNotice(true);
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], current: null, breakPresets: sanitizeBreaks(undefined) });
  console.log('break buttons (add a break from the Log): OK');
}
// --- personal conveyance and yard move from the Log (driver report 2026-10-13: "no option to add personal conveyance")
{
  const { noteFits, segLabel: sl, getState: gs, allSegments: all, breakNote } = await import('../src/store.ts');
  const { addEntry, saveEntry, openSheet, setLaunchNotice } = await import('../src/app.tsx');
  const { evaluate } = await import('../../engine/src/index.ts');
  // 1. which labels fit which status
  const fits = [['PC', 'OFF', true], ['PC', 'D', false], ['PC', 'ON', false], ['YM', 'ON', true], ['YM', 'OFF', false], ['YM', 'D', false],
    [breakNote('x'), 'OFF', true], [breakNote('x'), 'ON', true], [breakNote('x'), 'D', false], [breakNote('x'), 'SB', false], [undefined, 'D', true], ['Break 1', 'SB', true]];
  for (const [n, st, want] of fits) if (noteFits(n, st) !== want) throw new Error(`noteFits(${n}, ${st}) should be ${want}`);
  // 2. adding personal conveyance from the Log: labelled, and off duty to the clocks
  const M = (h) => Math.floor(Date.UTC(2026, 9, 13, 0, 0) / 60000) + Math.round(h * 60);
  setLaunchNotice(false);
  setState({ nowOverride: M(20), tab: 'log', historyAcknowledged: true, tentative: [], current: null, config: { ...gs().config, timeZone: 'UTC', dayStartHour: 0 },
    segments: [{ status: 'OFF', start: M(-12), end: M(8), createdAt: 1 }, { status: 'D', start: M(8), end: M(12), createdAt: 2 }, { status: 'OFF', start: M(12), end: M(20), createdAt: 3 }] });
  if (addEntry('OFF', M(18), M(18.5), M(20), 'PC') !== null) throw new Error('personal conveyance must add');
  const pc = gs().segments.find((x) => x.note === 'PC');
  if (!pc || sl(pc.status, pc.note) !== 'Personal conveyance (OFF)') throw new Error('the row reads as personal conveyance');
  if (evaluate(all(gs(), M(20)), { asOf: M(20), config: gs().config }).shift.driveUsed !== 240) throw new Error('personal conveyance is off duty: it uses no driving time');
  if (!/Personal conveyance \(OFF\)/.test(out('log/pc row'))) throw new Error('the Log shows it by name');
  // 3. an edit that moves a labelled row out of its status drops the label
  if (saveEntry(pc, { status: 'D', start: pc.start, end: pc.end }, M(20)) !== null) throw new Error('setup: the edit saves');
  const moved = gs().segments.find((x) => x.start === M(18) && x.end === M(18.5));
  if (moved.note !== undefined || sl(moved.status, moved.note) !== 'Driving') throw new Error(`a PC row edited to Driving must not read "Personal conveyance (D)" (got ${sl(moved.status, moved.note)})`);
  if (saveEntry(moved, { status: 'ON', start: moved.start, end: moved.end, note: 'YM' }, M(20)) !== null) throw new Error('setup: relabel as a yard move');
  const ym = gs().segments.find((x) => x.start === M(18));
  if (sl(ym.status, ym.note) !== 'Yard move (ON)') throw new Error('an edit can make a row a yard move');
  addEntry('OFF', M(13), M(13.5), M(20), breakNote('30-min break'));
  const br = gs().segments.find((x) => x.note === breakNote('30-min break'));
  saveEntry(br, { status: 'ON', start: br.start, end: br.end }, M(20));
  if (gs().segments.find((x) => x.start === M(13)).note !== breakNote('30-min break')) throw new Error('a break logged on duty instead is still that break');
  saveEntry(gs().segments.find((x) => x.start === M(13)), { status: 'D', start: M(13), end: M(13.5) }, M(20));
  if (gs().segments.find((x) => x.start === M(13)).note !== undefined) throw new Error('a break edited to Driving is no longer a break');
  // 4. the panels offer them, each saying what it is
  openSheet({ kind: 'add' });
  let h = out('log/add panel pc');
  if (!/<b>Personal conveyance<\/b><span class="sub">Off duty, using the truck for yourself<\/span>/.test(h) || !/<b>Yard move<\/b><span class="sub">On duty, moving the truck in the yard<\/span>/.test(h)) throw new Error('the add panel offers personal conveyance and yard move');
  openSheet({ kind: 'edit', seg: gs().segments.find((x) => x.start === M(18)), step: 'what' });
  h = out('log/edit panel ym');
  if (!/<button class="opt" aria-pressed="true">(?:(?!<\/button>).)*<b>Yard move<\/b>/.test(h)) throw new Error('editing a yard move shows it picked');
  if (/<button class="opt" aria-pressed="true">(?:(?!<\/button>).)*<b>On duty<\/b>/.test(h)) throw new Error('plain On duty is not also lit');
  // and the check step says what a yard move is
  openSheet({ kind: 'add', step: 'check', draft: { status: 'ON', note: 'YM', start: M(19), len: 15 } });
  if (!/A yard move is on duty, not driving/.test(out('log/check ym'))) throw new Error('the check says what a yard move is');
  // the panel's Add must hand its PC/YM label to addEntry. A string render cannot click, so the wiring is
  // pinned at source level (as in 6c1ba18); the click itself is checked in a browser.
  const { readFileSync: rf } = await import('node:fs');
  const src = rf('src/app.tsx', 'utf8');
  if (!/return addEntry\(d\.status, d\.start, end, now, d\.note\);/.test(src)) throw new Error('the add panel must pass the label (break, personal conveyance, yard move) to the new row');
  if (!/onPick=\{\(\) => choose\(o\.status, o\.note\)\}/.test(src)) throw new Error('the Also rows must pick their label');
  openSheet(null); setLaunchNotice(true);
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], current: null });
  console.log('personal conveyance and yard move from the Log: OK');
}
// --- the log editor, one question per screen (a tester, 2026-10-13: "the log editor is very confusing")
{
  const { getState: gs, allSegments: all, breakNote, clock: ck, segLabel: sl } = await import('../src/store.ts');
  const app = await import('../src/app.tsx');
  const { openSheet, currentSheet, sheetBack, stepBack, draftFor, whenProblem, draftProblem, overlapNote, draftNotes, commitDraft, relabel, onDay, dayChips, setLaunchNotice } = app;
  const { evaluate, normalize } = await import('../../engine/src/index.ts');
  const M = (h) => Math.floor(Date.UTC(2026, 9, 13, 0, 0) / 60000) + Math.round(h * 60);
  const NOW = M(16);
  const txt = (x) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  // 1. days: the buttons and moving a time to another day keep the time of day
  const back = dayChips(NOW, false), fwd = dayChips(NOW, true);
  if (back.map((c) => c.label).slice(0, 2).join() !== 'Today,Yesterday' || fwd[1].label !== 'Tomorrow' || back.length !== 4) throw new Error('day buttons: Today, Yesterday and two more (Tomorrow for a plan)');
  if (onDay(M(14.5), back[1].at) !== M(14.5) - 1440) throw new Error('moving to yesterday keeps the time of day');
  // 2. sensible first times
  const plain = draftFor({ status: 'D' }, undefined, NOW + 3);
  if (plain.start !== NOW - 60 || plain.len !== 60 || plain.fixedLen) throw new Error(`a plain entry starts on the 5 minutes about an hour ago and lasts an hour (got ${JSON.stringify(plain)})`);
  const brk = draftFor({ status: 'OFF', note: breakNote('30-min break'), minutes: 30 }, undefined, NOW);
  if (brk.start !== NOW - 30 || brk.len !== 30 || !brk.fixedLen) throw new Error('a break button ends now and keeps its length');
  const drive = { status: 'D', start: M(12.5), end: M(16), createdAt: 2 };
  const mid = draftFor({ status: 'OFF', note: breakNote('30-min break'), minutes: 30 }, undefined, NOW, drive);
  if (mid.start !== M(14) || mid.len !== 30) throw new Error(`a break inside a drive lands in its middle (got ${ck(mid.start)})`);
  const changed = draftFor({ status: 'ON' }, { ...mid }, NOW);
  if (changed.start !== M(14) || changed.len !== 30 || changed.fixedLen) throw new Error('a changed answer keeps the times');
  const yday = draftFor({ status: 'ON' }, undefined, NOW, undefined, NOW - 1440);
  if (yday.start !== NOW - 1440 - 60) throw new Error('adding while viewing yesterday starts on yesterday');
  // 3. what cannot be used, said before Next, not after
  if (!/later than now/.test(whenProblem({ ...plain, start: NOW }, NOW, false) ?? '')) throw new Error('a start at or after now is refused for logged time');
  if (!/would still be going/.test(whenProblem({ ...brk, start: NOW - 20 }, NOW, false) ?? '')) throw new Error('a break that would still be going is refused');
  if (whenProblem(brk, NOW, false) !== null) throw new Error('a break that just ended is fine');
  if (!/what-if plan can only start from now on/.test(whenProblem({ ...plain, start: NOW - 5 }, NOW, true) ?? '')) throw new Error('a what-if cannot start in the past');
  if (!/runs past now/.test(draftProblem({ ...plain, len: 90 }, NOW, false) ?? '') || draftProblem({ ...plain, len: 90 }, NOW, true) !== null && !/start/.test(draftProblem({ ...plain, len: 90 }, NOW, true))) throw new Error('logged time cannot run past now');
  // 4. what it does to entries already there, before it is added
  const { joinDisplayRows } = await import('../src/store.ts');
  const rows = joinDisplayRows(normalize([{ status: 'OFF', start: M(-12), end: M(8), createdAt: 1 }, { status: 'D', start: M(8), end: M(12.5), createdAt: 1 }, drive], { merge: false }));
  const inside = overlapNote(rows, mid, NOW);
  if (inside !== `This goes inside your Driving from ${ck(M(8))} to now. Your log will show that drive split around the break.`) throw new Error(`a break inside a drive says so (got ${inside})`);
  const across = overlapNote(rows, { status: 'ON', start: M(7.5), len: 60 }, NOW);
  if (across !== `This takes over part of your Off Duty from ${ck(M(-12))} to ${ck(M(8))}, Driving from ${ck(M(8))} to now. Where they overlap, that time will count as On Duty instead.`) throw new Error(`an entry across two says which, and who wins (got ${across})`);
  if (overlapNote(rows, { status: 'D', start: M(9), len: 30 }, NOW) !== null) throw new Error('driving inside driving changes nothing worth a warning');
  if (draftNotes({ status: 'ON', start: 0, len: 30 }, 70)[0] !== 'Long enough for the 30-minute break rule: 30 minutes in a row without driving.' || draftNotes({ status: 'D', start: 0, len: 60 }, 70).length) throw new Error('the 30-minute rule note fits what counts');
  // The threshold itself, on both sides (§395.3(a)(3)(ii): 30 CONSECUTIVE minutes). A note calling 29 minutes
  // enough tells a driver he may drive on when he may not, and nothing above pinned it: with the plain-entry
  // threshold moved to 15 the whole suite stayed green. Pinned for plain entries and for break buttons.
  for (const st of ['OFF', 'SB', 'ON']) if (draftNotes({ status: st, start: 0, len: 29 }, 70).length) throw new Error(`29 minutes of ${st} must not be called long enough for the 30-minute break rule`);
  for (const st of ['OFF', 'ON']) {
    if (!/does not satisfy the 30-minute break rule/.test(app.breakHint(29, st, 70)[0])) throw new Error(`a 29-minute ${st} break must say it does not satisfy the 30-minute break rule on its own`);
    if (!/^Long enough for the 30-minute break rule/.test(app.breakHint(30, st, 70)[0])) throw new Error(`a 30-minute ${st} break must say it is long enough for the 30-minute break rule`);
  }
  // 5. Back goes back a step (the panel's Back and the phone's), and only closes at the first question
  const d = { ...plain };
  const steps = [[{ kind: 'add' }, null], [{ kind: 'add', step: 'when', draft: d }, 'what'], [{ kind: 'add', step: 'long', draft: d }, 'when'], [{ kind: 'add', step: 'check', draft: d }, 'long'],
    [{ kind: 'add', step: 'check', draft: brk }, 'when'], [{ kind: 'add', step: 'what', draft: d, resume: 'long' }, 'long'], [{ kind: 'add', step: 'what', draft: d }, 'check'],
    [{ kind: 'edit', seg: drive }, null], [{ kind: 'edit', seg: drive, step: 'what', draft: d }, 'menu'], [{ kind: 'edit', seg: drive, step: 'check', draft: d }, 'long'], [{ kind: 'status' }, null]];
  for (const [k, want] of steps) { const b = stepBack(k); if ((b?.step ?? null) !== want) throw new Error(`Back from ${k.kind}/${k.step ?? 'start'} should go to ${want} (got ${b?.step ?? null})`); }
  openSheet({ kind: 'add', step: 'long', draft: d }); sheetBack();
  if (currentSheet()?.step !== 'when' || currentSheet()?.draft !== d) throw new Error('Back keeps the entry and goes one step back');
  sheetBack();
  if (currentSheet()?.step !== 'what' || currentSheet()?.draft !== undefined) throw new Error('Back to the first question starts the answer again');
  sheetBack();
  if (currentSheet() !== null) throw new Error('Back at the first question closes');
  const { readFileSync: rf } = await import('node:fs');
  const src = rf('src/app.tsx', 'utf8');
  if (!/\{ closeSheet: sheetBack, goTo:/.test(src)) throw new Error('the phone’s Back must step back through the editor');
  // layout a string render cannot see, pinned in the stylesheet (checked on a 390px phone in a browser):
  // a long panel scrolls rather than squeezing its rows, and the step's main button stays in reach
  const css = rf('public/styles.css', 'utf8');
  if (!/\.sheet > \* \{ flex-shrink: 0; \}/.test(css)) throw new Error('rows in a tall panel must not be squeezed (a two-line choice spilled out of its button)');
  if (!/\.sheet button\.ed-go \{ position: sticky; bottom: 0;/.test(css)) throw new Error('the step’s main button must stay in reach while the panel scrolls');
  if (!/\.sheet \.ed-q \{/.test(css)) throw new Error('the question must outrank the panel’s small h3 style');
  // 6. each screen
  setLaunchNotice(false);
  setState({ nowOverride: NOW, tab: 'log', historyAcknowledged: true, tentative: [], current: null, config: { ...gs().config, timeZone: 'UTC', dayStartHour: 0 },
    breakPresets: [{ name: '30-min break', minutes: 30, status: 'OFF' }], segments: [{ status: 'OFF', start: M(-12), end: M(8), createdAt: 1 }, { status: 'D', start: M(8), end: M(16), createdAt: 2 }] });
  openSheet({ kind: 'add', step: 'when', draft: d });
  let h = out('editor/when');
  if (!/When did it start\?/.test(h) || !/Step 2 of 3/.test(h) || !/<button class="on" aria-pressed="true">Today<\/button>/.test(h)) throw new Error('step 2 asks when, on today');
  if (!h.includes(`aria-label="Started ${ck(d.start)}">${ck(d.start, false)}</output>`)) throw new Error('step 2 shows the start time big');
  if (!/aria-label="1 hour earlier"/.test(h) || !/aria-label="5 minutes later"/.test(h) || !/<button class="primary wide ed-go">Next: how long<\/button>/.test(h)) throw new Error('hour and minute keys, then Next');
  if (/It just ended/.test(h)) throw new Error('"It just ended" is for a break, whose length is known');
  openSheet({ kind: 'add', step: 'when', draft: { ...brk, start: NOW - 10 } });
  h = out('editor/when break');
  if (!/Step 2 of 2/.test(h) || !/It just ended: started/.test(h) || !/would still be going/.test(h) || !/<button class="primary wide ed-go" disabled>Next: check it<\/button>/.test(h)) throw new Error('a break skips the length, and a start it cannot use holds Next');
  openSheet({ kind: 'add', step: 'long', draft: { ...d, start: NOW - 60, len: 60 } });
  h = out('editor/long');
  if (!/How long did it last\?/.test(h) || !/<button class="on" aria-pressed="true">1 hour<\/button>/.test(h) || !/<button aria-pressed="false" disabled>2 hours<\/button>/.test(h) || !/<button class="all on" aria-pressed="true">Until now · 1h 00m<\/button>/.test(h)) throw new Error('step 3: lengths, those past now held, and Until now');
  openSheet({ kind: 'add', step: 'check', draft: { status: 'OFF', note: breakNote('30-min break'), start: M(14), len: 30, fixedLen: true } });
  h = out('editor/check');
  const th = txt(h);
  if (!/Check and add/.test(h) || !/What Off duty|What 30-min break \(OFF\)/.test(th) || !/class="grid-mark"/.test(h) || !/This goes inside your Driving/.test(h) || !/Long enough for the 30-minute break rule/.test(h) || !/<button class="primary wide ed-go">Add to my log<\/button>/.test(h)) throw new Error(`step 4 shows the entry, the day with it, the overlap and the rule (got ${th.slice(0, 300)})`);
  // a drive logged as two touching rows is still one drive to the driver: the warning names all of it
  const keep = gs().segments;
  setState({ segments: [keep[0], { status: 'D', start: M(8), end: M(12), createdAt: 2 }, { status: 'D', start: M(12), end: M(16), createdAt: 3 }] });
  if (!out('editor/check two rows').includes(`This goes inside your Driving from ${ck(M(8))} to now.`)) throw new Error('the check joins touching rows of one drive');
  setState({ segments: keep });
  // the picture is the day with the entry in: the drive drawn in two pieces around the break
  const panel = h.slice(h.indexOf('role="dialog"'));
  if ((panel.match(/class="s-D"/g) || []).length !== 2 || (panel.match(/class="s-OFF"/g) || []).length !== 2) throw new Error('the check draws the drive split around the break');
  // 7. tapping an entry: what is wrong with it
  openSheet({ kind: 'edit', seg: gs().segments[1] });
  h = out('editor/menu');
  for (const want of ['What do you want to fix?', 'It wasn’t Driving', 'The times are wrong', 'I took a break in the middle', 'Add a break inside this drive', 'It never happened']) if (!h.includes(want)) throw new Error(`the fix panel offers "${want}"`);
  openSheet({ kind: 'edit', seg: gs().segments[0] });
  if (!/I worked or drove in the middle/.test(out('editor/menu off'))) throw new Error('inside a rest, the middle is work or driving');
  const plan = { status: 'OFF', start: NOW + 30, end: NOW + 90, tentative: true, createdAt: 9 };
  openSheet({ kind: 'edit', seg: plan });
  h = out('editor/menu what-if');
  if (!/Remove this what-if/.test(h) || /in the middle/.test(h)) throw new Error('a what-if is removed, not "never happened", and has no middle');
  openSheet({ kind: 'edit', seg: plan, step: 'what', draft: { status: 'OFF', start: plan.start, len: 60 } });
  if (/Personal conveyance/.test(out('editor/what what-if'))) throw new Error('a what-if plan offers the four statuses only');
  openSheet({ kind: 'add', inside: gs().segments[1] });
  h = out('editor/inside');
  const pin = h.slice(h.indexOf('role="dialog"'));
  if (!/What happened in the middle\?/.test(h) || pin.indexOf('Break buttons') < 0 || pin.indexOf('Break buttons') > pin.indexOf('<b>Driving</b>')) throw new Error('inside a drive, the break buttons come first');
  // 8. saving: the break goes in, the drive splits, the clocks follow; the Log's grid shows it as the clocks do
  if (commitDraft({ kind: 'add', inside: gs().segments[1] }, draftFor({ status: 'OFF', note: breakNote('30-min break'), minutes: 30 }, undefined, NOW, gs().segments[1]), NOW) !== null) throw new Error('the break saves');
  const sh = evaluate(all(gs(), NOW), { asOf: NOW, config: gs().config }).shift;
  // the 8h drive 08:00-16:00 is split by a break centred in it, 11:45-12:15: 7h30 driven, 3h45 since the break
  if (!gs().segments.some((x) => x.start === M(11.75) && x.end === M(12.25))) throw new Error('the break is centred in the drive');
  if (sh.driveUsed !== 450 || sh.breakRemaining !== 255) throw new Error(`the break splits the drive: 7h30 driven, 8 hours counted again from 12:15 (got ${sh.driveUsed}, ${sh.breakRemaining})`);
  openSheet(null);
  h = out('editor/log after');
  const grid = h.slice(h.indexOf('<svg viewBox="0 0 360 88" class="grid">'), h.indexOf('</svg>', h.indexOf('class="grid"')));
  if ((grid.match(/class="s-D"/g) || []).length !== 2) throw new Error('the Log’s grid draws the drive in two pieces, as the clocks read it, not straight through the break');
  if (!/Undo/.test(h)) throw new Error('the add is undo-able');
  const seg = gs().segments.find((x) => x.note === breakNote('30-min break'));
  if (commitDraft({ kind: 'edit', seg }, { status: 'OFF', note: seg.note, start: M(13), len: 45 }, NOW) !== null) throw new Error('a fixed time saves');
  const moved = gs().segments.find((x) => x.note === breakNote('30-min break'));
  if (moved.start !== M(13) || moved.end !== M(13.75)) throw new Error('the times change');
  // a break moved between off and on duty stays that break; picked to Driving it is not one
  if (relabel(moved, 'ON') !== moved.note || relabel(moved, 'D') !== undefined || relabel(moved, 'OFF', 'PC') !== 'PC' || relabel({ status: 'OFF', start: 0, end: 1, note: 'PC' }, 'ON') !== undefined) throw new Error('relabel keeps a break, drops what no longer fits');
  // 9. "Start over" left the add panel for More, and its undo is on the Log
  openSheet({ kind: 'add' });
  if (/Start over/.test(out('editor/no start over'))) throw new Error('"Start over" must not sit in the add panel');
  openSheet(null);
  setState({ tab: 'settings' });
  if (!/Start over: fresh 10-hour rest ending now/.test(out('settings/start over'))) throw new Error('"Start over" is under More');
  if (!/startOver\(now\); setState\(\{ tab: 'log' \}\)/.test(src)) throw new Error('after starting over, the Log (with its Undo) is shown');
  setLaunchNotice(true);
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], tentative: [], current: null, breakPresets: [{ name: '30-min break', minutes: 30, status: 'OFF' }] });
  console.log('log editor (one question per screen): OK');
}
// --- the split pair is named on screen (tester scenario 4, 2026-11-04) ---------------------------
// A tester's log still held the previous day's sleeper, so the clock paired it (a legal FMCSA FAQ 22
// pair: a 17h sleeper reset + a 7h off-duty rest) and gave 3h. Nothing on screen said which rests were
// paired, so a correct clock read as a bug, and the Split Lab said the 7h rest "counts against your 14"
// while the clocks were excluding it. Presentation only: the engine numbers are pinned unchanged below.
{
  const { openSheet, setLaunchNotice } = await import('../src/app.tsx');
  const { evaluate, localToMinute } = await import('../../engine/src/index.ts');
  setLaunchNotice(false);
  const Z = 'America/Chicago';
  const t = (d, hr) => localToMinute(2026, 11, d, hr, Z);
  const txt = (x) => x.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const fri = [
    { status: 'D', start: t(6, 6), end: t(6, 10) }, { status: 'SB', start: t(6, 10), end: t(6, 13) },
    { status: 'D', start: t(6, 13), end: t(6, 17) },
  ];
  const thu = [
    { status: 'D', start: t(5, 2), end: t(5, 6) }, { status: 'OFF', start: t(5, 6), end: t(5, 9) },
    { status: 'D', start: t(5, 9), end: t(5, 13) }, { status: 'SB', start: t(5, 13), end: t(6, 6) },
  ];
  const NOW = t(7, 0);
  const show = (segments, tab = 'now', at = NOW, since = t(6, 17), status = 'OFF') => {
    setState({ tab, segments, tentative: [], current: { status, since }, nowOverride: at, historyAcknowledged: true, tzChosen: true, config: { ...getState().config, timeZone: Z } });
    return txt(render(h(App, {})));
  };
  // the engine reading this screen describes — unchanged by this fix
  const ev = evaluate([...thu, ...fri, { status: 'OFF', start: t(6, 17), end: NOW }], { asOf: NOW, config: { ...getState().config, timeZone: Z } });
  if (ev.driveNow !== 180 || ev.shift.anchor !== t(6, 6) || ev.shift.chain.length !== 2) throw new Error(`scenario 4 engine reading moved (driveNow ${ev.driveNow}, anchor ${ev.shift.anchor})`);
  const pairText = `${clock(t(5, 13))}–${clock(t(6, 6))} sleeper (17h 00m) + ${clock(t(6, 17))}–${clock(NOW)} off duty (7h 00m) — split pair (FMCSA FAQ 22)`;

  // 1. Now names both rests and the rule, and says where the clocks count from
  let s4 = show([...thu, ...fri]);
  if (!s4.includes('You can drive 3h 00m')) throw new Error('scenario 4: Now must still read 3h');
  if (!s4.includes(pairText)) throw new Error(`Now must name the split pair (want "${pairText}")\n got: ${s4.slice(0, 900)}`);
  if (!s4.includes(`Your 11-hour driving limit and 14-hour window count from ${clock(t(6, 6))}, the end of the first rest. The second rest does not count against your 14-hour window.`)) throw new Error('Now must say where the paired clocks count from');
  if (!s4.includes(`Your ${clock(t(6, 17))}–${clock(NOW)} rest can also be the first half of your next pair.`)) throw new Error('Now must explain the "split leg pending" tag when a pair is in use');
  // the line reads the shift's limits, never a hardcoded 11/14: adverse conditions make it 13/16
  setState({ config: { ...getState().config, adverseShifts: [ev.shift.shiftStart] } });
  const adv = txt(render(h(App, {})));
  setState({ config: { ...getState().config, adverseShifts: [] } });
  if (!adv.includes(`Your 13-hour driving limit and 16-hour window count from ${clock(t(6, 6))}`)) throw new Error('the split-pair line must use the shift limits (13/16 under adverse conditions)');
  // the same Friday with no earlier sleeper: no pair, so nothing may claim one
  const lone = show(fri);
  if (/split pair|Split in use/.test(lone)) throw new Error('a log with no qualifying pair must not show a split pair');
  // 2. Why panel names it too, and the 11-hour row says where it counts from
  show([...thu, ...fri]);
  openSheet({ kind: 'why' });
  // scoped to the panel itself: the Now tab still renders (inert) behind it and carries the same line
  const whyHtml = render(h(App, {}));
  s4 = txt(whyHtml.slice(whyHtml.indexOf('<div class="sheet" role="dialog"')));
  openSheet(null);
  if (!/Why /.test(s4.slice(0, 200))) throw new Error('the Why panel scope must start at the panel');
  if (!s4.includes(pairText)) throw new Error('the Why panel must name the split pair');
  if (!s4.includes(`You have driven 8h 00m since ${clock(t(6, 6))}, the end of the first rest in your split pair.`)) throw new Error('the Why panel’s 11-hour row must say where a split counts from');
  // 3. Split Lab: the pair in use and the possible next pair read as two different things
  s4 = show([...thu, ...fri], 'split');
  if (!s4.includes(`Split in use: ${pairText}.`)) throw new Error('Split Lab must name the pair the clocks are using');
  if (/Period A logged/.test(s4) || /counts against your 14/.test(s4)) throw new Error('with a pair in use, Split Lab must not say its second rest counts against the 14 — the clocks exclude it');
  if (!s4.includes(`Next pair (optional): your ${clock(t(6, 17))}–${clock(NOW)} rest (7h 00m off duty) can also be the first half of your next split. It needs a later rest with 7h+ in a row in the sleeper.`)) throw new Error('Split Lab must describe the possible next pair as optional');
  // with no pair in use, the pending leg still says its time counts against the 14, with the same
  // numbers — patch 7 changed only the label ("Period A" was internal shorthand drivers never used)
  const loneLab = show(fri, 'split');
  if (!/First break logged: 7h 00m ending/.test(loneLab) || !/counts against your 14/.test(loneLab)) throw new Error('with no pair in use, the pending leg must still say it counts against your 14');
  // 4. a plain 395.1(g) pair (scenario 3: 3h off + 7h sleeper) cites the regulation, not FAQ 22
  s4 = show(thu.slice(0, 3), 'now', t(5, 20), t(5, 13), 'SB');
  const reg = `${clock(t(5, 6))}–${clock(t(5, 9))} off duty (3h 00m) + ${clock(t(5, 13))}–${clock(t(5, 20))} sleeper (7h 00m) — split pair (49 CFR 395.1(g))`;
  if (!s4.includes(reg)) throw new Error(`a 3/7 pair must cite 49 CFR 395.1(g) (want "${reg}")`);
  // 5. a rest that mixes off duty and sleeper says so, with its sleeper run
  s4 = show([...thu.slice(0, 3), { status: 'SB', start: t(5, 13), end: t(5, 20) }, { status: 'OFF', start: t(5, 20), end: t(6, 6) }, ...fri]);
  if (!s4.includes(`${clock(t(5, 13))}–${clock(t(6, 6))} sleeper and off duty (17h 00m, 7h 00m in a row in the sleeper)`)) throw new Error('a mixed rest must be described with its sleeper run');
  // no internal codes on screen
  if (/\b(SB|OFF|DRIVE_11|WINDOW_14)\b/.test(s4.slice(s4.indexOf('split pair') - 200, s4.indexOf('split pair') + 40))) throw new Error('the pair line must not show internal status codes');
  setLaunchNotice(true);
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], tentative: [], current: null });
  console.log('split pair named on screen: OK');
}
// --- patch 5: state resilience — a damaged save falls back, and the undo survives a relaunch
{
  const { loadSaved, setState: ss, getState: gs } = await import('../src/store.ts');
  const { deleteEntry, currentUndo, undoLast, restoreUndo } = await import('../src/app.tsx');
  const KEY = 'hos-sandbox-v1', BAK = 'hos-sandbox-v1-backup', UKEY = 'hos-sandbox-undo-v1';
  const rowsA = [{ status: 'OFF', start: 1000, end: 1600, createdAt: 1 }];
  const rowsB = [...rowsA, { status: 'D', start: 1600, end: 1900, createdAt: 2 }];
  // 1. every save keeps the one it replaced as the last-known-good copy
  mem.delete(BAK);
  ss({ segments: rowsA, tentative: [], current: null });
  ss({ segments: rowsB, tentative: [], current: null });
  const bak = JSON.parse(mem.get(BAK) ?? 'null');
  if (!bak || JSON.stringify(bak.segments) !== JSON.stringify(rowsA)) throw new Error('patch 5: the save a write replaces must be kept as the backup');
  // 2. a damaged current save falls back to that copy, record intact — truncated JSON and a
  //    wrong-shape record alike; a healthy save still wins over the backup
  mem.set(KEY, '{"segments": "junk"');
  if (JSON.stringify(loadSaved().segments) !== JSON.stringify(rowsA)) throw new Error('patch 5: an unparseable save must fall back to the last-known-good copy');
  mem.set(KEY, JSON.stringify({ segments: 'junk', tentative: [] }));
  if (JSON.stringify(loadSaved().segments) !== JSON.stringify(rowsA)) throw new Error('patch 5: a wrong-shape save must fall back to the last-known-good copy');
  mem.set(KEY, JSON.stringify({ segments: rowsB, tentative: [], current: null }));
  if (JSON.stringify(loadSaved().segments) !== JSON.stringify(rowsB)) throw new Error('patch 5: a healthy save must win over the backup');
  // 3. a delete writes its undo to storage, in the shape a relaunch restores from
  ss({ segments: rowsB.map((r) => ({ ...r })), tentative: [], current: null, historyAcknowledged: true });
  deleteEntry(gs().segments[1]);
  const stored = JSON.parse(mem.get(UKEY) ?? 'null');
  if (!stored || !/^Deleted Driving/.test(stored.label)) throw new Error('patch 5: a delete must persist its undo');
  if (JSON.stringify(stored.after.segments) !== JSON.stringify([rowsA[0]])) throw new Error('patch 5: the stored undo must snapshot the record as the delete left it');
  // 4. simulated relaunch: the record is re-read from storage (new objects, identity gone) and the
  //    stored undo restored from its key — the undo still stands, and using it puts the entry back
  ss(loadSaved());
  restoreUndo(mem.get(UKEY) ?? null);
  if (!currentUndo()) throw new Error('patch 5: the undo must survive a relaunch while the record is untouched');
  if (!undoLast() || JSON.stringify(gs().segments) !== JSON.stringify(rowsB)) throw new Error('patch 5: the restored undo must put the deleted entry back');
  // 5. ...but a restored undo retires the moment the record has moved on, exactly as in-session
  deleteEntry(gs().segments[1]);
  restoreUndo(mem.get(UKEY) ?? null);
  ss({ segments: [...gs().segments, { status: 'ON', start: 1900, end: 1930, createdAt: 3 }] });
  if (currentUndo() !== null || undoLast() !== false) throw new Error('patch 5: a restored undo must retire once the record changes');
  if (gs().segments.length !== 2) throw new Error('patch 5: a retired undo must change nothing');
  // leave the store as the other sections expect to find it
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, nowOverride: null, tab: 'now' });
  console.log('patch 5 (damaged save falls back; undo survives a relaunch): OK');
}
// --- patch 5.1: usableSave validates the live segment too (Claudia's catch on patch 5) — a save
//     whose only defect is a malformed `current` falls back like any other wrong-shape save, and
//     never rotates into the backup slot over a good copy
{
  const { loadSaved, setState: ss } = await import('../src/store.ts');
  const KEY = 'hos-sandbox-v1', BAK = 'hos-sandbox-v1-backup';
  const rowsA = [{ status: 'OFF', start: 1000, end: 1600, createdAt: 1 }];
  const rowsX = [{ status: 'D', start: 5000, end: 5600, createdAt: 9 }];
  const save = (segments, current) => JSON.stringify({ segments, tentative: [], current });
  // the backup holds a known-good record; a bad save carries different segments so a fallback shows
  mem.set(BAK, save(rowsA, null));
  // 1. every malformed flavour of `current` makes the save unusable: the backup's record comes back
  for (const cur of ['Driving', 42, [], { status: 'DRIVING', since: 2000 }, { status: 'D', since: 'soon' }, { status: 'D' }, { since: 2000 }]) {
    mem.set(KEY, save(rowsX, cur));
    if (JSON.stringify(loadSaved().segments) !== JSON.stringify(rowsA)) throw new Error(`patch 5.1: a save whose current is ${JSON.stringify(cur)} must fall back to the backup`);
  }
  // 2. a healthy save still wins over the backup: a live segment loads intact, a null one stays null
  mem.set(KEY, save(rowsX, { status: 'D', since: 2000, note: 'Loaded', createdAt: 7 }));
  const live = loadSaved();
  if (JSON.stringify(live.segments) !== JSON.stringify(rowsX) || live.current?.status !== 'D' || live.current?.since !== 2000) throw new Error('patch 5.1: a healthy save with a valid current must load as itself, live segment intact');
  mem.set(KEY, save(rowsX, null));
  if (JSON.stringify(loadSaved().segments) !== JSON.stringify(rowsX) || loadSaved().current !== null) throw new Error('patch 5.1: a healthy save with no live segment must load as itself');
  // 3. rotation: a malformed-current save sitting in the slot is never copied over the good backup
  mem.set(BAK, save(rowsA, null));
  mem.set(KEY, save(rowsX, { status: 'D', since: 'soon' }));
  ss({ segments: rowsX, tentative: [], current: { status: 'ON', since: 3000 } });
  if (JSON.stringify(JSON.parse(mem.get(BAK)).segments) !== JSON.stringify(rowsA)) throw new Error('patch 5.1: a malformed-current save must never rotate into the backup slot');
  // leave the store as the other sections expect to find it
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, nowOverride: null, tab: 'now' });
  console.log('patch 5.1 (malformed current falls back; never evicts the backup): OK');
}
// --- patch 5.2: usableSave validates the ROWS inside segments/tentative too — the import path
//     (rowProblem) has always required each row to be an object with a known duty status, finite
//     start/end, and end after start; the load path checked only that the lists were lists. A save
//     whose only defect is a malformed row now falls back like any other wrong-shape save, and
//     never rotates into the backup slot over a good copy
{
  const { loadSaved, setState: ss } = await import('../src/store.ts');
  const KEY = 'hos-sandbox-v1', BAK = 'hos-sandbox-v1-backup';
  const rowsA = [{ status: 'OFF', start: 1000, end: 1600, createdAt: 1 }];
  const rowsX = [{ status: 'D', start: 5000, end: 5600, createdAt: 9 }];
  const good = { status: 'OFF', start: 5000, end: 5600 };
  const save = (segments, tentative = []) => JSON.stringify({ segments, tentative, current: null });
  // the backup holds a known-good record; a bad save carries different segments so a fallback shows
  mem.set(BAK, save(rowsA));
  // 1. every malformed row flavour in `segments` makes the save unusable: the backup comes back.
  //    The flavours mirror rowProblem on the import path, one per requirement.
  const badSegs = [
    ['a string', ['junk']],
    ['a number', [42]],
    ['null', [null]],
    ['an array', [[]]],
    ['an unknown status', [{ ...good, status: 'DRIVING' }]],
    ['a missing status', [{ start: 5000, end: 5600 }]],
    ['a string start', [{ ...good, start: '09:00' }]],
    ['a missing end', [{ status: 'OFF', start: 5000 }]],
    ['a non-finite end', [{ ...good, end: null }]],
    ['an end equal to its start', [{ ...good, end: 5000 }]],
    ['an end before its start', [{ ...good, start: 5600, end: 5000 }]],
    ['one bad row among good ones', [good, { ...good, status: 'XX' }]],
  ];
  for (const [label, segs] of badSegs) {
    mem.set(KEY, save(segs));
    if (JSON.stringify(loadSaved().segments) !== JSON.stringify(rowsA)) throw new Error(`patch 5.2: a save whose segments hold ${label} must fall back to the backup`);
  }
  // 2. the same for `tentative`: one malformed what-if row makes the whole save unusable
  for (const [label, tent] of [
    ['an unknown status', [{ ...good, status: 'DRIVING', tentative: true }]],
    ['a missing start', [{ status: 'SB', end: 5600, tentative: true }]],
    ['an end before its start', [{ ...good, start: 5600, end: 5000, tentative: true }]],
  ]) {
    mem.set(KEY, save(rowsX, tent));
    if (JSON.stringify(loadSaved().segments) !== JSON.stringify(rowsA)) throw new Error(`patch 5.2: a save whose tentative holds ${label} must fall back to the backup`);
  }
  // 3. a healthy save still wins over the backup: rows with the fields the app itself writes —
  //    notes, tentative flags, createdAt stamps — load as themselves, record intact
  const healthy = [
    { status: 'OFF', start: 5000, end: 5600, note: 'PC', createdAt: 9 },
    { status: 'D', start: 5600, end: 5900, createdAt: 10 },
  ];
  const healthyTent = [{ status: 'SB', start: 5900, end: 6500, tentative: true, note: 'what-if', createdAt: 11 }];
  mem.set(KEY, save(healthy, healthyTent));
  const live = loadSaved();
  if (JSON.stringify(live.segments) !== JSON.stringify(healthy) || JSON.stringify(live.tentative) !== JSON.stringify(healthyTent)) throw new Error('patch 5.2: a healthy save with well-formed rows must load as itself');
  // 4. rotation: a save with a malformed row sitting in the slot is never copied over the good backup
  mem.set(BAK, save(rowsA));
  mem.set(KEY, save([{ ...good, status: 'DRIVING' }]));
  ss({ segments: rowsX, tentative: [], current: { status: 'ON', since: 3000 } });
  if (JSON.stringify(JSON.parse(mem.get(BAK)).segments) !== JSON.stringify(rowsA)) throw new Error('patch 5.2: a malformed-row save must never rotate into the backup slot');
  // leave the store as the other sections expect to find it
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, nowOverride: null, tab: 'now' });
  console.log('patch 5.2 (malformed rows fall back; never evict the backup): OK');
}
// --- patch 6: big touch (Lorico's ELD-phone report) — hit areas at a 48px floor, 56px for primary
// controls, steppers and number fields; number fields ask the phone for the numeric keyboard; one
// guarded tap tick on Android. A string render can see none of that — a hit area, a keyboard and a
// buzz leave no trace in the HTML — so, like patch #2's dial stack, these pins read the sources.
// All sizes in the stylesheet are px, and the reader below reads px only (patch #2's caveat).
{
  const { readFileSync: rf } = await import('node:fs');
  const css = rf('public/styles.css', 'utf8');
  const app = rf('src/app.tsx', 'utf8');
  const alerts = rf('src/alerts.ts', 'utf8');
  const rule = (re) => (css.match(re) || [''])[0];
  const pxProp = (r, prop) => Number(((r.match(new RegExp(prop + ': (\\d+)px')) || [])[1]) || 0);
  const minH = (re, floor, what) => {
    const r = rule(re); const v = pxProp(r, 'min-height');
    if (!(v >= floor)) throw new Error(`patch 6: ${what} must keep a hit area of at least ${floor}px (got ${v || 'none'}): ${r}`);
  };
  // the floor: nothing tappable under 48px tall
  minH(/\nbutton \{[^}]*\}/, 48, 'the base button');
  minH(/\.toggle button \{[^}]*\}/, 48, 'segmented toggle buttons');
  minH(/\.theme-btn \{[^}]*\}/, 48, 'the header theme button');
  minH(/label input, label select \{[^}]*\}/, 48, 'labelled fields and selects');
  minH(/label\.check \{[^}]*\}/, 48, 'checkbox rows');
  minH(/\.ed-days button \{[^}]*\}/, 48, 'the editor day chips');
  // icon buttons are square: both dimensions at the floor
  const icon = rule(/\.icon-btn \{[^}]*\}/);
  if (!(pxProp(icon, 'width') >= 48) || !(pxProp(icon, 'height') >= 48)) throw new Error(`patch 6: icon buttons must stay at least 48x48: ${icon}`);
  // primary controls, steppers and number fields at 56
  minH(/\.tabs button \{[^}]*\}/, 56, 'the tab bar');
  minH(/\.chips button \{[^}]*\}/, 56, 'preset chips');
  minH(/\.quick button \{[^}]*\}/, 56, 'the Now quick actions');
  minH(/\.slider-row \.mini \{[^}]*\}/, 56, 'the slider steppers');
  minH(/\.tstep-row button \{[^}]*\}/, 56, 'the time steppers');
  minH(/\.brk-len button \{[^}]*\}/, 56, 'the break-length steppers');
  minH(/input\.num \{[^}]*\}/, 56, 'the slider number field');
  minH(/input\.hrs \{[^}]*\}/, 56, 'the recap hour fields');
  // the slider's own touch strip
  const range = rule(/\.slider input\[type=range\] \{[^}]*\}/);
  if (!(pxProp(range, 'height') >= 48)) throw new Error(`patch 6: the slider touch strip must stay at least 48px tall: ${range}`);
  // numeric keypads: every number-only field must ask the phone for the number keyboard
  if (!/class="num" inputMode="numeric"/.test(app)) throw new Error('patch 6: the slider number field must keep inputMode="numeric"');
  if ((app.match(/class="hrs" inputMode="decimal"/g) || []).length !== 2) throw new Error('patch 6: both quarter-hour recap fields must keep inputMode="decimal"');
  if (!/class="hrs" inputMode="numeric"/.test(app)) throw new Error('patch 6: the whole-hour recap field must keep inputMode="numeric"');
  if (!/type="number" inputMode="numeric" min=\{1\} max=\{3000\}/.test(app)) throw new Error('patch 6: the load-check miles field must keep inputMode="numeric"');
  // the tap tick: feature-detected (a refactor that drops the guard fails here), and wired to
  // completed button taps only — never to drags
  if (!/typeof navigator !== 'undefined' && 'vibrate' in navigator/.test(alerts)) throw new Error('patch 6: the tap tick must stay feature-detected (no vibrate API, no buzz, no throw)');
  if (!/navigator\.vibrate\(12\)/.test(alerts)) throw new Error('patch 6: the tap tick must still fire a 12ms buzz');
  if (!/addEventListener\('click'/.test(app) || !/closest\?\.\('button'\)/.test(app) || !/tapTick\(\)/.test(app)) throw new Error('patch 6: the tap tick must stay wired to button clicks');
  console.log('patch 6 (big touch targets; numeric keypads; guarded tap tick): OK');
}
// --- patch 7: first open at 3 a.m. (the ChatGPT tired-trucker review, verified by Ada) — an
// un-chosen theme follows the phone instead of blasting day white; the load question rides Now;
// the simulated clock is quarantined in More → Testing and banners every screen while set; the
// two-zones note is a notice, not a footnote, and the disclaimer stops contradicting it; the zone
// picker speaks "Central"; Split Lab drops its internal terms; and the disclaimer, once read in
// full, comes back compact — never gone.
{
  const { readFileSync: rf } = await import('node:fs');
  const { setState: ss, getState: gs, parseSaved: ps7, effectiveTheme, zoneLabel, deviceTz: dtz } = await import('../src/store.ts');
  const { setLaunchNotice } = await import('../src/app.tsx');
  const app = rf('src/app.tsx', 'utf8');
  const store = rf('src/store.ts', 'utf8');
  const main = rf('src/main.tsx', 'utf8');
  const readme = rf('../README.md', 'utf8');

  // 1. the effective theme: a hand-picked theme always wins; an un-chosen one follows the phone
  const et = effectiveTheme;
  if (et({ theme: 'day', themeChosen: false }, true) !== 'night') throw new Error('patch 7: an un-chosen theme on a dark phone must be night');
  if (et({ theme: 'day', themeChosen: false }, false) !== 'day') throw new Error('patch 7: an un-chosen theme on a light phone must be day');
  if (et({ theme: 'night', themeChosen: false }, false) !== 'day') throw new Error('patch 7: a stored-but-unchosen night must still follow the phone');
  if (et({ theme: 'day', themeChosen: true }, true) !== 'day') throw new Error('patch 7: a chosen day must never be overridden by the phone');
  if (et({ theme: 'night', themeChosen: true }, false) !== 'night') throw new Error('patch 7: a chosen night must never be overridden by the phone');
  if (!/prefers-color-scheme: dark/.test(store)) throw new Error('patch 7: the store must read the phone palette');
  if (!/effectiveTheme\(getState\(\), devicePrefersDark\(\)\)/.test(main)) throw new Error('patch 7: the first paint must apply the effective theme');
  if (!/effectiveTheme\(s, devicePrefersDark\(\)\) === 'day'/.test(app)) throw new Error('patch 7: the header switch must flip the effective theme');

  // 2. the disclaimer flag: only a literal true is earned — old saves (missing) and damaged ones
  //    (anything else) read as not acknowledged, so the full box shows once more
  if (ps7(JSON.stringify({ segments: [] })).disclaimerAcked !== false) throw new Error('patch 7: a save from before the flag must read as not acknowledged');
  if (ps7(JSON.stringify({ segments: [], disclaimerAcked: true })).disclaimerAcked !== true) throw new Error('patch 7: an acknowledged save must stay acknowledged');
  if (ps7(JSON.stringify({ segments: [], disclaimerAcked: 'yes' })).disclaimerAcked !== false) throw new Error('patch 7: a damaged flag must read as not acknowledged');

  // 3. full box until the first "I understand", compact after — and the zone question, with the
  //    corrected time-zone sentence, rides in BOTH sizes while the zone is unconfirmed
  ss({ segments: [], tentative: [], current: null, tab: 'now', disclaimerAcked: false, tzChosen: true, nowOverride: null });
  setLaunchNotice(true);
  let h = out('patch 7/disclaimer full');
  if (!/Split Decision is a planning scratchpad/.test(h) || !/395\.34/.test(h)) throw new Error('patch 7: the first launch must show the full disclaimer');
  if (/when it and this app disagree/.test(h)) throw new Error('patch 7: the full disclaimer must not carry the compact wording');
  ss({ disclaimerAcked: true });
  h = out('patch 7/disclaimer compact');
  if (!/<b>Planning only — not a log, not an ELD\.<\/b>/.test(h)) throw new Error('patch 7: later launches must show the compact disclaimer');
  if (!/when it and this app disagree, the ELD governs/.test(h)) throw new Error('patch 7: the compact disclaimer must still name the ELD as the record');
  if (/395\.34|It sends nothing anywhere/.test(h)) throw new Error('patch 7: the compact disclaimer must be compact — the full text stays in the first box only');
  ss({ tzChosen: false });
  h = out('patch 7/disclaimer compact, zone unconfirmed');
  if (!/Where is your home terminal\?/.test(h)) throw new Error('patch 7: the compact disclaimer must still ask the terminal zone');
  if (!/Clock times on screen are shown in your/.test(h)) throw new Error('patch 7: the zone section must say clock times ride the phone zone');
  if (/Every clock here is worked out in your/.test(h)) throw new Error('patch 7: the stale worked-out-in-your-terminal sentence must be gone');
  ss({ tzChosen: true });

  // 4. Now carries the load question as a full entry, not just the quick row
  setLaunchNotice(false);
  ss({ tab: 'now', current: { status: 'ON', since: now - 60 } });
  h = out('patch 7/now load entry');
  if (!/class="plan-item"/.test(h) || !/Can I take this load\?/.test(h) || !/Answer three questions, get a yes or no/.test(h)) throw new Error('patch 7: Now must offer the load question as a prominent plan-item entry');

  // 5. the simulated clock banners every screen while set — and is gone when it is not
  ss({ nowOverride: now + 120 });
  h = out('patch 7/sim banner on');
  if (!/Simulated clock\.<\/b>/.test(h) || !/Use real clock/.test(h)) throw new Error('patch 7: a set simulated clock must banner the screen');
  ss({ nowOverride: null });
  h = out('patch 7/sim banner off');
  if (/Simulated clock\.<\/b>/.test(h)) throw new Error('patch 7: no banner may show on the real clock');
  if (!(app.indexOf('Simulated "now" (testing)') > app.indexOf('title="Testing"'))) throw new Error('patch 7: the simulated-clock setting must live in the Testing card, below the rest of More');
  ss({ tab: 'settings' });
  h = out('patch 7/settings testing card');
  const heads = [...h.matchAll(/<h2>(.*?)<\/h2>/g)].map((m) => m[1]);
  if (heads[heads.length - 1] !== 'Testing') throw new Error(`patch 7: Testing must be the last card in More (saw ${heads.join(' | ')})`);

  // 6. two zones in play reads as a notice, not a footnote
  const otherZone = dtz === 'America/New_York' ? 'America/Chicago' : 'America/New_York';
  ss({ tab: 'now', config: { ...gs().config, timeZone: otherZone } });
  h = out('patch 7/two zones notice');
  if (!/class="warnbox">\s*<b>Two time zones in play\.<\/b>/.test(h)) throw new Error('patch 7: the two-zones note must render as a warnbox notice');
  ss({ config: { ...gs().config, timeZone: dtz } });

  // 7. the zone picker leads with the driver's words; the saved value stays the IANA name
  if (zoneLabel('America/Chicago') !== 'Central — Chicago') throw new Error('patch 7: America/Chicago must be labelled Central — Chicago');
  ss({ tab: 'settings' });
  h = out('patch 7/zone labels');
  if (!/label="Central — Chicago"/.test(h)) throw new Error('patch 7: the zone list must show the friendly label');
  if (!/value="America\/Chicago"/.test(h)) throw new Error('patch 7: the zone value must stay the IANA name');

  // 8. Split Lab in the driver's words — and none of the internal terms left on screen
  const t0 = now - 60 * 15;
  ss({ tab: 'split', current: { status: 'SB', since: now - 120 },
    segments: [
      { status: 'OFF', start: t0 - 600, end: t0 },
      { status: 'D', start: t0, end: t0 + 300 },
      { status: 'OFF', start: t0 + 300, end: t0 + 480 },
      { status: 'ON', start: t0 + 480, end: t0 + 510 },
      { status: 'D', start: t0 + 510, end: t0 + 780 },
    ] });
  h = out('patch 7/split words');
  if (!/First break logged:/.test(h)) throw new Error('patch 7: the pending leg must read "First break logged"');
  if (!/Clocks count from:/.test(h)) throw new Error('patch 7: the plan anchor line must read "Clocks count from"');
  if (/Period A logged|interpretations considered/.test(h)) throw new Error('patch 7: internal terms must not reach the driver');
  if (/Period A logged|interpretations considered/.test(app)) throw new Error('patch 7: the sources must not carry the old driver-facing terms');

  // 9. the public README names no private host
  if (/ts\.net|hermes-vps/.test(readme)) throw new Error('patch 7: the README must not name the Tailscale host');
  if (!/hossandbox\.github\.io/.test(readme)) throw new Error('patch 7: the README phone line must point at the deployed site');

  // leave the store as the other sections expect to find it
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, nowOverride: null, tab: 'now', disclaimerAcked: false });
  setLaunchNotice(true);
  console.log('patch 7 (first open at 3 a.m.; compact disclaimer): OK');
}
// --- patch 7.1: one load door on Now, a way to start the load question over, and the rename —
// patch 7 left Now with two doors (the prominent plan-item entry and the quick row's smaller
// duplicate), and a finished load check could only be edited answer by answer: reopening it
// landed on the old verdict with no road back to a fresh set of questions. The duplicate comes
// out, and the verdict screen gains "Check another load" — the one deliberate clear, resetting
// the draft to the defaults. Nothing auto-clears: reopening a finished check still lands on its
// verdict. And the app takes its launch name, Split Decision — every driver-facing surface,
// while the storage keys and the repo path stay exactly where they were. Folded in last (Lorico
// hit it on his Pixel against live patch 7 and approved the fold-in in voice): the planning
// screens' back buttons were hard-wired to Plan, so entering the load check from Now and
// backing out landed on Plan — the entry now records where the driver came from and the
// back buttons honour it.
{
  const { readFileSync: rf } = await import('node:fs');
  const { setState: ss, getState: gs, DEFAULT_LOADCHECK: DL71, parseSaved } = await import('../src/store.ts');
  const { setLaunchNotice } = await import('../src/app.tsx');
  const app = rf('src/app.tsx', 'utf8');

  // (a) the duplicate is gone from source and screen; the other doors and Plan a split stay
  if (/Take a load\?/.test(app)) throw new Error('patch 7.1: the quick-row duplicate must be gone from the source');
  setLaunchNotice(false);
  ss({ segments: [], tentative: [], current: { status: 'ON', since: now - 60 }, tab: 'now', nowOverride: null });
  let h = out('patch 7.1/now dedupe');
  if (/Take a load\?/.test(h)) throw new Error('patch 7.1: Now must not render the duplicate load button');
  if (!/Plan a split/.test(h)) throw new Error('patch 7.1: the quick row must keep Plan a split');
  if (!/class="plan-item"/.test(h) || !/Can I take this load\?/.test(h)) throw new Error('patch 7.1: Now must keep the prominent load entry');

  // (b) the verdict screen carries the reset, wired to clear the draft and restart the questions
  if (!/setState\(\{ loadCheck: \{ \.\.\.DEFAULT_LOADCHECK \} \}\); setStep\(1\)/.test(app)) throw new Error('patch 7.1: Check another load must reset the draft to the defaults and return to question 1');
  const L = (d, hh, m = 0) => Math.floor(Date.UTC(2026, 9, d, hh + 5, m) / 60000); // Oct d, CDT
  ss({ nowOverride: L(12, 10), historyAcknowledged: true, tentative: [], current: { status: 'ON', since: L(12, 9) },
    segments: [{ status: 'OFF', start: L(11, 20), end: L(12, 9) }],
    config: { ...gs().config, timeZone: 'America/Chicago', dayStartHour: 0 },
    loadCheck: { miles: 300, dwell: 60, dwellOff: true, leaveIn: 30, waitOff: true, answered: true }, tab: 'load' });
  h = out('patch 7.1/verdict with reset');
  if (!/Load distance<\/span><b>300 mi<\/b>/.test(h)) throw new Error('patch 7.1: the seeded finished check must open on its verdict');
  if (!/>Check another load</.test(h)) throw new Error('patch 7.1: the verdict screen must offer Check another load');
  if (!/>Done</.test(h)) throw new Error('patch 7.1: the verdict screen must keep Done');

  // (c) the reset itself: the draft returns to the defaults and the flow opens on question 1.
  //     The harness renders to string and cannot click, so it performs the same store write the
  //     button's handler is pinned to above, then re-renders — the step half of the handler is
  //     covered by that source pin and by redesign 4 (1): an unanswered check opens on question 1.
  ss({ loadCheck: { ...DL71 } });
  const lc = gs().loadCheck;
  if (lc.miles !== 1200 || lc.dwell !== 120 || lc.dwellOff !== false || lc.leaveIn !== 0 || lc.waitOff !== false || lc.answered !== false)
    throw new Error('patch 7.1: the reset must restore the default load draft');
  h = out('patch 7.1/after reset');
  if (!/How far is the load\?/.test(h) || !/1 of 3/.test(h)) throw new Error('patch 7.1: after the reset the flow must open on question 1');
  if (!/<b>1200<\/b> mi/.test(h)) throw new Error('patch 7.1: question 1 must show the default miles after the reset');
  if (/Verdict|Check another load/.test(h)) throw new Error('patch 7.1: question 1 must not show the verdict or its reset');

  // (d) the rename (added at Lorico's direction mid-build): every surface a driver sees says
  //     Split Decision, and the two things a rename must never touch — the storage keys and the
  //     repo path — are exactly where they were, or every installed copy loses its log / links.
  const store = rf('src/store.ts', 'utf8');
  const idx = rf('public/index.html', 'utf8');
  const mf = JSON.parse(rf('public/manifest.webmanifest', 'utf8'));
  const readme = rf('../README.md', 'utf8');
  if (!/<title>Split Decision — HOS What-If Planner<\/title>/.test(idx)) throw new Error('patch 7.1: the page title must be the launch lockup');
  if (mf.name !== 'Split Decision — HOS What-If Planner' || mf.short_name !== 'Split Decision') throw new Error('patch 7.1: the manifest must carry the launch name and short name');
  if (!/^# Split Decision — HOS What-If Planner/.test(readme) || /HOS Sandbox/.test(readme)) throw new Error('patch 7.1: the README must lead with the launch name and drop the codename');
  if (!/const KEY = 'hos-sandbox-v1'/.test(store) || !/'hos-sandbox-v1-backup'/.test(store) || !/UNDO_KEY = 'hos-sandbox-undo-v1'/.test(app)) throw new Error('patch 7.1: the storage keys must not move — renaming them wipes every log');
  if (!/REPO = 'hossandbox\/hossandbox\.github\.io'/.test(app)) throw new Error('patch 7.1: the repo path must not move — the repo is not renamed');
  ss({ tab: 'settings', nowOverride: null });
  h = out('patch 7.1/about name');
  if (!/Split Decision — HOS What-If Planner\./.test(h)) throw new Error('patch 7.1: About must open with the launch lockup');
  if (!/Your HOS what-if planner\./.test(h)) throw new Error('patch 7.1: About must carry the voice line');
  if (/what-if machine/.test(h)) throw new Error('patch 7.1: the retired "machine" line must not render');
  if (/HOS Sandbox/.test(h)) throw new Error('patch 7.1: no rendered surface may carry the old name');
  ss({ tab: 'now', disclaimerAcked: true });
  setLaunchNotice(true);
  h = out('patch 7.1/compact disclaimer name');
  if (!/Split Decision is a planning scratchpad/.test(h)) throw new Error('patch 7.1: the compact disclaimer must carry the new name');
  if (/HOS Sandbox/.test(h)) throw new Error('patch 7.1: the compact disclaimer must not carry the old name');
  ss({ disclaimerAcked: false });

  // (e) the back buttons return to wherever the driver entered from (folded in after Lorico hit
  //     it on his Pixel against live patch 7: from Now, the load flow's back landed on Plan).
  //     The entry handlers are pinned in the source; the flow is then driven by performing the
  //     same store writes the handlers make — the harness renders to string and cannot click.
  if (!/setState\(\{ tab: 'load', planReturn: 'now' \}\)/.test(app)) throw new Error("patch 7.1: Now's load door must record Now as the return");
  if (!/setState\(\{ tab: 'load', planReturn: 'recap' \}\)/.test(app)) throw new Error("patch 7.1: Recap's load door must record Recap as the return");
  if (!/setState\(\{ tab, planReturn: 'plan' \}\)/.test(app)) throw new Error('patch 7.1: the Plan hub doors must record Plan as the return');
  if (!/setState\(\{ tab: 'split', planReturn: 'now' \}\)/.test(app)) throw new Error("patch 7.1: Now's split door must record Now as the return");
  if ((app.match(/setState\(\{ tab: s\.planReturn \}\)/g) || []).length < 3) throw new Error("patch 7.1: the load flow's two backs and the planning back bar must all honour the recorded return");
  // from Now: question 1's back is labelled for Now and lands there
  ss({ segments: [], tentative: [], current: { status: 'ON', since: now - 60 }, tab: 'load', planReturn: 'now', loadCheck: { ...DL71 }, nowOverride: null });
  h = out('patch 7.1/load from now');
  if (!/How far is the load\?/.test(h)) throw new Error('patch 7.1: an unanswered check from Now must open on question 1');
  if (!/aria-label="Back to Now"/.test(h)) throw new Error("patch 7.1: from Now, question 1's back must say Back to Now");
  ss({ tab: gs().planReturn });
  if (gs().tab !== 'now') throw new Error("patch 7.1: from Now, the load flow's back must land on Now");
  h = out('patch 7.1/back landed on now');
  if (!/class="plan-item"/.test(h)) throw new Error('patch 7.1: after the back, Now must be showing');
  // the verdict's back says the same (the seeded finished check, entered from Now)
  ss({ nowOverride: L(12, 10), historyAcknowledged: true, tentative: [], current: { status: 'ON', since: L(12, 9) },
    segments: [{ status: 'OFF', start: L(11, 20), end: L(12, 9) }],
    config: { ...gs().config, timeZone: 'America/Chicago', dayStartHour: 0 },
    loadCheck: { miles: 300, dwell: 60, dwellOff: true, leaveIn: 30, waitOff: true, answered: true }, tab: 'load', planReturn: 'now' });
  h = out('patch 7.1/verdict from now');
  if (!/aria-label="Back to Now"/.test(h)) throw new Error("patch 7.1: from Now, the verdict's back must say Back to Now");
  // from the Plan hub: question 1's back is labelled for Plan and lands there, as it always did
  ss({ tab: 'load', planReturn: 'plan', loadCheck: { ...DL71 }, nowOverride: null });
  h = out('patch 7.1/load from plan');
  if (!/aria-label="Back to Plan"/.test(h)) throw new Error("patch 7.1: from Plan, question 1's back must say Back to Plan");
  ss({ tab: gs().planReturn });
  if (gs().tab !== 'plan') throw new Error("patch 7.1: from Plan, the load flow's back must land on Plan");
  h = out('patch 7.1/back landed on plan');
  if (!/Plan a run/.test(h)) throw new Error('patch 7.1: after the back, the Plan hub must be showing');
  // Split from Now: its back bar names Now and lands there
  ss({ tab: 'split', planReturn: 'now' });
  h = out('patch 7.1/split from now');
  if (!/class="back"(?:(?!<\/button>)[\s\S])*Now<\/button>/.test(h)) throw new Error("patch 7.1: from Now, Split's back bar must name Now");
  ss({ tab: gs().planReturn });
  if (gs().tab !== 'now') throw new Error("patch 7.1: from Now, Split's back must land on Now");
  // the recorded return is validated on load: garbage and absence both fall back to Plan,
  // and a real origin survives — old and damaged saves behave exactly as the app did before
  if (parseSaved(JSON.stringify({ planReturn: 'mars' })).planReturn !== 'plan') throw new Error('patch 7.1: a garbage recorded return must fall back to Plan');
  if (parseSaved(JSON.stringify({})).planReturn !== 'plan') throw new Error('patch 7.1: a save with no recorded return must fall back to Plan');
  if (parseSaved(JSON.stringify({ planReturn: 'recap' })).planReturn !== 'recap') throw new Error('patch 7.1: a real recorded return must survive a reload');

  // leave the store as the other sections expect to find it
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, nowOverride: null, tab: 'now', planReturn: 'plan', loadCheck: { ...DL71 } });
  setLaunchNotice(true);
  console.log('patch 7.1 (one load door on Now; Check another load; the Split Decision rename; back returns to where you came from): OK');
}
// --- patch 7.2: "Your last 8 days" — a read-only reflection of what was actually logged,
// reached from Recap. Three fences define it: logged rows only (planned/what-if time never
// poses as history, in either of its two storage forms), unlogged time reads "Not logged"
// rather than being filled in as rest, and the days are carrier days in the terminal zone —
// with the ELD named as the official record, because roadside proof is its job, not this app's.
{
  const { readFileSync: rf } = await import('node:fs');
  const { setState: ss, getState: gs, historyDays } = await import('../src/store.ts');
  const { setLaunchNotice } = await import('../src/app.tsx');
  const app = rf('src/app.tsx', 'utf8');
  setLaunchNotice(false);
  const L = (d, hh, m = 0) => Math.floor(Date.UTC(2026, 9, d, hh + 5, m) / 60000); // Oct d, CDT
  const NOW72 = L(12, 12); // Mon Oct 12 2026, 12:00 in Chicago

  // (a) the seed: yesterday worked 06:00–14:30 then went quiet; today sleeper until 07:00,
  //     drove 3h, and is on duty now. A what-if row sits in the tentative list over today's
  //     on-duty hours, and a tentative-flagged row sits inside yesterday's quiet stretch —
  //     neither may contribute a minute.
  ss({ tab: 'history', planReturn: 'recap', nowOverride: NOW72, historyAcknowledged: false, current: { status: 'ON', since: L(12, 10) },
    config: { ...gs().config, timeZone: 'America/Chicago', dayStartHour: 0 },
    segments: [
      { status: 'D', start: L(11, 6), end: L(11, 11) },
      { status: 'ON', start: L(11, 11), end: L(11, 11, 30) },
      { status: 'OFF', start: L(11, 11, 30), end: L(11, 14, 30) },
      { status: 'D', start: L(11, 15), end: L(11, 17), tentative: true },
      { status: 'SB', start: L(12, 0), end: L(12, 7) },
      { status: 'D', start: L(12, 7), end: L(12, 10) },
    ],
    tentative: [{ status: 'OFF', start: L(12, 10), end: L(12, 12) }] });
  const days = historyDays(gs(), NOW72);
  if (days.length !== 8) throw new Error('patch 7.2: the view must cover today plus the previous 7 days');
  if (!days[7].isToday || days[7].label !== '2026-10-12' || days[6].label !== '2026-10-11' || days[0].label !== '2026-10-05')
    throw new Error('patch 7.2: the 8 days must run oldest→today, labelled by carrier day');

  // (b)+(c) per-day totals are the LOGGED entries only: today D 3h / ON 2h (the live status) /
  //     SB 7h with NO off duty (the what-if row over 10:00–12:00 contributes nothing);
  //     yesterday D 5h / ON 30m / OFF 3h (the flagged row in the quiet stretch adds nothing)
  const t = days[7].totals, y = days[6].totals;
  if (t.D !== 180 || t.ON !== 120 || t.SB !== 420 || t.OFF !== 0) throw new Error(`patch 7.2: today's totals must be the logged rows only (saw D${t.D} ON${t.ON} SB${t.SB} OFF${t.OFF})`);
  if (y.D !== 300 || y.ON !== 30 || y.OFF !== 180 || y.SB !== 0) throw new Error(`patch 7.2: yesterday's totals must exclude the tentative-flagged row (saw D${y.D} ON${y.ON} OFF${y.OFF})`);
  if (days[7].notLogged !== 0) throw new Error('patch 7.2: today is fully logged — no not-logged time may be invented');

  // (d) unlogged time is not logged: yesterday has two quiet stretches — before the 06:00
  //     start (6h) and after 14:30 (9h 30m) — and both count as not logged, 15h 30m in all;
  //     a day with nothing at all is one plain not-logged stretch — never assumed rest
  if (days[6].notLogged !== 930) throw new Error(`patch 7.2: yesterday's quiet stretches must count as not logged (saw ${days[6].notLogged})`);
  if (days[0].items.length !== 1 || days[0].items[0].status !== null || days[0].notLogged !== 1440)
    throw new Error('patch 7.2: a day with nothing logged must be one not-logged stretch, not a day of rest');

  // (a)+(d)+(f) the render: 8 day sections, the totals in the driver's words, "Not logged" on
  //     screen, and the ELD named as the official record
  let h = out('patch 7.2/history seeded');
  if ((h.match(/<h2>/g) || []).length !== 8) throw new Error('patch 7.2: the view must render 8 day sections');
  if (!/Today — 2026-10-12/.test(h) || !/2026-10-05/.test(h)) throw new Error('patch 7.2: the day sections must run from the oldest day to Today');
  if (!/Driving <b>5h 00m<\/b>/.test(h) || !/Sleeper <b>7h 00m<\/b>/.test(h) || !/Not logged <b>15h 30m<\/b>/.test(h))
    throw new Error('patch 7.2: the rendered per-day totals must match the seeded logged entries');
  if (!/>Not logged</.test(h)) throw new Error('patch 7.2: unlogged stretches must render as Not logged');
  if (!/For your own review — your ELD holds the official record\./.test(h)) throw new Error('patch 7.2: the view must name the ELD as the official record');

  // (g) read-only: the view wires no click handler, opens no editor and offers no add/delete —
  //     the only button on the screen is the shared back bar, which lives outside the component
  const body = app.slice(app.indexOf('function HistoryTab'), app.indexOf('/* ============================================================ Can I take this load?'));
  if (/onClick|openSheet|setState|undoable/.test(body)) throw new Error('patch 7.2: the reflection view must not wire any editing or state-changing control');
  if (/Edit|Delete|Add a break/.test(h)) throw new Error('patch 7.2: the rendered view must carry no edit, delete or add controls');

  // the door and the way back: Recap offers the view, entering records Recap as the origin
  // (the patch 7.1 pattern), and the back bar names Recap and lands there
  if (!/setState\(\{ tab: 'history', planReturn: 'recap' \}\)/.test(app)) throw new Error("patch 7.2: Recap's door must record Recap as the return");
  ss({ tab: 'recap' });
  h = out('patch 7.2/recap door');
  if (!/Your last 8 days/.test(h)) throw new Error('patch 7.2: Recap must offer the last-8-days view');
  ss({ tab: 'history' });
  h = out('patch 7.2/back names recap');
  if (!/class="back"(?:(?!<\/button>)[\s\S])*Recap<\/button>/.test(h)) throw new Error("patch 7.2: the view's back bar must name Recap");
  ss({ tab: gs().planReturn });
  if (gs().tab !== 'recap') throw new Error("patch 7.2: the view's back must land on Recap");

  // (e) the DEMO/fresh state shows the empty state, not a week of invented history
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, nowOverride: null, tab: 'history' });
  h = out('patch 7.2/history fresh');
  if (!/Nothing logged yet — this fills in as you enter your real day\./.test(h)) throw new Error('patch 7.2: a fresh install must show the empty state');
  if ((h.match(/<h2>/g) || []).length !== 0 || />Not logged</.test(h)) throw new Error('patch 7.2: the fresh state must render no day sections and no not-logged rows');
  if (!/For your own review — your ELD holds the official record\./.test(h)) throw new Error('patch 7.2: the ELD note must ride the empty state too');

  // (h) bucketing follows the TERMINAL zone: 03:30–04:30 UTC is one stretch on the phone's
  //     clock but straddles the New York carrier midnight (04:00 UTC), so it must split
  //     30/30 across the two carrier days — phone-midnight bucketing would put all 60 on today
  const M = (iso) => Math.floor(new Date(iso).getTime() / 60000);
  ss({ tab: 'history', nowOverride: M('2026-10-12T12:00:00Z'), current: null, tentative: [],
    config: { ...gs().config, timeZone: 'America/New_York', dayStartHour: 0 },
    segments: [{ status: 'OFF', start: M('2026-10-12T03:30:00Z'), end: M('2026-10-12T04:30:00Z') }] });
  const zd = historyDays(gs(), M('2026-10-12T12:00:00Z'));
  if (zd[7].label !== '2026-10-12' || zd[6].label !== '2026-10-11') throw new Error('patch 7.2: day labels must be the terminal-zone carrier days');
  if (zd[6].totals.OFF !== 30 || zd[7].totals.OFF !== 30) throw new Error(`patch 7.2: a stretch crossing the terminal midnight must split across carrier days (saw ${zd[6].totals.OFF}/${zd[7].totals.OFF})`);

  // leave the store as the other sections expect to find it
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, nowOverride: null, tab: 'now', planReturn: 'plan',
    config: { ...gs().config, timeZone: 'America/Chicago', dayStartHour: 0 } });
  setLaunchNotice(true);
  console.log('patch 7.2 (Your last 8 days — logged only, not-logged stays not logged, the ELD is the record): OK');
}
// --- patch 8: "Start from my ELD clocks" — a mid-shift driver types the four clocks the ELD
// already shows instead of rebuilding a day the ELD knows. The synthesis is pessimism-bound:
// where the four numbers disagree, the stricter reading wins and a clock may come out LOWER
// than typed, never higher; earlier cycle usage is placed as recently as the numbers allow, so
// recap hours come back as late as possible; and split answers carry an Estimate label while
// they rest on the typed-in rows. Manual entry only — photo/voice entry is a later patch.
{
  const { readFileSync: rf } = await import('node:fs');
  const { setState: ss, getState: gs, synthesizeEldSeed, applyEldSeed, splitEstimateActive, historyBasis, loadSaved, parseSaved, ELD_SEED_NOTE } = await import('../src/store.ts');
  const { evaluate } = await import('../../engine/src/index.ts');
  const { openSheet, setLaunchNotice } = await import('../src/app.tsx');
  const app = rf('src/app.tsx', 'utf8');
  setLaunchNotice(false);
  const L = (d, hh, m = 0) => Math.floor(Date.UTC(2026, 9, d, hh + 5, m) / 60000); // Oct d, CDT
  const NOW8 = L(12, 12); // Mon Oct 12 2026, 12:00 in Chicago
  const CFG8 = { cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false };
  const CANON = { driveLeft: 300, windowLeft: 420, breakDueIn: 200, cycleLeft: 2400 };
  const clocksOf = (segs, cfg = CFG8, at = NOW8) => {
    const ev = evaluate(segs, { asOf: at, config: cfg, forecastDays: 9 });
    return { ev, drive: ev.shift.driveRemaining, window: ev.shift.windowRemaining, brk: ev.shift.breakRemaining, cycle: ev.cycle.remaining };
  };

  // (a) round-trip: a consistent set of four clocks comes back exactly — the app's own
  //     computation shows what was typed, and the seeded record manufactures no violations
  const seedA = synthesizeEldSeed(CANON, CFG8, NOW8, 1);
  const a = clocksOf(seedA.segments);
  if (a.drive !== 300 || a.window !== 420 || a.brk !== 200 || a.cycle !== 2400)
    throw new Error(`patch 8: a consistent seed must round-trip exactly (saw drive ${a.drive} window ${a.window} break ${a.brk} cycle ${a.cycle})`);
  if (seedA.notes.length !== 0) throw new Error(`patch 8: a consistent seed needs no adjustments (saw ${seedA.notes.join('; ')})`);
  if (a.ev.violations.length !== 0) throw new Error('patch 8: a seeded record must not manufacture violations');
  // the corners round-trip too: a full clock and a spent one
  for (const [input, want] of [
    [{ driveLeft: 660, windowLeft: 840, breakDueIn: 480, cycleLeft: 4200 }, { drive: 660, window: 840, brk: 480, cycle: 4200 }],
    [{ driveLeft: 0, windowLeft: 0, breakDueIn: 0, cycleLeft: 0 }, { drive: 0, window: 0, brk: 0, cycle: 0 }],
  ]) {
    const c = clocksOf(synthesizeEldSeed(input, CFG8, NOW8, 1).segments);
    if (c.drive !== want.drive || c.window !== want.window || c.brk !== want.brk || c.cycle !== want.cycle)
      throw new Error(`patch 8: corner seed ${JSON.stringify(input)} must round-trip (saw ${JSON.stringify({ drive: c.drive, window: c.window, brk: c.brk, cycle: c.cycle })})`);
  }
  // and under the other cycle: 60/7 with its own limit and window length
  const c60 = clocksOf(synthesizeEldSeed({ ...CANON, cycleLeft: 1800 }, { ...CFG8, cycle: '60/7' }, NOW8, 1).segments, { ...CFG8, cycle: '60/7' });
  if (c60.cycle !== 1800 || c60.drive !== 300) throw new Error(`patch 8: a 60/7 seed must round-trip its own cycle (saw cycle ${c60.cycle} drive ${c60.drive})`);

  // (b) pessimism: where the numbers disagree, every clock comes out at or below what was
  //     typed — the break clock implies 7h of driving the drive clock denies, so driving
  //     counts (drive left drops to 4h) and the window stretches to hold it (drops to 7h)
  const b1 = clocksOf(synthesizeEldSeed({ driveLeft: 660, windowLeft: 840, breakDueIn: 60, cycleLeft: 4200 }, CFG8, NOW8, 1).segments);
  if (b1.brk !== 60 || b1.drive !== 240) throw new Error(`patch 8: driving implied by the break clock must count (saw drive ${b1.drive} break ${b1.brk})`);
  if (b1.drive > 660 || b1.window > 840 || b1.brk > 60 || b1.cycle > 4200) throw new Error('patch 8: no clock may come out above what was typed');
  // drive left greater than window left is not an error — the usable time is the smaller one
  const b2 = clocksOf(synthesizeEldSeed({ driveLeft: 600, windowLeft: 300, breakDueIn: 480, cycleLeft: 4200 }, CFG8, NOW8, 1).segments);
  if (b2.drive !== 600 || b2.window !== 300 || b2.ev.driveNow !== 300) throw new Error(`patch 8: usable time must be the most restrictive clock (saw drive ${b2.drive} window ${b2.window} driveNow ${b2.ev.driveNow})`);
  // over-max values clamp to the legal ceiling, and the clamping is said out loud
  const over = synthesizeEldSeed({ driveLeft: 900, windowLeft: 1000, breakDueIn: 481, cycleLeft: 5000 }, CFG8, NOW8, 1);
  const b3 = clocksOf(over.segments);
  if (b3.drive !== 660 || b3.window !== 840 || b3.brk !== 480 || b3.cycle !== 4200) throw new Error('patch 8: over-max clocks must clamp to the legal ceilings');
  if (!over.notes.some((n) => /Drive time left can't be more than 11h 00m/.test(n)) || !over.notes.some((n) => /Cycle time left can't be more than 70h 00m/.test(n)))
    throw new Error('patch 8: a clamped clock must be named in the notes');
  const strict = synthesizeEldSeed({ driveLeft: 660, windowLeft: 840, breakDueIn: 60, cycleLeft: 4200 }, CFG8, NOW8, 1);
  if (!strict.notes.some((n) => /stricter one won/.test(n))) throw new Error('patch 8: a disagreement between the clocks must be named in the notes');

  // (c) cycle placement: the canonical seed's earlier usage (30h) sits against the recent end
  //     of the window — 4h 30m on Oct 10 and 19h on Oct 11, nothing on the oldest day — so it
  //     drops off at the LATEST forecast steps (Oct 18 and Oct 19), never early
  const days = a.ev.cycle.days;
  if (days[0].label !== '2026-10-05' || days[0].onDuty !== 0) throw new Error('patch 8: no synthesized usage may sit on the oldest window day (it would hand hours back early)');
  if (days[5].onDuty !== 270 || days[6].onDuty !== 1140 || days[7].onDuty !== 390)
    throw new Error(`patch 8: earlier usage must pack against the recent days (saw ${days.map((d) => `${d.label}:${d.onDuty}`).join(' ')})`);
  const fc = a.ev.cycle.forecast;
  if (fc.slice(0, 5).some((f) => f.dropsOff !== 0) || fc[5].dropsOff !== 270 || fc[6].dropsOff !== 1140)
    throw new Error(`patch 8: seeded usage must come back at the latest possible days (saw ${fc.map((f) => `${f.label}:${f.dropsOff}`).join(' ')})`);

  // (d) seeding ends the DEMO state: rows carry the provenance note, the stamp is set, and
  //     the driver is left Off Duty at now — the seed invents nothing after now
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, seededAt: null, nowOverride: NOW8, tab: 'now', config: { ...CFG8 } });
  const { patch } = applyEldSeed(gs(), CANON, NOW8);
  ss(patch);
  if (historyBasis(gs(), NOW8) === 'fresh') throw new Error('patch 8: seeding must end the DEMO state');
  if (gs().seededAt !== NOW8) throw new Error('patch 8: the seed stamp must be recorded');
  if (!gs().current || gs().current.status !== 'OFF' || gs().current.since !== NOW8) throw new Error('patch 8: the driver must be left Off Duty at now');
  if (gs().segments.length === 0 || !gs().segments.every((x) => x.note === ELD_SEED_NOTE)) throw new Error('patch 8: every seeded row must carry the provenance note');
  if (gs().segments.some((x) => x.end > NOW8)) throw new Error('patch 8: the seed must not invent time after now');
  if (gs().tentative.length !== 0) throw new Error('patch 8: seeding replaces any what-if rows, never mixes with them');

  // (f) the seeded save passes the patch 5.2 validation and reloads identically — and a
  //     pre-patch-8 save (no stamp, no marked rows) still loads as itself
  const loaded = loadSaved();
  if (JSON.stringify(loaded.segments) !== JSON.stringify(gs().segments) || loaded.seededAt !== NOW8)
    throw new Error('patch 8: a seeded save must survive validation and reload unchanged');
  const preEight = JSON.stringify({ segments: [{ status: 'OFF', start: NOW8 - 600, end: NOW8 }], current: null, config: { ...CFG8 } });
  localStorage.setItem('hos-sandbox-v1', preEight);
  const old = loadSaved();
  if (old.seededAt !== null || old.segments.length !== 1 || old.segments[0].start !== NOW8 - 600)
    throw new Error('patch 8: a pre-patch-8 save must still load, read as never seeded');
  if (parseSaved(preEight).seededAt !== null) throw new Error('patch 8: a save with no stamp parses as never seeded');

  // (e) the Estimate label: up while the current shift stands on seeded rows, rendered on
  //     screen, and gone once the driver's own record covers that ground — a real reset
  //     taken after seeding firms the estimate up even though seeded rows remain behind it
  if (!splitEstimateActive(gs(), NOW8)) throw new Error('patch 8: a fresh seed must read as an estimate');
  let h = out('patch 8/seeded now');
  if (/DEMO — not your day/.test(h) || /is-demo/.test(h)) throw new Error('patch 8: a seeded app must leave the DEMO state behind');
  if (!/Estimate — from the clocks you entered; firms up as your own entries replace them\./.test(h))
    throw new Error('patch 8: split answers must carry the Estimate label while they rest on the seed');
  const firmed = {
    segments: [...seedA.segments,
      { status: 'OFF', start: NOW8 + 60, end: NOW8 + 660 },
      { status: 'D', start: NOW8 + 660, end: NOW8 + 720 }],
    current: { status: 'OFF', since: NOW8 + 720 },
  };
  if (splitEstimateActive({ ...gs(), ...firmed }, NOW8 + 720)) throw new Error("patch 8: a real reset after seeding must clear the Estimate label");
  const realOnly = { segments: [{ status: 'OFF', start: NOW8 - 1500, end: NOW8 - 900 }, { status: 'D', start: NOW8 - 900, end: NOW8 - 600 }], current: { status: 'OFF', since: NOW8 - 600 } };
  if (splitEstimateActive({ ...gs(), ...realOnly }, NOW8)) throw new Error('patch 8: a record with no seeded rows is never an estimate');

  // (g) the way in: the DEMO banner offers the quick start, the panel carries the four clocks
  //     as numeric boxes, and the wiring runs through the tested store path
  if (!/openSheet\(\{ kind: 'quickstart' \}\)/.test(app)) throw new Error('patch 8: the DEMO banner must offer the quick start');
  const sheetBody = app.slice(app.indexOf('function QuickStartSheet'), app.indexOf('function StatusSheet'));
  if (!/applyEldSeed\(getState\(\), clocks, now\)/.test(sheetBody)) throw new Error('patch 8: the panel must seed through the tested store path');
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, seededAt: null, nowOverride: null, tab: 'now', config: { ...CFG8 } });
  h = out('patch 8/demo entry');
  if (!/Start from my ELD clocks/.test(h)) throw new Error('patch 8: a fresh install must offer the quick start');
  openSheet({ kind: 'quickstart' });
  h = out('patch 8/quickstart panel');
  for (const label of ['Drive time left', 'Shift time left', 'Break due in', 'Cycle time left'])
    if (!h.includes(label)) throw new Error(`patch 8: the panel must ask for the ${label} clock`);
  if ((h.match(/inputmode="numeric"/g) || []).length < 8) throw new Error('patch 8: every clock needs hours and minutes boxes on the numeric keypad');
  if (!/Type the four clocks your ELD shows/.test(h)) throw new Error('patch 8: the panel must say what to type, in driver words');
  openSheet(null);

  // leave the store as the other sections expect to find it
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, seededAt: null, nowOverride: null, tab: 'now', planReturn: 'plan', config: { ...CFG8 } });
  setLaunchNotice(true);
  console.log('patch 8 (Start from my ELD clocks — round-trip exact, pessimism-bound, estimate labelled): OK');
}
// --- patch 9: "Check against my ELD" — the drift check. Mid-shift the log and the real world
// drift apart (a drive stretch never got tapped) and every answer inherits the error. The driver
// types ONE number — the ELD's drive time left — and the app compares it with its own: in sync,
// nothing changes; ELD shows less, the missing driving is named and one tap back-fills it into
// the unlogged stretch it belongs in; ELD shows more, nothing is ever taken out of the log —
// the missing break belongs on the Log. The fill is an ordinary row (note "Drift check"),
// undo-able like any other add, and tentative rows are never read or touched.
{
  const { readFileSync: rf } = await import('node:fs');
  const { setState: ss, getState: gs, allSegments, driftCheck, planDriftFill, loadSaved, historyBasis, DRIFT_NOTE, DRIFT_TOLERANCE_MIN } = await import('../src/store.ts');
  const { evaluate } = await import('../../engine/src/index.ts');
  const { openSheet, setLaunchNotice, addDriftFill, currentUndo, undoLast } = await import('../src/app.tsx');
  const app = rf('src/app.tsx', 'utf8');
  setLaunchNotice(false);
  const L = (d, hh, m = 0) => Math.floor(Date.UTC(2026, 9, d, hh + 5, m) / 60000); // Oct d, CDT
  const NOW9 = L(12, 12); // Mon Oct 12 2026, 12:00 in Chicago
  const CFG9 = { cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false };
  const snap = () => JSON.stringify({ segments: gs().segments, tentative: gs().tentative, current: gs().current });
  // The main scenario: a 10h rest, 2h driving, 30m on duty, then a 50-minute hole nobody
  // logged, and the driver on duty since 11:20. The app's drive clock reads 9h 00m left;
  // a driver who actually drove the hole reads 8h 10m on his ELD.
  const gap50 = () => ss({
    segments: [
      { status: 'OFF', start: L(11, 22), end: L(12, 8) },
      { status: 'D', start: L(12, 8), end: L(12, 10) },
      { status: 'ON', start: L(12, 10), end: L(12, 10, 30) },
    ],
    tentative: [{ status: 'D', start: NOW9 + 120, end: NOW9 + 240, tentative: true }],
    current: { status: 'ON', since: L(12, 11, 20) },
    historyAcknowledged: false, seededAt: null, nowOverride: NOW9, tab: 'now', config: { ...CFG9 },
  });

  // (a) in sync: the ELD number equal to the app's — and within the 2-minute tolerance either
  //     way — reports agreement and writes nothing at all
  gap50();
  const clean = snap();
  const mine = evaluate(allSegments(gs(), NOW9), { asOf: NOW9, config: gs().config });
  const sync = driftCheck(gs(), 540, NOW9);
  if (sync.appLeft !== Math.round(mine.shift.driveRemaining) || sync.appLeft !== 540)
    throw new Error(`patch 9: the check must read the app's own number (saw appLeft ${sync.appLeft}, engine ${mine.shift.driveRemaining})`);
  if (sync.verdict !== 'sync' || sync.gap !== 0) throw new Error('patch 9: equal numbers must read as in sync');
  if (driftCheck(gs(), 540 - DRIFT_TOLERANCE_MIN, NOW9).verdict !== 'sync' || driftCheck(gs(), 540 + DRIFT_TOLERANCE_MIN, NOW9).verdict !== 'sync')
    throw new Error('patch 9: a difference inside the tolerance must still read as in sync');
  if (driftCheck(gs(), 540 - DRIFT_TOLERANCE_MIN - 1, NOW9).verdict !== 'missing')
    throw new Error('patch 9: one minute past the tolerance is drift, not agreement');
  if (addDriftFill(540, NOW9) !== null || snap() !== clean) throw new Error('patch 9: an in-sync check must write nothing');

  // (b) missing driving: a known 50-minute gap, named exactly — the gap comes from the app's
  //     own evaluation minus the typed number, not from echoing the input
  const miss = driftCheck(gs(), 490, NOW9);
  if (miss.verdict !== 'missing' || miss.gap !== -50 || miss.appLeft !== 540 || miss.eldLeft !== 490)
    throw new Error(`patch 9: the gap must be named exactly (saw ${JSON.stringify(miss)})`);
  if (snap() !== clean) throw new Error('patch 9: comparing must never write');

  // (c) the back-fill: one Driving row of exactly the gap, in the unlogged stretch, ending
  //     where the driver's current status begins; after it, the clocks agree to the minute
  const plan = planDriftFill(gs(), 50, NOW9);
  if (!plan || plan.start !== L(12, 10, 30) || plan.end !== L(12, 11, 20) || plan.filled !== 50 || plan.remainder !== 0)
    throw new Error(`patch 9: the fill must land in the hole, whole (saw ${JSON.stringify(plan)})`);
  const rowsBefore = gs().segments.length;
  const tentBefore = JSON.stringify(gs().tentative);
  const r = addDriftFill(490, NOW9);
  if (!r) throw new Error('patch 9: a fillable gap must fill');
  if (r.row.status !== 'D' || r.row.note !== DRIFT_NOTE || DRIFT_NOTE !== 'Drift check' || r.row.end - r.row.start !== 50)
    throw new Error('patch 9: the fill must be one Driving row of the gap length, carrying the provenance note');
  if (gs().segments.length !== rowsBefore + 1 || JSON.stringify(gs().tentative) !== tentBefore)
    throw new Error('patch 9: the fill adds exactly one row and never touches what-if rows');
  for (const old of JSON.parse(clean).segments)
    if (r.row.start < old.end && old.start < r.row.end) throw new Error('patch 9: the fill must not overlap a logged row');
  if (r.after.verdict !== 'sync' || r.after.appLeft !== 490 || driftCheck(gs(), 490, NOW9).gap !== 0)
    throw new Error(`patch 9: after the fill the clocks must agree exactly (saw ${JSON.stringify(r.after)})`);

  // (f) the fill is an ordinary edit: the saved record passes validation and reloads
  //     identically, and the Log's undo takes the row back out, gap and all
  if (!/^Added Driving/.test(currentUndo()?.label ?? '')) throw new Error('patch 9: the fill must be undo-able like any other add');
  if (JSON.stringify(loadSaved().segments) !== JSON.stringify(gs().segments))
    throw new Error('patch 9: a record carrying the fill must pass save validation and reload unchanged');
  if (!undoLast() || snap() !== clean || driftCheck(gs(), 490, NOW9).gap !== -50)
    throw new Error('patch 9: undoing the fill must restore the record exactly, gap included');

  // (c2) placement precedence: when the most recent stretch cannot hold the gap, an earlier
  //      stretch that can takes the whole fill — anchored at its end — rather than splitting
  ss({
    segments: [
      { status: 'OFF', start: L(11, 20), end: L(12, 6) },
      { status: 'D', start: L(12, 7, 20), end: L(12, 9, 20) },
      { status: 'ON', start: L(12, 9, 20), end: L(12, 9, 50) },
    ],
    tentative: [], current: { status: 'ON', since: L(12, 10, 25) },
    historyAcknowledged: false, seededAt: null, nowOverride: NOW9, tab: 'now', config: { ...CFG9 },
  });
  const p2 = planDriftFill(gs(), 50, NOW9);
  if (!p2 || p2.start !== L(12, 6, 30) || p2.end !== L(12, 7, 20) || p2.filled !== 50 || p2.remainder !== 0)
    throw new Error(`patch 9: the whole fill goes in the most recent stretch that holds it (saw ${JSON.stringify(p2)})`);
  const r2 = addDriftFill(490, NOW9);
  if (!r2 || r2.after.verdict !== 'sync' || r2.after.appLeft !== 490)
    throw new Error(`patch 9: an earlier-stretch fill must still true the clock up (saw ${JSON.stringify(r2?.after)})`);
  if (!undoLast()) throw new Error('patch 9: the earlier-stretch fill must be undo-able too');

  // (e) partial fill: the only stretch takes 35 of the 50 minutes — what fits goes in and the
  //     remainder is named, in the plan and in the still-open gap afterwards
  ss({
    segments: [
      { status: 'OFF', start: L(11, 22), end: L(12, 8) },
      { status: 'D', start: L(12, 8), end: L(12, 10) },
      { status: 'ON', start: L(12, 10), end: L(12, 10, 30) },
    ],
    tentative: [], current: { status: 'ON', since: L(12, 11, 5) },
    historyAcknowledged: false, seededAt: null, nowOverride: NOW9, tab: 'now', config: { ...CFG9 },
  });
  const p3 = planDriftFill(gs(), 50, NOW9);
  if (!p3 || p3.filled !== 35 || p3.remainder !== 15 || p3.start !== L(12, 10, 30) || p3.end !== L(12, 11, 5))
    throw new Error(`patch 9: a short stretch fills what fits and names the rest (saw ${JSON.stringify(p3)})`);
  const r3 = addDriftFill(490, NOW9);
  if (!r3 || r3.after.gap !== -15 || r3.after.appLeft !== 505)
    throw new Error(`patch 9: after a partial fill the named remainder must be the gap that is left (saw ${JSON.stringify(r3?.after)})`);

  // (d) the other direction: the ELD shows MORE left than the app. Nothing is offered and
  //     nothing is written — the record comes out byte-identical, because a re-sync must
  //     never be a way to take driving back out of a log
  gap50();
  const beforeExtra = snap();
  const extra = driftCheck(gs(), 600, NOW9);
  if (extra.verdict !== 'extra' || extra.gap !== 60) throw new Error(`patch 9: the pessimistic direction must be named, not fixed (saw ${JSON.stringify(extra)})`);
  if (addDriftFill(600, NOW9) !== null || snap() !== beforeExtra)
    throw new Error('patch 9: the ELD-shows-more direction must leave the record byte-identical');

  // (g) the way in: no entry on the DEMO clock (the panel itself routes to the quick start),
  //     a plan-item entry on a real record, and the panel asks for the one number in driver
  //     words, on the big numeric fields, wired through the tested paths
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, seededAt: null, nowOverride: null, tab: 'now', config: { ...CFG9 } });
  let h = out('patch 9/demo now');
  if (/Check against my ELD/.test(h)) throw new Error('patch 9: the DEMO clock has no day to check — the entry must not show');
  openSheet({ kind: 'drift' });
  h = out('patch 9/demo drift panel');
  if (!/nothing to check yet/.test(h) || !/Start from my ELD clocks/.test(h))
    throw new Error('patch 9: on the DEMO clock the panel must route the driver to the quick start');
  openSheet(null);
  gap50();
  h = out('patch 9/logged now');
  if (!/Check against my ELD/.test(h)) throw new Error('patch 9: a real record must offer the check on Now');
  openSheet({ kind: 'drift' });
  h = out('patch 9/drift panel');
  if (!/Drive time left on your ELD/.test(h)) throw new Error('patch 9: the panel must ask for the one number, in driver words');
  if (!/Your ELD is the official record/.test(h)) throw new Error('patch 9: the panel must name the ELD as the record');
  if ((h.match(/inputmode="numeric"/g) || []).length < 2) throw new Error('patch 9: the number needs hours and minutes boxes on the numeric keypad');
  openSheet(null);
  if (historyBasis(gs(), NOW9) === 'fresh') throw new Error('patch 9: the main scenario must be a real record');
  const sheetBody = app.slice(app.indexOf('function DriftSheet'), app.indexOf('function StatusSheet'));
  if (!/driftCheck\(getState\(\), eld, now\)/.test(sheetBody) || !/addDriftFill\(eld, at\)/.test(sheetBody))
    throw new Error('patch 9: the panel must run through the tested comparison and fill paths');

  // leave the store as the other sections expect to find it
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, seededAt: null, nowOverride: null, tab: 'now', planReturn: 'plan', config: { ...CFG9 } });
  setLaunchNotice(true);
  console.log('patch 9 (Check against my ELD — one number, named gap, back-fill only ever adds driving): OK');
}

// --- patch 9.1: the drift check hardened. An independent verification of patch 9 (Opus,
// Nov 7) reproduced every patch 9 result and then found two ways the fill could still write
// time that never happened, plus three behaviours the patch 9 section asserted but did not
// actually pin. These probes are those findings, as tests: (h) a future-dated logged row
// must not let a fill land past now; (i) a stale what-if row must not steer the comparison —
// the check reads the logged record only, the same selection the fill places into; (j) the
// tolerance is the literal two minutes, pinned behaviourally on both sides; (k) inside the
// tolerance the fill path itself must write nothing — the verdict guard is under test;
// (l) when two stretches both hold the gap, the most recent one takes it.
{
  const { setState: ss, getState: gs, driftCheck, planDriftFill, DRIFT_TOLERANCE_MIN } = await import('../src/store.ts');
  const { addDriftFill } = await import('../src/app.tsx');
  const L = (d, hh, m = 0) => Math.floor(Date.UTC(2026, 9, d, hh + 5, m) / 60000); // Oct d, CDT
  const NOW9 = L(12, 12); // Mon Oct 12 2026, 12:00 in Chicago
  const CFG9 = { cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false };
  const snap = () => JSON.stringify({ segments: gs().segments, tentative: gs().tentative, current: gs().current });

  // (h) never past now: a logged row dated in the FUTURE (an import can carry one, and the
  //     engine warns about them rather than refusing them) leaves an unlogged stretch that
  //     runs past now — 12:00 to 13:00 here. The fill must clip to now and take the whole
  //     gap from the stretch that is really there: 10:00–11:50, anchored at its end.
  ss({
    segments: [
      { status: 'OFF', start: L(11, 22), end: L(12, 8) },
      { status: 'D', start: L(12, 8), end: L(12, 10) },
      { status: 'OFF', start: L(12, 13), end: L(12, 14) },
    ],
    tentative: [], current: { status: 'ON', since: L(12, 11, 50) },
    historyAcknowledged: false, seededAt: null, nowOverride: NOW9, tab: 'now', config: { ...CFG9 },
  });
  const planH = planDriftFill(gs(), 50, NOW9);
  if (!planH || planH.start !== L(12, 11) || planH.end !== L(12, 11, 50) || planH.filled !== 50 || planH.remainder !== 0)
    throw new Error(`patch 9.1: no fill minute may land past now, even with a future-dated row in the record (saw ${JSON.stringify(planH)})`);
  const rH = addDriftFill(490, NOW9);
  if (!rH || rH.row.start !== L(12, 11) || rH.row.end !== L(12, 11, 50) || rH.row.end > NOW9)
    throw new Error('patch 9.1: the written row must sit wholly at or before now');
  if (rH.after.verdict !== 'sync' || driftCheck(gs(), 490, NOW9).gap !== 0)
    throw new Error('patch 9.1: after a now-clipped fill the clocks must agree');
  if (!gs().segments.some((x) => x.start === L(12, 13) && x.end === L(12, 14)))
    throw new Error('patch 9.1: the future-dated row is the driver\'s data — it must be left exactly as logged');

  // (i) stale what-if: the driver planned OFF 10:00–12:00, then just kept driving from
  //     08:00 instead. The logged record is correct and complete (a 10h rest, a 30-minute
  //     unlogged hole before the driving started, then driving through to 12:30), and the
  //     ELD's 6h 30m is the truth. The comparison must read the logged record only: a plan
  //     the driver never took must not inflate the app's side into a "missing" verdict
  //     with a fill behind it — that would write driving that never happened.
  const NOW91 = L(12, 12, 30);
  ss({
    segments: [
      { status: 'OFF', start: L(11, 21, 30), end: L(12, 7, 30) },
    ],
    tentative: [{ status: 'OFF', start: L(12, 10), end: L(12, 12), tentative: true }],
    current: { status: 'D', since: L(12, 8) },
    historyAcknowledged: false, seededAt: null, nowOverride: NOW91, tab: 'now', config: { ...CFG9 },
  });
  const snapI = snap();
  const chkI = driftCheck(gs(), 390, NOW91);
  if (chkI.verdict !== 'sync' || chkI.appLeft !== 390 || chkI.gap !== 0)
    throw new Error(`patch 9.1: a stale what-if must not steer the comparison — the logged record agrees with the ELD (saw ${JSON.stringify(chkI)})`);
  if (addDriftFill(390, NOW91) !== null || snap() !== snapI)
    throw new Error('patch 9.1: with a correct log the check must write nothing, what-if or not');

  // (j) the tolerance is two minutes — pinned with LITERALS on both sides, not the
  //     constant, so widening DRIFT_TOLERANCE_MIN turns this section red (the patch 9
  //     section scales its probes with the constant and cannot catch that). The main
  //     patch 9 geometry: the app's number is 540.
  ss({
    segments: [
      { status: 'OFF', start: L(11, 22), end: L(12, 8) },
      { status: 'D', start: L(12, 8), end: L(12, 10) },
      { status: 'ON', start: L(12, 10), end: L(12, 10, 30) },
    ],
    tentative: [], current: { status: 'ON', since: L(12, 11, 20) },
    historyAcknowledged: false, seededAt: null, nowOverride: NOW9, tab: 'now', config: { ...CFG9 },
  });
  if (DRIFT_TOLERANCE_MIN !== 2) throw new Error('patch 9.1: the drift tolerance is two minutes');
  if (driftCheck(gs(), 538, NOW9).verdict !== 'sync' || driftCheck(gs(), 542, NOW9).verdict !== 'sync')
    throw new Error('patch 9.1: two minutes either way is still agreement');
  if (driftCheck(gs(), 537, NOW9).verdict !== 'missing')
    throw new Error('patch 9.1: three minutes short is drift (missing), not agreement');
  if (driftCheck(gs(), 543, NOW9).verdict !== 'extra')
    throw new Error('patch 9.1: three minutes over is drift (extra), not agreement');

  // (k) the verdict guard itself: at gap −2 the verdict is sync, so the fill path must
  //     return null AND write nothing. At gap 0 this would prove little — a zero-minute
  //     fill plans to null on its own — but at −2 a missing guard writes a real
  //     two-minute row into the most recent stretch.
  const snapK = snap();
  if (addDriftFill(538, NOW9) !== null || snap() !== snapK)
    throw new Error('patch 9.1: inside the tolerance the fill path must write nothing at all');

  // (l) precedence when TWO stretches both hold the gap (80 minutes at 06:00–07:20 and
  //     35 at 09:50–10:25, gap 30): the most recent takes it, whole, anchored at its
  //     end. Patch 9's case (c2) has only one stretch that fits, so it cannot catch a
  //     precedence flip — this one can.
  ss({
    segments: [
      { status: 'OFF', start: L(11, 20), end: L(12, 6) },
      { status: 'D', start: L(12, 7, 20), end: L(12, 9, 20) },
      { status: 'ON', start: L(12, 9, 20), end: L(12, 9, 50) },
    ],
    tentative: [], current: { status: 'ON', since: L(12, 10, 25) },
    historyAcknowledged: false, seededAt: null, nowOverride: NOW9, tab: 'now', config: { ...CFG9 },
  });
  const planL = planDriftFill(gs(), 30, NOW9);
  if (!planL || planL.start !== L(12, 9, 55) || planL.end !== L(12, 10, 25) || planL.filled !== 30 || planL.remainder !== 0)
    throw new Error(`patch 9.1: with two stretches that fit, the most recent takes the fill (saw ${JSON.stringify(planL)})`);
  const rL = addDriftFill(510, NOW9);
  if (!rL || rL.row.start !== L(12, 9, 55) || rL.row.end !== L(12, 10, 25) || rL.after.verdict !== 'sync' || rL.after.appLeft !== 510)
    throw new Error(`patch 9.1: the most-recent fill must land whole and true the clock up (saw ${JSON.stringify(rL?.after)})`);

  // leave the store as the other sections expect to find it
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, seededAt: null, nowOverride: null, tab: 'now', planReturn: 'plan', config: { ...CFG9 } });
  console.log('patch 9.1 (drift check hardened — fills clipped to now, comparison reads the logged record only, tolerance and precedence pinned): OK');
}

// --- patch 9.2: the F1 fix. The ELD boxes on BOTH panels (the patch 8 quick start and the
// patch 9 drift check) read hours with Math.round, so a fractional entry was silently
// rounded: "7.25" hours became 420 (15 minutes lost) and turned a correct log into a
// "missing" verdict whose fill wrote driving that never happened; "0.5" became 60
// (30 invented). An independent verification (Opus, Nov 7) reproduced both directions.
// The fix is one shared whole-number parse: the boxes refuse fractions outright instead
// of rounding or converting them, and every verdict states the ELD number the app used.
{
  const { readFileSync: rf } = await import('node:fs');
  const { setState: ss, getState: gs, driftCheck, planDriftFill, readEldEntry } = await import('../src/store.ts');
  const { addDriftFill } = await import('../src/app.tsx');
  const app = rf('src/app.tsx', 'utf8');
  const L = (d, hh, m = 0) => Math.floor(Date.UTC(2026, 9, d, hh + 5, m) / 60000); // Oct d, CDT
  const NOW9 = L(12, 12); // Mon Oct 12 2026, 12:00 in Chicago
  const CFG9 = { cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false };

  // (m) the parse itself: exact whole numbers, and a fraction is refused in BOTH
  //     directions — never rounded down to 420, never rounded up to 60, never converted
  const exact = readEldEntry('7', '15');
  if (!exact.ok || exact.minutes !== 435) throw new Error(`patch 9.2: a plain entry must read exactly (saw ${JSON.stringify(exact)})`);
  const down = readEldEntry('7.25', '');
  if (down.ok) throw new Error('patch 9.2: "7.25" hours must be refused — rounded down it reads 420 and writes phantom driving');
  if (down.problem !== 'fraction') throw new Error('patch 9.2: a fractional entry must be named as one, so the panel can teach the fix');
  if (readEldEntry('0.5', '').ok) throw new Error('patch 9.2: "0.5" hours must be refused — rounded up it invents 30 minutes');
  if (readEldEntry('7', '15.5').ok) throw new Error('patch 9.2: fractional minutes must be refused too — no rounding anywhere on this path');
  if (readEldEntry('abc', '').ok || readEldEntry('-1', '').ok || readEldEntry('1e3', '').ok)
    throw new Error('patch 9.2: anything that is not plain digits must be refused');
  const blanks = readEldEntry('', '30');
  const whole = readEldEntry('7', '');
  const spaced = readEldEntry(' 7 ', ' 15 ');
  if (!blanks.ok || blanks.minutes !== 30 || !whole.ok || whole.minutes !== 420 || !spaced.ok || spaced.minutes !== 435)
    throw new Error('patch 9.2: an empty box is zero and whole hours are exact — 7 typed whole IS 420 minutes');

  // (m2) neither panel may round a typed clock, and both must run through the shared parse
  if (/Math\.round\(hv\)/.test(app)) throw new Error('patch 9.2: no panel may round a typed clock');
  const qsBody = app.slice(app.indexOf('function QuickStartSheet'), app.indexOf('function DriftSheet'));
  const driftBody = app.slice(app.indexOf('function DriftSheet'), app.indexOf('function StatusSheet'));
  if (!/readEldEntry\(/.test(qsBody) || !/readEldEntry\(/.test(driftBody))
    throw new Error('patch 9.2: both panels must read their boxes through the shared whole-number parse');

  // (n) the echo: every drift verdict states the ELD number the app actually used, and on
  //     the missing verdict it stands BEFORE the fill is offered — a driver whose entry
  //     was misread gets the cue before anything is written. The quick-start result step
  //     likewise states the four clocks as read. (Verdict screens render after a tap the
  //     string harness cannot dispatch, so — like patch 9 (g) — these are source pins.)
  if ((driftBody.match(/Your ELD says:/g) || []).length < 3)
    throw new Error('patch 9.2: every drift verdict (sync, extra, missing) must echo the ELD number the app used');
  if ((driftBody.match(/Your ELD says: <b>\{dur\(check\.eldLeft\)\}<\/b>/g) || []).length < 3
      || /Your ELD says: <b>\{dur\(check\.appLeft\)\}/.test(driftBody))
    throw new Error('patch 9.2: the echo must state the ELD number (check.eldLeft) on every verdict, never the app number');
  if (!(driftBody.lastIndexOf('Your ELD says:') < driftBody.indexOf('It fits as Driving'))
      || !(driftBody.lastIndexOf('Your ELD says:') < driftBody.indexOf('Add the missing driving')))
    throw new Error('patch 9.2: the missing verdict must state the ELD number before the fill is offered');
  if (!/clocks as read/.test(qsBody) || !/dur\(done\.clocks\[f\.key\]\)/.test(qsBody))
    throw new Error('patch 9.2: the quick-start result must state the four clocks as read');

  // (o) F2: the trailing stretch's clip at now, pinned. With no live status the record
  //     ends at 10:30 and now is 12:00; the gap is 140 but only the 90 minutes up to now
  //     exist — the plan takes those and names the 50 remainder, and the written row
  //     ends AT now, never past it. (Before 9.2 nothing pinned this clip: stretching the
  //     trailing end to now+60 shipped green.)
  ss({
    segments: [
      { status: 'OFF', start: L(11, 22), end: L(12, 8) },
      { status: 'D', start: L(12, 8), end: L(12, 10) },
      { status: 'ON', start: L(12, 10), end: L(12, 10, 30) },
    ],
    tentative: [], current: null,
    historyAcknowledged: false, seededAt: null, nowOverride: NOW9, tab: 'now', config: { ...CFG9 },
  });
  const pO = planDriftFill(gs(), 140, NOW9);
  if (!pO || pO.start !== L(12, 10, 30) || pO.end !== NOW9 || pO.filled !== 90 || pO.remainder !== 50)
    throw new Error(`patch 9.2: the trailing stretch is clipped at now — 90 of the 140 fit, 50 named (saw ${JSON.stringify(pO)})`);
  const rO = addDriftFill(400, NOW9);
  if (!rO || rO.row.start !== L(12, 10, 30) || rO.row.end !== NOW9)
    throw new Error('patch 9.2: a trailing-stretch fill must end at now, never past it');
  if (driftCheck(gs(), 400, NOW9).gap !== -50)
    throw new Error('patch 9.2: after a clipped fill the remainder must still be the gap that is left');

  // leave the store as the other sections expect to find it
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, seededAt: null, nowOverride: null, tab: 'now', planReturn: 'plan', config: { ...CFG9 } });
  console.log('patch 9.2 (ELD boxes take whole numbers only — fractions refused, never rounded; verdicts echo the number used; trailing clip pinned): OK');
}
console.log('OK');

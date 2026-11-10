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
      if (!html.includes(`content="${nightBg}"`) || !mf.includes(`"theme_color": "${nightBg}"`)) throw new Error('index.html and the manifest must start on the night page colour (patch 16, dark-safe shell)');
      if (!/<script>[\s\S]*?localStorage\.getItem\('hos-sandbox-v1'\)/.test(html)) throw new Error('index.html must carry the pre-paint boot script (patch 16)');
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
  // Sanction S3 (patch 16, approved by Lorico 2026-11-09): a status tap now OWNS the single undo
  // slot. The property this section guards is unchanged — an undo must never throw away changes
  // made after it: undoing the tap removes ONLY the tap (the edit and the add before it survive),
  // the add's undo is replaced, never queued behind the tap's, and an undo the record has moved
  // past changes nothing.
  const preTap = rows(), preCur = JSON.stringify(gs().current);
  tapStatus('OFF');
  const kept = rows();
  if (currentUndo()?.label !== `Off Duty since ${clock(T, false)}`) throw new Error(`a status tap owns the undo slot (S3): the pending undo must be the tap's, "Off Duty since ${clock(T, false)}" (got ${currentUndo()?.label ?? 'none'})`);
  if (!gs().segments.some((x) => x.status === 'SB') || !gs().segments.some((x) => x.status === 'ON' && x.end === T)) throw new Error('the added entry and the closed On Duty row must survive');
  if (!undoLast() || rows() !== preTap || JSON.stringify(gs().current) !== preCur) throw new Error('undoing the tap must restore exactly the pre-tap record: the edit and the add before it intact, the On Duty status back');
  if (!gs().segments.some((x) => x.status === 'SB') || !gs().segments.some((x) => x.status === 'D' && x.start === T - 475)) throw new Error('undoing the tap must not take the earlier edit or add with it');
  if (undoLast() !== false || rows() !== preTap) throw new Error('a second undo must change nothing: the add\'s undo was replaced by the tap\'s, not queued behind it');
  tapStatus('OFF');
  if (rows() !== kept) throw new Error('the same tap again must give the same record');
  setState((c) => ({ segments: [...c.segments, { status: 'OFF', start: T - 1300, end: T - 1250, createdAt: 9 }] }));
  const moved = rows();
  if (currentUndo() !== null) throw new Error('a change the slot did not make must retire the tap\'s undo');
  if (undoLast() !== false || rows() !== moved) throw new Error('a stale undo must change nothing');
  setState((c) => ({ segments: c.segments.filter((x) => x.createdAt !== 9) }));
  if (rows() !== kept) throw new Error('re-check N2 fixture: removing the probe row must give back the tapped record');
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
  // patch 13: the Now quick row is gone (Lorico, Nov 8 2026 — its last entry, Plan a split, was
  // removed and the row and its rule with it), so the 56px floor it pinned here now rides on
  // button.wide, the wide primary actions — Now's End my day among them.
  minH(/button\.wide \{[^}]*\}/, 56, 'the wide primary actions');
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

  // (a) the duplicate is gone from source and screen; the other doors stay (the quick row's
  //     Plan a split, which this patch kept, was removed later — patch 13, Lorico Nov 8 2026;
  //     the patch 13 section pins its absence and the split planner's survival via the Plan hub)
  if (/Take a load\?/.test(app)) throw new Error('patch 7.1: the quick-row duplicate must be gone from the source');
  setLaunchNotice(false);
  ss({ segments: [], tentative: [], current: { status: 'ON', since: now - 60 }, tab: 'now', nowOverride: null });
  let h = out('patch 7.1/now dedupe');
  if (/Take a load\?/.test(h)) throw new Error('patch 7.1: Now must not render the duplicate load button');
  // patch 13 (Lorico, Nov 8 2026): the quick row's remaining entry, Plan a split, is removed
  // too — the pin that guarded its presence here is deliberately retired and inverted: Now
  // must not render the shortcut at all. The planner itself is untouched (patch 13 section).
  if (/Plan a split/.test(h)) throw new Error('patch 13: Now must not render the removed Plan a split shortcut');
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
  // patch 13 (Lorico, Nov 8 2026), re-scoped by sanction S11 (Lorico, Nov 9 2026, capstone
  // C1 fix round): the pin guards its stated intent — Now itself carries no split door —
  // instead of one literal anywhere in the file. (a) NowTab's own body holds no
  // `tab: 'split'` in any property order. (b) The one sanctioned jump — the LeverSheet's
  // [Try it in Split Lab] handler, audit §2.4, which only shows when an L2/L3 lever
  // fires — appears exactly once in app.tsx, inside LeverSheet. The recorded-return
  // machinery and Split's back bar are untouched, and the flow pins below still drive
  // Split with a Now return recorded, exactly as before.
  {
    const bodyOf = (name) => { const a = app.indexOf(`function ${name}(`); const b = app.indexOf('\nfunction ', a + 1); return app.slice(a, b < 0 ? undefined : b); };
    if (/tab:\s*'split'/.test(bodyOf('NowTab'))) throw new Error('patch 13/S11: NowTab must not carry a split door in any property order');
    const jump = "setState({ tab: 'split', planReturn: 'now' })";
    if ((app.split(jump).length - 1) !== 1) throw new Error('patch 13/S11: the sanctioned LeverSheet split jump must appear exactly once in app.tsx');
    if (!bodyOf('LeverSheet').includes(jump)) throw new Error('patch 13/S11: the one split jump must live inside LeverSheet');
  }
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
// --- patch 9.3: the seed-synthesis correction (Opus break-test finding #3). The patch 8 seed
// laid the pre-break driving down as ONE row, and that driving can reach 11h (drive clock
// spent, break clock freshly reset) — so for 315 of 2,695 realistic clock combinations the
// seed itself manufactured a BREAK_30 violation and an invented continuous 11h drive in the
// driver's own log. The synthesis now interrupts that driving every ≤8h with 30 minutes of
// the shift's own on-duty filler (§395.3(a)(3)(ii) is met by any 30-minute interruption), the
// minutes coming out of the filler so every clock total is unchanged.
{
  const { synthesizeEldSeed: synth93 } = await import('../src/store.ts');
  const { evaluate: ev93 } = await import('../../engine/src/index.ts');
  const CFG93 = { cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false };
  const NOW93 = Math.floor(Date.UTC(2026, 9, 12, 17, 0) / 60000); // Oct 12 2026, 12:00 Chicago
  const clocks93 = (segs) => {
    const ev = ev93(segs, { asOf: NOW93, config: CFG93 });
    return { ev, drive: ev.shift.driveRemaining, window: ev.shift.windowRemaining, brk: ev.shift.breakRemaining, cycle: ev.cycle.remaining };
  };
  const longestDrive = (segs) => Math.max(0, ...segs.filter((x) => x.status === 'D').map((x) => x.end - x.start));

  // the report's canonical repro: drove 8h, took a break, drove 3h, took another — the break
  // clock stands reset while 11h of driving precedes it. The seed must round-trip EXACTLY,
  // note nothing, manufacture no violation, and hold no driving row longer than 8h.
  const canon = synth93({ driveLeft: 0, windowLeft: 120, breakDueIn: 480, cycleLeft: 3000 }, CFG93, NOW93, 1);
  const cc = clocks93(canon.segments);
  if (cc.drive !== 0 || cc.window !== 120 || cc.brk !== 480 || cc.cycle !== 3000)
    throw new Error(`patch 9.3: the 11h-pre-break seed must round-trip exactly (saw drive ${cc.drive} window ${cc.window} break ${cc.brk} cycle ${cc.cycle})`);
  if (canon.notes.length !== 0) throw new Error(`patch 9.3: a consistent seed needs no adjustments (saw ${canon.notes.join('; ')})`);
  if (cc.ev.violations.length !== 0) throw new Error('patch 9.3: the canonical seed must manufacture no violations');
  if (longestDrive(canon.segments) !== 480) throw new Error(`patch 9.3: the pre-break driving must be chunked at the 8h line (longest row ${longestDrive(canon.segments)})`);

  // the report's second repro: the typed window (5h left) cannot hold 9h of driving plus the
  // two breaks it needs, so the window clamps stricter (4h left) and is NAMED — while drive
  // and break stay exact and no violation is manufactured.
  const clamped = synth93({ driveLeft: 120, windowLeft: 300, breakDueIn: 480, cycleLeft: 3000 }, CFG93, NOW93, 1);
  const kc = clocks93(clamped.segments);
  if (kc.drive !== 120 || kc.brk !== 480 || kc.window !== 240)
    throw new Error(`patch 9.3: the too-small window must clamp to 4h with drive and break exact (saw drive ${kc.drive} window ${kc.window} break ${kc.brk})`);
  if (!clamped.notes.some((n) => /Shift time left came out lower/.test(n))) throw new Error('patch 9.3: a window clamped by the interruption must be named in the notes');
  if (kc.ev.violations.length !== 0) throw new Error('patch 9.3: the clamped seed must manufacture no violations');

  // boundary sweep: the full sweep (5,865 combos, plus a 7,326-combo edge grid around the
  // boundary condition) lives in the 9.3 handoff evidence; smoke pins this representative
  // subset — every drive/break pair on a 30-minute lattice at the two window extremes — so
  // a regression turns the suite red. A seed must manufacture no violation of any kind, hold
  // no driving row over 8h, and never read a clock above what was typed.
  let swept = 0;
  for (let driveLeft = 0; driveLeft <= 660; driveLeft += 30)
    for (let breakDueIn = 0; breakDueIn <= 480; breakDueIn += 30)
      for (const windowLeft of [0, 840]) {
        const input = { driveLeft, windowLeft, breakDueIn, cycleLeft: 4200 };
        const s = synth93(input, CFG93, NOW93, 1);
        const c = clocks93(s.segments);
        swept++;
        if (c.ev.violations.length !== 0)
          throw new Error(`patch 9.3: seed ${JSON.stringify(input)} manufactures ${JSON.stringify(c.ev.violations.map((v) => v.kind))}`);
        if (longestDrive(s.segments) > 480)
          throw new Error(`patch 9.3: seed ${JSON.stringify(input)} holds a driving row over 8h`);
        if (c.drive > driveLeft || c.window > windowLeft || c.brk > breakDueIn || c.cycle > 4200)
          throw new Error(`patch 9.3: seed ${JSON.stringify(input)} reads a clock above what was typed`);
      }
  if (swept !== 782) throw new Error('patch 9.3: the boundary sweep must run its full subset');
  console.log('patch 9.3 (seed synthesis — pre-break driving interrupted every ≤8h, no manufactured violations): OK');
}
// --- patch 10: the load verdict gains a latest legal departure and a smallest fix, and the
// Why sheet gains one counterfactual line. All three are computed by re-running the existing
// planner/evaluator on changed inputs — no new rule math, nothing written.
// Definitions that matter (see HANDOFF-10): the planner rests its way to legal, so a bare
// feasible/infeasible flip across departure times essentially never happens; the "latest
// legal departure" is therefore the last departure whose winning plan needs no MORE
// ≥10-hour stops than the planned departure's plan — leave later and the load costs an
// extra long stop. The Why lever's payoff is driving time REGAINED, never the wall-clock
// stop-by (any pause shifts a stop-by 1:1 while the binding clock waits, so stop-by would
// call every rest a lever). And a No verdict in practice only occurs when the planner hits
// its own iteration limit (e.g. 3,000 mi at a 5 mph setting) — there the load advice is
// suppressed entirely, because the plan failed, not the load, and the sentence "the load
// itself has to change" would be false.
{
  const { openSheet: open10, setLaunchNotice: notice10 } = await import('../src/app.tsx');
  notice10(false);
  const { latestLegalDeparture: latest10, smallestRestFix: fix10, whyLever: lever10, getState: gs10 } = await import('../src/store.ts');
  const { evaluate: evFn10 } = await import('../../engine/src/index.ts');
  const { readFileSync: rf10 } = await import('node:fs');
  const CFG10 = { cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false };
  const L10 = (d, h, m = 0) => Math.floor(Date.UTC(2026, 9, d, h + 5, m) / 60000);
  const txt10 = (x) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const NOW10 = L10(12, 10);
  // the redesign-4 driver: 13h of rest, on duty since 09:00, window ends 23:00
  const segs10 = [
    { status: 'OFF', start: L10(11, 20), end: L10(12, 9), createdAt: 1 },
    { status: 'ON', start: L10(12, 9), end: NOW10, createdAt: 2 },
  ];
  const loadState = (lc, mph = 55) => setState({
    segments: segs10.slice(0, 1), tentative: [], current: { status: 'ON', since: L10(12, 9), createdAt: 2 },
    historyAcknowledged: true, seededAt: null, nowOverride: NOW10, tab: 'load', mph, config: { ...CFG10 }, loadCheck: lc,
  });

  // (a) helper level: 300 mi at 55 mph is 328 minutes of driving; the window ends 23:00, so
  //     the last departure that needs no extra long stop is 17:32 — whether the wait until
  //     the planned departure is on duty (leave-now check) or off duty (planned +2h). Both
  //     wait models must agree, because the 09:00 on-duty hour started the shift either way.
  const inA = { departure: NOW10, distanceMiles: 300, mph: 55, stops: [{ atMile: 300, minutes: 60, status: 'ON', label: 'Receiver' }], config: CFG10 };
  if (latest10(segs10, inA, 'reset10', 'ON') !== L10(12, 17, 32))
    throw new Error('patch 10: the latest no-extra-stop departure for the 300 mi load must be 17:32');
  const inB = { ...inA, departure: NOW10 + 120, untilDeparture: { from: NOW10, status: 'OFF', label: 'Off duty until departure' } };
  if (latest10(segs10, inB, 'reset10', 'OFF') !== L10(12, 17, 32))
    throw new Error('patch 10: an off-duty wait to a planned departure must land on the same 17:32 boundary');

  // (b) the verdict screen shows the line, worded for the driver
  loadState({ miles: 300, dwell: 60, dwellOff: false, leaveIn: 0, waitOff: false, answered: true });
  let t = txt10(out('load/verdict + leave-by'));
  if (!/Yes, it’s legal/.test(t)) throw new Error('patch 10: the 300 mi load must still verdict Yes');
  if (!t.includes(`Leave by ${clockFull(L10(12, 17, 32))} at the latest.`)) throw new Error('patch 10: the verdict must name the latest legal departure');

  // (c) a short hop never changes shape inside the 12h window — no honest "latest" exists,
  //     so the line stays off rather than naming the search cap
  loadState({ miles: 50, dwell: 0, dwellOff: false, leaveIn: 0, waitOff: false, answered: true });
  t = txt10(out('load/verdict no leave-by'));
  if (!/Yes, it’s legal/.test(t) || /Leave by/.test(t)) throw new Error('patch 10: no leave-by line when the plan shape never changes within 12h');

  // (d) the only No this planner produces: it hits its own iteration limit (3,000 mi at the
  //     5 mph floor). The verdict and the planner's own warning show; NEITHER load-advice
  //     line may appear — the fix search is not run and the no-fix sentence stays off,
  //     because the plan failed, not the load. (Slow pin: the pathological plan takes ~15s.)
  loadState({ miles: 3000, dwell: 0, dwellOff: false, leaveIn: 0, waitOff: false, answered: true }, 5);
  t = txt10(out('load/verdict planner-limit No'));
  if (!/No — not legal as planned/.test(t)) throw new Error('patch 10: the planner-limit trip must verdict No');
  if (!/iteration limit/.test(t)) throw new Error('patch 10: the planner-limit warning must be the explanation shown');
  if (/before you leave → legal/.test(t) || /No amount of extra rest/.test(t)) throw new Error('patch 10: no load advice may ride on a planner failure');

  // (e) the fix machinery itself, pinned where the render cannot reach it: the search runs
  //     0–600 minutes of added rest in 15-minute steps through the planner, the sentence for
  //     "nothing in range flips it" exists word-for-word, and the helper returns null on the
  //     planner-limit input (rest cannot fix a plan the planner could not finish).
  const storeSrc10 = rf10('src/store.ts', 'utf8');
  const appSrc10 = rf10('src/app.tsx', 'utf8');
  if (!/SMALLEST_FIX_CAP_MIN = 600/.test(storeSrc10) || !/LATEST_DEPARTURE_SPAN_MIN = 720/.test(storeSrc10))
    throw new Error('patch 10: the search bounds (600 min fix cap, 12h departure span) must stay as designed');
  if (!/step \* 15/.test(storeSrc10)) throw new Error('patch 10: the fix search must move in 15-minute steps');
  if (!appSrc10.includes('No amount of extra rest before leaving makes this one legal — the load itself has to change.'))
    throw new Error('patch 10: the no-fix sentence must read exactly as specified');
  if (!/before you leave → legal,/.test(appSrc10) || !/unloaded by \$\{clockFull\(advice\.fix\.plan\.arrival\)\}/.test(appSrc10)) throw new Error('patch 10: the fix line must state its payoff (legal, unloaded by …)');
  // (the helper-level null on the planner-limit input is evidenced in HANDOFF-10 — a single
  //  simulation of that input costs ~17s, so the suite pins the UI gate in (d) instead)

  // (f) the Why counterfactual, rest lever: 7h45m driven since 06:15 with no break — the
  //     30-minute break is the binding limit with 15 minutes of driving left. Thirty minutes
  //     in the sleeper satisfies it and hands back the full break-clock of driving.
  const segsC = [
    { status: 'OFF', start: L10(11, 20), end: L10(12, 6), createdAt: 1 },
    { status: 'ON', start: L10(12, 6), end: L10(12, 6, 15), createdAt: 2 },
  ];
  const segsCfull = [...segsC, { status: 'D', start: L10(12, 6, 15), end: L10(12, 14) }];
  const levC = lever10(segsCfull, CFG10, L10(12, 14), evFn10(segsCfull, { asOf: L10(12, 14), config: CFG10 }));
  if (!levC || levC.kind !== 'rest' || levC.minutes !== 30 || levC.status !== 'SB' || levC.stopBy !== L10(12, 17, 45))
    throw new Error(`patch 10: the break-bound Why lever must be +30m in the sleeper to 17:45 (saw ${JSON.stringify(levC)})`);
  // (render state: the same record with the driver now ON duty — a live D row would put the
  // app in the full-screen driving view, where the sheet does not exist)
  setState({ segments: [...segsC, { status: 'D', start: L10(12, 6, 15), end: L10(12, 14), createdAt: 3 }], tentative: [], current: { status: 'ON', since: L10(12, 14), createdAt: 4 }, historyAcknowledged: true, seededAt: null, nowOverride: L10(12, 14), tab: 'now', config: { ...CFG10 } });
  open10({ kind: 'why' });
  t = txt10(out('now/why + counterfactual'));
  if (!t.includes(`What changes it: +30m in the sleeper → you can drive until ${clockFull(L10(12, 17, 45))}.`))
    throw new Error('patch 10: the Why sheet must carry the counterfactual line under the binding limit');
  open10(null);
  // with what-if rows in play the sheet explains a hypothetical — the lever, computed on the
  // real record, would mislead, so it stays off
  setState({ tentative: [{ status: 'OFF', start: L10(12, 20), end: L10(12, 22), tentative: true, createdAt: 5 }] });
  open10({ kind: 'why' });
  t = txt10(out('now/why counterfactual suppressed'));
  if (/What changes it:/.test(t)) throw new Error('patch 10: no counterfactual while what-if rows are in play');
  open10(null);

  // (g) the Why counterfactual, cycle lever: seven 9h54m days leave 42 minutes of cycle just
  //     after midnight; the window binds now but the cycle binds after any restoring rest,
  //     and rest alone never moves a cycle answer — the true lever is the next gain-back.
  const segsD = [];
  for (let d = 5; d <= 11; d++) segsD.push({ status: 'ON', start: L10(d, 0), end: L10(d, 9, 54), createdAt: d });
  const segsDfull = [...segsD, { status: 'ON', start: L10(12, 0), end: L10(12, 0, 30) }];
  const levD = lever10(segsDfull, CFG10, L10(12, 0, 30), evFn10(segsDfull, { asOf: L10(12, 0, 30), config: CFG10 }));
  if (!levD || levD.kind !== 'recap' || levD.at !== L10(13, 0) || levD.dropsOff !== 594 || levD.available !== 606)
    throw new Error(`patch 10: the cycle-bound Why lever must be the Oct 13 gain-back (saw ${JSON.stringify(levD)})`);
  setState({ segments: segsD, tentative: [], current: { status: 'ON', since: L10(12, 0), createdAt: 9 }, historyAcknowledged: true, seededAt: null, nowOverride: L10(12, 0, 30), tab: 'now', config: { ...CFG10 } });
  open10({ kind: 'why' });
  t = txt10(out('now/why + recap lever'));
  if (!t.includes(`What changes it: your next cycle hours come back ${clockFull(L10(13, 0))} — +9h 54m drops off, 10h 06m available.`))
    throw new Error('patch 10: the Why sheet must name the next cycle gain-back when the cycle is the real lever');
  open10(null);

  // (h) checkpoint-1 fix (D3): at 450 mi the planner builds the en-route reset as
  //     two steps — OFF 30 + OFF 570 — once departure passes 14:19. Counting single
  //     steps of ≥10h read that reset as ZERO stops and the leave-by line named
  //     14:59, 40 minutes into the overnight stop it claimed did not exist.
  //     Merged contiguous runs count it as the one stop it is: the boundary is
  //     14:19, at helper level and on the rendered card. (Ground truth computed
  //     per-minute from the engine directly — see HANDOFF-FIXES.)
  const inD3 = { ...inA, distanceMiles: 450, stops: [{ atMile: 450, minutes: 60, status: 'ON', label: 'Receiver' }] };
  if (latest10(segs10, inD3, 'reset10', 'ON') !== L10(12, 14, 19))
    throw new Error('patch 10: the 450 mi leave-by must be 14:19 — a reset planned as OFF 30 + OFF 570 is one long stop');
  loadState({ miles: 450, dwell: 60, dwellOff: false, leaveIn: 0, waitOff: false, answered: true });
  t = txt10(out('load/verdict 450mi leave-by'));
  if (!/Yes, it’s legal/.test(t) || !t.includes(`Leave by ${clockFull(L10(12, 14, 19))} at the latest.`))
    throw new Error('patch 10: the 450 mi verdict must name the 14:19 departure');

  // (i) the wait-row exclusion (M2): the pre-departure wait is the driver's own
  //     time, never a stop the trip costs him — an off-duty planned wait that
  //     grows past 10 hours across the search window must not manufacture a
  //     leave-by boundary for a short hop whose shape never changes.
  const inM2 = { departure: NOW10 + 120, distanceMiles: 50, mph: 55, stops: [], config: CFG10, untilDeparture: { from: NOW10, status: 'OFF', label: 'Off duty until departure' } };
  if (latest10(segs10, inM2, 'reset10', 'OFF') !== null)
    throw new Error('patch 10: the pre-departure wait must never count as a long stop — no leave-by line for the waiting short hop');

  // leave the store as the other sections expect to find it
  setState({ segments: [], tentative: [], current: null, historyAcknowledged: false, seededAt: null, nowOverride: null, tab: 'now', loadCheck: { miles: 1200, dwell: 120, dwellOff: false, leaveIn: 0, waitOff: false, answered: false }, config: { ...CFG10 } });
  console.log('patch 10 (latest legal departure, smallest fix, Why counterfactual — every number re-run through the planner/evaluator): OK');
}
// --- patch 11: voice entry for the four ELD clocks — the driver SAYS the clocks the ELD
// shows, one at a time, into the same boxes typing uses (voiceclocks.ts). Every accepted
// value is checked by a pure parser that refuses fractions exactly like the typed boxes
// (patch 9.2's fence); after the fourth clock the panel reads all four back and nothing
// seeds until the driver taps "Set my clocks" himself; cancelling — or fumbling the same
// clock twice — restores the boxes to what they held before voice entry started.
{
  const { readFileSync: rf } = await import('node:fs');
  const { setState: ss, getState: gs } = await import('../src/store.ts');
  const { openSheet, setLaunchNotice } = await import('../src/app.tsx');
  const vc = await import('../src/voiceclocks.ts');
  const app = rf('src/app.tsx', 'utf8');
  setLaunchNotice(false);
  const CFG11 = { cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false };

  // (a) the parser table: utterances → whole hours + minutes, or a named refusal. The
  //     ceiling passed is the field's own maximum, like the panel passes.
  const P = vc.parseClockUtterance;
  const good = [
    ['seven hours fifteen minutes', 660, 7, 15], ['seven fifteen', 660, 7, 15],
    ['seven oh five', 660, 7, 5], ['nine oh nine', 660, 9, 9],
    ['eleven', 660, 11, 0], ['five thirty', 660, 5, 30], ['zero', 660, 0, 0],
    ['7 hours 30 minutes', 660, 7, 30], ['an hour', 660, 1, 0], ['two hours', 660, 2, 0],
    ['forty five minutes', 480, 0, 45], ['twenty minutes', 480, 0, 20], ['one minute', 480, 0, 1],
    ['sixty two hours', 4200, 62, 0], ['forty-five minutes', 480, 0, 45],
  ];
  for (const [said, max, hh, mm] of good) {
    const r = P(said, max);
    if (!r.ok || r.hours !== hh || r.minutes !== mm || r.total !== hh * 60 + mm)
      throw new Error(`patch 11: "${said}" must parse to ${hh}h ${mm}m (saw ${JSON.stringify(r)})`);
  }
  const refused = [
    ['seven and a half', 660, 'fraction'], ['seven point five', 660, 'fraction'], ['7.5 hours', 660, 'fraction'],
    ['seven hours seventy minutes', 660, 'junk'], ['seven seventy', 660, 'junk'],
    // a minutes part of exactly 60 is not a clock either (checkpoint 1, M5: the
    // boundary case the table used to miss — "seven sixty" must refuse, never
    // land as 8h 0m), in every shape that can carry it
    ['seven sixty', 660, 'junk'], ['sixty minutes', 660, 'junk'],
    ['seven hours sixty minutes', 660, 'junk'], ['one hour sixty minutes', 660, 'junk'], ['seven sixty one', 660, 'junk'],
    // the checkpoint's own hostile fraction forms
    ['three quarters', 660, 'fraction'], ['half an hour', 660, 'fraction'],
    ['62.0 hours', 4200, 'fraction'], ['7,5 hours', 660, 'fraction'],
    ['banana', 660, 'junk'], ['', 660, 'junk'], ['minus three hours', 660, 'junk'], ['one hundred', 660, 'junk'],
    ['twelve', 480, 'range'], ['ninety hours', 4200, 'range'],
  ];
  for (const [said, max, why] of refused) {
    const r = P(said, max);
    if (r.ok || r.reason !== why)
      throw new Error(`patch 11: "${said}" must be refused as ${why} (saw ${JSON.stringify(r)})`);
  }

  // (b) the read-back: one string, the panel's field order, spoken words — the exact
  //     line the driver hears is the line the panel composed.
  const rb = vc.composeReadBack([
    { label: 'Drive time left', minutes: 435 }, { label: 'Shift time left', minutes: 580 },
    { label: 'Break due in', minutes: 330 }, { label: 'Cycle time left', minutes: 3720 },
  ]);
  if (rb !== 'Drive time left: 7 hours 15. Shift time left: 9 hours 40. Break due in: 5 hours 30. Cycle time left: 62 hours.')
    throw new Error(`patch 11: the read-back must name all four clocks in order (saw "${rb}")`);
  if (vc.spokenDuration(60) !== '1 hour' || vc.spokenDuration(1) !== '1 minute' || vc.spokenDuration(0) !== '0 minutes')
    throw new Error('patch 11: spoken durations must singularise and name zero plainly');

  // (c) the session flow over the boxes: accepts land in the boxes the typist uses and
  //     walk the panel's field order; the session ends in the read-back, never in a seed.
  const KEYS11 = ['driveLeft', 'windowLeft', 'breakDueIn', 'cycleLeft'];
  const boxes0 = { driveLeft: ['11', '0'], windowLeft: ['14', '0'], breakDueIn: ['8', '0'], cycleLeft: ['70', '0'] };
  let flow = vc.beginVoice(boxes0);
  let boxes = boxes0;
  const said = [['seven fifteen', 435], ['nine forty', 580], ['five thirty', 330], ['sixty two hours', 3720]];
  said.forEach(([text], i) => {
    const p = P(text, 4200);
    if (!p.ok) throw new Error(`patch 11: "${text}" must parse inside the flow`);
    const a = vc.voiceAccept(flow, boxes, KEYS11[i], p, KEYS11.length);
    flow = a.flow; boxes = a.boxes;
    if (flow.done !== (i === said.length - 1)) throw new Error('patch 11: the session must finish exactly at the fourth clock');
  });
  if (boxes.driveLeft.join(':') !== '7:15' || boxes.windowLeft.join(':') !== '9:40' || boxes.breakDueIn.join(':') !== '5:30' || boxes.cycleLeft.join(':') !== '62:0')
    throw new Error(`patch 11: spoken values must land in the boxes (saw ${JSON.stringify(boxes)})`);
  if (boxes0.driveLeft.join(':') !== '11:0') throw new Error('patch 11: accepting must not mutate the boxes it was handed');

  // (d) start over restores the pre-voice boxes exactly, and so does the two-failure
  //     exit — a voice session the driver abandons changes nothing at all.
  if (JSON.stringify(vc.voiceDiscard(flow)) !== JSON.stringify(boxes0))
    throw new Error('patch 11: start over must restore the pre-voice boxes');
  let f2 = vc.beginVoice(boxes0);
  const acc = vc.voiceAccept(f2, boxes0, 'driveLeft', { hours: 7, minutes: 15 }, KEYS11.length);
  const fail1 = vc.voiceFailure(acc.flow, acc.boxes);
  if (fail1.exited || fail1.flow === null || fail1.boxes.driveLeft.join(':') !== '7:15')
    throw new Error('patch 11: the first refusal re-asks and keeps what was already said');
  const fail2 = vc.voiceFailure(fail1.flow, fail1.boxes);
  if (!fail2.exited || fail2.flow !== null || JSON.stringify(fail2.boxes) !== JSON.stringify(boxes0))
    throw new Error('patch 11: the second refusal on one clock must exit with the pre-voice boxes restored');

  // (e) the panel wiring: voice exists only where the browser offers recognition —
  //     no API, no button (and no dead control) — and the panel seeds only through
  //     its one confirm path, so voice can never seed on its own.
  const sheetBody = app.slice(app.indexOf('function QuickStartSheet'), app.indexOf('function DriftSheet'));
  if ((sheetBody.match(/applyEldSeed/g) || []).length !== 1)
    throw new Error('patch 11: the quick-start panel must keep exactly one seeding call — its confirm');
  if (!/speechRecognitionCtor\(\)/.test(sheetBody) || !/Say my clocks/.test(sheetBody))
    throw new Error('patch 11: the panel must offer voice entry behind the feature detect');
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, seededAt: null, nowOverride: null, tab: 'now', config: { ...CFG11 } });
  openSheet({ kind: 'quickstart' });
  let h = out('patch 11/quickstart panel, no speech API');
  if (/Say my clocks/.test(h)) throw new Error('patch 11: with no speech-recognition API the voice button must not render');
  globalThis.webkitSpeechRecognition = function () { /* stand-in: presence is all the detect reads */ };
  try {
    h = out('patch 11/quickstart panel, speech API present');
    if (!/Say my clocks/.test(h)) throw new Error('patch 11: with a speech-recognition API the voice button must render');
  } finally {
    delete globalThis.webkitSpeechRecognition;
  }
  openSheet(null);

  // leave the store as the other sections expect to find it
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, seededAt: null, nowOverride: null, tab: 'now', planReturn: 'plan', config: { ...CFG11 } });
  setLaunchNotice(true);
  console.log('patch 11 (voice entry — say the four clocks, read back, confirm by hand; boxes restored on cancel): OK');
}
// --- patch 12: screenshot import for the four ELD clocks — the driver picks a
// screenshot of the ELD's clocks screen and the words an on-device reader found
// (eldocr.ts) prefill the same boxes typing and voice use. The bar is asymmetric:
// a value lands only when it is exactly clock-shaped, read confidently, claimed
// by its clock's label, unclaimed by any rival, and inside the clock's own
// maximum — anything else stays out and is named. Nothing here runs the reader
// itself (that is the browser half, eldcr-run.ts, covered by the OCR corpus);
// these pins drive the pure extraction with word fixtures, the same discipline
// patch 11's parser table uses.
{
  const { readFileSync: rf } = await import('node:fs');
  const { setState: ss, getState: gs, readEldEntry } = await import('../src/store.ts');
  const { openSheet, setLaunchNotice } = await import('../src/app.tsx');
  const oc = await import('../src/eldocr.ts');
  const app = rf('src/app.tsx', 'utf8');
  const run = rf('src/eldocr-run.ts', 'utf8');
  setLaunchNotice(false);
  const CFG12 = { cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false };
  const FIELDS12 = [
    { key: 'driveLeft', max: 660 }, { key: 'windowLeft', max: 840 },
    { key: 'breakDueIn', max: 480 }, { key: 'cycleLeft', max: 4200 },
  ];
  const W = (text, x0, y0, x1, y1, confidence = 96) => ({ text, confidence, bbox: { x0, y0, x1, y1 } });
  // A clean two-column screen: label words left, one value right, four rows.
  const row = (label, value, y, conf = 96) => [
    ...label.split(' ').map((t, i) => W(t, 40 + i * 105, y + 9, 40 + i * 105 + 95, y + 39)),
    W(value, 624, y, 775, y + 48, conf),
  ];
  const clean = [
    ...row('Drive Time Left', '7:15', 143), ...row('Shift Time Left', '9:40', 268),
    ...row('Break Due In', '5:30', 393), ...row('Cycle Time Left', '62:00', 518),
  ];

  // (a) the clean screen: every clock read exactly, nothing left over.
  {
    const r = oc.extractEldClocks(clean, FIELDS12);
    const want = { driveLeft: 435, windowLeft: 580, breakDueIn: 330, cycleLeft: 3720 };
    for (const [k, m] of Object.entries(want)) {
      if (r.filled[k]?.minutes !== m) throw new Error(`patch 12: the clean screen must fill ${k} with ${m} (saw ${JSON.stringify(r.filled)})`);
    }
    if (r.unplaced.length !== 0 || r.rejected !== 0)
      throw new Error(`patch 12: the clean screen must leave nothing unplaced or rejected (saw ${JSON.stringify(r)})`);
  }

  // (b) the stacked layout: each label directly above its value still claims it.
  {
    const block = (label, value, y) => [
      ...label.split(' ').map((t, i) => W(t, 40 + i * 105, y, 40 + i * 105 + 95, y + 24)),
      W(value, 40, y + 38, 190, y + 86),
    ];
    const words = [
      ...block('Drive Time Left', '6:05', 20), ...block('Shift Time Left', '8:20', 150),
      ...block('Break Due In', '3:45', 280), ...block('Cycle Time Left', '41:30', 410),
    ];
    const r = oc.extractEldClocks(words, FIELDS12);
    const want = { driveLeft: 365, windowLeft: 500, breakDueIn: 225, cycleLeft: 2490 };
    for (const [k, m] of Object.entries(want)) {
      if (r.filled[k]?.minutes !== m) throw new Error(`patch 12: the stacked screen must fill ${k} with ${m} (saw ${JSON.stringify(r.filled)})`);
    }
  }

  // (c) a doubtful digit stays out: the drive value read at low confidence must
  //     not fill its box — the misread that invents time is the one that matters.
  {
    const words = [
      ...row('Drive Time Left', '7:15', 143, 62), ...row('Shift Time Left', '9:40', 268),
      ...row('Break Due In', '5:30', 393), ...row('Cycle Time Left', '62:00', 518),
    ];
    const r = oc.extractEldClocks(words, FIELDS12);
    if (r.filled.driveLeft) throw new Error('patch 12: a low-confidence value must not fill a box');
    if (r.rejected < 1) throw new Error('patch 12: a low-confidence value must be counted as rejected');
    if (r.filled.windowLeft?.minutes !== 580 || r.filled.cycleLeft?.minutes !== 3720)
      throw new Error('patch 12: confident neighbours of a rejected value must still fill');
  }

  // (d) two values claiming one clock at nearly equal strength (two rows, each
  //     with a clear path to its own drive label): the geometry cannot say
  //     which the label meant, so NEITHER lands — a mis-assigned clock is worse
  //     than a blank one.
  {
    const words = [
      W('Drive', 40, 100, 140, 130), W('Time', 150, 100, 240, 130), W('Left', 250, 100, 320, 130),
      W('7:15', 400, 95, 500, 145),
      W('Driving', 40, 200, 160, 230), W('8:15', 415, 195, 515, 245),
    ];
    const r = oc.extractEldClocks(words, FIELDS12);
    if (r.filled.driveLeft) throw new Error('patch 12: an ambiguous value must not fill a box');
    if (!r.unplaced.includes(435) || !r.unplaced.includes(495))
      throw new Error(`patch 12: both ambiguous values must be reported unplaced (saw ${JSON.stringify(r.unplaced)})`);
  }

  // (e) a value too big for the clock it sat beside never lands in it: 65:00 by
  //     the drive label is not a drive reading (and not quietly a cycle one
  //     either — it is reported unplaced), and 75:00 fits no clock at all.
  {
    const beside = [...row('Drive Time Left', '65:00', 143), ...row('Cycle Time Left', '62:00', 518)];
    const r = oc.extractEldClocks(beside, FIELDS12);
    if (r.filled.driveLeft || r.filled.cycleLeft?.minutes !== 3720)
      throw new Error(`patch 12: an over-max value must not fill the clock it sat beside (saw ${JSON.stringify(r.filled)})`);
    if (!r.unplaced.includes(3900)) throw new Error('patch 12: an over-max value must be reported unplaced');
    const huge = oc.extractEldClocks(row('Cycle Time Left', '75:00', 518), FIELDS12);
    if (huge.filled.cycleLeft || huge.rejected < 1)
      throw new Error('patch 12: a value beyond every clock must be rejected, not placed');
  }

  // (f) a decimal is not a clock: "7.5" beside the drive label matches no shape,
  //     is never converted and never lands — the whole-number fence (patch 9.2)
  //     holds by shape here, and again at the confirm below.
  {
    const r = oc.extractEldClocks(row('Drive Time Left', '7.5', 143), FIELDS12);
    if (r.filled.driveLeft || r.unplaced.length !== 0)
      throw new Error(`patch 12: a decimal must produce no fill and no placement (saw ${JSON.stringify(r)})`);
  }

  // (g) the unit shapes: "7h 15m" as two words, "62h" alone, "45m" alone.
  //     The pair and the minutes-only token fill. The bare "62h" does NOT —
  //     checkpoint 3's policy (D6b, Lorico's call): an unpaired bare-hours
  //     token can never fill a box, because every statutory limit is printed
  //     in exactly that shape and no geometry tells a limit column from a
  //     value column. It is reported unplaced and the driver types the one
  //     field. (Before this round this pin expected 3720 to fill; the
  //     expectation changed with the policy, deliberately.)
  {
    const words = [
      W('Drive', 40, 109, 145, 139), W('7h', 624, 100, 690, 148), W('15m', 705, 100, 790, 148),
      W('Break', 40, 234, 150, 264), W('45m', 624, 225, 720, 273),
      W('Cycle', 40, 359, 145, 389), W('62h', 624, 350, 720, 398),
    ];
    const r = oc.extractEldClocks(words, FIELDS12);
    if (r.filled.driveLeft?.minutes !== 435 || r.filled.breakDueIn?.minutes !== 45)
      throw new Error(`patch 12: the pair and minutes-only unit shapes must fill their clocks (saw ${JSON.stringify(r.filled)})`);
    if (r.filled.cycleLeft)
      throw new Error(`patch 12: a bare-hours token must not fill a box under the D6b policy (saw ${JSON.stringify(r.filled)})`);
    if (!r.unplaced.includes(3720))
      throw new Error('patch 12: the refused bare-hours value must be reported unplaced');
  }

  // (h) a confident time with no label near it is scenery (a clock-of-day on the
  //     ELD's header, say): reported unplaced, never guessed into a box.
  {
    const words = [...clean, W('3:25', 624, 700, 775, 748)];
    const r = oc.extractEldClocks(words, FIELDS12);
    if (!r.unplaced.includes(205)) throw new Error('patch 12: an unlabelled time must be reported unplaced');
    if (Object.keys(r.filled).length !== 4) throw new Error('patch 12: an unlabelled time must not disturb the four reads');
  }

  // (l) the clear-path rule: an info line that merely CONTAINS a label word —
  //     "Shift started 06:00" — must not claim its time for that clock; the
  //     real row, whose label reaches its value across its own phrase only,
  //     still claims its own.
  {
    const words = [
      W('Shift', 40, 40, 140, 64), W('started', 155, 40, 290, 64), W('06:00', 305, 36, 430, 72),
      ...row('Shift Time Left', '6:03', 143),
    ];
    const r = oc.extractEldClocks(words, FIELDS12);
    if (r.filled.windowLeft?.minutes !== 363)
      throw new Error(`patch 12: the real shift row must claim its value past an info line (saw ${JSON.stringify(r.filled)})`);
    if (!r.unplaced.includes(360))
      throw new Error('patch 12: the info line time must be reported unplaced, never filled');
  }

  // (m) the two-pass merge: a clock fills when either reader pass read it
  //     cleanly, fills with the agreed value when both did, and does NOT fill
  //     when the passes name different minutes — the disagreement is reported
  //     with both values, because a doubt is not a tie to break but a read to
  //     refuse.
  {
    const ex = (filled, unplaced = [], rejected = 0) => ({ filled, unplaced, rejected, disagreed: {} });
    const both = oc.mergeExtractions(
      ex({ driveLeft: { minutes: 435, confidence: 88 } }),
      ex({ driveLeft: { minutes: 435, confidence: 96 }, windowLeft: { minutes: 580, confidence: 90 } }));
    if (both.filled.driveLeft?.minutes !== 435 || both.filled.driveLeft?.confidence !== 96)
      throw new Error('patch 12: agreed reads must merge to the agreed value at the stronger confidence');
    if (both.filled.windowLeft?.minutes !== 580)
      throw new Error('patch 12: a clock read by only one pass must still fill');
    const clash = oc.mergeExtractions(
      ex({ cycleLeft: { minutes: 3720, confidence: 95 } }),
      ex({ cycleLeft: { minutes: 3780, confidence: 95 } }));
    if (clash.filled.cycleLeft)
      throw new Error('patch 12: disagreeing passes must not fill the clock');
    if (clash.disagreed.cycleLeft?.join(',') !== '3720,3780')
      throw new Error(`patch 12: a disagreement must be reported with both values (saw ${JSON.stringify(clash.disagreed)})`);
    const un = oc.mergeExtractions(ex({}, [205, 360]), ex({}, [360, 522]));
    if (un.unplaced.join(',') !== '205,360,522')
      throw new Error('patch 12: merged unplaced lists must union without duplicates');
  }

  // (n) checkpoint-1 fix (D1): a limit printed inside the label — "Cycle (70h)
  //     Left 28:51" — is itself clock-shaped and claims the label by nearness,
  //     while the row's real value stands unclaimed beside it (the token blocks
  //     its clear path). The box must NOT fill with the limit: the clock stays
  //     blank, both numbers are reported as a disagreement, and the same holds
  //     for the drive/shift/break shapes of the same layout.
  {
    const cases = [
      { key: 'cycleLeft', pair: '4200,1731', words: [
        W('Cycle', 40, 400, 140, 430), W('(70h)', 155, 400, 235, 430), W('Left', 250, 400, 320, 430),
        W('28:51', 600, 395, 710, 445)] },
      { key: 'driveLeft', pair: '660,262', words: [
        W('Drive', 40, 100, 140, 130), W('(11h)', 155, 100, 235, 130), W('Left', 250, 100, 320, 130),
        W('4:22', 600, 95, 690, 145)] },
      { key: 'windowLeft', pair: '840,363', words: [
        W('Shift', 40, 100, 140, 130), W('14h', 155, 100, 215, 130), W('window', 230, 100, 330, 130),
        W('6:03', 600, 95, 690, 145)] },
      { key: 'breakDueIn', pair: '480,137', words: [
        W('Break', 40, 100, 150, 130), W('8h', 165, 100, 215, 130), W('rule', 230, 100, 300, 130),
        W('2:17', 600, 95, 690, 145)] },
    ];
    for (const c of cases) {
      const r = oc.extractEldClocks(c.words, FIELDS12);
      if (r.filled[c.key])
        throw new Error(`patch 12: a limit token in the label must not fill ${c.key} (saw ${JSON.stringify(r.filled)})`);
      if (r.disagreed[c.key]?.join(',') !== c.pair)
        throw new Error(`patch 12: the limit contest on ${c.key} must be reported with both values (saw ${JSON.stringify(r.disagreed)})`);
      for (const m of c.pair.split(',').map(Number))
        if (!r.unplaced.includes(m)) throw new Error(`patch 12: the contested ${c.key} value ${m} must be reported unplaced`);
    }
  }

  // (o) checkpoint-1 fix (D2): a second label token naming the same clock from
  //     another line — a header's "Last break 06:00" above the real "Break Due
  //     In" row — is a rival claim whatever the score gap: the break clock
  //     stays blank with both values reported, and the untouched rows around
  //     it still read normally.
  {
    const words = [
      W('Last', 40, 40, 100, 64), W('break', 115, 40, 200, 64), W('06:00', 215, 36, 320, 72),
      ...row('Break Due In', '2:17', 143), ...row('Drive Time Left', '4:22', 268),
    ];
    const r = oc.extractEldClocks(words, FIELDS12);
    if (r.filled.breakDueIn)
      throw new Error(`patch 12: a header naming the break clock must contest the real row, not lose to it or win (saw ${JSON.stringify(r.filled)})`);
    if (r.disagreed.breakDueIn?.join(',') !== '360,137')
      throw new Error(`patch 12: the header contest must be reported with both values (saw ${JSON.stringify(r.disagreed)})`);
    if (!r.unplaced.includes(360) || !r.unplaced.includes(137))
      throw new Error('patch 12: both contested break values must be reported unplaced');
    if (r.filled.driveLeft?.minutes !== 262)
      throw new Error('patch 12: a contested neighbour must not disturb the clean rows');
  }

  // (p) the shadow rule's other side: a clock read at exactly its maximum on a
  //     line of its own still fills — the maximum alone is not a doubt.
  {
    const r = oc.extractEldClocks(row('Cycle Time Left', '70:00', 518), FIELDS12);
    if (r.filled.cycleLeft?.minutes !== 4200)
      throw new Error(`patch 12: a lone maximum read must still fill (saw ${JSON.stringify(r.filled)})`);
  }

  // (q) the merge keeps a within-pass contest: a pass that found the clock
  //     contested blanks it for the merge even when the other pass read one of
  //     the values cleanly — the subset read does not override the ambiguity.
  {
    const contested = { filled: {}, unplaced: [4200, 1731], rejected: 0, disagreed: { cycleLeft: [4200, 1731] } };
    const oneSided = { filled: { cycleLeft: { minutes: 1731, confidence: 95 } }, unplaced: [], rejected: 0, disagreed: {} };
    const m = oc.mergeExtractions(contested, oneSided);
    if (m.filled.cycleLeft)
      throw new Error('patch 12: a within-pass contest must survive the merge');
    if (m.disagreed.cycleLeft?.join(',') !== '4200,1731')
      throw new Error(`patch 12: the merged contest must keep both values (saw ${JSON.stringify(m.disagreed)})`);
  }

  // (r) checkpoint-2 fix (D4): pin (n)'s rows with the value column cropped
  //     out of the screenshot — the label and its limit token are all that is
  //     left of each row, and with no readable value to contest, the token
  //     was the clock's only claimant and filled the box with the limit
  //     (ck2's clip screens). A label's limit token may be reported, never
  //     landed — parenthesised, or (the shift row) a bare "14h" set inside
  //     the label's own phrase. (Checkpoint 3's D6b policy has since made
  //     EVERY unpaired bare-hours token report-only, wherever it stands —
  //     pin (y); this pin's assertions are unchanged.)
  {
    const words = [
      W('Drive', 40, 100, 140, 130), W('(11h)', 155, 100, 235, 130), W('Left', 250, 100, 320, 130),
      W('Shift', 40, 250, 140, 280), W('14h', 155, 250, 215, 280), W('Left', 230, 250, 300, 280),
      W('Cycle', 40, 400, 140, 430), W('(70h)', 155, 400, 235, 430), W('Left', 250, 400, 320, 430),
    ];
    const r = oc.extractEldClocks(words, FIELDS12);
    if (Object.keys(r.filled).length !== 0)
      throw new Error(`patch 12: a cropped row must not fill any clock with its label limit (saw ${JSON.stringify(r.filled)})`);
    for (const m of [660, 840, 4200])
      if (!r.unplaced.includes(m)) throw new Error(`patch 12: the cropped row's limit ${m} must be reported unplaced`);
    if (Object.keys(r.disagreed).length !== 0)
      throw new Error('patch 12: no second number was read on a cropped row, so no pair may be named');
  }

  // (s) the limit token's size is irrelevant (Opus's N7): "Cycle (60h) Left"
  //     is a limit annotation exactly as "(70h)" is — with the value unread
  //     the box stays blank, and with the value read the contest is reported
  //     with both numbers, as pin (n) requires of the statutory shape.
  {
    const bare = [
      W('Cycle', 40, 400, 140, 430), W('(60h)', 155, 400, 235, 430), W('Left', 250, 400, 320, 430),
    ];
    const r = oc.extractEldClocks(bare, FIELDS12);
    if (r.filled.cycleLeft)
      throw new Error(`patch 12: a non-statutory (60h) label limit must not fill the cycle box (saw ${JSON.stringify(r.filled)})`);
    if (!r.unplaced.includes(3600)) throw new Error('patch 12: the 60h limit must be reported unplaced');
    const withValue = oc.extractEldClocks([...bare, W('28:51', 600, 395, 710, 445)], FIELDS12);
    if (withValue.filled.cycleLeft)
      throw new Error('patch 12: a (60h) limit beside its read value must not fill the cycle box');
    if (withValue.disagreed.cycleLeft?.join(',') !== '3600,1731')
      throw new Error(`patch 12: the (60h) contest must be reported with both values (saw ${JSON.stringify(withValue.disagreed)})`);
  }

  // (t) the value is on screen but too faint to trust (ck2/ocr-extra's
  //     confidence-70/79 reads): refused at the floor — and the label limit
  //     must not step into the vacancy it leaves.
  {
    const words = [
      W('Drive', 40, 100, 140, 130), W('(11h)', 155, 100, 235, 130), W('Left', 250, 100, 320, 130),
      W('4:22', 600, 95, 690, 145, 79),
      W('Cycle', 40, 400, 140, 430), W('(70h)', 155, 400, 235, 430), W('Left', 250, 400, 320, 430),
      W('28:51', 600, 395, 710, 445, 70),
    ];
    const r = oc.extractEldClocks(words, FIELDS12);
    if (r.filled.driveLeft || r.filled.cycleLeft)
      throw new Error(`patch 12: a value refused at the floor must leave the box blank, not filled with the limit (saw ${JSON.stringify(r.filled)})`);
    if (r.rejected !== 2) throw new Error(`patch 12: both faint values must be counted as rejected (saw ${r.rejected})`);
    if (!r.unplaced.includes(660) || !r.unplaced.includes(4200))
      throw new Error('patch 12: the limits beside refused values must be reported unplaced');
    if (Object.keys(r.disagreed).length !== 0)
      throw new Error('patch 12: a refused value names no pair');
  }

  // (u) the stacked tile with its value read (pin (n)'s family, the value
  //     directly under the limit token): two different values claim the
  //     window clock — the token over it and the value under it — so the box
  //     stays blank with the pair reported, never filled with the 14:00.
  {
    const words = [
      W('Shift', 40, 100, 140, 130), W('(14h)', 155, 100, 235, 130),
      W('6:03', 155, 140, 245, 190),
    ];
    const r = oc.extractEldClocks(words, FIELDS12);
    if (r.filled.windowLeft)
      throw new Error(`patch 12: a limit token over its value must not fill the window box (saw ${JSON.stringify(r.filled)})`);
    if (r.disagreed.windowLeft?.join(',') !== '840,363')
      throw new Error(`patch 12: the tile contest must be reported with both values (saw ${JSON.stringify(r.disagreed)})`);
    if (!r.unplaced.includes(840) || !r.unplaced.includes(363))
      throw new Error('patch 12: both tile values must be reported unplaced');
  }

  // (v) checkpoint-2 fix (D5): pin (o)'s header with NO real row beneath it.
  //     Round 1 blanked "Last break 06:00" only when a "Break Due In" row
  //     contested it; alone on the screen, its time of day filled the break
  //     box (ck2's lone-last-break). An info-line label may contest a clock
  //     but never fill it — and the same holds for its "since" sibling. The
  //     "taken"/"at" phrasings put their marker between the label and the
  //     value, where the clear-path rule already refuses the claim; pinned
  //     so the whole family stays covered.
  {
    const cases = [
      { name: 'Last break', words: [W('Last', 40, 40, 100, 64), W('break', 115, 40, 200, 64), W('06:00', 215, 36, 320, 72)] },
      { name: 'Since break', words: [W('Since', 40, 40, 115, 64), W('break', 130, 40, 215, 64), W('06:00', 230, 36, 335, 72)] },
      { name: 'Break taken', words: [W('Break', 40, 100, 150, 130), W('taken', 165, 100, 260, 130), W('06:00', 275, 95, 380, 145)] },
      { name: 'Break at', words: [W('Break', 40, 100, 150, 130), W('at', 165, 100, 205, 130), W('06:00', 220, 95, 325, 145)] },
    ];
    for (const c of cases) {
      const r = oc.extractEldClocks(c.words, FIELDS12);
      if (r.filled.breakDueIn)
        throw new Error(`patch 12: a lone "${c.name} 06:00" info line must not fill the break box (saw ${JSON.stringify(r.filled)})`);
      if (!r.unplaced.includes(360))
        throw new Error(`patch 12: the "${c.name}" time of day must be reported unplaced`);
    }
  }

  // (w) checkpoint-3 fix (D7) + checkpoint-4 fix (D8): the info marker need
  //     not stand immediately before the label word — a walk left finds
  //     it, so the natural phrasings are info lines too. "Last 30-min
  //     break" is how a US ELD actually words the §395.3(a)(3)(ii) break.
  //     Checkpoint 3 bounded the walk at three words, stopping at a
  //     value-shaped word or a wide gap; checkpoint 4 found the bound
  //     itself was the defect — the regulation's own phrase, "Last 30
  //     minute rest break", puts the marker four words out, and "Since
  //     last 10h break" hides it behind a unit token — so the walk is now
  //     bounded by the text run: it stops at a colon-shaped word (a
  //     neighbouring column's read) or at a gap wider than two
  //     word-heights (a column break), and at nothing else. Lone, each
  //     fills nothing; over a real "Break Due In" row, the contest is
  //     reported with both values, exactly as pin (o). The run's edges
  //     are still pinned: on a crowded two-column line the colon stop and
  //     the gap stop keep the marker hunt from stealing a genuine row in
  //     the next column.
  {
    const headers = [
      { name: 'Last 30-min break', words: [W('Last', 40, 40, 100, 64), W('30-min', 115, 40, 215, 64), W('break', 230, 40, 315, 64), W('06:00', 330, 36, 435, 72)] },
      { name: 'Last 30 min break', words: [W('Last', 40, 40, 100, 64), W('30', 115, 40, 160, 64), W('min', 175, 40, 225, 64), W('break', 240, 40, 325, 64), W('06:00', 340, 36, 445, 72)] },
      { name: 'Last rest break', words: [W('Last', 40, 40, 100, 64), W('rest', 115, 40, 185, 64), W('break', 200, 40, 285, 64), W('06:00', 300, 36, 405, 72)] },
      { name: 'Previous break', words: [W('Previous', 40, 40, 160, 64), W('break', 175, 40, 260, 64), W('06:00', 275, 36, 380, 72)] },
      { name: 'Prev. break', words: [W('Prev.', 40, 40, 110, 64), W('break', 125, 40, 210, 64), W('06:00', 225, 36, 330, 72)] },
      { name: 'Last 30 minute rest break', words: [W('Last', 40, 40, 100, 64), W('30', 115, 40, 160, 64), W('minute', 175, 40, 285, 64), W('rest', 300, 40, 360, 64), W('break', 375, 40, 460, 64), W('06:00', 475, 36, 580, 72)] },
      { name: 'Last 30 min rest break', words: [W('Last', 40, 40, 100, 64), W('30', 115, 40, 160, 64), W('min', 175, 40, 225, 64), W('rest', 240, 40, 300, 64), W('break', 315, 40, 400, 64), W('06:00', 415, 36, 520, 72)] },
      { name: 'Since last 10h break', words: [W('Since', 40, 40, 150, 64), W('last', 165, 40, 230, 64), W('10h', 245, 40, 305, 64), W('break', 320, 40, 430, 64), W('06:00', 445, 36, 550, 72)] },
    ];
    for (const c of headers) {
      const lone = oc.extractEldClocks(c.words, FIELDS12);
      if (lone.filled.breakDueIn)
        throw new Error(`patch 12: a lone "${c.name} 06:00" header must not fill the break box (saw ${JSON.stringify(lone.filled)})`);
      if (!lone.unplaced.includes(360))
        throw new Error(`patch 12: the "${c.name}" time of day must be reported unplaced`);
      const withRow = oc.extractEldClocks([...c.words, ...row('Break Due In', '2:17', 143)], FIELDS12);
      if (withRow.filled.breakDueIn)
        throw new Error(`patch 12: a "${c.name}" header over a real row must not fill the break box (saw ${JSON.stringify(withRow.filled)})`);
      if (withRow.disagreed.breakDueIn?.join(',') !== '360,137')
        throw new Error(`patch 12: the "${c.name}" contest must be reported with both values (saw ${JSON.stringify(withRow.disagreed)})`);
    }
    // The four-word case, re-pinned by checkpoint 4 (D8): "Last" stands
    // four words from this label, inside one unbroken text run, so the
    // line is an info line and the read is refused. (Before this round
    // this pin expected 360 to fill — the three-word bound made the
    // marker "outside the walk"; the expectation changed with the rule,
    // deliberately — Lorico approved this one expectation change, as he
    // approved pin (g)'s in round 3.)
    const far = oc.extractEldClocks([
      W('Last', 40, 40, 100, 64), W('updated', 115, 40, 225, 64), W('on', 240, 40, 280, 64),
      W('Monday', 295, 40, 395, 64), W('break', 410, 40, 495, 64), W('06:00', 510, 36, 615, 72),
    ], FIELDS12);
    if (far.filled.breakDueIn || !far.unplaced.includes(360))
      throw new Error('patch 12: a marker anywhere in the label\'s text run marks the line info — the read must be refused');
    const twoCol = oc.extractEldClocks([
      W('Last', 40, 40, 100, 64), W('break', 115, 40, 200, 64), W('06:00', 215, 36, 320, 72),
      W('Drive', 560, 40, 665, 64), W('Left', 680, 40, 750, 64), W('4:22', 765, 36, 870, 84),
    ], FIELDS12);
    if (twoCol.filled.driveLeft?.minutes !== 262 || twoCol.filled.breakDueIn)
      throw new Error(`patch 12: a neighbouring column's row must still fill past an info header (saw ${JSON.stringify(twoCol.filled)})`);
    const gapCol = oc.extractEldClocks([
      W('Last', 40, 40, 100, 64), W('sync', 115, 40, 190, 64),
      W('Drive', 560, 40, 665, 64), W('Left', 680, 40, 750, 64), W('4:22', 765, 36, 870, 84),
    ], FIELDS12);
    if (gapCol.filled.driveLeft?.minutes !== 262)
      throw new Error(`patch 12: a marker across a column gap must not mark the next column's row info (saw ${JSON.stringify(gapCol.filled)})`);
  }

  // (x) checkpoint-3 fix (D6a): the parenthesis arm covers a candidate of
  //     ANY shape inside a label phrase — "(70:00)" and "(70h 0m)" are
  //     annotations exactly as "(70h)" is, so with the row's value cropped
  //     they leave the box blank, and beside the read value they contest
  //     it. Parentheses alone do not convict a colon value, though: the
  //     same "(28:51)" standing in the value column, far from the label's
  //     phrase, is a value and fills — the annotation needs the phrase,
  //     not just the brackets. (A lone unparenthesised maximum still
  //     fills: pin (p).)
  {
    const colonCrop = oc.extractEldClocks([
      W('Cycle', 40, 400, 140, 430), W('(70:00)', 155, 400, 260, 430), W('Left', 275, 400, 345, 430),
    ], FIELDS12);
    if (colonCrop.filled.cycleLeft || !colonCrop.unplaced.includes(4200))
      throw new Error(`patch 12: a parenthesised colon limit in the label must not fill the cycle box (saw ${JSON.stringify(colonCrop)})`);
    const pairWords = [
      W('Cycle', 40, 400, 140, 430), W('(70h', 155, 400, 220, 430), W('0m)', 230, 400, 290, 430), W('Left', 305, 400, 375, 430),
    ];
    const pairCrop = oc.extractEldClocks(pairWords, FIELDS12);
    if (pairCrop.filled.cycleLeft || !pairCrop.unplaced.includes(4200))
      throw new Error(`patch 12: a parenthesised pair limit in the label must not fill the cycle box (saw ${JSON.stringify(pairCrop)})`);
    const pairFull = oc.extractEldClocks([...pairWords, W('28:51', 600, 395, 710, 445)], FIELDS12);
    if (pairFull.filled.cycleLeft || pairFull.disagreed.cycleLeft?.join(',') !== '4200,1731')
      throw new Error(`patch 12: a parenthesised pair limit beside its read value must contest it, not fill (saw ${JSON.stringify(pairFull)})`);
    const valueColumn = oc.extractEldClocks([
      W('Cycle', 40, 400, 140, 430), W('Time', 155, 400, 250, 430), W('Left', 265, 400, 335, 430),
      W('(28:51)', 624, 395, 760, 445),
    ], FIELDS12);
    if (valueColumn.filled.cycleLeft?.minutes !== 1731)
      throw new Error(`patch 12: a parenthesised value in the value column must still fill (saw ${JSON.stringify(valueColumn.filled)})`);
  }

  // (y) checkpoint-3 policy (D6b): an unpaired bare-hours token can never
  //     fill a box, wherever it sits — in a limit column at value-column
  //     distance from its label, in a small chip beside a big label, or
  //     standing in the value column itself as the row's only read. The
  //     class is closed by shape, not by distance, so no spacing probe
  //     reopens it. The tokens still contest (beside a readable value the
  //     pair is reported) and are still reported unplaced. Pairs and
  //     minutes-only tokens are untouched: pin (g).
  {
    const column = oc.extractEldClocks([
      W('Cycle', 40, 400, 140, 430), W('Left', 155, 400, 225, 430), W('70h', 624, 395, 720, 445),
    ], FIELDS12);
    if (column.filled.cycleLeft || !column.unplaced.includes(4200))
      throw new Error(`patch 12: a bare-hours token at limit-column distance must not fill the cycle box (saw ${JSON.stringify(column)})`);
    const chip = oc.extractEldClocks([
      W('Drive', 40, 100, 200, 148), W('11h', 240, 115, 290, 133),
    ], FIELDS12);
    if (chip.filled.driveLeft || !chip.unplaced.includes(660))
      throw new Error(`patch 12: a bare-hours limit chip must not fill the drive box (saw ${JSON.stringify(chip)})`);
    const rowOfBare = oc.extractEldClocks([
      ...['Drive', 'Shift', 'Break', 'Cycle'].flatMap((lab, i) => {
        const y = 100 + i * 125;
        return [W(lab, 40, y + 9, 145, y + 39), W(['11h', '14h', '8h', '70h'][i], 624, y, 720, y + 48)];
      }),
    ], FIELDS12);
    if (Object.keys(rowOfBare.filled).length !== 0)
      throw new Error(`patch 12: a screen of bare-hours values must fill nothing (saw ${JSON.stringify(rowOfBare.filled)})`);
    for (const m of [660, 840, 480, 4200])
      if (!rowOfBare.unplaced.includes(m)) throw new Error(`patch 12: the refused bare-hours value ${m} must be reported unplaced`);
    const contest = oc.extractEldClocks([
      W('Cycle', 40, 400, 140, 430), W('Left', 155, 400, 225, 430),
      W('70h', 460, 395, 556, 445), W('28:51', 624, 395, 760, 445),
    ], FIELDS12);
    if (contest.filled.cycleLeft || contest.disagreed.cycleLeft?.join(',') !== '4200,1731')
      throw new Error(`patch 12: a bare-hours limit beside its read value must contest it, not fill (saw ${JSON.stringify(contest)})`);
  }

  // (z) checkpoint-4 fix (D9): a tile title that wraps puts the marker on
  //     the line above the label — "PREVIOUS" / "BREAK" / "06:00" — and the
  //     walk continues onto that line when it reads as the top half of
  //     this label's title: at wrap distance, carrying no value of its
  //     own, its fragment over the label's column left-aligned with the
  //     label. Both wrapped shapes fill nothing and report the time
  //     unplaced. The controls hold the other side: a real tile under an
  //     unrelated distant line still fills; a VALUE row above the label
  //     is not a title fragment (its read claims on its own line, and the
  //     label below still claims its own value — no leak across tiles);
  //     a header line above genuine rows leaks nothing into them.
  {
    const wrapped = (top) => [
      W(top[0], 57, 355, top[1], 380), ...(top[2] ? [W(top[2], top[3], 355, top[4], 380)] : []),
      W('BREAK', 57, 399, 183, 424), W('06:00', 58, 477, 330, 543),
    ];
    for (const [shape, words] of [
      ['PREVIOUS', wrapped(['PREVIOUS', 246])],
      ['LAST REST', wrapped(['LAST', 149, 'REST', 157, 246])],
      ['LAST 30-MIN', wrapped(['LAST', 149, '30-MIN', 164, 294])],
    ]) {
      const r = oc.extractEldClocks(words, FIELDS12);
      if (r.filled.breakDueIn || !r.unplaced.includes(360))
        throw new Error(`patch 12: a wrapped "${shape}" tile title must mark the break info (saw ${JSON.stringify(r)})`);
    }
    const realTile = oc.extractEldClocks([
      W('SUMMARY', 57, 60, 300, 85), W('BREAK', 57, 399, 183, 424), W('2:17', 58, 477, 200, 520),
      W('DRIVE', 546, 60, 660, 85), W('4:22', 551, 118, 700, 161),
    ], FIELDS12);
    if (realTile.filled.breakDueIn?.minutes !== 137 || realTile.filled.driveLeft?.minutes !== 262)
      throw new Error(`patch 12: a real tile under an unrelated distant line must still fill (saw ${JSON.stringify(realTile.filled)})`);
    const valueAbove = oc.extractEldClocks([
      W('DRIVE', 57, 300, 160, 330), W('4:22', 57, 345, 200, 388),
      W('BREAK', 57, 430, 183, 460), W('2:17', 57, 475, 200, 518),
    ], FIELDS12);
    if (valueAbove.filled.driveLeft?.minutes !== 262 || valueAbove.filled.breakDueIn?.minutes !== 137)
      throw new Error(`patch 12: a value row above a label must not leak into the tile below (saw ${JSON.stringify(valueAbove.filled)})`);
    const narrowAbove = oc.extractEldClocks([
      W('2:17', 57, 300, 140, 340),
      W('BREAK', 57, 370, 330, 400), W('5:30', 57, 430, 200, 470),
    ], FIELDS12);
    if (narrowAbove.filled.breakDueIn?.minutes !== 330)
      throw new Error(`patch 12: a narrow value above a wide label must not mark it info (saw ${JSON.stringify(narrowAbove)})`);
    const headerRows = oc.extractEldClocks([
      W('Last', 40, 40, 100, 64), W('break', 115, 40, 200, 64), W('06:00', 215, 36, 320, 72),
      ...row('Drive Time Left', '4:22', 143), ...row('Break Due In', '2:17', 268),
    ], FIELDS12);
    if (headerRows.filled.driveLeft?.minutes !== 262 || headerRows.filled.breakDueIn
      || headerRows.disagreed.breakDueIn?.join(',') !== '360,137')
      throw new Error(`patch 12: a header line above real rows must not leak info into them (saw ${JSON.stringify(headerRows)})`);
  }

  // (aa) checkpoint-4 partial (D10): a "Limit" / "Max" column header
  //      annotates the clean value column beneath it, so a colon-format
  //      limit column cropped through its Remaining column fills nothing
  //      — the one signal a full-clock limit carries. Both sides are
  //      pinned: the full table still reports its pairs (the limits
  //      contest, nothing fills); values under a "Remaining" header fill;
  //      a header over a DIFFERENT column changes nothing; a label word
  //      standing in the column breaks the header's reach; and pin (p)
  //      stands — a headerless colon limit still fills, the documented
  //      residual this partial deliberately does not touch.
  {
    const colRow = (lab, lim, val, y) => [
      W(lab, 40, y + 8, 40 + (lab.length * 17 + 30), y + 38),
      ...(lim ? [W(lim, 420, y, 420 + (lim.length * 17 + 30), y + 36)] : []),
      ...(val ? [W(val, 700, y, 700 + (val.length * 17 + 30), y + 36)] : []),
    ];
    const header = (word) => [W('Clock', 40, 40, 130, 66), W(word, 420, 40, 420 + (word.length * 17 + 30), 66), W('Remaining', 700, 40, 860, 66)];
    const cropRows = [colRow('Drive', '11:00', null, 110), colRow('Shift', '14:00', null, 220), colRow('Break', '8:00', null, 330), colRow('Cycle', '70:00', null, 440)];
    for (const word of ['Limit', 'Maximum']) {
      const r = oc.extractEldClocks([...header(word), ...cropRows.flat()], FIELDS12);
      if (Object.keys(r.filled).length !== 0)
        throw new Error(`patch 12: a colon-limit column under a "${word}" header must fill nothing (saw ${JSON.stringify(r.filled)})`);
      for (const m of [660, 840, 480, 4200])
        if (!r.unplaced.includes(m)) throw new Error(`patch 12: the refused ${m} limit must be reported unplaced`);
    }
    const full = oc.extractEldClocks([...header('Limit'),
      colRow('Drive', '11:00', '4:22', 110), colRow('Shift', '14:00', '6:03', 220),
      colRow('Break', '8:00', '2:17', 330), colRow('Cycle', '70:00', '28:51', 440)].flat(), FIELDS12);
    if (Object.keys(full.filled).length !== 0
      || full.disagreed.driveLeft?.join(',') !== '660,262' || full.disagreed.windowLeft?.join(',') !== '840,363'
      || full.disagreed.breakDueIn?.join(',') !== '480,137' || full.disagreed.cycleLeft?.join(',') !== '4200,1731')
      throw new Error(`patch 12: the headed limit table must report its pairs and fill nothing (saw ${JSON.stringify(full)})`);
    const remaining = oc.extractEldClocks([...header('Limit'),
      colRow('Drive', null, '4:22', 110), colRow('Shift', null, '6:03', 220),
      colRow('Break', null, '2:17', 330), colRow('Cycle', null, '28:51', 440)].flat(), FIELDS12);
    if (remaining.filled.driveLeft?.minutes !== 262 || remaining.filled.windowLeft?.minutes !== 363
      || remaining.filled.breakDueIn?.minutes !== 137 || remaining.filled.cycleLeft?.minutes !== 1731)
      throw new Error(`patch 12: values under a "Remaining" header must still fill (saw ${JSON.stringify(remaining.filled)})`);
    const otherColumn = oc.extractEldClocks([
      W('Limit', 40, 40, 130, 66), W('Cycle', 420, 110, 520, 140), W('Left', 535, 110, 605, 140), W('28:51', 700, 104, 880, 144),
    ], FIELDS12);
    if (otherColumn.filled.cycleLeft?.minutes !== 1731)
      throw new Error(`patch 12: a "Limit" header over another column must change nothing (saw ${JSON.stringify(otherColumn.filled)})`);
    const broken = oc.extractEldClocks([
      W('Clock', 40, 40, 130, 66), W('Limit', 420, 40, 490, 66),
      W('Cycle', 420, 110, 520, 140),
      W('Cycle', 40, 448, 140, 478), W('Left', 155, 448, 225, 478), W('70:00', 420, 440, 560, 484),
    ], FIELDS12);
    if (broken.filled.cycleLeft?.minutes !== 4200)
      throw new Error(`patch 12: a label word in the column must break the header's reach (saw ${JSON.stringify(broken.filled)})`);
    const headerless = oc.extractEldClocks([W('Cycle', 40, 400, 140, 430), W('Time', 155, 400, 240, 430), W('Left', 255, 400, 330, 430), W('70:00', 624, 395, 760, 445)], FIELDS12);
    if (headerless.filled.cycleLeft?.minutes !== 4200)
      throw new Error('patch 12: pin (p) stands — a headerless full clock must still fill (the documented D10 residual)');
  }

  // (ab) checkpoint-5 fix (D11): the wrapped-title continuation is
  //      run-local, not line-global — it anchors on the first word of
  //      the label's own text run, so a marker still reaches the label
  //      when the title's second line carries a word before it ("LAST
  //      30-MIN" / "REST BREAK", "PREVIOUS" / "REST BREAK"), when the
  //      label's tile shares a screen line with a neighbouring tile,
  //      and when the fragment above carries a unit token ("LAST 30M" /
  //      "BREAK" — the line-above guard now stops only on colon-shaped
  //      words, as runWalk does). Each shape fills nothing and reports
  //      the time unplaced. The control holds the other side: a real
  //      right-column tile beside a wrapped left title still fills.
  //      (Opus's own prototype fix, applied verbatim; Opus §5 pins.)
  {
    const blank360 = (words, what) => {
      const r = oc.extractEldClocks(words, FIELDS12);
      if (r.filled.breakDueIn || !r.unplaced.includes(360))
        throw new Error(`patch 12: ${what} must not fill the break box (saw ${JSON.stringify(r)})`);
      return r;
    };
    blank360([
      W('LAST', 57, 355, 149, 380), W('30-MIN', 164, 355, 294, 380),
      W('REST', 57, 399, 140, 424), W('BREAK', 155, 399, 281, 424),
      W('06:00', 58, 477, 330, 543),
    ], 'a "LAST 30-MIN" / "REST BREAK" wrap');
    blank360([
      W('PREVIOUS', 57, 355, 246, 380),
      W('REST', 57, 399, 140, 424), W('BREAK', 155, 399, 281, 424),
      W('06:00', 58, 477, 330, 543),
    ], 'a "PREVIOUS" / "REST BREAK" wrap');
    const beside = blank360([
      W('SHIFT', 57, 355, 190, 380), W('REMAINING', 57, 399, 271, 424), W('6:03', 58, 477, 330, 543),
      W('LAST', 547, 355, 639, 380), W('REST', 654, 355, 741, 380), W('BREAK', 547, 399, 673, 424), W('06:00', 548, 477, 820, 543),
    ], 'a right-column "LAST REST" / "BREAK" tile beside a wrapped left tile');
    if (beside.filled.windowLeft?.minutes !== 363)
      throw new Error(`patch 12: the left tile beside the D11 wrap must still read its shift (saw ${JSON.stringify(beside.filled)})`);
    blank360([
      W('LAST', 57, 355, 149, 380), W('30M', 164, 355, 254, 380),
      W('BREAK', 57, 399, 183, 424),
      W('06:00', 58, 477, 330, 543),
    ], 'a "LAST 30M" / "BREAK" wrap');
    const control = oc.extractEldClocks([
      W('DRIVE', 57, 355, 160, 380), W('TIME', 57, 399, 140, 424), W('4:22', 58, 477, 330, 543),
      W('BREAK', 547, 355, 673, 380), W('DUE', 547, 399, 610, 424), W('IN', 625, 399, 665, 424), W('2:17', 548, 477, 690, 543),
    ], FIELDS12);
    if (control.filled.breakDueIn?.minutes !== 137 || control.filled.driveLeft?.minutes !== 262)
      throw new Error(`patch 12: a real right-column tile beside a wrapped left title must still fill (saw ${JSON.stringify(control.filled)})`);
  }

  // (ac) the line-above guard, pinned: a line above carrying a
  //      colon-shaped time is another row, not a title fragment — the
  //      real tile under it still fills its own value. (This is the
  //      guard's real effect, per checkpoint 5: without it the walk
  //      over-blanks a row standing under a valued header line. The
  //      noguard mutation must turn this pin red.)
  {
    const r = oc.extractEldClocks([
      W('LAST', 57, 355, 149, 380), W('10:30', 164, 355, 264, 380),
      W('REST', 57, 399, 140, 424), W('BREAK', 155, 399, 281, 424),
      W('06:00', 58, 477, 330, 543),
    ], FIELDS12);
    if (r.filled.breakDueIn?.minutes !== 360)
      throw new Error(`patch 12: a tile under a valued line above must still fill (saw ${JSON.stringify(r.filled)})`);
  }

  // (ad) the runWalk colon stop, pinned: on one tight single-run line,
  //      a colon-shaped word ends the marker hunt, so the "Last break"
  //      info phrase on the left cannot reach across its own read and
  //      mark the drive row info. (The nocolonstop mutation must turn
  //      this pin red; the stop is kept deliberately — removing it
  //      over-blanks two-column lines.)
  {
    const r = oc.extractEldClocks([
      W('Last', 40, 40, 100, 64), W('break', 115, 40, 200, 64), W('06:00', 215, 36, 320, 72),
      W('Drive', 335, 40, 440, 64), W('Left', 455, 40, 525, 64), W('4:22', 540, 36, 645, 84),
    ], FIELDS12);
    if (r.filled.driveLeft?.minutes !== 262 || r.filled.breakDueIn)
      throw new Error(`patch 12: the drive row past a colon word must still fill, and the info break header must not (saw ${JSON.stringify(r.filled)})`);
  }

  // (ae) checkpoint-5 header synonyms (Lorico-approved): "Limits",
  //      "Cap" and "Allowed" join "Limit" / "Max" / "Maximum" in the
  //      header set, so a cropped colon-limit table under any of them
  //      fills nothing. The control holds: values under a "Remaining"
  //      header still fill even when a synonym heads the limit column.
  {
    const colRow = (lab, lim, val, y) => [
      W(lab, 40, y + 8, 40 + (lab.length * 17 + 30), y + 38),
      ...(lim ? [W(lim, 420, y, 420 + (lim.length * 17 + 30), y + 36)] : []),
      ...(val ? [W(val, 700, y, 700 + (val.length * 17 + 30), y + 36)] : []),
    ];
    const header = (word) => [W('Clock', 40, 40, 130, 66), W(word, 420, 40, 420 + (word.length * 17 + 30), 66), W('Remaining', 700, 40, 860, 66)];
    const cropRows = [colRow('Drive', '11:00', null, 110), colRow('Shift', '14:00', null, 220), colRow('Break', '8:00', null, 330), colRow('Cycle', '70:00', null, 440)];
    for (const word of ['Limits', 'Cap', 'Allowed']) {
      const r = oc.extractEldClocks([...header(word), ...cropRows.flat()], FIELDS12);
      if (Object.keys(r.filled).length !== 0)
        throw new Error(`patch 12: a colon-limit column under a "${word}" header must fill nothing (saw ${JSON.stringify(r.filled)})`);
      for (const m of [660, 840, 480, 4200])
        if (!r.unplaced.includes(m)) throw new Error(`patch 12: the refused ${m} limit under "${word}" must be reported unplaced`);
    }
    const remaining = oc.extractEldClocks([...header('Cap'),
      colRow('Drive', null, '4:22', 110), colRow('Shift', null, '6:03', 220),
      colRow('Break', null, '2:17', 330), colRow('Cycle', null, '28:51', 440)].flat(), FIELDS12);
    if (remaining.filled.driveLeft?.minutes !== 262 || remaining.filled.windowLeft?.minutes !== 363
      || remaining.filled.breakDueIn?.minutes !== 137 || remaining.filled.cycleLeft?.minutes !== 1731)
      throw new Error(`patch 12: values under a "Remaining" header must still fill beside a synonym header (saw ${JSON.stringify(remaining.filled)})`);
  }

  // (i) the panel path stays whole-number end to end: an imported value becomes
  //     box text exactly as the panel writes it (plain integers), the panel's
  //     own reader returns the same minutes, and a fraction typed into a box
  //     afterwards is still refused at the confirm.
  {
    const r = oc.extractEldClocks(clean, FIELDS12);
    for (const f of FIELDS12) {
      const got = r.filled[f.key];
      if (!got) throw new Error('patch 12: the clean screen must fill every clock for the panel-path pin');
      const boxes = [String(Math.floor(got.minutes / 60)), String(got.minutes % 60)];
      if (!/^\d+$/.test(boxes[0]) || !/^\d+$/.test(boxes[1]))
        throw new Error('patch 12: imported values must reach the boxes as whole numbers only');
      const back = readEldEntry(boxes[0], boxes[1]);
      if (!back.ok || back.minutes !== got.minutes)
        throw new Error('patch 12: the panel reader must return the imported minutes unchanged');
    }
    const frac = readEldEntry('7.5', '0');
    if (frac.ok || frac.problem !== 'fraction')
      throw new Error('patch 12: a fraction in a box must still be refused at the confirm');
  }

  // (j) the wiring: the panel offers import behind nothing but a file pick, the
  //     reader loads lazily (a dynamic import, never a static one), the reader
  //     persists nothing (its engine cache is off), and extraction is pure — it
  //     writes nothing to storage while it reads.
  {
    const sheetBody = app.slice(app.indexOf('function QuickStartSheet'), app.indexOf('function DriftSheet'));
    if (!/Import from a screenshot/.test(sheetBody))
      throw new Error('patch 12: the quick-start panel must offer screenshot import');
    if (!/import\('\.\/eldocr-run\.ts'\)/.test(sheetBody))
      throw new Error('patch 12: the OCR reader must load lazily, on the import tap only');
    if (/from '\.\/eldocr-run\.ts'/.test(app))
      throw new Error('patch 12: the OCR reader must not be statically imported');
    if ((sheetBody.match(/applyEldSeed/g) || []).length !== 1)
      throw new Error('patch 12: the quick-start panel must keep exactly one seeding call — its confirm');
    if (!/cacheMethod: 'none'/.test(run))
      throw new Error('patch 12: the reader must run with its cache off — nothing about a screenshot may persist');
    if (/localStorage\s*[.\[]|indexedDB\s*[.\[]/.test(run) || /localStorage\s*[.\[]/.test(sheetBody))
      throw new Error('patch 12: neither the reader nor the panel may write storage for a screenshot');
    const before = mem.size;
    oc.extractEldClocks(clean, FIELDS12);
    if (mem.size !== before) throw new Error('patch 12: extraction must write nothing to storage');
  }

  // (k) the panel render: the import control is simply there — file picking
  //     needs no special API, so there is no environment where it must hide.
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, seededAt: null, nowOverride: null, tab: 'now', config: { ...CFG12 } });
  openSheet({ kind: 'quickstart' });
  const h = out('patch 12/quickstart panel, screenshot import offered');
  if (!/Import from a screenshot/.test(h)) throw new Error('patch 12: the import button must render on the quick-start panel');
  if (!/read on this phone and thrown away/.test(h)) throw new Error('patch 12: the panel must say the screenshot stays on the phone');
  openSheet(null);

  // leave the store as the other sections expect to find it
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, seededAt: null, nowOverride: null, tab: 'now', planReturn: 'plan', config: { ...CFG12 } });
  setLaunchNotice(true);
  console.log('patch 12 (screenshot import — on-device read, confident label-matched values only, confirm by hand): OK');
}
// --- patch 13: the day-done wrap, and the Now quick row's last entry goes with it.
//     (Fix round, Nov 8 2026 — Opus Verify-13: the shared validity rule also breaks on
//     Driving/On-duty time that begins in the close's own minute or straddles the close
//     (defects A1/A2), and never honours a close stamped outside its own carrier day (A3).
//     The fix-round pins are (f)'s re-seed, (h)'s next-day activity, (i)'s out-of-day case
//     and the whole of (k).)
// Item A: "End my day" — OFF duty is a status; this is the driver closing the DAY on purpose.
// One tap ends the open status at the tap moment, opens OFF, and records a day-close bookmark
// for the carrier day; the history view labels the day with the closing time and nothing else
// about the view changes — the bookmark is a label, never an input to the math. The bookmark's
// validity is DERIVED from the log by one shared rule (dayCloseFor): honoured only while no
// logged row and no open status starts after it inside its own carrier day, so any later
// activity reopens the day without any mutation path having to remember to clear it, and undo
// — which restores the log — restores the bookmark's meaning with it. Item B (Lorico, Nov 8
// 2026): the quick row's remaining shortcut, "Plan a split", is removed from Now (button and
// row); the split planner itself is untouched and still opens from the Plan hub.
{
  const { readFileSync: rf } = await import('node:fs');
  const { setState: ss, getState: gs, parseSaved, loadSaved, dayCloseFor, dayCloseToday, dayClosePatch, applySegmentEdit, clock } = await import('../src/store.ts');
  const { endDay, reopenDay, undoLast, currentUndo, tapStatus, setLaunchNotice } = await import('../src/app.tsx');
  const app = rf('src/app.tsx', 'utf8');
  const css = rf('public/styles.css', 'utf8');
  setLaunchNotice(false);
  const L = (d, hh, m = 0) => Math.floor(Date.UTC(2026, 9, d, hh + 5, m) / 60000); // Oct d 2026, CDT
  const CFG = { ...gs().config, timeZone: 'America/Chicago', dayStartHour: 0 };
  const snap = () => JSON.stringify({ segments: gs().segments, current: gs().current, dayCloses: gs().dayCloses });
  const seed = (over) => ss({ segments: [], tentative: [], current: null, dayCloses: [], historyAcknowledged: true, tab: 'now', nowOverride: null, config: { ...CFG }, ...over });

  // the wiring is in the source: the button and the Reopen action call the two actions
  if (!/onClick=\{\(\) => endDay\(now\)\}>End my day</.test(app)) throw new Error('patch 13: Now must wire its End my day button to endDay');
  if (!/onClick=\{\(\) => reopenDay\(now\)\}>Reopen</.test(app)) throw new Error('patch 13: the closed state must wire Reopen to reopenDay');

  // (a) the demo clock has no day to close: the control simply does not appear (the demo state
  //     is the un-acknowledged empty record — historyBasis 'fresh', the drift check's own gate)
  seed({ nowOverride: L(12, 12), historyAcknowledged: false });
  let h = out('patch 13/demo has no close control');
  if (/End my day|Day closed/.test(h)) throw new Error('patch 13: the demo state must not offer End my day or show a closed line');

  // (b) a real record offers the button; the tap closes the open status at the tap moment,
  //     opens OFF from the tap moment, and bookmarks the carrier day — one undoable action
  seed({ segments: [{ status: 'OFF', start: L(11, 20), end: L(12, 6) }], current: { status: 'ON', since: L(12, 6) }, nowOverride: L(12, 18, 42) });
  h = out('patch 13/real record offers the button');
  if (!/End my day/.test(h) || /Day closed/.test(h)) throw new Error('patch 13: a real, unclosed record must offer End my day and no closed line');
  const beforeClose = snap();
  endDay(L(12, 18, 42));
  const st = gs();
  const lastSeg = st.segments[st.segments.length - 1];
  if (!(lastSeg.status === 'ON' && lastSeg.start === L(12, 6) && lastSeg.end === L(12, 18, 42))) throw new Error('patch 13: the tap must close the open status into a logged segment ending at the tap moment');
  if (!(st.current && st.current.status === 'OFF' && st.current.since === L(12, 18, 42))) throw new Error('patch 13: the tap must open OFF duty at the tap moment');
  if (JSON.stringify(st.dayCloses) !== JSON.stringify([{ dayStart: L(12, 0), at: L(12, 18, 42) }])) throw new Error('patch 13: the tap must record the bookmark for the tap carrier day at the tap time');
  if (!dayCloseFor(st, L(12, 0)) || !dayCloseToday(st, L(12, 18, 42))) throw new Error('patch 13: a freshly closed day must read as closed');
  if (currentUndo()?.label !== 'Closed the day') throw new Error('patch 13: the tap must be one undoable action');
  h = out('patch 13/now shows the closed state');
  if (!new RegExp(`Day closed · ${clock(L(12, 18, 42), false)}`).test(h) || !/>Reopen</.test(h) || /End my day/.test(h)) throw new Error('patch 13: while today is closed, Now must show the closed line and Reopen instead of the button');
  ss({ tab: 'history' });
  h = out('patch 13/history shows the closing line');
  if (!new RegExp(`Day closed ${clock(L(12, 18, 42), false)}`).test(h)) throw new Error('patch 13: the history card for a closed day must carry its closing line');

  // (c) idempotent: a second tap while the day stands closed changes nothing — and makes no
  //     undo entry of its own
  const closedSnap = snap();
  endDay(L(12, 19, 5));
  if (snap() !== closedSnap) throw new Error('patch 13: tapping End my day on a closed day must change nothing');
  if (currentUndo()?.label !== 'Closed the day') throw new Error('patch 13: the idempotent tap must not replace the close undo');
  if (dayClosePatch(gs(), L(12, 19, 5)) !== null) throw new Error('patch 13: the close patch itself must refuse a closed day');

  // (d) one Undo restores segments, current and bookmark exactly
  undoLast();
  if (snap() !== beforeClose) throw new Error('patch 13: one Undo after the tap must restore segments, current and bookmark exactly');

  // (e) new activity reopens the day — first by a fresh status tap after the close
  endDay(L(12, 18, 42));
  ss({ nowOverride: L(12, 19, 30), tab: 'now' });
  tapStatus('ON');
  if (dayCloseFor(gs(), L(12, 0))) throw new Error('patch 13: a status starting after the close must reopen the day');
  h = out('patch 13/activity brings the button back');
  if (!/End my day/.test(h) || /Day closed/.test(h)) throw new Error('patch 13: once activity reopens the day, Now must offer End my day again');
  ss({ tab: 'history' });
  h = out('patch 13/reopened day has no closing line');
  if (/Day closed/.test(h)) throw new Error('patch 13: a day reopened by later activity must show no closing line');

  // (f) …and by a segment edit that moves a start to after the bookmark, driven through the
  //     same store edit the Log editor's save calls. An edit entirely before the bookmark
  //     leaves it intact.
  // SANCTIONED PIN CHANGE (fix round, Nov 8 2026): this seed used to run the drive to 20:00 —
  // 1h18m of driving AFTER the 18:42 close, under a bookmark the next line required to "start
  // out honoured". That setup encoded Opus Verify-13 defect A1: the validity rule then saw
  // only rows starting strictly after the close, so a straddling row could never reopen the
  // day. The drive now ends 18:30, before the close, so the honoured start is honest; the
  // move-the-start-to-19:00 step below still exercises reopen-by-edit.
  seed({ segments: [{ status: 'D', start: L(12, 17, 30), end: L(12, 18, 30) }], dayCloses: [{ dayStart: L(12, 0), at: L(12, 18, 42) }], nowOverride: L(12, 21) });
  if (!dayCloseFor(gs(), L(12, 0))) throw new Error('patch 13: the seeded bookmark must start out honoured');
  ss(applySegmentEdit(gs(), gs().segments[0], { start: L(12, 17, 45) }));
  if (gs().segments[0].start !== L(12, 17, 45)) throw new Error('patch 13: the before-bookmark edit must actually land');
  if (!dayCloseFor(gs(), L(12, 0))) throw new Error('patch 13: an edit entirely before the bookmark must leave it intact');
  ss(applySegmentEdit(gs(), gs().segments[0], { start: L(12, 19) }));
  if (gs().segments[0].start !== L(12, 19)) throw new Error('patch 13: the after-bookmark edit must actually land');
  if (dayCloseFor(gs(), L(12, 0))) throw new Error('patch 13: an edit moving a start to after the bookmark must reopen the day');

  // (g) Reopen clears ONLY the bookmark — the segment the close wrote and the OFF status it
  //     opened stay byte-for-byte — and Reopen itself is undoable
  seed({ segments: [{ status: 'OFF', start: L(11, 20), end: L(12, 6) }], current: { status: 'ON', since: L(12, 6) }, nowOverride: L(12, 18, 42) });
  endDay(L(12, 18, 42));
  const logOnly = JSON.stringify({ segments: gs().segments, current: gs().current });
  reopenDay(L(12, 19));
  if (gs().dayCloses.length !== 0) throw new Error('patch 13: Reopen must clear the bookmark');
  if (JSON.stringify({ segments: gs().segments, current: gs().current }) !== logOnly) throw new Error('patch 13: Reopen must not touch the log or the current status');
  if (currentUndo()?.label !== 'Reopened the day') throw new Error('patch 13: Reopen must ride the same undo machinery');
  h = out('patch 13/reopened shows the button');
  if (!/End my day/.test(h)) throw new Error('patch 13: after Reopen, Now must offer End my day again');
  undoLast();
  if (!dayCloseFor(gs(), L(12, 0))) throw new Error('patch 13: undoing a Reopen must restore the bookmark');

  // (h) the bookmark belongs to its carrier day: the next day starts unclosed, yesterday's
  //     closing line survives into it, and closing the new day keeps both
  seed({ segments: [{ status: 'OFF', start: L(11, 20), end: L(12, 6) }], current: { status: 'ON', since: L(12, 6) }, nowOverride: L(12, 18, 42) });
  endDay(L(12, 18, 42));
  ss({ nowOverride: L(13, 9), tab: 'now' });
  if (dayCloseToday(gs(), L(13, 9))) throw new Error('patch 13: the next carrier day must start unclosed');
  h = out('patch 13/next morning offers the button');
  if (!/End my day/.test(h) || /Day closed/.test(h)) throw new Error('patch 13: the next carrier day must offer End my day, not a closed line');
  // M3 (Verify-13): work logged on the NEW day must not reach back and erase yesterday's
  // close. Yesterday's line is only checked after this activity, below — the order is the pin.
  tapStatus('ON');
  if (!(gs().current && gs().current.status === 'ON' && gs().current.since === L(13, 9))) throw new Error('patch 13 fix: the next-day activity must actually land');
  if (!dayCloseFor(gs(), L(12, 0))) throw new Error("patch 13 fix: activity on the next carrier day must not reopen yesterday's close");
  ss({ tab: 'history' });
  h = out('patch 13/yesterday keeps its line');
  if (!new RegExp(`Day closed ${clock(L(12, 18, 42), false)}`).test(h)) throw new Error("patch 13: yesterday's closing line must survive into the next day");
  endDay(L(13, 21, 30));
  if (gs().dayCloses.length !== 2) throw new Error('patch 13: closing the next day must add its own bookmark, not replace the first');
  h = out('patch 13/both days closed');
  if (!new RegExp(`Day closed ${clock(L(12, 18, 42), false)}`).test(h) || !new RegExp(`Day closed ${clock(L(13, 21, 30), false)}`).test(h)) throw new Error('patch 13: each closed day must show its own closing line');

  // (i) a malformed bookmark is dropped by the save sanitiser and never poisons the record —
  //     the patches 5.1/5.2 discipline, applied the way the other self-sanitising fields are
  const KEY = 'hos-sandbox-v1', BAK = 'hos-sandbox-v1-backup';
  const segsOK = [{ status: 'OFF', start: L(11, 20), end: L(12, 6) }];
  const saveWith = (dayCloses) => JSON.stringify({ segments: segsOK, tentative: [], current: null, dayCloses });
  mem.set(BAK, saveWith([]));
  for (const [label, dc] of [
    ['a string', 'junk'],
    ['a number', 42],
    ['a plain object, not a list', { dayStart: L(12, 0), at: L(12, 18) }],
    ['a list of strings', ['x']],
    ['null entries', [null]],
    ['a missing at', [{ dayStart: L(12, 0) }]],
    ['a missing dayStart', [{ at: L(12, 18) }]],
    ['a string dayStart', [{ dayStart: 'Mon', at: 5 }]],
    ['a null at (a NaN as saved)', [{ dayStart: L(12, 0), at: null }]],
    ['a close before its own day began', [{ dayStart: L(12, 0), at: L(11, 0) }]],
  ]) {
    mem.set(KEY, saveWith(dc));
    const loaded = loadSaved();
    if (JSON.stringify(loaded.segments) !== JSON.stringify(segsOK)) throw new Error(`patch 13: a save whose bookmark is ${label} must still load its record`);
    if (loaded.dayCloses.length !== 0) throw new Error(`patch 13: a bookmark that is ${label} must be dropped, not kept`);
  }
  // junk around good entries costs only the junk; a re-closed day keeps its latest close
  mem.set(KEY, saveWith([null, { dayStart: L(12, 0), at: L(12, 18) }, 'x', { dayStart: L(11, 0), at: L(11, 22) }, { dayStart: L(12, 0), at: L(12, 18, 42) }]));
  const mixed = loadSaved();
  if (JSON.stringify(mixed.dayCloses) !== JSON.stringify([{ dayStart: L(11, 0), at: L(11, 22) }, { dayStart: L(12, 0), at: L(12, 18, 42) }])) throw new Error('patch 13: well-formed bookmarks must survive a save that also carries junk, one per day, latest close winning');
  if (parseSaved(saveWith('junk')).dayCloses.length !== 0) throw new Error('patch 13: parseSaved must sanitise the bookmark field directly');
  // A3 (Verify-13): a close stamped OUTSIDE its own carrier day. The old rule could never
  // reopen such a day — no row inside the day can start after a close that falls ten days
  // later — so the day would read closed over anything logged in it. The sanitiser cannot
  // see carrier days (it has no config), so it keeps the entry; the validity rule must
  // refuse to honour it instead.
  mem.set(KEY, saveWith([{ dayStart: L(12, 0), at: L(22, 10) }]));
  const outOfDay = loadSaved();
  if (dayCloseFor(outOfDay, L(12, 0))) throw new Error('patch 13 fix: a bookmark whose close falls outside its own carrier day must not be honoured');
  mem.delete(KEY); mem.delete(BAK);

  // (j) Item B: the quick row and its last shortcut are gone from Now — source, styles and
  //     screen — while the split planner itself still opens from the Plan hub
  if (/Plan a split/.test(app)) throw new Error('patch 13: the Plan a split shortcut must be gone from the source');
  if (/class="quick"/.test(app)) throw new Error('patch 13: the emptied quick row must not linger on Now');
  if (/\.quick/.test(css)) throw new Error('patch 13: the quick-row styles must go with the row');
  seed({ segments: [{ status: 'OFF', start: L(11, 20), end: L(12, 6) }], current: { status: 'ON', since: L(12, 6) }, nowOverride: L(12, 12), tab: 'now' });
  h = out('patch 13/now has no split shortcut');
  if (/Plan a split/.test(h)) throw new Error('patch 13: Now must not render a Plan a split control');
  ss({ tab: 'plan' });
  h = out('patch 13/plan hub keeps the split door');
  if (!/Plan a sleeper split/.test(h)) throw new Error('patch 13: the Plan hub must keep its split planner entry');
  ss({ tab: 'split', planReturn: 'plan' }); // the hub entry's own store write
  h = out('patch 13/split opens from the hub');
  if (!/Break 1 length/.test(h)) throw new Error('patch 13: the split planner must still open from the Plan hub');
  if (!/class="back"(?:(?!<\/button>)[\s\S])*Plan<\/button>/.test(h)) throw new Error("patch 13: the split planner's back must still name Plan when entered from the hub");

  // (k) the Verify-13 fix round. A1: the old rule saw only rows that START strictly after
  //     the close, so work beginning in the close's own minute, or straddling it, sat under
  //     a "Day closed" label. Each shape below is driven through the path a driver takes,
  //     and each asserts the activity actually landed before it asserts the reopen, so none
  //     of them can pass vacuously.
  const { addEntry, saveEntry, addDriftFill, startOver } = await import('../src/app.tsx');
  const { applyImportedState } = await import('../src/store.ts');
  const closeAt1842 = () => {
    seed({ segments: [{ status: 'OFF', start: L(11, 20), end: L(12, 6) }], current: { status: 'ON', since: L(12, 6) }, nowOverride: L(12, 18, 42) });
    endDay(L(12, 18, 42));
    if (!dayCloseFor(gs(), L(12, 0))) throw new Error('patch 13 fix: the 18:42 close must start out honoured');
  };

  // A1 · a status tap in the SAME minute as the close (a mis-tap corrected at once). The tap
  // writes no row — now == since — so only the open status can give the work away.
  closeAt1842();
  tapStatus('ON');
  if (!(gs().current && gs().current.status === 'ON' && gs().current.since === L(12, 18, 42))) throw new Error('patch 13 fix: the same-minute tap must actually land');
  if (dayCloseFor(gs(), L(12, 0))) throw new Error('patch 13 fix: work begun in the close minute must reopen the day');
  ss({ tab: 'now' });
  h = out('patch 13 fix/same-minute tap — Now agrees');
  if (!/End my day/.test(h) || /Day closed/.test(h)) throw new Error('patch 13 fix: after a same-minute tap, Now must offer End my day and no closed line');
  ss({ tab: 'history' });
  h = out('patch 13 fix/same-minute tap — history agrees');
  if (/Day closed/.test(h)) throw new Error('patch 13 fix: after a same-minute tap, history must show no closing line');
  // A1 · the same-minute tap, Driving this time: the glance view owns Now while driving, so
  // this half pins the shared rule itself — the one Now and history both read.
  closeAt1842();
  tapStatus('D');
  if (!(gs().current && gs().current.status === 'D' && gs().current.since === L(12, 18, 42))) throw new Error('patch 13 fix: the same-minute Driving tap must actually land');
  if (dayCloseFor(gs(), L(12, 0)) || dayCloseToday(gs(), L(12, 18, 42))) throw new Error('patch 13 fix: driving begun in the close minute must reopen the day');

  // A1 · a log add starting exactly at the close minute ("forgot I fuelled after closing")
  closeAt1842();
  if (addEntry('ON', L(12, 18, 42), L(12, 19, 10), L(12, 19, 10)) !== null) throw new Error('patch 13 fix: the add at the close minute must save');
  if (!gs().segments.some((x) => x.status === 'ON' && x.start === L(12, 18, 42) && x.end === L(12, 19, 10))) throw new Error('patch 13 fix: the add at the close minute must actually land');
  if (dayCloseFor(gs(), L(12, 0))) throw new Error('patch 13 fix: an add starting in the close minute must reopen the day');

  // A1 · a log add STRADDLING the close: the drive starts before it and ends after it
  closeAt1842();
  if (addEntry('D', L(12, 18), L(12, 19, 30), L(12, 19, 30)) !== null) throw new Error('patch 13 fix: the straddling add must save');
  if (!gs().segments.some((x) => x.status === 'D' && x.start === L(12, 18) && x.end === L(12, 19, 30))) throw new Error('patch 13 fix: the straddling add must actually land');
  if (dayCloseFor(gs(), L(12, 0))) throw new Error('patch 13 fix: a drive straddling the close must reopen the day');

  // A1 · an edit that extends a row's end across the close (the row itself ends AT the close
  // the End-my-day tap wrote, then the driver corrects it longer)
  closeAt1842();
  const onRow = gs().segments.find((x) => x.status === 'ON');
  if (!onRow || onRow.end !== L(12, 18, 42)) throw new Error('patch 13 fix: the close must leave an ON row ending at the close for this pin');
  if (saveEntry(onRow, { status: 'ON', start: onRow.start, end: L(12, 19, 30) }, L(12, 19, 30)) !== null) throw new Error('patch 13 fix: the end extension must save');
  if (gs().segments.find((x) => x.status === 'ON')?.end !== L(12, 19, 30)) throw new Error('patch 13 fix: the end extension must actually land');
  if (dayCloseFor(gs(), L(12, 0))) throw new Error('patch 13 fix: extending a row across the close must reopen the day');

  // A2 · a whole-record import keeps the (now stale) bookmark — imports do not carry one —
  // and the imported record is driving since long before the close, with no row starting
  // after it. The day must not read closed over live driving.
  closeAt1842();
  ss((cur) => applyImportedState(cur, {
    segments: [{ status: 'OFF', start: L(11, 20), end: L(12, 6) }, { status: 'ON', start: L(12, 6), end: L(12, 9) }],
    current: { status: 'D', since: L(12, 9) },
  }));
  if (!(gs().current && gs().current.status === 'D' && gs().current.since === L(12, 9))) throw new Error('patch 13 fix: the import must actually land');
  if (gs().dayCloses.length !== 1) throw new Error('patch 13 fix: the import must leave the stale bookmark in place — that survival is the A2 setup');
  if (dayCloseFor(gs(), L(12, 0))) throw new Error('patch 13 fix: a record imported over a closed day, driving since before the close, must not read closed');

  // M7 (Verify-13): Reopen clears TODAY's bookmark only — an earlier closed day keeps its
  // closing line
  seed({
    segments: [
      { status: 'OFF', start: L(10, 20), end: L(11, 6) },
      { status: 'ON', start: L(11, 6), end: L(11, 22) },
      { status: 'OFF', start: L(11, 22), end: L(12, 6) },
      { status: 'ON', start: L(12, 6), end: L(12, 18, 42) },
    ],
    current: { status: 'OFF', since: L(12, 18, 42) },
    dayCloses: [{ dayStart: L(11, 0), at: L(11, 22) }, { dayStart: L(12, 0), at: L(12, 18, 42) }],
    nowOverride: L(12, 19),
  });
  if (!dayCloseFor(gs(), L(11, 0)) || !dayCloseFor(gs(), L(12, 0))) throw new Error('patch 13 fix: both seeded closes must start out honoured');
  reopenDay(L(12, 19));
  if (JSON.stringify(gs().dayCloses) !== JSON.stringify([{ dayStart: L(11, 0), at: L(11, 22) }])) throw new Error("patch 13 fix: Reopen must clear only today's bookmark");
  if (!dayCloseFor(gs(), L(11, 0))) throw new Error("patch 13 fix: yesterday's close must survive a Reopen of today");
  ss({ tab: 'history' });
  h = out('patch 13 fix/reopen keeps yesterdays line');
  if (!new RegExp(`Day closed ${clock(L(11, 22), false)}`).test(h)) throw new Error('patch 13 fix: history must keep the earlier closing line after a Reopen');
  if (new RegExp(`Day closed ${clock(L(12, 18, 42), false)}`).test(h)) throw new Error("patch 13 fix: history must drop today's closing line after a Reopen");

  // M9 (Verify-13): startOver replaces the whole record, bookmarks included — and its undo
  // restores them
  closeAt1842();
  startOver(L(12, 20));
  if (gs().dayCloses.length !== 0) throw new Error('patch 13 fix: starting over must clear the day-close bookmarks');
  undoLast();
  if (!dayCloseFor(gs(), L(12, 0))) throw new Error("patch 13 fix: undoing a start-over must restore the day's close");

  // leave the store as the other sections expect to find it
  ss({ segments: [], tentative: [], current: null, dayCloses: [], historyAcknowledged: false, nowOverride: null, tab: 'now', planReturn: 'plan' });
  setLaunchNotice(true);
  console.log('patch 13 (End my day — a deliberate day-close bookmark for the history view; the Now quick row retired): OK');
}
// --- patch 14: the Split Lab keeps its answer in view, and offers its worked example.
// Item A: ONE result line is pinned directly under Split's back control — "Your 14 ends
// <window end> now → <window end after the plan> with this pair" — computed from the same
// two evaluations the screen already makes (the real `ev` and the what-if `after`). The
// window end is asOf + limits.window − windowUsed on each evaluation (fix round: paired
// rests after the anchor are excluded from the 14, so anchor + window alone understates
// the end by the excluded later leg — Opus Verify-14 §3): the 14 specifically, never
// mustStopBy, which mixes in the drive and break limits. The tail may say "with this pair"
// only when the engine confirms the pair; otherwise it must own the no-credit truth.
// Item B: "Try an example split" loads DEFAULT_SPLIT — the canonical 7/3 worked example
// that has always been the draft's default — through the screen's own setSplit path, and
// touches nothing but the draft.
{
  const { readFileSync: rf } = await import('node:fs');
  const { DEFAULT_SPLIT: DS } = await import('../src/store.ts');
  const { evaluate } = await import('../../engine/src/index.ts');
  const app = rf('src/app.tsx', 'utf8');
  const css = rf('public/styles.css', 'utf8');
  const splitBody = app.slice(app.indexOf('function SplitTab'), app.indexOf('/* ============================================================ Recap tab */'));

  // the wiring is in the source: a sticky strip, and the example button calling setSplit
  // with exactly the default draft
  if (!/class="split-now-after"/.test(splitBody)) throw new Error('patch 14: the Split screen must render its now-vs-after line in the split strip');
  if (!/\.split-now-after\s*\{[^}]*position:\s*sticky;/.test(css)) throw new Error('patch 14: the now-vs-after line must be sticky');
  if (!splitBody.includes('onClick={() => setSplit({ ...DEFAULT_SPLIT })}>Try an example split</button>'))
    throw new Error('patch 14: the example button must load DEFAULT_SPLIT through setSplit');
  if (!/onChange=\{\(v\) => setSplit\(\{ b2: v \}\)\}/.test(splitBody)) throw new Error('patch 14: the Break 2 slider must still write through setSplit');
  const whatIf = splitBody.slice(splitBody.indexOf('<Card title="What if…'));
  if (!(whatIf.indexOf('Try an example split') >= 0 && whatIf.indexOf('Try an example split') < whatIf.indexOf('Break 1: Off duty')))
    throw new Error('patch 14: the example button must sit in the What-if card, above the Break 1 toggle');

  // a deterministic day: 10h rest, then 6h driving, evaluated at noon Chicago time
  const T = Math.floor(Date.UTC(2026, 8, 22, 17, 0) / 60000); // 2026-09-22 12:00 America/Chicago
  const base = [
    { status: 'OFF', start: T - 960, end: T - 360 },
    { status: 'D', start: T - 360, end: T },
  ];
  const CFG = { ...getState().config, cycle: '70/8', timeZone: 'America/Chicago', dayStartHour: 0 };
  const planFor = (sd) => {
    let t = T; const plan = [];
    const push = (status, m, note) => { if (m > 0) { plan.push({ status, start: t, end: t + m, tentative: true, note }); t += m; } };
    push(sd.b1s, sd.b1, 'Break 1'); push('ON', sd.dwell, 'On duty'); push('D', sd.drive, 'Drive'); push(sd.b2s, sd.b2, 'Break 2');
    return { plan, end: t };
  };
  const evalAfter = (sd) => { const { plan, end } = planFor(sd); return { ev: evaluate([...base, ...plan], { asOf: end, config: CFG }), end }; };
  const windowEnd = (e) => e.asOf + e.shift.limits.window - e.shift.windowUsed;
  const pairedFor = (sd) => { const a = evalAfter(sd); return a.ev.shift.chain.length >= 2 && a.ev.shift.chain[a.ev.shift.chain.length - 1].end === a.end; };
  const strip = (html) => {
    const m = html.match(/<div class="split-now-after"[^>]*>([\s\S]*?)<\/div>/);
    if (!m) throw new Error('patch 14: the Split screen must render the pinned now-vs-after line');
    return m[1].replace(/<[^>]+>/g, '');
  };
  const seed = (split) => setState({ tab: 'split', planReturn: 'plan', nowOverride: T, current: null, segments: base, tentative: [], config: { ...CFG }, split: { ...split } });

  const evNow = evaluate(base, { asOf: T, config: CFG });
  const t1 = windowEnd(evNow);

  // (a) the pairing default: T1 is the real window end, T2 is the after window end, the
  //     pair moves it later by the expected 16h, and the line sits above the pair-status card
  seed(DS);
  let h = out('patch 14/split pinned pair line');
  if (!(h.indexOf('split-now-after') >= 0 && h.indexOf('split-now-after') < h.indexOf('Current pair status')))
    throw new Error('patch 14: the pinned line must render above the Current pair status card');
  if (!pairedFor(DS)) throw new Error('patch 14: the seeded default plan must pair for this pin');
  const pairAfter = evalAfter(DS);
  const t2 = windowEnd(pairAfter.ev);
  if (t2 - t1 !== 960) throw new Error(`patch 14: the paired plan must move the 14 by 16h in this scenario (saw ${t2 - t1}m)`);
  const pairLine = `Your 14 ends ${clock(t1)} now → ${clock(t2)} with this pair`;
  if (strip(h) !== pairLine) throw new Error(`patch 14: the pinned line must read "${pairLine}" (saw "${strip(h)}")`);

  // (b) the line is LIVE, and an unpaired plan cannot claim a pair: shorten Break 2 so the
  //     two breaks total under 10h — the Break 2 slider's own setSplit write — and the line
  //     must fall back to the engine's no-credit window end with the honest wording
  const noPairDraft = { ...DS, b2: 405 };
  if (pairedFor(noPairDraft)) throw new Error('patch 14: the shortened Break 2 plan must not pair for this pin');
  if (windowEnd(evalAfter(noPairDraft).ev) !== t1) throw new Error('patch 14: the no-credit window end must equal the current one in this scenario');
  setState({ split: { ...noPairDraft } });
  h = out('patch 14/split line follows Break 2 change');
  const noPairLine = `Your 14 ends ${clock(t1)} now → ${clock(t1)} with this plan (no split credit)`;
  if (strip(h) !== noPairLine) throw new Error(`patch 14: an unpaired plan must read "${noPairLine}" (saw "${strip(h)}")`);

  // (c) the example button loads the canonical draft and nothing else. Render-to-string
  //     cannot dispatch a click, so the source pin above ties the button to this exact
  //     setSplit write; here the write itself is pinned: draft field-for-field, log and
  //     tentative rows byte-identical, and the pinned line back on the example's figure.
  seed({ b1: 15, b1s: 'SB', dwell: 45, drive: 60, b2: 75, b2s: 'OFF' });
  setState({ tentative: [{ status: 'ON', start: T + 60, end: T + 90, tentative: true, note: 'Existing what-if' }] });
  const logBefore = JSON.stringify({ segments: getState().segments, tentative: getState().tentative });
  setState({ split: { ...DS } }); // the example button's own store write, via setSplit
  if (JSON.stringify(getState().split) !== JSON.stringify(DS)) throw new Error('patch 14: the example must load DEFAULT_SPLIT field-for-field');
  if (JSON.stringify({ segments: getState().segments, tentative: getState().tentative }) !== logBefore)
    throw new Error('patch 14: the example must not touch the log or the tentative rows');
  h = out('patch 14/example split loaded');
  if (strip(h) !== pairLine) throw new Error('patch 14: after loading the example, the pinned line must show the example plan');

  // The wording-guard pins (d)–(g) were added in the fix round (Opus Verify-14 §6): pins
  // (a)–(c) only ever fail every pairing precondition together, so three plausible guard
  // regressions — keying the tail to totalOk (M1), to the checklist conjunction (M4), or
  // to the chain alone without the endB2 check (M7) — claimed pairs the engine never
  // confirmed and passed every pin. These scenarios separate the preconditions.
  const at14 = (iso) => Math.floor(new Date(iso).getTime() / 60000);
  const splitScenario = ({ nowM, segments, current = null, split }) => {
    setState({ tab: 'split', planReturn: 'plan', nowOverride: nowM, current, segments, tentative: [], config: { ...CFG }, split: { ...split } });
    const baseAll = [...segments, ...(current && nowM > current.since ? [{ status: current.status, start: current.since, end: nowM }] : [])];
    let t = Math.max(nowM, ...baseAll.map((x) => x.end)); const plan = [];
    const push = (status, m, note) => { if (m > 0) { plan.push({ status, start: t, end: t + m, tentative: true, note }); t += m; } };
    push(split.b1s, split.b1, 'Break 1'); push('ON', split.dwell, 'On duty'); push('D', split.drive, 'Drive'); push(split.b2s, split.b2, 'Break 2');
    const afterEv = evaluate([...baseAll, ...plan], { asOf: t, config: CFG });
    return { nowEv: evaluate(baseAll, { asOf: nowM, config: CFG }), afterEv, paired: afterEv.shift.chain.length >= 2 && afterEv.shift.chain[afterEv.shift.chain.length - 1].end === t };
  };

  // (d) the merged-reset plan (Opus scenario c): 10h OFF, 6h D, and the driver is 7h into
  //     an OFF rest right now, so the default draft's Break 1 runs straight into that rest
  //     and merges it into a full reset — no pair, even though the draft's own numbers pass
  //     every checklist line (both breaks ≥2h, a ≥7h sleeper, total ≥10h). The line must
  //     own the no-credit wording over the engine's figures. Catches M1 and M4, whose
  //     guards both say "pair" here.
  const nowD = at14('2026-09-23T12:00:00-05:00');
  const scD = splitScenario({
    nowM: nowD,
    segments: [
      { status: 'OFF', start: nowD - 1380, end: nowD - 780 },
      { status: 'D', start: nowD - 780, end: nowD - 420 },
    ],
    current: { status: 'OFF', since: nowD - 420 },
    split: DS,
  });
  if (scD.paired) throw new Error('patch 14: the merged-reset plan must not pair for this pin');
  const lineD = `Your 14 ends ${clock(windowEnd(scD.nowEv))} now → ${clock(windowEnd(scD.afterEv))} with this plan (no split credit)`;
  h = out('patch 14/merged reset plan');
  if (strip(h) !== lineD) throw new Error(`patch 14: a merged-reset plan must read "${lineD}" (saw "${strip(h)}")`);

  // (e) an active pair already in use plus an EMPTY draft (Opus scenario a2): the log's
  //     own chain has two legs, but the plan adds nothing, so the line must still say
  //     no-credit with T2 == T1 — the endB2 half of the guard is what says so. Catches M7.
  //     It also locks the fix round's T1 arithmetic: the pair's later leg (2h OFF) sits
  //     after the anchor and is excluded, so T1 sits exactly 2h past the anchor-only
  //     figure the pre-fix line printed.
  const nowE = at14('2026-09-23T12:00:00-05:00');
  const segsE = []; let te = nowE - (600 + 300 + 480 + 180 + 120 + 60);
  for (const [st, m] of [['OFF', 600], ['D', 300], ['SB', 480], ['D', 180], ['OFF', 120], ['ON', 60]]) { segsE.push({ status: st, start: te, end: te + m }); te += m; }
  const scE = splitScenario({ nowM: nowE, segments: segsE, split: { ...DS, b1: 0, dwell: 0, drive: 0, b2: 0 } });
  if (scE.paired) throw new Error('patch 14: an empty draft must not pair for this pin');
  const t1e = windowEnd(scE.nowEv);
  if (windowEnd(scE.afterEv) !== t1e) throw new Error('patch 14: an empty draft must leave the window end where it is');
  if (t1e - (scE.nowEv.shift.anchor + scE.nowEv.shift.limits.window) !== 120)
    throw new Error('patch 14: the active-pair T1 must sit exactly 2h past the anchor-only figure — the excluded later leg');
  const lineE = `Your 14 ends ${clock(t1e)} now → ${clock(t1e)} with this plan (no split credit)`;
  h = out('patch 14/active pair, empty draft');
  if (strip(h) !== lineE) throw new Error(`patch 14: an empty draft over an active pair must read "${lineE}" (saw "${strip(h)}")`);

  // (g) FAQ 22, the reset as the FIRST leg (Opus scenario g): an 11h sleeper reset pairs
  //     with a later 2h OFF Break 2. The pair is real, and what it buys is exactly Break
  //     2's excluded length — T2 − T1 == 120 — where the pre-fix line showed no movement
  //     at all next to the words "with this pair".
  const nowG = at14('2026-09-23T06:00:00-05:00');
  const scG = splitScenario({
    nowM: nowG,
    segments: [
      { status: 'D', start: nowG - 1200, end: nowG - 660 },
      { status: 'SB', start: nowG - 660, end: nowG },
    ],
    split: { b1: 0, b1s: 'OFF', dwell: 60, drive: 300, b2: 120, b2s: 'OFF' },
  });
  if (!scG.paired) throw new Error('patch 14: the FAQ 22 reset-as-first-leg plan must pair for this pin');
  const t1g = windowEnd(scG.nowEv), t2g = windowEnd(scG.afterEv);
  if (t2g - t1g !== 120) throw new Error(`patch 14: the FAQ 22 pair must move the 14 by exactly Break 2's 2h (saw ${t2g - t1g}m)`);
  const lineG = `Your 14 ends ${clock(t1g)} now → ${clock(t2g)} with this pair`;
  h = out('patch 14/FAQ 22 reset as first leg');
  if (strip(h) !== lineG) throw new Error(`patch 14: the FAQ 22 pair line must read "${lineG}" (saw "${strip(h)}")`);

  // leave the store as the other sections expect to find it
  setState({ segments: [], tentative: [], current: null, nowOverride: null, tab: 'now', planReturn: 'plan', split: { ...DS } });
  console.log('patch 14 (Split Lab — pinned now-vs-after line; Try an example split): OK');
}
// --- patch 15: the break-test safety bundle. Opus's adversarial break-test of the patch 8
//     tree confirmed twelve breaks; two were already closed by later patches (9.2's
//     whole-number ELD entry closed #2, 9.3's seed synthesis closed #3 — both re-verified
//     against this tree in the patch 15 probes, so they are not re-pinned here). The rest
//     are pinned below, one per break, against the behaviour the report names as expected.
{
  const { loadSaved, setState: ss, getState: gs, applyDayPatch, statusTap, allSegments, cycleBasis, applyEldSeed, applyImportedState, importProblem, sanitizeCurrent, segLabel, noteFits, INITIAL_STATE } = await import('../src/store.ts');
  const { tapStatus, endDay, useRealClock, restoreUndo, currentUndo } = await import('../src/app.tsx');
  const { evaluate: evFn, localToMinute, carrierDayStart, DEFAULT_CONFIG } = await import('../../engine/src/index.ts');
  const KEY = 'hos-sandbox-v1', BAK = 'hos-sandbox-v1-backup';
  const cfg = { ...DEFAULT_CONFIG, timeZone: 'America/Chicago' };
  // An earlier section's simulated episode may have left its quarantine snapshot behind in
  // the shared mock storage; this section's episodes start clean, like a fresh launch.
  mem.delete('hos-sandbox-v1-sim');

  // #1: a Recap "set" on a past day must never erase or outrank the live status's span —
  //     its off-duty filler carried a newer stamp than the live row and overwrote 6h of
  //     live driving, handing back a fresh shift (drive left 3h → 9h).
  const today0 = localToMinute(2026, 11, 7, 0, 'America/Chicago');
  const now1 = today0 + 120;
  const yStart = carrierDayStart(today0 - 1, cfg), yEnd = today0;
  const segs1 = [{ status: 'OFF', start: yStart + 480, end: yStart + 1080, createdAt: 1000 }];
  const cur1 = { status: 'D', since: yStart + 1080, createdAt: 1001 };
  const driveLeft1 = (segments, current) => evFn(allSegments({ segments, tentative: [], current }, now1), { asOf: now1, config: cfg }).shift.driveRemaining;
  if (driveLeft1(segs1, cur1) !== 180) throw new Error('patch 15 #1: the scenario must start with 3h of driving left');
  const patched1 = applyDayPatch(segs1, yStart, yEnd, 2, 1, 6, 2000, cur1.createdAt);
  //     The invariant the report names: the live span is never erased or outranked, and the
  //     answer never goes optimistic (the bug handed back 540). The exact figure here is 60,
  //     not the pre-patch 180 — deliberately: the entries the driver just declared for Friday
  //     (work 06:00–09:00) end the 10-hour rest at 09:00, nine hours before the live start, so
  //     the declared 2h honestly joins the live shift (480 live + 120 declared = 600 used).
  //     What the fix guarantees is that every live minute still counts and the filler never
  //     wins; what the record says after the driver's own declaration is the driver's.
  if (driveLeft1(patched1, cur1) !== 60) throw new Error(`patch 15 #1: a past-day "set" must count every live minute and never go optimistic (drive left became ${driveLeft1(patched1, cur1)}, expected 60 — the bug gave 540)`);
  //     …and the day must count as having data when the live status runs through it, so
  //     the driver gets the replace-confirm and the "edit" wording, not a silent "set".
  ss({ segments: [], tentative: [], current: { status: 'D', since: yStart + 1080, createdAt: 5 }, nowOverride: now1, config: cfg, historyAcknowledged: true, tab: 'recap' });
  const recapHtml = out('patch 15/recap day held by the live status');
  if ((recapHtml.match(/>edit</g) || []).length !== 1) throw new Error('patch 15 #1: the day the live status runs through must offer "edit" (the live status counts as data on that day)');

  // #4: a status tap at or before the open status's start must be refused — it used to
  //     replace the open status outright and the logged driving vanished.
  const real4 = Math.floor(Date.UTC(2026, 10, 7, 18, 0) / 60000);
  const st4 = { segments: [{ status: 'OFF', start: real4 - 900, end: real4 - 120, createdAt: 1 }], tentative: [], current: { status: 'D', since: real4 - 120, createdAt: 2 } };
  if (statusTap(st4, 'OFF', undefined, real4 - 240) !== null) throw new Error('patch 15 #4: a tap before the open status began must be refused, not discard it');
  //     …but a tap in the very minute the open status began still lands: nothing has elapsed,
  //     nothing is lost, and patch 13's day-close rule is built on it (a mis-tap corrected at
  //     once). It must land WITHOUT writing a row or touching the logged record.
  const same4 = statusTap(st4, 'OFF', undefined, real4 - 120);
  if (!same4 || same4.current?.status !== 'OFF' || same4.current?.since !== real4 - 120 || same4.segments.length !== st4.segments.length) throw new Error('patch 15 #4: a tap in the very minute the open status began must land without discarding anything');
  const fwd4 = statusTap(st4, 'OFF', undefined, real4 - 60);
  if (!fwd4 || fwd4.current?.status !== 'OFF' || !fwd4.segments.some((x) => x.status === 'D' && x.start === real4 - 120 && x.end === real4 - 60)) throw new Error('patch 15 #4: a forward tap must still close the driving row and open the new status');

  // #5: writes under a simulated clock are quarantined — the tap still works while
  //     simulating, but going back to the real clock restores the record exactly as it
  //     was before the simulated clock was set. (Refusing the taps instead would make
  //     the Testing clock display-only and break this suite's own way of driving the
  //     app at a fixed time; the quarantine keeps the rehearsal and loses the writes.)
  const real5 = Math.floor(Date.UTC(2026, 10, 7, 18, 0) / 60000);
  const rec5 = { segments: [{ status: 'OFF', start: real5 - 4320, end: real5 - 3000, createdAt: 1 }], tentative: [], current: { status: 'OFF', since: real5 - 3000, createdAt: 2 }, dayCloses: [] };
  ss({ ...rec5, nowOverride: null, config: cfg, historyAcknowledged: true });
  const snap5 = () => JSON.stringify({ segments: gs().segments, tentative: gs().tentative, current: gs().current, dayCloses: gs().dayCloses });
  const before5 = snap5();
  ss({ nowOverride: real5 - 2880 });
  tapStatus('D');
  if (gs().current?.status !== 'D' || gs().current?.since !== real5 - 2880) throw new Error('patch 15 #5: a tap under the simulated clock must still work while simulating');
  endDay(real5 - 2820);
  if (gs().dayCloses.length !== 1) throw new Error('patch 15 #5: a day close under the simulated clock must still land while simulating');
  useRealClock();
  if (gs().nowOverride !== null) throw new Error('patch 15 #5: going back to the real clock must clear the simulated one');
  if (snap5() !== before5) throw new Error('patch 15 #5: writes made under the simulated clock must be thrown away, restoring the record exactly');
  ss({ nowOverride: real5 - 1440 });
  tapStatus('ON');
  useRealClock();
  if (snap5() !== before5) throw new Error('patch 15 #5: a second simulated session must snapshot the real record afresh, not resurrect the first session’s writes');
  ss({ nowOverride: real5 - 60 });
  useRealClock();
  if (snap5() !== before5 || gs().nowOverride !== null) throw new Error('patch 15 #5: clearing an untouched simulated clock must leave the record alone');

  // #6: the load path runs the same draft/speed/clock sanitizers as the import path —
  //     a damaged save used to hang the Split tab, print "Range NaN mi" and blank every
  //     clock with an un-clearable simulated "now".
  const baseSave = { segments: [], tentative: [], current: null, config: cfg };
  const loadWith = (extra) => { mem.set(KEY, JSON.stringify({ ...baseSave, ...extra })); mem.delete(BAK); return loadSaved(); };
  const sp6 = loadWith({ split: { b1: 1e9, drive: 1e9, b2: 'z', b1s: 'XX', dwell: -500 } }).split;
  if (sp6.drive !== 660 || sp6.b1 !== 600 || sp6.dwell !== 0 || sp6.b1s !== 'OFF' || sp6.b2 !== 420 || sp6.b2s !== 'SB') throw new Error(`patch 15 #6: a damaged Split Lab draft in a save must be sanitised on load (got ${JSON.stringify(sp6)})`);
  if (loadWith({ mph: 'fast' }).mph !== 55) throw new Error('patch 15 #6: a non-numeric saved mph must fall back to the default');
  if (loadWith({ mph: 0.0001 }).mph !== 5) throw new Error('patch 15 #6: a saved mph outside the import range must be clamped on load');
  if (loadWith({ mph: 62 }).mph !== 62) throw new Error('patch 15 #6: a valid saved mph must load untouched');
  if (loadWith({ nowOverride: '2026-11-07' }).nowOverride !== null) throw new Error('patch 15 #6: a non-numeric simulated "now" in a save must be dropped');
  if (loadWith({ nowOverride: 1e12 }).nowOverride !== null) throw new Error('patch 15 #6: a simulated "now" outside the Date range must be dropped');
  if (loadWith({ nowOverride: real5 }).nowOverride !== real5) throw new Error('patch 15 #6: a real simulated-clock value must survive a load');
  const tr6 = loadWith({ trip: { miles: -5, pre: 'x', dep: 'garbage' } }).trip;
  if (tr6.miles !== 1 || tr6.pre !== 30 || tr6.dep !== null) throw new Error(`patch 15 #6: a damaged trip draft in a save must be sanitised on load, exactly as on import (got ${JSON.stringify(tr6)})`);
  if (loadWith({ loadCheck: { miles: 1e7, dwell: 1e9, leaveIn: 1e9, answered: true } }).loadCheck.miles !== 3000) throw new Error('patch 15 #6: a damaged load-check draft in a save must be clamped on load');

  // #7: a non-string note must never reach a renderer — on `current` it blanked the
  //     whole app on every launch. Dropped on load and on import; the label helpers
  //     tolerate one regardless.
  if (segLabel('ON', { x: 1 }) !== 'On Duty') throw new Error('patch 15 #7: segLabel must tolerate a non-string note');
  if (noteFits(123, 'OFF') !== true) throw new Error('patch 15 #7: noteFits must tolerate a non-string note');
  mem.set(KEY, JSON.stringify({ segments: [{ status: 'OFF', start: 0, end: 60, note: 123 }], tentative: [], current: { status: 'ON', since: 30, note: { x: 1 } }, config: cfg }));
  mem.delete(BAK);
  const ln7 = loadSaved();
  if (ln7.segments[0].note !== undefined || ln7.current?.note !== undefined) throw new Error('patch 15 #7: a non-string note must be dropped on load, on rows and on the live status alike');
  const imp7 = applyImportedState(gs(), { segments: [{ status: 'OFF', start: 0, end: 60, note: 123 }], tentative: [{ status: 'SB', start: 60, end: 120, note: { x: 1 }, tentative: true }] });
  if (imp7.segments[0].note !== undefined || imp7.tentative[0].note !== undefined) throw new Error('patch 15 #7: a non-string note must be dropped on import too');

  // #8: timestamps outside the JavaScript Date range are refused like non-finite ones,
  //     on both paths — they froze every clock and poisoned both save slots.
  const farRow = { status: 'D', start: 1e12, end: 1e12 + 60, tentative: true };
  if (importProblem({ segments: [farRow] }) === null) throw new Error('patch 15 #8: import must refuse a row outside the Date range');
  if (importProblem({ segments: [], current: { status: 'ON', since: 1e12 } }) === null) throw new Error('patch 15 #8: import must refuse a live status outside the Date range');
  if (importProblem({ segments: [{ status: 'OFF', start: -44640, end: -44580 }] }) !== null) throw new Error('patch 15 #8: a 1970 row is inside the range and must still import');
  if (sanitizeCurrent({ status: 'ON', since: 1e12 }) !== null) throw new Error('patch 15 #8: an imported live status outside the Date range must be dropped');
  const rowsA8 = [{ status: 'OFF', start: 1000, end: 1600, createdAt: 1 }];
  mem.set(BAK, JSON.stringify({ segments: rowsA8, tentative: [], current: null }));
  mem.set(KEY, JSON.stringify({ segments: [farRow], tentative: [], current: null }));
  if (JSON.stringify(loadSaved().segments) !== JSON.stringify(rowsA8)) throw new Error('patch 15 #8: a save holding an out-of-range row must fall back to the backup');
  mem.set(KEY, JSON.stringify({ segments: rowsA8, tentative: [], current: { status: 'ON', since: 1e12 } }));
  if (loadSaved().current !== null) throw new Error('patch 15 #8: a save whose live status is out of range must fall back to the backup');

  // #9: a wrong-shaped save with no usable backup starts clean — the fallthrough used
  //     to parse the very save usableSave had just rejected, onto an unrecoverable card.
  mem.set(KEY, JSON.stringify({ segments: { 0: { status: 'OFF', start: 0, end: 60 } }, tentative: [], current: null }));
  mem.delete(BAK);
  const clean9 = loadSaved();
  if (!Array.isArray(clean9.segments) || clean9.segments.length !== 0 || clean9.current !== null) throw new Error('patch 15 #9: a wrong-shaped save with no usable backup must start clean, not load the rejected save');
  mem.set(KEY, '{"segments": "junk"');
  const clean9b = loadSaved();
  if (!Array.isArray(clean9b.segments) || clean9b.segments.length !== 0) throw new Error('patch 15 #9: an unparseable save with no usable backup must start clean');

  // #10: after an ELD seed, the cycle basis is the ELD's own statement — the Load
  //      verdict must not say the record "assumes you started from zero".
  const now10 = Math.floor(Date.UTC(2026, 10, 7, 18, 0) / 60000);
  const fresh10 = { ...INITIAL_STATE, config: cfg };
  const seeded10 = { ...fresh10, ...applyEldSeed(fresh10, { driveLeft: 300, windowLeft: 420, breakDueIn: 300, cycleLeft: 1800 }, now10).patch };
  if (cycleBasis(seeded10, now10, 8) !== 'known') throw new Error('patch 15 #10: after an ELD seed the cycle basis must read as known, not "started from zero"');
  const partial10 = { ...fresh10, segments: [{ status: 'D', start: now10 - 120, end: now10 }] };
  if (cycleBasis(partial10, now10, 8) !== 'incomplete') throw new Error('patch 15 #10: an unseeded fragment of a record must still read as an incomplete cycle basis');

  // Lead #4: a stored undo is validated like a stored save before it is offered — its
  //      snapshot used to put unvalidated rows and bookmarks straight back into state.
  ss({ segments: [], tentative: [], current: null, dayCloses: [], historyAcknowledged: false });
  const snapL4 = (before) => JSON.stringify({ label: 'Deleted something', before, after: { segments: [], tentative: [], current: null, historyAcknowledged: false, dayCloses: [] } });
  const emptySnap = { segments: [], tentative: [], current: null, historyAcknowledged: false, dayCloses: [] };
  restoreUndo(snapL4({ ...emptySnap, segments: [{ status: 'OFF', start: 0, end: 60, note: 123 }] }));
  if (currentUndo() !== null) throw new Error('patch 15 lead 4: a stored undo whose snapshot holds a malformed note must be dropped, not offered');
  restoreUndo(snapL4({ ...emptySnap, segments: [{ status: 'D', start: 1e12, end: 1e12 + 60 }] }));
  if (currentUndo() !== null) throw new Error('patch 15 lead 4: a stored undo whose snapshot holds an out-of-range row must be dropped');
  restoreUndo(snapL4({ ...emptySnap, dayCloses: [null] }));
  if (currentUndo() !== null) throw new Error('patch 15 lead 4: a stored undo whose snapshot holds a malformed day-close must be dropped');

  // leave the store as the other sections expect to find it
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, nowOverride: null, dayCloses: [], tab: 'now' });
  mem.delete('hos-sandbox-v1-sim');
  console.log('patch 15 (break-test safety bundle): OK');
}

// --- patch 15.1: the fix round Opus's verification of patch 15 prescribed
//     (OPUS-VERIFY-15 §6, §9, §10). Three things. (1) The simulated clock's quarantine
//     snapshot is taken when the clock is SET — the nowOverride null → value edge in
//     setState — not at the first of four specific writes, so every later write path
//     (Split Lab commit, ELD seed, Log add/edit/delete, drift fill, Recap set, import)
//     is quarantined by construction; the snapshot also carries historyAcknowledged
//     and config. (2) dateable keeps a 400-day margin inside the raw Date limit:
//     values at the limit itself still froze every tab, because the engine needs days
//     of headroom past any timestamp it is handed. (3) The Recap "set" wiring —
//     RecapTab handing the live status's stamp to applyDayPatch — gets a behavioural
//     pin; that mutation survived every patch 15 pin.
{
  const { loadSaved, setState: ss, getState: gs, applyEldSeed, allSegments, MAX_DATE_MIN, dateable, DEFAULT_SPLIT, sanitizeConfig } = await import('../src/store.ts');
  const { tapStatus, useRealClock, restoreUndo, currentUndo } = await import('../src/app.tsx');
  const { evaluate: evFn, localToMinute, carrierDayStart, DEFAULT_CONFIG } = await import('../../engine/src/index.ts');
  const { options } = await import('preact');
  const KEY = 'hos-sandbox-v1', BAK = 'hos-sandbox-v1-backup';
  // The config as the app itself holds it: every load/import passes sanitizeConfig,
  // which is also what the sim restore runs it through — so the exception lists are
  // present (empty) here, exactly as a real record's config has them.
  const cfg = sanitizeConfig({ ...DEFAULT_CONFIG, timeZone: 'America/Chicago' });
  mem.delete('hos-sandbox-v1-sim');
  // The whole record the quarantine promises to restore. Config is compared by
  // content: a restored config is a rebuilt object, and its key order is not part
  // of the promise.
  const canonCfg = (c) => JSON.stringify(Object.keys(c).sort().map((k) => [k, c[k]]));
  const recordOf = () => JSON.stringify({ segments: gs().segments, tentative: gs().tentative, current: gs().current, dayCloses: gs().dayCloses, historyAcknowledged: gs().historyAcknowledged, config: canonCfg(gs().config) });
  const real = Math.floor(Date.UTC(2026, 10, 7, 18, 0) / 60000);
  // Render once with a vnode hook watching for a handler (the Preact options.vnode
  // capture Opus's probes used), then hand the hook back exactly as it was found.
  const renderCapturing = (label, want) => {
    const found = [];
    const prev = options.vnode;
    options.vnode = (v) => { const hit = want(v); if (hit) found.push(hit); if (prev) prev(v); };
    try { return { html: out(label), found }; } finally { options.vnode = prev; }
  };

  // #5 H1: a Split Lab commit under a past simulated clock writes its what-if rows
  //     over the live span — at the simulated "now" the live status has not started
  //     yet, so there is nothing on the log for the plan to pad around. It is still
  //     an episode write: going back to the real clock restores the record exactly,
  //     clocks included (the break test saw drive left 60 → 360 here).
  const recH1 = { segments: [{ status: 'OFF', start: real - 2000, end: real - 600, createdAt: 1 }], tentative: [], current: { status: 'D', since: real - 600, createdAt: 2 }, dayCloses: [] };
  ss({ ...recH1, nowOverride: null, config: cfg, historyAcknowledged: true, tab: 'split', split: { ...DEFAULT_SPLIT } });
  const driveLeftAt = (asOf) => evFn(allSegments({ segments: gs().segments, tentative: gs().tentative, current: gs().current }, asOf), { asOf, config: cfg }).shift.driveRemaining;
  if (driveLeftAt(real) !== 60) throw new Error('patch 15.1 #5 H1: the scenario must start with 1h of driving left');
  const beforeH1 = recordOf();
  ss({ nowOverride: real - 720 });
  const capH1 = renderCapturing('patch 15.1/H1 split lab under a past sim', (v) => (v && v.type === 'button' && v.props && v.props.children === 'Put plan on log as what-if' && typeof v.props.onClick === 'function') ? v.props.onClick : null);
  if (capH1.found.length !== 1) throw new Error('patch 15.1 #5 H1: the Split Lab commit button must render under the simulated clock');
  capH1.found[0]();
  if (gs().tentative.length === 0) throw new Error('patch 15.1 #5 H1: the commit under the simulated clock must land while simulating (the quarantine discards it at the real clock, not sooner)');
  useRealClock();
  if (gs().nowOverride !== null) throw new Error('patch 15.1 #5 H1: going back to the real clock must clear the simulated one');
  if (recordOf() !== beforeH1) throw new Error('patch 15.1 #5 H1: a Split Lab commit under a simulated clock must be thrown away with the episode, restoring the record exactly');
  if (driveLeftAt(real) !== 60) throw new Error('patch 15.1 #5 H1: the clocks after the episode must be the pre-sim clocks (drive left 60)');

  // #5 H4: a quick-start seed under a simulated clock — driven down QuickStartSheet
  //     confirm's own write path, applyEldSeed + setState — built a whole record on
  //     the fresh DEMO state and left it there. The real clock brings DEMO back,
  //     with no seeded rows.
  ss({ segments: [], tentative: [], current: null, dayCloses: [], historyAcknowledged: false, nowOverride: null, config: cfg, tab: 'now' });
  const beforeH4 = recordOf();
  ss({ nowOverride: real - 2880 });
  ss(applyEldSeed(gs(), { driveLeft: 60, windowLeft: 120, breakDueIn: 60, cycleLeft: 600 }, real - 2880).patch);
  if (gs().segments.length === 0) throw new Error('patch 15.1 #5 H4: the seed under the simulated clock must land while simulating');
  useRealClock();
  if (recordOf() !== beforeH4 || gs().segments.length !== 0) throw new Error('patch 15.1 #5 H4: a seed written under a simulated clock must be thrown away, restoring the fresh DEMO state with no seeded rows');

  // #5, the second episode: a snapshot belongs to its episode, not to the app.
  //     After the record changes on the real clock, a new episode snapshots THAT
  //     record — and what it restores now includes historyAcknowledged and config,
  //     so an acknowledgement or a settings change made under the simulated clock
  //     is thrown away with the rest of the episode's writes.
  const recE = { segments: [{ status: 'OFF', start: real - 3000, end: real - 2400, createdAt: 1 }], tentative: [], current: { status: 'OFF', since: real - 2400, createdAt: 2 }, dayCloses: [] };
  ss({ ...recE, nowOverride: null, config: cfg, historyAcknowledged: false });
  const beforeE1 = recordOf();
  ss({ nowOverride: real - 120 });
  tapStatus('D');
  useRealClock();
  if (recordOf() !== beforeE1) throw new Error('patch 15.1 #5: the first episode must still restore the record it started from');
  ss({ segments: [...gs().segments, { status: 'OFF', start: real - 5000, end: real - 4400, createdAt: 3 }] });
  const beforeE2 = recordOf();
  ss({ nowOverride: real - 30 });
  ss({ historyAcknowledged: true, config: { ...cfg, adverseShifts: [12345] } });
  useRealClock();
  if (recordOf() !== beforeE2) throw new Error('patch 15.1 #5: a second episode must snapshot the then-current record (not a stale one), and history/config writes under the simulated clock must be thrown away with it');

  // #8: the margin itself, then both paths the boundary value used to freeze.
  const M = MAX_DATE_MIN;
  if (dateable(M) !== false) throw new Error('patch 15.1 #8: a timestamp at the raw Date limit must be refused');
  if (dateable(M - 400 * 1440) !== true) throw new Error('patch 15.1 #8: the 400-day margin bound itself must stay dateable');
  if (dateable(M - 399 * 1440) !== false) throw new Error('patch 15.1 #8: the margin must be the full 400 days, no less');
  const loadWith8 = (extra) => { mem.set(KEY, JSON.stringify({ segments: [], tentative: [], current: null, config: cfg, ...extra })); mem.delete(BAK); return loadSaved(); };
  if (loadWith8({ nowOverride: M }).nowOverride !== null) throw new Error('patch 15.1 #8: a simulated "now" at the Date limit must be dropped on load, not left stuck on every tab');
  const rowM = { status: 'D', start: M - 60, end: M, tentative: true };
  const loadedM = loadWith8({ tentative: [rowM] });
  if (loadedM.tentative.length !== 0 || loadedM.segments.length !== 0) throw new Error('patch 15.1 #8: a save holding a what-if row ending at the Date limit must start clean, not load the row');
  ss({ segments: loadedM.segments, tentative: loadedM.tentative, current: loadedM.current, nowOverride: loadedM.nowOverride, config: cfg, tab: 'now' });
  const htmlM = out('patch 15.1/#8 boundary save renders');
  if (htmlM.includes('could not calculate')) throw new Error('patch 15.1 #8: the boundary save must render clocks, not the error card');
  ss({ segments: [], tentative: [], current: null, dayCloses: [], historyAcknowledged: false });
  const undoM = (before) => JSON.stringify({ label: 'Deleted something', before, after: { segments: [], tentative: [], current: null, historyAcknowledged: false, dayCloses: [] } });
  restoreUndo(undoM({ segments: [], tentative: [rowM], current: null, historyAcknowledged: false, dayCloses: [] }));
  if (currentUndo() !== null) throw new Error('patch 15.1 #8: a stored undo holding a what-if row ending at the Date limit must be dropped, not offered');

  // #1 wiring: the patch 15 pins call applyDayPatch directly, but the line that
  //     delivers the fix to the real screen is RecapTab's onApply, which hands
  //     applyDayPatch the live status's stamp so the day's off-duty filler can
  //     never outrank the live span. Drive THAT closure — captured from the
  //     rendered Recap tab — with the break test's scenario: the post-set drive
  //     left must be 60. (Dropping the stamp from the call hands back 540; that
  //     mutation passed every patch 15 pin.)
  const today0w = localToMinute(2026, 11, 7, 0, 'America/Chicago');
  const nowW = today0w + 120;
  const yStartW = carrierDayStart(today0w - 1, cfg);
  const segsW = [{ status: 'OFF', start: yStartW + 480, end: yStartW + 1080, createdAt: 1000 }];
  const curW = { status: 'D', since: yStartW + 1080, createdAt: 1001 };
  const driveLeftW = () => evFn(allSegments({ segments: gs().segments, tentative: gs().tentative, current: gs().current }, nowW), { asOf: nowW, config: cfg }).shift.driveRemaining;
  ss({ segments: segsW, tentative: [], current: curW, nowOverride: nowW, config: cfg, historyAcknowledged: true, tab: 'recap' });
  if (driveLeftW() !== 180) throw new Error('patch 15.1 #1 wiring: the scenario must start with 3h of driving left');
  const capW = renderCapturing('patch 15.1/#1 wiring recap', (v) => (v && v.props && typeof v.props.onApply === 'function' && v.props.day && v.props.day.start === yStartW) ? v.props.onApply : null);
  if (capW.found.length !== 1) throw new Error('patch 15.1 #1 wiring: the Recap tab must render a day editor for the day the live status runs through');
  capW.found[0](2, 1, 6);
  if (driveLeftW() !== 60) throw new Error(`patch 15.1 #1 wiring: a Recap "set" driven through RecapTab's own wiring must count every live minute (drive left became ${driveLeftW()}, expected 60 — dropping the live stamp hands back 540)`);

  // leave the store as the other sections expect to find it
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, nowOverride: null, dayCloses: [], tab: 'now' });
  mem.delete('hos-sandbox-v1-sim');
  console.log('patch 15.1 (sim snapshot at set; dateable margin; recap wiring pin): OK');
}
// --- patch 15.2: the final tidy Opus's delta check of 15.1 left as non-blocking
//     follow-ups (OPUS-DELTA-15 §C residuals, §F). Two things. (1) The sim snapshot
//     gains the last two record fields that could survive an episode: seededAt —
//     an import-then-seed episode flipped the cycle basis from incomplete to known
//     after the episode was "thrown away" — and tzChosen — a zone picked under
//     the simulated clock left "zone confirmed" set after the restore. (2) A pin
//     for the within-episode re-set: stepping the simulated clock mid-episode
//     must keep the FIRST snapshot. The property already held in the code (Opus's
//     C(iii) probe passed) but no suite fenced it — Opus's F3b mutation (snapshot
//     on every clock set) deleted it with every suite green.
{
  const { setState: ss, getState: gs, applyEldSeed, cycleBasis, chooseTimeZone, sanitizeConfig, ELD_SEED_NOTE } = await import('../src/store.ts');
  const { tapStatus, useRealClock } = await import('../src/app.tsx');
  const { DEFAULT_CONFIG } = await import('../../engine/src/index.ts');
  const cfg = sanitizeConfig({ ...DEFAULT_CONFIG, timeZone: 'America/Chicago' });
  mem.delete('hos-sandbox-v1-sim');
  const canonCfg = (c) => JSON.stringify(Object.keys(c).sort().map((k) => [k, c[k]]));
  const recordOf = () => JSON.stringify({ segments: gs().segments, tentative: gs().tentative, current: gs().current, dayCloses: gs().dayCloses, historyAcknowledged: gs().historyAcknowledged, config: canonCfg(gs().config) });
  const real = Math.floor(Date.UTC(2026, 10, 7, 18, 0) / 60000);

  // #5 seededAt: a record imported from a seeded export holds rows noted
  //     "ELD clocks" but no seededAt (the export carries none), so its cycle
  //     basis honestly reads incomplete. Seeding under a simulated clock sets
  //     seededAt; the episode is thrown away, so seededAt must go too — left
  //     standing, it flips the basis to known and the incomplete-basis
  //     disclosure disappears over a record the driver never confirmed.
  const importedSeedRows = [{ status: 'OFF', start: real - 1500, end: real - 900, note: ELD_SEED_NOTE, createdAt: 1 }, { status: 'D', start: real - 900, end: real - 600, note: ELD_SEED_NOTE, createdAt: 1 }];
  ss({ segments: importedSeedRows, tentative: [], current: null, dayCloses: [], historyAcknowledged: false, seededAt: null, tzChosen: false, nowOverride: null, config: cfg, tab: 'now' });
  if (cycleBasis(gs(), real, 8) !== 'incomplete') throw new Error('patch 15.2 #5 seededAt: the scenario must start on an incomplete cycle basis (seeded rows standing, seededAt null)');
  ss({ nowOverride: real - 2880 });
  ss(applyEldSeed(gs(), { driveLeft: 60, windowLeft: 120, breakDueIn: 60, cycleLeft: 600 }, real - 2880).patch);
  if (gs().seededAt === null) throw new Error('patch 15.2 #5 seededAt: the seed under the simulated clock must land while simulating');
  useRealClock();
  if (gs().seededAt !== null) throw new Error('patch 15.2 #5 seededAt: a seededAt written under a simulated clock must be thrown away with the episode, restoring the pre-episode null');
  if (cycleBasis(gs(), real, 8) !== 'incomplete') throw new Error('patch 15.2 #5 seededAt: after the episode the cycle basis must read incomplete again — a surviving seededAt flips it to known and hides the disclosure');

  // #5 tzChosen: choosing a zone under the simulated clock confirms it
  //     (tzChosen). The restore already brings the zone itself back; the
  //     confirmation flag must come back too, or a driver who never confirmed
  //     a zone is never asked again.
  ss({ segments: [], tentative: [], current: null, dayCloses: [], historyAcknowledged: false, seededAt: null, tzChosen: false, nowOverride: null, config: cfg, tab: 'now' });
  ss({ nowOverride: real - 120 });
  chooseTimeZone('America/New_York');
  if (gs().tzChosen !== true || gs().config.timeZone !== 'America/New_York') throw new Error('patch 15.2 #5 tzChosen: choosing a zone under the simulated clock must land while simulating');
  useRealClock();
  if (gs().config.timeZone !== 'America/Chicago') throw new Error('patch 15.2 #5 tzChosen: the zone itself must come back with the episode, as before');
  if (gs().tzChosen !== false) throw new Error('patch 15.2 #5 tzChosen: a zone confirmation made under a simulated clock must be thrown away with the episode — the driver who never confirmed a zone must be asked again');

  // #5 re-set: set the clock, write, STEP the clock to a second simulated
  //     "now", write again, then go back to the real clock. The snapshot taken
  //     at the first set is the episode's only snapshot: the restore must be
  //     the pre-episode record, including throwing away the writes made BEFORE
  //     the step. (A snapshot retaken at the step would keep exactly those.)
  const recR = { segments: [{ status: 'OFF', start: real - 3000, end: real - 2400, createdAt: 1 }], tentative: [], current: { status: 'OFF', since: real - 2400, createdAt: 2 }, dayCloses: [] };
  ss({ ...recR, nowOverride: null, config: cfg, historyAcknowledged: false, seededAt: null, tzChosen: false });
  const beforeR = recordOf();
  ss({ nowOverride: real - 120 });
  tapStatus('D');
  ss({ nowOverride: real - 60 });
  tapStatus('OFF');
  useRealClock();
  if (recordOf() !== beforeR) throw new Error('patch 15.2 #5 re-set: stepping the simulated clock mid-episode must keep the first snapshot — every write of the episode is thrown away, including the ones made before the step');

  // leave the store as the other sections expect to find it
  ss({ segments: [], tentative: [], current: null, historyAcknowledged: false, seededAt: null, tzChosen: false, nowOverride: null, dayCloses: [], tab: 'now' });
  mem.delete('hos-sandbox-v1-sim');
  console.log('patch 15.2 (sim snapshot completeness; within-episode re-set pin): OK');
}
// --- patch 16 "Night & Glance": hero-first Now with the notices as chips, the verdict as a
// sign, warning shapes, the trust ring, the status tap's undo, the dark driving screen, and
// the dark-safe shell. New pins only — nothing above this section was edited except the one
// shell assertion the dark-safe shell itself moves (see HANDOFF-16, sanction S1's family).
{
  const { readFileSync: rf16 } = await import('node:fs');
  const { tapStatus: tap16, currentUndo: undoNow16, undoLast: undoLast16, endDay: endDay16, setLaunchNotice: notice16 } = await import('../src/app.tsx');
  const { deviceTz: dtz16, zoneShort: zs16, zonePair: zp16, screenTheme: screen16, darkDriveAtNightApplies: ddna16, exportState: exp16 } = await import('../src/store.ts');
  const css16 = rf16('public/styles.css', 'utf8');
  const html16 = rf16('public/index.html', 'utf8');
  const mf16 = JSON.parse(rf16('public/manifest.webmanifest', 'utf8'));
  const app16 = await readFile(new URL('../src/app.tsx', import.meta.url), 'utf8');
  const txt16 = (x) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const rule16 = (sel) => { const i = css16.indexOf(sel); return i < 0 ? '' : css16.slice(css16.indexOf('{', i) + 1, css16.indexOf('}', i)); };
  const L16 = (d, h, m = 0) => Math.floor(Date.UTC(2026, 9, d, h, m) / 60000);

  // P6: one duration format — no decimal-hours call sites left in the app source.
  if (/\bhrs\(/.test(app16)) throw new Error('patch 16: app.tsx must not call hrs() anywhere — durations read in dur() form');
  // P4: the type floor — nothing under 12px in the stylesheet; the grid's SVG labels at 14 units; the trust role exists.
  for (const m of css16.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) if (parseFloat(m[1]) < 12) throw new Error(`patch 16: a font-size under the 12px floor survives: ${m[0]}`);
  if (!/\.grid-label \{[^}]*font-size: 14px/.test(css16)) throw new Error('patch 16: the grid labels must be 14 units');
  if (!/\.trust \{[^}]*font-size: 15px; font-weight: 600/.test(css16)) throw new Error('patch 16: the .trust role must exist at 15px semibold');
  // P1c: the verdict is a sign — an edge and an icon in the verdict colour, never a solid fill.
  if (!/border-left: 8px solid var\(--good\)/.test(rule16('.verdict.yes'))) throw new Error('patch 16: the Yes verdict needs its 8px --good edge');
  if (!/border-left: 8px solid var\(--bad\)/.test(rule16('.verdict.no'))) throw new Error('patch 16: the No verdict needs its 8px --bad edge');
  if (/background:\s*var\(--good\)/.test(rule16('.verdict.yes')) || /background:\s*var\(--bad\)/.test(rule16('.verdict.no'))) throw new Error('patch 16: the verdict must not fill with the solid verdict colour');
  // P5: warnings carry a shape, not just a colour.
  if (!/\.warnbox::before \{[^}]*content: "⚠/.test(css16)) throw new Error('patch 16: warnboxes must carry the ⚠ shape');
  if (!/\.warnbox \{[^}]*border-left: 4px/.test(css16)) throw new Error('patch 16: the warnbox edge must be 4px');
  // P8: the hazard frame on the out-of-time driving view.
  if (!/main\.drive\.bad::after \{[^}]*repeating-linear-gradient\(45deg/.test(css16)) throw new Error('patch 16: the out-of-time driving view must wear the hazard stripes');
  // P3: the measured header height drives the sticky offsets and anchored scrolling.
  if (!/\.split-now-after \{[^}]*top: var\(--top-h,/.test(css16)) throw new Error('patch 16: the Split strip must sit at the measured --top-h');
  if (!/scroll-padding-top: var\(--top-h,/.test(css16)) throw new Error('patch 16: anchored scrolling must clear the measured header');
  if (!/ResizeObserver/.test(app16) || !/--top-h/.test(app16)) throw new Error('patch 16: the app must measure the header into --top-h');
  // Opus verify-16: the observer must live with the header it measures (the driving view unmounts it; Details mounts a new one).
  { const tb = app16.slice(app16.indexOf('function TopBar('), app16.indexOf('\n}\n', app16.indexOf('function TopBar(')));
    if (!/<header class="top"[^>]*ref=\{headerRef\}/.test(tb) || !/new ResizeObserver/.test(tb) || /querySelector\('header\.top'\)/.test(app16)) throw new Error('patch 16: --top-h must be measured by TopBar on its own header element (a once-on-mount query watches a stale header after the driving view)'); }
  // P2: the hero — dial room, the container-sized number, no glow, no shrink class.
  if (!/\.hero \.dial \{ max-width: 300px/.test(css16)) throw new Error('patch 16: the hero dial must have its 300px');
  if (!/\.hero \.hero-value \{[^}]*font-size: clamp\(42px, 23cqi, 56px\)/.test(css16)) throw new Error('patch 16: the hero number must size off its container');
  // Opus verify-16: a runtime without container units drops the clamp — it must land on 42px, not the 64px base rule — and the number never wraps.
  if (!/\.hero \.hero-value \{ font-size: 42px; font-size: clamp\(/.test(css16) || !/\.hero \.hero-value \{[^}]*white-space: nowrap/.test(css16)) throw new Error('patch 16: the hero number needs its 42px fallback before the clamp and white-space: nowrap');
  if (/hero-value\.long/.test(css16) || /text-shadow: 0 0 18px/.test(css16)) throw new Error('patch 16: the hero glow and the shrink class are gone');
  if (!/\.dial-center \{ container-type: inline-size/.test(css16)) throw new Error('patch 16: the dial centre must be the size container');
  // M11: the ring's substance — dotted while estimated, hollow on the demo clock.
  if (!/\.dial\.basis-estimate \.dial-fill \{[^}]*stroke-dasharray/.test(css16)) throw new Error('patch 16: an estimated answer must dot the ring');
  // Opus verify-16: the dashes must be VISIBLE — a round cap adds a full stroke width to every dash.
  {
    const est = rule16('.dial.basis-estimate .dial-fill');
    const [dash, gap] = (est.match(/stroke-dasharray:\s*([\d.]+)\s+([\d.]+)/) || []).slice(1).map(Number);
    const round = !/stroke-linecap:\s*butt/.test(est) && /\.dial-fill \{[^}]*stroke-linecap: round/.test(css16);
    for (const size of [270, 320]) { const sw = size * 0.05; const visible = gap - (round ? sw : 0);
      if (!(dash > 0) || !(visible >= 0.4 * sw)) throw new Error(`patch 16: the estimate ring's gaps are not visible at size ${size} (dash ${dash}, gap ${gap}, ${round ? 'round' : 'butt'} caps, stroke ${sw}: visible gap ${visible})`); }
  }
  if (!/\.dial\.basis-demo \.dial-fill/.test(css16)) throw new Error('patch 16: the demo clock must hollow the ring');
  // P13: a press answers under the finger; reduced motion stills it.
  if (!/button:active \{ transform: translateY\(1px\)/.test(css16)) throw new Error('patch 16: a press must answer under the finger');
  if (!/prefers-reduced-motion: reduce\) \{ button:active \{ transform: none/.test(css16)) throw new Error('patch 16: reduced motion must still the press feedback');
  // P10: the dock keys get their room.
  if (!/\.status-buttons \{[^}]*gap: 12px/.test(css16)) throw new Error('patch 16: the dock keys need their 12px');
  // Extra A (§6.4): the voice panel says where the audio goes; the old line must not come back.
  if (!/in Chrome the audio goes to Google/.test(app16)) throw new Error('patch 16: the voice panel must say plainly that Chrome sends the audio to Google');
  if (/Your phone turns speech into text/.test(app16)) throw new Error('patch 16: the old voice line claimed the phone does the listening');

  // P1a: the shell starts dark and the boot script corrects it pre-paint — all eight cases
  // of (chosen day / chosen night / unchosen / no usable save) × (phone dark / light) must
  // land where the app's own effective-theme rule lands.
  if (!html16.includes('content="#090c10"')) throw new Error('patch 16: the static theme-color must be the night page colour');
  if (mf16.background_color !== '#090c10' || mf16.theme_color !== '#090c10') throw new Error('patch 16: the manifest must splash dark, never light');
  const boot16 = html16.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!boot16) throw new Error('patch 16: index.html must carry the inline boot script');
  const runBoot16 = (save, prefersDark) => {
    const attrs = { theme: 'day', meta: '#090c10' };
    const doc = {
      documentElement: { setAttribute: (k, v) => { if (k === 'data-theme') attrs.theme = v; }, removeAttribute: (k) => { if (k === 'data-theme') attrs.theme = null; } },
      querySelector: (sel) => (sel === 'meta[name="theme-color"]' ? { setAttribute: (k, v) => { if (k === 'content') attrs.meta = v; } } : null),
    };
    const win = { matchMedia: () => ({ matches: prefersDark }) };
    const ls = { getItem: (k) => (k === 'hos-sandbox-v1' ? save : null) };
    new Function('window', 'document', 'localStorage', boot16)(win, doc, ls);
    return attrs;
  };
  const saveDay16 = JSON.stringify({ theme: 'day', themeChosen: true });
  const saveNight16 = JSON.stringify({ theme: 'night', themeChosen: true });
  const saveUnchosen16 = JSON.stringify({ theme: 'day', themeChosen: false });
  for (const [save, dark, theme, meta] of [
    [saveDay16, true, 'day', '#e4e9ee'], [saveDay16, false, 'day', '#e4e9ee'],
    [saveNight16, true, null, '#090c10'], [saveNight16, false, null, '#090c10'],
    [saveUnchosen16, true, null, '#090c10'], [saveUnchosen16, false, 'day', '#e4e9ee'],
    [null, true, null, '#090c10'], ['{corrupt', false, 'day', '#e4e9ee'],
  ]) {
    const got = runBoot16(save, dark);
    if (got.theme !== theme || got.meta !== meta) throw new Error(`patch 16: boot script case save=${String(save).slice(0, 24)} phoneDark=${dark} gave theme=${got.theme} meta=${got.meta}, expected theme=${theme} meta=${meta}`);
  }

  // Opus verify-16: the boot script against the app's OWN launch path (loadSaved → screenTheme at
  // launch: tab Now, no peek), not hand-written expectations — so the two can never drift.
  {
    const { loadSaved: ls16, screenTheme: st16b } = await import('../src/store.ts');
    const hourMin = (h) => { const d = new Date(2026, 10, 10, h, 0); return Math.floor(d.getTime() / 60000); };
    const drv = (h, chosen) => JSON.stringify({ theme: 'day', themeChosen: chosen, nowOverride: hourMin(h), drivingView: true, darkDriveAtNight: true, segments: [{ status: 'OFF', start: hourMin(h) - 700, end: hourMin(h) - 30 }], current: { status: 'D', since: hourMin(h) - 30 } });
    const savesB = [JSON.stringify({ theme: 'day', themeChosen: true }), JSON.stringify({ theme: 'night', themeChosen: true }), JSON.stringify({ theme: 'day', themeChosen: false }), JSON.stringify({ theme: 'night' }), null, '{corrupt', drv(2, true), drv(2, false), drv(13, true), drv(23, false)];
    const keep = new Map(mem);
    for (const save of savesB) for (const dark of [true, false]) {
      mem.clear(); if (save !== null) mem.set('hos-sandbox-v1', save);
      const st = ls16(); const up = st.tab === 'now' && st.drivingView && st.current?.status === 'D';
      const want = st16b(st, dark, up, st.nowOverride ?? nowMin());
      const got = runBoot16(save, dark).theme === 'day' ? 'day' : 'night';
      if (got !== want) { mem.clear(); for (const [k, v] of keep) mem.set(k, v); throw new Error(`patch 16: boot script and the app disagree at launch: save=${String(save).slice(0, 40)} phoneDark=${dark} boot=${got} app=${want}`); }
    }
    mem.clear(); for (const [k, v] of keep) mem.set(k, v);
  }

  // P1b: the screen rule — the driving view wears night inside 19:00–07:00 on the phone's
  // own clock while the setting is on, and only then.
  const atHour16 = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return Math.floor(d.getTime() / 60000); };
  const dayChosen16 = { theme: 'day', themeChosen: true, darkDriveAtNight: true };
  if (screen16(dayChosen16, false, true, atHour16(2)) !== 'night') throw new Error('patch 16: at 2 AM the driving screen must wear night over a Day choice');
  if (screen16(dayChosen16, false, true, atHour16(13)) !== 'day') throw new Error('patch 16: at 1 PM the driving screen keeps the chosen Day');
  if (screen16({ ...dayChosen16, darkDriveAtNight: false }, false, true, atHour16(2)) !== 'day') throw new Error('patch 16: with the setting off, the driving screen keeps the chosen theme at night');
  if (screen16(dayChosen16, false, false, atHour16(2)) !== 'day') throw new Error('patch 16: off the driving view, the night rule must not reach the rest of the app');
  if (!ddna16({ darkDriveAtNight: true }, atHour16(19)) || ddna16({ darkDriveAtNight: true }, atHour16(7)) || ddna16({ darkDriveAtNight: true }, atHour16(18)) || !ddna16({ darkDriveAtNight: true }, atHour16(6))) throw new Error('patch 16: the night window is 19:00–07:00 on the phone clock');

  // The two new state fields stay home: the export must not carry device settings.
  setState({ darkDriveAtNight: false, zoneAck: 'a|b' });
  const expOut16 = exp16(getState());
  if (/darkDriveAtNight|zoneAck/.test(expOut16)) throw new Error('patch 16: device settings (darkDriveAtNight, zoneAck) must not ride the export');
  setState({ darkDriveAtNight: true, zoneAck: null });

  notice16(false);
  // P2 order: on a fresh clock the hero leads and the DEMO chip stands open under it.
  setState({ tab: 'now', nowOverride: L16(12, 12), segments: [], tentative: [], current: null, historyAcknowledged: false, seededAt: null });
  let h16 = out('16/now fresh');
  if (!(h16.indexOf('<section class="hero"') >= 0 && h16.indexOf('<section class="hero"') < h16.indexOf('DEMO — assumed full clocks'))) throw new Error('patch 16: the hero must lead Now, ahead of the notices');
  if (!/<details class="notice" open>/.test(h16) || !/DEMO — assumed full clocks, not your day/.test(h16)) throw new Error('patch 16: the DEMO chip must stand open under the hero');
  if (!/basis-demo/.test(h16)) throw new Error('patch 16: on the demo clock the ring must be the hollow outline');

  // Opus verify-16: an estimated answer wears the estimate ring AND the word; a full own log wears neither.
  setState({ tab: 'now', nowOverride: L16(12, 12), historyAcknowledged: false, segments: [], tentative: [], current: { status: 'ON', since: L16(12, 11), createdAt: 1 }, seededAt: null });
  h16 = out('16/now estimate ring');
  if (!/class="dial [a-z]+ basis-estimate"/.test(h16) || !/class="hero-basis">estimate</.test(h16)) throw new Error('patch 16: an estimated answer must carry the estimate ring and the word');
  setState({ historyAcknowledged: true, segments: [{ status: 'OFF', start: L16(11, 8), end: L16(12, 11), createdAt: 1 }] });
  h16 = out('16/now own log ring');
  if (/basis-(estimate|demo)/.test(h16) || /class="hero-basis"/.test(h16)) throw new Error('patch 16: an answer from the driver\'s own log wears the solid ring, no qualifier');

  // D5-A: the two-zones chip — one line once acknowledged, open again when a zone changes.
  const other16 = dtz16 === 'America/New_York' ? 'America/Chicago' : 'America/New_York';
  const third16 = ['America/Denver', 'America/Chicago', 'America/New_York', 'America/Los_Angeles'].find((z) => z !== dtz16 && z !== other16);
  setState({
    tab: 'now', nowOverride: L16(12, 12), historyAcknowledged: true, zoneAck: null,
    segments: [{ status: 'OFF', start: L16(11, 20), end: L16(12, 6), createdAt: 1 }],
    current: { status: 'ON', since: L16(12, 6), createdAt: 2 },
    config: { ...getState().config, timeZone: other16 },
  });
  h16 = out('16/now two zones unacknowledged');
  const chip16 = `Clock times: ${zs16(dtz16)} (phone) · carrier day: ${zs16(other16)}`;
  if (!h16.includes(chip16)) throw new Error('patch 16: the two-zones chip must read as one line naming both zones');
  if (!/<details class="notice" open>/.test(h16)) throw new Error('patch 16: an unacknowledged zone pair must stand open');
  if (!/class="warnbox">\s*<b>Two time zones in play\.<\/b>/.test(h16)) throw new Error('patch 16: the full two-zones wording must survive inside the chip');
  setState({ zoneAck: zp16(getState()) });
  h16 = out('16/now two zones acknowledged');
  if (!h16.includes(chip16) || /<details class="notice" open>/.test(h16)) throw new Error('patch 16: once acknowledged, the chip must collapse to its one line');
  setState({ config: { ...getState().config, timeZone: third16 } });
  h16 = out('16/now zone changed');
  if (!/<details class="notice" open>/.test(h16)) throw new Error('patch 16: when either zone changes, the chip must stand open again');

  // P9: End my day sits below the grid as a plain wide key; right after a close, its slot
  // carries the undo.
  setState({ tab: 'now', nowOverride: L16(12, 18, 42), zoneAck: null, config: { ...getState().config, timeZone: dtz16 } });
  h16 = out('16/now end-of-day offered');
  if (!/<button class="wide">End my day<\/button>/.test(h16)) throw new Error('patch 16: End my day must be a plain wide key on Now');
  if (!(h16.indexOf('Last 24 hours') >= 0 && h16.indexOf('Last 24 hours') < h16.indexOf('End my day'))) throw new Error('patch 16: End my day must sit below the grid');
  endDay16(L16(12, 18, 42));
  h16 = out('16/now just closed');
  if (!h16.includes(`Closed the day at ${clock(L16(12, 18, 42), false)}`) || !/>Undo</.test(h16)) throw new Error('patch 16: right after a close, the slot must offer the undo');
  if (!undoLast16()) throw new Error('patch 16: the close undo must work from the slot');
  h16 = out('16/now close undone');
  if (!/<button class="wide">End my day<\/button>/.test(h16)) throw new Error('patch 16: undoing the close must bring the button back');

  // P10: a status tap takes the undo slot with a named label; a no-op tap takes nothing.
  setState({ tab: 'now', nowOverride: L16(12, 20), segments: [], tentative: [], current: { status: 'ON', since: L16(12, 19), createdAt: 3 }, historyAcknowledged: true });
  if (undoNow16() !== null) throw new Error('patch 16: the undo slot must start empty here');
  tap16('ON');
  if (undoNow16() !== null) throw new Error('patch 16: tapping the status you are already in must record no undo');
  tap16('OFF');
  if (undoNow16()?.label !== `Off Duty since ${clock(L16(12, 20), false)}`) throw new Error(`patch 16: a status tap must own the undo slot with its name and time, got ${undoNow16()?.label}`);
  if (!undoLast16() || getState().current?.status !== 'ON') throw new Error('patch 16: undoing a status tap must restore the status it replaced');
  if (undoNow16() !== null) throw new Error('patch 16: the slot must be empty after the tap is undone');

  // P12: a Yes names the plan it stands on.
  setState({
    tab: 'load', nowOverride: L16(12, 10), historyAcknowledged: true, seededAt: null, mph: 55,
    segments: [{ status: 'OFF', start: L16(11, 20), end: L16(12, 9), createdAt: 1 }],
    current: { status: 'ON', since: L16(12, 9), createdAt: 2 }, tentative: [],
    loadCheck: { miles: 300, dwell: 60, dwellOff: false, leaveIn: 0, waitOff: false, answered: true },
  });
  const t16 = txt16(out('16/load verdict names its plan'));
  if (!/Yes, it’s legal/.test(t16) || !/using 10-hour breaks/.test(t16)) throw new Error('patch 16: a Yes must name the rest plan it stands on');
  if (!/<div class="verdict-big"><svg[^>]*width="32"/.test(out('16/load verdict icon'))) throw new Error('patch 16: the verdict word must lead with its 32px ✓/✕ icon — the shape cue the colour-blind check relies on');

  // P1b's setting is on the Driving alerts card, in words.
  setState({ tab: 'settings', nowOverride: null });
  h16 = out('16/settings driving alerts');
  if (!/Dark driving screen at night/.test(h16)) throw new Error('patch 16: the dark-driving-screen setting must be offered in More → Driving alerts');

  notice16(true);
  setState({ nowOverride: null, tab: 'now', historyAcknowledged: false, segments: [], tentative: [], current: null });
  console.log('patch 16 (hero-first Now, verdict sign, warning shapes, trust ring, status undo, dark driving screen, dark-safe shell): OK');
}

// --- patch 17 "Read It To Me" (M3): spoken driving alerts behind the D7-A ask-once gate.
// New pins only. The wording composers are pinned as exact strings (the brainstorm's own
// example sentences among them); the wiring is pinned through tapStatus with a stubbed
// speechSynthesis, the way patch 11 pinned its recognition detect. The alert effect is a
// React effect (not run by this harness), so its speech line is pinned at the source, the
// same treatment patch 16 gave the header observer.
{
  const { numWords: nw17, clockWords: cw17, durationWords: dw17, alertSpeech: as17, statusSpeech: ss17, speechReady: sr17, shouldAskSpeech: ask17 } = await import('../src/alerts.ts');
  const { tapStatus: tap17, useRealClock: realClock17 } = await import('../src/app.tsx');
  const { INITIAL_STATE: init17, parseSaved: parse17, exportState: exp17, SIM_KEY: simKey17, allSegments: allSeg17 } = await import('../src/store.ts');
  const app17 = await readFile(new URL('../src/app.tsx', import.meta.url), 'utf8');
  // A wall-clock time built from LOCAL parts, so the spoken reading is the same under any TZ.
  const LT17 = (h, m = 0) => Math.floor(new Date(2026, 10, 9, h, m).getTime() / 60000);

  // The number/clock/duration words — the whole table, edges included.
  const nums17 = [[0, 'zero'], [7, 'seven'], [13, 'thirteen'], [20, 'twenty'], [21, 'twenty-one'], [47, 'forty-seven'], [99, 'ninety-nine']];
  for (const [n, w] of nums17) if (nw17(n) !== w) throw new Error(`patch 17: numWords(${n}) must be "${w}", got "${nw17(n)}"`);
  const clocks17 = [[LT17(0, 0), "twelve o'clock"], [LT17(12, 0), "twelve o'clock"], [LT17(0, 5), 'twelve oh five'], [LT17(12, 5), 'twelve oh five'],
    [LT17(5, 40), 'five forty'], [LT17(17, 40), 'five forty'], [LT17(9, 30), 'nine thirty'], [LT17(13, 9), 'one oh nine'],
    [LT17(23, 59), 'eleven fifty-nine'], [LT17(1, 15), 'one fifteen'], [LT17(10, 10), 'ten ten'], [LT17(6, 0), "six o'clock"]];
  for (const [t, w] of clocks17) if (cw17(t) !== w) throw new Error(`patch 17: clockWords must read "${w}", got "${cw17(t)}"`);
  const durs17 = [[0, 'no time'], [1, 'one minute'], [2, 'two minutes'], [15, 'fifteen minutes'], [30, 'thirty minutes'], [45, 'forty-five minutes'],
    [59, 'fifty-nine minutes'], [60, 'one hour'], [61, 'one hour one'], [90, 'one hour thirty'], [119, 'one hour fifty-nine'],
    [120, 'two hours'], [156, 'two hours thirty-six'], [660, 'eleven hours'], [840, 'fourteen hours'], [4200, 'seventy hours']];
  for (const [n, w] of durs17) if (dw17(n) !== w) throw new Error(`patch 17: durationWords(${n}) must be "${w}", got "${dw17(n)}"`);

  // The spoken sentences, word for word. The Driving confirmation and the 60-minute alert
  // are the brainstorm's own example sentences (M3), with its standard seed's numbers.
  if (ss17('D', LT17(2, 4), 156, LT17(5, 40)) !== 'Driving. You can drive two hours thirty-six. Stop by five forty.') throw new Error(`patch 17: the Driving confirmation must be the brainstorm's sentence, got "${ss17('D', LT17(2, 4), 156, LT17(5, 40))}"`);
  if (ss17('D', LT17(2, 4), 0, LT17(5, 40)) !== 'Driving. No driving time left.') throw new Error('patch 17: a Driving tap with no time left must say so');
  if (ss17('D', LT17(2, 4)) !== 'Driving.') throw new Error('patch 17: a Driving confirmation without an evaluation is the word alone');
  if (ss17('OFF', LT17(5, 40)) !== 'Off duty since five forty.') throw new Error(`patch 17: Off duty confirmation wrong: "${ss17('OFF', LT17(5, 40))}"`);
  if (ss17('SB', LT17(22, 5)) !== 'Sleeper berth since ten oh five.') throw new Error(`patch 17: Sleeper confirmation wrong: "${ss17('SB', LT17(22, 5))}"`);
  if (ss17('ON', LT17(9, 0)) !== "On duty since nine o'clock.") throw new Error(`patch 17: On duty confirmation wrong: "${ss17('ON', LT17(9, 0))}"`);
  if (as17(60, 60, LT17(5, 40), '14-hour duty window') !== 'One hour of driving left. Stop by five forty. Limited by the 14-hour duty window.') throw new Error(`patch 17: the 60-minute alert sentence wrong: "${as17(60, 60, LT17(5, 40), '14-hour duty window')}"`);
  if (as17(30, 30, LT17(5, 40), '11-hour driving limit') !== 'Thirty minutes of driving left. Stop by five forty. Limited by the 11-hour driving limit.') throw new Error('patch 17: the 30-minute alert sentence wrong');
  if (as17(15, 15, LT17(5, 40), '8-hour driving limit before a 30-minute break') !== 'Fifteen minutes of driving left. Stop by five forty. Limited by the 8-hour driving limit before a 30-minute break.') throw new Error('patch 17: the 15-minute alert sentence wrong');
  if (as17(30, 47, LT17(5, 40), '14-hour duty window') !== 'Forty-seven minutes of driving left. Stop by five forty. Limited by the 14-hour duty window.') throw new Error('patch 17: an alert that slept past its mark must speak the time actually left, not the mark');
  if (as17(0, 0, LT17(5, 40), '11-hour driving limit') !== 'Out of driving time. Park as soon as it is safe. You are over the 11-hour driving limit.') throw new Error('patch 17: the zero alert sentence wrong');

  // The gate: asked AND on AND a real clock — and the question only where speech exists.
  if (init17.speakAlerts !== false || init17.speechAsked !== false || init17.speakAskOpen !== false) throw new Error('patch 17: a fresh install starts un-asked and silent (D7-A)');
  if (sr17({ speakAlerts: true, speechAsked: true }, false) !== true) throw new Error('patch 17: an asked yes on a real clock must be ready to speak');
  if (sr17({ speakAlerts: true, speechAsked: false }, false) !== false) throw new Error('patch 17: nothing speaks before the driver answers (D7-A)');
  if (sr17({ speakAlerts: false, speechAsked: true }, false) !== false) throw new Error('patch 17: a no stays silent');
  if (sr17({ speakAlerts: true, speechAsked: true }, true) !== false) throw new Error('patch 17: a simulated clock never speaks');

  // Consent-safe repairs: a damaged or older save can never turn speech on by itself.
  const dmg17 = parse17(JSON.stringify({ speakAlerts: 'yes', speechAsked: 1, speakAskOpen: true }));
  if (dmg17.speakAlerts !== false || dmg17.speechAsked !== false || dmg17.speakAskOpen !== false) throw new Error('patch 17: damaged speech fields must repair to un-asked and off, and the question never reopens on launch');
  const good17 = parse17(JSON.stringify({ speakAlerts: true, speechAsked: true }));
  if (good17.speakAlerts !== true || good17.speechAsked !== true) throw new Error('patch 17: a genuine yes must survive a save/load round trip');
  // Device settings stay home: the export whitelist never carries them.
  if (/speakAlerts|speechAsked/.test(exp17(getState()))) throw new Error('patch 17: the speech settings must stay out of export');

  // Wiring through the real tap path, with a stubbed speechSynthesis recording utterances.
  const spoken17 = [];
  globalThis.speechSynthesis = { cancel: () => spoken17.push('«cancel»'), speak: (u) => spoken17.push(u.text) };
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  const said17 = () => spoken17.filter((x) => x !== '«cancel»');
  if (ask17({ speakAlerts: false, speechAsked: false }, false) !== true) throw new Error('patch 17: with speech available and no answer yet, the question is due');
  if (ask17({ speakAlerts: false, speechAsked: false }, true) !== false) throw new Error('patch 17: a simulated clock never raises the question');
  if (ask17({ speakAlerts: false, speechAsked: true }, false) !== false) throw new Error('patch 17: an answered question is never asked again');

  const now17 = nowMin();
  setState({ tab: 'now', nowOverride: null, segments: [], tentative: [], current: { status: 'ON', since: now17 - 30, createdAt: 1 }, historyAcknowledged: true, speakAlerts: false, speechAsked: false, speakAskOpen: false });
  tap17('D');
  if (getState().current?.status !== 'D') throw new Error('patch 17: the Driving tap itself must still land');
  if (getState().speakAskOpen !== true) throw new Error('patch 17: the first real Driving tap must raise the D7-A question');
  if (said17().length !== 0) throw new Error('patch 17: the tap that raises the question must not itself speak');
  // "No thanks": remembered, never re-asked, and the taps stay silent.
  setState({ speakAlerts: false, speechAsked: true, speakAskOpen: false });
  tap17('ON'); tap17('D');
  if (getState().speakAskOpen !== false) throw new Error('patch 17: after a no, the question must not come back');
  if (said17().length !== 0) throw new Error('patch 17: after a no, status taps stay silent');
  // "Yes, say them": the taps answer back. The wording is pinned above; here the exact
  // composer output for the live record proves the wiring speaks the screen's own numbers.
  setState({ speakAlerts: true, speechAsked: true });
  tap17('OFF');
  const offSince17 = getState().current?.since;
  if (said17().length !== 1 || said17()[0] !== ss17('OFF', offSince17)) throw new Error(`patch 17: an Off duty tap must speak its confirmation, got ${JSON.stringify(said17())}`);
  tap17('D');
  const dSince17 = getState().current?.since;
  const ev17 = evNow(allSeg17(getState(), dSince17), { asOf: dSince17, config: getState().config });
  if (said17().length !== 2 || said17()[1] !== ss17('D', dSince17, ev17.driveNow, ev17.mustStopBy)) throw new Error(`patch 17: a Driving tap must speak the evaluated confirmation, got ${JSON.stringify(said17())}`);
  // A newer utterance supersedes: every spoken line is preceded by a cancel.
  if (spoken17.filter((x) => x === '«cancel»').length !== 2) throw new Error('patch 17: each utterance must cancel the one before it (no stale queue)');

  // The sim guard, behaviourally: opted in, under a simulated clock, taps neither speak
  // nor ask — and the speech settings are not part of the quarantine snapshot.
  setState({ nowOverride: now17 + 120, current: { status: 'ON', since: now17 - 30, createdAt: 1 } });
  const simSnap17 = mem.get(simKey17) ?? '';
  if (/speakAlerts|speechAsked/.test(simSnap17)) throw new Error('patch 17: the speech settings must stay out of the sim snapshot (device settings)');
  tap17('D');
  if (said17().length !== 2) throw new Error('patch 17: a status tap under a simulated clock must not speak');
  setState({ speechAsked: false, speakAlerts: false });
  tap17('ON'); tap17('D');
  if (getState().speakAskOpen !== false) throw new Error('patch 17: a Driving tap under a simulated clock must not raise the question');
  realClock17();
  // Without speechSynthesis the feature is absent: no question, no crash, taps still land.
  delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance;
  if (ask17({ speakAlerts: false, speechAsked: false }, false) !== false) throw new Error('patch 17: without speechSynthesis the question is never due');
  setState({ tab: 'now', nowOverride: null, segments: [], tentative: [], current: { status: 'ON', since: nowMin() - 30, createdAt: 1 }, speakAlerts: false, speechAsked: false, speakAskOpen: false });
  tap17('D');
  if (getState().speakAskOpen !== false || getState().current?.status !== 'D') throw new Error('patch 17: without speechSynthesis a Driving tap just lands, no question');

  // Source pins for the two effect/harness-blind spots: the alert effect's speech line
  // (gated, after the sound) and the Settings switch (rendered only where speech exists,
  // so this harness — which cannot run the card's effect — pins its binding here).
  const fx17 = app17.slice(app17.indexOf('function useDrivingAlerts'), app17.indexOf('function useWakeLock'));
  if (!/speechReady\(s, false\) && s\.alertsOn/.test(fx17) || !/speakAloud\(alertSpeech\(r\.fire/.test(fx17)) throw new Error('patch 17: a fired alert must be spoken after the sound, gated on the D7-A yes and the master alert switch');
  if (fx17.indexOf('speakAloud(alertSpeech') < fx17.indexOf('sound(r.fire')) throw new Error('patch 17: the spoken alert comes after the chime, not before it');
  if (!/Read driving alerts out loud/.test(app17) || !/speakAlerts: \(e\.target as HTMLInputElement\)\.checked, speechAsked: true/.test(app17)) throw new Error('patch 17: the Driving alerts card must offer the speech switch, and using it records the D7-A answer');
  if (!/Want the alerts read out loud\?/.test(app17) || !/Yes, say them/.test(app17) || !/No thanks/.test(app17)) throw new Error('patch 17: the D7-A question must render with the decision\'s own wording');

  setState({ tab: 'now', nowOverride: null, segments: [], tentative: [], current: null, speakAlerts: false, speechAsked: false, speakAskOpen: false });
  console.log('patch 17 (spoken driving alerts, D7-A ask-once, time-to-words): OK');
}

// --- patch 17 FIX ROUND (Verify-17: F1 back-dated tap speech, F2 consent-pair repair,
// F3 ask-trigger pin, N1 cold-start zero). New pins only, appended after the patch-17
// block; each is shown red on the unfixed candidate where it guards changed behaviour.
{
  const { statusSpeech: ssF, alertSpeech: asF, clockWords: cwF, nextAlert: naF, NO_ALERTS: noF } = await import('../src/alerts.ts');
  const { tapStatus: tapF } = await import('../src/app.tsx');
  const { parseSaved: parseF, allSegments: allSegF } = await import('../src/store.ts');
  const appF = await readFile(new URL('../src/app.tsx', import.meta.url), 'utf8');

  // The speech stub is installed afresh for this block (the patch-17 block deleted it).
  const spokenF = [];
  globalThis.speechSynthesis = { cancel: () => spokenF.push('«cancel»'), speak: (u) => spokenF.push(u.text) };
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  const saidF = () => spokenF.filter((x) => x !== '«cancel»');

  // F3 (Verify-17 §9, mutation M6): the question is due on a Driving tap ONLY. On a
  // fresh record the first Off Duty, Sleeper and On Duty taps never open it and never
  // speak; the next Driving tap does.
  const tF = nowMin();
  setState({ tab: 'now', nowOverride: null, segments: [], tentative: [], current: { status: 'ON', since: tF - 30, createdAt: 1 }, historyAcknowledged: true, speakAlerts: false, speechAsked: false, speakAskOpen: false });
  tapF('OFF'); tapF('SB'); tapF('ON');
  if (getState().speakAskOpen !== false || getState().speechAsked !== false) throw new Error('patch 17 fix: a non-Driving first tap must never open the D7-A question');
  if (saidF().length !== 0) throw new Error('patch 17 fix: non-Driving first taps must not speak');
  tapF('D');
  if (getState().speakAskOpen !== true) throw new Error('patch 17 fix: the next Driving tap must open the D7-A question');
  if (saidF().length !== 0) throw new Error('patch 17 fix: the asking tap itself must not speak');

  // F1 (Verify-17 §3): a back-dated Driving tap speaks the SCREEN's numbers — the
  // post-tap record evaluated at NOW, never at the back-dated start. Scenario: a 10h
  // rest ending 60 minutes ago and nothing since; the tap starts Driving 30 minutes
  // back. The screen (the record closed at now, evaluated at now) reads 450 — the
  // 30-minute break clock binds — while the tap-instant composition reads 480, so the
  // two disagree by exactly the back-date and the pin can tell them apart.
  const rEndF = nowMin() - 60;
  setState({ tab: 'now', nowOverride: null, segments: [{ status: 'OFF', start: rEndF - 600, end: rEndF, createdAt: 1 }], tentative: [], current: null, historyAcknowledged: true, speakAlerts: true, speechAsked: true, speakAskOpen: false });
  tapF('D', undefined, 30);
  const atF = getState().current?.since;
  const postF = getState();
  const nowF = nowMin();
  const evScrF = evNow(allSegF(postF, nowF), { asOf: nowF, config: postF.config });
  if (evScrF.driveNow !== 450) throw new Error(`patch 17 fix: F1 scenario sanity — the screen must show 450 drive minutes, got ${evScrF.driveNow}`);
  if (saidF().length !== 1 || saidF()[0] !== ssF('D', atF, evScrF.driveNow, evScrF.mustStopBy)) throw new Error(`patch 17 fix: a status-sheet Driving tap with minutesAgo = 30 must speak durationWords(screen driveNow), got ${JSON.stringify(saidF())}`);
  if (saidF()[0] !== 'Driving. You can drive seven hours thirty. Stop by ' + cwF(evScrF.mustStopBy) + '.') throw new Error(`patch 17 fix: the back-dated tap must speak the hand-checked sentence, got "${saidF()[0]}"`);

  // F1, the exhausted case (Verify-17 §3, its F2b shape): the window is already gone
  // (10h rest, 470 minutes of driving, then On Duty) and the driver taps Driving 30
  // minutes back. The screen reads 0, so the tap speaks "No driving time left" and
  // never a positive "You can drive" — the tap-instant composition would read 20.
  const rEnd0F = nowMin() - 850;
  setState({ tab: 'now', nowOverride: null, segments: [{ status: 'OFF', start: rEnd0F - 600, end: rEnd0F, createdAt: 1 }, { status: 'D', start: rEnd0F, end: rEnd0F + 470, createdAt: 1 }], tentative: [], current: { status: 'ON', since: nowMin() - 40, createdAt: 1 }, historyAcknowledged: true, speakAlerts: true, speechAsked: true, speakAskOpen: false });
  const beforeF = saidF().length;
  tapF('D', undefined, 30);
  const post0F = getState();
  if (post0F.current?.status !== 'D' || post0F.current?.since !== nowMin() - 30) throw new Error('patch 17 fix: the exhausted-case tap must land as Driving starting 30 minutes back');
  const now0F = nowMin();
  const ev0F = evNow(allSegF(post0F, now0F), { asOf: now0F, config: post0F.config });
  if (!(ev0F.driveNow <= 0)) throw new Error(`patch 17 fix: exhausted-case sanity — the screen driveNow must be <= 0, got ${ev0F.driveNow}`);
  if (saidF().length !== beforeF + 1 || saidF()[beforeF] !== 'Driving. No driving time left.') throw new Error(`patch 17 fix: an exhausted back-dated tap must speak "Driving. No driving time left.", got ${JSON.stringify(saidF().slice(beforeF))}`);

  // F1 on the consent-Yes path (Verify-17 §9, mutation M8): Yes answered after a
  // back-dated first Driving tap speaks the screen's drive-left. The handler is a
  // component closure this harness cannot click, so it is pinned at the source — the
  // treatment patch 16/17 give harness-blind wirings — and its composition is checked
  // against this block's exhausted record, where the screen reads none left.
  const yesSrcF = appF.slice(appF.indexOf('function SpeakAskDialog'), appF.indexOf('declare const __BUILD__'));
  if (!/const at = nowMin\(\);/.test(yesSrcF) || !/asOf: at, config: cur\.config/.test(yesSrcF) || !/statusSpeech\('D', cur\.current\.since/.test(yesSrcF)) throw new Error('patch 17 fix: the consent-Yes confirmation must be composed from an evaluation at nowMin(), never at the back-dated tap instant');
  if (ssF('D', post0F.current.since, ev0F.driveNow, ev0F.mustStopBy) !== 'Driving. No driving time left.') throw new Error('patch 17 fix: the Yes confirmation for the back-dated tap must carry the screen numbers (no time left)');

  // N1 (Verify-17 §8): a cold start speaks nothing EXCEPT the existing zero-on-open
  // alert for a driver who said yes. nextAlert with a fresh memory (a cold start) fires
  // 0 at once when driving time is already gone, and nothing while time remains; the
  // alert effect speaks exactly that fire for an opted-in driver, from the same numbers.
  if (naF(noF, true, 0, tF).fire !== 0) throw new Error('patch 17 fix: a cold start already out of driving time must fire the zero alert (zero-on-open)');
  for (const left of [61, 45, 20]) if (naF(noF, true, left, tF).fire !== null) throw new Error(`patch 17 fix: a cold start with ${left} minutes left must stay silent until a mark is crossed`);
  if (asF(0, 0, ev0F.mustStopBy, '11-hour driving limit') !== 'Out of driving time. Park as soon as it is safe. You are over the 11-hour driving limit.') throw new Error('patch 17 fix: the cold-start zero sentence must name the screen limit');

  // F2 (Verify-17 §4): consent is the PAIR. speakAlerts:true with a speechAsked that is
  // not literal true — false, or damaged ("yes") — must repair to off, or the Settings
  // switch shows ON on a device that stays silent and asks again.
  for (const asked of [false, 'yes']) {
    const mF = parseF(JSON.stringify({ speakAlerts: true, speechAsked: asked }));
    if (mF.speakAlerts !== false || mF.speechAsked !== false) throw new Error(`patch 17 fix: speakAlerts:true with speechAsked ${JSON.stringify(asked)} must repair to un-asked and OFF (consent is the pair)`);
  }
  const yesF = parseF(JSON.stringify({ speakAlerts: true, speechAsked: true }));
  if (yesF.speakAlerts !== true || yesF.speechAsked !== true) throw new Error('patch 17 fix: a genuine yes must still survive the pair repair');

  delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance;
  setState({ tab: 'now', nowOverride: null, segments: [], tentative: [], current: null, speakAlerts: false, speechAsked: false, speakAskOpen: false });
  console.log('patch 17 fix round (F1 back-date, F2 consent pair, F3 ask trigger, N1 cold start): OK');
}
// --- capstone C1: the Timeline card, the lever chips L1–L4, and decision C1-A.
// Every expectation below is derived from the engine (evaluate / driveAgainAt) and the
// store's own formatters on the same state the app renders — a regression in the lever
// MATH, not just in the wording, is what turns these red.
{
  const app = await import('../src/app.tsx');
  const lev = await import('../src/levers.ts');
  const { parseSaved, INITIAL_STATE: INIT, allSegments, dur } = await import('../src/store.ts');
  const { evaluate, driveAgainAt, pruneHistory } = await import('../../engine/src/index.ts');
  const CD = (day, h, m = 0) => Math.floor(new Date(2026, 10, day, h, m).getTime() / 60000);
  const NY = { ...INIT.config, timeZone: 'America/New_York' };
  const mk = (over) => ({ ...INIT, config: NY, disclaimerAcked: true, historyAcknowledged: true, ...over });
  const evOf = (s, now) => evaluate(allSegments(s, now), { asOf: now, config: s.config });
  app.setLaunchNotice(false);

  // (a) parseSaved repairs nowCard / nowCardAsked (decision C1-A's consent-safe default)
  if (parseSaved(JSON.stringify({ nowCard: 'timeline', nowCardAsked: true })).nowCard !== 'timeline') throw new Error('c1: a saved timeline choice must survive parseSaved');
  if (parseSaved(JSON.stringify({ nowCard: 'timeline', nowCardAsked: true })).nowCardAsked !== true) throw new Error('c1: a saved nowCardAsked must survive parseSaved');
  if (parseSaved(JSON.stringify({ nowCard: 'bogus' })).nowCard !== 'dial') throw new Error('c1: a damaged nowCard must repair to the dial');
  if (parseSaved('{}').nowCard !== 'dial' || parseSaved('{}').nowCardAsked !== false) throw new Error('c1: an old save with no nowCard fields opens on the dial, unasked');
  if (parseSaved(JSON.stringify({ nowCardAsked: 'yes' })).nowCardAsked !== false) throw new Error('c1: a non-true nowCardAsked must repair to false');

  // (b) the first full-disclaimer tap on a FRESH device chooses the Timeline (C1-A);
  // a device with a record keeps the dial; an already-acknowledged save never moves.
  setState(mk({ disclaimerAcked: false, nowCard: 'dial', segments: [], tentative: [], current: null }));
  app.acknowledgeDisclaimer();
  if (getState().nowCard !== 'timeline' || getState().disclaimerAcked !== true) throw new Error('c1: a fresh device’s first I-understand must open on the Timeline');
  setState(mk({ disclaimerAcked: false, nowCard: 'dial', segments: [{ status: 'OFF', start: CD(8, 0), end: CD(8, 10) }], current: null }));
  app.acknowledgeDisclaimer();
  if (getState().nowCard !== 'dial') throw new Error('c1: a device with a record keeps the dial at the disclaimer');
  setState(mk({ disclaimerAcked: true, nowCard: 'dial', segments: [], tentative: [], current: null }));
  app.acknowledgeDisclaimer();
  if (getState().nowCard !== 'dial') throw new Error('c1: acknowledging again must never move an existing choice');

  // The audit's standard seed (Appendix A) on the New York terminal clock.
  const seedSegs = [
    { status: 'OFF', start: CD(8, 5, 40), end: CD(8, 7, 40) }, { status: 'SB', start: CD(8, 7, 40), end: CD(8, 15, 40) },
    { status: 'ON', start: CD(8, 15, 40), end: CD(8, 16, 25) }, { status: 'D', start: CD(8, 16, 25), end: CD(8, 19, 10) },
    { status: 'OFF', start: CD(8, 19, 10), end: CD(8, 19, 40) }, { status: 'ON', start: CD(8, 19, 40), end: CD(8, 21, 55) }];
  const seedNow = CD(9, 3, 4);
  const seedState = mk({ segments: seedSegs, current: { status: 'D', since: CD(8, 21, 55) }, nowOverride: seedNow, tab: 'now', drivingView: false });
  const seedEv = evOf(seedState, seedNow);
  if (seedEv.driveNow !== 156 || seedEv.binding !== 'WINDOW_14') throw new Error('c1 setup: the standard seed must give 2h 36m with the window binding');

  // (c) the one-time chip: an existing install on the dial sees it once, a fresh one never
  setState({ ...seedState, nowCard: 'dial', nowCardAsked: false });
  let h = out('c1/one-time chip');
  if (!h.includes('your limits on a timeline') || !h.includes('>Show me<') || !h.includes('>Keep the dial<')) throw new Error('c1: an existing install on the dial must see the one-time Timeline chip');
  setState({ nowCardAsked: true });
  h = out('c1/chip answered');
  if (h.includes('your limits on a timeline')) throw new Error('c1: once answered, the chip must not come back');
  setState(mk({ segments: [], tentative: [], current: null, nowCard: 'dial', nowCardAsked: false, nowOverride: seedNow, tab: 'now' }));
  h = out('c1/fresh, no chip');
  if (h.includes('your limits on a timeline')) throw new Error('c1: a fresh device must not see the chip (it opens on the Timeline instead)');

  // (f) the lever unit pins, expectations from the engine
  const seedLevers = lev.computeLevers(seedState, seedNow, seedEv, 'log');
  if (seedLevers.length !== 1 || seedLevers[0].id !== 'L2') throw new Error('c1: the seed must offer exactly the L2 free-rest lever');
  const l2 = seedLevers[0];
  if (l2.restMin !== 120 || l2.status !== 'either' || l2.driveAfter !== seedEv.driveNow) throw new Error('c1: seed L2 = 2h, off duty or sleeper, driving kept whole (FAQ 22)');
  if (l2.pending?.isReset !== true || l2.pending?.longestSB !== 480) throw new Error('c1: seed L2 pairs with the 8h-sleeper reset leg');
  const negState = mk({ segments: [
    { status: 'OFF', start: CD(8, 5, 40), end: CD(8, 15, 40) },
    { status: 'ON', start: CD(8, 15, 40), end: CD(8, 16, 25) }, { status: 'D', start: CD(8, 16, 25), end: CD(8, 19, 10) },
    { status: 'OFF', start: CD(8, 19, 10), end: CD(8, 19, 40) }, { status: 'ON', start: CD(8, 19, 40), end: CD(8, 21, 55) }],
    current: { status: 'D', since: CD(8, 21, 55) } });
  if (lev.computeLevers(negState, seedNow, evOf(negState, seedNow), 'log').some((l) => l.id === 'L2')) throw new Error('c1: an all-off-duty reset leaves no sleeper leg to pair with — no L2');
  if (lev.computeLevers(seedState, seedNow, seedEv, 'estimate').length !== 0) throw new Error('c1: no lever chips on an estimate record');
  if (lev.computeLevers(seedState, seedNow, seedEv, 'demo').length !== 0) throw new Error('c1: no lever chips on the demo clock');
  if (lev.computeLevers(mk({ ...seedState, tentative: [{ status: 'OFF', start: seedNow, end: seedNow + 60, tentative: true }] }), seedNow, seedEv, 'log').length !== 0) throw new Error('c1: no lever chips while what-if rows are on the log');
  // (h) the seed's pre-fill: 2h in the Lab, status left to the driver ('either'), driving = what the pair keeps
  const pf = lev.leverSplitPrefill(seedState, seedNow, l2);
  if (!pf || pf.b1 !== 120 || pf.drive !== l2.driveAfter || 'b1s' in pf) throw new Error('c1: the seed L2 pre-fill must be b1 120, drive = driveAfter, no status forced');

  // V1: the break binds — L1's numbers are the engine's own after a 30-minute rest
  const v1State = mk({ segments: [{ status: 'OFF', start: CD(8, 20), end: CD(9, 6) }, { status: 'D', start: CD(9, 6), end: CD(9, 13, 30) }], current: { status: 'D', since: CD(9, 6) } });
  const v1Now = CD(9, 13, 30), v1Ev = evOf(v1State, v1Now);
  const v1Levers = lev.computeLevers(v1State, v1Now, v1Ev, 'log');
  const v1After = evaluate([...pruneHistory(allSegments(v1State, v1Now), v1Now, NY), { status: 'OFF', start: v1Now, end: v1Now + 30 }], { asOf: v1Now + 30, config: NY });
  if (v1Ev.binding !== 'BREAK_30' || v1Levers.length !== 1 || v1Levers[0].id !== 'L1') throw new Error('c1: V1 must offer exactly L1');
  if (v1Levers[0].driveAfter !== v1After.driveNow || v1Levers[0].stopBy !== v1After.mustStopBy) throw new Error('c1: L1’s numbers must be the engine’s after the break');

  // V2: resting off duty with no time — L3's numbers are driveAgainAt's own
  const v2State = mk({ segments: [
    { status: 'OFF', start: CD(8, 20), end: CD(9, 6) }, { status: 'D', start: CD(9, 6), end: CD(9, 10) },
    { status: 'OFF', start: CD(9, 10), end: CD(9, 13) }, { status: 'D', start: CD(9, 13), end: CD(9, 17) },
    { status: 'ON', start: CD(9, 17), end: CD(9, 20) }], current: { status: 'OFF', since: CD(9, 20) } });
  const v2Now = CD(9, 21, 0), v2Ev = evOf(v2State, v2Now);
  const v2Segs = pruneHistory(allSegments(v2State, v2Now), v2Now, NY);
  const v2Off = driveAgainAt(v2Segs, { asOf: v2Now, config: NY }, 'OFF');
  const v2Sb = driveAgainAt(v2Segs, { asOf: v2Now, config: NY }, 'SB');
  const v2Levers = lev.computeLevers(v2State, v2Now, v2Ev, 'log');
  if (!(v2Sb !== null && v2Off !== null && v2Sb < v2Off)) throw new Error('c1 setup: on V2 the sleeper must genuinely come back sooner');
  if (v2Levers.length !== 1 || v2Levers[0].id !== 'L3' || v2Levers[0].sbAt !== v2Sb || v2Levers[0].offAt !== v2Off) throw new Error('c1: V2 must offer exactly L3 with driveAgainAt’s numbers');

  // V3: the cycle binds — L4 reads the evaluation's own forecast
  const v3Segs = [];
  for (let d = 2; d <= 8; d++) v3Segs.push(
    { status: 'ON', start: CD(d, 5), end: CD(d, 6) }, { status: 'D', start: CD(d, 6), end: CD(d, 14) }, { status: 'ON', start: CD(d, 14), end: CD(d, 15) },
    { status: 'OFF', start: CD(d, 15), end: CD(d + 1, 5) });
  const v3State = mk({ segments: v3Segs, current: { status: 'ON', since: CD(9, 5) } });
  const v3Now = CD(9, 6, 0), v3Ev = evOf(v3State, v3Now);
  const v3Levers = lev.computeLevers(v3State, v3Now, v3Ev, 'log');
  const f3 = v3Ev.cycle.forecast.find((x) => x.dayStart > v3Now && x.dropsOff > 0);
  if (v3Ev.binding !== 'CYCLE' || !f3) throw new Error('c1 setup: V3 must bind on the cycle with a forecast roll-off');
  if (v3Levers.length !== 1 || v3Levers[0].id !== 'L4' || v3Levers[0].at !== f3.dayStart || v3Levers[0].dropsOff !== f3.dropsOff || v3Levers[0].available !== f3.availableAtStart) throw new Error('c1: V3 must offer exactly L4 with the forecast’s numbers');

  // (g) the word list: no lever sentence, rule or caveat may say should / legal / safe / allowed
  for (const [s2, n2, e2] of [[seedState, seedNow, seedEv], [v1State, v1Now, v1Ev], [v2State, v2Now, v2Ev], [v3State, v3Now, v3Ev]]) {
    for (const l of lev.computeLevers(s2, n2, e2, 'log')) {
      const r = lev.leverRule(l, e2);
      const text = `${lev.leverTitle(l)} ${lev.leverSub(l) ?? ''} ${r.rule} ${r.caveat}`;
      if (/\b(should|legal|safe|allowed)\b/i.test(text)) throw new Error(`c1: lever ${l.id} uses a forbidden word: ${text}`);
    }
  }
  // C3-A: the chip cap is a plain slice of the priority-ordered list
  const capped = lev.pickChips([v3Levers[0], v2Levers[0], l2]);
  if (capped.length !== 2 || capped[0] !== v3Levers[0] || capped[1] !== v2Levers[0]) throw new Error('c1: pickChips must cap at two, in the order given');

  // (d) the Timeline card, state A: lanes in the meters' order, values as clock times,
  // the STOP wall tagged, the cycle as a duration, the twin in end order — and the L2 chip
  setState({ ...seedState, nowCard: 'timeline', nowCardAsked: true });
  h = out('c1/timeline state A');
  if (!h.includes('class="taxis"')) throw new Error('c1: timeline mode must render the time axis');
  if (!h.includes(`>STOP ${clock(seedEv.mustStopBy, false)}<`)) throw new Error('c1: the STOP wall must be tagged with the stop-by time');
  for (const [end, val] of [
    [seedNow + seedEv.shift.driveRemaining, app.laneValue(seedNow + seedEv.shift.driveRemaining, seedNow)],
    [seedNow + seedEv.shift.windowRemaining, app.laneValue(seedNow + seedEv.shift.windowRemaining, seedNow)],
    [seedNow + seedEv.shift.breakRemaining, app.laneValue(seedNow + seedEv.shift.breakRemaining, seedNow)],
  ]) if (!h.includes(`taxis-value mono">${val}<`)) throw new Error(`c1: a limits lane value must read ${val}`);
  if (!h.includes(`taxis-value mono">${dur(seedEv.cycle.remaining)} left<`)) throw new Error('c1: a cycle more than a day out reads as a duration left');
  if (!h.includes(app.limitsTwin(seedEv))) throw new Error('c1: the axis must carry its text twin');
  // D5 (fix round): the levers are computed off the render path, so the first,
  // synchronous render of the Timeline card carries NO chips — they land after the
  // idle-scheduled flush, pinned behaviourally in the DOM lane (test/dom/c1flush.mjs).
  if (h.includes('class="lever"') || h.includes(lev.leverTitle(l2))) throw new Error('c1/D5: the first render must show the Timeline card without lever chips');
  if (h.indexOf('taxis-label') > h.indexOf('STOP')) throw new Error('c1 setup: axis order sanity');
  setState({ ...seedState, nowCard: 'dial' });
  h = out('c1/dial has no axis');
  if (h.includes('class="taxis"') || h.includes('class="lever"')) throw new Error('c1: dial mode must render neither the axis nor lever chips');

  // (e) state C lanes (V2): off-duty and sleeper comeback times, the L3 chip under the card
  setState({ ...v2State, nowOverride: v2Now, tab: 'now', drivingView: false, nowCard: 'timeline', nowCardAsked: true });
  h = out('c1/timeline state C');
  if (!h.includes(`taxis-value mono">${app.laneValue(v2Off, v2Now)}<`)) throw new Error('c1: state C must show the off-duty comeback lane at driveAgainAt’s time');
  // The sleeper comeback lane hangs off the L3 lever (its sbAt), and the L3 chip is a
  // lever too — since D5 both land only after the idle flush, so both are pinned in
  // the DOM lane (test/dom/c1flush.mjs), not on this first render.
  if (h.includes(lev.leverTitle(v2Levers[0]))) throw new Error('c1/D5: the first render must not carry the L3 chip');
  // state D (V3): the recap lane carries the roll-off amount, and the L4 chip rides
  // under the card — the fixture's days are fully logged, so the basis is a full log
  // (a record with unlogged gaps is an estimate, and estimates get no chips)
  setState({ ...v3State, nowOverride: v3Now, tab: 'now', drivingView: false, nowCard: 'timeline', nowCardAsked: true });
  h = out('c1/timeline state D');
  if (!h.includes(`taxis-value mono">+${dur(f3.dropsOff)}<`)) throw new Error('c1: state D’s recap lane must carry the hours coming back');
  if (h.includes(lev.leverTitle(v3Levers[0]))) throw new Error('c1/D5: the first render must not carry the L4 chip (it lands after the idle flush; DOM lane)');

  // (j) the Why sheet gains the same axis at its top, in dial mode too
  setState({ ...seedState, nowCard: 'dial' });
  app.openSheet({ kind: 'why' });
  h = out('c1/why axis');
  if (!h.includes('taxis-wrap')) throw new Error('c1: the Why sheet must carry the time axis');
  if (!(h.indexOf('taxis-wrap') < h.indexOf('why-head'))) throw new Error('c1: the Why axis must sit above the sheet’s rule rows');
  if (!h.includes(app.limitsTwin(seedEv))) throw new Error('c1: the Why axis must carry the same twin');
  app.openSheet(null);

  // (i) the Split draft undo: a whole-draft replace keeps what it replaced behind one Undo
  const { DEFAULT_SPLIT } = await import('../src/store.ts');
  setState(mk({ tab: 'split', nowOverride: seedNow, split: { ...DEFAULT_SPLIT, drive: 222 } }));
  app.replaceSplitDraft({ ...DEFAULT_SPLIT, drive: 111 });
  if (!app.splitDraftUndoPending() || getState().split.drive !== 111) throw new Error('c1: replaceSplitDraft must swap the draft and arm the undo');
  h = out('c1/draft undo row');
  if (!h.includes('Draft replaced.')) throw new Error('c1: the Split screen must offer the draft undo while it stands');
  if (!app.undoSplitDraft() || getState().split.drive !== 222 || app.splitDraftUndoPending()) throw new Error('c1: the draft undo must restore the replaced draft exactly once');
  app.clearSplitDraftUndo();

  // (k) D1 (fix round): a driver who is already resting gets no L2 — more rest there
  // completes a 395.3(a)(1) reset, and the sheet must not call it a split pair. The
  // seed driven to 03:04 and parked off duty, read at 03:34: 126 left, window binding.
  const parkedState = mk({ segments: [...seedSegs, { status: 'D', start: CD(8, 21, 55), end: seedNow }], current: { status: 'OFF', since: seedNow }, nowOverride: seedNow + 30 });
  const parkedEv = evOf(parkedState, seedNow + 30);
  if (parkedEv.driveNow !== 126 || parkedEv.binding !== 'WINDOW_14') throw new Error('c1/D1 setup: the parked seed must hold 126 with the window binding');
  if (lev.computeLevers(parkedState, seedNow + 30, parkedEv, 'log').some((l) => l.id === 'L2')) throw new Error('c1/D1: no L2 while the driver is already resting');

  // (l) D2 (fix round): the L2 sheet may say "It gives you window, not more driving"
  // only when the pair hands back no driving. Fixture: a 2h rest pairs with the 8h
  // sleeper leg and re-anchors the clocks — 480 back against 60 now.
  const d2State = mk({ segments: [
    { status: 'OFF', start: CD(8, 0), end: CD(8, 10) }, { status: 'D', start: CD(8, 10), end: CD(8, 14) },
    { status: 'SB', start: CD(8, 14), end: CD(8, 22) }], current: { status: 'ON', since: CD(8, 22) } });
  const d2Now = CD(8, 23), d2Ev = evOf(d2State, d2Now);
  const d2Levers = lev.computeLevers(d2State, d2Now, d2Ev, 'log');
  if (d2Ev.driveNow !== 60 || d2Levers.length !== 1 || d2Levers[0].id !== 'L2' || d2Levers[0].driveAfter !== 480) throw new Error('c1/D2 setup: the fixture must offer L2 handing back 480 against 60');
  if (lev.leverRule(d2Levers[0], d2Ev).rule.includes('not more driving')) throw new Error('c1/D2: the sheet must not claim "not more driving" when the pair hands back driving');
  if (!lev.leverRule(l2, seedEv).rule.includes('It gives you window, not more driving.')) throw new Error('c1/D2: the sentence stays when the pair hands back no driving (the seed)');

  // (m) D3 (fix round): on an estimate record, the faded lane segments past the STOP
  // wall keep the estimate styling — a solid bar there dresses a guess as a fact.
  // The seed with the 19:10–21:55 stretch unlogged is that estimate record.
  setState(mk({ segments: seedSegs.slice(0, 4), current: { status: 'D', since: CD(8, 21, 55) }, nowOverride: seedNow, tab: 'now', drivingView: false, nowCard: 'timeline', nowCardAsked: true }));
  h = out('c1/D3 estimate axis');
  const faded = [...h.matchAll(/<span class="taxis-bar faded([^"]*)"/g)].map((m) => m[1]);
  if (faded.length === 0) throw new Error('c1/D3 setup: the estimate seed must draw faded segments past the wall');
  if (!faded.every((c) => c.includes('basis-estimate'))) throw new Error('c1/D3: every faded segment must carry basis-estimate');

  // (n) D5 (fix round), the structural pin: computeLevers is called nowhere in
  // NowTab's render path — exactly one call site in app.tsx, inside the effect that
  // schedules it on an idle callback. (The behavioural half — no chips on the first
  // render, chips after the flush — is pinned at (d)/(e) above and in the DOM lane.)
  const appSrcC1 = await readFile(new URL('../src/app.tsx', import.meta.url), 'utf8');
  const ntStart = appSrcC1.indexOf('function NowTab(');
  const nowTabBody = appSrcC1.slice(ntStart, appSrcC1.indexOf('\nfunction ', ntStart + 1));
  if (/useMemo\([\s\S]{0,160}?computeLevers\(/.test(nowTabBody)) throw new Error('c1/D5: computeLevers must not be called inside a useMemo in NowTab');
  if ((appSrcC1.match(/computeLevers\(/g) || []).length !== 1) throw new Error('c1/D5: computeLevers must have exactly one call site in app.tsx (the idle effect)');
  const callAt = nowTabBody.indexOf('computeLevers(');
  if (!(nowTabBody.indexOf('useEffect(') >= 0 && nowTabBody.indexOf('useEffect(') < callAt && nowTabBody.indexOf('requestIdleCallback') >= 0 && nowTabBody.indexOf('requestIdleCallback') < callAt)) throw new Error('c1/D5: the one computeLevers call must sit inside the idle-scheduled effect');

  setState(mk({ tab: 'now', nowOverride: null, segments: [], tentative: [], current: null, nowCard: 'dial', nowCardAsked: false }));
  console.log('capstone C1 (timeline card, levers L1–L4, C1-A install behaviour, draft undo): OK');
}
console.log('OK');

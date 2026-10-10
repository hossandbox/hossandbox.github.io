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
const { setState, getState, nowMin, clock, toInput, DEFAULT_TRIP } = await import('../src/store.ts');

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
const pending = /Period A logged/.test(html);
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
  if (m[1] !== clock(evm.mustStopBy)) throw new Error(`Split Lab stop-by ${m[1]} != ${clock(evm.mustStopBy)} — result cards must share one evaluation instant`);
  if (!/8h 30m/.test(hh)) throw new Error('Split Lab 14-hr balance should be 8h 30m at the end of Break 2');
  if (m[1] !== clock(endB2 + 360)) throw new Error(`stop-by ${m[1]} should be 6h after Break 2 ends (${clock(endB2 + 360)})`);
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
  const { applyTheme, STATUS_COLOR, deviceTz, INITIAL_STATE } = await import('../src/store.ts');

  // Day is the product default (Lorico, 2026-09-25 — he drives in daylight; night is the opt-in).
  // Assert the FRESH-INSTALL default, not the current value: asserting a value the test just set
  // would pass no matter what the default actually was.
  if (INITIAL_STATE.theme !== 'day') throw new Error(`a fresh install must start in day, got ${INITIAL_STATE.theme}`);

  setState({ theme: 'day', tab: 'log', nowOverride: T, current: { status: 'ON', since: T },
    segments: [{ status: 'OFF', start: M('2026-09-23T01:00:00Z'), end: M('2026-09-23T11:00:00Z') }],
    config: { ...getState().config, timeZone: deviceTz } });

  hh = out('log/day, theme control');
  if (!/aria-label="Switch to night theme"/.test(hh)) throw new Error('the header needs a one-tap theme switch');
  if (!/style="background:var\(--/.test(hh)) throw new Error('status chips must use theme variables, not hardcoded hexes');
  for (const k of ['OFF', 'SB', 'D', 'ON']) {
    if (!STATUS_COLOR[k].startsWith('var(--')) throw new Error(`${k} chip colour is not theme-aware: ${STATUS_COLOR[k]}`);
  }

  setState({ theme: 'night' });
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
    try {
      applyTheme('night');
      if (attrs.theme !== null) throw new Error(`night must clear data-theme, got ${attrs.theme}`);
      if (attrs.meta !== '#0f1420') throw new Error(`night must set the dark chrome colour, got ${attrs.meta}`);
      applyTheme('day');
      if (attrs.theme !== 'day') throw new Error(`day must set data-theme=day, got ${attrs.theme}`);
      if (attrs.meta !== '#f2f5fa') throw new Error(`day must set the light chrome colour, got ${attrs.meta}`);
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
  if (!/limited by 8-hour rule \(30-min break in 8h 00m\)/.test(bx)) throw new Error('after a qualifying break the label must count down to the NEXT break, not claim one is due');
  if (/30-min break due/.test(bx)) throw new Error('the label still says a break is due after the driver took one');

  // Approaching 8 hours with no break: the label must still say "break" (round-3 finding — the first
  // fix dropped the word until the counter hit zero, the moment the driver most needs it).
  setState({ segments: [{ status: 'D', start: t - 465, end: t }] });
  const ax = out('now/break 15 min away');
  if (!/limited by 8-hour rule \(30-min break in 15m\)/.test(ax)) throw new Error('15 min from the 8-hour limit the label must name the break and the time left');
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
  const dx = out('startup disclaimer');
  if (!/HOS Sandbox is a planning scratchpad/.test(dx)) throw new Error('the startup disclaimer must appear at launch');
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
  if (!/HOS Sandbox is a planning scratchpad/.test(fz2)) throw new Error('the disclaimer itself must still show on every launch');

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
// --- review of the QA patch (Daniel Tam): fixes on top of it
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
  if (!t.includes(`Stop by ${clock(L(18, 15))}`)) throw new Error('the stop time must be 6:15 PM (11-hour limit) for this day');
  if (!/limited by 11-hour driving limit/.test(t)) throw new Error('the hero must name the limit in full');
  for (const re of [/11-hr driving 7h 30m left/, /14-hr window 9h 15m left/, /30-min break in 8h 00m/, /70-hr week 65h 45m left/]) if (!re.test(t)) throw new Error(`Now is missing a limit row: ${re}`);
  if (!/class="meter on"[^>]*><span class="meter-label">11-hr driving/.test(h)) throw new Error('the limit that sets the stop time must be marked');
  if ((h.match(/class="dock"/g) || []).length !== 1 || !/aria-pressed="true"[^>]*>[\s\S]{0,400}On Duty/.test(h)) throw new Error('Now must end with the status buttons, the current one pressed');
  if (/class="stat-value"/.test(header(h))) throw new Error('the header must no longer carry the clock tiles');
  if (/drive again at|of driving · Stop by/.test(header(h))) throw new Error('on Now the header must not repeat what the main card says');

  // 3. the header is opaque — its see-through edge drew text over the content scrolling under it
  const css = rf('public/styles.css', 'utf8');
  const top = css.match(/\n\.top \{[^}]*\}/)[0];
  if (/transparent|gradient/.test(top) || !/background: var\(--bg\)/.test(top)) throw new Error(`the sticky header must be opaque: ${top}`);

  // 4. away from Now, one line of driving time in the header
  setState({ tab: 'log' });
  h = out('log/header line');
  if (!txt(header(h)).includes(`7h 30m of driving · Stop by ${clock(L(18, 15))}`)) throw new Error('other screens must keep one line of driving time in the header');

  // 5. Why: every rule's own end time, the earliest marked
  setState({ tab: 'now' });
  openSheet({ kind: 'why' });
  h = out('now/why panel');
  t = txt(h);
  if (!t.includes(`Why stop by ${clock(L(18, 15))}?`)) throw new Error('the Why panel must restate the stop time it explains');
  for (const [rule, at] of [['11-hour driving', clock(L(18, 15))], ['30-minute break', clock(L(18, 45))], ['14-hour window', clock(L(20))], ['70-hour week', 'Not today']]) {
    if (!t.includes(`${rule} ${at}`)) throw new Error(`Why panel: ${rule} should end at ${at}`);
  }
  if ((h.match(/Earliest — this sets your stop time/g) || []).length !== 1) throw new Error('exactly one rule is the earliest');
  if (!/<li class="on"><div class="why-head"><b>11-hour driving/.test(h)) throw new Error('the earliest rule must be the 11-hour one here');
  for (const tag of ['header', 'main', 'nav']) if (!new RegExp(`<${tag}[^>]*\\binert\\b`).test(h)) throw new Error(`<${tag}> must be inert while a panel is open`);
  if (!/role="dialog" aria-modal="true" aria-labelledby="sheet-title"/.test(h)) throw new Error('a panel must be a labelled modal dialog');
  openSheet(null);
  h = out('now/panel closed');
  if (/<main[^>]*\binert\b/.test(h)) throw new Error('closing the panel must make the screen usable again');

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
  // 9. tap targets: nothing on Now smaller than 44px by its own CSS
  if (!/\nbutton \{[^}]*min-height: 44px/.test(css)) throw new Error('buttons must be at least 44px tall');
  setLaunchNotice(true);
  if (!/HOS Sandbox is a planning scratchpad/.test(out('launch notice back'))) throw new Error('the launch notice must be back for the next launch');
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
  if (!t.includes(`Driving left 6h 00m Stop by ${clock(L(18, 30))} limited by 11-hour driving limit`)) throw new Error(`driving view content wrong: ${t.slice(0, 220)}`);
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
  if (!/Edit this entry/.test(h) || !/aria-label="Started 15 minutes earlier"/.test(h) || !/aria-label="Ended 5 minutes later"/.test(h)) throw new Error('the edit panel needs labelled ±5/±15 steppers');
  if (!/Delete this entry/.test(h)) throw new Error('delete lives in the edit panel');
  if (!/<main[^>]*\binert\b/.test(h)) throw new Error('the Log must be inert behind the panel');
  openSheet({ kind: 'add' });
  if (!/Add something I forgot/.test(out('log/add panel'))) throw new Error('the add panel must open');
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
  if (!/Take a load\?/.test(out('now/load link'))) throw new Error('Now must offer the load question');
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
  // Daniel's repro: edit, add, then a status tap on Now; the edit's undo must be gone, and nothing lost
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
  // a reload on top of old entries starts clean
  const h3 = mk(); h3.pushState({ app: 'hos-sandbox', layer: 'tab' }, '');
  createBackNav(h3, () => ({ tab: 'now', sheet: false }), { closeSheet() {}, goTo() {} });
  if (h3.state !== null) throw new Error('an entry left by an earlier load must not be counted as ours');
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
console.log('OK');

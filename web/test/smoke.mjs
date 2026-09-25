// Node-side smoke test: render every tab with a stubbed DOM, exercising store transitions.
import { render } from 'preact-render-to-string';
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
  hh = out('log/overlapping entries');
  if (/9h 00m|68h 00m/.test(hh)) throw new Error('overlapping entry inflated driving/cycle time (3h of driving vanished)');
  if (!/65h 00m/.test(hh)) throw new Error('cycle left should be 65h — 5h driven of 70');
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
  setState({ tab: 'recap' });
  hh = out('recap/fresh verdict');
  if (!/This verdict rests on an incomplete basis/.test(hh)) throw new Error('the LEGAL verdict must be qualified when nothing is logged');

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
    bugEmail: 'roundtrip@example.com',
  };
  setState(original);
  const payload = JSON.parse(exportState(getState()));

  // import into a DIFFERENT state, as a restore would
  setState({ segments: [], tentative: [], config: { ...getState().config, cycle: '70/8', timeZone: tz }, mph: 55, trip: { ...DEFAULT_TRIP }, bugEmail: '' });
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
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([n]) => n);
  if (failed.length) throw new Error(`export/import round trip lost: ${failed.join(', ')}`);

  // a simulated clock must NOT come back on its own — the payload carries one, so this is a real test
  const MY_CLOCK = M('2026-09-23T17:00:00Z');
  setState({ nowOverride: MY_CLOCK });
  setState((cur) => applyImportedState(cur, payload));
  if (getState().nowOverride !== MY_CLOCK) throw new Error('import must not silently restore a simulated clock');
  if (payload.nowOverride !== original.nowOverride) throw new Error('the payload should have carried a simulated clock for this check to mean anything');

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
  if (!/Day \(default\)/.test(hh) || !/Night/.test(hh)) throw new Error('the settings control must name both themes');
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

  // (2) Recap load checker — 200 miles, no dwell
  setState({ ...reset, tab: 'recap', loadCheck: { ...DEFAULT_LOADCHECK, miles: 200, dwell: 0 } });
  hh = out('recap/200 mi, no dwell');
  if (!/200 mi/.test(hh)) throw new Error('Recap should show the 200-mile load');
  setState({ tab: 'trip' }); out('trip/from recap');
  setState({ tab: 'recap' });
  hh = out('recap/returned');
  // pin the slider HEAD specifically: "200 mi" also appears in the itinerary, so a loose match
  // would pass even if the field had been reset
  if (!/Load distance[\s\S]{0,60}?<b>200 mi<\/b>/.test(hh)) throw new Error('Recap discarded the load when the tab changed');

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
    ], historyAcknowledged: true, tab: 'recap', loadCheck: { ...DEFAULT_LOADCHECK, miles: 200, dwell: 120 } });
  hh = out('recap/arrive vs unload');
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
  const inDay = out1.filter((x) => x.start >= dayStart && x.end <= dayEnd).reduce((a, x) => a + (x.end - x.start), 0);
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
  if (!/Verdict \(provisional\)/.test(hh)) throw new Error('a verdict resting on an unlogged hole must be marked provisional');
  // a 30-minute hole cannot, and nagging about it teaches the driver to ignore the warning that matters
  setState({ segments: [D5, { status: 'OFF', start: M('2026-09-15T11:30:00Z'), end: now2130 }] });
  hh = out('recap/30min hole');
  if (/Unlogged time is being counted/.test(hh)) throw new Error('a 30-minute hole must not raise the gap warning');
  if (/Verdict \(provisional\)/.test(hh)) throw new Error('a 30-minute hole must not make the verdict provisional');
  // and it clears once the record covers the hole
  setState({ segments: [D5, { status: 'OFF', start: M('2026-09-15T11:00:00Z'), end: now2130 }] });
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
console.log('OK');

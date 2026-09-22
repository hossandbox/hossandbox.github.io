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
  if (!/This verdict assumes a fresh clock/.test(hh)) throw new Error('the LEGAL verdict must be qualified when nothing is logged');

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
  if (!/aria-label="Decrease Distance"/.test(hh)) throw new Error('slider stepper buttons missing');

  // (b) violation labels are driver-facing, never enum ids
  setState({
    tab: 'log', current: null, tentative: [], segments: [
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
console.log('OK');
